'use client';

import React from 'react';

export const RiskVsProfitCard: React.FC = () => {
  return (
    <div className="bg-[#080d1a] border border-cyan-950/80 rounded-xl p-4 shadow-2xl space-y-3">
      {/* Visual Comparison Grid: Profit Potential VS Real Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-center">
        {/* LEFT: PROFIT POTENTIAL */}
        <div className="lg:col-span-5 bg-[#05130e] border-2 border-emerald-500/60 rounded-xl p-3.5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-emerald-400 font-extrabold text-base tracking-wide flex items-center space-x-1.5">
              <span>PROFIT POTENTIAL</span>
            </h3>
            <span className="text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-mono font-bold">
              ESTIMATED ALPHA
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center mb-2">
            {/* Green upward equity curve SVG */}
            <div className="h-24 w-full flex flex-col justify-end">
              <svg viewBox="0 0 160 80" className="w-full h-full">
                <defs>
                  <linearGradient id="profitGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                <line x1="0" y1="20" x2="160" y2="20" stroke="#14532d" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="0" y1="40" x2="160" y2="40" stroke="#14532d" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="0" y1="60" x2="160" y2="60" stroke="#14532d" strokeWidth="0.5" strokeDasharray="2 2" />
                {/* Area and Line */}
                <path
                  d="M 10 70 L 30 62 L 45 66 L 70 50 L 95 55 L 120 32 L 140 38 L 155 15 L 155 75 L 10 75 Z"
                  fill="url(#profitGrad)"
                />
                <polyline
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="2.5"
                  points="10,70 30,62 45,66 70,50 95,55 120,32 140,38 155,15"
                />
                {/* Arrow at tip */}
                <polygon points="155,10 152,18 158,18" fill="#22c55e" />
              </svg>
              <div className="text-[9px] text-gray-500 flex justify-between font-mono px-1">
                <span>JAN</span>
                <span>APR</span>
                <span>JUL</span>
                <span>OCT</span>
                <span>DEC</span>
              </div>
            </div>

            {/* Portfolio Gains stats box */}
            <div className="bg-[#031c12] border border-emerald-600/50 rounded-lg p-2.5 text-[11px] space-y-1 font-mono">
              <div className="text-emerald-300 font-bold text-xs uppercase tracking-wide border-b border-emerald-800 pb-1">
                PORTFOLIO GAINS
              </div>
              <div className="flex justify-between pt-0.5">
                <span className="text-gray-300">Total Return:</span>
                <span className="text-emerald-400 font-black">+27.4%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Sharpe Ratio:</span>
                <span className="text-cyan-300 font-bold">1.32</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Win Rate:</span>
                <span className="text-gold font-bold">61%</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-2 text-[10px] text-emerald-400 font-semibold border-t border-emerald-900/80 pt-1.5">
            <span>➔</span>
            <span>Backtested returns & Verified Confluences</span>
            <span>➔</span>
          </div>
        </div>

        {/* CENTER: VS. BADGE */}
        <div className="lg:col-span-1 flex flex-col items-center justify-center py-2">
          <div className="w-11 h-11 rounded-full bg-[#0d1829] border-2 border-cyan-500/70 shadow-lg flex items-center justify-center font-black text-cyan-300 text-xs tracking-wider">
            VS.
          </div>
          <span className="text-[8.5px] text-gray-400 mt-1 uppercase font-semibold">Balance</span>
        </div>

        {/* RIGHT: REAL RISK */}
        <div className="lg:col-span-5 bg-[#170606] border-2 border-red-500/60 rounded-xl p-3.5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-red-400 font-extrabold text-base tracking-wide flex items-center space-x-1.5">
              <span>REAL RISK</span>
            </h3>
            <span className="text-[9px] bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded font-mono font-bold">
              CAPITAL PRESERVATION
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center mb-2">
            {/* Red downward curve SVG */}
            <div className="h-24 w-full flex flex-col justify-end">
              <svg viewBox="0 0 160 80" className="w-full h-full">
                <defs>
                  <linearGradient id="riskGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                <line x1="0" y1="20" x2="160" y2="20" stroke="#7f1d1d" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="0" y1="40" x2="160" y2="40" stroke="#7f1d1d" strokeWidth="0.5" strokeDasharray="2 2" />
                <line x1="0" y1="60" x2="160" y2="60" stroke="#7f1d1d" strokeWidth="0.5" strokeDasharray="2 2" />
                {/* Area and Line */}
                <path
                  d="M 10 15 L 35 24 L 55 20 L 80 42 L 105 48 L 130 65 L 155 72 L 155 75 L 10 75 Z"
                  fill="url(#riskGrad)"
                />
                <polyline
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                  points="10,15 35,24 55,20 80,42 105,48 130,65 155,72"
                />
                {/* Arrow at tip */}
                <polygon points="155,76 150,68 158,68" fill="#ef4444" />
              </svg>
              <div className="text-[9px] text-gray-500 flex justify-between font-mono px-1">
                <span>JAN</span>
                <span>APR</span>
                <span>JUL</span>
                <span>OCT</span>
                <span>DEC</span>
              </div>
            </div>

            {/* Risk Control Stats & Warning Shield */}
            <div className="bg-[#240505] border border-red-700/60 rounded-lg p-2.5 text-[11px] space-y-1 font-mono flex flex-col justify-between">
              <div className="flex items-center space-x-1.5 border-b border-red-900 pb-1">
                <span className="text-red-400 font-bold text-xs uppercase">STOP LOSS SHIELD</span>
              </div>
              <div className="text-[10px] text-red-300">
                Hard Cap: <span className="font-bold text-white">-10% Max Drawdown</span>
              </div>
              <div className="text-[10px] text-gray-300">
                Trade Cap: <span className="font-bold text-amber-400">0.50% Max per position</span>
              </div>
              <div className="text-[9px] text-gray-400">
                Guarded against live market slippage & surprise news whipsaws.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-2 text-[10px] text-red-400 font-semibold border-t border-red-900/80 pt-1.5">
            <span>➔</span>
            <span>Live Market Losses Cut Early & Disciplined</span>
            <span>➔</span>
          </div>
        </div>
      </div>

      {/* Institutional Axiom Ticker (Exact bottom banner from user's image) */}
      <div className="bg-[#050912] border border-gray-800 rounded-lg py-2 px-3 text-[10.5px] font-mono text-gray-300 flex flex-wrap items-center justify-between gap-2 shadow-inner">
        <div className="flex items-center space-x-1.5 text-cyan-400">
          <span>🎯</span>
          <span className="font-bold">Data In, Decisions Out</span>
        </div>
        <span className="text-gray-700">|</span>
        <div className="flex items-center space-x-1.5 text-emerald-400">
          <span>🔌</span>
          <span className="font-bold">Free APIs Connect Everything</span>
        </div>
        <span className="text-gray-700">|</span>
        <div className="flex items-center space-x-1.5 text-amber-400">
          <span>⚖️</span>
          <span className="font-bold">Opportunities vs. Risks</span>
        </div>
        <span className="text-gray-700">|</span>
        <div className="flex items-center space-x-1.5 text-blue-400">
          <span>🔍</span>
          <span className="font-bold">Test. Validate. Monitor.</span>
        </div>
        <span className="text-gray-700">|</span>
        <div className="flex items-center space-x-1.5 text-gold">
          <span>🛡️</span>
          <span className="font-bold">Discipline Over Hype</span>
        </div>
      </div>
    </div>
  );
};
