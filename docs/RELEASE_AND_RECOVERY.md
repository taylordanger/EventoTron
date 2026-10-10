# Release And Recovery

## Before Updating The Local App

1. Arrange a quiet planning window; save edits and pause calendar synchronization.
2. Export a verified backup to the approved destination. Export uses one D1
   read batch; still use a quiet window for the release checkpoint so staff
   know which edits are included before the update.
3. Confirm an off-device copy is retrievable and record its checksum privately.
4. Record old/new commit IDs, migration IDs, test results and known limitations.
5. Run `npm run verify`. Build can interrupt the running launcher briefly;
   never build during a live event without an agreed paper fallback.
6. Rehearse schema-changing releases and restores on a separate D1 directory first.

## After Updating

1. Confirm `/api/health` reports ready, the expected schema and plausible counts.
2. Open a real event read-only and check its room assignment, food and schedule.
3. In an isolated test workspace, verify create/save/reopen and printed output.
4. Reload existing staff browser tabs so old clients do not submit old protocols.
5. Record operator acceptance. Health alone is not release acceptance.

## Incident Handling

- Failed/conflicting save: keep the editor open, download the draft, and follow
  the recovery panel. Never clear browser storage as the first troubleshooting step.
- Backend unavailable: preserve drafts, stop repeated edits, use printed plans,
  and contact the assigned maintainer. Do not expose local mode to another computer.
- Suspected corrupt data: stop writes/sync, preserve a copy of the current database
  and logs, then investigate on an isolated copy. Avoid logging client details or tokens.
- Backup failure: retain older copies, verify destination access and free space,
  retry, and confirm read-back plus off-device retrieval before declaring recovery.

## Rollback Rules

A code rollback and a data restore are different operations. Do not reset Git,
downgrade migrations or restore over live data as an automatic rollback.

Prefer a forward fix. If reverting code is necessary, test the previous release
against a copy of the current schema first. If data restore is necessary, obtain
operations-lead approval for the edits that will be lost, preserve the failed
workspace, restore into isolation, validate reports, then arrange a controlled
cutover. The backup JSON does not recover host configuration, OAuth credentials,
browser-only report views or unsaved session drafts.

Current in-app restore merges/upserts records rather than replacing the entire
workspace, and writes are not yet one transaction. Use it only in an isolated
recovery rehearsal for now; atomic restore and full cutover instructions are
the next engineering work item before backup/recovery can pass its launch gate.

## Release Record

Keep a record per release: date, owner, old/new commits, migrations, automated
checks, browser/print checks, backup location/checksum (private), recovery rehearsal,
known issues, acceptance and incident/support contact. Do not commit private backup
files, calendar URLs, client contact details or secrets.
