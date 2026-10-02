import assert from 'node:assert/strict';
import { canonicalContactKey, reconcileIncomingLeadStatus } from './server/leadStatusReconciliation.ts';

const incoming = [
  { id: 'thumbtack', clientName: 'Jane', clientPhone: '+1 (412) 555-0100', leadSource: 'Thumbtack', status: 'New', notes: 'Keep notes' },
  { id: 'other-source', clientName: 'Jane', clientPhone: '4125550100', leadSource: 'Angi', status: 'New' },
  { id: 'other-contact', clientName: 'Bob', clientPhone: '4125550101', leadSource: 'Thumbtack', status: 'New' },
];
const scheduled = { clientName: 'Jane', clientPhone: '412-555-0100', leadSource: 'Thumbtack' };
const updated = reconcileIncomingLeadStatus(incoming, scheduled, 'Meeting Scheduled');
assert.equal(updated[0].status, 'Meeting Scheduled');
assert.equal(updated[0].notes, 'Keep notes');
assert.equal(updated[0].id, 'thumbtack');
assert.equal(updated[1].status, 'New');
assert.equal(updated[2].status, 'New');
assert.equal(incoming[0].status, 'New', 'reconciliation must not mutate its input');

// The Sheet contains this contact with a non-New status. A stale local copy
// must not reappear as a newly received lead during the next refresh.
const sheetKeys = new Set([scheduled].map(canonicalContactKey));
assert.equal(sheetKeys.has(canonicalContactKey(incoming[0])), true);
assert.equal(sheetKeys.has(canonicalContactKey(incoming[2])), false);
assert.equal(canonicalContactKey({ clientEmail: 'Jane@EXAMPLE.com' }), 'email_jane@example.com');
assert.equal(canonicalContactKey({ clientName: ' Jane ' }), 'name_jane');
assert.deepEqual(reconcileIncomingLeadStatus(incoming, {}, 'Meeting Scheduled'), incoming);
console.log('Lead status reconciliation tests passed.');
