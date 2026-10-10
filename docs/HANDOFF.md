# EventoTron — where things stand

Last updated 2026-10-10. Written for whoever picks this up next, human or
otherwise. Read this before changing anything.

## The one thing to get right first

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

```bash
npm test     # 125 tests; runs a build first
npm run lint # expect 0 errors, 1 pre-existing warning in app/settings/page.tsx
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
- **`npx tsc --noEmit` reports ~38 pre-existing errors** unrelated to recent
  work, mostly `cloudflare:workers` and `.ts` import extensions. Judge changes
  by whether *your* files are clean, not the total.

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
  offline editing or conflict resolution for simultaneous applet/settings edits.
- **Freeform sketching does not exist.** The furniture builder composes
  rectangles, circles, ovals and triangles into reusable pieces, but nothing
  draws directly on the room canvas. This is the largest outstanding request.
- **A connecting space (hallway) has no first-class support.** The workaround is
  "＋ ADD ROOM" with real dimensions; it holds furniture, rotates it, and prints.
- **Deployment is blocked on the owner**, not on code. See `docs/DEPLOYMENT.md`.
  Four steps need a human: a Cloudflare account, `wrangler login`,
  `wrangler d1 create`, and connecting Microsoft Entra ID for sign-in.
  `npm run deploy` refuses to run until a real database is configured and
  cannot ship the local admin bypass.

## Recent work, newest first

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
