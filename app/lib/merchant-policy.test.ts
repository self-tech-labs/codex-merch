import assert from 'node:assert/strict';
import test from 'node:test';
import {
  merchantCatalog,
  merchantDisplayAmounts,
} from './merchant-catalog';
import {
  isValidMerchantContactEmail,
  merchantContactEmail,
  merchantIdentity,
  merchantPolicyPages,
} from './merchant-policy.server';
import {
  MERCHANT_POLICY_PAGE_IDS,
  MERCHANT_POLICY_VERSION,
} from './merchant-policy.shared';

test('merchant policy identity and reviewed version stay explicit', () => {
  assert.equal(MERCHANT_POLICY_VERSION, '2026-08-26');
  assert.deepEqual(merchantIdentity, {
    legalName: 'Elliot Richard Vaucher',
    legalForm: 'Swiss sole proprietor',
    address: {
      street: 'Avenue Virgile-Rossel 18',
      postalCode: '1012',
      city: 'Lausanne',
      country: 'Switzerland',
    },
  });
});

test('merchant contact email must be explicitly configured and valid', () => {
  assert.equal(isValidMerchantContactEmail('support@example.com'), true);
  assert.equal(isValidMerchantContactEmail('invalid'), false);
  assert.equal(isValidMerchantContactEmail('elliot@ritsl.com'), false);
  assert.equal(
    isValidMerchantContactEmail('orders@self-tech-labs.example'),
    false,
  );
  assert.equal(
    merchantContactEmail({
      STOREFRONT_CONTACT_EMAIL: ' support@example.com ',
    } as AppEnv),
    'support@example.com',
  );
  assert.equal(
    merchantContactEmail({
      STOREFRONT_CONTACT_EMAIL: 'elliot@ritsl.com',
    } as AppEnv),
    null,
  );
  assert.equal(merchantContactEmail({} as AppEnv), null);
});

test('display amounts convert centimes once and preserve the signed total', () => {
  assert.deepEqual(merchantDisplayAmounts(58), {
    shipping: 9.1,
    total: 67.1,
  });
  assert.equal(merchantCatalog.shippingAmount, 910);
  assert.equal(merchantCatalog.stripeTaxBehavior, 'inclusive');
  assert.equal(merchantCatalog.products[0]?.printfulProductId, 436601984);
  assert.equal(
    merchantCatalog.products[0]?.productSlug,
    'codex-rate-reset-long-sleeve',
  );
  assert.equal(merchantCatalog.products[0]?.printfulVariants.length, 3);
  assert.equal(merchantCatalog.products.length, 1);
  assert.equal(
    new Set(merchantCatalog.products.map((product) => product.productSlug)).size,
    1,
  );
});

test('every public merchant policy has structured, substantive copy', () => {
  assert.deepEqual(Object.keys(merchantPolicyPages), MERCHANT_POLICY_PAGE_IDS);
  for (const page of Object.values(merchantPolicyPages)) {
    assert.ok(page.title.length > 3);
    assert.ok(page.summary.length > 40);
    assert.ok(page.sections.length > 0);
    for (const section of page.sections) {
      assert.ok(section.heading.length > 3);
      assert.ok(section.paragraphs.length > 0);
      assert.ok(section.paragraphs.every((paragraph) => paragraph.length > 30));
    }
  }
});

test('public policies remove legacy branding and preserve OpenAI protections', () => {
  const policyText = JSON.stringify(merchantPolicyPages);
  assert.doesNotMatch(policyText, /ritsl|self[- ]tech[- ]labs/i);

  const terms = merchantPolicyPages.terms.sections
    .flatMap((section) => section.paragraphs)
    .join(' ');
  assert.match(terms, /independent, fan-made project/i);
  assert.match(
    terms,
    /not affiliated with, authorized, sponsored, approved, or endorsed by OpenAI/i,
  );
  assert.match(
    terms,
    /claim no ownership, licence, authorization, or other rights/i,
  );
  assert.match(
    terms,
    /first notice or request through any reasonable contact channel/i,
  );
  assert.match(
    terms,
    /immediately suspend sale.*promptly remove it from the storefront/i,
  );
  assert.match(
    terms,
    /no cease-and-desist letter or further notice is required/i,
  );
});
