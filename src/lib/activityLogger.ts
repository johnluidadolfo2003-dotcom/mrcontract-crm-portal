import { ActivityLog, AppUser } from '../types';

const STORAGE_LOGS_KEY = 'mrcontract_activity_logs_cache';

export function getCachedActiveUser(): AppUser | null {
 try {
 if (localStorage.getItem('mrcontract_logged_out') === 'true') {
 return null;
 }
 const raw = localStorage.getItem('mrcontract_active_user');
 if (!raw) return null;
 return JSON.parse(raw);
 } catch (e) {
 return null;
 }
}

export function setCachedActiveUser(user: AppUser | null) {
 try {
 if (user) {
 localStorage.setItem('mrcontract_active_user', JSON.stringify(user));
 localStorage.removeItem('mrcontract_logged_out');
 } else {
 localStorage.removeItem('mrcontract_active_user');
 localStorage.setItem('mrcontract_logged_out', 'true');
 }
 window.dispatchEvent(new CustomEvent('active_user_changed', { detail: user }));
 } catch (e) {
 console.error('Error saving cached active user:', e);
 }
}

export async function fetchActivityLogs(params?: { clientName?: string; userName?: string; limit?: number }): Promise<ActivityLog[]> {
 try {
 const query = new URLSearchParams();
 if (params?.clientName) query.set('clientName', params.clientName);
 if (params?.userName) query.set('userName', params.userName);
 if (params?.limit) query.set('limit', String(params.limit));

 const res = await fetch(`/api/activity-logs?${query.toString()}`);
 if (res.ok) {
 const data = await res.json();
 if (data.success && Array.isArray(data.logs)) {
 if (!params?.clientName && !params?.userName) {
 localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(data.logs.slice(0, 100)));
 }
 return data.logs;
 }
 }
 } catch (err) {
 console.warn('Network error fetching activity logs, using cache:', err);
 }

 // Fallback to local cache
 try {
 const cached = localStorage.getItem(STORAGE_LOGS_KEY);
 if (cached) {
 let logs: ActivityLog[] = JSON.parse(cached);
 if (params?.clientName) {
 const q = params.clientName.toLowerCase();
 logs = logs.filter(l => l.clientName && l.clientName.toLowerCase().includes(q));
 }
 if (params?.userName) {
 const u = params.userName.toLowerCase();
 logs = logs.filter(l => l.userName && l.userName.toLowerCase() === u);
 }
 return logs;
 }
 } catch {}

 return [];
}

export async function logAuditActivity(params: {
 actionType: ActivityLog['actionType'];
 clientName?: string;
 clientPhone?: string;
 tabName?: string;
 details: string;
 oldValue?: string;
 newValue?: string;
}): Promise<ActivityLog | null> {
 const activeUser = getCachedActiveUser();
 const userName = activeUser?.name || 'Worker';
 const userId = activeUser?.id || 'usr_anonymous';
 const userColor = activeUser?.color || '#FF5500';

 const logPayload: Partial<ActivityLog> = {
 actionType: params.actionType || 'general',
 userId,
 userName,
 userColor,
 clientName: params.clientName || '',
 clientPhone: params.clientPhone || '',
 tabName: params.tabName || '',
 details: params.details,
 oldValue: params.oldValue || '',
 newValue: params.newValue || '',
 };

 try {
 const res = await fetch('/api/activity-logs', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(logPayload),
 });

 if (res.ok) {
 const data = await res.json();
 if (data.success && data.log) {
 window.dispatchEvent(new CustomEvent('activity_logged', { detail: data.log }));
 return data.log;
 }
 }
 } catch (err) {
 console.warn('Failed to post activity log to server, caching locally:', err);
 }

 // Create local fallback log
 const fallbackLog: ActivityLog = {
 id: `log_local_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
 timestamp: new Date().toISOString(),
 actionType: params.actionType || 'general',
 userId,
 userName,
 userColor,
 clientName: params.clientName || '',
 clientPhone: params.clientPhone || '',
 tabName: params.tabName || '',
 details: params.details,
 oldValue: params.oldValue || '',
 newValue: params.newValue || '',
 };

 try {
 const cached = localStorage.getItem(STORAGE_LOGS_KEY);
 let logs: ActivityLog[] = cached ? JSON.parse(cached) : [];
 logs = [fallbackLog, ...logs].slice(0, 100);
 localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(logs));
 } catch {}

 window.dispatchEvent(new CustomEvent('activity_logged', { detail: fallbackLog }));
 return fallbackLog;
}
