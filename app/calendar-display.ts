export type CalendarView = "month" | "week" | "day" | "agenda";
export type CalendarDisplay = {
  view: CalendarView;
  background: string;
  accent: string;
  textSize: number;
  density: "compact" | "comfortable" | "spacious";
  wallpaper: string;
  wallpaperShade: number;
};

export const CALENDAR_DISPLAY_KEY = "eventotron-calendar-display-v1";
export const calendarViews: CalendarView[] = ["month", "week", "day", "agenda"];
export const calendarThemes = [
  { name: "Classic", background: "#040a06", accent: "#75ff47" },
  { name: "Light", background: "#f4f7fa", accent: "#3157b7" },
  { name: "Graphite", background: "#17191d", accent: "#5dd6c4" },
  { name: "High contrast", background: "#000000", accent: "#ffe04b" },
];
export const defaultCalendarDisplay: CalendarDisplay = {
  view: "month", background: "#040a06", accent: "#75ff47", textSize: 12,
  density: "compact", wallpaper: "", wallpaperShade: 45,
};

function color(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
}

export function validWallpaper(value: unknown): value is string {
  return typeof value === "string" && value.length <= 650_000 && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/]+=*$/i.test(value);
}

export function normalizeCalendarDisplay(raw: unknown): CalendarDisplay {
  const value = raw && typeof raw === "object" ? raw as Partial<CalendarDisplay> : {};
  const bound = (number: unknown, min: number, max: number, fallback: number) => typeof number === "number" && Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
  return {
    view: calendarViews.includes(value.view as CalendarView) ? value.view as CalendarView : "month",
    background: color(value.background, defaultCalendarDisplay.background),
    accent: color(value.accent, defaultCalendarDisplay.accent),
    textSize: bound(value.textSize, 10, 20, 12),
    density: ["compact", "comfortable", "spacious"].includes(value.density ?? "") ? value.density! : "compact",
    wallpaper: validWallpaper(value.wallpaper) ? value.wallpaper : "",
    wallpaperShade: bound(value.wallpaperShade, 25, 95, 45),
  };
}

function rgb(hex: string) {
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

export function contrastText(hex: string) {
  const luminance = rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}

export function calendarSourceColor(color: string, background: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return "#3157b7";
  const [red, green, blue] = rgb(color);
  return contrastText(background) === "#000000" && red > 130 && green > 100 && blue < Math.min(red, green) * 0.8 ? "#9a3412" : color;
}

export function suiteAppearanceStyle(display: CalendarDisplay): Record<string, string> {
  const text = contrastText(display.background);
  const base = rgb(display.background);
  const foreground = text === "#000000" ? 0 : 255;
  const surface = base.map(channel => Math.round(channel * 0.96 + foreground * 0.04));
  const accent = rgb(display.accent);
  return {
    "--ui-background": display.background,
    "--ui-surface": `rgba(${surface.join(",")},${display.wallpaper ? 0.94 : 1})`,
    "--ui-input": `rgb(${surface.join(",")})`,
    "--ui-text": text,
    "--ui-link": text,
    "--ui-border": `rgba(${foreground},${foreground},${foreground},0.4)`,
    "--ui-accent": display.accent,
    "--ui-accent-text": contrastText(display.accent),
    "--ui-warning": text === "#000000" ? "#9a3412" : "#ffd166",
    "--ui-danger": text === "#000000" ? "#b42332" : "#ff8896",
    "--ui-success": text === "#000000" ? "#226e38" : "#8ed7a5",
    "--ui-glow": `rgba(${accent.join(",")},0.15)`,
    "--ui-scale": String(display.textSize / 12),
    "--ui-wallpaper": calendarDisplayStyle(display).backgroundImage,
    colorScheme: text === "#000000" ? "light" : "dark",
  };
}

export function calendarDisplayStyle(display: CalendarDisplay): Record<string, string> {
  const foreground = contrastText(display.background);
  const channels = rgb(display.background).join(",");
  return {
    "--cal-background": display.background,
    "--cal-surface": `rgba(${channels},${display.wallpaper ? 0.94 : 1})`,
    "--cal-text": foreground,
    "--cal-border": foreground === "#000000" ? "#00000033" : "#ffffff33",
    "--cal-accent": display.accent,
    "--cal-accent-text": contrastText(display.accent),
    "--cal-size": `${display.textSize}px`,
    "--cal-gap": `${{ compact: 4, comfortable: 8, spacious: 12 }[display.density]}px`,
    "--cal-padding": `${{ compact: 5, comfortable: 9, spacious: 14 }[display.density]}px`,
    "--cal-wallpaper-gap": display.wallpaper ? "10px" : "0px",
    backgroundColor: display.background,
    colorScheme: foreground === "#000000" ? "light" : "dark",
    backgroundImage: display.wallpaper ? `linear-gradient(rgba(${channels},${display.wallpaperShade / 100}),rgba(${channels},${display.wallpaperShade / 100})),url("${display.wallpaper}")` : "none",
  };
}

export function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function calendarDates(year: number, month: number, day: number, view: CalendarView, weekStartsOn: "sunday" | "monday") {
  const first = new Date(Date.UTC(year, month, 1));
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const focus = new Date(Date.UTC(year, month, Math.max(1, Math.min(count, day))));
  if (view === "day") return [dateKey(focus)];
  if (view === "week") {
    const offset = (focus.getUTCDay() - (weekStartsOn === "monday" ? 1 : 0) + 7) % 7;
    return Array.from({ length: 7 }, (_, i) => dateKey(new Date(Date.UTC(year, month, focus.getUTCDate() - offset + i))));
  }
  const dates: Array<string | null> = Array.from({ length: count }, (_, i) => dateKey(new Date(Date.UTC(year, month, i + 1))));
  if (view === "agenda") return dates;
  const offset = (first.getUTCDay() - (weekStartsOn === "monday" ? 1 : 0) + 7) % 7;
  dates.unshift(...Array<null>(offset).fill(null));
  while (dates.length % 7) dates.push(null);
  return dates;
}
