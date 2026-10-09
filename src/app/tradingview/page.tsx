'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { TradingViewChartWidget } from '@/components/charts/TradingViewChartWidget';
import { QuickScalpDock } from '@/components/tradingview/QuickScalpDock';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';
import { ExecutabilityBadge } from '@/components/common/ExecutabilityBadge';

const QUICK_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'US100', 'US30', 'USOIL', 'BTCUSD'];

const TIMEFRAMES = [
  { id: 'M1', label: '1m' },
  { id: 'M5', label: '5m' },
  { id: 'M15', label: '15m' },
  { id: 'M30', label: '30m' },
  { id: 'H1', label: '1h' },
  { id: 'H4', label: '4h' },
  { id: 'D1', label: '1D' },
  { id: 'W1', label: '1W' },
];

export default function TradingViewPage() {
  const { activeSymbol, setActiveSymbol, activeAsset, assetProfile, allAssets } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected } = useMT5Telemetry();
  const [timeframe, setTimeframe] = useState<string>('M30');
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#02050E] text-white flex items-center justify-center font-mono text-sm">
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>INITIALIZING TRADINGVIEW WORKBENCH...</span>
        </div>
      </div>
    );
  }

  const liveQuote = activeTelemetry?.quote || telemetry.allQuotes[activeSymbol];
  const price = liveQuote?.bid || activeAsset.price;
  const priceFmt =
    price >= 1000
      ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : price.toFixed(4);

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#02050E] text-white overflow-hidden">
      {/* Master Top Navigation (Row 1 & Row 2 Nav) */}
      <MasterTopNav />

      {/* Sub-Header Chart Control Bar */}
      <div className="px-3 sm:px-4 py-2 bg-[#040814] border-b border-white/10 flex flex-wrap items-center justify-between gap-2.5 flex-shrink-0 font-mono">
        {/* Left: Active Asset Meta */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-black text-white">{activeSymbol}</span>
            <span className="text-xs text-gray-400 hidden sm:inline">{activeAsset.name}</span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded border ${
                activeAsset.change24h >= 0
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
              }`}
            >
              ${priceFmt} ({activeAsset.change24h >= 0 ? '+' : ''}
              {activeAsset.change24h.toFixed(2)}%)
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-2">
            <MarketStatusBadge symbol={activeSymbol} size="sm" />
            <ExecutabilityBadge executable={assetProfile?.tradeExecutable !== false} size="sm" />
          </div>
        </div>

        {/* Center: Quick Asset Selector Bar & Timeframe Selectors */}
        <div className="flex items-center space-x-2 overflow-x-auto max-w-full">
          {/* Top Instruments Quick Select Pills */}
          <div className="flex items-center space-x-1 bg-black/60 p-1 rounded-xl border border-white/10">
            <span className="text-[10px] text-gray-400 font-bold px-1 hidden sm:inline">QUICK:</span>
            {QUICK_SYMBOLS.map((sym) => (
              <button
                key={sym}
                onClick={() => setActiveSymbol(sym)}
                className={`px-2 py-0.5 text-xs font-bold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeSymbol === sym
                    ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.35)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
                title={`Switch chart to ${sym}`}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Timeframe Selectors */}
          <div className="flex items-center space-x-1 bg-black/50 p-1 rounded-xl border border-white/10">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                onClick={() => setTimeframe(tf.id)}
                className={`px-2 py-0.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  timeframe === tf.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Full 26-Asset Dropdown & Quick Navigation */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 bg-black/50 border border-white/10 px-2 py-1 rounded-xl text-xs">
            <span className="text-gray-400 text-[10px]">ALL ASSETS:</span>
            <select
              value={activeSymbol}
              onChange={(e) => setActiveSymbol(e.target.value)}
              className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer max-w-[130px] truncate"
            >
              {Object.keys(allAssets).map((sym) => (
                <option key={sym} value={sym} className="bg-slate-900 text-white">
                  {sym} - {allAssets[sym].name}
                </option>
              ))}
            </select>
          </div>

          <Link
            href="/cockpit"
            className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/40 text-gray-300 hover:text-cyan-200 text-xs transition-colors cursor-pointer hidden lg:inline-flex items-center space-x-1"
          >
            <span>&larr;</span>
            <span>COCKPIT</span>
          </Link>
        </div>
      </div>

      {/* Main Chart Workspace & Embedded Floating Quick Scalp Dock */}
      <div className="relative flex-1 w-full h-full overflow-hidden p-1.5 sm:p-2 bg-[#02050E]">
        {/* Full-Featured TradingView Advanced Chart Widget with remount key */}
        <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 shadow-2xl relative">
          <TradingViewChartWidget
            key={`${activeSymbol}-${timeframe}`}
            symbol={activeSymbol}
            timeframe={timeframe}
            height="100%"
            autosize={true}
            theme="dark"
          />
        </div>

        {/* Floating Quick Scalp Dock Overlay: Bottom HUD offset clear of TradingView left drawing toolbar */}
        <div className="absolute bottom-4 left-16 sm:left-18 z-20 pointer-events-auto">
          <QuickScalpDock />
        </div>
      </div>
    </div>
  );
}
