import {Form, Link, useNavigation} from 'react-router';
import type {Route} from './+types/cart';
import {
  checkoutCartValue,
  lineImage,
  lineTitle,
  money,
  useCart,
} from '~/lib/cart';
import {
  getApprovedProduct,
  merchantCatalog,
  merchantDisplayAmounts,
} from '~/lib/merchant-catalog';
import {MERCHANT_POLICY_VERSION} from '~/lib/merchant-policy.shared';
import {
  useCheckoutAvailability,
  useStorefrontMode,
} from '~/lib/storefront-mode';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Codex Merch | Cart'},
    {name: 'robots', content: 'noindex,nofollow'},
  ];
};

export default function Cart() {
  const {displayLines, removeLine, subtotal, updateQuantity} = useCart();
  const storefrontMode = useStorefrontMode();
  const checkout = useCheckoutAvailability();
  const preview = storefrontMode === 'preview';
  const currency = displayLines[0]?.product.currency || 'USD';
  const shippingApplies =
    displayLines.length > 0 &&
    displayLines.every(
      (line) => Boolean(getApprovedProduct(line.product.slug)),
    );
  const checkoutAvailable = !preview && checkout.enabled && shippingApplies;
  const displayAmounts = merchantDisplayAmounts(subtotal);
  const displayedTotal = shippingApplies ? displayAmounts.total : subtotal;
  const fulfillmentProvider = displayLines[0]?.product.provider || 'printful';
  const fulfillmentLabel =
    fulfillmentProvider.charAt(0).toUpperCase() + fulfillmentProvider.slice(1);
  const navigation = useNavigation();
  const checkingOut =
    navigation.state !== 'idle' && navigation.formAction === '/api/checkout';

  return (
    <div className="cart-page">
      <header className="cart-header">
        <h1>Cart</h1>
        <Link to="/">Continue shopping</Link>
      </header>

      {displayLines.length ? (
        <div className="cart-layout">
          <ul className="local-cart-lines" aria-label="Cart items">
            {displayLines.map((line) => (
              <li
                key={`${line.productSlug}:${line.variantId}`}
                className="local-cart-line"
              >
                <img src={lineImage(line)} alt="" />
                <div>
                  <h2>{line.product.title}</h2>
                  <p>{lineTitle(line)}</p>
                  <p>{money(line.lineTotal, line.product.currency)}</p>
                </div>
                <div className="quantity-stepper">
                  <button
                    type="button"
                    aria-label={`Reduce ${line.product.title} quantity`}
                    onClick={() =>
                      updateQuantity(
                        line.productSlug,
                        line.variantId,
                        line.quantity - 1,
                      )
                    }
                  >
                    -
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    type="button"
                    aria-label={`Increase ${line.product.title} quantity`}
                    onClick={() =>
                      updateQuantity(
                        line.productSlug,
                        line.variantId,
                        line.quantity + 1,
                      )
                    }
                  >
                    +
                  </button>
                </div>
                <button
                  className="cart-remove"
                  type="button"
                  onClick={() => removeLine(line.productSlug, line.variantId)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <aside className="checkout-panel">
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{money(subtotal, currency)}</dd>
              </div>
              <div>
                <dt>Fulfillment</dt>
                <dd>{fulfillmentLabel}</dd>
              </div>
              {shippingApplies ? (
                <>
                  <div>
                    <dt>Shipping</dt>
                    <dd>
                      {money(
                        displayAmounts.shipping,
                        merchantCatalog.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>
                      {money(displayedTotal, merchantCatalog.currency)}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {checkoutAvailable ? (
              <Form action="/api/checkout" method="post">
                <input
                  type="hidden"
                  name="cart"
                  value={checkoutCartValue(displayLines)}
                />
                <label className="checkout-consent">
                  <input
                    required
                    type="checkbox"
                    name="merchantTermsAccepted"
                    value={MERCHANT_POLICY_VERSION}
                  />
                  <span>
                    I accept the <Link to="/policies/terms">Terms of sale</Link>{' '}
                    and confirm that I have reviewed the{' '}
                    <Link to="/policies/shipping">Shipping</Link>,{' '}
                    <Link to="/policies/returns">Returns</Link>, and{' '}
                    <Link to="/policies/privacy">Privacy</Link> policies.
                  </span>
                </label>
                <button disabled={checkingOut} type="submit">
                  {checkingOut
                    ? 'Opening secure checkout…'
                    : 'Pay securely with Stripe'}
                </button>
              </Form>
            ) : (
              <button disabled type="button">
                {preview
                  ? 'Checkout disabled in preview'
                  : 'Checkout closed'}
              </button>
            )}
            <p>
              {preview
                ? 'This deployment cannot create a payment or production order. Terms acceptance will be required when checkout opens.'
                : checkoutAvailable
                  ? `Fan-made, unofficial merchandise. Shipping is ${money(merchantCatalog.shippingAmount / 100, merchantCatalog.currency)} per order. Review the final CHF total in Stripe before paying.`
                  : 'Real checkout is currently unavailable.'}
            </p>
            {shippingApplies ? (
              <p>
                The seller bears normal import, customs, and carrier-clearance
                charges for the supported Switzerland and United States delivery
                routes.
              </p>
            ) : null}
            {preview ? (
              <p className="checkout-policy-links">
                Review the <Link to="/policies/terms">Terms</Link>,{' '}
                <Link to="/policies/shipping">Shipping</Link>,{' '}
                <Link to="/policies/returns">Returns</Link>, and{' '}
                <Link to="/policies/privacy">Privacy</Link> policies.
              </p>
            ) : null}
          </aside>
        </div>
      ) : (
        <section className="cart-empty">
          <h2>Your cart is empty.</h2>
          <p>
            {preview
              ? 'Prototype preview — checkout is disabled in this public build.'
              : checkout.enabled
                ? 'Add a product to continue to secure Stripe Checkout.'
                : 'Checkout is currently closed.'}
          </p>
          <Link to="/">Browse drops</Link>
        </section>
      )}
    </div>
  );
}
