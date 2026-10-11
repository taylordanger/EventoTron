"use client";

import Link from "next/link";
import { SuiteChrome } from "./SuiteChrome";
import { OperationsTicker } from "./OperationsTicker";
import { EVENT_STORE_KEY } from "./event-context";
import { eventFingerprint, mergeConcurrentEvent } from "./event-concurrency";
import { eventWindow, type LiveTickerEvent, type LiveTickerItem } from "./live-event-ticker";
import { formatRegularTime } from "./time-format";
import { useEventLiveStatus } from "./use-event-live-status";
import {
  defaultSuiteSettings,
  extractGoogleCalendarIds,
  googleCalendarFeedUrl,
  googleCalendarName,
  mergeSuiteSettings,
  type OperationsTemplate,
} from "./suite-settings";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { saveStatusHint, saveStatusTone } from "./save-status";
import { calendarConfiguration } from "./calendar-source-state";
import { useGuardedSave, SaveRecovery } from "./use-guarded-save";
import { venueDateKey } from "./venue-date";
import { CalendarDisplaySettings } from "./CalendarDisplaySettings";
import { calendarDates, calendarDisplayStyle, calendarSourceColor, calendarViews, dateKey } from "./calendar-display";
import { useCalendarDisplay } from "./use-calendar-display";
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
  calendarEventId?: string;
  calendarSourceId?: string;
  calendarSourceName?: string;
  calendarImportedAt?: string;
  revision?: string;
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
  if (template.preset?.event?.requestedItems) return template.preset.event.requestedItems;
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
    ...(template.preset?.event ?? {}),
    kind: templateKind(template),
    operationsTemplateId: template.id,
    description: template.summary,
    planningNotes: [template.summary, "", ...template.checklist.map((item) => `- ${item}`)].join("\n"),
    requestedItems: templateRequestedItems(template),
  };
}

function importedEventKind(event: ImportedCalendarEvent): EventKind {
  const text = `${event.title} ${event.description}`.toLowerCase();
  if (/concert|performance|show|recital|music/.test(text)) return "concert";
  if (/rental|wedding|reception|party/.test(text)) return "rental";
  if (/camp|class|workshop/.test(text)) return "camp";
  if (/prep|setup|delivery|tuning|rehearsal/.test(text)) return "prep";
  return "meeting";
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

function localDayParts(date = new Date(), timezone = defaultSuiteSettings.timezone) {
  const key = venueDateKey(date, timezone);
  const [year, monthNumber, day] = key.split("-").map(Number);
  const month = monthNumber - 1;
  return {
    year,
    month,
    day,
    key,
  };
}

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
  const initialDay = localDayParts();
  const [events, setEvents] = useState<EventoEvent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [calendarYear, setCalendarYear] = useState(initialDay.year);
  const [calendarMonth, setCalendarMonth] = useState(initialDay.month);
  const [calendarDay, setCalendarDay] = useState(initialDay.day);
  const { display: calendarDisplay, update: updateCalendarDisplay } = useCalendarDisplay();
  const [displayError, setDisplayError] = useState("");
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<EventoSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [railWidth, setRailWidth] = useState(defaultSettings.eventRailWidth);
  const [newEventTemplateId, setNewEventTemplateId] = useState("");
  const [calendarImportUrl, setCalendarImportUrl] = useState("");
  const [calendarFeedEvents, setCalendarFeedEvents] = useState<ImportedCalendarEvent[]>([]);
  const [calendarSyncing, setCalendarSyncing] = useState<Record<string, boolean>>({});
  const [eventSaveStatus, setEventSaveStatus] = useState("READY");
  const [eventBackendChecked, setEventBackendChecked] = useState(false);
  const [settingsBackendChecked, setSettingsBackendChecked] = useState(false);
  const [settingsRevision, setSettingsRevision] = useState<string | null | undefined>(undefined);
  const settingsPayload = useMemo(() => ({ ...settings, calendarSources: settings.calendarSources.map(calendarConfiguration) }), [settings]);
  const settingsSave = useGuardedSave<EventoSettings>("/api/settings", settingsPayload, settingsRevision, settingsBackendChecked, setSettings, true);
  const startupDayRef = useRef(initialDay);
  const syncedEventsRef = useRef(new Map<string, { event: EventoEvent; fingerprint: string }>());
  const inFlightEventsRef = useRef(new Set<string>());
  const selected = events.find((event) => event.id === selectedId) ?? emptySelectedEvent;
  const hasActiveEvent = Boolean(selected.id);
  const selectedTemplate = settings.operationsTemplates.find((template) => template.id === selected.operationsTemplateId);
  const selectedIsLive = useEventLiveStatus(hasActiveEvent ? selected : null, settings.timezone);

  const commitServerEvent = useCallback((saved: EventoEvent, capturedFingerprint: string) => {
    syncedEventsRef.current.set(saved.id, {
      event: saved,
      fingerprint: eventFingerprint(saved),
    });
    setEvents((current) => current.map((item) => {
      if (item.id !== saved.id) return item;
      return eventFingerprint(item) === capturedFingerprint
        ? saved
        : { ...item, revision: saved.revision };
    }));
  }, []);

  const persistEvent = useCallback(async (event: EventoEvent): Promise<"saved" | "conflict" | "error" | "busy"> => {
    if (!eventBackendChecked) { setEventSaveStatus("NOT ON SERVER"); return "error"; }
    if (inFlightEventsRef.current.has(event.id)) return "busy";
    inFlightEventsRef.current.add(event.id);
    const capturedFingerprint = eventFingerprint(event);

    try {
      const write = async (candidate: EventoEvent, expectedUpdatedAt: string | null | undefined) => {
        const response = await fetch("/api/events", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: candidate, expectedUpdatedAt }),
        });
        const result = await response.json() as {
          event?: EventoEvent;
          current?: EventoEvent;
          error?: string;
          code?: string;
        };
        return { response, result };
      };

      let { response, result } = await write(event, event.revision);
      if (response.status === 409 && result.current) {
        const base = syncedEventsRef.current.get(event.id)?.event;
        if (!base) {
          setEventSaveStatus("CONFLICT - REVIEW");
          return "conflict";
        }
        const merged = mergeConcurrentEvent(base, event, result.current);
        if (merged.conflictFields.length) {
          setEventSaveStatus(`CONFLICT - ${merged.conflictFields.slice(0, 2).join(" / ").toUpperCase()}`);
          return "conflict";
        }
        ({ response, result } = await write(merged.merged, result.current.revision));
      }

      if (!response.ok || !result.event) throw new Error(result.error || "Event database save failed");
      commitServerEvent(result.event, capturedFingerprint);
      return "saved";
    } catch {
      setEventSaveStatus("NOT ON SERVER");
      return "error";
    } finally {
      inFlightEventsRef.current.delete(event.id);
    }
  }, [commitServerEvent, eventBackendChecked]);

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
          const startupDay = startupDayRef.current;
          setEvents(restoredEvents);
          const restoredOpenIds = Array.isArray(restored.openIds)
            ? restored.openIds.filter((id) => restoredEvents.some((event) => event.id === id))
            : [];
          setSelectedId("");
          setOpenIds(restoredOpenIds);
          setCalendarYear(startupDay.year);
          setCalendarMonth(startupDay.month);
        }
        setLoaded(true);
      } catch { setLoaded(true); }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (!eventBackendChecked) return;
    const payload = { events, selectedId, openIds, calendarYear, calendarMonth };
    localStorage.setItem(EVENT_STORE_KEY, JSON.stringify(payload));
  }, [events, selectedId, openIds, calendarYear, calendarMonth, loaded, eventBackendChecked]);

  useEffect(() => {
    if (!loaded || !eventBackendChecked) return;
    if (settingsLoaded && !settings.autoSave) return;
    if (!events.length) {
      const emptyTimer = window.setTimeout(() => setEventSaveStatus("NO EVENT FILES"), 0);
      return () => window.clearTimeout(emptyTimer);
    }
    const dirtyEvents = events.filter((event) =>
      syncedEventsRef.current.get(event.id)?.fingerprint !== eventFingerprint(event)
      && !inFlightEventsRef.current.has(event.id),
    );
    if (!dirtyEvents.length) return;
    const timer = window.setTimeout(() => {
      setEventSaveStatus("SAVING");
      void Promise.all(dirtyEvents.map((event) => persistEvent(event))).then((results) => {
        if (results.every((result) => result === "saved" || result === "busy")) {
          setEventSaveStatus("SAVED");
        }
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [events, loaded, settings.autoSave, settingsLoaded, eventBackendChecked, persistEvent]);

  useEffect(() => {
    if (!loaded) return;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    const restoreEvents = () => fetch("/api/events", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => { if (!response.ok) throw new Error("Event load failed"); return await response.json() as { events?: EventoEvent[]; selectedId?: string; openIds?: string[]; calendarYear?: number; calendarMonth?: number; source?: string }; })
      .then((restored: {
        events?: EventoEvent[];
        selectedId?: string;
        openIds?: string[];
        calendarYear?: number;
        calendarMonth?: number;
        source?: string;
      } | null) => {
        if (!restored || !Array.isArray(restored.events)) throw new Error("Invalid event response");
        const restoredEvents = Array.isArray(restored.events) ? restored.events.map((event) => ({
          ...event,
          requestedItems: event.requestedItems ?? "6 FT ROUND TABLES, CHAIRS",
        })) : [];
        syncedEventsRef.current = new Map(restoredEvents.map((event) => [
          event.id,
          { event, fingerprint: eventFingerprint(event) },
        ]));
        setEvents(restoredEvents);
        const restoredEventIds = new Set(restoredEvents.map((event) => event.id));
        const startupDay = startupDayRef.current;
        setSelectedId((current) => {
          return (current && restoredEventIds.has(current)
            ? current
            : "");
        });
        setOpenIds((current) => current.filter((id) => restoredEventIds.has(id)));
        setCalendarYear(startupDay.year);
        setCalendarMonth(startupDay.month);
        setEventSaveStatus(restoredEvents.length ? "DATABASE READY" : "NO EVENT FILES");
        setEventBackendChecked(true);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setEventSaveStatus("NOT ON SERVER");
        retryTimer = window.setTimeout(restoreEvents, 15_000);
      });
    void restoreEvents();
    return () => { controller.abort(); window.clearTimeout(retryTimer); };
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
    Promise.all([fetch("/api/settings", { signal: controller.signal, cache: "no-store" }), fetch("/api/calendar-sources", { signal: controller.signal, cache: "no-store" })])
      .then(async ([settingsResponse, calendarResponse]) => {
        if ((!settingsResponse.ok && settingsResponse.status !== 404) || !calendarResponse.ok) throw new Error("Settings load failed");
        const saved = settingsResponse.ok ? await settingsResponse.json() as { payload: Partial<EventoSettings>; updatedAt: string | null } : null;
        const calendars = await calendarResponse.json() as { sources?: CalendarSource[]; events?: ImportedCalendarEvent[] };
        return { ...calendars, settings: saved?.payload, revision: saved?.updatedAt ?? null };
      })
      .then((result: { sources?: CalendarSource[]; events?: ImportedCalendarEvent[]; settings?: Partial<EventoSettings>; revision: string | null } | null) => {
        if (!result) return;
        const databaseSources = Array.isArray(result.sources) ? result.sources : [];
        const databaseEvents = Array.isArray(result.events) ? result.events : [];
        if (Array.isArray(result.sources)) {
          setSettings((current) => {
            const next = { ...current, ...mergeSuiteSettings(result.settings ?? current), calendarSources: databaseSources };
            return next;
          });
          setCalendarFeedEvents(databaseEvents);
          setSettingsRevision(result.revision);
          setSettingsBackendChecked(true);
        }
      })
      .catch(() => { if (!controller.signal.aborted) setEventSaveStatus("SETTINGS NOT ON SERVER"); });
    return () => controller.abort();
  }, [settingsLoaded]);

  const days = useMemo(() => {
    return calendarDates(calendarYear, calendarMonth, calendarDay, calendarDisplay.view, settings.weekStartsOn);
  }, [calendarYear, calendarMonth, calendarDay, calendarDisplay.view, settings.weekStartsOn]);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      document.querySelector(".month-tab.active")?.scrollIntoView({ block: "nearest", inline: "center" });
      const today = startupDayRef.current;
      if (calendarYear === today.year && calendarMonth === today.month) {
        (document.querySelector(".day-cell.today") ?? document.querySelector(".calendar-panel"))?.scrollIntoView({ block: "start", inline: "nearest" });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [calendarFeedEvents.length, calendarMonth, calendarYear, calendarDay, calendarDisplay.view, events.length, loaded]);

  const visibleCalendarSources = useMemo(
    () => settings.calendarSources.filter((source) => source.enabled),
    [settings.calendarSources],
  );

  /**
   * Honour the per-source sync interval.
   *
   * The UI has always offered "SYNC every 5/15/30/60 MIN", but nothing acted on
   * it: feeds refreshed only when somebody pressed SYNC NOW. A workspace could
   * therefore show a fortnight-old schedule while the control implied fifteen
   * minutes, with no error recorded and nothing on screen to suggest the data
   * was stale.
   *
   * Kept deliberately conservative: only enabled sources, only when actually
   * due, only one at a time, and never from a hidden tab — a background tab
   * calling out to Google every quarter of an hour helps nobody.
   */
  const autoSyncRef = useRef<{
    sync: (source: CalendarSource) => Promise<void>;
    syncing: Record<string, boolean>;
    sources: CalendarSource[];
  }>({ sync: async () => {}, syncing: {}, sources: [] });
  // Refreshed after each render rather than during it: writing a ref while
  // rendering is unsafe under concurrent rendering.
  useEffect(() => {
    autoSyncRef.current = {
      sync: syncCalendarSource,
      syncing: calendarSyncing,
      sources: visibleCalendarSources,
    };
  });

  /** Stable identity for the set of feeds, so the sync effect can depend on it. */
  const calendarSourceKey = useMemo(
    () => visibleCalendarSources.map((source) => source.id).join(","),
    [visibleCalendarSources],
  );

  // Failed syncs back off for the source interval, even without a success timestamp.
  const lastSyncAttemptRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!settingsBackendChecked) return;
    let cancelled = false;

    const isDue = (source: CalendarSource) => {
      if (!source.url) return false;
      const everyMs = Math.max(5, Number(source.syncMinutes) || 15) * 60_000;
      const stored = source.lastSynced ? new Date(source.lastSynced).getTime() : 0;
      const attempted = lastSyncAttemptRef.current[source.id] ?? 0;
      const last = Math.max(Number.isFinite(stored) ? stored : 0, attempted);
      if (!last) return true;
      return Date.now() - last >= everyMs;
    };

    const runDueSyncs = async (skipWhenHidden = true) => {
      // The recurring pass skips hidden tabs, but opening the app always
      // refreshes stale feeds — otherwise a tab that starts in the background
      // never syncs at all, which is the behaviour this replaced.
      if (skipWhenHidden && document.hidden) return;
      const { sync, syncing, sources } = autoSyncRef.current;
      for (const source of sources) {
        if (cancelled) return;
        if (syncing[source.id] || !isDue(source)) continue;
        // Recorded before the call so a failing feed is retried on the normal
        // interval rather than on every pass.
        lastSyncAttemptRef.current[source.id] = Date.now();
        // Sequential: two feeds refreshing at once buys nothing and doubles
        // the chance of tripping a rate limit.
        await sync(source);
      }
    };

    void runDueSyncs(false);
    const timer = window.setInterval(() => void runDueSyncs(), 60_000);
    const onVisible = () => {
      if (!document.hidden) void runDueSyncs();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Keyed to the source list: settings load after mount, so an effect that
    // ran only once would find no sources and then skip every later pass in a
    // background tab, syncing nothing at all.
  }, [calendarSourceKey, settingsBackendChecked]);

  const linkedCalendarEventIds = useMemo(
    () => new Set(events.flatMap((event) => event.calendarEventId ? [event.calendarEventId] : [])),
    [events],
  );

  const liveTickerSources = useMemo<LiveTickerEvent[]>(() => {
    const visibleSources = new Set(visibleCalendarSources.map((source) => source.id));
    return [
      ...events.map((event) => ({
        key: `event:${event.id}`,
        id: event.id,
        title: event.title,
        date: event.date,
        eventTime: event.eventTime,
        space: event.space,
      })),
      ...calendarFeedEvents
        .filter((event) => visibleSources.has(event.sourceId) && !linkedCalendarEventIds.has(event.id))
        .map((event) => ({
          key: `calendar:${event.sourceId}:${event.id}`,
          id: event.id,
          title: event.title,
          date: event.date,
          eventTime: event.eventTime,
          space: event.location,
          sourceName: event.sourceName,
          external: true,
        })),
    ];
  }, [calendarFeedEvents, events, linkedCalendarEventIds, visibleCalendarSources]);

  const calendarSourceDiagnostics = useMemo(() => {
    const prefix = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-`;
    return settings.calendarSources.map((source) => {
      const synced = calendarFeedEvents.filter((event) => event.sourceId === source.id);
      const visibleThisMonth = source.enabled
        ? synced.filter((event) => event.date.startsWith(prefix) && !linkedCalendarEventIds.has(event.id)).length
        : 0;
      return {
        ...source,
        syncedCount: synced.length,
        visibleThisMonth,
      };
    });
  }, [calendarFeedEvents, calendarMonth, calendarYear, linkedCalendarEventIds, settings.calendarSources]);

  const visibleExternalEventCount = calendarSourceDiagnostics.reduce((total, source) => total + source.visibleThisMonth, 0);
  const totalSyncedExternalEventCount = calendarSourceDiagnostics.reduce((total, source) => total + source.syncedCount, 0);
  const calendarErrorCount = calendarSourceDiagnostics.filter((source) => source.lastError).length;
  const today = startupDayRef.current;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Array<EventoEvent | ImportedCalendarEvent>>();
    const visibleDates = new Set(days.filter((date): date is string => Boolean(date)));
    events.filter((event) => visibleDates.has(event.date)).forEach((event) => {
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    });
    const visibleSources = new Set(visibleCalendarSources.map((source) => source.id));
    calendarFeedEvents.filter((event) =>
      visibleSources.has(event.sourceId)
      && visibleDates.has(event.date)
      && !linkedCalendarEventIds.has(event.id)
    ).forEach((event) => {
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    });
    for (const items of map.values()) items.sort((a, b) => {
      const start = (event: EventoEvent | ImportedCalendarEvent) => eventWindow(event.date, event.eventTime)?.startsAt ?? Number.MAX_SAFE_INTEGER;
      return start(a) - start(b) || a.title.localeCompare(b.title);
    });
    return map;
  }, [events, calendarFeedEvents, days, linkedCalendarEventIds, visibleCalendarSources]);

  async function save() {
    if (!eventBackendChecked) { setEventSaveStatus("NOT ON SERVER"); return; }
    const payload = { events, selectedId, openIds, calendarYear, calendarMonth };
    localStorage.setItem(EVENT_STORE_KEY, JSON.stringify(payload));
    if (!events.length) {
      setEventSaveStatus("NO EVENT FILES");
      return;
    }
    const dirtyEvents = events.filter((event) =>
      syncedEventsRef.current.get(event.id)?.fingerprint !== eventFingerprint(event),
    );
    if (!dirtyEvents.length) {
      setEventSaveStatus("SAVED");
      return;
    }
    setEventSaveStatus("SAVING");
    const results = await Promise.all(dirtyEvents.map((event) => persistEvent(event)));
    if (results.every((result) => result === "saved" || result === "busy")) {
      setEventSaveStatus("SAVED");
    }
  }

  const openEvent = useCallback((event: EventoEvent) => {
    setSelectedId(event.id);
    setInfoExpanded(false);
    const [year, month] = event.date.split("-").map(Number);
    if (year && month) {
      setCalendarYear(year);
      setCalendarMonth(month - 1);
    }
    setOpenIds((ids) => [event.id, ...ids.filter((id) => id !== event.id)].slice(0, 8));
  }, []);

  const convertCalendarEvent = useCallback(async (imported: ImportedCalendarEvent) => {
    if (!eventBackendChecked) { setEventSaveStatus("NOT ON SERVER"); return; }
    const existing = events.find((event) => event.calendarEventId === imported.id);
    if (existing) {
      openEvent(existing);
      return;
    }

    /**
     * Where the booking is happening.
     *
     * A venue that keeps one calendar per room says which rooms an event uses
     * simply by appearing in several of them — the Pat Dunne memorial shows up
     * in Margarets Meeting Room, Dance Studio and Auditorium. That is far more
     * reliable than the location text, which is written by whoever made the
     * booking and arrives as things like "MMR".
     *
     * Both are kept: the source calendars first, then the typed location if it
     * adds anything, so a one-calendar venue still gets its room.
     */
    const sameBooking = calendarFeedEvents.filter(
      (candidate) =>
        candidate.date === imported.date &&
        candidate.title.trim().toLowerCase() === imported.title.trim().toLowerCase(),
    );
    const roomNames: string[] = [];
    for (const name of [
      ...sameBooking.map((candidate) => candidate.sourceName ?? ""),
      imported.location ?? "",
    ]) {
      const clean = name.trim();
      if (!clean) continue;
      if (roomNames.some((seen) => seen.toLowerCase() === clean.toLowerCase())) continue;
      roomNames.push(clean);
    }
    // Tabletron splits this back into rooms on the same separators.
    const space = roomNames.join(", ") || imported.location;

    const created: EventoEvent = {
      ...eventSeed(
        `event_${imported.id}`,
        imported.title,
        imported.date,
        importedEventKind(imported),
        formatRegularTime(imported.eventTime),
        space,
        `Imported from ${imported.sourceName}.`,
        "",
        "",
        0,
      ),
      manager: "",
      description: imported.description || imported.title,
      planningNotes: `Imported from ${imported.sourceName}.`,
      requestedItems: "",
      calendarEventId: imported.id,
      calendarSourceId: imported.sourceId,
      calendarSourceName: imported.sourceName,
      calendarImportedAt: new Date().toISOString(),
    };

    setEvents((items) => items.some((event) => event.calendarEventId === imported.id)
      ? items
      : [...items, created]);
    openEvent(created);
    setEventSaveStatus("IMPORTING EVENT");
    const outcome = await persistEvent(created);
    if (outcome === "saved") {
      setEventSaveStatus("CALENDAR EVENT SAVED");
    } else if (outcome === "error") {
      setEventSaveStatus("IMPORTED LOCALLY");
    }
  }, [calendarFeedEvents, events, openEvent, persistEvent, eventBackendChecked]);

  useEffect(() => {
    if (!settingsLoaded || !eventBackendChecked) return;
    const params = new URLSearchParams(window.location.search);
    const calendarEventId = params.get("calendarEvent");
    if (!calendarEventId) return;
    const savedEvent = events.find((event) => event.calendarEventId === calendarEventId);
    const syncedEvent = calendarFeedEvents.find((event) => event.id === calendarEventId);
    if (!savedEvent && !syncedEvent) return;

    const timer = window.setTimeout(() => {
      params.delete("calendarEvent");
      params.delete("calendarSource");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
      );
      if (savedEvent) openEvent(savedEvent);
      else if (syncedEvent) void convertCalendarEvent(syncedEvent);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [calendarFeedEvents, convertCalendarEvent, eventBackendChecked, events, openEvent, settingsLoaded]);

  function closeEventFile(id: string, event?: ReactMouseEvent<HTMLButtonElement>) {
    event?.preventDefault();
    event?.stopPropagation();
    const nextIds = openIds.filter((openId) => openId !== id);
    const nextSelectedId = selectedId === id ? nextIds[0] ?? "" : selectedId;
    setOpenIds(nextIds);
    setSelectedId(nextSelectedId);
    setInfoExpanded(false);
    localStorage.setItem(EVENT_STORE_KEY, JSON.stringify({
      events,
      selectedId: nextSelectedId,
      openIds: nextIds,
      calendarYear,
      calendarMonth,
    }));
  }

  async function deleteSelectedEvent() {
    if (!eventBackendChecked) { setEventSaveStatus("NOT ON SERVER"); return; }
    if (!hasActiveEvent) return;
    const target = selected;
    if (!window.confirm(`Delete ${target.title}? This removes its EventoTron file and linked applet data.`)) return;

    setEventSaveStatus("DELETING EVENT");
    inFlightEventsRef.current.add(target.id);
    try {
      const response = await fetch(`/api/events?id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Event delete failed");

      const remainingEvents = events.filter((event) => event.id !== target.id);
      const remainingOpenIds = openIds.filter((id) => id !== target.id);
      const nextSelectedId = remainingOpenIds[0] ?? "";
      syncedEventsRef.current.delete(target.id);
      inFlightEventsRef.current.delete(target.id);
      setEvents(remainingEvents);
      setOpenIds(remainingOpenIds);
      setSelectedId(nextSelectedId);
      setInfoExpanded(false);
      localStorage.setItem(EVENT_STORE_KEY, JSON.stringify({
        events: remainingEvents,
        selectedId: nextSelectedId,
        openIds: remainingOpenIds,
        calendarYear,
        calendarMonth,
      }));
      setEventSaveStatus("EVENT DELETED");
    } catch {
      inFlightEventsRef.current.delete(target.id);
      setEventSaveStatus("DELETE FAILED");
    }
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

  function addEvent(day?: number, templateId = newEventTemplateId, exactDate?: string) {
    if (!eventBackendChecked) { setEventSaveStatus("NOT ON SERVER"); return; }
    const monthLength = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const template = settings.operationsTemplates.find((item) => item.id === templateId);
    const created: EventoEvent = {
      ...eventSeed(
      `event_${uid()}`,
      template?.name ?? "New Event",
      exactDate ?? `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(Math.min(day ?? 1, monthLength)).padStart(2, "0")}`,
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
  function selectCalendarDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const [year, month, day] = value.split("-").map(Number);
    if (year < 1900 || year > 2200) return;
    setCalendarYear(year); setCalendarMonth(month - 1); setCalendarDay(day);
  }
  function shiftCalendarPeriod(direction: number) {
    const focused = new Date(Date.UTC(calendarYear, calendarMonth, Math.min(calendarDay, new Date(Date.UTC(calendarYear, calendarMonth + 1, 0)).getUTCDate())));
    if (calendarDisplay.view === "month" || calendarDisplay.view === "agenda") {
      focused.setUTCDate(1); focused.setUTCMonth(focused.getUTCMonth() + direction);
    } else focused.setUTCDate(focused.getUTCDate() + direction * (calendarDisplay.view === "week" ? 7 : 1));
    selectCalendarDate(dateKey(focused));
  }
  const focusDate = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(Math.min(calendarDay, new Date(Date.UTC(calendarYear, calendarMonth + 1, 0)).getUTCDate())).padStart(2, "0")}`;
  const calendarRangeLabel = calendarDisplay.view === "day"
    ? new Date(`${focusDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : calendarDisplay.view === "week" ? `${days[0]} - ${days[6]}` : `${currentMonthLabel} ${calendarYear}`;
  const weekdays = settings.weekStartsOn === "monday" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function openTickerEvent(item: LiveTickerItem) {
    if (item.external) {
      const imported = calendarFeedEvents.find((event) => event.id === item.id);
      if (imported) void convertCalendarEvent(imported);
      return;
    }
    const event = events.find((candidate) => candidate.id === item.id);
    if (event) openEvent(event);
  }

  return (
    <main className="eventotron-desktop">
      <SaveRecovery state={settingsSave} />
      <div className="eventotron-ribbon-row">
        <SuiteChrome active="calendar" eventId={hasActiveEvent ? selected.id : undefined} />
        <button className="save-state-action" data-tone={saveStatusTone(eventSaveStatus)} title={saveStatusHint(eventSaveStatus)} onClick={() => void save()}>{eventSaveStatus}</button>
        <label className="new-event-template">
          <span>START FROM</span>
          <select value={newEventTemplateId} onChange={(event) => setNewEventTemplateId(event.target.value)}>
            <option value="">Blank event</option>
            {settings.operationsTemplates.map((template) => (
              <option value={template.id} key={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={() => addEvent(localDayParts(new Date(), settings.timezone).day)}>
          NEW EVENT
        </button>
        <button onClick={() => setSettingsOpen(true)}>SETTINGS</button>
      </div>

      <OperationsTicker
        active="calendar"
        sources={liveTickerSources}
        timezone={settings.timezone}
        onOpenEvent={openTickerEvent}
      />

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
              <div
                className={`vertical-file ${event.id === selected.id ? "active" : ""} ${event.kind}`}
                key={event.id}
              >
                <button className="vertical-file-open" onClick={() => openEvent(event)}>
                  <small>{event.date.slice(5)}</small>
                  <b>{event.title}</b>
                  <span>{formatRegularTime(event.eventTime)}</span>
                </button>
                <button
                  type="button"
                  className="vertical-file-close"
                  aria-label={`Close ${event.title}`}
                  onClick={(clickEvent) => closeEventFile(event.id, clickEvent)}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button className="active-event-tab" onClick={() => setInfoExpanded(false)}>
            <small>{selectedIsLive ? "LIVE EVENT FILE" : "PLANNING EVENT FILE"}</small>
            {hasActiveEvent ? (
              <>
                <strong>{selected.title}</strong>
                <span>{selected.date} · {formatRegularTime(selected.eventTime)}</span>
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

        <section className="calendar-panel calendar-custom" data-view={calendarDisplay.view} style={calendarDisplayStyle(calendarDisplay) as CSSProperties}>
          <div className="calendar-title">
            <div>
              <small>EVENTOTRON MAIN CALENDAR</small>
              <h1>{calendarRangeLabel} All Staff Schedule</h1>
            </div>
            <div className="calendar-legend">
              {Object.entries(labels).map(([kind, label]) => (
                <span className={`legend-dot ${kind}`} key={kind}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="calendar-display-toolbar">
            <div className="calendar-view-switch" role="group" aria-label="Calendar view">
              {calendarViews.map(view => <button key={view} type="button" aria-pressed={calendarDisplay.view === view} onClick={() => {
                try { updateCalendarDisplay({ view }); setDisplayError(""); } catch { setDisplayError("Calendar view could not be saved in this browser."); }
              }}>{view}</button>)}
            </div>
            <div className="calendar-date-navigation">
              <button type="button" aria-label="Previous calendar period" title="Previous period" onClick={() => shiftCalendarPeriod(-1)}>‹</button>
              <label><span className="sr-only">Calendar date</span><input type="date" aria-label="Calendar date" min="1900-01-01" max="2200-12-31" value={focusDate} onChange={event => selectCalendarDate(event.target.value)} /></label>
              <button type="button" aria-label="Next calendar period" title="Next period" onClick={() => shiftCalendarPeriod(1)}>›</button>
            </div>
          </div>
          {displayError && <p role="alert">{displayError}</p>}
          <div className="calendar-sync-diagnostics">
            <span><b>{visibleExternalEventCount}</b> calendar entries ready to open</span>
            <span><b>{totalSyncedExternalEventCount}</b> synced external records</span>
            <span><b>{visibleCalendarSources.length}</b> visible calendars</span>
            {calendarErrorCount ? <span className="diagnostic-error"><b>{calendarErrorCount}</b> calendar error{calendarErrorCount === 1 ? "" : "s"}</span> : null}
          </div>
          <div className="calendar-month-tabs" role="tablist" aria-label="Calendar months">
            <button className="year-step calendar-today" onClick={() => {
              const currentDay = localDayParts(new Date(), settings.timezone);
              setCalendarYear(currentDay.year);
              setCalendarMonth(currentDay.month);
              setCalendarDay(currentDay.day);
              window.requestAnimationFrame(() => document.querySelector(".day-cell.today")?.scrollIntoView({ block: "start", inline: "nearest" }));
            }}>TODAY</button>
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
          <div className={`month-grid calendar-view-${calendarDisplay.view}`}>
            {(calendarDisplay.view === "month" || calendarDisplay.view === "week" ? weekdays : []).map((day) => (
              <div className="weekday" key={day}>
                {day}
              </div>
            ))}
            {days.map((date, index) => (
              <div className={`day-cell ${date ? "" : "blank"} ${date === today.key ? "today" : ""}`} key={`${date}-${index}`}>
                {date && (
                  <>
                    <span className="calendar-day-label">{new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                    <button className="day-number" aria-label={`Create event on ${date}`} onClick={() => addEvent(undefined, newEventTemplateId, date)}>
                      {Number(date.slice(-2))}
                    </button>
                    <div className="day-events">
                      {(eventsByDay.get(date) ?? []).map((event) => {
                        const imported = "sourceId" in event;
                        return (
                          <button
                            className={`calendar-event ${imported ? "external" : event.kind} ${!imported && event.id === selected.id ? "active" : ""}`}
                            key={`${imported ? event.sourceId : "event"}-${event.id}`}
                            onClick={() => { if (imported) void convertCalendarEvent(event); else openEvent(event); }}
                            style={imported ? { borderColor: calendarSourceColor(event.color, calendarDisplay.background) } : undefined}
                            title={imported ? `Open as an editable event file from ${event.sourceName}${event.location ? ` · ${event.location}` : ""}` : undefined}
                            aria-label={imported ? `Open ${event.title} as an editable event file` : `Open ${event.title}`}
                          >
                            <b>{event.title}</b>
                            <small>{formatRegularTime(event.eventTime)}</small>
                            {calendarDisplay.view === "agenda" || calendarDisplay.view === "day" ? <span className="calendar-event-location">{imported ? event.location : event.space}</span> : null}
                            {imported ? <em>{event.sourceName}</em> : null}
                          </button>
                        );
                      })}
                    </div>
                    {(calendarDisplay.view === "day" || calendarDisplay.view === "agenda") && !(eventsByDay.get(date)?.length) ? <p className="calendar-empty-day">No events</p> : null}
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside inert={!eventBackendChecked} className={`event-info-sheet ${infoExpanded ? "expanded" : "compact"}`}>
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
              {hasActiveEvent ? (
                <button className="delete-event-action" onClick={() => void deleteSelectedEvent()}>
                  DELETE EVENT
                </button>
              ) : null}
            </div>
          </div>
          {!infoExpanded ? (
            <div className="sheet-preview">
              <div className="sheet-preview-grid">
                <div><small>DATE</small><b>{selected.date || "Not set"}</b></div>
                <div><small>EVENT TIME</small><b>{formatRegularTime(selected.eventTime) || "Not set"}</b></div>
                <div><small>SPACE</small><b>{selected.space || "Not assigned"}</b></div>
                <div><small>ATTENDEES</small><b>{selected.attendees || 0}</b></div>
                <div><small>CONTACT</small><b>{selected.contact || "Not entered"}</b></div>
                <div><small>MANAGER</small><b>{selected.manager || "Not assigned"}</b></div>
              </div>
              {selectedTemplate ? (
                <div className="sheet-template-summary compact">
                  <small>OPERATIONS PRESET</small>
                  <b>{selectedTemplate.name}</b>
                  <span>{selectedTemplate.preset?.event?.space || selected.space || "No room preset"} · {selectedTemplate.preset?.scheduleBlocks?.length ?? 0} Scheduluotron blocks</span>
                </div>
              ) : null}
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
            {selected.calendarEventId ? (
              <div className="wide calendar-origin-field">
                <span>Calendar Source</span>
                <b>{selected.calendarSourceName || "Connected calendar"}</b>
                <small>Permanent EventoTron event file</small>
              </div>
            ) : null}
            {selectedTemplate ? (
              <div className="wide sheet-template-summary">
                <small>OPERATIONS PRESET ACTIVE</small>
                <b>{selectedTemplate.name}</b>
                <div>
                  <span>{selectedTemplate.preset?.event?.eventTime || selected.eventTime || "No event time preset"}</span>
                  <span>{selectedTemplate.preset?.event?.space || selected.space || "No room preset"}</span>
                  <span>{selectedTemplate.preset?.event?.manager || selected.manager || "No manager preset"}</span>
                  <span>{selectedTemplate.preset?.scheduleBlocks?.length ?? 0} schedule blocks</span>
                </div>
                <p>{selectedTemplate.preset?.event?.requestedItems || selected.requestedItems || "No requested items preset."}</p>
              </div>
            ) : null}
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
              <CalendarDisplaySettings />
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
                    <span>Event rail width</span>
                    <input type="range" min="280" max="620" step="10" value={railWidth} onChange={(event) => setRailWidth(Number(event.target.value))} />
                    <output>{railWidth}px</output>
                  </label>
                </div>
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
                {settings.calendarSources.length ? settings.calendarSources.map((source) => {
                  const diagnostics = calendarSourceDiagnostics.find((item) => item.id === source.id);
                  return (
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
                    <div className="calendar-source-footer"><span>{providerLabels[source.provider]}</span><span>{source.lastError || `${diagnostics?.visibleThisMonth ?? 0} THIS MONTH / ${diagnostics?.syncedCount ?? source.eventCount ?? 0} SYNCED`}</span><label>SYNC <select value={source.syncMinutes} onChange={(event) => updateCalendarSource(source.id, { syncMinutes: Number(event.target.value) })}><option value="5">5 MIN</option><option value="15">15 MIN</option><option value="30">30 MIN</option><option value="60">60 MIN</option></select></label><button className="calendar-sync-button" disabled={Boolean(calendarSyncing[source.id])} onClick={() => syncCalendarSource(source)}>{calendarSyncing[source.id] ? "SYNCING" : "SYNC NOW"}</button></div>
                    <div className="calendar-source-diagnostics">
                      <span>LAST SYNC {source.lastSynced ? new Date(source.lastSynced).toLocaleString() : "NEVER"}</span>
                      <span>{source.enabled ? "SHOWING ON CALENDAR" : "HIDDEN FROM CALENDAR"}</span>
                    </div>
                  </div>
                  );
                }) : <div className="settings-empty">No external calendars connected yet. Add one to configure its display color, visibility, and sync interval.</div>}
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
