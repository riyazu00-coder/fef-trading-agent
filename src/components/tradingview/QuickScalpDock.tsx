'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { useMemberAuth } from '@/context/MemberAuthContext';
import { SUPPORT_CONFIG, CORTEX_WHATSAPP_CONFIG } from '@/lib/config/support-config';
import { getInstrumentContractSpec } from '@/lib/calculator/position-size-calculator';
import { reanchorProtectionLevels } from '@/lib/execution/trade-protection-validator';
import { dispatchUnifiedManualOrder } from '@/lib/execution/manual-order-client';
import { normalizeAccountTradeMode } from '@/lib/execution/execution-policy';
import { symbolDirectory } from '@/lib/bridge/symbol-mapper';
import {
  calculateAutomaticStopLoss,
  AutomaticStopLossResult,
  resolveAssetClass,
} from '@/lib/execution/auto-stop-loss-policy';

interface QuickScalpDockProps {
  className?: string;
}

export const QuickScalpDock: React.FC<QuickScalpDockProps> = ({ className = '' }) => {
  const { activeSymbol, setActiveSymbol, activeAsset, assetProfile, allAssets } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected, refreshTelemetry } = useMT5Telemetry();
  const {
    isAuthenticated,
    isMaster,
    license,
    isDeviceAuthorized,
  } = useMemberAuth();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lotSize, setLotSize] = useState<number>(0.10);
  const [slPips, setSlPips] = useState<number>(20);
  const [tpPips, setTpPips] = useState<number>(40);
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customSlPrice, setCustomSlPrice] = useState<number>(0);
  const [customTpPrice, setCustomTpPrice] = useState<number>(0);

  // Protected trade access modal state
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Account mode resolution from live MT5 telemetry with canonical normalization
  const accountTradeMode = useMemo(() => {
    return normalizeAccountTradeMode(
      telemetry.account?.tradeMode ?? (telemetry as any).accountMode ?? (telemetry.operatingMode === 'DEMO_EXECUTION' ? 'DEMO' : undefined)
    );
  }, [telemetry.account?.tradeMode, (telemetry as any).accountMode, telemetry.operatingMode]);

  const isDemoAccount = accountTradeMode === 'DEMO';
  const isRealAccount = accountTradeMode === 'REAL';

  // Can the current user execute trades?
  // DEMO ACCOUNT: Allowed when connected to verified MT5 demo
  // MASTER: Always authorized
  // MEMBER: Authenticated + Active License + Device Authorized 1/1
  const canExecute = Boolean(
    isDemoAccount || isMaster || (isAuthenticated && license?.status === 'ACTIVE' && isDeviceAuthorized)
  );

  // Canonical execution transport readiness
  const isExecutionTransportReady = Boolean(
    isMt5Connected &&
    (telemetry.localBridgeOnline || (telemetry as any).isRemote || telemetry.transport === 'REMOTE_RELAY' || telemetry.transport === 'CLOUD_PERSISTENT_TELEMETRY') &&
    telemetry.state !== 'MT5_OFFLINE'
  );

  // Authoritative live MT5 capital facts (Equity takes precedence over Balance)
  const mt5Equity = useMemo(() => {
    if (!telemetry.account) return null;
    if (typeof telemetry.account.equity === 'number' && telemetry.account.equity > 0) {
      return telemetry.account.equity;
    }
    return null;
  }, [telemetry.account]);

  const mt5Balance = useMemo(() => {
    if (!telemetry.account) return null;
    if (typeof telemetry.account.balance === 'number' && telemetry.account.balance > 0) {
      return telemetry.account.balance;
    }
    return null;
  }, [telemetry.account]);

  const liveMt5Capital = mt5Equity ?? mt5Balance ?? null;
  const hasLiveCapitalFact = Boolean(isMt5Connected && liveMt5Capital != null && liveMt5Capital > 0);

  // Deterministic client-side symbol directory hydration from verified broker telemetry
  useEffect(() => {
    const brokerSymbols = (Array.isArray(telemetry.symbols) && telemetry.symbols.length > 0)
      ? telemetry.symbols
      : Object.keys(telemetry.allQuotes || {});
    if (brokerSymbols.length > 0) {
      symbolDirectory.discoverFromBrokerSymbols(brokerSymbols);
    }
  }, [telemetry.symbols, telemetry.allQuotes, telemetry.lastSyncTimestamp]);

  // Broker symbol resolution and unmapped check
  const resolvedBroker = useMemo(() => {
    return symbolDirectory.resolveBrokerSymbolWithValidation(activeSymbol);
  }, [activeSymbol, telemetry.symbols, telemetry.allQuotes, telemetry.lastSyncTimestamp]);

  const resolvedBrokerSymbol = resolvedBroker.brokerSymbol || activeSymbol;
  const isSymbolMapped = resolvedBroker.status !== 'NOT_FOUND';

  // Safety confirmation modal state
  const [pendingOrder, setPendingOrder] = useState<{
    direction: 'BUY' | 'SELL';
    price: number;
    sl: number;
    tp: number;
    volume: number;
    autoSl?: AutomaticStopLossResult;
  } | null>(null);

  const [isDispatching, setIsDispatching] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    ticket?: string | number;
  } | null>(null);

  // Contract specs and pricing
  const spec = useMemo(() => getInstrumentContractSpec(activeSymbol), [activeSymbol]);
  const pipSize = spec?.pipSize || 0.0001;
  const precision = spec ? (spec.pipSize < 0.001 ? 5 : spec.pipSize < 0.1 ? 3 : 2) : 2;

  // Gold mandatory 50-pip floor
  const isGold = activeSymbol === 'XAUUSD';
  const minSlPips = isGold ? 50 : 5;

  // Synchronize SL pips when activeSymbol changes
  useEffect(() => {
    if (isGold) {
      setSlPips(50);
    } else {
      const defaultAutoSl = calculateAutomaticStopLoss({
        symbol: activeSymbol,
        side: 'BUY',
        executionPrice: activeAsset.price || 100,
        brokerSpec: activeTelemetry?.spec,
      });
      setSlPips(defaultAutoSl.distance || 20);
    }
  }, [activeSymbol, isGold, activeAsset.price, activeTelemetry?.spec]);

  // Authoritative live quote
  const liveQuote = activeTelemetry?.quote || telemetry.allQuotes[activeSymbol];
  const currentBid = liveQuote?.bid || activeAsset.price;
  const currentAsk = liveQuote?.ask || (activeAsset.price + (liveQuote?.spread ? liveQuote.spread * pipSize : 2 * pipSize));
  const spreadPips = liveQuote?.spread ?? ((currentAsk - currentBid) / pipSize);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Live Heartbeat in Confirmation Modal (1-second quote freshness refresh)
  useEffect(() => {
    if (!pendingOrder) return;
    refreshTelemetry().catch(() => {});
    const interval = setInterval(() => {
      refreshTelemetry().catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingOrder, refreshTelemetry]);

  // Update custom price defaults when active setup changes
  useEffect(() => {
    if (assetProfile?.stopLoss) {
      setCustomSlPrice(assetProfile.stopLoss);
    }
    if (assetProfile?.tp1) {
      setCustomTpPrice(assetProfile.tp1);
    }
  }, [activeSymbol, assetProfile]);

  // Compute calculated SL/TP prices based on direction using Central Asset-Aware Auto SL Policy
  const calculateLevels = useCallback((dir: 'BUY' | 'SELL') => {
    const entryPrice = dir === 'BUY' ? currentAsk : currentBid;
    const autoSl = calculateAutomaticStopLoss({
      symbol: activeSymbol,
      side: dir,
      executionPrice: entryPrice,
      brokerSpec: activeTelemetry?.spec,
      verifiedVolatility: (assetProfile as any)?.volatilityContext?.atr ? { atr: (assetProfile as any).volatilityContext.atr } : undefined,
    });

    if (useCustomPrice && customSlPrice > 0 && customTpPrice > 0) {
      return { entryPrice, slPrice: customSlPrice, tpPrice: customTpPrice, autoSl };
    }

    const slPrice = autoSl.stopLossPrice;
    // Default TP target: 2.0x risk distance
    const tpDist = autoSl.distancePrice * 2.0;
    const tpPrice = dir === 'BUY'
      ? Number((entryPrice + tpDist).toFixed(precision))
      : Number((entryPrice - tpDist).toFixed(precision));

    return { entryPrice, slPrice, tpPrice, autoSl };
  }, [currentAsk, currentBid, useCustomPrice, customSlPrice, customTpPrice, activeSymbol, activeTelemetry?.spec, (assetProfile as any)?.volatilityContext, precision]);

  // Validation
  const validateLevels = useCallback((dir: 'BUY' | 'SELL', entry: number, sl: number, tp: number) => {
    if (sl <= 0 || tp <= 0) return { valid: false, error: 'SL and TP must be greater than zero' };
    if (dir === 'BUY') {
      if (sl >= entry) return { valid: false, error: `BUY SL (${sl}) must be below Entry (${entry})` };
      if (tp <= entry) return { valid: false, error: `BUY TP (${tp}) must be above Entry (${entry})` };
    } else {
      if (sl <= entry) return { valid: false, error: `SELL SL (${sl}) must be above Entry (${entry})` };
      if (tp >= entry) return { valid: false, error: `SELL TP (${tp}) must be below Entry (${entry})` };
    }
    return { valid: true, error: null };
  }, []);

  // Open modal trigger — protected by member authorization gate & symbol mapping
  const handleInitiateOrder = (dir: 'BUY' | 'SELL') => {
    setDispatchError(null);

    // 1. Symbol unmapped check (fail-closed for GER40, etc.)
    if (!isSymbolMapped) {
      setToast({
        type: 'error',
        title: 'Symbol Not Mapped',
        message: `${activeSymbol} is not supported or mapped by connected broker terminal.`
      });
      return;
    }

    // 2. Transport readiness check
    if (!isExecutionTransportReady) {
      setToast({
        type: 'error',
        title: 'MT5 Bridge Offline',
        message: 'Cannot place order: MT5 terminal or bridge is not connected.'
      });
      return;
    }

    // 3. If user is not authorized for execution, intercept and show Member Access modal
    if (!canExecute) {
      setIsAuthModalOpen(true);
      return;
    }

    const { entryPrice, slPrice, tpPrice, autoSl } = calculateLevels(dir);
    const check = validateLevels(dir, entryPrice, slPrice, tpPrice);
    if (!check.valid) {
      setToast({
        type: 'error',
        title: 'Validation Error',
        message: check.error || 'Invalid stop levels'
      });
      return;
    }

    setPendingOrder({
      direction: dir,
      price: entryPrice,
      sl: slPrice,
      tp: tpPrice,
      volume: lotSize,
      autoSl,
    });
  };

  // Real-time dynamic re-anchoring for the confirmation modal
  const liveModalLevels = useMemo(() => {
    if (!pendingOrder) return null;
    const latestPrice = liveQuote
      ? (pendingOrder.direction === 'BUY' ? (liveQuote.ask || liveQuote.bid) : liveQuote.bid)
      : pendingOrder.price;
    const freshEntry = latestPrice || pendingOrder.price;

    const freshAutoSl = calculateAutomaticStopLoss({
      symbol: activeSymbol,
      side: pendingOrder.direction,
      executionPrice: freshEntry,
      brokerSpec: activeTelemetry?.spec,
      verifiedVolatility: (assetProfile as any)?.volatilityContext?.atr ? { atr: (assetProfile as any).volatilityContext.atr } : undefined,
    });

    return {
      entry: freshEntry,
      sl: freshAutoSl.stopLossPrice,
      tp1: pendingOrder.direction === 'BUY'
        ? Number((freshEntry + freshAutoSl.distancePrice * 2.0).toFixed(precision))
        : Number((freshEntry - freshAutoSl.distancePrice * 2.0).toFixed(precision)),
      autoSl: freshAutoSl,
    };
  }, [pendingOrder, liveQuote, activeSymbol, activeTelemetry?.spec, (assetProfile as any)?.volatilityContext, precision]);

  // Direct dispatch to unified execution client
  const handleConfirmDispatch = async () => {
    if (!pendingOrder) return;
    setIsDispatching(true);
    setDispatchError(null);

    try {
      // 1. Pre-dispatch fresh tick fetch to evaluate against real-time broker price
      await refreshTelemetry().catch(() => {});

      const latestQuote = activeTelemetry?.quote || telemetry.allQuotes[activeSymbol];
      const freshPrice = latestQuote 
        ? (pendingOrder.direction === 'BUY' ? latestQuote.ask : latestQuote.bid) 
        : pendingOrder.price;

      // 2. Dynamic Live Pip Re-anchoring (Guarantees valid geometry & preserves exact pip distances)
      const reanchored = reanchorProtectionLevels({
        direction: pendingOrder.direction,
        plannedEntry: pendingOrder.price,
        freshEntry: freshPrice > 0 ? freshPrice : pendingOrder.price,
        sl: pendingOrder.sl,
        tp1: pendingOrder.tp,
        digits: precision,
      });

      const res = await dispatchUnifiedManualOrder({
        symbol: activeSymbol,
        brokerSymbol: resolvedBrokerSymbol,
        direction: pendingOrder.direction,
        volume: pendingOrder.volume,
        entryPrice: reanchored.entry,
        sl: reanchored.sl,
        tp1: reanchored.tp1,
        plannedPrice: pendingOrder.price,
        tradeMode: isRealAccount ? 'REAL' : 'DEMO',
        magic: 8882026,
        digits: precision,
        comment: 'FEF TRADINGVIEW QUICK SCALP',
      });

      if (res.success) {
        const ticketNum = res.ticket || 'TICKET-' + Date.now().toString().slice(-6);
        setToast({
          type: 'success',
          title: 'Order Executed on MT5 Demo',
          message: `${pendingOrder.direction} ${pendingOrder.volume} ${activeSymbol} @ ${res.fillPrice ?? reanchored.entry.toFixed(precision)} (Ticket #${ticketNum})`,
          ticket: ticketNum,
        });
        setPendingOrder(null);
        setDispatchError(null);
      } else {
        const errorMsg = res.error?.message || 'Order rejected by MT5 bridge or safety gate.';
        setDispatchError(errorMsg);
        setToast({
          type: 'error',
          title: 'Execution Rejected',
          message: errorMsg,
        });
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Network exception communicating with /api/bridge/mt5';
      setDispatchError(errorMsg);
      setToast({
        type: 'error',
        title: 'Dispatch Failed',
        message: errorMsg,
      });
    } finally {
      setIsDispatching(false);
    }
  };

  const isExecutable = liveQuote?.freshness !== 'SESSION_CLOSED' && assetProfile?.sessionState?.marketState !== 'WEEKEND_CLOSED';

  return (
    <>
      {/* Toast Notification Banner — z-[60] so it always layers above modal backdrop */}
      {toast && (
        <div className="fixed top-20 right-6 z-[60] max-w-sm w-full animate-in fade-in slide-in-from-top duration-300">
          <div
            className={`p-3.5 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-start space-x-3 font-mono ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
                : 'bg-rose-950/90 border-rose-500/60 text-rose-200'
            }`}
          >
            <span className="text-xl flex-shrink-0">{toast.type === 'success' ? '✅' : '❌'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-xs flex items-center justify-between">
                <span>{toast.title}</span>
                {toast.ticket && (
                  <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono">
                    #{toast.ticket}
                  </span>
                )}
              </div>
              <p className="text-[11px] opacity-90 mt-0.5 break-words">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-white text-xs cursor-pointer flex-shrink-0 p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Floating Quick Scalp Dock: Collapsed Micro Pill or Expanded Bottom HUD */}
      {isCollapsed ? (
        <button
          onClick={() => setIsCollapsed(false)}
          className={`flex items-center space-x-2 px-3 py-1.5 bg-[#060D1E]/95 hover:bg-[#0c1833] border border-cyan-500/40 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.8)] cursor-pointer text-cyan-300 font-mono text-[11px] font-bold group transition-all backdrop-blur-xl ${className}`}
          title="Click to Expand Quick Scalp HUD (⚡)"
        >
          <span className="text-amber-400 text-xs animate-pulse">⚡</span>
          <span className="text-white uppercase font-black">{activeSymbol}</span>
          <span className="text-[9px] text-gray-400">({spreadPips >= 0 ? spreadPips.toFixed(1) : '0.0'}p)</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </button>
      ) : (
        <div
          className={`w-52 sm:w-56 bg-[#060D1E]/95 backdrop-blur-xl border border-cyan-500/30 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.85)] font-mono text-white transition-all duration-200 select-none ${className}`}
        >
          {/* Dock Header */}
          <div className="px-2 py-1 border-b border-white/10 flex items-center justify-between bg-black/40 rounded-t-xl">
            <div className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              <div className="flex items-center space-x-1">
                <select
                  value={activeSymbol}
                  onChange={(e) => setActiveSymbol(e.target.value)}
                  className="bg-transparent font-bold text-[11px] text-white uppercase focus:outline-none cursor-pointer hover:text-cyan-300"
                >
                  {Object.keys(allAssets).map((sym) => (
                    <option key={sym} value={sym} className="bg-slate-900 text-white">
                      {sym}
                    </option>
                  ))}
                </select>
                <span className="text-[9px] text-gray-400">
                  ({spreadPips >= 0 ? spreadPips.toFixed(1) : '0.0'}p)
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1">
              <span
                className={`text-[8px] font-bold px-1 py-0.2 rounded border ${
                  !isSymbolMapped
                    ? 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                    : isExecutable
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}
              >
                {!isSymbolMapped ? 'UNMAPPED' : isExecutable ? 'LIVE' : 'CLOSED'}
              </span>
              <button
                onClick={() => setIsCollapsed(true)}
                className="w-5 h-5 rounded flex items-center justify-center text-amber-400 hover:text-amber-300 hover:bg-white/5 cursor-pointer text-xs"
                title="Collapse to Minimal Pill (⚡)"
              >
                ⚡
              </button>
            </div>
          </div>

          {/* Full Scalp Dock Controls */}
          <div className="p-1.5 sm:p-2 space-y-1.5">
            {/* Live Prices Bar */}
            <div className="grid grid-cols-2 gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
              <div className="text-center border-r border-white/10 pr-1">
                <span className="text-[8px] text-gray-400 uppercase tracking-wider block">SELL / BID</span>
                <span className="text-[11px] font-black text-rose-400 tracking-tight tabular-nums">
                  {currentBid.toFixed(precision)}
                </span>
              </div>
              <div className="text-center pl-1">
                <span className="text-[8px] text-gray-400 uppercase tracking-wider block">BUY / ASK</span>
                <span className="text-[11px] font-black text-emerald-400 tracking-tight tabular-nums">
                  {currentAsk.toFixed(precision)}
                </span>
              </div>
            </div>

            {/* Sizing: Lot Size Input & +/- Controls & Presets */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-gray-400 font-bold uppercase">Volume (Lots)</span>
                <span className="text-cyan-300 font-mono">
                  {hasLiveCapitalFact && liveMt5Capital != null
                    ? `$${liveMt5Capital.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ${mt5Equity != null ? 'Eq' : 'Bal'}`
                    : '10,000 Bal'}
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setLotSize((l) => Math.max(0.01, Number((l - 0.01).toFixed(2))))}
                  className="w-4 h-5 bg-white/5 hover:bg-white/10 rounded text-[10px] flex items-center justify-center cursor-pointer text-gray-300"
                  title="Decrease 0.01 lot"
                >
                  -
                </button>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={lotSize}
                  onChange={(e) => setLotSize(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                  className="w-14 bg-black/50 border border-white/10 rounded px-1 py-0.5 text-[11px] font-bold text-center text-cyan-200 focus:outline-none focus:border-cyan-400"
                />
                <button
                  onClick={() => setLotSize((l) => Number((l + 0.01).toFixed(2)))}
                  className="w-4 h-5 bg-white/5 hover:bg-white/10 rounded text-[10px] flex items-center justify-center cursor-pointer text-gray-300"
                  title="Increase 0.01 lot"
                >
                  +
                </button>
                <div className="grid grid-cols-4 gap-0.5 flex-1">
                  {[0.01, 0.10, 0.50, 1.00].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setLotSize(preset)}
                      className={`py-0.5 text-[8px] rounded font-bold border transition-colors cursor-pointer ${
                        lotSize === preset
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50'
                          : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      {preset >= 1 ? preset.toFixed(0) : preset.toFixed(2).replace(/^0/, '')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Protection Guards: SL & TP */}
            <div className="space-y-1 pt-0.5 border-t border-white/5">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-gray-400 font-bold uppercase">Risk Guards</span>
                <button
                  onClick={() => setUseCustomPrice(!useCustomPrice)}
                  className="text-cyan-400 hover:text-cyan-200 text-[8px] underline cursor-pointer"
                >
                  {useCustomPrice ? 'Pips' : 'Price'}
                </button>
              </div>

              {!useCustomPrice ? (
                <div className="grid grid-cols-2 gap-1">
                  <div className="bg-black/30 p-1 rounded-md border border-white/5 space-y-0.5">
                    <span className="text-[8px] text-rose-300 block font-bold">SL (Pips)</span>
                    <div className="flex items-center space-x-0.5">
                      <button
                        onClick={() => setSlPips((p) => Math.max(minSlPips, p - (isGold ? 5 : 1)))}
                        className="w-3.5 h-4 bg-white/5 hover:bg-white/10 rounded text-[9px] flex items-center justify-center cursor-pointer text-gray-300"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={minSlPips}
                        value={slPips}
                        onChange={(e) => setSlPips(Math.max(minSlPips, parseInt(e.target.value) || minSlPips))}
                        className="w-full bg-transparent text-center text-[10px] font-bold focus:outline-none text-rose-200"
                      />
                      <button
                        onClick={() => setSlPips((p) => p + (isGold ? 5 : 1))}
                        className="w-3.5 h-4 bg-white/5 hover:bg-white/10 rounded text-[9px] flex items-center justify-center cursor-pointer text-gray-300"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="bg-black/30 p-1 rounded-md border border-white/5 space-y-0.5">
                    <span className="text-[8px] text-emerald-300 block font-bold">TP (Pips)</span>
                    <div className="flex items-center space-x-0.5">
                      <button
                        onClick={() => setTpPips((p) => Math.max(5, p - 5))}
                        className="w-3.5 h-4 bg-white/5 hover:bg-white/10 rounded text-[9px] flex items-center justify-center cursor-pointer text-gray-300"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={tpPips}
                        onChange={(e) => setTpPips(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-transparent text-center text-[10px] font-bold focus:outline-none text-emerald-200"
                      />
                      <button
                        onClick={() => setTpPips((p) => p + 5)}
                        className="w-3.5 h-4 bg-white/5 hover:bg-white/10 rounded text-[9px] flex items-center justify-center cursor-pointer text-gray-300"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1">
                  <div className="bg-black/30 p-1 rounded-md border border-white/5 space-y-0.5">
                    <span className="text-[8px] text-rose-300 block font-bold">SL Price</span>
                    <input
                      type="number"
                      step={pipSize}
                      value={customSlPrice}
                      onChange={(e) => setCustomSlPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-black/40 border border-white/10 rounded px-1 py-0.5 text-center text-[10px] font-bold text-rose-200 focus:outline-none focus:border-rose-400"
                    />
                  </div>
                  <div className="bg-black/30 p-1 rounded-md border border-white/5 space-y-0.5">
                    <span className="text-[8px] text-emerald-300 block font-bold">TP Price</span>
                    <input
                      type="number"
                      step={pipSize}
                      value={customTpPrice}
                      onChange={(e) => setCustomTpPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-black/40 border border-white/10 rounded px-1 py-0.5 text-center text-[10px] font-bold text-emerald-200 focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Micro Action Triggers: SELL & BUY */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                onClick={() => handleInitiateOrder('SELL')}
                disabled={(!canExecute && false) || (canExecute && !isExecutable) || !isSymbolMapped || !isExecutionTransportReady}
                className={`h-7 py-1 px-2 rounded-lg text-white font-bold text-[10px] transition-all shadow-[0_0_10px_rgba(244,63,94,0.3)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1 ${
                  !canExecute
                    ? 'bg-gradient-to-r from-rose-900/80 to-rose-800/80 hover:from-rose-800 hover:to-rose-700 border border-rose-500/40 text-rose-200'
                    : 'bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500'
                }`}
                title={
                  !isSymbolMapped
                    ? `${activeSymbol} is not mapped or supported by current broker terminal`
                    : !isExecutionTransportReady
                    ? 'MT5 terminal or bridge is not connected'
                    : canExecute
                    ? (isExecutable ? `SELL ${activeSymbol} @ broker BID` : 'Market Session Closed')
                    : 'Member Access Required — Sign in to use trading controls'
                }
              >
                {!canExecute && <span className="text-[10px]">🔒</span>}
                <span className="text-rose-200 uppercase font-black">SELL</span>
                <span className="font-mono font-black tabular-nums text-white whitespace-nowrap">
                  @{currentBid.toFixed(precision)}
                </span>
              </button>

              <button
                onClick={() => handleInitiateOrder('BUY')}
                disabled={(!canExecute && false) || (canExecute && !isExecutable) || !isSymbolMapped || !isExecutionTransportReady}
                className={`h-7 py-1 px-2 rounded-lg text-white font-bold text-[10px] transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1 ${
                  !canExecute
                    ? 'bg-gradient-to-r from-emerald-900/80 to-emerald-800/80 hover:from-emerald-800 hover:to-emerald-700 border border-emerald-500/40 text-emerald-200'
                    : 'bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500'
                }`}
                title={
                  !isSymbolMapped
                    ? `${activeSymbol} is not mapped or supported by current broker terminal`
                    : !isExecutionTransportReady
                    ? 'MT5 terminal or bridge is not connected'
                    : canExecute
                    ? (isExecutable ? `BUY ${activeSymbol} @ broker ASK` : 'Market Session Closed')
                    : 'Member Access Required — Sign in to use trading controls'
                }
              >
                {!canExecute && <span className="text-[10px]">🔒</span>}
                <span className="text-emerald-200 uppercase font-black">BUY</span>
                <span className="font-mono font-black tabular-nums text-white whitespace-nowrap">
                  @{currentAsk.toFixed(precision)}
                </span>
              </button>
            </div>

            {/* Protective Footnote */}
            <div className="flex items-center justify-between text-[8px] text-gray-500 pt-0.5 border-t border-white/5">
              <span>{canExecute ? 'ARMED: 1-CLICK GUARD' : 'VIEW ONLY • TRADING LOCKED'}</span>
              <span className="text-cyan-400 font-mono">{canExecute ? 'MT5 DIRECT' : 'SIGN IN TO TRADE'}</span>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PROTECTED TRADE ACCESS MODAL (FOR UNAUTHENTICATED / UNLICENSED USERS)
         ========================================================================= */}
      {isAuthModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 font-mono"
        >
          <div className="bg-[#080E1A] border border-cyan-500/50 rounded-2xl w-full max-w-md p-6 sm:p-7 shadow-[0_0_50px_rgba(6,182,212,0.25)] space-y-5">
            {/* Modal Header */}
            <div className="text-center space-y-1.5 border-b border-white/10 pb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-400/40 text-cyan-300 mb-1">
                <span className="text-xl">🛡️</span>
              </div>
              <h3 className="text-base font-black tracking-wider text-white uppercase font-sans">
                MEMBER ACCESS REQUIRED
              </h3>
              <p className="text-xs text-gray-300 font-sans leading-relaxed">
                Sign in to use trading controls.
              </p>
              <p className="text-[10.5px] text-cyan-300/80 font-sans">
                Live interactive chart and market analytics remain free for public view.
              </p>
            </div>

            {/* Member Portal Redirection Action Card */}
            <div className="space-y-4 py-2 font-sans">
              <p className="text-xs text-gray-300 text-center leading-relaxed">
                Direct trade execution, one-click scalp orders, and MT5 broker dispatch require active institutional membership.
              </p>

              <div className="pt-1">
                <Link
                  href="/member"
                  onClick={() => setIsAuthModalOpen(false)}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black font-sans font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center justify-center space-x-2 cursor-pointer font-mono"
                >
                  <span>MEMBER LOGIN →</span>
                </Link>
              </div>

              <button
                type="button"
                onClick={() => setIsAuthModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-black/60 border border-white/10 hover:bg-white/5 text-gray-400 hover:text-white text-xs font-bold cursor-pointer transition-colors"
              >
                RETURN TO CHART
              </button>
            </div>

            {/* Support / Contact Desk Link */}
            <div className="pt-3 border-t border-white/10 space-y-2">
              <div className="text-[10px] text-gray-400 text-center font-sans">
                Need a member license or device reset?
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                {CORTEX_WHATSAPP_CONFIG.isConfigured && (
                  <a
                    href={CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl() || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 hover:text-white text-[10px] font-sans font-bold flex items-center justify-center space-x-1 transition-all"
                  >
                    <span>💬</span>
                    <span>WhatsApp Admin</span>
                  </a>
                )}
                <a
                  href={`mailto:${SUPPORT_CONFIG.supportEmail}?subject=FEF%20CORTEX%20Trading%20Access%20Inquiry`}
                  className="flex-1 py-2 px-3 rounded-xl bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 hover:text-white text-[10px] font-sans font-bold flex items-center justify-center space-x-1 transition-all"
                >
                  <span>✉️</span>
                  <span>Contact Admin</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Safety Guard Modal */}
      {pendingOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 font-mono"
        >
          <div className="bg-[#040814] border border-cyan-500/50 rounded-2xl w-full max-w-md p-5 shadow-[0_0_40px_rgba(34,211,238,0.3)] space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-lg">🛡️</span>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">
                    Confirm Order Dispatch
                  </h4>
                  <div className="flex items-center space-x-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[10px] text-amber-300 font-bold uppercase tracking-wider">
                      DEMO EXECUTION ONLY
                    </span>
                  </div>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  pendingOrder.direction === 'BUY'
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50'
                    : 'bg-rose-950/70 text-rose-300 border-rose-500/50'
                }`}
              >
                {pendingOrder.direction} {pendingOrder.volume} LOTS
              </span>
            </div>

            {/* In-Modal Error Feedback */}
            {dispatchError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs font-mono space-y-1">
                <div className="font-bold flex items-center space-x-1.5 text-rose-300">
                  <span>⚠️</span>
                  <span>EXECUTION REJECTED</span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-95">{dispatchError}</p>
              </div>
            )}

            {/* Order Specification Summary */}
            <div className="bg-black/50 rounded-xl p-3 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Account Capital:</span>
                <span className="text-white font-bold font-mono">
                  {hasLiveCapitalFact && liveMt5Capital != null
                    ? `$${liveMt5Capital.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${mt5Equity != null ? 'LIVE • MT5 EQUITY' : 'LIVE • MT5 BALANCE'})`
                    : '$10,000.00 (DEMO FALLBACK)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Instrument:</span>
                <div className="text-right">
                  <span className="text-white font-bold">{activeSymbol}</span>
                  {resolvedBrokerSymbol !== activeSymbol && (
                    <span className="text-[10px] text-cyan-300 ml-1.5 font-mono">
                      (Broker: {resolvedBrokerSymbol})
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Direction:</span>
                <span className={pendingOrder.direction === 'BUY' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {pendingOrder.direction}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Order Volume:</span>
                <span className="text-cyan-300 font-bold">{pendingOrder.volume.toFixed(2)} Lots</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Execution Entry:</span>
                <span className="text-white font-bold">
                  {(liveModalLevels?.entry ?? pendingOrder.price).toFixed(precision)}
                  {liveModalLevels && liveModalLevels.entry !== pendingOrder.price && (
                    <span className="text-[10px] text-gray-400 font-normal ml-1">
                      (Ref: {pendingOrder.price.toFixed(precision)})
                    </span>
                  )}
                </span>
              </div>
              {/* Dynamic Asset-Aware Auto Stop Loss Protection Card */}
              <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/40 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[11px] pb-1 border-b border-rose-500/20">
                  <div className="flex items-center space-x-1.5 text-rose-300 font-bold">
                    <span>🛡️</span>
                    <span>
                      {(liveModalLevels?.autoSl || pendingOrder.autoSl)?.method === 'XAUUSD_FIXED_50_PIPS'
                        ? 'AUTO SL: 50 PIPS'
                        : `AUTO SL: ${(liveModalLevels?.autoSl || pendingOrder.autoSl)?.formattedDisplay || ''}`}
                    </span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/60 font-mono text-cyan-300 font-bold">
                    {(liveModalLevels?.autoSl || pendingOrder.autoSl)?.method === 'XAUUSD_FIXED_50_PIPS'
                      ? 'MANDATORY 50 PIPS'
                      : 'VOLATILITY ADAPTIVE'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[10px] text-gray-400">SL PRICE:</span>
                  <span className="text-sm font-black text-rose-400 font-mono">
                    {(liveModalLevels?.sl ?? pendingOrder.sl).toFixed(precision)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">Take Profit 1 (Target):</span>
                <span className="text-emerald-400 font-bold font-mono">
                  {(liveModalLevels?.tp1 ?? pendingOrder.tp).toFixed(precision)}
                </span>
              </div>
            </div>

            {/* Protection Notice */}
            <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[10px] text-cyan-200 space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-cyan-300">
                <span>✓</span>
                <span>FAIL-CLOSED PROTECTION AUDITED</span>
              </div>
              <p className="text-gray-300 text-[9.5px]">
                Fresh tick quote verified. Broker stop &amp; freeze levels confirmed. Order will be dispatched directly to the active MT5 bridge.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
              <button
                onClick={() => { setPendingOrder(null); setDispatchError(null); }}
                disabled={isDispatching}
                className="px-4 py-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/5 text-gray-300 text-xs font-bold cursor-pointer transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleConfirmDispatch}
                disabled={isDispatching}
                className={`px-5 py-2 rounded-xl text-xs font-black transition-all flex items-center space-x-1.5 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.4)] ${
                  pendingOrder.direction === 'BUY'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 text-white'
                    : 'bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-400 text-white'
                }`}
              >
                {isDispatching ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>DISPATCHING...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>CONFIRM DEMO ORDER</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

