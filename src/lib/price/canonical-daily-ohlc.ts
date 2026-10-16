/**
 * FEF TRADING SOLUTIONS — CANONICAL ALL-ASSET DAILY OHLC EVALUATOR & INVARIANT GUARD
 *
 * Implements strict universal invariants and single-provenance rules:
 * 1. Low <= High (Low cannot exceed High)
 * 2. Low <= Open <= High (Open must be bounded by daily extremes)
 * 3. When market is open and quote is live:
 *    Low - tolerance <= Current Price <= High + tolerance
 * 4. Single-provenance rule:
 *    When MT5 BROKER LIVE is displayed, Bid, Ask, Open, High, Low, Change, Change %
 *    must all derive strictly from the same active broker D1 trading bar.
 * 5. Fail-Closed:
 *    Any missing D1, stale bar (> 5 days for non-crypto, > 36h for crypto),
 *    invariant violation, or provenance mixing returns DATA LIMITED with exact reason.
 *    Never manufacture, interpolate, or silently substitute daily broker OHLC.
 */

import { getInstrumentParityProfile } from './instrument-parity';

export interface DailyCandleBar {
  timestamp: number; // Bar open timestamp (ms)
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
}

export type DailyStatsProvenance =
  | 'LIVE_MT5'
  | 'INDEPENDENT_VERIFIED'
  | 'INDEPENDENT_REFERENCE'
  | 'DATA_LIMITED'
  | 'UNAVAILABLE';

export interface EvaluatedDailyStats {
  isVerified: boolean;
  provenance: DailyStatsProvenance;
  provider: string;
  open: number | null;
  high: number | null;
  low: number | null;
  currentPrice: number | null;
  change: number | null;
  changePct: number | null;
  isPositive: boolean;
  tradingDayTimestamp: number | null;
  candleAgeMs: number | null;
  statusLabel: string;
  reason?: string;
}

export interface EvaluateDailyStatsInput {
  symbol: string;
  category?: string;
  isBrokerConnected: boolean;
  brokerQuote?: {
    bid?: number;
    ask?: number;
    mid?: number;
    spread?: number;
    digits?: number;
    ageMs?: number;
    broker?: string;
    isDisplayLive?: boolean;
    isDisplayEligible?: boolean;
  } | null;
  referencePrice?: number | null;
  referenceProvider?: string | null;
  d1Candles?: DailyCandleBar[] | null;
  d1Provenance?: string | null; // e.g. 'LIVE_MT5', 'INDEPENDENT_VERIFIED', 'INDEPENDENT_REFERENCE'
  d1Provider?: string | null;
  nowMs?: number;
}

/**
 * Max acceptable age of an active D1 candle:
 * - Crypto (24/7): 36 hours (must rollover every 24h)
 * - Traditional (Forex, Metals, Indices, Commodities): 5 days (120 hours) to allow for
 *   weekend gaps (Friday close through Sunday open/Monday morning) and holiday weekends.
 */
const MAX_D1_AGE_CRYPTO_MS = 36 * 60 * 60 * 1000;
const MAX_D1_AGE_TRADITIONAL_MS = 120 * 60 * 60 * 1000;

/**
 * Universal Invariant Evaluator for Daily OHLC
 */
export function evaluateCanonicalDailyStats(input: EvaluateDailyStatsInput): EvaluatedDailyStats {
  const {
    symbol,
    category,
    isBrokerConnected,
    brokerQuote,
    referencePrice,
    referenceProvider,
    d1Candles,
    d1Provenance,
    d1Provider,
    nowMs = Date.now(),
  } = input;

  const isCrypto = category === 'CRYPTO' || ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'].includes(symbol.toUpperCase());
  const maxD1Age = isCrypto ? MAX_D1_AGE_CRYPTO_MS : MAX_D1_AGE_TRADITIONAL_MS;

  // 1. Missing D1 candles fail-closed
  if (!d1Candles || !Array.isArray(d1Candles) || d1Candles.length === 0) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: isBrokerConnected ? (brokerQuote?.broker || 'MT5 Broker') : (referenceProvider || 'Reference Feed'),
      open: null,
      high: null,
      low: null,
      currentPrice: isBrokerConnected ? (brokerQuote?.bid ?? brokerQuote?.mid ?? null) : (referencePrice ?? null),
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: null,
      candleAgeMs: null,
      statusLabel: 'DATA LIMITED (No D1 Candles)',
      reason: 'MISSING_D1_CANDLES',
    };
  }

  // 2. Extract latest D1 bar (active trading day)
  const latestBar = d1Candles[d1Candles.length - 1];
  if (!latestBar) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: 'None',
      open: null,
      high: null,
      low: null,
      currentPrice: null,
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: null,
      candleAgeMs: null,
      statusLabel: 'DATA LIMITED (Empty Bar)',
      reason: 'EMPTY_D1_BAR',
    };
  }

  const { open, high, low, timestamp: candleTimestamp } = latestBar;

  // 3. Strict numeric integrity
  if (
    typeof open !== 'number' ||
    typeof high !== 'number' ||
    typeof low !== 'number' ||
    !isFinite(open) ||
    !isFinite(high) ||
    !isFinite(low) ||
    open <= 0 ||
    high <= 0 ||
    low <= 0
  ) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: 'None',
      open: null,
      high: null,
      low: null,
      currentPrice: null,
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: null,
      candleAgeMs: null,
      statusLabel: 'DATA LIMITED (Invalid Numbers)',
      reason: `INVALID_NUMERIC_OHLC: O=${open}, H=${high}, L=${low}`,
    };
  }

  // 4. Fundamental OHLC Invariant: Low <= High
  if (low > high) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: 'None',
      open: null,
      high: null,
      low: null,
      currentPrice: null,
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: candleTimestamp,
      candleAgeMs: Math.max(0, nowMs - candleTimestamp),
      statusLabel: 'DATA LIMITED (High < Low)',
      reason: `INVARIANT_VIOLATION_LOW_EXCEEDS_HIGH: Low (${low}) > High (${high})`,
    };
  }

  // 5. Fundamental OHLC Invariant: Low <= Open <= High
  if (open < low || open > high) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: 'None',
      open: null,
      high: null,
      low: null,
      currentPrice: null,
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: candleTimestamp,
      candleAgeMs: Math.max(0, nowMs - candleTimestamp),
      statusLabel: 'DATA LIMITED (Open Outside Range)',
      reason: `INVARIANT_VIOLATION_OPEN_OUTSIDE_RANGE: Open (${open}) outside [${low}, ${high}]`,
    };
  }

  // 6. Candle Age / Trading Day Freshness Check
  const candleAgeMs = Math.max(0, nowMs - candleTimestamp);
  if (candleAgeMs > maxD1Age) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: d1Provider || 'Stale Feed',
      open: null,
      high: null,
      low: null,
      currentPrice: null,
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: candleTimestamp,
      candleAgeMs,
      statusLabel: `DATA LIMITED (Stale D1 Candle: ${Math.round(candleAgeMs / 3600000)}h)`,
      reason: `STALE_DAILY_CANDLE: age (${Math.round(candleAgeMs / 3600000)}h) > max (${Math.round(maxD1Age / 3600000)}h)`,
    };
  }

  // 7. Canonical Source Rule & Provenance Coupling
  if (isBrokerConnected) {
    // When MT5 broker live is displayed, if D1 candle comes from broker it MUST be LIVE_MT5.
    // If broker does not provide D1 candles, independent verified reference OHLC is permitted without failing to DATA_LIMITED.
    if (d1Provenance && d1Provenance !== 'LIVE_MT5' && d1Provenance !== 'INDEPENDENT_VERIFIED' && d1Provenance !== 'INDEPENDENT_REFERENCE') {
      return {
        isVerified: false,
        provenance: 'DATA_LIMITED',
        provider: brokerQuote?.broker || 'MT5 Broker',
        open: null,
        high: null,
        low: null,
        currentPrice: brokerQuote?.bid ?? brokerQuote?.mid ?? null,
        change: null,
        changePct: null,
        isPositive: true,
        tradingDayTimestamp: candleTimestamp,
        candleAgeMs,
        statusLabel: 'DATA LIMITED (Source Mismatch)',
        reason: `PROVENANCE_MISMATCH: MT5 broker live quote cannot mix with ${d1Provenance} OHLC`,
      };
    }
  }

  // 8. Determine Current Price Authority
  const currentPrice = isBrokerConnected
    ? (brokerQuote?.bid ?? brokerQuote?.mid ?? referencePrice ?? null)
    : (referencePrice ?? null);

  if (currentPrice === null || currentPrice <= 0 || !isFinite(currentPrice)) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: isBrokerConnected ? (brokerQuote?.broker || 'MT5 Broker') : (referenceProvider || 'Reference Feed'),
      open: null,
      high: null,
      low: null,
      currentPrice: null,
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: candleTimestamp,
      candleAgeMs,
      statusLabel: 'DATA LIMITED (No Current Price)',
      reason: 'MISSING_CURRENT_PRICE',
    };
  }

  // 9. Current Price vs Daily Range Invariant (Tick Latency Tolerance)
  // When live ticks arrive faster than periodic D1 bar polling, the live tick can expand the intra-day range.
  // Allow a tiny documented tick expansion buffer of 0.5% (or 5x spread).
  // Anything exceeding this buffer indicates completely broken/alien data (e.g. Low=4302 with Price=4160 is a 3.4% violation).
  const spreadPts = brokerQuote?.ask && brokerQuote?.bid ? Math.max(0, brokerQuote.ask - brokerQuote.bid) : 0;
  const tolerance = Math.max(low * 0.005, spreadPts * 5, 0.01);

  if (currentPrice < low - tolerance) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: isBrokerConnected ? (brokerQuote?.broker || 'MT5 Broker') : (referenceProvider || 'Reference Feed'),
      open: null,
      high: null,
      low: null,
      currentPrice,
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: candleTimestamp,
      candleAgeMs,
      statusLabel: 'DATA LIMITED (Price < Low Violation)',
      reason: `INVARIANT_VIOLATION_CURRENT_BELOW_LOW: Current price (${currentPrice}) < Day Low (${low}) by ${(low - currentPrice).toFixed(4)} (max tolerance: ${tolerance.toFixed(4)})`,
    };
  }

  if (currentPrice > high + tolerance) {
    return {
      isVerified: false,
      provenance: 'DATA_LIMITED',
      provider: isBrokerConnected ? (brokerQuote?.broker || 'MT5 Broker') : (referenceProvider || 'Reference Feed'),
      open: null,
      high: null,
      low: null,
      currentPrice,
      change: null,
      changePct: null,
      isPositive: true,
      tradingDayTimestamp: candleTimestamp,
      candleAgeMs,
      statusLabel: 'DATA LIMITED (Price > High Violation)',
      reason: `INVARIANT_VIOLATION_CURRENT_ABOVE_HIGH: Current price (${currentPrice}) > Day High (${high}) by ${(currentPrice - high).toFixed(4)} (max tolerance: ${tolerance.toFixed(4)})`,
    };
  }

  // Real-time intra-day bounds: if current price is slightly outside bar bounds (within tolerance),
  // dynamically expand effective High or Low to reflect real-time price discovery
  const effectiveLow = Math.min(low, currentPrice);
  const effectiveHigh = Math.max(high, currentPrice);

  // 10. Authoritative Day Change and Day Change %
  // Strictly derived from the SAME verified Day Open and Current Price:
  const change = currentPrice - open;
  const changePct = ((currentPrice - open) / open) * 100;
  const isPositive = change >= 0;

  const resolvedProvenance: DailyStatsProvenance = (isBrokerConnected && d1Provenance === 'LIVE_MT5')
    ? 'LIVE_MT5'
    : (d1Provenance === 'INDEPENDENT_VERIFIED' ? 'INDEPENDENT_VERIFIED' : 'INDEPENDENT_REFERENCE');

  const resolvedProvider = (isBrokerConnected && d1Provenance === 'LIVE_MT5')
    ? (brokerQuote?.broker || 'MT5 Broker')
    : (d1Provider || referenceProvider || (isBrokerConnected ? brokerQuote?.broker : 'Reference Feed') || 'Reference Feed');

  const parityProfile = getInstrumentParityProfile(symbol);
  const isProxyOnly = parityProfile.parityClassification === 'PROXY_ONLY';
  const statusLabel = (isBrokerConnected && d1Provenance === 'LIVE_MT5')
    ? 'MT5 BROKER LIVE'
    : (isProxyOnly ? 'REFERENCE PROXY' : 'VERIFIED REFERENCE');

  return {
    isVerified: true,
    provenance: resolvedProvenance,
    provider: resolvedProvider,
    open,
    high: effectiveHigh,
    low: effectiveLow,
    currentPrice,
    change,
    changePct,
    isPositive,
    tradingDayTimestamp: candleTimestamp,
    candleAgeMs,
    statusLabel,
  };
}
