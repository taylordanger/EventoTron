/**
 * How many people a piece of placed furniture seats.
 *
 * Tabletron counts seats from round tables (six each) and from seating rows.
 * Chairs placed as furniture counted as nothing, so a room holding sixteen
 * chairs reported "0 seated" — and once the capacity advisory existed, it
 * claimed every expected guest was without a seat.
 *
 * There is no seat field on a furniture template, so this reads the name, the
 * same signal the layout already uses to size a chair. Tuned against a real
 * venue library, which names things three different ways:
 *
 *   "MOLDED PLASTIC CHAIR - 43 available"   one chair; 43 is stock on hand
 *   "Seating Area 40 chairs"                one object standing for 40 seats
 *   "IVORY CHAIR COVER"                     not a seat at all
 *
 * Deliberately conservative: anything it cannot read confidently counts as
 * zero, because overstating capacity is the dangerous direction. A room that
 * looks short gets checked; a room that looks sufficient does not.
 */

/** Chair-adjacent things nobody sits on. */
const NOT_A_SEAT = /COVER|CART|TROLLEY|RACK|DOLLY|STACK|SKIRT/;

export function seatsInFurniture(name: string): number {
  const upper = (name ?? "").toUpperCase();
  if (!/\bCHAIRS?\b/.test(upper)) return 0;
  if (NOT_A_SEAT.test(upper)) return 0;
  // A count written before the word ("40 chairs") is seating. A number after a
  // dash ("- 43 available") is inventory and must not be read as capacity.
  const bulk = upper.match(/(\d+)\s*CHAIRS?\b/);
  if (bulk) return Math.max(0, Number(bulk[1]));
  return 1;
}
