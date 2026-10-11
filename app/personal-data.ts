export type PersonalKind = "event" | "note";
export type PersonalDraft = { id: string; kind: PersonalKind; title: string; date: string; start: string; end: string; location: string; details: string; pinned: boolean };
export type PersonalItem = PersonalDraft & { createdAt: string; updatedAt: string };
export type PersonalSummary = Omit<PersonalItem, "details">;

export function personalOwner(identity: { email: string; source: "access" | "local" }) {
  // Local actor headers are audit labels, not authenticated people.
  return identity.source === "local" ? "local:operator" : `access:${identity.email.toLowerCase()}`;
}

export function validPersonalId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}

export function validPersonalDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2100-12-31") return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validatePersonalDraft(value: unknown): PersonalDraft | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<PersonalDraft>;
  if (!validPersonalId(input.id) || !["event", "note"].includes(input.kind ?? "") || typeof input.title !== "string" || !input.title.trim() || input.title.length > 160 || typeof input.details !== "string" || input.details.length > 12000 || typeof input.pinned !== "boolean") return null;
  for (const field of ["date", "start", "end", "location"] as const) if (typeof input[field] !== "string") return null;
  if (input.location!.length > 160) return null;
  if (input.kind === "event") {
    if (!validPersonalDate(input.date!)) return null;
    if ([input.start, input.end].some(time => time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time!))) return null;
    if (input.end && (!input.start || input.end <= input.start)) return null;
    if (input.pinned) return null;
  } else if (input.date || input.start || input.end || input.location) return null;
  return { id: input.id, kind: input.kind as PersonalKind, title: input.title.trim(), date: input.date!, start: input.start!, end: input.end!, location: input.location!.trim(), details: input.details, pinned: input.pinned };
}

export function personalTime(item: Pick<PersonalDraft, "start" | "end">) {
  const format = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  };
  return item.start ? `${format(item.start)}${item.end ? ` - ${format(item.end)}` : ""}` : "All day";
}
