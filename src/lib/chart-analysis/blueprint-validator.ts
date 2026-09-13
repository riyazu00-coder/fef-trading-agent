/**
 * FEF Trade Blueprint Validator & Normalizer
 * Enforces strict directional geometry rules and consistent theme styling:
 * - BUY: SL < entryMin, TP1 > entryMax, TP2 > TP1, TP3 > TP2. Emerald / Green accents.
 * - SELL: SL > entryMax, TP1 < entryMin, TP2 < TP1, TP3 < TP2. Rose / Red accents.
 * - Inconsistent: Never silently flip labels. Mark as BLUEPRINT INCONSISTENT, disable buttons.
 */

export type NormalizedDirection = 'BUY' | 'SELL' | 'WAIT' | 'UNKNOWN';

export interface SetupLevels {
  state: string;
  entryLow: number;
  entryHigh: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward?: string;
}

export interface BlueprintValidationResult {
  isValid: boolean;
  direction: NormalizedDirection;
  status: 'VALID' | 'BLUEPRINT INCONSISTENT' | 'NEUTRAL';
  reason?: string;
  rrRatio: string;
  badgeClasses: string;
  pulseDotClasses: string;
  directionColorClass: string;
  tpColorClasses: {
    tp1: string;
    tp2: string;
    tp3: string;
  };
}

export function normalizeTradeDirection(state?: string): NormalizedDirection {
  if (!state) return 'UNKNOWN';
  const upper = state.toUpperCase().trim();
  if (upper.includes('BUY')) return 'BUY';
  if (upper.includes('SELL')) return 'SELL';
  if (
    upper.includes('WAIT') ||
    upper.includes('MONITOR') ||
    upper.includes('NO TRADE') ||
    upper.includes('NEUTRAL') ||
    upper.includes('ANALYSIS ONLY') ||
    upper.includes('DATA LIMITED')
  ) {
    return 'WAIT';
  }
  return 'UNKNOWN';
}

export function calculateBlueprintRR(
  direction: NormalizedDirection,
  entryLow: number,
  entryHigh: number,
  stopLoss: number,
  tp1: number
): { valid: boolean; formatted: string } {
  const entryMid = (entryLow + entryHigh) / 2;
  if (direction === 'BUY') {
    const risk = entryMid - stopLoss;
    const reward = tp1 - entryMid;
    if (risk <= 0 || reward <= 0) {
      return { valid: false, formatted: 'INCONSISTENT' };
    }
    return { valid: true, formatted: `1 : ${(reward / risk).toFixed(2)}` };
  } else if (direction === 'SELL') {
    const risk = stopLoss - entryMid;
    const reward = entryMid - tp1;
    if (risk <= 0 || reward <= 0) {
      return { valid: false, formatted: 'INCONSISTENT' };
    }
    return { valid: true, formatted: `1 : ${(reward / risk).toFixed(2)}` };
  }
  return { valid: false, formatted: 'N/A' };
}

export function validateTradeBlueprint(setup?: SetupLevels | null): BlueprintValidationResult {
  if (!setup) {
    return {
      isValid: false,
      direction: 'UNKNOWN',
      status: 'NEUTRAL',
      reason: 'No setup provided',
      rrRatio: 'N/A',
      badgeClasses: 'bg-white/10 text-gray-400 border-white/20',
      pulseDotClasses: 'bg-gray-500',
      directionColorClass: 'text-gray-400',
      tpColorClasses: { tp1: 'text-gray-300', tp2: 'text-gray-400', tp3: 'text-gray-500' }
    };
  }

  const direction = normalizeTradeDirection(setup.state);
  const entryMin = Math.min(setup.entryLow, setup.entryHigh);
  const entryMax = Math.max(setup.entryLow, setup.entryHigh);

  if (direction === 'WAIT') {
    return {
      isValid: true,
      direction: 'WAIT',
      status: 'NEUTRAL',
      rrRatio: 'N/A',
      badgeClasses: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
      pulseDotClasses: 'bg-amber-400',
      directionColorClass: 'text-amber-400',
      tpColorClasses: { tp1: 'text-amber-300', tp2: 'text-amber-200', tp3: 'text-amber-100' }
    };
  }

  if (direction === 'BUY') {
    const isSlValid = setup.stopLoss < entryMin;
    const isTp1Valid = setup.tp1 > entryMax;
    const isTp2Valid = setup.tp2 > setup.tp1;
    const isTp3Valid = setup.tp3 > setup.tp2;

    const isValid = isSlValid && isTp1Valid && isTp2Valid && isTp3Valid;
    const rr = calculateBlueprintRR('BUY', setup.entryLow, setup.entryHigh, setup.stopLoss, setup.tp1);

    if (!isValid || !rr.valid) {
      return {
        isValid: false,
        direction: 'BUY',
        status: 'BLUEPRINT INCONSISTENT',
        reason: 'Direction and Entry / SL / TP geometry do not agree (SL must be below entry, TPs above).',
        rrRatio: 'INCONSISTENT',
        badgeClasses: 'bg-rose-950/60 text-rose-300 border border-rose-500/50',
        pulseDotClasses: 'bg-rose-500 animate-ping',
        directionColorClass: 'text-rose-400',
        tpColorClasses: { tp1: 'text-gray-400', tp2: 'text-gray-400', tp3: 'text-gray-400' }
      };
    }

    return {
      isValid: true,
      direction: 'BUY',
      status: 'VALID',
      rrRatio: setup.riskReward && setup.riskReward !== 'INCONSISTENT' ? setup.riskReward : rr.formatted,
      badgeClasses: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
      pulseDotClasses: 'bg-emerald-400 animate-pulse',
      directionColorClass: 'text-emerald-400',
      tpColorClasses: {
        tp1: 'text-emerald-400',
        tp2: 'text-emerald-300',
        tp3: 'text-emerald-200'
      }
    };
  }

  if (direction === 'SELL') {
    const isSlValid = setup.stopLoss > entryMax;
    const isTp1Valid = setup.tp1 < entryMin;
    const isTp2Valid = setup.tp2 < setup.tp1;
    const isTp3Valid = setup.tp3 < setup.tp2;

    const isValid = isSlValid && isTp1Valid && isTp2Valid && isTp3Valid;
    const rr = calculateBlueprintRR('SELL', setup.entryLow, setup.entryHigh, setup.stopLoss, setup.tp1);

    if (!isValid || !rr.valid) {
      return {
        isValid: false,
        direction: 'SELL',
        status: 'BLUEPRINT INCONSISTENT',
        reason: 'Direction and Entry / SL / TP geometry do not agree (SL must be above entry, TPs below).',
        rrRatio: 'INCONSISTENT',
        badgeClasses: 'bg-rose-950/60 text-rose-300 border border-rose-500/50',
        pulseDotClasses: 'bg-rose-500 animate-ping',
        directionColorClass: 'text-rose-400',
        tpColorClasses: { tp1: 'text-gray-400', tp2: 'text-gray-400', tp3: 'text-gray-400' }
      };
    }

    return {
      isValid: true,
      direction: 'SELL',
      status: 'VALID',
      rrRatio: setup.riskReward && setup.riskReward !== 'INCONSISTENT' ? setup.riskReward : rr.formatted,
      badgeClasses: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
      pulseDotClasses: 'bg-rose-400 animate-pulse',
      directionColorClass: 'text-rose-400',
      tpColorClasses: {
        tp1: 'text-rose-400',
        tp2: 'text-rose-300',
        tp3: 'text-rose-200'
      }
    };
  }

  // Unknown direction
  return {
    isValid: false,
    direction: 'UNKNOWN',
    status: 'BLUEPRINT INCONSISTENT',
    reason: `Unrecognized setup state: "${setup.state}"`,
    rrRatio: 'N/A',
    badgeClasses: 'bg-rose-950/60 text-rose-300 border border-rose-500/50',
    pulseDotClasses: 'bg-rose-500',
    directionColorClass: 'text-rose-400',
    tpColorClasses: { tp1: 'text-gray-400', tp2: 'text-gray-400', tp3: 'text-gray-400' }
  };
}
