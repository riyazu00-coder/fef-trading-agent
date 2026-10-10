import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';
import {
  buildCanonicalFromBrokerQuote,
  evaluateCrossFeedDivergence
} from '@/lib/price/price-authority';
import { symbolDirectory } from '@/lib/bridge/symbol-mapper';
import {
  QUOTE_DISPLAY_FRESH_THRESHOLD_MS,
  QUOTE_DISPLAY_STALE_THRESHOLD_MS
} from '@/lib/bridge/connectivity-policy';
import { analyzeMarketStructure, MarketStructure } from '@/lib/market/market-structure-engine';

export const MarketOverviewCard: React.FC = () => {
  const { activeAsset, timeframe, setTimeframe, assetProfile, candles, candleBundle } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected } = useMT5Telemetry();
  const [mounted, setMounted] = useState<boolean>(false);

  // Sticky quote cache to bridge transient polling/render gaps while MT5 is connected
  const stickyQuoteRef = React.useRef<{
    symbol: string;
    quote: any;
    cachedAt: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);
  const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
  const isForex = activeAsset.category === 'FOREX';

  // Retrieve active broker quote
  const isRemoteRelay = Boolean(telemetry.isRemote || (telemetry as any).transport?.includes('RELAY'));
  const canonicalUpper = activeAsset.symbol.toUpperCase();
  const brokerSym = symbolDirectory.toBrokerSymbol(canonicalUpper) || canonicalUpper;

  // Retrieve raw broker quote from telemetry with symbol aliasing
  const incomingBrokerQuote =
    activeTelemetry?.quote ||
    telemetry.allQuotes[canonicalUpper] ||
    telemetry.allQuotes[brokerSym] ||
    telemetry.allQuotes[activeAsset.symbol];

  // Update sticky quote cache when fresh valid broker quote arrives
  if (isMt5Connected && incomingBrokerQuote && incomingBrokerQuote.bid > 0) {
    stickyQuoteRef.current = {
      symbol: canonicalUpper,
      quote: incomingBrokerQuote,
      cachedAt: Date.now()
    };
  }

  // Use current incoming quote, or sticky cached quote if within display stale tolerance (30s)
  const isCachedQuoteValid = Boolean(
    stickyQuoteRef.current &&
    stickyQuoteRef.current.symbol === canonicalUpper &&
    (Date.now() - stickyQuoteRef.current.cachedAt) <= QUOTE_DISPLAY_STALE_THRESHOLD_MS
  );

  const brokerQuote = (incomingBrokerQuote && incomingBrokerQuote.bid > 0)
    ? incomingBrokerQuote
    : (isMt5Connected && isCachedQuoteValid)
    ? stickyQuoteRef.current!.quote
    : null;

  const brokerCanonical = (isMt5Connected && brokerQuote && brokerQuote.bid > 0)
    ? buildCanonicalFromBrokerQuote(
        activeAsset.symbol,
        brokerQuote,
        telemetry.account?.broker || telemetry.terminal?.brokerName || 'Connected Broker',
        telemetry.terminal?.brokerServer,
        Date.now(),
        isRemoteRelay
      )
    : null;

  const crossFeed = (brokerQuote && brokerQuote.bid > 0)
    ? evaluateCrossFeedDivergence(activeAsset.symbol, brokerQuote, activeAsset)
    : null;

  // Display-decoupled connectivity & freshness evaluation:
  // - isBrokerLive: <= 15s (QUOTE_DISPLAY_FRESH_THRESHOLD_MS) -> full green live indicator
  // - isBrokerDisplayEligible: <= 30s (QUOTE_DISPLAY_STALE_THRESHOLD_MS) -> display tolerance
  // - isBrokerConnected: MT5 connected AND quote within display tolerance (or remote relay)
  const isBrokerDisplayEligible = Boolean(
    brokerCanonical &&
    (brokerCanonical.isDisplayEligible ?? (brokerCanonical.ageMs <= QUOTE_DISPLAY_STALE_THRESHOLD_MS))
  );
  const isBrokerLive = Boolean(
    brokerCanonical &&
    (brokerCanonical.isDisplayLive ?? (brokerCanonical.ageMs <= QUOTE_DISPLAY_FRESH_THRESHOLD_MS))
  );
  const isBrokerConnected = Boolean(
    isMt5Connected && brokerCanonical && (isBrokerDisplayEligible || isRemoteRelay)
  );

  const priceDisplay = isForex
    ? `$${activeAsset.price.toFixed(4)}`
    : `$${activeAsset.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

  // 1. Authoritative Today's Daily Open (00:00 UTC / Broker Day Open)
  const dailyOpen = useMemo(() => {
    // A. Check D1 candle in bundle if available
    const d1Candles = candleBundle?.['D1'] || candleBundle?.['1d'];
    if (d1Candles && d1Candles.length > 0) {
      const latestD1 = d1Candles[d1Candles.length - 1];
      if (latestD1.open > 0) return latestD1.open;
    }

    // B. Search candles for today's 00:00 UTC boundary
    if (candles && candles.length > 0) {
      const now = new Date();
      const todayMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

      const todayCandle = candles.find((c) => {
        const ts = c.timestamp > 1e11 ? c.timestamp : c.timestamp * 1000;
        return ts >= todayMidnightUtc;
      });
      if (todayCandle && todayCandle.open > 0) {
        return todayCandle.open;
      }

      const firstTs = candles[0].timestamp > 1e11 ? candles[0].timestamp : candles[0].timestamp * 1000;
      if (firstTs >= todayMidnightUtc && candles[0].open > 0) {
        return candles[0].open;
      }
    }

    // C. Mathematical baseline from current price & change
    const p = activeAsset.price;
    if (p > 0 && typeof activeAsset.change24h === 'number') {
      const derived = p / (1 + activeAsset.change24h / 100);
      if (derived > 0) return derived;
    }

    return activeAsset.price || 1;
  }, [candleBundle, candles, activeAsset.price, activeAsset.change24h]);

  const currentExecPrice = brokerCanonical?.bid ?? brokerCanonical?.mid ?? activeAsset.price;
  const dayDelta = dailyOpen > 0
    ? ((currentExecPrice - dailyOpen) / dailyOpen) * 100
    : (activeAsset.change24h || 0);

  const isDayPos = dayDelta >= 0;

  // 2. Authoritative H4 Market Structure & Directional Momentum
  // Evaluates strictly from verified H4 candles in candleBundle['H4']
  const h4Candles = useMemo(() => {
    return candleBundle?.['H4'] || (timeframe === 'H4' && Array.isArray(candles) ? candles : undefined);
  }, [candleBundle, timeframe, candles]);

  const h4MarketStructure: MarketStructure | null = useMemo(() => {
    if (!h4Candles || !Array.isArray(h4Candles) || h4Candles.length < 10) {
      return null;
    }
    const source = activeAsset.provider === 'MT5' || (activeAsset as any).source === 'LIVE_MT5'
      ? 'MT5_BROKER_OHLC'
      : 'INDEPENDENT_VERIFIED_OHLC';
    return analyzeMarketStructure(h4Candles, activeAsset.symbol, 'H4', source);
  }, [h4Candles, activeAsset.symbol, activeAsset.provider, (activeAsset as any).source]);

  const activeTrendMode: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DATA LIMITED' = useMemo(() => {
    if (!h4MarketStructure || h4MarketStructure.trend === 'INSUFFICIENT_DATA') {
      return 'DATA LIMITED';
    }
    const trend = (h4MarketStructure.trend || '').toUpperCase();
    if (trend === 'BULLISH') return 'BULLISH';
    if (trend === 'BEARISH') return 'BEARISH';
    return 'NEUTRAL';
  }, [h4MarketStructure]);

  const waveConfig = useMemo(() => {
    switch (activeTrendMode) {
      case 'BEARISH':
        return {
          stroke: '#f43f5e',
          gradientId: 'areaGradBear',
          pathLine: 'M 0 10 Q 50 14, 100 28 T 170 38 T 240 44',
          pathArea: 'M 0 10 Q 50 14, 100 28 T 170 38 T 240 44 L 240 50 L 0 50 Z',
          label: 'H4 BEARISH MOMENTUM',
          arrow: '↘',
          colorClass: 'text-rose-400',
          glowStyle: 'drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]',
        };
      case 'BULLISH':
        return {
          stroke: '#10b981',
          gradientId: 'areaGradBull',
          pathLine: 'M 0 42 Q 50 36, 100 22 T 170 14 T 240 8',
          pathArea: 'M 0 42 Q 50 36, 100 22 T 170 14 T 240 8 L 240 50 L 0 50 Z',
          label: 'H4 BULLISH MOMENTUM',
          arrow: '↗',
          colorClass: 'text-emerald-400',
          glowStyle: 'drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]',
        };
      case 'DATA LIMITED':
        return {
          stroke: '#f59e0b',
          gradientId: 'areaGradDataLtd',
          pathLine: 'M 0 25 Q 40 25, 80 25 T 160 25 T 240 25',
          pathArea: 'M 0 25 Q 40 25, 80 25 T 160 25 T 240 25 L 240 50 L 0 50 Z',
          label: 'H4 DATA LIMITED',
          arrow: '•',
          colorClass: 'text-amber-400',
          glowStyle: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]',
        };
      case 'NEUTRAL':
      default:
        return {
          stroke: '#06b6d4',
          gradientId: 'areaGradNeutral',
          pathLine: 'M 0 25 Q 40 14, 80 34 T 160 18 T 240 25',
          pathArea: 'M 0 25 Q 40 14, 80 34 T 160 18 T 240 25 L 240 50 L 0 50 Z',
          label: 'H4 RANGING / NEUTRAL',
          arrow: '↔',
          colorClass: 'text-cyan-400',
          glowStyle: 'drop-shadow-[0_0_8px_rgba(6,182,212,0.4)]',
        };
    }
  }, [activeTrendMode]);

  const rawTrend = (assetProfile.trend || '').toUpperCase();
  const isTrendBearish = rawTrend.includes('BEARISH');
  const isTrendBullish = rawTrend.includes('BULLISH');
  const trendColorClass = isTrendBearish
    ? 'text-rose-400'
    : isTrendBullish
    ? 'text-emerald-400'
    : 'text-amber-400';

  const trendIcon = isTrendBearish
    ? '↘'
    : isTrendBullish
    ? '↗'
    : '↔';

  const rawRegime = (assetProfile.regime || '').toUpperCase();
  const regimeColorClass = rawRegime.includes('BEARISH')
    ? 'text-rose-400'
    : rawRegime.includes('BULLISH')
    ? 'text-emerald-400'
    : 'text-blue-300';

  return (
    <div id="market-overview-card" className="ghost-glass-panel rounded-2xl p-2.5 sm:p-3 font-mono space-y-2 h-full flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
        <div className="flex items-center space-x-1.5">
          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-[11px] sm:text-xs font-bold text-[#F8FAFC] tracking-wider font-sans uppercase">
            MARKET OVERVIEW
          </h3>
        </div>
        <div className="flex items-center space-x-1">
          <MarketStatusBadge sessionState={assetProfile.sessionState} size="xs" showCountdown={false} />
          <span className="text-[7.5px] bg-white/5 text-gray-400 px-1.5 py-0.2 rounded border border-white/5">
            {activeAsset.category}
          </span>
        </div>
      </div>

      {/* Asset Info & Main Price */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isDayPos ? 'bg-emerald-400' : 'bg-rose-400'} inline-block`} />
              <span className="text-sm font-black text-white tracking-wide">{activeAsset.symbol}</span>
              <span
                className="inline-flex items-center font-mono font-bold uppercase tracking-wider rounded-md border text-[8.5px] px-1.5 py-0.5 gap-1 border-cyan-500/40 bg-cyan-950/40 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                title="Real-time data feed connectivity status"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isBrokerLive ? 'bg-cyan-400 animate-pulse' : 'bg-cyan-500'}`} />
                <span>FEED: {isBrokerConnected ? 'LIVE' : 'REFERENCE'}</span>
              </span>
            </div>
            <p className="text-[9.5px] text-gray-400">{activeAsset.name}</p>
          </div>

          <div className="text-right text-[9px] text-gray-300 space-y-0.5 font-mono">
            <div>Spread: <span className="text-cyan-300 font-bold">{isBrokerConnected && brokerCanonical && brokerCanonical.ask != null && brokerCanonical.bid != null ? `${brokerCanonical.spread} pts ($${(brokerCanonical.ask - brokerCanonical.bid).toFixed(brokerCanonical.digits)} USD)` : activeAsset.spread}</span></div>
            <div>Day Open: <span className="text-white font-bold">{isForex ? dailyOpen.toFixed(4) : dailyOpen.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span></div>
            <div>Day High: <span className="text-white font-bold">{isForex ? activeAsset.high24h.toFixed(4) : activeAsset.high24h.toLocaleString()}</span></div>
            <div>Day Low: <span className="text-white font-bold">{isForex ? activeAsset.low24h.toFixed(4) : activeAsset.low24h.toLocaleString()}</span></div>
            <div>Status: <span className={assetProfile.sessionState?.isOpen ? 'text-emerald-300 font-bold' : 'text-rose-300 font-bold'}>{assetProfile.sessionState?.statusLabel || assetProfile.session}</span></div>
          </div>
        </div>

        {/* Pricing Provenance Block */}
        {isBrokerConnected && brokerCanonical ? (
          <div className={`pt-1 space-y-1 ${isRemoteRelay ? 'bg-cyan-950/20 border border-cyan-500/30' : isBrokerLive ? 'bg-emerald-950/20 border border-emerald-500/30' : 'bg-amber-950/20 border border-amber-500/30'} p-2 rounded-xl`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <span className={`w-2 h-2 rounded-full ${isRemoteRelay ? 'bg-cyan-400' : isBrokerLive ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
                <span className={`text-[9.5px] font-black ${isRemoteRelay ? 'text-cyan-300' : isBrokerLive ? 'text-emerald-300' : 'text-amber-300'} tracking-wider`}>
                  {isRemoteRelay ? 'REMOTE MT5 TELEMETRY' : isBrokerLive ? 'MT5 BROKER LIVE' : 'MT5 BROKER (AGING)'}
                </span>
                <span className="text-[8.5px] text-gray-400 font-normal">
                  ({brokerCanonical.broker || 'Broker'}{telemetry.terminal?.brokerServer ? ` • ${telemetry.terminal.brokerServer}` : ''})
                </span>
              </div>
              <span className={`text-[8px] ${isRemoteRelay ? 'text-cyan-400' : isBrokerLive ? 'text-emerald-400' : 'text-amber-400'} font-mono`}>
                Updated {(brokerCanonical.ageMs / 1000).toFixed(1)}s ago
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-0.5">
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-black text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  {(brokerCanonical.bid ?? 0).toFixed(brokerCanonical.digits)}
                </span>
                <span className="text-xs text-gray-400">/</span>
                <span className="text-xl font-black text-cyan-300 tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  {(brokerCanonical.ask ?? 0).toFixed(brokerCanonical.digits)}
                </span>
                <span className="text-[8.5px] text-gray-400 font-bold ml-1">BID / ASK</span>
              </div>
              <div className="text-right font-mono">
                <div className="text-[7.5px] text-gray-400 font-bold uppercase tracking-wider">DAY OPEN</div>
                <div className={`text-[10.5px] font-bold ${isDayPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isDayPos ? '▲ +' : '▼ '}{dayDelta.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Cross-Feed Monitor Basis Strip */}
            {crossFeed && crossFeed.status !== 'UNAVAILABLE' && (
              <div className="flex items-center justify-between text-[8px] border-t border-emerald-500/20 pt-1 text-gray-300">
                <span className="text-gray-400">
                  Ref Feed: <strong className="text-gray-200">${(activeAsset.referencePrice || activeAsset.price).toFixed(brokerCanonical.digits)}</strong> ({activeAsset.referenceProvider || 'TradingView Spot'})
                </span>
                <span className={`px-1.5 py-0.2 rounded font-bold ${
                  crossFeed.status === 'NORMAL_BASIS'
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/30'
                    : crossFeed.status === 'ELEVATED_BASIS'
                    ? 'bg-amber-950/60 text-amber-300 border border-amber-500/30'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                }`}>
                  {crossFeed.statusLabel}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] bg-cyan-950/40 text-cyan-300/90 border border-cyan-500/30 px-1.5 py-0.5 rounded font-mono font-bold flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span>TRADINGVIEW REALTIME FEED ({activeAsset.referenceProvider || 'TradingView Spot'})</span>
              </span>
              <div className="text-right font-mono">
                <div className="text-[7.5px] text-gray-400 font-bold uppercase tracking-wider">DAY OPEN</div>
                <div className={`text-[10.5px] font-bold ${isDayPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isDayPos ? '▲ +' : '▼ '}{dayDelta.toFixed(2)}% ({isDayPos ? '+' : ''}{(currentExecPrice - dailyOpen).toFixed(brokerCanonical?.digits ?? (isForex ? 4 : 2))})
                </div>
              </div>
            </div>

            <div className="pt-0.5 flex items-baseline space-x-2">
              <span className="text-2xl font-black text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                {priceDisplay}
              </span>
              <span className="text-[9px] text-gray-400 font-mono">(INDICATIVE MID)</span>
            </div>
          </div>
        )}
      </div>

      {/* Compact Wave Header & Dynamic Sparkline */}
      <div className="space-y-1 pt-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[7.5px] font-bold text-cyan-300 uppercase tracking-wider flex items-center space-x-1 font-mono">
            <span>📉</span>
            <span>COMPACT WAVE • {waveConfig.label}</span>
          </span>
          <span className={`text-[8px] font-mono font-bold flex items-center space-x-1 ${waveConfig.colorClass}`}>
            <span>{waveConfig.arrow}</span>
            <span>{activeTrendMode}</span>
          </span>
        </div>

        <div className="w-full h-12 relative overflow-hidden rounded-xl bg-black/40 border border-white/5 p-1">
          <svg className={`w-full h-full ${waveConfig.glowStyle}`} viewBox="0 0 240 50" preserveAspectRatio="none">
            <defs>
              <linearGradient id={waveConfig.gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={waveConfig.stroke} stopOpacity="0.4" />
                <stop offset="100%" stopColor={waveConfig.stroke} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path
              d={waveConfig.pathArea}
              fill={`url(#${waveConfig.gradientId})`}
            />
            <path
              d={waveConfig.pathLine}
              fill="none"
              stroke={waveConfig.stroke}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {/* Timeframe Switcher (Includes M30 and W1) */}
      <div className="flex items-center justify-between gap-1 bg-black/40 p-0.5 rounded-xl border border-white/10 text-[8.5px]">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`flex-1 py-0.5 rounded-lg font-bold transition-all text-center cursor-pointer ${
              timeframe === tf
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400 font-bold shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      {/* MARKET CONTEXT */}
      <div className="space-y-1 pt-0.5 border-t border-white/10 text-[9px]">
        <div className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mb-0.5 flex items-center justify-between">
          <span>MARKET CONTEXT ({timeframe})</span>
          <span className="text-[7.5px] text-cyan-400 font-normal">{activeAsset.source}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className={`${trendColorClass} font-bold`}>{trendIcon}</span>
            <span>Trend</span>
          </span>
          <span className={`${trendColorClass} font-bold`}>{assetProfile.trend}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-cyan-400 font-bold">∿</span>
            <span>Volatility</span>
          </span>
          <span className="text-cyan-300 font-bold">{assetProfile.volatility}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-gray-400 font-bold">🎯</span>
            <span>Session</span>
          </span>
          <span className="text-gray-200 text-right truncate max-w-[150px]">
            {assetProfile.sessionState?.sessionName || assetProfile.session}
            {!assetProfile.sessionState?.isOpen && assetProfile.sessionState?.nextOpenCountdown && (
              <span suppressHydrationWarning className="text-amber-300 ml-1 text-[9px]">
                {mounted ? `(${assetProfile.sessionState.nextOpenCountdown})` : ''}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-rose-400 font-bold">⚠️</span>
            <span>News Risk</span>
          </span>
          <span className="text-rose-400 font-bold">{assetProfile.newsRisk}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-cyan-400 font-bold">💧</span>
            <span>Liquidity</span>
          </span>
          <span className="text-cyan-300 font-bold">{assetProfile.liquidity}</span>
        </div>
        <div className="flex items-center justify-between text-gray-300">
          <span className="flex items-center space-x-1.5">
            <span className="text-blue-400 font-bold">⚛</span>
            <span>Market Regime</span>
          </span>
          <span className={`${regimeColorClass} font-bold truncate max-w-[140px] text-right`}>{assetProfile.regime}</span>
        </div>
      </div>
    </div>
  );
};
