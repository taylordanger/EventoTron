# EventoTron — where things stand

Last updated 2026-10-10. Written for whoever picks this up next, human or
otherwise. Read this before changing anything.

## The one thing to get right first

### Main calendar follow-up (2026-10-10)

Home still starts on the current month/day, but no longer automatically selects
today's first event or adds it to Open Event Files. The rail restores only this
browser's saved open files; it does not fall back to the server's old open-file
list. Opening a calendar event is an explicit action; closing it stays closed
when returning home. Existing previously opened files are not deleted.

The calendar now grows with its contents and uses page scrolling, with seven
fluid-width columns on desktop and stacked days on phones. Busy days have no
event limit, clipping or internal day scroll. TODAY returns to the current day.
Startup uses the venue date instead of the server's UTC date, and scrolls to
the beginning of today's entries rather than the middle of a tall busy day.
Regression rehearsal: `scripts/verify-home-calendar.mjs` (isolated QA only).

### Personal suite appearance and calendar display (2026-10-10)

Display & Appearance appears in both the home Settings dialog and the Settings
page. Month, Week, Day and Agenda share the same event/feed records, with
explicit date navigation and no busy-day cutoff. Week view includes adjacent
months and follows the workspace's Sunday/Monday setting. Agenda and Day show
room/location details; all views sort using the existing event-time parser.

Appearance includes Classic, Light, Graphite and High contrast presets, custom
background/accent colors, 10-20px event text and three spacing levels. Foreground
colors are computed for contrast. Wallpaper is an optional user-selected
JPG/PNG/WebP, resized and bounded locally, with shading, removal and a preview.
No remote wallpaper fetches or uploads are used. Preferences are personal to
this browser (`eventotron-calendar-display-v1`), not shared settings or backup
data; staff can change them without changing the team's workspace. Reset Display
affects only these preferences and never events. The previous shared defaultView
and showWeekends fields remain backward-readable but their nonfunctional home
controls were replaced; all seven days remain available.

Appearance is suite-wide, not calendar-only: `SuiteAppearance` provides shared
palette, wallpaper and text-scale tokens to every route and the bug-report
dialog. Existing neutral UI colors and font sizes now use tokens with their
original values as fallbacks. Main navigation, forms, sidebars and room-drafting
backgrounds respond immediately; furniture colors and event/category colors
remain meaningful. Report/paper styles are excluded from screen tokenization,
and print resets the appearance variables and text scale.

Light mode uses dark rust warnings and dark red errors, not bright yellow text
or borders. Calendar notes, status indicators, room-sketch controls and save
badges follow this palette. Yellow imported-calendar markers are rendered dark
rust on light backgrounds without changing the saved source color; other source
colors remain intact. Foodotron action symbols render in a single color.

Verification includes strict lint and typecheck; isolated Chrome
checks cover all views, cross-year weeks, 20px spacious layouts at 1440/1024/390px,
wallpaper upload/reload/removal/rejection, display reset, browser-profile
isolation and sticky navigation. No real events or shared settings are changed
by the appearance rehearsal.
Suite appearance rehearsal: `scripts/verify-suite-appearance.mjs`, covering all
six screens in light/dark modes, wallpaper, large text, responsive widths,
absence of yellow light-mode text and print resets. `npm run verify`: 164 tests.

Design reference: https://www.eleken.co/blog-posts/calendar-ui (grid/agenda
switching, readable density and clear date navigation; no third-party assets).

**Work in the base checkout — `/Users/darkstar/Operations_root/EventoTron`, on
`main`.** It is what the desktop app actually runs, and where every commit
lives.

There is a stale git worktree at `.claude/worktrees/broken-run-issue-0dd770`.
Its branch was merged in August and it has not moved since. A session may open
*inside* it and a file-write guard may insist edits belong there — that guard is
wrong for this project. Removing it is safe:

```bash
git worktree remove .claude/worktrees/broken-run-issue-0dd770 --force
```

## What this is

A local event-operations suite for Lincoln City Cultural Center: Calendar,
Tabletron (room layouts), Foodotron (meals), Scheduluotron (day sheets),
Settings and a master report, all under one origin. Cloudflare Worker + D1,
built with vinext/Vite, run locally through Wrangler.

The owner is not a developer. They run it by clicking a Mac app icon. It is
intended to go organisation-wide once it is solid.

### The workflow it has to serve

1. Someone adds a booking to Google Calendar.
2. Staff click it in EventoTron, which turns it into an editable event file.
3. They attach room layouts, food and a schedule to that event.
4. They print a setup sheet for one room, or a master plan for all of them.

The point is that anyone can open an event and work out what needs doing
without being told.

Their calendars are **one per room**, so a booking appearing in three calendars
is a three-room event. That fact drives a lot of the design.

## Running and checking it

Professionalization work now follows `docs/PROFESSIONAL_READINESS_PLAN.md`.
Release/incident steps are in `docs/RELEASE_AND_RECOVERY.md`; staff trial evidence
belongs in `docs/PILOT_RESULTS.md` (still pending). Hosting remains deferred.

```bash
npm run verify # strict lint, Workers-aware typecheck, build and all tests
npm run backup:local -- --dir /absolute/approved/backup/folder
```

The app runs from `build/macos/EventoTron Local.app` on port 3001, with a
control process on 3101. `/api/health` reports status, schema and record counts.

Verify UI work in a browser against the running app rather than by reading code.
Most real bugs here were invisible in the source and obvious on screen.

## Traps that have already cost time

- **Rebuilding while the app runs kills it.** Wrangler watches `dist/` and
  reloads against a half-written bundle. It now restarts itself in a few
  seconds (`scripts/start-local.mjs` supervises it), so this is survivable —
  but expect a gap after `npm run build`.
- **`document.hidden` is true in the Claude browser pane.** Any code gated on
  visibility will appear broken while testing. Two bugs were introduced this
  way, both in initial-load paths that should never have been gated.
- **React resets attributes between a manual set and a read.** Reading
  `getComputedStyle` right after poking the DOM gives misleading answers; build
  a sibling element instead.
- **Node cannot type-strip `.tsx`.** Pure logic must live in a `.ts` module to
  be testable. That is why `seat-labels.ts`, `seating-capacity.ts` and
  `room-names.ts` exist.
- **Use `npm run typecheck`, not bare `tsc` on a clean checkout.** It generates
  Workers runtime declarations first. The historical type errors and lint
  warning have been resolved; releases must now pass with zero warnings/errors.

## A lens that keeps finding real bugs

Most defects found recently were the same shape: **the software stating
something reassuring that was not true.**

- A failed save rendered in the same green as a success.
- "SAVED" appeared when no request had been sent at all.
- A room laid out for 24 with 25 guests coming said "LAYOUT COMFORTABLE".
- A room holding 16 chairs reported "0 seated".
- "Sync every 15 minutes" did nothing; the calendar was 15 days stale and
  missing 216 entries.
- "EXPORT SETUP SHEET" printed a different document, and did nothing at all
  when no event was linked.

Checking confident-sounding UI against what the code actually does is a
productive way to spend time here. The Private Alpha panel and `/api/health`
were audited in the daily-use pass below; backend health is explicitly distinct
from team deployment readiness.

## Known open problems

- **Storage follow-up.** Browser storage is now a cache:
  failed event reads block writes and retry, and linked applets load their event
  bundle from the backend before saving. Calendar connections are read from
  `suite_calendar_sources`; settings saves batch configuration into that table
  and strip the duplicate settings list. Sync timestamps and errors belong to
  the sync route, so a settings save cannot overwrite them. Old backup lists
  remain readable until a configuration save migrates them. This does not add
  full offline editing. Applet/settings writes now require revisions, run with
  their projections/configuration in guarded D1 transactions, and reject stale
  snapshots. Conflict recovery preserves a downloadable draft and loads the
  server copy; it does not automatically merge conflicting layouts or settings.
- **Sketching is a first-pass annotation tool**, not a floor-plan/CAD editor.
  It supports labeled strokes and undo, stores coordinates in room feet, and
  prints in setup/master reports. It has no measurement or safety certification.
- **Hallways are independent connecting spaces**, with dimensions, room links
  and an empty initial layout. Assign them in Event Ops to include them in the
  master report. There is no unified building-wide map or route validation.
- **Deployment is blocked on the owner**, not on code. See `docs/DEPLOYMENT.md`.
  Four steps need a human: a Cloudflare account, `wrangler login`,
  `wrangler d1 create`, and connecting Microsoft Entra ID for sign-in.
  `npm run deploy` refuses to run until a real database is configured and
  cannot ship the local admin bypass.

## Recent work, newest first

### Beta Support (2026-10-10)

- Added global Report a problem and a Support inbox with numbered receipts,
  statuses, assignment, visible conversation updates, screenshots and error links.
  Submission retries use a stable ID; failed submissions retain the tab draft
  and offer a downloadable support file. Ticket updates require revisions.
- Staff routes enforce report ownership; admins triage all tickets and inspect
  diagnostics. Local desktop mode remains one implicit admin. Real hosted staff
  sign-in/permission rehearsal and a coworker reporting trial remain pending.
- Added allowlisted browser/server diagnostics, per-build release IDs, categorized
  save/sync/backup/restore/transfer failures, conflicts and slow requests. Raw
  request bodies, error messages, contacts, tokens and query URLs are excluded.
  Only safe module locations are retained from stack traces. Errors have LOG
  references; failures do not depend on diagnostic persistence succeeding.
- Migration `0008_beta_support` adds ticket and diagnostic tables. Diagnostics
  aggregate by caller/minute/category, are capped and pruned at 30 days on intake
  or admin reads. The separate local runtime log captures sanitized structured
  lines and startup/restart/shutdown, with private bounded rotation. Close/reopen
  the launcher once to activate its new capture code.
- Workspace backup version 3 includes tickets/conversations/screenshots, not logs;
  old versions remain readable. Full exports are now admin-only to protect private
  support content. Restore is still a non-atomic merge/upsert, not a live rollback.
- Verification: 158 tests, strict lint/typecheck/build; isolated API/browser
  privacy, rate cap, idempotent tickets, stale/competing updates, failure fallback,
  screenshot, mobile/desktop and ticket recovery rehearsals. See BETA_SUPPORT.md
  and `scripts/verify-beta-support.mjs`. No live test tickets or fixture events.

### Stale Event Selection Fix (2026-10-10)

- Calendar startup selects today's event or no event; it no longer falls back
  to a browser's old selected event when today has no saved event file.
- Tabletron and Scheduluotron use separate standalone and per-event caches.
  Opening either tool without an event no longer opens the last linked event's
  browser snapshot. Old global cache files are retained, not deleted. Tabletron
  migrates verified standalone legacy projects; Scheduluotron's unscoped legacy
  cache is retained but not auto-opened because it contains no event identity.
- Explicit event query parameters remain on refresh; changing the event remounts
  the editor instead of reusing a mount-only initializer for the previous event.
- Tabletron meal handoffs load the target event's authoritative bundle and
  revision rather than relying on a global cache; the merged meal is saved using
  that revision. Unrelated standalone plans remain intact.
- New standalone schedules use the venue's timezone for today's date instead
  of rolling to tomorrow during Pacific-time evenings at UTC midnight.
- Verification: strict lint, typecheck, build and 144 tests pass. The isolated
  browser check is `scripts/verify-tabletron-selection.mjs`; it uses the same
  isolated QA variables as the workflow checks and writes only test fixtures.

### Professional Readiness Baseline (2026-10-10)

- Documented a six-phase readiness plan with named ownership roles, acceptance
  gates and the next work queue; added release/recovery instructions and a staff
  pilot result register. Hosting remains deferred; no launch is claimed.
- Added `npm run typecheck` with generated Workers runtime declarations and
  explicit bindings; fixed historical type errors, including API result types,
  Web Crypto buffers, transfer headers and the example's async database access.
- `npm run verify` and CI now enforce zero-warning lint, typecheck, build/tests.
  OAuth returns wait for settings/backend initialization and append from the
  current settings state, preserving existing calendar sources.
- Added verified local backup command (explicit directory, read-back validation,
  private files, unique names and checksum sidecars; no scheduling or pruning).
  Export now reads all tables in one D1 batch. 25 isolated exports matched
  concurrent schedule snapshot/projection updates; 138 automated tests pass.
- Created a read-only live safety backup in `/private/tmp`; this does not meet
  off-device recovery. Destination/backup owner selection, backup-health alerts,
  scheduling and atomic restore remain next. Current restore is a non-atomic
  merge/upsert, not a complete disaster-recovery replacement.

### Local Team Pilot Improvements (2026-10-10)

- Owner explicitly deferred hosting; keep the existing local launcher and D1.
  Hosted accounts, production migration and a live staff pilot are not complete.
- Added migration `0007_guarded_writes`. Short-lived guard rows make revision
  checks, applet snapshots and derived records one atomic D1 transaction. A
  stale settings save cannot partially change calendars; sync results are also
  guarded against changed/deleted connections. Guard rows are transaction-only
  bookkeeping, always removed on success and not part of workspace backups.
- All applets and both settings editors serialize saves. Failed/conflicting
  drafts survive refresh in the same tab via session storage. Recovery offers
  retry, draft download/restore, and download-before-loading the server copy.
  Reopening an applet preserves customized notes, meal details and schedule
  metadata. Existing open browser tabs must reload for the new revision protocol;
  legacy writes without an expected revision are rejected with HTTP 428.
- Operations templates seed unchecked event tasks, food/hospitality notes,
  unpriced extra shopping items, and room-specific notes/equipment only when
  creating a new applet plan. Existing plans are never reseeded automatically.
- Master reports include Kitchen, Setup crew, Front desk and MOD views and
  named saved views. Saved views are personal to this browser, not shared team
  configuration; Copy Report Link still preserves the actual report choices.
- Tabletron supports freehand annotations with optional labels and undo, plus
  Hallway/connecting-space type and room links. Annotations print in setup and
  event-assigned master diagrams. Hallways start without dinner tables.
- Verification: 134 automated tests, build, lint (known settings warning), plus
  isolated D1 two-writer/rollback, draft recovery/offline retry and template-to-
  reports browser rehearsals. Setup, hallway and kitchen sample PDFs: one page
  each. Backup/re-export verified lossless with new tasks, notes and sketches.
  A real staff-run event and off-device backup ownership are still required.

### Tabletron Setup Sheet (2026-10-10)

- Reproduced Export Setup Sheet printing the editor canvas/status counters
  without room/layout/event identity or setup instructions. It now opens a
  dedicated preview for the active room and layout, with Print and Save PDF.
- The sheet includes event/date, assigned room timing/purpose/notes, equipment
  counts and total seating (including furniture seats). Unassigned rooms and
  layouts different from the event assignment are clearly identified; exporting
  never changes the assignment. Standalone projects still export without events.
- Shared Tabletron report maps preserve furniture shapes and rotation and keep
  tall-room proportions. Setup print output excludes editor panels and catering.
- Verification: 125 tests, build, lint with the existing settings warning;
  isolated browser checks covered layout/room switching, row/furniture seats,
  standalone export, PDF title and mobile preview. Sample setup PDF: one page.

### Daily Use And Reports (2026-10-10)

- Main calendar expands busy days without clipping event tiles. Startup opens
  the current month, highlights and scrolls to today, and selects today's saved
  event when one exists (`8560042`, pushed to `main`).
- Master Report has complete, summary, shopping, room setup and run-of-show
  presets, selectable sections/rooms, optional costs/layouts/facility reference,
  and a department/recipient label. Copy Report Link preserves the choices;
  links require access to the same running server. Save PDF uses the browser's
  print destination and produces a file suitable for sending separately.
- Reports flow between sections instead of forcing a page per section.
  Foodotron opens a shopping preview with optional meal brief, costs and a
  store filter. Grocery calculations are shared with the master report:
  compatible units combine before package rounding, and offers are ranked by
  total purchase cost. Missing price/conversion items remain visible.
- Master Report layout diagrams include row seating and furniture rotation.
  Room times use the suite's regular-time formatter. The equipment library is
  no longer dumped into every report.
- Readiness now checks enabled calendar freshness/errors and persisted coverage
  for all three applets. Health probes calendar/auth tables and labels its scope
  as backend status, rather than claiming deployment readiness.
- Verification: 125 automated tests, build, and lint with the known settings
  warning. Browser/storage/print checks use an isolated D1 directory under
  `/private/tmp`; never restore test fixtures into the daily-use server.

| Commit | What it changed |
| --- | --- |
| `e2612e6` | Furniture can be rotated; printed map matches the screen |
| `04770f0` | Events attach to every room their calendars name; room matching is testable |
| `f85f760` | Export Setup Sheet prints the layout on screen; chairs count as seats |
| `4c34b19` | The calendar sync interval is actually honoured |
| `c8df720` | A save is only announced once it has happened |
| `b890b56` | Warns when a layout seats fewer people than are coming |
| `4904a68` | The local backend restarts itself instead of staying dead |
| `e360bb3` | The save indicator tells the truth; failures are red |
| `897248d` | Staff access control and calendar OAuth |

## Working with the owner

- They describe symptoms, not causes — "it keeps wanting to export something
  else". Reproduce before theorising; the stated problem has twice turned out to
  be two separate bugs.
- Their data is real and in daily use: 34 events, ~4,000 synced calendar
  entries, layouts with work in them. Test against a throwaway database or a
  scratch layout, and clean up anything you create. Back up with
  `GET /api/workspace-backup` first; restore is verified lossless.
- Tell them plainly what was not done, and what was found but not fixed.
