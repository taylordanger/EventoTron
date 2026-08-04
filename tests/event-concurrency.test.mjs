import assert from "node:assert/strict";
import test from "node:test";
import {
  eventFingerprint,
  mergeConcurrentEvent,
} from "../app/event-concurrency.ts";

const base = {
  id: "event-1",
  revision: "2026-08-03T10:00:00.000Z",
  title: "Rotary",
  manager: "Heather",
  attendees: 24,
};

test("event fingerprints ignore server revisions", () => {
  assert.equal(
    eventFingerprint(base),
    eventFingerprint({ ...base, revision: "2026-08-03T11:00:00.000Z" }),
  );
});

test("concurrent event edits merge when fields do not overlap", () => {
  const local = { ...base, manager: "Jason" };
  const remote = {
    ...base,
    revision: "2026-08-03T10:01:00.000Z",
    attendees: 26,
  };
  const result = mergeConcurrentEvent(base, local, remote);
  assert.deepEqual(result.conflictFields, []);
  assert.equal(result.merged.manager, "Jason");
  assert.equal(result.merged.attendees, 26);
  assert.equal(result.merged.revision, remote.revision);
});

test("concurrent event edits report overlapping field conflicts", () => {
  const local = { ...base, manager: "Jason" };
  const remote = {
    ...base,
    revision: "2026-08-03T10:01:00.000Z",
    manager: "Nara",
  };
  const result = mergeConcurrentEvent(base, local, remote);
  assert.deepEqual(result.conflictFields, ["manager"]);
});
