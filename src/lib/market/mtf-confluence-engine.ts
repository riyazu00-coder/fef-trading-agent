/**
 * FEF TRADING SOLUTIONS — STRUCTURE-AWARE MULTI-TIMEFRAME CONFLUENCE ENGINE
 * Phase 17: HTF/LTF Confluence Architecture
 *
 * Evaluates structural relationships across Higher Timeframe (H4/H1) and
 * Lower Timeframe (M15/M5) to identify high-probability institutional setups.
 *
 * Archetypes:
 * 1. TREND_PULLBACK_RETEST (Trend continuation after retracement into support/resistance/FVG/OB)
 * 2. ALIGNED_MOMENTUM_EXPANSION (Synchronized multi-timeframe directional impulse)
 * 3. COUNTER_TREND_EXHAUSTION (Key HTF liquidity sweep with LTF CHoCH structure shift)
 * 4. COMPRESSION_SQUEEZE (Volatility contraction across timeframes prior to expansion)
 */

import { OHLCCandle } from './canonical-market-snapshot';
import {
  evaluateMultiTimeframeDirection,
  MultiTimeframeDirectionReport
} from './multi-timeframe-direction-engine';
import { MarketStructure } from './market-structure-engine';

export type ConfluencePatternType =
  | 'TREND_PULLBACK_RETEST'
  | 'ALIGNED_MOMENTUM_EXPANSION'
  | 'COUNTER_TREND_EXHAUSTION'
  | 'COMPRESSION_SQUEEZE'
  | 'CONSOLIDATING_RANGE'
  | 'INSUFFICIENT_STRUCTURE';

export interface ConfluenceTargetLevels {
  optimalEntryZone: [number, number] | null;
  invalidationLevel: number | null;
  suggestedStopLoss: number | null;
  suggestedTakeProfit1: number | null;
  suggestedTakeProfit2: number | null;
  projectedRiskReward: number | null;
}

export interface MtfConfluenceResult {
  symbol: string;
  evaluatedAt: number;
  pattern: ConfluencePatternType;
  directionalBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confluenceScore: number; // 0 to 100
  isSetupActionable: boolean;
  levels: ConfluenceTargetLevels;
  rationale: string;
  htfSummary: string;
  ltfSummary: string;
  report: MultiTimeframeDirectionReport;
}

export class MtfConfluenceEngine {
  /**
   * Evaluates structural confluence between higher and lower timeframes
   */
  public evaluateConfluence(
    candleBundle: Record<string, OHLCCandle[]>,
    symbol: string,
    currentPrice: number,
    structure?: MarketStructure | null
  ): MtfConfluenceResult {
    const report = evaluateMultiTimeframeDirection(candleBundle, symbol, 'M15');
    const htfBias = report.higherTimeframeBias;
    const ltfMomentum = report.shortTermMomentum;
    const ltfStructure = report.intradayStructure;

    const m15Analysis = report.timeframes['M15'];
    const h1Analysis = report.timeframes['H1'];
    const htfAnalysis = report.timeframes['H4'] || h1Analysis;

    const atr = m15Analysis?.indicators.atr14 || (currentPrice * 0.003);

    let pattern: ConfluencePatternType = 'INSUFFICIENT_STRUCTURE';
    let directionalBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let confluenceScore = 0;
    let isSetupActionable = false;
    let rationale = '';

    const levels: ConfluenceTargetLevels = {
      optimalEntryZone: null,
      invalidationLevel: null,
      suggestedStopLoss: null,
      suggestedTakeProfit1: null,
      suggestedTakeProfit2: null,
      projectedRiskReward: null
    };

    // 1. Check for Aligned Momentum Expansion
    if (htfBias === 'BULLISH' && ltfMomentum === 'BULLISH' && ltfStructure === 'BULLISH') {
      pattern = 'ALIGNED_MOMENTUM_EXPANSION';
      directionalBias = 'BULLISH';
      confluenceScore = 88;
      isSetupActionable = true;
      rationale = 'Full bullish alignment across H4, H1, and M15 with active momentum expansion.';

      const sl = currentPrice - atr * 1.5;
      const tp1 = currentPrice + atr * 2.0;
      const tp2 = currentPrice + atr * 3.5;
      const risk = currentPrice - sl;
      const reward = tp2 - currentPrice;

      levels.optimalEntryZone = [Number((currentPrice - atr * 0.2).toFixed(5)), Number((currentPrice + atr * 0.2).toFixed(5))];
      levels.invalidationLevel = Number((sl - atr * 0.2).toFixed(5));
      levels.suggestedStopLoss = Number(sl.toFixed(5));
      levels.suggestedTakeProfit1 = Number(tp1.toFixed(5));
      levels.suggestedTakeProfit2 = Number(tp2.toFixed(5));
      levels.projectedRiskReward = risk > 0 ? Number((reward / risk).toFixed(2)) : 2.33;

    } else if (htfBias === 'BEARISH' && ltfMomentum === 'BEARISH' && ltfStructure === 'BEARISH') {
      pattern = 'ALIGNED_MOMENTUM_EXPANSION';
      directionalBias = 'BEARISH';
      confluenceScore = 88;
      isSetupActionable = true;
      rationale = 'Full bearish alignment across H4, H1, and M15 with active downward expansion.';

      const sl = currentPrice + atr * 1.5;
      const tp1 = currentPrice - atr * 2.0;
      const tp2 = currentPrice - atr * 3.5;
      const risk = sl - currentPrice;
      const reward = currentPrice - tp2;

      levels.optimalEntryZone = [Number((currentPrice - atr * 0.2).toFixed(5)), Number((currentPrice + atr * 0.2).toFixed(5))];
      levels.invalidationLevel = Number((sl + atr * 0.2).toFixed(5));
      levels.suggestedStopLoss = Number(sl.toFixed(5));
      levels.suggestedTakeProfit1 = Number(tp1.toFixed(5));
      levels.suggestedTakeProfit2 = Number(tp2.toFixed(5));
      levels.projectedRiskReward = risk > 0 ? Number((reward / risk).toFixed(2)) : 2.33;

    // 2. Check for Trend Pullback & Retest
    } else if (htfBias === 'BULLISH' && (ltfMomentum === 'BEARISH' || ltfMomentum === 'NEUTRAL')) {
      pattern = 'TREND_PULLBACK_RETEST';
      directionalBias = 'BULLISH';
      confluenceScore = 78;
      isSetupActionable = true;
      rationale = 'Higher timeframe Bullish trend currently undergoing healthy intraday retracement towards discount support.';

      // Support zone located below current price
      const entryLow = structure?.lastSwingLow || (currentPrice - atr * 1.0);
      const entryHigh = entryLow + atr * 0.5;
      const sl = entryLow - atr * 0.8;
      const tp1 = currentPrice + atr * 1.2;
      const tp2 = currentPrice + atr * 2.8;
      const risk = entryHigh - sl;
      const reward = tp2 - entryHigh;

      levels.optimalEntryZone = [Number(entryLow.toFixed(5)), Number(entryHigh.toFixed(5))];
      levels.invalidationLevel = Number(sl.toFixed(5));
      levels.suggestedStopLoss = Number(sl.toFixed(5));
      levels.suggestedTakeProfit1 = Number(tp1.toFixed(5));
      levels.suggestedTakeProfit2 = Number(tp2.toFixed(5));
      levels.projectedRiskReward = risk > 0 ? Number((reward / risk).toFixed(2)) : 2.15;

    } else if (htfBias === 'BEARISH' && (ltfMomentum === 'BULLISH' || ltfMomentum === 'NEUTRAL')) {
      pattern = 'TREND_PULLBACK_RETEST';
      directionalBias = 'BEARISH';
      confluenceScore = 78;
      isSetupActionable = true;
      rationale = 'Higher timeframe Bearish trend currently undergoing upward intraday pullback towards premium resistance.';

      const entryHigh = structure?.lastSwingHigh || (currentPrice + atr * 1.0);
      const entryLow = entryHigh - atr * 0.5;
      const sl = entryHigh + atr * 0.8;
      const tp1 = currentPrice - atr * 1.2;
      const tp2 = currentPrice - atr * 2.8;
      const risk = sl - entryLow;
      const reward = entryLow - tp2;

      levels.optimalEntryZone = [Number(entryLow.toFixed(5)), Number(entryHigh.toFixed(5))];
      levels.invalidationLevel = Number(sl.toFixed(5));
      levels.suggestedStopLoss = Number(sl.toFixed(5));
      levels.suggestedTakeProfit1 = Number(tp1.toFixed(5));
      levels.suggestedTakeProfit2 = Number(tp2.toFixed(5));
      levels.projectedRiskReward = risk > 0 ? Number((reward / risk).toFixed(2)) : 2.15;

    // 3. Volatility Compression / Squeeze
    } else if (m15Analysis?.indicators.momentumScore !== undefined && Math.abs(m15Analysis.indicators.momentumScore) < 15) {
      pattern = 'COMPRESSION_SQUEEZE';
      directionalBias = 'NEUTRAL';
      confluenceScore = 55;
      isSetupActionable = false;
      rationale = 'Range compression detected across timeframes. Volatility squeeze pending directional breakout.';

    // 4. Consolidating Range
    } else {
      pattern = 'CONSOLIDATING_RANGE';
      directionalBias = 'NEUTRAL';
      confluenceScore = 40;
      isSetupActionable = false;
      rationale = 'Mixed timeframe signals. Market structure ranging without dominant institutional consensus.';
    }

    const htfSummary = `${htfAnalysis?.timeframe || 'HTF'}: ${htfBias}`;
    const ltfSummary = `M15: ${m15Analysis?.timeframeTrend || 'NEUTRAL'} (Mom: ${ltfMomentum})`;

    return {
      symbol,
      evaluatedAt: Date.now(),
      pattern,
      directionalBias,
      confluenceScore,
      isSetupActionable,
      levels,
      rationale,
      htfSummary,
      ltfSummary,
      report
    };
  }
}

