import React, { useState, useEffect } from 'react';
import { CalendarClock, MapPin, Phone, User, Mail, ArrowLeft, ChevronDown, ChevronUp, Sun, Moon } from 'lucide-react';
import { AppointmentFormData, AppConfig } from '../types';
import { useNavigate } from 'react-router-dom';
import { fetchGoogleCalendarEvents, parseCalendarEventToFormData, formatAppointmentDateTime } from '../lib/calendar';
import { loadAppConfig, saveAppConfig, applyTheme } from '../config';

interface ScheduledAppt {
  id: string;
  formData: AppointmentFormData;
}

export const ScheduledPage: React.FC = () => {
  const [scheduled, setScheduled] = useState<ScheduledAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig>(loadAppConfig);
  const navigate = useNavigate();

  const toggleTheme = () => {
    const next: 'dark' | 'light' = config.theme === 'dark' ? 'light' : 'dark';
    const updated: AppConfig = { ...config, theme: next };
    setConfig(updated);
    saveAppConfig(updated);
    applyTheme(next);
  };

  const fetchScheduled = async () => {
    try {
      setLoading(true);
      const events = await fetchGoogleCalendarEvents(null);
      
      const parsed: ScheduledAppt[] = events.map(event => {
        const { formData, eventId } = parseCalendarEventToFormData(event, config);
        return { id: eventId, formData };
      });

      // Sort by date/time
      parsed.sort((a, b) => {
        const dateA = new Date(`${a.formData.appointmentDate}T${a.formData.startTime}`).getTime();
        const dateB = new Date(`${b.formData.appointmentDate}T${b.formData.startTime}`).getTime();
        return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
      });

      setScheduled(parsed);
    } catch (err: any) {
      console.error('Failed to fetch scheduled appointments', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScheduled();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="flex-1 relative pb-16 min-h-screen bg-zinc-50 dark:bg-black">
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 text-[#FF5500] flex items-center justify-center font-bold">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white leading-tight tracking-tight">
                Scheduled Clients
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-all cursor-pointer shadow-xs min-w-[44px] min-h-[44px] flex items-center justify-center"
              title={config.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={config.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {config.theme === 'dark' ? <Sun className="w-4 h-4 text-zinc-700 dark:text-zinc-300" /> : <Moon className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />}
            </button>

            <button
              onClick={() => navigate('/spreadsheet')}
              className="px-3 py-1.5 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Spreadsheet</span>
              <span className="text-white/70">→</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-5">
        {loading ? (
          <div className="text-center py-10 text-zinc-500 text-xs">Loading Google Calendar events...</div>
        ) : scheduled.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center text-zinc-500 dark:text-zinc-400 text-xs shadow-sm">
            No scheduled clients found in Google Calendar.
          </div>
        ) : (
          <div className="space-y-3">
            {scheduled.map((appt, idx) => {
              const { formData } = appt;
              const isExpanded = expandedId === appt.id;
              const formattedApptTime = formatAppointmentDateTime(formData.appointmentDate, formData.startTime, formData.endTime);
              
              return (
                <div 
                  key={`${appt.id || 'appt'}_${idx}`} 
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-brand-orange/40 rounded-xl overflow-hidden transition-all shadow-xs"
                >
                  <div 
                    onClick={() => toggleExpand(appt.id)}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                  >
                    {/* Client Name & Scheduled Badge */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700">
                        <User className="w-4 h-4 text-[#FF5500]" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-zinc-900 dark:text-zinc-100 text-base truncate">{formData.clientName || 'Unknown Client'}</h3>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                            Scheduled
                          </span>
                        </div>
                        {/* Prominent Google Calendar Scheduled Date & Time */}
                        <div className="flex items-center gap-1.5 text-xs text-zinc-900 dark:text-zinc-100 font-bold mt-1">
                          <CalendarClock className="w-3.5 h-3.5 text-[#FF5500] shrink-0" />
                          <span>{formattedApptTime || 'Date/Time Not Specified'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 text-zinc-500 dark:text-zinc-400 text-xs shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-200 dark:border-zinc-800">
                      {formData.salespersonCode && (
                        <span className="px-2 py-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold rounded-lg text-[11px]">
                          Sales: {formData.salespersonCode}
                        </span>
                      )}
                      <div className="text-zinc-500 dark:text-zinc-400 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 pt-3 border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-950/60 text-xs space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-zinc-700 dark:text-zinc-300">
                        <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black block mb-0.5">Google Calendar Date & Time</span>
                          <span className="text-zinc-900 dark:text-white font-bold text-xs">{formattedApptTime}</span>
                        </div>

                        {formData.salespersonCode && (
                          <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black block mb-0.5">Assigned Salesperson</span>
                            <span className="text-zinc-900 dark:text-zinc-200 font-bold text-xs">{formData.salespersonCode}</span>
                          </div>
                        )}

                        {formData.clientPhone && (
                          <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-2">
                            <Phone className="w-4 h-4 text-[#FF5500] shrink-0" />
                            <div>
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black block">Phone Number</span>
                              <a href={`tel:${formData.clientPhone}`} className="text-zinc-900 dark:text-zinc-200 font-semibold hover:underline">
                                {formData.clientPhone}
                              </a>
                            </div>
                          </div>
                        )}

                        {formData.clientEmail && (
                          <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center gap-2">
                            <Mail className="w-4 h-4 text-[#FF5500] shrink-0" />
                            <div>
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black block">Email Address</span>
                              <a href={`mailto:${formData.clientEmail}`} className="text-zinc-900 dark:text-zinc-200 font-semibold hover:underline break-all">
                                {formData.clientEmail}
                              </a>
                            </div>
                          </div>
                        )}

                        {formData.address && (
                          <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl sm:col-span-2 flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-[#FF5500] shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black block">Property Address</span>
                              <span className="text-zinc-900 dark:text-zinc-200 font-medium">{formData.address}</span>
                            </div>
                          </div>
                        )}

                        {formData.notes && (
                          <div className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl sm:col-span-2">
                            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 uppercase font-black block mb-1">Appointment Notes</span>
                            <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{formData.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
