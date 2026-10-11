"use client";
import { useMemo, useSyncExternalStore } from "react";
import { CALENDAR_DISPLAY_KEY, defaultCalendarDisplay, normalizeCalendarDisplay, type CalendarDisplay } from "./calendar-display";

const changeEvent = "eventotron-calendar-display-change";
function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === CALENDAR_DISPLAY_KEY || event.key === null) listener(); };
  window.addEventListener(changeEvent, listener);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(changeEvent, listener); window.removeEventListener("storage", onStorage); };
}
function snapshot() {
  try { return localStorage.getItem(CALENDAR_DISPLAY_KEY) ?? ""; } catch { return ""; }
}

export function useCalendarDisplay() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const display = useMemo(() => {
    try { return normalizeCalendarDisplay(raw ? JSON.parse(raw) : defaultCalendarDisplay); } catch { return defaultCalendarDisplay; }
  }, [raw]);
  const update = (patch: Partial<CalendarDisplay>) => {
    let current = defaultCalendarDisplay;
    try { current = normalizeCalendarDisplay(JSON.parse(snapshot() || "{}")); } catch { /* Recover invalid preferences on the next edit. */ }
    localStorage.setItem(CALENDAR_DISPLAY_KEY, JSON.stringify(normalizeCalendarDisplay({ ...current, ...patch })));
    window.dispatchEvent(new Event(changeEvent));
  };
  return { display, update };
}
