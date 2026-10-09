'use client';

import React from 'react';
import Link from 'next/link';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const ActiveVisionBlueprintCard: React.FC = () => {
  const { activeSymbol, assetProfile } = useActiveAsset();
  const blueprint = assetProfile.blueprint;

  return (
    <div className="ghost-glass-panel rounded-2xl p-3.5 sm:p-4 font-mono space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            ACTIVE VISION BLUEPRINT ({activeSymbol})
          </h3>
        </div>
        <span className={`text-[7.5px] px-1.5 py-0.2 rounded font-bold uppercase font-mono border ${
          blueprint && blueprint.state !== 'INVALIDATED'
            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
            : 'bg-black/50 text-gray-400 border-white/10'
        }`}>
          {blueprint ? `STATE: ${blueprint.state}` : 'NO BLUEPRINT'}
        </span>
      </div>

      {blueprint ? (
        <div className="space-y-2 text-[9.5px]">
          <div className="flex items-center justify-between bg-black/40 p-2 rounded-xl border border-white/5">
            <span className="text-gray-400">Directional Bias:</span>
            <span className={`font-bold font-sans ${blueprint.direction === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {blueprint.direction} &bull; R:R {blueprint.rrRatio || '1:2'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[8.5px]">
            <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
              <span className="text-gray-400 block text-[7.5px] uppercase">Entry Zone</span>
              <span className="text-white font-bold">
                ${blueprint.entryZoneLow.price} - ${blueprint.entryZoneHigh.price}
              </span>
            </div>
            <div className="bg-black/30 p-1.5 rounded-lg border border-white/5">
              <span className="text-gray-400 block text-[7.5px] uppercase">Stop Loss</span>
              <span className="text-rose-400 font-bold">${blueprint.sl.price}</span>
            </div>
          </div>

          <div className="bg-black/30 p-1.5 rounded-lg border border-white/5 text-[8.5px]">
            <span className="text-gray-400 block text-[7.5px] uppercase">Target Levels</span>
            <span className="text-emerald-300 font-bold">
              TP1: ${blueprint.tp1.price} {blueprint.tp2 ? `• TP2: $${blueprint.tp2.price}` : ''}
            </span>
          </div>

          <div className="text-[8px] text-gray-400 truncate">
            <span className="text-rose-400 font-bold">Invalidation: </span>
            <span>{blueprint.invalidation.reason}</span>
          </div>
        </div>
      ) : (
        <div className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-1.5 text-center text-gray-400">
          <p className="text-[10px] text-amber-300 font-bold uppercase">
            No Active Verified Blueprint
          </p>
          <p className="text-[8.5px] text-gray-400 leading-tight">
            Structure-derived blueprint awaiting candle pattern or vision chart analysis.
          </p>
        </div>
      )}

      {/* Action link to full Chart Studio */}
      <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[8.5px]">
        <span className="text-gray-500">Dedicated SMC Vision Studio</span>
        <Link
          href="/chart-analyzer"
          className="text-cyan-400 hover:text-cyan-200 font-bold underline transition-colors cursor-pointer flex items-center space-x-1"
        >
          <span>Open Chart Analyzer</span>
          <span>&rarr;</span>
        </Link>
      </div>
    </div>
  );
};

