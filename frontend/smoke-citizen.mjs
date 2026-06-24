import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8011";
const frontendUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5173";
const backendPort = new URL(backendUrl).port || "80";
const frontendPort = new URL(frontendUrl).port || "5173";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function startProcess(command, args, cwd, env = process.env) {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

function stopProcess(child) {
  if (!child) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

async function waitFor(url, label) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server still starting.
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function waitForChangedText(locator, previousText) {
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    const currentText = await locator.innerText().catch(() => "");
    if (currentText && currentText !== previousText) return currentText;
    await delay(750);
  }
  throw new Error(`Expected text to change from "${previousText}"`);
}

async function main() {
  const backend = startProcess(
    "A:\\EXITO\\backend\\.venv\\Scripts\\python.exe",
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", backendPort],
    "A:\\EXITO\\backend"
  );
  const frontendEnv = { ...process.env, VITE_API_BASE_URL: backendUrl };
  const frontend = startProcess(
    "cmd.exe",
    ["/c", "npm.cmd", "run", "dev", "--", "--host", "127.0.0.1", "--port", frontendPort, "--strictPort"],
    "A:\\EXITO\\frontend",
    frontendEnv
  );

  try {
    await waitFor(`${backendUrl}/health`, "backend");
    const resetResponse = await fetch(`${backendUrl}/admin/demo/reset`, { method: "POST" });
    if (!resetResponse.ok) throw new Error("Could not reset demo data");
    await waitFor(frontendUrl, "frontend");

    const browser = await chromium.launch(
      existsSync(chromePath) ? { executablePath: chromePath, channel: undefined } : undefined
    );
    const page = await browser.newPage({ viewport: { width: 390, height: 920 } });
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const attachDiagnostics = (targetPage) => {
      targetPage.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      targetPage.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
      targetPage.on("pageerror", (error) => pageErrors.push(error.message));
    };

    await page.goto(`${frontendUrl}/book`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Book your queue token before you arrive" }).waitFor();
    await page.getByLabel("Full name").fill("Citizen Smoke Test");
    await page.getByLabel("NIC or phone number").fill("0775551234");
    await page.waitForFunction(() => document.querySelector("#service_id")?.options.length > 0);
    await page.getByLabel("Service type").selectOption({ index: 0 });
    await page.getByRole("button", { name: "Book Token" }).click();

    await page.getByTestId("booking-result").waitFor({ timeout: 15000 });
    await page.getByTestId("token-share-link").waitFor();
    await page.getByTestId("token-qr").waitFor();
    const receiptUrl = await page.getByTestId("token-share-link").inputValue();
    if (!receiptUrl.includes("/token/")) throw new Error(`Expected receipt token URL, got ${receiptUrl}`);
    await page.getByRole("button", { name: "Open Status" }).click();
    await page.waitForURL(/\/token\//, { timeout: 15000 });
    await page.getByTestId("token-estimated-service").waitFor({ timeout: 15000 });
    await page.getByTestId("token-recommended-arrival").waitFor();
    await page.getByTestId("token-people-ahead").waitFor();
    const tokenUrl = page.url();
    if (!tokenUrl.includes("/token/")) throw new Error(`Expected token status URL, got ${tokenUrl}`);

    const estimatedLocator = page.getByTestId("token-estimated-service").locator("strong");
    const arrivalLocator = page.getByTestId("token-recommended-arrival").locator("strong");
    const beforeEstimate = await estimatedLocator.innerText();
    const beforeArrival = await arrivalLocator.innerText();

    const display = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    attachDiagnostics(display);
    await display.goto(`${frontendUrl}/display`, { waitUntil: "networkidle" });
    await display.getByRole("heading", { name: "Service Office Queue" }).waitFor({ timeout: 30000 });
    await display.getByText("Please proceed only when your token is called.").waitFor();
    await display.getByTestId("display-fullscreen").waitFor();
    await display.getByTestId("display-fullscreen").click();
    await display.locator(".display-mode-note").waitFor({ timeout: 10000 });
    await display.getByRole("heading", { name: "Now Serving" }).waitFor();
    await display.getByRole("heading", { name: "Next Tokens" }).waitFor();
    await display.getByText("Counter 3").waitFor();
    const displayAverageWait = display.getByTestId("display-average-wait").locator("strong");
    const beforeDisplayAverageWait = await displayAverageWait.innerText();

    const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    attachDiagnostics(admin);
    await admin.goto(`${frontendUrl}/admin`, { waitUntil: "networkidle" });
    await admin.getByRole("heading", { name: "QueueFlow AI Control Center" }).waitFor({ timeout: 30000 });
    const counter3 = admin.locator(".counter-card", { hasText: "Counter 3" });
    await counter3.getByText("Ready for next citizen").waitFor();
    await counter3.getByRole("button", { name: "Call Next" }).click();
    await counter3.getByText("Called to Counter", { exact: true }).waitFor();
    const calledTokenNumber = await counter3.locator(".counter-state-block.called strong").innerText();
    await display.bringToFront();
    const displayCounter3 = display.locator(".display-counter-card", { hasText: "Counter 3" });
    await displayCounter3.getByText(calledTokenNumber).waitFor({ timeout: 12000 });
    await displayCounter3.getByText("Called to Counter").waitFor({ timeout: 12000 });
    await admin.bringToFront();
    await counter3.getByRole("button", { name: "Start Serving" }).click();
    await counter3.getByText("Being Served").waitFor();
    await display.bringToFront();
    await displayCounter3.getByText(calledTokenNumber).waitFor({ timeout: 12000 });
    await displayCounter3.getByText("Being Served").waitFor({ timeout: 12000 });
    await admin.bringToFront();
    await counter3.getByRole("button", { name: "Simulate +10 Delay" }).click();
    await admin.locator(".message-bar.success", { hasText: "Prediction updated. Citizen arrival time adjusted." }).waitFor({ timeout: 10000 });
    await admin.close();

    await page.bringToFront();
    await waitForChangedText(estimatedLocator, beforeEstimate);
    await waitForChangedText(arrivalLocator, beforeArrival);
    await page.getByText("QueueFlow AI continuously recalculates").waitFor();

    await display.bringToFront();
    await waitForChangedText(displayAverageWait, beforeDisplayAverageWait);
    await display.close();

    await page.screenshot({ path: "A:\\EXITO\\frontend\\citizen-portal-smoke.png", fullPage: true });
    await browser.close();

    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors: ${[...consoleErrors, ...pageErrors].join(" | ")}`);
    }
    if (failedRequests.length) {
      throw new Error(`Failed requests: ${failedRequests.join(" | ")}`);
    }

    console.log("Citizen portal browser smoke passed.");
  } finally {
    stopProcess(frontend);
    stopProcess(backend);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
