import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  Mail,
  MapPin,
  Tag,
  User,
  AlertCircle,
  CalendarClock,
  MessageSquare,
  Send,
  Edit2,
  Check,
  Loader2,
  Save,
} from 'lucide-react';
import { SheetRowRecord, updateLeadInSpreadsheet } from '../../lib/sheets';
import { formatPhoneNumber, getLeadActivities, addLeadActivity, LeadActivity, isMeetingScheduledStatus } from '../../lib/utils';
import { matchCalendarEventForLead, formatAppointmentDateTime } from '../../lib/calendar';
import { logAuditActivity } from '../../lib/activityLogger';
import { SalespersonOption } from '../../types';
import { loadAppConfig } from '../../config';
import { updateNewLeadInfo } from '../../lib/newLeads';

interface LeadDrawerProps {
  lead: SheetRowRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (row: SheetRowRecord, newStatus: string) => void;
  onLeadUpdate?: (updatedLead: SheetRowRecord) => Promise<void> | void;
  statusOptions: readonly string[];
  salespeople?: SalespersonOption[];
  calendarEvents?: any[];
}

export const LeadDrawer: React.FC<LeadDrawerProps> = ({
  lead,
  isOpen,
  onClose,
  onStatusChange,
  onLeadUpdate,
  statusOptions,
  salespeople = [],
  calendarEvents = [],
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'timeline' | 'edit'>('details');
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [newNote, setNewNote] = useState('');
  const [activityType, setActivityType] = useState<'note' | 'call' | 'text'>('note');

  // Editable fields state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editService, setEditService] = useState('');
  const [editSource, setEditSource] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editNextAction, setEditNextAction] = useState('');
  const [editNextActionDate, setEditNextActionDate] = useState('');
  const [editEstimateSentAt, setEditEstimateSentAt] = useState('');

  const leadKey = lead
    ? (lead as any).id || lead.clientPhone || lead.clientEmail || lead.clientName || `row_${lead.rowIndex}`
    : '';

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (lead) {
      setEditName(lead.clientName || '');
      setEditPhone(lead.clientPhone || '');
      setEditEmail(lead.clientEmail || '');
      setEditAddress(lead.address || '');
      setEditService(lead.serviceNeeded || lead.leadType || '');
      setEditSource(lead.leadSource || lead.tabName || 'Angi');
      setEditStatus(lead.status || 'New');
      setEditFee(lead.leadFee || '');
      setEditNotes(lead.notes || '');
      setEditOwner((lead as any).ownerName || (lead as any).salespersonName || '');
      setEditNextAction((lead as any).nextAction || '');
      setEditNextActionDate((lead as any).nextActionDate || '');
      setEditEstimateSentAt((lead as any).estimateSentAt ? new Date((lead as any).estimateSentAt).toISOString().split('T')[0] : '');
      setIsEditing(false);
      setSaveSuccess(false);
      setSaveError(null);
    }
    if (lead && leadKey) {
      setActivities(getLeadActivities(leadKey));
    }
  }, [lead, leadKey]);

  if (!lead) return null;

  const handleMoveToTrash = async () => {
    if (!window.confirm(`Move lead "${lead.clientName}" to Trash? You can restore it anytime from Settings / Trash.`)) {
      return;
    }
    try {
      setIsSaving(true);
      const res = await fetch('/api/trash/soft-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: {
            ...lead,
            id: (lead as any).id || `lead_${Date.now()}`,
          },
          deletedBy: 'Staff',
          reason: 'Moved to trash from lead drawer'
        })
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('dashboard_data_refresh'));
        window.dispatchEvent(new CustomEvent('new_leads_updated'));
        onClose();
      } else {
        const err = await res.json();
        setSaveError(err.error || 'Failed to move lead to trash.');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Error moving lead to trash.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClientInfo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editName.trim()) {
      setSaveError('Client name cannot be empty.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const config = loadAppConfig();
    const updatedRecord: SheetRowRecord = {
      ...lead,
      clientName: editName.trim(),
      clientPhone: editPhone.trim(),
      clientEmail: editEmail.trim(),
      address: editAddress.trim(),
      serviceNeeded: editService.trim(),
      leadType: editService.trim(),
      leadSource: editSource.trim(),
      tabName: lead.tabName || editSource.trim(),
      status: editStatus,
      leadFee: editFee.trim(),
      notes: editNotes.trim(),
    };

    try {
      // 1. If spreadsheet is configured, sync to Google Sheet
      if (config.spreadsheetId) {
        await updateLeadInSpreadsheet(undefined, config.spreadsheetId, {
          tabName: lead.tabName || editSource.trim(),
          rowIndex: lead.rowIndex,
          clientName: updatedRecord.clientName,
          clientPhone: updatedRecord.clientPhone,
          clientEmail: updatedRecord.clientEmail,
          address: updatedRecord.address,
          serviceNeeded: updatedRecord.serviceNeeded,
          leadFee: updatedRecord.leadFee,
          status: updatedRecord.status,
          carrier: updatedRecord.carrier,
          notes: updatedRecord.notes,
        });
      }

      // 2. Update in newLeads cache if applicable
      const leadId = (lead as any).id || `sync_new_${lead.rowIndex}_${(lead.clientName || '').replace(/\s+/g, '')}`;
      updateNewLeadInfo(leadId, {
        clientName: updatedRecord.clientName,
        clientPhone: updatedRecord.clientPhone,
        clientEmail: updatedRecord.clientEmail,
        address: updatedRecord.address,
        serviceNeeded: updatedRecord.serviceNeeded,
        leadSource: updatedRecord.leadSource,
        status: updatedRecord.status,
        leadFee: updatedRecord.leadFee,
        notes: updatedRecord.notes,
        rowIndex: lead.rowIndex,
      });

      // 3. Log audit activity
      logAuditActivity({
        actionType: 'update_lead',
        clientName: updatedRecord.clientName,
        clientPhone: updatedRecord.clientPhone,
        tabName: updatedRecord.tabName || updatedRecord.leadSource || 'Angi',
        details: `Updated client information for "${updatedRecord.clientName}" (${updatedRecord.status})`,
      });

      // 4. Callback to parent if provided
      if (onLeadUpdate) {
        await onLeadUpdate(updatedRecord);
      }

      // 5. If status changed, notify status change handler
      if (lead.status !== editStatus) {
        onStatusChange(updatedRecord, editStatus);
      }

      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Failed to update client info:', err);
      setSaveError(err.message || 'Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    const msg = newNote.trim();
    const updated = addLeadActivity(leadKey, {
      leadKey,
      type: activityType,
      message: msg,
    });
    setActivities(updated);

    logAuditActivity({
      actionType: activityType === 'call' ? 'call' : 'note',
      clientName: lead.clientName,
      clientPhone: lead.clientPhone,
      tabName: lead.tabName || lead.leadSource,
      details: `Added note on "${lead.clientName || 'Lead'}": "${msg}"`,
    });

    setNewNote('');
  };

  const inputClass = "w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#FF5500] dark:focus:border-[#FF5500] rounded-xl px-3.5 py-2 text-sm text-zinc-900 dark:text-white font-medium outline-none transition-colors placeholder-zinc-400";

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between bg-zinc-50 dark:bg-zinc-950">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-[#FF5500]/15 border border-[#FF5500]/30 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-[#FF5500]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate">
                  {isEditing ? (editName || 'Edit Client') : (lead.clientName || 'Unnamed Client')}
                </h2>
                {saveSuccess && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-700 dark:hover:text-white bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-lg transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-900/50">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              activeTab === 'details'
                ? 'text-[#FF5500] border-b-2 border-[#FF5500] font-black'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            {isEditing ? 'Edit Information' : 'Client Details'}
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
              activeTab === 'timeline'
                ? 'text-[#FF5500] border-b-2 border-[#FF5500] font-black'
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            Activity Timeline
          </button>
        </div>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-800 scrollbar-track-transparent">
          {saveError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* EDIT FORM (Whenever user chooses to edit, regardless of status) */}
          {isEditing ? (
            <form onSubmit={handleSaveClientInfo} className="space-y-4">
              {/* Client Name */}
              <div>
                <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Client Full Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. John Doe"
                  required
                  className={inputClass}
                />
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="client@example.com"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Address */}
              <div>
                <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Property Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Street, City, State, ZIP"
                  className={inputClass}
                />
              </div>

              {/* Status & Service Needed */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Status (Any Stage)</label>
                  <select
                    value={editStatus}
                    onChange={(e) => {
                      const nextVal = e.target.value;
                      setEditStatus(nextVal);
                      if (nextVal.toLowerCase().includes("estimate sent") && !editEstimateSentAt) {
                        setEditEstimateSentAt(new Date().toISOString().split("T")[0]);
                      }
                    }}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#FF5500] dark:focus:border-[#FF5500] rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white font-bold outline-none cursor-pointer"
                  >
                    {statusOptions.map((st) => (
                      <option key={st} value={st} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-medium">
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Service Needed</label>
                  <input
                    type="text"
                    value={editService}
                    onChange={(e) => setEditService(e.target.value)}
                    placeholder="e.g. Roofing, Siding"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Assigned Rep & Estimate Sent Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Assigned Rep</label>
                  <select
                    value={editOwner}
                    onChange={(e) => setEditOwner(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#FF5500] dark:focus:border-[#FF5500] rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-white font-semibold outline-none cursor-pointer"
                  >
                    <option value="">Unassigned</option>
                    {salespeople?.map((sp) => (
                      <option key={sp.code} value={sp.name || sp.code}>
                        {sp.name || sp.code} ({sp.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Estimate Sent Date</label>
                  <input
                    type="date"
                    value={editEstimateSentAt}
                    onChange={(e) => setEditEstimateSentAt(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Next Action & Next Action Due */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Next Action</label>
                  <input
                    type="text"
                    value={editNextAction}
                    onChange={(e) => setEditNextAction(e.target.value)}
                    placeholder="e.g. Call to confirm scope"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Next Action Due</label>
                  <input
                    type="date"
                    value={editNextActionDate}
                    onChange={(e) => setEditNextActionDate(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Lead Source & Lead Fee */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Lead Source</label>
                  <input
                    type="text"
                    value={editSource}
                    onChange={(e) => setEditSource(e.target.value)}
                    placeholder="Angi, Thumbtack, Direct"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Lead Fee ($)</label>
                  <input
                    type="text"
                    value={editFee}
                    onChange={(e) => setEditFee(e.target.value)}
                    placeholder="$0.00"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-400 block mb-1">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={3}
                  placeholder="Add details, project scope, client preferences..."
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 focus:border-[#FF5500] dark:focus:border-[#FF5500] rounded-xl p-3 text-sm text-zinc-900 dark:text-white font-medium outline-none resize-none transition-colors placeholder-zinc-400"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleMoveToTrash}
                  disabled={isSaving}
                  className="px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Move to Trash
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-transparent border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          ) : activeTab === 'details' ? (
            <div className="space-y-6">
              {/* ACTION BAR: Quick Status Change */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-black uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">Current Status</label>
                </div>
                <select
                  value={lead.status || 'New'}
                  onChange={(e) => onStatusChange(lead, e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-white font-bold rounded-xl py-2.5 px-4 focus:ring-2 focus:ring-[#FF5500]/50 outline-none cursor-pointer"
                >
                  {statusOptions.map((opt) => (
                    <option key={opt} value={opt} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white font-semibold py-1">
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Google Calendar Appointment Date & Time */}
              {(() => {
                const config = loadAppConfig();
                const match = matchCalendarEventForLead(lead.clientName, lead.clientPhone, lead.clientEmail, calendarEvents, config);
                const apptDate = match?.formData.appointmentDate || lead.appointmentDate;
                const apptStart = match?.formData.startTime || lead.startTime;
                const apptEnd = match?.formData.endTime || lead.endTime;
                const formattedAppt = formatAppointmentDateTime(apptDate, apptStart, apptEnd);

                if (formattedAppt || isMeetingScheduledStatus(lead.status)) {
                  return (
                    <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl space-y-2 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CalendarClock className="w-5 h-5 text-[#FF5500] shrink-0" />
                          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white">Appointments</h3>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Synced
                        </span>
                      </div>
                      <div className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white">
                        {formattedAppt || 'Appointment Scheduled in Google Calendar'}
                      </div>
                      {match?.formData.salespersonCode && (
                        <div className="text-xs text-zinc-600 dark:text-zinc-300">
                          <strong className="text-zinc-500 dark:text-zinc-400">Assigned Salesperson:</strong> <span className="text-zinc-900 dark:text-white font-bold">{match.formData.salespersonCode}</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Contact Info */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Contact</h3>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-2 space-y-1">
                  <a href={`tel:${lead.clientPhone}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-950 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-800">
                      <Phone className="w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-transform" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-zinc-800 dark:text-zinc-200 font-semibold text-sm block truncate">
                        {formatPhoneNumber(lead.clientPhone || '') || 'No Phone Provided'}
                      </span>
                      {lead.carrier && (
                        <span className="text-[10px] text-[#FF5500] font-bold uppercase tracking-wider block mt-0.5">
                          Carrier: {lead.carrier}
                        </span>
                      )}
                    </div>
                  </a>
                  <a href={`mailto:${lead.clientEmail}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-950 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-800">
                      <Mail className="w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-transform" />
                    </div>
                    <span className="text-zinc-800 dark:text-zinc-200 font-semibold text-sm break-all">
                      {lead.clientEmail || 'No Email Provided'}
                    </span>
                  </a>
                  <a
                    href={lead.address ? `https://maps.google.com/?q=${encodeURIComponent(lead.address)}` : '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-950 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-800">
                      <MapPin className="w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-transform" />
                    </div>
                    <span className="text-zinc-800 dark:text-zinc-200 font-semibold text-sm leading-tight">
                      {lead.address || 'No Address Provided'}
                    </span>
                  </a>
                </div>
              </div>

              {/* Job Details */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2.5">Project</h3>
                <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3.5 text-sm">
                  <div className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800/60 pb-3">
                    <span className="text-zinc-500 dark:text-zinc-400">Service Needed</span>
                    <span className="text-zinc-800 dark:text-zinc-100 font-bold bg-zinc-200 dark:bg-zinc-800 px-2.5 py-1 rounded-md text-xs">
                      {lead.serviceNeeded || lead.leadType || '-'}
                    </span>
                  </div>
                  {lead.leadFee && (
                    <div className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800/60 pb-3">
                      <span className="text-zinc-500 dark:text-zinc-400">Lead Fee</span>
                      <span className="text-zinc-800 dark:text-zinc-100 font-bold text-xs">{lead.leadFee}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center border-b border-zinc-200 dark:border-zinc-800/60 pb-3">
                    <span className="text-zinc-500 dark:text-zinc-400">Source</span>
                    <span className="text-zinc-800 dark:text-zinc-100 font-semibold">{lead.leadSource || lead.tabName || '-'}</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-zinc-500 dark:text-zinc-400 block mb-2 text-xs font-semibold">Notes</span>
                    <p className="text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {lead.notes || 'No notes provided for this lead.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Edit Button CTA */}
              <button
                onClick={() => setIsEditing(true)}
                className="w-full py-3 bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 hover:border-[#FF5500] dark:hover:border-[#FF5500] text-zinc-900 dark:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Edit2 className="w-4 h-4 text-[#FF5500]" />
                <span>Edit All Client Information</span>
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Custom Note Logger */}
              <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4">
                <form onSubmit={handleAddActivity} className="space-y-3">
                  <div className="flex gap-2 mb-2">
                    {(["note", "call", "text"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setActivityType(t)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                          activityType === t
                            ? "bg-[#FF5500] text-white"
                            : "bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white border border-zinc-200 dark:border-zinc-800"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Type activity note or update details..."
                      rows={3}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/40 resize-none"
                    />
                    <button
                      type="submit"
                      disabled={!newNote.trim()}
                      className="absolute bottom-3 right-3 p-1.5 bg-[#FF5500] text-white rounded-lg hover:bg-[#E64D00] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>

              {/* Activity Timeline Feed */}
              <div className="relative pl-6 border-l-2 border-zinc-200 dark:border-zinc-800 space-y-6 py-2">
                {/* Lead Created Event */}
                <div className="relative">
                  <div className="absolute -left-[35px] top-0 w-8 h-8 rounded-full bg-white dark:bg-zinc-900 border-2 border-[#FF5500] flex items-center justify-center">
                    <CalendarClock className="w-3.5 h-3.5 text-[#FF5500]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      {lead.timestamp ? new Date(lead.timestamp).toLocaleDateString() : "Original Date"}
                    </span>
                    <h4 className="text-zinc-900 dark:text-zinc-200 font-bold text-sm mt-0.5">Lead Created</h4>
                    <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-1">
                      Lead originated from <strong>{lead.leadSource || "Manual Entry"}</strong>.
                    </p>
                  </div>
                </div>

                {/* Logged Activities */}
                {activities.map((act) => (
                  <div key={act.id} className="relative">
                    <div className="absolute -left-[35px] top-0 w-8 h-8 rounded-full bg-white dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-700 flex items-center justify-center">
                      {act.type === "call" && <Phone className="w-3.5 h-3.5 text-zinc-700 dark:text-white" />}
                      {act.type === "text" && <MessageSquare className="w-3.5 h-3.5 text-zinc-700 dark:text-white" />}
                      {act.type === "meeting" && <MapPin className="w-3.5 h-3.5 text-[#FF5500]" />}
                      {act.type === "note" && <Tag className="w-3.5 h-3.5 text-zinc-700 dark:text-white" />}
                      {act.type === "status_change" && <AlertCircle className="w-3.5 h-3.5 text-zinc-700 dark:text-white" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          {new Date(act.timestamp).toLocaleString()}
                        </span>
                        <span className="text-xs font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                          {act.type}
                        </span>
                      </div>
                      <p className="text-zinc-800 dark:text-zinc-200 text-sm mt-1 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 leading-relaxed">
                        {act.message}
                      </p>
                    </div>
                  </div>
                ))}

                {activities.length === 0 && (
                  <div className="relative opacity-60">
                    <div className="absolute -left-[35px] top-0 w-8 h-8 rounded-full bg-white dark:bg-zinc-900 border-2 border-zinc-300 dark:border-zinc-800 flex items-center justify-center">
                      <AlertCircle className="w-3.5 h-3.5 text-zinc-600 dark:text-white" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">No Custom Activity Logged</span>
                      <p className="text-zinc-500 text-xs mt-1">Use the form above to log activity notes.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
