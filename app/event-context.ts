export type EventoEventContext = {
  id: string;
  title: string;
  date: string;
  kind: string;
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
  requestedItems?: string;
  operationsTemplateId?: string;
  calendarEventId?: string;
  calendarSourceId?: string;
  calendarSourceName?: string;
  calendarImportedAt?: string;
};

export const EVENT_STORE_KEY = "eventotron-events-v1";

export function eventTabHref(path: string, eventId?: string) {
  return eventId ? `${path}?event=${encodeURIComponent(eventId)}` : path;
}

export function readEventContext(eventId: string | null | undefined) {
  if (typeof window === "undefined" || !eventId) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(EVENT_STORE_KEY) ?? "{}");
    const events = Array.isArray(parsed) ? parsed : parsed.events;
    const event = Array.isArray(events)
      ? events.find((item) => item?.id === eventId)
      : null;
    return event && typeof event.title === "string"
      ? (event as EventoEventContext)
      : null;
  } catch {
    return null;
  }
}
