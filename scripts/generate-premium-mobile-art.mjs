import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import sharp from "sharp";

const MODEL = "gpt-image-2";
const BACKGROUND_SIZE = process.env.IMAGE_BACKGROUND_SIZE || "1024x1536";
const SPRITE_SIZE = process.env.IMAGE_SPRITE_SIZE || "1536x1536";
const OUTPUT_DIR = join(process.cwd(), "assets", "raw", "premium");
const FALLBACK_REASON = "image2 provider unavailable: HTTP 503 No available compatible accounts";
const FALLBACK_SOURCE_DIR = join(process.cwd(), "assets", "game");
const FALLBACK_CELL_SIZE = 384;
const FALLBACK_SHEET_SIZE = 1536;
const REQUEST_TIMEOUT_MS = 120_000;
const RETRY_DELAYS_MS = [15_000, 30_000, 45_000];

const BACKGROUND_PROMPT = `Portrait 9:16 mobile cooking game background, polished cartoon 2D illustration, warm night food-stall kitchen, wood counters and soft lantern lighting, clear empty central walking floor, mobile game composition, premium casual game style. Arrange stations so they are obvious but leave space for dynamic code-native labels: left upper side has two stacked ingredient fridges for goose and duck, center lower side has two grills, right upper side has two stacked label-printer counters, bottom center has a serving counter, bottom left has a small notice board, bottom right has a cute trash bin. Use red/gold accents for goose-side objects and teal accents for duck-side objects. No readable text, no logos, no watermark, no people, no UI numbers, no speech bubbles. Keep important objects away from the bottom 150 pixels so a native order dock can sit below the Canvas.`;

const SPRITE_PROMPT = `Create one square 4 by 4 sprite sheet for a portrait mobile cooking game. Use the same premium cartoon 2D style as the background: soft outlines, warm kitchen palette, compact mobile-game assets, clean silhouettes. Each cell contains exactly one centered isolated asset on a perfectly flat solid #00ff00 chroma-key background, with thin dark grid lines between cells. No readable text, no logos, no watermark.

Cell order left to right, top to bottom:
1 chef-idle: small cheerful student chef, red-white apron with subtle campus color cues, no official logo or school name
2 chef-walk-a: same chef, first walking frame
3 chef-walk-b: same chef, second walking frame
4 chef-carry-goose: same chef carrying a goose leg
5 chef-carry-duck: same chef carrying a duck leg
6 chef-carry-cooked: same chef carrying a golden cooked poultry leg
7 goose-raw-premium: raw goose leg, larger and red-gold cue
8 duck-raw-premium: raw duck leg, slightly smaller and teal cue
9 goose-cooked-premium: roasted goose leg, golden and larger
10 duck-cooked-premium: roasted duck leg, golden and slightly smaller
11 leg-burnt-premium: burnt poultry leg with dark crispy edges
12 station-glow: soft circular golden station highlight ring
13 success-pop: small celebratory burst with checkmark-like shape but no text
14 wrong-pop: small warning burst with cross-like shape but no text
15 tap-ring-premium: soft touch target ring
16 steam-puff: small centered isolated steam puff effect`;

const FALLBACK_SOURCE_IDS = [
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEndpoint() {
  const baseUrl = process.env.IMAGE_BASE_URL || "https://otokapi.com/v1";
  return `${baseUrl.replace(/\/+$/, "")}/images/generations`;
}

function shouldRetryResponse(response) {
  return response.status === 429 || (response.status >= 500 && response.status <= 599);
}

function getRetryReason(response, error) {
  if (response) {
    return `HTTP ${response.status}`;
  }

  if (error?.name === "AbortError") {
    return "request timeout";
  }

  return "network error";
}

async function fetchImageGeneration(endpoint, apiKey, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function postImageGeneration(endpoint, apiKey, body) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetchImageGeneration(endpoint, apiKey, body);

      if (!shouldRetryResponse(response) || attempt === RETRY_DELAYS_MS.length) {
        return response;
      }

      const waitMs = RETRY_DELAYS_MS[attempt];
      console.error(`${getRetryReason(response)} received; retrying in ${waitMs / 1000}s.`);
      await response.body?.cancel();
      await sleep(waitMs);
    } catch (error) {
      if (attempt === RETRY_DELAYS_MS.length) {
        throw new Error(`Image API request failed after retries: ${getRetryReason(null, error)}.`);
      }

      const waitMs = RETRY_DELAYS_MS[attempt];
      console.error(`${getRetryReason(null, error)}; retrying in ${waitMs / 1000}s.`);
      await sleep(waitMs);
    }
  }

  throw new Error("Unexpected retry state.");
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Image API returned invalid JSON with status ${response.status}.`);
  }
}

async function generateAsset({ apiKey, endpoint, prompt, size, imagePath, metadataPath }) {
  const response = await postImageGeneration(endpoint, apiKey, {
    model: MODEL,
    size,
    prompt,
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(`Image API request failed for ${imagePath}: HTTP ${response.status} ${message}`);
  }

  const image = payload?.data?.[0];
  if (!image?.b64_json) {
    throw new Error(`Image API response did not include data[0].b64_json for ${imagePath}.`);
  }

  await writeFile(imagePath, Buffer.from(image.b64_json, "base64"));
  await writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        model: MODEL,
        size,
        prompt,
        endpoint,
        createdAt: new Date().toISOString(),
        revisedPrompt: image.revised_prompt ?? null,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${imagePath}`);
  console.log(`Wrote ${metadataPath}`);
}

function svgElement(markup) {
  return Buffer.from(markup);
}

function rect({ x, y, width, height, fill, opacity = 1, stroke = "none", strokeWidth = 0, rx = 0 }) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${rx}" fill="${fill}" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function circle({ cx, cy, r, fill, opacity = 1 }) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`;
}

function path({ d, fill, opacity = 1, stroke = "none", strokeWidth = 0 }) {
  return `<path d="${d}" fill="${fill}" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function buildFallbackKitchenSvg() {
  const floorTiles = [];
  for (let y = 330; y < 1500; y += 150) {
    floorTiles.push(rect({ x: 0, y, width: 1080, height: 2, fill: "#b98d66", opacity: 0.2 }));
  }

  for (let x = -90; x < 1080; x += 180) {
    floorTiles.push(path({ d: `M ${x} 330 L ${x + 420} 1500`, stroke: "#b98d66", strokeWidth: 2, fill: "none", opacity: 0.14 }));
    floorTiles.push(path({ d: `M ${x + 420} 330 L ${x} 1500`, stroke: "#b98d66", strokeWidth: 2, fill: "none", opacity: 0.1 }));
  }

  // Match the 540x960 game station rectangles at 2x scale so the fallback
  // background aligns with the interactive Canvas hit zones.
  const stations = [
    rect({ x: 76, y: 252, width: 280, height: 208, fill: "#8f2f2a", rx: 22 }),
    rect({ x: 76, y: 540, width: 280, height: 208, fill: "#1d8b89", rx: 22 }),
    rect({ x: 404, y: 252, width: 272, height: 208, fill: "#a65c34", rx: 24 }),
    rect({ x: 144, y: 1200, width: 332, height: 232, fill: "#7a4630", rx: 18 }),
    rect({ x: 604, y: 1200, width: 332, height: 232, fill: "#7a4630", rx: 18 }),
    rect({ x: 724, y: 252, width: 280, height: 208, fill: "#9a4c2b", rx: 20 }),
    rect({ x: 724, y: 540, width: 280, height: 208, fill: "#287d83", rx: 20 }),
    rect({ x: 92, y: 1468, width: 208, height: 164, fill: "#8a6b3c", rx: 18 }),
    rect({ x: 780, y: 1468, width: 208, height: 164, fill: "#5f725e", rx: 22 }),
  ];

  const lanterns = [
    circle({ cx: 250, cy: 170, r: 92, fill: "#ffd890", opacity: 0.28 }),
    circle({ cx: 820, cy: 170, r: 92, fill: "#ffd890", opacity: 0.24 }),
    rect({ x: 220, y: 106, width: 60, height: 90, fill: "#df6250", opacity: 0.85, rx: 24 }),
    rect({ x: 790, y: 106, width: 60, height: 90, fill: "#df6250", opacity: 0.8, rx: 24 }),
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4b2e25"/>
      <stop offset="0.22" stop-color="#7b4a31"/>
      <stop offset="0.5" stop-color="#d8b07c"/>
      <stop offset="0.8" stop-color="#c98e55"/>
      <stop offset="1" stop-color="#69402d"/>
    </linearGradient>
    <radialGradient id="centerLight" cx="50%" cy="47%" r="58%">
      <stop offset="0" stop-color="#fff1c0" stop-opacity="0.52"/>
      <stop offset="0.62" stop-color="#f0bb74" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#3c241d" stop-opacity="0.24"/>
    </radialGradient>
  </defs>
  ${rect({ x: 0, y: 0, width: 1080, height: 1920, fill: "url(#bg)" })}
  ${rect({ x: 0, y: 0, width: 1080, height: 310, fill: "#5b3528", opacity: 0.96 })}
  ${rect({ x: 0, y: 1500, width: 1080, height: 420, fill: "#7a432d", opacity: 0.96 })}
  ${floorTiles.join("\n  ")}
  ${rect({ x: 145, y: 330, width: 790, height: 1160, fill: "#f2c786", opacity: 0.22, rx: 80 })}
  ${lanterns.join("\n  ")}
  ${circle({ cx: 540, cy: 880, r: 560, fill: "url(#centerLight)", opacity: 1 })}
  ${stations.join("\n  ")}
  ${rect({ x: 110, y: 316, width: 214, height: 38, fill: "#f2b451", opacity: 0.68, rx: 16 })}
  ${rect({ x: 110, y: 604, width: 214, height: 38, fill: "#6ce1d4", opacity: 0.55, rx: 16 })}
  ${circle({ cx: 310, cy: 1316, r: 54, fill: "#ffbd58", opacity: 0.48 })}
  ${circle({ cx: 770, cy: 1316, r: 54, fill: "#ffbd58", opacity: 0.44 })}
  ${rect({ x: 430, y: 316, width: 220, height: 38, fill: "#f2bf74", opacity: 0.56, rx: 16 })}
  ${rect({ x: 758, y: 316, width: 214, height: 38, fill: "#f4bc59", opacity: 0.6, rx: 14 })}
  ${rect({ x: 758, y: 604, width: 214, height: 38, fill: "#69ddd1", opacity: 0.52, rx: 14 })}
  ${circle({ cx: 196, cy: 1510, r: 32, fill: "#f1c46f", opacity: 0.42 })}
  ${circle({ cx: 884, cy: 1510, r: 38, fill: "#d9e5b3", opacity: 0.36 })}
  ${rect({ x: 36, y: 1730, width: 1008, height: 90, fill: "#3f2a23", opacity: 0.2, rx: 34 })}
</svg>`;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function buildFallbackSpriteCell(id) {
  const inputPath = join(FALLBACK_SOURCE_DIR, `${id}.png`);
  const resized = await sharp(inputPath)
    .resize({
      width: FALLBACK_CELL_SIZE - 64,
      height: FALLBACK_CELL_SIZE - 64,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(resized).metadata();

  return sharp({
    create: {
      width: FALLBACK_CELL_SIZE,
      height: FALLBACK_CELL_SIZE,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 },
    },
  })
    .composite([
      {
        input: resized,
        left: Math.round((FALLBACK_CELL_SIZE - metadata.width) / 2),
        top: Math.round((FALLBACK_CELL_SIZE - metadata.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

async function writeFallbackSpriteSheet(outputPath) {
  const composites = await Promise.all(
    FALLBACK_SOURCE_IDS.map(async (id, index) => ({
      input: await buildFallbackSpriteCell(id),
      left: (index % 4) * FALLBACK_CELL_SIZE,
      top: Math.floor(index / 4) * FALLBACK_CELL_SIZE,
    })),
  );

  await sharp({
    create: {
      width: FALLBACK_SHEET_SIZE,
      height: FALLBACK_SHEET_SIZE,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

async function generateLocalFallback() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const backgroundPath = join(OUTPUT_DIR, "kitchen-bg-premium.png");
  const backgroundMetadataPath = join(OUTPUT_DIR, "kitchen-bg-premium.json");
  const spritePath = join(OUTPUT_DIR, "premium-sprite-sheet.png");
  const spriteMetadataPath = join(OUTPUT_DIR, "premium-sprite-sheet.json");

  await sharp(svgElement(buildFallbackKitchenSvg())).png().toFile(backgroundPath);
  await writeJson(backgroundMetadataPath, {
    fallback: "procedural-local",
    reason: FALLBACK_REASON,
    size: "1080x1920",
    prompt: BACKGROUND_PROMPT,
    createdAt: new Date().toISOString(),
  });

  await writeFallbackSpriteSheet(spritePath);
  await writeJson(spriteMetadataPath, {
    fallback: "existing-image2-sheet",
    reason: FALLBACK_REASON,
    source: "assets/game committed fallback assets",
    sourceIds: FALLBACK_SOURCE_IDS,
    createdAt: new Date().toISOString(),
  });

  console.log(`Wrote ${backgroundPath}`);
  console.log(`Wrote ${backgroundMetadataPath}`);
  console.log(`Wrote ${spritePath}`);
  console.log(`Wrote ${spriteMetadataPath}`);
}

async function main() {
  if (process.env.PREMIUM_USE_LOCAL_FALLBACK === "1") {
    await generateLocalFallback();
    return;
  }

  const apiKey = process.env.CODEX_API_KEY;
  if (!apiKey) {
    console.error("Missing CODEX_API_KEY; cannot generate premium mobile art.");
    process.exitCode = 1;
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const endpoint = getEndpoint();
  await generateAsset({
    apiKey,
    endpoint,
    prompt: BACKGROUND_PROMPT,
    size: BACKGROUND_SIZE,
    imagePath: join(OUTPUT_DIR, "kitchen-bg-premium.png"),
    metadataPath: join(OUTPUT_DIR, "kitchen-bg-premium.json"),
  });
  await generateAsset({
    apiKey,
    endpoint,
    prompt: SPRITE_PROMPT,
    size: SPRITE_SIZE,
    imagePath: join(OUTPUT_DIR, "premium-sprite-sheet.png"),
    metadataPath: join(OUTPUT_DIR, "premium-sprite-sheet.json"),
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
