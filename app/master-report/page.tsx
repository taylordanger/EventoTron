"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { printReport, saveReportPdf } from "../print-mode";
import { readSuiteEventBundle } from "../event-bundle";
import { readSuiteAppletState } from "../event-app-state";
import { readEventContext, type EventoEventContext } from "../event-context";
import { loadSuiteSettings, mergeSuiteSettings, SETTINGS_STORE_KEY } from "../suite-settings";

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
type LayoutObject = { id: string; templateId: string; x: number; y: number };
type LayoutEntrance = { id: string; name: string; wall: "top" | "right" | "bottom" | "left"; offset: number; width: number };
type TableLayout = {
  id: string;
  name: string;
  tables?: LayoutTable[];
  objects?: LayoutObject[];
};
type TableProject = {
  rooms?: Array<{
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
type FoodOffer = { store: string; packageQty: number; packageUnit?: string; price: number; note?: string };
type FoodIngredient = { name: string; qty: number; unit: string; offers?: FoodOffer[] };
type FoodRecipe = { id: string; name: string; baseServings: number; ingredients: FoodIngredient[] };
type FoodPlan = {
  recipes?: FoodRecipe[];
  meals?: Array<{ id: string; name: string; date: string; guests: number; recipes: Array<{ recipeId: string; servings: number }>; tabletronEventId?: string }>;
};
type SchedulePlan = {
  eventName: string;
  date: string;
  venue: string;
  blocks: Array<{ title: string; start: string; end: string; owner: string; location: string; notes: string; done: boolean }>;
};
type GroceryLine = { ingredient: string; needed: string; purchase: string; store: string; quantity: string; cost: number };
type ReportLayout = {
  width: number;
  height: number;
  name: string;
  tables: LayoutTable[];
  objects: Array<LayoutObject & { name: string; width: number; height: number }>;
  entrances: LayoutEntrance[];
};
type ReportRoom = { name: string; details: string; checklist: string[]; layout?: ReportLayout };
type ReportData = {
  event: EventoEventContext;
  tableEvent?: NonNullable<TableProject["events"]>[number];
  rooms: ReportRoom[];
  furniture: string[];
  meal?: { name: string; guests: number; recipes: string[] };
  groceries: GroceryLine[];
  schedule: SchedulePlan["blocks"];
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

function groceryLines(
  food: FoodPlan | null,
  meal: NonNullable<FoodPlan["meals"]>[number] | undefined,
  linkedFood: NonNullable<NonNullable<TableProject["events"]>[number]["food"]> | undefined,
) {
  if (linkedFood?.stores?.length) {
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
  const lines: GroceryLine[] = [];
  for (const entry of meal.recipes) {
    const recipe = food.recipes?.find((item) => item.id === entry.recipeId);
    if (!recipe) continue;
    const multiplier = entry.servings / Math.max(1, recipe.baseServings);
    for (const ingredient of recipe.ingredients) {
      const required = ingredient.qty * multiplier;
      const offers = (ingredient.offers ?? []).filter((offer) => offer.packageQty > 0);
      const best = [...offers].sort((a, b) => a.price - b.price)[0];
      const packageCount = best ? Math.max(1, Math.ceil(required / best.packageQty)) : 0;
      lines.push({
        ingredient: ingredient.name,
        needed: `${Number(required.toFixed(2))} ${ingredient.unit}`,
        purchase: best ? `${best.packageQty} ${best.packageUnit ?? ingredient.unit}${best.note ? ` · ${best.note}` : ""}` : "Add price / package",
        store: best?.store ?? "Needs price",
        quantity: best ? `${packageCount} container${packageCount === 1 ? "" : "s"}` : "—",
        cost: best ? packageCount * best.price : 0,
      });
    }
  }
  return lines;
}

function buildReport(
  event: EventoEventContext,
  table: TableProject | null,
  food: FoodPlan | null,
  schedule: SchedulePlan | null,
  settings: { reportIncludeCosts?: boolean; reportIncludeLayout?: boolean } | null,
): ReportData {
  const tableEvent = table?.events?.find((item) => item.id === event.id);
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
        }
      : undefined;
    return {
      name: room?.name ?? "Unassigned room",
      details: `${assignment.purpose || "Event space"} · ${room?.width ?? "?"} x ${room?.height ?? "?"} FT · ${layout?.name ?? "Layout not selected"}`,
      checklist: [
        `Setup ${assignment.setupTime || "—"} · guests ${assignment.guestTime || "—"}`,
        `End ${assignment.endTime || "—"} · teardown ${assignment.teardownTime || "—"}`,
        assignment.notes || "No special room notes",
      ],
      layout: layoutPicture,
    };
  });
  const rooms = roomRows.length
    ? roomRows
    : [{ name: event.space || "Event space", details: "Room assignment has not been set in Tabletron.", checklist: ["Confirm room, access path, and setup time."] }];
  const furniture = (table?.templates ?? []).map((item) => `${item.name} · ${item.width} x ${item.height} FT`);
  const meal = food?.meals?.find((item) => item.tabletronEventId === event.id || item.name === event.title);
  const recipeNames = meal?.recipes.map((entry) => food.recipes?.find((recipe) => recipe.id === entry.recipeId)?.name ?? "Recipe") ?? [];
  const linkedFood = tableEvent?.food;
  return {
    event,
    tableEvent,
    rooms,
    furniture: furniture.length ? furniture : ["No custom furniture has been added yet."],
    meal: meal ? { name: meal.name, guests: meal.guests, recipes: recipeNames } : linkedFood ? { name: linkedFood.mealName, guests: linkedFood.guests, recipes: [] } : undefined,
    groceries: groceryLines(food, meal, linkedFood),
    schedule: schedule?.eventName === event.title ? schedule.blocks : [],
    includeCosts: settings?.reportIncludeCosts ?? true,
    includeLayout: settings?.reportIncludeLayout ?? true,
  };
}

export default function MasterReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams(window.location.search);
      const stored = readJson<{ events?: EventoEventContext[]; selectedId?: string }>("eventotron-events-v1");
      const eventId = params.get("event") ?? stored?.selectedId ?? "";
      let event = readEventContext(eventId) ?? stored?.events?.find((item) => item.id === eventId) ?? null;
      let table = readJson<TableProject>("tabletron-project-v2");
      let food = readJson<FoodPlan>("foodotron-plan-v1");
      let schedule = readJson<SchedulePlan>("eventotron-scheduluotron-v1");
      let settings = readJson<{ reportIncludeCosts?: boolean; reportIncludeLayout?: boolean }>(SETTINGS_STORE_KEY);

      if (eventId) {
        try {
          const bundle = await readSuiteEventBundle<TableProject, FoodPlan, SchedulePlan>(eventId);
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
          } catch {}
        }
      }

      if (!event) {
        setMissing(true);
        return;
      }
      setReport(buildReport(event, table, food, schedule, settings));
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
  const total = report.groceries.reduce((sum, line) => sum + line.cost, 0);
  return (
    <main className={`master-report-page ${report.includeCosts ? "" : "report-hide-costs"}`}>
      <header className="master-report-header">
        <div>
          <small>EVENTOTRON // MASTER REPORT</small>
          <h1>{event.title}</h1>
          <p>{formatDate(event.date)} · {event.space || "Space not assigned"}</p>
        </div>
        <div className="master-report-brand"><b>S<sup>3</sup></b><span>EVENTOTRON<br /><small>SHEPPARD SEMICONDUCTOR SYSTEMS</small></span></div>
      </header>
      <div className="master-report-actions">
        <button className="report-print-button" onClick={printReport}>PRINT MASTER REPORT</button>
        <button className="report-pdf-button" onClick={saveReportPdf}>SAVE PDF</button>
        <Link href={`/?event=${encodeURIComponent(event.id)}`}>BACK TO EVENT</Link>
      </div>

      <section className="master-report-section">
        <div className="master-report-section-heading"><span>01</span><h2>Client and Event Brief</h2></div>
        <div className="report-field-grid">
          <div><small>CONTACT</small><b>{event.contact || "Not entered"}</b></div>
          <div><small>PHONE</small><b>{event.phone || "Not entered"}</b></div>
          <div><small>EMAIL</small><b>{event.email || "Not entered"}</b></div>
          <div><small>EVENT MANAGER</small><b>{event.manager || "Not assigned"}</b></div>
          <div><small>EVENT TIME</small><b>{event.eventTime || "Not entered"}</b></div>
          <div><small>RENTAL TIME</small><b>{event.rentalTime || "Not entered"}</b></div>
          <div><small>EXPECTED ATTENDEES</small><b>{event.attendees || 0}</b></div>
          <div><small>EVENT TYPE</small><b>{event.kind}</b></div>
        </div>
        <div className="report-note-grid">
          <div><small>DESCRIPTION</small><p>{event.description || "No description entered."}</p></div>
          <div><small>REQUESTED TABLES / EQUIPMENT</small><p>{event.requestedItems || "No equipment list entered."}</p></div>
          <div><small>PLANNING NOTES</small><p>{event.planningNotes || "No planning notes entered."}</p></div>
          <div><small>STAFFING / MOD</small><p>{event.mod || "No staffing assignment entered."}</p></div>
        </div>
      </section>

      <section className="master-report-section report-page-break">
        <div className="master-report-section-heading"><span>02</span><h2>Room Setup Checklist</h2></div>
        {report.rooms.map((room) => (
          <article className="report-room" key={room.name}>
            <h3><span className="report-checkbox" />{room.name}</h3>
            <b>{room.details}</b>
            {room.checklist.map((item) => <p key={item}><span className="report-checkbox" />{item}</p>)}
            {report.includeLayout && room.layout && (
              <div className="report-layout-figure">
                <div className="report-layout-figure-heading"><span>LAYOUT PICTURE</span><b>{room.layout.name}</b></div>
                <div className="report-layout-canvas" style={{ aspectRatio: `${room.layout.width} / ${room.layout.height}` }}>
                  <span className="report-layout-measure report-layout-measure-top">{room.layout.width} FT</span>
                  <span className="report-layout-measure report-layout-measure-side">{room.layout.height} FT</span>
                  {room.layout.tables.map((table) => (
                    <span
                      className="report-layout-table"
                      key={table.id}
                      style={{ left: `${(table.x / room.layout!.width) * 100}%`, top: `${(table.y / room.layout!.height) * 100}%` }}
                      title="Table"
                    />
                  ))}
                  {room.layout.objects.map((object) => (
                    <span
                      className="report-layout-object"
                      key={object.id}
                      style={{
                        left: `${(object.x / room.layout!.width) * 100}%`,
                        top: `${(object.y / room.layout!.height) * 100}%`,
                        width: `${((object.width + 4) / room.layout!.width) * 100}%`,
                        height: `${((object.height + 4) / room.layout!.height) * 100}%`,
                      }}
                    >{object.name}</span>
                  ))}
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
                <small className="report-layout-caption">Tables, furniture, and entrances shown from the active Tabletron layout.</small>
              </div>
            )}
          </article>
        ))}
        <div className="report-subsection"><h3>Furniture and Equipment Library</h3><div className="report-furniture-list">{report.furniture.map((item) => <span key={item}><span className="report-checkbox" />{item}</span>)}</div></div>
      </section>

      <section className="master-report-section report-page-break">
        <div className="master-report-section-heading"><span>03</span><h2>Run of Show</h2></div>
        {report.schedule.length ? (
          <div className="report-timeline">
            {report.schedule.map((block) => (
              <div className="report-timeline-row" key={`${block.start}-${block.title}`}>
                <strong>{block.start}<br />{block.end}</strong>
                <div><h3>{block.title}</h3><p>{block.owner || "Unassigned"} · {block.location || "Location not set"}</p>{block.notes && <small>{block.notes}</small>}</div>
                <span className="report-status">{block.done ? "DONE" : "OPEN"}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="report-callout">Scheduluotron has not been filled out for this event yet. Event time: <b>{event.eventTime || "Not entered"}</b></div>
        )}
      </section>

      <section className="master-report-section report-page-break">
        <div className="master-report-section-heading"><span>04</span><h2>Food and Grocery Checklist</h2></div>
        {report.meal ? <p className="report-lead"><b>{report.meal.name}</b> · {report.meal.guests} guests{report.meal.recipes.length ? ` · ${report.meal.recipes.join(", ")}` : ""}</p> : <div className="report-callout">No Foodotron meal is linked to this event yet.</div>}
        {report.groceries.length ? (
          <div className="report-shopping-list">
            <div className="report-shopping-head"><span>BUY</span><span>INGREDIENT</span><span>NEEDED</span><span>PURCHASE</span><span>STORE</span>{report.includeCosts && <span>EST. COST</span>}</div>
            {report.groceries.map((line) => <div className="report-shopping-row" key={`${line.ingredient}-${line.store}`}><span className="report-checkbox" /><b>{line.ingredient}</b><span>{line.needed}</span><span>{line.quantity} · {line.purchase}</span><span>{line.store}</span>{report.includeCosts && <strong>{line.cost ? `$${line.cost.toFixed(2)}` : "—"}</strong>}</div>)}
            {report.includeCosts && <div className="report-shopping-total"><span>ESTIMATED GROCERY TOTAL</span><b>{total ? `$${total.toFixed(2)}` : "Not priced"}</b></div>}
          </div>
        ) : null}
      </section>

      <footer className="master-report-footer">Prepared by Sheppard Semiconductor Systems from EventoTron event, Tabletron, Foodotron, and Scheduluotron records. Verify final counts, prices, access details, and client changes before setup.</footer>
    </main>
  );
}
