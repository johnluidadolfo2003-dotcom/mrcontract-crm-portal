import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { subscribeDashboardUpdates } from './src/lib/dashboardUpdates.ts';
import { getDateTimeFormatter } from './src/lib/dateTimeFormatters.ts';
import { getPageWindow, usePaginatedList } from './src/components/ui/ListPagination.tsx';

const target = new EventTarget();
let refreshes = 0;
let updates = 0;
const unsubscribe = subscribeDashboardUpdates(target, () => updates++, () => updates++, () => refreshes++);
for (let i = 0; i < 100; i++) {
  target.dispatchEvent(new Event('new_leads_updated'));
  target.dispatchEvent(new Event('scheduled_clients_updated'));
}
assert.equal(updates, 200);
assert.equal(refreshes, 0, 'received data must not start another remote refresh');
target.dispatchEvent(new Event('dashboard_data_refresh'));
assert.equal(refreshes, 1, 'explicit mutations must still refresh data');
unsubscribe();
target.dispatchEvent(new Event('dashboard_data_refresh'));
assert.equal(refreshes, 1, 'navigation must clean up subscriptions');

const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' } as const;
const formatter = getDateTimeFormatter('en-CA', options);
for (let i = 0; i < 1000; i++) {
  assert.equal(getDateTimeFormatter('en-CA', { ...options }), formatter);
}
assert.equal(formatter.format(new Date('2026-10-01T03:59:59Z')), '2026-09-30');
assert.equal(formatter.format(new Date('2026-10-01T04:00:00Z')), '2026-10-01');

const records = Array.from({ length: 1023 }, (_, i) => i);
const visited: number[] = [];
for (let page = 1; page <= Math.ceil(records.length / 50); page++) {
  const window = getPageWindow(records.length, page);
  visited.push(...records.slice(window.start, window.end));
}
assert.deepEqual(visited, records, 'pagination must preserve every record exactly once');
assert.equal(getPageWindow(3, 9).page, 1, 'filtering must clamp an old page');
assert.equal(getPageWindow(0, 1).end, 0);
function ListFixture() {
  const { visibleItems } = usePaginatedList(records, 'ALL');
  return React.createElement('ul', null, visibleItems.map((id) => React.createElement('li', { key: id }, id)));
}
const markup = renderToStaticMarkup(React.createElement(ListFixture));
assert.equal((markup.match(/<li>/g) || []).length, 50, 'large lists must mount only the current page');

// The global New badge and active page consume one shared result notification.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'window', { configurable: true, value: target });
const { fetchNewLeads, updateNewLeadStatus } = await import('./src/lib/newLeads.ts');
let requests = 0;
let notifications = 0;
target.addEventListener('new_leads_updated', () => notifications++);
const lead = { id: 'lead-1', createdAt: '2026-10-01T12:00:00Z', clientName: 'Jane', clientPhone: '', clientEmail: '', address: '', leadSource: 'Thumbtack', serviceNeeded: '', status: 'New', notes: '' };
globalThis.fetch = async () => {
  requests++;
  return Response.json({ success: true, leads: [lead] });
};
try {
  await Promise.all([fetchNewLeads(), fetchNewLeads()]);
  assert.equal(requests, 1, 'concurrent New requests must be coalesced');
  await fetchNewLeads();
  assert.equal(notifications, 1, 'unchanged polling results must not rerender the app');
  updateNewLeadStatus('lead-1', 'Meeting Scheduled');
  assert.equal(notifications, 2, 'actual status changes must still notify the app');
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
}
console.log('CRM refresh, pagination, and formatter performance regressions passed.');
