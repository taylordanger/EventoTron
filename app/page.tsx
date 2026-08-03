"use client";

import { SuiteChrome } from "./SuiteChrome";
import { EVENT_STORE_KEY } from "./event-context";
import { useEffect, useMemo, useState } from "react";

type EventKind = "meeting" | "rental" | "concert" | "camp" | "prep" | "note";

type EventoEvent = {
  id: string;
  title: string;
  date: string;
  kind: EventKind;
  eventTime: string;
  rentalTime: string;
  space: string;
  manager: string;
  contact: string;
  phone: string;
  email: string;
  attendees: number;
  description: string;
  planningNotes: string;
  mod: string;
  vacation: string;
  rentalTotal: number;
  cateringTotal: number;
  discountRate: number;
  deposit: number;
  paymentNotes: string;
  quoteEnteredBy: string;
  requestedItems: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const labels: Record<EventKind, string> = {
  meeting: "Meeting",
  rental: "Rental",
  concert: "Concert",
  camp: "Camp",
  prep: "Prep",
  note: "Note",
};

const seedEvents: EventoEvent[] = [
  eventSeed("staff-meeting", "Staff Meeting", "2026-08-04", "meeting", "10:00-11:30", "Conference", "Planning notes", "NA", "", 18),
  eventSeed("rotary-aug-5", "Rotary", "2026-08-05", "meeting", "11:30", "Margaret's Room", "", "Jason", "", 35),
  eventSeed("fiber-arts", "Fiber Arts Reception", "2026-08-07", "rental", "5:00-7:00 PM", "Gallery", "Gina's last day", "Day: Jason; Night: Krista with Nara", "", 60),
  eventSeed("isaacs-wedding", "Isaac's Wedding", "2026-08-08", "rental", "11:00 AM-8:00 PM", "Margaret's Room", "", "Heather day and night", "", 120),
  eventSeed("lcsm-aug-9", "LCSM", "2026-08-09", "rental", "10:00 AM-2:00 PM", "Auditorium", "", "Heather with Taylor", "", 90),
  eventSeed("air-force", "Air Force Concert", "2026-08-10", "concert", "7:00 PM", "Auditorium", "", "Day: Serena; Night: Heather", "", 180),
  eventSeed("piano-delivery", "Piano Delivery", "2026-08-11", "prep", "9:00 AM-1:00 PM", "Auditorium", "Tuning in afternoon", "Jason or Nara", "", 4),
  eventSeed("rotary-sbmf", "Rotary / SBMF Rehearsal", "2026-08-12", "meeting", "11:30 / 9:00-5:00", "MMR / Auditorium", "Move Rotary to MMR", "Jason", "Serena fam med./remote", 55),
  eventSeed("sbmf-reception", "SBMF Rehearsal + Reception", "2026-08-13", "concert", "9:00-5:00, 6:30 reception, 7:30-9:30 show", "Theatre seating", "", "Day Nara; Night Jason with Heather backup", "Serena fam med./remote", 160),
  eventSeed("sbmf-rehearsals", "SBMF Rehearsals", "2026-08-14", "concert", "Daytime, 7:30-9:30 show", "Theatre seating", "", "Day Nara; Night Jason", "Serena fam med./remote", 140),
  eventSeed("seating-change", "No SBMF events booked", "2026-08-15", "note", "All day", "Auditorium", "Need to change seating to Cabaret.", "Taylor", "Serena", 0),
  eventSeed("tapas-tunes", "SBMF Tapas & Tunes", "2026-08-16", "concert", "4:30-7:30 meal and music", "Auditorium", "Associated sweep Auditorium PM. Tell Associated to reschedule cleaning to Monday morning?", "Day: Taylor; Night: Jason with Taylor's help", "Serena", 150),
  eventSeed("art-camp-17", "Art Camp", "2026-08-17", "camp", "10:00-3:00", "Classrooms", "", "NA", "", 30),
  eventSeed("art-camp-18", "Art Camp", "2026-08-18", "camp", "10:00-3:00", "Classrooms", "", "NA", "", 30),
  eventSeed("rotary-art-board", "Rotary / Art Camp / Board Meeting", "2026-08-19", "meeting", "11:30 / 10:00-3:00 / 5:30-7:00", "MMR", "Auditorium setup for SBMF; MMR still setup for memorial service.", "Jason", "", 55),
  eventSeed("jazz-concert", "Piano Tuning / Jazz Concert", "2026-08-20", "concert", "Rehearsal day, 7:30-9:30", "Auditorium", "", "Day: Nara; Night: Jason with Taylor", "", 150),
  eventSeed("benefit-dinner", "Benefit Dinner and Concert Prep", "2026-08-21", "concert", "Drinks and Dinner 6PM, 7PM show", "Auditorium", "Art Camp 10-3.", "Day: Serena; Night: Jason with Taylor", "Nara", 200),
  eventSeed("ocean-hates-you", "The Ocean Hates You", "2026-08-23", "concert", "7:00 PM", "Auditorium", "LCSM earlier in day.", "Day: Taylor; Night: Jason", "", 130),
  eventSeed("art-camp-24", "Art Camp", "2026-08-24", "camp", "10:00-3:00", "Classrooms", "", "NA", "Nara", 30),
  eventSeed("art-camp-25", "Art Camp", "2026-08-25", "camp", "10:00-3:00", "Classrooms", "", "NA", "Serena", 30),
  eventSeed("rotary-art-26", "Rotary / Art Camp", "2026-08-26", "meeting", "11:30 / 10:00-3:00", "MMR / Classrooms", "", "Jason", "Serena", 55),
];

function eventSeed(
  id: string,
  title: string,
  date: string,
  kind: EventKind,
  eventTime: string,
  space: string,
  planningNotes: string,
  mod: string,
  vacation: string,
  attendees: number,
): EventoEvent {
  return {
    id,
    title,
    date,
    kind,
    eventTime,
    rentalTime: eventTime,
    space,
    manager: mod.split(";")[0]?.replace(/^Day:\s*/i, "") || "Heather",
    contact: "",
    phone: "",
    email: "",
    attendees,
    description: planningNotes || title,
    planningNotes,
    mod,
    vacation,
    rentalTotal: attendees ? 240 : 0,
    cateringTotal: 0,
    discountRate: 0,
    deposit: attendees ? 100 : 0,
  paymentNotes: "",
  quoteEnteredBy: "Jason",
    requestedItems: "6 FT ROUND TABLES, CHAIRS",
  };
}

export default function Home() {
  const [events, setEvents] = useState<EventoEvent[]>(seedEvents);
  const [selectedId, setSelectedId] = useState(seedEvents[1].id);
  const [openIds, setOpenIds] = useState<string[]>([
    seedEvents[1].id,
    seedEvents[2].id,
    seedEvents[15].id,
  ]);
  const [loaded, setLoaded] = useState(false);
  const selected = events.find((event) => event.id === selectedId) ?? events[0];

  useEffect(() => {
    const raw = localStorage.getItem("eventotron-events-v1");
    const timer = window.setTimeout(() => {
      try {
        const restored = raw ? JSON.parse(raw) as {
          events?: EventoEvent[];
          selectedId?: string;
          openIds?: string[];
        } : null;
        if (restored && Array.isArray(restored.events) && restored.events.length) {
          const restoredEvents = restored.events.map((event) => ({
            ...event,
            requestedItems: event.requestedItems ?? "6 FT ROUND TABLES, CHAIRS",
          }));
          setEvents(restoredEvents);
          setSelectedId(restored.selectedId ?? restoredEvents[0].id);
          setOpenIds(restored.openIds?.length ? restored.openIds : [restoredEvents[0].id]);
        }
        setLoaded(true);
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(
      EVENT_STORE_KEY,
      JSON.stringify({ events, selectedId, openIds }),
    );
  }, [events, selectedId, openIds, loaded]);

  const days = useMemo(() => {
    const start = new Date("2026-08-01T00:00:00");
    const firstDay = start.getDay();
    const cells: (number | null)[] = Array.from({ length: firstDay }, () => null);
    for (let day = 1; day <= 31; day++) cells.push(day);
    while (cells.length % 7) cells.push(null);
    return cells;
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<number, EventoEvent[]>();
    events.forEach((event) => {
      const day = Number(event.date.slice(-2));
      map.set(day, [...(map.get(day) ?? []), event]);
    });
    return map;
  }, [events]);

  function save() {
    localStorage.setItem(
      "eventotron-events-v1",
      JSON.stringify({ events, selectedId, openIds }),
    );
  }

  function openEvent(event: EventoEvent) {
    setSelectedId(event.id);
    setOpenIds((ids) => [event.id, ...ids.filter((id) => id !== event.id)].slice(0, 8));
  }

  function updateSelected(patch: Partial<EventoEvent>) {
    setEvents((items) =>
      items.map((event) => (event.id === selected.id ? { ...event, ...patch } : event)),
    );
  }

  function addEvent(day?: number) {
    const created = eventSeed(
      `event_${uid()}`,
      "New Event",
      `2026-08-${String(day ?? 1).padStart(2, "0")}`,
      "rental",
      "9:00 AM-12:00 PM",
      "Margaret's Room",
      "",
      "Heather",
      "",
      25,
    );
    setEvents((items) => [...items, created]);
    openEvent(created);
  }

  const finalPrice =
    selected.rentalTotal +
    selected.cateringTotal -
    Math.round(selected.rentalTotal * (selected.discountRate / 100));

  return (
    <main className="eventotron-desktop">
      <div className="eventotron-ribbon-row">
        <SuiteChrome active="calendar" eventId={selected.id} />
        <button onClick={save}>SAVE EVENTS</button>
        <button className="primary" onClick={() => addEvent(new Date().getDate())}>
          NEW EVENT
        </button>
      </div>

      <section className="eventotron-workbench">
        <aside className="event-stack">
          <div className="stack-title">
            <span>OPEN EVENT FILES</span>
            <b>{String(openIds.length).padStart(2, "0")}</b>
          </div>
          {openIds.map((id) => {
            const event = events.find((item) => item.id === id);
            if (!event) return null;
            return (
              <button
                className={`vertical-file ${event.id === selected.id ? "active" : ""} ${event.kind}`}
                key={event.id}
                onClick={() => openEvent(event)}
              >
                <small>{event.date.slice(5)}</small>
                <b>{event.title}</b>
              </button>
            );
          })}
          <div className="active-event-tab">
            <small>ACTIVE EVENT FILE</small>
            <strong>{selected.title}</strong>
            <span>{selected.date} · {selected.eventTime}</span>
            <span>{selected.space}</span>
            <em>THIS EVENT FOLLOWS YOU THROUGH THE SUITE TABS</em>
          </div>
        </aside>

        <section className="calendar-panel">
          <div className="calendar-title">
            <div>
              <small>EVENTOTRON MAIN CALENDAR</small>
              <h1>August 2026 All Staff Schedule</h1>
            </div>
            <div className="calendar-legend">
              {Object.entries(labels).map(([kind, label]) => (
                <span className={`legend-dot ${kind}`} key={kind}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="month-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div className="weekday" key={day}>
                {day}
              </div>
            ))}
            {days.map((day, index) => (
              <div className={`day-cell ${day ? "" : "blank"}`} key={`${day}-${index}`}>
                {day && (
                  <>
                    <button className="day-number" onClick={() => addEvent(day)}>
                      {day}
                    </button>
                    <div className="day-events">
                      {(eventsByDay.get(day) ?? []).map((event) => (
                        <button
                          className={`calendar-event ${event.kind} ${event.id === selected.id ? "active" : ""}`}
                          key={event.id}
                          onClick={() => openEvent(event)}
                        >
                          <b>{event.title}</b>
                          <small>{event.eventTime}</small>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="event-info-sheet">
          <div className="sheet-header">
            <small>INFORMATION TAB</small>
            <b>{selected.title}</b>
          </div>
          <div className="sheet-grid">
            <label className="wide">
              <span>Event Date Requested</span>
              <input
                type="date"
                value={selected.date}
                onChange={(e) => updateSelected({ date: e.target.value })}
              />
            </label>
            <label className="wide">
              <span>Name of Event / Group</span>
              <input
                value={selected.title}
                onChange={(e) => updateSelected({ title: e.target.value })}
              />
            </label>
            <label>
              <span>Contact Name</span>
              <input
                value={selected.contact}
                onChange={(e) => updateSelected({ contact: e.target.value })}
              />
            </label>
            <label>
              <span>Phone Number</span>
              <input
                value={selected.phone}
                onChange={(e) => updateSelected({ phone: e.target.value })}
              />
            </label>
            <label className="wide">
              <span>E-Mail Address</span>
              <input
                value={selected.email}
                onChange={(e) => updateSelected({ email: e.target.value })}
              />
            </label>
            <label>
              <span>Rental Time</span>
              <input
                value={selected.rentalTime}
                onChange={(e) => updateSelected({ rentalTime: e.target.value })}
              />
            </label>
            <label>
              <span>Event Time</span>
              <input
                value={selected.eventTime}
                onChange={(e) => updateSelected({ eventTime: e.target.value })}
              />
            </label>
            <label>
              <span>Main Space</span>
              <input
                value={selected.space}
                onChange={(e) => updateSelected({ space: e.target.value })}
              />
            </label>
            <label>
              <span>Event Manager</span>
              <input
                value={selected.manager}
                onChange={(e) => updateSelected({ manager: e.target.value })}
              />
            </label>
            <label>
              <span>Estimated Number</span>
              <input
                type="number"
                min="0"
                value={selected.attendees}
                onChange={(e) => updateSelected({ attendees: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Event Type</span>
              <select
                value={selected.kind}
                onChange={(e) => updateSelected({ kind: e.target.value as EventKind })}
              >
                {Object.entries(labels).map(([kind, label]) => (
                  <option value={kind} key={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide description">
              <span>Description of Event</span>
              <textarea
                value={selected.description}
                onChange={(e) => updateSelected({ description: e.target.value })}
              />
            </label>
            <label className="wide">
              <span>Requested Tables / Equipment</span>
              <input
                value={selected.requestedItems}
                onChange={(e) => updateSelected({ requestedItems: e.target.value })}
                placeholder="6 FT ROUND TABLES, CHAIRS, PODIUM"
              />
            </label>
            <label>
              <span>Planning Notes</span>
              <textarea
                value={selected.planningNotes}
                onChange={(e) => updateSelected({ planningNotes: e.target.value })}
              />
            </label>
            <label>
              <span>Planned MOD</span>
              <textarea
                value={selected.mod}
                onChange={(e) => updateSelected({ mod: e.target.value })}
              />
            </label>
            <label>
              <span>Vacation / Team</span>
              <textarea
                value={selected.vacation}
                onChange={(e) => updateSelected({ vacation: e.target.value })}
              />
            </label>
            <div className="price-box wide">
              <div>
                <span>Rental Expenses</span>
                <input
                  type="number"
                  value={selected.rentalTotal}
                  onChange={(e) => updateSelected({ rentalTotal: Number(e.target.value) })}
                />
              </div>
              <div>
                <span>Catering Expenses</span>
                <input
                  type="number"
                  value={selected.cateringTotal}
                  onChange={(e) => updateSelected({ cateringTotal: Number(e.target.value) })}
                />
              </div>
              <div>
                <span>Discount Rate</span>
                <input
                  type="number"
                  value={selected.discountRate}
                  onChange={(e) => updateSelected({ discountRate: Number(e.target.value) })}
                />
              </div>
              <div>
                <span>Deposit</span>
                <input
                  type="number"
                  value={selected.deposit}
                  onChange={(e) => updateSelected({ deposit: Number(e.target.value) })}
                />
              </div>
              <strong>Final Price {money(finalPrice)}</strong>
            </div>
            <label className="wide">
              <span>Payment Notes</span>
              <textarea
                value={selected.paymentNotes}
                onChange={(e) => updateSelected({ paymentNotes: e.target.value })}
              />
            </label>
            <label>
              <span>Quote Entered By</span>
              <input
                value={selected.quoteEnteredBy}
                onChange={(e) => updateSelected({ quoteEnteredBy: e.target.value })}
              />
            </label>
          </div>
        </aside>
      </section>
    </main>
  );
}
