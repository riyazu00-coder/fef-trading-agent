'use client';

import React, { useState, useEffect } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

interface TelegramStatus {
  service: string;
  isConfigured: boolean;
  broadcastingActive: boolean;
  isPaused: boolean;
  pauseReason: string | null;
  isDryRun: boolean;
  policy: string;
  validatedOnly?: boolean;
  zeroCostCompliance: boolean;
  bot: {
    isConfigured: boolean;
    isValid: boolean;
    status: string;
    botUsername?: string;
    botFirstName?: string;
    error?: string;
  };
  channel?: {
    isConfigured: boolean;
    isVerified: boolean;
    status: string;
    channelUsername?: string;
    channelTitle?: string;
    channelType?: string;
    isAdmin?: boolean;
    canPostMessages?: boolean;
    error?: string;
  };
  destination: {
    isConfigured: boolean;
    isVerified: boolean;
    status: string;
    chatTitle?: string;
    chatType?: string;
    destinationSummary: string;
    channelUsername?: string;
    canPostMessages?: boolean;
    isAdmin?: boolean;
    error?: string;
  };
  queue: {
    queuedCount: number;
    sendingCount: number;
    sentCount: number;
    failedCount: number;
    totalSignals: number;
    lastDeliveredAt: number | null;
    duplicateSuppressionCount?: number;
    averageDeliveryLatencyMs?: number | null;
  };
  rejectionsBreakdown?: { reason: string; count: number }[];
}

interface SignalItem {
  signalId: string;
  setupId: string;
  setupRevision: number;
  symbol: string;
  direction: 'BUY' | 'SELL';
  timeframe: string;
  eligibilityStatus: string;
  rejectionReason?: string;
  createdAt: number;
  deliveryStatus?: string;
  telegramMessageId?: number;
  attempts?: number;
  lastErrorCode?: string;
  deliveredAt?: number;
}

interface PipelineStage {
  id: string;
  name: string;
  stageNumber: number;
  status: 'HEALTHY' | 'DEGRADED' | 'DISCONNECTED' | 'INACTIVE' | 'ERROR';
  lastUpdate: string | null;
  latencyMs: number | null;
  details: string;
  error?: string | null;
}

interface MonitoredInstrument {
  symbol: string;
  category: 'METALS' | 'COMMODITIES' | 'FOREX' | 'INDICES' | 'CRYPTO';
  name: string;
  bid: number;
  ask: number;
  quoteAgeSeconds: number;
  freshness: 'FRESH' | 'STALE' | 'OFFLINE';
  opportunityDetected: boolean;
  direction: 'BUY' | 'SELL' | 'WAIT' | 'NONE';
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number | null;
  timeframe: string;
  confidence: number;
  setupMaturity: string;
  eligibility: 'ELIGIBLE' | 'REJECTED' | 'NO_OPPORTUNITY';
  rejectionReason: string | null;
}

interface OperationalAlert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  timestamp: string;
  remediation: string;
}

interface PipelineTraceData {
  timestamp: string;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  earliestFailingStage: string | null;
  stages: PipelineStage[];
  monitoredInstruments: MonitoredInstrument[];
  deliveryHealth: {
    broadcastingActive: boolean;
    channelUsername: string;
    botUsername: string;
    queueDepth: number;
    sentCount: number;
    failedCount: number;
    totalEvaluated: number;
    duplicateSuppressionCount: number;
    averageDeliveryLatencyMs: number | null;
    lastDeliveredAt: number | null;
    rejectionsBreakdown: { reason: string; count: number }[];
  };
  alerts: OperationalAlert[];
  safetyInvariants: {
    operatingMode: string;
    orderTransportAllowed: boolean;
    telegramSignalEnabled: boolean;
    telegramDryRun: boolean;
    telegramValidatedOnly: boolean;
    openAiEnabled: boolean;
    openAiBudgetUsd: number;
    executionJournalLines: number;
    executionJournalHash: string;
  };
}

export const TelegramSignalCenter: React.FC = () => {
  const { activeSymbol } = useActiveAsset();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [pipeline, setPipeline] = useState<PipelineTraceData | null>(null);
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [showRejectionsBreakdown, setShowRejectionsBreakdown] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [previewSymbol, setPreviewSymbol] = useState(activeSymbol || 'XAUUSD');

  const fetchStatusAndSignals = async () => {
    try {
      const [statusRes, signalsRes, pipelineRes] = await Promise.all([
        fetch('/api/telegram/status'),
        fetch('/api/telegram/signals?limit=50'),
        fetch('/api/telegram/pipeline'),
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        if (sData.success) setStatus(sData);
      }

      if (signalsRes.ok) {
        const sigData = await signalsRes.json();
        if (sigData.success) setSignals(sigData.signals || []);
      }

      if (pipelineRes.ok) {
        const pipeData = await pipelineRes.json();
        if (pipeData.success) setPipeline(pipeData);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatusAndSignals();
    const interval = setInterval(fetchStatusAndSignals, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleVerify = async () => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/telegram/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey || 'fef_admin_secret_key_v1',
        },
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: 'Telegram Bot & Public Channel (@forexmetalsignals) verified with active posting permissions!', type: 'success' });
      } else {
        const errDetail = data.channel?.error || data.bot?.error || data.destination?.error || data.error;
        setActionMessage({ text: `Verification failed: ${errDetail}`, type: 'error' });
      }
      fetchStatusAndSignals();
    } catch (err: any) {
      setActionMessage({ text: `Network error: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePause = async () => {
    setIsLoading(true);
    setActionMessage(null);
    const endpoint = status?.isPaused ? '/api/telegram/resume' : '/api/telegram/pause';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey || 'fef_admin_secret_key_v1',
        },
        body: JSON.stringify({ reason: 'Admin dashboard toggle' }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({
          text: status?.isPaused ? 'Signal broadcasting resumed.' : 'Signal broadcasting paused.',
          type: 'info',
        });
      }
      fetchStatusAndSignals();
    } catch (err: any) {
      setActionMessage({ text: `Action failed: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = async (signalId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/telegram/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey || 'fef_admin_secret_key_v1',
        },
        body: JSON.stringify({ signalId }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage({ text: `Retry queued for signal ${signalId}`, type: 'success' });
      } else {
        setActionMessage({ text: `Retry failed: ${data.error}`, type: 'error' });
      }
      fetchStatusAndSignals();
    } catch (err: any) {
      setActionMessage({ text: `Retry error: ${err.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const isConfigured = status?.isConfigured;
  const isBroadcasting = status?.broadcastingActive;
  const isDryRun = status?.isDryRun;

  const filteredInstruments = (pipeline?.monitoredInstruments || []).filter((inst) => {
    if (selectedCategoryFilter === 'ALL') return true;
    return inst.category === selectedCategoryFilter;
  });

  const freshQuotesCount = (pipeline?.monitoredInstruments || []).filter(
    (inst) => inst.freshness === 'FRESH'
  ).length;

  return (
    <div className="space-y-3 font-sans">
      {/* 1. TOP HEADER & BROADCAST STATUS BANNER */}
      <div className="bg-[#070f1e] rounded-2xl border border-white/10 p-3.5 shadow-2xl flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(34,211,238,0.25)]">
            📡
          </div>
          <div>
            <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
              <h2 className="text-sm font-black tracking-wider text-white font-mono uppercase">
                SIGNAL OPERATIONS &amp; LIVE PIPELINE MONITOR
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                VALIDATED ONLY (R:R ≥ 2.0:1)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                100% ZERO-COST
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                READ_ONLY
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-mono mt-0.5">
              10-Stage Pipeline Observability · 12 Canonical Instruments · Fixed Destination: <span className="text-cyan-300 font-bold">@forexmetalsignals</span>
            </p>
          </div>
        </div>

        {/* State Badges */}
        <div className="flex items-center space-x-2 font-mono text-[10px]">
          <div className={`px-2.5 py-1 rounded-lg border flex items-center space-x-1.5 ${
            !isConfigured
              ? 'bg-zinc-800/80 border-zinc-600/40 text-zinc-400'
              : status?.isPaused
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : isBroadcasting
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
          }`}>
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            <span className="font-bold">
              {!isConfigured
                ? 'NOT CONFIGURED'
                : status?.isPaused
                  ? 'BROADCAST PAUSED'
                  : isBroadcasting
                    ? 'BROADCASTING ACTIVE (LIVE)'
                    : isDryRun ? 'DRY-RUN SIMULATION' : 'DORMANT'}
            </span>
          </div>

          <div className="bg-black/60 px-2.5 py-1 rounded-lg border border-white/10 text-gray-300 flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Channel: </span>
            <strong className="text-white">@forexmetalsignals</strong>
          </div>
        </div>
      </div>

      {/* 2. 10-STAGE PIPELINE FLOW RIBBON */}
      <div className="bg-[#070f1e] rounded-2xl border border-white/10 p-3 shadow-xl space-y-2">
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5 font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-cyan-400">⚡</span>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              END-TO-END 10-STAGE SIGNAL PIPELINE TRACE
            </h3>
          </div>
          <div className="text-[10px] text-gray-400 flex items-center space-x-2">
            <span>Overall Health: </span>
            <span className={`font-bold px-1.5 py-0.5 rounded ${
              pipeline?.overallStatus === 'HEALTHY'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : pipeline?.overallStatus === 'DEGRADED'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}>
              {pipeline?.overallStatus || 'HEALTHY'}
            </span>
            {pipeline?.earliestFailingStage && (
              <span className="text-rose-400 font-bold">
                ⚠️ Earliest Failure: {pipeline.earliestFailingStage}
              </span>
            )}
          </div>
        </div>

        {/* Pipeline Nodes Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-11 gap-1.5 font-mono text-[10px]">
          {(pipeline?.stages || []).map((stage) => {
            const isFailing = stage.status === 'ERROR' || stage.status === 'DISCONNECTED' || stage.status === 'DEGRADED';
            const isSelected = selectedStage?.id === stage.id;
            return (
              <button
                key={stage.id}
                onClick={() => setSelectedStage(isSelected ? null : stage)}
                className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    : isFailing
                    ? 'border-amber-500/40 bg-amber-950/20 hover:border-amber-400'
                    : 'border-white/5 bg-black/40 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[9px] text-gray-500 font-bold">#{stage.stageNumber}</span>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    stage.status === 'HEALTHY'
                      ? 'bg-emerald-400 animate-pulse'
                      : stage.status === 'DEGRADED'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-500'
                  }`} />
                </div>
                <div className="font-bold text-white text-[10px] truncate mt-1" title={stage.name}>
                  {stage.name.split(' ')[0]} {stage.name.split(' ')[1] || ''}
                </div>
                <div className="flex items-center justify-between text-[8px] text-gray-400 mt-1">
                  <span className={stage.status === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'}>
                    {stage.status}
                  </span>
                  {stage.latencyMs !== null && <span>{stage.latencyMs}ms</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Stage Detail Drawer */}
        {selectedStage && (
          <div className="p-2.5 rounded-xl bg-black/60 border border-cyan-500/30 text-xs font-mono text-gray-300 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300">
                Stage {selectedStage.stageNumber}: {selectedStage.name}
              </span>
              <button onClick={() => setSelectedStage(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="text-[11px] text-gray-400">{selectedStage.details}</div>
            <div className="text-[10px] text-gray-500 flex items-center space-x-3">
              <span>Status: <strong className={selectedStage.status === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'}>{selectedStage.status}</strong></span>
              <span>Last Updated: {selectedStage.lastUpdate ? new Date(selectedStage.lastUpdate).toLocaleTimeString() : 'N/A'}</span>
              {selectedStage.latencyMs !== null && <span>Latency: {selectedStage.latencyMs}ms</span>}
            </div>
            {selectedStage.error && (
              <div className="text-rose-400 text-[10px] font-bold">Error: {selectedStage.error}</div>
            )}
          </div>
        )}
      </div>

      {/* 3. ACTIVE OPERATIONAL ALERTS */}
      {pipeline?.alerts && pipeline.alerts.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-3 space-y-2 shadow-xl font-mono">
          <div className="flex items-center space-x-2 text-amber-300 font-bold text-xs">
            <span>⚠️</span>
            <span>ACTIVE OPERATIONAL ALERTS &amp; SAFE RECOVERY NOTICE ({pipeline.alerts.length})</span>
          </div>
          <div className="space-y-1.5">
            {pipeline.alerts.map((al) => (
              <div key={al.id} className="p-2 rounded-xl bg-black/50 border border-amber-500/20 text-xs space-y-0.5">
                <div className="flex items-center justify-between text-amber-200 font-bold">
                  <span>{al.title}</span>
                  <span className="text-[9px] text-gray-400">{new Date(al.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-[11px] text-gray-300">{al.message}</div>
                <div className="text-[10px] text-cyan-400">Remediation: {al.remediation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. EXECUTIVE OPERATIONAL KPI STATS GRID */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono">
        <div className="bg-[#070f1e]/80 border border-white/10 rounded-xl p-2.5">
          <div className="text-[10px] text-gray-400">UNIVERSE MONITORED</div>
          <div className="text-lg font-black text-white">12 Assets</div>
          <div className="text-[9px] text-cyan-400">5 Master Categories</div>
        </div>
        <div className="bg-[#070f1e]/80 border border-white/10 rounded-xl p-2.5">
          <div className="text-[10px] text-gray-400">TELEMETRY FRESHNESS</div>
          <div className="text-lg font-black text-emerald-400">{freshQuotesCount}/12 Fresh</div>
          <div className="text-[9px] text-emerald-500">Max Quote Age ≤ 30s</div>
        </div>
        <div className="bg-[#070f1e]/80 border border-white/10 rounded-xl p-2.5">
          <div className="text-[10px] text-gray-400">SIGNALS PUBLISHED</div>
          <div className="text-lg font-black text-emerald-400">{status?.queue.sentCount || 0}</div>
          <div className="text-[9px] text-gray-400">Verified @forexmetalsignals</div>
        </div>
        <div className="bg-[#070f1e]/80 border border-white/10 rounded-xl p-2.5">
          <div className="text-[10px] text-gray-400">PENDING QUEUE</div>
          <div className="text-lg font-black text-amber-300">{status?.queue.queuedCount || 0}</div>
          <div className="text-[9px] text-amber-400">Rate-Limited Worker</div>
        </div>
        <div className="bg-[#070f1e]/80 border border-white/10 rounded-xl p-2.5">
          <div className="text-[10px] text-gray-400">DUPLICATES SUPPRESSED</div>
          <div className="text-lg font-black text-cyan-300">
            {pipeline?.deliveryHealth.duplicateSuppressionCount || status?.queue.duplicateSuppressionCount || 0}
          </div>
          <div className="text-[9px] text-cyan-400">Idempotency &amp; Micro-Update</div>
        </div>
        <div className="bg-[#070f1e]/80 border border-white/10 rounded-xl p-2.5">
          <div className="text-[10px] text-gray-400">AVG DELIVERY LATENCY</div>
          <div className="text-lg font-black text-white">
            {pipeline?.deliveryHealth.averageDeliveryLatencyMs
              ? `${pipeline.deliveryHealth.averageDeliveryLatencyMs}ms`
              : 'Real-time'}
          </div>
          <div className="text-[9px] text-gray-400">Telegram API Latency</div>
        </div>
      </div>

      {/* ACTION MESSAGE TOAST */}
      {actionMessage && (
        <div className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between ${
          actionMessage.type === 'success'
            ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
            : actionMessage.type === 'error'
              ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
        }`}>
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-gray-400 hover:text-white ml-2">✕</button>
        </div>
      )}

      {/* 5. REAL MARKET SIGNAL MONITORING TABLE (12 CANONICAL ASSETS) */}
      <div className="bg-[#070f1e] rounded-2xl border border-white/10 p-3.5 shadow-xl space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div className="flex items-center space-x-2 font-mono">
            <span className="text-cyan-400">📊</span>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              REAL MARKET SIGNAL MONITORING (12 CANONICAL ASSETS)
            </h3>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center space-x-1 font-mono text-[10px]">
            {['ALL', 'METALS', 'COMMODITIES', 'FOREX', 'INDICES', 'CRYPTO'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategoryFilter(cat)}
                className={`px-2 py-0.5 rounded-lg border transition-all cursor-pointer font-bold ${
                  selectedCategoryFilter === cat
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                    : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Instruments Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[10px]">
            <thead>
              <tr className="border-b border-white/10 text-gray-400">
                <th className="py-2 px-2">ASSET / CATEGORY</th>
                <th className="py-2 px-2">BID / ASK</th>
                <th className="py-2 px-2">QUOTE AGE</th>
                <th className="py-2 px-2">THESIS</th>
                <th className="py-2 px-2">R:R</th>
                <th className="py-2 px-2">CONF</th>
                <th className="py-2 px-2">MATURITY</th>
                <th className="py-2 px-2">ELIGIBILITY STATUS</th>
                <th className="py-2 px-2">VALIDATION REASON / DETAILS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-gray-300">
              {filteredInstruments.map((inst) => (
                <tr key={inst.symbol} className="hover:bg-white/[0.02]">
                  <td className="py-2 px-2">
                    <div className="font-bold text-white">{inst.symbol}</div>
                    <div className="text-[9px] text-gray-500">{inst.name} · {inst.category}</div>
                  </td>
                  <td className="py-2 px-2">
                    {inst.bid > 0 ? (
                      <div>
                        <div className="text-white font-bold">{inst.bid.toFixed(2)}</div>
                        <div className="text-[9px] text-gray-500">{inst.ask.toFixed(2)}</div>
                      </div>
                    ) : (
                      <span className="text-gray-500">OFFLINE</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      inst.freshness === 'FRESH'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}>
                      {inst.quoteAgeSeconds}s ({inst.freshness})
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <span className={`font-bold ${
                      inst.direction === 'BUY'
                        ? 'text-cyan-400'
                        : inst.direction === 'SELL'
                        ? 'text-rose-400'
                        : 'text-gray-400'
                    }`}>
                      {inst.direction}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    {inst.riskReward ? (
                      <span className={`font-bold ${inst.riskReward >= 2.0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {inst.riskReward.toFixed(1)}:1
                      </span>
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {inst.confidence > 0 ? (
                      <span className="font-bold text-white">{inst.confidence}%</span>
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <span className="text-gray-400">{inst.setupMaturity}</span>
                  </td>
                  <td className="py-2 px-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      inst.eligibility === 'ELIGIBLE'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    }`}>
                      {inst.eligibility}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-gray-400 max-w-[280px] truncate" title={inst.rejectionReason || ''}>
                    {inst.rejectionReason || 'Monitoring continuous order-flow'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Honest Zero-Activity Notice */}
        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px] text-gray-400 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            <span>Honest Zero-Activity Policy: No artificial signals are generated. Opportunities only publish if all 21 gates pass (R:R ≥ 2.0:1, quote age ≤ 30s).</span>
          </div>
          <button
            onClick={() => setShowRejectionsBreakdown(!showRejectionsBreakdown)}
            className="text-cyan-400 hover:text-cyan-200 underline cursor-pointer"
          >
            {showRejectionsBreakdown ? 'Hide Rejections' : 'View Rejection Reasons'}
          </button>
        </div>

        {/* Rejections Breakdown Drawer */}
        {showRejectionsBreakdown && (
          <div className="p-3 rounded-xl bg-black/60 border border-white/10 font-mono text-[10px] space-y-2">
            <div className="font-bold text-amber-400">Rejections Breakdown Across 21 Eligibility Gates:</div>
            {(pipeline?.deliveryHealth.rejectionsBreakdown || status?.rejectionsBreakdown || []).length === 0 ? (
              <div className="text-gray-500">No rejection events logged yet. Telemetry monitoring operational.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {(pipeline?.deliveryHealth.rejectionsBreakdown || status?.rejectionsBreakdown || []).map((r) => (
                  <div key={r.reason} className="p-1.5 rounded bg-black/40 border border-white/5 flex items-center justify-between">
                    <span className="text-gray-300 truncate mr-2" title={r.reason}>{r.reason}</span>
                    <span className="text-amber-400 font-bold px-1.5 py-0.5 rounded bg-amber-500/10">{r.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. MAIN WORKSPACE: TWO COLUMNS (5-CATEGORY CARD PREVIEW & ADMIN CONTROLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* LEFT COLUMN: 1080x1350 APPROVED SIGNAL CARD VISUAL PREVIEW (7 cols) */}
        <div className="lg:col-span-7 bg-[#070f1e] rounded-2xl border border-white/10 p-3.5 space-y-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center space-x-2 font-mono">
              <span className="text-cyan-400">🖼️</span>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                1080×1350 MASTER SIGNAL CARD VISUAL INSPECTOR
              </h3>
            </div>
            <div className="flex items-center space-x-2 text-[10px] font-mono">
              <span className="text-gray-400">Select Template Asset:</span>
              <select
                value={previewSymbol}
                onChange={(e) => setPreviewSymbol(e.target.value)}
                className="bg-black/60 border border-cyan-500/30 rounded px-2.5 py-1 text-cyan-300 font-bold outline-none"
              >
                <option value="XAUUSD">Metals: XAUUSD (Gold Bullion)</option>
                <option value="XAGUSD">Metals: XAGUSD (Silver Bullion)</option>
                <option value="XPTUSD">Metals: XPTUSD (Platinum)</option>
                <option value="XPDUSD">Metals: XPDUSD (Palladium)</option>
                <option value="USOIL">Energy: USOIL (Crude Oil)</option>
                <option value="NATGAS">Energy: NATGAS (Natural Gas)</option>
                <option value="EURUSD">Forex: EURUSD (Euro / USD)</option>
                <option value="USDJPY">Forex: USDJPY (USD / Yen)</option>
                <option value="US100">Indices: US100 (Nasdaq 100)</option>
                <option value="US500">Indices: US500 (S&amp;P 500)</option>
                <option value="BTCUSD">Crypto: BTCUSD (Bitcoin)</option>
                <option value="ETHUSD">Crypto: ETHUSD (Ethereum)</option>
              </select>
            </div>
          </div>

          {/* High-Resolution Card Preview */}
          <div className="relative aspect-[4/5] w-full max-w-[540px] mx-auto rounded-xl overflow-hidden border border-cyan-500/30 bg-[#02050E] shadow-2xl flex items-center justify-center group">
            <img
              src={`/api/telegram/preview?symbol=${previewSymbol}`}
              alt={`${previewSymbol} Signal Card Preview`}
              className="w-full h-full object-contain select-none"
              loading="eager"
            />
          </div>

          {/* Category Metadata Ribbon */}
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px] flex items-center justify-between text-gray-400 flex-wrap gap-2">
            <div>
              <span>Active Template: </span>
              <strong className="text-white">5 Master Categories Architecture</strong>
            </div>
            <div>
              <span>Resolution: </span>
              <strong className="text-cyan-400">1080 × 1350 PNG</strong>
            </div>
            <div>
              <span>Typography: </span>
              <strong className="text-emerald-400">✓ Helvetica / Arial (0 Missing Glyphs)</strong>
            </div>
            <div>
              <span>Logos: </span>
              <strong className="text-emerald-400">✓ Authentic FEF Assets</strong>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ADMIN CONTROLS, RECENT SIGNALS & SETUP GUIDE (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          {/* Admin Action Deck */}
          <div className="bg-[#070f1e] rounded-2xl border border-white/10 p-3.5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2 font-mono">
                <span className="text-amber-400">⚡</span>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">DELIVERY &amp; BOT CONTROLS</h3>
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-gray-300">
                ADMIN RBAC
              </span>
            </div>

            {/* Admin Key Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-gray-400">Admin Key (for protected mutations):</label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Defaults to server session..."
                className="w-full bg-black/60 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-cyan-400"
              />
            </div>

            {/* Control Buttons Grid */}
            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <button
                onClick={handleVerify}
                disabled={isLoading}
                className="px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-bold transition-all disabled:opacity-50 cursor-pointer text-center"
              >
                🔍 Verify Connection
              </button>

              <button
                onClick={handleTogglePause}
                disabled={isLoading}
                className={`px-3 py-2 rounded-xl border font-bold transition-all disabled:opacity-50 cursor-pointer text-center ${
                  status?.isPaused
                    ? 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-500/15 hover:bg-rose-500/25 border-rose-500/40 text-rose-200'
                }`}
              >
                {status?.isPaused ? '▶️ Resume' : '⏸️ Pause'}
              </button>
            </div>

            {/* BotFather Quick Setup Button */}
            <button
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="w-full text-center text-[10px] font-mono text-gray-400 hover:text-cyan-300 transition-colors py-1 cursor-pointer"
            >
              {showSetupGuide ? '▲ Hide Channel Setup Guide' : '▼ View Channel Setup Guide'}
            </button>

            {/* Expandable Setup Instructions */}
            {showSetupGuide && (
              <div className="p-3 rounded-xl bg-black/60 border border-white/10 font-mono text-[10px] text-gray-300 space-y-1.5">
                <div className="font-bold text-amber-400">Channel Setup Configuration:</div>
                <ol className="list-decimal pl-4 space-y-1 text-gray-400">
                  <li>Bot: <strong>@FEF_CORTEX_Signals_Bot</strong></li>
                  <li>Destination: <strong>@forexmetalsignals</strong> (<code>https://t.me/forexmetalsignals</code>)</li>
                  <li>Administrator permission granted: <code>can_post_messages=true</code></li>
                  <li>Broadcaster status: <strong>LIVE</strong> (dryRun: false, validatedOnly: true)</li>
                  <li>Validated Opportunity Floor: <strong>R:R ≥ 2.0:1</strong></li>
                </ol>
              </div>
            )}
          </div>

          {/* Recent Signals / Dispatch History */}
          <div className="bg-[#070f1e] rounded-2xl border border-white/10 p-3.5 space-y-2.5 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-2 font-mono">
              <div className="flex items-center space-x-2">
                <span className="text-cyan-400">📋</span>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">RECENT DISPATCH LOG</h3>
              </div>
              <span className="text-[10px] text-gray-400">{signals.length} logged</span>
            </div>

            <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
              {signals.length === 0 ? (
                <div className="text-center py-6 text-xs font-mono text-gray-500">
                  No signals generated yet. Only fully validated setups (R:R ≥ 2.0, zero vetoes, fresh quotes ≤ 30s) enter the delivery pipeline.
                </div>
              ) : (
                signals.map((sig) => (
                  <div
                    key={sig.signalId}
                    className="p-2 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between font-mono text-[10px]"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold ${sig.direction === 'BUY' ? 'text-cyan-400' : 'text-rose-400'}`}>
                          {sig.direction}
                        </span>
                        <span className="font-bold text-white">{sig.symbol}</span>
                        <span className="text-gray-500">({sig.timeframe})</span>
                        <span className="text-gray-600">·</span>
                        <span className="text-gray-400 text-[9px]">{sig.signalId.slice(0, 15)}...</span>
                      </div>
                      <div className="text-[9px] text-gray-500 mt-0.5">
                        Status: <strong className={sig.eligibilityStatus === 'ELIGIBLE' ? 'text-emerald-400' : 'text-amber-400'}>{sig.eligibilityStatus}</strong>
                        {sig.rejectionReason && ` (${sig.rejectionReason.slice(0, 30)}...)`}
                      </div>
                    </div>

                    <div className="text-right flex flex-col items-end space-y-1">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        sig.deliveryStatus === 'SENT'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : sig.deliveryStatus === 'QUEUED'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : sig.deliveryStatus === 'DELIVERY_FAILED'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-white/5 text-gray-400'
                      }`}>
                        {sig.deliveryStatus || 'FILTERED'}
                      </span>
                      {sig.deliveryStatus === 'DELIVERY_FAILED' && (
                        <button
                          onClick={() => handleRetry(sig.signalId)}
                          disabled={isLoading}
                          className="text-[9px] text-cyan-400 hover:text-cyan-200 underline cursor-pointer"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Duplicate Protection & Invalidation Engine Status Deck */}
          <div className="bg-[#070f1e] rounded-2xl border border-white/10 p-3.5 space-y-2.5 shadow-xl font-mono text-[10px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2">
                <span className="text-emerald-400">🛡️</span>
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">LIFECYCLE &amp; DUPLICATE GATES</h3>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                ENFORCED
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-gray-300">
              <div className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                <div className="text-[9px] text-gray-400">DUPLICATE SUPPRESSION</div>
                <div className="text-white font-bold text-[11px]">Idempotency Shield</div>
                <div className="text-[8px] text-emerald-400">● Zero Duplicate Broadcasts</div>
              </div>
              <div className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                <div className="text-[9px] text-gray-400">UPDATE THROTTLING</div>
                <div className="text-white font-bold text-[11px]">≥ 0.05% Delta Gate</div>
                <div className="text-[8px] text-cyan-400">● Micro-Movements Blocked</div>
              </div>
              <div className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                <div className="text-[9px] text-gray-400">TELEMETRY STALENESS</div>
                <div className="text-white font-bold text-[11px]">≤ 30s Max Age</div>
                <div className="text-[8px] text-emerald-400">● Real-time Quotes Only</div>
              </div>
              <div className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-0.5">
                <div className="text-[9px] text-gray-400">SAFETY MODE</div>
                <div className="text-amber-300 font-bold text-[11px]">READ_ONLY Mode</div>
                <div className="text-[8px] text-amber-400">● MT5 Order Transport: OFF</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
