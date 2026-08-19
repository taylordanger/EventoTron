/**
 * Seat labelling for Tabletron seating sections.
 *
 * Everything here is pure so the label scheme can be unit tested without a
 * browser. `page.tsx` owns the geometry on screen; this module owns what each
 * seat is called.
 *
 * The rules staff actually need: either axis can be letters or numbers, either
 * axis can start anywhere (a section that begins at row R), and a single row
 * can override the scheme outright when a printed ticket chart disagrees with
 * the pattern.
 */

export type LabelStyle = "letters" | "numbers";
/**
 * `per-row` restarts seat labels every row (A1..A12, B1..B12).
 * `continuous` runs one sequence through the whole section (1..144).
 * `odd-even` climbs outward from a centre aisle (…5 3 1 | 2 4 6…).
 */
export type SeatNumbering = "per-row" | "continuous" | "odd-even";
export type LabelOrder = "row-seat" | "seat-row";
export type SeatDirection = "ltr" | "rtl";

export type SeatRowDef = {
  id: string;
  seats: number;
  /** Forces this row's label, ignoring the section sequence. */
  labelOverride?: string;
  /** Forces this row's first seat label, ignoring the section sequence. */
  seatStartOverride?: string;
  /** Lateral stagger in feet, for curved or offset banks. */
  offset?: number;
};

export type SeatingSection = {
  id: string;
  name: string;
  x: number;
  y: number;
  rows: SeatRowDef[];
  rowStyle: LabelStyle;
  rowStart: string;
  seatStyle: LabelStyle;
  seatStart: string;
  numbering: SeatNumbering;
  order: LabelOrder;
  separator: string;
  seatSpacing: number;
  rowSpacing: number;
  seatDirection: SeatDirection;
  /** Venues commonly skip I and O so they are not misread as 1 and 0. */
  skipAmbiguousLetters: boolean;
};

export type SeatLabel = {
  seatId: string;
  rowId: string;
  rowIndex: number;
  seatIndex: number;
  rowLabel: string;
  seatLabel: string;
  label: string;
  x: number;
  y: number;
};

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ALPHABET_NO_AMBIGUOUS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function alphabet(skipAmbiguous: boolean): string {
  return skipAmbiguous ? ALPHABET_NO_AMBIGUOUS : ALPHABET;
}

/**
 * Spreadsheet-style letters: A..Z, then AA, AB, … so a section can outgrow the
 * alphabet without colliding. `index` is 0-based.
 */
export function toLetters(index: number, skipAmbiguous = false): string {
  const letters = alphabet(skipAmbiguous);
  const base = letters.length;
  if (!Number.isFinite(index) || index < 0) return letters[0];
  let remaining = Math.floor(index);
  let out = "";
  while (remaining >= 0) {
    out = letters[remaining % base] + out;
    remaining = Math.floor(remaining / base) - 1;
  }
  return out;
}

/** Inverse of `toLetters`. Unknown characters are ignored. */
export function fromLetters(value: string, skipAmbiguous = false): number {
  const letters = alphabet(skipAmbiguous);
  const base = letters.length;
  const clean = String(value ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!clean) return 0;
  let total = 0;
  for (const char of clean) {
    const position = letters.indexOf(char);
    if (position === -1) continue;
    total = total * base + (position + 1);
  }
  return Math.max(0, total - 1);
}

/**
 * Reads a user-typed start value into a 0-based offset, so "R" and "18" both
 * mean the same thing in their respective styles.
 */
export function parseStart(value: string, style: LabelStyle, skipAmbiguous = false): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  if (style === "numbers") {
    const parsed = Number.parseInt(raw.replace(/[^\d-]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 1;
  }
  return fromLetters(raw, skipAmbiguous);
}

/** Renders the nth label in a sequence that begins at `start`. */
export function labelAt(
  style: LabelStyle,
  start: string,
  index: number,
  skipAmbiguous = false,
): string {
  const offset = parseStart(start, style, skipAmbiguous);
  if (style === "numbers") return String(offset + index);
  return toLetters(offset + index, skipAmbiguous);
}

/**
 * How far each seat sits from the row's starting label, left to right.
 *
 * These are offsets rather than finished numbers so that lettered and numbered
 * seats share one code path: the caller adds the offset to whatever the row
 * starts at. `per-row` and `continuous` count straight across; `odd-even`
 * walks outward from the centre so the aisle sits between seat 1 and seat 2.
 */
function seatSteps(count: number, numbering: SeatNumbering, startStep: number): number[] {
  const total = Math.max(0, Math.floor(count));
  if (total === 0) return [];
  if (numbering !== "odd-even") {
    return Array.from({ length: total }, (_, index) => startStep + index);
  }
  const leftCount = Math.ceil(total / 2);
  return Array.from({ length: total }, (_, index) =>
    index < leftCount
      ? startStep + (leftCount - index) * 2 - 2
      : startStep + (index - leftCount + 1) * 2 - 1,
  );
}

export function joinLabel(
  rowLabel: string,
  seatLabel: string,
  order: LabelOrder,
  separator: string,
): string {
  const gap = separator ?? "";
  return order === "row-seat"
    ? `${rowLabel}${gap}${seatLabel}`
    : `${seatLabel}${gap}${rowLabel}`;
}

/** Total seats in a section. */
export function sectionSeatCount(section: SeatingSection): number {
  return section.rows.reduce((total, row) => total + Math.max(0, Math.floor(row.seats)), 0);
}

/**
 * Every seat in a section with its label and its position in feet, relative to
 * the room origin. This is the single source of truth for both the canvas and
 * the printable label sheet, so the two can never disagree.
 */
export function sectionSeatLabels(section: SeatingSection): SeatLabel[] {
  const skip = section.skipAmbiguousLetters;
  const seats: SeatLabel[] = [];
  // `continuous` needs a counter that survives across rows.
  let runningStep = 0;

  section.rows.forEach((row, rowIndex) => {
    const count = Math.max(0, Math.floor(row.seats));
    const rowLabel =
      row.labelOverride?.trim() ||
      labelAt(section.rowStyle, section.rowStart, rowIndex, skip);

    // An override replaces the row's starting label outright, which also opts
    // that row out of the continuous run.
    const override = row.seatStartOverride?.trim();
    const rowSeatStart = override || section.seatStart;
    const startStep = !override && section.numbering === "continuous" ? runningStep : 0;

    const steps = seatSteps(count, section.numbering, startStep);
    if (section.numbering === "continuous" && !override) runningStep = startStep + count;

    // Labels always read left-to-right on screen; `rtl` flips which physical
    // seat receives which label rather than moving the seats themselves.
    const ordered = section.seatDirection === "rtl" ? [...steps].reverse() : steps;

    ordered.forEach((step, seatIndex) => {
      const seatLabel = labelAt(section.seatStyle, rowSeatStart, step, skip);
      seats.push({
        seatId: `${row.id}:${seatIndex}`,
        rowId: row.id,
        rowIndex,
        seatIndex,
        rowLabel,
        seatLabel,
        label: joinLabel(rowLabel, seatLabel, section.order, section.separator),
        x: section.x + (row.offset ?? 0) + seatIndex * section.seatSpacing,
        y: section.y + rowIndex * section.rowSpacing,
      });
    });
  });

  return seats;
}

/** Seats grouped by row, for the printable reference list. */
export function sectionRowSummaries(section: SeatingSection): {
  rowId: string;
  rowLabel: string;
  labels: string[];
}[] {
  const grouped = new Map<string, { rowId: string; rowLabel: string; labels: string[] }>();
  for (const seat of sectionSeatLabels(section)) {
    const existing = grouped.get(seat.rowId);
    if (existing) existing.labels.push(seat.label);
    else grouped.set(seat.rowId, { rowId: seat.rowId, rowLabel: seat.rowLabel, labels: [seat.label] });
  }
  return [...grouped.values()];
}

/** Width and height of a section in feet, used for bounds checks on drag. */
export function sectionFootprint(section: SeatingSection): { width: number; height: number } {
  const widest = section.rows.reduce((max, row) => {
    const span = (row.offset ?? 0) + Math.max(0, Math.floor(row.seats) - 1) * section.seatSpacing;
    return Math.max(max, span);
  }, 0);
  return {
    width: widest,
    height: Math.max(0, section.rows.length - 1) * section.rowSpacing,
  };
}

export function makeSeatRow(seats = 10): SeatRowDef {
  return { id: Math.random().toString(36).slice(2, 9), seats };
}

export function makeSeatingSection(x: number, y: number, name = "Seating Section"): SeatingSection {
  return {
    id: Math.random().toString(36).slice(2, 9),
    name,
    x,
    y,
    rows: [makeSeatRow(), makeSeatRow(), makeSeatRow()],
    rowStyle: "letters",
    rowStart: "A",
    seatStyle: "numbers",
    seatStart: "1",
    numbering: "per-row",
    order: "row-seat",
    separator: "",
    seatSpacing: 2,
    rowSpacing: 3,
    seatDirection: "ltr",
    skipAmbiguousLetters: false,
  };
}
