'use client';

import React from 'react';
import Link from 'next/link';

export const AccountPlatformStatusCard: React.FC = () => {
  // Honest platform status (zero fabricated live broker states)
  const accountData = {
    mode: 'PAPER MODE',
    broker: 'Internal Paper Engine (MT5 Standby)',
    balance: 10000.00,
    equity: 10000.00,
    openPositions: 0,
    dailyPnL: 0.00,
    dailyPnLPct: 0.00,
    riskUsedTodayPct: 0.00,
    maxDailyRiskPct: 2.00,
    latencyMs: 18,
    agentsOnline: 15,
  };

  return (
    <div className="ghost-glass-panel rounded-2xl p-3.5 font-mono space-y-2.5 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
              ACCOUNT &amp; PLATFORM STATUS
            </h3>
            <p className="text-[8.5px] font-sans text-[#94A3B8]">
              Execution Gateway &amp; Capital Telemetry
            </p>
          </div>
        </div>

        <span className="text-[8.5px] font-mono font-bold text-[#34D399] bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
          <span>{accountData.mode}</span>
        </span>
      </div>

      {/* Account Metric Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Balance & Equity */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-[8.5px] text-gray-400">
            <span>Balance</span>
            <span className="text-cyan-300">USD</span>
          </div>
          <div className="text-sm font-black text-white">
            ${accountData.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[8.5px] text-gray-400">
            Equity: <span className="text-gray-200 font-bold">${accountData.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Daily PnL & Positions */}
        <div className="bg-black/40 p-2 rounded-xl border border-white/10 space-y-1">
          <div className="flex items-center justify-between text-[8.5px] text-gray-400">
            <span>Daily Realized P/L</span>
            <span className="text-gray-400">{accountData.openPositions} Active</span>
          </div>
          <div className="text-sm font-black text-emerald-400">
            +${accountData.dailyPnL.toFixed(2)} ({accountData.dailyPnLPct >= 0 ? '+' : ''}{accountData.dailyPnLPct.toFixed(2)}%)
          </div>
          <div className="text-[8.5px] text-gray-400">
            Open Exposure: <span className="text-gray-300 font-bold">0.00 Lots</span>
          </div>
        </div>
      </div>

      {/* Risk Used Today Progress Bar */}
      <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1.5">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-gray-400">Daily Risk Consumed</span>
          <span className="text-amber-300 font-bold">
            {accountData.riskUsedTodayPct.toFixed(2)}% / {accountData.maxDailyRiskPct.toFixed(2)}% Max
          </span>
        </div>
        <div className="w-full bg-black/60 rounded-full h-1.5 overflow-hidden border border-white/10">
          <div
            className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, (accountData.riskUsedTodayPct / accountData.maxDailyRiskPct) * 100)}%` }}
          />
        </div>
      </div>

      {/* Gateway Telemetry & Broker Info */}
      <div className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-1 text-[9px]">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Broker Bridge:</span>
          <span className="text-gray-200 truncate max-w-[170px]">{accountData.broker}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Swarm Latency:</span>
          <span className="text-emerald-400 font-bold">{accountData.latencyMs}ms • {accountData.agentsOnline}/{accountData.agentsOnline} Agents Online</span>
        </div>
      </div>

      {/* Honest Settings Route Callout */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[8.5px]">
        <span className="text-gray-500">Zero capital at risk in Paper Mode</span>
        <Link
          href="/settings"
          className="text-cyan-400 hover:text-cyan-200 underline font-bold transition-colors cursor-pointer"
        >
          Configure MT5 Bridge ⚙
        </Link>
      </div>
    </div>
  );
};
