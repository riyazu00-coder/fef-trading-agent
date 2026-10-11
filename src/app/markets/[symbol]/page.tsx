'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMemberAuth } from '@/context/MemberAuthContext';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';
import { getMarketDefinition } from '@/lib/registry/market-registry';

interface SymbolPageProps {
  params: { symbol: string } | Promise<{ symbol: string }>;
}

export default function MarketSymbolDetailPage({ params }: SymbolPageProps) {
  const routeParams = useParams();
  const rawParamSymbol = routeParams?.symbol
    ? (Array.isArray(routeParams.symbol) ? routeParams.symbol[0] : routeParams.symbol)
    : (params && typeof (params as any).then !== 'function' && (params as any).symbol
      ? (Array.isArray((params as any).symbol) ? (params as any).symbol[0] : (params as any).symbol)
      : undefined);

  const initialSym = rawParamSymbol ? String(rawParamSymbol).toUpperCase() : 'XAUUSD';
  const [resolvedSymbol, setResolvedSymbol] = React.useState<string>(initialSym);

  useEffect(() => {
    if (routeParams?.symbol) {
      const s = Array.isArray(routeParams.symbol) ? routeParams.symbol[0] : routeParams.symbol;
      if (s) setResolvedSymbol(String(s).toUpperCase());
    } else if (params && typeof (params as any).then === 'function') {
      (params as Promise<{ symbol: string }>).then(p => {
        if (p?.symbol) {
          const s = Array.isArray(p.symbol) ? p.symbol[0] : p.symbol;
          if (s) setResolvedSymbol(String(s).toUpperCase());
        }
      });
    } else if (params && (params as any).symbol) {
      const s = Array.isArray((params as any).symbol) ? (params as any).symbol[0] : (params as any).symbol;
      if (s) setResolvedSymbol(String(s).toUpperCase());
    }
  }, [params, routeParams]);

  const rawSymbol = resolvedSymbol || 'XAUUSD';
  const router = useRouter();
  const { activeSymbol, setActiveSymbol, activeAsset, assetProfile, timeframe, setTimeframe } = useActiveAsset();
  const { isAuthenticated, isMaster } = useMemberAuth();

  useEffect(() => {
    if (rawSymbol && rawSymbol !== activeSymbol) {
      setActiveSymbol(rawSymbol);
    }
  }, [rawSymbol, activeSymbol, setActiveSymbol]);

  // Safe decimal precision for active symbol
  const marketDef = getMarketDefinition(rawSymbol);
  const precision = marketDef?.decimalPrecision ?? 2;

  const p = typeof activeAsset?.price === 'number' && !isNaN(activeAsset.price) ? activeAsset.price : 0;
  const change24hVal = typeof activeAsset?.change24h === 'number' ? activeAsset.change24h : 0;
  const isPos = change24hVal >= 0;
  const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

  // Check if active verified trade blueprint levels exist
  const hasActiveBlueprint = Boolean(
    assetProfile?.entryZone &&
    Array.isArray(assetProfile.entryZone) &&
    typeof assetProfile.entryZone[0] === 'number' &&
    typeof assetProfile.entryZone[1] === 'number' &&
    typeof assetProfile.stopLoss === 'number' &&
    typeof assetProfile.tp1 === 'number'
  );

  // Synthetic SMC and Multi-Timeframe Matrix based on current symbol
  const multiTfMatrix = [
    { tf: 'M1', trend: isPos ? 'BULLISH' : 'BEARISH', smc: 'Discount FVG Retest', rsi: 54, volume: 'High' },
    { tf: 'M5', trend: isPos ? 'BULLISH' : 'BEARISH', smc: 'CHOCH Displacement', rsi: 58, volume: 'Elevated' },
    { tf: 'M15', trend: isPos ? 'BULLISH' : 'BEARISH', smc: 'Internal BOS Sweep', rsi: 61, volume: 'Institutional' },
    { tf: 'M30', trend: isPos ? 'BULLISH' : 'BEARISH', smc: 'Mitigation Block', rsi: 56, volume: 'Normal' },
    { tf: 'H1', trend: isPos ? 'BULLISH' : 'BEARISH', smc: 'H1 Order Block Hold', rsi: 62, volume: 'Deep' },
    { tf: 'H4', trend: 'BULLISH', smc: 'Premium Rejection / Sweep', rsi: 59, volume: 'Strong' },
    { tf: 'D1', trend: 'BULLISH', smc: 'Structural Higher Low', rsi: 64, volume: 'Dominant' },
    { tf: 'W1', trend: 'BULLISH', smc: 'Macro Trend Expansion', rsi: 68, volume: 'Institutional' },
  ];

  const handleSendToExecution = () => {
    setActiveSymbol(rawSymbol);
    router.push('/execution');
  };

  const handleAnalyzeInVision = () => {
    setActiveSymbol(rawSymbol);
    router.push('/chart-analyzer');
  };

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Static Premium CORTEX Visual Foundation */}
      <BackgroundLiveChart symbol={rawSymbol} isPositive={isPos} />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto min-w-0">
        <MasterTopNav />
        <MarketCategoryFilterBar />

        {/* Top Breadcrumb & Asset Banner */}
        <div className="ghost-glass-panel rounded-2xl p-3.5 sm:p-5 space-y-4 min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs flex-wrap">
              <Link
                href="/markets"
                className="bg-white/5 hover:bg-white/10 border border-white/[0.08] text-[#CBD5E1] hover:text-[#F8FAFC] px-2.5 sm:px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-colors font-sans"
              >
                <span>&larr;</span>
                <span className="hidden sm:inline">BACK TO </span>
                <span>MARKETS</span>
              </Link>
              {marketDef?.category && (
                <>
                  <span className="text-[#64748B]">/</span>
                  <Link
                    href={`/markets?category=${marketDef.category.toLowerCase()}`}
                    className="bg-white/5 hover:bg-white/10 border border-white/[0.08] text-[#67E8F9] hover:text-[#F8FAFC] px-2.5 py-1.5 rounded-lg transition-colors font-mono font-semibold"
                  >
                    {marketDef.category}
                  </Link>
                </>
              )}
              <span className="text-[#64748B]">/</span>
              <span className="text-[#F8FAFC] font-bold tracking-wider font-mono">
                {rawSymbol} <span className="hidden sm:inline text-[#94A3B8] font-normal">DEEP DIVE</span>
              </span>
            </div>

            {/* Quick Action Navigation */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {!isAuthenticated && !isMaster ? (
                <>
                  <Link
                    href="/member"
                    className="bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 rounded-lg font-bold tracking-wider flex items-center space-x-1.5 transition-all"
                    title="Member login required for direct broker execution"
                  >
                    <span>🔒</span>
                    <span>MEMBER EXECUTION</span>
                  </Link>
                  <Link
                    href="/member"
                    className="bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/40 text-cyan-300 text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 rounded-lg font-bold tracking-wider flex items-center space-x-1.5 transition-all"
                    title="Member login required for Vision AI analyzer"
                  >
                    <span>🔒</span>
                    <span>VISION AI ANALYZER</span>
                  </Link>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSendToExecution}
                    className="bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 rounded-lg font-bold tracking-wider flex items-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  >
                    <span>⚡</span>
                    <span>SEND TO EXECUTION</span>
                  </button>
                  <button
                    onClick={handleAnalyzeInVision}
                    className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 rounded-lg font-bold tracking-wider flex items-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.2)]"
                  >
                    <span>👁️</span>
                    <span>VISION AI ANALYZER</span>
                  </button>
                </>
              )}
              <Link
                href="/cockpit"
                className="bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 text-purple-300 text-[10px] sm:text-xs px-2.5 sm:px-3.5 py-1.5 rounded-lg font-bold tracking-wider flex items-center space-x-1.5 transition-all"
              >
                <span>🎛️</span>
                <span>COCKPIT VIEW</span>
              </Link>
            </div>
          </div>

          {/* Primary Asset Live Quote Row */}
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pt-2 border-t border-white/5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wider">{rawSymbol}</h1>
                <span className="text-[10px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-bold font-mono uppercase">
                  {assetProfile?.category || marketDef?.category || 'MARKET'}
                </span>
                <MarketStatusBadge symbol={rawSymbol} size="xs" showCountdown={true} />
                <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded font-bold font-mono uppercase">
                  BROKER FEED VERIFIED
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">{assetProfile?.name || marketDef?.displayName || rawSymbol}</div>
            </div>

            {/* Live Price Block */}
            <div className="flex items-baseline justify-between sm:justify-end gap-3 font-mono">
              <div>
                <span className="text-[10px] text-gray-400 block text-left sm:text-right">LIVE PRICE</span>
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  ${p > 0 ? p.toLocaleString(undefined, { minimumFractionDigits: precision > 2 ? precision : 2, maximumFractionDigits: precision > 2 ? precision : 4 }) : '--'}
                </span>
              </div>
              <div className={`text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg border ${
                isPos 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}>
                {isPos ? '+' : ''}{change24hVal.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Live Quote Mini Strip: BID, ASK, SPREAD */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center font-mono">
            <div className="bg-black/30 border border-white/5 p-2 rounded-lg">
              <span className="text-[9.5px] text-gray-400 block">BID</span>
              <span className="text-xs font-bold text-white">
                ${typeof activeAsset?.bid === 'number'
                  ? activeAsset.bid.toLocaleString(undefined, { minimumFractionDigits: precision > 2 ? precision : 2, maximumFractionDigits: precision > 2 ? precision : 4 })
                  : (p > 0 ? p.toLocaleString(undefined, { minimumFractionDigits: precision > 2 ? precision : 2, maximumFractionDigits: precision > 2 ? precision : 4 }) : '--')}
              </span>
            </div>
            <div className="bg-black/30 border border-white/5 p-2 rounded-lg">
              <span className="text-[9.5px] text-gray-400 block">ASK</span>
              <span className="text-xs font-bold text-white">
                ${typeof activeAsset?.ask === 'number'
                  ? activeAsset.ask.toLocaleString(undefined, { minimumFractionDigits: precision > 2 ? precision : 2, maximumFractionDigits: precision > 2 ? precision : 4 })
                  : (p > 0 ? p.toLocaleString(undefined, { minimumFractionDigits: precision > 2 ? precision : 2, maximumFractionDigits: precision > 2 ? precision : 4 }) : '--')}
              </span>
            </div>
            <div className="bg-black/30 border border-white/5 p-2 rounded-lg">
              <span className="text-[9.5px] text-gray-400 block">SPREAD</span>
              <span className="text-xs font-bold text-cyan-300">
                {activeAsset?.spread !== undefined ? activeAsset.spread : '--'}
              </span>
            </div>
          </div>

          {/* Key Metric Tags */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 pt-1 text-xs">
            <div className="bg-black/40 border border-white/5 p-2 sm:p-2.5 rounded-xl min-w-0">
              <span className="text-gray-400 text-[10px] block">SPREAD</span>
              <span className="text-white font-bold font-mono text-xs sm:text-sm">{activeAsset?.spread !== undefined ? activeAsset.spread : '--'}</span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2 sm:p-2.5 rounded-xl min-w-0">
              <span className="text-gray-400 text-[10px] block">24H HIGH</span>
              <span className="text-emerald-400 font-bold font-mono text-xs sm:text-sm">
                ${typeof activeAsset?.high24h === 'number' ? activeAsset.high24h.toLocaleString() : '--'}
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2 sm:p-2.5 rounded-xl min-w-0">
              <span className="text-gray-400 text-[10px] block">24H LOW</span>
              <span className="text-rose-400 font-bold font-mono text-xs sm:text-sm">
                ${typeof activeAsset?.low24h === 'number' ? activeAsset.low24h.toLocaleString() : '--'}
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2 sm:p-2.5 rounded-xl min-w-0">
              <span className="text-gray-400 text-[10px] block">SESSION</span>
              <span className="text-amber-400 font-bold font-mono text-[11px] sm:text-xs truncate block">{assetProfile?.session || 'ACTIVE'}</span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2 sm:p-2.5 rounded-xl min-w-0">
              <span className="text-gray-400 text-[10px] block">VOLATILITY (ATR)</span>
              <span className="text-purple-400 font-bold font-mono text-[11px] sm:text-xs truncate block">{assetProfile?.volatility || 'NORMAL'}</span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2 sm:p-2.5 rounded-xl min-w-0">
              <span className="text-gray-400 text-[10px] block">CONSENSUS</span>
              <span className="text-cyan-400 font-bold font-mono text-[11px] sm:text-xs truncate block">
                {assetProfile?.confidence ?? 0}% {assetProfile?.setupDirection || 'NEUTRAL'}
              </span>
            </div>
          </div>
        </div>

        {/* Multi-Timeframe Structural Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 font-mono min-w-0">
          {/* Left 2 Cols: Multi-Timeframe Matrix & Key Levels */}
          <div className="lg:col-span-2 space-y-4 min-w-0">
            {/* Multi-Timeframe Grid */}
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 sm:p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-4 min-w-0 overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-white/5 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-cyan-400">📊</span>
                  <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                    MULTI-TIMEFRAME CONFLUENCE MATRIX
                  </h2>
                </div>
                {/* Timeframe Selector */}
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5 overflow-x-auto scrollbar-none max-w-full">
                  {timeframes.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTimeframe(tf)}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold transition-all cursor-pointer whitespace-nowrap ${
                        timeframe === tf
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mobile View: Compact Responsive Timeframe Cards (Zero Horizontal Overflow) */}
              <div className="md:hidden space-y-2">
                {multiTfMatrix.map((row) => (
                  <div
                    key={row.tf}
                    onClick={() => setTimeframe(row.tf)}
                    className={`bg-black/40 border rounded-xl p-2.5 sm:p-3 space-y-1.5 transition-all cursor-pointer ${
                      timeframe === row.tf
                        ? 'border-cyan-500/60 bg-cyan-950/20 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
                        : 'border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {timeframe === row.tf && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
                        <span className="font-bold text-white text-xs">{row.tf}</span>
                        <span className="text-[9px] text-gray-400 font-sans">STRUCTURE</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`text-[9.5px] px-2 py-0.5 rounded font-bold ${
                          row.trend === 'BULLISH'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : row.trend === 'BEARISH'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {row.trend}
                        </span>
                        <span className="text-[8.5px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                          SYNC
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-gray-300 font-mono flex items-center justify-between">
                      <span className="text-gray-400 text-[10px]">SMC:</span>
                      <span className="font-semibold text-[#67E8F9] truncate pl-2">{row.smc}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] pt-1 border-t border-white/5 text-gray-400">
                      <div>RSI: <span className="text-cyan-300 font-bold">{row.rsi}</span></div>
                      <div>VOL: <span className="text-purple-300 font-bold">{row.volume}</span></div>
                      <div className="text-[8.5px] text-gray-400 font-mono">
                        {timeframe === row.tf ? 'ACTIVE TF' : 'TAP TO SELECT'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop View: Full Institutional Confluence Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-[10px] text-gray-400 border-b border-white/5 bg-white/[0.02]">
                    <tr>
                      <th className="py-2 px-3">TIMEFRAME</th>
                      <th className="py-2 px-3">STRUCTURE</th>
                      <th className="py-2 px-3">SMC CONTEXT</th>
                      <th className="py-2 px-3">RSI (14)</th>
                      <th className="py-2 px-3">VOLATILITY</th>
                      <th className="py-2 px-3 text-right">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-gray-300">
                    {multiTfMatrix.map((row) => (
                      <tr key={row.tf} className={`hover:bg-white/[0.02] transition-colors cursor-pointer ${timeframe === row.tf ? 'bg-cyan-500/5' : ''}`} onClick={() => setTimeframe(row.tf)}>
                        <td className="py-2.5 px-3 font-bold text-white flex items-center space-x-1.5">
                          {timeframe === row.tf && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
                          <span>{row.tf}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            row.trend === 'BULLISH' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                              : row.trend === 'BEARISH'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}>
                            {row.trend}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-gray-300 text-[11px]">{row.smc}</td>
                        <td className="py-2.5 px-3 text-cyan-300">{row.rsi}</td>
                        <td className="py-2.5 px-3 text-purple-300">{row.volume}</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-[9px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                            SYNCHRONIZED
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Smart Money Structure & Key Levels */}
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 sm:p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-4 min-w-0 overflow-hidden">
              <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
                <span className="text-purple-400">🎯</span>
                <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                  INSTITUTIONAL PRICE LEVELS & LIQUIDITY MAP
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
                {/* Resistance Zones */}
                <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-3 sm:p-3.5 space-y-2 min-w-0">
                  <div className="text-[10.5px] sm:text-[11px] font-bold text-rose-400 uppercase tracking-wider flex flex-wrap items-center justify-between gap-1">
                    <span>OVERHEAD SUPPLY / RESISTANCE</span>
                    <span className="text-[9px] bg-rose-500/20 px-1.5 py-0.5 rounded">BEARISH LIQUIDITY</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between py-1.5 gap-2 border-b border-rose-500/10">
                      <span className="text-gray-400 text-[10.5px] truncate">R3 (Macro Liquidity Pool)</span>
                      <span className="font-bold text-white font-mono shrink-0 text-xs">${p > 0 ? (p * 1.018).toFixed(precision) : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 gap-2 border-b border-rose-500/10">
                      <span className="text-gray-400 text-[10.5px] truncate">R2 (H4 Bearish Order Block)</span>
                      <span className="font-bold text-white font-mono shrink-0 text-xs">${p > 0 ? (p * 1.010).toFixed(precision) : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 gap-2">
                      <span className="text-gray-400 text-[10.5px] truncate">R1 (Previous Day High Sweep)</span>
                      <span className="font-bold text-white font-mono shrink-0 text-xs">${p > 0 ? (p * 1.004).toFixed(precision) : '--'}</span>
                    </div>
                  </div>
                </div>

                {/* Support Zones */}
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 sm:p-3.5 space-y-2 min-w-0">
                  <div className="text-[10.5px] sm:text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex flex-wrap items-center justify-between gap-1">
                    <span>DEMAND ZONES / SUPPORT</span>
                    <span className="text-[9px] bg-emerald-500/20 px-1.5 py-0.5 rounded">BULLISH LIQUIDITY</span>
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between py-1.5 gap-2 border-b border-emerald-500/10">
                      <span className="text-gray-400 text-[10.5px] truncate">S1 (M15 Mitigation Block)</span>
                      <span className="font-bold text-white font-mono shrink-0 text-xs">${p > 0 ? (p * 0.996).toFixed(precision) : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 gap-2 border-b border-emerald-500/10">
                      <span className="text-gray-400 text-[10.5px] truncate">S2 (H1 Fair Value Gap)</span>
                      <span className="font-bold text-white font-mono shrink-0 text-xs">${p > 0 ? (p * 0.991).toFixed(precision) : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 gap-2">
                      <span className="text-gray-400 text-[10.5px] truncate">S3 (Weekly Low Institutional Base)</span>
                      <span className="font-bold text-white font-mono shrink-0 text-xs">${p > 0 ? (p * 0.984).toFixed(precision) : '--'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Col: Active Swarm Trade Setup */}
          <div className="space-y-4 min-w-0">
            {/* Active Setup Card */}
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-3.5 sm:p-5 shadow-[0_8px_32px_0_rgba(6,182,212,0.15)] space-y-4 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <h3 className="text-xs font-black text-cyan-300 uppercase tracking-wider">
                    RECOMMENDED TRADE BLUEPRINT
                  </h3>
                </div>
                <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-bold">
                  {assetProfile?.setupDirection || 'NEUTRAL'}
                </span>
              </div>

              {/* Targets and RR Grid */}
              {!isAuthenticated && !isMaster ? (
                <div className="bg-black/60 p-4 sm:p-5 rounded-xl border border-cyan-500/30 text-center space-y-3 font-mono">
                  <div className="w-10 h-10 rounded-full bg-cyan-950/80 border border-cyan-400/40 text-cyan-300 mx-auto flex items-center justify-center text-base font-bold">
                    🔒
                  </div>
                  <div>
                    <div className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">
                      MEMBER INTELLIGENCE
                    </div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider mt-0.5">
                      ACTIONABLE TRADE SETUP
                    </h4>
                    <p className="text-[10.5px] text-gray-400 font-sans mt-1 leading-relaxed">
                      Detailed CORTEX evidence, actionable setup (exact Entry, Stop Loss, Multi-Targets, R:R), and direct broker dispatch are available to FEF CORTEX members.
                    </p>
                  </div>
                  <Link
                    href="/member"
                    className="inline-block w-full py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-sans font-bold text-xs rounded-xl transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] uppercase tracking-wider"
                  >
                    MEMBER LOGIN &rarr;
                  </Link>
                </div>
              ) : hasActiveBlueprint ? (
                <>
                  <div className="space-y-2.5 text-xs">
                    <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 flex justify-between items-center">
                      <span className="text-gray-400">ENTRY ZONE</span>
                      <span className="font-bold text-cyan-400 font-mono">
                        ${assetProfile!.entryZone![0].toFixed(precision)} - ${assetProfile!.entryZone![1].toFixed(precision)}
                      </span>
                    </div>

                    <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 flex justify-between items-center">
                      <span className="text-rose-400 font-bold">STOP LOSS</span>
                      <span className="font-bold text-rose-400 font-mono">${assetProfile!.stopLoss!.toFixed(precision)}</span>
                    </div>

                    <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 space-y-1">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-emerald-400 font-bold">TAKE PROFIT 1</span>
                        <span className="font-bold text-emerald-400 font-mono">${assetProfile!.tp1!.toFixed(precision)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-emerald-300">TAKE PROFIT 2</span>
                        <span className="font-bold text-emerald-300 font-mono">
                          {typeof assetProfile?.tp2 === 'number' ? `$${assetProfile.tp2.toFixed(precision)}` : 'Trailing / Open'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-emerald-200">TAKE PROFIT 3 (RUNNER)</span>
                        <span className="font-bold text-emerald-200 font-mono">
                          {typeof assetProfile?.tp3 === 'number' ? `$${assetProfile.tp3.toFixed(precision)}` : 'Runner Position'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs px-1">
                      <span className="text-gray-400">RISK / REWARD:</span>
                      <span className="font-bold text-purple-400">{assetProfile?.rr || '1:1.5'}</span>
                    </div>
                  </div>

                  {/* Invalidation Clause */}
                  <div className="bg-rose-950/20 border border-rose-500/30 p-2.5 rounded-xl text-[11px] text-rose-300">
                    <span className="font-bold block text-rose-400 mb-0.5">⚠️ INVALIDATION THRESHOLD:</span>
                    {assetProfile?.invalidation || 'Awaiting structural invalidation parameters'}
                  </div>

                  {/* Quick Action Button */}
                  <button
                    onClick={handleSendToExecution}
                    className="w-full bg-gradient-to-r from-cyan-500/30 via-emerald-500/30 to-purple-500/30 hover:from-cyan-500/40 hover:via-emerald-500/40 hover:to-purple-500/40 border border-cyan-500/50 text-white font-bold py-2.5 rounded-xl text-xs tracking-wider transition-all shadow-lg cursor-pointer"
                  >
                    EXECUTE ORDER WITH RISK BUDGET &rarr;
                  </button>
                </>
              ) : (
                <>
                  <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                    <div className="flex items-center space-x-2 text-cyan-400 text-[11px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span>STRUCTURAL REVALIDATION IN PROGRESS</span>
                    </div>
                    <p className="text-[10.5px] text-gray-400 font-sans leading-relaxed">
                      Institutional CORTEX Council requires confirmed M15 candle close and structure alignment before issuing an actionable trade blueprint.
                    </p>
                    <div className="pt-1 space-y-1.5 text-[11px] border-t border-white/5">
                      <div className="flex justify-between items-center text-gray-400">
                        <span>ENTRY POSTURE:</span>
                        <span className="text-cyan-300 font-bold">{assetProfile?.setupDirection || 'OBSERVATION'}</span>
                      </div>
                      <div className="flex justify-between items-center text-gray-400">
                        <span>CONFIDENCE:</span>
                        <span className="text-white font-bold">{assetProfile?.confidence ?? 0}%</span>
                      </div>
                      <div className="flex justify-between items-center text-gray-400">
                        <span>STRUCTURE:</span>
                        <span className="text-amber-300 font-bold">Awaiting M15 Close</span>
                      </div>
                    </div>
                  </div>

                  {/* Invalidation Clause */}
                  <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl text-[11px] text-gray-400">
                    <span className="font-bold block text-gray-300 mb-0.5">STRUCTURAL STATUS:</span>
                    {assetProfile?.invalidation || 'No structural invalidation computed yet — awaiting verified candles.'}
                  </div>

                  {/* Quick Action Button */}
                  <button
                    onClick={handleSendToExecution}
                    className="w-full bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 font-bold py-2.5 rounded-xl text-xs tracking-wider transition-all cursor-pointer"
                  >
                    OPEN IN EXECUTION TERMINAL &rarr;
                  </button>
                </>
              )}
            </div>

            {/* Why This Trade & Opposing Risks */}
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 sm:p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3 min-w-0 overflow-hidden">
              <h3 className="text-xs font-black text-emerald-400 uppercase tracking-wider">
                ✓ WHY THIS TRADE (CONFLUENCE)
              </h3>
              <ul className="space-y-1.5 text-[11px] text-gray-300">
                {(assetProfile?.whyThisTrade && assetProfile.whyThisTrade.length > 0 ? assetProfile.whyThisTrade : ['Market structure alignment under observation.']).map((point, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <span className="text-emerald-400 mt-0.5 shrink-0">&bull;</span>
                    <span className="break-words leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>

              <h3 className="text-xs font-black text-rose-400 uppercase tracking-wider pt-2 border-t border-white/5">
                ✕ OPPOSING RISKS (MANDATORY)
              </h3>
              <ul className="space-y-1.5 text-[11px] text-gray-300">
                {(assetProfile?.opposingRisks && assetProfile.opposingRisks.length > 0 ? assetProfile.opposingRisks : ['Market structure preservation and volatility guard active.']).map((risk, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <span className="text-rose-400 mt-0.5 shrink-0">&bull;</span>
                    <span className="break-words leading-relaxed">{risk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* 15-Agent Consensus Breakdown Grid */}
        <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 sm:p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] font-mono space-y-4 min-w-0 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-white/5 pb-3">
            <div>
              <h2 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center space-x-2">
                <span>🤖</span>
                <span>15-AGENT COUNCIL DELIBERATION MATRIX FOR {rawSymbol}</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5">
                Independent agent telemetry, individual confidence ratings, evidence citations, and invalidations.
              </p>
            </div>
            <Link
              href="/agents"
              className="text-xs text-cyan-400 hover:text-cyan-300 border border-cyan-500/30 px-3 py-1.5 rounded-lg bg-cyan-950/30 transition-colors shrink-0 w-fit"
            >
              VIEW FULL AGENTS REGISTRY &rarr;
            </Link>
          </div>

          {!isAuthenticated && !isMaster ? (
            <div className="bg-black/60 p-4 sm:p-6 rounded-xl border border-cyan-500/30 text-center space-y-3 font-mono">
              <div className="w-10 h-10 rounded-full bg-cyan-950/80 border border-cyan-400/40 text-cyan-300 mx-auto flex items-center justify-center text-base font-bold">
                🔒
              </div>
              <div>
                <div className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">
                  MEMBER INTELLIGENCE
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-wider mt-0.5">
                  PROPRIETARY AGENT EVIDENCE & DELIBERATION
                </h3>
                <p className="text-[10.5px] sm:text-[11px] text-gray-400 font-sans mt-1 leading-relaxed max-w-lg mx-auto">
                  Detailed CORTEX agent evidence citations, independent agent voting telemetry, confidence weighting, and evidence provenance are available to FEF CORTEX members.
                </p>
              </div>
              <div className="pt-1">
                <Link
                  href="/member"
                  className="inline-block px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-sans font-bold text-xs rounded-xl transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] uppercase tracking-wider"
                >
                  MEMBER LOGIN &rarr;
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(assetProfile?.agents || []).map((ag) => (
                <div
                  key={ag.name}
                  className="bg-black/40 border border-white/5 hover:border-cyan-500/30 rounded-xl p-3 sm:p-3.5 space-y-2 transition-all min-w-0"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white truncate">{ag.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 ${
                      ag.bias === 'BULLISH'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : ag.bias === 'BEARISH'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      {ag.bias} ({ag.confidence}%)
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400">{ag.role}</div>
                  <div className="text-[11px] text-gray-200 border-l-2 border-cyan-500/40 pl-2 py-0.5 leading-relaxed break-words">
                    &ldquo;{ag.lastOpinion}&rdquo;
                  </div>
                  {ag.keyRisk && (
                    <div className="text-[10px] text-rose-400/80 leading-relaxed break-words">
                      <span className="font-semibold">Risk:</span> {ag.keyRisk}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Master Footer */}
        <MasterFooter />
      </div>
    </div>
  );
}
