'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { useMemberAuth } from '@/context/MemberAuthContext';
import { projectDecisionV2ForUi, DecisionV2UiProjection } from '@/lib/decision/decision-ui-projection';
import { projectSetupV3ForUi, SetupIntelligenceV3UiProjection } from '@/lib/setup/setup-ui-projection';

export const CurrentAiDecision: React.FC = () => {
  const { activeSymbol, assetProfile } = useActiveAsset();
  const { telemetry, isMt5Connected } = useMT5Telemetry();
  const { isAuthenticated, isMaster } = useMemberAuth();
  const [status, setStatus] = useState<'IDLE' | 'APPROVED' | 'REJECTED'>('IDLE');
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Canonical Decision Engine V2 UI Projection
  const decisionV2: DecisionV2UiProjection =
    assetProfile.decisionV2Projection ||
    projectDecisionV2ForUi(assetProfile.decisionIntelligenceV2, activeSymbol);

  // Canonical Setup Intelligence V3 UI Projection
  const setupV3: SetupIntelligenceV3UiProjection =
    assetProfile.setupIntelligenceV3Projection ||
    projectSetupV3ForUi(assetProfile.setupIntelligenceV3, activeSymbol);

  const isUnavailable = activeSymbol === 'GER40' || decisionV2.maturity === 'UNAVAILABLE';
  const hasHardVeto = Boolean(decisionV2.hardVetoes && decisionV2.hardVetoes.length > 0);
  const isMarketClosed =
    decisionV2.marketAvailability === 'CLOSED' ||
    !assetProfile.tradeExecutable ||
    assetProfile.sessionState?.tradeExecutable === false;

  const isBuy = decisionV2.bias === 'BULLISH' || assetProfile.setupDirection.includes('BUY');
  const isSell = decisionV2.bias === 'BEARISH' || assetProfile.setupDirection.includes('SELL');

  const actionability: string | undefined = isUnavailable
    ? 'UNAVAILABLE'
    : assetProfile.actionabilityState;
  const isActionable =
    !isUnavailable &&
    !hasHardVeto &&
    actionability === 'ACTIONABLE' &&
    !isMarketClosed &&
    decisionV2.maturity === 'VALIDATED_SETUP' &&
    decisionV2.tradeExecutable;

  const isIntelligenceReady =
    decisionV2.evidenceCompleteness >= 60 ||
    (assetProfile.confluence?.evidenceTrust ?? assetProfile.evidenceTrust ?? 0) >= 60;
  const isExecutionReady = isMt5Connected && telemetry.operatingMode !== 'READ_ONLY';
  const executionBadgeLabel = isUnavailable
    ? 'FEED: UNAVAILABLE'
    : hasHardVeto
    ? 'VETO: RESTRICTED'
    : isMarketClosed
    ? 'SESSION: LOCKED'
    : isActionable
    ? isExecutionReady
      ? 'EXECUTION: DEMO ARMED'
      : 'INTELLIGENCE READY (PAPER GATE)'
    : `INTELLIGENCE: ${actionability || 'AWAITING SETUP'}`;

  // Determine button presentation state based on canonical actionability (maintains SETUP REVIEWED (READ-ONLY) compatibility)
  let buttonLabel = status === 'APPROVED' ? 'SETUP REVIEWED (ARMED DISPATCH)' : 'Review Trade Setup';
  let buttonIcon = '✓';
  let buttonStyle = 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)] cursor-pointer border-emerald-400/30';
  let buttonTitle: string | undefined = 'Trade setup review: Armed with confirmation for direct MT5 execution.';
  let supportingText: string | null = null;

  if (isUnavailable) {
    buttonLabel = 'UNAVAILABLE (FEED MISSING)';
    buttonIcon = '🔒';
    buttonStyle = 'bg-rose-950/40 text-rose-400/70 border-rose-500/20 cursor-not-allowed opacity-85';
    buttonTitle = 'Instrument telemetry unavailable: Broker instrument feed not detected';
    supportingText = 'Broker telemetry unavailable in MT5 bridge';
  } else if (!isAuthenticated && !isMaster && isActionable) {
    buttonLabel = 'MEMBER ACCESS REQUIRED';
    buttonIcon = '🔒';
    buttonStyle = 'bg-cyan-950/70 text-cyan-300 border-cyan-500/40 hover:border-cyan-400 cursor-pointer shadow-[0_0_12px_rgba(34,211,238,0.2)]';
    buttonTitle = 'Member authentication required to review trade setups and dispatch orders.';
    supportingText = 'Sign in to access Member trade execution controls';
  } else if (isMarketClosed) {
    buttonLabel = 'MARKET CLOSED';
    buttonIcon = '🔒';
    buttonStyle = 'bg-gray-900/80 text-gray-500 border-white/10 cursor-not-allowed opacity-80';
    buttonTitle = 'Execution locked: market session is closed';
    supportingText = 'Market closed • Revalidates at next open';
  } else if (hasHardVeto) {
    buttonLabel = 'EXECUTION VETOED';
    buttonIcon = '⛔';
    buttonStyle = 'bg-rose-950/40 text-rose-400/70 border-rose-500/20 cursor-not-allowed opacity-85';
    buttonTitle = `Execution vetoed: ${decisionV2.hardVetoes[0].reason}`;
    supportingText = `Hard Veto: ${decisionV2.hardVetoes[0].source} • ${decisionV2.hardVetoes[0].reason}`;
  } else if (actionability === 'ANALYSIS ONLY') {
    buttonLabel = 'ANALYSIS ONLY';
    buttonIcon = '🔒';
    buttonStyle = 'bg-cyan-950/40 text-cyan-400/70 border-cyan-500/20 cursor-not-allowed opacity-85';
    buttonTitle = `Analysis only: Evidence Completeness is ${decisionV2.evidenceCompleteness}% (minimum 60% required)`;
    supportingText = `Evidence Completeness ${decisionV2.evidenceCompleteness}% • 60% required`;
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
    buttonLabel = 'ARMED • AWAITING SETUP';
    buttonIcon = '⚡';
    buttonStyle = 'bg-amber-950/40 text-amber-300 border-amber-500/30 cursor-not-allowed opacity-90';
    buttonTitle = 'Execution armed: awaiting actionable setup';
    supportingText = 'Armed with confirmation • Awaiting verified setup';
  }

  return (
    <div className="ghost-glass-panel rounded-2xl p-2.5 sm:p-3 font-mono space-y-2 h-full flex flex-col justify-between overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
        <div className="flex items-center space-x-1.5">
          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-[11px] sm:text-xs font-bold text-[#F8FAFC] tracking-wider font-sans uppercase">
            CURRENT AI DECISION ({activeSymbol})
          </h3>
        </div>
        <div className="flex items-center space-x-1.5">
          <Link
            href="/how-to-use#ai-decision"
            className="text-[8.5px] font-mono font-bold text-gray-400 hover:text-cyan-300 px-1 py-0.5 rounded border border-white/10 hover:border-cyan-400/40 bg-black/40 transition-colors"
            title="Learn how Current AI Decision is derived"
          >
            ?
          </Link>
          <span className="text-[7.5px] bg-cyan-950/60 text-[#22D3EE] border border-cyan-500/40 px-1 py-0.2 rounded font-bold uppercase font-mono">
            REAL-TIME SYNCH
          </span>
        </div>
      </div>

      {/* Main Verdict & Sparkline */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
              isUnavailable
                ? 'bg-rose-950/40 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                : !assetProfile.tradeExecutable || hasHardVeto
                ? 'bg-amber-950/40 border-amber-500/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]'
                : isBuy
                ? 'bg-emerald-500/20 border-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                : isSell
                ? 'bg-rose-500/20 border-[#FB7185] shadow-[0_0_15px_rgba(251,113,133,0.5)]'
                : 'bg-amber-500/20 border-[#FBBF24] shadow-[0_0_15px_rgba(251,191,36,0.5)]'
            }`}
          >
            <svg
              className={`w-5 h-5 ${
                isUnavailable
                  ? 'text-rose-400'
                  : !assetProfile.tradeExecutable || hasHardVeto
                  ? 'text-amber-300'
                  : isBuy
                  ? 'text-[#34D399]'
                  : isSell
                  ? 'text-[#FB7185]'
                  : 'text-[#FBBF24]'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d={
                  isUnavailable
                    ? 'M6 18L18 6M6 6l12 12'
                    : !assetProfile.tradeExecutable || hasHardVeto
                    ? 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
                    : isBuy
                    ? 'M5 13l4 4L19 7'
                    : isSell
                    ? 'M19 14l-7 7m0 0l-7-7m7 7V3'
                    : 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
                }
              />
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono font-black border uppercase tracking-wider ${
                  decisionV2.maturity === 'VALIDATED_SETUP'
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50'
                    : decisionV2.maturity === 'SETUP_FORMING'
                    ? 'bg-cyan-950/70 text-cyan-300 border-cyan-500/50'
                    : decisionV2.maturity === 'WATCH'
                    ? 'bg-indigo-950/70 text-indigo-300 border-indigo-500/50'
                    : decisionV2.maturity === 'UNAVAILABLE'
                    ? 'bg-rose-950/70 text-rose-300 border-rose-500/50'
                    : decisionV2.maturity === 'INVALIDATED'
                    ? 'bg-rose-950/70 text-rose-300 border-rose-500/50'
                    : decisionV2.maturity === 'DATA_LIMITED'
                    ? 'bg-amber-950/70 text-amber-300 border-amber-500/50'
                    : 'bg-slate-900/70 text-slate-300 border-white/20'
                }`}
              >
                {decisionV2.maturity}
              </span>
              <span
                className={`text-xs sm:text-sm font-bold font-sans tracking-wide ${
                  decisionV2.bias === 'BULLISH'
                    ? 'text-[#34D399]'
                    : decisionV2.bias === 'BEARISH'
                    ? 'text-[#FB7185]'
                    : 'text-[#FBBF24]'
                }`}
              >
                BIAS: {decisionV2.bias}
              </span>
              <span className="text-[7.5px] font-mono px-1 py-0.2 rounded bg-black/50 text-gray-400 border border-white/10 uppercase">
                INTELLIGENCE ONLY
              </span>
            </div>
            <div className="text-[9px] font-sans text-[#94A3B8] flex flex-wrap items-center gap-1 mt-0.5">
              <span>
                Conf:{' '}
                <strong className="text-purple-300 font-mono font-bold">
                  {decisionV2.confidence}%
                </strong>
              </span>
              <span className="text-gray-600">&bull;</span>
              <span>
                Completeness:{' '}
                <strong className="text-cyan-300 font-mono font-bold">
                  {decisionV2.evidenceCompleteness}%
                </strong>
              </span>
              <span className="text-gray-600">&bull;</span>
              <span>
                Domains:{' '}
                <strong className="text-white font-mono font-bold">
                  {decisionV2.independentDomainCount}
                </strong>
              </span>
              <span className="text-gray-600">&bull;</span>
              <span
                className={`text-[8.5px] font-mono px-1 py-0.2 rounded border flex items-center space-x-1 ${
                  isExecutionReady && isActionable && !isMarketClosed
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                    : isActionable && !isMarketClosed
                    ? 'bg-cyan-950/40 text-cyan-300 border-cyan-500/30'
                    : 'bg-black/50 text-gray-400 border-white/10'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isExecutionReady && isActionable && !isMarketClosed
                      ? 'bg-emerald-400 animate-pulse'
                      : isActionable && !isMarketClosed
                      ? 'bg-cyan-400 animate-pulse'
                      : 'bg-slate-500'
                  }`}
                />
                <span>● {executionBadgeLabel}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Sparkline wave */}
        <div className="w-16 h-8">
          <svg className="w-full h-full" viewBox="0 0 60 25">
            <path
              d={
                isBuy
                  ? 'M 0 20 L 15 12 L 25 18 L 40 5 L 50 10 L 60 2'
                  : 'M 0 5 L 15 10 L 25 6 L 40 18 L 50 15 L 60 23'
              }
              fill="none"
              stroke={
                isUnavailable
                  ? '#F43F5E'
                  : !assetProfile.tradeExecutable
                  ? '#FBBF24'
                  : isBuy
                  ? '#22D3EE'
                  : '#FB7185'
              }
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Decision Engine V2 Explainability & Session Context */}
      <div className="bg-black/50 p-2 rounded-xl border border-white/10 space-y-1 text-[8.5px] font-mono">
        <div className="flex items-center justify-between border-b border-white/5 pb-1">
          <span className="text-cyan-400 font-bold uppercase tracking-wider text-[8px] flex items-center space-x-1">
            <span>🧠</span>
            <span>CORTEX DECISION RATIONALE</span>
          </span>
          <div className="flex items-center space-x-1 text-[7.5px]">
            <span className="text-gray-400">SESSION:</span>
            <span
              className={`px-1 py-0.2 rounded font-bold ${
                decisionV2.marketAvailability === 'OPEN'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : decisionV2.marketAvailability === 'CLOSED'
                  ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                  : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
              }`}
            >
              {decisionV2.marketAvailability}
            </span>
            <span className="text-gray-500">•</span>
            <span className="text-gray-300">{decisionV2.sessionModel.replace(/_/g, ' ')}</span>
            {decisionV2.is24x7 && (
              <span className="px-1 py-0.2 rounded bg-purple-950/60 text-purple-300 border border-purple-500/40 font-bold ml-0.5">
                24/7
              </span>
            )}
          </div>
        </div>

        {/* Vetoes alerts */}
        {decisionV2.hardVetoes.length > 0 && (
          <div className="p-1 rounded bg-rose-950/60 text-rose-300 border border-rose-500/40 text-[8px] flex items-center space-x-1">
            <span className="font-bold">⛔ HARD VETO:</span>
            <span className="truncate">
              {decisionV2.hardVetoes[0].source} — {decisionV2.hardVetoes[0].reason}
            </span>
          </div>
        )}
        {decisionV2.softVetoes.length > 0 && decisionV2.hardVetoes.length === 0 && (
          <div className="p-1 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 text-[8px] flex items-center space-x-1">
            <span className="font-bold">⚠️ SOFT VETO:</span>
            <span className="truncate">
              {decisionV2.softVetoes[0].source} — {decisionV2.softVetoes[0].reason}
            </span>
          </div>
        )}

        {/* Explainability bullets */}
        <div className="space-y-0.5 text-gray-300 text-[8px]">
          {isUnavailable ? (
            <div className="text-rose-400 font-bold">
              MARKET DATA UNAVAILABLE: Instrument telemetry is not provided by active broker connection.
            </div>
          ) : (
            <>
              {decisionV2.blockingConditions.length > 0 && (
                <div className="text-amber-300/90 truncate">
                  <span className="font-semibold text-amber-400">Why Wait: </span>
                  <span>{decisionV2.blockingConditions[0]}</span>
                </div>
              )}
              {decisionV2.requirementsToAdvance.length > 0 && (
                <div className="text-cyan-300/90 truncate">
                  <span className="font-semibold text-cyan-400">To Advance: </span>
                  <span>{decisionV2.requirementsToAdvance[0]}</span>
                </div>
              )}
              {decisionV2.supportingDomains.length > 0 && (
                <div className="text-gray-400 truncate">
                  <span className="text-gray-500">Supporting: </span>
                  <span>{decisionV2.supportingDomains.join(', ')}</span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-between text-[7px] text-gray-500 pt-0.5 border-t border-white/5 font-mono">
            <span className="truncate">Snapshot: {mounted ? decisionV2.snapshotId : '--'}</span>
            <span suppressHydrationWarning className="ml-1 shrink-0">{mounted ? `As of ${new Date(decisionV2.asOf).toLocaleTimeString()}` : ''}</span>
          </div>
        </div>
      </div>

      {/* Setup Intelligence V3 Lifecycle & Geometry */}
      <div className="bg-black/50 p-2 rounded-xl border border-white/10 space-y-1 text-[8.5px] font-mono">
        <div className="flex items-center justify-between border-b border-white/5 pb-1">
          <span className="text-cyan-400 font-bold uppercase tracking-wider text-[8px] flex items-center space-x-1">
            <span>🎯</span>
            <span>SETUP INTELLIGENCE V3</span>
          </span>
          <div className="flex items-center space-x-1 text-[7.5px]">
            <span
              className={`px-1 py-0.2 rounded font-bold ${
                setupV3.lifecycle === 'VALIDATED'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                  : setupV3.lifecycle === 'FORMING'
                  ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/40'
                  : setupV3.lifecycle === 'WATCH'
                  ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/40'
                  : setupV3.lifecycle === 'INVALIDATED' || setupV3.lifecycle === 'EXPIRED'
                  ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                  : 'bg-black/50 text-gray-400 border border-white/10'
              }`}
            >
              {setupV3.lifecycle}
            </span>
            {setupV3.direction !== 'NONE' && (
              <span
                className={`px-1 py-0.2 rounded font-bold ${
                  setupV3.direction === 'LONG'
                    ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/40'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                }`}
              >
                {setupV3.direction}
              </span>
            )}
            {setupV3.setupType !== 'UNCLASSIFIED' && (
              <span className="text-gray-300 text-[7px]">{setupV3.setupType}</span>
            )}
          </div>
        </div>

        {activeSymbol === 'GER40' ? (
          <div className="text-rose-400 font-bold text-[8px]">
            SETUP INTELLIGENCE UNAVAILABLE (Telemetry offline or broker instrument unmapped)
          </div>
        ) : setupV3.lifecycle === 'NO_SETUP' || setupV3.lifecycle === 'OBSERVING' ? (
          <div className="text-gray-400 text-[8px]">
            NO STRUCTURED SETUP: {setupV3.thesis}
          </div>
        ) : (
          <div className="space-y-1 text-[8px]">
            <div className="text-gray-300">
              <span className="font-semibold text-cyan-300">Thesis: </span>
              <span>{setupV3.thesis}</span>
            </div>

            {setupV3.entryZone && (
              <div className="grid grid-cols-2 gap-1 bg-black/40 p-1 rounded border border-white/5">
                <div>
                  <span className="text-gray-400">Entry Zone: </span>
                  <span className="text-white font-bold">${setupV3.entryZone.low} - ${setupV3.entryZone.high}</span>
                </div>
                <div>
                  <span className="text-gray-400">Midpoint: </span>
                  <span className="text-cyan-300 font-bold">${setupV3.entryZone.midpoint}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded border border-white/5">
              <div>
                <span className="text-gray-400">SL: </span>
                <span className="text-rose-400 font-bold">
                  {setupV3.stopLoss ? `$${setupV3.stopLoss.price}` : 'None'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Invalidation: </span>
                <span className="text-amber-400 font-bold">
                  {setupV3.invalidation ? `$${setupV3.invalidation.price}` : 'None'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">R:R: </span>
                <span className={`font-bold ${setupV3.riskReward?.meetsMinimumThreshold ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {setupV3.riskReward ? setupV3.riskReward.formatted : 'N/A'}
                </span>
              </div>
            </div>

            {setupV3.targets.length > 0 && (
              <div className="flex items-center space-x-2 text-[7.5px] bg-black/40 p-1 rounded border border-white/5">
                <span className="text-gray-400">Targets:</span>
                {setupV3.targets.map((tgt) => (
                  <span key={tgt.label} className="text-emerald-300 font-bold">
                    {tgt.label}: ${tgt.price} ({tgt.riskReward}R)
                  </span>
                ))}
              </div>
            )}

            {setupV3.confirmationRequirements.length > 0 && (
              <div className="space-y-0.5 pt-0.5 border-t border-white/5">
                <span className="text-gray-400 text-[7px] uppercase font-bold">Confirmations Checklist:</span>
                <div className="flex flex-wrap gap-1">
                  {setupV3.confirmationRequirements.map((req) => (
                    <span
                      key={req.id}
                      className={`px-1 py-0.2 rounded text-[7px] ${
                        req.status === 'SATISFIED'
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                          : req.status === 'FAILED'
                          ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {req.status === 'SATISFIED' ? '✓' : req.status === 'FAILED' ? '✗' : '○'} {req.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Setup Lifecycle History & Outcomes V1 */}
      <div className="bg-black/50 p-2 rounded-xl border border-white/10 space-y-1 text-[8.5px] font-mono">
        <div className="flex items-center justify-between border-b border-white/5 pb-1">
          <span className="text-cyan-400 font-bold uppercase tracking-wider text-[8px] flex items-center space-x-1">
            <span>📊</span>
            <span>SETUP LIFECYCLE HISTORY & OUTCOMES</span>
          </span>
          <div className="flex items-center space-x-1 text-[7.5px]">
            {isUnavailable || activeSymbol === 'GER40' ? (
              <span className="px-1 py-0.2 rounded font-bold bg-rose-950/60 text-rose-300 border border-rose-500/40">
                UNAVAILABLE
              </span>
            ) : (
              <span
                className={`px-1 py-0.2 rounded font-bold ${
                  setupV3.history && setupV3.history.statisticalReliability === 'HIGH'
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                    : setupV3.history && setupV3.history.statisticalReliability === 'MODERATE'
                    ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/40'
                    : 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                }`}
              >
                {setupV3.history?.statisticalReliability || 'INSUFFICIENT_SAMPLE (n < 10)'}
              </span>
            )}
          </div>
        </div>

        {isUnavailable || activeSymbol === 'GER40' ? (
          <div className="text-rose-400 font-bold text-[8px]">
            HISTORICAL INTELLIGENCE UNAVAILABLE (GER40 fail-closed • no simulated history)
          </div>
        ) : !setupV3.history || setupV3.history.sampleCount === 0 ? (
          <div className="text-gray-400 text-[8px] flex items-center justify-between">
            <span>OBSERVATION SAMPLE: 0</span>
            <span className="text-amber-400/80">Awaiting historical setup cycles</span>
          </div>
        ) : (
          <div className="space-y-1 text-[8px]">
            <div className="grid grid-cols-4 gap-1 bg-black/40 p-1 rounded border border-white/5">
              <div>
                <span className="text-gray-400 block text-[7px]">SAMPLE</span>
                <span className="text-white font-bold">{setupV3.history.sampleCount}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[7px]">TP1 REACH</span>
                <span className="text-emerald-300 font-bold">{setupV3.history.targetReachRate}%</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[7px]">INVALIDATED</span>
                <span className="text-rose-400 font-bold">{setupV3.history.invalidationRate}%</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[7px]">AVG MFE / MAE</span>
                <span className="text-cyan-300 font-bold">
                  {setupV3.history.averageMfeR != null ? `+${setupV3.history.averageMfeR}R` : 'N/A'} / {setupV3.history.averageMaeR != null ? `-${setupV3.history.averageMaeR}R` : 'N/A'}
                </span>
              </div>
            </div>

            {setupV3.history.recentSetups && setupV3.history.recentSetups.length > 0 && (
              <div className="space-y-0.5 pt-0.5 border-t border-white/5">
                <span className="text-gray-400 text-[7px] uppercase font-bold">Recent Setup Resolutions:</span>
                <div className="space-y-0.5">
                  {setupV3.history.recentSetups.slice(0, 3).map((s) => (
                    <div
                      key={s.setupId}
                      className="flex items-center justify-between text-[7px] bg-black/30 px-1 py-0.5 rounded border border-white/5"
                    >
                      <span className="text-gray-300 truncate font-mono max-w-[120px]">
                        {s.direction} {s.setupType}
                      </span>
                      <span className="text-gray-400 font-mono">
                        {s.initialRr != null ? `${s.initialRr}R` : 'N/A'}
                      </span>
                      <span
                        className={`font-bold px-1 rounded ${
                          s.outcomeResolution === 'TARGET_1_REACHED' ||
                          s.outcomeResolution === 'TARGET_2_REACHED' ||
                          s.outcomeResolution === 'TARGET_3_REACHED' ||
                          s.outcomeResolution === 'COMPLETED'
                            ? 'text-emerald-300 bg-emerald-950/40'
                            : s.outcomeResolution === 'STOP_LEVEL_REACHED' ||
                              s.outcomeResolution === 'STOP_REACHED' ||
                              s.outcomeResolution === 'STOPPED_OUT' ||
                              s.outcomeResolution === 'STRUCTURAL_INVALIDATION' ||
                              s.outcomeResolution === 'INVALIDATED' ||
                              s.outcomeResolution === 'INVALIDATED_PRE_TRIGGER'
                            ? 'text-rose-400 bg-rose-950/40'
                            : 'text-amber-300 bg-amber-950/40'
                        }`}
                      >
                        {s.outcomeResolution}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metric Parameter Table */}
      <div className="space-y-1 text-[9.5px] bg-black/40 p-2 rounded-xl border border-white/5 font-sans">
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Entry Zone</span>
          <span className="text-[#F8FAFC] font-mono font-bold">
            {setupV3.entryZone
              ? `$${setupV3.entryZone.low} - $${setupV3.entryZone.high}`
              : assetProfile.entryZone && Array.isArray(assetProfile.entryZone)
              ? `$${assetProfile.entryZone[0]} - $${assetProfile.entryZone[1]}`
              : 'Awaiting Structure'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Stop Loss</span>
          <span className="text-[#FB7185] font-mono font-bold">
            {setupV3.stopLoss != null
              ? `$${setupV3.stopLoss.price}`
              : assetProfile.stopLoss != null
              ? `$${assetProfile.stopLoss}`
              : 'Mandatory (Pending)'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Targets</span>
          <span className="text-[#34D399] font-mono font-bold">
            {setupV3.targets.length > 0
              ? setupV3.targets.map(t => `${t.label} $${t.price}`).join(' • ')
              : assetProfile.tp1 != null
              ? `TP1 $${assetProfile.tp1}${assetProfile.tp2 != null ? ` • TP2 $${assetProfile.tp2}` : ''}`
              : 'TP1: Mandatory'}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">R:R Potential</span>
          <span className="text-[#22D3EE] font-mono font-bold">
            {setupV3.riskReward ? setupV3.riskReward.formatted : assetProfile.rr}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Market State</span>
          <span
            className={`font-mono font-bold ${
              isUnavailable
                ? 'text-rose-400'
                : assetProfile.tradeExecutable
                ? 'text-emerald-300'
                : 'text-rose-300'
            }`}
          >
            {isUnavailable ? 'UNAVAILABLE' : assetProfile.sessionState?.statusLabel || 'OPEN'}
            {!isUnavailable && !assetProfile.tradeExecutable && assetProfile.sessionState?.nextOpenCountdown && (
              <span suppressHydrationWarning className="text-gray-400 font-normal ml-1">
                {mounted ? `(${assetProfile.sessionState.nextOpenCountdown})` : ''}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Trust Gate</span>
          <span
            className={`font-mono font-bold ${
              isUnavailable
                ? 'text-rose-400'
                : assetProfile.actionabilityState === 'ACTIONABLE'
                ? 'text-emerald-400'
                : assetProfile.actionabilityState === 'ANALYSIS ONLY'
                ? 'text-cyan-400'
                : 'text-amber-400'
            }`}
          >
            {isUnavailable
              ? 'UNAVAILABLE'
              : assetProfile.actionabilityState || (assetProfile.tradeExecutable ? 'AVAILABLE' : 'LOCKED')}
          </span>
        </div>
      </div>

      {/* Invalidation note */}
      <div className="text-[7.5px] text-gray-400 bg-black/30 px-2 py-1 rounded-lg border border-white/5">
        <span className="text-rose-400 font-bold">Invalidation: </span>
        <span className="truncate">{assetProfile.invalidation}</span>
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
          {!isAuthenticated && !isMaster && isActionable ? (
            <Link
              href="/member"
              className={`flex-1 py-1.5 rounded-xl font-black transition-all flex items-center justify-center space-x-1 border ${buttonStyle}`}
              title={buttonTitle}
            >
              <span>{buttonIcon}</span>
              <span>{buttonLabel}</span>
            </Link>
          ) : (
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
          )}
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
