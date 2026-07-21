import {createContext, useContext, type ReactNode} from 'react';

export type StorefrontMode = 'preview' | 'production';

const StorefrontModeContext = createContext<StorefrontMode>('preview');
const JurySalesContext = createContext({
  enabled: false,
  endAt: null as string | null,
});

export function resolveStorefrontMode(value: string | undefined): StorefrontMode {
  return value === 'production' ? 'production' : 'preview';
}

export function canInitiateStorefrontCheckout(
  mode: StorefrontMode,
  catalogEligible: boolean,
  jurySalesEnabled = false,
) {
  return mode === 'production' && catalogEligible && jurySalesEnabled;
}

export function StorefrontModeProvider({
  children,
  jurySalesEnabled = false,
  jurySalesEndAt = null,
  mode,
}: {
  children: ReactNode;
  jurySalesEnabled?: boolean;
  jurySalesEndAt?: string | null;
  mode: StorefrontMode;
}) {
  return (
    <StorefrontModeContext.Provider value={mode}>
      <JurySalesContext.Provider
        value={{enabled: jurySalesEnabled, endAt: jurySalesEndAt}}
      >
        {children}
      </JurySalesContext.Provider>
    </StorefrontModeContext.Provider>
  );
}

export function useStorefrontMode() {
  return useContext(StorefrontModeContext);
}

export function useJurySales() {
  return useContext(JurySalesContext);
}
