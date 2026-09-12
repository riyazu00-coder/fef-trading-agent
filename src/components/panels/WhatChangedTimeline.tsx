'use client';

import React from 'react';
import { HISTORICAL_CHANGES } from '@/lib/agents/what-changed-engine';

interface WhatChangedTimelineProps {
  glassIntensity?: 'GHOST_GLASS' | 'ULTRA_CLEAR' | 'CRYSTAL' | 'TINTED';
}

export const WhatChangedTimeline: React.FC<WhatChangedTimelineProps> = ({
  glassIntensity = 'GHOST_GLASS'
}) => {
  const glassBg = glassIntensity === 'GHOST_GLASS'
    ? 'bg-black/15 backdrop-blur-[6px]'
    : glassIntensity === 'ULTRA_CLEAR'
    ? 'bg-black/25 backdrop-blur-md'
    : glassIntensity === 'TINTED'
    ? 'bg-black/60 backdrop-blur-xl'
    : 'bg-black/35 backdrop-blur-lg';

  return (
    <div className={`${glassBg} border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_1px_0_rgba(255,255,255,0.25)] rounded-2xl p-4 space-y-3 font-mono transition-all`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <span className="text-cyan-400 font-bold drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">🔍</span>
          <div>
            <span className="text-[9px] text-cyan-400 uppercase tracking-widest block font-bold drop-shadow">
              Evolutionary Analysis Tracker
            </span>
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
              &quot;WHAT CHANGED?&quot; INTELLIGENCE ENGINE
            </h3>
          </div>
        </div>
        <span className="text-[9px] bg-white/10 backdrop-blur-sm text-cyan-300 border border-white/15 px-2 py-0.5 rounded shadow-sm">
          EXPLAINABLE AI DELTAS
        </span>
      </div>

      {/* Delta History Feed (Pure Optical Glass Sub-Items) */}
      <div className="space-y-3 text-[10.5px]">
        {HISTORICAL_CHANGES.map((chg) => (
          <div
            key={chg.id}
            className="bg-black/20 backdrop-blur-md border border-white/15 rounded-xl p-3 space-y-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]"
          >
            {/* Transition Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1.5">
              <div className="flex items-center space-x-2">
                <span className="text-gray-200 text-[9.5px] drop-shadow">
                  {chg.timePrevious} ➔ <span className="text-white font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{chg.timeCurrent}</span>
                </span>
                <span className="text-gray-400">•</span>
                <div className="flex items-center space-x-1.5">
                  <span className="text-white bg-white/10 px-1.5 py-0.2 rounded border border-white/15 text-[9px] drop-shadow">
                    {chg.previousVerdict} ({chg.previousConsensus}%)
                  </span>
                  <span className="text-cyan-400 font-bold">➔</span>
                  <span className="text-emerald-300 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-400/50 font-bold text-[9px] shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                    {chg.currentVerdict} ({chg.currentConsensus}%)
                  </span>
                </div>
              </div>
              <span className="text-[8.5px] text-cyan-300 drop-shadow">
                Consensus Delta: +{chg.currentConsensus - chg.previousConsensus}%
              </span>
            </div>

            {/* Catalysts */}
            <div>
              <span className="text-gray-200 text-[9px] block uppercase font-bold mb-1 drop-shadow">
                Market Catalysts Detected:
              </span>
              <ul className="space-y-1 text-white">
                {chg.marketCatalysts.map((cat, idx) => (
                  <li key={idx} className="flex items-start space-x-1.5">
                    <span className="text-cyan-400 font-bold">›</span>
                    <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{cat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Agent Shifts Delta */}
            <div className="border-t border-white/10 pt-1.5 flex flex-wrap gap-2 text-[9px]">
              {chg.agentShifts.map((v, idx) => (
                <div
                  key={idx}
                  className="bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded border border-white/15 text-gray-100"
                >
                  <span className="text-gray-300">{v.agent}: </span>
                  <span className="text-gray-400">{v.from} ➔ </span>
                  <span className="text-cyan-300 font-bold drop-shadow">{v.to}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
