import { AppointmentFormData, AppConfig, GoogleCalendarEventPayload, CreatedCalendarEvent } from '../types';
import { loadAppConfig } from '../config';

export const BUSINESS_TIME_ZONE = 'America/New_York';

/**
 * Calculates the exact RFC 3339 timezone offset string (e.g."-04:00"or"-05:00")
 * for a given date and time in the target timezone (defaults to America/New_York).
 */
export function getTimezoneOffsetString(
 dateStr: string,
 timeStr: string,
 timeZone: string = BUSINESS_TIME_ZONE
): string {
 try {
 const match = `${dateStr || ''}T${timeStr || ''}`.match(
 /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/
 );
 if (!match) return '-04:00';

 const [, year, month, day, hour, minute] = match;
 const utcGuess = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
 const parts = new Intl.DateTimeFormat('en-US', {
 timeZone,
 year: 'numeric',
 month: '2-digit',
 day: '2-digit',
 hour: '2-digit',
 minute: '2-digit',
 hourCycle: 'h23',
 }).formatToParts(new Date(utcGuess));
 const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
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
 return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
 } catch {
 return '-04:00';
 }
}

/**
 * Builds Google Calendar event payload formatted with explicit business timezone.
 */
export function buildEventPayload(
  formData: AppointmentFormData,
  config?: AppConfig
): GoogleCalendarEventPayload {
  const {
    clientName,
    appointmentDate,
    startTime,
    endTime,
    salespersonCode,
    clientPhone,
    clientEmail,
    address,
    leadSource,
    leadType,
    notes,
    serviceNeeded,
    houzzProjectLink,
    status,
  } = formData;

  const timeZone = config?.timeZone || BUSINESS_TIME_ZONE;

  // 1. Canonical title format for both the preview and Google Calendar.
  // Example: Appt - DG - Jane Smith (Brick Repair)
  const clientStr = (clientName || '').trim() || 'Client';
  const serviceStr = (serviceNeeded || '').trim() || 'Service Needed';
  const spStr = (salespersonCode || '').trim() || 'Unassigned';
  const summary = `Appt - ${spStr} - ${clientStr} (${serviceStr})`;

  // 2. Format Date and Time with exact target timezone offset
  const startOffset = getTimezoneOffsetString(appointmentDate, startTime, timeZone);
  const endOffset = getTimezoneOffsetString(appointmentDate, endTime, timeZone);
  const startISO = `${appointmentDate}T${startTime}:00${startOffset}`;
  const endISO = `${appointmentDate}T${endTime}:00${endOffset}`;

  // 3. Location
  const location = (address || '').trim();

  // Helper to validate email format
  const isValidEmail = (email?: string): boolean => {
    if (!email || typeof email !== 'string') return false;
    const cleaned = email.trim();
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleaned);
  };

  // 4. Attendees / Guests
  const attendeeSet = new Set<string>();
  if (clientEmail && isValidEmail(clientEmail.trim())) {
    attendeeSet.add(clientEmail.toLowerCase().trim());
  }

  const attendees = Array.from(attendeeSet).map((email) => ({ email }));

  // 5. Description Format
  const rawType = (leadType || '').trim();
  const typeDisplay = rawType
    ? (rawType.startsWith('□') ? rawType : `□ ${rawType}`)
    : '□ Direct';

  const statusDisplay = (status || 'Appointment Scheduled').trim();
  const houzzLinkDisplay = (houzzProjectLink || '').trim();

  const description = `CLIENT NAME: ${clientStr}
EVENT NAME: APPOINTMENT
PHONE: ${(clientPhone || '').trim()}
EMAIL: ${(clientEmail || '').trim()}
ADDRESS: ${location}

LEAD SOURCE: ${(leadSource || '').trim()}
TYPE: ${typeDisplay}
SALESPERSON: ${spStr}
STATUS: ${statusDisplay}
HOUZZ PROJECT LINK: ${houzzLinkDisplay}

Notes:
${(notes || '').trim()}`;

  return {
    summary,
    location,
    description,
    start: {
      dateTime: startISO,
      timeZone,
    },
    end: {
      dateTime: endISO,
      timeZone,
    },
    attendees,
  };
}

export function getCachedCalendarEvents(): any[] {
 if (typeof window === 'undefined') return [];
 try {
 const raw = localStorage.getItem('mrcontract_calendar_events_cache');
 if (raw) {
 const parsed = JSON.parse(raw);
 if (Array.isArray(parsed)) return parsed;
 }
 } catch {}
 return [];
}

export function setCachedCalendarEvents(events: any[]): void {
 if (typeof window === 'undefined') return;
 try {
 if (Array.isArray(events)) {
 localStorage.setItem('mrcontract_calendar_events_cache', JSON.stringify(events));
 window.dispatchEvent(new CustomEvent('calendar_events_updated', { detail: events }));
 }
 } catch {}
}

export interface CalendarSyncStatus {
 lastSyncAt: string | null;
 status: 'idle' | 'syncing' | 'success' | 'error';
 error: string | null;
 errorCode: string | null;
 eventsCount: number;
 calendarId: string;
 authSource: string;
}

export function getCalendarSyncStatus(): CalendarSyncStatus {
 if (typeof window === 'undefined') {
 return {
 lastSyncAt: null,
 status: 'idle',
 error: null,
 errorCode: null,
 eventsCount: 0,
 calendarId: 'primary',
 authSource: 'none',
 };
 }
 try {
 const raw = localStorage.getItem('mrcontract_calendar_sync_status');
 if (raw) return JSON.parse(raw);
 } catch {}
 return {
 lastSyncAt: null,
 status: 'idle',
 error: null,
 errorCode: null,
 eventsCount: 0,
 calendarId: 'primary',
 authSource: 'none',
 };
}

export function setCalendarSyncStatus(status: Partial<CalendarSyncStatus>): CalendarSyncStatus {
 const current = getCalendarSyncStatus();
 const updated: CalendarSyncStatus = { ...current, ...status };
 if (typeof window !== 'undefined') {
 try {
 localStorage.setItem('mrcontract_calendar_sync_status', JSON.stringify(updated));
 window.dispatchEvent(new CustomEvent('calendar_sync_status_changed', { detail: updated }));
 } catch {}
 }
 return updated;
}

export interface BackendCalendarStatus {
  connected: boolean;
  authSource?: string;
  calendarId?: string;
  email?: string | null;
  error?: string | null;
  debugReason?: string;
  reason?: string;
  requiresAdminAction?: boolean;
}

export async function checkBackendCalendarStatus(calendarId?: string): Promise<BackendCalendarStatus> {
  try {
    const query = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : '';
    const res = await fetch(`/api/calendar/status${query}`);
    const data = await res.json().catch(() => ({}));
    const result: BackendCalendarStatus = {
      connected: res.ok && !!data.connected,
      authSource: data.authSource,
      calendarId: data.calendarId,
      email: data.email,
      error: data.error || (!res.ok ? `Server returned status ${res.status}` : null),
      debugReason: data.debugReason,
      reason: data.reason,
      requiresAdminAction: data.requiresAdminAction,
    };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('calendar_status_updated', { detail: result }));
    }
    return result;
  } catch (err: any) {
    const result: BackendCalendarStatus = {
      connected: false,
      error: err.message || 'Could not connect to calendar server.',
    };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('calendar_status_updated', { detail: result }));
    }
    return result;
  }
}

/**
 * Fetch events directly from Google Calendar via backend server proxy.
 * Workers do not need to provide or store access tokens.
 */
export async function fetchGoogleCalendarEvents(
 arg1?: string | null | { timeMin?: string; timeMax?: string; calendarId?: string },
 timeMin?: string,
 timeMax?: string,
 calendarId?: string
): Promise<any[]> {
 setCalendarSyncStatus({ status: 'syncing' });

 let actualTimeMin = timeMin;
 let actualTimeMax = timeMax;
 let actualCalId = calendarId;

 if (typeof arg1 === 'object' && arg1 !== null) {
 actualTimeMin = arg1.timeMin;
 actualTimeMax = arg1.timeMax;
 actualCalId = arg1.calendarId;
 }

 try {
 const params = new URLSearchParams();
 if (actualTimeMin) params.append('timeMin', actualTimeMin);
 if (actualTimeMax) params.append('timeMax', actualTimeMax);
 if (actualCalId) params.append('calendarId', actualCalId);
 const queryString = params.toString() ? `?${params.toString()}` : '';

 const serverRes = await fetch(`/api/calendar/events${queryString}`);
 const serverData = await serverRes.json().catch(() => ({}));

 if (serverRes.ok && serverData.success && Array.isArray(serverData.events)) {
 setCachedCalendarEvents(serverData.events);
 setCalendarSyncStatus({
 status: 'success',
 error: null,
 errorCode: null,
 eventsCount: serverData.events.length,
 calendarId: serverData.calendarId || 'primary',
 authSource: serverData.authSource || 'backend',
 lastSyncAt: new Date().toISOString(),
 });
 return serverData.events;
 }

 const errMsg = serverData.message || serverData.error || `Server returned status ${serverRes.status}`;
 console.warn('[Calendar Sync Notice]:', errMsg);

 setCalendarSyncStatus({
 status: 'error',
 error: errMsg,
 errorCode: serverData.errorCode || `HTTP_${serverRes.status}`,
 calendarId: serverData.calendarId || 'primary',
 authSource: serverData.authSource || 'backend',
 lastSyncAt: new Date().toISOString(),
 });
 return getCachedCalendarEvents();
 } catch (err: any) {
 console.warn('Calendar events fetch exception:', err);
 setCalendarSyncStatus({
 status: 'error',
 error: err?.message || 'Failed to connect to backend calendar service.',
 errorCode: 'NETWORK_ERROR',
 lastSyncAt: new Date().toISOString(),
 });
 return getCachedCalendarEvents();
 }
}

/**
 * Creates a Google Calendar appointment event via the backend server proxy.
 */
/**
 * Helper to check if two salesperson identifiers match
 */
export function isSameSalesperson(sp1: string, sp2: string): boolean {
 if (!sp1 || !sp2) return false;
 const clean1 = sp1.trim().toLowerCase();
 const clean2 = sp2.trim().toLowerCase();
 if (clean1 === clean2) return true;
 const match1 = clean1.match(/\(([a-z0-9_-]+)\)/i);
 const match2 = clean2.match(/\(([a-z0-9_-]+)\)/i);
 const c1 = match1 ? match1[1].toLowerCase() : clean1;
 const c2 = match2 ? match2[1].toLowerCase() : clean2;
 if (c1 === c2 || c1 === clean2 || c2 === clean1) return true;
 if (clean1.includes(clean2) || clean2.includes(clean1)) return true;
 return false;
}

/**
 * Creates a Google Calendar event via the backend server proxy.
 */
export async function createGoogleCalendarEvent(
 arg1?: string | null | GoogleCalendarEventPayload,
 arg2?: GoogleCalendarEventPayload | string,
 arg3?: string
): Promise<CreatedCalendarEvent> {
 let payload: GoogleCalendarEventPayload | undefined;
 let calendarId: string | undefined;

 if (arg1 && typeof arg1 === 'object') {
 payload = arg1 as GoogleCalendarEventPayload;
 if (typeof arg2 === 'string') calendarId = arg2;
 } else {
 if (arg2 && typeof arg2 === 'object') {
 payload = arg2 as GoogleCalendarEventPayload;
 if (typeof arg3 === 'string') calendarId = arg3;
 }
 }

 const query = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : '';
 const res = await fetch(`/api/calendar/events${query}`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(payload),
 });

 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.success || !data.event) {
 if (res.status === 409 || data.conflict || data.error?.includes('already has an appointment')) {
 throw new Error('This salesperson already has an appointment at this time.');
 }
 throw new Error(data.error || data.message || `Failed to create calendar event (HTTP ${res.status}).`);
 }

 const created: CreatedCalendarEvent = {
 id: data.event.id,
 htmlLink: data.event.htmlLink,
 summary: data.event.summary,
 start: data.event.start?.dateTime || data.event.start?.date || data.event.start,
 end: data.event.end?.dateTime || data.event.end?.date || data.event.end,
 };

 try {
 const cached = getCachedCalendarEvents();
 const newEventObj = {
 id: created.id,
 htmlLink: created.htmlLink,
 summary: payload?.summary || created.summary,
 description: payload?.description || '',
 location: payload?.location || '',
 start: payload?.start || { dateTime: created.start },
 end: payload?.end || { dateTime: created.end },
 attendees: payload?.attendees || [],
 };
 const updatedEvents = [newEventObj, ...cached.filter((e: any) => e.id !== created.id)];
 setCachedCalendarEvents(updatedEvents);
 } catch {}

 return created;
}

/**
 * Updates an existing Google Calendar event via the backend server proxy.
 */
export async function updateGoogleCalendarEvent(
 arg1: string | null | undefined,
 arg2: string | GoogleCalendarEventPayload,
 arg3?: GoogleCalendarEventPayload | string,
 arg4?: string
): Promise<CreatedCalendarEvent> {
 let eventId = '';
 let payload: GoogleCalendarEventPayload | undefined;
 let calendarId: string | undefined;

 if (typeof arg1 === 'string' && arg2 && typeof arg2 === 'object') {
 eventId = arg1;
 payload = arg2 as GoogleCalendarEventPayload;
 if (typeof arg3 === 'string') calendarId = arg3;
 } else if (typeof arg2 === 'string' && arg3 && typeof arg3 === 'object') {
 eventId = arg2;
 payload = arg3 as GoogleCalendarEventPayload;
 if (typeof arg4 === 'string') calendarId = arg4;
 }

 const query = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : '';
 const response = await fetch(`/api/calendar/events/${encodeURIComponent(eventId)}${query}`, {
 method: 'PUT',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(payload),
 });

 const data = await response.json().catch(() => ({}));
 if (!response.ok || !data.success) {
 if (response.status === 409 || data.conflict || data.error?.includes('already has an appointment')) {
 throw new Error('This salesperson already has an appointment at this time.');
 }
 throw new Error(data.error || data.message || `Failed to update calendar event (HTTP ${response.status}).`);
 }

 const result = data.event || {};
 const updated: CreatedCalendarEvent = {
 id: result.id || eventId,
 htmlLink: result.htmlLink,
 summary: result.summary || payload?.summary,
 start: result.start?.dateTime || result.start?.date || payload?.start?.dateTime,
 end: result.end?.dateTime || result.end?.date || payload?.end?.dateTime,
 };

 try {
 const cached = getCachedCalendarEvents();
 const updatedEventObj = {
 id: updated.id,
 htmlLink: updated.htmlLink,
 summary: payload?.summary || updated.summary,
 description: payload?.description || '',
 location: payload?.location || '',
 start: payload?.start || { dateTime: updated.start },
 end: payload?.end || { dateTime: updated.end },
 attendees: payload?.attendees || [],
 };
 const updatedEvents = [updatedEventObj, ...cached.filter((e: any) => e.id !== updated.id)];
 setCachedCalendarEvents(updatedEvents);
 } catch {}

 return updated;
}

/**
 * Deletes an existing Google Calendar event via backend server proxy.
 */
export async function deleteGoogleCalendarEvent(
 eventId: string,
 calendarId?: string
): Promise<boolean> {
 const query = calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : '';
 const response = await fetch(`/api/calendar/events/${encodeURIComponent(eventId)}${query}`, {
 method: 'DELETE',
 });
 const data = await response.json().catch(() => ({}));
 if (!response.ok || !data.success) {
 throw new Error(data.error || data.message || `Failed to delete calendar event (HTTP ${response.status}).`);
 }

 try {
 const cached = getCachedCalendarEvents();
 const updatedEvents = cached.filter((e: any) => e.id !== eventId);
 setCachedCalendarEvents(updatedEvents);
 } catch {}

 return true;
}

/**
 * Timezone-aware date & time parser from ISO string.
 * Enforces business timezone (America/New_York) to prevent date/time shift.
 */
export function parseDateTimeFromISO(
 isoStr: string,
 timeZone: string = BUSINESS_TIME_ZONE
): { date: string; time: string } {
 if (!isoStr) return { date: '', time: '' };
 const trimmed = isoStr.trim();
 if (!trimmed.includes('T')) {
 return { date: trimmed, time: '09:00' };
 }

 const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
 if (hasTimezone) {
 try {
 const d = new Date(trimmed);
 if (!isNaN(d.getTime())) {
 const date = new Intl.DateTimeFormat('en-CA', {
 timeZone,
 year: 'numeric',
 month: '2-digit',
 day: '2-digit',
 }).format(d);
 const time = new Intl.DateTimeFormat('en-GB', {
 timeZone,
 hour: '2-digit',
 minute: '2-digit',
 hour12: false,
 }).format(d);
 return { date, time };
 }
 } catch {}
 }

 // Plain ISO string without timezone indicator
 const parts = trimmed.split('T');
 const date = parts[0];
 const timeMatch = parts[1].match(/^(\d{2}):(\d{2})/);
 const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '09:00';
 return { date, time };
}

export function parseCalendarEventToFormData(
 event: any,
 config?: AppConfig
): { formData: AppointmentFormData; eventId: string } {
 const summary = event.summary || '';
 const description = event.description || '';
 const location = event.location || '';

 const targetTz = config?.timeZone || BUSINESS_TIME_ZONE;
 const startISO: string = event.start?.dateTime || event.start?.date || '';
 const endISO: string = event.end?.dateTime || event.end?.date || '';

 const parsedStart = parseDateTimeFromISO(startISO, targetTz);
 const parsedEnd = parseDateTimeFromISO(endISO, targetTz);

 const appointmentDate = parsedStart.date || new Date().toISOString().split('T')[0];
 const startTime = parsedStart.time || '09:00';
 const endTime = parsedEnd.time || '10:00';

 const cleanDesc = description.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');

 const getDescVal = (key: string): string => {
 const regex = new RegExp(`${key}:\\s*(.*)`, 'i');
 const match = cleanDesc.match(regex);
 let val = match ? match[1].trim() : '';
 if (val.startsWith('•')) {
 val = val.substring(1).trim();
 }
 return val;
 };

 let clientName = getDescVal('CLIENT NAME');
 const clientPhone = getDescVal('PHONE');
 let clientEmail = getDescVal('EMAIL');
 const address = getDescVal('ADDRESS') || location;
 let leadSource = getDescVal('LEAD SOURCE');
 let leadType = getDescVal('TYPE');
  if (leadType.startsWith('□')) {
    leadType = leadType.substring(1).trim();
  }
  let status = getDescVal('STATUS') || 'Appointment Scheduled';
  let houzzProjectLink = getDescVal('HOUZZ PROJECT LINK') || getDescVal('HOUZZ LINK') || '';
  let serviceNeeded = getDescVal('SERVICE NEEDED');
  if (!serviceNeeded && summary) {
    const sMatch = summary.match(/\(([^)]+)\)/);
    if (sMatch && sMatch[1]) {
      serviceNeeded = sMatch[1].trim();
    }
  }
 let salespersonCode =
 getDescVal('SALESPERSON') ||
 getDescVal('REPRESENTATIVE') ||
 getDescVal('REP') ||
 getDescVal('SALES REP') ||
 getDescVal('ASSIGNED TO') ||
 getDescVal('ESTIMATOR') ||
 '';

 if (!salespersonCode) {
 const repMatch = cleanDesc.match(/(?:salesperson|representative|sales\s*rep|rep|assigned\s*to|estimator)\s*[:\-]\s*([^\n\r,•]+)/i);
 if (repMatch && repMatch[1]) {
 salespersonCode = repMatch[1].trim();
 }
 }

	if (!salespersonCode && summary) {
		const cleanSum = summary.trim();
		const configuredCodes = (config?.salespeople || [])
			.map((salesperson) => String(salesperson.code || '').trim().toUpperCase())
			.filter(Boolean);
		const configuredCodeSet = new Set(configuredCodes);
		const titleParts = cleanSum.split(/[-–—]/).map((part: string) => part.trim()).filter(Boolean);
		const candidates: string[] = [];

		// Current format: Appt - DG - Client Name (Service Needed)
		if (/^(?:appt|appointment)\b/i.test(titleParts[0] || '') && titleParts[1]) {
			candidates.push(titleParts[1]);
		}
		// Older format: Appt - Client Name (Service Needed) - DG
		if (titleParts.length > 1) candidates.push(titleParts[titleParts.length - 1]);

		for (const rawCandidate of candidates) {
			const candidate = rawCandidate.replace(/[\(\)\[\]\{\}]/g, '').trim().toUpperCase();
			if (configuredCodeSet.has(candidate)) {
				salespersonCode = candidate;
				break;
			}
		}
	}

	let salespersonName = '';
	if (salespersonCode && config?.salespeople) {
		const matchedSp = config.salespeople.find(
			(s) =>
				s.code.toUpperCase() === salespersonCode.toUpperCase() ||
				s.name.toLowerCase().includes(salespersonCode.toLowerCase()) ||
				salespersonCode.toLowerCase().includes(s.name.toLowerCase())
		);
		if (matchedSp) {
			salespersonCode = matchedSp.code;
			salespersonName = matchedSp.name;
		}
	}

	let notes = '';
	if (cleanDesc.includes('Notes:')) {
		notes = cleanDesc.split('Notes:')[1]?.trim() || '';
	} else if (!clientName && !clientPhone) {
		notes = cleanDesc;
	}

	if (!clientName) {
		if (summary.includes('-') || summary.includes('–') || summary.includes('—')) {
			const parts = summary.split(/[-–—]/).map((p: string) => p.trim()).filter(Boolean);
			if (parts.length >= 2) {
				const namePart = parts.find((p: string) => {
					const cleanP = p.replace(/^Appointment|^Appt|^Job/i, '').trim();
					if (!cleanP) return false;
					if (/^(\$|ES#|ES:|Job|Appt|Meeting|Sub|DG|SB|DK|JR|JC|EP)/i.test(p)) return false;
					return true;
				});
				clientName = namePart ? namePart.replace(/^Appointment|^Appt|^Job/i, '').trim() : (parts[1] || parts[0]);
			} else {
				clientName = summary.replace(/^Appointment|^Appt|^Job/i, '').trim();
			}
		} else {
			clientName = summary.replace(/^Appointment|^Appt|^Job/i, '').trim() || summary;
		}
	}

 const activeSources = config?.leadSources?.length ? config.leadSources : ['Angi', 'Thumbtack', 'Houzz', 'Referral'];
 const activeTypes = config?.leadTypes?.length ? config.leadTypes : ['Direct', 'Insurance', 'Other'];

 if (!activeSources.includes(leadSource)) {
 leadSource = activeSources[0] || 'Angi';
 }
 if (!activeTypes.includes(leadType)) {
 leadType = activeTypes[0] || 'Direct';
 }

 if (!clientEmail && Array.isArray(event.attendees)) {
 const clientAttendee = event.attendees.find((a: any) => a.email && typeof a.email === 'string');
 if (clientAttendee) {
 clientEmail = clientAttendee.email;
 }
 }

 return {
 formData: {
 clientName,
 appointmentDate,
 startTime,
 endTime,
 salespersonCode,
 clientPhone,
 clientEmail,
 address,
 leadSource,
 leadType,
 notes,
 calendarEventId: event.id || '',
 calendarHtmlLink: event.htmlLink || '',
 },
 eventId: event.id || '',
 };
}

export function formatTime12Hour(timeStr?: string): string {
 if (!timeStr) return '';
 if (timeStr.includes('T')) {
 const d = new Date(timeStr);
 if (!isNaN(d.getTime())) {
 let hours = d.getHours();
 const mins = String(d.getMinutes()).padStart(2, '0');
 const ampm = hours >= 12 ? 'PM' : 'AM';
 hours = hours % 12;
 if (hours === 0) hours = 12;
 return `${hours}:${mins} ${ampm}`;
 }
 }

 const parts = timeStr.split(':');
 if (parts.length < 2) return timeStr;
 let hours = parseInt(parts[0], 10);
 const mins = parts[1].slice(0, 2);
 if (isNaN(hours)) return timeStr;
 const ampm = hours >= 12 ? 'PM' : 'AM';
 hours = hours % 12;
 if (hours === 0) hours = 12;
 return `${hours}:${mins} ${ampm}`;
}

export function formatAppointmentDateNice(dateStr?: string): string {
 if (!dateStr) return '';
 if (dateStr.includes('T')) {
 dateStr = dateStr.split('T')[0];
 }
 const parts = dateStr.split('-');
 if (parts.length === 3) {
 const [year, month, day] = parts;
 const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 const monthIdx = parseInt(month, 10) - 1;
 if (monthIdx >= 0 && monthIdx < 12) {
 return `${months[monthIdx]} ${parseInt(day, 10)}, ${year}`;
 }
 }
 return dateStr;
}

export function formatAppointmentDateTime(dateStr?: string, startTimeStr?: string, endTimeStr?: string): string {
 if (!dateStr) return '';
 const niceDate = formatAppointmentDateNice(dateStr);
 const formattedStart = formatTime12Hour(startTimeStr);
 const formattedEnd = formatTime12Hour(endTimeStr);

 if (formattedStart && formattedEnd) {
 return `${niceDate} at ${formattedStart} - ${formattedEnd}`;
 } else if (formattedStart) {
 return `${niceDate} at ${formattedStart}`;
 }
 return niceDate;
}

export function matchCalendarEventForLead(
 clientName?: string,
 clientPhone?: string,
 clientEmail?: string,
 calendarEvents?: any[],
 config?: AppConfig,
 clientAddress?: string,
 calendarEventId?: string
): { event: any; formData: AppointmentFormData; matchType?: string } | null {
 if (!calendarEvents || !Array.isArray(calendarEvents) || calendarEvents.length === 0) {
 return null;
 }

 const activeConfig = config || loadAppConfig();

 // Priority 1: Exact Calendar Event ID Match
 if (calendarEventId && calendarEventId.trim()) {
 const cleanId = calendarEventId.trim();
 const exactMatch = calendarEvents.find((e) => e && e.id === cleanId && e.status !== 'cancelled');
 if (exactMatch) {
 const { formData } = parseCalendarEventToFormData(exactMatch, activeConfig);
 return { event: exactMatch, formData, matchType: 'calendar_event_id' };
 }
 }

 const normName = (clientName || '').toLowerCase().trim();
 const cleanPhone = (clientPhone || '').replace(/\D/g, '');
 const last7Phone = cleanPhone.length >= 7 ? cleanPhone.slice(-7) : cleanPhone;
 const last10Phone = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
 const normEmail = (clientEmail || '').toLowerCase().trim();
 const normAddr = (clientAddress || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

 const nameTokens = normName
 .replace(/[^a-z0-9\s]/g, ' ')
 .split(/\s+/)
 .filter((t) => t.length >= 2);

 const addrMatch = normAddr.match(/^(\d+)\s+([a-z]+)/);
 const addrKeywords = addrMatch ? `${addrMatch[1]} ${addrMatch[2]}` : '';
 const addrStreetNumber = addrMatch ? addrMatch[1] : '';

 if (!normName && !cleanPhone && !normEmail && !addrKeywords) {
 return null;
 }

 interface ScoredCandidate {
 event: any;
 score: number;
 matchType: string;
 }

 const scoredCandidates: ScoredCandidate[] = [];

 for (const event of calendarEvents) {
 if (!event || event.status === 'cancelled') continue;

 const summary = (event.summary || '').toLowerCase();
 const description = (event.description || '').toLowerCase();
 const location = (event.location || '').toLowerCase();
 const allText = `${summary} ${description} ${location}`;
 const allTextDigits = allText.replace(/\D/g, '');

 let score = 0;
 const matchReasons: string[] = [];

 // 1. Phone Number matching
 if (last10Phone.length === 10 && allTextDigits.includes(last10Phone)) {
 score += 90;
 matchReasons.push('phone_10');
 } else if (last7Phone.length >= 7 && allTextDigits.includes(last7Phone)) {
 score += 55;
 matchReasons.push('phone_7');
 }

 // 2. Email matching
 if (normEmail && normEmail.includes('@') && normEmail.length >= 5) {
 if (allText.includes(normEmail)) {
 score += 85;
 matchReasons.push('email_text');
 } else if (Array.isArray(event.attendees)) {
 const hasEmail = event.attendees.some(
 (a: any) => typeof a.email === 'string' && a.email.toLowerCase().trim() === normEmail
 );
 if (hasEmail) {
 score += 85;
 matchReasons.push('email_attendee');
 }
 }
 }

 // 3. Name matching
 if (normName.length >= 3) {
 if (allText.includes(normName)) {
 score += 70;
 matchReasons.push('name_exact');
 } else if (nameTokens.length >= 2) {
 const hasAllTokens = nameTokens.every((token) => {
 if (allText.includes(token)) return true;
 if (token.startsWith('c')) {
 const kToken = 'k' + token.slice(1);
 if (allText.includes(kToken)) return true;
 } else if (token.startsWith('k')) {
 const cToken = 'c' + token.slice(1);
 if (allText.includes(cToken)) return true;
 }
 return false;
 });

 if (hasAllTokens) {
 score += 65;
 matchReasons.push('name_all_tokens');
 } else {
 const lastName = nameTokens[nameTokens.length - 1];
 if (lastName.length >= 4 && (summary.includes(lastName) || description.includes(lastName))) {
 score += 35;
 matchReasons.push('name_last');
 }
 }
 }
 }

 // 4. Address matching
 if (addrKeywords.length >= 4 && allText.includes(addrKeywords)) {
 score += 50;
 matchReasons.push('address_full');
 } else if (addrStreetNumber && addrStreetNumber.length >= 2 && allText.includes(addrStreetNumber)) {
 if (matchReasons.length > 0) {
 score += 20;
 matchReasons.push('address_number');
 }
 }

 if (score >= 50) {
 scoredCandidates.push({
 event,
 score,
 matchType: matchReasons.join('+'),
 });
 }
 }

 if (scoredCandidates.length === 0) return null;

 const nowTime = Date.now();
 scoredCandidates.sort((a, b) => {
 if (b.score !== a.score) {
 return b.score - a.score;
 }
 const aTime = new Date(a.event.start?.dateTime || a.event.start?.date || 0).getTime();
 const bTime = new Date(b.event.start?.dateTime || b.event.start?.date || 0).getTime();
 const aDiff = Math.abs(aTime - nowTime);
 const bDiff = Math.abs(bTime - nowTime);
 return aDiff - bDiff;
 });

 const best = scoredCandidates[0];
 const { formData } = parseCalendarEventToFormData(best.event, activeConfig);
 return { event: best.event, formData, matchType: best.matchType };
}
