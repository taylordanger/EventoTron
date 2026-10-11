"use client";
import { useEffect } from "react";

export default function SuiteError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.dispatchEvent(new ErrorEvent("error", { error })), 0);
    return () => window.clearTimeout(timer);
  }, [error]);
  return <main className="support-crash"><h1>This view could not be displayed</h1><p>Your saved event files have not been cleared.</p><button onClick={reset}>Try again</button><a href="/support">Support inbox</a></main>;
}
