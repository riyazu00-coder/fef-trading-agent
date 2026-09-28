/**
 * FEF TRADING SOLUTIONS — MANDATORY TRADE PROTECTION VALIDATOR
 * 
 * Phase 2B.3 Canonical SL/TP Protection & Broker Constraint Layer
 * 
 * Strict Invariants:
 * 1. Mandatory SL: Stop Loss must be present, positive, and finite.
 * 2. Mandatory TP1: Take Profit 1 must be present, positive, and finite. (TP2 & TP3 optional).
 * 3. Directional Geometry:
 *    - BUY:  SL < Entry < TP1 < TP2 < TP3
 *    - SELL: SL > Entry > TP1 > TP2 > TP3
 * 4. Zero Distance Prohibited: SL and TP must have non-zero distances from Entry.
 * 5. No Silent Corrections: Never flip BUY/SELL, never widen SL, never fabricate TP.
 * 6. Broker Constraints:
 *    - SL distance >= stopsLevel * point
 *    - TP distance >= stopsLevel * point
 *    - SL/TP distance >= freezeLevel * point (where freezeLevel is active)
 * 7. Price Authority:
 *    - BUY resolves execution entry to broker ASK.
 *    - SELL resolves execution entry to broker BID.
 *    - Quote must be fresh and session active.
 */

import { MT5QuoteData } from '../bridge/mt5-bridge-protocol';
import { getInstrumentContractSpec } from '../calculator/position-size-calculator';

export type TradeProtectionState =
  | 'VALID'
  | 'MISSING_SL'
  | 'MISSING_TP1'
  | 'INVALID_GEOMETRY'
  | 'BROKER_STOP_LEVEL_VIOLATION'
  | 'BROKER_FREEZE_LEVEL_VIOLATION'
  | 'INVALID_PRICE'
  | 'STALE_PRICE'
  | 'SYMBOL_SPEC_UNAVAILABLE';

export interface BrokerSymbolConstraintSpec {
  point?: number;
  digits?: number;
  stopsLevel?: number;   // in points (e.g., 20 points)
  freezeLevel?: number;  // in points (e.g., 10 points)
  tickSize?: number;
  tickValue?: number;
  minLot?: number;
  maxLot?: number;
  lotStep?: number;
  contractSize?: number;
}

export interface TradeProtectionInput {
  symbol: string;
  direction: 'BUY' | 'SELL';
  entry: number;
  sl: number;
  tp1: number;
  tp2?: number;
  tp3?: number;
  brokerQuote?: MT5QuoteData | null;
  symbolSpec?: BrokerSymbolConstraintSpec | null;
  maxQuoteAgeMs?: number; // Default 5000ms
}

export interface NormalizedProtectionLevels {
  entry: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  slDistance: number;
  tp1Distance: number;
  tp2Distance?: number;
  tp3Distance?: number;
  tp1RR: string;
  tp2RR?: string;
  tp3RR?: string;
}

export interface TradeProtectionResult {
  valid: boolean;
  state: TradeProtectionState;
  statusLabel: 'PROTECTED ORDER' | 'ORDER READY' | 'PROTECTION INVALID / EXECUTION LOCKED';
  reasons: string[];
  normalized?: NormalizedProtectionLevels;
  minStopDistance?: number;
  minFreezeDistance?: number;
}

/**
 * Calculate Risk:Reward ratio formatted as 1 : X.XX
 */
export function calculateRR(
  direction: 'BUY' | 'SELL',
  entry: number,
  sl: number,
  tp: number
): { valid: boolean; ratio: number; formatted: string } {
  const slDist = Math.abs(entry - sl);
  const tpDist = Math.abs(tp - entry);

  if (slDist <= 0 || tpDist <= 0 || !isFinite(slDist) || !isFinite(tpDist)) {
    return { valid: false, ratio: 0, formatted: 'INCONSISTENT' };
  }

  // Directional sanity
  if (direction === 'BUY' && (sl >= entry || tp <= entry)) {
    return { valid: false, ratio: 0, formatted: 'INCONSISTENT' };
  }
  if (direction === 'SELL' && (sl <= entry || tp >= entry)) {
    return { valid: false, ratio: 0, formatted: 'INCONSISTENT' };
  }

  const ratio = tpDist / slDist;
  return {
    valid: true,
    ratio: Math.round(ratio * 100) / 100,
    formatted: `1 : ${(ratio).toFixed(2)}`
  };
}

/**
 * Central Protection Validator
 * Validates trade geometry, presence of mandatory SL/TP1, broker stop/freeze levels, and price freshness.
 */
export function validateTradeProtection(input: TradeProtectionInput): TradeProtectionResult {
  const reasons: string[] = [];
  const { symbol, direction, entry, sl, tp1, tp2, tp3, brokerQuote, symbolSpec } = input;

  // 1. Direction check
  if (direction !== 'BUY' && direction !== 'SELL') {
    return {
      valid: false,
      state: 'INVALID_GEOMETRY',
      statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
      reasons: [`Invalid order direction '${direction}'. Must be strictly BUY or SELL.`]
    };
  }

  // 2. Numeric & Finite Price Sanity
  if (typeof entry !== 'number' || isNaN(entry) || !isFinite(entry) || entry <= 0) {
    return {
      valid: false,
      state: 'INVALID_PRICE',
      statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
      reasons: [`Entry price (${entry}) must be a positive, finite number.`]
    };
  }

  // 3. Mandatory Stop Loss Check
  if (typeof sl !== 'number' || isNaN(sl) || !isFinite(sl) || sl <= 0) {
    return {
      valid: false,
      state: 'MISSING_SL',
      statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
      reasons: ['Stop Loss (SL) is mandatory. Set your SL level on the cone before dispatching.']
    };
  }
  const hasSL = true;

  // 4. Mandatory Take Profit 1 Check
  if (typeof tp1 !== 'number' || isNaN(tp1) || !isFinite(tp1) || tp1 <= 0) {
    return {
      valid: false,
      state: 'MISSING_TP1',
      statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
      reasons: ['Take Profit (TP) is mandatory. Set your TP level on the cone before dispatching.']
    };
  }
  const hasTP1 = true;

  // 5. Zero-Distance & Directional Geometry — only validated when SL/TP are provided
  if (hasSL) {
    const slDistance = Math.abs(entry - sl!);
    if (slDistance === 0) {
      return {
        valid: false,
        state: 'INVALID_GEOMETRY',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`Zero-distance Stop Loss rejected: SL (${sl}) equals Entry (${entry}).`]
      };
    }

    // 6. Directional SL check
    if (direction === 'BUY' && sl! >= entry) {
      return {
        valid: false,
        state: 'INVALID_GEOMETRY',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`BUY geometry violation: Stop Loss (${sl}) must be strictly below Entry (${entry}).`]
      };
    }
    if (direction === 'SELL' && sl! <= entry) {
      return {
        valid: false,
        state: 'INVALID_GEOMETRY',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`SELL geometry violation: Stop Loss (${sl}) must be strictly above Entry (${entry}).`]
      };
    }
  }

  if (hasTP1) {
    const tp1Distance = Math.abs(tp1! - entry);
    if (tp1Distance === 0) {
      return {
        valid: false,
        state: 'INVALID_GEOMETRY',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`Zero-distance Take Profit 1 rejected: TP1 (${tp1}) equals Entry (${entry}).`]
      };
    }

    // 6b. Directional TP check
    if (direction === 'BUY' && tp1! <= entry) {
      return {
        valid: false,
        state: 'INVALID_GEOMETRY',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`BUY geometry violation: Take Profit 1 (${tp1}) must be strictly above Entry (${entry}).`]
      };
    }
    if (direction === 'SELL' && tp1! >= entry) {
      return {
        valid: false,
        state: 'INVALID_GEOMETRY',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`SELL geometry violation: Take Profit 1 (${tp1}) must be strictly below Entry (${entry}).`]
      };
    }

    // TP2 / TP3 cascading checks (only when TP1 present)
    if (direction === 'BUY') {
      if (tp2 != null && !isNaN(tp2) && tp2 > 0 && tp2 <= tp1!) {
        return { valid: false, state: 'INVALID_GEOMETRY', statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
          reasons: [`BUY geometry violation: TP2 (${tp2}) must be above TP1 (${tp1}).`] };
      }
      if (tp3 != null && !isNaN(tp3) && tp3 > 0) {
        const priorTp = (tp2 != null && !isNaN(tp2) && tp2 > 0) ? tp2 : tp1!;
        if (tp3 <= priorTp) {
          return { valid: false, state: 'INVALID_GEOMETRY', statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
            reasons: [`BUY geometry violation: TP3 (${tp3}) must be above ${tp2 ? 'TP2' : 'TP1'} (${priorTp}).`] };
        }
      }
    } else {
      if (tp2 != null && !isNaN(tp2) && tp2 > 0 && tp2 >= tp1!) {
        return { valid: false, state: 'INVALID_GEOMETRY', statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
          reasons: [`SELL geometry violation: TP2 (${tp2}) must be below TP1 (${tp1}).`] };
      }
      if (tp3 != null && !isNaN(tp3) && tp3 > 0) {
        const priorTp = (tp2 != null && !isNaN(tp2) && tp2 > 0) ? tp2 : tp1!;
        if (tp3 >= priorTp) {
          return { valid: false, state: 'INVALID_GEOMETRY', statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
            reasons: [`SELL geometry violation: TP3 (${tp3}) must be below ${tp2 ? 'TP2' : 'TP1'} (${priorTp}).`] };
        }
      }
    }
  }

  // 7. Broker Quote Freshness & Price Authority Validation
  if (brokerQuote) {
    if (brokerQuote.freshness === 'SESSION_CLOSED') {
      return {
        valid: false,
        state: 'STALE_PRICE',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`Market session for ${symbol} is currently closed.`]
      };
    }

    const maxAge = input.maxQuoteAgeMs || 5000;
    const quoteAge = brokerQuote.ageMs ?? (brokerQuote.timestamp ? Math.max(0, Date.now() - brokerQuote.timestamp) : 0);
    if (brokerQuote.isStale || brokerQuote.freshness === 'STALE' || quoteAge > maxAge) {
      return {
        valid: false,
        state: 'STALE_PRICE',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`Broker quote for ${symbol} is stale (${Math.round(quoteAge / 1000)}s old > ${maxAge / 1000}s limit). Execution locked.`]
      };
    }

    // Directional executable price check
    if (direction === 'BUY' && (!brokerQuote.ask || brokerQuote.ask <= 0)) {
      return {
        valid: false,
        state: 'INVALID_PRICE',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`Authoritative broker ASK price is missing for BUY on ${symbol}.`]
      };
    }
    if (direction === 'SELL' && (!brokerQuote.bid || brokerQuote.bid <= 0)) {
      return {
        valid: false,
        state: 'INVALID_PRICE',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        reasons: [`Authoritative broker BID price is missing for SELL on ${symbol}.`]
      };
    }
  }

  // 8. Broker Stop Level & Freeze Level Constraints (only when SL/TP are provided)
  const baseSpec = getInstrumentContractSpec(symbol);
  const point = symbolSpec?.point || (symbolSpec?.digits ? Math.pow(10, -symbolSpec.digits) : baseSpec?.tickSize || 0.01);
  const stopsLevel = symbolSpec?.stopsLevel || 0;
  const freezeLevel = symbolSpec?.freezeLevel || 0;

  const minStopDistance = stopsLevel * point;
  const minFreezeDistance = freezeLevel * point;

  if (hasSL && stopsLevel > 0 && minStopDistance > 0) {
    const slDist = Math.abs(entry - sl!);
    if (slDist < minStopDistance - 1e-9) {
      return {
        valid: false,
        state: 'BROKER_STOP_LEVEL_VIOLATION',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        minStopDistance,
        minFreezeDistance,
        reasons: [`Stop Loss distance (${slDist.toFixed(4)}) is inside broker minimum stops level (${stopsLevel} points = ${minStopDistance.toFixed(4)}). Execution locked.`]
      };
    }
  }

  if (hasTP1 && stopsLevel > 0 && minStopDistance > 0) {
    const tp1Dist = Math.abs(tp1! - entry);
    if (tp1Dist < minStopDistance - 1e-9) {
      return {
        valid: false,
        state: 'BROKER_STOP_LEVEL_VIOLATION',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        minStopDistance,
        minFreezeDistance,
        reasons: [`Take Profit 1 distance (${tp1Dist.toFixed(4)}) is inside broker minimum stops level (${stopsLevel} points = ${minStopDistance.toFixed(4)}). Execution locked.`]
      };
    }
  }

  if (tp2 != null && !isNaN(tp2) && tp2 > 0 && stopsLevel > 0 && minStopDistance > 0) {
    const tp2Distance = Math.abs(tp2 - entry);
    if (tp2Distance < minStopDistance - 1e-9) {
      return {
        valid: false,
        state: 'BROKER_STOP_LEVEL_VIOLATION',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        minStopDistance,
        minFreezeDistance,
        reasons: [`Take Profit 2 distance (${tp2Distance.toFixed(4)}) is inside broker minimum stops level. Execution locked.`]
      };
    }
  }

  if (tp3 != null && !isNaN(tp3) && tp3 > 0 && stopsLevel > 0 && minStopDistance > 0) {
    const tp3Distance = Math.abs(tp3 - entry);
    if (tp3Distance < minStopDistance - 1e-9) {
      return {
        valid: false,
        state: 'BROKER_STOP_LEVEL_VIOLATION',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        minStopDistance,
        minFreezeDistance,
        reasons: [`Take Profit 3 distance (${tp3Distance.toFixed(4)}) is inside broker minimum stops level. Execution locked.`]
      };
    }
  }

  // Freeze level constraint (SL only)
  if (hasSL && freezeLevel > 0 && minFreezeDistance > 0) {
    const slDist = Math.abs(entry - sl!);
    if (slDist < minFreezeDistance - 1e-9) {
      return {
        valid: false,
        state: 'BROKER_FREEZE_LEVEL_VIOLATION',
        statusLabel: 'PROTECTION INVALID / EXECUTION LOCKED',
        minStopDistance,
        minFreezeDistance,
        reasons: [`Stop Loss distance (${slDist.toFixed(4)}) is within broker freeze level. Execution locked.`]
      };
    }
  }

  // 9. Build Normalized Valid Result
  const slDist = hasSL ? Math.abs(entry - sl!) : 0;
  const tp1Dist = hasTP1 ? Math.abs(tp1! - entry) : 0;
  const tp1RR = (hasSL && hasTP1) ? calculateRR(direction, entry, sl!, tp1!).formatted : 'N/A';
  const tp2RR = (hasSL && tp2 != null && !isNaN(tp2) && tp2 > 0) ? calculateRR(direction, entry, sl!, tp2).formatted : undefined;
  const tp3RR = (hasSL && tp3 != null && !isNaN(tp3) && tp3 > 0) ? calculateRR(direction, entry, sl!, tp3).formatted : undefined;

  const normalized: NormalizedProtectionLevels = {
    entry,
    sl: hasSL ? sl : undefined,
    tp1: hasTP1 ? tp1 : undefined,
    tp2: (tp2 != null && !isNaN(tp2) && tp2 > 0) ? tp2 : undefined,
    tp3: (tp3 != null && !isNaN(tp3) && tp3 > 0) ? tp3 : undefined,
    slDistance: Math.round(slDist * 100000) / 100000,
    tp1Distance: Math.round(tp1Dist * 100000) / 100000,
    tp2Distance: (tp2 != null && !isNaN(tp2) && tp2 > 0) ? Math.round(Math.abs(tp2 - entry) * 100000) / 100000 : undefined,
    tp3Distance: (tp3 != null && !isNaN(tp3) && tp3 > 0) ? Math.round(Math.abs(tp3 - entry) * 100000) / 100000 : undefined,
    tp1RR,
    tp2RR,
    tp3RR,
  };

  return {
    valid: true,
    state: 'VALID',
    statusLabel: 'PROTECTED ORDER',
    reasons: ['Valid directional geometry and mandatory SL/TP1 protection confirmed.'],
    normalized,
    minStopDistance,
    minFreezeDistance,
  };
}
