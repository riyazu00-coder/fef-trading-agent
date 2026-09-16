/**
 * FEF TRADING SOLUTIONS — MARKET STRUCTURE ENGINE
 * Phase 2D: Truthful Live Intelligence Foundation
 *
 * Deterministic market structure detection from verified OHLC candles.
 * ALL outputs carry provenance (source, timeframe, candleTimestamp, classification).
 * No randomness. No hardcoded levels. No heuristic guesses.
 * If candles are insufficient: return empty arrays, never fabricate structure.
 */

import { OHLCCandle } from './canonical-market-snapshot';

export type StructureClassification = 'DERIVED_FROM_VERIFIED';

export interface StructureLevel {
  price: number;
  type: 'SWING_HIGH' | 'SWING_LOW' | 'BOS_HIGH' | 'BOS_LOW' | 'CHOCH_HIGH' | 'CHOCH_LOW' | 'SUPPORT' | 'RESISTANCE' | 'FVG_HIGH' | 'FVG_LOW' | 'ORDER_BLOCK_HIGH' | 'ORDER_BLOCK_LOW';
  timeframe: string;
  candleTimestamp: number;
  candleIndex: number;
  source: 'MT5_BROKER_OHLC';
  classification: StructureClassification;
  strength?: number; // 1-3, higher = more tested
}

export interface FVG {
  type: 'BULLISH_FVG' | 'BEARISH_FVG';
  high: number;
  low: number;
  midpoint: number;
  timeframe: string;
  candleTimestamp: number;
  source: 'MT5_BROKER_OHLC';
  classification: StructureClassification;
  filled: boolean;
}

export interface OrderBlock {
  type: 'BULLISH_OB' | 'BEARISH_OB';
  high: number;
  low: number;
  timeframe: string;
  candleTimestamp: number;
  source: 'MT5_BROKER_OHLC';
  classification: StructureClassification;
}

export interface MarketStructure {
  timeframe: string;
  symbol: string;
  analyzedAt: number;
  candleCount: number;
  source: 'MT5_BROKER_OHLC';
  classification: StructureClassification;

  swingHighs: StructureLevel[];
  swingLows: StructureLevel[];
  bos: StructureLevel[];       // Break of Structure events
  choch: StructureLevel[];     // Change of Character events
  support: StructureLevel[];   // Tested support zones
  resistance: StructureLevel[];// Tested resistance zones
  fvg: FVG[];                  // Fair Value Gaps (unmitigated)
  orderBlocks: OrderBlock[];   // Last opposing candle before displacement

  // Trend classification derived from swing structure
  trend: 'BULLISH' | 'BEARISH' | 'RANGING' | 'INSUFFICIENT_DATA';
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
}

const MIN_CANDLES = 10;
const SWING_BARS_EACH_SIDE = 2; // pivot detection window

/**
 * Detect swing pivots using fractal logic (N bars on each side must be lower/higher).
 */
function detectSwings(candles: OHLCCandle[], timeframe: string): { highs: StructureLevel[]; lows: StructureLevel[] } {
  const highs: StructureLevel[] = [];
  const lows: StructureLevel[] = [];
  const N = SWING_BARS_EACH_SIDE;

  for (let i = N; i < candles.length - N; i++) {
    const c = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = i - N; j <= i + N; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isSwingHigh = false;
      if (candles[j].low <= c.low) isSwingLow = false;
    }
    if (isSwingHigh) {
      highs.push({ price: c.high, type: 'SWING_HIGH', timeframe, candleTimestamp: c.timestamp, candleIndex: i, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' });
    }
    if (isSwingLow) {
      lows.push({ price: c.low, type: 'SWING_LOW', timeframe, candleTimestamp: c.timestamp, candleIndex: i, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' });
    }
  }
  return { highs, lows };
}

/**
 * Determine trend direction from most recent swing highs and lows.
 * Bullish = HH + HL sequence. Bearish = LH + LL sequence.
 */
function classifyTrend(highs: StructureLevel[], lows: StructureLevel[]): 'BULLISH' | 'BEARISH' | 'RANGING' | 'INSUFFICIENT_DATA' {
  if (highs.length < 2 || lows.length < 2) return 'INSUFFICIENT_DATA';
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);

  const hhCount = recentHighs.filter((h, i) => i > 0 && h.price > recentHighs[i - 1].price).length;
  const hlCount = recentLows.filter((l, i) => i > 0 && l.price > recentLows[i - 1].price).length;
  const lhCount = recentHighs.filter((h, i) => i > 0 && h.price < recentHighs[i - 1].price).length;
  const llCount = recentLows.filter((l, i) => i > 0 && l.price < recentLows[i - 1].price).length;

  if (hhCount >= 1 && hlCount >= 1) return 'BULLISH';
  if (lhCount >= 1 && llCount >= 1) return 'BEARISH';
  return 'RANGING';
}

/**
 * Detect Break of Structure: candle body close beyond a recent swing high/low.
 */
function detectBOS(candles: OHLCCandle[], swingHighs: StructureLevel[], swingLows: StructureLevel[], timeframe: string): StructureLevel[] {
  const bos: StructureLevel[] = [];
  const recentHighLevel = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : null;
  const recentLowLevel = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    if (recentHighLevel && i > recentHighLevel.candleIndex && c.close > recentHighLevel.price) {
      bos.push({ price: recentHighLevel.price, type: 'BOS_HIGH', timeframe, candleTimestamp: c.timestamp, candleIndex: i, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' });
      break;
    }
    if (recentLowLevel && i > recentLowLevel.candleIndex && c.close < recentLowLevel.price) {
      bos.push({ price: recentLowLevel.price, type: 'BOS_LOW', timeframe, candleTimestamp: c.timestamp, candleIndex: i, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' });
      break;
    }
  }
  return bos;
}

/**
 * Detect Change of Character: first structural break AGAINST the prevailing trend.
 */
function detectCHOCH(candles: OHLCCandle[], swingHighs: StructureLevel[], swingLows: StructureLevel[], trend: string, timeframe: string): StructureLevel[] {
  const choch: StructureLevel[] = [];
  if (trend === 'BULLISH' && swingLows.length >= 2) {
    const prevLow = swingLows[swingLows.length - 2];
    for (let i = prevLow.candleIndex + 1; i < candles.length; i++) {
      if (candles[i].close < prevLow.price) {
        choch.push({ price: prevLow.price, type: 'CHOCH_LOW', timeframe, candleTimestamp: candles[i].timestamp, candleIndex: i, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' });
        break;
      }
    }
  } else if (trend === 'BEARISH' && swingHighs.length >= 2) {
    const prevHigh = swingHighs[swingHighs.length - 2];
    for (let i = prevHigh.candleIndex + 1; i < candles.length; i++) {
      if (candles[i].close > prevHigh.price) {
        choch.push({ price: prevHigh.price, type: 'CHOCH_HIGH', timeframe, candleTimestamp: candles[i].timestamp, candleIndex: i, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' });
        break;
      }
    }
  }
  return choch;
}

/**
 * Detect Fair Value Gaps: 3-candle imbalance where candle[i+2].low > candle[i].high (bullish FVG)
 * or candle[i+2].high < candle[i].low (bearish FVG). Only unmitigated FVGs reported.
 */
function detectFVGs(candles: OHLCCandle[], timeframe: string): FVG[] {
  const fvgs: FVG[] = [];
  const lastClose = candles[candles.length - 1].close;

  for (let i = 0; i < candles.length - 2; i++) {
    const prev = candles[i];
    const mid = candles[i + 1];
    const next = candles[i + 2];

    // Bullish FVG: gap between prev.high and next.low
    if (next.low > prev.high) {
      const isFilled = lastClose < next.low || lastClose > prev.high + (next.low - prev.high);
      if (!isFilled) {
        fvgs.push({
          type: 'BULLISH_FVG',
          high: next.low,
          low: prev.high,
          midpoint: (next.low + prev.high) / 2,
          timeframe,
          candleTimestamp: mid.timestamp,
          source: 'MT5_BROKER_OHLC',
          classification: 'DERIVED_FROM_VERIFIED',
          filled: false,
        });
      }
    }

    // Bearish FVG: gap between prev.low and next.high
    if (next.high < prev.low) {
      const isFilled = lastClose > next.high || lastClose < prev.low - (prev.low - next.high);
      if (!isFilled) {
        fvgs.push({
          type: 'BEARISH_FVG',
          high: prev.low,
          low: next.high,
          midpoint: (prev.low + next.high) / 2,
          timeframe,
          candleTimestamp: mid.timestamp,
          source: 'MT5_BROKER_OHLC',
          classification: 'DERIVED_FROM_VERIFIED',
          filled: false,
        });
      }
    }
  }

  // Return the 5 most recent unmitigated FVGs
  return fvgs.slice(-5);
}

/**
 * Detect Order Blocks: the last bearish candle before a bullish displacement (bullish OB)
 * or the last bullish candle before a bearish displacement (bearish OB).
 */
function detectOrderBlocks(candles: OHLCCandle[], timeframe: string): OrderBlock[] {
  const obs: OrderBlock[] = [];
  const DISPLACEMENT_THRESHOLD = 1.5; // displacement body must be 1.5x the OB body

  for (let i = 1; i < candles.length - 1; i++) {
    const ob = candles[i];
    const disp = candles[i + 1];
    const obBody = Math.abs(ob.close - ob.open);
    const dispBody = Math.abs(disp.close - disp.open);
    if (obBody === 0) continue;

    // Bullish OB: bearish candle followed by strong bullish displacement
    if (ob.close < ob.open && disp.close > disp.open && dispBody >= obBody * DISPLACEMENT_THRESHOLD) {
      obs.push({
        type: 'BULLISH_OB',
        high: ob.high,
        low: ob.low,
        timeframe,
        candleTimestamp: ob.timestamp,
        source: 'MT5_BROKER_OHLC',
        classification: 'DERIVED_FROM_VERIFIED',
      });
    }

    // Bearish OB: bullish candle followed by strong bearish displacement
    if (ob.close > ob.open && disp.close < disp.open && dispBody >= obBody * DISPLACEMENT_THRESHOLD) {
      obs.push({
        type: 'BEARISH_OB',
        high: ob.high,
        low: ob.low,
        timeframe,
        candleTimestamp: ob.timestamp,
        source: 'MT5_BROKER_OHLC',
        classification: 'DERIVED_FROM_VERIFIED',
      });
    }
  }

  return obs.slice(-4);
}

/**
 * Classify tested support/resistance zones from swing levels that have been touched >= 2 times.
 */
function detectSupportResistance(
  swingHighs: StructureLevel[],
  swingLows: StructureLevel[],
  timeframe: string,
  digits: number = 3
): { support: StructureLevel[]; resistance: StructureLevel[] } {
  const tolerance = Math.pow(10, -digits) * 50; // 50 pips equivalent tolerance
  const support: StructureLevel[] = [];
  const resistance: StructureLevel[] = [];

  // Group swing lows within tolerance
  const lowGroups: StructureLevel[][] = [];
  for (const lvl of swingLows) {
    const grp = lowGroups.find(g => Math.abs(g[0].price - lvl.price) <= tolerance);
    if (grp) grp.push(lvl); else lowGroups.push([lvl]);
  }
  for (const grp of lowGroups) {
    if (grp.length >= 2) {
      const rep = grp[grp.length - 1];
      support.push({ ...rep, type: 'SUPPORT', strength: Math.min(grp.length, 3) });
    }
  }

  // Group swing highs within tolerance
  const highGroups: StructureLevel[][] = [];
  for (const lvl of swingHighs) {
    const grp = highGroups.find(g => Math.abs(g[0].price - lvl.price) <= tolerance);
    if (grp) grp.push(lvl); else highGroups.push([lvl]);
  }
  for (const grp of highGroups) {
    if (grp.length >= 2) {
      const rep = grp[grp.length - 1];
      resistance.push({ ...rep, type: 'RESISTANCE', strength: Math.min(grp.length, 3) });
    }
  }

  return { support, resistance };
}

/**
 * Main entry point: analyse verified OHLC candles and return full market structure.
 */
export function analyzeMarketStructure(
  candles: OHLCCandle[],
  symbol: string,
  timeframe: string
): MarketStructure {
  const now = Date.now();

  if (!candles || candles.length < MIN_CANDLES) {
    return {
      timeframe, symbol, analyzedAt: now, candleCount: candles?.length || 0,
      source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED',
      swingHighs: [], swingLows: [], bos: [], choch: [],
      support: [], resistance: [], fvg: [], orderBlocks: [],
      trend: 'INSUFFICIENT_DATA',
      lastSwingHigh: null, lastSwingLow: null,
    };
  }

  const { highs: swingHighs, lows: swingLows } = detectSwings(candles, timeframe);
  const trend = classifyTrend(swingHighs, swingLows);
  const bos = detectBOS(candles, swingHighs, swingLows, timeframe);
  const choch = detectCHOCH(candles, swingHighs, swingLows, trend, timeframe);
  const fvg = detectFVGs(candles, timeframe);
  const orderBlocks = detectOrderBlocks(candles, timeframe);
  const { support, resistance } = detectSupportResistance(swingHighs, swingLows, timeframe);

  return {
    timeframe, symbol, analyzedAt: now, candleCount: candles.length,
    source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED',
    swingHighs, swingLows, bos, choch, support, resistance, fvg, orderBlocks,
    trend,
    lastSwingHigh: swingHighs.length > 0 ? swingHighs[swingHighs.length - 1].price : null,
    lastSwingLow: swingLows.length > 0 ? swingLows[swingLows.length - 1].price : null,
  };
}
