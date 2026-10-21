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
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|tr|td|li|a|h[1-6])>/gi, '\n')
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
    .replace(/You have a new lead!?[ \t]*/gi, 'You have a new lead!\n')
    .replace(/Customer\s+Information\s*:?[ \t]*/gi, '\nCustomer Information\n')
    .replace(new RegExp('\\s+(?=(?:' + LABEL_PATTERN + ')\\s*:)', 'gi'), '\n')
    .replace(new RegExp('\\s+(?=(?:' + SECTION_PATTERN + ')\\b)', 'gi'), '\n')
    .trim();
}

// Gmail can include the previous Angi notification below a reply. Only the
// newest message should supply customer details for the current webhook.
export function currentAngiMessage(rawText: string): string {
  // Gmail sometimes marks quoted messages only in HTML, with no 'On ... wrote'
  // text. Drop that quote before stripping tags so an old client cannot leak in.
  const html = String(rawText || '');
  const quote = /<(?:div|blockquote)\b[^>]*(?:class=["'][^"']*\bgmail_quote\b[^"']*["']|type=["']cite["'])[^>]*>|<blockquote\b[^>]*>/i.exec(html);
  const text = angiEmailToText(quote ? html.slice(0, quote.index) : html);
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
    for (let index = 0; index < lines.length; index++) {
      const match = lines[index].match(pattern);
      if (match?.[1]) return match[1].trim();
      const standalone = new RegExp('^' + escapeRegExp(label) + '\\s*:?\\s*$', 'i');
      const next = lines[index + 1];
      if (standalone.test(lines[index]) && next && !new RegExp('^(?:' + LABEL_PATTERN + ')\\s*:', 'i').test(next)) return next;
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

export function extractFromEmailText(rawText: string, defaultSource: string = 'Angi'): {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  serviceNeeded: string;
  leadFee: string;
  notes: string;
} {
  if (!rawText || typeof rawText !== 'string') {
    return {
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      address: '',
      serviceNeeded: '',
      leadFee: '',
      notes: '',
    };
  }

  // Strip HTML if HTML email
  const clean = normalizeAngiEmailTextForParsing(
    currentAngiMessage(rawText)
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>/gi, '\n')
      .replace(/<[^>]+>/gi, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\t/g, ' ')
  );
  const labeledFields = extractAngiLabeledFields(clean);

  const rawLines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Service / Task Requested
  let serviceNeeded = labeledFields.serviceNeeded;
  // Check "You have a new lead!" pattern which precedes task in official Angi emails
  for (let i = 0; i < rawLines.length; i++) {
    if (!serviceNeeded && /you have a new lead/i.test(rawLines[i])) {
      if (i + 1 < rawLines.length && !/customer information|angi|view lead/i.test(rawLines[i + 1])) {
        serviceNeeded = rawLines[i + 1].trim();
        break;
      }
    }
  }

  if (!serviceNeeded) {
    const servicePattern = /(?:service\s*(?:requested|needed)?|task(?:\s*name)?|project(?:\s*type)?|category|job\s*type|work\s*requested)[:\-]+\s*([^\r\n]{3,100})/i;
    const serviceMatch = clean.match(servicePattern);
    if (serviceMatch) {
      const s = serviceMatch[1].trim();
      if (!/angi|homeadvisor|pro|click here|view lead|customer information|^(?:label|details|information|description|needed|requested|type|category)\b/i.test(s)) {
        serviceNeeded = s;
      }
    }
  }

  // Fallback for Subject line like "New Customer Match: Clean & Inspect Chimney - from Angi #..."
  if (!serviceNeeded) {
    const subjectMatch = clean.match(/(?:match|lead)[:\-]+\s*([^#\-\r\n]{3,60})(?:\s*-\s*from Angi|\s*#\d+|$)/i);
    if (subjectMatch && !/angi|lead|information/i.test(subjectMatch[1].trim())) {
      serviceNeeded = subjectMatch[1].trim();
    }
  }

  // 2. Client Name
  let clientName = labeledFields.clientName;
  // Check official Angi "Customer Information" block
  for (let i = 0; i < rawLines.length; i++) {
    if (!clientName && /^customer\s*information$/i.test(rawLines[i])) {
      if (i + 1 < rawLines.length) {
        const nextCandidate = rawLines[i + 1].trim();
        // Ignore headers or buttons
        if (
          nextCandidate.length >= 3 &&
          nextCandidate.length <= 45 &&
          !/view lead|send a message|customer information|^(?:phone|email|address|contact|view|click|privacy|terms)\b|^(?:angi|homeadvisor)$|\d{3}|@/i.test(nextCandidate)
        ) {
          clientName = nextCandidate;
          break;
        }
      }
    }
  }

  if (!clientName) {
    for (const line of rawLines) {
      const nameMatch = line.match(
        /(?:customer\s*name|client\s*name|homeowner\s*name|consumer\s*name|customer|client|homeowner|contact\s*name|consumer|^name)[:\s\-]+([A-Za-z'.-]+(?:[ \t]+[A-Za-z'.-]+)+)/i
      );
      if (nameMatch) {
        const cand = nameMatch[1].trim();
        if (!/angi|homeadvisor|service|lead|pro|notification|details|information|alert/i.test(cand)) {
          clientName = cand;
          break;
        }
      }
    }
  }

  if (!clientName) {
    for (const line of rawLines) {
      const m = line.match(/^(?:name|customer|client)[:\s\-]+([A-Za-z'.-]+(?:[ \t]+[A-Za-z'.-]+)+)$/i);
      if (m) {
        clientName = m[1].trim();
        break;
      }
    }
  }

  // Normalize all-caps name (e.g. "JAN MCCOY" -> "Jan Mccoy" / "Jan McCoy")
  if (clientName && clientName === clientName.toUpperCase() && clientName.length > 3) {
    clientName = clientName
      .toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // 3. Phone Number
  let clientPhone = labeledFields.clientPhone;
  const phonePattern = /(?:phone|cell|mobile|tel|telephone|contact\s*(?:#|number|phone))[:\s\-]*([+\d\s().-]{10,20})/i;
  const phoneMatch = clean.match(phonePattern);
  if (phoneMatch) {
    const p = phoneMatch[1].replace(/[^\d()\-+.\s]/g, '').trim();
    if (p.replace(/\D/g, '').length >= 10) {
      clientPhone = p;
    }
  }
  if (!clientPhone) {
    const generalPhone = clean.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
    if (generalPhone) clientPhone = generalPhone[0].trim();
  }

  // 4. Email Address (filtering out internal Angi/HomeAdvisor addresses)
  let clientEmail = labeledFields.clientEmail;
  const emailPattern = /(?:email|e-mail|email\s*address)[:\s\-]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = clean.match(emailPattern);
  if (emailMatch && !/angi\.com|homeadvisor\.com|mrcontract\.us|zapier|service\.com|noreply/i.test(emailMatch[1])) {
    clientEmail = emailMatch[1].trim();
  }
  if (!clientEmail) {
    const allEmails = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const valid = allEmails.find((em) => !/angi\.com|homeadvisor\.com|mrcontract\.us|zapier|service\.com|noreply|mailer/i.test(em));
    if (valid) clientEmail = valid.trim();
  }

  // 5. Address / Location
  let address = labeledFields.address;

  // Check multi-line Project Location or Address headers
  for (let i = 0; i < rawLines.length; i++) {
    if (/^(?:project\s*location|job\s*location|property\s*address|customer\s*address|address|location)[:\s]*$/i.test(rawLines[i])) {
      if (i + 1 < rawLines.length) {
        const line1 = rawLines[i + 1].trim();
        if (!/angi|homeadvisor|view lead|unsubscribe|reply/i.test(line1) && !line1.includes('@')) {
          if (i + 2 < rawLines.length && /\b[A-Z]{2}\s*,?\s*\d{5}\b/i.test(rawLines[i + 2])) {
            address = `${line1}, ${rawLines[i + 2].trim()}`;
          } else {
            address = line1;
          }
          break;
        }
      }
    }
  }

  // Check labeled inline address (e.g. "Location: 631 W Waldheim Rd, Pittsburgh, PA 15215")
  if (!address) {
    const addrPattern = /(?:project\s*location|job\s*location|property\s*address|customer\s*address|street\s*address|address|location)[:\s\-]+([^\r\n]{5,120})/i;
    const addrMatch = clean.match(addrPattern);
    if (addrMatch) {
      const a = addrMatch[1].trim();
      if (!/angi|homeadvisor|not available|view online|view lead|unsubscribe/i.test(a)) {
        address = a;
      }
    }
  }

  // Check Customer Information block (if address follows phone/email)
  if (!address) {
    for (let i = 0; i < rawLines.length; i++) {
      if (/^customer\s*information$/i.test(rawLines[i])) {
        // Collect following lines until a blank line or footer
        for (let j = i + 1; j < Math.min(rawLines.length, i + 7); j++) {
          const l = rawLines[j].trim();
          if (/\b[A-Z]{2}\s*,?\s*\d{5}\b/i.test(l) && !l.includes('@')) {
            // Found city/state/zip! Check if previous line had street
            if (j > i + 1) {
              const prev = rawLines[j - 1].trim();
              if (
                /\d+\s+[A-Za-z0-9]/.test(prev) &&
                !prev.includes('@') &&
                !/^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(prev)
              ) {
                address = `${prev}, ${l}`;
                break;
              }
            }
            address = l;
            break;
          }
        }
      }
      if (address) break;
    }
  }

  // Check lines matching city, state zip format (e.g. "631 W Waldheim Rd, Pittsburgh, PA 15215" or "Pittsburgh, PA 15215")
  if (!address) {
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (
        /\b[A-Z]{2}\s*,?\s*\d{5}\b/i.test(line) &&
        !/angi|homeadvisor|reply|view lead|unsubscribe|copyright/i.test(line) &&
        !line.includes('@')
      ) {
        // Check if previous line is a street address line
        if (i > 0) {
          const prev = rawLines[i - 1].trim();
          if (
            /\d+\s+[A-Za-z0-9]/.test(prev) &&
            !prev.includes('@') &&
            !/^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(prev) &&
            !/angi|homeadvisor|view lead/i.test(prev)
          ) {
            address = `${prev}, ${line.trim()}`;
            break;
          }
        }
        address = line.trim();
        break;
      }
    }
  }

  if (!address) {
    const streetMatch = clean.match(
      /\d+\s+[A-Za-z0-9\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Way|Boulevard|Blvd|Highway|Hwy)[.,]?\s*(?:[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5})?/i
    );
    if (streetMatch && !/view lead|angi|homeadvisor/i.test(streetMatch[0])) address = streetMatch[0].trim();
  }

  // 6. Lead Fee / Price
  let leadFee = '';
  const feeMatch = clean.match(/(?:lead\s*(?:fee|price|cost)|fee|price|cost)[:\s\-]*(\$\s*\d+(?:\.\d{2})?)/i);
  if (feeMatch) {
    leadFee = feeMatch[1].replace(/\s+/g, '');
  }

  // 7. Notes / Comments
  const notes = labeledFields.comments || '';

  return {
    clientName,
    clientPhone,
    clientEmail,
    address,
    serviceNeeded: serviceNeeded || '',
    leadFee,
    notes,
  };
}
