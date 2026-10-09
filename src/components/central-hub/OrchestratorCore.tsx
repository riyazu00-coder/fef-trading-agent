'use client';

import React, { useState, useEffect } from 'react';
import { AssetIntelligenceProfile } from '@/lib/agents/multi-asset-pipeline';

interface OrchestratorCoreProps {
  profile: AssetIntelligenceProfile;
  activeSymbol: string;
  isSynthesizing?: boolean;
  isIngesting?: boolean;
  contributingCount?: number;
  dataLimitedCount?: number;
  offlineCount?: number;
  errorCount?: number;
  unavailableCount?: number;
  totalVisibleCount?: number;
  onPulseCore?: () => void;
}

export const OrchestratorCore: React.FC<OrchestratorCoreProps> = ({
  profile,
  activeSymbol,
  isSynthesizing = false,
  isIngesting = false,
  contributingCount = 21,
  dataLimitedCount: propDataLimitedCount = 0,
  offlineCount = 0,
  errorCount = 0,
  unavailableCount = 0,
  totalVisibleCount = 21,
}) => {
  const pulseGlow = isIngesting || isSynthesizing;
  const currentState = isIngesting
    ? 'INGESTING EVIDENCE'
    : isSynthesizing
    ? 'SYNTHESIZING'
    : profile.confidence === 0
    ? 'STANDBY'
    : 'SYNCHRONIZED';

  const bullishCount = profile.agents.filter((a) => a.bias === 'BULLISH' && a.status !== 'DATA LIMITED').length;
  const bearishCount = profile.agents.filter((a) => a.bias === 'BEARISH' && a.status !== 'DATA LIMITED').length;
  const cautionCount = profile.agents.filter((a) => (a.bias === 'CAUTION' || a.bias === 'RESTRICTED') && a.status !== 'DATA LIMITED').length;
  const profileDataLimited = profile.agents.filter((a) => a.status === 'DATA LIMITED').length;
  const neutralCount = profile.agents.filter((a) => a.bias === 'NEUTRAL' && a.status !== 'DATA LIMITED').length;

  const dataLimitedCount = propDataLimitedCount > 0 ? propDataLimitedCount : profileDataLimited;

  const isBuy = profile.setupDirection.includes('BUY');
  const isSell = profile.setupDirection.includes('SELL');

  return (
    <div className="relative z-10 flex flex-col items-center justify-center text-center px-1 flex-shrink-0">
      {/* Central Holographic Multi-Ring Nucleus */}
      <div className="relative flex items-center justify-center w-36 h-36 sm:w-40 sm:h-40">
        {/* Outer Counter-Clockwise Rotating Ring */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none animate-spin"
          style={{ animationDuration: '28s', animationDirection: 'reverse' }}
          viewBox="0 0 160 160"
        >
          <circle
            cx="80"
            cy="80"
            r="74"
            stroke="#00f0ff"
            strokeWidth="1.2"
            strokeDasharray="4 8"
            fill="none"
            opacity="0.6"
          />
        </svg>

        {/* Inner Clockwise Rotating Ring (Intensifies on genuine ingestion) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none animate-spin"
          style={{ animationDuration: isIngesting ? '6s' : '18s' }}
          viewBox="0 0 160 160"
        >
          <circle
            cx="80"
            cy="80"
            r="62"
            stroke={isIngesting ? '#38bdf8' : '#a855f7'}
            strokeWidth={isIngesting ? 2.0 : 1.2}
            strokeDasharray="12 20 4 10"
            fill="none"
            opacity={isIngesting ? 0.95 : 0.6}
          />

          {/* Genuine Evidence Inward Absorption Ripple */}
          {isIngesting && (
            <>
              <circle cx="80" cy="80" r="70" stroke="#00f0ff" strokeWidth="1.6" fill="none" opacity="0.8">
                <animate attributeName="r" from="72" to="40" dur="0.6s" repeatCount="1" />
                <animate attributeName="opacity" from="0.8" to="0" dur="0.6s" repeatCount="1" />
              </circle>
              <circle cx="80" cy="80" r="58" stroke="#a855f7" strokeWidth="1.4" fill="none" opacity="0.7">
                <animate attributeName="r" from="60" to="34" begin="0.1s" dur="0.5s" repeatCount="1" />
                <animate attributeName="opacity" from="0.7" to="0" begin="0.1s" dur="0.5s" repeatCount="1" />
              </circle>
            </>
          )}
        </svg>

        {/* Dynamic Glowing Pulsing Aura */}
        <div
          className={`absolute w-32 h-32 sm:w-36 sm:h-36 rounded-full transition-all duration-700 pointer-events-none ${
            pulseGlow || isSynthesizing
              ? 'bg-gradient-to-r from-cyan-500/35 via-purple-500/35 to-blue-500/35 blur-2xl scale-105'
              : 'bg-gradient-to-r from-cyan-500/15 via-purple-500/15 to-blue-500/15 blur-xl scale-95'
          }`}
        />

        {/* Central Core Chamber */}
        <div
          className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-[#0c1a36] via-[#071124] to-[#030611] border-2 transition-all duration-500 flex flex-col items-center justify-center shadow-[0_0_30px_rgba(0,240,255,0.5),inset_0_0_15px_rgba(0,240,255,0.3)] ${
            pulseGlow
              ? 'border-cyan-300 shadow-[0_0_45px_rgba(0,240,255,0.8),inset_0_0_20px_rgba(168,85,247,0.55)]'
              : 'border-cyan-400/85'
          }`}
        >
          {/* Subtle neural grid background */}
          <div
            className="absolute inset-0 rounded-full opacity-[0.09] pointer-events-none transition-opacity duration-500"
            style={{
              backgroundImage: 'radial-gradient(rgba(0,240,255,0.7) 1px, transparent 1px)',
              backgroundSize: '8px 8px'
            }}
          />

          <span className="text-base sm:text-lg font-black text-white tracking-widest drop-shadow-[0_0_10px_rgba(0,240,255,0.9)] font-sans">
            FEF
          </span>

          <span className="text-[7.5px] sm:text-[8px] font-mono text-cyan-300 font-bold tracking-widest uppercase mt-0.5">
            CORTEX CORE
          </span>

          {/* Dynamic Sub-State Badge */}
          <div className={`text-[6.5px] sm:text-[7px] font-mono font-bold tracking-tight uppercase px-2 py-0.5 rounded border mt-1.5 transition-all ${
            isIngesting
              ? 'text-cyan-100 bg-cyan-900/90 border-cyan-300 shadow-[0_0_8px_rgba(0,240,255,0.6)] scale-105'
              : 'text-cyan-200 bg-cyan-950/70 border-cyan-400/40 shadow-sm'
          }`}>
            {currentState}
          </div>
        </div>
      </div>

      {/* Synthesis Status Bar */}
      <div className="w-full max-w-[220px] mt-2 space-y-1">
        <div className="flex items-center justify-between text-[7.5px] font-mono text-gray-300">
          <span className="text-cyan-300 font-bold">{contributingCount} CONTRIBUTING / {totalVisibleCount} VISIBLE</span>
          <span className="text-gray-400">{contributingCount === totalVisibleCount ? 'SYNCHRONIZED' : 'ACTIVE CONTRIBUTING'}</span>
        </div>

        {/* Sleek Confluence Progress Bar */}
        <div className="w-full h-1.5 bg-black/60 rounded-full border border-white/10 overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,240,255,0.7)]"
            style={{ width: `${Math.max(20, profile.confidence)}%` }}
          />
        </div>

        {/* Compact State Breakdown */}
        <div className="text-[6.8px] text-gray-400 font-mono tracking-tighter uppercase flex items-center justify-center space-x-1 flex-wrap">
          <span className="text-emerald-400 font-bold">{contributingCount} CONTRIBUTING</span>
          {dataLimitedCount > 0 && <span>&bull; <span className="text-slate-400">{dataLimitedCount} DATA LIMITED</span></span>}
          {offlineCount > 0 && <span>&bull; <span className="text-amber-400">{offlineCount} OFFLINE</span></span>}
          {errorCount > 0 && <span>&bull; <span className="text-rose-400">{errorCount} ERROR</span></span>}
          {unavailableCount > 0 && <span>&bull; <span className="text-slate-400">{unavailableCount} UNAVAILABLE</span></span>}
        </div>
      </div>

      {/* Synthesized Direction Verdict & Counters */}
      <div className="mt-1 text-center">
        <div className="text-[8.5px] font-bold text-gray-300 font-sans">
          SYNTHESIZED DIRECTION:{' '}
          <span
            className={`font-black font-mono tracking-wider ${
              isBuy ? 'text-emerald-400' : isSell ? 'text-rose-400' : 'text-amber-400'
            }`}
          >
            {profile.setupDirection}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1 mt-0.5 text-[7.5px] font-mono">
          <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 font-bold">
            {bullishCount} Bullish
          </span>
          <span className="px-1.5 py-0.2 rounded bg-rose-950/60 text-rose-300 border border-rose-500/40 font-bold">
            {bearishCount} Bearish
          </span>
          <span className="px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 font-bold">
            {cautionCount} Caution
          </span>
          <span className="px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 font-bold">
            {neutralCount} Neutral
          </span>
          {dataLimitedCount > 0 && (
            <span className="px-1.5 py-0.2 rounded bg-slate-900/60 text-slate-400 border border-slate-700/40 font-bold">
              {dataLimitedCount} Data Ltd
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
