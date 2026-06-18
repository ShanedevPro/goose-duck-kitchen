import { ASSET_IDS, getAsset } from "./assets.js";
import {
  FEEDBACK_VISUALS,
  getItemVisual,
  getStationVisual,
} from "./abstract-visuals.js";
import {
  COOK_STATES,
  ITEM_KINDS,
  KITCHEN,
  getNearbyStation,
  labelText,
} from "./game.js";

const FULL_TURN = Math.PI * 2;

export function renderGame(ctx, state, assets) {
  const width = KITCHEN.width;
  const height = KITCHEN.height;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  drawKitchenBackdrop(ctx, assets, width, height);
  drawTargetPath(ctx, state, assets);
  drawStations(ctx, state, assets);
  drawGrillContents(ctx, state, assets);
  drawProximityHighlight(ctx, state, assets);
  drawPlayer(ctx, state, assets);
  drawFeedback(ctx, state, width, height);
  ctx.restore();
}

function drawKitchenBackdrop(ctx, assets, width, height) {
  void assets;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#3a2117");
  gradient.addColorStop(0.45, "#714124");
  gradient.addColorStop(1, "#2b1a12");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 236, 176, 0.08)";
  drawRoundRect(ctx, 24, 78, width - 48, 708, 24);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 248, 220, 0.72)";
  drawRoundRect(ctx, 74, 192, width - 148, 388, 28);
  ctx.fill();

  ctx.strokeStyle = "rgba(95, 55, 28, 0.14)";
  ctx.lineWidth = 1;
  for (let y = 220; y <= 548; y += 58) {
    drawLine(ctx, 88, y, width - 88, y);
  }
  for (let x = 108; x <= width - 108; x += 68) {
    drawLine(ctx, x, 208, x, 560);
  }

  ctx.fillStyle = "rgba(48, 27, 16, 0.26)";
  drawRoundRect(ctx, 32, 792, width - 64, 64, 16);
  ctx.fill();

  ctx.fillStyle = "rgba(255, 225, 146, 0.16)";
  drawRoundRect(ctx, 58, 94, width - 116, 44, 18);
  ctx.fill();
}

function drawTargetPath(ctx, state, assets) {
  const { player } = state;
  const target = player.target;
  if (!target) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(84, 55, 28, 0.55)";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.setLineDash([12, 12]);
  drawLine(ctx, player.x, player.y, target.x, target.y);

  const pulse = 0.5 + 0.5 * Math.sin((state.elapsedMs ?? 0) / 160);
  const radius = 30 + pulse * 8;
  const ring = getAsset(assets, ASSET_IDS.tapRing);
  ctx.setLineDash([]);

  if (ring) {
    ctx.globalAlpha = 0.74 + pulse * 0.18;
    drawImageFit(ctx, ring, target.x - radius, target.y - radius, radius * 2, radius * 2);
    ctx.restore();
    return;
  }

  ctx.globalAlpha = 0.84;
  ctx.strokeStyle = "#fff4be";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(target.x, target.y, radius, 0, FULL_TURN);
  ctx.stroke();
  ctx.strokeStyle = "rgba(184, 89, 54, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(target.x, target.y, radius + 6, 0, FULL_TURN);
  ctx.stroke();
  ctx.restore();
}

function drawStations(ctx, state, assets) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const station of Object.values(state.stations)) {
    const visual = getStationVisual(station.id);

    drawStationBase(ctx, station, visual, assets);
    drawStationIcon(ctx, station, visual);
    drawStationLabel(ctx, station, visual.label);

    if (state.grills[station.id]) {
      drawGrillState(ctx, station, state.grills[station.id].item);
    }
  }
}

function drawStationBase(ctx, station, visual, assets) {
  void assets;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
  drawRoundRect(ctx, station.x + 5, station.y + 8, station.w, station.h, 16);
  ctx.fill();

  ctx.fillStyle = visual.shadow;
  drawRoundRect(ctx, station.x, station.y + 5, station.w, station.h, 16);
  ctx.fill();

  const gradient = ctx.createLinearGradient(station.x, station.y, station.x, station.y + station.h);
  gradient.addColorStop(0, lightenHex(visual.fill, 18));
  gradient.addColorStop(1, visual.fill);
  ctx.fillStyle = gradient;
  drawRoundRect(ctx, station.x, station.y, station.w, station.h, 16);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 248, 220, 0.35)";
  ctx.lineWidth = 2;
  drawRoundRect(ctx, station.x + 2, station.y + 2, station.w - 4, station.h - 4, 14);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  drawRoundRect(ctx, station.x + 14, station.y + 28, station.w - 28, 20, 10);
  ctx.fill();

  ctx.restore();
}

function drawStationIcon(ctx, station, visual) {
  const cx = station.x + station.w / 2;
  const cy = station.y + station.h / 2 - 10;

  ctx.save();
  ctx.strokeStyle = "rgba(35, 22, 14, 0.72)";
  ctx.fillStyle = visual.accent;
  ctx.lineWidth = 4;

  if (visual.icon === "goose-card" || visual.icon === "duck-card") {
    const kind = visual.icon === "goose-card" ? ITEM_KINDS.goose : ITEM_KINDS.duck;
    drawLegIcon(ctx, kind, cx, cy, 0.82, "raw");
    drawMiniBadge(ctx, visual.icon === "goose-card" ? "鹅" : "鸭", cx + 30, cy - 25, visual);
  } else if (visual.icon === "grill") {
    drawRoundRect(ctx, cx - 42, cy - 20, 84, 38, 9);
    ctx.fillStyle = "#25201f";
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 224, 140, 0.62)";
    ctx.lineWidth = 3;
    for (let x = cx - 30; x <= cx + 30; x += 15) {
      drawLine(ctx, x, cy - 16, x, cy + 14);
    }
    for (let y = cy - 10; y <= cy + 10; y += 10) {
      drawLine(ctx, cx - 34, y, cx + 34, y);
    }
  } else if (visual.icon === "stamp-goose" || visual.icon === "stamp-duck") {
    drawRoundRect(ctx, cx - 34, cy - 24, 68, 48, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff4d8";
    drawRoundRect(ctx, cx - 24, cy - 13, 48, 26, 6);
    ctx.fill();
    ctx.fillStyle = visual.fill;
    ctx.font = "900 18px system-ui, sans-serif";
    ctx.fillText(visual.icon === "stamp-goose" ? "鹅" : "鸭", cx, cy + 1);
  } else if (visual.icon === "tray") {
    drawRoundRect(ctx, cx - 42, cy - 19, 84, 38, 11);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(61, 36, 17, 0.55)";
    drawLine(ctx, cx - 30, cy - 2, cx + 30, cy - 2);
  } else if (visual.icon === "sauce") {
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 38, 20, 0, 0, FULL_TURN);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d8f7a8";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 5, 27, 10, 0, 0, FULL_TURN);
    ctx.fill();
    ctx.fillStyle = "#4f9b45";
    ctx.beginPath();
    ctx.arc(cx - 8, cy + 1, 5, 0, FULL_TURN);
    ctx.arc(cx + 9, cy + 6, 4, 0, FULL_TURN);
    ctx.fill();
    ctx.strokeStyle = "rgba(61, 36, 17, 0.55)";
    ctx.lineWidth = 3;
    drawLine(ctx, cx - 30, cy - 16, cx + 23, cy - 32);
    drawLine(ctx, cx + 23, cy - 32, cx + 30, cy - 24);
  } else if (visual.icon === "trash") {
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy - 16);
    ctx.lineTo(cx + 20, cy - 16);
    ctx.lineTo(cx + 14, cy + 22);
    ctx.lineTo(cx - 14, cy + 22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawLine(ctx, cx - 24, cy - 22, cx + 24, cy - 22);
  }

  ctx.restore();
}

function drawMiniBadge(ctx, text, x, y, visual) {
  ctx.save();
  ctx.fillStyle = "#fff6da";
  ctx.strokeStyle = visual.fill;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, FULL_TURN);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = visual.fill;
  ctx.font = "900 14px system-ui, sans-serif";
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function drawStationLabel(ctx, station, label) {
  const x = station.x + station.w / 2;
  const y = station.y + station.h - 16;
  const text = label.replace("烤台 ", "烤");
  const padding = 12;

  ctx.save();
  ctx.font = "900 15px system-ui, sans-serif";
  const labelWidth = Math.max(56, ctx.measureText(text).width + padding * 2);
  ctx.fillStyle = "rgba(36, 21, 12, 0.82)";
  drawRoundRect(ctx, x - labelWidth / 2, y - 12, labelWidth, 24, 7);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 240, 189, 0.28)";
  ctx.lineWidth = 1;
  drawRoundRect(ctx, x - labelWidth / 2 + 1, y - 11, labelWidth - 2, 22, 6);
  ctx.stroke();
  ctx.fillStyle = "#fff8da";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawGrillState(ctx, station, item) {
  const cx = station.x + station.w - 24;
  const cy = station.y + 24;

  ctx.save();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  ctx.arc(cx, cy, 17, 0, FULL_TURN);
  ctx.stroke();

  if (!item) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.44)";
    ctx.beginPath();
    ctx.arc(cx, cy, 17, 0, FULL_TURN);
    ctx.stroke();
    ctx.fillStyle = "#f8e8c2";
    ctx.font = "800 13px system-ui, sans-serif";
    ctx.fillText("空", cx, cy + 1);
    ctx.restore();
    return;
  }

  const progress = getCookProgress(item);
  ctx.strokeStyle = getCookColor(item.cookState);
  ctx.beginPath();
  ctx.arc(cx, cy, 17, -Math.PI / 2, -Math.PI / 2 + FULL_TURN * progress);
  ctx.stroke();

  ctx.fillStyle = getCookColor(item.cookState);
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.fillText(getCookLabel(item.cookState), cx, cy + 1);
  ctx.restore();
}

function drawGrillContents(ctx, state, assets) {
  void assets;

  for (const [stationId, grill] of Object.entries(state.grills)) {
    if (!grill.item) {
      continue;
    }

    const station = state.stations[stationId];
    const size = grill.item.kind === ITEM_KINDS.goose ? 54 : 46;

    drawHeldItemFallback(
      ctx,
      grill.item,
      station.x + station.w / 2,
      station.y + station.h / 2 - 8,
      size / 54,
    );
  }
}

function drawProximityHighlight(ctx, state) {
  const station = getNearbyStation(state);
  if (!station) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "#f8e27c";
  ctx.lineWidth = 5;
  ctx.setLineDash([12, 8]);
  drawRoundRect(ctx, station.x - 7, station.y - 7, station.w + 14, station.h + 14, 12);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(ctx, state, assets) {
  void assets;

  const { player } = state;
  const moving = Boolean(player.target);
  const target = player.target;
  const dx = target ? target.x - player.x : 0;
  const facing = dx < -4 ? -1 : 1;
  const time = (state.elapsedMs ?? 0) / 1000;
  const stride = moving ? Math.sin(time * 12) : Math.sin(time * 3) * 0.18;
  const bounce = moving ? Math.abs(stride) * 4 : 1 + Math.sin(time * 2.2) * 0.8;
  const x = player.x;
  const y = player.y - bounce;

  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
  ctx.beginPath();
  ctx.ellipse(x + 2, player.y + player.radius + 8, 25, 8, 0, 0, FULL_TURN);
  ctx.fill();

  ctx.translate(x, y);
  ctx.scale(facing, 1);

  drawChefLeg(ctx, -9, 22, -stride, "#5d2f28");
  drawChefLeg(ctx, 9, 22, stride, "#5d2f28");

  ctx.fillStyle = "#cf574b";
  ctx.strokeStyle = "#252423";
  ctx.lineWidth = 3.5;
  drawRoundRect(ctx, -20, -3, 40, 40, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#fff3dc";
  ctx.beginPath();
  ctx.moveTo(-14, 2);
  ctx.quadraticCurveTo(0, 16, 14, 2);
  ctx.lineTo(12, 32);
  ctx.lineTo(-12, 32);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#252423";
  ctx.lineWidth = 4;
  drawChefArm(ctx, -18, 8, -12 - stride * 6, 18 + Math.abs(stride) * 4);
  drawChefArm(ctx, 18, 8, 26 + stride * 5, 7 + Math.abs(stride) * 2);

  ctx.fillStyle = "#f4bf83";
  ctx.strokeStyle = "#252423";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, -19, 18, 0, FULL_TURN);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#2d241e";
  ctx.beginPath();
  ctx.arc(-7, -21, 2.4, 0, FULL_TURN);
  ctx.arc(7, -21, 2.4, 0, FULL_TURN);
  ctx.fill();
  ctx.strokeStyle = "#7b3d32";
  ctx.lineWidth = 2;
  drawLine(ctx, -6, -12, 6, -12);

  ctx.fillStyle = "#3d2a22";
  ctx.beginPath();
  ctx.arc(-13, -25, 8, Math.PI * 0.7, Math.PI * 1.7);
  ctx.arc(13, -25, 8, Math.PI * 1.3, Math.PI * 0.3);
  ctx.fill();

  ctx.fillStyle = "#fff8ec";
  ctx.strokeStyle = "#252423";
  ctx.lineWidth = 3;
  drawRoundRect(ctx, -19, -48 - Math.abs(stride) * 1.4, 38, 16, 8);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-9, -42 - Math.abs(stride) * 1.4, 9, 0, FULL_TURN);
  ctx.arc(0, -46 - Math.abs(stride) * 1.4, 11, 0, FULL_TURN);
  ctx.arc(10, -42 - Math.abs(stride) * 1.4, 9, 0, FULL_TURN);
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  if (player.holding) {
    drawHeldItem(ctx, player.holding, x + facing * 29, y - 12, null, 0.8);
  }
}

function drawChefLeg(ctx, x, y, stride, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(stride * 0.45);
  ctx.strokeStyle = "#252423";
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  drawRoundRect(ctx, -6, -2, 12, 26, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#2b2521";
  drawRoundRect(ctx, -10, 20, 18, 8, 5);
  ctx.fill();
  ctx.restore();
}

function drawChefArm(ctx, startX, startY, endX, endY) {
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo((startX + endX) / 2, endY - 12, endX, endY);
  ctx.stroke();
  ctx.fillStyle = "#f4bf83";
  ctx.beginPath();
  ctx.arc(endX, endY, 5, 0, FULL_TURN);
  ctx.fill();
  ctx.stroke();
}

function drawHeldItem(ctx, item, x, y, assets, scale = 1) {
  if (!item) {
    return;
  }

  const visual = getItemVisual(item.kind);
  const width = visual.width * scale;
  const height = visual.height * scale;
  const fill = getItemColor(item);
  const bodyRadiusX = width * 0.42;
  const bodyRadiusY = height * 0.42;
  const jointRadius = height * 0.22;
  const nubRadius = height * 0.18;
  const boneX = width * 0.42;
  const boneY = -height * 0.07;
  const nubX = width * 0.58;
  const nubY = -height * 0.22;

  ctx.save();
  void assets;
  ctx.translate(x, y);
  ctx.rotate(-0.25);
  ctx.fillStyle = fill;
  ctx.strokeStyle = "#172025";
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyRadiusX, bodyRadiusY, 0, 0, FULL_TURN);
  ctx.fill();
  ctx.stroke();

  if (item.sauced && item.cookState !== COOK_STATES.burnt) {
    ctx.fillStyle = "rgba(216, 247, 168, 0.62)";
    ctx.beginPath();
    ctx.ellipse(-width * 0.12, -height * 0.12, width * 0.14, height * 0.12, -0.35, 0, FULL_TURN);
    ctx.ellipse(width * 0.1, height * 0.1, width * 0.1, height * 0.08, 0.28, 0, FULL_TURN);
    ctx.fill();
    ctx.fillStyle = "#3f8f39";
    ctx.beginPath();
    ctx.arc(-width * 0.28, height * 0.2, 3.2 * scale, 0, FULL_TURN);
    ctx.arc(width * 0.18, -height * 0.2, 2.8 * scale, 0, FULL_TURN);
    ctx.fill();
  }

  ctx.fillStyle = visual.bone;
  ctx.strokeStyle = "#172025";
  ctx.beginPath();
  ctx.arc(boneX, boneY, jointRadius, 0, FULL_TURN);
  ctx.arc(nubX, nubY, nubRadius, 0, FULL_TURN);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  drawItemLabel(ctx, item, x, y + height / 2 + 11 * scale, scale);
}

function drawHeldItemFallback(ctx, item, x, y, scale = 1) {
  drawHeldItem(ctx, item, x, y, null, scale);
}

function drawLegIcon(ctx, kind, x, y, scale = 1, cookState = "raw") {
  const item = { kind, cookState, label: null };
  drawHeldItem(ctx, item, x, y, null, scale);
}

function drawItemLabel(ctx, item, x, y, scale) {
  if (!item.label) {
    return;
  }

  const text = labelText(item.label);
  ctx.save();
  ctx.font = `${Math.round(12 * scale)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0, 0, 0, 0.58)";
  drawRoundRect(ctx, x - 18 * scale, y - 8 * scale, 36 * scale, 16 * scale, 4 * scale);
  ctx.fill();
  ctx.fillStyle = "#fff7dc";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawFeedback(ctx, state, width, height) {
  const text = state.feedback?.text;
  if (!text) {
    return;
  }

  const toneColor = FEEDBACK_VISUALS[state.feedback.tone]?.fill ?? FEEDBACK_VISUALS.neutral.fill;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
  drawRoundRect(ctx, width / 2 - 300, height - 52, 600, 34, 9);
  ctx.fill();
  ctx.fillStyle = toneColor;
  ctx.fillText(text, width / 2, height - 35);
  ctx.restore();
}

function getCookProgress(item) {
  const elapsed = item.cookElapsed ?? 0;
  if (item.cookState === COOK_STATES.burnt) {
    return 1;
  }

  return Math.max(0.08, Math.min(1, elapsed / 8_000));
}

function getCookColor(cookState) {
  if (cookState === COOK_STATES.cooked) {
    return "#f1c66d";
  }

  if (cookState === COOK_STATES.burnt) {
    return "#111111";
  }

  return "#c9ced3";
}

function getCookLabel(cookState) {
  if (cookState === COOK_STATES.cooked) {
    return "熟";
  }

  if (cookState === COOK_STATES.burnt) {
    return "焦";
  }

  return "烤";
}

function getItemColor(item) {
  const visual = getItemVisual(item.kind);

  if (item.cookState === COOK_STATES.burnt) {
    return visual.burntFill;
  }

  if (item.sauced) {
    return visual.saucedFill;
  }

  if (item.cookState === COOK_STATES.cooked) {
    return visual.cookedFill;
  }

  return visual.fill;
}

function drawImageFit(ctx, image, x, y, width, height) {
  const ratio = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * ratio;
  const drawHeight = image.height * ratio;

  ctx.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function drawRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawLine(ctx, startX, startY, endX, endY) {
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();
}

function lightenHex(hex, amount) {
  const raw = hex.replace("#", "");
  const number = Number.parseInt(raw, 16);
  const r = Math.min(255, ((number >> 16) & 255) + amount);
  const g = Math.min(255, ((number >> 8) & 255) + amount);
  const b = Math.min(255, (number & 255) + amount);

  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
