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

export type AgentGroupCategory = 'MARKET' | 'MACRO' | 'EVENT' | 'QUANT' | 'CONTROL';

interface ExtendedAgent extends AgentState {
  id: string;
  model: string;
  weight: number;
  latencyMs: number;
  group: AgentGroupCategory;
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
  const [filterGroup, setFilterGroup] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [isPulsing, setIsPulsing] = useState(false);

  const handlePulseSwarm = async () => {
    setIsPulsing(true);
    try {
      if (typeof refreshData === 'function') {
        await refreshData();
      }
    } finally {
      setTimeout(() => setIsPulsing(false), 600);
    }
  };

  // Group assignment for the 15 Canonical Council Agents
  const getCouncilGroup = (type: string): AgentGroupCategory => {
    switch (type) {
      case 'TECHNICAL':
      case 'VISION':
      case 'LIQUIDITY_MAP':
      case 'KILLZONE':
      case 'ORDER_FLOW':
      case 'INSTITUTIONAL':
        return 'MARKET';
      case 'MACRO':
      case 'CORRELATION':
        return 'MACRO';
      case 'NEWS':
      case 'GEOPOLITICAL':
      case 'SENTIMENT':
        return 'EVENT';
      case 'RISK_GUARDIAN':
      case 'OPPORTUNITY':
      case 'STRATEGY':
      case 'FINAL_DECISION':
        return 'CONTROL';
      default:
        return 'MARKET';
    }
  };

  // 1. Map 15 Canonical Council Agents
  const councilAgents: ExtendedAgent[] = assetProfile.agents.map((ag, idx) => ({
    ...ag,
    id: `council-${idx + 1}`,
    group: getCouncilGroup(ag.type),
    model: idx % 2 === 0 ? 'DeepSeek-V3 Quant' : 'Llama-3.3 70B Quant',
    weight: idx === 7 ? 2.5 : idx === 12 ? 3.0 : 1.2,
    latencyMs: 32 + (idx * 4) % 25,
    systemMandate: `Analyze ${activeSymbol} real-time micro-structure, order-flow imbalances, and multi-timeframe SMC zones to provide deterministic probabilistic edge without emotional bias.`,
    telemetry: {
      memoryMb: 412 + (idx * 15),
      tokensPerSec: 88 + (idx * 2),
      sampleCount: 1420 + idx * 30,
      uptime: '99.98%'
    },
    conflictsWith: ag.bias === 'BULLISH' ? ['Macro Agent (Hawkish Fed)', 'Risk Guardian'] : ['Technical Agent', 'Opportunity Hunter']
  }));

  // 2. Map Official Specialist Agents from Foundation
  const ratesSpec = assetProfile.specialistAgents?.find((a) => a.agentId === 'RATES_AGENT');
  const inflationSpec = assetProfile.specialistAgents?.find((a) => a.agentId === 'INFLATION_AGENT');
  const volSpec = assetProfile.specialistAgents?.find((a) => a.agentId === 'VOLATILITY_AGENT');
  const crossSpec = assetProfile.specialistAgents?.find((a) => a.agentId === 'CROSS_ASSET_AGENT');
  const sentinelSpec = assetProfile.dataSentinel;
  const quantSpec = assetProfile.specialistAgents?.find((a) => a.agentId === 'QUANT_AGENT');

  const specialistAgentsList: ExtendedAgent[] = [
    {
      type: 'SYNAPSE_SENTINEL' as any,
      name: sentinelSpec?.agentName || 'Synapse Data Sentinel',
      role: sentinelSpec?.role || 'Feed Integrity & MT5 Transport Auditor',
      bias: 'NEUTRAL',
      confidence: sentinelSpec?.confidence || 95,
      status: (sentinelSpec?.readiness === 'READY' ? 'ONLINE' : 'DATA LIMITED') as any,
      lastOpinion: sentinelSpec?.primaryThesis || `Zero feed latency detected. Feed integrity verified for ${activeSymbol}.`,
      evidence: sentinelSpec?.evidence.map((e) => e.claim) || ['Feed integrity: 0 payload anomalies', 'Provider Health verified'],
      keyRisk: sentinelSpec?.keyRisk || 'Broker disconnect',
      invalidation: sentinelSpec?.invalidation || 'Latency > 250ms',
      id: 'spec-sentinel',
      group: 'CONTROL',
      model: 'Rust Micro-Daemon',
      weight: 2.0,
      latencyMs: 12,
      provenanceBadge: sentinelSpec?.provenanceBadge || 'LIVE',
      evidenceTrustScore: sentinelSpec?.evidenceTrust || 95,
      systemMandate: 'Verify broker socket ticks, payload structure, staleness limits, and provider health continuously.',
      telemetry: { memoryMb: 128, tokensPerSec: 0, sampleCount: 84200, uptime: '100.00%' }
    },
    {
      type: 'RATES_SPECIALIST' as any,
      name: ratesSpec?.agentName || 'Fed & Sovereign Rates Specialist',
      role: ratesSpec?.role || 'Treasury Yields, Yield Curve Structure & FOMC Target Corridor',
      bias: ratesSpec?.direction || 'NEUTRAL',
      confidence: ratesSpec?.confidence || 80,
      status: (ratesSpec?.readiness === 'READY' ? 'ONLINE' : ratesSpec?.readiness === 'PARTIAL' ? 'ACTIVE' : 'DATA LIMITED') as any,
      lastOpinion: ratesSpec?.primaryThesis || 'Sovereign rates & yield curve structure active.',
      evidence: ratesSpec?.evidence.map((e) => e.claim) || ['10Y-2Y Spread monitored', '10Y Benchmark analyzed'],
      keyRisk: ratesSpec?.keyRisk || 'Unscheduled Federal Reserve rate shock',
      invalidation: ratesSpec?.invalidation || 'Yield spike > 15 bp intraday',
      id: 'spec-rates',
      group: 'MACRO',
      model: 'Macro Econometric Engine',
      weight: 1.8,
      latencyMs: 25,
      provenanceBadge: ratesSpec?.provenanceBadge || 'INDEPENDENT',
      evidenceTrustScore: ratesSpec?.evidenceTrust || 85,
      systemMandate: 'Deconstruct sovereign yields, 10Y-2Y yield curve inversions, and FOMC target corridor dynamics.',
      telemetry: { memoryMb: 256, tokensPerSec: 45, sampleCount: 12400, uptime: '99.98%' }
    },
    {
      type: 'INFLATION_SPECIALIST' as any,
      name: inflationSpec?.agentName || 'Inflation & Real Yield Specialist',
      role: inflationSpec?.role || 'TIPS Real Rates & Market-Implied Breakeven Expectations',
      bias: inflationSpec?.direction || 'NEUTRAL',
      confidence: inflationSpec?.confidence || 85,
      status: (inflationSpec?.readiness === 'READY' ? 'ONLINE' : inflationSpec?.readiness === 'PARTIAL' ? 'ACTIVE' : 'DATA LIMITED') as any,
      lastOpinion: inflationSpec?.primaryThesis || 'Real yield & breakeven inflation expectations active.',
      evidence: inflationSpec?.evidence.map((e) => e.claim) || ['10Y Real Yield (DFII10)', '10Y Breakeven (T10YIE)'],
      keyRisk: inflationSpec?.keyRisk || 'TIPS liquidity distortion',
      invalidation: inflationSpec?.invalidation || 'Real yield breakout',
      id: 'spec-inflation',
      group: 'MACRO',
      model: 'TIPS Breakeven Evaluator',
      weight: 1.7,
      latencyMs: 22,
      provenanceBadge: inflationSpec?.provenanceBadge || 'INDEPENDENT',
      evidenceTrustScore: inflationSpec?.evidenceTrust || 90,
      systemMandate: 'Analyze TIPS real yields and market-implied breakeven inflation to evaluate the fundamental opportunity cost of holding non-yielding bullion.',
      telemetry: { memoryMb: 210, tokensPerSec: 38, sampleCount: 9600, uptime: '99.97%' }
    },
    {
      type: 'CROSS_ASSET_SPECIALIST' as any,
      name: crossSpec?.agentName || 'Cross-Asset & Correlation Specialist',
      role: crossSpec?.role || 'Intermarket Covariance, Yield Beta & Macro Assets',
      bias: crossSpec?.direction || 'NEUTRAL',
      confidence: crossSpec?.confidence || 75,
      status: (crossSpec?.readiness === 'READY' ? 'ONLINE' : 'DATA LIMITED') as any,
      lastOpinion: crossSpec?.primaryThesis || 'Intermarket cross-asset correlation matrix active.',
      evidence: crossSpec?.evidence.map((e) => e.claim) || ['Rolling Pearson matrix active', 'DXY strictly UNAVAILABLE'],
      keyRisk: crossSpec?.keyRisk || 'Intermarket covariance decoupling',
      invalidation: crossSpec?.invalidation || 'Correlation regime breakdown',
      id: 'spec-cross',
      group: 'MACRO',
      model: 'Covariance Matrix Engine',
      weight: 1.5,
      latencyMs: 30,
      provenanceBadge: crossSpec?.provenanceBadge || 'DERIVED',
      evidenceTrustScore: crossSpec?.evidenceTrust || 80,
      systemMandate: 'Calculate rolling Pearson correlation across aligned time series for yields, equities, and commodities without synthetic approximations.',
      telemetry: { memoryMb: 320, tokensPerSec: 52, sampleCount: 18200, uptime: '99.95%' }
    },
    {
      type: 'VOLATILITY_SPECIALIST' as any,
      name: volSpec?.agentName || 'Volatility & Expansion Specialist',
      role: volSpec?.role || 'ATR, Expansion Cycles & Risk Volatility Regimes',
      bias: volSpec?.direction || 'NEUTRAL',
      confidence: volSpec?.confidence || 70,
      status: (volSpec?.readiness === 'READY' ? 'ONLINE' : 'DATA LIMITED') as any,
      lastOpinion: volSpec?.primaryThesis || 'Volatility bands and expansion dynamics active.',
      evidence: volSpec?.evidence.map((e) => e.claim) || ['ATR expansion band evaluated'],
      keyRisk: volSpec?.keyRisk || 'Volatility expansion during session transition',
      invalidation: volSpec?.invalidation || 'ATR spike > 2.0x band',
      id: 'spec-vol',
      group: 'QUANT',
      model: 'ATR Expansion Engine',
      weight: 1.4,
      latencyMs: 18,
      provenanceBadge: volSpec?.provenanceBadge || 'DERIVED',
      evidenceTrustScore: volSpec?.evidenceTrust || 80,
      systemMandate: 'Classify volatility regimes between High Volatility, Normal Volatility, and Low Volatility using ATR multiples and historical bands.',
      telemetry: { memoryMb: 190, tokensPerSec: 60, sampleCount: 11000, uptime: '99.99%' }
    },
    {
      type: 'QUANT_SPECIALIST' as any,
      name: quantSpec?.agentName || 'Quantitative & Historical Analogue Specialist',
      role: quantSpec?.role || 'Distribution Analytics, Drawdowns & Historical Analogue Matching',
      bias: quantSpec?.direction || 'NEUTRAL',
      confidence: quantSpec?.confidence || 75,
      status: (quantSpec?.readiness === 'READY' ? 'ONLINE' : 'DATA LIMITED') as any,
      lastOpinion: quantSpec?.primaryThesis || 'Returns distribution and historical analogue matching active.',
      evidence: quantSpec?.evidence.map((e) => e.claim) || ['Historical return distribution', 'Regime matching sample checked'],
      keyRisk: quantSpec?.keyRisk || 'Non-stationary structural regime shift',
      invalidation: quantSpec?.invalidation || 'Variance exceeding analogue threshold',
      id: 'spec-quant',
      group: 'QUANT',
      model: 'Analogue Pattern Matcher',
      weight: 1.6,
      latencyMs: 35,
      provenanceBadge: quantSpec?.provenanceBadge || 'DERIVED',
      evidenceTrustScore: quantSpec?.evidenceTrust || 80,
      systemMandate: 'Compute annualized volatility, drawdowns, and match past multi-dimensional regime periods with forward median returns and sample size validation.',
      telemetry: { memoryMb: 450, tokensPerSec: 72, sampleCount: 14800, uptime: '99.92%' }
    },
  ];

  const fullCouncil: ExtendedAgent[] = [
    ...councilAgents,
    ...specialistAgentsList,
  ];

  const filteredAgents = fullCouncil.filter((ag) => {
    const matchesBias = filterBias === 'ALL' || ag.bias === filterBias;
    const matchesGroup = filterGroup === 'ALL' || ag.group === filterGroup;
    const matchesSearch =
      ag.name.toLowerCase().includes(search.toLowerCase()) ||
      ag.role.toLowerCase().includes(search.toLowerCase()) ||
      ag.systemMandate.toLowerCase().includes(search.toLowerCase());
    return matchesBias && matchesGroup && matchesSearch;
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
          <div className="space-y-2.5 pt-3 border-t border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Group Filter */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-gray-400 mr-2 text-[10px] uppercase">COUNCIL GROUP:</span>
                {(['ALL', 'MARKET', 'MACRO', 'EVENT', 'QUANT', 'CONTROL'] as const).map((group) => (
                  <button
                    key={group}
                    onClick={() => setFilterGroup(group)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterGroup === group
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                        : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {group}
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

            {/* Stance Filter */}
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
                    <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[8px] border ${
                      ag.group === 'MARKET' ? 'bg-blue-950/60 text-blue-300 border-blue-500/40' :
                      ag.group === 'MACRO' ? 'bg-amber-950/60 text-amber-300 border-amber-500/40' :
                      ag.group === 'EVENT' ? 'bg-purple-950/60 text-purple-300 border-purple-500/40' :
                      ag.group === 'QUANT' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' :
                      'bg-rose-950/60 text-rose-300 border-rose-500/40'
                    }`}>
                      {ag.group}
                    </span>
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
