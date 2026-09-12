'use client';

import React, { useState } from 'react';

export const HexagonalSecurityShield: React.FC = () => {
  const [activeCell, setActiveCell] = useState<string>('Capital Preservation Hard Cap (-10%)');

  // Honeycomb grid definition with status states
  const hexCells = [
    // Row 1
    { id: 'h1', col: 2, row: 1, state: 'active', label: 'Max DD Guard', desc: 'Hard drawdown stop at -10% equity' },
    { id: 'h2', col: 3, row: 1, state: 'active', label: 'News Lockout', desc: 'Auto trade lockout T-30m to T+15m around Core PCE' },
    { id: 'h3', col: 4, row: 1, state: 'active', label: 'Spread Filter', desc: 'Reject orders if XAUUSD spread > 35¢' },

    // Row 2
    { id: 'h4', col: 1, row: 2, state: 'active', label: 'Slippage Guard', desc: 'Max allowable execution slippage 25¢' },
    { id: 'h5', col: 2, row: 2, state: 'active', label: 'MT5 Handshake', desc: 'Encrypted broker socket handshake heartbeat 12ms' },
    { id: 'h6', col: 3, row: 2, state: 'alert', label: 'Event Proximity', desc: 'High-Impact PCE event in 1h 45m (Risk Sized down 50%)' },
    { id: 'h7', col: 4, row: 2, state: 'active', label: 'Bad Tick Filter', desc: 'Outlier detection scrubbing anomalous quote spikes' },
    { id: 'h8', col: 5, row: 2, state: 'active', label: 'Margin Buffer', desc: 'Free margin must exceed 85% before order release' },

    // Row 3
    { id: 'h9', col: 2, row: 3, state: 'active', label: 'Position Sizing', desc: 'Strict 0.50% account risk budget enforcement' },
    { id: 'h10', col: 3, row: 3, state: 'alert', label: 'Volatility Barrier', desc: 'ATR elevated (7.8 points). Trailing stop offset expanded' },
    { id: 'h11', col: 4, row: 3, state: 'active', label: 'Human Gatekeeper', desc: 'Zero autonomous execution without operator signature' }
  ];

  return (
    <div className="bg-[#02050e]/95 border-2 border-cyan-500/70 rounded-2xl p-4 shadow-[0_0_30px_rgba(0,240,255,0.15)] flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cyan-900/60 pb-2 mb-3">
        <div>
          <div className="text-[9px] font-mono text-cyan-400 uppercase tracking-widest">
            DEFENSIVE RISK MATRIX
          </div>
          <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center space-x-1.5">
            <span>🛡️ SECURITY SHIELD</span>
          </h3>
        </div>
        <div className="text-right">
          <span className="text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-bold">
            INTEGRITY: 98.4%
          </span>
          <div className="text-[8px] text-amber-400 font-mono mt-0.5">EVENT GUARD ACTIVE</div>
        </div>
      </div>

      {/* Center Hexagonal Honeycomb Canvas & Right Status Badges */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Honeycomb visual matrix (8 Cols) */}
        <div className="md:col-span-8 flex flex-col items-center justify-center py-2">
          {/* SVG Honeycomb rendered cleanly with exact cyan & amber cells */}
          <div className="relative w-full max-w-[280px] h-[190px]">
            <svg viewBox="0 0 320 220" className="w-full h-full">
              <defs>
                <filter id="hexGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Hexagon Path generator */}
              {hexCells.map((cell) => {
                const hexRadius = 26;
                const hexWidth = Math.sqrt(3) * hexRadius; // ~45
                const hexHeight = 2 * hexRadius; // 52
                const cx = 70 + cell.col * (hexWidth * 0.96) + (cell.row % 2 === 0 ? hexWidth * 0.48 : 0);
                const cy = 40 + cell.row * (hexHeight * 0.74);

                // Compute 6 points of hexagon
                const points = [];
                for (let i = 0; i < 6; i++) {
                  const angle = (Math.PI / 3) * i + Math.PI / 6;
                  const px = cx + hexRadius * Math.cos(angle);
                  const py = cy + hexRadius * Math.sin(angle);
                  points.push(`${px.toFixed(1)},${py.toFixed(1)}`);
                }

                const isAlert = cell.state === 'alert';
                const fillColor = isAlert ? 'rgba(251, 191, 36, 0.35)' : 'rgba(0, 240, 255, 0.25)';
                const strokeColor = isAlert ? '#fbbf24' : '#00f0ff';

                return (
                  <g
                    key={cell.id}
                    onClick={() => setActiveCell(`${cell.label}: ${cell.desc}`)}
                    className="cursor-pointer transition-transform hover:scale-105"
                  >
                    <polygon
                      points={points.join(' ')}
                      fill={fillColor}
                      stroke={strokeColor}
                      strokeWidth={isAlert ? '2' : '1.5'}
                      filter="url(#hexGlow)"
                    />
                    <circle cx={cx} cy={cy} r="3" fill={strokeColor} />
                    <text
                      x={cx}
                      y={cy + 12}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="6.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {cell.label.split(' ')[0]}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="text-[8.5px] font-mono text-cyan-300 text-center mt-1">
            {activeCell}
          </div>
        </div>

        {/* Right Status Badges directly matching image (4 Cols) */}
        <div className="md:col-span-4 space-y-1.5 font-mono text-[9.5px]">
          <div className="text-[8.5px] text-gray-400 font-bold uppercase mb-1">DEFENSE LAYERS:</div>
          <div className="flex items-center space-x-2 bg-[#030914] p-1.5 rounded border border-cyan-500/50 text-cyan-300">
            <span className="w-2.5 h-2.5 bg-cyan-400 rounded-sm"></span>
            <span className="font-bold">SHIELD 01 (SL GUARD)</span>
          </div>
          <div className="flex items-center space-x-2 bg-[#030914] p-1.5 rounded border border-cyan-500/50 text-cyan-300">
            <span className="w-2.5 h-2.5 bg-cyan-400 rounded-sm"></span>
            <span className="font-bold">SHIELD 02 (SPREAD)</span>
          </div>
          <div className="flex items-center space-x-2 bg-[#030914] p-1.5 rounded border border-amber-500/60 text-amber-400">
            <span className="w-2.5 h-2.5 bg-amber-400 rounded-sm animate-pulse"></span>
            <span className="font-bold">SECURITY (EVENT LOCK)</span>
          </div>
          <div className="flex items-center space-x-2 bg-[#030914] p-1.5 rounded border border-cyan-500/50 text-cyan-300">
            <span className="w-2.5 h-2.5 bg-cyan-400 rounded-sm"></span>
            <span className="font-bold">SHIELD 04 (MT5 AUDIT)</span>
          </div>
        </div>
      </div>

      {/* Bottom Status Controls matching user image buttons */}
      <div className="border-t border-cyan-900/60 pt-2 flex items-center justify-between text-[9px] font-mono">
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">GATE STATUS:</span>
          <span className="text-emerald-400 font-bold">ALL 11 HONEYCOMB CELLS ACTIVE</span>
        </div>
        <div className="flex space-x-1.5">
          <button className="bg-cyan-950 text-cyan-300 border border-cyan-700 px-2 py-0.5 rounded hover:bg-cyan-900">
            STATUS [A]
          </button>
          <button className="bg-amber-950 text-amber-300 border border-amber-700 px-2 py-0.5 rounded hover:bg-amber-900">
            STATUS [B]
          </button>
        </div>
      </div>
    </div>
  );
};
