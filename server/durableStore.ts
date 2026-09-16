import fs from 'fs';
import path from 'path';

/**
 * Durable Storage and Webhook Queue Manager
 * Persists lead-linked history, task completion, delivery states, webhook queue, and archives.
 * Uses atomic writes (temp file + rename) to protect against corruption during unexpected restarts.
 */

const DATA_DIR = path.join(process.cwd(), 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function safeReadJsonFile<T = any>(fileName: string, fallback: T): T {
  try {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.warn(`[DurableStore] Error reading ${fileName}:`, err);
    return fallback;
  }
}

export function safeWriteJsonFile<T = any>(fileName: string, data: T): boolean {
  try {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, fileName);
    const tempPath = path.join(DATA_DIR, `${fileName}.${Date.now()}.tmp`);
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`[DurableStore] Failed atomic write for ${fileName}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. Persistent Lead Metadata & Notes Store (Linked by permanent leadId)
// ---------------------------------------------------------------------------

export interface LeadDurableMetadata {
  leadId: string;
  sourceEventId?: string;
  sourceScope?: string;
  notes?: string;
  estimateSentAt?: string;
  createdAt: string;
  updatedAt: string;
  houzzDispatchStatus?: 'pending' | 'sending' | 'confirmed' | 'failed';
  houzzDispatchAt?: string;
  houzzError?: string;
  sheetSynced?: boolean;
  sheetRowIndex?: number;
  sheetTab?: string;
  angiAccount?: 'not_identified' | 'dxg' | 'mr_contract';
  taskCompletions?: Record<string, { completedAt: string; completedBy?: string }>;
}

export function getLeadMetadata(leadId: string): LeadDurableMetadata | null {
  const store = safeReadJsonFile<Record<string, LeadDurableMetadata>>('lead_metadata.json', {});
  return store[leadId] || null;
}

export function saveLeadMetadata(metadata: Partial<LeadDurableMetadata> & { leadId: string }): LeadDurableMetadata {
  const store = safeReadJsonFile<Record<string, LeadDurableMetadata>>('lead_metadata.json', {});
  const now = new Date().toISOString();
  const existing = store[metadata.leadId] || {
    leadId: metadata.leadId,
    createdAt: now,
    updatedAt: now,
  };

  const updated: LeadDurableMetadata = {
    ...existing,
    ...metadata,
    updatedAt: now,
  };

  store[metadata.leadId] = updated;
  safeWriteJsonFile('lead_metadata.json', store);
  return updated;
}

// ---------------------------------------------------------------------------
// 2. Source Event Deduplication (Idempotency & Replay Protection)
// ---------------------------------------------------------------------------

export function findLeadBySourceEvent(sourceScope: string, sourceEventId: string): LeadDurableMetadata | null {
  if (!sourceScope || !sourceEventId) return null;
  const store = safeReadJsonFile<Record<string, LeadDurableMetadata>>('lead_metadata.json', {});
  for (const item of Object.values(store)) {
    if (item.sourceScope === sourceScope && item.sourceEventId === sourceEventId) {
      return item;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. Webhook Delivery Queue with Bounded Backoff and Restart Recovery
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'pending' | 'sending' | 'accepted' | 'failed' | 'uncertain';

export interface WebhookQueueItem {
  id: string;
  leadId: string;
  destination: 'sheets' | 'houzz';
  source: string;
  payload: any;
  status: DeliveryStatus;
  retryCount: number;
  maxRetries: number;
  nextAttemptAt: string;
  lastAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
  error?: string | null;
  idempotencyKey?: string;
}

export function getWebhookQueue(): WebhookQueueItem[] {
  return safeReadJsonFile<WebhookQueueItem[]>('webhook_queue.json', []);
}

export function enqueueDelivery(
  leadId: string,
  destination: 'sheets' | 'houzz',
  payload: any,
  source: string = 'universal'
): WebhookQueueItem {
  const queue = getWebhookQueue();
  const now = new Date().toISOString();

  // Avoid creating duplicate pending/sending item for the same permanent lead ID & destination
  const existing = queue.find(
    (q) => q.leadId === leadId && q.destination === destination && (q.status === 'pending' || q.status === 'sending')
  );
  if (existing) return existing;

  const item: WebhookQueueItem = {
    id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    leadId,
    destination,
    source,
    payload,
    status: 'pending',
    retryCount: 0,
    maxRetries: 5,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
    idempotencyKey: `${leadId}_${destination}`,
  };

  queue.push(item);
  safeWriteJsonFile('webhook_queue.json', queue);
  return item;
}


export function getPendingQueueItems(): WebhookQueueItem[] {
  const queue = getWebhookQueue();
  const now = new Date().getTime();
  return queue.filter((item) => {
    if (item.status === 'accepted' || item.status === 'failed') return false;
    const nextAttempt = new Date(item.nextAttemptAt).getTime();
    return isNaN(nextAttempt) || nextAttempt <= now;
  });
}

export async function processPendingQueueItems(
  handler: (item: WebhookQueueItem) => Promise<{ success: boolean; error?: string }>
): Promise<void> {
  const pending = getPendingQueueItems();
  for (const item of pending) {
    updateQueueItemStatus(item.id, 'sending');
    try {
      const result = await handler(item);
      if (result.success) {
        updateQueueItemStatus(item.id, 'accepted');
      } else {
        updateQueueItemStatus(item.id, 'failed', result.error);
      }
    } catch (err: any) {
      updateQueueItemStatus(item.id, 'failed', err.message);
    }
  }
}

export function updateQueueItemStatus(
  queueId: string,
  status: DeliveryStatus,
  error?: string | null
): WebhookQueueItem | null {
  const queue = getWebhookQueue();
  const item = queue.find((q) => q.id === queueId);
  if (!item) return null;

  const now = new Date();
  item.status = status;
  item.lastAttemptAt = now.toISOString();
  item.updatedAt = now.toISOString();
  item.error = error || null;

  if (status === 'failed' || status === 'uncertain') {
    item.retryCount += 1;
    if (item.retryCount < item.maxRetries) {
      // Exponential backoff: 30s, 2m, 8m, 32m, 2h (capped)
      const backoffSec = Math.min(30 * Math.pow(4, item.retryCount - 1), 7200);
      item.nextAttemptAt = new Date(now.getTime() + backoffSec * 1000).toISOString();
      item.status = 'pending';
    } else {
      item.status = 'failed';
    }
  }

  safeWriteJsonFile('webhook_queue.json', queue);
  return item;
}

// ---------------------------------------------------------------------------
// 4. Full Un-truncated Lead History & Archive Store
// ---------------------------------------------------------------------------

export function getArchivedLeads(): any[] {
  return safeReadJsonFile<any[]>('archived_leads.json', []);
}

export function appendArchivedLeads(newlyArchived: any[]): void {
  if (!newlyArchived || newlyArchived.length === 0) return;
  const current = getArchivedLeads();
  const existingIds = new Set(current.map((l: any) => l.id));
  const toAdd = newlyArchived.filter((l: any) => !existingIds.has(l.id));
  // Preserve full history without arbitrary 2000 cutoff
  safeWriteJsonFile('archived_leads.json', [...toAdd, ...current]);
}

// ---------------------------------------------------------------------------
// 5. In-App Task Completion Store
// ---------------------------------------------------------------------------

export function markTaskComplete(leadId: string, taskId: string, completedBy?: string): void {
  const meta = getLeadMetadata(leadId) || {
    leadId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const taskCompletions = meta.taskCompletions || {};
  taskCompletions[taskId] = {
    completedAt: new Date().toISOString(),
    completedBy: completedBy || 'team',
  };
  saveLeadMetadata({ leadId, taskCompletions });
}

export function isTaskCompleted(leadId: string, taskId: string): boolean {
  const meta = getLeadMetadata(leadId);
  return Boolean(meta?.taskCompletions?.[taskId]);
}
