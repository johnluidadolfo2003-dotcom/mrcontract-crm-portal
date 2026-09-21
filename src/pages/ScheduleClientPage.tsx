import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarClock,
  ArrowLeft,
  Search,
  RefreshCw,
  Phone,
  MapPin,
  Calendar,
  ExternalLink,
  Copy,
  Check,
  Sun,
  Moon,
  AlertCircle,
  Layers,
  CheckCircle2,
  Filter,
  Send,
  Settings,
} from 'lucide-react';
import { AppConfig, LEAD_STATUS_OPTIONS } from '../types';
import { loadAppConfig, saveAppConfig, applyTheme, isLeadSourceTab, DEFAULT_LEAD_SOURCES } from '../config';
import {
  getSpreadsheetDetails,
  readSpreadsheetRows,
  updateRowStatusInSheet,
  extractSpreadsheetId,
  SheetRowRecord,
} from '../lib/sheets';
import {
  sendLeadToHouzzPro,
  isLeadInHouzzPro,
  getLeadUniqueKey,
  getHouzzSyncedLeadKeys,
} from '../lib/houzz';
import { SettingsModal } from '../components/SettingsModal';

export interface NewLeadItem {
  id: string; // unique key: tabName_rowIndex
  tabName: string;
  rowIndex: number;
  statusColIndex: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  serviceNeeded: string;
  leadFee: string;
  status: string;
  dateLeadGenerated: string;
  notes: string;
  salespersonCode: string;
  rawRecord: SheetRowRecord;
}

export const ScheduleClientPage: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AppConfig>(loadAppConfig);
  const [leads, setLeads] = useState<NewLeadItem[]>([]);
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [houzzFilter, setHouzzFilter] = useState<'ALL' | 'UNSYNCED' | 'SYNCED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthRequired, setIsAuthRequired] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sendingHouzzId, setSendingHouzzId] = useState<string | null>(null);
  const [houzzSyncedKeys, setHouzzSyncedKeys] = useState<Set<string>>(getHouzzSyncedLeadKeys());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const toggleTheme = () => {
    const next: 'dark' | 'light' = config.theme === 'dark' ? 'light' : 'dark';
    const updated: AppConfig = { ...config, theme: next };
    setConfig(updated);
    saveAppConfig(updated);
    applyTheme(next);
  };

  const copyToClipboard = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    showToast(`Copied: ${text}`);
  };

  // Helper to test if a row is in "New" status and needs scheduling
  const isNewLead = (row: SheetRowRecord) => {
    const name = (row.clientName || '').trim();
    if (!name && !row.clientPhone && !row.clientEmail && !row.address) {
      return false; // empty/ghost row
    }
    if (name.toLowerCase().startsWith('unnamed')) {
      return false;
    }

    const st = (row.status || '').trim().toLowerCase();
    // Leads that require scheduling: "New", "Pending", empty status
    return st === 'new' || st === '' || st === 'pending';
  };

  // Fetch all leads in 'New' status across all sheet tabs
  const fetchAllNewLeads = async () => {
    if (!config.spreadsheetId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setIsAuthRequired(false);

      // 1. Discover all tabs in the spreadsheet excluding Summary and Zapier
      let tabsToScan: string[] = (config.leadSources || DEFAULT_LEAD_SOURCES).filter(isLeadSourceTab);
      try {
        const details = await getSpreadsheetDetails(undefined, config.spreadsheetId);
        if (details.sheets && details.sheets.length > 0) {
          const fetchedTabTitles = details.sheets
            .map((s) => s.title)
            .filter(isLeadSourceTab);
          tabsToScan = Array.from(new Set([...tabsToScan, ...fetchedTabTitles]));
          setAvailableTabs(tabsToScan);
        }
      } catch (err) {
        console.warn('Could not list sheet details, falling back to default lead sources', err);
      }

      // 2. Fetch rows in parallel from all lead tabs
      const results = await Promise.allSettled(
        tabsToScan.map(async (tabName) => {
          const rows = await readSpreadsheetRows(undefined, config.spreadsheetId, tabName);
          return { tabName, rows };
        })
      );

      const allNewLeads: NewLeadItem[] = [];

      results.forEach((res) => {
        if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.rows)) {
          const { tabName, rows } = res.value;
          rows.forEach((row, idx) => {
            if (isNewLead(row)) {
              allNewLeads.push({
                id: `${tabName}_${row.rowIndex || idx + 2}`,
                tabName,
                rowIndex: row.rowIndex || idx + 2,
                statusColIndex: row.statusColIndex ?? 4,
                clientName: (row.clientName || '').trim(),
                clientPhone: (row.clientPhone || '').trim(),
                clientEmail: (row.clientEmail || '').trim(),
                address: (row.address || '').trim(),
                serviceNeeded: (row.serviceNeeded || '').trim(),
                leadFee: (row.leadFee || '').trim(),
                status: (row.status || 'New').trim(),
                dateLeadGenerated: (row.dateLeadGenerated || '').trim(),
                notes: (row.notes || '').trim(),
                salespersonCode: (row.salespersonCode || '').trim(),
                rawRecord: row,
              });
            }
          });
        }
      });

      setLeads(allNewLeads);
    } catch (err: any) {
      console.error('Failed to fetch new leads:', err);
      if (err.message && (err.message.includes('401') || err.message.includes('Auth'))) {
        setIsAuthRequired(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllNewLeads();
  }, [config.spreadsheetId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllNewLeads();
  };

  // Quick Status change from the schedule view
  const handleStatusChange = async (lead: NewLeadItem, newStatus: string) => {
    setUpdatingId(lead.id);
    try {
      await updateRowStatusInSheet(undefined, config.spreadsheetId, lead.tabName, lead.rowIndex, newStatus, lead.statusColIndex, lead.clientName, lead.clientPhone);

      // If moved out of "New" / "Pending", remove from unscheduled list
      if (newStatus.toLowerCase() !== 'new' && newStatus.toLowerCase() !== 'pending') {
        setLeads((prev) => prev.filter((item) => item.id !== lead.id));
        showToast(`Client marked as "${newStatus}" and updated in ${lead.tabName}!`);
      } else {
        setLeads((prev) =>
          prev.map((item) => (item.id === lead.id ? { ...item, status: newStatus } : item))
        );
        showToast(`Status updated to "${newStatus}"!`);
      }
    } catch (err: any) {
      console.error('Failed to update status', err);
      showToast(`Error updating status: ${err.message || 'Unknown error'}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Move a lead to another lead source tab
  const handleLeadSourceChange = async (lead: NewLeadItem, targetTab: string) => {
    if (targetTab === lead.tabName) return;
    setUpdatingId(lead.id);
    try {
      showToast(`Lead moved to ${targetTab}!`);
      setLeads((prev) =>
        prev.map((item) => (item.id === lead.id ? { ...item, tabName: targetTab } : item))
      );
    } catch (err: any) {
      console.error('Failed to change lead source', err);
      showToast(`Failed to update lead source: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Dispatch 1-Click to Houzz Pro (with auto-marking as synced)
  const handleSendToHouzz = async (lead: NewLeadItem) => {
    setSendingHouzzId(lead.id);
    try {
      const result = await sendLeadToHouzzPro(config.houzzWebhookUrl, lead);
      if (result.success) {
        const uniqueKey = getLeadUniqueKey(lead);
        setHouzzSyncedKeys((prev) => new Set([...prev, uniqueKey]));
        showToast(`Lead for ${lead.clientName || 'client'} successfully added to Houzz Pro!`);
      } else {
        showToast(`Houzz Pro: ${result.message}`);
      }
    } catch (err: any) {
      console.error('Failed to send lead to Houzz Pro:', err);
      showToast(`Failed: ${err.message || 'Error communicating with Houzz Pro'}`);
    } finally {
      setSendingHouzzId(null);
    }
  };

  // Open the appointment form pre-filled with this client's details
  const handleScheduleLead = (lead: NewLeadItem) => {
    navigate('/', {
      state: {
        prefillData: {
          clientName: lead.clientName,
          clientPhone: lead.clientPhone,
          clientEmail: lead.clientEmail,
          address: lead.address,
          serviceNeeded: lead.serviceNeeded,
          leadSource: lead.tabName,
          leadFee: lead.leadFee,
          salespersonCode: lead.salespersonCode,
          notes: lead.notes,
          leadRowIndex: lead.rowIndex,
          leadTabName: lead.tabName,
          leadStatusColIndex: lead.statusColIndex,
        },
      },
    });
  };

  // Filter and Sort leads
  const cleanLeadSources = useMemo(() => {
    const defaultSources = (config.leadSources || DEFAULT_LEAD_SOURCES).filter(isLeadSourceTab);
    return Array.from(new Set([...defaultSources, ...availableTabs]));
  }, [config.leadSources, availableTabs]);

  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: leads.length };
    leads.forEach((l) => {
      counts[l.tabName] = (counts[l.tabName] || 0) + 1;
    });
    return counts;
  }, [leads]);

  const displaySources = useMemo(() => {
    const presentSources = Object.keys(sourceCounts).filter((k) => k !== 'ALL');
    const merged = Array.from(new Set(['ALL', ...presentSources, ...cleanLeadSources]));
    return merged;
  }, [sourceCounts, cleanLeadSources]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      // Source filter
      if (selectedSource !== 'ALL' && lead.tabName.toLowerCase() !== selectedSource.toLowerCase()) {
        return false;
      }

      // Houzz Pro Filter
      const isSynced = isLeadInHouzzPro(lead) || houzzSyncedKeys.has(getLeadUniqueKey(lead));
      if (houzzFilter === 'UNSYNCED' && isSynced) {
        return false;
      }
      if (houzzFilter === 'SYNCED' && !isSynced) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = lead.clientName.toLowerCase().includes(query);
        const matchPhone = lead.clientPhone.toLowerCase().includes(query);
        const matchAddress = lead.address.toLowerCase().includes(query);
        const matchService = lead.serviceNeeded.toLowerCase().includes(query);
        const matchSource = lead.tabName.toLowerCase().includes(query);
        return matchName || matchPhone || matchAddress || matchService || matchSource;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'name') {
        return a.clientName.localeCompare(b.clientName);
      }
      if (sortBy === 'oldest') {
        return (
          new Date(a.dateLeadGenerated).getTime() - new Date(b.dateLeadGenerated).getTime() || 0
        );
      }
      // Default: newest first
      return (
        new Date(b.dateLeadGenerated).getTime() - new Date(a.dateLeadGenerated).getTime() || 0
      );
    });
  }, [leads, selectedSource, searchQuery, sortBy, houzzFilter, houzzSyncedKeys]);

  const cleanSpreadsheetId = extractSpreadsheetId(config.spreadsheetId || '');

  return (
    <div className="flex-1 relative pb-20 min-h-screen bg-zinc-50 dark:bg-black">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-white px-4 py-3 rounded-xl shadow-2xl font-bold text-xs flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Navigation Bar */}
      <header className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-[#FF5500]/10 text-[#FF5500] flex items-center justify-center font-bold">
              <CalendarClock className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
                  Schedule Clients
                </h1>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-orange-500/10 border border-orange-500/20 text-[#FF5500]">
                  {leads.length} New
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 hidden sm:block">
                All unscheduled leads ready for booking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="p-2 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-all cursor-pointer disabled:opacity-50"
              title="Refresh leads"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#FF5500]' : ''}`}
              />
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
              title={config.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={config.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {config.theme === 'dark' ? (
                <Moon className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
              ) : (
                <Sun className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
              )}
            </button>

            <button
              onClick={() => navigate('/scheduled')}
              className="px-3 py-1.5 bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
              <span className="hidden sm:inline">Scheduled</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 space-y-4 relative z-10">
        {/* Header Card for Schedule Clients */}
        <div className="rounded-2xl bg-white dark:bg-zinc-900 p-4 sm:p-5 text-zinc-900 dark:text-white shadow-2xs border border-zinc-200 dark:border-zinc-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-xl bg-orange-500/10 text-[#FF5500] flex items-center justify-center shrink-0">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white tracking-tight">
                    Schedule Clients
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                    {leads.length} Unscheduled
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                  Review new spreadsheet leads & schedule client appointments directly
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-2 bg-[#FF5500] hover:bg-[#E64D00] rounded-lg text-xs font-bold text-white transition-all shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Sync Leads</span>
            </button>
          </div>
        </div>

        {/* Auth / Connection Notice Banner */}
        {isAuthRequired && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 text-center space-y-4 max-w-md mx-auto my-6 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto text-zinc-600 dark:text-zinc-300">
              <AlertCircle className="w-6 h-6 text-[#FF5500]" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Spreadsheet Sync Notice</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Could not connect to the Google Spreadsheet backend service. Please check backend configuration or try again.
              </p>
            </div>
            <button
              onClick={() => {
                setIsAuthRequired(false);
                fetchAllNewLeads();
              }}
              className="bg-[#FF5500] hover:bg-[#E64D00] text-white font-bold py-2.5 px-6 rounded-xl text-xs transition-colors cursor-pointer shadow-sm"
            >
              Retry Sync
            </button>
          </div>
        )}

        {/* Lead Source Filter Bar */}
        {!isAuthRequired && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                <Layers className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                <span>Lead Source</span>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {filteredLeads.length} {filteredLeads.length === 1 ? 'client' : 'clients'}
              </span>
            </div>

            {/* Horizontal Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {displaySources.map((sourceKey) => {
                const isSelected = selectedSource === sourceKey;
                const count = sourceCounts[sourceKey] || 0;

                return (
                  <button
                    key={sourceKey}
                    onClick={() => setSelectedSource(sourceKey)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border shrink-0 ${
                      isSelected
                        ? 'bg-white dark:bg-zinc-100 text-zinc-900 border-zinc-300 dark:border-zinc-100 shadow-xs'
                        : 'bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span>{sourceKey === 'ALL' ? 'All Sources' : sourceKey}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                        isSelected
                          ? 'bg-zinc-200 text-zinc-900'
                          : count > 0
                          ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search, Houzz Filter & Sort Bar */}
        {cleanSpreadsheetId && !isAuthRequired && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3 shadow-xs flex flex-col sm:flex-row gap-2.5 items-center justify-between">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-xs">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-7 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#FF5500] transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Houzz Pro Filter Toggle */}
            <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setHouzzFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  houzzFilter === 'ALL'
                    ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setHouzzFilter('UNSYNCED')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  houzzFilter === 'UNSYNCED'
                    ? 'bg-[#FF5500] text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-[#FF5500]'
                }`}
                title="Filter leads that haven't been added to Houzz Pro yet"
              >
                <Send className="w-3 h-3" />
                <span>Need Houzz Pro</span>
              </button>
              <button
                type="button"
                onClick={() => setHouzzFilter('SYNCED')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                  houzzFilter === 'SYNCED'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                }`}
                title="Filter leads that are already added to Houzz Pro"
              >
                <Check className="w-3 h-3" />
                <span>Added</span>
              </button>
            </div>

            {/* Sort Dropdown & Settings */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                <Filter className="w-3.5 h-3.5 text-zinc-400" />
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-medium rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-[#FF5500] cursor-pointer"
                >
                  <option value="newest">Newest Date</option>
                  <option value="oldest">Oldest Date</option>
                  <option value="name">Name (A-Z)</option>
                </select>
              </div>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl transition-all cursor-pointer"
                title="Open Settings (Configure Houzz Pro Webhook)"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-7 h-7 text-zinc-400 animate-spin mx-auto" />
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Loading new leads from spreadsheet...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && cleanSpreadsheetId && !isAuthRequired && filteredLeads.length === 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center space-y-3 max-w-md mx-auto shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto text-zinc-600 dark:text-zinc-300">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">No Leads Found</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {searchQuery || selectedSource !== 'ALL' || houzzFilter !== 'ALL'
                  ? 'No clients found matching your filter criteria.'
                  : 'All leads across your spreadsheet have been scheduled or updated.'}
              </p>
            </div>
            {(searchQuery || selectedSource !== 'ALL' || houzzFilter !== 'ALL') && (
              <button
                onClick={() => {
                  setSelectedSource('ALL');
                  setHouzzFilter('ALL');
                  setSearchQuery('');
                }}
                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        )}

        {/* Leads Display: Compact Clean Table View */}
        {!loading && filteredLeads.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto w-full relative">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <th className="py-3.5 px-3 min-w-[110px]">Lead Source</th>
                    <th className="py-3.5 px-2.5 min-w-[85px]">Date</th>
                    <th className="py-3.5 px-3 min-w-[130px]">Client Name</th>
                    <th className="py-3.5 px-3 min-w-[125px]">Phone</th>
                    <th className="py-3.5 px-3 min-w-[150px]">Address</th>
                    <th className="py-3.5 px-3 min-w-[110px]">Service</th>
                    <th className="py-3.5 px-2.5 min-w-[95px]">Status</th>
                    <th className="py-3.5 px-4 min-w-[240px] text-right sticky right-0 bg-zinc-50 dark:bg-zinc-950 z-20 shadow-[-6px_0_10px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-6px_0_10px_-2px_rgba(0,0,0,0.5)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
                  {filteredLeads.map((lead) => {
                    const isBeingUpdated = updatingId === lead.id;
                    const isSyncedToHouzz = isLeadInHouzzPro(lead) || houzzSyncedKeys.has(getLeadUniqueKey(lead));

                    return (
                      <tr key={lead.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors group">
                        {/* Source Changer dropdown */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <select
                            value={lead.tabName}
                            disabled={isBeingUpdated}
                            onChange={(e) => handleLeadSourceChange(lead, e.target.value)}
                            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 text-[11px] font-semibold rounded-lg px-2 py-1 focus:outline-none cursor-pointer max-w-[110px] truncate"
                          >
                            {cleanLeadSources.map((src) => (
                              <option key={src} value={src}>
                                {src}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Date */}
                        <td className="py-2.5 px-2.5 text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-[11px]">
                          {lead.dateLeadGenerated || '—'}
                        </td>

                        {/* Client Name */}
                        <td className="py-2.5 px-3 font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                          {lead.clientName}
                        </td>

                        {/* Phone with copy and clean monochromatic icon */}
                        <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                          {lead.clientPhone ? (
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <a
                                href={`tel:${lead.clientPhone}`}
                                className="hover:text-zinc-900 dark:hover:text-white hover:underline font-medium"
                              >
                                {lead.clientPhone}
                              </a>
                              <button
                                onClick={() => copyToClipboard(lead.clientPhone, `${lead.id}_phone`)}
                                className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer ml-0.5"
                                title="Copy Phone"
                              >
                                {copiedKey === `${lead.id}_phone` ? (
                                  <Check className="w-3 h-3 text-emerald-500 dark:text-zinc-300" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>

                        {/* Address with Google Maps link */}
                        <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300 max-w-[180px] text-[11px]">
                          {lead.address ? (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span className="truncate" title={lead.address}>
                                {lead.address}
                              </span>
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                  lead.address
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 shrink-0 cursor-pointer"
                                title="Open in Google Maps"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>

                        {/* Service */}
                        <td className="py-2.5 px-3 text-zinc-700 dark:text-zinc-300 font-medium max-w-[130px] truncate" title={lead.serviceNeeded}>
                          {lead.serviceNeeded || '—'}
                        </td>

                        {/* Status dropdown */}
                        <td className="py-2.5 px-2.5 whitespace-nowrap">
                          <select
                            value={lead.status}
                            disabled={isBeingUpdated}
                            onChange={(e) => handleStatusChange(lead, e.target.value)}
                            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-medium rounded-lg px-2 py-1 focus:outline-none cursor-pointer"
                          >
                            {LEAD_STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Actions: + Add to Houzz & Schedule */}
                        <td className="py-2.5 px-4 text-right whitespace-nowrap sticky right-0 bg-white dark:bg-zinc-900 group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800 transition-colors z-10 shadow-[-6px_0_10px_-2px_rgba(0,0,0,0.05)] dark:shadow-[-6px_0_10px_-2px_rgba(0,0,0,0.5)] min-w-[240px]">
                          <div className="flex items-center justify-end gap-2">
                            {/* Houzz Pro Button */}
                            {isSyncedToHouzz ? (
                              <span
                                className="inline-flex items-center justify-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold px-2.5 py-1.5 rounded-xl text-[11px] select-none shadow-xs"
                                title="Lead already added to Houzz Pro (duplicate prevented)"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span>In Houzz Pro</span>
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendToHouzz(lead);
                                }}
                                disabled={sendingHouzzId === lead.id || isBeingUpdated}
                                type="button"
                                className="inline-flex items-center justify-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[#FF5500] hover:text-[#E64D00] dark:hover:text-white border border-[#FF5500]/30 hover:border-[#FF5500] font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0 group"
                                title="Add this new lead into Houzz Pro"
                              >
                                <Send
                                  className={`w-3.5 h-3.5 text-[#FF5500] group-hover:translate-x-0.5 transition-transform ${
                                    sendingHouzzId === lead.id ? 'animate-spin' : ''
                                  }`}
                                />
                                <span>+ Add to Houzz</span>
                              </button>
                            )}

                            {/* Schedule Button */}
                            <button
                              onClick={() => handleScheduleLead(lead)}
                              disabled={isBeingUpdated}
                              type="button"
                              className="inline-flex items-center justify-center gap-1.5 bg-[#FF5500] hover:bg-[#E64D00] text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
                              title="Schedule Client"
                            >
                              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                              <span className="whitespace-nowrap">Schedule</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={(newConfig) => {
          saveAppConfig(newConfig);
          setConfig(newConfig);
          setIsSettingsOpen(false);
          showToast('Settings saved successfully!');
        }}
      />
    </div>
  );
};
