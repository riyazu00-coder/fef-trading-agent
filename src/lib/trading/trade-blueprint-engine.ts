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

  // All levels derived from real structure — never hardcoded offsets
  entryZoneHigh: LevelWithProvenance;
  entryZoneLow: LevelWithProvenance;
  invalidation: LevelWithProvenance;   // SL basis
  sl: LevelWithProvenance;             // sl = invalidation + ATR buffer
  tp1: LevelWithProvenance;            // Mandatory — nearest structural target
  tp2?: LevelWithProvenance;           // Optional — only if genuine structure warrants it
  tp3?: LevelWithProvenance;           // Optional — only if genuine structure warrants it

  rrRatio: string | null;             // null if TP1 not yet resolved
  expiry: number;                     // Unix ms — expire if price doesn't enter entry zone
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

const EXPIRY_MS = 4 * 60 * 60 * 1000;  // 4 hours

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
  candleSource: BlueprintCandleSource = 'INDEPENDENT_VERIFIED_OHLC',
  policy: StopLossGeometryPolicy = CANONICAL_SL_POLICY
): TradeBlueprint | null {
  if (!structure || structure.trend === 'INSUFFICIENT_DATA') return null;
  if (structure.candleCount < 10) return null;

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

  return {
    setupId: generateSetupId(symbol, 'BUY'),
    createdAt: now,
    updatedAt: now,
    symbol,
    direction: 'BUY',
    entryZoneHigh: { price: entryHigh, reason: `${entryType} zone upper boundary`, source: candleSource, timeframe: entryTf, structureType: entryType, candleTimestamp: entryCandleTs, classification: 'DERIVED_FROM_VERIFIED' },
    entryZoneLow: { price: entryLow, reason: `${entryType} zone lower boundary`, source: candleSource, timeframe: entryTf, structureType: entryType, candleTimestamp: entryCandleTs, classification: 'DERIVED_FROM_VERIFIED' },
    invalidation: { price: invalidationLevel.price, reason: `Confirmed swing low structural invalidation`, source: candleSource, timeframe: invalidationLevel.timeframe, structureType: 'SWING_LOW', candleTimestamp: invalidationLevel.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    sl: { price: slPrice, reason: `Swing low invalidation minus ${policy.atrBufferMultiplier}x ATR buffer`, source: candleSource, timeframe: invalidationLevel.timeframe, structureType: 'SL_DERIVED', candleTimestamp: invalidationLevel.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    tp1: { price: tp1Level.price, reason: `Nearest swing high / resistance above entry`, source: candleSource, timeframe: tp1Level.timeframe, structureType: tp1Level.type, candleTimestamp: tp1Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    tp2: tp2Level ? { price: tp2Level.price, reason: `Second structural resistance target`, source: candleSource, timeframe: tp2Level.timeframe, structureType: tp2Level.type, candleTimestamp: tp2Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' } : undefined,
    tp3: tp3Level ? { price: tp3Level.price, reason: `Third structural extension target`, source: candleSource, timeframe: tp3Level.timeframe, structureType: tp3Level.type, candleTimestamp: tp3Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' } : undefined,
    rrRatio: rr,
    expiry: now + EXPIRY_MS,
    state: 'WATCH',
    blueprintProvenanceVerified: true,
    provenanceNote: `All levels derived from ${candleSource} verified candles on ${entryTf}. Entry: ${entryType}. SL: Nearest swing low + ATR cushion (${geometryEval.riskAtrMultiple.toFixed(1)}x ATR). TP1: Structural target (R:R ${rr}).`,
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
  candleSource: BlueprintCandleSource = 'INDEPENDENT_VERIFIED_OHLC',
  policy: StopLossGeometryPolicy = CANONICAL_SL_POLICY
): TradeBlueprint | null {
  if (!structure || structure.trend === 'INSUFFICIENT_DATA') return null;
  if (structure.candleCount < 10) return null;

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
    entrySource = bearFVGs[bearFVGs.length - 1];
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

  return {
    setupId: generateSetupId(symbol, 'SELL'),
    createdAt: now,
    updatedAt: now,
    symbol,
    direction: 'SELL',
    entryZoneHigh: { price: entryHigh, reason: `${entryType} zone upper boundary`, source: candleSource, timeframe: entryTf, structureType: entryType, candleTimestamp: entryCandleTs, classification: 'DERIVED_FROM_VERIFIED' },
    entryZoneLow: { price: entryLow, reason: `${entryType} zone lower boundary`, source: candleSource, timeframe: entryTf, structureType: entryType, candleTimestamp: entryCandleTs, classification: 'DERIVED_FROM_VERIFIED' },
    invalidation: { price: invalidationLevel.price, reason: `Confirmed swing high structural invalidation`, source: candleSource, timeframe: invalidationLevel.timeframe, structureType: 'SWING_HIGH', candleTimestamp: invalidationLevel.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    sl: { price: slPrice, reason: `Swing high invalidation plus ${policy.atrBufferMultiplier}x ATR buffer`, source: candleSource, timeframe: invalidationLevel.timeframe, structureType: 'SL_DERIVED', candleTimestamp: invalidationLevel.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    tp1: { price: tp1Level.price, reason: `Nearest swing low / support below entry`, source: candleSource, timeframe: tp1Level.timeframe, structureType: tp1Level.type, candleTimestamp: tp1Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' },
    tp2: tp2Level ? { price: tp2Level.price, reason: `Second structural support target`, source: candleSource, timeframe: tp2Level.timeframe, structureType: tp2Level.type, candleTimestamp: tp2Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' } : undefined,
    tp3: tp3Level ? { price: tp3Level.price, reason: `Third structural extension target`, source: candleSource, timeframe: tp3Level.timeframe, structureType: tp3Level.type, candleTimestamp: tp3Level.candleTimestamp, classification: 'DERIVED_FROM_VERIFIED' } : undefined,
    rrRatio: rr,
    expiry: now + EXPIRY_MS,
    state: 'WATCH',
    blueprintProvenanceVerified: true,
    provenanceNote: `All levels derived from ${candleSource} verified candles on ${entryTf}. Entry: ${entryType}. SL: Nearest swing high + ATR cushion (${geometryEval.riskAtrMultiple.toFixed(1)}x ATR). TP1: Structural target (R:R ${rr}).`,
  };
}

/**
 * Update the lifecycle state of a blueprint given current price.
 * SL/TP levels are FROZEN — never dragged with price.
 */
export function updateBlueprintLifecycle(bp: TradeBlueprint, currentPrice: number): TradeBlueprint {
  const now = Date.now();
  let state = bp.state;

  if (state === 'ACTIONABLE' || state === 'TRIGGER_READY' || state === 'WATCH' || state === 'FORMING') {
    // Check expiry
    if (now > bp.expiry) {
      state = 'EXPIRED';
    }
    // Check invalidation: if price has closed beyond SL
    else if (bp.direction === 'BUY' && currentPrice < bp.invalidation.price) {
      state = 'INVALIDATED';
    } else if (bp.direction === 'SELL' && currentPrice > bp.invalidation.price) {
      state = 'INVALIDATED';
    }
    // Check if price enters entry zone
    else if (bp.direction === 'BUY' && currentPrice >= bp.entryZoneLow.price && currentPrice <= bp.entryZoneHigh.price) {
      state = 'TRIGGER_READY';
    } else if (bp.direction === 'SELL' && currentPrice >= bp.entryZoneLow.price && currentPrice <= bp.entryZoneHigh.price) {
      state = 'TRIGGER_READY';
    }
  }

  return { ...bp, state, updatedAt: now };
}
