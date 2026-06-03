import type {AppLoadContext} from 'react-router';

export function getEnv(context?: AppLoadContext) {
  const contextEnv =
    context && typeof context === 'object' && 'env' in context
      ? ((context as {env?: AppEnv}).env || {})
      : {};

  return {
    ...process.env,
    ...contextEnv,
  } as AppEnv;
}

export function requireEnv(env: AppEnv, keys: Array<keyof AppEnv>) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

export function siteUrl(env: AppEnv, request: Request) {
  const configured = env.PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const url = new URL(request.url);
  return url.origin;
}
