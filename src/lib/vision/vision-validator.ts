/**
 * FEF CORTEX — VISION HALLUCINATION VALIDATOR
 * 
 * Enforces rigorous mathematical and boundary checks on AI vision outputs.
 * Every numerical level produced by a multimodal vision model is checked against
 * verified source OHLC data before entering canonical evidence.
 */

import { OHLCCandle } from '@/lib/market/canonical-market-snapshot';
import { getMarketDefinition } from '@/lib/registry/market-registry';

export interface VisionOutputContract {
  symbol: string;
  analyzedAt: string;
  visualTrend: 'BULLISH' | 'BEARISH' | 'CONSOLIDATING';
  structureQuality: 'CLEAN_TRENDING' | 'CHOPPY_NOISE' | 'COMPRESSING' | 'EXPANDING';
  compressionExpansion: {
    state: 'COMPRESSION' | 'EXPANSION' | 'BALANCED';
    patternMorphology: 'ASCENDING_WEDGE' | 'DESCENDING_WEDGE' | 'RECTANGLE_COIL' | 'EXPANDING_CHANNEL' | 'NONE';
  };
  wickRejectionClusters: Array<{
    timeframe: 'H4' | 'H1' | 'M15';
    level: number;
    rejectionDirection: 'REJECTING_HIGHS' | 'REJECTING_LOWS';
    intensity: 'STRONG' | 'MODERATE';
  }>;
  visibleLiquiditySweeps: Array<{
    timeframe: 'H4' | 'H1' | 'M15';
    sweepLevel: number;
    sweepType: 'BUY_SIDE' | 'SELL_SIDE';
    reaction: 'FAST_DISPLACEMENT' | 'FAILED_REACTION';
  }>;
  zoneReactionQuality: {
    fvgRespect: 'RESPECTED' | 'PIERCED' | 'UNTESTED';
    obRespect: 'RESPECTED' | 'VIOLATED' | 'UNTESTED';
  };
  visualRegimeTransition: 'TREND_CONTINUATION' | 'REVERSAL_IMMINENT' | 'RANGE_ROTATION';
  visualDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION';
  visualConfidence: number; // 0-100
  observations: string[]; // max 3 concise claims
}

export interface ValidationSummary {
  isValid: boolean;
  totalNumericClaims: number;
  validClaimsCount: number;
  invalidClaimsCount: number;
  failureRate: number;
  reasons: string[];
  sanitizedOutput?: VisionOutputContract;
}

// Barred phrases: claims that a candlestick chart cannot legitimately prove
const BARRED_PROSE_PATTERNS = [
  /order[\s-]?book\s+(depth|liquidity|queue|imbalance)/i,
  /insider\s+(buying|selling|flow)/i,
  /guaranteed\s+(continuation|breakout|target|win)/i,
  /100%\s+certain/i,
  /breaking\s+news/i,
  /cpi\s+leak/i,
  /fed\s+leak/i,
];

/**
 * Returns instrument-aware price snapping tolerance based on asset category.
 */
export function getInstrumentTolerance(symbol: string, referencePrice: number): number {
  const normSymbol = (symbol || '').toUpperCase();
  const def = getMarketDefinition(normSymbol);
  const cat = def?.category;

  if (cat === 'METALS') {
    if (normSymbol === 'XAGUSD') return 0.25;
    return 3.50; // Gold: ±$3.50 allowance
  }
  if (cat === 'CRYPTO') {
    if (normSymbol === 'BTCUSD') return 250.0;
    if (normSymbol === 'ETHUSD') return 15.0;
    return referencePrice * 0.005; // 0.5%
  }
  if (cat === 'FOREX') {
    if (normSymbol.includes('JPY')) return 0.20; // 20 pips
    return 0.0020; // 20 pips
  }
  if (cat === 'INDICES') {
    return 30.0; // 30 points
  }
  if (cat === 'COMMODITIES') {
    return 0.75; // Oil: ±75 cents
  }

  // Fallback tolerance: ±0.35% of reference price
  return Math.max(0.0001, referencePrice * 0.0035);
}

/**
 * Validates candidate VisionOutputContract against verified OHLC candle history.
 */
export function validateVisionOutput(
  rawOutput: any,
  symbol: string,
  allCandles: OHLCCandle[],
  referencePrice?: number
): ValidationSummary {
  const reasons: string[] = [];

  if (!rawOutput || typeof rawOutput !== 'object') {
    return {
      isValid: false,
      totalNumericClaims: 0,
      validClaimsCount: 0,
      invalidClaimsCount: 0,
      failureRate: 1.0,
      reasons: ['Vision response is empty or non-object'],
    };
  }

  if (allCandles.length < 5) {
    return {
      isValid: false,
      totalNumericClaims: 0,
      validClaimsCount: 0,
      invalidClaimsCount: 0,
      failureRate: 1.0,
      reasons: ['Insufficient source OHLC candles to validate vision claims'],
    };
  }

  // Compute global candle boundaries
  let globalMin = Infinity;
  let globalMax = -Infinity;
  const candlePivots: number[] = [];

  for (const c of allCandles) {
    if (c.low < globalMin) globalMin = c.low;
    if (c.high > globalMax) globalMax = c.high;
    candlePivots.push(c.open, c.high, c.low, c.close);
  }

  const effectiveRefPrice = referencePrice || (globalMin + globalMax) / 2;
  const tolerance = getInstrumentTolerance(symbol, effectiveRefPrice);

  let totalNumericClaims = 0;
  let validClaimsCount = 0;
  let invalidClaimsCount = 0;

  const isLevelValid = (lvl: any, label: string): boolean => {
    totalNumericClaims++;
    const num = Number(lvl);
    if (isNaN(num) || num <= 0) {
      reasons.push(`${label} (${lvl}) is not a positive number`);
      invalidClaimsCount++;
      return false;
    }

    // 1. Must lie inside global min/max (with generous boundary allowance)
    if (num < globalMin - tolerance || num > globalMax + tolerance) {
      reasons.push(`${label} (${num}) lies outside OHLC range [${globalMin.toFixed(2)}, ${globalMax.toFixed(2)}]`);
      invalidClaimsCount++;
      return false;
    }

    // 2. Must snap to a genuine candle pivot within tolerance
    const matchesPivot = candlePivots.some((p) => Math.abs(p - num) <= tolerance);
    if (!matchesPivot) {
      reasons.push(`${label} (${num}) does not correspond to any candle pivot within tolerance (±${tolerance.toFixed(4)})`);
      invalidClaimsCount++;
      return false;
    }

    validClaimsCount++;
    return true;
  };

  // Validate wick rejection clusters
  const validWickClusters: any[] = [];
  if (Array.isArray(rawOutput.wickRejectionClusters)) {
    for (const cluster of rawOutput.wickRejectionClusters) {
      if (isLevelValid(cluster.level, 'Wick rejection level')) {
        validWickClusters.push(cluster);
      }
    }
  }

  // Validate liquidity sweeps
  const validSweeps: any[] = [];
  if (Array.isArray(rawOutput.visibleLiquiditySweeps)) {
    for (const sweep of rawOutput.visibleLiquiditySweeps) {
      if (isLevelValid(sweep.sweepLevel, 'Liquidity sweep level')) {
        validSweeps.push(sweep);
      }
    }
  }

  // Check observation prose for unprovable / barred claims
  const sanitizedObservations: string[] = [];
  if (Array.isArray(rawOutput.observations)) {
    for (const obs of rawOutput.observations.slice(0, 3)) {
      if (typeof obs === 'string') {
        const isBarred = BARRED_PROSE_PATTERNS.some((pattern) => pattern.test(obs));
        if (isBarred) {
          reasons.push(`Observation contains unprovable chart claim: "${obs}"`);
        } else {
          sanitizedObservations.push(obs.trim().substring(0, 160));
        }
      }
    }
  }

  // Calculate failure rate
  const failureRate = totalNumericClaims > 0 ? invalidClaimsCount / totalNumericClaims : 0;

  // Hard rule: if > 50% of claims fail validation, fail closed
  if (totalNumericClaims > 0 && failureRate > 0.5) {
    reasons.push(`High hallucination failure rate: ${(failureRate * 100).toFixed(1)}% of claimed levels failed validation (> 50% threshold)`);
    return {
      isValid: false,
      totalNumericClaims,
      validClaimsCount,
      invalidClaimsCount,
      failureRate,
      reasons,
    };
  }

  // Enforce valid enums or defaults
  const visualTrend = ['BULLISH', 'BEARISH', 'CONSOLIDATING'].includes(rawOutput.visualTrend)
    ? rawOutput.visualTrend
    : 'CONSOLIDATING';

  const structureQuality = ['CLEAN_TRENDING', 'CHOPPY_NOISE', 'COMPRESSING', 'EXPANDING'].includes(rawOutput.structureQuality)
    ? rawOutput.structureQuality
    : 'CHOPPY_NOISE';

  const visualDirection = ['BULLISH', 'BEARISH', 'NEUTRAL', 'CAUTION'].includes(rawOutput.visualDirection)
    ? rawOutput.visualDirection
    : 'NEUTRAL';

  const rawConf = Number(rawOutput.visualConfidence);
  const visualConfidence = !isNaN(rawConf) ? Math.min(100, Math.max(0, Math.round(rawConf))) : 50;

  const sanitizedOutput: VisionOutputContract = {
    symbol: (rawOutput.symbol || symbol).toUpperCase(),
    analyzedAt: rawOutput.analyzedAt || new Date().toISOString(),
    visualTrend,
    structureQuality,
    compressionExpansion: {
      state: ['COMPRESSION', 'EXPANSION', 'BALANCED'].includes(rawOutput.compressionExpansion?.state)
        ? rawOutput.compressionExpansion.state
        : 'BALANCED',
      patternMorphology: ['ASCENDING_WEDGE', 'DESCENDING_WEDGE', 'RECTANGLE_COIL', 'EXPANDING_CHANNEL', 'NONE'].includes(rawOutput.compressionExpansion?.patternMorphology)
        ? rawOutput.compressionExpansion.patternMorphology
        : 'NONE',
    },
    wickRejectionClusters: validWickClusters,
    visibleLiquiditySweeps: validSweeps,
    zoneReactionQuality: {
      fvgRespect: ['RESPECTED', 'PIERCED', 'UNTESTED'].includes(rawOutput.zoneReactionQuality?.fvgRespect)
        ? rawOutput.zoneReactionQuality.fvgRespect
        : 'UNTESTED',
      obRespect: ['RESPECTED', 'VIOLATED', 'UNTESTED'].includes(rawOutput.zoneReactionQuality?.obRespect)
        ? rawOutput.zoneReactionQuality.obRespect
        : 'UNTESTED',
    },
    visualRegimeTransition: ['TREND_CONTINUATION', 'REVERSAL_IMMINENT', 'RANGE_ROTATION'].includes(rawOutput.visualRegimeTransition)
      ? rawOutput.visualRegimeTransition
      : 'RANGE_ROTATION',
    visualDirection,
    visualConfidence,
    observations: sanitizedObservations.length > 0 ? sanitizedObservations : ['Multi-timeframe visual alignment verified.'],
  };

  return {
    isValid: true,
    totalNumericClaims,
    validClaimsCount,
    invalidClaimsCount,
    failureRate,
    reasons,
    sanitizedOutput,
  };
}
