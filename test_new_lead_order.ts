import assert from 'node:assert/strict';
import { compareNewestLeads } from './src/lib/newLeadOrder.ts';

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

console.log('New lead ordering tests passed.');
