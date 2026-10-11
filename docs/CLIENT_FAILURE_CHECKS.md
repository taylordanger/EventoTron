# Client Failure Checks

Item 5 preserves intentional best-effort catches for JSON-LD, preferences,
diagnostics and unverified legacy caches. Operational failures use the existing
notice, status and draft-recovery areas; no layouts or dependencies were changed.

After `npm run verify`, start a disposable Wrangler server using the built
`dist/server/wrangler.json`, local mode, a non-daily-use port and a newly created
`--persist-to` directory. Never use `.wrangler/state` or ports 3000/3001/3101.

Run `scripts/verify-client-failures.mjs` with `EVENTOTRON_ISOLATED_QA=1` and
`EVENTOTRON_QA_URL` pointing to that server. It uses the existing Playwright
installation, or `EVENTOTRON_PLAYWRIGHT_MODULE`, and optionally the browser path
in `EVENTOTRON_CHROME_PATH`. Shut down the disposable server after testing.

The check intercepts all API writes and exercises corrupt plan/draft preservation,
invalid Foodotron structures, denied draft storage, downloadable unsaved content,
successful server save despite failed storage writes, operations-feed failure and
retry, OAuth source failure and retry, and failed calendar-history refresh. It
also rejects unhandled browser errors. No test reports or edits reach D1.
