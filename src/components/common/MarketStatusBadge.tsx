'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { evaluateMarketSession, MarketSessionState } from '@/lib/session/market-session-engine';

interface MarketStatusBadgeProps {
  symbol?: string;
  sessionState?: MarketSessionState;
  showCountdown?: boolean;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const MarketStatusBadge: React.FC<MarketStatusBadgeProps> = ({
  symbol,
  sessionState,
  showCountdown = true,
  size = 'sm',
  className = '',
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const state = useMemo(() => {
    if (sessionState) return sessionState;
    if (symbol) return evaluateMarketSession(symbol);
    return evaluateMarketSession('XAUUSD');
  }, [sessionState, symbol]);

  // Color & dot styling based on market state
  const config = useMemo(() => {
    switch (state.marketState) {
      case 'OPEN':
        return {
          dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
          borderClass: 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300',
          label: 'OPEN',
          subtext: showCountdown && state.nextCloseCountdown ? `Closes: ${state.nextCloseCountdown}` : null,
        };
      case 'PRE_OPEN':
        return {
          dotClass: 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]',
          borderClass: 'border-amber-500/30 bg-amber-950/30 text-amber-300',
          label: 'PRE-OPEN',
          subtext: showCountdown ? `Opens in ${state.nextOpenCountdown}` : null,
        };
      case 'DAILY_BREAK':
        return {
          dotClass: 'bg-amber-500/80 shadow-[0_0_6px_rgba(245,158,11,0.6)]',
          borderClass: 'border-amber-500/30 bg-amber-950/30 text-amber-300',
          label: 'DAILY BREAK',
          subtext: showCountdown ? `Opens in ${state.nextOpenCountdown}` : null,
        };
      case 'CLOSING_SOON':
        return {
          dotClass: 'bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.8)]',
          borderClass: 'border-amber-500/40 bg-amber-950/40 text-amber-300',
          label: 'CLOSING SOON',
          subtext: showCountdown && state.nextCloseCountdown ? `Closes in ${state.nextCloseCountdown}` : null,
        };
      case 'WEEKEND_CLOSED':
        return {
          dotClass: 'bg-rose-400/80 shadow-[0_0_6px_rgba(251,113,133,0.6)]',
          borderClass: 'border-rose-500/30 bg-rose-950/30 text-rose-300',
          label: 'WEEKEND CLOSED',
          subtext: showCountdown ? `Opens in ${state.nextOpenCountdown}` : null,
        };
      default:
        return {
          dotClass: 'bg-rose-400/80 shadow-[0_0_6px_rgba(251,113,133,0.6)]',
          borderClass: 'border-rose-500/30 bg-rose-950/30 text-rose-300',
          label: 'CLOSED',
          subtext: showCountdown ? `Opens in ${state.nextOpenCountdown}` : null,
        };
    }
  }, [state, showCountdown]);

  const sizeClasses = {
    xs: 'text-[9px] px-1.5 py-0.5 gap-1',
    sm: 'text-[10px] px-2 py-0.5 gap-1.5',
    md: 'text-[11px] px-2.5 py-1 gap-2',
  };

  return (
    <div
      suppressHydrationWarning
      className={`inline-flex items-center font-mono font-bold uppercase tracking-wider rounded-md border transition-all ${sizeClasses[size]} ${config.borderClass} ${className}`}
      title={`${state.symbol} • ${state.sessionName} (${state.scheduleSource})`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dotClass}`} />
      <span className="whitespace-nowrap">{config.label}</span>
      {mounted && config.subtext && (
        <span className="text-[9px] opacity-75 font-normal tracking-normal lowercase border-l border-white/15 pl-1 ml-0.5 whitespace-nowrap">
          {config.subtext}
        </span>
      )}
    </div>
  );
};
