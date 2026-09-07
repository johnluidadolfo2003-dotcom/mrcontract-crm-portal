import React, { useState, useEffect } from 'react';
import {
  Mail,
  Server,
  RefreshCw,
  Copy,
  Check,
  Send,
  Trash2,
  Database,
  ExternalLink,
  Info,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Eye,
  AlertCircle
} from 'lucide-react';
import { getWebhookUrls, fetchWebhookLogs, fetchIncomingWebhookLeads, WebhookLogItem, IncomingWebhookLead } from '../lib/webhooks';
import { useNavigate } from 'react-router-dom';

export const AngiEmailMonitorPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'activity' | 'troubleshoot' | 'simulator'>('activity');
  const [logs, setLogs] = useState<WebhookLogItem[]>([]);
  const [leads, setLeads] = useState<IncomingWebhookLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Simulator state
  const [simEmailText, setSimEmailText] = useState(
    'New Lead from Angi!\nClient Name: Marcus Vance\nPhone: (555) 382-9911\nEmail: marcus.vance@example.com\nAddress: 742 Evergreen Terrace, Springfield, OR 97477\nService: Kitchen Remodeling & Cabinet Installation\nLead Fee: $35.00\nNotes: Looking for a complete kitchen overhaul.'
  );
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  const webhookUrls = getWebhookUrls();

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedLogs, fetchedLeads] = await Promise.all([
        fetchWebhookLogs(),
        fetchIncomingWebhookLeads(),
      ]);
      setLogs(fetchedLogs);
      setLeads(fetchedLeads);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Failed to load Angi monitor data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(label);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const handleSimulateAngiEmail = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await fetch('/api/webhooks/angi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-token': 'mrcontract_secret_token_2025',
        },
        body: JSON.stringify({
          rawEmail: simEmailText,
          source: 'Angi',
          clientName: 'Marcus Vance',
          clientPhone: '(555) 382-9911',
          clientEmail: 'marcus.vance@example.com',
          address: '742 Evergreen Terrace, Springfield, OR 97477',
          serviceNeeded: 'Kitchen Remodeling',
          leadFee: '$35.00',
          notes: simEmailText,
        }),
      });
      const data = await res.json();
      setSimResult(data);
      loadData();
    } catch (err: any) {
      setSimResult({ success: false, error: err.message || 'Simulation failed' });
    } finally {
      setSimulating(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all webhook activity logs?')) return;
    try {
      await fetch('/api/webhooks/logs', { method: 'DELETE' });
      loadData();
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  // Filter logs and leads specifically for Angi
  const angiLogs = logs.filter(l => (l.source || '').toLowerCase().includes('angi'));
  const angiLeads = leads.filter(l => (l.webhookSource || l.leadSource || '').toLowerCase().includes('angi'));

  // Most recent real Angi webhook received
  const lastRealAngiLog = angiLogs[0] || null;

  // Process and compute activity rows combining leads and logs according to status rules
  const activityRows = angiLeads.map((lead) => {
    const matchingLog = angiLogs.find(l => l.leadId === lead.id || l.clientName === lead.clientName);
    const receivedTime = lead.createdAt || matchingLog?.receivedAt || new Date().toISOString();
    const source = lead.webhookSource || lead.leadSource || 'Angi Webhook';
    const clientName = lead.clientName || 'Unknown Client';
    const phone = lead.clientPhone || 'No Phone';
    const email = lead.clientEmail || 'No Email';
    const service = lead.serviceNeeded || 'General Service';
    const leadFee = lead.leadFee || lead.rawPayload?.leadFee || 'N/A';

    // Status evaluation rules
    const isMissingDetails = !clientName || clientName === 'Unknown Client' || !phone || phone === 'No Phone';
    const isDuplicate = lead.status === 'Duplicate' || (lead.notes || '').toLowerCase().includes('duplicate');
    const hasError = lead.status === 'Failed' || (matchingLog && !matchingLog.success);

    const parsingResult = 'Parsed Successfully';
    const crmResult = isDuplicate ? 'Duplicate' : isMissingDetails ? 'Needs Review' : 'Created';
    const sheetResult = lead.sheetSynced ? 'Synced' : 'Not Synced';
    const houzzResult = lead.rawPayload?.houzzDispatched ? 'Sent to Houzz' : lead.rawPayload?.houzzError ? 'Houzz Failed' : 'Not Attempted';

    let overallStatus = 'CRM Created';
    let errorMessage = '';

    if (hasError) {
      overallStatus = 'Failed';
      errorMessage = lead.rawPayload?.error || 'Automation step failed';
    } else if (isDuplicate) {
      overallStatus = 'Duplicate';
      errorMessage = 'Lead is a duplicate; intentionally not sent again.';
    } else if (isMissingDetails) {
      overallStatus = 'Needs Review';
      errorMessage = 'Important lead details such as client name or phone are missing.';
    } else if (lead.sheetSynced && houzzResult === 'Sent to Houzz') {
      overallStatus = 'Sent to Houzz';
    } else if (lead.sheetSynced) {
      overallStatus = 'Sheet Synced';
    } else if (crmResult === 'Created') {
      overallStatus = 'CRM Created';
    }

    return {
      id: lead.id,
      receivedTime,
      source,
      clientName,
      phone,
      email,
      service,
      leadFee,
      parsingResult,
      crmResult,
      sheetResult,
      houzzResult,
      overallStatus,
      errorMessage,
      rawLead: lead,
    };
  });

  // Apply filters and search
  const filteredRows = activityRows.filter(row => {
    // Search query
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      row.clientName.toLowerCase().includes(query) ||
      row.phone.toLowerCase().includes(query) ||
      row.email.toLowerCase().includes(query) ||
      row.service.toLowerCase().includes(query);

    if (!matchesSearch) return false;

    // Status filter
    if (filterStatus === 'All') return true;
    if (filterStatus === 'Today') {
      const rowDate = new Date(row.receivedTime).toDateString();
      return rowDate === new Date().toDateString();
    }
    if (filterStatus === 'Success') {
      return row.overallStatus === 'Sent to Houzz' || row.overallStatus === 'Sheet Synced' || row.overallStatus === 'CRM Created';
    }
    if (filterStatus === 'Needs Review') return row.overallStatus === 'Needs Review';
    if (filterStatus === 'Failed') return row.overallStatus === 'Failed';
    if (filterStatus === 'Duplicate') return row.overallStatus === 'Duplicate';

    return true;
  });

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-orange-700 to-zinc-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 pointer-events-none transform skew-x-12"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider w-fit mb-3">
              <Mail className="w-3.5 h-3.5" />
              <span>Angi Automation Monitor</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Angi Email Activity</h1>
            <p className="text-white/80 text-sm mt-1 max-w-2xl">
              Monitor real-time Angi lead emails received through Zapier, Make, or email forwarding, and verify every step of the automation pipeline.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-white text-orange-700 hover:bg-orange-50 font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh ({lastUpdated})</span>
            </button>
            <button
              onClick={() => setActiveTab('simulator')}
              className="px-4 py-2.5 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 font-bold text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer border border-zinc-700"
            >
              <Send className="w-4 h-4" />
              <span>Test Simulator</span>
            </button>
          </div>
        </div>
      </div>

      {/* IMPORTANT TRUTH RULE NOTICE */}
      <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl p-4 sm:p-5 flex items-start gap-4">
        <div className="p-2 rounded-xl bg-orange-600/10 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5">
          <Info className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">
            Truth Rule: Webhook & Email Automation Ingestion
          </h3>
          <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            The CRM does not read Gmail directly. Angi sends lead notification emails to your Gmail inbox. Your configured automation (Zapier, Make, or email forwarding) must POST the email payload to the CRM Webhook URL below. Activity shown here represents verified HTTP requests received by the CRM server.
          </p>
        </div>
      </div>

      {/* Live Automation Status & Webhook URL Box */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-orange-600" />
              <span>Live Inbound Webhook Endpoint for Angi</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Your Zapier, Make, or email-forwarding automation must send real Angi emails to this URL.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              lastRealAngiLog ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${lastRealAngiLog ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`}></span>
              {lastRealAngiLog ? `Live Connected (Last Webhook: ${new Date(lastRealAngiLog.receivedAt).toLocaleString()})` : 'Waiting for real Angi webhook'}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            readOnly
            value={webhookUrls.angiUrl}
            className="flex-1 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 rounded-xl px-4 py-2.5 text-xs font-mono text-zinc-800 dark:text-zinc-200 select-all"
          />
          <button
            onClick={() => handleCopy(webhookUrls.angiUrl, 'angiUrl')}
            className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {copiedUrl === 'angiUrl' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedUrl === 'angiUrl' ? 'Copied URL!' : 'Copy Webhook URL'}</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('activity')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'activity'
              ? 'bg-orange-600 text-white shadow-md'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          Angi Email Activity ({activityRows.length})
        </button>
        <button
          onClick={() => setActiveTab('troubleshoot')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'troubleshoot'
              ? 'bg-orange-600 text-white shadow-md'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          Webhook Troubleshooting & Logs ({angiLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'simulator'
              ? 'bg-orange-600 text-white shadow-md'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          Test Simulator
        </button>
      </div>

      {/* TAB 1: ANGI EMAIL ACTIVITY TABLE */}
      {activeTab === 'activity' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-sm overflow-hidden space-y-4">
          {/* Controls bar */}
          <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {['All', 'Today', 'Success', 'Needs Review', 'Failed', 'Duplicate'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterStatus(tab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterStatus === tab
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-sm'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search client, phone, email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 w-full sm:w-64"
                />
              </div>
              <button
                onClick={loadData}
                className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl text-zinc-700 dark:text-zinc-300 transition-all cursor-pointer"
                title="Refresh Activity"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Table container */}
          {filteredRows.length === 0 ? (
            <div className="p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 rounded-full flex items-center justify-center mx-auto">
                <Mail className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                  No Angi lead emails have reached the CRM yet.
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                  Waiting for an Angi email automation to send leads to this CRM. Ensure your Zapier or Make automation is active and POSTing to the webhook URL.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => setActiveTab('simulator')}
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>Test Webhook with Simulator</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 text-zinc-500 uppercase tracking-wider font-bold">
                    <th className="p-3.5">Received Time</th>
                    <th className="p-3.5">Source</th>
                    <th className="p-3.5">Client Name</th>
                    <th className="p-3.5">Phone</th>
                    <th className="p-3.5">Email</th>
                    <th className="p-3.5">Service</th>
                    <th className="p-3.5">Lead Fee</th>
                    <th className="p-3.5">Parsing</th>
                    <th className="p-3.5">CRM Lead</th>
                    <th className="p-3.5">Google Sheets</th>
                    <th className="p-3.5">Houzz Pro</th>
                    <th className="p-3.5">Overall Status</th>
                    <th className="p-3.5">Error / Note</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-medium text-zinc-800 dark:text-zinc-200">
                  {filteredRows.map((row) => {
                    const isSuccess = row.overallStatus === 'Sent to Houzz' || row.overallStatus === 'Sheet Synced' || row.overallStatus === 'CRM Created';
                    const isNeedsReview = row.overallStatus === 'Needs Review';
                    const isFailed = row.overallStatus === 'Failed';
                    const isDuplicate = row.overallStatus === 'Duplicate';

                    return (
                      <tr key={row.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                        <td className="p-3.5 whitespace-nowrap text-zinc-500">
                          {new Date(row.receivedTime).toLocaleString()}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-[11px]">
                            {row.source}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                          {row.clientName}
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {row.phone}
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {row.email}
                        </td>
                        <td className="p-3.5 max-w-[150px] truncate" title={row.service}>
                          {row.service}
                        </td>
                        <td className="p-3.5 whitespace-nowrap font-mono text-orange-600 dark:text-orange-400 font-bold">
                          {row.leadFee}
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400">
                          ✓ {row.parsingResult}
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            row.crmResult === 'Created' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}>
                            {row.crmResult}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            row.sheetResult === 'Synced' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {row.sheetResult}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            row.houzzResult === 'Sent to Houzz' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' :
                            row.houzzResult === 'Houzz Failed' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400' :
                            'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {row.houzzResult}
                          </span>
                        </td>
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full font-black text-[11px] inline-flex items-center gap-1 ${
                            isSuccess ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' :
                            isNeedsReview ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-400' :
                            isFailed ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400' :
                            isDuplicate ? 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-300' :
                            'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}>
                            {isSuccess && <CheckCircle className="w-3 h-3" />}
                            {isNeedsReview && <AlertCircle className="w-3 h-3" />}
                            {isFailed && <XCircle className="w-3 h-3" />}
                            <span>{row.overallStatus}</span>
                          </span>
                        </td>
                        <td className="p-3.5 max-w-[200px] text-rose-600 dark:text-rose-400 truncate" title={row.errorMessage}>
                          {row.errorMessage || '-'}
                        </td>
                        <td className="p-3.5 whitespace-nowrap text-right">
                          <button
                            onClick={() => navigate('/new')}
                            className="px-3 py-1.5 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 font-bold rounded-lg text-xs transition-all inline-flex items-center gap-1 cursor-pointer shadow-sm"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>View Lead</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WEBHOOK TROUBLESHOOTING & LOGS */}
      {activeTab === 'troubleshoot' && (
        <div className="space-y-6">
          {/* Troubleshooting card */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-orange-600" />
                <span>Webhook Troubleshooting & Diagnostics</span>
              </h2>
              {angiLogs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Logs</span>
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Review raw incoming HTTP requests from your automation. Sensitive payload data is protected and masked.
            </p>

            {/* Test Tool clearly labeled as Test only */}
            <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-400 text-[10px] font-black uppercase">
                  Diagnostic Tool
                </span>
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
                  Test only — does not prove that live Angi emails are connected.
                </h4>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Use the test simulator tab to dispatch a sample webhook payload and verify that your CRM handles ingestion correctly. This does not replace verifying your live Zapier/Make email trigger.
              </p>
            </div>

            {/* Logs table */}
            {angiLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                No webhook request logs recorded for Angi yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/80 border-b border-zinc-200 dark:border-zinc-700 text-zinc-500 uppercase tracking-wider font-bold">
                      <th className="p-3">Log ID</th>
                      <th className="p-3">Received Timestamp</th>
                      <th className="p-3">Client Name</th>
                      <th className="p-3">Phone (Masked)</th>
                      <th className="p-3">Source IP</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 font-medium text-zinc-800 dark:text-zinc-200">
                    {angiLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="p-3 font-mono text-zinc-500">{log.id}</td>
                        <td className="p-3 whitespace-nowrap">{new Date(log.receivedAt).toLocaleString()}</td>
                        <td className="p-3 font-bold">{log.clientName || 'N/A'}</td>
                        <td className="p-3 font-mono text-zinc-600">{log.clientPhone || 'N/A'}</td>
                        <td className="p-3 font-mono text-zinc-500">{log.ip}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            log.success ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                          }`}>
                            {log.success ? 'Success' : 'Failed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TEST SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-black text-zinc-900 dark:text-white flex items-center gap-2">
              <Send className="w-5 h-5 text-orange-600" />
              <span>Simulate Angi Inbound Email Webhook</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Test your CRM webhook ingestion pipeline with a sample Angi email payload. This will execute parsing, lead creation, Google Sheets sync, and Houzz Pro dispatch.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-2">
                Sample Angi Lead Email Body
              </label>
              <textarea
                rows={6}
                value={simEmailText}
                onChange={(e) => setSimEmailText(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-2xl p-4 font-mono text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <button
              onClick={handleSimulateAngiEmail}
              disabled={simulating}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {simulating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{simulating ? 'Sending Webhook Request...' : 'Send Test Angi Webhook'}</span>
            </button>

            {simResult && (
              <div className={`p-4 rounded-2xl border text-xs font-mono space-y-2 ${
                simResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300' : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300'
              }`}>
                <div className="font-bold flex items-center gap-2">
                  {simResult.success ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-rose-600" />}
                  <span>{simResult.success ? 'Webhook Simulation Successful' : 'Webhook Simulation Failed'}</span>
                </div>
                <pre className="overflow-x-auto p-2 bg-white/50 dark:bg-black/30 rounded-xl text-[11px]">
                  {JSON.stringify(simResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
