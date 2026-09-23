import React, { useState, useEffect } from 'react';
import { useUser } from '../lib/userContext';
import { fetchActivityLogs } from '../lib/activityLogger';
import { ActivityLog } from '../types';
import {
 X,
 History,
 Search,
 Filter,
 RefreshCw,
 Phone,
 MessageSquare,
 CalendarCheck,
 UserPlus,
 Tag,
 AlertCircle,
 Clock,
 ArrowRight,
 Layers,
} from 'lucide-react';

export const ActivityLogModal: React.FC = () => {
 const { isActivityLogModalOpen, setIsActivityLogModalOpen, users } = useUser();
 const [logs, setLogs] = useState<ActivityLog[]>([]);
 const [isLoading, setIsLoading] = useState(false);
 const [searchQuery, setSearchQuery] = useState('');
 const [selectedUserFilter, setSelectedUserFilter] = useState('ALL');
 const [selectedTypeFilter, setSelectedTypeFilter] = useState('ALL');

 const loadLogs = async () => {
 setIsLoading(true);
 try {
 const data = await fetchActivityLogs({ limit: 150 });
 setLogs(data);
 } finally {
 setIsLoading(false);
 }
 };

 useEffect(() => {
 if (isActivityLogModalOpen) {
 loadLogs();
 }
 }, [isActivityLogModalOpen]);

 useEffect(() => {
 const handleLog = (e: any) => {
 if (e.detail) {
 setLogs((prev) => [e.detail, ...prev.filter((l) => l.id !== e.detail.id)]);
 }
 };
 window.addEventListener('activity_logged', handleLog);
 return () => window.removeEventListener('activity_logged', handleLog);
 }, []);

 useEffect(() => {
 const handleOpenModal = () => setIsActivityLogModalOpen(true);
 window.addEventListener('open_activity_log_modal', handleOpenModal);
 return () => window.removeEventListener('open_activity_log_modal', handleOpenModal);
 }, [setIsActivityLogModalOpen]);

   useEffect(() => {
    if (!isActivityLogModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsActivityLogModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActivityLogModalOpen, setIsActivityLogModalOpen]);

if (!isActivityLogModalOpen) return null;

 // Filter logs
 const filteredLogs = logs.filter((log) => {
 if (selectedUserFilter !== 'ALL' && log.userName.toLowerCase() !== selectedUserFilter.toLowerCase()) {
 return false;
 }
 if (selectedTypeFilter !== 'ALL' && log.actionType !== selectedTypeFilter) {
 return false;
 }
 if (searchQuery.trim()) {
 const q = searchQuery.toLowerCase().trim();
 const matchClient = log.clientName?.toLowerCase().includes(q);
 const matchDetails = log.details.toLowerCase().includes(q);
 const matchUser = log.userName.toLowerCase().includes(q);
 const matchOld = log.oldValue?.toLowerCase().includes(q);
 const matchNew = log.newValue?.toLowerCase().includes(q);
 if (!matchClient && !matchDetails && !matchUser && !matchOld && !matchNew) {
 return false;
 }
 }
 return true;
 });

 const getActionIcon = (type: ActivityLog['actionType']) => {
 switch (type) {
 case 'add_lead':
 return <UserPlus className="w-4 h-4 text-[#EF7E15]"/>;
 case 'schedule_client':
 return <CalendarCheck className="w-4 h-4 text-emerald-500"/>;
 case 'call':
 return <Phone className="w-4 h-4 text-emerald-500"/>;
 case 'status_change':
 return <Tag className="w-4 h-4 text-zinc-500 dark:text-zinc-400"/>;
 case 'sms':
 return <MessageSquare className="w-4 h-4 text-zinc-500 dark:text-zinc-400"/>;
 case 'note':
 return <AlertCircle className="w-4 h-4 text-zinc-500 dark:text-zinc-400"/>;
 default:
 return <History className="w-4 h-4 text-zinc-500 dark:text-zinc-400"/>;
 }
 };

 const getActionBadgeClass = (type: ActivityLog['actionType']) => {
 switch (type) {
 case 'add_lead':
 return 'bg-orange-500/10 text-[#EF7E15] border-orange-500/20';
 case 'schedule_client':
 return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
 case 'call':
 return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
 default:
 return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
 }
 };

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md w-full max-w-4xl p-4 sm:p-5 shadow-xl relative max-h-[92vh] flex flex-col">
 {/* Header */}
 <div className="flex items-center justify-between pb-3.5 mb-3 border-b border-zinc-100 dark:border-zinc-800">
 <div className="flex items-center gap-3">
 <div className="w-9 h-9 rounded-md bg-[#EF7E15]/10 flex items-center justify-center text-[#EF7E15]">
 <History className="w-4 h-4"/>
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-base font-bold text-zinc-900 dark:text-white leading-tight">Team Activity History</h2>
 <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-400 tabular-nums">
 {filteredLogs.length} events
 </span>
 </div>
 <p className="text-xs text-zinc-500 dark:text-zinc-400">Real-time audit log of all updates made across the team</p>
 </div>
 </div>

 <div className="flex items-center gap-1.5">
 <button
 onClick={loadLogs}
 disabled={isLoading}
 title="Refresh logs"
 aria-label="Refresh logs"
 className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors duration-120 disabled:opacity-50 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#EF7E15]"
 >
 <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
 </button>
 <button
 onClick={() => setIsActivityLogModalOpen(false)}
 className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors duration-120"
 >
 <X className="w-4 h-4"/>
 </button>
 </div>
 </div>

 {/* Filter Bar */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
 {/* Search */}
 <div className="relative">
 <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2"/>
 <input
 type="text"
 placeholder="Search lead or action..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-900 dark:text-white outline-none focus:border-[#EF7E15] transition-colors duration-120"
 />
 </div>

 {/* Filter by Worker */}
 <div>
 <select
 value={selectedUserFilter}
 onChange={(e) => setSelectedUserFilter(e.target.value)}
 className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-900 dark:text-white outline-none focus:border-[#EF7E15] cursor-pointer transition-colors duration-120"
 >
 <option value="ALL">All Team Members</option>
 {users.map((u) => (
 <option key={u.id} value={u.name}>
 {u.name}
 </option>
 ))}
 </select>
 </div>

 {/* Filter by Action Type */}
 <div>
 <select
 value={selectedTypeFilter}
 onChange={(e) => setSelectedTypeFilter(e.target.value)}
 className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-medium text-zinc-900 dark:text-white outline-none focus:border-[#EF7E15] cursor-pointer transition-colors duration-120"
 >
 <option value="ALL">All Actions</option>
 <option value="status_change">Status Changes</option>
 <option value="schedule_client">Appointments Scheduled</option>
 <option value="add_lead">New Leads Added</option>
 <option value="call">Phone Calls</option>
 <option value="sms">Text Messages</option>
 <option value="note">Notes & Updates</option>
 </select>
 </div>
 </div>

 {/* Logs Feed */}
 <div className="flex-1 overflow-y-auto space-y-2 pr-1">
 {isLoading && logs.length === 0 ? (
 <div className="py-14 flex flex-col items-center justify-center text-zinc-400 gap-2">
 <div className="w-5 h-5 border-2 border-[#EF7E15] border-t-transparent rounded-full animate-spin"/>
 <span className="text-xs font-medium">Loading activity...</span>
 </div>
 ) : filteredLogs.length === 0 ? (
 <div className="py-14 text-center text-zinc-400 dark:text-zinc-500">
 <History className="w-7 h-7 mx-auto mb-2 opacity-40"/>
 <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">No activity recorded</p>
 <p className="text-[11px] mt-1">Team actions and updates will appear here.</p>
 </div>
 ) : (
 filteredLogs.map((log) => {
 const initial = log.userName ? log.userName.trim().charAt(0).toUpperCase() : 'W';
 const logDate = new Date(log.timestamp);
 const formattedTime = logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
 const formattedDate = logDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

 return (
 <div
 key={log.id}
 className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors duration-120 flex items-start gap-3"
 >
 {/* User Avatar */}
 <div
 className="w-7 h-7 rounded-md flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-xs mt-0.5 bg-[#EF7E15]"
 title={`Action by ${log.userName}`}
 >
 {initial}
 </div>

 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div className="flex items-center gap-1.5 flex-wrap">
 <span className="text-xs font-bold text-zinc-900 dark:text-white">
 {log.userName}
 </span>
 <span
 className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${getActionBadgeClass(
 log.actionType
 )}`}
 >
 {getActionIcon(log.actionType)}
 <span>{log.actionType.replace('_', ' ')}</span>
 </span>
 {log.clientName && (
 <span className="text-[11px] font-bold text-[#EF7E15] bg-[#EF7E15]/10 px-1.5 py-0.5 rounded-md">
 {log.clientName}
 </span>
 )}
 </div>

 <div className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium shrink-0 tabular-nums">
 <Clock className="w-3 h-3"/>
 <span>{formattedDate} at {formattedTime}</span>
 </div>
 </div>

 {/* Action Details */}
 <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium mt-1 leading-relaxed">
 {log.details}
 </p>

 {/* Status change pill if available */}
 {log.oldValue && log.newValue && (
 <div className="flex items-center gap-1.5 mt-1.5 text-[11px] tabular-nums">
 <span className="px-1.5 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium line-through">
 {log.oldValue}
 </span>
 <ArrowRight className="w-3 h-3 text-zinc-400"/>
 <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
 {log.newValue}
 </span>
 </div>
 )}
 </div>
 </div>
 );
 })
 )}
 </div>

 {/* Footer */}
 <div className="pt-2.5 mt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
 <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
 Synced automatically with all active devices
 </span>
 <button
 type="button"
 onClick={() => setIsActivityLogModalOpen(false)}
 className="px-3.5 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors duration-120 cursor-pointer"
 >
 Close
 </button>
 </div>
 </div>
 </div>
 );
};
