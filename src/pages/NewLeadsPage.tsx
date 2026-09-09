import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
 UserPlus,
 Phone,
 Mail,
 MapPin,
 CalendarClock,
 Trash2,
 Search,
 
 Tag,
 Clock,
 LayoutGrid,
 Table as TableIcon,
 DollarSign,
 RefreshCw,
 ChevronDown,
 ChevronRight,
 User,
 Loader2,
 Webhook,
 Zap,
 Edit2,
 Save,
 Check,
 X,
 Activity,
 Filter,
 AlertCircle,
} from 'lucide-react';
import { getNewLeads, fetchNewLeads, migrateLegacyNewLeads, deleteNewLead, updateNewLeadStatus, updateNewLeadInfo, NewLeadRecord } from '../lib/newLeads';
import { logAuditActivity } from '../lib/activityLogger';
import { loadAppConfig, isLeadSourceTab, DEFAULT_LEAD_SOURCES } from '../config';
import { LEAD_STATUS_OPTIONS } from '../types';
import {
 readSpreadsheetRows,
 readAllSpreadsheetTabs,
 getSpreadsheetDetails,
 invalidateSpreadsheetCache,
 deleteRowFromSheet,
 updateLeadStatusInSpreadsheet,
 updateLeadInSpreadsheet,
 SheetRowRecord,
} from '../lib/sheets';
import { LeadDrawer } from '../components/ui/LeadDrawer';
import { sendThumbtackLeadToHouzz } from '../lib/webhooks';
import { WebhookDiagnosticsModal } from '../components/WebhookDiagnosticsModal';

export const NewLeadsPage: React.FC = () => {
 const navigate = useNavigate();
 const [leads, setLeads] = useState<NewLeadRecord[]>(() => getNewLeads());
 const [searchTerm, setSearchTerm] = useState('');
 const [sourceFilter, setSourceFilter] = useState('ALL');
 const [viewMode, setViewMode] = useState<'clean' | 'table'>('clean');
 const [syncMsg, setSyncMsg] = useState<string | null>(null);
 const [updatingId, setUpdatingId] = useState<string | null>(null);
 const [sendingHouzzId, setSendingHouzzId] = useState<string | null>(null);
 const [leadToDelete, setLeadToDelete] = useState<NewLeadRecord | null>(null);
 const [isWebhookDiagOpen, setIsWebhookDiagOpen] = useState(false);
 const [syncIssue, setSyncIssue] = useState<{ message: string; details: string } | null>(null);

  const config = loadAppConfig();
  const [selectedLeadForDrawer, setSelectedLeadForDrawer] = useState<SheetRowRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleOpenLead = (lead: NewLeadRecord) => {
    const sheetLead: SheetRowRecord = {
      rowIndex: lead.rowIndex || 0,
      clientName: lead.clientName,
      clientPhone: lead.clientPhone,
      clientEmail: lead.clientEmail,
      address: lead.address,
      serviceNeeded: lead.serviceNeeded,
      leadType: lead.serviceNeeded,
      leadSource: lead.leadSource || 'Angi',
      tabName: (lead as any).tabName || lead.leadSource || 'Angi',
      status: lead.status || 'New',
      leadFee: lead.leadFee,
      notes: lead.notes,
      rawValues: [],
    };
    (sheetLead as any).id = lead.id;
    setSelectedLeadForDrawer(sheetLead);
    setIsDrawerOpen(true);
  };

  const handleDrawerStatusChange = async (row: SheetRowRecord, newStatus: string) => {
    const leadId = (row as any).id;
    const matched = leads.find((l) => l.id === leadId || l.clientName === row.clientName);
    if (matched) {
      await handleStatusChange(matched, newStatus);
    } else {
      const dummyRecord: NewLeadRecord = {
        id: leadId || String(Date.now()),
        clientName: row.clientName || '',
        clientPhone: row.clientPhone || '',
        clientEmail: row.clientEmail || '',
        address: row.address || '',
        serviceNeeded: row.serviceNeeded || '',
        leadSource: row.leadSource || row.tabName || 'Angi',
        status: newStatus,
        notes: row.notes || '',
        rowIndex: row.rowIndex,
        statusColIndex: row.statusColIndex,
        createdAt: new Date().toISOString(),
      };
      await handleStatusChange(dummyRecord, newStatus);
    }
    setSelectedLeadForDrawer((prev) => (prev ? { ...prev, status: newStatus } : null));
  };

  const handleDrawerLeadUpdate = async (updatedLead: SheetRowRecord) => {
    refreshLocalLeads();
    setSelectedLeadForDrawer((prev) => (prev ? { ...prev, ...updatedLead } : null));
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedLeadForDrawer(null);
    refreshLocalLeads();
  };

  const getStatusBadge = (status?: string) => {
    const st = status || 'New';
    if (st === 'New') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#FF5500]/10 text-[#FF5500] border border-[#FF5500]/30">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5500]" />
          {st}
        </span>
      );
    }
    if (st === 'Meeting Scheduled' || st === 'Scheduled' || st === 'Confirmed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          {st}
        </span>
      );
    }
    if (st.includes('Lost')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          {st}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
        {st}
      </span>
    );
  };


 // Edit Lead Modal State
 const [editingLead, setEditingLead] = useState<NewLeadRecord | null>(null);
 const [editFormData, setEditFormData] = useState({
 clientName: '',
 clientPhone: '',
 clientEmail: '',
 address: '',
 serviceNeeded: '',
 leadSource: '',
 status: 'New',
 leadFee: '',
 notes: '',
 });
 const [isSavingEdit, setIsSavingEdit] = useState(false);

 const refreshLocalLeads = async (forceFresh = false) => {
 try {
  const canonical = await fetchNewLeads(forceFresh);
  setLeads(canonical);
 } catch (err) {
  console.warn('Unable to refresh canonical New leads:', err);
 }
 };

 const handleOpenEditModal = (lead: NewLeadRecord) => {
 setEditingLead(lead);
 setEditFormData({
 clientName: lead.clientName || '',
 clientPhone: lead.clientPhone || '',
 clientEmail: lead.clientEmail || '',
 address: lead.address || '',
 serviceNeeded: lead.serviceNeeded || '',
 leadSource: lead.leadSource || 'Angi',
 status: lead.status || 'New',
 leadFee: lead.leadFee || '',
 notes: lead.notes || '',
 });
 };

 const handleSaveEditSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!editingLead) return;

 if (!editFormData.clientName.trim()) {
 alert('Client Name is required.');
 return;
 }

 setIsSavingEdit(true);
 const config = loadAppConfig();

 try {
 // 1. Update in Google Sheets if spreadsheet is connected
 if (config.spreadsheetId) {
 await updateLeadInSpreadsheet(undefined, config.spreadsheetId, {
 tabName: editFormData.leadSource || editingLead.leadSource || 'Angi',
 rowIndex: editingLead.rowIndex,
 clientName: editFormData.clientName.trim(),
 clientPhone: editFormData.clientPhone.trim(),
 clientEmail: editFormData.clientEmail.trim(),
 address: editFormData.address.trim(),
 serviceNeeded: editFormData.serviceNeeded.trim(),
 leadFee: editFormData.leadFee.trim(),
 status: editFormData.status,
 notes: editFormData.notes.trim(),
 });
 }

 // 2. Update in local storage / webhook state
 updateNewLeadInfo(editingLead.id, {
 clientName: editFormData.clientName.trim(),
 clientPhone: editFormData.clientPhone.trim(),
 clientEmail: editFormData.clientEmail.trim(),
 address: editFormData.address.trim(),
 serviceNeeded: editFormData.serviceNeeded.trim(),
 leadSource: editFormData.leadSource.trim(),
 status: editFormData.status,
 leadFee: editFormData.leadFee.trim(),
 notes: editFormData.notes.trim(),
 });

 // 3. Log audit activity
 logAuditActivity({
 actionType: 'update_lead',
 clientName: editFormData.clientName.trim(),
 clientPhone: editFormData.clientPhone.trim(),
 tabName: editFormData.leadSource || 'New Leads',
 details: `Updated client details for"${editFormData.clientName.trim()}"(Status: ${editFormData.status})`,
 });

 refreshLocalLeads();
 setSyncMsg("Client info saved");
 setTimeout(() => setSyncMsg(null), 3500);
 setEditingLead(null);
 } catch (err: any) {
 console.error('Failed to update lead:', err);
 alert(`Error saving changes: ${err.message || 'Unknown error'}`);
 } finally {
 setIsSavingEdit(false);
 }
 };

 const handleStatusChange = async (lead: NewLeadRecord, newStatus: string) => {
 setUpdatingId(lead.id);
 const config = loadAppConfig();
 try {
 if (config.spreadsheetId) {
 await updateLeadStatusInSpreadsheet(
 undefined,
 config.spreadsheetId!,
 {
 clientName: lead.clientName,
 clientPhone: lead.clientPhone,
 clientEmail: lead.clientEmail,
 tabName: lead.leadSource,
 rowIndex: lead.rowIndex,
 statusColIndex: lead.statusColIndex,
 },
 newStatus
 );
 }

 updateNewLeadStatus(lead.id, newStatus);
 setLeads(getNewLeads());
 if (newStatus !== 'New' && lead.id.startsWith('wh_lead_')) {
  await fetch(`/api/webhooks/incoming-leads/${encodeURIComponent(lead.id)}`, {
   method: 'PATCH',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ status: newStatus }),
  });
 }

 logAuditActivity({
 actionType: 'status_change',
 clientName: lead.clientName,
 clientPhone: lead.clientPhone,
 tabName: lead.leadSource || 'New Leads',
 details: `Updated status of"${lead.clientName}"from"${lead.status || 'New'}"to"${newStatus}"`,
 oldValue: lead.status,
 newValue: newStatus,
 });

 setSyncMsg("Status saved");
 setTimeout(() => setSyncMsg(null), 3500);
 } catch (err: any) {
 console.error('Failed to update status in sheet:', err);
 setSyncMsg(`Failed to update status: ${err.message || 'Error updating cell'}`);
 setTimeout(() => setSyncMsg(null), 4000);
 } finally {
 setUpdatingId(null);
 }
 };

 useEffect(() => {
 let active = true;
 const initialize = async () => {
  try {
   await migrateLegacyNewLeads();
   if (active) await refreshLocalLeads(true);
  } catch (err) {
   console.warn('New lead migration/initial load notice:', err);
   if (active) await refreshLocalLeads();
  }
 };
 initialize();

 const handleUpdate = (e: any) => {
  if (Array.isArray(e.detail)) setLeads(e.detail);
  else refreshLocalLeads(true);
 };
 const handleDataSync = () => refreshLocalLeads(true);
 window.addEventListener('new_leads_updated', handleUpdate);
 window.addEventListener('mrcontract_data_synced', handleDataSync);

 // Cross-device refresh, paused while this browser tab is hidden.
 const interval = setInterval(() => {
  if (document.visibilityState === 'visible') refreshLocalLeads(true);
 }, 15000);

 return () => {
  active = false;
  clearInterval(interval);
  window.removeEventListener('new_leads_updated', handleUpdate);
  window.removeEventListener('mrcontract_data_synced', handleDataSync);
 };
 }, []);

 // Monitor for sync issues needing attention
 useEffect(() => {
 const unsyncedLeads = leads.filter((l) => l.sheetSynced === false);
 if (unsyncedLeads.length > 0) {
 setSyncIssue({
 message: `${unsyncedLeads.length} new ${unsyncedLeads.length === 1 ? 'lead has' : 'leads have'} not yet synced to Google Sheets`,
 details: 'Incoming webhook leads recorded locally but waiting for Google Sheets sync confirmation.',
 });
 }

 const config = loadAppConfig();
 if (config.spreadsheetId) {
 fetch('/api/sheets/status')
 .then((res) => res.json())
 .then((data) => {
 if (data && data.configured === false) {
 setSyncIssue({
 message: 'Google Sheets credentials needed to sync leads',
 details: data.error || 'Service account credentials required',
 });
 }
 })
 .catch(() => {});
 }
 }, [leads]);



 const handleDelete = (lead: NewLeadRecord) => {
 setLeadToDelete(lead);
 };

 const confirmDeleteLead = async () => {
 if (!leadToDelete) return;
 const lead = leadToDelete;
 setLeadToDelete(null);
 setUpdatingId(lead.id);

 try {
  const config = loadAppConfig();
  if (!config.spreadsheetId) {
   throw new Error('Google Sheets is not configured. The lead was not deleted.');
  }
  if (!lead.rowIndex || lead.rowIndex < 1) {
   throw new Error('The Google Sheets row could not be identified. Refresh New and try again.');
  }
  const sheetTab = String((lead as any).tabName || lead.leadSource || '').trim();
  if (!sheetTab) {
   throw new Error('The lead source worksheet could not be identified.');
  }

  // Delete from the source of truth first. Only remove it from the CRM after
  // Google Sheets confirms that the exact row was deleted.
  await deleteRowFromSheet(
   undefined,
   config.spreadsheetId,
   sheetTab,
   lead.rowIndex,
   lead.clientName,
   lead.clientPhone
  );
  await deleteNewLead(lead.id, lead);
  await refreshLocalLeads(true);

  logAuditActivity({
   actionType: 'delete_lead',
   clientName: lead.clientName,
   clientPhone: lead.clientPhone,
   tabName: lead.leadSource || 'New Leads',
   details: `Deleted lead "${lead.clientName}" from the CRM and Google Sheets`,
  });
  setSyncMsg('Lead deleted from CRM and Google Sheets');
 } catch (err: any) {
  console.error('Failed to remove lead:', err);
  setSyncMsg(err.message || 'Failed to remove lead');
  await refreshLocalLeads(true);
 } finally {
  setUpdatingId(null);
  setTimeout(() => setSyncMsg(null), 3500);
 }
 };

 const handleScheduleLead = (lead: NewLeadRecord) => {
 const todayStr = new Date().toISOString().split('T')[0];
 const appointmentData = {
 clientName: lead.clientName,
 appointmentDate: todayStr,
 startTime: '09:00',
 endTime: '11:00',
 salespersonCode: '',
 clientPhone: lead.clientPhone,
 clientEmail: lead.clientEmail,
 address: lead.address,
 leadSource: lead.leadSource || 'Angi',
 leadType: lead.serviceNeeded || 'Direct',
 serviceNeeded: lead.serviceNeeded,
 notes: lead.notes,
 };
 sessionStorage.setItem('prefill_schedule_lead', JSON.stringify(appointmentData));
 navigate('/');
 setTimeout(() => {
 window.dispatchEvent(new CustomEvent('open_schedule_modal', { detail: appointmentData }));
 }, 100);
 };

 const handleSendThumbtackToHouzz = async (lead: NewLeadRecord) => {
 setSendingHouzzId(lead.id);
 setSyncMsg(null);
 try {
 const result = await sendThumbtackLeadToHouzz(lead.id);
 await refreshLocalLeads(true);
 setSyncMsg(result.message || 'Lead sent to Houzz Pro.');
 } catch (err: any) {
 setSyncMsg(err.message || 'Failed to send lead to Houzz Pro.');
 } finally {
 setSendingHouzzId(null);
 setTimeout(() => setSyncMsg(null), 5000);
 }
 };

 const renderHouzzAction = (lead: NewLeadRecord, compact = false) => {
 if (!lead.isWebhookLead) return <span aria-hidden="true" className={compact ? 'inline-block w-[148px]' : 'inline-block w-[160px]'} />;

 const source = String(lead.leadSource || lead.webhookSource || '').trim().toLowerCase();
 const status = String(lead.houzzStatus || lead.houzzResult || '').toLowerCase();
 const confirmed = status.includes('created in houzz pro');
 const accepted = status.includes('accepted by zapier');
 const sent = confirmed || accepted;
 const failed = status.startsWith('failed') || status.includes('failed in houzz');
 const sending = sendingHouzzId === lead.id || status.startsWith('sending to ');
 const sizeClass = compact ? 'w-[148px] px-2.5 py-1.5 rounded-lg justify-center whitespace-nowrap' : 'w-[160px] px-3.5 py-2 rounded-xl justify-center whitespace-nowrap';

 if (source === 'angi') {
 const label = confirmed ? 'Created in Houzz Pro' : accepted ? 'Zapier accepted' : failed ? 'Auto-send failed' : 'Sending automatically';
 return (
 <button
 type="button"
 disabled
 title={failed ? (lead.houzzError || 'Automatic Houzz delivery failed.') : confirmed ? 'Houzz Pro confirmed creation.' : accepted ? 'Zapier accepted the lead; waiting for Houzz Pro confirmation.' : 'Angi automatic delivery is processing.'}
 className={`${sizeClass} text-xs font-bold inline-flex items-center gap-1.5 border cursor-not-allowed ${
 sent
 ? 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30'
 : failed
 ? 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
 }`}
 >
 {sent ? <Check className="w-3.5 h-3.5" /> : failed ? <AlertCircle className="w-3.5 h-3.5" /> : <Loader2 className="w-3.5 h-3.5 animate-spin" />}
 <span>{label}</span>
 </button>
 );
 }

 if (source !== 'thumbtack') return <span aria-hidden="true" className={compact ? 'inline-block w-[148px]' : 'inline-block w-[160px]'} />;

 return (
 <button
 type="button"
 disabled={sending || sent}
 onClick={(event) => {
 event.stopPropagation();
 handleSendThumbtackToHouzz(lead);
 }}
 title={confirmed ? 'Houzz Pro confirmed creation.' : accepted ? 'Zapier accepted the lead; waiting for Houzz confirmation.' : 'Send this Thumbtack lead to Houzz Pro.'}
 className={`${sizeClass} text-xs font-bold inline-flex items-center gap-1.5 transition-colors border ${
 sent
 ? 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/30 cursor-not-allowed'
 : 'bg-[#FF5500] hover:bg-[#E64D00] text-white border-[#FF5500] cursor-pointer disabled:opacity-60 disabled:cursor-wait'
 }`}
 >
 {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : sent ? <Check className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
 <span>{sending ? 'Sending...' : confirmed ? 'Created in Houzz Pro' : accepted ? 'Zapier accepted' : failed ? 'Retry Houzz Pro' : 'Send to Houzz Pro'}</span>
 </button>
 );
 };

 
  const formatLeadDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  };

  const availableSources = Array.from(
 new Set([
 'Angi',
 'Thumbtack',
 ...leads.map((l) => l.leadSource).filter((s): s is string => Boolean(s)),
 ])
 );

 const filteredLeads = leads
 .filter((lead) => {
 if (sourceFilter !== 'ALL') {
 const src = (lead.leadSource || 'Angi').toLowerCase();
 if (src !== sourceFilter.toLowerCase()) return false;
 }
 const query = searchTerm.toLowerCase().trim();
 if (!query) return true;
 return (
 (lead.clientName || '').toLowerCase().includes(query) ||
 (lead.clientPhone || '').toLowerCase().includes(query) ||
 (lead.clientEmail || '').toLowerCase().includes(query) ||
 (lead.serviceNeeded || '').toLowerCase().includes(query) ||
 (lead.leadSource || '').toLowerCase().includes(query) ||
 (lead.address || '').toLowerCase().includes(query)
 );
 })
 .sort((a, b) => {
 const aTime = new Date(a.createdAt || 0).getTime();
 const bTime = new Date(b.createdAt || 0).getTime();
 if (!isNaN(aTime) && !isNaN(bTime) && bTime !== aTime && bTime > 0 && aTime > 0) {
 return bTime - aTime;
 }
 return (b.rowIndex || 0) - (a.rowIndex || 0);
 });

 return (
 <div className={`p-4 sm:p-6 space-y-5 font-sans transition-all ${viewMode === 'table' ? 'w-full max-w-none px-4 sm:px-6 md:px-8' : 'max-w-7xl mx-auto'}`}>

 {syncMsg && (
 <div className="bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold p-3.5 rounded-xl flex items-center justify-between shadow-2xs">
 <span>{syncMsg}</span>
 <button onClick={() => setSyncMsg(null)} className="text-emerald-600 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-white font-bold ml-2 cursor-pointer">✕</button>
 </div>
 )}

 {/* Everyday Controls: Prominent Search & Filter */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 sm:p-3.5 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
 <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 max-w-xl">
 {/* Search Input */}
 <div className="relative flex-1">
 <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 dark:text-zinc-500"/>
 <input
 type="text"
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 placeholder="Search leads by name, phone, address, service..."
 className="w-full pl-9 pr-8 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/50 transition-all font-medium"
 />
 {searchTerm && (
 <button
 type="button"
 onClick={() => setSearchTerm('')}
 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
 >
 <X className="w-3.5 h-3.5"/>
 </button>
 )}
 </div>

 {/* Filter Dropdown */}
 <div className="flex items-center gap-1.5 px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 shrink-0">
 <Filter className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500"/>
 <select
 value={sourceFilter}
 onChange={(e) => setSourceFilter(e.target.value)}
 className="bg-transparent border-none outline-none text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer pr-1"
 >
 <option value="ALL">All Sources</option>
 {availableSources.map((src) => (
 <option key={src} value={src}>{src}</option>
 ))}
 </select>
 </div>
 </div>

 <div className="flex items-center gap-3 justify-end shrink-0">
 {/* View Mode Toggle: Clean View vs Table View */}
 <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
 <button
 onClick={() => setViewMode('clean')}
 className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
 viewMode === 'clean'
 ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
 : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
 }`}
 >
 <LayoutGrid className="w-3.5 h-3.5"/>
 <span>Clean View</span>
 </button>
 <button
 onClick={() => setViewMode('table')}
 className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
 viewMode === 'table'
 ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
 : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
 }`}
 >
 <TableIcon className="w-3.5 h-3.5"/>
 <span>Table View</span>
 </button>
 </div>
 </div>
 </div>

 {/* Leads Content */}
 {filteredLeads.length === 0 ? (
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center space-y-4 shadow-sm">
 <div className="w-16 h-16 mx-auto rounded-3xl bg-[#FF5500]/10 border border-[#FF5500]/20 flex items-center justify-center text-[#FF5500]">
 <User className="w-8 h-8 text-[#FF5500]"/>
 </div>
 <div className="space-y-1">
 <h3 className="text-base font-bold text-zinc-900 dark:text-white">No New Leads Found</h3>
 {leads.length > 0 && (
 <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
 No leads match your search query.
 </p>
 )}
 </div>
 </div>
 ) : viewMode === 'clean' ? (
        /* CLEAN VIEW: 1 COLUMN HORIZONTAL ROW CARDS (STANDARDIZED WITH TODAY'S TASKS & SPREADSHEET VIEWS) */
        <div className="flex flex-col gap-3 w-full">
          {filteredLeads.map((lead) => {
            // Check if lead was created/added today
            const isToday = (() => {
              if (!lead.createdAt) return false;
              try {
                const d = new Date(lead.createdAt);
                if (isNaN(d.getTime())) return false;
                const now = new Date();
                return (
                  d.getDate() === now.getDate() &&
                  d.getMonth() === now.getMonth() &&
                  d.getFullYear() === now.getFullYear()
                );
              } catch (_) {
                return false;
              }
            })();

            return (
              <div
                key={lead.id}
                onClick={() => handleOpenLead(lead)}
                className={`group p-4 bg-white dark:bg-zinc-900 border rounded-2xl shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isToday
                    ? 'border-[#FF5500] hover:border-[#E64D00]'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-[#FF5500] dark:hover:border-[#FF5500]'
                }`}
              >
                {/* LEFT: Client Identity & Metadata Badges */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[#FF5500]/10 border border-[#FF5500]/20 flex items-center justify-center text-[#FF5500] shrink-0">
                    <User className="w-5 h-5 text-[#FF5500]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white group-hover:text-[#FF5500] transition-colors truncate">
                        {lead.clientName}
                      </h3>
                      {isToday && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#FF5500] text-white shadow-xs">
                          TODAY
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                      {getStatusBadge(lead.status)}
                      <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-semibold border border-zinc-200 dark:border-zinc-700">
                        {lead.leadSource || 'Angi'}
                      </span>
                      {lead.serviceNeeded && (
                        <span className="text-zinc-500 dark:text-zinc-400 text-xs truncate max-w-[200px]" title={lead.serviceNeeded}>
                          {lead.serviceNeeded}
                        </span>
                      )}
                      {lead.leadFee && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700">
                          {lead.leadFee.startsWith('$') ? lead.leadFee : `$${lead.leadFee}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT: Actions */}
                <div
                  className="flex items-center gap-2.5 shrink-0 self-end sm:self-center pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800/80 w-full sm:w-auto justify-between sm:justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Status Dropdown */}
                  <div className="relative inline-flex items-center w-[120px] shrink-0">
                    <select
                      value={lead.status || 'New'}
                      onChange={(e) => handleStatusChange(lead, e.target.value)}
                      disabled={updatingId === lead.id}
                      className="w-full px-2.5 py-1.5 pr-7 rounded-xl text-xs font-semibold bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-[#FF5500] cursor-pointer appearance-none disabled:opacity-50"
                      title="Update lead status"
                    >
                      {LEAD_STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white normal-case font-medium">
                          {st}
                        </option>
                      ))}
                    </select>
                    {updatingId === lead.id ? (
                      <Loader2 className="w-3 h-3 text-zinc-500 animate-spin absolute right-2 pointer-events-none" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-zinc-500 absolute right-2 pointer-events-none" />
                    )}
                  </div>

                  {renderHouzzAction(lead)}

                  {/* Schedule Appointment Action Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleScheduleLead(lead);
                    }}
                    className="w-[104px] justify-center px-3.5 py-2 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    title="Schedule client appointment"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span>Schedule</span>
                  </button>

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(lead);
                    }}
                    title="Delete lead"
                    className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
 /* TABLE VIEW (ALL INFO IN 1 ROW PER LEAD) */
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
 <div className="overflow-x-auto">
 <table className="w-full min-w-[1420px] table-fixed text-left border-collapse text-xs">
 <thead>
 <tr className="bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider border-b border-zinc-200 dark:border-zinc-800">
 <th className="w-[180px] py-3 px-4">Client Name</th>
 <th className="w-[145px] py-3 px-4">Phone</th>
 <th className="w-[210px] py-3 px-4">Email</th>
 <th className="w-[220px] py-3 px-4">Address</th>
 <th className="w-[190px] py-3 px-4">Service Needed</th>
 <th className="w-[90px] py-3 px-4">Lead Fee</th>
 <th className="w-[105px] py-3 px-4">Source</th>
 <th className="w-[165px] py-3 px-4">Created Date</th>
 <th className="w-[125px] py-3 px-4">Status</th>
 <th className="w-[330px] py-3 px-4 text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
 {filteredLeads.map((lead) => (
 <tr
                key={lead.id}
                onClick={() => handleOpenLead(lead)}
                className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
              >
 <td className="py-3 px-4 font-bold text-zinc-900 dark:text-white whitespace-nowrap">
 <div className="flex items-center gap-2.5">
 <div className="w-7 h-7 rounded-lg bg-[#FF5500]/10 border border-[#FF5500]/20 flex items-center justify-center text-[#FF5500] shrink-0">
 <User className="w-3.5 h-3.5 text-[#FF5500]" />
 </div>
 <span className="hover:text-[#FF5500] transition-colors">{lead.clientName}</span>
 </div>
 </td>
 <td className="py-3 px-4 whitespace-nowrap">{lead.clientPhone || '—'}</td>
 <td className="py-3 px-4 whitespace-nowrap">{lead.clientEmail || '—'}</td>
 <td className="py-3 px-4 max-w-[200px] truncate"title={lead.address}>{lead.address || '—'}</td>
 <td className="py-3 px-4 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{lead.serviceNeeded || '—'}</td>
 <td className="py-3 px-4 whitespace-nowrap font-semibold text-zinc-700 dark:text-zinc-300">
 {lead.leadFee ? (lead.leadFee.startsWith('$') ? lead.leadFee : `$${lead.leadFee}`) : '—'}
 </td>
 <td className="py-3 px-4 whitespace-nowrap">
 <div className="flex items-center gap-1.5">
 <span className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
 {lead.leadSource || 'Angi'}
 </span>
 </div>
 </td>
 <td className="py-3 px-4 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
 {formatLeadDate(lead.createdAt)}
 </td>
 <td className="py-3 px-4 whitespace-nowrap">
 <div className="relative inline-flex items-center w-full">
 <select
 value={lead.status || 'New'}
 onChange={(e) => handleStatusChange(lead, e.target.value)}
 disabled={updatingId === lead.id}
 className="w-full px-2.5 py-0.5 pr-6 rounded-full text-xs font-medium bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:border-[#FF5500] cursor-pointer appearance-none disabled:opacity-50"
 title="Click to edit status"
 >
 {LEAD_STATUS_OPTIONS.map((st) => (
 <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white normal-case font-medium">
 {st}
 </option>
 ))}
 </select>
 {updatingId === lead.id ? (
 <Loader2 className="w-2.5 h-2.5 text-zinc-500 animate-spin absolute right-1.5 pointer-events-none"/>
 ) : (
 <ChevronDown className="w-2.5 h-2.5 text-zinc-500 absolute right-1.5 pointer-events-none"/>
 )}
 </div>
 </td>
 <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                  {renderHouzzAction(lead, true)}
                  <button
                    type="button"
                    onClick={() => handleScheduleLead(lead)}
                    className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-lg text-xs font-bold transition-all shadow-2xs inline-flex items-center gap-1 cursor-pointer"
                    title="Schedule Appointment"
                  >
                    <CalendarClock className="w-3.5 h-3.5" />
                    <span>Schedule</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(lead)}
                    className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors inline-flex items-center cursor-pointer"
                    title="Delete Lead"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  </div>
                </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Edit Client Information Modal */}
 {editingLead && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 my-8">
 <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
 <div className="flex items-center gap-2.5">
 <div className="w-10 h-10 rounded-xl bg-[#FF5500]/10 text-[#FF5500] flex items-center justify-center">
 <Edit2 className="w-5 h-5"/>
 </div>
 <div>
 <h3 className="text-base font-black text-zinc-900 dark:text-white">Edit Client Information</h3>
 <p className="text-xs text-zinc-500 dark:text-zinc-400">Modify lead details across any status</p>
 </div>
 </div>
 <button
 onClick={() => setEditingLead(null)}
 className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
 >
 <X className="w-5 h-5"/>
 </button>
 </div>

 <form onSubmit={handleSaveEditSubmit} className="space-y-4">
 <div className="space-y-3">
 {/* Client Name */}
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Client Name *
 </label>
 <input
 type="text"
 required
 value={editFormData.clientName}
 onChange={(e) => setEditFormData({ ...editFormData, clientName: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white font-medium"
 placeholder="e.g. John Doe"
 />
 </div>

 {/* Phone & Email */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Phone Number
 </label>
 <input
 type="text"
 value={editFormData.clientPhone}
 onChange={(e) => setEditFormData({ ...editFormData, clientPhone: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white"
 placeholder="e.g. (555) 000-0000"
 />
 </div>
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Email Address
 </label>
 <input
 type="email"
 value={editFormData.clientEmail}
 onChange={(e) => setEditFormData({ ...editFormData, clientEmail: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white"
 placeholder="e.g. client@example.com"
 />
 </div>
 </div>

 {/* Address */}
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Street Address / Location
 </label>
 <input
 type="text"
 value={editFormData.address}
 onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white"
 placeholder="e.g. 123 Main St, Austin, TX"
 />
 </div>

 {/* Service Needed & Lead Fee */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Service Needed
 </label>
 <input
 type="text"
 value={editFormData.serviceNeeded}
 onChange={(e) => setEditFormData({ ...editFormData, serviceNeeded: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white"
 placeholder="e.g. Roof Inspection, HVAC Repair"
 />
 </div>
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Lead Fee ($)
 </label>
 <input
 type="text"
 value={editFormData.leadFee}
 onChange={(e) => setEditFormData({ ...editFormData, leadFee: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white"
 placeholder="e.g. 45.00"
 />
 </div>
 </div>

 {/* Source & Status */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Lead Source / Tab
 </label>
 <input
 type="text"
 value={editFormData.leadSource}
 onChange={(e) => setEditFormData({ ...editFormData, leadSource: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white"
 placeholder="e.g. Angi, Thumbtack, Website"
 />
 </div>
 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Status
 </label>
 <select
 value={editFormData.status}
 onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white font-bold"
 >
 {LEAD_STATUS_OPTIONS.map((st) => (
 <option key={st} value={st}>
 {st}
 </option>
 ))}
 </select>
 </div>
 </div>

 <div>
 <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-1">
 Notes & Details
 </label>
 <textarea
 rows={3}
 value={editFormData.notes}
 onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
 className="w-full px-3.5 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:border-[#FF5500] text-zinc-900 dark:text-white resize-none"
 placeholder="Any notes about this lead or project..."
 />
 </div>
 </div>

 {/* Action Buttons */}
 <div className="flex items-center gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
 <button
 type="button"
 onClick={() => setEditingLead(null)}
 disabled={isSavingEdit}
 className="flex-1 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isSavingEdit}
 className="flex-1 py-2.5 rounded-lg bg-[#FF5500] hover:bg-[#E64D00] text-white text-xs font-black shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
 >
 {isSavingEdit ? (
 <>
 <Loader2 className="w-3.5 h-3.5 animate-spin"/>
 <span>Saving Changes...</span>
 </>
 ) : (
 <>
 <Save className="w-3.5 h-3.5"/>
 <span>Save Changes</span>
 </>
 )}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}

 {/* Delete Confirmation Modal */}
 {leadToDelete && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
 <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
 <Trash2 className="w-6 h-6"/>
 </div>
 <div>
 <h3 className="text-base font-black text-zinc-900 dark:text-white">Delete Lead</h3>
 <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
 Are you sure you want to remove lead <span className="font-bold text-zinc-800 dark:text-zinc-200">"{leadToDelete.clientName}"</span> from New? Its spreadsheet record will be kept with status Deleted.
 </p>
 </div>
 <div className="flex items-center gap-2 pt-2">
 <button
 type="button"
 onClick={() => setLeadToDelete(null)}
 className="flex-1 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={confirmDeleteLead}
 className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
 >
 Delete Lead
 </button>
 </div>
 </div>
 </div>
 )}

       {/* Client Information Plate (LeadDrawer) */}
      <LeadDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        lead={selectedLeadForDrawer}
        onStatusChange={handleDrawerStatusChange}
        onLeadUpdate={handleDrawerLeadUpdate}
        statusOptions={LEAD_STATUS_OPTIONS}
        salespeople={config.salespeople}
      />

      {/* Webhook Diagnostics Modal */}
 <WebhookDiagnosticsModal
 isOpen={isWebhookDiagOpen}
 onClose={() => setIsWebhookDiagOpen(false)}
 onLeadCreated={refreshLocalLeads}
 />
 </div>
 );
};
