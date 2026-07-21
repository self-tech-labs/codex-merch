import {CartProvider} from '~/lib/cart';
import {Header} from '~/components/Header';
import {Footer} from '~/components/Footer';
import {
  StorefrontModeProvider,
  type StorefrontMode,
} from '~/lib/storefront-mode';

export function PageLayout({
  children = null,
  storefrontMode,
}: {
  children?: React.ReactNode;
  storefrontMode: StorefrontMode;
}) {
  return (
    <StorefrontModeProvider mode={storefrontMode}>
      <CartProvider>
        <Header />
        <main>{children}</main>
        <Footer />
      </CartProvider>
    </StorefrontModeProvider>
  );
}
