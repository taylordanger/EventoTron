"use client";
import type { CSSProperties, ReactNode } from "react";
import { contrastText, suiteAppearanceStyle } from "./calendar-display";
import { useCalendarDisplay } from "./use-calendar-display";

export function SuiteAppearance({ children }: { children: ReactNode }) {
  const { display } = useCalendarDisplay();
  return <div className="suite-appearance" data-appearance-mode={contrastText(display.background) === "#000000" ? "light" : "dark"} style={suiteAppearanceStyle(display) as CSSProperties}>{children}</div>;
}
