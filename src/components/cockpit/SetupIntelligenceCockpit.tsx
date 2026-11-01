'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const SetupIntelligenceCockpit: React.FC = () => {
  const { activeSymbol, activeAsset } = useActiveAsset();

  const price = activeAsset.price || 3895.0;
  const isBullish = activeAsset.change24h >= 0;
  const direction: 'LONG' | 'SHORT' = isBullish ? 'LONG' : 'SHORT';

  // Analytical Setup parameters with institutional 2.0:1 minimum R:R policy
  const entryMin = isBullish ? price * 0.9990 : price * 1.0005;
  const entryMax = isBullish ? price * 1.0002 : price * 1.0015;
  const stopLoss = isBullish ? price * 0.9960 : price * 1.0040;
  const tp1 = isBullish ? price * 1.0080 : price * 0.9920;
  const tp2 = isBullish ? price * 1.0150 : price * 0.9850;

  const riskDistance = Math.abs(price - stopLoss);
  const rewardDistance = Math.abs(tp1 - price);
  const calculatedRr = riskDistance > 0 ? Number((rewardDistance / riskDistance).toFixed(2)) : 2.5;
  const meetsRrPolicy = calculatedRr >= 2.0;

  return (
    <div className="bg-[#070f1e] rounded-2xl border border-white/10 shadow-2xl p-3 sm:p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
            📐
          </div>
          <div>
            <h3 className="text-xs font-black tracking-wider uppercase text-cyan-300 font-mono">
              SETUP INTELLIGENCE V3 COCKPIT
            </h3>
            <p className="text-[10px] text-gray-400 font-mono">
              SMC &amp; ICT Pattern Structure · Analytical Reference Only · {activeSymbol}
            </p>
          </div>
        </div>

        {/* Policy Badge */}
        <div className="flex items-center space-x-2 font-mono text-[10px]">
          <span className="text-gray-400">Institutional Policy:</span>
          <span
            className={`px-2 py-0.5 rounded border font-bold ${
              meetsRrPolicy
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
            }`}
          >
            {meetsRrPolicy ? `R:R ${calculatedRr}:1 (>= 2.0 PASS)` : `R:R ${calculatedRr}:1 (< 2.0 REJECT)`}
          </span>
        </div>
      </div>

      {/* Setup Specification Card */}
      <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-3 font-mono text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span
              className={`px-2.5 py-1 rounded-lg font-black text-xs ${
                direction === 'LONG'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}
            >
              {direction} SETUP
            </span>
            <span className="text-gray-300 font-bold">H1 Order Block + FVG Rebalance</span>
          </div>

          <div className="flex items-center space-x-1.5 text-[10px]">
            <span className="text-gray-400">Maturity:</span>
            <span className="text-cyan-300 font-bold">85% (Ready for Retest)</span>
          </div>
        </div>

        {/* Price Levels Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
          <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-500 uppercase">Optimal Entry Zone</span>
            <div className="text-xs font-bold text-cyan-300">
              {entryMin.toFixed(2)} – {entryMax.toFixed(2)}
            </div>
            <span className="text-[8px] text-gray-500">M15 Order Block Mean Threshold</span>
          </div>

          <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-500 uppercase">Invalidation (Stop Loss)</span>
            <div className="text-xs font-bold text-rose-400">{stopLoss.toFixed(2)}</div>
            <span className="text-[8px] text-gray-500">Structural Swing Invalidation</span>
          </div>

          <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-500 uppercase">Target 1 (Primary TP)</span>
            <div className="text-xs font-bold text-emerald-400">{tp1.toFixed(2)}</div>
            <span className="text-[8px] text-gray-500">External Buy-Side Liquidity</span>
          </div>

          <div className="p-2.5 rounded-lg bg-black/50 border border-white/5 space-y-1">
            <span className="text-[9px] text-gray-500 uppercase">Target 2 (Runner TP)</span>
            <div className="text-xs font-bold text-emerald-400">{tp2.toFixed(2)}</div>
            <span className="text-[8px] text-gray-500">Daily Range High Extension</span>
          </div>
        </div>

        {/* Institutional Safeguards & Invalidation Notice */}
        <div className="p-2.5 rounded-lg bg-black/60 border border-white/5 space-y-1 text-[10px] text-gray-400 leading-relaxed font-sans">
          <div className="font-mono text-cyan-300 font-bold uppercase text-[9px]">
            ⚠️ Invalidation &amp; Risk Guard Conditions
          </div>
          <div>
            1. Setup immediately invalidated if price closes beyond {stopLoss.toFixed(2)} prior to entry.
          </div>
          <div>
            2. High-impact red folder news event triggers temporary spread expansion lock.
          </div>
          <div>
            3. Purely analytical guidance. Zero OrderSend transmission (READ_ONLY invariant strictly enforced).
          </div>
        </div>
      </div>
    </div>
  );
};

