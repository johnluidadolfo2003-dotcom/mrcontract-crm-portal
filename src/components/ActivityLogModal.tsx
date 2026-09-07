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
 return <UserPlus className="w-4 h-4 text-[#FF5500]"/>;
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
 return 'bg-orange-500/10 text-[#FF5500] border-orange-500/20';
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
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-4xl p-5 sm:p-7 shadow-2xl relative max-h-[92vh] flex flex-col">
 {/* Header */}
 <div className="flex items-center justify-between pb-4 mb-4 border-b border-zinc-100 dark:border-zinc-800">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-[#FF5500]/10 flex items-center justify-center text-[#FF5500]">
 <History className="w-5 h-5"/>
 </div>
 <div>
 <div className="flex items-center gap-2">
 <h2 className="text-lg font-bold text-zinc-900 dark:text-white leading-tight">Team Activity History</h2>
 <span className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-400">
 {filteredLogs.length} events
 </span>
 </div>
 <p className="text-xs text-zinc-500 dark:text-zinc-400">Real-time audit log of all updates made across the team</p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 <button
 onClick={loadLogs}
 disabled={isLoading}
 title="Refresh logs"
 aria-label="Refresh logs"
 className="p-2 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[#FF5500]"
 >
 <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
 </button>
 <button
 onClick={() => setIsActivityLogModalOpen(false)}
 className="p-2 rounded-xl text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
 >
 <X className="w-5 h-5"/>
 </button>
 </div>
 </div>

 {/* Filter Bar */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
 {/* Search */}
 <div className="relative">
 <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2"/>
 <input
 type="text"
 placeholder="Search lead or action..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-[#FF5500]/30"
 />
 </div>

 {/* Filter by Worker */}
 <div>
 <select
 value={selectedUserFilter}
 onChange={(e) => setSelectedUserFilter(e.target.value)}
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-[#FF5500]/30 cursor-pointer"
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
 className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-[#FF5500]/30 cursor-pointer"
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
 <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
 {isLoading && logs.length === 0 ? (
 <div className="py-16 flex flex-col items-center justify-center text-zinc-400 gap-2">
 <div className="w-6 h-6 border-2 border-[#FF5500] border-t-transparent rounded-full animate-spin"/>
 <span className="text-xs font-semibold">Loading activity...</span>
 </div>
 ) : filteredLogs.length === 0 ? (
 <div className="py-16 text-center text-zinc-400 dark:text-zinc-500">
 <History className="w-8 h-8 mx-auto mb-2 opacity-40"/>
 <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200">No activity recorded</p>
 <p className="text-xs mt-1">Team actions and updates will appear here.</p>
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
 className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors flex items-start gap-3.5"
 >
 {/* User Avatar */}
 <div
 className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs mt-0.5 bg-[#FF5500]"
 title={`Action by ${log.userName}`}
 >
 {initial}
 </div>

 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-xs font-black text-zinc-900 dark:text-white">
 {log.userName}
 </span>
 <span
 className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${getActionBadgeClass(
 log.actionType
 )}`}
 >
 {getActionIcon(log.actionType)}
 <span>{log.actionType.replace('_', ' ')}</span>
 </span>
 {log.clientName && (
 <span className="text-xs font-bold text-[#FF5500] bg-[#FF5500]/10 px-2 py-0.5 rounded-lg">
 {log.clientName}
 </span>
 )}
 </div>

 <div className="flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500 font-medium shrink-0">
 <Clock className="w-3 h-3"/>
 <span>{formattedDate} at {formattedTime}</span>
 </div>
 </div>

 {/* Action Details */}
 <p className="text-xs text-zinc-700 dark:text-zinc-300 font-medium mt-1.5 leading-relaxed">
 {log.details}
 </p>

 {/* Status change pill if available */}
 {log.oldValue && log.newValue && (
 <div className="flex items-center gap-1.5 mt-2 text-[11px]">
 <span className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold line-through">
 {log.oldValue}
 </span>
 <ArrowRight className="w-3 h-3 text-zinc-400"/>
 <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
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
 <div className="pt-3 mt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
 <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
 Synced automatically with all active devices
 </span>
 <button
 type="button"
 onClick={() => setIsActivityLogModalOpen(false)}
 className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
 >
 Close
 </button>
 </div>
 </div>
 </div>
 );
};
