import {expect, test, type Page} from '@playwright/test';

const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({page}) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      errors.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
});

test.afterEach(async ({page}) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

test('preview catalog is browseable but cannot be purchased', async ({page}) => {
  await page.goto('/');
  await expect(page.getByText('Preview', {exact: true}).first()).toBeVisible();
  await page.locator('.product-tile a').first().click();
  await expect(page.getByRole('button', {name: 'Preview only'})).toBeDisabled();
});

test('critical storefront routes render without runtime errors', async ({page}) => {
  for (const route of [
    '/',
    '/products/codex-rate-reset-long-sleeve',
    '/cart',
    '/checkout/cancel',
    '/policies/shipping',
  ]) {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} should return a successful response`).toBe(true);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
  }
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
