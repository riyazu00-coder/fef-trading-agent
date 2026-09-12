'use client';

import React from 'react';

export const AgentConsensusBarChart: React.FC = () => {
  const bars = [
    { label: 'Tech', pct: 84, color: 'from-emerald-400 to-cyan-500' },
    { label: 'Macro', pct: 76, color: 'from-emerald-400 to-cyan-500' },
    { label: 'Corr', pct: 81, color: 'from-emerald-400 to-cyan-500' },
    { label: 'News', pct: 68, color: 'from-amber-400 to-yellow-500' },
    { label: 'Geo', pct: 74, color: 'from-emerald-400 to-cyan-500' },
    { label: 'Sent', pct: 65, color: 'from-amber-400 to-yellow-500' },
    { label: 'Instit', pct: 79, color: 'from-emerald-400 to-cyan-500' },
    { label: 'Vision', pct: 82, color: 'from-emerald-400 to-cyan-500' },
    { label: 'Opp', pct: 88, color: 'from-emerald-400 to-teal-400' },
    { label: 'Risk', pct: 86, color: 'from-amber-400 to-orange-500' },
    { label: 'Final', pct: 81, color: 'from-emerald-400 to-cyan-500' }
  ];

  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3 flex flex-col justify-between">
      <div className="flex items-center space-x-2 border-b border-white/10 pb-2">
        <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
          AGENT CONSENSUS MATRIX
        </h3>
      </div>

      {/* Vertical Bars Container */}
      <div className="flex items-end justify-between gap-1.5 h-28 pt-2 px-1">
        {bars.map((b) => (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            {/* Bar */}
            <div className="w-full max-w-[18px] bg-black/40 rounded-t-lg overflow-hidden flex flex-col justify-end h-full">
              <div
                style={{ height: `${b.pct}%` }}
                className={`w-full rounded-t-md bg-gradient-to-t ${b.color} shadow-[0_0_12px_rgba(0,240,255,0.4)] transition-all duration-500`}
              />
            </div>
            {/* Percentage */}
            <span className="text-[7.5px] font-bold text-gray-300">
              {b.pct}%
            </span>
            {/* Label */}
            <span className="text-[7px] text-gray-400 uppercase truncate max-w-[24px]">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
