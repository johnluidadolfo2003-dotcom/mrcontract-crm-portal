import { AppointmentFormData } from '../types';

export interface GoogleDriveFile {
 id: string;
 name: string;
 modifiedTime?: string;
 webViewLink?: string;
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
 rowIndex: number; // 1-based row index in sheet (e.g. 2 for 2nd row)
 tabName?: string; // which tab/source this row belongs to (e.g. 'Angi', 'Thumbtack', etc.)
 statusColIndex?: number; // 0-based column index of Status in sheet
 timestamp?: string;
 scheduledAt?: string;
 appointmentDate?: string;
 startTime?: string;
 endTime?: string;
 clientName?: string;
 clientPhone?: string;
 clientEmail?: string;
 address?: string;
 salespersonCode?: string;
 leadSource?: string;
 angiAccount?: 'not_identified' | 'dxg' | 'mr_contract';
 leadType?: string;
 serviceNeeded?: string;
 notes?: string;
 status?: string;
 rawValues: string[];
 carrier?: string;
 leadFee?: string;
}

export const KNOWN_CLIENT_NAMES = new Set([
 'susan higgins', 'john wood', 'deb maz', 'fred ramsey', 'wayne mccafferty',
 'kristine proco', 'kristin williams', 'bert tinklepaugh', 'linda mcneice',
 'shailesh surti', 'glenn wayland', 'geriann rybacki', 'cynthia lennox',
 'robert stone', 'angela tarbett', 'malaika white', 'dave redmerski',
 'daniel jones', 'james sheasley', 'diane mariani', 'lisa williams',
 'carl onufer', 'yuliya berezkin', 'james taddeo', 'yvonne niederberger',
 'leah miloser', 'jess rosmus', 'james peters', 'todd kulik', 'lamont charles',
 'meir aharon', 'jim brill', 'sheila mendel', 'trude mancini', 'janet waters',
 'joseph newkirk', 'joseph kiss', 'john barringer', 'michael hartle',
 'bobby hull', 'marlene washington', 'jill uber', 'ron wilson', 'mark wilburn sr.',
 'jake vogel', 'michael virbal', 'joseph cochran', 'sarah dipippa', 'jodi yute',
 'joe bosetti', 'patrice singleton', 'kyle nellis', 'james oconnor', 'jim scopel',
 'lynn sierra', 'ian green', 'mark derubeis', 'christie murray', 'craig malits',
 'sandra cascio', 'justin lechner', 'aster assefa', 'john otoole', 'joe arndt',
 'sherri gregory', 'exa thrower', 'mary jo kennedy', 'dennis heflin',
 'betty lou leech', 'richard brandon', 'kimberly elder', 'nicholas kunich',
 'rachel michael', 'edward hetrick', 'kimberly conwell', 'cindy spielvogel',
 'debbie nicotero', 'susan scheid', 'paul breves', 'toni thomas', 'marc wisnosky',
 'zach smith', 'greg capilongo', 'justin lin', 'alex yeager', 'tim jackson',
 'keli walters', 'tracey mccants lewis', 'janette traffichini', 'sharon galiszewski',
 'tom schluep', 'mike rosewell', 'amy jo chiocca', 'lisa yang', 'gerald maier',
 'nancy hubley', 'ginette conover', 'floyd hostetler', 'michele deremer',
 'mikayla simms', 'dima l', 'kathy grubbs', 'sharon keyes', 'christine caton',
 'chandra chaparala', 'brandon tibbs', 'carole demas', 'mary quick',
 'darlene laube', 'mary jo karnash', 'lisa verbanes', 'dawn petrosky',
 'eman ali', 'saudia bey', 'keith rogers', 'joe berrick', 'todd mckillop',
 'kim sypula', 'fabian zerbini', 'mary chapman', 'kailyn jordan', 'eric robertson',
 'pamela young', 'david cole', 'sabina zahra', 'billy bonharbo',
 'alyce and harry jacob', 'bob gillner', 'thomas tholen', 'rick talotta',
 'beverly byrnes', 'andrea jankovichas', 'bob delaney', 'tim sharkey',
 'barbara lanigan', 'allen jones', 'valerie cook', 'kathy lantz',
 'ryan mancini', 'russell thomas', 'judi abate', 'mike tomchak', 'jean elser',
 'josepph herschl', 'don common', 'lexci sanders', 'bob waltz', 'larry mauro',
 'maggie robbins', 'chris heilman', 'morgan grudi', 'ann paul', 'cheri martin',
 'bev mcconeghy', 'mike tomchak', 'ellena cameron', 'catherine paich', 'dennis matson',
 'alexis smith', 'richard bucchianeri', 'joyce krebs', 'rushel shell',
 'jo ann stiffler', 'kelly morgan', 'david bioni', 'ralph ruggiero',
 'oliver jackson', 'diana trojan', 'rich lind', 'angel barker', 'judith carter',
 'richard edahl', 'mike powell', 'renay crooks', 'terry wilson', 'angie kline',
 'anthony kourakos', 'helene wisbith', 'janet armstrong', 'keith somerville',
 'dominique kelly', 'sheri edmondson', 'linda smith', 'beth ann fuhrer',
 'denise kushik', 'alton smith', 'pratiksha dixit', 'emily anderson',
 'jeff kurchina', 'tom horew', 'kathleen wilcox', 'lawrence mccarthy',
 'john macurak', 'felecia l', 'susan weyandt', 'dan dickman', 'logan hartle',
 'barbara schneider', 'adam slivka'
]);

export function isKnownClientName(name: string): boolean {
 if (!name) return false;
 const clean = name.toLowerCase().replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').replace(/["]/g, '').trim();
 return KNOWN_CLIENT_NAMES.has(clean);
}

/**
 * Checks if a string looks like a person's name (e.g."Susan Higgins","John Wood")
 */
export function looksLikeClientName(val: string): boolean {
 if (!val) return false;
 const clean = val.toLowerCase().replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').replace(/["]/g, '').trim();
 if (KNOWN_CLIENT_NAMES.has(clean)) return true;
 
 // Exclude common non-name terms
 const nonNameKeywords = [
 'date lead generated', 'repair', 'clean and inspect', 'install', 'replace',
 'fireplace', 'chimney', 'flatwork', 'brick', 'stone', 'angi', 'thumbtack',
 'facebook', 'google', 'scheduled', 'won job', 'lost job', 'archived', 'new',
 'pending', 'cancelled', 'completed', 'lead category', 'service needed',
 'phone', 'address', 'email', 'notes'
 ];
 if (nonNameKeywords.some(kw => clean.includes(kw))) return false;

 // Pattern: 1 to 4 capitalized words or typical first + last name
 return /^[a-zA-Z'.]+(\s+[a-zA-Z'.]+){1,4}$/.test(clean);
}

export const DEFAULT_SHEET_HEADERS = [
 'Date', // Column 0 / A - date when the lead created so fill this out automatically
 'Client Name', // Column 1 / B - in the form
 'Phone Number', // Column 2 / C - in the form
 'Email', // Column 3 / D - in the form
 'Address', // Column 4 / E - in the form
 'Service Needed', // Column 5 / F - in the form (blank if not available)
 'Lead Fee', // Column 6 / G - blank if not available
 'Status', // Column 7 / H - in the form
];

/**
 * Generate a clean standard timestamp (YYYY-MM-DD HH:mm:ss)
 */
export function generateTimestamp(): string {
 const now = new Date();
 const pad = (n: number) => String(n).padStart(2, '0');
 return `${pad(now.getMonth() + 1)}/${pad(now.getDate())}/${now.getFullYear()}`;
}

/**
 * Column mapping interface for dynamic sheet column resolution
 */
export interface ColumnMapping {
 tsCol: number;
 nameCol: number;
 phoneCol: number;
 emailCol: number;
 addrCol: number;
 typeCol: number;
 leadFeeCol: number;
 statusCol: number;
 sourceCol: number;
 dateCol: number;
 startCol: number;
 endCol: number;
 spCol: number;
 notesCol: number;
 carrierCol: number;
}

/**
 * Checks if a row is a header row containing column labels instead of customer data
 */
export function isHeaderRowValues(row: string[]): boolean {
 if (!row || row.length === 0) return false;
 const cells = row.map((c) => (c || '').toLowerCase().trim());
 const headerKeywords = [
 'client name',
 'customer name',
 'full name',
 'name',
 'status',
 'lead status',
 'stage',
 'lead category',
 'lead source',
 'service needed',
 'service requested',
 'service',
 'lead type',
 'job type',
 'date lead generated',
 'date',
 'timestamp',
 'address',
 'phone',
 'phone number',
 'email',
 'lead fee',
 'fee',
 'appt date',
 'appointment date',
 'start time',
 'end time',
 'salesperson',
 'notes',
 ];

 let matches = 0;
 for (const cell of cells) {
 if (cell && headerKeywords.some((kw) => cell === kw || cell.includes(kw))) {
 matches++;
 }
 }

 // If 2 or more header keywords matched
 if (matches >= 2) return true;

 // If first cell or second cell is a known header string
 const first = cells[0] || '';
 const second = cells[1] || '';
 if (
 first === 'client name' ||
 first === 'date' ||
 first === 'date lead generated' ||
 first === 'service needed' ||
 first === 'lead category' ||
 first === 'lead source' ||
 second === 'client name' ||
 second === 'status'
 ) {
 return true;
 }

 return false;
}

/**
 * Detect column indices dynamically based on the actual header row
 */
export function detectColumnMapping(headerRow: string[]): ColumnMapping {
 const norm = headerRow.map((h) =>
 (h || '')
 .toLowerCase()
 .trim()
 .replace(/[\r\n\t_]+/g, ' ')
 .replace(/\s+/g, ' ')
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

 // 1. Date / Timestamp (Column 0 / A)
 const tsCol = findBestCol([
 (h) => h === 'date' || h === 'date lead generated' || h === 'date generated' || h === 'lead date',
 (h) => h === 'timestamp' || h === 'date added' || h === 'date created' || h === 'created at',
 (h) => (h.includes('date') || h.includes('timestamp') || h.includes('created')) && !h.includes('appt') && !h.includes('appoint'),
 ]);

 // 2. Client Name (Column 1 / B)
 const nameCol = findBestCol([
 (h) => h === 'client name' || h === 'customer name' || h === 'full name' || h === 'lead name' || h === 'contact name',
 (h) => h === 'name' || h === 'client' || h === 'customer',
 (h) => (h.includes('client') || h.includes('customer') || h.includes('name')) && !h.includes('sales') && !h.includes('rep') && !h.includes('agent') && !h.includes('source'),
 ]);

 // 3. Phone Number (Column 2 / C)
 const phoneCol = findBestCol([
 (h) => h === 'phone number' || h === 'phone' || h === 'client phone' || h === 'mobile' || h === 'cell',
 (h) => h.includes('phone') || h.includes('mobile') || h.includes('cell'),
 ]);

 // 4. Email (Column 3 / D)
 const emailCol = findBestCol([
 (h) => h === 'email' || h === 'email address' || h === 'client email' || h === 'e-mail' || h === 'mail',
 (h) => h.includes('email') || h.includes('mail'),
 ]);

 // 5. Address (Column 4 / E)
 const addrCol = findBestCol([
 (h) => h === 'address' || h === 'client address' || h === 'property address' || h === 'street address' || h === 'job address',
 (h) => h === 'location' || h === 'street' || h === 'site address',
 (h) => h.includes('address') || h.includes('location') || h.includes('street'),
 ]);

 // 6. Service Needed (Column 5 / F)
 const typeCol = findBestCol([
 (h) => h === 'service needed' || h === 'service requested' || h === 'service',
 (h) => h === 'lead type' || h === 'job type' || h === 'project type' || h === 'work type' || h === 'trade',
 (h) => (h.includes('service') || h.includes('type')) && !h.includes('sales') && !h.includes('date') && !h.includes('source'),
 ]);

 // 7. Lead Fee (Column 6 / G)
 const leadFeeCol = findBestCol([
 (h) => h === 'lead fee' || h === 'fee' || h === 'lead cost' || h === 'cost' || h === 'price',
 (h) => h.includes('fee') || h.includes('cost'),
 ]);

// 8. Status (Column 7 / H or Column 1 / B depending on header layout)
 const statusCol = findBestCol([
 (h) => h === 'status' || h === 'lead status' || h === 'stage' || h === 'deal stage' || h === 'disposition' || h === 'status / notes' || h === 'follow up status' || h === 'lead state' || h === 'state',
 (h) => (h.includes('status') || h.includes('stage') || h.includes('disposition')) && !h.includes('source'),
 ]);

 // 9. Lead Source / Platform / Channel
 const sourceCol = findBestCol([
 (h) => h === 'lead source' || h === 'source' || h === 'platform' || h === 'lead channel' || h === 'channel',
 (h) => (h.includes('source') || h.includes('platform') || h.includes('channel')) && !h.includes('category'),
 (h) => h === 'lead category' || h === 'category',
 ]);

 // Appt Date, Start Time, End Time, Salesperson, Notes
 const dateCol = findBestCol([
 (h) => h === 'appt date' || h === 'appointment date' || h === 'meeting date',
 (h) => (h.includes('appt') || h.includes('appointment')) && h.includes('date'),
 ]);

 const startCol = findBestCol([(h) => h === 'start time' || h === 'start']);
 const endCol = findBestCol([(h) => h === 'end time' || h === 'end']);
 const spCol = findBestCol([(h) => h === 'salesperson' || h === 'assigned to' || h === 'sales rep']);
 const notesCol = findBestCol([(h) => h === 'notes' || h === 'comments' || h === 'details']);

 // Find Carrier column
 const carrierCol = findBestCol([
 (h) => h === 'carrier' || h === 'cell carrier' || h === 'phone carrier',
 (h) => h.includes('carrier')
 ]);

 return {
 tsCol: tsCol !== -1 ? tsCol : 0,
 nameCol: nameCol !== -1 ? nameCol : 1,
 phoneCol: phoneCol !== -1 ? phoneCol : 2,
 emailCol: emailCol !== -1 ? emailCol : 3,
 addrCol: addrCol !== -1 ? addrCol : 4,
 typeCol: typeCol !== -1 ? typeCol : 5,
 leadFeeCol: leadFeeCol !== -1 ? leadFeeCol : 6,
 statusCol: statusCol !== -1 ? statusCol : 7,
 sourceCol: sourceCol !== -1 ? sourceCol : 8,
 dateCol: dateCol !== -1 ? dateCol : 9,
 startCol: startCol !== -1 ? startCol : 10,
 endCol: endCol !== -1 ? endCol : 11,
 spCol: spCol !== -1 ? spCol : 12,
 notesCol: notesCol !== -1 ? notesCol : 13,
 carrierCol: carrierCol !== -1 ? carrierCol : -1,
 };
}

/**
 * Format a row array aligning every field precisely to the column corresponding to the header
 */
export function mapFormDataToSheetRow(
 headers: string[],
 formData: AppointmentFormData,
 status: string = 'New',
 timestamp: string = generateTimestamp()
): string[] {
 const activeHeaders = headers && headers.length > 0 ? headers : DEFAULT_SHEET_HEADERS;
 const mapping = detectColumnMapping(activeHeaders);
 const rowSize = Math.max(activeHeaders.length, 9);
 const row: string[] = Array(rowSize).fill('');

 if (mapping.tsCol >= 0 && mapping.tsCol < rowSize) row[mapping.tsCol] = timestamp;
 if (mapping.nameCol >= 0 && mapping.nameCol < rowSize) row[mapping.nameCol] = formData.clientName || '';
 if (mapping.phoneCol >= 0 && mapping.phoneCol < rowSize) row[mapping.phoneCol] = formData.clientPhone || '';
 if (mapping.emailCol >= 0 && mapping.emailCol < rowSize) row[mapping.emailCol] = formData.clientEmail || '';
 if (mapping.addrCol >= 0 && mapping.addrCol < rowSize) row[mapping.addrCol] = formData.address || '';
 
 const svcVal = formData.serviceNeeded || formData.leadType || '';
 if (mapping.typeCol >= 0 && mapping.typeCol < rowSize) row[mapping.typeCol] = svcVal;
 if (mapping.leadFeeCol >= 0 && mapping.leadFeeCol < rowSize) row[mapping.leadFeeCol] = formData.leadFee || '';
 if (mapping.statusCol >= 0 && mapping.statusCol < rowSize) row[mapping.statusCol] = status || 'New';

 return row;
}

/**
 * Convert 0-indexed column number to column letter (0 -> 'A', 1 -> 'B', 26 -> 'AA', etc.)
 */
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

/**
 * Extracts spreadsheet ID from either a raw ID or full Google Sheets URL.
 * e.g."https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0"
 * ->"1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
 */
export function extractSpreadsheetId(input: string): string {
 if (!input) return '';
 const trimmed = input.trim();
 
 // Match /spreadsheets/d/([a-zA-Z0-9-_]+)
 const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
 if (match && match[1]) {
 return match[1];
 }
 
 // If it's already an ID (alphanumeric, dashes, underscores)
 if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
 return trimmed;
 }
 
 return trimmed;
}

/**
 * List spreadsheets from the user's Google Drive.
 */
export async function listGoogleSpreadsheets(accessToken: string): Promise<GoogleDriveFile[]> {
 const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
 const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
 const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=50`;

 const response = await fetch(url, {
 headers: {
 Authorization: `Bearer ${accessToken}`,
 },
 });

 if (!response.ok) {
 const err = await response.json().catch(() => ({}));
 throw new Error(err.error?.message || `Failed to fetch Google Spreadsheets (${response.status})`);
 }

 const data = await response.json();
 return data.files || [];
}

export function normalizeStatusValue(rawStatus?: string): string {
 if (!rawStatus) return 'New';
 const clean = rawStatus.replace(/^["']+|["']+$/g, '').trim();
 if (!clean) return 'New';
 const lower = clean.toLowerCase().replace(/[\s_-]+/g, ' ');

 if (lower === 'new' || lower === 'new lead' || lower === 'open' || lower === 'uncontacted' || lower === 'fresh') return 'New';
 if (
 lower === 'followed up' ||
 lower === 'followed-up' ||
 lower === 'follow up' ||
 lower === 'follow-up' ||
 lower === 'contacted' ||
 lower === 'called' ||
 lower === 'attempted contact' ||
 lower === 'attempted'
 ) return 'Followed Up';
 
 // Meeting scheduled / scheduled detection
 if (
 !lower.includes('cancel') &&
 !lower.includes('lost') &&
 !lower.includes('duplicate') &&
 !lower.includes('bad') &&
 (
 lower === 'meeting scheduled' ||
 lower === 'scheduled' ||
 lower === 'meeting' ||
 lower === 'appointment' ||
 lower === 'appt' ||
 lower === 'confirmed' ||
 lower === 'booked' ||
 lower.includes('meeting') ||
 lower.includes('schedul') ||
 lower.includes('appointment') ||
 lower.includes('appt') ||
 lower.includes('booked') ||
 lower.includes('booking') ||
 lower.includes('site visit') ||
 lower.includes('consultation') ||
 lower.includes('estimate sched')
 )
 ) return 'Meeting Scheduled';

 if (lower === 'won' || lower === 'won job' || lower === 'closed won' || lower === 'sold' || lower === 'hired' || lower === 'closed - won') return 'Won Job';
 if (lower === 'lost' || lower === 'lost job' || lower === 'closed lost' || lower === 'closed - lost' || lower === 'archived' || lower === 'cancelled' || lower === 'canceled') return 'Lost Job';
 if (lower.includes('refund') && !lower.includes('non')) return 'Lost Job (For Refund)';
 if (lower.includes('nonrefundable') || lower.includes('non-refundable') || (lower.includes('lost') && lower.includes('non'))) return 'Lost Job (Nonrefundable)';
 if (lower === 'estimating' || lower === 'in estimate' || lower === 'estimate in progress' || lower === 'drafting estimate') return 'Estimating';
 if (lower === 'estimate sent' || lower === 'quote sent' || lower === 'proposal sent' || lower === 'estimate given') return 'Estimate Sent';
 if (lower.includes('3 day') && lower.includes('follow')) return '3 day Follow UP';
 if (lower.includes('7 day') && lower.includes('follow')) return '7 day Follow UP';
 if (lower.includes('15 day') && lower.includes('follow')) return '15 day Follow UP';
 if (lower.includes('30 day') && lower.includes('follow')) return '30 day Follow UP';
 if (lower.includes('90') && lower.includes('follow')) return 'Past 90 days Follow UP';
 if (lower === 'bad lead / duplicate' || lower === 'duplicate' || lower === 'bad lead' || lower === 'spam') return 'Bad Lead / Duplicate';

 // Capitalize words nicely if custom
 return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// In-memory cache structures to avoid exceeding Google API quota (60 requests/minute)
const detailsCache = new Map<string, { data: SpreadsheetDetails; expiresAt: number }>();
const detailsInFlight = new Map<string, Promise<SpreadsheetDetails>>();

const rowsCache = new Map<string, { data: { headers: string[]; rows: SheetRowRecord[]; statusColIndex: number }; expiresAt: number }>();
const rowsInFlight = new Map<string, Promise<{ headers: string[]; rows: SheetRowRecord[]; statusColIndex: number }>>();

const batchCache = new Map<string, { data: { headers: string[]; rows: SheetRowRecord[] }; expiresAt: number }>();
const batchInFlight = new Map<string, Promise<{ headers: string[]; rows: SheetRowRecord[] }>>();

export function invalidateSpreadsheetCache(spreadsheetId?: string) {
 if (!spreadsheetId) {
 detailsCache.clear();
 rowsCache.clear();
 batchCache.clear();
 try {
 for (let i = localStorage.length - 1; i >= 0; i--) {
 const key = localStorage.key(i);
 if (key && key.startsWith('mrcontract_cache_')) {
 localStorage.removeItem(key);
 }
 }
 } catch (e) {}
 return;
 }
 const cleanId = extractSpreadsheetId(spreadsheetId);
 detailsCache.delete(cleanId);
 for (const key of Array.from(rowsCache.keys())) {
 if (key.startsWith(`${cleanId}_`) || key.includes(cleanId)) rowsCache.delete(key);
 }
 for (const key of Array.from(batchCache.keys())) {
 if (key.startsWith(`${cleanId}_`) || key.includes(cleanId)) batchCache.delete(key);
 }
 try {
 for (let i = localStorage.length - 1; i >= 0; i--) {
 const key = localStorage.key(i);
 if (key && (key.startsWith(`mrcontract_cache_${cleanId}`) || key.includes(cleanId))) {
 localStorage.removeItem(key);
 }
 }
 } catch (e) {}
}

export function invalidateInMemoryCache(spreadsheetId: string) {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 if (!cleanId) return;
 detailsCache.delete(cleanId);
 for (const key of Array.from(rowsCache.keys())) {
 if (key.startsWith(`${cleanId}_`) || key.includes(cleanId)) rowsCache.delete(key);
 }
 for (const key of Array.from(batchCache.keys())) {
 if (key.startsWith(`${cleanId}_`) || key.includes(cleanId)) batchCache.delete(key);
 }
}

// Global shared status overrides cache across team users
let memorySharedOverrides: Record<string, { status: string; timestamp?: number; updatedBy?: string }> = {};

export async function fetchSharedStatusOverrides(): Promise<Record<string, any>> {
 try {
 const res = await fetch('/api/status-overrides');
 if (res.ok) {
 const data = await res.json();
 if (data && data.overrides) {
 memorySharedOverrides = { ...memorySharedOverrides, ...data.overrides };
 if (typeof window !== 'undefined') {
 localStorage.setItem('mrcontract_status_overrides', JSON.stringify(memorySharedOverrides));
 window.dispatchEvent(new CustomEvent('status_overrides_updated'));
 }
 return memorySharedOverrides;
 }
 }
 } catch (e) {
 console.warn('Could not fetch remote status overrides:', e);
 }
 return memorySharedOverrides;
}

if (typeof window !== 'undefined') {
 try {
 const raw = localStorage.getItem('mrcontract_status_overrides');
 if (raw) memorySharedOverrides = JSON.parse(raw);
 } catch {}
 fetchSharedStatusOverrides();
}

export function saveStatusOverride(
 sheetTab: string,
 rowIndex: number,
 newStatus: string,
 clientName?: string,
 updatedBy?: string
) {
 try {
 const key1 = `${sheetTab}_${rowIndex}`;
 const payload = { status: newStatus, timestamp: Date.now(), updatedBy: updatedBy || '' };
 memorySharedOverrides[key1] = payload;
 if (clientName && clientName !== 'Unnamed Client') {
 const nameKey = `name_${clientName.toLowerCase().trim()}`;
 memorySharedOverrides[nameKey] = payload;
 }
 const storageKey = `mrcontract_status_overrides`;
 localStorage.setItem(storageKey, JSON.stringify(memorySharedOverrides));

 // Send to shared team backend so User 2 and other computers receive the update immediately
 fetch('/api/status-overrides', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 sheetTab,
 rowIndex,
 clientName,
 newStatus,
 updatedBy
 })
 }).catch(err => console.warn('Failed to sync status override to server:', err));
 } catch (e) {}
}

export function getStatusOverride(
 sheetTab: string,
 rowIndex: number,
 clientName?: string
): string | null {
 try {
 const key1 = `${sheetTab}_${rowIndex}`;
 if (memorySharedOverrides[key1] && memorySharedOverrides[key1].status) {
 return memorySharedOverrides[key1].status;
 }
 if (clientName && clientName !== 'Unnamed Client') {
 const nameKey = `name_${clientName.toLowerCase().trim()}`;
 if (memorySharedOverrides[nameKey] && memorySharedOverrides[nameKey].status) {
 return memorySharedOverrides[nameKey].status;
 }
 }

 const storageKey = `mrcontract_status_overrides`;
 const raw = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
 if (!raw) return null;
 const overrides = JSON.parse(raw);
 if (overrides[key1] && overrides[key1].status) {
 return overrides[key1].status;
 }
 if (clientName && clientName !== 'Unnamed Client') {
 const nameKey = `name_${clientName.toLowerCase().trim()}`;
 if (overrides[nameKey] && overrides[nameKey].status) {
 return overrides[nameKey].status;
 }
 }
 } catch (e) {}
 return null;
}


export function getStatusOverrideTimestamp(
 sheetTab: string,
 rowIndex: number,
 clientName?: string
): number | null {
 try {
  const rowKey = `${sheetTab}_${rowIndex}`;
  const nameKey = clientName && clientName !== 'Unnamed Client'
   ? `name_${clientName.toLowerCase().trim()}`
   : '';
  const entry = memorySharedOverrides[rowKey] || (nameKey ? memorySharedOverrides[nameKey] : null);
  const timestamp = Number(entry?.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;

  const raw = typeof window !== 'undefined' ? localStorage.getItem('mrcontract_status_overrides') : null;
  if (!raw) return null;
  const overrides = JSON.parse(raw);
  const saved = overrides[rowKey] || (nameKey ? overrides[nameKey] : null);
  const savedTimestamp = Number(saved?.timestamp);
  return Number.isFinite(savedTimestamp) && savedTimestamp > 0 ? savedTimestamp : null;
 } catch {
  return null;
 }
}
export function updateStatusInLocalStorageCache(
 spreadsheetId: string,
 sheetTab: string,
 rowIndex: number,
 newStatus: string,
 clientName?: string,
 updatedBy?: string
) {
 try {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 if (!cleanId) return;

 // Detect user from session if not provided
 let byUser = updatedBy;
 if (!byUser && typeof window !== 'undefined') {
 try {
 const u = localStorage.getItem('mrcontract_active_user');
 if (u) byUser = JSON.parse(u)?.name;
 } catch {}
 }

 // Record persistent status override
 saveStatusOverride(sheetTab, rowIndex, newStatus, clientName, byUser);
 const scheduledAt = /^(?:meeting|appointment)\s+scheduled$/i.test(newStatus.trim()) || /^scheduled$/i.test(newStatus.trim())
  ? new Date().toISOString()
  : undefined;

 // 1. Update the specific tab cache
 const tabCacheKey = `mrcontract_cache_${cleanId}_${sheetTab}`;
 const tabCached = localStorage.getItem(tabCacheKey);
 if (tabCached) {
 const parsed = JSON.parse(tabCached);
 if (parsed && Array.isArray(parsed.rows)) {
 parsed.rows = parsed.rows.map((r: any) =>
 r.rowIndex === rowIndex ? { ...r, status: newStatus, ...(scheduledAt ? { scheduledAt } : {}) } : r
 );
 localStorage.setItem(tabCacheKey, JSON.stringify(parsed));
 }
 }

 // 2. Update the ALL tab cache
 const allCacheKey = `mrcontract_cache_${cleanId}_ALL`;
 const allCached = localStorage.getItem(allCacheKey);
 if (allCached) {
 const parsed = JSON.parse(allCached);
 if (parsed && Array.isArray(parsed.rows)) {
 parsed.rows = parsed.rows.map((r: any) =>
 r.rowIndex === rowIndex && (!r.tabName || r.tabName === sheetTab)
 ? { ...r, status: newStatus, ...(scheduledAt ? { scheduledAt } : {}) }
 : r
 );
 localStorage.setItem(allCacheKey, JSON.stringify(parsed));
 }
 }
 } catch (e) {
 console.warn('Error updating status in local storage cache:', e);
 }
}

/**
 * Get details (title, list of tabs) for a specific spreadsheet.
 */
export async function getSpreadsheetDetails(
 accessToken?: string,
 spreadsheetId?: string,
 forceFresh = false
): Promise<SpreadsheetDetails> {
 const cleanId = extractSpreadsheetId(spreadsheetId || '1arAGlZO9VyY1St_ywT9ZtEaKyLaFfr3RIzw0-ebhJX0');
 const now = Date.now();

 if (!forceFresh) {
 const cached = detailsCache.get(cleanId);
 if (cached && cached.expiresAt > now) {
 return cached.data;
 }
 if (detailsInFlight.has(cleanId)) {
 return detailsInFlight.get(cleanId)!;
 }
 }

 const fetchPromise = (async () => {
 const res = await fetch(`/api/sheets/details?spreadsheetId=${encodeURIComponent(cleanId)}&forceFresh=${forceFresh}`);
 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 const error: any = new Error(err.error || `Failed to retrieve spreadsheet (${res.status})`);
 error.code = err.errorCode;
 error.status = res.status;
 throw error;
 }

 const data = await res.json();
 const sheets: SheetTabInfo[] = (data.sheets || []).map((s: any) => ({
 sheetId: s.sheetId ?? s.properties?.sheetId ?? 0,
 title: s.title ?? s.properties?.title ?? 'Sheet1',
 index: s.index ?? s.properties?.index ?? 0,
 }));

 const result: SpreadsheetDetails = {
 id: data.id || data.spreadsheetId || cleanId,
 title: data.title || data.properties?.title || 'Untitled Spreadsheet',
 sheets,
 url: data.url || `https://docs.google.com/spreadsheets/d/${cleanId}/edit`,
 };

 // Cache for 3 minutes
 detailsCache.set(cleanId, { data: result, expiresAt: Date.now() + 180000 });
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
 * Create a brand new Google Sheet with default columns for appointments.
 */
export async function createSpreadsheetWithHeaders(
 accessToken: string,
 title: string = 'Mr Contract Appointments'
): Promise<SpreadsheetDetails> {
 const url = 'https://sheets.googleapis.com/v4/spreadsheets';

 const body = {
 properties: {
 title,
 },
 sheets: [
 {
 properties: {
 title: 'Appointments',
 gridProperties: {
 frozenRowCount: 4,
 },
 },
 data: [
 {
 startRow: 3,
 startColumn: 0,
 rowData: [
 {
 values: DEFAULT_SHEET_HEADERS.map((h) => ({
 userEnteredValue: { stringValue: h },
 userEnteredFormat: {
 textFormat: { bold: true },
 backgroundColor: { red: 0.9, green: 0.92, blue: 0.96 },
 },
 })),
 },
 ],
 },
 ],
 },
 ],
 };

 const response = await fetch(url, {
 method: 'POST',
 headers: {
 Authorization: `Bearer ${accessToken}`,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(body),
 });

 if (!response.ok) {
 const err = await response.json().catch(() => ({}));
 throw new Error(err.error?.message || `Failed to create spreadsheet (${response.status})`);
 }

 const data = await response.json();
 return {
 id: data.spreadsheetId,
 title: data.properties?.title || title,
 sheets: [
 {
 sheetId: data.sheets?.[0]?.properties?.sheetId || 0,
 title: data.sheets?.[0]?.properties?.title || 'Appointments',
 index: 0,
 },
 ],
 url: `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
 };
}

/**
 * Helper to safely format sheet range with quotes for tabs with spaces
 */
export function formatSheetRange(sheetTab: string, cellOrRange: string): string {
 const cleanTab = (sheetTab || 'Angi').trim().replace(/'/g,"''");
 return `'${cleanTab}'!${cellOrRange}`;
}

/**
 * Parse 2D raw string matrix from a Google Sheet tab into typed SheetRowRecords.
 */
export function parseSheetValuesToRecords(
 rawValues: string[][],
 sheetTab: string = 'Angi'
): { headers: string[]; rows: SheetRowRecord[]; statusColIndex: number } {
 if (!rawValues || rawValues.length === 0) {
 return { headers: DEFAULT_SHEET_HEADERS, rows: [], statusColIndex: 1 };
 }

 // 1. Locate the actual header row (check rows 0..4)
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
 const resolvedStatusColIndex = mapping.statusCol;

 const rows: SheetRowRecord[] = [];
 const startRow = hasDetectedHeader ? headerRowIndex + 1 : 0;

 for (let i = startRow; i < rawValues.length; i++) {
 const row = rawValues[i];
 if (!row || row.length === 0 || row.every((c) => !c || c.trim() === '')) {
 continue;
 }

 // Skip if row is an accidental duplicate header row
 if (isHeaderRowValues(row)) {
 continue;
 }

 const getVal = (idx: number) => (idx >= 0 && idx < row.length ? (row[idx] || '').trim() : '');

 let clientName = getVal(mapping.nameCol);
 let rawStatus = getVal(mapping.statusCol);

 // If status is empty at detected statusCol, look for recognized status values in other non-name cells
 if (!rawStatus) {
 const candidateCols = [1, 7, 5, 6, 8, 9];
 for (const col of candidateCols) {
 if (col !== mapping.nameCol && col !== mapping.phoneCol && col !== mapping.emailCol && col !== mapping.addrCol) {
 const val = getVal(col);
 if (val) {
 const vLower = val.toLowerCase();
 if (
 vLower === 'new' ||
 vLower.includes('won') ||
 vLower.includes('lost') ||
 vLower.includes('follow') ||
 vLower.includes('sched') ||
 vLower.includes('estimate') ||
 vLower.includes('duplicate') ||
 vLower === 'archived' ||
 vLower === 'cancelled'
 ) {
 rawStatus = val;
 break;
 }
 }
 }
 }
 }

 let status = normalizeStatusValue(rawStatus);
 let leadSource = getVal(mapping.sourceCol);
 let leadType = getVal(mapping.typeCol);

 // If leadSource from sheet is an urgency/temperature rating like Hot, Warm, Cold, clear it so it resolves to sheetTab
 if (leadSource) {
 const lowSrc = leadSource.toLowerCase().trim();
 const nonSources = ['hot', 'warm', 'cold', 'new', 'estimate', 'estimate sent', 'urgent', 'high', 'medium', 'low', 'active', 'pending', 'done', 'category', 'lead category', 'status', 'n/a', 'none'];
 if (nonSources.includes(lowSrc)) {
 leadSource = '';
 }
 }
 let address = getVal(mapping.addrCol);
 let timestamp = getVal(mapping.tsCol);
 let clientPhone = getVal(mapping.phoneCol);
 let clientEmail = getVal(mapping.emailCol);
 let appointmentDate = getVal(mapping.dateCol);
 let startTime = getVal(mapping.startCol);
 let endTime = getVal(mapping.endCol);

 // Scan raw values (EXCLUDING lead creation timestamp) for embedded appointment dates or times (e.g. 10:00 AM, 10:00-12:00, or 2026-09-03)
 const textCellsWithoutTs = row.filter((_, idx) => mapping.tsCol < 0 || idx !== mapping.tsCol);
 const allRowText = textCellsWithoutTs.join(' ');
 if (!appointmentDate) {
 const mDateIso = allRowText.match(/\b(202\d)-(0?[1-9]|1[0-2])-(0?[1-9]|[12][0-9]|3[01])\b/);
 if (mDateIso) {
 appointmentDate = mDateIso[0];
 } else {
 const mDateSlash = allRowText.match(/\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12][0-9]|3[01])(?:[\/\-](202\d|\d{2}))?\b/);
 if (mDateSlash) {
 const m = String(parseInt(mDateSlash[1], 10)).padStart(2, '0');
 const d = String(parseInt(mDateSlash[2], 10)).padStart(2, '0');
 const y = mDateSlash[3] ? (mDateSlash[3].length === 2 ? `20${mDateSlash[3]}` : mDateSlash[3]) : String(new Date().getFullYear());
 appointmentDate = `${y}-${m}-${d}`;
 }
 }
 }

 if (!startTime) {
 const mTime = allRowText.match(/\b([0-1]?[0-9]|2[0-3])(?::([0-5][0-9]))?\s*(am|pm)\b/i);
 if (mTime) {
 let h = parseInt(mTime[1], 10);
 const mins = mTime[2] || '00';
 const ampm = mTime[3].toLowerCase();
 if (ampm === 'pm' && h < 12) h += 12;
 if (ampm === 'am' && h === 12) h = 0;
 startTime = `${String(h).padStart(2, '0')}:${mins}`;
 if (!endTime) {
 endTime = `${String((h + 1) % 24).padStart(2, '0')}:${mins}`;
 }
 }
 }
 let salespersonCode = getVal(mapping.spCol);
 let notes = getVal(mapping.notesCol);
 let carrier = getVal(mapping.carrierCol);

 // Helper: detect date or time formats
 const isDateOrTimeFormat = (str: string) =>
 /^\d{4}-\d{2}-\d{2}(\s|T)\d{2}:\d{2}/.test((str || '').trim()) ||
 /^\d{1,2}\/\d{1,2}\/\d{4}/.test((str || '').trim());

 // 1. Check for known or detected client name in any cell of the row
 let foundClientNameIndex = -1;
 for (let c = 0; c < row.length; c++) {
 const cellVal = (row[c] || '').trim();
 if (isKnownClientName(cellVal)) {
 foundClientNameIndex = c;
 break;
 }
 }

 if (foundClientNameIndex === -1) {
 for (let c = 0; c < row.length; c++) {
 const cellVal = (row[c] || '').trim();
 if (c !== mapping.addrCol && c !== mapping.notesCol && c !== mapping.emailCol && looksLikeClientName(cellVal)) {
 foundClientNameIndex = c;
 break;
 }
 }
 }

 // If a client name was discovered in another column
 if (foundClientNameIndex !== -1 && foundClientNameIndex !== mapping.nameCol) {
 const foundName = row[foundClientNameIndex].trim();
 const currentNameVal = clientName;

 if (!looksLikeClientName(currentNameVal) || isKnownClientName(foundName)) {
 clientName = foundName;
 if (foundClientNameIndex === mapping.statusCol) {
 status = normalizeStatusValue(currentNameVal);
 }
 if (!leadType && currentNameVal && !isDateOrTimeFormat(currentNameVal)) {
 leadType = currentNameVal;
 }
 }
 }

 // Safeguard 1: If clientName is empty or contains service/date but another cell has the person's name
 if (isDateOrTimeFormat(clientName) && !isDateOrTimeFormat(timestamp)) {
 const temp = timestamp;
 timestamp = clientName;
 clientName = temp || '';
 }

 // Safeguard 2: Clean and unquote client name
 clientName = (clientName || '').replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').replace(/^["]+|["]+$/g, '').trim();

 // Clean status
 if (!status || status.trim() === '' || isKnownClientName(status) || looksLikeClientName(status)) {
 status = 'New';
 }

 // Check if there is an active local status override for this row
 const localOverride = getStatusOverride(sheetTab, i + 1, clientName);
 if (localOverride) {
 status = localOverride;
 }

 if (!clientName && !clientPhone && !clientEmail && !address) {
 continue; // Skip ghost rows where the lead info was deleted but date/status remain
 }

 rows.push({
 rowIndex: i + 1, // 1-based row number in Google Sheets
 tabName: sheetTab,
 statusColIndex: resolvedStatusColIndex,
 clientName: clientName || 'Unnamed Client',
 status: status || 'New',
 leadSource: leadSource || sheetTab,
 leadType,
 address,
 timestamp,
 clientPhone,
 clientEmail,
 appointmentDate,
 startTime,
 endTime,
 salespersonCode,
 notes,
 rawValues: row,
 carrier,
 });
 }

 return { headers: headerRow, rows, statusColIndex: resolvedStatusColIndex };
}

/**
 * Read rows from a single spreadsheet tab with cache & deduplication.
 */
export async function readSpreadsheetRows(
 accessToken?: string,
 spreadsheetId?: string,
 sheetTab: string = 'Angi',
 forceFresh = false
): Promise<{ headers: string[]; rows: SheetRowRecord[]; statusColIndex: number }> {
 const cleanId = extractSpreadsheetId(spreadsheetId || '1arAGlZO9VyY1St_ywT9ZtEaKyLaFfr3RIzw0-ebhJX0');
 const cacheKey = `${cleanId}_${sheetTab}`;
 const now = Date.now();

 if (forceFresh) {
 rowsCache.delete(cacheKey);
 rowsInFlight.delete(cacheKey);
 } else {
 const cached = rowsCache.get(cacheKey);
 if (cached && cached.expiresAt > now) {
 return cached.data;
 }
 if (rowsInFlight.has(cacheKey)) {
 return rowsInFlight.get(cacheKey)!;
 }
 }

 const fetchPromise = (async () => {
 const res = await fetch(
 `/api/sheets/rows?spreadsheetId=${encodeURIComponent(cleanId)}&tab=${encodeURIComponent(sheetTab)}&forceFresh=${forceFresh}`
 );

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 const error: any = new Error(err.error || `Failed to read spreadsheet rows (${res.status})`);
 error.code = err.errorCode;
 error.status = res.status;
 throw error;
 }

 const result = await res.json();
 if (result.rows && Array.isArray(result.rows)) {
 result.rows = result.rows.map((r: any) => {
 const localOverride = getStatusOverride(sheetTab, r.rowIndex, r.clientName);
 return localOverride ? { ...r, status: localOverride } : r;
 });
 }

 // Cache for 15 seconds
 rowsCache.set(cacheKey, { data: result, expiresAt: Date.now() + 15000 });
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
 * Read and combine rows from multiple spreadsheet tabs in a SINGLE batch request.
 */
export async function readAllSpreadsheetTabs(
 accessToken?: string,
 spreadsheetId?: string,
 sheetTabs: string[] = ['Angi'],
 forceFresh = false
): Promise<{ headers: string[]; rows: SheetRowRecord[] }> {
 const cleanId = extractSpreadsheetId(spreadsheetId || '1arAGlZO9VyY1St_ywT9ZtEaKyLaFfr3RIzw0-ebhJX0');
 if (!sheetTabs || sheetTabs.length === 0) {
 return { headers: DEFAULT_SHEET_HEADERS, rows: [] };
 }

 const sortedTabsKey = [...sheetTabs].sort().join(',');
 const cacheKey = `${cleanId}_BATCH_${sortedTabsKey}`;
 const now = Date.now();

 if (forceFresh) {
 batchCache.delete(cacheKey);
 batchInFlight.delete(cacheKey);
 } else {
 const cached = batchCache.get(cacheKey);
 if (cached && cached.expiresAt > now) {
 return cached.data;
 }
 if (batchInFlight.has(cacheKey)) {
 return batchInFlight.get(cacheKey)!;
 }
 }

 const fetchPromise = (async () => {
 const res = await fetch('/api/sheets/batch-rows', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 spreadsheetId: cleanId,
 tabs: sheetTabs,
 forceFresh,
 }),
 });

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 const error: any = new Error(err.error || `Batch read failed (${res.status})`);
 error.code = err.errorCode;
 error.status = res.status;
 throw error;
 }

 const result = await res.json();
 if (result.rows && Array.isArray(result.rows)) {
 result.rows = result.rows.map((r: any) => {
 const localOverride = getStatusOverride(r.tabName || '', r.rowIndex, r.clientName);
 return localOverride ? { ...r, status: localOverride } : r;
 });
 }

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
 * Overwrite Row 1 in Google Sheets with the standard DEFAULT_SHEET_HEADERS
 * (Client Name | Status | Lead Category | Service Needed | Address | Date Lead Generated | Phone | Email | Appt Date | Start Time | End Time | Salesperson | Notes)
 */
export async function formatSheetWithStandardHeaders(
 accessToken: string,
 spreadsheetId: string,
 sheetTab: string = 'Angi'
): Promise<void> {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 const range = encodeURIComponent(formatSheetRange(sheetTab, 'A1:M1'));
 const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${range}?valueInputOption=USER_ENTERED`;

 const res = await fetch(url, {
 method: 'PUT',
 headers: {
 Authorization: `Bearer ${accessToken}`,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 values: [DEFAULT_SHEET_HEADERS],
 }),
 });

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err.error?.message || `Failed to update sheet headers (${res.status})`);
 }
}

/**
 * Update a specific cell in the Google Sheet (e.g. Status for a row)
 */
export async function updateCellInSheet(
 accessToken: string | undefined,
 spreadsheetId: string,
 sheetTab: string,
 rowIndex: number, // 1-based row index (Row 2, 3, etc.)
 columnIndex: number, // 0-based column index (0 = A, 1 = B, etc.)
 value: string
): Promise<void> {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 const res = await fetch('/api/sheets/update-cell', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 spreadsheetId: cleanId,
 sheetTab,
 rowIndex,
 columnIndex,
 value,
 }),
 });

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 const error: any = new Error(err.error || `Failed to update cell in Google Sheet (${res.status})`);
 error.code = err.errorCode;
 throw error;
 }
}

/**
 * Update the Status of a lead in the Google Sheet
 */
export async function updateRowStatusInSheet(
 accessToken: string | undefined,
 spreadsheetId: string,
 sheetTab: string,
 rowIndex: number,
 newStatus: string,
 statusColIndex?: number,
 clientName?: string,
 clientPhone?: string
): Promise<void> {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 const colIdx = typeof statusColIndex === 'number' && statusColIndex >= 0 ? statusColIndex : 7;

 const res = await fetch('/api/sheets/update-status', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 spreadsheetId: cleanId,
 sheetTab: sheetTab || 'Angi',
 rowIndex,
 newStatus,
 statusColIndex: colIdx,
 clientName,
 clientPhone,
 }),
 });

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 const error: any = new Error(err.error || `Failed to update status in Google Sheet (${res.status})`);
 error.code = err.errorCode;
 throw error;
 }

 // Invalidate in-memory caches and update local storage cache immediately
 invalidateInMemoryCache(spreadsheetId);
 updateStatusInLocalStorageCache(spreadsheetId, sheetTab || 'Angi', rowIndex, newStatus, clientName);
}

export function updateLeadInLocalStorageCache(
 spreadsheetId: string,
 sheetTab: string,
 rowIndex: number,
 updatedFields: Partial<SheetRowRecord>
) {
 try {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 if (!cleanId) return;

 // If status changed, record persistent override
 if (updatedFields.status) {
 saveStatusOverride(sheetTab, rowIndex, updatedFields.status, updatedFields.clientName);
 }

 // 1. Update the specific tab cache
 const tabCacheKey = `mrcontract_cache_${cleanId}_${sheetTab}`;
 const tabCached = localStorage.getItem(tabCacheKey);
 if (tabCached) {
 const parsed = JSON.parse(tabCached);
 if (parsed && Array.isArray(parsed.rows)) {
 parsed.rows = parsed.rows.map((r: any) =>
 r.rowIndex === rowIndex ? { ...r, ...updatedFields } : r
 );
 localStorage.setItem(tabCacheKey, JSON.stringify(parsed));
 }
 }

 // 2. Update the ALL tab cache
 const allCacheKey = `mrcontract_cache_${cleanId}_ALL`;
 const allCached = localStorage.getItem(allCacheKey);
 if (allCached) {
 const parsed = JSON.parse(allCached);
 if (parsed && Array.isArray(parsed.rows)) {
 parsed.rows = parsed.rows.map((r: any) =>
 r.rowIndex === rowIndex && (!r.tabName || r.tabName === sheetTab)
 ? { ...r, ...updatedFields }
 : r
 );
 localStorage.setItem(allCacheKey, JSON.stringify(parsed));
 }
 }
 } catch (e) {
 console.warn('Error updating lead in local storage cache:', e);
 }
}

/**
 * Update client information across Google Sheets and local caches.
 */
export async function updateLeadInSpreadsheet(
 accessToken: string | undefined,
 spreadsheetId: string,
 lead: {
 tabName?: string;
 rowIndex?: number;
 clientName?: string;
 clientPhone?: string;
 clientEmail?: string;
 address?: string;
 serviceNeeded?: string;
 leadFee?: string;
 status?: string;
 carrier?: string;
 notes?: string;
 }
): Promise<boolean> {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 if (!cleanId) return false;

 const targetTab = lead.tabName && lead.tabName !== 'ALL' ? lead.tabName : 'Angi';

 // Case 1: If tabName and rowIndex are known and valid
 if (lead.tabName && lead.tabName !== 'ALL' && lead.rowIndex && lead.rowIndex > 1) {
 const res = await fetch('/api/sheets/update-lead', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 spreadsheetId: cleanId,
 sheetTab: targetTab,
 rowIndex: lead.rowIndex,
 leadData: {
 clientName: lead.clientName,
 clientPhone: lead.clientPhone,
 clientEmail: lead.clientEmail,
 address: lead.address,
 serviceNeeded: lead.serviceNeeded,
 leadFee: lead.leadFee,
 status: lead.status,
 carrier: lead.carrier,
 notes: lead.notes,
 },
 }),
 });

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err.error || `Failed to update lead in Google Sheet (${res.status})`);
 }

 invalidateInMemoryCache(cleanId);
 updateLeadInLocalStorageCache(cleanId, targetTab, lead.rowIndex, {
 clientName: lead.clientName,
 clientPhone: lead.clientPhone,
 clientEmail: lead.clientEmail,
 address: lead.address,
 serviceNeeded: lead.serviceNeeded,
 leadType: lead.serviceNeeded,
 leadFee: lead.leadFee,
 status: lead.status,
 carrier: lead.carrier,
 notes: lead.notes,
 });
 return true;
 }

 // Case 2: Locate lead across tabs by clientName, clientPhone, or clientEmail
 const normName = (lead.clientName || '').trim().toLowerCase();
 const normPhone = (lead.clientPhone || '').replace(/\D/g, '');
 const normEmail = (lead.clientEmail || '').trim().toLowerCase();

 if (!normName && !normPhone && !normEmail) {
 return false;
 }

 try {
 const details = await getSpreadsheetDetails(accessToken, cleanId);
 const validTabs = details.sheets
 .map((s) => s.title)
 .filter((t) => !t.toLowerCase().includes('summary') && !t.toLowerCase().includes('zapier'));

 for (const tab of validTabs) {
 if (lead.tabName && lead.tabName !== 'ALL' && tab !== lead.tabName) {
 continue;
 }

 const res = await readSpreadsheetRows(accessToken, cleanId, tab, true);
 const match = res.rows.find((r) => {
 if (normName && (r.clientName || '').trim().toLowerCase() === normName) return true;
 if (normPhone && (r.clientPhone || '').replace(/\D/g, '') === normPhone && normPhone.length >= 7) return true;
 if (normEmail && (r.clientEmail || '').trim().toLowerCase() === normEmail) return true;
 return false;
 });

 if (match) {
 await fetch('/api/sheets/update-lead', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 spreadsheetId: cleanId,
 sheetTab: tab,
 rowIndex: match.rowIndex,
 leadData: {
 clientName: lead.clientName || match.clientName,
 clientPhone: lead.clientPhone || match.clientPhone,
 clientEmail: lead.clientEmail || match.clientEmail,
 address: lead.address || match.address,
 serviceNeeded: lead.serviceNeeded || match.serviceNeeded || match.leadType,
 leadFee: lead.leadFee || match.leadFee,
 status: lead.status || match.status,
 carrier: lead.carrier || match.carrier,
 notes: lead.notes || match.notes,
 },
 }),
 });

 invalidateInMemoryCache(cleanId);
 updateLeadInLocalStorageCache(cleanId, tab, match.rowIndex, {
 clientName: lead.clientName || match.clientName,
 clientPhone: lead.clientPhone || match.clientPhone,
 clientEmail: lead.clientEmail || match.clientEmail,
 address: lead.address || match.address,
 serviceNeeded: lead.serviceNeeded || match.serviceNeeded || match.leadType,
 leadType: lead.serviceNeeded || match.serviceNeeded || match.leadType,
 leadFee: lead.leadFee || match.leadFee,
 status: lead.status || match.status,
 carrier: lead.carrier || match.carrier,
 notes: lead.notes || match.notes,
 });
 return true;
 }
 }
 } catch (err) {
 console.error('Error finding and updating lead in sheet:', err);
 throw err;
 }

 return false;
}

/**
 * Universally search and update a lead's status across Google Sheet tabs
 */
export async function updateLeadStatusInSpreadsheet(
 accessToken: string | undefined,
 spreadsheetId: string,
 lead: {
 tabName?: string;
 rowIndex?: number;
 clientName?: string;
 clientPhone?: string;
 clientEmail?: string;
 statusColIndex?: number;
 },
 newStatus: string
): Promise<boolean> {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 if (!cleanId) return false;

 // Case 1: If tabName and rowIndex are known and valid
 if (lead.tabName && lead.tabName !== 'ALL' && lead.rowIndex && lead.rowIndex > 1) {
 await updateRowStatusInSheet(
 accessToken,
 cleanId,
 lead.tabName,
 lead.rowIndex,
 newStatus,
 lead.statusColIndex,
 lead.clientName
 );
 return true;
 }

 // Case 2: Locate lead across tabs by clientName, clientPhone, or clientEmail
 const normName = (lead.clientName || '').trim().toLowerCase();
 const normPhone = (lead.clientPhone || '').replace(/\D/g, '');
 const normEmail = (lead.clientEmail || '').trim().toLowerCase();

 if (!normName && !normPhone && !normEmail) {
 return false;
 }

 try {
 const details = await getSpreadsheetDetails(accessToken, cleanId);
 const validTabs = details.sheets
 .map((s) => s.title)
 .filter((t) => !t.toLowerCase().includes('summary') && !t.toLowerCase().includes('zapier'));

 for (const tab of validTabs) {
 if (lead.tabName && lead.tabName !== 'ALL' && tab !== lead.tabName) {
 continue;
 }

 const res = await readSpreadsheetRows(accessToken, cleanId, tab, true);
 const match = res.rows.find((r) => {
 if (normName && (r.clientName || '').trim().toLowerCase() === normName) return true;
 if (normPhone && (r.clientPhone || '').replace(/\D/g, '') === normPhone && normPhone.length >= 7) return true;
 if (normEmail && (r.clientEmail || '').trim().toLowerCase() === normEmail) return true;
 return false;
 });

 if (match) {
 const colIdx = match.statusColIndex !== undefined ? match.statusColIndex : res.statusColIndex;
 await updateRowStatusInSheet(
 accessToken,
 cleanId,
 tab,
 match.rowIndex,
 newStatus,
 colIdx,
 match.clientName
 );
 return true;
 }
 }
 } catch (err) {
 console.error('Error finding and updating lead status in sheet:', err);
 throw err;
 }

 return false;
}

/**
 * Create a new tab in the spreadsheet if it does not already exist.
 */
export async function createSheetTabIfNotExists(
 accessToken: string | undefined,
 spreadsheetId: string,
 tabTitle: string
): Promise<void> {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 await fetch('/api/sheets/create-tab', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ spreadsheetId: cleanId, tabTitle }),
 }).catch(() => {});
}

/**
 * Append an appointment row to the configured Google Sheet via Service Account.
 */
export async function appendAppointmentToSheet(
 accessToken: string | undefined,
 spreadsheetId: string,
 sheetTab: string = 'Angi',
 formData: AppointmentFormData,
 status: string = 'New'
): Promise<{ updatedRange: string; updatedRows: number }> {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 const targetTab = formData.sourceTabName?.trim() || formData.leadSource?.trim() || sheetTab || 'Angi';

 const res = await fetch('/api/sheets/append-lead', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 spreadsheetId: cleanId,
 sheetTab: targetTab,
 leadData: formData,
 status,
 }),
 });

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 const error: any = new Error(err.error || `Failed to add lead row to spreadsheet (${res.status})`);
 error.code = err.errorCode;
 throw error;
 }

 invalidateInMemoryCache(spreadsheetId);
 const data = await res.json();
 return {
 updatedRange: data.updatedRange || `${targetTab}!A5`,
 updatedRows: data.updatedRows || 1,
 };
}

/**
 * Ensure header row exists on a sheet tab at Row 4.
 */
export async function ensureSheetHeaders(
 accessToken: string | undefined,
 spreadsheetId: string,
 sheetTab: string = 'Angi'
): Promise<void> {
 // Handled automatically by backend service
}

/**
 * Delete a specific row from a Google Sheet tab by its 1-based rowIndex
 */
export async function deleteRowFromSheet(
 accessToken: string | undefined,
 spreadsheetId: string,
 sheetTab: string,
 rowIndex: number,
 clientName?: string,
 clientPhone?: string
): Promise<void> {
 const cleanId = extractSpreadsheetId(spreadsheetId);
 const res = await fetch('/api/sheets/delete-row', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 spreadsheetId: cleanId,
 sheetTab,
 rowIndex,
 clientName,
 clientPhone,
 }),
 });

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 const error: any = new Error(err.error || `Failed to delete row in Google Sheet (${res.status})`);
 error.code = err.errorCode;
 throw error;
 }

 // Invalidate memory cache
 rowsCache.delete(`${cleanId}_${sheetTab}`);
 batchCache.delete(cleanId);

 // Surgically update local storage cache
 try {
 const tabCacheKey = `mrcontract_cache_${cleanId}_${sheetTab}`;
 const tabCacheRaw = localStorage.getItem(tabCacheKey);
 if (tabCacheRaw) {
 const tabData = JSON.parse(tabCacheRaw);
 if (tabData && Array.isArray(tabData.rows)) {
 tabData.rows = tabData.rows
 .filter((r: any) => r.rowIndex !== rowIndex)
 .map((r: any) => (r.rowIndex > rowIndex ? { ...r, rowIndex: r.rowIndex - 1 } : r));
 localStorage.setItem(tabCacheKey, JSON.stringify(tabData));
 }
 }

 const allCacheKey = `mrcontract_cache_${cleanId}_ALL`;
 const allCacheRaw = localStorage.getItem(allCacheKey);
 if (allCacheRaw) {
 const allData = JSON.parse(allCacheRaw);
 if (allData && Array.isArray(allData.rows)) {
 allData.rows = allData.rows
 .filter((r: any) => !(r.tabName === sheetTab && r.rowIndex === rowIndex))
 .map((r: any) => (r.tabName === sheetTab && r.rowIndex > rowIndex ? { ...r, rowIndex: r.rowIndex - 1 } : r));
 localStorage.setItem(allCacheKey, JSON.stringify(allData));
 window.dispatchEvent(new CustomEvent('mrcontract_data_synced', { detail: allData.rows }));
 }
 }
 } catch (e) {
 console.warn('Error updating local cache after row deletion:', e);
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
 try {
 const res = await fetch('/api/sheets/status');
 if (res.ok) {
 return await res.json();
 }
 return { configured: false, error: `Status check failed (${res.status})` };
 } catch (e: any) {
 return { configured: false, error: e.message };
 }
}

/**
 * Save Service Account credentials to backend storage.
 */
export async function saveServiceAccountCredentials(credentialsJson: string): Promise<any> {
 const res = await fetch('/api/sheets/credentials', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ credentialsJson }),
 });
 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err.error || 'Failed to save credentials');
 }
 return await res.json();
}


