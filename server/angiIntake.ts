import { createHash } from 'node:crypto';
import { currentAngiMessage, extractFromEmailText } from './angiEmailParser.ts';

export function selectLeadEmailBody(payload: any, nested: any = {}): string {
  const bodies = ['rawEmail', 'body_plain', 'bodyPlain', 'body-plain', 'Body Plain', 'body_html', 'bodyHtml', 'Body Html', 'body', 'stripped-text', 'email_body', 'text', 'content', 'message', 'plain', 'html'];
  // Also accept Gmail MIME message payloads. Decode text parts only; attachments
  // and the rest of a conversation are never treated as this notification.
  const mimeBodies: string[] = [];
  const readMime = (part: any, depth = 0) => {
    if (!part || depth > 12) return;
    if (['text/plain', 'text/html'].includes(part.mimeType) && typeof part.body?.data === 'string') {
      mimeBodies.push(Buffer.from(part.body.data, 'base64url').toString('utf8'));
    }
    if (Array.isArray(part.parts)) part.parts.forEach((child: any) => readMime(child, depth + 1));
  };
  readMime(payload?.payload);
  const candidates = [payload, nested, payload?.body].flatMap((object) => bodies.map((field) => object?.[field]))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0).concat(mimeBodies);
  // Prefer complete customer content over truncated/plain snippets. HTML and
  // plain alternatives must describe the current message, never its old quote.
  let best = candidates[0] || String(payload?.snippet || '');
  let bestScore = -1;
  for (const candidate of candidates) {
    const current = currentAngiMessage(candidate);
    const fields = extractFromEmailText(current);
    const score = (fields.clientName ? 100 : 0) + (fields.clientPhone ? 20 : 0) +
      (fields.clientEmail ? 10 : 0) + (fields.address ? 5 : 0) + (fields.serviceNeeded ? 1 : 0);
    if (score > bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

export function incomingLeadIdentity(parsed: any): string {
  const raw = parsed.rawPayload || {};
  const messageId = String(parsed.sourceEventId || parsed.eventId || parsed.leadId || raw.messageId || raw.message_id || raw.gmailMessageId || raw.eventId || raw.leadId || raw.id || '').trim();
  const customer = [parsed.leadSource, parsed.clientPhone, parsed.clientEmail, parsed.clientName, parsed.serviceNeeded]
    .map((value) => String(value || '').trim().toLowerCase());
  // Generic Zapier IDs may be conversation IDs. Different customers in that
  // conversation must never collide; identical webhook retries stay stable.
  const identity = String(parsed.leadSource || '').toLowerCase() === 'angi'
    ? JSON.stringify([messageId, ...customer])
    : messageId || JSON.stringify(customer);
  return `wh_lead_${createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
}

/** One Gmail message is one notification, even when it belongs to an old thread. */
export function expandAngiDelivery(body: any, depth = 0): any[] {
  if (depth > 5) throw Object.assign(new Error('Too many nested notification batches.'), { status: 422 });
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return [{ rawEmail: body }]; }
  }
  if (Array.isArray(body)) {
    if (!body.length || body.length > 25) throw Object.assign(new Error('Send 1–25 individual notifications per delivery.'), { status: 422 });
    const messages = body.flatMap((message) => expandAngiDelivery(message, depth + 1));
    if (messages.length > 25) throw Object.assign(new Error('Send at most 25 notifications per delivery.'), { status: 422 });
    return messages;
  }
  if (body && Array.isArray(body.messages)) {
    // A Gmail thread contains old notifications too. Never import that history
    // implicitly: require the ID of the newly triggered message.
    const messageId = String(body.messageId || body.message_id || body.gmailMessageId || '').trim();
    const selected = body.messages.find((message: any) => messageId && String(message.id || message.messageId) === messageId);
    if (!selected) throw Object.assign(new Error('A Gmail thread was supplied. Map the newly received message ID and its individual full body, not the whole conversation.'), { status: 422 });
    return [{ ...selected, messageId }];
  }
  return [body || {}];
}

/** Current Angi email fields outrank stale/sample fields from a Zapier mapping. */
export function preferCurrentAngiCustomer(parsed: any, email: any): any {
  if (String(parsed.leadSource).toLowerCase() !== 'angi' || !email?.clientName) return parsed;
  const sameCustomer = String(parsed.clientName || '').trim().toLowerCase() === String(email.clientName).trim().toLowerCase();
  const result = { ...parsed };
  for (const field of ['clientName', 'clientPhone', 'clientEmail', 'address', 'serviceNeeded', 'leadFee', 'notes']) {
    result[field] = email[field] || (sameCustomer ? parsed[field] : '') || '';
  }
  if (!result.serviceNeeded) result.serviceNeeded = 'Service details needed';
  return result;
}

export async function processAngiDelivery(
  body: any,
  processMessage: (message: any) => Promise<any>,
  recordFailure: (phase: string, status: number, error: string) => void
): Promise<{ status: number; body: any }> {
  const messages = expandAngiDelivery(body);
  const results: any[] = [];
  for (const message of messages) {
    try { results.push(await processMessage(message)); }
    catch (error: any) {
      recordFailure(error.phase || 'extraction', error.status || 500, error.message || 'Angi processing failed.');
      results.push({ success: false, status: error.status || 500, error: error.message, leadId: error.leadId });
    }
  }
  if (results.length === 1) return { status: results[0].success ? 200 : results[0].status, body: results[0] };
  const success = results.every((result) => result.success);
  return { status: success ? 200 : 503, body: { success, receivedCount: results.length, results } };
}

/** Do not turn an ordinary reply + stale mapped fields into a new customer. */
export function assertCurrentAngiLeadEmail(body: any, nested: any, emailBody: string): void {
  const fields = ['rawEmail', 'body_plain', 'bodyPlain', 'body-plain', 'Body Plain', 'body_html', 'bodyHtml', 'Body Html', 'email_body'];
  const isEmail = fields.some((field) => typeof body?.[field] === 'string' || typeof nested?.[field] === 'string') || Boolean(body?.payload?.mimeType);
  if (!isEmail || !emailBody) return;
  const current = currentAngiMessage(emailBody);
  const parsed = extractFromEmailText(current);
  const notification = /you have a new lead|you['’]ve been matched|new customer match|customer\s*(?:information|name)|client\s*name/i.test(current);
  if (!notification && !(parsed.clientName && (parsed.clientPhone || parsed.clientEmail))) {
    throw Object.assign(new Error('The current email contains no new Angi customer notification. Map the individual full message body; quoted older leads are not imported.'), { status: 422 });
  }
}
