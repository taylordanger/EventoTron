import assert from "node:assert/strict";
const { chromium } = await import(process.env.EVENTOTRON_PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.env.EVENTOTRON_QA_URL || "http://invalid");
if (process.env.EVENTOTRON_ISOLATED_QA !== "1" || target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname) || ["", "3000", "3001", "3101"].includes(target.port) || target.pathname !== "/" || target.search || target.hash || target.username || target.password) throw new Error("Use an isolated local QA server, never the daily-use database.");
const browser = await chromium.launch({ headless: true, ...(process.env.EVENTOTRON_CHROME_PATH ? { executablePath: process.env.EVENTOTRON_CHROME_PATH } : {}) });
try {
  const page = await browser.newPage({ timezoneId: "America/Los_Angeles" });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") console.log(message.text()); });
  await page.goto(target.origin);
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; });
  const event = { id: "calendar-layout-qa", title: "Today's explicit event", date: today, kind: "rental", space: "Auditorium", attendees: 20, eventTime: "10:00 AM - 12:00 PM", rentalTime: "", manager: "", contact: "", phone: "", email: "", description: "", planningNotes: "", mod: "", vacation: "", rentalTotal: 0, cateringTotal: 0, discountRate: 0, deposit: 0, paymentNotes: "", quoteEnteredBy: "", requestedItems: "" };
  const source = { id: "qa", name: "QA calendar", provider: "ical", url: "https://example.test/qa.ics", enabled: true, color: "#d5ff36", syncMinutes: 60, lastSynced: new Date().toISOString() };
  const feeds = Array.from({ length: 24 }, (_, i) => ({ id: `feed-${i}`, title: `Busy day event ${i + 1} with a long complete title and room information`, date: today, eventTime: "1:00 PM - 2:00 PM", description: "", location: "Auditorium", sourceId: source.id, sourceName: source.name, color: source.color }));
  feeds.push({ ...feeds[0], id: "month-end", title: "Month-end event remains visible", date: `${today.slice(0, 8)}${new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()}` });
  // Calendar/event reads and all writes are mocked; access checks remain real.
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/events") return route.fulfill({ json: { events: [event], selectedId: event.id, openIds: [event.id] } });
    if (path === "/api/calendar-sources") return route.fulfill({ json: { sources: [source], events: feeds } });
    if (path === "/api/settings" && route.request().method() === "GET") return route.fulfill({ status: 404, json: {} });
    if (route.request().method() === "GET") return route.continue();
    return route.fulfill({ json: {} });
  });
  await page.evaluate(() => localStorage.clear());
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(target.origin);
    await page.waitForFunction(() => document.querySelectorAll(".calendar-event").length === 26).catch(async error => {
      console.log(await page.locator("body").innerText());
      await page.screenshot({ path: "/private/tmp/eventotron-home-calendar-failure.png" });
      throw error;
    });
    assert.equal(await page.locator(".vertical-file").count(), 0, "server open files and today's event must not repopulate the rail");
    assert.equal(await page.locator(".day-cell.today .day-number").innerText(), String(Number(today.slice(-2))), "current day must use the venue date, not the server's UTC date");
    const layout = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll(".calendar-event")];
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        gridOverflow: document.querySelector(".month-grid").scrollWidth > document.querySelector(".month-grid").clientWidth + 1,
        clipped: buttons.some(button => {
          const rect = button.getBoundingClientRect(), parent = button.closest(".day-cell").getBoundingClientRect();
          return rect.bottom > parent.bottom + 1 || rect.right > parent.right + 1 || button.scrollHeight > button.clientHeight + 1;
        }),
        overlaps: buttons.some((button, i) => buttons.slice(i + 1).some(other => {
          const a = button.getBoundingClientRect(), b = other.getBoundingClientRect();
          return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        })),
      };
    });
    assert.deepEqual(layout, { overflow: false, gridOverflow: false, clipped: false, overlaps: false }, `layout at ${width}px`);
    await page.screenshot({ path: `/private/tmp/eventotron-home-calendar-${width}.png` });
    await page.locator(".eventotron-ribbon-row").screenshot({ path: `/private/tmp/eventotron-header-${width}.png` });
    assert.ok(await page.locator(".suite-chrome > .suite-clock").isVisible(), "clock stays visible with More closed");
    assert.ok(!(await page.getByRole("link", { name: "MASTER REPORT", exact: true }).isVisible()), "secondary tools are tucked away");
    await page.locator(".suite-more summary").click();
    assert.ok(await page.getByRole("link", { name: "MASTER REPORT", exact: true }).isVisible());
    assert.ok(await page.getByRole("button", { name: "Report a problem", exact: true }).isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "open More menu stays within window");
    await page.locator(".suite-more summary").click();
    const track = page.locator(".live-ticker-track");
    await track.waitFor();
    await page.mouse.move(0, 0);
    const before = await track.evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(200);
    assert.notEqual(await track.evaluate(el => getComputedStyle(el).transform), before, "Next Up scrolls horizontally");
    await page.locator(".live-ticker-open").hover();
    assert.equal(await track.evaluate(el => getComputedStyle(el).animationPlayState), "paused");
    await page.mouse.move(0, 0);
    await page.locator(".month-grid").getByRole("button", { name: "Open Today's explicit event", exact: true }).click();
    assert.equal(await page.locator(".vertical-file").count(), 1);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll(".calendar-event").length === 26);
    assert.equal(await page.locator(".vertical-file").count(), 1, "intentionally opened files are retained");
    await page.getByRole("button", { name: "Close Today's explicit event", exact: true }).click();
    await page.goto(`${target.origin}/support`);
    await page.goto(target.origin);
    await page.waitForFunction(() => document.querySelectorAll(".calendar-event").length === 26);
    assert.equal(await page.locator(".vertical-file").count(), 0, "closed files stay closed after returning home");
    await page.locator(".month-grid").getByRole("button", { name: "Open Month-end event remains visible as an editable event file", exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "TODAY", exact: true }).click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator(".day-cell.today").evaluate(el => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(target.origin);
  await page.waitForFunction(() => document.querySelectorAll(".month-grid .calendar-event").length === 26);
  for (const view of ["week", "day", "agenda", "month"]) {
    await page.getByRole("group", { name: "Calendar view", exact: true }).getByRole("button", { name: view, exact: true }).click();
    await page.waitForFunction(view => document.querySelector(".calendar-panel")?.dataset.view === view, view);
    const shownDates = await page.locator(".month-grid .day-number").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label").replace("Create event on ", "")));
    assert.equal(await page.locator(".month-grid .calendar-event").count(), [event, ...feeds].filter(item => shownDates.includes(item.date)).length);
    assert.equal(await page.locator(".vertical-file").count(), 0, "changing views does not open files");
  }
  await page.getByRole("group", { name: "Calendar view", exact: true }).getByRole("button", { name: "week", exact: true }).click();
  await page.getByLabel("Calendar date", { exact: true }).fill("2026-01-01");
  assert.equal(await page.locator(".month-grid .day-cell:not(.blank)").count(), 7);
  assert.ok((await page.locator(".month-grid").innerText()).includes("Dec 28"), "week view includes the prior year");
  await page.getByRole("button", { name: "TODAY", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "SETTINGS", exact: true }).count(), 0, "the legacy quick-settings button must not duplicate navigation");
  assert.equal(await page.getByRole("link", { name: "Settings", exact: true }).count(), 1);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const settings = page.locator(".calendar-display-settings");
  await settings.getByRole("button", { name: "Light colors", exact: true }).click();
  await settings.getByRole("slider", { name: "Text size", exact: true }).fill("20");
  await settings.getByLabel("Event spacing", { exact: true }).selectOption("spacious");
  const fixture = await page.screenshot();
  await settings.getByLabel("Wallpaper", { exact: true }).setInputFiles({ name: "qa-wallpaper.png", mimeType: "image/png", buffer: fixture });
  await settings.getByRole("button", { name: "Remove wallpaper", exact: true }).waitFor();
  await settings.getByRole("slider", { name: "Wallpaper shading", exact: true }).fill("25");
  await page.getByRole("navigation", { name: "EventoTron tools", exact: true }).getByRole("link", { name: "Calendar", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".calendar-event.external") && getComputedStyle(document.querySelector(".calendar-event.external")).borderLeftColor === "rgb(154, 52, 18)");
  assert.equal(await page.locator(".calendar-panel").evaluate(el => getComputedStyle(el).getPropertyValue("--cal-size").trim()), "20px");
  assert.ok(await page.locator(".calendar-panel").evaluate(el => getComputedStyle(el).backgroundImage.includes("data:image/jpeg")));
  await page.getByRole("group", { name: "Calendar view", exact: true }).getByRole("button", { name: "agenda", exact: true }).click();
  await page.reload();
  await page.waitForFunction(() => document.querySelector(".calendar-panel")?.dataset.view === "agenda");
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.calendar-panel[data-view="agenda"]') && document.querySelectorAll(".month-grid .calendar-event").length === 26);
    await page.waitForTimeout(100);
    assert.ok(await page.locator(".calendar-display-toolbar").evaluate(el => el.getBoundingClientRect().top >= -1 && el.getBoundingClientRect().bottom < innerHeight), "view navigation remains visible while scrolling");
    assert.equal(await page.locator(".month-grid .calendar-event").count(), 26);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `appearance must not overflow at ${width}px`);
    assert.ok(await page.locator(".month-grid .calendar-event").evaluateAll(buttons => buttons.every(button => button.scrollHeight <= button.clientHeight + 1)), "large text must not clip");
    await page.screenshot({ path: `/private/tmp/eventotron-calendar-display-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${target.origin}/settings`);
  await page.locator(".calendar-display-settings").waitFor();
  await page.waitForFunction(() => document.querySelector('.calendar-display-settings input[type="range"]')?.value === "20");
  assert.equal(await page.locator(".calendar-display-settings").getByRole("slider", { name: "Text size", exact: true }).inputValue(), "20");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "display settings fit the screen");
    await page.screenshot({ path: `/private/tmp/eventotron-calendar-settings-${width}.png` });
  }
  const fresh = await browser.newPage();
  await fresh.goto(target.origin);
  assert.equal(await fresh.evaluate(() => localStorage.getItem("eventotron-calendar-display-v1")), null, "a different browser profile does not inherit personal display choices");
  await fresh.close();
  await page.locator(".calendar-display-settings").getByRole("button", { name: "Remove wallpaper", exact: true }).click();
  await page.locator(".calendar-display-settings").getByLabel("Wallpaper", { exact: true }).setInputFiles({ name: "unsafe.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  assert.match(await page.locator(".calendar-display-settings [role=alert]").innerText(), /Choose a JPG/);
  await page.locator(".calendar-display-settings").getByRole("button", { name: "Reset display", exact: true }).click();
  await page.goto(target.origin);
  await page.waitForFunction(() => document.querySelector(".calendar-panel")?.dataset.view === "month");
  assert.equal(await page.locator(".calendar-panel").evaluate(el => getComputedStyle(el).backgroundImage), "none");
  assert.deepEqual(errors, []);
  console.log("PASS: explicit open-file behavior, unclipped responsive calendar, four views, cross-year week, personal colors/text/spacing, wallpaper persistence/removal/validation and display reset.");
} finally {
  await browser.close();
}
