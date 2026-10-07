/**
 * FEF CORTEX — MACRO SERIES ANALYZER
 * Sprint 1C Clean-Room Implementation
 * 
 * Invariants:
 * 1. Deterministic calculation: no LLMs or synthetic magic numbers.
 * 2. Series direction and momentum calculated with explicit basis point / percentage thresholds.
 * 3. NaN/Infinity and malformed observations fail closed.
 * 4. Insufficient observations cleanly return INSUFFICIENT_DATA.
 * 5. Unit-aware: basis point changes (bp) calculated for interest rates and yields.
 */

import { NormalizedMacroObservation } from '../types';
import { AnalysisStatus, MacroSeriesAnalysis, SeriesDirection, SeriesMomentum } from './types';

export interface SeriesAnalyzerOptions {
  /**
   * Minimum basis point change over 1 observation to be classified as RISING or FALLING.
   * Default: 1.0 bp (0.010 percentage points). Less is considered FLAT noise.
   */
  bpThreshold1?: number;

  /**
   * Minimum basis point change over 5 observations to indicate multi-day direction.
   * Default: 3.0 bp (0.030 percentage points).
   */
  bpThreshold5?: number;
}

export const DEFAULT_BP_THRESHOLD_1 = 1.0; // 1 basis point
export const DEFAULT_BP_THRESHOLD_5 = 3.0; // 3 basis points

/**
 * Analyzes a chronological (ascending) array of validated macro observations for a single series.
 */
export function analyzeMacroSeries(
  observations: NormalizedMacroObservation[],
  options: SeriesAnalyzerOptions = {}
): MacroSeriesAnalysis {
  const bpThresh1 = options.bpThreshold1 ?? DEFAULT_BP_THRESHOLD_1;
  const bpThresh5 = options.bpThreshold5 ?? DEFAULT_BP_THRESHOLD_5;

  // Filter out any observations with invalid or non-finite numbers
  const validObs = (observations || []).filter(
    (obs) => obs && typeof obs.value === 'number' && Number.isFinite(obs.value) && !isNaN(obs.value)
  );

  // Insufficient data case
  if (validObs.length === 0) {
    const fallbackObs = observations?.[0];
    return {
      seriesId: fallbackObs?.seriesId || 'UNKNOWN',
      name: fallbackObs?.name || 'Unknown Series',
      category: fallbackObs?.category || 'TREASURY_YIELD',
      latestValue: 0,
      latestObservationDate: 'N/A',
      direction: 'INSUFFICIENT_DATA',
      momentum: 'INSUFFICIENT_DATA',
      freshness: 'UNAVAILABLE',
      freshnessReason: 'Zero valid observations available.',
      sampleCount: 0,
      provider: fallbackObs?.provider || 'FRED',
      classification: fallbackObs?.provenance || 'UNAVAILABLE',
      analysisStatus: 'INSUFFICIENT_DATA',
    };
  }

  // Ensure observations are sorted ascending by timestamp/date
  const sorted = [...validObs].sort((a, b) => a.observationTimestamp - b.observationTimestamp);
  const sampleCount = sorted.length;
  const latest = sorted[sampleCount - 1];

  // If only 1 observation exists, we can know the latest value and freshness,
  // but CANNOT determine changes, direction, or momentum.
  if (sampleCount < 2) {
    return {
      seriesId: latest.seriesId,
      name: latest.name,
      category: latest.category,
      latestValue: latest.value,
      latestObservationDate: latest.observationDate,
      direction: 'INSUFFICIENT_DATA',
      momentum: 'INSUFFICIENT_DATA',
      freshness: latest.freshness,
      freshnessReason: `${latest.freshnessReason} (Single observation: trend requires at least 2 samples)`,
      sampleCount: 1,
      provider: latest.provider,
      classification: latest.provenance,
      analysisStatus: 'INSUFFICIENT_DATA',
    };
  }

  // 1-observation change (latest vs previous)
  const prev = sorted[sampleCount - 2];
  const change1 = latest.value - prev.value;
  const change1Pct = prev.value !== 0 ? (change1 / Math.abs(prev.value)) * 100 : undefined;
  // For yields and rates denominated in '%', 1% = 100 bp
  const change1Bp = Math.round(change1 * 100 * 100) / 100; // rounded to 2 decimals

  // 5-observation change (if available)
  let change5: number | undefined;
  let change5Pct: number | undefined;
  let change5Bp: number | undefined;

  if (sampleCount >= 6) {
    const obs5 = sorted[sampleCount - 6];
    change5 = latest.value - obs5.value;
    change5Pct = obs5.value !== 0 ? (change5 / Math.abs(obs5.value)) * 100 : undefined;
    change5Bp = Math.round(change5 * 100 * 100) / 100;
  } else if (sampleCount >= 2) {
    // Partial window (earliest available up to 5 steps back)
    const earliest = sorted[0];
    change5 = latest.value - earliest.value;
    change5Pct = earliest.value !== 0 ? (change5 / Math.abs(earliest.value)) * 100 : undefined;
    change5Bp = Math.round(change5 * 100 * 100) / 100;
  }

  // Deterministic Direction Calculation
  let direction: SeriesDirection = 'FLAT';
  if (change1Bp >= bpThresh1) {
    direction = 'RISING';
  } else if (change1Bp <= -bpThresh1) {
    direction = 'FALLING';
  } else {
    direction = 'FLAT';
  }

  // Deterministic Momentum Calculation
  // Requires at least 3 observations to measure acceleration (change1 vs priorChange)
  let momentum: SeriesMomentum = 'INSUFFICIENT_DATA';
  if (sampleCount >= 3) {
    const prior = sorted[sampleCount - 3];
    const priorChange = prev.value - prior.value;
    const priorChangeBp = priorChange * 100;

    const diffOfChanges = change1Bp - priorChangeBp;

    if (change1Bp > bpThresh1) {
      if (diffOfChanges >= bpThresh1) {
        momentum = 'ACCELERATING_UP';
      } else {
        momentum = 'UP';
      }
    } else if (change1Bp < -bpThresh1) {
      if (diffOfChanges <= -bpThresh1) {
        momentum = 'ACCELERATING_DOWN';
      } else {
        momentum = 'DOWN';
      }
    } else {
      momentum = 'FLAT';
    }
  }

  return {
    seriesId: latest.seriesId,
    name: latest.name,
    category: latest.category,
    latestValue: latest.value,
    latestObservationDate: latest.observationDate,
    previousValue: prev.value,
    previousObservationDate: prev.observationDate,
    change1: Math.round(change1 * 10000) / 10000,
    change1Pct: change1Pct !== undefined ? Math.round(change1Pct * 100) / 100 : undefined,
    change1Bp,
    change5: change5 !== undefined ? Math.round(change5 * 10000) / 10000 : undefined,
    change5Pct: change5Pct !== undefined ? Math.round(change5Pct * 100) / 100 : undefined,
    change5Bp,
    direction,
    momentum,
    freshness: latest.freshness,
    freshnessReason: latest.freshnessReason,
    sampleCount,
    provider: latest.provider,
    classification: latest.provenance,
    analysisStatus: 'VALID',
  };
}

