'use client';

import React from 'react';
import { HISTORICAL_CHANGES } from '@/lib/agents/what-changed-engine';

export const EvolutionaryTracker: React.FC = () => {
  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <div>
            <div className="text-[8.5px] text-gray-400 uppercase tracking-widest font-bold">
              EVOLUTIONARY ANALYSIS TRACKER
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
              &quot;WHAT CHANGED?&quot; INTELLIGENCE ENGINE
            </h3>
          </div>
        </div>
        <span className="text-[8.5px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded font-bold">
          Explainable AI Deltas
        </span>
      </div>

      {/* Delta History Feed */}
      {HISTORICAL_CHANGES.length === 0 ? (
        <div className="bg-black/30 p-4 rounded-xl border border-white/5 space-y-2 text-center text-gray-400">
          <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
            DATA LIMITED / NO VERIFIED CHANGE HISTORY
          </div>
          <p className="text-[8.5px] text-gray-400 max-w-sm mx-auto leading-relaxed">
            Continuous surveillance active. No historical state transitions or consensus flips recorded in current session. Awaiting verified structural transitions.
          </p>
          <div className="text-[7.5px] font-mono text-gray-500 pt-1">
            Status: STABLE SURVEILLANCE • DELTA RECORDING ACTIVE
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {HISTORICAL_CHANGES.map((chg) => (
            <div key={chg.id} className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-2 text-[9.5px]">
              <div className="flex flex-wrap items-center justify-between gap-1 text-gray-300">
                <div className="flex items-center space-x-1.5">
                  <span className="text-gray-400 font-bold">{chg.timePrevious} &rarr; {chg.timeCurrent}</span>
                  <span>&bull;</span>
                  <span className="bg-white/10 text-gray-300 px-1 py-0.2 rounded border border-white/10 text-[8px]">
                    {chg.previousVerdict} ({chg.previousConsensus}%)
                  </span>
                  <span>&rarr;</span>
                  <span className="bg-emerald-950/50 text-emerald-300 px-1 py-0.2 rounded border border-emerald-500/30 text-[8px] font-bold">
                    {chg.currentVerdict} ({chg.currentConsensus}%)
                  </span>
                </div>
                <span className="text-cyan-400 font-bold">
                  Consensus &Delta;: {chg.currentConsensus - chg.previousConsensus > 0 ? '+' : ''}{chg.currentConsensus - chg.previousConsensus}%
                </span>
              </div>

              {chg.marketCatalysts && chg.marketCatalysts.length > 0 && (
                <div className="space-y-0.5 text-gray-400 text-[8.5px] pl-2 border-l-2 border-cyan-500/40">
                  <div className="text-gray-300 font-bold text-[8px] uppercase">MARKET CATALYSTS DETECTED:</div>
                  {chg.marketCatalysts.map((cat, idx) => (
                    <div key={idx}>&bull; {cat}</div>
                  ))}
                </div>
              )}

              {chg.agentShifts && chg.agentShifts.length > 0 && (
                <div className="flex flex-wrap gap-1 text-[7.5px]">
                  {chg.agentShifts.map((s, idx) => (
                    <span key={idx} className="px-1.5 py-0.5 rounded bg-black/40 border border-cyan-500/30 text-cyan-300">
                      {s.agent}: {s.from} &rarr; {s.to}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
