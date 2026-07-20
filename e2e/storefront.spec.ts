import {expect, test} from '@playwright/test';

test('preview catalog is browseable but cannot be purchased', async ({page}) => {
  const applicationErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') applicationErrors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByText('Preview', {exact: true}).first()).toBeVisible();
  await page.locator('.product-tile a').first().click();
  await expect(page.getByRole('button', {name: 'Preview only'})).toBeDisabled();
  expect(
    applicationErrors.filter((error) => /hydration|extra attributes/i.test(error)),
  ).toEqual([]);
});

test('unverified success URL never confirms an order', async ({page}) => {
  await page.goto('/checkout/success?session_id=unverified_test_value');
  await expect(page.getByRole('heading', {name: 'Payment not verified.'})).toBeVisible();
  await expect(page.getByText('Order received.')).toHaveCount(0);
});

test('legacy cart data is migrated and unavailable items are pruned', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem(
      'codex-merch-cart',
      JSON.stringify([
        {
          productSlug: 'codex-rate-reset',
          variantId: 'codex-rate-reset:10095',
          quantity: 1,
        },
      ]),
    );
  });
  await page.goto('/cart');
  await expect(page.getByRole('heading', {name: 'Your cart is empty.'})).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('codex-merch-cart') || '{}'),
  );
  expect(stored).toEqual({version: 1, lines: []});
});
