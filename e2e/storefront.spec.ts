import {expect, test, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

const runtimeErrors = new WeakMap<Page, string[]>();
const previewAccessUrl = process.env.PLAYWRIGHT_PREVIEW_ACCESS_URL_FILE
  ? readFileSync(process.env.PLAYWRIGHT_PREVIEW_ACCESS_URL_FILE, 'utf8').trim()
  : '';

function isVercelPreviewToolbarNoise(message: string) {
  if (!previewAccessUrl) return false;
  return (
    message.includes("https://vercel.live/_next-live/feedback/feedback.js") ||
    message.includes('Failed to fetch manifest patches TypeError: Failed to fetch')
  );
}

test.beforeEach(async ({page}) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('console', (message) => {
    const text = message.text();
    if (
      ['error', 'warning'].includes(message.type()) &&
      !isVercelPreviewToolbarNoise(text)
    ) {
      errors.push(`console.${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  if (previewAccessUrl) {
    const response = await page.goto(previewAccessUrl);
    expect(response?.ok(), 'Vercel share link should authorize the browser').toBe(true);
  }
});

test.afterEach(async ({page}) => {
  expect(runtimeErrors.get(page) ?? []).toEqual([]);
});

test('preview catalog is browseable but cannot be purchased', async ({page}) => {
  await page.goto('/');
  await expect(page.getByText('Prototype preview', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Checkout disabled', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Preview', {exact: true}).first()).toBeVisible();
  const solward = page.getByRole('link', {
    name: /Solward Index Cotton Sweatshirt/,
  });
  await expect(solward).toBeVisible();
  await solward.click();
  await expect(
    page.getByRole('heading', {name: 'Solward Index Cotton Sweatshirt'}),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex,nofollow',
  );
  await expect(page.locator('.mockup-strip img')).toHaveCount(4);
  await expect(page.getByRole('button', {name: 'Checkout disabled'})).toBeDisabled();

  await page.goto('/cart');
  await expect(page.getByText(/checkout is disabled in this public build/i)).toBeVisible();
});

test('how it works leads with the truthful owner-supplied preview path', async ({page}) => {
  await page.goto('/how-it-works');

  await expect(
    page.getByRole('heading', {name: 'One premise to a garment preview.'}),
  ).toBeVisible();
  await expect(
    page.getByText('Create a preview merch for the trend ‘The Sol Shines’.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Owner-supplied trend'}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Weekly X-list discovery'}),
  ).toBeVisible();
  await expect(page.getByText('None claimed', {exact: true})).toBeVisible();
  await expect(page.getByText('Skipped', {exact: true})).toBeVisible();
  await expect(
    page.getByText(
      'GPT-5.6 art direction → deterministic compositor → actual-render critic → prepress',
      {exact: true},
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Vercel Preview', exact: true}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Production candidate', exact: true}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Inspectable contracts', exact: true}),
  ).toBeVisible();
  await expect(
    page.getByText('scripts/prompts/weekly-trend.md', {exact: true}),
  ).toBeVisible();
  await expect(
    page.getByText('merch/weekly/schemas/art-direction.schema.json', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/strict JSON Schema Structured Outputs \/ store: false/i),
  ).toBeVisible();
  await expect(page.getByText(/5037 × 6600 px at 150 DPI/i)).toBeVisible();
  await expect(page.getByText('Prototype preview', {exact: true}).first()).toBeVisible();
  await expect(page.getByText('Checkout disabled', {exact: true}).first()).toBeVisible();
});

test('critical storefront routes render without runtime errors', async ({page}) => {
  for (const route of [
    '/',
    '/products/codex-rate-reset-long-sleeve',
    '/cart',
    '/how-it-works',
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
