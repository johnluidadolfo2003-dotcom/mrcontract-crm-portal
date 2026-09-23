import React, { useState, useEffect } from 'react';
import {
  Activity,
  CheckCircle,
  Copy,
  RefreshCw,
  Send,
  Trash2,
  X,
  AlertTriangle,
  Zap,
  Code,
  ShieldCheck,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  getWebhookUrls,
  fetchWebhookDiagnostics,
  sendTestWebhookLead,
  testDiagnoseWebhookPayload,
  clearWebhookLogs,
  clearAllIncomingWebhookLeads,
  runFullPipelineTest,
  WebhookDiagnosticsData,
} from '../lib/webhooks';

interface WebhookDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadCreated?: () => void;
}

export const WebhookDiagnosticsModal: React.FC<WebhookDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  onLeadCreated,
}) => {
  const [activeTab, setActiveTab] = useState<'endpoints' | 'test' | 'pipeline' | 'diagnose' | 'logs'>('pipeline');
  const [diagData, setDiagData] = useState<WebhookDiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Pipeline Test State
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<any>(null);

  // 1-Click Test state
  const [testingSource, setTestingSource] = useState<'Angi' | 'Thumbtack' | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Interactive Live Diagnostic State
  const [rawInput, setRawInput] = useState('');
  const [selectedSource, setSelectedSource] = useState('Angi');
  const [analyzing, setAnalyzing] = useState(false);
  const [diagResult, setDiagResult] = useState<any>(null);

  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      const data = await fetchWebhookDiagnostics();
      setDiagData(data);
    } catch (err) {
      console.error('Failed to load webhook diagnostics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDiagnostics();
    }
  }, [isOpen]);

  const handleRunPipeline = async (customEmail?: string) => {
    setRunningPipeline(true);
    setPipelineResult(null);
    try {
      const result = await runFullPipelineTest({
        rawEmail: customEmail,
        source: 'Angi',
        syncToSheets: true,
        sendToHouzz: true,
      });
      setPipelineResult(result);
      loadDiagnostics();
      if (onLeadCreated) onLeadCreated();
    } catch (err: any) {
      setPipelineResult({ success: false, error: err.message || 'Pipeline test failed.' });
    } finally {
      setRunningPipeline(false);
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

  const urls = getWebhookUrls();

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(id);
    setTimeout(() => setCopiedUrl(null), 2500);
  };

  const handleRun1ClickTest = async (source: 'Angi' | 'Thumbtack') => {
    setTestingSource(source);
    setTestResult(null);
    try {
      const res = await sendTestWebhookLead(source);
      setTestResult(res);
      if (res.success) {
        loadDiagnostics();
        if (onLeadCreated) onLeadCreated();
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Failed to trigger test webhook.' });
    } finally {
      setTestingSource(null);
    }
  };

  const handleAnalyzePayload = async (saveLead: boolean = false) => {
    if (!rawInput.trim()) return;
    setAnalyzing(true);
    setDiagResult(null);
    try {
      const isJson = rawInput.trim().startsWith('{') || rawInput.trim().startsWith('[');
      let payloadObj = null;
      let rawEmailStr = undefined;

      if (isJson) {
        try {
          payloadObj = JSON.parse(rawInput.trim());
        } catch {
          rawEmailStr = rawInput;
        }
      } else {
        rawEmailStr = rawInput;
      }

      const res = await testDiagnoseWebhookPayload({
        payload: payloadObj,
        rawEmail: rawEmailStr,
        source: selectedSource,
        saveLead,
      });

      setDiagResult(res);
      if (res.success && saveLead) {
        loadDiagnostics();
        if (onLeadCreated) onLeadCreated();
      }
    } catch (err: any) {
      setDiagResult({ success: false, error: err.message || 'Diagnostic analysis failed.' });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClearLogs = async () => {
    if (window.confirm('Are you sure you want to clear all webhook activity logs?')) {
      await clearWebhookLogs();
      loadDiagnostics();
    }
  };

  const handleClearWebhookLeads = async () => {
    if (window.confirm('Are you sure you want to remove all incoming webhook leads?')) {
      await clearAllIncomingWebhookLeads();
      loadDiagnostics();
      if (onLeadCreated) onLeadCreated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 font-sans">
      <div className="bg-white dark:bg-[#121215] border border-zinc-200 dark:border-zinc-800 w-full max-w-4xl rounded-md shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[#EF7E15]/15 border border-[#EF7E15]/30 flex items-center justify-center text-[#EF7E15]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-white tracking-tight">
                  Angi & Webhook Diagnostics
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Operational
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Inspect live webhook endpoints, test lead ingestion, and diagnose payload parser results.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300 flex items-center justify-center transition-colors duration-120 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diagnostic Stats Header Bar */}
        <div className="px-5 py-2.5 bg-zinc-100/70 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="bg-white dark:bg-zinc-950/60 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] font-semibold uppercase">Total Leads</span>
            <span className="text-zinc-900 dark:text-white font-bold text-sm tabular-nums">{diagData?.counts?.totalIncomingLeads ?? 0}</span>
          </div>
          <div className="bg-white dark:bg-zinc-950/60 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
            <span className="text-[#EF7E15] block text-[10px] font-semibold uppercase">Angi Leads</span>
            <span className="text-zinc-900 dark:text-white font-bold text-sm tabular-nums">{diagData?.counts?.angiLeadsCount ?? 0}</span>
          </div>
          <div className="bg-white dark:bg-zinc-950/60 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] font-semibold uppercase">Thumbtack Leads</span>
            <span className="text-zinc-900 dark:text-white font-bold text-sm tabular-nums">{diagData?.counts?.thumbtackLeadsCount ?? 0}</span>
          </div>
          <div className="bg-white dark:bg-zinc-950/60 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400 block text-[10px] font-semibold uppercase">Total Webhook Logs</span>
            <span className="text-zinc-900 dark:text-white font-bold text-sm tabular-nums">{diagData?.counts?.totalLogs ?? 0}</span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-t-md transition-colors duration-120 flex items-center gap-1.5 cursor-pointer border-b-2 ${
              activeTab === 'pipeline'
                ? 'text-[#EF7E15] border-[#EF7E15] bg-white dark:bg-zinc-800/60'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Full Pipeline Test (4 Steps)</span>
          </button>
          <button
            onClick={() => setActiveTab('endpoints')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-t-md transition-colors duration-120 flex items-center gap-1.5 cursor-pointer border-b-2 ${
              activeTab === 'endpoints'
                ? 'text-[#EF7E15] border-[#EF7E15] bg-white dark:bg-zinc-800/60'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Webhook URLs</span>
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-t-md transition-colors duration-120 flex items-center gap-1.5 cursor-pointer border-b-2 ${
              activeTab === 'test'
                ? 'text-[#EF7E15] border-[#EF7E15] bg-white dark:bg-zinc-800/60'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>1-Click Test Generator</span>
          </button>
          <button
            onClick={() => setActiveTab('diagnose')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-t-md transition-colors duration-120 flex items-center gap-1.5 cursor-pointer border-b-2 ${
              activeTab === 'diagnose'
                ? 'text-[#EF7E15] border-[#EF7E15] bg-white dark:bg-zinc-800/60'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Live Parser Test</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-t-md transition-colors duration-120 flex items-center gap-1.5 cursor-pointer border-b-2 ${
              activeTab === 'logs'
                ? 'text-[#EF7E15] border-[#EF7E15] bg-white dark:bg-zinc-800/60'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Webhook Logs (<span className="tabular-nums">{diagData?.counts?.totalLogs ?? 0}</span>)</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 bg-zinc-50/50 dark:bg-[#121215]">
          {/* TAB: FULL PIPELINE TEST */}
          {activeTab === 'pipeline' && (
            <div className="space-y-3.5">
              {/* Test-only & Setup Reminder Notice */}
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-md p-3.5 text-xs space-y-1.5 text-zinc-800 dark:text-zinc-200">
                <div className="flex items-center gap-2 font-bold text-[#EF7E15]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Test only — does not prove that live Angi emails are connected.</span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Your Zapier, Make, or email-forwarding automation must send real Angi emails to this URL: <code className="bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-900 dark:text-white font-mono text-[11px]">{window.location.origin}/api/webhooks/angi</code>
                </p>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 pt-1 border-t border-orange-500/20 tabular-nums">
                  Live Status: <strong className="text-zinc-800 dark:text-zinc-200">{diagData?.webhookStatus?.lastRealAngiWebhookAt ? `Last real Angi webhook received at ${new Date(diagData.webhookStatus.lastRealAngiWebhookAt).toLocaleString()}` : 'No real Angi webhooks received yet'}</strong>
                </div>
              </div>

              <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800/80 pb-3">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#EF7E15]" />
                      End-to-End Angi Lead Pipeline Validator
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Executes and validates all 4 stages simultaneously: Email Ingestion → In-App CRM Lead → Google Sheets Row → Houzz Pro / Zapier Dispatch.
                    </p>
                  </div>

                  <button
                    onClick={() => handleRunPipeline()}
                    disabled={runningPipeline}
                    className="px-4 h-[34px] bg-[#EF7E15] hover:bg-[#D66B0F] text-white rounded-md text-xs font-bold transition-colors duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${runningPipeline ? 'animate-spin' : ''}`} />
                    <span>{runningPipeline ? 'Running 4-Step Test...' : 'Run Full Pipeline Test'}</span>
                  </button>
                </div>

                {/* 4 Pipeline Step Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Step 1: Email Reception & Extraction */}
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-md border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-[#EF7E15]/20 text-[#EF7E15] text-[11px] font-mono flex items-center justify-center font-bold">1</span>
                        Angi Email Reception & Parsing
                      </span>
                      {pipelineResult?.step1_extraction?.success ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Extracted
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Ready</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Parses name, phone, email, address, service, and fee from Angi email notifications or JSON webhooks.
                    </p>
                    {pipelineResult?.step1_extraction?.extracted && (
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800/80 text-[11px] space-y-1 text-zinc-700 dark:text-zinc-300">
                        <div><strong className="text-zinc-900 dark:text-white">Client:</strong> {pipelineResult.step1_extraction.extracted.clientName}</div>
                        <div><strong className="text-zinc-900 dark:text-white">Phone:</strong> <span className="tabular-nums">{pipelineResult.step1_extraction.extracted.clientPhone}</span></div>
                        <div><strong className="text-zinc-900 dark:text-white">Task:</strong> {pipelineResult.step1_extraction.extracted.serviceNeeded}</div>
                      </div>
                    )}
                  </div>

                  {/* Step 2: In-App CRM Storage */}
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-md border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-[#EF7E15]/20 text-[#EF7E15] text-[11px] font-mono flex items-center justify-center font-bold">2</span>
                        In-App CRM Lead Creation
                      </span>
                      {pipelineResult?.step2_app_database?.success ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Saved in CRM
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Ready</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Creates record in CRM database and pushes to the New Leads page instantly.
                    </p>
                    {pipelineResult?.step2_app_database?.savedLeadId && (
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800/80 text-[11px] space-y-1 text-zinc-700 dark:text-zinc-300">
                        <div><strong className="text-zinc-900 dark:text-white">Lead ID:</strong> <span className="font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">{pipelineResult.step2_app_database.savedLeadId}</span></div>
                        <div><strong className="text-zinc-900 dark:text-white">Status:</strong> <span className="text-emerald-600 dark:text-emerald-400 font-bold">New</span></div>
                      </div>
                    )}
                  </div>

                  {/* Step 3: Google Sheets Row Insertion */}
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-md border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono flex items-center justify-center font-bold">3</span>
                        Google Sheets Row Placement
                      </span>
                      {pipelineResult?.step3_google_sheets?.success ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> Appended Row
                        </span>
                      ) : pipelineResult?.step3_google_sheets?.error ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Auth Required
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Ready</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Inserts new lead row directly under header into the <strong className="text-zinc-900 dark:text-white">"Angi"</strong> tab in Google Sheets.
                    </p>
                    {pipelineResult?.step3_google_sheets && (
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800/80 text-[11px] space-y-1 text-zinc-700 dark:text-zinc-300">
                        <div><strong className="text-zinc-900 dark:text-white">Target Tab:</strong> <span className="text-[#EF7E15] font-bold">{pipelineResult.step3_google_sheets.targetTab || 'Angi'}</span></div>
                        <div><strong className="text-zinc-900 dark:text-white">Result:</strong> {pipelineResult.step3_google_sheets.success ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">Appended Successfully</span> : <span className="text-orange-600 dark:text-orange-400">{pipelineResult.step3_google_sheets.error}</span>}</div>
                      </div>
                    )}
                  </div>

                  {/* Step 4: Houzz Pro / Zapier Dispatch */}
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-md border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-mono flex items-center justify-center font-bold border border-zinc-300 dark:border-zinc-700">4</span>
                        Houzz Pro / Zapier Dispatch
                      </span>
                      {pipelineResult?.step4_houzz_zapier?.success ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> HTTP 200 OK
                        </span>
                      ) : pipelineResult?.step4_houzz_zapier?.error ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Failed
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Ready</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                      Dispatches payload to your Zapier Catch Hook for automatic Houzz Pro lead ingestion.
                    </p>
                    {pipelineResult?.step4_houzz_zapier && (
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800/80 text-[11px] space-y-1 text-zinc-700 dark:text-zinc-300">
                        <div><strong className="text-zinc-900 dark:text-white">Zapier Catch Status:</strong> <span className="text-emerald-600 dark:text-emerald-400 font-bold">{pipelineResult.step4_houzz_zapier.status || (pipelineResult.step4_houzz_zapier.success ? '200 OK' : 'Error')}</span></div>
                        <div className="truncate"><strong className="text-zinc-900 dark:text-white">Hook:</strong> <span className="font-mono text-zinc-500 dark:text-zinc-400">{pipelineResult.step4_houzz_zapier.url}</span></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'endpoints' && (
            <div className="space-y-3.5">
              <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#EF7E15]" />
                      Primary Angi Leads Webhook
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Use this endpoint in Zapier, Make, Angi Leads Integration, or your email forwarding webhook.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[#EF7E15]/10 text-[#EF7E15] border border-[#EF7E15]/30 font-bold">
                    POST (JSON/Text/Form)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 px-3 py-2 rounded-md text-xs font-mono text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 truncate select-all">
                    {urls.angiUrl}
                  </div>
                  <button
                    onClick={() => handleCopy(urls.angiUrl, 'angi')}
                    className="px-3.5 h-[34px] bg-[#EF7E15] hover:bg-[#D66B0F] text-white rounded-md text-xs font-bold transition-colors duration-120 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {copiedUrl === 'angi' ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedUrl === 'angi' ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                  <div className="bg-zinc-50 dark:bg-zinc-950/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800/80">
                    <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Accepted Payloads</span>
                    <span className="text-zinc-800 dark:text-zinc-200 font-medium text-xs">JSON, Raw Email, or Form</span>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-950/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800/80">
                    <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Auto-Tagging</span>
                    <span className="text-[#EF7E15] font-bold text-xs">Source: "Angi"</span>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-950/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800/80">
                    <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Spreadsheet Sync</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium text-xs">Auto-appends to "Angi" tab</span>
                  </div>
                </div>
              </div>

              {/* Universal Webhook */}
              <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#EF7E15]" />
                      Universal Webhook (Auto-Detect Source)
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Handles all lead sources (Angi, Thumbtack, Website, Referral) dynamically.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 px-3 py-2 rounded-md text-xs font-mono text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 truncate select-all">
                    {urls.universalUrl}
                  </div>
                  <button
                    onClick={() => handleCopy(urls.universalUrl, 'univ')}
                    className="px-3.5 h-[34px] bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded-md text-xs font-bold transition-colors duration-120 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {copiedUrl === 'univ' ? <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedUrl === 'univ' ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>
              </div>

              {/* Thumbtack Webhook */}
              <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-zinc-400" />
                      Thumbtack Webhook
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Dedicated endpoint for Thumbtack Pro lead alerts.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-zinc-100 dark:bg-zinc-950 px-3 py-2 rounded-md text-xs font-mono text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-800 truncate select-all">
                    {urls.thumbtackUrl}
                  </div>
                  <button
                    onClick={() => handleCopy(urls.thumbtackUrl, 'thumb')}
                    className="px-3.5 h-[34px] bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded-md text-xs font-bold transition-colors duration-120 flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {copiedUrl === 'thumb' ? <Check className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedUrl === 'thumb' ? 'Copied!' : 'Copy URL'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 1-CLICK TEST GENERATOR */}
          {activeTab === 'test' && (
            <div className="space-y-3.5">
              <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-4 space-y-3.5">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white">Trigger a Live Simulated Webhook Lead</h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Test the complete ingestion pipeline end-to-end (webhook receiver, parser, storage, and UI real-time refresh) with a single click.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Angi Test Card */}
                  <div className="bg-zinc-50 dark:bg-zinc-950 border border-orange-500/30 rounded-md p-3.5 space-y-2.5 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#EF7E15] uppercase tracking-wider flex items-center gap-1.5">
                        Angi Lead Test
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">$42.50 fee</span>
                    </div>

                    <div className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                      <p className="font-semibold text-zinc-900 dark:text-white">Sarah Jenkins</p>
                      <p className="text-zinc-500 dark:text-zinc-400 tabular-nums">(412) 555-0144 • sarah.jenkins@example.com</p>
                      <p className="text-zinc-500 dark:text-zinc-400">789 Forbes Ave, Pittsburgh, PA 15213</p>
                      <p className="text-[#EF7E15] font-medium text-[11px] pt-0.5">Front Porch Retaining Wall Rebuild</p>
                    </div>

                    <button
                      onClick={() => handleRun1ClickTest('Angi')}
                      disabled={testingSource !== null}
                      className="w-full h-[34px] bg-[#EF7E15] hover:bg-[#D66B0F] text-white rounded-md text-xs font-bold transition-colors duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Send className={`w-3.5 h-3.5 ${testingSource === 'Angi' ? 'animate-spin' : ''}`} />
                      <span>{testingSource === 'Angi' ? 'Injecting Lead...' : 'Send Test Angi Lead'}</span>
                    </button>
                  </div>

                  {/* Thumbtack Test Card */}
                  <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md p-3.5 space-y-2.5 relative overflow-hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                        Thumbtack Lead Test
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums">$38.00 fee</span>
                    </div>

                    <div className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
                      <p className="font-semibold text-zinc-900 dark:text-white">Michael Rodriguez</p>
                      <p className="text-zinc-500 dark:text-zinc-400 tabular-nums">(412) 555-0188 • m.rodriguez@example.com</p>
                      <p className="text-zinc-500 dark:text-zinc-400">456 Penn Ave, Pittsburgh, PA 15222</p>
                      <p className="text-zinc-600 dark:text-zinc-400 font-medium text-[11px] pt-0.5">Brick Chimney Repair & Tuck-Pointing</p>
                    </div>

                    <button
                      onClick={() => handleRun1ClickTest('Thumbtack')}
                      disabled={testingSource !== null}
                      className="w-full h-[34px] bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded-md text-xs font-bold border border-zinc-300 dark:border-zinc-700 transition-colors duration-120 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <Send className={`w-3.5 h-3.5 ${testingSource === 'Thumbtack' ? 'animate-spin' : ''}`} />
                      <span>{testingSource === 'Thumbtack' ? 'Injecting Lead...' : 'Send Test Thumbtack Lead'}</span>
                    </button>
                  </div>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-md text-xs font-semibold flex items-center justify-between ${
                      testResult.success
                        ? 'bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {testResult.success ? <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />}
                      <span>{testResult.message}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: LIVE PAYLOAD PARSER TEST */}
          {activeTab === 'diagnose' && (
            <div className="space-y-3.5">
              <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold text-zinc-900 dark:text-white">Live Payload & Email Diagnostic Analyzer</h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Paste ANY raw Angi lead notification email or Zapier JSON payload to test how the parser extracts fields.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">Source:</span>
                    <select
                      value={selectedSource}
                      onChange={(e) => setSelectedSource(e.target.value)}
                      className="bg-white dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md px-2.5 h-[32px] text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#EF7E15]"
                    >
                      <option value="Angi">Angi</option>
                      <option value="Thumbtack">Thumbtack</option>
                      <option value="Houzz Pro">Houzz Pro</option>
                      <option value="Referral">Referral</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <textarea
                    rows={5}
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    placeholder={`Paste raw Angi email text or JSON payload here...\nExample:\nYou have a new lead!\nClean and Inspect a Wood Fireplace Chimney\n\nCustomer Information\nJAN MCCOY\n(412) 491-2719\njanrealmccoy@yahoo.com\n631 W Waldheim Rd, Pittsburgh, PA 15215`}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-md p-3 text-xs font-mono text-zinc-900 dark:text-zinc-200 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-[#EF7E15]"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRawInput(`Angi
You have a new lead!
Clean and Inspect a Wood Fireplace Chimney

Customer Information
JAN MCCOY
(412) 491-2719
Send a Message
janrealmccoy@yahoo.com
631 W Waldheim Rd, Pittsburgh, PA 15215

Lead Details:
Need full chimney inspection and tuckpointing quote.
Lead Fee: $45.00`)
                      }
                      className="text-[11px] text-[#EF7E15] hover:underline cursor-pointer font-medium"
                    >
                      Load Sample Angi Lead Email
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAnalyzePayload(false)}
                        disabled={analyzing || !rawInput.trim()}
                        className="px-3.5 h-[34px] bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded-md text-xs font-bold transition-colors duration-120 cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <Activity className={`w-3.5 h-3.5 ${analyzing ? 'animate-spin' : ''}`} />
                        <span>{analyzing ? 'Analyzing...' : 'Dry-Run Parse'}</span>
                      </button>

                      <button
                        onClick={() => handleAnalyzePayload(true)}
                        disabled={analyzing || !rawInput.trim()}
                        className="px-3.5 h-[34px] bg-[#EF7E15] hover:bg-[#D66B0F] text-white rounded-md text-xs font-bold transition-colors duration-120 cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Parse & Create Lead</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Diagnostic Analysis Output */}
                {diagResult && (
                  <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md p-3.5 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/80 pb-2">
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        Parser Diagnostic Results
                      </h4>
                      {diagResult.saved && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          Lead Created in System
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                        <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Client Name</span>
                        <span className="text-zinc-900 dark:text-white font-bold text-xs">{diagResult.extracted?.clientName || '—'}</span>
                      </div>
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                        <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Phone Number</span>
                        <span className="text-zinc-900 dark:text-white font-bold text-xs tabular-nums">{diagResult.extracted?.clientPhone || '—'}</span>
                      </div>
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                        <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Email Address</span>
                        <span className="text-zinc-900 dark:text-white font-bold text-xs">{diagResult.extracted?.clientEmail || '—'}</span>
                      </div>
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                        <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Address</span>
                        <span className="text-zinc-900 dark:text-white font-bold text-xs">{diagResult.extracted?.address || '—'}</span>
                      </div>
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                        <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Service Requested</span>
                        <span className="text-[#EF7E15] font-bold text-xs">{diagResult.extracted?.serviceNeeded || '—'}</span>
                      </div>
                      <div className="bg-white dark:bg-zinc-900/80 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                        <span className="text-zinc-500 dark:text-zinc-400 font-semibold block text-[10px]">Lead Fee</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold text-xs tabular-nums">{diagResult.extracted?.leadFee || '—'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: WEBHOOK LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Live Webhook Activity Logs</h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    History of incoming requests received by your webhook endpoints.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadDiagnostics}
                    disabled={loading}
                    className="px-2.5 h-[32px] bg-transparent border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300 rounded-md text-xs font-bold transition-colors duration-120 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>
                  <button
                    onClick={handleClearLogs}
                    className="px-2.5 h-[32px] bg-rose-100 dark:bg-rose-950/60 hover:bg-rose-200 dark:hover:bg-rose-900/80 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 rounded-md text-xs font-bold transition-colors duration-120 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Logs</span>
                  </button>
                  <button
                    onClick={handleClearWebhookLeads}
                    className="px-2.5 h-[32px] bg-orange-100 dark:bg-orange-950/60 hover:bg-orange-200 dark:hover:bg-orange-900/80 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-800 rounded-md text-xs font-bold transition-colors duration-120 flex items-center gap-1.5 cursor-pointer"
                    title="Remove all webhook leads"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Webhook Leads</span>
                  </button>
                </div>
              </div>

              {!diagData?.recentLogs || diagData.recentLogs.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md p-6 text-center text-zinc-500 text-xs">
                  No webhook requests recorded yet. Use the 1-Click Test tab to generate a test lead.
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                  {diagData.recentLogs.map((log) => (
                    <div key={log.id} className="p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors duration-120 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              log.source === 'Angi'
                                ? 'bg-[#EF7E15]/10 text-[#EF7E15] border border-[#EF7E15]/20'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700'
                            }`}
                          >
                            {log.source || 'Webhook'}
                          </span>
                          <span className="font-bold text-zinc-900 dark:text-white">{log.clientName || 'Incoming Request'}</span>
                          {log.clientPhone && <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px] tabular-nums">{log.clientPhone}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-[11px] tabular-nums">
                          <span>{new Date(log.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md text-[10px] font-bold">200 OK</span>
                        </div>
                      </div>

                      {log.payloadSnippet && (
                        <pre className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-md font-mono text-[11px] text-zinc-700 dark:text-zinc-400 overflow-x-auto max-h-24 border border-zinc-200 dark:border-zinc-800/60">
                          {typeof log.payloadSnippet === 'object'
                            ? JSON.stringify(log.payloadSnippet, null, 2)
                            : String(log.payloadSnippet)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#EF7E15]" />
            <span>All webhook endpoints are server-monitored and SSL secured.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 h-[34px] bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-white rounded-md font-bold transition-colors duration-120 cursor-pointer flex items-center justify-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
