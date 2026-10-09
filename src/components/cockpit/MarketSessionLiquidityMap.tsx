'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { OHLCCandle } from '@/lib/market/canonical-market-snapshot';

interface SessionState {
  currentSession: string;
  nextSession: string;
  timeRemaining: string;
  activeBadge: string;
  isOverlap: boolean;
}

interface LiquidityLevel {
  label: string;
  session: 'ASIA' | 'LONDON' | 'NEW YORK' | 'DAILY';
  price: number | null;
  status: 'Swept' | 'Untouched' | 'Active Liquidity' | 'Protected' | 'Target' | 'DATA LIMITED';
  statusColor: string;
  type: 'BSL' | 'SSL' | 'EQUILIBRIUM';
}

export const MarketSessionLiquidityMap: React.FC = () => {
  const { activeSymbol, activeAsset, assetProfile, candles, candleBundle } = useActiveAsset();
  const [now, setNow] = useState<Date>(new Date());
  const [mounted, setMounted] = useState<boolean>(false);

  // Real-time clock tick every second
  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute real Session & Countdown based on actual UTC hours & minutes
  const sessionInfo: SessionState = useMemo(() => {
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const utcSeconds = now.getUTCSeconds();
    const totalMinutesNow = utcHours * 60 + utcMinutes;

    const formatDiff = (targetMinutes: number) => {
      let diffMinutes = targetMinutes - totalMinutesNow;
      if (diffMinutes < 0) diffMinutes += 24 * 60;
      const hours = Math.floor(diffMinutes / 60);
      const mins = diffMinutes % 60;
      const secs = 59 - utcSeconds;
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs >= 0 ? secs : 0).padStart(2, '0')}`;
    };

    // London / NY Overlap: 13:00 - 16:30 UTC (780 - 990 mins)
    if (totalMinutesNow >= 780 && totalMinutesNow < 990) {
      return {
        currentSession: 'London / NY Overlap',
        nextSession: 'New York Afternoon (16:30 UTC)',
        timeRemaining: formatDiff(990),
        activeBadge: 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-[0_0_10px_rgba(0,240,255,0.3)]',
        isOverlap: true,
      };
    }
    // New York Solo: 16:30 - 21:00 UTC (990 - 1260 mins)
    if (totalMinutesNow >= 990 && totalMinutesNow < 1260) {
      return {
        currentSession: 'New York Session',
        nextSession: 'Sydney / Asia Pre-Market (21:00 UTC)',
        timeRemaining: formatDiff(1260),
        activeBadge: 'bg-blue-500/20 text-blue-300 border-blue-400/60',
        isOverlap: false,
      };
    }
    // London Solo: 08:00 - 13:00 UTC (480 - 780 mins)
    if (totalMinutesNow >= 480 && totalMinutesNow < 780) {
      return {
        currentSession: 'London Session',
        nextSession: 'London / NY Overlap (13:00 UTC)',
        timeRemaining: formatDiff(780),
        activeBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/60',
        isOverlap: false,
      };
    }
    // Tokyo / Asia Session: 00:00 - 08:00 UTC (0 - 480 mins)
    if (totalMinutesNow >= 0 && totalMinutesNow < 480) {
      return {
        currentSession: 'Tokyo / Asia Session',
        nextSession: 'London Open (08:00 UTC)',
        timeRemaining: formatDiff(480),
        activeBadge: 'bg-purple-500/20 text-purple-300 border-purple-400/60',
        isOverlap: false,
      };
    }
    // Sydney / Off-Hours: 21:00 - 24:00 UTC (1260 - 1440 mins)
    return {
      currentSession: 'Sydney / Pacific Session',
      nextSession: 'Tokyo Open (00:00 UTC)',
      timeRemaining: formatDiff(1440),
      activeBadge: 'bg-gray-700/40 text-gray-300 border-gray-600',
      isOverlap: false,
    };
  }, [now]);

  // Compute session liquidity levels dynamically from verified OHLC candles
  const liquidityLevels: LiquidityLevel[] = useMemo(() => {
    const p = activeAsset.price;
    const precision = p > 1000 ? 2 : p > 20 ? 3 : 5;

    // Collect all available candles across bundle and active timeframe
    const allCandlesList: OHLCCandle[] = [];
    if (candleBundle) {
      Object.values(candleBundle).forEach(arr => {
        if (Array.isArray(arr)) allCandlesList.push(...arr);
      });
    }
    if (candles && Array.isArray(candles)) {
      allCandlesList.push(...candles);
    }

    // Helper to normalize timestamp to milliseconds
    const getMs = (c: OHLCCandle) => (c.timestamp < 1e11 ? c.timestamp * 1000 : c.timestamp);

    // Filter unique candles by timestamp
    const candleMap = new Map<number, OHLCCandle>();
    allCandlesList.forEach(c => {
      const ms = getMs(c);
      if (!candleMap.has(ms) && Number.isFinite(c.high) && Number.isFinite(c.low)) {
        candleMap.set(ms, c);
      }
    });
    const sortedCandles = Array.from(candleMap.values()).sort((a, b) => getMs(a) - getMs(b));

    // Daily candles if present
    const d1Candles = candleBundle?.['D1'] || candleBundle?.['d1'] || [];

    let pdh: number | null = null;
    let pdl: number | null = null;

    if (d1Candles.length >= 2) {
      // Completed previous day is at index length - 2
      const prevDay = d1Candles[d1Candles.length - 2];
      pdh = prevDay.high;
      pdl = prevDay.low;
    } else if (sortedCandles.length > 0) {
      // Look for yesterday's candles in sorted candles
      const nowMs = now.getTime();
      const currentUtcDay = new Date(nowMs).getUTCDate();
      const yesterdayCandles = sortedCandles.filter(c => {
        const d = new Date(getMs(c));
        const dayDiff = (nowMs - getMs(c)) / (1000 * 60 * 60 * 24);
        return dayDiff >= 0.5 && dayDiff <= 2.5 && d.getUTCDate() !== currentUtcDay;
      });
      if (yesterdayCandles.length >= 4) {
        pdh = Math.max(...yesterdayCandles.map(c => c.high));
        pdl = Math.min(...yesterdayCandles.map(c => c.low));
      }
    }

    // Asia Session (00:00 - 08:00 UTC)
    let asiaHigh: number | null = null;
    let asiaLow: number | null = null;
    const asiaCandles = sortedCandles.filter(c => {
      const d = new Date(getMs(c));
      const hours = d.getUTCHours();
      const dayDiff = (now.getTime() - getMs(c)) / (1000 * 60 * 60 * 24);
      return hours >= 0 && hours < 8 && dayDiff < 1.5;
    });
    if (asiaCandles.length >= 2) {
      asiaHigh = Math.max(...asiaCandles.map(c => c.high));
      asiaLow = Math.min(...asiaCandles.map(c => c.low));
    }

    // London Session (08:00 - 16:30 UTC)
    let londonHigh: number | null = null;
    let londonLow: number | null = null;
    const londonCandles = sortedCandles.filter(c => {
      const d = new Date(getMs(c));
      const hours = d.getUTCHours();
      const dayDiff = (now.getTime() - getMs(c)) / (1000 * 60 * 60 * 24);
      return hours >= 8 && hours < 16 && dayDiff < 1.5;
    });
    if (londonCandles.length >= 2) {
      londonHigh = Math.max(...londonCandles.map(c => c.high));
      londonLow = Math.min(...londonCandles.map(c => c.low));
    }

    return [
      {
        label: 'Previous Day High (PDH)',
        session: 'DAILY',
        price: pdh !== null ? +pdh.toFixed(precision) : null,
        status: pdh === null ? 'DATA LIMITED' : p >= pdh ? 'Swept' : 'Target',
        statusColor: pdh === null ? 'text-amber-400/80 bg-amber-950/30 border-amber-500/30' : p >= pdh ? 'text-amber-400 bg-amber-950/40 border-amber-500/40' : 'text-cyan-300 bg-cyan-950/40 border-cyan-500/40',
        type: 'BSL',
      },
      {
        label: 'London Session High',
        session: 'LONDON',
        price: londonHigh !== null ? +londonHigh.toFixed(precision) : null,
        status: londonHigh === null ? 'DATA LIMITED' : p >= londonHigh ? 'Swept' : 'Active Liquidity',
        statusColor: londonHigh === null ? 'text-amber-400/80 bg-amber-950/30 border-amber-500/30' : p >= londonHigh ? 'text-rose-400 bg-rose-950/40 border-rose-500/40' : 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40',
        type: 'BSL',
      },
      {
        label: 'Asia Session High',
        session: 'ASIA',
        price: asiaHigh !== null ? +asiaHigh.toFixed(precision) : null,
        status: asiaHigh === null ? 'DATA LIMITED' : p > asiaHigh ? 'Swept' : 'Untouched',
        statusColor: asiaHigh === null ? 'text-amber-400/80 bg-amber-950/30 border-amber-500/30' : p > asiaHigh ? 'text-rose-400 bg-rose-950/40 border-rose-500/40' : 'text-gray-400 bg-black/40 border-white/10',
        type: 'BSL',
      },
      {
        label: 'London Session Low',
        session: 'LONDON',
        price: londonLow !== null ? +londonLow.toFixed(precision) : null,
        status: londonLow === null ? 'DATA LIMITED' : p <= londonLow ? 'Swept' : 'Protected',
        statusColor: londonLow === null ? 'text-amber-400/80 bg-amber-950/30 border-amber-500/30' : p <= londonLow ? 'text-rose-400 bg-rose-950/40 border-rose-500/40' : 'text-blue-300 bg-blue-950/40 border-blue-500/40',
        type: 'SSL',
      },
      {
        label: 'Asia Session Low',
        session: 'ASIA',
        price: asiaLow !== null ? +asiaLow.toFixed(precision) : null,
        status: asiaLow === null ? 'DATA LIMITED' : p <= asiaLow ? 'Swept' : 'Untouched',
        statusColor: asiaLow === null ? 'text-amber-400/80 bg-amber-950/30 border-amber-500/30' : p <= asiaLow ? 'text-amber-400 bg-amber-950/40 border-amber-500/40' : 'text-gray-400 bg-black/40 border-white/10',
        type: 'SSL',
      },
      {
        label: 'Previous Day Low (PDL)',
        session: 'DAILY',
        price: pdl !== null ? +pdl.toFixed(precision) : null,
        status: pdl === null ? 'DATA LIMITED' : p <= pdl ? 'Swept' : 'Protected',
        statusColor: pdl === null ? 'text-amber-400/80 bg-amber-950/30 border-amber-500/30' : p <= pdl ? 'text-rose-400 bg-rose-950/40 border-rose-500/40' : 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40',
        type: 'SSL',
      },
    ];
  }, [activeAsset.price, activeSymbol, candleBundle, candles, now]);

  return (
    <div id="liquidity-map-card" className="ghost-glass-panel rounded-2xl p-3.5 font-mono space-y-3 select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
              MARKET SESSION &amp; LIQUIDITY
            </h3>
            <p className="text-[8.5px] font-sans text-[#94A3B8]">
              ICT Killzone Clock &amp; BSL/SSL Sweep Tracker
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {assetProfile?.sessionState && (
            <span suppressHydrationWarning className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${
              assetProfile.tradeExecutable
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
            }`}>
              {activeSymbol}: {assetProfile.tradeExecutable ? 'OPEN' : assetProfile.sessionState.statusLabel}
            </span>
          )}
          <span suppressHydrationWarning className="text-[8.5px] font-mono font-bold text-[#94A3B8] bg-black/40 px-1.5 py-0.5 rounded border border-white/10">
            UTC {mounted ? now.toISOString().substring(11, 19) : '--:--:--'}
          </span>
        </div>
      </div>

      {/* Real Session Clock Panel */}
      <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
        <div>
          <div className="text-[8.5px] font-sans text-[#94A3B8] uppercase tracking-wider">CURRENT SESSION</div>
          <div className="flex items-center space-x-2 mt-0.5">
            <span suppressHydrationWarning className={`text-[11px] font-bold font-sans px-2 py-0.5 rounded-md border ${sessionInfo.activeBadge}`}>
              {sessionInfo.currentSession}
            </span>
          </div>
          {assetProfile?.sessionState && !assetProfile.tradeExecutable && (
            <div suppressHydrationWarning className="text-[8px] text-amber-400 font-mono mt-1">
              Market Closed &bull; {mounted && assetProfile.sessionState.nextOpenCountdown ? `Opens in ${assetProfile.sessionState.nextOpenCountdown}` : 'Opens: Scheduled'}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-[8.5px] text-gray-400 uppercase tracking-wider">TIME REMAINING</div>
          <div suppressHydrationWarning className="text-xs sm:text-sm font-black text-cyan-300 tracking-wider">
            {mounted ? sessionInfo.timeRemaining : '--:--:--'}
          </div>
          <div suppressHydrationWarning className="text-[7.5px] text-gray-400 truncate max-w-[130px]">
            Next: {sessionInfo.nextSession}
          </div>
        </div>
      </div>

      {/* 3 Major Sessions Strip */}
      <div className="grid grid-cols-3 gap-1.5 text-center text-[9px]">
        <div className="p-1.5 rounded-lg bg-black/30 border border-white/5">
          <div className="text-gray-400 font-bold">ASIA</div>
          <div className="text-[8px] text-gray-500">00:00 - 08:00 UTC</div>
        </div>
        <div className="p-1.5 rounded-lg bg-black/30 border border-white/5">
          <div className="text-emerald-400 font-bold">LONDON</div>
          <div className="text-[8px] text-gray-500">08:00 - 16:30 UTC</div>
        </div>
        <div className="p-1.5 rounded-lg bg-black/30 border border-white/5">
          <div className="text-blue-400 font-bold">NEW YORK</div>
          <div className="text-[8px] text-gray-500">13:00 - 21:00 UTC</div>
        </div>
      </div>

      {/* Liquidity Status Inventory */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[9px] text-gray-400 pb-1 border-b border-white/5">
          <span>KEY LEVEL ({activeSymbol})</span>
          <span>PRICE / STATUS</span>
        </div>

        {liquidityLevels.map((lvl, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between text-[9.5px] p-1.5 rounded-lg bg-black/30 border border-white/5 hover:border-white/10 transition-colors"
          >
            <div className="flex items-center space-x-1.5 truncate">
              <span className={`text-[7px] font-black px-1 rounded ${lvl.type === 'BSL' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                {lvl.type}
              </span>
              <span className="text-gray-200 truncate">{lvl.label}</span>
            </div>

            <div className="flex items-center space-x-2 flex-shrink-0">
              <span className="font-bold text-white">
                {lvl.price !== null ? `$${lvl.price.toLocaleString()}` : <span className="text-gray-500 font-mono text-[8px]">LEVEL UNAVAILABLE</span>}
              </span>
              <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${lvl.statusColor}`}>
                {lvl.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Institutional Agent Confluence Signal */}
      <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[8px] text-gray-400">
        <span className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>Feeds Session #13 &amp; Liquidity #14 Agents</span>
        </span>
        <span className="text-cyan-300 font-semibold">
          {liquidityLevels.some(l => l.status === 'DATA LIMITED') ? 'Verified OHLC (Data Limited)' : 'Clean Structural Liquidity'}
        </span>
      </div>
    </div>
  );
};
