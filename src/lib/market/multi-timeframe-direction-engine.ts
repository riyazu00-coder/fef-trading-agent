/**
 * FEF TRADING SOLUTIONS — MULTI-TIMEFRAME DIRECTION & TECHNICAL INDICATORS ENGINE
 * Phase 17: Direction Accuracy & Indicator Harmonization
 *
 * Provides deterministic mathematical indicator calculation and multi-timeframe
 * directional classification across M1, M5, M15, M30, H1, H4, D1.
 *
 * Distinguishes:
 * - LAST_CANDLE_DIRECTION (Color and delta of last completed bar)
 * - SHORT_TERM_MOMENTUM (M1/M5/M15 EMAs 9/21, RSI 14, candle delta)
 * - INTRADAY_STRUCTURE (M15/M30/H1 swing highs/lows, BOS, CHoCH)
 * - TIMEFRAME_TREND (EMA 50/200, swing structure sequence)
 * - HIGHER_TIMEFRAME_BIAS (H4/D1 macro trend)
 * - EXECUTION_DIRECTION (Harmonized alignment of HTF bias with LTF setup)
 */

import { OHLCCandle } from './canonical-market-snapshot';
import { analyzeMarketStructure, MarketStructure } from './market-structure-engine';

export type DirectionalPolarity = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface TechnicalIndicators {
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  atr14: number | null;
  lastCandleDelta: number;
  lastCandlePercent: number;
  lastCandleColor: 'GREEN' | 'RED' | 'DOJI';
  momentumScore: number; // -100 (extreme bearish) to +100 (extreme bullish)
}

export interface TimeframeDirectionAnalysis {
  timeframe: string;
  candleCount: number;
  lastCandleDirection: DirectionalPolarity;
  shortTermMomentum: DirectionalPolarity;
  timeframeTrend: 'BULLISH' | 'BEARISH' | 'RANGING' | 'INSUFFICIENT_DATA';
  indicators: TechnicalIndicators;
  marketStructure?: MarketStructure;
  narrative: string;
}

export interface MultiTimeframeDirectionReport {
  symbol: string;
  analyzedAt: number;
  timeframes: Record<string, TimeframeDirectionAnalysis>;

  // Harmonized Hierarchical Outputs
  lastCandleDirection: DirectionalPolarity;
  shortTermMomentum: DirectionalPolarity;
  intradayStructure: DirectionalPolarity;
  timeframeTrend: DirectionalPolarity;
  higherTimeframeBias: DirectionalPolarity;
  executionDirection: 'BUY' | 'SELL' | 'WAIT';

  // Conflict & Confluence Metrics
  isHtfltfAligned: boolean;
  confluenceDescription: string;
}

/**
 * Exponential Moving Average (EMA) calculation with SMA seed
 */
export function calculateEMA(candles: OHLCCandle[], period: number): number | null {
  if (!candles || candles.length === 0) return null;
  if (candles.length < period) {
    // If fewer bars than period, calculate SMA over available bars
    const sum = candles.reduce((acc, c) => acc + c.close, 0);
    return Number((sum / candles.length).toFixed(5));
  }

  const k = 2 / (period + 1);
  // Seed with SMA of the first `period` bars
  let ema = candles.slice(0, period).reduce((acc, c) => acc + c.close, 0) / period;

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }

  return Number(ema.toFixed(5));
}

/**
 * Relative Strength Index (RSI 14) with Wilder's Smoothing
 */
export function calculateRSI(candles: OHLCCandle[], period: number = 14): number | null {
  if (!candles || candles.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  return Number(rsi.toFixed(2));
}

/**
 * Average True Range (ATR 14)
 */
export function calculateATR(candles: OHLCCandle[], period: number = 14): number | null {
  if (!candles || candles.length < 2) return null;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trs.push(tr);
  }

  if (trs.length === 0) return null;
  const effectivePeriod = Math.min(period, trs.length);
  let atr = trs.slice(0, effectivePeriod).reduce((acc, v) => acc + v, 0) / effectivePeriod;

  for (let i = effectivePeriod; i < trs.length; i++) {
    atr = (atr * (effectivePeriod - 1) + trs[i]) / effectivePeriod;
  }

  return Number(atr.toFixed(5));
}

/**
 * Computes Technical Indicators for a series of candles
 */
export function computeTechnicalIndicators(candles: OHLCCandle[]): TechnicalIndicators {
  if (!candles || candles.length === 0) {
    return {
      ema9: null, ema21: null, ema50: null, ema200: null,
      rsi14: null, atr14: null,
      lastCandleDelta: 0, lastCandlePercent: 0, lastCandleColor: 'DOJI',
      momentumScore: 0
    };
  }

  const last = candles[candles.length - 1];
  const delta = last.close - last.open;
  const pct = last.open > 0 ? (delta / last.open) * 100 : 0;
  const color = delta > 0.00001 ? 'GREEN' : delta < -0.00001 ? 'RED' : 'DOJI';

  const ema9 = calculateEMA(candles, 9);
  const ema21 = calculateEMA(candles, 21);
  const ema50 = calculateEMA(candles, 50);
  const ema200 = calculateEMA(candles, 200);
  const rsi14 = calculateRSI(candles, 14);
  const atr14 = calculateATR(candles, 14);

  // Compute composite momentum score (-100 to +100)
  let momentum = 0;
  if (ema9 !== null && ema21 !== null) {
    if (ema9 > ema21) momentum += 30;
    else if (ema9 < ema21) momentum -= 30;
  }
  if (ema50 !== null) {
    if (last.close > ema50) momentum += 25;
    else if (last.close < ema50) momentum -= 25;
  }
  if (rsi14 !== null) {
    if (rsi14 > 55) momentum += Math.min(25, (rsi14 - 50) * 1.5);
    else if (rsi14 < 45) momentum -= Math.min(25, (50 - rsi14) * 1.5);
  }
  if (color === 'GREEN') momentum += 20;
  else if (color === 'RED') momentum -= 20;

  const momentumScore = Math.max(-100, Math.min(100, Math.round(momentum)));

  return {
    ema9, ema21, ema50, ema200,
    rsi14, atr14,
    lastCandleDelta: Number(delta.toFixed(5)),
    lastCandlePercent: Number(pct.toFixed(2)),
    lastCandleColor: color,
    momentumScore
  };
}

/**
 * Analyzes a single timeframe's directional posture and structure
 */
export function analyzeTimeframeDirection(
  candles: OHLCCandle[],
  timeframe: string,
  symbol: string
): TimeframeDirectionAnalysis {
  if (!candles || candles.length === 0) {
    return {
      timeframe,
      candleCount: 0,
      lastCandleDirection: 'NEUTRAL',
      shortTermMomentum: 'NEUTRAL',
      timeframeTrend: 'INSUFFICIENT_DATA',
      indicators: computeTechnicalIndicators([]),
      narrative: `No candles available for ${symbol} on ${timeframe}.`
    };
  }

  const indicators = computeTechnicalIndicators(candles);
  const lastCandleDirection: DirectionalPolarity =
    indicators.lastCandleColor === 'GREEN' ? 'BULLISH' :
    indicators.lastCandleColor === 'RED' ? 'BEARISH' : 'NEUTRAL';

  const shortTermMomentum: DirectionalPolarity =
    indicators.momentumScore >= 25 ? 'BULLISH' :
    indicators.momentumScore <= -25 ? 'BEARISH' : 'NEUTRAL';

  // Structural Trend detection
  let timeframeTrend: 'BULLISH' | 'BEARISH' | 'RANGING' | 'INSUFFICIENT_DATA' = 'INSUFFICIENT_DATA';
  let marketStructure: MarketStructure | undefined;

  if (candles.length >= 10) {
    marketStructure = analyzeMarketStructure(candles, symbol, timeframe, 'MT5_BROKER_OHLC');
    timeframeTrend = marketStructure.trend;
  } else {
    // Basic price progression fallback
    const first = candles[0].close;
    const last = candles[candles.length - 1].close;
    if (last > first * 1.002) timeframeTrend = 'BULLISH';
    else if (last < first * 0.998) timeframeTrend = 'BEARISH';
    else timeframeTrend = 'RANGING';
  }

  const narrative = `${timeframe} Trend: ${timeframeTrend} (Momentum: ${shortTermMomentum}, Last candle: ${lastCandleDirection}, RSI: ${indicators.rsi14 ?? 'N/A'}).`;

  return {
    timeframe,
    candleCount: candles.length,
    lastCandleDirection,
    shortTermMomentum,
    timeframeTrend,
    indicators,
    marketStructure,
    narrative
  };
}

/**
 * Evaluates comprehensive multi-timeframe directional hierarchy across M1, M5, M15, M30, H1, H4, D1
 */
export function evaluateMultiTimeframeDirection(
  candleBundle: Record<string, OHLCCandle[]>,
  symbol: string,
  primaryTf: string = 'M15'
): MultiTimeframeDirectionReport {
  const normSymbol = (symbol || 'XAUUSD').toUpperCase();
  const timeframes: Record<string, TimeframeDirectionAnalysis> = {};

  for (const [tf, candles] of Object.entries(candleBundle)) {
    timeframes[tf.toUpperCase()] = analyzeTimeframeDirection(candles, tf.toUpperCase(), normSymbol);
  }

  // 1. Last Candle Direction: derived from primary execution timeframe
  const primaryAnalysis = timeframes[primaryTf.toUpperCase()] ||
    timeframes['M15'] || timeframes['M5'] || Object.values(timeframes)[0];
  const lastCandleDirection = primaryAnalysis?.lastCandleDirection || 'NEUTRAL';

  // 2. Short Term Momentum: M5/M15 consensus
  const m5 = timeframes['M5'];
  const m15 = timeframes['M15'];
  let shortTermMomentum: DirectionalPolarity = 'NEUTRAL';
  if (m15 && m15.shortTermMomentum !== 'NEUTRAL') {
    shortTermMomentum = m15.shortTermMomentum;
  } else if (m5 && m5.shortTermMomentum !== 'NEUTRAL') {
    shortTermMomentum = m5.shortTermMomentum;
  } else if (primaryAnalysis) {
    shortTermMomentum = primaryAnalysis.shortTermMomentum;
  }

  // 3. Intraday Structure: M15/M30/H1 structure
  const m30 = timeframes['M30'];
  const h1 = timeframes['H1'];
  let intradayStructure: DirectionalPolarity = 'NEUTRAL';
  const structCandidates = [h1, m30, m15].filter(Boolean);
  for (const cand of structCandidates) {
    if (cand.timeframeTrend === 'BULLISH' || cand.timeframeTrend === 'BEARISH') {
      intradayStructure = cand.timeframeTrend;
      break;
    }
  }

  // 4. Timeframe Trend: Selected primary timeframe trend
  const timeframeTrend: DirectionalPolarity =
    primaryAnalysis?.timeframeTrend === 'BULLISH' ? 'BULLISH' :
    primaryAnalysis?.timeframeTrend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';

  // 5. Higher Timeframe Bias: H4, D1, or H1 macro trend
  const h4 = timeframes['H4'];
  const d1 = timeframes['D1'];
  let higherTimeframeBias: DirectionalPolarity = 'NEUTRAL';
  if (h4 && (h4.timeframeTrend === 'BULLISH' || h4.timeframeTrend === 'BEARISH')) {
    higherTimeframeBias = h4.timeframeTrend;
  } else if (d1 && (d1.timeframeTrend === 'BULLISH' || d1.timeframeTrend === 'BEARISH')) {
    higherTimeframeBias = d1.timeframeTrend;
  } else if (h1 && (h1.timeframeTrend === 'BULLISH' || h1.timeframeTrend === 'BEARISH')) {
    higherTimeframeBias = h1.timeframeTrend;
  } else {
    higherTimeframeBias = intradayStructure;
  }

  // 6. Harmonized Execution Direction & Alignment
  const isHtfltfAligned = higherTimeframeBias !== 'NEUTRAL' && higherTimeframeBias === shortTermMomentum;

  let executionDirection: 'BUY' | 'SELL' | 'WAIT' = 'WAIT';
  let confluenceDescription = '';

  if (higherTimeframeBias === 'BULLISH') {
    if (shortTermMomentum === 'BULLISH') {
      executionDirection = 'BUY';
      confluenceDescription = 'Full Bullish Alignment: Higher timeframe trend (H4/H1) and lower timeframe momentum (M15/M5) are both bullish.';
    } else if (shortTermMomentum === 'BEARISH') {
      executionDirection = 'WAIT';
      confluenceDescription = 'Bullish Trend Retracement: HTF bias is Bullish, but LTF is pulling back into key support. Awaiting retest exhaustion.';
    } else {
      executionDirection = 'WAIT';
      confluenceDescription = 'Bullish Consolidation: HTF is Bullish; LTF momentum neutral / consolidating.';
    }
  } else if (higherTimeframeBias === 'BEARISH') {
    if (shortTermMomentum === 'BEARISH') {
      executionDirection = 'SELL';
      confluenceDescription = 'Full Bearish Alignment: Higher timeframe trend (H4/H1) and lower timeframe momentum (M15/M5) are both bearish.';
    } else if (shortTermMomentum === 'BULLISH') {
      executionDirection = 'WAIT';
      confluenceDescription = 'Bearish Trend Retracement: HTF bias is Bearish, but LTF is pulling back upwards towards resistance. Awaiting short setup confirmation.';
    } else {
      executionDirection = 'WAIT';
      confluenceDescription = 'Bearish Consolidation: HTF is Bearish; LTF momentum neutral / consolidating.';
    }
  } else {
    executionDirection = 'WAIT';
    confluenceDescription = 'Macro Trend Ranging or Developing: Market structure awaiting directional breakout.';
  }

  return {
    symbol: normSymbol,
    analyzedAt: Date.now(),
    timeframes,
    lastCandleDirection,
    shortTermMomentum,
    intradayStructure,
    timeframeTrend,
    higherTimeframeBias,
    executionDirection,
    isHtfltfAligned,
    confluenceDescription
  };
}

