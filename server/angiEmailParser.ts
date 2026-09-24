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

export function normalizeAngiEmailTextForParsing(rawText: string): string {
  return String(rawText || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(new RegExp('\\s+(?=(?:' + LABEL_PATTERN + ')\\s*:)', 'gi'), '\n')
    .replace(new RegExp('\\s+(?=(?:' + SECTION_PATTERN + ')\\b)', 'gi'), '\n')
    .trim();
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
