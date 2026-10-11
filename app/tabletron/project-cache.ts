export const LEGACY_TABLETRON_CACHE = "tabletron-project-v2";

export function tabletronCacheKey(eventId?: string | null) {
  return eventId ? `${LEGACY_TABLETRON_CACHE}:event:${encodeURIComponent(eventId)}` : `${LEGACY_TABLETRON_CACHE}:standalone`;
}

/** Old caches mixed standalone projects with server-linked event snapshots. */
export function legacyProjectIsStandalone(project: unknown, suiteEventIds: string[]) {
  if (!project || typeof project !== "object") return false;
  const events = (project as { events?: Array<{ id?: string }> }).events;
  if (!Array.isArray(events)) return false;
  return !events.some((event) => event && suiteEventIds.includes(event.id ?? ""));
}
