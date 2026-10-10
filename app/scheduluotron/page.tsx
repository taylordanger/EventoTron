"use client";

import { SuiteChrome } from "../SuiteChrome";
import { OperationsTicker } from "../OperationsTicker";
import { saveSuiteAppletState } from "../event-app-state";
import { readSuiteEventBundle } from "../event-bundle";
import { type EventoEventContext } from "../event-context";
import { printReport, saveReportPdf } from "../print-mode";
import { loadSuiteSettings, type OperationsTemplate } from "../suite-settings";
import { formatRegularTime } from "../time-format";
import { useEventLiveStatus } from "../use-event-live-status";
import { useEffect, useMemo, useState } from "react";

import { saveStatusHint, saveStatusTone } from "../save-status";
type BlockKind =
  | "setup"
  | "delivery"
  | "staff"
  | "service"
  | "guest"
  | "teardown"
  | "note";

type ScheduleBlock = {
  id: string;
  title: string;
  kind: BlockKind;
  start: string;
  end: string;
  owner: string;
  location: string;
  notes: string;
  done: boolean;
};

type SchedulePlan = {
  eventName: string;
  date: string;
  venue: string;
  dayStart: string;
  dayEnd: string;
  activeId: string;
  blocks: ScheduleBlock[];
};

const uid = () => Math.random().toString(36).slice(2, 9);
const kinds: { id: BlockKind; label: string }[] = [
  { id: "setup", label: "Setup" },
  { id: "delivery", label: "Delivery" },
  { id: "staff", label: "Staff" },
  { id: "guest", label: "Guest" },
  { id: "service", label: "Service" },
  { id: "teardown", label: "Teardown" },
  { id: "note", label: "Note" },
];
const blockKindIds = new Set<BlockKind>(kinds.map((kind) => kind.id));

const toMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
};
const toClock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const duration = (block: ScheduleBlock) =>
  Math.max(0, toMinutes(block.end) - toMinutes(block.start));
const reportDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value || "Date not set";
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

function initialPlan(): SchedulePlan {
  const date = new Date().toISOString().slice(0, 10);
  const blocks: ScheduleBlock[] = [
    {
      id: uid(),
      title: "Unlock venue and check rooms",
      kind: "setup",
      start: "09:00",
      end: "09:30",
      owner: "Ops lead",
      location: "Main entrance",
      notes: "Confirm keys, lights, HVAC, restrooms, and access paths.",
      done: false,
    },
    {
      id: uid(),
      title: "Tables, chairs, and fixture placement",
      kind: "setup",
      start: "09:30",
      end: "11:00",
      owner: "Room crew",
      location: "Event room",
      notes: "Match Tabletron floor plan before linens arrive.",
      done: false,
    },
    {
      id: uid(),
      title: "Food delivery window",
      kind: "delivery",
      start: "11:15",
      end: "11:45",
      owner: "Foodotron runner",
      location: "Kitchen",
      notes: "Cold items first. Verify shopping list against report.",
      done: false,
    },
    {
      id: uid(),
      title: "Guests arrive",
      kind: "guest",
      start: "13:00",
      end: "13:30",
      owner: "Front desk",
      location: "Lobby",
      notes: "Greeter, signage, accessibility assistance.",
      done: false,
    },
    {
      id: uid(),
      title: "Meal service",
      kind: "service",
      start: "14:00",
      end: "15:00",
      owner: "Service crew",
      location: "Dining line",
      notes: "Track dietary requests and refill rhythm.",
      done: false,
    },
    {
      id: uid(),
      title: "Reset and teardown",
      kind: "teardown",
      start: "16:00",
      end: "17:00",
      owner: "Close crew",
      location: "All rooms",
      notes: "Trash, rentals, keys, and final walk-through.",
      done: false,
    },
  ];
  return {
    eventName: "New Event Timeline",
    date,
    venue: "Lincoln City Cultural Center",
    dayStart: "08:00",
    dayEnd: "18:00",
    activeId: blocks[0].id,
    blocks,
  };
}

function eventBriefBlock(context: EventoEventContext): ScheduleBlock {
  return {
    id: uid(),
    title: `${context.title} event brief`,
    kind: "note",
    start: "08:00",
    end: "08:15",
    owner: context.manager || "MOD",
    location: context.space || "Event space",
    notes: [context.description, context.planningNotes, `Manager: ${context.manager}`, context.mod]
      .filter(Boolean)
      .join("\n"),
    done: false,
  };
}

function templateScheduleBlocks(template: OperationsTemplate | undefined, context: EventoEventContext, owners: string[]) {
  const presetBlocks = template?.preset?.scheduleBlocks ?? [];
  if (!presetBlocks.length) return null;
  return [
    eventBriefBlock(context),
    ...presetBlocks.map((block, index) => ({
      id: uid(),
      title: block.title,
      kind: blockKindIds.has(block.kind as BlockKind) ? block.kind as BlockKind : "note",
      start: block.start,
      end: block.end,
      owner: block.owner === "MOD" ? context.manager || owners[index % owners.length] || "MOD" : block.owner,
      location: block.location || context.space,
      notes: block.notes,
      done: false,
    })),
  ];
}

function currentEventBriefBlocks(context: EventoEventContext) {
  return initialPlan().blocks.map((block, index) =>
    index === 0
      ? {
          ...block,
          title: `${context.title} event brief`,
          kind: "note" as BlockKind,
          location: context.space,
          owner: context.manager || block.owner,
          notes: [context.description, context.planningNotes, `Manager: ${context.manager}`, context.mod]
            .filter(Boolean)
            .join("\n"),
        }
      : block,
  );
}

export default function Scheduluotron() {
  const [plan, setPlan] = useState<SchedulePlan>(() => initialPlan());
  const [notice, setNotice] = useState("");
  const [activeEvent, setActiveEvent] = useState<EventoEventContext | null>(null);
  const [appletSaveStatus, setAppletSaveStatus] = useState("READY");
  const [timezone, setTimezone] = useState("America/Los_Angeles");
  const eventIsLive = useEventLiveStatus(activeEvent, timezone);
  const active =
    plan.blocks.find((block) => block.id === plan.activeId) ?? plan.blocks[0];
  const dayStart = toMinutes(plan.dayStart);
  const dayEnd = Math.max(dayStart + 60, toMinutes(plan.dayEnd));
  const span = dayEnd - dayStart;

  useEffect(() => {
    const raw = localStorage.getItem("eventotron-scheduluotron-v1");
    if (!raw) return;
    const timer = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(raw) as SchedulePlan;
        if (Array.isArray(parsed.blocks)) setPlan(parsed);
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const eventId = new URLSearchParams(window.location.search).get("event");
      const settings = await loadSuiteSettings();
      setTimezone(settings.timezone);
      const owners = settings.staff.length ? settings.staff : ["Ops lead"];
      setPlan((current) => ({
        ...current,
        venue: !eventId && (!current.venue || current.venue === "Lincoln City Cultural Center")
          ? settings.venueName || current.venue
          : current.venue,
        blocks: current.blocks.map((block, index) => ({
          ...block,
          owner:
            ["Ops lead", "Room crew", "Foodotron runner", "Front desk", "Service crew", "Close crew", ""].includes(block.owner)
              ? owners[index % owners.length]
              : block.owner,
        })),
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const eventId = new URLSearchParams(window.location.search).get("event");
      if (!eventId) return;
      let bundle;
      try { bundle = await readSuiteEventBundle<unknown, unknown, SchedulePlan>(eventId); }
      catch { setAppletSaveStatus("NOT ON SERVER"); return; }
      const context = bundle?.event;
      if (!context) return;
      const settings = await loadSuiteSettings();
      const template = settings.operationsTemplates.find((item) => item.id === context.operationsTemplateId);
      const owners = settings.staff.length ? settings.staff : ["Ops lead"];
      const saved = bundle!.applets.scheduluotron;
      const seededBlocks = saved && Array.isArray(saved.blocks)
        ? saved.blocks
        : templateScheduleBlocks(template, context, owners) ?? currentEventBriefBlocks(context);
      setPlan((current) => ({
        ...(saved && Array.isArray(saved.blocks) ? saved : current),
        eventName: context.title,
        date: context.date,
        venue: context.space,
        dayStart: seededBlocks.reduce((earliest, block) => toMinutes(block.start) < toMinutes(earliest) ? block.start : earliest, saved?.dayStart ?? current.dayStart),
        dayEnd: seededBlocks.reduce((latest, block) => toMinutes(block.end) > toMinutes(latest) ? block.end : latest, saved?.dayEnd ?? current.dayEnd),
        activeId: saved?.activeId ?? seededBlocks[0]?.id ?? current.activeId,
        blocks: seededBlocks,
      }));
      setActiveEvent(context);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!activeEvent) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem("eventotron-scheduluotron-v1", JSON.stringify(plan));
      setAppletSaveStatus("SAVING");
      void saveSuiteAppletState(activeEvent.id, "scheduluotron", plan)
        .then((stored) => setAppletSaveStatus(stored ? "SAVED" : "NO EVENT FILE"))
        .catch(() => setAppletSaveStatus("NOT ON SERVER"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeEvent, plan]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const blocks = useMemo(
    () =>
      [...plan.blocks].sort(
        (a, b) => toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end),
      ),
    [plan.blocks],
  );

  const conflicts = useMemo(() => {
    const hits = new Set<string>();
    blocks.forEach((a, index) => {
      blocks.slice(index + 1).forEach((b) => {
        if (toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)) {
          hits.add(a.id);
          hits.add(b.id);
        }
      });
    });
    return hits;
  }, [blocks]);

  const checkpoints = blocks.filter((block) => !block.done).length;
  const complete = blocks.length - checkpoints;

  function updateActive(patch: Partial<ScheduleBlock>) {
    if (!active) return;
    setPlan((p) => ({
      ...p,
      blocks: p.blocks.map((block) =>
        block.id === active.id ? { ...block, ...patch } : block,
      ),
    }));
  }

  function addBlock(kind: BlockKind = "setup") {
    const created: ScheduleBlock = {
      id: uid(),
      title: "New schedule block",
      kind,
      start: "12:00",
      end: "12:30",
      owner: "",
      location: "",
      notes: "",
      done: false,
    };
    setPlan((p) => ({
      ...p,
      blocks: [...p.blocks, created],
      activeId: created.id,
    }));
  }

  function removeActive() {
    if (!active) return;
    setPlan((p) => {
      const blocks = p.blocks.filter((block) => block.id !== active.id);
      return { ...p, blocks, activeId: blocks[0]?.id ?? "" };
    });
  }

  function save() {
    localStorage.setItem("eventotron-scheduluotron-v1", JSON.stringify(plan));
    setAppletSaveStatus("SAVING");
    // The toast used to fire here, before the save resolved, so a failed save
    // still announced success. It now reports what actually happened.
    void saveSuiteAppletState(activeEvent?.id, "scheduluotron", plan)
      .then((stored) => {
        setAppletSaveStatus(stored ? "SAVED" : "NO EVENT FILE");
        setNotice(
          stored
            ? "SCHEDULUOTRON SAVED"
            : "KEPT ON THIS COMPUTER · OPEN AN EVENT FILE TO SHARE IT",
        );
      })
      .catch(() => {
        setAppletSaveStatus("NOT ON SERVER");
        setNotice("SAVE FAILED · KEPT ON THIS COMPUTER ONLY");
      });
  }

  function exportSchedule() {
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scheduluotron-${plan.date}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("SCHEDULE EXPORTED");
  }

  return (
    <div className="suite-frame"><SuiteChrome active="scheduluotron" eventId={activeEvent?.id} /><OperationsTicker active="scheduluotron" /><main className="scheduluotron-app">
      <header className="sched-topbar">
        <div className="sched-title">
          <small>SCHEDULUOTRON EVENT CLOCK</small>
          <input
            value={plan.eventName}
            onChange={(e) => setPlan((p) => ({ ...p, eventName: e.target.value }))}
          />
        </div>
        <button onClick={save}>SAVE</button>
        <button className="save-state" data-tone={saveStatusTone(appletSaveStatus)} title={saveStatusHint(appletSaveStatus)} disabled>{appletSaveStatus}</button>
        <button onClick={exportSchedule}>EXPORT</button>
        <button className="primary" onClick={() => printReport(`${plan.eventName} Scheduluotron Day Sheet`)}>
          PRINT DAY SHEET
        </button>
        <button onClick={() => saveReportPdf(`${plan.eventName} Scheduluotron Day Sheet`)}>
          SAVE PDF
        </button>
      </header>

      <section className="sched-workspace">
        <aside className="sched-panel">
          <div className="sched-heading">
            <span>EVENT SETTINGS</span>
            <b>01</b>
          </div>
          <label>
            <span>DATE</span>
            <input
              type="date"
              value={plan.date}
              onChange={(e) => setPlan((p) => ({ ...p, date: e.target.value }))}
            />
          </label>
          <label>
            <span>VENUE</span>
            <input
              value={plan.venue}
              onChange={(e) => setPlan((p) => ({ ...p, venue: e.target.value }))}
            />
          </label>
          <div className="sched-time-grid">
            <label>
              <span>DAY START</span>
              <input
                type="time"
                value={plan.dayStart}
                onChange={(e) => setPlan((p) => ({ ...p, dayStart: e.target.value }))}
              />
            </label>
            <label>
              <span>DAY END</span>
              <input
                type="time"
                value={plan.dayEnd}
                onChange={(e) => setPlan((p) => ({ ...p, dayEnd: e.target.value }))}
              />
            </label>
          </div>
          <div className="sched-heading subsection">
            <span>ADD BLOCK</span>
            <b>02</b>
          </div>
          <div className="kind-grid">
            {kinds.map((kind) => (
              <button key={kind.id} onClick={() => addBlock(kind.id)}>
                {kind.label}
              </button>
            ))}
          </div>
          <div className="sched-note">
            <b>{conflicts.size ? "CONFLICTS DETECTED" : "TIMELINE READY"}</b>
            <span>
              {conflicts.size
                ? `${conflicts.size} blocks overlap. Adjust times before printing.`
                : "No overlapping schedule blocks in the current day window."}
            </span>
          </div>
        </aside>

        <section className="sched-board">
          <div className="sched-toolbar">
            <div>
              <small>{eventIsLive ? "LIVE EVENT" : activeEvent ? "PLANNING EVENT" : "PLANNING WORKSPACE"}</small>
              <b>{plan.eventName}</b>
            </div>
            <div>
              <small>VENUE</small>
              <b>{plan.venue}</b>
            </div>
            <div>
              <small>OPEN CHECKPOINTS</small>
              <b>{checkpoints}</b>
            </div>
          </div>
          <div className="timeline">
            <div className="time-ruler">
              {Array.from({ length: Math.floor(span / 60) + 1 }, (_, index) => {
                const minutes = dayStart + index * 60;
                return (
                  <span key={minutes} style={{ left: `${((minutes - dayStart) / span) * 100}%` }}>
                    {formatRegularTime(toClock(minutes))}
                  </span>
                );
              })}
            </div>
            <div className="timeline-lanes">
              {blocks.map((block) => {
                const start = clamp((toMinutes(block.start) - dayStart) / span, 0, 1);
                const width = clamp(duration(block) / span, 0.02, 1 - start);
                return (
                  <button
                    className={`schedule-block ${block.kind} ${block.id === active?.id ? "active" : ""} ${conflicts.has(block.id) ? "conflict" : ""} ${block.done ? "done" : ""}`}
                    key={block.id}
                    onClick={() => setPlan((p) => ({ ...p, activeId: block.id }))}
                    style={{
                      marginLeft: `${start * 100}%`,
                      width: `${width * 100}%`,
                    }}
                  >
                    <small>
                      {formatRegularTime(block.start)} - {formatRegularTime(block.end)}
                    </small>
                    <b>{block.title}</b>
                    <span>{block.owner || "Unassigned"}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="run-list">
            {blocks.map((block) => (
              <button
                className={`${block.id === active?.id ? "active" : ""} ${block.done ? "done" : ""}`}
                key={block.id}
                onClick={() => setPlan((p) => ({ ...p, activeId: block.id }))}
              >
                <i>{formatRegularTime(block.start)}</i>
                <span>
                  <b>{block.title}</b>
                  <small>
                    {kinds.find((kind) => kind.id === block.kind)?.label} ·{" "}
                    {block.location || "No location"} · {duration(block)} min
                  </small>
                </span>
                <em>{block.done ? "DONE" : conflicts.has(block.id) ? "CONFLICT" : "OPEN"}</em>
              </button>
            ))}
          </div>
        </section>

        <aside className="sched-panel inspector">
          <div className="sched-heading">
            <span>BLOCK INSPECTOR</span>
            <b>03</b>
          </div>
          {active ? (
            <>
              <label>
                <span>TITLE</span>
                <input
                  value={active.title}
                  onChange={(e) => updateActive({ title: e.target.value })}
                />
              </label>
              <label>
                <span>TYPE</span>
                <select
                  value={active.kind}
                  onChange={(e) => updateActive({ kind: e.target.value as BlockKind })}
                >
                  {kinds.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="sched-time-grid">
                <label>
                  <span>START</span>
                  <input
                    type="time"
                    value={active.start}
                    onChange={(e) => updateActive({ start: e.target.value })}
                  />
                </label>
                <label>
                  <span>END</span>
                  <input
                    type="time"
                    value={active.end}
                    onChange={(e) => updateActive({ end: e.target.value })}
                  />
                </label>
              </div>
              <label>
                <span>OWNER / CREW</span>
                <input
                  value={active.owner}
                  onChange={(e) => updateActive({ owner: e.target.value })}
                />
              </label>
              <label>
                <span>LOCATION</span>
                <input
                  value={active.location}
                  onChange={(e) => updateActive({ location: e.target.value })}
                />
              </label>
              <label>
                <span>NOTES</span>
                <textarea
                  value={active.notes}
                  onChange={(e) => updateActive({ notes: e.target.value })}
                />
              </label>
              <label className="done-toggle">
                <input
                  type="checkbox"
                  checked={active.done}
                  onChange={(e) => updateActive({ done: e.target.checked })}
                />
                <span>MARK COMPLETE</span>
              </label>
              <button className="delete" onClick={removeActive}>
                REMOVE BLOCK
              </button>
            </>
          ) : (
            <div className="sched-empty">ADD A SCHEDULE BLOCK</div>
          )}
        </aside>
      </section>

      <footer className="sched-status">
        <div>
          <small>DATE</small>
          <b>{plan.date}</b>
        </div>
        <div>
          <small>BLOCKS</small>
          <b>{plan.blocks.length}</b>
        </div>
        <div>
          <small>COMPLETE</small>
          <b>{complete}</b>
        </div>
        <div className={conflicts.size ? "bad" : "good"}>
          <small>STATUS</small>
          <b>{conflicts.size ? "CONFLICT" : "CLEAR"}</b>
        </div>
      </footer>
      <article className="sched-print-report">
        <header className="sched-print-header">
          <div>
            <small>EVENTOTRON // SCHEDULUOTRON DAY SHEET</small>
            <h1>{plan.eventName}</h1>
            <p>{reportDate(plan.date)} · {plan.venue || "Venue not assigned"}</p>
          </div>
          <div className="sched-print-brand"><b>S<sup>3</sup></b><span>SCHEDULUOTRON<br /><small>SHEPPARD SEMICONDUCTOR SYSTEMS</small></span></div>
        </header>
        <section className="sched-print-section">
          <div className="sched-print-heading"><span>01</span><h2>Day Brief</h2></div>
          <div className="sched-print-fields">
            <div><small>DATE</small><b>{plan.date || "Not set"}</b></div>
            <div><small>VENUE</small><b>{plan.venue || "Not assigned"}</b></div>
            <div><small>DAY WINDOW</small><b>{plan.dayStart} - {plan.dayEnd}</b></div>
            <div><small>OPEN CHECKPOINTS</small><b>{checkpoints}</b></div>
            <div><small>COMPLETED</small><b>{complete}</b></div>
            <div><small>STATUS</small><b>{conflicts.size ? "CONFLICTS" : "CLEAR"}</b></div>
          </div>
        </section>
        <section className="sched-print-section sched-print-timeline">
          <div className="sched-print-heading"><span>02</span><h2>Run of Show</h2></div>
          {blocks.map((block) => (
            <div className={`sched-print-row ${block.done ? "done" : ""} ${conflicts.has(block.id) ? "conflict" : ""}`} key={block.id}>
              <strong>{formatRegularTime(block.start)}<br />{formatRegularTime(block.end)}</strong>
              <div><h3>{block.title}</h3><p>{kinds.find((kind) => kind.id === block.kind)?.label || "Block"} · {block.owner || "Unassigned"} · {block.location || "Location not set"}</p>{block.notes && <small>{block.notes}</small>}</div>
              <span>{block.done ? "DONE" : conflicts.has(block.id) ? "CONFLICT" : "OPEN"}</span>
            </div>
          ))}
        </section>
        <footer className="sched-print-footer">Prepared by Sheppard Semiconductor Systems for setup, staffing, and event-day coordination. Confirm final times, access details, and crew assignments before use.</footer>
      </article>
      {notice && <div className="sched-toast">{notice}</div>}
    </main></div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
