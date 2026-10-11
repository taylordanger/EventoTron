import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRoomName, roomNameInitials, roomNamesMatch } from "../app/tabletron/room-names.ts";

/**
 * Checked against the real rooms at Lincoln City Cultural Center and the names
 * their per-room Google Calendars actually use.
 */

test("a calendar's room name matches the configured room", () => {
  assert.ok(roomNamesMatch("Margarets Meeting Room", "Margaret's Room"));
  assert.ok(roomNamesMatch("Dance Studio", "Dance Studio"));
  assert.ok(roomNamesMatch("Auditorium", "Auditorium"));
  assert.ok(roomNamesMatch("LCCC Main Auditorium", "Auditorium"));
});

test("an abbreviation resolves to the room it stands for", () => {
  // The memorial service arrived with its location set to "MMR".
  assert.equal(roomNameInitials("Margarets Meeting Room"), "mmr");
  assert.ok(roomNamesMatch("MMR", "Margarets Meeting Room"));
  assert.ok(roomNamesMatch("Margarets Meeting Room", "MMR"));
});

test("different rooms do not match each other", () => {
  assert.ok(!roomNamesMatch("Dance Studio", "Auditorium"));
  assert.ok(!roomNamesMatch("Margaret's Room", "Elizabethan Room"));
  assert.ok(!roomNamesMatch("Conference", "Plaza"));
  assert.ok(!roomNamesMatch("Underground Art Lab", "Auditorium Stage"));
});

test("only an abbreviation may match on initials", () => {
  // Without this, two unrelated short names could collide on a coincidence.
  assert.ok(!roomNamesMatch("Dance Studio", "Downstairs Suite"));
  assert.ok(!roomNamesMatch("Auditorium Stage", "Art Studio"));
});

test("filler words do not decide identity", () => {
  assert.equal(normalizeRoomName("Margaret's Room"), normalizeRoomName("Margarets Meeting Room"));
  assert.equal(normalizeRoomName("The Plaza"), normalizeRoomName("Plaza"));
});

test("empty names never match", () => {
  assert.ok(!roomNamesMatch("", "Auditorium"));
  assert.ok(!roomNamesMatch("Auditorium", ""));
  assert.ok(!roomNamesMatch("", ""));
});

test("rooms a booking names are added to what is already assigned", async () => {
  // This used to be either/or: once an event had any room assigned, the rooms
  // named by its calendars were ignored for good, so a booking that later
  // spread into a second room never picked it up — and an event imported
  // before room matching worked stayed stuck on whatever it first guessed.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/tabletron/project-data.ts", import.meta.url), "utf8");

  assert.match(source, /const priorAssignments =/, "existing assignments are not kept separately");
  assert.match(source, /const unassigned = activeRooms\.filter\(/, "rooms the booking names are not added");
  assert.match(
    source,
    /\.\.\.priorAssignments,\s*\n\s*\.\.\.unassigned\.map\(/,
    "assignments replace rather than merge",
  );
  // An operator's purposes and times must survive.
  assert.doesNotMatch(
    source,
    /const assignments = prior\?\.rooms\.length\s*\n\s*\? prior\.rooms\.filter/,
    "the old either/or branch is still in place",
  );
});

test("a venue with one calendar per room gets every room from the booking", async () => {
  // The calendars a booking appears in are a better signal than its location
  // text, which is typed by whoever made the booking.
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const sameBooking = calendarFeedEvents\.filter\(/, "sibling calendar entries are not gathered");
  assert.match(page, /candidate\.sourceName/, "the source calendars are not used as rooms");
  assert.match(page, /roomNames\.join\(", "\)/, "rooms are not passed on in a form Tabletron can split");
});
