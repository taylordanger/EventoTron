import assert from "node:assert/strict";
import test from "node:test";
import { isEventLiveNow, selectLiveTickerItems } from "../app/live-event-ticker.ts";

function event(id, date, eventTime, title = id) {
  return { key: `event:${id}`, id, title, date, eventTime, space: "Auditorium" };
}

test("ticker marks a scheduled event as live inside its time range", () => {
  const items = selectLiveTickerItems(
    [event("rotary", "2026-08-05", "11:30 AM-1:00 PM", "Rotary")],
    new Date("2026-08-05T12:15:00.000Z"),
    "UTC",
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "live");
  assert.equal(items[0].title, "Rotary");
});

test("ticker understands compact operational time ranges", () => {
  const items = selectLiveTickerItems(
    [event("rehearsal", "2026-08-13", "SBMF Rehearsal 9-5")],
    new Date("2026-08-13T16:30:00.000Z"),
    "UTC",
  );
  assert.equal(items[0].status, "live");
});

test("ticker cycles all simultaneous live events before future work", () => {
  const items = selectLiveTickerItems(
    [
      event("meeting", "2026-08-20", "9:00 AM-12:00 PM", "Meeting"),
      event("delivery", "2026-08-20", "10:00 AM-11:00 AM", "Delivery"),
      event("concert", "2026-08-20", "7:00 PM-9:00 PM", "Concert"),
    ],
    new Date("2026-08-20T10:30:00.000Z"),
    "UTC",
  );
  assert.deepEqual(items.map((item) => item.title), ["Meeting", "Delivery"]);
  assert.ok(items.every((item) => item.status === "live"));
});

test("ticker falls back to the next scheduled event", () => {
  const items = selectLiveTickerItems(
    [
      event("finished", "2026-08-20", "9:00 AM-10:00 AM"),
      event("next", "2026-08-21", "4:30 PM-7:30 PM", "Meal and Music"),
      event("later", "2026-08-22", "9:00 AM-10:00 AM"),
    ],
    new Date("2026-08-20T15:00:00.000Z"),
    "UTC",
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "next");
  assert.equal(items[0].title, "Meal and Music");
});

test("ticker labels untimed entries for the current day without claiming they are live", () => {
  const items = selectLiveTickerItems(
    [event("maintenance", "2026-08-24", "Check outside drains", "Maintenance")],
    new Date("2026-08-24T09:00:00.000Z"),
    "UTC",
  );
  assert.equal(items[0].status, "today");
});

test("planning context is only live during the saved event window", () => {
  const rotary = { date: "2026-08-05", eventTime: "11:30 AM - 1:00 PM" };
  assert.equal(isEventLiveNow(rotary, new Date("2026-08-03T12:00:00-07:00"), "America/Los_Angeles"), false);
  assert.equal(isEventLiveNow(rotary, new Date("2026-08-05T12:00:00-07:00"), "America/Los_Angeles"), true);
});
