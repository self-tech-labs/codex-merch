import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceWorkflowStatus,
  allowedTechniques,
  composePrintFilePlan,
  printfulMockupTaskPayload,
  printfulPayload,
  printfulSyncVariantPayload,
  generationPreflight,
  artDirectorReview,
  artDirectionPrompt,
  generationDirectionPrompt,
  productSetIdentifier,
  printfulTechniquePrompt,
  shopifyPayload,
  shopifyProductSetInput,
  validateProducts,
  workflowStatuses,
} from './merch.mjs';
import {
  buildImageGenerationRequest,
  buildImagePrompt,
} from './adapters/openai-images.mjs';
import {
  buildRecentSearchUrl,
  summarizeRecentSearch,
} from './adapters/x-api.mjs';

const baseProduct = {
  id: 'drop-test',
  slug: 'test-shirt',
  title: 'Test Shirt',
  status: 'draft',
  workflow: {status: 'draft'},
  baseProduct: 'bella-canvas-3001-black',
  category: 'Codex',
  description: 'Test description.',
  meme: {
    source: 'Unit test',
    brief: 'Simple unit-test product.',
    rightsNote:
      'Unit test rights note with enough detail for validation to accept it.',
    xQuery: '',
    xSources: [],
  },
  shopify: {
    handle: 'test-shirt',
    price: '42.00',
    currency: 'USD',
    tags: ['codex'],
    variantId: null,
    productId: null,
    variants: [
      {
        id: 'gid://shopify/ProductVariant/123',
        externalId: '123',
        sku: 'TEST_SHIRT_BLACK_M',
        selectedOptions: [
          {name: 'Color', value: 'Black'},
          {name: 'Size', value: 'M'},
        ],
      },
    ],
    fileUrls: {front: 'https://cdn.shopify.com/test-shirt-front.png'},
    mockupFileUrls: {},
  },
  printful: {
    productId: null,
    syncProductId: null,
    mockupTaskKey: null,
    variantIds: [4017],
    syncVariants: [],
    technique: 'DTFlex',
    placements: [
      {
        area: 'front',
        file: 'assets/print/test-shirt-front.png',
      },
    ],
  },
  assets: {
    artwork: 'assets/artwork/test-shirt.png',
    printFiles: [
      {
        placement: 'front',
        path: 'assets/print/test-shirt-front.png',
        url: 'https://cdn.shopify.com/test-shirt-front.png',
      },
    ],
    mockups: ['merch/mockups/test-shirt-front.svg'],
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
    {color: 'Black', size: 'M', printfulVariantId: 4017},
    {color: 'Black', size: 'L', printfulVariantId: 4018},
  ],
  placements: [
    {
      area: 'front',
      printfulType: 'front_dtf',
      mockupPlacement: 'front_dtf',
      techniques: ['DTFlex'],
    },
    {
      area: 'front',
      printfulType: 'default',
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
  variants: [{color: 'White', size: 'M', printfulVariantId: 33966}],
  placements: [
    {area: 'front', printfulType: 'front_dtfabric', mockupPlacement: 'front_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'back', printfulType: 'back_dtfabric', mockupPlacement: 'back_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'left_sleeve', printfulType: 'sleeve_left_dtfabric', mockupPlacement: 'sleeve_left_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'right_sleeve', printfulType: 'sleeve_right_dtfabric', mockupPlacement: 'sleeve_right_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'label_panel', printfulType: 'label_panel_dtfabric', mockupPlacement: 'label_panel_dtfabric', techniques: ['All-Over Cotton']},
    {area: 'label_inside', printfulType: 'label_inside_dtfabric', mockupPlacement: 'label_inside_dtfabric', techniques: ['All-Over Cotton']},
  ],
};

const aopProduct = {
  ...baseProduct,
  slug: 'test-aop-sweatshirt',
  baseProduct: 'printful-aop-cotton-sweatshirt-white',
  printful: {
    ...baseProduct.printful,
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

test('validates complete draft products', () => {
  assert.deepEqual(validateProducts([baseProduct]), []);
});

test('requires rights note, placements, and supported technique', () => {
  const invalid = {
    ...baseProduct,
    meme: {...baseProduct.meme, rightsNote: ''},
    printful: {...baseProduct.printful, technique: 'Laser', placements: []},
  };

  const errors = validateProducts([invalid]);
  assert.equal(errors.length, 3);
  assert.ok(errors.some((error) => error.includes('rights note')));
  assert.ok(errors.some((error) => error.includes('unsupported')));
  assert.ok(errors.some((error) => error.includes('placement')));
});

test('requires print files and Printful sync data in later states', () => {
  const invalid = {
    ...baseProduct,
    status: 'printful_synced',
    workflow: {status: 'printful_synced'},
    printful: {
      ...baseProduct.printful,
      syncProductId: null,
      syncVariants: [],
      placements: [{area: 'front', file: 'assets/print/missing-file.png'}],
    },
  };

  const errors = validateProducts([invalid]);
  assert.equal(errors.length, 3);
  assert.ok(errors.some((error) => error.includes('missing print file')));
  assert.ok(errors.some((error) => error.includes('sync product ID')));
  assert.ok(errors.some((error) => error.includes('sync variants')));
});

test('builds legacy dry-run Printful payloads', () => {
  const payload = printfulPayload(baseProduct);
  assert.equal(payload.sync_product.external_id, 'test-shirt');
  assert.equal(payload.sync_variants[0].variant_id, 4017);
  assert.equal(payload.sync_variants[0].files[0].type, 'front');
});

test('builds Shopify productSet input with draft status and codex metafields', () => {
  const product = structuredClone(baseProduct);
  product.assets.mockups = ['https://cdn.shopify.com/test-shirt-mockup.jpg'];
  const payload = shopifyProductSetInput(product, baseBlank);
  assert.equal(payload.handle, 'test-shirt');
  assert.equal(payload.status, 'DRAFT');
  assert.equal(payload.productOptions.length, 2);
  assert.equal(payload.variants.length, 2);
  assert.equal(payload.files.length, 1);
  assert.equal(payload.metafields[0].value, 'drop-test');
});

test('can omit Shopify media from productSet updates', () => {
  const product = structuredClone(baseProduct);
  product.assets.mockups = ['https://cdn.shopify.com/test-shirt-mockup.jpg'];
  const payload = shopifyProductSetInput(product, baseBlank, {includeFiles: false});
  assert.equal(payload.handle, 'test-shirt');
  assert.equal('files' in payload, false);
});

test('keeps shopifyPayload backward-compatible', () => {
  const payload = shopifyPayload(baseProduct);
  assert.equal(payload.handle, 'test-shirt');
  assert.equal(payload.metafields[0].value, 'drop-test');
});

test('uses handle as productSet upsert identifier before Shopify ID exists', () => {
  assert.deepEqual(productSetIdentifier(baseProduct), {handle: 'test-shirt'});
});

test('builds Printful sync variant payload from Shopify variant options', () => {
  const payload = printfulSyncVariantPayload(
    baseProduct,
    baseBlank,
    baseProduct.shopify.variants[0],
  );

  assert.equal(payload.variant_id, 4017);
  assert.equal(payload.files[0].type, 'front_dtf');
  assert.equal(payload.files[0].url, 'https://cdn.shopify.com/test-shirt-front.png');
});

test('builds Printful mockup task payload', () => {
  const payload = printfulMockupTaskPayload(baseProduct, baseBlank);
  assert.deepEqual(payload.variant_ids, [4017, 4018]);
  assert.equal(payload.files[0].placement, 'front_dtf');
  assert.equal(payload.files[0].image_url, 'https://cdn.shopify.com/test-shirt-front.png');
});

test('preflights Printful technique compatibility before image generation', () => {
  const preflight = generationPreflight(baseProduct, baseBlank, techniqueCatalog);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.technique, 'DTFlex');
  assert.equal(preflight.supportedPlacements[0].printfulType, 'front_dtf');
});

test('preflights All-Over Cotton as full panel system', () => {
  const preflight = generationPreflight(aopProduct, aopBlank, techniqueCatalog);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.technique, 'All-Over Cotton');
  assert.equal(preflight.supportedPlacements.length, 6);
  assert.equal(preflight.supportedPlacements[0].printfulType, 'front_dtfabric');
});

test('rejects incomplete All-Over Cotton products before generation', () => {
  const invalid = {
    ...aopProduct,
    printful: {
      ...aopProduct.printful,
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

test('rejects image generation when Printful cannot ship the selected placement', () => {
  const invalid = {
    ...baseProduct,
    printful: {
      ...baseProduct.printful,
      placements: [{area: 'right_sleeve', file: 'assets/print/sleeve.png'}],
    },
  };

  const preflight = generationPreflight(invalid, baseBlank, techniqueCatalog);
  assert.equal(preflight.ok, false);
  assert.match(preflight.errors[0], /does not support placement right_sleeve/);
});

test('adds Printful production constraints to the OpenAI prompt', () => {
  const prompt = printfulTechniquePrompt(baseProduct, baseBlank, techniqueCatalog);
  assert.match(prompt, /Printful production technique: DTFlex/);
  assert.match(prompt, /front -> Printful file type front_dtf/);
  assert.match(prompt, /standalone print artwork/);
});

test('adds art direction without copying source brands or products', () => {
  const prompt = artDirectionPrompt(artDirection);
  assert.match(prompt, /Codex Supply House/);
  assert.match(prompt, /skater graphics/);
  assert.match(prompt, /ASCII border fragments/);
  assert.match(prompt, /Avoid: No Supreme box logo/);
});

test('combines Printful production constraints and art direction for generation', () => {
  const prompt = generationDirectionPrompt(
    baseProduct,
    baseBlank,
    techniqueCatalog,
    artDirection,
  );
  assert.match(prompt, /Printful production technique: DTFlex/);
  assert.match(prompt, /Art direction: Codex Supply House/);
  assert.match(prompt, /No copied Supply Co product artwork/);
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

test('builds X recent search URL and stores metadata without post text', () => {
  const url = buildRecentSearchUrl({query: 'codex lang:en -is:retweet'});
  assert.match(url, /tweets\/search\/recent/);
  assert.match(url, /tweet\.fields=/);

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

  assert.equal(summary[0].url, 'https://x.com/coder/status/42');
  assert.equal('text' in summary[0], false);
  assert.equal(summary[0].metrics.likes, 3);
});

test('known Printful techniques and workflow states include MVP defaults', () => {
  assert.equal(allowedTechniques.has('DTG'), true);
  assert.equal(allowedTechniques.has('DTFlex'), true);
  assert.equal(allowedTechniques.has('Embroidery'), true);
  assert.equal(workflowStatuses.includes('mockups_ready'), true);
  assert.equal(workflowStatuses.includes('published'), true);
});

test('workflow advancement does not regress later states', () => {
  const product = structuredClone(baseProduct);
  product.status = 'mockups_ready';
  product.workflow = {status: 'mockups_ready'};

  advanceWorkflowStatus(product, 'shopify_draft');
  assert.equal(product.workflow.status, 'mockups_ready');

  advanceWorkflowStatus(product, 'published');
  assert.equal(product.workflow.status, 'published');
});
