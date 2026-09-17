'use client';

import React from 'react';
import { TradingRiskAssessment } from '@/lib/agents/hub-animation-engine';

interface HubRiskWarningStripProps {
  assessment: TradingRiskAssessment;
  confluenceScore?: number;
  onOpenRiskModal: () => void;
}

export const HubRiskWarningStrip: React.FC<HubRiskWarningStripProps> = ({
  assessment,
  confluenceScore = 81,
  onOpenRiskModal,
}) => {
  const isCritical = assessment.level === 'CRITICAL';
  const isHigh = assessment.level === 'HIGH';
  const isMod = assessment.level === 'MODERATE';

  // Strict institutional color discipline
  const levelBadge = isCritical
    ? 'bg-rose-950/70 border-rose-500/60 text-rose-300 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
    : isHigh
    ? 'bg-orange-950/60 border-orange-500/50 text-orange-300'
    : isMod
    ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
    : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300';

  const actionBadge = isCritical
    ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
    : isHigh
    ? 'bg-orange-950/40 border-orange-500/30 text-orange-200'
    : isMod
    ? 'bg-amber-950/40 border-amber-500/30 text-amber-200'
    : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300';

  return (
    <div className="p-2 rounded-xl bg-black/40 border border-white/10 font-mono text-[9px] space-y-1.5 overflow-hidden transition-all hover:border-white/20 w-full min-w-0">
      {/* 1. Header: Title + Severity Badge + Risk Guardian Action State */}
      <div className="flex items-center justify-between gap-1 border-b border-white/5 pb-1 min-w-0">
        <div className="flex items-center space-x-1.5 min-w-0 truncate">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
            style={{ backgroundColor: assessment.color }}
          />
          <span className="text-[8px] font-bold text-gray-400 uppercase font-sans tracking-wider truncate">
            TRADING RISK WARNING
          </span>
        </div>

        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className={`text-[7px] font-bold px-1.5 py-0.2 rounded border uppercase font-mono ${levelBadge}`}>
            {assessment.level} RISK
          </span>
          {assessment.riskGuardianAction && assessment.riskGuardianAction !== 'NORMAL' && (
            <span className={`text-[7px] font-bold px-1.5 py-0.2 rounded border uppercase font-mono ${actionBadge}`}>
              {assessment.riskGuardianAction}
            </span>
          )}
        </div>
      </div>

      {/* 2. Event Line: Proximity Event Name + Countdown */}
      <div className="flex items-center justify-between text-[8px] text-gray-300 min-w-0">
        <div className="truncate pr-1 min-w-0">
          <span className="text-gray-400 font-bold">Event: </span>
          <span className="text-white font-medium truncate" title={assessment.impactEvent.name}>
            {assessment.impactEvent.name}
          </span>
        </div>
        <span className="text-cyan-300 font-mono font-bold flex-shrink-0 bg-cyan-950/40 px-1 py-0.2 rounded border border-cyan-500/20">
          {assessment.impactEvent.countdown}
        </span>
      </div>

      {/* 3. Compact Inline Metrics Grid: VOL | SPREAD | CONSENSUS | GUARDIAN */}
      <div className="grid grid-cols-4 gap-1 text-[7.5px] text-center font-mono pt-0.5">
        <div className="bg-black/40 rounded px-1 py-0.5 border border-white/5 truncate">
          <span className="text-gray-500 block text-[6.5px] uppercase">VOL</span>
          <strong
            className={`truncate block ${
              assessment.volatility === 'HIGH' || assessment.volatility === 'ELEVATED'
                ? 'text-orange-300'
                : 'text-cyan-300'
            }`}
          >
            {assessment.volatility}
          </strong>
        </div>

        <div className="bg-black/40 rounded px-1 py-0.5 border border-white/5 truncate">
          <span className="text-gray-500 block text-[6.5px] uppercase">SPREAD</span>
          <strong
            className={`truncate block ${
              assessment.spreadStatus === 'WIDE'
                ? 'text-amber-300'
                : assessment.spreadStatus === 'ELEVATED'
                ? 'text-amber-200'
                : 'text-white'
            }`}
          >
            {assessment.spreadStatus}
          </strong>
        </div>

        <div className="bg-black/40 rounded px-1 py-0.5 border border-white/5 truncate">
          <span className="text-gray-500 block text-[6.5px] uppercase">CONSENSUS</span>
          <strong className={`truncate block ${confluenceScore === 0 ? 'text-amber-300 text-[6.5px]' : 'text-emerald-300'}`}>
            {confluenceScore === 0 ? 'INSUFFICIENT' : `${confluenceScore}%`}
          </strong>
        </div>

        <div
          onClick={onOpenRiskModal}
          className="bg-black/40 hover:bg-black/60 rounded px-1 py-0.5 border border-white/5 hover:border-amber-400/40 cursor-pointer transition-colors truncate"
          title="Click to inspect Risk Guardian parameters"
        >
          <span className="text-gray-500 block text-[6.5px] uppercase">GUARDIAN</span>
          <strong
            className={`truncate block ${
              assessment.riskGuardianState === 'RESTRICTED'
                ? 'text-rose-400'
                : assessment.riskGuardianState === 'CAUTION'
                ? 'text-amber-300'
                : 'text-emerald-400'
            }`}
          >
            {assessment.riskGuardianState}
          </strong>
        </div>
      </div>
    </div>
  );
};
