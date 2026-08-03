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
