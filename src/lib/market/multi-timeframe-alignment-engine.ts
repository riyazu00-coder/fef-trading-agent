/**
 * FEF CORTEX — MULTI-TIMEFRAME CONGRUENCE ENGINE (V1.3)
 * 
 * Truthful multi-timeframe alignment across the canonical 5-timeframe bundle:
 * M5 (Execution Timing)
 * M15 (Short-Term Structure)
 * M30 (Intermediate Order Flow)
 * H1 (Tactical Bias)
 * H4 (Strategic HTF Trend)
 * 
 * No naive linear averaging: detects structural pullbacks vs counter-trend traps.
 */

import { OHLCCandle } from './canonical-market-snapshot';

export type TimeframeId = 'M5' | 'M15' | 'M30' | 'H1' | 'H4';

export type SingleTfTrend = 'BULLISH' | 'BEARISH' | 'RANGING' | 'INSUFFICIENT_DATA';

export interface TimeframeTrendAnalysis {
  timeframe: TimeframeId;
  trend: SingleTfTrend;
  candleCount: number;
  fastEma: number | null;
  slowEma: number | null;
  lastClose: number | null;
  momentumPercent: number;
}

export type MultiTfAlignmentState =
  | 'CONGRUENT_BULLISH'
  | 'CONGRUENT_BEARISH'
  | 'HTF_BULLISH_LTF_PULLBACK'
  | 'HTF_BEARISH_LTF_PULLBACK'
  | 'RANGE_BOUND'
  | 'CONFLICTED'
  | 'DATA_LIMITED';

export interface MultiTimeframeAlignmentResult {
  symbol: string;
  evaluatedAt: string;
  alignmentState: MultiTfAlignmentState;
  alignmentScore: number; // 0 to 100
  htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // H4 / H1 composite
  ltfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; // M5 / M15 composite
  timeframeDetails: Record<TimeframeId, TimeframeTrendAnalysis>;
  congruenceDescription: string;
}

function calculateSimpleEMA(candles: OHLCCandle[], period: number): number | null {
  if (candles.length < period) return null;
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return Number(ema.toFixed(5));
}

export function analyzeSingleTimeframe(candles: OHLCCandle[], tf: TimeframeId): TimeframeTrendAnalysis {
  if (!candles || candles.length < 5) {
    return {
      timeframe: tf,
      trend: 'INSUFFICIENT_DATA',
      candleCount: candles?.length || 0,
      fastEma: null,
      slowEma: null,
      lastClose: null,
      momentumPercent: 0,
    };
  }

  const fastEma = calculateSimpleEMA(candles, Math.min(8, Math.floor(candles.length / 2)));
  const slowEma = calculateSimpleEMA(candles, Math.min(21, candles.length));
  const lastClose = candles[candles.length - 1].close;
  const firstClose = candles[Math.max(0, candles.length - 10)].close;
  const momentumPercent = Number((((lastClose - firstClose) / firstClose) * 100).toFixed(2));

  let trend: SingleTfTrend = 'RANGING';
  if (fastEma && slowEma) {
    if (lastClose > fastEma && fastEma > slowEma) {
      trend = 'BULLISH';
    } else if (lastClose < fastEma && fastEma < slowEma) {
      trend = 'BEARISH';
    } else if (momentumPercent > 0.35) {
      trend = 'BULLISH';
    } else if (momentumPercent < -0.35) {
      trend = 'BEARISH';
    }
  }

  return {
    timeframe: tf,
    trend,
    candleCount: candles.length,
    fastEma,
    slowEma,
    lastClose,
    momentumPercent,
  };
}

export function evaluateMultiTimeframeAlignment(
  symbol: string,
  candleBundles: Partial<Record<TimeframeId, OHLCCandle[]>>
): MultiTimeframeAlignmentResult {
  const normSym = symbol.toUpperCase();
  const timeframes: TimeframeId[] = ['M5', 'M15', 'M30', 'H1', 'H4'];
  const details = {} as Record<TimeframeId, TimeframeTrendAnalysis>;

  let bullishCount = 0;
  let bearishCount = 0;
  let validTfCount = 0;

  for (const tf of timeframes) {
    const candles = candleBundles[tf] || [];
    const analysis = analyzeSingleTimeframe(candles, tf);
    details[tf] = analysis;

    if (analysis.trend !== 'INSUFFICIENT_DATA') {
      validTfCount++;
      if (analysis.trend === 'BULLISH') bullishCount++;
      if (analysis.trend === 'BEARISH') bearishCount++;
    }
  }

  if (validTfCount === 0) {
    return {
      symbol: normSym,
      evaluatedAt: new Date().toISOString(),
      alignmentState: 'DATA_LIMITED',
      alignmentScore: 0,
      htfTrend: 'NEUTRAL',
      ltfTrend: 'NEUTRAL',
      timeframeDetails: details,
      congruenceDescription: 'Insufficient multi-timeframe candles available for alignment analysis.',
    };
  }

  // HTF Trend: H4 and H1
  const h4Trend = details.H4?.trend;
  const h1Trend = details.H1?.trend;
  const isH4Bull = h4Trend === 'BULLISH';
  const isH4Bear = h4Trend === 'BEARISH';
  const isH1Bull = h1Trend === 'BULLISH';
  const isH1Bear = h1Trend === 'BEARISH';

  let htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (isH4Bull || (isH1Bull && !isH4Bear)) {
    htfTrend = 'BULLISH';
  } else if (isH4Bear || (isH1Bear && !isH4Bull)) {
    htfTrend = 'BEARISH';
  }

  // LTF Trend: M5 and M15
  const m15Trend = details.M15?.trend;
  const m5Trend = details.M5?.trend;
  const isM15Bull = m15Trend === 'BULLISH';
  const isM15Bear = m15Trend === 'BEARISH';
  const isM5Bull = m5Trend === 'BULLISH';
  const isM5Bear = m5Trend === 'BEARISH';

  let ltfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (isM15Bull || (isM5Bull && !isM15Bear)) {
    ltfTrend = 'BULLISH';
  } else if (isM15Bear || (isM5Bear && !isM15Bull)) {
    ltfTrend = 'BEARISH';
  }

  let alignmentState: MultiTfAlignmentState = 'CONFLICTED';
  let alignmentScore = 50;
  let congruenceDescription = '';

  if (bullishCount >= 4) {
    alignmentState = 'CONGRUENT_BULLISH';
    alignmentScore = Math.round((bullishCount / validTfCount) * 100);
    congruenceDescription = `Full bullish multi-timeframe alignment across ${bullishCount}/${validTfCount} timeframes.`;
  } else if (bearishCount >= 4) {
    alignmentState = 'CONGRUENT_BEARISH';
    alignmentScore = Math.round((bearishCount / validTfCount) * 100);
    congruenceDescription = `Full bearish multi-timeframe alignment across ${bearishCount}/${validTfCount} timeframes.`;
  } else if (htfTrend === 'BULLISH' && ltfTrend === 'BEARISH') {
    alignmentState = 'HTF_BULLISH_LTF_PULLBACK';
    alignmentScore = 75;
    congruenceDescription = 'Strategic HTF (H1/H4) trend is Bullish while LTF (M5/M15) is executing a counter-trend pullback into support.';
  } else if (htfTrend === 'BEARISH' && ltfTrend === 'BULLISH') {
    alignmentState = 'HTF_BEARISH_LTF_PULLBACK';
    alignmentScore = 75;
    congruenceDescription = 'Strategic HTF (H1/H4) trend is Bearish while LTF (M5/M15) is executing a counter-trend pullback into resistance.';
  } else if (bullishCount === 0 && bearishCount === 0) {
    alignmentState = 'RANGE_BOUND';
    alignmentScore = 40;
    congruenceDescription = 'All timeframes indicate range-bound consolidation with no directional trend.';
  } else {
    alignmentState = 'CONFLICTED';
    alignmentScore = 45;
    congruenceDescription = `Conflicted signals between timeframes (Bullish: ${bullishCount}, Bearish: ${bearishCount}).`;
  }

  return {
    symbol: normSym,
    evaluatedAt: new Date().toISOString(),
    alignmentState,
    alignmentScore,
    htfTrend,
    ltfTrend,
    timeframeDetails: details,
    congruenceDescription,
  };
}
