# EventoTron Deployment

How to put EventoTron on the internet so staff sign in with their work Microsoft
accounts instead of running anything locally.

The code side is finished. What remains are account steps that need a human:
creating a Cloudflare account, authorising the CLI, provisioning a database, and
configuring sign-in. Work through this once; afterwards deploying is one command.

## Before you start

You need three things this repo cannot create for you.

1. **A Cloudflare account.** Sign up at dash.cloudflare.com.
2. **A domain name** you control, added to that account. Sign-in is enforced per
   hostname, so EventoTron needs a real one.
3. **Permission to register an application in Microsoft Entra ID**, or somebody
   in your organisation who has it. This is what makes work email the login.

### About cost

Workers, D1, and Access all have free tiers, and a single venue's usage is very
small by their standards. That is the expectation, not a guarantee — **check the
current pricing and free-tier limits yourself before committing**, since terms
change and only your account shows what you are actually on. Nothing in this
repo provisions a paid resource on your behalf.

## Step 1 — Authorise the CLI

```bash
npx wrangler login
```

This opens a browser and asks you to approve access to your own account. It is
the only interactive step.

## Step 2 — Create the database

```bash
npx wrangler d1 create eventotron
```

It prints a `database_id`. Keep it — this is the difference between deploying
against your real data and deploying against nothing.

```bash
export EVENTOTRON_D1_DATABASE_ID=<the id it printed>
```

`npm run deploy` refuses to run without it, so a build can never quietly ship
against the placeholder database.

## Step 3 — Set up sign-in

In the Cloudflare **Zero Trust** dashboard:

1. Add **Microsoft Entra ID** as an identity provider. This is where your
   existing work accounts get connected.
2. Create an **Access application** for EventoTron's hostname.
3. Add a policy allowing your organisation. Restricting to your own Entra tenant
   means nobody outside it reaches even the login screen — that is the setting
   you want, provided every person who needs EventoTron has an account in that
   tenant. Check seasonal and volunteer staff before locking it down.
4. From the application's overview page, copy the **Audience (AUD) tag**.

## Step 4 — Store the secrets

These live in Cloudflare, never in the repo:

```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN   # the <team> in <team>.cloudflareaccess.com
npx wrangler secret put CF_ACCESS_AUD           # the Audience tag from step 3
npx wrangler secret put INITIAL_ADMIN_EMAIL     # your work email
npx wrangler secret put TOKEN_ENCRYPTION_KEY    # openssl rand -base64 32
npx wrangler secret put OAUTH_STATE_SECRET      # openssl rand -base64 32
```

`INITIAL_ADMIN_EMAIL` decides who becomes the first admin. Everyone else who
signs in is provisioned as staff, and you promote them from
`Settings > Access & Users`.

Calendar connections additionally need `GOOGLE_CLIENT_ID`/`SECRET` and
`MICROSOFT_CLIENT_ID`/`SECRET`/`TENANT`. See `.dev.vars.example`. These can wait
until after the first successful deploy.

## Step 5 — Check, then deploy

```bash
npm run deploy:check
```

Builds and validates everything without uploading. Then:

```bash
npm run deploy
```

## Step 6 — Verify before trusting it

Do all of these. The first two are the ones that matter.

- [ ] Open the site **signed out** (a private window). You should be sent to
      Microsoft, not into the app.
- [ ] Sign in. You should land in EventoTron as an admin.
- [ ] `/api/health` reports `database: connected` and the expected schema
      version.
- [ ] Add a second person, confirm they arrive as staff, and confirm they
      *cannot* reach Settings.
- [ ] Import a workspace export and confirm your events appear.
- [ ] **Delete something in the deployed app and restore it from a backup.** If
      this is shaky, stop and fix it before staff rely on the system.

## Backup and restore: verified locally

This drill was run against the real workspace on 2026-08-19, restoring into a
throwaway database so live data was never touched. Repeat it against the
deployment before staff depend on it.

**Result: restore is lossless.** Export, restore into an empty database,
re-export, and the two exports were byte-identical — same SHA-256 across all 15
tables and 2,607 records (26 events, 2,430 synced calendar entries, plus rooms,
layouts, meals, recipes, schedules and transfers).

Also verified:

- **Validate writes nothing.** `Settings > Restore` reviews a file and reports
  every table count without touching the database. Confirmed: counts reported,
  database still empty afterwards.
- **A deleted event comes back.** Deleting an event and restoring recovered it
  intact, with the full workspace otherwise identical.

**One expected difference.** After a delete-then-restore cycle the workspace is
*not* byte-identical: the audit history has one extra record, the `deleted`
entry describing what happened. Nothing is lost — restore merges, so the audit
trail keeps the evidence of the deletion rather than erasing it. If you compare
hashes after a recovery, expect audit history to differ and everything else to
match.

To repeat the drill without risking live data, run a second instance against a
scratch database:

```bash
npx wrangler dev --config dist/server/wrangler.json --local \
  --persist-to /tmp/eventotron-drill --port 3010 \
  --var EVENTOTRON_LOCAL_MODE:1
```

Then export from the real instance and restore into that one.

## Moving your existing data

Your local workspace does not migrate automatically.

1. In your local EventoTron: `Settings > Export Workspace`.
2. In the deployed EventoTron: `Settings > Restore`, review the file, then
   confirm.
3. Compare event counts on both before you retire the local copy.

Do this once against a throwaway database first so the real one is not your
first attempt.

## Local mode and why it never ships

The desktop app and `npm run dev` run as a single implicit admin, because no
sign-in sits in front of them. That is gated behind `EVENTOTRON_LOCAL_MODE`,
which only the local runtimes set, plus a loopback-hostname requirement.

A deployed build never carries the flag. Three things enforce that:

- `vite.config.ts` injects it only while serving, never in the built bundle
- `npm run deploy` aborts if the flag is present in your shell
- a test reads the built config and fails if the flag ever appears in it

**Never set `EVENTOTRON_LOCAL_MODE` on a deployment.** It would grant admin to
anyone who can reach the site.

## After it is live

- **Backups.** Turn on D1 point-in-time recovery and confirm the retention
  window. Keep taking periodic workspace exports as a second, independent copy.
- **Who owns it.** Hosted software needs a person, not just a plan. Decide who
  is called when it breaks during an event.
- **Watch it.** Worker observability is enabled in the build; check it after the
  first week so you learn about failures before staff report them.
