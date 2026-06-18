import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const INPUT_IMAGE = join(process.cwd(), "assets", "raw", "sheets", "mobile-objects-sheet.png");
const OUTPUT_DIR = join(process.cwd(), "assets", "game");
const CONTACT_SHEET = join(OUTPUT_DIR, "mobile-objects-contact-sheet.png");
const GRID_SIZE = 4;
const TRIM_PADDING = 10;
const GRID_LINE_MARGIN = 8;
const CONTACT_CELL_SIZE = 256;

const IDS = [
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

function hasTransparentNeighbor(data, width, height, x, y, radius) {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const neighborX = x + offsetX;
      const neighborY = y + offsetY;
      if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) {
        continue;
      }

      if (data[(neighborY * width + neighborX) * 4 + 3] === 0) {
        return true;
      }
    }
  }

  return false;
}

function cleanGreenResidue(data, width, height) {
  for (let pass = 0; pass < 8; pass += 1) {
    const alpha = new Uint8Array(width * height);

    for (let i = 0; i < alpha.length; i += 1) {
      alpha[i] = data[i * 4 + 3];
    }

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];

        if (a === 0 || !hasTransparentNeighbor(data, width, height, x, y, 1)) {
          continue;
        }

        const strongGreenResidue = g > 95 && r < 80 && b < 80 && g > r * 1.7 && g > b * 1.7;
        const darkMatteResidue = g > 60 && r < 60 && b < 20 && g > Math.max(r, b) * 1.2;

        if (strongGreenResidue || darkMatteResidue) {
          alpha[y * width + x] = 0;
        }
      }
    }

    for (let i = 0; i < alpha.length; i += 1) {
      data[i * 4 + 3] = alpha[i];
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      if (data[index + 3] === 0 || !hasTransparentNeighbor(data, width, height, x, y, 1)) {
        continue;
      }

      const maxRedBlue = Math.max(r, b);
      if (g > 60 && r < 60 && b < 20 && g > maxRedBlue * 1.2) {
        data[index + 1] = Math.max(maxRedBlue, Math.round(g * 0.25 + maxRedBlue * 0.75));
      }
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
    return { left: 0, top: 0, width, height };
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

async function processCell(sheet, id, index, cellWidth, cellHeight) {
  const row = Math.floor(index / GRID_SIZE);
  const col = index % GRID_SIZE;
  const left = col * cellWidth;
  const top = row * cellHeight;
  const width = col === GRID_SIZE - 1 ? sheet.width - left : cellWidth;
  const height = row === GRID_SIZE - 1 ? sheet.height - top : cellHeight;

  const { data, info } = await sharp(INPUT_IMAGE)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const keyedData = cleanGreenResidue(clearGridLineEdges(chromaKeyGreen(data), info.width, info.height), info.width, info.height);
  const bounds = findOpaqueBounds(keyedData, info.width, info.height);

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
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const sheet = await sharp(INPUT_IMAGE).metadata();
  const cellWidth = Math.floor(sheet.width / GRID_SIZE);
  const cellHeight = Math.floor(sheet.height / GRID_SIZE);

  const cells = [];
  for (const [index, id] of IDS.entries()) {
    const cell = await processCell(sheet, id, index, cellWidth, cellHeight);
    cells.push(cell);
    console.log(`Wrote ${cell.outputPath}`);
  }

  await writeFile(join(OUTPUT_DIR, "manifest.json"), `${JSON.stringify(IDS, null, 2)}\n`);
  await writeContactSheet(cells);

  console.log(`Wrote ${join(OUTPUT_DIR, "manifest.json")}`);
  console.log(`Wrote ${CONTACT_SHEET}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
