import assert from "node:assert/strict";
const { chromium } = await import(process.env.EVENTOTRON_PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.env.EVENTOTRON_QA_URL || "http://invalid");
if (process.env.EVENTOTRON_ISOLATED_QA !== "1" || target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname) || ["", "3000", "3001", "3101"].includes(target.port) || target.pathname !== "/" || target.search || target.hash || target.username || target.password) throw new Error("Use an isolated local QA server, never the daily-use database.");
const browser = await chromium.launch({ headless: true, ...(process.env.EVENTOTRON_CHROME_PATH ? { executablePath: process.env.EVENTOTRON_CHROME_PATH } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => route.request().method() === "GET" ? route.continue() : route.fulfill({ json: {} }));
  await page.goto(target.origin);
  const wallpaper = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 80; canvas.height = 80;
    const context = canvas.getContext("2d"); context.fillStyle = "#7799bb"; context.fillRect(0, 0, 80, 80); context.fillStyle = "#eeeeee"; context.fillRect(0, 0, 40, 80);
    return canvas.toDataURL("image/png");
  });
  const routes = [
    ["/", ".eventotron-desktop", ".event-stack"],
    ["/foodotron", ".suite-frame", ".foodotron-applet .panel"],
    ["/tabletron", ".suite-frame", ".tabletron-applet .rooms"],
    ["/scheduluotron", ".suite-frame", ".sched-panel"],
    ["/settings", ".suite-frame", ".settings-card"],
    ["/support", ".suite-frame", ".support-heading"],
  ];
  for (const background of ["#eef3fa", "#17191d"]) {
    await page.evaluate(({ background, wallpaper }) => {
      localStorage.setItem("eventotron-calendar-display-v1", JSON.stringify({ view: "month", background, accent: "#3157b7", textSize: 20, density: "compact", wallpaper, wallpaperShade: 45 }));
      window.dispatchEvent(new Event("eventotron-calendar-display-change"));
    }, { background, wallpaper });
    for (const [path, root, panel] of routes) {
      await page.goto(target.origin + path);
      await page.waitForFunction(background => document.querySelector(".suite-appearance")?.style.getPropertyValue("--ui-background") === background, background);
      await page.locator(panel).first().waitFor();
      assert.equal(await page.locator(root).evaluate(el => getComputedStyle(el).getPropertyValue("--ui-accent").trim()), "#3157b7", `${path} accent`);
      assert.ok(await page.locator(root).evaluate(el => getComputedStyle(el).backgroundImage.includes("data:image/png")), `${path} wallpaper`);
      const expectedColor = background === "#eef3fa" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)";
      assert.equal(await page.locator(root).evaluate(el => getComputedStyle(el).color), expectedColor, `${path} text contrast`);
      const panelColor = await page.locator(panel).first().evaluate(el => getComputedStyle(el).backgroundColor);
      assert.ok(!["rgb(4, 9, 6)", "rgb(3, 8, 5)", "rgb(7, 16, 9)"].includes(panelColor), `${path} panel must use the shared palette`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} desktop overflow`);
      if (background === "#eef3fa") {
        const yellowText = await page.evaluate(() => [...document.querySelectorAll(".suite-appearance *")].filter(el => {
          if (!el.getClientRects().length || !el.textContent?.trim() || el.closest(".calendar-theme-options")) return false;
          const channels = getComputedStyle(el).color.match(/[\d.]+/g)?.map(Number) || [];
          const [r, g, b] = channels;
          return r > 150 && g > 120 && r >= g * 0.8 && b < Math.min(r, g) * 0.8;
        }).map(el => `${el.tagName}.${el.className}: ${getComputedStyle(el).color}`).slice(0, 15));
        assert.deepEqual(yellowText, [], `${path} must not use unreadable yellow text in light mode`);
      }
      await page.waitForTimeout(100);
      await page.screenshot({ path: `/private/tmp/eventotron-suite-${path === "/" ? "home" : path.slice(1)}-${background === "#eef3fa" ? "light" : "dark"}.png` });
    }
  }
  await page.goto(target.origin + "/settings");
  await page.waitForFunction(() => document.querySelector('.calendar-display-settings input[type="range"]')?.value === "20");
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path] of routes) {
      await page.goto(target.origin + path);
      await page.waitForFunction(() => document.querySelector(".suite-appearance")?.style.getPropertyValue("--ui-scale") === String(20 / 12));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} overflow at ${width}px`);
      await page.waitForTimeout(100);
      await page.screenshot({ path: `/private/tmp/eventotron-suite-${path === "/" ? "home" : path.slice(1)}-${width}.png` });
    }
  }
  await page.emulateMedia({ media: "print" });
  assert.equal(await page.locator(".suite-appearance").evaluate(el => getComputedStyle(el).getPropertyValue("--ui-scale").trim()), "1");
  assert.equal(await page.locator(".suite-appearance").evaluate(el => getComputedStyle(el).getPropertyValue("--ui-wallpaper").trim()), "none");
  assert.deepEqual(errors, []);
  console.log("PASS: suite-wide light/dark palette, wallpaper, large text, desktop/tablet/mobile layouts and print appearance reset.");
} finally { await browser.close(); }
