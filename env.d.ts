/// <reference types="vite/client" />
/// <reference types="react-router" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';

declare global {
  namespace NodeJS {
    interface ProcessEnv extends AppEnv {}
  }

  interface AppEnv {
    SESSION_SECRET?: string;
    PUBLIC_SITE_URL?: string;
    PUBLIC_STRIPE_PUBLISHABLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_API_VERSION?: string;
    STRIPE_ALLOWED_SHIPPING_COUNTRIES?: string;
    STRIPE_SHIPPING_RATE_ID?: string;
    STRIPE_FLAT_SHIPPING_AMOUNT?: string;
    STRIPE_AUTOMATIC_TAX?: string;
    PRINTFUL_TOKEN?: string;
    PRINTFUL_STORE_ID?: string;
    PRINTFUL_AUTO_CONFIRM?: string;
    PRINTFUL_MAX_RETRIES?: string;
    PRINTFUL_RETRY_BASE_MS?: string;
    PRINTFUL_ALLOW_NON_PUBLIC_ASSET_URLS?: string;
    OPENAI_API_KEY?: string;
    OPENAI_IMAGE_TIMEOUT_MS?: string;
    X_BEARER_TOKEN?: string;
  }
}

export {};
