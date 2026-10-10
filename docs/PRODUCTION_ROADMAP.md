# EventoTron Production Roadmap

EventoTron is ready for a controlled local pilot when the current local database is backed up and one real event can be planned end to end from calendar file to master report.

## Current Status

- Local suite routes are unified under one app: Calendar, Tabletron, Foodotron, Scheduluotron, Settings, and Master Report.
- Shared backend storage exists for events, applet states, transfers, settings, calendar sources, and backups.
- Synced calendar entries can be promoted into permanent editable EventoTron event files without duplicate calendar tiles.
- Event files save independently with server revisions, automatic non-overlapping edit merges, and visible same-field conflict protection.
- Every permanent suite tab has the same timezone-aware operations ticker, which rolls through concurrent live events and falls back to today or the next scheduled item.
- Event creates, edits, and deletes are recorded in durable database audit history with operator, revision, timestamp, and recoverable event snapshots.
- Printable reports are branded, named, and formatted for clipboard/event-day use.
- Operations templates now hold reusable binder material for recurring event and building workflows.
- Shared settings now include facility room dimensions, event-rental policy notes, and rental furniture/service inventory for Tabletron planning.
- Local production runs through the Workers runtime with D1 available at `npm start`.

## Ship Readiness

The local build has passed automated and isolated browser/storage rehearsals.
It still needs a staff-run real event and a named owner for off-device backups.
Do not treat backend health or test counts as evidence of a completed team rollout.
Hosting and work-account setup were explicitly deferred by the owner on 2026-10-10.

### Implemented In The Local Pilot Pass

- Revision-protected, serialized applet/settings saves with atomic derived writes,
  stale-write rejection, and per-tab draft recovery. Conflicts require review;
  there is no automatic layout merge or full offline editing.
- Template-seeded event tasks, room-specific setup notes/equipment, and food notes
  with additional unpriced shopping requirements. Existing plans remain intact.
- Compact department reports and browser-local saved report views.
- Freehand room annotations and hallway connections, including printed diagrams.
- Two-editor, failed-save, print and lossless recovery rehearsals in isolated D1.

## Phase 1: Local Pilot

Goal: use EventoTron locally for real planning while keeping paper as backup.

- Use the `Settings > Private Alpha` panel as the daily readiness check for one-operator real-event planning.
- Confirm `Settings > Export Workspace` creates a readable backup, then use the review-first restore screen to inspect it without immediately changing the workspace.
- Confirm Settings shows the latest backup checkpoint with export age, version, source, and record counts.
- Plan one upcoming event using Calendar, Tabletron, Foodotron, and Scheduluotron.
- Open one synced calendar entry as an editable event file and confirm its source label is retained.
- Confirm the operations ticker changes between `LIVE NOW`, `TODAY`, and `NEXT UP` at the expected venue times.
- Print the master report and applet reports.
- Compare the report against the existing binder workflow.
- Record missing fields, confusing labels, and anything staff still need to write by hand.

Exit criteria:

- One real event can be planned and printed without using URL-encoded transfer data or separate app windows.
- The report is clear enough for setup, shopping, client conversation, and MOD use.
- The private alpha runbook in `docs/PRIVATE_ALPHA_RUNBOOK.md` has been followed for at least one real event.

## Phase 2: Operations Templates

Goal: turn the binder material into reusable event-starting templates.

- Let new events choose an operations template. Complete: template selections now seed the event type, planning notes, and requested-item handoff.
- Use template checklist items to seed Scheduluotron tasks.
- Use room/setup template items to seed Tabletron rooms and furniture.
- Use food/hospitality template items to seed Foodotron meal notes and shopping needs.
- Add template sections for contracts, artist hospitality, market MOD, maintenance, and kitchen closeout.

Exit criteria:

- Creating a Rotary luncheon, concert, market, or rental event starts with useful default tasks instead of a blank page.

## Phase 3: Production Data And Accounts

Goal: make the database, users, and calendar sources dependable.

- Decide where the production database lives.
- Decide who owns backups and how often they are exported.
- Add user identity and role rules for staff access. Complete: staff sign in through Cloudflare Access, are auto-provisioned as staff (or admin, for the configured initial-admin email) on first sign-in, and admins manage roles from `Settings > Access & Users`. Sensitive routes (settings, calendar connections, workspace restore, user management) require the admin role; everything else requires any signed-in staff account. Local desktop mode is unaffected and still runs as a single implicit admin operator. Configuring the actual Cloudflare Access application (team domain, policy, audience tag) is an operational step outside this repo — see `.dev.vars.example` for the required secrets.
- Keep conflict-aware event revisions enabled so simultaneous staff edits cannot silently overwrite one another.
- Review the durable event audit history during recovery drills; Settings now exposes the recent staff-facing activity view.
- Review calendar import health from Settings; each source now shows last sync, errors, imported event count, date range, and recent imported events.
- Add Google Calendar and Outlook OAuth connections. Complete: admins can connect a Google or Microsoft account from `Settings > Calendar Connections`; connected sources sync via the real Calendar API/Graph API instead of a public ICS feed, with tokens encrypted at rest and refreshed automatically.
- Expand the current calendar-source health view into account-based sync logs after OAuth is connected.

Exit criteria:

- Staff can sign in, sync approved calendars, and recover the workspace from backup.

## Phase 4: Desktop App

Goal: package EventoTron as a desktop app using the same routes and backend.

- Choose the desktop shell and local data directory.
- Generate the local macOS pilot app with `npm run desktop:mac`; it starts the same local Workers backend and opens the existing suite routes.
- Keep the existing routes: `/`, `/tabletron`, `/foodotron`, `/scheduluotron`, `/settings`, `/master-report`, and `/api`.
- Package local runtime startup, shutdown, backups, and database location.
- Decide whether the final production shell should remain a browser-opening launcher or move to a dedicated signed Electron/Tauri/native window.
- Test printing and PDF saving from the packaged app.

Exit criteria:

- A non-developer can open EventoTron, plan an event, print reports, and close it without using Terminal.

## Phase 5: Launch

Goal: start using EventoTron as the primary planning system.

- Import current active events.
- Keep the paper binder available during the first month.
- Hold a weekly review of missing fields, report issues, and template gaps.
- Freeze the first production workflow once repeated events work cleanly.

Exit criteria:

- The paper binder becomes reference material, not the main operating system.
