"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function SettingsPage() {
  const [settings, setSettings] = useState<SuiteSettings>(defaultSuiteSettings);
  const [status, setStatus] = useState("LOCAL READY");
  const [loaded, setLoaded] = useState(false);
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
        </section>
      </main>
    </div>
  );
}
