import assert from "node:assert/strict";
import { validateLocalBackup } from "./backup-local.mjs";

const base = process.env.EVENTOTRON_QA_URL;
const url = new URL(base || "http://invalid");
if (process.env.EVENTOTRON_ISOLATED_QA !== "1" || url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || !url.port || ["3000", "3001", "3101"].includes(url.port) || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
  throw new Error("Set EVENTOTRON_ISOLATED_QA=1 and EVENTOTRON_QA_URL to an isolated loopback test server; daily-use ports are forbidden.");
}
async function request(path, init) {
  const response = await fetch(`${url.origin}${path}`, { ...init, redirect: "error" });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}
const id = `backup-consistency-${Date.now()}`;
await request("/api/events", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ event: { id, title: "Isolated backup consistency test", date: "2026-10-10", kind: "note" }, expectedUpdatedAt: null }) });
let revision = null;
let checks = 0;
async function writer() {
  for (let i = 1; i <= 25; i++) {
    const saved = await request(`/api/event-app-state?eventId=${id}&app=scheduluotron`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({
        expectedUpdatedAt: revision, payload: { eventName: `Revision ${i}`, eventDate: "2026-10-10", blocks: [{ id: `${id}-item`, title: `Revision ${i}`, start: "09:00", end: "10:00" }] },
      }),
    });
    revision = saved.updatedAt;
  }
}
async function reader() {
  for (let i = 0; i < 25; i++) {
    const backup = await request("/api/workspace-backup");
    validateLocalBackup(backup);
    const state = backup.data.appletStates.find((entry) => entry.eventId === id && entry.appName === "scheduluotron");
    const projected = backup.data.scheduleItems.find((entry) => entry.eventId === id);
    if (state) {
      assert.ok(projected, "applet state must have a matching projection in the same export");
      assert.equal(projected.payload.title, state.payload.blocks[0].title);
      checks++;
    } else assert.equal(projected, undefined);
  }
}
try {
  await Promise.all([writer(), reader()]);
  assert.ok(checks > 0);
  const backup = await request("/api/workspace-backup");
  const state = backup.data.appletStates.find((entry) => entry.eventId === id && entry.appName === "scheduluotron");
  assert.equal(state.payload.eventName, "Revision 25");
  console.log(JSON.stringify({ passed: true, concurrentExports: 25, matchingSnapshots: checks }));
} finally {
  await request(`/api/events?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
