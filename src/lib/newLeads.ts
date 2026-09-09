import { AddLeadPayload } from '../components/AddLeadConfirmModal';

export interface NewLeadRecord {
 id: string;
 createdAt: string;
 clientName: string;
 clientPhone: string;
 clientEmail: string;
 address: string;
 leadSource: string;
 serviceNeeded: string;
 status: string;
 notes: string;
 leadFee?: string;
 rowIndex?: number;
 statusColIndex?: number;
 isWebhookLead?: boolean;
 webhookSource?: string;
 sheetSynced?: boolean;
 houzzResult?: string;
 houzzStatus?: string;
 houzzError?: string | null;
 houzzStatusCode?: number | null;
 houzzAttemptAt?: string;
 rawPayload?: any;
}

const EVENT_KEY = 'new_leads_updated';
const LEGACY_STORAGE_KEY = 'mr_contract_new_leads_v1';
const MIGRATION_KEY = 'mrcontract_new_leads_sheet_migration_v1';
let canonicalLeads: NewLeadRecord[] = [];
let requestInFlight: Promise<NewLeadRecord[]> | null = null;

function publish(list: NewLeadRecord[]): NewLeadRecord[] {
 canonicalLeads = [...list].sort((a, b) =>
  new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
 );
 window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: canonicalLeads }));
 return canonicalLeads;
}

export function getNewLeads(): NewLeadRecord[] {
 return canonicalLeads;
}

export async function fetchNewLeads(forceFresh = false): Promise<NewLeadRecord[]> {
 if (requestInFlight && !forceFresh) return requestInFlight;
 requestInFlight = (async () => {
  const res = await fetch(`/api/leads?status=New${forceFresh ? '&force=1' : ''}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !Array.isArray(data.leads)) {
   throw new Error(data.error || `Unable to load new leads (HTTP ${res.status}).`);
  }
  return publish(data.leads);
 })();
 try {
  return await requestInFlight;
 } finally {
  requestInFlight = null;
 }
}

export async function migrateLegacyNewLeads(): Promise<{ migrated: number; skipped: number }> {
 if (localStorage.getItem(MIGRATION_KEY) === 'complete') return { migrated: 0, skipped: 0 };
 let legacy: NewLeadRecord[] = [];
 try {
  const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
  if (Array.isArray(parsed)) legacy = parsed.filter((l) => l && l.clientName);
 } catch {}
 if (!legacy.length) {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.setItem(MIGRATION_KEY, 'complete');
  return { migrated: 0, skipped: 0 };
 }
 const res = await fetch('/api/leads/migrate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ leads: legacy }),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.success) throw new Error(data.error || 'Legacy lead migration failed.');
 await fetchNewLeads(true);
 localStorage.removeItem(LEGACY_STORAGE_KEY);
 localStorage.setItem(MIGRATION_KEY, 'complete');
 return { migrated: data.migrated || 0, skipped: data.skipped || 0 };
}

export async function addNewLead(payload: AddLeadPayload): Promise<NewLeadRecord> {
 const res = await fetch('/api/leads/manual', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save lead to Google Sheets.');
 await fetchNewLeads(true);
 return data.lead;
}

export async function deleteNewLead(id: string, _lead?: Partial<NewLeadRecord>): Promise<void> {
 if (id.startsWith('wh_lead_')) {
  await fetch(`/api/webhooks/incoming-leads/${encodeURIComponent(id)}`, {
   method: 'PATCH',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ status: 'Deleted' }),
  }).catch(() => null);
 }
 publish(canonicalLeads.filter((lead) => lead.id !== id));
}

export function updateNewLeadStatus(id: string, status: string): void {
 publish(canonicalLeads.map((lead) => lead.id === id ? { ...lead, status } : lead)
  .filter((lead) => lead.status.toLowerCase() === 'new'));
}

export function updateNewLeadInfo(id: string, updates: Partial<NewLeadRecord>): void {
 publish(canonicalLeads.map((lead) => lead.id === id ? { ...lead, ...updates } : lead));
}
