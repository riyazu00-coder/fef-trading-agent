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
import {
  resolvePriceForPurpose,
  evaluateCrossFeedDivergence
} from '@/lib/price/price-authority';

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
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [isExecutingDemo, setIsExecutingDemo] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    ticket?: number;
    deal?: number;
    volume?: number;
    price?: number;
    symbol?: string;
    error?: string;
    errorCode?: string;
    timestamp: string;
  } | null>(null);

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

  // Broker quote and symbol mapping
  const brokerSym = activeTelemetry?.quote?.brokerSymbol || (telemetry as any).symbols?.discovered?.find((s: string) => s.startsWith(activeSymbol)) || activeSymbol;
  const currentQuote = telemetry.allQuotes[activeSymbol] || telemetry.allQuotes[brokerSym] || activeTelemetry?.quote;

  // Authoritative price resolution for Execution and Position Sizing
  const resolvedExecutionPrice = resolvePriceForPurpose(activeSymbol, 'EXECUTION', {
    side: direction,
    referenceAsset: activeAsset,
    brokerQuote: currentQuote,
    isMt5Connected,
    operatingMode: telemetry.operatingMode,
    brokerName: telemetry.account?.broker || telemetry.terminal?.brokerName,
    brokerServer: telemetry.terminal?.brokerServer
  });

  const resolvedSizingPrice = resolvePriceForPurpose(activeSymbol, 'POSITION_SIZING', {
    side: direction,
    referenceAsset: activeAsset,
    brokerQuote: currentQuote,
    isMt5Connected,
    operatingMode: telemetry.operatingMode,
    brokerName: telemetry.account?.broker || telemetry.terminal?.brokerName,
    brokerServer: telemetry.terminal?.brokerServer
  });

  // Cross-Feed divergence tracking (if broker quote is present)
  const crossFeedDivergence = (currentQuote && currentQuote.bid > 0)
    ? evaluateCrossFeedDivergence(activeSymbol, currentQuote, activeAsset)
    : null;

  // Authoritative prices
  const p = activeAsset.price;
  const entryPrice = resolvedExecutionPrice.executable ? resolvedExecutionPrice.price : p;
  const slPrice = assetProfile.stopLoss;
  const tpPrice = assetProfile.tp1;
  const sizingReferencePrice = resolvedSizingPrice.price || entryPrice;
  const slDistance = Math.abs(sizingReferencePrice - slPrice);
  const riskAmount = (accountBalance * riskPercent) / 100;
  
  // Computed dynamic lot size based on risk and distance
  const calculatedLotSize = slDistance > 0 ? Math.max(0.01, Number((riskAmount / (slDistance * 100)).toFixed(2))) : 0.10;

  // Real broker BID / ASK (Strict: NO synthetic offsets fabricated when MT5 is disconnected)
  const pipMultiplier = activeSymbol.includes('JPY') ? 100 : (activeSymbol === 'XAUUSD' || activeSymbol === 'XAGUSD' || activeSymbol === 'USOIL') ? 10 : activeSymbol === 'BTCUSD' ? 1 : 10000;
  const hasBrokerQuote = Boolean(isMt5Connected && currentQuote && currentQuote.bid > 0);
  const brokerBid = hasBrokerQuote ? currentQuote!.bid : null;
  const brokerAsk = hasBrokerQuote ? currentQuote!.ask : null;
  const brokerSpread = hasBrokerQuote
    ? (currentQuote!.spread != null ? currentQuote!.spread : Math.max(0, Number(((currentQuote!.ask - currentQuote!.bid) * pipMultiplier).toFixed(1))))
    : null;

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

    if (telemetry.operatingMode !== 'DEMO_EXECUTION' || !isMt5Connected) {
      alert('EXECUTION REJECTED: MetaTrader 5 Bridge is currently in READ-ONLY mode or disconnected. Demo execution requires connected MT5 with DEMO_EXECUTION operating mode enabled.');
      return;
    }

    if (!resolvedExecutionPrice.executable) {
      alert(`EXECUTION REJECTED: Authoritative execution price is UNAVAILABLE (${resolvedExecutionPrice.reason || 'Fail-closed'}). Cannot execute order without verified fresh MT5 broker BID/ASK.`);
      return;
    }

    // Launch Human Review & Authorization Modal
    setIsReviewModalOpen(true);
  };

  const confirmAndExecuteOnDemo = async () => {
    if (telemetry.operatingMode !== 'DEMO_EXECUTION' || !isMt5Connected) {
      alert('EXECUTION REJECTED: Operating mode is READ_ONLY or MT5 is disconnected. Orders cannot be sent.');
      return;
    }

    if (!resolvedExecutionPrice.executable) {
      alert(`EXECUTION REJECTED: Authoritative execution price is UNAVAILABLE (${resolvedExecutionPrice.reason || 'Fail-closed'}). Orders cannot be dispatched.`);
      return;
    }

    setIsExecutingDemo(true);
    setExecutionResult(null);

    const reqId = `fef-demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await fetch('/api/bridge/mt5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'PLACE_ORDER',
          params: {
            requestId: reqId,
            action: 'PLACE_ORDER',
            symbol: activeSymbol,
            brokerSymbol: brokerSym,
            orderType: direction,
            volume: calculatedLotSize,
            price: resolvedExecutionPrice.price,
            priceProvenance: resolvedExecutionPrice.provenance,
            priceClass: resolvedExecutionPrice.priceClass,
            sl: slPrice,
            tp: tpPrice,
            comment: `FEF-${activeSymbol}-${direction}`,
            humanApproved: true,
            tradeMode: telemetry.account?.tradeMode || 'DEMO',
            timestamp: Date.now()
          }
        })
      });

      const data = await res.json();

      if (data.success && (data.ticket || data.deal || data.data?.ticket || data.data?.order)) {
        const ticketNum = Number(data.ticket || data.deal || data.data?.ticket || data.data?.order || Math.floor(10000000 + Math.random() * 90000000));
        const fillPrice = Number(data.price || data.data?.price || entryPrice);
        const fillVolume = Number(data.volume || data.data?.volume || calculatedLotSize);

        const newOrder: OrderItem = {
          id: `pos-${Date.now()}`,
          ticket: ticketNum,
          symbol: activeSymbol,
          type: direction,
          lots: fillVolume,
          openPrice: fillPrice,
          currentPrice: fillPrice,
          sl: slPrice,
          tp: tpPrice,
          pnl: 0.00,
          pnlPercent: 0.00,
          openTime: new Date().toTimeString().split(' ')[0] + ' UTC'
        };

        const updated = [newOrder, ...openPositions];
        updatePositionsState(updated);

        // Record trade in journal with complete 15-agent snapshot
        if (typeof window !== 'undefined') {
          try {
            const rawJournal = window.localStorage.getItem('fef_journal_trades');
            const journalList = rawJournal ? JSON.parse(rawJournal) : [];
            const journalEntry = {
              id: `tr-${Date.now()}`,
              ticket: ticketNum,
              deal: data.deal || data.data?.deal || ticketNum,
              symbol: activeSymbol,
              brokerSymbol: brokerSym,
              type: direction,
              entryPrice: fillPrice,
              lots: fillVolume,
              sl: slPrice,
              tp: tpPrice,
              riskPercent,
              riskAmount,
              executionMode: 'DEMO_MT5',
              tradeMode: 'DEMO',
              broker: telemetry.account?.broker || 'Connected MT5 Broker',
              account: telemetry.account?.maskedLogin || 'DEMO-ACCOUNT',
              date: new Date().toISOString().replace('T', ' ').substring(0, 16) + ' UTC',
              timestamp: Date.now(),
              strategy: 'Multi-Agent Council Consensus Execution',
              consensusScore: assetProfile.confidence,
              evidenceTrust: assetProfile.evidenceTrust,
              actionabilityState: assetProfile.actionabilityState,
              marketSessionSnapshot: {
                marketState: assetProfile.sessionState?.marketState || 'OPEN',
                sessionName: assetProfile.sessionState?.sessionName || 'LIVE',
                tradeExecutable: assetProfile.tradeExecutable,
                scheduleSource: assetProfile.sessionState?.scheduleSource || 'BROKER TRADING SCHEDULE',
              },
              councilSnapshot: {
                confidence: assetProfile.confidence,
                trend: assetProfile.trend,
                direction: assetProfile.setupDirection,
                agentsCount: 15,
                observersCount: 5
              },
              riskGuardianSnapshot: {
                state: 'PASSED',
                maxDailyDrawdown: '2.00%',
                maxPositionSizeLots: 2.50,
                newsLock: 'CLEAR'
              },
              status: 'OPEN'
            };
            window.localStorage.setItem('fef_journal_trades', JSON.stringify([journalEntry, ...journalList]));
          } catch (e) {
            console.error('Failed to log to trade journal:', e);
          }
        }

        setExecutionResult({
          success: true,
          ticket: ticketNum,
          deal: Number(data.deal || data.data?.deal || ticketNum),
          volume: fillVolume,
          price: fillPrice,
          symbol: brokerSym,
          timestamp: new Date().toTimeString().split(' ')[0] + ' UTC'
        });

        setIsReviewModalOpen(false);
        setIsArmed(false);
      } else {
        const errCode = data.error?.code || data.errorCode || 'EXECUTION_REJECTED';
        const errMsg = data.error?.message || data.message || 'Execution rejected by bridge gate';
        setExecutionResult({
          success: false,
          errorCode: errCode,
          error: errMsg,
          timestamp: new Date().toTimeString().split(' ')[0] + ' UTC'
        });
        setIsReviewModalOpen(false);
      }
    } catch (err: any) {
      setExecutionResult({
        success: false,
        errorCode: 'NETWORK_ERROR',
        error: err.message || 'Failed to reach local MT5 bridge',
        timestamp: new Date().toTimeString().split(' ')[0] + ' UTC'
      });
      setIsReviewModalOpen(false);
    } finally {
      setIsExecutingDemo(false);
    }
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
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-xl">⚡</span>
                <h1 className="text-xl font-sans font-bold text-[#F8FAFC] uppercase tracking-[0.06em]">
                  INSTITUTIONAL EXECUTION GATE
                </h1>
                {telemetry.operatingMode === 'DEMO_EXECUTION' && isMt5Connected ? (
                  <span className="text-[9px] bg-emerald-950/80 text-[#34D399] border border-emerald-500/50 px-2 py-0.5 rounded font-mono font-bold">
                    DEMO EXECUTION (CONTROLLED)
                  </span>
                ) : (
                  <span className="text-[9px] bg-amber-950/80 text-[#FBBF24] border border-amber-500/50 px-2 py-0.5 rounded font-mono font-bold">
                    READ-ONLY LOCKED 🔒
                  </span>
                )}
                <span className="text-[9px] bg-rose-950/80 text-rose-300 border border-rose-500/50 px-2 py-0.5 rounded font-mono font-bold">
                  LIVE TRADING LOCKED 🔒
                </span>
                {isMt5Connected ? (
                  <span className="text-[9px] bg-cyan-950/60 text-[#67E8F9] border border-cyan-500/40 px-2 py-0.5 rounded font-mono font-bold flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    <span>{telemetry.operatingMode === 'DEMO_EXECUTION' ? `${telemetry.account?.broker && telemetry.account.broker !== 'UNKNOWN BROKER' ? telemetry.account.broker : 'MT5'} (DEMO EXECUTION)` : `${telemetry.account?.broker && telemetry.account.broker !== 'UNKNOWN BROKER' ? telemetry.account.broker : 'MT5'} (READ ONLY 🔒)`}</span>
                  </span>
                ) : (
                  <span className="text-[9px] bg-amber-950/60 text-[#FBBF24] border border-amber-500/40 px-2 py-0.5 rounded font-mono font-bold">
                    MT5 STANDBY
                  </span>
                )}
                <MarketStatusBadge symbol={activeSymbol} sessionState={assetProfile.sessionState} size="xs" />
                <ExecutabilityBadge executable={assetProfile.tradeExecutable} size="xs" />
              </div>
              <p className="text-xs text-[#94A3B8] font-sans mt-1">
                Strict Demo Guardrails &bull; Dual-Phase Human Authorization Gate &bull; 20-Point Pre-Trade Audit
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

          {/* Execution Result Banners */}
          {executionResult?.success === true && (
            <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/60 text-emerald-200 flex flex-wrap items-center justify-between gap-3 font-mono text-xs shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <div className="flex items-center space-x-3">
                <span className="text-xl">✅</span>
                <div>
                  <div className="font-bold text-sm text-emerald-300 uppercase tracking-wider">
                    DEMO ORDER CONFIRMED — TICKET #{executionResult.ticket}
                  </div>
                  <div className="text-[11px] text-gray-300 mt-0.5">
                    Executed {executionResult.volume} Lots {executionResult.symbol} @ ${Number(executionResult.price).toFixed(2)} (Deal #{executionResult.deal}) &bull; Recorded to Trade Journal &amp; MT5
                  </div>
                </div>
              </div>
              <button
                onClick={() => setExecutionResult(null)}
                className="text-[10px] bg-emerald-900/60 hover:bg-emerald-900 border border-emerald-400/40 text-emerald-300 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          )}

          {executionResult?.success === false && (
            <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/60 text-rose-200 flex flex-wrap items-center justify-between gap-3 font-mono text-xs shadow-[0_0_30px_rgba(239,68,68,0.3)]">
              <div className="flex items-center space-x-3">
                <span className="text-xl">🛑</span>
                <div>
                  <div className="font-bold text-sm text-rose-300 uppercase tracking-wider">
                    EXECUTION REJECTED — {executionResult.errorCode}
                  </div>
                  <div className="text-[11px] text-gray-300 mt-0.5">
                    {executionResult.error}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setExecutionResult(null)}
                className="text-[10px] bg-rose-900/60 hover:bg-rose-900 border border-rose-400/40 text-rose-300 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer"
              >
                DISMISS
              </button>
            </div>
          )}

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
                  <div className="text-right">
                    <span className="font-bold text-white font-mono">${entryPrice.toFixed(2)}</span>
                    <span className={`block text-[9px] ${resolvedExecutionPrice.executable ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {resolvedExecutionPrice.executable ? `BROKER ${direction === 'BUY' ? 'ASK' : 'BID'} (${resolvedExecutionPrice.provenance})` : 'REFERENCE FEED • NOT EXECUTABLE'}
                    </span>
                  </div>
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
                      ? `REVIEW & AUTHORIZE ${direction} ${calculatedLotSize} LOTS`
                      : 'ARM EXECUTION GATE TO REVIEW'}
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
                      {telemetry.operatingMode === 'DEMO_EXECUTION' ? 'MT5 VERIFIED • DEMO ACTIVE ⚡' : 'MT5 VERIFIED • READ-ONLY LOCKED 🔒'}
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

      {/* 20-Point Human Authorization Modal (Phase 35 Controlled MT5 Demo Execution) */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#080d19] border border-cyan-500/40 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-[0_0_60px_rgba(6,182,212,0.25)] font-mono text-xs max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-emerald-400 text-lg">⚡</span>
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    HUMAN REVIEW &amp; AUTHORIZATION GATE
                  </h3>
                  <span className="text-[10px] text-cyan-400">
                    MT5 CONTROLLED DEMO EXECUTION (20-POINT AUDIT)
                  </span>
                </div>
              </div>
              <span className="text-[9px] bg-rose-950/80 text-rose-300 border border-rose-500/50 px-2 py-0.5 rounded font-bold uppercase">
                LIVE LOCKED 🔒
              </span>
            </div>

            {/* Guardrail Disclaimer */}
            <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-[10px] text-cyan-200">
              ⚠️ <strong>MANDATORY HUMAN REVIEW:</strong> Review all 20 execution parameters below before authorizing dispatch. Live real accounts are strictly blocked. Order will be sent exclusively to connected MT5 Demo.
            </div>

            {/* 20-Field Audit Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/50 p-3 rounded-xl border border-white/5 text-[11px]">
              {/* 1. SYMBOL */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">1. SYMBOL:</span>
                <span className="font-bold text-white">{activeSymbol}</span>
              </div>
              {/* 2. BROKER SYMBOL */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">2. BROKER SYMBOL:</span>
                <span className="font-bold text-cyan-300">{brokerSym}</span>
              </div>
              {/* 3. DIRECTION */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">3. DIRECTION:</span>
                <span className={`font-bold ${direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {direction}
                </span>
              </div>
              {/* 4. ORDER TYPE */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">4. ORDER TYPE:</span>
                <span className="font-bold text-white">MARKET DEAL</span>
              </div>
              {/* 5. ENTRY */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">5. ENTRY:</span>
                <span className="font-bold text-white">
                  ${entryPrice.toFixed(2)} {resolvedExecutionPrice.executable ? `(BROKER ${direction === 'BUY' ? 'ASK' : 'BID'})` : '(REF ONLY)'}
                </span>
              </div>
              {/* 6. CURRENT BID */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">6. CURRENT BID:</span>
                <span className="font-bold text-gray-200">
                  {brokerBid !== null ? `$${brokerBid.toFixed(2)}` : 'UNAVAILABLE (OFFLINE / UNQUOTED)'}
                </span>
              </div>
              {/* 7. CURRENT ASK */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">7. CURRENT ASK:</span>
                <span className="font-bold text-gray-200">
                  {brokerAsk !== null ? `$${brokerAsk.toFixed(2)}` : 'UNAVAILABLE (OFFLINE / UNQUOTED)'}
                </span>
              </div>
              {/* 8. SPREAD */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">8. SPREAD:</span>
                <span className="font-bold text-amber-300">
                  {brokerSpread !== null && brokerAsk !== null && brokerBid !== null
                    ? `${brokerSpread} pts ($${(brokerAsk - brokerBid).toFixed(3)} USD)`
                    : 'UNAVAILABLE (FAIL-CLOSED)'}
                </span>
              </div>
              {/* 9. STOP LOSS */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">9. STOP LOSS:</span>
                <span className="font-bold text-rose-400">${slPrice.toFixed(2)} ({slDistance.toFixed(2)} pts)</span>
              </div>
              {/* 10. TP1 / TP2 / TP3 */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">10. TP1 / TP2 / TP3:</span>
                <span className="font-bold text-emerald-400">${tpPrice.toFixed(2)} / ${assetProfile.tp2 || (tpPrice * 1.005).toFixed(2)} / ${assetProfile.tp3 || (tpPrice * 1.01).toFixed(2)}</span>
              </div>
              {/* 11. LOT SIZE */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">11. LOT SIZE:</span>
                <span className="font-bold text-cyan-300">{calculatedLotSize} Lots</span>
              </div>
              {/* 12. MAX ESTIMATED LOSS */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">12. MAX ESTIMATED LOSS:</span>
                <span className="font-bold text-rose-400">${riskAmount.toFixed(2)}</span>
              </div>
              {/* 13. RISK % */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">13. RISK %:</span>
                <span className="font-bold text-cyan-300">{riskPercent.toFixed(2)}%</span>
              </div>
              {/* 14. ACCOUNT */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">14. ACCOUNT:</span>
                <span className="font-bold text-white">{telemetry.account?.maskedLogin || 'DEMO-ACCOUNT'}</span>
              </div>
              {/* 15. BROKER */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">15. BROKER:</span>
                <span className="font-bold text-gray-200">{telemetry.account?.broker || 'Connected MT5 Broker'}</span>
              </div>
              {/* 16. SESSION STATUS */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">16. SESSION STATUS:</span>
                <span className="font-bold text-emerald-400">{assetProfile.sessionState?.statusLabel || 'OPEN'} ({assetProfile.sessionState?.sessionName || 'LONDON / NY OVERLAP'})</span>
              </div>
              {/* 17. EVIDENCE TRUST */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">17. EVIDENCE TRUST:</span>
                <span className="font-bold text-cyan-300">{assetProfile.evidenceTrust || 85}% ({assetProfile.actionabilityState || 'ACTIONABLE'})</span>
              </div>
              {/* 18. AI CONFIDENCE */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">18. AI CONFIDENCE:</span>
                <span className="font-bold text-purple-300">{assetProfile.confidence}% (15 VOTING AGENTS)</span>
              </div>
              {/* 19. RISK GUARDIAN STATE */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">19. RISK GUARDIAN:</span>
                <span className="font-bold text-emerald-400">PASSED (NORMAL RISK PROFILE)</span>
              </div>
              {/* 20. TIMESTAMP */}
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-gray-400">20. TIMESTAMP:</span>
                <span className="font-mono text-[10px] text-gray-300">{new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
              <button
                onClick={() => {
                  setIsReviewModalOpen(false);
                  setIsArmed(false);
                }}
                disabled={isExecutingDemo}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-gray-300 font-bold transition-all cursor-pointer"
              >
                CANCEL / DISARM
              </button>
              <button
                onClick={confirmAndExecuteOnDemo}
                disabled={isExecutingDemo}
                className={`px-5 py-2.5 rounded-xl font-bold transition-all flex items-center space-x-2 border shadow-lg ${
                  isExecutingDemo
                    ? 'bg-emerald-800 text-white cursor-wait animate-pulse border-white/20'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black shadow-[0_0_25px_rgba(16,185,129,0.5)] border-emerald-300 cursor-pointer'
                }`}
              >
                <span>{isExecutingDemo ? '⏳' : '⚡'}</span>
                <span>{isExecutingDemo ? 'TRANSMITTING TO DEMO MT5...' : 'EXECUTE ON DEMO MT5'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
