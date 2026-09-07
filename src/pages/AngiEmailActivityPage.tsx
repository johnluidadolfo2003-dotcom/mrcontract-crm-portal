import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ExternalLink,
  FileText,
  User,
  Phone,
  Mail,
  Building,
  Check,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { fetchIncomingWebhookLeads, IncomingWebhookLead } from '../lib/webhooks';

export const AngiEmailActivityPage: React.FC = () => {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<IncomingWebhookLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'TODAY' | 'SUCCESS' | 'NEEDS_REVIEW' | 'FAILED' | 'DUPLICATE'>('ALL');
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchIncomingWebhookLeads();
      setLeads(data || []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to load Angi email activity:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    loadData();
  };

  // Filter leads
  const filteredLeads = leads.filter((lead) => {
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (lead.clientName || '').toLowerCase().includes(q);
      const matchPhone = (lead.clientPhone || '').toLowerCase().includes(q);
      const matchEmail = (lead.clientEmail || '').toLowerCase().includes(q);
      const matchService = (lead.serviceNeeded || '').toLowerCase().includes(q);
      if (!matchName && !matchPhone && !matchEmail && !matchService) return false;
    }

    // Status filter
    const status = (lead.overallStatus || (lead.clientName && lead.clientPhone ? 'Success' : 'Needs Review')).toUpperCase();
    const isToday = lead.createdAt ? new Date(lead.createdAt).toDateString() === new Date().toDateString() : false;

    if (activeFilter === 'TODAY' && !isToday) return false;
    if (activeFilter === 'SUCCESS' && status !== 'SUCCESS' && status !== 'SENT TO HOUZZ PRO' && status !== 'SHEET SYNCED') return false;
    if (activeFilter === 'NEEDS_REVIEW' && status !== 'NEEDS REVIEW') return false;
    if (activeFilter === 'FAILED' && status !== 'FAILED' && status !== 'HOUZZ PRO FAILED') return false;
    if (activeFilter === 'DUPLICATE' && status !== 'DUPLICATE') return false;

    return true;
  });

  const getStatusBadge = (statusStr?: string) => {
    const s = (statusStr || 'Success').toLowerCase();
    if (s.includes('success') || s.includes('synced') || s.includes('sent')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          {statusStr || 'Success'}
        </span>
      );
    }
    if (s.includes('review')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-500/10 text-[#FF5500] border border-orange-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-[#FF5500]" />
          {statusStr || 'Needs Review'}
        </span>
      );
    }
    if (s.includes('duplicate')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border border-zinc-500/20">
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
          {statusStr || 'Duplicate'}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
        <XCircle className="w-3.5 h-3.5 text-rose-500" />
        {statusStr || 'Failed'}
      </span>
    );
  };

  const handleViewLead = (lead: IncomingWebhookLead) => {
    sessionStorage.setItem('prefill_lead_drawer', JSON.stringify(lead));
    navigate('/new');
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF5500]/10 border border-[#FF5500]/20 flex items-center justify-center text-[#FF5500]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
                Angi Email Activity
              </h1>
              <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                Track incoming Angi lead emails, parsing results, CRM lead creation, Google Sheets sync, and Houzz Pro automation delivery.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Last updated: <strong className="text-zinc-800 dark:text-zinc-200">{lastUpdated}</strong>
          </span>
          <button
            onClick={handleRefresh}
            disabled={loading}
            aria-label="Refresh activity"
            className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Notice / Setup Reminder */}
      <div className="bg-orange-500/5 dark:bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 mb-6 text-xs text-zinc-700 dark:text-zinc-300 flex items-start gap-3">
        <div className="w-6 h-6 rounded-full bg-orange-500/20 flex items-center justify-center text-[#FF5500] shrink-0 mt-0.5">
          <AlertCircle className="w-4 h-4" />
        </div>
        <div>
          <strong className="text-zinc-900 dark:text-white block mb-0.5 font-bold">Inbound Automation Status</strong>
          Waiting for an Angi email automation (via Zapier, Make, or email forwarding) to send real leads to this CRM.
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 mb-6 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {(['ALL', 'TODAY', 'SUCCESS', 'NEEDS_REVIEW', 'FAILED', 'DUPLICATE'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeFilter === filter
                  ? 'bg-[#FF5500] text-white shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {filter.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, phone, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-[#FF5500]/30"
          />
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950/80 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider font-bold">
                <th className="py-3 px-4">Received Time</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Client Name</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Service Requested</th>
                <th className="py-3 px-4">Lead Fee</th>
                <th className="py-3 px-4">Parsing</th>
                <th className="py-3 px-4">CRM Lead</th>
                <th className="py-3 px-4">Google Sheets</th>
                <th className="py-3 px-4">Houzz Pro</th>
                <th className="py-3 px-4">Overall Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-16 text-center text-zinc-500 dark:text-zinc-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400">
                        <Activity className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-zinc-800 dark:text-zinc-200">No Angi lead emails have reached the CRM yet.</p>
                      <p className="text-xs text-zinc-400">Waiting for an Angi email automation to send leads to this CRM.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const receivedTime = lead.createdAt ? new Date(lead.createdAt).toLocaleString() : '—';
                  const source = lead.leadSource || lead.webhookSource || 'Angi';
                  const parsingStatus = lead.parsingResult || 'Extracted';
                  const crmStatus = lead.crmResult || 'New Lead Created';
                  const sheetsStatus = lead.sheetSynced ? 'Sheet Synced' : 'Pending';
                  const houzzStatus = lead.houzzResult || (lead.sheetSynced ? 'Sent to Houzz Pro' : 'Pending');
                  const overall = lead.overallStatus || (lead.clientName ? 'Success' : 'Needs Review');

                  return (
                    <tr key={lead.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                        {receivedTime}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md font-bold bg-orange-500/10 text-[#FF5500]">
                          {source}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                        {lead.clientName || 'Unnamed Lead'}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                        {lead.clientPhone || '—'}
                      </td>
                      <td className="py-3 px-4 text-zinc-600 dark:text-zinc-300">
                        {lead.clientEmail || '—'}
                      </td>
                      <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300 max-w-[180px] truncate" title={lead.serviceNeeded}>
                        {lead.serviceNeeded || '—'}
                      </td>
                      <td className="py-3 px-4 font-medium text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                        {lead.leadFee || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{parsingStatus}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-zinc-800 dark:text-zinc-200 font-semibold">{crmStatus}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={lead.sheetSynced ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-zinc-400'}>
                          {sheetsStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{houzzStatus}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getStatusBadge(overall)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleViewLead(lead)}
                          className="px-3 py-1.5 bg-[#FF5500]/10 hover:bg-[#FF5500]/20 text-[#FF5500] rounded-lg font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <span>View lead</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
