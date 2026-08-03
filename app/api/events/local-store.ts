type StoredSuiteEvent = {
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
  requestedItems: string;
};

type LocalEventState = {
  events: StoredSuiteEvent[];
  selectedId: string;
  openIds: string[];
  calendarYear: number;
  calendarMonth: number;
  updatedAt: string | null;
};

const globalKey = "__eventotron_event_store__";

function initialState(): LocalEventState {
  return {
    events: [],
    selectedId: "",
    openIds: [],
    calendarYear: 2026,
    calendarMonth: 7,
    updatedAt: null,
  };
}

function store() {
  const root = globalThis as typeof globalThis & {
    [globalKey]?: LocalEventState;
  };
  root[globalKey] ??= initialState();
  return root[globalKey];
}

export function readLocalEvents() {
  return store();
}

export function writeLocalEvents(next: Omit<LocalEventState, "updatedAt">) {
  const current = store();
  current.events = next.events;
  current.selectedId = next.selectedId;
  current.openIds = next.openIds;
  current.calendarYear = next.calendarYear;
  current.calendarMonth = next.calendarMonth;
  current.updatedAt = new Date().toISOString();
  return current;
}
