"use client";
import { useRef, useState, type CSSProperties } from "react";
import { calendarDisplayStyle, calendarThemes, calendarViews, defaultCalendarDisplay, type CalendarDisplay } from "./calendar-display";
import { useCalendarDisplay } from "./use-calendar-display";

export function CalendarDisplaySettings() {
  const { display, update } = useCalendarDisplay();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const change = (patch: Partial<CalendarDisplay>) => {
    try { update(patch); setError(""); } catch { setError("Display preferences could not be saved. Browser storage may be full or disabled."); }
  };
  async function upload(file?: File) {
    if (!file) return;
    const request = ++generation.current;
    setLoading(true); setError("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12_000_000) throw new Error("Choose a JPG, PNG, or WebP image smaller than 12 MB.");
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser could not prepare the wallpaper.");
        context.fillStyle = display.background; context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        let wallpaper = canvas.toDataURL("image/jpeg", 0.8);
        if (wallpaper.length > 650_000) wallpaper = canvas.toDataURL("image/jpeg", 0.5);
        if (wallpaper.length > 650_000) throw new Error("This image is too detailed to save. Choose a smaller image.");
        if (request === generation.current) change({ wallpaper });
      } finally { bitmap.close(); }
    } catch (caught) { if (request === generation.current) setError(caught instanceof Error ? caught.message : "Wallpaper could not be loaded."); }
    finally { if (request === generation.current) setLoading(false); }
  }
  return <section className="settings-card calendar-display-settings">
    <div className="settings-card-heading"><h3>Display &amp; Appearance</h3><span className="personal-display-label">THIS BROWSER</span></div>
    <fieldset className="display-options"><legend>Calendar view</legend><div className="calendar-view-switch" role="group" aria-label="Default calendar view">
      {calendarViews.map(view => <button type="button" aria-pressed={display.view === view} onClick={() => change({ view })} key={view}>{view}</button>)}
    </div></fieldset>
    <fieldset className="display-options"><legend>Color preset</legend><div className="calendar-theme-options">
      {calendarThemes.map(theme => <button type="button" title={theme.name} aria-label={`${theme.name} colors`} aria-pressed={display.background === theme.background && display.accent === theme.accent} onClick={() => change({ background: theme.background, accent: theme.accent })} key={theme.name}><span style={{ background: theme.background, borderColor: theme.accent }} />{theme.name}</button>)}
    </div></fieldset>
    <div className="settings-two-up">
      <label className="settings-field"><span>Background color</span><input type="color" value={display.background} onChange={event => change({ background: event.target.value })} /></label>
      <label className="settings-field"><span>Accent color</span><input type="color" value={display.accent} onChange={event => change({ accent: event.target.value })} /></label>
      <label className="settings-field"><span>Text size</span><input type="range" min="10" max="20" step="1" value={display.textSize} onChange={event => change({ textSize: Number(event.target.value) })} /><output>{display.textSize} px</output></label>
      <label className="settings-field"><span>Event spacing</span><select aria-label="Event spacing" value={display.density} onChange={event => change({ density: event.target.value as CalendarDisplay["density"] })}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>
    </div>
    <label className="settings-field wide"><span>Wallpaper</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={loading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {loading && <p role="status">Preparing wallpaper...</p>}
    {display.wallpaper && <div className="wallpaper-controls"><label className="settings-field"><span>Wallpaper shading</span><input type="range" min="25" max="95" value={display.wallpaperShade} onChange={event => change({ wallpaperShade: Number(event.target.value) })} /><output>{display.wallpaperShade}%</output></label><button type="button" onClick={() => { generation.current++; setLoading(false); change({ wallpaper: "" }); }}>Remove wallpaper</button></div>}
    <div className="calendar-custom calendar-display-preview" style={calendarDisplayStyle(display) as CSSProperties} aria-label="Calendar appearance preview"><strong>Monday, October 12</strong><div className="calendar-event"><b>Team planning meeting</b><small>9:00 AM - 10:00 AM</small></div></div>
    <button type="button" className="display-reset" onClick={() => { generation.current++; setLoading(false); change(defaultCalendarDisplay); }}>Reset display</button>
    {error && <p className="display-error" role="alert">{error}</p>}
  </section>;
}
