'use client';

import React, { useState } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

interface AgentManifestItem {
  id: string;
  name: string;
  cluster: 'OHLC_TECHNICAL' | 'MACRO' | 'MICROSTRUCTURE' | 'SENTIMENT' | 'RISK_CONTROL' | 'DOWNSTREAM_SYNTHESIZER';
  isUpstreamVoter: boolean;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidencePct: number;
  readinessPct: number;
  weight: number;
  mandate: string;
}

const CANONICAL_32_AGENTS: AgentManifestItem[] = [
  // 11 OHLC Technical Agents (Correlated Indicators)
  { id: 'agent-1', name: 'TrendStructureAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 78, readinessPct: 100, weight: 1.0, mandate: 'Swing high/low market structure identification' },
  { id: 'agent-2', name: 'FairValueGapAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 74, readinessPct: 100, weight: 0.9, mandate: 'Imbalance & 3-candle FVG detection' },
  { id: 'agent-3', name: 'OrderBlockAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 82, readinessPct: 100, weight: 1.2, mandate: 'Institutional order block & mitigation retest tracking' },
  { id: 'agent-4', name: 'LiquiditySweepAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 85, readinessPct: 100, weight: 1.2, mandate: 'Buy-side / sell-side liquidity purge identification' },
  { id: 'agent-5', name: 'MarketStructureShiftAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 80, readinessPct: 100, weight: 1.1, mandate: 'Displacement & MSS break confirmation' },
  { id: 'agent-6', name: 'BreakoutMomentumAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 62, readinessPct: 100, weight: 0.8, mandate: 'Range compression & expansion velocity' },
  { id: 'agent-7', name: 'SupplyDemandAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 75, readinessPct: 100, weight: 0.9, mandate: 'HTF supply and demand origin mapping' },
  { id: 'agent-8', name: 'AtrVolatilityAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 70, readinessPct: 100, weight: 0.8, mandate: 'Normalized true range regime tracking' },
  { id: 'agent-9', name: 'VolumeProfileAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 73, readinessPct: 100, weight: 0.9, mandate: 'Point of Control (POC) and value area boundaries' },
  { id: 'agent-10', name: 'MultiTimeframeAlignmentAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 84, readinessPct: 100, weight: 1.3, mandate: 'Fractal confluence across M15, H1, H4, and D1' },
  { id: 'agent-11', name: 'CandleGeometryAgent', cluster: 'OHLC_TECHNICAL', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 69, readinessPct: 100, weight: 0.7, mandate: 'Wick-to-body ratios and rejection signatures' },

  // 9 Macro & Cross-Asset Agents
  { id: 'agent-12', name: 'MacroTrendAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 81, readinessPct: 100, weight: 1.2, mandate: 'Global macroeconomic cycle alignment' },
  { id: 'agent-13', name: 'YieldCurveAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'BEARISH', confidencePct: 65, readinessPct: 95, weight: 1.0, mandate: 'US 10Y/2Y Treasury yield curve slope' },
  { id: 'agent-14', name: 'DxyCorrelationAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'BEARISH', confidencePct: 77, readinessPct: 100, weight: 1.1, mandate: 'Dollar Index lead-lag inverse correlation' },
  { id: 'agent-15', name: 'CentralBankPolicyAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 70, readinessPct: 90, weight: 1.0, mandate: 'Fed/ECB/BOJ interest rate policy trajectory' },
  { id: 'agent-16', name: 'CotReportAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 76, readinessPct: 100, weight: 1.0, mandate: 'CFTC commercial vs speculative positioning' },
  { id: 'agent-17', name: 'GeopoliticalRiskAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 72, readinessPct: 95, weight: 0.9, mandate: 'Flight-to-safety gold and oil demand pricing' },
  { id: 'agent-18', name: 'EconomicCalendarAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 68, readinessPct: 100, weight: 0.9, mandate: 'High-impact red-folder event countdown' },
  { id: 'agent-19', name: 'InflationTrendAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 74, readinessPct: 90, weight: 0.9, mandate: 'CPI/PCE inflation expectation metrics' },
  { id: 'agent-20', name: 'CommodityTermsAgent', cluster: 'MACRO', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 71, readinessPct: 95, weight: 0.8, mandate: 'Raw materials and energy terms of trade' },

  // 4 Microstructure & Order Flow Agents
  { id: 'agent-21', name: 'MicrostructureImbalanceAgent', cluster: 'MICROSTRUCTURE', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 79, readinessPct: 100, weight: 1.1, mandate: 'Tick-level bid/ask order book imbalance' },
  { id: 'agent-22', name: 'SessionLiquidityAgent', cluster: 'MICROSTRUCTURE', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 83, readinessPct: 100, weight: 1.2, mandate: 'London/NY session killzone volume transitions' },
  { id: 'agent-23', name: 'OrderFlowPaceAgent', cluster: 'MICROSTRUCTURE', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 66, readinessPct: 100, weight: 0.8, mandate: 'Institutional execution speed & tape pacing' },
  { id: 'agent-24', name: 'SpreadExpansionGuard', cluster: 'MICROSTRUCTURE', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 90, readinessPct: 100, weight: 1.5, mandate: 'Spread anomaly monitor & volatility brake' },

  // 3 Sentiment Agents
  { id: 'agent-25', name: 'NewsSentimentAgent', cluster: 'SENTIMENT', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 68, readinessPct: 95, weight: 0.7, mandate: 'Financial media headline sentiment scoring' },
  { id: 'agent-26', name: 'RetailSentimentContrarianAgent', cluster: 'SENTIMENT', isUpstreamVoter: true, direction: 'BULLISH', confidencePct: 75, readinessPct: 100, weight: 1.0, mandate: 'Contrarian crowd positioning ratio audit' },
  { id: 'agent-27', name: 'SocialVelocityAgent', cluster: 'SENTIMENT', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 61, readinessPct: 90, weight: 0.6, mandate: 'Retail volume chatter & FOMO acceleration' },

  // 4 Risk & Capital Control Guards
  { id: 'agent-28', name: 'RiskGuardianAgent', cluster: 'RISK_CONTROL', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 95, readinessPct: 100, weight: 2.0, mandate: 'Account portfolio risk & maximum daily loss lock' },
  { id: 'agent-29', name: 'DrawdownDefenseAgent', cluster: 'RISK_CONTROL', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 92, readinessPct: 100, weight: 2.0, mandate: 'Equity peak-to-trough trailing defense' },
  { id: 'agent-30', name: 'VolatilitySurgeVeto', cluster: 'RISK_CONTROL', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 88, readinessPct: 100, weight: 1.8, mandate: 'Dynamic spread & ATR expansion circuit breaker' },
  { id: 'agent-31', name: 'DataSentinelAgent', cluster: 'RISK_CONTROL', isUpstreamVoter: true, direction: 'NEUTRAL', confidencePct: 98, readinessPct: 100, weight: 2.0, mandate: 'Broker quote freshness & heartbeat watchdog' },

  // 1 Downstream Synthesizer (NEVER counted as independent voter)
  { id: 'agent-32', name: 'FINAL_DECISION', cluster: 'DOWNSTREAM_SYNTHESIZER', isUpstreamVoter: false, direction: 'BULLISH', confidencePct: 81, readinessPct: 100, weight: 0.0, mandate: 'Synthesizes upstream voter evidence into Decision Engine V2' },
];

export const AgentIntelligenceCenter: React.FC = () => {
  const { activeSymbol } = useActiveAsset();
  const [selectedCluster, setSelectedCluster] = useState<string>('ALL');
  const [selectedAgent, setSelectedAgent] = useState<AgentManifestItem | null>(null);

  const upstreamVoters = CANONICAL_32_AGENTS.filter((a) => a.isUpstreamVoter);
  const downstreamSynthesizer = CANONICAL_32_AGENTS.find((a) => !a.isUpstreamVoter);

  const bullishCount = upstreamVoters.filter((a) => a.direction === 'BULLISH').length;
  const bearishCount = upstreamVoters.filter((a) => a.direction === 'BEARISH').length;
  const neutralCount = upstreamVoters.filter((a) => a.direction === 'NEUTRAL').length;

  const filteredAgents = CANONICAL_32_AGENTS.filter((a) => {
    if (selectedCluster === 'ALL') return true;
    return a.cluster === selectedCluster;
  });

  return (
    <div className="bg-[#070f1e] rounded-2xl border border-white/10 shadow-2xl p-3 sm:p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
            🧠
          </div>
          <div>
            <h3 className="text-xs font-black tracking-wider uppercase text-cyan-300 font-mono">
              32-AGENT INTELLIGENCE CENTER
            </h3>
            <p className="text-[10px] text-gray-400 font-mono">
              31 Upstream Evidence Voters + 1 Downstream Synthesizer · Evaluated for {activeSymbol}
            </p>
          </div>
        </div>

        {/* Voting Summary Deck */}
        <div className="flex items-center space-x-2 font-mono text-[10px]">
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {bullishCount} Bullish
          </span>
          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
            {bearishCount} Bearish
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-500/20 text-gray-300 border border-gray-500/30">
            {neutralCount} Neutral
          </span>
        </div>
      </div>

      {/* Cluster Navigation Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar font-mono text-[10px]">
        {['ALL', 'OHLC_TECHNICAL', 'MACRO', 'MICROSTRUCTURE', 'SENTIMENT', 'RISK_CONTROL', 'DOWNSTREAM_SYNTHESIZER'].map((cluster) => (
          <button
            key={cluster}
            onClick={() => setSelectedCluster(cluster)}
            className={`px-2.5 py-1 rounded-lg border whitespace-nowrap transition-all cursor-pointer ${
              selectedCluster === cluster
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                : 'bg-black/30 border-white/5 text-gray-400 hover:text-white'
            }`}
          >
            {cluster.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Cluster Independence Warning Banner */}
      <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 font-mono text-[10px] text-cyan-300/80 leading-relaxed">
        <strong>Institutional Evidence Rule:</strong> The 11 OHLC Technical agents evaluate shared price action and are grouped as a single correlated cluster. They do NOT constitute 11 independent confirmations in Decision Engine V2. Independent confirmation requires cross-cluster agreement from Macro, Microstructure, and Sentiment.
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {filteredAgents.map((agent) => (
          <div
            key={agent.id}
            onClick={() => setSelectedAgent(agent)}
            className={`p-2.5 rounded-xl border transition-all cursor-pointer font-mono ${
              agent.cluster === 'DOWNSTREAM_SYNTHESIZER'
                ? 'bg-purple-950/20 border-purple-500/40 hover:border-purple-400'
                : 'bg-black/40 border-white/5 hover:border-white/20'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-gray-200 truncate pr-1">
                {agent.name}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                  agent.direction === 'BULLISH'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : agent.direction === 'BEARISH'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-gray-500/20 text-gray-300'
                }`}
              >
                {agent.direction}
              </span>
            </div>

            <div className="flex items-center justify-between text-[9px] text-gray-400 mb-1">
              <span>{agent.cluster.replace('_', ' ')}</span>
              <span>{agent.confidencePct}% Conf</span>
            </div>

            {/* Readiness progress bar */}
            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
              <div
                className={`h-full ${
                  agent.direction === 'BULLISH'
                    ? 'bg-emerald-400'
                    : agent.direction === 'BEARISH'
                    ? 'bg-rose-400'
                    : 'bg-cyan-400'
                }`}
                style={{ width: `${agent.confidencePct}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Downstream Synthesizer Highlight */}
      {downstreamSynthesizer && (
        <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between font-mono text-xs">
          <div className="space-y-0.5">
            <div className="font-bold text-purple-300 flex items-center space-x-1.5">
              <span>⚡</span>
              <span>SYNTHESIS: {downstreamSynthesizer.name}</span>
              <span className="text-[9px] px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-200">
                Downstream Aggregator Only
              </span>
            </div>
            <p className="text-[10px] text-gray-400">{downstreamSynthesizer.mandate}</p>
          </div>

          <div className="text-right">
            <span className="text-sm font-bold text-emerald-400">{downstreamSynthesizer.direction}</span>
            <div className="text-[9px] text-gray-500">{downstreamSynthesizer.confidencePct}% Conviction</div>
          </div>
        </div>
      )}
    </div>
  );
};

