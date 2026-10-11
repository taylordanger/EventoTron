# Beta Support

## Acceptance Gates

- Every suite page has Report a problem, with a numbered receipt only after
  the database confirms submission. Failed submission preserves the draft and
  offers a downloadable support file; retry uses the same ID to prevent duplicates.
- Staff can read/comment on their own reports and verify a fixed report.
  Admins can triage all reports, assign owners, change status and inspect diagnostics.
- Browser crashes, rejected promises, API errors/conflicts and slow requests
  produce bounded structured diagnostics linked through error references.
- Automatic diagnostics contain only allowlisted fields: app, route pattern,
  release, error category, code locations, method/status and duration.
  Never store raw error messages, request bodies, authorization, query strings,
  client contacts, calendar URLs or automatic screenshots.
- Screenshots are explicitly chosen, previewed and removable. Report text and
  images are intentional user submissions, not automatic diagnostic collection.
- Repeated errors aggregate by minute, release, caller, route and category.
  Browser intake is capped at 60 occurrences per caller/minute (20 distinct
  submissions per tab/minute). Diagnostics expire after 30 days and have a
  10,000-row cap; pruning happens on diagnostic intake and admin log reads.
- Logging failure must not break saving or recurse into the logging endpoint.
  Sanitized console output and local runtime files provide a separate fallback.
- Workspace backup includes tickets, not diagnostic logs. Full workspace exports
  require admin access because they now include private support reports.
- Hosted staff permission checks and a real staff beta remain rollout gates;
  local mode is one implicit admin, not a shared multi-user deployment.

## Workflow

1. Coworker submits a report with description, expectation, reproduction and impact.
2. Maintainer checks linked diagnostics and marks Investigating or Needs information.
3. Reporter and maintainer exchange visible updates on that ticket.
4. Maintainer fixes and tests the issue, records the release, and marks Fixed.
5. Reporter retests and marks Verified, or replies that the problem remains.

The Report a problem button is available on every normal suite view. Support
opens the inbox; admins have a Diagnostics view and expandable error records.
Diagnostics can be filtered by error reference, severity and tool.
Reports have `EVT-` numbers and diagnostics have `LOG-` references. A current
release identifier includes the source commit and build timestamp.

The form keeps its draft in this browser tab. Download report includes the
intentional report/screenshot and bounded sanitized diagnostic context. It is
not automatic submission or an automatic email: send that file to the maintainer
when the server is unavailable. A numbered receipt confirms database acceptance.
Tickets are capped at 30 new reports per caller/day and 100 thread updates;
updates are revision-protected. All thread updates are visible to the reporter.
If a report was accepted but its receipt was lost, an unchanged retry returns
that receipt. Changed report text is not silently discarded: the form keeps a
downloadable draft and links to the already-received ticket for an update.

Possible lost work is the highest-priority triage. A revision conflict is a
warning, not automatically a crash. Printed PDFs, browser print dialogs and
external calendar-provider internals cannot all be observed automatically;
staff reports remain necessary.

## Privacy And Operations

The maintainer owns triage and log access. Assign a substitute before beta.
Ticket descriptions/screenshots may contain private information; keep them in
the approved workspace and admin-only backups. Do not publish tickets externally.
Diagnostic references can expire after retention; ticket history remains.

Local runtime diagnostics live under `.wrangler/support-runtime*.ndjson` with
private file permissions and four bounded files (about 20 MB total). The new
launcher capture takes effect after closing/reopening the local app. Do not export the raw Wrangler
debug log as a support bundle; it is outside the sanitized diagnostic system.
Console/platform retention is separate from database retention and must be
reviewed before hosting. This first release has an inbox, not email delivery,
external issue synchronization or a staffed alert service.

Review inbox daily during beta. Track critical open reports, time to first
response and reports verified in a subsequent release. Existing backup/restore
limitations still apply: rehearse recovery in isolation, not on the live workspace.

## Recovery And Verification

Workspace backup version 3 includes support tickets, conversations and selected
screenshots; versions 1/2 remain readable. Logs are excluded from workspace
backups to respect their shorter retention. Full exports now require admin.
Restores remain merge/upsert operations; do not use them as a live rollback.

`npm run verify` enforces strict lint, typecheck, build and 158 tests.
`scripts/verify-beta-support.mjs` uses the same explicit isolated-QA environment
as the other browser scripts (see `LOCAL_TEAM_PILOT.md`). It creates test tickets,
errors and a screenshot only on a non-daily-use test port. Checks cover privacy,
deduplication/rate caps, repeated submission, competing ticket updates, server
error references, browser crash capture, outage draft/download/retry, image
preview, triage, desktop/mobile and ticket backup/restore. Additional isolated
retention rehearsal confirms an expired log is deleted on admin read.

Before coworker beta: assign primary/substitute triage owners, confirm how staff
reach the same server, test real signed-in staff/admin accounts in staging, and
have one coworker submit/retest a real report. Local mode always uses an implicit
admin; separate local copies do not share tickets automatically. No email/push
notifications or third-party issue tracker are enabled in this release.
