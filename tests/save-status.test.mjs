import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  SAVE_STATUS,
  saveStatusHint,
  saveStatusTone,
} from "../app/save-status.ts";

/**
 * The save indicator is the only signal staff get that their work reached the
 * server. It used to render every state in the success green, so a save that
 * failed looked exactly like one that succeeded — and the healthy Tabletron
 * state ("LOCAL READY") was one word from the failure state ("LOCAL ONLY").
 */

test("a failed save is never styled as a success", () => {
  assert.equal(saveStatusTone(SAVE_STATUS.notOnServer), "warning");
  assert.equal(saveStatusTone("DELETE FAILED"), "warning");
  assert.equal(saveStatusTone("CONFLICT - REVIEW"), "warning");
  assert.equal(saveStatusTone("IMPORTED LOCALLY"), "warning");
});

test("healthy and in-flight states are distinguished from failures", () => {
  assert.equal(saveStatusTone(SAVE_STATUS.saved), "ok");
  assert.equal(saveStatusTone(SAVE_STATUS.ready), "ok");
  assert.equal(saveStatusTone(SAVE_STATUS.saving), "working");
  assert.equal(saveStatusTone(SAVE_STATUS.noEventFile), "working");
});

test("tone is case- and whitespace-insensitive", () => {
  assert.equal(saveStatusTone("  not on server "), "warning");
  assert.equal(saveStatusTone("not on server"), "warning");
});

test("an unknown status is not claimed to be a failure", () => {
  // Unknown states should read as ordinary rather than alarming staff mid-event.
  assert.equal(saveStatusTone("CALENDARS ADDED"), "ok");
  assert.equal(saveStatusTone(""), "ok");
  assert.equal(saveStatusTone(undefined), "ok");
});

test("every warning explains what happened and what to do", () => {
  for (const status of ["NOT ON SERVER", "DELETE FAILED", "CONFLICT - REVIEW", "IMPORTED LOCALLY"]) {
    const hint = saveStatusHint(status);
    assert.ok(hint.length > 30, `no explanation for ${status}`);
    assert.match(
      hint,
      /check|try again|review|create|open|save/i,
      `no next step offered for ${status}: "${hint}"`,
    );
    assert.doesNotMatch(hint, /localStorage|payload|API|HTTP|null/i, `leaks plumbing: "${hint}"`);
  }
});

test("the misleading status names are gone from the applets", async () => {
  const files = [
    "app/page.tsx",
    "app/settings/page.tsx",
    "app/tabletron/page.tsx",
    "app/foodotron/page.tsx",
    "app/scheduluotron/page.tsx",
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /"LOCAL ONLY"/, `${file} still reports the old failure wording`);
    assert.doesNotMatch(source, /"LOCAL READY"/, `${file} still uses a name that reads like the failure state`);
  }
});

test("every save indicator is rendered with its tone", async () => {
  // A render site without data-tone silently falls back to the success styling,
  // which is the exact bug this replaced.
  const files = [
    "app/settings/page.tsx",
    "app/tabletron/page.tsx",
    "app/foodotron/page.tsx",
    "app/scheduluotron/page.tsx",
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    const indicators = source.match(/className="save-state"[^>]*>/g) ?? [];
    assert.ok(indicators.length > 0, `${file} has no save indicator`);
    for (const tag of indicators) {
      assert.match(tag, /data-tone=\{saveStatusTone\(/, `${file} renders an indicator without a tone: ${tag}`);
      assert.match(tag, /title=\{saveStatusHint\(/, `${file} renders an indicator without an explanation: ${tag}`);
    }
  }
});

test("a save that sent nothing is not reported as saved", async () => {
  // saveSuiteAppletState resolves with null when there is no event id, having
  // made no request at all. Reporting SAVED there told staff the server held
  // work it had never been sent.
  for (const file of ["app/tabletron/page.tsx", "app/foodotron/page.tsx", "app/scheduluotron/page.tsx"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /\.then\(\s*\(\s*\)\s*=>\s*setAppletSaveStatus\("SAVED"\)\s*\)/,
      `${file} reports SAVED without checking that anything was stored`,
    );
    assert.match(source, /NO EVENT FILE/, `${file} never reports the not-linked state`);
  }
});
