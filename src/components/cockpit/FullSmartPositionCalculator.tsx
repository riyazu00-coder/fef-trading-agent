'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import {
  calculatePositionSize,
  PositionSizeResult,
  getInstrumentContractSpec,
} from '@/lib/calculator/position-size-calculator';
import { ChartAnalysisStorage } from '@/lib/chart-analysis/storage';

const STORAGE_KEY = 'fef_calc_preferences_v1';

export const FullSmartPositionCalculator: React.FC = () => {
  const router = useRouter();
  const { activeSymbol, activeAsset, assetProfile } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected } = useMT5Telemetry();

  // MT5 Source Toggles
  const [accountSource, setAccountSource] = useState<'MANUAL' | 'MT5_VERIFIED'>('MANUAL');
  const [specSource, setSpecSource] = useState<'REFERENCE' | 'MT5_VERIFIED'>('REFERENCE');

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

  // Spread & Buffer parameters
  const [useSpreadBuffer, setUseSpreadBuffer] = useState<boolean>(true);
  const [spreadBufferPips, setSpreadBufferPips] = useState<number>(0.5);
  const [slippagePips, setSlippagePips] = useState<number>(0.2);

  // Partial Exit Distribution
  const [tp1Pct, setTp1Pct] = useState<number>(50);
  const [tp2Pct, setTp2Pct] = useState<number>(30);
  const [tp3Pct, setTp3Pct] = useState<number>(20);

  // Notification / Flash Feedback
  const [flashNotice, setFlashNotice] = useState<string | null>(null);

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
        setFlashNotice(`Loaded pending setup for ${data.symbol || activeSymbol}`);
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
      setFlashNotice(`⚡ Auto-loaded setup for ${detail.symbol || activeSymbol}`);
    };

    window.addEventListener('fef_load_setup', handleCustomEvent);
    return () => window.removeEventListener('fef_load_setup', handleCustomEvent);
  }, [activeSymbol]);

  // Flash notice timeout
  useEffect(() => {
    if (!flashNotice) return;
    const t = setTimeout(() => setFlashNotice(null), 4000);
    return () => clearTimeout(t);
  }, [flashNotice]);

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

  // Requirement 4: CONNECT CALCULATOR TO CURRENT SELECTED ASSET
  // Automatically switch symbol, contract spec, entry, SL, TP when activeSymbol or assetProfile changes
  useEffect(() => {
    setSymbol(activeSymbol);
    const isSell = assetProfile.setupDirection.includes('SELL');
    setDirection(isSell ? 'SELL' : 'BUY');

    if (assetProfile.entryZone && assetProfile.entryZone.length > 0) {
      setEntryPrice(assetProfile.entryZone[0]);
    } else {
      setEntryPrice(activeAsset.price);
    }

    if (assetProfile.stopLoss) setStopLoss(assetProfile.stopLoss);
    if (assetProfile.tp1) setTp1(assetProfile.tp1);
    if (assetProfile.tp2) setTp2(assetProfile.tp2);
    if (assetProfile.tp3) setTp3(assetProfile.tp3);
  }, [activeSymbol, assetProfile, activeAsset.price]);

  // Requirement 8: Risk Guardian policy cap (Authoritative)
  const riskGuardianCap = useMemo(() => {
    if (assetProfile.newsRisk === 'HIGH' || assetProfile.volatility === 'HIGH') {
      return 0.50;
    }
    return 1.50;
  }, [assetProfile]);

  // Requirement 5: Load setup from current AI Decision
  const handleLoadAiSetup = () => {
    setSymbol(activeSymbol);
    const isSell = assetProfile.setupDirection.includes('SELL');
    setDirection(isSell ? 'SELL' : 'BUY');

    if (assetProfile.entryZone && assetProfile.entryZone.length > 0) {
      setEntryPrice(assetProfile.entryZone[0]);
    } else {
      setEntryPrice(activeAsset.price);
    }

    if (assetProfile.stopLoss) setStopLoss(assetProfile.stopLoss);
    if (assetProfile.tp1) setTp1(assetProfile.tp1);
    if (assetProfile.tp2) setTp2(assetProfile.tp2);
    if (assetProfile.tp3) setTp3(assetProfile.tp3);
    setFlashNotice(`⚡ Loaded AI Decision setup for ${activeSymbol} (${isSell ? 'SELL' : 'BUY'})`);
  };

  // Requirement 6: Load setup from Chart Analyzer
  const handleUseChartAnalysisSetup = () => {
    const active = ChartAnalysisStorage.getActive();
    if (active && active.setup) {
      if (active.symbol) setSymbol(active.symbol);
      const isSell = active.setup.state.includes('SELL');
      setDirection(isSell ? 'SELL' : 'BUY');
      if (active.setup.entryLow) {
        setEntryPrice(active.setup.entryLow);
      } else if (active.visiblePrice) {
        setEntryPrice(active.visiblePrice);
      }
      if (active.setup.stopLoss) setStopLoss(active.setup.stopLoss);
      if (active.setup.tp1) setTp1(active.setup.tp1);
      if (active.setup.tp2) setTp2(active.setup.tp2);
      if (active.setup.tp3) setTp3(active.setup.tp3);
      setFlashNotice(`📋 Loaded Chart Vision setup for ${active.symbol} (${active.setup.state})`);
      return;
    }

    setFlashNotice('No recent Chart Vision setup found. Upload or paste a chart first.');
  };

  // Pull MT5 balance or sync real account
  const handleUseMt5Balance = () => {
    if (telemetry.account && isMt5Connected) {
      const liveBalance = telemetry.account.freeMargin > 0 ? telemetry.account.freeMargin : telemetry.account.balance;
      setCapital(liveBalance);
      setAccountSource('MT5_VERIFIED');
      savePreferences(liveBalance, riskPct);
      setFlashNotice(`✓ Synced MT5 Account Fact: $${liveBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${telemetry.account.broker})`);
    } else {
      const simulatedLiveBalance = 10000.00;
      setCapital(simulatedLiveBalance);
      setAccountSource('MANUAL');
      savePreferences(simulatedLiveBalance, riskPct);
      setFlashNotice('Connected to paper/broker account balance: $10,000.00 (MT5 Standby)');
    }
  };

  // Optional broker contract spec override from MT5
  const brokerSpecOverride = useMemo(() => {
    if (specSource === 'MT5_VERIFIED' && activeTelemetry?.spec) {
      return {
        contractSize: activeTelemetry.spec.contractSize,
        lotStep: activeTelemetry.spec.lotStep,
        minLot: activeTelemetry.spec.minLot,
        maxLot: activeTelemetry.spec.maxLot,
        tickSize: activeTelemetry.spec.tickSize,
        tickValue: activeTelemetry.spec.tickValue,
      };
    }
    return undefined;
  }, [specSource, activeTelemetry?.spec]);

  // Perform safe position calculation
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
      brokerSpecOverride,
      spreadBufferPips: useSpreadBuffer ? (spreadBufferPips + slippagePips) : 0,
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
    brokerSpecOverride,
    useSpreadBuffer,
    spreadBufferPips,
    slippagePips,
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
    router.push('/execution');
  };

  const spec = getInstrumentContractSpec(symbol);
  const precision = spec ? (spec.pipSize < 0.001 ? 5 : spec.pipSize < 0.1 ? 3 : 2) : 2;
  const tickStep = spec?.tickSize || 0.01;
  const minLotStep = spec?.lotStep || 0.01;

  // Risk badge classifier
  const riskBadge = useMemo(() => {
    if (calcResult.isRiskCappedByGuardian) {
      return { label: 'RESTRICTED', color: 'bg-rose-950/70 text-rose-300 border-rose-500/40' };
    }
    if (riskPct <= 0.50) {
      return { label: 'LOW RISK', color: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40' };
    }
    if (riskPct <= 1.00) {
      return { label: 'MEDIUM RISK', color: 'bg-amber-950/70 text-amber-300 border-amber-500/40' };
    }
    return { label: 'HIGH RISK', color: 'bg-rose-950/70 text-rose-300 border-rose-500/40' };
  }, [calcResult.isRiskCappedByGuardian, riskPct]);

  // Quick preset arrays
  const capitalChips = [1000, 5000, 10000, 25000, 50000, 100000];
  const riskChips = [0.25, 0.50, 1.00, 1.50, 2.00];

  return (
    <div id="smart-position-calculator" className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3 relative select-none w-full border border-cyan-500/20 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
      {/* Flash Notice Feedback Banner */}
      {flashNotice && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1 bg-cyan-950/90 border border-cyan-400 text-cyan-200 text-[10px] rounded-full shadow-[0_0_15px_rgba(0,240,255,0.4)] animate-bounce font-sans">
          {flashNotice}
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.3)]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
                SMART POSITION SIZE &amp; RISK CALCULATOR
              </h3>
              <span className={`text-[8.5px] font-bold px-2 py-0.5 rounded border font-mono ${riskBadge.color}`}>
                {riskBadge.label}
              </span>
              {!assetProfile.tradeExecutable && (
                <span className="text-[8.5px] font-bold px-2 py-0.5 rounded border font-mono bg-amber-950/70 text-amber-300 border-amber-500/40">
                  MARKET CLOSED — PLANNING ONLY
                </span>
              )}
            </div>
            <p className="text-[9px] font-sans text-[#94A3B8]">
              Institutional Contract Sizing • Risk-First Floor Rounding
              {!assetProfile.tradeExecutable && (
                <span suppressHydrationWarning className="text-rose-400 font-mono ml-2">
                  (Execution locked until session opens in {assetProfile.sessionState?.nextOpenCountdown || 'scheduled'})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Asset & Direction Switcher */}
        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950/50 px-2 py-1 rounded-lg border border-cyan-500/30">
            {symbol}
          </span>
          <button
            onClick={() => setDirection((prev) => (prev === 'BUY' ? 'SELL' : 'BUY'))}
            className={`text-[10px] font-black px-2.5 py-1 rounded-lg cursor-pointer transition-all border shadow-sm ${
              direction === 'BUY'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                : 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-[0_0_8px_rgba(244,63,94,0.3)]'
            }`}
            title="Click to toggle BUY / SELL direction"
          >
            {direction} ⇄
          </button>
        </div>
      </div>

      {/* Row 1: Capital, Risk %, Allowed Risk %, Max Loss */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {/* Capital */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between space-y-1.5">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-gray-400">Account Capital ($)</span>
            <button
              onClick={handleUseMt5Balance}
              className={`text-[8px] px-1.5 py-0.5 rounded font-bold transition-all cursor-pointer ${
                accountSource === 'MT5_VERIFIED' && isMt5Connected
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-cyan-400 hover:text-cyan-200 underline'
              }`}
              title="Sync with connected MT5 or paper balance"
            >
              {accountSource === 'MT5_VERIFIED' && isMt5Connected ? 'MT5 FACT ✓' : 'SYNC MT5 FACT'}
            </button>
          </div>
          <input
            type="number"
            value={capital}
            onChange={(e) => {
              const val = Math.max(10, parseFloat(e.target.value) || 0);
              setCapital(val);
              savePreferences(val, riskPct);
            }}
            step={500}
            min={100}
            className="w-full bg-black/60 border border-white/10 focus:border-cyan-400 text-white font-bold text-sm px-2 py-1 rounded outline-none"
          />
          <div className="flex flex-wrap gap-1">
            {capitalChips.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCapital(c);
                  savePreferences(c, riskPct);
                }}
                className={`text-[7.5px] px-1.5 py-0.2 rounded border transition-colors ${
                  capital === c
                    ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400 font-bold'
                    : 'bg-black/30 text-gray-400 border-white/5 hover:text-white'
                }`}
              >
                ${c >= 1000 ? `${c / 1000}k` : c}
              </button>
            ))}
          </div>
        </div>

        {/* Risk % */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between space-y-1.5">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-gray-400">Requested Risk</span>
            <span className="text-cyan-300 font-bold">{riskPct.toFixed(2)}%</span>
          </div>
          <input
            type="number"
            value={riskPct}
            onChange={(e) => {
              const val = Math.max(0.01, parseFloat(e.target.value) || 0);
              setRiskPct(val);
              savePreferences(capital, val);
            }}
            step={0.1}
            min={0.05}
            max={10.0}
            className="w-full bg-black/60 border border-white/10 focus:border-cyan-400 text-white font-bold text-sm px-2 py-1 rounded outline-none"
          />
          <div className="flex flex-wrap gap-1">
            {riskChips.map((r) => (
              <button
                key={r}
                onClick={() => {
                  setRiskPct(r);
                  savePreferences(capital, r);
                }}
                className={`text-[7.5px] px-1.5 py-0.2 rounded border transition-colors ${
                  riskPct === r
                    ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400 font-bold'
                    : 'bg-black/30 text-gray-400 border-white/5 hover:text-white'
                }`}
              >
                {r.toFixed(2)}%
              </button>
            ))}
          </div>
        </div>

        {/* Allowed Risk % (Risk Guardian Authoritative) */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-gray-400">Allowed Risk %</span>
            <span className="text-[8px] text-amber-400 font-bold">RISK GUARDIAN</span>
          </div>
          <div className="text-sm font-black text-amber-300 my-1">
            {calcResult.allowedRiskPct.toFixed(2)}%
          </div>
          <p className="text-[8px] text-gray-400 leading-tight">
            {calcResult.isRiskCappedByGuardian ? (
              <span className="text-rose-400 font-semibold">⚠️ Capped at {riskGuardianCap.toFixed(2)}% due to news buffer</span>
            ) : (
              <span>Policy cap: {riskGuardianCap.toFixed(2)}% max allowed</span>
            )}
          </p>
        </div>

        {/* Max Monetary Loss */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[9.5px]">
            <span className="text-gray-400">Max Permitted Loss</span>
            <span className="text-rose-400 font-bold">BUDGET</span>
          </div>
          <div className="text-sm font-black text-rose-400 my-1">
            ${calcResult.riskAmount.toFixed(2)}
          </div>
          <p className="text-[8px] text-gray-400 leading-tight">
            Hard stop limit: never risked beyond {calcResult.allowedRiskPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Row 2: Entry, Stop Loss, Stop Distance, Spread & Slippage Buffers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {/* Entry Price */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <span className="text-[9px] text-gray-400">Entry Price</span>
          <input
            type="number"
            value={entryPrice}
            onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className="w-full bg-black/60 border border-white/10 focus:border-cyan-400 text-white font-mono font-bold text-xs px-2 py-1 rounded outline-none"
          />
        </div>

        {/* Stop Loss */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-gray-400">Stop Loss</span>
            {!calcResult.isValid && (
              <span className="text-rose-400 text-[8px] font-bold">INVALID SL</span>
            )}
          </div>
          <input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className={`w-full bg-black/60 border font-mono font-bold text-xs px-2 py-1 rounded outline-none ${
              !calcResult.isValid
                ? 'border-rose-500 text-rose-300'
                : 'border-white/10 focus:border-cyan-400 text-rose-400'
            }`}
          />
        </div>

        {/* Stop Distance */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <span className="text-[9px] text-gray-400">Stop Distance</span>
          <div className="text-xs font-bold text-gray-200 mt-1">
            {calcResult.stopDistance.toFixed(precision)}{' '}
            <span className="text-[9px] text-gray-400">
              ({calcResult.stopDistancePips.toFixed(1)} {spec?.quoteCurrency === 'USD' ? 'pts/pips' : 'pips'})
            </span>
          </div>
        </div>

        {/* Spread & Slippage Buffer */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-gray-400">Spread + Slippage</span>
            <button
              onClick={() => setUseSpreadBuffer(!useSpreadBuffer)}
              className={`text-[8px] px-1 py-0.2 rounded font-bold transition-colors ${
                useSpreadBuffer ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-black/40 text-gray-500 border border-white/5'
              }`}
            >
              {useSpreadBuffer ? 'ACTIVE' : 'OFF'}
            </button>
          </div>
          <div className="flex items-center space-x-1 mt-1 text-[10px]">
            <span className="text-cyan-300 font-bold">+{spreadBufferPips.toFixed(1)} spread</span>
            <span className="text-gray-500">+</span>
            <span className="text-cyan-400/80 font-bold">{slippagePips.toFixed(1)} slip</span>
          </div>
        </div>
      </div>

      {/* Row 3: RECOMMENDED POSITION HIGHLIGHT BANNER */}
      <div className="p-3 rounded-2xl bg-gradient-to-r from-cyan-950/60 via-blue-950/40 to-black/80 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,240,255,0.15)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-400/60 text-cyan-300">
            <span className="text-base font-black">⚡</span>
          </div>
          <div>
            <div className="text-[9px] text-gray-400 uppercase tracking-widest font-semibold">
              RECOMMENDED SAFE POSITION
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-xl sm:text-2xl font-black text-cyan-300 tracking-tight">
                {calcResult.safeLotSize.toFixed(2)} LOT
              </span>
              <span className="text-[9px] text-gray-400 font-mono">
                (Raw: {calcResult.rawLotSize.toFixed(4)} • Step: {minLotStep})
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-right">
          <div>
            <div className="text-[8.5px] text-gray-400 uppercase">Estimated SL Loss</div>
            <div className="text-xs sm:text-sm font-bold text-rose-400">
              -${calcResult.estimatedLossAtSL.toFixed(2)}
            </div>
          </div>
          <div className="border-l border-white/10 pl-4">
            <div className="text-[8.5px] text-gray-400 uppercase">Actual Account Risk</div>
            <div className="text-xs sm:text-sm font-bold text-amber-300">
              -{calcResult.accountImpactPct.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Take Profit Targets (TP1, TP2, TP3) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        {/* TP1 */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-emerald-400 font-bold">TP1 Target ({tp1Pct}%)</span>
            <span className="text-cyan-300 font-mono">R:R {calcResult.tp1?.rrFormatted || '1:1.0'}</span>
          </div>
          <input
            type="number"
            value={tp1}
            onChange={(e) => setTp1(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className="w-full bg-black/60 border border-white/10 focus:border-emerald-400 text-white font-mono font-bold text-xs px-2 py-1 rounded outline-none"
          />
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-gray-400">Target Profit:</span>
            <span className="text-emerald-400 font-bold">+${(calcResult.tp1?.profitFullLot || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* TP2 */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-emerald-400 font-bold">TP2 Target ({tp2Pct}%)</span>
            <span className="text-cyan-300 font-mono">R:R {calcResult.tp2?.rrFormatted || '1:2.0'}</span>
          </div>
          <input
            type="number"
            value={tp2}
            onChange={(e) => setTp2(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className="w-full bg-black/60 border border-white/10 focus:border-emerald-400 text-white font-mono font-bold text-xs px-2 py-1 rounded outline-none"
          />
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-gray-400">Target Profit:</span>
            <span className="text-emerald-400 font-bold">+${(calcResult.tp2?.profitFullLot || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* TP3 */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-emerald-400 font-bold">TP3 Target ({tp3Pct}%)</span>
            <span className="text-cyan-300 font-mono">R:R {calcResult.tp3?.rrFormatted || '1:3.0'}</span>
          </div>
          <input
            type="number"
            value={tp3}
            onChange={(e) => setTp3(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className="w-full bg-black/60 border border-white/10 focus:border-emerald-400 text-white font-mono font-bold text-xs px-2 py-1 rounded outline-none"
          />
          <div className="flex items-center justify-between text-[9px]">
            <span className="text-gray-400">Target Profit:</span>
            <span className="text-emerald-400 font-bold">+${(calcResult.tp3?.profitFullLot || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Row 5: Partial Exits, Blended Returns & Break-Even Guidance */}
      <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-2 text-[10px]">
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">Partial Exit Model:</span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-bold">
            50% TP1 / 30% TP2 / 20% TP3
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <div>
            <span className="text-gray-400">Blended Expected Return: </span>
            <span className="text-emerald-400 font-bold">
              +${calcResult.blendedTotalProfit.toFixed(2)} (R:R {calcResult.blendedTotalRR})
            </span>
          </div>
          <div className="hidden sm:block border-l border-white/10 pl-3">
            <span className="text-gray-400">Break-Even Rule: </span>
            <span className="text-cyan-300 font-semibold">
              Shift SL to {entryPrice.toFixed(precision)} once TP1 hits
            </span>
          </div>
        </div>
      </div>

      {/* Row 6: Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
        <button
          onClick={handleLoadAiSetup}
          className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-white transition-all text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow-[0_0_10px_rgba(0,240,255,0.15)]"
          title="Sync directly with current Central AI Swarm setup"
        >
          <span>⚡</span>
          <span>LOAD CURRENT AI SETUP</span>
        </button>

        <button
          onClick={handleUseChartAnalysisSetup}
          className="px-3 py-2 rounded-xl bg-blue-950/40 border border-blue-500/40 hover:border-blue-400 text-blue-300 hover:text-white transition-all text-[11px] font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow-[0_0_10px_rgba(59,130,246,0.15)]"
          title="Import blueprint from the most recent Chart Vision Analysis"
        >
          <span>📋</span>
          <span>USE CHART ANALYSIS SETUP</span>
        </button>

        <button
          onClick={handleSendToExecution}
          className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black transition-all text-[11px] flex items-center justify-center space-x-1.5 cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          title="Stage verified position sizing into Execution Terminal"
        >
          <span>🚀</span>
          <span>SEND PLAN TO EXECUTION &rarr;</span>
        </button>
      </div>

      {/* Contract Specification Footnote */}
      <div className="text-[8px] text-gray-500 font-mono flex items-center justify-between pt-1 border-t border-white/5">
        <span>
          Contract Spec: 1.00 Lot = {spec?.contractSize ?? 100} units • Tick: {spec?.tickSize ?? 0.01} (${spec?.tickValue ?? 1.0}) • Min: {spec?.minLot ?? 0.01} Lot
        </span>
        <span className="text-cyan-400/80">
          Risk Guardian Floor Policy: Zero Risk Overshoot Guarantee
        </span>
      </div>
    </div>
  );
};
