import React, { useState, useEffect } from 'react';
import {
 FileSpreadsheet,
 Columns3,
 ArrowLeft,
 RefreshCw,
 ExternalLink,
 Plus,
 Search,
 Calendar,
 Clock,
 Phone,
 Mail,
 MapPin,
 Tag,
 ArrowRight,
 CheckCircle2,
 CheckCircle,
 AlertCircle,
 FolderOpen,
 Send,
 UserCheck,
 ChevronDown,
 ChevronUp,
 Filter,
 Sun,
 Moon,
 LayoutList,
 Table as TableIcon,
 User,
 WifiOff,
 AlertTriangle,
 Layers,
 ShieldAlert,
 CalendarClock,
 Trash2
} from 'lucide-react';
import { ESTIMATE_FOLLOW_UP_SCRIPTS, getScriptForLead } from '../data/estimateScripts';
import { useNavigate, useLocation } from 'react-router-dom';
import { getCachedAccessToken, googleSignIn, withGoogleToken, isAuthError, clearCachedAccessToken, fetchSharedTokenFromServer } from '../lib/firebase';
import {
 readSpreadsheetRows,
 readAllSpreadsheetTabs,
 listGoogleSpreadsheets,
 getSpreadsheetDetails,
 createSheetTabIfNotExists,
 appendAppointmentToSheet,
 updateRowStatusInSheet,
 updateCellInSheet,
 deleteRowFromSheet,
 extractSpreadsheetId,
 formatSheetWithStandardHeaders,
 invalidateSpreadsheetCache,
 fetchSharedStatusOverrides,
 SheetRowRecord,
 GoogleDriveFile,
 SpreadsheetDetails
} from '../lib/sheets';
import { SkeletonTable } from '../components/ui/SkeletonTable';
import { EmptyState } from '../components/ui/EmptyState';
import { Toast } from '../components/ui/Toast';
import { LeadDrawer } from '../components/ui/LeadDrawer';
import { formatName, formatPhoneNumber, isFollowUpOverdue, calculateLeadAge, checkFollowUpOverdue, addLeadActivity, getEstimateFollowUpInfo, isFollowUpStatus, isMeetingScheduledStatus } from '../lib/utils';
import { logAuditActivity } from '../lib/activityLogger';
import { loadAppConfig, saveAppConfig, applyTheme, isLeadSourceTab } from '../config';
import { AppConfig, AppointmentFormData, LEAD_STATUS_OPTIONS, LeadStatus } from '../types';
import { sendLeadToHouzzPro, isLeadInHouzzPro, getLeadUniqueKey, getHouzzSyncedLeadKeys } from '../lib/houzz';
import { fetchGoogleCalendarEvents, matchCalendarEventForLead, formatAppointmentDateTime } from '../lib/calendar';

export const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
 'New': {
 bg: 'bg-zinc-100 dark:bg-zinc-800/80',
 text: 'text-zinc-800 dark:text-zinc-200 font-extrabold',
 border: 'border-zinc-300 dark:border-zinc-700',
 dot: 'bg-zinc-500',
 },
 'Followed Up': {
 bg: 'bg-zinc-100 dark:bg-zinc-800/80',
 text: 'text-zinc-800 dark:text-zinc-200 font-extrabold',
 border: 'border-zinc-300 dark:border-zinc-700',
 dot: 'bg-zinc-500',
 },
 'Meeting Scheduled': {
 bg: 'bg-emerald-100 dark:bg-emerald-950/80',
 text: 'text-emerald-950 dark:text-emerald-100 font-extrabold',
 border: 'border-emerald-300 dark:border-emerald-800',
 dot: 'bg-emerald-500',
 },
 '3 day Follow UP': {
 bg: 'bg-zinc-100 dark:bg-zinc-800/80',
 text: 'text-zinc-800 dark:text-zinc-200 font-extrabold',
 border: 'border-zinc-300 dark:border-zinc-700',
 dot: 'bg-zinc-500',
 },
 '7 day Follow UP': {
 bg: 'bg-zinc-100 dark:bg-zinc-800/80',
 text: 'text-zinc-800 dark:text-zinc-200 font-extrabold',
 border: 'border-zinc-300 dark:border-zinc-700',
 dot: 'bg-zinc-500',
 },
 '30 day Follow UP': {
    bg: 'bg-orange-500/10 dark:bg-orange-950/40',
    text: 'text-orange-900 dark:text-orange-200 font-bold',
    border: 'border-orange-500/30 dark:border-orange-500/30',
    dot: 'bg-[#FF5500]',
  },
 '15 day Follow UP': {
 bg: 'bg-zinc-100 dark:bg-zinc-800/80',
 text: 'text-zinc-800 dark:text-zinc-200 font-extrabold',
 border: 'border-zinc-300 dark:border-zinc-700',
 dot: 'bg-zinc-500',
 },
 'Past 90 days Follow UP': {
 bg: 'bg-red-100 dark:bg-red-950/80',
 text: 'text-red-950 dark:text-red-100 font-extrabold',
 border: 'border-red-300 dark:border-red-800',
 dot: 'bg-red-500',
 },
 'Won': {
 bg: 'bg-emerald-600 dark:bg-emerald-600',
 text: 'text-white font-black',
 border: 'border-emerald-700 dark:border-emerald-500',
 dot: 'bg-white',
 },
 'Won Job': {
 bg: 'bg-emerald-600 dark:bg-emerald-600',
 text: 'text-white font-black',
 border: 'border-emerald-700 dark:border-emerald-500',
 dot: 'bg-white',
 },
 'Lost Job': {
 bg: 'bg-red-600 dark:bg-red-600',
 text: 'text-white font-extrabold',
 border: 'border-red-700 dark:border-red-500',
 dot: 'bg-white',
 },
 'Lost': {
 bg: 'bg-red-600 dark:bg-red-600',
 text: 'text-white font-extrabold',
 border: 'border-red-700 dark:border-red-500',
 dot: 'bg-white',
 },
 'Lost Job (For Refund)': {
 bg: 'bg-red-600 dark:bg-red-600',
 text: 'text-white font-extrabold',
 border: 'border-red-700 dark:border-red-500',
 dot: 'bg-white',
 },
 'Lost Job (Nonrefundable)': {
 bg: 'bg-red-600 dark:bg-red-600',
 text: 'text-white font-extrabold',
 border: 'border-red-700 dark:border-red-500',
 dot: 'bg-white',
 },
 'Lost Job (Non-refundable)': {
 bg: 'bg-red-600 dark:bg-red-600',
 text: 'text-white font-extrabold',
 border: 'border-red-700 dark:border-red-500',
 dot: 'bg-white',
 },
 'Estimating': {
    bg: 'bg-orange-500/10 dark:bg-orange-950/40',
    text: 'text-orange-900 dark:text-orange-200 font-bold',
    border: 'border-orange-500/30 dark:border-orange-500/30',
    dot: 'bg-[#FF5500]',
  },
 'Estimate Sent': {
 bg: 'bg-emerald-100 dark:bg-emerald-950/80',
 text: 'text-emerald-950 dark:text-white font-bold',
 border: 'border-emerald-300 dark:border-emerald-700/80',
 dot: 'bg-emerald-500',
 },
 'Bad Lead / Duplicate': {
 bg: 'bg-zinc-100 dark:bg-zinc-900',
 text: 'text-zinc-800 dark:text-white font-bold',
 border: 'border-zinc-300 dark:border-zinc-800',
 dot: 'bg-zinc-400',
 },
};

/**
 * Returns color styles for a status, matching case-insensitively or falling back gracefully
 */
export function getStatusStyle(status: string) {
 const cleanStatus = (status || '').toLowerCase().trim();
 const key = Object.keys(STATUS_STYLES).find(
 (k) => k.toLowerCase() === cleanStatus
 );
 if (key && STATUS_STYLES[key]) {
 return STATUS_STYLES[key];
 }

 // Fallback pattern matching for"Lost"variations
 if (cleanStatus.includes('lost')) {
 return {
 bg: 'bg-red-600 dark:bg-red-600',
 text: 'text-white font-extrabold',
 border: 'border-red-700 dark:border-red-500',
 dot: 'bg-white',
 };
 }

 // Fallback pattern matching for"Won"variations
 if (cleanStatus.includes('won')) {
 return {
 bg: 'bg-emerald-600 dark:bg-emerald-600',
 text: 'text-white font-black',
 border: 'border-emerald-700 dark:border-emerald-500',
 dot: 'bg-white',
 };
 }

 return {
 bg: 'bg-zinc-100 dark:bg-zinc-800',
 text: 'text-zinc-900 dark:text-white font-bold',
 border: 'border-zinc-300 dark:border-zinc-700',
 dot: 'bg-zinc-400',
 };
}

export function isNewStatus(statusStr?: string) {
 const norm = (statusStr || '').trim().toLowerCase();
 return !norm || norm === 'new' || norm === 'new lead';
}

/**
 * Ensures the exact status from the spreadsheet is displayed and selected in the dropdown
 */
export function getStatusOptionsForRecord(rawStatus?: string): {
 selectedStatus: string;
 allOptions: string[];
} {
 const current = (rawStatus || 'New').trim();
 const normalizedCurrent = current.replace(/\s+/g, ' ').toLowerCase();

 const match = LEAD_STATUS_OPTIONS.find(
 (opt) => opt.toLowerCase().replace(/\s+/g, ' ') === normalizedCurrent
 );
 if (match) {
 return {
 selectedStatus: match,
 allOptions: [...LEAD_STATUS_OPTIONS],
 };
 }
 // If spreadsheet contains custom status or different text, preserve and show it
 return {
 selectedStatus: current,
 allOptions: [current, ...LEAD_STATUS_OPTIONS.filter((opt) => opt.toLowerCase().replace(/\s+/g, ' ') !== normalizedCurrent)],
 };
}

export const SpreadsheetPage: React.FC = () => {
 const navigate = useNavigate();
 const location = useLocation();
 const [config, setConfig] = useState<AppConfig>(loadAppConfig);
 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [isAuthRequired, setIsAuthRequired] = useState(false);
 const [isSigningIn, setIsSigningIn] = useState(false);
 const [successMsg, setSuccessMsg] = useState<string | null>(null);
 const [viewMode, setViewMode] = useState<'compact' | 'table' | 'kanban'>('compact');
 const [expandedRow, setExpandedRow] = useState<number | null>(null);
 const [updatingRowKey, setUpdatingRowKey] = useState<string | number | null>(null);
 const [sendingHouzzKey, setSendingHouzzKey] = useState<string | number | null>(null);
 const [houzzSyncedKeys, setHouzzSyncedKeys] = useState<Set<string>>(getHouzzSyncedLeadKeys());
 const [selectedLead, setSelectedLead] = useState<SheetRowRecord | null>(null);
 const [lastUpdated, setLastUpdated] = useState<number>(() => Date.now());
 const [refreshError, setRefreshError] = useState(false);

 // Rows and data
 const [headers, setHeaders] = useState<string[]>([]);
 const [rows, setRows] = useState<SheetRowRecord[]>([]);
 const [allSourcesRows, setAllSourcesRows] = useState<SheetRowRecord[]>([]);
 const [statusFilter, setStatusFilter] = useState("ALL");

 useEffect(() => {
 const params = new URLSearchParams(location.search);
 const statusParam = params.get('status');
 if (statusParam) {
 // Find case-insensitive match or match the exact query parameter
 const matchedOption = LEAD_STATUS_OPTIONS.find(
 (opt) => opt.toLowerCase() === statusParam.toLowerCase()
 ) || statusParam;
 setStatusFilter(matchedOption);
 
 // If we're filtering by a specific status from the URL (likely from sidebar), 
 // ensure we're looking at ALL sources to see all matches.
 if (selectedTab !== 'ALL') {
 handleSwitchTab('ALL');
 }
 } else {
 setStatusFilter('ALL');
 }
 }, [location.search]);

 // Customer Service Center state
 const [csSourceFilter, setCsSourceFilter] = useState<string>('ALL');
 const [csSearchQuery, setCsSearchQuery] = useState<string>('');

 // New features state
 const [quickTab, setQuickTab] = useState<'ALL' | 'NEW' | 'OVERDUE' | 'MEETINGS' | 'FOLLOW_UPS' | 'WON' | 'LOST'>('ALL');
 const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('ALL');
 const [sortBy, setSortBy] = useState<'NEWEST' | 'OLDEST' | 'PRIORITY' | 'NAME'>('NEWEST');
 const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
 const [calendarEvents, setCalendarEvents] = useState<any[]>([]);

 useEffect(() => {
 let isMounted = true;
 const loadEvents = async () => {
 try {
 const events = await fetchGoogleCalendarEvents(config.calendarId);
 if (isMounted && Array.isArray(events)) {
 setCalendarEvents(events);
 }
 } catch {}
 };
 loadEvents();

 const handleAuthChange = () => {
 if (isMounted) loadEvents();
 };

 window.addEventListener('google_auth_updated', handleAuthChange);
 window.addEventListener('dashboard_data_refresh', handleAuthChange);

 return () => {
 isMounted = false;
 window.removeEventListener('google_auth_updated', handleAuthChange);
 window.removeEventListener('dashboard_data_refresh', handleAuthChange);
 };
 }, []);

 // CS Estimate Reminder states
 const [isCSModalOpen, setIsCSModalOpen] = useState(false);
 const [csSelectedLead, setCsSelectedLead] = useState<SheetRowRecord | null>(null);
 const [csSelectedScriptDay, setCsSelectedScriptDay] = useState<number>(3);
 const [copiedType, setCopiedType] = useState<'email' | 'sms' | null>(null);
 const [isSendingEmail, setIsSendingEmail] = useState(false);
 const [emailSendResult, setEmailSendResult] = useState<{ success: boolean; msg: string } | null>(null);
 const [rowToDelete, setRowToDelete] = useState<SheetRowRecord | null>(null);

 useEffect(() => {
 const handleOnline = () => setIsOnline(true);
 const handleOffline = () => setIsOnline(false);

 window.addEventListener('online', handleOnline);
 window.addEventListener('offline', handleOffline);

 return () => {
 window.removeEventListener('online', handleOnline);
 window.removeEventListener('offline', handleOffline);
 };
 }, []);

 const toggleTheme = () => {
 const next: 'dark' | 'light' = config.theme === 'dark' ? 'light' : 'dark';
 const updated: AppConfig = { ...config, theme: next };
 setConfig(updated);
 saveAppConfig(updated);
 applyTheme(next);
 };

 const handleGoogleSignIn = async () => {
 setIsSigningIn(true);
 setError(null);
 try {
 await googleSignIn(true);
 setIsAuthRequired(false);
 setSuccessMsg('Google connected');
 setTimeout(() => setSuccessMsg(null), 3000);
 await fetchRows(config.spreadsheetId, selectedTab);
 } catch (err: any) {
 console.error('Google Sign In failed:', err);
 setError(err.message || 'Failed to authenticate with Google. Please ensure popups are allowed and try again.');
 } finally {
 setIsSigningIn(false);
 }
 };

 const [selectedTab, setSelectedTab] = useState(config.sheetTabName || 'Angi');
 const [availableTabs, setAvailableTabs] = useState<string[]>([]);
 const [isInitializingTabs, setIsInitializingTabs] = useState(false);
 const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);

 // Default 10 lead source tabs requested by user
 const standardTabs = config.leadSources && config.leadSources.length > 0 ? config.leadSources : [
 'Angi',
 'Thumbtack',
 'Referral',
 'Big Fish',
 'Houzz Pro',
 'Roof R',
 'Home Launch',
 'Website',
 'Yard Sign',
 'Other',
 ];

 // Combine standard 10 tabs with any additional custom tabs found in the spreadsheet (excluding non-lead tabs like Summary and Zapier)
 const allDisplayTabs = Array.from(
 new Set([...standardTabs, ...availableTabs])
 ).filter(isLeadSourceTab);

 // Quick Append Modal
 const [isAddModalOpen, setIsAddModalOpen] = useState(false);
 const [newRowData, setNewRowData] = useState<AppointmentFormData>({
 clientName: '',
 appointmentDate: new Date().toISOString().split('T')[0],
 startTime: '09:00',
 endTime: '11:00',
 salespersonCode: config.salespeople[0]?.code || 'DG',
 clientPhone: '',
 clientEmail: '',
 address: '',
 leadSource: selectedTab || config.sheetTabName || config.leadSources[0] || 'Angi',
 leadType: config.leadTypes[0] || 'Direct',
 notes: '',
 status: 'New',
 serviceNeeded: '',
 });
 const [isAppending, setIsAppending] = useState(false);

 const fetchRows = async (spreadsheetId?: string, tabName?: string, isBackground = false, forceFresh = false) => {
 const targetId = spreadsheetId || config.spreadsheetId;
 const targetTab = tabName !== undefined ? tabName : (selectedTab || config.sheetTabName || 'Angi');
 const cacheKey = `mrcontract_cache_${targetId}_${targetTab}`;

 if (!targetId) {
 setLoading(false);
 setRefreshing(false);
 return;
 }

 if (forceFresh) {
 invalidateSpreadsheetCache(targetId);
 }

 try {
 // Sync latest team status overrides
 await fetchSharedStatusOverrides().catch(() => {});

 // Fetch metadata to get tab names if needed (cached in sheets.ts)
 let currentTabs = allDisplayTabs;
 try {
 const details = await getSpreadsheetDetails(undefined, targetId, forceFresh);
 const discovered = details.sheets.map((s) => s.title);
 setAvailableTabs(discovered);
 if (discovered.length > 0) {
 currentTabs = Array.from(new Set([...standardTabs, ...discovered])).filter(isLeadSourceTab);
 }
 if (details.title && details.title !== config.spreadsheetName) {
 const updated = { ...config, spreadsheetName: details.title };
 setConfig(updated);
 saveAppConfig(updated);
 }
 } catch (_) {}

 if (targetTab === 'ALL') {
 const data = await readAllSpreadsheetTabs(undefined, targetId, currentTabs, forceFresh);
 setIsAuthRequired(false);
 setError(null);
 setHeaders(data.headers);
 setRows(data.rows);
 setAllSourcesRows(data.rows);

 try {
 localStorage.setItem(cacheKey, JSON.stringify(data));
 localStorage.setItem(`mrcontract_cache_${targetId}_ALL`, JSON.stringify(data));
 } catch (e) {}
 window.dispatchEvent(new CustomEvent('mrcontract_data_synced', { detail: data.rows }));
 } else {
 const data = await readSpreadsheetRows(undefined, targetId, targetTab, forceFresh);
 setIsAuthRequired(false);
 setError(null);
 setLastUpdated(Date.now());
 setRefreshError(false);
 setHeaders(data.headers);
 setRows(data.rows);

 try {
 localStorage.setItem(cacheKey, JSON.stringify(data));
 } catch (e) {}

 readAllSpreadsheetTabs(undefined, targetId, currentTabs, forceFresh)
 .then((allData) => {
 if (allData && allData.rows) {
 setAllSourcesRows(allData.rows);
 try {
 localStorage.setItem(`mrcontract_cache_${targetId}_ALL`, JSON.stringify(allData));
 } catch (e) {}
 window.dispatchEvent(new CustomEvent('mrcontract_data_synced', { detail: allData.rows }));
 }
 })
 .catch(() => {});
 }
 } catch (err: any) {
 setRefreshError(true);
 // Attempt offline cache recovery
 let hadCachedData = false;
 const cached = localStorage.getItem(cacheKey);
 if (cached) {
 try {
 const data = JSON.parse(cached);
 if (data.headers && data.rows) {
 setHeaders(data.headers || []);
 setRows(data.rows || []);
 if (targetTab === 'ALL') {
 setAllSourcesRows(data.rows || []);
 }
 hadCachedData = true;
 }
 } catch (e) {}
 }

 console.error('Failed to load spreadsheet rows:', err);
 const msg = (err.message || '').toLowerCase();
 
 // Only set the major UI error banner if this is NOT a quiet background poll
 if (!isBackground) {
 if (msg.includes('quota') || msg.includes('429') || msg.includes('rate limit') || msg.includes('resource_exhausted')) {
 if (hadCachedData) {
 setSuccessMsg('Showing cached spreadsheet data while Google Sheets API quota cools down.');
 setTimeout(() => setSuccessMsg(null), 6000);
 } else {
 setError('Google Sheets API rate limit reached (60 requests/min). Please wait a few seconds and click Refresh.');
 }
 } else if (msg.includes('404') || msg.includes('not found')) {
 setError('Spreadsheet not found or permission denied. Please verify the spreadsheet ID and ensure it is shared with your Service Account.');
 } else if (msg.includes('unable to parse range')) {
 setError(`Sheet tab"${targetTab}"was not found in this spreadsheet. You can click"Initialize All 10 Tabs"to auto-create all lead source tabs.`);
 } else {
 setError(err.message || 'Failed to communicate with Google Sheets.');
 }
 } else {
 console.warn('Background sync failed silently:', err.message);
 }
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 };

 const handleSwitchTab = async (tabName: string) => {
 setSelectedTab(tabName);
 const updated = { ...config, sheetTabName: tabName };
 setConfig(updated);
 saveAppConfig(updated);
 if (tabName !== 'ALL') {
 setNewRowData((prev) => ({
 ...prev,
 leadSource: standardTabs.includes(tabName) ? tabName : prev.leadSource,
 }));
 }
 setLoading(true);
 await fetchRows(config.spreadsheetId, tabName);
 };

 const handleInitializeAllTabs = async () => {
 if (!config.spreadsheetId) return;
 setIsInitializingTabs(true);
 setError(null);
 try {
 for (const tab of standardTabs) {
 await createSheetTabIfNotExists(undefined, config.spreadsheetId, tab);
 }
 setSuccessMsg('Spreadsheet tabs created');
 setTimeout(() => setSuccessMsg(null), 5000);
 await fetchRows(config.spreadsheetId, selectedTab);
 } catch (err: any) {
 console.error('Failed to initialize tabs:', err);
 setError(err.message || 'Failed to create lead source tabs in spreadsheet.');
 } finally {
 setIsInitializingTabs(false);
 }
 };

 useEffect(() => {
 fetchRows();

 // Auto-refresh when user returns to this browser tab (quiet background check)
 const handleWindowFocus = () => {
 if (document.visibilityState === 'visible' && config.spreadsheetId) {
 fetchRows(config.spreadsheetId, selectedTab, true);
 }
 };

 window.addEventListener('focus', handleWindowFocus);
 document.addEventListener('visibilitychange', handleWindowFocus);

 // Periodic live sync: sync team overrides every 10s and full sheet poll every 45s
 const overrideInterval = setInterval(() => {
 if (document.visibilityState === 'visible') {
 fetchSharedStatusOverrides().catch(() => {});
 }
 }, 30000);

 const interval = setInterval(() => {
 if (
 document.visibilityState === 'visible' &&
 config.spreadsheetId &&
 !updatingRowKey
 ) {
 fetchRows(config.spreadsheetId, selectedTab, true);
 }
 }, 90000);

 return () => {
 window.removeEventListener('focus', handleWindowFocus);
 document.removeEventListener('visibilitychange', handleWindowFocus);
 clearInterval(overrideInterval);
 clearInterval(interval);
 };
 }, [config.spreadsheetId, selectedTab]);

 const handleRefresh = async () => {
 setRefreshing(true);
 invalidateSpreadsheetCache(config.spreadsheetId);
 await fetchRows(config.spreadsheetId, selectedTab, false, true);
 setSuccessMsg('Updated');
 setTimeout(() => setSuccessMsg(null), 3500);
 };

 const handleAppendRow = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!newRowData.clientName.trim()) {
 setError('Please provide a client name.');
 return;
 }
 if (!config.spreadsheetId) {
 setError('Please connect a Google Spreadsheet first.');
 return;
 }

 setIsAppending(true);
 setError(null);
 try {
 const { rows } = await readSpreadsheetRows(undefined, config.spreadsheetId!, selectedTab);
 const isDuplicate = rows.some(r => {
 const nameMatch = r.clientName && newRowData.clientName && r.clientName.toLowerCase().trim() === newRowData.clientName.toLowerCase().trim();
 const phoneMatch = r.clientPhone && newRowData.clientPhone && r.clientPhone.replace(/\D/g, '') === newRowData.clientPhone.replace(/\D/g, '');
 return nameMatch || (phoneMatch && newRowData.clientPhone.length > 5);
 });

 if (isDuplicate) {
 throw new Error(`A lead with this name or phone number already exists in"${selectedTab}".`);
 }

 await appendAppointmentToSheet(
 undefined,
 config.spreadsheetId,
 selectedTab,
 newRowData,
 newRowData.status || 'New'
 );

 setSuccessMsg("Lead saved");
 setTimeout(() => setSuccessMsg(null), 4000);
 setIsAddModalOpen(false);
 setNewRowData({
 clientName: '',
 appointmentDate: new Date().toISOString().split('T')[0],
 startTime: '09:00',
 endTime: '11:00',
 salespersonCode: config.salespeople[0]?.code || 'DG',
 clientPhone: '',
 clientEmail: '',
 address: '',
 leadSource: selectedTab,
 leadType: config.leadTypes[0] || 'Direct',
 notes: '',
 status: 'New',
 serviceNeeded: '',
 });
 await fetchRows(config.spreadsheetId, selectedTab);
 } catch (err: any) {
 console.error('Failed to append row:', err);
 setError(err.message || 'Failed to append row to spreadsheet.');
 } finally {
 setIsAppending(false);
 }
 };

 const handleStatusChange = async (row: SheetRowRecord, newStatus: string) => {
 const rowKey = row.rowIndex;
 const oldStatus = row.status || 'New';
 setUpdatingRowKey(rowKey);

 // Optimistically update both rows and allSourcesRows state
 setRows((prev) =>
 prev.map((r) => (r.rowIndex === row.rowIndex && (!r.tabName || !row.tabName || r.tabName === row.tabName) ? { ...r, status: newStatus } : r))
 );
 setAllSourcesRows((prev) =>
 prev.map((r) => (r.rowIndex === row.rowIndex && (!r.tabName || !row.tabName || r.tabName === row.tabName) ? { ...r, status: newStatus } : r))
 );
 if (selectedLead && selectedLead.rowIndex === row.rowIndex && (!selectedLead.tabName || !row.tabName || selectedLead.tabName === row.tabName)) {
 setSelectedLead((prev) => prev ? { ...prev, status: newStatus } : null);
 }

 // Log activity for lead timeline & estimate tracking
 const leadKey = row.clientPhone || row.clientEmail || row.clientName || `row_${row.rowIndex}`;
 addLeadActivity(leadKey, {
 leadKey,
 type: 'status_change',
 message: `Status updated to"${newStatus}"`,
 });

 logAuditActivity({
 actionType: 'status_change',
 clientName: row.clientName,
 clientPhone: row.clientPhone,
 tabName: row.tabName || selectedTab,
 details: `Changed status of"${row.clientName || 'Lead'}"from"${oldStatus}"to"${newStatus}"`,
 oldValue: oldStatus,
 newValue: newStatus,
 });

 try {
 if (!config.spreadsheetId) {
 throw new Error('Google spreadsheet not connected.');
 }

 const targetTabName = (row.tabName && row.tabName !== 'ALL') ? row.tabName : (selectedTab !== 'ALL' ? selectedTab : 'Angi');
 const colIndex = row.statusColIndex !== undefined ? row.statusColIndex : (headers.indexOf('Status') >= 0 ? headers.indexOf('Status') : 7);
 if (config.spreadsheetId) {
    const targetTabName = (row.tabName && row.tabName !== 'ALL') ? row.tabName : (selectedTab !== 'ALL' ? selectedTab : 'Angi');
    const colIndex = row.statusColIndex !== undefined ? row.statusColIndex : 7;
    updateRowStatusInSheet(undefined, config.spreadsheetId, targetTabName, row.rowIndex, newStatus, colIndex, row.clientName)
      .catch(err => console.error('Background sheet sync error:', err));
  }// Update local storage caches
 try {
 const targetTabName = (row.tabName && row.tabName !== 'ALL') ? row.tabName : (selectedTab !== 'ALL' ? selectedTab : 'Angi');
 const tabCacheKey = `mrcontract_cache_${config.spreadsheetId}_${targetTabName}`;
 const allCacheKey = `mrcontract_cache_${config.spreadsheetId}_ALL`;

 const tabCached = localStorage.getItem(tabCacheKey);
 if (tabCached) {
 const parsed = JSON.parse(tabCached);
 if (parsed && Array.isArray(parsed.rows)) {
 parsed.rows = parsed.rows.map((r: SheetRowRecord) =>
 r.rowIndex === row.rowIndex ? { ...r, status: newStatus } : r
 );
 localStorage.setItem(tabCacheKey, JSON.stringify(parsed));
 }
 }

 const allCached = localStorage.getItem(allCacheKey);
 if (allCached) {
 const parsed = JSON.parse(allCached);
 if (parsed && Array.isArray(parsed.rows)) {
 parsed.rows = parsed.rows.map((r: SheetRowRecord) =>
 r.rowIndex === row.rowIndex && (!r.tabName || !row.tabName || r.tabName === row.tabName) ? { ...r, status: newStatus } : r
 );
 localStorage.setItem(allCacheKey, JSON.stringify(parsed));
 }
 }
 } catch (e) {}

 window.dispatchEvent(new CustomEvent('mrcontract_data_synced'));
 window.dispatchEvent(new Event('storage'));

 setSuccessMsg('Status saved');
 setTimeout(() => setSuccessMsg(null), 3500);
 } catch (err: any) {
 console.error('Failed to update status in Google Sheet:', err);
 setError(`Failed to update status in Google Sheet: ${err.message || 'Error updating cell'}`);
 await fetchRows(config.spreadsheetId, selectedTab, false, true);
 } finally {
 setUpdatingRowKey(null);
 }
 };

 const handleDeleteRow = (row: SheetRowRecord) => {
 setRowToDelete(row);
 };

 const confirmDeleteRow = async () => {
    if (!rowToDelete) return;
    const row = rowToDelete;
    setRowToDelete(null);
    const targetTabName = row.tabName && row.tabName !== 'ALL' ? row.tabName : (row.leadSource || (selectedTab !== 'ALL' ? selectedTab : 'Angi'));
    const targetNameNorm = (row.clientName || '').trim().toLowerCase();

    try {
      const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
      if (spreadsheetId) {
        await deleteRowFromSheet(undefined, spreadsheetId, targetTabName, row.rowIndex);
      }

      setRows((prev) => 
        prev
          .filter((r) => {
            const rName = (r.clientName || '').trim().toLowerCase();
            const matchName = targetNameNorm && rName === targetNameNorm;
            const matchIndex = r.rowIndex === row.rowIndex;
            return !(matchIndex || matchName);
          })
          .map((r) => (r.rowIndex > row.rowIndex) ? { ...r, rowIndex: r.rowIndex - 1 } : r)
      );
      setAllSourcesRows((prev) => 
        prev
          .filter((r) => {
            const rName = (r.clientName || '').trim().toLowerCase();
            const matchName = targetNameNorm && rName === targetNameNorm;
            const matchIndex = r.rowIndex === row.rowIndex;
            return !(matchIndex || matchName);
          })
          .map((r) => (r.rowIndex > row.rowIndex) ? { ...r, rowIndex: r.rowIndex - 1 } : r)
      );

      setSuccessMsg('Lead deleted');
      setTimeout(() => setSuccessMsg(null), 3500);

      logAuditActivity({
        actionType: 'delete_lead',
        clientName: row.clientName,
        clientPhone: row.clientPhone,
        tabName: targetTabName,
        details: `Deleted lead "${row.clientName || 'Lead'}"`
      });
    } catch (sheetErr: any) {
      console.error('Google Sheet row delete error:', sheetErr);
      setError(`Failed to delete row from Google Sheet: ${sheetErr.message || 'Network error'}`);
    }
  };

  const handleSendEmailDirectly = async (
 toEmail: string,
 subject: string,
 bodyText: string,
 row: SheetRowRecord,
 milestoneStatus: string
 ) => {
 if (!toEmail) {
 setError('Cannot send email: Client has no email address.');
 return;
 }
 setIsSendingEmail(true);
 setEmailSendResult(null);
 try {
 if (!config.spreadsheetId) {
 throw new Error('Google spreadsheet is not connected.');
 }

 let token = getCachedAccessToken();
 if (!token) {
 try {
 await withGoogleToken(async (activeToken) => {
 token = activeToken;
 });
 } catch (_) {}
 }

 if (token) {
 // Build raw RFC2822 email format
 const rfc2822Lines = [
 `To: ${toEmail}`,
 'Content-Type: text/html; charset=utf-8',
 'MIME-Version: 1.0',
 `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
 '',
 bodyText.replace(/\n/g, '<br />')
 ];
 
 const rawMessage = rfc2822Lines.join('\r\n');
 const encodedRaw = btoa(unescape(encodeURIComponent(rawMessage)))
 .replace(/\+/g, '-')
 .replace(/\//g, '_')
 .replace(/=+$/, '');

 // 1. Send via Gmail API
 const gmailResponse = await fetch('https://gmail.googleapis.com/v1/users/me/messages/send', {
 method: 'POST',
 headers: {
 'Authorization': `Bearer ${token}`,
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({ raw: encodedRaw })
 });

 if (!gmailResponse.ok) {
 const errData = await gmailResponse.json().catch(() => ({}));
 console.warn('Gmail API response error:', errData);
 }
 } else {
 // Open native mailto client
 window.open(`mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`);
 }

 // 2. Optimistically update local rows
 setRows((prev) =>
 prev.map((r) => ((r.rowIndex === row.rowIndex && (!r.tabName || r.tabName === row.tabName)) ? { ...r, status: milestoneStatus } : r))
 );
 setAllSourcesRows((prev) =>
 prev.map((r) => ((r.rowIndex === row.rowIndex && (!r.tabName || r.tabName === row.tabName)) ? { ...r, status: milestoneStatus } : r))
 );
 setCsSelectedLead((prev) => prev && prev.rowIndex === row.rowIndex ? { ...prev, status: milestoneStatus } : prev);

 const leadKey = row.clientPhone || row.clientEmail || row.clientName || `row_${row.rowIndex}`;
 addLeadActivity(leadKey, {
 leadKey,
 type: 'email',
 message: `Direct Email Sent to ${toEmail}:"${subject}"(${milestoneStatus})`,
 });

 // 3. Update the Status column in Google Sheets via backend Service Account
 try {
 const targetTabName = (row.tabName && row.tabName !== 'ALL') ? row.tabName : (selectedTab !== 'ALL' ? selectedTab : 'Angi');
 const colIndex = row.statusColIndex !== undefined ? row.statusColIndex : (headers.indexOf('Status') >= 0 ? headers.indexOf('Status') : 7);
 if (config.spreadsheetId) {
    const targetTabName = (row.tabName && row.tabName !== 'ALL') ? row.tabName : (selectedTab !== 'ALL' ? selectedTab : 'Angi');
    const colIndex = row.statusColIndex !== undefined ? row.statusColIndex : 7;
    updateRowStatusInSheet(undefined, config.spreadsheetId, targetTabName, row.rowIndex, milestoneStatus, colIndex, row.clientName)
      .catch(err => console.error('Background sheet sync error:', err));
  }setEmailSendResult({ success: true, msg: 'Email sent & status updated in Sheets' });
 await fetchRows(config.spreadsheetId, selectedTab);
 } catch (sheetErr: any) {
 console.warn('Email sent successfully, but Sheets status update failed:', sheetErr);
 setEmailSendResult({ success: true, msg: 'Email sent successfully. (Sheets status column update timed out; status saved locally).' });
 }
 setTimeout(() => setEmailSendResult(null), 5000);
 } catch (err: any) {
 console.error('Error in direct email send:', err);
 setEmailSendResult({ success: false, msg: `Failed: ${err.message || 'Unknown network error.'}` });
 } finally {
 setIsSendingEmail(false);
 }
 };

 const handleScheduleFromRow = (row: SheetRowRecord) => {
 const todayStr = new Date().toISOString().split('T')[0];
 const appointmentData: AppointmentFormData = {
 clientName: row.clientName || '',
 appointmentDate: row.appointmentDate || todayStr,
 startTime: row.startTime || '09:00',
 endTime: row.endTime || '11:00',
 salespersonCode: '',
 clientPhone: row.clientPhone || '',
 clientEmail: row.clientEmail || '',
 address: row.address || '',
 leadSource: row.leadSource || selectedTab || config.leadSources[0] || 'Angi',
 leadType: row.leadType || config.leadTypes[0] || 'Direct',
 notes: row.notes || '',
 };
 sessionStorage.setItem('prefill_schedule_lead', JSON.stringify(appointmentData));
 navigate('/');
 setTimeout(() => {
 window.dispatchEvent(new CustomEvent('open_schedule_modal', { detail: appointmentData }));
 }, 100);
 };

 const handleSendToHouzzFromRow = async (row: SheetRowRecord) => {
 if (isLeadInHouzzPro(row) || houzzSyncedKeys.has(getLeadUniqueKey(row))) {
 setError(`"${row.clientName || 'Lead'}"has already been added to Houzz Pro.`);
 return;
 }

 setSendingHouzzKey(row.rowIndex);
 try {
 await sendLeadToHouzzPro(config.houzzWebhookUrl, {
 clientName: row.clientName || '',
 clientPhone: row.clientPhone || '',
 clientEmail: row.clientEmail || '',
 address: row.address || '',
 serviceNeeded: row.leadType || (row as any).serviceNeeded || '',
 leadSource: row.leadSource || selectedTab || 'Spreadsheet',
 notes: row.notes || '',
 });
 setHouzzSyncedKeys(getHouzzSyncedLeadKeys());
 setSuccessMsg('Added to Houzz Pro');
 setTimeout(() => setSuccessMsg(null), 3500);
 } catch (err: any) {
 setError(`Houzz Pro error: ${err.message}`);
 } finally {
 setSendingHouzzKey(null);
 }
 };

 // Helper to determine if a record is a genuine valid lead (excluding headers, totals, non-lead text, unnamed clients)
 const isValidLeadRecord = (r: SheetRowRecord) => {
 if (!r.clientName) return false;
 if (r.tabName && !isLeadSourceTab(r.tabName)) return false;
 if (r.leadSource && !isLeadSourceTab(r.leadSource)) return false;
 const name = r.clientName.trim().toLowerCase();
 if (!name) return false;
 if (name === 'unnamed' || name === 'unnamed client' || name === 'unnamed clien' || name.startsWith('unnamed')) return false;

 // Exclude header or summary labels
 const invalidNames = [
 'client name', 'date', 'phone number', 'phone', 'email', 'address',
 'service needed', 'status', 'lead source', 'lead fee', 'carrier',
 'notes', 'total', 'summary', 'date lead generated', 'category', 'lead type',
 'salesperson', 'rep', 'amount', 'price', '-', '—'
 ];
 if (invalidNames.includes(name)) return false;

 // Exclude pure dates or timestamps
 if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(name) || /^\d{4}-\d{2}-\d{2}$/.test(name)) return false;

 // Exclude status-only or category values
 const nonLeadTerms = ['new', 'estimate sent', 'estimate scheduled', 'scheduled', 'won', 'lost', 'hot', 'warm', 'cold', 'pending', 'follow up', 'completed', 'active'];
 if (nonLeadTerms.includes(name)) return false;

 const hasValidName = name.length >= 2;
 const hasPhone = Boolean(r.clientPhone && r.clientPhone.trim().length > 3);
 const hasEmail = Boolean(r.clientEmail && r.clientEmail.includes('@'));

 return hasValidName || hasPhone || hasEmail;
 };

 // Helper to accurately resolve lead source from record, tab, or config sources
 const resolveLeadSource = (lead: SheetRowRecord | null | undefined, fallbackTab?: string): string => {
 const sources = (config.leadSources && config.leadSources.length > 0 ? config.leadSources : [
 'Angi', 'Thumbtack', 'Referral', 'Big Fish', 'Houzz Pro', 'Roof R', 'Home Launch', 'Website', 'Yard Sign', 'Other'
 ]).filter(isLeadSourceTab);

 const isNonSource = (val: string) => {
 if (!val) return true;
 if (!isLeadSourceTab(val)) return true;
 const v = val.trim().toLowerCase();
 return (
 !v ||
 v === 'hot' ||
 v === 'warm' ||
 v === 'cold' ||
 v === 'new' ||
 v === 'estimate' ||
 v === 'estimate sent' ||
 v === 'estimate scheduled' ||
 v === 'urgent' ||
 v === 'high' ||
 v === 'medium' ||
 v === 'low' ||
 v === 'active' ||
 v === 'pending' ||
 v === 'follow up' ||
 v === 'general' ||
 v === 'spreadsheet' ||
 v === 'sheet1' ||
 v === 'appointments' ||
 v === 'leads' ||
 v === 'category' ||
 v === 'lead category' ||
 v === 'status' ||
 v === 'n/a' ||
 v === 'none' ||
 v === '-' ||
 v === '—'
 );
 };

 const matchKnownSource = (str: string): string | null => {
 if (!str || isNonSource(str)) return null;
 const trimmed = str.trim();
 const low = trimmed.toLowerCase();

 // Check exact matches against configured sources
 const exact = sources.find(s => s.toLowerCase() === low);
 if (exact) return exact;

 // Check known brand keywords
 if (low.includes('angi') || low.includes('homeadvisor') || low.includes('angie')) return 'Angi';
 if (low.includes('thumbtack') || low === 'tt') return 'Thumbtack';
 if (low.includes('houzz')) return 'Houzz Pro';
 if (low.includes('roof r') || low.includes('roofr') || low.includes('roof-r')) return 'Roof R';
 if (low.includes('referral') || low.includes('word of mouth')) return 'Referral';
 if (low.includes('big fish') || low.includes('bigfish')) return 'Big Fish';
 if (low.includes('home launch') || low.includes('homelaunch')) return 'Home Launch';
 if (low.includes('website') || low.includes('web app') || low.includes('web form') || low === 'web') return 'Website';
 if (low.includes('yard sign') || low.includes('yard')) return 'Yard Sign';
 if (low.includes('google')) return 'Google';
 if (low.includes('facebook') || low.includes('meta') || low.includes('instagram')) return 'Facebook';

 // Check partial match against configured sources
 const sub = sources.find(s => low.includes(s.toLowerCase()) || s.toLowerCase().includes(low));
 if (sub) return sub;

 return trimmed;
 };

 // 1. Check tab name first if the current tab is a valid source tab (e.g. Angi, Thumbtack, Houzz Pro, Roof R, etc.)
 const tab = (fallbackTab || selectedTab || '').trim();
 const matchedTab = matchKnownSource(tab);
 if (matchedTab && !['general', 'spreadsheet', 'sheet1', 'appointments', 'leads'].includes(tab.toLowerCase())) {
 // If the row also has a specific known source that differs from tab, check if it's explicitly a known source
 if (lead?.leadSource && !isNonSource(lead.leadSource)) {
 const matchedLeadSource = matchKnownSource(lead.leadSource);
 if (matchedLeadSource) return matchedLeadSource;
 }
 return matchedTab;
 }

 // 2. Check leadSource property on record (excluding invalid terms like 'Hot', 'Warm', etc.)
 if (lead?.leadSource && !isNonSource(lead.leadSource)) {
 const matched = matchKnownSource(lead.leadSource);
 if (matched) return matched;
 }

 // 3. Inspect rawValues cells for any known source brand
 if (lead?.rawValues && Array.isArray(lead.rawValues)) {
 for (const cell of lead.rawValues) {
 if (!cell || typeof cell !== 'string') continue;
 const matchedCell = matchKnownSource(cell);
 if (matchedCell) return matchedCell;
 }
 }

 // 4. Check notes or service for source mentions
 if (lead?.notes) {
 const matchedNote = matchKnownSource(lead.notes);
 if (matchedNote) return matchedNote;
 }

 // 5. Fallback to matched tab or first source in config
 if (matchedTab) return matchedTab;
 return sources[0] || 'Angi';
 };

 // Helper to resolve service description
 const resolveLeadService = (lead: SheetRowRecord | null | undefined): string => {
 if (!lead) return 'Standard Service';
 const svc = lead.leadType || (lead as any).serviceNeeded || (lead.rawValues && lead.rawValues[5]) || '';
 if (svc && svc.trim() && svc.trim() !== '—' && svc.trim() !== '-' && svc.trim() !== 'General') {
 return svc.trim();
 }
 return 'Standard Service';
 };

 // Valid leads excluding unnamed client records and strictly filtered by selected source when not ALL
 const sourcePool = (selectedTab !== 'ALL' && allSourcesRows.length > 0) ? allSourcesRows : rows;
 const validLeads = sourcePool.filter(isValidLeadRecord).filter((r) => {
 if (selectedTab === 'ALL') return true;
 const resolved = resolveLeadSource(r, r.tabName || selectedTab);
 return resolved.toLowerCase() === selectedTab.toLowerCase() || (r.tabName && r.tabName.toLowerCase() === selectedTab.toLowerCase());
 });

 // Helper matching predicates for pipeline stages (ensures 100% consistency between counts and tab filtering)
 const isLeadNew = (r: SheetRowRecord) => isNewStatus(r.status);
 const isLeadOverdue = (r: SheetRowRecord) => checkFollowUpOverdue(r.status || '', r.timestamp).isOverdue;
 const isLeadMeeting = (r: SheetRowRecord) => isMeetingScheduledStatus(r.status, r.leadSource || r.tabName);
 const isLeadFollowUp = (r: SheetRowRecord) => {
 const s = (r.status || '').toLowerCase().trim();
 if (s === 'followed up') return false;
 return s.includes('follow') || s.includes('estimating') || s.includes('estimate sent');
 };
 const isLeadWon = (r: SheetRowRecord) => {
 const s = (r.status || '').toLowerCase();
 return s.includes('won');
 };
 const isLeadLost = (r: SheetRowRecord) => {
 const s = (r.status || '').toLowerCase();
 return s.includes('lost') || s.includes('bad lead') || s.includes('duplicate') || s.includes('cancel');
 };

 // Pipeline Tab Quick Counts
 const countAll = validLeads.length;
 const countNew = validLeads.filter(isLeadNew).length;
 const countOverdue = validLeads.filter(isLeadOverdue).length;
 const countMeetings = validLeads.filter(isLeadMeeting).length;
 const countFollowUps = validLeads.filter(isLeadFollowUp).length;
 const countWon = validLeads.filter(isLeadWon).length;
 const countLost = validLeads.filter(isLeadLost).length;

 const filteredRows = validLeads.filter((r) => {
    

 // Status Filter Dropdown
 const matchesStatus = (() => {
 if (statusFilter === 'ALL') return true;
 if (!r.status) return false;
 
 const s = r.status.trim().toLowerCase();
 const f = statusFilter.trim().toLowerCase();
 
 if (f === 'new') {
 return s === 'new' || s === 'new lead';
 }
 if (f === 'meeting scheduled' || f === 'scheduled') {
 return isMeetingScheduledStatus(r.status, r.leadSource || r.tabName);
 }
 if (f === 'estimate sent') {
 return s.includes('estimate sent');
 }
 if (f === 'followed up') {
 return s === 'followed up' || s === 'followed-up';
 }
 if (f.includes('nonrefundable') || f.includes('non-refundable') || (f.includes('lost') && f.includes('non'))) {
 return s.includes('nonrefundable') || s.includes('non-refundable') || (s.includes('lost') && s.includes('non'));
 }
 if (f === 'lost job (for refund)' || (f.includes('refund') && !f.includes('non'))) {
 return (s.includes('refund') && !s.includes('non')) || s === 'lost job (for refund)';
 }
 if (f === 'won' || f === 'won job') {
 return s.includes('won');
 }
 if (f.includes('3 day')) {
 return s.includes('3 day');
 }
 if (f.includes('7 day')) {
 return s.includes('7 day');
 }
 if (f.includes('15 day')) {
 return s.includes('15 day');
 }
 if (f.includes('30 day')) {
 return s.includes('30 day');
 }
 if (f.includes('90')) {
 return s.includes('90');
 }
 
 // Default strict match for other statuses
 return s.replace(/\s+/g, ' ') === f.replace(/\s+/g, ' ');
 })();

 // Quick Pipeline Tab Filter
 let matchesQuickTab = true;
 if (quickTab === 'NEW') matchesQuickTab = isLeadNew(r);
 else if (quickTab === 'OVERDUE') matchesQuickTab = isLeadOverdue(r);
 else if (quickTab === 'MEETINGS') matchesQuickTab = isLeadMeeting(r);
 else if (quickTab === 'FOLLOW_UPS') matchesQuickTab = isLeadFollowUp(r);

 return matchesStatus && matchesQuickTab;
 }).sort((a, b) => {
 if (sortBy === 'NAME') {
 return (a.clientName || '').localeCompare(b.clientName || '');
 }
 if (sortBy === 'PRIORITY') {
 const aOverdue = checkFollowUpOverdue(a.status || '', a.timestamp).isOverdue ? 1 : 0;
 const bOverdue = checkFollowUpOverdue(b.status || '', b.timestamp).isOverdue ? 1 : 0;
 if (aOverdue !== bOverdue) return bOverdue - aOverdue;
 }
 const aTime = new Date(a.timestamp || a.appointmentDate || 0).getTime();
 const bTime = new Date(b.timestamp || b.appointmentDate || 0).getTime();
 if (sortBy === 'OLDEST') {
 if (!isNaN(aTime) && !isNaN(bTime) && aTime !== bTime && aTime > 0 && bTime > 0) {
 return aTime - bTime;
 }
 return (a.rowIndex || 0) - (b.rowIndex || 0);
 }
 // NEWEST default:
 // If dates are valid and different, newer date goes first
 if (!isNaN(aTime) && !isNaN(bTime) && bTime !== aTime && bTime > 0 && aTime > 0) {
 return bTime - aTime;
 }
 // In spreadsheets, newly generated leads are appended at the bottom (higher row index),
 // so higher rowIndex means a newer lead, putting it at the very top of the list!
 return (b.rowIndex || 0) - (a.rowIndex || 0);
 });

 // Calculate Metrics
 const totalLeads = validLeads.length;
 const wonJobs = validLeads.filter(r => r.status?.toLowerCase().includes('won')).length;
 const lostJobs = validLeads.filter(r => r.status?.toLowerCase().includes('lost')).length;
 const activeFollowUps = validLeads.filter(r => r.status?.toLowerCase().includes('follow up')).length;
 const newLeads = validLeads.filter(r => isNewStatus(r.status)).length;
 const conversionRate = (wonJobs + lostJobs) > 0 ? Math.round((wonJobs / (wonJobs + lostJobs)) * 100) : 0;


 const spreadsheetUrl = config.spreadsheetId
 ? `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`
 : null;

 return (
 <div className="flex-1 relative pb-16 bg-white dark:bg-black">
 



 {/* Main Content */}
 <main className={`pt-5 space-y-4 transition-all bg-white dark:bg-black ${viewMode === 'table' ? 'w-full max-w-none px-4 sm:px-6 md:px-8' : 'max-w-6xl mx-auto px-4 sm:px-6'}`}>


        {/* Error Alert */}
        {error && (
          <div className={`p-4 rounded-xl flex items-start justify-between shadow-xs animate-in fade-in ${
            error.includes('Google Service Account credentials not found') || error.includes('credentials')
              ? 'bg-orange-50 dark:bg-orange-950/80 border border-orange-200 dark:border-orange-700/80 text-orange-900 dark:text-orange-200'
              : 'bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
          } text-xs font-semibold`}>
            <div className="flex items-start gap-2.5">
              <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${
                error.includes('Google Service Account credentials not found') || error.includes('credentials')
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-red-600 dark:text-red-400'
              }`} />
              <div className="space-y-2">
                <div>
                  <p className="font-bold text-sm text-zinc-900 dark:text-white">
                    Spreadsheet connection unavailable
                  </p>
                  <p className="mt-0.5 text-zinc-700 dark:text-zinc-300 leading-relaxed text-xs">
                    Could not connect to the Google Spreadsheet. Cached data will be displayed if available. Detailed setup and credentials can be configured in Settings.
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                  <button
                    onClick={() => {
                      setLoading(true);
                      fetchRows('env', selectedTab);
                    }}
                    className="text-xs bg-zinc-900 dark:bg-zinc-800 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-bold px-3 py-1.5 rounded-lg border border-zinc-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-brand-orange"/>
                    <span>Retry</span>
                  </button>
                  <button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('open_settings', { detail: { tab: 'integrations', subTab: 'connections' } }));
                    }}
                    className="text-xs bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-bold px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>Settings &amp; Troubleshooting</span>
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-zinc-500 hover:text-zinc-800 dark:hover:text-white font-bold cursor-pointer ml-3 shrink-0 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

 {/* If no rows loaded yet */}
 {!rows.length && !loading && !error && (
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center space-y-4 max-w-xl mx-auto my-12 shadow-xl">
 <div className="w-16 h-16 rounded-2xl bg-brand-orange/20 border border-brand-orange/40 flex items-center justify-center mx-auto text-brand-orange shadow-lg">
 <FileSpreadsheet className="w-8 h-8"/>
 </div>
 <div className="space-y-1.5">
          <h2 className="text-lg font-black text-zinc-900 dark:text-white">No Leads in Tab</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">There are currently no rows in the selected sheet tab.</p>
        </div>
      </div>
      )}

 {/* Client Data View: Compact (Name & Status) or Full Table */}
 <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
 {loading ? (
 <SkeletonTable />
 ) : rows.length === 0 ? (
 <div className="p-12 text-center text-zinc-500 text-xs font-medium">
 No leads found in"{selectedTab === 'ALL' ? 'All Sources' : selectedTab}"
 </div>
 ) : filteredRows.length === 0 ? (
 <div className="p-8 text-center text-zinc-400 text-xs">
 No records match
 </div>
) : viewMode === 'kanban' ? (
              <div className="p-6 overflow-x-auto h-[calc(100vh-200px)] flex flex-col bg-zinc-50 dark:bg-zinc-950">
                <div className="flex gap-4 min-w-max pb-4 h-full">
                  {LEAD_STATUS_OPTIONS.map(status => {
                    const colRows = filteredRows.filter(r => (r.status || 'New') === status);
                    if (colRows.length === 0) return null;
                    return (
                      <div key={status} className="w-84 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col h-full shadow-lg">
                        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-900 rounded-t-2xl z-10 shrink-0">
                          <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">{status}</h3>
                          <span className="text-xs font-black text-white bg-[#FF5500] px-2 py-0.5 rounded-full">{colRows.length}</span>
                        </div>
                        <div className="p-3 flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-zinc-800">
                          {colRows.map((r, rIdx) => {
                            const isOverdue = isFollowUpOverdue(r.status || '', r.timestamp);
                            const cardKey = `${r.tabName || selectedTab || 'lead'}_${r.rowIndex !== undefined ? r.rowIndex : rIdx}_${rIdx}`;
                            return (
                              <div
                                key={cardKey}
                                onClick={() => setSelectedLead(r)}
                                className={`bg-zinc-50 dark:bg-zinc-900 border ${isOverdue ? 'border-brand-orange/50' : 'border-zinc-200 dark:border-zinc-700/50'} rounded-xl p-4 shadow-sm hover:border-brand-orange/50 transition-colors cursor-pointer group relative`}
                              >
                                
                                <h4 className="font-bold text-zinc-900 dark:text-white mb-1">{r.clientName || 'Unnamed Client'}</h4>
                                <div className="text-xs text-zinc-400 space-y-1">
                                  {r.clientPhone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{formatPhoneNumber(r.clientPhone)}</div>}
                                  <div className="flex items-center gap-1.5"><Tag className="w-3 h-3 text-brand-orange" />{resolveLeadSource(r, r.tabName || selectedTab)}{r.leadType ? ` • ${r.leadType}` : ''}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : viewMode === 'compact' ? (
 /* CLEAN VIEW: NAME | STATUS (with live spreadsheet sync) |"SCHEDULE"*/
 <div>

 <div className="divide-y divide-zinc-200 dark:divide-zinc-800/60">
 {filteredRows.map((r, idx) => {
 const tabStr = r.tabName || selectedTab || 'sheet';
 const rowKey = `${tabStr}_${r.rowIndex !== undefined ? r.rowIndex : idx}_${idx}`;
 const { selectedStatus, allOptions } = getStatusOptionsForRecord(r.status);
 const statusStyle = getStatusStyle(selectedStatus);
 const isUpdating = updatingRowKey === r.rowIndex || updatingRowKey === rowKey;

 return (
 <div
 key={rowKey}
 onClick={() => setSelectedLead(r)}
 className="p-2.5 sm:p-4 flex items-center justify-between gap-2 sm:gap-3 transition-colors cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
 >
 {/* NAME & AGING / OVERDUE BADGES */}
 <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
 <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#FF5500]/10 border border-[#FF5500]/20 flex items-center justify-center shrink-0 text-[#FF5500]">
 <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FF5500]"/>
 </div>
 <div className="min-w-0 flex-1">
 <h3 className="font-bold text-zinc-900 dark:text-white text-xs sm:text-base truncate">
 {r.clientName || 'Unnamed Client'}
 </h3>
 {/* Lead Aging & Overdue Indicators (Features 1 & 6) */}
 <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap mt-0.5">
 <span className="px-1.5 py-0.5 rounded text-xs font-bold tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80">
 {resolveLeadSource(r, r.tabName || selectedTab)}
 </span>
                    </div>
                  </div>
                </div>

                {/* STATUS & ACTION */}
 <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
 {/* Status Selector Dropdown */}
 <div className="relative w-28 xs:w-36 sm:w-48"onClick={(e) => e.stopPropagation()}>
 <select
 value={selectedStatus}
 disabled={isUpdating}
 onClick={(e) => e.stopPropagation()}
 onChange={(e) => handleStatusChange(r, e.target.value)}
 className={`w-full py-1.5 sm:py-2 pl-2 sm:pl-3 pr-6 sm:pr-7 rounded-xl text-[11px] sm:text-xs font-black border transition-all cursor-pointer focus:outline-none appearance-none truncate bg-white dark:bg-black text-zinc-900 dark:text-white border-zinc-200 dark:border-zinc-800 ${
 isUpdating ? 'opacity-50 cursor-wait' : ''
 }`}
 >
 {allOptions.map((opt) => (
 <option
 key={opt}
 value={opt}
 className="bg-white dark:bg-black text-zinc-900 dark:text-white py-1 font-semibold"
 >
 {opt}
 </option>
 ))}
 </select>
 <div className="pointer-events-none absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-white/80">
 {isUpdating ? (
 <RefreshCw className="w-3 h-3 animate-spin text-brand-orange"/>
 ) : (
 <ChevronDown className="w-3 sm:w-3.5 h-3 sm:h-3.5"/>
 )}
 </div>
 </div>

 <button
 onClick={(e) => { e.stopPropagation(); handleDeleteRow(r); }}
 className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors inline-flex items-center cursor-pointer shrink-0"
 title="Delete Lead"
 >
 <Trash2 className="w-4 h-4"/>
 </button>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 ) : (
 /* TABLE VIEW: Date Lead Generated | Client Name | Phone Number | Email | Address | Service Needed | Status | Action */
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs border-collapse">
 <thead>
 <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 text-[11px] font-black uppercase tracking-wider text-zinc-600 dark:text-white">
 <th className="py-3 px-3.5">Source</th>
 <th className="py-3 px-3.5">Date Lead Generated</th>
 <th className="py-3 px-3.5">Client Name</th>
 <th className="py-3 px-3.5">Phone Number</th>
 <th className="py-3 px-3.5">Email</th>
 <th className="py-3 px-3.5">Address</th>
 <th className="py-3 px-3.5">Service Needed</th>
 <th className="py-3 px-3.5">Status</th>
 <th className="py-3 px-3.5 text-right">Action</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
 {filteredRows.map((r, idx) => {
 const tabStr = r.tabName || selectedTab || 'sheet';
 const rowKey = `${tabStr}_${r.rowIndex !== undefined ? r.rowIndex : idx}_${idx}`;
 const { selectedStatus, allOptions } = getStatusOptionsForRecord(r.status);
 const statusStyle = getStatusStyle(selectedStatus);
 const isUpdating = updatingRowKey === r.rowIndex || updatingRowKey === rowKey;

 return (
 <tr
 key={rowKey}
 className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
 >
 {/* Lead Source */}
 <td className="py-3 px-3.5 whitespace-nowrap text-zinc-300 text-xs">
 <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-[11px] font-bold">
 {resolveLeadSource(r, r.tabName || selectedTab)}
 </span>
 </td>

 {/* Date Lead Generated (Timestamp) */}
 <td className="py-3 px-3.5 whitespace-nowrap text-zinc-500 dark:text-zinc-400 font-sans text-[11px]">
 {r.timestamp || '—'}
 </td>

 {/* Client Name */}
 <td className="py-3 px-3.5 font-extrabold text-zinc-900 dark:text-zinc-100 text-xs whitespace-nowrap">
 {r.clientName || '—'}
 </td>

 {/* Phone Number */}
 <td className="py-3 px-3.5 text-zinc-700 dark:text-zinc-200 text-xs whitespace-nowrap">
 {r.clientPhone || '—'}
 </td>

 {/* Email */}
 <td className="py-3 px-3.5 text-zinc-700 dark:text-zinc-200 text-xs whitespace-nowrap">
 {r.clientEmail ? (
 <div className="flex items-center justify-between gap-2">
 <span>{r.clientEmail}</span>
 <a
 href={`mailto:${r.clientEmail}?subject=${encodeURIComponent(`Following up on your ${r.leadType || 'request'} - Mr Contract`)}&body=${encodeURIComponent(`Hi ${r.clientName ? r.clientName.split(' ')[0] : 'there'},\n\nJust checking in regarding the ${r.leadType || 'services'} you requested.\n\nLet me know if you have any questions!\n\nBest,\nMr Contract`)}`}
 className="p-1.5 bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 rounded-md transition-colors"
 title="Send follow-up email"
 >
 <svg xmlns="http://www.w3.org/2000/svg"width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><rect width="20"height="16"x="2"y="4"rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
 </a>
 </div>
 ) : (
 '—'
 )}
 </td>

 {/* Address */}
 <td className="py-3 px-3.5 max-w-[200px] truncate text-zinc-700 dark:text-zinc-300 text-xs"title={r.address}>
 {r.address ? (
 <div className="flex items-center justify-between gap-2">
 <span className="truncate">{r.address}</span>
 <a
 href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.address)}`}
 target="_blank"
 rel="noopener noreferrer"
 className="shrink-0 p-1.5 bg-brand-orange/10 hover:bg-brand-orange/20 text-brand-orange rounded-md transition-colors text-white"
 title="Get directions in Google Maps"
 >
 <svg xmlns="http://www.w3.org/2000/svg"width="14"height="14"viewBox="0 0 24 24"fill="none"stroke="currentColor"strokeWidth="2"strokeLinecap="round"strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9"x2="9"y1="3"y2="18"/><line x1="15"x2="15"y1="6"y2="21"/></svg>
 </a>
 </div>
 ) : (
 '—'
 )}
 </td>

 {/* Service Needed */}
 <td className="py-3 px-3.5 text-zinc-700 dark:text-zinc-200 text-xs">
 {r.leadType || '—'}
 </td>

 {/* Status Selector */}
 <td className="py-3 px-3.5">
 <div className="relative inline-block min-w-[130px]">
 <select
 value={selectedStatus}
 disabled={isUpdating}
 onChange={(e) => handleStatusChange(r, e.target.value)}
 className={`w-full py-1.5 pl-2.5 pr-6 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer focus:outline-none appearance-none truncate ${
 statusStyle.bg
 } ${statusStyle.text} ${statusStyle.border} ${
 isUpdating ? 'opacity-50 cursor-wait' : ''
 }`}
 >
 {allOptions.map((opt) => (
 <option key={opt} value={opt} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold">
 {opt}
 </option>
 ))}
 </select>
 <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-current opacity-80">
 {isUpdating ? (
 <RefreshCw className="w-2.5 h-2.5 animate-spin text-brand-orange"/>
 ) : (
 <ChevronDown className="w-3 h-3"/>
 )}
 </div>
 </div>
 </td>

 {/* Action Buttons */}
                  <td className="py-3 px-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
 onClick={() => handleDeleteRow(r)}
 className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors inline-flex items-center cursor-pointer"
 title="Delete Lead"
 >
 <Trash2 className="w-4 h-4"/>
 </button>
 </div>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 )}
 </div>
 </main>

 {/* MODAL: Log Manual Row */}
 {isAddModalOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
 <form
 onSubmit={handleAppendRow}
 className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
 >
 <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
 <div className="flex items-center space-x-2">
 <Plus className="w-5 h-5 text-brand-orange"/>
 <h2 className="text-base font-bold text-zinc-900 dark:text-white">Add Lead</h2>
 </div>
 <button
 type="button"
 onClick={() => setIsAddModalOpen(false)}
 className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
 >
 ✕
 </button>
 </div>

 <div className="p-6 overflow-y-auto space-y-4 text-xs">
 <div className="space-y-1">
 <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
 Client Name *
 </label>
 <input
 type="text"
 required
 placeholder="Enter full name"
 value={newRowData.clientName}
 onChange={(e) => setNewRowData({ ...newRowData, clientName: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-brand-orange/50"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1">
 <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
 Phone Number
 </label>
 <input
 type="tel"
 placeholder="(000) 000-0000"
 value={newRowData.clientPhone}
 onChange={(e) => setNewRowData({ ...newRowData, clientPhone: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-brand-orange/50"
 />
 </div>

 <div className="space-y-1">
 <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
 Email
 </label>
 <input
 type="email"
 placeholder="client@example.com"
 value={newRowData.clientEmail}
 onChange={(e) => setNewRowData({ ...newRowData, clientEmail: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-brand-orange/50"
 />
 </div>
 </div>

 <div className="space-y-1">
 <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
 Address
 </label>
 <input
 type="text"
 placeholder="Full street address, city, state"
 value={newRowData.address}
 onChange={(e) => setNewRowData({ ...newRowData, address: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-brand-orange/50"
 />
 </div>

 <div className="space-y-1">
 <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
 Service Needed
 </label>
 <input
 type="text"
 placeholder="e.g. Chimney Repair, Brick Flatwork"
 value={newRowData.serviceNeeded}
 onChange={(e) => setNewRowData({ ...newRowData, serviceNeeded: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-brand-orange/50"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1">
 <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
 Status
 </label>
 <select
 value={newRowData.status}
 onChange={(e) => setNewRowData({ ...newRowData, status: e.target.value })}
 className="w-full px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-300 dark:border-zinc-700 rounded-xl font-bold text-xs focus:outline-none focus:border-brand-orange/50 cursor-pointer"
 >
 {LEAD_STATUS_OPTIONS.map((opt) => (
 <option key={opt} value={opt} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
 {opt}
 </option>
 ))}
 </select>
 </div>

 <div className="space-y-1">
 <label className="block font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider text-[11px]">
 Lead Source
 </label>
 <select
 value={newRowData.leadSource}
 onChange={(e) => setNewRowData({ ...newRowData, leadSource: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-brand-orange/50 cursor-pointer"
 >
 {(config.leadSources || standardTabs).filter(isLeadSourceTab).map((s) => (
 <option key={s} value={s} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
 {s}
 </option>
 ))}
 </select>
 </div>
 </div>
 </div>

 <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end space-x-3">
 <button
 type="button"
 onClick={() => setIsAddModalOpen(false)}
 className="px-4 py-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white font-bold rounded-xl transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isAppending}
 className="px-5 py-2 bg-[#FF5500] hover:bg-[#E64D00] disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
 >
 {isAppending ? (
 <>
 <RefreshCw className="w-3.5 h-3.5 animate-spin"/>
 <span>Adding Lead...</span>
 </>
 ) : (
 <>
 <CheckCircle className="w-3.5 h-3.5"/>
 <span>Confirm</span>
 </>
 )}
 </button>
 </div>
 </form>
 </div>
 )}

 <Toast 
 message={successMsg || ''} 
 isVisible={!!successMsg} 
 onClose={() => setSuccessMsg(null)} 
 />

 <LeadDrawer 
 lead={selectedLead} 
 isOpen={!!selectedLead} 
 onClose={() => setSelectedLead(null)} 
 onStatusChange={handleStatusChange}
 statusOptions={LEAD_STATUS_OPTIONS}
 salespeople={config.salespeople}
 calendarEvents={calendarEvents}
 />

 {/* CS Estimate Call & Message Center Modal */}
 {isCSModalOpen && (
 <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
 {/* Modal Header */}
 <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-[#FF5500] flex items-center justify-center text-white shadow-md">
 <Clock className="w-5 h-5"/>
 </div>
 <div>
 <h2 className="text-base font-bold text-black dark:text-white">Customer service</h2>
 <p className="text-xs text-zinc-400">Client follow-up messages & email scripts</p>
 </div>
 </div>
 <div className="flex items-center gap-2">
 <button
 onClick={() => {
 setIsCSModalOpen(false);
 setViewMode('table');
 }}
 className="px-3.5 py-1.5 bg-[#FF5500] hover:bg-[#E64D00] text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
 title="Close CS Center and View leads Table"
 >
 <TableIcon className="w-3.5 h-3.5"/>
 <span>View leads</span>
 </button>
 <button
 onClick={() => setIsCSModalOpen(false)}
 className="w-8 h-8 rounded-full bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300 flex items-center justify-center font-bold transition-colors cursor-pointer"
 >
 ✕
 </button>
 </div>
 </div>

 {/* Modal Body */}
 <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-hidden">
 {/* Left Column: Leads List Across All Sources */}
 <div className="lg:col-span-5 border-r border-zinc-200 dark:border-zinc-800 overflow-y-auto p-4 space-y-3 bg-zinc-50 dark:bg-zinc-950/40">
 {(() => {
 const baseFollowUpsSource = (allSourcesRows.length > 0 ? allSourcesRows : rows).filter(isValidLeadRecord);
 const allFollowUps = baseFollowUpsSource.filter((r) => isFollowUpStatus(r.status));

 // Guaranteed 10 lead sources + any sheet tabs
 const csLeadSources = Array.from(
 new Set([...standardTabs, ...allDisplayTabs])
 ).filter(isLeadSourceTab);

 const activeFollowUps = allFollowUps.filter((lead) => {
 const leadSrc = resolveLeadSource(lead, lead.tabName || selectedTab);
 const matchesSource = csSourceFilter === 'ALL' || leadSrc.toLowerCase() === csSourceFilter.toLowerCase();
 
 const q = csSearchQuery.toLowerCase().trim();
 const matchesSearch = !q ||
 (lead.clientName && lead.clientName.toLowerCase().includes(q)) ||
 (lead.clientPhone && lead.clientPhone.toLowerCase().includes(q)) ||
 (lead.clientEmail && lead.clientEmail.toLowerCase().includes(q)) ||
 (lead.notes && lead.notes.toLowerCase().includes(q)) ||
 leadSrc.toLowerCase().includes(q);

 return matchesSource && matchesSearch;
 });

 return (
 <>
 <div className="flex items-center justify-between px-1">
 <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
 Follow-Ups ({activeFollowUps.length} of {allFollowUps.length})
 </div>
 <span className="text-[10px] text-zinc-500 font-medium">All Sources Included</span>
 </div>

 {/* Source Filter Dropdown & Search */}
 <div className="space-y-2 pt-0.5">
 <div className="flex items-center gap-2">
 <label className="text-[11px] font-bold text-zinc-400 shrink-0">Source:</label>
 <select
 value={csSourceFilter}
 onChange={(e) => setCsSourceFilter(e.target.value)}
 className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 hover:border-brand-orange rounded-xl text-xs font-bold text-zinc-900 dark:text-white focus:outline-none focus:border-brand-orange cursor-pointer shadow-xs transition-colors"
 >
 <option value="ALL">All Sources ({allFollowUps.length})</option>
 {csLeadSources.map((src) => {
 const count = allFollowUps.filter(
 (l) => resolveLeadSource(l, l.tabName || selectedTab).toLowerCase() === src.toLowerCase()
 ).length;
 return (
 <option key={src} value={src}>
 {src} ({count})
 </option>
 );
 })}
 </select>
 </div>

 <div className="relative">
 <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2"/>
 <input
 type="text"
 value={csSearchQuery}
 onChange={(e) => setCsSearchQuery(e.target.value)}
 placeholder="Search"
 className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-brand-orange"
 />
 {csSearchQuery && (
 <button
 onClick={() => setCsSearchQuery('')}
 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-bold"
 >
 ✕
 </button>
 )}
 </div>
 </div>

 {activeFollowUps.length === 0 ? (
 <div className="p-8 text-center text-zinc-500 text-xs bg-zinc-100/60 dark:bg-zinc-900/40 rounded-2xl border border-zinc-200 dark:border-zinc-800/80">
 {csSourceFilter !== 'ALL' || csSearchQuery
 ? 'No follow-up leads match your filter criteria.'
 : 'No active estimate follow-up leads found across any source tabs.'}
 </div>
 ) : (
 activeFollowUps.map((lead, idx) => {
 const isSelected = csSelectedLead?.rowIndex === lead.rowIndex && (!csSelectedLead.tabName || lead.tabName === csSelectedLead.tabName);
 const info = getEstimateFollowUpInfo(lead);
 const leadSrc = resolveLeadSource(lead, lead.tabName || selectedTab);
 const leadSvc = resolveLeadService(lead);

 // Check if exact milestone day
 const isExactMilestone = [3, 7, 15, 30, 90].includes(info.dayCount);

 return (
 <div
 key={`${lead.tabName || 'tab'}_${lead.rowIndex || idx}`}
 onClick={() => {
 setCsSelectedLead(lead);
 setCsSelectedScriptDay(info.targetScriptDay);
 }}
 className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
 isSelected
 ? 'bg-orange-500/10 border-orange-500/40 ring-1 ring-orange-500/40'
 : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700'
 }`}
 >
 <div className="flex items-center justify-between gap-2">
 <span className="font-bold text-black dark:text-white text-xs truncate">{lead.clientName || 'Unnamed Lead'}</span>
 <div className="flex items-center gap-1 shrink-0">
 <span
 className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
 isExactMilestone
 ? 'bg-[#FF5500] text-white border-[#FF5500] shadow-sm'
 : info.dayCount >= 3
 ? 'bg-brand-orange/15 text-orange-700 dark:text-orange-300 border-brand-orange/30'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 }`}
 >
 Day {info.dayCount}
 </span>
 </div>
 </div>

 {/* Day Status & Follow-Up Milestone Guidance */}
 <div className="flex items-center gap-1.5 flex-wrap">
 <span
 className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
 info.dayCount === 30
 ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-800'
 : info.dayCount >= 90
 ? 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-200 border-red-300 dark:border-red-800'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 }`}
 >
 {info.dayCount === 3
 ? 'Day 3: 3-Day Follow-Up Due'
 : info.dayCount === 7
 ? 'Day 7: 7-Day Follow-Up Due'
 : info.dayCount === 15
 ? 'Day 15: 15-Day Follow-Up Due'
 : info.dayCount === 30
 ? 'Day 30: 30-Day Follow-Up Due'
 : info.dayCount === 90
 ? 'Day 90: 90-Day Follow-Up Due'
 : info.dayCount === 1
 ? 'Estimate Sent Today (Day 1)'
 : info.dayCount === 2
 ? 'Day 2 after Estimate Sent'
 : `${info.stageBadgeText} • Target: ${info.followUpMilestone}`}
 </span>
 </div>

 {/* Lead Source and Service Badges */}
 <div className="flex items-center gap-1.5 flex-wrap">
 <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/80">
 Source: {leadSrc}
 </span>
 <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/30">
 Service: {leadSvc}
 </span>
 </div>

 <div className="flex items-center text-[11px] text-zinc-400 pt-0.5">
 {lead.clientPhone ? (
 <a
 href={`tel:${lead.clientPhone}`}
 onClick={(e) => {
 e.stopPropagation();
 setCsSelectedLead(lead);
 setCsSelectedScriptDay(info.targetScriptDay);
 }}
 className="flex items-center gap-1 text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline font-semibold"
 title="Click to Call"
 >
 <Phone className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400"/>
 <span>{lead.clientPhone}</span>
 </a>
 ) : (
 <span className="flex items-center gap-1 text-zinc-500">
 <Phone className="w-3 h-3 text-zinc-600"/>
 <span>No Phone</span>
 </span>
 )}
 </div>
 </div>
 );
 })
 )}
 </>
 );
 })()}
 </div>

 {/* Right Column: Messages & Outreach */}
 <div className="lg:col-span-7 overflow-y-auto p-5 space-y-4 bg-white dark:bg-zinc-900">
 {csSelectedLead ? (() => {
 const info = getEstimateFollowUpInfo(csSelectedLead);
 const activeScript = ESTIMATE_FOLLOW_UP_SCRIPTS[csSelectedScriptDay] || ESTIMATE_FOLLOW_UP_SCRIPTS[info.targetScriptDay] || ESTIMATE_FOLLOW_UP_SCRIPTS[3];
 const clientName = csSelectedLead.clientName || 'Valued Customer';
 const salespersonName = config.salespeople[0]?.name?.split('(')[0]?.trim() || 'Mr. Contract Customer Service';
 const leadSrc = resolveLeadSource(csSelectedLead, csSelectedLead.tabName || selectedTab);
 const leadSvc = resolveLeadService(csSelectedLead);
 
 const filledEmailSub = activeScript.emailSubject;
 const filledEmailBody = activeScript.emailBody
 .replace(/\[Customer Name\]/g, clientName)
 .replace(/\[Your Name\]/g, salespersonName);

 const filledSmsBody = activeScript.smsBody
 .replace(/\[Customer Name\]/g, clientName)
 .replace(/\[Your Name\]/g, salespersonName);

 return (
 <div className="space-y-4">
 {/* Selected Lead Banner */}
 <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-2.5">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
 <div>
 <div className="flex items-center gap-2">
 <span className="text-[10px] font-black uppercase text-brand-orange tracking-wider">Selected Client</span>
 <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-brand-orange/20 text-brand-orange border border-brand-orange/40">
 Day {info.dayCount} ({info.stageBadgeText})
 </span>
 </div>
 <h3 className="text-base font-black text-zinc-900 dark:text-white">{clientName}</h3>
 </div>
 
 {/* Visible Lead Source, Service Badges and Travel Button */}
 <div className="flex items-center gap-2 flex-wrap">
 <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl bg-brand-orange/15 border border-brand-orange/40 text-brand-orange">
 <span className="text-zinc-400 font-semibold">Source:</span>
 <strong className="text-zinc-900 dark:text-white font-black">{leadSrc}</strong>
 </span>
 <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl bg-orange-500/15 border border-orange-500/40 text-orange-700 dark:text-orange-300">
                  <strong className="text-zinc-900 dark:text-white font-black">{leadSvc}</strong>
                </span>
                <button
                  onClick={() => {}}
                  className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-orange-500/30 hover:border-orange-500/50 text-orange-700 dark:text-orange-300 hover:text-orange-800 dark:hover:text-orange-200 transition-all cursor-pointer shadow-xs"
                  title={`View ${clientName} in Leads Table`}
                >
                  <ArrowRight className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400"/>
                  <span>View lead</span>
                </button>
              </div>
            </div>
 <span className="text-zinc-400 font-semibold">Service:</span>
 {/* Contact details & Estimate Date tracking */}
 <div className="flex items-center flex-wrap gap-2.5 text-xs text-zinc-400 pt-2 border-t border-zinc-900">
 {csSelectedLead.clientPhone ? (
 <a
 href={`tel:${csSelectedLead.clientPhone}`}
 className="inline-flex items-center gap-1.5 text-orange-700 dark:text-orange-300 hover:text-orange-800 dark:hover:text-orange-200 font-bold bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 px-3 py-1 rounded-lg transition-all cursor-pointer shadow-xs"
 title="Click to Call"
 >
 <Phone className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400"/>
 <span>{csSelectedLead.clientPhone}</span>
 </a>
 ) : (
 <span className="text-zinc-500">No Phone</span>
 )}
 <span className="text-zinc-700">•</span>
 <span className="truncate text-zinc-300">{csSelectedLead.clientEmail || 'No email'}</span>
 <span className="text-zinc-700">•</span>
 <span className="text-xs text-zinc-400 font-semibold">
 Estimate Sent: <strong className="text-orange-700 dark:text-orange-300">{info.formattedSentDate}</strong>{info.hasKnownEstimateDate ? ` (${info.daysSinceSent} days ago)` : ''}
 </span>
 </div>
 </div>

 {/* Milestone Tabs */}
 <div>
 <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1.5 px-1 font-semibold">
 <span>Follow-up template</span>
 <span className="text-orange-700 dark:text-orange-300 font-bold">Recommended for Day {info.dayCount}: {info.followUpMilestone}</span>
 </div>
 <div className="grid grid-cols-5 gap-1.5">
 {[3, 7, 15, 30, 90].map((d) => {
 const isRecommended = info.targetScriptDay === d;
 const isSelected = csSelectedScriptDay === d;

 return (
 <button
 key={d}
 onClick={() => setCsSelectedScriptDay(d)}
 className={`py-2 px-1 rounded-xl text-xs font-black transition-all text-center cursor-pointer relative ${
 isSelected
 ? 'bg-[#FF5500] text-white ring-2 ring-[#FF5500]/50'
 : isRecommended
 ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/40 hover:bg-orange-500/25'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-700'
 }`}
 >
 <div>{d} Days</div>
 {isRecommended && (
 <div className="text-[11px] font-bold opacity-90 leading-tight">
 {info.dayCount === d ? '• DUE' : 'Target'}
 </div>
 )}
 </button>
 );
 })}
 </div>
 </div>

 {/* Email Message Card */}
 <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-black uppercase text-brand-orange flex items-center gap-1.5">
 <Mail className="w-3.5 h-3.5"/> Email Message ({activeScript.days} Days)
 </span>
 <button
 onClick={() => {
 navigator.clipboard.writeText(`Subject: ${filledEmailSub}\n\n${filledEmailBody}`);
 setCopiedType('email');
 setTimeout(() => setCopiedType(null), 2500);
 }}
 className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-[11px] rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
 >
 {copiedType === 'email' ? 'Copied Email!' : 'Copy Email'}
 </button>
 </div>
 <div className="space-y-1.5 text-xs">
 <div className="font-bold text-zinc-300">Subject: <span className="font-normal text-white">{filledEmailSub}</span></div>
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 whitespace-pre-wrap text-zinc-800 dark:text-zinc-300 font-sans text-[11.5px] max-h-40 overflow-y-auto leading-relaxed">
 {filledEmailBody}
 </div>
 </div>

 {/* Direct Send Result Messages */}
 {emailSendResult && (
 <div className={`p-3 rounded-xl text-xs font-bold border ${
 emailSendResult.success 
 ? 'bg-orange-50 dark:bg-orange-500/15 border-orange-200 dark:border-orange-500/30 text-orange-800 dark:text-orange-300' 
 : 'bg-red-500/10 border-red-500/30 text-red-400'
 }`}>
 {emailSendResult.msg}
 </div>
 )}

 {csSelectedLead.clientEmail && (
 <div className="flex flex-col sm:flex-row gap-2 pt-1">
 <button
 disabled={isSendingEmail}
 onClick={() => handleSendEmailDirectly(
 csSelectedLead.clientEmail!,
 filledEmailSub,
 filledEmailBody,
 csSelectedLead,
 activeScript.key
 )}
 className="flex-1 py-2.5 bg-[#FF5500] hover:bg-[#E64D00] disabled:bg-zinc-800 text-white font-black text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:cursor-not-allowed"
 >
 <Mail className={`w-4 h-4 ${isSendingEmail ? 'animate-spin' : ''}`} />
 <span>{isSendingEmail ? 'Sending…' : 'Send email'}</span>
 </button>
 
 <a
 href={`mailto:${csSelectedLead.clientEmail}?subject=${encodeURIComponent(filledEmailSub)}&body=${encodeURIComponent(filledEmailBody)}`}
 target="_blank"
 rel="noopener noreferrer"
 className="py-2.5 px-3 bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer border border-zinc-700 shrink-0"
 >
 <ExternalLink className="w-4 h-4"/>
 <span>Open in email app</span>
 </a>
 </div>
 )}
 </div>

 {/* SMS Text Message Card */}
 <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-black uppercase text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
 <Phone className="w-3.5 h-3.5"/> Text Message (SMS)
 </span>
 <button
 onClick={() => {
 navigator.clipboard.writeText(filledSmsBody);
 setCopiedType('sms');
 setTimeout(() => setCopiedType(null), 2500);
 }}
 className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold text-[11px] rounded-lg border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
 >
 {copiedType === 'sms' ? 'Copied Text!' : 'Copy Text'}
 </button>
 </div>
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 whitespace-pre-wrap text-zinc-800 dark:text-zinc-300 font-sans text-[11.5px] leading-relaxed">
 {filledSmsBody}
 </div>

 {csSelectedLead.clientPhone && (
 <div className="pt-1">
 <a
 href={`sms:${csSelectedLead.clientPhone}?body=${encodeURIComponent(filledSmsBody)}`}
 className="bg-[#FF5500] hover:bg-[#E64D00] text-white w-full py-3 text-white font-black text-sm rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
 >
 <Phone className="w-4 h-4"/>
 <span>Open SMS App</span>
 </a>
 </div>
 )}
 </div>
 </div>
 );
 })() : (
 <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500 space-y-2">
 <Clock className="w-10 h-10 text-brand-orange/40"/>
 <p className="text-sm font-bold text-zinc-400">Select a lead from the left to view messages.</p>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 )}

 {/* Delete Confirmation Modal */}
 {rowToDelete && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
 <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
 <Trash2 className="w-6 h-6"/>
 </div>
 <div>
 <h3 className="text-base font-black text-zinc-900 dark:text-white">Delete Lead</h3>
 <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
 Are you sure you want to delete lead <span className="font-bold text-zinc-800 dark:text-zinc-200">"{rowToDelete.clientName || 'Lead'}"</span> from Google Sheets and the app?
 </p>
 </div>
 <div className="flex items-center gap-2 pt-2">
 <button
 type="button"
 onClick={() => setRowToDelete(null)}
 className="flex-1 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={confirmDeleteRow}
 className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
 >
 Delete Lead
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
};
