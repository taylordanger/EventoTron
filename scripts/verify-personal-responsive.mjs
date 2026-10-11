import assert from "node:assert/strict";
const { chromium } = await import(process.env.EVENTOTRON_PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.env.EVENTOTRON_QA_URL || "http://invalid");
if (process.env.EVENTOTRON_ISOLATED_QA !== "1" || target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname) || ["", "3000", "3001", "3101"].includes(target.port) || target.pathname !== "/" || target.search || target.hash || target.username || target.password) throw new Error("Use an isolated local QA server, never the daily-use database.");
const browser = await chromium.launch({ headless: true, ...(process.env.EVENTOTRON_CHROME_PATH ? { executablePath: process.env.EVENTOTRON_CHROME_PATH } : {}) });
const created = [];
let debugPage;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "America/Los_Angeles" });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  debugPage = page;
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  // Only personal writes reach the disposable QA database.
  await context.route("**/api/**", route => route.request().method() === "GET" || new URL(route.request().url()).pathname === "/api/personal" ? route.continue() : route.fulfill({ json: {} }));
  const sharedBefore = await page.request.get(`${target.origin}/api/events`).then(res => res.json());
  await page.goto(`${target.origin}/personal`);
  await page.getByRole("button", { name: "+ Personal Event", exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector(".personal-actions button").disabled);
  assert.ok((await page.locator(".personal-local-warning").innerText()).includes("one operator"));
  await page.getByRole("button", { name: "+ Personal Event", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Personal QA appointment");
  await page.getByLabel("Start", { exact: true }).fill("09:00");
  await page.getByLabel("End", { exact: true }).fill("10:00");
  await page.getByLabel("Location", { exact: true }).fill("Personal clinic");
  await page.getByLabel("Personal event notes", { exact: true }).fill("Private appointment details");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved to My Workspace.", { exact: true }).waitFor();
  const listed = await page.request.get(`${target.origin}/api/personal`).then(res => res.json());
  const appointment = listed.items.find(item => item.title === "Personal QA appointment"); assert.ok(appointment); created.push(appointment.id);
  await page.getByRole("button", { name: "Close personal editor", exact: true }).click();
  for (const view of ["day", "week", "agenda", "month"]) {
    await page.getByRole("group", { name: "Personal calendar view", exact: true }).getByRole("button", { name: view, exact: true }).click();
    await page.locator(".personal-event").filter({ hasText: "Personal QA appointment" }).waitFor();
  }
  await page.locator(".personal-calendar .day-cell:not(.blank)").last().scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  assert.ok(await page.locator(".personal-calendar .day-cell.today").evaluate(el => { const rect = el.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0; }), "Today returns to the current day's entries even when the date has not changed");
  await page.getByRole("button", { name: "My Notes", exact: true }).click();
  await page.getByRole("button", { name: "+ Note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Personal QA note");
  await page.getByLabel("Personal note", { exact: true }).fill("Only my workspace should contain this note.");
  await page.getByLabel("Pinned", { exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Saved to My Workspace.", { exact: true }).waitFor();
  const note = (await page.request.get(`${target.origin}/api/personal`).then(res => res.json())).items.find(item => item.title === "Personal QA note"); assert.ok(note.pinned); created.push(note.id);
  await page.reload();
  await page.getByRole("button", { name: "My Notes", exact: true }).click();
  await page.getByRole("button", { name: "Open note Personal QA note", exact: true }).click();
  assert.equal(await page.getByLabel("Personal note", { exact: true }).inputValue(), "Only my workspace should contain this note.");
  const second = await context.newPage();
  await second.goto(`${target.origin}/personal`);
  await second.getByRole("button", { name: "My Notes", exact: true }).click();
  await second.getByRole("button", { name: "Open note Personal QA note", exact: true }).click();
  await second.getByLabel("Personal note", { exact: true }).fill("Saved from second tab.");
  await second.getByRole("button", { name: "Save", exact: true }).click();
  await second.getByText("Saved to My Workspace.", { exact: true }).waitFor();
  await page.getByLabel("Personal note", { exact: true }).fill("Original tab's unsaved draft.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "another tab" }).waitFor();
  assert.equal(await page.getByLabel("Personal note", { exact: true }).inputValue(), "Original tab's unsaved draft.");
  assert.ok(await page.getByRole("button", { name: "Save", exact: true }).isDisabled());
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reload Latest Version", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.personal-editor textarea').value === "Saved from second tab.");
  await page.getByRole("button", { name: "Close personal editor", exact: true }).click();
  await second.close();
  const sharedAfter = await page.request.get(`${target.origin}/api/events`).then(res => res.json());
  assert.deepEqual(sharedAfter.events, sharedBefore.events, "personal items never become shared events");
  const exported = await page.request.get(`${target.origin}/api/personal?export=1`);
  assert.match(exported.headers()["cache-control"], /private, no-store/);
  assert.ok((await exported.json()).items.some(item => item.details === "Saved from second tab."));
  assert.ok(!(await page.request.get(`${target.origin}/api/workspace-backup`).then(res => res.text())).includes("Personal QA note"), "team backup must not include personal content");
  const spoofed = await page.request.get(`${target.origin}/api/personal`, { headers: { "x-eventotron-actor": "pretend-coworker" } }).then(res => res.json());
  assert.equal(spoofed.account, "Local operator", "local mode must never pretend actor headers are private profiles");

  const routes = [
    ["/", ".eventotron-workbench", [".event-stack", ".calendar-panel", ".event-info-sheet"]],
    ["/foodotron", ".foodotron-applet", [".recipes", ".planner", ".inspector", ".statusbar .basket"]],
    ["/tabletron", ".tabletron-applet", [".rooms", ".drafting-bay", ".inspector", ".statusbar .warning"]],
    ["/scheduluotron", ".scheduluotron-app", [".sched-panel", ".sched-board", ".inspector", ".sched-status"]],
    ["/settings", ".settings-applet", [".settings-layout", ".settings-backup-card"]],
    ["/support", ".support-workspace", [".support-heading", ".support-filters"]],
    ["/personal", ".personal-workspace", [".personal-tabs", ".personal-calendar"]],
  ];
  await page.evaluate(() => { localStorage.setItem("eventotron-calendar-display-v1", JSON.stringify({ background: "#f4f7fa", accent: "#3157b7", textSize: 20, view: "month", density: "comfortable" })); });
  for (const width of [1920, 1440, 1280, 1024, 900, 820, 768, 600, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 900 ? 600 : 850 });
    for (const [path, root, panels] of routes) {
      await page.goto(target.origin + path); await page.locator(root).waitFor();
      await page.waitForFunction(() => document.querySelector(".suite-appearance")?.style.getPropertyValue("--ui-scale") === String(20 / 12));
      for (const panel of panels) { await page.locator(`${root} ${panel}`).first().waitFor(); assert.ok(await page.locator(`${root} ${panel}`).first().isVisible(), `${path} ${panel} must stay available at ${width}`); }
      const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: innerWidth, nodes: [...document.querySelectorAll("body *")].filter(el => { const rect = el.getBoundingClientRect(); return rect.width && rect.right > innerWidth + 1 && getComputedStyle(el).position !== "absolute"; }).slice(-12).map(el => `${el.tagName}.${el.className}`) }));
      assert.ok(overflow.document <= width + 1, `${path} ${width}px page overflow: ${JSON.stringify(overflow)}`);
      for (const label of ["Calendar", "My Workspace", "Tabletron", "Foodotron", "Scheduluotron", "Settings", "Support"]) assert.ok(await page.getByRole("navigation", { name: "EventoTron tools", exact: true }).getByRole("link", { name: label, exact: true }).isVisible(), `navigation ${label} at ${width}`);
      assert.ok(await page.locator(".suite-chrome > .suite-clock").isVisible(), `always-visible clock on ${path} at ${width}`);
      if (path === "/tabletron") {
        const canvas = await page.locator(".room-canvas").boundingBox(); const stage = await page.locator(".canvas-stage").boundingBox();
        assert.ok(canvas.width > 100 && canvas.height > 100 && canvas.width <= stage.width && canvas.height <= stage.height, `room canvas framed at ${width}`);
        const chairs = await page.locator(".room-canvas .chair").evaluateAll(elements => {
          const room = document.querySelector(".room-canvas").getBoundingClientRect();
          return elements.every(el => { const rect = el.getBoundingClientRect(); return rect.left >= room.left - 1 && rect.right <= room.right + 1 && rect.top >= room.top - 1 && rect.bottom <= room.bottom + 1; });
        });
        assert.ok(chairs, `default layout chairs must scale inside the room at ${width}`);
        if ([1440, 820, 320].includes(width)) await page.locator(".canvas-stage").screenshot({ path: `/private/tmp/eventotron-adaptive-canvas-${width}.png` });
      }
      if ([1440, 820, 390, 320].includes(width)) await page.screenshot({ path: `/private/tmp/eventotron-adaptive-${path === "/" ? "home" : path.slice(1)}-${width}.png`, fullPage: width <= 390 });
    }
  }
  for (const width of [1024, 390, 320]) {
    await page.setViewportSize({ width, height: 650 });
    await page.goto(`${target.origin}/foodotron`);
    await page.getByRole("button", { name: "MEAL PLANNER", exact: false }).click();
    await page.locator(".meal-modal").waitFor();
    assert.ok(await page.locator(".meal-modal").evaluate(el => el.scrollWidth <= el.clientWidth + 1), `meal planner must fit at ${width}`);
    await page.getByRole("button", { name: "VIEW REPORT", exact: true }).click();
    await page.locator(".meal-report").waitFor();
    assert.ok(await page.locator(".meal-report").evaluate(el => el.scrollWidth <= el.clientWidth + 1), `shopping report must fit at ${width}`);
    await page.getByRole("button", { name: "CLOSE", exact: true }).click();
    await page.getByRole("button", { name: "Close meal planner", exact: true }).click();
    await page.goto(`${target.origin}/tabletron`);
    await page.getByRole("button", { name: "AUTO LAYOUT", exact: false }).click();
    await page.locator(".modal-backdrop .modal").waitFor();
    assert.ok(await page.locator(".modal-backdrop .modal").evaluate(el => el.scrollWidth <= el.clientWidth + 1), `room layout dialog must fit at ${width}`);
    await page.goto(`${target.origin}/personal`);
    await page.getByRole("button", { name: "My Notes", exact: true }).click();
    await page.getByRole("button", { name: "Open note Personal QA note", exact: true }).click();
    await page.getByLabel("Personal note", { exact: true }).waitFor();
    assert.ok(await page.locator(".personal-editor").evaluate(el => el.scrollWidth <= el.clientWidth + 1), `note editor must fit at ${width}`);
    await page.getByRole("button", { name: "Close personal editor", exact: true }).click();
  }
  const reportEvent = { id: "adaptive-report-qa", title: "A long event title for the adaptive department report preview", date: "2026-10-10", kind: "meeting", attendees: 30, space: "Auditorium", eventTime: "10:00 AM - 12:00 PM", rentalTime: "", manager: "", contact: "", phone: "", email: "", description: "Report preview QA", planningNotes: "Setup notes", mod: "", vacation: "", rentalTotal: 0, cateringTotal: 0, discountRate: 0, deposit: 0, paymentNotes: "", quoteEnteredBy: "" };
  await context.route("**/api/event-bundle?eventId=adaptive-report-qa", route => route.fulfill({ json: { event: reportEvent, settings: null, applets: { foodotron: null, tabletron: null, scheduluotron: null } } }));
  for (const width of [1440, 820, 390, 320]) {
    await page.setViewportSize({ width, height: 650 });
    await page.goto(`${target.origin}/master-report?event=adaptive-report-qa`);
    await page.locator(".report-builder").waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `master report must fit at ${width}`);
    assert.equal(await page.locator(".support-launcher").evaluate(el => getComputedStyle(el).position), "static", "feedback control must not cover report content");
    await page.screenshot({ path: `/private/tmp/eventotron-adaptive-master-report-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log("PASS: personal calendar/notes CRUD and persistence, pinned notes, two-tab conflict recovery, private export/shared-backup separation, honest local identity; all tools and inspectors available at ten window widths with large text.");
  await context.close();
} catch (error) {
  if (debugPage && !debugPage.isClosed()) { console.log(await debugPage.locator("body").innerText()); await debugPage.screenshot({ path: "/private/tmp/eventotron-personal-responsive-failure.png", fullPage: true }); }
  throw error;
} finally {
  for (const id of created) {
    const item = await fetch(`${target.origin}/api/personal?id=${id}`).then(res => res.json()).catch(() => null);
    if (item?.item) await fetch(`${target.origin}/api/personal`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, expectedUpdatedAt: item.item.updatedAt }) });
  }
  await browser.close();
}
