import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, MapPin, CheckCircle2, Loader2, AlertCircle, Sun, Moon } from 'lucide-react';
import { loadAppConfig, saveAppConfig, applyTheme } from '../config';
import { appendAppointmentToSheet, readSpreadsheetRows } from '../lib/sheets';
import { AppointmentFormData } from '../types';
import { AddressAutocomplete } from './ui/AddressAutocomplete';

export const ClientForm: React.FC = () => {
  const [formData, setFormData] = useState({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    address: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => loadAppConfig().theme || 'dark');

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    const config = loadAppConfig();
    saveAppConfig({ ...config, theme: next });
    applyTheme(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientName || !formData.clientPhone || !formData.address) {
      setError('Please fill out all required fields.');
      return;
    }

    const config = loadAppConfig();
    if (!config.spreadsheetId) {
      setError('System Error: Google Spreadsheet is not connected. Please contact administration.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // 1. Scan for duplicates
      const targetTab = config.sheetTabName || 'Angi';
      const { rows } = await readSpreadsheetRows(undefined, config.spreadsheetId!, targetTab);
      
      const isDuplicate = rows.some(r => {
        const nameMatch = r.clientName && formData.clientName && r.clientName.toLowerCase().trim() === formData.clientName.toLowerCase().trim();
        const phoneMatch = r.clientPhone && formData.clientPhone && r.clientPhone.replace(/\D/g, '') === formData.clientPhone.replace(/\D/g, '');
        return nameMatch || phoneMatch;
      });

      if (isDuplicate) {
        throw new Error(`A lead with this name or phone number already exists in the system.`);
      }

      // 2. Append directly to sheet via Service Account
      const newLead: AppointmentFormData = {
        clientName: formData.clientName,
        clientPhone: formData.clientPhone,
        clientEmail: formData.clientEmail,
        address: formData.address,
        appointmentDate: new Date().toISOString().split('T')[0],
        startTime: '09:00',
        endTime: '11:00',
        salespersonCode: config.salespeople?.[0]?.code || 'DG',
        leadSource: 'Web Form',
        leadType: config.leadTypes?.[0] || 'Direct',
        notes: 'Added from web form',
        status: 'New'
      };

      await appendAppointmentToSheet(undefined, config.spreadsheetId!, targetTab, newLead, 'New');
      
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle =
    "w-full px-3.5 py-2.5 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700/80 rounded-xl focus:bg-white dark:focus:bg-zinc-900 focus:border-[#EF7E15] dark:focus:border-[#EF7E15] focus:outline-none text-base font-medium text-zinc-900 dark:text-white placeholder-zinc-400 transition-all";

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-zinc-900 dark:text-white">Request Received</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs font-medium">We will contact you shortly to confirm your appointment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-4 relative">
      {/* Theme Toggle in top right */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-all cursor-pointer shadow-sm min-w-[44px] min-h-[44px] flex items-center justify-center"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? <Moon className="w-4 h-4 text-zinc-300" /> : <Sun className="w-4 h-4 text-zinc-600" />}
      </button>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-black text-zinc-900 dark:text-white tracking-wide">Client Booking</h1>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/80 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 rounded-xl p-3 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              Full Name *
            </label>
            <input
              type="text"
              required
              value={formData.clientName}
              onChange={(e) => setFormData(p => ({ ...p, clientName: e.target.value }))}
              className={inputStyle}
              placeholder="John Doe"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              Phone Number *
            </label>
            <input
              type="tel"
              required
              value={formData.clientPhone}
              onChange={(e) => setFormData(p => ({ ...p, clientPhone: e.target.value }))}
              className={inputStyle}
              placeholder="(555) 000-0000"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              Email Address
            </label>
            <input
              type="email"
              value={formData.clientEmail}
              onChange={(e) => setFormData(p => ({ ...p, clientEmail: e.target.value }))}
              className={inputStyle}
              placeholder="john@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              Address *
            </label>
            <AddressAutocomplete
              required
              value={formData.address}
              onChange={(val) => setFormData(p => ({ ...p, address: val }))}
              placeholder="e.g. 123 Main Street, Pittsburgh, PA, 15215"
              inputClassName={inputStyle}
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-[#EF7E15] hover:bg-[#e04b00] text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Details</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
