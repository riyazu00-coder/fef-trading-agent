/**
 * FEF CORTEX — LIVE INTELLIGENCE FEEDS CONTRACT
 * 
 * Defines the hydrated intelligence feed payload passed from the server
 * to client-side agent decision pipelines.
 */

import {
  NormalizedNewsItem,
  MacroIndicatorRecord,
  NormalizedCalendarEvent,
  GeopoliticalEventRecord,
  SentimentRecord,
  ProviderHealth,
} from '@/lib/providers/types';
import {
  XauusdMacroEvidence,
  YieldCurveIntelligence,
  FedPolicyIntelligence,
  MacroSeriesAnalysis,
  InflationRegimeIntelligence,
  LaborMarketIntelligence,
} from '@/lib/macro/intelligence/types';
import { MarketRegimeAssessment } from '@/lib/regime/market-regime-engine';
import { CrossAssetMatrix } from '@/lib/cross-asset/cross-asset-engine';
import { QuantMetricsResult, HistoricalAnalogueResult } from '@/lib/quant/quant-engine';
import { UnifiedAgentResponse } from '@/lib/agents/contracts/unified-agent-contract';
import { VerifiedEvidenceEnvelope } from '@/lib/providers/canonical-envelope';
import { CotReportRecord } from '@/lib/cot/cftc-cot-provider';
import { CentralBankPolicyData } from '@/lib/central-banks/central-bank-provider';

export interface LiveIntelligenceFeeds {
  timestamp: string;
  news: NormalizedNewsItem[];
  macro: MacroIndicatorRecord[];
  events: NormalizedCalendarEvent[];
  alerts: GeopoliticalEventRecord[];
  sentiment: Record<string, SentimentRecord | null>;
  xauusdMacro?: XauusdMacroEvidence | null;
  regime?: MarketRegimeAssessment | null;
  crossAsset?: CrossAssetMatrix | null;
  quant?: {
    metrics?: QuantMetricsResult | null;
    analogue?: HistoricalAnalogueResult | null;
  } | null;
  sentinel?: UnifiedAgentResponse | null;
  macroDetails?: {
    yieldCurve?: YieldCurveIntelligence;
    fedPolicy?: FedPolicyIntelligence;
    tenYearYield?: MacroSeriesAnalysis;
    twoYearYield?: MacroSeriesAnalysis;
    realYield?: MacroSeriesAnalysis;
    breakeven?: MacroSeriesAnalysis;
    inflationRegime?: InflationRegimeIntelligence;
    laborMarket?: LaborMarketIntelligence;
  } | null;
  cotReports?: Record<string, VerifiedEvidenceEnvelope<CotReportRecord>> | null;
  centralBanks?: VerifiedEvidenceEnvelope<Record<string, CentralBankPolicyData>> | null;
  currencyStrength?: VerifiedEvidenceEnvelope<Record<string, number>> | null;
  leadLag?: VerifiedEvidenceEnvelope<any> | null;
  brokerCandles?: Record<string, any> | null;
  providerHealth?: ProviderHealth[];
}

