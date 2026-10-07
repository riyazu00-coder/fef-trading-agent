'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const MacroCrossAssetPanel: React.FC = () => {
  const { activeSymbol, assetProfile, liveFeeds } = useActiveAsset();

  const macroDetails = liveFeeds?.macroDetails;
  const xauusdMacro = liveFeeds?.xauusdMacro;
  const crossAsset = assetProfile.crossAssetMatrix || liveFeeds?.crossAsset;

  const isGold = activeSymbol === 'XAUUSD';
  const yc = macroDetails?.yieldCurve;
  const fp = macroDetails?.fedPolicy;
  const ty = macroDetails?.tenYearYield;
  const ry = macroDetails?.realYield;
  const bei = macroDetails?.breakeven;

  const hasMacroData = Boolean(yc || fp || ty || ry || bei || xauusdMacro);

  return (
    <div className="ghost-glass-panel rounded-2xl p-3 sm:p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            MACRO & CROSS-ASSET INTELLIGENCE ({activeSymbol})
          </h3>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[8px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-bold uppercase font-mono">
            {isGold ? 'OFFICIAL FRED SERIES' : 'INTERMARKET CONTEXT'}
          </span>
          <span className="text-[8px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-bold font-mono">
            INDEPENDENT VERIFIED
          </span>
        </div>
      </div>

      {!hasMacroData ? (
        <div className="bg-black/40 border border-amber-500/20 rounded-xl p-3 text-center space-y-1">
          <p className="text-xs text-amber-300 font-bold uppercase">Macro Intelligence Data Limited</p>
          <p className="text-[10px] text-gray-400">
            Awaiting synchronized macro telemetry from Federal Reserve Economic Data (FRED).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Key Rates & Yield Curve Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* 10Y Yield */}
            <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-gray-400 uppercase">
                <span>10Y Yield (DGS10)</span>
                <span className="text-cyan-400 font-bold">{ty?.direction || 'N/A'}</span>
              </div>
              <div className="text-base font-bold text-white tracking-tight">
                {ty?.latestValue !== undefined ? `${ty.latestValue}%` : 'DATA LIMITED'}
              </div>
              <div className="flex items-center justify-between text-[8px] text-gray-400 font-mono">
                <span>Δ1: {ty?.change1Bp !== undefined ? `${ty.change1Bp > 0 ? '+' : ''}${ty.change1Bp} bp` : '—'}</span>
                <span>Obs: {ty?.latestObservationDate || '—'}</span>
              </div>
            </div>

            {/* 10Y Real Yield */}
            <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-gray-400 uppercase">
                <span>10Y Real Yield (DFII10)</span>
                <span className={ry?.direction === 'FALLING' ? 'text-emerald-400 font-bold' : ry?.direction === 'RISING' ? 'text-rose-400 font-bold' : 'text-gray-400'}>
                  {ry?.direction || 'N/A'}
                </span>
              </div>
              <div className="text-base font-bold text-white tracking-tight">
                {ry?.latestValue !== undefined ? `${ry.latestValue}%` : 'DATA LIMITED'}
              </div>
              <div className="flex items-center justify-between text-[8px] text-gray-400 font-mono">
                <span>Gold Impact: {ry?.direction === 'FALLING' ? 'BULLISH' : ry?.direction === 'RISING' ? 'BEARISH' : 'NEUTRAL'}</span>
                <span>Δ1: {ry?.change1Bp !== undefined ? `${ry.change1Bp > 0 ? '+' : ''}${ry.change1Bp} bp` : '—'}</span>
              </div>
            </div>

            {/* 10Y-2Y Curve Spread */}
            <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-gray-400 uppercase">
                <span>10Y-2Y Curve</span>
                <span className={yc?.curveState === 'INVERTED' ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {yc?.curveState || 'N/A'}
                </span>
              </div>
              <div className="text-base font-bold text-white tracking-tight">
                {yc?.spreadBp !== undefined ? `${yc.spreadBp > 0 ? '+' : ''}${yc.spreadBp} bp` : 'DATA LIMITED'}
              </div>
              <div className="flex items-center justify-between text-[8px] text-gray-400 font-mono">
                <span>State: {yc?.curveDirection || 'STABLE'}</span>
                <span>Obs: {yc?.observationDate || '—'}</span>
              </div>
            </div>

            {/* Breakeven Inflation */}
            <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[9px] text-gray-400 uppercase">
                <span>10Y Breakeven (T10YIE)</span>
                <span className="text-cyan-400 font-bold">{bei?.direction || 'N/A'}</span>
              </div>
              <div className="text-base font-bold text-white tracking-tight">
                {bei?.latestValue !== undefined ? `${bei.latestValue}%` : 'DATA LIMITED'}
              </div>
              <div className="flex items-center justify-between text-[8px] text-gray-400 font-mono">
                <span>Expected Inflation</span>
                <span>Δ1: {bei?.change1Bp !== undefined ? `${bei.change1Bp > 0 ? '+' : ''}${bei.change1Bp} bp` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Fed Policy Target Corridor */}
          {fp && (
            <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-bold text-gray-200 uppercase tracking-wider text-[10px]">
                  Federal Reserve Policy Corridor:
                </span>
                <span className="text-cyan-300 font-bold text-[11px]">
                  {fp.targetLower.toFixed(2)}% – {fp.targetUpper.toFixed(2)}% (Midpoint: {fp.targetMidpoint.toFixed(3)}%)
                </span>
              </div>
              <div className="flex items-center space-x-2 text-[10px]">
                <span className="bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded font-mono">
                  {fp.policyState.replace('_', ' ')}
                </span>
                <span className="text-gray-400 text-[9px]">
                  Descriptive analysis only • Zero predictive bias
                </span>
              </div>
            </div>
          )}

          {/* Cross-Asset Intermarket Relationships */}
          <div className="space-y-1.5">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
              <span>Verified Intermarket Correlations (Base: {activeSymbol})</span>
              <span className="text-[9px] text-gray-500">Zero Synthetic Correlations • Rolling Pearson Matrix</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {crossAsset && Object.entries(crossAsset.relationships).map(([key, rel]) => (
                <div key={key} className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-[11px]">{rel.targetSymbol}</span>
                    <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-bold font-mono ${
                      rel.status === 'VERIFIED'
                        ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                        : rel.status === 'DATA_LIMITED'
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                        : 'bg-gray-800 text-gray-400 border border-gray-600'
                    }`}>
                      {rel.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-gray-300">
                    <span>Rolling Pearson: {rel.rollingCorrelation !== undefined ? rel.rollingCorrelation.toFixed(3) : 'N/A'}</span>
                    <span>Sample Size: n={rel.sampleCount}</span>
                  </div>
                  <p className="text-[9.5px] text-gray-400 leading-tight">
                    {rel.notes}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

