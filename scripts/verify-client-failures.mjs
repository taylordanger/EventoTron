import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(process.env.EVENTOTRON_PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.env.EVENTOTRON_QA_URL || "http://invalid");
if (process.env.EVENTOTRON_ISOLATED_QA !== "1" || target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname) || ["", "3000", "3001", "3101"].includes(target.port) || target.pathname !== "/" || target.search || target.hash || target.username || target.password) throw new Error("Use an isolated local QA server, never the daily-use database.");
const browser = await chromium.launch({ headless: true, ...(process.env.EVENTOTRON_CHROME_PATH ? { executablePath: process.env.EVENTOTRON_CHROME_PATH } : {}) });
const errors = [];
let currentPage;
async function pageFor(init) {
  const context = await browser.newContext();
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(10000);
  page.on("pageerror", error => errors.push(error.message));
  // Failure tests must never persist their mocked edits, reports or diagnostics.
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 503, json: { error: "Test server is unavailable" } }));
  return page;
}
try {
  const corrupt = await pageFor(() => {
    localStorage.setItem("foodotron-plan-v1", "{bad-json");
    localStorage.setItem("eventotron-scheduluotron-v1:standalone", "{bad-json");
    sessionStorage.setItem("eventotron-support-draft", "{bad-json");
  });
  await corrupt.goto(`${target.origin}/foodotron`);
  await corrupt.getByText("SAVED FOOD PLAN COULD NOT BE READ.", { exact: false }).waitFor();
  assert.equal(await corrupt.evaluate(() => localStorage.getItem("foodotron-plan-v1")), "{bad-json");
  await corrupt.goto(`${target.origin}/scheduluotron`);
  await corrupt.getByText("SAVED SCHEDULE COULD NOT BE READ.", { exact: false }).waitFor();
  await corrupt.waitForTimeout(800);
  assert.equal(await corrupt.evaluate(() => localStorage.getItem("eventotron-scheduluotron-v1:standalone")), "{bad-json");
  await corrupt.locator(".suite-more summary").click();
  await corrupt.locator(".suite-more-panel").getByRole("button", { name: "Report a problem", exact: true }).click();
  await corrupt.getByText("The previous report draft could not be read.", { exact: false }).waitFor();
  await corrupt.getByLabel("Title", { exact: true }).fill("Recovery test");
  assert.equal(await corrupt.evaluate(() => sessionStorage.getItem("eventotron-support-draft")), "{bad-json");
  await corrupt.context().close();

  const malformed = await pageFor(() => localStorage.setItem("foodotron-plan-v1", JSON.stringify({ recipes: [{ ingredients: [{}] }] })));
  await malformed.goto(`${target.origin}/foodotron`);
  await malformed.getByText("SAVED FOOD PLAN COULD NOT BE READ.", { exact: false }).waitFor();
  assert.equal(await malformed.evaluate(() => localStorage.getItem("foodotron-plan-v1")), '{"recipes":[{"ingredients":[{}]}]}');
  await malformed.context().close();

  const denied = await pageFor(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage) throw new DOMException("Test storage denied", "QuotaExceededError");
      return set.call(this, key, value);
    };
  });
  await denied.goto(`${target.origin}/settings`);
  await denied.waitForFunction(() => document.querySelector(".suite-identity-badge"));
  await denied.waitForTimeout(300);
  await denied.getByLabel("Venue name", { exact: true }).fill("Unsaved test venue");
  await denied.locator(".shared-save-recovery").getByText("Draft storage is unavailable.", { exact: false }).waitFor();
  await denied.locator(".shared-save-recovery").getByText("Test server is unavailable", { exact: false }).waitFor();
  const download = denied.waitForEvent("download");
  await denied.getByRole("button", { name: "DOWNLOAD MY DRAFT", exact: true }).click();
  const downloaded = await download;
  assert.match(downloaded.suggestedFilename(), /draft\.json$/);
  assert.equal(JSON.parse(await readFile(await downloaded.path(), "utf8")).payload.venueName, "Unsaved test venue");
  await denied.route("**/api/settings", route => route.request().method() === "PUT" ? route.fulfill({ json: { updatedAt: "2026-10-11T12:00:00.000Z" } }) : route.continue());
  await denied.getByRole("button", { name: "RETRY SAVE", exact: true }).click();
  await denied.waitForFunction(() => !document.querySelector(".shared-save-recovery"));
  assert.ok(await denied.getByText("SAVED", { exact: true }).count() > 0, "confirmed server save succeeds even when draft writes are unavailable");
  await denied.locator(".suite-more summary").click();
  await denied.locator(".suite-more-panel").getByRole("button", { name: "Report a problem", exact: true }).click();
  await denied.getByLabel("Title", { exact: true }).fill("Storage denial test");
  await denied.getByText("This report cannot be kept in this tab's storage.", { exact: false }).waitFor();
  await denied.context().close();

  const ticker = await pageFor();
  let feedFailed = true;
  await ticker.route("**/api/events", route => feedFailed ? route.fulfill({ status: 503, json: {} }) : route.continue());
  await ticker.goto(`${target.origin}/foodotron`);
  await ticker.getByText("FEED ERROR", { exact: true }).waitFor();
  assert.ok(await ticker.getByText("The operations feed could not be refreshed.", { exact: false }).isVisible());
  assert.equal(await ticker.getByText("No active or upcoming events found in the connected schedule.", { exact: true }).count(), 0);
  feedFailed = false;
  await ticker.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await ticker.getByText("No active or upcoming events found in the connected schedule.", { exact: true }).waitFor();
  await ticker.context().close();

  const oauth = await pageFor();
  let accountsFailed = true;
  await oauth.route("**/api/settings", route => route.request().method() === "GET" ? route.continue() : route.fulfill({ json: { updatedAt: "2026-10-10T12:00:00.000Z" } }));
  await oauth.route("**/api/calendar-oauth/accounts", route => accountsFailed ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { accounts: [{ id: "qa-account", provider: "google", accountEmail: "test@example.com" }] } }));
  await oauth.goto(`${target.origin}/settings?oauthConnected=google&accountId=qa-account`);
  await oauth.getByText("its calendar source could not be added", { exact: false }).waitFor();
  assert.equal(new URL(oauth.url()).searchParams.get("accountId"), "qa-account", "failed source lookup retains retry context");
  accountsFailed = false;
  await oauth.reload();
  await oauth.getByText("Google Calendar connected.", { exact: true }).waitFor();
  await oauth.waitForFunction(() => !location.search);
  assert.ok(await oauth.locator('input[value="test@example.com"]').count() > 0);
  await oauth.context().close();

  const history = await pageFor();
  let historyFailed = false;
  await history.route("**/api/calendar-sources**", route => historyFailed ? route.fulfill({ status: 503, json: {} }) : route.continue());
  await history.goto(`${target.origin}/settings`);
  await history.waitForFunction(() => document.querySelector(".suite-identity-badge"));
  historyFailed = true;
  await history.getByRole("button", { name: "RUN CHECK", exact: true }).click();
  await history.getByText("CALENDAR HISTORY NOT REFRESHED", { exact: true }).waitFor();
  await history.context().close();
  assert.deepEqual(errors, [], "failure recovery must not crash or reject unhandled promises");
  console.log("PASS: corrupt plans retained; report and save storage failures visible; downloadable draft; ticker retry; OAuth source retry; calendar history failure visible. No API writes persisted.");
} catch (error) {
  console.log(await currentPage.locator("body").innerText());
  console.log(errors);
  throw error;
} finally { await browser.close(); }
