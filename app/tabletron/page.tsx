"use client";

import { SuiteChrome } from "../SuiteChrome";
import { readEventContext, type EventoEventContext } from "../event-context";
import { useEffect, useMemo, useRef, useState } from "react";

type TableItem = { id: string; x: number; y: number };
type ShapeKind = "rect" | "circle" | "oval" | "triangle";
type Piece = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
};
type FurnitureTemplate = {
  id: string;
  name: string;
  width: number;
  height: number;
  clearance: number;
  pieces: Piece[];
};
type PlacedItem = { id: string; templateId: string; x: number; y: number };
type Layout = {
  id: string;
  name: string;
  tables: TableItem[];
  objects: PlacedItem[];
};
type Wall = "top" | "right" | "bottom" | "left";
type Entrance = {
  id: string;
  name: string;
  wall: Wall;
  offset: number;
  width: number;
};
type Room = {
  id: string;
  name: string;
  width: number;
  height: number;
  layouts: Layout[];
  activeLayoutId: string;
  entrances: Entrance[];
};
type EventRoom = {
  roomId: string;
  layoutId: string;
  purpose: string;
  setupTime: string;
  guestTime: string;
  endTime: string;
  teardownTime: string;
  notes: string;
};
type FoodPurchase = {
  ingredient: string;
  needed: string;
  package: string;
  quantity: string;
  cost: number;
};
type FoodStore = { store: string; cost: number; items: FoodPurchase[] };
type FoodotronMeal = {
  foodotronMealId?: string;
  tabletronEventId?: string;
  mealName: string;
  date: string;
  guests: number;
  total: number;
  recipes: { name: string; servings: number }[];
  stores: FoodStore[];
  unpriced: { ingredient: string; needed: string }[];
};
type EventPlan = {
  id: string;
  name: string;
  client: string;
  contact: string;
  date: string;
  guestCount: number;
  eventType: string;
  rooms: EventRoom[];
  staffing: string;
  operationsNotes: string;
  clientNotes: string;
  foodotronMealId?: string;
  food?: FoodotronMeal;
};
type Project = {
  name: string;
  rooms: Room[];
  activeRoomId: string;
  templates: FurnitureTemplate[];
  events: EventPlan[];
  activeEventId: string;
};
type Drag = {
  kind: "table" | "object" | "entrance";
  id: string;
  dx: number;
  dy: number;
} | null;
type AutoMode = "comfortable" | "balanced" | "maximum";

const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const feet = (n: number) => `${Math.floor(n)}′ ${Math.round((n % 1) * 12)}″`;
const makeTable = (x: number, y: number): TableItem => ({ id: uid(), x, y });
const makeEntrance = (name = "Main Entrance", offset = 0.5): Entrance => ({
  id: uid(),
  name,
  wall: "bottom",
  offset,
  width: 3,
});
const makeLayout = (
  name = "Dinner layout",
  width = 26,
  height = 26,
): Layout => {
  const insetX = width >= 24 ? 7 : 5;
  const insetY = height >= 24 ? 7 : 5;
  return {
    id: uid(),
    name,
    objects: [],
    tables: [
      makeTable(insetX, insetY),
      makeTable(width - insetX, insetY),
      makeTable(insetX, height - insetY),
      makeTable(width - insetX, height - insetY),
    ],
  };
};
const makeRoom = (name: string, width = 26, height = 26): Room => {
  const layout = makeLayout("Dinner layout", width, height);
  return {
    id: uid(),
    name,
    width,
    height,
    layouts: [layout],
    activeLayoutId: layout.id,
    entrances: [makeEntrance()],
  };
};
const makeFurnitureTemplate = (name: string, index: number): FurnitureTemplate => ({
  id: uid(),
  name,
  width: index % 2 ? 6 : 8,
  height: index % 2 ? 2 : 4,
  clearance: 2,
  pieces: [{ id: uid(), kind: index % 3 === 0 ? "circle" : "rect", x: 8, y: 16, w: 84, h: 68 }],
});
const makeEvent = (name = "New Client Event"): EventPlan => ({
  id: uid(),
  name,
  client: "",
  contact: "",
  date: new Date().toISOString().slice(0, 10),
  guestCount: 25,
  eventType: "Dinner / Reception",
  rooms: [],
  staffing: "",
  operationsNotes: "",
  clientNotes: "",
});
const defaultProject = (): Project => {
  const room = makeRoom("Community Room");
  return {
    name: "LCCC Event Plan",
    rooms: [room],
    activeRoomId: room.id,
    templates: [],
    events: [],
    activeEventId: "",
  };
};

function eventRoomNames(space: string) {
  return space
    .split(/[\\/;,]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, names) => names.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index);
}

function hydrateForEvent(project: Project, source: EventoEventContext): Project {
  const names = eventRoomNames(source.space || "Community Room");
  const rooms = [...project.rooms];
  const roomByName = (name: string) => rooms.find((room) => room.name.toLowerCase() === name.toLowerCase());
  const activeRooms = names.map((name) => {
    const existing = roomByName(name);
    if (existing) return existing;
    const created = makeRoom(name);
    rooms.push(created);
    return created;
  });
  const prior = project.events.find((item) => item.id === source.id);
  const assignments = prior?.rooms.length
    ? prior.rooms.filter((assignment) => rooms.some((room) => room.id === assignment.roomId))
    : activeRooms.map((room, index) => ({
        roomId: room.id,
        layoutId: room.activeLayoutId,
        purpose: index === 0 ? "Primary event space" : "Supporting event space",
        setupTime: "09:00",
        guestTime: "09:00",
        endTime: "12:00",
        teardownTime: "13:00",
        notes: source.description,
      }));
  const requested = (source.requestedItems || "6 FT ROUND TABLES, CHAIRS")
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const templates = [...project.templates];
  requested.forEach((name, index) => {
    if (!templates.some((template) => template.name.toLowerCase() === name.toLowerCase())) {
      templates.push(makeFurnitureTemplate(name, index));
    }
  });
  const eventPlan: EventPlan = {
    ...(prior ?? makeEvent(source.title)),
    id: source.id,
    name: source.title,
    client: source.contact,
    contact: source.email,
    date: source.date,
    guestCount: source.attendees,
    eventType: source.kind,
    rooms: assignments,
    staffing: source.mod || source.manager,
    operationsNotes: source.planningNotes || source.description,
    clientNotes: source.description,
  };
  return {
    ...project,
    name: source.title,
    rooms,
    activeRoomId: activeRooms[0]?.id ?? rooms[0].id,
    templates,
    events: [...project.events.filter((item) => item.id !== source.id), eventPlan],
    activeEventId: source.id,
  };
}

function normalizeProject(value: unknown): Project {
  if (!value || typeof value !== "object") throw new Error("Invalid project");
  const candidate = value as Partial<Project>;
  if (!Array.isArray(candidate.rooms) || candidate.rooms.length === 0)
    throw new Error("A project must contain at least one room");
  const rooms = candidate.rooms.filter(
    (room): room is Room =>
      Boolean(
        room &&
          typeof room.id === "string" &&
          typeof room.name === "string" &&
          Number.isFinite(room.width) &&
          Number.isFinite(room.height) &&
          Array.isArray(room.layouts) &&
          room.layouts.length,
      ),
  ).map((room) => ({
    ...room,
    entrances:
      Array.isArray((room as Room & { entrances?: Entrance[] }).entrances) &&
      (room as Room & { entrances?: Entrance[] }).entrances!.length
        ? (room as Room & { entrances: Entrance[] }).entrances
        : [makeEntrance()],
  }));
  if (!rooms.length) throw new Error("No usable rooms were found");
  return {
    name: typeof candidate.name === "string" ? candidate.name : "Tabletron Project",
    rooms,
    activeRoomId: rooms.some((room) => room.id === candidate.activeRoomId)
      ? candidate.activeRoomId!
      : rooms[0].id,
    templates: Array.isArray(candidate.templates) ? candidate.templates : [],
    events: Array.isArray(candidate.events) ? candidate.events : [],
    activeEventId:
      Array.isArray(candidate.events) &&
      candidate.events.some((event) => event.id === candidate.activeEventId)
        ? candidate.activeEventId ?? ""
        : candidate.events?.[0]?.id ?? "",
  };
}

function TableGraphic({
  selected,
  compact,
}: {
  selected?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`table-art ${selected ? "selected" : ""}`}
      style={compact ? { position: "relative", inset: "auto" } : undefined}
    >
      <div className="table-clearance" />
      <div className="tabletop" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <i
          className="chair"
          key={i}
          style={{
            transform: `translate(-50%,-50%) rotate(${i * 60}deg) translateY(-47px) rotate(90deg)`,
          }}
        />
      ))}
    </div>
  );
}

function Shape({ piece }: { piece: Piece }) {
  return (
    <i
      className={`piece ${piece.kind}`}
      style={{
        left: `${piece.x}%`,
        top: `${piece.y}%`,
        width: `${piece.w}%`,
        height: `${piece.h}%`,
      }}
    />
  );
}

function entranceStyle(entrance: Entrance, room: Room): React.CSSProperties {
  const horizontal = entrance.wall === "top" || entrance.wall === "bottom";
  const length = horizontal ? room.width : room.height;
  const position = `${entrance.offset * 100}%`;
  const size = `${(entrance.width / length) * 100}%`;
  if (horizontal)
    return {
      left: position,
      [entrance.wall]: -2,
      width: size,
      height: 10,
      transform: "translateX(-50%)",
    };
  return {
    top: position,
    [entrance.wall]: -2,
    width: 10,
    height: size,
    transform: "translateY(-50%)",
  };
}

function ReportLayoutMap({
  room,
  layout,
  templates,
}: {
  room: Room;
  layout: Layout;
  templates: FurnitureTemplate[];
}) {
  return (
    <div className="ops-layout-wrap">
      <div
        className="ops-layout-map"
        style={{ aspectRatio: `${room.width}/${room.height}` }}
      >
        <span className="ops-map-size ops-map-width">{room.width} FT</span>
        <span className="ops-map-size ops-map-height">{room.height} FT</span>
        <div className="ops-map-route" />
        {layout.tables.map((table, index) => (
          <div
            className="ops-map-table"
            key={table.id}
            style={{
              left: `${(table.x / room.width) * 100}%`,
              top: `${(table.y / room.height) * 100}%`,
              width: `${(10 / room.width) * 100}%`,
              aspectRatio: "1",
            }}
          >
            <div className="ops-map-clearance" />
            <div className="ops-map-tabletop">{index + 1}</div>
            {[0, 1, 2, 3, 4, 5].map((chair) => (
              <i
                key={chair}
                style={{
                  transform: `translate(-50%, -50%) rotate(${chair * 60}deg) translateY(-560%)`,
                }}
              />
            ))}
          </div>
        ))}
        {layout.objects.map((object) => {
          const template = templates.find((t) => t.id === object.templateId);
          if (!template) return null;
          return (
            <div
              className="ops-map-object"
              key={object.id}
              style={{
                left: `${(object.x / room.width) * 100}%`,
                top: `${(object.y / room.height) * 100}%`,
                width: `${(template.width / room.width) * 100}%`,
                height: `${(template.height / room.height) * 100}%`,
              }}
            >
              {template.name}
            </div>
          );
        })}
        {room.entrances.map((entrance) => (
          <div
            className={`ops-map-door ${entrance.wall}`}
            key={entrance.id}
            style={entranceStyle(entrance, room)}
          >
            {entrance.name}
          </div>
        ))}
      </div>
      <p>
        TOP VIEW · 6 FT ROUND TABLES WITH SIX CHAIRS · DASHED CIRCLES SHOW
        TABLE/CHAIR CLEARANCE
      </p>
    </div>
  );
}

export default function Home() {
  const [project, setProject] = useState<Project>(() => defaultProject());
  const [selected, setSelected] = useState<{
    kind: "table" | "object" | "entrance";
    id: string;
  } | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [roomModal, setRoomModal] = useState<"add" | "edit" | null>(null);
  const [roomDraft, setRoomDraft] = useState({
    name: "New Room",
    width: 26,
    height: 26,
  });
  const [furnitureModal, setFurnitureModal] = useState(false);
  const [autoModal, setAutoModal] = useState(false);
  const [eventModal, setEventModal] = useState(false);
  const [opsReport, setOpsReport] = useState(false);
  const [furnitureDraft, setFurnitureDraft] = useState<FurnitureTemplate>({
    id: "",
    name: "Custom Fixture",
    width: 8,
    height: 3,
    clearance: 2,
    pieces: [{ id: uid(), kind: "rect", x: 5, y: 15, w: 90, h: 70 }],
  });
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const room =
    project.rooms.find((r) => r.id === project.activeRoomId) ??
    project.rooms[0];
  const layout =
    room.layouts.find((l) => l.id === room.activeLayoutId) ?? room.layouts[0];
  const event =
    project.events.find((e) => e.id === project.activeEventId) ??
    project.events[0];

  useEffect(() => {
    const raw = localStorage.getItem("tabletron-project-v2");
    const timer = window.setTimeout(async () => {
      try {
        const stored = raw ? normalizeProject(JSON.parse(raw)) : defaultProject();
        let next: Project = stored;
        const params = new URLSearchParams(window.location.search);
        const transferId =
          params.get("transfer") ??
          window.location.pathname.match(/\/tabletron\/import\/([^/?#]+)/)?.[1] ??
          "";
        const source = params.get("source") ?? "";
        const transferApiBase =
          /^http:\/\/localhost:\d+$/.test(source) ||
          /^http:\/\/127\.0\.0\.1:\d+$/.test(source)
            ? source
            : "";
        const linkedEventId = params.get("event");
        if (transferId) {
          const response = await fetch(`${transferApiBase}/api/tabletron-transfers/${encodeURIComponent(transferId)}`);
          const transfer = await response.json();
          if (!response.ok) throw new Error(transfer.error || "Transfer failed");
          const food = transfer.meal as FoodotronMeal;
          const targetEventId = String(
            food.tabletronEventId ?? transfer.tabletronEventId ?? "",
          );
          const linkedFood: FoodotronMeal = {
            ...food,
            foodotronMealId: String(
              food.foodotronMealId ?? transfer.foodotronMealId ?? "",
            ),
            tabletronEventId: targetEventId,
          };
          const target = targetEventId
            ? next.events.find((entry) => entry.id === targetEventId)
            : undefined;
          let claimedEvent: EventPlan | null = null;
          if (target) {
            claimedEvent = {
              ...target,
              date: target.date || linkedFood.date,
              guestCount: target.guestCount || linkedFood.guests,
              foodotronMealId: linkedFood.foodotronMealId,
              food: linkedFood,
            };
            next = {
              ...next,
              events: next.events.map((entry) =>
                entry.id === target.id
                  ? claimedEvent!
                  : entry,
              ),
              activeEventId: target.id,
            };
            setNotice(`FOODOTRON MEAL ADDED TO ${target.name.toUpperCase()}`);
          } else if (!targetEventId) {
            const created: EventPlan = {
              ...makeEvent(`${linkedFood.mealName} Event`),
              date: linkedFood.date || new Date().toISOString().slice(0, 10),
              guestCount: linkedFood.guests || 25,
              foodotronMealId: linkedFood.foodotronMealId,
              food: linkedFood,
            };
            claimedEvent = created;
            next = {
              ...next,
              events: [...next.events, created],
              activeEventId: created.id,
            };
            setNotice("FOODOTRON MEAL ADDED TO NEW EVENT");
          } else {
            setNotice(
              "ORIGINAL EVENT WAS NOT FOUND · MEAL WAS NOT ADDED OR DUPLICATED",
            );
          }
          if (claimedEvent) {
            await fetch(`${transferApiBase}/api/tabletron-transfers/${encodeURIComponent(transferId)}/complete`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: {
                  id: claimedEvent.id,
                  name: claimedEvent.name,
                  date: claimedEvent.date,
                  guestCount: claimedEvent.guestCount,
                  foodotronMealId: linkedFood.foodotronMealId,
                },
              }),
            });
          }
          window.history.replaceState({}, "", window.location.pathname);
          setEventModal(true);
        } else if (
          linkedEventId &&
          next.events.some((entry) => entry.id === linkedEventId)
        ) {
          next = { ...next, activeEventId: linkedEventId };
          setEventModal(true);
          window.history.replaceState({}, "", window.location.pathname);
        }
        const linkedContext = readEventContext(linkedEventId);
        if (linkedContext) next = hydrateForEvent(next, linkedContext);
        setProject(next);
        setSavedAt(raw ? new Date() : null);
      } catch {
        setProject(defaultProject());
        setNotice("SAVED PROJECT COULD NOT BE READ · A NEW PROJECT WAS OPENED");
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem("tabletron-project-v2", JSON.stringify(project));
        setSavedAt(new Date());
      } catch {
        setNotice("AUTO-SAVE FAILED · DOWNLOAD A BACKUP");
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [project, loaded]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function updateRoom(fn: (r: Room) => Room) {
    setProject((p) => ({
      ...p,
      rooms: p.rooms.map((r) => (r.id === p.activeRoomId ? fn(r) : r)),
    }));
  }
  function updateLayout(fn: (l: Layout) => Layout) {
    updateRoom((r) => ({
      ...r,
      layouts: r.layouts.map((l) => (l.id === r.activeLayoutId ? fn(l) : l)),
    }));
  }
  function save() {
    try {
      localStorage.setItem("tabletron-project-v2", JSON.stringify(project));
      setSavedAt(new Date());
      setNotice("PROJECT SAVED ON THIS DEVICE");
    } catch {
      setNotice("SAVE FAILED · DOWNLOAD A BACKUP");
    }
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = (project.name || "tabletron-project")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    link.href = url;
    link.download = `${safeName || "tabletron-project"}.tabletron.json`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice("PROJECT BACKUP DOWNLOADED");
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      const restored = normalizeProject(JSON.parse(await file.text()));
      setProject(restored);
      localStorage.setItem("tabletron-project-v2", JSON.stringify(restored));
      setSavedAt(new Date());
      setSelected(null);
      setNotice("PROJECT BACKUP RESTORED");
    } catch {
      setNotice("THAT FILE IS NOT A VALID TABLETRON BACKUP");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  const score = useMemo(() => {
    let collisions = 0,
      tight = 0,
      min = Infinity;
    layout.tables.forEach((a, i) => {
      const wall = Math.min(
        a.x - 5,
        a.y - 5,
        room.width - a.x - 5,
        room.height - a.y - 5,
      );
      min = Math.min(min, wall);
      if (wall < 0) collisions++;
      else if (wall < 2) tight++;
      layout.tables.slice(i + 1).forEach((b) => {
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - 10;
        min = Math.min(min, gap);
        if (gap < 0) collisions++;
        else if (gap < 2) tight++;
      });
    });
    layout.objects.forEach((o) => {
      const t = project.templates.find((t) => t.id === o.templateId);
      if (!t) return;
      const wall = Math.min(
        o.x - t.width / 2 - t.clearance,
        o.y - t.height / 2 - t.clearance,
        room.width - o.x - t.width / 2 - t.clearance,
        room.height - o.y - t.height / 2 - t.clearance,
      );
      min = Math.min(min, wall);
      if (wall < 0) collisions++;
      else if (wall < 2) tight++;
    });
    const value = clamp(
      Math.round(
        100 -
          collisions * 24 -
          tight * 7 -
          Math.max(0, layout.tables.length - 4) * 3,
      ),
      0,
      100,
    );
    return {
      value,
      min: min === Infinity ? 0 : min,
      state: collisions ? "COLLISION" : tight ? "TIGHT" : "COMFORTABLE",
    };
  }, [layout, room, project.templates]);

  function switchRoom(id: string) {
    setProject((p) => ({ ...p, activeRoomId: id }));
    setSelected(null);
  }
  function openEditRoom() {
    setRoomDraft({ name: room.name, width: room.width, height: room.height });
    setRoomModal("edit");
  }
  function submitRoom() {
    const width = clamp(Number(roomDraft.width) || 1, 6, 200),
      height = clamp(Number(roomDraft.height) || 1, 6, 200);
    if (roomModal === "add") {
      const newRoom = makeRoom(
        roomDraft.name || "Untitled Room",
        width,
        height,
      );
      setProject((p) => ({
        ...p,
        rooms: [...p.rooms, newRoom],
        activeRoomId: newRoom.id,
      }));
    } else
      updateRoom((r) => ({
        ...r,
        name: roomDraft.name || r.name,
        width,
        height,
      }));
    setRoomModal(null);
    setSelected(null);
  }
  function deleteRoom() {
    if (project.rooms.length === 1) {
      setNotice("A PROJECT NEEDS AT LEAST ONE ROOM");
      return;
    }
    const remaining = project.rooms.filter((r) => r.id !== room.id);
    setProject((p) => ({
      ...p,
      rooms: remaining,
      activeRoomId: remaining[0].id,
    }));
    setRoomModal(null);
  }
  function addLayout() {
    const copy: Layout = {
      ...layout,
      id: uid(),
      name: `Layout ${room.layouts.length + 1}`,
      tables: layout.tables.map((t) => ({ ...t, id: uid() })),
      objects: layout.objects.map((o) => ({ ...o, id: uid() })),
    };
    updateRoom((r) => ({
      ...r,
      layouts: [...r.layouts, copy],
      activeLayoutId: copy.id,
    }));
  }
  function setLayout(id: string) {
    updateRoom((r) => ({ ...r, activeLayoutId: id }));
    setSelected(null);
  }
  function renameLayout(name: string) {
    updateLayout((l) => ({ ...l, name }));
  }

  function addTable() {
    updateLayout((l) => ({
      ...l,
      tables: [...l.tables, makeTable(room.width / 2, room.height / 2)],
    }));
  }
  function addEntrance() {
    const entrance = makeEntrance(
      `Entrance ${room.entrances.length + 1}`,
      clamp(0.25 + room.entrances.length * 0.2, 0.1, 0.9),
    );
    updateRoom((current) => ({
      ...current,
      entrances: [...current.entrances, entrance],
    }));
    setSelected({ kind: "entrance", id: entrance.id });
    setNotice("ENTRANCE ADDED · DRAG IT TO ANY WALL");
  }
  function updateEntrance(id: string, patch: Partial<Entrance>) {
    updateRoom((current) => ({
      ...current,
      entrances: current.entrances.map((entrance) =>
        entrance.id === id ? { ...entrance, ...patch } : entrance,
      ),
    }));
  }
  function generateAutoLayout(mode: AutoMode): TableItem[] {
    const settings = {
      comfortable: { distance: 12, margin: 6 },
      balanced: { distance: 10.5, margin: 5.25 },
      maximum: { distance: 9, margin: 4.5 },
    }[mode];
    if (room.width < settings.margin * 2 || room.height < settings.margin * 2)
      return [];

    const candidates: { x: number; y: number }[] = [];
    for (
      let y = settings.margin;
      y <= room.height - settings.margin;
      y += 0.5
    ) {
      for (
        let x = settings.margin;
        x <= room.width - settings.margin;
        x += 0.5
      ) {
        // Keep a clear approach immediately inside every entrance.
        const blocksEntrance = room.entrances.some((entrance) => {
          const lateral =
            entrance.wall === "top" || entrance.wall === "bottom"
              ? Math.abs(x - entrance.offset * room.width)
              : Math.abs(y - entrance.offset * room.height);
          const inward =
            entrance.wall === "top"
              ? y
              : entrance.wall === "bottom"
                ? room.height - y
                : entrance.wall === "left"
                  ? x
                  : room.width - x;
          return inward < 5 && lateral < entrance.width / 2 + 2;
        });
        if (blocksEntrance) continue;
        candidates.push({ x, y });
      }
    }
    const cx = room.width / 2;
    const cy = room.height / 2;
    const orders = [
      (a: { x: number; y: number }, b: { x: number; y: number }) =>
        a.y - b.y || a.x - b.x,
      (a: { x: number; y: number }, b: { x: number; y: number }) =>
        b.y - a.y || b.x - a.x,
      (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot(b.x - cx, b.y - cy) - Math.hypot(a.x - cx, a.y - cy),
      (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy),
      (a: { x: number; y: number }, b: { x: number; y: number }) =>
        a.x + a.y - (b.x + b.y),
    ];
    let best: { x: number; y: number }[] = [];
    for (const order of orders) {
      const placed: { x: number; y: number }[] = [];
      for (const point of [...candidates].sort(order)) {
        if (
          placed.every(
            (p) =>
              Math.hypot(p.x - point.x, p.y - point.y) >= settings.distance,
          )
        )
          placed.push(point);
      }
      if (placed.length > best.length) best = placed;
    }
    return best.map((point) => makeTable(point.x, point.y));
  }
  function applyAutoLayout(mode: AutoMode) {
    const tables = generateAutoLayout(mode);
    updateLayout((l) => ({
      ...l,
      tables,
      name: `${mode[0].toUpperCase() + mode.slice(1)} auto layout`,
    }));
    setSelected(null);
    setAutoModal(false);
    setNotice(`${tables.length} TABLES / ${tables.length * 6} SEATS PLACED`);
  }
  function addObject(templateId: string) {
    updateLayout((l) => ({
      ...l,
      objects: [
        ...l.objects,
        { id: uid(), templateId, x: room.width / 2, y: room.height / 2 },
      ],
    }));
  }
  function removeSelected() {
    if (!selected) return;
    if (selected.kind === "entrance") {
      updateRoom((current) => ({
        ...current,
        entrances: current.entrances.filter(
          (entrance) => entrance.id !== selected.id,
        ),
      }));
      setSelected(null);
      return;
    }
    updateLayout((l) =>
      selected.kind === "table"
        ? { ...l, tables: l.tables.filter((t) => t.id !== selected.id) }
        : { ...l, objects: l.objects.filter((o) => o.id !== selected.id) },
    );
    setSelected(null);
  }

  function startDrag(
    e: React.PointerEvent,
    kind: "table" | "object",
    id: string,
    x: number,
    y: number,
  ) {
    if (!canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * room.width,
      py = ((e.clientY - r.top) / r.height) * room.height;
    setSelected({ kind, id });
    setDrag({ kind, id, dx: px - x, dy: py - y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function startEntranceDrag(e: React.PointerEvent, entrance: Entrance) {
    setSelected({ kind: "entrance", id: entrance.id });
    setDrag({ kind: "entrance", id: entrance.id, dx: 0, dy: 0 });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drag || !canvasRef.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    const x =
      Math.round(
        clamp(
          ((e.clientX - r.left) / r.width) * room.width - drag.dx,
          0,
          room.width,
        ) * 2,
      ) / 2;
    const y =
      Math.round(
        clamp(
          ((e.clientY - r.top) / r.height) * room.height - drag.dy,
          0,
          room.height,
        ) * 2,
      ) / 2;
    if (drag.kind === "entrance") {
      const distances: { wall: Wall; distance: number }[] = [
        { wall: "top", distance: y },
        { wall: "right", distance: room.width - x },
        { wall: "bottom", distance: room.height - y },
        { wall: "left", distance: x },
      ];
      const wall = distances.sort((a, b) => a.distance - b.distance)[0].wall;
      const offset =
        wall === "top" || wall === "bottom"
          ? clamp(x / room.width, 0.04, 0.96)
          : clamp(y / room.height, 0.04, 0.96);
      updateEntrance(drag.id, { wall, offset });
      return;
    }
    updateLayout((l) =>
      drag.kind === "table"
        ? {
            ...l,
            tables: l.tables.map((t) =>
              t.id === drag.id ? { ...t, x, y } : t,
            ),
          }
        : {
            ...l,
            objects: l.objects.map((o) =>
              o.id === drag.id ? { ...o, x, y } : o,
            ),
          },
    );
  }

  function openFurniture() {
    setFurnitureDraft({
      id: "",
      name: "Custom Fixture",
      width: 8,
      height: 3,
      clearance: 2,
      pieces: [{ id: uid(), kind: "rect", x: 5, y: 15, w: 90, h: 70 }],
    });
    setFurnitureModal(true);
  }
  function addPiece(kind: ShapeKind) {
    setFurnitureDraft((f) => ({
      ...f,
      pieces: [...f.pieces, { id: uid(), kind, x: 25, y: 25, w: 50, h: 50 }],
    }));
  }
  function updatePiece(id: string, key: "x" | "y" | "w" | "h", value: number) {
    setFurnitureDraft((f) => ({
      ...f,
      pieces: f.pieces.map((p) =>
        p.id === id ? { ...p, [key]: clamp(value, 0, 100) } : p,
      ),
    }));
  }
  function saveFurniture() {
    const template = {
      ...furnitureDraft,
      id: uid(),
      name: furnitureDraft.name || "Custom Furniture",
      width: Math.max(0.5, Number(furnitureDraft.width)),
      height: Math.max(0.5, Number(furnitureDraft.height)),
      clearance: Math.max(0, Number(furnitureDraft.clearance)),
    };
    setProject((p) => ({ ...p, templates: [...p.templates, template] }));
    setFurnitureModal(false);
    setNotice("CUSTOM FURNITURE ADDED TO LIBRARY");
  }

  function addEvent() {
    const created = makeEvent();
    setProject((p) => ({
      ...p,
      events: [...p.events, created],
      activeEventId: created.id,
    }));
    setEventModal(true);
  }
  function updateEvent(patch: Partial<EventPlan>) {
    if (!event) return;
    setProject((p) => ({
      ...p,
      events: p.events.map((e) => (e.id === event.id ? { ...e, ...patch } : e)),
    }));
  }
  function foodotronMealUrl(mealId?: string) {
    const params = new URLSearchParams();
    if (event) params.set("tabletronEvent", event.id);
    if (mealId) params.set("meal", mealId);
    const query = params.toString();
    return `/foodotron${query ? `?${query}` : ""}`;
  }
  function toggleEventRoom(roomId: string) {
    if (!event) return;
    const exists = event.rooms.some((r) => r.roomId === roomId);
    if (exists)
      updateEvent({ rooms: event.rooms.filter((r) => r.roomId !== roomId) });
    else {
      const source = project.rooms.find((r) => r.id === roomId);
      if (!source) return;
      updateEvent({
        rooms: [
          ...event.rooms,
          {
            roomId,
            layoutId: source.activeLayoutId,
            purpose: "Event space",
            setupTime: "15:00",
            guestTime: "17:00",
            endTime: "20:00",
            teardownTime: "22:00",
            notes: "",
          },
        ],
      });
    }
  }
  function updateEventRoom(roomId: string, patch: Partial<EventRoom>) {
    if (!event) return;
    updateEvent({
      rooms: event.rooms.map((r) =>
        r.roomId === roomId ? { ...r, ...patch } : r,
      ),
    });
  }
  function deleteEvent() {
    if (!event) return;
    setProject((p) => {
      const events = p.events.filter((e) => e.id !== event.id);
      return { ...p, events, activeEventId: events[0]?.id ?? "" };
    });
    setEventModal(false);
    setOpsReport(false);
  }
  function printOperations() {
    if (!event) return;
    setOpsReport(true);
    window.setTimeout(() => window.print(), 120);
  }

  const eventTimeline = useMemo(() => {
    if (!event) return [];
    const entries: { time: string; label: string; room: string }[] = [];
    for (const assignment of event.rooms) {
      const source = project.rooms.find((r) => r.id === assignment.roomId);
      const name = source?.name ?? "Unknown room";
      entries.push(
        { time: assignment.setupTime, label: "Setup crew begins", room: name },
        {
          time: assignment.guestTime,
          label: "Guest access / program begins",
          room: name,
        },
        { time: assignment.endTime, label: "Room program ends", room: name },
        {
          time: assignment.teardownTime,
          label: "Teardown complete",
          room: name,
        },
      );
    }
    return entries.sort((a, b) => a.time.localeCompare(b.time));
  }, [event, project.rooms]);

  const selectedLabel =
    selected?.kind === "table"
      ? "6 FT ROUND + 6 CHAIRS"
      : selected?.kind === "object"
        ? project.templates.find(
            (t) =>
              t.id ===
              layout.objects.find((o) => o.id === selected.id)?.templateId,
          )?.name
        : selected?.kind === "entrance"
          ? room.entrances.find((entrance) => entrance.id === selected.id)?.name
        : "NO OBJECT SELECTED";
  const selectedEntrance =
    selected?.kind === "entrance"
      ? room.entrances.find((entrance) => entrance.id === selected.id)
      : undefined;

  return (
    <div className="suite-frame"><SuiteChrome active="tabletron" eventId={event?.id} /><main className="tabletron-applet app-shell">
      <header className="topbar">
        <div className="brand">
          <span>T</span>TABLETRON
        </div>
        <label className="project-name">
          <small>PROJECT</small>
          <input
            value={project.name}
            onChange={(e) =>
              setProject((p) => ({ ...p, name: e.target.value }))
            }
          />
        </label>
        <div
          aria-label="Built by Sheppard Semiconductor Systems"
          title="Built by Sheppard Semiconductor Systems"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "6px 13px",
            border: "1px solid #2b6c25",
            background: "#061008",
            color: "#75ff47",
            boxShadow: "inset 0 0 14px #58ff3814",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              position: "relative",
              display: "inline-block",
              fontSize: 25,
              fontWeight: 900,
              lineHeight: 1,
              textShadow: "0 0 9px #66ff4a88",
              paddingRight: 7,
            }}
          >
            S
            <sup
              style={{
                position: "absolute",
                top: -3,
                right: 0,
                fontSize: 10,
                lineHeight: 1,
              }}
            >
              3
            </sup>
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <small style={{ color: "#71936c", fontSize: 7 }}>BUILT BY:</small>
            <b style={{ fontSize: 8, letterSpacing: ".08em" }}>
              SHEPPARD SEMICONDUCTOR SYSTEMS
            </b>
          </span>
        </div>
        <div className="header-actions">
          <button onClick={save} title={savedAt ? `Last saved ${savedAt.toLocaleTimeString()}` : "Save project"}>
            {savedAt ? "✓ SAVED" : "▣ SAVE"}
          </button>
          <button onClick={exportBackup}>⇩ BACKUP</button>
          <button onClick={() => importRef.current?.click()}>⇧ RESTORE</button>
          <input
            ref={importRef}
            className="backup-input"
            type="file"
            accept="application/json,.json"
            aria-label="Restore a Tabletron project backup"
            onChange={(e) => void importBackup(e.target.files?.[0])}
          />
          <button onClick={() => (event ? setEventModal(true) : addEvent())}>
            ▦ EVENT OPS
          </button>
          <button className="primary" onClick={() => window.print()}>
            EXPORT SETUP SHEET
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="rooms panel">
          <div className="panel-heading">
            <span>PROJECT ROOMS</span>
            <b>{String(project.rooms.length).padStart(2, "0")}</b>
          </div>
          <div className="room-list">
            {project.rooms.map((r, i) => (
              <button
                key={r.id}
                onClick={() => switchRoom(r.id)}
                className={r.id === room.id ? "active" : ""}
              >
                <i>{String(i + 1).padStart(2, "0")}</i>
                <span>
                  <b>{r.name}</b>
                  <small>
                    {r.width} × {r.height} FT
                  </small>
                </span>
              </button>
            ))}
          </div>
          <button
            className="add-room"
            onClick={() => {
              setRoomDraft({ name: "New Room", width: 26, height: 26 });
              setRoomModal("add");
            }}
          >
            ＋ ADD ROOM
          </button>
          <div className="panel-heading subsection">
            <span>CLIENT EVENTS</span>
            <b>{String(project.events.length).padStart(2, "0")}</b>
          </div>
          <div className="event-list">
            {project.events.map((e) => (
              <button
                key={e.id}
                className={e.id === event?.id ? "active" : ""}
                onClick={() => {
                  setProject((p) => ({ ...p, activeEventId: e.id }));
                  setEventModal(true);
                }}
              >
                <span>
                  <b>{e.name}</b>
                  <small>
                    {e.date} · {e.rooms.length} ROOMS
                  </small>
                </span>
                {e.food && <i>FOODOTRON</i>}
              </button>
            ))}
          </div>
          <button className="add-room" onClick={addEvent}>
            ＋ NEW CLIENT EVENT
          </button>
          <div className="panel-heading subsection">
            <span>FURNITURE LIBRARY</span>
            <b>{String(project.templates.length + 1).padStart(2, "0")}</b>
          </div>
          <button className="furniture-card" onClick={addTable}>
            <TableGraphic compact />
            <span>
              <b>6 FT ROUND</b>
              <small>+ 6 CHAIRS</small>
            </span>
            <em>＋</em>
          </button>
          {project.templates.map((t) => (
            <button
              className="furniture-card custom"
              onClick={() => addObject(t.id)}
              key={t.id}
            >
              <span className="custom-thumb">
                {t.pieces.map((p) => (
                  <Shape key={p.id} piece={p} />
                ))}
              </span>
              <span>
                <b>{t.name}</b>
                <small>
                  {t.width} × {t.height} FT
                </small>
              </span>
              <em>＋</em>
            </button>
          ))}
          <button className="creator-button" onClick={openFurniture}>
            ◇ FURNITURE CREATOR
          </button>
        </aside>

        <section className="drafting-bay">
          <div className="room-toolbar">
            <div>
              <small>ACTIVE ROOM</small>
              <button onClick={openEditRoom}>
                {room.name} · {room.width} × {room.height} FT　✎
              </button>
            </div>
            <div>
              <small>LAYOUT</small>
              <select
                value={layout.id}
                onChange={(e) => setLayout(e.target.value)}
              >
                {room.layouts.map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={addLayout}>＋ DUPLICATE LAYOUT</button>
            <button onClick={addEntrance}>＋ ENTRANCE</button>
            <button className="primary" onClick={() => setAutoModal(true)}>
              ⚙ AUTO LAYOUT
            </button>
          </div>
          <div className="canvas-stage" style={{ containerType: "size" }}>
            <div
              className="room-canvas"
              ref={canvasRef}
              style={{
                aspectRatio: `${room.width}/${room.height}`,
                width: `min(100cqw, calc(100cqh * ${room.width / room.height}))`,
                height: `min(100cqh, calc(100cqw * ${room.height / room.width}))`,
              }}
              onPointerMove={move}
              onPointerUp={() => setDrag(null)}
              onPointerCancel={() => setDrag(null)}
            >
              <div className="top-measure">{room.width}′—0″</div>
              <div className="side-measure">{room.height}′—0″</div>
              {layout.tables.map((t) => (
                <div
                  key={t.id}
                  className="placed-table"
                  style={{
                    left: `${(t.x / room.width) * 100}%`,
                    top: `${(t.y / room.height) * 100}%`,
                    width: `${(10 / room.width) * 100}%`,
                    height: `${(10 / room.height) * 100}%`,
                  }}
                  onPointerDown={(e) => startDrag(e, "table", t.id, t.x, t.y)}
                >
                  <TableGraphic
                    selected={
                      selected?.kind === "table" && selected.id === t.id
                    }
                  />
                </div>
              ))}
              {layout.objects.map((o) => {
                const t = project.templates.find((t) => t.id === o.templateId);
                if (!t) return null;
                return (
                  <div
                    key={o.id}
                    className={`placed-object ${selected?.kind === "object" && selected.id === o.id ? "selected" : ""}`}
                    style={{
                      left: `${(o.x / room.width) * 100}%`,
                      top: `${(o.y / room.height) * 100}%`,
                      width: `${((t.width + t.clearance * 2) / room.width) * 100}%`,
                      height: `${((t.height + t.clearance * 2) / room.height) * 100}%`,
                    }}
                    onPointerDown={(e) =>
                      startDrag(e, "object", o.id, o.x, o.y)
                    }
                  >
                    <div className="object-clearance" />
                    <div
                      className="object-body"
                      style={{
                        left: `${(t.clearance / (t.width + t.clearance * 2)) * 100}%`,
                        top: `${(t.clearance / (t.height + t.clearance * 2)) * 100}%`,
                        width: `${(t.width / (t.width + t.clearance * 2)) * 100}%`,
                        height: `${(t.height / (t.height + t.clearance * 2)) * 100}%`,
                      }}
                    >
                      {t.pieces.map((p) => (
                        <Shape piece={p} key={p.id} />
                      ))}
                    </div>
                    <label>{t.name}</label>
                  </div>
                );
              })}
              {room.entrances.map((entrance) => (
                <div
                  className={`door ${entrance.wall} ${selected?.kind === "entrance" && selected.id === entrance.id ? "selected" : ""}`}
                  key={entrance.id}
                  style={entranceStyle(entrance, room)}
                  title={`${entrance.name} · drag along or between walls`}
                  onPointerDown={(e) => startEntranceDrag(e, entrance)}
                >
                  <span>{entrance.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="canvas-footer">
            <span>GRID 1 FT</span>
            <span>SNAP 6 IN</span>
            <span>ROOM AREA {room.width * room.height} SQ FT</span>
          </div>
        </section>

        <aside className="inspector panel">
          <div className="panel-heading">
            <span>LAYOUT DETAILS</span>
            <b>03</b>
          </div>
          <label className="field">
            <span>LAYOUT NAME</span>
            <input
              value={layout.name}
              onChange={(e) => renameLayout(e.target.value)}
            />
          </label>
          <div className="object-title">
            <div className="object-symbol">◎</div>
            <span>
              <small>SELECTED OBJECT</small>
              <b>{selectedLabel}</b>
            </span>
          </div>
          {selectedEntrance && (
            <div className="entrance-controls">
              <label className="field">
                <span>ENTRANCE NAME</span>
                <input
                  value={selectedEntrance.name}
                  onChange={(e) =>
                    updateEntrance(selectedEntrance.id, { name: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>WALL</span>
                <select
                  value={selectedEntrance.wall}
                  onChange={(e) =>
                    updateEntrance(selectedEntrance.id, {
                      wall: e.target.value as Wall,
                    })
                  }
                >
                  <option value="top">TOP</option>
                  <option value="right">RIGHT</option>
                  <option value="bottom">BOTTOM</option>
                  <option value="left">LEFT</option>
                </select>
              </label>
              <label className="field">
                <span>DOOR WIDTH (FT)</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  step="0.5"
                  value={selectedEntrance.width}
                  onChange={(e) =>
                    updateEntrance(selectedEntrance.id, {
                      width: clamp(Number(e.target.value) || 1, 1, 20),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>POSITION ALONG WALL</span>
                <input
                  type="range"
                  min="0.04"
                  max="0.96"
                  step="0.01"
                  value={selectedEntrance.offset}
                  onChange={(e) =>
                    updateEntrance(selectedEntrance.id, {
                      offset: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
          )}
          {selected && (
            <button className="delete" onClick={removeSelected}>
              × DELETE SELECTED
            </button>
          )}
          <div className="panel-heading subsection">
            <span>ROOM SUMMARY</span>
            <b>04</b>
          </div>
          <div className="summary-row">
            <span>Tables</span>
            <b>{layout.tables.length}</b>
          </div>
          <div className="summary-row">
            <span>Seats</span>
            <b>{layout.tables.length * 6}</b>
          </div>
          <div className="summary-row">
            <span>Custom items</span>
            <b>{layout.objects.length}</b>
          </div>
          <div className="summary-row">
            <span>Entrances</span>
            <b>{room.entrances.length}</b>
          </div>
          <div className="summary-row">
            <span>Layouts in room</span>
            <b>{room.layouts.length}</b>
          </div>
          <p className="advisory">
            PLANNING AID ONLY
            <br />
            <span>
              Confirm final arrangements against venue and applicable safety
              requirements.
            </span>
          </p>
        </aside>
      </section>

      <footer className="statusbar">
        <div>
          <small>TOTAL SEATING</small>
          <b>{layout.tables.length * 6}</b>
          <span>PEOPLE</span>
        </div>
        <div>
          <small>ROOMS / LAYOUTS</small>
          <b>
            {project.rooms.length} / {room.layouts.length}
          </b>
          <span>IN PROJECT</span>
        </div>
        <div className={score.state.toLowerCase()}>
          <small>MOVEMENT SCORE</small>
          <b>{score.value}</b>
          <span>{score.state}</span>
        </div>
        <div>
          <small>MIN CLEARANCE</small>
          <b>{score.min < 0 ? "0′" : feet(score.min)}</b>
          <span>ESTIMATED</span>
        </div>
        <div className="warning">
          <small>SYSTEM ADVISORY</small>
          <b>
            {score.state === "COLLISION"
              ? "⚠ COLLISION DETECTED"
              : score.state === "TIGHT"
                ? "△ TIGHT CLEARANCE"
                : "✓ LAYOUT COMFORTABLE"}
          </b>
          <span>Drag furniture to compare arrangements.</span>
        </div>
      </footer>

      {roomModal && (
        <div className="modal-backdrop">
          <section className="modal room-modal">
            <header>
              <span>
                {roomModal === "add" ? "CREATE ROOM" : "ROOM SETTINGS"}
              </span>
              <button onClick={() => setRoomModal(null)}>×</button>
            </header>
            <div className="modal-grid">
              <label className="field full">
                <span>ROOM NAME</span>
                <input
                  value={roomDraft.name}
                  onChange={(e) =>
                    setRoomDraft((d) => ({ ...d, name: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>WIDTH (FT)</span>
                <input
                  type="number"
                  min="6"
                  value={roomDraft.width}
                  onChange={(e) =>
                    setRoomDraft((d) => ({
                      ...d,
                      width: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>LENGTH (FT)</span>
                <input
                  type="number"
                  min="6"
                  value={roomDraft.height}
                  onChange={(e) =>
                    setRoomDraft((d) => ({
                      ...d,
                      height: Number(e.target.value),
                    }))
                  }
                />
              </label>
            </div>
            <p>
              Existing furniture is preserved when a room is resized. Anything
              outside the new walls will be flagged.
            </p>
            <footer>
              {roomModal === "edit" && (
                <button className="delete" onClick={deleteRoom}>
                  DELETE ROOM
                </button>
              )}
              <button className="primary" onClick={submitRoom}>
                {roomModal === "add" ? "CREATE ROOM" : "APPLY CHANGES"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {furnitureModal && (
        <div className="modal-backdrop">
          <section className="modal furniture-modal">
            <header>
              <span>FURNITURE CREATOR // BUILD CUSTOM OBJECT</span>
              <button onClick={() => setFurnitureModal(false)}>×</button>
            </header>
            <div className="builder">
              <div className="builder-controls">
                <label className="field">
                  <span>OBJECT NAME</span>
                  <input
                    value={furnitureDraft.name}
                    onChange={(e) =>
                      setFurnitureDraft((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </label>
                <div className="triple">
                  <label className="field">
                    <span>WIDTH FT</span>
                    <input
                      type="number"
                      step=".5"
                      value={furnitureDraft.width}
                      onChange={(e) =>
                        setFurnitureDraft((f) => ({
                          ...f,
                          width: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>DEPTH FT</span>
                    <input
                      type="number"
                      step=".5"
                      value={furnitureDraft.height}
                      onChange={(e) =>
                        setFurnitureDraft((f) => ({
                          ...f,
                          height: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>CLEARANCE FT</span>
                    <input
                      type="number"
                      step=".5"
                      value={furnitureDraft.clearance}
                      onChange={(e) =>
                        setFurnitureDraft((f) => ({
                          ...f,
                          clearance: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
                <h3>ADD SHAPE</h3>
                <div className="shape-buttons">
                  <button onClick={() => addPiece("rect")}>▭ RECTANGLE</button>
                  <button onClick={() => addPiece("circle")}>○ CIRCLE</button>
                  <button onClick={() => addPiece("oval")}>⬭ OVAL</button>
                  <button onClick={() => addPiece("triangle")}>
                    △ TRIANGLE
                  </button>
                </div>
                <div className="piece-list">
                  {furnitureDraft.pieces.map((p, i) => (
                    <div
                      key={p.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr repeat(4, 42px) 24px",
                        gap: 5,
                      }}
                    >
                      <b>
                        {i + 1}. {p.kind.toUpperCase()}
                      </b>
                      {(["x", "y", "w", "h"] as const).map((key) => (
                        <label
                          key={key}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2,
                            color: "#71936c",
                            fontSize: 7,
                          }}
                        >
                          {key.toUpperCase()}
                          <input
                            aria-label={`${p.kind} ${key}`}
                            type="number"
                            min="0"
                            max="100"
                            value={p[key]}
                            onChange={(e) =>
                              updatePiece(p.id, key, Number(e.target.value))
                            }
                            style={{
                              width: "100%",
                              background: "#071009",
                              border: "1px solid #315b34",
                              color: "#d6f4cf",
                              padding: 3,
                            }}
                          />
                        </label>
                      ))}
                      <button
                        onClick={() =>
                          setFurnitureDraft((f) => ({
                            ...f,
                            pieces: f.pieces.filter((x) => x.id !== p.id),
                          }))
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="builder-preview">
                <small>
                  TOP VIEW // {furnitureDraft.width} × {furnitureDraft.height}{" "}
                  FT
                </small>
                <div className="preview-board">
                  {furnitureDraft.pieces.map((p) => (
                    <Shape key={p.id} piece={p} />
                  ))}
                </div>
                <p>
                  Combine basic shapes to represent curved bars, consoles,
                  equipment, counters, sculptures, or anything else the venue
                  owns. X/Y set position; W/H set each component&apos;s size as
                  a percentage of the object.
                </p>
              </div>
            </div>
            <footer>
              <button onClick={() => setFurnitureModal(false)}>CANCEL</button>
              <button className="primary" onClick={saveFurniture}>
                SAVE TO LIBRARY
              </button>
            </footer>
          </section>
        </div>
      )}
      {autoModal && (
        <div className="modal-backdrop">
          <section className="modal">
            <header>
              <span>AUTO LAYOUT // TABLE CAPACITY</span>
              <button onClick={() => setAutoModal(false)}>×</button>
            </header>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 10, color: "#91b68c", lineHeight: 1.6 }}>
                Tabletron will replace the round tables in <b>{layout.name}</b>.
                Custom furniture stays in place. Each result preserves an
                approach at the current entrance marker.
              </p>
              {(["comfortable", "balanced", "maximum"] as AutoMode[]).map(
                (mode) => {
                  const result = generateAutoLayout(mode);
                  const copy = {
                    comfortable: [
                      "COMFORTABLE",
                      "Widest circulation",
                      "12 ft center spacing",
                    ],
                    balanced: [
                      "BALANCED",
                      "More seats with workable aisles",
                      "10.5 ft center spacing",
                    ],
                    maximum: [
                      "MAXIMUM TABLES",
                      "Densest suggested starting point",
                      "9 ft spacing; review warnings",
                    ],
                  }[mode];
                  return (
                    <button
                      key={mode}
                      onClick={() => applyAutoLayout(mode)}
                      style={{
                        width: "100%",
                        display: "grid",
                        gridTemplateColumns: "1.2fr 1.8fr .7fr",
                        alignItems: "center",
                        textAlign: "left",
                        marginTop: 9,
                        padding: 14,
                      }}
                    >
                      <span>
                        <b style={{ color: "var(--p)" }}>{copy[0]}</b>
                        <small
                          style={{
                            display: "block",
                            marginTop: 5,
                            color: "#71936c",
                          }}
                        >
                          {copy[2]}
                        </small>
                      </span>
                      <span>{copy[1]}</span>
                      <strong style={{ fontSize: 22, textAlign: "right" }}>
                        {result.length}
                        <small
                          style={{
                            display: "block",
                            fontSize: 8,
                            color: "#71936c",
                          }}
                        >
                          {result.length * 6} SEATS
                        </small>
                      </strong>
                    </button>
                  );
                },
              )}
            </div>
            <footer>
              <button onClick={() => setAutoModal(false)}>CANCEL</button>
            </footer>
          </section>
        </div>
      )}
      {eventModal && event && (
        <div className="modal-backdrop event-backdrop">
          <section className="modal event-modal">
            <header>
              <span>EVENT OPERATIONS PLANNER</span>
              <button onClick={() => setEventModal(false)}>×</button>
            </header>
            <div className="event-details">
              <label className="field">
                <span>EVENT NAME</span>
                <input
                  value={event.name}
                  onChange={(e) => updateEvent({ name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>CLIENT / ORGANIZATION</span>
                <input
                  value={event.client}
                  onChange={(e) => updateEvent({ client: e.target.value })}
                />
              </label>
              <label className="field">
                <span>CONTACT INFORMATION</span>
                <input
                  value={event.contact}
                  onChange={(e) => updateEvent({ contact: e.target.value })}
                />
              </label>
              <label className="field">
                <span>EVENT DATE</span>
                <input
                  type="date"
                  value={event.date}
                  onChange={(e) => updateEvent({ date: e.target.value })}
                />
              </label>
              <label className="field">
                <span>EXPECTED GUESTS</span>
                <input
                  type="number"
                  min="1"
                  value={event.guestCount}
                  onChange={(e) =>
                    updateEvent({
                      guestCount: Math.max(1, Number(e.target.value)),
                    })
                  }
                />
              </label>
              <label className="field">
                <span>EVENT TYPE</span>
                <input
                  value={event.eventType}
                  onChange={(e) => updateEvent({ eventType: e.target.value })}
                />
              </label>
            </div>
            <div className="event-section-title">
              <span>ROOMS + OPERATING TIMES</span>
              <b>{event.rooms.length} SELECTED</b>
            </div>
            <div className="event-room-list">
              {project.rooms.map((source) => {
                const assignment = event.rooms.find(
                  (r) => r.roomId === source.id,
                );
                return (
                  <div
                    className={`event-room ${assignment ? "selected" : ""}`}
                    key={source.id}
                  >
                    <label className="event-room-check">
                      <input
                        type="checkbox"
                        checked={Boolean(assignment)}
                        onChange={() => toggleEventRoom(source.id)}
                      />
                      <span>
                        <b>{source.name}</b>
                        <small>
                          {source.width} × {source.height} FT ·{" "}
                          {source.layouts.length} LAYOUTS
                        </small>
                      </span>
                    </label>
                    {assignment && (
                      <div className="event-room-controls">
                        <label>
                          <small>LAYOUT</small>
                          <select
                            value={assignment.layoutId}
                            onChange={(e) =>
                              updateEventRoom(source.id, {
                                layoutId: e.target.value,
                              })
                            }
                          >
                            {source.layouts.map((l) => (
                              <option value={l.id} key={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <small>PURPOSE</small>
                          <input
                            value={assignment.purpose}
                            onChange={(e) =>
                              updateEventRoom(source.id, {
                                purpose: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <small>SETUP START</small>
                          <input
                            type="time"
                            value={assignment.setupTime}
                            onChange={(e) =>
                              updateEventRoom(source.id, {
                                setupTime: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <small>GUEST START</small>
                          <input
                            type="time"
                            value={assignment.guestTime}
                            onChange={(e) =>
                              updateEventRoom(source.id, {
                                guestTime: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <small>ROOM END</small>
                          <input
                            type="time"
                            value={assignment.endTime}
                            onChange={(e) =>
                              updateEventRoom(source.id, {
                                endTime: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          <small>TEARDOWN DONE</small>
                          <input
                            type="time"
                            value={assignment.teardownTime}
                            onChange={(e) =>
                              updateEventRoom(source.id, {
                                teardownTime: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="room-notes">
                          <small>ROOM NOTES / SPECIAL SETUP</small>
                          <textarea
                            value={assignment.notes}
                            onChange={(e) =>
                              updateEventRoom(source.id, {
                                notes: e.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="event-notes">
              <label>
                <small>STAFFING / ASSIGNMENTS</small>
                <textarea
                  placeholder="Lead, setup crew, kitchen, bartender, AV, closing staff…"
                  value={event.staffing}
                  onChange={(e) => updateEvent({ staffing: e.target.value })}
                />
              </label>
              <label>
                <small>OPERATIONS NOTES</small>
                <textarea
                  placeholder="Keys, deliveries, accessibility, rentals, vendor arrival, cleanup…"
                  value={event.operationsNotes}
                  onChange={(e) =>
                    updateEvent({ operationsNotes: e.target.value })
                  }
                />
              </label>
              <label>
                <small>CLIENT PROMISES / REQUESTS</small>
                <textarea
                  placeholder="Items confirmed with the client…"
                  value={event.clientNotes}
                  onChange={(e) => updateEvent({ clientNotes: e.target.value })}
                />
              </label>
            </div>
            <div
              className={`foodotron-connection ${event.food ? "connected" : ""}`}
            >
              <div>
                <small>FOODOTRON CONNECTION</small>
                <b>{event.food ? event.food.mealName : "NO MEAL ATTACHED"}</b>
                <span>
                  {event.food
                    ? `${event.food.guests} servings · ${event.food.stores.length} store stops · $${event.food.total.toFixed(2)}`
                    : "Build a meal in Foodotron, then choose Send to Tabletron."}
                </span>
              </div>
              {event.food ? (
                <div className="foodotron-actions">
                  <a href={foodotronMealUrl(event.food.foodotronMealId)} target="_blank" rel="noreferrer">
                    OPEN FOODOTRON MEAL ↗
                  </a>
                  <button onClick={() => updateEvent({ food: undefined, foodotronMealId: undefined })}>
                    REMOVE MEAL
                  </button>
                </div>
              ) : (
                <a
                  href={foodotronMealUrl()}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    localStorage.setItem(
                      "tabletron-project-v2",
                      JSON.stringify(project),
                    );
                    setNotice("EVENT SAVED · OPENING FOODOTRON");
                  }}
                >
                  OPEN FOODOTRON ↗
                </a>
              )}
            </div>
            <footer className="event-actions">
              <button className="delete" onClick={deleteEvent}>
                × DELETE EVENT
              </button>
              <button onClick={() => setOpsReport(true)}>
                VIEW OPERATIONS REPORT
              </button>
              <button
                className="primary"
                disabled={!event.rooms.length}
                onClick={printOperations}
              >
                PRINT OPERATIONS REPORT
              </button>
            </footer>
          </section>
        </div>
      )}
      {opsReport && event && (
        <div className="operations-overlay">
          <article className="operations-report">
            <header>
              <div>
                <small>TABLETRON // EVENT OPERATIONS REPORT</small>
                <h1>{event.name}</h1>
                <p>
                  {event.date} · {event.eventType} · {event.guestCount} expected
                  guests
                </p>
              </div>
              <div className="ops-brand">
                <b>T</b>
                <span>
                  TABLETRON
                  <br />
                  <small>S³ SHEPPARD SEMICONDUCTOR SYSTEMS</small>
                </span>
              </div>
            </header>
            <section className="client-block">
              <div>
                <small>CLIENT / ORGANIZATION</small>
                <b>{event.client || "Not entered"}</b>
              </div>
              <div>
                <small>CONTACT</small>
                <b>{event.contact || "Not entered"}</b>
              </div>
              <div>
                <small>PROJECT</small>
                <b>{project.name}</b>
              </div>
            </section>
            <section className="ops-section">
              <h2>MASTER EVENT TIMELINE</h2>
              <div className="timeline">
                {eventTimeline.map((entry, i) => (
                  <div key={`${entry.room}-${entry.time}-${i}`}>
                    <b>{entry.time}</b>
                    <span>{entry.label}</span>
                    <small>{entry.room}</small>
                  </div>
                ))}
              </div>
            </section>
            <section className="ops-section">
              <h2>ROOM OPERATIONS</h2>
              <div className="ops-room-grid">
                {event.rooms.map((assignment) => {
                  const source = project.rooms.find(
                    (r) => r.id === assignment.roomId,
                  );
                  const chosen = source?.layouts.find(
                    (l) => l.id === assignment.layoutId,
                  );
                  if (!source || !chosen) return null;
                  return (
                    <article className="ops-room-card" key={assignment.roomId}>
                      <header>
                        <div>
                          <h3>{source.name}</h3>
                          <p>{assignment.purpose}</p>
                        </div>
                        <b>{chosen.tables.length * 6} SEATS</b>
                      </header>
                      <dl>
                        <div>
                          <dt>Layout</dt>
                          <dd>{chosen.name}</dd>
                        </div>
                        <div>
                          <dt>Room</dt>
                          <dd>
                            {source.width} × {source.height} ft
                          </dd>
                        </div>
                        <div>
                          <dt>Tables</dt>
                          <dd>{chosen.tables.length} round</dd>
                        </div>
                        <div>
                          <dt>Custom items</dt>
                          <dd>{chosen.objects.length}</dd>
                        </div>
                        <div>
                          <dt>Setup</dt>
                          <dd>{assignment.setupTime}</dd>
                        </div>
                        <div>
                          <dt>Guests</dt>
                          <dd>
                            {assignment.guestTime}–{assignment.endTime}
                          </dd>
                        </div>
                        <div>
                          <dt>Teardown done</dt>
                          <dd>{assignment.teardownTime}</dd>
                        </div>
                      </dl>
                      <ReportLayoutMap
                        room={source}
                        layout={chosen}
                        templates={project.templates}
                      />
                      {assignment.notes && (
                        <p className="ops-room-note">
                          <b>Room notes:</b> {assignment.notes}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="ops-notes-print">
              <div>
                <h2>STAFFING / ASSIGNMENTS</h2>
                <p>{event.staffing || "No staffing notes entered."}</p>
              </div>
              <div>
                <h2>OPERATIONS NOTES</h2>
                <p>{event.operationsNotes || "No operations notes entered."}</p>
              </div>
              <div>
                <h2>CLIENT REQUESTS</h2>
                <p>{event.clientNotes || "No client requests entered."}</p>
              </div>
            </section>
            {event.food && (
              <section className="ops-section food-ops">
                <h2>FOODOTRON CATERING + PURCHASING</h2>
                <div className="food-summary">
                  <div>
                    <small>MEAL</small>
                    <b>{event.food.mealName}</b>
                  </div>
                  <div>
                    <small>SERVINGS</small>
                    <b>{event.food.guests}</b>
                  </div>
                  <div>
                    <small>ESTIMATED TOTAL</small>
                    <b>${event.food.total.toFixed(2)}</b>
                  </div>
                  <div>
                    <small>STORE STOPS</small>
                    <b>{event.food.stores.length}</b>
                  </div>
                </div>
                <div className="food-recipes">
                  {event.food.recipes.map((r) => (
                    <span key={r.name}>
                      <b>{r.name}</b> {r.servings} servings
                    </span>
                  ))}
                </div>
                {event.food.stores.map((store) => (
                  <div className="ops-store" key={store.store}>
                    <h3>
                      <span>{store.store}</span>
                      <b>${store.cost.toFixed(2)}</b>
                    </h3>
                    <div className="ops-food-head">
                      <span>INGREDIENT</span>
                      <span>NEEDED</span>
                      <span>PACKAGE</span>
                      <span>BUY</span>
                      <span>COST</span>
                    </div>
                    {store.items.map((item, i) => (
                      <div
                        className="ops-food-row"
                        key={`${item.ingredient}-${i}`}
                      >
                        <span>
                          <b>{item.ingredient}</b>
                        </span>
                        <span>{item.needed}</span>
                        <span>{item.package}</span>
                        <span>{item.quantity}</span>
                        <span>${item.cost.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {event.food.unpriced.length > 0 && (
                  <div className="ops-store unpriced">
                    <h3>NEEDS PRICE / CONVERSION</h3>
                    {event.food.unpriced.map((item) => (
                      <p key={item.ingredient}>
                        <b>{item.ingredient}</b> — {item.needed}
                      </p>
                    ))}
                  </div>
                )}
              </section>
            )}
            <footer>
              <span>
                Planning aid only. Confirm timing, staffing, purchasing,
                layouts, and applicable safety requirements before the event.
              </span>
              <b>{new Date().toLocaleDateString()}</b>
            </footer>
            <div className="ops-report-actions">
              <button onClick={() => setOpsReport(false)}>CLOSE</button>
              <button className="primary" onClick={() => window.print()}>
                PRINT REPORT
              </button>
            </div>
          </article>
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
    </main></div>
  );
}
