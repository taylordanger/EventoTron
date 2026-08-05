# EventoTron Private Alpha Runbook

This runbook is for one operator using EventoTron locally with real events while the paper binder remains the backup.

## Start Of Day

1. Open `build/macos/EventoTron Local.app`.
2. Open `Settings`.
3. Confirm `Private Alpha` shows the system as ready.
4. Use `Export Checkpoint` before entering or changing real event data.
5. Confirm the backup file downloads and keep it somewhere easy to find.

## Real Event Workflow

1. Sync calendar sources from `Settings` when new calendar data is expected.
2. Open the real event from the calendar.
3. Confirm the event file has the correct date, time, space, MOD, attendance, and requested items.
4. Check Tabletron, Foodotron, and Scheduluotron for event-specific setup, shopping, and task data.
5. Print or save the master report.
6. Compare the report against the binder or existing paperwork before event day.

## Recovery Drill

Do this once before relying on EventoTron for a full event day.

1. Export a workspace checkpoint.
2. Open `Settings > Restore`.
3. Select the exported checkpoint.
4. Confirm the review screen shows the expected event, calendar, and applet counts.
5. Cancel the restore.

Only run the final restore button when intentionally recovering or merging a known backup.

## Alpha Rules

- Use one operator for edits during this phase.
- Keep the paper binder available.
- Export a checkpoint before major edits, calendar imports, and event-day printing.
- Record missing fields, confusing wording, report issues, and anything still handwritten.
- Do not use this as the only copy of event information until a recovery drill has succeeded.

## Exit Criteria

The private alpha is complete when one real event can move through calendar, event file, Tabletron, Foodotron, Scheduluotron, master report, and day-of review without losing data or requiring URL transfer workarounds.
