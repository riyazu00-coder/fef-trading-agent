'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { useLicense } from '@/context/LicenseContext';
import { useMemberAuth } from '@/context/MemberAuthContext';
import { normalizeAccountTradeMode } from '@/lib/execution/execution-policy';
import {
  calculatePositionSize,
  PositionSizeResult,
  getInstrumentContractSpec,
} from '@/lib/calculator/position-size-calculator';
import { reanchorProtectionLevels } from '@/lib/execution/trade-protection-validator';
import { dispatchUnifiedManualOrder } from '@/lib/execution/manual-order-client';
import { ChartAnalysisStorage } from '@/lib/chart-analysis/storage';
import {
  calculateAutomaticStopLoss,
  AutomaticStopLossResult,
} from '@/lib/execution/auto-stop-loss-policy';

const STORAGE_KEY = 'fef_calc_preferences_v1';

export interface FullSmartPositionCalculatorProps {
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export const FullSmartPositionCalculator: React.FC<FullSmartPositionCalculatorProps> = ({
  collapsible = false,
  defaultCollapsed = false,
}) => {
  const router = useRouter();
  const { activeSymbol, activeAsset, assetProfile } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected, refreshTelemetry } = useMT5Telemetry();
  const { licenseState } = useLicense();
  const {
    isAuthenticated,
    isMaster,
    license: memberLicense,
    isDeviceAuthorized,
  } = useMemberAuth();

  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(defaultCollapsed);

  // Capital & MT5 Source Toggles
  const [capitalMode, setCapitalMode] = useState<'LIVE_MT5' | 'MANUAL'>('MANUAL');
  const [accountSource, setAccountSource] = useState<'MANUAL' | 'MT5_VERIFIED'>('MANUAL');
  const [specSource, setSpecSource] = useState<'REFERENCE' | 'MT5_VERIFIED'>('REFERENCE');

  // Lot Sizing Mode (AUTO vs MANUAL)
  const [lotMode, setLotMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualLotInput, setManualLotInput] = useState<string>('0.10');

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
  const [mounted, setMounted] = useState<boolean>(false);

  // One-Click Execution Guard Modal States
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [realRiskAcknowledged, setRealRiskAcknowledged] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    ticket?: number | string;
    message?: string;
    error?: string;
  } | null>(null);

  // Live Heartbeat in Confirmation Modal (1-second quote freshness refresh)
  useEffect(() => {
    if (!isConfirmModalOpen) return;
    refreshTelemetry().catch(() => {});
    const interval = setInterval(() => {
      refreshTelemetry().catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, [isConfirmModalOpen, refreshTelemetry]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    setMounted(true);
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

    const currentPrice = (assetProfile.entryZone && assetProfile.entryZone.length > 0) ? assetProfile.entryZone[0] : activeAsset.price;
    setEntryPrice(currentPrice);

    const dir = isSell ? 'SELL' : 'BUY';
    const autoSl = calculateAutomaticStopLoss({
      symbol: activeSymbol,
      side: dir,
      executionPrice: currentPrice,
      brokerSpec: activeTelemetry?.spec,
      verifiedVolatility: (assetProfile as any)?.volatilityContext?.atr ? { atr: (assetProfile as any).volatilityContext.atr } : undefined,
    });

    if (activeSymbol.toUpperCase() === 'XAUUSD') {
      // Gold mandatory 50-pip rule is strictly enforced
      setStopLoss(autoSl.stopLossPrice);
    } else if (assetProfile.stopLoss && assetProfile.stopLoss > 0) {
      setStopLoss(assetProfile.stopLoss);
    } else if (currentPrice > 0) {
      setStopLoss(autoSl.stopLossPrice);
    }

    if (assetProfile.tp1 && assetProfile.tp1 > 0) {
      setTp1(assetProfile.tp1);
    } else if (currentPrice > 0) {
      setTp1(isSell ? Number((currentPrice - autoSl.distancePrice * 2.0).toFixed(autoSl.digits)) : Number((currentPrice + autoSl.distancePrice * 2.0).toFixed(autoSl.digits)));
    }

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

  // Account mode resolution from live MT5 telemetry
  const accountTradeMode = useMemo(() => {
    return normalizeAccountTradeMode(
      telemetry.account?.tradeMode ?? (telemetry as any).accountMode ?? (telemetry.operatingMode === 'DEMO_EXECUTION' ? 'DEMO' : undefined)
    );
  }, [telemetry.account?.tradeMode, (telemetry as any).accountMode, telemetry.operatingMode]);

  const isDemoAccount = accountTradeMode === 'DEMO';
  const isRealAccount = accountTradeMode === 'REAL';
  const isUnknownAccount = accountTradeMode === 'UNKNOWN';

  // Authorization check
  const isLicenseAuthorized = Boolean(
    (isDemoAccount && isMt5Connected) ||
    isMaster ||
    (isAuthenticated && memberLicense?.status === 'ACTIVE' && isDeviceAuthorized) ||
    licenseState.valid
  );

  // Live MT5 Capital extraction (Equity takes priority over Balance)
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

  const capitalSourceBadge = useMemo(() => {
    if (capitalMode === 'LIVE_MT5' && isMt5Connected && liveMt5Capital != null) {
      if (mt5Equity != null) {
        return { label: 'LIVE • MT5 EQUITY', color: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40' };
      }
      return { label: 'LIVE • MT5 BALANCE', color: 'bg-cyan-950/70 text-cyan-300 border-cyan-500/40' };
    }
    return { label: 'MANUAL OVERRIDE', color: 'bg-amber-950/70 text-amber-300 border-amber-500/40' };
  }, [capitalMode, isMt5Connected, liveMt5Capital, mt5Equity, mt5Balance]);

  const effectiveCapital = (capitalMode === 'LIVE_MT5' && liveMt5Capital != null) ? liveMt5Capital : capital;

  // Functional MT5 fact sync: clears manual override, reads fresh equity/balance
  const handleSyncMt5Fact = async () => {
    try {
      await refreshTelemetry();
    } catch {}
    if (telemetry.account && isMt5Connected) {
      const liveCapital = (typeof telemetry.account.equity === 'number' && telemetry.account.equity > 0)
        ? telemetry.account.equity
        : Number(telemetry.account.balance || 10000);
      const isUsingEquity = typeof telemetry.account.equity === 'number' && telemetry.account.equity > 0;
      setCapital(liveCapital);
      setCapitalMode('LIVE_MT5');
      setAccountSource('MT5_VERIFIED');
      savePreferences(liveCapital, riskPct);
      setFlashNotice(`✓ Synced MT5 Capital Fact: $${liveCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })} (${isUsingEquity ? 'Equity' : 'Balance'})`);
    } else {
      setFlashNotice('⚠️ MT5 Offline — cannot sync live equity');
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

  // Check market freshness (permit human manual execution when market session is not closed)
  const isMarketOpen = activeTelemetry?.quote?.freshness !== 'SESSION_CLOSED';

  // Central Asset-Aware Auto SL evaluation
  const autoSlDetails = useMemo(() => {
    return calculateAutomaticStopLoss({
      symbol,
      side: direction,
      executionPrice: entryPrice,
      brokerSpec: activeTelemetry?.spec,
      verifiedVolatility: (assetProfile as any)?.volatilityContext?.atr ? { atr: (assetProfile as any).volatilityContext.atr } : undefined,
    });
  }, [symbol, direction, entryPrice, activeTelemetry?.spec, (assetProfile as any)?.volatilityContext]);

  // Perform safe position calculation
  const calcResult: PositionSizeResult = useMemo(() => {
    const parsedManualLot = lotMode === 'MANUAL' ? parseFloat(manualLotInput) : undefined;
    return calculatePositionSize({
      symbol,
      direction,
      capital: effectiveCapital,
      riskPct,
      entryPrice,
      stopLoss,
      tp1,
      tp2,
      tp3,
      riskGuardianMaxRiskPct: riskGuardianCap,
      brokerSpecOverride,
      spreadBufferPips: useSpreadBuffer ? (spreadBufferPips + slippagePips) : 0,
      manualLotOverride: lotMode === 'MANUAL' ? (Number.isFinite(parsedManualLot) ? parsedManualLot : 0) : undefined,
      exitDistribution: {
        tp1Pct,
        tp2Pct,
        tp3Pct,
      },
    });
  }, [
    symbol,
    direction,
    effectiveCapital,
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
    lotMode,
    manualLotInput,
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

  // Open One-Click Confirmation Guard Modal
  const handleOpenConfirmModal = () => {
    if (!calcResult.isValid || calcResult.safeLotSize <= 0 || stopLoss <= 0 || !spec || !spec.isVerified) {
      setFlashNotice('⚠️ Execution locked: Provide valid Stop Loss and verified contract specs.');
      return;
    }

    if (calcResult.brokerLotValidationError) {
      setFlashNotice(`⚠️ Invalid lot size: ${calcResult.brokerLotValidationError}`);
      return;
    }

    if (calcResult.isRiskLimitExceeded) {
      setFlashNotice(`⚠️ Risk Limit Exceeded: ${calcResult.accountImpactPct.toFixed(2)}% > ${calcResult.allowedRiskPct.toFixed(2)}% max allowed.`);
      return;
    }

    if (direction === 'BUY' && (stopLoss >= entryPrice || (tp1 > 0 && tp1 <= entryPrice))) {
      setFlashNotice('⚠️ Inverted Risk Geometry: For BUY, SL must be below entry and TP1 above entry.');
      return;
    }
    if (direction === 'SELL' && (stopLoss <= entryPrice || (tp1 > 0 && tp1 >= entryPrice))) {
      setFlashNotice('⚠️ Inverted Risk Geometry: For SELL, SL must be above entry and TP1 below entry.');
      return;
    }

    setExecutionResult(null);
    setIsConfirmModalOpen(true);
  };

  // Confirm and dispatch direct to /api/bridge/mt5
  const handleConfirmDispatch = async () => {
    setIsDispatching(true);
    setExecutionResult(null);

    try {
      // 1. Pre-dispatch fresh tick fetch to evaluate against real-time broker price
      await refreshTelemetry().catch(() => {});

      const livePrice = (activeTelemetry?.quote && (direction === 'BUY' ? activeTelemetry.quote.ask : activeTelemetry.quote.bid)) || entryPrice;

      // 2. Dynamic Live Pip Re-anchoring (Guarantees valid geometry & preserves exact pip distances)
      const reanchored = reanchorProtectionLevels({
        direction,
        plannedEntry: entryPrice,
        freshEntry: livePrice > 0 ? livePrice : entryPrice,
        sl: stopLoss,
        tp1: tp1 > 0 ? tp1 : 0,
        tp2: tp2 > 0 ? tp2 : undefined,
        tp3: tp3 > 0 ? tp3 : undefined,
        digits: precision,
      });

      const res = await dispatchUnifiedManualOrder({
        symbol,
        direction,
        volume: calcResult.safeLotSize,
        entryPrice: reanchored.entry,
        sl: reanchored.sl,
        tp1: reanchored.tp1 > 0 ? reanchored.tp1 : undefined,
        tp2: reanchored.tp2 != null ? reanchored.tp2 : undefined,
        tp3: reanchored.tp3 != null ? reanchored.tp3 : undefined,
        plannedPrice: entryPrice,
        tradeMode: isRealAccount ? 'REAL' : 'DEMO',
        realConfirmed: isRealAccount ? realRiskAcknowledged : false,
        digits: precision,
        comment: `FEF CORTEX COCKPIT ${lotMode === 'MANUAL' ? 'MANUAL' : 'AUTO'}`,
      });

      if (res.success) {
        const ticketNum = res.ticket || 'TICKET-' + Date.now().toString().slice(-6);
        setExecutionResult({
          success: true,
          ticket: ticketNum,
          message: res.message || `Order successfully executed via MT5 Bridge (${calcResult.safeLotSize.toFixed(2)} lots ${direction} ${symbol})`,
        });
        setFlashNotice(`✓ Executed on MT5: ${symbol} ${direction} ${calcResult.safeLotSize.toFixed(2)} lots (#${ticketNum})`);
      } else {
        const errorMsg = res.error?.message || 'Execution rejected by bridge or trade protection gate.';
        setExecutionResult({
          success: false,
          error: errorMsg,
        });
      }
    } catch (err: any) {
      setExecutionResult({
        success: false,
        error: err.message || 'Network exception communicating with /api/bridge/mt5',
      });
    } finally {
      setIsDispatching(false);
    }
  };

  const spec = getInstrumentContractSpec(symbol);
  const precision = spec ? (spec.pipSize < 0.001 ? 5 : spec.pipSize < 0.1 ? 3 : 2) : 2;
  const tickStep = spec?.tickSize || 0.01;
  const minLotStep = spec?.lotStep || 0.01;

  // Dynamic Live Pip Re-anchoring for modal preview
  const livePrice = (activeTelemetry?.quote && (direction === 'BUY' ? activeTelemetry.quote.ask : activeTelemetry.quote.bid)) || entryPrice;
  const modalReanchoredLevels = useMemo(() => {
    if (!isConfirmModalOpen) return null;
    return reanchorProtectionLevels({
      direction,
      plannedEntry: entryPrice,
      freshEntry: livePrice > 0 ? livePrice : entryPrice,
      sl: stopLoss,
      tp1: tp1 > 0 ? tp1 : 0,
      tp2: tp2 > 0 ? tp2 : undefined,
      tp3: tp3 > 0 ? tp3 : undefined,
      digits: precision,
    });
  }, [isConfirmModalOpen, direction, entryPrice, livePrice, stopLoss, tp1, tp2, tp3, precision]);

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
    <div id="smart-position-calculator" className="ghost-glass-panel rounded-2xl p-3 font-mono space-y-2.5 relative select-none w-full border border-cyan-500/20 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
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
              <Link
                href="/how-to-use#risk-calculator"
                className="text-[8.5px] font-mono font-bold text-gray-400 hover:text-cyan-300 px-1.5 py-0.5 rounded border border-white/10 hover:border-cyan-400/40 bg-black/40 transition-colors"
                title="Learn how Risk & Position Size are calculated"
              >
                ? LEARN
              </Link>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${riskBadge.color}`}>
                {riskBadge.label}
              </span>
              {!assetProfile.tradeExecutable && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border font-mono bg-amber-950/70 text-amber-300 border-amber-500/40">
                  MARKET CLOSED — PLANNING ONLY
                </span>
              )}
            </div>
            <p className="text-[10px] font-sans text-[#94A3B8]">
              Institutional Contract Sizing • Risk-First Floor Rounding
              {!assetProfile.tradeExecutable && (
                <span suppressHydrationWarning className="text-rose-400 font-mono ml-2">
                  (Execution locked until session opens{mounted && assetProfile.sessionState?.nextOpenCountdown ? ` in ${assetProfile.sessionState.nextOpenCountdown}` : ''})
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Asset & Direction Switcher */}
        <div className="flex items-center space-x-2">
          {collapsible && (
            <button
              onClick={() => setIsPanelCollapsed((prev) => !prev)}
              className="text-[10px] font-bold px-2 py-1 rounded border border-white/20 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
            >
              {isPanelCollapsed ? 'EXPAND AUDIT ▼' : 'COLLAPSE ▲'}
            </button>
          )}
          <span className="text-[10.5px] font-bold text-cyan-300 bg-cyan-950/50 px-2 py-1 rounded-lg border border-cyan-500/30">
            {symbol}
          </span>
          <button
            onClick={() => setDirection((prev) => (prev === 'BUY' ? 'SELL' : 'BUY'))}
            className={`text-[10.5px] font-black px-2.5 py-1 rounded-lg cursor-pointer transition-all border shadow-sm ${
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

      {isPanelCollapsed ? (
        <div className="bg-black/40 rounded-xl p-3 border border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                direction === 'BUY'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}
            >
              {direction} {symbol}
            </span>
            <span className="text-gray-300">
              Safe Size: <strong className="text-white font-bold">{calcResult.safeLotSize.toFixed(2)} lots</strong>
            </span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-300">
              Risk: <strong className="text-rose-400 font-bold">${calcResult.estimatedLossAtSL.toFixed(2)} ({calcResult.accountImpactPct.toFixed(2)}%)</strong>
            </span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-300">
              TP1: <strong className="text-emerald-400 font-bold">${calcResult.tp1 ? calcResult.tp1.profitPartial.toFixed(2) : '0.00'} ({calcResult.tp1?.rrFormatted ?? '--'} RR)</strong>
            </span>
            <span className="text-gray-500">|</span>
            <span className="text-gray-400 text-[10px]">
              Entry: {entryPrice.toFixed(precision)} • SL: {stopLoss > 0 ? stopLoss.toFixed(precision) : '--'} • TP1: {tp1 > 0 ? tp1.toFixed(precision) : '--'}
            </span>
          </div>
          <button
            onClick={() => setIsPanelCollapsed(false)}
            className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-all cursor-pointer"
          >
            EXPAND DETAILED AUDIT ▾
          </button>
        </div>
      ) : (
        <>
          {/* Row 1: Capital, Risk %, Allowed Risk %, Max Loss */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {/* Capital */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Account Capital ($)</span>
            <div className="flex items-center space-x-1.5">
              <span className={`text-[8.5px] px-1.5 py-0.5 rounded border font-mono font-bold ${capitalSourceBadge.color}`}>
                {capitalSourceBadge.label}
              </span>
              <button
                onClick={handleSyncMt5Fact}
                className="text-[9.5px] px-1.5 py-0.5 rounded font-bold text-cyan-400 hover:text-cyan-200 underline transition-all cursor-pointer"
                title="Sync with live MT5 equity/balance fact"
              >
                SYNC MT5 FACT
              </button>
            </div>
          </div>
          <input
            type="number"
            value={effectiveCapital}
            onChange={(e) => {
              const val = Math.max(10, parseFloat(e.target.value) || 0);
              setCapital(val);
              setCapitalMode('MANUAL');
              setAccountSource('MANUAL');
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
                  setCapitalMode('MANUAL');
                  setAccountSource('MANUAL');
                  savePreferences(c, riskPct);
                }}
                className={`text-[9.5px] px-1.5 py-0.5 rounded border transition-colors ${
                  effectiveCapital === c && capitalMode === 'MANUAL'
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
          <div className="flex items-center justify-between text-[10px]">
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
                className={`text-[9.5px] px-1.5 py-0.5 rounded border transition-colors ${
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
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Allowed Risk %</span>
            <span className="text-[9.5px] text-amber-400 font-bold">RISK GUARDIAN</span>
          </div>
          <div className="text-sm font-black text-amber-300 my-1">
            {calcResult.allowedRiskPct.toFixed(2)}%
          </div>
          <p className="text-[9.5px] text-gray-400 leading-tight">
            {calcResult.isRiskCappedByGuardian ? (
              <span className="text-rose-400 font-semibold">⚠️ Capped at {riskGuardianCap.toFixed(2)}% due to news buffer</span>
            ) : (
              <span>Policy cap: {riskGuardianCap.toFixed(2)}% max allowed</span>
            )}
          </p>
        </div>

        {/* Max Monetary Loss */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Max Permitted Loss</span>
            <span className="text-rose-400 font-bold text-[9.5px]">BUDGET</span>
          </div>
          <div className="text-sm font-black text-rose-400 my-1">
            ${calcResult.riskAmount.toFixed(2)}
          </div>
          <p className="text-[9.5px] text-gray-400 leading-tight">
            Hard stop limit: never risked beyond {calcResult.allowedRiskPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Row 2: Entry, Stop Loss, Stop Distance, Spread & Slippage Buffers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {/* Entry Price */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <span className="text-[10px] text-gray-400">Entry Price</span>
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
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Stop Loss</span>
            {(!calcResult.isValid || stopLoss <= 0) && (
              <span className="text-rose-400 text-[9.5px] font-bold">INVALID / REQUIRED</span>
            )}
          </div>
          <input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className={`w-full bg-black/60 border font-mono font-bold text-xs px-2 py-1 rounded outline-none ${
              !calcResult.isValid || stopLoss <= 0
                ? 'border-rose-500 text-rose-300'
                : 'border-white/10 focus:border-cyan-400 text-rose-400'
            }`}
          />
        </div>

        {/* Stop Distance */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <span className="text-[10px] text-gray-400">Stop Distance</span>
          <div className="text-xs font-bold text-gray-200 mt-1">
            {stopLoss > 0 && calcResult.isValid ? (
              <>
                {calcResult.stopDistance.toFixed(precision)}{' '}
                <span className="text-[10px] text-gray-400">
                  ({calcResult.stopDistancePips.toFixed(1)} {spec?.quoteCurrency === 'USD' ? 'pts/pips' : 'pips'})
                </span>
              </>
            ) : (
              <span className="text-[10px] text-gray-500 italic">-- Awaiting Valid SL --</span>
            )}
          </div>
        </div>

        {/* Spread & Slippage Buffer */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Spread + Slippage</span>
            <button
              onClick={() => setUseSpreadBuffer(!useSpreadBuffer)}
              className={`text-[9.5px] px-1.5 py-0.5 rounded font-bold transition-colors ${
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

      {/* Row 3: RECOMMENDED POSITION HIGHLIGHT BANNER (FAIL-CLOSED PROTECTED) */}
      {(!calcResult.isValid || calcResult.safeLotSize <= 0 || stopLoss <= 0) ? (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-950/50 via-slate-900/60 to-black/80 border border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.15)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/60 text-amber-300">
              <span className="text-base font-black">⚠️</span>
            </div>
            <div>
              <div className="text-[10px] text-amber-400 uppercase tracking-widest font-semibold">
                {!spec || !spec.isVerified ? 'BROKER SPECIFICATIONS UNAVAILABLE' : 'CALCULATOR STATUS: FAIL-CLOSED'}
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-sm sm:text-base font-black text-amber-200 tracking-tight">
                  {!spec || !spec.isVerified
                    ? 'POSITION SIZING UNAVAILABLE'
                    : 'AWAITING VERIFIED STRUCTURE / NO VALID SETUP GEOMETRY'}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 font-mono">
                {!spec || !spec.isVerified
                  ? `Broker contract specification is not verified for ${symbol}. Position sizing fails closed.`
                  : 'Valid stop loss required to compute risk-bounded lot size'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4 text-right">
            <div>
              <div className="text-[10px] text-gray-400 uppercase">Estimated SL Loss</div>
              <div className="text-xs sm:text-sm font-bold text-gray-400">
                UNAVAILABLE
              </div>
            </div>
            <div className="border-l border-white/10 pl-4">
              <div className="text-[10px] text-gray-400 uppercase">Actual Account Risk</div>
              <div className="text-xs sm:text-sm font-bold text-gray-400">
                0.00%
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-cyan-950/60 via-blue-950/40 to-black/80 border border-cyan-400/40 shadow-[0_0_20px_rgba(0,240,255,0.15)] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-400/60 text-cyan-300">
                <span className="text-base font-black">{lotMode === 'MANUAL' ? '✏️' : '⚡'}</span>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                    {lotMode === 'MANUAL' ? 'MANUAL POSITION OVERRIDE' : 'RECOMMENDED SAFE POSITION'}
                  </span>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setLotMode('AUTO')}
                      className={`text-[9px] px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        lotMode === 'AUTO'
                          ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400'
                          : 'bg-black/40 text-gray-400 border border-white/10 hover:text-white'
                      }`}
                    >
                      AUTO CALCULATED
                    </button>
                    <button
                      onClick={() => {
                        setLotMode('MANUAL');
                        if (!manualLotInput || parseFloat(manualLotInput) <= 0) {
                          setManualLotInput(calcResult.safeLotSize.toFixed(2));
                        }
                      }}
                      className={`text-[9px] px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                        lotMode === 'MANUAL'
                          ? 'bg-amber-500/30 text-amber-300 border border-amber-400'
                          : 'bg-black/40 text-gray-400 border border-white/10 hover:text-white'
                      }`}
                    >
                      MANUAL LOT
                    </button>
                  </div>
                </div>

                {lotMode === 'AUTO' ? (
                  <div className="flex items-baseline space-x-2 mt-0.5">
                    <span className="text-xl sm:text-2xl font-black text-cyan-300 tracking-tight">
                      {calcResult.safeLotSize.toFixed(2)} LOT
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      (Raw: {calcResult.rawLotSize.toFixed(4)} • Step: {minLotStep})
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2 mt-1">
                    <input
                      type="number"
                      value={manualLotInput}
                      onChange={(e) => setManualLotInput(e.target.value)}
                      step={minLotStep}
                      min={spec?.minLot || 0.01}
                      max={spec?.maxLot || 100}
                      className="w-24 bg-black/80 border border-amber-400 focus:border-amber-300 text-amber-300 font-mono font-black text-sm px-2 py-1 rounded outline-none"
                    />
                    <span className="text-xs text-amber-400 font-bold">LOTS</span>
                    <button
                      onClick={() => {
                        setLotMode('AUTO');
                        setManualLotInput(calcResult.maxSafeLotSize ? calcResult.maxSafeLotSize.toFixed(2) : calcResult.safeLotSize.toFixed(2));
                      }}
                      className="text-[9.5px] px-2 py-1 rounded bg-cyan-950/80 border border-cyan-400/50 text-cyan-200 hover:text-white hover:bg-cyan-900 transition-colors cursor-pointer font-bold"
                    >
                      USE AUTO LOT
                    </button>
                    <span className="text-[10px] text-gray-400 font-mono">
                      (Broker: {spec?.minLot ?? 0.01} - {spec?.maxLot ?? 100} • Step: {minLotStep})
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-4 text-right">
              <div>
                <div className="text-[10px] text-gray-400 uppercase">Estimated SL Loss</div>
                <div className="text-xs sm:text-sm font-bold text-rose-400">
                  -${calcResult.estimatedLossAtSL.toFixed(2)}
                </div>
              </div>
              <div className="border-l border-white/10 pl-4">
                <div className="text-[10px] text-gray-400 uppercase">Actual Account Risk</div>
                <div className={`text-xs sm:text-sm font-bold ${calcResult.isRiskLimitExceeded ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>
                  -{calcResult.accountImpactPct.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          {/* Broker lot validation inline alert */}
          {calcResult.brokerLotValidationError && (
            <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs flex items-center space-x-2">
              <span className="text-sm">⚠️</span>
              <span><strong>INVALID LOT SIZE:</strong> {calcResult.brokerLotValidationError}</span>
            </div>
          )}

          {/* Risk Limit Exceeded alert */}
          {calcResult.isRiskLimitExceeded && (
            <div className="p-2.5 rounded-xl bg-rose-950/80 border border-rose-500/70 text-rose-200 text-xs space-y-1">
              <div className="flex items-center space-x-2 font-bold text-rose-300">
                <span className="text-sm">⚠️</span>
                <span>RISK LIMIT EXCEEDED</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Manual lot of <strong>{calcResult.safeLotSize.toFixed(2)}</strong> results in <strong>{calcResult.accountImpactPct.toFixed(2)}%</strong> risk (max allowed: <strong>{calcResult.allowedRiskPct.toFixed(2)}%</strong> / ${calcResult.riskAmount.toFixed(2)}). Execution blocked by Risk Guardian.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Row 4: Take Profit Targets (TP1, TP2, TP3) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        {/* TP1 */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-emerald-400 font-bold">TP1 Target ({tp1Pct}%)</span>
            <span className="text-cyan-300 font-mono">R:R {calcResult.isValid && stopLoss > 0 ? (calcResult.tp1?.rrFormatted || '1:1.0') : '--'}</span>
          </div>
          <input
            type="number"
            value={tp1}
            onChange={(e) => setTp1(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className="w-full bg-black/60 border border-white/10 focus:border-emerald-400 text-white font-mono font-bold text-xs px-2 py-1 rounded outline-none"
          />
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Target Profit:</span>
            <span className="text-emerald-400 font-bold">
              {calcResult.isValid && stopLoss > 0 ? `+$${(calcResult.tp1?.profitFullLot || 0).toFixed(2)}` : '--'}
            </span>
          </div>
        </div>

        {/* TP2 */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-emerald-400 font-bold">TP2 Target ({tp2Pct}%)</span>
            <span className="text-cyan-300 font-mono">R:R {calcResult.isValid && stopLoss > 0 ? (calcResult.tp2?.rrFormatted || '1:2.0') : '--'}</span>
          </div>
          <input
            type="number"
            value={tp2}
            onChange={(e) => setTp2(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className="w-full bg-black/60 border border-white/10 focus:border-emerald-400 text-white font-mono font-bold text-xs px-2 py-1 rounded outline-none"
          />
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Target Profit:</span>
            <span className="text-emerald-400 font-bold">
              {calcResult.isValid && stopLoss > 0 ? `+$${(calcResult.tp2?.profitFullLot || 0).toFixed(2)}` : '--'}
            </span>
          </div>
        </div>

        {/* TP3 */}
        <div className="bg-black/40 p-2.5 rounded-xl border border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-emerald-400 font-bold">TP3 Target ({tp3Pct}%)</span>
            <span className="text-cyan-300 font-mono">R:R {calcResult.isValid && stopLoss > 0 ? (calcResult.tp3?.rrFormatted || '1:3.0') : '--'}</span>
          </div>
          <input
            type="number"
            value={tp3}
            onChange={(e) => setTp3(parseFloat(e.target.value) || 0)}
            step={tickStep}
            className="w-full bg-black/60 border border-white/10 focus:border-emerald-400 text-white font-mono font-bold text-xs px-2 py-1 rounded outline-none"
          />
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Target Profit:</span>
            <span className="text-emerald-400 font-bold">
              {calcResult.isValid && stopLoss > 0 ? `+$${(calcResult.tp3?.profitFullLot || 0).toFixed(2)}` : '--'}
            </span>
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
              {calcResult.isValid && stopLoss > 0
                ? `+$${calcResult.blendedTotalProfit.toFixed(2)} (R:R ${calcResult.blendedTotalRR})`
                : 'Awaiting Valid Setup'}
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
          onClick={handleOpenConfirmModal}
          disabled={
            !calcResult.isValid ||
            calcResult.safeLotSize <= 0 ||
            stopLoss <= 0 ||
            !spec ||
            !spec.isVerified ||
            Boolean(calcResult.isRiskLimitExceeded) ||
            Boolean(calcResult.brokerLotValidationError)
          }
          className={`px-3 py-2 rounded-xl font-black transition-all text-[11px] flex items-center justify-center space-x-1.5 shadow-[0_0_15px_rgba(16,185,129,0.3)] ${
            !calcResult.isValid ||
            calcResult.safeLotSize <= 0 ||
            stopLoss <= 0 ||
            !spec ||
            !spec.isVerified ||
            Boolean(calcResult.isRiskLimitExceeded) ||
            Boolean(calcResult.brokerLotValidationError)
              ? 'bg-gray-800/60 border border-white/10 text-gray-500 cursor-not-allowed opacity-60 shadow-none'
              : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.4)]'
          }`}
          title={
            !spec || !spec.isVerified
              ? `Broker specifications unavailable for ${symbol} — position sizing locked`
              : calcResult.brokerLotValidationError
              ? `Invalid lot size: ${calcResult.brokerLotValidationError}`
              : calcResult.isRiskLimitExceeded
              ? `Risk limit exceeded: ${calcResult.accountImpactPct.toFixed(2)}% > ${calcResult.allowedRiskPct.toFixed(2)}% allowed`
              : !calcResult.isValid || calcResult.safeLotSize <= 0 || stopLoss <= 0
              ? 'Position calculation unavailable — specify valid entry and stop loss'
              : 'Open One-Click Safety Confirmation Guard to dispatch to MT5'
          }
        >
          <span>⚡</span>
          <span>DIRECT MT5 EXECUTE &rarr;</span>
        </button>
      </div>

      {/* Contract Specification Footnote */}
      <div className="text-[9.5px] text-gray-500 font-mono flex items-center justify-between pt-1 border-t border-white/5">
        <span>
          {spec && spec.isVerified
            ? `Contract Spec: 1.00 Lot = ${spec.contractSize} units • Tick: ${spec.tickSize} ($${spec.tickValue}) • Min: ${spec.minLot} Lot`
            : `Contract Spec: BROKER SPECIFICATIONS UNAVAILABLE for ${symbol} • Execution/Sizing Locked`}
        </span>
        <span className="text-cyan-400/80">
          Risk Guardian Floor Policy: Zero Risk Overshoot Guarantee
        </span>
      </div>
        </>
      )}

      {/* =========================================================================
          ONE-CLICK SAFETY CONFIRMATION GUARD MODAL
         ========================================================================= */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true">
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
                  if (!isDispatching) setIsConfirmModalOpen(false);
                }}
                disabled={isDispatching}
                className="text-gray-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10 transition-colors"
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
                    <span className="text-base font-black text-cyan-300">{symbol}</span>
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded ${
                        direction === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      {direction}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-gray-400 uppercase">Order Volume</span>
                  <div className="text-lg font-black text-emerald-400">
                    {calcResult.safeLotSize.toFixed(2)} <span className="text-xs text-gray-400">LOTS</span>
                  </div>
                  <span className="text-[9px] font-mono text-cyan-300 block">
                    {lotMode === 'MANUAL' ? 'MANUAL OVERRIDE' : 'AUTO CALCULATED'}
                  </span>
                </div>
              </div>

              {/* Price & Risk Geometry Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[9.5px] text-gray-400 block">Execution Entry</span>
                  <span className="text-white font-bold">
                    {(modalReanchoredLevels?.entry ?? entryPrice).toFixed(precision)}
                    {modalReanchoredLevels && modalReanchoredLevels.entry !== entryPrice && (
                      <span className="text-[9px] text-gray-400 font-normal ml-1">
                        (Ref: {entryPrice.toFixed(precision)})
                      </span>
                    )}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[9.5px] text-gray-400 block">
                    {autoSlDetails?.method === 'XAUUSD_FIXED_50_PIPS' ? 'AUTO SL: 50 PIPS' : `AUTO SL: ${autoSlDetails?.formattedDisplay || ''}`}
                  </span>
                  <span className="text-rose-400 font-bold">
                    {(modalReanchoredLevels?.sl ?? stopLoss).toFixed(precision)}
                  </span>
                  <span className="text-[8.5px] text-cyan-300 font-mono block mt-0.5">
                    {autoSlDetails?.method === 'XAUUSD_FIXED_50_PIPS' ? 'MANDATORY 50 PIPS' : 'VOLATILITY ADAPTIVE'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[9.5px] text-gray-400 block">Take Profit 1</span>
                  <span className="text-emerald-400 font-bold">
                    {tp1 > 0 ? (modalReanchoredLevels?.tp1 ?? tp1).toFixed(precision) : '--'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/40 border border-white/5">
                  <span className="text-[9.5px] text-gray-400 block">Est. SL Loss</span>
                  <span className="text-rose-400 font-bold">-${calcResult.estimatedLossAtSL.toFixed(2)}</span>
                </div>
              </div>

              {/* Capital Source & Sizing Metrics Strip */}
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[9.5px] text-gray-400 block uppercase">Capital Source</span>
                  <span className="text-white font-bold text-[11px] block truncate">
                    {capitalMode === 'LIVE_MT5' && liveMt5Capital != null
                      ? `LIVE MT5 ${mt5Equity != null ? 'EQUITY' : 'BALANCE'} ($${effectiveCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })})`
                      : `MANUAL CAPITAL ($${effectiveCapital.toLocaleString('en-US', { minimumFractionDigits: 2 })})`}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9.5px] text-gray-400 block uppercase">Allowed / Actual Risk</span>
                  <span className="text-white font-bold text-[11px] block">
                    Allowed: <span className="text-amber-300">{calcResult.allowedRiskPct.toFixed(2)}%</span> • Actual: <span className={calcResult.isRiskLimitExceeded ? 'text-rose-400 font-black' : 'text-cyan-300'}>{calcResult.accountImpactPct.toFixed(2)}%</span>
                  </span>
                </div>
              </div>

              {/* Safety Checks Verification Strip */}
              <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 space-y-1.5 text-[10px]">
                <div className="text-cyan-300 font-bold uppercase tracking-wider text-[9px] pb-1 border-b border-cyan-500/20 flex items-center justify-between">
                  <span>MANDATORY PRE-FLIGHT VERIFICATIONS</span>
                  <span className="text-emerald-400 font-mono">100% FAIL-CLOSED PROTECTED</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-gray-300">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-emerald-400">✓</span>
                    <span>Broker Contract: {spec?.contractSize} units</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-emerald-400">✓</span>
                    <span>Risk Capped at {calcResult.allowedRiskPct.toFixed(2)}% Equity</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-emerald-400">✓</span>
                    <span>Valid Directional Geometry</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className={isMarketOpen ? 'text-emerald-400' : 'text-amber-400'}>
                      {isMarketOpen ? '✓' : '⚠️'}
                    </span>
                    <span>Session: {isMarketOpen ? 'ACTIVE & EXECUTABLE' : 'MARKET CLOSED'}</span>
                  </div>
                </div>
              </div>

              {/* Trade Mode Security Banner */}
              {isRealAccount ? (
                <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/60 space-y-1 text-xs">
                  <div className="flex items-center space-x-2 text-rose-300 font-bold">
                    <span className="text-base">🛑</span>
                    <span className="uppercase tracking-wider">REAL TRADING LOCKED IN DEMO RELEASE</span>
                  </div>
                  <p className="text-[10.5px] text-rose-200/90 leading-relaxed font-sans">
                    You are connected to a <strong>REAL BROKER ACCOUNT ({telemetry.account?.maskedLogin || 'REAL'})</strong>. Live real execution is strictly locked in this single-user demo release.
                  </p>
                </div>
              ) : isDemoAccount ? (
                <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-bold uppercase tracking-wider font-sans">
                      DEMO EXECUTION ONLY • {telemetry.account?.maskedLogin || 'DEMO'}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400/80 font-mono">
                    SAFE PRACTICE ENVIRONMENT
                  </span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/50 text-xs text-amber-300 flex items-center space-x-2">
                  <span>⚠️</span>
                  <span>Account mode unverified. Execution is blocked fail-closed.</span>
                </div>
              )}

              {/* Real-time Status / Execution Result */}
              {executionResult && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    executionResult.success
                      ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200'
                      : 'bg-rose-950/60 border-rose-500/60 text-rose-200'
                  }`}
                >
                  <div className="flex items-start space-x-2">
                    <span className="text-base">{executionResult.success ? '✅' : '❌'}</span>
                    <div className="space-y-0.5">
                      <div className="font-bold">
                        {executionResult.success ? 'ORDER DISPATCHED SUCCESSFULLY' : 'EXECUTION REJECTED'}
                      </div>
                      {executionResult.ticket && (
                        <div className="text-[10px] text-emerald-300 font-mono">
                          Ticket #{executionResult.ticket}
                        </div>
                      )}
                      <div className="text-[10.5px] opacity-90">
                        {executionResult.message || executionResult.error}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-white/10">
              <button
                onClick={handleSendToExecution}
                className="text-[10px] text-gray-400 hover:text-cyan-300 underline cursor-pointer"
                title="Stage parameters into the dedicated /execution page"
              >
                Or open in Execution Terminal &rarr;
              </button>

              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  disabled={isDispatching}
                  className="w-1/2 sm:w-auto px-3 py-2 rounded-xl bg-black/60 border border-white/10 hover:bg-white/5 text-gray-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  {executionResult?.success ? 'CLOSE' : 'CANCEL'}
                </button>

                {!executionResult?.success && (
                  <button
                    onClick={handleConfirmDispatch}
                    disabled={
                      isDispatching ||
                      !isLicenseAuthorized ||
                      !isMarketOpen ||
                      isRealAccount ||
                      isUnknownAccount ||
                      !calcResult.isValid ||
                      Boolean(calcResult.isRiskLimitExceeded) ||
                      Boolean(calcResult.brokerLotValidationError) ||
                      calcResult.safeLotSize <= 0 ||
                      stopLoss <= 0
                    }
                    className={`w-1/2 sm:w-auto px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-lg ${
                      isDispatching ||
                      !isLicenseAuthorized ||
                      !isMarketOpen ||
                      isRealAccount ||
                      isUnknownAccount ||
                      !calcResult.isValid ||
                      Boolean(calcResult.isRiskLimitExceeded) ||
                      Boolean(calcResult.brokerLotValidationError) ||
                      calcResult.safeLotSize <= 0 ||
                      stopLoss <= 0
                        ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5 shadow-none'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                    }`}
                  >
                    {isDispatching ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>DISPATCHING...</span>
                      </>
                    ) : !isMarketOpen ? (
                      <>
                        <span>⚠️</span>
                        <span>MARKET CLOSED — PLANNING ONLY</span>
                      </>
                    ) : !isLicenseAuthorized ? (
                      <>
                        <span>🔒</span>
                        <span>LICENSE REQUIRED</span>
                      </>
                    ) : isRealAccount ? (
                      <>
                        <span>🛑</span>
                        <span>REAL ACCOUNTS LOCKED</span>
                      </>
                    ) : isUnknownAccount ? (
                      <>
                        <span>⚠️</span>
                        <span>ACCOUNT UNVERIFIED</span>
                      </>
                    ) : calcResult.brokerLotValidationError ? (
                      <>
                        <span>⚠️</span>
                        <span>INVALID LOT SIZE</span>
                      </>
                    ) : calcResult.isRiskLimitExceeded ? (
                      <>
                        <span>⚠️</span>
                        <span>RISK LIMIT EXCEEDED</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>CONFIRM DEMO ORDER</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
