import {CartProvider} from '~/lib/cart';
import {Header} from '~/components/Header';
import {Footer} from '~/components/Footer';
import {
  StorefrontModeProvider,
  type StorefrontMode,
} from '~/lib/storefront-mode';

export function PageLayout({
  children = null,
  jurySalesEnabled,
  jurySalesEndAt,
  storefrontMode,
}: {
  children?: React.ReactNode;
  jurySalesEnabled: boolean;
  jurySalesEndAt: string | null;
  storefrontMode: StorefrontMode;
}) {
  return (
    <StorefrontModeProvider
      jurySalesEnabled={jurySalesEnabled}
      jurySalesEndAt={jurySalesEndAt}
      mode={storefrontMode}
    >
      <CartProvider>
        <Header />
        <main>{children}</main>
        <Footer />
      </CartProvider>
    </StorefrontModeProvider>
  );
}
