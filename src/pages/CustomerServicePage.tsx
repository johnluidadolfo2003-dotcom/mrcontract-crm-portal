import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
 Clock,
 Phone,
 Mail,
 Search,
 RefreshCw,
 Copy,
 Check,
 Send,
 ExternalLink,
 CalendarClock,
 MessageSquare,
 AlertCircle,
 CheckCircle2,
 Calendar,
 Tag,
 ArrowRight,
 ShieldAlert,
 RotateCcw,
 Lock,
 LogIn,
 ChevronLeft,
 Trash2,
} from 'lucide-react';
import { ESTIMATE_FOLLOW_UP_SCRIPTS, FollowUpScript } from '../data/estimateScripts';
import { AppConfig, LEAD_STATUS_OPTIONS } from '../types';
import { getCachedAccessToken, withGoogleToken, isAuthError, clearCachedAccessToken, googleSignIn } from '../lib/firebase';
import {
 readAllSpreadsheetTabs,
 readSpreadsheetRows,
 getSpreadsheetDetails,
 updateRowStatusInSheet,
 updateCellInSheet,
 deleteRowFromSheet,
 extractSpreadsheetId,
 invalidateSpreadsheetCache,
 SheetRowRecord
} from '../lib/sheets';
import { formatPhoneNumber, getEstimateFollowUpInfo, getFollowUpTimingIndicator, addLeadActivity, getLeadActivities, LeadActivity, isFollowUpStatus } from '../lib/utils';
import { logAuditActivity } from '../lib/activityLogger';
import { loadAppConfig, isLeadSourceTab, DEFAULT_LEAD_SOURCES } from '../config';
import { getNewLeads } from '../lib/newLeads';

export const CustomerServicePage: React.FC = () => {
 const navigate = useNavigate();
 const [config] = useState<AppConfig>(loadAppConfig);
 const [loading, setLoading] = useState(false);
 const [refreshing, setRefreshing] = useState(false);
 const [isAuthRequired, setIsAuthRequired] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [successMsg, setSuccessMsg] = useState<string | null>(null);
 const [lastUpdated, setLastUpdated] = useState<number>(() => Date.now());
 const [refreshError, setRefreshError] = useState(false);

 // Leads state
 const [allFollowUps, setAllFollowUps] = useState<SheetRowRecord[]>([]);
 const [availableSources, setAvailableSources] = useState<string[]>(() => {
 return Array.from(
 new Set([...DEFAULT_LEAD_SOURCES, ...(loadAppConfig().leadSources || [])])
 ).filter(isLeadSourceTab);
 });
 const [selectedLead, setSelectedLead] = useState<SheetRowRecord | null>(null);
 const [selectedScriptDay, setSelectedScriptDay] = useState<number>(3);
 const [isSigningIn, setIsSigningIn] = useState(false);

 // Filters
 const [sourceFilter, setSourceFilter] = useState<string>('ALL');
 const [searchQuery, setSearchQuery] = useState<string>('');
 const [stageFilter, setStageFilter] = useState<string>('ALL');

 // Mobile View Switcher (between list and detail)
 const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

 // Direct Communication states
 const [isSendingEmail, setIsSendingEmail] = useState(false);
 const [emailSendResult, setEmailSendResult] = useState<{ success: boolean; msg: string } | null>(null);
 const [copiedField, setCopiedField] = useState<'email' | 'sms' | 'subject' | null>(null);
 const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingLead, setIsDeletingLead] = useState(false);

 // Activity timeline
 const [leadActivities, setLeadActivities] = useState<LeadActivity[]>([]);

 // Helper to validate lead record
 const isValidLead = (r: SheetRowRecord) => {
 if (!r.clientName) return false;
 const name = r.clientName.trim().toLowerCase();
 if (!name || name.startsWith('unnamed') || name === 'summary' || name === 'total') return false;
 if (r.tabName && !isLeadSourceTab(r.tabName)) return false;
 if (r.leadSource && !isLeadSourceTab(r.leadSource)) return false;
 return true;
 };

 const handleGoogleSignIn = async () => {
 setIsSigningIn(true);
 setError(null);
 try {
 await googleSignIn(true);
 setIsAuthRequired(false);
 setSuccessMsg('Google connected');
 setTimeout(() => setSuccessMsg(null), 3000);
 await fetchFollowUps();
 } catch (err: any) {
 console.error('Google Sign In error:', err);
 setError(err.message || 'Failed to authenticate with Google. Please allow popups.');
 } finally {
 setIsSigningIn(false);
 }
 };

 // Fetch follow-ups from Google Sheets and local fallback
 const fetchFollowUps = async (forceFresh = false) => {
 const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
 const allStandardSources = Array.from(
 new Set([...DEFAULT_LEAD_SOURCES, ...(config.leadSources || [])])
 ).filter(isLeadSourceTab);

 if (forceFresh && spreadsheetId) {
 invalidateSpreadsheetCache(spreadsheetId);
 }

 // Gather local fallback records if offline or awaiting response
 const localLeadsMap = new Map<string, SheetRowRecord>();
 try {
 for (let i = 0; i < localStorage.length; i++) {
 const key = localStorage.key(i);
 if (key && key.startsWith('mrcontract_cache_')) {
 const raw = localStorage.getItem(key);
 if (raw) {
 const data = JSON.parse(raw);
 if (data && Array.isArray(data.rows)) {
 data.rows.forEach((r: SheetRowRecord) => {
 if (r && r.clientName && !r.clientName.toLowerCase().startsWith('unnamed')) {
 if (isFollowUpStatus(r.status)) {
 const rKey = r.clientPhone || r.clientEmail || r.clientName || r.rowIndex;
 localLeadsMap.set(String(rKey), r);
 }
 }
 });
 }
 }
 }
 }
 } catch (e) {}

 const initialLocalRecords = Array.from(localLeadsMap.values());
 if (initialLocalRecords.length > 0 && allFollowUps.length === 0) {
 setAllFollowUps(initialLocalRecords);
 setSelectedLead((prev) => prev || initialLocalRecords[0]);
 }

 if (!spreadsheetId) {
 setAvailableSources(allStandardSources);
 return;
 }

 try {
 setLoading(true);
 setError(null);
 
 let validTabs: string[] = [];
 try {
 const details = await getSpreadsheetDetails(undefined, spreadsheetId, forceFresh);
 const sheetTabs = (details.sheets || []).map((s) => s.title);
 validTabs = sheetTabs.filter(isLeadSourceTab);
 } catch (e) {
 console.warn('Could not fetch sheet metadata:', e);
 }

 // Always include all 10 default lead sources + any tabs discovered in the sheet
 const mergedSources = Array.from(
 new Set([...DEFAULT_LEAD_SOURCES, ...validTabs, ...(config.leadSources || [])])
 ).filter(isLeadSourceTab);
 setAvailableSources(mergedSources);

 const tabsToFetch = validTabs.length > 0 ? validTabs : allStandardSources;
 const tabsResult = await readAllSpreadsheetTabs(undefined, spreadsheetId, tabsToFetch, forceFresh);

 // Filter all records from Google Sheets that currently have follow-up statuses
 const followUpRecords = tabsResult.rows.filter((r) => {
 if (!isValidLead(r)) return false;
 return isFollowUpStatus(r.status);
 });

 setAllFollowUps(followUpRecords);
 if (followUpRecords.length > 0) {
 setSelectedLead((prev) => {
 if (prev) {
 const matched = followUpRecords.find(
 (f) => f.rowIndex === prev.rowIndex && (!prev.tabName || f.tabName === prev.tabName)
 );
 if (matched) return matched;
 }
 return followUpRecords[0];
 });
 } else {
 setSelectedLead(null);
 }
 setIsAuthRequired(false);
 setLastUpdated(Date.now());
 setRefreshError(false);
 } catch (err: any) {
 console.warn('Failed to fetch from sheet:', err);
 setRefreshError(true);
 if (isAuthError(err)) {
 setIsAuthRequired(true);
 }
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 };

 useEffect(() => {
 fetchFollowUps();

 const handleSync = () => {
 fetchFollowUps();
 };
 window.addEventListener('mrcontract_data_synced', handleSync);
 window.addEventListener('storage', handleSync);
 return () => {
 window.removeEventListener('mrcontract_data_synced', handleSync);
 window.removeEventListener('storage', handleSync);
 };
 }, [config.spreadsheetId]);

 // Update script tab whenever selected lead changes
 useEffect(() => {
 if (selectedLead) {
 const info = getEstimateFollowUpInfo(selectedLead);
 setSelectedScriptDay(info.targetScriptDay);
 const leadKey = selectedLead.clientPhone || selectedLead.clientEmail || selectedLead.clientName || `row_${selectedLead.rowIndex}`;
 setLeadActivities(getLeadActivities(leadKey));
 }
 }, [selectedLead]);

 // Filtered Leads List
 const filteredLeads = allFollowUps.filter((lead) => {
 const leadSrc = lead.leadSource || lead.tabName || 'Angi';
 const matchesSource = sourceFilter === 'ALL' || leadSrc.toLowerCase() === sourceFilter.toLowerCase();

 const q = searchQuery.toLowerCase().trim();
 const matchesSearch =
 !q ||
 (lead.clientName && lead.clientName.toLowerCase().includes(q)) ||
 (lead.clientPhone && lead.clientPhone.toLowerCase().includes(q)) ||
 (lead.clientEmail && lead.clientEmail.toLowerCase().includes(q)) ||
 (lead.notes && lead.notes.toLowerCase().includes(q)) ||
 (lead.leadType && lead.leadType.toLowerCase().includes(q)) ||
 leadSrc.toLowerCase().includes(q);

 const info = getEstimateFollowUpInfo(lead);
 let matchesStage = true;
 if (stageFilter === 'DAY_3') matchesStage = info.targetScriptDay === 3;
 else if (stageFilter === 'DAY_7') matchesStage = info.targetScriptDay === 7;
 else if (stageFilter === 'DAY_15') matchesStage = info.targetScriptDay === 15;
 else if (stageFilter === 'DAY_30') matchesStage = info.targetScriptDay === 30;
 else if (stageFilter === 'DAY_90') matchesStage = info.targetScriptDay === 90;
 else if (stageFilter === 'DUE') matchesStage = [3, 7, 15, 30, 90].includes(info.dayCount);

 return matchesSource && matchesSearch && matchesStage;
 });

 // Action: Copy text to clipboard
 const handleCopy = (text: string, type: 'email' | 'sms' | 'subject') => {
 navigator.clipboard.writeText(text);
 setCopiedField(type);
 setTimeout(() => setCopiedField(null), 2500);
 };

 // Action: Send Email directly via Gmail API
 const handleSendEmailDirectly = async (
 toEmail: string,
 subject: string,
 bodyText: string,
 lead: SheetRowRecord,
 milestoneStatus: string
 ) => {
 if (!toEmail) {
 setError('Cannot send email: Lead has no email address.');
 return;
 }
 setIsSendingEmail(true);
 setEmailSendResult(null);

 try {
 await withGoogleToken(async (token: string) => {
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

 const gmailResponse = await fetch('https://gmail.googleapis.com/v1/users/me/messages/send', {
 method: 'POST',
 headers: {
 Authorization: `Bearer ${token}`,
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({ raw: encodedRaw })
 });

 if (!gmailResponse.ok) {
 const errData = await gmailResponse.json().catch(() => ({}));
 throw new Error(errData?.error?.message || `Gmail sending failed with code ${gmailResponse.status}`);
 }

 // Update local state
 setAllFollowUps((prev) =>
 prev.map((r) =>
 r.rowIndex === lead.rowIndex && (!r.tabName || r.tabName === lead.tabName)
 ? { ...r, status: milestoneStatus }
 : r
 )
 );
 if (selectedLead && selectedLead.rowIndex === lead.rowIndex) {
 setSelectedLead({ ...selectedLead, status: milestoneStatus });
 }

 // Log activity
 const leadKey = lead.clientPhone || lead.clientEmail || lead.clientName || `row_${lead.rowIndex}`;
 const updatedActs = addLeadActivity(leadKey, {
 leadKey,
 type: 'email',
 message: `Direct Email Sent to ${toEmail}:"${subject}"(${milestoneStatus})`
 });
 setLeadActivities(updatedActs);

 // Sync with Google Sheets if configured
 const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
 if (spreadsheetId) {
 const targetTabName = lead.tabName && lead.tabName !== 'ALL' ? lead.tabName : lead.leadSource || 'Angi';
 await updateRowStatusInSheet(token, spreadsheetId, targetTabName, lead.rowIndex, milestoneStatus, lead.statusColIndex, lead.clientName, lead.clientPhone);
 }
 });

 setEmailSendResult({ success: true, msg: 'Email sent' });
 setTimeout(() => setEmailSendResult(null), 5000);
 } catch (err: any) {
 console.error('Error in email sending:', err);
 setEmailSendResult({ success: false, msg: `Send failed: ${err.message || 'Unknown network error'}` });
 } finally {
 setIsSendingEmail(false);
 }
 };

 // Action: Update Status in Google Sheet
 const handleUpdateStatus = async (newStatus: string) => {
 if (!selectedLead) return;
 setUpdatingStatus(true);
 try {
 const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
 if (spreadsheetId) {
 const targetTabName = selectedLead.tabName && selectedLead.tabName !== 'ALL' ? selectedLead.tabName : selectedLead.leadSource || 'Angi';
 await updateRowStatusInSheet(undefined, spreadsheetId, targetTabName, selectedLead.rowIndex, newStatus, selectedLead.statusColIndex, selectedLead.clientName, selectedLead.clientPhone);
 }

 setAllFollowUps((prev) =>
 prev.map((r) =>
 r.rowIndex === selectedLead.rowIndex && (!r.tabName || r.tabName === selectedLead.tabName)
 ? { ...r, status: newStatus }
 : r
 )
 );
 setSelectedLead({ ...selectedLead, status: newStatus });

 const leadKey = selectedLead.clientPhone || selectedLead.clientEmail || selectedLead.clientName || `row_${selectedLead.rowIndex}`;
 const updatedActs = addLeadActivity(leadKey, {
 leadKey,
 type: 'status_change',
 message: `Status updated to"${newStatus}"`
 });
 setLeadActivities(updatedActs);

 logAuditActivity({
 actionType: 'status_change',
 clientName: selectedLead.clientName,
 clientPhone: selectedLead.clientPhone,
 tabName: selectedLead.tabName || selectedLead.leadSource,
 details: `Updated status of"${selectedLead.clientName || 'Lead'}"to"${newStatus}"`,
 oldValue: selectedLead.status,
 newValue: newStatus,
 });

 // Update local storage caches
 try {
 const targetTabName = selectedLead.tabName && selectedLead.tabName !== 'ALL' ? selectedLead.tabName : selectedLead.leadSource || 'Angi';
 const tabCacheKey = `mrcontract_cache_${spreadsheetId}_${targetTabName}`;
 const allCacheKey = `mrcontract_cache_${spreadsheetId}_ALL`;

 const tabCached = localStorage.getItem(tabCacheKey);
 if (tabCached) {
 const parsed = JSON.parse(tabCached);
 if (parsed && Array.isArray(parsed.rows)) {
 parsed.rows = parsed.rows.map((r: SheetRowRecord) =>
 r.rowIndex === selectedLead.rowIndex ? { ...r, status: newStatus } : r
 );
 localStorage.setItem(tabCacheKey, JSON.stringify(parsed));
 }
 }

 const allCached = localStorage.getItem(allCacheKey);
 if (allCached) {
 const parsed = JSON.parse(allCached);
 if (parsed && Array.isArray(parsed.rows)) {
 parsed.rows = parsed.rows.map((r: SheetRowRecord) =>
 r.rowIndex === selectedLead.rowIndex && (!r.tabName || !selectedLead.tabName || r.tabName === selectedLead.tabName) ? { ...r, status: newStatus } : r
 );
 localStorage.setItem(allCacheKey, JSON.stringify(parsed));
 }
 }
 } catch (e) {}

 window.dispatchEvent(new CustomEvent('mrcontract_data_synced'));
 window.dispatchEvent(new Event('storage'));

 setSuccessMsg('Status saved');
 setTimeout(() => setSuccessMsg(null), 3000);
 } catch (err: any) {
 setError(`Failed to update status: ${err.message}`);
 } finally {
 setUpdatingStatus(false);
 }
 };

 const handleDeleteSelectedLead = () => {
 if (!selectedLead) return;
 setShowDeleteModal(true);
 };

 const confirmDeleteSelectedLead = async () => {
 if (!selectedLead) return;
 const leadToDelete = selectedLead;
 setIsDeletingLead(true);
 const targetTabName = leadToDelete.tabName && leadToDelete.tabName !== 'ALL' ? leadToDelete.tabName : leadToDelete.leadSource || 'Angi';

 try {
 const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
 if (spreadsheetId) {
 await deleteRowFromSheet(undefined, spreadsheetId, targetTabName, leadToDelete.rowIndex);
 }

 setAllFollowUps((prev) => 
 prev
 .filter((r) => !(r.rowIndex === leadToDelete.rowIndex && (!r.tabName || r.tabName === targetTabName)))
 .map((r) => (r.rowIndex > leadToDelete.rowIndex && (!r.tabName || r.tabName === targetTabName)) ? { ...r, rowIndex: r.rowIndex - 1 } : r)
 );
 setSelectedLead(null);
 setShowDeleteModal(false);
 setSuccessMsg('Lead deleted successfully');
 setTimeout(() => setSuccessMsg(null), 3000);

 logAuditActivity({
 actionType: 'delete_lead',
 clientName: leadToDelete.clientName,
 clientPhone: leadToDelete.clientPhone,
 tabName: targetTabName,
 details: `Deleted lead "${leadToDelete.clientName || 'Lead'}"`
 });
 } catch (sheetErr: any) {
 console.error('Google Sheet delete error:', sheetErr);
 setError(`Delete failed: ${sheetErr.message || 'Network error'}. Lead kept in list.`);
 } finally {
 setIsDeletingLead(false);
 }
 };

  // Resolve template content for selected lead
 const currentScript: FollowUpScript = ESTIMATE_FOLLOW_UP_SCRIPTS[selectedScriptDay] || ESTIMATE_FOLLOW_UP_SCRIPTS[3];
 const clientName = selectedLead?.clientName || 'Valued Customer';
 const salespersonName = config.salespeople?.[0]?.name?.split('(')[0]?.trim() || 'Mr. Contract Customer Service';
 const currentEmailSub = currentScript.emailSubject;
 const currentEmailBody = currentScript.emailBody
 .replace(/\[Customer Name\]/g, clientName)
 .replace(/\[Your Name\]/g, salespersonName);
 const currentSmsBody = currentScript.smsBody
 .replace(/\[Customer Name\]/g, clientName)
 .replace(/\[Your Name\]/g, salespersonName);

 const selectedInfo = selectedLead ? getEstimateFollowUpInfo(selectedLead) : null;
 const selectedTiming = selectedInfo ? getFollowUpTimingIndicator(selectedInfo) : null;

 return (
 <div className="flex-1 relative pb-16 bg-white dark:bg-black">
 {/* Main Workspace */}
 <main className="px-4 sm:px-8 pt-5 max-w-7xl mx-auto space-y-4 bg-white dark:bg-black">
 {/* Global Alert Banners */}
 {error && (
 <div className="bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-sm p-4 rounded-xl flex items-start justify-between">
 <div className="flex items-start gap-2.5">
 <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"/>
 <div>
 <p className="font-bold text-red-900 dark:text-red-100">Action notice</p>
 <p className="mt-0.5 text-sm">{error}</p>
 </div>
 </div>
 <button onClick={() => setError(null)} className="text-red-600 dark:text-red-300 hover:text-red-900 dark:hover:text-white font-bold cursor-pointer ml-3 text-sm">
 ✕
 </button>
 </div>
 )}

 {successMsg && (
 <div className="bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-sm p-4 rounded-xl flex items-center justify-between">
 <div className="flex items-center gap-2.5">
 <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0"/>
 <span className="font-normal">{successMsg}</span>
 </div>
 <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-white font-bold cursor-pointer text-sm">
 ✕
 </button>
 </div>
 )}

 {/* Milestone Trigger Overview Pills */}
 <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
 {[
 { key: 'ALL', label: 'All Follow-Ups', count: allFollowUps.length },
 {
 key: 'DUE',
 label: 'Due Today',
 count: allFollowUps.filter((l) => [3, 7, 15, 30, 90].includes(getEstimateFollowUpInfo(l).dayCount)).length,
 highlight: true
 },
 {
 key: 'DAY_3',
 label: 'Day 3 (5% Off)',
 count: allFollowUps.filter((l) => getEstimateFollowUpInfo(l).targetScriptDay === 3).length,
 },
 {
 key: 'DAY_7',
 label: 'Day 7 (Check-in)',
 count: allFollowUps.filter((l) => getEstimateFollowUpInfo(l).targetScriptDay === 7).length,
 },
 {
 key: 'DAY_15',
 label: 'Day 15 (Review)',
 count: allFollowUps.filter((l) => getEstimateFollowUpInfo(l).targetScriptDay === 15).length,
 },
 {
 key: 'DAY_30',
 label: 'Day 30+ (Offer)',
 count: allFollowUps.filter((l) => getEstimateFollowUpInfo(l).targetScriptDay >= 30).length,
 }
 ].map((pill) => {
 const isSelected = stageFilter === pill.key;
 return (
 <button
 key={pill.key}
 onClick={() => setStageFilter(pill.key)}
 className={`p-3 rounded-xl border text-left transition-colors cursor-pointer flex flex-col justify-between ${
 isSelected
 ? 'bg-[#EF7E15] border-[#EF7E15] text-white'
 : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-800 dark:text-zinc-200'
 }`}
 >
 <div>
 <span className={`text-xs sm:text-sm font-medium truncate block ${isSelected ? 'text-white' : 'text-zinc-600 dark:text-zinc-400'}`}>
 {pill.label}
 </span>
 </div>
 <div className="flex items-baseline gap-1.5 mt-2">
 <span className="text-xl font-bold">{pill.count}</span>
 <span className={`text-xs font-normal ${isSelected ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-500'}`}>leads</span>
 </div>
 </button>
 );
 })}
 </div>

 {/* 2-Column Responsive Workspace */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
 {/* Left Column: Follow-Up Leads List (Hidden on mobile if detail is selected) */}
 <div
 className={`lg:col-span-5 space-y-3 ${
 mobileView === 'detail' ? 'hidden lg:block' : 'block'
 }`}
 >
 {/* Search & Lead Source Filter Header */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-xl space-y-2.5">
 <div className="relative crm-search-field">
 <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2"/>
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search clients, phone, notes..."
 className="w-full pl-9 pr-7 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#EF7E15]"
 />
 {searchQuery && (
 <button
 onClick={() => setSearchQuery('')}
 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-white text-xs font-bold"
 >
 ✕
 </button>
 )}
 </div>

 {/* Source Dropdown & Refresh Button */}
 <div className="flex items-center gap-2">
 <span className="text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-400 shrink-0">Source:</span>
 <select
 value={sourceFilter}
 onChange={(e) => setSourceFilter(e.target.value)}
 className="w-full px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs sm:text-sm font-normal text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-[#EF7E15] cursor-pointer"
 >
 <option value="ALL">All Sources ({allFollowUps.length})</option>
 {availableSources.map((src) => {
 const count = allFollowUps.filter((l) => (l.leadSource || l.tabName || 'Angi').toLowerCase() === src.toLowerCase()).length;
 return (
 <option key={src} value={src}>
 {src} ({count})
 </option>
 );
 })}
 </select>

 <div className="flex items-center gap-1.5 shrink-0">
 <button
 onClick={() => {
 setRefreshing(true);
 setRefreshError(false);
 fetchFollowUps(true);
 setSuccessMsg('Updated');
 setTimeout(() => setSuccessMsg(null), 3500);
 }}
 disabled={refreshing || loading}
 className="flex items-center gap-1 px-2.5 py-1.5 bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 border border-zinc-200 dark:border-zinc-700 shrink-0"
 title="Refresh latest lead statuses"
 >
 <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
 <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
 </button>

 {!refreshing && !refreshError && (
 <span className="hidden xl:inline text-xs text-zinc-500 dark:text-zinc-400 font-normal select-none whitespace-nowrap">
 Updated just now
 </span>
 )}
 {refreshError && (
 <button
 type="button"
 onClick={() => {
 setRefreshing(true);
 setRefreshError(false);
 fetchFollowUps(true);
 }}
 className="text-xs text-rose-600 dark:text-rose-400 font-medium underline cursor-pointer whitespace-nowrap"
 >
 Couldn't save — Retry
 </button>
 )}
 </div>
 </div>
 </div>

 {/* Scrollable Leads List Container */}
 <div className="space-y-2.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
 {loading ? (
 <div className="text-center py-12 text-sm text-zinc-500 dark:text-zinc-400">
 <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-zinc-400 dark:text-zinc-500"/>
 <span>Loading customer service follow-ups...</span>
 </div>
 ) : filteredLeads.length === 0 ? (
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 text-center text-sm text-zinc-500 dark:text-zinc-400 space-y-2">
 <Clock className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto"/>
 <p className="font-medium text-zinc-700 dark:text-zinc-300">No follow-up leads match your filter</p>
 <p className="text-xs text-zinc-500 dark:text-zinc-500">Try selecting another source or follow-up milestone.</p>
 </div>
 ) : (
 filteredLeads.map((lead, idx) => {
 const isSelected = selectedLead?.rowIndex === lead.rowIndex && (!selectedLead.tabName || lead.tabName === selectedLead.tabName);
 const info = getEstimateFollowUpInfo(lead);
 const timing = getFollowUpTimingIndicator(info);
 const leadSrc = lead.leadSource || lead.tabName || 'Angi';
 const leadSvc = lead.leadType || (lead as any).serviceNeeded || 'Service details needed';

 return (
 <div
 key={`${lead.tabName || 'src'}_${lead.rowIndex || idx}`}
 onClick={() => {
 setSelectedLead(lead);
 setSelectedScriptDay(info.targetScriptDay);
 setMobileView('detail');
 }}
 className={`p-4 rounded-xl border transition-colors cursor-pointer space-y-1.5 ${
 isSelected
 ? 'bg-orange-50/70 dark:bg-orange-950/20 border-[#EF7E15] dark:border-[#EF7E15]'
 : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
 }`}
 >
 {/* Top Row: Client Name & Single Clear Timing Indicator */}
 <div className="flex items-center justify-between gap-2">
 <span className="font-bold text-sm sm:text-base text-zinc-900 dark:text-white truncate">
 {lead.clientName || 'Unnamed Client'}
 </span>
 <span
 className={`text-xs font-medium px-2.5 py-0.5 rounded-full border shrink-0 ${
 timing.variant === 'due'
 ? 'bg-[#EF7E15] text-white border-[#EF7E15]'
 : timing.variant === 'overdue'
 ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 }`}
 >
 {timing.text}
 </span>
 </div>

 {/* Plain Secondary Text for Source & Service */}
 <div className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 truncate">
 {leadSrc} • {leadSvc}
 </div>

 {/* Phone as Plain Secondary Text */}
 <div className="flex items-center text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800">
 {lead.clientPhone ? (
 <span className="font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
 <Phone className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"/>
 {lead.clientPhone}
 </span>
 ) : (
 <span className="text-zinc-400 dark:text-zinc-500">No phone</span>
 )}
 </div>
 </div>
 );
 })
 )}
 </div>
 </div>

 {/* Right Column: Interactive Customer Service Console */}
 <div
 className={`lg:col-span-7 space-y-4 ${
 mobileView === 'list' ? 'hidden lg:block' : 'block'
 }`}
 >
 {selectedLead ? (
 <div className="space-y-4">
 {/* Mobile Back Button */}
 <div className="lg:hidden">
 <button
 type="button"
 onClick={() => setMobileView('list')}
 className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer min-h-[44px]"
 >
 <ChevronLeft className="w-4 h-4"/>
 <span>Back to Follow-Up List ({filteredLeads.length})</span>
 </button>
 </div>

 {/* Selected Lead Profile Card */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-4">
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
 <div>
 <div className="flex items-center gap-2">
 <span className="text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400">
 Client follow-up
 </span>
 {selectedTiming && (
 <span
 className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${
 selectedTiming.variant === 'due'
 ? 'bg-[#EF7E15] text-white border-[#EF7E15]'
 : selectedTiming.variant === 'overdue'
 ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 }`}
 >
 {selectedTiming.text}
 </span>
 )}
 </div>
 <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-white tracking-tight mt-0.5">
 {clientName}
 </h2>
 </div>

 {/* Quick Call & Delete */}
 <div className="flex items-center gap-2 flex-wrap">
 {selectedLead.clientPhone && (
 <a
 href={`tel:${selectedLead.clientPhone}`}
 className="px-4 py-2 bg-[#EF7E15] hover:bg-[#D66B0F] text-white font-semibold text-xs sm:text-sm rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
 >
 <Phone className="w-4 h-4"/>
 <span>Call {selectedLead.clientPhone}</span>
 </a>
 )}
 <button
 type="button"
 onClick={handleDeleteSelectedLead}
 title="Delete Lead"
 className="p-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 transition-colors cursor-pointer"
 >
 <Trash2 className="w-4 h-4"/>
 </button>
 </div>
 </div>

 {/* Details metadata grid */}
 <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
 <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
 <span className="text-xs text-zinc-500 dark:text-zinc-400 block font-normal">Email address</span>
 <span className="text-sm sm:text-base text-zinc-900 dark:text-zinc-100 truncate block mt-0.5 font-normal">
 {selectedLead.clientEmail || 'No email on file'}
 </span>
 </div>

 <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800">
 <span className="text-xs text-zinc-500 dark:text-zinc-400 block font-normal">Service needed</span>
 <span className="text-sm sm:text-base text-zinc-900 dark:text-zinc-100 truncate block mt-0.5 font-normal">
 {selectedLead.leadType || (selectedLead as any).serviceNeeded || 'Masonry'}
 </span>
 </div>

 <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 col-span-2 sm:col-span-1">
 <span className="text-xs text-zinc-500 dark:text-zinc-400 block font-normal">Estimate sent date</span>
 <span className="text-sm sm:text-base text-zinc-900 dark:text-zinc-100 font-medium block mt-0.5">
 {selectedInfo?.formattedSentDate} (Day {selectedInfo?.dayCount})
 </span>
 </div>
 </div>

 {/* Detailed Milestone Information moved to Details Panel */}
 {selectedInfo && (
 <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
 <div className="flex items-center gap-2">
 <span className="text-zinc-500 dark:text-zinc-400">Milestone:</span>
 <span className="font-semibold text-zinc-800 dark:text-zinc-200">
 {selectedInfo.followUpMilestone}
 </span>
 <span className="text-zinc-400 dark:text-zinc-500">•</span>
 <span className="text-zinc-600 dark:text-zinc-400">{selectedInfo.stageBadgeText}</span>
 </div>
 <div className="text-zinc-500 dark:text-zinc-400">
 Lead Source: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{selectedLead.leadSource || selectedLead.tabName || 'Angi'}</span>
 </div>
 </div>
 )}

 {/* Status update selector */}
 <div className="flex items-center justify-between gap-3 pt-1">
 <span className="text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-400">Current Status:</span>
 <select
 value={selectedLead.status || 'New'}
 disabled={updatingStatus}
 onChange={(e) => handleUpdateStatus(e.target.value)}
 className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm font-semibold text-zinc-900 dark:text-white cursor-pointer focus:outline-none focus:border-[#EF7E15]"
 >
 {LEAD_STATUS_OPTIONS.map((opt) => (
 <option key={opt} value={opt}>
 {opt}
 </option>
 ))}
 </select>
 </div>
 </div>

 {/* Milestone Selection Tabs */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-2.5">
 <div className="flex items-center justify-between text-xs sm:text-sm font-medium text-zinc-600 dark:text-zinc-400 px-1">
 <span>Select follow-up script stage:</span>
 {selectedInfo && (
 <span className="text-zinc-600 dark:text-zinc-400 font-medium">
 Recommended: <strong className="font-bold">{selectedInfo.followUpMilestone}</strong>
 </span>
 )}
 </div>

 <div className="grid grid-cols-5 gap-2">
 {[3, 7, 15, 30, 90].map((d) => {
 const isSelected = selectedScriptDay === d;
 const isRecommended = selectedInfo?.targetScriptDay === d;
 const isExactDay = selectedInfo?.dayCount === d;

 return (
 <button
 key={d}
 onClick={() => setSelectedScriptDay(d)}
 className={`py-2 px-1 rounded-xl text-xs sm:text-sm font-semibold transition-colors text-center cursor-pointer ${
 isSelected
 ? 'bg-[#EF7E15] text-white border border-[#EF7E15]'
 : isRecommended
 ? 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-600'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-700'
 }`}
 >
 <div>Day {d}</div>
 <div className={`text-xs font-normal mt-0.5 ${isSelected ? 'text-white/90' : 'text-zinc-500 dark:text-zinc-400'}`}>
 {isExactDay ? 'Due today' : isRecommended ? 'Target' : `${d}d script`}
 </div>
 </button>
 );
 })}
 </div>
 </div>

 {/* Email Script Section */}
 <div className="pt-2 space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
 <Mail className="w-4 h-4 text-zinc-500 dark:text-zinc-400"/> Email message
 </h3>
 <button
 onClick={() => handleCopy(`Subject: ${currentEmailSub}\n\n${currentEmailBody}`, 'email')}
 className="px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-medium text-xs sm:text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-1"
 >
 {copiedField === 'email' ? <Check className="w-3.5 h-3.5 text-emerald-500"/> : <Copy className="w-3.5 h-3.5"/>}
 <span>{copiedField === 'email' ? 'Copied' : 'Copy'}</span>
 </button>
 </div>

 <div className="space-y-1.5 text-xs sm:text-sm">
 <div className="font-semibold text-zinc-700 dark:text-zinc-300 px-1">
 Subject: <span className="font-normal text-zinc-900 dark:text-white">{currentEmailSub}</span>
 </div>
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 font-sans text-xs sm:text-sm leading-relaxed max-h-48 overflow-y-auto">
 {currentEmailBody}
 </div>
 </div>

 {/* Send Email Feedback */}
 {emailSendResult && (
 <div
 className={`p-3 rounded-lg text-xs sm:text-sm font-medium ${
 emailSendResult.success
 ? 'text-emerald-700 dark:text-emerald-400'
 : 'text-red-700 dark:text-red-400'
 }`}
 >
 {emailSendResult.msg}
 </div>
 )}

 {selectedLead.clientEmail && (
 <div className="flex flex-col sm:flex-row gap-3 pt-1">
 <button
 disabled={isSendingEmail}
 onClick={() =>
 handleSendEmailDirectly(
 selectedLead.clientEmail!,
 currentEmailSub,
 currentEmailBody,
 selectedLead,
 currentScript.key
 )
 }
 className="py-2.5 px-5 bg-[#EF7E15] hover:bg-[#D66B0F] disabled:opacity-50 text-white font-semibold text-xs sm:text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer"
 >
 <Send className={`w-3.5 h-3.5 ${isSendingEmail ? 'animate-spin' : ''}`} />
 <span>{isSendingEmail ? 'Sending...' : 'Send email'}</span>
 </button>

 <a
 href={`mailto:${selectedLead.clientEmail}?subject=${encodeURIComponent(currentEmailSub)}&body=${encodeURIComponent(currentEmailBody)}`}
 target="_blank"
 rel="noopener noreferrer"
 className="py-2.5 px-4 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs sm:text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700"
 >
 <ExternalLink className="w-3.5 h-3.5"/>
 <span>Open in email app</span>
 </a>
 </div>
 )}
 </div>

 <hr className="border-zinc-100 dark:border-zinc-800 my-4"/>

 {/* SMS Text Message Section */}
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
 <MessageSquare className="w-4 h-4 text-zinc-500 dark:text-zinc-400"/> Text message (SMS)
 </h3>
 <button
 onClick={() => handleCopy(currentSmsBody, 'sms')}
 className="px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white font-medium text-xs sm:text-sm rounded-lg transition-colors cursor-pointer flex items-center gap-1"
 >
 {copiedField === 'sms' ? <Check className="w-3.5 h-3.5 text-emerald-500"/> : <Copy className="w-3.5 h-3.5"/>}
 <span>{copiedField === 'sms' ? 'Copied' : 'Copy'}</span>
 </button>
 </div>

 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 font-sans text-xs sm:text-sm leading-relaxed">
 {currentSmsBody}
 </div>

 {/* SMS Send Feedback */}
 {selectedLead.clientPhone && (
 <div className="pt-1">
 <a
 href={`sms:${selectedLead.clientPhone}?body=${encodeURIComponent(currentSmsBody)}`}
 className="py-2.5 px-5 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium text-xs sm:text-sm rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer border border-zinc-200 dark:border-zinc-700 w-full sm:w-auto"
 >
 <Phone className="w-3.5 h-3.5"/>
 <span>Open in messages app</span>
 </a>
 </div>
 )}
 </div>

 {/* Activity & Outreach Timeline */}
 {leadActivities.length > 0 && (
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 space-y-3">
 <h3 className="text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
 <Clock className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"/> Recent interactions & activity
 </h3>
 <div className="space-y-2">
 {leadActivities.slice(0, 4).map((act, idx) => (
 <div
 key={idx}
 className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 text-xs sm:text-sm flex items-center justify-between"
 >
 <span className="font-normal text-zinc-800 dark:text-zinc-200">{act.message}</span>
 <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0 ml-2">
 {new Date(act.timestamp).toLocaleDateString()}
 </span>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 ) : (
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400 dark:text-zinc-500 space-y-3">
 <Clock className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto"/>
 <h3 className="text-base font-semibold text-zinc-700 dark:text-zinc-300">Select a follow-up lead</h3>
 <p className="text-sm text-zinc-500 dark:text-zinc-400">Click on any client on the left to review timing details and send outreach messages.</p>
 </div>
 )}
 </div>
 </div>
 </main>

 {/* Delete Confirmation Modal */}
 {showDeleteModal && selectedLead && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
 <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
 <Trash2 className="w-6 h-6"/>
 </div>
 <div>
 <h3 className="text-base font-black text-zinc-900 dark:text-white">Delete Lead</h3>
 <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
 Are you sure you want to delete lead <span className="font-bold text-zinc-800 dark:text-zinc-200">"{selectedLead.clientName || 'Lead'}"</span>? This will remove it from the app and Google Sheets.
 </p>
 </div>
 <div className="flex items-center gap-2 pt-2">
 <button
 type="button"
 onClick={() => setShowDeleteModal(false)}
 className="flex-1 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
 >
 Cancel
 </button>
          <button
            type="button"
            disabled={isDeletingLead}
            onClick={confirmDeleteSelectedLead}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-black shadow-sm transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
          >
            {isDeletingLead ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete Lead'
            )}
          </button>
        </div>
      </div>
    </div>
    )}
  </div>
  );
};
