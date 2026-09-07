import { AppointmentFormData } from '../types';

export interface HouzzLeadPayload {
 clientName: string;
 clientPhone: string;
 clientEmail: string;
 address: string;
 clientAddress?: string;
 location?: string;
 street?: string;
 fullAddress?: string;
 propertyAddress?: string;
 address1?: string;
 streetAddress?: string;
 address2?: string;
 city?: string;
 clientCity?: string;
 state?: string;
 clientState?: string;
 zip?: string;
 zipCode?: string;
 postalCode?: string;
 addressName?: string;
 serviceNeeded: string;
 leadSource: string;
 leadType?: string;
 salespersonCode?: string;
 appointmentDate?: string;
 startTime?: string;
 endTime?: string;
 notes?: string;
 status?: string;
 source: string;
 timestamp: string;
}

export function parseAddress(fullAddress: string) {
 const clean = (fullAddress || '').trim();
 if (!clean) return { address1: '', city: '', state: '', zip: '', postalCode: '', addressName: '' };

 const parts = clean.split(',').map(p => p.trim());
 let address1 = parts[0] || clean;
 let city = '';
 let state = '';
 let zip = '';

 if (parts.length >= 4) {
 city = parts[1];
 state = parts[2];
 zip = parts[3];
 } else if (parts.length === 3) {
 city = parts[1];
 const stateZip = parts[2].split(/\s+/);
 state = stateZip[0] || '';
 zip = stateZip[1] || '';
 } else if (parts.length === 2) {
 const stateZip = parts[1].split(/\s+/);
 if (stateZip.length >= 2) {
 city = stateZip.slice(0, stateZip.length - 2).join(' ') || parts[1];
 state = stateZip[stateZip.length - 2] || '';
 zip = stateZip[stateZip.length - 1] || '';
 } else {
 city = parts[1];
 }
 }

 return {
 address1,
 address2: '',
 city,
 state,
 zip,
 postalCode: zip,
 addressName: address1,
 };
}

const HOUZZ_SYNCED_STORAGE_KEY = 'mrcontract_houzz_synced_leads';

/**
 * Returns a set of unique keys for leads that have already been sent to Houzz Pro.
 */
export function getHouzzSyncedLeadKeys(): Set<string> {
 try {
 const raw = localStorage.getItem(HOUZZ_SYNCED_STORAGE_KEY);
 if (!raw) return new Set();
 const arr = JSON.parse(raw);
 return new Set(Array.isArray(arr) ? arr : []);
 } catch {
 return new Set();
 }
}

/**
 * Generates a consistent unique identifier for a lead.
 */
export function getLeadUniqueKey(lead: {
 id?: string;
 tabName?: string;
 rowIndex?: number;
 clientName?: string;
 clientPhone?: string;
}): string {
 if (lead.id) return lead.id;
 if (lead.tabName && lead.rowIndex !== undefined) {
 return `${lead.tabName}_${lead.rowIndex}`;
 }
 const cleanName = (lead.clientName || '').trim().toLowerCase();
 const cleanPhone = (lead.clientPhone || '').replace(/\D/g, '');
 return `lead_${cleanName}_${cleanPhone}`;
}

/**
 * Checks if a lead has already been sent to Houzz Pro.
 */
export function isLeadInHouzzPro(lead: {
 id?: string;
 tabName?: string;
 rowIndex?: number;
 clientName?: string;
 clientPhone?: string;
}): boolean {
 const synced = getHouzzSyncedLeadKeys();
 const key = getLeadUniqueKey(lead);
 if (synced.has(key)) return true;
 
 // Also check by normalized phone/name
 const altKey = `lead_${(lead.clientName || '').trim().toLowerCase()}_${(lead.clientPhone || '').replace(/\D/g, '')}`;
 return synced.has(altKey);
}

/**
 * Marks a lead as successfully sent to Houzz Pro to prevent duplicate submissions.
 */
export function markLeadAsSentToHouzzPro(lead: {
 id?: string;
 tabName?: string;
 rowIndex?: number;
 clientName?: string;
 clientPhone?: string;
}): void {
 try {
 const synced = getHouzzSyncedLeadKeys();
 const key = getLeadUniqueKey(lead);
 synced.add(key);
 
 if (lead.clientName) {
 const altKey = `lead_${(lead.clientName || '').trim().toLowerCase()}_${(lead.clientPhone || '').replace(/\D/g, '')}`;
 synced.add(altKey);
 }

 localStorage.setItem(HOUZZ_SYNCED_STORAGE_KEY, JSON.stringify(Array.from(synced)));
 } catch (err) {
 console.error('Failed to save Houzz sync key:', err);
 }
}

/**
 * Sends lead data directly to the configured Houzz Pro / Zapier Webhook
 * Uses the backend server to dispatch the webhook, ensuring all team members
 * share the centralized backend webhook without needing to enter it manually.
 */
export async function sendLeadToHouzzPro(
 webhookUrl?: string,
 data: Partial<AppointmentFormData> & {
 id?: string;
 tabName?: string;
 rowIndex?: number;
 clientName: string;
 clientPhone?: string;
 clientEmail?: string;
 address?: string;
 serviceNeeded?: string;
 leadSource?: string;
 notes?: string;
 } = {} as any
): Promise<{ success: boolean; message: string }> {
 const addr = (data.address || '').trim();
 const parsedAddr = parseAddress(addr);
 const submissionId = 'lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
 
 const rawData = data as any;
 const resolvedClientName = (data.clientName && data.clientName.trim()) ? data.clientName.trim() : (rawData.name || rawData.fullName || rawData.customerName || rawData.leadName || 'New Lead');
 const nameParts = resolvedClientName.split(' ');
 const firstName = nameParts[0] || resolvedClientName;
 const lastName = nameParts.slice(1).join(' ') || '';
 const resolvedPhone = data.clientPhone || '';
 const resolvedEmail = data.clientEmail || '';
 const resolvedService = data.serviceNeeded || data.leadType || '';
 const resolvedSource = data.leadSource || 'Web App';
 const resolvedNotes = data.notes || '';

 const payload: any = {
 submissionId,
 eventId: submissionId,
 forceNewLead: true,
 createNewRecord: true,
 createNewLead: true,
 createFreshLead: true,
 allowDuplicate: true,
 matchByEmail: false,
 updateOrCreate: 'create',
 action: 'create_new_lead',
 skipContactMatching: true,
 ignoreExistingContact: true,
 clientName: resolvedClientName,
 name: resolvedClientName,
 fullName: resolvedClientName,
 customerName: resolvedClientName,
 leadName: resolvedClientName,
 client_name: resolvedClientName,
 client_full_name: resolvedClientName,
 customer_name: resolvedClientName,
 firstName: firstName,
 first_name: firstName,
 lastName: lastName,
 last_name: lastName,
 clientPhone: resolvedPhone,
 phone: resolvedPhone,
 phoneNumber: resolvedPhone,
 phone_number: resolvedPhone,
 clientEmail: resolvedEmail,
 email: resolvedEmail,
 address: addr,
 clientAddress: addr,
 location: addr,
 street: addr,
 fullAddress: addr,
 propertyAddress: addr,
 address1: parsedAddr.address1,
 streetAddress: parsedAddr.address1,
 address2: parsedAddr.address2,
 city: parsedAddr.city,
 clientCity: parsedAddr.city,
 state: parsedAddr.state,
 clientState: parsedAddr.state,
 zip: parsedAddr.zip,
 zipCode: parsedAddr.zip,
 postalCode: parsedAddr.postalCode,
 addressName: parsedAddr.addressName,
 serviceNeeded: resolvedService,
 service: resolvedService,
 leadSource: resolvedSource,
 source: resolvedSource,
 leadType: data.leadType || '',
 salespersonCode: data.salespersonCode || '',
 appointmentDate: data.appointmentDate || new Date().toISOString().split('T')[0],
 startTime: data.startTime || '',
 endTime: data.endTime || '',
 notes: resolvedNotes,
 message: resolvedNotes,
 status: data.status || 'New',
 timestamp: new Date().toISOString(),
 };

 try {
 const res = await fetch('/api/send-houzz-webhook', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 webhookUrl: (webhookUrl || '').trim(),
 payload,
 }),
 });

 if (!res.ok) {
 const errRes = await res.json().catch(() => null);
 if (errRes && errRes.message) {
 throw new Error(errRes.message);
 }
 if (webhookUrl && webhookUrl.trim()) {
 // Fallback to direct fetch if proxy fails
 await fetch(webhookUrl.trim(), {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'Accept': 'application/json',
 },
 mode: 'no-cors',
 body: JSON.stringify(payload),
 });
 } else {
 throw new Error('Backend failed to forward lead to Zapier webhook.');
 }
 }

 // Mark as sent so it cannot be added again
 markLeadAsSentToHouzzPro(data);

 return {
 success: true,
 message:"Lead sent to Houzz Pro",
 };
 } catch (error: any) {
 console.error('Error sending lead to Houzz Pro webhook:', error);
 throw new Error(error.message || 'Failed to send lead to Houzz Pro webhook.');
 }
}
