'use client';

import React, { useState } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const CurrentAiDecision: React.FC = () => {
  const { activeSymbol, assetProfile } = useActiveAsset();
  const [status, setStatus] = useState<'IDLE' | 'APPROVED' | 'REJECTED'>('IDLE');

  const isBuy = assetProfile.setupDirection.includes('BUY');
  const isSell = assetProfile.setupDirection.includes('SELL');

  const isMarketClosed = !assetProfile.tradeExecutable || assetProfile.sessionState?.tradeExecutable === false;
  const actionability: string | undefined = assetProfile.actionabilityState;
  const isActionable = actionability === 'ACTIONABLE' && !isMarketClosed;

  // Determine button presentation state based on canonical actionability
  let buttonLabel = status === 'APPROVED' ? 'APPROVED & READY' : 'Approve & Execute';
  let buttonIcon = '✓';
  let buttonStyle = 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] cursor-pointer border-emerald-400/30';
  let buttonTitle: string | undefined = undefined;
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
              className={`text-sm sm:text-base font-bold font-sans tracking-wide ${
                !assetProfile.tradeExecutable ? 'text-amber-300' : isBuy ? 'text-[#34D399]' : isSell ? 'text-[#FB7185]' : 'text-[#FBBF24]'
              }`}
            >
              {assetProfile.setupDirection}
            </div>
            <div className="text-[9.5px] font-sans text-[#94A3B8] flex flex-wrap items-center gap-1.5">
              <span>
                Confidence:{' '}
                {assetProfile.confidence === 0 ? (
                  <strong className="text-amber-300 font-mono font-bold">INSUFFICIENT EVIDENCE</strong>
                ) : (
                  <strong className="text-[#F8FAFC] font-mono font-bold">{assetProfile.confidence}%</strong>
                )}
              </span>
              {assetProfile.evidenceTrust !== undefined && (
                <>
                  <span className="text-gray-600">&bull;</span>
                  <span>Trust: <strong className="text-cyan-300 font-mono font-bold">{assetProfile.evidenceTrust}%</strong></span>
                </>
              )}
              {assetProfile.verifiedAgentCount !== undefined && (
                <span className="text-[8.5px] font-mono px-1 py-0.2 rounded bg-white/5 text-gray-300 border border-white/10">
                  Verified: {assetProfile.verifiedAgentCount}/15
                </span>
              )}
              {!assetProfile.tradeExecutable && (
                <span className="text-rose-400 font-mono font-bold text-[8.5px] border border-rose-500/30 px-1 rounded bg-rose-950/40">
                  REFERENCE ONLY
                </span>
              )}
              {assetProfile.tradeExecutable && assetProfile.actionabilityState === 'ANALYSIS ONLY' && (
                <span className="text-cyan-400 font-mono font-bold text-[8.5px] border border-cyan-500/40 px-1 rounded bg-cyan-950/40">
                  ANALYSIS ONLY
                </span>
              )}
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
              <span suppressHydrationWarning className="text-gray-400 font-normal ml-1">({assetProfile.sessionState.nextOpenCountdown})</span>
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
