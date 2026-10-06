export interface AngiEmailFields {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  serviceNeeded: string;
  jobNumber: string;
  comments: string;
}

const LABEL_PATTERN =
  'Customer\\s*Name|Client\\s*Name|Contact\\s*Time|Daytime\\s*Phone|Evening\\s*Phone|Phone|Email|Address|Description|Job\\s*Number|Comments';

const SECTION_PATTERN =
  'Click\\s+the\\s+link\\s+below|To\\s+set\\s+an\\s+appointment|Are\\s+you\\s+creating|Thank\\s+you\\s+for|Terms\\s+of\\s+Use|Privacy\\s+Policy|Unsubscribe';

export function angiEmailToText(rawText: string): string {
  return String(rawText || '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|tr|td|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, number) => {
      const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

export function normalizeAngiEmailTextForParsing(rawText: string): string {
  return String(rawText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(new RegExp('\\s+(?=(?:' + LABEL_PATTERN + ')\\s*:)', 'gi'), '\n')
    .replace(new RegExp('\\s+(?=(?:' + SECTION_PATTERN + ')\\b)', 'gi'), '\n')
    .trim();
}

// Gmail can include the previous Angi notification below a reply. Only the
// newest message should supply customer details for the current webhook.
export function currentAngiMessage(rawText: string): string {
  const text = angiEmailToText(rawText);
  const replyBoundary = /^[ \t]*(?:On .+ wrote:|-----Original Message-----|Begin forwarded message:|From:\s*Angi\b[^\r\n]*|>\s*(?:You have a new lead!?|Customer Information))\s*$/gim;
  for (const match of text.matchAll(replyBoundary)) {
    const prefix = text.slice(0, match.index).trim();
    // An actual message header is not the start of an older quoted lead.
    if (/^\s*From:/i.test(match[0]) && !/Customer\s*(?:Name|Information)|Client\s*Name/i.test(prefix)) continue;
    if (match.index! > 0) return prefix;
  }
  return text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}

function findLabeledValue(lines: string[], labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp('^' + escapeRegExp(label).replace(/\\ /g, '\\s*') + '\\s*:\\s*(.+?)\\s*$', 'i');
    for (const line of lines) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return '';
}

export function extractAngiLabeledFields(rawText: string): AngiEmailFields {
  const normalized = normalizeAngiEmailTextForParsing(rawText);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const clientEmail = findLabeledValue(lines, ['Email']).replace(/\\@/g, '@');

  return {
    clientName: findLabeledValue(lines, ['Customer Name', 'Client Name']),
    clientPhone: findLabeledValue(lines, ['Daytime Phone', 'Evening Phone', 'Phone']),
    clientEmail,
    address: findLabeledValue(lines, ['Address']),
    serviceNeeded: findLabeledValue(lines, ['Description']),
    jobNumber: findLabeledValue(lines, ['Job Number']),
    comments: findLabeledValue(lines, ['Comments']),
  };
}
