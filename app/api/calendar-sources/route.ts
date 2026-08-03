type ImportedCalendarEvent = {
  id: string;
  title: string;
  date: string;
  eventTime: string;
  description: string;
  location: string;
};

function unfoldCalendar(value: string) {
  return value.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
}

function unescapeCalendar(value: string) {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function getField(lines: string[], name: string) {
  const line = lines.find((item) => item.startsWith(`${name}:`) || item.startsWith(`${name};`));
  if (!line) return "";
  return unescapeCalendar(line.slice(line.indexOf(":") + 1));
}

function parseCalendarDate(value: string) {
  const clean = value.trim();
  if (/^\d{8}$/.test(clean)) {
    return { date: `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`, time: "All day" };
  }
  const digits = clean.replace(/\D/g, "");
  if (digits.length < 8) return { date: "", time: "" };
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6)) - 1;
  const day = Number(digits.slice(6, 8));
  const hour = Number(digits.slice(8, 10) || "0");
  const minute = Number(digits.slice(10, 12) || "0");
  const parsed = clean.endsWith("Z") ? new Date(Date.UTC(year, month, day, hour, minute)) : new Date(year, month, day, hour, minute);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  return {
    date: parsed.toISOString().slice(0, 10),
    time: parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function parseIcs(value: string): ImportedCalendarEvent[] {
  const lines = unfoldCalendar(value);
  const events: ImportedCalendarEvent[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT") {
      const start = parseCalendarDate(getField(current, "DTSTART"));
      if (start.date && getField(current, "SUMMARY")) {
        events.push({
          id: getField(current, "UID") || `feed-${events.length}-${start.date}`,
          title: getField(current, "SUMMARY"),
          date: start.date,
          eventTime: start.time,
          description: getField(current, "DESCRIPTION"),
          location: getField(current, "LOCATION"),
        });
      }
      current = [];
    } else if (current.length || line === "BEGIN:VEVENT") current.push(line);
  }
  return events;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: string };
    const url = String(body.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return Response.json({ error: "Calendar feed URL must begin with http:// or https://" }, { status: 400 });
    }
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return Response.json({ error: `Calendar feed returned ${response.status}` }, { status: 502 });
    const events = parseIcs(await response.text());
    return Response.json({ events });
  } catch {
    return Response.json({ error: "Calendar feed could not be read" }, { status: 500 });
  }
}
