import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
 LayoutGrid,
 Users,
 Clock,
 CalendarClock,
 CalendarCheck,
 Settings,
 ChevronLeft,
 ChevronRight,
 PlusCircle,
 UserPlus,
 CheckCircle,
 ShieldAlert,
 Trash2,
 ChevronDown,
 ChevronUp,
 History,
 UserCheck,
 User,
 ListTodo,
 Mail,
} from 'lucide-react';
import { useUser } from '../lib/userContext';
import { getNewLeads } from '../lib/newLeads';
import { getScheduledClients } from '../lib/scheduledClients';
import { isFollowUpStatus, isMeetingScheduledStatus } from '../lib/utils';
import { isLeadSourceTab } from '../config';
import { TrashModal } from './TrashModal';

interface SidebarProps {
 isOpen: boolean;
 setIsOpen: (isOpen: boolean) => void;
 isMobileOpen?: boolean;
 setIsMobileOpen?: (open: boolean) => void;
 onOpenSettings: () => void;
 onAddLead?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
 isOpen,
 setIsOpen,
 isMobileOpen = false,
 setIsMobileOpen,
 onOpenSettings,
 onAddLead,
}) => {
 const navigate = useNavigate();
 const location = useLocation();
 const { currentUser, setIsSwitchUserModalOpen, setIsActivityLogModalOpen } = useUser();
 const [newLeadsCount, setNewLeadsCount] = useState(() => getNewLeads().length);
 const [leadsCount, setLeadsCount] = useState(0);
 const [isFollowUpsOpen, setIsFollowUpsOpen] = useState(false);
 const [isTrashOpen, setIsTrashOpen] = useState(false);
 const [counts, setCounts] = useState<Record<string, number>>({
 'New': 0,
 'Followed Up': 0,
 'Meeting Scheduled': 0,
 'Estimate Sent': 0,
 '3 day Follow Up': 0,
 '7 day Follow Up': 0,
 '15 day Follow Up': 0,
 '30 day Follow Up': 0,
 'Past 90 day Follow Up': 0,
 'Won Job': 0,
 'Lost Job (For Refund)': 0,
 'Lost Job (Nonrefundable)': 0,
 });

 const updateCounts = (passedRows?: any[]) => {
 try {
 const newL = getNewLeads();
 setNewLeadsCount(newL.length);

 let uniqueLeadsMap = new Map<string, any>();
 newL.forEach((l: any) => {
 if (l && l.clientName && !l.clientName.toLowerCase().startsWith('unnamed')) {
 const phoneKey = l.clientPhone ? String(l.clientPhone).replace(/\D/g, '') : '';
 const emailKey = l.clientEmail ? String(l.clientEmail).trim().toLowerCase() : '';
 const nameKey = l.clientName ? String(l.clientName).trim().toLowerCase() : '';
 const uniqueKey = phoneKey.length >= 7 ? phoneKey : (emailKey ? emailKey : nameKey);
 if (uniqueKey) uniqueLeadsMap.set(uniqueKey, l);
 }
 });

 // Include passed rows if available
 if (passedRows && Array.isArray(passedRows)) {
 passedRows.forEach((r: any) => {
 if (r && r.clientName && !r.clientName.toLowerCase().startsWith('unnamed')) {
 if (r.tabName && !isLeadSourceTab(r.tabName)) return;
 if (r.leadSource && !isLeadSourceTab(r.leadSource)) return;
 const phoneKey = r.clientPhone ? String(r.clientPhone).replace(/\D/g, '') : '';
 const emailKey = r.clientEmail ? String(r.clientEmail).trim().toLowerCase() : '';
 const nameKey = r.clientName ? String(r.clientName).trim().toLowerCase() : '';
 const uniqueKey = (phoneKey.length >= 7) ? phoneKey : (emailKey ? emailKey : `${r.tabName || 'tab'}_${r.rowIndex || ''}_${nameKey}`);
 if (uniqueKey) {
 uniqueLeadsMap.set(uniqueKey, r);
 }
 }
 });
 }

 // Prefer ALL cache or any cache to aggregate unique leads
 for (let i = 0; i < localStorage.length; i++) {
 const key = localStorage.key(i);
 if (key && key.startsWith('mrcontract_cache_')) {
 const lowerKey = key.toLowerCase();
 if (lowerKey.includes('summary') || lowerKey.includes('zapier')) {
 continue;
 }
 try {
 const raw = localStorage.getItem(key);
 if (raw) {
 const data = JSON.parse(raw);
 if (data && Array.isArray(data.rows)) {
 data.rows.forEach((r: any) => {
 if (r && r.clientName && !r.clientName.toLowerCase().startsWith('unnamed')) {
 if (r.tabName && !isLeadSourceTab(r.tabName)) return;
 if (r.leadSource && !isLeadSourceTab(r.leadSource)) return;
 const phoneKey = r.clientPhone ? String(r.clientPhone).replace(/\D/g, '') : '';
 const emailKey = r.clientEmail ? String(r.clientEmail).trim().toLowerCase() : '';
 const nameKey = r.clientName ? String(r.clientName).trim().toLowerCase() : '';
 const uniqueKey = (phoneKey.length >= 7) ? phoneKey : (emailKey ? emailKey : `${r.tabName || 'tab'}_${r.rowIndex || ''}_${nameKey}`);
 if (uniqueKey && !uniqueLeadsMap.has(uniqueKey)) {
 uniqueLeadsMap.set(uniqueKey, r);
 }
 }
 });
 }
 }
 } catch (e) {}
 }
 }

 // Ingest scheduled clients records
 try {
 const schedList = getScheduledClients();
 schedList.forEach((sc) => {
 if (sc && sc.clientName && !sc.clientName.toLowerCase().startsWith('unnamed')) {
 const phoneKey = sc.clientPhone ? String(sc.clientPhone).replace(/\D/g, '') : '';
 const emailKey = sc.clientEmail ? String(sc.clientEmail).trim().toLowerCase() : '';
 const nameKey = sc.clientName ? String(sc.clientName).trim().toLowerCase() : '';
 const uniqueKey = (phoneKey.length >= 7) ? phoneKey : (emailKey ? emailKey : `sched_${sc.id || nameKey}`);
 if (uniqueKey && !uniqueLeadsMap.has(uniqueKey)) {
 uniqueLeadsMap.set(uniqueKey, sc);
 }
 }
 });
 } catch (e) {}

 const finalLeadsTotal = uniqueLeadsMap.size;
 setLeadsCount(finalLeadsTotal);

 const tempCounts: Record<string, number> = {
 'New': 0,
 'Followed Up': 0,
 'Meeting Scheduled': 0,
 'Estimate Sent': 0,
 '3 day Follow Up': 0,
 '7 day Follow Up': 0,
 '15 day Follow Up': 0,
 '30 day Follow Up': 0,
 'Past 90 day Follow Up': 0,
 'Won Job': 0,
 'Lost Job (For Refund)': 0,
 'Lost Job (Nonrefundable)': 0,
 };

 uniqueLeadsMap.forEach((lead) => {
 const stat = (lead.status || 'New').trim().toLowerCase();
 if (stat === 'new' || stat === 'new lead') {
 tempCounts['New']++;
 } else if (
 stat === 'followed up' ||
 stat === 'followed-up'
 ) {
 tempCounts['Followed Up']++;
 } else if (isMeetingScheduledStatus(lead.status, lead.leadSource || lead.tabName)) {
 tempCounts['Meeting Scheduled']++;
 } else if (stat.includes('estimate sent')) {
 tempCounts['Estimate Sent']++;
 } else if (stat === '3 day follow up' || stat === '3 day follow up') {
 tempCounts['3 day Follow Up']++;
 } else if (stat === '7 day follow up' || stat === '7 day follow up') {
 tempCounts['7 day Follow Up']++;
 } else if (stat === '15 day follow up' || stat === '15 day follow up') {
 tempCounts['15 day Follow Up']++;
 } else if (stat === '30 day follow up' || stat === '30 day follow up') {
 tempCounts['30 day Follow Up']++;
 } else if (stat === 'past 90 days follow up' || stat === 'past 90 day follow up' || stat.includes('90')) {
 tempCounts['Past 90 day Follow Up']++;
 } else if (stat === 'won job' || stat === 'won') {
 tempCounts['Won Job']++;
 } else if (stat === 'lost job (for refund)' || (stat.includes('refund') && !stat.includes('non'))) {
 tempCounts['Lost Job (For Refund)']++;
 } else if (
 stat === 'lost job (nonrefundable)' || 
 stat === 'lost job (non-refundable)' || 
 stat.includes('nonrefundable') || 
 stat.includes('non-refundable') ||
 (stat.includes('lost') && stat.includes('non'))
 ) {
 tempCounts['Lost Job (Nonrefundable)']++;
 }
 });

 if (tempCounts['Meeting Scheduled'] === 0) {
 tempCounts['Meeting Scheduled'] = getScheduledClients().length;
 }

 setCounts(tempCounts);
 } catch (e) {}
 };

 useEffect(() => {
 updateCounts();
 const handleNewLeads = (e: any) => {
 if (e?.detail && Array.isArray(e.detail)) {
 setNewLeadsCount(e.detail.length);
 } else {
 setNewLeadsCount(getNewLeads().length);
 }
 updateCounts();
 };
 const handleDataSynced = (e: any) => {
 updateCounts(e?.detail);
 };
 const handleStorage = () => {
 updateCounts();
 };
 const handleScheduledUpdated = () => {
 updateCounts();
 };
 window.addEventListener('new_leads_updated', handleNewLeads);
 window.addEventListener('mrcontract_data_synced', handleDataSynced);
 window.addEventListener('scheduled_clients_updated', handleScheduledUpdated);
 window.addEventListener('storage', handleStorage);
 const interval = setInterval(() => updateCounts(), 3000);
 return () => {
 window.removeEventListener('new_leads_updated', handleNewLeads);
 window.removeEventListener('mrcontract_data_synced', handleDataSynced);
 window.removeEventListener('scheduled_clients_updated', handleScheduledUpdated);
 window.removeEventListener('storage', handleStorage);
 clearInterval(interval);
 };
 }, []);

 useEffect(() => {
 const currentStatus = new URLSearchParams(location.search).get('status')?.toLowerCase() || '';
 if (currentStatus.includes('follow up') || currentStatus.includes('follow-up') || currentStatus.includes('90')) {
 setIsFollowUpsOpen(true);
 }
 }, [location.search]);

 // Main Navigation Items exactly matching requested order (Leads removed)
 const mainNavItems = [{
    name: 'Overview',
    path: '/',
    icon: LayoutGrid,
    exact: true,
  },
  {
    name: 'Angi Email Activity',
    path: '/angi-email-activity',
    icon: Mail,
  },
 
 {
 name: 'New',
 path: '/new',
 icon: User,
 badge: newLeadsCount > 0 ? newLeadsCount : undefined,
 },
 {
 name: 'Followed Up',
 path: '/leads?status=Followed Up',
 icon: Clock,
 badge: counts['Followed Up'] > 0 ? counts['Followed Up'] : undefined,
 },
 {
 name: 'Meeting Scheduled',
 path: '/scheduled-clients',
 icon: CalendarClock,
 badge: counts['Meeting Scheduled'] > 0 ? counts['Meeting Scheduled'] : (getScheduledClients().length > 0 ? getScheduledClients().length : undefined),
 },
 {
 name: 'Estimate Sent',
 path: '/leads?status=Estimate Sent',
 icon: CalendarCheck,
 badge: counts['Estimate Sent'] > 0 ? counts['Estimate Sent'] : undefined,
 },
 ];

 const followUpSubItems = [
 {
 name: '3 day Follow Up',
 path: '/leads?status=3 day Follow UP',
 badge: counts['3 day Follow Up'] > 0 ? counts['3 day Follow Up'] : undefined,
 },
 {
 name: '7 day Follow Up',
 path: '/leads?status=7 day Follow UP',
 badge: counts['7 day Follow Up'] > 0 ? counts['7 day Follow Up'] : undefined,
 },
 {
 name: '15 day Follow Up',
 path: '/leads?status=15 day Follow UP',
 badge: counts['15 day Follow Up'] > 0 ? counts['15 day Follow Up'] : undefined,
 },
 {
 name: '30 day Follow Up',
 path: '/leads?status=30 day Follow UP',
 badge: counts['30 day Follow Up'] > 0 ? counts['30 day Follow Up'] : undefined,
 },
 {
 name: 'Past 90 day Follow Up',
 path: '/leads?status=Past 90 days Follow UP',
 badge: counts['Past 90 day Follow Up'] > 0 ? counts['Past 90 day Follow Up'] : undefined,
 },
 ];

 const totalFollowUpsCount = 
 counts['3 day Follow Up'] +
 counts['7 day Follow Up'] +
 counts['15 day Follow Up'] +
 counts['30 day Follow Up'] +
 counts['Past 90 day Follow Up'];

 const bottomNavItems = [
 {
 name: 'Won Job',
 path: '/leads?status=Won Job',
 icon: CheckCircle,
 badge: counts['Won Job'] > 0 ? counts['Won Job'] : undefined,
 },
 {
 name: 'Lost Job (For Refund)',
 path: '/leads?status=Lost Job (For Refund)',
 icon: ShieldAlert,
 badge: counts['Lost Job (For Refund)'] > 0 ? counts['Lost Job (For Refund)'] : undefined,
 },
 {
 name: 'Lost Job (Nonrefundable)',
 path: '/leads?status=Lost Job (Nonrefundable)',
 icon: Trash2,
 badge: counts['Lost Job (Nonrefundable)'] > 0 ? counts['Lost Job (Nonrefundable)'] : undefined,
 },
 ];

 const handleAddLeadClick = () => {
 if (setIsMobileOpen) setIsMobileOpen(false);
 if (onAddLead) {
 onAddLead();
 }
 };

 const handleNavClick = () => {
 if (setIsMobileOpen) {
 setIsMobileOpen(false);
 }
 };

 const handleSettingsClick = () => {
 if (setIsMobileOpen) setIsMobileOpen(false);
 onOpenSettings();
 };

 const renderNavContent = (isMobileView: boolean) => {
 const showExpanded = isMobileView || isOpen;

 const isItemActive = (path: string, exact?: boolean) => {
 if (exact) {
 return location.pathname === path;
 }
 try {
 if (path.includes('?')) {
 const [basePath, searchStr] = path.split('?');
 if (location.pathname !== basePath) return false;
 const targetStatus = decodeURIComponent(new URLSearchParams(searchStr).get('status')?.toLowerCase() || '').trim();
 const currentStatus = decodeURIComponent(new URLSearchParams(location.search).get('status')?.toLowerCase() || '').trim();
 if (targetStatus === currentStatus) return true;
 if (
 (targetStatus.includes('nonrefundable') || targetStatus.includes('non-refundable')) &&
 (currentStatus.includes('nonrefundable') || currentStatus.includes('non-refundable'))
 ) {
 return true;
 }
 if (
 (targetStatus === 'lost job (for refund)' || (targetStatus.includes('refund') && !targetStatus.includes('non'))) &&
 (currentStatus === 'lost job (for refund)' || (currentStatus.includes('refund') && !currentStatus.includes('non')))
 ) {
 return true;
 }
 return false;
 }
 } catch (e) {}

 // If it is main /leads link, only active when no status param is set
 if (path === '/leads') {
 const currentStatus = new URLSearchParams(location.search).get('status');
 return location.pathname === '/leads' && !currentStatus;
 }

 return location.pathname === path;
 };

 const handleFollowUpsToggle = (e: React.MouseEvent) => {
 e.preventDefault();
 if (!showExpanded && setIsOpen) {
 setIsOpen(true);
 setIsFollowUpsOpen(true);
 } else {
 setIsFollowUpsOpen(!isFollowUpsOpen);
 }
 };

 const isFollowUpsActive = location.pathname === '/leads' && (
 new URLSearchParams(location.search).get('status')?.toLowerCase().includes('follow up') ||
 new URLSearchParams(location.search).get('status')?.toLowerCase().includes('follow-up') ||
 new URLSearchParams(location.search).get('status')?.toLowerCase().includes('90')
 );

 const renderFollowUpsParent = () => {
 return (
 <div key="Follow-Ups-Group"className="flex flex-col space-y-1">
 <button
 type="button"
 onClick={handleFollowUpsToggle}
 className={`group relative flex items-center ${
 showExpanded ? 'px-3.5 py-3 gap-3.5 min-h-[44px]' : 'p-3 justify-center min-h-[44px]'
 } rounded-2xl font-semibold text-sm transition-all duration-150 cursor-pointer w-full text-left ${
 isFollowUpsActive
 ? 'bg-[#FF5500]/10 text-[#FF5500] font-bold shadow-xs'
 : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
 }`}
 >
 <Clock
 className={`w-5 h-5 shrink-0 transition-colors ${
 isFollowUpsActive
 ? 'text-[#FF5500] stroke-[2.2]'
 : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-white'
 }`}
 />

 {showExpanded && (
 <span className="flex-1 truncate tracking-tight text-inherit">
 Follow-Ups
 </span>
 )}

 {/* Total Badge Counter */}
 {totalFollowUpsCount > 0 && (
 <>
 {showExpanded ? (
 <span
 className={`px-1.5 py-0.5 min-w-[20px] h-5 rounded-full text-xs font-black flex items-center justify-center ${
 isFollowUpsActive
 ? 'bg-[#FF5500] text-white'
 : 'bg-[#FF5500] text-white'
 }`}
 >
 {totalFollowUpsCount}
 </span>
 ) : (
 <span
 className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#09090b] bg-[#FF5500]`}
 />
 )}
 </>
 )}

 {showExpanded && (
 <span className="ml-1 text-zinc-400 dark:text-zinc-500">
 {isFollowUpsOpen ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}
 </span>
 )}
 </button>

 {isFollowUpsOpen && showExpanded && (
 <div className="flex flex-col space-y-1 mt-1 border-l border-zinc-100 dark:border-zinc-800/50 ml-6 pl-2">
 {followUpSubItems.map((subItem) => {
 const isSubActive = isItemActive(subItem.path);
 return (
 <NavLink
 key={subItem.name}
 to={subItem.path}
 onClick={handleNavClick}
 className={() =>
 `group relative flex items-center px-3.5 py-2.5 gap-3 min-h-[40px] rounded-xl font-semibold text-xs transition-all duration-150 cursor-pointer ${
 isSubActive
 ? 'bg-[#FF5500]/10 text-[#FF5500] font-black'
 : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
 }`
 }
 >
 <span className="flex-1 truncate tracking-tight">
 {subItem.name}
 </span>
 {subItem.badge !== undefined && (
 <span className="px-1.5 py-0.5 min-w-[18px] h-4.5 rounded-full text-[10px] font-black flex items-center justify-center bg-[#FF5500] text-white">
 {subItem.badge}
 </span>
 )}
 </NavLink>
 );
 })}
 </div>
 )}
 </div>
 );
 };

 return (
 <div className="flex flex-col h-full bg-white dark:bg-black">
 {/* Top Header / Brand Section */}
 <div className={`p-4 pb-3 flex ${showExpanded ? 'items-center justify-between gap-2' : 'flex-col items-center gap-4'} bg-white dark:bg-black`}>
 <div className="flex items-center gap-3 overflow-hidden">
 {/* Logo Mark: Orange rounded squircle with bold white 'M' */}
 <div className="w-10 h-10 rounded-xl bg-[#FF5500] shrink-0 flex items-center justify-center">
 <span className="text-white font-black text-xl leading-none tracking-tighter">
 M
 </span>
 </div>

 {showExpanded && (
 <div className="flex flex-col min-w-0 leading-tight">
 <div className="flex items-baseline gap-1 truncate">
 <span className="font-extrabold text-base tracking-tight text-zinc-900 dark:text-white">
 Mr.
 </span>
 <span className="font-extrabold text-base tracking-tight text-[#FF5500]">
 Contract
 </span>
 </div>
 <span className="text-[10px] font-bold tracking-widest text-zinc-400 dark:text-zinc-500 uppercase">
 CRM
 </span>
 </div>
 )}
 </div>

 {/* Controls: Close button on mobile, Collapse/Expand on desktop */}
 {isMobileView ? (
 <button
 type="button"
 onClick={() => setIsMobileOpen && setIsMobileOpen(false)}
 aria-label="Close sidebar"
 className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
 >
 <ChevronLeft className="w-5 h-5"/>
 </button>
 ) : (
 <button
 type="button"
 onClick={() => setIsOpen(!isOpen)}
 aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
 className="p-1.5 rounded-lg text-zinc-400 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors cursor-pointer shrink-0"
 >
 {isOpen ? (
 <ChevronLeft className="w-4 h-4"/>
 ) : (
 <ChevronRight className="w-4 h-4"/>
 )}
 </button>
 )}
 </div>

 {/* Main Action Button: + Add Lead */}
 <div className="px-3 pt-2 pb-3">
 {showExpanded ? (
 <button
 type="button"
 onClick={handleAddLeadClick}
 className="w-full py-3 px-4 min-h-[44px] bg-[#FF5500] hover:bg-[#E64D00] text-white font-bold text-sm rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
 >
 <PlusCircle className="w-5 h-5 text-white shrink-0 stroke-[2.5]"/>
 <span className="tracking-wide text-white font-bold">
 Add Lead
 </span>
 </button>
 ) : (
 <button
 type="button"
 onClick={handleAddLeadClick}
 title="Add Lead"
 className="w-12 h-12 mx-auto min-h-[44px] min-w-[44px] bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-lg transition-all flex items-center justify-center shadow-sm cursor-pointer"
 >
 <PlusCircle className="w-5 h-5 text-white shrink-0 stroke-[2.5]"/>
 </button>
 )}
 </div>

 {/* Divider */}
 <div className="mx-3 border-t border-zinc-100 dark:border-zinc-800/60 my-1"/>

 {/* Nav Items List */}
 <nav className="flex-1 px-3 py-2 space-y-1.5 overflow-y-auto bg-white dark:bg-black">
 {mainNavItems.map((item) => {
 const Icon = item.icon;
 const isCurrentActive = isItemActive(item.path, item.exact);

 return (
 <NavLink
 key={item.name}
 to={item.path}
 onClick={handleNavClick}
 className={() =>
 `group relative flex items-center ${
 showExpanded ? 'px-3.5 py-3 gap-3.5 min-h-[44px]' : 'p-3 justify-center min-h-[44px]'
 } rounded-2xl font-semibold text-sm transition-all duration-150 cursor-pointer ${
 isCurrentActive
 ? 'bg-[#FF5500] text-white font-bold'
 : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
 }`
 }
 >
 <Icon
 className={`w-5 h-5 shrink-0 transition-colors ${
 isCurrentActive
 ? 'text-white stroke-[2.2]'
 : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-white'
 }`}
 />

 {showExpanded && (
 <span className="flex-1 truncate tracking-tight text-inherit">
 {item.name}
 </span>
 )}

 {/* Badge Counter */}
 {item.badge !== undefined && (
 <>
 {showExpanded ? (
 <span
 className={`px-1.5 py-0.5 min-w-[20px] h-5 rounded-full text-xs font-black flex items-center justify-center ${
 isCurrentActive
 ? 'bg-white text-[#FF5500]'
 : 'bg-[#FF5500] text-white'
 }`}
 >
 {item.badge}
 </span>
 ) : (
 <span
 className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#09090b] ${
 isCurrentActive ? 'bg-white' : 'bg-[#FF5500]'
 }`}
 />
 )}
 </>
 )}
 </NavLink>
 );
 })}

 {/* Follow-Ups Dropdown */}
 {renderFollowUpsParent()}

 {/* Bottom Nav Items */}
 {bottomNavItems.map((item) => {
 const Icon = item.icon;
 const isCurrentActive = isItemActive(item.path);

 return (
 <NavLink
 key={item.name}
 to={item.path}
 onClick={handleNavClick}
 className={() =>
 `group relative flex items-center ${
 showExpanded ? 'px-3.5 py-3 gap-3.5 min-h-[44px]' : 'p-3 justify-center min-h-[44px]'
 } rounded-2xl font-semibold text-sm transition-all duration-150 cursor-pointer ${
 isCurrentActive
 ? 'bg-[#FF5500] text-white font-bold'
 : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
 }`
 }
 >
 <Icon
 className={`w-5 h-5 shrink-0 transition-colors ${
 isCurrentActive
 ? 'text-white stroke-[2.2]'
 : 'text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-white'
 }`}
 />

 {showExpanded && (
 <span className="flex-1 truncate tracking-tight text-inherit">
 {item.name}
 </span>
 )}

 {/* Badge Counter */}
 {item.badge !== undefined && (
 <>
 {showExpanded ? (
 <span
 className={`px-1.5 py-0.5 min-w-[20px] h-5 rounded-full text-xs font-black flex items-center justify-center ${
 isCurrentActive
 ? 'bg-white text-[#FF5500]'
 : 'bg-[#FF5500] text-white'
 }`}
 >
 {item.badge}
 </span>
 ) : (
 <span
 className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-[#09090b] ${
 isCurrentActive ? 'bg-white' : 'bg-[#FF5500]'
 }`}
 />
 )}
 </>
 )}
 </NavLink>
 );
 })}
 </nav>

 {/* Bottom Section: Worker Profile & History & Settings */}
 <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 mt-auto pb-safe space-y-1 bg-white dark:bg-black">
 {/* Worker Profile Card */}
 {currentUser && (
 <button
 type="button"
 onClick={() => {
 setIsSwitchUserModalOpen(true);
 if (isMobileView) setIsMobileOpen && setIsMobileOpen(false);
 }}
 className={`flex items-center ${
 showExpanded ? 'w-full px-3 py-2.5 gap-3' : 'w-11 h-11 mx-auto justify-center'
 } bg-zinc-50 dark:bg-zinc-900/80 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl transition-all font-semibold text-xs cursor-pointer group`}
 title={!showExpanded ? `Worker: ${currentUser.name} (Click to switch)` : undefined}
 >
 <div
 className="w-7 h-7 rounded-xl flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs bg-[#FF5500]"
 >
 {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
 </div>
 {showExpanded && (
 <div className="flex-1 text-left min-w-0">
 <div className="text-zinc-900 dark:text-white font-bold truncate">
 {currentUser.name}
 </div>
 <div className="text-[10px] text-[#FF5500] font-semibold tracking-tight">
 Switch Profile
 </div>
 </div>
 )}
 </button>
 )}

 {/* Activity Log Audit Trail */}
 <button
 type="button"
 onClick={() => {
 setIsActivityLogModalOpen(true);
 if (isMobileView) setIsMobileOpen && setIsMobileOpen(false);
 }}
 className={`flex items-center ${
 showExpanded ? 'w-full px-3.5 py-2.5 gap-3.5' : 'w-11 h-11 mx-auto justify-center'
 } text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 rounded-2xl transition-colors font-semibold text-xs cursor-pointer`}
 title={!showExpanded ? 'Team Activity Log' : undefined}
 >
 <History className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400"/>
 {showExpanded && (
 <span className="flex-1 text-left truncate tracking-tight">
 Activity Logs
 </span>
 )}
 </button>

 {/* Trash & Deleted Leads */}
 <button
 type="button"
 onClick={() => {
 setIsTrashOpen(true);
 if (isMobileView) setIsMobileOpen && setIsMobileOpen(false);
 }}
 className={`flex items-center ${
 showExpanded ? 'w-full px-3.5 py-2.5 gap-3.5' : 'w-11 h-11 mx-auto justify-center'
 } text-zinc-600 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/10 rounded-2xl transition-colors font-semibold text-xs cursor-pointer`}
 title={!showExpanded ? 'Trash & Deleted Leads' : undefined}
 >
 <Trash2 className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400"/>
 {showExpanded && (
 <span className="flex-1 text-left truncate tracking-tight">
 Trash / Deleted
 </span>
 )}
 </button>

 {/* Settings & Sync */}
 <button
 type="button"
 onClick={handleSettingsClick}
 className={`flex items-center ${
 showExpanded ? 'w-full px-3.5 py-2.5 gap-3.5' : 'w-11 h-11 mx-auto justify-center'
 } text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 rounded-2xl transition-colors font-semibold text-xs cursor-pointer`}
 title={!showExpanded ? 'Settings & Sync' : undefined}
 >
 <Settings className="w-4 h-4 shrink-0 text-zinc-500 dark:text-zinc-400"/>
 {showExpanded && (
 <span className="flex-1 text-left truncate tracking-tight">
 Settings & Sync
 </span>
 )}
 </button>
 </div>
 </div>
 );
 };

 return (
 <>
 {/* Trash Modal */}
 <TrashModal isOpen={isTrashOpen} onClose={() => setIsTrashOpen(false)} />

 {/* Mobile Slide-Out Drawer & Backdrop */}
 {isMobileOpen && (
 <div
 className="fixed inset-0 bg-black/60 z-50 md:hidden"
 onClick={() => setIsMobileOpen && setIsMobileOpen(false)}
 aria-hidden="true"
 />
 )}

 {/* Mobile Drawer */}
 <aside
 className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white dark:bg-black border-r border-zinc-200 dark:border-zinc-800 shadow-2xl transform transition-transform duration-300 ease-in-out md:hidden ${
 isMobileOpen ? 'translate-x-0' : '-translate-x-full'
 }`}
 >
 {renderNavContent(true)}
 </aside>

 {/* Desktop / Tablet Persistent Sidebar */}
 <aside
 className={`hidden md:flex sticky top-0 h-screen z-30 flex-col transition-all duration-300 ease-in-out shrink-0 select-none ${
 isOpen ? 'w-64' : 'w-20'
 } bg-white dark:bg-black border-r border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 overflow-hidden`}
 >
 {renderNavContent(false)}
 </aside>
 </>
 );
};
