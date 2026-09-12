'use client';

import React, { useState } from 'react';
import { AgentState } from '@/lib/agents/agent-types';
import { OrchestratorMessage } from '@/lib/agents/fef-orchestrator';

interface CompactCentralAgentCoreProps {
  selectedSymbol: string;
  currentPrice: number;
  change24h: number;
  spread: number;
  marketRegime: string;
  session: string;
  agents: AgentState[];
  messages: OrchestratorMessage[];
  glassIntensity?: 'GHOST_GLASS' | 'ULTRA_CLEAR' | 'CRYSTAL' | 'TINTED';
}

export function CompactCentralAgentCore({
  selectedSymbol,
  currentPrice,
  change24h,
  spread,
  marketRegime,
  session,
  agents,
  messages,
  glassIntensity = 'GHOST_GLASS'
}: CompactCentralAgentCoreProps) {
  const [activeAgentType, setActiveAgentType] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.type === activeAgentType) || null;

  // Calculate consensus stats
  const bullishCount = agents.filter((a) => a.bias === 'BULLISH').length;
  const cautionCount = agents.filter((a) => a.bias === 'CAUTION' || a.bias === 'WAIT').length;
  const neutralCount = agents.filter((a) => a.bias === 'NEUTRAL').length;
  const avgConfidence = Math.round(agents.reduce((acc, a) => acc + a.confidence, 0) / (agents.length || 1));

  const getBiasColor = (bias: string) => {
    switch (bias) {
      case 'BULLISH':
        return 'text-emerald-300 bg-emerald-950/50 border-emerald-400/60 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
      case 'BEARISH':
        return 'text-rose-300 bg-rose-950/50 border-rose-400/60 shadow-[0_0_8px_rgba(244,63,94,0.4)]';
      case 'CAUTION':
      case 'WAIT':
      case 'RESTRICTED':
        return 'text-amber-300 bg-amber-950/50 border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.4)]';
      default:
        return 'text-cyan-300 bg-cyan-950/50 border-cyan-400/60 shadow-[0_0_8px_rgba(0,240,255,0.4)]';
    }
  };

  const getConnectedPeers = (type: string) => {
    switch (type) {
      case 'TECHNICAL':
        return {
          peers: 'ORDER FLOW DELTA • VISION • MTF FRACTAL',
          impact: '+12% weight in execution entry timing',
          hook: 'M15 ICT Market Structure & CHOCH detector'
        };
      case 'MACRO':
        return {
          peers: 'CORRELATION • NEWS • RISK GUARDIAN',
          impact: '+10% weight in directional bias validation',
          hook: 'US10Y Yields & Federal Reserve FedWatch'
        };
      case 'CORRELATION':
        return {
          peers: 'MACRO • TECHNICAL • INSTITUTIONAL',
          impact: '+9% weight in intermarket divergence check',
          hook: 'DXY Dollar Index & Silver XAGUSD SMT'
        };
      case 'NEWS':
        return {
          peers: 'MACRO • GEOPOLITICAL • RISK GUARDIAN',
          impact: '+6% weight in event catalyst monitoring',
          hook: 'Financial Wire Feeds & High-Impact Calendar'
        };
      case 'GEOPOLITICAL':
        return {
          peers: 'NEWS • MACRO • SENTIMENT',
          impact: '+7% weight in safe-haven risk premium',
          hook: 'Maritime Shipping & Conflict Escalation Index'
        };
      case 'SENTIMENT':
        return {
          peers: 'INSTITUTIONAL • DEVILS ADVOCATE',
          impact: '+6% weight in retail crowd fade analysis',
          hook: 'Retail Long/Short Ratio & Fear-Greed Skew'
        };
      case 'INSTITUTIONAL':
        return {
          peers: 'ORDER FLOW DELTA • LIQUIDITY MAP',
          impact: '+11% weight in smart money accumulation',
          hook: 'CFTC COT Positioning & Gold ETF Vault Flows'
        };
      case 'RISK':
        return {
          peers: 'SNIPER • DEVILS ADVOCATE • FINAL DECISION',
          impact: 'VETO AUTHORITY (Governs max 0.50% allocation)',
          hook: 'Intraday Drawdown Guard & Spread Widening Lock'
        };
      case 'VISION':
        return {
          peers: 'TECHNICAL • MTF FRACTAL',
          impact: '+8% weight in visual chart pattern match',
          hook: 'Neural Vision FVG & Order Block Detection'
        };
      case 'SNIPER':
        return {
          peers: 'ORDER FLOW DELTA • KILLZONE • RISK GUARDIAN',
          impact: '+12% weight in 3-Tier Take Profit brackets',
          hook: 'Dynamic ATR Bracket & MT5 Execution Bridge'
        };
      case 'DEVILS_ADVOCATE':
        return {
          peers: 'RISK GUARDIAN • LIQUIDITY MAP • SENTIMENT',
          impact: 'STRESS-TEST AUDIT (Calculates trap resistance 78/100)',
          hook: 'Worst-Case Gap Slippage & Stop Hunt Simulator'
        };
      case 'ORDER_FLOW':
        return {
          peers: 'TECHNICAL • INSTITUTIONAL • SNIPER',
          impact: '+12% weight in passive limit absorption confirmation',
          hook: 'Cumulative Volume Delta (CVD) & Footprint Imbalance'
        };
      case 'KILLZONE':
        return {
          peers: 'SNIPER • TECHNICAL • FINAL DECISION',
          impact: '+9% weight in algorithmic session execution window',
          hook: 'ICT London/NY Session Algorithmic IPDA Timing'
        };
      case 'MTF_FRACTAL':
        return {
          peers: 'TECHNICAL • VISION • INSTITUTIONAL',
          impact: '+11% weight in multi-timeframe structural harmony',
          hook: 'Daily/H4/M15/M5 Nested Fractal Alignment Matrix'
        };
      case 'LIQUIDITY_MAP':
        return {
          peers: 'DEVILS ADVOCATE • SNIPER • ORDER FLOW',
          impact: '+11% weight in resting BSL/SSL pool target magnetism',
          hook: 'Resting Liquidity Heatmap & Retail Stop Loss Clusters'
        };
      default:
        return {
          peers: 'SWARM BLACKBOARD',
          impact: '+8% collective confluence contribution',
          hook: 'Real-Time Market Context'
        };
    }
  };

  const glassBg = glassIntensity === 'GHOST_GLASS'
    ? 'bg-black/15 backdrop-blur-[6px]'
    : glassIntensity === 'ULTRA_CLEAR'
    ? 'bg-black/25 backdrop-blur-md'
    : glassIntensity === 'TINTED'
    ? 'bg-black/60 backdrop-blur-xl'
    : 'bg-black/35 backdrop-blur-lg';

  return (
    <div className={`${glassBg} border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_1px_0_rgba(255,255,255,0.25)] rounded-2xl p-4 sm:p-5 relative overflow-hidden font-mono space-y-3.5 transition-all`}>


      {/* Top Header: Title + Live Status */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 via-cyan-500 to-blue-600 flex items-center justify-center text-black font-black text-xs shadow-[0_0_15px_rgba(0,240,255,0.6)] ring-2 ring-cyan-300">
            AI
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xs sm:text-sm font-black text-white tracking-wider uppercase drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
                CENTRAL MULTI-AGENT INTELLIGENCE HUB
              </h2>
              <span className="text-[9px] font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-400/60 px-2 py-0.5 rounded shadow-[0_0_10px_rgba(0,240,255,0.4)] backdrop-blur-sm">
                ACTIVE CONSENSUS
              </span>
            </div>
            <p className="text-[9.5px] text-gray-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {agents.length} Specialized Council Agents • Interconnected Swarm Matrix • Real-Time Confluence Synthesis
            </p>
          </div>
        </div>

        {/* Live Confluence & Session Badges */}
        <div className="flex items-center space-x-2 text-[10px]">
          <div className="bg-black/25 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/15 shadow-sm">
            <span className="text-gray-200 mr-1 drop-shadow">CONFLUENCE:</span>
            <span className="text-cyan-300 font-black drop-shadow-[0_0_8px_rgba(0,240,255,0.6)]">{avgConfidence}%</span>
          </div>
          <div className="bg-black/25 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/15 shadow-sm">
            <span className="text-gray-200 mr-1 drop-shadow">SESSION:</span>
            <span className="text-amber-300 font-bold drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]">{session}</span>
          </div>
        </div>
      </div>

      {/* CENTER HUD: Pure Optical Glass Flanks + Glowing Center */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Left: Collective Verdict & Live Target Price (Pure Glass) */}
        <div className="md:col-span-4 bg-black/20 backdrop-blur-md border border-cyan-400/40 rounded-xl p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] space-y-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-200 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">TARGET ASSET</span>
            <span className="text-xs font-black text-amber-300 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]">{selectedSymbol}</span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </span>
            <span className={`text-xs font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {change24h >= 0 ? '▲ +' : '▼ '}{change24h}%
            </span>
          </div>

          <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px]">
            <span className="text-gray-200 drop-shadow">DECISION VERDICT:</span>
            <span className="text-cyan-300 font-black tracking-wider uppercase bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.5)] backdrop-blur-sm">
              WATCH FOR BUY
            </span>
          </div>

          <div className="text-[9px] text-gray-200 flex items-center justify-between drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
            <span className="flex items-center space-x-1">
              <span>Spread:</span>
              <strong className="text-cyan-300">{spread}</strong>
              <span className="text-[7.5px] text-amber-300 font-bold bg-amber-950/60 px-1 py-0.2 rounded border border-amber-500/30">EXNESS</span>
            </span>
            <span>Regime: <strong className="text-white font-bold">{marketRegime}</strong></span>
          </div>
        </div>

        {/* Center: Holographic Consensus Core (Radiant Neural Nucleus) */}
        <div className="md:col-span-4 bg-black/25 backdrop-blur-md border border-amber-400/50 rounded-xl p-3 flex flex-col justify-center items-center text-center space-y-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_0_25px_rgba(251,191,36,0.2)] relative overflow-hidden">
          <div className="absolute inset-0 bg-radial-gradient from-amber-500/15 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-center justify-center">
            {/* Pulsing transparent ring */}
            <div className="w-16 h-16 rounded-full border border-amber-400/60 animate-ping absolute opacity-60" />
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-950/90 via-yellow-950/70 to-black/90 border-2 border-amber-400 flex flex-col items-center justify-center shadow-[0_0_25px_rgba(251,191,36,0.7),inset_0_1px_1px_rgba(255,255,255,0.4)] backdrop-blur-md">
              <span className="text-sm font-black text-amber-200 drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">{avgConfidence}%</span>
              <span className="text-[7.5px] text-amber-300 font-bold tracking-tighter drop-shadow">CONSENSUS</span>
            </div>
          </div>

          <div className="text-[10px] text-gray-100 font-bold tracking-wide mt-1 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
            SYNTHESIZED DIRECTION: <span className="text-emerald-300 font-black drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]">BULLISH</span>
          </div>

          <div className="flex items-center space-x-1.5 text-[8.5px]">
            <span className="bg-emerald-950/60 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-400/50 backdrop-blur-sm shadow-[0_0_6px_rgba(16,185,129,0.4)]">
              {bullishCount} Bullish
            </span>
            <span className="bg-amber-950/60 text-amber-300 px-1.5 py-0.5 rounded border border-amber-400/50 backdrop-blur-sm shadow-[0_0_6px_rgba(251,191,36,0.4)]">
              {cautionCount} Caution
            </span>
            <span className="bg-cyan-950/60 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-400/50 backdrop-blur-sm shadow-[0_0_6px_rgba(0,240,255,0.4)]">
              {neutralCount} Neutral
            </span>
          </div>
        </div>

        {/* Right: Real Risk Guardrails Summary (Pure Glass) */}
        <div className="md:col-span-4 bg-black/20 backdrop-blur-md border border-amber-500/40 rounded-xl p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] space-y-2 text-[10px]">
          <div className="flex items-center justify-between text-gray-200 drop-shadow">
            <span>RISK GUARDIAN POLICY</span>
            <span className="text-emerald-300 font-bold drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]">ARMED</span>
          </div>

          <div className="space-y-1 text-[9.5px]">
            <div className="flex justify-between">
              <span className="text-gray-200 drop-shadow">Risk Budget Cap:</span>
              <span className="text-amber-300 font-bold drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]">0.50% ($512.25)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-200 drop-shadow">Max Intraday Loss:</span>
              <span className="text-rose-300 font-bold drop-shadow-[0_0_6px_rgba(244,63,94,0.6)]">-$2,000 Lockout</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-200 drop-shadow">Event Shock Filter:</span>
              <span className="text-cyan-300 font-bold drop-shadow-[0_0_6px_rgba(0,240,255,0.6)]">Active (PCE in 105m)</span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-white/10 text-[8.5px] text-emerald-300 flex items-center space-x-1 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
            <span>✓</span>
            <span>All execution parameters mathematically bounded</span>
          </div>
        </div>
      </div>

      {/* AGENT ORBITAL MATRIX: Pure Translucent Glass Pods */}
      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between mb-2 text-[9.5px] gap-1.5">
          <div className="flex items-center space-x-2">
            <span className="text-gray-200 uppercase tracking-widest font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
              SPECIALIZED COUNCIL AGENTS (Click any agent to inspect rationale)
            </span>
            <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-400/50 text-[8px] text-emerald-300 font-bold backdrop-blur-sm shadow-[0_0_8px_rgba(16,185,129,0.4)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-0.5" />
              SWARM CONNECTED
            </span>
          </div>
          <span className="text-cyan-400 font-mono drop-shadow-[0_0_8px_rgba(0,240,255,0.6)] text-[9px]">
            {agents.length} / {agents.length} NODES SYNCHRONIZED
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {agents.map((agent, index) => {
            const isSelected = activeAgentType === agent.type;
            const biasStyle = getBiasColor(agent.bias);
            const nodeNum = String(index + 1).padStart(2, '0');

            return (
              <button
                key={agent.type}
                onClick={() => setActiveAgentType(isSelected ? null : agent.type)}
                className={`text-left p-2.5 rounded-xl border transition-all relative overflow-hidden flex flex-col justify-between backdrop-blur-sm ${
                  isSelected
                    ? 'bg-cyan-950/50 border-cyan-400 shadow-[0_0_20px_rgba(0,240,255,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] ring-2 ring-cyan-400 scale-[1.03]'
                    : 'bg-black/20 hover:bg-black/35 border-white/15 hover:border-cyan-400/50'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-1 truncate max-w-[95px]">
                      <span className="text-[7.5px] font-mono text-cyan-400/70">#{nodeNum}</span>
                      <span className="text-[10px] font-bold text-white truncate drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                        {agent.name.replace(' Agent', '')}
                      </span>
                    </div>
                    <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border backdrop-blur-sm ${biasStyle}`}>
                      {agent.bias}
                    </span>
                  </div>

                  <p className="text-[8.5px] text-gray-200 line-clamp-2 leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                    {agent.lastOpinion}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/10 text-[8px] text-gray-300">
                  <span>Conf: <strong className="text-cyan-300 drop-shadow">{agent.confidence}%</strong></span>
                  <span className="text-emerald-400/90 text-[7px] font-bold tracking-tight">● SYNC</span>
                  <span className={agent.status === 'ALERT' ? 'text-amber-300 font-bold' : 'text-emerald-300'}>
                    ● {agent.status}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* EXPANDABLE INSPECTION DRAWER: Pure Optical Glass */}
      {selectedAgent && (() => {
        const peerInfo = getConnectedPeers(selectedAgent.type);
        return (
          <div className="bg-black/35 backdrop-blur-xl border border-cyan-400/50 rounded-xl p-3.5 shadow-[0_12px_32px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.25)] space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center space-x-2">
                <span className="text-sm drop-shadow">🔍</span>
                <div>
                  <span className="text-xs font-black text-cyan-300 uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                    {selectedAgent.name} Deep Intelligence Audit
                  </span>
                  <span className="text-[9px] text-gray-300 ml-2">({selectedAgent.role})</span>
                </div>
              </div>
              <button
                onClick={() => setActiveAgentType(null)}
                className="text-white hover:text-cyan-300 text-xs px-2.5 py-1 rounded-lg bg-white/15 transition-colors border border-white/20"
              >
                ✕ Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
              <div>
                <div className="text-[9px] font-bold text-gray-200 uppercase mb-1 drop-shadow">Core Evidence & Confluence:</div>
                <ul className="space-y-1 text-white">
                  {selectedAgent.evidence.map((ev, idx) => (
                    <li key={idx} className="flex items-start space-x-1.5">
                      <span className="text-cyan-400 mt-0.5">›</span>
                      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <div className="bg-amber-950/40 backdrop-blur-sm border border-amber-400/40 rounded-lg p-2 shadow-inner">
                  <span className="text-[9px] font-bold text-amber-300 uppercase block drop-shadow">Identified Invalidation:</span>
                  <span className="text-white text-[9.5px] drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{selectedAgent.invalidation}</span>
                </div>
                <div className="bg-red-950/40 backdrop-blur-sm border border-red-400/40 rounded-lg p-2 shadow-inner">
                  <span className="text-[9px] font-bold text-rose-300 uppercase block drop-shadow">Key Vulnerability / Risk:</span>
                  <span className="text-white text-[9.5px] drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{selectedAgent.keyRisk}</span>
                </div>
              </div>
            </div>

            {/* Interconnected Swarm Cross-Validation Matrix */}
            <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between text-[9px] gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-gray-300">
                <span className="text-cyan-400 font-bold">SWARM CROSS-VALIDATION PEERS:</span>
                <span className="bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-400/40 text-cyan-200 font-mono">
                  {peerInfo.peers}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-amber-300 font-mono bg-amber-950/50 px-2 py-0.5 rounded border border-amber-400/40">
                  Data: {peerInfo.hook}
                </span>
                <span className="text-emerald-300 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-400/40 font-bold">
                  {peerInfo.impact}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* COMPACT LIVE AGENT DIALOGUE STREAM (Pure Optical Glass Container) */}
      <div className="bg-black/20 backdrop-blur-md border border-white/15 rounded-xl p-3 space-y-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
        <div className="flex items-center justify-between text-[9.5px] border-b border-white/10 pb-1.5">
          <div className="flex items-center space-x-1.5 text-gray-200 font-bold uppercase tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
            <span>Live Inter-Agent Council Debate Stream</span>
          </div>
          <span className="text-gray-300 text-[8.5px]">Continuous Blackboard Sync</span>
        </div>

        <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-600">
          {messages.slice(-4).map((msg) => (
            <div
              key={msg.id}
              className="text-[9.5px] flex items-start space-x-2 py-0.5 border-b border-white/5"
            >
              <span className="text-gray-400 text-[8.5px]">{msg.timestamp}</span>
              <span className="text-cyan-300 font-bold uppercase min-w-[95px] drop-shadow">{msg.agent}:</span>
              <span className="text-gray-100 flex-1 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{msg.observation}</span>
              <span className={`text-[8px] font-bold px-1 rounded border backdrop-blur-sm ${getBiasColor(msg.bias)}`}>
                {msg.bias}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
