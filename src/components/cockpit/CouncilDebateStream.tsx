'use client';

import React, { useState, useEffect } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const CouncilDebateStream: React.FC = () => {
  const { activeSymbol, assetProfile } = useActiveAsset();
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'BULLISH':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
      case 'BEARISH':
        return 'bg-rose-950/60 text-rose-300 border-rose-500/40';
      case 'RESTRICTED':
      case 'CAUTION':
        return 'bg-amber-950/60 text-amber-300 border-amber-500/40';
      default:
        return 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40';
    }
  };

  return (
    <div id="council-debate-card" className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-2.5 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            LIVE INTER-AGENT COUNCIL DEBATE ({activeSymbol})
          </h3>
        </div>
        <span className="text-[8px] text-gray-400">
          Continuous Blackboard Sync
        </span>
      </div>

      <div className="space-y-1.5 text-[9.5px]">
        {assetProfile.debateMessages.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 border border-white/5">
            <div className="flex items-center space-x-1.5 truncate">
              <span suppressHydrationWarning className="text-gray-400 text-[8.5px]">{mounted ? item.time : '--:--:--'}</span>
              <span className="text-cyan-300 font-bold text-[9px]">{item.agent}:</span>
              <span className="text-gray-300 text-[9px] truncate max-w-[130px] sm:max-w-[170px]">{item.text}</span>
            </div>
            <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border flex-shrink-0 ${getStatusColor(item.status)}`}>
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
