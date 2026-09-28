import assert from 'node:assert/strict';
import { detectColumnMapping as detectServerColumns } from './server/sheetsService.ts';
import {
  detectColumnMapping as detectClientColumns,
  mapFormDataToSheetRow,
  parseSheetValuesToRecords,
} from './src/lib/sheets.ts';

const thumbtackHeaders = [
  'Date', 'Client Name', 'Phone Number', 'Email', 'Address',
  'Service Needed', 'Lead Fee', 'Status', 'Lead Category', 'Refund Status',
];

for (const mapping of [detectServerColumns(thumbtackHeaders), detectClientColumns(thumbtackHeaders)]) {
  assert.equal(mapping.nameCol, 1);
  assert.equal(mapping.statusCol, 7);
  assert.equal(mapping.sourceCol, -1);
  assert.equal(mapping.dateCol, -1);
}

const newRow = mapFormDataToSheetRow(thumbtackHeaders, {
  clientName: 'Sample Customer',
  clientPhone: '412-555-0100',
  serviceNeeded: 'Fireplace repair',
  leadSource: 'Thumbtack',
  appointmentDate: '2026-10-01',
} as any);
assert.equal(newRow[1], 'Sample Customer');
assert.equal(newRow[7], 'New');
assert.equal(newRow[8], ''); // Lead Category
assert.equal(newRow[9], ''); // Refund Status

const existingRow = ['09/28/2026', 'Sample Customer', '412-555-0100', '', '',
  'Fireplace repair', '', 'Followed Up', 'Thumbtack', '2026-10-01'];
const parsed = parseSheetValuesToRecords([[], [], [], thumbtackHeaders, existingRow], 'Thumbtack').rows[0];
assert.equal(parsed.leadSource, 'Thumbtack');
assert.equal(parsed.appointmentDate, ''); // Refund Status is not an appointment.

const explicitHeaders = [...thumbtackHeaders, 'Lead Source', 'Appointment Date'];
assert.equal(detectServerColumns(explicitHeaders).sourceCol, 10);
assert.equal(detectServerColumns(explicitHeaders).dateCol, 11);
assert.equal(detectClientColumns(explicitHeaders).sourceCol, 10);
assert.equal(detectClientColumns(explicitHeaders).dateCol, 11);

console.log('Sheet column mapping tests passed.');
