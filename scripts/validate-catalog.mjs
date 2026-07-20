import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import sharp from 'sharp';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function schemaErrors(validate) {
  return (validate.errors || []).map(
    (error) => `${error.instancePath || '/'} ${error.message}`,
  );
}

function safeLocalPath(relativePath) {
  if (!relativePath || /^https?:\/\//i.test(relativePath)) return null;
  const resolved = path.resolve(rootDir, relativePath);
  if (!resolved.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error(`unsafe asset path: ${relativePath}`);
  }
  return resolved;
}

export async function validateCatalog() {
  const products = readJson('merch/products.json');
  const bases = readJson('merch/base-products.json');
  const techniques = readJson('merch/customization-techniques.json');
  const artDirection = readJson('merch/art-direction.json');
  const ajv = new Ajv2020({allErrors: true, strict: false});
  addFormats(ajv);

  const documents = [
    ['products', products, readJson('merch/schema.json')],
    ['base products', bases, readJson('merch/base-products.schema.json')],
    ['customization techniques', techniques, readJson('merch/customization-techniques.schema.json')],
    ['art direction', artDirection, readJson('merch/art-direction.schema.json')],
  ];
  const errors = [];

  for (const [label, document, schema] of documents) {
    const validate = ajv.compile(schema);
    if (!validate(document)) {
      errors.push(...schemaErrors(validate).map((error) => `${label}: ${error}`));
    }
  }

  const unique = new Map();
  const routeIdentifiers = new Map();
  const remember = (kind, value, slug) => {
    if (!value) return;
    const key = `${kind}:${value}`;
    if (unique.has(key)) errors.push(`${slug}: duplicate ${kind} ${value}`);
    unique.set(key, slug);
  };
  const rememberRoute = (value, slug) => {
    const existing = routeIdentifiers.get(value);
    if (existing && existing !== slug) {
      errors.push(`${slug}: storefront identifier ${value} is already used by ${existing}`);
    }
    routeIdentifiers.set(value, slug);
  };
  const basesByAlias = new Map(bases.products.map((base) => [base.alias, base]));
  const knownTechniques = new Set(Object.keys(techniques.techniques || {}));
  const knownCurrencies = new Set(Intl.supportedValuesOf('currency'));

  for (const base of bases.products) {
    const baseVariants = new Set();
    for (const technique of base.techniques || []) {
      if (!knownTechniques.has(technique)) {
        errors.push(`${base.alias}: unknown technique ${technique}`);
      }
    }
    for (const variant of base.variants || []) {
      if (baseVariants.has(variant.providerVariantId)) {
        errors.push(
          `${base.alias}: duplicate provider variant ${variant.providerVariantId}`,
        );
      }
      baseVariants.add(variant.providerVariantId);
    }
    for (const placement of base.placements || []) {
      for (const technique of placement.techniques || []) {
        if (!knownTechniques.has(technique)) {
          errors.push(`${base.alias}: placement uses unknown technique ${technique}`);
        }
      }
    }
  }

  for (const product of products) {
    remember('slug', product.slug, product.slug);
    remember('handle', product.commerce?.handle, product.slug);
    for (const alias of product.aliases || []) remember('alias', alias, product.slug);
    rememberRoute(product.slug, product.slug);
    rememberRoute(product.commerce?.handle, product.slug);
    for (const alias of product.aliases || []) rememberRoute(alias, product.slug);
    const variants = product.commerce?.variants || [];
    if (!knownCurrencies.has(product.commerce?.currency)) {
      errors.push(`${product.slug}: unsupported currency ${product.commerce?.currency}`);
    }
    if (!knownTechniques.has(product.production?.technique)) {
      errors.push(`${product.slug}: unknown technique ${product.production?.technique}`);
    }
    const mappings = new Map();
    const variantIds = new Set(variants.map((variant) => variant.id));
    for (const entry of product.providerRefs?.printful?.variants || []) {
      if (mappings.has(entry.variantId)) {
        errors.push(`${product.slug}: duplicate provider mapping ${entry.variantId}`);
      }
      if (!variantIds.has(entry.variantId)) {
        errors.push(`${product.slug}: provider mapping references unknown variant ${entry.variantId}`);
      }
      mappings.set(entry.variantId, entry);
    }
    for (const variant of variants) {
      remember('sku', variant.sku, product.slug);
      remember('variant ID', variant.id, product.slug);
      const mapping = mappings.get(variant.id);
      if (mapping && mapping.catalogVariantId !== variant.providerVariantId) {
        errors.push(`${product.slug}: provider mapping disagrees for ${variant.id}`);
      }
    }

    const base = basesByAlias.get(product.production?.baseProduct);
    if (!base) {
      errors.push(`${product.slug}: unknown base product ${product.production?.baseProduct}`);
    } else {
      if (base.provider !== product.production.provider) {
        errors.push(`${product.slug}: base product provider mismatch`);
      }
      if (!base.techniques.includes(product.production.technique)) {
        errors.push(`${product.slug}: base product does not support ${product.production.technique}`);
      }
      const requiredAreas = new Set(
        base.placements
          .filter((placement) =>
            !placement.techniques || placement.techniques.includes(product.production.technique),
          )
          .map((placement) => placement.area),
      );
      const actualAreas = new Set(product.production.placements.map((placement) => placement.area));
      if (actualAreas.size !== product.production.placements.length) {
        errors.push(`${product.slug}: duplicate production placement`);
      }
      for (const area of requiredAreas) {
        if (!actualAreas.has(area)) errors.push(`${product.slug}: missing placement ${area}`);
      }
      for (const area of actualAreas) {
        if (!requiredAreas.has(area)) {
          errors.push(
            `${product.slug}: placement ${area} is not supported for ${product.production.technique}`,
          );
        }
      }
    }

    const assetPaths = [
      product.assets?.artwork,
      ...(product.assets?.mockups || []),
      ...(product.assets?.customerPhotos || []),
      ...(product.assets?.printFiles || []).map((file) => file.path),
      ...(product.production?.placements || []).map((placement) => placement.file),
    ];
    for (const assetPath of new Set(assetPaths.filter(Boolean))) {
      try {
        const local = safeLocalPath(assetPath);
        if (local && !existsSync(local)) {
          errors.push(`${product.slug}: missing asset ${assetPath}`);
        } else if (local && /\.(?:jpe?g|png|webp)$/i.test(local)) {
          try {
            const metadata = await sharp(local).metadata();
            if (!metadata.width || !metadata.height) {
              errors.push(`${product.slug}: invalid image dimensions for ${assetPath}`);
            }
          } catch (error) {
            errors.push(
              `${product.slug}: unreadable image ${assetPath}: ${error.message}`,
            );
          }
        }
      } catch (error) {
        errors.push(`${product.slug}: ${error.message}`);
      }
    }

    for (const placement of product.production?.placements || []) {
      if (!placement.width || !placement.height) continue;
      const local = safeLocalPath(placement.file);
      if (!local || !existsSync(local)) continue;
      const metadata = await sharp(local).metadata();
      if (metadata.width !== placement.width || metadata.height !== placement.height) {
        errors.push(
          `${product.slug}: ${placement.file} is ${metadata.width}x${metadata.height}, expected ${placement.width}x${placement.height}`,
        );
      }
    }

    if (product.workflow?.status === 'published') {
      if (!product.approval?.approvedAt || !product.approval?.approvedBy) {
        errors.push(`${product.slug}: published product is not approved`);
      }
      if (!product.signals?.sources?.length) {
        errors.push(`${product.slug}: published product has no research sources`);
      }
      if (product.production.technique === 'All-Over Cotton' && !product.assets?.customerPhotos?.length) {
        errors.push(`${product.slug}: published AOP product requires a customer photo`);
      }
      for (const variant of variants.filter((variant) => variant.availableForSale)) {
        const mapping = mappings.get(variant.id);
        if (!mapping?.available || !mapping.syncVariantId) {
          errors.push(`${product.slug}: sellable variant ${variant.id} lacks a Printful sync mapping`);
        }
      }
    }
  }

  return {errors, products};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const {errors, products} = await validateCatalog();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Validated ${products.length} merch products and supporting catalogs.`);
  }
}
