'use client';

import React from 'react';

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

      {/* Timeline Entry 1 */}
      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-2 text-[9.5px]">
        <div className="flex flex-wrap items-center justify-between gap-1 text-gray-300">
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-400 font-bold">17:10:00 &rarr; 18:15:00</span>
            <span>&bull;</span>
            <span className="bg-amber-950/50 text-amber-300 px-1 py-0.2 rounded border border-amber-500/30 text-[8px]">
              WAIT (51%)
            </span>
            <span>&rarr;</span>
            <span className="bg-emerald-950/50 text-emerald-300 px-1 py-0.2 rounded border border-emerald-500/30 text-[8px] font-bold">
              WATCH BUY (74%)
            </span>
          </div>
          <span className="text-emerald-400 font-bold">Consensus &Delta;: +23%</span>
        </div>

        <div className="space-y-0.5 text-gray-400 text-[8.5px] pl-2 border-l-2 border-cyan-500/40">
          <div className="text-gray-300 font-bold text-[8px] uppercase">MARKET CATALYSTS DETECTED:</div>
          <div>&bull; XAUUSD swept sell-side liquidity at $2,341.20 and formed M15 CHOCH</div>
          <div>&bull; DXY rejected 104.40 resistance ceiling and fell -0.26%</div>
          <div>&bull; US 10-year yield dropped 6 bps from 4.27% to 4.214%</div>
          <div>&bull; Silver (XAGUSD) broke intraday high (+1.42%) confirming SMT divergence</div>
        </div>

        <div className="flex flex-wrap gap-1 text-[7.5px]">
          <span className="px-1.5 py-0.5 rounded bg-black/40 border border-cyan-500/30 text-cyan-300">
            Technical: NEUTRAL &rarr; BULLISH (+0.62)
          </span>
          <span className="px-1.5 py-0.5 rounded bg-black/40 border border-cyan-500/30 text-cyan-300">
            Correlation: NEUTRAL &rarr; BULLISH (+0.77)
          </span>
          <span className="px-1.5 py-0.5 rounded bg-black/40 border border-cyan-500/30 text-cyan-300">
            Macro: NEUTRAL &rarr; BULLISH (+0.61)
          </span>
          <span className="px-1.5 py-0.5 rounded bg-black/40 border border-amber-500/30 text-amber-300">
            Risk: STANDBY &rarr; RESTRICTED
          </span>
        </div>
      </div>

      {/* Timeline Entry 2 */}
      <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-2 text-[9.5px]">
        <div className="flex flex-wrap items-center justify-between gap-1 text-gray-300">
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-400 font-bold">15:30:00 &rarr; 17:10:00</span>
            <span>&bull;</span>
            <span className="bg-rose-950/50 text-rose-300 px-1 py-0.2 rounded border border-rose-500/30 text-[8px]">
              NO TRADE (38%)
            </span>
            <span>&rarr;</span>
            <span className="bg-amber-950/50 text-amber-300 px-1 py-0.2 rounded border border-amber-500/30 text-[8px]">
              WAIT (51%)
            </span>
          </div>
          <span className="text-cyan-400 font-bold">Consensus &Delta;: +13%</span>
        </div>

        <div className="space-y-0.5 text-gray-400 text-[8.5px] pl-2 border-l-2 border-blue-500/40">
          <div className="text-gray-300 font-bold text-[8px] uppercase">MARKET CATALYSTS DETECTED:</div>
          <div>&bull; Asian session compression held without direction</div>
          <div>&bull; London session open injected volatility and tested session lows</div>
        </div>

        <div className="flex flex-wrap gap-1 text-[7.5px]">
          <span className="px-1.5 py-0.5 rounded bg-black/40 border border-cyan-500/30 text-cyan-300">
            Technical: BEARISH (-0.35) &rarr; NEUTRAL (0.00)
          </span>
        </div>
      </div>
    </div>
  );
};
