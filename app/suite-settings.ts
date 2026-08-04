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

export type SuiteRoomSetting = {
  id: string;
  name: string;
  width: number;
  height: number;
  seats?: string;
  squareFeet?: number;
  features?: string[];
  rentalNotes?: string[];
  policyNotes?: string[];
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
  rooms: SuiteRoomSetting[];
  equipment: string[];
  operationsTemplates: OperationsTemplate[];
  calendarSources: CalendarSource[];
};

export const SETTINGS_STORE_KEY = "eventotron-settings-v1";

const defaultRooms: SuiteSettings["rooms"] = [
  {
    id: "room_auditorium",
    name: "Auditorium",
    width: 55,
    height: 40,
    seats: "96 at tables / 160 theatre / 200 standing",
    squareFeet: 2200,
    features: ["Handicapped accessible", "Theatrical light and sound", "24 x 16 FT stage"],
    rentalNotes: [
      "Mon-Thu half day: $300 minimum for 2-4 hours between 9 AM and 5 PM; after 4 hours $35/hr; before 9 AM or after 5 PM $40/hr.",
      "Fri-Sun half day: $425 minimum for 2-4 hours between 9 AM and 5 PM; after 4 hours $50/hr; before 9 AM or after 5 PM $40/hr.",
      "Setup and teardown $175; cleaning $175; security after midnight $100/hr.",
    ],
    policyNotes: ["Event insurance required for rental groups of 50 or more.", "Compostable products only; no Styrofoam."],
  },
  {
    id: "room_auditorium_stage",
    name: "Auditorium Stage",
    width: 24,
    height: 16,
    squareFeet: 384,
    features: ["Performance platform", "Pairs with auditorium theatrical light and sound"],
  },
  {
    id: "room_margarets",
    name: "Margaret's Meeting Room",
    width: 30,
    height: 22,
    seats: "32 at tables / 40 theatre",
    squareFeet: 660,
    features: ["Wipe-off board", "TV", "Sink and counter"],
    rentalNotes: [
      "Half day: $120 for 2-4 hours; after 4 hours $20/hr; before 9 AM or after 5 PM $40/hr.",
      "Setup and teardown $45; cleaning $45.",
    ],
    policyNotes: ["Event insurance required for rental groups of 50 or more.", "Compostable products only; no Styrofoam."],
  },
  {
    id: "room_elizabethan",
    name: "Elizabethan Room",
    width: 27,
    height: 22,
    seats: "18 total: 6 on couches / 12 at tables",
    squareFeet: 536,
    features: ["6-person lighted makeup station", "2 couches", "Coffee table", "Coat rack", "Sink and counter"],
    rentalNotes: [
      "Half day: $100 for 2-4 hours; after 4 hours $20/hr; before 9 AM or after 5 PM $40/hr.",
      "Setup and teardown $50; cleaning $50.",
    ],
    policyNotes: ["Event insurance required for rental groups of 50 or more.", "Compostable products only; no Styrofoam."],
  },
  {
    id: "room_dance_studio",
    name: "Dance Studio",
    width: 33,
    height: 22,
    squareFeet: 726,
    features: ["Wooden floors", "Mirrored walls", "Barre", "Window bench"],
    rentalNotes: [
      "Half day: $110 for 2-4 hours; after 4 hours $20/hr; before 9 AM or after 5 PM $40/hr.",
      "Setup and teardown $40; cleaning $40.",
    ],
    policyNotes: ["Event insurance required for rental groups of 50 or more.", "Compostable products only; no Styrofoam."],
  },
  {
    id: "room_art_lab",
    name: "Underground Art Lab",
    width: 24,
    height: 18,
    rentalNotes: [
      "Room rental with no setup, staff, or materials: $25/hr.",
      "Party rental with art projects, setup, and staff: $75/hr.",
      "Before 9 AM or after 5 PM: $40/hr.",
    ],
    policyNotes: ["Event insurance required for rental groups of 50 or more.", "Compostable products only; no Styrofoam."],
  },
  {
    id: "room_plaza",
    name: "Plaza",
    width: 60,
    height: 40,
    features: ["Concrete plaza and Poetry Path", "Adjacent parking", "Access to center bathrooms", "Water and power available", "Outdoor tables and chairs available"],
    rentalNotes: [
      "Small party under 50: $245 half day.",
      "Large party 50 or more: $490 half day.",
      "After 4 hours $60/hr; before 9 AM or after 5 PM $40/hr.",
      "Cleaning and damage deposit $120; setup and teardown $110.",
      "Center power spiders $55/unit.",
    ],
    policyNotes: ["Food trucks must provide City of Lincoln City licensing proof before the event."],
  },
];

const defaultEquipment = [
  "5 FT ROUND TABLE - 12 available",
  "6 FT RECTANGULAR TABLE - 19 available",
  "20 IN x 48 IN SMALL RECTANGULAR TABLE - 20 available",
  "24 IN x 45 IN SMALL RECTANGULAR TABLE - 10 available",
  "BURGUNDY BANQUET CHAIR - 75 available",
  "RED LEATHERETTE CHAIR - 45 available",
  "WHITE PLASTIC FOLDING CHAIR - 62 available",
  "MOLDED PLASTIC CHAIR - 43 available",
  "PODIUM",
  "PROJECTOR - $30",
  "MICROPHONE - $30",
  "SOUND / LIGHT SYSTEM - $50",
  "PIANO TUNING - $150",
  "MUSIC STAND - $2 each",
  "BLACK TABLECLOTH - $5 each",
  "IVORY TABLECLOTH - $7 each",
  "IVORY BANQUET SKIRT - $6 each",
  "IVORY CHAIR COVER - $4 self install / $5 installed",
  "CHAFING DISH - $11 each",
  "WINE GLASS - $0.75 each",
  "WATER GLASS - $0.75 each",
  "CHINA PLATE 7 IN or 10 IN - $3 each",
  "SILVERWARE SETTING - $2 each",
  "COFFEE & WATER SERVICE - $4 per person",
  "LCCC BEER / WINE SERVER - $25 per hour",
  "DOWNSTAIRS KITCHEN - $45 four hours / $90 eight hours",
  "OUTDOOR POWER SPIDER - $55 each",
];

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
  rooms: defaultRooms,
  equipment: defaultEquipment,
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
    {
      id: "template_facility_rental_policies",
      name: "Facility rental rates and policies",
      category: "contract",
      summary: "Room capacities, rental policies, day-rate notes, setup/cleaning charges, and rental amenity pricing.",
      checklist: [
        "Event insurance is required for rentals with groups of 50 or more.",
        "Use compostable products only; no Styrofoam, and keep service as plastic-free as possible.",
        "Auditorium seats 96 at tables, 160 theatre style, and 200 standing room only; main floor is 55 x 40 feet plus a 24 x 16 foot stage.",
        "Margaret's Meeting Room seats 32 at tables or 40 theatre style; room is 30 x 22 feet with wipe-off board, TV, sink, and counter.",
        "Elizabethan Room seats 18 with couches/tables; room is 27 x 22 feet with makeup station, couches, coat rack, sink, and counter.",
        "Dance Studio is 33 x 22 feet with wood floor, mirrored walls, barre, and window bench.",
        "Food trucks must have proper City of Lincoln City licensing and provide proof before the event.",
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

export function extractGoogleCalendarIds(value: string) {
  const ids = new Set<string>();
  try {
    const parsed = new URL(value.trim());
    parsed.searchParams.getAll("cid").forEach((id) => {
      const clean = id.trim();
      if (clean) ids.add(clean);
    });
  } catch {}
  for (const match of value.matchAll(/[?&]cid=([^&\s]+)/g)) {
    const clean = decodeURIComponent(match[1] ?? "").trim();
    if (clean) ids.add(clean);
  }
  for (const match of value.matchAll(/[a-z0-9_.-]+@[a-z0-9_.-]+/gi)) {
    const clean = match[0].trim();
    if (clean.endsWith("calendar.google.com")) ids.add(clean);
  }
  return [...ids];
}

export function googleCalendarFeedUrl(calendarId: string) {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
}

export function googleCalendarName(calendarId: string, index: number) {
  const prefix = calendarId.split("@")[0]?.replace(/^c_/, "").slice(0, 10).toUpperCase();
  return `Google Calendar ${index + 1}${prefix ? ` ${prefix}` : ""}`;
}

export function mergeSuiteSettings(value: Partial<SuiteSettings> | null | undefined): SuiteSettings {
  const savedRooms = Array.isArray(value?.rooms) ? value.rooms : [];
  const roomIds = new Set(savedRooms.map((room) => room.id));
  const mergedRooms = savedRooms.map((room) => {
    const fallback = defaultSuiteSettings.rooms.find((defaultRoom) => defaultRoom.id === room.id);
    return fallback
      ? {
          ...fallback,
          ...room,
          features: room.features ?? fallback.features,
          rentalNotes: room.rentalNotes ?? fallback.rentalNotes,
          policyNotes: room.policyNotes ?? fallback.policyNotes,
          seats: room.seats ?? fallback.seats,
          squareFeet: room.squareFeet ?? fallback.squareFeet,
        }
      : room;
  });
  const savedEquipment = Array.isArray(value?.equipment) ? value.equipment : [];
  const equipmentNames = new Set(savedEquipment.map((item) => item.toLowerCase()));
  const savedTemplates = Array.isArray(value?.operationsTemplates) ? value.operationsTemplates : [];
  const templateIds = new Set(savedTemplates.map((template) => template.id));
  return {
    ...defaultSuiteSettings,
    ...(value ?? {}),
    staff: Array.isArray(value?.staff) ? value.staff : defaultSuiteSettings.staff,
    rooms: mergedRooms.length ? [
      ...mergedRooms,
      ...defaultSuiteSettings.rooms.filter((room) => !roomIds.has(room.id)),
    ] : defaultSuiteSettings.rooms,
    equipment: savedEquipment.length ? [
      ...savedEquipment,
      ...defaultSuiteSettings.equipment.filter((item) => !equipmentNames.has(item.toLowerCase())),
    ] : defaultSuiteSettings.equipment,
    operationsTemplates: savedTemplates.length ? [
      ...savedTemplates,
      ...defaultSuiteSettings.operationsTemplates.filter((template) => !templateIds.has(template.id)),
    ] : defaultSuiteSettings.operationsTemplates,
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
