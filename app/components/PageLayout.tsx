import {CartProvider} from '~/lib/cart';
import {Header} from '~/components/Header';
import {Footer} from '~/components/Footer';

export function PageLayout({children = null}: {children?: React.ReactNode}) {
  return (
    <CartProvider>
      <Header />
      <main>{children}</main>
      <Footer />
    </CartProvider>
  );
}
