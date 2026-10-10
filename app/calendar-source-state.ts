import type { CalendarSource } from "./suite-settings";

export function normalizeSource(value: unknown): CalendarSource | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = String(source.id ?? "").trim();
  const name = String(source.name ?? "").trim();
  const provider = String(source.provider ?? "ical") as CalendarSource["provider"];
  const color = String(source.color ?? "#75ff47").trim();
  if (!id || id.length > 180 || !name || name.length > 240 || !["google", "outlook", "ical", "work"].includes(provider) || !/^#[0-9a-f]{6}$/i.test(color)) return null;
  return {
    id, name, provider, color,
    url: String(source.url ?? "").trim(),
    enabled: source.enabled !== false,
    syncMinutes: Math.max(5, Math.min(1440, Number(source.syncMinutes) || 15)),
    oauthAccountId: typeof source.oauthAccountId === "string" && source.oauthAccountId ? source.oauthAccountId : undefined,
    lastSynced: typeof source.lastSynced === "string" ? source.lastSynced : undefined,
    lastError: typeof source.lastError === "string" ? source.lastError : undefined,
    eventCount: source.eventCount !== undefined && Number.isFinite(Number(source.eventCount)) ? Number(source.eventCount) : undefined,
  };
}

// Configuration writes cannot roll back sync results from another tab.
export function calendarConfiguration(source: CalendarSource) {
  const { lastSynced: _synced, lastError: _error, eventCount: _count, ...config } = source;
  void _synced; void _error; void _count;
  return config;
}

export function settingsConfigurationFingerprint(settings: { calendarSources: CalendarSource[] }) {
  return JSON.stringify({ ...settings, calendarSources: settings.calendarSources.map(calendarConfiguration) });
}

export function calendarReadiness(sources: CalendarSource[], now = Date.now()) {
  const enabled = sources.filter((source) => source.enabled);
  if (!enabled.length) return { state: "pending" as const, value: "Not connected" };
  const incomplete = enabled.filter((source) => !source.oauthAccountId && !/^https?:\/\//i.test(source.url));
  if (incomplete.length) return { state: "attention" as const, value: `${incomplete.length} connections incomplete` };
  const failed = enabled.filter((source) => source.lastError);
  if (failed.length) return { state: "attention" as const, value: `${failed.length} sync errors` };
  const stale = enabled.filter((source) => {
    const synced = Date.parse(source.lastSynced ?? "");
    return !Number.isFinite(synced) || now - synced > source.syncMinutes * 2 * 60_000;
  });
  if (stale.length) return { state: "attention" as const, value: `${stale.length} syncs due` };
  return { state: "ready" as const, value: `${enabled.length} calendars current` };
}
