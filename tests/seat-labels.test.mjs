import assert from "node:assert/strict";
import test from "node:test";
import {
  fromLetters,
  joinLabel,
  labelAt,
  makeSeatingSection,
  parseStart,
  sectionRowSummaries,
  sectionSeatCount,
  sectionSeatLabels,
  toLetters,
} from "../app/tabletron/seat-labels.ts";

function section(overrides = {}) {
  return { ...makeSeatingSection(0, 0), rows: rows([3, 3]), ...overrides };
}

function rows(counts) {
  return counts.map((seats, index) => ({ id: `r${index}`, seats }));
}

function labelsOf(input) {
  return sectionSeatLabels(input).map((seat) => seat.label);
}

test("letters run past Z without colliding", () => {
  assert.equal(toLetters(0), "A");
  assert.equal(toLetters(25), "Z");
  assert.equal(toLetters(26), "AA");
  assert.equal(toLetters(27), "AB");
  assert.equal(toLetters(51), "AZ");
  assert.equal(toLetters(52), "BA");
});

test("fromLetters inverts toLetters", () => {
  for (const index of [0, 5, 25, 26, 27, 51, 52, 700]) {
    assert.equal(fromLetters(toLetters(index)), index);
  }
});

test("start values are read in their own style", () => {
  assert.equal(parseStart("R", "letters"), 17);
  assert.equal(parseStart("A", "letters"), 0);
  assert.equal(parseStart("5", "numbers"), 5);
  assert.equal(parseStart("", "numbers"), 0);
});

test("a section can start at row R and keep going", () => {
  assert.equal(labelAt("letters", "R", 0), "R");
  assert.equal(labelAt("letters", "R", 1), "S");
  assert.equal(labelAt("letters", "R", 8), "Z");
  assert.equal(labelAt("letters", "R", 9), "AA");
});

test("rows starting at R produce R1 R2 R3", () => {
  const labels = labelsOf(section({ rowStart: "R", rows: rows([3, 3]) }));
  assert.deepEqual(labels, ["R1", "R2", "R3", "S1", "S2", "S3"]);
});

test("per-row numbering restarts every row", () => {
  const labels = labelsOf(section({ numbering: "per-row", rows: rows([3, 3]) }));
  assert.deepEqual(labels, ["A1", "A2", "A3", "B1", "B2", "B3"]);
});

test("continuous numbering runs through the whole section", () => {
  const labels = labelsOf(section({ numbering: "continuous", rows: rows([3, 2, 3]) }));
  assert.deepEqual(labels, ["A1", "A2", "A3", "B4", "B5", "C6", "C7", "C8"]);
});

test("odd-even numbering climbs outward from the centre", () => {
  const labels = labelsOf(
    section({ numbering: "odd-even", separator: "-", rows: rows([10]) }),
  );
  assert.deepEqual(labels, [
    "A-9", "A-7", "A-5", "A-3", "A-1",
    "A-2", "A-4", "A-6", "A-8", "A-10",
  ]);
});

test("odd-even handles an odd seat count", () => {
  const labels = labelsOf(section({ numbering: "odd-even", rows: rows([5]) }));
  assert.deepEqual(labels, ["A5", "A3", "A1", "A2", "A4"]);
});

test("axes can be flipped to numbered rows and lettered seats", () => {
  const labels = labelsOf(
    section({
      rowStyle: "numbers",
      rowStart: "1",
      seatStyle: "letters",
      seatStart: "A",
      rows: rows([3, 3]),
    }),
  );
  assert.deepEqual(labels, ["1A", "1B", "1C", "2A", "2B", "2C"]);
});

test("lettered seats honour a non-A start", () => {
  const labels = labelsOf(
    section({ seatStyle: "letters", seatStart: "C", rows: rows([3]) }),
  );
  assert.deepEqual(labels, ["AC", "AD", "AE"]);
});

test("seat-row order puts the seat first", () => {
  const labels = labelsOf(section({ order: "seat-row", rows: rows([2]) }));
  assert.deepEqual(labels, ["1A", "2A"]);
});

test("a separator is applied between the two parts", () => {
  const labels = labelsOf(section({ separator: "-", rows: rows([2]) }));
  assert.deepEqual(labels, ["A-1", "A-2"]);
});

test("a row override forces its own label for odd ticket charts", () => {
  const input = section({ rows: rows([2, 2]) });
  input.rows[1].labelOverride = "VIP";
  assert.deepEqual(labelsOf(input), ["A1", "A2", "VIP1", "VIP2"]);
});

test("a row can override where its seat numbers begin", () => {
  const input = section({ rows: rows([3, 3]) });
  input.rows[1].seatStartOverride = "101";
  assert.deepEqual(labelsOf(input), ["A1", "A2", "A3", "B101", "B102", "B103"]);
});

test("a seat-start override opts that row out of the continuous run", () => {
  const input = section({ numbering: "continuous", rows: rows([2, 2, 2]) });
  input.rows[1].seatStartOverride = "50";
  assert.deepEqual(labelsOf(input), ["A1", "A2", "B50", "B51", "C3", "C4"]);
});

test("ambiguous letters can be skipped so I and O are not misread", () => {
  assert.equal(toLetters(8, true), "J");
  const labels = sectionSeatLabels(
    section({ skipAmbiguousLetters: true, rows: rows([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) }),
  ).map((seat) => seat.rowLabel);
  assert.ok(!labels.includes("I"));
  assert.deepEqual(labels, ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"]);
});

test("right-to-left flips which seat carries which label", () => {
  const labels = labelsOf(section({ seatDirection: "rtl", rows: rows([3]) }));
  assert.deepEqual(labels, ["A3", "A2", "A1"]);
});

test("seats are positioned in feet from the section origin", () => {
  const seats = sectionSeatLabels(
    section({ x: 10, y: 4, seatSpacing: 2, rowSpacing: 3, rows: rows([2, 2]) }),
  );
  assert.deepEqual(
    seats.map((seat) => [seat.x, seat.y]),
    [[10, 4], [12, 4], [10, 7], [12, 7]],
  );
});

test("a per-row offset staggers that row only", () => {
  const input = section({ x: 0, seatSpacing: 2, rows: rows([2, 2]) });
  input.rows[1].offset = 1;
  assert.deepEqual(
    sectionSeatLabels(input).map((seat) => seat.x),
    [0, 2, 1, 3],
  );
});

test("seat totals cover rows of differing sizes", () => {
  assert.equal(sectionSeatCount(section({ rows: rows([12, 12, 10, 8]) })), 42);
  assert.equal(sectionSeatCount(section({ rows: [] })), 0);
});

test("row summaries group labels for the printed list", () => {
  const summaries = sectionRowSummaries(section({ rows: rows([2, 3]) }));
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries[0], { rowId: "r0", rowLabel: "A", labels: ["A1", "A2"] });
  assert.deepEqual(summaries[1].labels, ["B1", "B2", "B3"]);
});

test("empty and malformed rows do not produce seats", () => {
  assert.deepEqual(labelsOf(section({ rows: rows([0, 2]) })), ["B1", "B2"]);
  assert.deepEqual(labelsOf(section({ rows: [] })), []);
});

test("joinLabel respects order and separator", () => {
  assert.equal(joinLabel("A", "1", "row-seat", ""), "A1");
  assert.equal(joinLabel("A", "1", "seat-row", "-"), "1-A");
});

test("the layout advisory answers whether everyone has a seat", async () => {
  // Tabletron's advisory judged only spacing, so a room one seat short still
  // reported "LAYOUT COMFORTABLE" — a green tick while a guest stands. Seating
  // the guests is the first question a room plan has to answer, so a shortfall
  // has to outrank clearance rather than sit behind it.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8");

  assert.match(source, /const seatShortfall\s*=/, "capacity is never compared against the guest count");
  assert.match(source, /event\?\.guestCount/, "the linked event's guest count is not consulted");

  // The shortfall branch must be evaluated before the clearance branches.
  const advisory = source.slice(source.indexOf("SYSTEM ADVISORY"));
  const shortfallAt = advisory.indexOf("seatShortfall > 0");
  const collisionAt = advisory.indexOf('score.state === "COLLISION"');
  assert.ok(shortfallAt !== -1, "the advisory ignores a seat shortfall");
  assert.ok(
    shortfallAt < collisionAt,
    "clearance is reported ahead of guests having nowhere to sit",
  );

  assert.match(source, /WITHOUT A SEAT/, "the shortfall is not stated in the advisory");
  assert.match(source, /"GUEST" : "GUESTS"/, "the shortfall wording is not singular-aware");
  assert.match(source, /expected, \$\{totalSeatCount\} seated/, "the advisory does not show the numbers");
});

test("the capacity warning only fires where the comparison is meaningful", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8");

  // Tabletron is usable without an event file; a missing guest count must not
  // read as "0 guests expected" and warn about nothing.
  assert.match(
    source,
    /expectedGuests > 0 && guestsAllInThisRoom \? expectedGuests - totalSeatCount : 0/,
    "a layout with no linked event could report a shortfall",
  );

  // An event spread over three rooms would otherwise report every guest as
  // unseated in each of them, and a room that is not part of the event at all
  // would be measured against a guest count that has nothing to do with it.
  assert.match(source, /const eventRoomIds =/, "the event's rooms are not consulted");
  assert.match(
    source,
    /eventRoomIds\.length === 1 && eventRoomIds\[0\] === room\.id/,
    "the warning is not scoped to a single-room event in the room on screen",
  );
});

test("chairs placed as furniture count towards seating", async () => {
  // A room holding sixteen chairs reported "0 seated", because only round
  // tables and seating rows were counted.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8");
  assert.match(source, /seatsInFurniture/, "furniture seating is not counted");
  assert.match(
    source,
    /layout\.tables\.length \* 6 \+ rowSeatCount \+ chairSeatCount/,
    "the seat total leaves out placed chairs",
  );
});

test("Export Setup Sheet exports the layout on screen, not the event's assigned one", async () => {
  // This button was briefly wired to the operations report. That report draws
  // whichever layout Event Ops assigned to the event, so the sheet came out
  // without the tables just arranged — and with no event file linked the
  // handler returned immediately, so the button did nothing at all.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8");

  assert.match(source, /function printSetupSheet\(\)/, "there is no setup-sheet export");
  assert.match(
    source,
    /onClick=\{printSetupSheet\}>\s*\n\s*EXPORT SETUP SHEET/,
    "EXPORT SETUP SHEET is not wired to the setup sheet",
  );
  assert.doesNotMatch(
    source,
    /onClick=\{printOperations\}>\s*\n\s*EXPORT SETUP SHEET/,
    "EXPORT SETUP SHEET runs the operations report again",
  );

  // It must name the room and layout being exported, and must not be gated on
  // an event file: a setup sheet is for whoever sets the room up.
  const fn = source.slice(source.indexOf("function printSetupSheet()"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  assert.match(body, /room\.name/, "the sheet does not identify the room");
  assert.match(body, /layout\.name/, "the sheet does not identify the layout");
  assert.doesNotMatch(body, /if \(!event\)/, "the setup sheet still requires an event file");
  assert.match(body, /setOpsReport\(false\)/, "the operations overlay could cover the printed canvas");
});

test("printing the operations report with no event says so", async () => {
  // It used to return silently, which made the control look broken.
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../app/tabletron/page.tsx", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("function printOperations()"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  assert.match(body, /if \(!event\)/, "the no-event case is not handled");
  assert.match(body, /setNotice\(/, "the no-event case fails silently");
});
