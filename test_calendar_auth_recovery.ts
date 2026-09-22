import assert from 'node:assert/strict';
import {
  GOOGLE_ACCESS_TOKEN_MAX_AGE_MS,
  isGoogleAccessTokenFresh,
  isGoogleCalendarAuthFailure,
} from './src/lib/googleToken.ts';

const now = Date.parse('2026-09-22T15:00:00.000Z');

assert.equal(
  isGoogleAccessTokenFresh(now - GOOGLE_ACCESS_TOKEN_MAX_AGE_MS + 1, now),
  true,
  'a recently issued Google token must remain available'
);
assert.equal(
  isGoogleAccessTokenFresh(now - GOOGLE_ACCESS_TOKEN_MAX_AGE_MS, now),
  false,
  'a token at the refresh boundary must be discarded before Google rejects it'
);
assert.equal(
  isGoogleAccessTokenFresh(null, now),
  true,
  'legacy cached tokens remain usable until the server explicitly rejects them'
);
assert.equal(
  isGoogleCalendarAuthFailure(401, 'AUTH_ERROR', 'Invalid Credentials'),
  true,
  'Google 401 responses must start Calendar reconnection'
);
assert.equal(
  isGoogleCalendarAuthFailure(403, 'CALENDAR_SCOPE_INSUFFICIENT', 'insufficient authentication scopes'),
  true,
  'Google auth-related 403 responses must start Calendar reconnection'
);
assert.equal(
  isGoogleCalendarAuthFailure(500, 'NETWORK_ERROR', 'upstream unavailable'),
  false,
  'ordinary service failures must not discard a valid Google session'
);

console.log('Calendar authentication recovery tests passed.');
