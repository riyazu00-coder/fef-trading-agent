'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import {
  MARKET_REGISTRY,
  searchMarkets,
  MarketDefinition
} from '@/lib/registry/market-registry';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';

function MarketsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setActiveSymbol, activeSymbol, allAssets, setCategoryFilter } = useActiveAsset();
  const [search, setSearch] = useState('');

  const categories = ['ALL', 'METALS', 'FOREX', 'INDICES', 'COMMODITIES', 'CRYPTO'] as const;

  // Single source of truth: resolve category directly from searchParams
  const queryCategory = searchParams.get('category')?.toUpperCase();
  const selectedCategory = (queryCategory && (categories as readonly string[]).includes(queryCategory))
    ? queryCategory
    : 'ALL';

  // Synchronize categoryFilter in context whenever selectedCategory changes
  React.useEffect(() => {
    setCategoryFilter(selectedCategory);
  }, [selectedCategory, setCategoryFilter]);

  const handleCategorySelect = (cat: string) => {
    setCategoryFilter(cat);
    if (cat === 'ALL') {
      router.push('/markets');
    } else {
      router.push(`/markets?category=${cat.toLowerCase()}`);
    }
  };

  // Dynamically resolve filtered markets using central canonical registry with alias support
  const filteredMarkets: MarketDefinition[] = useMemo(() => {
    return searchMarkets(search, selectedCategory);
  }, [search, selectedCategory]);

  const handleRowClick = (symbol: string) => {
    setActiveSymbol(symbol);
    router.push(`/markets/${symbol}`);
  };

  const handleCockpitClick = (symbol: string) => {
    setActiveSymbol(symbol);
    router.push('/cockpit');
  };

  const totalMarkets = Object.values(MARKET_REGISTRY).length;
  const liveFeedsCount = Object.values(MARKET_REGISTRY).filter((m) => m.feedStatus === 'LIVE').length;
  const categoryLiveCount = filteredMarkets.filter((m) => m.feedStatus === 'LIVE').length;

  const categoryCounts = useMemo<Record<string, number>>(() => ({
    ALL: totalMarkets,
    METALS: Object.values(MARKET_REGISTRY).filter((m) => m.category === 'METALS').length,
    FOREX: Object.values(MARKET_REGISTRY).filter((m) => m.category === 'FOREX').length,
    INDICES: Object.values(MARKET_REGISTRY).filter((m) => m.category === 'INDICES').length,
    COMMODITIES: Object.values(MARKET_REGISTRY).filter((m) => m.category === 'COMMODITIES').length,
    CRYPTO: Object.values(MARKET_REGISTRY).filter((m) => m.category === 'CRYPTO').length,
  }), [totalMarkets]);

  const headerTitle = selectedCategory === 'ALL'
    ? 'INSTITUTIONAL MARKETS DIRECTORY'
    : `${selectedCategory} DIRECTORY`;

  const headerBadge = search.trim()
    ? `${filteredMarkets.length} ASSETS FOUND`
    : selectedCategory === 'ALL'
    ? `${liveFeedsCount} LIVE • ${totalMarkets} ASSETS REGISTERED`
    : `${categoryLiveCount} LIVE • ${filteredMarkets.length} ASSETS REGISTERED`;

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Static Premium CORTEX Visual Foundation */}
      <BackgroundLiveChart symbol={activeSymbol} isPositive={true} />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto min-w-0">
        <MasterTopNav />
        <MarketCategoryFilterBar />

        {/* Page Header */}
        <div className="ghost-glass-panel rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-xl font-sans font-bold text-[#F8FAFC] uppercase tracking-[0.06em]">
                  {headerTitle}
                </h1>
                <span className="text-[9px] bg-cyan-950/80 text-[#67E8F9] border border-cyan-500/40 px-2 py-0.5 rounded font-mono font-bold">
                  {headerBadge}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] font-sans mt-0.5">
                Real-Time Multi-Asset Scanner &bull; Verified Market Data Feeds &bull; Swarm Intelligence Biases
              </p>
            </div>

            {/* Search Input with Alias Support */}
            <div className="relative w-full sm:w-80 font-sans">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symbol, name or alias (e.g. Nasdaq, Gold, BTC)..."
                className="w-full bg-[#07101D]/80 border border-white/[0.08] focus:border-[#22D3EE] rounded-xl pl-9 pr-4 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] outline-none transition-colors"
              />
              <svg className="w-4 h-4 text-[#64748B] absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-sans scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleCategorySelect(cat)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                  selectedCategory === cat
                    ? 'bg-[#22D3EE] text-black shadow-[0_0_12px_rgba(34,211,238,0.5)] font-black'
                    : 'bg-[#07101D]/60 text-[#94A3B8] border border-white/[0.06] hover:text-[#F8FAFC] hover:border-cyan-500/30'
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    selectedCategory === cat
                      ? 'bg-black/20 text-black font-extrabold'
                      : 'bg-white/5 text-[#64748B]'
                  }`}
                >
                  {categoryCounts[cat]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Mobile View: Touch-Friendly Asset Cards (< 768px) */}
        <div className="md:hidden space-y-3">
          {filteredMarkets.length === 0 ? (
            <div className="ghost-glass-panel rounded-2xl p-8 text-center">
              <span className="w-3 h-3 rounded-full bg-[#FBBF24] animate-ping inline-block mb-3" />
              <div className="text-[#FBBF24] font-bold text-sm uppercase tracking-wider font-sans">
                NO CONNECTED {selectedCategory === 'ALL' ? 'MARKET' : selectedCategory} FEEDS
              </div>
              <p className="text-[#94A3B8] text-xs font-sans mt-1">
                Connect a provider or enable available demo instruments.
              </p>
            </div>
          ) : (
            filteredMarkets.map((row) => {
              const liveData = allAssets[row.symbol];
              const price = liveData ? liveData.price : row.basePrice;
              const change = liveData ? liveData.change24h : row.typicalDailyChangePct;
              const spread = liveData ? liveData.spread : row.typicalSpread;
              const isPos = change >= 0;

              const formattedPrice =
                row.category === 'CRYPTO' || row.category === 'INDICES'
                  ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : row.category === 'METALS' || row.category === 'COMMODITIES'
                  ? `$${price.toFixed(row.decimalPrecision)}`
                  : price.toFixed(row.decimalPrecision);

              return (
                <div
                  key={row.symbol}
                  onClick={() => handleRowClick(row.symbol)}
                  className="ghost-glass-panel rounded-2xl p-4 space-y-3 border border-white/[0.08] hover:border-cyan-500/40 transition-all cursor-pointer group active:scale-[0.99]"
                >
                  {/* Card Header: Symbol, Name, Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          row.feedStatus === 'LIVE'
                            ? 'bg-[#34D399] animate-pulse'
                            : row.feedStatus === 'DEMO'
                            ? 'bg-[#22D3EE]'
                            : 'bg-[#FBBF24]'
                        }`}
                      />
                      <div>
                        <Link
                          href={`/markets/${row.symbol}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-bold text-[#F8FAFC] group-hover:text-[#67E8F9] transition-colors text-base font-mono block hover:underline"
                        >
                          {row.symbol}
                        </Link>
                        <div className="text-[11px] text-[#94A3B8] font-sans">{row.displayName}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[9px] px-2 py-0.5 rounded bg-[#07101D] border border-white/[0.08] text-[#CBD5E1] font-sans font-semibold">
                        {row.category}
                      </span>
                      <span
                        className={`text-[8.5px] px-1.5 py-0.5 rounded border font-mono font-bold ${
                          row.feedStatus === 'LIVE'
                            ? 'bg-emerald-500/20 text-[#34D399] border-emerald-500/30'
                            : row.feedStatus === 'DEMO'
                            ? 'bg-cyan-500/20 text-[#67E8F9] border-cyan-500/30'
                            : 'bg-amber-500/20 text-[#FBBF24] border-amber-500/30'
                        }`}
                      >
                        {row.feedStatus}
                      </span>
                    </div>
                  </div>

                  {/* Price & Stats Row */}
                  <div className="grid grid-cols-3 gap-2 bg-[#07101D]/70 rounded-xl p-2.5 border border-white/[0.04]">
                    <div>
                      <div className="text-[9px] text-[#64748B] uppercase font-sans font-semibold">Live Price</div>
                      <div className="text-sm font-bold text-[#F8FAFC] font-mono mt-0.5">{formattedPrice}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#64748B] uppercase font-sans font-semibold">24h Change</div>
                      <div className={`text-sm font-bold font-mono mt-0.5 ${isPos ? 'text-[#34D399]' : 'text-[#FB7185]'}`}>
                        {isPos ? '+' : ''}{change}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#64748B] uppercase font-sans font-semibold">Spread</div>
                      <div className="text-sm font-medium text-[#CBD5E1] font-mono mt-0.5">{spread}</div>
                    </div>
                  </div>

                  {/* Session Status & Quick Actions */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="min-w-0">
                      <MarketStatusBadge symbol={row.symbol} size="xs" showCountdown={false} />
                    </div>
                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      <Link
                        href={`/markets/${row.symbol}`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-[#CBD5E1] hover:text-[#F8FAFC] border border-white/[0.08] rounded-lg text-[10px] font-sans font-bold transition-all"
                      >
                        DEEP DIVE →
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCockpitClick(row.symbol);
                        }}
                        className="px-2.5 py-1.5 bg-cyan-950/80 hover:bg-cyan-900 text-[#67E8F9] hover:text-[#F8FAFC] border border-cyan-500/40 rounded-lg text-[10px] font-sans font-bold transition-all shadow-sm cursor-pointer"
                      >
                        COCKPIT →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View (>= 768px) */}
        <div className="hidden md:block ghost-glass-panel rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr className="border-b border-white/[0.06] bg-[#07101D]/90 text-[10px] text-[#94A3B8] uppercase tracking-wider font-sans font-bold">
                  <th className="p-3.5">Asset / Symbol</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Market Session</th>
                  <th className="p-3.5 text-right">Live Price</th>
                  <th className="p-3.5 text-right">24h Change</th>
                  <th className="p-3.5 text-right">Spread</th>
                  <th className="p-3.5">Feed Status</th>
                  <th className="p-3.5">Provider Source</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filteredMarkets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <span className="w-3 h-3 rounded-full bg-[#FBBF24] animate-ping" />
                        <span className="text-[#FBBF24] font-bold text-sm uppercase tracking-wider font-sans">
                          NO CONNECTED {selectedCategory === 'ALL' ? 'MARKET' : selectedCategory} FEEDS
                        </span>
                        <span className="text-[#94A3B8] text-xs font-sans">
                          Connect a provider or enable available demo instruments.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredMarkets.map((row) => {
                    const liveData = allAssets[row.symbol];
                    const price = liveData ? liveData.price : row.basePrice;
                    const change = liveData ? liveData.change24h : row.typicalDailyChangePct;
                    const spread = liveData ? liveData.spread : row.typicalSpread;
                    const isPos = change >= 0;

                    const formattedPrice =
                      row.category === 'CRYPTO' || row.category === 'INDICES'
                        ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : row.category === 'METALS' || row.category === 'COMMODITIES'
                        ? `$${price.toFixed(row.decimalPrecision)}`
                        : price.toFixed(row.decimalPrecision);

                    return (
                      <tr
                        key={row.symbol}
                        onClick={() => handleRowClick(row.symbol)}
                        className="hover:bg-cyan-500/[0.06] transition-colors cursor-pointer group"
                      >
                        <td className="p-3.5">
                          <div className="flex items-center space-x-2.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                row.feedStatus === 'LIVE'
                                  ? 'bg-[#34D399] animate-pulse'
                                  : row.feedStatus === 'DEMO'
                                  ? 'bg-[#22D3EE]'
                                  : 'bg-[#FBBF24]'
                              }`}
                            />
                            <div>
                              <Link
                                href={`/markets/${row.symbol}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-bold text-[#F8FAFC] group-hover:text-[#67E8F9] transition-colors text-sm font-mono block hover:underline"
                              >
                                {row.symbol}
                              </Link>
                              <div className="text-[10px] text-[#94A3B8] font-sans">{row.displayName}</div>
                            </div>
                          </div>
                        </td>

                        <td className="p-3.5">
                          <span className="text-[9.5px] px-2 py-0.5 rounded bg-[#07101D] border border-white/[0.08] text-[#CBD5E1] font-sans font-semibold">
                            {row.category}
                          </span>
                        </td>

                        <td className="p-3.5 whitespace-nowrap">
                          <MarketStatusBadge symbol={row.symbol} size="xs" showCountdown={true} />
                        </td>

                        <td className="p-3.5 text-right font-bold text-[#F8FAFC] text-sm font-mono">
                          {formattedPrice}
                        </td>

                        <td className="p-3.5 text-right font-bold font-mono">
                          <span className={isPos ? 'text-[#34D399]' : 'text-[#FB7185]'}>
                            {isPos ? '+' : ''}
                            {change}%
                          </span>
                        </td>

                        <td className="p-3.5 text-right text-[#CBD5E1] font-mono font-medium">
                          {spread}
                        </td>

                        <td className="p-3.5">
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded border font-mono font-bold ${
                              row.feedStatus === 'LIVE'
                                ? 'bg-emerald-500/20 text-[#34D399] border-emerald-500/30'
                                : row.feedStatus === 'DEMO'
                                ? 'bg-cyan-500/20 text-[#67E8F9] border-cyan-500/30'
                                : 'bg-amber-500/20 text-[#FBBF24] border-amber-500/30'
                            }`}
                          >
                            {row.feedStatus}
                          </span>
                        </td>

                        <td className="p-3.5 text-[#94A3B8] text-[10px] font-sans">
                          {row.feedProvider}
                        </td>

                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCockpitClick(row.symbol);
                            }}
                            className="px-3 py-1 bg-cyan-950/80 hover:bg-cyan-900 text-[#67E8F9] hover:text-[#F8FAFC] border border-cyan-500/40 rounded-lg text-[10px] font-sans font-bold transition-all shadow-sm cursor-pointer"
                          >
                            OPEN COCKPIT →
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <MasterFooter />
      </div>
    </div>
  );
}

export default function MarketsPage() {
  return (
    <React.Suspense fallback={
      <div className="min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col items-center justify-center font-mono">
        <div className="w-8 h-8 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-3" />
        <div className="text-xs text-gray-400 tracking-wider">LOADING MARKETS DIRECTORY...</div>
      </div>
    }>
      <MarketsPageContent />
    </React.Suspense>
  );
}
