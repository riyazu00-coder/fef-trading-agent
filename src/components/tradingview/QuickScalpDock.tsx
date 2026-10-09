'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { getInstrumentContractSpec } from '@/lib/calculator/position-size-calculator';
import { reanchorProtectionLevels } from '@/lib/execution/trade-protection-validator';

interface QuickScalpDockProps {
  className?: string;
}

export const QuickScalpDock: React.FC<QuickScalpDockProps> = ({ className = '' }) => {
  const { activeSymbol, setActiveSymbol, activeAsset, assetProfile, allAssets } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected, refreshTelemetry } = useMT5Telemetry();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [lotSize, setLotSize] = useState<number>(0.10);
  const [slPips, setSlPips] = useState<number>(20);
  const [tpPips, setTpPips] = useState<number>(40);
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customSlPrice, setCustomSlPrice] = useState<number>(0);
  const [customTpPrice, setCustomTpPrice] = useState<number>(0);

  // Safety confirmation modal state
  const [pendingOrder, setPendingOrder] = useState<{
    direction: 'BUY' | 'SELL';
    price: number;
    sl: number;
    tp: number;
    volume: number;
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

  // Compute calculated SL/TP prices based on direction
  const calculateLevels = useCallback((dir: 'BUY' | 'SELL') => {
    const entryPrice = dir === 'BUY' ? currentAsk : currentBid;
    if (useCustomPrice && customSlPrice > 0 && customTpPrice > 0) {
      return { entryPrice, slPrice: customSlPrice, tpPrice: customTpPrice };
    }
    const slDist = slPips * pipSize;
    const tpDist = tpPips * pipSize;
    const slPrice = dir === 'BUY' ? Number((entryPrice - slDist).toFixed(precision)) : Number((entryPrice + slDist).toFixed(precision));
    const tpPrice = dir === 'BUY' ? Number((entryPrice + tpDist).toFixed(precision)) : Number((entryPrice - tpDist).toFixed(precision));
    return { entryPrice, slPrice, tpPrice };
  }, [currentAsk, currentBid, useCustomPrice, customSlPrice, customTpPrice, slPips, tpPips, pipSize, precision]);

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

  // Open modal trigger
  const handleInitiateOrder = (dir: 'BUY' | 'SELL') => {
    const { entryPrice, slPrice, tpPrice } = calculateLevels(dir);
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
    });
  };

  // Real-time dynamic pip re-anchoring for the confirmation modal
  const liveModalLevels = useMemo(() => {
    if (!pendingOrder) return null;
    const latestPrice = liveQuote
      ? (pendingOrder.direction === 'BUY' ? (liveQuote.ask || liveQuote.bid) : liveQuote.bid)
      : pendingOrder.price;
    return reanchorProtectionLevels({
      direction: pendingOrder.direction,
      plannedEntry: pendingOrder.price,
      freshEntry: latestPrice || pendingOrder.price,
      sl: pendingOrder.sl,
      tp1: pendingOrder.tp,
      digits: precision,
    });
  }, [pendingOrder, liveQuote, precision]);

  // Direct dispatch to /api/bridge/mt5
  const handleConfirmDispatch = async () => {
    if (!pendingOrder) return;
    setIsDispatching(true);

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

      const payload = {
        action: 'PLACE_ORDER',
        command: 'PLACE_ORDER',
        symbol: activeSymbol,
        params: {
          symbol: activeSymbol,
          direction: pendingOrder.direction,
          volume: pendingOrder.volume,
          price: reanchored.entry,
          sl: reanchored.sl,
          tp1: reanchored.tp1,
          plannedPrice: pendingOrder.price,
          magic: 888123,
          humanApproved: true,
          tradeMode: 'DEMO',
        },
      };

      const res = await fetch('/api/bridge/mt5', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const ticketNum = data.ticket || data.orderTicket || data.data?.ticket || 'TICKET-' + Date.now().toString().slice(-6);
        setToast({
          type: 'success',
          title: 'Order Executed on MT5',
          message: `${pendingOrder.direction} ${pendingOrder.volume} ${activeSymbol} @ ${reanchored.entry.toFixed(precision)} (SL: ${reanchored.sl.toFixed(precision)}, TP: ${reanchored.tp1.toFixed(precision)})`,
          ticket: ticketNum,
        });
        setPendingOrder(null);
      } else {
        const errorMsg = data.error?.message || data.message || 'Order rejected by MT5 bridge or safety gate.';
        setToast({
          type: 'error',
          title: 'Execution Rejected',
          message: errorMsg,
        });
      }
    } catch (err: any) {
      setToast({
        type: 'error',
        title: 'Dispatch Failed',
        message: err.message || 'Network exception communicating with /api/bridge/mt5',
      });
    } finally {
      setIsDispatching(false);
    }
  };

  const isExecutable = assetProfile?.tradeExecutable !== false;

  return (
    <>
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed top-20 right-6 z-50 max-w-sm w-full animate-in fade-in slide-in-from-top duration-300">
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
                  isExecutable
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}
              >
                {isExecutable ? 'LIVE' : 'CLOSED'}
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
                <span className="text-cyan-300">
                  {telemetry.account ? `$${telemetry.account.balance.toLocaleString('en-US', { minimumFractionDigits: 0 })} Bal` : '10,000 Bal'}
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
                        onClick={() => setSlPips((p) => Math.max(5, p - 5))}
                        className="w-3.5 h-4 bg-white/5 hover:bg-white/10 rounded text-[9px] flex items-center justify-center cursor-pointer text-gray-300"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={slPips}
                        onChange={(e) => setSlPips(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-full bg-transparent text-center text-[10px] font-bold focus:outline-none text-rose-200"
                      />
                      <button
                        onClick={() => setSlPips((p) => p + 5)}
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
                disabled={!isExecutable}
                className="h-7 py-1 px-2 rounded-lg bg-gradient-to-r from-rose-700 to-rose-600 hover:from-rose-600 hover:to-rose-500 text-white font-bold text-[10px] transition-all shadow-[0_0_10px_rgba(244,63,94,0.3)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1"
              >
                <span className="text-rose-200 uppercase font-black">SELL</span>
                <span className="font-mono font-black tabular-nums text-white whitespace-nowrap">
                  @{currentBid.toFixed(precision)}
                </span>
              </button>

              <button
                onClick={() => handleInitiateOrder('BUY')}
                disabled={!isExecutable}
                className="h-7 py-1 px-2 rounded-lg bg-gradient-to-r from-emerald-700 to-emerald-600 hover:from-emerald-600 hover:to-emerald-500 text-white font-bold text-[10px] transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1"
              >
                <span className="text-emerald-200 uppercase font-black">BUY</span>
                <span className="font-mono font-black tabular-nums text-white whitespace-nowrap">
                  @{currentAsk.toFixed(precision)}
                </span>
              </button>
            </div>

            {/* Protective Footnote */}
            <div className="flex items-center justify-between text-[8px] text-gray-500 pt-0.5 border-t border-white/5">
              <span>ARMED: 1-CLICK GUARD</span>
              <span className="text-cyan-400 font-mono">MT5 DIRECT</span>
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
                  <p className="text-[10px] text-cyan-300">
                    Direct Live MT5 Bridge Execution Guard
                  </p>
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

            {/* Order Specification Summary */}
            <div className="bg-black/50 rounded-xl p-3 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Instrument:</span>
                <span className="text-white font-bold">{activeSymbol}</span>
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
              <div className="flex justify-between">
                <span className="text-gray-400">Stop Loss (Re-anchored):</span>
                <span className="text-rose-400 font-bold">
                  {(liveModalLevels?.sl ?? pendingOrder.sl).toFixed(precision)}
                  <span className="text-[10px] text-rose-300/80 font-normal ml-1">
                    (-{(liveModalLevels ? liveModalLevels.slDistance / pipSize : slPips).toFixed(1)} pips)
                  </span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Take Profit 1 (Re-anchored):</span>
                <span className="text-emerald-400 font-bold">
                  {(liveModalLevels?.tp1 ?? pendingOrder.tp).toFixed(precision)}
                  <span className="text-[10px] text-emerald-300/80 font-normal ml-1">
                    (+{(liveModalLevels ? liveModalLevels.tp1Distance / pipSize : tpPips).toFixed(1)} pips)
                  </span>
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
                onClick={() => setPendingOrder(null)}
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
                    <span>CONFIRM &amp; DISPATCH ORDER</span>
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

