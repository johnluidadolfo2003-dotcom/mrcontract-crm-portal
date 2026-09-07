
export function getCachedSpreadsheetDetails(): SpreadsheetDetails | null {
  for (const entry of detailsCache.values()) {
    if (entry && entry.data) return entry.data;
  }
  return null;
}

export function getCachedSheetRows(tabName: string): { headers: string[]; rows: SheetRowRecord[] } | null {
  for (const [key, entry] of rowsCache.entries()) {
    if (key.includes(tabName) && entry && entry.data) return entry.data;
  }
  return null;
}

import fs from 'fs';
import path from 'path';
import { JWT } from 'google-auth-library';

export interface ServiceAccountCredentials {
  client_email?: string;
  private_key?: string;
  project_id?: string;
  [key: string]: any;
}

export interface SheetTabInfo {
  sheetId: number;
  title: string;
  index: number;
}

export interface SpreadsheetDetails {
  id: string;
  title: string;
  sheets: SheetTabInfo[];
  url: string;
}

export interface SheetRowRecord {
  rowIndex: number;
  tabName?: string;
  statusColIndex?: number;
  timestamp?: string;
  appointmentDate?: string;
  startTime?: string;
  endTime?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  address?: string;
  salespersonCode?: string;
  leadSource?: string;
  leadType?: string;
  notes?: string;
  status?: string;
  rawValues: string[];
}

export const DEFAULT_SHEET_HEADERS = [
  'Date',
  'Client Name',
  'Phone Number',
  'Email',
  'Address',
  'Service Needed',
  'Lead Fee',
  'Status',
];

// In-memory caches to prevent exceeding Google API quota
const detailsCache = new Map<string, { data: SpreadsheetDetails; expiresAt: number }>();
const detailsInFlight = new Map<string, Promise<SpreadsheetDetails>>();

const rowsCache = new Map<string, { data: { headers: string[]; rows: SheetRowRecord[]; statusColIndex: number }; expiresAt: number }>();
const rowsInFlight = new Map<string, Promise<{ headers: string[]; rows: SheetRowRecord[]; statusColIndex: number }>>();

const batchCache = new Map<string, { data: { headers: string[]; rows: SheetRowRecord[] }; expiresAt: number }>();
const batchInFlight = new Map<string, Promise<{ headers: string[]; rows: SheetRowRecord[] }>>();

let cachedJwtClient: JWT | null = null;
let cachedCredentialsHash: string = '';

/**
 * Resolve Google Service Account credentials from environment variables, Cloudflare Worker env, or disk.
 * Supported sources:
 * 1. env.GOOGLE_SERVICE_ACCOUNT_KEY or process.env.GOOGLE_SERVICE_ACCOUNT_KEY (raw JSON or base64 JSON)
 * 2. env.GOOGLE_SERVICE_ACCOUNT_EMAIL (or GOOGLE_CLIENT_EMAIL) and env.GOOGLE_PRIVATE_KEY
 * 3. env.GOOGLE_APPLICATION_CREDENTIALS (file path)
 * 4. Local files: data/service_account.json, service_account.json, service-account.json
 */
export function resolveServiceAccountCredentials(customEnv?: any): { credentials?: ServiceAccountCredentials; source?: string; error?: string } {
  const envSource = customEnv || (typeof process !== 'undefined' && process.env ? process.env : {});

  // 1. Check GOOGLE_SERVICE_ACCOUNT_KEY env var
  const envKey = envSource.GOOGLE_SERVICE_ACCOUNT_KEY || (typeof process !== 'undefined' ? process.env?.GOOGLE_SERVICE_ACCOUNT_KEY : undefined);
  if (envKey && typeof envKey === 'string' && envKey.trim()) {
    try {
      const trimmed = envKey.trim();
      let jsonStr = trimmed;
      if (!trimmed.startsWith('{')) {
        // Try base64 decode
        try {
          if (typeof Buffer !== 'undefined') {
            jsonStr = Buffer.from(trimmed, 'base64').toString('utf-8');
          } else if (typeof atob === 'function') {
            jsonStr = atob(trimmed);
          }
        } catch {}
      }
      const parsed = JSON.parse(jsonStr);
      if (parsed.client_email && parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n').trim();
        return { credentials: parsed, source: 'GOOGLE_SERVICE_ACCOUNT_KEY' };
      }
    } catch (e: any) {
      return { error: `Invalid GOOGLE_SERVICE_ACCOUNT_KEY JSON: ${e.message}` };
    }
  }

  // 2. Check individual email + private key env vars
  const email =
    envSource.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    envSource.GOOGLE_CLIENT_EMAIL ||
    (typeof process !== 'undefined' ? process.env?.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env?.GOOGLE_CLIENT_EMAIL : undefined);
  
  const privateKey =
    envSource.GOOGLE_PRIVATE_KEY ||
    (typeof process !== 'undefined' ? process.env?.GOOGLE_PRIVATE_KEY : undefined);

  if (email && privateKey && typeof email === 'string' && typeof privateKey === 'string') {
    const formattedKey = privateKey.replace(/\\n/g, '\n').trim();
    return {
      credentials: {
        client_email: email.trim(),
        private_key: formattedKey,
        project_id: envSource.GOOGLE_PROJECT_ID || (typeof process !== 'undefined' ? process.env?.GOOGLE_PROJECT_ID : '') || '',
      },
      source: 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    };
  }

  // 3. Check GOOGLE_APPLICATION_CREDENTIALS path (Node environment)
  const appCredsPath = envSource.GOOGLE_APPLICATION_CREDENTIALS || (typeof process !== 'undefined' ? process.env?.GOOGLE_APPLICATION_CREDENTIALS : undefined);
  if (appCredsPath && typeof fs !== 'undefined' && fs.existsSync && fs.existsSync(appCredsPath)) {
    try {
      const content = fs.readFileSync(appCredsPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.client_email && parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n').trim();
        return { credentials: parsed, source: appCredsPath };
      }
    } catch (e: any) {
      return { error: `Invalid GOOGLE_APPLICATION_CREDENTIALS file: ${e.message}` };
    }
  }

  // 4. Check local file candidates (Node environment)
  if (typeof process !== 'undefined' && process.cwd && typeof fs !== 'undefined' && fs.existsSync) {
    const candidates = [
      path.join(process.cwd(), 'data', 'service_account.json'),
      path.join(process.cwd(), 'data', 'service-account.json'),
      path.join(process.cwd(), 'service_account.json'),
      path.join(process.cwd(), 'service-account.json'),
      path.join(process.cwd(), 'credentials', 'service-account.json'),
    ];

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        try {
          const content = fs.readFileSync(file, 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed.client_email && parsed.private_key) {
            parsed.private_key = parsed.private_key.replace(/\\n/g, '\n').trim();
            return { credentials: parsed, source: file };
          }
        } catch {}
      }
    }
  }

  return {
    error: 'Google Service Account credentials not found. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.',
  };
}

/**
 * Get default Google Spreadsheet ID strictly from GOOGLE_SPREADSHEET_ID environment variable.
 */
export function getDefaultSpreadsheetId(customEnv?: any): string {
  const envSource = customEnv || (typeof process !== 'undefined' && process.env ? process.env : {});
  if (envSource.GOOGLE_SPREADSHEET_ID && typeof envSource.GOOGLE_SPREADSHEET_ID === 'string' && envSource.GOOGLE_SPREADSHEET_ID.trim()) {
    return envSource.GOOGLE_SPREADSHEET_ID.trim();
  }
  return '1arAGlZO9VyY1St_ywT9ZtEaKyLaFfr3RIzw0-ebhJX0';
}

/**
 * Get or initialize JWT client from Google Service Account credentials.
 */
export function getServiceAccountClient(): { client: JWT | null; clientEmail?: string; error?: { code: string; message: string; status: number } } {
  const { credentials, error } = resolveServiceAccountCredentials();

  if (!credentials || !credentials.client_email || !credentials.private_key) {
    return {
      client: null,
      error: {
        code: 'MISSING_CREDENTIALS',
        status: 400,
        message: error || 'Google Service Account credentials are not configured.',
      },
    };
  }

  const hash = `${credentials.client_email}:${credentials.private_key.length}`;
  if (cachedJwtClient && cachedCredentialsHash === hash) {
    return { client: cachedJwtClient, clientEmail: credentials.client_email };
  }

  try {
    const jwt = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/calendar',
      ],
    });
    cachedJwtClient = jwt;
    cachedCredentialsHash = hash;
    return { client: jwt, clientEmail: credentials.client_email };
  } catch (err: any) {
    return {
      client: null,
      error: {
        code: 'INVALID_CREDENTIALS',
        status: 400,
        message: `Failed to initialize Service Account JWT: ${err.message}`,
      },
    };
  }
}

/**
 * Categorize error from Google Sheets API into clear diagnostic reason.
 */
export function classifyGoogleSheetsError(err: any, spreadsheetId?: string, clientEmail?: string): { code: string; message: string; status: number } {
  const msg = (err?.message || '').toLowerCase();
  const status = Number(err?.status || err?.code || 500);

  if (
    status === 403 ||
    msg.includes('permission') ||
    msg.includes('forbidden') ||
    msg.includes('caller does not have permission')
  ) {
    const email = clientEmail || 'the Google Service Account';
    return {
      code: 'SPREADSHEET_NOT_SHARED',
      status: 403,
      message: `The Google Spreadsheet (${spreadsheetId || 'configured'}) is not shared with the Service Account (${email}). Please open the Google Spreadsheet, click "Share", and grant "Editor" access to: ${email}`,
    };
  }

  if (status === 404 || msg.includes('not found') || msg.includes('requested entity was not found')) {
    return {
      code: 'SPREADSHEET_NOT_FOUND',
      status: 404,
      message: `Google Spreadsheet with ID "${spreadsheetId}" was not found. Please check your Spreadsheet ID in settings.`,
    };
  }

  if (msg.includes('disabled') || msg.includes('has not been used in project') || msg.includes('enable the api')) {
    return {
      code: 'API_DISABLED',
      status: 400,
      message: 'Google Sheets API is disabled in the Google Cloud Project. Please enable Google Sheets API in the Google Cloud Console.',
    };
  }

  if (status === 429 || msg.includes('quota') || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
    return {
      code: 'RATE_LIMIT_EXCEEDED',
      status: 429,
      message: 'Google Sheets API rate limit reached (60 requests/min). Please wait a few seconds while backoff cools down.',
    };
  }

  return {
    code: 'API_ERROR',
    status: status >= 400 && status < 600 ? status : 500,
    message: err?.message || 'Failed to communicate with Google Sheets API.',
  };
}

/**
 * Execute a Google Sheets REST API call with Service Account Bearer token,
 * automatic backoff retry on HTTP 429, and clean error diagnosis.
 */
export async function callSheetsApi(
  url: string,
  options: RequestInit = {},
  spreadsheetId?: string
): Promise<any> {
  const { client, clientEmail, error } = getServiceAccountClient();
  if (!client || error) {
    throw error || { code: 'MISSING_CREDENTIALS', status: 400, message: 'Google Service Account credentials missing.' };
  }

  let tokenResult: any;
  try {
    tokenResult = await client.getAccessToken();
  } catch (err: any) {
    throw classifyGoogleSheetsError(err, spreadsheetId, clientEmail);
  }

  const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
  if (!token) {
    throw {
      code: 'TOKEN_ACQUISITION_FAILED',
      status: 401,
      message: 'Could not obtain access token from Google Service Account credentials.',
    };
  }

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    attempt++;
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(url, { ...options, headers });

    if (res.ok) {
      if (res.status === 204) return {};
      return await res.json().catch(() => ({}));
    }

    const errBody = await res.json().catch(() => ({}));
    const rawError = {
      status: res.status,
      message: errBody?.error?.message || `Google Sheets API error (${res.status})`,
      details: errBody?.error,
    };

    // If Rate Limited (429), apply exponential backoff retry
    if (res.status === 429 && attempt < maxRetries) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, backoffMs));
      continue;
    }

    throw classifyGoogleSheetsError(rawError, spreadsheetId, clientEmail);
  }
}

/**
 * Get Service Account configuration and health status.
 */
export async function getServiceAccountStatus(): Promise<{
  configured: boolean;
  clientEmail?: string;
  projectId?: string;
  source?: string;
  error?: string;
  errorCode?: string;
}> {
  const { credentials, source, error } = resolveServiceAccountCredentials();
  if (!credentials || !credentials.client_email) {
    return {
      configured: false,
      error: error || 'Google Service Account is not configured.',
      errorCode: 'MISSING_CREDENTIALS',
    };
  }

  return {
    configured: true,
    clientEmail: credentials.client_email,
    projectId: credentials.project_id || '',
    source,
  };
}

/**
 * Extract clean spreadsheet ID from raw ID or URL.
 */
export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return trimmed;
}

export function formatSheetRange(sheetTab: string, cellOrRange: string): string {
  const cleanTab = (sheetTab || 'Angi').trim().replace(/'/g, "''");
  return `'${cleanTab}'!${cellOrRange}`;
}

export function columnToLetter(column: number): string {
  let temp: number;
  let letter = '';
  let col = column + 1;
  while (col > 0) {
    temp = (col - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    col = Math.floor((col - temp - 1) / 26);
  }
  return letter;
}

export function generateTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;
}

export function isHeaderRowValues(row: string[]): boolean {
  if (!row || row.length === 0) return false;
  const cells = row.map((c) => (c || '').toLowerCase().trim());
  const headerKeywords = [
    'client name', 'customer name', 'full name', 'name', 'status',
    'lead status', 'stage', 'service needed', 'date', 'phone', 'address', 'email', 'lead fee'
  ];
  let matches = 0;
  for (const cell of cells) {
    if (cell && headerKeywords.some((kw) => cell === kw || cell.includes(kw))) {
      matches++;
    }
  }
  return matches >= 2;
}

export function detectColumnMapping(headerRow: string[]) {
  const norm = headerRow.map((h) =>
    (h || '').toLowerCase().trim().replace(/[\r\n\t_]+/g, ' ').replace(/\s+/g, ' ')
  );
  const matched = new Set<number>();

  const findBestCol = (predicates: ((h: string) => boolean)[]): number => {
    for (const pred of predicates) {
      for (let i = 0; i < norm.length; i++) {
        if (!matched.has(i) && pred(norm[i])) {
          matched.add(i);
          return i;
        }
      }
    }
    return -1;
  };

  const tsCol = findBestCol([(h) => h.includes('date') || h.includes('timestamp')]);
  const nameCol = findBestCol([(h) => h.includes('name') || h.includes('client') || h.includes('customer')]);
  const phoneCol = findBestCol([(h) => h.includes('phone') || h.includes('mobile') || h.includes('cell')]);
  const emailCol = findBestCol([(h) => h.includes('email') || h.includes('mail')]);
  const addrCol = findBestCol([(h) => h.includes('address') || h.includes('location') || h.includes('street')]);
  const typeCol = findBestCol([(h) => h.includes('service') || h.includes('type')]);
  const leadFeeCol = findBestCol([(h) => h.includes('fee') || h.includes('cost')]);
  const statusCol = findBestCol([(h) => h.includes('status') || h.includes('stage')]);
  const carrierCol = findBestCol([(h) => h.includes('carrier')]);
  const notesCol = findBestCol([(h) => h.includes('note') || h.includes('comment') || h.includes('detail')]);

  return {
    tsCol: tsCol !== -1 ? tsCol : 0,
    nameCol: nameCol !== -1 ? nameCol : 1,
    phoneCol: phoneCol !== -1 ? phoneCol : 2,
    emailCol: emailCol !== -1 ? emailCol : 3,
    addrCol: addrCol !== -1 ? addrCol : 4,
    typeCol: typeCol !== -1 ? typeCol : 5,
    leadFeeCol: leadFeeCol !== -1 ? leadFeeCol : 6,
    statusCol: statusCol !== -1 ? statusCol : 7,
    carrierCol: carrierCol !== -1 ? carrierCol : -1,
    notesCol: notesCol !== -1 ? notesCol : -1,
  };
}

export function parseSheetValuesToRecords(
  rawValues: string[][],
  sheetTab: string = 'Angi'
): { headers: string[]; rows: SheetRowRecord[]; statusColIndex: number } {
  if (!rawValues || rawValues.length === 0) {
    return { headers: DEFAULT_SHEET_HEADERS, rows: [], statusColIndex: 7 };
  }

  let hasDetectedHeader = false;
  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rawValues.length, 5); r++) {
    if (isHeaderRowValues(rawValues[r])) {
      headerRowIndex = r;
      hasDetectedHeader = true;
      break;
    }
  }

  const headerRow = hasDetectedHeader ? rawValues[headerRowIndex] : DEFAULT_SHEET_HEADERS;
  const mapping = detectColumnMapping(headerRow);
  const rows: SheetRowRecord[] = [];
  const startRow = hasDetectedHeader ? headerRowIndex + 1 : 0;

  for (let i = startRow; i < rawValues.length; i++) {
    const row = rawValues[i];
    if (!row || row.length === 0 || row.every((c) => !c || c.trim() === '')) continue;
    if (isHeaderRowValues(row)) continue;

    const getVal = (idx: number) => (idx >= 0 && idx < row.length ? (row[idx] || '').trim() : '');

    const clientName = getVal(mapping.nameCol);
    const clientPhone = getVal(mapping.phoneCol);
    const clientEmail = getVal(mapping.emailCol);
    const address = getVal(mapping.addrCol);
    let status = getVal(mapping.statusCol) || 'New';
    const serviceNeeded = getVal(mapping.typeCol);
    const timestamp = getVal(mapping.tsCol);
    const carrier = mapping.carrierCol !== -1 ? getVal(mapping.carrierCol) : '';

    if (!clientName && !clientPhone && !clientEmail && !address) continue;

    rows.push({
      rowIndex: i + 1,
      tabName: sheetTab,
      statusColIndex: mapping.statusCol,
      clientName: clientName || 'Unnamed Client',
      status: status || 'New',
      leadSource: sheetTab,
      leadType: serviceNeeded,
      address,
      timestamp,
      clientPhone,
      clientEmail,
      rawValues: row,
    });
  }

  return { headers: headerRow, rows, statusColIndex: mapping.statusCol };
}

/**
 * Invalidate server-side caches.
 */
export function invalidateServerCache(spreadsheetId?: string) {
  if (!spreadsheetId) {
    detailsCache.clear();
    rowsCache.clear();
    batchCache.clear();
    return;
  }
  const cleanId = extractSpreadsheetId(spreadsheetId);
  detailsCache.delete(cleanId);
  for (const key of Array.from(rowsCache.keys())) {
    if (key.startsWith(`${cleanId}_`)) rowsCache.delete(key);
  }
  for (const key of Array.from(batchCache.keys())) {
    if (key.startsWith(`${cleanId}_`)) batchCache.delete(key);
  }
}

/**
 * Get spreadsheet details (title, tab names).
 */
export async function getSpreadsheetDetails(spreadsheetId: string, forceFresh = false): Promise<SpreadsheetDetails> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const now = Date.now();

  if (!forceFresh) {
    const cached = detailsCache.get(cleanId);
    if (cached && cached.expiresAt > now) return cached.data;
    if (detailsInFlight.has(cleanId)) return detailsInFlight.get(cleanId)!;
  }

  const fetchPromise = (async () => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=spreadsheetId,properties.title,sheets.properties`;
    const data = await callSheetsApi(url, { method: 'GET' }, cleanId);

    const sheets: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId || 0,
      title: s.properties?.title || 'Sheet1',
      index: s.properties?.index || 0,
    }));

    const result: SpreadsheetDetails = {
      id: data.spreadsheetId || cleanId,
      title: data.properties?.title || 'Untitled Spreadsheet',
      sheets,
      url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId || cleanId}/edit`,
    };

    detailsCache.set(cleanId, { data: result, expiresAt: Date.now() + 180000 }); // 3 mins TTL
    return result;
  })();

  detailsInFlight.set(cleanId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    detailsInFlight.delete(cleanId);
  }
}

/**
 * Read rows from a single tab.
 */
export async function readSheetRows(
  spreadsheetId: string,
  sheetTab: string = 'Angi',
  forceFresh = false
): Promise<{ headers: string[]; rows: SheetRowRecord[]; statusColIndex: number }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const cacheKey = `${cleanId}_${sheetTab}`;
  const now = Date.now();

  if (!forceFresh) {
    const cached = rowsCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.data;
    if (rowsInFlight.has(cacheKey)) return rowsInFlight.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    const range = encodeURIComponent(formatSheetRange(sheetTab, 'A1:Z500'));
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${range}`;
    const data = await callSheetsApi(url, { method: 'GET' }, cleanId);

    const rawValues: string[][] = data.values || [];
    const result = parseSheetValuesToRecords(rawValues, sheetTab);

    rowsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 20000 }); // 20s TTL
    return result;
  })();

  rowsInFlight.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    rowsInFlight.delete(cacheKey);
  }
}

/**
 * Read multiple tabs in a single batch request.
 */
export async function readAllTabs(
  spreadsheetId: string,
  sheetTabs: string[],
  forceFresh = false
): Promise<{ headers: string[]; rows: SheetRowRecord[] }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!sheetTabs || sheetTabs.length === 0) {
    return { headers: DEFAULT_SHEET_HEADERS, rows: [] };
  }

  const sortedTabsKey = [...sheetTabs].sort().join(',');
  const cacheKey = `${cleanId}_BATCH_${sortedTabsKey}`;
  const now = Date.now();

  if (!forceFresh) {
    const cached = batchCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.data;
    if (batchInFlight.has(cacheKey)) return batchInFlight.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    const rangeParams = sheetTabs
      .map((tab) => `ranges=${encodeURIComponent(formatSheetRange(tab, 'A1:Z500'))}`)
      .join('&');

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchGet?${rangeParams}`;
    const data = await callSheetsApi(url, { method: 'GET' }, cleanId);

    const valueRanges: Array<{ range: string; values?: string[][] }> = data.valueRanges || [];
    let mergedHeaders = DEFAULT_SHEET_HEADERS;
    const mergedRows: SheetRowRecord[] = [];

    valueRanges.forEach((vr, idx) => {
      const tabName = sheetTabs[idx] || `Tab${idx + 1}`;
      const rawValues = vr.values || [];
      const parsed = parseSheetValuesToRecords(rawValues, tabName);

      if (parsed.headers && parsed.headers.length > 0) {
        mergedHeaders = parsed.headers;
      }

      rowsCache.set(`${cleanId}_${tabName}`, {
        data: parsed,
        expiresAt: Date.now() + 20000,
      });

      parsed.rows.forEach((r) => {
        mergedRows.push({
          ...r,
          tabName: r.tabName || tabName,
          leadSource: r.leadSource || tabName,
        });
      });
    });

    const result = { headers: mergedHeaders, rows: mergedRows };
    batchCache.set(cacheKey, { data: result, expiresAt: Date.now() + 20000 });
    return result;
  })();

  batchInFlight.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    batchInFlight.delete(cacheKey);
  }
}

/**
 * Resolves the actual current row of a lead in the sheet if rows have shifted.
 */
export async function resolveActualRowIndex(
  cleanId: string,
  tab: string,
  proposedRowIndex: number,
  clientName?: string,
  clientPhone?: string
): Promise<number> {
  if (!clientName && !clientPhone) return proposedRowIndex;
  try {
    // 1. Check proposedRowIndex directly
    const checkRange = formatSheetRange(tab, `A${proposedRowIndex}:D${proposedRowIndex}`);
    const checkRes = await callSheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(checkRange)}`,
      { method: 'GET' },
      cleanId
    );
    const rowVals = checkRes.values?.[0] || [];
    const rName = (rowVals[1] || '').trim().toLowerCase();
    const rPhone = (rowVals[2] || '').replace(/\D/g, '');

    const targetName = (clientName || '').trim().toLowerCase();
    const targetPhone = (clientPhone || '').replace(/\D/g, '');

    if (
      (targetName && rName && (rName === targetName || rName.includes(targetName) || targetName.includes(rName))) ||
      (targetPhone && targetPhone.length >= 7 && rPhone.includes(targetPhone.slice(-7)))
    ) {
      return proposedRowIndex; // Exact match at proposed row!
    }

    // 2. Row shifted! Scan rows to find actual current position
    const scanRange = formatSheetRange(tab, 'A5:D300');
    const scanRes = await callSheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(scanRange)}`,
      { method: 'GET' },
      cleanId
    );
    const rows = scanRes.values || [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const curName = (row[1] || '').trim().toLowerCase();
      const curPhone = (row[2] || '').replace(/\D/g, '');

      const phoneMatches = targetPhone.length >= 7 && curPhone.length >= 7 && (curPhone === targetPhone || curPhone.includes(targetPhone.slice(-7)));
      const nameMatches = targetName && curName && (curName === targetName || curName.includes(targetName) || targetName.includes(curName));

      if (phoneMatches || nameMatches) {
        const actualRow = 5 + i;
        console.log(`[Sheets Row Resolution] Lead "${clientName}" moved from row ${proposedRowIndex} to row ${actualRow}. Using resolved row.`);
        return actualRow;
      }
    }
  } catch (err) {
    console.warn('[Sheets Row Resolution] Notice:', err);
  }
  return proposedRowIndex;
}

/**
 * Update a specific cell in the spreadsheet.
 */
export async function updateCell(
  spreadsheetId: string,
  sheetTab: string,
  rowIndex: number,
  columnIndex: number,
  value: string,
  clientName?: string,
  clientPhone?: string
): Promise<void> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const actualRow = await resolveActualRowIndex(cleanId, sheetTab, rowIndex, clientName, clientPhone);
  const colLetter = columnToLetter(columnIndex);
  const cellRange = formatSheetRange(sheetTab, `${colLetter}${actualRow}`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(cellRange)}?valueInputOption=USER_ENTERED`;

  await callSheetsApi(
    url,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [[value]] }),
    },
    cleanId
  );

  invalidateServerCache(cleanId);
}

/**
 * Update client information across columns for a specific row in the spreadsheet.
 */
export async function updateLeadRow(
  spreadsheetId: string,
  sheetTab: string,
  rowIndex: number,
  leadData: {
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string;
    address?: string;
    serviceNeeded?: string;
    leadFee?: string;
    status?: string;
    carrier?: string;
    notes?: string;
  },
  clientName?: string,
  clientPhone?: string
): Promise<void> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const tab = (sheetTab || 'Angi').trim();
  const actualRow = await resolveActualRowIndex(
    cleanId,
    tab,
    rowIndex,
    clientName || leadData.clientName,
    clientPhone || leadData.clientPhone
  );

  // Read header row to get column mapping
  const headerRange = formatSheetRange(tab, "1:4");
  let headerRow = DEFAULT_SHEET_HEADERS;
  try {
    const rawHeaders = await callSheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(headerRange)}`,
      { method: 'GET' },
      cleanId
    );
    if (rawHeaders && rawHeaders.values && Array.isArray(rawHeaders.values)) {
      for (const r of rawHeaders.values) {
        if (isHeaderRowValues(r)) {
          headerRow = r;
          break;
        }
      }
    }
  } catch (_) {}

  const mapping = detectColumnMapping(headerRow);

  const updates: { col: number; val: string }[] = [];
  if (leadData.clientName !== undefined && mapping.nameCol >= 0) {
    updates.push({ col: mapping.nameCol, val: leadData.clientName });
  }
  if (leadData.clientPhone !== undefined && mapping.phoneCol >= 0) {
    updates.push({ col: mapping.phoneCol, val: leadData.clientPhone });
  }
  if (leadData.clientEmail !== undefined && mapping.emailCol >= 0) {
    updates.push({ col: mapping.emailCol, val: leadData.clientEmail });
  }
  if (leadData.address !== undefined && mapping.addrCol >= 0) {
    updates.push({ col: mapping.addrCol, val: leadData.address });
  }
  if (leadData.serviceNeeded !== undefined && mapping.typeCol >= 0) {
    updates.push({ col: mapping.typeCol, val: leadData.serviceNeeded });
  }
  if (leadData.leadFee !== undefined && mapping.leadFeeCol >= 0) {
    updates.push({ col: mapping.leadFeeCol, val: leadData.leadFee });
  }
  if (leadData.status !== undefined && mapping.statusCol >= 0) {
    updates.push({ col: mapping.statusCol, val: leadData.status });
  }
  if (leadData.carrier !== undefined && mapping.carrierCol >= 0) {
    updates.push({ col: mapping.carrierCol, val: leadData.carrier });
  }
  if (leadData.notes !== undefined && mapping.notesCol >= 0) {
    updates.push({ col: mapping.notesCol, val: leadData.notes });
  }

  // Update cells in Google Sheets
  const dataPayload = updates.map((u) => ({
    range: formatSheetRange(tab, `${columnToLetter(u.col)}${actualRow}`),
    values: [[u.val]],
  }));

  if (dataPayload.length > 0) {
    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchUpdate`;
    await callSheetsApi(
      batchUrl,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: dataPayload,
        }),
      },
      cleanId
    );
  }

  invalidateServerCache(cleanId);
}

/**
 * Create tab if not exists.
 */
export async function createTabIfNotExists(spreadsheetId: string, tabTitle: string): Promise<void> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  try {
    const details = await getSpreadsheetDetails(cleanId);
    const exists = details.sheets.some((s) => s.title.trim().toLowerCase() === tabTitle.trim().toLowerCase());
    if (exists) return;

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`;
    await callSheetsApi(
      url,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: tabTitle,
                  gridProperties: { frozenRowCount: 1 },
                },
              },
            },
          ],
        }),
      },
      cleanId
    );

    invalidateServerCache(cleanId);
  } catch (err) {
    console.warn(`Could not verify/create tab "${tabTitle}":`, err);
  }
}

// Mutex lock to coordinate concurrent incoming lead appends and prevent competing for Row 5
let sheetAppendMutex = Promise.resolve();

/**
 * Append a new lead to row 5 (shifting older leads down) or append.
 */
export async function appendLeadRow(
  spreadsheetId: string,
  sheetTab: string = 'Angi',
  leadData: any,
  status: string = 'New'
): Promise<{ updatedRange: string; updatedRows: number }> {
  return new Promise((resolve, reject) => {
    sheetAppendMutex = sheetAppendMutex.then(async () => {
      try {
        const result = await executeAppendLeadRow(spreadsheetId, sheetTab, leadData, status);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function executeAppendLeadRow(
  spreadsheetId: string,
  sheetTab: string = 'Angi',
  leadData: any,
  status: string = 'New'
): Promise<{ updatedRange: string; updatedRows: number }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const targetTab = (leadData.leadSource || sheetTab || 'Angi').trim();

  await createTabIfNotExists(cleanId, targetTab);

  // Read header row to dynamically detect column positions
  const headerRange = formatSheetRange(targetTab, "1:4");
  let headerRow = DEFAULT_SHEET_HEADERS;
  try {
    const rawHeaders = await callSheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(headerRange)}`,
      { method: 'GET' },
      cleanId
    );
    if (rawHeaders && rawHeaders.values && Array.isArray(rawHeaders.values)) {
      for (const r of rawHeaders.values) {
        if (isHeaderRowValues(r)) {
          headerRow = r;
          break;
        }
      }
    }
  } catch (_) {}

  const mapping = detectColumnMapping(headerRow);
  const totalCols = Math.max(headerRow.length, 8);
  const rowValues: string[] = new Array(totalCols).fill('');

  const timestamp = generateTimestamp();
  if (mapping.tsCol >= 0) rowValues[mapping.tsCol] = timestamp;
  else rowValues[0] = timestamp;

  if (mapping.nameCol >= 0) rowValues[mapping.nameCol] = leadData.clientName || '';
  if (mapping.phoneCol >= 0) rowValues[mapping.phoneCol] = leadData.clientPhone || '';
  if (mapping.emailCol >= 0) rowValues[mapping.emailCol] = leadData.clientEmail || '';
  if (mapping.addrCol >= 0) rowValues[mapping.addrCol] = leadData.address || '';
  
  // Weakness 21: If service needed is missing, leave empty or flag 'Service details needed', do not force 'General Masonry'
  const svc = (leadData.serviceNeeded || leadData.leadType || '').trim();
  if (mapping.typeCol >= 0) rowValues[mapping.typeCol] = svc;

  if (mapping.leadFeeCol >= 0) rowValues[mapping.leadFeeCol] = leadData.leadFee || '';
  if (mapping.statusCol >= 0) rowValues[mapping.statusCol] = status || 'New';
  
  // Weakness 27: Save incoming notes to the Notes column
  if (mapping.notesCol >= 0 && leadData.notes) {
    rowValues[mapping.notesCol] = leadData.notes;
  }

  // 1. Get sheetId for the target tab
  const details = await getSpreadsheetDetails(cleanId);
  const targetSheet = details.sheets.find(
    (s) => s.title.trim().toLowerCase() === targetTab.toLowerCase()
  );

  if (targetSheet) {
    try {
      // Deduplication check: inspect all rows (A5:H300)
      const incomingPhoneDigits = (leadData.clientPhone || '').replace(/\D/g, '');
      const incomingName = (leadData.clientName || '').trim().toLowerCase();
      const incomingEmail = (leadData.clientEmail || '').trim().toLowerCase();
      const incomingAddress = (leadData.address || '').trim().toLowerCase();
      const incomingSourceId = (leadData.sourceEventId || '').trim();

      try {
        const checkRange = formatSheetRange(targetTab, 'A5:H300');
        const checkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(checkRange)}`;
        const checkRes = await callSheetsApi(checkUrl, { method: 'GET' }, cleanId);
        const allSheetRows: string[][] = checkRes.values || [];

        for (let i = 0; i < allSheetRows.length; i++) {
          const r = allSheetRows[i];
          if (!r || r.length === 0) continue;
          const rName = (r[1] || '').trim().toLowerCase();
          const rPhoneDigits = (r[2] || '').replace(/\D/g, '');
          const rEmail = (r[3] || '').trim().toLowerCase();
          const rAddress = (r[4] || '').trim().toLowerCase();
          const rNotes = (r[6] || '').trim();
          const rStatus = (r[7] || '').trim().toLowerCase();

          // Weakness 5: If an existing record was marked Finished or Lost long ago, allow a new inquiry rather than assuming it's a duplicate
          const isCompletedStatus =
            rStatus.includes('finish') ||
            rStatus.includes('sold') ||
            rStatus.includes('completed') ||
            rStatus.includes('closed') ||
            rStatus.includes('lost') ||
            rStatus.includes('bad lead') ||
            rStatus.includes('dead');

          const sourceEventMatch = incomingSourceId && rNotes.includes(`EventID:${incomingSourceId}`);
          const phoneMatch = incomingPhoneDigits.length >= 7 && rPhoneDigits.length >= 7 && (
            rPhoneDigits === incomingPhoneDigits ||
            rPhoneDigits.endsWith(incomingPhoneDigits.slice(-7)) ||
            incomingPhoneDigits.endsWith(rPhoneDigits.slice(-7))
          );
          const nameMatch = incomingName.length > 2 && rName.length > 2 && (
            rName === incomingName || rName.includes(incomingName) || incomingName.includes(rName)
          );
          const emailMatch = incomingEmail.length > 3 && rEmail.length > 3 && rEmail === incomingEmail;
          const addressMatch = incomingAddress.length > 5 && rAddress.length > 5 && (
            rAddress.includes(incomingAddress.slice(0, 15)) || incomingAddress.includes(rAddress.slice(0, 15))
          );

          if ((sourceEventMatch || phoneMatch || (nameMatch && (emailMatch || addressMatch))) && !isCompletedStatus) {
            const existingRowIndex = 5 + i;
            console.log(`[Google Sheets] Active lead "${leadData.clientName}" already exists at Row ${existingRowIndex} in tab "${targetTab}". Skipping duplicate row creation.`);
            // Update the status cell if new status provided
            if (status && status !== r[7]) {
              const statusCol = mapping.statusCol >= 0 ? mapping.statusCol : 7;
              const statusCell = formatSheetRange(targetTab, `${columnToLetter(statusCol)}${existingRowIndex}`);
              await callSheetsApi(
                `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(statusCell)}?valueInputOption=USER_ENTERED`,
                { method: 'PUT', body: JSON.stringify({ values: [[status]] }) },
                cleanId
              );
            }
            invalidateServerCache(cleanId);
            return {
              updatedRange: `${targetTab}!A${existingRowIndex}:H${existingRowIndex}`,
              updatedRows: 1,
            };
          }
        }
      } catch (dedupErr) {
        console.warn('Google Sheets duplicate check note:', dedupErr);
      }

      // 1. Check current content at Row 5 to see if it is currently blank/empty
      const checkRange = formatSheetRange(targetTab, `A5:${columnToLetter(totalCols - 1)}5`);
      const checkUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(checkRange)}`;
      let isRow5Empty = false;
      try {
        const checkRes = await callSheetsApi(checkUrl, { method: 'GET' }, cleanId);
        const vals: string[] = checkRes.values?.[0] || [];
        isRow5Empty = !vals.some((v) => v && String(v).trim().length > 0);
      } catch {
        isRow5Empty = false;
      }

      if (isRow5Empty) {
        // Row 5 is currently blank! Write directly to Row 5 without shifting
        const targetRange = formatSheetRange(targetTab, 'A5');
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(targetRange)}?valueInputOption=USER_ENTERED`;
        const updateRes = await callSheetsApi(
          updateUrl,
          {
            method: 'PUT',
            body: JSON.stringify({ values: [rowValues] }),
          },
          cleanId
        );

        invalidateServerCache(cleanId);
        return {
          updatedRange: updateRes.updatedRange || `${targetTab}!A5`,
          updatedRows: 1,
        };
      }

      // 2. Row 5 already has a lead: insert exactly 1 blank row at index 4 (Row 5) to shift existing rows down
      const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`;
      await callSheetsApi(
        batchUrl,
        {
          method: 'POST',
          body: JSON.stringify({
            requests: [
              {
                insertDimension: {
                  range: {
                    sheetId: targetSheet.sheetId,
                    dimension: 'ROWS',
                    startIndex: 4,
                    endIndex: 5,
                  },
                  inheritFromBefore: false,
                },
              },
            ],
          }),
        },
        cleanId
      );

      // Write the new lead into Row 5
      const targetRange = formatSheetRange(targetTab, 'A5');
      const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(targetRange)}?valueInputOption=USER_ENTERED`;
      const updateRes = await callSheetsApi(
        updateUrl,
        {
          method: 'PUT',
          body: JSON.stringify({ values: [rowValues] }),
        },
        cleanId
      );

      invalidateServerCache(cleanId);
      return {
        updatedRange: updateRes.updatedRange || `${targetTab}!A5`,
        updatedRows: 1,
      };
    } catch (insertErr) {
      console.warn('Row 5 insertion failed, falling back to standard append:', insertErr);
    }
  }

  // Fallback: standard append
  const appendRange = encodeURIComponent(formatSheetRange(targetTab, 'A:I'));
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const appendRes = await callSheetsApi(
    appendUrl,
    {
      method: 'POST',
      body: JSON.stringify({ values: [rowValues] }),
    },
    cleanId
  );

  invalidateServerCache(cleanId);
  return {
    updatedRange: appendRes.updates?.updatedRange || `${targetTab}!A5`,
    updatedRows: appendRes.updates?.updatedRows || 1,
  };
}

/**
 * Delete a row by 1-based rowIndex.
 */
export async function deleteRow(
  spreadsheetId: string,
  sheetTab: string,
  rowIndex: number
): Promise<void> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const details = await getSpreadsheetDetails(cleanId);
  const targetSheet = details.sheets.find(
    (s) => s.title.trim().toLowerCase() === sheetTab.trim().toLowerCase()
  ) || details.sheets[0];

  if (!targetSheet) {
    throw {
      code: 'TAB_NOT_FOUND',
      status: 404,
      message: `Sheet tab "${sheetTab}" not found.`,
    };
  }

  const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}:batchUpdate`;
  await callSheetsApi(
    batchUrl,
    {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: targetSheet.sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          },
        ],
      }),
    },
    cleanId
  );

  invalidateServerCache(cleanId);
}
