import assert from 'node:assert/strict';
import { currentAngiMessage, extractAngiLabeledFields, normalizeAngiEmailTextForParsing } from './server/angiEmailParser.ts';

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

const replyWithOlderLead = `You have a new lead!\nInstall a Pre-Fabricated Fireplace Unit (Gas)\nCustomer Information\nAlex New\n(412) 996-6255\nalex@customer.test\n215 Oak Drive, Pittsburgh, PA 15220\n\nOn Mon, Sep 28, 2026 at 11:29 PM Angi <no-reply@angi.com> wrote:\n> You have a new lead!\n> Repair a Pre-Fabricated Fireplace Unit (Gas)\n> Customer Information\n> Bailey Old\n> (724) 561-5625\n> bailey@customer.test`;
const current = currentAngiMessage(replyWithOlderLead);
assert.match(current, /Alex New/);
assert.doesNotMatch(current, /Bailey Old/);
assert.equal(currentAngiMessage('You have a new lead!\nCustomer Information\nAlex New'), 'You have a new lead!\nCustomer Information\nAlex New');

console.log('Angi flattened-email parser tests passed.');

const { angiEmailToText } = await import('./server/angiEmailParser.ts');
const { selectLeadEmailBody, incomingLeadIdentity } = await import('./server/angiIntake.ts');
const htmlReply = '<div>Customer Name: Alex New</div><div>Phone: 412-555-0199</div><div>On Tuesday Angi wrote:</div><div>Customer Name: Bailey Old</div>';
assert.doesNotMatch(currentAngiMessage(htmlReply), /Bailey Old/);
assert.equal(extractAngiLabeledFields(currentAngiMessage(htmlReply)).clientName, 'Alex New');
assert.equal(angiEmailToText('D&#39;Angelo &amp; Sons&nbsp;'), "D'Angelo & Sons ");
const completeHtml = '<p>Customer Name: Alex New</p><p>Phone: 412-555-0199</p>';
assert.equal(selectLeadEmailBody({ body_plain: 'You have a new lead', body_html: completeHtml }), completeHtml);
assert.equal(selectLeadEmailBody({ snippet: 'truncated', bodyPlain: 'Customer Name: Alex New' }), 'Customer Name: Alex New');
const first = { leadSource: 'Angi', clientName: 'First Client', clientPhone: '4125550199', rawPayload: { id: 'shared-thread' } };
const second = { ...first, clientName: 'Second Client', clientPhone: '7245550199' };
assert.notEqual(incomingLeadIdentity(first), incomingLeadIdentity(second), 'A reply with a new customer must not reuse the first lead ID');
assert.equal(incomingLeadIdentity(first), incomingLeadIdentity(structuredClone(first)), 'Retry must preserve the lead ID');
console.log('Angi HTML replies, full body selection, and message identity tests passed.');

const headerEmail = '\nFrom: Angi <no-reply@angi.com>\nCustomer Name: Alex New\nPhone: 412-555-0199';
assert.match(currentAngiMessage(headerEmail), /Alex New/);
