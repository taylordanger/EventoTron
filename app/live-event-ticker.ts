export type LiveTickerEvent = {
  key: string;
  id: string;
  title: string;
  date: string;
  eventTime: string;
  space?: string;
  sourceName?: string;
  external?: boolean;
};

export type LiveTickerItem = LiveTickerEvent & {
  status: "live" | "today" | "next";
  startsAt: number;
  endsAt: number;
  allDay: boolean;
  hasTime: boolean;
};

type EventWindow = {
  startsAt: number;
  endsAt: number;
  allDay: boolean;
  hasTime: boolean;
};

const MINUTES_PER_DAY = 24 * 60;

function normalizedPeriod(value?: string) {
  if (!value) return "";
  return value.replaceAll(".", "").toUpperCase();
}

function inferredPeriod(hour: number) {
  if (hour === 0) return "AM";
  if (hour >= 7 && hour <= 11) return "AM";
  return "PM";
}

function clockMinutes(hour: number, minute: number, period: string) {
  const normalizedHour = hour % 12;
  return normalizedHour * 60 + minute + (period === "PM" ? 12 * 60 : 0);
}

function dateStart(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day) / 60_000;
}

export function eventWindow(date: string, eventTime: string): EventWindow | null {
  const dayStart = dateStart(date);
  if (dayStart === null) return null;
  const value = eventTime.trim();
  if (/all\s*day/i.test(value)) {
    return {
      startsAt: dayStart,
      endsAt: dayStart + MINUTES_PER_DAY - 1,
      allDay: true,
      hasTime: true,
    };
  }

  const range = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:-|–|—|\bto\b)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i.exec(value);
  if (range) {
    const startHour = Number(range[1]);
    const startMinute = Number(range[2] ?? 0);
    const endHour = Number(range[4]);
    const endMinute = Number(range[5] ?? 0);
    if (startHour <= 23 && endHour <= 23 && startMinute <= 59 && endMinute <= 59) {
      const explicitStartPeriod = normalizedPeriod(range[3]);
      const explicitEndPeriod = normalizedPeriod(range[6]);
      let startPeriod = explicitStartPeriod;
      let endPeriod = explicitEndPeriod;

      if (!startPeriod && endPeriod) {
        startPeriod = endPeriod === "PM" && startHour > endHour ? "AM" : endPeriod;
      }
      if (!startPeriod) startPeriod = inferredPeriod(startHour);
      if (!endPeriod) {
        endPeriod = startPeriod === "AM" && endHour <= startHour ? "PM" : startPeriod;
      }

      const startMinutes = clockMinutes(startHour, startMinute, startPeriod);
      let endMinutes = clockMinutes(endHour, endMinute, endPeriod);
      if (endMinutes <= startMinutes) endMinutes += MINUTES_PER_DAY;
      return {
        startsAt: dayStart + startMinutes,
        endsAt: dayStart + endMinutes,
        allDay: false,
        hasTime: true,
      };
    }
  }

  const singleTime = /\b(\d{1,2})(?::(\d{2}))\s*(a\.?m\.?|p\.?m\.?)?\b/i.exec(value)
    ?? /\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(value);
  if (singleTime) {
    const hour = Number(singleTime[1]);
    const minute = Number(singleTime[2] && /^\d+$/.test(singleTime[2]) ? singleTime[2] : 0);
    const capturedPeriod = singleTime.length > 3 ? singleTime[3] : singleTime[2];
    if (hour <= 23 && minute <= 59) {
      const period = normalizedPeriod(capturedPeriod) || inferredPeriod(hour);
      const startMinutes = clockMinutes(hour, minute, period);
      return {
        startsAt: dayStart + startMinutes,
        endsAt: dayStart + startMinutes + 60,
        allDay: false,
        hasTime: true,
      };
    }
  }

  return {
    startsAt: dayStart,
    endsAt: dayStart + MINUTES_PER_DAY - 1,
    allDay: false,
    hasTime: false,
  };
}

function wallClockMinute(now: Date, timezone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) / 60_000;
}

export function selectLiveTickerItems(
  events: LiveTickerEvent[],
  now: Date,
  timezone: string,
): LiveTickerItem[] {
  const currentMinute = wallClockMinute(now, timezone);
  const windows = events.flatMap((event) => {
    const window = eventWindow(event.date, event.eventTime);
    return window ? [{ ...event, ...window }] : [];
  });

  const live = windows
    .filter((event) => event.hasTime && currentMinute >= event.startsAt && currentMinute <= event.endsAt)
    .sort((left, right) => left.startsAt - right.startsAt || left.title.localeCompare(right.title))
    .map((event) => ({ ...event, status: "live" as const }));
  if (live.length) return live;

  const currentDay = Math.floor(currentMinute / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  const untimedToday = windows
    .filter((event) => !event.hasTime && event.startsAt === currentDay)
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((event) => ({ ...event, status: "today" as const }));
  if (untimedToday.length) return untimedToday;

  const upcoming = windows
    .filter((event) => event.startsAt > currentMinute)
    .sort((left, right) => left.startsAt - right.startsAt || left.title.localeCompare(right.title));
  return upcoming.length ? [{ ...upcoming[0], status: "next" as const }] : [];
}

export function isEventLiveNow(
  event: Pick<LiveTickerEvent, "date" | "eventTime">,
  now: Date,
  timezone: string,
) {
  const window = eventWindow(event.date, event.eventTime);
  if (!window?.hasTime) return false;
  const currentMinute = wallClockMinute(now, timezone);
  return currentMinute >= window.startsAt && currentMinute <= window.endsAt;
}
