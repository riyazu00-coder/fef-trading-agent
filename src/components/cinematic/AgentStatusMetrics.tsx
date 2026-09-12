'use client';

import React from 'react';

export const AgentStatusMetrics: React.FC = () => {
  return (
    <div className="bg-[#02050e]/95 border-2 border-cyan-500/70 rounded-2xl p-4 shadow-[0_0_30px_rgba(0,240,255,0.15)] flex flex-col space-y-3 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cyan-900/60 pb-2">
        <div>
          <div className="text-[9px] text-cyan-400 uppercase tracking-widest">
            SYNCHRONIZED TELEMETRY
          </div>
          <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center space-x-1.5">
            <span>📈 AGENT STATUS METRICS</span>
          </h3>
        </div>
        <div className="flex items-center space-x-2 text-[9px]">
          <span className="text-gray-400">CYCLE RATE:</span>
          <span className="text-emerald-400 font-bold">120 Hz</span>
        </div>
      </div>

      {/* Row 1: Live Wave Oscilloscope + Radial Dial + Progress Bars (Matching Image) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        {/* Waveform Oscilloscope */}
        <div className="bg-[#030814] border border-cyan-900/70 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex justify-between items-center text-[9px] text-gray-400 mb-1">
            <span>AGENT TELEMETRY WAVE</span>
            <span className="text-cyan-400 font-bold">ACTIVE</span>
          </div>
          {/* SVG Wave */}
          <div className="h-12 w-full">
            <svg viewBox="0 0 100 40" className="w-full h-full">
              <path
                d="M 0 20 Q 12 5, 25 20 T 50 20 T 75 10 T 100 25"
                fill="none"
                stroke="#00f0ff"
                strokeWidth="2"
              />
              <path
                d="M 0 20 Q 12 35, 25 20 T 50 30 T 75 22 T 100 15"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1.2"
                strokeDasharray="2 2"
              />
            </svg>
          </div>
          <div className="flex justify-between text-[8px] text-gray-500 pt-1 border-t border-gray-900">
            <span>CONVERGENCE</span>
            <span className="text-cyan-300 font-bold">88.7% SYNC</span>
          </div>
        </div>

        {/* Circular Progress Radial Dial */}
        <div className="bg-[#030814] border border-cyan-900/70 rounded-xl p-2.5 flex items-center justify-around">
          <div className="relative w-14 h-14 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-gray-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-cyan-400"
                strokeDasharray="81, 100"
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute text-center">
              <span className="text-[10px] font-black text-white">81%</span>
            </div>
          </div>
          <div className="text-[8.5px] space-y-0.5 text-gray-400">
            <div className="text-white font-bold">AGENT STATUS</div>
            <div>COUNCIL: <span className="text-emerald-400 font-bold">OPTIMAL</span></div>
            <div>BIAS: <span className="text-cyan-400 font-bold">BULLISH</span></div>
          </div>
        </div>

        {/* Multi-Bar Progress Gauges (64.90%, 3%, 10%) directly from image */}
        <div className="bg-[#030814] border border-cyan-900/70 rounded-xl p-2.5 flex flex-col justify-between text-[9px]">
          <div className="text-gray-400 font-bold flex justify-between">
            <span>TASK PROGRESS</span>
            <span className="text-amber-400">64.90%</span>
          </div>
          <div className="space-y-1.5 py-1">
            <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden">
              <div className="bg-cyan-400 h-full w-[64.9%]"></div>
            </div>
            <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-400 h-full w-[10%]"></div>
            </div>
            <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-400 h-full w-[88%]"></div>
            </div>
          </div>
          <div className="flex justify-between text-[8px] text-gray-500">
            <span>64.90%</span>
            <span>3.0%</span>
            <span>88.0%</span>
          </div>
        </div>
      </div>

      {/* Row 2: Error Rate Histogram + Task Completion Rate Wave */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Error Rate Histogram */}
        <div className="bg-[#030814] border border-cyan-900/70 rounded-xl p-2.5">
          <div className="flex justify-between text-[9px] text-gray-400 mb-1">
            <span>FEED ERROR RATE HISTOGRAM</span>
            <span className="text-emerald-400 font-bold">0.02% (NEAR ZERO)</span>
          </div>
          <div className="h-10 flex items-end justify-between space-x-1 pt-1">
            {[12, 18, 8, 4, 15, 6, 2, 5, 1, 9, 3, 2, 0, 1].map((val, i) => (
              <div
                key={i}
                style={{ height: `${val * 2 + 6}px` }}
                className={`w-full rounded-t ${
                  val > 10 ? 'bg-amber-500/70' : 'bg-cyan-500/60'
                }`}
              ></div>
            ))}
          </div>
          <div className="text-[7.5px] text-gray-500 flex justify-between mt-1">
            <span>T-60m</span>
            <span>T-30m</span>
            <span>NOW</span>
          </div>
        </div>

        {/* Task Completion Rate Wave */}
        <div className="bg-[#030814] border border-cyan-900/70 rounded-xl p-2.5 flex flex-col justify-between">
          <div className="flex justify-between text-[9px] text-gray-400 mb-1">
            <span>TASK COMPLETION RATE</span>
            <span className="text-gold font-bold">100% THROUGHPUT</span>
          </div>
          <div className="h-10 w-full">
            <svg viewBox="0 0 100 30" className="w-full h-full">
              <polyline
                fill="none"
                stroke="#fbbf24"
                strokeWidth="1.8"
                points="0,25 20,20 40,15 60,18 80,8 100,5"
              />
              <circle cx="100" cy="5" r="2.5" fill="#00ffff" />
            </svg>
          </div>
          <div className="text-[7.5px] text-gray-500 flex justify-between mt-0.5">
            <span>DATA INGEST: 100%</span>
            <span>SYNTHESIS: 100%</span>
            <span>APPROVAL: PENDING</span>
          </div>
        </div>
      </div>
    </div>
  );
};
