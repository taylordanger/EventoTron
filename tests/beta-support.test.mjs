import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnosticMetadata, requestDiagnosticCode, safeRoute, safeErrorDetails, validateTicket, validScreenshot, canReadTicket, canUpdateTicket, ticketContentMatches, validSupportBackupRow, browserLabel } from "../app/support-data.ts";
import { supportBody } from "../app/api/_lib/support-body.ts";
import { createRuntimeLog, captureRuntimeOutput, safeRuntimeRecord } from "../scripts/support-runtime.mjs";
import { PassThrough } from "node:stream";

const draft = () => ({ id: crypto.randomUUID(), title: "Room export failed", description: "Print preview did not open", expected: "A setup sheet", steps: "Open event, select room, export", app: "tabletron", impact: "blocked", release: "0.1.0+test", browser: "Chrome 140", references: [] });

test("operation categories distinguish save conflicts, sync, backup and restore failures", () => {
  assert.equal(requestDiagnosticCode("/api/events", 409, "PATCH"), "save-conflict");
  assert.equal(requestDiagnosticCode("/api/events", 500, "PATCH"), "save-failed");
  assert.equal(requestDiagnosticCode("/api/calendar-sources", 500, "POST"), "calendar-sync-failed");
  assert.equal(requestDiagnosticCode("/api/workspace-backup", 500, "GET"), "backup-failed");
  assert.equal(requestDiagnosticCode("/api/workspace-backup", 500, "POST"), "restore-failed");
  assert.equal(requestDiagnosticCode("/api/events", 200, "GET"), "slow-request");
});

test("automatic metadata cannot retain contact fields, tokens, messages, bodies or query strings", () => {
  const result = diagnosticMetadata({ code: "request-failed", app: "tabletron", route: "/api/event-app-state?eventId=private-client&token=secret", release: "test", password: "secret", message: "Client phone number", payload: { email: "private@example.test" }, browser: "Chrome 140 private-client", frames: ["/assets/page-test.js:12:5", "https://private.example/feed?token=secret:1:2", "contact@example.test"] });
  assert.equal(result.route, "/api/event-app-state");
  assert.deepEqual(result.frames, ["/assets/page-test.js:12:5"]);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.equal(diagnosticMetadata({ code: "arbitrary-private-message" }), null);
  assert.deepEqual(safeErrorDetails(new Error("API token = secret")), { errorType: "Error" });
});

test("safe stack locations omit exception text and machine-specific paths", () => {
  const error = new TypeError("PRIVATE_CANARY phone, email, token");
  error.stack = "TypeError: PRIVATE_CANARY\n at save (file:///Users/PRIVATE_CANARY/project/dist/server/assets/route-test.js:12:8)\n at api (index.js:20:4)";
  const result = safeErrorDetails(error);
  assert.deepEqual(result.frames, ["/assets/route-test.js:12:8", "server/index.js:20:4"]);
  assert.ok(!JSON.stringify(result).includes("PRIVATE_CANARY"));
});

test("route patterns never preserve resource identifiers or external URLs", () => {
  assert.equal(safeRoute("/tabletron/import/secret-booking"), "/tabletron/import/:id");
  assert.equal(safeRoute("/api/calendar-oauth/accounts/client-email"), "/api/calendar-oauth/accounts/:id");
  assert.equal(safeRoute("https://private.example/feed?token=secret"), "/other");
  assert.equal(browserLabel("Mozilla private-client Chrome/140.0 secret"), "Chrome 140");
});

test("ticket validation keeps user-authored text but rejects unsupported attachments and oversized inputs", () => {
  assert.ok(validateTicket(draft()));
  assert.equal(validateTicket({ ...draft(), title: "" }), null);
  assert.equal(validateTicket({ ...draft(), description: "x".repeat(4001) }), null);
  assert.equal(validateTicket({ ...draft(), screenshot: "data:image/svg+xml;base64,PHN2Zz4=" }), null);
  assert.equal(validScreenshot("data:image/png;base64,bm90LXBuZw=="), false);
  assert.equal(validScreenshot("data:image/jpeg;base64,/9j/"), true);
  const report = validateTicket({ ...draft(), references: ["LOG-" + "a".repeat(24), "https://private.example"] });
  assert.deepEqual(report.references, ["LOG-" + "a".repeat(24)]);
});

test("retry receipt cannot discard user changes after a response was lost", () => {
  const input = draft(); const ticket = { title: input.title, app: input.app, impact: input.impact, payload: { ...input, updates: [] } };
  assert.equal(ticketContentMatches(ticket, input), true);
  assert.equal(ticketContentMatches(ticket, { ...input, references: ["LOG-" + "a".repeat(24)] }), true);
  assert.equal(ticketContentMatches(ticket, { ...input, description: "New information" }), false);
});

test("staff ownership and fixed-report verification do not grant admin triage", () => {
  assert.equal(canReadTicket("staff", "alice", "bob"), false);
  assert.equal(canReadTicket("staff", "alice", "alice"), true);
  assert.equal(canReadTicket("admin", "alice", "bob"), true);
  assert.equal(canUpdateTicket("staff", "new", "fixed", undefined), false);
  assert.equal(canUpdateTicket("staff", "fixed", "verified", undefined), true);
  assert.equal(canUpdateTicket("staff", "fixed", undefined, "bob"), false);
  assert.equal(canUpdateTicket("staff", "new", undefined, undefined), true);
});

test("support-body reader rejects malformed and oversized requests without trusting Content-Length", async () => {
  const request = new Request("http://localhost", { method: "POST", body: JSON.stringify(draft()) });
  assert.ok(await supportBody(request));
  await assert.rejects(supportBody(new Request("http://localhost", { method: "POST", body: "123456" }), 5), /body-too-large/);
  await assert.rejects(supportBody(new Request("http://localhost", { method: "POST", body: "not json" })));
});

test("support backup validation rejects malformed conversation or status data", () => {
  const input = draft(); const { id, title, app, impact, ...payload } = input;
  const ticket = { id, title, app, impact, number: 1, reporter: "alice", assignee: "", status: "new", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), payload: { ...payload, updates: [] } };
  assert.equal(validSupportBackupRow(ticket), true);
  assert.equal(validSupportBackupRow({ ...ticket, payload: { ...payload, updates: "bad" } }), false);
  assert.equal(validSupportBackupRow({ ...ticket, status: "unknown" }), false);
});

test("runtime fallback sanitizes records and rotates bounded private log files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eventotron-runtime-test-"));
  try {
    const path = join(directory, "support.ndjson"); const log = createRuntimeLog(path, 80);
    await log.write({ code: "runtime-start", password: "never store" });
    await log.write({ code: "runtime-restart", exitCode: 1, attempt: 1, secret: "never store" });
    await log.write({ code: "runtime-stop" }); await log.flush();
    const files = await readdir(directory); assert.ok(files.length > 1); assert.ok(files.length <= 4);
    for (const file of files) assert.doesNotMatch(await readFile(join(directory, file), "utf8"), /password|secret|never store/);
    assert.equal(safeRuntimeRecord({ metadata: { route: "private" } }), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("runtime capture stores only structured diagnostic lines, not raw child output", async () => {
  const input = new PassThrough(); const output = new PassThrough(); const records = []; let echoed = "";
  output.on("data", chunk => { echoed += chunk; });
  captureRuntimeOutput(input, output, { write: value => records.push(safeRuntimeRecord(value)) });
  input.write("raw PRIVATE_CANARY stack output\n\u001b[1mEVENTOTRON_DIAG");
  input.write(`NOSTIC ${JSON.stringify({ id: "LOG-" + "a".repeat(24), source: "server", metadata: { code: "save-failed", route: "/api/events", release: "test", raw: "PRIVATE_CANARY" } })}\u001b[0m\n`);
  assert.ok(echoed.includes("PRIVATE_CANARY"));
  assert.equal(records.length, 1); assert.ok(!JSON.stringify(records).includes("PRIVATE_CANARY"));
});

test("diagnostics and support permission boundaries are enforced at the routes", async () => {
  const diagnostics = await readFile(new URL("../app/api/diagnostics/route.ts", import.meta.url), "utf8");
  const tickets = await readFile(new URL("../app/api/support-tickets/route.ts", import.meta.url), "utf8");
  const backup = await readFile(new URL("../app/api/workspace-backup/route.ts", import.meta.url), "utf8");
  assert.match(diagnostics, /GET = withRole\("admin"/);
  assert.match(tickets, /eq\(supportTickets\.reporter, identity\.email\)/);
  assert.match(tickets, /eq\(supportTickets\.updatedAt, body\.expectedUpdatedAt\)/);
  assert.match(backup, /GET = withRole\("admin"/);
});
