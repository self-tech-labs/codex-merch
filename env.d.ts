/// <reference types="vite/client" />
/// <reference types="react-router" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';

declare global {
  namespace NodeJS {
    interface ProcessEnv extends AppEnv {}
  }

  interface AppEnv {
    NODE_ENV?: string;
    PUBLIC_SITE_URL?: string;
    STOREFRONT_MODE?: string;
    DATABASE_URL?: string;
    CHECKOUT_ENABLED?: string;
    MERCH_PILOT_APPROVED?: string;
    STOREFRONT_LEGAL_APPROVED?: string;
    STOREFRONT_TAX_SHIPPING_APPROVED?: string;
    STOREFRONT_CONTACT_EMAIL?: string;
    STOREFRONT_SHIPPING_POLICY?: string;
    STOREFRONT_RETURNS_POLICY?: string;
    STOREFRONT_PRIVACY_POLICY?: string;
    STOREFRONT_TERMS_POLICY?: string;
    STOREFRONT_CONTACT_POLICY?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    STRIPE_ALLOWED_SHIPPING_COUNTRIES?: string;
    STRIPE_SHIPPING_RATE_ID?: string;
    STRIPE_FLAT_SHIPPING_AMOUNT?: string;
    STRIPE_AUTOMATIC_TAX?: string;
    PRINTFUL_TOKEN?: string;
    PRINTFUL_STORE_ID?: string;
    PRINTFUL_AUTO_CONFIRM?: string;
    PRINTFUL_MAX_RETRIES?: string;
    PRINTFUL_RETRY_BASE_MS?: string;
    PRINTFUL_TIMEOUT_MS?: string;
    PRINTFUL_ALLOW_NON_PUBLIC_ASSET_URLS?: string;
    OPENAI_API_KEY?: string;
    OPENAI_IMAGE_TIMEOUT_MS?: string;
    X_BEARER_TOKEN?: string;
    INNGEST_EVENT_KEY?: string;
    INNGEST_SIGNING_KEY?: string;
    INNGEST_SERVE_ORIGIN?: string;
  }
}

export {};
