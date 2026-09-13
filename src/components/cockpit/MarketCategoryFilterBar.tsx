'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const MARKET_CATEGORIES = [
  'ALL',
  'METALS',
  'FOREX',
  'INDICES',
  'COMMODITIES',
  'CRYPTO',
  'EXNESS FEED',
] as const;

export const MarketCategoryFilterBar: React.FC = () => {
  const { categoryFilter, setCategoryFilter } = useActiveAsset();

  return (
    <div className="flex items-center overflow-x-auto scrollbar-none w-full py-0.5">
      <div
        className="inline-flex items-center space-x-1 bg-[#081224]/90 p-1 rounded-xl border border-white/10 text-[9.5px] font-mono overflow-x-auto scrollbar-none"
        role="tablist"
        aria-label="Market category filter"
      >
        {MARKET_CATEGORIES.map((cat) => {
          const isSelected = categoryFilter === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-lg transition-all font-bold whitespace-nowrap cursor-pointer ${
                isSelected
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/60 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                  : 'text-gray-400 hover:text-white border border-transparent'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
};
