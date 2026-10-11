# Engineering Risk Audit

Reviewed 2026-10-10 against the user-supplied Reddit discussion, the repository,
existing readiness plans, automated tests and isolated browser workflows.
Comments in that discussion are prompts for investigation, not technical proof.

## Findings And Changes

| Concern from discussion | EventoTron evidence | Status |
| --- | --- | --- |
| No real backend; everything in localStorage | Shared planning uses a Worker/D1 backend, migrations, revision-checked writes and projections. Browser preferences and some applet caches still exist. Local mode is one operator, not a coworker account system. | Not the no-backend pattern; keep hosted rollout gated. |
| Authentication bolted on or absent | API role wrappers, verified Access JWTs, revoked-user handling and per-owner personal SQL already exist. Local bypass requires an explicit runtime flag and loopback URL. Deployment preflight rejects local mode. | Automated coverage exists; real signed-in staging rehearsal still required. |
| One giant file | Tabletron was 3,513 lines and home is 1,491; styles also have accumulated overrides. | Started: moved 537 lines of Tabletron types, construction, hydration and normalization into `app/tabletron/project-data.ts`. Remaining editor/report and CSS separation is incremental work, not claimed complete. |
| Tests only confirm generated code | Some older tests match source strings. Browser workflows existed but were manual and could click server-rendered controls before hydration. | Added executable model acceptance tests, fixed readiness waits, and added a disposable-database browser runner to CI. Source contracts remain supplementary. |
| Secrets accidentally committed | No runtime secret files or limited recognized credential signatures found in the current tracked tree. `.dev.vars.local` variants were not ignored. | Ignore all runtime variants except the example; new tests fail on tracked secret files/recognized credentials. This is not a historical or exhaustive secret audit. |
| Thin AI calls without failures handled | No AI product feature or model API dependency was found. Recipe/product imports are ordinary parsers, not an AI wrapper. Save recovery and generic diagnostics already exist. | Do not add AI for appearance. Review actual parser/network failure cases as workflows expand. |
| Dark-mode styling substitutes for usability | Dark style exists by user preference; appearance settings, light mode and responsive checks exist. The clock must remain visible and Next Up must scroll. | Preserve explicit user requirements. Cosmetic similarity is not an architectural defect. |

During extraction, acceptance checks failed on impossible times (`24:00`,
`10:60`, `13 PM`) and rounding a measurement to `5 feet 12 inches`. The model
now rejects those times and carries twelve rounded inches into the next foot.
These fixes do not modify existing saved records or change database schema.

## Dependency Security

The registry audit initially reported 32 affected packages: one critical, 24 high,
six moderate and one low. This count includes transitive effects and is not a
count of exploitable EventoTron endpoints. The critical Next.js advisory concerns
Node `next/og` ImageResponse with attacker-controlled SVG values; EventoTron does
not use that API. Still, keeping an affected version is unnecessary exposure.
See the maintainer's advisory:
https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j

Updated Next and its lint configuration to 16.3.8, React/React DOM/server decoder
to 19.2.8, Vite to 8.3.4, Cloudflare's Vite plugin to 1.63.1 and Wrangler to
4.149.0. React's decoder patch addresses the published Server Functions denial
of service advisory:
https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g
Applied compatible transitive fixes with `npm audit fix`, never `--force`.

The resulting audit still reports 13 affected packages: nine high and four
moderate, zero critical. Remaining roots are `braces` in the build/lint glob
chain, `image-size` pinned by vinext, and old esbuild in drizzle-kit's tooling.
The suggested automatic fixes include a major vinext upgrade and a drizzle-kit
downgrade. Those require a separate compatibility/migration rehearsal; do not
blindly force them or claim the suite is vulnerability-free. Avoid untrusted
repository/build inputs, do not expose development servers to coworkers, and
resolve/triage these before a hosted beta. CI now rejects critical advisories;
that threshold intentionally does not certify the remaining high findings.

## Acceptance Contract

Define or update expected outcomes before changing a workflow. Add a failing
behavioral check for reproducible bugs before implementation; never weaken the
expected outcome to fit the implementation. Source-string checks alone do not
establish user-facing behavior. Screenshots must be inspected, not just produced.

- Calendar opens on the venue's current day; visiting home does not turn calendar
  entries into intentionally open event files; crowded dates do not clip entries.
- Clock/date remain outside menus at all tested window sizes. Next Up moves,
  pauses on hover/focus, and respects reduced-motion preferences.
- Personal notes/events survive reload, export only the owner, never enter shared
  backup, and preserve an unsaved draft after a two-tab revision conflict.
- Layout tools, inspectors and report previews fit tested sizes including 320px
  and 20px text. A small window cannot silently remove a required section.
- Booking updates retain staff-written setup times/notes and add newly booked
  rooms once. Screen and printed room-map orientation must agree.
- Shopping quantities must come from the planned recipes and compatible package
  units. Unknown prices/conversions stay explicitly unresolved, not guessed.
- Failed, unauthorized or conflicting writes never report successful persistence.
- No browser acceptance fixture writes to the daily-use database.

Run `npm run verify` for lint, types, build and tests. After building, install
the Chromium test browser using `npx playwright install chromium`, then run
`npm run verify:browser`. The latter allocates its own loopback port and new
temporary D1 directory; it does not accept a caller's database or URL. Tests run
sequentially and the server stops on completion/failure. Logs, screenshots and
the disposable database remain in its printed directory for investigation.
Existing runtime overrides `EVENTOTRON_PLAYWRIGHT_MODULE` and
`EVENTOTRON_CHROME_PATH` remain available for the bundled desktop environment.
Do not rebuild `dist` while browser checks are running: the local Worker watches
the bundle and a partial rebuild can invalidate already-open page modules.

CI installs the pinned test runtime/browser, runs the same command and uploads
screenshots/logs on success or failure. Wiring CI does not mean a remote run has
passed; record that evidence after the changes are pushed.

Local evidence for this pass: zero-warning lint, Workers typecheck, build and
178 tests passed after the dependency updates. The final `verify:browser` run
passed all three suites, including personal persistence/conflicts and all seven
sections at ten widths. Header and small room-canvas screenshots were inspected.
The daily-use app was restarted successfully on port 3001; schema remains 0009
and its 40 events/3,980 imports and other shared record counts are unchanged.
No migrations or restore were applied in this pass. Remote CI is not yet run.

## Remaining Beta Gates

1. Dependency compatibility: rehearse the remaining vinext/build-tool fixes,
   confirm decoder/runtime compatibility and re-audit. No hosted beta sign-off
   while applicable high findings remain unresolved.
2. Recovery: transactional/reviewed restore, an approved off-device backup
   destination, accountable owners, and a successful isolated restore rehearsal.
   Current merge/upsert restore is not a disaster-recovery guarantee.
3. Hosted privacy: verify two real staff identities and an admin against staging,
   including revocation, expired sessions, cross-user access and conflicting edits.
   The local operator's workspace is not private between coworkers using that app.
4. Staff pilot: setup, kitchen and MOD review a real event and department outputs;
   record failures and acceptance in `docs/PILOT_RESULTS.md` without client data.
5. Maintainability: extract Tabletron report/canvas components at their ownership
   boundaries, then home calendar orchestration. Replace fragile source tests
   with executed domain and browser assertions as each area is touched.
6. Visual CSS: consolidate overlapping header/calendar rules incrementally,
   retaining print independence and desktop/mobile evidence for every change.

Do not switch databases, remove requested features, rewrite the suite, or declare
it production-ready merely to avoid a label in a Reddit discussion. SQLite/D1
and local operation are choices to evaluate against measured workload, recovery
and team-access requirements, not automatic reasons to migrate to PostgreSQL.
