'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const MarketOverviewCard: React.FC = () => {
  const { activeAsset, timeframe, setTimeframe, assetProfile } = useActiveAsset();
  const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

  const isPos = activeAsset.change24h >= 0;
  const isForex = activeAsset.category === 'FOREX';
  const priceDisplay = isForex
    ? `$${activeAsset.price.toFixed(4)}`
    : `$${activeAsset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            MARKET OVERVIEW
          </h3>
        </div>
        <span className="text-[8px] bg-white/5 text-gray-400 px-2 py-0.5 rounded border border-white/5">
          {activeAsset.category}
        </span>
      </div>

      {/* Asset Info & Main Price */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isPos ? 'bg-emerald-400' : 'bg-rose-400'} inline-block`} />
              <span className="text-sm font-black text-white tracking-wide">{activeAsset.symbol}</span>
            </div>
            <p className="text-[9.5px] text-gray-400">{activeAsset.name}</p>
          </div>

          <div className="text-right text-[9px] text-gray-300 space-y-0.5">
            <div>Spread: <span className="text-cyan-300 font-bold">{activeAsset.spread}</span></div>
            <div>Day High: <span className="text-white font-bold">{isForex ? activeAsset.high24h.toFixed(4) : activeAsset.high24h.toLocaleString()}</span></div>
            <div>Day Low: <span className="text-white font-bold">{isForex ? activeAsset.low24h.toFixed(4) : activeAsset.low24h.toLocaleString()}</span></div>
            <div>Session: <span className="text-amber-300 font-bold">{assetProfile.session}</span></div>
          </div>
        </div>

        <div className="pt-1 flex items-baseline space-x-2">
          <span className="text-2xl font-black text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
            {priceDisplay}
          </span>
        </div>

        <div className={`text-[10px] font-bold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isPos ? '▲ +' : '▼ '}{activeAsset.change24h}% ({isPos ? '+' : ''}{(activeAsset.price * (activeAsset.change24h / 100)).toFixed(2)})
        </div>
      </div>

      {/* Mini Area Chart (Adapts color & shape based on asset trend) */}
      <div className="w-full h-14 relative overflow-hidden rounded-xl bg-black/40 border border-white/5 p-1">
        <svg className="w-full h-full" viewBox="0 0 240 50" preserveAspectRatio="none">
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPos ? '#10b981' : '#f43f5e'} stopOpacity="0.4" />
              <stop offset="100%" stopColor={isPos ? '#10b981' : '#f43f5e'} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d={isPos
              ? "M 0 45 Q 60 40, 120 20 T 180 15 T 240 8 L 240 50 L 0 50 Z"
              : "M 0 15 Q 40 10, 80 25 T 160 40 T 240 32 L 240 50 L 0 50 Z"
            }
            fill="url(#areaGrad)"
          />
          <path
            d={isPos
              ? "M 0 45 Q 60 40, 120 20 T 180 15 T 240 8"
              : "M 0 15 Q 40 10, 80 25 T 160 40 T 240 32"
            }
            fill="none"
            stroke={isPos ? '#10b981' : '#f43f5e'}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Timeframe Switcher (Includes M30 and W1) */}
      <div className="flex items-center justify-between gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-[9px]">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`flex-1 py-1 rounded-lg font-bold transition-all text-center cursor-pointer ${
              timeframe === tf
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400 font-bold shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* MARKET CONTEXT */}
      <div className="space-y-1.5 pt-1 border-t border-white/10 text-[10px]">
        <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mb-1 flex items-center justify-between">
          <span>MARKET CONTEXT ({timeframe})</span>
          <span className="text-[8px] text-cyan-400 font-normal">{activeAsset.source}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-emerald-400 font-bold">↗</span>
            <span>Trend</span>
          </span>
          <span className="text-emerald-400 font-bold">{assetProfile.trend}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-cyan-400 font-bold">∿</span>
            <span>Volatility</span>
          </span>
          <span className="text-cyan-300 font-bold">{assetProfile.volatility}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-gray-400 font-bold">🎯</span>
            <span>Session</span>
          </span>
          <span className="text-gray-200">{assetProfile.session}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-rose-400 font-bold">⚠️</span>
            <span>News Risk</span>
          </span>
          <span className="text-rose-400 font-bold">{assetProfile.newsRisk}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-cyan-400 font-bold">💧</span>
            <span>Liquidity</span>
          </span>
          <span className="text-cyan-300 font-bold">{assetProfile.liquidity}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-blue-400 font-bold">⚛</span>
            <span>Market Regime</span>
          </span>
          <span className="text-blue-300 font-bold truncate max-w-[140px] text-right">{assetProfile.regime}</span>
        </div>
      </div>
    </div>
  );
};
