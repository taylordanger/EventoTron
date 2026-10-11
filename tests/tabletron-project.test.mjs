import assert from "node:assert/strict";
import test from "node:test";
import { defaultProject, feet, hydrateForEvent, normalizeProject, normalizeRotation, tabletronClockValue, timeRangeParts } from "../app/tabletron/project-data.ts";

test("clock inputs must be real times, not impossible setup-sheet values", () => {
  for (const invalid of ["24:00", "99:99", "10:60", "0 AM", "13 PM", "-1:00"]) assert.equal(tabletronClockValue(invalid), "", invalid);
  assert.equal(tabletronClockValue("12 AM"), "00:00");
  assert.equal(tabletronClockValue("12 PM"), "12:00");
  assert.equal(tabletronClockValue("23:59"), "23:59");
  assert.deepEqual(timeRangeParts("not a time", "9 AM - 11 AM"), { start: "09:00", end: "11:00" });
});

test("room dimensions round to whole inches without displaying twelve inches", () => {
  assert.equal(feet(5.999), "6\u2032 0\u2033");
  assert.equal(feet(5.5), "5\u2032 6\u2033");
});

test("rotation wraps safely for old and edited layouts", () => {
  for (const [input, expected] of [[undefined, 0], [-90, 270], [450, 90], [720, 0], [89.6, 90]]) assert.equal(normalizeRotation(input), expected);
});

test("booking updates preserve operator work and add newly booked rooms without duplicates", () => {
  const settings = { venueName: "QA venue", equipment: [], operationsTemplates: [], rooms: [{ id: "a", name: "Auditorium", width: 40, height: 30 }, { id: "d", name: "Dance Studio", width: 20, height: 20 }] };
  const source = { id: "event-a", title: "Room assignment acceptance", space: "Auditorium", date: "2026-10-10", eventTime: "10 AM - 12 PM", rentalTime: "9 AM - 1 PM", attendees: 40, kind: "meeting", contact: "", email: "", description: "", planningNotes: "" };
  const first = hydrateForEvent(defaultProject(settings), source, settings);
  first.events[0].rooms[0].notes = "Do not move the piano";
  first.events[0].rooms[0].setupTime = "08:30";
  first.events[0].staffing = "Operator assignment";
  const snapshot = structuredClone(first);
  const next = hydrateForEvent(first, { ...source, space: "Auditorium, Dance Studio, Auditorium" }, settings);
  assert.deepEqual(first, snapshot, "hydration must not mutate the loaded project");
  assert.deepEqual(next.events[0].rooms.map(room => room.roomId), ["a", "d"]);
  assert.equal(next.events[0].rooms[0].notes, "Do not move the piano");
  assert.equal(next.events[0].rooms[0].setupTime, "08:30");
  assert.equal(next.events[0].staffing, "Operator assignment");
  assert.equal(next.events[0].rooms[1].guestTime, "10:00");
  assert.equal(hydrateForEvent(next, source, settings).events.length, 1);
});

test("legacy layouts load with empty seating and sketches", () => {
  const project = defaultProject();
  delete project.rooms[0].layouts[0].seating;
  const restored = normalizeProject(project);
  assert.deepEqual(restored.rooms[0].layouts[0].seating, []);
  assert.deepEqual(restored.rooms[0].layouts[0].sketches, []);
  assert.throws(() => normalizeProject({ rooms: [] }), /at least one room/);
});
