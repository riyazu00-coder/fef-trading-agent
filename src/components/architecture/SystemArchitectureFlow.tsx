'use client';

import React, { useState } from 'react';
import { ARCHITECTURE_STAGES, ArchitectureStage } from '@/lib/agents/system-architecture-state';

export const SystemArchitectureFlow: React.FC = () => {
  const [selectedStage, setSelectedStage] = useState<ArchitectureStage>(ARCHITECTURE_STAGES[0]);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  const handleStageClick = (stage: ArchitectureStage) => {
    setSelectedStage(stage);
    setIsDrawerOpen(true);
  };

  const getBorderColor = (color: ArchitectureStage['color']) => {
    switch (color) {
      case 'cyan': return 'border-cyan-500/80 shadow-cyan-950/50';
      case 'blue': return 'border-blue-500/80 shadow-blue-950/50';
      case 'teal': return 'border-teal-500/80 shadow-teal-950/50';
      case 'purple': return 'border-purple-500/80 shadow-purple-950/50';
      case 'gold': return 'border-amber-400/80 shadow-amber-950/50';
      case 'red': return 'border-red-500/80 shadow-red-950/50';
      case 'green': return 'border-emerald-500/80 shadow-emerald-950/50';
      default: return 'border-gray-700 shadow-black';
    }
  };

  const getHeaderColor = (color: ArchitectureStage['color']) => {
    switch (color) {
      case 'cyan': return 'text-cyan-400';
      case 'blue': return 'text-blue-400';
      case 'teal': return 'text-teal-300';
      case 'purple': return 'text-purple-400';
      case 'gold': return 'text-amber-300';
      case 'red': return 'text-red-400';
      case 'green': return 'text-emerald-400';
      default: return 'text-white';
    }
  };

  return (
    <div className="bg-[#030712] border border-cyan-950/80 rounded-2xl p-3 sm:p-5 shadow-2xl relative overflow-hidden font-sans space-y-4">
      {/* Blueprint Ambient Grid Background */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25 pointer-events-none"></div>

      {/* Futuristic Master Header directly from Diagram */}
      <div className="relative z-10 border-b border-cyan-900/60 pb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase hidden md:block">
          <div>MARKETS</div>
          <div>DATA</div>
          <div>DISCIPLINE</div>
          <div>OPPORTUNITIES</div>
        </div>

        <div className="text-center flex-1">
          <div className="text-xs sm:text-sm font-black tracking-widest text-amber-400 uppercase">
            FEF TRADING SOLUTIONS
          </div>
          <h2 className="text-base sm:text-xl font-black text-white tracking-wider uppercase drop-shadow-md">
            XAUUSD AI INTELLIGENCE ENGINE
          </h2>
          <div className="text-[10px] sm:text-xs font-mono text-cyan-300 font-semibold tracking-widest mt-0.5">
            COMPLETE SYSTEM ARCHITECTURE (15 STAGES LIVE)
          </div>
        </div>

        <div className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase text-right hidden md:block">
          <div>ANALYZE</div>
          <div>INFORM</div>
          <div>EMPOWER</div>
        </div>
      </div>

      {/* STAGE 1: DATA SOURCES (ALL INDICATORS) - Top full-width strip */}
      <div
        onClick={() => handleStageClick(ARCHITECTURE_STAGES[0])}
        className="bg-[#060c1c] border-2 border-blue-500/60 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer relative group"
      >
        <div className="flex items-center justify-between border-b border-blue-900/70 pb-1.5 mb-2">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <h3 className="text-xs sm:text-sm font-black text-white tracking-wider uppercase">
              1. DATA SOURCES (ALL INDICATORS)
            </h3>
          </div>
          <span className="text-[9px] bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded font-mono">
            10 STREAMS SYNCHRONIZED
          </span>
        </div>

        {/* 10 Data Source Stream Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5 text-center">
          {[
            { icon: '🥇', name: 'XAUUSD', desc: 'Live Price & Market Data', color: 'text-amber-400' },
            { icon: '💵', name: 'DXY', desc: 'USD Index', color: 'text-blue-400' },
            { icon: '🏛️', name: 'US Rates', desc: '10Y / 2Y Yields', color: 'text-cyan-400' },
            { icon: '📊', name: 'Macro Data', desc: 'GDP, CPI, PCE, NFP', color: 'text-emerald-400' },
            { icon: '📅', name: 'Economic Cal', desc: 'Events & Speeches', color: 'text-yellow-400' },
            { icon: '🌐', name: 'Geopolitics', desc: 'Global Events & Risks', color: 'text-indigo-400' },
            { icon: '🛡️', name: 'Cyber / Tech', desc: 'Security, AI Impact', color: 'text-pink-400' },
            { icon: '📰', name: 'News Sources', desc: 'Global, Media, Forums', color: 'text-teal-400' },
            { icon: '📈', name: 'Cross-Asset', desc: 'SPX, VIX, Oil, BTC', color: 'text-purple-400' },
            { icon: '🏦', name: 'Institutional', desc: 'COT, Volume, Order Flow', color: 'text-amber-300' }
          ].map((src, i) => (
            <div
              key={i}
              className="bg-[#030914] border border-gray-800 rounded p-1.5 flex flex-col items-center justify-center hover:border-cyan-700 transition-colors"
            >
              <span className="text-base mb-0.5">{src.icon}</span>
              <span className={`text-[10px] font-bold ${src.color}`}>{src.name}</span>
              <span className="text-[7.5px] text-gray-400 leading-tight mt-0.5 line-clamp-1">{src.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pipeline Arrow 1 -> 2 & 3 */}
      <div className="flex justify-center -my-2">
        <span className="text-cyan-400 font-bold text-xs animate-bounce">▼</span>
      </div>

      {/* ROW 2: STAGE 2 (Data Processing) & STAGE 3 (Market Regime Detection) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Stage 2: Data Processing & Validation (7 Cols) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[1])}
          className="lg:col-span-6 bg-[#040e14] border-2 border-teal-500/60 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-teal-900 pb-1.5 mb-2">
            <h3 className="text-xs sm:text-sm font-black text-teal-300 tracking-wider uppercase">
              2. DATA PROCESSING & VALIDATION
            </h3>
            <span className="text-[9px] bg-teal-950 text-teal-300 border border-teal-800 px-2 py-0.5 rounded font-mono">
              Scrubbed 100%
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1 text-center text-[9px]">
            {[
              { icon: '⚡', name: 'Collection', desc: 'Real-time & Sched.' },
              { icon: '🧹', name: 'Cleaning', desc: 'Normalization' },
              { icon: '🔍', name: 'Verification', desc: 'Reliability Check' },
              { icon: '🛡️', name: 'Missing Data', desc: 'Error Filtering' },
              { icon: '💾', name: 'Storage', desc: 'Secure Database' }
            ].map((step, i) => (
              <div key={i} className="bg-[#02080c] border border-gray-800/80 rounded p-1">
                <span className="text-xs">{step.icon}</span>
                <div className="font-bold text-gray-200 mt-0.5">{step.name}</div>
                <div className="text-[7.5px] text-gray-400">{step.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Stage 3: Market Regime Detection (5 Cols) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[2])}
          className="lg:col-span-6 bg-[#0c0517] border-2 border-purple-500/60 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-purple-900 pb-1.5 mb-2">
            <h3 className="text-xs sm:text-sm font-black text-purple-300 tracking-wider uppercase">
              3. MARKET REGIME DETECTION
            </h3>
            <span className="text-[9px] bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded font-mono">
              Safe-Haven Expansion
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1 text-center text-[8.5px]">
            {[
              { name: 'Trend', sub: 'Up / Down', active: true, color: 'text-emerald-400' },
              { name: 'Range', sub: 'Sideways', active: false, color: 'text-gray-500' },
              { name: 'High Vol', sub: 'Active ATR', active: true, color: 'text-amber-400' },
              { name: 'Low Vol', sub: 'Compressed', active: false, color: 'text-gray-500' },
              { name: 'Risk-On', sub: 'Equities', active: false, color: 'text-gray-500' },
              { name: 'Risk-Off', sub: 'Gold Bullish', active: true, color: 'text-cyan-400' }
            ].map((regime, i) => (
              <div
                key={i}
                className={`rounded p-1 border ${
                  regime.active
                    ? 'bg-purple-950/60 border-purple-600'
                    : 'bg-[#06020c] border-gray-800 opacity-60'
                }`}
              >
                <div className={`font-bold ${regime.color}`}>{regime.name}</div>
                <div className="text-[7.5px] text-gray-400">{regime.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline Arrow 2/3 -> 4 & 5 */}
      <div className="flex justify-center -my-2">
        <span className="text-cyan-400 font-bold text-xs animate-bounce">▼</span>
      </div>

      {/* ROW 3: STAGE 4 (Multi-Agent Analysis) & STAGE 5 (Strategy Engine) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Stage 4: Multi-Agent Analysis (8 Cols) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[3])}
          className="lg:col-span-8 bg-[#04091a] border-2 border-blue-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-blue-900 pb-1.5 mb-2">
            <h3 className="text-xs sm:text-sm font-black text-blue-300 tracking-wider uppercase">
              4. MULTI-AGENT ANALYSIS (AI POWERED)
            </h3>
            <span className="text-[9px] bg-blue-950 text-blue-300 border border-blue-800 px-2 py-0.5 rounded font-mono">
              9 Specialized Agents Deliberating
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 text-[9px]">
            {[
              { role: 'Technical', info: 'ICT, SMT, FVG', bias: 'Bullish' },
              { role: 'Macro', info: 'Rates, Central Bank', bias: 'Bullish' },
              { role: 'News', info: 'Breaking Wire Sentiment', bias: 'Neutral' },
              { role: 'Geopolitical', info: 'Conflicts, Sanctions', bias: 'Bullish' },
              { role: 'Sentiment', info: 'Social Mood, Fear/Greed', bias: 'Neutral' },
              { role: 'Correlation', info: 'DXY, Yields, Silver', bias: 'Bullish' },
              { role: 'Institutional', info: 'COT, Order Flow', bias: 'Bullish' }
            ].map((ag, i) => (
              <div key={i} className="bg-[#02050e] border border-blue-900/60 rounded p-1.5 text-center">
                <div className="font-bold text-white text-[10px]">{ag.role}</div>
                <div className="text-[7.5px] text-gray-400 truncate">{ag.info}</div>
                <span
                  className={`inline-block mt-1 text-[8px] font-bold px-1 rounded ${
                    ag.bias === 'Bullish' ? 'bg-emerald-950 text-emerald-400' : 'bg-gray-800 text-gray-300'
                  }`}
                >
                  {ag.bias}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Stage 5: Strategy Engine (4 Cols) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[4])}
          className="lg:col-span-4 bg-[#140e02] border-2 border-amber-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-amber-900 pb-1.5 mb-2">
            <h3 className="text-xs sm:text-sm font-black text-amber-300 tracking-wider uppercase">
              5. STRATEGY ENGINE
            </h3>
            <span className="text-[9px] bg-amber-950 text-amber-300 border border-amber-800 px-1.5 py-0.5 rounded font-mono">
              ICT Match: 92%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[8.5px]">
            <div className="text-amber-200">✓ ICT / SMT / FVG Setups</div>
            <div className="text-amber-200">✓ Liquidity Sweeps</div>
            <div className="text-amber-200">✓ Breakout / Retest</div>
            <div className="text-amber-200">✓ Trend Continuation</div>
            <div className="text-amber-200">✓ London / NY Sessions</div>
            <div className="text-amber-200">✓ Multi-Timeframe Check</div>
          </div>
        </div>
      </div>

      {/* Pipeline Arrow 4/5 -> 6, 7 & 8 */}
      <div className="flex justify-center -my-2">
        <span className="text-cyan-400 font-bold text-xs animate-bounce">▼</span>
      </div>

      {/* ROW 4: STAGE 6 (Confluence), STAGE 7 (Risk), STAGE 8 (Final AI Decision) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* Stage 6: Confluence & Confidence Scoring (3 Cols) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[5])}
          className="lg:col-span-3 bg-[#031313] border-2 border-teal-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="border-b border-teal-900 pb-1 mb-2">
            <h3 className="text-xs sm:text-sm font-black text-teal-300 tracking-wider uppercase">
              6. CONFLUENCE & CONFIDENCE
            </h3>
          </div>
          <div className="flex items-center justify-around py-1">
            {/* Donut graphic */}
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-gray-800"
                  strokeWidth="4"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-emerald-400"
                  strokeDasharray="72, 100"
                  strokeWidth="4"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-xs font-black text-white">72%</span>
                <span className="block text-[6.5px] text-emerald-400 font-bold">Bullish</span>
              </div>
            </div>
            {/* Probabilities */}
            <div className="space-y-1 text-[9px] font-mono">
              <div className="text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800">
                Bullish 72%
              </div>
              <div className="text-red-400 bg-red-950/80 px-1.5 py-0.5 rounded border border-red-800">
                Bearish 18%
              </div>
              <div className="text-gray-400 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800">
                Neutral 10%
              </div>
            </div>
          </div>
        </div>

        {/* Stage 7: Risk & Trade Management Engine (4 Cols) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[6])}
          className="lg:col-span-4 bg-[#140505] border-2 border-red-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-red-900 pb-1 mb-2">
            <h3 className="text-xs sm:text-sm font-black text-red-300 tracking-wider uppercase">
              7. RISK & TRADE MANAGEMENT
            </h3>
            <span className="text-[8.5px] bg-red-950 text-red-300 border border-red-800 px-1.5 py-0.2 rounded font-mono">
              Max 0.50%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[8.5px] text-gray-300">
            <div>✓ Entry: $2,344 - $2,346.50</div>
            <div>✓ Volatility SL: $2,339.80</div>
            <div>✓ TP1 / TP2 / TP3 Targets</div>
            <div>✓ Risk : Reward (1:2.85)</div>
            <div>✓ Account Sizing Check</div>
            <div>✓ News Event Lockout Armed</div>
          </div>
        </div>

        {/* Stage 8: Final AI Decision Engine (5 Cols) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[7])}
          className="lg:col-span-5 bg-[#0e0618] border-2 border-purple-500/80 rounded-xl p-3 shadow-2xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-purple-900 pb-1 mb-2">
            <h3 className="text-xs sm:text-sm font-black text-purple-300 tracking-wider uppercase">
              8. FINAL AI DECISION ENGINE
            </h3>
            <span className="text-[8.5px] text-gray-400">All Agents + Strategy + Risk</span>
          </div>
          {/* 4 Big Decision State Cards directly from diagram */}
          <div className="grid grid-cols-4 gap-1.5 text-center text-[9px] font-bold">
            <div className="bg-emerald-950/90 text-emerald-300 border-2 border-emerald-500 rounded p-1.5 shadow-lg animate-pulse">
              <span className="text-base block">▲</span>
              <div>BUY SETUP</div>
            </div>
            <div className="bg-[#0b0303] text-gray-600 border border-gray-800 rounded p-1.5 opacity-40">
              <span className="text-base block">▼</span>
              <div>SELL SETUP</div>
            </div>
            <div className="bg-[#0e0802] text-gray-600 border border-gray-800 rounded p-1.5 opacity-40">
              <span className="text-base block">👁️</span>
              <div>WATCH</div>
            </div>
            <div className="bg-[#070707] text-gray-600 border border-gray-800 rounded p-1.5 opacity-40">
              <span className="text-base block">✕</span>
              <div>NO TRADE</div>
            </div>
          </div>
          <div className="text-[8px] text-gray-400 text-center mt-1.5">
            Reasoning: Strong macro + technical convergence with strict risk stop
          </div>
        </div>
      </div>

      {/* Pipeline Arrow 8 -> 9, 10, 11, 12 */}
      <div className="flex justify-center -my-2">
        <span className="text-cyan-400 font-bold text-xs animate-bounce">▼</span>
      </div>

      {/* ROW 5: STAGES 9, 10, 11, 12 (Execution & Management) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Stage 9: Human Approval (Operator) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[8])}
          className="bg-[#050e1c] border-2 border-blue-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-blue-900 pb-1 mb-2">
            <h4 className="text-xs font-black text-blue-300 uppercase">9. HUMAN APPROVAL</h4>
            <span className="text-[8px] text-amber-400 font-bold">MANDATORY</span>
          </div>
          <div className="text-[8.5px] text-gray-300 space-y-0.5 mb-2">
            <div>✓ Review Multi-Agent Analysis</div>
            <div>✓ Check Reasoning & Risk</div>
            <div>✓ Operator Sign-off Required</div>
          </div>
          <div className="grid grid-cols-3 gap-1 text-[8px] font-black text-center">
            <span className="bg-emerald-600 text-white rounded py-0.5">APPROVE</span>
            <span className="bg-amber-600 text-white rounded py-0.5">MODIFY</span>
            <span className="bg-red-700 text-white rounded py-0.5">REJECT</span>
          </div>
        </div>

        {/* Stage 10: Trade Execution (MT5 Integration) */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[9])}
          className="bg-[#031408] border-2 border-emerald-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-emerald-900 pb-1 mb-2">
            <h4 className="text-xs font-black text-emerald-300 uppercase">10. MT5 EXECUTION</h4>
            <span className="text-[9px] font-black text-white bg-emerald-900 px-1 rounded">MT5</span>
          </div>
          <div className="text-[8.5px] text-gray-300 space-y-0.5">
            <div>✓ Execute Approved Orders</div>
            <div>✓ Real-time Order Management</div>
            <div>✓ Modify / Close / Partial Close</div>
            <div>✓ Sync with MT5 Live Terminal</div>
          </div>
        </div>

        {/* Stage 11: Position Monitoring */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[10])}
          className="bg-[#140b02] border-2 border-amber-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-amber-900 pb-1 mb-2">
            <h4 className="text-xs font-black text-amber-300 uppercase">11. POSITION MONITOR</h4>
            <span className="text-[8px] text-gray-400">Telemetry</span>
          </div>
          <div className="text-[8.5px] text-gray-300 space-y-0.5">
            <div>✓ Live Tick-by-Tick P&L</div>
            <div>✓ Move to Break-Even at +1.2R</div>
            <div>✓ Dynamic Trailing Stop</div>
            <div>✓ Partial Profit Taking (TP1)</div>
          </div>
        </div>

        {/* Stage 12: Exit Management */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[11])}
          className="bg-[#030b18] border-2 border-blue-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer flex flex-col justify-between"
        >
          <div className="flex items-center justify-between border-b border-blue-900 pb-1 mb-2">
            <h4 className="text-xs font-black text-blue-300 uppercase">12. EXIT MANAGEMENT</h4>
            <span className="text-[8px] text-emerald-400 font-bold">Planned</span>
          </div>
          <div className="text-[8.5px] text-gray-300 space-y-0.5">
            <div>✓ Take Profit Executions</div>
            <div>✓ Volatility Stop Loss Execution</div>
            <div>✓ Manual Emergency Exit</div>
            <div>✓ Post-Exit Audit Capture</div>
          </div>
        </div>
      </div>

      {/* Pipeline Arrow 12 -> 13, 14, 15 */}
      <div className="flex justify-center -my-2">
        <span className="text-cyan-400 font-bold text-xs animate-bounce">▼</span>
      </div>

      {/* ROW 6: STAGES 13, 14, 15 (Learning, Alerts & Continuous Improvement) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Stage 13: Learning & Audit System */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[12])}
          className="bg-[#0d0418] border-2 border-purple-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between border-b border-purple-900 pb-1 mb-2">
            <h4 className="text-xs font-black text-purple-300 uppercase">13. LEARNING & AUDIT</h4>
            <span className="text-[8px] text-purple-400">142 Stored</span>
          </div>
          <div className="text-[8.5px] text-gray-300 space-y-0.5">
            <div>✓ Store All Analysis & Decisions</div>
            <div>✓ Track Trade Realized Outcomes</div>
            <div>✓ Identify Winning Setup Factors</div>
            <div>✓ Analyze Analytical Mistakes</div>
          </div>
        </div>

        {/* Stage 14: Dashboard & Alerts */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[13])}
          className="bg-[#021313] border-2 border-teal-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between border-b border-teal-900 pb-1 mb-2">
            <h4 className="text-xs font-black text-teal-300 uppercase">14. DASHBOARD & ALERTS</h4>
            <span className="text-[8px] text-teal-400">Broadcast</span>
          </div>
          <div className="text-[8.5px] text-gray-300 space-y-0.5">
            <div>✓ Live Market Dashboard</div>
            <div>✓ AI Signals & Event Lockouts</div>
            <div>✓ Trade Monitoring & Analytics</div>
            <div>✓ Custom Alerts (Push / Webhook)</div>
          </div>
        </div>

        {/* Stage 15: Continuous Improvement */}
        <div
          onClick={() => handleStageClick(ARCHITECTURE_STAGES[14])}
          className="bg-[#031409] border-2 border-emerald-500/70 rounded-xl p-3 shadow-xl hover:border-cyan-400 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between border-b border-emerald-900 pb-1 mb-2">
            <h4 className="text-xs font-black text-emerald-300 uppercase">15. CONTINUOUS IMPROVEMENT</h4>
            <span className="text-[8px] text-emerald-400">v2.6 Live</span>
          </div>
          <div className="text-[8.5px] text-gray-300 space-y-0.5">
            <div>✓ Autonomous Feedback Loops</div>
            <div>✓ Model Weight Optimization</div>
            <div>✓ Dynamic Market Adaptability</div>
            <div>✓ Zero Unapproved Rule Changes</div>
          </div>
        </div>
      </div>

      {/* Bottom Institutional Brand Footer directly from Diagram */}
      <div className="border-t border-cyan-900/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-center sm:text-left">
        <div className="flex items-center space-x-3">
          <div className="text-lg font-black text-amber-400 tracking-wider">
            FEF TRADING SOLUTIONS
          </div>
          <span className="hidden sm:inline text-gray-600">|</span>
          <span className="text-[10px] text-gray-400 tracking-widest font-mono uppercase">
            Smarter Analysis, Better Opportunities
          </span>
        </div>
        <div className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase">
          Discipline Today | A Better Tomorrow
        </div>
      </div>

      {/* INTERACTIVE STAGE DIAGNOSTICS MODAL / DRAWER */}
      {isDrawerOpen && selectedStage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#070d1d] border-2 border-cyan-500/80 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4 relative text-left">
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white text-lg font-bold"
            >
              ✕
            </button>

            <div className="border-b border-gray-800 pb-2">
              <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                Stage {selectedStage.id} Diagnostic Inspector
              </div>
              <h3 className={`text-base font-black ${getHeaderColor(selectedStage.color)}`}>
                {selectedStage.title}
              </h3>
              <p className="text-xs text-gray-400">{selectedStage.subtitle}</p>
            </div>

            <div className="bg-[#030712] p-3 rounded-lg border border-gray-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">Assigned AI Agent:</span>
                <span className="text-xs text-cyan-300 font-mono font-semibold">{selectedStage.agentName}</span>
              </div>
              <p className="text-[11px] text-gray-300 italic">"{selectedStage.agentRole}"</p>
            </div>

            {/* Telemetry Stats */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Live Telemetry Metrics:</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center text-[10px]">
                {selectedStage.telemetry.map((t, idx) => (
                  <div key={idx} className="bg-gray-900/80 p-2 rounded border border-gray-800">
                    <div className="text-gray-400 text-[9px]">{t.label}</div>
                    <div className="font-bold font-mono text-white text-xs mt-0.5">{t.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Architecture Responsibilities */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Module Pipeline Items:</div>
              <ul className="list-disc list-inside text-gray-300 text-[11px] space-y-1 bg-gray-950 p-2.5 rounded border border-gray-800">
                {selectedStage.items.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="text-[10px] text-gray-400 bg-gray-900/50 p-2 rounded border border-gray-800">
              <span className="text-cyan-400 font-bold">Latest Autonomous Action: </span>
              {selectedStage.lastAction}
            </div>

            <div className="text-right">
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold py-1.5 px-4 rounded transition-colors"
              >
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
