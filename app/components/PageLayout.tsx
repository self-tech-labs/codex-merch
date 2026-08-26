import {CartProvider, type CartCatalogProduct} from '~/lib/cart';
import {Header} from '~/components/Header';
import {Footer} from '~/components/Footer';
import {
  StorefrontModeProvider,
  type StorefrontMode,
} from '~/lib/storefront-mode';

export function PageLayout({
  children = null,
  cartCatalog,
  checkoutEnabled,
  storefrontMode,
}: {
  children?: React.ReactNode;
  cartCatalog: CartCatalogProduct[];
  checkoutEnabled: boolean;
  storefrontMode: StorefrontMode;
}) {
  return (
    <StorefrontModeProvider
      checkoutEnabled={checkoutEnabled}
      mode={storefrontMode}
    >
      <CartProvider catalog={cartCatalog}>
        <Header />
        <main>{children}</main>
        <Footer />
      </CartProvider>
    </StorefrontModeProvider>
  );
}
