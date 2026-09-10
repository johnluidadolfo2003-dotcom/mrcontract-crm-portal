import { OAuth2Client, JWT } from 'google-auth-library';
import * as sheetsService from './sheetsService';

let cachedOAuth2Client: OAuth2Client | null = null;
let cachedCredentialsKey = '';

export interface CalendarAuthInfo {
  token: string | null;
  source: 'oauth_refresh_token' | 'service_account' | 'env_token' | 'none';
  email: string | null;
  error?: string;
}

export function resolveCalendarId(reqCalendarId?: string): string {
  if (reqCalendarId && reqCalendarId.trim() && reqCalendarId.trim() !== 'null' && reqCalendarId.trim() !== 'undefined') {
    return reqCalendarId.trim();
  }
  const envCalendarId = (
    process.env.GOOGLE_CALENDAR_ID ||
    process.env.GOOGLE_CALENDAR_EMAIL ||
    process.env.GOOGLE_CALENDAR ||
    ''
  ).trim();
  if (envCalendarId) {
    return envCalendarId;
  }
  return 'primary';
}

/**
 * Obtain a valid Google Calendar access token on the backend.
 * Priority 1: Backend OAuth2Client with refresh token
 * Priority 2: Service Account JWT client
 * Priority 3: Static env token
 */
export async function getCalendarAccessToken(reqCalendarId?: string): Promise<CalendarAuthInfo> {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const refreshToken = (
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ||
    process.env.GOOGLE_REFRESH_TOKEN ||
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN ||
    ''
  ).trim();

  const calendarId = resolveCalendarId(reqCalendarId);

  // 1. OAuth2 with Refresh Token (Primary company calendar authorization)
  if (clientId && clientSecret && refreshToken) {
    const credKey = `${clientId}:${refreshToken}`;
    try {
      if (!cachedOAuth2Client || cachedCredentialsKey !== credKey) {
        cachedOAuth2Client = new OAuth2Client(clientId, clientSecret);
        cachedOAuth2Client.setCredentials({ refresh_token: refreshToken });
        cachedCredentialsKey = credKey;
      }

      const tokenRes = await cachedOAuth2Client.getAccessToken();
      if (tokenRes && tokenRes.token) {
        const email = process.env.GOOGLE_CALENDAR_EMAIL || 'info@mrcontract.us';
        return {
          token: tokenRes.token,
          source: 'oauth_refresh_token',
          email,
        };
      }
    } catch (err: any) {
      console.warn('[Calendar OAuth Refresh Token Error]:', err.message);
    }
  }

  // 2. Service Account Client (Only when explicit non-primary shared calendar ID is used)
  if (calendarId && calendarId !== 'primary') {
    try {
      const sa = sheetsService.getServiceAccountClient();
      if (sa.client) {
        const saTokenRes = await sa.client.getAccessToken();
        if (saTokenRes && saTokenRes.token) {
          return {
            token: saTokenRes.token,
            source: 'service_account',
            email: sa.clientEmail || null,
          };
        }
      }
    } catch (saErr: any) {
      console.warn('[Calendar Service Account Token Error]:', saErr.message);
    }
  }

  // 3. Static access token from environment (if configured)
  const envToken = (process.env.GOOGLE_CALENDAR_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN || '').trim();
  if (envToken) {
    return {
      token: envToken,
      source: 'env_token',
      email: null,
    };
  }

  return {
    token: null,
    source: 'none',
    email: null,
    error: 'Google Calendar backend credentials not configured or OAuth refresh token invalid.',
  };
}

export interface ScopeInspectionResult {
  scopes: string[];
  scopeString: string;
  hasCalendarScope: boolean;
  email?: string;
  error?: string;
}

/**
  Inspect Google OAuth access token scopes via tokeninfo endpoint
 */
export async function inspectTokenScopes(accessToken: string): Promise<ScopeInspectionResult> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        scopes: [],
        scopeString: '',
        hasCalendarScope: false,
        error: errBody.error_description || `tokeninfo status ${res.status}`,
      };
    }
    const data = await res.json();
    const scopeString = data.scope || '';
    const scopes = scopeString.split(' ').map((s: string) => s.trim()).filter(Boolean);
    const hasCalendarScope = scopes.some((s: string) =>
      s.includes('googleapis.com/auth/calendar') ||
      s.includes('googleapis.com/auth/calendar.events')
    );
    return {
      scopes,
      scopeString,
      hasCalendarScope,
      email: data.email || null,
    };
  } catch (err: any) {
    return {
      scopes: [],
      scopeString: '',
      hasCalendarScope: false,
      error: err.message || 'Failed to inspect tokeninfo',
    };
  }
}

export type SafeDebugReason =
  | 'calendar_scope_insufficient'
  | 'calendar_access_denied'
  | 'calendar_api_disabled'
  | 'calendar_id_invalid'
  | 'calendar_forbidden'
  | 'connected'
  | 'calendar_api_error'
  | 'not_configured';

export function parseAndLogGoogleError(
  googleResStatus: number,
  errBody: any,
  calendarId: string,
  authSource: string,
  action: string,
  scopeInspection?: ScopeInspectionResult
): {
  error: string;
  googleReason: string;
  googleMessage: string;
  debugReason: SafeDebugReason;
  errorCode: string;
  currentScopes: string[];
  requiredScopes: string[];
} {
  const errorObj = errBody?.error || {};
  const firstError = Array.isArray(errorObj.errors) && errorObj.errors.length > 0 ? errorObj.errors[0] : {};
  const googleReason = firstError.reason || errorObj.status || 'UNKNOWN';
  const googleMessage = firstError.message || errorObj.message || `HTTP ${googleResStatus}`;

  // Safe backend logging without tokens or secrets
  console.error(
    `[Google Calendar API Error] Action: ${action} | HTTP Status: ${googleResStatus} | Reason: ${googleReason} | Message: ${googleMessage} | CalendarId: ${calendarId} | AuthSource: ${authSource}${
      scopeInspection ? ` | Current Scopes: "${scopeInspection.scopeString}" | Has Calendar Scope: ${scopeInspection.hasCalendarScope}` : ''
    }`
  );

  let debugReason: SafeDebugReason = 'calendar_api_error';

  const lowerReason = (googleReason || '').toLowerCase();
  const lowerMsg = (googleMessage || '').toLowerCase();

  if (scopeInspection && !scopeInspection.hasCalendarScope && googleResStatus === 403) {
    debugReason = 'calendar_scope_insufficient';
  } else if (
    lowerReason === 'insufficientpermissions' ||
    lowerMsg.includes('insufficient authentication scopes') ||
    lowerMsg.includes('insufficient permission') ||
    lowerMsg.includes('request had insufficient')
  ) {
    debugReason = 'calendar_scope_insufficient';
  } else if (
    lowerReason === 'accessnotconfigured' ||
    lowerMsg.includes('has not been used') ||
    lowerMsg.includes('disabled') ||
    lowerMsg.includes('api not enabled')
  ) {
    debugReason = 'calendar_api_disabled';
  } else if (
    lowerReason === 'calendaraccessdenied' ||
    lowerMsg.includes('access denied') ||
    lowerMsg.includes('cannot access') ||
    lowerMsg.includes('not authorized')
  ) {
    debugReason = 'calendar_access_denied';
  } else if (
    lowerReason === 'notfound' ||
    googleResStatus === 404 ||
    lowerMsg.includes('not found') ||
    lowerMsg.includes('invalid calendar')
  ) {
    debugReason = 'calendar_id_invalid';
  } else if (
    lowerReason === 'forbidden' ||
    lowerReason === 'forbiddenfornonorganizer' ||
    lowerMsg.includes('forbidden') ||
    lowerMsg.includes('non-organizer')
  ) {
    debugReason = 'calendar_forbidden';
  } else if (googleResStatus === 403) {
    debugReason = 'calendar_scope_insufficient';
  }

  const requiredScopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ];

  let formattedError = `Google Calendar API Error (${googleResStatus}): ${googleMessage}`;
  if (debugReason === 'calendar_scope_insufficient') {
    formattedError = `Google Calendar Scope Insufficient (403): The refresh token lacks required scope 'https://www.googleapis.com/auth/calendar' or 'https://www.googleapis.com/auth/calendar.events'. Current scopes: [${(scopeInspection?.scopes || []).join(', ')}]. Detail: ${googleMessage}`;
  } else if (debugReason === 'calendar_api_disabled') {
    formattedError = `Google Calendar API Disabled (403): Enable Google Calendar API in Google Cloud Console. Detail: ${googleMessage}`;
  } else if (debugReason === 'calendar_access_denied') {
    formattedError = `Google Calendar Access Denied (403): Account does not have permission to edit calendar "${calendarId}". Detail: ${googleMessage}`;
  }

  return {
    error: formattedError,
    googleReason,
    googleMessage,
    debugReason,
    errorCode: googleReason || `HTTP_${googleResStatus}`,
    currentScopes: scopeInspection?.scopes || [],
    requiredScopes,
  };
}

/**
 * Fetch events from Google Calendar
 */
export async function listCalendarEvents(options: {
  calendarId?: string;
  timeMin?: string;
  timeMax?: string;
}): Promise<{
  success: boolean;
  events: any[];
  count: number;
  calendarId: string;
  authSource: string;
  userEmail?: string | null;
  error?: string;
  googleReason?: string;
  googleMessage?: string;
  debugReason?: SafeDebugReason;
  errorCode?: string;
  currentScopes?: string[];
  requiredScopes?: string[];
  status?: number;
}> {
  const auth = await getCalendarAccessToken(options.calendarId);
  const calendarId = resolveCalendarId(options.calendarId);

  if (!auth.token) {
    return {
      success: false,
      events: [],
      count: 0,
      calendarId,
      authSource: auth.source,
      error: auth.error || 'Google Calendar credentials not configured on backend.',
      debugReason: 'not_configured',
      errorCode: 'CALENDAR_NOT_CONFIGURED',
      status: 401,
    };
  }

  const now = Date.now();
  const defaultTimeMin = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const defaultTimeMax = new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString();

  const timeMin = options.timeMin || defaultTimeMin;
  const timeMax = options.timeMax || defaultTimeMax;

  let allItems: any[] = [];
  let pageToken: string | undefined = undefined;
  let pageCount = 0;
  const maxPages = 4;

  try {
    do {
      pageCount++;
      const params = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
        timeMin,
        timeMax,
      });
      if (pageToken) {
        params.append('pageToken', pageToken);
      }

      const googleRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${auth.token}` },
        }
      );

      if (!googleRes.ok) {
        const errBody = await googleRes.json().catch(() => ({}));
        let scopeInspection: ScopeInspectionResult | undefined;
        if (googleRes.status === 403 && auth.token) {
          scopeInspection = await inspectTokenScopes(auth.token);
        }
        const parsedErr = parseAndLogGoogleError(googleRes.status, errBody, calendarId, auth.source, 'listCalendarEvents', scopeInspection);

        return {
          success: false,
          events: [],
          count: 0,
          calendarId,
          authSource: auth.source,
          error: parsedErr.error,
          googleReason: parsedErr.googleReason,
          googleMessage: parsedErr.googleMessage,
          debugReason: parsedErr.debugReason,
          errorCode: parsedErr.errorCode,
          currentScopes: parsedErr.currentScopes,
          requiredScopes: parsedErr.requiredScopes,
          status: googleRes.status,
        };
      }

      const data = await googleRes.json();
      if (data.items && Array.isArray(data.items)) {
        allItems = allItems.concat(data.items);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && pageCount < maxPages);

    const activeEvents = allItems.filter((e) => e && e.status !== 'cancelled');

    return {
      success: true,
      events: activeEvents,
      count: activeEvents.length,
      calendarId,
      authSource: auth.source,
      userEmail: auth.email,
      debugReason: 'connected',
    };
  } catch (err: any) {
    console.error('[Calendar List Events Error]:', err);
    return {
      success: false,
      events: [],
      count: 0,
      calendarId,
      authSource: auth.source,
      error: err.message || 'Failed to communicate with Google Calendar API.',
      debugReason: 'calendar_api_error',
      errorCode: 'SERVER_EXCEPTION',
      status: 500,
    };
  }
}

/**
 * Helper to extract salesperson identifier (name or code) from event payload or Google Calendar item
 */
export function extractSalesperson(payloadOrEvent: any): string {
  if (!payloadOrEvent) return '';
  if (typeof payloadOrEvent.salespersonCode === 'string' && payloadOrEvent.salespersonCode.trim()) {
    return payloadOrEvent.salespersonCode.trim();
  }
  if (typeof payloadOrEvent.salesperson === 'string' && payloadOrEvent.salesperson.trim()) {
    return payloadOrEvent.salesperson.trim();
  }
  if (typeof payloadOrEvent.salespersonName === 'string' && payloadOrEvent.salespersonName.trim()) {
    return payloadOrEvent.salespersonName.trim();
  }
  if (typeof payloadOrEvent.rep === 'string' && payloadOrEvent.rep.trim()) {
    return payloadOrEvent.rep.trim();
  }
  if (typeof payloadOrEvent.representative === 'string' && payloadOrEvent.representative.trim()) {
    return payloadOrEvent.representative.trim();
  }

  const desc = typeof payloadOrEvent.description === 'string' ? payloadOrEvent.description : '';
  if (desc) {
    const cleanDesc = desc.replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ');
    const match = cleanDesc.match(/(?:SALESPERSON|REPRESENTATIVE|SALES\s*REP|REP|ASSIGNED\s*TO|ESTIMATOR)\s*[:\-]\s*([^\n\r,•]+)/i);
    if (match && match[1]) {
      const repVal = match[1].trim();
      if (repVal) return repVal;
    }
  }

  const summary = typeof payloadOrEvent.summary === 'string' ? payloadOrEvent.summary : '';
  if (summary) {
    const cleanSum = summary.trim();

    // 1. Direct regex for standard salesperson codes like DG, SB, DK, JR, JC, EP
    // Matches trailing "- DG", "- SB", "- DG (Notes)", "(DG)", "(SB)" etc.
    const directCodeMatch = cleanSum.match(/(?:[-–—:]\s*|\(|\b)(DG|SB|DK|JR|JC|EP)\b(?:\s*[\)\]\}]|\s*\(|\s*$)/i);
    if (directCodeMatch && directCodeMatch[1]) {
      return directCodeMatch[1].toUpperCase().trim();
    }

    // 2. Check by splitting dashes: "Appt - Client - Rep", "Job - Client - $5k - ES# - Rep"
    if (cleanSum.includes('-') || cleanSum.includes('–') || cleanSum.includes('—')) {
      const parts = cleanSum.split(/[-–—]/).map((p: string) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // Check the last part first (strip any parenthesized text like (Masonry))
        const lastPart = parts[parts.length - 1];
        const lastCandidate = lastPart.split(/[\(\[\{]/)[0].trim();
        if (lastCandidate && !/^(\$|ES#|Job|Appt|Meeting)/i.test(lastCandidate)) {
          return lastCandidate;
        }

        // Check all parts for non-standard positioning
        for (let i = parts.length - 1; i >= 0; i--) {
          const partCand = parts[i].split(/[\(\[\{]/)[0].trim();
          if (/^(DG|SB|DK|JR|JC|EP)$/i.test(partCand)) {
            return partCand.toUpperCase();
          }
        }
      }
    }
  }

  return '';
}

/**
 * Normalize salesperson string for robust comparison
 */
export function normalizeSalesperson(sp: string): string {
  if (!sp) return '';
  let clean = sp.trim().toLowerCase();
  // Extract code inside parentheses: e.g. "daniel grider (dg)" -> "dg"
  const parenMatch = clean.match(/\(([a-z0-9_-]+)\)/i);
  if (parenMatch && parenMatch[1]) {
    return parenMatch[1].toLowerCase().trim();
  }
  // Strip trailing or leading punctuation
  clean = clean.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '');
  return clean;
}

/**
 * Check if two salesperson identifiers refer to the same salesperson
 */
export function isSameSalesperson(sp1: string, sp2: string): boolean {
  if (!sp1 || !sp2) return false;
  const n1 = normalizeSalesperson(sp1);
  const n2 = normalizeSalesperson(sp2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Compare initials e.g. "Daniel Grider" -> "dg"
  const getInitials = (s: string) => {
    const parts = s.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return parts.map((p) => p[0].toLowerCase()).join('');
    }
    return '';
  };

  const init1 = getInitials(sp1);
  const init2 = getInitials(sp2);

  if (init1 && (init1 === n2 || init1 === init2)) return true;
  if (init2 && (init2 === n1 || init2 === init1)) return true;

  return false;
}

/**
 * Rebuilds calendar RFC 3339 offsets in the configured event timezone.
 * This prevents a browser in another country from shifting the selected wall-clock time.
 */
function normalizeCalendarPayloadTimes(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;

  const timeZone =
    String(payload.start?.timeZone || payload.end?.timeZone || process.env.BUSINESS_TIME_ZONE || 'America/New_York').trim() ||
    'America/New_York';

  const normalizeDateTime = (value: unknown): string | null => {
    const match = typeof value === 'string'
      ? value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/)
      : null;
    if (!match) return null;

    const [, date, hour, minute, second = '00'] = match;
    const utcGuess = Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      Number(hour),
      Number(minute)
    );

    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(new Date(utcGuess));
      const values = Object.fromEntries(
        parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
      );
      const zonedAsUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        Number(values.hour),
        Number(values.minute)
      );
      const offsetMinutes = Math.round((zonedAsUtc - utcGuess) / 60000);
      const sign = offsetMinutes >= 0 ? '+' : '-';
      const absolute = Math.abs(offsetMinutes);
      const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
      return `${date}T${hour}:${minute}:${second}${offset}`;
    } catch {
      return null;
    }
  };

  const normalizeEndpoint = (endpoint: any) => {
    if (!endpoint || typeof endpoint !== 'object' || !endpoint.dateTime) return endpoint;
    const dateTime = normalizeDateTime(endpoint.dateTime);
    return dateTime ? { ...endpoint, dateTime, timeZone } : { ...endpoint, timeZone };
  };

  return {
    ...payload,
    start: normalizeEndpoint(payload.start),
    end: normalizeEndpoint(payload.end),
  };
}

// In-flight booking lock per salesperson to coordinate simultaneous booking requests
// Different salespeople run with their own lock and are allowed appointments at the same time.
const salespersonBookingLocks = new Map<string, Promise<void>>();

export async function runWithSalespersonLock<T>(spKey: string, fn: () => Promise<T>): Promise<T> {
  const normalizedKey = normalizeSalesperson(spKey) || '__unassigned__';

  const currentLock = salespersonBookingLocks.get(normalizedKey) || Promise.resolve();
  let releaseLock: () => void = () => {};
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  salespersonBookingLocks.set(normalizedKey, nextLock);

  try {
    await currentLock;
    return await fn();
  } finally {
    releaseLock();
    if (salespersonBookingLocks.get(normalizedKey) === nextLock) {
      salespersonBookingLocks.delete(normalizedKey);
    }
  }
}

/**
 * Check the assigned salesperson's schedule before confirming to prevent overlapping bookings
 */
export async function checkSalespersonScheduleOverlap(
  accessToken: string,
  calendarId: string,
  salesperson: string,
  startISO: string,
  endISO: string,
  excludeEventId?: string
): Promise<{ hasOverlap: boolean; conflictingEvent?: any; unverified?: boolean; error?: string }> {
  if (!salesperson || !startISO || !endISO) {
    return { hasOverlap: false };
  }

  const reqStartMs = new Date(startISO).getTime();
  const reqEndMs = new Date(endISO).getTime();

  if (isNaN(reqStartMs) || isNaN(reqEndMs) || reqStartMs >= reqEndMs) {
    return { hasOverlap: false };
  }

  try {
    // Check events around the requested appointment time (+/- 24 hours buffer)
    const windowMin = new Date(reqStartMs - 24 * 60 * 60 * 1000).toISOString();
    const windowMax = new Date(reqEndMs + 24 * 60 * 60 * 1000).toISOString();

    let pageToken: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 4;
    const allItems: any[] = [];

    do {
      pageCount++;
      const params = new URLSearchParams({
        singleEvents: 'true',
        timeMin: windowMin,
        timeMax: windowMax,
        maxResults: '250',
      });
      if (pageToken) params.append('pageToken', pageToken);

      const queryUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events?${params.toString()}`;

      const res = await fetch(queryUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn(`[Calendar Schedule Check] Unable to fetch schedule (HTTP ${res.status}): ${errText}`);
        return { 
          hasOverlap: false, 
          unverified: true, 
          error: `Salesperson schedule could not be verified from Google Calendar API (HTTP ${res.status}).` 
        };
      }

      const data = await res.json().catch(() => ({ items: [] }));
      if (data.items && Array.isArray(data.items)) {
        allItems.push(...data.items);
      }
      pageToken = data.nextPageToken;
    } while (pageToken && pageCount < maxPages);

    for (const item of allItems) {
      if (item.status === 'cancelled') continue;
      if (excludeEventId && item.id === excludeEventId) continue;

      const itemStartStr = item.start?.dateTime || item.start?.date;
      const itemEndStr = item.end?.dateTime || item.end?.date;
      if (!itemStartStr || !itemEndStr) continue;

      const itemStartMs = new Date(itemStartStr).getTime();
      const itemEndMs = new Date(itemEndStr).getTime();
      if (isNaN(itemStartMs) || isNaN(itemEndMs)) continue;

      // Intervals overlap if itemStart < reqEnd && itemEnd > reqStart
      const overlaps = itemStartMs < reqEndMs && itemEndMs > reqStartMs;
      if (!overlaps) continue;

      const eventSp = extractSalesperson(item);
      if (eventSp && isSameSalesperson(salesperson, eventSp)) {
        return { hasOverlap: true, conflictingEvent: item };
      }
    }
  } catch (err: any) {
    console.error('[Calendar Schedule Check Error]:', err);
    return {
      hasOverlap: false,
      unverified: true,
      error: `Salesperson schedule could not be verified from Google Calendar API: ${err.message || 'Network error'}`
    };
  }

  return { hasOverlap: false };
}

/**
 * Create a new event on Google Calendar
 */
export async function createCalendarEvent(
  payload: any,
  reqCalendarId?: string
): Promise<{
  success: boolean;
  event?: any;
  calendarId: string;
  authSource?: string;
  conflict?: boolean;
  error?: string;
  googleReason?: string;
  googleMessage?: string;
  debugReason?: SafeDebugReason;
  errorCode?: string;
  currentScopes?: string[];
  requiredScopes?: string[];
  status?: number;
}> {
  payload = normalizeCalendarPayloadTimes(payload);
  const auth = await getCalendarAccessToken(reqCalendarId);
  const calendarId = resolveCalendarId(reqCalendarId);

  if (!auth.token) {
    return {
      success: false,
      calendarId,
      authSource: auth.source,
      error: auth.error || 'Google Calendar credentials not configured on backend.',
      debugReason: 'not_configured',
      status: 401,
    };
  }

  const salesperson = extractSalesperson(payload);
  const startISO = payload.start?.dateTime || payload.start?.date || (typeof payload.start === 'string' ? payload.start : '');
  const endISO = payload.end?.dateTime || payload.end?.date || (typeof payload.end === 'string' ? payload.end : '');

  // Coordinate simultaneous booking requests so two workers cannot both reserve the same available slot.
  // Different salespeople run with their own lock and are allowed appointments at the same time.
  return await runWithSalespersonLock(salesperson, async () => {
    // 1. Check assigned salesperson’s schedule before confirming
    if (salesperson && startISO && endISO) {
      const overlap = await checkSalespersonScheduleOverlap(
        auth.token!,
        calendarId,
        salesperson,
        startISO,
        endISO
      );

      if (overlap.hasOverlap) {
        return {
          success: false,
          calendarId,
          authSource: auth.source,
          conflict: true,
          error: 'This salesperson already has an appointment at this time.',
          errorCode: 'APPOINTMENT_OVERLAP',
          status: 409,
        };
      }
    }

    // 2. Insert into Google Calendar
    try {
      const googleRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!googleRes.ok) {
        const errData = await googleRes.json().catch(() => ({}));
        let scopeInspection: ScopeInspectionResult | undefined;
        if (googleRes.status === 403 && auth.token) {
          scopeInspection = await inspectTokenScopes(auth.token);
        }
        const parsedErr = parseAndLogGoogleError(googleRes.status, errData, calendarId, auth.source, 'createCalendarEvent', scopeInspection);

        return {
          success: false,
          calendarId,
          authSource: auth.source,
          error: parsedErr.error,
          googleReason: parsedErr.googleReason,
          googleMessage: parsedErr.googleMessage,
          debugReason: parsedErr.debugReason,
          errorCode: parsedErr.errorCode,
          currentScopes: parsedErr.currentScopes,
          requiredScopes: parsedErr.requiredScopes,
          status: googleRes.status,
        };
      }

      const result = await googleRes.json();
      return {
        success: true,
        calendarId,
        authSource: auth.source,
        debugReason: 'connected',
        event: {
          id: result.id,
          htmlLink: result.htmlLink,
          summary: result.summary,
          start: result.start?.dateTime || result.start?.date,
          end: result.end?.dateTime || result.end?.date,
          description: result.description || '',
          location: result.location || '',
          attendees: result.attendees || [],
        },
      };
    } catch (err: any) {
      return {
        success: false,
        calendarId,
        authSource: auth.source,
        error: err.message || 'Failed to create calendar event.',
        debugReason: 'calendar_api_error',
        status: 500,
      };
    }
  });
}

/**
 * Update an existing event on Google Calendar
 */
export async function updateCalendarEvent(
  eventId: string,
  payload: any,
  reqCalendarId?: string
): Promise<{
  success: boolean;
  event?: any;
  calendarId: string;
  authSource?: string;
  conflict?: boolean;
  error?: string;
  googleReason?: string;
  googleMessage?: string;
  debugReason?: SafeDebugReason;
  errorCode?: string;
  currentScopes?: string[];
  requiredScopes?: string[];
  status?: number;
}> {
  payload = normalizeCalendarPayloadTimes(payload);
  const auth = await getCalendarAccessToken(reqCalendarId);
  const calendarId = resolveCalendarId(reqCalendarId);

  if (!auth.token) {
    return {
      success: false,
      calendarId,
      authSource: auth.source,
      error: auth.error || 'Google Calendar credentials not configured on backend.',
      debugReason: 'not_configured',
      status: 401,
    };
  }

  const salesperson = extractSalesperson(payload);
  const startISO = payload.start?.dateTime || payload.start?.date || (typeof payload.start === 'string' ? payload.start : '');
  const endISO = payload.end?.dateTime || payload.end?.date || (typeof payload.end === 'string' ? payload.end : '');

  // Coordinate simultaneous booking requests and check schedule before confirming
  return await runWithSalespersonLock(salesperson, async () => {
    // 1. Check assigned salesperson’s schedule before confirming (excluding current eventId)
    if (salesperson && startISO && endISO) {
      const overlap = await checkSalespersonScheduleOverlap(
        auth.token!,
        calendarId,
        salesperson,
        startISO,
        endISO,
        eventId
      );

      if (overlap.hasOverlap) {
        return {
          success: false,
          calendarId,
          authSource: auth.source,
          conflict: true,
          error: 'This salesperson already has an appointment at this time.',
          errorCode: 'APPOINTMENT_OVERLAP',
          status: 409,
        };
      }
    }

    try {
      const googleRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!googleRes.ok) {
        const errData = await googleRes.json().catch(() => ({}));
        let scopeInspection: ScopeInspectionResult | undefined;
        if (googleRes.status === 403 && auth.token) {
          scopeInspection = await inspectTokenScopes(auth.token);
        }
        const parsedErr = parseAndLogGoogleError(googleRes.status, errData, calendarId, auth.source, 'updateCalendarEvent', scopeInspection);

        return {
          success: false,
          calendarId,
          authSource: auth.source,
          error: parsedErr.error,
          googleReason: parsedErr.googleReason,
          googleMessage: parsedErr.googleMessage,
          debugReason: parsedErr.debugReason,
          errorCode: parsedErr.errorCode,
          currentScopes: parsedErr.currentScopes,
          requiredScopes: parsedErr.requiredScopes,
          status: googleRes.status,
        };
      }

      const result = await googleRes.json();
      return {
        success: true,
        calendarId,
        authSource: auth.source,
        debugReason: 'connected',
        event: {
          id: result.id,
          htmlLink: result.htmlLink,
          summary: result.summary,
          start: result.start?.dateTime || result.start?.date,
          end: result.end?.dateTime || result.end?.date,
          description: result.description || '',
          location: result.location || '',
          attendees: result.attendees || [],
        },
      };
    } catch (err: any) {
      return {
        success: false,
        calendarId,
        authSource: auth.source,
        error: err.message || 'Failed to update calendar event.',
        debugReason: 'calendar_api_error',
        status: 500,
      };
    }
  });
}

/**
 * Delete an event on Google Calendar
 */
export async function deleteCalendarEvent(
  eventId: string,
  reqCalendarId?: string
): Promise<{
  success: boolean;
  calendarId: string;
  authSource?: string;
  error?: string;
  googleReason?: string;
  googleMessage?: string;
  debugReason?: SafeDebugReason;
  errorCode?: string;
  currentScopes?: string[];
  requiredScopes?: string[];
  status?: number;
}> {
  const auth = await getCalendarAccessToken(reqCalendarId);
  const calendarId = resolveCalendarId(reqCalendarId);

  if (!auth.token) {
    return {
      success: false,
      calendarId,
      authSource: auth.source,
      error: auth.error || 'Google Calendar credentials not configured on backend.',
      debugReason: 'not_configured',
      status: 401,
    };
  }

  try {
    const googleRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
      }
    );

    if (!googleRes.ok && googleRes.status !== 204 && googleRes.status !== 404) {
      const errData = await googleRes.json().catch(() => ({}));
      let scopeInspection: ScopeInspectionResult | undefined;
      if (googleRes.status === 403 && auth.token) {
        scopeInspection = await inspectTokenScopes(auth.token);
      }
      const parsedErr = parseAndLogGoogleError(googleRes.status, errData, calendarId, auth.source, 'deleteCalendarEvent', scopeInspection);

      return {
        success: false,
        calendarId,
        authSource: auth.source,
        error: parsedErr.error,
        googleReason: parsedErr.googleReason,
        googleMessage: parsedErr.googleMessage,
        debugReason: parsedErr.debugReason,
        errorCode: parsedErr.errorCode,
        currentScopes: parsedErr.currentScopes,
        requiredScopes: parsedErr.requiredScopes,
        status: googleRes.status,
      };
    }

    return {
      success: true,
      calendarId,
      authSource: auth.source,
      debugReason: 'connected',
    };
  } catch (err: any) {
    return {
      success: false,
      calendarId,
      authSource: auth.source,
      error: err.message || 'Failed to delete calendar event.',
      debugReason: 'calendar_api_error',
      status: 500,
    };
  }
}

/**
 * Perform a thorough health check on Google Calendar backend credentials & API access.
 */
export async function getCalendarHealthStatus(reqCalendarId?: string): Promise<{
  connected: boolean;
  authSource: string;
  calendarId: string;
  debugReason: SafeDebugReason;
  reason?: string;
  requiresAdminAction?: boolean;
  error?: string;
  googleReason?: string;
  googleMessage?: string;
  email?: string | null;
  currentScopes?: string[];
  requiredScopes?: string[];
}> {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  const refreshToken = (
    process.env.GOOGLE_CALENDAR_REFRESH_TOKEN ||
    process.env.GOOGLE_REFRESH_TOKEN ||
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN ||
    ''
  ).trim();

  const calendarId = resolveCalendarId(reqCalendarId);

  if (!clientId) {
    return {
      connected: false,
      authSource: 'none',
      calendarId,
      debugReason: 'not_configured',
      reason: 'missing_client_id',
      requiresAdminAction: true,
      error: 'GOOGLE_CLIENT_ID is missing in environment variables.',
    };
  }
  if (!clientSecret) {
    return {
      connected: false,
      authSource: 'none',
      calendarId,
      debugReason: 'not_configured',
      reason: 'missing_client_secret',
      requiresAdminAction: true,
      error: 'GOOGLE_CLIENT_SECRET is missing in environment variables.',
    };
  }
  if (!refreshToken) {
    return {
      connected: false,
      authSource: 'none',
      calendarId,
      debugReason: 'not_configured',
      reason: 'missing_refresh_token',
      requiresAdminAction: true,
      error: 'GOOGLE_CALENDAR_REFRESH_TOKEN is missing in environment variables.',
    };
  }

  const auth = await getCalendarAccessToken(reqCalendarId);
  if (!auth.token) {
    return {
      connected: false,
      authSource: auth.source,
      calendarId,
      debugReason: 'not_configured',
      reason: 'invalid_grant',
      requiresAdminAction: true,
      error: auth.error || 'Failed to obtain access token from refresh token.',
    };
  }

  const scopeInspection = await inspectTokenScopes(auth.token);

  // Test API request (list 1 event)
  try {
    const testRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=1`,
      {
        headers: { Authorization: `Bearer ${auth.token}` },
      }
    );

    if (!testRes.ok) {
      const errData = await testRes.json().catch(() => ({}));
      const parsedErr = parseAndLogGoogleError(testRes.status, errData, calendarId, auth.source, 'getCalendarHealthStatus', scopeInspection);

      return {
        connected: false,
        authSource: auth.source,
        calendarId,
        debugReason: parsedErr.debugReason,
        reason: parsedErr.debugReason,
        requiresAdminAction: true,
        error: parsedErr.error,
        googleReason: parsedErr.googleReason,
        googleMessage: parsedErr.googleMessage,
        currentScopes: parsedErr.currentScopes,
        requiredScopes: parsedErr.requiredScopes,
      };
    }

    return {
      connected: true,
      authSource: auth.source,
      calendarId,
      debugReason: 'connected',
      reason: 'connected',
      requiresAdminAction: false,
      email: scopeInspection.email || auth.email,
      currentScopes: scopeInspection.scopes,
      requiredScopes: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
    };
  } catch (err: any) {
    return {
      connected: false,
      authSource: auth.source,
      calendarId,
      debugReason: 'calendar_api_error',
      reason: 'network_error',
      requiresAdminAction: false,
      error: err.message || 'Network error connecting to Google Calendar API.',
    };
  }
}

