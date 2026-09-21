import React, { useEffect } from 'react';
import {
  User,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  X,
  UserPlus,
} from 'lucide-react';
import { LeadStatus } from '../types';

export interface AddLeadPayload {
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  leadSource: string;
  serviceNeeded: string;
  status: LeadStatus;
  carrier?: string;
  leadFee?: string;
}

interface AddLeadConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  lead: AddLeadPayload | null;
  isSubmitting: boolean;
  hasHouzzWebhook: boolean;
}

export const AddLeadConfirmModal: React.FC<AddLeadConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  lead,
  isSubmitting,
  hasHouzzWebhook,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !lead) return null;

  return (
    <div
      id="add-lead-confirm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
    >
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md w-full max-w-lg overflow-hidden shadow-xl">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-brand-orange/15 border border-brand-orange/30 flex items-center justify-center text-brand-orange">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
                Add Lead to Portal & Houzz Pro?
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-white p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-120 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lead Details Preview */}
        <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
          <div className="bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800/80 rounded-md p-3.5 space-y-2.5">
            {/* Name */}
            <div className="flex items-start space-x-2.5">
              <User className="w-3.5 h-3.5 text-brand-orange shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
                  Client Name
                </span>
                <span className="text-sm font-bold text-zinc-900 dark:text-white">
                  {lead.clientName || '—'}
                </span>
              </div>
            </div>

            {/* Phone & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-zinc-200 dark:border-zinc-800/60">
              <div className="flex items-start space-x-2">
                <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
                    Phone
                  </span>
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate block tabular-nums">
                    {lead.clientPhone || '—'}
                  </span>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
                    Email
                  </span>
                  <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                    {lead.clientEmail || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Address */}
            <div className="flex items-start space-x-2.5 pt-1 border-t border-zinc-200 dark:border-zinc-800/60">
              <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
                  Address
                </span>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {lead.address || '—'}
                </span>
              </div>
            </div>

            {/* Lead Source, Service Needed, Status, Lead Fee */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1.5 border-t border-zinc-200 dark:border-zinc-800/60">
              <div className="bg-white dark:bg-zinc-900/90 rounded-md p-2 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
                  Lead Source
                </span>
                <span className="text-xs font-bold text-brand-orange truncate block">
                  {lead.leadSource || 'Angi'}
                </span>
              </div>

              <div className="bg-white dark:bg-zinc-900/90 rounded-md p-2 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
                  Service Needed
                </span>
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate block">
                  {lead.serviceNeeded || '—'}
                </span>
              </div>

              <div className="bg-white dark:bg-zinc-900/90 rounded-md p-2 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
                  Status
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate block">
                  {lead.status || 'New'}
                </span>
              </div>

              <div className="bg-white dark:bg-zinc-900/90 rounded-md p-2 border border-zinc-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-500 block">
                  Lead Fee
                </span>
                <span className="text-xs font-bold text-orange-500 dark:text-orange-400 truncate block tabular-nums">
                  {lead.leadFee ? (lead.leadFee.startsWith('$') ? lead.leadFee : `$${lead.leadFee}`) : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Sync Targets notice */}
          <div className="rounded-md p-2.5 bg-zinc-100 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60 text-xs text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Syncs to <strong>Google Spreadsheet Portal</strong></span>
            </div>
            <div className="flex items-center space-x-2">
              <div className={`w-1.5 h-1.5 rounded-full ${hasHouzzWebhook ? 'bg-emerald-500' : 'bg-[#FF5500]'}`} />
              <span>{hasHouzzWebhook ? 'Houzz Pro Webhook' : 'Houzz Pro (Config in Settings)'}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-900 dark:hover:text-white transition-colors duration-120 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="px-4 py-1.5 rounded-md bg-[#FF5500] hover:bg-[#E64D00] text-white font-bold text-xs shadow-xs transition-colors duration-120 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Adding Lead...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
