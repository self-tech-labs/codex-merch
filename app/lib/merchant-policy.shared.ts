export const MERCHANT_POLICY_VERSION = '2026-08-26';
export const MERCHANT_POLICY_EFFECTIVE_LABEL = '26 August 2026';

export const MERCHANT_POLICY_PAGE_IDS = [
  'shipping',
  'returns',
  'privacy',
  'terms',
  'contact',
] as const;

export type MerchantPolicyPageId =
  (typeof MERCHANT_POLICY_PAGE_IDS)[number];

export type MerchantPolicySection = {
  heading: string;
  paragraphs: readonly string[];
};

export type MerchantPolicyPage = {
  title: string;
  summary: string;
  sections: readonly MerchantPolicySection[];
};
