import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { timingSafeEqual, createHash } from 'crypto';
import sharp from 'sharp';
import * as sheetsService from './server/sheetsService.ts';
import * as durableStore from './server/durableStore.ts';
import * as calendarService from './server/calendarService.ts';
import * as houzzDelivery from './server/houzzDelivery.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: ['text/*', 'application/text', 'text/plain', 'text/html'], limit: '10mb' }));

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
});

// Helper to safely parse JSON from Gemini text response
function parseGeminiJson(rawText: string | undefined): { parsed: any; isValid: boolean; warning?: string } {
  if (!rawText) return { parsed: {}, isValid: false, warning: 'Empty AI response' };
  try {
    let clean = rawText.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const match = clean.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : JSON.parse(clean);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { parsed: {}, isValid: false, warning: 'AI response was not a valid JSON object' };
    }

    // Validate expected field types if present
    const validFields: Record<string, any> = {};
    if (typeof parsed.clientName === 'string') validFields.clientName = parsed.clientName.trim();
    if (typeof parsed.clientPhone === 'string') validFields.clientPhone = parsed.clientPhone.trim();
    if (typeof parsed.clientEmail === 'string') validFields.clientEmail = parsed.clientEmail.trim();
    if (typeof parsed.address === 'string') validFields.address = parsed.address.trim();
    if (typeof parsed.serviceNeeded === 'string') validFields.serviceNeeded = parsed.serviceNeeded.trim();
    if (typeof parsed.leadType === 'string') validFields.leadType = parsed.leadType.trim();
    if (typeof parsed.leadFee === 'string') validFields.leadFee = parsed.leadFee.trim();
    if (typeof parsed.notes === 'string') validFields.notes = parsed.notes.trim();

    return { parsed: { ...parsed, ...validFields }, isValid: true };
  } catch (err: any) {
    console.warn('JSON parse error from Gemini text:', err.message);
    return { parsed: {}, isValid: false, warning: 'Failed to parse AI structured response' };
  }
}

// Helper to call Gemini with automatic model fallback & temporary error recovery
let aiDeniedUntil = 0; // Timestamp for temporary error recovery instead of permanent lockout

async function callGeminiWithFallback(params: {
  contents: any;
  config?: any;
}) {
  const now = Date.now();
  if (aiDeniedUntil > now) {
    const remainingSec = Math.ceil((aiDeniedUntil - now) / 1000);
    throw new Error(`PERMISSION_DENIED_COOLDOWN: AI extraction is cooling down (${remainingSec}s remaining).`);
  }
  const modelsToTry = [
    'gemini-3.7-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite'
  ];
  let lastErr: any = null;
  for (const model of modelsToTry) {
    try {
      const configCopy = params.config ? { ...params.config } : {};
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: configCopy
      });
      // Successful call resets any failure cooldown
      aiDeniedUntil = 0;
      return response;
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || '';
      if (msg.includes('403') || msg.includes('denied access') || msg.includes('PERMISSION_DENIED')) {
        // Cooldown for 45 seconds instead of permanently disabling until server restart
        aiDeniedUntil = Date.now() + 45000;
        break;
      }
      console.warn(`Model ${model} failed, trying fallback model:`, msg);
      continue;
    }
  }
  if (lastErr && (lastErr.message?.includes('403') || lastErr.message?.includes('PERMISSION_DENIED') || lastErr.message?.includes('denied access'))) {
    aiDeniedUntil = Date.now() + 45000;
  }
  throw lastErr;
}

// Helper function for local heuristic text parsing when AI is unavailable
function heuristicExtractText(text: string): any {
  if (!text) {
    return {
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      address: '',
      leadSource: 'Direct',
      notes: '',
      warning: 'AI auto-extraction is restricted (API Quota/Access). Using smart local parser.'
    };
  }

  const phoneMatch = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const clientPhone = phoneMatch ? phoneMatch[0] : '';

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const clientEmail = emailMatch ? emailMatch[0] : '';

  const sources = ['Angi', 'Thumbtack', 'Houzz', 'HomeAdvisor', 'Facebook', 'Google', 'Direct', 'Yelp'];
  let leadSource = 'Direct';
  for (const s of sources) {
    if (new RegExp(s, 'i').test(text)) {
      leadSource = s;
      break;
    }
  }

  let clientName = '';
  const nameMatch = text.match(/(?:name|client|customer)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  if (nameMatch) {
    clientName = nameMatch[1];
  } else {
    const capMatch = text.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
    if (capMatch && capMatch[1].toLowerCase() !== leadSource.toLowerCase()) {
      clientName = capMatch[1];
    }
  }

  let address = '';
  const addrMatch = text.match(/\d+\s+[A-Za-z0-9\s,.-]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Circle|Cir|Way|Boulevard|Blvd)[.,]?\s*(?:[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5})?/i);
  if (addrMatch) {
    address = addrMatch[0].trim();
  }

  const notes = `**Project Inquiry**\n- ${text.slice(0, 300).trim()}`;

  return {
    clientName,
    clientPhone,
    clientEmail,
    address,
    leadSource,
    notes,
    warning: 'AI auto-extraction is restricted (API Quota/Access). Used smart local parser.'
  };
}

// Extract from text
app.post('/api/extract-text', async (req, res) => {
  try {
    const { text } = req.body;
    if (Date.now() < aiDeniedUntil) {
      const fallback = heuristicExtractText(text);
      return res.json(fallback);
    }
    const response = await callGeminiWithFallback({
      contents: `Extract client details from the following raw text message or email snippet:\n\n${text}\n\nIMPORTANT FOR NOTES FORMATTING: If there is a main project title/service name and customer comment, format the 'notes' string as:\n**[Main Service / Project Title]**\n- [Customer comment or job description]\n\nExample:\n**Brick or Stone Tuck-Pointing**\n- Need some mortar joints repaired`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clientName: { type: Type.STRING, description: 'Client full name or empty string if missing' },
            clientPhone: { type: Type.STRING, description: 'Client phone number or empty string if missing' },
            clientEmail: { type: Type.STRING, description: 'Client email address or empty string if missing' },
            address: { type: Type.STRING, description: 'Physical address or location or empty string if missing' },
            leadSource: { type: Type.STRING, description: 'Lead source platform (e.g. Angi, Thumbtack, Houzz, Direct) or empty string if missing' },
            notes: { type: Type.STRING, description: 'Formatted notes with bold project title on top line and customer comments on line below with bullet point' }
          }
        }
      }
    });
    
    const result = parseGeminiJson(response.text);
    res.json(result);
  } catch (error: any) {
    const msg = error?.message || '';
    console.warn('Extraction caught error, switching to heuristic/fallback:', msg);
    aiDeniedUntil = Date.now() + 45000;
    const fallback = heuristicExtractText(req.body?.text);
    return res.json(fallback);
  }
});

// Extract from image
app.post('/api/extract-image', upload.single('image') as any, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    
    if (Date.now() < aiDeniedUntil) {
      return res.json({
        clientName: '',
        clientPhone: '',
        clientEmail: '',
        address: '',
        leadSource: 'Direct',
        notes: '**Uploaded Lead Image**\n- Image attached. Please review and enter details.',
        warning: 'AI image OCR is currently restricted. Image uploaded successfully - please enter details below.'
      });
    }

    let processedBuffer: Buffer;
    let mimeType = 'image/jpeg';

    try {
      processedBuffer = await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .toFormat('jpeg', { quality: 85 })
        .toBuffer();
    } catch (sharpErr) {
      console.warn('Sharp image conversion fallback activated:', sharpErr);
      processedBuffer = req.file.buffer;
      const rawMime = (req.file.mimetype || '').toLowerCase().trim();
      if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(rawMime)) {
        mimeType = rawMime;
      }
    }

    const base64Data = processedBuffer.toString('base64');

    const response = await callGeminiWithFallback({
      contents: [
        { inlineData: { data: base64Data, mimeType } },
        { text: 'Extract client details from this screenshot or photo (e.g. from lead platforms like Angi, Thumbtack, Houzz, etc.). Read the text carefully. Extract contact details (Name, Phone, Email, Address) and Lead Source. FOR NOTES FORMATTING: Format the notes field strictly with the Main Service/Project Title in BOLD on the first line, followed on the line below by the customer comment/job description with a bullet point. Example:\n**Brick or Stone Tuck-Pointing**\n- Need some mortar joints repaired' }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clientName: { type: Type.STRING, description: 'Client full name or empty string if not found' },
            clientPhone: { type: Type.STRING, description: 'Client phone number or empty string if not found' },
            clientEmail: { type: Type.STRING, description: 'Client email address or empty string if not found' },
            address: { type: Type.STRING, description: 'Client physical address or location or empty string if not found' },
            leadSource: { type: Type.STRING, description: 'Lead source platform (e.g. Angi, Thumbtack, Houzz, Direct) or empty string if not found' },
            notes: { type: Type.STRING, description: 'Bold project title on first line, followed on line below by customer comment with bullet point' }
          }
        }
      }
    });
    
    const result = parseGeminiJson(response.text);
    res.json(result);
  } catch (error: any) {
    const msg = error?.message || '';
    console.warn('Image extraction caught error, switching to fallback:', msg);
    aiDeniedUntil = Date.now() + 45000;
    return res.json({
      clientName: '',
      clientPhone: '',
      clientEmail: '',
      address: '',
      leadSource: 'Direct',
      notes: '**Uploaded Lead Image**\n- Image attached. Please review and enter details.',
      warning: 'AI image OCR is currently restricted. Image uploaded successfully - please enter details below.'
    });
  }
});

function getBackendWebhookUrl(): string {
  const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (cfg && typeof cfg.houzzWebhookUrl === 'string' && cfg.houzzWebhookUrl.trim()) {
        return cfg.houzzWebhookUrl.trim();
      }
    } catch {}
  }
  return (process.env.ZAPIER_WEBHOOK_URL || process.env.HOUZZ_WEBHOOK_URL || '').trim();
}

app.get('/api/config', (req, res) => {
  try {
    const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');
    let configData: any = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        configData = JSON.parse(data);
      } catch {}
    }
    // Always supply shared team-wide backend webhook URL
    delete configData.houzzWebhookUrl;
    return res.json({ ...configData, houzzWebhookConfigured: Boolean(getBackendWebhookUrl()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config', (req, res) => {
  try {
    const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let existingData: any = {};
    if (fs.existsSync(CONFIG_FILE)) {
      try {
        existingData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      } catch {}
    }
    const incoming = { ...req.body };
    delete incoming.spreadsheetId;
    delete incoming.spreadsheetUrl;
    delete incoming.spreadsheetName;
    delete incoming.houzzWebhookUrl;
    delete existingData.houzzWebhookUrl;

    const mergedData = {
      ...existingData,
      ...incoming,
    };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(mergedData, null, 2), 'utf-8');
    res.json({ success: true, config: { ...mergedData, houzzWebhookConfigured: Boolean(getBackendWebhookUrl()) } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/webhook-url', (req, res) => {
  res.json({
    isConfigured: Boolean(getBackendWebhookUrl()),
    destination: 'Zapier / Houzz Automation',
  });
});

app.post('/api/webhook-url', (_req, res) => res.status(403).json({ success: false, error: 'Configure ZAPIER_WEBHOOK_URL in Render.' }));

// Rate limiter: Max 60 requests per minute per IP for webhook ingest (Weakness 8)
const webhookRateLimits = new Map<string, { count: number; resetTime: number }>();
let lastRateLimitCleanup = 0;

function isWebhookRateLimited(ip: string): boolean {
  const now = Date.now();
  if (now - lastRateLimitCleanup > 60000 || webhookRateLimits.size > 5000) {
    for (const [key, value] of webhookRateLimits) {
      if (now > value.resetTime) webhookRateLimits.delete(key);
    }
    lastRateLimitCleanup = now;
  }
  const record = webhookRateLimits.get(ip);
  if (!record || now > record.resetTime) {
    webhookRateLimits.set(ip, { count: 1, resetTime: now + 60000 });
    return false;
  }
  record.count++;
  return record.count > 60;
}

function safeSecretEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function validateWebhookSecret(req: express.Request): boolean {
  const expectedSecret = (process.env.WEBHOOK_SECRET_KEY || '').trim();
  // Fail closed: a missing server secret must never make webhook ingestion public.
  if (!expectedSecret) return false;

  // Accept the secret only through a header. Query-string secrets leak into logs/history.
  const headerToken = req.headers['x-webhook-secret'] || req.headers['x-webhook-token'] || req.headers['authorization'];
  if (!headerToken) return false;
  const cleanToken = String(headerToken).replace(/^Bearer\s+/i, '').trim();
  return safeSecretEqual(cleanToken, expectedSecret);
}

function validateThumbtackBasicAuth(req: express.Request): boolean {
  const expectedUsername = (process.env.THUMBTACK_WEBHOOK_USERNAME || '').trim();
  const expectedPassword = process.env.THUMBTACK_WEBHOOK_PASSWORD || '';

  // Fail closed when either dedicated Thumbtack credential is not configured.
  if (!expectedUsername || !expectedPassword) return false;

  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return safeSecretEqual(username, expectedUsername) && safeSecretEqual(password, expectedPassword);
  } catch {
    return false;
  }
}

function validateHouzzCallback(req: express.Request): boolean {
  const expected = (process.env.HOUZZ_CALLBACK_SECRET || '').trim();
  if (!expected) return false;
  const supplied = String(req.headers['x-houzz-callback-secret'] || '').trim();
  return supplied ? safeSecretEqual(supplied, expected) : false;
}

function maskPhoneNumber(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ***-${digits.slice(6)}`;
  }
  if (digits.length > 4) {
    return `***-${digits.slice(-4)}`;
  }
  return '***-****';
}

function maskEmailAddress(email?: string): string {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}***@${domain}`;
}

// Deduplication and lifecycle tracking for Houzz Pro / Zapier dispatches
// Weakness 16: Track states separately: Sending, Failed, and Confirmed to allow immediate retries on failure
interface HouzzDispatchEntry {
  status: 'sending' | 'confirmed' | 'failed';
  timestamp: number;
  error?: string;
}
const recentHouzzDispatches = new Map<string, HouzzDispatchEntry>();

function getHouzzKey(phone: string, name: string): string {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const cleanName = (name || '').toLowerCase().trim();
  return `${cleanPhone}_${cleanName}`;
}

function canDispatchToHouzz(phone: string, name: string): boolean {
  const key = getHouzzKey(phone, name);
  if (key === '_') return true;

  const now = Date.now();
  const entry = recentHouzzDispatches.get(key);
  if (entry) {
    // If successfully confirmed within the last 60 seconds, prevent duplicate send
    if (entry.status === 'confirmed' && (now - entry.timestamp) < 60000) {
      return false;
    }
    // If currently sending within the last 15 seconds, avoid simultaneous duplicate dispatch
    if (entry.status === 'sending' && (now - entry.timestamp) < 15000) {
      return false;
    }
    // If failed, allow retry immediately!
  }

  // Set to sending state
  recentHouzzDispatches.set(key, { status: 'sending', timestamp: now });

  if (recentHouzzDispatches.size > 500) {
    for (const [k, e] of recentHouzzDispatches.entries()) {
      if (now - e.timestamp > 120000) recentHouzzDispatches.delete(k);
    }
  }
  return true;
}

function setHouzzDispatchConfirmed(phone: string, name: string): void {
  const key = getHouzzKey(phone, name);
  recentHouzzDispatches.set(key, { status: 'confirmed', timestamp: Date.now() });
}

function setHouzzDispatchFailed(phone: string, name: string, errorMsg?: string): void {
  const key = getHouzzKey(phone, name);
  // Mark failed so user can immediately retry (Weakness 16)
  recentHouzzDispatches.set(key, { status: 'failed', timestamp: Date.now(), error: errorMsg });
}

app.post('/api/send-houzz-webhook', async (req, res) => {
  try {
    const { payload, leadId } = req.body;
    const webhookUrl = getBackendWebhookUrl();

    const resolvedLeadId = leadId || payload?.leadId || payload?.id || payload?.submissionId || `lead_${Date.now()}`;

    const result = await houzzDelivery.dispatchLeadToHouzz({
      leadId: resolvedLeadId,
      payload: payload || {},
      webhookUrl,
    });

    if (result.success) {
      return res.json({
        success: true,
        message: result.activityStatus,
        destination: result.destinationLabel,
        statusCode: result.statusCode,
      });
    } else {
      return res.status(result.statusCode && result.statusCode >= 400 && result.statusCode < 600 ? result.statusCode : 502).json({
        success: false,
        message: result.activityStatus,
        error: result.error,
        destination: result.destinationLabel,
        statusCode: result.statusCode,
      });
    }
  } catch (error: any) {
    const destInfo = houzzDelivery.getHouzzDestinationInfo(getBackendWebhookUrl());
    const safeErr = houzzDelivery.sanitizeErrorMessage(error.message || 'Server error');
    return res.status(500).json({
      success: false,
      message: destInfo.failedLabel,
      error: safeErr,
      destination: destInfo.displayName,
    });
  }
});

app.post('/api/webhooks/retry-houzz', async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'leadId is required for retry.' });
    }

    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    let leadData: any = null;
    if (fs.existsSync(incomingFile)) {
      try {
        const leads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
        if (Array.isArray(leads)) {
          leadData = leads.find((l: any) => l.id === leadId);
        }
      } catch {}
    }

    if (!leadData) {
      const meta = durableStore.getLeadMetadata(leadId);
      if (meta) {
        leadData = { id: leadId, notes: meta.notes };
      }
    }

    if (!leadData && req.body.payload) {
      leadData = req.body.payload;
    }

    if (!leadData) {
      return res.status(404).json({ success: false, error: `Lead with ID ${leadId} not found.` });
    }

    const resolvedUrl = getBackendWebhookUrl();

    const result = await houzzDelivery.dispatchLeadToHouzz({
      leadId,
      payload: leadData,
      webhookUrl: resolvedUrl,
    });

    if (result.success) {
      return res.json({
        success: true,
        message: result.activityStatus,
        destination: result.destinationLabel,
        statusCode: result.statusCode,
      });
    } else {
      return res.status(result.statusCode && result.statusCode >= 400 && result.statusCode < 600 ? result.statusCode : 502).json({
        success: false,
        message: result.activityStatus,
        error: result.error,
        destination: result.destinationLabel,
        statusCode: result.statusCode,
      });
    }
  } catch (error: any) {
    const safeErr = houzzDelivery.sanitizeErrorMessage(error.message || 'Server error');
    return res.status(500).json({ success: false, error: safeErr });
  }
});

// Helper function to extract service requested from Angi subject line
function extractAngiServiceFromSubject(subject: unknown): string {
  const text = typeof subject === 'string' ? subject.trim() : '';
  if (!text) return '';

  const match = text.match(
    /^New\s+Customer\s+Match:\s*(.+?)\s*-\s*from\s+Angi(?:\s*#\d+)?\s*$/i
  );

  return match?.[1]?.trim() || '';
}

// Helper function to extract structured lead details from raw email text (Angi, HomeAdvisor, etc.)
function extractFromEmailText(rawText: string, defaultSource: string = 'Angi'): {
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
  const clean = rawText
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, '\n')
    .replace(/<[^>]+>/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\t/g, ' ');

  const rawLines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Service / Task Requested
  let serviceNeeded = '';
  // Check "You have a new lead!" pattern which precedes task in official Angi emails
  for (let i = 0; i < rawLines.length; i++) {
    if (/you have a new lead/i.test(rawLines[i])) {
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
  let clientName = '';
  // Check official Angi "Customer Information" block
  for (let i = 0; i < rawLines.length; i++) {
    if (/^customer\s*information$/i.test(rawLines[i])) {
      if (i + 1 < rawLines.length) {
        const nextCandidate = rawLines[i + 1].trim();
        // Ignore headers or buttons
        if (
          nextCandidate.length >= 3 &&
          nextCandidate.length <= 45 &&
          !/view lead|send a message|\d{3}|@|angi/i.test(nextCandidate)
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
  let clientPhone = '';
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
  let clientEmail = '';
  const emailPattern = /(?:email|e-mail|email\s*address)[:\s\-]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
  const emailMatch = clean.match(emailPattern);
  if (emailMatch && !/angi\.com|homeadvisor\.com|zapier|service\.com|noreply/i.test(emailMatch[1])) {
    clientEmail = emailMatch[1].trim();
  }
  if (!clientEmail) {
    const allEmails = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const valid = allEmails.find((em) => !/angi\.com|homeadvisor\.com|zapier|service\.com|noreply|mailer/i.test(em));
    if (valid) clientEmail = valid.trim();
  }

  // 5. Address / Location
  let address = '';

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

  // 7. Notes / Comments (kept empty when creating new leads as requested)
  const notes = '';

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

// --- Incoming Webhooks & Lead Capture (Angi, Thumbtack, Zapier) ---

async function parseIncomingLeadPayload(body: any, defaultSource: string = 'Angi') {
  let b = body || {};

  // If body is an array (e.g. batch webhook or Zapier array), unwrap first item
  if (Array.isArray(b) && b.length > 0) {
    b = b[0];
  }

  // If body is raw text or string, check if it's stringified JSON or email text
  if (typeof b === 'string') {
    const trimmed = b.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsedJson = JSON.parse(trimmed);
        b = Array.isArray(parsedJson) ? (parsedJson[0] || {}) : (parsedJson || {});
      } catch {
        b = { rawEmail: b };
      }
    } else {
      b = { rawEmail: b };
    }
  }

  // If payload is wrapped inside a sub-object (e.g. { lead: {...} } or { data: {...} } or { payload: {...} })
  const nestedLead = b.lead || b.data || b.payload || b.leadData || b.Lead || {};
  const consumer = b.consumer || b.customer || b.contact || nestedLead.consumer || nestedLead.customer || nestedLead.contact || {};
  const task = b.task || b.service || nestedLead.task || nestedLead.service || {};

  // Check if raw email text was supplied (from Zapier Gmail trigger or email parser)
  const rawEmailCandidate =
    b.rawEmail ||
    b.body_plain ||
    b.body ||
    b.body_html ||
    b['body-plain'] ||
    b['stripped-text'] ||
    b.snippet ||
    b.message ||
    b.email_body ||
    b.text ||
    b.content ||
    nestedLead.rawEmail ||
    nestedLead.body ||
    nestedLead.text ||
    '';

  let extractedEmailData: any = null;
  if (typeof rawEmailCandidate === 'string' && rawEmailCandidate.length > 20) {
    // If we have raw email text, extract details from it
    extractedEmailData = extractFromEmailText(rawEmailCandidate, defaultSource);

    // If AI is available and clientName was not found by heuristic regex, try Gemini extraction
    if (!extractedEmailData.clientName && !(Date.now() < aiDeniedUntil) && process.env.NODE_ENV !== 'test') {
      try {
        const response = await callGeminiWithFallback({
          contents: `Extract client details from this contractor lead notification email from Angi/HomeAdvisor:\n\n${rawEmailCandidate.slice(0, 3000)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                clientName: { type: Type.STRING },
                clientPhone: { type: Type.STRING },
                clientEmail: { type: Type.STRING },
                address: { type: Type.STRING },
                serviceNeeded: { type: Type.STRING },
                leadFee: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
            },
          },
        });
        const aiResult = parseGeminiJson(response.text);
        const aiParsed = aiResult?.parsed;
        const cleanAiStr = (v: any) => {
          if (typeof v !== 'string') return '';
          const t = v.trim();
          if (/^(?:null|undefined|none|n\/a|unknown)$/i.test(t) || /without\s+a\s+service/i.test(t)) return '';
          return t;
        };
        if (aiParsed && typeof aiParsed === 'object') {
          const name = cleanAiStr(aiParsed.clientName);
          const phone = cleanAiStr(aiParsed.clientPhone);
          const email = cleanAiStr(aiParsed.clientEmail);
          const addr = cleanAiStr(aiParsed.address);
          const service = cleanAiStr(aiParsed.serviceNeeded);
          const fee = cleanAiStr(aiParsed.leadFee);
          const n = cleanAiStr(aiParsed.notes);

          if (name && !extractedEmailData.clientName) extractedEmailData.clientName = name;
          if (phone && !extractedEmailData.clientPhone) extractedEmailData.clientPhone = phone;
          if (email && !extractedEmailData.clientEmail) extractedEmailData.clientEmail = email;
          if (addr && !extractedEmailData.address) extractedEmailData.address = addr;
          if (service && !extractedEmailData.serviceNeeded) extractedEmailData.serviceNeeded = service;
          if (fee && !extractedEmailData.leadFee) extractedEmailData.leadFee = fee;
          if (n && !extractedEmailData.notes) extractedEmailData.notes = n;
        }
      } catch (err) {
        console.warn('AI extraction fallback encountered, using heuristic text parse:', err);
      }
    }
  }

  // Extract Client Name (handling firstName + lastName, customer_name, clientName, nested consumer, etc.)
  let clientName = (
    b.clientName ||
    b.name ||
    b.fullName ||
    b.full_name ||
    b.customerName ||
    b.customer_name ||
    b.contactName ||
    b.contact_name ||
    b.consumerName ||
    b.leadName ||
    b.lead_name ||
    nestedLead.clientName ||
    nestedLead.name ||
    nestedLead.fullName ||
    consumer.name ||
    consumer.fullName ||
    (extractedEmailData?.clientName) ||
    ''
  ).trim();

  if (!clientName) {
    const fn = (b.first_name || b.firstName || consumer.first_name || consumer.firstName || nestedLead.first_name || nestedLead.firstName || '').trim();
    const ln = (b.last_name || b.lastName || consumer.last_name || consumer.lastName || nestedLead.last_name || nestedLead.lastName || '').trim();
    if (fn || ln) {
      clientName = `${fn} ${ln}`.trim();
    }
  }
  // Normalize all-caps name (e.g. "JAN MCCOY" -> "Jan McCoy")
  if (clientName && clientName === clientName.toUpperCase() && clientName.length > 3) {
    clientName = clientName
      .toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  // Extract Phone
  let clientPhone = String(
    b.clientPhone ||
    b.phone ||
    b.phoneNumber ||
    b.phone_number ||
    b.primaryPhone ||
    b.primary_phone ||
    b.contact_phone ||
    b.contactPhone ||
    b.mobile ||
    b.mobilePhone ||
    b.cell ||
    b.cellPhone ||
    b.telephone ||
    consumer.phone ||
    consumer.phoneNumber ||
    consumer.primaryPhone ||
    nestedLead.phone ||
    nestedLead.clientPhone ||
    nestedLead.primaryPhone ||
    (extractedEmailData?.clientPhone) ||
    ''
  ).trim();

  // Clean phone if it contains labels
  if (clientPhone.toLowerCase().startsWith('phone:') || clientPhone.toLowerCase().startsWith('tel:')) {
    clientPhone = clientPhone.replace(/^(?:phone|tel|cell|mobile)[:\s]*/i, '').trim();
  }

  // Extract Email
  let clientEmail = String(
    b.clientEmail ||
    b.email ||
    b.emailAddress ||
    b.email_address ||
    b.contact_email ||
    b.contactEmail ||
    consumer.email ||
    consumer.emailAddress ||
    nestedLead.email ||
    nestedLead.clientEmail ||
    (extractedEmailData?.clientEmail) ||
    ''
  ).trim();

  // If email was populated with raw text mistakenly or internal forwarding address, clean it
  if (clientEmail.length > 80 || clientEmail.includes('\n') || /angi\.com|homeadvisor\.com|zapier|service\.com|noreply/i.test(clientEmail)) {
    clientEmail = extractedEmailData?.clientEmail || '';
  }

  // Extract Address (or assemble street + city + state + zip from object or flat fields)
  const addrObj = (typeof b.address === 'object' && b.address !== null) ? b.address : (typeof consumer.address === 'object' ? consumer.address : {});
  
  let address = (typeof b.address === 'string' ? b.address : '') ||
    b.fullAddress ||
    b.full_address ||
    b.street_address ||
    b.streetAddress ||
    b.propertyAddress ||
    b.property_address ||
    b.location ||
    nestedLead.address ||
    (extractedEmailData?.address) ||
    '';

  if (!address && (addrObj.address1 || addrObj.street || addrObj.city || addrObj.state || addrObj.postalCode || addrObj.zip)) {
    const parts = [
      addrObj.address1 || addrObj.street,
      addrObj.address2,
      addrObj.city,
      addrObj.state,
      addrObj.postalCode || addrObj.zip
    ].filter(Boolean);
    address = parts.join(', ').trim();
  }

  if (!address && (b.street || b.address1 || b.city || b.state || b.zip || b.postal_code || b.postalCode)) {
    const parts = [
      b.street || b.address1,
      b.city,
      b.state,
      b.zip || b.postal_code || b.postalCode
    ].filter(Boolean);
    address = parts.join(', ').trim();
  }

  // Extract Service / Project Needed
  // Read email subject safely from webhook payload fields (emailSubject, email_subject, subject, Subject)
  const emailSubjectCandidate =
    b.emailSubject ||
    b.email_subject ||
    b.subject ||
    b.Subject ||
    nestedLead.emailSubject ||
    nestedLead.email_subject ||
    nestedLead.subject ||
    nestedLead.Subject ||
    '';

  const explicitService = String(
    b.serviceNeeded ||
    b.service_needed ||
    b.service ||
    b.task_name ||
    b.taskName ||
    b.taskDescription ||
    b.task_description ||
    b.project_type ||
    b.projectType ||
    b.category ||
    b.category_name ||
    b.job_type ||
    b.jobType ||
    task.name ||
    task.taskName ||
    task.description ||
    nestedLead.serviceNeeded ||
    nestedLead.taskName ||
    ''
  ).trim();

  const emailBodyService = String(extractedEmailData?.serviceNeeded || '').trim();
  const emailSubjectService = extractAngiServiceFromSubject(emailSubjectCandidate);
  const descriptionService = String(b.project_description || b.description || '').trim();

  // Priority: explicit service fields -> rawEmail -> emailSubject -> description -> default fallback
  const serviceNeeded =
    explicitService ||
    emailBodyService ||
    emailSubjectService ||
    descriptionService ||
    'Service details needed';

  // Extract Lead Source
  // Weakness 20: If missing, flag as "Source needs review" instead of defaulting to Angi
  const rawSource = String(
    b.leadSource ||
    b.source ||
    b.lead_source ||
    b.vendor ||
    nestedLead.leadSource ||
    nestedLead.source ||
    defaultSource ||
    ''
  ).trim();

  let leadSource = 'Source needs review';
  if (/thumbtack/i.test(rawSource)) {
    leadSource = 'Thumbtack';
  } else if (/angi|homeadvisor/i.test(rawSource)) {
    leadSource = 'Angi';
  } else if (/houzz/i.test(rawSource)) {
    leadSource = 'Houzz Pro';
  } else if (/referral/i.test(rawSource)) {
    leadSource = 'Referral';
  } else if (/website|web/i.test(rawSource)) {
    leadSource = 'Website';
  } else if (rawSource) {
    leadSource = rawSource;
  }

  // Extract Carrier / Fee / Notes
  const carrier = String(b.carrier || b.leadType || b.type || nestedLead.carrier || 'Direct').trim();
  const leadFee = String(
    b.leadFee ||
    b.lead_fee ||
    b.fee ||
    b.matchFee ||
    b.match_fee ||
    b.lead_price ||
    b.price ||
    b.cost ||
    nestedLead.fee ||
    nestedLead.leadFee ||
    (extractedEmailData?.leadFee) ||
    ''
  ).trim();

  // Weakness 27: Save incoming notes and project details to Google Sheets instead of wiping them out
  const rawNotes = String(
    b.notes ||
    b.description ||
    b.comments ||
    b.specialInstructions ||
    b.special_instructions ||
    b.details ||
    b.project_description ||
    nestedLead.notes ||
    nestedLead.description ||
    (extractedEmailData?.notes) ||
    ''
  ).trim();
  const notes = rawNotes;

  return {
    clientName,
    clientPhone,
    clientEmail,
    address,
    serviceNeeded,
    leadSource,
    leadFee,
    notes,
    rawPayload: b,
  };
}

// Deduplication cache for Google Sheets appends to guarantee leads are sent only once
const recentSheetAppends = new Map<string, number>();

function getSheetAppendKey(phone: string, name: string): string {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const cleanName = (name || '').toLowerCase().trim();
  return `${cleanPhone}_${cleanName}`;
}

function canAppendToSheet(phone: string, name: string): boolean {
  const key = getSheetAppendKey(phone, name);
  if (key === '_') return true;

  const now = Date.now();
  const lastTime = recentSheetAppends.get(key);
  if (lastTime && (now - lastTime) < 30000) {
    return false;
  }

  if (recentSheetAppends.size > 500) {
    for (const [k, t] of recentSheetAppends.entries()) {
      if (now - t > 60000) recentSheetAppends.delete(k);
    }
  }
  return true;
}

async function tryAutoAppendToGoogleSheet(
  lead: any,
  options: { force?: boolean } = {}
): Promise<boolean> {
  try {
    const phone = lead.clientPhone || lead.phone || lead.phoneNumber || '';
    const name = lead.clientName || lead.name || lead.fullName || '';
    if (!canAppendToSheet(phone, name)) {
      console.log(`[Google Sheet] Deduplicating auto-append for ${name} (${phone}) - already appended recently.`);
      return true;
    }

    const configFile = path.join(process.cwd(), 'data', 'config.json');
    // Weakness 28: Use central sheetsService.getDefaultSpreadsheetId()
    let spreadsheetId = sheetsService.getDefaultSpreadsheetId();
    if (fs.existsSync(configFile)) {
      try {
        const configData = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        if (configData.spreadsheetId) spreadsheetId = configData.spreadsheetId;
        if (configData.autoSyncToSheets === false && !options.force) return false;
      } catch {}
    }
    const targetTab = (lead.leadSource || 'Angi').trim();
    await sheetsService.appendLeadRow(spreadsheetId, targetTab, lead, lead.status || 'New');
    recentSheetAppends.set(getSheetAppendKey(phone, name), Date.now());
    return true;
  } catch (e) {
    console.warn('Server auto-append via Service Account note:', e);
    return false;
  }
}

function setIncomingLeadSheetSyncState(leadId: string, synced: boolean): void {
  try {
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    const leads = durableStore.safeReadJsonFile<any[]>('incoming_leads.json', []);
    const index = leads.findIndex((lead: any) => lead.id === leadId);
    if (index >= 0) {
      leads[index] = { ...leads[index], sheetSynced: synced };
      durableStore.safeWriteJsonFile('incoming_leads.json', leads);
    }
    durableStore.saveLeadMetadata({ leadId, sheetSynced: synced });
  } catch (error) {
    console.warn('[Google Sheet] Could not persist sync state:', error);
  }
}

function parseAddressForHouzz(addressStr: string) {
  if (!addressStr || typeof addressStr !== 'string') {
    return {
      fullAddress: '',
      streetAddress: '',
      address1: '',
      address2: '',
      city: '',
      state: '',
      zip: '',
      postalCode: '',
      street: '',
    };
  }

  const raw = addressStr.trim();
  let streetAddress = '';
  let city = '';
  let state = '';
  let zip = '';

  const zipMatch = raw.match(/\b\d{5}(?:-\d{4})?\b/);
  if (zipMatch) {
    zip = zipMatch[0];
  }

  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length >= 3) {
    streetAddress = parts[0];
    city = parts[1];
    const stateZipPart = parts.slice(2).join(' ').trim();
    const stateMatch = stateZipPart.match(/([A-Z]{2})/i);
    if (stateMatch) {
      state = stateMatch[1].toUpperCase();
    }
  } else if (parts.length === 2) {
    const part0 = parts[0];
    const part1 = parts[1];
    if (/\b\d{5}\b/.test(part1)) {
      const stateMatch = part1.match(/([A-Z]{2})/i);
      if (stateMatch) {
        state = stateMatch[1].toUpperCase();
        city = part1.replace(stateMatch[0], '').replace(/\b\d{5}(?:-\d{4})?\b/, '').trim();
      }
      streetAddress = part0;
    } else {
      streetAddress = part0;
      city = part1;
    }
  } else {
    streetAddress = raw;
  }

  return {
    fullAddress: raw,
    streetAddress: streetAddress || raw,
    address1: streetAddress || raw,
    address2: '',
    city: city || '',
    state: state || '',
    zip: zip || '',
    postalCode: zip || '',
    street: streetAddress || raw,
  };
}

function isAutoSendToHouzzEnabled(): boolean {
  try {
    const configFile = path.join(process.cwd(), 'data', 'config.json');
    if (fs.existsSync(configFile)) {
      const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      if (typeof cfg.autoSendToHouzz === 'boolean') {
        return cfg.autoSendToHouzz;
      }
    }
  } catch {}
  return false;
}

function isGeneratedPlaceholderLeadName(value: unknown): boolean {
  const name = String(value || '').trim();
  return /^new\s+.+\s+lead$/i.test(name) || /^unnamed\s+client$/i.test(name);
}

function saveIncomingLeadAndLog(
  parsed: any,
  req: express.Request,
  options: { skipAutoSheet?: boolean; skipAutoHouzz?: boolean } = {}
) {
  const clientName = String(parsed?.clientName || '').trim();
  if (!clientName || isGeneratedPlaceholderLeadName(clientName)) {
    const validationError: any = new Error('Customer name could not be extracted. No CRM lead was created.');
    validationError.status = 422;
    throw validationError;
  }
  parsed.clientName = clientName;

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const incomingFile = path.join(dataDir, 'incoming_leads.json');
  let existingLeads: any[] = [];
  if (fs.existsSync(incomingFile)) {
    try {
      existingLeads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
    } catch {}
  }

  const externalEventId = String(
    parsed.sourceEventId || parsed.eventId || parsed.leadId || parsed.rawPayload?.id ||
    parsed.rawPayload?.eventId || parsed.rawPayload?.leadId ||
    String(parsed.rawPayload?.rawEmail || '').match(/#(\d{6,})/)?.[1] || ''
  ).trim();
  const stableInput = externalEventId || [
    parsed.leadSource, parsed.clientPhone, parsed.clientEmail, parsed.clientName, parsed.serviceNeeded
  ].map((value) => String(value || '').trim().toLowerCase()).join('|');
  const stableHash = createHash('sha256').update(stableInput).digest('hex').slice(0, 20);
  const leadId = `wh_lead_${stableHash}`;
  const newestOrder = Date.now();
  const now = new Date(newestOrder).toISOString();

  const existingLead = existingLeads.find((item: any) => item.id === leadId);
  if (existingLead) return existingLead;

  const newLeadRecord = {
    id: leadId,
    createdAt: now,
    newestOrder,
    clientName: parsed.clientName,
    clientPhone: parsed.clientPhone,
    clientEmail: parsed.clientEmail,
    address: parsed.address,
    leadSource: parsed.leadSource,
    angiAccount: parsed.leadSource === 'Angi' ? 'not_identified' : undefined,
    serviceNeeded: parsed.serviceNeeded,
    leadFee: parsed.leadFee,
    notes: parsed.notes,
    status: 'New',
    isWebhookLead: true,
    webhookSource: parsed.leadSource,
    sheetSynced: false,
    rawPayload: parsed.rawPayload,
  };

  durableStore.saveLeadMetadata({
    leadId: `order_${canonicalContactKey(newLeadRecord)}`,
    createdAt: newLeadRecord.createdAt,
    newestOrder: newLeadRecord.newestOrder,
  });

  existingLeads.unshift(newLeadRecord);
  // Weakness 9: If storage exceeds 500 leads, archive synced leads instead of dropping unsynced leads
  if (existingLeads.length > 500) {
    const archiveFile = path.join(dataDir, 'archived_leads.json');
    let archived: any[] = [];
    if (fs.existsSync(archiveFile)) {
      try { archived = JSON.parse(fs.readFileSync(archiveFile, 'utf-8')); } catch {}
    }
    const retained: any[] = [];
    for (let i = 0; i < existingLeads.length; i++) {
      const l = existingLeads[i];
      if (i < 500) {
        retained.push(l);
      } else if (!l.sheetSynced) {
        // Retain unsynced leads to ensure no unsynced data is lost
        retained.push(l);
      } else {
        archived.push(l);
      }
    }
    existingLeads = retained;
    try {
      fs.writeFileSync(archiveFile, JSON.stringify(archived.slice(0, 2000), null, 2), 'utf-8');
    } catch {}
  }
  fs.writeFileSync(incomingFile, JSON.stringify(existingLeads, null, 2), 'utf-8');

  // Track webhook status timestamp
  const statusFile = path.join(dataDir, 'webhook_status.json');
  let webhookStatus: any = {};
  if (fs.existsSync(statusFile)) {
    try { webhookStatus = JSON.parse(fs.readFileSync(statusFile, 'utf-8')); } catch {}
  }
  webhookStatus.lastRealWebhookAt = now;
  if (parsed.leadSource === 'Angi' || req.path?.includes('angi')) {
    webhookStatus.lastRealAngiWebhookAt = now;
  }
  try {
    fs.writeFileSync(statusFile, JSON.stringify(webhookStatus, null, 2), 'utf-8');
  } catch {}

  // Record in Webhook Logs (Weakness 7: Mask phone number in log preview)
  const logsFile = path.join(dataDir, 'webhook_logs.json');
  let logs: any[] = [];
  if (fs.existsSync(logsFile)) {
    try { logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8')); } catch {}
  }
  logs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    receivedAt: now,
    source: parsed.leadSource,
    clientName: parsed.clientName,
    clientPhone: maskPhoneNumber(parsed.clientPhone),
    clientEmail: maskEmailAddress(parsed.clientEmail),
    success: true,
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    leadId: leadId,
    payloadSnippet: { source: parsed.leadSource, fieldsPresent: {
      name: Boolean(parsed.clientName), phone: Boolean(parsed.clientPhone),
      email: Boolean(parsed.clientEmail), address: Boolean(parsed.address),
      service: Boolean(parsed.serviceNeeded)
    } },
  });
  if (logs.length > 150) {
    logs = logs.slice(0, 150);
  }
  fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2), 'utf-8');

  // Record in Activity Audit Logs
  try {
    const activityFile = path.join(dataDir, 'activity_logs.json');
    let activityLogs: any[] = [];
    if (fs.existsSync(activityFile)) {
      try { activityLogs = JSON.parse(fs.readFileSync(activityFile, 'utf-8')); } catch {}
    }
    activityLogs.unshift({
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: now,
      user: {
        displayName: `${parsed.leadSource} Webhook`,
        email: 'info@mrcontract.us',
      },
      actionType: 'add_lead',
      clientName: parsed.clientName,
      clientPhone: parsed.clientPhone,
      tabName: parsed.leadSource,
      details: `Incoming lead auto-created via ${parsed.leadSource} Webhook: "${parsed.clientName}" (${parsed.serviceNeeded || 'Service'})`,
    });
    if (activityLogs.length > 1000) activityLogs = activityLogs.slice(0, 1000);
    fs.writeFileSync(activityFile, JSON.stringify(activityLogs, null, 2), 'utf-8');
  } catch (e) {}

  // Attempt automatic background append to Google Sheet if connected (unless skipped)
  if (!options.skipAutoSheet) {
    tryAutoAppendToGoogleSheet(newLeadRecord).then((synced) => {
      if (synced) {
        newLeadRecord.sheetSynced = true;
        try {
          const fileContent = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
          const idx = fileContent.findIndex((l: any) => l.id === leadId);
          if (idx !== -1) {
            fileContent[idx].sheetSynced = true;
            fs.writeFileSync(incomingFile, JSON.stringify(fileContent, null, 2), 'utf-8');
          }
        } catch {}
      }
    });
  }

  // Attempt automatic background forward to Houzz Pro / Zapier webhook without clicking anything (unless skipped)
  const normalizedSource = String(newLeadRecord.leadSource || '').trim().toLowerCase();
  const shouldAutoSendToHouzz = !options.skipAutoHouzz && normalizedSource !== 'thumbtack' && (normalizedSource === 'angi' || isAutoSendToHouzzEnabled());
  if (shouldAutoSendToHouzz) {
    try {
      const houzzUrl = getBackendWebhookUrl();
      houzzDelivery.dispatchLeadToHouzz({
        leadId,
        payload: newLeadRecord,
        webhookUrl: houzzUrl,
      }).catch((err) => {
        console.error('[Houzz Auto-Send Error]:', err);
      });
    } catch (err) {}
  }

  return newLeadRecord;
}

// 1. Dedicated Angi Webhook (HomeAdvisor / Angi Leads via Zapier or Webhook)
app.post('/api/webhooks/angi', async (req, res) => {
  try {
    const clientIp = (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string;
    if (isWebhookRateLimited(clientIp)) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded. Too many requests.' });
    }
    if (!validateWebhookSecret(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Invalid webhook secret token.' });
    }

    console.log('[Webhook] Authenticated Angi lead received.');
    const parsed = await parseIncomingLeadPayload(req.body, 'Angi');
    const lead = saveIncomingLeadAndLog(parsed, req, { skipAutoSheet: true, skipAutoHouzz: true });

    // Sheets is part of the Angi transaction: wait for a confirmed append before
    // reporting the result. A failed append is queued for automatic retry.
    const sheetSynced = await tryAutoAppendToGoogleSheet(lead, { force: true });
    setIncomingLeadSheetSyncState(lead.id, sheetSynced);
    lead.sheetSynced = sheetSynced;
    if (!sheetSynced) {
      durableStore.enqueueDelivery(lead.id, 'sheets', lead, lead.leadSource || 'Angi');
    }

    const houzzResult = await houzzDelivery.dispatchLeadToHouzz({
      leadId: lead.id,
      payload: lead,
      webhookUrl: getBackendWebhookUrl(),
    });

    return res.status(200).json({
      success: true,
      message: sheetSynced
        ? (houzzResult.success
            ? 'Angi lead saved in CRM and Google Sheets; Zapier accepted Houzz delivery and confirmation is pending.'
            : 'Angi lead saved in CRM and Google Sheets, but Zapier delivery failed.')
        : (houzzResult.success
            ? 'Angi lead saved in CRM and sent to Zapier. Google Sheets sync is queued for automatic retry.'
            : 'Angi lead saved in CRM. Google Sheets retry is queued and Zapier delivery failed.'),
      leadId: lead.id,
      lead,
      sheetSync: {
        success: sheetSynced,
        status: sheetSynced ? 'synced' : 'queued_for_retry',
      },
      houzzDelivery: houzzResult,
    });
  } catch (err: any) {
    console.error('Error processing Angi webhook:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 2. Dedicated Thumbtack Webhook (Thumbtack for Pros via Zapier or Webhook)
app.post('/api/webhooks/thumbtack', async (req, res) => {
  try {
    const clientIp = (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string;
    if (isWebhookRateLimited(clientIp)) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded. Too many requests.' });
    }
    if (!validateThumbtackBasicAuth(req)) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Thumbtack Webhook"');
      return res.status(401).json({ success: false, error: 'Unauthorized. Valid Thumbtack Basic Authentication is required.' });
    }

    console.log('[Webhook] Authenticated Thumbtack lead received.');
    const parsed = await parseIncomingLeadPayload(req.body, 'Thumbtack');
    const lead = saveIncomingLeadAndLog(parsed, req, { skipAutoHouzz: true });

    return res.status(200).json({
      success: true,
      message: 'Thumbtack lead received and recorded successfully.',
      leadId: lead.id,
      lead,
    });
  } catch (err: any) {
    console.error('Error processing Thumbtack webhook:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 3. Universal Webhook (Accepts any lead source or auto-detects)
// Weakness 20: Do not default missing source to 'Angi'
app.post('/api/webhooks/incoming-lead', async (req, res) => {
  try {
    const clientIp = (req.ip || req.headers['x-forwarded-for'] || 'unknown') as string;
    if (isWebhookRateLimited(clientIp)) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded. Too many requests.' });
    }
    if (!validateWebhookSecret(req)) {
      return res.status(401).json({ success: false, error: 'Unauthorized. Invalid webhook secret token.' });
    }

    console.log('[Webhook] Authenticated universal lead received.');
    const parsed = await parseIncomingLeadPayload(req.body, '');
    const lead = saveIncomingLeadAndLog(parsed, req);

    return res.status(200).json({
      success: true,
      message: `New ${lead.leadSource} lead received and recorded successfully.`,
      leadId: lead.id,
      lead,
    });
  } catch (err: any) {
    console.error('Error processing incoming lead webhook:', err);
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

// 3.5 Test Email Parser endpoint (inspect extraction results from email text without committing or optionally creating)
app.post('/api/webhooks/parse-email', async (req, res) => {
  try {
    const { emailText, createLead, source } = req.body;
    if (!emailText || typeof emailText !== 'string') {
      return res.status(400).json({ success: false, message: 'emailText is required.' });
    }
    const defaultSource = source || 'Angi';
    const parsed = await parseIncomingLeadPayload({ rawEmail: emailText, leadSource: defaultSource }, defaultSource);

    if (createLead) {
      const lead = saveIncomingLeadAndLog(parsed, req);
      return res.json({ success: true, parsed, lead, created: true });
    }

    return res.json({ success: true, parsed, created: false });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

function isExampleOrTestLead(lead: any): boolean {
  if (!lead) return false;
  const name = (lead.clientName || '').trim().toLowerCase();
  if (isGeneratedPlaceholderLeadName(name)) return true;
  const source = String(lead.leadSource || lead.webhookSource || '').trim().toLowerCase();

  // Thumbtack's official test delivery must remain visible so administrators
  // can verify the direct webhook without waiting for a real customer.
  if (source === 'thumbtack' && (name.includes('test customer') || name.includes('test lead'))) {
    return false;
  }

  const email = (lead.clientEmail || '').trim().toLowerCase();
  const phone = (lead.clientPhone || '').replace(/\D/g, '');
  const addr = (lead.address || '').toLowerCase();

  if (email.includes('example.com') || email.includes('@test.') || email.includes('testangi@')) return true;

  const exampleNames = [
    'jan mccoy',
    'sarah jenkins',
    'michael rodriguez',
    'cory rockwood',
    'amanda miller',
    'robert patterson',
    'test angi client',
    'test thumbtack user',
    'sample client',
    'test client',
    'test',
    'test 1',
    'test test',
    'test web form',
  ];

  if (
    exampleNames.includes(name) ||
    name.startsWith('test ') ||
    name.includes('sample client') ||
    name.startsWith('robert patterson')
  ) {
    return true;
  }

  if (phone.startsWith('412555') || phone.includes('5550144') || phone.includes('5550188') || phone.includes('5559988')) {
    return true;
  }

  if (addr.includes('evergreen terrace') || addr.includes('100 liberty ave')) {
    return true;
  }

  return false;
}

// Zapier must call this after its Houzz Pro action finishes.
app.post('/api/integrations/houzz-result', (req, res) => {
  if (!validateHouzzCallback(req)) {
    return res.status(401).json({ success: false, error: 'Invalid Houzz callback secret.' });
  }
  const leadId = String(req.body?.leadId || req.body?.idempotencyKey || '').trim();
  const successful = req.body?.success === true || ['success', 'created', 'confirmed'].includes(String(req.body?.status || '').toLowerCase());
  if (!leadId) return res.status(400).json({ success: false, error: 'leadId is required.' });
  const activityStatus = successful ? 'Created in Houzz Pro' : 'Failed in Houzz Pro';
  houzzDelivery.updateLeadHouzzState(leadId, {
    activityStatus,
    destinationLabel: 'Houzz Pro',
    statusCode: Number(req.body?.statusCode || 0) || null,
    error: successful ? undefined : String(req.body?.error || 'Houzz Pro action failed.').slice(0, 200),
    attemptAt: new Date().toISOString(),
    success: successful,
  });
  return res.json({ success: true, leadId, status: activityStatus });
});

// Canonical lead API: Google Sheets is the source of truth for Sidebar -> New.
function canonicalContactKey(lead: any): string {
  const phone = String(lead?.clientPhone || '').replace(/\D/g, '');
  if (phone.length >= 7) return `phone_${phone.slice(-10)}`;
  const email = String(lead?.clientEmail || '').trim().toLowerCase();
  if (email.includes('@')) return `email_${email}`;
  return `name_${String(lead?.clientName || '').trim().toLowerCase()}`;
}

function getLeadNewestOrder(lead: any): number {
  const explicitOrder = Number(lead?.newestOrder || 0);
  if (Number.isFinite(explicitOrder) && explicitOrder > 0) return explicitOrder;

  const parsedTime = new Date(String(lead?.createdAt || '')).getTime();
  return Number.isFinite(parsedTime) && parsedTime > 0 ? parsedTime : 0;
}

function configuredLeadSourceTabs(): string[] {
  const fallback = ['Angi', 'Thumbtack', 'Referral', 'Big Fish', 'Houzz Pro', 'Roof R', 'Home Launch', 'Website', 'Yard Sign', 'Other'];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'config.json'), 'utf8'));
    const values = Array.isArray(cfg.leadSources) ? cfg.leadSources : fallback;
    return values.filter((name: any) => {
      const clean = String(name || '').trim().toLowerCase();
      return clean && !clean.includes('summary') && !clean.includes('zapier');
    });
  } catch {
    return fallback;
  }
}

async function readCanonicalNewLeads(forceFresh = false): Promise<any[]> {
  const spreadsheetId = sheetsService.getDefaultSpreadsheetId();
  const details = await sheetsService.getSpreadsheetDetails(spreadsheetId, forceFresh);
  const tabs = details.sheets
    .map((sheet) => sheet.title)
    .filter((title) => {
      const normalized = title.trim().toLowerCase();
      return normalized &&
        !normalized.startsWith('_') &&
        !normalized.includes('summary') &&
        !normalized.includes('dashboard') &&
        !normalized.includes('zapier') &&
        !normalized.includes('appointment') &&
        !normalized.includes('history');
    });
  const result = tabs.length
    ? await sheetsService.readAllTabs(spreadsheetId, tabs, forceFresh)
    : { headers: sheetsService.DEFAULT_SHEET_HEADERS, rows: [] };
  let transient: any[] = [];
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'incoming_leads.json'), 'utf8'));
    if (Array.isArray(raw)) transient = raw;
  } catch {}

  const transientByContact = new Map(transient.map((lead) => [canonicalContactKey(lead), lead]));
  const seen = new Set<string>();
  const leads: any[] = [];

  for (const row of result.rows || []) {
    const status = String(row.status || 'New').trim().toLowerCase();
    if (!['new', 'new lead', 'active', 'uncontacted', 'pending', 'new inquiry'].includes(status)) continue;
    if (isGeneratedPlaceholderLeadName(row.clientName)) continue;
    const sheetLead = {
      id: `sheet_${encodeURIComponent(row.tabName || row.leadSource || 'Other')}_${row.rowIndex}`,
      createdAt: row.timestamp || new Date(0).toISOString(),
      clientName: row.clientName || 'Unnamed Client',
      clientPhone: row.clientPhone || '',
      clientEmail: row.clientEmail || '',
      address: row.address || '',
      leadSource: row.leadSource || row.tabName || 'Other',
      serviceNeeded: row.leadType || '',
      leadFee: row.rawValues?.[6] || '',
      notes: '',
      status: 'New',
      rowIndex: row.rowIndex,
      statusColIndex: row.statusColIndex,
      sheetSynced: true,
    };
    const key = canonicalContactKey(sheetLead);
    const orderMetadata = durableStore.getLeadMetadata(`order_${key}`);
    const orderedSheetLead = orderMetadata
      ? {
          ...sheetLead,
          createdAt: orderMetadata.createdAt || sheetLead.createdAt,
          newestOrder: orderMetadata.newestOrder,
        }
      : sheetLead;
    const metadata = transientByContact.get(key);
    const contactMerged = metadata
      ? {
          ...orderedSheetLead,
          ...metadata,
          newestOrder: metadata.newestOrder || orderMetadata?.newestOrder,
          rowIndex: row.rowIndex,
          statusColIndex: row.statusColIndex,
          sheetSynced: true,
        }
      : orderedSheetLead;
    const durableMetadata = durableStore.getLeadMetadata(contactMerged.id);
    const merged = durableMetadata
      ? { ...contactMerged, ...durableMetadata, id: contactMerged.id, rowIndex: row.rowIndex, statusColIndex: row.statusColIndex, sheetSynced: true }
      : contactMerged;
    // Every row explicitly saved in Google Sheets is a real CRM record, even
    // when its name contains "Test". Do not hide form-created validation leads
    // during the background refresh.
    if (!seen.has(key)) {
      seen.add(key);
      leads.push(merged);
    }
  }

  // Show a newly received webhook immediately while its background Sheet append is pending.
  for (const lead of transient) {
    const key = canonicalContactKey(lead);
    const status = String(lead.status || 'New').trim().toLowerCase();
    if (!seen.has(key) && ['new', 'new lead', 'active'].includes(status) && !isExampleOrTestLead(lead)) {
      seen.add(key);
      const durableMetadata = durableStore.getLeadMetadata(lead.id);
      leads.push({ ...lead, ...(durableMetadata || {}), id: lead.id, sheetSynced: false });
    }
  }

  return leads.sort((a, b) => {
    const orderDifference = getLeadNewestOrder(b) - getLeadNewestOrder(a);
    if (orderDifference !== 0) return orderDifference;
    return Number(b.rowIndex || 0) - Number(a.rowIndex || 0);
  });
}

app.get('/api/leads', async (req, res) => {
  try {
    const requestedStatus = String(req.query.status || 'New').trim().toLowerCase();
    if (requestedStatus !== 'new') return res.status(400).json({ success: false, error: 'Only status=New is supported by this endpoint.' });
    const leads = await readCanonicalNewLeads(req.query.force === '1');
    return res.json({ success: true, status: 'New', count: leads.length, leads });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Unable to load leads.' });
  }
});

app.patch('/api/leads/:id/angi-account', (req, res) => {
  try {
    const leadId = String(req.params.id || '').trim();
    const angiAccount = String(req.body?.angiAccount || '').trim();
    const allowedAccounts = new Set(['not_identified', 'dxg', 'mr_contract']);
    if (!leadId) return res.status(400).json({ success: false, error: 'Lead ID is required.' });
    if (!allowedAccounts.has(angiAccount)) {
      return res.status(400).json({ success: false, error: 'Invalid Angi account identification.' });
    }

    const metadata = durableStore.saveLeadMetadata({
      leadId,
      angiAccount: angiAccount as 'not_identified' | 'dxg' | 'mr_contract',
    });

    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    if (fs.existsSync(incomingFile)) {
      const incomingLeads = durableStore.safeReadJsonFile<any[]>('incoming_leads.json', []);
      const index = incomingLeads.findIndex((lead: any) => lead.id === leadId);
      if (index >= 0) {
        incomingLeads[index] = { ...incomingLeads[index], angiAccount };
        durableStore.safeWriteJsonFile('incoming_leads.json', incomingLeads);
      }
    }

    return res.json({ success: true, leadId, angiAccount, metadata });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Unable to update Angi account.' });
  }
});

app.post('/api/leads/manual', async (req, res) => {
  try {
    const body = req.body || {};
    const clientName = String(body.clientName || '').trim();
    const leadSource = String(body.leadSource || 'Other').trim();
    if (!clientName) return res.status(400).json({ success: false, error: 'Client name is required.' });
    const newestOrder = Date.now();
    const lead = {
      id: `manual_${newestOrder}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date(newestOrder).toISOString(),
      newestOrder,
      clientName,
      clientPhone: String(body.clientPhone || '').trim(),
      clientEmail: String(body.clientEmail || '').trim(),
      address: String(body.address || '').trim(),
      leadSource,
      angiAccount: leadSource.toLowerCase() === 'angi' ? 'not_identified' : undefined,
      serviceNeeded: String(body.serviceNeeded || '').trim(),
      leadFee: String(body.leadFee || '').trim(),
      notes: String(body.notes || '').trim(),
      status: 'New',
      sourceEventId: String(body.id || ''),
    };
    durableStore.saveLeadMetadata({
      leadId: `order_${canonicalContactKey(lead)}`,
      createdAt: lead.createdAt,
      newestOrder: lead.newestOrder,
    });
    const result = await sheetsService.appendLeadRow(sheetsService.getDefaultSpreadsheetId(), leadSource, lead, 'New');
    sheetsService.invalidateServerCache();

    // Dispatch the exact same normalized object that was written to Sheets.
    // This prevents browser state or stale Zapier samples from changing the client name.
    const houzzResult = await houzzDelivery.dispatchLeadToHouzz({
      leadId: lead.id,
      payload: lead,
      webhookUrl: getBackendWebhookUrl(),
    });

    return res.status(201).json({
      success: true,
      lead: {
        ...lead,
        sheetSynced: true,
        houzzStatus: houzzResult.activityStatus,
        houzzResult: houzzResult.activityStatus,
      },
      sheet: result,
      houzzDelivery: houzzResult,
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Unable to save lead.' });
  }
});

app.post('/api/leads/migrate', async (req, res) => {
  try {
    const leads = Array.isArray(req.body?.leads) ? req.body.leads.slice(0, 250) : [];
    let migrated = 0;
    let skipped = 0;
    for (const item of leads) {
      const clientName = String(item?.clientName || '').trim();
      if (!clientName || isExampleOrTestLead(item)) { skipped++; continue; }
      const leadSource = String(item.leadSource || 'Other').trim();
      await sheetsService.appendLeadRow(
        sheetsService.getDefaultSpreadsheetId(),
        leadSource,
        { ...item, clientName, leadSource, sourceEventId: item.id || '' },
        'New'
      );
      migrated++;
    }
    sheetsService.invalidateServerCache();
    return res.json({ success: true, migrated, skipped });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Lead migration failed.' });
  }
});

// 4. Fetch all Incoming Webhook Leads (for UI consumption)
app.get('/api/webhooks/incoming-leads', (req, res) => {
  try {
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    if (fs.existsSync(incomingFile)) {
      const data = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
      const list = Array.isArray(data) ? data : [];
      const filtered = list.filter((l: any) => !isExampleOrTestLead(l));
      if (filtered.length !== list.length) {
        fs.writeFileSync(incomingFile, JSON.stringify(filtered, null, 2), 'utf-8');
      }
      return res.json({ success: true, leads: filtered });
    }
    return res.json({ success: true, leads: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/webhooks/incoming-leads/:id/send-to-houzz', async (req, res) => {
  try {
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    if (!fs.existsSync(incomingFile)) return res.status(404).json({ success: false, error: 'Lead not found.' });
    const leads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
    const lead = Array.isArray(leads) ? leads.find((item: any) => item.id === req.params.id) : null;
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found.' });
    const source = String(lead.leadSource || lead.webhookSource || '').trim().toLowerCase();
    if (source !== 'thumbtack') return res.status(403).json({ success: false, error: 'Only Thumbtack leads can be sent manually. Angi leads are sent automatically.' });
    const existingStatus = String(lead.houzzStatus || lead.houzzResult || '').toLowerCase();
    if (existingStatus.startsWith('sent to ')) return res.status(409).json({ success: false, error: 'This lead has already been sent to Houzz Pro.' });
    const result = await houzzDelivery.dispatchLeadToHouzz({ leadId: lead.id, payload: lead, webhookUrl: getBackendWebhookUrl() });
    return res.status(result.success ? 200 : 502).json({ success: result.success, message: result.safeSummary, delivery: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Houzz delivery failed.' });
  }
});

// 5. Update an incoming lead status or client information (Name, Phone, Email, Address, etc.)
app.patch('/api/webhooks/incoming-leads/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { clientName, clientPhone, clientEmail, address, serviceNeeded, leadSource, angiAccount, leadFee, status, notes, sheetSynced } = req.body;
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    if (!fs.existsSync(incomingFile)) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }
    const leads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
    const index = leads.findIndex((l: any) => l.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Lead not found.' });
    }
    if (clientName !== undefined) leads[index].clientName = clientName;
    if (clientPhone !== undefined) leads[index].clientPhone = clientPhone;
    if (clientEmail !== undefined) leads[index].clientEmail = clientEmail;
    if (address !== undefined) leads[index].address = address;
    if (serviceNeeded !== undefined) leads[index].serviceNeeded = serviceNeeded;
    if (leadSource !== undefined) leads[index].leadSource = leadSource;
    if (angiAccount !== undefined && ['not_identified', 'dxg', 'mr_contract'].includes(String(angiAccount))) {
      leads[index].angiAccount = angiAccount;
      durableStore.saveLeadMetadata({ leadId: id, angiAccount });
    }
    if (leadFee !== undefined) leads[index].leadFee = leadFee;
    if (status !== undefined) leads[index].status = status;
    if (notes !== undefined) leads[index].notes = notes;
    if (sheetSynced !== undefined) leads[index].sheetSynced = sheetSynced;
    fs.writeFileSync(incomingFile, JSON.stringify(leads, null, 2), 'utf-8');
    return res.json({ success: true, lead: leads[index] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Delete all incoming webhook leads or a single lead
app.delete('/api/webhooks/incoming-leads', (req, res) => {
  try {
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    fs.writeFileSync(incomingFile, JSON.stringify([], null, 2), 'utf-8');
    return res.json({ success: true, message: 'All incoming webhook leads cleared successfully.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/webhooks/incoming-leads/:id', (req, res) => {
  try {
    const { id } = req.params;
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    if (fs.existsSync(incomingFile)) {
      let leads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
      leads = leads.filter((l: any) => l.id !== id);
      fs.writeFileSync(incomingFile, JSON.stringify(leads, null, 2), 'utf-8');
    }
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get Webhook Logs (recent activity and payloads for debugging)
app.get('/api/webhooks/logs', (req, res) => {
  try {
    const logsFile = path.join(process.cwd(), 'data', 'webhook_logs.json');
    if (fs.existsSync(logsFile)) {
      const logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
      return res.json({ success: true, logs: Array.isArray(logs) ? logs : [] });
    }
    return res.json({ success: true, logs: [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Test Webhook Trigger (generates realistic test lead for Angi or Thumbtack)
// Server-side Google Calendar API endpoints
function resolveCalendarId(reqCalendarId?: string): string {
  if (reqCalendarId && reqCalendarId.trim() && reqCalendarId.trim() !== 'primary') {
    return reqCalendarId.trim();
  }
  if (process.env.GOOGLE_CALENDAR_ID && process.env.GOOGLE_CALENDAR_ID.trim()) {
    return process.env.GOOGLE_CALENDAR_ID.trim();
  }
  try {
    const cfgPath = path.join(process.cwd(), 'data', 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (cfg && cfg.calendarId && typeof cfg.calendarId === 'string' && cfg.calendarId.trim()) {
        return cfg.calendarId.trim();
      }
    }
  } catch {}
  return (reqCalendarId && reqCalendarId.trim()) || 'primary';
}

async function getCalendarAuthDetails(req: any) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token && token !== 'null' && token !== 'undefined') {
      return { token, source: 'bearer', email: null };
    }
  }

  // 1. Check data/google_auth.json for stored master Google user token
  try {
    const authFile = path.join(process.cwd(), 'data', 'google_auth.json');
    if (fs.existsSync(authFile)) {
      const authData = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      if (authData && authData.accessToken && !authData.tokenExpired) {
        return { token: authData.accessToken.trim(), source: 'google_auth_json', email: authData.user?.email || null };
      }
    }
  } catch (e) {}

  // 2. Check service account JWT client ONLY IF an explicit shared calendar ID is configured (service accounts cannot query "primary")
  const calendarId = resolveCalendarId(req.query?.calendarId as string);
  if (calendarId && calendarId !== 'primary') {
    try {
      const sa = sheetsService.getServiceAccountClient();
      if (sa.client) {
        const tokenRes = await sa.client.getAccessToken();
        if (tokenRes && tokenRes.token) {
          return { token: tokenRes.token, source: 'service_account', email: sa.clientEmail || null };
        }
      }
    } catch (e) {}
  }

  return { token: null, source: 'none', email: null };
}

function getClientOAuthToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization || '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return token || undefined;
  }
  return undefined;
}

// Calendar Diagnostics & Health Endpoint
app.get('/api/calendar/status', async (req, res) => {
  try {
    const clientToken = getClientOAuthToken(req);
    const health = await calendarService.getCalendarHealthStatus(req.query.calendarId as string, clientToken);
    res.json({
      success: health.connected,
      ...health,
      timeZone: process.env.TIME_ZONE || 'America/New_York',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, connected: false, error: err.message });
  }
});

app.get('/api/calendar/events', async (req, res) => {
  try {
    const clientToken = getClientOAuthToken(req);
    const result = await calendarService.listCalendarEvents({
      calendarId: req.query.calendarId as string,
      timeMin: req.query.timeMin as string,
      timeMax: req.query.timeMax as string,
      clientToken,
    });
    if (!result.success && result.status) {
      return res.status(result.status).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message, events: [] });
  }
});

app.post('/api/calendar/events', async (req, res) => {
  try {
    const clientToken = getClientOAuthToken(req);
    const result = await calendarService.createCalendarEvent(req.body, req.query.calendarId as string, clientToken);
    if (!result.success && result.status) {
      return res.status(result.status).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/calendar/events/:eventId', async (req, res) => {
  try {
    const clientToken = getClientOAuthToken(req);
    const result = await calendarService.updateCalendarEvent(req.params.eventId, req.body, req.query.calendarId as string, clientToken);
    if (!result.success && result.status) {
      return res.status(result.status).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/calendar/events/:eventId', async (req, res) => {
  try {
    const clientToken = getClientOAuthToken(req);
    const result = await calendarService.deleteCalendarEvent(req.params.eventId, req.query.calendarId as string, clientToken);
    if (!result.success && result.status) {
      return res.status(result.status).json(result);
    }
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/webhooks/test', async (req, res) => {
  try {
    const { source = 'Angi' } = req.body;
    const isThumbtack = /thumbtack/i.test(source);

    const testPayload = isThumbtack
      ? {
          clientName: 'Michael Rodriguez',
          clientPhone: '(412) 555-0188',
          clientEmail: 'm.rodriguez@example.com',
          address: '456 Penn Ave, Pittsburgh, PA 15222',
          serviceNeeded: 'Brick Chimney Repair & Tuck-Pointing',
          leadSource: 'Thumbtack',
          leadFee: '$38.00',
          notes: '',
        }
      : {
          clientName: 'Sarah Jenkins',
          clientPhone: '(412) 555-0144',
          clientEmail: 'sarah.jenkins@example.com',
          address: '789 Forbes Ave, Pittsburgh, PA 15213',
          serviceNeeded: 'Front Porch Retaining Wall Rebuild',
          leadSource: 'Angi',
          leadFee: '$42.50',
          notes: '',
        };

    const parsed = await parseIncomingLeadPayload(testPayload, isThumbtack ? 'Thumbtack' : 'Angi');
    const lead = saveIncomingLeadAndLog(parsed, req);

    return res.json({
      success: true,
      message: `Test ${lead.leadSource} lead created successfully!`,
      lead,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Full End-to-End Pipeline Test endpoint
app.post('/api/webhooks/test-pipeline', async (req, res) => {
  try {
    const { rawEmail, source = 'Angi', syncToSheets = true, sendToHouzz = true } = req.body;
    const testSample = rawEmail || `Angi
You have a new lead!
Clean and Inspect a Wood Fireplace Chimney

Customer Information
JAN MCCOY
(412) 491-2719
janrealmccoy@yahoo.com
631 W Waldheim Rd, Pittsburgh, PA 15215

Lead Details:
Need full chimney inspection and tuckpointing quote.
Lead Fee: $45.00`;

    // 1. Ingestion & Field Extraction
    const parsed = await parseIncomingLeadPayload({ rawEmail: testSample, leadSource: source }, source);

    // 2. In-App CRM Storage (skip background auto-sheet & auto-houzz because test-pipeline runs them explicitly in steps 3 & 4)
    const savedLead = saveIncomingLeadAndLog(parsed, req, { skipAutoSheet: true, skipAutoHouzz: true });

    // 3. Google Sheets Append
    let sheetsResult: any = { attempted: syncToSheets, success: false };
    if (syncToSheets) {
      try {
        const configFile = path.join(process.cwd(), 'data', 'config.json');
        let spreadsheetId = '1arAGlZO9VyY1St_ywT9ZtEaKyLaFfr3RIzw0-ebhJX0';
        if (fs.existsSync(configFile)) {
          try {
            const configData = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
            if (configData.spreadsheetId) spreadsheetId = configData.spreadsheetId;
          } catch {}
        }
        const targetTab = (parsed.leadSource || 'Angi').trim();
        const appendRes = await sheetsService.appendLeadRow(spreadsheetId, targetTab, parsed, 'New');
        sheetsResult = { attempted: true, success: true, targetTab, details: appendRes };
      } catch (sheetErr: any) {
        sheetsResult = { attempted: true, success: false, error: sheetErr.message || 'Sheet append failed' };
      }
    }

    // 4. Houzz Pro / Zapier Webhook Dispatch with full address mapping (exactly once)
    let houzzResult: any = { attempted: sendToHouzz, success: false };
    const zapierUrl = getBackendWebhookUrl();
    if (sendToHouzz && zapierUrl) {
      const dispatchRes = await houzzDelivery.dispatchLeadToHouzz({
        leadId: savedLead.id,
        payload: savedLead,
        webhookUrl: zapierUrl,
      });
      houzzResult = {
        attempted: true,
        success: dispatchRes.success,
        status: dispatchRes.statusCode || (dispatchRes.success ? 200 : 502),
        destination: dispatchRes.destinationLabel,
        activityStatus: dispatchRes.activityStatus,
        error: dispatchRes.error,
      };
    }

    return res.json({
      success: true,
      summary: 'End-to-end pipeline test executed.',
      step1_extraction: {
        success: true,
        extracted: parsed,
      },
      step2_app_database: {
        success: true,
        savedLeadId: savedLead.id,
        status: savedLead.status,
      },
      step3_google_sheets: sheetsResult,
      step4_houzz_zapier: houzzResult,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Full Webhook Diagnostics Overview endpoint
app.get('/api/webhooks/diagnostics', (req, res) => {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const incomingFile = path.join(dataDir, 'incoming_leads.json');
    const logsFile = path.join(dataDir, 'webhook_logs.json');

    let totalIncomingLeads = 0;
    let angiLeadsCount = 0;
    let thumbtackLeadsCount = 0;
    let lastReceivedLead: any = null;

    if (fs.existsSync(incomingFile)) {
      try {
        const leads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
        if (Array.isArray(leads)) {
          totalIncomingLeads = leads.length;
          angiLeadsCount = leads.filter((l) => l.leadSource === 'Angi').length;
          thumbtackLeadsCount = leads.filter((l) => l.leadSource === 'Thumbtack').length;
          lastReceivedLead = leads[0] || null;
        }
      } catch {}
    }

    let totalLogs = 0;
    let recentLogs: any[] = [];
    if (fs.existsSync(logsFile)) {
      try {
        const logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
        if (Array.isArray(logs)) {
          totalLogs = logs.length;
          recentLogs = logs.slice(0, 10);
        }
      } catch {}
    }

    let webhookStatus: any = {};
    const statusFile = path.join(dataDir, 'webhook_status.json');
    if (fs.existsSync(statusFile)) {
      try { webhookStatus = JSON.parse(fs.readFileSync(statusFile, 'utf-8')); } catch {}
    }

    return res.json({
      success: true,
      status: 'operational',
      endpoints: {
        angi: '/api/webhooks/angi',
        thumbtack: '/api/webhooks/thumbtack',
        universal: '/api/webhooks/incoming-lead',
        parseEmail: '/api/webhooks/parse-email',
      },
      counts: {
        totalIncomingLeads,
        angiLeadsCount,
        thumbtackLeadsCount,
        totalLogs,
      },
      lastReceivedLead,
      recentLogs,
      webhookStatus,
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Interactive Webhook Dry-Run Parser Diagnostics
app.post('/api/webhooks/diagnose', async (req, res) => {
  try {
    const { payload, rawEmail, source = 'Angi', saveLead = false } = req.body;
    const bodyToParse = rawEmail ? { rawEmail, leadSource: source } : (payload || {});
    
    const parsed = await parseIncomingLeadPayload(bodyToParse, source);

    let savedLead = null;
    if (saveLead) {
      savedLead = saveIncomingLeadAndLog(parsed, req);
    }

    return res.json({
      success: true,
      status: 'analyzed',
      extracted: parsed,
      saved: !!saveLead,
      savedLead,
      fieldCheck: {
        hasClientName: !!parsed.clientName && parsed.clientName !== `New ${source} Lead`,
        hasClientPhone: !!parsed.clientPhone,
        hasClientEmail: !!parsed.clientEmail,
        hasAddress: !!parsed.address,
        hasServiceNeeded: !!parsed.serviceNeeded,
        hasLeadFee: !!parsed.leadFee,
        leadSource: parsed.leadSource,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Clear Webhook Logs endpoint
app.delete('/api/webhooks/logs', (req, res) => {
  try {
    const logsFile = path.join(process.cwd(), 'data', 'webhook_logs.json');
    if (fs.existsSync(logsFile)) {
      fs.writeFileSync(logsFile, '[]', 'utf-8');
    }
    return res.json({ success: true, message: 'Webhook logs cleared.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Backwards compatibility endpoint & ping check
app.get('/api/webhooks/angi', (req, res) => {
  try {
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    if (fs.existsSync(incomingFile)) {
      const data = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
      const angiOnly = Array.isArray(data) ? data.filter((l: any) => l.leadSource === 'Angi') : [];
      return res.json({ success: true, leads: angiOnly, status: 'operational' });
    }
    return res.json({ success: true, leads: [], status: 'operational' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/webhooks/thumbtack', (req, res) => {
  return res.json({ success: true, status: 'operational', endpoint: '/api/webhooks/thumbtack' });
});

app.get('/api/webhooks/incoming-lead', (req, res) => {
  return res.json({ success: true, status: 'operational', endpoint: '/api/webhooks/incoming-lead' });
});

// Users API (Multi-computer user management)
const CRM_USERS_TAB = '_CRM Users';
const CRM_USERS_HEADERS = ['ID', 'Name', 'Color', 'Created At', 'Last Active At'];

async function readPersistentUsers(): Promise<any[]> {
  const spreadsheetId = sheetsService.getDefaultSpreadsheetId();
  await sheetsService.createTabIfNotExists(spreadsheetId, CRM_USERS_TAB);
  const range = encodeURIComponent(sheetsService.formatSheetRange(CRM_USERS_TAB, 'A1:E500'));
  const data = await sheetsService.callSheetsApi(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    { method: 'GET' },
    spreadsheetId
  );
  const rows: any[][] = Array.isArray(data.values) ? data.values : [];
  if (rows.length <= 1) {
    const headerRange = encodeURIComponent(sheetsService.formatSheetRange(CRM_USERS_TAB, 'A1:E1'));
    await sheetsService.callSheetsApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${headerRange}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ values: [CRM_USERS_HEADERS] }) },
      spreadsheetId
    );

    // One-time migration of existing repository users into the durable worksheet.
    const legacyUsers = durableStore.safeReadJsonFile<any[]>('users.json', []);
    if (Array.isArray(legacyUsers) && legacyUsers.length) {
      await writePersistentUsers(legacyUsers);
      return legacyUsers;
    }
    return [];
  }
  return rows.slice(1).filter((row) => String(row?.[0] || '').trim() && String(row?.[1] || '').trim()).map((row) => ({
    id: String(row[0]),
    name: String(row[1]),
    color: String(row[2] || '#FF5500'),
    createdAt: String(row[3] || ''),
    lastActiveAt: String(row[4] || ''),
  }));
}

async function writePersistentUsers(users: any[]): Promise<void> {
  const spreadsheetId = sheetsService.getDefaultSpreadsheetId();
  await sheetsService.createTabIfNotExists(spreadsheetId, CRM_USERS_TAB);
  const range = encodeURIComponent(sheetsService.formatSheetRange(CRM_USERS_TAB, 'A1:E500'));
  const values = [
    CRM_USERS_HEADERS,
    ...users.map((user) => [
      String(user.id || ''),
      String(user.name || ''),
      String(user.color || '#FF5500'),
      String(user.createdAt || ''),
      String(user.lastActiveAt || ''),
    ]),
  ];
  await sheetsService.callSheetsApi(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:clear`,
    { method: 'POST', body: '{}' },
    spreadsheetId
  );
  const writeRange = encodeURIComponent(sheetsService.formatSheetRange(CRM_USERS_TAB, `A1:E${Math.max(values.length, 1)}`));
  await sheetsService.callSheetsApi(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${writeRange}?valueInputOption=RAW`,
    { method: 'PUT', body: JSON.stringify({ values }) },
    spreadsheetId
  );
}

app.get('/api/users', async (_req, res) => {
  try {
    return res.json({ success: true, users: await readPersistentUsers() });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Unable to load persistent users.' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const cleanName = String(req.body?.name || '').trim();
    if (!cleanName) return res.status(400).json({ success: false, error: 'User name is required.' });
    const users = await readPersistentUsers();
    const colors = ['#FF5500', '#10B981', '#EF4444'];
    const existingIndex = users.findIndex((user: any) => String(user.name).trim().toLowerCase() === cleanName.toLowerCase());
    const now = new Date().toISOString();
    const user = existingIndex >= 0
      ? { ...users[existingIndex], lastActiveAt: now, color: req.body?.color || users[existingIndex].color }
      : {
          id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: cleanName,
          color: req.body?.color || colors[users.length % colors.length],
          createdAt: now,
          lastActiveAt: now,
        };
    if (existingIndex >= 0) users[existingIndex] = user;
    else users.push(user);
    await writePersistentUsers(users);
    return res.json({ success: true, user, users });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Unable to save persistent user.' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const users = (await readPersistentUsers()).filter((user: any) =>
      user.id !== id && String(user.name).toLowerCase() !== id.toLowerCase()
    );
    await writePersistentUsers(users);
    return res.json({ success: true, users });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Unable to delete persistent user.' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const id = decodeURIComponent(req.params.id);
    const cleanName = String(req.body?.name || '').trim();
    if (!cleanName) return res.status(400).json({ success: false, error: 'User name is required.' });
    const users = await readPersistentUsers();
    const index = users.findIndex((user: any) =>
      user.id === id || String(user.name).toLowerCase() === id.toLowerCase()
    );
    if (index < 0) return res.status(404).json({ success: false, error: 'User not found.' });
    const user = {
      ...users[index],
      name: cleanName,
      ...(req.body?.color ? { color: String(req.body.color) } : {}),
      lastActiveAt: new Date().toISOString(),
    };
    users[index] = user;
    await writePersistentUsers(users);
    return res.json({ success: true, user, users });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Unable to update persistent user.' });
  }
});

// Activity Logs API (Track changes across all team workers & computers)
app.get('/api/activity-logs', (req, res) => {
  try {
    const { clientName, userName, limit = '100' } = req.query;
    const logsFile = path.join(process.cwd(), 'data', 'activity_logs.json');
    if (!fs.existsSync(logsFile)) {
      return res.json({ success: true, logs: [] });
    }
    let logs: any[] = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
    
    if (clientName) {
      const q = String(clientName).toLowerCase().trim();
      logs = logs.filter((l: any) => l.clientName && l.clientName.toLowerCase().includes(q));
    }
    if (userName) {
      const u = String(userName).toLowerCase().trim();
      logs = logs.filter((l: any) => l.userName && l.userName.toLowerCase() === u);
    }

    const maxItems = parseInt(String(limit), 10) || 100;
    logs = logs.slice(0, maxItems);
    return res.json({ success: true, logs });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/activity-logs', (req, res) => {
  try {
    const { actionType, userId, userName, userColor, clientName, clientPhone, tabName, details, oldValue, newValue } = req.body;
    if (!details) {
      return res.status(400).json({ success: false, error: 'Details are required.' });
    }

    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const logsFile = path.join(dataDir, 'activity_logs.json');

    let logs: any[] = [];
    if (fs.existsSync(logsFile)) {
      try {
        logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8'));
      } catch {}
    }

    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actionType: actionType || 'general',
      userId: userId || 'anonymous',
      userName: userName || 'Worker',
      userColor: userColor || '#FF5500',
      clientName: clientName || '',
      clientPhone: clientPhone || '',
      tabName: tabName || '',
      details: details.trim(),
      oldValue: oldValue || '',
      newValue: newValue || ''
    };

    logs.unshift(newLog);
    // Keep last 1000 logs
    if (logs.length > 1000) {
      logs = logs.slice(0, 1000);
    }

    fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2), 'utf-8');
    return res.json({ success: true, log: newLog });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Shared Team Google Authentication API (Allows single-account sign-in across all coworkers/devices securely without token leakage)
app.get('/api/google-auth', (req, res) => {
  try {
    const authFile = path.join(process.cwd(), 'data', 'google_auth.json');
    if (fs.existsSync(authFile)) {
      const data = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      if (data && data.accessToken && !data.tokenExpired) {
        return res.json({
          success: true,
          connected: true,
          user: data.user || { displayName: 'Google Account' },
          updatedAt: data.updatedAt
        });
      } else if (data && data.user) {
        return res.json({
          success: true,
          connected: false,
          tokenExpired: true,
          user: data.user,
          updatedAt: data.updatedAt
        });
      }
    }
    return res.json({ success: true, connected: false, user: null });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/google-auth', (req, res) => {
  try {
    const { accessToken, user } = req.body;
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'accessToken is required.' });
    }
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const authFile = path.join(dataDir, 'google_auth.json');

    const authPayload = {
      accessToken,
      tokenExpired: false,
      user: {
        email: user?.email || '',
        displayName: user?.displayName || user?.email || 'Google Account',
        photoURL: user?.photoURL || ''
      },
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(authFile, JSON.stringify(authPayload, null, 2), 'utf-8');
    // Return connection status without leaking raw tokens to browser
    return res.json({ 
      success: true, 
      connected: true,
      user: authPayload.user,
      updatedAt: authPayload.updatedAt
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/google-auth', (req, res) => {
  try {
    const authFile = path.join(process.cwd(), 'data', 'google_auth.json');
    if (fs.existsSync(authFile)) {
      fs.unlinkSync(authFile);
    }
    return res.json({ success: true, connected: false });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Shared Status Overrides API (Sync status changes across all users and computers in real-time)
app.get('/api/status-overrides', (req, res) => {
  try {
    const overridesFile = path.join(process.cwd(), 'data', 'status_overrides.json');
    if (fs.existsSync(overridesFile)) {
      const data = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
      return res.json({ success: true, overrides: data });
    }
    return res.json({ success: true, overrides: {} });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/status-overrides', (req, res) => {
  try {
    const { key, sheetTab, rowIndex, clientName, newStatus, updatedBy } = req.body;
    if (!newStatus) {
      return res.status(400).json({ success: false, error: 'newStatus is required.' });
    }
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const overridesFile = path.join(dataDir, 'status_overrides.json');

    let overrides: Record<string, any> = {};
    if (fs.existsSync(overridesFile)) {
      try {
        overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
      } catch {}
    }

    const payload = {
      status: newStatus,
      sheetTab: sheetTab || '',
      rowIndex: rowIndex || 0,
      clientName: clientName || '',
      updatedBy: updatedBy || 'Team Member',
      timestamp: Date.now()
    };

    if (key) {
      overrides[key] = payload;
    }
    if (sheetTab && rowIndex) {
      overrides[`${sheetTab}_${rowIndex}`] = payload;
    }
    if (clientName && clientName !== 'Unnamed Client') {
      overrides[`name_${clientName.toLowerCase().trim()}`] = payload;
    }

    fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2), 'utf-8');
    return res.json({ success: true, overrides });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Shared Representative / Salesperson Overrides API (Sync representative assignments across all users and computers in real-time)
app.get('/api/representative-overrides', (req, res) => {
  try {
    const overridesFile = path.join(process.cwd(), 'data', 'representative_overrides.json');
    if (fs.existsSync(overridesFile)) {
      const data = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
      return res.json({ success: true, overrides: data });
    }
    return res.json({ success: true, overrides: {} });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/representative-overrides', (req, res) => {
  try {
    const { key, clientId, sheetTab, rowIndex, clientName, salespersonCode, salespersonName, updatedBy } = req.body;
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const overridesFile = path.join(dataDir, 'representative_overrides.json');

    let overrides: Record<string, any> = {};
    if (fs.existsSync(overridesFile)) {
      try {
        overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
      } catch {}
    }

    const payload = {
      salespersonCode: (salespersonCode || '').trim(),
      salespersonName: (salespersonName || '').trim(),
      sheetTab: sheetTab || '',
      rowIndex: rowIndex || 0,
      clientName: clientName || '',
      updatedBy: updatedBy || 'Team Member',
      timestamp: Date.now()
    };

    if (key) {
      overrides[key] = payload;
    }
    if (clientId) {
      overrides[`client_${clientId}`] = payload;
    }
    if (sheetTab && rowIndex) {
      overrides[`${sheetTab}_${rowIndex}`] = payload;
    }
    if (clientName && clientName !== 'Unnamed Client') {
      overrides[`name_${clientName.toLowerCase().trim()}`] = payload;
    }

    fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2), 'utf-8');
    return res.json({ success: true, overrides });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// Google Sheets Service Account API Endpoints
// ==========================================

app.get('/api/sheets/status', async (req, res) => {
  try {
    const status = await sheetsService.getServiceAccountStatus();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/sheets/details', async (req, res) => {
  try {
    const spreadsheetId = sheetsService.getDefaultSpreadsheetId();
    const forceFresh = req.query.forceFresh === 'true';
    const details = await sheetsService.getSpreadsheetDetails(spreadsheetId, forceFresh);
    return res.json(details);
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to get spreadsheet details',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.get('/api/sheets/rows', async (req, res) => {
  try {
    const spreadsheetId = sheetsService.getDefaultSpreadsheetId();
    const tab = (req.query.tab as string) || 'Angi';
    const forceFresh = req.query.forceFresh === 'true';
    const data = await sheetsService.readSheetRows(spreadsheetId, tab, forceFresh);
    return res.json(data);
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to read sheet rows',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.post('/api/sheets/batch-rows', async (req, res) => {
  try {
    const { tabs, forceFresh } = req.body;
    const targetId = sheetsService.getDefaultSpreadsheetId();
    const tabsList = Array.isArray(tabs) ? tabs : ['Angi'];
    const data = await sheetsService.readAllTabs(targetId, tabsList, !!forceFresh);
    return res.json(data);
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to read batch sheet rows',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.post('/api/sheets/update-status', async (req, res) => {
  try {
    const { sheetTab, rowIndex, newStatus, statusColIndex, clientName, clientPhone, updatedBy } = req.body;
    const targetId = sheetsService.getDefaultSpreadsheetId();
    const tab = sheetTab || 'Angi';
    const colIdx = typeof statusColIndex === 'number' && statusColIndex >= 0 ? statusColIndex : 7;

    // 1. Update in Google Sheet via Service Account with dynamic row verification
    await sheetsService.updateCell(targetId, tab, rowIndex, colIdx, newStatus, clientName, clientPhone);

    // 2. Also record in shared team status overrides file
    const overridesFile = path.join(process.cwd(), 'data', 'status_overrides.json');
    let overrides: Record<string, any> = {};
    if (fs.existsSync(overridesFile)) {
      try {
        overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
      } catch {}
    }
    const payload = {
      status: newStatus,
      sheetTab: tab,
      rowIndex,
      clientName: clientName || '',
      updatedBy: updatedBy || 'Team Member',
      timestamp: Date.now(),
    };
    overrides[`${tab}_${rowIndex}`] = payload;
    if (clientName && clientName !== 'Unnamed Client') {
      overrides[`name_${clientName.toLowerCase().trim()}`] = payload;
    }
    fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2), 'utf-8');

    return res.json({ success: true, status: newStatus });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to update status in Google Sheet',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.post('/api/sheets/update-lead', async (req, res) => {
  try {
    const { sheetTab, rowIndex, leadData, updatedBy } = req.body;
    const targetId = sheetsService.getDefaultSpreadsheetId();
    const tab = sheetTab || 'Angi';

    if (!rowIndex || rowIndex < 1) {
      return res.status(400).json({ error: 'Valid rowIndex is required.' });
    }

    await sheetsService.updateLeadRow(
      targetId,
      tab,
      rowIndex,
      leadData || {},
      leadData?.clientName,
      leadData?.clientPhone
    );

    // If status was updated, record in overrides
    if (leadData?.status) {
      const overridesFile = path.join(process.cwd(), 'data', 'status_overrides.json');
      let overrides: Record<string, any> = {};
      if (fs.existsSync(overridesFile)) {
        try {
          overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf-8'));
        } catch {}
      }
      const payload = {
        status: leadData.status,
        sheetTab: tab,
        rowIndex,
        clientName: leadData.clientName || '',
        updatedBy: updatedBy || 'Team Member',
        timestamp: Date.now(),
      };
      overrides[`${tab}_${rowIndex}`] = payload;
      if (leadData.clientName && leadData.clientName !== 'Unnamed Client') {
        overrides[`name_${leadData.clientName.toLowerCase().trim()}`] = payload;
      }
      fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2), 'utf-8');
    }

    return res.json({ success: true, message: 'Lead updated successfully in Google Sheet' });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to update lead in Google Sheet',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.post('/api/sheets/update-cell', async (req, res) => {
  try {
    const { sheetTab, rowIndex, columnIndex, value } = req.body;
    const targetId = sheetsService.getDefaultSpreadsheetId();
    const tab = sheetTab || 'Angi';
    await sheetsService.updateCell(targetId, tab, rowIndex, columnIndex, value);
    return res.json({ success: true });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to update cell',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.post('/api/sheets/append-lead', async (req, res) => {
  try {
    const { sheetTab, leadData, status } = req.body;
    const targetId = sheetsService.getDefaultSpreadsheetId();
    const result = await sheetsService.appendLeadRow(targetId, sheetTab, leadData, status);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to append lead to Google Sheet',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.post('/api/sheets/delete-row', async (req, res) => {
  try {
    const { sheetTab, rowIndex, clientName, clientPhone } = req.body;
    const targetId = sheetsService.getDefaultSpreadsheetId();
    const numericRowIndex = Number(rowIndex);
    if (!sheetTab || !Number.isInteger(numericRowIndex) || numericRowIndex < 1) {
      return res.status(400).json({ error: 'A valid sheet tab and row are required.', errorCode: 'INVALID_ROW' });
    }
    const resolvedRowIndex = await sheetsService.resolveActualRowIndex(
      targetId,
      String(sheetTab),
      numericRowIndex,
      String(clientName || ''),
      String(clientPhone || '')
    );
    await sheetsService.deleteRow(targetId, String(sheetTab), resolvedRowIndex);
    return res.json({ success: true });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to delete row in Google Sheet',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.post('/api/sheets/create-tab', async (req, res) => {
  try {
    const { tabTitle } = req.body;
    const targetId = sheetsService.getDefaultSpreadsheetId();
    await sheetsService.createTabIfNotExists(targetId, tabTitle);
    return res.json({ success: true });
  } catch (err: any) {
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Failed to create sheet tab',
      errorCode: err.code || 'UNKNOWN_ERROR',
    });
  }
});

app.post('/api/sheets/credentials', async (req, res) => {
  try {
    const { credentialsJson, clientEmail, privateKey } = req.body;
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const credFile = path.join(dataDir, 'service_account.json');

    let payload: any = {};
    if (credentialsJson) {
      payload = typeof credentialsJson === 'string' ? JSON.parse(credentialsJson) : credentialsJson;
    } else if (clientEmail && privateKey) {
      payload = {
        client_email: clientEmail.trim(),
        private_key: privateKey.replace(/\\n/g, '\n'),
      };
    } else {
      return res.status(400).json({ error: 'Missing credentials payload.' });
    }

    fs.writeFileSync(credFile, JSON.stringify(payload, null, 2), 'utf-8');
    sheetsService.invalidateServerCache();
    const status = await sheetsService.getServiceAccountStatus();
    return res.json({ success: true, status });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1. DURABLE PERSISTENCE & ATOMIC WRITES
// ==========================================
function safeWriteJsonFile(filePath: string, data: any): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    // Backup existing if exists
    if (fs.existsSync(filePath)) {
      const backupPath = `${filePath}.bak`;
      try {
        fs.copyFileSync(filePath, backupPath);
      } catch {}
    }

    const tempPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Error safely writing JSON to ${filePath}:`, err);
    // Direct write fallback
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

// ==========================================
// 2. TRASH & RESTORE SYSTEM (Soft-Delete)
// ==========================================
app.get('/api/trash', (req, res) => {
  try {
    const trashFile = path.join(process.cwd(), 'data', 'trash.json');
    let items: any[] = [];
    if (fs.existsSync(trashFile)) {
      items = JSON.parse(fs.readFileSync(trashFile, 'utf-8'));
    }
    return res.json({ success: true, items });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/trash/soft-delete', (req, res) => {
  try {
    const { lead, deletedBy, reason } = req.body;
    if (!lead || !lead.clientName) {
      return res.status(400).json({ success: false, error: 'Valid lead object is required.' });
    }

    const trashFile = path.join(process.cwd(), 'data', 'trash.json');
    let trashItems: any[] = [];
    if (fs.existsSync(trashFile)) {
      try {
        trashItems = JSON.parse(fs.readFileSync(trashFile, 'utf-8'));
      } catch {}
    }

    const trashRecord = {
      ...lead,
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy || 'Worker',
      deletionReason: reason || 'Deleted by user'
    };

    trashItems.unshift(trashRecord);
    // Keep last 500 trashed items
    if (trashItems.length > 500) trashItems = trashItems.slice(0, 500);
    safeWriteJsonFile(trashFile, trashItems);

    // Remove from active incoming_leads.json so it no longer appears active
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    if (fs.existsSync(incomingFile)) {
      try {
        let incoming = JSON.parse(fs.readFileSync(incomingFile, 'utf-8'));
        incoming = incoming.filter((l: any) => !((lead.id && l.id === lead.id) || (l.clientName === lead.clientName && l.clientPhone === lead.clientPhone)));
        safeWriteJsonFile(incomingFile, incoming);
      } catch {}
    }

    // Also record in activity log
    const logsFile = path.join(process.cwd(), 'data', 'activity_logs.json');
    let logs: any[] = [];
    if (fs.existsSync(logsFile)) {
      try { logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8')); } catch {}
    }
    logs.unshift({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'delete_lead',
      userId: deletedBy || 'staff',
      userName: deletedBy || 'Worker',
      clientName: lead.clientName,
      clientPhone: lead.clientPhone || '',
      tabName: lead.tabName || '',
      details: `Moved lead "${lead.clientName}" to Trash (${reason || 'User action'})`
    });
    safeWriteJsonFile(logsFile, logs.slice(0, 1000));

    return res.json({ success: true, trashedItem: trashRecord });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/trash/restore', (req, res) => {
  try {
    const { leadId, clientName, restoredBy } = req.body;
    const trashFile = path.join(process.cwd(), 'data', 'trash.json');
    let trashItems: any[] = [];
    if (fs.existsSync(trashFile)) {
      try { trashItems = JSON.parse(fs.readFileSync(trashFile, 'utf-8')); } catch {}
    }

    const index = trashItems.findIndex((item) => (leadId && item.id === leadId) || (item.clientName === clientName));
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Lead not found in Trash.' });
    }

    const [restored] = trashItems.splice(index, 1);
    delete restored.isDeleted;
    delete restored.deletedAt;
    delete restored.deletedBy;
    safeWriteJsonFile(trashFile, trashItems);

    // CRUCIAL: Restore lead back into active incoming_leads.json so workers see it immediately
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    let incomingLeads: any[] = [];
    if (fs.existsSync(incomingFile)) {
      try { incomingLeads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8')); } catch {}
    }
    const existsIdx = incomingLeads.findIndex((l) => (restored.id && l.id === restored.id) || (l.clientName === restored.clientName && l.clientPhone === restored.clientPhone));
    if (existsIdx >= 0) {
      incomingLeads[existsIdx] = restored;
    } else {
      incomingLeads.unshift(restored);
    }
    safeWriteJsonFile(incomingFile, incomingLeads);

    // Save/update durableStore metadata
    if (restored.id) {
      durableStore.saveLeadMetadata({
        leadId: restored.id,
        notes: restored.notes || restored.details || '',
        updatedAt: new Date().toISOString()
      });
    }

    // Record restore in activity log
    const logsFile = path.join(process.cwd(), 'data', 'activity_logs.json');
    let logs: any[] = [];
    if (fs.existsSync(logsFile)) {
      try { logs = JSON.parse(fs.readFileSync(logsFile, 'utf-8')); } catch {}
    }
    logs.unshift({
      id: `log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: 'restore_lead',
      userId: restoredBy || 'staff',
      userName: restoredBy || 'Worker',
      clientName: restored.clientName,
      details: `Restored lead "${restored.clientName}" from Trash`
    });
    safeWriteJsonFile(logsFile, logs.slice(0, 1000));

    return res.json({ success: true, restoredLead: restored });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/trash/empty', (req, res) => {
  try {
    const trashFile = path.join(process.cwd(), 'data', 'trash.json');
    safeWriteJsonFile(trashFile, []);
    return res.json({ success: true, message: 'Trash emptied permanently.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. WEBHOOK DELIVERY QUEUE & RETRIES
// ==========================================
app.get('/api/webhooks/queue', (req, res) => {
  try {
    const queueFile = path.join(process.cwd(), 'data', 'webhook_queue.json');
    let queue: any[] = [];
    if (fs.existsSync(queueFile)) {
      queue = JSON.parse(fs.readFileSync(queueFile, 'utf-8'));
    }
    return res.json({ success: true, queue });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/webhooks/retry', async (req, res) => {
  try {
    const { queueId } = req.body;
    if (!queueId) {
      return res.status(400).json({ success: false, error: 'queueId is required.' });
    }

    const allQueue = durableStore.getWebhookQueue();
    const durableItem = allQueue.find((q) => q.id === queueId);

    const queueFile = path.join(process.cwd(), 'data', 'webhook_queue.json');
    let legacyQueue: any[] = [];
    if (fs.existsSync(queueFile)) {
      try { legacyQueue = JSON.parse(fs.readFileSync(queueFile, 'utf-8')); } catch {}
    }
    const legacyItem = legacyQueue.find((q) => q.id === queueId);

    const item = durableItem || legacyItem;
    if (!item) {
      return res.status(404).json({ success: false, error: 'Queue item not found.' });
    }

    const destination = item.destination || (item.source === 'houzz' ? 'houzz' : 'sheets');
    const existingLeadId = item.leadId || item.processedLeadId || item.id;
    let deliverySuccess = false;
    let deliveryError: string | null = null;

    if (destination === 'houzz') {
      const webhookUrl = getBackendWebhookUrl();
      if (!webhookUrl) {
        deliveryError = 'Houzz/Zapier webhook URL is not configured.';
      } else {
        const response = await fetch(webhookUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (response.ok) {
          deliverySuccess = true;
          setHouzzDispatchConfirmed(item.payload?.clientPhone || '', item.payload?.clientName || '');
        } else {
          const errText = await response.text().catch(() => '');
          deliveryError = `Houzz Pro returned HTTP ${response.status}: ${errText}`;
          setHouzzDispatchFailed(item.payload?.clientPhone || '', item.payload?.clientName || '', deliveryError);
        }
      }
    } else {
      try {
        const sheetId = item.spreadsheetId || sheetsService.getDefaultSpreadsheetId();
        const tabName = item.tabName || item.source || 'Angi';
        await sheetsService.appendLeadRow(sheetId, tabName, item.payload, item.payload?.status || 'New');
        if (existingLeadId) setIncomingLeadSheetSyncState(existingLeadId, true);
        deliverySuccess = true;
      } catch (sheetErr: any) {
        deliveryError = sheetErr.message || 'Google Sheets append failed.';
      }
    }

    if (deliverySuccess) {
      if (durableItem) {
        durableStore.updateQueueItemStatus(queueId, 'accepted');
        if (existingLeadId) {
          if (destination === 'houzz') {
            durableStore.saveLeadMetadata({ leadId: existingLeadId, houzzDispatchStatus: 'confirmed' });
          } else {
            durableStore.saveLeadMetadata({ leadId: existingLeadId, sheetSynced: true });
          }
        }
      }
      if (legacyItem) {
        legacyItem.status = 'Succeeded';
        legacyItem.error = null;
        legacyItem.lastAttemptAt = new Date().toISOString();
        safeWriteJsonFile(queueFile, legacyQueue);
      }
      return res.json({ success: true, destination, leadId: existingLeadId, message: `Successfully delivered to ${destination}.` });
    } else {
      if (durableItem) {
        durableStore.updateQueueItemStatus(queueId, 'failed', deliveryError || 'Delivery failed.');
      }
      if (legacyItem) {
        legacyItem.status = 'Failed';
        legacyItem.error = deliveryError;
        legacyItem.lastAttemptAt = new Date().toISOString();
        safeWriteJsonFile(queueFile, legacyQueue);
      }
      return res.status(502).json({ success: false, error: deliveryError, destination, leadId: existingLeadId });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. TODAY / MY TASKS API
// ==========================================
app.get('/api/tasks/today', async (req, res) => {
  try {
    const now = new Date();
    const todayIso = now.toISOString().split('T')[0];
    const tasks: any[] = [];
    const seenTaskIds = new Set<string>();

    // 1. Gather webhook incoming leads
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    let incomingLeads: any[] = [];
    if (fs.existsSync(incomingFile)) {
      try { incomingLeads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8')); } catch {}
    }

    // 2. Gather leads from durable store and Google Sheets cache
    const sheetDetails = sheetsService.getCachedSpreadsheetDetails();
    const sheetRows: any[] = [];
    if (sheetDetails && sheetDetails.sheets) {
      for (const s of sheetDetails.sheets) {
        const cached = sheetsService.getCachedSheetRows(s.title);
        if (cached && cached.rows) {
          sheetRows.push(...cached.rows);
        }
      }
    }

    const allLeads = [...incomingLeads, ...sheetRows];

    for (const l of allLeads) {
      if (l.isDeleted) continue;
      const leadId = l.id || l.leadId || (l.rowIndex ? `row_${l.tabName || 'tab'}_${l.rowIndex}` : `lead_${l.clientPhone || l.clientName}`);
      const statusLower = (l.status || '').toLowerCase().trim();

      // Exclude finished, closed, sold, lost, or dead leads
      const isClosed = statusLower.includes('finish') || 
                       statusLower.includes('sold') || 
                       statusLower.includes('completed') || 
                       statusLower.includes('closed') || 
                       statusLower.includes('lost') || 
                       statusLower.includes('bad lead') || 
                       statusLower.includes('dead');
      if (isClosed) continue;

      // Category 1: New urgent leads needing initial call
      if (statusLower === 'new' || statusLower === 'new lead') {
        const taskId = `task_new_${leadId}`;
        if (!seenTaskIds.has(taskId) && !durableStore.isTaskCompleted(leadId, taskId)) {
          seenTaskIds.add(taskId);
          tasks.push({
            id: taskId,
            leadId,
            clientName: l.clientName || 'New Client',
            clientPhone: l.clientPhone || '',
            clientEmail: l.clientEmail || '',
            title: `Initial outreach to ${l.clientName || 'New Lead'}`,
            category: 'new_lead',
            dueDate: todayIso,
            dueTime: 'Urgent',
            assignedRep: l.ownerName || l.salespersonCode || 'Unassigned',
            isOverdue: false,
            status: l.status || 'New',
            leadSource: l.leadSource || l.tabName || 'Angi'
          });
        }
      }

      // Category 2: Appointments scheduled for today
      if (l.appointmentDate === todayIso) {
        const taskId = `task_appt_${leadId}`;
        if (!seenTaskIds.has(taskId) && !durableStore.isTaskCompleted(leadId, taskId)) {
          seenTaskIds.add(taskId);
          tasks.push({
            id: taskId,
            leadId,
            clientName: l.clientName || 'Client',
            clientPhone: l.clientPhone || '',
            clientEmail: l.clientEmail || '',
            title: `Appointment with ${l.clientName}`,
            category: 'appointment',
            dueDate: todayIso,
            dueTime: l.appointmentTime || l.startTime || 'Today',
            assignedRep: l.ownerName || l.salespersonCode || 'Team',
            isOverdue: false,
            status: l.status || 'Meeting Scheduled',
            leadSource: l.leadSource || l.tabName || 'Direct'
          });
        }
      }

      // Category 3: Estimate Follow-Up Milestones (3, 7, 15, 30, 90 Days)
      if (statusLower.includes('estimate sent') || l.estimateSentAt) {
        // Item 3: Calculate from dedicated estimateSentAt, never from lead creation date or timestamp
        const meta = durableStore.getLeadMetadata(leadId);
        const estimateDateStr = l.estimateSentAt || meta?.estimateSentAt || null;
        let diffDays = 0;
        let hasDate = false;

        if (estimateDateStr) {
          const sent = new Date(estimateDateStr);
          if (!isNaN(sent.getTime())) {
            hasDate = true;
            const sentZero = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate()).getTime();
            const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            diffDays = Math.max(0, Math.floor((nowZero - sentZero) / (1000 * 60 * 60 * 24)));
          }
        }

        const milestones = [
          { day: 3, cat: 'follow_up_3d', title: '3-Day Follow-Up' },
          { day: 7, cat: 'follow_up_7d', title: '7-Day Follow-Up' },
          { day: 15, cat: 'follow_up_15d', title: '15-Day Follow-Up' },
          { day: 30, cat: 'follow_up_30d', title: '30-Day Follow-Up' },
          { day: 90, cat: 'follow_up_90d', title: '90-Day Follow-Up' },
        ];

        for (const m of milestones) {
          if (hasDate && diffDays >= m.day) {
            const taskId = `task_fu_${m.day}d_${leadId}`;
            if (!seenTaskIds.has(taskId) && !durableStore.isTaskCompleted(leadId, taskId)) {
              seenTaskIds.add(taskId);
              tasks.push({
                id: taskId,
                leadId,
                clientName: l.clientName || 'Client',
                clientPhone: l.clientPhone || '',
                clientEmail: l.clientEmail || '',
                title: `${m.title} for ${l.clientName}`,
                category: m.cat,
                dueDate: todayIso,
                dueTime: diffDays > m.day ? `${diffDays - m.day}d Overdue` : 'Today',
                assignedRep: l.ownerName || l.salespersonCode || 'Follow-Up Team',
                isOverdue: diffDays > m.day,
                status: l.status || 'Estimate Sent',
                leadSource: l.leadSource || l.tabName || 'Angi'
              });
              break; // Show highest active due milestone
            }
          }
        }
      }
    }

    return res.json({ success: true, tasks, count: tasks.length });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 5. BACKGROUND QUEUE RETRY WORKER (Runs every 2 minutes for resilient delivery)
setInterval(async () => {
  try {
    await durableStore.processPendingQueueItems(async (item) => {
      if (item.destination === 'houzz') {
        const webhookUrl = getBackendWebhookUrl();
        if (!webhookUrl) return { success: false, error: 'Webhook URL not configured' };
        const res = await fetch(webhookUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });
        if (res.ok) return { success: true };
        const text = await res.text().catch(() => '');
        return { success: false, error: `HTTP ${res.status}: ${text}` };
      } else {
        const sheetId = (item as any).spreadsheetId || sheetsService.getDefaultSpreadsheetId();
        const tabName = (item as any).tabName || 'Angi';
        await sheetsService.appendLeadRow(sheetId, tabName, item.payload, item.payload?.status || 'New');
        if (item.leadId) setIncomingLeadSheetSyncState(item.leadId, true);
        return { success: true };
      }
    });
  } catch (err) {
    console.error('[Background Worker] Queue retry error:', err);
  }
}, 2 * 60 * 1000);

// 6. BACKGROUND FOLLOW-UP SCHEDULER (Item 8: Runs when nobody has the app open)
function runBackgroundFollowUpScheduler() {
  try {
    const now = new Date();
    const todayIso = now.toISOString().split('T')[0];
    const incomingFile = path.join(process.cwd(), 'data', 'incoming_leads.json');
    let incomingLeads: any[] = [];
    if (fs.existsSync(incomingFile)) {
      try { incomingLeads = JSON.parse(fs.readFileSync(incomingFile, 'utf-8')); } catch {}
    }

    const sheetDetails = sheetsService.getCachedSpreadsheetDetails();
    const sheetRows: any[] = [];
    if (sheetDetails && sheetDetails.sheets) {
      for (const s of sheetDetails.sheets) {
        const cached = sheetsService.getCachedSheetRows(s.title);
        if (cached && cached.rows) {
          sheetRows.push(...cached.rows);
        }
      }
    }

    const allLeads = [...incomingLeads, ...sheetRows];
    const dueTasksFile = path.join(process.cwd(), 'data', 'due_tasks_cache.json');
    let dueTasksCache: any[] = [];
    if (fs.existsSync(dueTasksFile)) {
      try { dueTasksCache = JSON.parse(fs.readFileSync(dueTasksFile, 'utf-8')); } catch {}
    }

    for (const l of allLeads) {
      if (l.isDeleted) continue;
      const leadId = l.id || l.leadId || (l.rowIndex ? `row_${l.tabName || 'tab'}_${l.rowIndex}` : `lead_${l.clientPhone || l.clientName}`);
      const statusLower = (l.status || '').toLowerCase().trim();
      if (statusLower.includes('finish') || statusLower.includes('sold') || statusLower.includes('closed') || statusLower.includes('lost')) continue;

      if (statusLower.includes('estimate sent') || l.estimateSentAt) {
        const meta = durableStore.getLeadMetadata(leadId);
        const estimateDateStr = l.estimateSentAt || meta?.estimateSentAt || null;
        if (estimateDateStr) {
          const sent = new Date(estimateDateStr);
          if (!isNaN(sent.getTime())) {
            const sentZero = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate()).getTime();
            const nowZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const diffDays = Math.max(0, Math.floor((nowZero - sentZero) / (1000 * 60 * 60 * 24)));

            const milestones = [3, 7, 15, 30, 90];
            for (const day of milestones) {
              if (diffDays >= day) {
                const taskId = `task_fu_${day}d_${leadId}`;
                if (!durableStore.isTaskCompleted(leadId, taskId)) {
                  const alreadyCached = dueTasksCache.some(t => t.id === taskId);
                  if (!alreadyCached) {
                    dueTasksCache.push({
                      id: taskId,
                      leadId,
                      clientName: l.clientName || 'Client',
                      clientPhone: l.clientPhone || '',
                      milestoneDay: day,
                      dueIso: todayIso,
                      generatedAt: now.toISOString()
                    });
                  }
                }
              }
            }
          }
        }
      }
    }

    safeWriteJsonFile(dueTasksFile, dueTasksCache.slice(-500));
  } catch (err) {
    console.warn('[Scheduler] Error running background follow-up check:', err);
  }
}

setTimeout(runBackgroundFollowUpScheduler, 5000);
setInterval(runBackgroundFollowUpScheduler, 15 * 60 * 1000);

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { extractAngiServiceFromSubject, parseIncomingLeadPayload };

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
