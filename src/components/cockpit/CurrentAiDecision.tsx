'use client';

import React, { useState, useEffect } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const CurrentAiDecision: React.FC = () => {
  const { activeSymbol, assetProfile } = useActiveAsset();
  const [status, setStatus] = useState<'IDLE' | 'APPROVED' | 'REJECTED'>('IDLE');
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isBuy = assetProfile.setupDirection.includes('BUY');
  const isSell = assetProfile.setupDirection.includes('SELL');

  const isMarketClosed = !assetProfile.tradeExecutable || assetProfile.sessionState?.tradeExecutable === false;
  const actionability: string | undefined = assetProfile.actionabilityState;
  const isActionable = actionability === 'ACTIONABLE' && !isMarketClosed;

  // Determine button presentation state based on canonical actionability
  let buttonLabel = status === 'APPROVED' ? 'SETUP REVIEWED (READ-ONLY)' : 'Review Trade Setup';
  let buttonIcon = '✓';
  let buttonStyle = 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] cursor-pointer border-emerald-400/30';
  let buttonTitle: string | undefined = 'Trade setup review. Order transport is locked in READ_ONLY mode.';
  let supportingText: string | null = null;

  if (isMarketClosed) {
    buttonLabel = 'MARKET CLOSED';
    buttonIcon = '🔒';
    buttonStyle = 'bg-gray-900/80 text-gray-500 border-white/10 cursor-not-allowed opacity-80';
    buttonTitle = 'Execution locked: market session is closed';
    supportingText = 'Market closed • Revalidates at next open';
  } else if (actionability === 'ANALYSIS ONLY') {
    buttonLabel = 'ANALYSIS ONLY';
    buttonIcon = '🔒';
    buttonStyle = 'bg-cyan-950/40 text-cyan-400/70 border-cyan-500/20 cursor-not-allowed opacity-85';
    buttonTitle = `Analysis only: Evidence Trust is ${assetProfile.evidenceTrust ?? 0}% (minimum 60% required)`;
    supportingText = `Evidence Trust ${assetProfile.evidenceTrust ?? 0}% • 60% required`;
  } else if (actionability === 'RESTRICTED') {
    buttonLabel = 'RESTRICTED';
    buttonIcon = '🔒';
    buttonStyle = 'bg-rose-950/40 text-rose-400/70 border-rose-500/20 cursor-not-allowed opacity-85';
    buttonTitle = 'Risk Guardian restricted: portfolio or volatility exposure limit';
    supportingText = 'Risk Guardian locked • Exposure cap enforced';
  } else if (actionability === 'INVALIDATED') {
    buttonLabel = 'INVALIDATED';
    buttonIcon = '🔒';
    buttonStyle = 'bg-rose-950/40 text-rose-400/70 border-rose-500/20 cursor-not-allowed opacity-85';
    buttonTitle = 'Technical invalidation price breached';
    supportingText = 'Setup invalidated • Invalidation level reached';
  } else if (!isActionable) {
    buttonLabel = 'EXECUTION LOCKED';
    buttonIcon = '🔒';
    buttonStyle = 'bg-amber-950/40 text-amber-400/70 border-amber-500/20 cursor-not-allowed opacity-85';
    buttonTitle = 'Execution locked: awaiting actionable setup';
    supportingText = 'Awaiting verified actionable setup';
  }

  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            CURRENT AI DECISION ({activeSymbol})
          </h3>
        </div>
        <span className="text-[7.5px] bg-cyan-950/60 text-[#22D3EE] border border-cyan-500/40 px-1.5 py-0.2 rounded font-bold uppercase font-mono">
          REAL-TIME SYNCHRONIZATION
        </span>
      </div>

      {/* Main Verdict & Sparkline */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
              !assetProfile.tradeExecutable
                ? 'bg-amber-950/40 border-amber-500/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                : isBuy
                ? 'bg-emerald-500/20 border-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                : isSell
                ? 'bg-rose-500/20 border-[#FB7185] shadow-[0_0_15px_rgba(251,113,133,0.5)]'
                : 'bg-amber-500/20 border-[#FBBF24] shadow-[0_0_15px_rgba(251,191,36,0.5)]'
            }`}
          >
            <svg
              className={`w-5 h-5 ${!assetProfile.tradeExecutable ? 'text-amber-300' : isBuy ? 'text-[#34D399]' : isSell ? 'text-[#FB7185]' : 'text-[#FBBF24]'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d={!assetProfile.tradeExecutable ? 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' : isBuy ? 'M5 13l4 4L19 7' : isSell ? 'M19 14l-7 7m0 0l-7-7m7 7V3' : 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'}
              />
            </svg>
          </div>
          <div>
            <div
              className={`text-sm sm:text-base font-bold font-sans tracking-wide flex items-center space-x-2 ${
                !assetProfile.tradeExecutable ? 'text-amber-300' : isBuy ? 'text-[#34D399]' : isSell ? 'text-[#FB7185]' : 'text-[#FBBF24]'
              }`}
            >
              <span>{assetProfile.setupDirection}</span>
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-black/50 text-gray-400 border border-white/10 uppercase">
                INTELLIGENCE ONLY • NOT AN ORDER
              </span>
            </div>
            <div className="text-[9.5px] font-sans text-[#94A3B8] flex flex-wrap items-center gap-1.5 mt-0.5">
              <span>
                Trust:{' '}
                <strong className="text-cyan-300 font-mono font-bold">
                  {assetProfile.confluence?.evidenceTrust ?? assetProfile.evidenceTrust ?? 0}%
                </strong>
              </span>
              <span className="text-gray-600">&bull;</span>
              <span>
                Readiness:{' '}
                <strong className="text-purple-300 font-mono font-bold">
                  {assetProfile.confluence?.dataReadiness ?? 'PARTIAL'}
                </strong>
              </span>
              <span className="text-gray-600">&bull;</span>
              <span>
                Agreement:{' '}
                <strong className="text-white font-mono font-bold">
                  {assetProfile.confluence?.agreementScore ?? 0}%
                </strong>
              </span>
              <span className="text-gray-600">&bull;</span>
              <span className="text-[8.5px] font-mono px-1 py-0.2 rounded bg-purple-950/40 text-purple-300 border border-purple-500/30">
                EXEC: READ_ONLY
              </span>
            </div>
          </div>
        </div>

        {/* Sparkline wave */}
        <div className="w-16 h-8">
          <svg className="w-full h-full" viewBox="0 0 60 25">
            <path
              d={isBuy ? 'M 0 20 L 15 12 L 25 18 L 40 5 L 50 10 L 60 2' : 'M 0 5 L 15 10 L 25 6 L 40 18 L 50 15 L 60 23'}
              fill="none"
              stroke={!assetProfile.tradeExecutable ? '#FBBF24' : isBuy ? '#22D3EE' : '#FB7185'}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Metric Parameter Table */}
      <div className="space-y-1.5 text-[10px] bg-black/40 p-2.5 rounded-xl border border-white/5 font-sans">
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Entry Zone</span>
          <span className="text-[#F8FAFC] font-mono font-bold">
            {assetProfile.entryZone && Array.isArray(assetProfile.entryZone)
              ? `$${assetProfile.entryZone[0]} - $${assetProfile.entryZone[1]}`
              : 'Awaiting Structure'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Stop Loss</span>
          <span className="text-[#FB7185] font-mono font-bold">
            {assetProfile.stopLoss != null ? `$${assetProfile.stopLoss}` : 'Mandatory (Pending)'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Targets</span>
          <span className="text-[#34D399] font-mono font-bold">
            {assetProfile.tp1 != null ? `TP1 $${assetProfile.tp1}` : 'TP1: Mandatory (Pending)'}
            {assetProfile.tp2 != null ? ` • TP2 $${assetProfile.tp2}` : ''}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">R:R Potential</span>
          <span className="text-[#22D3EE] font-mono font-bold">{assetProfile.rr}</span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Market State</span>
          <span className={`font-mono font-bold ${assetProfile.tradeExecutable ? 'text-emerald-300' : 'text-rose-300'}`}>
            {assetProfile.sessionState?.statusLabel || 'OPEN'}
            {!assetProfile.tradeExecutable && assetProfile.sessionState?.nextOpenCountdown && (
              <span suppressHydrationWarning className="text-gray-400 font-normal ml-1">
                {mounted ? `(${assetProfile.sessionState.nextOpenCountdown})` : ''}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Risk Cap</span>
          <span className="text-[#F8FAFC] font-mono font-bold">0.50%</span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Trust Gate</span>
          <span className={`font-mono font-bold ${
            assetProfile.actionabilityState === 'ACTIONABLE' ? 'text-emerald-400' :
            assetProfile.actionabilityState === 'ANALYSIS ONLY' ? 'text-cyan-400' : 'text-amber-400'
          }`}>
            {assetProfile.actionabilityState || (assetProfile.tradeExecutable ? 'AVAILABLE' : 'LOCKED (PLANNING ONLY)')}
          </span>
        </div>
      </div>

      {/* Invalidation note */}
      <div className="text-[8px] text-gray-400 bg-black/30 p-1.5 rounded-lg border border-white/5">
        <span className="text-rose-400 font-bold">Invalidation: </span>
        <span>{assetProfile.invalidation}</span>
      </div>

      {/* Section 14: Multi-Timeframe Trigger & Lifecycle Matrix */}
      <div className="bg-black/50 p-2 rounded-xl border border-white/10 space-y-1.5 text-[9px] font-mono">
        <div className="flex items-center justify-between border-b border-white/5 pb-1">
          <span className="text-cyan-400 font-bold uppercase tracking-wider text-[8px] flex items-center space-x-1">
            <span>⚡</span>
            <span>M15/M30 OPPORTUNITY & TRIGGER MATRIX</span>
          </span>
          <span className={`px-1.5 py-0.2 rounded text-[7.5px] font-bold ${
            assetProfile.setupLifecycle?.state === 'TRIGGERED' || assetProfile.triggerEvidence?.isConfirmed
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
              : assetProfile.setupLifecycle?.state === 'ARMED'
              ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/40'
              : assetProfile.setupLifecycle?.state === 'INVALIDATED'
              ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
              : 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
          }`}>
            STATE: {assetProfile.setupLifecycle?.state || (assetProfile.blueprint ? 'ARMED' : 'FORMING')}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[8.5px]">
          <div>
            <span className="text-gray-400">HTF Context (H1): </span>
            <span className={`font-bold ${assetProfile.multiTimeframeContext?.h1?.trend === 'BULLISH' ? 'text-emerald-400' : assetProfile.multiTimeframeContext?.h1?.trend === 'BEARISH' ? 'text-rose-400' : 'text-gray-300'}`}>
              {assetProfile.multiTimeframeContext?.h1?.trend || 'NEUTRAL'} {assetProfile.multiTimeframeContext?.h1?.available ? `(${assetProfile.multiTimeframeContext.h1.candleCount}b)` : '(DATA LTD)'}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Setup (M30): </span>
            <span className={`font-bold ${assetProfile.multiTimeframeContext?.m30?.trend === 'BULLISH' ? 'text-emerald-400' : assetProfile.multiTimeframeContext?.m30?.trend === 'BEARISH' ? 'text-rose-400' : 'text-gray-300'}`}>
              {assetProfile.multiTimeframeContext?.m30?.trend || 'NEUTRAL'} {assetProfile.multiTimeframeContext?.m30?.swingsIdentified ? '• Swings OK' : '• Scanning'}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Trigger (M15): </span>
            <span className={`font-bold ${assetProfile.triggerEvidence?.isConfirmed ? 'text-emerald-300' : 'text-amber-300'}`}>
              {assetProfile.triggerEvidence?.isConfirmed ? `CONFIRMED (${assetProfile.triggerEvidence.triggerType})` : 'AWAITING CLOSE'}
            </span>
          </div>
          <div>
            <span className="text-gray-400">Precision (M5): </span>
            <span className="text-gray-300 font-bold">
              {assetProfile.multiTimeframeContext?.m5?.momentum || 'NEUTRAL'} {assetProfile.multiTimeframeContext?.m5?.available ? `(${assetProfile.multiTimeframeContext.m5.candleCount}b)` : ''}
            </span>
          </div>
        </div>

        <div className="pt-1 border-t border-white/5 space-y-0.5 text-[8px] text-gray-400">
          <div>
            <span className="text-cyan-400 font-semibold">Next Confirmation: </span>
            <span>{assetProfile.triggerEvidence?.isConfirmed ? `M15 close confirmed at ${assetProfile.triggerEvidence.confirmationClose}` : (assetProfile.multiTimeframeContext?.nextConfirmationRequirement || 'Awaiting qualifying closed candle')}</span>
          </div>
          {assetProfile.confluence?.criticalConflicts && assetProfile.confluence.criticalConflicts.length > 0 && (
            <div className="text-amber-400/90 truncate">
              <span className="font-semibold">Conflict: </span>
              <span>{assetProfile.confluence.criticalConflicts[0]}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-1.5 pt-1 text-[9.5px]">
        <div className="flex items-center gap-1.5">
          <button
            onClick={isActionable ? () => setStatus('APPROVED') : undefined}
            disabled={!isActionable}
            aria-disabled={!isActionable}
            className={`flex-1 py-1.5 rounded-xl font-black transition-all flex items-center justify-center space-x-1 border ${buttonStyle}`}
            title={buttonTitle}
          >
            <span>{buttonIcon}</span>
            <span>{buttonLabel}</span>
          </button>
          <button
            onClick={() => {
              const calcElem = document.getElementById('smart-position-calculator') || document.querySelector('[data-card="position-calculator"]');
              if (calcElem) {
                calcElem.scrollIntoView({ behavior: 'smooth' });
              } else {
                window.location.hash = '#smart-position-calculator';
              }
            }}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all cursor-pointer"
            title="Modify parameters in Smart Position Calculator"
          >
            Modify
          </button>
          <button
            onClick={() => setStatus('REJECTED')}
            className="px-2.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-950/60 text-rose-400 border border-rose-500/40 transition-all flex items-center space-x-1 cursor-pointer"
          >
            <span>✕</span>
            <span>{status === 'REJECTED' ? 'REJECTED' : 'Reject'}</span>
          </button>
        </div>

        {/* Compact supporting text for locked / analysis states */}
        {!isActionable && supportingText && (
          <div className="text-[8.5px] font-mono text-center flex items-center justify-center space-x-1 pt-0.5">
            <span className={actionability === 'ANALYSIS ONLY' ? 'text-cyan-400 font-semibold' : 'text-gray-400'}>
              {supportingText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
