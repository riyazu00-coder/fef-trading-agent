/**
 * FEF TRADING SOLUTIONS — STRUCTURE-DERIVED TRADE BLUEPRINT ENGINE
 * Phase 2D: Truthful Live Intelligence Foundation
 *
 * Generates trade blueprints (entry zone, SL, TP1, TP2, TP3) exclusively from
 * verified market structure. No hardcoded price offsets. No arbitrary constants.
 *
 * Blueprint provenance: VERIFIED only when all levels originate from detected structure.
 * Unverified blueprints are strictly ineligible for execution.
 */

import { MarketStructure, StructureLevel, FVG, OrderBlock } from '../market/market-structure-engine';
import { OHLCCandle } from '../market/canonical-market-snapshot';
import { calculateATR } from '../market/canonical-market-snapshot';

export type SetupLifecycleState =
  | 'FORMING'
  | 'WATCH'
  | 'TRIGGER_READY'
  | 'ACTIONABLE'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'DATA_LIMITED';

export type BlueprintDirection = 'BUY' | 'SELL';
export type BlueprintCandleSource =
  | 'MT5_BROKER_OHLC'
  | 'INDEPENDENT_VERIFIED_OHLC'
  | 'INDEPENDENT_REFERENCE_OHLC';

export const VALID_BLUEPRINT_CANDLE_SOURCES: Set<BlueprintCandleSource> = new Set<BlueprintCandleSource>([
  'MT5_BROKER_OHLC',
  'INDEPENDENT_VERIFIED_OHLC',
  'INDEPENDENT_REFERENCE_OHLC'
]);

export function isValidBlueprintCandleSource(source: any): source is BlueprintCandleSource {
  return typeof source === 'string' && VALID_BLUEPRINT_CANDLE_SOURCES.has(source as BlueprintCandleSource);
}

export interface LevelWithProvenance {
  price: number;
  reason: string;
  source: BlueprintCandleSource;
  timeframe: string;
  structureType: string;
  candleTimestamp: number;
  classification: 'DERIVED_FROM_VERIFIED';
}

export interface TradeBlueprint {
  setupId: string;
  createdAt: number;
  updatedAt: number;
  symbol: string;
  direction: BlueprintDirection;

  // Market evidence chronology: timestamp of latest candle analyzed at construction
  latestAnalyzedCandleTimestamp?: number;

  // All levels derived from real structure — never hardcoded offsets
  entryZoneHigh: LevelWithProvenance;
  entryZoneLow: LevelWithProvenance;
  invalidation: LevelWithProvenance;   // SL basis
  sl: LevelWithProvenance;             // sl = invalidation + ATR buffer
  tp1: LevelWithProvenance;            // Mandatory — nearest structural target
  tp2?: LevelWithProvenance;           // Optional — only if genuine structure warrants it
  tp3?: LevelWithProvenance;           // Optional — only if genuine structure warrants it

  rrRatio: string | null;             // null if TP1 not yet resolved
  expiry: number;                     // Unix ms — fail-safe maximum safety ceiling
  state: SetupLifecycleState;

  // Provenance guarantee
  blueprintProvenanceVerified: boolean;  // true only if ALL levels from verified structure
  provenanceNote: string;
}

/**
 * Institutional risk and structural stop-loss geometry policy.
 *
 * Enforces architectural guardrails to prevent distorted trade blueprints:
 * 1. atrBufferMultiplier: Volatility cushion outside confirmed structural invalidation (default: 0.5x ATR).
 * 2. maxRiskAtrMultiplier: Maximum acceptable total risk distance (entry to SL) expressed as an ATR multiple.
 *    Rejects setups where the only confirmed swing is extraordinarily distant (e.g. monotonic run with only
 *    an anchor swing from 50 bars ago). Default: 4.5x ATR.
 * 3. minRewardRiskRatio: Minimum acceptable reward-to-risk ratio (TP1 distance / SL risk distance).
 *    Rejects deformed geometries risking multiples of the potential reward (e.g. 1:0.10). Default: 0.40.
 */
export interface StopLossGeometryPolicy {
  atrBufferMultiplier: number;
  maxRiskAtrMultiplier: number;
  minRewardRiskRatio: number;
}

export const CANONICAL_SL_POLICY: StopLossGeometryPolicy = {
  atrBufferMultiplier: 0.5,
  maxRiskAtrMultiplier: 4.5,
  minRewardRiskRatio: 0.40,
};

export interface BlueprintRiskGeometryEvaluation {
  isAcceptable: boolean;
  rejectionReason?: string;
  riskDistance: number;
  rewardDistance: number;
  riskAtrMultiple: number;
  rrRatio: number;
}

/**
 * Validates the geometric integrity and risk-reward profile of a proposed blueprint.
 * Enforces:
 *   - Strict directional ordering:
 *       BUY:  SL < Invalidation < EntryRef < TP1
 *       SELL: TP1 < EntryRef < Invalidation < SL
 *   - Volatility sanity: total risk distance must not exceed maxRiskAtrMultiplier of ATR.
 *   - Economic sanity: reward-to-risk ratio must meet minRewardRiskRatio.
 */
export function evaluateBlueprintRiskGeometry(
  direction: BlueprintDirection,
  entryRef: number,
  slPrice: number,
  invalidationPrice: number,
  tp1Price: number,
  atr: number,
  policy: StopLossGeometryPolicy = CANONICAL_SL_POLICY
): BlueprintRiskGeometryEvaluation {
  if (direction === 'BUY') {
    if (!(slPrice < invalidationPrice)) {
      return {
        isAcceptable: false,
        rejectionReason: `BUY SL (${slPrice}) must be strictly below structural invalidation (${invalidationPrice})`,
        riskDistance: 0, rewardDistance: 0, riskAtrMultiple: 0, rrRatio: 0
      };
    }
    if (!(invalidationPrice < entryRef)) {
      return {
        isAcceptable: false,
        rejectionReason: `BUY structural invalidation (${invalidationPrice}) must be strictly below entry reference (${entryRef})`,
        riskDistance: 0, rewardDistance: 0, riskAtrMultiple: 0, rrRatio: 0
      };
    }
    if (!(entryRef < tp1Price)) {
      return {
        isAcceptable: false,
        rejectionReason: `BUY entry reference (${entryRef}) must be strictly below TP1 (${tp1Price})`,
        riskDistance: 0, rewardDistance: 0, riskAtrMultiple: 0, rrRatio: 0
      };
    }
  } else {
    if (!(tp1Price < entryRef)) {
      return {
        isAcceptable: false,
        rejectionReason: `SELL TP1 (${tp1Price}) must be strictly below entry reference (${entryRef})`,
        riskDistance: 0, rewardDistance: 0, riskAtrMultiple: 0, rrRatio: 0
      };
    }
    if (!(entryRef < invalidationPrice)) {
      return {
        isAcceptable: false,
        rejectionReason: `SELL entry reference (${entryRef}) must be strictly below structural invalidation (${invalidationPrice})`,
        riskDistance: 0, rewardDistance: 0, riskAtrMultiple: 0, rrRatio: 0
      };
    }
    if (!(invalidationPrice < slPrice)) {
      return {
        isAcceptable: false,
        rejectionReason: `SELL structural invalidation (${invalidationPrice}) must be strictly below SL (${slPrice})`,
        riskDistance: 0, rewardDistance: 0, riskAtrMultiple: 0, rrRatio: 0
      };
    }
  }

  const riskDistance = Math.abs(entryRef - slPrice);
  const rewardDistance = Math.abs(tp1Price - entryRef);

  if (riskDistance <= 0 || rewardDistance <= 0) {
    return {
      isAcceptable: false,
      rejectionReason: 'Risk distance and reward distance must be positive',
      riskDistance, rewardDistance, riskAtrMultiple: 0, rrRatio: 0
    };
  }

  const riskAtrMultiple = atr > 0 ? riskDistance / atr : Infinity;
  const rrRatio = rewardDistance / riskDistance;

  if (riskAtrMultiple > policy.maxRiskAtrMultiplier) {
    return {
      isAcceptable: false,
      rejectionReason: `Risk distance (${riskAtrMultiple.toFixed(2)}x ATR) exceeds maximum allowed multiple (${policy.maxRiskAtrMultiplier}x ATR)`,
      riskDistance, rewardDistance, riskAtrMultiple, rrRatio
    };
  }

  if (rrRatio < policy.minRewardRiskRatio) {
    return {
      isAcceptable: false,
      rejectionReason: `Reward-to-risk ratio (1:${rrRatio.toFixed(2)}) is below minimum threshold (1:${policy.minRewardRiskRatio.toFixed(2)})`,
      riskDistance, rewardDistance, riskAtrMultiple, rrRatio
    };
  }

  return {
    isAcceptable: true,
    riskDistance,
    rewardDistance,
    riskAtrMultiple,
    rrRatio
  };
}

/**
 * Maximum fail-safe blueprint cache lifetime ceiling (4 hours).
 *
 * CRITICAL ARCHITECTURAL GUARANTEE:
 * A blueprint's live validity is governed primarily by market structure freshness,
 * directional integrity, and structural invalidation levels.
 * This 4-hour ceiling serves solely as a fail-safe upper bound for memory hygiene
 * and stale-object cleanup; TTL alone NEVER proves that a blueprint remains valid.
 */
export const MAXIMUM_BLUEPRINT_LIFETIME_MS = 4 * 60 * 60 * 1000;  // 4 hours fail-safe ceiling
export const EXPIRY_MS = MAXIMUM_BLUEPRINT_LIFETIME_MS; // Backward compatibility alias

export interface BlueprintMarketCompatibilityResult {
  isCompatible: boolean;
  reason?: string;
  shouldInvalidate?: boolean;
}

/**
 * Evaluates whether an existing blueprint remains structurally compatible with current verified market data.
 *
 * Implements fail-closed structural revalidation:
 * 1. Context identity (symbol, timeframe, source).
 * 2. Missing or unverified market structure (fail closed).
 * 3. Immediate structural invalidation breach:
 *    - Current price or any genuinely subsequent verified candle broke invalidation price.
 *    - Invalidation swing broken by opposing structure.
 * 4. Target completion: TP1 reached exhausts the setup.
 * 5. Structural trend reversal (BUY in BEARISH, SELL in BULLISH).
 * 6. Fail-safe maximum lifetime ceiling (MAXIMUM_BLUEPRINT_LIFETIME_MS).
 */
export function evaluateBlueprintMarketCompatibility(
  bp: TradeBlueprint,
  currentPrice: number,
  structure: MarketStructure | null | undefined,
  candles?: OHLCCandle[]
): BlueprintMarketCompatibilityResult {
  if (!bp) {
    return { isCompatible: false, reason: 'Blueprint is null or undefined' };
  }

  // 1. Fail-safe maximum lifetime ceiling (4h hygiene ceiling only - TTL never proves market validity)
  const now = Date.now();
  if (now > bp.expiry) {
    return { isCompatible: false, reason: 'Blueprint exceeded maximum safety lifetime ceiling (expired)' };
  }

  // 2. Terminal state check (INVALIDATED / EXPIRED are terminal and irreversible)
  if (bp.state === 'INVALIDATED' || bp.state === 'EXPIRED') {
    return { isCompatible: false, shouldInvalidate: bp.state === 'INVALIDATED', reason: `Blueprint is in terminal state: ${bp.state}` };
  }

  // 3. Strict Context Identity
  if (structure) {
    if ((structure.symbol || '').toUpperCase() !== (bp.symbol || '').toUpperCase()) {
      return { isCompatible: false, reason: `Symbol mismatch: structure is ${structure.symbol}, blueprint is ${bp.symbol}` };
    }
    if ((structure.timeframe || '').toUpperCase() !== (bp.entryZoneHigh.timeframe || '').toUpperCase()) {
      return { isCompatible: false, reason: `Timeframe mismatch: structure is ${structure.timeframe}, blueprint is ${bp.entryZoneHigh.timeframe}` };
    }
    if (structure.source !== bp.entryZoneHigh.source) {
      return { isCompatible: false, reason: `Source provenance mismatch: structure is ${structure.source}, blueprint is ${bp.entryZoneHigh.source}` };
    }
  }

  // 4. Missing or insufficient structure (Fail-Closed)
  if (!structure || structure.trend === 'INSUFFICIENT_DATA' || structure.candleCount < 10) {
    return { isCompatible: false, reason: 'Market structure is missing, insufficient, or unverified (fail closed)' };
  }

  // 5. Immediate Price & Invalidation Breach
  if (bp.direction === 'BUY') {
    // BUY invalidation: price at or below invalidation or SL
    if (currentPrice <= bp.invalidation.price || currentPrice < bp.sl.price) {
      return { isCompatible: false, shouldInvalidate: true, reason: `Current price (${currentPrice}) breached BUY invalidation (${bp.invalidation.price})` };
    }
    // Target TP1 reached: setup fulfilled
    if (currentPrice >= bp.tp1.price) {
      return { isCompatible: false, reason: `BUY target TP1 (${bp.tp1.price}) reached by price (${currentPrice})` };
    }
  } else if (bp.direction === 'SELL') {
    // SELL invalidation: price at or above invalidation or SL
    if (currentPrice >= bp.invalidation.price || currentPrice > bp.sl.price) {
      return { isCompatible: false, shouldInvalidate: true, reason: `Current price (${currentPrice}) breached SELL invalidation (${bp.invalidation.price})` };
    }
    // Target TP1 reached: setup fulfilled
    if (currentPrice <= bp.tp1.price) {
      return { isCompatible: false, reason: `SELL target TP1 (${bp.tp1.price}) reached by price (${currentPrice})` };
    }
  }

  // 6. Candle Extremum Invalidation Check (Did any genuinely subsequent candle violate invalidation?)
  // Market evidence chronology: only inspect candles strictly subsequent to baseline market evidence.
  // Originating candles used to construct the blueprint must NEVER retrospectively invalidate it.
  const baselineMarketTs = bp.latestAnalyzedCandleTimestamp ?? Math.max(
    bp.entryZoneHigh?.candleTimestamp || 0,
    bp.entryZoneLow?.candleTimestamp || 0,
    bp.invalidation?.candleTimestamp || 0,
    bp.sl?.candleTimestamp || 0,
    bp.tp1?.candleTimestamp || 0
  );

  if (candles && Array.isArray(candles) && candles.length > 0) {
    const subsequentCandles = baselineMarketTs > 0
      ? candles.filter(c => c.timestamp > baselineMarketTs)
      : candles.filter(c => c.timestamp > bp.createdAt);

    for (const c of subsequentCandles) {
      if (bp.direction === 'BUY' && (c.low <= bp.invalidation.price || c.low <= bp.sl.price)) {
        return { isCompatible: false, shouldInvalidate: true, reason: `Subsequent candle at ${c.timestamp} low (${c.low}) breached BUY invalidation (${bp.invalidation.price})` };
      }
      if (bp.direction === 'SELL' && (c.high >= bp.invalidation.price || c.high >= bp.sl.price)) {
        return { isCompatible: false, shouldInvalidate: true, reason: `Subsequent candle at ${c.timestamp} high (${c.high}) breached SELL invalidation (${bp.invalidation.price})` };
      }
    }
  }

  // 7. Trend Directional Reversal (BULLISH vs BEARISH)
  if (bp.direction === 'BUY' && structure.trend === 'BEARISH') {
    return { isCompatible: false, shouldInvalidate: true, reason: 'Market trend flipped to BEARISH against BUY setup' };
  }
  if (bp.direction === 'SELL' && structure.trend === 'BULLISH') {
    return { isCompatible: false, shouldInvalidate: true, reason: 'Market trend flipped to BULLISH against SELL setup' };
  }

  // 8. Opposing Structural Events (CHOCH / BOS)
  if (bp.direction === 'BUY') {
    const opposingChoch = structure.choch.find(c =>
      c.type === 'CHOCH_LOW' &&
      c.price <= bp.invalidation.price &&
      (baselineMarketTs > 0 ? c.candleTimestamp > baselineMarketTs : true)
    );
    if (opposingChoch) {
      return { isCompatible: false, shouldInvalidate: true, reason: `Bearish CHOCH detected at ${opposingChoch.price} breaking BUY structure` };
    }
    const opposingBos = structure.bos.find(b =>
      b.type === 'BOS_LOW' &&
      b.price <= bp.invalidation.price &&
      (baselineMarketTs > 0 ? b.candleTimestamp > baselineMarketTs : true)
    );
    if (opposingBos) {
      return { isCompatible: false, shouldInvalidate: true, reason: `Bearish BOS detected at ${opposingBos.price} breaking BUY structure` };
    }
  } else if (bp.direction === 'SELL') {
    const opposingChoch = structure.choch.find(c =>
      c.type === 'CHOCH_HIGH' &&
      c.price >= bp.invalidation.price &&
      (baselineMarketTs > 0 ? c.candleTimestamp > baselineMarketTs : true)
    );
    if (opposingChoch) {
      return { isCompatible: false, shouldInvalidate: true, reason: `Bullish CHOCH detected at ${opposingChoch.price} breaking SELL structure` };
    }
    const opposingBos = structure.bos.find(b =>
      b.type === 'BOS_HIGH' &&
      b.price >= bp.invalidation.price &&
      (baselineMarketTs > 0 ? b.candleTimestamp > baselineMarketTs : true)
    );
    if (opposingBos) {
      return { isCompatible: false, shouldInvalidate: true, reason: `Bullish BOS detected at ${opposingBos.price} breaking SELL structure` };
    }
  }

  return { isCompatible: true };
}

function generateSetupId(symbol: string, direction: string): string {
  return `SETUP-${symbol}-${direction}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * Attempt to build a BUY blueprint from verified H1/H4 market structure.
 *
 * Conditions for a valid BUY setup:
 * 1. Trend = BULLISH on H1 or H4
 * 2. A bullish FVG or bullish OB exists as entry zone
 * 3. Invalidation = nearest confirmed swing low below entry reference
 * 4. SL = invalidation level minus ATR buffer (placed outside structural invalidation)
 * 5. TP1 = nearest swing high / resistance above entry
 * 6. Valid risk geometry: SL < Invalidation < Entry < TP1, risk <= maxRiskAtrMultiplier, R:R >= minRewardRiskRatio
 */
export function buildBuyBlueprint(
  structure: MarketStructure,
  candles: OHLCCandle[],
  symbol: string,
  currentPrice: number,
  candleSource?: BlueprintCandleSource,
  policy: StopLossGeometryPolicy = CANONICAL_SL_POLICY
): TradeBlueprint | null {
  if (!structure || structure.trend === 'INSUFFICIENT_DATA') return null;
  if (structure.candleCount < 10) return null;

  // Truthful provenance resolution - NEVER fabricate verified provenance.
  // 1. If explicit candleSource is passed, it must be a recognized valid source.
  // 2. If candleSource is omitted/undefined, use structure.source IF it is a valid source.
  // 3. If both are present, they must match (no provenance conflict).
  // 4. If neither is valid, fail closed (return null).
  let effectiveSource: BlueprintCandleSource;

  if (candleSource !== undefined) {
    if (!isValidBlueprintCandleSource(candleSource)) {
      return null;
    }
    if (structure && structure.source && isValidBlueprintCandleSource(structure.source)) {
      if (candleSource !== structure.source) {
        return null;
      }
    }
    effectiveSource = candleSource;
  } else if (structure && structure.source && isValidBlueprintCandleSource(structure.source)) {
    effectiveSource = structure.source as BlueprintCandleSource;
  } else {
    // Missing or unknown provenance: FAIL CLOSED. Never fabricate 'INDEPENDENT_VERIFIED_OHLC'
    return null;
  }

  // ATR must be available and positive from verified candle data (fails closed if missing)
  const atrArr = calculateATR(candles, 14);
  const atr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  if (!atr || atr <= 0 || isNaN(atr)) return null;

  const slTolerance = atr * 0.25;
  const bullFVGs = structure.fvg.filter(f => f.type === 'BULLISH_FVG' && currentPrice >= (f.low - slTolerance));
  const bullOBs = structure.orderBlocks.filter(ob => ob.type === 'BULLISH_OB' && currentPrice >= (ob.low - slTolerance));

  // 1. Find entry zone: prefer unmitigated bullish FVG or bullish OB below/at current price
  let entrySource: FVG | OrderBlock | null = null;
  let entryType = '';

  if (bullFVGs.length > 0) {
    entrySource = bullFVGs[bullFVGs.length - 1]; // most recent unmitigated FVG
    entryType = 'BULLISH_FVG';
  } else if (bullOBs.length > 0) {
    entrySource = bullOBs[bullOBs.length - 1];
    entryType = 'BULLISH_OB';
  }

  if (!entrySource) return null;

  const entryHigh = entrySource.type === 'BULLISH_FVG' ? (entrySource as FVG).high : (entrySource as OrderBlock).high;
  const entryLow = entrySource.type === 'BULLISH_FVG' ? (entrySource as FVG).low : (entrySource as OrderBlock).low;
  const entryCandleTs = entrySource.candleTimestamp;
  const entryTf = entrySource.timeframe;

  const entryRef = Math.max(entryLow, Math.min(entryHigh, currentPrice));

  // 2. Invalidation: select candidate swing lows strictly below entryRef and below (entryLow + slTolerance)
  const candidateLows = structure.swingLows.filter(sl => sl.price < entryRef && sl.price <= (entryLow + slTolerance));
  if (candidateLows.length === 0) return null;

  // Select the nearest confirmed structural swing low below entry (highest price)
  candidateLows.sort((a, b) => b.price !== a.price ? b.price - a.price : b.candleTimestamp - a.candleTimestamp);
  const invalidationLevel = candidateLows[0];

  // 3. Volatility-aware cushion outside structural invalidation
  const slBuffer = Number((atr * policy.atrBufferMultiplier).toFixed(5));
  const slPrice = Number((invalidationLevel.price - slBuffer).toFixed(5));

  // 4. TP1 = nearest swing high or resistance above entryRef and entryHigh
  const targetsAbove = [
    ...structure.swingHighs.filter(sh => sh.price > entryHigh && sh.price > entryRef),
    ...structure.resistance.filter(r => r.price > entryHigh && r.price > entryRef),
  ].sort((a, b) => a.price - b.price);

  if (targetsAbove.length === 0) return null; // no structural target available — refuse blueprint

  const tp1Level = targetsAbove[0];
  const tp2Level = targetsAbove.length > 1 ? targetsAbove[1] : undefined;
  const tp3Level = targetsAbove.length > 2 ? targetsAbove[2] : undefined;

  // 5. Evaluate complete SL risk geometry and R:R policy
  const geometryEval = evaluateBlueprintRiskGeometry(
    'BUY',
    entryRef,
    slPrice,
    invalidationLevel.price,
    tp1Level.price,
    atr,
    policy
  );

  if (!geometryEval.isAcceptable) {
    return null; // Fail closed: reject setup with unacceptable risk geometry
  }

  const rr = `1:${geometryEval.rrRatio.toFixed(2)}`;
  const now = Date.now();
  const latestCandleTs = (Array.isArray(candles) && candles.length > 0)
    ? Math.max(...candles.map(c => c.timestamp))
    : (structure.analyzedAt || now);

  const isProvenanceVerified = effectiveSource === 'MT5_BROKER_OHLC' || effectiveSource === 'INDEPENDENT_VERIFIED_OHLC';

  return {
    setupId: generateSetupId(symbol, 'BUY'),
    createdAt: now,
    updatedAt: now,
    latestAnalyzedCandleTimestamp: latestCandleTs,
    symbol,
    direction: 'BUY',
    entryZoneHigh: { price: entryHigh, reason: `${entryType} zone upper boundary`, source: effectiveSource, timeframe: entryTf, structureType: entryType, candleTimestamp: entryCandleTs, classification: 'DERIVED_FROM_VERIFIED' },
    entryZoneLow: { price: entryLow, reason: `${entryType} zone lower boundary`, source: effectiveSource, timeframe: entryTf, structureType: entryType, candleTimestamp: entryCandleTs, classification: 'DERIVED_FROM_VERIFIED' },
    invalidation: { price: invalidationLevel.price, reason: `Confirmed swing low structural invalidation`, source: effectiveSource, timeframe: invalidationLevel.timeframe, structureType: 'SWING_LOW', candleTimestamp: invalidationLevel.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    sl: { price: slPrice, reason: `Swing low invalidation minus ${policy.atrBufferMultiplier}x ATR buffer`, source: effectiveSource, timeframe: invalidationLevel.timeframe, structureType: 'SL_DERIVED', candleTimestamp: invalidationLevel.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    tp1: { price: tp1Level.price, reason: `Nearest swing high / resistance above entry`, source: effectiveSource, timeframe: tp1Level.timeframe, structureType: tp1Level.type, candleTimestamp: tp1Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    tp2: tp2Level ? { price: tp2Level.price, reason: `Second structural resistance target`, source: effectiveSource, timeframe: tp2Level.timeframe, structureType: tp2Level.type, candleTimestamp: tp2Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' } : undefined,
    tp3: tp3Level ? { price: tp3Level.price, reason: `Third structural extension target`, source: effectiveSource, timeframe: tp3Level.timeframe, structureType: tp3Level.type, candleTimestamp: tp3Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' } : undefined,
    rrRatio: rr,
    expiry: now + MAXIMUM_BLUEPRINT_LIFETIME_MS,
    state: 'WATCH',
    blueprintProvenanceVerified: isProvenanceVerified,
    provenanceNote: `All levels derived from ${effectiveSource} candles on ${entryTf}. Entry: ${entryType}. SL: Nearest swing low + ATR cushion (${geometryEval.riskAtrMultiple.toFixed(1)}x ATR). TP1: Structural target (R:R ${rr}).`,
  };
}

/**
 * Attempt to build a SELL blueprint — inverse of BUY logic.
 */
export function buildSellBlueprint(
  structure: MarketStructure,
  candles: OHLCCandle[],
  symbol: string,
  currentPrice: number,
  candleSource?: BlueprintCandleSource,
  policy: StopLossGeometryPolicy = CANONICAL_SL_POLICY
): TradeBlueprint | null {
  if (!structure || structure.trend === 'INSUFFICIENT_DATA') return null;
  if (structure.candleCount < 10) return null;

  // Truthful provenance resolution - NEVER fabricate verified provenance.
  // 1. If explicit candleSource is passed, it must be a recognized valid source.
  // 2. If candleSource is omitted/undefined, use structure.source IF it is a valid source.
  // 3. If both are present, they must match (no provenance conflict).
  // 4. If neither is valid, fail closed (return null).
  let effectiveSource: BlueprintCandleSource;

  if (candleSource !== undefined) {
    if (!isValidBlueprintCandleSource(candleSource)) {
      return null;
    }
    if (structure && structure.source && isValidBlueprintCandleSource(structure.source)) {
      if (candleSource !== structure.source) {
        return null;
      }
    }
    effectiveSource = candleSource;
  } else if (structure && structure.source && isValidBlueprintCandleSource(structure.source)) {
    effectiveSource = structure.source as BlueprintCandleSource;
  } else {
    // Missing or unknown provenance: FAIL CLOSED. Never fabricate 'INDEPENDENT_VERIFIED_OHLC'
    return null;
  }

  // ATR must be available and positive from verified candle data (fails closed if missing)
  const atrArr = calculateATR(candles, 14);
  const atr = atrArr.length > 0 ? atrArr[atrArr.length - 1] : null;
  if (!atr || atr <= 0 || isNaN(atr)) return null;

  const slTolerance = atr * 0.25;
  const bearFVGs = structure.fvg.filter(f => f.type === 'BEARISH_FVG' && currentPrice <= (f.high + slTolerance));
  const bearOBs = structure.orderBlocks.filter(ob => ob.type === 'BEARISH_OB' && currentPrice <= (ob.high + slTolerance));

  let entrySource: FVG | OrderBlock | null = null;
  let entryType = '';

  if (bearFVGs.length > 0) {
    entrySource = bearFVGs[bearFVGs.length - 1]; // most recent unmitigated FVG
    entryType = 'BEARISH_FVG';
  } else if (bearOBs.length > 0) {
    entrySource = bearOBs[bearOBs.length - 1];
    entryType = 'BEARISH_OB';
  }

  if (!entrySource) return null;

  const entryHigh = entrySource.type === 'BEARISH_FVG' ? (entrySource as FVG).high : (entrySource as OrderBlock).high;
  const entryLow = entrySource.type === 'BEARISH_FVG' ? (entrySource as FVG).low : (entrySource as OrderBlock).low;
  const entryCandleTs = entrySource.candleTimestamp;
  const entryTf = entrySource.timeframe;

  const entryRef = Math.min(entryHigh, Math.max(entryLow, currentPrice));

  // 2. Invalidation: select candidate swing highs strictly above entryRef and above (entryHigh - slTolerance)
  const candidateHighs = structure.swingHighs.filter(sh => sh.price > entryRef && sh.price >= (entryHigh - slTolerance));
  if (candidateHighs.length === 0) return null;

  // Select the nearest confirmed structural swing high above entry (lowest price)
  candidateHighs.sort((a, b) => a.price !== b.price ? a.price - b.price : b.candleTimestamp - a.candleTimestamp);
  const invalidationLevel = candidateHighs[0];

  // 3. Volatility-aware cushion outside structural invalidation
  const slBuffer = Number((atr * policy.atrBufferMultiplier).toFixed(5));
  const slPrice = Number((invalidationLevel.price + slBuffer).toFixed(5));

  // 4. TP1 = nearest swing low or support below entryRef and entryLow
  const targetsBelow = [
    ...structure.swingLows.filter(sl => sl.price < entryLow && sl.price < entryRef),
    ...structure.support.filter(s => s.price < entryLow && s.price < entryRef),
  ].sort((a, b) => b.price - a.price);

  if (targetsBelow.length === 0) return null;

  const tp1Level = targetsBelow[0];
  const tp2Level = targetsBelow.length > 1 ? targetsBelow[1] : undefined;
  const tp3Level = targetsBelow.length > 2 ? targetsBelow[2] : undefined;

  // 5. Evaluate complete SL risk geometry and R:R policy
  const geometryEval = evaluateBlueprintRiskGeometry(
    'SELL',
    entryRef,
    slPrice,
    invalidationLevel.price,
    tp1Level.price,
    atr,
    policy
  );

  if (!geometryEval.isAcceptable) {
    return null; // Fail closed: reject setup with unacceptable risk geometry
  }

  const rr = `1:${geometryEval.rrRatio.toFixed(2)}`;
  const now = Date.now();
  const latestCandleTs = (Array.isArray(candles) && candles.length > 0)
    ? Math.max(...candles.map(c => c.timestamp))
    : (structure.analyzedAt || now);

  const isProvenanceVerified = effectiveSource === 'MT5_BROKER_OHLC' || effectiveSource === 'INDEPENDENT_VERIFIED_OHLC';

  return {
    setupId: generateSetupId(symbol, 'SELL'),
    createdAt: now,
    updatedAt: now,
    latestAnalyzedCandleTimestamp: latestCandleTs,
    symbol,
    direction: 'SELL',
    entryZoneHigh: { price: entryHigh, reason: `${entryType} zone upper boundary`, source: effectiveSource, timeframe: entryTf, structureType: entryType, candleTimestamp: entryCandleTs, classification: 'DERIVED_FROM_VERIFIED' },
    entryZoneLow: { price: entryLow, reason: `${entryType} zone lower boundary`, source: effectiveSource, timeframe: entryTf, structureType: entryType, candleTimestamp: entryCandleTs, classification: 'DERIVED_FROM_VERIFIED' },
    invalidation: { price: invalidationLevel.price, reason: `Confirmed swing high structural invalidation`, source: effectiveSource, timeframe: invalidationLevel.timeframe, structureType: 'SWING_HIGH', candleTimestamp: invalidationLevel.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    sl: { price: slPrice, reason: `Swing high invalidation plus ${policy.atrBufferMultiplier}x ATR buffer`, source: effectiveSource, timeframe: invalidationLevel.timeframe, structureType: 'SL_DERIVED', candleTimestamp: invalidationLevel.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    tp1: { price: tp1Level.price, reason: `Nearest swing low / support below entry`, source: effectiveSource, timeframe: tp1Level.timeframe, structureType: tp1Level.type, candleTimestamp: tp1Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    tp2: tp2Level ? { price: tp2Level.price, reason: `Second structural support target`, source: effectiveSource, timeframe: tp2Level.timeframe, structureType: tp2Level.type, candleTimestamp: tp2Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' } : undefined,
    tp3: tp3Level ? { price: tp3Level.price, reason: `Third structural extension target`, source: effectiveSource, timeframe: tp3Level.timeframe, structureType: tp3Level.type, candleTimestamp: tp3Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' } : undefined,
    rrRatio: rr,
    expiry: now + MAXIMUM_BLUEPRINT_LIFETIME_MS,
    state: 'WATCH',
    blueprintProvenanceVerified: isProvenanceVerified,
    provenanceNote: `All levels derived from ${effectiveSource} candles on ${entryTf}. Entry: ${entryType}. SL: Nearest swing high + ATR cushion (${geometryEval.riskAtrMultiple.toFixed(1)}x ATR). TP1: Structural target (R:R ${rr}).`,
  };
}

/**
 * Update the lifecycle state of a blueprint given current price and optional market context.
 *
 * CRITICAL INVARIANTS:
 * - SL/TP and invalidation levels are strictly FROZEN — never modified or dragged with price.
 * - Terminal states (INVALIDATED, EXPIRED) can never be reversed.
 * - Invalidation is immediate upon price or candle breach of the invalidation level.
 */
export function updateBlueprintLifecycle(
  bp: TradeBlueprint,
  currentPrice: number,
  candles?: OHLCCandle[],
  structure?: MarketStructure | null
): TradeBlueprint {
  const now = Date.now();
  let state = bp.state;

  // Terminal states remain terminal
  if (state === 'INVALIDATED' || state === 'EXPIRED') {
    return { ...bp, updatedAt: now };
  }

  // 1. Check fail-safe safety ceiling
  if (now > bp.expiry) {
    state = 'EXPIRED';
    return { ...bp, state, updatedAt: now };
  }

  // 2. Check market compatibility if structure or candles provided
  if (structure !== undefined || candles !== undefined) {
    const compat = evaluateBlueprintMarketCompatibility(bp, currentPrice, structure, candles);
    if (!compat.isCompatible) {
      if (compat.shouldInvalidate) {
        state = 'INVALIDATED';
      } else if (compat.reason?.includes('expired')) {
        state = 'EXPIRED';
      }
      return { ...bp, state, updatedAt: now };
    }
  }

  // 3. Fallback price-based invalidation check (when structure not provided)
  if (bp.direction === 'BUY' && (currentPrice < bp.invalidation.price || currentPrice < bp.sl.price)) {
    state = 'INVALIDATED';
  } else if (bp.direction === 'SELL' && (currentPrice > bp.invalidation.price || currentPrice > bp.sl.price)) {
    state = 'INVALIDATED';
  }
  // 4. Check if price enters entry zone
  else if (bp.direction === 'BUY' && currentPrice >= bp.entryZoneLow.price && currentPrice <= bp.entryZoneHigh.price) {
    state = 'TRIGGER_READY';
  } else if (bp.direction === 'SELL' && currentPrice >= bp.entryZoneLow.price && currentPrice <= bp.entryZoneHigh.price) {
    state = 'TRIGGER_READY';
  }

  return { ...bp, state, updatedAt: now };
}
