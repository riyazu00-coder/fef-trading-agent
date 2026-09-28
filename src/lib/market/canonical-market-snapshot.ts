/**
 * FEF TRADING SOLUTIONS — CANONICAL MARKET SNAPSHOT
 * Phase 2D: Truthful Live Intelligence Foundation
 *
 * Single source of truth for all market evidence fed into the intelligence pipeline.
 * Every field carries explicit provenance: source, classification, and freshness.
 * Missing data is explicitly typed as UNAVAILABLE — never fabricated.
 */

export type SnapshotClassification =
  | 'VERIFIED_LIVE'
  | 'DERIVED_FROM_VERIFIED'
  | 'CACHED_VERIFIED'
  | 'UNAVAILABLE';

export interface ProvenanceTag {
  value: number | null;
  source: string;
  classification: SnapshotClassification;
  timestamp: number;
  freshnessMs: number;
}

export interface OHLCCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
  realVolume?: number;
}

export interface VerifiedTimeframe {
  timeframe: string;
  candles: OHLCCandle[];
  count: number;
  updatedAt: number;
  ageMs: number;
  state: 'VERIFIED' | 'UNAVAILABLE';
  minCandlesForIndicators: number;
}

export interface VerifiedIndicators {
  atr14: ProvenanceTag;
  ema20: ProvenanceTag;
  ema50: ProvenanceTag;
  ema200: ProvenanceTag;
  rsi14: ProvenanceTag;
  macdLine: ProvenanceTag;
  macdSignal: ProvenanceTag;
  macdHist: ProvenanceTag;
}

export interface CanonicalMarketSnapshot {
  symbol: string;
  capturedAt: number;
  brokerBid: ProvenanceTag;
  brokerAsk: ProvenanceTag;
  brokerMid: ProvenanceTag;
  spread: ProvenanceTag;
  quoteAgeMs: number;
  priceAuthority: 'MT5_BROKER' | 'UNAVAILABLE';
  sessionState: string;
  tradeExecutable: boolean;
  timeframes: {
    M5?: VerifiedTimeframe;
    M15?: VerifiedTimeframe;
    H1?: VerifiedTimeframe;
    H4?: VerifiedTimeframe;
    D1?: VerifiedTimeframe;
  };
  indicators: {
    M15?: VerifiedIndicators;
    H1?: VerifiedIndicators;
    H4?: VerifiedIndicators;
  };
  hasLiveQuote: boolean;
  hasSufficientCandles: boolean;
  readyForStructureAnalysis: boolean;
}

function unavailableTag(source: string, now: number): ProvenanceTag {
  return { value: null, source, classification: 'UNAVAILABLE', timestamp: now, freshnessMs: 0 };
}

function derivedTag(value: number, source: string, timestamp: number, now: number): ProvenanceTag {
  return { value, source, classification: 'DERIVED_FROM_VERIFIED', timestamp, freshnessMs: now - timestamp };
}

export function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

export function calculateATR(candles: OHLCCandle[], period: number): number[] {
  if (candles.length < period + 1) return [];
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const hl = candles[i].high - candles[i].low;
    const hc = Math.abs(candles[i].high - candles[i - 1].close);
    const lc = Math.abs(candles[i].low - candles[i - 1].close);
    trs.push(Math.max(hl, hc, lc));
  }
  const result: number[] = [];
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(atr);
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push(atr);
  }
  return result;
}

export function calculateRSI(closes: number[], period: number): number[] {
  if (closes.length < period + 1) return [];
  const result: number[] = [];
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

export function computeIndicators(candles: OHLCCandle[], now: number): VerifiedIndicators | null {
  if (candles.length < 30) return null;
  const lastTs = candles[candles.length - 1].timestamp;
  const closes = candles.map(c => c.close);
  const src = 'MT5_BROKER_OHLC';

  const ema20arr = calculateEMA(closes, 20);
  const ema50arr = candles.length >= 50 ? calculateEMA(closes, 50) : [];
  const ema200arr = candles.length >= 200 ? calculateEMA(closes, 200) : [];
  const atrArr = calculateATR(candles, 14);
  const rsiArr = calculateRSI(closes, 14);

  const ema12arr = calculateEMA(closes, 12);
  const ema26arr = calculateEMA(closes, 26);
  let macdLine: number | null = null, macdSignal: number | null = null, macdHist: number | null = null;
  if (ema12arr.length > 0 && ema26arr.length > 0) {
    const offset = ema12arr.length - ema26arr.length;
    const macdSeries = ema26arr.map((v, i) => ema12arr[i + offset] - v);
    const signalArr = calculateEMA(macdSeries, 9);
    if (macdSeries.length > 0 && signalArr.length > 0) {
      macdLine = macdSeries[macdSeries.length - 1];
      macdSignal = signalArr[signalArr.length - 1];
      macdHist = macdLine - macdSignal;
    }
  }

  return {
    atr14: atrArr.length > 0 ? derivedTag(atrArr[atrArr.length - 1], src, lastTs, now) : unavailableTag(src, now),
    ema20: ema20arr.length > 0 ? derivedTag(ema20arr[ema20arr.length - 1], src, lastTs, now) : unavailableTag(src, now),
    ema50: ema50arr.length > 0 ? derivedTag(ema50arr[ema50arr.length - 1], src, lastTs, now) : unavailableTag(src, now),
    ema200: ema200arr.length > 0 ? derivedTag(ema200arr[ema200arr.length - 1], src, lastTs, now) : unavailableTag(src, now),
    rsi14: rsiArr.length > 0 ? derivedTag(rsiArr[rsiArr.length - 1], src, lastTs, now) : unavailableTag(src, now),
    macdLine: macdLine !== null ? derivedTag(macdLine, src, lastTs, now) : unavailableTag(src, now),
    macdSignal: macdSignal !== null ? derivedTag(macdSignal, src, lastTs, now) : unavailableTag(src, now),
    macdHist: macdHist !== null ? derivedTag(macdHist, src, lastTs, now) : unavailableTag(src, now),
  };
}

export function buildVerifiedTimeframe(
  raw: { success: boolean; count: number; updatedAt?: number; ageMs?: number; candles: OHLCCandle[]; timeframe: string } | null,
  now: number
): VerifiedTimeframe | undefined {
  if (!raw || !raw.success || !raw.candles || raw.candles.length === 0) return undefined;
  return {
    timeframe: raw.timeframe,
    candles: raw.candles,
    count: raw.count,
    updatedAt: raw.updatedAt || now,
    ageMs: raw.ageMs || (now - (raw.updatedAt || 0)),
    state: 'VERIFIED',
    minCandlesForIndicators: 20,
  };
}

export function buildCanonicalMarketSnapshot(params: {
  symbol: string;
  brokerQuote: { bid: number; ask: number; timestamp: number } | null;
  sessionState: string;
  tradeExecutable: boolean;
  timeframeData: Record<string, { success: boolean; state: string; symbol: string; timeframe: string; count: number; updatedAt?: number; ageMs?: number; candles: OHLCCandle[] } | null>;
}): CanonicalMarketSnapshot {
  const now = Date.now();
  const { symbol, brokerQuote, sessionState, tradeExecutable, timeframeData } = params;

  let brokerBid: ProvenanceTag, brokerAsk: ProvenanceTag, brokerMid: ProvenanceTag, spread: ProvenanceTag;
  let quoteAgeMs = Infinity;
  let hasLiveQuote = false;
  let priceAuthority: 'MT5_BROKER' | 'UNAVAILABLE' = 'UNAVAILABLE';

  if (brokerQuote && brokerQuote.bid > 0 && brokerQuote.ask > 0) {
    quoteAgeMs = now - brokerQuote.timestamp;
    const classification: SnapshotClassification = quoteAgeMs < 5000 ? 'VERIFIED_LIVE' : quoteAgeMs < 60000 ? 'CACHED_VERIFIED' : 'UNAVAILABLE';
    hasLiveQuote = classification !== 'UNAVAILABLE';
    priceAuthority = hasLiveQuote ? 'MT5_BROKER' : 'UNAVAILABLE';
    brokerBid = { value: brokerQuote.bid, source: 'MT5_BROKER_TICK', classification, timestamp: brokerQuote.timestamp, freshnessMs: quoteAgeMs };
    brokerAsk = { value: brokerQuote.ask, source: 'MT5_BROKER_TICK', classification, timestamp: brokerQuote.timestamp, freshnessMs: quoteAgeMs };
    brokerMid = { value: (brokerQuote.bid + brokerQuote.ask) / 2, source: 'MT5_BROKER_TICK', classification: 'DERIVED_FROM_VERIFIED', timestamp: brokerQuote.timestamp, freshnessMs: quoteAgeMs };
    spread = { value: Math.round((brokerQuote.ask - brokerQuote.bid) * 100000) / 100000, source: 'MT5_BROKER_TICK', classification: 'DERIVED_FROM_VERIFIED', timestamp: brokerQuote.timestamp, freshnessMs: quoteAgeMs };
  } else {
    brokerBid = unavailableTag('MT5_BROKER_TICK', now);
    brokerAsk = unavailableTag('MT5_BROKER_TICK', now);
    brokerMid = unavailableTag('MT5_BROKER_TICK', now);
    spread = unavailableTag('MT5_BROKER_TICK', now);
  }

  const timeframes: CanonicalMarketSnapshot['timeframes'] = {};
  const indicatorsMap: CanonicalMarketSnapshot['indicators'] = {};
  let hasSufficientCandles = false;

  for (const tf of ['M5', 'M15', 'H1', 'H4', 'D1'] as const) {
    const raw = timeframeData[tf] || null;
    const vtf = buildVerifiedTimeframe(raw as any, now);
    if (vtf) {
      (timeframes as any)[tf] = vtf;
      if (vtf.count >= 20) {
        hasSufficientCandles = true;
        if (tf === 'M15' || tf === 'H1' || tf === 'H4') {
          const ind = computeIndicators(vtf.candles, now);
          if (ind) (indicatorsMap as any)[tf] = ind;
        }
      }
    }
  }

  return {
    symbol, capturedAt: now,
    brokerBid, brokerAsk, brokerMid, spread,
    quoteAgeMs, priceAuthority,
    sessionState, tradeExecutable,
    timeframes, indicators: indicatorsMap,
    hasLiveQuote, hasSufficientCandles,
    readyForStructureAnalysis: hasLiveQuote && hasSufficientCandles,
  };
}
