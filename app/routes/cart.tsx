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
  merchantPilot,
  merchantPilotDisplayAmounts,
} from '~/lib/merchant-policy';
import {useStorefrontMode} from '~/lib/storefront-mode';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Codex Meme Merch | Cart'},
    {name: 'robots', content: 'noindex,nofollow'},
  ];
};

export default function Cart() {
  const {displayLines, lines, removeLine, subtotal, updateQuantity} = useCart();
  const storefrontMode = useStorefrontMode();
  const preview = storefrontMode === 'preview';
  const currency = displayLines[0]?.product.commerce.currency || 'USD';
  const pilotShippingApplies =
    displayLines.length > 0 &&
    displayLines.every(
      (line) => line.product.slug === merchantPilot.productSlug,
    );
  const pilotAmounts = merchantPilotDisplayAmounts(subtotal);
  const displayedTotal = pilotShippingApplies ? pilotAmounts.total : subtotal;
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
              {pilotShippingApplies ? (
                <>
                  <div>
                    <dt>CH shipping</dt>
                    <dd>
                      {money(
                        pilotAmounts.shipping,
                        merchantPilot.currency,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>{money(displayedTotal, merchantPilot.currency)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            {preview ? (
              <button disabled type="button">
                Checkout disabled in preview
              </button>
            ) : (
              <Form action="/api/checkout" method="post">
                <input
                  type="hidden"
                  name="cart"
                  value={checkoutCartValue(lines)}
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
                    : 'Checkout with Stripe'}
                </button>
              </Form>
            )}
            <p>
              {preview
                ? 'This deployment cannot create a payment or production order. Terms acceptance will be required when checkout opens.'
                : 'Switzerland shipping is fixed at CHF 9.10 per order. Review the same final CHF total in Stripe before paying.'}
            </p>
            {pilotShippingApplies ? (
              <p>
                RITSL bears normal import, customs, and carrier-clearance charges
                for the approved Swiss delivery route.
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
              : 'Checkout availability is determined by server-side product and commerce gates.'}
          </p>
          <Link to="/">Browse drops</Link>
        </section>
      )}
    </div>
  );
}
