import React, { useEffect } from 'react';
import { X, Calendar, MapPin, Users, FileText, CheckCircle2, ArrowRight } from 'lucide-react';
import { GoogleCalendarEventPayload } from '../types';

interface ConfirmationModalProps {
 isOpen: boolean;
 onClose: () => void;
 onConfirm: () => void;
 payload: GoogleCalendarEventPayload | null;
 isSubmitting: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  payload,
  isSubmitting,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !payload) return null;

  // Format Start & End Time for display
  const startDate = new Date(payload.start.dateTime);
  const endDate = new Date(payload.end.dateTime);
  const eventTimeZone = payload.start.timeZone || payload.end.timeZone || 'America/New_York';

  const dateFormatted = startDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: eventTimeZone,
  });

  const startTimeFormatted = startDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: eventTimeZone,
  });

  const endTimeFormatted = endDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: eventTimeZone,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-md shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Calendar className="w-4 h-4 text-zinc-600 dark:text-zinc-300"/>
            <div>
              <h2 className="text-sm font-bold leading-tight text-zinc-900 dark:text-white">Confirm Google Calendar Event</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Verify event details before publishing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-white rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-120 cursor-pointer"
          >
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-sm">
          {/* Summary / Title */}
          <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-md p-3">
            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1">
              Event Title
            </span>
            <div className="text-sm font-bold text-zinc-900 dark:text-white">
              {payload.summary}
            </div>
          </div>

          {/* Time & Location Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-md p-3 flex items-start space-x-2.5">
              <Calendar className="w-4 h-4 text-zinc-500 dark:text-zinc-300 mt-0.5 shrink-0"/>
              <div>
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Date & Time
                </span>
                <div className="font-bold text-zinc-900 dark:text-white text-xs mt-0.5 tabular-nums">
                  {dateFormatted}
                </div>
                <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">
                  {startTimeFormatted} – {endTimeFormatted}
                </div>
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-md p-3 flex items-start space-x-2.5">
              <MapPin className="w-4 h-4 text-zinc-500 dark:text-zinc-300 mt-0.5 shrink-0"/>
              <div className="w-full min-w-0">
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block">
                  Location
                </span>
                <div className="font-medium text-zinc-900 dark:text-white text-xs mt-0.5 truncate">
                  {payload.location || 'No address specified'}
                </div>
              </div>
            </div>
          </div>

          {/* Attendees */}
          <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-md p-3 space-y-2">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
              <Users className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"/>
              <span className="tabular-nums">Calendar Guests ({payload.attendees.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {payload.attendees.map((a) => (
                <span
                  key={a.email}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-medium px-2 py-0.5 rounded-md"
                >
                  {a.email}
                </span>
              ))}
            </div>
          </div>

          {/* Description Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400"/>
              <span>Formatted Description</span>
            </div>
            <pre className="bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 p-3 rounded-md text-xs font-sans whitespace-pre-wrap leading-relaxed overflow-x-auto border border-zinc-200 dark:border-zinc-800">
              {payload.description}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs font-bold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white rounded-md transition-colors duration-120 cursor-pointer"
          >
            Edit Information
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="bg-[#FF5500] hover:bg-[#E64D00] text-white font-bold text-xs px-4 py-2 rounded-md shadow-xs transition-colors duration-120 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                <span>Publishing to Google Calendar...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-white"/>
                <span>Confirm & Create Appointment</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5 text-white"/>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
