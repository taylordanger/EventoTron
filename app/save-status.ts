"use client";

/**
 * Shared vocabulary for the save indicator that every applet shows.
 *
 * This exists because the indicator used to be styled the same regardless of
 * what it said: a failed save rendered in the same green as a successful one,
 * so staff had no way to tell that their work had not reached the server.
 * Tone is derived here, once, rather than in each applet.
 */

export type SaveTone = "ok" | "working" | "warning";

export const SAVE_STATUS = {
  /** Stored on the server. */
  saved: "SAVED",
  /** In flight. */
  saving: "SAVING",
  /** Loaded and idle, nothing to send yet. */
  ready: "READY",
  /**
   * Kept on this device, but the server rejected or never received it. Named
   * for the consequence rather than the mechanism: "LOCAL ONLY" read as
   * reassuring, and was one word away from the healthy "LOCAL READY" state.
   */
  notOnServer: "NOT ON SERVER",
  /**
   * Nothing was sent, because the applet is not attached to an event file yet.
   * Distinct from "SAVED", which used to be shown here even though no request
   * had been made at all.
   */
  noEventFile: "NO EVENT FILE",
} as const;

const WARNING = new Set<string>([
  SAVE_STATUS.notOnServer,
  "DELETE FAILED",
  "CONFLICT - REVIEW",
  "IMPORTED LOCALLY",
]);

const WORKING = new Set<string>([
  SAVE_STATUS.saving,
  SAVE_STATUS.noEventFile,
  "IMPORTING EVENT",
  "DELETING EVENT",
]);

/** Severity for a status string, so styling cannot contradict the words. */
export function saveStatusTone(status: string): SaveTone {
  const value = (status ?? "").trim().toUpperCase();
  if (WARNING.has(value)) return "warning";
  if (WORKING.has(value)) return "working";
  return "ok";
}

/**
 * Plain-language explanation for the indicator's tooltip. Warnings say what
 * happened and what to do; healthy states stay quiet.
 */
export function saveStatusHint(status: string): string {
  const value = (status ?? "").trim().toUpperCase();
  switch (value) {
    case SAVE_STATUS.notOnServer:
      return "Your work is saved on this computer but has not reached the server, so other staff will not see it yet. Check your connection — EventoTron will try again on the next change.";
    case "IMPORTED LOCALLY":
      return "This event was imported on this computer but has not reached the server yet. Check your connection, then save again.";
    case "DELETE FAILED":
      return "EventoTron could not delete that. Nothing was removed. Try again, and check your connection if it keeps failing.";
    case "CONFLICT - REVIEW":
      return "Someone else changed this event while you had it open. Review the differences before saving so neither set of changes is lost.";
    case SAVE_STATUS.saving:
      return "Saving to the server.";
    case SAVE_STATUS.saved:
      return "Saved to the server.";
    case SAVE_STATUS.noEventFile:
      return "Kept on this computer. Create or open an event file to store this work on the server where other staff can see it.";
    default:
      return "";
  }
}
