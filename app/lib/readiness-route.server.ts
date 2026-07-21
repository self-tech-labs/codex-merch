import type {AppLoadContext} from 'react-router';
import {getEnv} from '~/lib/env.server';
import {
  getMerchProduct,
  getProductVariants,
  isPurchasableVariant,
} from '~/lib/merch';
import {
  allowedShippingCountries,
  assertCheckoutConfiguration,
  assertMerchantPilotLines,
  normalizeCheckoutLines,
  shippingOptions,
} from '~/lib/stripe.server';
import {probeCheckoutDependencies} from '~/lib/readiness.server';
import {merchantPilot} from '~/lib/merchant-policy';

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
      const pilotLines = normalizeCheckoutLines([
        {productSlug: product.slug, variantId: variant.id, quantity: 1},
      ]);
      assertMerchantPilotLines(pilotLines);
      await shippingOptions(env, product.commerce.currency);
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
        policyVersion: env.STOREFRONT_POLICY_VERSION,
        shippingCountries: allowedShippingCountries(env),
        shippingAmount: merchantPilot.shippingAmount,
        maximumItemsPerOrder: merchantPilot.maximumItemsPerOrder,
        deliveryEstimateBusinessDays:
          merchantPilot.deliveryEstimateBusinessDays,
        paymentMode: liveReadiness.paymentMode,
        databaseReady: liveReadiness.databaseReady,
        stripeReady: liveReadiness.stripeReady,
        printfulAutoConfirm: false,
      },
      {headers: responseHeaders},
    );
  };
}
