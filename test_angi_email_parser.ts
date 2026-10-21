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

const { extractFromEmailText } = await import('./server/angiEmailParser.ts');
const { preferCurrentAngiCustomer, expandAngiDelivery, processAngiDelivery } = await import('./server/angiIntake.ts');
// Synthetic version of the screenshot's Angi notification card; no real clients.
const modernCard = `<h1>You have a new lead!</h1><h2>Repair an Asphalt Shingle Roof</h2><span>Customer Information</span><a href="https://example.test/client">Dana Example</a><a href="tel:2155550199">(215) 555-0199</a><p>123 Example Road, Pittsburgh, PA 15220</p>`;
const modern = extractFromEmailText(modernCard);
assert.equal(modern.clientName, 'Dana Example');
assert.equal(modern.clientPhone, '(215) 555-0199');
assert.equal(modern.serviceNeeded, 'Repair an Asphalt Shingle Roof');
assert.match(modern.address, /123 Example Road/);
const silentHtmlQuote = modernCard + '<div class="gmail_quote"><h3>Customer Information</h3><p>Older Person</p><p>724-555-0188</p></div>';
assert.doesNotMatch(currentAngiMessage(silentHtmlQuote), /Older Person/);
assert.equal(extractFromEmailText(silentHtmlQuote).clientName, 'Dana Example');
assert.equal(extractFromEmailText('Thanks, I will call. <blockquote type="cite">' + modernCard + '</blockquote>').clientName, '', 'An ordinary reply must not recreate its quoted lead');
assert.equal(selectLeadEmailBody({ rawEmail: 'You have a new lead!\nCustomer Information', body_html: modernCard }), modernCard, 'A truncated body with a header must not win over the complete card');
assert.equal(extractFromEmailText(modernCard.replace('Dana Example', 'Angie Example')).clientName, 'Angie Example');
assert.equal(extractFromEmailText('To: info@mrcontract.us\n' + modernCard).clientEmail, '', 'The receiving company address is not the customer email');
assert.equal(extractFromEmailText('<p>Customer Name:</p><p>Dana Example</p><p>Phone:</p><p>215-555-0199</p>').clientName, 'Dana Example');

const stale = { clientName: 'Older Person', clientPhone: '7245550188', clientEmail: 'old@example.test', leadSource: 'Angi', serviceNeeded: 'Old service', rawPayload: {} };
const preferred = preferCurrentAngiCustomer(stale, modern);
assert.equal(preferred.clientName, 'Dana Example');
assert.equal(preferred.clientPhone, modern.clientPhone);
assert.equal(preferred.clientEmail, '', 'Missing current fields must not inherit a different customer');
assert.equal(preferred.serviceNeeded, 'Repair an Asphalt Shingle Roof');
assert.equal(preferCurrentAngiCustomer({ ...stale, leadSource: 'Thumbtack' }, modern).clientName, 'Older Person');

const secondModern = modernCard.replaceAll('Dana Example', 'Alex Example').replaceAll('2155550199', '4125550188').replaceAll('(215) 555-0199', '(412) 555-0188');
const messages = [{ id: 'old-message', rawEmail: modernCard }, { id: 'new-message', rawEmail: secondModern }];
assert.deepEqual(expandAngiDelivery({ threadId: 'same-thread', messageId: 'new-message', messages }), [{ ...messages[1], messageId: 'new-message' }]);
assert.throws(() => expandAngiDelivery({ threadId: 'same-thread', messages }), /newly received message ID/, 'Never backfill a whole thread implicitly');
const encoded = Buffer.from(modernCard).toString('base64url');
assert.equal(selectLeadEmailBody({ payload: { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: encoded } }] } }), modernCard);
const seenNames: string[] = [];
const failures: string[] = [];
const result = await processAngiDelivery(messages, async (message) => {
  const parsed = extractFromEmailText(selectLeadEmailBody(message));
  seenNames.push(parsed.clientName);
  return { success: true, leadId: incomingLeadIdentity({ ...parsed, leadSource: 'Angi', rawPayload: message }) };
}, (_phase, _status, error) => failures.push(error));
assert.equal(result.status, 200);
assert.deepEqual(seenNames, ['Dana Example', 'Alex Example'], 'Process every delivered item, not just the first');
assert.notEqual(result.body.results[0].leadId, result.body.results[1].leadId);
const partial = await processAngiDelivery(messages, async (message) => {
  if (message.id === 'new-message') throw Object.assign(new Error('Sheets unavailable'), { phase: 'sheets', status: 503 });
  return { success: true };
}, (_phase, _status, error) => failures.push(error));
assert.equal(partial.status, 503, 'A partly failed batch must be retryable, not acknowledged as complete');
assert.equal(partial.body.results[0].success, true);
assert.deepEqual(failures, ['Sheets unavailable']);
console.log('Angi screenshot-style cards, quote-only replies, stale mapping, Gmail message selection, MIME, and batch processing passed.');

const { assertCurrentAngiLeadEmail } = await import('./server/angiIntake.ts');
assert.throws(() => assertCurrentAngiLeadEmail({ rawEmail: 'Thanks <blockquote>' + modernCard + '</blockquote>', ...stale }, {}, 'Thanks <blockquote>' + modernCard + '</blockquote>'), /no new Angi customer notification/);
assert.doesNotThrow(() => assertCurrentAngiLeadEmail({ rawEmail: modernCard }, {}, modernCard));
assert.doesNotThrow(() => assertCurrentAngiLeadEmail({ clientName: 'Structured Client', clientPhone: '2155550199' }, {}, ''));

// Failure visibility must not persist raw email content or create any lead.
const fs = await import('node:fs');
const os = await import('node:os');
const path = await import('node:path');
const originalCwd = process.cwd();
const logDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'angi-intake-log-'));
process.chdir(logDirectory);
try {
  const { recordAngiIntakeFailure } = await import('./server/angiIntakeLog.ts');
  recordAngiIntakeFailure('extraction', 422, 'Customer name missing; token=do-not-save-this');
  const logs = JSON.parse(fs.readFileSync(path.join(logDirectory, 'data/webhook_logs.json'), 'utf8'));
  assert.equal(logs[0].success, false);
  assert.equal(logs[0].phase, 'extraction');
  assert.equal(logs[0].statusCode, 422);
  assert.doesNotMatch(logs[0].error, /do-not-save-this/);
  assert.equal(fs.existsSync(path.join(logDirectory, 'data/incoming_leads.json')), false);
  console.log('Angi failure diagnostics passed without creating leads.');
} finally {
  process.chdir(originalCwd);
  fs.rmSync(logDirectory, { recursive: true, force: true });
}
