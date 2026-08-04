# EventoTron Production Roadmap

EventoTron is ready for a controlled local pilot when the current local database is backed up and one real event can be planned end to end from calendar file to master report.

## Current Status

- Local suite routes are unified under one app: Calendar, Tabletron, Foodotron, Scheduluotron, Settings, and Master Report.
- Shared backend storage exists for events, applet states, transfers, settings, calendar sources, and backups.
- Synced calendar entries can be promoted into permanent editable EventoTron event files without duplicate calendar tiles.
- Printable reports are branded, named, and formatted for clipboard/event-day use.
- Operations templates now hold reusable binder material for recurring event and building workflows.
- Local production runs through the Workers runtime with D1 available at `npm start`.

## Ship Readiness

EventoTron is about 75 percent ready for a local pilot.

It is about 50 percent ready for a broader production rollout with multiple users, calendar accounts, desktop packaging, and formal data ownership.

## Phase 1: Local Pilot

Goal: use EventoTron locally for real planning while keeping paper as backup.

- Confirm `Settings > Export Workspace` creates a readable backup.
- Plan one upcoming event using Calendar, Tabletron, Foodotron, and Scheduluotron.
- Open one synced calendar entry as an editable event file and confirm its source label is retained.
- Print the master report and applet reports.
- Compare the report against the existing binder workflow.
- Record missing fields, confusing labels, and anything staff still need to write by hand.

Exit criteria:

- One real event can be planned and printed without using URL-encoded transfer data or separate app windows.
- The report is clear enough for setup, shopping, client conversation, and MOD use.

## Phase 2: Operations Templates

Goal: turn the binder material into reusable event-starting templates.

- Let new events choose an operations template.
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
- Add user identity and role rules for staff access.
- Add Google Calendar and Outlook OAuth connections.
- Expand the current calendar-source labels into a full import/audit history view.

Exit criteria:

- Staff can sign in, sync approved calendars, and recover the workspace from backup.

## Phase 4: Desktop App

Goal: package EventoTron as a desktop app using the same routes and backend.

- Choose the desktop shell and local data directory.
- Keep the existing routes: `/`, `/tabletron`, `/foodotron`, `/scheduluotron`, `/settings`, `/master-report`, and `/api`.
- Package local runtime startup, shutdown, backups, and database location.
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
