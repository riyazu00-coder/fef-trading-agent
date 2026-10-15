/**
 * FEF CORTEX — UNIFIED AGENT & EVIDENCE INTELLIGENCE CONTRACTS
 * Milestone B Clean-Room Implementation
 * 
 * Rules:
 * 1. Zero execution authority: analytical evidence only (no isExecutable, orderAllowed, etc.)
 * 2. Strict semantic distinction:
 *    - DATA: Factual observations directly measured from verified sources.
 *    - ANALYSIS: Mathematical and statistical derivations over data.
 *    - INFERENCE: Probabilistic interpretations or model outputs.
 * 3. Evidence domains / families to prevent double-counting of correlated factors.
 * 4. Deterministic confidence & trust scoring: 0 on absent evidence, never arbitrary 50%.
 * 5. Fail-closed readiness: READY, PARTIAL, DATA_LIMITED, UNAVAILABLE.
 */

import { EvidenceClassification, ProvenanceBadgeType } from '@/lib/evidence/agent-evidence';

export type EvidenceNature = 'DATA' | 'ANALYSIS' | 'INFERENCE';

export type EvidenceDomainFamily =
  | 'PRICE_TECHNICAL'
  | 'MARKET_STRUCTURE'
  | 'LIQUIDITY'
  | 'ORDER_FLOW'
  | 'RATES'
  | 'INFLATION'
  | 'MACRO_REGIME'
  | 'NEWS_EVENT'
  | 'GEOPOLITICAL_EVENT'
  | 'SENTIMENT'
  | 'CROSS_ASSET'
  | 'VOLATILITY'
  | 'QUANT_STATISTICAL'
  | 'HISTORICAL_ANALOGUE'
  | 'PORTFOLIO_EXPOSURE'
  | 'RISK_GEOMETRY'
  | 'SYSTEM_INTEGRITY'
  | 'CURRENCY_STRENGTH'
  | 'INSTITUTIONAL'
  | 'RISK_GUARDIAN'
  | 'NEWS_WIRE';

export type EvidencePolarity = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION';

export interface UnifiedAgentEvidence {
  id: string;
  agentId: string;
  domainFamily: EvidenceDomainFamily;
  nature: EvidenceNature;
  classification: EvidenceClassification;
  polarity: EvidencePolarity;
  strength: number;       // 0.0 to 1.0 (magnitude/weight of the claim)
  confidence: number;     // 0 to 100 deterministic confidence
  claim: string;
  value?: number | string;
  unit?: string;
  changeBp?: number;
  
  // Provenance & Time Semantics
  source: string;
  provider: string;
  observedAt: string;     // ISO format source observation time
  receivedAt: number;     // Epoch ms when ingested into FEF DataHub
  freshnessMs: number;
  isStale: boolean;
  
  // Context
  instrument: string;     // e.g. 'XAUUSD', 'GLOBAL'
  timeframe?: string;     // e.g. 'H1', 'M5', 'DAILY'
  metadata?: Record<string, unknown>;
}

export type AgentReadinessState = 'READY' | 'PARTIAL' | 'STALE' | 'DATA_LIMITED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';

export interface UnifiedAgentResponse {
  agentId: string;
  agentName: string;
  role: string;
  domainFamily: EvidenceDomainFamily;
  
  instrument: string;
  timeframe?: string;
  
  direction: EvidencePolarity;
  confidence: number;         // 0 to 100
  evidenceTrust: number;      // 0 to 100
  readiness: AgentReadinessState;
  
  primaryThesis: string;
  evidence: UnifiedAgentEvidence[];
  conflicts: string[];
  missingEvidence: string[];
  invalidation: string;
  keyRisk: string;
  
  provenanceBadge: ProvenanceBadgeType;
  generatedAt: number;        // Epoch ms
}

