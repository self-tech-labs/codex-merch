import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const protectedTerms =
  /\b(?:openai|chatgpt|gpt(?:[- ]?\d+(?:\.\d+)?)?|codex|sora|supreme|nike|adidas)\b|https?:\/\/|@[a-z0-9_]+/i;

export async function validateWeeklyPrepress({product, baseProduct, rootDir}) {
  const sharp = (await import('sharp')).default;
  const issues = [];
  const files = [];
  const expectedByArea = new Map(
    (baseProduct?.placements || [])
      .filter(
        (placement) =>
          !placement.techniques ||
          placement.techniques.includes(product.production.technique),
      )
      .map((placement) => [placement.area, placement]),
  );

  for (const placement of product.production.placements || []) {
    const expected = expectedByArea.get(placement.area);
    if (!expected) {
      issues.push(`Unsupported production area ${placement.area}`);
      continue;
    }
    const absolute = safeAssetPath(rootDir, placement.file);
    let buffer;
    try {
      buffer = await readFile(absolute);
    } catch {
      issues.push(`Missing production file ${placement.file}`);
      continue;
    }
    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch (error) {
      issues.push(`Unreadable production file ${placement.file}: ${error.message}`);
      continue;
    }
    const width = expected.width || baseProduct.printfile.width;
    const height = expected.height || baseProduct.printfile.height;
    if (placement.width !== width || placement.height !== height) {
      issues.push(
        `${placement.area} declares ${placement.width}x${placement.height}; canonical base requires ${width}x${height}`,
      );
    }
    if (metadata.format !== 'png') issues.push(`${placement.file} must be PNG`);
    if (metadata.width !== width || metadata.height !== height) {
      issues.push(
        `${placement.file} is ${metadata.width}x${metadata.height}; expected ${width}x${height}`,
      );
    }
    if (buffer.length < 100) issues.push(`${placement.file} is unexpectedly small`);
    files.push({
      area: placement.area,
      path: placement.file,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    });
  }

  for (const requiredArea of expectedByArea.keys()) {
    if (!files.some((file) => file.area === requiredArea)) {
      issues.push(`Missing rendered production area ${requiredArea}`);
    }
  }

  const spec = product.artDirector?.aopSpec || {};
  const garmentText = JSON.stringify({
    brandLabel: spec.brandLabel,
    provenanceLine: spec.provenanceLine,
    front: spec.front,
    back: spec.back,
    sleeves: spec.sleeves,
    label: spec.label,
  });
  if (protectedTerms.test(garmentText)) {
    issues.push('Garment text contains a protected or attribution-confusing term');
  }

  return {
    ok: issues.length === 0,
    checkedAt: new Date().toISOString(),
    technique: product.production.technique,
    baseProduct: baseProduct?.alias || null,
    files,
    issues,
  };
}

function safeAssetPath(rootDir, relativePath) {
  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Unsafe production path: ${relativePath}`);
  }
  return resolved;
}
