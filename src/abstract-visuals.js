export const ABSTRACT_STYLE_VERSION = "tabletop-v1";

export const STATION_VISUALS = Object.freeze({
  gooseFridge: Object.freeze({
    role: "goose",
    label: "鹅柜",
    icon: "goose-card",
    fill: "#c94b42",
    accent: "#ffd166",
    ink: "#fff7df",
    shadow: "#6d2724",
  }),
  duckFridge: Object.freeze({
    role: "duck",
    label: "鸭柜",
    icon: "duck-card",
    fill: "#229c96",
    accent: "#ffb35c",
    ink: "#f4fffb",
    shadow: "#0f5757",
  }),
  grillA: Object.freeze({
    role: "grill",
    label: "烤A",
    icon: "grill",
    fill: "#3b3130",
    accent: "#f5bd4f",
    ink: "#fff2c7",
    shadow: "#161312",
  }),
  grillB: Object.freeze({
    role: "grill",
    label: "烤B",
    icon: "grill",
    fill: "#3b3130",
    accent: "#f5bd4f",
    ink: "#fff2c7",
    shadow: "#161312",
  }),
  gooseLabel: Object.freeze({
    role: "goose",
    label: "鹅标",
    icon: "stamp-goose",
    fill: "#b83f39",
    accent: "#ffe0a3",
    ink: "#fff7df",
    shadow: "#67231f",
  }),
  duckLabel: Object.freeze({
    role: "duck",
    label: "鸭标",
    icon: "stamp-duck",
    fill: "#167f7b",
    accent: "#ffd29c",
    ink: "#f4fffb",
    shadow: "#0d4b4b",
  }),
  serveWindow: Object.freeze({
    role: "serve",
    label: "出餐",
    icon: "tray",
    fill: "#d59a37",
    accent: "#fff0bd",
    ink: "#3d2411",
    shadow: "#7f4f1d",
  }),
  sauceStation: Object.freeze({
    role: "utility",
    label: "绿汁",
    icon: "sauce",
    fill: "#4f9b45",
    accent: "#d8f7a8",
    ink: "#fff8e8",
    shadow: "#28542a",
  }),
  trash: Object.freeze({
    role: "utility",
    label: "回收",
    icon: "trash",
    fill: "#697476",
    accent: "#e9f0df",
    ink: "#f7fbf4",
    shadow: "#353d3f",
  }),
});

export const ITEM_VISUALS = Object.freeze({
  goose: Object.freeze({
    label: "鹅腿",
    fill: "#f29b64",
    cookedFill: "#f4b44d",
    saucedFill: "#72bf55",
    burntFill: "#3b2824",
    bone: "#fff0c8",
    width: 48,
    height: 30,
  }),
  duck: Object.freeze({
    label: "鸭腿",
    fill: "#d8704f",
    cookedFill: "#d88732",
    saucedFill: "#6fbe50",
    burntFill: "#332421",
    bone: "#fff0c8",
    width: 40,
    height: 26,
  }),
});

export const FEEDBACK_VISUALS = Object.freeze({
  good: Object.freeze({ fill: "#78c66b", ink: "#10220e" }),
  bad: Object.freeze({ fill: "#e56255", ink: "#2a0e0a" }),
  neutral: Object.freeze({ fill: "#f5bd4f", ink: "#2f1c0b" }),
});

export function getStationVisual(stationId) {
  return STATION_VISUALS[stationId] ?? STATION_VISUALS.sauceStation;
}

export function getItemVisual(kind) {
  return ITEM_VISUALS[kind] ?? ITEM_VISUALS.goose;
}
