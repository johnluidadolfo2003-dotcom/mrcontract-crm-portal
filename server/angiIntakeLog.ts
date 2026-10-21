import { randomUUID } from 'node:crypto';
import * as store from './durableStore.ts';
import { sanitizeErrorMessage } from './houzzDelivery.ts';

export function recordAngiIntakeFailure(phase: string, statusCode: number, error: string): void {
  const stored = store.safeReadJsonFile<any[]>('webhook_logs.json', []);
  const logs = Array.isArray(stored) ? stored : [];
  store.safeWriteJsonFile('webhook_logs.json', [{
    id: `log_${randomUUID()}`, receivedAt: new Date().toISOString(), source: 'Angi',
    clientName: '', clientPhone: '', ip: '', leadId: '', success: false,
    error: sanitizeErrorMessage(error).slice(0, 240), phase, statusCode,
  }, ...logs].slice(0, 150));
}
