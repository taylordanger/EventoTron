"use client";

import Link from "next/link";
import { SuiteChrome } from "./SuiteChrome";
import { EVENT_STORE_KEY } from "./event-context";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

type EventKind = "meeting" | "rental" | "concert" | "camp" | "prep" | "note";

type EventoEvent = {
  id: string;
  title: string;
  date: string;
  kind: EventKind;
  eventTime: string;
  rentalTime: string;
  space: string;
  manager: string;
  contact: string;
  phone: string;
  email: string;
  attendees: number;
  description: string;
  planningNotes: string;
  mod: string;
  vacation: string;
  rentalTotal: number;
  cateringTotal: number;
  discountRate: number;
  deposit: number;
  paymentNotes: string;
  quoteEnteredBy: string;
  requestedItems: string;
};

type CalendarProvider = "google" | "outlook" | "ical" | "work";
type CalendarSource = {
  id: string;
  name: string;
  provider: CalendarProvider;
  url: string;
  enabled: boolean;
  color: string;
  syncMinutes: number;
  lastSynced?: string;
  lastError?: string;
  eventCount?: number;
};
type ImportedCalendarEvent = {
  id: string;
  title: string;
  date: string;
  eventTime: string;
  description: string;
  location: string;
  sourceId: string;
  sourceName: string;
  color: string;
};
type EventoSettings = {
  workspaceName: string;
  timezone: string;
  weekStartsOn: "sunday" | "monday";
  defaultView: "month" | "week";
  showWeekends: boolean;
  autoSave: boolean;
  eventRailWidth: number;
  reportPaper: "letter" | "a4";
  reportIncludeCosts: boolean;
  reportIncludeLayout: boolean;
  calendarSources: CalendarSource[];
};

const SETTINGS_STORE_KEY = "eventotron-settings-v1";
const UI_STORE_KEY = "eventotron-ui-v1";
const defaultSettings: EventoSettings = {
  workspaceName: "EventoTron Operations Suite",
  timezone: "America/Los_Angeles",
  weekStartsOn: "sunday",
  defaultView: "month",
  showWeekends: true,
  autoSave: true,
  eventRailWidth: 390,
  reportPaper: "letter",
  reportIncludeCosts: true,
  reportIncludeLayout: true,
  calendarSources: [],
};
const providerLabels: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  outlook: "Outlook / Microsoft 365",
  ical: "iCal / ICS feed",
  work: "Other work calendar",
};

const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const labels: Record<EventKind, string> = {
  meeting: "Meeting",
  rental: "Rental",
  concert: "Concert",
  camp: "Camp",
  prep: "Prep",
  note: "Note",
};
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const monthShortNames = monthNames.map((month) => month.slice(0, 3).toUpperCase());

const seedEvents: EventoEvent[] = [
  eventSeed("staff-meeting", "Staff Meeting", "2026-08-04", "meeting", "10:00-11:30", "Conference", "Planning notes", "NA", "", 18),
  eventSeed("rotary-aug-5", "Rotary", "2026-08-05", "meeting", "11:30", "Margaret's Room", "", "Jason", "", 35),
  eventSeed("fiber-arts", "Fiber Arts Reception", "2026-08-07", "rental", "5:00-7:00 PM", "Gallery", "Gina's last day", "Day: Jason; Night: Krista with Nara", "", 60),
  eventSeed("isaacs-wedding", "Isaac's Wedding", "2026-08-08", "rental", "11:00 AM-8:00 PM", "Margaret's Room", "", "Heather day and night", "", 120),
  eventSeed("lcsm-aug-9", "LCSM", "2026-08-09", "rental", "10:00 AM-2:00 PM", "Auditorium", "", "Heather with Taylor", "", 90),
  eventSeed("air-force", "Air Force Concert", "2026-08-10", "concert", "7:00 PM", "Auditorium", "", "Day: Serena; Night: Heather", "", 180),
  eventSeed("piano-delivery", "Piano Delivery", "2026-08-11", "prep", "9:00 AM-1:00 PM", "Auditorium", "Tuning in afternoon", "Jason or Nara", "", 4),
  eventSeed("rotary-sbmf", "Rotary / SBMF Rehearsal", "2026-08-12", "meeting", "11:30 / 9:00-5:00", "MMR / Auditorium", "Move Rotary to MMR", "Jason", "Serena fam med./remote", 55),
  eventSeed("sbmf-reception", "SBMF Rehearsal + Reception", "2026-08-13", "concert", "9:00-5:00, 6:30 reception, 7:30-9:30 show", "Theatre seating", "", "Day Nara; Night Jason with Heather backup", "Serena fam med./remote", 160),
  eventSeed("sbmf-rehearsals", "SBMF Rehearsals", "2026-08-14", "concert", "Daytime, 7:30-9:30 show", "Theatre seating", "", "Day Nara; Night Jason", "Serena fam med./remote", 140),
  eventSeed("seating-change", "No SBMF events booked", "2026-08-15", "note", "All day", "Auditorium", "Need to change seating to Cabaret.", "Taylor", "Serena", 0),
  eventSeed("tapas-tunes", "SBMF Tapas & Tunes", "2026-08-16", "concert", "4:30-7:30 meal and music", "Auditorium", "Associated sweep Auditorium PM. Tell Associated to reschedule cleaning to Monday morning?", "Day: Taylor; Night: Jason with Taylor's help", "Serena", 150),
  eventSeed("art-camp-17", "Art Camp", "2026-08-17", "camp", "10:00-3:00", "Classrooms", "", "NA", "", 30),
  eventSeed("art-camp-18", "Art Camp", "2026-08-18", "camp", "10:00-3:00", "Classrooms", "", "NA", "", 30),
  eventSeed("rotary-art-board", "Rotary / Art Camp / Board Meeting", "2026-08-19", "meeting", "11:30 / 10:00-3:00 / 5:30-7:00", "MMR", "Auditorium setup for SBMF; MMR still setup for memorial service.", "Jason", "", 55),
  eventSeed("jazz-concert", "Piano Tuning / Jazz Concert", "2026-08-20", "concert", "Rehearsal day, 7:30-9:30", "Auditorium", "", "Day: Nara; Night: Jason with Taylor", "", 150),
  eventSeed("benefit-dinner", "Benefit Dinner and Concert Prep", "2026-08-21", "concert", "Drinks and Dinner 6PM, 7PM show", "Auditorium", "Art Camp 10-3.", "Day: Serena; Night: Jason with Taylor", "Nara", 200),
  eventSeed("ocean-hates-you", "The Ocean Hates You", "2026-08-23", "concert", "7:00 PM", "Auditorium", "LCSM earlier in day.", "Day: Taylor; Night: Jason", "", 130),
  eventSeed("art-camp-24", "Art Camp", "2026-08-24", "camp", "10:00-3:00", "Classrooms", "", "NA", "Nara", 30),
  eventSeed("art-camp-25", "Art Camp", "2026-08-25", "camp", "10:00-3:00", "Classrooms", "", "NA", "Serena", 30),
  eventSeed("rotary-art-26", "Rotary / Art Camp", "2026-08-26", "meeting", "11:30 / 10:00-3:00", "MMR / Classrooms", "", "Jason", "Serena", 55),
];

function eventSeed(
  id: string,
  title: string,
  date: string,
  kind: EventKind,
  eventTime: string,
  space: string,
  planningNotes: string,
  mod: string,
  vacation: string,
  attendees: number,
): EventoEvent {
  return {
    id,
    title,
    date,
    kind,
    eventTime,
    rentalTime: eventTime,
    space,
    manager: mod.split(";")[0]?.replace(/^Day:\s*/i, "") || "Heather",
    contact: "",
    phone: "",
    email: "",
    attendees,
    description: planningNotes || title,
    planningNotes,
    mod,
    vacation,
    rentalTotal: attendees ? 240 : 0,
    cateringTotal: 0,
    discountRate: 0,
    deposit: attendees ? 100 : 0,
  paymentNotes: "",
  quoteEnteredBy: "Jason",
    requestedItems: "6 FT ROUND TABLES, CHAIRS",
  };
}

export default function Home() {
  const [events, setEvents] = useState<EventoEvent[]>(seedEvents);
  const [selectedId, setSelectedId] = useState(seedEvents[1].id);
  const [openIds, setOpenIds] = useState<string[]>([
    seedEvents[1].id,
    seedEvents[2].id,
    seedEvents[15].id,
  ]);
  const [loaded, setLoaded] = useState(false);
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(7);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<EventoSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [railWidth, setRailWidth] = useState(defaultSettings.eventRailWidth);
  const [calendarFeedEvents, setCalendarFeedEvents] = useState<ImportedCalendarEvent[]>([]);
  const [calendarSyncing, setCalendarSyncing] = useState<Record<string, boolean>>({});
  const [eventSaveStatus, setEventSaveStatus] = useState("LOCAL READY");
  const [eventBackendChecked, setEventBackendChecked] = useState(false);
  const hadLocalEventsOnBoot = useRef(true);
  const selected = events.find((event) => event.id === selectedId) ?? events[0];

  useEffect(() => {
    const raw = localStorage.getItem("eventotron-events-v1");
    hadLocalEventsOnBoot.current = Boolean(raw);
    const timer = window.setTimeout(() => {
      try {
        const restored = raw ? JSON.parse(raw) as {
          events?: EventoEvent[];
          selectedId?: string;
          openIds?: string[];
          calendarYear?: number;
          calendarMonth?: number;
        } : null;
        if (restored && Array.isArray(restored.events) && restored.events.length) {
          const restoredEvents = restored.events.map((event) => ({
            ...event,
            requestedItems: event.requestedItems ?? "6 FT ROUND TABLES, CHAIRS",
          }));
          setEvents(restoredEvents);
          setSelectedId(restored.selectedId ?? restoredEvents[0].id);
          setOpenIds(restored.openIds?.length ? restored.openIds : [restoredEvents[0].id]);
          const restoredSelected = restoredEvents.find((event) => event.id === (restored.selectedId ?? restoredEvents[0].id));
          const restoredDate = restoredSelected?.date.split("-").map(Number) ?? [];
          setCalendarYear(restored.calendarYear ?? restoredDate[0] ?? 2026);
          setCalendarMonth(restored.calendarMonth ?? ((restoredDate[1] ?? 8) - 1));
        }
        setLoaded(true);
      } catch {}
      setEventBackendChecked(Boolean(raw));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!hadLocalEventsOnBoot.current && !eventBackendChecked) return;
    const payload = { events, selectedId, openIds, calendarYear, calendarMonth };
    localStorage.setItem(EVENT_STORE_KEY, JSON.stringify(payload));
    if (settingsLoaded && !settings.autoSave) return;
    const timer = window.setTimeout(() => {
      setEventSaveStatus("SAVING");
      fetch("/api/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Event database save failed");
          setEventSaveStatus("SAVED");
        })
        .catch(() => setEventSaveStatus("LOCAL ONLY"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [events, selectedId, openIds, calendarYear, calendarMonth, loaded, settings.autoSave, settingsLoaded, eventBackendChecked]);

  useEffect(() => {
    if (!loaded || hadLocalEventsOnBoot.current) return;
    const controller = new AbortController();
    fetch("/api/events", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((restored: {
        events?: EventoEvent[];
        selectedId?: string;
        openIds?: string[];
        calendarYear?: number;
        calendarMonth?: number;
      } | null) => {
        if (!restored?.events?.length) return;
        const restoredEvents = restored.events.map((event) => ({
          ...event,
          requestedItems: event.requestedItems ?? "6 FT ROUND TABLES, CHAIRS",
        }));
        setEvents(restoredEvents);
        setSelectedId(restored.selectedId ?? restoredEvents[0].id);
        setOpenIds(restored.openIds?.length ? restored.openIds : [restoredEvents[0].id]);
        const restoredSelected = restoredEvents.find((event) => event.id === (restored.selectedId ?? restoredEvents[0].id));
        const restoredDate = restoredSelected?.date.split("-").map(Number) ?? [];
        setCalendarYear(restored.calendarYear ?? restoredDate[0] ?? 2026);
        setCalendarMonth(restored.calendarMonth ?? ((restoredDate[1] ?? 8) - 1));
        setEventSaveStatus("DATABASE READY");
      })
      .catch(() => {})
      .finally(() => setEventBackendChecked(true));
    return () => controller.abort();
  }, [loaded]);

  useEffect(() => {
    const rawSettings = localStorage.getItem(SETTINGS_STORE_KEY);
    const rawUi = localStorage.getItem(UI_STORE_KEY);
    const rawCalendarEvents = localStorage.getItem("eventotron-calendar-events-v1");
    const timer = window.setTimeout(() => {
      try {
        const restoredSettings = rawSettings ? JSON.parse(rawSettings) as Partial<EventoSettings> : {};
        const restoredUi = rawUi ? JSON.parse(rawUi) as { railWidth?: number } : {};
        const nextSettings = {
          ...defaultSettings,
          ...restoredSettings,
          calendarSources: Array.isArray(restoredSettings.calendarSources)
            ? restoredSettings.calendarSources
            : [],
        };
        setSettings(nextSettings);
        setRailWidth(Math.max(280, Math.min(620, restoredUi.railWidth ?? nextSettings.eventRailWidth)));
        const restoredCalendarEvents = rawCalendarEvents ? JSON.parse(rawCalendarEvents) as ImportedCalendarEvent[] : [];
        setCalendarFeedEvents(Array.isArray(restoredCalendarEvents) ? restoredCalendarEvents : []);
      } catch {}
      setSettingsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(settings));
  }, [settings, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) return;
    localStorage.setItem(UI_STORE_KEY, JSON.stringify({ railWidth }));
  }, [railWidth, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded) return;
    localStorage.setItem("eventotron-calendar-events-v1", JSON.stringify(calendarFeedEvents));
  }, [calendarFeedEvents, settingsLoaded]);

  const days = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const monthLength = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: (number | null)[] = Array.from({ length: firstDay }, () => null);
    for (let day = 1; day <= monthLength; day++) cells.push(day);
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [calendarYear, calendarMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<number, Array<EventoEvent | ImportedCalendarEvent>>();
    const prefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-`;
    events.filter((event) => event.date.startsWith(prefix)).forEach((event) => {
      const day = Number(event.date.slice(-2));
      map.set(day, [...(map.get(day) ?? []), event]);
    });
    calendarFeedEvents.filter((event) => event.date.startsWith(prefix)).forEach((event) => {
      const day = Number(event.date.slice(-2));
      map.set(day, [...(map.get(day) ?? []), event]);
    });
    return map;
  }, [events, calendarFeedEvents, calendarYear, calendarMonth]);

  async function save() {
    const payload = { events, selectedId, openIds, calendarYear, calendarMonth };
    localStorage.setItem(EVENT_STORE_KEY, JSON.stringify(payload));
    setEventSaveStatus("SAVING");
    try {
      const response = await fetch("/api/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("Event database save failed");
      setEventSaveStatus("SAVED");
    } catch {
      setEventSaveStatus("LOCAL ONLY");
    }
  }

  function openEvent(event: EventoEvent) {
    setSelectedId(event.id);
    setInfoExpanded(false);
    const [year, month] = event.date.split("-").map(Number);
    if (year && month) {
      setCalendarYear(year);
      setCalendarMonth(month - 1);
    }
    setOpenIds((ids) => [event.id, ...ids.filter((id) => id !== event.id)].slice(0, 8));
  }

  function updateSelected(patch: Partial<EventoEvent>) {
    setEvents((items) =>
      items.map((event) => (event.id === selected.id ? { ...event, ...patch } : event)),
    );
  }

  function updateSettings(patch: Partial<EventoSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function addCalendarSource() {
    const source: CalendarSource = {
      id: `calendar_${uid()}`,
      name: "New work calendar",
      provider: "ical",
      url: "",
      enabled: true,
      color: "#75ff47",
      syncMinutes: 15,
    };
    setSettings((current) => ({ ...current, calendarSources: [...current.calendarSources, source] }));
  }

  function updateCalendarSource(id: string, patch: Partial<CalendarSource>) {
    setSettings((current) => ({
      ...current,
      calendarSources: current.calendarSources.map((source) =>
        source.id === id ? { ...source, ...patch } : source,
      ),
    }));
  }

  function removeCalendarSource(id: string) {
    setSettings((current) => ({
      ...current,
      calendarSources: current.calendarSources.filter((source) => source.id !== id),
    }));
    setCalendarFeedEvents((current) => current.filter((event) => event.sourceId !== id));
  }

  async function syncCalendarSource(source: CalendarSource) {
    if (!source.url) {
      updateCalendarSource(source.id, { lastError: "Add a feed URL first." });
      return;
    }
    setCalendarSyncing((current) => ({ ...current, [source.id]: true }));
    try {
      const response = await fetch("/api/calendar-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: source.url }),
      });
      const result = await response.json() as { events?: Omit<ImportedCalendarEvent, "sourceId" | "sourceName" | "color">[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Calendar feed could not be read");
      const imported = (result.events ?? []).map((event) => ({
        ...event,
        sourceId: source.id,
        sourceName: source.name,
        color: source.color,
      }));
      setCalendarFeedEvents((current) => [...current.filter((event) => event.sourceId !== source.id), ...imported]);
      updateCalendarSource(source.id, { lastSynced: new Date().toISOString(), lastError: "", eventCount: imported.length });
    } catch (error) {
      updateCalendarSource(source.id, { lastError: error instanceof Error ? error.message : "Calendar feed could not be read" });
    } finally {
      setCalendarSyncing((current) => ({ ...current, [source.id]: false }));
    }
  }

  function adjustRail(delta: number) {
    setRailWidth((width) => Math.max(280, Math.min(620, width + delta)));
  }

  function resizeRail(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = railWidth;
    const move = (nextEvent: PointerEvent) => {
      setRailWidth(Math.max(280, Math.min(620, startWidth + nextEvent.clientX - startX)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function addEvent(day?: number) {
    const monthLength = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const created = eventSeed(
      `event_${uid()}`,
      "New Event",
      `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(Math.min(day ?? 1, monthLength)).padStart(2, "0")}`,
      "rental",
      "9:00 AM-12:00 PM",
      "Margaret's Room",
      "",
      "Heather",
      "",
      25,
    );
    setEvents((items) => [...items, created]);
    openEvent(created);
  }

  const finalPrice =
    selected.rentalTotal +
    selected.cateringTotal -
    Math.round(selected.rentalTotal * (selected.discountRate / 100));
  const currentMonthLabel = monthNames[calendarMonth];
  const setMonth = (month: number) => setCalendarMonth(Math.max(0, Math.min(11, month)));
  const shiftYear = (amount: number) => setCalendarYear((year) => Math.max(1900, Math.min(2200, year + amount)));

  return (
    <main className="eventotron-desktop">
      <div className="eventotron-ribbon-row">
        <SuiteChrome active="calendar" eventId={selected.id} />
        <button onClick={() => void save()}>{eventSaveStatus}</button>
        <button className="primary" onClick={() => addEvent(new Date().getDate())}>
          NEW EVENT
        </button>
        <button onClick={() => setSettingsOpen(true)}>SETTINGS</button>
      </div>

      <section
        className="eventotron-workbench"
        style={{ "--event-rail-width": `${railWidth}px` } as CSSProperties}
      >
        <aside className="event-stack">
          <div className="stack-title">
            <span>OPEN EVENT FILES</span>
            <b>{String(openIds.length).padStart(2, "0")}</b>
          </div>
          {openIds.map((id) => {
            const event = events.find((item) => item.id === id);
            if (!event) return null;
            return (
              <button
                className={`vertical-file ${event.id === selected.id ? "active" : ""} ${event.kind}`}
                key={event.id}
                onClick={() => openEvent(event)}
              >
                <small>{event.date.slice(5)}</small>
                <b>{event.title}</b>
              </button>
            );
          })}
          <button className="active-event-tab" onClick={() => setInfoExpanded(false)}>
            <small>ACTIVE EVENT FILE</small>
            <strong>{selected.title}</strong>
            <span>{selected.date} · {selected.eventTime}</span>
            <span>{selected.space}</span>
            <em>THIS EVENT FOLLOWS YOU THROUGH THE SUITE TABS</em>
          </button>
        </aside>

        <div
          className="event-rail-resizer"
          role="separator"
          tabIndex={0}
          aria-label="Resize event workspace"
          aria-valuemin={280}
          aria-valuemax={620}
          aria-valuenow={railWidth}
          onPointerDown={resizeRail}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") adjustRail(-20);
            if (event.key === "ArrowRight") adjustRail(20);
          }}
        />

        <section className="calendar-panel">
          <div className="calendar-title">
            <div>
              <small>EVENTOTRON MAIN CALENDAR</small>
              <h1>{currentMonthLabel} {calendarYear} All Staff Schedule</h1>
            </div>
            <div className="calendar-legend">
              {Object.entries(labels).map(([kind, label]) => (
                <span className={`legend-dot ${kind}`} key={kind}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="calendar-month-tabs" role="tablist" aria-label="Calendar months">
            <button className="year-step" aria-label="Previous year" onClick={() => shiftYear(-1)}>‹</button>
            <label className="calendar-year-input">
              <small>YEAR</small>
              <input
                type="number"
                min="1900"
                max="2200"
                value={calendarYear}
                aria-label="Calendar year"
                onChange={(e) => setCalendarYear(Math.max(1900, Math.min(2200, Number(e.target.value) || 2026)))}
              />
            </label>
            <button className="year-step" aria-label="Next year" onClick={() => shiftYear(1)}>›</button>
            <div className="month-tab-strip">
              {monthShortNames.map((month, index) => (
                <button
                  className={`month-tab ${index === calendarMonth ? "active" : ""}`}
                  role="tab"
                  aria-selected={index === calendarMonth}
                  key={month}
                  onClick={() => setMonth(index)}
                >
                  {month}
                </button>
              ))}
            </div>
          </div>
          <div className="month-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div className="weekday" key={day}>
                {day}
              </div>
            ))}
            {days.map((day, index) => (
              <div className={`day-cell ${day ? "" : "blank"}`} key={`${day}-${index}`}>
                {day && (
                  <>
                    <button className="day-number" onClick={() => addEvent(day)}>
                      {day}
                    </button>
                    <div className="day-events">
                      {(eventsByDay.get(day) ?? []).map((event) => {
                        const imported = "sourceId" in event;
                        return (
                          <button
                            className={`calendar-event ${imported ? "external" : event.kind} ${!imported && event.id === selected.id ? "active" : ""}`}
                            key={`${imported ? event.sourceId : "event"}-${event.id}`}
                            onClick={() => { if (!imported) openEvent(event); }}
                            style={imported ? { borderColor: event.color, color: event.color } : undefined}
                            title={imported ? `${event.sourceName}${event.location ? ` · ${event.location}` : ""}` : undefined}
                          >
                            <b>{event.title}</b>
                            <small>{event.eventTime}</small>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className={`event-info-sheet ${infoExpanded ? "expanded" : "compact"}`}>
          <div className="sheet-header">
            <div>
              <small>INFORMATION TAB</small>
              <b>{selected.title}</b>
            </div>
            <div className="sheet-actions">
              <Link href={`/master-report?event=${encodeURIComponent(selected.id)}`}>MASTER REPORT</Link>
              <button onClick={() => setInfoExpanded((expanded) => !expanded)}>
                {infoExpanded ? "COLLAPSE" : "EXPAND"}
              </button>
            </div>
          </div>
          {!infoExpanded ? (
            <div className="sheet-preview">
              <div className="sheet-preview-grid">
                <div><small>DATE</small><b>{selected.date || "Not set"}</b></div>
                <div><small>EVENT TIME</small><b>{selected.eventTime || "Not set"}</b></div>
                <div><small>SPACE</small><b>{selected.space || "Not assigned"}</b></div>
                <div><small>ATTENDEES</small><b>{selected.attendees || 0}</b></div>
                <div><small>CONTACT</small><b>{selected.contact || "Not entered"}</b></div>
                <div><small>MANAGER</small><b>{selected.manager || "Not assigned"}</b></div>
              </div>
              <p>{selected.description || "No event description entered."}</p>
              <em>Use EXPAND to edit the full information sheet.</em>
            </div>
          ) : (
          <div className="sheet-grid">
            <label className="wide">
              <span>Event Date Requested</span>
              <input
                type="date"
                value={selected.date}
                onChange={(e) => updateSelected({ date: e.target.value })}
              />
            </label>
            <label className="wide">
              <span>Name of Event / Group</span>
              <input
                value={selected.title}
                onChange={(e) => updateSelected({ title: e.target.value })}
              />
            </label>
            <label>
              <span>Contact Name</span>
              <input
                value={selected.contact}
                onChange={(e) => updateSelected({ contact: e.target.value })}
              />
            </label>
            <label>
              <span>Phone Number</span>
              <input
                value={selected.phone}
                onChange={(e) => updateSelected({ phone: e.target.value })}
              />
            </label>
            <label className="wide">
              <span>E-Mail Address</span>
              <input
                value={selected.email}
                onChange={(e) => updateSelected({ email: e.target.value })}
              />
            </label>
            <label>
              <span>Rental Time</span>
              <input
                value={selected.rentalTime}
                onChange={(e) => updateSelected({ rentalTime: e.target.value })}
              />
            </label>
            <label>
              <span>Event Time</span>
              <input
                value={selected.eventTime}
                onChange={(e) => updateSelected({ eventTime: e.target.value })}
              />
            </label>
            <label>
              <span>Main Space</span>
              <input
                value={selected.space}
                onChange={(e) => updateSelected({ space: e.target.value })}
              />
            </label>
            <label>
              <span>Event Manager</span>
              <input
                value={selected.manager}
                onChange={(e) => updateSelected({ manager: e.target.value })}
              />
            </label>
            <label>
              <span>Estimated Number</span>
              <input
                type="number"
                min="0"
                value={selected.attendees}
                onChange={(e) => updateSelected({ attendees: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Event Type</span>
              <select
                value={selected.kind}
                onChange={(e) => updateSelected({ kind: e.target.value as EventKind })}
              >
                {Object.entries(labels).map(([kind, label]) => (
                  <option value={kind} key={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide description">
              <span>Description of Event</span>
              <textarea
                value={selected.description}
                onChange={(e) => updateSelected({ description: e.target.value })}
              />
            </label>
            <label className="wide">
              <span>Requested Tables / Equipment</span>
              <input
                value={selected.requestedItems}
                onChange={(e) => updateSelected({ requestedItems: e.target.value })}
                placeholder="6 FT ROUND TABLES, CHAIRS, PODIUM"
              />
            </label>
            <label>
              <span>Planning Notes</span>
              <textarea
                value={selected.planningNotes}
                onChange={(e) => updateSelected({ planningNotes: e.target.value })}
              />
            </label>
            <label>
              <span>Planned MOD</span>
              <textarea
                value={selected.mod}
                onChange={(e) => updateSelected({ mod: e.target.value })}
              />
            </label>
            <label>
              <span>Vacation / Team</span>
              <textarea
                value={selected.vacation}
                onChange={(e) => updateSelected({ vacation: e.target.value })}
              />
            </label>
            <div className="price-box wide">
              <div>
                <span>Rental Expenses</span>
                <input
                  type="number"
                  value={selected.rentalTotal}
                  onChange={(e) => updateSelected({ rentalTotal: Number(e.target.value) })}
                />
              </div>
              <div>
                <span>Catering Expenses</span>
                <input
                  type="number"
                  value={selected.cateringTotal}
                  onChange={(e) => updateSelected({ cateringTotal: Number(e.target.value) })}
                />
              </div>
              <div>
                <span>Discount Rate</span>
                <input
                  type="number"
                  value={selected.discountRate}
                  onChange={(e) => updateSelected({ discountRate: Number(e.target.value) })}
                />
              </div>
              <div>
                <span>Deposit</span>
                <input
                  type="number"
                  value={selected.deposit}
                  onChange={(e) => updateSelected({ deposit: Number(e.target.value) })}
                />
              </div>
              <strong>Final Price {money(finalPrice)}</strong>
            </div>
            <label className="wide">
              <span>Payment Notes</span>
              <textarea
                value={selected.paymentNotes}
                onChange={(e) => updateSelected({ paymentNotes: e.target.value })}
              />
            </label>
            <label>
              <span>Quote Entered By</span>
              <input
                value={selected.quoteEnteredBy}
                onChange={(e) => updateSelected({ quoteEnteredBy: e.target.value })}
              />
            </label>
          </div>
          )}
        </aside>
      </section>

      {settingsOpen && (
        <div className="settings-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSettingsOpen(false);
        }}>
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <header className="settings-header">
              <div>
                <small>EVENTOTRON // WORKSPACE SETTINGS</small>
                <h2 id="settings-title">Settings</h2>
                <p>Shape the suite around your venue, calendars, and printed workflow.</p>
              </div>
              <button aria-label="Close settings" onClick={() => setSettingsOpen(false)}>×</button>
            </header>

            <div className="settings-layout">
              <section className="settings-card">
                <div className="settings-card-heading"><span>01</span><h3>Workspace</h3></div>
                <label className="settings-field wide">
                  <span>Workspace name</span>
                  <input value={settings.workspaceName} onChange={(event) => updateSettings({ workspaceName: event.target.value })} />
                </label>
                <div className="settings-two-up">
                  <label className="settings-field">
                    <span>Time zone</span>
                    <select value={settings.timezone} onChange={(event) => updateSettings({ timezone: event.target.value })}>
                      <option value="America/Los_Angeles">Pacific</option>
                      <option value="America/Denver">Mountain</option>
                      <option value="America/Chicago">Central</option>
                      <option value="America/New_York">Eastern</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Week starts on</span>
                    <select value={settings.weekStartsOn} onChange={(event) => updateSettings({ weekStartsOn: event.target.value as EventoSettings["weekStartsOn"] })}>
                      <option value="sunday">Sunday</option>
                      <option value="monday">Monday</option>
                    </select>
                  </label>
                </div>
                <div className="settings-two-up">
                  <label className="settings-field">
                    <span>Default calendar view</span>
                    <select value={settings.defaultView} onChange={(event) => updateSettings({ defaultView: event.target.value as EventoSettings["defaultView"] })}>
                      <option value="month">Month</option>
                      <option value="week">Week</option>
                    </select>
                  </label>
                  <label className="settings-field">
                    <span>Event rail width</span>
                    <input type="range" min="280" max="620" step="10" value={railWidth} onChange={(event) => setRailWidth(Number(event.target.value))} />
                    <output>{railWidth}px</output>
                  </label>
                </div>
                <label className="settings-check"><input type="checkbox" checked={settings.showWeekends} onChange={(event) => updateSettings({ showWeekends: event.target.checked })} /><span>Show weekends on the calendar</span></label>
                <label className="settings-check"><input type="checkbox" checked={settings.autoSave} onChange={(event) => updateSettings({ autoSave: event.target.checked })} /><span>Save event edits automatically on this device</span></label>
              </section>

              <section className="settings-card settings-calendar-card">
                <div className="settings-card-heading"><span>02</span><h3>Calendar Connections</h3><button onClick={addCalendarSource}>＋ ADD CALENDAR</button></div>
                <p className="settings-note">Add Google, Outlook, iCal, or another work calendar. Public and private ICS feed URLs can be stored locally; account sign-in and OAuth credentials can be connected when the suite backend is enabled.</p>
                {settings.calendarSources.length ? settings.calendarSources.map((source) => (
                  <div className="calendar-source" key={source.id}>
                    <div className="calendar-source-topline">
                      <span className="calendar-source-swatch" style={{ background: source.color }} />
                      <input value={source.name} aria-label="Calendar name" onChange={(event) => updateCalendarSource(source.id, { name: event.target.value })} />
                      <label className="settings-check compact-check"><input type="checkbox" checked={source.enabled} onChange={(event) => updateCalendarSource(source.id, { enabled: event.target.checked })} /><span>SHOW</span></label>
                      <button aria-label={`Remove ${source.name}`} onClick={() => removeCalendarSource(source.id)}>REMOVE</button>
                    </div>
                    <div className="settings-two-up">
                      <label className="settings-field"><span>Provider</span><select value={source.provider} onChange={(event) => updateCalendarSource(source.id, { provider: event.target.value as CalendarProvider })}>{Object.entries(providerLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                      <label className="settings-field"><span>Color</span><input type="color" value={source.color} onChange={(event) => updateCalendarSource(source.id, { color: event.target.value })} /></label>
                    </div>
                    <label className="settings-field wide"><span>{source.provider === "ical" ? "ICS feed URL" : "Calendar connection URL or account"}</span><input placeholder={source.provider === "ical" ? "https://.../calendar.ics" : "Connect account or paste a feed URL"} value={source.url} onChange={(event) => updateCalendarSource(source.id, { url: event.target.value })} /></label>
                    <div className="calendar-source-footer"><span>{providerLabels[source.provider]}</span><span>{source.lastError || (source.eventCount ? `${source.eventCount} EVENTS` : source.url ? "FEED READY" : "SETUP NEEDED")}</span><label>SYNC <select value={source.syncMinutes} onChange={(event) => updateCalendarSource(source.id, { syncMinutes: Number(event.target.value) })}><option value="5">5 MIN</option><option value="15">15 MIN</option><option value="30">30 MIN</option><option value="60">60 MIN</option></select></label><button className="calendar-sync-button" disabled={Boolean(calendarSyncing[source.id])} onClick={() => syncCalendarSource(source)}>{calendarSyncing[source.id] ? "SYNCING" : "SYNC NOW"}</button></div>
                  </div>
                )) : <div className="settings-empty">No external calendars connected yet. Add one to configure its display color, visibility, and sync interval.</div>}
              </section>

              <section className="settings-card">
                <div className="settings-card-heading"><span>03</span><h3>Reports and Print</h3></div>
                <label className="settings-field"><span>Paper size</span><select value={settings.reportPaper} onChange={(event) => updateSettings({ reportPaper: event.target.value as EventoSettings["reportPaper"] })}><option value="letter">Letter</option><option value="a4">A4</option></select></label>
                <label className="settings-check"><input type="checkbox" checked={settings.reportIncludeCosts} onChange={(event) => updateSettings({ reportIncludeCosts: event.target.checked })} /><span>Include rental, catering, and grocery costs</span></label>
                <label className="settings-check"><input type="checkbox" checked={settings.reportIncludeLayout} onChange={(event) => updateSettings({ reportIncludeLayout: event.target.checked })} /><span>Include the Tabletron room layout picture</span></label>
                <div className="settings-note settings-callout">The Master Report always follows the active event. Its print view is formatted for a clipboard, room setup, shopping trip, or client conversation.</div>
              </section>

              <section className="settings-card">
                <div className="settings-card-heading"><span>04</span><h3>Interface</h3></div>
                <div className="settings-note settings-callout">Drag the vertical rail handle beside the event files, or use the width control above. The width is saved locally with this workspace.</div>
                <button className="settings-reset" onClick={() => { setSettings(defaultSettings); setRailWidth(defaultSettings.eventRailWidth); }}>RESET LOCAL SETTINGS</button>
              </section>
            </div>
            <footer className="settings-footer"><span>LOCAL WORKSPACE SETTINGS</span><button className="primary" onClick={() => setSettingsOpen(false)}>DONE</button></footer>
          </section>
        </div>
      )}
    </main>
  );
}
