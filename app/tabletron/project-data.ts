import { normalizeSketches, type SketchStroke } from "./sketch-data.ts";
import { roomNamesMatch } from "./room-names.ts";
import type { SeatingSection } from "./seat-labels.ts";
import type { SuiteSettings } from "../suite-settings";
import type { EventoEventContext } from "../event-context";

export type TableItem = { id: string; x: number; y: number };
export type ShapeKind = "rect" | "circle" | "oval" | "triangle";
export type Piece = {
  id: string;
  kind: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type FurnitureTemplate = {
  id: string;
  name: string;
  width: number;
  height: number;
  clearance: number;
  pieces: Piece[];
};
/** `rotation` is clockwise degrees; absent on items placed before it existed. */
export type PlacedItem = {
  id: string;
  templateId: string;
  x: number;
  y: number;
  rotation?: number;
};
export type Layout = {
  sketches?: SketchStroke[];
  id: string;
  name: string;
  tables: TableItem[];
  objects: PlacedItem[];
  /** Row seating banks. Absent on layouts saved before this feature existed. */
  seating: SeatingSection[];
};
export type Wall = "top" | "right" | "bottom" | "left";
export type Entrance = {
  id: string;
  name: string;
  wall: Wall;
  offset: number;
  width: number;
};
export type Room = {
  kind?: "room" | "hallway";
  connectsTo?: string[];
  id: string;
  name: string;
  width: number;
  height: number;
  layouts: Layout[];
  activeLayoutId: string;
  entrances: Entrance[];
};
export type EventRoom = {
  roomId: string;
  layoutId: string;
  purpose: string;
  setupTime: string;
  guestTime: string;
  endTime: string;
  teardownTime: string;
  notes: string;
};
export type FoodPurchase = {
  ingredient: string;
  needed: string;
  package: string;
  quantity: string;
  cost: number;
};
export type FoodStore = { store: string; cost: number; items: FoodPurchase[] };
export type FoodotronMeal = {
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
export type EventPlan = {
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
export type Project = {
  name: string;
  rooms: Room[];
  activeRoomId: string;
  templates: FurnitureTemplate[];
  events: EventPlan[];
  activeEventId: string;
};
export type Drag = {
  kind: "table" | "object" | "entrance" | "seating";
  id: string;
  dx: number;
  dy: number;
} | null;
export type AutoMode = "comfortable" | "balanced" | "maximum";

/**
 * Rotation kept in 0–359 clockwise degrees. A rectangular table or a ramp is
 * useless at a fixed orientation, and a hallway is mostly things turned to sit
 * along a wall.
 */
export const normalizeRotation = (value: number | undefined) => {
  const degrees = Math.round(Number(value) || 0);
  return ((degrees % 360) + 360) % 360;
};

export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const feet = (n: number) => {
  const inches = Math.round(n * 12);
  return `${Math.floor(inches / 12)}′ ${inches % 12}″`;
};
export const makeTable = (x: number, y: number): TableItem => ({ id: uid(), x, y });
export const makeEntrance = (name = "Main Entrance", offset = 0.5): Entrance => ({
  id: uid(),
  name,
  wall: "bottom",
  offset,
  width: 3,
});
export const makeLayout = (
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
    seating: [],
    tables: [
      makeTable(insetX, insetY),
      makeTable(width - insetX, insetY),
      makeTable(insetX, height - insetY),
      makeTable(width - insetX, height - insetY),
    ],
  };
};
export const makeRoom = (name: string, width = 26, height = 26): Room => {
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
export function parseFurnitureDimensions(name: string, index: number) {
  const upper = name.toUpperCase();
  const feetMatch = upper.match(/(\d+(?:\.\d+)?)\s*FT(?:\s*(?:X|-|BY)\s*(\d+(?:\.\d+)?)\s*FT)?/);
  const inchMatch = upper.match(/(\d+(?:\.\d+)?)\s*IN\s*(?:X|-|BY)\s*(\d+(?:\.\d+)?)\s*IN/);
  if (upper.includes("ROUND") && feetMatch) {
    const diameter = Number(feetMatch[1]);
    return { width: diameter, height: diameter, kind: "circle" as ShapeKind, clearance: 2 };
  }
  if (feetMatch?.[2]) {
    return { width: Number(feetMatch[1]), height: Number(feetMatch[2]), kind: "rect" as ShapeKind, clearance: 2 };
  }
  if (inchMatch) {
    return {
      width: Number(inchMatch[2]) / 12,
      height: Number(inchMatch[1]) / 12,
      kind: "rect" as ShapeKind,
      clearance: 1,
    };
  }
  if (upper.includes("CHAIR")) return { width: 1.5, height: 1.5, kind: "rect" as ShapeKind, clearance: 1 };
  if (upper.includes("PODIUM")) return { width: 2, height: 2, kind: "rect" as ShapeKind, clearance: 2 };
  if (upper.includes("PROJECTOR")) return { width: 2, height: 2, kind: "rect" as ShapeKind, clearance: 3 };
  if (upper.includes("PIANO")) return { width: 5, height: 2.5, kind: "rect" as ShapeKind, clearance: 2 };
  return { width: index % 2 ? 6 : 8, height: index % 2 ? 2 : 4, kind: index % 3 === 0 ? "circle" as ShapeKind : "rect" as ShapeKind, clearance: 2 };
}
export const makeFurnitureTemplate = (name: string, index: number): FurnitureTemplate => {
  const dimensions = parseFurnitureDimensions(name, index);
  return {
    id: uid(),
    name,
    width: dimensions.width,
    height: dimensions.height,
    clearance: dimensions.clearance,
    pieces: [{ id: uid(), kind: dimensions.kind, x: 8, y: 16, w: 84, h: 68 }],
  };
};
export const makeEvent = (name = "New Client Event"): EventPlan => ({
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
export const defaultProject = (settings?: SuiteSettings): Project => {
  const rooms = settings?.rooms?.length
    ? settings.rooms.map((setting) => ({
        ...makeRoom(setting.name, setting.width, setting.height),
        id: setting.id,
      }))
    : [makeRoom("Community Room")];
  return {
    name: settings?.venueName ? `${settings.venueName} Event Plan` : "LCCC Event Plan",
    rooms,
    activeRoomId: rooms[0].id,
    templates: (settings?.equipment ?? []).map((name, index) => makeFurnitureTemplate(name, index)),
    events: [],
    activeEventId: "",
  };
};

export function applySettingsToProject(project: Project, settings: SuiteSettings): Project {
  const rooms = [...project.rooms];
  settings.rooms.forEach((setting) => {
    if (rooms.some((room) => room.name.toLowerCase() === setting.name.toLowerCase())) return;
    rooms.push({
      ...makeRoom(setting.name, setting.width, setting.height),
      id: setting.id,
    });
  });
  const templates = [...project.templates];
  settings.equipment.forEach((name, index) => {
    if (!templates.some((template) => template.name.toLowerCase() === name.toLowerCase())) {
      templates.push(makeFurnitureTemplate(name, index));
    }
  });
  return {
    ...project,
    name: project.name || `${settings.venueName} Event Plan`,
    rooms,
    activeRoomId: rooms.some((room) => room.id === project.activeRoomId)
      ? project.activeRoomId
      : rooms[0].id,
    templates,
  };
}

export function eventRoomNames(space: string) {
  return space
    .split(/[\\/;,]+/)
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, names) => names.findIndex((item) => item.toLowerCase() === name.toLowerCase()) === index);
}

export function tabletronClockValue(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const period = match[3]?.toUpperCase();
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return "";
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function timeRangeParts(...values: Array<string | undefined>) {
  for (const value of values) {
    if (!value?.trim()) continue;
    const normalized = value
      .replace(/[–—]/g, "-")
      .replace(/\s+to\s+/i, "-")
      .trim();
    const range = normalized.match(
      /(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)?)/i,
    );
    const parts = range ? [range[1], range[2]] : normalized.split(/\s*-\s*/);
    if (!parts[0]) continue;
    const endPeriod = parts[1]?.match(/\b(AM|PM)\b/i)?.[1] ?? "";
    const startPeriod = parts[0]?.match(/\b(AM|PM)\b/i)?.[1] ?? "";
    const start = tabletronClockValue(
      endPeriod && !startPeriod ? `${parts[0]} ${endPeriod}` : parts[0],
    );
    const end = tabletronClockValue(
      startPeriod && parts[1] && !endPeriod ? `${parts[1]} ${startPeriod}` : parts[1] ?? "",
    );
    if (start || end) return { start, end };
  }
  return null;
}

export function shouldAutoPlaceTemplate(name: string) {
  const upper = name.toUpperCase();
  if (/TABLECLOTH|CHAIR|FLATWARE|GLASS|NAPKIN|LINEN|PLATE|SILVERWARE/.test(upper))
    return false;
  if (/TABLE/.test(upper) && !/STATION|MERCH|BUFFET|BAR/.test(upper)) return false;
  return /PODIUM|PROJECTOR|PIANO|COFFEE|STATION|BAR|CONCESSION|SOUND|LIGHT|BUFFET|HOSPITALITY|MICROPHONE/.test(
    upper,
  );
}

export function seedLayoutObjects(
  room: Room,
  layout: Layout,
  templates: FurnitureTemplate[],
  requestedNames: string[],
) {
  if (layout.objects.length) return layout;
  const requestedTemplates = requestedNames
    .map((name) =>
      templates.find((template) => template.name.toLowerCase() === name.toLowerCase()),
    )
    .filter((template): template is FurnitureTemplate => Boolean(template))
    .filter((template) => shouldAutoPlaceTemplate(template.name))
    .slice(0, 6);
  if (!requestedTemplates.length) return layout;
  const positions = [
    { x: room.width * 0.12, y: room.height * 0.16 },
    { x: room.width * 0.5, y: room.height * 0.12 },
    { x: room.width * 0.86, y: room.height * 0.18 },
    { x: room.width * 0.16, y: room.height * 0.82 },
    { x: room.width * 0.5, y: room.height * 0.86 },
    { x: room.width * 0.84, y: room.height * 0.82 },
  ];
  return {
    ...layout,
    objects: requestedTemplates.map((template, index) => ({
      id: uid(),
      templateId: template.id,
      x: clamp(positions[index].x, template.width / 2, room.width - template.width / 2),
      y: clamp(positions[index].y, template.height / 2, room.height - template.height / 2),
    })),
  };
}

export function hydrateForEvent(project: Project, source: EventoEventContext, settings?: SuiteSettings): Project {
  const operationsTemplate = settings?.operationsTemplates.find(
    (template) => template.id === source.operationsTemplateId,
  );
  const presetEvent = operationsTemplate?.preset?.event;
  const names = eventRoomNames(source.space || presetEvent?.space || "Community Room");
  const rooms = [...project.rooms];
  const roomByName = (name: string) =>
    rooms.find((room) => roomNamesMatch(room.name, name));
  const configuredRoom = (name: string) =>
    settings?.rooms.find((room) => roomNamesMatch(room.name, name));
  const activeRooms = names.map((name) => {
    const existing = roomByName(name);
    if (existing) return existing;
    const configured = configuredRoom(name);
    const created = {
      ...makeRoom(name, configured?.width ?? 26, configured?.height ?? 26),
      id: configured?.id ?? uid(),
    };
    rooms.push(created);
    return created;
  });
  const prior = project.events.find((item) => item.id === source.id);
  const rentalRange = timeRangeParts(
    source.rentalTime,
    presetEvent?.rentalTime,
    source.eventTime,
    presetEvent?.eventTime,
  );
  const eventRange = timeRangeParts(
    source.eventTime,
    presetEvent?.eventTime,
    source.rentalTime,
    presetEvent?.rentalTime,
  );
  const defaultAssignment = (room: Room, index: number): EventRoom => ({
    roomId: room.id,
    layoutId: room.activeLayoutId,
    purpose: index === 0 ? "Primary event space" : "Supporting event space",
    setupTime: rentalRange?.start || eventRange?.start || "09:00",
    guestTime: eventRange?.start || rentalRange?.start || "09:00",
    endTime: eventRange?.end || rentalRange?.end || "12:00",
    teardownTime: rentalRange?.end || eventRange?.end || "13:00",
    notes: [source.description, operationsTemplate?.preset?.roomSetup?.find(item => roomNamesMatch(item.room, room.name))?.notes].filter(Boolean).join("\n\n"),
  });

  /**
   * Existing assignments win, and rooms the booking names are added to them.
   *
   * This used to be either/or: once an event had any room assigned, the rooms
   * named by its calendars were ignored for good. A booking that later spread
   * into a second room never picked it up, and an event imported before room
   * matching worked stayed attached to whatever it first guessed. Purposes and
   * times an operator has set are never discarded — only missing rooms are
   * appended.
   */
  const priorAssignments = (prior?.rooms ?? []).filter((assignment) =>
    rooms.some((room) => room.id === assignment.roomId),
  );
  const unassigned = activeRooms.filter(
    (room) => !priorAssignments.some((assignment) => assignment.roomId === room.id),
  );
  const assignments = priorAssignments.length
    ? [
        ...priorAssignments,
        ...unassigned.map((room, index) =>
          defaultAssignment(room, priorAssignments.length + index),
        ),
      ]
    : activeRooms.map(defaultAssignment);
  const requested = (source.requestedItems || presetEvent?.requestedItems || "6 FT ROUND TABLES, CHAIRS")
    .split(/[,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const roomItems = (name: string) => operationsTemplate?.preset?.roomSetup?.find(item => roomNamesMatch(item.room, name))?.items ?? [];
  const templates = [...project.templates];
  [...new Set([...requested, ...activeRooms.flatMap(room => roomItems(room.name))])].forEach((name, index) => {
    if (!templates.some((template) => template.name.toLowerCase() === name.toLowerCase())) {
      templates.push(makeFurnitureTemplate(name, index));
    }
  });
  const roomsWithSeededLayouts = prior
    ? rooms
    : rooms.map((room) => {
        if (!activeRooms.some((activeRoom) => activeRoom.id === room.id)) return room;
        return {
          ...room,
          layouts: room.layouts.map((layout) =>
            layout.id === room.activeLayoutId
              ? seedLayoutObjects(room, layout, templates, [...new Set([...requested, ...roomItems(room.name)])])
              : layout,
          ),
        };
      });
  const operationsNotes = [
    source.planningNotes || source.description,
    operationsTemplate ? `Operations template: ${operationsTemplate.name}` : "",
  ].filter(Boolean).join("\n\n");
  const eventPlan: EventPlan = {
    ...(prior ?? makeEvent(source.title)),
    id: source.id,
    name: source.title,
    client: source.contact,
    contact: source.email,
    date: source.date,
    guestCount: source.attendees || presetEvent?.attendees || 0,
    eventType: source.kind,
    rooms: assignments,
    staffing: prior?.staffing ?? (source.mod || source.manager || presetEvent?.manager || ""),
    operationsNotes: prior?.operationsNotes ?? operationsNotes,
    clientNotes: prior?.clientNotes ?? source.description,
  };
  return {
    ...project,
    name: source.title,
    rooms: roomsWithSeededLayouts,
    activeRoomId: activeRooms[0]?.id ?? roomsWithSeededLayouts[0].id,
    templates,
    events: [...project.events.filter((item) => item.id !== source.id), eventPlan],
    activeEventId: source.id,
  };
}

/**
 * Guards a restored seating section, since backups and hand-edited files can
 * carry partial records. Anything unusable is dropped rather than crashing the
 * whole project load.
 */
export function isSeatingSection(value: unknown): value is SeatingSection {
  const candidate = value as Partial<SeatingSection> | null;
  return Boolean(
    candidate &&
      typeof candidate.id === "string" &&
      Number.isFinite(candidate.x) &&
      Number.isFinite(candidate.y) &&
      Array.isArray(candidate.rows),
  );
}

export function normalizeProject(value: unknown): Project {
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
    kind: room.kind === "hallway" ? "hallway" as const : "room" as const,
    connectsTo: Array.isArray(room.connectsTo) ? room.connectsTo.filter(id => typeof id === "string" && id !== room.id) : [],
    // Layouts saved before seating sections existed have no `seating` array.
    layouts: room.layouts.map((layout) => ({
      ...layout,
      seating: Array.isArray(layout.seating) ? layout.seating.filter(isSeatingSection) : [],
      sketches: normalizeSketches(layout.sketches),
    })),
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
