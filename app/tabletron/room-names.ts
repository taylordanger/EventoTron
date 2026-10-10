/**
 * Matching the room names that arrive from a calendar against the rooms a
 * venue has actually configured.
 *
 * Calendars rarely spell a room the way the floor plan does. A memorial
 * service arrived with its location set to "MMR" and, matching nothing, grew a
 * phantom room by that name alongside the real Margaret's Room — so the event
 * was attached to a room with no layout while the real one sat unused.
 */

/** Words that carry no identity and only get in the way of comparison. */
const FILLER = /\b(lccc|main|space|room|rooms|meeting|the|of|at|in)\b/g;

export function normalizeRoomName(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(FILLER, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * Initials of a room name, taken from the words before any filler is removed:
 * "Margarets Meeting Room" gives "mmr". This is what lets an abbreviation used
 * in a calendar resolve to the room it stands for.
 */
export function roomNameInitials(value: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((word) => !/^(the|of|at|in)$/.test(word))
    .map((word) => word[0])
    .join("");
}

/** True when a value looks like an abbreviation rather than a name. */
function looksLikeAbbreviation(value: string): boolean {
  const letters = (value ?? "").replace(/[^a-zA-Z0-9]/g, "");
  return letters.length >= 2 && letters.length <= 5 && !/\s/.test((value ?? "").trim());
}

export function roomNamesMatch(a: string, b: string): boolean {
  const left = normalizeRoomName(a);
  const right = normalizeRoomName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  // Only let an abbreviation match initials, and only in that direction —
  // otherwise two short names would match each other on a coincidence.
  if (looksLikeAbbreviation(a) && left === roomNameInitials(b)) return true;
  if (looksLikeAbbreviation(b) && right === roomNameInitials(a)) return true;
  return false;
}
