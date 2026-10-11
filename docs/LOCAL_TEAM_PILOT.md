# Local Team Pilot

Hosting is deferred. The desktop launcher still opens the local suite at
http://127.0.0.1:3001; it is not yet a shared work-account deployment.

## One Real Event

1. Export a workspace backup from Settings and keep a second copy off this Mac.
2. Open an upcoming calendar booking and confirm date, times, room and attendance.
3. Choose its operations template before opening new applet plans. Confirm the
   template's room notes, equipment, hospitality notes and shopping requirements.
4. In Tabletron, arrange the room, draw any annotations, and verify the setup
   preview. In Event Ops, check the assigned layout; master reports use that
   assignment, not whichever layout is currently displayed in the editor.
5. In Foodotron, confirm servings, recipes, package quantities and prices. Extra
   shopping items from templates remain unpriced until staff confirm them.
6. In Scheduluotron, confirm times/owners and complete the event checklist.
7. Reopen each applet and confirm the saved work remains intact. Every shared
   edit should end with SAVED, not merely a local-cache message.
8. Print Kitchen, Setup crew, Front desk and MOD views from Master Report. Compare
   them with the binder and ask each department what information is missing.

Record the event/date, participating staff, missing information and any manual
workarounds before calling this pilot complete. Keep the paper binder available.

## Save Problems

- NOT ON SERVER: keep the editor open, check the connection and retry. A draft
  is retained in the same browser tab; download it before closing the tab.
- CONFLICT - REVIEW: another editor saved first. Download your draft, then load
  the server copy and reapply the changes you still need. There is no forced
  overwrite or automatic merge of room plans.
- Reopening the same tab after a refresh offers an unsaved draft if one remains.
  Restoring a stale draft does not bypass revision protection.
- Reload older open tabs after this update. The server rejects old clients that
  do not send an expected revision.

## Recovery And Ownership

- Assign a primary backup owner and a substitute before daily team reliance.
- Export before major imports/restores and at the end of a planning day.
- Keep a copy outside this Mac. A file on the same disk is not disaster recovery.
- Rehearse restore in a separate D1 directory, never by replacing the live local
  database. Verify room sketches, meals, checklist completion and report output.
- Saved report views live in this browser and are not part of workspace backups.
  Copy Report Link preserves the choices, but another computer needs access to
  the same server to open it. PDFs can be sent independently.

## Developer Checks

`npm run verify` enforces zero-warning lint, Workers-aware typecheck, build and
144 tests. Isolated browser/storage checks cover
stale saves, competing writers, transactional rollback, refresh recovery, retry,
template initialization, sketches, hallways, department reports and restore.

The temporary verification database is deliberately separate from `.wrangler/state`.
The short-lived `suite_write_guards` table is transaction bookkeeping, not user
content; it is empty after successful writes and excluded from backups.

Reproducible browser checks are in `scripts/verify-shared-saves.mjs` and
`scripts/verify-event-workflow.mjs`. They require Playwright (or its bundled
runtime module), `EVENTOTRON_PLAYWRIGHT_MODULE`, optional
`EVENTOTRON_CHROME_PATH`, and these safety settings:

```sh
export EVENTOTRON_ISOLATED_QA=1
export EVENTOTRON_QA_URL=http://127.0.0.1:3022
export EVENTOTRON_QA_BACKUP=/absolute/path/to/workspace-backup.json
```

Start Wrangler on that port with a fresh `--persist-to` directory outside the
live `.wrangler/state`. Run shared-saves verification first, then event-workflow
verification. The first script imports the supplied backup and clears external
calendar sources in the isolated copy; both scripts write test data. They refuse
the normal daily-use ports. No fixture contents or private backups are committed.

`scripts/verify-backup-consistency.mjs` uses the same isolated-server safety
variables and checks concurrent applet writes against exported projections.
`scripts/verify-tabletron-selection.mjs` verifies that Tabletron and Scheduluotron
do not reopen unrelated event caches, retain standalone work and explicit event
plans across refresh, and handle a meal handoff using the target event's bundle.
For release/recovery gates and the next work queue, use
`docs/PROFESSIONAL_READINESS_PLAN.md`.
