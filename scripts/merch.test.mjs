import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  AOP_COTTON_REQUIRED_PLACEMENTS,
  advanceWorkflowStatus,
  allowedTechniques,
  assertPilotPublicationAllowed,
  artDirectionPrompt,
  artDirectorReview,
  catalogMockupPath,
  composePrintFilePlan,
  customerPhotoPath,
  ensurePhotoshootOutput,
  ensureCatalogMockupFirst,
  generationDirectionPrompt,
  generationPreflight,
  mismatchedPrintfulSyncVariantMappings,
  missingPrintfulCatalogVariantIds,
  parseNewProductArgs,
  photoshootPrompt,
  photoshootSourceCandidates,
  printfulMockupTaskPayload,
  printfulDryRunExternalId,
  printfulPayloadWithSyncVariantIds,
  printfulPayload,
  printfulStoreProductExternalId,
  printfulStoreProductMatchesAnyExternalId,
  printfulStoreProductMatchesExternalId,
  printfulStoreSyncVariantIds,
  printfulTechniquePrompt,
  recordPrintfulMockupTaskFailure,
  setWorkflowStatus,
  validateProducts,
  verifyPhotoshootReadiness,
  verifyPrintfulReadiness,
  workflowStatuses,
} from './merch.mjs';
import {
  buildImageEditRequest,
  buildImageGenerationRequest,
  buildImagePrompt,
} from './adapters/openai-images.mjs';
import {
  buildRecentSearchUrl,
  summarizeRecentSearch,
} from './adapters/x-api.mjs';
import {providerForSignal} from './services/signals.mjs';

const baseProduct = {
  id: 'drop-test',
  slug: 'test-shirt',
  title: 'Test Shirt',
  workflow: {status: 'draft'},
  category: 'Codex',
  description: 'Test description.',
  meme: {
    source: 'Unit test',
    brief: 'Simple unit-test product.',
    rightsNote:
      'Unit test rights note with enough detail for validation to accept it.',
  },
  signals: {
    profile: 'codex-trend-research',
    queries: [],
    sources: [],
  },
  commerce: {
    handle: 'test-shirt',
    unitAmount: 4200,
    currency: 'USD',
    tags: ['codex'],
    variants: [
      {
        id: 'test-shirt:4017',
        sku: 'TEST_SHIRT_BLACK_M',
        color: 'Black',
        size: 'M',
        providerVariantId: 4017,
        availableForSale: true,
        selectedOptions: [
          {name: 'Color', value: 'Black'},
          {name: 'Size', value: 'M'},
        ],
      },
    ],
  },
  production: {
    provider: 'printful',
    baseProduct: 'bella-canvas-3001-black',
    technique: 'DTFlex',
    placements: [
      {
        area: 'front',
        file: 'assets/print/test-shirt-front.png',
      },
    ],
  },
  providerRefs: {
    printful: {
      productId: null,
      mockupTaskKey: null,
      variants: [],
    },
  },
  assets: {
    artwork: 'assets/artwork/test-shirt.png',
    printFiles: [
      {
        placement: 'front',
        path: 'assets/print/test-shirt-front.png',
      },
    ],
    mockups: ['assets/mockups/test-shirt-front.png'],
  },
  approval: {
    approvedAt: null,
    approvedBy: null,
    notes: '',
  },
  prompts: ['Make a clean product mockup.'],
};

const baseBlank = {
  alias: 'bella-canvas-3001-black',
  title: 'Bella + Canvas 3001 Unisex T-Shirt',
  catalogProductId: 71,
  techniques: ['DTG', 'DTFlex'],
  defaultPosition: {
    area_width: 1800,
    area_height: 2400,
    width: 1800,
    height: 1800,
    top: 300,
    left: 0,
  },
  techniqueOptions: {
    DTFlex: [],
  },
  variants: [
    {color: 'Black', size: 'M', providerVariantId: 4017},
    {color: 'Black', size: 'L', providerVariantId: 4018},
  ],
  placements: [
    {
      area: 'front',
      providerPlacementType: 'front_dtf',
      mockupPlacement: 'front_dtf',
      techniques: ['DTFlex'],
    },
    {
      area: 'front',
      providerPlacementType: 'default',
      mockupPlacement: 'front',
      techniques: ['DTG'],
    },
  ],
};

const techniqueCatalog = {
  techniques: {
    DTFlex: {
      promptRules: [
        'Create sharp, high-contrast print artwork with clean edges.',
        'Create standalone print artwork only, not an ecommerce product photo or garment mockup.',
      ],
    },
    DTG: {
      promptRules: ['Create full-color artwork suitable for direct-to-garment apparel printing.'],
    },
    'All-Over Cotton': {
      promptRules: [
        'Design the whole garment first.',
        'Use full-panel backgrounds and intentional sleeves.',
      ],
    },
  },
};

const artDirection = {
  name: 'Codex Supply House',
  positioning: 'Original Codex-native merch with skater graphics and SF engineering lore.',
  pillars: ['ASCII computing language', 'drop-culture sticker density'],
  visualRules: [
    'Make the artwork feel like an original cult merch drop.',
    'Do not copy official logos or protected brand marks.',
  ],
  motifBank: ['ASCII border fragments', 'football jersey numbering'],
  aopGarmentRules: ['Use sparse, premium garment composition over dense poster collage.'],
  referenceScreenshots: ['merch/reference/art-direction/supplyco-screenshots/03-research-deployment-polo.png'],
  negativePromptRules: ['No Supreme box logo.', 'No copied Supply Co product artwork.'],
};

const aopBlank = {
  alias: 'printful-aop-cotton-sweatshirt-white',
  title: 'All-Over Print Unisex Cotton Sweatshirt',
  kind: 'all-over-cotton-sweatshirt',
  catalogProductId: 1418,
  techniques: ['All-Over Cotton'],
  printfile: {width: 5037, height: 6600, dpi: 150},
  templateNotes: ['Front/back/sleeve canvases are 5037x6600 px.'],
  techniqueOptions: {'All-Over Cotton': [{id: 'stitch_color', value: 'black'}]},
  variants: [{color: 'White', size: 'M', providerVariantId: 33966}],
  placements: [
    {area: 'front', providerPlacementType: 'front_dtfabric', mockupPlacement: 'front_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'back', providerPlacementType: 'back_dtfabric', mockupPlacement: 'back_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'left_sleeve', providerPlacementType: 'sleeve_left_dtfabric', mockupPlacement: 'sleeve_left_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'right_sleeve', providerPlacementType: 'sleeve_right_dtfabric', mockupPlacement: 'sleeve_right_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'label_panel', providerPlacementType: 'label_panel_dtfabric', mockupPlacement: 'label_panel_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'label_inside', providerPlacementType: 'label_inside_dtfabric', mockupPlacement: 'label_inside_dtfabric', techniques: ['All-Over Cotton']},
  ],
};

const aopProduct = {
  ...baseProduct,
  slug: 'test-aop-sweatshirt',
  production: {
    ...baseProduct.production,
    baseProduct: 'printful-aop-cotton-sweatshirt-white',
    technique: 'All-Over Cotton',
    placements: [
      {area: 'front', file: 'assets/print/test-aop-front.png'},
      {area: 'back', file: 'assets/print/test-aop-back.png'},
      {area: 'left_sleeve', file: 'assets/print/test-aop-left.png'},
      {area: 'right_sleeve', file: 'assets/print/test-aop-right.png'},
      {area: 'label_panel', file: 'assets/print/test-aop-label-panel.png'},
      {area: 'label_inside', file: 'assets/print/test-aop-inside-label.png'},
    ],
  },
  providerRefs: {
    printful: {
      productId: null,
      mockupTaskKey: null,
      variants: [],
    },
  },
  artDirector: {
    aopSpec: {
      garmentFirst: true,
      palette: {fabric: '#f4efe6', ink: '#111111', accent: '#0047ff'},
      front: {primaryText: 'Research & Deployment Co.'},
      back: {statement: 'Research after deployment'},
      sleeves: {motif: 'tribal-wave', leftText: 'Research', rightText: 'Deploy'},
    },
  },
};

test('validates complete draft products with commerce fields', () => {
  assert.deepEqual(validateProducts([baseProduct]), []);
});

test('customer catalog manifest includes AOP sweatshirts and rate reset long sleeve', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../merch/products.json', import.meta.url), 'utf8'),
  );
  const aopSlugs = [
    'research-deployment-co-sweatshirt',
    'terminal-ritual-sweatshirt',
    'queue-weather-cotton-sweatshirt',
  ];

  const slugs = manifest.map((product) => product.slug);
  for (const requiredSlug of [...aopSlugs, 'codex-rate-reset-long-sleeve']) {
    assert.ok(slugs.includes(requiredSlug), `missing canonical product ${requiredSlug}`);
  }
  assert.equal(new Set(slugs).size, slugs.length, 'product slugs must remain unique');

  for (const product of manifest.filter((item) => aopSlugs.includes(item.slug))) {
    assert.equal(product.production.baseProduct, 'printful-aop-cotton-sweatshirt-white');
    assert.equal(product.production.technique, 'All-Over Cotton');
    assert.equal(product.assets.mockups[0], catalogMockupPath(product));
    assert.deepEqual(
      product.production.placements.map((placement) => placement.area),
      AOP_COTTON_REQUIRED_PLACEMENTS,
    );
  }

  const researchDeployment = manifest.find(
    (product) => product.slug === 'research-deployment-co-sweatshirt',
  );
  assert.equal(
    researchDeployment.assets.customerPhotos[0],
    'assets/mockups/research-deployment-co-worn-front.jpg',
  );

  const rateReset = manifest.find(
    (product) => product.slug === 'codex-rate-reset-long-sleeve',
  );
  assert.equal(rateReset.production.baseProduct, 'bella-canvas-3501-black');
  assert.equal(rateReset.production.technique, 'DTG');
  assert.equal(rateReset.assets.customerPhotos[0], 'assets/mockups/codex-rate-reset-photoshoot-front.png');
});

test('rejects legacy provider-specific product fields', () => {
  const legacy = {
    ...baseProduct,
    baseProduct: 'bella-canvas-3001-black',
    printful: {
      technique: 'DTFlex',
      placements: [{area: 'front', file: 'assets/print/legacy.png'}],
    },
    meme: {...baseProduct.meme, xQuery: 'codex', xSources: []},
  };
  delete legacy.production;
  delete legacy.providerRefs;
  delete legacy.signals;

  const errors = validateProducts([legacy]);
  assert.ok(errors.some((error) => error.includes('missing production')));
  assert.ok(errors.some((error) => error.includes('legacy printful field')));
  assert.ok(errors.some((error) => error.includes('legacy X signal fields')));
});

test('new merch defaults to AOP unless standard is explicit', () => {
  assert.deepEqual(parseNewProductArgs(['Research Uniform']), {
    title: 'Research Uniform',
    mode: 'aop',
  });
  assert.deepEqual(parseNewProductArgs(['--standard', 'Sticker Pack']), {
    title: 'Sticker Pack',
    mode: 'standard',
  });
  assert.throws(
    () => parseNewProductArgs(['--aop', '--standard', 'Confused Drop']),
    /Choose either --aop or --standard/,
  );
});

test('requires rights note, placements, commerce, and supported technique', () => {
  const invalid = {
    ...baseProduct,
    meme: {...baseProduct.meme, rightsNote: ''},
    commerce: {...baseProduct.commerce, handle: '', unitAmount: 0},
    production: {...baseProduct.production, technique: 'Laser', placements: []},
  };

  const errors = validateProducts([invalid]);
  assert.ok(errors.some((error) => error.includes('rights note')));
  assert.ok(errors.some((error) => error.includes('unsupported')));
  assert.ok(errors.some((error) => error.includes('placement')));
  assert.ok(errors.some((error) => error.includes('commerce handle')));
  assert.ok(errors.some((error) => error.includes('commerce price')));
});

test('builds direct Printful payloads from commerce data', () => {
  const payload = printfulPayload(baseProduct, baseBlank, {
    siteUrl: 'https://merch.example',
  });
  assert.equal(payload.sync_product.external_id, 'test-shirt');
  assert.equal(
    payload.sync_product.thumbnail,
    'https://merch.example/assets/mockups/test-shirt-front.png',
  );
  assert.equal(payload.sync_variants[0].external_id, 'test-shirt:4017');
  assert.equal(payload.sync_variants[0].variant_id, 4017);
  assert.equal(payload.sync_variants[0].retail_price, '42.00');
  assert.equal(payload.sync_variants[0].files[0].type, 'front_dtf');
  assert.equal(
    payload.sync_variants[0].files[0].url,
    'https://merch.example/assets/print/test-shirt-front.png',
  );
});

test('extracts Printful sync variant IDs only from array responses', () => {
  assert.deepEqual(
    printfulStoreSyncVariantIds({
      result: {id: 13, variants: 10},
    }),
    [],
  );
  assert.deepEqual(
    printfulStoreSyncVariantIds({
      result: {
        sync_variants: [
          {id: 123, variant_id: 4017},
          {sync_variant_id: 124, variant_id: 4018},
        ],
      },
    }),
    [123, 124],
  );
});

test('adds existing Printful sync variant IDs to update payloads', () => {
  const payload = printfulPayload(baseProduct, baseBlank, {
    siteUrl: 'https://merch.example',
  });
  const updatePayload = printfulPayloadWithSyncVariantIds(payload, {
    result: {
      sync_variants: [
        {
          id: 987,
          external_id: 'test-shirt:4017',
          variant_id: 4017,
        },
      ],
    },
  });

  assert.equal(updatePayload.sync_variants[0].id, 987);
  assert.equal(updatePayload.sync_variants[0].external_id, 'test-shirt:4017');
});

test('binds a stored Printful product reference to the expected external ID', () => {
  const response = {
    result: {
      sync_product: {id: 42, external_id: 'weekly-safe-product'},
    },
  };

  assert.equal(printfulStoreProductExternalId(response), 'weekly-safe-product');
  assert.equal(
    printfulStoreProductMatchesExternalId(response, 'weekly-safe-product'),
    true,
  );
  assert.equal(
    printfulStoreProductMatchesExternalId(response, 'unrelated-product'),
    false,
  );
  assert.equal(
    printfulStoreProductMatchesAnyExternalId(response, [
      'canonical-product',
      'weekly-safe-product',
    ]),
    true,
  );
  assert.equal(
    printfulStoreProductMatchesAnyExternalId(response, [
      'canonical-product',
      'unrelated-product',
    ]),
    false,
  );
  assert.equal(printfulStoreProductMatchesExternalId({result: {id: 42}}, 'missing'), false);
});

test('treats empty or incomplete live Printful variants as missing', () => {
  assert.deepEqual(missingPrintfulCatalogVariantIds([4017, 4018], {result: {}}), [
    4017,
    4018,
  ]);
  assert.deepEqual(
    missingPrintfulCatalogVariantIds([4017, 4018], {
      result: {sync_variants: [{variant_id: '4017'}]},
    }),
    [4018],
  );
});

test('detects stale local Printful sync variant IDs', () => {
  assert.deepEqual(
    mismatchedPrintfulSyncVariantMappings(
      [
        {catalogVariantId: 4017, syncVariantId: 123},
        {catalogVariantId: 4018, syncVariantId: 124},
      ],
      {
        result: {
          sync_variants: [
            {id: 999, variant_id: 4017},
            {id: 124, variant_id: 4018},
          ],
        },
      },
    ),
    [{catalogVariantId: 4017, expectedSyncVariantId: 123, actualSyncVariantId: 999}],
  );
});

test('records terminal mockup failures and clears the task for a bounded retry', () => {
  const ref = {
    mockupTaskKey: 'task-completed-without-assets',
    mockupTaskFailures: 1,
  };

  recordPrintfulMockupTaskFailure(ref);

  assert.equal(ref.lastFailedMockupTaskKey, 'task-completed-without-assets');
  assert.equal(ref.mockupTaskFailures, 2);
  assert.equal(ref.mockupTaskKey, null);
});

test('builds Printful mockup task payload using public site URLs', () => {
  const payload = printfulMockupTaskPayload(baseProduct, baseBlank, {
    siteUrl: 'https://merch.example',
  });
  assert.deepEqual(payload.variant_ids, [4017, 4018]);
  assert.equal(payload.files[0].placement, 'front_dtf');
  assert.equal(
    payload.files[0].image_url,
    'https://merch.example/assets/print/test-shirt-front.png',
  );
});

test('preflights Printful technique compatibility before image generation', () => {
  const preflight = generationPreflight(baseProduct, baseBlank, techniqueCatalog);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.technique, 'DTFlex');
  assert.equal(preflight.supportedPlacements[0].providerPlacementType, 'front_dtf');
});

test('preflights All-Over Cotton as full panel system', () => {
  const preflight = generationPreflight(aopProduct, aopBlank, techniqueCatalog);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.technique, 'All-Over Cotton');
  assert.equal(preflight.supportedPlacements.length, 6);
  assert.equal(preflight.supportedPlacements[0].providerPlacementType, 'front_dtfabric');
});

test('keeps catalog mockups first for AOP customer presentation', () => {
  const product = structuredClone(aopProduct);
  product.assets.mockups = [
    'assets/mockups/test-aop-front.png',
    'assets/mockups/test-aop-back.png',
  ];

  const primaryMockup = ensureCatalogMockupFirst(product);
  assert.equal(primaryMockup, 'assets/mockups/test-aop-sweatshirt-catalog.png');
  assert.deepEqual(product.assets.mockups, [
    'assets/mockups/test-aop-sweatshirt-catalog.png',
    'assets/mockups/test-aop-front.png',
    'assets/mockups/test-aop-back.png',
  ]);
});

test('photoshooter uses provider mockups before catalog and technical fallbacks', () => {
  const product = structuredClone(aopProduct);
  product.assets.artwork = 'assets/artwork/test-aop-concept.png';
  product.assets.mockups = [
    'assets/mockups/test-aop-sweatshirt-catalog.png',
    'assets/mockups/test-aop-front.png',
    'assets/mockups/test-aop-printful-1.jpg',
    'assets/mockups/test-aop-back.png',
  ];
  product.assets.customerPhotos = ['assets/mockups/test-aop-photoshoot-front.png'];

  assert.equal(
    customerPhotoPath(product, 'front', 'jpeg'),
    'assets/mockups/test-aop-sweatshirt-photoshoot-front.jpg',
  );
  assert.deepEqual(photoshootSourceCandidates(product), [
    'assets/mockups/test-aop-printful-1.jpg',
    'assets/mockups/test-aop-sweatshirt-catalog.png',
    'assets/mockups/test-aop-front.png',
    'assets/mockups/test-aop-back.png',
    'assets/artwork/test-aop-concept.png',
  ]);
});

test('photoshooter prompt preserves mockup source of truth', () => {
  const product = structuredClone(aopProduct);
  product.production.placements[0].text = 'RATE RESET';
  product.production.placements[3].text = 'RETRY-OK';

  const prompt = photoshootPrompt(product, aopBlank, artDirection, {
    view: 'front',
  });

  assert.match(prompt, /final Codex merch photoshooter/);
  assert.match(prompt, /source of truth/);
  assert.match(prompt, /front: "RATE RESET"/);
  assert.match(prompt, /right_sleeve: "RETRY-OK"/);
  assert.match(prompt, /realistic cotton fleece texture/);
  assert.match(prompt, /Do not invent new slogans/);
});

test('photoshooter readiness requires generated customer photos', () => {
  const missing = verifyPhotoshootReadiness(aopProduct, {checkFiles: false});
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.some((issue) => issue.includes('missing photoshooter')));

  const product = structuredClone(aopProduct);
  product.assets.customerPhotos = ['assets/mockups/test-aop-photoshoot-front.png'];
  const ready = verifyPhotoshootReadiness(product, {checkFiles: false});
  assert.equal(ready.ok, true);
});

test('photoshooter replaces a corrupt checkpoint atomically and then reuses it', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'merch-photoshoot-'));
  const outputPath = path.join(directory, 'customer-photo.png');
  const sharp = (await import('sharp')).default;
  const validImage = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 4,
      background: {r: 30, g: 60, b: 90, alpha: 1},
    },
  })
    .png()
    .toBuffer();
  let generations = 0;

  try {
    await writeFile(outputPath, validImage.subarray(0, 24));
    const repaired = await ensurePhotoshootOutput({
      outputPath,
      generate: async () => {
        generations += 1;
        return validImage;
      },
    });

    assert.equal(repaired.skippedExisting, false);
    assert.equal(generations, 1);
    assert.deepEqual(await readFile(outputPath), validImage);
    assert.equal(await sharp(outputPath).metadata().then(() => true), true);
    assert.equal(
      await readFile(`${outputPath}.tmp`).then(
        () => true,
        (error) => error?.code !== 'ENOENT',
      ),
      false,
    );

    const replay = await ensurePhotoshootOutput({
      outputPath,
      generate: async () => {
        generations += 1;
        return validImage;
      },
    });
    assert.equal(replay.skippedExisting, true);
    assert.equal(generations, 1);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('verifies local Printful readiness for complete AOP products', () => {
  const product = structuredClone(aopProduct);
  product.workflow = {status: 'mockups_ready'};
  product.providerRefs.printful = {
    productId: 123,
    mockupTaskKey: 'gt-test',
    variants: [
      {
        variantId: 'test-aop-sweatshirt:33966',
        catalogVariantId: 33966,
        syncVariantId: 9001,
        available: true,
      },
    ],
  };
  ensureCatalogMockupFirst(product);
  product.assets.mockups.splice(1, 0, 'assets/mockups/test-aop-printful-1.jpg');

  const report = verifyPrintfulReadiness(product, aopBlank, {checkFiles: false});
  assert.equal(report.ok, true);
  assert.deepEqual(report.issues, []);
});

test('rejects Printful readiness when sync refs are missing', () => {
  const product = structuredClone(aopProduct);
  product.workflow = {status: 'mockups_ready'};
  ensureCatalogMockupFirst(product);

  const report = verifyPrintfulReadiness(product, aopBlank, {checkFiles: false});
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some((issue) =>
      issue.includes('missing providerRefs.printful.productId'),
    ),
  );
  assert.ok(
    report.issues.some((issue) =>
      issue.includes('missing downloaded Printful provider mockup'),
    ),
  );
});

test('rejects incomplete All-Over Cotton products before generation', () => {
  const invalid = {
    ...aopProduct,
    production: {
      ...aopProduct.production,
      placements: [{area: 'front', file: 'assets/print/front.png'}],
    },
  };

  const preflight = generationPreflight(invalid, aopBlank, techniqueCatalog);
  assert.equal(preflight.ok, false);
  assert.ok(preflight.errors.some((error) => error.includes('requires back placement')));
});

test('art director accepts garment-first AOP specs and rejects poster logic', () => {
  const accepted = artDirectorReview(aopProduct, aopBlank, artDirection);
  assert.equal(accepted.accepted, true);

  const rejected = artDirectorReview(
    {
      ...aopProduct,
      prompts: ['dense poster collage with sticker-bomb square artwork'],
    },
    aopBlank,
    artDirection,
  );
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.findings.some((finding) => finding.includes('poster/collage')));
});

test('adds Printful production constraints and art direction to generation prompt', () => {
  const techniquePrompt = printfulTechniquePrompt(baseProduct, baseBlank, techniqueCatalog);
  assert.match(techniquePrompt, /Production technique: DTFlex/);
  assert.match(techniquePrompt, /front -> provider file type front_dtf/);

  const directionPrompt = artDirectionPrompt(artDirection);
  assert.match(directionPrompt, /Codex Supply House/);
  assert.match(directionPrompt, /Avoid: No Supreme box logo/);

  const combined = generationDirectionPrompt(
    baseProduct,
    baseBlank,
    techniqueCatalog,
    artDirection,
  );
  assert.match(combined, /No copied Supply Co product artwork/);
});

test('compose plan keeps deterministic text layers explicit', () => {
  const plan = composePrintFilePlan(baseProduct);
  assert.equal(plan.deterministicTextLayer, true);
  assert.ok(plan.outputChecks.length >= 3);
});

test('builds OpenAI image generation requests with gpt-image-2', () => {
  const prompt = buildImagePrompt({
    brief: 'Original terminal joke.',
    textLayer: 'SHIP IT',
    productKind: 'apparel',
  });
  const request = buildImageGenerationRequest({prompt});
  assert.equal(request.model, 'gpt-image-2');
  assert.equal(request.output_format, 'png');
  assert.match(request.prompt, /SHIP IT/);
});

test('builds OpenAI image edit requests for photoshooter renders', () => {
  const request = buildImageEditRequest({
    prompt: 'Render the supplied mockup as a real garment photo.',
  });

  assert.equal(request.model, 'gpt-image-1.5');
  assert.equal(request.output_format, 'png');
  assert.equal(request.background, 'opaque');
  assert.equal(request.size, '1536x1024');
  assert.match(request.prompt, /real garment photo/);
});

test('builds X recent search URL and stores metadata without post text', () => {
  const url = buildRecentSearchUrl({query: 'codex lang:en -is:retweet'});
  assert.match(url, /tweets\/search\/recent/);

  const summary = summarizeRecentSearch(
    {
      data: [
        {
          id: '42',
          text: 'do not copy this post',
          author_id: '7',
          created_at: '2026-05-26T10:00:00.000Z',
          public_metrics: {reply_count: 1, retweet_count: 2, like_count: 3},
        },
      ],
      includes: {users: [{id: '7', username: 'coder'}]},
    },
    'codex',
  );

  assert.equal(summary[0].url, 'https://x.com/i/web/status/42');
  assert.equal('text' in summary[0], false);
  assert.equal('authorUsername' in summary[0], false);
  assert.equal('authorVerified' in summary[0], false);
  assert.equal(summary[0].metrics.likes, 3);
});

test('signal provider wraps X retrieval behind a provider interface', () => {
  const provider = providerForSignal('x');
  const dryRun = provider.dryRun({
    query: 'codex lang:en -is:retweet',
    maxResults: 10,
  });
  assert.equal(provider.name, 'x');
  assert.match(dryRun.url, /tweets\/search\/recent/);
});

test('known Printful techniques and workflow states include commerce defaults', () => {
  assert.equal(allowedTechniques.has('DTG'), true);
  assert.equal(allowedTechniques.has('All-Over Cotton'), true);
  assert.equal(workflowStatuses.includes('mockups_ready'), true);
  assert.equal(workflowStatuses.includes('published'), true);
  assert.equal(workflowStatuses.includes('legacy_draft'), false);
});

test('Printful dry-run references stay within the provider limit', () => {
  const externalId = printfulDryRunExternalId(
    'codex-rate-reset-long-sleeve',
  );
  assert.equal(externalId, 'CM-DRY-codex-rate-reset-long-sle');
  assert.ok(externalId.length <= 32);
});

test('workflow advancement does not regress later states', () => {
  const product = structuredClone(baseProduct);
  product.workflow = {status: 'mockups_ready'};

  advanceWorkflowStatus(product, 'generated');
  assert.equal(product.workflow.status, 'mockups_ready');

  advanceWorkflowStatus(product, 'published');
  assert.equal(product.workflow.status, 'published');
});

test('publication is constrained to the pilot until operational sign-off', () => {
  assert.doesNotThrow(() =>
    assertPilotPublicationAllowed(
      [{slug: 'codex-rate-reset-long-sleeve'}],
      {},
    ),
  );
  assert.throws(
    () => assertPilotPublicationAllowed([{slug: 'another-product'}], {}),
    /complete the live pilot/,
  );
  assert.doesNotThrow(() =>
    assertPilotPublicationAllowed(
      [{slug: 'another-product'}],
      {MERCH_EXPANSION_APPROVED: 'true'},
    ),
  );
});

test('explicit upstream changes invalidate approval and Printful synchronization', () => {
  const product = structuredClone(baseProduct);
  product.workflow = {status: 'approved'};
  product.approval = {approvedAt: '2026-01-01', approvedBy: 'reviewer', notes: ''};
  product.providerRefs.printful = {
    productId: 123,
    mockupTaskKey: 'task',
    variants: [
      {
        variantId: 'test-shirt:4017',
        catalogVariantId: 4017,
        syncVariantId: 99,
        available: true,
      },
    ],
  };

  setWorkflowStatus(product, 'generated');
  assert.equal(product.approval.approvedAt, null);
  assert.equal(product.providerRefs.printful.productId, null);
  assert.deepEqual(product.providerRefs.printful.variants, []);
});
