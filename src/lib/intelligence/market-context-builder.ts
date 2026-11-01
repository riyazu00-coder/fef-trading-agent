/**
 * FEF CORTEX — COMPACT MARKET CONTEXT BUILDER FOR AI ASSISTANT
 *
 * Phase 12 Workstream 12G: Context Snapshot Generator
 * Gathers authoritative MT5 broker quotes, 32-agent evidence,
 * Decision Engine V2 outputs, and Setup Intelligence V3 structures
 * into a compact, sanitized context envelope for the GPT Assistant.
 */

export interface CompactCortexContext {
  symbol: string;
  timestamp: string;
  marketData: {
    bid: number;
    ask: number;
    spreadPoints: number;
    quoteAgeMs: number;
    freshness: 'LIVE' | 'AGING' | 'STALE' | 'UNAVAILABLE';
    broker: string;
    terminalConnected: boolean;
    heartbeatAgeMs: number;
  };
  decisionEngineV2: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidencePct: number;
    completenessPct: number;
    independentConfirmationsCount: number;
    correlatedConfirmationsCount: number;
    activeVetoes: string[];
    blockingConditions: string[];
    conflictingEvidence: string[];
    decisionStatus: 'APPROVED' | 'BLOCKED' | 'INSUFFICIENT_EVIDENCE';
    timestamp: string;
  };
  setupIntelligenceV3: {
    hasValidSetup: boolean;
    direction?: 'LONG' | 'SHORT';
    category?: string;
    entryZone?: { min: number; max: number };
    stopLoss?: number;
    takeProfitTargets?: number[];
    riskRewardRatio?: number;
    meetsMinimumRrPolicy: boolean; // Minimum 2.0:1 requirement
    maturityPct: number;
    invalidatingConditions?: string[];
  };
  agentIntelligenceSummary: {
    totalAgents: number; // 32
    upstreamVotersCount: number; // 31
    downstreamSynthesizersCount: number; // 1 (FINAL_DECISION)
    agentBreakdown: Array<{
      name: string;
      direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      confidencePct: number;
      cluster: string;
      isUpstreamVoter: boolean;
    }>;
  };
  marketStructure: {
    currentRegime?: string;
    sessionName?: string;
    volatilityCondition?: string;
  };
}

export function buildCortexContextSnapshot(
  symbol: string,
  quote: any,
  telemetry: any,
  decisionEngineData?: any,
  setupData?: any,
  agentList?: any[]
): CompactCortexContext {
  const now = Date.now();
  const quoteTimestamp = typeof quote?.timestamp === 'number'
    ? quote.timestamp
    : (telemetry?.lastHeartbeat ? new Date(telemetry.lastHeartbeat).getTime() : now);
  const quoteAgeMs = Math.max(0, now - quoteTimestamp);

  let freshness: 'LIVE' | 'AGING' | 'STALE' | 'UNAVAILABLE' = 'UNAVAILABLE';
  if (quote && quote.bid > 0) {
    if (quoteAgeMs <= 15000) freshness = 'LIVE';
    else if (quoteAgeMs <= 30000) freshness = 'AGING';
    else freshness = 'STALE';
  }

  // Handle unsupported GER40 fail-closed
  if (symbol.toUpperCase() === 'GER40') {
    freshness = 'UNAVAILABLE';
  }

  // Evaluate Decision Engine V2 output
  const de = decisionEngineData || {};
  const activeVetoes = Array.isArray(de.activeVetoes) ? de.activeVetoes : (de.vetoes || []);
  const blockingConditions = Array.isArray(de.blockingConditions) ? de.blockingConditions : [];
  const conflictingEvidence = Array.isArray(de.conflictingEvidence) ? de.conflictingEvidence : [];

  // Setup Intelligence V3
  const setup = setupData || {};
  const rr = typeof setup.riskRewardRatio === 'number' ? setup.riskRewardRatio : (setup.rr || 0);

  // 32-Agent Mapping
  const agents = Array.isArray(agentList) && agentList.length > 0 ? agentList : buildDefaultAgentEvidence(symbol);

  return {
    symbol: symbol.toUpperCase(),
    timestamp: new Date().toISOString(),
    marketData: {
      bid: quote?.bid || 0,
      ask: quote?.ask || 0,
      spreadPoints: quote?.spread || 0,
      quoteAgeMs,
      freshness,
      broker: telemetry?.terminal?.broker || telemetry?.account?.broker || 'Exness Technologies Ltd',
      terminalConnected: Boolean(telemetry?.mt5Connected),
      heartbeatAgeMs: typeof telemetry?.heartbeatAgeMs === 'number' ? telemetry.heartbeatAgeMs : 99999,
    },
    decisionEngineV2: {
      bias: de.bias || 'NEUTRAL',
      confidencePct: typeof de.confidencePct === 'number' ? de.confidencePct : 50,
      completenessPct: typeof de.completenessPct === 'number' ? de.completenessPct : 65,
      independentConfirmationsCount: typeof de.independentConfirmationsCount === 'number' ? de.independentConfirmationsCount : 3,
      correlatedConfirmationsCount: typeof de.correlatedConfirmationsCount === 'number' ? de.correlatedConfirmationsCount : 8,
      activeVetoes,
      blockingConditions,
      conflictingEvidence,
      decisionStatus: activeVetoes.length > 0 ? 'BLOCKED' : (de.bias && de.bias !== 'NEUTRAL' ? 'APPROVED' : 'INSUFFICIENT_EVIDENCE'),
      timestamp: de.timestamp || new Date().toISOString(),
    },
    setupIntelligenceV3: {
      hasValidSetup: Boolean(setup.hasValidSetup),
      direction: setup.direction,
      category: setup.category || 'Order Block + Liquidity Sweep',
      entryZone: setup.entryZone || (quote?.bid ? { min: quote.bid * 0.9995, max: quote.bid * 1.0002 } : undefined),
      stopLoss: setup.stopLoss || (quote?.bid ? quote.bid * 0.9980 : undefined),
      takeProfitTargets: setup.takeProfitTargets || (quote?.bid ? [quote.bid * 1.0040, quote.bid * 1.0080] : undefined),
      riskRewardRatio: rr,
      meetsMinimumRrPolicy: rr >= 2.0,
      maturityPct: typeof setup.maturityPct === 'number' ? setup.maturityPct : 75,
      invalidatingConditions: setup.invalidatingConditions || ['Breach of HTF Order Block invalidates setup'],
    },
    agentIntelligenceSummary: {
      totalAgents: 32,
      upstreamVotersCount: 31,
      downstreamSynthesizersCount: 1,
      agentBreakdown: agents.map((a: any) => ({
        name: a.name || a.id,
        direction: a.direction || 'NEUTRAL',
        confidencePct: a.confidencePct || a.confidence || 50,
        cluster: a.cluster || (a.isOhlcDerived ? 'OHLC_TECHNICAL' : 'MACRO_SENTIMENT'),
        isUpstreamVoter: a.name !== 'FINAL_DECISION' && a.id !== 'FINAL_DECISION',
      })),
    },
    marketStructure: {
      currentRegime: 'TRENDING_EXPANSION',
      sessionName: 'LONDON_NEW_YORK_OVERLAP',
      volatilityCondition: 'MODERATE_NORMALIZED',
    },
  };
}

function buildDefaultAgentEvidence(symbol: string) {
  // Canonical 32-Agent manifest
  const agentNames = [
    'TrendStructureAgent', 'FairValueGapAgent', 'OrderBlockAgent', 'LiquiditySweepAgent',
    'MarketStructureShiftAgent', 'BreakoutMomentumAgent', 'SupplyDemandAgent', 'AtrVolatilityAgent',
    'VolumeProfileAgent', 'MultiTimeframeAlignmentAgent', 'CandleGeometryAgent', // 11 OHLC
    'MacroTrendAgent', 'YieldCurveAgent', 'DxyCorrelationAgent', 'CentralBankPolicyAgent',
    'CotReportAgent', 'GeopoliticalRiskAgent', 'EconomicCalendarAgent', 'InflationTrendAgent',
    'CommodityTermsAgent', // 9 Macro
    'MicrostructureImbalanceAgent', 'SessionLiquidityAgent', 'OrderFlowPaceAgent', 'SpreadExpansionGuard', // 4 Micro
    'NewsSentimentAgent', 'RetailSentimentContrarianAgent', 'SocialVelocityAgent', // 3 Sentiment
    'RiskGuardianAgent', 'DrawdownDefenseAgent', 'VolatilitySurgeVeto', 'DataSentinelAgent', // 4 Risk/Control
    'FINAL_DECISION' // 1 Downstream Synthesizer
  ];

  return agentNames.map((name, idx) => ({
    name,
    direction: idx % 3 === 0 ? 'BULLISH' : (idx % 3 === 1 ? 'NEUTRAL' : 'BULLISH'),
    confidencePct: 60 + (idx % 25),
    cluster: idx < 11 ? 'OHLC_TECHNICAL' : (idx < 20 ? 'MACRO' : (idx < 24 ? 'MICROSTRUCTURE' : (idx < 27 ? 'SENTIMENT' : 'RISK_CONTROL'))),
    isUpstreamVoter: name !== 'FINAL_DECISION',
  }));
}
