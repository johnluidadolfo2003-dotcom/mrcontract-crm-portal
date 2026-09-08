import { AddLeadPayload } from '../components/AddLeadConfirmModal';
import { AppointmentFormData } from '../types';
import { isLeadSourceTab } from '../config';
import {
 deleteIncomingWebhookLead,
 updateIncomingWebhookLead,
 isExampleWebhookLead,
} from './webhooks';

export interface NewLeadRecord {
 id: string;
 createdAt: string;
 clientName: string;
 clientPhone: string;
 clientEmail: string;
 address: string;
 leadSource: string;
 serviceNeeded: string;
 status: string; // 'New'
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

const STORAGE_KEY = 'mr_contract_new_leads_v1';
const EVENT_KEY = 'new_leads_updated';

export function getNewLeads(): NewLeadRecord[] {
 try {
 const nonNewKeys = new Set<string>();
 const spreadsheetNewLeads: NewLeadRecord[] = [];

 const normalizeLeadKey = (name?: string, phone?: string, email?: string) => {
 const cleanPhone = (phone || '').replace(/\D/g, '');
 if (cleanPhone.length >= 7) return `phone_${cleanPhone}`;
 const cleanEmail = (email || '').trim().toLowerCase();
 if (cleanEmail.includes('@')) return `email_${cleanEmail}`;
 return `name_${(name || '').trim().toLowerCase()}`;
 };

 const seenNewLeadIds = new Set<string>();
 for (let i = 0; i < localStorage.length; i++) {
 const key = localStorage.key(i);
 if (key && key.startsWith('mrcontract_cache_')) {
 const lowerKey = key.toLowerCase();
 if (lowerKey.includes('summary') || lowerKey.includes('zapier')) {
 continue;
 }

 try {
 const cacheRaw = localStorage.getItem(key);
 if (cacheRaw) {
 const data = JSON.parse(cacheRaw);
 if (data && Array.isArray(data.rows)) {
 data.rows.forEach((r: any) => {
 if (r && r.clientName && !r.clientName.toLowerCase().startsWith('unnamed')) {
 const tabSource = r.tabName || r.leadSource || '';
 if (tabSource && !isLeadSourceTab(tabSource)) {
 return;
 }

 const stat = (r.status || '').trim().toLowerCase();
 const rKey = normalizeLeadKey(r.clientName, r.clientPhone, r.clientEmail);
 const altNameKey = `name_${(r.clientName || '').trim().toLowerCase()}`;
 
 const isNew = !stat || stat === 'new' || stat === 'new lead' || stat === 'active' || stat === 'interested' || stat === 'uncontacted';
 if (!isNew) {
 nonNewKeys.add(rKey);
 nonNewKeys.add(altNameKey);
 } else {
 const resolvedSource = isLeadSourceTab(r.leadSource)
 ? r.leadSource
 : isLeadSourceTab(r.tabName)
 ? r.tabName
 : 'Angi';

 const leadId = `sync_new_${r.rowIndex || Date.now()}_${r.clientName.replace(/\s+/g, '')}`;
 if (seenNewLeadIds.has(leadId)) {
 return;
 }
 seenNewLeadIds.add(leadId);

 const leadRecord: NewLeadRecord = {
 id: leadId,
 createdAt: r.timestamp || new Date().toISOString(),
 clientName: r.clientName,
 clientPhone: r.clientPhone || '',
 clientEmail: r.clientEmail || '',
 address: r.address || '',
 leadSource: resolvedSource,
 serviceNeeded: r.serviceNeeded || r.leadType || '',
 status: r.status || 'New',
 notes: r.notes || '',
 leadFee: r.leadFee,
 rowIndex: r.rowIndex,
 statusColIndex: r.statusColIndex,
 };
 if (!isExampleWebhookLead(leadRecord)) {
 spreadsheetNewLeads.push(leadRecord);
 }
 }
 }
 });
 }
 }
 } catch (e) {}
 }
 }

 const raw = localStorage.getItem(STORAGE_KEY);
 let manualLeads: NewLeadRecord[] = [];
 if (raw) {
 try {
 const items = JSON.parse(raw);
 if (Array.isArray(items)) {
 // Filter out any test leads or test web forms or examples
 const cleanedItems = items.filter((item) => {
 if (!item || !item.clientName) return false;
 if (isExampleWebhookLead(item)) return false;
 const nameLower = item.clientName.trim().toLowerCase();
 if (
 nameLower === 'test' ||
 nameLower === 'test 1' ||
 nameLower === 'test test' ||
 nameLower === 'test web form' ||
 nameLower.includes('sample client') ||
 nameLower.startsWith('test ')
 ) {
 return false;
 }
 if (item.leadSource && !isLeadSourceTab(item.leadSource)) return false;
 // A lead explicitly added through the form remains authoritative in New
 // Leads until its own status is changed. Cached sheet history must not hide it.
 return true;
 });
 if (cleanedItems.length !== items.length) {
 localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedItems));
 }
 manualLeads = cleanedItems;
 }
 } catch (e) {}
 }

 // Load cached incoming webhook leads from server
 let webhookLeads: NewLeadRecord[] = [];
 try {
 const whRaw = localStorage.getItem('mrcontract_cached_webhook_leads');
 if (whRaw) {
 const whItems = JSON.parse(whRaw);
 if (Array.isArray(whItems)) {
 const nonExampleItems = whItems.filter((item: any) => item && !isExampleWebhookLead(item));
 if (nonExampleItems.length !== whItems.length) {
 localStorage.setItem('mrcontract_cached_webhook_leads', JSON.stringify(nonExampleItems));
 }
 webhookLeads = nonExampleItems.map((item: any) => ({
 id: item.id,
 createdAt: item.createdAt || new Date().toISOString(),
 clientName: item.clientName,
 clientPhone: item.clientPhone || '',
 clientEmail: item.clientEmail || '',
 address: item.address || '',
 leadSource: item.leadSource || 'Angi',
 serviceNeeded: item.serviceNeeded || '',
 status: item.status || 'New',
 notes: item.notes || '',
 carrier: item.carrier || 'Direct',
 leadFee: item.leadFee || '',
 isWebhookLead: true,
 webhookSource: item.webhookSource || item.leadSource || 'Angi',
 sheetSynced: item.sheetSynced,
 houzzResult: item.houzzResult,
 houzzStatus: item.houzzStatus,
 houzzError: item.houzzError,
 houzzStatusCode: item.houzzStatusCode,
 houzzAttemptAt: item.houzzAttemptAt,
 rawPayload: item.rawPayload,
 }));
 }
 }
 } catch (e) {}

 // Load dismissed synced leads list to ensure they don't show up again
 let dismissedSyncLeads: string[] = [];
 try {
 const dismissedRaw = localStorage.getItem('mrcontract_dismissed_sync_leads');
 if (dismissedRaw) {
 dismissedSyncLeads = JSON.parse(dismissedRaw);
 }
 } catch (e) {}

 const finalLeads: NewLeadRecord[] = [];
 const syncedClientKeys = new Set<string>();
 const seenFinalIds = new Set<string>();

 // 1. Webhook incoming leads first (highest freshness)
 webhookLeads.forEach((val) => {
 if (dismissedSyncLeads.includes(val.id)) return;
 if (seenFinalIds.has(val.id)) return;
 if (isExampleWebhookLead(val)) return;
 const stat = (val.status || 'new').toLowerCase();
 if (stat !== 'new' && stat !== 'new lead' && stat !== 'active') return;

 seenFinalIds.add(val.id);
 finalLeads.push(val);
 const k = normalizeLeadKey(val.clientName, val.clientPhone, val.clientEmail);
 syncedClientKeys.add(k);
 const altK = `name_${(val.clientName || '').trim().toLowerCase()}`;
 syncedClientKeys.add(altK);
 });

 // 2. Synced spreadsheet leads (reverse so newest bottom rows appear first)
 const sortedSpreadsheetLeads = [...spreadsheetNewLeads].reverse();
 sortedSpreadsheetLeads.forEach((val) => {
 if (dismissedSyncLeads.includes(val.id)) return;
 if (seenFinalIds.has(val.id)) return;
 if (isExampleWebhookLead(val)) return;
 if (isLeadSourceTab(val.leadSource)) {
 seenFinalIds.add(val.id);
 finalLeads.push(val);
 const k = normalizeLeadKey(val.clientName, val.clientPhone, val.clientEmail);
 syncedClientKeys.add(k);
 const altK = `name_${(val.clientName || '').trim().toLowerCase()}`;
 syncedClientKeys.add(altK);
 }
 });

 // 3. Manual leads
 manualLeads.forEach((val) => {
 if (seenFinalIds.has(val.id)) return;
 if (isExampleWebhookLead(val)) return;
 const k = normalizeLeadKey(val.clientName, val.clientPhone, val.clientEmail);
 const altK = `name_${(val.clientName || '').trim().toLowerCase()}`;
 if (!nonNewKeys.has(k) && !nonNewKeys.has(altK) && !syncedClientKeys.has(k) && !syncedClientKeys.has(altK) && isLeadSourceTab(val.leadSource)) {
 seenFinalIds.add(val.id);
 finalLeads.push(val);
 }
 });

 const validNewLeads = finalLeads.filter((l) => isLeadSourceTab(l.leadSource));

 // Sort so newest leads are always first in the list
 validNewLeads.sort((a, b) => {
 const aTime = new Date(a.createdAt || 0).getTime();
 const bTime = new Date(b.createdAt || 0).getTime();
 if (!isNaN(aTime) && !isNaN(bTime) && bTime !== aTime && bTime > 0 && aTime > 0) {
 return bTime - aTime;
 }
 return (b.rowIndex || 0) - (a.rowIndex || 0);
 });

 return validNewLeads;
 } catch (e) {
 console.error('Error reading new leads:', e);
 return [];
 }
}

export function saveNewLeadsList(list: NewLeadRecord[]): void {
 try {
 localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
 window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: list }));
 } catch (e) {
 console.error('Error saving new leads:', e);
 }
}

export function addNewLead(payload: AddLeadPayload): NewLeadRecord {
 let manualLeads: NewLeadRecord[] = [];
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 if (raw) manualLeads = JSON.parse(raw);
 } catch (e) {}
 if (!Array.isArray(manualLeads)) manualLeads = [];

 const newRecord: NewLeadRecord = {
 id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
 createdAt: new Date().toISOString(),
 clientName: payload.clientName || 'New Client',
 clientPhone: payload.clientPhone || '',
 clientEmail: payload.clientEmail || '',
 address: payload.address || '',
 leadSource: payload.leadSource || 'Angi',
 serviceNeeded: payload.serviceNeeded || '',
 status: 'New', // ALWAYS 'New' as requested
 notes: '',
 leadFee: payload.leadFee,
 };
 manualLeads.unshift(newRecord);
 saveNewLeadsList(manualLeads);
 return newRecord;
}

export function deleteNewLead(id: string): void {
 if (id.startsWith('wh_lead_')) {
 deleteIncomingWebhookLead(id);
 return;
 }
 if (id.startsWith('lead_')) {
 let manualLeads: NewLeadRecord[] = [];
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 if (raw) manualLeads = JSON.parse(raw);
 } catch (e) {}
 if (Array.isArray(manualLeads)) {
 const updated = manualLeads.filter((l) => l.id !== id);
 saveNewLeadsList(updated);
 }
 } else {
 try {
 const dismissedRaw = localStorage.getItem('mrcontract_dismissed_sync_leads') || '[]';
 const dismissed = JSON.parse(dismissedRaw);
 if (Array.isArray(dismissed)) {
 if (!dismissed.includes(id)) {
 dismissed.push(id);
 localStorage.setItem('mrcontract_dismissed_sync_leads', JSON.stringify(dismissed));
 }
 }
 } catch (e) {}
 window.dispatchEvent(new CustomEvent(EVENT_KEY));
 }
}

export function updateNewLeadStatus(id: string, status: string): void {
 if (id.startsWith('wh_lead_')) {
 updateIncomingWebhookLead(id, { status });
 return;
 }
 if (id.startsWith('lead_')) {
 let manualLeads: NewLeadRecord[] = [];
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 if (raw) manualLeads = JSON.parse(raw);
 } catch (e) {}
 if (Array.isArray(manualLeads)) {
 const updated = manualLeads.map((l) => (l.id === id ? { ...l, status } : l));
 saveNewLeadsList(updated);
 }
 } else {
 window.dispatchEvent(new CustomEvent(EVENT_KEY));
 }
}

export function updateNewLeadInfo(id: string, updates: Partial<NewLeadRecord>): void {
 if (id.startsWith('wh_lead_')) {
 updateIncomingWebhookLead(id, updates);
 return;
 }
 if (id.startsWith('lead_')) {
 let manualLeads: NewLeadRecord[] = [];
 try {
 const raw = localStorage.getItem(STORAGE_KEY);
 if (raw) manualLeads = JSON.parse(raw);
 } catch (e) {}
 if (Array.isArray(manualLeads)) {
 const updated = manualLeads.map((l) => (l.id === id ? { ...l, ...updates } : l));
 saveNewLeadsList(updated);
 }
 } else {
 try {
 for (let i = 0; i < localStorage.length; i++) {
 const key = localStorage.key(i);
 if (key && key.startsWith('mrcontract_cache_')) {
 try {
 const cacheRaw = localStorage.getItem(key);
 if (cacheRaw) {
 const data = JSON.parse(cacheRaw);
 if (data && Array.isArray(data.rows)) {
 let modified = false;
 data.rows = data.rows.map((r: any) => {
 const leadId = `sync_new_${r.rowIndex || Date.now()}_${(r.clientName || '').replace(/\s+/g, '')}`;
 if (leadId === id || (updates.rowIndex && r.rowIndex === updates.rowIndex)) {
 modified = true;
 return {
 ...r,
 clientName: updates.clientName !== undefined ? updates.clientName : r.clientName,
 clientPhone: updates.clientPhone !== undefined ? updates.clientPhone : r.clientPhone,
 clientEmail: updates.clientEmail !== undefined ? updates.clientEmail : r.clientEmail,
 address: updates.address !== undefined ? updates.address : r.address,
 serviceNeeded: updates.serviceNeeded !== undefined ? updates.serviceNeeded : r.serviceNeeded,
 leadType: updates.serviceNeeded !== undefined ? updates.serviceNeeded : r.leadType,
 leadSource: updates.leadSource !== undefined ? updates.leadSource : r.leadSource,
 status: updates.status !== undefined ? updates.status : r.status,
 leadFee: updates.leadFee !== undefined ? updates.leadFee : r.leadFee,
 notes: updates.notes !== undefined ? updates.notes : r.notes,
 };
 }
 return r;
 });
 if (modified) {
 localStorage.setItem(key, JSON.stringify(data));
 }
 }
 }
 } catch (e) {}
 }
 }
 } catch (e) {}
 window.dispatchEvent(new CustomEvent(EVENT_KEY));
 }
}
