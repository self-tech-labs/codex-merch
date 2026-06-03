import {readFile} from 'node:fs/promises';
import path from 'node:path';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const DEFAULT_PHOTOSHOOT_MODEL = 'gpt-image-1.5';

export function requireOpenAIEnv(env = process.env) {
  if (!env.OPENAI_API_KEY) {
    throw new Error('Missing required env var: OPENAI_API_KEY');
  }

  return {apiKey: env.OPENAI_API_KEY};
}

export function buildImagePrompt({brief, textLayer, productKind}) {
  return [
    `Create original raster artwork for ${productKind}.`,
    brief,
    'Do not include official logos, public-figure likenesses, screenshots, or trademarked marks.',
    'Leave slogans and exact lettering for the deterministic local text layer.',
    `Local text layer: ${textLayer}`,
  ].join(' ');
}

export function buildImageGenerationRequest({
  prompt,
  size = '2048x2048',
  quality = 'high',
} = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('OpenAI image prompt is required');
  }

  return {
    model: 'gpt-image-2',
    prompt: String(prompt).trim(),
    size,
    quality,
    output_format: 'png',
    moderation: 'auto',
  };
}

export function buildImageEditRequest({
  prompt,
  model = DEFAULT_PHOTOSHOOT_MODEL,
  size = '1536x1024',
  quality = 'high',
  background = 'opaque',
  output_format = 'png',
  input_fidelity,
} = {}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('OpenAI image edit prompt is required');
  }

  return {
    model,
    prompt: String(prompt).trim(),
    size,
    quality,
    background,
    output_format,
    ...(input_fidelity ? {input_fidelity} : {}),
  };
}

export async function generateArtworkImage(input, env = process.env) {
  const {apiKey} = requireOpenAIEnv(env);
  const timeoutMs = Number(env.OPENAI_IMAGE_TIMEOUT_MS || 180000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(`${OPENAI_API_BASE}/images/generations`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildImageGenerationRequest(input)),
  }).catch((error) => {
    if (error?.name === 'AbortError') {
      throw new Error(`OpenAI image generation timed out after ${timeoutMs}ms`);
    }

    throw error;
  }).finally(() => {
    clearTimeout(timeout);
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI image generation failed (${response.status}): ${await response.text()}`,
    );
  }

  return response.json();
}

export async function generateEditedImage(input, env = process.env) {
  const {apiKey} = requireOpenAIEnv(env);
  const images = input?.images || [];
  if (!images.length) {
    throw new Error('OpenAI image edit requires at least one source image');
  }

  const timeoutMs = Number(env.OPENAI_IMAGE_TIMEOUT_MS || 180000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const request = buildImageEditRequest(input);
  const form = new FormData();

  for (const [key, value] of Object.entries(request)) {
    form.set(key, String(value));
  }

  for (const image of images) {
    const filePath = typeof image === 'string' ? image : image.path;
    if (!filePath) throw new Error('OpenAI image edit source is missing a path');
    const fileName =
      typeof image === 'string'
        ? path.basename(image)
        : image.name || path.basename(filePath);
    const mimeType =
      typeof image === 'string'
        ? imageMimeType(filePath)
        : image.mimeType || imageMimeType(filePath);
    const buffer =
      typeof image === 'string'
        ? await readFile(image)
        : image.buffer || await readFile(filePath);
    form.append('image[]', new File([buffer], fileName, {type: mimeType}));
  }

  const response = await fetch(`${OPENAI_API_BASE}/images/edits`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  }).catch((error) => {
    if (error?.name === 'AbortError') {
      throw new Error(`OpenAI image edit timed out after ${timeoutMs}ms`);
    }

    throw error;
  }).finally(() => {
    clearTimeout(timeout);
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI image edit failed (${response.status}): ${await response.text()}`,
    );
  }

  return response.json();
}

export function firstImageBase64(result) {
  const image = result?.data?.[0]?.b64_json;
  if (!image) throw new Error('OpenAI image response did not include b64_json');
  return image;
}

function imageMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'image/png';
}
