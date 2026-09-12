'use client';

import React, { useState, useEffect } from 'react';
import { AssetIntelligenceProfile } from '@/lib/agents/multi-asset-pipeline';

interface OrchestratorCoreProps {
  profile: AssetIntelligenceProfile;
  activeSymbol: string;
  isSynthesizing?: boolean;
  onPulseCore?: () => void;
}

const CORE_STATES = [
  'INGESTING DATA',
  'CROSS-CHECKING',
  'AGENTS COMMUNICATING',
  'RISK VALIDATION',
  'SYNTHESIZING',
  'FINALIZING DECISION'
];

export const OrchestratorCore: React.FC<OrchestratorCoreProps> = ({
  profile,
  activeSymbol,
  isSynthesizing = false,
}) => {
  const [coreStateIndex, setCoreStateIndex] = useState<number>(0);
  const [pulseGlow, setPulseGlow] = useState<boolean>(false);

  // Rotate compact state every 2.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCoreStateIndex((prev) => (prev + 1) % CORE_STATES.length);
      setPulseGlow(true);
      setTimeout(() => setPulseGlow(false), 800);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  const currentState = CORE_STATES[coreStateIndex];

  const bullishCount = profile.agents.filter((a) => a.bias === 'BULLISH').length;
  const cautionCount = profile.agents.filter((a) => a.bias === 'CAUTION' || a.bias === 'RESTRICTED').length;
  const neutralCount = profile.agents.filter((a) => a.bias === 'NEUTRAL' || a.bias === 'BEARISH').length;

  const isBuy = profile.setupDirection.includes('BUY');
  const isSell = profile.setupDirection.includes('SELL');

  return (
    <div className="relative z-10 flex flex-col items-center justify-center text-center px-2 flex-shrink-0">
      {/* Central Holographic Multi-Ring Nucleus */}
      <div className="relative flex items-center justify-center w-36 h-36">
        {/* Outer Counter-Clockwise Rotating Ring */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none animate-spin"
          style={{ animationDuration: '28s', animationDirection: 'reverse' }}
          viewBox="0 0 144 144"
        >
          <circle
            cx="72"
            cy="72"
            r="68"
            stroke="#00f0ff"
            strokeWidth="1.2"
            strokeDasharray="8 14 2 14"
            fill="none"
            opacity="0.5"
          />
        </svg>

        {/* Inner Clockwise Rotating Ring */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none animate-spin"
          style={{ animationDuration: '18s' }}
          viewBox="0 0 144 144"
        >
          <circle
            cx="72"
            cy="72"
            r="56"
            stroke="#a855f7"
            strokeWidth="1.5"
            strokeDasharray="16 24 4 12"
            fill="none"
            opacity="0.6"
          />
        </svg>

        {/* Dynamic Glowing Pulsing Aura */}
        <div
          className={`absolute w-32 h-32 rounded-full transition-all duration-700 pointer-events-none ${
            pulseGlow || isSynthesizing
              ? 'bg-gradient-to-r from-cyan-500/25 via-purple-500/25 to-blue-500/25 blur-xl scale-110'
              : 'bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-blue-500/10 blur-md scale-95'
          }`}
        />

        {/* Central Core Chamber */}
        <div
          className={`relative w-28 h-28 rounded-full bg-gradient-to-br from-[#0c1a36] via-[#071124] to-[#030611] border-2 transition-all duration-500 flex flex-col items-center justify-center shadow-[0_0_30px_rgba(0,240,255,0.45),inset_0_0_15px_rgba(0,240,255,0.3)] ${
            pulseGlow
              ? 'border-cyan-300 shadow-[0_0_40px_rgba(0,240,255,0.7),inset_0_0_20px_rgba(168,85,247,0.5)]'
              : 'border-cyan-400/80'
          }`}
        >
          {/* Subtle neural grid background - reduced intensity for crisp readability */}
          <div
            className="absolute inset-0 rounded-full opacity-[0.09] pointer-events-none transition-opacity duration-500"
            style={{
              backgroundImage: 'radial-gradient(rgba(0,240,255,0.7) 1px, transparent 1px)',
              backgroundSize: '8px 8px'
            }}
          />

          <span className="text-base font-black text-white tracking-widest drop-shadow-[0_0_10px_rgba(0,240,255,0.9)] font-sans">
            FEF
          </span>

          <span className="text-[7.5px] font-mono text-cyan-300 font-black tracking-wider uppercase">
            AI ORCHESTRATOR
          </span>

          {/* Mini Soundwave / Neural Waveform */}
          <div className="flex items-center space-x-0.5 my-1 h-3 pointer-events-none">
            <span className="w-0.5 bg-cyan-400 rounded-full animate-pulse h-2" style={{ animationDelay: '0ms' }} />
            <span className="w-0.5 bg-blue-400 rounded-full animate-pulse h-3" style={{ animationDelay: '150ms' }} />
            <span className="w-0.5 bg-purple-400 rounded-full animate-pulse h-1.5" style={{ animationDelay: '300ms' }} />
            <span className="w-0.5 bg-cyan-300 rounded-full animate-pulse h-2.5" style={{ animationDelay: '450ms' }} />
            <span className="w-0.5 bg-emerald-400 rounded-full animate-pulse h-2" style={{ animationDelay: '600ms' }} />
          </div>

          {/* Dynamic Rotating Sub-State */}
          <div className="text-[6.5px] font-mono font-bold tracking-tight text-cyan-200 uppercase px-1 py-0.2 bg-cyan-950/60 rounded border border-cyan-400/30">
            {currentState}
          </div>
        </div>
      </div>

      {/* Synthesis Status Bar */}
      <div className="w-full max-w-[200px] mt-1.5 space-y-1">
        <div className="flex items-center justify-between text-[7.5px] font-mono text-gray-300">
          <span className="text-cyan-300 font-bold">15 / 15 AGENTS</span>
          <span className="text-gray-400">SYNCHRONIZED</span>
        </div>

        {/* Sleek Confluence Progress Bar */}
        <div className="w-full h-1.5 bg-black/60 rounded-full border border-white/10 overflow-hidden relative">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(0,240,255,0.7)]"
            style={{ width: `${Math.max(20, profile.confidence)}%` }}
          />
        </div>

        <div className="text-[7px] text-gray-400 font-mono tracking-tighter uppercase">
          SYNTHESIZING CONFLUENCE ({profile.confidence}%)
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

        <div className="flex items-center justify-center space-x-1 mt-0.5 text-[7.5px] font-mono">
          <span className="px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 font-bold">
            {bullishCount} Bullish
          </span>
          <span className="px-1.5 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40 font-bold">
            {cautionCount} Caution
          </span>
          <span className="px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 font-bold">
            {neutralCount} Neutral
          </span>
        </div>
      </div>
    </div>
  );
};
