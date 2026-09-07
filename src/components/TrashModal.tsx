import React, { useState, useEffect } from 'react';
import { Trash2, RotateCcw, X, AlertTriangle, RefreshCw, CheckCircle2, User, Clock } from 'lucide-react';
import { useUser } from '../lib/userContext';

interface TrashModalProps {
 isOpen: boolean;
 onClose: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ isOpen, onClose }) => {
 const { currentUser } = useUser();
 const [items, setItems] = useState<any[]>([]);
 const [isLoading, setIsLoading] = useState(false);
 const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

 const fetchTrash = async () => {
 setIsLoading(true);
 try {
 const res = await fetch('/api/trash');
 if (res.ok) {
 const data = await res.json();
 if (data.success && Array.isArray(data.items)) {
 setItems(data.items);
 }
 }
 } catch (err) {
 console.warn('Failed to fetch trash:', err);
 } finally {
 setIsLoading(false);
 }
 };

 useEffect(() => {
 if (isOpen) {
 fetchTrash();
 }
 }, [isOpen]);

 const handleRestore = async (lead: any) => {
 try {
 const res = await fetch('/api/trash/restore', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 leadId: lead.id,
 clientName: lead.clientName,
 restoredBy: currentUser?.name || 'Worker',
 }),
 });
 if (res.ok) {
 setToast({ type: 'success', message:"Lead restored"});
 fetchTrash();
 window.dispatchEvent(new CustomEvent('dashboard_data_refresh'));
 window.dispatchEvent(new CustomEvent('new_leads_updated'));
 } else {
 const err = await res.json();
 setToast({ type: 'error', message: err.error || 'Failed to restore lead.' });
 }
 } catch (err: any) {
 setToast({ type: 'error', message: err.message || 'Error restoring lead.' });
 }
 };

 const handleEmptyTrash = async () => {
 if (!window.confirm('Are you sure you want to permanently empty the trash? This cannot be undone.')) {
 return;
 }
 try {
 const res = await fetch('/api/trash/empty', { method: 'DELETE' });
 if (res.ok) {
 setToast({ type: 'success', message: 'Trash emptied permanently.' });
 fetchTrash();
 }
 } catch (err: any) {
 setToast({ type: 'error', message: err.message || 'Error emptying trash.' });
 }
 };

   useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

if (!isOpen) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 overflow-y-auto">
 <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-3xl p-5 sm:p-7 max-h-[90vh] flex flex-col shadow-2xl relative">
 {/* Header */}
 <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
 <Trash2 className="w-5 h-5"/>
 </div>
 <div>
 <h3 className="text-base font-bold text-zinc-900 dark:text-white">Trash & Deleted Leads</h3>
 <p className="text-xs text-zinc-500 dark:text-zinc-400">
 Recover accidentally deleted leads or permanently remove them.
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 {items.length > 0 && (
 <button
 type="button"
 onClick={handleEmptyTrash}
 className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-600 hover:text-white text-xs font-bold transition-colors cursor-pointer"
 >
 Empty Trash
 </button>
 )}
 <button
 onClick={onClose}
 className="p-2 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
 >
 <X className="w-5 h-5"/>
 </button>
 </div>
 </div>

 {/* Toast */}
 {toast && (
 <div
 className={`my-3 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
 toast.type === 'success'
 ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
 : 'bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400'
 }`}
 >
 {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4"/> : <AlertTriangle className="w-4 h-4"/>}
 <span>{toast.message}</span>
 </div>
 )}

 {/* Trashed Items List */}
 <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-[200px]">
 {isLoading ? (
 <div className="py-12 text-center">
 <RefreshCw className="w-6 h-6 mx-auto animate-spin text-[#FF5500]"/>
 <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 mt-2">Loading trash items...</p>
 </div>
 ) : items.length === 0 ? (
 <div className="py-12 text-center text-zinc-400 dark:text-zinc-500">
 <Trash2 className="w-10 h-10 mx-auto opacity-30 stroke-[1.5]"/>
 <p className="text-xs font-bold mt-2">Trash is empty.</p>
 </div>
 ) : (
 items.map((item, index) => (
 <div
 key={item.id || index}
 className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between gap-3"
 >
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="font-bold text-sm text-zinc-900 dark:text-white truncate">
 {item.clientName}
 </span>
 <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
 {item.leadSource || 'Direct'}
 </span>
 </div>

 <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex-wrap">
 {item.clientPhone && <span>{item.clientPhone}</span>}
 {item.deletedAt && (
 <span className="flex items-center gap-1 text-[11px]">
 <Clock className="w-3 h-3 text-zinc-400"/>
 Deleted {new Date(item.deletedAt).toLocaleDateString()}
 </span>
 )}
 {item.deletedBy && <span>by {item.deletedBy}</span>}
 {item.deletionReason && <span className="italic">({item.deletionReason})</span>}
 </div>
 </div>

 <button
 type="button"
 onClick={() => handleRestore(item)}
 className="px-3 py-1.5 rounded-xl bg-[#FF5500]/10 hover:bg-[#FF5500] text-[#FF5500] hover:text-white font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
 >
 <RotateCcw className="w-3.5 h-3.5"/>
 <span>Restore</span>
 </button>
 </div>
 ))
 )}
 </div>
 </div>
 </div>
 );
};
