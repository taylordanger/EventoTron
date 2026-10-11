import assert from "node:assert/strict";
import test from "node:test";
import { calendarDates, calendarDisplayStyle, calendarSourceColor, contrastText, defaultCalendarDisplay, normalizeCalendarDisplay, suiteAppearanceStyle, validWallpaper } from "../app/calendar-display.ts";

test("month grid contains every date including six-week months, without limiting busy days", () => {
  const dates = calendarDates(2026, 7, 10, "month", "sunday");
  assert.equal(dates.length, 42);
  assert.equal(dates.filter(Boolean).length, 31);
  assert.ok(dates.includes("2026-08-31"));
  assert.equal(calendarDates(2024, 1, 29, "agenda", "monday").length, 29);
});

test("week navigation spans month and year boundaries and respects week start", () => {
  assert.deepEqual(calendarDates(2026, 0, 1, "week", "monday"), ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
  assert.equal(calendarDates(2026, 0, 1, "week", "sunday")[0], "2025-12-28");
  assert.equal(calendarDates(2026, 1, 31, "day", "sunday")[0], "2026-02-28");
});

test("bad display settings and CSS payloads normalize to safe defaults", () => {
  const normalized = normalizeCalendarDisplay({ view: "bad", background: "url(https://example.test)", accent: "#abc", textSize: 100, density: "hidden", wallpaper: "https://example.test/private-image", wallpaperShade: -1 });
  assert.deepEqual(normalized, { ...defaultCalendarDisplay, textSize: 20, wallpaperShade: 25 });
  assert.equal(normalizeCalendarDisplay({ textSize: NaN }).textSize, 12);
  assert.deepEqual(normalizeCalendarDisplay(null), defaultCalendarDisplay);
});

test("wallpapers accept only bounded bitmap data, never SVG or remote URLs", () => {
  assert.equal(validWallpaper("data:image/jpeg;base64,/9j/AA=="), true);
  assert.equal(validWallpaper("data:image/png;base64,AAAA"), true);
  assert.equal(validWallpaper("data:image/svg+xml;base64,AAAA"), false);
  assert.equal(validWallpaper("javascript:alert(1)"), false);
  assert.equal(validWallpaper(`data:image/png;base64,${"A".repeat(650_000)}`), false);
});

test("display palette automatically chooses readable foreground and bounded text sizes", () => {
  assert.equal(contrastText("#ffffff"), "#000000");
  assert.equal(contrastText("#000000"), "#ffffff");
  const style = calendarDisplayStyle(normalizeCalendarDisplay({ background: "#ffffff", accent: "#000000", textSize: 18, density: "spacious" }));
  assert.equal(style["--cal-text"], "#000000");
  assert.equal(style["--cal-accent-text"], "#ffffff");
  assert.equal(style["--cal-size"], "18px");
  assert.equal(style["--cal-padding"], "14px");
  assert.equal(style.backgroundImage, "none");
});

test("suite-wide appearance shares the palette, text scale and wallpaper across tools", () => {
  const light = suiteAppearanceStyle(normalizeCalendarDisplay({ background: "#ffffff", accent: "#3157b7", textSize: 18, wallpaper: "data:image/png;base64,AAAA" }));
  assert.equal(light["--ui-background"], "#ffffff");
  assert.equal(light["--ui-text"], "#000000");
  assert.equal(light["--ui-accent-text"], "#ffffff");
  assert.equal(light["--ui-scale"], "1.5");
  assert.equal(light["--ui-warning"], "#9a3412");
  assert.equal(light["--ui-danger"], "#b42332");
  assert.equal(calendarSourceColor("#d5ff36", "#ffffff"), "#9a3412");
  assert.equal(calendarSourceColor("#d5ff36", "#000000"), "#d5ff36");
  assert.equal(calendarSourceColor("#3157b7", "#ffffff"), "#3157b7");
  assert.ok(light["--ui-wallpaper"].includes("data:image/png"));
  assert.equal(suiteAppearanceStyle(defaultCalendarDisplay)["--ui-text"], "#ffffff");
});
