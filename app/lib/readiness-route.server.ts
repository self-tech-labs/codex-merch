import type {AppLoadContext} from 'react-router';
import {getEnv} from '~/lib/env.server';
import {
  getMerchProduct,
  getProductVariants,
  isPurchasableVariant,
} from '~/lib/merch';
import {
  allowedShippingCountries,
  assertApprovedCatalogLines,
  assertCheckoutConfiguration,
  normalizeCheckoutLines,
  shippingOptions,
} from '~/lib/stripe.server';
import {probeCheckoutDependencies} from '~/lib/readiness.server';
import {
  getApprovedProduct,
  merchantCatalog,
} from '~/lib/merchant-catalog';
import {MERCHANT_POLICY_VERSION} from '~/lib/merchant-policy.shared';

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
    const approvedProduct = getApprovedProduct(product.slug);
    if (!approvedProduct) {
      return Response.json(
        {ready: false, code: 'product_not_approved_for_sale'},
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
      const checkoutLines = normalizeCheckoutLines([
        {productSlug: product.slug, variantId: variant.id, quantity: 1},
      ]);
      assertApprovedCatalogLines(checkoutLines);
      await shippingOptions(env, product.commerce.currency);
      liveReadiness = await probeDependencies(env, {}, approvedProduct);
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
        policyVersion: MERCHANT_POLICY_VERSION,
        shippingCountries: allowedShippingCountries(env),
        shippingAmount: merchantCatalog.shippingAmount,
        maximumItemsPerOrder: merchantCatalog.maximumItemsPerOrder,
        deliveryEstimateBusinessDays:
          merchantCatalog.deliveryEstimateBusinessDays,
        paymentMode: liveReadiness.paymentMode,
        databaseReady: liveReadiness.databaseReady,
        printfulReady: liveReadiness.printfulReady,
        stripeReady: liveReadiness.stripeReady,
        stripeWebhookReady: liveReadiness.stripeWebhookReady,
        printfulAutoConfirm: false,
      },
      {headers: responseHeaders},
    );
  };
}
