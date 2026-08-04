"use client";

import Link from "next/link";
import { SuiteChrome } from "./SuiteChrome";
import { EVENT_STORE_KEY } from "./event-context";
import {
  defaultSuiteSettings,
  extractGoogleCalendarIds,
  googleCalendarFeedUrl,
  googleCalendarName,
  mergeSuiteSettings,
  type OperationsTemplate,
} from "./suite-settings";
import { useEffect, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

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
  operationsTemplateId?: string;
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
  externalId?: string;
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
  operationsTemplates: OperationsTemplate[];
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
  operationsTemplates: defaultSuiteSettings.operationsTemplates,
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

function templateKind(template: OperationsTemplate): EventKind {
  if (template.category === "maintenance" || template.category === "food") return "prep";
  if (template.category === "volunteer") return "note";
  if (template.category === "contract") return "rental";
  if (template.name.toLowerCase().includes("concert")) return "concert";
  return "meeting";
}

function templateRequestedItems(template: OperationsTemplate) {
  const name = template.name.toLowerCase();
  if (name.includes("rotary")) return "6 FT ROUND TABLES, CHAIRS, BLACK TABLECLOTHS, PODIUM, WATER GLASSES, COFFEE STATION, WRAPPED FLATWARE";
  if (name.includes("concert")) return "GREEN ROOM HOSPITALITY, CASH BAGS, GUEST LIST, ANNOUNCEMENT TEMPLATE, BAR / CONCESSIONS";
  if (name.includes("market")) return "TRASH BAGS, MARKET CART, ATTENDANCE LOG, CERAMICS STUDIO WARNING";
  if (name.includes("kitchen")) return "DISH RACK, TRASH LINERS, MOP, LAUNDRY BAG, SANITIZER";
  if (name.includes("maintenance")) return "CONTRACTOR NOTES, DUE DATE, COMPLETION DATE, COST, FOLLOW-UP";
  return template.checklist.map((item) => item.split(",")[0]).slice(0, 4).join(", ").toUpperCase();
}

function operationsTemplatePatch(template: OperationsTemplate): Partial<EventoEvent> {
  return {
    kind: templateKind(template),
    operationsTemplateId: template.id,
    description: template.summary,
    planningNotes: [template.summary, "", ...template.checklist.map((item) => `- ${item}`)].join("\n"),
    requestedItems: templateRequestedItems(template),
  };
}
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

const emptySelectedEvent: EventoEvent = {
  id: "",
  title: "No active event",
  date: "",
  kind: "note",
  eventTime: "",
  rentalTime: "",
  space: "",
  manager: "",
  contact: "",
  phone: "",
  email: "",
  attendees: 0,
  description: "",
  planningNotes: "",
  mod: "",
  vacation: "",
  rentalTotal: 0,
  cateringTotal: 0,
  discountRate: 0,
  deposit: 0,
  paymentNotes: "",
  quoteEnteredBy: "",
  requestedItems: "",
};

export default function Home() {
  const [events, setEvents] = useState<EventoEvent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [calendarYear, setCalendarYear] = useState(2026);
  const [calendarMonth, setCalendarMonth] = useState(7);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<EventoSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [railWidth, setRailWidth] = useState(defaultSettings.eventRailWidth);
  const [newEventTemplateId, setNewEventTemplateId] = useState("");
  const [calendarImportUrl, setCalendarImportUrl] = useState("");
  const [calendarFeedEvents, setCalendarFeedEvents] = useState<ImportedCalendarEvent[]>([]);
  const [calendarSyncing, setCalendarSyncing] = useState<Record<string, boolean>>({});
  const [eventSaveStatus, setEventSaveStatus] = useState("LOCAL READY");
  const [eventBackendChecked, setEventBackendChecked] = useState(false);
  const selected = events.find((event) => event.id === selectedId) ?? emptySelectedEvent;
  const hasActiveEvent = Boolean(selected.id);

  useEffect(() => {
    const raw = localStorage.getItem(EVENT_STORE_KEY);
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
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!eventBackendChecked) return;
    const payload = { events, selectedId, openIds, calendarYear, calendarMonth };
    localStorage.setItem(EVENT_STORE_KEY, JSON.stringify(payload));
    if (settingsLoaded && !settings.autoSave) return;
    if (!events.length) {
      setEventSaveStatus("NO EVENT FILES");
      return;
    }
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
    if (!loaded) return;
    const controller = new AbortController();
    fetch("/api/events", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((restored: {
        events?: EventoEvent[];
        selectedId?: string;
        openIds?: string[];
        calendarYear?: number;
        calendarMonth?: number;
        source?: string;
      } | null) => {
        if (!restored || restored.source !== "database") return;
        const restoredEvents = Array.isArray(restored.events) ? restored.events.map((event) => ({
          ...event,
          requestedItems: event.requestedItems ?? "6 FT ROUND TABLES, CHAIRS",
        })) : [];
        const nextSelectedId = restored.selectedId && restoredEvents.some((event) => event.id === restored.selectedId)
          ? restored.selectedId
          : restoredEvents[0]?.id ?? "";
        setEvents(restoredEvents);
        setSelectedId(nextSelectedId);
        setOpenIds(restored.openIds?.filter((id) => restoredEvents.some((event) => event.id === id)) ?? (nextSelectedId ? [nextSelectedId] : []));
        const restoredSelected = restoredEvents.find((event) => event.id === nextSelectedId);
        const restoredDate = restoredSelected?.date.split("-").map(Number) ?? [];
        setCalendarYear(restored.calendarYear ?? restoredDate[0] ?? 2026);
        setCalendarMonth(restored.calendarMonth ?? ((restoredDate[1] ?? 8) - 1));
        setEventSaveStatus(restoredEvents.length ? "DATABASE READY" : "NO EVENT FILES");
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
        const mergedSuiteSettings = mergeSuiteSettings(restoredSettings);
        const nextSettings = {
          ...defaultSettings,
          ...mergedSuiteSettings,
          ...restoredSettings,
          operationsTemplates: mergedSuiteSettings.operationsTemplates,
          calendarSources: Array.isArray(restoredSettings.calendarSources)
            ? restoredSettings.calendarSources
            : mergedSuiteSettings.calendarSources,
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

  useEffect(() => {
    if (!settingsLoaded) return;
    const controller = new AbortController();
    fetch("/api/calendar-sources", { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { sources?: CalendarSource[]; events?: ImportedCalendarEvent[] } | null) => {
        if (!result) return;
        const databaseSources = Array.isArray(result.sources) ? result.sources : [];
        const databaseEvents = Array.isArray(result.events) ? result.events : [];
        if (databaseSources.length) {
          setSettings((current) => ({
            ...current,
            calendarSources: [
              ...databaseSources,
              ...current.calendarSources.filter((source) => !databaseSources.some((saved) => saved.id === source.id)),
            ],
          }));
          setCalendarFeedEvents(databaseEvents);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [settingsLoaded]);

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
    const visibleSources = new Set(settings.calendarSources.filter((source) => source.enabled).map((source) => source.id));
    calendarFeedEvents.filter((event) => visibleSources.has(event.sourceId) && event.date.startsWith(prefix)).forEach((event) => {
      const day = Number(event.date.slice(-2));
      map.set(day, [...(map.get(day) ?? []), event]);
    });
    return map;
  }, [events, calendarFeedEvents, calendarYear, calendarMonth, settings.calendarSources]);

  async function save() {
    const payload = { events, selectedId, openIds, calendarYear, calendarMonth };
    localStorage.setItem(EVENT_STORE_KEY, JSON.stringify(payload));
    if (!events.length) {
      setEventSaveStatus("NO EVENT FILES");
      return;
    }
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
    if (!hasActiveEvent) return;
    setEvents((items) =>
      items.map((event) => (event.id === selected.id ? { ...event, ...patch } : event)),
    );
  }

  function applyOperationsTemplate(templateId: string) {
    const template = settings.operationsTemplates.find((item) => item.id === templateId);
    updateSelected(template ? operationsTemplatePatch(template) : { operationsTemplateId: undefined });
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

  function importGoogleCalendarLink() {
    const ids = extractGoogleCalendarIds(calendarImportUrl);
    if (!ids.length) {
      setEventSaveStatus("NO CALENDAR IDS");
      return;
    }
    setSettings((current) => {
      const existing = new Set(current.calendarSources.map((source) => source.url));
      const additions = ids
        .map((calendarId, index) => ({
          id: `calendar_google_${uid()}`,
          name: googleCalendarName(calendarId, index),
          provider: "google" as const,
          url: googleCalendarFeedUrl(calendarId),
          enabled: true,
          color: index % 2 ? "#45caff" : "#75ff47",
          syncMinutes: 15,
        }))
        .filter((source) => !existing.has(source.url));
      if (!additions.length) {
        setEventSaveStatus("CALENDARS ADDED");
        return current;
      }
      setEventSaveStatus(`ADDED ${additions.length} CALENDAR${additions.length === 1 ? "" : "S"}`);
      return { ...current, calendarSources: [...current.calendarSources, ...additions] };
    });
    setCalendarImportUrl("");
  }

  function updateCalendarSource(id: string, patch: Partial<CalendarSource>) {
    setSettings((current) => ({
      ...current,
      calendarSources: current.calendarSources.map((source) =>
        source.id === id ? { ...source, ...patch } : source,
      ),
    }));
    if (patch.color || patch.name) {
      setCalendarFeedEvents((current) => current.map((event) => event.sourceId === id ? {
        ...event,
        color: patch.color ?? event.color,
        sourceName: patch.name ?? event.sourceName,
      } : event));
    }
  }

  function removeCalendarSource(id: string) {
    setSettings((current) => ({
      ...current,
      calendarSources: current.calendarSources.filter((source) => source.id !== id),
    }));
    setCalendarFeedEvents((current) => current.filter((event) => event.sourceId !== id));
    void fetch(`/api/calendar-sources?sourceId=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
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
        body: JSON.stringify({ source }),
      });
      const result = await response.json() as { events?: ImportedCalendarEvent[]; source?: CalendarSource; error?: string };
      if (!response.ok) throw new Error(result.error || "Calendar feed could not be read");
      const imported = result.events ?? [];
      setCalendarFeedEvents((current) => [...current.filter((event) => event.sourceId !== source.id), ...imported]);
      updateCalendarSource(source.id, result.source ?? { lastSynced: new Date().toISOString(), lastError: "", eventCount: imported.length });
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

  function addEvent(day?: number, templateId = newEventTemplateId) {
    const monthLength = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const template = settings.operationsTemplates.find((item) => item.id === templateId);
    const created: EventoEvent = {
      ...eventSeed(
      `event_${uid()}`,
      template?.name ?? "New Event",
      `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(Math.min(day ?? 1, monthLength)).padStart(2, "0")}`,
      template ? templateKind(template) : "rental",
      "9:00 AM-12:00 PM",
      "Margaret's Room",
      "",
      "Heather",
      "",
      25,
      ),
      ...(template ? operationsTemplatePatch(template) : {}),
    };
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
        <SuiteChrome active="calendar" eventId={hasActiveEvent ? selected.id : undefined} />
        <button onClick={() => void save()}>{eventSaveStatus}</button>
        <label className="new-event-template">
          <span>START FROM</span>
          <select value={newEventTemplateId} onChange={(event) => setNewEventTemplateId(event.target.value)}>
            <option value="">Blank event</option>
            {settings.operationsTemplates.map((template) => (
              <option value={template.id} key={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
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
            {hasActiveEvent ? (
              <>
                <strong>{selected.title}</strong>
                <span>{selected.date} · {selected.eventTime}</span>
                <span>{selected.space}</span>
                <em>THIS EVENT FOLLOWS YOU THROUGH THE SUITE TABS</em>
              </>
            ) : (
              <>
                <strong>No active event</strong>
                <span>Calendar feeds are still visible.</span>
                <em>Click NEW EVENT when you want to create a suite event file.</em>
              </>
            )}
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
              {hasActiveEvent ? (
                <Link href={`/master-report?event=${encodeURIComponent(selected.id)}`}>MASTER REPORT</Link>
              ) : (
                <span className="disabled-report-link">MASTER REPORT</span>
              )}
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
            <label className="wide operations-template-field">
              <span>Operations Template</span>
              <select
                value={selected.operationsTemplateId ?? ""}
                onChange={(e) => applyOperationsTemplate(e.target.value)}
              >
                <option value="">No template attached</option>
                {settings.operationsTemplates.map((template) => (
                  <option value={template.id} key={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
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
                <p className="settings-note">Paste a Google Calendar link with one or more calendar IDs, or add Google, Outlook, iCal, or another work calendar manually. Private calendars may still require account sign-in before they can sync events.</p>
                <div className="calendar-import-box">
                  <label className="settings-field wide">
                    <span>Paste Google Calendar link</span>
                    <input
                      value={calendarImportUrl}
                      placeholder="https://calendar.google.com/calendar/u/0/r?cid=..."
                      onChange={(event) => setCalendarImportUrl(event.target.value)}
                    />
                  </label>
                  <button onClick={importGoogleCalendarLink}>IMPORT LINK</button>
                </div>
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
