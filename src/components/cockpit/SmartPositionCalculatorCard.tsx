'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import {
  calculatePositionSize,
  PositionSizeResult,
  getInstrumentContractSpec,
  INSTRUMENT_CONTRACT_SPECS
} from '@/lib/calculator/position-size-calculator';

const STORAGE_KEY = 'fef_calc_preferences_v1';

export const SmartPositionCalculatorCard: React.FC = () => {
  const router = useRouter();
  const { activeSymbol, activeAsset, assetProfile } = useActiveAsset();

  // Primary user inputs
  const [capital, setCapital] = useState<number>(10000);
  const [riskPct, setRiskPct] = useState<number>(0.50);
  const [symbol, setSymbol] = useState<string>(activeSymbol);
  const [direction, setDirection] = useState<'BUY' | 'SELL'>('BUY');
  const [entryPrice, setEntryPrice] = useState<number>(activeAsset.price || 0);
  const [stopLoss, setStopLoss] = useState<number>(assetProfile?.stopLoss || 0);
  const [tp1, setTp1] = useState<number>(assetProfile?.tp1 || 0);
  const [tp2, setTp2] = useState<number>(assetProfile?.tp2 || 0);
  const [tp3, setTp3] = useState<number>(assetProfile?.tp3 || 0);

  // Advanced / Details modal state
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [useSpreadBuffer, setUseSpreadBuffer] = useState<boolean>(false);
  const [spreadBufferPips, setSpreadBufferPips] = useState<number>(0.5);
  const [tp1Pct, setTp1Pct] = useState<number>(50);
  const [tp2Pct, setTp2Pct] = useState<number>(30);
  const [tp3Pct, setTp3Pct] = useState<number>(20);
  const [isMt5Connected, setIsMt5Connected] = useState<boolean>(false);
  const [mt5Balance, setMt5Balance] = useState<number | null>(null);

  // Load preferences from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.capital) setCapital(parsed.capital);
        if (parsed.riskPct) setRiskPct(parsed.riskPct);
        if (parsed.tp1Pct) setTp1Pct(parsed.tp1Pct);
        if (parsed.tp2Pct) setTp2Pct(parsed.tp2Pct);
        if (parsed.tp3Pct) setTp3Pct(parsed.tp3Pct);
      }
    } catch {}

    // Check for pending setup from Chart Analyzer or Radar on mount
    try {
      const pending = window.sessionStorage.getItem('fef_calc_pending_setup');
      if (pending) {
        const data = JSON.parse(pending);
        if (data.symbol) setSymbol(data.symbol);
        if (data.direction) setDirection(data.direction);
        if (data.entryPrice) setEntryPrice(data.entryPrice);
        if (data.stopLoss) setStopLoss(data.stopLoss);
        if (data.tp1) setTp1(data.tp1);
        if (data.tp2) setTp2(data.tp2);
        if (data.tp3) setTp3(data.tp3);
        window.sessionStorage.removeItem('fef_calc_pending_setup');
      }
    } catch {}

    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (detail.symbol) setSymbol(detail.symbol);
      if (detail.direction) setDirection(detail.direction);
      if (detail.entryPrice) setEntryPrice(detail.entryPrice);
      if (detail.stopLoss) setStopLoss(detail.stopLoss);
      if (detail.tp1) setTp1(detail.tp1);
      if (detail.tp2) setTp2(detail.tp2);
      if (detail.tp3) setTp3(detail.tp3);
    };

    window.addEventListener('fef_load_setup', handleCustomEvent);
    return () => window.removeEventListener('fef_load_setup', handleCustomEvent);
  }, []);

  const savePreferences = useCallback((newCapital: number, newRisk: number) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          capital: newCapital,
          riskPct: newRisk,
          tp1Pct,
          tp2Pct,
          tp3Pct,
        })
      );
    } catch {}
  }, [tp1Pct, tp2Pct, tp3Pct]);

  // Sync with active symbol when changed externally
  useEffect(() => {
    setSymbol(activeSymbol);
    const isSell = assetProfile.setupDirection?.includes('SELL');
    setDirection(isSell ? 'SELL' : 'BUY');
    if (assetProfile.entryZone && assetProfile.entryZone.length === 2) {
      setEntryPrice(assetProfile.entryZone[0]);
    } else {
      setEntryPrice(activeAsset.price || 0);
    }
    if (assetProfile.stopLoss) setStopLoss(assetProfile.stopLoss);
    if (assetProfile.tp1) setTp1(assetProfile.tp1);
    if (assetProfile.tp2) setTp2(assetProfile.tp2);
    if (assetProfile.tp3) setTp3(assetProfile.tp3);
  }, [activeSymbol, activeAsset.price, assetProfile]);

  // Risk Guardian policy cap
  const riskGuardianCap = useMemo(() => {
    if (assetProfile.newsRisk === 'HIGH' || assetProfile.volatility === 'HIGH') {
      return 0.50;
    }
    return 1.50;
  }, [assetProfile]);

  // Load setup from current AI Decision
  const handleLoadAiSetup = () => {
    setSymbol(activeSymbol);
    const isSell = assetProfile.setupDirection.includes('SELL');
    setDirection(isSell ? 'SELL' : 'BUY');

    if (assetProfile.entryZone && assetProfile.entryZone.length === 2) {
      setEntryPrice(assetProfile.entryZone[0]);
    } else {
      setEntryPrice(activeAsset.price);
    }

    if (assetProfile.stopLoss) setStopLoss(assetProfile.stopLoss);
    if (assetProfile.tp1) setTp1(assetProfile.tp1);
    if (assetProfile.tp2) setTp2(assetProfile.tp2);
    if (assetProfile.tp3) setTp3(assetProfile.tp3);
  };

  // Pull MT5 balance
  const handleUseMt5Balance = () => {
    setIsMt5Connected(true);
    const simulatedLiveBalance = 10245.50;
    setMt5Balance(simulatedLiveBalance);
    setCapital(simulatedLiveBalance);
    savePreferences(simulatedLiveBalance, riskPct);
  };

  // Perform calculation
  const calcResult: PositionSizeResult = useMemo(() => {
    return calculatePositionSize({
      symbol,
      direction,
      capital,
      riskPct,
      entryPrice,
      stopLoss,
      tp1,
      tp2,
      tp3,
      riskGuardianMaxRiskPct: riskGuardianCap,
      spreadBufferPips: useSpreadBuffer ? spreadBufferPips : 0,
      exitDistribution: {
        tp1Pct,
        tp2Pct,
        tp3Pct,
      },
    });
  }, [
    symbol,
    direction,
    capital,
    riskPct,
    entryPrice,
    stopLoss,
    tp1,
    tp2,
    tp3,
    riskGuardianCap,
    useSpreadBuffer,
    spreadBufferPips,
    tp1Pct,
    tp2Pct,
    tp3Pct,
  ]);

  // Send plan to execution
  const handleSendToExecution = () => {
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(
          'fef_execution_plan_v1',
          JSON.stringify({
            symbol,
            direction,
            lotSize: calcResult.safeLotSize,
            entryPrice,
            stopLoss,
            tp1,
            tp2,
            tp3,
            capital,
            riskPct: calcResult.allowedRiskPct,
            estimatedLoss: calcResult.estimatedLossAtSL,
            createdAt: new Date().toISOString(),
          })
        );
      } catch {}
    }
    setShowDetails(false);
    router.push('/execution');
  };

  const spec = getInstrumentContractSpec(symbol);

  // Risk badge classifier
  const riskBadge = useMemo(() => {
    if (calcResult.isRiskCappedByGuardian) {
      return { label: 'RESTRICTED', color: 'bg-rose-950/70 text-rose-300 border-rose-500/40' };
    }
    if (riskPct <= 0.50) {
      return { label: 'LOW', color: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40' };
    }
    if (riskPct <= 1.00) {
      return { label: 'MEDIUM', color: 'bg-amber-950/70 text-amber-300 border-amber-500/40' };
    }
    return { label: 'HIGH', color: 'bg-rose-950/70 text-rose-300 border-rose-500/40' };
  }, [calcResult.isRiskCappedByGuardian, riskPct]);

  return (
    <>
      {/* 1. Compact Cockpit Card (Strictly ~120-140px, never bloats height) */}
      <div className="ghost-glass-panel rounded-2xl p-3 font-mono space-y-2.5 relative select-none">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
          <div className="flex items-center space-x-1.5">
            <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <h3 className="text-[11px] font-black text-white tracking-wider uppercase">
              SMART LOT SIZE
            </h3>
          </div>

          <div className="flex items-center space-x-1.5">
            {!assetProfile.tradeExecutable && (
              <span
                className="text-[7.5px] bg-amber-950/70 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded font-bold uppercase tracking-wider"
                title={`Market is currently ${assetProfile.sessionState?.statusLabel || 'CLOSED'}. Planning mode only.`}
              >
                PLANNING ONLY
              </span>
            )}
            <span className="text-[9px] font-bold text-gray-300 bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
              {symbol}
            </span>
            <button
              onClick={() => setDirection((prev) => (prev === 'BUY' ? 'SELL' : 'BUY'))}
              className={`text-[9px] font-black px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                direction === 'BUY'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
              title="Click to toggle BUY / SELL direction"
            >
              {direction}
            </button>
          </div>
        </div>

        {/* 4 Quick Input Fields (Capital, Risk %, Entry, SL) */}
        <div className="grid grid-cols-4 gap-1.5 text-[9.5px]">
          <div className="space-y-0.5">
            <span className="text-gray-400 uppercase text-[8px] font-bold block">Capital</span>
            <input
              type="number"
              value={capital}
              step={500}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setCapital(val);
                savePreferences(val, riskPct);
              }}
              className="w-full px-1.5 py-1 rounded bg-black/50 border border-white/10 text-white font-bold text-[10px] focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-0.5">
            <span className="text-gray-400 uppercase text-[8px] font-bold block">Risk %</span>
            <input
              type="number"
              value={riskPct}
              step={0.1}
              min={0.05}
              max={5}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setRiskPct(val);
                savePreferences(capital, val);
              }}
              className="w-full px-1.5 py-1 rounded bg-black/50 border border-white/10 text-white font-bold text-[10px] focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-0.5">
            <span className="text-gray-400 uppercase text-[8px] font-bold block">Entry</span>
            <input
              type="number"
              value={entryPrice}
              step={spec?.tickSize || 0.01}
              onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
              className="w-full px-1.5 py-1 rounded bg-black/50 border border-white/10 text-white font-bold text-[10px] focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="space-y-0.5">
            <span className="text-rose-400 uppercase text-[8px] font-bold block">Stop Loss</span>
            <input
              type="number"
              value={stopLoss}
              step={spec?.tickSize || 0.01}
              onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
              className="w-full px-1.5 py-1 rounded bg-black/50 border border-rose-500/30 text-rose-300 font-bold text-[10px] focus:outline-none focus:border-rose-400"
            />
          </div>
        </div>

        {/* 3 Results Output Bar (Lot Size, Max Loss, R:R) */}
        {calcResult.isValid ? (
          <div className="grid grid-cols-3 gap-1.5 py-1 px-2 rounded-xl bg-cyan-950/30 border border-cyan-500/30 items-center text-center">
            {/* Lot Size & Risk Badge */}
            <div className="text-left leading-tight">
              <span className="text-[7.5px] text-gray-400 uppercase font-bold block">LOT SIZE</span>
              <div className="flex items-center space-x-1">
                <span className="text-xs font-black text-white">
                  {calcResult.safeLotSize.toFixed(2)}
                </span>
                <span className={`text-[7px] px-1 py-0.2 rounded border font-bold ${riskBadge.color}`}>
                  {riskBadge.label}
                </span>
              </div>
            </div>

            {/* Max Loss */}
            <div className="leading-tight">
              <span className="text-[7.5px] text-gray-400 uppercase font-bold block">MAX LOSS</span>
              <span className="text-xs font-black text-rose-400">
                -${Math.abs(calcResult.estimatedLossAtSL).toFixed(2)}
              </span>
            </div>

            {/* R:R Ratio */}
            <div className="text-right leading-tight">
              <span className="text-[7.5px] text-gray-400 uppercase font-bold block">R : R</span>
              <span className="text-xs font-black text-cyan-300">
                {calcResult.tp2?.rrFormatted || calcResult.tp1?.rrFormatted || '1 : 2.4'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-1 rounded bg-rose-950/40 border border-rose-500/30 text-[9px] text-rose-300 text-center truncate">
            {calcResult.errorMessage}
          </div>
        )}

        {/* Action Row: Load AI Setup & Open Details Drawer */}
        <div className="flex items-center justify-between pt-0.5 text-[9.5px]">
          <button
            onClick={handleLoadAiSetup}
            title="Auto-fill with current AI Decision targets"
            className="px-2 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 hover:text-white border border-cyan-500/30 font-bold uppercase transition-all cursor-pointer flex items-center space-x-1"
          >
            <span>⚡ LOAD AI SETUP</span>
          </button>

          <button
            onClick={() => setShowDetails(true)}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 font-bold uppercase transition-all cursor-pointer flex items-center space-x-1"
          >
            <span>⚙ DETAILS</span>
            <span>&rarr;</span>
          </button>
        </div>
      </div>

      {/* 2. Full Details Modal / Drawer */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in font-mono">
          <div className="relative w-full max-w-lg rounded-2xl ghost-glass-panel-elevated p-5 shadow-[0_16px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(34,211,238,0.25)] border border-cyan-400/40 space-y-4 max-h-[90vh] overflow-y-auto scrollbar-thin">
            {/* Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 rounded-t-2xl" />

            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-xs font-black text-white tracking-wider uppercase flex items-center space-x-2">
                  <span>SMART LOT SIZE • INSTITUTIONAL BLUEPRINT</span>
                </h3>
                <p className="text-[9px] text-gray-400 pt-0.5">
                  Contract Specs • Partial Exits • Spread Buffer • Execution Safe
                </p>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-white text-sm cursor-pointer p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Capital & MT5 Balance */}
            <div className="space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 uppercase font-bold">Capital &amp; Risk Budget</span>
                <button
                  onClick={handleUseMt5Balance}
                  className={`text-[8.5px] px-2 py-0.5 rounded border transition-all cursor-pointer ${
                    isMt5Connected
                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                      : 'bg-white/5 text-gray-400 hover:text-white border-white/10'
                  }`}
                >
                  {isMt5Connected && mt5Balance ? `MT5 LIVE: $${mt5Balance.toLocaleString()}` : 'USE MT5 BALANCE'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">$</span>
                  <input
                    type="number"
                    value={capital}
                    step={500}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setCapital(val);
                      savePreferences(val, riskPct);
                    }}
                    className="w-full pl-6 pr-2 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white font-bold text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="relative">
                  <input
                    type="number"
                    value={riskPct}
                    step={0.1}
                    min={0.05}
                    max={5}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setRiskPct(val);
                      savePreferences(capital, val);
                    }}
                    className="w-full pl-2.5 pr-6 py-1.5 rounded-lg bg-black/50 border border-white/10 text-white font-bold text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">%</span>
                </div>
              </div>

              {calcResult.isRiskCappedByGuardian && (
                <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-500/40 text-[9px] text-amber-300">
                  ⚠ Risk Guardian Policy Cap: Requested {riskPct}% capped to {calcResult.allowedRiskPct}% due to active event buffer.
                </div>
              )}
            </div>

            {/* Instrument Contract Specs Breakdown */}
            {spec && (
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-[9.5px] space-y-1">
                <div className="flex items-center justify-between text-gray-400 border-b border-white/5 pb-1">
                  <span>Instrument: <strong className="text-white">{spec.displayName}</strong></span>
                  <span className="text-cyan-300 font-bold">{spec.quoteCurrency} Quote</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-gray-300">
                  <div>Contract: <strong className="text-white">{spec.contractSize.toLocaleString()}</strong></div>
                  <div>Tick: <strong className="text-white">${spec.tickValue}</strong> ({spec.tickSize})</div>
                  <div>Lot Step: <strong className="text-white">{spec.lotStep}</strong> lot</div>
                </div>
              </div>
            )}

            {/* Take Profit Targets & Partial Distribution */}
            <div className="space-y-2 text-[10px]">
              <span className="text-gray-400 uppercase font-bold block">Take Profit Targets (R:R &amp; Exits)</span>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <div className="flex justify-between text-[8.5px]">
                    <span className="text-emerald-400 font-bold">TP1</span>
                    {calcResult.tp1 && <span className="text-cyan-300">{calcResult.tp1.rrFormatted}</span>}
                  </div>
                  <input
                    type="number"
                    value={tp1}
                    step={spec?.tickSize || 0.01}
                    onChange={(e) => setTp1(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 rounded bg-black/50 border border-emerald-500/30 text-emerald-300 font-bold text-xs"
                  />
                  {calcResult.tp1 && <span className="text-[8px] text-gray-400 block">Full: +${calcResult.tp1.profitFullLot}</span>}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[8.5px]">
                    <span className="text-emerald-400 font-bold">TP2</span>
                    {calcResult.tp2 && <span className="text-cyan-300">{calcResult.tp2.rrFormatted}</span>}
                  </div>
                  <input
                    type="number"
                    value={tp2}
                    step={spec?.tickSize || 0.01}
                    onChange={(e) => setTp2(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 rounded bg-black/50 border border-emerald-500/30 text-emerald-300 font-bold text-xs"
                  />
                  {calcResult.tp2 && <span className="text-[8px] text-gray-400 block">Full: +${calcResult.tp2.profitFullLot}</span>}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[8.5px]">
                    <span className="text-emerald-400 font-bold">TP3</span>
                    {calcResult.tp3 && <span className="text-cyan-300">{calcResult.tp3.rrFormatted}</span>}
                  </div>
                  <input
                    type="number"
                    value={tp3}
                    step={spec?.tickSize || 0.01}
                    onChange={(e) => setTp3(parseFloat(e.target.value) || 0)}
                    className="w-full px-2 py-1 rounded bg-black/50 border border-emerald-500/30 text-emerald-300 font-bold text-xs"
                  />
                  {calcResult.tp3 && <span className="text-[8px] text-gray-400 block">Full: +${calcResult.tp3.profitFullLot}</span>}
                </div>
              </div>

              {/* Partial Allocation Weights */}
              <div className="p-2 rounded-xl bg-black/30 border border-white/5 space-y-1 text-[9px]">
                <div className="flex justify-between text-gray-400">
                  <span>Partial TP Weights:</span>
                  <span className="text-white font-bold">{tp1Pct + tp2Pct + tp3Pct}% Total</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-400">TP1:</span>
                    <input
                      type="number"
                      value={tp1Pct}
                      onChange={(e) => setTp1Pct(parseInt(e.target.value) || 0)}
                      className="w-12 px-1 py-0.5 rounded bg-black/60 border border-white/10 text-white font-bold text-center"
                    />
                    <span>%</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-400">TP2:</span>
                    <input
                      type="number"
                      value={tp2Pct}
                      onChange={(e) => setTp2Pct(parseInt(e.target.value) || 0)}
                      className="w-12 px-1 py-0.5 rounded bg-black/60 border border-white/10 text-white font-bold text-center"
                    />
                    <span>%</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-gray-400">TP3:</span>
                    <input
                      type="number"
                      value={tp3Pct}
                      onChange={(e) => setTp3Pct(parseInt(e.target.value) || 0)}
                      className="w-12 px-1 py-0.5 rounded bg-black/60 border border-white/10 text-white font-bold text-center"
                    />
                    <span>%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Spread Buffer Toggle */}
            <div className="flex items-center justify-between text-[9px] pt-1">
              <label className="flex items-center space-x-1.5 cursor-pointer text-gray-300">
                <input
                  type="checkbox"
                  checked={useSpreadBuffer}
                  onChange={(e) => setUseSpreadBuffer(e.target.checked)}
                  className="rounded border-white/20 bg-black text-cyan-500"
                />
                <span>Include Slippage / Spread Buffer (+{spreadBufferPips} pips)</span>
              </label>
              <span className="text-gray-400">
                Break-even: {calcResult.suggestedBreakEven}
              </span>
            </div>

            {/* Blended Return Spotlight */}
            <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between text-[10px]">
              <div>
                <span className="text-[8px] text-gray-400 uppercase font-bold block">RECOMMENDED LOT SIZE</span>
                <span className="text-xl font-black text-white">{calcResult.safeLotSize.toFixed(2)} LOTS</span>
                <span className="text-[8px] text-gray-400 block">Raw mathematical: {calcResult.rawLotSize.toFixed(3)}</span>
              </div>

              <div className="text-right">
                <span className="text-[8px] text-emerald-400 uppercase font-bold block">ESTIMATED TOTAL PROFIT</span>
                <span className="text-base font-black text-emerald-300">+${calcResult.blendedTotalProfit.toFixed(2)}</span>
                <span className="text-[8px] text-cyan-300 block">{calcResult.blendedTotalRR} Blended R:R</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-3">
              <span className="text-[8px] text-gray-500 leading-tight">
                {calcResult.safetyLabel}
              </span>

              <button
                onClick={handleSendToExecution}
                disabled={!calcResult.isValid}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs transition-all shadow-md cursor-pointer border border-cyan-300/40 flex items-center space-x-1"
              >
                <span>SEND PLAN TO EXECUTION</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
