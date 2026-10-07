/**
 * FEF CORTEX — CANDLE-CLOSE TRIGGER ENGINE
 * M15/M30 Trade Opportunity Recovery Foundation
 *
 * Rules:
 * 1. Zero synthetic data: all calculations use verified OHLC only.
 * 2. Closed candle confirmation: intrabar wicks are strictly non-confirming.
 * 3. Evidence, not execution: candle-close confirmation produces structured analytical evidence,
 *    never raw execution commands.
 * 4. Fail-closed: missing, corrupted, or stale candles return unconfirmed trigger evidence.
 */

import { OHLCCandle } from '../market/canonical-market-snapshot';
import { EvidenceClassification } from '../evidence/agent-evidence';
import { MarketStructure } from '../market/market-structure-engine';
import { CandleCloseTriggerEvidence, TriggerDirection, TriggerType } from './trigger-types';

export interface CandleCloseTriggerInputs {
  symbol: string;
  candlesM15?: OHLCCandle[];
  candlesM30?: OHLCCandle[];
  currentPrice: number;
  structure?: MarketStructure | null;
  htfBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DATA_LIMITED';
  provenance?: EvidenceClassification;
  provider?: string;
  currentTimeMs?: number;
  // Optional flag to simulate checking an in-progress bar's intrabar wick vs closed candle
  isInProgressIntraBar?: boolean;
}

export const TIMEFRAME_MAX_AGE_MS: Record<string, number> = {
  M5: 15 * 60 * 1000,      // 15 mins
  M15: 45 * 60 * 1000,     // 45 mins
  M30: 90 * 60 * 1000,     // 90 mins
  H1: 180 * 60 * 1000,     // 3 hours
  H4: 12 * 60 * 60 * 1000, // 12 hours
};

export class CandleCloseTriggerEngine {
  /**
   * Deterministically evaluates whether a qualifying M15 or M30 closed candle
   * confirms a structural breakout or swing trigger.
   */
  public static evaluateTrigger(inputs: CandleCloseTriggerInputs): CandleCloseTriggerEvidence {
    const {
      symbol,
      candlesM15,
      candlesM30,
      currentPrice,
      structure,
      htfBias = 'NEUTRAL',
      provenance = 'UNAVAILABLE',
      currentTimeMs = Date.now(),
      isInProgressIntraBar = false,
    } = inputs;

    // Fail-Closed Guard 1: Missing candle series
    const targetTf: 'M15' | 'M30' = (candlesM15 && candlesM15.length >= 10) ? 'M15' : 'M30';
    const targetCandles = targetTf === 'M15' ? candlesM15 : candlesM30;

    if (!targetCandles || !Array.isArray(targetCandles) || targetCandles.length < 10) {
      return {
        direction: 'NEUTRAL',
        triggerType: 'NONE',
        triggerTimeframe: targetTf,
        triggerLevel: 0,
        triggerCandleTimestamp: 0,
        confirmationClose: 0,
        priorHigh: 0,
        priorLow: 0,
        structureState: 'INSUFFICIENT_CANDLES',
        freshness: 'UNAVAILABLE',
        provenance,
        confidenceContribution: 0,
        reason: `${targetTf} candle history is missing or insufficient (< 10 bars). Trigger fails closed.`,
        isConfirmed: false,
        rejectionReason: 'INSUFFICIENT_CANDLES',
      };
    }

    // Inspect the latest candle in the series
    const latestCandle = targetCandles[targetCandles.length - 1];
    const candleAgeMs = Math.max(0, currentTimeMs - latestCandle.timestamp);
    const maxAllowedAgeMs = TIMEFRAME_MAX_AGE_MS[targetTf] || 45 * 60 * 1000;

    // Fail-Closed Guard 2: Stale candles
    if (candleAgeMs > maxAllowedAgeMs) {
      return {
        direction: 'NEUTRAL',
        triggerType: 'NONE',
        triggerTimeframe: targetTf,
        triggerLevel: 0,
        triggerCandleTimestamp: latestCandle.timestamp,
        confirmationClose: latestCandle.close,
        priorHigh: 0,
        priorLow: 0,
        structureState: 'STALE_DATA',
        freshness: 'STALE',
        provenance,
        confidenceContribution: 0,
        reason: `${targetTf} candles are stale (${Math.round(candleAgeMs / 60000)}m old > limit ${Math.round(maxAllowedAgeMs / 60000)}m). Trigger fails closed.`,
        isConfirmed: false,
        rejectionReason: 'STALE_CANDLES',
      };
    }

    // Fail-Closed Guard 3: Intrabar wick protection
    // If the latest candle is explicitly marked as an incomplete in-progress intra-bar,
    // wicks MUST NOT be counted as close confirmation.
    if (isInProgressIntraBar) {
      return {
        direction: 'NEUTRAL',
        triggerType: 'NONE',
        triggerTimeframe: targetTf,
        triggerLevel: 0,
        triggerCandleTimestamp: latestCandle.timestamp,
        confirmationClose: latestCandle.close,
        priorHigh: 0,
        priorLow: 0,
        structureState: 'INTRABAR_IN_PROGRESS',
        freshness: 'REALTIME',
        provenance,
        confidenceContribution: 0,
        reason: 'Current bar is still forming. Intrabar wicks are strictly non-confirming; awaiting candle close.',
        isConfirmed: false,
        rejectionReason: 'INTRABAR_WICK_NOT_CONFIRMED',
      };
    }

    // Determine relevant prior swing/bar reference from previous completed candles
    const priorCandles = targetCandles.slice(0, targetCandles.length - 1);
    const priorHigh = Math.max(...priorCandles.slice(-5).map((c) => c.high));
    const priorLow = Math.min(...priorCandles.slice(-5).map((c) => c.low));

    // Structural trigger level from market structure if available
    let structuralTriggerHigh = priorHigh;
    let structuralTriggerLow = priorLow;
    let triggerType: TriggerType = 'SWING_CLOSE';

    if (structure && structure.bos && structure.bos.length > 0) {
      const recentBos = structure.bos[structure.bos.length - 1];
      if (recentBos.type === 'BOS_HIGH') {
        structuralTriggerHigh = recentBos.price;
        triggerType = 'BREAK_OF_STRUCTURE';
      } else if (recentBos.type === 'BOS_LOW') {
        structuralTriggerLow = recentBos.price;
        triggerType = 'BREAK_OF_STRUCTURE';
      }
    } else if (structure && structure.lastSwingHigh && structure.lastSwingLow) {
      structuralTriggerHigh = structure.lastSwingHigh;
      structuralTriggerLow = structure.lastSwingLow;
      triggerType = 'SWING_CLOSE';
    }

    const closePrice = latestCandle.close;

    // 1. BULLISH TRIGGER EVALUATION
    // Criterion A: Closed candle strictly above prior high / structural trigger level
    // Criterion B: High-wick alone does NOT count (wick rejection test: high > level but close <= level fails)
    const isBullishCloseBreakout = closePrice > structuralTriggerHigh;
    const isBullishWickOnly = latestCandle.high > structuralTriggerHigh && closePrice <= structuralTriggerHigh;

    if (isBullishCloseBreakout) {
      // HTF Context integration: If HTF context is BEARISH, we do not suppress the trigger completely,
      // but note the HTF conflict and calibrate confidence contribution
      const htfConflict = htfBias === 'BEARISH';
      const confidenceContribution = htfConflict ? 55 : 85;

      return {
        direction: 'BUY',
        triggerType,
        triggerTimeframe: targetTf,
        triggerLevel: structuralTriggerHigh,
        triggerCandleTimestamp: latestCandle.timestamp,
        confirmationClose: closePrice,
        priorHigh: structuralTriggerHigh,
        priorLow: structuralTriggerLow,
        structureState: structure ? structure.trend : 'BULLISH_CONFIRMED',
        freshness: 'FRESH',
        provenance,
        confidenceContribution,
        reason: `${targetTf} candle closed at ${closePrice.toFixed(2)} strictly above trigger level ${structuralTriggerHigh.toFixed(2)} (${triggerType})${htfConflict ? ' [HTF H1 BEARISH CONTEXT CONFLICT]' : ''}.`,
        isConfirmed: true,
      };
    }

    if (isBullishWickOnly) {
      return {
        direction: 'NEUTRAL',
        triggerType: 'NONE',
        triggerTimeframe: targetTf,
        triggerLevel: structuralTriggerHigh,
        triggerCandleTimestamp: latestCandle.timestamp,
        confirmationClose: closePrice,
        priorHigh: structuralTriggerHigh,
        priorLow: structuralTriggerLow,
        structureState: 'WICK_REJECTION',
        freshness: 'FRESH',
        provenance,
        confidenceContribution: 0,
        reason: `${targetTf} wick reached ${latestCandle.high.toFixed(2)} but closed below trigger level ${structuralTriggerHigh.toFixed(2)} (close: ${closePrice.toFixed(2)}). Intrabar wick does not count as close confirmation.`,
        isConfirmed: false,
        rejectionReason: 'INTRABAR_WICK_REJECTION',
      };
    }

    // 2. BEARISH TRIGGER EVALUATION
    // Criterion A: Closed candle strictly below prior low / structural trigger level
    // Criterion B: Low-wick alone does NOT count (wick rejection test: low < level but close >= level fails)
    const isBearishCloseBreakdown = closePrice < structuralTriggerLow;
    const isBearishWickOnly = latestCandle.low < structuralTriggerLow && closePrice >= structuralTriggerLow;

    if (isBearishCloseBreakdown) {
      const htfConflict = htfBias === 'BULLISH';
      const confidenceContribution = htfConflict ? 55 : 85;

      return {
        direction: 'SELL',
        triggerType,
        triggerTimeframe: targetTf,
        triggerLevel: structuralTriggerLow,
        triggerCandleTimestamp: latestCandle.timestamp,
        confirmationClose: closePrice,
        priorHigh: structuralTriggerHigh,
        priorLow: structuralTriggerLow,
        structureState: structure ? structure.trend : 'BEARISH_CONFIRMED',
        freshness: 'FRESH',
        provenance,
        confidenceContribution,
        reason: `${targetTf} candle closed at ${closePrice.toFixed(2)} strictly below trigger level ${structuralTriggerLow.toFixed(2)} (${triggerType})${htfConflict ? ' [HTF H1 BULLISH CONTEXT CONFLICT]' : ''}.`,
        isConfirmed: true,
      };
    }

    if (isBearishWickOnly) {
      return {
        direction: 'NEUTRAL',
        triggerType: 'NONE',
        triggerTimeframe: targetTf,
        triggerLevel: structuralTriggerLow,
        triggerCandleTimestamp: latestCandle.timestamp,
        confirmationClose: closePrice,
        priorHigh: structuralTriggerHigh,
        priorLow: structuralTriggerLow,
        structureState: 'WICK_REJECTION',
        freshness: 'FRESH',
        provenance,
        confidenceContribution: 0,
        reason: `${targetTf} wick reached ${latestCandle.low.toFixed(2)} but closed above trigger level ${structuralTriggerLow.toFixed(2)} (close: ${closePrice.toFixed(2)}). Intrabar wick does not count as close confirmation.`,
        isConfirmed: false,
        rejectionReason: 'INTRABAR_WICK_REJECTION',
      };
    }

    // Neither breakout nor breakdown -> WAITING for close beyond trigger levels
    return {
      direction: 'NEUTRAL',
      triggerType: 'NONE',
      triggerTimeframe: targetTf,
      triggerLevel: structure?.trend === 'BEARISH' ? structuralTriggerLow : structuralTriggerHigh,
      triggerCandleTimestamp: latestCandle.timestamp,
      confirmationClose: closePrice,
      priorHigh: structuralTriggerHigh,
      priorLow: structuralTriggerLow,
      structureState: structure?.trend || 'RANGING',
      freshness: 'FRESH',
      provenance,
      confidenceContribution: 0,
      reason: `Awaiting qualifying ${targetTf} candle close outside range [${structuralTriggerLow.toFixed(2)} - ${structuralTriggerHigh.toFixed(2)}].`,
      isConfirmed: false,
      rejectionReason: 'AWAITING_BREAKOUT_CLOSE',
    };
  }
}

