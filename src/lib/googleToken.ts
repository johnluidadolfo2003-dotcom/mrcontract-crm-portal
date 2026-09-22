export const GOOGLE_ACCESS_TOKEN_MAX_AGE_MS = 50 * 60 * 1000;

export function isGoogleAccessTokenFresh(
  issuedAt: number | null | undefined,
  now: number = Date.now()
): boolean {
  if (!Number.isFinite(issuedAt) || !issuedAt) return true;
  if (issuedAt > now + 60_000) return false;
  return now - issuedAt < GOOGLE_ACCESS_TOKEN_MAX_AGE_MS;
}

export function isGoogleCalendarAuthFailure(
  status: number,
  errorCode?: string | null,
  message?: string | null
): boolean {
  if (status === 401) return true;
  const text = `${errorCode || ''} ${message || ''}`.toLowerCase();
  return status === 403 && (
    text.includes('auth') ||
    text.includes('credential') ||
    text.includes('token') ||
    text.includes('permission')
  );
}
