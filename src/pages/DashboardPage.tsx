import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
 Users,
 Calendar,
 Clock,
 CalendarDays,
 RefreshCw,
 ArrowUpRight,
 AlertTriangle,
 Download,
 X,
 MapPin,
 Phone,
 Mail,
 Tag,
} from 'lucide-react';
import { AppConfig, AppointmentFormData, LEAD_STATUS_OPTIONS } from '../types';
import { loadAppConfig, DEFAULT_LEAD_SOURCES, isLeadSourceTab } from '../config';
import { getNewLeads, fetchNewLeads } from '../lib/newLeads';
import {
 getScheduledClients,
 ScheduledClientRecord,
 addOrUpdateScheduledClient,
 deleteScheduledClient,
} from '../lib/scheduledClients';
import {
 extractSpreadsheetId,
 readAllSpreadsheetTabs,
 getSpreadsheetDetails,
 appendAppointmentToSheet,
 updateLeadStatusInSpreadsheet,
 deleteRowFromSheet,
 SheetRowRecord,
} from '../lib/sheets';
import {
 fetchAllGoogleCalendarEvents,
 parseCalendarEventToFormData,
 formatTime12Hour,
 deleteGoogleCalendarEvent,
} from '../lib/calendar';
import { LeadDrawer } from '../components/ui/LeadDrawer';
import {
 resolveDashboardAppointmentIdentity,
 dedupeDashboardAppointments,
 DashboardRepresentativeCode,
} from '../lib/dashboardSchedule';

interface DashboardOutletContext {
 config: AppConfig;
 handleSaveConfig: (newConfig: AppConfig) => void;
 toggleTheme: () => void;
 user: any;
 handleSignIn: () => Promise<void>;
 handleSignOut: () => Promise<void>;
 isLoggingIn: boolean;
 setIsSettingsOpen: (open: boolean) => void;
 openScheduleModal?: () => void;
 openAddLeadModal?: () => void;
}

type RepresentativeCode = DashboardRepresentativeCode;

interface TodayCalendarItem {
 id: string;
 calendarId: string;
 calendarName: string;
 event: any;
 clientName: string;
 serviceNeeded: string;
 representative: RepresentativeCode;
 appointmentDate: string;
 startTime: string;
 endTime: string;
 clientPhone: string;
 clientEmail: string;
 address: string;
 leadSource: string;
 leadType: string;
 notes: string;
 crmMatches: SheetRowRecord[];
 duplicateKey: string;
}

const REPRESENTATIVES: RepresentativeCode[] = ['DG', 'SB', 'JS', 'BK'];

function businessDateKey(date: Date, timeZone: string): string {
 const parts = new Intl.DateTimeFormat('en-US', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
 }).formatToParts(date);
 const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
 return `${values.year}-${values.month}-${values.day}`;
}

function normalizeText(value?: string): string {
 return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(value?: string): string {
 return String(value || '').replace(/\D/g, '');
}

function toSheetRow(record: ScheduledClientRecord): SheetRowRecord {
 return {
  ...(record as any),
  rawValues: (record as any).rawValues || [],
  tabName: (record as any).tabName || record.leadSource,
 };
}

function sameClientAndService(item: {
 clientName?: string;
 clientPhone?: string;
 clientEmail?: string;
 serviceNeeded?: string;
 leadType?: string;
}, lead: {
 clientName?: string;
 clientPhone?: string;
 clientEmail?: string;
 serviceNeeded?: string;
 leadType?: string;
}): boolean {
 const itemService = normalizeText(item.serviceNeeded || item.leadType);
 const leadService = normalizeText(lead.serviceNeeded || lead.leadType);
 if (!itemService || !leadService || itemService !== leadService) return false;

 const itemPhone = normalizePhone(item.clientPhone);
 const leadPhone = normalizePhone(lead.clientPhone);
 if (itemPhone.length >= 7 && leadPhone === itemPhone) return true;

 const itemEmail = normalizeText(item.clientEmail);
 const leadEmail = normalizeText(lead.clientEmail);
 if (itemEmail && leadEmail === itemEmail) return true;

 return Boolean(
  normalizeText(item.clientName) &&
  normalizeText(item.clientName) === normalizeText(lead.clientName)
 );
}

function duplicateIdentity(item: {
 calendarId?: string;
 clientName?: string;
 clientPhone?: string;
 clientEmail?: string;
 serviceNeeded?: string;
 appointmentDate?: string;
 startTime?: string;
 endTime?: string;
}): string {
 const phone = normalizePhone(item.clientPhone);
 const email = normalizeText(item.clientEmail);
 const name = normalizeText(item.clientName);
 const identity = phone.length >= 7 ? `phone:${phone}` : email ? `email:${email}` : `name:${name}`;
 // The same client appointment copied to another salesperson calendar is one
 // Overview item. Different dates or times remain separate appointments.
 return [
  identity,
  `date:${item.appointmentDate || ''}`,
  `start:${item.startTime || ''}`,
  `end:${item.endTime || ''}`,
 ].join('|');
}

export const Dashboard: React.FC = () => {
 const navigate = useNavigate();
 const outletCtx = useOutletContext<DashboardOutletContext | undefined>();
 const config = outletCtx?.config || loadAppConfig();
 const timeZone = config.timeZone || 'America/New_York';

 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [sheetRecords, setSheetRecords] = useState<SheetRowRecord[]>([]);
 const [scheduledList, setScheduledList] = useState<ScheduledClientRecord[]>(() => getScheduledClients());
 const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
 const [newLeadsCount, setNewLeadsCount] = useState(() => getNewLeads().length);
 const [selectedLead, setSelectedLead] = useState<SheetRowRecord | null>(null);
 const [selectedCalendarOnly, setSelectedCalendarOnly] = useState<TodayCalendarItem | null>(null);
 const [pullingId, setPullingId] = useState<string | null>(null);
 const [removingId, setRemovingId] = useState<string | null>(null);
 const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

 const loadDashboardData = useCallback(async () => {
  setRefreshing(true);
  try {
   const canonical = await fetchNewLeads().catch(() => getNewLeads());
   setNewLeadsCount(canonical.length);

   const now = Date.now();
   const calendarPromise = fetchAllGoogleCalendarEvents({
    timeMin: new Date(now - 2 * 86400000).toISOString(),
    timeMax: new Date(now + 3 * 86400000).toISOString(),
   });

   const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
   let records: SheetRowRecord[] = [];
   if (spreadsheetId) {
    let tabs = (config.leadSources?.length ? config.leadSources : DEFAULT_LEAD_SOURCES)
     .filter(isLeadSourceTab);
    try {
     const details = await getSpreadsheetDetails(undefined, spreadsheetId);
     tabs = Array.from(new Set([
      ...tabs,
      ...(details.sheets || []).map((sheet) => sheet.title).filter(isLeadSourceTab),
     ]));
    } catch (error) {
     console.warn('Dashboard spreadsheet-tab notice:', error);
    }
    const result = await readAllSpreadsheetTabs(undefined, spreadsheetId, tabs, true);
    records = (result.rows || []).filter((row) =>
     isLeadSourceTab(row.tabName || row.leadSource || '')
    );
   }

   const events = await calendarPromise;
   setCalendarEvents(events);
   setSheetRecords(records);
   setScheduledList(getScheduledClients(events));
  } catch (error: any) {
   console.warn('Dashboard refresh notice:', error);
   setMessage({ type: 'error', text: error?.message || 'Dashboard could not refresh.' });
  } finally {
   setRefreshing(false);
   setLoading(false);
  }
 }, [config.spreadsheetId, config.leadSources, timeZone]);

 useEffect(() => {
  loadDashboardData();
  const intervalId = window.setInterval(loadDashboardData, 60000);
  const handleRefresh = () => loadDashboardData();
  window.addEventListener('dashboard_data_refresh', handleRefresh);
  window.addEventListener('scheduled_clients_updated', handleRefresh);
  window.addEventListener('new_leads_updated', handleRefresh);
  return () => {
   window.clearInterval(intervalId);
   window.removeEventListener('dashboard_data_refresh', handleRefresh);
   window.removeEventListener('scheduled_clients_updated', handleRefresh);
   window.removeEventListener('new_leads_updated', handleRefresh);
  };
 }, [loadDashboardData]);

 const todayKey = businessDateKey(new Date(), timeZone);
 const formattedTodayHeader = new Intl.DateTimeFormat('en-US', {
  timeZone,
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
 }).format(new Date());

 const allCrmRecords = useMemo(() => {
  const combined = [
   ...sheetRecords,
   ...scheduledList.map(toSheetRow),
  ];
  const seen = new Set<string>();
  return combined.filter((record) => {
   const key = record.tabName && record.rowIndex
    ? `${normalizeText(record.tabName)}:${record.rowIndex}`
    : `${normalizeText(record.clientName)}:${normalizePhone(record.clientPhone)}:${normalizeText(record.serviceNeeded)}`;
   if (seen.has(key)) return false;
   seen.add(key);
   return true;
  });
 }, [sheetRecords, scheduledList]);

 const todayAppointments = useMemo<TodayCalendarItem[]>(() => {
  const appointments = calendarEvents
   .map((event): TodayCalendarItem | null => {
    const parsed = parseCalendarEventToFormData(event, config).formData;
    const title = resolveDashboardAppointmentIdentity(event.summary || '', parsed);
    if (!title) return null;
    const appointmentDate = parsed.appointmentDate;
    if (appointmentDate !== todayKey) return null;

    const candidate = {
     clientName: title.clientName,
     clientPhone: parsed.clientPhone,
     clientEmail: parsed.clientEmail,
     serviceNeeded: title.serviceNeeded,
    };
    const crmMatches = allCrmRecords.filter((lead) => sameClientAndService(candidate, lead));

    return {
     id: `${event.calendarId || 'primary'}:${event.id}`,
     calendarId: event.calendarId || config.calendarId || 'primary',
     calendarName: event.calendarSummary || event.calendarId || config.calendarId || 'Primary',
     event,
     clientName: title.clientName,
     serviceNeeded: title.serviceNeeded,
     representative: title.representative,
     appointmentDate,
     startTime: parsed.startTime,
     endTime: parsed.endTime,
     clientPhone: parsed.clientPhone || '',
     clientEmail: parsed.clientEmail || '',
     address: event.location || parsed.address || '',
     leadSource: parsed.leadSource || '',
     leadType: parsed.leadType || 'Direct',
     notes: parsed.notes || '',
     crmMatches,
     duplicateKey: duplicateIdentity({
      ...candidate,
      calendarId: event.calendarId || config.calendarId || 'primary',
      appointmentDate,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
     }),
    };
   })
   .filter((item): item is TodayCalendarItem => Boolean(item));

  return dedupeDashboardAppointments(appointments)
   .sort((a, b) => a.startTime.localeCompare(b.startTime));
 }, [calendarEvents, allCrmRecords, config, todayKey]);

 const groupedAppointments = useMemo(() => {
  return Object.fromEntries(
   REPRESENTATIVES.map((representative) => [
    representative,
    todayAppointments.filter((item) => item.representative === representative),
   ])
  ) as Record<RepresentativeCode, TodayCalendarItem[]>;
 }, [todayAppointments]);

 const showMessage = (type: 'success' | 'error', text: string) => {
  setMessage({ type, text });
  window.setTimeout(() => setMessage(null), 5000);
 };

 const openAppointment = (item: TodayCalendarItem) => {
  if (item.crmMatches.length > 0) {
   setSelectedLead(item.crmMatches[0]);
   setSelectedCalendarOnly(null);
  } else {
   setSelectedCalendarOnly(item);
   setSelectedLead(null);
  }
 };

 const handlePullToCrm = async (item: TodayCalendarItem) => {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
  if (!spreadsheetId) {
   showMessage('error', 'Google Sheets is not configured.');
   return;
  }

  setPullingId(item.id);
  try {
   const configuredSources = config.leadSources?.length ? config.leadSources : DEFAULT_LEAD_SOURCES;
   const sourceTab = configuredSources.find((source) =>
    normalizeText(item.leadSource).startsWith(normalizeText(source))
   ) || config.sheetTabName || configuredSources[0] || 'Angi';

   const formData: AppointmentFormData = {
    clientName: item.clientName,
    appointmentDate: item.appointmentDate,
    startTime: item.startTime,
    endTime: item.endTime,
    salespersonCode: item.representative,
    salespersonName: item.representative,
    clientPhone: item.clientPhone,
    clientEmail: item.clientEmail,
    address: item.address,
    leadSource: item.leadSource || sourceTab,
    leadType: item.leadType || 'Direct',
    notes: item.notes,
    status: 'Meeting Scheduled',
    serviceNeeded: item.serviceNeeded,
    calendarEventId: item.event.id,
    calendarHtmlLink: item.event.htmlLink || '',
    sourceTabName: sourceTab,
   };

   await appendAppointmentToSheet(
    undefined,
    spreadsheetId,
    sourceTab,
    formData,
    'Meeting Scheduled'
   );

   addOrUpdateScheduledClient(
    formData,
    {
     id: item.event.id,
     htmlLink: item.event.htmlLink || '',
     summary: item.event.summary || '',
     start: item.event.start?.dateTime || item.event.start?.date || '',
     end: item.event.end?.dateTime || item.event.end?.date || '',
    },
    null,
    {
     status: 'Meeting Scheduled',
     sheetSynced: true,
     salespersonName: item.representative,
    }
   );

   setSelectedCalendarOnly(null);
   showMessage('success', `${item.clientName} was pulled into Meeting Scheduled.`);
   await loadDashboardData();
   window.dispatchEvent(new CustomEvent('dashboard_data_refresh'));
  } catch (error: any) {
   showMessage('error', error?.message || 'The Calendar client could not be pulled into the CRM.');
  } finally {
   setPullingId(null);
  }
 };

 const handleRemoveDuplicate = async (item: TodayCalendarItem) => {
  const lead = item.crmMatches[0];
  const confirmed = window.confirm(
   `Remove duplicate appointment?\n\nClient: ${item.clientName}\nRepresentative: ${item.representative}\nDate: ${item.appointmentDate}\nTime: ${formatTime12Hour(item.startTime)}\n\nThis removes the selected CRM record and its Google Calendar event.`
  );
  if (!confirmed) return;

  setRemovingId(item.id);
  try {
   await deleteGoogleCalendarEvent(item.event.id, item.calendarId);

   const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
   if (
    lead &&
    spreadsheetId &&
    lead.tabName &&
    lead.rowIndex &&
    lead.rowIndex > 0
   ) {
    await deleteRowFromSheet(
     undefined,
     spreadsheetId,
     lead.tabName,
     lead.rowIndex,
     lead.clientName,
     lead.clientPhone
    );
   }
   const localId = (lead as any)?.id;
   if (localId) deleteScheduledClient(localId);

   setSelectedLead(null);
   setSelectedCalendarOnly(null);
   showMessage('success', 'Duplicate CRM record and Calendar event removed.');
   await loadDashboardData();
   window.dispatchEvent(new CustomEvent('dashboard_data_refresh'));
  } catch (error: any) {
   showMessage('error', error?.message || 'The duplicate could not be removed.');
  } finally {
   setRemovingId(null);
  }
 };

 const handleDrawerStatusChange = async (lead: SheetRowRecord, newStatus: string) => {
  const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');
  if (!spreadsheetId) throw new Error('Google Sheets is not configured.');
  await updateLeadStatusInSpreadsheet(
   undefined,
   spreadsheetId,
   {
    tabName: lead.tabName,
    rowIndex: lead.rowIndex,
    clientName: lead.clientName,
    clientPhone: lead.clientPhone,
    clientEmail: lead.clientEmail,
    statusColIndex: lead.statusColIndex,
   },
   newStatus
  );
  setSelectedLead({ ...lead, status: newStatus });
  await loadDashboardData();
 };

 return (
  <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
   {message && (
    <div className={`fixed top-5 right-5 z-[80] max-w-sm rounded-md px-4 py-3 text-sm font-bold shadow-md border transition-opacity duration-120 ${
     message.type === 'success'
      ? 'bg-white dark:bg-zinc-900 text-emerald-600 border-emerald-500/30'
      : 'bg-white dark:bg-zinc-900 text-red-600 border-red-500/30'
    }`}>
     {message.text}
    </div>
   )}

   <div className="flex items-center justify-end">
    <button
     onClick={loadDashboardData}
     disabled={refreshing}
     className="p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 transition-colors duration-120 cursor-pointer disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
     title="Refresh dashboard and Google Calendar"
    >
     <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#EF7E15]' : ''}`} />
    </button>
   </div>

   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-5">
     <div className="flex items-center justify-between">
      <Users className="w-5 h-5 text-[#EF7E15]" />
      <button onClick={() => navigate('/new')} className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors duration-120 flex items-center gap-1 cursor-pointer">
       View <ArrowUpRight className="w-3.5 h-3.5" />
      </button>
     </div>
     <div className="mt-4 text-4xl font-black text-zinc-900 dark:text-white tabular-nums">{newLeadsCount}</div>
     <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-1">New Leads</div>
    </div>

    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-5">
     <Calendar className="w-5 h-5 text-[#EF7E15]" />
     <div className="mt-4 text-4xl font-black text-zinc-900 dark:text-white tabular-nums">{todayAppointments.length}</div>
     <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-1">Appointments Today</div>
     <div className="text-[11px] text-zinc-500 mt-0.5">From all accessible Google Calendars</div>
    </div>

   </div>

   <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800">
     <div>
      <h2 className="text-base font-extrabold text-zinc-900 dark:text-white">
       Today's Schedule ({todayAppointments.length})
      </h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{formattedTodayHeader}</p>
     </div>
     <button
      onClick={() => navigate('/scheduled-clients')}
      className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1"
     >
      Meeting Scheduled <ArrowUpRight className="w-3.5 h-3.5" />
     </button>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 pt-5">
     {REPRESENTATIVES.map((representative) => (
      <div key={representative} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-50/70 dark:bg-zinc-950/40">
       <div className="px-4 py-3 bg-zinc-100 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
        <span className="font-black text-sm text-zinc-900 dark:text-white">{representative}</span>
        <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-[#EF7E15]/10 text-[#EF7E15]">
         {groupedAppointments[representative].length}
        </span>
       </div>
       <div className="p-3 space-y-2 min-h-[120px]">
        {groupedAppointments[representative].length === 0 ? (
         <div className="h-full min-h-[90px] flex items-center justify-center text-center">
          <div>
           <CalendarDays className="w-5 h-5 text-zinc-400 mx-auto mb-2" />
           <p className="text-xs font-semibold text-zinc-500">No appointments today</p>
          </div>
         </div>
        ) : (
         groupedAppointments[representative].map((item) => {
          const inCrm = item.crmMatches.length > 0;
          const matchingCalendarEvents = todayAppointments.filter(
           (candidate) => candidate.id !== item.id && candidate.duplicateKey === item.duplicateKey
          );
          const exactLinkedCrmMatches = item.crmMatches.filter((lead: any) =>
           String(lead.calendarEventId || '').trim() === String(item.event.id || '').trim()
          );
          const duplicateCrmCount = exactLinkedCrmMatches.length > 1 ? exactLinkedCrmMatches.length : 0;
          const isDuplicate = matchingCalendarEvents.length > 0 || duplicateCrmCount > 0;
          return (
           <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => openAppointment(item)}
            onKeyDown={(event) => {
             if (event.key === 'Enter' || event.key === ' ') openAppointment(item);
            }}
            className={`rounded-xl border p-3 cursor-pointer transition-colors ${
             isDuplicate
              ? 'border-orange-400 bg-orange-50 dark:bg-orange-500/10'
              : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-[#EF7E15]/50'
            }`}
           >
            <div className="flex items-start justify-between gap-2">
             <div className="min-w-0">
              <p className="text-xs font-extrabold text-zinc-900 dark:text-white truncate">{item.clientName}</p>
              <p className="text-[11px] font-bold text-[#EF7E15] mt-1">
               {formatTime12Hour(item.startTime)}
               {item.endTime ? ` – ${formatTime12Hour(item.endTime)}` : ''}
              </p>
             </div>
             {!inCrm && (
              <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600">
               Not in CRM
              </span>
             )}
            </div>

            {isDuplicate && (
             <div className="mt-2 rounded-lg border border-orange-300/70 bg-orange-100/70 dark:bg-orange-500/10 p-2 text-[10px] text-orange-800 dark:text-orange-300">
              <div className="flex items-center gap-1 font-black">
               <AlertTriangle className="w-3 h-3" /> Possible duplicate found
              </div>
              <p className="mt-1">
               Calendar: <span className="font-bold">{item.calendarName}</span>
              </p>
              {matchingCalendarEvents.map((duplicate) => (
               <p key={duplicate.id} className="mt-0.5">
                Matches: <span className="font-bold">{duplicate.clientName}</span> · {formatTime12Hour(duplicate.startTime)}–{formatTime12Hour(duplicate.endTime)} · same calendar
               </p>
              ))}
              {duplicateCrmCount > 0 && (
               <p className="mt-0.5">Matches {duplicateCrmCount} CRM rows linked to this exact Calendar event.</p>
              )}
             </div>
            )}

            {!inCrm && (
             <button
              type="button"
              disabled={pullingId === item.id}
              onClick={(event) => {
               event.stopPropagation();
               handlePullToCrm(item);
              }}
              className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg bg-[#EF7E15] hover:bg-[#D66B0F] text-white text-[10px] font-black py-2 disabled:opacity-50"
             >
              <Download className="w-3 h-3" />
              {pullingId === item.id ? 'Pulling...' : 'Pull to CRM'}
             </button>
            )}

            {isDuplicate && inCrm && (
             <button
              type="button"
              disabled={removingId === item.id}
              onClick={(event) => {
               event.stopPropagation();
               handleRemoveDuplicate(item);
              }}
              className="mt-2 w-full rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/10 text-[10px] font-black py-2 disabled:opacity-50"
             >
              {removingId === item.id ? 'Removing...' : 'Remove Duplicate'}
             </button>
            )}
           </div>
          );
         })
        )}
       </div>
      </div>
     ))}
    </div>

    {loading && (
     <p className="text-center text-xs text-zinc-500 pt-4">Loading Google Calendar appointments…</p>
    )}
   </section>

   <LeadDrawer
    lead={selectedLead}
    isOpen={Boolean(selectedLead)}
    onClose={() => setSelectedLead(null)}
    onStatusChange={handleDrawerStatusChange}
    onLeadUpdate={async () => {
     setSelectedLead(null);
     await loadDashboardData();
    }}
    statusOptions={LEAD_STATUS_OPTIONS}
    salespeople={config.salespeople}
    calendarEvents={calendarEvents}
   />

   {selectedCalendarOnly && (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedCalendarOnly(null)}>
     <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
       <div>
        <div className="flex items-center gap-2">
         <h3 className="font-black text-zinc-900 dark:text-white">{selectedCalendarOnly.clientName}</h3>
         <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-red-500/10 text-red-600">Not in CRM</span>
        </div>
        <p className="text-xs text-zinc-500 mt-1">Google Calendar appointment</p>
       </div>
       <button onClick={() => setSelectedCalendarOnly(null)} className="p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
        <X className="w-5 h-5" />
       </button>
      </div>

      <div className="p-5 space-y-3 text-sm">
       <div className="flex gap-3"><Clock className="w-4 h-4 text-[#EF7E15] mt-0.5" /><span>{formatTime12Hour(selectedCalendarOnly.startTime)} – {formatTime12Hour(selectedCalendarOnly.endTime)}</span></div>
       <div className="flex gap-3"><Tag className="w-4 h-4 text-[#EF7E15] mt-0.5" /><span>{selectedCalendarOnly.serviceNeeded}</span></div>
       {selectedCalendarOnly.clientPhone && <div className="flex gap-3"><Phone className="w-4 h-4 text-[#EF7E15] mt-0.5" /><span>{selectedCalendarOnly.clientPhone}</span></div>}
       {selectedCalendarOnly.clientEmail && <div className="flex gap-3"><Mail className="w-4 h-4 text-[#EF7E15] mt-0.5" /><span>{selectedCalendarOnly.clientEmail}</span></div>}
       {selectedCalendarOnly.address && <div className="flex gap-3"><MapPin className="w-4 h-4 text-[#EF7E15] mt-0.5" /><span>{selectedCalendarOnly.address}</span></div>}
       <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
         <p className="text-[10px] uppercase font-bold text-zinc-500">Representative</p>
         <p className="font-black mt-1">{selectedCalendarOnly.representative}</p>
        </div>
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
         <p className="text-[10px] uppercase font-bold text-zinc-500">Lead Source</p>
         <p className="font-black mt-1">{selectedCalendarOnly.leadSource || 'Not specified'}</p>
        </div>
       </div>
       {selectedCalendarOnly.notes && (
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
         <p className="text-[10px] uppercase font-bold text-zinc-500">Notes</p>
         <p className="text-xs mt-1 whitespace-pre-wrap">{selectedCalendarOnly.notes}</p>
        </div>
       )}
      </div>

      <div className="p-5 border-t border-zinc-200 dark:border-zinc-800">
       <button
        disabled={pullingId === selectedCalendarOnly.id}
        onClick={() => handlePullToCrm(selectedCalendarOnly)}
        className="w-full rounded-lg bg-[#EF7E15] hover:bg-[#D66B0F] text-white py-3 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50"
       >
        <Download className="w-4 h-4" />
        {pullingId === selectedCalendarOnly.id ? 'Pulling to CRM...' : 'Pull to CRM'}
       </button>
      </div>
     </div>
    </div>
   )}
  </div>
 );
};
