import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assertProviderMutationAllowed} from './merch.mjs';
import {prepareOwnerTrendPreview} from './owner-trend-preview.mjs';
import {directWeeklyGarment} from './services/weekly-art-director.mjs';
import {
  assertOwnerTrendPreviewProduct,
  buildOwnerTrendPreviewProduct,
  ownerTrendInput,
  parseOwnerTrendPreviewOptions,
} from './services/owner-trend-preview.mjs';

const fixture = JSON.parse(
  await readFile(
    new URL('../fixtures/openai/weekly-happy-path.synthetic.json', import.meta.url),
    'utf8',
  ),
);

test('owner trend preview options require an explicit bounded trend and reject release flags', () => {
  assert.deepEqual(
    parseOwnerTrendPreviewOptions([
      '--trend',
      '  the   Sol shines  ',
      '--context',
      ' latest model wordplay ',
      '--dry-run',
    ]),
    {
      trend: 'the Sol shines',
      context: 'latest model wordplay',
      dryRun: true,
    },
  );
  assert.throws(() => parseOwnerTrendPreviewOptions([]), /trend.*required/i);
  assert.throws(
    () => parseOwnerTrendPreviewOptions(['--trend', 'safe', '--release']),
    /Unknown preview option: --release/,
  );
  assert.throws(
    () => parseOwnerTrendPreviewOptions(['--trend', 'unsafe\u0007']),
    /control characters/,
  );
});

test('owner trend provenance is deterministic, preview-only, and contains no invented X evidence', () => {
  const first = ownerTrendInput({
    trend: 'the Sol shines',
    context: 'model-name wordplay',
  });
  const replay = ownerTrendInput({
    trend: ' the  Sol shines ',
    context: ' model-name wordplay ',
  });

  assert.equal(first.inputHash, replay.inputHash);
  assert.equal(first.identityHash, replay.identityHash);
  assert.equal(
    first.identityHash,
    ownerTrendInput({
      trend: 'THE SOL SHINES',
      context: 'MODEL-NAME WORDPLAY',
    }).identityHash,
  );
  assert.equal(first.decision.artDirectionEligible, true);
  assert.equal(first.decision.publishEligible, false);
  assert.deepEqual(first.decision.evidencePostIds, []);
  assert.deepEqual(first.decision.safeOriginalPhrases, []);
  assert.match(first.decision.fingerprint, /^owner:[a-f0-9]{64}$/);
  assert.match(first.trend.teamConnection, /not represented as X research/);
});

test('weekly art direction accepts explicit preview eligibility without granting publication', async () => {
  const input = ownerTrendInput({trend: 'the Sol shines'});
  const result = await directWeeklyGarment({
    trend: input.trend,
    decision: input.decision,
    modelOutput: fixture.artDirection,
  });

  assert.equal(input.decision.publishEligible, false);
  assert.equal(result.output.candidates.length, 3);
  await assert.rejects(
    directWeeklyGarment({
      trend: input.trend,
      decision: {publishEligible: false},
      modelOutput: fixture.artDirection,
    }),
    /preview-only art-direction decision/,
  );
});

test('owner trend product is storefront-visible metadata but cannot be sold or synced', () => {
  const input = ownerTrendInput({trend: 'the Sol shines'});
  const product = buildOwnerTrendPreviewProduct({
    existingProducts: [],
    baseProduct: previewBaseProduct(),
    recipe: fixture.artDirection.candidates[0],
    trend: 'the Sol shines',
    inputHash: input.inputHash,
  });

  assertOwnerTrendPreviewProduct(product);
  assert.equal(product.workflow.status, 'draft');
  assert.equal(product.automation.previewOnly, true);
  assert.equal(product.automation.releaseEligible, false);
  assert.equal(product.automation.runKey, undefined);
  assert.equal(product.signals.profile, 'owner-supplied-trend');
  assert.deepEqual(product.signals.queries, []);
  assert.deepEqual(product.signals.sources, []);
  assert.ok(product.commerce.variants.every((variant) => !variant.availableForSale));
  assert.deepEqual(product.providerRefs.printful.variants, []);
  assert.equal(product.providerRefs.printful.productId, null);
  assert.throws(
    () => assertProviderMutationAllowed([product], 'Printful sync'),
    /disabled for preview-only products/,
  );
});

test('idempotent replay is case-insensitive and revalidates catalog, prepress, and hashes', async () => {
  const input = ownerTrendInput({trend: 'The Sol Shines'});
  const baseProduct = previewBaseProduct();
  const product = buildOwnerTrendPreviewProduct({
    existingProducts: [],
    baseProduct,
    recipe: fixture.artDirection.candidates[0],
    trend: 'The Sol Shines',
    inputHash: input.inputHash,
    identityHash: input.identityHash,
  });
  product.workflow.status = 'generated';
  const files = baseProduct.placements.map((placement, index) => ({
    area: placement.area,
    sha256: String(index + 1).repeat(64).slice(0, 64),
  }));
  product.automation.prepress = {
    validator: 'weekly-prepress-v1',
    fileCount: files.length,
    hashes: Object.fromEntries(files.map((file) => [file.area, file.sha256])),
  };
  const dependencies = {
    readProducts: async () => [product],
    readBaseProducts: async () => ({products: [baseProduct]}),
    assetExists: () => true,
    validateWeeklyPrepress: async () => ({ok: true, issues: [], files}),
    validateProducts: () => [],
    validateCatalog: async () => ({errors: []}),
    directWeeklyGarment: async () => {
      throw new Error('idempotent replay must not call GPT-5.6');
    },
  };

  const result = await prepareOwnerTrendPreview(
    {trend: 'the Sol shines', context: '', dryRun: false},
    dependencies,
  );
  assert.equal(result.mode, 'existing');
  assert.equal(result.idempotentReplay, true);
  assert.equal(result.prepressPassed, true);

  await assert.rejects(
    prepareOwnerTrendPreview(
      {trend: 'the Sol shines', context: '', dryRun: false},
      {
        ...dependencies,
        validateWeeklyPrepress: async () => ({
          ok: true,
          issues: [],
          files: [{...files[0], sha256: 'f'.repeat(64)}, ...files.slice(1)],
        }),
      },
    ),
    /prepress hash changed for front/,
  );

  const incompleteRecord = structuredClone(product);
  delete incompleteRecord.automation.prepress.hashes.label_inside;
  await assert.rejects(
    prepareOwnerTrendPreview(
      {trend: 'the Sol shines', context: '', dryRun: false},
      {...dependencies, readProducts: async () => [incompleteRecord]},
    ),
    /prepress hash coverage changed/,
  );
});

test('dry-run produces structured candidates without rendering, persistence, or provider work', async () => {
  const calls = [];
  const result = await prepareOwnerTrendPreview(
    {trend: 'the Sol shines', context: '', dryRun: true},
    {
      readProducts: async () => [],
      readBaseProducts: async () => ({products: [previewBaseProduct()]}),
      readArtDirection: async () => ({}),
      directWeeklyGarment: async ({decision}) => {
        assert.equal(decision.artDirectionEligible, true);
        assert.equal(decision.publishEligible, false);
        return {output: fixture.artDirection, response: {}};
      },
      renderWeeklyConceptBoard: async () => calls.push('render'),
      composeProductPrintFiles: async () => calls.push('compose'),
      writeProducts: async () => calls.push('persist'),
    },
  );

  assert.equal(result.mode, 'planned');
  assert.equal(result.releaseEligible, false);
  assert.deepEqual(result.externalMutations, []);
  assert.equal(result.candidates.length, 3);
  assert.ok(result.candidates.some((candidate) => candidate.eligible));
  assert.deepEqual(calls, []);
});

test('preview orchestration persists only after render, prepress, and actual-render critic pass', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'owner-trend-preview-'));
  const catalogPath = path.join(directory, 'products.json');
  const calls = [];
  let persisted;
  await writeFile(catalogPath, '[]\n');

  try {
    const result = await prepareOwnerTrendPreview(
      {trend: 'the Sol shines', context: 'model-name wordplay', dryRun: false},
      {
        rootDir: directory,
        productsPath: catalogPath,
        readProducts: async () => [],
        readBaseProducts: async () => ({products: [previewBaseProduct()]}),
        readArtDirection: async () => ({}),
        directWeeklyGarment: async () => ({
          output: fixture.artDirection,
          response: {responseId: 'art-test', model: 'gpt-5.6'},
        }),
        renderWeeklyConceptBoard: async () => calls.push('render'),
        composeProductPrintFiles: async () => calls.push('compose'),
        validateWeeklyPrepress: async () => ({
          ok: true,
          issues: [],
          files: [
            {area: 'front', sha256: 'a'.repeat(64)},
            {area: 'back', sha256: 'b'.repeat(64)},
          ],
        }),
        critiqueWeeklyGarment: async () => ({
          output: fixture.visualCritic,
          response: {responseId: 'critic-test', model: 'gpt-5.6'},
        }),
        validateProducts: () => [],
        writeProducts: async (products) => {
          calls.push('persist');
          persisted = products;
        },
        validateCatalog: async () => ({errors: []}),
        removeAsset: async () => calls.push('cleanup'),
      },
    );

    assert.deepEqual(calls, ['render', 'compose', 'persist']);
    assert.equal(result.mode, 'created');
    assert.equal(result.status, 'generated');
    assert.equal(result.previewOnly, true);
    assert.equal(result.purchasable, false);
    assert.deepEqual(result.externalMutations, []);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].workflow.status, 'generated');
    assert.equal(persisted[0].artDirector.visualCritic.overallScore, 91);
    assert.equal(persisted[0].automation.prepress.fileCount, 2);
    assertOwnerTrendPreviewProduct(persisted[0]);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('a failed persisted-catalog gate restores exact catalog bytes and cleans candidate assets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'owner-trend-rollback-'));
  const catalogPath = path.join(directory, 'products.json');
  const originalCatalog = '[\n  {"id":"keep","slug":"keep","title":"Keep"}\n]\n';
  const existing = [{id: 'keep', slug: 'keep', title: 'Keep'}];
  let cleanupCount = 0;
  await writeFile(catalogPath, originalCatalog);

  try {
    await assert.rejects(
      prepareOwnerTrendPreview(
        {trend: 'the Sol shines', context: '', dryRun: false},
        {
          rootDir: directory,
          productsPath: catalogPath,
          readProducts: async () => existing,
          readBaseProducts: async () => ({products: [previewBaseProduct()]}),
          readArtDirection: async () => ({}),
          directWeeklyGarment: async () => ({output: fixture.artDirection, response: {}}),
          renderWeeklyConceptBoard: async () => {},
          composeProductPrintFiles: async () => {},
          validateWeeklyPrepress: async () => ({
            ok: true,
            issues: [],
            files: [{area: 'front', sha256: 'a'.repeat(64)}],
          }),
          critiqueWeeklyGarment: async () => ({
            output: fixture.visualCritic,
            response: {responseId: 'critic-test', model: 'gpt-5.6'},
          }),
          validateProducts: () => [],
          writeProducts: async (products) =>
            writeFile(catalogPath, `${JSON.stringify(products, null, 2)}\n`),
          validateCatalog: async () => ({errors: ['simulated persisted-catalog failure']}),
          removeAsset: async () => {
            cleanupCount += 1;
          },
        },
      ),
      /simulated persisted-catalog failure/,
    );

    assert.equal(await readFile(catalogPath, 'utf8'), originalCatalog);
    assert.ok(cleanupCount >= 1);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

function previewBaseProduct() {
  return {
    provider: 'printful',
    alias: 'printful-aop-cotton-sweatshirt-white',
    title: 'All-Over Print Unisex Cotton Sweatshirt',
    kind: 'all-over-cotton-sweatshirt',
    techniques: ['All-Over Cotton'],
    printfile: {width: 4_200, height: 4_800},
    placements: [
      {area: 'front', width: 4_200, height: 4_800},
      {area: 'back', width: 4_200, height: 4_800},
      {area: 'left_sleeve', width: 4_200, height: 4_800},
      {area: 'right_sleeve', width: 4_200, height: 4_800},
      {area: 'label_panel', width: 4_200, height: 4_800},
      {area: 'label_inside', width: 375, height: 150},
    ],
    variants: [
      {color: 'White', size: 'M', providerVariantId: 33966},
      {color: 'White', size: 'L', providerVariantId: 33967},
    ],
  };
}
