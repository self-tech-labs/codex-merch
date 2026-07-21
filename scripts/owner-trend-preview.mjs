#!/usr/bin/env node
import {existsSync, readFileSync} from 'node:fs';
import {readFile, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  composeProductPrintFiles,
  productionTemplateSpec,
  readArtDirection,
  readBaseProducts,
  readProducts,
  setWorkflowStatus,
  validateProducts,
  writeProducts,
} from './merch.mjs';
import {artDirectorReview} from './services/art-director.mjs';
import {
  critiqueWeeklyGarment,
  directWeeklyGarment,
  evaluateVisualCritic,
  rankGarmentRecipes,
} from './services/weekly-art-director.mjs';
import {
  assertOwnerTrendPreviewProduct,
  buildOwnerTrendPreviewProduct,
  findOwnerTrendPreview,
  ownerTrendInput,
  ownerTrendPreviewAssetPaths,
  parseOwnerTrendPreviewOptions,
} from './services/owner-trend-preview.mjs';
import {validateWeeklyPrepress} from './services/weekly-prepress.mjs';
import {renderWeeklyConceptBoard} from './services/weekly-product.mjs';
import {atomicWriteText} from './services/weekly-run-store.mjs';
import {validateCatalog} from './validate-catalog.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productsPath = path.join(rootDir, 'merch/products.json');

export async function prepareOwnerTrendPreview(options, dependencies = {}) {
  const readCatalog = dependencies.readProducts || readProducts;
  const readBases = dependencies.readBaseProducts || readBaseProducts;
  const readDirection = dependencies.readArtDirection || readArtDirection;
  const directGarment = dependencies.directWeeklyGarment || directWeeklyGarment;
  const critiqueGarment = dependencies.critiqueWeeklyGarment || critiqueWeeklyGarment;
  const renderConcept = dependencies.renderWeeklyConceptBoard || renderWeeklyConceptBoard;
  const composeFiles = dependencies.composeProductPrintFiles || composeProductPrintFiles;
  const validatePrepress = dependencies.validateWeeklyPrepress || validateWeeklyPrepress;
  const validateProductManifest = dependencies.validateProducts || validateProducts;
  const persistProducts = dependencies.writeProducts || writeProducts;
  const validatePersistedCatalog = dependencies.validateCatalog || validateCatalog;
  const restoreCatalog = dependencies.atomicWriteText || atomicWriteText;
  const removeAsset = dependencies.removeAsset || removeLocalAsset;
  const assetExists = dependencies.assetExists || existsSync;
  const repositoryRoot = dependencies.rootDir || rootDir;
  const catalogPath = dependencies.productsPath || productsPath;

  const provenance = ownerTrendInput(options);
  const products = await readCatalog();
  const prior = findOwnerTrendPreview(
    products,
    provenance.inputHash,
    provenance.identityHash,
  );
  if (prior) {
    assertOwnerTrendPreviewProduct(prior);
    const missing = ownerTrendPreviewAssetPaths(prior).filter(
      (asset) => !assetExists(path.join(repositoryRoot, asset)),
    );
    if (missing.length) {
      throw new Error(
        `Existing preview ${prior.slug} is incomplete; missing: ${missing.join(', ')}`,
      );
    }
    const bases = await readBases();
    const baseProduct = bases.products.find(
      (base) => base.alias === 'printful-aop-cotton-sweatshirt-white',
    );
    if (!baseProduct) throw new Error('Missing owner-preview AOP cotton base product');
    const prepress = await validatePrepress({
      product: prior,
      baseProduct,
      rootDir: repositoryRoot,
    });
    if (!prepress.ok) {
      throw new Error(
        `Existing preview ${prior.slug} failed prepress: ${prepress.issues.join('; ')}`,
      );
    }
    assertRecordedPrepressMatches(prior, prepress);
    const productErrors = validateProductManifest(products);
    if (productErrors.length) {
      throw new Error(`Existing preview catalog validation failed: ${productErrors.join('; ')}`);
    }
    const catalogValidation = await validatePersistedCatalog();
    if (catalogValidation.errors.length) {
      throw new Error(
        `Existing preview persisted catalog failed validation: ${catalogValidation.errors.join('; ')}`,
      );
    }
    return previewSummary(prior, {idempotentReplay: true, prepress});
  }

  const [bases, artDirection] = await Promise.all([readBases(), readDirection()]);
  const baseProduct = bases.products.find(
    (base) => base.alias === 'printful-aop-cotton-sweatshirt-white',
  );
  if (!baseProduct) throw new Error('Missing owner-preview AOP cotton base product');

  const artResult = await directGarment({
    trend: provenance.trend,
    decision: provenance.decision,
    baseProduct,
    artDirection,
    recentProductTitles: products.map((product) => product.title),
    runKey: `owner-trend-preview:${provenance.inputHash.slice(0, 32)}`,
  });
  const ranked = rankGarmentRecipes(artResult.output, {
    sourceTexts: [options.trend, options.context].filter(Boolean),
  });
  const eligible = ranked.filter((entry) => entry.eligible).slice(0, 2);
  if (!eligible.length) {
    throw new Error('No owner-trend garment recipe passed rights and production gates');
  }

  if (options.dryRun) {
    return {
      mode: 'planned',
      inputMode: 'owner-supplied-trend',
      inputHash: provenance.inputHash,
      identityHash: provenance.identityHash,
      releaseEligible: false,
      externalMutations: [],
      candidates: ranked.map((entry) => ({
        conceptId: entry.candidate.conceptId,
        title: entry.candidate.title,
        eligible: entry.eligible,
        score: entry.weightedScore,
        checks: entry.checks,
      })),
    };
  }

  const originalCatalog = await readFile(catalogPath, 'utf8');
  const attempts = [];
  for (const entry of eligible) {
    const product = buildOwnerTrendPreviewProduct({
      existingProducts: products,
      baseProduct,
      recipe: entry.candidate,
      trend: options.trend,
      context: options.context,
      inputHash: provenance.inputHash,
      identityHash: provenance.identityHash,
    });
    const candidateAssets = ownerTrendPreviewAssetPaths(product);
    let catalogWritten = false;

    try {
      const template = productionTemplateSpec(product, baseProduct);
      const structuralReview = artDirectorReview(product, template, artDirection);
      if (!structuralReview.accepted) {
        attempts.push({
          conceptId: entry.candidate.conceptId,
          decision: 'structural-rejection',
          findings: structuralReview.findings,
        });
        continue;
      }

      await renderConcept(product, path.join(repositoryRoot, product.assets.artwork));
      await composeFiles(product, baseProduct);
      const prepress = await validatePrepress({
        product,
        baseProduct,
        rootDir: repositoryRoot,
      });
      if (!prepress.ok) {
        attempts.push({
          conceptId: entry.candidate.conceptId,
          decision: 'prepress-rejection',
          issues: prepress.issues,
        });
        await cleanupAssets(candidateAssets, removeAsset, repositoryRoot);
        continue;
      }

      const criticResult = await critiqueGarment({
        product,
        recipe: entry.candidate,
        imagePaths: criticImagePaths(product, repositoryRoot),
        prepress,
        runKey: `owner-trend-preview:${provenance.inputHash.slice(0, 32)}`,
      });
      const visualGate = evaluateVisualCritic(criticResult.output);
      attempts.push({
        conceptId: entry.candidate.conceptId,
        decision: visualGate.decision,
        overallScore: criticResult.output.overallScore,
      });
      if (!visualGate.passed) {
        await cleanupAssets(candidateAssets, removeAsset, repositoryRoot);
        continue;
      }

      product.artDirector.review = structuralReview;
      product.artDirector.visualCritic = {
        ...criticResult.output,
        model: criticResult.response.model,
        responseId: criticResult.response.responseId,
        checkedAt: new Date().toISOString(),
      };
      product.automation.criticScore = criticResult.output.overallScore;
      product.automation.prepress = {
        validator: 'weekly-prepress-v1',
        fileCount: prepress.files.length,
        hashes: Object.fromEntries(prepress.files.map((file) => [file.area, file.sha256])),
      };
      setWorkflowStatus(product, 'generated');
      assertOwnerTrendPreviewProduct(product);

      const productErrors = validateProductManifest([...products, product]);
      if (productErrors.length) {
        throw new Error(`Preview catalog validation failed: ${productErrors.join('; ')}`);
      }
      await persistProducts([...products, product]);
      catalogWritten = true;
      const catalogValidation = await validatePersistedCatalog();
      if (catalogValidation.errors.length) {
        throw new Error(
          `Persisted preview catalog failed validation: ${catalogValidation.errors.join('; ')}`,
        );
      }

      return previewSummary(product, {
        idempotentReplay: false,
        attempts,
        prepress,
      });
    } catch (error) {
      if (catalogWritten) await restoreCatalog(catalogPath, originalCatalog);
      await cleanupAssets(candidateAssets, removeAsset, repositoryRoot);
      throw error;
    }
  }

  throw new Error(
    `No preview candidate passed the actual-render critic: ${attempts
      .map((attempt) => `${attempt.conceptId}:${attempt.decision}`)
      .join(', ')}`,
  );
}

function criticImagePaths(product, repositoryRoot) {
  const labelFiles = (product.assets.printFiles || [])
    .filter((file) => ['label_panel', 'label_inside'].includes(file.placement))
    .map((file) => file.path);
  return [...product.assets.mockups, ...labelFiles]
    .slice(0, 6)
    .map((asset) => path.join(repositoryRoot, asset));
}

function previewSummary(product, {idempotentReplay, attempts = [], prepress} = {}) {
  return {
    mode: idempotentReplay ? 'existing' : 'created',
    idempotentReplay,
    slug: product.slug,
    title: product.title,
    status: product.workflow.status,
    inputMode: product.automation.inputMode,
    inputHash: product.automation.inputHash,
    identityHash: product.automation.identityHash,
    previewOnly: true,
    releaseEligible: false,
    storefrontVisibleAfterPreviewDeploy: true,
    purchasable: false,
    externalMutations: [],
    criticScore: product.automation.criticScore || null,
    prepressPassed: prepress ? prepress.ok : true,
    attempts,
    artwork: product.assets.artwork,
    mockups: product.assets.mockups,
    printFiles: product.assets.printFiles,
  };
}

async function cleanupAssets(assetPaths, removeAsset, repositoryRoot) {
  for (const asset of new Set(assetPaths)) {
    await removeAsset(path.join(repositoryRoot, asset));
  }
}

function assertRecordedPrepressMatches(product, prepress) {
  const recorded = product.automation?.prepress;
  if (!recorded) throw new Error(`Existing preview ${product.slug} has no prepress record`);
  if (recorded.validator !== 'weekly-prepress-v1') {
    throw new Error(`Existing preview ${product.slug} has an unexpected prepress validator`);
  }
  if (recorded.fileCount !== prepress.files.length) {
    throw new Error(`Existing preview ${product.slug} prepress file count changed`);
  }
  const actual = new Map(prepress.files.map((file) => [file.area, file.sha256]));
  const recordedHashes = Object.entries(recorded.hashes || {});
  if (actual.size !== prepress.files.length || recordedHashes.length !== actual.size) {
    throw new Error(`Existing preview ${product.slug} prepress hash coverage changed`);
  }
  for (const [area, actualHash] of actual) {
    const recordedHash = recorded.hashes?.[area];
    if (!/^[a-f0-9]{64}$/.test(String(recordedHash || ''))) {
      throw new Error(`Existing preview ${product.slug} has no valid prepress hash for ${area}`);
    }
    if (actualHash !== recordedHash) {
      throw new Error(`Existing preview ${product.slug} prepress hash changed for ${area}`);
    }
  }
}

async function removeLocalAsset(file) {
  try {
    await unlink(file);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function loadLocalEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(rootDir, name);
    if (!existsSync(file)) continue;
    const lines = String(readFileSync(file, 'utf8')).split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

async function main() {
  loadLocalEnv();
  const options = parseOwnerTrendPreviewOptions(process.argv.slice(2));
  const result = await prepareOwnerTrendPreview(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
