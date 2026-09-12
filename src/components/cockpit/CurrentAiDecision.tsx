'use client';

import React, { useState } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const CurrentAiDecision: React.FC = () => {
  const { activeSymbol, assetProfile } = useActiveAsset();
  const [status, setStatus] = useState<'IDLE' | 'APPROVED' | 'REJECTED'>('IDLE');

  const isBuy = assetProfile.setupDirection.includes('BUY');
  const isSell = assetProfile.setupDirection.includes('SELL');

  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            CURRENT AI DECISION ({activeSymbol})
          </h3>
        </div>
        <span className="text-[7.5px] bg-cyan-950/60 text-[#22D3EE] border border-cyan-500/40 px-1.5 py-0.2 rounded font-bold uppercase font-mono">
          REAL-TIME SYNCHRONIZATION
        </span>
      </div>

      {/* Main Verdict & Sparkline */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
              isBuy
                ? 'bg-emerald-500/20 border-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                : isSell
                ? 'bg-rose-500/20 border-[#FB7185] shadow-[0_0_15px_rgba(251,113,133,0.5)]'
                : 'bg-amber-500/20 border-[#FBBF24] shadow-[0_0_15px_rgba(251,191,36,0.5)]'
            }`}
          >
            <svg
              className={`w-5 h-5 ${isBuy ? 'text-[#34D399]' : isSell ? 'text-[#FB7185]' : 'text-[#FBBF24]'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d={isBuy ? 'M5 13l4 4L19 7' : isSell ? 'M19 14l-7 7m0 0l-7-7m7 7V3' : 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'}
              />
            </svg>
          </div>
          <div>
            <div
              className={`text-sm sm:text-base font-bold font-sans tracking-wide ${
                isBuy ? 'text-[#34D399]' : isSell ? 'text-[#FB7185]' : 'text-[#FBBF24]'
              }`}
            >
              {assetProfile.setupDirection}
            </div>
            <div className="text-[9.5px] font-sans text-[#94A3B8]">
              Confidence: <strong className="text-[#F8FAFC] font-mono font-bold">{assetProfile.confidence}%</strong>
            </div>
          </div>
        </div>

        {/* Sparkline wave */}
        <div className="w-16 h-8">
          <svg className="w-full h-full" viewBox="0 0 60 25">
            <path
              d={isBuy ? 'M 0 20 L 15 12 L 25 18 L 40 5 L 50 10 L 60 2' : 'M 0 5 L 15 10 L 25 6 L 40 18 L 50 15 L 60 23'}
              fill="none"
              stroke={isBuy ? '#22D3EE' : '#FB7185'}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Metric Parameter Table */}
      <div className="space-y-1.5 text-[10px] bg-black/40 p-2.5 rounded-xl border border-white/5 font-sans">
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Entry Zone</span>
          <span className="text-[#F8FAFC] font-mono font-bold">
            ${assetProfile.entryZone[0]} - ${assetProfile.entryZone[1]}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Stop Loss</span>
          <span className="text-[#FB7185] font-mono font-bold">${assetProfile.stopLoss}</span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Targets</span>
          <span className="text-[#34D399] font-mono font-bold">
            TP1 ${assetProfile.tp1} &bull; TP2 ${assetProfile.tp2}
          </span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">R:R Potential</span>
          <span className="text-[#22D3EE] font-mono font-bold">{assetProfile.rr}</span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Risk Cap</span>
          <span className="text-[#F8FAFC] font-mono font-bold">0.50%</span>
        </div>
        <div className="flex items-center justify-between text-[#CBD5E1]">
          <span className="text-[#94A3B8]">Valid Until</span>
          <span className="text-[#CBD5E1]">Next 4H / Structure Break</span>
        </div>
      </div>

      {/* Invalidation note */}
      <div className="text-[8px] text-gray-400 bg-black/30 p-1.5 rounded-lg border border-white/5">
        <span className="text-rose-400 font-bold">Invalidation: </span>
        <span>{assetProfile.invalidation}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 pt-1 text-[9.5px]">
        <button
          onClick={() => setStatus('APPROVED')}
          className="flex-1 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)] flex items-center justify-center space-x-1 cursor-pointer border border-emerald-400/30"
        >
          <span>✓</span>
          <span>{status === 'APPROVED' ? 'APPROVED & READY' : 'Approve & Execute'}</span>
        </button>
        <button
          onClick={() => alert(`Setup for ${activeSymbol}:\nEntry: ${assetProfile.entryZone[0]} - ${assetProfile.entryZone[1]}\nSL: ${assetProfile.stopLoss}\nTP: ${assetProfile.tp1}`)}
          className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all cursor-pointer"
        >
          Modify
        </button>
        <button
          onClick={() => setStatus('REJECTED')}
          className="px-2.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-950/60 text-rose-400 border border-rose-500/40 transition-all flex items-center space-x-1 cursor-pointer"
        >
          <span>✕</span>
          <span>{status === 'REJECTED' ? 'REJECTED' : 'Reject'}</span>
        </button>
      </div>
    </div>
  );
};
