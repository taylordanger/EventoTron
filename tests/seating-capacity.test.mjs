import assert from "node:assert/strict";
import test from "node:test";
import { seatsInFurniture } from "../app/tabletron/seating-capacity.ts";

/**
 * Checked against the real furniture library at Lincoln City Cultural Center,
 * where the same word means three different things depending on the name.
 */

test("a single chair seats one", () => {
  for (const name of [
    "CHAIRS",
    "chair",
    "BURGUNDY BANQUET CHAIR - 75 available",
    "RED LEATHERETTE CHAIR - 45 available",
    "WHITE PLASTIC FOLDING CHAIR - 62 available",
    "MOLDED PLASTIC CHAIR - 43 available",
  ]) {
    assert.equal(seatsInFurniture(name), 1, `${name} should seat one`);
  }
});

test("stock counts are not mistaken for seats", () => {
  // "- 75 available" is how many the venue owns, not how many this object seats.
  assert.equal(seatsInFurniture("BURGUNDY BANQUET CHAIR - 75 available"), 1);
  assert.equal(seatsInFurniture("MOLDED PLASTIC CHAIR - 43 available"), 1);
});

test("an object standing for many chairs seats that many", () => {
  assert.equal(seatsInFurniture("Seating Area 40 chairs"), 40);
  assert.equal(seatsInFurniture("40 chairs"), 40);
  assert.equal(seatsInFurniture("12 CHAIRS"), 12);
});

test("chair accessories seat nobody", () => {
  assert.equal(seatsInFurniture("IVORY CHAIR COVER - $4 self install / $5 installed"), 0);
  assert.equal(seatsInFurniture("CHAIR CART"), 0);
  assert.equal(seatsInFurniture("CHAIR RACK"), 0);
});

test("furniture that is not seating counts as nothing", () => {
  for (const name of [
    "6 FT ROUND TABLES",
    "20 IN x 48 IN SMALL RECTANGULAR TABLE - 20 available",
    "COFFEE STATION",
    "Buffet Station",
    "Stage",
    "TV",
    "PODIUM",
  ]) {
    assert.equal(seatsInFurniture(name), 0, `${name} should not count as seating`);
  }
});

test("unreadable names count as zero rather than guessing", () => {
  // Overstating capacity is the dangerous direction: a room that looks short
  // gets checked, a room that looks sufficient does not.
  assert.equal(seatsInFurniture("Seating area"), 0);
  assert.equal(seatsInFurniture("Seating Area Vertical"), 0);
  assert.equal(seatsInFurniture(""), 0);
  assert.equal(seatsInFurniture(undefined), 0);
});
