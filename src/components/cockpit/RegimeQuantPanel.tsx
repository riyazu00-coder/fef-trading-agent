'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const RegimeQuantPanel: React.FC = () => {
  const { activeSymbol, assetProfile, liveFeeds } = useActiveAsset();

  const regime = assetProfile.regimeAssessment || liveFeeds?.regime;
  const quant = assetProfile.quantMetrics || liveFeeds?.quant?.metrics;
  const analogue = assetProfile.historicalAnalogue || liveFeeds?.quant?.analogue;

  return (
    <div className="ghost-glass-panel rounded-2xl p-3 sm:p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            MARKET REGIME & QUANT FOUNDATION ({activeSymbol})
          </h3>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[8px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-bold uppercase font-mono">
            MULTI-DIMENSIONAL REGIME
          </span>
          <span className="text-[8px] bg-purple-950/60 text-purple-300 border border-purple-500/40 px-1.5 py-0.5 rounded font-bold uppercase font-mono">
            HISTORICAL ANALOGUES
          </span>
        </div>
      </div>

      {/* 1. Market Regime Matrix */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase">
          <span>Active Classification Matrix</span>
          <span className="text-cyan-400 font-mono">
            Confidence: {regime ? `${regime.confidence}%` : 'DATA LIMITED'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Trend Regime */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1">
            <span className="text-[8.5px] text-gray-400 uppercase font-bold">Trend Regime</span>
            <div className="text-xs font-bold text-white truncate">
              {regime?.trendRegime || 'UNKNOWN'}
            </div>
            <span className="text-[8px] text-gray-500 block">Structure & Momentum</span>
          </div>

          {/* Volatility Regime */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1">
            <span className="text-[8.5px] text-gray-400 uppercase font-bold">Volatility State</span>
            <div className={`text-xs font-bold truncate ${
              regime?.volatilityRegime === 'HIGH_VOLATILITY' ? 'text-rose-400' :
              regime?.volatilityRegime === 'LOW_VOLATILITY' ? 'text-cyan-300' : 'text-emerald-300'
            }`}>
              {regime?.volatilityRegime || 'NORMAL_VOLATILITY'}
            </div>
            <span className="text-[8px] text-gray-500 block">ATR Expansion Band</span>
          </div>

          {/* Risk Appetite */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1">
            <span className="text-[8.5px] text-gray-400 uppercase font-bold">Risk Appetite</span>
            <div className={`text-xs font-bold truncate ${
              regime?.riskRegime === 'RISK_ON' ? 'text-emerald-300' :
              regime?.riskRegime === 'RISK_OFF' ? 'text-rose-400' : 'text-amber-300'
            }`}>
              {regime?.riskRegime || 'MIXED_RISK'}
            </div>
            <span className="text-[8px] text-gray-500 block">Equities & Intermarket Beta</span>
          </div>

          {/* Macro Environment */}
          <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 space-y-1">
            <span className="text-[8.5px] text-gray-400 uppercase font-bold">Macro Setting</span>
            <div className="text-xs font-bold text-purple-300 truncate">
              {regime?.macroRegime || 'RESTRICTIVE'}
            </div>
            <span className="text-[8px] text-gray-500 block">Yield & Policy Backdrop</span>
          </div>
        </div>

        {regime?.regimeSummary && (
          <div className="bg-black/30 border border-white/5 rounded-xl p-2 text-[10px] text-gray-300">
            <span className="font-bold text-gray-400 uppercase mr-1.5">Contextual Summary:</span>
            {regime.regimeSummary}
          </div>
        )}
      </div>

      {/* 2. Quant Foundation & Historical Analogue Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 border-t border-white/5">
        {/* Quant Statistics */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-[9.5px] font-bold text-gray-400 uppercase">
            <span>Quantitative Metrics</span>
            <span className="text-cyan-400 font-mono">Sample: n={quant?.sampleCount || 0} bars</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-0.5">
              <span className="text-[8.5px] text-gray-400 block uppercase">Annualized Vol</span>
              <span className="text-sm font-bold text-white">
                {quant?.annualizedVolatilityPct !== undefined ? `${quant.annualizedVolatilityPct}%` : '—'}
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[8.5px] text-gray-400 block uppercase">Max Drawdown</span>
              <span className="text-sm font-bold text-rose-400">
                {quant?.maxDrawdownPct !== undefined ? `${quant.maxDrawdownPct}%` : '—'}
              </span>
            </div>
            <div className="space-y-0.5">
              <span className="text-[8.5px] text-gray-400 block uppercase">Sharpe Proxy</span>
              <span className="text-sm font-bold text-emerald-300">
                {quant?.sharpeRatioProxy !== undefined ? quant.sharpeRatioProxy : '—'}
              </span>
            </div>
          </div>
          <p className="text-[8.5px] text-gray-500 leading-tight">
            Log-returns distribution over verified historical candle series. Zero look-ahead bias.
          </p>
        </div>

        {/* Historical Analogue Matching */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-[9.5px] font-bold text-gray-400 uppercase">
            <span>Historical Analogue Engine</span>
            <span className="text-purple-300 font-mono">Matches: n={analogue?.matchedSampleCount || 0}</span>
          </div>
          {analogue && analogue.status === 'VALID' ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-400">Forward 5D Median Return:</span>
                <span className={`font-bold font-mono ${
                  (analogue.forward5dMedianReturnPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {analogue.forward5dMedianReturnPct !== undefined ? `${analogue.forward5dMedianReturnPct > 0 ? '+' : ''}${analogue.forward5dMedianReturnPct}%` : 'N/A'}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-400">5D Positive Frequency:</span>
                <span className="font-bold font-mono text-cyan-300">
                  {analogue.positiveOutcomeFrequency5dPct !== undefined ? `${analogue.positiveOutcomeFrequency5dPct}%` : 'N/A'}
                </span>
              </div>
              <p className="text-[8.5px] text-amber-300/80 leading-tight">
                {analogue.limitationsNotice}
              </p>
            </div>
          ) : (
            <div className="text-center py-2 space-y-1">
              <span className="text-[10px] text-amber-400 font-bold block uppercase">Insufficient Historical Analogue Sample</span>
              <p className="text-[8.5px] text-gray-500">
                Fails closed to prevent overfitting on unverified historical conditions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

