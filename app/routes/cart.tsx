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
  MERCHANT_POLICY_VERSION,
  getApprovedJuryProduct,
  merchantJuryCatalog,
  merchantJuryDisplayAmounts,
} from '~/lib/merchant-policy';
import {useJurySales, useStorefrontMode} from '~/lib/storefront-mode';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Codex Merch | Cart'},
    {name: 'robots', content: 'noindex,nofollow'},
  ];
};

export default function Cart() {
  const {displayLines, lines, removeLine, subtotal, updateQuantity} = useCart();
  const storefrontMode = useStorefrontMode();
  const jurySales = useJurySales();
  const preview = storefrontMode === 'preview';
  const checkoutAvailable = !preview && jurySales.enabled;
  const currency = displayLines[0]?.product.commerce.currency || 'USD';
  const juryShippingApplies =
    displayLines.length > 0 &&
    displayLines.every(
      (line) => Boolean(getApprovedJuryProduct(line.product.slug)),
    );
  const pilotAmounts = merchantJuryDisplayAmounts(subtotal);
  const displayedTotal = juryShippingApplies ? pilotAmounts.total : subtotal;
  const fulfillmentProvider = displayLines[0]?.product.production.provider || 'printful';
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
                  <p>{money(line.lineTotal, line.product.commerce.currency)}</p>
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
              {juryShippingApplies ? (
                <>
                  <div>
                    <dt>Shipping</dt>
                    <dd>
                      {money(
                        pilotAmounts.shipping,
                        merchantJuryCatalog.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>
                      {money(displayedTotal, merchantJuryCatalog.currency)}
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
                  value={checkoutCartValue(lines)}
                />
                <label className="jury-access-field">
                  <span>OpenAI Build Week jury access code</span>
                  <input
                    required
                    autoComplete="one-time-code"
                    maxLength={128}
                    name="juryAccessCode"
                    type="password"
                  />
                  <small>
                    Real purchases are reserved exclusively for judges. The
                    free project demo does not require this code or a purchase.
                  </small>
                </label>
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
                    : 'Open jury checkout with Stripe'}
                </button>
              </Form>
            ) : (
              <button disabled type="button">
                {preview
                  ? 'Checkout disabled in preview'
                  : 'Jury checkout closed'}
              </button>
            )}
            <p>
              {preview
                ? 'This deployment cannot create a payment or production order. Terms acceptance will be required when checkout opens.'
                : checkoutAvailable
                  ? `Fan-made, unofficial merchandise. Access is limited to OpenAI Build Week judges; shipping is ${money(merchantJuryCatalog.shippingAmount / 100, merchantJuryCatalog.currency)} per order. Review the final CHF total in Stripe before paying.`
                  : 'Real checkout is unavailable because the jury-only sales window is closed or not configured.'}
            </p>
            {juryShippingApplies ? (
              <p>
                RITSL bears normal import, customs, and carrier-clearance charges
                for the approved Switzerland and United States delivery routes.
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
              : jurySales.enabled
                ? 'Real purchases require the private OpenAI Build Week jury access code.'
                : 'Jury checkout is currently closed.'}
          </p>
          <Link to="/">Browse drops</Link>
        </section>
      )}
    </div>
  );
}
