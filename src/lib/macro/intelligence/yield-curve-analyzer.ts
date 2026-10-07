/**
 * FEF CORTEX — YIELD CURVE ANALYZER
 * Sprint 1C Clean-Room Implementation
 * 
 * Invariants:
 * 1. 10Y - 2Y Treasury spread calculation (DGS10 - DGS2).
 * 2. Strict observation date compatibility: mismatch is explicitly flagged, never assumed.
 * 3. Curve states:
 *    - NORMAL: spreadBp > 10.0 bp
 *    - FLAT: -10.0 bp <= spreadBp <= 10.0 bp
 *    - INVERTED: spreadBp < -10.0 bp
 * 4. Curve direction:
 *    - STEEPENING: spreadChangeBp >= 2.0 bp
 *    - FLATTENING: spreadChangeBp <= -2.0 bp
 *    - STABLE: abs(spreadChangeBp) < 2.0 bp
 * 5. Fail-closed: missing either leg returns INSUFFICIENT_DATA.
 */

import { NormalizedMacroObservation } from '../types';
import { AnalysisStatus, YieldCurveDirection, YieldCurveIntelligence, YieldCurveState } from './types';

export const YIELD_CURVE_FLAT_THRESHOLD_BP = 10.0;
export const YIELD_CURVE_CHANGE_THRESHOLD_BP = 2.0;

export function analyzeYieldCurve(
  dgs2Observations: NormalizedMacroObservation[],
  dgs10Observations: NormalizedMacroObservation[]
): YieldCurveIntelligence {
  const validDgs2 = (dgs2Observations || []).filter(
    (o) => o && typeof o.value === 'number' && Number.isFinite(o.value) && !isNaN(o.value)
  );
  const validDgs10 = (dgs10Observations || []).filter(
    (o) => o && typeof o.value === 'number' && Number.isFinite(o.value) && !isNaN(o.value)
  );

  // Insufficient data if either series has no valid observations
  if (validDgs2.length === 0 || validDgs10.length === 0) {
    return {
      name: 'U.S. Treasury 10Y-2Y Yield Curve',
      shortLegSeriesId: 'DGS2',
      longLegSeriesId: 'DGS10',
      shortYield: 0,
      longYield: 0,
      spreadBp: 0,
      curveState: 'INSUFFICIENT_DATA',
      curveDirection: 'INSUFFICIENT_DATA',
      observationDate: 'N/A',
      datesMatched: false,
      shortLegDate: validDgs2[validDgs2.length - 1]?.observationDate || 'N/A',
      longLegDate: validDgs10[validDgs10.length - 1]?.observationDate || 'N/A',
      freshness: 'UNAVAILABLE',
      confidence: 0,
      provider: 'FRED',
      classification: 'UNAVAILABLE',
      status: 'INSUFFICIENT_DATA',
    };
  }

  // Sort ascending by observation date
  const sorted2 = [...validDgs2].sort((a, b) => a.observationTimestamp - b.observationTimestamp);
  const sorted10 = [...validDgs10].sort((a, b) => a.observationTimestamp - b.observationTimestamp);

  // Index DGS2 by observationDate
  const dgs2Map = new Map<string, NormalizedMacroObservation>();
  for (const obs of sorted2) {
    dgs2Map.set(obs.observationDate, obs);
  }

  // Find the most recent date where BOTH legs have an observation
  let matchedDate: string | null = null;
  let latestDgs10: NormalizedMacroObservation | null = null;
  let latestDgs2: NormalizedMacroObservation | null = null;

  for (let i = sorted10.length - 1; i >= 0; i--) {
    const candidate10 = sorted10[i];
    if (dgs2Map.has(candidate10.observationDate)) {
      matchedDate = candidate10.observationDate;
      latestDgs10 = candidate10;
      latestDgs2 = dgs2Map.get(candidate10.observationDate)!;
      break;
    }
  }

  // If no exact date match found, fall back to the absolute latest of each leg with datesMatched = false
  let datesMatched = true;
  let status: AnalysisStatus = 'VALID';
  let confidence = 90;

  if (!matchedDate || !latestDgs10 || !latestDgs2) {
    latestDgs10 = sorted10[sorted10.length - 1];
    latestDgs2 = sorted2[sorted2.length - 1];
    datesMatched = false;
    status = 'INSUFFICIENT_DATA';
    confidence = 30; // Strongly degrade confidence for mismatched dates
  }

  const shortYield = latestDgs2.value;
  const longYield = latestDgs10.value;
  const spread = longYield - shortYield;
  const spreadBp = Math.round(spread * 100 * 100) / 100;

  // Determine Curve State
  let curveState: YieldCurveState = 'NORMAL';
  if (spreadBp > YIELD_CURVE_FLAT_THRESHOLD_BP) {
    curveState = 'NORMAL';
  } else if (spreadBp < -YIELD_CURVE_FLAT_THRESHOLD_BP) {
    curveState = 'INVERTED';
  } else {
    curveState = 'FLAT';
  }

  // Determine Curve Direction (look back 1 observation pair if available)
  let previousSpreadBp: number | undefined;
  let spreadChangeBp: number | undefined;
  let curveDirection: YieldCurveDirection = 'INSUFFICIENT_DATA';

  if (datesMatched && matchedDate) {
    // Find prior matched date
    let priorMatchedDate: string | null = null;
    let priorDgs10: NormalizedMacroObservation | null = null;
    let priorDgs2: NormalizedMacroObservation | null = null;

    for (let i = sorted10.length - 1; i >= 0; i--) {
      const candidate10 = sorted10[i];
      if (candidate10.observationDate < matchedDate && dgs2Map.has(candidate10.observationDate)) {
        priorMatchedDate = candidate10.observationDate;
        priorDgs10 = candidate10;
        priorDgs2 = dgs2Map.get(candidate10.observationDate)!;
        break;
      }
    }

    if (priorDgs10 && priorDgs2) {
      const priorSpread = priorDgs10.value - priorDgs2.value;
      previousSpreadBp = Math.round(priorSpread * 100 * 100) / 100;
      spreadChangeBp = Math.round((spreadBp - previousSpreadBp) * 100) / 100;

      if (spreadChangeBp >= YIELD_CURVE_CHANGE_THRESHOLD_BP) {
        curveDirection = 'STEEPENING';
      } else if (spreadChangeBp <= -YIELD_CURVE_CHANGE_THRESHOLD_BP) {
        curveDirection = 'FLATTENING';
      } else {
        curveDirection = 'STABLE';
      }
    }
  }

  // Worst-case freshness between the two legs
  const isStale = latestDgs10.freshness === 'STALE' || latestDgs2.freshness === 'STALE';
  const isAging = latestDgs10.freshness === 'AGING' || latestDgs2.freshness === 'AGING';
  const freshness = isStale ? 'STALE' : isAging ? 'AGING' : 'CURRENT';

  if (isStale) {
    confidence = Math.max(10, confidence - 40);
  }

  return {
    name: 'U.S. Treasury 10Y-2Y Yield Curve',
    shortLegSeriesId: 'DGS2',
    longLegSeriesId: 'DGS10',
    shortYield,
    longYield,
    spreadBp,
    previousSpreadBp,
    spreadChangeBp,
    curveState,
    curveDirection,
    observationDate: matchedDate || latestDgs10.observationDate,
    datesMatched,
    shortLegDate: latestDgs2.observationDate,
    longLegDate: latestDgs10.observationDate,
    freshness,
    confidence,
    provider: 'FRED',
    classification: 'INDEPENDENT_VERIFIED',
    status,
  };
}

