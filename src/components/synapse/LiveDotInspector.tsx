'use client';

import React, { useState, useEffect } from 'react';
import { BASE_SYNAPSE_NODES, INCOMING_DATA_POOL, SynapseNode } from '@/lib/agents/synapse-data-feed';

export const LiveDotInspector: React.FC = () => {
  const [stream, setStream] = useState<SynapseNode[]>(BASE_SYNAPSE_NODES.slice(0, 6));

  useEffect(() => {
    let poolIndex = 0;
    const interval = setInterval(() => {
      const template = INCOMING_DATA_POOL[poolIndex % INCOMING_DATA_POOL.length];
      poolIndex += 1;

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const newNode: SynapseNode = {
        ...template,
        id: `dot-${Date.now()}`,
        timestamp: timeStr,
        theta: 0,
        phi: 0,
        radius: 175,
        isNew: true
      };

      setStream((prev) => [newNode, ...prev.slice(0, 7)]);
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#09111c]/90 border border-white/[0.06] rounded-2xl p-4 shadow-xl backdrop-blur-sm space-y-3 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <div>
            <span className="text-[9px] text-cyan-400 uppercase tracking-widest block">
              Continuous Intelligence Ingestion
            </span>
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide">
              LIVE DATA DOT STREAM ("WHAT EACH DOT IS")
            </h3>
          </div>
        </div>
        <span className="text-[9px] bg-[#05070c] text-emerald-400 border border-emerald-900/60 px-2 py-0.5 rounded font-bold">
          STREAMING 12 FEEDS
        </span>
      </div>

      {/* Stream Items List */}
      <div className="space-y-2 text-[10.5px]">
        {stream.map((dot) => (
          <div
            key={dot.id}
            className="bg-[#05070c]/90 border border-white/[0.04] hover:border-cyan-500/40 rounded-xl p-2.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <div className="flex items-start sm:items-center space-x-2.5">
              {/* Glowing Dot Category Indicator */}
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f0ff] mt-1 sm:mt-0 flex-shrink-0 animate-pulse"></div>

              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.2 rounded font-bold">
                    {dot.category}
                  </span>
                  <span className="font-bold text-white text-[11px]">{dot.title}</span>
                  <span className="text-gray-500 text-[9px] hidden md:inline">({dot.source})</span>
                </div>
                <p className="text-[10px] text-gray-400 font-sans mt-0.5 leading-tight">
                  {dot.detail}
                </p>
              </div>
            </div>

            {/* Value & Agent */}
            <div className="flex items-center space-x-3 text-right text-[10px] flex-shrink-0 pl-5 sm:pl-0">
              <div>
                <div className="text-emerald-400 font-black text-xs font-mono">{dot.value}</div>
                <div className="text-gray-500 text-[8.5px]">{dot.timestamp}</div>
              </div>
              <div className="bg-[#09111c] px-2 py-1 rounded border border-white/[0.04] text-cyan-300 font-semibold text-[9px]">
                ➔ {dot.agent}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
