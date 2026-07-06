// Visual + flow E2E against ALREADY-RUNNING servers (backend :8000, vite :5173).
// Usage: SHOTS_DIR=/path node e2e-visual.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.FRONTEND_URL || "http://localhost:5173";
const SHOTS = process.env.SHOTS_DIR || "./e2e-shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = {};

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}: ${detail}`);
}

async function shoot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : {}
);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

let currentRoute = "init";
page.on("console", (msg) => {
  if (msg.type() === "error") {
    (consoleErrors[currentRoute] ||= []).push(msg.text().slice(0, 300));
  }
});
page.on("pageerror", (err) => {
  (consoleErrors[currentRoute] ||= []).push(`PAGEERROR: ${String(err).slice(0, 300)}`);
});

async function go(route, waitMs = 1500) {
  currentRoute = route;
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(waitMs);
}

let tokenNumber = "";

try {
  // 1. /book render + booking flow
  await go("/book", 2500);
  await shoot(page, "01-book");
  const nameInput = page.locator("#citizen_name");
  record("book renders form", await nameInput.isVisible(), "name field visible");
  await nameInput.fill("Visual E2E");
  await page.locator("#nic_or_phone").fill("0771234567");
  await page.locator("button[type=submit]").click();
  await page.waitForSelector('[data-testid="booking-result"]', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await shoot(page, "02-book-receipt");
  // Token number renders as split-flap cells (per-char), so innerText has
  // newlines between chars — read the component's accessible label instead.
  const flapLabel =
    (await page
      .locator('[data-testid="booking-result"] .qf-flap')
      .first()
      .getAttribute("aria-label")
      .catch(() => "")) || "";
  tokenNumber = (flapLabel.match(/[A-Z]-\d{3}/) || [""])[0];
  if (!tokenNumber) {
    const shareValue = await page.locator('[data-testid="token-share-link"]').inputValue().catch(() => "");
    tokenNumber = (shareValue.match(/[A-Z]-\d{3}/) || [""])[0];
  }
  const qrVisible = await page.locator('[data-testid="token-qr"] img').isVisible().catch(() => false);
  record("booking receipt", Boolean(tokenNumber), `token=${tokenNumber} qrImg=${qrVisible}`);

  // 2. /token/:n signature page
  await go(`/token/${tokenNumber}`, 3000);
  await shoot(page, "03-token-status");
  const bodyText = await page.locator("body").innerText();
  const flapShowsToken = (await page.locator(`.qf-flap[aria-label*="${tokenNumber}"]`).count()) > 0;
  record(
    "status page core",
    /waiting/i.test(bodyText) && flapShowsToken,
    `split-flap shows ${tokenNumber} + Waiting chip; cancel=${/cancel my token/i.test(bodyText)} notify=${/notify/i.test(bodyText)}`
  );

  // 3. /track lookup + recent chips
  await go("/track", 1500);
  await shoot(page, "04-track");
  const trackText = await page.locator("body").innerText();
  record("track recent chips", trackText.includes(tokenNumber), `recent shows ${tokenNumber}`);

  // 4. /admin
  await go("/admin", 3500);
  await shoot(page, "05-admin");
  const adminText = await page.locator("body").innerText();
  const hasKpis = /waiting/i.test(adminText) && /active counters/i.test(adminText);
  const hasSla = /on-time|sla/i.test(adminText);
  const hasFeed = /activity/i.test(adminText);
  const drawerCollapsed = !/simulate \+10/i.test(adminText); // demo buttons hidden until drawer opened
  record("admin dashboard", hasKpis, `kpis=${hasKpis} sla=${hasSla} activityFeed=${hasFeed} demoHiddenByDefault=${drawerCollapsed}`);

  // call next on a counter
  const callBtn = page.getByRole("button", { name: /call next/i }).first();
  if (await callBtn.isVisible().catch(() => false)) {
    await callBtn.click();
    await page.waitForTimeout(2500);
    await shoot(page, "06-admin-after-callnext");
    const after = await page.locator("body").innerText();
    record("call next works", /called/i.test(after), "a token shows Called after click");
  } else {
    record("call next works", false, "no enabled Call next button found");
  }

  // open demo drawer
  const drawerToggle = page.getByText(/demo & simulation/i).first();
  if (await drawerToggle.isVisible().catch(() => false)) {
    await drawerToggle.click();
    await page.waitForTimeout(800);
    await shoot(page, "07-admin-demo-drawer");
    const withDrawer = await page.locator("body").innerText();
    record("demo drawer", /simulate/i.test(withDrawer), "simulate controls only inside drawer");
  } else {
    record("demo drawer", false, "drawer toggle not found");
  }

  // 5. /analytics
  await go("/analytics", 3000);
  await shoot(page, "08-analytics");
  const anaText = await page.locator("body").innerText();
  const svgCount = await page.locator("svg").count();
  record("analytics", svgCount > 2 && /completed/i.test(anaText), `svgs=${svgCount}`);

  // 6. /display
  await go("/display", 3500);
  await shoot(page, "09-display");
  const dispText = await page.locator("body").innerText();
  const officeStatusOk = /(open and serving|temporarily paused|closed)/i.test(dispText);
  const navHidden = !(await page.locator("nav").isVisible().catch(() => false));
  record("display board", officeStatusOk && navHidden, `derivedStatus=${officeStatusOk} navHidden=${navHidden}`);
  await page.waitForTimeout(6000);
  await shoot(page, "10-display-idle");

  // 7. mobile spot-checks
  await page.setViewportSize({ width: 390, height: 844 });
  await go("/book", 2000);
  await shoot(page, "11-book-mobile");
  const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  record("mobile /book no h-scroll", !hScroll, `scrollWidth overflow=${hScroll}`);
  await go(`/token/${tokenNumber}`, 2500);
  await shoot(page, "12-token-mobile");
  const hScroll2 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  record("mobile /token no h-scroll", !hScroll2, `scrollWidth overflow=${hScroll2}`);
} catch (err) {
  record("script-crash", false, String(err).slice(0, 500));
} finally {
  await browser.close();
}

const errRoutes = Object.entries(consoleErrors).filter(([, v]) => v.length);
record("console errors", errRoutes.length === 0, errRoutes.length ? JSON.stringify(consoleErrors).slice(0, 800) : "no console errors on any route");

writeFileSync(`${SHOTS}/results.json`, JSON.stringify({ results, consoleErrors }, null, 2));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} checks passed. Shots in ${SHOTS}`);
process.exit(results.every((r) => r.pass) ? 0 : 1);
