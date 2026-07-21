import {expect, test, type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

const runtimeErrors = new WeakMap<Page, string[]>();
const previewAccessUrl = process.env.PLAYWRIGHT_PREVIEW_ACCESS_URL_FILE
  ? readFileSync(process.env.PLAYWRIGHT_PREVIEW_ACCESS_URL_FILE, 'utf8').trim()
  : '';

function isVercelPreviewToolbarNoise(message: string) {
  return (
    message.includes("https://vercel.live/_next-live/feedback/feedback.js") ||
    (Boolean(previewAccessUrl) &&
      message.includes('Failed to fetch manifest patches TypeError: Failed to fetch'))
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
  await expect(
    page.getByText('Fan-made Build Week project · Not official OpenAI merch', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/judge demo is free and requires no purchase/i),
  ).toBeVisible();
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
  await expect(
    page.getByText(/This is not official OpenAI merchandise/i),
  ).toBeVisible();
  await expect(page.getByRole('button', {name: 'Checkout disabled'})).toBeDisabled();

  await page.goto('/cart');
  await expect(page.getByText(/checkout is disabled in this public build/i)).toBeVisible();
});

test('research and deployment carousel leads with the supplied worn photo', async ({
  page,
}) => {
  await page.goto('/products/research-deployment-co-sweatshirt');

  await expect(
    page.getByRole('heading', {
      name: 'Research & Deployment Co. Cotton Sweatshirt',
    }),
  ).toBeVisible();
  await expect(page.locator('.mockup-frame img')).toHaveAttribute(
    'src',
    '/assets/mockups/research-deployment-co-worn-front.jpg',
  );
  await expect(page.locator('.mockup-strip img')).toHaveCount(5);
  await expect(page.locator('.mockup-strip img').first()).toHaveAttribute(
    'src',
    '/assets/mockups/research-deployment-co-worn-front.jpg',
  );
});

test('how it works explains the open signal-to-product pipeline', async ({page}) => {
  await page.goto('/how-it-works');

  await expect(
    page.getByRole('heading', {name: 'Signal in. Merch out.'}),
  ).toBeVisible();
  await expect(
    page.getByText('Create a preview merch for the trend ‘The Sol Shines’.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Owner-supplied trend', {exact: true}),
  ).toBeVisible();
  await expect(
    page.getByText('30 authorized X posts', {exact: true}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Five moves. One inspectable run.'}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'GPT-5.6 proposes'}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Code proves'}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'A human releases'}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Fork the pipeline, not the promise.'}),
  ).toBeVisible();
  await expect(
    page.getByText('scripts/prompts/ · merch/weekly/schemas/', {exact: true}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'A small proof for a large fashion problem.',
    }),
  ).toBeVisible();
  await expect(page.getByText(/Richemont and LVMH/i)).toBeVisible();
  await expect(page.getByText(/Zara and Shein/i)).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Build Week Preview', exact: true}),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', {name: 'Production release', exact: true}),
  ).toBeVisible();
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
