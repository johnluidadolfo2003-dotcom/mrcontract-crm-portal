import fs from 'fs';
import path from 'path';
import * as durableStore from './durableStore.ts';

export interface HouzzDestinationInfo {
  displayName: 'Zapier' | 'Houzz Pro';
  sendingLabel: string;
  sentLabel: string;
  failedLabel: string;
}

export function getHouzzDestinationInfo(webhookUrl?: string): HouzzDestinationInfo {
  const urlLower = (webhookUrl || '').toLowerCase();
  const isAutomation = /zapier|make\.com|integromat|hook|n8n/i.test(urlLower);
  // A successful Zapier Catch Hook response only confirms that Zapier accepted
  // the payload. It does not prove that the downstream Houzz action succeeded.
  const displayName = isAutomation ? 'Zapier' : 'Houzz Pro';
  return {
    displayName,
    sendingLabel: `Sending to ${displayName}`,
    sentLabel: `Sent to ${displayName}`,
    failedLabel: `Failed to send to ${displayName}`,
  };
}

export function sanitizeErrorMessage(msg: string): string {
  if (!msg || typeof msg !== 'string') return 'Unknown error';
  return msg
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
      try {
        const u = new URL(url);
        return `${u.protocol}//${u.host}${u.pathname}`;
      } catch {
        return '[URL_MASKED]';
      }
    })
    .replace(/authorization\s*:\s*(?:bearer\s+)?[^\s;,&]+/gi, '[REDACTED]')
    .replace(/bearer\s+[^\s;,&]+/gi, '[REDACTED]')
    .replace(/(?:token|key|auth|secret)[=:\s]+[^\s;,&]+/gi, '[REDACTED]')
    .trim();
}

export interface EvaluatedResponse {
  success: boolean;
  safeErrorMessage?: string;
  parsedBody?: any;
  safeSummary: string;
}

export function evaluateHouzzResponse(
  status: number,
  bodyText: string,
  destinationName: string
): EvaluatedResponse {
  const sanitizedBody = sanitizeErrorMessage(bodyText || '');

  // 1. Non-2xx HTTP status
  if (status < 200 || status >= 300) {
    let msg = `HTTP ${status}`;
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed && typeof parsed === 'object') {
        const errVal = parsed.error || parsed.message || parsed.detail || parsed.reason || parsed.status;
        if (errVal && typeof errVal === 'string') {
          msg += `: ${errVal.slice(0, 150)}`;
        }
      } else if (sanitizedBody.trim()) {
        msg += `: ${sanitizedBody.slice(0, 150).replace(/[\r\n]+/g, ' ')}`;
      }
    } catch {
      if (sanitizedBody.trim()) {
        msg += `: ${sanitizedBody.slice(0, 150).replace(/[\r\n]+/g, ' ')}`;
      }
    }
    const safeError = sanitizeErrorMessage(msg);
    return {
      success: false,
      safeErrorMessage: safeError,
      safeSummary: `Failed to send to ${destinationName} (${safeError})`,
    };
  }

  // 2. 2xx HTTP Status: Check body if JSON
  let parsed: any = null;
  if (bodyText && bodyText.trim()) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      // Body is plain text or HTML, HTTP status is 2xx -> Treat as successful
      return {
        success: true,
        safeSummary: `Sent to ${destinationName} (HTTP ${status} OK)`,
      };
    }
  }

  if (parsed && typeof parsed === 'object') {
    // Check if JSON body indicates failure (e.g. { success: false }, { result: "error" }, { error: "..." })
    const isSuccessFalse =
      parsed.success === false ||
      parsed.status === 'error' ||
      parsed.status === 'failed' ||
      parsed.status === 'failure' ||
      parsed.result === 'error' ||
      parsed.result === 'failed';

    const hasErrorMsg = Boolean(
      parsed.error && typeof parsed.error === 'string' && parsed.error.trim().length > 0
    );

    if (isSuccessFalse || hasErrorMsg) {
      const rawErr =
        parsed.error ||
        parsed.message ||
        parsed.detail ||
        parsed.reason ||
        'Endpoint returned failure status in response body.';
      const safeErr = sanitizeErrorMessage(typeof rawErr === 'string' ? rawErr.slice(0, 150) : 'Rejected response');
      return {
        success: false,
        safeErrorMessage: safeErr,
        parsedBody: parsed,
        safeSummary: `Failed to send to ${destinationName} (HTTP ${status}: ${safeErr})`,
      };
    }
  }

  return {
    success: true,
    parsedBody: parsed,
    safeSummary: `Sent to ${destinationName} (HTTP ${status} OK)`,
  };
}

export function parseAddressParts(fullAddress: string) {
  const clean = (fullAddress || '').trim();
  if (!clean) return { address1: '', city: '', state: '', zip: '', postalCode: '', street: '', streetAddress: '' };

  const parts = clean.split(',').map((p) => p.trim());
  const address1 = parts[0] || clean;
  let city = '';
  let state = '';
  let zip = '';

  if (parts.length >= 4) {
    city = parts[1];
    state = parts[2];
    zip = parts[3];
  } else if (parts.length === 3) {
    city = parts[1];
    const stateZip = parts[2].split(/\s+/);
    state = stateZip[0] || '';
    zip = stateZip[1] || '';
  } else if (parts.length === 2) {
    const stateZip = parts[1].split(/\s+/);
    if (stateZip.length >= 2) {
      city = stateZip.slice(0, stateZip.length - 2).join(' ') || parts[1];
      state = stateZip[stateZip.length - 2] || '';
      zip = stateZip[stateZip.length - 1] || '';
    } else {
      city = parts[1];
    }
  }

  return {
    address1,
    street: address1,
    streetAddress: address1,
    city,
    state,
    zip,
    postalCode: zip,
  };
}

export function constructHouzzPayload(leadId: string, leadData: any): any {
  const resolvedName = (leadData.clientName || leadData.name || leadData.fullName || 'New Lead').trim();
  const nameParts = resolvedName.split(' ');
  const firstName = nameParts[0] || resolvedName;
  const lastName = nameParts.slice(1).join(' ') || '';

  const phone = (leadData.clientPhone || leadData.phone || leadData.phoneNumber || '').trim();
  const email = (leadData.clientEmail || leadData.email || '').trim();
  const addrStr = (leadData.address || leadData.clientAddress || leadData.fullAddress || '').trim();
  const parsedAddr = parseAddressParts(addrStr);
  const serviceNeeded = (leadData.serviceNeeded || leadData.service || leadData.leadType || '').trim();
  const leadSource = (leadData.leadSource || leadData.source || 'Web App').trim();
  const notes = (leadData.notes || leadData.message || '').trim();

  return {
    leadId: leadId || leadData.id || `lead_${Date.now()}`,
    submissionId: leadId || leadData.id || `lead_${Date.now()}`,
    eventId: leadId || leadData.id || `lead_${Date.now()}`,
    externalReferenceId: leadId || leadData.id || `lead_${Date.now()}`,
    createNewLead: true,
    forceNewLead: true,
    createNewRecord: true,
    createFreshLead: true,
    action: 'create_new_lead',
    clientName: resolvedName,
    name: resolvedName,
    fullName: resolvedName,
    customerName: resolvedName,
    leadName: resolvedName,
    firstName,
    lastName,
    first_name: firstName,
    last_name: lastName,
    clientPhone: phone,
    phone: phone,
    phoneNumber: phone,
    clientEmail: email,
    email: email,
    address: addrStr,
    clientAddress: addrStr,
    fullAddress: addrStr,
    propertyAddress: addrStr,
    location: addrStr,
    street: parsedAddr.street || addrStr,
    streetAddress: parsedAddr.streetAddress || addrStr,
    address1: parsedAddr.address1 || addrStr,
    address_line_1: parsedAddr.address1 || addrStr,
    city: parsedAddr.city || '',
    clientCity: parsedAddr.city || '',
    state: parsedAddr.state || '',
    clientState: parsedAddr.state || '',
    zip: parsedAddr.zip || '',
    zipCode: parsedAddr.zip || '',
    postalCode: parsedAddr.postalCode || '',
    serviceNeeded,
    service: serviceNeeded,
    leadSource,
    source: leadSource,
    leadFee: leadData.leadFee || '',
    notes,
    message: notes,
    status: leadData.status || 'New',
    timestamp: new Date().toISOString(),
  };
}

interface DispatchState {
  status: 'sending' | 'confirmed' | 'failed';
  timestamp: number;
  leadId?: string;
  error?: string;
}

const recentHouzzDispatches = new Map<string, DispatchState>();

function getHouzzDispatchKey(phone: string, name: string, leadId?: string): string {
  if (leadId) return `id_${leadId}`;
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const cleanName = (name || '').toLowerCase().trim();
  return `contact_${cleanPhone}_${cleanName}`;
}

export function canDispatchToHouzz(phone: string, name: string, leadId?: string): boolean {
  const key = getHouzzDispatchKey(phone, name, leadId);
  const now = Date.now();
  const entry = recentHouzzDispatches.get(key);

  if (entry) {
    if (entry.status === 'confirmed' && now - entry.timestamp < 60000) {
      return false; // Already sent recently
    }
    if (entry.status === 'sending' && now - entry.timestamp < 15000) {
      return false; // Sending in progress (Requirement 8)
    }
  }

  // Set sending lock
  recentHouzzDispatches.set(key, { status: 'sending', timestamp: now, leadId });
  return true;
}

export function setHouzzDispatchConfirmed(phone: string, name: string, leadId?: string): void {
  const key = getHouzzDispatchKey(phone, name, leadId);
  recentHouzzDispatches.set(key, { status: 'confirmed', timestamp: Date.now(), leadId });
}

export function setHouzzDispatchFailed(phone: string, name: string, leadId?: string, errorMsg?: string): void {
  const key = getHouzzDispatchKey(phone, name, leadId);
  recentHouzzDispatches.set(key, { status: 'failed', timestamp: Date.now(), leadId, error: errorMsg });
}

export function updateLeadHouzzState(
  leadId: string,
  state: {
    activityStatus: string;
    destinationLabel?: string;
    statusCode?: number | null;
    error?: string;
    attemptAt?: string;
    success?: boolean;
  }
): void {
  if (!leadId) return;

  const dataDir = path.join(process.cwd(), 'data');
  const incomingFile = path.join(dataDir, 'incoming_leads.json');

  // 1. Update in incoming_leads.json
  if (fs.existsSync(incomingFile)) {
    try {
      const leads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
      if (Array.isArray(leads)) {
        const idx = leads.findIndex((l: any) => l.id === leadId);
        if (idx !== -1) {
          leads[idx].houzzResult = state.activityStatus;
          leads[idx].houzzStatus = state.activityStatus;
          leads[idx].houzzStatusCode = state.statusCode ?? null;
          leads[idx].houzzError = state.error || null;
          leads[idx].houzzAttemptAt = state.attemptAt || new Date().toISOString();
          fs.writeFileSync(incomingFile, JSON.stringify(leads, null, 2), 'utf-8');
        }
      }
    } catch (err) {
      console.error('[Houzz Delivery] Error updating incoming_leads.json:', err);
    }
  }

  // 2. Update durable metadata store
  try {
    durableStore.saveLeadMetadata({
      leadId,
      houzzDispatchStatus: state.success ? 'confirmed' : state.activityStatus.startsWith('Sending') ? 'sending' : 'failed',
      houzzDispatchAt: state.attemptAt || new Date().toISOString(),
      houzzError: state.error || undefined,
    });
  } catch (err) {}
}

export interface DispatchResult {
  success: boolean;
  destinationLabel: 'Zapier' | 'Houzz Pro';
  activityStatus: string;
  statusCode: number | null;
  error?: string;
  safeSummary: string;
  attemptAt: string;
}

export async function dispatchLeadToHouzz(params: {
  leadId: string;
  payload: any;
  webhookUrl?: string;
  customFetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<DispatchResult> {
  const attemptAt = new Date().toISOString();
  const url = (params.webhookUrl || '').trim();
  const destInfo = getHouzzDestinationInfo(url);

  // Requirement 9: Show clear error if URL is missing
  if (!url) {
    const errorMsg = 'Houzz Pro / Automation Webhook URL is not configured in Settings.';
    const result: DispatchResult = {
      success: false,
      destinationLabel: destInfo.displayName,
      activityStatus: destInfo.failedLabel, // "Failed to send to Houzz Pro" or "Failed to send to Houzz Automation"
      statusCode: null,
      error: errorMsg,
      safeSummary: `Failed to send to ${destInfo.displayName} (${errorMsg})`,
      attemptAt,
    };

    // Requirement 6: Server-side structured log (destination name only, status, safe summary)
    console.log(
      `[Houzz Dispatch] Lead ID: ${params.leadId} | Destination: ${destInfo.displayName} | Status: N/A | Result: ${result.safeSummary}`
    );

    updateLeadHouzzState(params.leadId, result);
    return result;
  }

  const phone = params.payload?.clientPhone || params.payload?.phone || '';
  const name = params.payload?.clientName || params.payload?.name || '';

  // Requirement 8: Prevent duplicate retries while a request is already sending
  if (!canDispatchToHouzz(phone, name, params.leadId)) {
    const errorMsg = 'Delivery request is already sending in progress.';
    const result: DispatchResult = {
      success: false,
      destinationLabel: destInfo.displayName,
      activityStatus: destInfo.sendingLabel,
      statusCode: null,
      error: errorMsg,
      safeSummary: errorMsg,
      attemptAt,
    };
    return result;
  }

  // Requirement 4: Intermediate activity state "Sending to..."
  updateLeadHouzzState(params.leadId, {
    activityStatus: destInfo.sendingLabel,
    destinationLabel: destInfo.displayName,
    attemptAt,
    statusCode: null,
  });

  const fetchFn = params.customFetch || fetch;
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs || 15000; // Requirement 7: 15s timeout
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fullPayload = constructHouzzPayload(params.leadId, params.payload);

  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(fullPayload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const bodyText = await response.text().catch(() => '');
    const evalResult = evaluateHouzzResponse(response.status, bodyText, destInfo.displayName);

    const result: DispatchResult = {
      success: evalResult.success,
      destinationLabel: destInfo.displayName,
      activityStatus: evalResult.success ? destInfo.sentLabel : destInfo.failedLabel,
      statusCode: response.status,
      error: evalResult.safeErrorMessage,
      safeSummary: evalResult.safeSummary,
      attemptAt: new Date().toISOString(),
    };

    if (evalResult.success) {
      setHouzzDispatchConfirmed(phone, name, params.leadId);
    } else {
      setHouzzDispatchFailed(phone, name, params.leadId, evalResult.safeErrorMessage);
    }

    // Requirement 6: Server-side structured log (destination name only, status, safe summary, NO secrets)
    console.log(
      `[Houzz Dispatch] Lead ID: ${params.leadId} | Destination: ${destInfo.displayName} | Status: ${response.status} | Result: ${result.safeSummary}`
    );

    updateLeadHouzzState(params.leadId, result);
    return result;
  } catch (err: any) {
    clearTimeout(timeoutId);
    let safeErr = '';

    if (err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('timeout')) {
      safeErr = `Request timed out after ${timeoutMs / 1000} seconds`;
    } else {
      safeErr = sanitizeErrorMessage(err.message || 'Network error');
    }

    const result: DispatchResult = {
      success: false,
      destinationLabel: destInfo.displayName,
      activityStatus: destInfo.failedLabel,
      statusCode: null,
      error: safeErr,
      safeSummary: `Failed to send to ${destInfo.displayName} (${safeErr})`,
      attemptAt: new Date().toISOString(),
    };

    setHouzzDispatchFailed(phone, name, params.leadId, safeErr);

    // Requirement 6: Server-side structured log
    console.log(
      `[Houzz Dispatch] Lead ID: ${params.leadId} | Destination: ${destInfo.displayName} | Status: Failed | Result: ${result.safeSummary}`
    );

    updateLeadHouzzState(params.leadId, result);
    return result;
  }
}
