import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createInitialState } from "../src/game.js";

const SCRIPT_URL = new URL("../scripts/mobile-visual-qa.mjs", import.meta.url);

test("mobile visual QA script covers the required mobile duck flow contract", async () => {
  const script = await readFile(SCRIPT_URL, "utf8");

  assert.match(script, /QA_BASE_URL/);
  assert.match(script, /http:\/\/127\.0\.0\.1:4173\//);
  assert.match(script, /python3/);
  assert.match(script, /http\.server/);
  assert.match(script, /4174/);

  for (const viewport of ["360, height: 800", "390, height: 844", "430, height: 932"]) {
    assert.match(script, new RegExp(viewport));
  }

  for (const station of ["duckFridge", "grillA", "duckLabel", "serveWindow"]) {
    assert.match(script, new RegExp(station));
  }

  assert.match(script, /QA_SCREENSHOT_MODE/);
  assert.ok(script.includes('const mode = process.env.QA_SCREENSHOT_MODE?.trim() || "abstract";'));
  assert.match(script, /Visual QA checkpoints/);
  assert.ok(script.includes("return `/tmp/goose-duck-kitchen-${mode}-public-${width}x${height}.png`;"));
  assert.ok(script.includes("return `/tmp/goose-duck-kitchen-${mode}-${width}x${height}.png`;"));
  assert.match(script, /score <= 0/);
  assert.match(script, /console/);
  assert.match(script, /requestfailed/);
  assert.match(script, /response/);
  assert.match(script, /status\(\) >= 400/);
});

test("mobile visual QA duck-flow taps match current station centers", async () => {
  const script = await readFile(SCRIPT_URL, "utf8");
  const { stations } = createInitialState();

  for (const stationId of ["duckFridge", "grillA", "duckLabel", "serveWindow"]) {
    const station = stations[stationId];
    const x = station.x + station.w / 2;
    const y = station.y + station.h / 2;

    assert.ok(
      script.includes(`${stationId}: { x: ${x}, y: ${y} },`),
      `${stationId} QA tap should match current station center`,
    );
  }
});
