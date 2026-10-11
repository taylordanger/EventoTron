# EventoTron Professional Readiness Plan

Owner: venue operations lead. Engineering work: repository maintainer.
Created: 2026-10-10. Hosting remains deferred at the owner's request.

## Target And Boundaries

Professional readiness means staff can plan, save, print, recover and get help
without relying on a developer being present. A larger feature list or passing
test count is not launch approval. Keep the paper workflow available until the
operational gates below have evidence and an owner has accepted them.

The first supported environment is the existing single-operator Mac launcher.
Do not expose its implicit local-admin mode over a network for team access.
Shared hosting is a separate gated release, not a side effect of local work.

## Delivery Order

### 1. Engineering Baseline (Implemented; Verification Required Each Release)

Deliverables:

- Workers-aware type checking with generated runtime declarations and explicit
  environment binding types. Fix actual type errors rather than disabling strictness.
- Zero-warning lint, build and automated tests through `npm run verify`.
- CI enforces lint, typecheck and build/tests for main and pull requests.
- Fix OAuth return initialization to wait for server settings and avoid stale
  calendar-source snapshots.
- Add regression tests with every reliability fix; keep live data out of fixtures.

Exit gate: a clean checkout with `npm ci` passes the same checks locally and in
CI. Each release records commit, checks, migration and known limitations.
The checks are implemented locally; CI evidence awaits the next push.

### 2. Backup And Recovery (In Progress)

Implemented: `npm run backup:local -- --dir /absolute/folder`.
It requires a ready local database, validates every exported table and count,
writes a private uniquely named file, verifies read-back, and writes a SHA-256
sidecar. It never restores or deletes older backups. Database exports now read
all tables in one D1 batch rather than independent requests. The isolated
concurrency rehearsal verified 25 exports against 25 changing schedule snapshots
and their projections. D1 documents batches as SQL transactions:
https://developers.cloudflare.com/d1/worker-api/d1-database/#batch

Remaining deliverables, in this order:

- Owner selects an organization-approved off-device destination, primary backup
  owner and substitute. Backups contain event/contact information; do not use a
  public folder. Folder creation does not prove replication or confidentiality.
- Make restore atomic and validate relational ownership before applying it.
  Current restores merge/upsert records, do not replace the workspace, and are
  not a single transaction. They are not yet a complete disaster-recovery cutover.
  A consistent export preserves existing defects too; checksum verification
  alone does not prove relational correctness or successful recovery.
- Inventory what exports omit: accounts/OAuth credentials, browser-local report
  views and session drafts. Document separate secret/account recovery; do not put
  token encryption keys into workspace backup files.
- Schedule backups on the chosen environment, at least daily and before updates,
  imports or restores. Show last verified backup, age and failures to staff.
- Adopt retention: 14 daily and 8 weekly copies, plus a pre-release checkpoint.
  Introduce pruning only after verified-success tracking and retention tests.
- Rehearse restore in a separate D1 directory. Compare event counts, audit,
  assignments, recipes, schedules, sketches and printed reports. Never rehearse
  by replacing the daily-use database.

Exit gate: owner can recover a real backup on a clean isolated environment;
off-device retrieval is demonstrated; a failed/missed backup produces a visible
warning. Proposed service targets: lose no more than one planning day's edits;
restore usable planning within two hours. Owner must accept these targets.

### 3. Real-Event Pilot (Needs Staff Participation)

Use `docs/LOCAL_TEAM_PILOT.md`. Select an upcoming multi-room event involving
food and a run-of-show. Have setup, kitchen and MOD review their own outputs.
The operations lead owns this trial; engineering fixes recorded defects.

Record results in `docs/PILOT_RESULTS.md`: event/date, staff, steps, missing
fields, confusing actions, print readability, manual workarounds and save issues.
Avoid client contact details in this committed record.

Exit gate: one full event and one repeat/template-based event succeed; no lost
edits, incorrect room assignment or missing critical report information; staff
accept the documents. Fix all data-loss and operationally misleading defects
before proceeding. Cosmetic improvements can follow afterward.

### 4. Collaboration And Workflow Completion (After Pilot Feedback)

- Make shared vs personal report views explicit; add shared department defaults
  only with appropriate permissions and backup coverage.
- Improve conflict review with a comparison of draft/server values before any
  optional merge feature. Never silently merge geometric room changes.
- Ensure food transfers preserve hospitality notes and extra shopping needs.
- Verify calendar promotion/deduplication for one event appearing in several
  room calendars. Test cancellations, timezone boundaries and changed bookings.
- Test staff/admin permissions, expired sessions and two-editor workflows in an
  isolated signed-in environment; local-admin testing is not authorization proof.
- Check keyboard operation, focus/error states, readable labels and small-screen
  layouts on the actual work devices. Prioritize pilot friction over redesign.

Exit gate: documented representative workflows and permission tests pass;
personal preferences cannot overwrite shared planning; conflict recovery is
understandable to staff without developer guidance.

### 5. Shared Deployment (Deferred Until Owner Is Ready)

Owner supplies hosting account, approved hostname and work-sign-in coordinator.
Follow `docs/DEPLOYMENT.md`; engineering handles deployment and data rehearsal.

- Separate staging and production databases/secrets. Never deploy local-admin mode.
- Configure real sign-in and role policies; review private data exposure, export
  permissions, calendar token handling and access removal with venue management.
- Rehearse migration from a verified backup, test sign-in/sync/printing and obtain
  department approval before changing the team's working URL.
- Establish uptime/error monitoring, alert recipients, scheduled recovery checks
  and an approved data/backup retention policy.

Exit gate: two staff accounts and an admin work on the same staging event safely;
production migration and recovery are rehearsed; backup/incident owners agree;
no placeholder database or local bypass reaches production.

### 6. Controlled Launch And Maintenance

- Follow `docs/RELEASE_AND_RECOVERY.md` for release records and rollback decisions.
- Hold a weekly defect review during the first month. Keep the binder available.
- Assign a support contact and escalation substitute; document startup, failed
  saves, calendar outages, printing and backup recovery in plain language.
- Schedule monthly dependency/security review and quarterly restore drills.
- Freeze a supported workflow; distinguish defects from optional new features.

Exit gate: repeated events run without developer intervention, recovery targets
are met, and the operations lead authorizes EventoTron as the primary system.

## Next Work Queue

Beta support is now implemented locally; see `docs/BETA_SUPPORT.md`. Before a
coworker beta, rehearse real staff/admin permissions and a real report/fix/retest
cycle, assign a triage owner/substitute, and confirm shared server access. Local
test counts do not demonstrate those operational gates.

1. Verify the engineering baseline and backup utility; record results.
2. Implement atomic/reviewed restore and backup-health tracking before scheduling.
3. Select backup destination/owners, then enable and test scheduled off-device copies.
4. Run the real-event pilot and triage its findings.
5. Finish the collaboration gaps exposed by that trial; keep hosting deferred.

No launch date is promised until the real-event and recovery gates pass.

## Evidence From The First Implementation Pass

- Strict lint and full Workers-aware typecheck pass; historical errors resolved.
- Build and 138 automated tests pass, including backup validation/failure cases.
- 25 concurrent isolated exports matched changing applet/projection revisions.
- Local live workspace read-only backup: 39 events, 22 applet states; file and
  checksum verified in a temporary directory. This is not an off-device backup.
- Actual staff pilot, off-device destination/ownership, scheduled backups,
  atomic restore and hosted sign-in remain pending. No production migration was
  performed and no live fixture events were written.
