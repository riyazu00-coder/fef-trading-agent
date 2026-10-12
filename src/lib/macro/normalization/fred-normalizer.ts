/**
 * FEF CORTEX — MACRO OBSERVATION NORMALIZATION
 * Sprint 1B Clean-Room Implementation
 * 
 * Rules:
 * 1. Strict numeric validation: "." or empty is missing; NaN/Infinity rejected.
 * 2. Strict date validation: must be valid ISO YYYY-MM-DD format.
 * 3. Future dates beyond small clock-skew tolerance are strictly rejected.
 * 4. Deterministic series-aware freshness evaluation:
 *    - CURRENT: observation age <= maxAgeHoursCurrent
 *    - AGING: maxAgeHoursCurrent < age <= maxAgeHoursAging (e.g. weekends, holidays)
 *    - STALE: age > maxAgeHoursAging
 * 5. Immutable timestamps: observationDate vs receivedAt are strictly separate.
 * 6. EvidenceClassification: truthfully maps official FRED data to INDEPENDENT_VERIFIED.
 */

import { MacroSeriesDefinition, NormalizedMacroObservation, MacroFreshness } from '../types';

export interface RawFredObservation {
  realtime_start?: string;
  realtime_end?: string;
  date?: string;
  value?: string;
}

export interface NormalizationResult {
  success: boolean;
  observation: NormalizedMacroObservation | null;
  error?: string;
}

const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes

export function normalizeFredObservation(
  seriesDef: MacroSeriesDefinition,
  raw: RawFredObservation,
  receivedAt: number = Date.now(),
  nowMs: number = Date.now()
): NormalizationResult {
  // 1. Validate date presence and format (YYYY-MM-DD)
  if (!raw || typeof raw.date !== 'string') {
    return { success: false, observation: null, error: 'MISSING_DATE: Observation date is missing.' };
  }

  const dateStr = raw.date.trim();
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return { success: false, observation: null, error: `INVALID_DATE_FORMAT: Date "${dateStr}" must be YYYY-MM-DD.` };
  }

  // Parse observation timestamp UTC (midnight UTC on observation date)
  const obsTimestamp = Date.parse(`${dateStr}T00:00:00.000Z`);
  if (isNaN(obsTimestamp)) {
    return { success: false, observation: null, error: `UNPARSEABLE_DATE: Date "${dateStr}" could not be parsed.` };
  }

  // Future-date validation
  if (obsTimestamp > nowMs + CLOCK_SKEW_TOLERANCE_MS) {
    return {
      success: false,
      observation: null,
      error: `FUTURE_DATE_REJECTED: Observation date ${dateStr} is in the future relative to current time.`,
    };
  }

  // 2. Validate value presence and format
  if (typeof raw.value !== 'string') {
    return { success: false, observation: null, error: 'MISSING_VALUE: Observation value is missing.' };
  }

  const trimmedVal = raw.value.trim();

  // FRED represents missing data explicitly as "."
  if (trimmedVal === '.' || trimmedVal === '') {
    return {
      success: false,
      observation: null,
      error: 'MISSING_VALUE_SENTINEL: FRED reported missing observation (".").',
    };
  }

  const numVal = Number(trimmedVal);
  if (isNaN(numVal) || !Number.isFinite(numVal)) {
    return {
      success: false,
      observation: null,
      error: `INVALID_NUMERIC_VALUE: "${raw.value}" cannot be parsed as a finite number.`,
    };
  }

  // 3. Compute Series-Aware Freshness
  const ageMs = Math.max(0, nowMs - obsTimestamp);
  const ageHours = ageMs / (3600 * 1000);

  let freshness: MacroFreshness = 'STALE';
  let freshnessReason = '';

  if (ageHours <= seriesDef.maxAgeHoursCurrent) {
    freshness = 'CURRENT';
    freshnessReason = `Observation within active cycle (${Math.round(ageHours)}h <= ${seriesDef.maxAgeHoursCurrent}h, cadence: ${seriesDef.expectedReleaseCadence || seriesDef.frequency})`;
  } else if (ageHours <= seriesDef.maxAgeHoursAging) {
    freshness = 'AGING';
    freshnessReason = `Observation in aging cycle (${Math.round(ageHours)}h <= ${seriesDef.maxAgeHoursAging}h, cadence: ${seriesDef.expectedReleaseCadence || seriesDef.frequency})`;
  } else {
    freshness = 'STALE';
    freshnessReason = `Observation exceeds expected release schedule (${Math.round(ageHours)}h > ${seriesDef.maxAgeHoursAging}h, cadence: ${seriesDef.expectedReleaseCadence || seriesDef.frequency})`;
  }

  // 4. Assemble Normalized Observation
  const isLatestOfficialObservation = freshness !== 'STALE';
  const isActionable = freshness !== 'STALE';
  const trustWeight = freshness === 'CURRENT' ? 1.0 : freshness === 'AGING' ? 0.65 : 0.0;
  const temporalUsability = freshness;

  const observation: NormalizedMacroObservation = {
    seriesId: seriesDef.seriesId,
    name: seriesDef.name,
    category: seriesDef.category,
    value: numVal,
    unit: seriesDef.unit,
    observationDate: dateStr,
    observationTimestamp: obsTimestamp,
    receivedAt,
    retrievedAt: receivedAt,
    provider: 'FRED',
    source: seriesDef.source,
    provenance: 'INDEPENDENT_VERIFIED', // Official government/central bank statistical release (authenticity)
    freshness,
    freshnessState: freshness,
    freshnessReason,
    temporalUsability, // Temporal usability separated from authenticity provenance
    trustWeight,       // Explicit trust penalty: 1.0 for CURRENT, 0.65 for AGING, 0.0 for STALE
    seriesFrequency: seriesDef.frequency,
    expectedReleaseCadence: seriesDef.expectedReleaseCadence || seriesDef.frequency,
    isLatestOfficialObservation,
    isVerified: true,
    isActionable,
    affectedAssets: [...seriesDef.affectedAssets],
    metadata: {
      frequency: seriesDef.frequency,
      realtimeStart: raw.realtime_start,
      realtimeEnd: raw.realtime_end,
    },
  };

  return {
    success: true,
    observation,
  };
}

