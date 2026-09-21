import assert from 'node:assert/strict';
import { compareNewestLeads, wasLeadCreatedToday } from './src/lib/newLeadOrder.ts';

const ordered = [
  { id: 'older-sheet-row', newestOrder: 1_700_000_000_000, createdAt: '12/31/2099', rowIndex: 999 },
  { id: 'new-manual-lead', newestOrder: 1_800_000_000_000, createdAt: 'not-a-sheet-date', rowIndex: 2 },
].sort(compareNewestLeads);
assert.equal(ordered[0].id, 'new-manual-lead', 'server creation order must override ambiguous Sheet dates and row positions');

const isoOrdered = [
  { id: 'older', createdAt: '2026-09-21T10:00:00.000Z' },
  { id: 'newer', createdAt: '2026-09-21T11:00:00.000Z' },
].sort(compareNewestLeads);
assert.equal(isoOrdered[0].id, 'newer', 'ISO timestamps must sort newest first');

const tied = [
  { id: 'earlier-row', createdAt: '2026-09-21T11:00:00.000Z', rowIndex: 10 },
  { id: 'later-row', createdAt: '2026-09-21T11:00:00.000Z', rowIndex: 11 },
].sort(compareNewestLeads);
assert.equal(tied[0].id, 'later-row', 'newly appended Sheet rows must win exact timestamp ties');

const mixedSources = [
  { id: 'manual', newestOrder: 1_800_000_000_000, createdAt: '2026-09-21' },
  { id: 'automation', newestOrder: 1_800_000_000_001, createdAt: 'invalid' },
].sort(compareNewestLeads);
assert.equal(mixedSources[0].id, 'automation', 'manual and automated leads must share the same newest-first rule');


const businessNow = new Date('2026-09-22T02:30:00.000Z'); // Sep 21, 10:30 PM in New York
assert.equal(
  wasLeadCreatedToday(
    { createdAt: '', newestOrder: new Date('2026-09-21T20:15:00.000Z').getTime() },
    'America/New_York',
    businessNow
  ),
  true,
  'durable creation order must keep TODAY visible when the Sheet timestamp is missing'
);
assert.equal(
  wasLeadCreatedToday(
    { createdAt: 'invalid', newestOrder: new Date('2026-09-20T20:15:00.000Z').getTime() },
    'America/New_York',
    businessNow
  ),
  false,
  'TODAY must expire at midnight in the configured business timezone'
);
assert.equal(
  wasLeadCreatedToday({ createdAt: '9/21/2026 10:30:00 AM' }, 'America/New_York', businessNow),
  true,
  'Google Sheets calendar timestamps must be compared as business dates'
);

console.log('New lead ordering tests passed.');
