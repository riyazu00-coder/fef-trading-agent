'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import {
  RadarNotification,
  subscribeRadarNotifications
} from '@/lib/radar/radar-notifications';

export const TradeOpportunityPopup: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { setActiveSymbol } = useActiveAsset();

  const [queue, setQueue] = useState<RadarNotification[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(100);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Head of FIFO queue is the currently rendered popup
  const currentAlert: RadarNotification | null = queue[0] || null;

  // Play subtle futuristic audio chime for new critical alerts
  const playAlertChime = useCallback((isCritical: boolean) => {
    if (!soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isCritical ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(isCritical ? 880 : 587.33, now);
      osc.frequency.exponentialRampToValueAtTime(isCritical ? 1760 : 880, now + 0.18);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {
      // AudioContext might be blocked until user gesture, ignore silently
    }
  }, [soundEnabled]);

  // Subscribe to radar notifications with FIFO queue & boot noise filtering
  useEffect(() => {
    const unsubscribe = subscribeRadarNotifications((notif) => {
      // Ignore if already enqueued or seen in this session
      if (seenIdsRef.current.has(notif.id)) return;

      // Filter: Only pop up on actionable opportunities, invalidations, or risk restrictions
      if (notif.priority !== 'CRITICAL' && notif.priority !== 'HIGH') return;

      const isOpenMarket = notif.tradeExecutable === true && notif.marketState !== 'WEEKEND_CLOSED';

      // BOOT NOISE FILTER:
      // On boot, do NOT enqueue closed-market developing alerts as popups (they remain in Notification Center).
      if (notif.isBootAlert && !isOpenMarket) {
        seenIdsRef.current.add(notif.id);
        return;
      }

      seenIdsRef.current.add(notif.id);

      setQueue((prevQueue) => {
        // Prevent duplicate queue entries for the same ID
        if (prevQueue.some((item) => item.id === notif.id)) {
          return prevQueue;
        }

        // Priority weighting:
        // 1. ACTIONABLE open-market setup (weight 100)
        // 2. Newly ACTIONABLE or CRITICAL transition (weight 80)
        // 3. Open-market ANALYSIS ONLY setup (weight 60)
        // 4. Other valid alerts (weight 40)
        const getWeight = (item: RadarNotification) => {
          const isOpen = item.tradeExecutable === true && item.marketState !== 'WEEKEND_CLOSED';
          const isActionable = item.actionabilityState === 'ACTIONABLE';
          if (isOpen && isActionable) return 100;
          if (item.priority === 'CRITICAL') return 80;
          if (isOpen) return 60;
          return 40;
        };

        const newWeight = getWeight(notif);

        // If boot alert and queue already has a higher or equal weight alert, skip boot flood
        if (notif.isBootAlert && prevQueue.length > 0) {
          const highestExistingWeight = Math.max(...prevQueue.map(getWeight));
          if (newWeight <= highestExistingWeight) {
            return prevQueue;
          }
        }

        // Insert respecting priority order while maintaining FIFO within same priority
        const newQueue = [...prevQueue, notif];
        if (newQueue.length === 1) {
          playAlertChime(notif.priority === 'CRITICAL');
        }
        return newQueue;
      });
    });

    return () => unsubscribe();
  }, [playAlertChime]);

  // Dequeue current alert and advance to next in queue
  const handleAdvanceQueue = useCallback(() => {
    setQueue((prev) => prev.slice(1));
    setProgress(100);
  }, []);

  // Auto-dismiss countdown timer with pause on hover
  useEffect(() => {
    if (!currentAlert) return;

    setProgress(100);
    const totalDuration = 12000; // 12 seconds per popup
    const intervalMs = 100;
    const decrement = (intervalMs / totalDuration) * 100;

    if (!isPaused) {
      progressIntervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev <= decrement) {
            handleAdvanceQueue();
            return 100;
          }
          return prev - decrement;
        });
      }, intervalMs);
    }

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [currentAlert, isPaused, handleAdvanceQueue]);

  if (!currentAlert) return null;

  const isDevelopingClosed = currentAlert.eventType === 'SETUP_DEVELOPING' || currentAlert.tradeExecutable === false;
  const isBuy = !isDevelopingClosed && currentAlert.newState.includes('BUY');
  const isSell = !isDevelopingClosed && currentAlert.newState.includes('SELL');
  const isInvalidated = currentAlert.eventType === 'SETUP_INVALIDATED';
  const isRestricted = currentAlert.eventType === 'RISK_RESTRICTED';

  // Strict Evidence Trust & Actionability Gate
  const evidenceTrust = currentAlert.evidenceTrust ?? 50;
  const isActionable = currentAlert.actionabilityState === 'ACTIONABLE' && evidenceTrust >= 60;
  const isAnalysisOnly = !isActionable && !isDevelopingClosed && !isInvalidated && !isRestricted;
  const isDataLimited = currentAlert.isDataLimited === true;

  const handleViewAnalysis = () => {
    setActiveSymbol(currentAlert.symbol);
    if (currentAlert.entryZone && typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(
          'fef_calc_pending_setup',
          JSON.stringify({
            symbol: currentAlert.symbol,
            direction: currentAlert.newState.includes('SELL') ? 'SELL' : 'BUY',
            entryPrice: currentAlert.entryZone[0],
            stopLoss: currentAlert.stopLoss,
            tp1: currentAlert.tp1,
            tp2: currentAlert.tp2,
            tp3: currentAlert.tp3
          })
        );
      } catch {}
    }
    handleAdvanceQueue();

    if (pathname !== '/cockpit') {
      router.push('/cockpit');
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  };

  const handleDismiss = () => {
    handleAdvanceQueue();
  };

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-slide-up font-sans transition-all select-none"
      role="alert"
    >
      <div className="relative rounded-2xl ghost-glass-panel-elevated p-4 shadow-[0_16px_50px_rgba(0,0,0,0.7),0_0_30px_rgba(34,211,238,0.2)] border border-cyan-400/40 overflow-hidden bg-[#050b18]/95 backdrop-blur-xl">
        {/* Glow Header Accent Line */}
        <div
          className={`absolute top-0 left-0 right-0 h-1 transition-all ${
            isDevelopingClosed
              ? 'bg-amber-400'
              : isInvalidated
              ? 'bg-amber-500'
              : isRestricted
              ? 'bg-rose-500'
              : isActionable
              ? 'bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
              : 'bg-gradient-to-r from-amber-500 via-cyan-500 to-blue-500'
          }`}
        />

        {/* Top Meta Bar */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isDevelopingClosed
                  ? 'bg-amber-400 animate-pulse'
                  : isInvalidated
                  ? 'bg-amber-400 animate-pulse'
                  : isRestricted
                  ? 'bg-rose-400 animate-ping'
                  : isActionable
                  ? 'bg-emerald-400 animate-ping'
                  : 'bg-cyan-400 animate-pulse'
              }`}
            />
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-cyan-300">
              {isDevelopingClosed
                ? 'SETUP DEVELOPING (MARKET CLOSED)'
                : isInvalidated
                ? 'SWARM INVALIDATION NOTICE'
                : isRestricted
                ? 'RISK GUARDIAN RESTRICTION'
                : isActionable
                ? 'ACTIONABLE OPPORTUNITY CONFIRMED'
                : 'RADAR SETUP (ANALYSIS ONLY)'}
            </span>
            {currentAlert.category && (
              <span className="text-[9px] font-mono font-bold bg-white/10 text-gray-300 px-1.5 py-0.5 rounded">
                {currentAlert.category}
              </span>
            )}
            {/* Queue Counter badge if multiple items are queued */}
            {queue.length > 1 && (
              <span className="text-[9px] font-mono font-bold bg-cyan-950 border border-cyan-500/40 text-cyan-300 px-1.5 py-0.5 rounded animate-pulse">
                1 of {queue.length}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {/* Audio Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'Mute Alert Audio' : 'Unmute Alert Audio'}
              className="text-gray-400 hover:text-cyan-300 text-xs transition-colors p-1"
            >
              {soundEnabled ? '🔔' : '🔕'}
            </button>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss Alert"
              className="text-gray-400 hover:text-white text-sm transition-colors p-1 cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Main Opportunity Card Content */}
        <div className="mt-2.5 space-y-2">
          {/* Symbol & Direction Tag & Actionability Tag */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xl font-black font-mono text-white tracking-tight">
                {currentAlert.symbol}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase border ${
                  isDevelopingClosed
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : isInvalidated
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : isRestricted
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : isBuy
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                    : 'bg-rose-500/20 text-rose-300 border-rose-400/50 shadow-[0_0_10px_rgba(244,63,94,0.3)]'
                }`}
              >
                {isDevelopingClosed ? 'MONITOR NEXT OPEN' : currentAlert.newState}
              </span>
              {/* Canonical Actionability Gate Badge */}
              {isActionable ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-500/50">
                  ACTIONABLE
                </span>
              ) : isAnalysisOnly ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-500/50">
                  ANALYSIS ONLY
                </span>
              ) : null}
            </div>

            <div className="flex items-center space-x-2 font-mono text-xs">
              <span className="text-gray-400 text-[10px]">SCORE</span>
              <span className="text-white font-black text-sm bg-cyan-950/70 border border-cyan-500/30 px-2 py-0.5 rounded">
                {currentAlert.score}<span className="text-[10px] text-cyan-400 font-normal">/100</span>
              </span>
            </div>
          </div>

          {/* Evidence Trust & Actionability Safety Strip */}
          <div className="flex items-center justify-between p-1.5 rounded-lg bg-black/50 border border-white/10 font-mono text-[10px]">
            <div className="flex items-center space-x-1.5">
              <span className="text-gray-400">Evidence Trust:</span>
              <span className={`font-bold ${evidenceTrust >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {evidenceTrust}%
              </span>
              <span className="text-gray-500 text-[9px]">({evidenceTrust >= 60 ? '≥ 60% PASS' : '60% REQUIRED'})</span>
            </div>
            {isDataLimited ? (
              <span className="text-[9px] text-rose-400 font-bold uppercase bg-rose-950/40 px-1 py-0.5 rounded border border-rose-500/30">
                DATA LIMITED
              </span>
            ) : isActionable ? (
              <span className="text-[9px] text-emerald-400 font-bold uppercase bg-emerald-950/40 px-1 py-0.5 rounded border border-emerald-500/30">
                GATE CLEARED
              </span>
            ) : (
              <span className="text-[9px] text-amber-300 font-bold uppercase bg-amber-950/40 px-1 py-0.5 rounded border border-amber-500/30">
                EXECUTION LOCKED 🔒
              </span>
            )}
          </div>

          {/* Institutional Catalyst */}
          <p className="text-xs text-gray-200 line-clamp-2 leading-relaxed">
            {currentAlert.catalyst || currentAlert.message}
          </p>

          {/* Actionable Blueprint Grid */}
          {currentAlert.entryZone && (
            <div className="grid grid-cols-4 gap-1.5 p-2 rounded-xl bg-black/40 border border-white/10 font-mono text-[10.5px]">
              <div className="flex flex-col">
                <span className="text-[8.5px] text-gray-400 uppercase">ENTRY ZONE</span>
                <span className="font-bold text-white truncate">
                  {currentAlert.entryZone[0]} - {currentAlert.entryZone[1]}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[8.5px] text-rose-400 uppercase">STOP LOSS</span>
                <span className="font-bold text-rose-300 truncate">
                  {currentAlert.stopLoss || 'Calculated'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[8.5px] text-emerald-400 uppercase">TARGET 1</span>
                <span className="font-bold text-emerald-300 truncate">
                  {currentAlert.tp1 || 'Calculated'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[8.5px] text-cyan-400 uppercase">R : R RATIO</span>
                <span className="font-black text-cyan-300 truncate">
                  {currentAlert.rr || '1:2.8'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls & Safety Notice */}
        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5 text-[9.5px] text-gray-400 font-mono">
            <svg className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate">
              {isDevelopingClosed
                ? 'Market Closed — Next Open Alert'
                : isActionable
                ? 'Actionable Trade — Confirmation Required'
                : 'Analysis Only — Execution Gated (Trust < 60%)'}
            </span>
          </div>

          <div className="flex items-center space-x-2 font-mono">
            <button
              onClick={handleDismiss}
              className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs transition-colors cursor-pointer border border-white/10"
            >
              DISMISS
            </button>
            <button
              onClick={handleViewAnalysis}
              className={`px-3.5 py-1.5 rounded-lg text-white font-black text-xs transition-all cursor-pointer border flex items-center space-x-1 ${
                isActionable
                  ? 'bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-500 hover:from-emerald-400 hover:to-teal-500 shadow-[0_0_15px_rgba(52,211,153,0.5)] border-emerald-400/60'
                  : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500 hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(0,240,255,0.4)] border-cyan-300/50'
              }`}
            >
              <span>
                {isActionable
                  ? 'INSPECT ACTIONABLE →'
                  : isDevelopingClosed
                  ? 'PREVIEW SETUP'
                  : 'VIEW ANALYSIS'}
              </span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Dismiss Countdown Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
          <div
            className="h-full bg-cyan-400 transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
