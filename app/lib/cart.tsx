import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  assetUrl,
  formatPrice,
  getPrimaryCustomerMockup,
  getMerchProduct,
  getProductVariant,
  type CommerceVariant,
  type MerchProduct,
} from '~/lib/merch';

export type CartLine = {
  productSlug: string;
  variantId: string;
  quantity: number;
};

export type CartDisplayLine = CartLine & {
  product: MerchProduct;
  variant: CommerceVariant;
  lineTotal: number;
};

type CartContextValue = {
  lines: CartLine[];
  displayLines: CartDisplayLine[];
  count: number;
  subtotal: number;
  addLine: (line: CartLine) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeLine: (variantId: string) => void;
  clearCart: () => void;
};

const STORAGE_KEY = 'codex-merch-cart';
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({children}: {children: ReactNode}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setLoaded(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) setLines(normalizeLines(parsed));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, loaded]);

  const addLine = useCallback((line: CartLine) => {
    setLines((current) => {
      const next = normalizeLine(line);
      const existing = current.find((item) => item.variantId === next.variantId);
      if (!existing) return [...current, next];
      return current.map((item) =>
        item.variantId === next.variantId
          ? {...item, quantity: Math.min(item.quantity + next.quantity, 10)}
          : item,
      );
    });
  }, []);

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setLines((current) =>
      normalizeLines(
        current.map((line) =>
          line.variantId === variantId ? {...line, quantity} : line,
        ),
      ),
    );
  }, []);

  const removeLine = useCallback((variantId: string) => {
    setLines((current) => current.filter((line) => line.variantId !== variantId));
  }, []);

  const clearCart = useCallback(() => setLines([]), []);

  const displayLines = useMemo(() => hydrateLines(lines), [lines]);
  const count = displayLines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = displayLines.reduce((sum, line) => sum + line.lineTotal, 0);

  const value = useMemo(
    () => ({
      lines,
      displayLines,
      count,
      subtotal,
      addLine,
      updateQuantity,
      removeLine,
      clearCart,
    }),
    [
      addLine,
      clearCart,
      count,
      displayLines,
      lines,
      removeLine,
      subtotal,
      updateQuantity,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
}

export function checkoutCartValue(lines: CartLine[]) {
  return JSON.stringify(
    lines.map((line) => ({
      productSlug: line.productSlug,
      variantId: line.variantId,
      quantity: line.quantity,
    })),
  );
}

export function money(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function lineImage(line: CartDisplayLine) {
  return assetUrl(getPrimaryCustomerMockup(line.product));
}

export function lineTitle(line: CartDisplayLine) {
  return `${line.product.title} / ${line.variant.size}`;
}

export function productPrice(product: MerchProduct) {
  return formatPrice(product);
}

function normalizeLines(lines: unknown[]): CartLine[] {
  return lines
    .map((line) => normalizeLine(line as CartLine))
    .filter((line) => line.quantity > 0);
}

function normalizeLine(line: CartLine): CartLine {
  return {
    productSlug: String(line.productSlug || ''),
    variantId: String(line.variantId || ''),
    quantity: Math.max(0, Math.min(Number(line.quantity) || 1, 10)),
  };
}

function hydrateLines(lines: CartLine[]): CartDisplayLine[] {
  return lines.flatMap((line) => {
    const product = getMerchProduct(line.productSlug);
    if (!product) return [];
    const variant = getProductVariant(product, line.variantId);
    if (!variant) return [];
    const price = Number(product.commerce.price);
    return [
      {
        ...line,
        product,
        variant,
        lineTotal: price * line.quantity,
      },
    ];
  });
}
