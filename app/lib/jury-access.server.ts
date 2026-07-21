import {createHash, timingSafeEqual} from 'node:crypto';

export const JURY_SALES_AUDIENCE = 'OpenAI Build Week judges';
export const MINIMUM_JURY_ACCESS_CODE_LENGTH = 16;

export class JuryAccessError extends Error {}

export function jurySalesEndAt(env: AppEnv) {
  const value = env.JURY_SALES_END_AT?.trim() || '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? {timestamp, value} : null;
}

export function assertJurySalesConfiguration(
  env: AppEnv,
  now = Date.now(),
) {
  if (env.JURY_SALES_ENABLED !== 'true') {
    throw new JuryAccessError('Jury sales are disabled');
  }

  const expectedCode = env.JURY_ACCESS_CODE?.trim() || '';
  if (expectedCode.length < MINIMUM_JURY_ACCESS_CODE_LENGTH) {
    throw new JuryAccessError('Jury access is not configured');
  }

  const endAt = jurySalesEndAt(env);
  if (!endAt) throw new JuryAccessError('Jury sales end time is invalid');
  if (now >= endAt.timestamp) {
    throw new JuryAccessError('The jury sales window has ended');
  }

  return endAt;
}

export function isJurySalesWindowOpen(env: AppEnv, now = Date.now()) {
  try {
    assertJurySalesConfiguration(env, now);
    return true;
  } catch {
    return false;
  }
}

export function assertJuryAccessCode(
  env: AppEnv,
  providedCode: string | null | undefined,
  now = Date.now(),
) {
  assertJurySalesConfiguration(env, now);
  const expected = juryAccessDigest(env.JURY_ACCESS_CODE?.trim() || '');
  const provided = juryAccessDigest(providedCode?.trim() || '');
  if (!timingSafeEqual(expected, provided)) {
    throw new JuryAccessError('Jury access could not be verified');
  }
}

function juryAccessDigest(value: string) {
  return createHash('sha256').update(value).digest();
}
