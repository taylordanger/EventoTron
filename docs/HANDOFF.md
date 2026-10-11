# EventoTron — where things stand

Last updated 2026-10-10. Written for whoever picks this up next, human or
otherwise. Read this before changing anything.

## The one thing to get right first

### Approved audit fixes and UI release (2026-10-11)

Items 1-6 are committed separately: local-mode cross-site write rejection,
shared import URL validation on every redirect, retirement of cross-origin
Tabletron transfers, visible operational failures with draft recovery, removal
of the unused unsigned ChatGPT-header auth helper, and formatting-only import
routes. `.openai/hosting.json` remains in use and unchanged. The accepted DNS
rebinding limitation is documented in `docs/IMPORT_URL_SECURITY.md`; no egress
controls were added. Failure-injection checks are documented in
`docs/CLIENT_FAILURE_CHECKS.md`.

The first pushed CI run caught a misplaced schedule storage read in the
selectively staged item 5 commit. Follow-up `ba6bede` corrects that placement;
its clean GitHub CI run passed. The working-copy UI had the correct read.
The owner also approved publishing the pending UI work, Lucide/Playwright and
tested package updates, and the existing Tabletron project-data extraction.
Further item 7 splits remain unapproved; do not treat this as permission to
split other pages or stylesheets.

Release verification: strict lint, typecheck, production build and 190 tests
pass. All three isolated browser suites pass, with screenshots reviewed at
desktop/mobile sizes. The always-visible clock and horizontal ticker remain.
No QA fixtures were written to the daily-use database.

### Work-focused UI pass (2026-10-10)

Main planning tools now share consistent icon-and-text action buttons. Save and
primary planning/printing commands stay visible; backup/import/export live in
the keyboard-accessible Files disclosure. Removed the repeated maker badge from
Foodotron/Tabletron toolbars; credit remains in suite More and printed reports.
Screen typography uses the suite sans-serif face, clearer form labels, quieter
selection borders and no decorative grid behind shopping data. The real room
canvas retains its measurement grid. Room name/dimensions occupy their own
toolbar line rather than squeezing into a tall narrow button.
Scheduluotron offers Timeline/Run List views instead of duplicate lists. Timeline
rows expose full titles, times and owners; a separate duration marker retains
the time-position signal. Saved schedule data and print sheets are unchanged.
Clock/date remain visible and Next Up keeps its scrolling/pause behavior.
Browser acceptance checks cover file-menu bounds, both schedule views, unclipped
titles and all previously required sections across ten widths with large text.
Mobile schedule context stacks by field rather than collapsing into letter-wide
columns; tool names stay compact and room annotation icons form a horizontal
group. Timeline ruler endpoints remain inside the board.
Verified locally: strict lint, typecheck, production build and 190 tests pass;
all three isolated browser suites pass, including 320-1920px layouts at 20px
text. Reviewed desktop and mobile screenshots. Live backend remains ready and
shared record counts are unchanged; QA used a disposable database. Publishing
was approved on 2026-10-11 with the release verification above.

### Engineering risk audit (2026-10-10)

See `docs/ENGINEERING_RISK_AUDIT.md` for the review of the supplied discussion.
Extracted Tabletron project types/construction/hydration/normalization into
`app/tabletron/project-data.ts`, with executed behavior tests. Fixed invalid clock
inputs and inch rounding using acceptance checks that failed before the fixes.
`npm run verify:browser` starts a fresh disposable D1 server, runs calendar,
appearance and personal/responsive checks sequentially and shuts it down.
CI now includes this command and screenshot/log artifacts. Browser readiness
waits replace clicks before personal data/hydration were ready. Runtime environment
variants are ignored and tracked-secret guardrails run with the regular tests.
Patched Next/React/server decoder and compatible Vite/Cloudflare/Wrangler tooling;
non-breaking transitive updates reduced the dependency audit from 32 affected
packages (one critical) to 13 (zero critical; nine high/four moderate remain).
Remaining build/parser/schema-tool fixes require a reviewed compatibility pass,
not a forced major upgrade/downgrade. See the audit for versions and advisories.
Recovery, genuine hosted identities and staff acceptance remain beta gates;
the audit is not a completed production/security certification.

### Clearer header and restored ticker (2026-10-10)

Suite navigation now occupies a dedicated row of simple text tabs with an active
underline, rather than expanding folder-shaped buttons alongside unrelated tools.
The More disclosure groups Master Report, bug reporting and account identity.
The live local clock and date remain directly visible in the header, including
at small window sizes; they must never be tucked into a menu.
Calendar save status, template choice and New Event occupy a
separate action row. All routes remain visible; small windows use two-column tabs.
The Next Up ticker scrolls horizontally again, pauses on hover or keyboard focus,
and offers manual horizontal scrolling for reduced-motion preferences.
Browser regression checks cover the menu, animated movement and pause behavior.

### One Settings entry (2026-10-10)

Settings now has one entry: the permanent suite navigation tab to `/settings`.
The older home quick-settings button and its duplicated popup were removed;
display, calendar connections, workspace and report settings remain on the full
Settings page. Home calendar auto-sync and its rail resize controls are retained.

### Personal Workspace and adaptive layouts (2026-10-10)

The permanent navigation now includes My Workspace (`/personal`). Personal
appointments have their own Month/Week/Day/Agenda calendar, date/time/location
and notes. My Notes supports editing, title search and pinning. Personal calendar
startup and Today bring the current venue day's entries into view, including on
stacked phone layouts. Explicit saves persist to D1; browser refresh does not
lose saved work. Unsaved edits trigger
leave/discard prompts. Failed saves keep the editor draft; revision conflicts
block overwrite and offer a draft download and explicit reload of the latest
saved version. Personal export includes only this person's saved items.

`/api/personal` derives ownership from the authenticated identity on every read,
create, edit, delete and export. There is no admin ownership bypass or client
owner parameter. Composite `(owner, id)` keys prevent ID guessing across users.
Every mutation is atomic and revision checked; creates are safe to retry. Lists
omit note bodies, item fields and request sizes are bounded, and each owner is
limited to 2,000 items. Personal contents never enter team events, event audit,
reports, shared workspace backup/export or browser storage. Generic diagnostics
record operation metadata without item titles or bodies.

IMPORTANT: local mode remains one unauthenticated desktop operator, not multiple
private accounts. Actor headers are NOT profiles; all local requests map to
`local:operator`. A prominent warning explains that other people using that same
local app can open its workspace. Hosted personal workspaces use individually
verified work-account identities. Deploying the existing sign-in setup is still
required for coworker privacy. Database administrators/device owners can access
the underlying database; this is application-level privacy, not encryption.
Private content is deliberately excluded from shared JSON backup/restore;
personal exports and full database backups are the recovery mechanisms.

Schema `0009_personal_workspace` adds only `personal_items`, with runtime boot
DDL, generated migration/snapshot and the schema health marker in agreement.
Owner isolation, validation, retry behavior and stale edit/delete rejection
are tested against SQLite using the actual storage SQL.

Screen-only `app/responsive.css` replaces fixed viewport clipping and hidden
inspector breakpoints. Wide screens retain three columns; medium screens move
inspectors below the two main columns; narrow screens stack all sections.
Recipe/room libraries, inspectors and summary metrics remain available at every
size. Navigation and toolbars wrap, names wrap instead of truncating, Foodotron
rows become labeled two-column records, and narrower schedule timelines become
full-width time-labeled blocks. The Tabletron canvas scales within a bounded
stage; forms and dialogs use available width/height and document scrolling.
Round-table chair positions and sizes now use percentages rather than a fixed
47px radius, so room resizing and furniture thumbnails preserve their geometry.
The operations ticker uses wrapping text rather than a clipped marquee.
Print media retain their independent report layouts.

Regression rehearsal: `scripts/verify-personal-responsive.mjs` requires an
isolated local QA server, permits writes only to its personal endpoint and cleans
up its created records. It exercises saved appointments/notes, pinning, reload,
two-tab conflict recovery, export separation and all main screens at ten window
widths (320-1920px), short desktop windows and maximum text size. Never target
the daily-use database with it.

Verified: strict lint/typecheck/build and 171 tests pass. The isolated browser
rehearsal also checks meal planner/shopping report, room auto-layout dialog,
note editors and master-report preview at narrow widths. The daily-use app is
healthy with its existing 40 shared events and 3,980 imported calendar records;
no QA fixtures were written there.

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

Display & Appearance appears on the full Settings page. Month, Week, Day and
Agenda share the same event/feed records, with
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
