// Webhooks integration utilities for Angi and Thumbtack

export interface IncomingWebhookLead {
 id: string;
 createdAt: string;
 clientName: string;
 clientPhone: string;
 clientEmail: string;
 address: string;
 leadSource: string;
 serviceNeeded: string;
 carrier?: string;
 leadFee?: string;
 notes?: string;
 status: string;
 isWebhookLead: boolean;
 webhookSource: string;
 sheetSynced?: boolean;
 parsingResult?: string;
 crmResult?: string;
 houzzResult?: string;
 overallStatus?: string;
 rawPayload?: any;
}

export interface WebhookLogItem {
 id: string;
 receivedAt: string;
 source: string;
 clientName: string;
 clientPhone: string;
 success: boolean;
 ip: string;
 leadId: string;
 payloadSnippet?: any;
}

const CACHED_WEBHOOK_LEADS_KEY = 'mrcontract_cached_webhook_leads';

/**
 * Get accurate webhook URLs based on current active origin
 */
export function getWebhookUrls(): {
 angiUrl: string;
 thumbtackUrl: string;
 universalUrl: string;
} {
 const origin = typeof window !== 'undefined' ? window.location.origin : '';
 return {
 angiUrl: `${origin}/api/webhooks/angi`,
 thumbtackUrl: `${origin}/api/webhooks/thumbtack`,
 universalUrl: `${origin}/api/webhooks/incoming-lead`,
 };
}

/**
 * Helper to identify test / example leads so they are never retained or displayed
 */
export function isExampleWebhookLead(lead: {
 clientName?: string;
 clientEmail?: string;
 clientPhone?: string;
 address?: string;
}): boolean {
 if (!lead) return false;
 const name = (lead.clientName || '').trim().toLowerCase();
 const email = (lead.clientEmail || '').trim().toLowerCase();
 const phone = (lead.clientPhone || '').replace(/\D/g, '');
 const addr = (lead.address || '').toLowerCase();

 if (email.includes('example.com') || email.includes('@test.') || email.includes('testangi@')) return true;

 const exampleNames = [
 'jan mccoy',
 'sarah jenkins',
 'michael rodriguez',
 'cory rockwood',
 'amanda miller',
 'robert patterson',
 'test angi client',
 'test thumbtack user',
 'sample client',
 'test client',
 'test',
 'test 1',
 'test test',
 'test web form',
 ];

 if (
 exampleNames.includes(name) ||
 name.startsWith('test ') ||
 name.includes('sample client') ||
 name.startsWith('robert patterson')
 ) {
 return true;
 }

 if (phone.startsWith('412555') || phone.includes('5550144') || phone.includes('5550188') || phone.includes('5559988')) {
 return true;
 }

 if (addr.includes('evergreen terrace') || addr.includes('100 liberty ave')) {
 return true;
 }

 return false;
}

/**
 * Fetch incoming leads from the backend server
 */
export async function fetchIncomingWebhookLeads(): Promise<IncomingWebhookLead[]> {
 try {
 const res = await fetch('/api/webhooks/incoming-leads');
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const data = await res.json();
 if (data.success && Array.isArray(data.leads)) {
 const realLeads = data.leads.filter((l: any) => !isExampleWebhookLead(l));
 try {
 localStorage.setItem(CACHED_WEBHOOK_LEADS_KEY, JSON.stringify(realLeads));
 } catch {}
 return realLeads;
 }
 return [];
 } catch (err) {
 console.warn('Failed to fetch incoming webhook leads:', err);
 try {
 const cached = localStorage.getItem(CACHED_WEBHOOK_LEADS_KEY);
 if (cached) {
 const list = JSON.parse(cached);
 if (Array.isArray(list)) {
 const cleaned = list.filter((l) => !isExampleWebhookLead(l));
 return cleaned;
 }
 }
 } catch {}
 return [];
 }
}

/**
 * Fetch recent webhook activity logs for inspection
 */
export async function fetchWebhookLogs(): Promise<WebhookLogItem[]> {
 try {
 const res = await fetch('/api/webhooks/logs');
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const data = await res.json();
 if (data.success && Array.isArray(data.logs)) {
 return data.logs;
 }
 return [];
 } catch (err) {
 console.warn('Failed to fetch webhook logs:', err);
 return [];
 }
}

/**
 * Send a simulated test lead to test Angi or Thumbtack webhook flow
 */
export async function sendTestWebhookLead(source: 'Angi' | 'Thumbtack'): Promise<{
 success: boolean;
 message: string;
 lead?: IncomingWebhookLead;
}> {
 try {
 const res = await fetch('/api/webhooks/test', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ source }),
 });
 const data = await res.json();
 if (data.success) {
 // Re-sync local cache
 await syncIncomingWebhookLeads();
 return { success: true, message: data.message, lead: data.lead };
 }
 return { success: false, message: data.error || 'Failed to send test webhook lead.' };
 } catch (err: any) {
 return { success: false, message: err.message || 'Network error.' };
 }
}

/**
 * Delete / dismiss an incoming webhook lead from backend
 */
export async function deleteIncomingWebhookLead(id: string): Promise<boolean> {
 try {
 const res = await fetch(`/api/webhooks/incoming-leads/${encodeURIComponent(id)}`, {
 method: 'DELETE',
 });
 if (res.ok) {
 // Remove from local cache
 try {
 const cached = localStorage.getItem(CACHED_WEBHOOK_LEADS_KEY);
 if (cached) {
 const list: IncomingWebhookLead[] = JSON.parse(cached);
 const filtered = list.filter((item) => item.id !== id);
 localStorage.setItem(CACHED_WEBHOOK_LEADS_KEY, JSON.stringify(filtered));
 }
 } catch {}
 window.dispatchEvent(new CustomEvent('new_leads_updated'));
 return true;
 }
 return false;
 } catch (err) {
 console.error('Failed to delete incoming webhook lead:', err);
 return false;
 }
}

/**
 * Clear all incoming webhook leads from backend and local cache
 */
export async function clearAllIncomingWebhookLeads(): Promise<boolean> {
 try {
 const res = await fetch('/api/webhooks/incoming-leads', {
 method: 'DELETE',
 });
 try {
 localStorage.removeItem(CACHED_WEBHOOK_LEADS_KEY);
 } catch {}
 window.dispatchEvent(new CustomEvent('new_leads_updated'));
 return res.ok;
 } catch (err) {
 console.error('Failed to clear all incoming webhook leads:', err);
 return false;
 }
}

/**
 * Update an incoming webhook lead status or notes
 */
export async function updateIncomingWebhookLead(
 id: string,
 updates: Partial<IncomingWebhookLead>
): Promise<boolean> {
 try {
 const res = await fetch(`/api/webhooks/incoming-leads/${encodeURIComponent(id)}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(updates),
 });
 if (res.ok) {
 await syncIncomingWebhookLeads();
 return true;
 }
 return false;
 } catch (err) {
 console.error('Failed to update incoming webhook lead:', err);
 return false;
 }
}

/**
 * Sync webhook leads from server into local storage and notify listeners
 */
export async function syncIncomingWebhookLeads(): Promise<IncomingWebhookLead[]> {
 const leads = await fetchIncomingWebhookLeads();
 window.dispatchEvent(new CustomEvent('new_leads_updated'));
 return leads;
}

export interface WebhookDiagnosticsData {
 success: boolean;
 status: string;
 endpoints: {
 angi: string;
 thumbtack: string;
 universal: string;
 parseEmail: string;
 };
 counts: {
 totalIncomingLeads: number;
 angiLeadsCount: number;
 thumbtackLeadsCount: number;
 totalLogs: number;
 };
 lastReceivedLead: any;
 recentLogs: WebhookLogItem[];
 webhookStatus?: {
   lastRealAngiWebhookAt?: string;
   lastRealWebhookAt?: string;
 };
 serverTime: string;
}

/**
 * Fetch full Webhook Diagnostics overview
 */
export async function fetchWebhookDiagnostics(): Promise<WebhookDiagnosticsData | null> {
 try {
 const res = await fetch('/api/webhooks/diagnostics');
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 const data = await res.json();
 return data;
 } catch (err) {
 console.warn('Failed to fetch webhook diagnostics:', err);
 return null;
 }
}

/**
 * Dry-run or live test diagnose an arbitrary payload or raw email
 */
export async function testDiagnoseWebhookPayload(params: {
 payload?: any;
 rawEmail?: string;
 source?: string;
 saveLead?: boolean;
}): Promise<{
 success: boolean;
 status?: string;
 extracted?: any;
 saved?: boolean;
 savedLead?: any;
 fieldCheck?: {
 hasClientName: boolean;
 hasClientPhone: boolean;
 hasClientEmail: boolean;
 hasAddress: boolean;
 hasServiceNeeded: boolean;
 hasLeadFee: boolean;
 leadSource: string;
 };
 error?: string;
}> {
 try {
 const res = await fetch('/api/webhooks/diagnose', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(params),
 });
 const data = await res.json();
 if (params.saveLead) {
 await syncIncomingWebhookLeads();
 }
 return data;
 } catch (err: any) {
 return { success: false, error: err.message || 'Network diagnostic error.' };
 }
}

/**
 * Clear webhook activity logs
 */
export async function clearWebhookLogs(): Promise<boolean> {
 try {
 const res = await fetch('/api/webhooks/logs', { method: 'DELETE' });
 return res.ok;
 } catch (err) {
 console.error('Failed to clear webhook logs:', err);
 return false;
 }
}

/**
 * Run full end-to-end pipeline test across:
 * 1. Angi Email Parsing
 * 2. In-App CRM Storage
 * 3. Google Sheets Ingestion
 * 4. Houzz Pro / Zapier Dispatch
 */
export async function runFullPipelineTest(params?: {
 rawEmail?: string;
 source?: string;
 syncToSheets?: boolean;
 sendToHouzz?: boolean;
}): Promise<any> {
 try {
 const res = await fetch('/api/webhooks/test-pipeline', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(params || {}),
 });
 const data = await res.json();
 await syncIncomingWebhookLeads();
 return data;
 } catch (err: any) {
 return { success: false, error: err.message || 'Pipeline test failed.' };
 }
}


