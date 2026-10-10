"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { printReport, saveReportPdf } from "../print-mode";
import { readSuiteEventBundle } from "../event-bundle";
import { readSuiteAppletState } from "../event-app-state";
import { departmentViews, parseReportViews, REPORT_VIEWS_KEY, type ReportView } from "../report-preferences";
import { SketchMap } from "../tabletron/RoomSketch";
import type { SketchStroke } from "../tabletron/sketch-data";
import { readEventContext, type EventoEventContext } from "../event-context";
import { loadSuiteSettings, mergeSuiteSettings, SETTINGS_STORE_KEY, type OperationsTemplate, type SuiteRoomSetting, type SuiteSettings } from "../suite-settings";
import { formatRegularTime } from "../time-format";
import { buildMealShopping, type ShoppingIngredient } from "../food-shopping";
import { sectionSeatLabels, type SeatingSection } from "../tabletron/seat-labels";

type RoomAssignment = {
  roomId: string;
  layoutId: string;
  purpose: string;
  setupTime: string;
  guestTime: string;
  endTime: string;
  teardownTime: string;
  notes: string;
};
type LayoutTable = { id: string; x: number; y: number };
type LayoutObject = { id: string; templateId: string; x: number; y: number; rotation?: number };
type LayoutEntrance = { id: string; name: string; wall: "top" | "right" | "bottom" | "left"; offset: number; width: number };
type TableLayout = {
  sketches?: SketchStroke[];
  id: string;
  name: string;
  tables?: LayoutTable[];
  objects?: LayoutObject[];
  seating?: SeatingSection[];
};
type TableProject = {
  rooms?: Array<{
    kind?: "room" | "hallway";
    connectsTo?: string[];
    id: string;
    name: string;
    width: number;
    height: number;
    entrances?: LayoutEntrance[];
    layouts: Array<TableLayout & { entrances?: LayoutEntrance[] }>;
  }>;
  templates?: Array<{ id: string; name: string; width: number; height: number }>;
  events?: Array<{
    id: string;
    name: string;
    rooms: RoomAssignment[];
    food?: {
      mealName: string;
      guests: number;
      total: number;
      stores: Array<{ store: string; cost: number; items: Array<{ ingredient: string; needed: string; package: string; quantity: string; cost: number }> }>;
    };
  }>;
};
type FoodRecipe = { id: string; name: string; baseServings: number; ingredients: ShoppingIngredient[] };
type FoodPlan = {
  recipes?: FoodRecipe[];
  meals?: Array<{ id: string; name: string; date: string; guests: number; recipes: Array<{ recipeId: string; servings: number }>; tabletronEventId?: string; hospitalityNotes?: string; shoppingExtras?: string[] }>;
};
type SchedulePlan = {
  checklist?: Array<{ id: string; title: string; done: boolean }>;
  eventName: string;
  date: string;
  venue: string;
  blocks: Array<{ title: string; start: string; end: string; owner: string; location: string; notes: string; done: boolean }>;
};
type GroceryLine = { ingredient: string; needed: string; purchase: string; store: string; quantity: string; cost: number };
type ReportLayout = {
  sketches?: SketchStroke[];
  width: number;
  height: number;
  name: string;
  tables: LayoutTable[];
  objects: Array<LayoutObject & { name: string; width: number; height: number }>;
  entrances: LayoutEntrance[];
  seating: SeatingSection[];
};
type ReportRoomReference = Pick<SuiteRoomSetting, "seats" | "squareFeet" | "features" | "rentalNotes" | "policyNotes">;
type ReportRoom = { name: string; details: string; checklist: string[]; layout?: ReportLayout; reference?: ReportRoomReference };
type ReportData = {
  event: EventoEventContext;
  operationsTemplate?: OperationsTemplate;
  tableEvent?: NonNullable<TableProject["events"]>[number];
  rooms: ReportRoom[];
  furniture: string[];
  meal?: { name: string; guests: number; recipes: string[] };
  groceries: GroceryLine[];
  schedule: SchedulePlan["blocks"];
  tasks: NonNullable<SchedulePlan["checklist"]>;
  hospitalityNotes: string;
  includeCosts: boolean;
  includeLayout: boolean;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function formatDate(value: string) {
  if (!value) return "Date not set";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function normalizedRoomName(value: string) {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\b(meeting|main|space|room|the|lccc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findRoomReference(settings: SuiteSettings | null, value: string | undefined) {
  const target = normalizedRoomName(value ?? "");
  if (!settings?.rooms?.length || !target) return undefined;
  return settings.rooms.find((room) => {
    const roomName = normalizedRoomName(room.name);
    return roomName === target || roomName.includes(target) || target.includes(roomName);
  });
}

function groceryLines(
  food: FoodPlan | null,
  meal: NonNullable<FoodPlan["meals"]>[number] | undefined,
  linkedFood: NonNullable<NonNullable<TableProject["events"]>[number]["food"]> | undefined,
) {
  if ((!food || !meal) && linkedFood?.stores?.length) {
    return linkedFood.stores.flatMap((store) =>
      store.items.map((item) => ({
        ingredient: item.ingredient,
        needed: item.needed,
        purchase: item.package,
        store: store.store,
        quantity: item.quantity,
        cost: item.cost,
      })),
    );
  }
  if (!food || !meal) return [];
  return buildMealShopping(food.recipes ?? [], meal.recipes).map(({ item, required, best }) => ({
    ingredient: item.name,
    needed: `${Number(required.toFixed(2))} ${item.unit}`,
    purchase: best ? `${best.packageQty} ${best.packageUnit}${best.note ? ` · ${best.note}` : ""}` : "Needs price or conversion",
    store: best?.store ?? "Unpriced",
    quantity: best ? `${best.packages} container${best.packages === 1 ? "" : "s"}` : "—",
    cost: best?.cost ?? 0,
  })).sort((a, b) => a.store.localeCompare(b.store) || a.ingredient.localeCompare(b.ingredient));
}

function buildReport(
  event: EventoEventContext,
  table: TableProject | null,
  food: FoodPlan | null,
  schedule: SchedulePlan | null,
  settings: SuiteSettings | null,
): ReportData {
  const tableEvent = table?.events?.find((item) => item.id === event.id);
  const operationsTemplate = settings?.operationsTemplates.find((template) => template.id === event.operationsTemplateId);
  const roomRows: ReportRoom[] = (tableEvent?.rooms ?? []).map((assignment) => {
    const room = table?.rooms?.find((item) => item.id === assignment.roomId);
    const layout = room?.layouts?.find((item) => item.id === assignment.layoutId);
    const layoutPicture = layout
      ? {
          width: room?.width ?? 26,
          height: room?.height ?? 26,
          name: layout.name,
          tables: layout.tables ?? [],
          objects: (layout.objects ?? []).map((object) => {
            const template = table?.templates?.find((item) => item.id === object.templateId);
            return {
              ...object,
              name: template?.name ?? "Furniture",
              width: template?.width ?? 6,
              height: template?.height ?? 3,
            };
          }),
          entrances: room?.entrances ?? [],
          seating: layout.seating ?? [],
          sketches: layout.sketches ?? [],
        }
      : undefined;
    return {
      name: room?.name ?? "Unassigned room",
      details: `${assignment.purpose || "Event space"} · ${room?.width ?? "?"} x ${room?.height ?? "?"} FT · ${layout?.name ?? "Layout not selected"}`,
      checklist: [
        `Setup ${formatRegularTime(assignment.setupTime) || "—"} · guests ${formatRegularTime(assignment.guestTime) || "—"}`,
        `End ${formatRegularTime(assignment.endTime) || "—"} · teardown ${formatRegularTime(assignment.teardownTime) || "—"}`,
        assignment.notes || "No special room notes",
        ...(layout?.sketches ?? []).filter(stroke => stroke.label).map(stroke => `Annotation: ${stroke.label}`),
        ...(room?.kind === "hallway" ? [`Hallway connections: ${(room.connectsTo ?? []).map(id => table?.rooms?.find(item => item.id === id)?.name).filter(Boolean).join(", ") || "Not set"}`] : []),
      ],
      layout: layoutPicture,
      reference: findRoomReference(settings, room?.name),
    };
  });
  const rooms = roomRows.length
    ? roomRows
    : [{
        name: event.space || "Event space",
        details: "Room assignment has not been set in Tabletron.",
        checklist: ["Confirm room, access path, and setup time."],
        reference: findRoomReference(settings, event.space),
      }];
  const used = roomRows.flatMap((room) => room.layout?.objects ?? []);
  const furniture = [...new Set(used.map((item) => item.name))].map((name) => `${used.filter((item) => item.name === name).length} × ${name}`);
  const meal = food?.meals?.find((item) => item.tabletronEventId === event.id || item.name === event.title);
  const recipeNames = meal?.recipes.map((entry) => food?.recipes?.find((recipe) => recipe.id === entry.recipeId)?.name ?? "Recipe") ?? [];
  const linkedFood = tableEvent?.food;
  return {
    event,
    operationsTemplate,
    tableEvent,
    rooms,
    furniture: furniture.length ? furniture : ["No custom furniture has been added yet."],
    meal: meal ? { name: meal.name, guests: meal.guests, recipes: recipeNames } : linkedFood ? { name: linkedFood.mealName, guests: linkedFood.guests, recipes: [] } : undefined,
    groceries: [...groceryLines(food, meal, linkedFood), ...(meal?.shoppingExtras ?? []).map(ingredient => ({ ingredient, needed: "Confirm quantity", purchase: "Confirm price", store: "Unpriced", quantity: "", cost: 0 }))],
    schedule: schedule?.blocks ?? [],
    tasks: schedule?.checklist ?? [],
    hospitalityNotes: meal?.hospitalityNotes ?? "",
    includeCosts: settings?.reportIncludeCosts ?? true,
    includeLayout: settings?.reportIncludeLayout ?? true,
  };
}

export default function MasterReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [missing, setMissing] = useState(false);
  const [preset, setPreset] = useState("full");
  const [sections, setSections] = useState(["brief", "playbook", "rooms", "schedule", "food"]);
  const [roomNames, setRoomNames] = useState<string[]>([]);
  const [compactSummary, setCompactSummary] = useState(false);
  const [costs, setCosts] = useState(true);
  const [layouts, setLayouts] = useState(true);
  const [references, setReferences] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [savedViews, setSavedViews] = useState<ReportView[]>([]);
  const [viewName, setViewName] = useState("");
  const [selectedView, setSelectedView] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams(window.location.search);
      setSavedViews(parseReportViews(readJson<unknown>(REPORT_VIEWS_KEY)));
      const stored = readJson<{ events?: EventoEventContext[]; selectedId?: string }>("eventotron-events-v1");
      const eventId = params.get("event") ?? stored?.selectedId ?? "";
      let event = readEventContext(eventId) ?? stored?.events?.find((item) => item.id === eventId) ?? null;
      let table = readJson<TableProject>("tabletron-project-v2");
      let food = readJson<FoodPlan>("foodotron-plan-v1");
      let schedule = readJson<SchedulePlan>("eventotron-scheduluotron-v1");
      let settings = readJson<SuiteSettings>(SETTINGS_STORE_KEY);

      if (eventId) {
        try {
          const bundle = await readSuiteEventBundle<TableProject, FoodPlan, SchedulePlan>(eventId);
          if (!bundle) { setMissing(true); return; }
          if (bundle) {
            event = bundle.event;
            table = bundle.applets.tabletron;
            food = bundle.applets.foodotron;
            schedule = bundle.applets.scheduluotron;
            settings = mergeSuiteSettings(bundle.settings ?? settings);
            localStorage.setItem(SETTINGS_STORE_KEY, JSON.stringify(settings));
            if (bundle.applets.tabletron) localStorage.setItem("tabletron-project-v2", JSON.stringify(bundle.applets.tabletron));
            if (bundle.applets.foodotron) localStorage.setItem("foodotron-plan-v1", JSON.stringify(bundle.applets.foodotron));
            if (bundle.applets.scheduluotron) localStorage.setItem("eventotron-scheduluotron-v1", JSON.stringify(bundle.applets.scheduluotron));
          }
        } catch {
          setLoadError(true);
          try {
            settings = await loadSuiteSettings();
            const [savedTable, savedFood, savedSchedule] = await Promise.all([
              readSuiteAppletState<TableProject>(eventId, "tabletron"),
              readSuiteAppletState<FoodPlan>(eventId, "foodotron"),
              readSuiteAppletState<SchedulePlan>(eventId, "scheduluotron"),
            ]);
            table = savedTable ?? table;
            food = savedFood ?? food;
            schedule = savedSchedule ?? schedule;
          } catch { setLoadError(true); }
        }
      }

      if (!event) {
        setMissing(true);
        return;
      }
      const built = buildReport(event, table, food, schedule, settings);
      const view = params.get("view") ?? "full";
      const presets: Record<string, string[]> = { full: ["brief", "playbook", "rooms", "schedule", "food"], summary: ["brief", "rooms", "schedule", "food"], shopping: ["food"], rooms: ["rooms"], schedule: ["schedule"] };
      setPreset(view in presets ? view : "custom");
      setSections(params.has("sections") ? (params.get("sections") ?? "").split(",").filter((key) => presets.full.includes(key)) : presets[view] ?? presets.full);
      setRoomNames(params.has("rooms") ? params.getAll("rooms") : built.rooms.map((room) => room.name));
      setCompactSummary(params.get("detail") === "summary" || view === "summary");
      setCosts(params.has("costs") ? params.get("costs") === "1" : built.includeCosts);
      setLayouts(params.has("layouts") ? params.get("layouts") === "1" : view !== "summary" && built.includeLayout);
      setReferences(params.get("references") === "1");
      setRecipient(params.get("recipient") ?? "");
      setReport(built);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (missing) {
    return (
      <main className="master-report-page report-empty">
        <p>No active event is selected.</p>
        <Link href="/">RETURN TO EVENT CALENDAR</Link>
      </main>
    );
  }
  if (!report) return <main className="master-report-page report-empty">Preparing master report…</main>;

  const { event } = report;
  const show = (key: string) => sections.includes(key);
  function choosePreset(value: string) {
    const presets: Record<string, string[]> = { full: ["brief", "playbook", "rooms", "schedule", "food"], summary: ["brief", "rooms", "schedule", "food"], shopping: ["food"], rooms: ["rooms"], schedule: ["schedule"] };
    setPreset(value);
    if (presets[value]) setSections(presets[value]);
    setCompactSummary(value === "summary");
    setLayouts(value === "rooms" || (value === "full" && report!.includeLayout));
  }
  function toggleSection(key: string) {
    setPreset("custom");
    setSections((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }
  function applyView(id: string) {
    setSelectedView(id);
    const view = [...savedViews, ...departmentViews].find((item) => item.id === id);
    if (!view) return;
    setPreset("custom"); setSections(view.sections); setCosts(view.costs); setLayouts(view.layouts);
    setReferences(view.references); setCompactSummary(view.summary); setRecipient(view.recipient); setViewName(view.name);
    setRoomNames(view.rooms ? view.rooms.filter((name) => report!.rooms.some((room) => room.name === name)) : report!.rooms.map((room) => room.name));
  }
  function saveView() {
    if (!viewName.trim()) { setNotice("A saved view needs a name."); return; }
    const id = `saved:${viewName.trim().toLowerCase()}`;
    const view: ReportView = { id, name: viewName.trim(), sections, costs, layouts, references, summary: compactSummary, recipient,
      rooms: roomNames.length === report!.rooms.length ? undefined : roomNames };
    const next = [...savedViews.filter((item) => item.id !== id), view].slice(-30);
    try { localStorage.setItem(REPORT_VIEWS_KEY, JSON.stringify(next)); setSavedViews(next); setSelectedView(id); setNotice("Report view saved on this computer."); }
    catch { setNotice("Report view could not be saved."); }
  }
  function deleteView() {
    const next = savedViews.filter((item) => item.id !== selectedView);
    try { localStorage.setItem(REPORT_VIEWS_KEY, JSON.stringify(next)); setSavedViews(next); setSelectedView(""); setNotice("Saved view removed."); }
    catch { setNotice("Saved view could not be removed."); }
  }
  async function copyLink() {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("event", event.id);
    url.searchParams.set("view", preset);
    url.searchParams.set("sections", sections.join(","));
    url.searchParams.set("detail", compactSummary ? "summary" : "compact");
    url.searchParams.set("costs", costs ? "1" : "0");
    url.searchParams.set("layouts", layouts ? "1" : "0");
    url.searchParams.set("references", references ? "1" : "0");
    url.searchParams.set("recipient", recipient);
    // An explicit empty value keeps deselected rooms deselected on reopening.
    (roomNames.length ? roomNames : [""]).forEach((name) => url.searchParams.append("rooms", name));
    try { await navigator.clipboard.writeText(url.toString()); setNotice("Report link copied"); }
    catch { setNotice("Link ready in the address bar"); }
    window.history.replaceState(null, "", url);
  }
  const reportTitle = `${event.title} ${preset === "shopping" ? "Shopping List" : preset === "rooms" ? "Room Setup" : preset === "schedule" ? "Run of Show" : compactSummary ? "Event Summary" : "Event Report"}`;
  const total = report.groceries.reduce((sum, line) => sum + line.cost, 0);
  return (
    <main className={`master-report-page report-compact ${sections.length === 1 && show("rooms") ? "report-rooms-only" : ""} ${compactSummary ? "report-summary" : ""} ${costs ? "" : "report-hide-costs"}`}>
      <div className="report-builder">
        <label>Department / saved view<select aria-label="Department / saved view" value={selectedView} onChange={(e) => applyView(e.target.value)}><option value="">Select view</option><optgroup label="Departments">{departmentViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</optgroup><optgroup label="Saved views">{savedViews.map((view) => <option key={view.id} value={view.id}>{view.name}</option>)}</optgroup></select></label>
        <label>View name<input value={viewName} onChange={(e) => setViewName(e.target.value)} /></label>
        <button onClick={saveView}>SAVE VIEW</button><button disabled={!selectedView.startsWith("saved:")} onClick={deleteView}>DELETE VIEW</button>
        <label>Report<select aria-label="Report" value={preset} onChange={(e) => choosePreset(e.target.value)}><option value="full">Complete event</option><option value="summary">Event summary</option><option value="shopping">Shopping list</option><option value="rooms">Room setup</option><option value="schedule">Run of show</option><option value="custom">Custom</option></select></label>
        <label>Prepared for<input value={recipient} placeholder="Department or recipient" onChange={(e) => setRecipient(e.target.value)} /></label>
        <label>Detail<select aria-label="Detail" value={compactSummary ? "summary" : "compact"} onChange={(e) => setCompactSummary(e.target.value === "summary")}><option value="compact">Compact detail</option><option value="summary">Summary</option></select></label>
        <fieldset><legend>Sections</legend>{[["brief", "Event brief"], ["playbook", "Playbook"], ["rooms", "Room setup"], ["schedule", "Run of show"], ["food", "Shopping list"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={show(key)} onChange={() => toggleSection(key)} />{label}</label>)}</fieldset>
        <fieldset><legend>Include</legend><label><input type="checkbox" checked={costs} onChange={(e) => setCosts(e.target.checked)} />Costs</label><label><input type="checkbox" checked={layouts} onChange={(e) => setLayouts(e.target.checked)} />Layout diagrams</label><label><input type="checkbox" checked={references} onChange={(e) => setReferences(e.target.checked)} />Facility reference</label></fieldset>
        {show("rooms") && <fieldset><legend>Rooms</legend>{report.rooms.map((room) => <label key={room.name}><input type="checkbox" checked={roomNames.includes(room.name)} onChange={() => setRoomNames((current) => current.includes(room.name) ? current.filter((name) => name !== room.name) : [...current, room.name])} />{room.name}</label>)}</fieldset>}
      </div>
      <header className="master-report-header">
        <div>
          <small>EVENTOTRON // {preset === "shopping" ? "SHOPPING LIST" : preset === "rooms" ? "ROOM SETUP" : preset === "schedule" ? "RUN OF SHOW" : compactSummary ? "EVENT SUMMARY" : "EVENT REPORT"}</small>
          <h1>{event.title}</h1>
          <p>{formatDate(event.date)} · {event.space || "Space not assigned"}</p>
          <p>{event.attendees} guests · {formatRegularTime(event.eventTime) || "Time not set"}{recipient ? ` · Prepared for ${recipient}` : ""}</p>
        </div>
        <div className="master-report-brand"><b>S<sup>3</sup></b><span>EVENTOTRON<br /><small>SHEPPARD SEMICONDUCTOR SYSTEMS</small></span></div>
      </header>
      <div className="master-report-actions">
        <button disabled={!sections.length || loadError} className="report-print-button" onClick={() => printReport(reportTitle)}>PRINT REPORT</button>
        <button disabled={!sections.length || loadError} className="report-pdf-button" onClick={() => saveReportPdf(reportTitle)}>SAVE PDF</button>
        <button onClick={copyLink}>COPY REPORT LINK</button>
        <Link href={`/?event=${encodeURIComponent(event.id)}`}>BACK TO EVENT</Link>
      </div>
      {notice && <p className="report-builder-notice" role="status">{notice}</p>}
      {loadError && <p className="report-builder-notice" role="alert">Saved report data could not be verified. Reload before printing.</p>}
      {!sections.length && <p className="report-builder-notice">No sections selected.</p>}

      {show("brief") && <section className="master-report-section">
        <div className="master-report-section-heading"><span>01</span><h2>Client and Event Brief</h2></div>
        <div className="report-field-grid">
          <div><small>CONTACT</small><b>{event.contact || "Not entered"}</b></div>
          <div><small>PHONE</small><b>{event.phone || "Not entered"}</b></div>
          <div><small>EMAIL</small><b>{event.email || "Not entered"}</b></div>
          <div><small>EVENT MANAGER</small><b>{event.manager || "Not assigned"}</b></div>
          <div><small>EVENT TIME</small><b>{formatRegularTime(event.eventTime) || "Not entered"}</b></div>
          <div><small>RENTAL TIME</small><b>{formatRegularTime(event.rentalTime) || "Not entered"}</b></div>
          <div><small>EXPECTED ATTENDEES</small><b>{event.attendees || 0}</b></div>
          <div><small>EVENT TYPE</small><b>{event.kind}</b></div>
        </div>
        <div className="report-note-grid">
          <div><small>DESCRIPTION</small><p>{event.description || "No description entered."}</p></div>
          <div><small>REQUESTED TABLES / EQUIPMENT</small><p>{event.requestedItems || "No equipment list entered."}</p></div>
          <div><small>PLANNING NOTES</small><p>{event.planningNotes || "No planning notes entered."}</p></div>
          <div><small>STAFFING / MOD</small><p>{event.mod || "No staffing assignment entered."}</p></div>
        </div>
      </section>}

      {show("playbook") && report.operationsTemplate && <section className="master-report-section">
        <div className="master-report-section-heading"><span>02</span><h2>Operations Playbook</h2></div>
        {report.operationsTemplate ? (
          <>
            <div className="report-playbook-hero">
              <div>
                <small>ACTIVE TEMPLATE</small>
                <b>{report.operationsTemplate.name}</b>
                <p>{report.operationsTemplate.summary}</p>
              </div>
              <div>
                <small>PRESET DEFAULTS</small>
                <span>{report.operationsTemplate.preset?.event?.eventTime || event.eventTime || "Time not preset"}</span>
                <span>{report.operationsTemplate.preset?.event?.space || event.space || "Room not preset"}</span>
                <span>{report.operationsTemplate.preset?.event?.manager || event.manager || "Manager not preset"}</span>
              </div>
            </div>
            <div className="report-playbook-checklist">
              {report.operationsTemplate.checklist.map((item) => (
                <p key={item}><span className="report-checkbox" />{item}</p>
              ))}
            </div>
            {report.operationsTemplate.preset?.scheduleBlocks?.length ? (
              <div className="report-playbook-schedule">
                <h3>Preset Schedule Blocks</h3>
                {report.operationsTemplate.preset.scheduleBlocks.map((block) => (
                  <div key={`${block.start}-${block.title}`}>
                    <strong>{formatRegularTime(block.start)}-{formatRegularTime(block.end)}</strong>
                    <span>{block.kind.toUpperCase()}</span>
                    <b>{block.title}</b>
                    <small>{block.owner || "Unassigned"} · {block.location || "Location not set"}</small>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="report-callout">No operations template is attached to this event. Attach one from the event information sheet to add recurring checklist material here.</div>
        )}
      </section>}

      {show("rooms") && <section className="master-report-section">
        <div className="master-report-section-heading"><span>03</span><h2>Room Setup Checklist</h2></div>
        {report.rooms.filter((room) => roomNames.includes(room.name)).map((room) => (
          <article className="report-room" key={room.name}>
            <h3><span className="report-checkbox" />{room.name}</h3>
            <b>{room.details}</b>
            {room.checklist.map((item, index) => <p key={index}><span className="report-checkbox" />{item}</p>)}
            {references && room.reference && (
              <div className="report-room-reference">
                <strong>Facility Reference</strong>
                <div className="report-room-reference-grid">
                  {room.reference.seats && <span><small>CAPACITY</small>{room.reference.seats}</span>}
                  {room.reference.squareFeet && <span><small>AREA</small>{room.reference.squareFeet.toLocaleString()} SQ FT</span>}
                </div>
                {room.reference.features?.length ? (
                  <div className="report-room-reference-block"><small>ROOM FEATURES</small><p>{room.reference.features.join(" · ")}</p></div>
                ) : null}
                {room.reference.rentalNotes?.length ? (
                  <div className="report-room-reference-block"><small>RENTAL NOTES</small>{room.reference.rentalNotes.map((item) => <p key={item}>{item}</p>)}</div>
                ) : null}
                {room.reference.policyNotes?.length ? (
                  <div className="report-room-reference-block"><small>POLICY NOTES</small>{room.reference.policyNotes.map((item) => <p key={item}>{item}</p>)}</div>
                ) : null}
              </div>
            )}
            {layouts && room.layout && (
              <div className="report-layout-figure">
                <div className="report-layout-figure-heading"><span>EVENT-ASSIGNED LAYOUT</span><b>{room.layout.name}</b></div>
                <div className="report-layout-canvas" style={{ aspectRatio: `${room.layout.width} / ${room.layout.height}` }}>
                  <SketchMap strokes={room.layout.sketches} width={room.layout.width} height={room.layout.height} />
                  <span className="report-layout-measure report-layout-measure-top">{room.layout.width} FT</span>
                  <span className="report-layout-measure report-layout-measure-side">{room.layout.height} FT</span>
                  {room.layout.tables.map((table, index) => (
                    <span
                      className="report-layout-table"
                      key={table.id}
                      style={{ left: `${(table.x / room.layout!.width) * 100}%`, top: `${(table.y / room.layout!.height) * 100}%`, width: `${6 / room.layout!.width * 100}%` }}
                      title="Table"
                    >{index + 1}</span>
                  ))}
                  {room.layout.objects.map((object) => (
                    <span
                      className="report-layout-object"
                      key={object.id}
                      style={{
                        left: `${(object.x / room.layout!.width) * 100}%`,
                        top: `${(object.y / room.layout!.height) * 100}%`,
                        width: `${(object.width / room.layout!.width) * 100}%`,
                        height: `${(object.height / room.layout!.height) * 100}%`,
                        transform: `translate(-50%, -50%) rotate(${object.rotation ?? 0}deg)`,
                      }}
                    ><span className="report-layout-object-name" style={{ transform: `translate(-50%, -50%) rotate(${-(object.rotation ?? 0)}deg)` }}>{object.name}</span></span>
                  ))}
                  {room.layout.seating.flatMap((section) => sectionSeatLabels(section).map((seat) => <span className="report-layout-seat" key={`${section.id}-${seat.label}`} style={{ left: `${seat.x / room.layout!.width * 100}%`, top: `${seat.y / room.layout!.height * 100}%`, width: `${section.seatSpacing * .8 / room.layout!.width * 100}%`, height: `${section.rowSpacing * .62 / room.layout!.height * 100}%` }}>{seat.label}</span>))}
                  {room.layout.entrances.map((entrance) => (
                    <span
                      className={`report-layout-entrance ${entrance.wall}`}
                      key={entrance.id}
                      style={entrance.wall === "top" || entrance.wall === "bottom"
                        ? { left: `${entrance.offset * 100}%`, width: `${Math.max(5, (entrance.width / room.layout!.width) * 100)}%` }
                        : { top: `${entrance.offset * 100}%`, height: `${Math.max(5, (entrance.width / room.layout!.height) * 100)}%` }}
                    />
                  ))}
                </div>
                <small className="report-layout-caption">Event-assigned layout · tables, furniture, seating, entrances and annotations.</small>
              </div>
            )}
          </article>
        ))}
      </section>}

      {show("schedule") && <section className="master-report-section">
        <div className="master-report-section-heading"><span>04</span><h2>Run of Show</h2></div>
        {!!report.tasks.length && <div className="planning-checklist"><h3>Event checklist</h3>{report.tasks.map(task => <p key={task.id}>{task.done ? "[x]" : "[ ]"} {task.title}</p>)}</div>}
        {report.schedule.length ? (
          <div className="report-timeline">
            {report.schedule.map((block) => (
              <div className="report-timeline-row" key={`${block.start}-${block.title}`}>
                <strong>{formatRegularTime(block.start)}<br />{formatRegularTime(block.end)}</strong>
                <div><h3>{block.title}</h3><p>{block.owner || "Unassigned"} · {block.location || "Location not set"}</p>{block.notes && <small>{block.notes}</small>}</div>
                <span className="report-status">{block.done ? "DONE" : "OPEN"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="report-callout">Scheduluotron has not been filled out for this event yet. Event time: <b>{formatRegularTime(event.eventTime) || "Not entered"}</b></div>
        )}
      </section>}

      {show("food") && <section className="master-report-section">
        <div className="master-report-section-heading"><span>05</span><h2>Food and Grocery Checklist</h2></div>
        {report.meal ? <p className="report-lead"><b>{report.meal.name}</b> · {report.meal.guests} guests{report.meal.recipes.length ? ` · ${report.meal.recipes.join(", ")}` : ""}</p> : <div className="report-callout">No Foodotron meal is linked to this event yet.</div>}
        {report.hospitalityNotes && <p className="hospitality-notes">{report.hospitalityNotes}</p>}
        {compactSummary && report.groceries.length > 0 && <p>{report.groceries.length} shopping items{costs ? ` · Estimated total $${total.toFixed(2)}` : ""}</p>}
        {!compactSummary && report.groceries.length ? (
          <div className="report-shopping-list">
            <div className="report-shopping-head"><span>BUY</span><span>INGREDIENT</span><span>NEEDED</span><span>PURCHASE</span><span>STORE</span>{costs && <span>EST. COST</span>}</div>
            {report.groceries.map((line, index) => <div className="report-shopping-row" key={`${line.ingredient}-${line.store}-${index}`}><span className="report-checkbox" /><b>{line.ingredient}</b><span>{line.needed}</span><span>{line.quantity} · {line.purchase}</span><span>{line.store}</span>{costs && <strong>{line.cost ? `$${line.cost.toFixed(2)}` : "—"}</strong>}</div>)}
            {costs && <div className="report-shopping-total"><span>ESTIMATED GROCERY TOTAL</span><b>{total ? `$${total.toFixed(2)}` : "Not priced"}</b></div>}
          </div>
        ) : null}
      </section>}

      <footer className="master-report-footer">Prepared by Sheppard Semiconductor Systems from EventoTron event, Tabletron, Foodotron, and Scheduluotron records. Verify final counts, prices, access details, and client changes before setup.</footer>
    </main>
  );
}
