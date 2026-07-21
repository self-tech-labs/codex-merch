import assert from 'node:assert/strict';
import test from 'node:test';
import {
  merchantIdentity,
  merchantJuryCatalog,
  merchantJuryDisplayAmounts,
  merchantPilot,
  merchantPolicyPages,
  MERCHANT_CONTACT_EMAIL,
  MERCHANT_POLICY_PAGE_IDS,
  MERCHANT_POLICY_VERSION,
} from './merchant-policy';

test('merchant policy identity and reviewed version stay explicit', () => {
  assert.equal(MERCHANT_POLICY_VERSION, '2026-07-21');
  assert.equal(MERCHANT_CONTACT_EMAIL, 'elliot@ritsl.com');
  assert.deepEqual(merchantIdentity, {
    legalName: 'RITSL Elliot Vaucher',
    legalForm: 'Sole proprietorship',
    proprietor: 'Elliot Richard Vaucher',
    address: {
      street: 'Avenue Virgile-Rossel 18',
      postalCode: '1012',
      city: 'Lausanne',
      country: 'Switzerland',
    },
    uid: 'CHE-205.406.793',
    commercialRegisterNumber: 'CH-550.1.243.579-7',
    email: MERCHANT_CONTACT_EMAIL,
  });
});

test('jury display amounts convert centimes once and preserve the signed total', () => {
  assert.deepEqual(merchantJuryDisplayAmounts(58), {
    shipping: 9.1,
    total: 67.1,
  });
  assert.equal(merchantPilot.shippingAmount, 910);
  assert.equal(merchantPilot.stripeTaxBehavior, 'inclusive');
  assert.equal(merchantPilot.printfulProductId, 436601984);
  assert.equal(merchantPilot.printfulVariants.length, 3);
  assert.equal(merchantJuryCatalog.products.length, 11);
  assert.equal(
    new Set(merchantJuryCatalog.products.map((product) => product.productSlug)).size,
    11,
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
