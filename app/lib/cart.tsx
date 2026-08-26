import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
export type CartLine = {
  productSlug: string;
  variantId: string;
  quantity: number;
};

export type CartCatalogVariant = {
  id: string;
  size: string;
  purchasable: boolean;
};

export type CartCatalogProduct = {
  slug: string;
  title: string;
  currency: string;
  imageUrl: string;
  provider: string;
  purchasable: boolean;
  unitAmount: number;
  variants: CartCatalogVariant[];
};

export type CartDisplayLine = CartLine & {
  product: CartCatalogProduct;
  variant: CartCatalogVariant;
  lineTotal: number;
};

type CartContextValue = {
  lines: CartLine[];
  displayLines: CartDisplayLine[];
  count: number;
  subtotal: number;
  addLine: (line: CartLine) => void;
  updateQuantity: (productSlug: string, variantId: string, quantity: number) => void;
  removeLine: (productSlug: string, variantId: string) => void;
  removePurchasedLines: (orderReference: string, purchased: CartLine[]) => void;
};

const STORAGE_KEY = 'codex-merch-cart';
const CLEARED_ORDERS_KEY = 'codex-merch-cleared-orders-v1';
const STORAGE_VERSION = 1;
const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  catalog,
  children,
}: {
  catalog: CartCatalogProduct[];
  children: ReactNode;
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const catalogBySlug = useMemo(
    () => new Map(catalog.map((product) => [product.slug, product])),
    [catalog],
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setLoaded(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const record =
        parsed && typeof parsed === 'object'
          ? (parsed as {version?: unknown; lines?: unknown})
          : null;
      const storedLines = Array.isArray(parsed)
        ? parsed
        : record?.version === STORAGE_VERSION
          ? record.lines
          : [];
      if (Array.isArray(storedLines)) {
        const migratedLines = prunePurchasableLines(
          normalizeLines(storedLines),
          catalogBySlug,
        );
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({version: STORAGE_VERSION, lines: migratedLines}),
        );
        setLines(migratedLines);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setLoaded(true);
    }
  }, [catalogBySlug]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({version: STORAGE_VERSION, lines}),
    );
  }, [lines, loaded]);

  const addLine = useCallback((line: CartLine) => {
    setLines((current) => {
      const next = normalizeLine(line);
      const product = catalogBySlug.get(next.productSlug);
      const variant = product?.variants.find(
        (candidate) => candidate.id === next.variantId,
      );
      if (
        !product ||
        !variant ||
        !product.purchasable ||
        !variant.purchasable
      ) {
        return current;
      }
      const existing = current.find((item) => lineKey(item) === lineKey(next));
      if (!existing) return [...current, next];
      return current.map((item) =>
        lineKey(item) === lineKey(next)
          ? {...item, quantity: Math.min(item.quantity + next.quantity, 10)}
          : item,
      );
    });
  }, [catalogBySlug]);

  const updateQuantity = useCallback((
    productSlug: string,
    variantId: string,
    quantity: number,
  ) => {
    setLines((current) =>
      normalizeLines(
        current.map((line) =>
          lineKey(line) === lineKey({productSlug, variantId})
            ? {...line, quantity}
            : line,
        ),
      ),
    );
  }, []);

  const removeLine = useCallback((productSlug: string, variantId: string) => {
    setLines((current) =>
      current.filter(
        (line) => lineKey(line) !== lineKey({productSlug, variantId}),
      ),
    );
  }, []);

  const removePurchasedLines = useCallback((
    orderReference: string,
    purchased: CartLine[],
  ) => {
    // CheckoutSuccess can mount before the provider has hydrated localStorage.
    // Defer the clear until hydration changes this callback identity; otherwise
    // an empty in-memory cart is marked as cleared and the stored lines return.
    if (!loaded) return;
    const previouslyCleared = readClearedOrders();
    if (previouslyCleared.includes(orderReference)) return;
    window.localStorage.setItem(
      CLEARED_ORDERS_KEY,
      JSON.stringify([...previouslyCleared, orderReference].slice(-20)),
    );
    const purchasedQuantities = new Map(
      purchased.map((line) => [lineKey(line), line.quantity]),
    );
    setLines((current) =>
      current.flatMap((line) => {
        const purchasedQuantity = purchasedQuantities.get(lineKey(line)) || 0;
        const quantity = line.quantity - purchasedQuantity;
        return quantity > 0 ? [{...line, quantity}] : [];
      }),
    );
  }, [loaded]);

  const displayLines = useMemo(
    () => hydrateLines(lines, catalogBySlug),
    [catalogBySlug, lines],
  );
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
      removePurchasedLines,
    }),
    [
      addLine,
      count,
      displayLines,
      lines,
      removeLine,
      removePurchasedLines,
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
  return line.product.imageUrl;
}

export function lineTitle(line: CartDisplayLine) {
  return `${line.product.title} / ${line.variant.size}`;
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
    quantity: Number.isInteger(Number(line.quantity))
      ? Math.max(0, Math.min(Number(line.quantity), 10))
      : 0,
  };
}

function hydrateLines(
  lines: CartLine[],
  catalog: Map<string, CartCatalogProduct>,
): CartDisplayLine[] {
  return lines.flatMap((line) => {
    const product = catalog.get(line.productSlug);
    if (!product?.purchasable) return [];
    const variant = product.variants.find(
      (candidate) => candidate.id === line.variantId,
    );
    if (!variant?.purchasable) return [];
    const price = product.unitAmount / 100;
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

function prunePurchasableLines(
  lines: CartLine[],
  catalog: Map<string, CartCatalogProduct>,
) {
  return lines.filter((line) => {
    const product = catalog.get(line.productSlug);
    if (!product?.purchasable) return false;
    return Boolean(
      product.variants.find(
        (variant) => variant.id === line.variantId && variant.purchasable,
      ),
    );
  });
}

function lineKey(line: Pick<CartLine, 'productSlug' | 'variantId'>) {
  return `${line.productSlug}:${line.variantId}`;
}

function readClearedOrders() {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CLEARED_ORDERS_KEY) || '[]',
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}
