"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readEventContext, type EventoEventContext } from "../event-context";

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
type TableProject = {
  rooms?: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    layouts: Array<{ id: string; name: string; tables?: unknown[]; objects?: Array<{ templateId: string }> }>;
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
type ReportRoom = { name: string; details: string; checklist: string[] };
type ReportData = {
  event: EventoEventContext;
  tableEvent?: TableProject["events"] extends Array<infer T> ? T : never;
  rooms: ReportRoom[];
  furniture: string[];
  meal?: { name: string; guests: number; recipes: string[] };
  groceries: GroceryLine[];
  schedule: SchedulePlan["blocks"];
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

function buildReport(event: EventoEventContext): ReportData {
  const table = readJson<TableProject>("tabletron-project-v2");
  const food = readJson<FoodPlan>("foodotron-plan-v1");
  const schedule = readJson<SchedulePlan>("eventotron-scheduluotron-v1");
  const tableEvent = table?.events?.find((item) => item.id === event.id);
  const roomRows: ReportRoom[] = (tableEvent?.rooms ?? []).map((assignment) => {
    const room = table?.rooms?.find((item) => item.id === assignment.roomId);
    const layout = room?.layouts?.find((item) => item.id === assignment.layoutId);
    return {
      name: room?.name ?? "Unassigned room",
      details: `${assignment.purpose || "Event space"} · ${room?.width ?? "?"} x ${room?.height ?? "?"} FT · ${layout?.name ?? "Layout not selected"}`,
      checklist: [
        `Setup ${assignment.setupTime || "—"} · guests ${assignment.guestTime || "—"}`,
        `End ${assignment.endTime || "—"} · teardown ${assignment.teardownTime || "—"}`,
        assignment.notes || "No special room notes",
      ],
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
  };
}

export default function MasterReportPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const stored = readJson<{ events?: EventoEventContext[]; selectedId?: string }>("eventotron-events-v1");
      const eventId = params.get("event") ?? stored?.selectedId ?? "";
      const event = readEventContext(eventId) ?? stored?.events?.find((item) => item.id === eventId) ?? null;
      if (!event) {
        setMissing(true);
        return;
      }
      setReport(buildReport(event));
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
    <main className="master-report-page">
      <header className="master-report-header">
        <div>
          <small>EVENTOTRON // MASTER REPORT</small>
          <h1>{event.title}</h1>
          <p>{formatDate(event.date)} · {event.space || "Space not assigned"}</p>
        </div>
        <div className="master-report-brand"><b>E</b><span>EVENTOTRON<br /><small>OPERATIONS SUITE</small></span></div>
      </header>
      <div className="master-report-actions">
        <button className="report-print-button" onClick={() => window.print()}>PRINT MASTER REPORT</button>
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
            <div className="report-shopping-head"><span>BUY</span><span>INGREDIENT</span><span>NEEDED</span><span>PURCHASE</span><span>STORE</span><span>EST. COST</span></div>
            {report.groceries.map((line) => <div className="report-shopping-row" key={`${line.ingredient}-${line.store}`}><span className="report-checkbox" /><b>{line.ingredient}</b><span>{line.needed}</span><span>{line.quantity} · {line.purchase}</span><span>{line.store}</span><strong>{line.cost ? `$${line.cost.toFixed(2)}` : "—"}</strong></div>)}
            <div className="report-shopping-total"><span>ESTIMATED GROCERY TOTAL</span><b>{total ? `$${total.toFixed(2)}` : "Not priced"}</b></div>
          </div>
        ) : null}
      </section>

      <footer className="master-report-footer">Prepared from EventoTron event, Tabletron, Foodotron, and Scheduluotron records. Verify final counts, prices, access details, and client changes before setup.</footer>
    </main>
  );
}
