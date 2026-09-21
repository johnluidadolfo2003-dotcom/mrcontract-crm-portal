import { ActivityLog } from '../types';

export async function fetchActivityLogs(params?: { clientName?: string; userName?: string; limit?: number }): Promise<ActivityLog[]> {
  const query = new URLSearchParams();
  if (params?.clientName) query.set('clientName', params.clientName);
  if (params?.userName) query.set('userName', params.userName);
  if (params?.limit) query.set('limit', String(params.limit));
  const res = await fetch(`/api/activity-logs?${query.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !Array.isArray(data.logs)) throw new Error(data.error || 'Unable to load activity logs.');
  return data.logs;
}

export async function logAuditActivity(params: {
  actionType: ActivityLog['actionType']; clientName?: string; clientPhone?: string; tabName?: string;
  details: string; oldValue?: string; newValue?: string;
}): Promise<ActivityLog | null> {
  const res = await fetch('/api/activity-logs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, userName: 'Administrator' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    console.error('Activity log persistence failed:', data.error || res.statusText);
    throw new Error(data.error || 'Activity log could not be saved.');
  }
  return data.log || null;
}
