/**
 * FEF CORTEX — MACRO INTELLIGENCE TYPES & CONTRACTS
 * Sprint 1C Clean-Room Implementation
 * 
 * Invariants:
 * 1. Zero execution authority: analytical evidence only (no isExecutable, orderAllowed, etc.)
 * 2. Deterministic: calculations based on statistics, rates, and basis points.
 * 3. Provenance preservation: source series, dates, and classification retained on all items.
 * 4. Conflict preservation: bullish and bearish macro evidence are preserved simultaneously.
 * 5. Data readiness separation: readiness (READY, PARTIAL, DATA_LIMITED, UNAVAILABLE) separate from bias.
 */

import { EvidenceClassification } from '@/lib/evidence/agent-evidence';
import { MacroCategory, MacroFreshness } from '../types';

export type SeriesDirection = 'RISING' | 'FALLING' | 'FLAT' | 'INSUFFICIENT_DATA';

export type SeriesMomentum =
  | 'ACCELERATING_UP'
  | 'UP'
  | 'FLAT'
  | 'DOWN'
  | 'ACCELERATING_DOWN'
  | 'INSUFFICIENT_DATA';

export type AnalysisStatus = 'VALID' | 'INSUFFICIENT_DATA' | 'STALE' | 'INVALID_DATA';

export interface MacroSeriesAnalysis {
  seriesId: string;
  name: string;
  category: MacroCategory;
  
  latestValue: number;
  latestObservationDate: string;
  
  previousValue?: number;
  previousObservationDate?: string;
  
  // 1-observation changes
  change1?: number;
  change1Pct?: number;
  change1Bp?: number;
  
  // 5-observation changes
  change5?: number;
  change5Pct?: number;
  change5Bp?: number;
  
  direction: SeriesDirection;
  momentum: SeriesMomentum;
  
  freshness: MacroFreshness;
  freshnessReason: string;
  
  sampleCount: number;
  provider: string;
  classification: EvidenceClassification;
  analysisStatus: AnalysisStatus;
}

export type YieldCurveState = 'NORMAL' | 'FLAT' | 'INVERTED' | 'INSUFFICIENT_DATA';
export type YieldCurveDirection = 'STEEPENING' | 'FLATTENING' | 'STABLE' | 'INSUFFICIENT_DATA';

export interface YieldCurveIntelligence {
  name: string;
  shortLegSeriesId: string; // DGS2
  longLegSeriesId: string;  // DGS10
  
  shortYield: number;
  longYield: number;
  spreadBp: number;         // (longYield - shortYield) * 100
  
  previousSpreadBp?: number;
  spreadChangeBp?: number;
  
  curveState: YieldCurveState;
  curveDirection: YieldCurveDirection;
  
  observationDate: string;
  datesMatched: boolean;
  shortLegDate: string;
  longLegDate: string;
  
  freshness: MacroFreshness;
  confidence: number;
  provider: string;
  classification: EvidenceClassification;
  status: AnalysisStatus;
}

export type FedPolicyState =
  | 'RESTRICTIVE_CONTEXT'
  | 'EASING_CONTEXT'
  | 'STABLE_POLICY'
  | 'INSUFFICIENT_DATA';

export interface FedPolicyIntelligence {
  name: string;
  targetLower: number;
  targetUpper: number;
  effectiveRate?: number;
  targetMidpoint: number;
  distanceFromMidpointBp?: number;
  corridorWidthBp: number;
  
  policyState: FedPolicyState;
  observationDate: string;
  freshness: MacroFreshness;
  
  provider: string;
  classification: EvidenceClassification;
  status: AnalysisStatus;
  
  // Explicitly note: descriptive only, not predicting future FOMC decision
  descriptiveOnly: true;
}

export type MacroEvidencePolarity = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export interface MacroEvidenceItem {
  id: string;
  factor: string;
  seriesId: string;
  polarity: MacroEvidencePolarity;
  claim: string;
  value: number | string;
  unit: string;
  changeBp?: number;
  weight: number;
  relevance: string;
  
  // Provenance
  observationDate: string;
  provider: string;
  classification: EvidenceClassification;
  freshness: MacroFreshness;
}

export type MacroBias = 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL' | 'DATA_LIMITED';

export type MacroDataReadiness = 'READY' | 'PARTIAL' | 'DATA_LIMITED' | 'UNAVAILABLE';

export interface XauusdMacroEvidence {
  instrument: 'XAUUSD';
  macroBias: MacroBias;
  dataReadiness: MacroDataReadiness;
  
  confidence: number;     // 0 - 100 deterministic confidence based on coverage & agreement
  evidenceTrust: number;  // 0 - 100 deterministic trust based on data freshness & provenance
  
  bullishEvidence: MacroEvidenceItem[];
  bearishEvidence: MacroEvidenceItem[];
  neutralEvidence: MacroEvidenceItem[];
  conflictingEvidence: string[];
  missingEvidence: string[];
  
  freshness: MacroFreshness;
  providerCoverage: number; // 0 - 1.0 (ratio of expected macro components present)
  seriesCoverage: string[];
  
  reasoningSummary: string;
  assembledAt: number;
}

