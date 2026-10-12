/**
 * FEF CORTEX — MACROECONOMIC DATA ARCHITECTURE & TYPES
 * Sprint 1B Clean-Room Foundation
 * 
 * Rules:
 * 1. Zero execution authority: macro observations are strictly analytical evidence.
 * 2. Immutable timestamps: observationDate vs receivedAt are strictly separate.
 * 3. Structured categorization: series are explicitly categorized without trade signals.
 */

import { EvidenceClassification } from '@/lib/evidence/agent-evidence';

export type MacroCategory =
  | 'TREASURY_YIELD'
  | 'REAL_YIELD'
  | 'POLICY_RATE'
  | 'INFLATION_EXPECTATION'
  | 'INFLATION'
  | 'LABOR_MARKET';

export type MacroFrequency =
  | 'DAILY'
  | 'BUSINESS_DAILY'
  | 'WEEKLY'
  | 'MONTHLY';

export type MacroFreshness =
  | 'CURRENT'
  | 'AGING'
  | 'STALE'
  | 'UNAVAILABLE';

export interface MacroSeriesDefinition {
  seriesId: string;
  name: string;
  category: MacroCategory;
  unit: string;
  frequency: MacroFrequency;
  expectedReleaseCadence?: string;
  source: string;
  marketRelevance: string;
  affectedAssets: string[];
  maxAgeHoursCurrent: number; // Max age in hours to be considered CURRENT
  maxAgeHoursAging: number;   // Max age in hours before becoming STALE
  description: string;
}

export interface NormalizedMacroObservation {
  seriesId: string;
  name: string;
  category: MacroCategory;
  value: number;
  unit: string;
  
  // Strict timestamp separation
  observationDate: string; // ISO format: YYYY-MM-DD
  observationTimestamp: number; // Epoch ms of start of observation date UTC
  receivedAt: number;      // Epoch ms when FEF ingested the data
  retrievedAt?: number;    // Epoch ms when retrieved from provider
  
  provider: string;
  source: string;
  provenance: EvidenceClassification;
  
  freshness: MacroFreshness;
  freshnessState?: MacroFreshness;
  freshnessReason: string;
  temporalUsability?: MacroFreshness;
  trustWeight?: number;
  seriesFrequency?: MacroFrequency;
  expectedReleaseCadence?: string;
  isLatestOfficialObservation?: boolean;
  isVerified?: boolean;
  isActionable?: boolean;
  affectedAssets: string[];
  metadata?: Record<string, unknown>;
}

export interface HistoricalMacroObservations {
  seriesId: string;
  name: string;
  category: MacroCategory;
  unit: string;
  provider: string;
  source: string;
  provenance: EvidenceClassification;
  observations: NormalizedMacroObservation[];
  totalSamples: number;
  startDate?: string;
  endDate?: string;
  receivedAt: number;
}

export interface MacroObservationFetchOptions {
  apiKey?: string;
  forceRefresh?: boolean;
  allowStale?: boolean;
  limit?: number; // Bounded history sample limit (default 20, max 100)
}
