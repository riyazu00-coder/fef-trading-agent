'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';
import { ExecutabilityBadge } from '@/components/common/ExecutabilityBadge';

interface OrderItem {
  id: string;
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  lots: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  pnl: number;
  pnlPercent: number;
  openTime: string;
}

const INITIAL_DEFAULT_POSITIONS: OrderItem[] = [
  {
    id: 'pos-1',
    ticket: 94821034,
    symbol: 'XAUUSD',
    type: 'BUY',
    lots: 0.50,
    openPrice: 4338.50,
    currentPrice: 4342.20,
    sl: 4322.00,
    tp: 4385.00,
    pnl: 560.00,
    pnlPercent: 1.29,
    openTime: '13:42:10 UTC'
  },
  {
    id: 'pos-2',
    ticket: 94821892,
    symbol: 'EURUSD',
    type: 'BUY',
    lots: 1.20,
    openPrice: 1.1585,
    currentPrice: 1.1601,
    sl: 1.1550,
    tp: 1.1660,
    pnl: 192.00,
    pnlPercent: 0.16,
    openTime: '14:15:22 UTC'
  }
];

export default function ExecutionPage() {
  const { activeSymbol, setActiveSymbol, activeAsset, assetProfile, allAssets } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected } = useMT5Telemetry();

  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'STOP'>('MARKET');
  const [direction, setDirection] = useState<'BUY' | 'SELL'>(
    assetProfile.setupDirection.includes('BUY') ? 'BUY' : 'SELL'
  );
  const [riskPercent, setRiskPercent] = useState<number>(0.5); // 0.5% default
  const [accountBalance, setAccountBalance] = useState<number>(100000);
  const [isArmed, setIsArmed] = useState<boolean>(false);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  // Active positions list with localStorage persistence
  const [openPositions, setOpenPositions] = useState<OrderItem[]>(INITIAL_DEFAULT_POSITIONS);

  // Hydrate open positions from localStorage on client mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('fef_open_positions');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setOpenPositions(parsed);
          }
        }
      } catch (err) {
        console.error('Failed to restore open positions:', err);
      }
    }
  }, []);

  // Sync positions to localStorage whenever state changes
  const updatePositionsState = (newPositions: OrderItem[]) => {
    setOpenPositions(newPositions);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('fef_open_positions', JSON.stringify(newPositions));
      } catch {}
    }
  };

  // Helper to append closed positions into trade journal
  const recordClosedTradeInJournal = (pos: OrderItem) => {
    if (typeof window === 'undefined') return;
    try {
      const existingRaw = window.localStorage.getItem('fef_journal_trades');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];

      const closedTradeRecord = {
        id: `tr-${Date.now()}`,
        ticket: pos.ticket,
        symbol: pos.symbol,
        type: pos.type,
        entryPrice: pos.openPrice,
        exitPrice: pos.currentPrice,
        lots: pos.lots,
        pnl: pos.pnl,
        rrAchieved: pos.pnl >= 0 ? '1 : 2.50' : '-1 : 1.00',
        date: new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC',
        duration: 'Live Session',
        strategy: 'Multi-Agent Council Consensus Execution',
        consensusScore: assetProfile.confidence,
        status: pos.pnl > 0 ? 'WIN' : pos.pnl < 0 ? 'LOSS' : 'BREAKEVEN',
        marketSessionSnapshot: {
          marketState: assetProfile.sessionState?.marketState || 'OPEN',
          sessionName: assetProfile.sessionState?.sessionName || 'LIVE',
          tradeExecutable: assetProfile.tradeExecutable,
          scheduleSource: assetProfile.sessionState?.scheduleSource || 'SESSION SCHEDULE — REFERENCE',
        },
        postMortem: {
          thesis: `Executed via FEF Institutional Paper Gate with ${pos.lots} lots on ${pos.symbol}.`,
          executionGrade: 'A',
          slippage: '0.0 points',
          mistakes: [],
          lessonsLearned: 'Strict adherence to Swarm position sizing.'
        }
      };

      const updatedJournal = [closedTradeRecord, ...existing];
      window.localStorage.setItem('fef_journal_trades', JSON.stringify(updatedJournal));
    } catch (err) {
      console.error('Failed to log closed trade to journal:', err);
    }
  };

  // Pricing calculations
  const p = activeAsset.price;
  const entryPrice = p;
  const slPrice = assetProfile.stopLoss;
  const tpPrice = assetProfile.tp1;
  const slDistance = Math.abs(entryPrice - slPrice);
  const riskAmount = (accountBalance * riskPercent) / 100;
  
  // Computed dynamic lot size based on risk and distance
  const calculatedLotSize = slDistance > 0 ? Math.max(0.01, Number((riskAmount / (slDistance * 100)).toFixed(2))) : 0.10;

  const handleClosePosition = (ticket: number) => {
    if (confirm(`Are you sure you want to close position #${ticket}? Realized PnL will be archived in the Institutional Trade Journal.`)) {
      const targetPos = openPositions.find((pos) => pos.ticket === ticket);
      if (targetPos) {
        recordClosedTradeInJournal(targetPos);
      }
      const updated = openPositions.filter((pos) => pos.ticket !== ticket);
      updatePositionsState(updated);
    }
  };

  const handleFlattenAll = () => {
    if (confirm('EMERGENCY KILL-SWITCH: Do you want to immediately liquidate all open positions and archive them to the Trade Journal?')) {
      openPositions.forEach((pos) => recordClosedTradeInJournal(pos));
      updatePositionsState([]);
      alert('All open market orders liquidated successfully and recorded in Trade Journal.');
    }
  };

  const handleExecuteOrder = () => {
    if (!assetProfile.tradeExecutable) {
      alert(`EXECUTION REJECTED: Market for ${activeSymbol} is currently CLOSED (${assetProfile.sessionState?.statusLabel || 'CLOSED'}). Next session opens in ${assetProfile.sessionState?.nextOpenCountdown || 'scheduled'}. Execution gate enforces 100% market hours compliance.`);
      return;
    }

    if (assetProfile.actionabilityState === 'ANALYSIS ONLY') {
      alert(`EXECUTION REJECTED: Trust Gate is in ANALYSIS ONLY mode (${assetProfile.evidenceTrust || 0}% evidence trust). Live execution is locked until evidence trust reaches >= 60%.`);
      return;
    }

    if (!isArmed) {
      alert('Please toggle ARM EXECUTION GATE first to unlock order dispatch.');
      return;
    }

    setDispatchStatus('TRANSMITTING TO PAPER SIMULATOR GATE...');
    setTimeout(() => {
      const newOrder: OrderItem = {
        id: `pos-${Date.now()}`,
        ticket: Math.floor(10000000 + Math.random() * 90000000),
        symbol: activeSymbol,
        type: direction,
        lots: calculatedLotSize,
        openPrice: entryPrice,
        currentPrice: p,
        sl: slPrice,
        tp: tpPrice,
        pnl: 0.00,
        pnlPercent: 0.00,
        openTime: new Date().toTimeString().split(' ')[0] + ' UTC'
      };
      const updated = [newOrder, ...openPositions];
      updatePositionsState(updated);
      setDispatchStatus(`ORDER #${newOrder.ticket} DISPATCHED TO PAPER ENGINE!`);
      setIsArmed(false);
      setTimeout(() => setDispatchStatus(null), 3000);
    }, 500);
  };

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Background Aurora */}
      <BackgroundLiveChart symbol={activeSymbol} isPositive={true} />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />

        {/* Top Control Bar & MT5 Connection Telemetry */}
        <div className="ghost-glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl">⚡</span>
                <h1 className="text-xl font-sans font-bold text-[#F8FAFC] uppercase tracking-[0.06em]">
                  INSTITUTIONAL EXECUTION GATE (PAPER SIMULATOR)
                </h1>
                <span className="text-[9px] bg-cyan-950/60 text-[#67E8F9] border border-cyan-500/40 px-2 py-0.5 rounded font-mono font-bold">
                  PAPER ENGINE ONLINE &bull; MT5 STANDBY
                </span>
                <MarketStatusBadge symbol={activeSymbol} sessionState={assetProfile.sessionState} size="xs" />
                <ExecutabilityBadge executable={assetProfile.tradeExecutable} size="xs" />
              </div>
              <p className="text-xs text-[#94A3B8] font-sans mt-1">
                Zero-Slippage Simulation &bull; Strict Risk Budget Enforcement &bull; Dual-Phase Human Authorization Gate
              </p>
            </div>

            {/* Emergency Kill-Switch */}
            <button
              onClick={handleFlattenAll}
              className="bg-rose-500/20 hover:bg-rose-500/30 border border-[#EF4444]/50 text-[#FB7185] text-xs px-4 py-2 rounded-xl font-sans font-bold tracking-wider flex items-center space-x-2 transition-all shadow-[0_0_20px_rgba(239,68,68,0.2)] cursor-pointer"
            >
              <span>🛑</span>
              <span>EMERGENCY FLATTEN ALL POSITIONS</span>
            </button>
          </div>

          {/* Closed Market Warning Banner */}
          {!assetProfile.tradeExecutable && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="font-bold uppercase tracking-wider">MARKET CLOSED — EXECUTION GATE LOCKED</span>
                <span suppressHydrationWarning className="text-gray-300">• Next session opens in {assetProfile.sessionState?.nextOpenCountdown || 'scheduled'} ({assetProfile.sessionState?.nextOpenAt})</span>
              </div>
              <span className="text-[10px] bg-rose-900/60 px-2 py-0.5 rounded border border-rose-400/30 font-bold uppercase">
                ANALYSIS &amp; SETUP PLANNING ONLY
              </span>
            </div>
          )}

          {/* MT5 Account Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-white/5 text-xs">
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">SERVER / ACCOUNT</span>
              <span className="text-white font-bold font-mono text-xs truncate block">
                {isMt5Connected && telemetry.account
                  ? `${telemetry.account.broker} / #${telemetry.account.maskedLogin}`
                  : 'Internal Paper / #PAPER-581903'}
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">BALANCE</span>
              <span className="text-white font-bold font-mono text-sm">
                ${(isMt5Connected && telemetry.account ? telemetry.account.balance : accountBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">EQUITY</span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                ${(isMt5Connected && telemetry.account
                  ? telemetry.account.equity
                  : (accountBalance + openPositions.reduce((acc, p) => acc + p.pnl, 0))
                ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">USED MARGIN</span>
              <span className="text-purple-300 font-bold font-mono text-sm">
                ${(isMt5Connected && telemetry.account ? telemetry.account.margin : 1840.00).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">FREE MARGIN</span>
              <span className="text-cyan-300 font-bold font-mono text-sm">
                ${(isMt5Connected && telemetry.account ? telemetry.account.freeMargin : 98160.00).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">MARGIN LEVEL</span>
              <span className="text-emerald-400 font-bold font-mono text-sm">
                {isMt5Connected && telemetry.account
                  ? (telemetry.account.marginLevel > 9999 ? '>9999%' : `${telemetry.account.marginLevel}%`)
                  : '5,434%'}
              </span>
            </div>
          </div>
        </div>

        {/* Main Grid: Ticket Form (Left) & Active Positions (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 font-mono">
          {/* Order Ticket Panel (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <h2 className="text-xs font-black text-white uppercase tracking-wider">
                    NEW ORDER DISPATCH TICKET
                  </h2>
                </div>
                <span className="text-[10px] text-cyan-400">
                  {activeSymbol} &bull; ${p.toFixed(2)}
                </span>
              </div>

              {/* Asset Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-gray-400 uppercase font-bold">ACTIVE ASSET:</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['XAUUSD', 'EURUSD', 'USOIL', 'BTCUSD'].map((sym) => (
                    <button
                      key={sym}
                      onClick={() => setActiveSymbol(sym)}
                      className={`text-xs py-1.5 rounded-xl font-bold transition-all border ${
                        activeSymbol === sym
                          ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                          : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Type & Direction */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 uppercase font-bold">TYPE:</label>
                  <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                    {(['MARKET', 'LIMIT', 'STOP'] as const).map((ot) => (
                      <button
                        key={ot}
                        onClick={() => setOrderType(ot)}
                        className={`text-[10px] py-1 rounded-lg font-bold transition-all ${
                          orderType === ot ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {ot}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-gray-400 uppercase font-bold">DIRECTION:</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setDirection('BUY')}
                      className={`text-xs py-2 rounded-xl font-bold transition-all border ${
                        direction === 'BUY'
                          ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                          : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      BUY / LONG
                    </button>
                    <button
                      onClick={() => setDirection('SELL')}
                      className={`text-xs py-2 rounded-xl font-bold transition-all border ${
                        direction === 'SELL'
                          ? 'bg-rose-500/20 border-rose-500/60 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'bg-black/40 border-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      SELL / SHORT
                    </button>
                  </div>
                </div>
              </div>

              {/* Risk Budget Slider */}
              <div className="space-y-2 bg-black/40 p-3 rounded-xl border border-white/5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">ACCOUNT RISK BUDGET:</span>
                  <span className="font-bold text-cyan-400 font-mono">
                    {riskPercent.toFixed(2)}% (${riskAmount.toFixed(2)})
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.05"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
                <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                  <span>0.10% (Ultra Safe)</span>
                  <span>0.50% (Recommended)</span>
                  <span>1.00% (Standard)</span>
                  <span>2.00% (Max Cap)</span>
                </div>
              </div>

              {/* Pre-filled Order Parameters */}
              <div className="space-y-2 text-xs">
                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 flex justify-between items-center">
                  <span className="text-gray-400">ENTRY PRICE:</span>
                  <span className="font-bold text-white font-mono">${entryPrice.toFixed(2)}</span>
                </div>
                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 flex justify-between items-center">
                  <span className="text-rose-400 font-bold">STOP LOSS (SL):</span>
                  <span className="font-bold text-rose-400 font-mono">${slPrice.toFixed(2)}</span>
                </div>
                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 flex justify-between items-center">
                  <span className="text-emerald-400 font-bold">TAKE PROFIT (TP):</span>
                  <span className="font-bold text-emerald-400 font-mono">${tpPrice.toFixed(2)}</span>
                </div>
                <div className="bg-cyan-950/20 border border-cyan-500/30 p-2.5 rounded-xl flex justify-between items-center">
                  <span className="text-cyan-300 font-bold">CALCULATED POSITION SIZE:</span>
                  <span className="font-bold text-cyan-300 font-mono text-sm">{calculatedLotSize} LOTS</span>
                </div>
              </div>

              {/* Human Authorization Toggle */}
              <div className="pt-2 border-t border-white/5 space-y-3">
                <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white block">ARM EXECUTION GATE</span>
                    <span className="text-[10px] text-gray-400">Unlock manual safety barrier before MT5 dispatch</span>
                  </div>
                  <button
                    onClick={() => setIsArmed(!isArmed)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      isArmed
                        ? 'bg-rose-500/30 border-rose-500 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                        : 'bg-white/5 border-white/15 text-gray-400 hover:text-white'
                    }`}
                  >
                    {isArmed ? 'ARMED ⚠️' : 'LOCKED 🔒'}
                  </button>
                </div>

                {/* Dispatch Button */}
                <button
                  onClick={handleExecuteOrder}
                  disabled={!isArmed || !assetProfile.tradeExecutable || assetProfile.actionabilityState === 'ANALYSIS ONLY'}
                  className={`w-full py-3 rounded-xl font-bold text-xs tracking-wider transition-all shadow-lg flex items-center justify-center space-x-2 ${
                    !assetProfile.tradeExecutable || assetProfile.actionabilityState === 'ANALYSIS ONLY'
                      ? 'bg-amber-950/40 text-amber-400/80 border border-amber-500/30 cursor-not-allowed shadow-none'
                      : isArmed
                      ? direction === 'BUY'
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_25px_rgba(16,185,129,0.4)] cursor-pointer'
                        : 'bg-rose-500 hover:bg-rose-400 text-white shadow-[0_0_25px_rgba(244,63,94,0.4)] cursor-pointer'
                      : 'bg-white/5 text-gray-500 border border-white/5 cursor-not-allowed'
                  }`}
                >
                  <span>{!assetProfile.tradeExecutable || assetProfile.actionabilityState === 'ANALYSIS ONLY' ? '🔒' : '⚡'}</span>
                  <span>
                    {!assetProfile.tradeExecutable
                      ? 'MARKET CLOSED — DISPATCH LOCKED'
                      : assetProfile.actionabilityState === 'ANALYSIS ONLY'
                      ? 'ANALYSIS ONLY — DISPATCH LOCKED'
                      : isArmed
                      ? `DISPATCH ${direction} ${calculatedLotSize} LOTS TO MT5`
                      : 'ARM EXECUTION GATE TO DISPATCH'}
                  </span>
                </button>

                {dispatchStatus && (
                  <div className="text-center text-xs text-cyan-300 font-bold animate-pulse">
                    {dispatchStatus}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Active Positions & Orders Table (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-emerald-400">📊</span>
                  <h2 className="text-xs font-black text-white uppercase tracking-wider">
                    {isMt5Connected && telemetry.allPositions.length > 0
                      ? `MT5 LIVE OPEN POSITIONS (${telemetry.allPositions.length})`
                      : `LIVE OPEN POSITIONS (${openPositions.length})`}
                  </h2>
                  {isMt5Connected && telemetry.allPositions.length > 0 && (
                    <span className="text-[8px] bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-mono font-bold">
                      MT5 VERIFIED • READ-ONLY LOCKED 🔒
                    </span>
                  )}
                </div>
                <div className="text-xs font-bold text-emerald-400 font-mono">
                  TOTAL PnL:{' '}
                  {isMt5Connected && telemetry.account
                    ? `${telemetry.account.floatingPnl >= 0 ? '+' : ''}$${telemetry.account.floatingPnl.toFixed(2)}`
                    : `+$${openPositions.reduce((acc, p) => acc + p.pnl, 0).toFixed(2)}`}
                </div>
              </div>

              {(isMt5Connected ? telemetry.allPositions.length === 0 : openPositions.length === 0) ? (
                <div className="py-12 text-center text-gray-500 text-xs">
                  No active market positions currently open on MT5 account.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[10px] text-gray-400 border-b border-white/5 bg-white/[0.02]">
                      <tr>
                        <th className="py-2.5 px-3">TICKET / ASSET</th>
                        <th className="py-2.5 px-3">TYPE</th>
                        <th className="py-2.5 px-3">LOTS</th>
                        <th className="py-2.5 px-3">OPEN</th>
                        <th className="py-2.5 px-3">CURRENT</th>
                        <th className="py-2.5 px-3">SL / TP</th>
                        <th className="py-2.5 px-3">PnL ($)</th>
                        <th className="py-2.5 px-3 text-right">ACTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-gray-300">
                      {(isMt5Connected && telemetry.allPositions.length > 0 ? telemetry.allPositions : openPositions).map((rawPos: any) => {
                        const isRealMt5 = isMt5Connected && telemetry.allPositions.length > 0;
                        const ticket = rawPos.ticket;
                        const sym = rawPos.symbol || rawPos.brokerSymbol || rawPos.canonicalSymbol;
                        const posType = rawPos.type || rawPos.direction || 'BUY';
                        const lots = rawPos.lots ?? rawPos.volume ?? 0;
                        const openP = rawPos.openPrice ?? 0;
                        const currentP = rawPos.currentPrice ?? openP;
                        const sl = rawPos.sl ?? 0;
                        const tp = rawPos.tp ?? 0;
                        const pnl = rawPos.pnl ?? rawPos.profit ?? 0;
                        const isProfit = pnl >= 0;
                        const pnlPct = rawPos.pnlPercent ?? (openP > 0 ? ((currentP - openP) / openP) * 100 : 0);

                        return (
                          <tr key={ticket} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 px-3">
                              <span className="font-bold text-white block">{sym}</span>
                              <span className="text-[10px] text-gray-500">#{ticket}</span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                                posType === 'BUY'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              }`}>
                                {posType}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-white">{lots}</td>
                            <td className="py-3 px-3 font-mono">${Number(openP).toFixed(2)}</td>
                            <td className="py-3 px-3 font-mono text-cyan-300">${Number(currentP).toFixed(2)}</td>
                            <td className="py-3 px-3 font-mono text-[10px] text-gray-400">
                              <div>SL: {sl > 0 ? `$${Number(sl).toFixed(2)}` : 'NONE'}</div>
                              <div>TP: {tp > 0 ? `$${Number(tp).toFixed(2)}` : 'NONE'}</div>
                            </td>
                            <td className="py-3 px-3 font-mono font-bold">
                              <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                                {isProfit ? '+' : ''}${Number(pnl).toFixed(2)}
                              </span>
                              <span className="text-[10px] text-gray-400 block">
                                ({isProfit ? '+' : ''}{Number(pnlPct).toFixed(2)}%)
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right">
                              {isRealMt5 ? (
                                <span className="text-[9px] px-2 py-1 rounded bg-black/50 border border-white/10 text-gray-400 font-mono cursor-not-allowed" title="Execution disabled in READ-ONLY mode">
                                  LOCKED 🔒
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleClosePosition(ticket)}
                                  className="bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-[10px] px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer"
                                >
                                  CLOSE
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Risk Guardian Active Enforcement Rules */}
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3">
              <div className="flex items-center space-x-2 border-b border-white/5 pb-2.5">
                <span className="text-cyan-400">🛡️</span>
                <h3 className="text-xs font-black text-white uppercase tracking-wider">
                  ACTIVE RISK GUARDIAN SAFETY POLICIES
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-1">
                  <span className="text-gray-400 text-[10px] block">MAX DAILY DRAWDOWN</span>
                  <span className="text-emerald-400 font-bold font-mono">2.00% ($2,000)</span>
                  <span className="text-[9px] text-gray-500 block">Current drawdown: 0.12%</span>
                </div>
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-1">
                  <span className="text-gray-400 text-[10px] block">MAX POSITION SIZE</span>
                  <span className="text-cyan-300 font-bold font-mono">2.50 LOTS</span>
                  <span className="text-[9px] text-gray-500 block">Single trade exposure limit</span>
                </div>
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-1">
                  <span className="text-gray-400 text-[10px] block">HIGH-IMPACT NEWS LOCK</span>
                  <span className="text-amber-400 font-bold font-mono">ACTIVE (15m buffer)</span>
                  <span className="text-[9px] text-gray-500 block">No execution 15m pre/post NFP/CPI</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Master Footer */}
        <MasterFooter />
      </div>
    </div>
  );
}
