'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { resolvePriceForPurpose } from '@/lib/price/price-authority';

/**
 * LiveExecutionTelemetryPanel (formerly ExecutionControlCard)
 * 
 * Master Consolidation V2:
 * Single Cockpit Execution Authority is strictly enforced.
 * FullSmartPositionCalculator is the SOLE component allowed to initiate execution requests in Cockpit.
 * This panel is strictly a real-time monitor for bridge connectivity, account execution mode,
 * quote freshness, active positions, execution latency, and broker fill/rejection telemetry.
 */
export const LiveExecutionTelemetryPanel: React.FC = () => {
  const { activeSymbol, assetProfile, activeAsset } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected } = useMT5Telemetry();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const direction: 'BUY' | 'SELL' = assetProfile.setupDirection.includes('SELL') ? 'SELL' : 'BUY';
  const brokerQuote = activeTelemetry?.quote || telemetry.allQuotes[activeSymbol] || telemetry.allQuotes[activeSymbol.toUpperCase()];
  const heartbeatAgeMs = typeof telemetry.heartbeatAgeMs === 'number'
    ? telemetry.heartbeatAgeMs
    : telemetry.terminal?.lastHeartbeat
      ? (Date.now() - new Date(telemetry.terminal.lastHeartbeat).getTime())
      : null;

  const execResolution = resolvePriceForPurpose(activeSymbol, 'EXECUTION', {
    side: direction,
    direction,
    referenceAsset: activeAsset,
    brokerQuote,
    isMt5Connected,
    terminalConnected: telemetry.terminal?.terminalConnected,
    bridgeConnected: telemetry.localBridgeOnline,
    heartbeatAgeMs,
    isStale: brokerQuote?.isStale,
    operatingMode: telemetry.operatingMode,
    brokerName: telemetry.account?.broker || telemetry.terminal?.brokerName,
    brokerServer: telemetry.terminal?.brokerServer
  });

  const isRemoteRelay = Boolean(telemetry.isRemote || (telemetry as any).transport?.includes('RELAY'));
  const pingMs = telemetry.terminal?.pingToBrokerMs ?? (telemetry.account as any)?.ping ?? null;
  const quoteAgeMs = brokerQuote?.timestamp ? Math.max(0, Date.now() - brokerQuote.timestamp) : null;
  const spreadPips = brokerQuote && brokerQuote.ask && brokerQuote.bid
    ? ((brokerQuote.ask - brokerQuote.bid) / ((brokerQuote as any).pipSize || 0.0001)).toFixed(1)
    : null;

  // Authoritative execution mode determination
  const accountMode = isMt5Connected && telemetry.account
    ? telemetry.account.tradeMode === 'REAL'
      ? 'LIVE (HARD-LOCKED 🔒)'
      : 'DEMO ARMED ⚡'
    : 'STANDBY / PAPER GATE';

  const positions = telemetry.allPositions || [];

  // Verified Capital & Platform Metrics
  const totalLots = telemetry.allPositions?.reduce((acc, p) => acc + (p.lots || (p as any).volume || 0), 0) ?? 0;
  const balanceStr = telemetry.account
    ? `$${telemetry.account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '$10,000.00 (Paper)';
  const equityStr = telemetry.account
    ? `$${telemetry.account.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '$10,000.00 (Paper)';
  const freeMarginStr = telemetry.account?.freeMargin !== undefined
    ? `$${telemetry.account.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : isMt5Connected ? 'DATA LIMITED' : 'Internal Simulated';
  const marginLevelStr = telemetry.account?.marginLevel !== undefined && telemetry.account.marginLevel > 0
    ? `${telemetry.account.marginLevel.toLocaleString('en-US', { maximumFractionDigits: 0 })}%`
    : telemetry.account ? 'SAFE (0%)' : 'N/A';
  const floatingPnl = telemetry.account?.floatingPnl ?? 0;
  const floatingPnlPct = telemetry.account?.floatingPnlPct ?? 0;
  const floatingPnlStr = `${floatingPnl >= 0 ? '+' : ''}$${floatingPnl.toFixed(2)}`;
  const marginStress = telemetry.account?.marginStressLevel || 'SAFE';

  return (
    <div id="execution-telemetry-panel" className="ghost-glass-panel rounded-2xl p-3.5 sm:p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div>
            <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
              LIVE EXECUTION TELEMETRY &amp; TRANSPORT
            </h3>
            <p className="text-[8px] font-sans text-gray-400">
              Authority: Smart Position Calculator &bull; Transport Monitor
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-1.5">
          <Link
            href="/how-to-use#execution"
            className="text-[8.5px] font-mono font-bold text-gray-400 hover:text-cyan-300 px-1.5 py-0.5 rounded border border-white/10 hover:border-cyan-400/40 bg-black/40 transition-colors"
            title="Learn about Execution Telemetry & Order Transport"
          >
            ?
          </Link>
          <span className={`text-[7.5px] px-1.5 py-0.5 rounded font-bold uppercase font-mono border ${
            isMt5Connected
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
              : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
          }`}>
            {accountMode}
          </span>
        </div>
      </div>

      {/* Consolidated Gateway & Capital Telemetry Grid (6 Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        {/* 1. Terminal Gateway */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-2 space-y-0.5">
          <span className="text-[8px] text-gray-400 uppercase block font-bold">Broker Terminal</span>
          <div className="text-[10px] font-bold text-white truncate">
            {telemetry.account?.broker || telemetry.terminal?.brokerName || 'MT5 Standby'}
          </div>
          <span className="text-[7.5px] text-gray-500 block truncate">
            {telemetry.terminal?.brokerServer || 'Local Bridge :5556'}
          </span>
        </div>

        {/* 2. Bridge Transport */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-2 space-y-0.5">
          <span className="text-[8px] text-gray-400 uppercase block font-bold">Bridge Transport</span>
          <div className={`text-[10px] font-bold truncate ${isMt5Connected ? 'text-emerald-300' : 'text-rose-400'}`}>
            {isMt5Connected ? (isRemoteRelay ? 'Remote Relay Online' : 'Local Bridge Live ⚡') : 'Bridge Offline'}
          </div>
          <span className="text-[7.5px] text-gray-500 block">
            {pingMs != null ? `Broker Ping: ${pingMs}ms` : 'Latency: Synchronized'}
          </span>
        </div>

        {/* 3. Quote Authority */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-2 space-y-0.5">
          <span className="text-[8px] text-gray-400 uppercase block font-bold">Quote Authority</span>
          <div className="text-[10px] font-bold text-cyan-300 truncate">
            {brokerQuote ? (direction === 'BUY' ? `ASK $${brokerQuote.ask}` : `BID $${brokerQuote.bid}`) : 'Awaiting Quote'}
          </div>
          <span className="text-[7.5px] text-gray-500 block truncate">
            {quoteAgeMs != null ? `Age: ${quoteAgeMs}ms • Spr: ${spreadPips || '0'} pips` : 'Fail-Closed Active'}
          </span>
        </div>

        {/* 4. Balance & Equity */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-2 space-y-0.5">
          <div className="flex items-center justify-between text-[8px] text-gray-400 uppercase font-bold">
            <span>Balance &amp; Equity</span>
            <span className="text-cyan-300 text-[7.5px]">USD</span>
          </div>
          <div className="text-[10.5px] font-black text-white truncate">
            {equityStr}
          </div>
          <span className="text-[7.5px] text-gray-400 block truncate">
            Bal: <strong className="text-gray-200">{balanceStr}</strong>
          </span>
        </div>

        {/* 5. Free Margin & Level */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-2 space-y-0.5">
          <div className="flex items-center justify-between text-[8px] text-gray-400 uppercase font-bold">
            <span>Free Margin &amp; Lvl</span>
            <span className={`text-[7.5px] font-bold ${marginStress === 'SAFE' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {marginStress}
            </span>
          </div>
          <div className="text-[10px] font-bold text-white truncate">
            {freeMarginStr}
          </div>
          <span className="text-[7.5px] text-gray-400 block truncate">
            Margin Level: <strong className="text-gray-200">{marginLevelStr}</strong>
          </span>
        </div>

        {/* 6. Floating P/L & Open Exposure */}
        <div className="bg-black/40 border border-white/5 rounded-xl p-2 space-y-0.5">
          <div className="flex items-center justify-between text-[8px] text-gray-400 uppercase font-bold">
            <span>Floating P/L &amp; Lots</span>
            <span className="text-gray-400 text-[7.5px]">{positions.length} Orders</span>
          </div>
          <div className={`text-[10.5px] font-black truncate ${floatingPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {floatingPnlStr} {floatingPnlPct !== 0 ? `(${floatingPnlPct >= 0 ? '+' : ''}${floatingPnlPct.toFixed(2)}%)` : ''}
          </div>
          <span className="text-[7.5px] text-gray-400 block truncate">
            Exposure: <strong className="text-gray-200">{totalLots.toFixed(2)} Lots</strong>
          </span>
        </div>
      </div>

      {/* Active MT5 Positions Live Telemetry */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[9px] font-bold text-gray-400 uppercase">
          <span>Active MT5 Positions ({positions.length})</span>
          <span className="text-gray-500 font-mono">Live Broker Ticket Sync</span>
        </div>

        {positions.length === 0 ? (
          <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 text-center text-[9px] text-gray-500">
            Zero active open positions on connected broker terminal.
          </div>
        ) : (
          <div className="max-h-28 overflow-y-auto space-y-1 pr-1 font-mono text-[8.5px]">
            {positions.map((pos) => (
              <div key={pos.ticket} className="flex items-center justify-between bg-black/40 px-2 py-1 rounded-lg border border-white/5">
                <div className="flex items-center space-x-1.5">
                  <span className={`font-bold px-1 py-0.2 rounded text-[7.5px] ${pos.type === 'BUY' ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'}`}>
                    {pos.type}
                  </span>
                  <span className="text-white font-bold">{pos.symbol}</span>
                  <span className="text-gray-400">#{pos.ticket}</span>
                  <span className="text-gray-400">({pos.lots || (pos as any).volume} lots @ {pos.openPrice || (pos as any).priceOpen})</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={(pos.pnl || (pos as any).profit) >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                    {(pos.pnl || (pos as any).profit) >= 0 ? '+' : ''}${(pos.pnl || (pos as any).profit || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Single Cockpit Execution Authority Redirect Strip */}
      <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-[8.5px]">
        <div className="flex items-center space-x-1 text-gray-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>Single Execution Authority:</span>
          <strong className="text-cyan-300">Smart Position Calculator</strong>
        </div>
        <button
          onClick={() => {
            const calcElem = document.getElementById('smart-position-calculator') || document.querySelector('[data-card="position-calculator"]');
            if (calcElem) {
              calcElem.scrollIntoView({ behavior: 'smooth' });
            } else {
              window.location.hash = '#smart-position-calculator';
            }
          }}
          className="px-2.5 py-1 rounded-lg bg-cyan-950/60 text-cyan-300 hover:text-white border border-cyan-500/40 hover:border-cyan-400 font-bold transition-all cursor-pointer flex items-center space-x-1"
        >
          <span>Calculate &amp; Execute Order</span>
          <span>&uarr;</span>
        </button>
      </div>
    </div>
  );
};

// Backward-compatible alias for existing imports in Cockpit
export const ExecutionControlCard = LiveExecutionTelemetryPanel;
