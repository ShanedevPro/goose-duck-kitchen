import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const RAW_DIR = join(process.cwd(), "assets", "raw", "premium");
const OUTPUT_DIR = join(process.cwd(), "assets", "game");
const BACKGROUND_INPUT = join(RAW_DIR, "kitchen-bg-premium.png");
const BACKGROUND_OUTPUT = join(OUTPUT_DIR, "kitchen-bg-premium.png");
const SPRITE_INPUT = join(RAW_DIR, "premium-sprite-sheet.png");
const CONTACT_SHEET = join(OUTPUT_DIR, "premium-contact-sheet.png");
const GRID_SIZE = 4;
const TRIM_PADDING = 10;
const GRID_LINE_MARGIN = 8;
const CONTACT_CELL_SIZE = 256;

const SPRITE_IDS = [
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

const FALLBACK_PREMIUM_MAPPING = {
  "chef-idle": "player-pku",
  "chef-walk-a": "player-pku",
  "chef-walk-b": "player-pku",
  "chef-carry-goose": "player-pku",
  "chef-carry-duck": "player-pku",
  "chef-carry-cooked": "player-pku",
  "goose-raw-premium": "goose-raw",
  "duck-raw-premium": "duck-raw",
  "goose-cooked-premium": "goose-cooked",
  "duck-cooked-premium": "duck-cooked",
  "leg-burnt-premium": "leg-burnt",
};

const FALLBACK_EFFECT_IDS = new Set(["station-glow", "success-pop", "wrong-pop", "tap-ring-premium", "steam-puff"]);

function chromaKeyGreen(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (g > 180 && r < 90 && b < 90) {
      data[i + 3] = 0;
    }
  }

  return data;
}

function clearGridLineEdges(data, width, height) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x < GRID_LINE_MARGIN ||
        y < GRID_LINE_MARGIN ||
        x >= width - GRID_LINE_MARGIN ||
        y >= height - GRID_LINE_MARGIN
      ) {
        data[(y * width + x) * 4 + 3] = 0;
      }
    }
  }

  return data;
}

function findOpaqueBounds(data, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha === 0) {
        continue;
      }

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  left = Math.max(0, left - TRIM_PADDING);
  top = Math.max(0, top - TRIM_PADDING);
  right = Math.min(width - 1, right + TRIM_PADDING);
  bottom = Math.min(height - 1, bottom + TRIM_PADDING);

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

async function prepareBackground() {
  await sharp(BACKGROUND_INPUT)
    .resize({
      width: 1080,
      height: 1920,
      fit: "cover",
      position: "center",
    })
    .png()
    .toFile(BACKGROUND_OUTPUT);

  console.log(`Wrote ${BACKGROUND_OUTPUT}`);
}

async function isExistingSheetFallback() {
  try {
    const metadata = JSON.parse(await readFile(join(RAW_DIR, "premium-sprite-sheet.json"), "utf8"));
    return metadata?.fallback === "existing-image2-sheet";
  } catch {
    return false;
  }
}

function validateSpriteSheet(sheet) {
  if (!sheet.width || !sheet.height) {
    throw new Error("Premium sprite sheet metadata is missing width or height.");
  }

  if (sheet.width < 512 || sheet.height < 512) {
    throw new Error(`Premium sprite sheet must be at least 512x512; got ${sheet.width}x${sheet.height}.`);
  }

  const minGridDimension = GRID_SIZE * 64;
  if (sheet.width < minGridDimension || sheet.height < minGridDimension) {
    throw new Error(
      `Premium sprite sheet is too small for a ${GRID_SIZE}x${GRID_SIZE} split; got ${sheet.width}x${sheet.height}.`,
    );
  }
}

async function processCell(sheet, id, index, cellWidth, cellHeight, { writeOutput = true } = {}) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const left = col * cellWidth;
  const top = row * cellHeight;
  const width = col === GRID_SIZE - 1 ? sheet.width - left : cellWidth;
  const height = row === GRID_SIZE - 1 ? sheet.height - top : cellHeight;

  const { data, info } = await sharp(SPRITE_INPUT)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const keyedData = clearGridLineEdges(chromaKeyGreen(data), info.width, info.height);
  const bounds = findOpaqueBounds(keyedData, info.width, info.height);
  if (!bounds) {
    throw new Error(`No opaque pixels found for ${id}.`);
  }

  const outputBuffer = await sharp(keyedData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .extract(bounds)
    .png()
    .toBuffer();

  const outputPath = join(OUTPUT_DIR, `${id}.png`);
  if (writeOutput) {
    await writeFile(outputPath, outputBuffer);
  }

  return { id, outputBuffer, outputPath };
}

function svgBuffer(markup) {
  return Buffer.from(markup);
}

async function createFallbackEffect(id) {
  const effects = {
    "station-glow": `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs><radialGradient id="g"><stop offset="0" stop-color="#ffd86b" stop-opacity="0.72"/><stop offset="0.62" stop-color="#ffb33d" stop-opacity="0.28"/><stop offset="1" stop-color="#ffb33d" stop-opacity="0"/></radialGradient></defs>
      <ellipse cx="128" cy="136" rx="104" ry="58" fill="url(#g)"/>
      <ellipse cx="128" cy="136" rx="78" ry="38" fill="none" stroke="#ffd66b" stroke-width="10" opacity="0.62"/>
    </svg>`,
    "success-pop": `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <path d="M128 24 145 75 194 45 171 99 230 104 178 136 218 180 158 171 151 232 121 180 77 222 86 162 26 169 73 130 24 97 84 95 66 38 114 74Z" fill="#ffc94d" opacity="0.9"/>
      <path d="M78 132 111 165 181 91" fill="none" stroke="#fff6c7" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M78 132 111 165 181 91" fill="none" stroke="#bb6b17" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.55"/>
    </svg>`,
    "wrong-pop": `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <path d="M128 25 154 76 209 58 186 112 235 144 179 154 187 213 139 178 96 221 90 162 32 154 80 121 48 72 105 83Z" fill="#f46b3f" opacity="0.92"/>
      <path d="M91 91 165 165 M165 91 91 165" fill="none" stroke="#fff1d0" stroke-width="20" stroke-linecap="round"/>
      <path d="M91 91 165 165 M165 91 91 165" fill="none" stroke="#8f2d22" stroke-width="8" stroke-linecap="round" opacity="0.58"/>
    </svg>`,
    "tap-ring-premium": `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <circle cx="128" cy="128" r="88" fill="none" stroke="#ffe08a" stroke-width="18" opacity="0.72"/>
      <circle cx="128" cy="128" r="62" fill="none" stroke="#ffffff" stroke-width="8" opacity="0.38"/>
      <circle cx="128" cy="128" r="103" fill="none" stroke="#ffb347" stroke-width="8" opacity="0.28"/>
    </svg>`,
    "steam-puff": `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <path d="M85 172c-24-18-18-42 1-57 16-13 22-29 6-49" fill="none" stroke="#ffffff" stroke-width="24" stroke-linecap="round" opacity="0.58"/>
      <path d="M131 181c-30-22-22-50 2-68 19-15 27-34 7-58" fill="none" stroke="#ffffff" stroke-width="28" stroke-linecap="round" opacity="0.66"/>
      <path d="M178 171c-22-17-15-39 3-54 14-12 18-26 3-44" fill="none" stroke="#ffffff" stroke-width="22" stroke-linecap="round" opacity="0.5"/>
    </svg>`,
  };

  const outputBuffer = await sharp(svgBuffer(effects[id])).png().toBuffer();
  const outputPath = join(OUTPUT_DIR, `${id}.png`);
  await writeFile(outputPath, outputBuffer);

  return { id, outputBuffer, outputPath };
}

async function writeContactSheet(cells) {
  const composites = await Promise.all(
    cells.map(async ({ outputBuffer }, index) => {
      const resized = await sharp(outputBuffer)
        .resize({
          width: CONTACT_CELL_SIZE - 32,
          height: CONTACT_CELL_SIZE - 32,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      const metadata = await sharp(resized).metadata();

      return {
        input: resized,
        left: (index % GRID_SIZE) * CONTACT_CELL_SIZE + Math.round((CONTACT_CELL_SIZE - metadata.width) / 2),
        top: Math.floor(index / GRID_SIZE) * CONTACT_CELL_SIZE + Math.round((CONTACT_CELL_SIZE - metadata.height) / 2),
      };
    }),
  );

  await sharp({
    create: {
      width: GRID_SIZE * CONTACT_CELL_SIZE,
      height: GRID_SIZE * CONTACT_CELL_SIZE,
      channels: 4,
      background: { r: 245, g: 242, b: 232, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(CONTACT_SHEET);

  console.log(`Wrote ${CONTACT_SHEET}`);
}

async function processCellsByIds(ids, { writeOutputs = true } = {}) {
  const sheet = await sharp(SPRITE_INPUT).metadata();
  validateSpriteSheet(sheet);

  const cellWidth = Math.floor(sheet.width / GRID_SIZE);
  const cellHeight = Math.floor(sheet.height / GRID_SIZE);

  const cellsById = new Map();
  for (const [index, id] of ids.entries()) {
    const cell = await processCell(sheet, id, index, cellWidth, cellHeight, { writeOutput: writeOutputs });
    cellsById.set(id, cell);
    if (writeOutputs) {
      console.log(`Wrote ${cell.outputPath}`);
    }
  }

  return cellsById;
}

async function prepareFallbackSprites() {
  const sourceCells = await processCellsByIds(FALLBACK_SOURCE_IDS, { writeOutputs: false });
  const cells = [];

  for (const id of SPRITE_IDS) {
    let cell;
    if (FALLBACK_EFFECT_IDS.has(id)) {
      cell = await createFallbackEffect(id);
    } else {
      const sourceId = FALLBACK_PREMIUM_MAPPING[id];
      const sourceCell = sourceCells.get(sourceId);
      if (!sourceCell) {
        throw new Error(`Missing fallback source cell ${sourceId} for ${id}.`);
      }

      const outputPath = join(OUTPUT_DIR, `${id}.png`);
      await writeFile(outputPath, sourceCell.outputBuffer);
      cell = { id, outputBuffer: sourceCell.outputBuffer, outputPath };
    }

    cells.push(cell);
    console.log(`Wrote ${cell.outputPath}`);
  }

  await writeContactSheet(cells);
}

async function prepareSprites() {
  if (await isExistingSheetFallback()) {
    await prepareFallbackSprites();
    return;
  }

  const cellsById = await processCellsByIds(SPRITE_IDS);
  await writeContactSheet(SPRITE_IDS.map((id) => cellsById.get(id)));
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await prepareBackground();
  await prepareSprites();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
