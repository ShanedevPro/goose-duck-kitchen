import { access, readFile, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { Buffer } from "node:buffer";
import { basename, join } from "node:path";

const MODEL = "gpt-image-2";
const SIZE = "1536x1536";
const DEFAULT_REFERENCE_IMAGE = "assets/concepts/mobile-kitchen-reference-v2-2026-06-11T04-29-53-914Z.png";
const REFERENCE_IMAGE = process.env.ASSET_REFERENCE_IMAGE || DEFAULT_REFERENCE_IMAGE;
const OUTPUT_DIR = join(process.cwd(), "assets", "raw", "sheets");
const OUTPUT_IMAGE = join(OUTPUT_DIR, "mobile-objects-sheet.png");
const OUTPUT_METADATA = join(OUTPUT_DIR, "mobile-objects-sheet.json");
const REQUEST_TIMEOUT_MS = 120_000;
const RETRY_DELAYS_MS = [15_000, 30_000, 45_000];

const PROMPT = `Create one square 4 by 4 game asset sheet for a portrait mobile cooking game. Use clean premium cartoon 2D sticker art, top-down/isometric hybrid, soft outlines, warm kitchen colors, and the same mood as the provided reference image. Each cell must contain exactly one centered isolated asset on a perfectly flat solid #00ff00 chroma key background. Keep every cell separated by clear thin dark grid lines. No readable text, no watermark, no logo.

Cell order left to right, top to bottom:
1 player-pku: cheerful student chef character, subtle Yan Yuan red apron, no official university logo or school name
2 goose-raw: raw goose leg
3 duck-raw: raw duck leg, visibly different and slightly smaller
4 goose-cooked: golden roasted goose leg
5 duck-cooked: golden roasted duck leg, slightly smaller
6 leg-burnt: dark burnt poultry leg
7 goose-fridge: compact ingredient fridge with warm goose-side color accent, no text
8 duck-fridge: compact ingredient fridge with teal duck-side color accent, no text
9 grill-empty: small street-food grill station
10 grill-cooking: same grill with glowing coals and small flame
11 goose-label: label station with red/goose visual cue but no readable text
12 duck-label: label station with teal/duck visual cue but no readable text
13 serve-counter: small serving counter/window
14 trash-bin: cute kitchen trash bin
15 notice-board: compact notice board, no readable text
16 order-bell: small counter bell`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEndpoint() {
  const baseUrl = process.env.IMAGE_BASE_URL || "https://otokapi.com/v1";
  return `${baseUrl.replace(/\/+$/, "")}/images/edits`;
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

async function createImageBlob(path) {
  const bytes = await readFile(path);
  return new Blob([bytes], { type: "image/png" });
}

async function assertReferenceImageReadable() {
  try {
    await access(REFERENCE_IMAGE, constants.R_OK);
  } catch {
    throw new Error(
      `Missing reference image at ${REFERENCE_IMAGE}. Set ASSET_REFERENCE_IMAGE=/path/to/reference.png or restore the local concept image.`,
    );
  }
}

async function fetchImageEdit(endpoint, apiKey, formData) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function postImageEdit(endpoint, apiKey) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const formData = new FormData();
    formData.set("model", MODEL);
    formData.set("size", SIZE);
    formData.set("prompt", PROMPT);
    formData.set("image", await createImageBlob(REFERENCE_IMAGE), basename(REFERENCE_IMAGE));

    try {
      const response = await fetchImageEdit(endpoint, apiKey, formData);

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

async function main() {
  const apiKey = process.env.CODEX_API_KEY;
  if (!apiKey) {
    console.error("Missing CODEX_API_KEY; cannot generate mobile asset sheet.");
    process.exitCode = 1;
    return;
  }

  await assertReferenceImageReadable();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const endpoint = getEndpoint();
  const response = await postImageEdit(endpoint, apiKey);
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || response.statusText;
    throw new Error(`Image API request failed: HTTP ${response.status} ${message}`);
  }

  const image = payload?.data?.[0];
  if (!image?.b64_json) {
    throw new Error("Image API response did not include data[0].b64_json.");
  }

  await writeFile(OUTPUT_IMAGE, Buffer.from(image.b64_json, "base64"));
  await writeFile(
    OUTPUT_METADATA,
    `${JSON.stringify(
      {
        model: MODEL,
        size: SIZE,
        prompt: PROMPT,
        referenceImage: REFERENCE_IMAGE,
        endpoint,
        createdAt: new Date().toISOString(),
        revisedPrompt: image.revised_prompt ?? null,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote ${OUTPUT_IMAGE}`);
  console.log(`Wrote ${OUTPUT_METADATA}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
