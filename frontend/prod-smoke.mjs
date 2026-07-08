// Production smoke E2E against the LIVE deployed stack (Vercel + Render).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const BASE = "https://queueflow-ai.vercel.app";
const SHOTS = process.env.SHOTS_DIR || "./prod-shots";
mkdirSync(SHOTS, { recursive: true });
const results = [];
const consoleMsgs = {};
const rec = (n, pass, d) => { results.push({ n, pass, d }); console.log(`${pass ? "PASS" : "FAIL"} — ${n}: ${d}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let route = "init";
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") (consoleMsgs[route] ||= []).push(`[${m.type()}] ${m.text().slice(0,180)}`); });
page.on("pageerror", (e) => (consoleMsgs[route] ||= []).push(`PAGEERR ${String(e).slice(0,180)}`));
const go = async (r, waitMs = 3000) => { route = r; await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(waitMs); };

let token = "";
try {
  // 1. landing
  await go("/", 3500); await page.screenshot({ path: `${SHOTS}/01-landing.png` });
  rec("landing loads", /never wait/i.test(await page.locator("body").innerText()), "hero copy present");

  // 2. booking flow — REAL API call to Render (proves CORS)
  await go("/book", 4000);
  await page.locator("#citizen_name").fill("Prod Smoke");
  await page.locator("#nic_or_phone").fill("0771234567");
  await page.locator("button[type=submit]").click();
  await page.waitForSelector('[data-testid="booking-result"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000); await page.screenshot({ path: `${SHOTS}/02-book.png` });
  const share = await page.locator('[data-testid="token-share-link"]').inputValue().catch(() => "");
  token = (share.match(/[A-Z]-\d{3}/) || [""])[0];
  rec("booking works on prod (CORS)", Boolean(token), `token=${token || "NONE — booking/API failed"}`);

  // 3. status
  if (token) { await go(`/token/${token}`, 4000); await page.screenshot({ path: `${SHOTS}/03-token.png` });
    rec("status page loads", (await page.locator(`.qf-flap[aria-label*="${token}"]`).count()) > 0, `shows ${token}`); }

  // 4. ADMIN — capture staff-key behaviour
  await go("/admin", 5000); await page.screenshot({ path: `${SHOTS}/04-admin.png` });
  const adminText = await page.locator("body").innerText();
  const gated = /staff sign-in required|enter.*staff key/i.test(adminText);
  const demoBanner = (adminText.match(/demo mode[^\n]*/i) || [""])[0];
  const hasKpis = /waiting/i.test(adminText) && /active counters/i.test(adminText);
  rec("admin usable (not gated)", !gated && hasKpis, `gated=${gated} kpis=${hasKpis}`);
  rec("staff-key banner text", true, `banner="${demoBanner.slice(0,90)}"`);

  // 5. display
  await go("/display", 4000); await page.screenshot({ path: `${SHOTS}/05-display.png` });
  rec("display loads", /(open and serving|temporarily paused|closed)/i.test(await page.locator("body").innerText()), "office status shown");
} catch (e) { rec("script-crash", false, String(e).slice(0, 300)); }

const errRoutes = Object.entries(consoleMsgs).filter(([, v]) => v.length);
rec("console clean", errRoutes.length === 0, errRoutes.length ? JSON.stringify(consoleMsgs).slice(0, 600) : "no console errors/warnings");
console.log(`\n${results.filter(r => r.pass).length}/${results.length} prod checks passed`);
await browser.close();
