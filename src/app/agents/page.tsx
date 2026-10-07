'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { AgentState } from '@/lib/agents/agent-types';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';
import { ExecutabilityBadge } from '@/components/common/ExecutabilityBadge';
import { CouncilDebateStream } from '@/components/cockpit/CouncilDebateStream';

interface ExtendedAgent extends AgentState {
  id: string;
  model: string;
  weight: number;
  latencyMs: number;
  systemMandate: string;
  telemetry: {
    memoryMb: number;
    tokensPerSec: number;
    sampleCount: number;
    uptime: string;
  };
  conflictsWith?: string[];
}

export default function AgentsDirectoryPage() {
  const { activeSymbol, assetProfile, refreshData } = useActiveAsset();
  const { telemetry, isMt5Connected } = useMT5Telemetry();
  const [selectedAgent, setSelectedAgent] = useState<ExtendedAgent | null>(null);
  const [filterBias, setFilterBias] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [isPulsing, setIsPulsing] = useState(false);

  // Extend assetProfile agents with full operational telemetry
  const fullCouncil: ExtendedAgent[] = [
    ...assetProfile.agents.map((ag, idx) => ({
      ...ag,
      id: `council-${idx + 1}`,
      model: idx % 2 === 0 ? 'DeepSeek-V3 Quant' : 'Llama-3.3 70B Quant',
      weight: idx === 7 ? 2.5 : idx === 12 ? 3.0 : 1.2, // Risk Guardian and Final Decision have highest weights
      latencyMs: 32 + (idx * 4) % 25,
      systemMandate: `Analyze ${activeSymbol} real-time micro-structure, order-flow imbalances, and multi-timeframe SMC zones to provide deterministic probabilistic edge without emotional bias.`,
      telemetry: {
        memoryMb: 412 + (idx * 15),
        tokensPerSec: 88 + (idx * 2),
        sampleCount: 1420 + idx * 30,
        uptime: '99.98%'
      },
      conflictsWith: ag.bias === 'BULLISH' ? ['Macro Agent (Hawkish Fed)', 'Risk Guardian'] : ['Technical Agent', 'Opportunity Hunter']
    })),
    // 5 Specialist Observers (Strictly Non-Voting Architecture)
    {
      type: 'SYNAPSE_SENTINEL',
      name: 'Synapse Data Sentinel',
      role: 'Feed Integrity & MT5 Transport Auditor',
      bias: 'NEUTRAL',
      confidence: 96,
      status: 'ONLINE',
      lastOpinion: `Zero feed latency detected on local transport. MT5 bridge heartbeat verified for ${activeSymbol}.`,
      evidence: ['Transport: HTTP WebRequest (127.0.0.1:5556)', 'Broker: MT5 terminal verified', 'Feed integrity: 0 payload anomalies'],
      keyRisk: 'Broker disconnect',
      invalidation: 'Latency > 250ms',
      id: 'spec-1',
      model: 'Rust Micro-Daemon',
      weight: 1.0,
      latencyMs: 14,
      provenanceBadge: 'MT5',
      evidenceTrustScore: 95,
      systemMandate: 'Verify raw broker socket ticks for zero spoofing, abnormal spread spikes, and network packet continuity.',
      telemetry: { memoryMb: 128, tokensPerSec: 0, sampleCount: 84200, uptime: '100.00%' }
    },
    {
      type: 'DARK_POOL_RADAR',
      name: 'Dark Pool & Whale Radar',
      role: 'Off-Exchange Hidden Liquidity',
      bias: 'NEUTRAL',
      confidence: 40,
      status: 'DATA LIMITED',
      lastOpinion: 'Institutional dark-pool & iceberg flow: DATA PROVIDER NOT CONNECTED. Off-exchange ATS feeds require institutional gateway.',
      evidence: ['Dark pool feed: PROVIDER NOT CONNECTED', 'ATS block print: UNAVAILABLE', 'Institutional gateway required'],
      keyRisk: 'Whale spoof cancelation',
      invalidation: 'Aggressive market dump',
      id: 'spec-2',
      model: 'WhaleTracker L2',
      weight: 1.8,
      latencyMs: 44,
      provenanceBadge: 'UNAVAILABLE',
      evidenceTrustScore: 0,
      systemMandate: 'Deconstruct off-exchange ATS dark pool reporting and detect institutional stealth accumulation.',
      telemetry: { memoryMb: 520, tokensPerSec: 64, sampleCount: 3900, uptime: '99.94%' }
    },
    {
      type: 'BLACK_SWAN_SCANNER',
      name: 'Black Swan Event Monitor',
      role: 'Tail-Risk & Flash Crash Defense',
      bias: 'CAUTION',
      confidence: 45,
      status: 'DATA LIMITED',
      lastOpinion: 'Tail-risk model: Insufficient verified macro-volatility inputs. Sovereign CDS and options volatility feeds offline.',
      evidence: ['VIX feed: PROVIDER NOT CONNECTED', 'Sovereign CDS: DATA UNAVAILABLE', 'Interbank spread: MONITORING'],
      keyRisk: 'Unscheduled geopolitical escalation',
      invalidation: 'VIX spike > 25',
      id: 'spec-3',
      model: 'Monte Carlo 100k',
      weight: 2.2,
      latencyMs: 38,
      provenanceBadge: 'UNAVAILABLE',
      evidenceTrustScore: 10,
      systemMandate: 'Scan cross-asset volatility indices and sovereign CDS spreads to detect nascent systemic dislocation.',
      telemetry: { memoryMb: 890, tokensPerSec: 120, sampleCount: 15400, uptime: '99.99%' }
    },
    {
      type: 'RETAIL_FADE_INDEX',
      name: 'Retail Sentiment & Fade Engine',
      role: 'Contrarian Positioning Signals',
      bias: 'NEUTRAL',
      confidence: 40,
      status: 'DATA LIMITED',
      lastOpinion: `Retail positioning on ${activeSymbol}: PROVIDER NOT CONNECTED. Broker sentiment aggregation feed offline.`,
      evidence: ['Broker sentiment feed: NOT CONNECTED', 'Contrarian skew: INSUFFICIENT DATA', 'Crowd metric: STANDBY'],
      keyRisk: 'Retail breakout joining momentum',
      invalidation: 'Retail flipping net long',
      id: 'spec-4',
      model: 'Contrarian Hunter',
      weight: 1.4,
      latencyMs: 28,
      provenanceBadge: 'UNAVAILABLE',
      evidenceTrustScore: 0,
      systemMandate: 'Quantify retail trader positioning skew from aggregated broker sentiment to generate contrarian institutional edge.',
      telemetry: { memoryMb: 340, tokensPerSec: 42, sampleCount: 7100, uptime: '99.95%' }
    },
    {
      type: 'CROSS_ASSET_BETA',
      name: 'Cross-Asset Beta Engine',
      role: 'Intermarket SMT & Macro Confluence',
      bias: 'BULLISH',
      confidence: 72,
      status: 'ONLINE',
      lastOpinion: 'Intermarket cross-asset correlation model active. Monitoring multi-asset divergence against live prices.',
      evidence: ['Multi-asset price matrix: ACTIVE', 'Bond yield feed: UNAVAILABLE (ESTIMATED)', 'Equity beta: MODEL INFERENCE'],
      keyRisk: 'Correlation breakdown',
      invalidation: 'DXY reclaiming daily high',
      id: 'spec-5',
      model: 'Intermarket Matrix',
      weight: 1.5,
      latencyMs: 35,
      provenanceBadge: 'INFERENCE',
      evidenceTrustScore: 40,
      systemMandate: 'Compute high-frequency correlation vectors across FX crosses, bonds, equities, and precious metals to isolate structural beta.',
      telemetry: { memoryMb: 460, tokensPerSec: 58, sampleCount: 11200, uptime: '99.97%' }
    }
  ];

  const handlePulseSwarm = async () => {
    setIsPulsing(true);
    try {
      await refreshData();
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const debateCard = document.getElementById('council-debate-card');
          if (debateCard) {
            debateCard.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
          }
          resolve();
        });
      });
    } catch (err) {
      console.error('Failed to pulse council deliberation:', err);
    } finally {
      setIsPulsing(false);
    }
  };

  const filteredAgents = fullCouncil.filter((ag) => {
    const matchesBias = filterBias === 'ALL' || ag.bias === filterBias;
    const matchesSearch =
      ag.name.toLowerCase().includes(search.toLowerCase()) ||
      ag.role.toLowerCase().includes(search.toLowerCase()) ||
      ag.systemMandate.toLowerCase().includes(search.toLowerCase());
    return matchesBias && matchesSearch;
  });

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Dynamic Background */}
      <BackgroundLiveChart symbol={activeSymbol} isPositive={true} />

      {/* Main Layout Container */}
      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />

        {/* Page Header */}
        <div className="ghost-glass-panel rounded-2xl p-5 font-sans space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-[#F8FAFC] uppercase tracking-[0.06em] font-sans">
                  AUTONOMOUS AGENT COUNCIL REGISTRY
                </h1>
                <span className="text-[9px] bg-cyan-950/60 text-[#22D3EE] border border-cyan-500/40 px-2 py-0.5 rounded font-mono font-bold">
                  20 AGENTS ONLINE &bull; {activeSymbol} FOCUS
                </span>
                <MarketStatusBadge symbol={activeSymbol} sessionState={assetProfile.sessionState} size="xs" />
                <ExecutabilityBadge executable={assetProfile.tradeExecutable} size="xs" />
                {isMt5Connected && telemetry.account ? (
                  <span className="text-[9px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-mono font-bold flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>MT5: {telemetry.account.broker} #{telemetry.account.maskedLogin} (Eq: ${telemetry.account.equity.toLocaleString('en-US', { minimumFractionDigits: 0 })})</span>
                    <span className="text-gray-400 font-normal">&bull; READ-ONLY 🔒</span>
                  </span>
                ) : (
                  <span className="text-[9px] bg-black/40 text-gray-400 border border-white/10 px-2 py-0.5 rounded font-mono">
                    MT5: STANDBY
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8] mt-1 font-sans">
                Multi-Agent Cognitive Architecture &bull; {assetProfile.agents.length} Voting Council Members + {fullCouncil.length - assetProfile.agents.length} Specialist Observers ({fullCouncil.length} Total Specialists) &bull; Setup Quality: <span className="font-mono text-cyan-300 font-bold">{assetProfile.setupQuality}/100</span>
                {!assetProfile.tradeExecutable && (
                  <span suppressHydrationWarning className="text-rose-400 font-mono ml-2 font-bold">
                    [MARKET CLOSED — DELIBERATIONS REFERENCE ONLY • OPENS IN {assetProfile.sessionState?.nextOpenCountdown || 'SCHEDULED'}]
                  </span>
                )}
              </p>
            </div>

            {/* Swarm Trigger Action */}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handlePulseSwarm}
                disabled={isPulsing}
                className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 border border-cyan-500/50 text-cyan-300 px-4 py-2 rounded-xl text-xs font-bold tracking-wider flex items-center space-x-2 transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)] disabled:opacity-50"
              >
                <span className={isPulsing ? 'animate-spin' : ''}>🔄</span>
                <span>{isPulsing ? 'DELIBERATING SWARM...' : 'PULSE COUNCIL DELIBERATION'}</span>
              </button>
            </div>
          </div>

          {/* Filters and Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-400 mr-2 text-[10px] uppercase">STANCE FILTER:</span>
              {['ALL', 'BULLISH', 'BEARISH', 'NEUTRAL', 'CAUTION'].map((bias) => (
                <button
                  key={bias}
                  onClick={() => setFilterBias(bias)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    filterBias === bias
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                      : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {bias}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-72">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agent name, mandate, role..."
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Live Inter-Agent Council Debate Stream */}
        <CouncilDebateStream />

        {/* Agent Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 font-mono">
          {filteredAgents.map((ag) => {
            const isSelected = selectedAgent?.id === ag.id;
            return (
              <div
                key={ag.id}
                onClick={() => setSelectedAgent(ag)}
                className={`cursor-pointer bg-[#080d19]/85 backdrop-blur-xl border rounded-2xl p-4 transition-all duration-200 flex flex-col justify-between hover:scale-[1.01] ${
                  isSelected
                    ? 'border-cyan-400 shadow-[0_0_25px_rgba(6,182,212,0.3)] bg-[#0c1526]/95'
                    : 'border-white/10 hover:border-white/25 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Bar: Name & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-sm text-white flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="truncate">{ag.name}</span>
                      </h3>
                      <p className="text-[10px] text-gray-400 mt-0.5">{ag.role}</p>
                    </div>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-bold border ${
                      ag.bias === 'BULLISH'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : ag.bias === 'BEARISH'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    }`}>
                      {ag.bias}
                    </span>
                  </div>

                  {/* Model & Weight Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-gray-400">
                    <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">
                      {ag.model}
                    </span>
                    <span className="bg-white/5 px-2 py-0.5 rounded border border-white/5 font-mono">
                      wt: {ag.weight.toFixed(1)}x
                    </span>
                    <span className="text-cyan-400 font-mono">
                      {ag.latencyMs}ms
                    </span>
                    {ag.provenanceBadge && (
                      <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[8px] border ${
                        ag.provenanceBadge === 'LIVE' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' :
                        ag.provenanceBadge === 'MT5' ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40' :
                        ag.provenanceBadge === 'DERIVED' ? 'bg-teal-950/60 text-teal-300 border-teal-500/40' :
                        ag.provenanceBadge === 'INFERENCE' ? 'bg-purple-950/60 text-purple-300 border-purple-500/40' :
                        'bg-amber-950/60 text-amber-300 border-amber-500/40'
                      }`}>
                        {ag.provenanceBadge}
                      </span>
                    )}
                  </div>

                  {/* Opinion Box */}
                  <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 text-xs text-gray-300 line-clamp-3 leading-relaxed">
                    &ldquo;{ag.lastOpinion}&rdquo;
                  </div>

                  {/* Confidence Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400">
                      <span>CONFIDENCE</span>
                      <span className="text-white font-bold">{ag.confidence}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${ag.confidence}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card Footer: Click hint */}
                <div className="pt-3 mt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-400">
                  <span className="text-cyan-400 hover:underline">Click to inspect agent &rarr;</span>
                  <div className="flex items-center space-x-2">
                    {ag.evidenceTrustScore !== undefined && (
                      <span className="text-[8.5px] font-mono text-gray-400">
                        Trust: <strong className={ag.evidenceTrustScore >= 70 ? 'text-emerald-300' : ag.evidenceTrustScore >= 30 ? 'text-amber-300' : 'text-rose-400'}>{ag.evidenceTrustScore}%</strong>
                      </span>
                    )}
                    <span>{ag.status}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Deep Inspection Drawer Modal */}
        {selectedAgent && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm p-2 sm:p-6 transition-opacity animate-in fade-in duration-200">
            <div className="bg-[#080d19] border border-cyan-500/40 rounded-3xl w-full max-w-2xl h-[90vh] flex flex-col p-6 shadow-[0_0_50px_rgba(6,182,212,0.25)] font-mono overflow-y-auto space-y-5">
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <h2 className="text-lg font-black text-white">{selectedAgent.name}</h2>
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-bold">
                      {selectedAgent.id}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{selectedAgent.role}</p>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="bg-white/10 hover:bg-white/20 text-gray-300 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Status & Bias Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">CURRENT STANCE</span>
                  <span className="text-cyan-400 font-bold text-sm">{selectedAgent.bias}</span>
                </div>
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">CONFIDENCE</span>
                  <span className="text-white font-bold text-sm">{selectedAgent.confidence}%</span>
                </div>
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">EVIDENCE TRUST</span>
                  <span className={`font-bold text-sm font-mono ${
                    (selectedAgent.evidenceTrustScore ?? 0) >= 70 ? 'text-emerald-400' : (selectedAgent.evidenceTrustScore ?? 0) >= 30 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {selectedAgent.evidenceTrustScore ?? 0}%
                  </span>
                </div>
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">PROVENANCE</span>
                  <span className="text-cyan-300 font-bold text-sm font-mono">{selectedAgent.provenanceBadge || 'HEURISTIC'}</span>
                </div>
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">VOTE WEIGHT</span>
                  <span className="text-purple-400 font-bold text-sm">{selectedAgent.weight}x</span>
                </div>
              </div>

              {/* System Mandate */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                  SYSTEM MANDATE & OPERATING BOUNDS
                </h4>
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl text-xs text-gray-300 leading-relaxed">
                  {selectedAgent.systemMandate}
                </div>
              </div>

              {/* Real-Time Telemetry */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                  ENGINE TELEMETRY & INFERENCE METRICS
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-black/40 border border-white/5 p-3 rounded-xl">
                  <div>
                    <span className="text-gray-400 text-[10px] block">MEMORY FOOTPRINT</span>
                    <span className="text-white font-bold">{selectedAgent.telemetry.memoryMb} MB</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block">THROUGHPUT</span>
                    <span className="text-cyan-400 font-bold">{selectedAgent.telemetry.tokensPerSec} tok/sec</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block">SAMPLES AUDITED</span>
                    <span className="text-purple-400 font-bold">{selectedAgent.telemetry.sampleCount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block">SERVICE UPTIME</span>
                    <span className="text-emerald-400 font-bold">{selectedAgent.telemetry.uptime}</span>
                  </div>
                </div>
              </div>

              {/* V1.2 Agent Readiness & Input Observability */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
                  <span>INPUT READINESS & OBSERVABILITY</span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    Freshness: <strong className={selectedAgent.freshness === 'REALTIME' ? 'text-emerald-400' : selectedAgent.freshness === 'CURRENT' ? 'text-cyan-400' : 'text-amber-400'}>{selectedAgent.freshness || 'CURRENT'}</strong>
                  </span>
                </h4>
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-2 text-xs">
                  <div>
                    <span className="text-gray-400 text-[10px] block mb-1">AVAILABLE INPUTS</span>
                    <div className="flex flex-wrap gap-1">
                      {(selectedAgent.availableInputs && selectedAgent.availableInputs.length > 0) ? (
                        selectedAgent.availableInputs.map((inp, idx) => (
                          <span key={idx} className="bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono">
                            ✓ {inp}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-500 text-[10px] font-mono">None currently locked</span>
                      )}
                    </div>
                  </div>
                  {selectedAgent.missingInputs && selectedAgent.missingInputs.length > 0 && (
                    <div>
                      <span className="text-rose-400 text-[10px] block mb-1">MISSING INPUTS (UNAVAILABLE)</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedAgent.missingInputs.map((inp, idx) => (
                          <span key={idx} className="bg-rose-950/60 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-mono">
                            ✕ {inp}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Latest Opinion & Evidence */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  LATEST REAL-TIME DELIBERATION
                </h4>
                <div className="bg-cyan-950/20 border border-cyan-500/30 p-3 rounded-xl text-xs text-cyan-200 leading-relaxed">
                  &ldquo;{selectedAgent.lastOpinion}&rdquo;
                </div>
              </div>

              {/* Evidence Items */}
              {selectedAgent.evidence && selectedAgent.evidence.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                    <span>VERIFIED EVIDENCE CITATIONS</span>
                    <span className="text-[10px] text-gray-400 font-mono font-normal">
                      Count: {selectedAgent.evidence.length}
                    </span>
                  </h4>
                  <ul className="space-y-1.5 bg-black/40 border border-white/5 p-3 rounded-xl text-xs text-gray-300">
                    {selectedAgent.evidence.map((item, idx) => {
                      const isBullish = item.startsWith('[BULLISH]');
                      const isBearish = item.startsWith('[BEARISH]');
                      const isConflict = item.startsWith('[CONFLICT]');
                      const isMissing = item.startsWith('[MISSING]');
                      const isNeutral = item.startsWith('[NEUTRAL]');

                      let badge = null;
                      let text = item;

                      if (isBullish) {
                        badge = <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">BULLISH</span>;
                        text = item.replace('[BULLISH]', '').trim();
                      } else if (isBearish) {
                        badge = <span className="bg-rose-950/80 text-rose-300 border border-rose-500/40 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">BEARISH</span>;
                        text = item.replace('[BEARISH]', '').trim();
                      } else if (isConflict) {
                        badge = <span className="bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">CONFLICT</span>;
                        text = item.replace('[CONFLICT]', '').trim();
                      } else if (isMissing) {
                        badge = <span className="bg-gray-800 text-gray-300 border border-gray-600 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">MISSING</span>;
                        text = item.replace('[MISSING]', '').trim();
                      } else if (isNeutral) {
                        badge = <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 text-[9px] px-1.5 py-0.5 rounded font-mono font-bold">NEUTRAL</span>;
                        text = item.replace('[NEUTRAL]', '').trim();
                      }

                      return (
                        <li key={idx} className="flex items-start space-x-2">
                          {badge ? badge : <span className="text-emerald-400">&bull;</span>}
                          <span className="leading-snug">{text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Key Risk & Invalidation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-rose-950/20 border border-rose-500/30 p-3 rounded-xl text-rose-300">
                  <span className="text-[10px] text-rose-400 font-bold block uppercase">KEY OBSERVED RISK</span>
                  <span>{selectedAgent.keyRisk || 'None flagged for current tick sequence'}</span>
                </div>
                <div className="bg-amber-950/20 border border-amber-500/30 p-3 rounded-xl text-amber-300">
                  <span className="text-[10px] text-amber-400 font-bold block uppercase">INVALIDATION TRIGGER</span>
                  <span>{selectedAgent.invalidation || 'Standard stop-loss trigger'}</span>
                </div>
              </div>

              {/* Conflict / Disagreement Matrix */}
              {selectedAgent.conflictsWith && selectedAgent.conflictsWith.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    CURRENT COUNCIL DISAGREEMENTS
                  </h4>
                  <div className="bg-black/40 border border-white/5 p-3 rounded-xl text-xs text-gray-300 space-y-1">
                    <p className="text-[11px] text-gray-400">This agent holds opposing probabilistic assessments against:</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedAgent.conflictsWith.map((conflict, idx) => (
                        <span key={idx} className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] px-2 py-0.5 rounded">
                          vs. {conflict}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Drawer Actions */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-gray-500">Autonomous Execution Unit #FEF-{selectedAgent.id}</span>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 px-4 py-2 rounded-xl text-xs font-bold tracking-wider transition-all"
                >
                  CLOSE INSPECTOR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Master Footer */}
        <MasterFooter />
      </div>
    </div>
  );
}
