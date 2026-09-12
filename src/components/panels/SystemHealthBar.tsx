'use client';

import React from 'react';
import { SYSTEM_HEALTH_STATUS } from '@/lib/providers/free-data-service';

interface SystemHealthBarProps {
  glassIntensity?: 'GHOST_GLASS' | 'ULTRA_CLEAR' | 'CRYSTAL' | 'TINTED';
}

export const SystemHealthBar: React.FC<SystemHealthBarProps> = ({
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
    <div className={`${glassBg} border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_1px_0_rgba(255,255,255,0.25)] rounded-2xl p-3 font-mono text-[10px] text-gray-100 transition-all`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.9)]"></span>
          <span className="font-bold text-white uppercase text-[10.5px] drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">PROVIDER TELEMETRY:</span>
        </div>

        {/* Real Status Tickers */}
        <div className="flex flex-wrap items-center gap-2.5">
          {SYSTEM_HEALTH_STATUS.map((prov) => (
            <div key={prov.name} className="flex items-center space-x-1.5 bg-black/25 backdrop-blur-sm px-2 py-0.5 rounded-lg border border-white/15">
              <span className="text-gray-200 drop-shadow">{prov.name.split(' (')[0]}:</span>
              <span
                className={`font-bold px-1.5 py-0.2 rounded text-[9px] drop-shadow ${
                  prov.status === 'HEALTHY'
                    ? 'text-emerald-300 bg-emerald-950/70 border border-emerald-400/50 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                    : 'text-amber-300 bg-amber-950/70 border border-amber-400/50 shadow-[0_0_8px_rgba(251,191,36,0.4)]'
                }`}
              >
                {prov.status}
              </span>
              <span className="text-gray-300 text-[8px]">{prov.latencyMs}ms</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
