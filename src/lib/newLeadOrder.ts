export interface NewLeadSortable {
 newestOrder?: number;
 createdAt?: string;
 rowIndex?: number;
}

export function getLeadOrderValue(lead: NewLeadSortable): number {
 const explicitOrder = Number(lead.newestOrder || 0);
 if (Number.isFinite(explicitOrder) && explicitOrder > 0) return explicitOrder;

 const parsedTime = new Date(String(lead.createdAt || '')).getTime();
 return Number.isFinite(parsedTime) && parsedTime > 0 ? parsedTime : 0;
}

export function compareNewestLeads(a: NewLeadSortable, b: NewLeadSortable): number {
 const orderDifference = getLeadOrderValue(b) - getLeadOrderValue(a);
 if (orderDifference !== 0) return orderDifference;

 // Google Sheets appends new records to the bottom. Use row index only as a
 // final same-timestamp fallback; server-issued newestOrder remains primary.
 return Number(b.rowIndex || 0) - Number(a.rowIndex || 0);
}

function getDateKeyInTimeZone(date: Date, timeZone: string): string {
 const parts = new Intl.DateTimeFormat('en-US', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
 }).formatToParts(date);
 const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
 return `${values.year}-${values.month}-${values.day}`;
}

function dateKeyFromSheetTimestamp(rawTimestamp: string): string | null {
 const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawTimestamp);
 if (hasExplicitOffset) return null;

 const isoDate = rawTimestamp.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
 if (isoDate) {
  return `${isoDate[1]}-${isoDate[2].padStart(2, '0')}-${isoDate[3].padStart(2, '0')}`;
 }

 const usDate = rawTimestamp.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:$|[T,\s])/);
 if (!usDate) return null;

 const year = usDate[3].length === 2 ? `20${usDate[3]}` : usDate[3];
 return `${year}-${usDate[1].padStart(2, '0')}-${usDate[2].padStart(2, '0')}`;
}

export function wasLeadCreatedToday(
 lead: Pick<NewLeadSortable, 'createdAt' | 'newestOrder'>,
 timeZone = 'America/New_York',
 now = new Date()
): boolean {
 try {
  const safeTimeZone = timeZone || 'America/New_York';
  const todayKey = getDateKeyInTimeZone(now, safeTimeZone);
  const newestOrder = Number(lead.newestOrder || 0);

  // Server-issued creation order is the authoritative fallback when Sheets
  // omits or rewrites the timestamp during synchronization.
  if (Number.isFinite(newestOrder) && newestOrder > 0) {
   return getDateKeyInTimeZone(new Date(newestOrder), safeTimeZone) === todayKey;
  }

  const rawCreatedAt = String(lead.createdAt || '').trim();
  if (!rawCreatedAt) return false;

  const sheetDateKey = dateKeyFromSheetTimestamp(rawCreatedAt);
  if (sheetDateKey) return sheetDateKey === todayKey;

  const created = new Date(rawCreatedAt);
  return !Number.isNaN(created.getTime()) &&
   getDateKeyInTimeZone(created, safeTimeZone) === todayKey;
 } catch {
  const fallbackZone = 'America/New_York';
  const orderValue = getLeadOrderValue(lead);
  return orderValue > 0 &&
   getDateKeyInTimeZone(new Date(orderValue), fallbackZone) ===
   getDateKeyInTimeZone(now, fallbackZone);
 }
}
