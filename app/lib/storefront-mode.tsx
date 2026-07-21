import {createContext, useContext, type ReactNode} from 'react';

export type StorefrontMode = 'preview' | 'production';

const StorefrontModeContext = createContext<StorefrontMode>('preview');

export function resolveStorefrontMode(value: string | undefined): StorefrontMode {
  return value === 'production' ? 'production' : 'preview';
}

export function canInitiateStorefrontCheckout(
  mode: StorefrontMode,
  catalogEligible: boolean,
) {
  return mode === 'production' && catalogEligible;
}

export function StorefrontModeProvider({
  children,
  mode,
}: {
  children: ReactNode;
  mode: StorefrontMode;
}) {
  return (
    <StorefrontModeContext.Provider value={mode}>
      {children}
    </StorefrontModeContext.Provider>
  );
}

export function useStorefrontMode() {
  return useContext(StorefrontModeContext);
}
