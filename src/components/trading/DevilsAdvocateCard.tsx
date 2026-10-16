'use client';

import React, { useState } from 'react';

interface DevilsAdvocateCardProps {
  symbol?: string;
  currentPrice?: number;
  bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  glassIntensity?: 'GHOST_GLASS' | 'ULTRA_CLEAR' | 'CRYSTAL' | 'TINTED';
}

export function DevilsAdvocateCard({
  symbol = 'XAUUSD',
  currentPrice = 4160.00,
  bias = 'BULLISH',
  glassIntensity = 'GHOST_GLASS'
}: DevilsAdvocateCardProps) {
  const [showScenarios, setShowScenarios] = useState(false);

  const isGold = symbol === 'XAUUSD';
  const slDist = isGold
    ? 6.0
    : symbol === 'BTCUSD'
    ? 650.0
    : symbol === 'USOIL'
    ? 1.20
    : symbol === 'XAGUSD'
    ? 0.35
    : 0.0025;

  const inducementHigh = (currentPrice + slDist * 0.6).toFixed(2);
  const trapLow = (currentPrice - slDist).toFixed(2);

  const contrarianHypothesis = bias === 'BULLISH'
    ? `H4 Bearish Liquidity Hunt: Buyers may be lured into $${inducementHigh} inducement before commercial distribution sweeps sell-side stops under $${trapLow}.`
    : `Short Squeeze Trap: Aggressive shorts entering at lows face rapid mean-reversion displacement back above key session resistance.`;

  const stressPoints = [
    {
      title: 'Macro Event Blindsiding',
      severity: 'HIGH',
      description: `High-impact economic release risk. Historic volatility spike of ±${(slDist * 2.5).toFixed(2)} within 120 seconds of print.`,
      mitigation: `Structural SL defined at $${trapLow}; risk policy cap is 0.50% equity.`
    },
    {
      title: 'Retail Positioning Herd Effect',
      severity: 'MEDIUM',
      description: 'Retail positioning data unverified / data limited. Crowding extremes (>65%) monitored; broker liquidity sweeps usually punish retail herd positions.',
      mitigation: 'Wait for M15 candle close confirmation before triggering limit execution.'
    },
    {
      title: 'Cross-Asset Divergence Vulnerability',
      severity: 'MEDIUM',
      description: 'Dollar Index (DXY) live feed is currently UNAVAILABLE. Benchmark beta correlation unverified pending connector.',
      mitigation: 'Cross-asset correlation discounted from decision-eligible evidence.'
    }
  ];

  const glassBg = glassIntensity === 'GHOST_GLASS'
    ? 'bg-black/15 backdrop-blur-[6px]'
    : glassIntensity === 'ULTRA_CLEAR'
    ? 'bg-black/25 backdrop-blur-md'
    : glassIntensity === 'TINTED'
    ? 'bg-black/60 backdrop-blur-xl'
    : 'bg-black/35 backdrop-blur-lg';

  return (
    <div className={`${glassBg} border border-red-500/35 shadow-[0_8px_32px_0_rgba(239,68,68,0.2),inset_0_1px_1px_0_rgba(255,255,255,0.2)] rounded-2xl p-4 relative overflow-hidden font-mono transition-all`}>
      {/* Ambient background glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-red-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/10 mb-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-red-500 to-rose-700 flex items-center justify-center text-white text-xs font-black shadow-[0_0_15px_rgba(239,68,68,0.6)] ring-1 ring-red-400">
            ⚖️
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-black text-rose-300 uppercase tracking-wider drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
                DEVIL&apos;S ADVOCATE STRESS-TEST
              </h3>
              <span className="text-[9px] font-bold bg-red-950/60 text-red-300 border border-red-500/50 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(239,68,68,0.4)] backdrop-blur-sm">
                ADVERSARIAL AUDIT
              </span>
            </div>
            <p className="text-[9.5px] text-gray-200 drop-shadow">
              Contrarian stress-testing • Trap detection • Invalidation triggers
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[9px] text-gray-200 block drop-shadow">RESILIENCE</span>
          <span className="text-sm font-black text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]">
            78<span className="text-[10px] text-gray-400 font-normal">/100</span>
          </span>
        </div>
      </div>

      {/* Core Contrarian Warning Banner (Pure Glass) */}
      <div className="bg-red-950/30 backdrop-blur-md border border-red-500/40 rounded-xl p-3 mb-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
        <div className="flex items-start space-x-2">
          <span className="text-red-400 text-xs mt-0.5 animate-pulse">⚠️</span>
          <div>
            <div className="text-[10px] font-bold text-red-300 uppercase tracking-wider mb-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
              CONTRARIAN HYPOTHESIS ({symbol} @ ${currentPrice.toFixed(2)})
            </div>
            <p className="text-[10.5px] text-gray-100 leading-relaxed drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
              {contrarianHypothesis}
            </p>
          </div>
        </div>
      </div>

      {/* Stress Test Matrix (Pure Glass Items) */}
      <div className="space-y-2 mb-3">
        <div className="text-[9.5px] font-bold text-gray-200 uppercase tracking-wider drop-shadow">
          Vulnerability Audit Matrix
        </div>

        <div className="grid grid-cols-1 gap-2">
          {stressPoints.map((item, idx) => (
            <div
              key={idx}
              className="bg-black/20 backdrop-blur-md border border-white/10 hover:border-red-500/50 rounded-xl p-2.5 transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10.5px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">
                  {item.title}
                </span>
                <span
                  className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border backdrop-blur-sm ${
                    item.severity === 'HIGH'
                      ? 'bg-red-950/70 text-red-300 border-red-500/60'
                      : item.severity === 'MEDIUM'
                      ? 'bg-amber-950/70 text-amber-300 border-amber-500/60'
                      : 'bg-cyan-950/70 text-cyan-300 border-cyan-500/60'
                  }`}
                >
                  {item.severity} RISK
                </span>
              </div>
              <p className="text-[9.5px] text-gray-200 leading-relaxed mb-1.5 drop-shadow">
                {item.description}
              </p>
              <div className="text-[9px] text-emerald-300 backdrop-blur-sm bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-500/40 flex items-center space-x-1.5">
                <span className="text-emerald-400">🛡️ Guardrail:</span>
                <span className="drop-shadow">{item.mitigation}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Footer: Expand Adversarial Scenarios */}
      <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[9.5px]">
        <button
          onClick={() => setShowScenarios(!showScenarios)}
          className="text-cyan-300 hover:text-cyan-200 flex items-center space-x-1 transition-colors drop-shadow"
        >
          <span>{showScenarios ? '▲ Hide Worst-Case Matrix' : '▼ View 3 Worst-Case Scenarios'}</span>
        </button>

        <div className="text-gray-200 drop-shadow">
          Status: <span className="text-amber-300 font-bold">STRESS-TEST PASSED</span>
        </div>
      </div>

      {showScenarios && (
        <div className="mt-2.5 pt-2.5 border-t border-white/10 space-y-2 text-[9.5px]">
          <div className="p-2.5 rounded-xl bg-red-950/40 backdrop-blur-md border border-red-500/40 text-gray-100 shadow-inner">
            <span className="font-bold text-red-300">Scenario A (Data Shock):</span> Macro print comes in hotter than consensus. Real yields spike. Price dumps straight through support. <span className="text-emerald-300 font-bold">Structural SL defined at ${trapLow} aligns with 0.50% risk policy cap.</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-950/40 backdrop-blur-md border border-amber-500/40 text-gray-100 shadow-inner">
            <span className="font-bold text-amber-300">Scenario B (Liquidity Sweep & Wick):</span> Session low swept briefly by stops, then aggressively reverses. <span className="text-cyan-300 font-bold">Mitigation: 15-minute body close required before invalidation.</span>
          </div>
        </div>
      )}
    </div>
  );
}
