import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_LEAD_SOURCES, mergeLeadSources, existingSheetTabs, normalizeLeadSource } from './src/lib/leadSources.ts';
import { DEFAULT_CONFIG, loadAppConfig, fetchAndSyncServerConfig, saveAppConfig } from './src/config.ts';
import { AddLeadForm } from './src/components/AddLeadForm.tsx';
import { AppointmentForm } from './src/components/AppointmentForm.tsx';
import { buildEventPayload, parseCalendarEventToFormData } from './src/lib/calendar.ts';
import { constructHouzzPayload } from './server/houzzDelivery.ts';
import { mapFormDataToSheetRow } from './src/lib/sheets.ts';

const previousStorage = globalThis.localStorage;
const previousFetch = globalThis.fetch;
const values = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => { values.set(key, value); },
  removeItem: (key) => { values.delete(key); },
  clear: () => values.clear(), key: (index) => [...values.keys()][index] || null,
  get length() { return values.size; },
};
try {
  const oldSources = DEFAULT_LEAD_SOURCES.filter((source) => !['Chimney Fixers', 'Direct from Daniel', 'Truck Sign'].includes(source));
  values.set('masonry_appointment_config', JSON.stringify({ leadSources: [...oldSources, 'Roof R', 'Custom Partner'], theme: 'dark' }));
  const loaded = loadAppConfig();
  for (const source of ['Chimney Fixers', 'Direct from Daniel', 'Truck Sign', 'Custom Partner']) assert.ok(loaded.leadSources.includes(source));
  let posted: any;
  globalThis.fetch = async (_url, options) => {
    if (options?.method === 'POST') { posted = JSON.parse(String(options.body)); return Response.json({ success: true }); }
    return Response.json({ leadSources: [...oldSources, 'Roof R', 'Office Referral'] });
  };
  const synced = await fetchAndSyncServerConfig();
  for (const source of ['Chimney Fixers', 'Direct from Daniel', 'Truck Sign', 'Office Referral']) assert.ok(synced.leadSources.includes(source), 'Old server settings cannot remove a standard source');
  saveAppConfig({ ...synced, leadSources: oldSources });
  assert.ok(posted.leadSources.includes('Chimney Fixers'));
  assert.ok(posted.leadSources.includes('Direct from Daniel'));
  assert.ok(!posted.leadSources.includes('Roof R'));
  assert.ok(posted.leadSources.includes('Truck Sign'));
  assert.equal(mergeLeadSources(['truck sign', 'TRUCK SIGN', 'Chimney_Fixers', 'Direct_from_Daniel', 'Roof R', 'Summary', 'Zapier', 123]).filter((source) => source === 'Truck Sign').length, 1);
  assert.equal(normalizeLeadSource(' chimney-fixers '), 'Chimney Fixers');
  assert.equal(normalizeLeadSource(' direct-from-daniel '), 'Direct from Daniel');
  assert.equal(normalizeLeadSource(' roof-r '), 'Other');
  assert.ok(!mergeLeadSources(['Roof R']).includes('Roof R'));
  assert.deepEqual(existingSheetTabs(mergeLeadSources(), ['Angi', 'Thumbtack', 'Summary']), ['Angi', 'Thumbtack'], 'Missing new tabs must not break existing batch ranges');
  assert.deepEqual(existingSheetTabs(['truck sign', 'Truck Sign', 'Chimney Fixers'], ['Truck Sign', 'Chimney Fixers']), ['Truck Sign', 'Chimney Fixers']);

  // Real forms must expose the new options even with a pre-update config prop.
  const config = { ...DEFAULT_CONFIG, leadSources: oldSources };
  const addLeadMarkup = renderToStaticMarkup(React.createElement(AddLeadForm, { config, onSubmitLead: async () => {}, isSubmitting: false }));
  const appointmentMarkup = renderToStaticMarkup(React.createElement(AppointmentForm, { config, onSubmit: () => {}, isSubmitting: false }));
  for (const source of ['Chimney Fixers', 'Direct from Daniel', 'Truck Sign']) {
    assert.ok(addLeadMarkup.includes(`value="${source}"`));
    assert.ok(appointmentMarkup.includes(`value="${source}"`));
    const form: any = { clientName: 'Example Customer', clientPhone: '2155550199', clientEmail: '', address: '1 Main Street', leadSource: source, serviceNeeded: 'Chimney repair', leadType: 'Direct', status: 'New', appointmentDate: '2026-10-21', startTime: '10:00', endTime: '11:00', salespersonCode: 'DG', notes: '' };
    const payload = buildEventPayload(form, config);
    assert.ok(payload.description?.includes(`LEAD SOURCE: ${source}`));
    assert.equal(parseCalendarEventToFormData(payload as any, config).formData.leadSource, source);
    assert.equal(constructHouzzPayload(`test_${source}`, form).leadSource, source);
    const row = mapFormDataToSheetRow(['Date', 'Client Name', 'Phone', 'Email', 'Address', 'Service', 'Lead Fee', 'Status', 'Lead Source'], form);
    assert.equal(row[8], source);
  }
  console.log('Lead source upgrade, stale server config, real forms, missing Sheet tabs, Calendar, Sheets, and Houzz tests passed.');
} finally {
  globalThis.fetch = previousFetch;
  if (previousStorage) globalThis.localStorage = previousStorage;
  else delete (globalThis as any).localStorage;
}
