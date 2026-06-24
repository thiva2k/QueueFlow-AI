import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";

const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8010";
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

async function resetDemoData() {
  const reset = await fetch(`${backendUrl}/admin/demo/reset`, { method: "POST" }).catch(() => null);
  if (reset?.ok) return;
  const seed = await fetch(`${backendUrl}/admin/demo/seed`, { method: "POST" });
  if (!seed.ok) throw new Error("Could not reset or seed demo data");
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
    await resetDemoData();
    await waitFor(frontendUrl, "frontend");

    const browser = await chromium.launch(
      existsSync(chromePath) ? { executablePath: chromePath, channel: undefined } : undefined
    );
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${frontendUrl}/admin`, { waitUntil: "networkidle" });
    try {
    await page.getByRole("heading", { name: "QueueFlow AI Control Center" }).waitFor({ timeout: 30000 });
    } catch (error) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      await page.screenshot({ path: "A:\\EXITO\\frontend\\admin-dashboard-failure.png", fullPage: true }).catch(() => {});
      throw new Error(
        `Dashboard heading did not render. Body text: ${bodyText || "(empty)"} Console: ${
          consoleErrors.join(" | ") || "(none)"
        } Page errors: ${pageErrors.join(" | ") || "(none)"}`
      );
    }
    await page.getByTestId("demo-steps").waitFor();
    await page.getByTestId("demo-health-checklist").waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Reset Demo Data" }).first().click();
    await page.getByText("Reset demo data completed.").waitFor({ timeout: 10000 });
    await page.getByRole("heading", { name: "Waiting Citizens" }).waitFor();
    await page.getByRole("heading", { name: "Next Waiting Citizen" }).waitFor();
    const counter3 = page.locator(".counter-card", { hasText: "Counter 3" });
    await counter3.getByText("Ready for next citizen").waitFor();
    await counter3.getByRole("button", { name: "Call Next" }).click();
    await counter3.getByText("Called to Counter", { exact: true }).waitFor();
    await counter3.getByRole("button", { name: "Mark No-show" }).waitFor();
    await counter3.getByRole("button", { name: "Start Serving" }).click();
    await counter3.getByText("Being Served").waitFor();
    await counter3.getByRole("button", { name: "Simulate +10 Delay" }).click();
    await page.locator(".message-bar.success", { hasText: "Prediction updated. Citizen arrival time adjusted." }).waitFor({ timeout: 10000 });
    await page.locator(".prediction-update-note", { hasText: /Arrival moved \+\d+ min/ }).waitFor({ timeout: 10000 });
    await counter3.getByRole("button", { name: "Complete" }).click();
    await counter3.getByText("Ready for next citizen").waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Add Random Token" }).click();

    const waitingSection = page.locator("section.panel", {
      has: page.getByRole("heading", { name: "Waiting Citizens" }),
    });
    const waitingTableButtons = await waitingSection.getByRole("button").count();
    const hasCounterWorkflow = await page.getByRole("heading", { name: "Counter Workflow" }).isVisible();
    const hasPredictions = await page.getByText("Recommended arrival time").first().isVisible();
    await page.screenshot({ path: "A:\\EXITO\\frontend\\admin-dashboard-smoke.png", fullPage: true });
    await browser.close();

    if (!hasCounterWorkflow || !hasPredictions || waitingTableButtons !== 0) {
      throw new Error(
        `Dashboard rendered without required queue sections. Counter workflow: ${hasCounterWorkflow}, predictions: ${hasPredictions}, waiting table buttons: ${waitingTableButtons}`
      );
    }
    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors: ${[...consoleErrors, ...pageErrors].join(" | ")}`);
    }
    if (failedRequests.length) {
      throw new Error(`Failed requests: ${failedRequests.join(" | ")}`);
    }

    console.log("Admin dashboard browser smoke passed.");
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
