import assert from "node:assert/strict";
import test from "node:test";
import { calendarConfiguration, calendarReadiness, normalizeSource, settingsConfigurationFingerprint } from "../app/calendar-source-state.ts";
const source = { id: "room", name: "Room", provider: "ical", color: "#75ff47", url: "https://example.test/calendar.ics", enabled: true, syncMinutes: 15, lastSynced: "2026-10-10T12:00:00Z", lastError: "", eventCount: 10 };

test("configuration excludes server-owned sync results", () => {
  const configuration = calendarConfiguration(source);
  assert.equal("lastSynced" in configuration, false);
  assert.equal("lastError" in configuration, false);
  assert.equal("eventCount" in configuration, false);
  assert.equal(configuration.url, source.url);
  assert.equal(settingsConfigurationFingerprint({ calendarSources: [source] }), settingsConfigurationFingerprint({ calendarSources: [{ ...source, lastError: "Failed", eventCount: 20 }] }));
  assert.notEqual(settingsConfigurationFingerprint({ calendarSources: [source] }), settingsConfigurationFingerprint({ calendarSources: [{ ...source, enabled: false }] }));
});

test("readiness requires a recent successful sync for every enabled calendar", () => {
  assert.equal(calendarReadiness([source], Date.parse("2026-10-10T12:15:00Z")).state, "ready");
  assert.equal(calendarReadiness([source], Date.parse("2026-10-10T13:00:00Z")).state, "attention");
  assert.equal(calendarReadiness([{ ...source, lastError: "Failed" }], Date.parse(source.lastSynced)).state, "attention");
  assert.equal(calendarReadiness([{ ...source, enabled: false }]).state, "pending");
  assert.equal(calendarReadiness([{ ...source, lastSynced: "bad date" }]).state, "attention");
});

test("invalid connections cannot silently reach the settings batch", () => {
  assert.equal(normalizeSource({ ...source, color: "invalid" }), null);
  assert.equal(normalizeSource({ ...source, id: "" }), null);
  assert.equal(normalizeSource({ ...source, syncMinutes: 1 }).syncMinutes, 5);
});
