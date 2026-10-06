import { createHash } from 'node:crypto';
import { currentAngiMessage, angiEmailToText } from './angiEmailParser.ts';

export function selectLeadEmailBody(payload: any, nested: any = {}): string {
  const bodies = ['rawEmail', 'body_plain', 'bodyPlain', 'body-plain', 'Body Plain', 'body_html', 'bodyHtml', 'Body Html', 'body', 'stripped-text', 'email_body', 'text', 'content', 'message'];
  const candidates = [payload, nested].flatMap((object) => bodies.map((field) => object?.[field]))
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  // Prefer complete customer content over truncated/plain snippets. HTML and
  // plain alternatives must describe the current message, never its old quote.
  return candidates.find((value) => /Customer\s*(?:Name|Information)|Client\s*Name/i.test(currentAngiMessage(angiEmailToText(value))))
    || candidates[0] || String(payload?.snippet || '');
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
