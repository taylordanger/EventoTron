"use client";

import { useEffect, useState } from "react";
import { isEventLiveNow } from "./live-event-ticker";

type TimedEvent = {
  date: string;
  eventTime: string;
};

export function useEventLiveStatus(event: TimedEvent | null | undefined, timezone: string) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return Boolean(event && isEventLiveNow(event, now, timezone));
}
