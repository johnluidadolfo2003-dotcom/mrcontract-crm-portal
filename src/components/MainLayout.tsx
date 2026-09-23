import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { SettingsModal } from './SettingsModal';
import { AppConfig, AppointmentFormData, CreatedCalendarEvent, GoogleCalendarEventPayload } from '../types';
import { loadAppConfig, saveAppConfig, applyTheme, fetchAndSyncServerConfig } from '../config';
import {
 Sun,
 Moon,
 Calendar,
 PlusCircle,
 ShieldCheck,
 Database,
 Settings as SettingsIcon,
 X,
 CalendarClock,
 CheckCircle2,
 Share2,
 Copy,
 ExternalLink,
 Menu,
 User,
 UserPlus,
 LayoutGrid,
 Users,
 Clock,
 CalendarCheck,
 Plus,
 History,
} from 'lucide-react';
import { AppointmentForm } from './AppointmentForm';
import { AddLeadForm } from './AddLeadForm';
import { ConfirmationModal } from './ConfirmationModal';
import { AddLeadPayload } from './AddLeadConfirmModal';
import { SwitchUserModal } from './SwitchUserModal';
import { ActivityLogModal } from './ActivityLogModal';
import { useUser } from '../lib/userContext';
import { logAuditActivity } from '../lib/activityLogger';
import { buildEventPayload, createGoogleCalendarEvent, checkBackendCalendarStatus, BackendCalendarStatus } from '../lib/calendar';
import { addOrUpdateScheduledClient, recordMeetingScheduledTransition } from '../lib/scheduledClients';
import { addNewLead, getNewLeads, fetchNewLeads, migrateLegacyNewLeads, updateNewLeadStatus } from '../lib/newLeads';
import { googleSignIn } from '../lib/firebase';

export const MainLayout: React.FC = () => {
 const navigate = useNavigate();
 const location = useLocation();
 const { currentUser, setIsSwitchUserModalOpen, setIsActivityLogModalOpen } = useUser();
 const [config, setConfig] = useState<AppConfig>(loadAppConfig);
 const [calendarStatus, setCalendarStatus] = useState<BackendCalendarStatus | null>(null);
 const [isCheckingCalendar, setIsCheckingCalendar] = useState<boolean>(true);
 const [isReconnectingCalendar, setIsReconnectingCalendar] = useState<boolean>(false);
 const [isSettingsOpen, setIsSettingsOpen] = useState(false);
 const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'integrations'>('general');
 const [settingsInitialSubTab, setSettingsInitialSubTab] = useState<'connections' | 'webhooks' | 'troubleshooting'>('connections');
 const [isSidebarOpen, setIsSidebarOpen] = useState(true);
 const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
 const [newLeadsCount, setNewLeadsCount] = useState(() => getNewLeads().length);

 // Global Modals for Schedule Appointment & Add Lead
 const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
 const [schedulePrefillData, setSchedulePrefillData] = useState<AppointmentFormData | null>(null);
 const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
 const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
 const [pendingPayload, setPendingPayload] = useState<GoogleCalendarEventPayload | null>(null);
 const [lastSubmittedFormData, setLastSubmittedFormData] = useState<AppointmentFormData | null>(null);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

 const showToast = (type: 'success' | 'error', text: string) => {
 setToastMessage({ type, text });
 setTimeout(() => setToastMessage(null), 4000);
 };

 const handleReconnectCalendar = async () => {
  if (isReconnectingCalendar) return;
  setIsReconnectingCalendar(true);
  setIsCheckingCalendar(true);
  try {
   await googleSignIn(false);
   const status = await checkBackendCalendarStatus(config.calendarId);
   setCalendarStatus(status);
   if (status.connected) {
    showToast('success', 'Google Calendar reconnected.');
    window.dispatchEvent(new CustomEvent('dashboard_data_refresh'));
   } else {
    showToast('error', status.error || 'Google Calendar could not reconnect.');
   }
  } catch (error: any) {
   showToast('error', error?.message || 'Google Calendar reconnection was not completed.');
  } finally {
   setIsCheckingCalendar(false);
   setIsReconnectingCalendar(false);
  }
 };

 // Keep React controls and document classes on the same authoritative theme.
 useEffect(() => {
 applyTheme(config.theme || 'dark');
 }, [config.theme]);

 useEffect(() => {
  const handleThemeChanged = (event: Event) => {
   const nextTheme = (event as CustomEvent<{ theme?: 'dark' | 'light' }>).detail?.theme;
   if (!nextTheme) return;
   setConfig((current) => current.theme === nextTheme ? current : { ...current, theme: nextTheme });
  };
  window.addEventListener('crm_theme_changed', handleThemeChanged);
  return () => window.removeEventListener('crm_theme_changed', handleThemeChanged);
 }, []);

 useEffect(() => {
 fetchAndSyncServerConfig().then((serverCfg) => {
 if (serverCfg) {
 setConfig(serverCfg);
 }
 });
 }, []);

 // Sync every New badge from the same authoritative backend list.
 useEffect(() => {
 let active = true;
 migrateLegacyNewLeads()
  .catch((err) => console.warn('Legacy New lead migration notice:', err))
  .finally(() => fetchNewLeads(false).catch((err) => console.warn('New lead load notice:', err)));

 const handleUpdate = (e: any) => {
  if (!active) return;
  setNewLeadsCount(Array.isArray(e.detail) ? e.detail.length : getNewLeads().length);
 };
 window.addEventListener('new_leads_updated', handleUpdate);
 return () => {
  active = false;
  window.removeEventListener('new_leads_updated', handleUpdate);
 };
 }, []);

 // Check backend calendar status on mount and on update events
 useEffect(() => {
 let isMounted = true;
 setIsCheckingCalendar(true);
 checkBackendCalendarStatus().then((status) => {
 if (isMounted) {
 setCalendarStatus(status);
 setIsCheckingCalendar(false);
 }
 });

 const handleCalendarStatusUpdate = (e: any) => {
 if (e?.detail) {
 setCalendarStatus(e.detail);
 setIsCheckingCalendar(false);
 }
 };

 window.addEventListener('calendar_status_updated', handleCalendarStatusUpdate);
 return () => {
 isMounted = false;
 window.removeEventListener('calendar_status_updated', handleCalendarStatusUpdate);
 };
 }, []);

 // Global custom event listeners for opening modals
 useEffect(() => {
 const handleOpenSchedule = (e: Event) => {
 const customEvent = e as CustomEvent;
 if (customEvent.detail) {
 setSchedulePrefillData(customEvent.detail);
 } else {
 const raw = sessionStorage.getItem('prefill_schedule_lead');
 if (raw) {
 try {
 setSchedulePrefillData(JSON.parse(raw));
 sessionStorage.removeItem('prefill_schedule_lead');
 } catch {}
 }
 }
 setIsScheduleModalOpen(true);
 };
 const handleOpenAddLead = () => setIsAddLeadModalOpen(true);
 const handleOpenSettings = (e: any) => {
 if (e?.detail?.tab) setSettingsInitialTab(e.detail.tab);
 if (e?.detail?.subTab) setSettingsInitialSubTab(e.detail.subTab);
 setIsSettingsOpen(true);
 };
 const handleOpenSwitchUser = () => setIsSwitchUserModalOpen(true);
 const handleOpenActivityLog = () => setIsActivityLogModalOpen(true);

 window.addEventListener('open_schedule_modal', handleOpenSchedule);
 window.addEventListener('open_add_lead_modal', handleOpenAddLead);
 window.addEventListener('open_settings', handleOpenSettings);
 window.addEventListener('open_switch_user_modal', handleOpenSwitchUser);
 window.addEventListener('open_activity_log_modal', handleOpenActivityLog);

 return () => {
 window.removeEventListener('open_schedule_modal', handleOpenSchedule);
 window.removeEventListener('open_add_lead_modal', handleOpenAddLead);
 window.removeEventListener('open_settings', handleOpenSettings);
 window.removeEventListener('open_switch_user_modal', handleOpenSwitchUser);
 window.removeEventListener('open_activity_log_modal', handleOpenActivityLog);
 };
 }, []);

 const handleSaveConfig = (newConfig: AppConfig) => {
 setConfig(newConfig);
 saveAppConfig(newConfig);
 applyTheme(newConfig.theme || 'dark');
 checkBackendCalendarStatus(newConfig.calendarId);
 };

 const toggleTheme = () => {
 const next: 'dark' | 'light' = config.theme === 'dark' ? 'light' : 'dark';
 handleSaveConfig({ ...config, theme: next });
 };

 // Handle Schedule Appointment form submit -> prompt confirmation modal
 const handleScheduleSubmit = (formData: AppointmentFormData) => {
 setLastSubmittedFormData(formData);
 const payload = buildEventPayload(formData, config);
 setPendingPayload(payload);
 setIsConfirmationOpen(true);
 };

 // Confirm publish to Google Calendar & Google Sheets
 const handleConfirmPublish = async () => {
 if (!pendingPayload || !lastSubmittedFormData) return;
 setIsSubmitting(true);

 try {
 const calendarResult = await createGoogleCalendarEvent(pendingPayload, config.calendarId);
 let sheetSynced = false;

 if (config.spreadsheetId && config.autoSyncToSheets !== false) {
 try {
 if (lastSubmittedFormData.sourceRowIndex && lastSubmittedFormData.sourceRowIndex > 1) {
 const sheetResponse = await fetch('/api/sheets/update-lead', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 spreadsheetId: config.spreadsheetId,
 sheetTab: lastSubmittedFormData.sourceTabName || lastSubmittedFormData.leadSource,
 rowIndex: lastSubmittedFormData.sourceRowIndex,
 leadData: {
 clientName: lastSubmittedFormData.clientName,
 clientPhone: lastSubmittedFormData.clientPhone,
 clientEmail: lastSubmittedFormData.clientEmail,
 address: lastSubmittedFormData.address,
 serviceNeeded: lastSubmittedFormData.serviceNeeded || lastSubmittedFormData.leadType,
 leadFee: lastSubmittedFormData.leadFee,
 notes: lastSubmittedFormData.notes,
 status: 'Meeting Scheduled',
 appointmentDate: lastSubmittedFormData.appointmentDate,
 startTime: lastSubmittedFormData.startTime,
 endTime: lastSubmittedFormData.endTime,
 salespersonCode: lastSubmittedFormData.salespersonCode,
 },
 }),
 });
 if (!sheetResponse.ok) {
 const sheetError = await sheetResponse.json().catch(() => ({}));
 throw new Error(sheetError.error || 'Failed to update the scheduled lead in Google Sheets.');
 }
 sheetSynced = true;
 } else {
 const sheets = await import('../lib/sheets');
 await sheets.appendAppointmentToSheet(
 undefined,
 config.spreadsheetId,
 config.sheetTabName || 'Appointments',
 lastSubmittedFormData,
 'Meeting Scheduled'
 );
 sheetSynced = true;
 }
 } catch (sheetErr) {
 console.warn('Auto-sync to Google Sheet warning:', sheetErr);
 }
 }

 recordMeetingScheduledTransition({
 clientName: lastSubmittedFormData.clientName,
 clientPhone: lastSubmittedFormData.clientPhone,
 leadSource: lastSubmittedFormData.sourceTabName || lastSubmittedFormData.leadSource,
 rowIndex: lastSubmittedFormData.sourceRowIndex,
 });

 const matchedSp = config.salespeople.find((s) => s.code === lastSubmittedFormData.salespersonCode);
 addOrUpdateScheduledClient(
 lastSubmittedFormData,
 calendarResult,
 null,
 {
 status: 'Meeting Scheduled',
 sheetSynced,
 salespersonName: matchedSp?.name,
 }
 );

 if (lastSubmittedFormData.sourceLeadId && sheetSynced) {
 updateNewLeadStatus(lastSubmittedFormData.sourceLeadId, 'Meeting Scheduled');
 }

 // Log action to Team Audit Trail
 logAuditActivity({
 actionType: 'schedule_client',
 clientName: lastSubmittedFormData.clientName,
 clientPhone: lastSubmittedFormData.clientPhone,
 tabName: lastSubmittedFormData.leadSource || 'Scheduled',
 details: `Scheduled appointment on ${lastSubmittedFormData.appointmentDate} at ${lastSubmittedFormData.startTime || 'Time unset'} with ${matchedSp?.name || 'Assigned Agent'}`,
 });

 setIsConfirmationOpen(false);
 setIsScheduleModalOpen(false);
 setPendingPayload(null);
 setLastSubmittedFormData(null);
 showToast('success', `Appointment for "${lastSubmittedFormData.clientName}" published to Google Calendar!`);
 window.dispatchEvent(new CustomEvent('dashboard_data_refresh'));
 } catch (err: any) {
 console.error('Failed to publish calendar event:', err);
 setIsConfirmationOpen(false);
 const isConflict = err?.message?.includes('already has an appointment');
 if (isConflict) {
 showToast('error', 'This salesperson already has an appointment at this time.');
 } else {
 showToast('error', 'The shared calendar is currently unavailable. Please contact an administrator.');
 }
 } finally {
 setIsSubmitting(false);
 }
 };

 // Handle Add Lead form submit -> append to Sheets & Houzz Pro
 const handleAddLeadSubmit = async (payload: AddLeadPayload) => {
 setIsSubmitting(true);
 try {
 let sheetSent = false;

 // Save immediately so the lead appears in New Leads even while external
 // services are slow or unavailable.
 const createdLead = await addNewLead(payload);
 const houzzSent = ['accepted by zapier', 'created in houzz pro'].some((status) =>
  String(createdLead.houzzStatus || createdLead.houzzResult || '').toLowerCase().includes(status)
 );
 sheetSent = true;

 // The sidebar page named "New" is the single destination for newly created leads.
 // Open it immediately; external integrations may continue while the lead is visible.
 setIsAddLeadModalOpen(false);
 navigate('/new');
 window.dispatchEvent(new CustomEvent('new_leads_updated'));

 // Log action to Team Audit Trail
 logAuditActivity({
 actionType: 'add_lead',
 clientName: payload.clientName,
 clientPhone: payload.clientPhone,
 tabName: payload.leadSource || 'Manual Entry',
 details: `Added new lead "${payload.clientName}" via ${payload.leadSource || 'Direct'} (${payload.serviceNeeded || 'Service'})`,
 });

 let msg = `Lead for "${payload.clientName}" added to New!`;
 if (houzzSent && sheetSent) msg = `Lead for "${payload.clientName}" added to New and sent to integrations!`;
 else if (sheetSent) msg = `Lead for "${payload.clientName}" added to New and Google Sheets!`;
 showToast('success', msg);
 window.dispatchEvent(new CustomEvent('dashboard_data_refresh'));
 } catch (err: any) {
 console.error('Failed to add lead:', err);
 showToast('error', err.message || 'Failed to add lead.');
 } finally {
 setIsSubmitting(false);
 }
 };

 // Determine current page breadcrumb base in what is chosen in the sidebar / routes
 const getPageBreadcrumb = () => {
 const path = location.pathname;
 const searchParams = new URLSearchParams(location.search);
 const statusParam = searchParams.get('status');
 const tabParam = searchParams.get('tab');

 if (path === '/') return 'Overview';
 if (path === '/new') return 'New';

 if (path === '/leads' || path === '/spreadsheet') {
 if (statusParam) {
 const lower = statusParam.toLowerCase().trim();
 if (lower === 'new' || lower === 'new lead') return 'New';
 if (lower === 'followed up' || lower === 'followed-up') return 'Followed Up';
 if (lower === 'meeting scheduled' || lower.includes('meeting scheduled')) return 'Meeting Scheduled';
 if (lower === 'estimate sent' || lower.includes('estimate sent')) return 'Estimate Sent';
 if (lower.includes('3 day') || lower.includes('3-day')) return '3 day Follow Up';
 if (lower.includes('7 day') || lower.includes('7-day')) return '7 day Follow Up';
 if (lower.includes('15 day') || lower.includes('15-day')) return '15 day Follow Up';
 if (lower.includes('30 day') || lower.includes('30-day')) return '30 day Follow Up';
 if (lower.includes('90') || lower.includes('past 90')) return 'Past 90 day Follow Up';
 if (lower === 'won job' || lower === 'won') return 'Won Job';
 if (lower.includes('refund') && !lower.includes('non')) return 'Lost Job (For Refund)';
 if (lower.includes('nonrefundable') || lower.includes('non-refundable') || (lower.includes('lost') && lower.includes('non'))) return 'Lost Job (Nonrefundable)';
 return statusParam;
 }
 if (tabParam) {
 return `${tabParam} Leads`;
 }
 return 'Leads';
 }

 if (path === '/follow-ups' || path === '/scheduled') return 'Follow-Ups';
 if (path.includes('scheduled-client') || path.includes('schedule-client')) return 'Scheduled Client';
 if (path === '/client') return 'Client Form';
 return 'Portal';
 };



  return (
 <div className="flex h-screen overflow-hidden bg-white dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans antialiased">
 {/* Persistent Global Sidebar across all views with mobile drawer support */}
 <Sidebar
 isOpen={isSidebarOpen}
 setIsOpen={setIsSidebarOpen}
 isMobileOpen={isMobileSidebarOpen}
 setIsMobileOpen={setIsMobileSidebarOpen}
 onOpenSettings={() => setIsSettingsOpen(true)}
 onAddLead={() => setIsAddLeadModalOpen(true)}
 />

 {/* Main Content Area */}
 <div className="flex-1 relative flex flex-col min-w-0 overflow-y-auto pb-20 md:pb-6 bg-white dark:bg-black">
 {/* Global Top Navbar */}
 <header className="sticky top-0 z-30 flex items-center justify-between px-3 sm:px-6 md:px-8 py-2.5 bg-white dark:bg-black border-b border-zinc-200 dark:border-zinc-800 shadow-2xs">
 {/* Left: Mobile Hamburger Menu & Breadcrumb / Brand */}
 <div className="flex items-center gap-2 sm:gap-3 min-w-0">
 {/* Hamburger button on mobile screens */}
 <button
 type="button"
 onClick={() => setIsMobileSidebarOpen(true)}
 aria-label="Open navigation menu"
 className="md:hidden p-1.5 -ml-1 rounded-md text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-120 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
 >
 <Menu className="w-5 h-5"/>
 </button>

 <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm truncate">
 <img
 src="/mr-contract-logo.png"
 alt="Mr. Contract"
 className="w-20 sm:w-24 h-7 object-contain shrink-0"
 />
 <span className="text-zinc-400 dark:text-zinc-600 font-medium">/</span>
 <span className="font-bold text-black dark:text-zinc-300 truncate">{getPageBreadcrumb()}</span>
 </div>
 </div>

 {/* Right Action Controls */}
 <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
 {/* Calendar Connection Status Badge */}
 {isCheckingCalendar ? (
 <button
 type="button"
 onClick={() => {
 setSettingsInitialTab('integrations');
 setSettingsInitialSubTab('connections');
 setIsSettingsOpen(true);
 }}
 className="flex items-center gap-1.5 px-2.5 h-[34px] bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-600 dark:text-zinc-300 text-xs font-semibold cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors duration-120"
 title="Checking backend calendar status..."
 >
 <span className="w-2 h-2 rounded-full bg-zinc-400" />
 <span className="hidden sm:inline">Checking calendar…</span>
 </button>
 ) : calendarStatus?.connected ? (
 <button
 type="button"
 onClick={() => {
 setSettingsInitialTab('integrations');
 setSettingsInitialSubTab('connections');
 setIsSettingsOpen(true);
 }}
 className="flex items-center gap-1.5 px-2.5 h-[34px] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-md text-emerald-800 dark:text-emerald-300 text-xs font-semibold cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors duration-120"
 title="Google Calendar connected securely via backend. Click to view settings."
 >
 <span className="w-2 h-2 rounded-full bg-emerald-500" />
 <span className="hidden sm:inline">Calendar connected</span>
 </button>
 ) : (
 <button
 type="button"
 onClick={handleReconnectCalendar}
 disabled={isReconnectingCalendar}
 className="flex items-center gap-1.5 px-2.5 h-[34px] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-md text-red-700 dark:text-red-300 text-xs font-semibold cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors duration-120 disabled:opacity-60"
 title="Google Calendar authorization expired. Click to reconnect without signing out of the CRM."
 >
 <span className="w-2 h-2 rounded-full bg-red-500" />
 <span className="hidden sm:inline">{isReconnectingCalendar ? 'Reconnecting…' : 'Reconnect calendar'}</span>
 </button>
 )}

 {/* Theme Toggle */}
 <button
 onClick={toggleTheme}
 className="p-2 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors duration-120 cursor-pointer shadow-2xs h-[34px] w-[34px] flex items-center justify-center"
 title={config.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
 aria-label={config.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
 >
 {config.theme === 'dark' ? <Moon className="w-4 h-4 text-zinc-700 dark:text-zinc-300"/> : <Sun className="w-4 h-4 text-zinc-700 dark:text-zinc-300"/>}
 </button>
 </div>
 </header>


        {/* Global Toast Notification */}
       {toastMessage && (
         <div
           role="status"
           aria-live="polite"
           className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:top-6 z-50 max-w-md pointer-events-auto"
         >
           <div
             className={`px-4 py-3 rounded-xl shadow-lg border flex items-center justify-between gap-3 text-xs font-semibold ${
               toastMessage.type === 'success'
                 ? 'bg-emerald-900/95 dark:bg-emerald-950 border-emerald-700 dark:border-emerald-800 text-white'
                 : 'bg-red-900/95 dark:bg-red-950 border-red-700 dark:border-red-800 text-white'
             }`}
           >
             <span className="truncate">{toastMessage.text}</span>
             <button
               type="button"
               onClick={() => setToastMessage(null)}
               aria-label="Dismiss notification"
               className="p-1 rounded-lg hover:bg-white/20 transition-colors text-white/80 hover:text-white cursor-pointer shrink-0"
             >
               <X className="w-3.5 h-3.5" />
             </button>
           </div>
         </div>
       )}

       {/* Child Pages Outlet */}
 <Outlet
 context={{
 config,
 handleSaveConfig,
 toggleTheme,
 user: null,
 handleSignIn: () => {},
 handleSignOut: () => {},
 isLoggingIn: false,
 setIsSettingsOpen,
 openScheduleModal: () => setIsScheduleModalOpen(true),
 openAddLeadModal: () => setIsAddLeadModalOpen(true),
 }}
 />

 {/* Mobile Bottom Navigation Bar (Phone thumb-friendly) */}
 <nav
 aria-label="Mobile Navigation"
 className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white dark:bg-black border-t border-zinc-200 dark:border-zinc-800 px-2 py-1 pb-safe flex items-center justify-around shadow-md"
 >
 {/* NEW Leads */}
 <NavLink
 to="/new"
 className={({ isActive }) =>
 `flex flex-col items-center justify-center py-1 px-1.5 rounded-md transition-colors duration-120 min-w-[50px] min-h-[44px] relative ${
 isActive
 ? 'text-[#EF7E15] font-bold'
 : 'text-zinc-500 dark:text-zinc-400 font-medium'
 }`
 }
 >
 <div className="relative">
 <User className="w-4.5 h-4.5"/>
 {newLeadsCount > 0 && (
 <span className="absolute -top-1.5 -right-2 px-1 min-w-[16px] h-4 rounded-md bg-[#EF7E15] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
 {newLeadsCount}
 </span>
 )}
 </div>
 <span className="text-[10px] tracking-tight mt-0.5">NEW</span>
 </NavLink>

 {/* Dashboard */}
 <NavLink
 to="/"
 end
 className={({ isActive }) =>
 `flex flex-col items-center justify-center py-1 px-1.5 rounded-md transition-colors duration-120 min-w-[50px] min-h-[44px] ${
 isActive
 ? 'text-[#EF7E15] font-bold'
 : 'text-zinc-500 dark:text-zinc-400 font-medium'
 }`
 }
 >
 <LayoutGrid className="w-4.5 h-4.5"/>
 <span className="text-[10px] tracking-tight mt-0.5">Overview</span>
 </NavLink>

 {/* Center Action Button: + Add Lead */}
 <button
 type="button"
 onClick={() => setIsAddLeadModalOpen(true)}
 className="flex flex-col items-center justify-center -mt-3 group cursor-pointer transition-colors duration-120"
 aria-label="Add Lead"
 >
 <div className="w-10 h-10 rounded-md bg-[#EF7E15] group-hover:bg-[#D66B0F] text-white flex items-center justify-center shadow-xs">
 <Plus className="w-5 h-5 stroke-[2.5]"/>
 </div>
 <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 mt-0.5">Add Lead</span>
 </button>

 {/* Leads */}
 <NavLink
 to="/leads"
 className={({ isActive }) =>
 `flex flex-col items-center justify-center py-1 px-1.5 rounded-md transition-colors duration-120 min-w-[50px] min-h-[44px] relative ${
 isActive
 ? 'text-[#EF7E15] font-bold'
 : 'text-zinc-500 dark:text-zinc-400 font-medium'
 }`
 }
 >
 <Users className="w-4.5 h-4.5"/>
 <span className="text-[10px] tracking-tight mt-0.5">Leads</span>
 </NavLink>

 {/* Follow-Ups */}
 <NavLink
 to="/follow-ups"
 className={({ isActive }) =>
 `flex flex-col items-center justify-center py-1 px-1.5 rounded-md transition-colors duration-120 min-w-[50px] min-h-[44px] ${
 isActive
 ? 'text-[#EF7E15] font-bold'
 : 'text-zinc-500 dark:text-zinc-400 font-medium'
 }`
 }
 >
 <Clock className="w-4.5 h-4.5"/>
 <span className="text-[10px] tracking-tight mt-0.5">Follow-Ups</span>
 </NavLink>
 </nav>
 </div>

 {/* Schedule Appointment Modal Dialog */}
 {isScheduleModalOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 overflow-y-auto">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md w-full max-w-[1500px] p-4 sm:p-6 max-h-[94vh] overflow-y-auto shadow-lg relative">
 <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
 <div className="flex items-center gap-2.5">
 <div className="w-8 h-8 rounded-md bg-[#EF7E15]/10 flex items-center justify-center text-[#EF7E15]">
 <CalendarClock className="w-4 h-4"/>
 </div>
 <div>
 <h2 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">Schedule Appointment</h2>
 </div>
 </div>
 <button
 onClick={() => {
 setIsScheduleModalOpen(false);
 setSchedulePrefillData(null);
 }}
 className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors duration-120"
 >
 <X className="w-4 h-4"/>
 </button>
 </div>

 <AppointmentForm
 config={config}
 onSubmit={handleScheduleSubmit}
 isSubmitting={isSubmitting}
 initialFormData={schedulePrefillData}
 />
 </div>
 </div>
 )}

 {/* Add Lead Modal Dialog */}
 {isAddLeadModalOpen && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 overflow-y-auto">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md w-full max-w-2xl p-4 sm:p-6 max-h-[94vh] overflow-y-auto shadow-lg relative">
 <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
 <div className="flex items-center gap-2.5">
 <div className="w-8 h-8 rounded-md bg-[#EF7E15]/10 flex items-center justify-center text-[#EF7E15]">
 <PlusCircle className="w-4 h-4"/>
 </div>
 <div>
 <h2 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">Add New Lead</h2>
 </div>
 </div>
 <button
 onClick={() => setIsAddLeadModalOpen(false)}
 className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors duration-120"
 >
 <X className="w-4 h-4"/>
 </button>
 </div>

 <AddLeadForm
 config={config}
 onSubmitLead={handleAddLeadSubmit}
 isSubmitting={isSubmitting}
 />
 </div>
 </div>
 )}

 {/* Event Publish Confirmation Modal */}
 <ConfirmationModal
 isOpen={isConfirmationOpen}
 onClose={() => setIsConfirmationOpen(false)}
 onConfirm={handleConfirmPublish}
 payload={pendingPayload}
 isSubmitting={isSubmitting}
 />

 {/* Global Settings Modal */}
 <SettingsModal
 isOpen={isSettingsOpen}
 onClose={() => setIsSettingsOpen(false)}
 config={config}
 onSaveConfig={handleSaveConfig}
 initialTab={settingsInitialTab}
 initialSubTab={settingsInitialSubTab}
 />

 {/* Switch User & Activity Log Modals */}
 <SwitchUserModal />
 <ActivityLogModal />
 </div>
 );
};
