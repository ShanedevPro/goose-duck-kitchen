import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const FALLBACK_PORT = 4174;
const DEFAULT_BASE_URL = "http://127.0.0.1:4173/";
const KITCHEN = { width: 540, height: 960 };
const STATION_CENTERS = {
  duckFridge: { x: 108, y: 430 },
  grillA: { x: 155, y: 658 },
  duckLabel: { x: 432, y: 430 },
  serveWindow: { x: 270, y: 178 },
};
const VIEWPORTS = [
  { width: 360, height: 640 },
  { width: 375, height: 667 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const MIN_BOTTOM_SAFE_GAP = 24;

const providedBaseUrl = process.env.QA_BASE_URL?.trim();
const publicMode = Boolean(providedBaseUrl);
let serverProcess = null;
let browser = null;
let stoppingServer = false;

try {
  const baseUrl = providedBaseUrl || (await ensureLocalServer());
  await waitForHttpOk(baseUrl);
  browser = await chromium.launch();

  for (const viewport of VIEWPORTS) {
    await runViewportQa(browser, baseUrl, viewport, publicMode);
  }

  console.log("Duck flow passed");
  console.log("Visual QA checkpoints: HUD visible, board visible, dock visible, bottom safe gap, no horizontal scrollbar.");
} finally {
  await browser?.close();
  await stopServer();
}

async function ensureLocalServer() {
  const defaultUrl = DEFAULT_BASE_URL;
  const defaultProbe = await probeApp(defaultUrl);

  if (defaultProbe === "app") {
    return defaultUrl;
  }

  if (defaultProbe === "other") {
    const fallbackUrl = localUrl(FALLBACK_PORT);
    const fallbackProbe = await probeApp(fallbackUrl);

    if (fallbackProbe === "app") {
      return fallbackUrl;
    }

    if (fallbackProbe === "other") {
      throw new Error(`Ports ${DEFAULT_PORT} and ${FALLBACK_PORT} are occupied by another service.`);
    }

    startServer(FALLBACK_PORT);
    return fallbackUrl;
  }

  startServer(DEFAULT_PORT);
  return defaultUrl;
}

function localUrl(port) {
  return `http://${DEFAULT_HOST}:${port}/`;
}

async function probeApp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800) });
    if (!response.ok) {
      return "other";
    }

    const body = await response.text();
    return body.includes("gameCanvas") && body.includes("./src/app.js") ? "app" : "other";
  } catch {
    return "empty";
  }
}

function startServer(port) {
  serverProcess = spawn("python3", ["-m", "http.server", String(port)], {
    cwd: process.cwd(),
    stdio: "pipe",
  });

  serverProcess.once("exit", (code, signal) => {
    if (stoppingServer) {
      return;
    }

    if (code !== null && code !== 0) {
      console.error(`Local QA server exited with code ${code}.`);
    } else if (signal) {
      console.error(`Local QA server exited from signal ${signal}.`);
    }
  });
}

async function waitForHttpOk(url) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(150);
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError?.message ?? "unknown error"}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }

  stoppingServer = true;
  serverProcess.kill("SIGTERM");
  await Promise.race([once(serverProcess, "exit"), delay(2_000)]);

  if (!serverProcess.killed) {
    serverProcess.kill("SIGKILL");
  }
}

async function runViewportQa(parentBrowser, baseUrl, { width, height }, isPublicMode) {
  const context = await parentBrowser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const failures = [];
  const base = new URL(baseUrl);

  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`Console error: ${message.text()}`);
    }
  });

  page.on("requestfailed", (request) => {
    if (shouldIgnoreRequestFailure(request.url())) {
      return;
    }

    const requestUrl = new URL(request.url());
    if (requestUrl.origin === base.origin) {
      failures.push(`Request failed: ${request.url()} ${request.failure()?.errorText ?? ""}`.trim());
    }
  });

  page.on("response", (response) => {
    const rawUrl = response.url();
    if (shouldIgnoreRequestFailure(rawUrl)) {
      return;
    }

    const responseUrl = new URL(rawUrl);
    if (responseUrl.origin === base.origin && response.status() >= 400) {
      failures.push(`HTTP ${response.status()}: ${rawUrl}`);
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#startButton").click();
    await page.locator("#overlay.visible").waitFor({ state: "detached", timeout: 2_000 }).catch(async () => {
      await page.waitForSelector("#overlay:not(.visible)", { timeout: 2_000 });
    });

    await tapKitchen(page, STATION_CENTERS.duckFridge);
    await delay(2_100);
    await tapKitchen(page, STATION_CENTERS.grillA);
    await delay(1_400);
    await delay(4_300);
    await tapKitchen(page, STATION_CENTERS.grillA);
    await delay(1_400);
    await tapKitchen(page, STATION_CENTERS.duckLabel);
    await delay(1_700);
    await tapKitchen(page, STATION_CENTERS.serveWindow);
    await waitForPositiveScore(page);

    await assertMobileLayout(page, { width, height });

    const screenshotPath = getScreenshotPath(width, height, isPublicMode);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`Wrote ${screenshotPath}`);

    if (failures.length > 0) {
      throw new Error(failures.join("\n"));
    }
  } finally {
    await context.close();
  }
}

function getScreenshotPath(width, height, isPublicMode) {
  const mode = process.env.QA_SCREENSHOT_MODE?.trim() || "abstract";

  if (isPublicMode) {
    return `/tmp/goose-duck-kitchen-${mode}-public-${width}x${height}.png`;
  }

  return `/tmp/goose-duck-kitchen-${mode}-${width}x${height}.png`;
}

function shouldIgnoreRequestFailure(rawUrl) {
  if (rawUrl.startsWith("data:")) {
    return true;
  }

  try {
    const url = new URL(rawUrl);
    return url.pathname === "/favicon.ico";
  } catch {
    return false;
  }
}

async function tapKitchen(page, point) {
  const rect = await page.locator("#gameCanvas").boundingBox();
  if (!rect) {
    throw new Error("Canvas bounding box missing.");
  }

  await page.mouse.click(
    rect.x + (point.x / KITCHEN.width) * rect.width,
    rect.y + (point.y / KITCHEN.height) * rect.height,
  );
}

async function waitForPositiveScore(page) {
  await page.waitForFunction(() => {
    const score = Number(document.querySelector("#score")?.textContent);
    return Number.isFinite(score) && score > 0;
  }, null, { timeout: 4_000 });

  const score = Number(await page.locator("#score").textContent());
  if (!Number.isFinite(score) || score <= 0) {
    throw new Error(`Expected score after duck serve, got ${score}`);
  }
}

async function assertNoHorizontalScrollbar(page) {
  const hasHorizontalScrollbar = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  if (hasHorizontalScrollbar) {
    throw new Error("Expected no horizontal scrollbar.");
  }
}

async function assertMobileLayout(page, viewport) {
  const metrics = await page.evaluate(() => {
    const readRect = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();

      if (!rect) {
        return null;
      }

      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      hud: readRect(".top-hud"),
      canvas: readRect("#gameCanvas"),
      dock: readRect(".bottom-dock"),
    };
  });

  await assertNoHorizontalScrollbar(page);

  for (const [name, rect] of [
    ["HUD", metrics.hud],
    ["canvas", metrics.canvas],
    ["dock", metrics.dock],
  ]) {
    if (!rect) {
      throw new Error(`Expected ${name} to exist in ${viewport.width}x${viewport.height}.`);
    }

    if (rect.top < -0.5 || rect.left < -0.5 || rect.right > metrics.innerWidth + 0.5) {
      throw new Error(`Expected ${name} to fit horizontally in ${viewport.width}x${viewport.height}.`);
    }

    if (rect.bottom > metrics.innerHeight + 0.5) {
      throw new Error(`Expected ${name} to fit vertically in ${viewport.width}x${viewport.height}.`);
    }
  }

  const bottomGap = metrics.innerHeight - metrics.dock.bottom;

  if (bottomGap < MIN_BOTTOM_SAFE_GAP) {
    throw new Error(
      `Expected dock bottom gap >= ${MIN_BOTTOM_SAFE_GAP}px in ${viewport.width}x${viewport.height}, got ${bottomGap.toFixed(1)}px.`,
    );
  }

  if (metrics.canvas.bottom > metrics.dock.top + 0.5) {
    throw new Error(
      `Expected canvas to stay above dock in ${viewport.width}x${viewport.height}, got canvas bottom ${metrics.canvas.bottom.toFixed(1)} and dock top ${metrics.dock.top.toFixed(1)}.`,
    );
  }
}
