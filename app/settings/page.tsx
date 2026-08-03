"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SuiteChrome } from "../SuiteChrome";
import {
  SETTINGS_STORE_KEY,
  calendarProviderLabels,
  defaultSuiteSettings,
  mergeSuiteSettings,
  type CalendarProvider,
  type SuiteSettings,
} from "../suite-settings";

const uid = () => Math.random().toString(36).slice(2, 9);

type SystemHealth = {
  status: "ready" | "migration-required" | "unavailable";
  checkedAt: string;
  latencyMs: number;
  database: "connected" | "unavailable";
  schema: { expected: string; current: string | null; applied: string[] };
  records: {
    events: number;
    appletStates: number;
    foodotronMeals: number;
    tabletronEvents: number;
    scheduleItems: number;
    transfers: number;
    settings: number;
  } | null;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SuiteSettings>(defaultSuiteSettings);
  const [status, setStatus] = useState("LOCAL READY");
  const [loaded, setLoaded] = useState(false);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [healthChecking, setHealthChecking] = useState(true);
  const backupInput = useRef<HTMLInputElement>(null);
  const settingsJson = useMemo(() => JSON.stringify(settings, null, 2), [settings]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const raw = localStorage.getItem(SETTINGS_STORE_KEY);
      let restored = raw ? mergeSuiteSettings(JSON.parse(raw) as Partial<SuiteSettings>) : defaultSuiteSettings;
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const data = (await response.json()) as { payload?: Partial<SuiteSettings> };
          restored = mergeSuiteSettings(data.payload ?? restored);
          setStatus("DATABASE READY");
        }
      } catch {}
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
    if (!loaded) return;
    localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(settings));
    const timer = window.setTimeout(() => {
      setStatus("SAVING");
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: settings }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Settings save failed");
          setStatus("SAVED");
        })
        .catch(() => setStatus("LOCAL ONLY"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [settings, loaded]);

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
        schema: { expected: "0003_suite_integrity_indexes", current: null, applied: [] },
        records: null,
      });
    } finally {
      setHealthChecking(false);
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
      const backup = await response.json() as { version?: number; counts?: { events?: number } };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `eventotron-workspace-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
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
      setStatus("LOCAL BACKUP");
    }
  }

  async function importWorkspaceBackup(file?: File) {
    if (!file) return;
    setStatus("RESTORING");
    try {
      const backup = JSON.parse(await file.text()) as {
        format?: string;
        localStorage?: Record<string, string | SuiteSettings | null>;
      };
      if (backup.format === "eventotron-local-browser-backup" && backup.localStorage) {
        if (backup.localStorage.settings) {
          const restored = mergeSuiteSettings(backup.localStorage.settings as Partial<SuiteSettings>);
          localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(restored));
          setSettings(restored);
        }
        if (typeof backup.localStorage.events === "string") localStorage.setItem("eventotron-events-v1", backup.localStorage.events);
        if (typeof backup.localStorage.tabletron === "string") localStorage.setItem("tabletron-project-v2", backup.localStorage.tabletron);
        if (typeof backup.localStorage.foodotron === "string") localStorage.setItem("foodotron-plan-v1", backup.localStorage.foodotron);
        if (typeof backup.localStorage.scheduluotron === "string") localStorage.setItem("eventotron-scheduluotron-v1", backup.localStorage.scheduluotron);
        setStatus("LOCAL RESTORED");
        return;
      }
      const response = await fetch("/api/workspace-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      if (!response.ok) throw new Error("Workspace restore failed");
      const result = await response.json() as { counts?: { events?: number } };
      setStatus(`RESTORED ${result.counts?.events ?? 0} EVENTS`);
    } catch {
      setStatus("RESTORE FAILED");
    } finally {
      if (backupInput.current) backupInput.current.value = "";
    }
  }

  return (
    <div className="suite-frame">
      <SuiteChrome active="settings" />
      <main className="settings-applet">
        <header className="settings-page-header">
          <div>
            <small>EVENTOTRON // CONTROL PANEL</small>
            <h1>Settings</h1>
          </div>
          <button className="save-state" disabled>{status}</button>
          <button onClick={exportWorkspaceBackup}>EXPORT WORKSPACE</button>
          <button onClick={() => backupInput.current?.click()}>RESTORE</button>
          <input ref={backupInput} className="backup-input" type="file" accept="application/json,.json" aria-label="Restore EventoTron workspace backup" onChange={(event) => void importWorkspaceBackup(event.target.files?.[0])} />
          <button onClick={exportSettings}>EXPORT</button>
          <button className="primary" onClick={() => update(defaultSuiteSettings)}>RESET DEFAULTS</button>
        </header>

        <section className="settings-layout">
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
            <p className="settings-note">ICS feeds work first. Google and Outlook account connection will attach here when OAuth is added.</p>
            {settings.calendarSources.length ? settings.calendarSources.map((source) => (
              <div className="calendar-source" key={source.id}>
                <div className="calendar-source-topline">
                  <span className="calendar-source-swatch" style={{ background: source.color }} />
                  <input value={source.name} aria-label="Calendar name" onChange={(event) => update({ calendarSources: settings.calendarSources.map((item) => item.id === source.id ? { ...item, name: event.target.value } : item) })} />
                  <label className="settings-check compact-check"><input type="checkbox" checked={source.enabled} onChange={(event) => update({ calendarSources: settings.calendarSources.map((item) => item.id === source.id ? { ...item, enabled: event.target.checked } : item) })} /><span>SHOW</span></label>
                  <button onClick={() => update({ calendarSources: settings.calendarSources.filter((item) => item.id !== source.id) })}>REMOVE</button>
                </div>
                <div className="settings-two-up">
                  <label className="settings-field"><span>Provider</span><select value={source.provider} onChange={(event) => update({ calendarSources: settings.calendarSources.map((item) => item.id === source.id ? { ...item, provider: event.target.value as CalendarProvider } : item) })}>{Object.entries(calendarProviderLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                  <label className="settings-field"><span>Color</span><input type="color" value={source.color} onChange={(event) => update({ calendarSources: settings.calendarSources.map((item) => item.id === source.id ? { ...item, color: event.target.value } : item) })} /></label>
                </div>
                <label className="settings-field wide"><span>Feed URL or account</span><input value={source.url} onChange={(event) => update({ calendarSources: settings.calendarSources.map((item) => item.id === source.id ? { ...item, url: event.target.value } : item) })} /></label>
              </div>
            )) : <div className="settings-empty">No external calendars connected yet.</div>}
          </section>

          <section className="settings-card">
            <div className="settings-card-heading"><span>05</span><h3>Reports</h3></div>
            <label className="settings-field"><span>Paper size</span><select value={settings.reportPaper} onChange={(event) => update({ reportPaper: event.target.value as SuiteSettings["reportPaper"] })}><option value="letter">Letter</option><option value="a4">A4</option></select></label>
            <label className="settings-check"><input type="checkbox" checked={settings.reportIncludeCosts} onChange={(event) => update({ reportIncludeCosts: event.target.checked })} /><span>Include costs on reports</span></label>
            <label className="settings-check"><input type="checkbox" checked={settings.reportIncludeLayout} onChange={(event) => update({ reportIncludeLayout: event.target.checked })} /><span>Include Tabletron layout picture</span></label>
          </section>

          <section className="settings-card settings-health-card">
            <div className="settings-card-heading"><span>06</span><h3>System Status</h3><button onClick={() => void checkHealth()} disabled={healthChecking}>{healthChecking ? "CHECKING" : "CHECK AGAIN"}</button></div>
            <div className={`health-banner health-${health?.status ?? "checking"}`}>
              <small>EVENTOTRON READINESS</small>
              <b>{healthChecking ? "CHECKING" : health?.status === "ready" ? "READY" : "ATTENTION REQUIRED"}</b>
            </div>
            <div className="health-grid">
              <div><small>DATABASE</small><b>{health?.database?.toUpperCase() ?? "CHECKING"}</b></div>
              <div><small>SCHEMA</small><b>{health?.schema.current ?? "CHECKING"}</b></div>
              <div><small>EVENTS</small><b>{health?.records?.events ?? "—"}</b></div>
              <div><small>APPLET RECORDS</small><b>{health?.records ? health.records.appletStates + health.records.foodotronMeals + health.records.tabletronEvents + health.records.scheduleItems : "—"}</b></div>
              <div><small>TRANSFERS</small><b>{health?.records?.transfers ?? "—"}</b></div>
              <div><small>RESPONSE</small><b>{health ? `${health.latencyMs} MS` : "—"}</b></div>
            </div>
            <p className="health-checked">LAST CHECK {health ? new Date(health.checkedAt).toLocaleString() : "PENDING"}</p>
          </section>
        </section>
      </main>
    </div>
  );
}
