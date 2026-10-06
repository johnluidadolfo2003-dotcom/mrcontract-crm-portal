import * as store from './durableStore.ts';
import { canonicalContactKey } from './leadStatusReconciliation.ts';
import { dispatchLeadToHouzz, updateLeadHouzzState } from './houzzDelivery.ts';
import { hasHouzzRequiredInfo, hasHouzzSubmissionStarted } from '../src/lib/houzzReadiness.ts';

/** Called only after a CRM details save succeeds, never on webhook receipt. */
export function sendCompletedThumbtackDetails(
  saved: any,
  webhookUrl: string,
  dispatch = dispatchLeadToHouzz
): any {
  if (String(saved.leadSource || saved.tabName || '').trim().toLowerCase() !== 'thumbtack') return saved;
  const incoming = store.safeReadJsonFile<any[]>('incoming_leads.json', []);
  const aliasId = saved.id || `sheet_${encodeURIComponent(saved.tabName || 'Thumbtack')}_${saved.rowIndex}`;
  const knownId = store.getLeadMetadata(aliasId)?.houzzLeadId || aliasId;
  let index = incoming.findIndex((lead) => lead.id === knownId);
  if (index < 0 && (!saved.id || String(saved.id).startsWith('sheet_'))) {
    const key = canonicalContactKey(saved.originalContact || saved);
    const matches = incoming.map((lead, index) => ({ lead, index })).filter(({ lead }) =>
      String(lead.leadSource || lead.webhookSource || '').toLowerCase() === 'thumbtack' &&
      canonicalContactKey(lead) === key);
    if (matches.length === 1) index = matches[0].index;
  }
  const previous = index >= 0 ? incoming[index] : {};
  const id = previous.id || knownId;
  const metadata = store.getLeadMetadata(id) || {};
  const { originalContact, ...savedFields } = saved;
  const lead = { ...previous, ...savedFields, ...metadata, id };
  if (aliasId !== id) store.saveLeadMetadata({ leadId: aliasId, houzzLeadId: id });
  // Only saved client fields can replace the reviewed record. Delivery state is
  // owned by the server so an old browser snapshot cannot reset an accepted send.
  for (const field of ['clientName', 'clientPhone', 'clientEmail', 'address', 'serviceNeeded', 'leadType', 'leadFee', 'notes', 'status']) {
    if (saved[field] !== undefined) lead[field] = saved[field];
  }
  if (index >= 0) incoming[index] = lead;
  else incoming.push(lead);
  store.safeWriteJsonFile('incoming_leads.json', incoming);
  if (!hasHouzzRequiredInfo(lead) || hasHouzzSubmissionStarted(lead)) return lead;

  // Set the shared lock before yielding; concurrent saves cannot create two sends.
  updateLeadHouzzState(id, { activityStatus: 'Sending to Houzz Pro', attemptAt: new Date().toISOString() });
  void dispatch({ leadId: id, payload: lead, webhookUrl }).catch((error) => {
    updateLeadHouzzState(id, {
      activityStatus: 'Failed to send to Houzz Pro',
      error: String(error?.message || 'Delivery failed'),
      success: false,
    });
  });
  return { ...lead, houzzStatus: 'Sending to Houzz Pro' };
}
