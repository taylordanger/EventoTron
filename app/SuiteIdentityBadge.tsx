"use client";

import { useEffect, useState } from "react";

type Session = {
  email: string;
  role: "admin" | "staff";
  source: "access" | "local";
};

export function SuiteIdentityBadge() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetch("/api/session", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: Session | null) => setSession(data))
        .catch(() => setSession(null));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!session) return null;

  return (
    <div className="suite-identity-badge">
      <span className="suite-identity-label">{session.source === "local" ? "LOCAL" : session.role.toUpperCase()}</span>
      <strong>{session.email}</strong>
    </div>
  );
}
