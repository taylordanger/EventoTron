export type CalendarProvider = "google" | "outlook" | "ical" | "work";

export type CalendarSource = {
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

export type OperationsTemplate = {
  id: string;
  name: string;
  category: "event" | "food" | "room" | "maintenance" | "volunteer" | "contract";
  summary: string;
  checklist: string[];
};

export type SuiteSettings = {
  workspaceName: string;
  venueName: string;
  timezone: string;
  weekStartsOn: "sunday" | "monday";
  autoSave: boolean;
  reportPaper: "letter" | "a4";
  reportIncludeCosts: boolean;
  reportIncludeLayout: boolean;
  staff: string[];
  rooms: Array<{ id: string; name: string; width: number; height: number }>;
  equipment: string[];
  operationsTemplates: OperationsTemplate[];
  calendarSources: CalendarSource[];
};

export const SETTINGS_STORE_KEY = "eventotron-settings-v1";

export const defaultSuiteSettings: SuiteSettings = {
  workspaceName: "EventoTron Operations Suite",
  venueName: "Lincoln City Cultural Center",
  timezone: "America/Los_Angeles",
  weekStartsOn: "sunday",
  autoSave: true,
  reportPaper: "letter",
  reportIncludeCosts: true,
  reportIncludeLayout: true,
  staff: ["Jason", "Nara", "Heather", "Taylor", "Serena"],
  rooms: [
    { id: "room_margarets", name: "Margaret's Room", width: 26, height: 26 },
    { id: "room_auditorium", name: "Auditorium", width: 60, height: 42 },
    { id: "room_conference", name: "Conference", width: 26, height: 26 },
  ],
  equipment: ["6 FT ROUND TABLES", "CHAIRS", "PODIUM", "PROJECTOR", "LINENS"],
  operationsTemplates: [
    {
      id: "template_rotary_luncheon",
      name: "Rotary luncheon",
      category: "event",
      summary: "Recurring luncheon setup, menu planning, room reset, and day-of service flow.",
      checklist: [
        "Plan menu roughly four weeks at a time and vary soup, salad, sandwich, and entree salad options.",
        "Set auditorium with round tables, black tablecloths, podium, water glasses, coffee station, and wrapped flatware.",
        "Prepare luncheon food, coffee, hot water, water pitchers, and special dietary notes before guest arrival.",
        "After the meeting, bus tables, separate silverware, pull linens, store leftovers, and reset kitchen areas.",
      ],
    },
    {
      id: "template_concert_hospitality",
      name: "Concert hospitality and MOD",
      category: "event",
      summary: "Show-day checklist for artist hospitality, house opening, cash bags, announcements, and post-show closeout.",
      checklist: [
        "Confirm contract, hospitality needs, sound check time, guest list, ticket sales, and volunteer coverage before the event.",
        "Prepare green room or dressing room hospitality, water, tea, snacks, towels, and any allergy-sensitive items.",
        "Pull cash bags, check payment requirements, prep announcement template, and coordinate door opening with sound check.",
        "After show, thank guests, collect bank bags, pull leftover food, wash bar/concession dishes, and secure paperwork.",
      ],
    },
    {
      id: "template_market_mod",
      name: "Market MOD checklist",
      category: "volunteer",
      summary: "Sunday market opening and closing routine with vendor support and facility checks.",
      checklist: [
        "Unlock doors, check reservation book, change reader-board sign, make coffee, and check restroom/restock needs.",
        "Open galleries and other opening procedures before vendors and guests arrive.",
        "Give market manager trash bags, cart, attendance log, and any change-return items.",
        "Ask market manager for attendance, give ceramics studio warning, then lock and close building.",
      ],
    },
    {
      id: "template_kitchen_closing",
      name: "Commercial kitchen closing",
      category: "food",
      summary: "Kitchen safety, sanitation, leftover storage, trash, dish machine, and equipment shutdown.",
      checklist: [
        "Date and store leftover food, leaving employee-available notes where needed.",
        "Wash dishes, clean floor sink and sinks, drain dish machine, and set a dish rack for employee use.",
        "Empty and reline trash, take trash outside, empty recycle as needed, sweep and mop kitchen floor.",
        "Turn off lights, close doors, confirm gas, hood fans, ovens, mixers, coffee makers, and refrigerators are safe.",
      ],
    },
    {
      id: "template_maintenance_ticker",
      name: "Maintenance tickler",
      category: "maintenance",
      summary: "Monthly building maintenance reminders, contractor notes, due dates, and completion tracking.",
      checklist: [
        "Track furnace filters, outside drains, window washing, sprinkler changes, fire alarm, hood, Ansul, backflow, and elevator inspections.",
        "Record due date, completion date, contractor, cost, and follow-up notes for each maintenance line.",
        "Highlight annual or compliance-sensitive inspections so they are visible in month and year views.",
      ],
    },
    {
      id: "template_internal_event_form",
      name: "Internal event planning form",
      category: "contract",
      summary: "Client/event intake fields for contracts, room setup, ticketing, calendar posting, and final settlement.",
      checklist: [
        "Capture event dates, booking date, event/group name, contact, phone, email, mailing address, and description.",
        "Record ticket prices, room setup, contract status, payment arrangement, lodging, hospitality, and technical needs.",
        "Track checklist dates for master calendar, website calendar, posters, press release, and tickets on sale.",
        "Complete final ticket, concessions, beer/wine, balance, and settlement notes after event close.",
      ],
    },
  ],
  calendarSources: [],
};

export const calendarProviderLabels: Record<CalendarProvider, string> = {
  google: "Google Calendar",
  outlook: "Outlook / Microsoft 365",
  ical: "iCal / ICS feed",
  work: "Other work calendar",
};

export function mergeSuiteSettings(value: Partial<SuiteSettings> | null | undefined): SuiteSettings {
  return {
    ...defaultSuiteSettings,
    ...(value ?? {}),
    staff: Array.isArray(value?.staff) ? value.staff : defaultSuiteSettings.staff,
    rooms: Array.isArray(value?.rooms) ? value.rooms : defaultSuiteSettings.rooms,
    equipment: Array.isArray(value?.equipment) ? value.equipment : defaultSuiteSettings.equipment,
    operationsTemplates: Array.isArray(value?.operationsTemplates) ? value.operationsTemplates : defaultSuiteSettings.operationsTemplates,
    calendarSources: Array.isArray(value?.calendarSources) ? value.calendarSources : [],
  };
}

export function readLocalSuiteSettings() {
  if (typeof window === "undefined") return defaultSuiteSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_STORE_KEY);
    return raw ? mergeSuiteSettings(JSON.parse(raw) as Partial<SuiteSettings>) : defaultSuiteSettings;
  } catch {
    return defaultSuiteSettings;
  }
}

export async function loadSuiteSettings() {
  let settings = readLocalSuiteSettings();
  try {
    const response = await fetch("/api/settings");
    if (response.ok) {
      const data = (await response.json()) as { payload?: Partial<SuiteSettings> };
      settings = mergeSuiteSettings(data.payload ?? settings);
      localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(settings));
    }
  } catch {}
  return settings;
}
