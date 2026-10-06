import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { dispatchLeadToHouzz as DispatchType } from './server/houzzDelivery.ts';

const oldCwd = process.cwd();
const originalStorage = globalThis.localStorage;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbtack-auto-'));
process.chdir(temporary);
try {
  const store = await import('./server/durableStore.ts');
  const { sendCompletedThumbtackDetails } = await import('./server/thumbtackHouzz.ts');
  const { dispatchLeadToHouzz, updateLeadHouzzState } = await import('./server/houzzDelivery.ts');
  const lead = { id: 'wh_lead_auto', leadSource: 'Thumbtack', clientName: 'Jane', clientPhone: '2155550123', address: '', serviceNeeded: 'Chimney repair' };
  store.safeWriteJsonFile('incoming_leads.json', [lead]);
  let sends = 0;
  let submitted: any;
  let release!: () => void;
  let complete!: () => void;
  const done = new Promise<void>((resolve) => complete = resolve);
  const dispatch: typeof DispatchType = async (params) => {
    try {
      return await dispatchLeadToHouzz({ ...params, customFetch: async (_url, options) => {
        sends++;
        submitted = JSON.parse(String(options?.body));
        await new Promise<void>((resolve) => release = resolve);
        return new Response('{}', { status: 200 });
      } });
    } finally { complete(); }
  };
  const url = 'https://hooks.zapier.com/hooks/catch/test/test';
  sendCompletedThumbtackDetails(lead, url, dispatch);
  assert.equal(sends, 0, 'Incomplete details must not send');
  sendCompletedThumbtackDetails({ ...lead, leadSource: 'Angi', address: '1 Main St' }, url, dispatch);
  assert.equal(sends, 0, 'Angi must retain its separate flow');
  const saved = { ...lead, clientName: 'Jane Updated', address: '1 Main St, Philadelphia, PA 19103' };
  const first = sendCompletedThumbtackDetails(saved, url, dispatch);
  assert.match(first.houzzStatus, /^Sending/);
  assert.equal(sends, 1);
  assert.equal(submitted.clientName, saved.clientName);
  assert.equal(submitted.address, saved.address);
  sendCompletedThumbtackDetails(saved, url, dispatch);
  assert.equal(sends, 1, 'Concurrent saves must not duplicate delivery');
  release();
  await done;
  assert.equal(store.getLeadMetadata(lead.id)?.houzzStatus, 'Accepted by Zapier');
  assert.equal(store.safeReadJsonFile<any[]>('incoming_leads.json', [])[0].houzzStatus, 'Accepted by Zapier');
  sendCompletedThumbtackDetails({ ...saved, houzzStatus: '' }, url, dispatch);
  assert.equal(sends, 1, 'Stale browser state must not reset acceptance');
  updateLeadHouzzState(lead.id, { activityStatus: 'Created in Houzz Pro', success: true });
  sendCompletedThumbtackDetails({ ...saved, notes: 'Later edit' }, url, dispatch);
  assert.equal(sends, 1, 'Editing a created lead must not create it again');

  // A spreadsheet editor can change the phone while retaining the webhook ID.
  const sheetId = 'sheet_Thumbtack_12';
  sendCompletedThumbtackDetails({ ...saved, id: sheetId, clientPhone: '2155550199', originalContact: lead, rowIndex: 12 }, url, dispatch);
  assert.equal(sends, 1);
  assert.equal(store.getLeadMetadata(sheetId)?.houzzLeadId, lead.id);
  assert.equal(store.safeReadJsonFile<any[]>('incoming_leads.json', [])[0].clientPhone, '2155550199');

  const failed = { ...saved, id: 'wh_lead_failure', clientEmail: 'jane@example.com', clientPhone: '' };
  store.safeWriteJsonFile('incoming_leads.json', [failed]);
  let failureDone!: () => void;
  const failureWait = new Promise<void>((resolve) => failureDone = resolve);
  sendCompletedThumbtackDetails(failed, url, async (params) => {
    try { return await dispatchLeadToHouzz({ ...params, customFetch: async () => new Response('{"error":"Rejected"}', { status: 500 }) }); }
    finally { failureDone(); }
  });
  await failureWait;
  assert.match(store.getLeadMetadata(failed.id)?.houzzStatus || '', /^Failed/);
  let retried!: () => void;
  const retryWait = new Promise<void>((resolve) => retried = resolve);
  sendCompletedThumbtackDetails(failed, url, async (params) => {
    try { return await dispatchLeadToHouzz({ ...params, customFetch: async () => new Response('{}', { status: 200 }) }); }
    finally { retried(); }
  });
  await retryWait;
  assert.equal(store.getLeadMetadata(failed.id)?.houzzStatus, 'Accepted by Zapier');
  const fastCallbackLead = { ...saved, id: 'wh_lead_fast_callback' };
  store.safeWriteJsonFile('incoming_leads.json', [fastCallbackLead]);
  await dispatchLeadToHouzz({ leadId: fastCallbackLead.id, payload: fastCallbackLead, webhookUrl: url, customFetch: async () => {
    updateLeadHouzzState(fastCallbackLead.id, { activityStatus: 'Created in Houzz Pro', success: true });
    return new Response('{}', { status: 200 });
  } });
  assert.equal(store.getLeadMetadata(fastCallbackLead.id)?.houzzStatus, 'Created in Houzz Pro', 'Fast callback must remain confirmed');

  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 };
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { LeadDrawer } = await import('./src/components/ui/LeadDrawer.tsx');
  const render = (houzzStatus: string) => renderToStaticMarkup(React.createElement(LeadDrawer, {
    lead: { ...saved, tabName: 'Thumbtack', rowIndex: 12, rawValues: [], houzzStatus } as any,
    isOpen: true, onClose: () => {}, onStatusChange: () => {}, statusOptions: ['New'],
  }));
  assert.match(render('Sending to Zapier'), /Sending automatically/);
  assert.match(render('Accepted by Zapier'), /Waiting for Houzz confirmation/);
  assert.match(render('Created in Houzz Pro'), /This lead is already in Houzz Pro/);
  assert.doesNotMatch(render(''), /<span>Create in Houzz Pro<\/span>/);
  assert.match(render('Failed to send to Zapier'), /Retry Houzz Pro/);
  console.log('Thumbtack automatic delivery: incomplete, saved fields, duplicate saves, confirmation, sheet alias, failure/retry passed.');
} finally {
  if (originalStorage) globalThis.localStorage = originalStorage;
  else delete (globalThis as any).localStorage;
  process.chdir(oldCwd);
  fs.rmSync(temporary, { recursive: true, force: true });
}
