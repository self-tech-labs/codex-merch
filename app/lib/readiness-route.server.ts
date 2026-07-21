import type {AppLoadContext} from 'react-router';
import {getEnv} from '~/lib/env.server';
import {
  getMerchProduct,
  getProductVariants,
  isPurchasableVariant,
} from '~/lib/merch';
import {
  assertCheckoutConfiguration,
  normalizeCheckoutLines,
} from '~/lib/stripe.server';
import {probeCheckoutDependencies} from '~/lib/readiness.server';

const responseHeaders = {'Cache-Control': 'no-store'};

type ReadinessDependencies = {
  probeDependencies?: typeof probeCheckoutDependencies;
};

type ReadinessLoaderArgs = {
  context: AppLoadContext;
  request: Request;
};

export function createReadinessLoader({
  probeDependencies = probeCheckoutDependencies,
}: ReadinessDependencies = {}) {
  return async function readinessLoader({
    context,
    request,
  }: ReadinessLoaderArgs) {
    const productSlug = new URL(request.url).searchParams.get('product') || '';
    if (!productSlug) {
      return Response.json(
        {ready: false, code: 'missing_product'},
        {status: 400, headers: responseHeaders},
      );
    }

    const product = getMerchProduct(productSlug, {includeInternal: true});
    const variant = product
      ? getProductVariants(product).find((candidate) =>
          isPurchasableVariant(product, candidate),
        )
      : null;
    if (!product || !variant) {
      return Response.json(
        {ready: false, code: 'product_not_purchasable'},
        {status: 404, headers: responseHeaders},
      );
    }

    const env = getEnv(context);
    let liveReadiness;
    try {
      assertCheckoutConfiguration(env);
      if (!env.STRIPE_WEBHOOK_SECRET) {
        throw new Error('Missing Stripe webhook secret');
      }
      if (env.PRINTFUL_AUTO_CONFIRM !== 'false') {
        throw new Error('Printful auto-confirm must remain disabled');
      }
      normalizeCheckoutLines([
        {productSlug: product.slug, variantId: variant.id, quantity: 1},
      ]);
      liveReadiness = await probeDependencies(env);
    } catch {
      return Response.json(
        {ready: false, code: 'checkout_not_configured'},
        {status: 503, headers: responseHeaders},
      );
    }

    return Response.json(
      {
        ready: true,
        productSlug: product.slug,
        handle: product.commerce.handle,
        title: product.title,
        variantId: variant.id,
        currency: product.commerce.currency,
        unitAmount: product.commerce.unitAmount,
        provider: product.production.provider,
        paymentMode: liveReadiness.paymentMode,
        databaseReady: liveReadiness.databaseReady,
        stripeReady: liveReadiness.stripeReady,
        printfulAutoConfirm: false,
      },
      {headers: responseHeaders},
    );
  };
}
