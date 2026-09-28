'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import {
  MARKET_REGISTRY,
  getPriorityMarkets,
  getMarketsByCategory,
  MarketDefinition
} from '@/lib/registry/market-registry';

import { evaluateMarketSession } from '@/lib/session/market-session-engine';

export const LiveTickerStrip: React.FC = () => {
  const { activeSymbol, setActiveSymbol, allAssets, categoryFilter } = useActiveAsset();

  // Resolve active market list according to selected category filter
  const activeMarkets: MarketDefinition[] = React.useMemo(() => {
    if (categoryFilter === 'ALL' || categoryFilter === 'BROKER FEED' || categoryFilter === 'EXNESS FEED') {
      return getPriorityMarkets();
    }
    return getMarketsByCategory(categoryFilter);
  }, [categoryFilter]);

  return (
    <div className="flex items-center gap-2 w-full overflow-x-auto scrollbar-none py-0.5">
        {activeMarkets.length === 0 ? (
          <div className="flex items-center space-x-3 px-4 py-2 rounded-xl bg-[#081224]/90 border border-cyan-500/20 text-[11px] font-mono w-full">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="text-amber-300 font-bold uppercase">NO CONNECTED {categoryFilter} FEEDS</span>
            <span className="text-gray-400">— Connect a provider or enable available demo instruments.</span>
          </div>
        ) : (
          activeMarkets.map((item) => {
            const isSelected = activeSymbol === item.symbol;
            const liveData = allAssets[item.symbol];
            const p = liveData ? liveData.price : item.basePrice;
            const change = liveData ? liveData.change24h : item.typicalDailyChangePct;
            const isPositive = change >= 0;
            const session = evaluateMarketSession(item.symbol);

            const formatPrice = (val: number, dec: number) => {
              if (item.category === 'CRYPTO' || item.category === 'INDICES') {
                return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              }
              if (item.category === 'METALS' || item.category === 'COMMODITIES') {
                return `$${val.toFixed(dec)}`;
              }
              return val.toFixed(dec);
            };

            const points = item.sparklineBaseline || [p, p];
            const min = Math.min(...points);
            const max = Math.max(...points);
            const range = max - min || 1;

            const pathData = points
              .map((val, idx) => {
                const x = (idx / (points.length - 1)) * 48;
                const y = 18 - ((val - min) / range) * 14;
                return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
              })
              .join(' ');

            return (
              <button
                key={item.symbol}
                onClick={() => setActiveSymbol(item.symbol)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all text-left min-w-[172px] flex-shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#07101D] border-[#22D3EE] shadow-[0_0_15px_rgba(34,211,238,0.35)] ring-1 ring-[#22D3EE]/50'
                    : 'bg-[#07101D]/75 hover:bg-[#07101D] border-white/10 hover:border-[#22D3EE]/40'
                }`}
                title={`${item.symbol} • ${session.sessionName} (${session.statusLabel})`}
              >
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-sans font-bold text-[#F8FAFC] text-[11px] tracking-wider">
                      {item.symbol}
                    </span>
                    {/* Compact Session Dot */}
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        session.isOpen
                          ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                          : session.marketState === 'PRE_OPEN' || session.marketState === 'DAILY_BREAK'
                          ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                          : 'bg-rose-400/80 shadow-[0_0_6px_rgba(251,113,133,0.6)]'
                      }`}
                    />
                    <span className="font-mono font-bold text-[#F8FAFC] text-[10px]">
                      {formatPrice(p, item.decimalPrecision)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span className="text-[8px] font-sans uppercase text-[#94A3B8] bg-white/5 px-1 py-0.2 rounded border border-white/5 font-semibold">
                      {item.category}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-bold ${
                        isPositive ? 'text-[#34D399]' : 'text-[#FB7185]'
                      }`}
                    >
                      {isPositive ? '▲ +' : '▼ '}
                      {change}%
                    </span>
                    {!session.isOpen && (
                      <span className="text-[7.5px] font-mono uppercase text-rose-400/90 font-bold">
                        {session.marketState === 'WEEKEND_CLOSED' ? 'WKD' : 'CLS'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Micro Sparkline */}
                <div className="w-11 h-5 ml-2">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 48 20">
                    <path
                      d={pathData}
                      fill="none"
                      stroke={isPositive ? '#34D399' : '#FB7185'}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </button>
            );
          })
        )}
    </div>
  );
};

export { MarketCategoryFilterBar } from './MarketCategoryFilterBar';
