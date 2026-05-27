#!/usr/bin/env node
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readProducts} from './merch.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const copyBySlug = {
  'rate-limit-reset-long-sleeve': ['RATE LIMIT', 'RESET', '200 OK'],
  'gpt-55-mode-crewneck': ['GPT-5.5', 'MODE', 'SPECULATIVE'],
  'context-window-tote': ['CONTEXT', 'WINDOW', '128K?'],
  'merge-conflict-cap': ['MERGE', 'CONFLICT', '<<<<<<<'],
  'latency-hoodie': ['LATENCY', 'P99', 'WORTH IT'],
  'codex-sticker-pack': ['CODEX', 'STICKERS', 'SHIP IT'],
};

function svg(product, angle) {
  const [line1, line2, line3] = copyBySlug[product.slug] || [
    product.title,
    angle.toUpperCase(),
    'DRAFT',
  ];
  const isTote = product.slug.includes('tote');
  const isCap = product.slug.includes('cap');
  const isSticker = product.slug.includes('sticker');
  const isHoodie = product.slug.includes('hoodie');
  const garment = isSticker
    ? stickerSheet(line1, line2, line3)
    : isCap
      ? cap(line1, line2, line3)
      : isTote
        ? tote(line1, line2, line3)
        : top(line1, line2, line3, {hood: isHoodie});

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" role="img" aria-label="${escapeXml(product.title)} ${angle} mockup">
  <rect width="900" height="900" fill="#f6f6f6"/>
  ${garment}
</svg>
`;
}

function top(line1, line2, line3, {hood = false} = {}) {
  const hoodPath = hood
    ? '<path d="M340 210c22-72 198-72 220 0l-48 76H388z" fill="#101010" stroke="#2b2b2b" stroke-width="5"/>'
    : '';
  return `
  <g transform="translate(105 145)">
    ${hoodPath}
    <path d="M218 128h254l92 96 92 336-118 32-76-266v388H228V326l-76 266-118-32 92-336z" fill="#101010" stroke="#252525" stroke-width="7" stroke-linejoin="round"/>
    <path d="M332 128c18 44 118 44 136 0" fill="none" stroke="#333" stroke-width="12" stroke-linecap="round"/>
    <rect x="270" y="262" width="300" height="180" fill="#f8f8f8"/>
    <text x="420" y="318" text-anchor="middle" fill="#111" font-family="Georgia, serif" font-size="45" font-weight="700">${escapeXml(line1)}</text>
    <text x="420" y="372" text-anchor="middle" fill="#111" font-family="monospace" font-size="46" font-weight="700">${escapeXml(line2)}</text>
    <text x="420" y="418" text-anchor="middle" fill="#111" font-family="monospace" font-size="24">${escapeXml(line3)}</text>
  </g>`;
}

function tote(line1, line2, line3) {
  return `
  <g transform="translate(210 170)">
    <path d="M170 120c6-92 270-92 276 0" fill="none" stroke="#111" stroke-width="24" stroke-linecap="round"/>
    <path d="M72 154h472l-42 548H114z" fill="#ebe1cf" stroke="#1b1b1b" stroke-width="7" stroke-linejoin="round"/>
    <rect x="148" y="286" width="320" height="204" fill="#f8f8f8" stroke="#111" stroke-width="4"/>
    <text x="308" y="350" text-anchor="middle" fill="#111" font-family="monospace" font-size="46" font-weight="700">${escapeXml(line1)}</text>
    <text x="308" y="410" text-anchor="middle" fill="#111" font-family="monospace" font-size="46" font-weight="700">${escapeXml(line2)}</text>
    <text x="308" y="462" text-anchor="middle" fill="#111" font-family="monospace" font-size="28">${escapeXml(line3)}</text>
  </g>`;
}

function cap(line1, line2, line3) {
  return `
  <g transform="translate(150 275)">
    <path d="M82 242c42-154 380-182 504 0H82z" fill="#101010" stroke="#252525" stroke-width="7"/>
    <path d="M576 244c86 8 154 42 172 82-118 18-222 6-312-36z" fill="#101010" stroke="#252525" stroke-width="7"/>
    <rect x="224" y="198" width="220" height="70" rx="0" fill="#f7f7f7"/>
    <text x="334" y="243" text-anchor="middle" fill="#111" font-family="monospace" font-size="28" font-weight="700">${escapeXml(line2)}</text>
    <text x="334" y="292" text-anchor="middle" fill="#ddd" font-family="monospace" font-size="21">${escapeXml(line3)}</text>
  </g>`;
}

function stickerSheet(line1, line2, line3) {
  return `
  <g transform="translate(164 142)">
    <rect x="70" y="40" width="520" height="650" fill="#fff" stroke="#111" stroke-width="7"/>
    ${sticker(138, 116, line1)}
    ${sticker(348, 116, line2)}
    ${sticker(138, 318, line3)}
    ${sticker(348, 318, 'DIFF')}
    ${sticker(238, 520, 'RESET')}
  </g>`;
}

function sticker(x, y, text) {
  return `<g transform="translate(${x} ${y})"><rect width="168" height="118" rx="18" fill="#f6f6f6" stroke="#111" stroke-width="4"/><text x="84" y="70" text-anchor="middle" fill="#111" font-family="monospace" font-size="25" font-weight="700">${escapeXml(text)}</text></g>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function main() {
  const products = await readProducts();

  for (const product of products) {
    for (const mockupPath of product.assets.mockups) {
      const angle = mockupPath.includes('-back')
        ? 'back'
        : mockupPath.includes('-detail')
          ? 'detail'
          : 'front';
      const outPath = path.join(rootDir, 'public', mockupPath);
      await mkdir(path.dirname(outPath), {recursive: true});
      await writeFile(outPath, svg(product, angle));
      process.stdout.write(`generated ${path.relative(rootDir, outPath)}\n`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
