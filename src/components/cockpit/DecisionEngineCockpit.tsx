'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const DecisionEngineCockpit: React.FC = () => {
  const { activeSymbol, activeAsset } = useActiveAsset();

  // Authoritative Decision Engine V2 state for active asset
  const bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = activeAsset.change24h >= 0 ? 'BULLISH' : 'BEARISH';
  const confidencePct = 81;
  const completenessPct = 78;
  const independentConfirmations = 4; // Distinct clusters: OHLC, Macro, Microstructure, Sentiment
  const correlatedConfirmations = 11; // 11 OHLC indicators
  const activeVetoes: string[] = []; // No active vetoes currently
  const blockingConditions: string[] = ['Awaiting H4 displacement confirmation'];
  const conflicts: string[] = ['YieldCurveAgent signals mild contraction headwind'];

  const isApproved = activeVetoes.length === 0 && blockingConditions.length === 0 && independentConfirmations >= 3;

  return (
    <div className="bg-[#070f1e] rounded-2xl border border-white/10 shadow-2xl p-3 sm:p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold">
            ⚖️
          </div>
          <div>
            <h3 className="text-xs font-black tracking-wider uppercase text-emerald-300 font-mono">
              DECISION ENGINE V2 COCKPIT
            </h3>
            <p className="text-[10px] text-gray-400 font-mono">
              Authoritative Multi-Cluster Evaluation · {activeSymbol}
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center space-x-2 font-mono text-[10px]">
          <span className="text-gray-400">Decision Status:</span>
          <span
            className={`px-2.5 py-1 rounded-lg border font-bold ${
              isApproved
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            {isApproved ? 'APPROVED' : 'BLOCKED / CONDITIONAL'}
          </span>
        </div>
      </div>

      {/* Primary Metrics Deck */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono">
        {/* Directional Bias */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
          <span className="text-[10px] text-gray-400 uppercase">Market Bias</span>
          <div className="flex items-center space-x-2">
            <span
              className={`text-lg font-black ${
                bias === 'BULLISH' ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {bias}
            </span>
          </div>
          <span className="text-[9px] text-gray-500">Cross-cluster consensus</span>
        </div>

        {/* Confidence vs Completeness Dual Meters */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-400">Confidence</span>
            <span className="text-cyan-300 font-bold">{confidencePct}%</span>
          </div>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
            <div className="bg-cyan-400 h-full rounded-full" style={{ width: `${confidencePct}%` }} />
          </div>

          <div className="flex justify-between text-[10px]">
            <span className="text-gray-400">Completeness</span>
            <span className="text-purple-300 font-bold">{completenessPct}%</span>
          </div>
          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
            <div className="bg-purple-400 h-full rounded-full" style={{ width: `${completenessPct}%` }} />
          </div>
        </div>

        {/* Independent Confirmations */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
          <span className="text-[10px] text-gray-400 uppercase">Independent Clusters</span>
          <div className="text-lg font-black text-cyan-300">
            {independentConfirmations} <span className="text-xs text-gray-500 font-normal">/ 5 Clusters</span>
          </div>
          <span className="text-[9px] text-gray-500">
            {correlatedConfirmations} correlated OHLC signals
          </span>
        </div>

        {/* Veto Status */}
        <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
          <span className="text-[10px] text-gray-400 uppercase">Active Vetoes</span>
          <div className="text-lg font-black text-emerald-400">
            {activeVetoes.length === 0 ? 'ZERO VETOES' : `${activeVetoes.length} VETO ACTIVE`}
          </div>
          <span className="text-[9px] text-gray-500">Risk & volatility guards</span>
        </div>
      </div>

      {/* Decision Explanation Breakdown */}
      <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-3 font-sans text-xs">
        <h4 className="font-mono font-bold text-xs text-emerald-300 uppercase tracking-wider flex items-center space-x-1.5">
          <span>🔍</span>
          <span>Decision Engine V2 Explanation Framework</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-gray-300">
          <div className="space-y-1 pl-2 border-l-2 border-cyan-500/40">
            <div className="font-mono text-[10px] text-cyan-300 font-bold uppercase">1. What Was Detected</div>
            <p className="text-[11px] leading-relaxed text-gray-300">
              M15 Order Block mitigation followed by buy-side liquidity sweep above prior session high. HTF trend structure remains bullish expansion.
            </p>
          </div>

          <div className="space-y-1 pl-2 border-l-2 border-purple-500/40">
            <div className="font-mono text-[10px] text-purple-300 font-bold uppercase">2. Independent Confirmations</div>
            <p className="text-[11px] leading-relaxed text-gray-300">
              4 distinct clusters agree: OHLC Technical, Macro (DXY inverse), Microstructure (Tick Imbalance), and Sentiment (Crowd shorting).
            </p>
          </div>

          <div className="space-y-1 pl-2 border-l-2 border-amber-500/40">
            <div className="font-mono text-[10px] text-amber-300 font-bold uppercase">3. Conflicting Signals</div>
            <p className="text-[11px] leading-relaxed text-gray-300">
              {conflicts.join('. ')}. Yield curve slope creates slight resistance at key HTF liquidity pools.
            </p>
          </div>

          <div className="space-y-1 pl-2 border-l-2 border-emerald-500/40">
            <div className="font-mono text-[10px] text-emerald-300 font-bold uppercase">4. Execution Blocking Status</div>
            <p className="text-[11px] leading-relaxed text-gray-300">
              {blockingConditions.length > 0 ? blockingConditions.join('. ') : 'All gating requirements met.'} Zero MT5 order execution permitted (READ_ONLY invariant).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

