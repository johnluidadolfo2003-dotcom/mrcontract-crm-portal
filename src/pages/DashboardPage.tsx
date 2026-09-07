import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
 Users,
 Calendar,
 Clock,
 CalendarDays,
 RefreshCw,
 PlusCircle,
 ShieldCheck,
 Database,
 MapPin,
 ArrowUpRight,
} from 'lucide-react';
import { AppConfig } from '../types';
import { loadAppConfig } from '../config';
import { getNewLeads } from '../lib/newLeads';
import { getScheduledClients, ScheduledClientRecord } from '../lib/scheduledClients';
import { extractSpreadsheetId, readAllSpreadsheetTabs, SheetRowRecord } from '../lib/sheets';
import { DEFAULT_LEAD_SOURCES, isLeadSourceTab } from '../config';
import { isFollowUpStatus } from '../lib/utils';
import { formatTime12Hour, formatAppointmentDateTime } from '../lib/calendar';

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

export const Dashboard: React.FC = () => {
 const navigate = useNavigate();
 const outletCtx = useOutletContext<DashboardOutletContext | undefined>();
 const config = outletCtx?.config || loadAppConfig();

 const [loading, setLoading] = useState(false);
 const [refreshing, setRefreshing] = useState(false);
 const [scheduledList, setScheduledList] = useState<ScheduledClientRecord[]>(() => getScheduledClients());
 const [sheetRecords, setSheetRecords] = useState<SheetRowRecord[]>([]);

 // Open modal handlers
 const handleOpenSchedule = () => {
 if (outletCtx?.openScheduleModal) {
 outletCtx.openScheduleModal();
 } else {
 window.dispatchEvent(new CustomEvent('open_schedule_modal'));
 }
 };

 const handleOpenAddLead = () => {
 if (outletCtx?.openAddLeadModal) {
 outletCtx.openAddLeadModal();
 } else {
 window.dispatchEvent(new CustomEvent('open_add_lead_modal'));
 }
 };

 // Fetch / Sync Live Data
 const loadDashboardData = useCallback(async () => {
 // 1. Load Local Scheduled Clients
 const localScheduled = getScheduledClients();
 setScheduledList(localScheduled);

 // 2. Load from Google Sheets via Service Account backend
 const spreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');

 if (!spreadsheetId) {
 setRefreshing(false);
 setLoading(false);
 return;
 }

 try {
 setRefreshing(true);
 const validTabs = (config.leadSources && config.leadSources.length > 0
 ? config.leadSources
 : DEFAULT_LEAD_SOURCES).filter(isLeadSourceTab);

 const tabsResult = await readAllSpreadsheetTabs(undefined, spreadsheetId, validTabs);
 if (tabsResult && tabsResult.rows) {
 const cleanRows = tabsResult.rows.filter(
 (r) => isLeadSourceTab(r.tabName) && isLeadSourceTab(r.leadSource)
 );
 setSheetRecords(cleanRows);
 }
 } catch (err) {
 console.warn('Dashboard live sheet sync fallback:', err);
 } finally {
 setRefreshing(false);
 setLoading(false);
 }
 }, [config.spreadsheetId, config.leadSources]);

 useEffect(() => {
 loadDashboardData();

 const handleDataRefresh = () => {
 loadDashboardData();
 };

 window.addEventListener('dashboard_data_refresh', handleDataRefresh);
 window.addEventListener('scheduled_clients_updated', handleDataRefresh);

 return () => {
 window.removeEventListener('dashboard_data_refresh', handleDataRefresh);
 window.removeEventListener('scheduled_clients_updated', handleDataRefresh);
 };
 }, [loadDashboardData]);

 // Today's date helper (e.g."2026-08-29")
 const todayStr = useMemo(() => {
 const now = new Date();
 const year = now.getFullYear();
 const month = String(now.getMonth() + 1).padStart(2, '0');
 const day = String(now.getDate()).padStart(2, '0');
 return `${year}-${month}-${day}`;
 }, []);

 // Formatted date display (e.g."Saturday, Aug 29, 2026")
 const formattedTodayHeader = useMemo(() => {
 return new Date().toLocaleDateString('en-US', {
 weekday: 'long',
 month: 'short',
 day: 'numeric',
 year: 'numeric',
 });
 }, []);

 // Filter Today's Appointments from Scheduled Clients
 const todayAppointments = useMemo(() => {
 return scheduledList.filter((item) => {
 if (!item.appointmentDate) return false;
 const normalizedDate = item.appointmentDate.trim().slice(0, 10);
 return normalizedDate === todayStr;
 });
 }, [scheduledList, todayStr]);

 // Derive New Leads Count
 const newLeadsCount = useMemo(() => {
 if (sheetRecords.length > 0) {
 return sheetRecords.filter((r) => {
 const s = (r.status || '').toLowerCase().trim();
 return s === 'new' || s === 'new inquiry' || s === 'uncontacted' || s === 'pending';
 }).length;
 }
 return getNewLeads().length;
 }, [sheetRecords]);

 // Derive Appointments Today Count
 const appointmentsTodayCount = todayAppointments.length;

 // Derive Follow-Ups Due Count
 const followUpsCount = useMemo(() => {
 if (sheetRecords.length > 0) {
 return sheetRecords.filter((r) => isFollowUpStatus(r.status)).length;
 }
 return 0;
 }, [sheetRecords]);

 return (
 <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
 {/* Dashboard Top Header Bar */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">


 {/* Action Buttons */}
 <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full sm:w-auto">
 {/* Refresh Button */}
 <button
 onClick={loadDashboardData}
 disabled={refreshing}
 className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 text-zinc-700 dark:text-zinc-300 transition-all shadow-2xs cursor-pointer disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
 title="Refresh dashboard stats"
 >
 <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#FF5500]' : ''}`} />
 </button>

 
 </div>
 </div>

 {/* KPI Stats Overview Cards (2-Column Grid) */}
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
 {/* Card 1: New Leads */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
 <div className="flex items-center justify-between">
 <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-[#FF5500]">
 <Users className="w-5 h-5"/>
 </div>
 <button
 onClick={() => navigate('/leads')}
 className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors group"
 >
 <span>View</span>
 <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-"/>
 </button>
 </div>
 <div className="mt-4">
 <div className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
 {newLeadsCount}
 </div>
 <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-1">
 New Leads
 </div>
 <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
 Needs initial contact call
 </div>
 </div>
 </div>

 {/* Card 2: Appointments Today */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-5 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col justify-between">
 <div className="flex items-center justify-between">
 <div className="w-10 h-10 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200">
 <Calendar className="w-5 h-5"/>
 </div>
 <button
 onClick={() => navigate('/scheduled-client')}
 className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors group"
 >
 <span>View</span>
 <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-"/>
 </button>
 </div>
 <div className="mt-4">
 <div className="text-3xl sm:text-4xl font-black text-zinc-900 dark:text-white tracking-tight">
 {appointmentsTodayCount}
 </div>
 <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100 mt-1">
 Appointments Today
 </div>
 <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
 On-site visits scheduled
 </div>
 </div>
 </div>
 </div>

 {/* Today's Schedule Full Card */}
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-5 sm:p-6 shadow-2xs">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-700 dark:text-zinc-200 shrink-0">
 <Calendar className="w-4 h-4"/>
 </div>
 <div>
 <h2 className="text-sm sm:text-base font-extrabold text-zinc-900 dark:text-white leading-tight">
 Today's Schedule ({todayAppointments.length})
 </h2>
 <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
 {formattedTodayHeader}
 </p>
 </div>
 </div>
 <button
 onClick={() => navigate('/scheduled-client')}
 className="text-xs font-bold text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white flex items-center gap-1 cursor-pointer transition-colors group self-start sm:self-auto"
 >
 <span>Full Calendar</span>
 <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-"/>
 </button>
 </div>

 {/* Body */}
 <div className="py-6">
 {todayAppointments.length === 0 ? (
 <div className="flex flex-col items-center justify-center text-center py-8">
 <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-400 dark:text-zinc-500 mb-3">
 <CalendarDays className="w-6 h-6 stroke-[1.5]"/>
 </div>
 <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
 No appointments scheduled for today.
 </p>

 <div className="flex items-center gap-2.5 mt-4">
 <button
 onClick={handleOpenSchedule}
 className="px-4 py-2 bg-[#FF5500] hover:bg-[#E64D00] text-white text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer"
 >
 Schedule an Appointment
 </button>
 <button
 onClick={() => navigate('/scheduled-client')}
 className="px-4 py-2 bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 cursor-pointer"
 >
 View Upcoming Calendar
 </button>
 </div>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
 {todayAppointments.map((appt) => (
 <div
 key={appt.id}
 onClick={() => navigate('/scheduled-client')}
 className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-all cursor-pointer flex items-center justify-between gap-3"
 >
 <div className="flex items-center gap-3 min-w-0">
 <div className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs shrink-0 flex items-center gap-1">
 <Clock className="w-3 h-3 text-zinc-500 dark:text-zinc-400 shrink-0"/>
 <span>{formatTime12Hour(appt.startTime) || '09:00 AM'}{appt.endTime ? ` - ${formatTime12Hour(appt.endTime)}` : ''}</span>
 </div>
 <div className="min-w-0">
 <p className="font-extrabold text-xs text-zinc-900 dark:text-white truncate">
 {appt.clientName}
 </p>
 <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate flex items-center gap-1">
 <MapPin className="w-3 h-3 shrink-0 text-zinc-400"/>
 <span>{appt.address || appt.serviceNeeded || 'On-site estimate'}</span>
 </p>
 <p className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
 {formatAppointmentDateTime(appt.appointmentDate, appt.startTime, appt.endTime)}
 </p>
 </div>
 </div>
 <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
 {appt.status || 'Scheduled'}
 </span>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 );
};
