'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const AgentConsensusBarChart: React.FC = () => {
  const { assetProfile } = useActiveAsset();
  const agents = assetProfile?.agents || [];

  const labelMap: Record<string, string> = {
    TECHNICAL: 'Tech',
    MACRO: 'Macro',
    CORRELATION: 'Corr',
    NEWS: 'News',
    GEOPOLITICAL: 'Geo',
    SENTIMENT: 'Sent',
    INSTITUTIONAL: 'Instit',
    VISION: 'Vision',
    OPPORTUNITY: 'Opp',
    STRATEGY: 'Strat',
    ORDER_FLOW: 'Flow',
    KILLZONE: 'Zone',
    LIQUIDITY_MAP: 'Liq',
    RISK_GUARDIAN: 'Risk',
    FINAL_DECISION: 'Final',
  };

  const bars = agents.map((a) => {
    const isDataLimited = a.status === 'DATA LIMITED' || a.status === 'OFFLINE' || a.status === 'ERROR';
    const pct = isDataLimited ? 0 : Math.round(a.confidence);

    let color = 'from-gray-600 to-gray-700';
    if (!isDataLimited) {
      if (a.bias === 'BULLISH') {
        color = 'from-emerald-400 to-cyan-500';
      } else if (a.bias === 'BEARISH') {
        color = 'from-rose-500 to-pink-500';
      } else if (a.bias === 'CAUTION' || a.bias === 'RESTRICTED') {
        color = 'from-amber-400 to-orange-500';
      } else {
        color = 'from-cyan-500 to-blue-500';
      }
    }

    return {
      type: a.type,
      label: labelMap[a.type] || a.name.slice(0, 4),
      pct,
      isDataLimited,
      color,
      status: a.status,
      bias: a.bias,
    };
  });

  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            AGENT CONSENSUS MATRIX
          </h3>
        </div>
        <span className="text-[7.5px] font-mono text-cyan-400/90 font-bold">
          LIVE AGENT TELEMETRY
        </span>
      </div>

      {/* Vertical Bars Container */}
      <div className="flex items-end justify-between gap-1 h-28 pt-2 px-0.5 overflow-x-auto">
        {bars.map((b) => (
          <div key={b.type} className="flex-1 min-w-[16px] flex flex-col items-center gap-1 h-full justify-end" title={`${b.label}: ${b.status} (${b.bias}) - ${b.pct}%`}>
            {/* Bar */}
            <div className="w-full max-w-[16px] bg-black/40 rounded-t-lg overflow-hidden flex flex-col justify-end h-full">
              <div
                style={{ height: `${Math.max(b.pct > 0 ? b.pct : 4, 4)}%` }}
                className={`w-full rounded-t-md bg-gradient-to-t ${b.color} ${b.pct > 0 ? 'shadow-[0_0_8px_rgba(0,240,255,0.3)]' : 'opacity-40'} transition-all duration-500`}
              />
            </div>
            {/* Percentage */}
            <span className={`text-[7px] font-bold ${b.isDataLimited ? 'text-gray-500' : 'text-gray-300'}`}>
              {b.isDataLimited ? '0%' : `${b.pct}%`}
            </span>
            {/* Label */}
            <span className="text-[6.5px] text-gray-400 uppercase truncate max-w-[22px]">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
