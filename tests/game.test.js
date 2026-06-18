import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ASSET_IDS } from "../src/assets.js";
import {
  ABSTRACT_STYLE_VERSION,
  ITEM_VISUALS,
  STATION_VISUALS,
  getItemVisual,
} from "../src/abstract-visuals.js";
import {
  COOK_STATES,
  ITEM_KINDS,
  KITCHEN,
  createInitialState,
  getActionHint,
  getNearbyStation,
  getStationAtPoint,
  interact,
  setMoveTarget,
  startGame,
  stepGame,
} from "../src/game.js";

const PREMIUM_ASSET_IDS = [
  "kitchen-bg-premium",
  "chef-idle",
  "chef-walk-a",
  "chef-walk-b",
  "chef-carry-goose",
  "chef-carry-duck",
  "chef-carry-cooked",
  "goose-raw-premium",
  "duck-raw-premium",
  "goose-cooked-premium",
  "duck-cooked-premium",
  "leg-burnt-premium",
  "station-glow",
  "success-pop",
  "wrong-pop",
  "tap-ring-premium",
  "steam-puff",
];

const LEGACY_MANIFEST_IDS = [
  "player-pku",
  "goose-raw",
  "duck-raw",
  "goose-cooked",
  "duck-cooked",
  "leg-burnt",
  "goose-fridge",
  "duck-fridge",
  "grill-empty",
  "grill-cooking",
  "goose-label",
  "duck-label",
  "serve-counter",
  "trash-bin",
  "notice-board",
  "order-bell",
];

function stationCenter(state, stationId) {
  const station = state.stations[stationId];
  return {
    x: station.x + station.w / 2,
    y: station.y + station.h / 2,
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function runUntilIdle(state, maxSteps = 140) {
  let next = state;
  for (let i = 0; i < maxSteps; i += 1) {
    next = stepGame(next, {}, 100, next.elapsedMs + 100);
    if (!next.player.target) {
      return next;
    }
  }
  assert.fail("player did not reach tap target");
}

function tapStation(state, stationId) {
  const point = stationCenter(state, stationId);
  return runUntilIdle(setMoveTarget(state, point.x, point.y));
}

function forceOrder(state, truth, needsSauce = false) {
  return {
    ...state,
    orders: [
      {
        id: 1,
        truth,
        needsSauce,
        supply: truth === ITEM_KINDS.goose ? "鹅腿 x1" : "鸭腿 x1",
        shout: "看清标签",
        createdAt: state.elapsedMs,
        deadlineAt: state.elapsedMs + 20_000,
      },
    ],
    nextOrderAt: state.elapsedMs + 20_000,
  };
}

function cookGoose(state) {
  let next = tapStation(state, "gooseFridge");
  next = tapStation(next, "grillA");
  next = stepGame(next, {}, 4_100, next.elapsedMs + 4_100);
  next = tapStation(next, "grillA");
  return next;
}

test("premium asset ids are registered before legacy manifest ids", async () => {
  const manifest = JSON.parse(await readFile(new URL("../assets/game/manifest.json", import.meta.url)));

  assert.deepEqual(
    PREMIUM_ASSET_IDS.map((id) => Object.values(ASSET_IDS).includes(id)),
    PREMIUM_ASSET_IDS.map(() => true),
  );
  assert.deepEqual(manifest, [...PREMIUM_ASSET_IDS, ...LEGACY_MANIFEST_IDS]);
});

test("startGame creates a portrait mobile kitchen round", () => {
  const state = startGame(0);

  assert.equal(KITCHEN.width, 540);
  assert.equal(KITCHEN.height, 960);
  assert.equal(state.status, "playing");
  assert.equal(state.timeLeftMs, 90_000);
  assert.equal(state.trust, 80);
  assert.equal(state.orders.length, 1);
  assert.equal(state.player.y, 840);
  assert.equal(state.player.target, null);
  assert.equal(state.player.holding, null);
});

test("station hit testing finds separate goose and duck label stations", () => {
  const state = createInitialState();
  const goosePoint = stationCenter(state, "gooseLabel");
  const duckPoint = stationCenter(state, "duckLabel");

  assert.equal(getStationAtPoint(state, goosePoint.x, goosePoint.y).id, "gooseLabel");
  assert.equal(getStationAtPoint(state, duckPoint.x, duckPoint.y).id, "duckLabel");
});

test("tapping a fridge walks there and auto-picks the matching raw leg", () => {
  const state = tapStation(startGame(0), "duckFridge");

  assert.equal(state.player.holding.kind, ITEM_KINDS.duck);
  assert.equal(state.player.holding.cookState, COOK_STATES.raw);
  assert.equal(state.player.holding.label, null);
  assert.equal(state.player.holding.sauced, false);
  assert.match(state.feedback.text, /鸭腿|取/);
});

test("tapping a grill deposits raw item, then later picks up cooked item", () => {
  let state = tapStation(startGame(0), "gooseFridge");
  state = tapStation(state, "grillA");

  assert.equal(state.player.holding, null);
  assert.equal(state.grills.grillA.item.kind, ITEM_KINDS.goose);
  assert.equal(state.grills.grillA.item.cookState, COOK_STATES.cooking);

  state = stepGame(state, {}, 4_100, state.elapsedMs + 4_100);
  assert.equal(state.grills.grillA.item.cookState, COOK_STATES.cooked);

  state = tapStation(state, "grillA");
  assert.equal(state.grills.grillA.item, null);
  assert.equal(state.player.holding.cookState, COOK_STATES.cooked);
});

test("goose and duck label stations apply fixed labels without a toggle", () => {
  let gooseState = cookGoose(startGame(0));
  gooseState = tapStation(gooseState, "gooseLabel");
  assert.equal(gooseState.player.holding.label, ITEM_KINDS.goose);

  let duckState = tapStation(startGame(0), "duckFridge");
  duckState = tapStation(duckState, "grillA");
  duckState = stepGame(duckState, {}, 4_100, duckState.elapsedMs + 4_100);
  duckState = tapStation(duckState, "grillA");
  duckState = tapStation(duckState, "duckLabel");
  assert.equal(duckState.player.holding.label, ITEM_KINDS.duck);
});

test("correctly cooked and labeled goose order scores when served", () => {
  let state = forceOrder(startGame(0), ITEM_KINDS.goose);
  state = cookGoose(state);
  state = tapStation(state, "gooseLabel");
  state = tapStation(state, "serveWindow");

  assert.equal(state.orders.length, 0);
  assert.equal(state.player.holding, null);
  assert.equal(state.combo, 1);
  assert.equal(state.trust, 82);
  assert.ok(state.score >= 120);
});

test("green juice is required only for matching sauce orders", () => {
  let state = forceOrder(startGame(0), ITEM_KINDS.goose, true);
  state = cookGoose(state);
  state = tapStation(state, "gooseLabel");

  const rejected = tapStation(state, "serveWindow");
  assert.equal(rejected.orders.length, 1);
  assert.equal(rejected.player.holding.sauced, false);
  assert.match(rejected.feedback.text, /绿汁|蘸/);

  state = tapStation(state, "sauceStation");
  assert.equal(state.player.holding.sauced, true);
  assert.match(state.feedback.text, /绿汁/);

  state = tapStation(state, "serveWindow");
  assert.equal(state.orders.length, 0);
  assert.equal(state.player.holding, null);
  assert.equal(state.combo, 1);
});

test("non-sauce orders reject dipped legs", () => {
  let state = forceOrder(startGame(0), ITEM_KINDS.goose, false);
  state = cookGoose(state);
  state = tapStation(state, "sauceStation");
  state = tapStation(state, "gooseLabel");
  state = tapStation(state, "serveWindow");

  assert.equal(state.orders.length, 1);
  assert.equal(state.player.holding.sauced, true);
  assert.equal(state.combo, 0);
  assert.match(state.feedback.text, /不蘸汁|绿汁/);
});

test("green juice station only dips cooked legs once", () => {
  let state = tapStation(startGame(0), "sauceStation");
  assert.match(state.feedback.text, /先拿熟腿|熟腿/);

  state = tapStation(state, "duckFridge");
  state = tapStation(state, "sauceStation");
  assert.equal(state.player.holding.sauced, false);
  assert.match(state.feedback.text, /先烤熟/);

  state = tapStation(state, "grillA");
  state = stepGame(state, {}, 4_100, state.elapsedMs + 4_100);
  state = tapStation(state, "grillA");
  state = tapStation(state, "sauceStation");
  assert.equal(state.player.holding.sauced, true);

  state = tapStation(state, "sauceStation");
  assert.equal(state.player.holding.sauced, true);
  assert.match(state.feedback.text, /已经/);
});

test("auto-arrival does not serve after the round ends", () => {
  const initial = forceOrder(startGame(0), ITEM_KINDS.goose);
  const servePoint = stationCenter(initial, "serveWindow");
  const state = {
    ...initial,
    elapsedMs: 89_900,
    timeLeftMs: 100,
    orders: initial.orders.map((order) => ({
      ...order,
      createdAt: 89_900,
      deadlineAt: 110_000,
    })),
    player: {
      ...initial.player,
      ...servePoint,
      holding: {
        kind: ITEM_KINDS.goose,
        cookState: COOK_STATES.cooked,
        label: ITEM_KINDS.goose,
      },
      target: {
        ...servePoint,
        stationId: "serveWindow",
      },
    },
  };

  const next = stepGame(state, {}, 100, 90_000);

  assert.equal(next.status, "ended");
  assert.equal(next.score, 0);
  assert.equal(next.combo, 0);
  assert.equal(next.orders.length, 1);
  assert.deepEqual(next.player.holding, state.player.holding);
});

test("large time steps do not keep already expired spawned orders active", () => {
  const state = stepGame(startGame(0), {}, 28_000, 28_000);

  assert.equal(state.elapsedMs, 28_000);
  assert.equal(
    state.orders.some((order) => order.deadlineAt <= state.elapsedMs),
    false,
  );
});

test("huge time steps advance orders past expired catch-up spawns", () => {
  const state = stepGame(startGame(0), {}, 60_000, 60_000);

  assert.equal(state.elapsedMs, 60_000);
  assert.ok(state.nextOrderAt > state.elapsedMs);
  assert.equal(
    state.orders.some((order) => order.deadlineAt <= state.elapsedMs),
    false,
  );
  assert.deepEqual(
    state.orders.map((order) => order.createdAt),
    [42_000, 49_000, 56_000],
  );
});

test("large time steps no longer trigger hidden inspection penalties", () => {
  const state = stepGame(startGame(0), {}, 60_000, 60_000);

  assert.equal(state.elapsedMs, 60_000);
  assert.equal(state.inspection.active, false);
  assert.deepEqual(state.triggeredInspections, []);
  assert.equal(state.trust, 32);
});

test("inspection catch-up remains disabled after notice station is replaced", () => {
  const state = stepGame(startGame(0), {}, 73_000, 73_000);

  assert.deepEqual(state.triggeredInspections, []);
  assert.equal(state.inspection.active, false);
  assert.equal(state.trust, 16);
});

test("wrong fixed label is rejected and keeps the item in hand", () => {
  let state = forceOrder(startGame(0), ITEM_KINDS.goose);
  state = {
    ...state,
    combo: 3,
  };
  state = cookGoose(state);
  state = tapStation(state, "duckLabel");
  state = tapStation(state, "serveWindow");

  assert.equal(state.orders.length, 1);
  assert.equal(state.player.holding.kind, ITEM_KINDS.goose);
  assert.equal(state.player.holding.label, ITEM_KINDS.duck);
  assert.equal(state.combo, 0);
  assert.equal(state.trust, 68);
  assert.match(state.feedback.text, /错标|标签|不收/);
});

test("getActionHint reflects the current mobile next step", () => {
  let state = startGame(0);
  let hint = getActionHint(state);
  assert.match(hint.current, /空手/);
  assert.match(hint.next, /鹅柜|鸭柜/);

  state = tapStation(state, "gooseFridge");
  hint = getActionHint(state);
  assert.match(hint.current, /生/);
  assert.match(hint.current, /鹅腿/);
  assert.match(hint.next, /烤台/);

  state = tapStation(state, "grillA");
  hint = getActionHint(state);
  assert.match(hint.next, /等|火候/);

  state = forceOrder(state, ITEM_KINDS.goose, true);
  state = stepGame(state, {}, 4_100, state.elapsedMs + 4_100);
  state = tapStation(state, "grillA");
  state = tapStation(state, "gooseLabel");
  hint = getActionHint(state);
  assert.match(hint.current, /鹅标|已贴/);
  assert.match(hint.next, /绿汁/);
});

test("nearby station still works for keyboard fallback interaction", () => {
  const initial = startGame(0);
  const state = {
    ...initial,
    player: {
      ...initial.player,
      ...stationCenter(initial, "trash"),
    },
  };

  assert.equal(getNearbyStation(state).id, "trash");
  assert.equal(interact(state, 0).feedback.text, "手上没东西。");
});

test("abstract tabletop visual tokens cover every station", () => {
  const state = createInitialState();

  assert.equal(ABSTRACT_STYLE_VERSION, "tabletop-v1");
  assert.equal(state.stations.sauceStation.label, "绿汁");
  assert.equal(STATION_VISUALS.sauceStation.icon, "sauce");

  for (const station of Object.values(state.stations)) {
    assert.ok(STATION_VISUALS[station.id], `${station.id} visual token missing`);
    const visual = STATION_VISUALS[station.id];

    assert.equal(typeof visual.label, "string", `${station.id} label missing`);
    assert.equal(typeof visual.role, "string", `${station.id} role missing`);
    assert.match(visual.fill, /^#[0-9a-f]{6}$/i, `${station.id} fill must be a hex color`);
    assert.match(visual.accent, /^#[0-9a-f]{6}$/i, `${station.id} accent must be a hex color`);
    assert.match(visual.ink, /^#[0-9a-f]{6}$/i, `${station.id} ink must be a hex color`);
  }
});

test("abstract tabletop visuals keep goose and duck distinct", () => {
  assert.notEqual(STATION_VISUALS.gooseFridge.fill, STATION_VISUALS.duckFridge.fill);
  assert.notEqual(STATION_VISUALS.gooseLabel.fill, STATION_VISUALS.duckLabel.fill);
  assert.equal(STATION_VISUALS.gooseFridge.role, "goose");
  assert.equal(STATION_VISUALS.duckFridge.role, "duck");

  assert.equal(ITEM_VISUALS.goose.label, "鹅腿");
  assert.equal(ITEM_VISUALS.duck.label, "鸭腿");
  assert.ok(ITEM_VISUALS.goose.width > ITEM_VISUALS.duck.width);
  assert.notEqual(getItemVisual(ITEM_KINDS.goose).fill, getItemVisual(ITEM_KINDS.duck).fill);
});

test("mobile station rectangles stay inside the visible kitchen", () => {
  const state = createInitialState();

  for (const station of Object.values(state.stations)) {
    assert.ok(station.x >= 20, `${station.id} x too close to edge`);
    assert.ok(station.y >= 80, `${station.id} y too close to hud edge`);
    assert.ok(station.x + station.w <= KITCHEN.width - 20, `${station.id} overflows right`);
    assert.ok(station.y + station.h <= 820, `${station.id} too low for bottom dock safety`);
    assert.ok(station.w >= 88, `${station.id} tap width too small`);
    assert.ok(station.h >= 78, `${station.id} tap height too small`);
  }
});

test("mobile station tap targets do not overlap each other", () => {
  const stations = Object.values(createInitialState().stations);

  for (let i = 0; i < stations.length; i += 1) {
    for (let j = i + 1; j < stations.length; j += 1) {
      assert.equal(
        rectsOverlap(stations[i], stations[j]),
        false,
        `${stations[i].id} overlaps ${stations[j].id}`,
      );
    }
  }
});

test("mobile label stations and serve window sit above the bottom dock safe zone", () => {
  const state = createInitialState();

  assert.ok(state.stations.gooseLabel.y + state.stations.gooseLabel.h <= 500);
  assert.ok(state.stations.duckLabel.y + state.stations.duckLabel.h <= 500);
  assert.ok(state.stations.serveWindow.y + state.stations.serveWindow.h <= 805);
});

test("mobile cooking layout keeps serving high and grills low", () => {
  const state = createInitialState();
  const { duckFridge, duckLabel, gooseFridge, gooseLabel, grillA, grillB, serveWindow } = state.stations;

  assert.ok(serveWindow.y + serveWindow.h <= 280, "serve window should stay in the upper play area");
  assert.equal(serveWindow.y, 126, "serve window should stay fixed");
  assert.equal(gooseFridge.y, serveWindow.y + 108, "left goose station should sit below serving");
  assert.equal(gooseLabel.y, serveWindow.y + 108, "right goose station should sit below serving");
  assert.equal(duckFridge.y, gooseFridge.y + 144, "left duck station should stay below goose station");
  assert.equal(duckLabel.y, gooseLabel.y + 144, "right duck station should stay below goose station");
  assert.ok(grillA.y >= 600, "left grill should sit in the lower cooking row");
  assert.ok(grillB.y >= 600, "right grill should sit in the lower cooking row");
  assert.ok(grillA.y + grillA.h <= 780, "left grill should stay above bottom utility row");
  assert.ok(grillB.y + grillB.h <= 780, "right grill should stay above bottom utility row");
});
