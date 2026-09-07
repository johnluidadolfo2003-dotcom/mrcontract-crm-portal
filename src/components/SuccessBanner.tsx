import React from 'react';
import { CheckCircle2, ExternalLink, Calendar, Plus } from 'lucide-react';
import { CreatedCalendarEvent } from '../types';

interface SuccessBannerProps {
  event: CreatedCalendarEvent;
  onReset: () => void;
}

export const SuccessBanner: React.FC<SuccessBannerProps> = ({ event, onReset }) => {
  return (
    <div className="bg-brand-orange/80 border-2 border-brand-orange-dark rounded-2xl p-6 shadow-xl mb-6 animate-in fade-in slide-in-from-top-4 duration-200">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-brand-orange text-white flex items-center justify-center shrink-0 shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-brand-orange-light bg-brand-orange-dark px-2 py-0.5 rounded-md border border-brand-orange-dark">
                Appointment Created
              </span>
            </div>
            <h3 className="text-lg font-black text-white mt-1">
              {event.summary}
            </h3>
            <p className="text-xs text-brand-orange-light font-medium mt-0.5">
              Appointment saved and invites sent.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-[#FF5500] hover:bg-[#E64D00] text-white font-bold text-xs px-4 py-2.5 rounded-lg shadow-xs transition-colors"
            >
              <Calendar className="w-4 h-4" />
              <span>View in Calendar</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <button
            onClick={onReset}
            className="inline-flex items-center justify-center gap-1.5 bg-zinc-900 dark:bg-zinc-800 border border-zinc-800 dark:border-zinc-700 hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white font-bold text-xs px-4 py-2.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Schedule Another</span>
          </button>
        </div>
      </div>
    </div>
  );
};
