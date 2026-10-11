import test from "node:test";
import assert from "node:assert/strict";
import { venueDateKey } from "../app/venue-date.ts";

test("Pacific evening uses today's venue date, not tomorrow's UTC date", () => {
  assert.equal(venueDateKey(new Date("2026-10-11T01:30:00Z")), "2026-10-10");
  assert.equal(venueDateKey(new Date("2026-10-11T07:00:00Z")), "2026-10-11");
});

test("venue date honors configured timezone and daylight saving", () => {
  assert.equal(venueDateKey(new Date("2026-01-11T07:30:00Z")), "2026-01-10");
  assert.equal(venueDateKey(new Date("2026-10-11T01:30:00Z"), "Europe/London"), "2026-10-11");
});
