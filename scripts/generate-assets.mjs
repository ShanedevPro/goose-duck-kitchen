import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { join } from "node:path";

const MODEL = "gpt-image-2";
const OUTPUT_DIR = join(process.cwd(), "assets", "raw");
const GAME_OUTPUT_DIR = join(process.cwd(), "assets", "game");
const REQUEST_TIMEOUT_MS = 120_000;
const RETRY_DELAYS_MS = [15_000, 30_000, 45_000];

const ASSET_PROMPTS = {
  "player": "A single 2D top-down browser game chef character, cute sticker style, small apron, simple warm colors, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no text, no watermark, no shadow.",
  "goose-leg": "A single 2D top-down game asset of a raw goose leg, cute sticker style, clean outline, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no text, no watermark, no shadow.",
  "duck-leg": "A single 2D top-down game asset of a raw duck leg, slightly smaller than goose leg, cute sticker style, clean outline, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no text, no watermark, no shadow.",
  "cooked-leg": "A single 2D top-down game asset of a golden roasted poultry leg, glossy but simple sticker style, clean outline, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no text, no watermark, no shadow.",
  "burnt-leg": "A single 2D top-down game asset of a burnt dark roasted poultry leg, cute sticker style, clean outline, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no text, no watermark, no shadow.",
  "fridge": "A single 2D top-down game asset of a compact ingredient fridge or cold cabinet, cute kitchen game style, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no text, no watermark, no shadow.",
  "grill": "A single 2D top-down game asset of a small street-food grill station with warm coals, cute kitchen game style, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no text, no watermark, no shadow.",
  "label-table": "A single 2D top-down game asset of a small labeling table with stamp pad and blank tags, cute kitchen game style, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no readable text, no watermark, no shadow.",
  "serve-window": "A single 2D top-down game asset of a street-food serving window counter, cute kitchen game style, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no readable text, no watermark, no shadow.",
  "notice-board": "A single 2D top-down game asset of a small public notice board for a food stall, cute kitchen game style, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no readable text, no watermark, no shadow.",
  "trash": "A single 2D top-down game asset of a small kitchen trash bin, cute game style, centered isolated object, perfectly flat solid #00ff00 chroma-key background, no text, no watermark, no shadow."
};

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
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function postImageGeneration(endpoint, apiKey, prompt) {
  const body = {
    model: MODEL,
    prompt,
    quality: "low",
    size: "1024x1024",
    n: 1
  };

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

async function generateAsset(endpoint, apiKey, id, prompt) {
  console.log(`Generating ${id}.png`);

  const response = await postImageGeneration(endpoint, apiKey, prompt);
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(`Image API request failed for ${id}: HTTP ${response.status} ${message}`);
  }

  const image = payload?.data?.[0];
  if (!image?.b64_json) {
    throw new Error(`Image API response for ${id} did not include data[0].b64_json.`);
  }

  const filename = `${id}.png`;
  await writeFile(join(OUTPUT_DIR, filename), Buffer.from(image.b64_json, "base64"));

  const manifestEntry = {
    id,
    prompt,
    model: MODEL,
    createdAt: new Date().toISOString(),
    raw: filename
  };

  if (image.revised_prompt) {
    manifestEntry.revised_prompt = image.revised_prompt;
  }

  return manifestEntry;
}

async function main() {
  const apiKey = process.env.CODEX_API_KEY;
  if (!apiKey) {
    console.error("Missing CODEX_API_KEY; cannot generate image assets.");
    process.exitCode = 1;
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(GAME_OUTPUT_DIR, { recursive: true });

  const endpoint = getEndpoint();
  const manifest = [];

  for (const [id, prompt] of Object.entries(ASSET_PROMPTS)) {
    const entry = await generateAsset(endpoint, apiKey, id, prompt);
    manifest.push(entry);
  }

  await writeFile(
    join(OUTPUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await writeFile(
    join(GAME_OUTPUT_DIR, "manifest.json"),
    `${JSON.stringify(manifest.map((entry) => entry.id), null, 2)}\n`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
