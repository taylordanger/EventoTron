"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { SuiteChrome } from "../SuiteChrome";
import { calendarDates, calendarDisplayStyle, calendarViews, dateKey, type CalendarView } from "../calendar-display";
import { useCalendarDisplay } from "../use-calendar-display";
import { defaultSuiteSettings, mergeSuiteSettings } from "../suite-settings";
import { venueDateKey } from "../venue-date";
import { personalTime, type PersonalDraft, type PersonalItem, type PersonalKind, type PersonalSummary } from "../personal-data";

const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
function draftOf(item: PersonalItem): PersonalDraft {
  const { id, kind, title, date, start, end, location, details, pinned } = item;
  return { id, kind, title, date, start, end, location, details, pinned };
}

export default function PersonalPage() {
  const { display } = useCalendarDisplay();
  const [mode, setMode] = useState<PersonalKind>("event");
  const [view, setView] = useState<CalendarView>("month");
  const [focus, setFocus] = useState("");
  const [settings, setSettings] = useState(defaultSuiteSettings);
  const [items, setItems] = useState<PersonalSummary[]>([]);
  const [account, setAccount] = useState("");
  const [local, setLocal] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<PersonalDraft | null>(null);
  const [saved, setSaved] = useState<PersonalItem | null>(null);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [conflicted, setConflicted] = useState(false);
  const editorRef = useRef<HTMLElement>(null);
  const calendarRef = useRef<HTMLElement>(null);
  const requestId = useRef(0);
  const dirty = !!draft && (!saved || JSON.stringify(draft) !== JSON.stringify(draftOf(saved)));

  const check = useCallback(async (response: Response) => {
    if ([401, 403].includes(response.status)) {
      setItems([]); setDraft(null); setSaved(null); setLoaded(false); setAccount("");
    }
    const data: unknown = response.status === 204 ? {} : await response.json();
    if (response.status === 409) setConflicted(true);
    if (!response.ok) throw new Error((data as { error?: string }).error || "My Workspace is unavailable. Try again; unsaved changes have not been sent.");
    return data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/personal", { cache: "no-store", signal: controller.signal });
        const data = await check(response) as { items: PersonalSummary[]; source: string; account: string };
        if (controller.signal.aborted) return;
        setItems(data.items); setAccount(data.account); setLocal(data.source === "local");
        const configured = await fetch("/api/settings", { cache: "no-store", signal: controller.signal }).then(async res => res.ok ? mergeSuiteSettings(await res.json()) : defaultSuiteSettings).catch(() => defaultSuiteSettings);
        if (controller.signal.aborted) return;
        setSettings(configured); setFocus(venueDateKey(new Date(), configured.timezone)); setLoaded(true);
      } catch (error) { if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : "My Workspace could not be loaded."); }
    })();
    return () => controller.abort();
  }, [check]);

  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (link && link.target !== "_blank" && !link.hasAttribute("download") && !window.confirm("Leave without saving this personal item?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigate, true); };
  }, [dirty]);

  const scrollToDate = useCallback((date: string) => {
    calendarRef.current?.querySelector(`[aria-label="Add personal event on ${date}"]`)?.closest(".day-cell")?.scrollIntoView({ block: "start" });
  }, []);
  useEffect(() => {
    if (!loaded || !focus || mode !== "event") return;
    const timer = window.setTimeout(() => scrollToDate(focus), 0);
    return () => window.clearTimeout(timer);
  }, [loaded, focus, view, mode, scrollToDate]);

  function canLeave() { return !dirty || window.confirm("Discard unsaved changes to this personal item?"); }
  function edit(next: PersonalDraft, previous: PersonalItem | null) {
    setDraft(next); setSaved(previous); setProblem(""); setNotice(""); setConflicted(false);
    window.setTimeout(() => editorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 0);
  }
  function add(kind: PersonalKind, date = focus) {
    if (!loaded || pending || !canLeave()) return;
    requestId.current++;
    edit({ id: crypto.randomUUID(), kind, title: "", date: kind === "event" ? date : "", start: "", end: "", location: "", details: "", pinned: false }, null);
  }
  async function open(id: string) {
    if (pending || !canLeave()) return;
    const token = ++requestId.current;
    setPending(true); setProblem("");
    try {
      const data = await check(await fetch(`/api/personal?id=${encodeURIComponent(id)}`, { cache: "no-store" })) as { item: PersonalItem };
      if (token === requestId.current) edit(draftOf(data.item), data.item);
    } catch (error) { setProblem(error instanceof Error ? error.message : "Item could not be opened."); }
    finally { setPending(false); }
  }
  function remember(item: PersonalItem) {
    const { details: _details, ...summary } = item; void _details;
    setItems(previous => [...previous.filter(entry => entry.id !== item.id), summary]);
    setSaved(item); setDraft(draftOf(item));
  }
  async function save() {
    if (!draft || pending || conflicted) return;
    setPending(true); setProblem(""); setNotice("");
    try {
      const data = await check(await fetch("/api/personal", { method: saved ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saved ? { item: draft, expectedUpdatedAt: saved.updatedAt } : draft) })) as { item: PersonalItem };
      remember(data.item); setNotice("Saved to My Workspace.");
    } catch (error) { setProblem(error instanceof Error ? error.message : "Not saved. Your draft remains in the editor."); }
    finally { setPending(false); }
  }
  async function remove() {
    if (!saved || pending || !window.confirm(`Delete "${saved.title}" from your workspace?`)) return;
    setPending(true); setProblem("");
    try {
      await check(await fetch("/api/personal", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: saved.id, expectedUpdatedAt: saved.updatedAt }) }));
      setItems(previous => previous.filter(item => item.id !== saved.id)); setSaved(null); setDraft(null); setNotice("Personal item deleted.");
    } catch (error) { setProblem(error instanceof Error ? error.message : "Item could not be deleted."); }
    finally { setPending(false); }
  }
  async function refresh() {
    if (pending || !canLeave()) return;
    setPending(true); setProblem("");
    try {
      const data = await check(await fetch("/api/personal", { cache: "no-store" })) as { items: PersonalSummary[]; account: string; source: string };
      setItems(data.items); setAccount(data.account); setLocal(data.source === "local"); setLoaded(true); setDraft(null); setSaved(null); setConflicted(false);
      if (!focus) setFocus(venueDateKey(new Date(), settings.timezone));
    } catch (error) { setProblem(error instanceof Error ? error.message : "Workspace could not be refreshed."); }
    finally { setPending(false); }
  }
  async function exportMine() {
    if (pending) return;
    setPending(true); setProblem("");
    try {
      const data = await check(await fetch("/api/personal?export=1", { cache: "no-store" }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "eventotron-my-workspace.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Saved items exported. Unsaved drafts are not included.");
    } catch (error) { setProblem(error instanceof Error ? error.message : "Personal export failed."); }
    finally { setPending(false); }
  }
  function keepDraft() {
    if (!draft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "eventotron-personal-draft.json"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function move(amount: number) {
    const date = new Date(`${focus}T12:00:00Z`);
    if (view === "month" || view === "agenda") { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + amount); }
    else date.setUTCDate(date.getUTCDate() + amount * (view === "week" ? 7 : 1));
    const next = dateKey(date); if (next >= "1900-01-01" && next <= "2100-12-31") setFocus(next);
  }
  const dates = focus ? calendarDates(Number(focus.slice(0, 4)), Number(focus.slice(5, 7)) - 1, Number(focus.slice(8)), view, settings.weekStartsOn) : [];
  const today = venueDateKey(new Date(), settings.timezone);
  const events = items.filter(item => item.kind === "event").sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  const notes = items.filter(item => item.kind === "note" && item.title.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  const weekdays = settings.weekStartsOn === "monday" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return <div className="suite-frame personal-frame">
    <SuiteChrome active="personal" />
    <main className="personal-workspace">
      <header className="personal-heading"><div><h1>My Workspace</h1><p>{account || "Checking account..."}</p></div><div className="personal-actions"><button disabled={!loaded || pending} onClick={() => add(mode)}>{mode === "event" ? "+ Personal Event" : "+ Note"}</button><button disabled={pending} onClick={() => void refresh()}>Refresh</button><button disabled={!loaded || pending} onClick={() => void exportMine()}>Export My Data</button></div></header>
      {local && <p className="personal-local-warning" role="note">Local desktop mode has one operator. Anyone using this local app can open this workspace. Separate private workspaces require individual sign-in on the hosted team app.</p>}
      <div className="personal-tabs" role="group" aria-label="Personal workspace section"><button aria-pressed={mode === "event"} disabled={pending} onClick={() => { if (canLeave()) { setMode("event"); setDraft(null); setSaved(null); } }}>Personal Calendar</button><button aria-pressed={mode === "note"} disabled={pending} onClick={() => { if (canLeave()) { setMode("note"); setDraft(null); setSaved(null); } }}>My Notes</button><span>{local ? "LOCAL OPERATOR" : "PERSONAL"}</span></div>
      {problem && <p className="personal-error" role="alert">{problem}</p>}
      {notice && <p className="personal-notice" role="status">{notice}</p>}
      {conflicted && draft && <div className="personal-actions"><button disabled={pending} onClick={keepDraft}>Keep Draft File</button><button disabled={pending} onClick={() => void open(draft.id)}>Reload Latest Version</button></div>}
      {!loaded ? <p role="status">{problem ? "Workspace unavailable." : "Loading your workspace..."}</p> : <div className={`personal-body ${draft ? "with-editor" : ""}`}>
        {mode === "event" ? <section ref={calendarRef} aria-label="Personal calendar" className="calendar-panel calendar-custom personal-calendar" data-view={view} style={calendarDisplayStyle(display) as CSSProperties}>
          <div className="calendar-display-toolbar"><div className="calendar-view-switch" role="group" aria-label="Personal calendar view">{calendarViews.map(option => <button key={option} aria-pressed={view === option} onClick={() => setView(option)}>{option}</button>)}</div><div className="calendar-date-navigation"><button aria-label="Previous period" title="Previous period" disabled={!focus} onClick={() => move(-1)}>&lt;</button><input aria-label="Personal calendar date" type="date" min="1900-01-01" max="2100-12-31" value={focus} onChange={event => { if (event.target.value >= "1900-01-01" && event.target.value <= "2100-12-31") setFocus(event.target.value); }} /><button aria-label="Next period" title="Next period" disabled={!focus} onClick={() => move(1)}>&gt;</button><button className="personal-today" onClick={() => { setFocus(today); scrollToDate(today); }}>Today</button></div></div>
          <h2 className="personal-calendar-period">{focus ? new Date(`${focus}T12:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) : "Calendar"}</h2>
          <div className={`month-grid calendar-view-${view}`}>{["month", "week"].includes(view) && weekdays.map(day => <div className="weekday" key={day}>{day}</div>)}{dates.map((date, index) => !date ? <div className="day-cell blank" key={`blank-${index}`} /> : <div className={`day-cell ${date === today ? "today" : ""}`} key={date}><div className="personal-day-heading"><button className="day-number" aria-label={`Add personal event on ${date}`} title={`Add personal event on ${dateLabel(date)}`} disabled={pending} onClick={() => add("event", date)}>{Number(date.slice(8))}</button><span className="calendar-day-label">{dateLabel(date)}</span></div><div className="day-events">{events.filter(item => item.date === date).map(item => <button className={`calendar-event personal-event ${draft?.id === item.id ? "active" : ""}`} key={item.id} disabled={pending} onClick={() => void open(item.id)}><small>{personalTime(item)}</small><b>{item.title}</b>{item.location && <span className="calendar-event-location">{item.location}</span>}</button>)}</div>{!events.some(item => item.date === date) && ["day", "agenda"].includes(view) && <p className="calendar-empty-day">No personal events</p>}</div>)}</div>
        </section> : <section className="personal-notes" aria-label="My notes"><label className="personal-search">Search notes<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Note title" /></label>{notes.length ? <div className="personal-note-list">{notes.map(item => <button aria-label={`Open note ${item.title}`} key={item.id} disabled={pending} onClick={() => void open(item.id)}><strong>{item.pinned && <span className="personal-pin">Pinned / </span>}{item.title}</strong><small>Updated {new Date(item.updatedAt).toLocaleString()}</small></button>)}</div> : <p className="personal-empty">{search ? "No matching notes." : "No notes yet."}</p>}</section>}
        {draft && <aside className="personal-editor" ref={editorRef} aria-label="Personal item editor"><header><h2>{saved ? "Edit" : "New"} {draft.kind === "event" ? "Personal Event" : "Note"}</h2><button aria-label="Close personal editor" title="Close editor" disabled={pending} onClick={() => { if (canLeave()) { setDraft(null); setSaved(null); } }}>&times;</button></header><form onSubmit={event => { event.preventDefault(); void save(); }}><fieldset disabled={pending}><label>Title<input autoFocus required maxLength={160} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>{draft.kind === "event" ? <><label>Date<input required type="date" min="1900-01-01" max="2100-12-31" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></label><div className="personal-time-fields"><label>Start<input type="time" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value, end: event.target.value ? draft.end : "" })} /></label><label>End<input type="time" value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label></div><label>Location<input maxLength={160} value={draft.location} onChange={event => setDraft({ ...draft, location: event.target.value })} /></label></> : <label className="personal-pin-field"><input type="checkbox" checked={draft.pinned} onChange={event => setDraft({ ...draft, pinned: event.target.checked })} />Pinned</label>}<label>{draft.kind === "event" ? "Notes" : "Note"}<textarea aria-label={draft.kind === "event" ? "Personal event notes" : "Personal note"} maxLength={12000} rows={12} value={draft.details} onChange={event => setDraft({ ...draft, details: event.target.value })} /></label></fieldset><p className="personal-save-status" role="status">{pending ? "Working..." : dirty ? "Unsaved changes" : "Saved"}</p><footer>{saved && <><button type="button" disabled={pending} onClick={() => void open(saved.id)}>Reload Saved</button><button type="button" className="personal-delete" disabled={pending || conflicted} onClick={() => void remove()}>Delete</button></>}<button className="primary" type="submit" disabled={pending || conflicted || !dirty}>{pending ? "Saving..." : "Save"}</button></footer></form></aside>}
      </div>}
    </main>
  </div>;
}
