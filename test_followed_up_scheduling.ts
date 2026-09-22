import assert from 'node:assert/strict';
import {
  buildSheetLeadAppointmentPrefill,
  isFollowedUpStage,
} from './src/lib/leadScheduling.ts';

assert.equal(isFollowedUpStage('Followed Up'), true);
assert.equal(isFollowedUpStage('followed-up'), true);
assert.equal(isFollowedUpStage('3 day Follow Up'), false);
assert.equal(isFollowedUpStage('Meeting Scheduled'), false);

const prefill = buildSheetLeadAppointmentPrefill(
  {
    rowIndex: 27,
    tabName: 'Angi',
    statusColIndex: 8,
    clientName: 'Jane Client',
    clientPhone: '555-0100',
    clientEmail: 'jane@example.com',
    address: '10 Main St',
    leadSource: 'Angi',
    serviceNeeded: 'Roof Repair',
    leadFee: '$35',
    notes: 'Called customer',
    status: 'Followed Up',
    rawValues: [],
  },
  {
    today: '2026-09-22',
    selectedTab: 'ALL',
    defaultLeadSource: 'Direct',
    defaultLeadType: 'General',
  }
);

assert.equal(prefill.clientName, 'Jane Client');
assert.equal(prefill.status, 'Followed Up');
assert.equal(prefill.sourceRowIndex, 27);
assert.equal(prefill.sourceStatusColIndex, 8);
assert.equal(prefill.sourceTabName, 'Angi');
assert.equal(prefill.serviceNeeded, 'Roof Repair');
assert.equal(prefill.leadFee, '$35');

console.log('Followed Up scheduling tests passed.');
