function clockLabel(hour: number, minute: string | undefined, period: string) {
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute ?? "00"} ${period.toUpperCase()}`;
}

function inferredPeriod(hour: number) {
  if (hour === 0) return "AM";
  if (hour >= 12) return "PM";
  if (hour >= 7 && hour <= 11) return "AM";
  return "PM";
}

export function formatRegularTime(value: string | null | undefined) {
  if (!value) return "";
  if (/^all day$/i.test(value.trim())) return "All day";
  return value
    .replace(
      /\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\b/gi,
      (_match, rawStartHour: string, startMinute: string | undefined, startPeriod: string | undefined, rawEndHour: string, endMinute: string | undefined, endPeriod: string | undefined) => {
        const startHour = Number(rawStartHour);
        const endHour = Number(rawEndHour);
        const normalizedStartPeriod = startPeriod?.toUpperCase() ?? inferredPeriod(startHour);
        const normalizedEndPeriod = endPeriod?.toUpperCase()
          ?? (normalizedStartPeriod === "AM" && endHour <= startHour ? "PM" : normalizedStartPeriod);
        return `${clockLabel(startHour, startMinute, normalizedStartPeriod)} - ${clockLabel(endHour, endMinute, normalizedEndPeriod)}`;
      },
    )
    .replace(/\b(\d{1,2})(?::(\d{2}))\s*(AM|PM)\b/gi, (_match, hour: string, minute: string, period: string) =>
      clockLabel(Number(hour), minute, period),
    )
    .replace(/(?<!:)\b(\d{1,2})\s*(AM|PM)\b/gi, (_match, hour: string, period: string) =>
      clockLabel(Number(hour), undefined, period),
    )
    .replace(/\b(\d{1,2}):(\d{2})(?!\s*(?:AM|PM)\b)/gi, (_match, hour: string, minute: string) =>
      clockLabel(Number(hour), minute, inferredPeriod(Number(hour))),
    );
}
