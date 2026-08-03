"use client";

import { useEffect, useState } from "react";

type ClockValue = {
  time: string;
  date: string;
};

const emptyClock: ClockValue = { time: "--:--:--", date: "Waiting for local time" };

function readClock(): ClockValue {
  const now = new Date();
  return {
    time: new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(now),
    date: new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(now),
  };
}

export function ClockDisplay() {
  const [clock, setClock] = useState<ClockValue>(emptyClock);

  useEffect(() => {
    let interval: number | undefined;
    const timer = window.setTimeout(() => {
      setClock(readClock());
      interval = window.setInterval(() => setClock(readClock()), 1000);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return (
    <time className="suite-clock">
      <span className="suite-clock-label">LOCAL TIME</span>
      <strong>{clock.time}</strong>
      <small>{clock.date}</small>
    </time>
  );
}
