import {
  ITEM_KINDS,
  KITCHEN,
  getActionHint,
  getGameSummary,
  interact,
  setMoveTarget,
  startGame,
  stepGame,
} from "./game.js";

const FRAME_LIMIT_MS = 80;

let state = null;
let lastFrame = 0;
let assets = null;
let overlayMode = "start";
let loadAssets = fallbackLoadAssets;
let renderGame = fallbackRenderGame;

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
};

function requiredElement(selector) {
  const element = document.querySelector(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

const els = {
  gamePanel: requiredElement("#gamePanel"),
  canvas: requiredElement("#gameCanvas"),
  score: requiredElement("#score"),
  trust: requiredElement("#trust"),
  timer: requiredElement("#timer"),
  orderRail: requiredElement("#orderRail"),
  currentHint: requiredElement("#currentHint"),
  nextHint: requiredElement("#nextHint"),
  overlay: requiredElement("#overlay"),
  overlayTitle: requiredElement("#overlayTitle"),
  overlayDetail: requiredElement("#overlayDetail"),
  startButton: requiredElement("#startButton"),
  restartButton: requiredElement("#restartButton"),
};

const ctx = els.canvas.getContext("2d");

function beginGame() {
  state = startGame(performance.now());
  lastFrame = performance.now();
  overlayMode = "playing";
  setOverlayVisible(false);
  releaseControlFocus();
  renderAll();
}

function update(timestamp) {
  if (!lastFrame) {
    lastFrame = timestamp;
  }

  if (state?.status === "playing") {
    const deltaMs = Math.min(timestamp - lastFrame, FRAME_LIMIT_MS);
    state = stepGame(state, input, deltaMs, timestamp);
    renderAll();

    if (state.status === "ended") {
      showEndOverlay();
    }
  } else {
    renderCanvas();
  }

  lastFrame = timestamp;
  window.requestAnimationFrame(update);
}

function applyInteract() {
  if (state?.status !== "playing") {
    return;
  }

  state = interact(state, performance.now());
  renderAll();

  if (state.status === "ended") {
    showEndOverlay();
  }
}

function renderAll() {
  renderDom();
  fitCanvasToLayout();
  renderCanvas();
}

function renderCanvas() {
  if (!ctx || !state) {
    return;
  }

  scaleCanvasToDevice();
  renderGame(ctx, state, assets);
}

function scaleCanvasToDevice() {
  if (!ctx) {
    return;
  }

  const scale = window.devicePixelRatio || 1;
  const width = Math.round(KITCHEN.width * scale);
  const height = Math.round(KITCHEN.height * scale);

  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function renderDom() {
  const score = state?.score ?? 0;
  const trust = state?.trust ?? 80;
  const timeLeftMs = state?.timeLeftMs ?? 90_000;
  const hint = state
    ? getActionHint(state)
    : {
        current: "空手",
        next: "点鹅柜或鸭柜",
      };

  els.score.textContent = String(score);
  els.trust.textContent = String(trust);
  els.timer.textContent = String(Math.ceil(timeLeftMs / 1000));
  els.currentHint.textContent = hint.current;
  els.nextHint.textContent = hint.next;

  renderOrders();
}

function renderOrders() {
  const orders = state?.orders ?? [];

  if (orders.length === 0) {
    const empty = document.createElement("article");
    empty.className = "order-card empty-orders";
    empty.textContent = "暂无订单";
    els.orderRail.replaceChildren(empty);
    return;
  }

  els.orderRail.replaceChildren(
    ...orders.map((order) => {
      const remainingMs = Math.max(0, order.deadlineAt - (state?.elapsedMs ?? 0));
      const card = document.createElement("article");
      card.className = "order-card";

      if (order.truth === ITEM_KINDS.goose) {
        card.classList.add("goose");
      }

      if (remainingMs <= 5_000) {
        card.classList.add("urgent");
      }

      const title = document.createElement("div");
      title.className = "order-title";
      title.textContent = `#${order.id}`;

      const time = document.createElement("span");
      time.textContent = `${Math.ceil(remainingMs / 1000)}s`;
      title.append(time);

      const supply = document.createElement("p");
      const itemName = order.truth === ITEM_KINDS.goose ? "鹅腿" : "鸭腿";
      const sauceText = order.needsSauce ? "要绿汁" : "不蘸汁";
      supply.textContent = `${itemName} · ${sauceText}`;

      const shout = document.createElement("p");
      shout.textContent = compactShout(order.shout);

      card.append(title, supply, shout);
      return card;
    }),
  );
}

function compactShout(shout) {
  return shout
    .replace(/^顾客喊话：/, "")
    .replace("来个网红鹅腿", "网红鹅腿")
    .replace("今天有鹅腿吗", "问鹅腿")
    .replace("招牌是不是鹅", "查标签")
    .replace("照实写就行", "照实写")
    .replace("别让我猜", "别猜")
    .replace("我要看清标签", "看标签");
}

function showEndOverlay() {
  if (!state || overlayMode === "ended") {
    return;
  }

  const summary = getGameSummary(state);
  overlayMode = "ended";
  els.overlayTitle.textContent = summary.title;
  els.overlayDetail.textContent = `${summary.detail} 最终 ${state.score} 分，最佳连击 ${state.bestCombo}。`;
  els.startButton.textContent = "再来一局";
  setOverlayVisible(true);
  renderDom();
}

function setOverlayVisible(visible) {
  els.overlay.classList.toggle("visible", visible);
  els.gamePanel.inert = visible;

  if (visible) {
    window.requestAnimationFrame(() => els.startButton.focus());
  }
}

function setDirection(direction, active) {
  if (!Object.hasOwn(input, direction)) {
    return;
  }

  input[direction] = active;
}

function releaseControlFocus() {
  const activeElement = document.activeElement;

  if (typeof activeElement?.matches === "function" && activeElement.matches("button")) {
    activeElement.blur();
  }
}

function eventToKitchenPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * KITCHEN.width,
    y: ((event.clientY - rect.top) / rect.height) * KITCHEN.height,
  };
}

function handleCanvasPointerDown(event) {
  if (state?.status !== "playing") {
    return;
  }

  event.preventDefault();
  const point = eventToKitchenPoint(event);
  state = setMoveTarget(state, point.x, point.y);
  renderAll();
}

function handleKeyDown(event) {
  const isShortcutTarget = isReservedShortcutTarget(event.target);
  const direction = keyToDirection(event.code);

  if (direction) {
    if (!isShortcutTarget && state?.status === "playing") {
      event.preventDefault();
    }

    if (isShortcutTarget) {
      return;
    }

    setDirection(direction, true);
    return;
  }

  if (
    (event.code === "Space" || event.code === "KeyE") &&
    !event.repeat &&
    state?.status === "playing" &&
    !isShortcutTarget
  ) {
    event.preventDefault();
    applyInteract();
  }
}

function handleKeyUp(event) {
  if (isReservedShortcutTarget(event.target)) {
    return;
  }

  const direction = keyToDirection(event.code);

  if (!direction) {
    return;
  }

  if (state?.status === "playing") {
    event.preventDefault();
  }

  setDirection(direction, false);
}

function isReservedShortcutTarget(target) {
  if (typeof target?.closest !== "function") {
    return false;
  }

  return Boolean(
    target.closest("button, input, select, textarea, [contenteditable=''], [contenteditable='true']"),
  );
}

function keyToDirection(code) {
  return {
    ArrowUp: "up",
    KeyW: "up",
    ArrowDown: "down",
    KeyS: "down",
    ArrowLeft: "left",
    KeyA: "left",
    ArrowRight: "right",
    KeyD: "right",
  }[code];
}

function bindControls() {
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("resize", handleViewportChange);
  window.addEventListener("orientationchange", handleViewportChange);
  window.visualViewport?.addEventListener("resize", handleViewportChange);
  window.visualViewport?.addEventListener("scroll", handleViewportChange);

  els.canvas.addEventListener("pointerdown", handleCanvasPointerDown);
  els.startButton.addEventListener("click", beginGame);
  els.restartButton.addEventListener("click", beginGame);
}

function handleViewportChange() {
  syncViewportHeight();
  fitCanvasToLayout();
  renderCanvas();
}

function syncViewportHeight() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;

  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return;
  }

  document.documentElement.style.setProperty("--app-height", `${Math.round(viewportHeight)}px`);
}

function fitCanvasToLayout() {
  const wrapper = els.canvas.parentElement;

  if (!wrapper) {
    return;
  }

  const rect = wrapper.getBoundingClientRect();
  const style = window.getComputedStyle(wrapper);
  const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const maxWidth = Math.max(0, rect.width - paddingX);
  const maxHeight = Math.max(0, rect.height - paddingY);

  if (maxWidth <= 0 || maxHeight <= 0) {
    return;
  }

  const aspect = KITCHEN.width / KITCHEN.height;
  const width = Math.min(maxWidth, maxHeight * aspect);
  const height = width / aspect;

  els.canvas.style.width = `${Math.floor(width)}px`;
  els.canvas.style.height = `${Math.floor(height)}px`;
}

async function importOptionalModule(path) {
  try {
    return await import(path);
  } catch (error) {
    console.warn(`Using Task 3 fallback for ${path}.`, error);
    return null;
  }
}

async function loadOptionalRenderModules() {
  const [assetsModule, renderModule] = await Promise.all([
    importOptionalModule("./assets.js"),
    importOptionalModule("./render.js"),
  ]);

  if (typeof assetsModule?.loadAssets === "function") {
    loadAssets = assetsModule.loadAssets;
  }

  if (typeof renderModule?.renderGame === "function") {
    renderGame = renderModule.renderGame;
  }
}

async function fallbackLoadAssets() {
  return new Map();
}

function fallbackRenderGame(context, currentState) {
  context.clearRect(0, 0, KITCHEN.width, KITCHEN.height);
  context.fillStyle = "#172025";
  context.fillRect(0, 0, KITCHEN.width, KITCHEN.height);

  drawFallbackFloor(context);
  drawFallbackStations(context, currentState);
  drawFallbackOrders(context, currentState);
  drawFallbackPlayer(context, currentState);
  drawFallbackStatus(context, currentState);
}

function drawFallbackFloor(context) {
  context.strokeStyle = "rgba(255, 255, 255, 0.06)";
  context.lineWidth = 1;

  for (let x = 0; x <= KITCHEN.width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, KITCHEN.height);
    context.stroke();
  }

  for (let y = 0; y <= KITCHEN.height; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(KITCHEN.width, y);
    context.stroke();
  }
}

function drawFallbackStations(context, currentState) {
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 17px system-ui, sans-serif";

  for (const station of Object.values(currentState.stations)) {
    const grillItem = currentState.grills[station.id]?.item;

    context.fillStyle =
      station.id === "serveWindow"
        ? "#325d62"
        : station.id === "sauceStation"
          ? "#4f9b45"
          : "#31363c";
    context.strokeStyle = grillItem ? "#f3c766" : "rgba(255, 255, 255, 0.18)";
    context.lineWidth = 3;
    drawRoundRect(context, station.x, station.y, station.w, station.h, 8);
    context.fill();
    context.stroke();

    context.fillStyle = "#fff2c6";
    context.fillText(station.label, station.x + station.w / 2, station.y + station.h / 2);

    if (grillItem) {
      context.fillStyle = grillItem.cookState === "burnt" ? "#161412" : "#dd8642";
      context.beginPath();
      context.arc(station.x + station.w / 2, station.y + station.h - 20, 10, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawRoundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function drawFallbackOrders(context, currentState) {
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = "750 16px system-ui, sans-serif";
  context.fillStyle = "#fff2c6";
  context.fillText(`订单 ${currentState.orders.length}`, 24, 20);
}

function drawFallbackPlayer(context, currentState) {
  const { player } = currentState;

  context.fillStyle = "#83d47e";
  context.strokeStyle = "#102018";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  if (!player.holding) {
    return;
  }

  context.fillStyle = player.holding.sauced
    ? "#72bf55"
    : player.holding.kind === ITEM_KINDS.goose
      ? "#f3c766"
      : "#55c7b2";
  context.beginPath();
  context.ellipse(player.x, player.y - 30, 20, 11, -0.25, 0, Math.PI * 2);
  context.fill();
}

function drawFallbackStatus(context, currentState) {
  if (!currentState.feedback?.text) {
    return;
  }

  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.font = "700 18px system-ui, sans-serif";
  context.fillStyle = "rgba(0, 0, 0, 0.42)";
  context.fillRect(40, 900, 460, 34);
  context.fillStyle = "#fff7e8";
  context.fillText(currentState.feedback.text, 270, 926);
}

async function init() {
  syncViewportHeight();
  bindControls();
  renderDom();
  fitCanvasToLayout();
  scaleCanvasToDevice();
  setOverlayVisible(true);
  window.requestAnimationFrame(update);

  await loadOptionalRenderModules();
  assets = await loadAssets();
  renderCanvas();
}

init();
