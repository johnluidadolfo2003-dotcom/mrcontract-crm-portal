import assert from 'node:assert/strict';
import { extractAngiLabeledFields, normalizeAngiEmailTextForParsing } from './server/angiEmailParser.ts';

const flattenedEmail =
  'Dear Daniel, You\'ve been matched to a Repair a Brick or Stone Fireplace (Gas) Lead! ' +
  'Here is the customer\'s information for Job Number 329574609: ' +
  'Customer Name      : Jane Example Contact Time       : Any Phone - Anytime ' +
  'Daytime Phone      : 412-555-0199 Email              : jane@example.com ' +
  'Address            : 123 Test Drive, Pittsburgh, PA 15241 ' +
  'Click the link below to send an appointment with this customer: https://example.com/lead ' +
  'Description        : Repair a Brick or Stone Fireplace (Gas) ' +
  'Address            : Pittsburgh, PA 15241 Job Number         : 329574609 ' +
  'Comments           : Cap on chimney needs checked or replaced ' +
  'Are you creating a positive initial impression with your HomeAdvisor profile?';

const normalized = normalizeAngiEmailTextForParsing(flattenedEmail);
assert.match(normalized, /Customer Name\s*:\s*Jane Example\n/i);
assert.match(normalized, /Address\s*:\s*123 Test Drive, Pittsburgh, PA 15241\n/i);

const parsed = extractAngiLabeledFields(flattenedEmail);
assert.deepEqual(parsed, {
  clientName: 'Jane Example',
  clientPhone: '412-555-0199',
  clientEmail: 'jane@example.com',
  address: '123 Test Drive, Pittsburgh, PA 15241',
  serviceNeeded: 'Repair a Brick or Stone Fireplace (Gas)',
  jobNumber: '329574609',
  comments: 'Cap on chimney needs checked or replaced',
});

console.log('Angi flattened-email parser tests passed.');
