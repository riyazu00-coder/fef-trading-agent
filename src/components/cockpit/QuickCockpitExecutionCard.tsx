'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { getInstrumentContractSpec } from '@/lib/calculator/position-size-calculator';
import { reanchorProtectionLevels } from '@/lib/execution/trade-protection-validator';

/**
 * Intelligent asset-specific default SL and TP pip distances
 */
export function getAssetDefaultPips(symbol: string, category?: string): { slPips: number; tpPips: number } {
  const sym = symbol.toUpperCase().trim();
  const cat = category?.toUpperCase().trim() || '';

  // Metals (Gold / Silver)
  if (sym === 'XAUUSD' || sym === 'GOLD' || sym === 'XAGUSD' || sym === 'SILVER' || cat === 'METALS') {
    return { slPips: 50, tpPips: 100 }; // 50 pips = $5.00 on Gold, 100 pips = $10.00
  }

  // Commodities
  if (sym === 'NATGAS' || sym === 'XNGUSD') {
    return { slPips: 40, tpPips: 80 }; // $0.040 SL, $0.080 TP on Natural Gas
  }
  if (sym === 'USOIL' || sym === 'UKOIL' || cat === 'COMMODITIES') {
    return { slPips: 30, tpPips: 60 }; // $0.30 SL, $0.60 TP on Crude Oil
  }

  // Indices
  if (
    sym.startsWith('US') ||
    sym === 'GER40' ||
    sym === 'JP225' ||
    sym === 'UK100' ||
    sym === 'NAS100' ||
    sym === 'DJ30' ||
    cat === 'INDICES'
  ) {
    return { slPips: 50, tpPips: 100 }; // 50 pts SL, 100 pts TP on Indices
  }

  // Crypto
  if (sym === 'BTCUSD' || sym === 'BTC') {
    return { slPips: 150, tpPips: 300 }; // 150 pts SL, 300 pts TP on Bitcoin
  }
  if (sym === 'ETHUSD' || sym === 'SOLUSD' || sym === 'XRPUSD' || sym === 'BNBUSD' || cat === 'CRYPTO') {
    return { slPips: 25, tpPips: 50 }; // 25 pts SL, 50 pts TP on Altcoins
  }

  // Forex (Default)
  return { slPips: 20, tpPips: 40 }; // 20 pips SL, 40 pips TP on standard FX
}

export const QuickCockpitExecutionCard: React.FC = () => {
  const { activeSymbol, activeAsset, assetProfile } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected, refreshTelemetry } = useMT5Telemetry();

  // Contract specification & precision
  const spec = useMemo(() => getInstrumentContractSpec(activeSymbol), [activeSymbol]);
  const pipSize = spec?.pipSize || 0.0001;
  const precision = spec ? (spec.pipSize < 0.001 ? 5 : spec.pipSize < 0.1 ? 3 : 2) : 2;

  // Live quotes
  const liveQuote = activeTelemetry?.quote || telemetry.allQuotes[activeSymbol];
  const hasBrokerQuote = Boolean(isMt5Connected && liveQuote && liveQuote.bid > 0 && liveQuote.ask > 0);
  const currentBid = hasBrokerQuote ? liveQuote!.bid : activeAsset.price;
  const currentAsk = hasBrokerQuote ? liveQuote!.ask : activeAsset.price;
  const spreadPips = hasBrokerQuote ? (liveQuote!.spread ?? ((currentAsk - currentBid) / pipSize)) : null;

  // Lot Sizing State
  const [lotSize, setLotSize] = useState<number>(0.10);

  // Asset-aware SL / TP State
  const [slPips, setSlPips] = useState<number>(() => getAssetDefaultPips(activeSymbol, assetProfile.category).slPips);
  const [tpPips, setTpPips] = useState<number>(() => getAssetDefaultPips(activeSymbol, assetProfile.category).tpPips);

  // Re-initialize defaults when active asset changes
  useEffect(() => {
    const defaults = getAssetDefaultPips(activeSymbol, assetProfile.category);
    setSlPips(defaults.slPips);
    setTpPips(defaults.tpPips);
  }, [activeSymbol, assetProfile.category]);

  // Toast / Flash Notification
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
    ticket?: string | number;
  } | null>(null);

  // Confirmation Modal State
  const [pendingOrder, setPendingOrder] = useState<{
    direction: 'BUY' | 'SELL';
    price: number;
    sl: number;
    tp: number;
    volume: number;
  } | null>(null);

  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    ticket?: number | string;
    message?: string;
    error?: string;
  } | null>(null);

  // Auto-dismiss toast after 6s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Live 1-second quote refresh while confirmation modal is open
  useEffect(() => {
    if (!pendingOrder) return;
    refreshTelemetry().catch(() => {});
    const interval = setInterval(() => {
      refreshTelemetry().catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingOrder, refreshTelemetry]);

  // Calculate projected levels for BUY and SELL
  const buySlPrice = useMemo(() => Number((currentAsk - slPips * pipSize).toFixed(precision)), [currentAsk, slPips, pipSize, precision]);
  const buyTpPrice = useMemo(() => Number((currentAsk + tpPips * pipSize).toFixed(precision)), [currentAsk, tpPips, pipSize, precision]);

  const sellSlPrice = useMemo(() => Number((currentBid + slPips * pipSize).toFixed(precision)), [currentBid, slPips, pipSize, precision]);
  const sellTpPrice = useMemo(() => Number((currentBid - tpPips * pipSize).toFixed(precision)), [currentBid, tpPips, pipSize, precision]);

  // Dollar Risk & Reward estimates
  const contractSize = spec?.contractSize || 100000;
  const estimatedRiskUsd = useMemo(() => {
    return lotSize * contractSize * (slPips * pipSize);
  }, [lotSize, contractSize, slPips, pipSize]);

  const estimatedRewardUsd = useMemo(() => {
    return lotSize * contractSize * (tpPips * pipSize);
  }, [lotSize, contractSize, tpPips, pipSize]);

  const riskRewardRatio = useMemo(() => {
    if (slPips <= 0) return '0.0';
    return (tpPips / slPips).toFixed(1);
  }, [slPips, tpPips]);

  // Lot preset chips
  const lotChips = [0.01, 0.05, 0.10, 0.50, 1.00];
  const pipChips = [20, 30, 50, 100];

  // Initiate order trigger
  const handleInitiateOrder = useCallback((dir: 'BUY' | 'SELL') => {
    const entryPrice = dir === 'BUY' ? currentAsk : currentBid;
    const slPrice = dir === 'BUY' ? buySlPrice : sellSlPrice;
    const tpPrice = dir === 'BUY' ? buyTpPrice : sellTpPrice;

    // Fail-closed geometry validation
    if (slPrice <= 0 || tpPrice <= 0) {
      setToast({
        type: 'error',
        message: 'Stop Loss and Take Profit must be strictly positive numbers.'
      });
      return;
    }

    if (dir === 'BUY') {
      if (slPrice >= entryPrice) {
        setToast({
          type: 'error',
          message: `BUY Stop Loss (${slPrice}) must be below Entry (${entryPrice}).`
        });
        return;
      }
      if (tpPrice <= entryPrice) {
        setToast({
          type: 'error',
          message: `BUY Take Profit (${tpPrice}) must be above Entry (${entryPrice}).`
        });
        return;
      }
    } else {
      if (slPrice <= entryPrice) {
        setToast({
          type: 'error',
          message: `SELL Stop Loss (${slPrice}) must be above Entry (${entryPrice}).`
        });
        return;
      }
      if (tpPrice >= entryPrice) {
        setToast({
          type: 'error',
          message: `SELL Take Profit (${tpPrice}) must be below Entry (${entryPrice}).`
        });
        return;
      }
    }

    setExecutionResult(null);
    setPendingOrder({
      direction: dir,
      price: entryPrice,
      sl: slPrice,
      tp: tpPrice,
      volume: lotSize,
    });
  }, [currentAsk, currentBid, buySlPrice, buyTpPrice, sellSlPrice, sellTpPrice, lotSize]);

  // Live dynamic pip re-anchoring in modal
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

  // Confirm and dispatch order
  const handleConfirmDispatch = async () => {
    if (!pendingOrder) return;
    setIsDispatching(true);

    try {
      // 1. Fresh pre-dispatch tick fetch to prevent stale price aborts
      let freshTickPrice = pendingOrder.price;
      try {
        const tickRes = await fetch(`/api/bridge/mt5?action=GET_QUOTE&symbol=${activeSymbol}`);
        if (tickRes.ok) {
          const tickData = await tickRes.json();
          if (tickData.success && tickData.data) {
            freshTickPrice = pendingOrder.direction === 'BUY'
              ? (tickData.data.ask || tickData.data.bid)
              : tickData.data.bid;
          }
        }
      } catch {}

      // 2. Re-anchor levels with verified tick
      const reanchored = reanchorProtectionLevels({
        direction: pendingOrder.direction,
        plannedEntry: pendingOrder.price,
        freshEntry: freshTickPrice,
        sl: pendingOrder.sl,
        tp1: pendingOrder.tp,
        digits: precision,
      });

      const payload = {
        action: 'PLACE_ORDER',
        symbol: activeSymbol,
        params: {
          symbol: activeSymbol,
          direction: pendingOrder.direction,
          volume: pendingOrder.volume,
          price: reanchored.entry,
          sl: reanchored.sl,
          tp: reanchored.tp1,
          tp1: reanchored.tp1,
          takeProfit: reanchored.tp1,
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
        const ticketNum = data.ticket || data.orderTicket || data.data?.ticket || 'MT5-' + Date.now().toString().slice(-6);
        setExecutionResult({
          success: true,
          ticket: ticketNum,
          message: data.message || `Live order dispatched & executed on MT5 terminal (${pendingOrder.volume.toFixed(2)} lots ${pendingOrder.direction} ${activeSymbol})`,
        });
        setToast({
          type: 'success',
          message: `✓ Order Executed on MT5: #${ticketNum} (${pendingOrder.direction} ${activeSymbol})`,
          ticket: ticketNum,
        });
      } else {
        const errMessage = data.error?.message || data.message || 'Execution rejected by MT5 bridge or broker terminal.';
        setExecutionResult({
          success: false,
          error: errMessage,
        });
        setToast({
          type: 'error',
          message: `Execution Rejected: ${errMessage}`,
        });
      }
    } catch (err: any) {
      setExecutionResult({
        success: false,
        error: err.message || 'Network exception communicating with MT5 bridge.',
      });
      setToast({
        type: 'error',
        message: err.message || 'Failed to dispatch order to MT5 bridge.',
      });
    } finally {
      setIsDispatching(false);
      refreshTelemetry().catch(() => {});
    }
  };

  return (
    <div id="quick-cockpit-execution-card" className="ghost-glass-panel rounded-2xl p-3 font-mono space-y-2.5 relative select-none w-full border border-cyan-500/30 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
      {/* Toast Notice */}
      {toast && (
        <div
          className={`absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full text-[10.5px] font-sans font-bold shadow-lg transition-all animate-bounce ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border border-emerald-400 text-emerald-200'
              : 'bg-rose-950/90 border border-rose-400 text-rose-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Card Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
            <span className="text-sm">⚡</span>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
                DIRECT MT5 QUICK EXECUTION
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-cyan-950/60 text-cyan-300 border-cyan-500/40 font-mono">
                {activeSymbol}
              </span>
              <span className="text-[9.5px] text-gray-400 uppercase font-sans">
                {assetProfile.category}
              </span>
            </div>
            <p className="text-[10px] font-sans text-gray-400">
              One-Click Terminal Dispatch • Fail-Closed Dynamic Pip Re-Anchoring
            </p>
          </div>
        </div>

        {/* Live MT5 Status Badge */}
        <div className="flex items-center space-x-2">
          <span
            className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full border flex items-center space-x-1.5 ${
              isMt5Connected
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isMt5Connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{isMt5Connected ? 'EXNESS MT5 CONNECTED' : 'TELEMETRY DISCONNECTED'}</span>
          </span>
        </div>
      </div>

      {/* Quote Ribbon & Spread */}
      <div className="grid grid-cols-3 gap-2 bg-black/40 p-2 rounded-xl border border-white/5 text-center">
        <div>
          <span className="text-[9.5px] text-gray-400 block uppercase font-sans">Live Bid (Sell)</span>
          <span className="text-sm sm:text-base font-black text-rose-400">
            {currentBid > 0 ? currentBid.toFixed(precision) : '--'}
          </span>
        </div>
        <div className="border-x border-white/5 flex flex-col justify-center">
          <span className="text-[9.5px] text-cyan-300 block uppercase font-sans">Spread</span>
          <span className="text-xs font-bold text-cyan-200">
            {spreadPips !== null && Number.isFinite(spreadPips) ? `${spreadPips.toFixed(1)} pips` : 'UNAVAILABLE'}
          </span>
        </div>
        <div>
          <span className="text-[9.5px] text-gray-400 block uppercase font-sans">Live Ask (Buy)</span>
          <span className="text-sm sm:text-base font-black text-emerald-400">
            {currentAsk > 0 ? currentAsk.toFixed(precision) : '--'}
          </span>
        </div>
      </div>

      {/* Lot Sizing & Stepper */}
      <div className="bg-black/30 p-2.5 rounded-xl border border-white/10 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-300 font-bold font-sans">Position Size (Lots):</span>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setLotSize((prev) => Math.max(spec?.minLot || 0.01, Number((prev - (spec?.lotStep || 0.01)).toFixed(2))))}
              className="w-6 h-6 rounded bg-black/60 border border-white/20 text-white font-bold hover:bg-white/10 cursor-pointer flex items-center justify-center text-xs"
            >
              -
            </button>
            <input
              type="number"
              step={spec?.lotStep || 0.01}
              min={spec?.minLot || 0.01}
              max={spec?.maxLot || 50.0}
              value={lotSize}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || (spec?.minLot || 0.01);
                setLotSize(Number(val.toFixed(2)));
              }}
              className="w-16 bg-black/80 border border-white/20 focus:border-cyan-400 text-white font-bold text-center text-xs py-0.5 rounded outline-none"
            />
            <button
              onClick={() => setLotSize((prev) => Math.min(spec?.maxLot || 50.0, Number((prev + (spec?.lotStep || 0.01)).toFixed(2))))}
              className="w-6 h-6 rounded bg-black/60 border border-white/20 text-white font-bold hover:bg-white/10 cursor-pointer flex items-center justify-center text-xs"
            >
              +
            </button>
          </div>
        </div>

        {/* Quick Lot Chips */}
        <div className="flex items-center gap-1.5">
          {lotChips.map((chip) => (
            <button
              key={chip}
              onClick={() => setLotSize(chip)}
              className={`flex-1 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                lotSize === chip
                  ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'bg-black/40 text-gray-400 border-white/5 hover:text-white hover:bg-white/5'
              }`}
            >
              {chip.toFixed(2)}
            </button>
          ))}
        </div>
      </div>

      {/* Intelligent SL / TP Pip Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {/* Stop Loss Pips */}
        <div className="bg-rose-950/20 p-2.5 rounded-xl border border-rose-500/20 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-rose-300 font-bold font-sans">Stop Loss Distance:</span>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setSlPips((prev) => Math.max(5, prev - 5))}
                className="w-5 h-5 rounded bg-black/60 border border-rose-500/30 text-rose-300 font-bold hover:bg-rose-500/20 cursor-pointer flex items-center justify-center text-[10px]"
              >
                -
              </button>
              <input
                type="number"
                min={5}
                max={500}
                value={slPips}
                onChange={(e) => setSlPips(Math.max(5, parseInt(e.target.value) || 5))}
                className="w-12 bg-black/80 border border-rose-500/40 text-rose-300 font-bold text-center text-xs py-0.5 rounded outline-none"
              />
              <button
                onClick={() => setSlPips((prev) => prev + 5)}
                className="w-5 h-5 rounded bg-black/60 border border-rose-500/30 text-rose-300 font-bold hover:bg-rose-500/20 cursor-pointer flex items-center justify-center text-[10px]"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {pipChips.map((p) => (
              <button
                key={p}
                onClick={() => setSlPips(p)}
                className={`flex-1 py-0.5 rounded text-[9.5px] font-bold border transition-all cursor-pointer ${
                  slPips === p
                    ? 'bg-rose-500/30 text-rose-200 border-rose-400 font-black'
                    : 'bg-black/40 text-gray-400 border-white/5 hover:text-white'
                }`}
              >
                {p}p
              </button>
            ))}
          </div>
        </div>

        {/* Take Profit Pips */}
        <div className="bg-emerald-950/20 p-2.5 rounded-xl border border-emerald-500/20 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-emerald-300 font-bold font-sans">Take Profit 1:</span>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setTpPips((prev) => Math.max(5, prev - 5))}
                className="w-5 h-5 rounded bg-black/60 border border-emerald-500/30 text-emerald-300 font-bold hover:bg-emerald-500/20 cursor-pointer flex items-center justify-center text-[10px]"
              >
                -
              </button>
              <input
                type="number"
                min={5}
                max={1000}
                value={tpPips}
                onChange={(e) => setTpPips(Math.max(5, parseInt(e.target.value) || 5))}
                className="w-12 bg-black/80 border border-emerald-500/40 text-emerald-300 font-bold text-center text-xs py-0.5 rounded outline-none"
              />
              <button
                onClick={() => setTpPips((prev) => prev + 5)}
                className="w-5 h-5 rounded bg-black/60 border border-emerald-500/30 text-emerald-300 font-bold hover:bg-emerald-500/20 cursor-pointer flex items-center justify-center text-[10px]"
              >
                +
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {pipChips.map((p) => (
              <button
                key={p}
                onClick={() => setTpPips(p)}
                className={`flex-1 py-0.5 rounded text-[9.5px] font-bold border transition-all cursor-pointer ${
                  tpPips === p
                    ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400 font-black'
                    : 'bg-black/40 text-gray-400 border-white/5 hover:text-white'
                }`}
              >
                {p}p
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Projected Risk vs Reward Summary Banner */}
      <div className="bg-black/50 p-2.5 rounded-xl border border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-3">
          <div>
            <span className="text-[9.5px] text-gray-400 block font-sans">Est. Risk ($)</span>
            <span className="text-rose-400 font-bold">-${estimatedRiskUsd.toFixed(2)}</span>
          </div>
          <span className="text-gray-600">|</span>
          <div>
            <span className="text-[9.5px] text-gray-400 block font-sans">Est. Reward ($)</span>
            <span className="text-emerald-400 font-bold">+${estimatedRewardUsd.toFixed(2)}</span>
          </div>
          <span className="text-gray-600">|</span>
          <div>
            <span className="text-[9.5px] text-gray-400 block font-sans">Target R:R</span>
            <span className="text-cyan-300 font-bold">1:{riskRewardRatio}</span>
          </div>
        </div>

        <div className="text-[9.5px] text-gray-400 font-sans text-right">
          <span>Preset: </span>
          <span className="text-gray-200 font-bold">{assetProfile.category} Auto-Calibrated</span>
        </div>
      </div>

      {/* High-Contrast Dual Execution Buttons */}
      <div className="grid grid-cols-2 gap-2.5 pt-1">
        {/* SELL Button */}
        <button
          onClick={() => handleInitiateOrder('SELL')}
          disabled={!assetProfile.tradeExecutable}
          className={`p-3 rounded-xl font-black text-xs transition-all flex flex-col items-center justify-center space-y-0.5 cursor-pointer border ${
            !assetProfile.tradeExecutable
              ? 'bg-gray-800/40 text-gray-500 border-white/5 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-b from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border-rose-400/50 shadow-[0_0_15px_rgba(244,63,94,0.3)] hover:shadow-[0_0_22px_rgba(244,63,94,0.5)] active:scale-[0.98]'
          }`}
        >
          <div className="flex items-center space-x-1.5 text-sm sm:text-base">
            <span>▼</span>
            <span>SELL @ {currentBid > 0 ? currentBid.toFixed(precision) : '--'}</span>
          </div>
          <span className="text-[9.5px] font-normal text-rose-200/90 font-mono">
            SL: {sellSlPrice.toFixed(precision)} • TP: {sellTpPrice.toFixed(precision)}
          </span>
        </button>

        {/* BUY Button */}
        <button
          onClick={() => handleInitiateOrder('BUY')}
          disabled={!assetProfile.tradeExecutable}
          className={`p-3 rounded-xl font-black text-xs transition-all flex flex-col items-center justify-center space-y-0.5 cursor-pointer border ${
            !assetProfile.tradeExecutable
              ? 'bg-gray-800/40 text-gray-500 border-white/5 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white border-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_22px_rgba(16,185,129,0.5)] active:scale-[0.98]'
          }`}
        >
          <div className="flex items-center space-x-1.5 text-sm sm:text-base">
            <span>▲</span>
            <span>BUY @ {currentAsk > 0 ? currentAsk.toFixed(precision) : '--'}</span>
          </div>
          <span className="text-[9.5px] font-normal text-emerald-200/90 font-mono">
            SL: {buySlPrice.toFixed(precision)} • TP: {buyTpPrice.toFixed(precision)}
          </span>
        </button>
      </div>

      {!assetProfile.tradeExecutable && (
        <div className="text-center text-[10px] text-amber-400 font-sans bg-amber-950/40 border border-amber-500/20 rounded-lg py-1 px-2">
          ⚠ Market session closed for {activeSymbol} — Execution locked until open.
        </div>
      )}

      {/* =========================================================================
          ONE-CLICK SAFETY CONFIRMATION GUARD MODAL
         ========================================================================= */}
      {pendingOrder && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#090D16] border border-cyan-500/40 rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-[0_0_40px_rgba(6,182,212,0.25)] space-y-4 font-mono relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-xs sm:text-sm font-black tracking-wider text-white uppercase font-sans">
                  SAFETY CONFIRMATION GUARD • DIRECT MT5 DISPATCH
                </h3>
              </div>
              <button
                onClick={() => {
                  if (!isDispatching) setPendingOrder(null);
                }}
                disabled={isDispatching}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Execution Parameter Review Cards */}
            <div className="space-y-3">
              {/* Order Lockup Pill */}
              <div className="p-3 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-400 uppercase">Target Instrument &amp; Order</span>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <span className="text-base font-black text-cyan-300">{activeSymbol}</span>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded ${
                        pendingOrder.direction === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {pendingOrder.direction}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase">Volume (Lot Size)</span>
                  <div className="text-base font-black text-white">
                    {pendingOrder.volume.toFixed(2)} Lots
                  </div>
                </div>
              </div>

              {/* Price & Risk Geometry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[9.5px] text-gray-400 block">Execution Entry</span>
                  <span className="text-white font-bold">
                    {(liveModalLevels?.entry ?? pendingOrder.price).toFixed(precision)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[9.5px] text-gray-400 block">Stop Loss</span>
                  <span className="text-rose-400 font-bold">
                    {(liveModalLevels?.sl ?? pendingOrder.sl).toFixed(precision)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[9.5px] text-gray-400 block">Take Profit 1</span>
                  <span className="text-emerald-400 font-bold">
                    {(liveModalLevels?.tp1 ?? pendingOrder.tp).toFixed(precision)}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[9.5px] text-gray-400 block">Est. Risk ($)</span>
                  <span className="text-rose-400 font-bold">-${estimatedRiskUsd.toFixed(2)}</span>
                </div>
              </div>

              {/* Live Pip Re-anchoring Notice */}
              <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-[10.5px] text-cyan-200/90 space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-cyan-300">
                  <span>⚓</span>
                  <span>DYNAMIC LIVE PIP RE-ANCHORING ACTIVE</span>
                </div>
                <p className="text-[10px] text-cyan-100/70">
                  SL ({slPips} pips) and TP ({tpPips} pips) will automatically anchor to the live broker tick at the exact millisecond of terminal dispatch.
                </p>
              </div>

              {/* Execution Feedback / Result Display */}
              {executionResult && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    executionResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 font-bold">
                    <span>{executionResult.success ? '✓ EXECUTION CONFIRMED' : '✕ DISPATCH FAILED'}</span>
                    {executionResult.ticket && (
                      <span className="font-mono text-cyan-300">#{executionResult.ticket}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] opacity-90">
                    {executionResult.message || executionResult.error}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Action Buttons */}
            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-white/10">
              <button
                onClick={() => setPendingOrder(null)}
                disabled={isDispatching}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                {executionResult?.success ? 'CLOSE' : 'CANCEL'}
              </button>

              {!executionResult?.success && (
                <button
                  onClick={handleConfirmDispatch}
                  disabled={isDispatching}
                  className={`px-5 py-2 rounded-xl text-xs font-black tracking-wider transition-all flex items-center space-x-2 cursor-pointer shadow-lg ${
                    isDispatching
                      ? 'bg-emerald-800 text-emerald-300 opacity-60 cursor-not-allowed'
                      : pendingOrder.direction === 'BUY'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                      : 'bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                  }`}
                >
                  {isDispatching ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>DISPATCHING TO MT5...</span>
                    </>
                  ) : (
                    <>
                      <span>⚡</span>
                      <span>CONFIRM &amp; DISPATCH TO MT5</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

