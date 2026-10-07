/**
 * FEF CORTEX — FED POLICY ANALYZER
 * Sprint 1C Clean-Room Implementation
 * 
 * Invariants:
 * 1. Analyzes official FOMC policy target corridor (DFEDTARU, DFEDTARL) and effective rate (DFF).
 * 2. Deterministic calculations: target midpoint, corridor width, distance from midpoint.
 * 3. Descriptive only: NEVER predicts future FOMC decisions or hikes/cuts.
 * 4. Missing target upper or lower bound fails closed to INSUFFICIENT_DATA.
 */

import { NormalizedMacroObservation } from '../types';
import { FedPolicyIntelligence, FedPolicyState } from './types';

export function analyzeFedPolicy(
  dfedtaruObs: NormalizedMacroObservation[],
  dfedtarlObs: NormalizedMacroObservation[],
  dffObs?: NormalizedMacroObservation[]
): FedPolicyIntelligence {
  const validU = (dfedtaruObs || []).filter(
    (o) => o && typeof o.value === 'number' && Number.isFinite(o.value) && !isNaN(o.value)
  );
  const validL = (dfedtarlObs || []).filter(
    (o) => o && typeof o.value === 'number' && Number.isFinite(o.value) && !isNaN(o.value)
  );

  // Missing target corridor bounds fails closed
  if (validU.length === 0 || validL.length === 0) {
    return {
      name: 'Federal Reserve Policy Target Corridor',
      targetLower: 0,
      targetUpper: 0,
      targetMidpoint: 0,
      corridorWidthBp: 0,
      policyState: 'INSUFFICIENT_DATA',
      observationDate: 'N/A',
      freshness: 'UNAVAILABLE',
      provider: 'FRED',
      classification: 'UNAVAILABLE',
      status: 'INSUFFICIENT_DATA',
      descriptiveOnly: true,
    };
  }

  // Sort ascending by observation timestamp
  const sortedU = [...validU].sort((a, b) => a.observationTimestamp - b.observationTimestamp);
  const sortedL = [...validL].sort((a, b) => a.observationTimestamp - b.observationTimestamp);

  const latestU = sortedU[sortedU.length - 1];
  const latestL = sortedL[sortedL.length - 1];

  const targetUpper = latestU.value;
  const targetLower = latestL.value;
  const targetMidpoint = Math.round(((targetUpper + targetLower) / 2) * 1000) / 1000;
  const corridorWidthBp = Math.round((targetUpper - targetLower) * 100 * 100) / 100;

  // Effective Fed Funds Rate (DFF) if available
  let effectiveRate: number | undefined;
  let distanceFromMidpointBp: number | undefined;

  const validDff = (dffObs || []).filter(
    (o) => o && typeof o.value === 'number' && Number.isFinite(o.value) && !isNaN(o.value)
  );
  if (validDff.length > 0) {
    const sortedDff = [...validDff].sort((a, b) => a.observationTimestamp - b.observationTimestamp);
    effectiveRate = sortedDff[sortedDff.length - 1].value;
    distanceFromMidpointBp = Math.round((effectiveRate - targetMidpoint) * 100 * 100) / 100;
  }

  // Policy context state based on target level:
  // Historically: >= 3.0% is restrictive context, <= 1.0% is easing context, between is neutral/stable
  let policyState: FedPolicyState = 'STABLE_POLICY';
  if (targetMidpoint >= 3.0) {
    policyState = 'RESTRICTIVE_CONTEXT';
  } else if (targetMidpoint <= 1.5) {
    policyState = 'EASING_CONTEXT';
  } else {
    policyState = 'STABLE_POLICY';
  }

  const isStale = latestU.freshness === 'STALE' || latestL.freshness === 'STALE';
  const isAging = latestU.freshness === 'AGING' || latestL.freshness === 'AGING';
  const freshness = isStale ? 'STALE' : isAging ? 'AGING' : 'CURRENT';

  return {
    name: 'Federal Reserve Policy Target Corridor',
    targetLower,
    targetUpper,
    effectiveRate,
    targetMidpoint,
    distanceFromMidpointBp,
    corridorWidthBp,
    policyState,
    observationDate: latestU.observationDate,
    freshness,
    provider: 'FRED',
    classification: 'INDEPENDENT_VERIFIED',
    status: 'VALID',
    descriptiveOnly: true,
  };
}

