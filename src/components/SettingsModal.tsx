import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Save,
  UserCheck,
  Clock,
  Moon,
  Sun,
  CheckCircle,
  AlertCircle,
  Calendar,
  FileSpreadsheet,
  Send,
  Copy,
  Webhook,
  Activity,
  Sliders,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import { AppConfig, SalespersonOption } from '../types';
import { US_TIME_ZONES, applyTheme, isLeadSourceTab } from '../config';
import { sendLeadToHouzzPro } from '../lib/houzz';
import { getWebhookUrls, sendTestWebhookLead, runFullPipelineTest } from '../lib/webhooks';
import { WebhookDiagnosticsModal } from './WebhookDiagnosticsModal';
import { checkBackendCalendarStatus, BackendCalendarStatus } from '../lib/calendar';
import { useUser } from '../lib/userContext';
import { User, Pencil, ShieldCheck } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSaveConfig: (newConfig: AppConfig) => void;
  user?: any;
  onSignIn?: () => void;
  onSignOut?: () => void;
  isLoggingIn?: boolean;
  initialTab?: 'general' | 'integrations';
  initialSubTab?: 'connections' | 'webhooks' | 'troubleshooting';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onSignIn,
  isLoggingIn,
  initialTab,
  initialSubTab,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const [activeTab, setActiveTab] = useState<'general' | 'integrations'>(initialTab || 'general');
  const [activeIntegrationsSubTab, setActiveIntegrationsSubTab] = useState<'connections' | 'webhooks' | 'troubleshooting'>(initialSubTab || 'connections');
  const [isTestingPipeline, setIsTestingPipeline] = useState(false);
  const [isSendingTestLead, setIsSendingTestLead] = useState<'Angi' | 'Thumbtack' | null>(null);
  const [quickTestResult, setQuickTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [timeZone, setTimeZone] = useState(config.timeZone || 'America/New_York');
  const [theme, setTheme] = useState<'dark' | 'light'>(config.theme || 'dark');
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>(config.salespeople);
  const [leadSources, setLeadSources] = useState<string[]>((config.leadSources || []).filter(isLeadSourceTab));
  const [leadTypes, setLeadTypes] = useState<string[]>(config.leadTypes || []);
  const { currentUser } = useUser();


  useEffect(() => {
    if (isOpen) {
      if (initialTab) setActiveTab(initialTab);
      if (initialSubTab) setActiveIntegrationsSubTab(initialSubTab);
    }
  }, [isOpen, initialTab, initialSubTab]);

  useEffect(() => {
    const handleOpenSettingsEvent = (e: any) => {
      if (e?.detail?.tab) setActiveTab(e.detail.tab);
      if (e?.detail?.subTab) setActiveIntegrationsSubTab(e.detail.subTab);
    };
    window.addEventListener('open_settings', handleOpenSettingsEvent);
    return () => window.removeEventListener('open_settings', handleOpenSettingsEvent);
  }, []);

  const handleQuickTestLead = async (source: 'Angi' | 'Thumbtack') => {
    setIsSendingTestLead(source);
    setQuickTestResult(null);
    try {
      const res = await sendTestWebhookLead(source);
      setQuickTestResult({
        success: res.success,
        message: res.success
          ? `Simulated ${source} lead dispatched`
          : `Failed: ${res.message}`,
      });
    } catch (err: any) {
      setQuickTestResult({
        success: false,
        message: err.message || 'Error sending test lead.',
      });
    } finally {
      setIsSendingTestLead(null);
    }
  };

  const handleQuickPipelineTest = async () => {
    setIsTestingPipeline(true);
    setQuickTestResult(null);
    try {
      const res = await runFullPipelineTest();
      setQuickTestResult({
        success: res.success,
        message: res.success
          ? 'Ingestion pipeline test passed! Email parsing, CRM storage & webhook flow verified.'
          : `Pipeline test reported an issue: ${res.error || 'Check details in diagnostics'}`,
      });
    } catch (err: any) {
      setQuickTestResult({
        success: false,
        message: err.message || 'Error running pipeline test.',
      });
    } finally {
      setIsTestingPipeline(false);
    }
  };

  // Houzz Pro / Zapier Webhook settings
  const [webhookStatus, setWebhookStatus] = useState<{ configured: boolean; destination: string } | null>(null);
  const [autoSendToHouzz, setAutoSendToHouzz] = useState(config.autoSendToHouzz || false);
  const [testingHouzz, setTestingHouzz] = useState(false);
  const [houzzTestStatus, setHouzzTestStatus] = useState<string | null>(null);

  const [autoSyncToSheets, setAutoSyncToSheets] = useState(
    config.autoSyncToSheets !== undefined ? config.autoSyncToSheets : true
  );
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [isDiagOpen, setIsDiagOpen] = useState(false);
  const [sheetsStatus, setSheetsStatus] = useState<{ configured: boolean; clientEmail?: string; error?: string } | null>(null);
  const [calendarBackendStatus, setCalendarBackendStatus] = useState<BackendCalendarStatus | null>(null);
  const [isCheckingCalendar, setIsCheckingCalendar] = useState(false);

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  const [newLeadSource, setNewLeadSource] = useState('');
  const [newLeadType, setNewLeadType] = useState('');

  const checkGoogleAuth = async () => {
    setIsCheckingCalendar(true);
    try {
      const data = await checkBackendCalendarStatus();
      setCalendarBackendStatus(data);
    } catch {
      setCalendarBackendStatus({ connected: false, error: 'Could not reach server.' });
    } finally {
      setIsCheckingCalendar(false);
    }
  };

  const isCalendarConnected = !!calendarBackendStatus?.connected;

  useEffect(() => {
    if (isOpen) {
      setTimeZone(config.timeZone || 'America/New_York');
      setTheme(config.theme || 'dark');
      setSalespeople(config.salespeople || []);
      setLeadSources((config.leadSources || []).filter(isLeadSourceTab));
      setLeadTypes(config.leadTypes || []);
      setAutoSendToHouzz(config.autoSendToHouzz || false);
      setAutoSyncToSheets(config.autoSyncToSheets !== undefined ? config.autoSyncToSheets : true);

      // Check backend Webhook status
      fetch('/api/webhook-url')
        .then((res) => res.json())
        .then((data) => setWebhookStatus(data))
        .catch(() => setWebhookStatus({ configured: false, destination: 'Zapier / Houzz Automation' }));

      // Check backend Service Account status
      fetch('/api/sheets/status')
        .then((res) => res.json())
        .then((data) => setSheetsStatus(data))
        .catch(() => setSheetsStatus({ configured: false, error: 'Could not reach server.' }));

      // Check Google Calendar backend status
      checkGoogleAuth();
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleAddSalesperson = () => {
    if (!newCode.trim() || !newName.trim()) return;
    const newItem: SalespersonOption = {
      id: Date.now().toString(),
      code: newCode.trim().toUpperCase(),
      name: newName.trim(),
    };
    const updated = [...salespeople, newItem];
    setSalespeople(updated);
    setNewCode('');
    setNewName('');
    onSaveConfig({
      ...config,
      salespeople: updated,
      leadSources,
      leadTypes,
      timeZone,
      theme,
    });
  };

  const handleRemoveSalesperson = (id: string) => {
    const updated = salespeople.filter(s => s.id !== id);
    setSalespeople(updated);
    onSaveConfig({
      ...config,
      salespeople: updated,
      leadSources,
      leadTypes,
      timeZone,
      theme,
    });
  };

  const handleAddLeadSource = () => {
    const val = newLeadSource.trim();
    if (val && !leadSources.includes(val) && isLeadSourceTab(val)) {
      const updated = [...leadSources, val];
      setLeadSources(updated);
      setNewLeadSource('');
      onSaveConfig({
        ...config,
        salespeople,
        leadSources: updated,
        leadTypes,
        timeZone,
        theme,
      });
    }
  };

  const handleRemoveLeadSource = (source: string) => {
    const updated = leadSources.filter(s => s !== source);
    setLeadSources(updated);
    onSaveConfig({
      ...config,
      salespeople,
      leadSources: updated,
      leadTypes,
      timeZone,
      theme,
    });
  };

  const handleAddLeadType = () => {
    const val = newLeadType.trim();
    if (val && !leadTypes.includes(val)) {
      const updated = [...leadTypes, val];
      setLeadTypes(updated);
      setNewLeadType('');
      onSaveConfig({
        ...config,
        salespeople,
        leadSources,
        leadTypes: updated,
        timeZone,
        theme,
      });
    }
  };

  const handleRemoveLeadType = (type: string) => {
    const updated = leadTypes.filter(t => t !== type);
    setLeadTypes(updated);
    onSaveConfig({
      ...config,
      salespeople,
      leadSources,
      leadTypes: updated,
      timeZone,
      theme,
    });
  };

  const handleSave = () => {
    onSaveConfig({
      ...config,
      timeZone,
      theme,
      salespeople,
      leadSources,
      leadTypes,
      autoSyncToSheets,
      autoSendToHouzz,
    });
    onClose();
  };

  const inputStyle =
    "w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl focus:border-[#FF5500] dark:focus:border-[#FF5500] focus:outline-none text-xs font-semibold text-zinc-900 dark:text-white transition-all placeholder-zinc-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-5 h-5 text-zinc-900 dark:text-white" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">System Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top-Level Navigation Tabs */}
        <div className="px-6 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'general'
                ? 'border-[#FF5500] text-zinc-900 dark:text-white font-extrabold'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>General</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={`py-3 px-3.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'integrations'
                ? 'border-[#FF5500] text-zinc-900 dark:text-white font-extrabold'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Webhook className="w-3.5 h-3.5" />
            <span>Integrations</span>
            {(!isCalendarConnected || !sheetsStatus?.configured) && (
              <span className="w-2 h-2 rounded-full bg-[#FF5500]" title="Attention needed"></span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {activeTab === 'general' ? (
            <div className="space-y-6">
                            {/* Active Worker Profile / Edit Name */}
              {/* Authenticated User & Access Management */}
              {currentUser && (
                <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-[#FF5500]" />
                      Authenticated User Account
                    </label>
                  </div>

                  <div className="flex items-center justify-between bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-3">
                    <div>
                      <div className="text-xs font-bold text-zinc-900 dark:text-white">
                        {currentUser.displayName || currentUser.name}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {currentUser.email}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#FF5500]/10 text-[#FF5500] text-[10px] font-black uppercase tracking-wider">
                      {currentUser.role}
                    </span>
                  </div>
                </div>
              )}

              {/* Dark Mode Setting */}
              <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-4 flex items-center justify-between">
                <div className="space-y-0.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    {theme === 'dark' ? (
                      <Moon className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-300" />
                    ) : (
                      <Sun className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300" />
                    )}
                    Dark Mode
                  </label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {theme === 'dark' ? 'Dark theme enabled (ON)' : 'Light theme enabled (OFF)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextTheme = theme === 'dark' ? 'light' : 'dark';
                    setTheme(nextTheme);
                    applyTheme(nextTheme);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    theme === 'dark' ? 'bg-[#FF5500]' : 'bg-zinc-300 dark:bg-zinc-600'
                  }`}
                >
                  <span className="sr-only">Toggle Dark Mode</span>
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      theme === 'dark' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* US Time Zone Setting */}
              <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-4 space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  US Time Zone
                </label>
                <select
                  value={timeZone}
                  onChange={(e) => setTimeZone(e.target.value)}
                  className={inputStyle}
                >
                  {US_TIME_ZONES.map((tz) => (
                    <option key={tz.value} value={tz.value} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white">
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Salesperson Directory */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Salesperson Directory</h3>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{salespeople.length} configured</span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {salespeople.map((sp) => (
                    <div
                      key={sp.id}
                      className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl p-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-900 dark:text-zinc-950 bg-zinc-200 px-2 py-0.5 rounded-md">
                          {sp.code}
                        </span>
                        <span className="font-semibold text-zinc-800 dark:text-white">{sp.name}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveSalesperson(sp.id)}
                        className="text-zinc-400 hover:text-red-500 p-1 transition-colors cursor-pointer"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add new Salesperson */}
                <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 space-y-2.5">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block uppercase tracking-wider">Add Salesperson</span>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSalesperson(); }}}
                      placeholder="Full Name (e.g. John Doe)"
                      className={`${inputStyle} w-full`}
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSalesperson(); }}}
                        placeholder="Initials/Code (e.g. JD)"
                        className={`${inputStyle} flex-1 uppercase`}
                      />
                      <button
                        type="button"
                        onClick={handleAddSalesperson}
                        className="bg-[#FF5500] hover:bg-[#E64D00] text-white px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Salesperson
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lead Sources Management */}
              <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Lead Sources</h3>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{leadSources.length} options</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {leadSources.map((source) => (
                    <div
                      key={source}
                      className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                    >
                      <span>{source}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLeadSource(source)}
                        className="text-zinc-400 hover:text-red-500 ml-1 cursor-pointer"
                        title="Remove Lead Source"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLeadSource}
                    onChange={(e) => setNewLeadSource(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLeadSource(); }}}
                    placeholder="New Lead Source (e.g. Yelp)"
                    className={`${inputStyle} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={handleAddLeadSource}
                    className="bg-[#FF5500] hover:bg-[#E64D00] text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Source
                  </button>
                </div>
              </div>

              {/* Lead Types Management */}
              <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Lead Types</h3>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{leadTypes.length} options</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {leadTypes.map((type) => (
                    <div
                      key={type}
                      className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 px-2.5 py-1 rounded-lg text-xs font-semibold text-zinc-800 dark:text-zinc-200"
                    >
                      <span>{type}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLeadType(type)}
                        className="text-zinc-400 hover:text-red-500 ml-1 cursor-pointer"
                        title="Remove Lead Type"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newLeadType}
                    onChange={(e) => setNewLeadType(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLeadType(); }}}
                    placeholder="New Lead Type (e.g. Commercial)"
                    className={`${inputStyle} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={handleAddLeadType}
                    className="bg-[#FF5500] hover:bg-[#E64D00] text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Type
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Subtabs: Connections | Webhooks | Troubleshooting */}
              <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveIntegrationsSubTab('connections')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold transition-all text-center cursor-pointer ${
                    activeIntegrationsSubTab === 'connections'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Connections
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIntegrationsSubTab('webhooks')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold transition-all text-center cursor-pointer ${
                    activeIntegrationsSubTab === 'webhooks'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  Webhooks
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIntegrationsSubTab('troubleshooting')}
                  className={`flex-1 py-1.5 px-3 rounded-lg font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeIntegrationsSubTab === 'troubleshooting'
                      ? 'bg-[#FF5500]/20 text-[#FF5500] border border-[#FF5500]/40 shadow-xs'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Troubleshooting</span>
                </button>
              </div>

              {/* Subtab: Connections */}
              {activeIntegrationsSubTab === 'connections' && (
                <div className="space-y-5">
                  {/* Google Account Connection Status */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-[#FF5500]" />
                        Shared Google Calendar (Server Integration)
                      </label>
                      {isCheckingCalendar ? (
                        <span className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          <RefreshCw className="w-3 h-3 animate-spin text-zinc-500" />
                          Checking Backend...
                        </span>
                      ) : isCalendarConnected ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          Connected ({calendarBackendStatus?.authSource === 'service_account' ? 'Service Account' : 'Server OAuth'})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-orange-100 dark:bg-orange-950/60 border border-orange-300 dark:border-orange-800 text-orange-800 dark:text-orange-300 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                          Server Config Required
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed space-y-1.5">
                      {isCalendarConnected ? (
                        <p>
                          Connected as <span className="text-zinc-900 dark:text-white font-bold">{calendarBackendStatus?.email || 'Shared Server Account'}</span>. Google Calendar synchronization is managed securely by the backend server. All team members automatically share this Calendar connection without requiring individual Google logins.
                        </p>
                      ) : (
                        <p>
                          The backend server needs Google Calendar credentials (Service Account JSON or Refresh Token in environment variables). Individual workers do not need to sign in with their Google accounts.
                        </p>
                      )}
                      {calendarBackendStatus?.error && (
                        <div className="p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-lg text-red-700 dark:text-red-300 text-[11px]">
                          <strong>Server Notice:</strong> {calendarBackendStatus.error}
                        </div>
                      )}
                    </div>
                    <div className="pt-1 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={checkGoogleAuth}
                        disabled={isCheckingCalendar}
                        className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCheckingCalendar ? 'animate-spin' : ''}`} />
                        <span>Test Backend Connection</span>
                      </button>
                    </div>
                  </div>

                  {/* Google Sheets Integration Status (Backend Service Account) */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-[#FF5500]" />
                          Google Sheets (Service Account)
                        </label>
                      </div>
                      {sheetsStatus?.configured ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          Connected
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                          Credentials Needed
                        </span>
                      )}
                    </div>

                    {sheetsStatus?.configured ? (
                      <div className="space-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        <p>
                          Google Sheets synchronization is active. Leads, statuses, and appointments stay in sync automatically 24/7.
                        </p>
                        {sheetsStatus.clientEmail && (
                          <div className="bg-white dark:bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 font-mono text-[10px] text-zinc-800 dark:text-zinc-300 flex items-center justify-between">
                            <span className="truncate">Service Account: {sheetsStatus.clientEmail}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2 text-xs text-zinc-700 dark:text-zinc-400 leading-relaxed bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/50 p-3 rounded-lg">
                        <p className="font-semibold text-orange-900 dark:text-orange-300">
                          Google Service Account credentials are not configured in environment variables.
                        </p>
                        <p className="text-zinc-700 dark:text-zinc-300 text-xs">
                          Please add the following variables in <strong>AI Studio Settings &gt; Secrets / Environment Variables</strong>:
                        </p>
                        <div className="bg-zinc-100 dark:bg-zinc-950 p-2.5 rounded border border-zinc-200 dark:border-zinc-800 font-mono text-xs text-zinc-800 dark:text-zinc-300 space-y-1">
                          <div>GOOGLE_SERVICE_ACCOUNT_EMAIL=<i>your-service-account@project.iam.gserviceaccount.com</i></div>
                          <div>GOOGLE_PRIVATE_KEY=<i>"-----BEGIN PRIVATE KEY-----\n..."</i></div>
                          <div>GOOGLE_SPREADSHEET_ID=<i>your_google_sheet_id</i></div>
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                          Ensure the target Google Spreadsheet is shared with the Service Account email with <strong>Editor</strong> permissions.
                        </p>
                      </div>
                    )}

                    {/* Auto-Sync Toggle */}
                    <div className="pt-1">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={autoSyncToSheets}
                          onChange={(e) => setAutoSyncToSheets(e.target.checked)}
                          className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#FF5500] focus:ring-0 focus:outline-none cursor-pointer"
                        />
                        <span>Auto-Sync Bookings to Spreadsheet</span>
                      </label>
                    </div>
                  </div>

                  {/* Houzz Pro / Zapier Webhook Integration Setting (Server Managed) */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-[#FF5500]/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#FF5500] flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-[#FF5500]" />
                          Zapier / Houzz Pro Automation (Server Managed)
                        </label>
                      </div>
                      {webhookStatus?.configured ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          Active: {webhookStatus.destination}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border border-zinc-500/30">
                          Not Configured
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div className="p-3 bg-zinc-100 dark:bg-zinc-900/60 rounded-xl border border-zinc-200 dark:border-zinc-700/60 space-y-2">
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                          <strong>Centralized Server Configuration:</strong> Outbound webhook forwarding to Zapier or Houzz Pro is configured securely via server environment variables.
                        </p>
                        <div className="text-[10px] font-mono bg-zinc-200/80 dark:bg-black/60 p-2 rounded-lg text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 space-y-0.5">
                          <div>ZAPIER_WEBHOOK_URL=https://hooks.zapier.com/hooks/catch/...</div>
                          <div className="text-zinc-500 dark:text-zinc-400">or HOUZZ_WEBHOOK_URL=https://...</div>
                        </div>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                          Set in your Render dashboard under <em>Environment Variables</em> to enable automated dispatch for all team devices.
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          disabled={testingHouzz}
                          onClick={async () => {
                            setTestingHouzz(true);
                            setHouzzTestStatus(null);
                            try {
                              const res = await sendLeadToHouzzPro(undefined, {
                                clientName: 'Test Client',
                                clientPhone: '(412) 555-0123',
                                clientEmail: 'testlead@example.com',
                                address: '123 Main St, Pittsburgh, PA',
                                serviceNeeded: 'Masonry Tuck-Pointing',
                                leadSource: 'Web App',
                                notes: 'Test lead push via Centralized Backend Webhook',
                              });
                              setHouzzTestStatus(res.message || 'Test lead sent');
                            } catch (err: any) {
                              setHouzzTestStatus(`Failed: ${err.message}`);
                            } finally {
                              setTestingHouzz(false);
                            }
                          }}
                          className="px-3 py-2 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                        >
                          <Send className={`w-3.5 h-3.5 ${testingHouzz ? 'animate-spin' : ''}`} />
                          <span>{testingHouzz ? 'Testing...' : 'Test Outbound Webhook'}</span>
                        </button>
                      </div>

                      {houzzTestStatus && (
                        <div className={`text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium ${
                          houzzTestStatus.includes('sent') || houzzTestStatus.includes('delivered') || houzzTestStatus.includes('success')
                            ? 'text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800'
                            : 'text-rose-800 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800'
                        }`}>
                          <span>{houzzTestStatus}</span>
                        </div>
                      )}

                      <div className="pt-1">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={autoSendToHouzz}
                            onChange={(e) => setAutoSendToHouzz(e.target.checked)}
                            className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#FF5500] focus:ring-0 focus:outline-none cursor-pointer"
                          />
                          <span>Auto-send to Zapier / Houzz whenever an appointment is scheduled</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Subtab: Webhooks */}
              {activeIntegrationsSubTab === 'webhooks' && (
                <div className="space-y-4">
                  {/* Inbound Lead Webhooks (Angi & Thumbtack) */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-orange-500/40 rounded-xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-2">
                          <Webhook className="w-4 h-4 text-[#FF5500]" />
                          Inbound Lead Webhooks (Angi & Thumbtack)
                        </label>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Receive live leads from Angi and Thumbtack directly into your CRM
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        Live Endpoints
                      </span>
                    </div>

                    {/* Angi Webhook */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">Angi Leads Webhook URL</span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">POST (JSON)</span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-white dark:bg-zinc-950 px-3 py-2 rounded-xl text-xs font-mono text-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700/80 truncate select-all">
                          {getWebhookUrls().angiUrl}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(getWebhookUrls().angiUrl);
                            setCopiedUrl('angi');
                            setTimeout(() => setCopiedUrl(null), 2500);
                          }}
                          className="px-3 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          {copiedUrl === 'angi' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedUrl === 'angi' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Thumbtack Webhook */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">Thumbtack Webhook URL</span>
                        <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono">POST (JSON)</span>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-white dark:bg-zinc-950 px-3 py-2 rounded-xl text-xs font-mono text-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700/80 truncate select-all">
                          {getWebhookUrls().thumbtackUrl}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(getWebhookUrls().thumbtackUrl);
                            setCopiedUrl('thumbtack');
                            setTimeout(() => setCopiedUrl(null), 2500);
                          }}
                          className="px-3 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          {copiedUrl === 'thumbtack' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedUrl === 'thumbtack' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Switch to Troubleshooting Tip */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                      <Activity className="w-4 h-4 text-[#FF5500] shrink-0" />
                      <span>Looking to test leads, inspect live server logs, or diagnose parsing?</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveIntegrationsSubTab('troubleshooting')}
                      className="px-3 py-1.5 bg-[#FF5500]/20 hover:bg-[#FF5500]/30 text-[#FF5500] border border-[#FF5500]/40 font-bold rounded-lg shrink-0 transition-all cursor-pointer"
                    >
                      Troubleshooting →
                    </button>
                  </div>
                </div>
              )}

              {/* Subtab: Troubleshooting */}
              {activeIntegrationsSubTab === 'troubleshooting' && (
                <div className="space-y-4">
                  {/* Overview Card */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700/60 rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-xs uppercase tracking-wider">
                      <Activity className="w-4 h-4 text-[#FF5500]" />
                      <span>Troubleshooting & Integration Diagnostics</span>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      Technical tools for simulating incoming leads, inspecting server webhook logs, and testing end-to-end integration health.
                    </p>
                  </div>

                  {/* Status Indicator Cards */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-3 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                        Inbound Webhooks
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold text-zinc-900 dark:text-white">Live & Listening</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">Angi & Thumbtack active</span>
                    </div>

                    <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-3 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                        Google Sheets Sync
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${sheetsStatus?.configured ? 'bg-emerald-500' : 'bg-[#FF5500]'}`}></span>
                        <span className="text-xs font-bold text-zinc-900 dark:text-white">
                          {sheetsStatus?.configured ? 'Service Account Active' : 'Credentials Needed'}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400 block">
                        {sheetsStatus?.configured ? 'Auto-sync ready' : 'Configure in environment'}
                      </span>
                    </div>
                  </div>

                  {/* Primary Diagnostic Launcher */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                          <Terminal className="w-4 h-4 text-[#FF5500]" />
                          Webhook Diagnostics Center
                        </h4>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          Full diagnostic suite: Endpoints, Test Leads, Pipeline Integrity, and Live Logs.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-[11px] text-zinc-700 dark:text-zinc-300">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                        <span>Live request inspector & raw JSON viewer</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                        <span>Simulated payload generator with field extraction checker</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                        <span>End-to-end CRM & Google Sheets ingestion verification</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsDiagOpen(true)}
                      className="w-full py-2.5 px-4 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                    >
                      <Activity className="w-4 h-4" />
                      <span>Launch Webhook Diagnostics & Test Suite</span>
                    </button>
                  </div>

                  {/* 1-Click Quick Verification Actions */}
                  <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl p-4 space-y-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      Quick Verification Actions
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={isSendingTestLead !== null || isTestingPipeline}
                        onClick={() => handleQuickTestLead('Angi')}
                        className="px-3 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 text-zinc-800 dark:text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Send className={`w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300 ${isSendingTestLead === 'Angi' ? 'animate-spin' : ''}`} />
                        <span>{isSendingTestLead === 'Angi' ? 'Sending...' : 'Test Angi'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSendingTestLead !== null || isTestingPipeline}
                        onClick={() => handleQuickTestLead('Thumbtack')}
                        className="px-3 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 text-zinc-800 dark:text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Send className={`w-3.5 h-3.5 text-zinc-600 dark:text-zinc-300 ${isSendingTestLead === 'Thumbtack' ? 'animate-spin' : ''}`} />
                        <span>{isSendingTestLead === 'Thumbtack' ? 'Sending...' : 'Test Thumbtack'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSendingTestLead !== null || isTestingPipeline}
                        onClick={handleQuickPipelineTest}
                        className="px-3 py-2 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 text-zinc-800 dark:text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 ${isTestingPipeline ? 'animate-spin' : ''}`} />
                        <span>{isTestingPipeline ? 'Verifying...' : 'Test Pipeline'}</span>
                      </button>
                    </div>

                    {quickTestResult && (
                      <div className={`p-2.5 rounded-xl text-xs font-medium border flex items-center justify-between gap-2 ${
                        quickTestResult.success
                          ? 'bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                          : 'bg-rose-100 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                      }`}>
                        <span>{quickTestResult.message}</span>
                        <button
                          type="button"
                          onClick={() => setQuickTestResult(null)}
                          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-[#FF5500] hover:bg-[#E64D00] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4 text-white" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {/* Webhook Diagnostics Modal */}
      <WebhookDiagnosticsModal
        isOpen={isDiagOpen}
        onClose={() => setIsDiagOpen(false)}
      />
    </div>
  );
};
