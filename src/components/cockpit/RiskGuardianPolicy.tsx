'use client';

import React from 'react';

export const RiskGuardianPolicy: React.FC = () => {
  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            RISK GUARDIAN POLICY
          </h3>
        </div>
        <span className="text-[7.5px] bg-amber-950/60 text-[#FBBF24] border border-amber-500/40 px-1.5 py-0.2 rounded font-bold uppercase font-mono">
          ARMED
        </span>
      </div>

      <div className="flex items-center space-x-3">
        {/* Glowing Golden Shield Icon */}
        <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-400/50 flex items-center justify-center text-[#FBBF24] shadow-[0_0_15px_rgba(251,191,36,0.3)] flex-shrink-0">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
          </svg>
        </div>

        <div className="flex-1 space-y-1 text-[9.5px] font-sans">
          <div className="flex items-center justify-between text-[#CBD5E1]">
            <span className="text-[#94A3B8]">Risk Budget Cap:</span>
            <span className="text-[#F8FAFC] font-mono font-bold">0.50% ($512.25)</span>
          </div>
          <div className="flex items-center justify-between text-[#CBD5E1]">
            <span className="text-[#94A3B8]">Max Intraday Loss:</span>
            <span className="text-[#FB7185] font-mono font-bold">-$2,000 Lockout</span>
          </div>
          <div className="flex items-center justify-between text-[#CBD5E1]">
            <span className="text-[#94A3B8]">Event Shock Filter:</span>
            <span className="text-[#FBBF24] font-mono font-bold">Active (PCE in 105m)</span>
          </div>
        </div>
      </div>

      <div className="text-[8.5px] text-emerald-400/90 pt-1 text-center font-mono">
        All execution parameters mathematically bounded
      </div>
    </div>
  );
};
