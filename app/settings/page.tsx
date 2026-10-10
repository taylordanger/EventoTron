"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SuiteChrome } from "../SuiteChrome";
import { OperationsTicker } from "../OperationsTicker";
import type { SuiteRole, SuiteUser, SuiteUserStatus } from "../api/_lib/users";
import type { OAuthAccountSummary } from "../api/_lib/calendar-oauth-accounts";
import { saveStatusHint, saveStatusTone } from "../save-status";
import { calendarReadiness, calendarConfiguration } from "../calendar-source-state";
import { useGuardedSave, SaveRecovery } from "../use-guarded-save";
import {
  SETTINGS_STORE_KEY,
  calendarProviderLabels,
  defaultSuiteSettings,
  extractGoogleCalendarIds,
  googleCalendarFeedUrl,
  googleCalendarName,
  mergeSuiteSettings,
  type CalendarProvider,
  type OperationsTemplate,
  type SuiteSettings,
} from "../suite-settings";

const uid = () => Math.random().toString(36).slice(2, 9);
const BACKUP_CHECKPOINT_KEY = "eventotron-backup-checkpoint-v1";

type SystemHealth = {
  status: "ready" | "migration-required" | "unavailable";
  checkedAt: string;
  latencyMs: number;
  database: "connected" | "unavailable";
  applets?: Record<string, number>;
  schema: { expected: string; current: string | null; applied: string[] };
  records: {
    events: number;
    eventAudit: number;
    appletStates: number;
    foodotronMeals: number;
    tabletronEvents: number;
    scheduleItems: number;
    transfers: number;
    calendarEvents: number;
    settings: number;
  } | null;
};

type Session = {
  email: string;
  role: SuiteRole;
  source: "access" | "local";
};

type ActivityEntry = {
  id: string;
  eventId: string;
  action: "created" | "updated" | "deleted";
  actor: string;
  revision: string;
  createdAt: string;
  payload?: { title?: string; date?: string };
};

type BackupPreview = {
  format: string;
  version: number;
  exportedAt: string;
  source: string;
  counts: Record<string, number>;
};

type BackupCheckpoint = {
  exportedAt: string;
  format: string;
  version: number;
  source: string;
  counts: Record<string, number>;
};

type AlphaReadinessItem = {
  key: string;
  label: string;
  state: "ready" | "attention" | "pending";
  value: string;
};

type CalendarImportSummary = {
  sourceId: string;
  sourceName: string;
  provider: CalendarProvider;
  enabled: boolean;
  color: string;
  lastSynced: string | null;
  lastError: string | null;
  eventCount: number;
  firstEventDate: string | null;
  lastEventDate: string | null;
  newestImportedAt: string | null;
  recentEvents: Array<{
    id: string;
    title: string;
    date: string;
    eventTime: string;
    location: string;
    importedAt: string;
  }>;
};

const launchReadiness = [
  {
    area: "Local event suite",
    status: "PILOT READY",
    detail: "Calendar, event files, applet tabs, shared backend routes, print reports, and backups are working locally.",
  },
  {
    area: "Daily operations data",
    status: "PILOT READY",
    detail: "New event files can start from the operations library, carrying its planning notes, requested items, and event type into the shared workspace.",
  },
  {
    area: "Reports",
    status: "PILOT READY",
    detail: "Master, Foodotron, Tabletron, and Scheduluotron reports are printable and branded for clipboard use.",
  },
  {
    area: "Calendar integrations",
    status: "PILOT READY",
    detail: "ICS feed sync, plus real Google and Microsoft account OAuth connections, are both available from Calendar Connections.",
  },
  {
    area: "Production accounts",
    status: "IN PROGRESS",
    detail: "Staff sign in and get admin/staff roles through Cloudflare Access, managed from Access & Users. Still to decide: production database location and who owns backups.",
  },
  {
    area: "Desktop packaging",
    status: "NEXT PHASE",
    detail: "Routes and backend are structured for reuse, but the desktop wrapper, installer, and data-location choices are not packaged yet.",
  },
];

function readableDate(value: string | null) {
  if (!value) return "Not available";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function daysSince(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 86_400_000));
}

type TemplatePresetEvent = NonNullable<NonNullable<OperationsTemplate["preset"]>["event"]>;
type TemplatePresetBlock = NonNullable<NonNullable<OperationsTemplate["preset"]>["scheduleBlocks"]>[number];
const templateBlockKinds = new Set<TemplatePresetBlock["kind"]>(["setup", "delivery", "staff", "service", "guest", "teardown", "note"]);

function formatTemplateScheduleBlocks(blocks: TemplatePresetBlock[] | undefined) {
  return (blocks ?? [])
    .map((block) => [block.start, block.end, block.kind, block.title, block.owner, block.location, block.notes].join("|"))
    .join("\n");
}

function parseTemplateScheduleBlocks(value: string): TemplatePresetBlock[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [start = "09:00", end = "09:30", rawKind = "note", title = "Schedule block", owner = "", location = "", ...notes] = line.split("|").map((item) => item.trim());
      const kind = templateBlockKinds.has(rawKind as TemplatePresetBlock["kind"]) ? rawKind as TemplatePresetBlock["kind"] : "note";
      return { start, end, kind, title, owner, location, notes: notes.join("|") };
    });
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SuiteSettings>(defaultSuiteSettings);
  const [status, setStatus] = useState("READY");
  const [loaded, setLoaded] = useState(false);
  const [backendChecked, setBackendChecked] = useState(false);
  const [serverRevision, setServerRevision] = useState<string | null | undefined>(undefined);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthChecking, setHealthChecking] = useState(true);
  const [calendarSyncing, setCalendarSyncing] = useState<Record<string, boolean>>({});
  const [calendarImportUrl, setCalendarImportUrl] = useState("");
  const [calendarImportHistory, setCalendarImportHistory] = useState<CalendarImportSummary[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [pendingBackup, setPendingBackup] = useState<Record<string, unknown> | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPreview | null>(null);
  const [backupCheckpoint, setBackupCheckpoint] = useState<BackupCheckpoint | null>(null);
  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [users, setUsers] = useState<SuiteUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userActionPending, setUserActionPending] = useState<Record<string, boolean>>({});
  const [oauthAccounts, setOauthAccounts] = useState<OAuthAccountSummary[]>([]);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [oauthDisconnecting, setOauthDisconnecting] = useState<Record<string, boolean>>({});
  const isEffectiveAdmin = session?.source === "local" || session?.role === "admin";
  const savePayload = useMemo(() => ({ ...settings, calendarSources: settings.calendarSources.map(calendarConfiguration) }), [settings]);
  const sharedSave = useGuardedSave<SuiteSettings>("/api/settings", savePayload, serverRevision, loaded && backendChecked && isEffectiveAdmin, setSettings, true);
  const displayedStatus = sharedSave.status === "READY" ? status : sharedSave.status;
  const backupInput = useRef<HTMLInputElement>(null);
  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings]);
  const backupAgeDays = daysSince(backupCheckpoint?.exportedAt ?? null);
  const alphaReadiness = useMemo<AlphaReadinessItem[]>(() => {
    const calendarStatus = calendarReadiness(settings.calendarSources);
    const backupFresh = backupCheckpoint && backupAgeDays !== null && backupAgeDays <= 7;
    const eventCount = health?.records?.events ?? 0;
    const auditCount = health?.records?.eventAudit ?? 0;
    const appletRecords = health?.records
      ? health.records.appletStates + health.records.foodotronMeals + health.records.tabletronEvents + health.records.scheduleItems
      : 0;
    const appletCoverage = ["tabletron", "foodotron", "scheduluotron"].filter((app) => (health?.applets?.[app] ?? 0) > 0).length;
    return [
      {
        key: "system",
        label: "System",
        state: health?.status === "ready" ? "ready" : healthChecking ? "pending" : "attention",
        value: healthChecking ? "Checking" : health?.status === "ready" ? "Backend ready" : "Needs check",
      },
      {
        key: "backup",
        label: "Backup",
        state: backupFresh ? "ready" : backupCheckpoint ? "attention" : "pending",
        value: backupCheckpoint
          ? backupAgeDays === 0
            ? "Today"
            : backupAgeDays === 1
              ? "Yesterday"
              : `${backupAgeDays ?? "Unknown"} days old`
          : "Needed",
      },
      {
        key: "events",
        label: "Real events",
        state: eventCount > 0 ? "ready" : "pending",
        value: `${eventCount} saved`,
      },
      {
        key: "calendar",
        label: "Calendar",
        ...calendarStatus,
      },
      {
        key: "audit",
        label: "History",
        state: auditCount > 0 ? "ready" : "pending",
        value: `${auditCount} entries`,
      },
      {
        key: "applets",
        label: "Applets",
        state: appletCoverage === 3 ? "ready" : eventCount > 0 ? "attention" : "pending",
        value: `${appletCoverage}/3 applets · ${appletRecords} records`,
      },
    ];
  }, [backupAgeDays, backupCheckpoint, health, healthChecking, settings.calendarSources]);
  const alphaReadyCount = alphaReadiness.filter((item) => item.state === "ready").length;

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const raw = localStorage.getItem(SETTINGS_STORE_KEY);
      let restored = defaultSuiteSettings;
      try { if (raw) restored = mergeSuiteSettings(JSON.parse(raw) as Partial<SuiteSettings>); } catch {}
      const rawBackupCheckpoint = localStorage.getItem(BACKUP_CHECKPOINT_KEY);
      if (rawBackupCheckpoint) {
        try {
          const checkpoint = JSON.parse(rawBackupCheckpoint) as BackupCheckpoint;
          if (checkpoint?.exportedAt && checkpoint?.counts) setBackupCheckpoint(checkpoint);
        } catch {}
      }
      try {
        const response = await fetch("/api/settings");
        if (!response.ok && response.status !== 404) throw new Error("Settings load failed");
        if (response.ok) {
          const data = (await response.json()) as { payload?: Partial<SuiteSettings>; updatedAt: string };
          setServerRevision(data.updatedAt);
          restored = mergeSuiteSettings(data.payload ?? restored);
          setStatus("DATABASE READY");
        } else setServerRevision(null);
        const calendarResponse = await fetch("/api/calendar-sources", { cache: "no-store" });
        if (!calendarResponse.ok) throw new Error("Calendar load failed");
        if (calendarResponse.ok) {
          const calendarData = await calendarResponse.json() as {
            sources?: SuiteSettings["calendarSources"];
            importHistory?: CalendarImportSummary[];
          };
          if (calendarData.sources) restored = { ...restored, calendarSources: calendarData.sources };
          setCalendarImportHistory(calendarData.importHistory ?? []);
        }
        setBackendChecked(true);
      } catch { setStatus("NOT ON SERVER"); }
      setSettings(restored);
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkHealth(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadActivity(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        setSession(response.ok ? await response.json() : null);
      } catch {
        setSession(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (session?.source === "access" && session.role === "admin") void loadUsers();
  }, [session]);

  useEffect(() => {
    if (session && isEffectiveAdmin) void loadOAuthAccounts();
  }, [session, isEffectiveAdmin]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get("oauthConnected");
      const error = params.get("oauthError");
      const accountId = params.get("accountId");
      if (!connected && !error) return;
      if (connected) {
        setOauthNotice(`${connected === "microsoft" ? "Microsoft" : "Google"} Calendar connected.`);
        if (accountId) void addSourceForOAuthAccount(accountId);
        void loadOAuthAccounts();
      } else if (error) {
        setOauthNotice(`Calendar connection failed (${error}). Check that OAuth credentials are configured.`);
      }
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState(null, "", url.toString());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(settings));
    if (!backendChecked) return;
  }, [settings, loaded, backendChecked]);

  function update(patch: Partial<SuiteSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  async function checkHealth() {
    setHealthChecking(true);
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const data = (await response.json()) as SystemHealth;
      setHealth(data);
    } catch {
      setHealth({
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
        database: "unavailable",
        schema: { expected: "0004_calendar_sync_records", current: null, applied: [] },
        records: null,
      });
    } finally {
      setHealthChecking(false);
    }
  }

  async function loadActivity() {
    setActivityLoading(true);
    try {
      const response = await fetch("/api/event-history?limit=30", { cache: "no-store" });
      if (!response.ok) throw new Error("Activity read failed");
      const result = await response.json() as { entries?: ActivityEntry[] };
      setActivity(Array.isArray(result.entries) ? result.entries : []);
    } catch {
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (!response.ok) throw new Error("Users read failed");
      const result = await response.json() as { users?: SuiteUser[] };
      setUsers(Array.isArray(result.users) ? result.users : []);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  async function updateUserRoleOrStatus(id: string, patch: { role?: SuiteRole; status?: SuiteUserStatus }) {
    setUserActionPending((current) => ({ ...current, [id]: true }));
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const result = await response.json().catch(() => ({})) as { user?: SuiteUser; error?: string };
      if (!response.ok) throw new Error(result.error || "User update failed");
      if (result.user) setUsers((current) => current.map((user) => user.id === id ? result.user! : user));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "User update failed");
    } finally {
      setUserActionPending((current) => ({ ...current, [id]: false }));
    }
  }

  async function loadOAuthAccounts() {
    try {
      const response = await fetch("/api/calendar-oauth/accounts", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json() as { accounts?: OAuthAccountSummary[] };
      setOauthAccounts(Array.isArray(result.accounts) ? result.accounts : []);
    } catch {}
  }

  async function addSourceForOAuthAccount(accountId: string) {
    if (settings.calendarSources.some((source) => source.oauthAccountId === accountId)) return;
    try {
      const response = await fetch("/api/calendar-oauth/accounts", { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as { accounts?: OAuthAccountSummary[] };
      const account = result.accounts?.find((item) => item.id === accountId);
      if (!account) return;
      update({
        calendarSources: [
          ...settings.calendarSources,
          {
            id: `calendar_${uid()}`,
            name: account.accountEmail || `${account.provider === "microsoft" ? "Outlook" : "Google"} Calendar`,
            provider: account.provider === "microsoft" ? "outlook" : "google",
            url: "",
            enabled: true,
            color: account.provider === "microsoft" ? "#45caff" : "#75ff47",
            syncMinutes: 15,
            oauthAccountId: account.id,
          },
        ],
      });
    } catch {}
  }

  async function disconnectOAuthAccount(id: string) {
    setOauthDisconnecting((current) => ({ ...current, [id]: true }));
    try {
      const response = await fetch(`/api/calendar-oauth/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Disconnect failed");
      setOauthAccounts((current) => current.filter((account) => account.id !== id));
      update({
        calendarSources: settings.calendarSources.map((source) =>
          source.oauthAccountId === id ? { ...source, oauthAccountId: undefined } : source
        ),
      });
    } catch {
      setOauthNotice("Could not disconnect that calendar account.");
    } finally {
      setOauthDisconnecting((current) => ({ ...current, [id]: false }));
    }
  }

  async function runAlphaCheck() {
    setStatus("ALPHA CHECK");
    await Promise.all([checkHealth(), loadActivity(), loadCalendarImportHistory()]);
  }

  async function quitEventoTron() {
    if (quitting) return;
    const confirmed = window.confirm("Quit EventoTron local backend? Double-click the app to restart.");
    if (!confirmed) return;
    setQuitting(true);
    setStatus("QUITTING");
    try {
      const response = await fetch("/api/local-runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "quit" }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Quit failed");
      setStatus("QUIT REQUESTED");
      window.setTimeout(() => {
        document.body.classList.add("eventotron-quitting");
      }, 50);
    } catch {
      setStatus("QUIT FAILED");
      setQuitting(false);
    }
  }

  function addRoom() {
    update({
      rooms: [...settings.rooms, { id: `room_${uid()}`, name: "New Room", width: 26, height: 26 }],
    });
  }

  function addCalendarSource() {
    update({
      calendarSources: [
        ...settings.calendarSources,
        {
          id: `calendar_${uid()}`,
          name: "New work calendar",
          provider: "ical",
          url: "",
          enabled: true,
          color: "#75ff47",
          syncMinutes: 15,
        },
      ],
    });
  }

  function importGoogleCalendarLink() {
    const ids = extractGoogleCalendarIds(calendarImportUrl);
    if (!ids.length) {
      setStatus("NO CALENDAR IDS");
      return;
    }
    const existing = new Set(settings.calendarSources.map((source) => source.url));
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
      setStatus("CALENDARS ALREADY ADDED");
      return;
    }
    update({ calendarSources: [...settings.calendarSources, ...additions] });
    setCalendarImportUrl("");
    setStatus(`ADDED ${additions.length} CALENDAR${additions.length === 1 ? "" : "S"}`);
  }

  function updateCalendarSource(id: string, patch: Partial<SuiteSettings["calendarSources"][number]>) {
    update({
      calendarSources: settings.calendarSources.map((source) => source.id === id ? { ...source, ...patch } : source),
    });
  }

  function removeCalendarSource(id: string) {
    update({ calendarSources: settings.calendarSources.filter((source) => source.id !== id) });
  }

  function addOperationsTemplate() {
    update({
      operationsTemplates: [
        ...settings.operationsTemplates,
        {
          id: `template_${uid()}`,
          name: "New operations template",
          category: "event",
          summary: "Reusable event operations checklist.",
          checklist: ["Add the first checklist item."],
        },
      ],
    });
  }

  function updateOperationsTemplate(id: string, patch: Partial<OperationsTemplate>) {
    update({
      operationsTemplates: settings.operationsTemplates.map((template) =>
        template.id === id ? { ...template, ...patch } : template,
      ),
    });
  }

  function updateTemplatePresetEvent(id: string, patch: Partial<TemplatePresetEvent>) {
    update({
      operationsTemplates: settings.operationsTemplates.map((template) =>
        template.id === id
          ? {
              ...template,
              preset: {
                ...(template.preset ?? {}),
                event: {
                  ...(template.preset?.event ?? {}),
                  ...patch,
                },
              },
            }
          : template,
      ),
    });
  }

  function updateTemplatePresetBlocks(id: string, value: string) {
    update({
      operationsTemplates: settings.operationsTemplates.map((template) =>
        template.id === id
          ? {
              ...template,
              preset: {
                ...(template.preset ?? {}),
                scheduleBlocks: parseTemplateScheduleBlocks(value),
              },
            }
          : template,
      ),
    });
  }

  function removeOperationsTemplate(id: string) {
    update({ operationsTemplates: settings.operationsTemplates.filter((template) => template.id !== id) });
  }

  async function syncCalendarSource(source: SuiteSettings["calendarSources"][number]) {
    if (!source.oauthAccountId && !source.url.trim()) {
      updateCalendarSource(source.id, { lastError: "Add a feed URL first." });
      return;
    }
    setCalendarSyncing((current) => ({ ...current, [source.id]: true }));
    try {
      if (!await sharedSave.save()) throw new Error("Save calendar settings before syncing.");
      const response = await fetch("/api/calendar-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const result = await response.json() as {
        source?: SuiteSettings["calendarSources"][number];
        events?: unknown[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Calendar sync failed");
      updateCalendarSource(source.id, result.source ?? {
        lastSynced: new Date().toISOString(),
        lastError: "",
        eventCount: result.events?.length ?? 0,
      });
      await loadCalendarImportHistory();
      setStatus(`CALENDAR ${result.events?.length ?? 0} EVENTS`);
    } catch (error) {
      updateCalendarSource(source.id, { lastError: error instanceof Error ? error.message : "Calendar sync failed" });
      setStatus("CALENDAR ERROR");
    } finally {
      setCalendarSyncing((current) => ({ ...current, [source.id]: false }));
    }
  }

  async function loadCalendarImportHistory() {
    try {
      const response = await fetch("/api/calendar-sources", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as {
        sources?: SuiteSettings["calendarSources"];
        importHistory?: CalendarImportSummary[];
      };
      if (data.sources?.length) update({ calendarSources: data.sources });
      setCalendarImportHistory(data.importHistory ?? []);
    } catch {}
  }

  function exportSettings() {
    const blob = new Blob([settingsJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `eventotron-settings-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportWorkspaceBackup() {
    setStatus("EXPORTING");
    try {
      const response = await fetch("/api/workspace-backup");
      if (!response.ok) throw new Error("Workspace backup failed");
      const backup = await response.json() as {
        format?: string;
        version?: number;
        exportedAt?: string;
        source?: string;
        counts?: Record<string, number> & { events?: number };
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `eventotron-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      const checkpoint = {
        exportedAt: backup.exportedAt ?? new Date().toISOString(),
        format: backup.format ?? "eventotron-workspace-backup",
        version: backup.version ?? 1,
        source: backup.source ?? "database",
        counts: backup.counts ?? {},
      };
      localStorage.setItem(BACKUP_CHECKPOINT_KEY, JSON.stringify(checkpoint));
      setBackupCheckpoint(checkpoint);
      setStatus(`BACKUP V${backup.version ?? 1} / ${backup.counts?.events ?? 0} EVENTS`);
    } catch {
      const fallback = {
        format: "eventotron-local-browser-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        localStorage: {
          settings,
          events: localStorage.getItem("eventotron-events-v1"),
          tabletron: localStorage.getItem("tabletron-project-v2"),
          foodotron: localStorage.getItem("foodotron-plan-v1"),
          scheduluotron: localStorage.getItem("eventotron-scheduluotron-v1"),
        },
      };
      const blob = new Blob([JSON.stringify(fallback, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `eventotron-local-browser-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      const checkpoint = {
        exportedAt: fallback.exportedAt,
        format: fallback.format,
        version: fallback.version,
        source: "browser storage",
        counts: Object.fromEntries(Object.entries(fallback.localStorage).map(([key, value]) => [key, value ? 1 : 0])),
      };
      localStorage.setItem(BACKUP_CHECKPOINT_KEY, JSON.stringify(checkpoint));
      setBackupCheckpoint(checkpoint);
      setStatus("LOCAL BACKUP");
    }
  }

  async function reviewWorkspaceBackup(file?: File) {
    if (!file) return;
    setStatus("CHECKING BACKUP");
    try {
      const backup = JSON.parse(await file.text()) as Record<string, unknown> & {
        format?: string;
        localStorage?: Record<string, string | SuiteSettings | null>;
      };
      if (backup.format === "eventotron-local-browser-backup" && backup.localStorage) {
        setPendingBackup(backup);
        setBackupPreview({
          format: backup.format,
          version: Number(backup.version) || 1,
          exportedAt: typeof backup.exportedAt === "string" ? backup.exportedAt : "Unknown date",
          source: "browser storage",
          counts: Object.fromEntries(Object.entries(backup.localStorage).map(([key, value]) => [key, value ? 1 : 0])),
        });
        setStatus("BACKUP REVIEW READY");
        return;
      }
      const response = await fetch("/api/workspace-backup?mode=validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      if (!response.ok) throw new Error("Workspace backup is not recognized");
      const result = await response.json() as BackupPreview;
      setPendingBackup(backup);
      setBackupPreview(result);
      setStatus("BACKUP REVIEW READY");
    } catch {
      setPendingBackup(null);
      setBackupPreview(null);
      setStatus("BACKUP NOT RECOGNIZED");
    } finally {
      if (backupInput.current) backupInput.current.value = "";
    }
  }

  function closeBackupReview() {
    if (restoreInProgress) return;
    setPendingBackup(null);
    setBackupPreview(null);
    setStatus("RESTORE CANCELLED");
  }

  async function restoreReviewedBackup() {
    if (!pendingBackup || !backupPreview) return;
    setRestoreInProgress(true);
    setStatus("RESTORING");
    try {
      if (pendingBackup.format === "eventotron-local-browser-backup") {
        const localStorageBackup = pendingBackup.localStorage as Record<string, string | SuiteSettings | null> | undefined;
        if (!localStorageBackup) throw new Error("Local backup is incomplete");
        if (localStorageBackup.settings) {
          const restored = mergeSuiteSettings(localStorageBackup.settings as Partial<SuiteSettings>);
          localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(restored));
          setSettings(restored);
        }
        if (typeof localStorageBackup.events === "string") localStorage.setItem("eventotron-events-v1", localStorageBackup.events);
        if (typeof localStorageBackup.tabletron === "string") localStorage.setItem("tabletron-project-v2", localStorageBackup.tabletron);
        if (typeof localStorageBackup.foodotron === "string") localStorage.setItem("foodotron-plan-v1", localStorageBackup.foodotron);
        if (typeof localStorageBackup.scheduluotron === "string") localStorage.setItem("eventotron-scheduluotron-v1", localStorageBackup.scheduluotron);
        setStatus("LOCAL RESTORED");
      } else {
        const response = await fetch("/api/workspace-backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pendingBackup),
        });
        if (!response.ok) throw new Error("Workspace restore failed");
        const result = await response.json() as { counts?: { events?: number } };
        setStatus(`RESTORED ${result.counts?.events ?? 0} EVENTS`);
      }
      setPendingBackup(null);
      setBackupPreview(null);
      void checkHealth();
      void loadActivity();
    } catch {
      setStatus("RESTORE FAILED");
    } finally {
      setRestoreInProgress(false);
    }
  }

  return (
    <div className="suite-frame">
      <SuiteChrome active="settings" />
      <OperationsTicker active="settings" />
      <main className="settings-applet">
        <SaveRecovery state={sharedSave} />
        <header className="settings-page-header">
          <div>
            <small>EVENTOTRON // CONTROL PANEL</small>
            <h1>Settings</h1>
          </div>
          <button className="save-state" data-tone={saveStatusTone(displayedStatus)} title={saveStatusHint(displayedStatus)} disabled>{displayedStatus}</button>
          <button onClick={exportWorkspaceBackup}>EXPORT WORKSPACE</button>
          <button onClick={() => backupInput.current?.click()}>RESTORE</button>
          <input ref={backupInput} className="backup-input" type="file" accept="application/json,.json" aria-label="Review EventoTron workspace backup before restoring" onChange={(event) => void reviewWorkspaceBackup(event.target.files?.[0])} />
          <button onClick={exportSettings}>EXPORT</button>
          <button className="primary" onClick={() => update(defaultSuiteSettings)}>RESET DEFAULTS</button>
          <button className="danger" onClick={() => void quitEventoTron()} disabled={quitting}>{quitting ? "QUITTING" : "QUIT APP"}</button>
        </header>

        <section className="settings-layout">
          <section className="settings-card settings-alpha-card">
            <div className="settings-card-heading"><span>00</span><h3>Private Alpha</h3><button onClick={() => void runAlphaCheck()}>RUN CHECK</button></div>
            <div className="alpha-overview">
              <div>
                <small>ONE OPERATOR / REAL EVENTS</small>
                <b>{alphaReadyCount} / {alphaReadiness.length} READY</b>
              </div>
              <div className="alpha-actions">
                <button onClick={exportWorkspaceBackup}>EXPORT CHECKPOINT</button>
                <a href="/master-report">MASTER REPORT</a>
              </div>
            </div>
            <div className="alpha-readiness-grid">
              {alphaReadiness.map((item) => (
                <article className={`alpha-readiness-item ${item.state}`} key={item.key}>
                  <small>{item.label}</small>
                  <b>{item.value}</b>
                </article>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span>01</span><h3>Workspace</h3></div>
            <label className="settings-field wide"><span>Workspace name</span><input value={settings.workspaceName} onChange={(event) => update({ workspaceName: event.target.value })} /></label>
            <label className="settings-field wide"><span>Venue name</span><input value={settings.venueName} onChange={(event) => update({ venueName: event.target.value })} /></label>
            <div className="settings-two-up">
              <label className="settings-field"><span>Time zone</span><select value={settings.timezone} onChange={(event) => update({ timezone: event.target.value })}><option value="America/Los_Angeles">Pacific</option><option value="America/Denver">Mountain</option><option value="America/Chicago">Central</option><option value="America/New_York">Eastern</option><option value="UTC">UTC</option></select></label>
              <label className="settings-field"><span>Week starts on</span><select value={settings.weekStartsOn} onChange={(event) => update({ weekStartsOn: event.target.value as SuiteSettings["weekStartsOn"] })}><option value="sunday">Sunday</option><option value="monday">Monday</option></select></label>
            </div>
            <label className="settings-check"><input type="checkbox" checked={settings.autoSave} onChange={(event) => update({ autoSave: event.target.checked })} /><span>Autosave event and applet edits</span></label>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span>02</span><h3>Rooms</h3><button onClick={addRoom}>+ ADD ROOM</button></div>
            <div className="settings-list">
              {settings.rooms.map((room) => (
                <div className="settings-room-row" key={room.id}>
                  <input aria-label="Room name" value={room.name} onChange={(event) => update({ rooms: settings.rooms.map((item) => item.id === room.id ? { ...item, name: event.target.value } : item) })} />
                  <input aria-label="Room width" type="number" min="1" value={room.width} onChange={(event) => update({ rooms: settings.rooms.map((item) => item.id === room.id ? { ...item, width: Number(event.target.value) } : item) })} />
                  <input aria-label="Room height" type="number" min="1" value={room.height} onChange={(event) => update({ rooms: settings.rooms.map((item) => item.id === room.id ? { ...item, height: Number(event.target.value) } : item) })} />
                  <button onClick={() => update({ rooms: settings.rooms.filter((item) => item.id !== room.id) })}>REMOVE</button>
                </div>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span>03</span><h3>People and Equipment</h3></div>
            <label className="settings-field wide"><span>Staff names</span><textarea value={settings.staff.join("\n")} onChange={(event) => update({ staff: event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean) })} /></label>
            <label className="settings-field wide"><span>Equipment library</span><textarea value={settings.equipment.join("\n")} onChange={(event) => update({ equipment: event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean) })} /></label>
          </section>

          <section className="settings-card settings-calendar-card">
            <div className="settings-card-heading"><span>04</span><h3>Calendar Connections</h3><button onClick={addCalendarSource}>+ ADD CALENDAR</button></div>
            <p className="settings-note">Paste a Google Calendar link with one or more calendar IDs, or add an ICS feed manually. Connect a Google or Microsoft account below to sync private calendars without a public feed link.</p>
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
            {isEffectiveAdmin ? (
              <div className="calendar-oauth-box">
                {oauthNotice ? <p className="settings-note">{oauthNotice}</p> : null}
                <div className="calendar-oauth-connect-row">
                  <a href="/api/calendar-oauth/google/start">CONNECT GOOGLE</a>
                  <a href="/api/calendar-oauth/microsoft/start">CONNECT MICROSOFT</a>
                </div>
                {oauthAccounts.length ? (
                  <div className="settings-list">
                    {oauthAccounts.map((account) => (
                      <div className="calendar-oauth-account-row" key={account.id}>
                        <span>{account.provider === "microsoft" ? "OUTLOOK" : "GOOGLE"}</span>
                        <span>{account.accountEmail || "Connected account"}</span>
                        <button
                          disabled={Boolean(oauthDisconnecting[account.id])}
                          onClick={() => void disconnectOAuthAccount(account.id)}
                        >
                          {oauthDisconnecting[account.id] ? "DISCONNECTING" : "DISCONNECT"}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {settings.calendarSources.length ? settings.calendarSources.map((source) => {
              const history = calendarImportHistory.find((item) => item.sourceId === source.id);
              return (
                <div className="calendar-source" key={source.id}>
                  <div className="calendar-source-topline">
                    <span className="calendar-source-swatch" style={{ background: source.color }} />
                    <input value={source.name} aria-label="Calendar name" onChange={(event) => updateCalendarSource(source.id, { name: event.target.value })} />
                    <label className="settings-check compact-check"><input type="checkbox" checked={source.enabled} onChange={(event) => updateCalendarSource(source.id, { enabled: event.target.checked })} /><span>SHOW</span></label>
                    <button onClick={() => removeCalendarSource(source.id)}>REMOVE</button>
                  </div>
                  <div className="settings-two-up">
                    <label className="settings-field"><span>Provider</span><select value={source.provider} onChange={(event) => updateCalendarSource(source.id, { provider: event.target.value as CalendarProvider })}>{Object.entries(calendarProviderLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                    <label className="settings-field"><span>Color</span><input type="color" value={source.color} onChange={(event) => updateCalendarSource(source.id, { color: event.target.value })} /></label>
                  </div>
                  {source.oauthAccountId ? (
                    <p className="settings-note">Connected via OAuth — {oauthAccounts.find((account) => account.id === source.oauthAccountId)?.accountEmail || "linked account"}.</p>
                  ) : (
                    <label className="settings-field wide"><span>Feed URL or account</span><input value={source.url} onChange={(event) => updateCalendarSource(source.id, { url: event.target.value })} /></label>
                  )}
                  <div className="calendar-source-footer">
                    <span>{calendarProviderLabels[source.provider]}</span>
                    <span>{source.lastError || (source.eventCount !== undefined ? `${source.eventCount} EVENTS` : source.url ? "READY TO SYNC" : "SETUP NEEDED")}</span>
                    <button className="calendar-sync-button" disabled={Boolean(calendarSyncing[source.id])} onClick={() => void syncCalendarSource(source)}>{calendarSyncing[source.id] ? "SYNCING" : "SYNC NOW"}</button>
                  </div>
                  <div className="calendar-import-history">
                    <div className="calendar-import-metrics">
                      <div><small>LAST SYNC</small><b>{readableDate(history?.lastSynced ?? source.lastSynced ?? null)}</b></div>
                      <div><small>IMPORTED</small><b>{history?.eventCount ?? source.eventCount ?? 0}</b></div>
                      <div><small>DATE RANGE</small><b>{history?.firstEventDate && history.lastEventDate ? `${readableDate(history.firstEventDate)} - ${readableDate(history.lastEventDate)}` : "No synced events"}</b></div>
                    </div>
                    {history?.lastError ? <p className="calendar-import-error">{history.lastError}</p> : null}
                    {history?.recentEvents.length ? (
                      <div className="calendar-import-recent">
                        <span>Recent imported events</span>
                        {history.recentEvents.map((event) => (
                          <div className="calendar-import-event" key={event.id}>
                            <b>{event.title}</b>
                            <small>{readableDate(event.date)}{event.eventTime ? ` // ${event.eventTime}` : ""}{event.location ? ` // ${event.location}` : ""}</small>
                          </div>
                        ))}
                      </div>
                    ) : <div className="calendar-import-empty">No imported events stored for this source yet.</div>}
                  </div>
                </div>
              );
            }) : <div className="settings-empty">No external calendars connected yet.</div>}
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span>05</span><h3>Reports</h3></div>
            <label className="settings-field"><span>Paper size</span><select value={settings.reportPaper} onChange={(event) => update({ reportPaper: event.target.value as SuiteSettings["reportPaper"] })}><option value="letter">Letter</option><option value="a4">A4</option></select></label>
            <label className="settings-check"><input type="checkbox" checked={settings.reportIncludeCosts} onChange={(event) => update({ reportIncludeCosts: event.target.checked })} /><span>Include costs on reports</span></label>
            <label className="settings-check"><input type="checkbox" checked={settings.reportIncludeLayout} onChange={(event) => update({ reportIncludeLayout: event.target.checked })} /><span>Include Tabletron layout picture</span></label>
          </section>

          <section className="settings-card settings-operations-card">
            <div className="settings-card-heading"><span>06</span><h3>Operations Library</h3><button onClick={addOperationsTemplate}>+ ADD TEMPLATE</button></div>
            <p className="settings-note">Reusable binder material for recurring event types, room setups, food service, MOD checklists, maintenance ticklers, contracts, and volunteer workflows.</p>
            <div className="operations-template-list">
              {settings.operationsTemplates.map((template) => (
                <article className="operations-template" key={template.id}>
                  <div className="operations-template-topline">
                    <input aria-label="Template name" value={template.name} onChange={(event) => updateOperationsTemplate(template.id, { name: event.target.value })} />
                    <select aria-label="Template category" value={template.category} onChange={(event) => updateOperationsTemplate(template.id, { category: event.target.value as OperationsTemplate["category"] })}>
                      <option value="event">Event</option>
                      <option value="food">Food</option>
                      <option value="room">Room</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="volunteer">Volunteer</option>
                      <option value="contract">Contract</option>
                    </select>
                    <button onClick={() => removeOperationsTemplate(template.id)}>REMOVE</button>
                  </div>
                  <label className="settings-field wide"><span>Summary</span><input value={template.summary} onChange={(event) => updateOperationsTemplate(template.id, { summary: event.target.value })} /></label>
                  <label className="settings-field wide"><span>Checklist items</span><textarea value={template.checklist.join("\n")} onChange={(event) => updateOperationsTemplate(template.id, { checklist: event.target.value.split(/\n+/).map((item) => item.trim()).filter(Boolean) })} /></label>
                  <label className="settings-field wide"><span>Food / hospitality notes</span><textarea value={template.preset?.food?.notes ?? ""} onChange={(event) => updateOperationsTemplate(template.id, { preset: { ...template.preset, food: { notes: event.target.value, shoppingItems: template.preset?.food?.shoppingItems ?? [] } } })} /></label>
                  <label className="settings-field wide"><span>Additional shopping items</span><textarea value={(template.preset?.food?.shoppingItems ?? []).join("\n")} onChange={(event) => updateOperationsTemplate(template.id, { preset: { ...template.preset, food: { notes: template.preset?.food?.notes ?? "", shoppingItems: event.target.value.split("\n").map(item => item.trim()).filter(Boolean) } } })} /></label>
                  <div className="template-room-setups">{settings.rooms.map(room => {
                    const setup = template.preset?.roomSetup?.find(item => item.room === room.name);
                    function changeRoom(patch: { notes?: string; items?: string[] }) {
                      const next = { room: room.name, notes: setup?.notes ?? "", items: setup?.items ?? [], ...patch };
                      updateOperationsTemplate(template.id, { preset: { ...template.preset, roomSetup: [...(template.preset?.roomSetup ?? []).filter(item => item.room !== room.name), next] } });
                    }
                    return <details key={room.id}><summary>{room.name}</summary><label className="settings-field"><span>Room setup notes</span><textarea value={setup?.notes ?? ""} onChange={e => changeRoom({ notes: e.target.value })} /></label><label className="settings-field"><span>Room equipment</span><input value={(setup?.items ?? []).join(", ")} onChange={e => changeRoom({ items: e.target.value.split(",").map(item => item.trim()).filter(Boolean) })} /></label></details>;
                  })}</div>
                  <div className="template-preset-editor">
                    <div className="template-preset-heading">
                      <span>Event Preset</span>
                      <small>Used when creating a new event or first opening Scheduluotron.</small>
                    </div>
                    <div className="template-preset-grid">
                      <label className="settings-field"><span>Event time</span><input value={template.preset?.event?.eventTime ?? ""} onChange={(event) => updateTemplatePresetEvent(template.id, { eventTime: event.target.value })} placeholder="11:30 AM-1:00 PM" /></label>
                      <label className="settings-field"><span>Rental time</span><input value={template.preset?.event?.rentalTime ?? ""} onChange={(event) => updateTemplatePresetEvent(template.id, { rentalTime: event.target.value })} placeholder="9:00 AM-2:00 PM" /></label>
                      <label className="settings-field"><span>Main space</span><input value={template.preset?.event?.space ?? ""} onChange={(event) => updateTemplatePresetEvent(template.id, { space: event.target.value })} placeholder="Auditorium" /></label>
                      <label className="settings-field"><span>Manager</span><input value={template.preset?.event?.manager ?? ""} onChange={(event) => updateTemplatePresetEvent(template.id, { manager: event.target.value })} placeholder="MOD name" /></label>
                      <label className="settings-field"><span>Attendees</span><input type="number" min="0" value={template.preset?.event?.attendees ?? 0} onChange={(event) => updateTemplatePresetEvent(template.id, { attendees: Number(event.target.value) })} /></label>
                      <label className="settings-field"><span>Deposit</span><input type="number" min="0" value={template.preset?.event?.deposit ?? 0} onChange={(event) => updateTemplatePresetEvent(template.id, { deposit: Number(event.target.value) })} /></label>
                    </div>
                    <label className="settings-field wide"><span>Requested items preset</span><input value={template.preset?.event?.requestedItems ?? ""} onChange={(event) => updateTemplatePresetEvent(template.id, { requestedItems: event.target.value })} placeholder="Tables, chairs, linens, hospitality, cash bags" /></label>
                    <label className="settings-field wide"><span>Schedule preset blocks</span><textarea value={formatTemplateScheduleBlocks(template.preset?.scheduleBlocks)} onChange={(event) => updateTemplatePresetBlocks(template.id, event.target.value)} placeholder="09:00|10:15|setup|Set auditorium|Room crew|Auditorium|Round tables and black tablecloths" /></label>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="settings-card settings-backup-card">
            <div className="settings-card-heading"><span>07</span><h3>Backup And Recovery</h3><button onClick={exportWorkspaceBackup}>EXPORT WORKSPACE</button></div>
            <div className={`backup-status-banner ${backupCheckpoint && backupAgeDays !== null && backupAgeDays <= 7 ? "fresh" : "stale"}`}>
              <small>RECOVERY READINESS</small>
              <b>{backupCheckpoint ? backupAgeDays === 0 ? "BACKED UP TODAY" : backupAgeDays === 1 ? "BACKED UP YESTERDAY" : `${backupAgeDays ?? "UNKNOWN"} DAYS OLD` : "NO BACKUP RECORDED"}</b>
            </div>
            <div className="backup-checkpoint-grid">
              <div><small>LAST EXPORT</small><b>{backupCheckpoint ? readableDate(backupCheckpoint.exportedAt) : "Not recorded"}</b></div>
              <div><small>FORMAT</small><b>{backupCheckpoint ? `V${backupCheckpoint.version}` : "PENDING"}</b></div>
              <div><small>SOURCE</small><b>{backupCheckpoint?.source.toUpperCase() ?? "PENDING"}</b></div>
              <div><small>EVENTS</small><b>{backupCheckpoint?.counts.events ?? 0}</b></div>
              <div><small>CALENDAR RECORDS</small><b>{backupCheckpoint?.counts.calendarEvents ?? 0}</b></div>
              <div><small>APPLET RECORDS</small><b>{backupCheckpoint ? (backupCheckpoint.counts.appletStates ?? 0) + (backupCheckpoint.counts.foodotronMeals ?? 0) + (backupCheckpoint.counts.tabletronEvents ?? 0) + (backupCheckpoint.counts.scheduleItems ?? 0) : 0}</b></div>
            </div>
            <div className="backup-actions-row">
              <button onClick={() => backupInput.current?.click()}>REVIEW RESTORE FILE</button>
              <span>{backupPreview ? "REVIEW OPEN" : "RESTORE REQUIRES REVIEW"}</span>
            </div>
          </section>

          <section className="settings-card settings-health-card">
            <div className="settings-card-heading"><span>08</span><h3>Event Activity</h3><button onClick={() => void loadActivity()} disabled={activityLoading}>{activityLoading ? "LOADING" : "REFRESH ACTIVITY"}</button></div>
            <p className="settings-note">Recent permanent event changes. Deleted files remain visible here so a handoff or recovery can be traced.</p>
            {activity.length ? <div className="activity-list">
              {activity.map((entry) => (
                <article className={`activity-row ${entry.action}`} key={entry.id}>
                  <div className="activity-action"><b>{entry.action.toUpperCase()}</b><small>{new Date(entry.createdAt).toLocaleString()}</small></div>
                  <div className="activity-event"><b>{entry.payload?.title || entry.eventId}</b><small>{entry.payload?.date || entry.eventId}</small></div>
                  <div className="activity-actor"><small>OPERATOR</small><b>{entry.actor || "Local operator"}</b></div>
                </article>
              ))}
            </div> : <div className="settings-empty">{activityLoading ? "Loading recent event activity." : "No event changes have been recorded yet."}</div>}
          </section>

          <section className="settings-card settings-health-card">
            <div className="settings-card-heading"><span>09</span><h3>System Status</h3><button onClick={() => void checkHealth()} disabled={healthChecking}>{healthChecking ? "CHECKING" : "CHECK AGAIN"}</button></div>
            <div className={`health-banner health-${health?.status ?? "checking"}`}>
              <small>BACKEND STATUS</small>
              <b>{healthChecking ? "CHECKING" : health?.status === "ready" ? "BACKEND READY" : "ATTENTION REQUIRED"}</b>
            </div>
            <div className="health-grid">
              <div><small>DATABASE</small><b>{health?.database?.toUpperCase() ?? "CHECKING"}</b></div>
              <div><small>SCHEMA</small><b>{health?.schema.current ?? "CHECKING"}</b></div>
              <div><small>EVENTS</small><b>{health?.records?.events ?? "—"}</b></div>
              <div><small>AUDIT ENTRIES</small><b>{health?.records?.eventAudit ?? "—"}</b></div>
              <div><small>APPLET RECORDS</small><b>{health?.records ? health.records.appletStates + health.records.foodotronMeals + health.records.tabletronEvents + health.records.scheduleItems : "—"}</b></div>
              <div><small>TRANSFERS</small><b>{health?.records?.transfers ?? "—"}</b></div>
              <div><small>RESPONSE</small><b>{health ? `${health.latencyMs} MS` : "—"}</b></div>
            </div>
            <p className="health-checked">LAST CHECK {health ? new Date(health.checkedAt).toLocaleString() : "PENDING"}</p>
          </section>

          <section className="settings-card settings-launch-card">
            <div className="settings-card-heading"><span>10</span><h3>Launch Readiness</h3></div>
            <div className="launch-readiness-list">
              {launchReadiness.map((item) => (
                <article className="launch-readiness-item" key={item.area}>
                  <div>
                    <small>{item.status}</small>
                    <h4>{item.area}</h4>
                  </div>
                  <p>{item.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span>11</span><h3>Access &amp; Users</h3>{session?.source === "access" && session.role === "admin" ? <button onClick={() => void loadUsers()} disabled={usersLoading}>{usersLoading ? "LOADING" : "REFRESH"}</button> : null}</div>
            {!session ? (
              <div className="settings-empty">Checking session.</div>
            ) : session.source === "local" ? (
              <p className="settings-note">Local desktop mode runs as a single admin operator. User management applies to hosted deployments protected by Cloudflare Access.</p>
            ) : session.role !== "admin" ? (
              <p className="settings-note">Signed in as {session.email} (STAFF). Only admins can view and manage staff access.</p>
            ) : (
              <>
                <p className="settings-note">Signed in as {session.email} (ADMIN). Staff are provisioned automatically the first time they sign in through Cloudflare Access.</p>
                <div className="settings-list">
                  {users.length ? users.map((user) => (
                    <div className="settings-user-row" key={user.id}>
                      <span className="settings-user-email">{user.email}</span>
                      <select
                        aria-label={`Role for ${user.email}`}
                        value={user.role}
                        disabled={Boolean(userActionPending[user.id])}
                        onChange={(event) => void updateUserRoleOrStatus(user.id, { role: event.target.value as SuiteRole })}
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                      <span className={`settings-user-status ${user.status}`}>{user.status.toUpperCase()}</span>
                      <button
                        disabled={Boolean(userActionPending[user.id])}
                        onClick={() => void updateUserRoleOrStatus(user.id, { status: user.status === "revoked" ? "active" : "revoked" })}
                      >
                        {user.status === "revoked" ? "REINSTATE" : "REMOVE"}
                      </button>
                    </div>
                  )) : <div className="settings-empty">{usersLoading ? "Loading users." : "No staff have signed in yet."}</div>}
                </div>
              </>
            )}
          </section>
        </section>
      </main>
      {backupPreview && <div className="backup-review-backdrop" role="presentation" onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeBackupReview();
      }}>
        <section className="backup-review-panel" role="dialog" aria-modal="true" aria-labelledby="backup-review-title">
          <header>
            <div><small>RECOVERY CHECKPOINT</small><h2 id="backup-review-title">Review Workspace Backup</h2></div>
            <button aria-label="Close backup review" onClick={closeBackupReview} disabled={restoreInProgress}>×</button>
          </header>
          <div className="backup-review-body">
            <p>This restore will add or update the records in this backup. Review the source and counts before continuing.</p>
            <div className="backup-review-summary">
              <div><small>EXPORTED</small><b>{backupPreview.exportedAt === "Unknown date" ? backupPreview.exportedAt : new Date(backupPreview.exportedAt).toLocaleString()}</b></div>
              <div><small>SOURCE</small><b>{backupPreview.source.toUpperCase()}</b></div>
              <div><small>FORMAT</small><b>V{backupPreview.version}</b></div>
            </div>
            <div className="backup-review-counts">
              {Object.entries(backupPreview.counts).filter(([, count]) => count > 0).map(([name, count]) => <div key={name}><small>{name.replace(/([A-Z])/g, " $1").toUpperCase()}</small><b>{count}</b></div>)}
            </div>
          </div>
          <footer>
            <button onClick={closeBackupReview} disabled={restoreInProgress}>CANCEL</button>
            <button className="primary" onClick={() => void restoreReviewedBackup()} disabled={restoreInProgress}>{restoreInProgress ? "RESTORING" : "RESTORE REVIEWED BACKUP"}</button>
          </footer>
        </section>
      </div>}
    </div>
  );
}
