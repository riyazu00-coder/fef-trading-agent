'use client';

import React, { useState } from 'react';
import { LiveMarketAsset } from '@/lib/providers/real-market-api';

interface MultiSymbolSelectorProps {
  assets: Record<string, LiveMarketAsset>;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  glassIntensity?: 'GHOST_GLASS' | 'ULTRA_CLEAR' | 'CRYSTAL' | 'TINTED';
}

export const MultiSymbolSelector: React.FC<MultiSymbolSelectorProps> = ({
  assets,
  selectedSymbol,
  onSelectSymbol,
  glassIntensity = 'GHOST_GLASS'
}) => {
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'METALS' | 'COMMODITY' | 'FOREX' | 'CRYPTO'>('ALL');

  const assetList = Object.values(assets);
  const filteredAssets = filterCategory === 'ALL'
    ? assetList
    : assetList.filter((a) => a.category === filterCategory);

  const categories: Array<'ALL' | 'METALS' | 'COMMODITY' | 'FOREX' | 'CRYPTO'> = [
    'ALL',
    'METALS',
    'COMMODITY',
    'FOREX',
    'CRYPTO'
  ];

  const glassBg = glassIntensity === 'GHOST_GLASS'
    ? 'bg-black/15 backdrop-blur-[6px]'
    : glassIntensity === 'ULTRA_CLEAR'
    ? 'bg-black/25 backdrop-blur-md'
    : glassIntensity === 'TINTED'
    ? 'bg-black/60 backdrop-blur-xl'
    : 'bg-black/35 backdrop-blur-lg';

  return (
    <div className={`${glassBg} border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.3),inset_0_1px_1px_0_rgba(255,255,255,0.25)] rounded-2xl p-3 font-mono space-y-2 transition-all`}>
      {/* Top bar with categories and live status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 text-[10px]">
        <div className="flex items-center space-x-2">
          <span className="text-amber-400 font-bold drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]">⚡</span>
          <span className="font-bold text-white uppercase tracking-wider drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
            EXNESS MULTI-ASSET LIVE QUOTES
          </span>
          <span className="text-amber-300/90 text-[9px] hidden md:inline drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] font-semibold">
            (Exness Raw Spread Prices • Click to Switch Live Background Chart & Swarm)
          </span>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center space-x-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`px-2 py-0.5 rounded text-[8.5px] font-bold transition-all ${
                filterCategory === cat
                  ? 'bg-amber-400 text-black shadow-[0_0_12px_rgba(251,191,36,0.8)] font-black'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/15 backdrop-blur-sm drop-shadow'
              }`}
            >
              {cat}
            </button>
          ))}
          <span className="text-[8.5px] text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-400/50 font-bold ml-1 hidden sm:inline shadow-[0_0_8px_rgba(251,191,36,0.4)] backdrop-blur-sm">
            ● EXNESS BROKER FEED
          </span>
        </div>
      </div>

      {/* Horizontal Scrollable Symbol Cards with Ultra-Clear Glass */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-600">
        {filteredAssets.map((asset) => {
          const isSelected = selectedSymbol === asset.symbol;
          const isPositive = asset.change24h >= 0;

          return (
            <button
              key={asset.symbol}
              onClick={() => onSelectSymbol(asset.symbol)}
              className={`flex-shrink-0 px-3 py-2 rounded-xl border transition-all text-left flex items-center space-x-3 backdrop-blur-sm ${
                isSelected
                  ? 'bg-amber-950/40 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] ring-2 ring-amber-400/70 scale-[1.03]'
                  : 'bg-black/20 hover:bg-black/35 border-white/15 hover:border-amber-400/50'
              }`}
            >
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className={`font-black text-xs drop-shadow-[0_1px_3px_rgba(0,0,0,1)] ${isSelected ? 'text-amber-300' : 'text-white'}`}>
                    {asset.symbol}
                  </span>
                  <span className="text-[8px] text-gray-200 hidden sm:inline truncate max-w-[55px] drop-shadow">
                    {asset.category}
                  </span>
                  <span className="text-[7.5px] text-cyan-300 font-mono font-bold bg-cyan-950/50 px-1 rounded border border-cyan-500/30">
                    spr {asset.spread}
                  </span>
                </div>
                <div className="text-[11px] font-black text-white mt-0.5 font-mono drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
                  ${asset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
              </div>

              {/* Sparkline & Change */}
              <div className="text-right">
                <span
                  className={`text-[9px] font-bold block drop-shadow-[0_1px_3px_rgba(0,0,0,1)] ${
                    isPositive ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPositive ? '▲ +' : '▼ '}{asset.change24h}%
                </span>
                {/* Micro SVG Sparkline */}
                <svg viewBox="0 0 140 40" className="w-12 h-3 mt-0.5 opacity-95 filter drop-shadow">
                  <polyline
                    fill="none"
                    stroke={isPositive ? '#22c55e' : '#f43f5e'}
                    strokeWidth="3"
                    points={asset.sparkline}
                  />
                </svg>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
