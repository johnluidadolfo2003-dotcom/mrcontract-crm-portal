import React, { useState, useEffect } from 'react';
import {
 Calendar,
 CheckCircle2,
 Clock,
 AlertCircle,
 Phone,
 Mail,
 User,
 Filter,
 RefreshCw,
 ExternalLink,
 ChevronRight,
 UserPlus,
 CalendarClock
} from 'lucide-react';
import { TaskItem, LeadItem, LEAD_STATUS_OPTIONS } from '../types';
import { useUser } from '../lib/userContext';
import { LeadDrawer } from '../components/ui/LeadDrawer';
import { loadAppConfig } from '../config';

export const TodayTasksPage: React.FC = () => {
 const { currentUser } = useUser();
 const config = loadAppConfig();
 const [tasks, setTasks] = useState<TaskItem[]>([]);
 const [isLoading, setIsLoading] = useState(true);
 const [selectedRep, setSelectedRep] = useState<string>('all');
 const [selectedCategory, setSelectedCategory] = useState<string>('all');
 const [selectedLeadForDrawer, setSelectedLeadForDrawer] = useState<any | null>(null);
 const [isDrawerOpen, setIsDrawerOpen] = useState(false);

 const fetchTasks = async () => {
 setIsLoading(true);
 try {
 const res = await fetch('/api/tasks/today');
 if (res.ok) {
 const data = await res.json();
 if (data.success && Array.isArray(data.tasks)) {
 setTasks(data.tasks);
 }
 }
 } catch (err) {
 console.warn('Failed to fetch today tasks from backend:', err);
 } finally {
 setIsLoading(false);
 }
 };

 useEffect(() => {
 fetchTasks();
 }, []);

 const handleOpenLead = (task: TaskItem) => {
 // Construct lead object for drawer
 const leadObj: any = {
 id: task.leadId,
 clientName: task.clientName,
 clientPhone: task.clientPhone,
 clientEmail: task.clientEmail,
 status: task.status,
 leadSource: task.leadSource || 'Direct',
 ownerName: task.assignedRep,
 };
 setSelectedLeadForDrawer(leadObj);
 setIsDrawerOpen(true);
 };

 const filteredTasks = tasks.filter((task) => {
 if (selectedRep !== 'all' && task.assignedRep && !task.assignedRep.toLowerCase().includes(selectedRep.toLowerCase())) {
 return false;
 }
 if (selectedCategory !== 'all' && task.category !== selectedCategory) {
 return false;
 }
 return true;
 });

 const appointments = filteredTasks.filter((t) => t.category === 'appointment');
 const newLeads = filteredTasks.filter((t) => t.category === 'new_lead');
 const followUps = filteredTasks.filter((t) => t.category === 'follow_up_3d' || t.category === 'follow_up_7d');

 return (
 <div className="flex-1 p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">
 {/* Header */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 dark:border-zinc-800">
 <div>
 <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
 Tasks
 <span className="text-xs px-2.5 py-1 rounded-full bg-[#EF7E15]/10 text-[#EF7E15] font-black border border-[#EF7E15]/20">
 {filteredTasks.length} Active
 </span>
 </h1>
 <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
 Prioritized appointments, overdue follow-ups, and urgent new leads for today.
 </p>
 </div>

 <div className="flex items-center gap-2">
 <button
 type="button"
 onClick={fetchTasks}
 disabled={isLoading}
 className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors flex items-center justify-center min-w-[44px] min-h-[44px] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#EF7E15]"
 title="Refresh tasks"
 aria-label="Refresh tasks"
 >
 <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#EF7E15]' : ''}`} />
 </button>
 </div>
 </div>

 {/* Filter Toolbar */}
 <div className="flex flex-wrap items-center gap-3 py-4">
 {/* Category Filters */}
 <div className="flex items-center gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold">
 <button
 type="button"
 onClick={() => setSelectedCategory('all')}
 className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
 selectedCategory === 'all'
 ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
 : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
 }`}
 >
 All Tasks ({tasks.length})
 </button>
 <button
 type="button"
 onClick={() => setSelectedCategory('appointment')}
 className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
 selectedCategory === 'appointment'
 ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
 : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
 }`}
 >
 Appointments
 </button>
 <button
 type="button"
 onClick={() => setSelectedCategory('new_lead')}
 className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
 selectedCategory === 'new_lead'
 ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
 : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
 }`}
 >
 New Leads
 </button>
 <button
 type="button"
 onClick={() => setSelectedCategory('follow_up_3d')}
 className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
 selectedCategory === 'follow_up_3d'
 ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
 : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
 }`}
 >
 Follow-Ups
 </button>
 </div>

 {/* Assigned Rep Filter */}
 <select
 value={selectedRep}
 onChange={(e) => setSelectedRep(e.target.value)}
 className="px-3 py-1.5 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 cursor-pointer"
 >
 <option value="all">All Reps</option>
 {config.salespeople?.map((sp) => (
 <option key={sp.code} value={sp.name || sp.code}>
 {sp.name || sp.code} ({sp.code})
 </option>
 ))}
 </select>
 </div>

 {/* Task List Grid */}
 {isLoading ? (
 <div className="py-20 text-center">
 <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#EF7E15]"/>
 <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 mt-2">Loading tasks...</p>
 </div>
 ) : filteredTasks.length === 0 ? (
 <div className="py-16 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white/50 dark:bg-zinc-900/30">
 <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 stroke-[1.5]"/>
 <h3 className="text-base font-bold text-zinc-800 dark:text-zinc-200 mt-3">All Caught Up!</h3>
 <p className="text-xs text-zinc-400 dark:text-zinc-500 max-w-sm mx-auto mt-1">
 No overdue tasks or appointments pending right now.
 </p>
 </div>
 ) : (
 <div className="space-y-3">
 {filteredTasks.map((task) => {
 const isAppt = task.category === 'appointment';
 const isNew = task.category === 'new_lead';
 const isFollowUp = task.category.startsWith('follow_up');

 return (
 <div
 key={task.id}
 onClick={() => handleOpenLead(task)}
 className="group p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-[#EF7E15] dark:hover:border-[#EF7E15] rounded-2xl shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
 >
 <div className="flex items-start sm:items-center gap-3.5 min-w-0">
 <div
 className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
 isNew
 ? 'bg-[#EF7E15]/10 text-[#EF7E15]'
 : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
 }`}
 >
 {isAppt && <CalendarClock className="w-5 h-5"/>}
 {isNew && <User className="w-5 h-5 text-[#EF7E15]"/>}
 {isFollowUp && <Clock className="w-5 h-5"/>}
 </div>

 <div className="min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <h4 className="font-black text-sm text-zinc-900 dark:text-white group-hover:text-[#EF7E15] transition-colors truncate">
 {task.clientName}
 </h4>
 <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
 {task.status}
 </span>
 </div>

 <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex-wrap">
 <span className="font-semibold text-zinc-700 dark:text-zinc-300">{task.title}</span>
 {task.clientPhone && (
 <span className="flex items-center gap-1 font-mono">
 <Phone className="w-3 h-3 text-[#EF7E15]"/>
 {task.clientPhone}
 </span>
 )}
 </div>
 </div>
 </div>

 <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
 <div className="text-left sm:text-right">
 <div className="text-xs font-black text-zinc-800 dark:text-zinc-200">
 {task.dueTime || 'Today'}
 </div>
 <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500">
 Rep: {task.assignedRep || 'Unassigned'}
 </div>
 </div>

 <button
 type="button"
 onClick={(e) => {
 e.stopPropagation();
 handleOpenLead(task);
 }}
 className="px-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-[#EF7E15] hover:text-white text-zinc-700 dark:text-zinc-300 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
 >
 <span>Open</span>
 <ChevronRight className="w-3.5 h-3.5"/>
 </button>
 </div>
 </div>
 );
 })}
 </div>
 )}

 {/* Lead Drawer */}
 <LeadDrawer
 isOpen={isDrawerOpen}
 onClose={() => {
 setIsDrawerOpen(false);
 setSelectedLeadForDrawer(null);
 fetchTasks();
 }}
 lead={selectedLeadForDrawer}
 onStatusChange={() => {
 fetchTasks();
 }}
 statusOptions={LEAD_STATUS_OPTIONS}
 salespeople={config.salespeople}
 />
 </div>
 );
};
