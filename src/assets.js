export const ASSET_IDS = Object.freeze({
  kitchenBgPremium: "kitchen-bg-premium",
  chefIdle: "chef-idle",
  chefWalkA: "chef-walk-a",
  chefWalkB: "chef-walk-b",
  chefCarryGoose: "chef-carry-goose",
  chefCarryDuck: "chef-carry-duck",
  chefCarryCooked: "chef-carry-cooked",
  gooseRawPremium: "goose-raw-premium",
  duckRawPremium: "duck-raw-premium",
  gooseCookedPremium: "goose-cooked-premium",
  duckCookedPremium: "duck-cooked-premium",
  legBurntPremium: "leg-burnt-premium",
  stationGlow: "station-glow",
  successPop: "success-pop",
  wrongPop: "wrong-pop",
  tapRingPremium: "tap-ring-premium",
  steamPuff: "steam-puff",
  playerPku: "player-pku",
  gooseRaw: "goose-raw",
  duckRaw: "duck-raw",
  gooseCooked: "goose-cooked",
  duckCooked: "duck-cooked",
  legBurnt: "leg-burnt",
  gooseFridge: "goose-fridge",
  duckFridge: "duck-fridge",
  grillEmpty: "grill-empty",
  grillCooking: "grill-cooking",
  gooseLabel: "goose-label",
  duckLabel: "duck-label",
  serveCounter: "serve-counter",
  trashBin: "trash-bin",
  noticeBoard: "notice-board",
  orderBell: "order-bell",
  hudScore: "hud-score",
  hudTrust: "hud-trust",
  hudTime: "hud-time",
  orderCard: "order-card",
  currentPanel: "current-panel",
  nextPanel: "next-panel",
  successBurst: "success-burst",
  warningBadge: "warning-badge",
  fire1: "fire-1",
  fire2: "fire-2",
  cookedGlow: "cooked-glow",
  burntSmoke: "burnt-smoke",
  tapRing: "tap-ring",
  pathArrow: "path-arrow",
  checkIcon: "check-icon",
  wrongIcon: "wrong-icon",
});

const ASSET_MANIFEST_PATH = "./assets/game/manifest.json";

export async function loadAssets() {
  const entries = await loadAssetManifest();
  const loaded = new Map();

  await Promise.all(
    entries.map(async (id) => {
      const image = new Image();
      image.src = `./assets/game/${id}.png`;

      try {
        await image.decode();
        loaded.set(id, image);
      } catch {
        loaded.set(id, null);
      }
    }),
  );

  return loaded;
}

export function getAsset(assets, id) {
  return assets?.get(id) ?? null;
}

async function loadAssetManifest() {
  try {
    const response = await fetch(ASSET_MANIFEST_PATH, { cache: "no-cache" });

    if (!response.ok) {
      return [];
    }

    const manifest = await response.json();
    const ids = Array.isArray(manifest)
      ? manifest
      : Array.isArray(manifest.assets)
        ? manifest.assets
        : [];

    return ids.filter((id) => Object.values(ASSET_IDS).includes(id));
  } catch {
    return [];
  }
}
