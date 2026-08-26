import {createContext, useContext, type ReactNode} from 'react';

export type StorefrontMode = 'preview' | 'production';

const StorefrontModeContext = createContext<StorefrontMode>('preview');
const CheckoutAvailabilityContext = createContext({
  enabled: false,
});

export function resolveStorefrontMode(value: string | undefined): StorefrontMode {
  return value === 'production' ? 'production' : 'preview';
}

export function canInitiateStorefrontCheckout(
  mode: StorefrontMode,
  catalogEligible: boolean,
  checkoutEnabled = false,
) {
  return mode === 'production' && catalogEligible && checkoutEnabled;
}

export function StorefrontModeProvider({
  children,
  checkoutEnabled = false,
  mode,
}: {
  children: ReactNode;
  checkoutEnabled?: boolean;
  mode: StorefrontMode;
}) {
  return (
    <StorefrontModeContext.Provider value={mode}>
      <CheckoutAvailabilityContext.Provider value={{enabled: checkoutEnabled}}>
        {children}
      </CheckoutAvailabilityContext.Provider>
    </StorefrontModeContext.Provider>
  );
}

export function useStorefrontMode() {
  return useContext(StorefrontModeContext);
}

export function useCheckoutAvailability() {
  return useContext(CheckoutAvailabilityContext);
}
