import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
 CalendarClock,
 CalendarCheck,
 Search,
 Plus,
 Phone,
 Mail,
 MapPin,
 Clock,
 Calendar,
 ExternalLink,
 ChevronDown,
 ChevronUp,
 User,
 Tag,
 CheckCircle2,
 Trash2,
 Edit3,
 Copy,
 Check,
 Send,
 Layers,
 Filter,
 Share2,
 ShieldCheck,
 AlertCircle,
 LayoutGrid,
 Table as TableIcon,
 RefreshCw
} from 'lucide-react';
import {
 ScheduledClientRecord,
 getScheduledClients,
 saveScheduledClientsList,
 addOrUpdateScheduledClient,
 updateScheduledClientStatus,
 updateScheduledClientSalesperson,
 deleteScheduledClient,
 subscribeScheduledClients,
 sortScheduledClientsNewestFirst
} from '../lib/scheduledClients';
import { useUser } from '../lib/userContext';
import { AppConfig, AppointmentFormData, LEAD_STATUS_OPTIONS } from '../types';
import { loadAppConfig, saveAppConfig, DEFAULT_LEAD_SOURCES, isLeadSourceTab } from '../config';
import { formatPhoneNumber, isMeetingScheduledStatus } from '../lib/utils';
import { buildEventPayload, createGoogleCalendarEvent, fetchGoogleCalendarEvents, getCachedCalendarEvents, matchCalendarEventForLead, parseCalendarEventToFormData, formatTime12Hour, formatAppointmentDateTime, formatAppointmentDateNice, getCalendarSyncStatus, CalendarSyncStatus } from '../lib/calendar';
import { appendAppointmentToSheet, updateLeadStatusInSpreadsheet, readAllSpreadsheetTabs, getSpreadsheetDetails, invalidateSpreadsheetCache } from '../lib/sheets';
import { sendLeadToHouzzPro } from '../lib/houzz';

const CALENDAR_STATUS_OVERRIDES_KEY = 'mrcontract_calendar_status_overrides';

function getCalendarStatusOverride(eventId?: string): string {
 if (!eventId) return '';
 try {
  const saved = JSON.parse(localStorage.getItem(CALENDAR_STATUS_OVERRIDES_KEY) || '{}');
  return typeof saved[eventId] === 'string' ? saved[eventId] : '';
 } catch {
  return '';
 }
}

function saveCalendarStatusOverride(eventId: string | undefined, status: string): void {
 if (!eventId) return;
 try {
  const saved = JSON.parse(localStorage.getItem(CALENDAR_STATUS_OVERRIDES_KEY) || '{}');
  saved[eventId] = status;
  localStorage.setItem(CALENDAR_STATUS_OVERRIDES_KEY, JSON.stringify(saved));
 } catch {}
}

export const ScheduledClientPage: React.FC = () => {
 const navigate = useNavigate();
 const { users } = useUser();
 const [config] = useState<AppConfig>(loadAppConfig);
 const [calendarEvents, setCalendarEvents] = useState<any[]>(getCachedCalendarEvents);
 const [scheduledClients, setScheduledClients] = useState<ScheduledClientRecord[]>(() => getScheduledClients(getCachedCalendarEvents()));
 const [searchQuery, setSearchQuery] = useState('');
 const [statusFilter, setStatusFilter] = useState<string>('ALL');
 const [salespersonFilter, setSalespersonFilter] = useState<string>('ALL');
 const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
 const [viewMode, setViewMode] = useState<'clean' | 'table'>('clean');
 const [copiedField, setCopiedField] = useState<string | null>(null);
 const [isSyncing, setIsSyncing] = useState(false);
 const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
 const [calSyncStatus, setCalSyncStatus] = useState<CalendarSyncStatus>(getCalendarSyncStatus);

 // Salesperson directory options from config only (excluding workers/users)
  const representativeOptions = useMemo(() => {
    const list: { code: string; name: string }[] = [];
    const seenCodes = new Set<string>();

    (config.salespeople || []).forEach((sp) => {
      if (sp.code && !seenCodes.has(sp.code.toUpperCase())) {
        seenCodes.add(sp.code.toUpperCase());
        list.push({ code: sp.code, name: sp.name });
      }
    });

    return list;
  }, [config.salespeople]);

 // Fetch Google Calendar events to populate exact appointment dates & times
 const loadCalendarEvents = async (showToast = false) => {
 setIsSyncingCalendar(true);
 try {
 const events = await fetchGoogleCalendarEvents(config.calendarId);
 setCalendarEvents(events);
 setScheduledClients(getScheduledClients(events));
 const freshStatus = getCalendarSyncStatus();
 setCalSyncStatus(freshStatus);

 if (showToast) {
 if (freshStatus.status === 'error') {
 setErrorMessage(freshStatus.error || 'Failed to sync Google Calendar.');
 setTimeout(() => setErrorMessage(null), 5000);
 } else {
 setSuccessMessage("Calendar synced");
 setTimeout(() => setSuccessMessage(null), 3500);
 }
 }
 } catch (err: any) {
 console.warn('Google Calendar load notice:', err);
 const freshStatus = getCalendarSyncStatus();
 setCalSyncStatus(freshStatus);
 if (showToast) {
 setErrorMessage(err.message || 'Failed to sync Google Calendar.');
 setTimeout(() => setErrorMessage(null), 4000);
 }
 } finally {
 setIsSyncingCalendar(false);
 }
 };

 useEffect(() => {
 let isMounted = true;
 loadCalendarEvents();

 const handleAuthChange = () => {
 if (isMounted) loadCalendarEvents();
 };

 const handleCalendarEventsUpdated = (e: any) => {
 if (isMounted) {
 const freshEvents = (e.detail && Array.isArray(e.detail)) ? e.detail : getCachedCalendarEvents();
 setCalendarEvents(freshEvents);
 setScheduledClients(getScheduledClients(freshEvents));
 setCalSyncStatus(getCalendarSyncStatus());
 }
 };

 const handleSyncStatusChange = (e: any) => {
 if (isMounted && e.detail) {
 setCalSyncStatus(e.detail);
 }
 };

 window.addEventListener('google_auth_updated', handleAuthChange);
 window.addEventListener('dashboard_data_refresh', handleAuthChange);
 window.addEventListener('calendar_events_updated', handleCalendarEventsUpdated);
 window.addEventListener('calendar_sync_status_changed', handleSyncStatusChange);

 return () => {
 isMounted = false;
 window.removeEventListener('google_auth_updated', handleAuthChange);
 window.removeEventListener('dashboard_data_refresh', handleAuthChange);
 window.removeEventListener('calendar_events_updated', handleCalendarEventsUpdated);
 window.removeEventListener('calendar_sync_status_changed', handleSyncStatusChange);
 };
 }, []);

 // Enrich scheduled clients list with Google Calendar exact dates & times when matched
	// Enrich scheduled clients list with Google Calendar exact dates, times, and salesperson assignments
	const enrichedScheduledClients = useMemo(() => {
		const normalizeRep = (codeOrName?: string): { code: string; name: string } => {
			if (!codeOrName) return { code: '', name: '' };
			const trimmed = codeOrName.trim();
			const matched = config?.salespeople?.find(
				(s) =>
					s.code.toUpperCase() === trimmed.toUpperCase() ||
					s.name.toLowerCase().includes(trimmed.toLowerCase()) ||
					trimmed.toLowerCase().includes(s.name.toLowerCase())
			);
			if (matched) {
				return { code: matched.code, name: matched.name };
			}
			return { code: trimmed.toUpperCase(), name: trimmed };
		};

		const updated = (scheduledClients || []).map((client) => {
			const matched = calendarEvents && calendarEvents.length > 0
				? matchCalendarEventForLead(
						client.clientName,
						client.clientPhone,
						client.clientEmail,
						calendarEvents,
						config,
						client.address,
						client.calendarEventId
				  )
				: null;

			let repCode = client.salespersonCode || '';
			let repName = client.salespersonName || '';

			if (matched && matched.formData) {
				if (!repCode && matched.formData.salespersonCode) {
					repCode = matched.formData.salespersonCode;
				}
				if (!repName && matched.formData.salespersonName) {
					repName = matched.formData.salespersonName;
				}
			}

			if (!repCode) {
				const scanText = `${client.clientName || ''} ${client.notes || ''} ${client.serviceNeeded || ''}`;
				const codeMatch = scanText.match(/(?:[-–—:]\s*|\(|\b)(DG|SB|DK|JR|JC|EP)\b/i);
				if (codeMatch && codeMatch[1]) {
					repCode = codeMatch[1].toUpperCase();
				}
			}

			const resolved = normalizeRep(repCode || repName);

			return {
				...client,
				appointmentDate: matched?.formData?.appointmentDate || client.appointmentDate,
				startTime: matched?.formData?.startTime || client.startTime,
				endTime: matched?.formData?.endTime || client.endTime,
				notes: matched?.formData?.notes || client.notes,
				salespersonCode: resolved.code,
				salespersonName: resolved.name,
				calendarEventId: matched?.event?.id || client.calendarEventId,
				calendarHtmlLink: matched?.event?.htmlLink || client.calendarHtmlLink,
			};
		});

		// Also include calendar-only events so that appointments on Google Calendar are rendered
		const matchedEventIds = new Set<string>();
		updated.forEach((c) => {
			if (c.calendarEventId) matchedEventIds.add(c.calendarEventId);
		});

		const calendarOnlyRecords: ScheduledClientRecord[] = [];
		if (calendarEvents && Array.isArray(calendarEvents)) {
			calendarEvents.forEach((event, eIdx) => {
				if (!event || event.status === 'cancelled') return;
				if (event.id && matchedEventIds.has(event.id)) return;

				const { formData } = parseCalendarEventToFormData(event, config);
				const movedStatus = getCalendarStatusOverride(event.id);
				if (
					movedStatus &&
					!isMeetingScheduledStatus(movedStatus, formData.leadSource || 'Google Calendar')
				) return;
				if (formData.clientName && formData.clientName.trim() && !/^(interview|assistant|meeting|call)/i.test(formData.clientName)) {
					const resolved = normalizeRep(formData.salespersonCode || formData.salespersonName);
					calendarOnlyRecords.push({
						id: `gcal_${event.id || eIdx}`,
						createdAt: event.created || new Date().toISOString(),
						clientName: formData.clientName,
						clientPhone: formData.clientPhone || '',
						clientEmail: formData.clientEmail || '',
						address: formData.address || '',
						serviceNeeded: formData.serviceNeeded || 'Service details needed',
						appointmentDate: formData.appointmentDate,
						startTime: formData.startTime,
						endTime: formData.endTime,
						salespersonCode: resolved.code,
						salespersonName: resolved.name,
						leadSource: formData.leadSource || 'Google Calendar',
						leadType: formData.leadType || 'Direct',
						notes: formData.notes || '',
						status: 'Meeting Scheduled',
						calendarEventId: event.id,
						calendarHtmlLink: event.htmlLink,
						origin: 'gcal_sync',
					});
				}
			});
		}

		const combined = [...updated, ...calendarOnlyRecords];
		const seenIds = new Set<string>();
		const deduplicatedResult: ScheduledClientRecord[] = [];

		combined.forEach((c, idx) => {
			let uniqueId = c.id;
			if (!uniqueId || seenIds.has(uniqueId)) {
				uniqueId = `${c.id || 'client'}_${idx}_${Math.random().toString(36).substring(2, 5)}`;
			}
			seenIds.add(uniqueId);
			deduplicatedResult.push({
				...c,
				id: uniqueId,
			});
		});

		return sortScheduledClientsNewestFirst(deduplicatedResult);
	}, [scheduledClients, calendarEvents, config]);

 // Quick Schedule Modal state
 const [isModalOpen, setIsModalOpen] = useState(false);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [errorMessage, setErrorMessage] = useState<string | null>(null);
 const [successMessage, setSuccessMessage] = useState<string | null>(null);

 // Editing state
 const [editingClient, setEditingClient] = useState<ScheduledClientRecord | null>(null);
 const [clientToDelete, setClientToDelete] = useState<{ id: string; name: string } | null>(null);

 // New Client Form state
 const [formData, setFormData] = useState<AppointmentFormData>({
 clientName: '',
 clientPhone: '',
 clientEmail: '',
 address: '',
 serviceNeeded: 'Brick Masonry Restoration',
 leadSource: config.leadSources[0] || 'Web Portal',
 leadType: config.leadTypes[0] || 'Direct',
 appointmentDate: new Date().toISOString().split('T')[0],
 startTime: '09:00',
 endTime: '10:00',
 salespersonCode: '',
 notes: '',
 });

 // Sync scheduled clients directly from Google Sheets tabs
 const syncFromSheets = async (showToast = false) => {
 if (!config.spreadsheetId) return;
 setIsSyncing(true);
 try {
 let allTabs = (config.leadSources && config.leadSources.length > 0 ? config.leadSources : DEFAULT_LEAD_SOURCES).filter(isLeadSourceTab);
 try {
 const details = await getSpreadsheetDetails(undefined, config.spreadsheetId!);
 if (details.sheets && details.sheets.length > 0) {
 const discovered = details.sheets.map((s) => s.title).filter(isLeadSourceTab);
 allTabs = Array.from(new Set([...allTabs, ...discovered]));
 }
 } catch (_) {}

 const allData = await readAllSpreadsheetTabs(undefined, config.spreadsheetId!, allTabs, true);
 if (allData && allData.rows) {
 try {
 localStorage.setItem(`mrcontract_cache_${config.spreadsheetId}_ALL`, JSON.stringify(allData));
 } catch (e) {}
 window.dispatchEvent(new CustomEvent('mrcontract_data_synced', { detail: allData.rows }));
 }
 setScheduledClients(getScheduledClients());
 if (showToast) {
 setSuccessMessage('Updated');
 setTimeout(() => setSuccessMessage(null), 3000);
 }
 } catch (e: any) {
 console.warn('Scheduled clients sheet sync notice:', e);
 } finally {
 setIsSyncing(false);
 }
 };

 // Subscribe to updates from other pages and live sync on mount
 useEffect(() => {
 const unsubscribe = subscribeScheduledClients((list) => {
 setScheduledClients(list);
 });
 const handleSyncEvent = () => {
 setScheduledClients(getScheduledClients());
 };
 window.addEventListener('mrcontract_data_synced', handleSyncEvent);
 window.addEventListener('storage', handleSyncEvent);

 // Initial background sync
 syncFromSheets(false);

 return () => {
 unsubscribe();
 window.removeEventListener('mrcontract_data_synced', handleSyncEvent);
 window.removeEventListener('storage', handleSyncEvent);
 };
 }, []);

 // Expand / Collapse Helpers
 const toggleExpand = (id: string) => {
 setExpandedIds((prev) => {
 const next = new Set(prev);
 if (next.has(id)) {
 next.delete(id);
 } else {
 next.add(id);
 }
 return next;
 });
 };

 const expandAll = () => {
 setExpandedIds(new Set(scheduledClients.map((c) => c.id)));
 };

 const collapseAll = () => {
 setExpandedIds(new Set());
 };

 const handleCopy = (text: string, fieldKey: string) => {
 navigator.clipboard.writeText(text);
 setCopiedField(fieldKey);
 setTimeout(() => setCopiedField(null), 2000);
 };

 // Open Quick Schedule Modal
 const openNewModal = () => {
 setEditingClient(null);
 setFormData({
 clientName: '',
 clientPhone: '',
 clientEmail: '',
 address: '',
 serviceNeeded: 'Brick Masonry Restoration',
 leadSource: config.leadSources[0] || 'Web Portal',
 leadType: config.leadTypes[0] || 'Direct',
 appointmentDate: new Date().toISOString().split('T')[0],
 startTime: '09:00',
 endTime: '10:00',
 salespersonCode: '',
 notes: '',
 });
 setErrorMessage(null);
 setIsModalOpen(true);
 };

 // Open Edit Modal
 const openEditModal = (client: ScheduledClientRecord) => {
 setEditingClient(client);
 setFormData({
 clientName: client.clientName,
 clientPhone: client.clientPhone,
 clientEmail: client.clientEmail,
 address: client.address,
 serviceNeeded: client.serviceNeeded,
 leadSource: client.leadSource || 'Web Portal',
 leadType: client.leadType || 'Direct',
 appointmentDate: client.appointmentDate,
 startTime: client.startTime,
 endTime: client.endTime,
 salespersonCode: client.salespersonCode || '',
 notes: client.notes,
 status: client.status,
 });
 setErrorMessage(null);
 setIsModalOpen(true);
 };

 // Submit Schedule Form
 const handleSubmitSchedule = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!formData.clientName.trim()) {
 setErrorMessage('Client Name is required.');
 return;
 }
 if (!formData.appointmentDate || !formData.startTime) {
 setErrorMessage('Appointment Date and Start Time are required.');
 return;
 }

 setIsSubmitting(true);
 setErrorMessage(null);

 try {
 let calResult = null;
 // Publish to Google Calendar
 try {
 const payload = buildEventPayload(formData, config);
 calResult = await createGoogleCalendarEvent(payload, config.calendarId);
 } catch (calErr: any) {
 console.warn('Google Calendar sync notice:', calErr);
 if (calErr?.message?.includes('already has an appointment')) {
 setErrorMessage('This salesperson already has an appointment at this time.');
 setIsSubmitting(false);
 return;
 }
 }

 // Sync to Google Sheets if configured
 let sheetOk = false;
 if (config.spreadsheetId) {
 try {
 await appendAppointmentToSheet(
 undefined,
 config.spreadsheetId!,
 config.sheetTabName || 'Appointments',
 formData,
 formData.status || 'Meeting Scheduled'
 );
 sheetOk = true;
 } catch (sheetErr) {
 console.warn('Google Sheets append notice:', sheetErr);
 }
 }

 const matchedSalesperson = representativeOptions.find((s) => s.code === formData.salespersonCode);
 const saved = addOrUpdateScheduledClient(
 formData,
 calResult,
 editingClient?.id || null,
 {
 status: formData.status || 'Meeting Scheduled',
 sheetSynced: sheetOk,
 salespersonName: matchedSalesperson?.name || formData.salespersonCode,
 }
 );

 if (formData.salespersonCode !== undefined) {
 updateScheduledClientSalesperson(
 saved.id,
 formData.salespersonCode,
 matchedSalesperson?.name || formData.salespersonCode,
 saved.clientName,
 saved.leadSource,
 saved.rowIndex
 );
 }

 // Auto-expand the newly created/updated card
 setExpandedIds((prev) => new Set([...prev, saved.id]));
 setIsModalOpen(false);
 setSuccessMessage(
 editingClient
 ? `Updated scheduled client"${saved.clientName}"!`
 :"Appointment scheduled"
 );
 setTimeout(() => setSuccessMessage(null), 4000);
 } catch (err: any) {
 console.error('Failed to schedule client:', err);
 setErrorMessage(err.message || 'Failed to schedule client.');
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleDelete = (id: string, name: string) => {
 setClientToDelete({ id, name });
 };

 const confirmDeleteClient = () => {
 if (!clientToDelete) return;
 const { id, name } = clientToDelete;
 setClientToDelete(null);
 deleteScheduledClient(id);
 setScheduledClients(getScheduledClients());
 setSuccessMessage("Client removed");
 setTimeout(() => setSuccessMessage(null), 3000);
 };

 const handleStatusChange = async (target: ScheduledClientRecord, newStatus: string) => {
 if (!target || target.status === newStatus) return;

 try {
 if (!config.spreadsheetId) {
 throw new Error('Google Sheets is not configured, so this lead cannot be moved to another status.');
 }

 const sourceTab = (
 target.leadSource &&
 target.leadSource.trim().toLowerCase() !== 'google calendar'
 ? target.leadSource
 : config.sheetTabName || 'Angi'
 ).trim();

 const updatedExistingRow = await updateLeadStatusInSpreadsheet(
 undefined,
 config.spreadsheetId,
 {
 clientName: target.clientName,
 clientPhone: target.clientPhone,
 clientEmail: target.clientEmail,
 tabName: sourceTab,
 rowIndex: target.rowIndex,
 statusColIndex: target.statusColIndex,
 },
 newStatus
 );

 // Calendar-only appointments do not always have a lead row yet. Create one
 // with the selected status so it is visible in the matching CRM section.
 if (!updatedExistingRow) {
 await appendAppointmentToSheet(
 undefined,
 config.spreadsheetId,
 sourceTab,
 {
 clientName: target.clientName,
 clientPhone: target.clientPhone,
 clientEmail: target.clientEmail,
 address: target.address,
 serviceNeeded: target.serviceNeeded,
 leadSource: sourceTab,
 leadType: target.leadType || target.serviceNeeded || 'Direct',
 appointmentDate: target.appointmentDate,
 startTime: target.startTime,
 endTime: target.endTime,
 salespersonCode: target.salespersonCode || '',
 salespersonName: target.salespersonName,
 notes: target.notes,
 },
 newStatus
 );
 }

 const remainsScheduled = isMeetingScheduledStatus(newStatus, sourceTab);
 updateScheduledClientStatus(target.id, newStatus);
 if (!remainsScheduled) {
 saveCalendarStatusOverride(target.calendarEventId, newStatus);
 deleteScheduledClient(target.id);
 setScheduledClients((current) => current.filter((client) => client.id !== target.id));
 } else {
 setScheduledClients((current) =>
 current.map((client) => (client.id === target.id ? { ...client, status: newStatus } : client))
 );
 }

 // Preserve current cached leads and send the confirmed update to the sidebar,
 // instead of clearing all badges before the next full Sheets refresh.
 window.dispatchEvent(new CustomEvent('mrcontract_data_synced', {
 detail: [{ ...target, leadSource: sourceTab, status: newStatus }]
 }));
 setSuccessMessage(`Moved to ${newStatus}`);
 } catch (e: any) {
 console.warn('Could not move scheduled lead to the selected status:', e);
 setSuccessMessage(e.message || 'Unable to move this lead. Please try again.');
 } finally {
 setTimeout(() => setSuccessMessage(null), 4500);
 }
 };

 // Quick representative change with local + server persistence
 const handleSalespersonChange = (client: ScheduledClientRecord, newCode: string) => {
 const matchedRep = representativeOptions.find((r) => r.code === newCode);
 const repName = matchedRep ? matchedRep.name : newCode;

 updateScheduledClientSalesperson(
 client.id,
 newCode,
 repName,
 client.clientName,
 client.leadSource,
 client.rowIndex
 );

 setScheduledClients(getScheduledClients());
 setSuccessMessage('Representative updated');
 setTimeout(() => setSuccessMessage(null), 3000);
 };

 // Filter & Search
 const filteredClients = useMemo(() => {
 return enrichedScheduledClients.filter((client) => {
 const q = searchQuery.toLowerCase().trim();
 const matchesSearch =
 !q ||
 client.clientName.toLowerCase().includes(q) ||
 client.clientPhone.toLowerCase().includes(q) ||
 client.clientEmail.toLowerCase().includes(q) ||
 client.address.toLowerCase().includes(q) ||
 client.serviceNeeded.toLowerCase().includes(q) ||
 client.notes.toLowerCase().includes(q) ||
 client.salespersonCode.toLowerCase().includes(q);

 const matchesStatus =
 statusFilter === 'ALL' ||
 (statusFilter === 'UPCOMING'
 ? isMeetingScheduledStatus(client.status, client.leadSource)
 : (statusFilter === 'Meeting Scheduled'
 ? isMeetingScheduledStatus(client.status, client.leadSource)
 : client.status.toLowerCase() === statusFilter.toLowerCase()));

 const matchesSalesperson =
 salespersonFilter === 'ALL' || client.salespersonCode === salespersonFilter;

 return matchesSearch && matchesStatus && matchesSalesperson;
 });
 }, [enrichedScheduledClients, searchQuery, statusFilter, salespersonFilter]);

 // Status stats
 const upcomingCount = enrichedScheduledClients.filter(
 (c) => isMeetingScheduledStatus(c.status, c.leadSource)
 ).length;
 const completedCount = enrichedScheduledClients.filter((c) => c.status === 'Won Job' || c.status === 'Completed').length;

 return (
 <div className="flex-1 relative pb-20 bg-white dark:bg-black">
 {/* Main Container */}
 <main className="px-4 sm:px-8 pt-5 max-w-7xl mx-auto space-y-4 bg-white dark:bg-black">
 {/* Global Notifications */}
 {successMessage && (
 <div className="bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-semibold p-4 rounded-xl flex items-center justify-between shadow-2xs">
 <div className="flex items-center gap-2.5">
 <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"/>
 <span>{successMessage}</span>
 </div>
 <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-white font-bold cursor-pointer">
 ✕
 </button>
 </div>
 )}

 {/* Filter, Search & View Controls Bar */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl shadow-xs space-y-3">
 <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
 {/* Search input */}
 <div className="relative crm-search-field flex-1">
 <Search className="w-4 h-4 text-zinc-400 dark:text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2"/>
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Search"
 className="w-full pl-9 pr-8 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#FF5500]"
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

 {/* Filters & View Mode Controls */}
 <div className="flex items-center gap-2 flex-wrap">
 {/* Representative Filter */}
 <div className="flex items-center gap-1.5">
 <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">Rep:</span>
 <select
 value={salespersonFilter}
 onChange={(e) => setSalespersonFilter(e.target.value)}
 className="px-2.5 py-1.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-[#FF5500] cursor-pointer"
 >
 <option value="ALL">All Reps</option>
 {representativeOptions.map((rep) => (
 <option key={rep.code} value={rep.code}>
 {rep.name}
 </option>
 ))}
 </select>
 </div>
 </div>
 </div>
 </div>

 {/* Calendar Sync Status Alert Banner */}
 {calSyncStatus.status === 'error' && (
 <div className="bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/80 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-orange-900 dark:text-orange-200 shadow-2xs">
 <div className="flex items-start gap-2.5">
 <AlertCircle className="w-4 h-4 text-[#FF5500] shrink-0 mt-0.5"/>
 <div className="space-y-1">
 <span className="font-bold block text-sm">Google Calendar Notice</span>
 <p className="text-orange-800 dark:text-orange-300 text-xs leading-relaxed">
 {calSyncStatus.error || 'Google Calendar could not be synchronized automatically.'}
 </p>
 {(calSyncStatus.error?.includes('disabled') || calSyncStatus.errorCode === 'accessNotConfigured' || calSyncStatus.errorCode === 'CALENDAR_API_DISABLED') && (
 <div className="mt-1.5 p-2 bg-orange-100 dark:bg-orange-900/40 rounded-xl border border-orange-300 dark:border-orange-700/60 text-xs text-orange-950 dark:text-orange-100">
 <strong>Action Required:</strong> The Google Calendar API is disabled for Cloud Project <code>32029612757</code>.{' '}
 <a
 href="https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=32029612757"
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1 underline font-bold text-orange-900 dark:text-orange-100 hover:text-orange-700 dark:hover:text-white"
 >
 Click here to enable Google Calendar API in Google Cloud Console
 <ExternalLink className="w-3 h-3 inline"/>
 </a>
 </div>
 )}
 </div>
 </div>
 <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
 <button
 onClick={() => loadCalendarEvents(true)}
 disabled={isSyncingCalendar}
 className="px-3.5 py-2 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-xl font-bold transition-all text-xs cursor-pointer flex items-center gap-1.5 shadow-xs"
 >
 <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCalendar ? 'animate-spin' : ''}`} />
 <span>Retry Sync</span>
 </button>
 </div>
 </div>
 )}

 {/* Scheduled Clients List (Organized & Shrinkable/Expandable) */}
 <div className="space-y-3">
 {filteredClients.length === 0 ? (
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-12 text-center space-y-4 shadow-sm">
 <div className="w-16 h-16 rounded-3xl bg-[#FF5500]/10 text-[#FF5500] flex items-center justify-center mx-auto">
 <CalendarClock className="w-8 h-8"/>
 </div>
 <div className="max-w-md mx-auto space-y-1.5">
 <h3 className="text-base font-black text-zinc-900 dark:text-white">
 {searchQuery || statusFilter !== 'ALL' || salespersonFilter !== 'ALL'
 ? 'No matching scheduled clients found'
 : 'No scheduled clients yet'}
 </h3>
 {(searchQuery || statusFilter !== 'ALL' || salespersonFilter !== 'ALL') && (
 <p className="text-xs text-zinc-500 dark:text-zinc-400">
 Try adjusting your search criteria or resetting filters.
 </p>
 )}
 </div>
 </div>
 ) : viewMode === 'table' ? (
 /* TABLE VIEW */
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-black uppercase text-zinc-500 dark:text-zinc-400 tracking-wider">
 <th className="p-3.5 pl-5">Client</th>
 <th className="p-3.5">Contact</th>
 <th className="p-3.5">Service & Address</th>
 <th className="p-3.5">Appointment</th>
 <th className="p-3.5">Rep</th>
 <th className="p-3.5">Status</th>
 <th className="p-3.5 pr-5 text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
 {filteredClients.map((client, idx) => (
 <tr key={`${client.id || 'row'}_${idx}`} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors">
 <td className="p-3.5 pl-5 font-bold text-zinc-900 dark:text-white">
 <div className="flex items-center gap-2">
 <div className="w-8 h-8 rounded-lg bg-[#FF5500]/10 border border-[#FF5500]/20 text-[#FF5500] flex items-center justify-center shrink-0">
 <User className="w-4 h-4 text-[#FF5500]" />
 </div>
 <div>
 <div className="font-bold text-black dark:text-white">{client.clientName}</div>
 <div className="text-[10px] text-zinc-400 dark:text-zinc-500">Source: {client.leadSource || 'Web Portal'}</div>
 </div>
 </div>
 </td>
 <td className="p-3.5 text-zinc-600 dark:text-zinc-300">
 <div className="font-bold text-zinc-800 dark:text-zinc-200">{client.leadSource || 'Web Portal'}</div>
 <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[180px]">{client.clientEmail || 'No email'}</div>
 </td>
 <td className="p-3.5 text-zinc-600 dark:text-zinc-300">
 <div className="font-semibold">{client.serviceNeeded}</div>
 <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[200px]">{client.address || 'No address'} • Source: {client.leadSource || 'Web Portal'}</div>
 </td>
 <td className="p-3.5 text-zinc-700 dark:text-zinc-300 font-bold whitespace-nowrap">
 <div>{formatAppointmentDateNice(client.appointmentDate) || client.appointmentDate}</div>
 <div className="text-[11px] text-[#FF5500] font-black">{formatTime12Hour(client.startTime)}{client.endTime ? ` - ${formatTime12Hour(client.endTime)}` : ''}</div>
 </td>
 <td className="p-3.5">
 <select
 value={client.salespersonCode || ''}
 onChange={(e) => handleSalespersonChange(client, e.target.value)}
 className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-[#FF5500] cursor-pointer max-w-[130px] truncate"
 >
 <option value="">Unassigned</option>
 {representativeOptions.map((rep) => (
 <option key={rep.code} value={rep.code}>
 {rep.name}
 </option>
 ))}
 </select>
 </td>
 <td className="p-3.5">
 <select
 value={client.status}
 onPointerDown={(e) => e.stopPropagation()}
 onClick={(e) => e.stopPropagation()}
 onChange={(e) => {
 e.stopPropagation();
 void handleStatusChange(client, e.target.value);
 }}
 className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-[#FF5500] cursor-pointer"
 >
 <option value="Meeting Scheduled">Meeting Scheduled</option>
 <option value="Scheduled">Scheduled</option>
 <option value="Confirmed">Confirmed</option>
 <option value="Estimate Sent">Estimate Sent</option>
 <option value="Won Job">Won Job</option>
 <option value="Completed">Completed</option>
 <option value="Cancelled">Cancelled</option>
 </select>
 </td>
 <td className="p-3.5 pr-5 text-right whitespace-nowrap">
 <div className="flex items-center justify-end gap-1.5">
 <button
 onClick={() => openEditModal(client)}
 className="p-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-lg transition-colors cursor-pointer"
 title="Edit client appointment"
 >
 <Edit3 className="w-3.5 h-3.5"/>
 </button>
 <button
 onClick={() => handleDelete(client.id, client.clientName)}
 className="p-1.5 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 rounded-lg transition-colors cursor-pointer"
 title="Delete scheduled client"
 >
 <Trash2 className="w-3.5 h-3.5"/>
 </button>
 </div>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 ) : (
 filteredClients.map((client, idx) => {
 const isExpanded = expandedIds.has(client.id);
 let monthStr = '';
 let dayStr: string | number = '';
 let weekdayStr = '';

 if (client.appointmentDate) {
 const parts = client.appointmentDate.split('-');
 if (parts.length === 3) {
 const y = parseInt(parts[0], 10);
 const m = parseInt(parts[1], 10) - 1;
 const d = parseInt(parts[2], 10);
 const dt = new Date(y, m, d);
 const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
 const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
 monthStr = months[m] || 'APPT';
 dayStr = d;
 weekdayStr = days[dt.getDay()] || '';
 }
 }

 const isToday =
 new Date().toISOString().split('T')[0] === client.appointmentDate;

 return (
 <div
 key={`${client.id || 'card'}_${idx}`}
 className={`bg-white dark:bg-zinc-900 border rounded-2xl transition-all shadow-xs overflow-hidden ${
 isExpanded
 ? 'border-[#FF5500]/60 ring-1 ring-[#FF5500]/30 shadow-md'
 : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
 }`}
 >
 {/* COMPACT / SHRUNK HEADER ROW (Always visible, clean and organized) */}
 <div
 onClick={() => toggleExpand(client.id)}
 className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-zinc-50/70 dark:hover:bg-zinc-800/50 transition-colors select-none"
 >
 {/* Left: Date badge + Client Name + Service */}
 <div className="flex items-center gap-3.5 min-w-0">
 {/* Date Block */}
 <div className="w-14 h-14 rounded-2xl bg-[#FF5500] text-white border border-[#FF5500] shadow-sm flex flex-col items-center justify-center shrink-0">
 <span className="text-[10px] font-black leading-none uppercase text-white/90">
 {monthStr || 'APPT'}
 </span>
 <span className="text-xl font-black leading-tight text-white my-0.5">
 {dayStr || '--'}
 </span>
 <span className="text-[10px] font-bold leading-none text-white/90">
 {weekdayStr || ''}
 </span>
 </div>

 {/* Client Info Summary */}
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-sm font-bold text-black dark:text-white truncate">
 {client.clientName}
 </h3>
 {isToday && (
 <span className="px-2 py-0.5 rounded-md text-xs font-black uppercase tracking-wider bg-orange-100 dark:bg-orange-900/60 text-orange-800 dark:text-orange-200 border border-orange-300 dark:border-orange-700/60">
 TODAY
 </span>
 )}
 
 </div>

 {/* Subline: Time, Phone, Rep */}
 <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex-wrap">
 <span className="flex items-center gap-1 font-bold text-[#FF5500]">
 <Clock className="w-3.5 h-3.5 text-[#FF5500] shrink-0"/>
 {formatAppointmentDateTime(client.appointmentDate, client.startTime || '09:00', client.endTime || '10:00')}
 </span>
 <span className="inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
										{client.leadSource || 'Unknown source'}
									</span>
 <span className="flex items-center gap-1 font-semibold">
 <User className="w-3 h-3 text-zinc-400 shrink-0"/>
 Rep: <strong className="text-zinc-700 dark:text-zinc-300">{client.salespersonName || client.salespersonCode || 'Unassigned'}</strong>
 </span>
 </div>
 </div>
 </div>

 {/* Right: Status badge, Quick Toggle & Action */}
 <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100 dark:border-zinc-800">
 {/* Status Pill */}
 <span
 className={`text-[10px] font-black px-3 py-1 rounded-full border ${
 client.status === 'Won Job' || client.status === 'Completed'
 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30'
 : client.status === 'Meeting Scheduled' || client.status === 'Scheduled' || client.status === 'Confirmed'
 ? 'bg-orange-500/15 text-[#FF5500] dark:text-orange-300 border-orange-500/30'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
 }`}
 >
 {client.status}
 </span>

 {/* Expand / Shrink Chevron Icon & Text */}
 <div className="flex items-center gap-1 text-xs font-bold text-zinc-400 hover:text-[#FF5500] transition-colors">
 <span>{isExpanded ? 'Shrink' : 'Details'}</span>
 {isExpanded ? (
 <ChevronUp className="w-4 h-4 text-[#FF5500]"/>
 ) : (
 <ChevronDown className="w-4 h-4"/>
 )}
 </div>
 </div>
 </div>

 {/* EXPANDED FULL DETAILS VIEW (Smoothly reveals all details when toggled) */}
 {isExpanded && (
 <div className="border-t border-zinc-100 dark:border-zinc-800/80 p-5 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-4">
 {/* Detail Metrics Grid */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
 {/* Address & Google Maps Link */}
 <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1">
 <span className="text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
 <MapPin className="w-3 h-3 text-[#FF5500]"/> Location / Address
 </span>
 <p className="font-bold text-zinc-800 dark:text-zinc-200">
 {client.address || 'No address provided'}
 </p>
 {client.address && (
 <a
 href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
 target="_blank"
 rel="noopener noreferrer"
 className="text-[11px] font-bold text-[#FF5500] hover:underline inline-flex items-center gap-1 pt-1"
 >
 <span>Open in Google Maps</span>
 <ExternalLink className="w-3 h-3"/>
 </a>
 )}
 </div>

 {/* Contact Channels */}
 <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1.5">
 <span className="text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500">
 Direct Contacts
 </span>
 <div className="flex items-center justify-between">
 <span className="text-zinc-600 dark:text-zinc-400 truncate">
 Phone: <strong className="text-zinc-900 dark:text-white">{client.clientPhone || 'N/A'}</strong>
 </span>
 </div>
 <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800">
 <span className="text-zinc-600 dark:text-zinc-400 truncate">
 Email: <strong className="text-zinc-900 dark:text-white">{client.clientEmail || 'N/A'}</strong>
 </span>
 </div>
 </div>

 {/* Integration Sync & Salesperson */}
 <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2">
 <span className="text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500 block">
 Sync & Salesperson
 </span>
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-zinc-600 dark:text-zinc-400 text-xs font-medium">Rep:</span>
 <select
 value={client.salespersonCode || ''}
 onChange={(e) => handleSalespersonChange(client, e.target.value)}
 className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-[#FF5500] cursor-pointer"
 >
 <option value="">-- Unassigned --</option>
 {representativeOptions.map((rep) => (
 <option key={rep.code} value={rep.code}>
 {rep.name}
 </option>
 ))}
 </select>
 </div>
 <div className="flex items-center gap-1.5 pt-1 text-[11px]">
 {client.calendarHtmlLink ? (
 <a
 href={client.calendarHtmlLink}
 target="_blank"
 rel="noopener noreferrer"
 className="text-[#FF5500] font-bold inline-flex items-center gap-1 hover:underline"
 >
 <Calendar className="w-3 h-3"/>
 <span>Google Calendar Event</span>
 <ExternalLink className="w-2.5 h-2.5"/>
 </a>
 ) : (
 <span className="text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
 <Calendar className="w-3 h-3"/> Web Portal Local Storage
 </span>
 )}
 </div>
 </div>
 </div>

 {/* Appointment Notes */}
 {client.notes && (
 <div className="bg-white dark:bg-zinc-900 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-1 text-xs">
 <span className="text-[10px] font-bold uppercase text-zinc-400 dark:text-zinc-500 block">
 Appointment & Client Notes
 </span>
 <p className="text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
 {client.notes}
 </p>
 </div>
 )}

 {/* Action & Status Row */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
 {/* Status dropdown */}
 <div className="flex items-center gap-2">
 <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
 Update Status:
 </span>
 <select
 value={client.status}
 onPointerDown={(e) => e.stopPropagation()}
 onClick={(e) => e.stopPropagation()}
 onChange={(e) => {
 e.stopPropagation();
 void handleStatusChange(client, e.target.value);
 }}
 className="px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-black text-zinc-900 dark:text-white cursor-pointer focus:outline-none focus:border-[#FF5500]"
 >
 {LEAD_STATUS_OPTIONS.map((opt) => (
 <option key={opt} value={opt}>
 {opt}
 </option>
 ))}
 </select>
 </div>

 {/* Action buttons: Edit, Follow Up, Delete */}
 <div className="flex items-center gap-2">
 <button
 onClick={() => openEditModal(client)}
 className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 transition-colors flex items-center gap-1.5 cursor-pointer"
 >
 <Edit3 className="w-3.5 h-3.5"/>
 <span>Edit Details</span>
 </button>

 <button
 onClick={() => navigate('/follow-ups')}
 className="px-3 py-1.5 bg-[#FF5500]/10 hover:bg-[#FF5500]/20 text-[#FF5500] font-bold text-xs rounded-xl border border-[#FF5500]/30 transition-colors flex items-center gap-1.5 cursor-pointer"
 >
 <Send className="w-3.5 h-3.5"/>
 <span>Outreach Console</span>
 </button>

 <button
 onClick={() => handleDelete(client.id, client.clientName)}
 className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-500/10 rounded-xl transition-colors cursor-pointer"
 title="Delete Scheduled Client"
 >
 <Trash2 className="w-4 h-4"/>
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
 })
 )}
 </div>
 </main>

 {/* QUICK SCHEDULE / EDIT MODAL */}
 {isModalOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
 <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
 <div className="flex items-center gap-2.5">
 <div className="w-8 h-8 rounded-xl bg-[#FF5500] text-white flex items-center justify-center font-black">
 <CalendarClock className="w-4 h-4"/>
 </div>
 <div>
 <h3 className="text-base font-black text-zinc-900 dark:text-white">
 {editingClient ? 'Edit Scheduled Client' : 'Schedule New Client'}
 </h3>
 <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
 Stores in Scheduled Clients and publishes event
 </p>
 </div>
 </div>
 <button
 onClick={() => setIsModalOpen(false)}
 className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white font-bold text-lg cursor-pointer"
 >
 ✕
 </button>
 </div>

 {errorMessage && (
 <div className="bg-red-950/80 border border-red-800 text-red-200 text-xs p-3 rounded-xl flex items-center gap-2">
 <AlertCircle className="w-4 h-4 text-red-400 shrink-0"/>
 <span>{errorMessage}</span>
 </div>
 )}

 <form onSubmit={handleSubmitSchedule} className="space-y-3.5 text-xs">
 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Client Name *
 </label>
 <input
 type="text"
 required
 value={formData.clientName}
 onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
 placeholder="e.g. Michael Henderson"
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Phone Number
 </label>
 <input
 type="tel"
 value={formData.clientPhone}
 onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
 placeholder="(555) 000-0000"
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>
 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Email Address
 </label>
 <input
 type="email"
 value={formData.clientEmail}
 onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
 placeholder="client@example.com"
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>
 </div>

 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Address
 </label>
 <input
 type="text"
 value={formData.address}
 onChange={(e) => setFormData({ ...formData, address: e.target.value })}
 placeholder="123 Main St, Springfield, IL"
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>

 <div className="grid grid-cols-3 gap-3">
 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Date *
 </label>
 <input
 type="date"
 required
 value={formData.appointmentDate}
 onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>
 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Start Time *
 </label>
 <input
 type="time"
 required
 value={formData.startTime}
 onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>
 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 End Time
 </label>
 <input
 type="time"
 value={formData.endTime}
 onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Service Needed
 </label>
 <input
 type="text"
 value={formData.serviceNeeded}
 onChange={(e) => setFormData({ ...formData, serviceNeeded: e.target.value })}
 placeholder="e.g. Chimney Restoration"
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>
 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Salesperson / Representative
 </label>
 <select
 value={formData.salespersonCode || ''}
 onChange={(e) => setFormData({ ...formData, salespersonCode: e.target.value })}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 >
 <option value="">-- Unassigned --</option>
 {representativeOptions.map((sp) => (
 <option key={sp.code} value={sp.code}>
 {sp.name}
 </option>
 ))}
 </select>
 </div>
 </div>

 <div>
 <label className="font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
 Notes / Details
 </label>
 <textarea
 rows={2}
 value={formData.notes}
 onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
 placeholder="Special instructions, gate codes, or project details..."
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-900 dark:text-white focus:outline-none focus:border-[#FF5500]"
 />
 </div>

 <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-zinc-100 dark:border-zinc-800">
 <button
 type="button"
 onClick={() => setIsModalOpen(false)}
 className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl font-bold transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="submit"
 disabled={isSubmitting}
 className="px-5 py-2 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-lg font-black shadow-sm flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
 >
 {isSubmitting ? (
 <span>Saving...</span>
 ) : (
 <>
 <Check className="w-4 h-4 stroke-[3]"/>
 <span>{editingClient ? 'Save Changes' : 'Schedule Client'}</span>
 </>
 )}
 </button>
 </div>
 </form>
 </div>
 </div>
 )}

 {/* Delete Confirmation Modal */}
 {clientToDelete && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
 <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
 <Trash2 className="w-6 h-6"/>
 </div>
 <div>
 <h3 className="text-base font-black text-zinc-900 dark:text-white">Remove Scheduled Client</h3>
 <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
 Are you sure you want to remove <span className="font-bold text-zinc-800 dark:text-zinc-200">"{clientToDelete.name}"</span> from scheduled clients?
 </p>
 </div>
 <div className="flex items-center gap-2 pt-2">
 <button
 type="button"
 onClick={() => setClientToDelete(null)}
 className="flex-1 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 type="button"
 onClick={confirmDeleteClient}
 className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-black shadow-sm transition-all cursor-pointer"
 >
 Remove
 </button>
 </div>
 </div>
 </div>
 )}
 </div>
 );
};
