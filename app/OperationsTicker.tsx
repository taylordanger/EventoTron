"use client";

import Link from "next/link";
import { eventTabHref } from "./event-context";
import { selectLiveTickerItems, type LiveTickerEvent, type LiveTickerItem } from "./live-event-ticker";
import { defaultSuiteSettings, loadSuiteSettings } from "./suite-settings";
import { formatRegularTime } from "./time-format";
import { useEffect, useMemo, useState } from "react";

export type TickerSuiteArea = "calendar" | "tabletron" | "foodotron" | "scheduluotron" | "settings";

type OperationsTickerProps = {
  active: TickerSuiteArea;
  sources?: LiveTickerEvent[];
  timezone?: string;
  onOpenEvent?: (item: LiveTickerItem) => void;
};

type StoredEvent = {
  id: string;
  title: string;
  date: string;
  eventTime: string;
  space?: string;
  calendarEventId?: string;
};

type SyncedEvent = {
  id: string;
  title: string;
  date: string;
  eventTime: string;
  location?: string;
  sourceId: string;
  sourceName?: string;
};

type CalendarSourceRecord = {
  id: string;
  name: string;
  enabled: boolean;
};

const areaRoutes: Record<TickerSuiteArea, string> = {
  calendar: "/",
  tabletron: "/tabletron",
  foodotron: "/foodotron",
  scheduluotron: "/scheduluotron",
  settings: "/settings",
};

function formatTickerDate(value: string, status: LiveTickerItem["status"]) {
  if (status === "live") return "Happening now";
  if (status === "today") return "Scheduled today";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day, 12).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function tickerHref(active: TickerSuiteArea, item: LiveTickerItem) {
  if (item.external) {
    const params = new URLSearchParams({ calendarEvent: item.id });
    if (item.sourceName) params.set("calendarSource", item.sourceName);
    return `/?${params.toString()}`;
  }
  return eventTabHref(areaRoutes[active], item.id);
}

export function OperationsTicker({ active, sources, timezone, onOpenEvent }: OperationsTickerProps) {
  const [fetchedSources, setFetchedSources] = useState<LiveTickerEvent[]>([]);
  const [fetchedTimezone, setFetchedTimezone] = useState(defaultSuiteSettings.timezone);
  const [tickerNow, setTickerNow] = useState(() => new Date());
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    if (sources) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const [eventResponse, calendarResponse, settings] = await Promise.all([
          fetch("/api/events", { cache: "no-store" }),
          fetch("/api/calendar-sources", { cache: "no-store" }),
          loadSuiteSettings(),
        ]);
        if (!eventResponse.ok || !calendarResponse.ok) return;
        const eventPayload = await eventResponse.json() as { events?: StoredEvent[] };
        const calendarPayload = await calendarResponse.json() as {
          sources?: CalendarSourceRecord[];
          events?: SyncedEvent[];
        };
        if (cancelled) return;
        const savedEvents = Array.isArray(eventPayload.events) ? eventPayload.events : [];
        const syncedEvents = Array.isArray(calendarPayload.events) ? calendarPayload.events : [];
        const visibleSources = new Map(
          (calendarPayload.sources ?? [])
            .filter((source) => source.enabled)
            .map((source) => [source.id, source.name]),
        );
        const linkedCalendarIds = new Set(savedEvents.flatMap((event) => event.calendarEventId ? [event.calendarEventId] : []));
        setFetchedSources([
          ...savedEvents.map((event) => ({
            key: `event:${event.id}`,
            id: event.id,
            title: event.title,
            date: event.date,
            eventTime: event.eventTime,
            space: event.space,
          })),
          ...syncedEvents
            .filter((event) => visibleSources.has(event.sourceId) && !linkedCalendarIds.has(event.id))
            .map((event) => ({
              key: `calendar:${event.sourceId}:${event.id}`,
              id: event.id,
              title: event.title,
              date: event.date,
              eventTime: event.eventTime,
              space: event.location,
              sourceName: event.sourceName || visibleSources.get(event.sourceId),
              external: true,
            })),
        ]);
        setFetchedTimezone(settings.timezone);
      } catch {}
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sources]);

  useEffect(() => {
    const timer = window.setInterval(() => setTickerNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeSources = sources ?? fetchedSources;
  const activeTimezone = timezone ?? fetchedTimezone;
  const liveTickerItems = useMemo(
    () => selectLiveTickerItems(activeSources, tickerNow, activeTimezone),
    [activeSources, activeTimezone, tickerNow],
  );
  const tickerSequenceKey = liveTickerItems.map((item) => `${item.key}:${item.status}`).join("|");
  const liveTickerItem = liveTickerItems.length
    ? liveTickerItems[tickerIndex % liveTickerItems.length]
    : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setTickerIndex(0), 0);
    return () => window.clearTimeout(timer);
  }, [tickerSequenceKey]);

  useEffect(() => {
    if (liveTickerItems.length < 2) return;
    const timer = window.setInterval(() => {
      setTickerIndex((index) => (index + 1) % liveTickerItems.length);
    }, 7_000);
    return () => window.clearInterval(timer);
  }, [liveTickerItems.length, tickerSequenceKey]);

  const tickerContents = liveTickerItem ? (
    <span className="live-ticker-viewport">
      <span className="live-ticker-track" key={liveTickerItem.key}>
        {[0, 1].map((copy) => (
          <span className="live-ticker-message" aria-hidden="true" key={copy}>
            <b>{liveTickerItem.title}</b>
            <span>{formatTickerDate(liveTickerItem.date, liveTickerItem.status)}</span>
            <span>{formatRegularTime(liveTickerItem.eventTime) || "Time not set"}</span>
            <span>{liveTickerItem.space || liveTickerItem.sourceName || "Location not assigned"}</span>
          </span>
        ))}
      </span>
    </span>
  ) : null;

  return (
    <section
      className={`live-operations-ticker ${liveTickerItem?.status ?? "clear"}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="live-ticker-state">
        <span aria-hidden="true" />
        <strong>
          {liveTickerItem?.status === "live"
            ? "LIVE NOW"
            : liveTickerItem?.status === "today"
              ? "TODAY"
              : liveTickerItem?.status === "next"
                ? "NEXT UP"
                : "OPS FEED"}
        </strong>
      </div>
      {liveTickerItem && onOpenEvent ? (
        <button
          type="button"
          className="live-ticker-open"
          onClick={() => onOpenEvent(liveTickerItem)}
          aria-label={`Open ${liveTickerItem.title}`}
        >
          {tickerContents}
        </button>
      ) : liveTickerItem ? (
        <Link
          className="live-ticker-open"
          href={tickerHref(active, liveTickerItem)}
          aria-label={`Open ${liveTickerItem.title} in ${active}`}
        >
          {tickerContents}
        </Link>
      ) : (
        <div className="live-ticker-empty">No active or upcoming events found in the connected schedule.</div>
      )}
      <div className="live-ticker-counter">
        <small>{activeTimezone.replaceAll("_", " ")}</small>
        <b>{liveTickerItems.length ? `${tickerIndex % liveTickerItems.length + 1}/${liveTickerItems.length}` : "0/0"}</b>
      </div>
    </section>
  );
}
