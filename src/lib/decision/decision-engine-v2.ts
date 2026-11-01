/**
 * FEF CORTEX — DECISION ENGINE V2
 * DEPENDENCY-AWARE CONSENSUS + RISK VETO + SETUP MATURITY
 *
 * Implements:
 * 1. Dependency-aware aggregation: AGENT COUNT != INDEPENDENT EVIDENCE COUNT
 * 2. Correlated-vote diminishing returns model (weights decay across correlated interpretations)
 * 3. 2-level consensus: Domain Consensus (Level 1) -> Cross-Domain Consensus (Level 2)
 * 4. Provenance-aware independence: OHLC-derived vs Tick volume proxy vs External Macro vs COT
 * 5. Deterministic Veto hierarchy: HARD_VETO vs SOFT_VETO
 * 6. Setup Maturity state machine: UNAVAILABLE -> DATA_LIMITED -> OBSERVING -> WATCH -> SETUP_FORMING -> VALIDATED_SETUP
 * 7. Multi-domain independent confirmation requirement for VALIDATED_SETUP
 * 8. Structured Explainability engine: requirementsToAdvance, blockingConditions, invalidationConditions
 * 9. Invariant: tradeExecutable = false (READ_ONLY execution mode strictly enforced)
 */

import { CanonicalEvidenceBundle } from '../evidence/canonical-evidence-bundle';
import { evaluateMarketSession, resolveAssetClass, MarketSessionState } from '../session/market-session-engine';

export type CanonicalEvidenceFamily =
  | 'PRICE_STRUCTURE'      // Broker OHLC, Swings, SMC, Market Structure
  | 'MOMENTUM'             // Price velocity, oscillators, Trend strength
  | 'VOLATILITY'           // Bollinger, ATR, Keltner, Squeeze
  | 'LIQUIDITY'            // Liquidity pools, sweeps, BSL/SSL
  | 'ORDER_FLOW_PROXY'     // Broker tick volume delta, micro-structure proxy
  | 'INSTITUTIONAL_PROXY'  // Anchored VWAP, session anchors (derived)
  | 'SESSION'              // Market session, Killzones, Algorithmic timing
  | 'RISK'                 // Mathematical exposure, portfolio geometry
  | 'CROSS_ASSET'          // DXY, Beta, Lead-Lag, Currency Strength
  | 'MACRO'                // Yields, Rates, Inflation, Central Banks
  | 'NEWS'                 // Economic Calendar, News Headlines
  | 'GEOPOLITICAL'         // Conflict, Energy flows
  | 'SENTIMENT'            // Retail LSR, Contrarian skew
  | 'POSITIONING'          // CFTC COT Institutional positioning
  | 'MONTE_CARLO'          // Statistical stress simulation
  | 'DATA_QUALITY';        // Telemetry integrity, Data Sentinel

export const CANONICAL_EVIDENCE_FAMILIES: CanonicalEvidenceFamily[] = [
  'PRICE_STRUCTURE',
  'MOMENTUM',
  'VOLATILITY',
  'LIQUIDITY',
  'ORDER_FLOW_PROXY',
  'INSTITUTIONAL_PROXY',
  'SESSION',
  'RISK',
  'CROSS_ASSET',
  'MACRO',
  'NEWS',
  'GEOPOLITICAL',
  'SENTIMENT',
  'POSITIONING',
  'MONTE_CARLO',
  'DATA_QUALITY',
];

export type IndependenceGroup =
  | 'PRICE_OHLC_DERIVED'
  | 'BROKER_TICK_PROXY'
  | 'EXCHANGE_CLOCK'
  | 'RISK_ENGINE'
  | 'CROSS_ASSET_QUOTES'
  | 'MACRO_ECONOMIC'
  | 'NEWSWIRE'
  | 'GEOPOLITICAL_FEED'
  | 'RETAIL_SENTIMENT'
  | 'CFTC_REGULATORY'
  | 'TELEMETRY_SUPERVISOR'
  | 'CHART_COMPUTER_VISION'
  | 'SYNTHESIZER';

export interface AgentDependencyMetadata {
  agentId: string;
  agentName: string;
  primaryFamilies: CanonicalEvidenceFamily[];
  secondaryFamilies: CanonicalEvidenceFamily[];
  independenceGroup: IndependenceGroup;
  isDerived: boolean;
  derivationType: string;
  isSynthesizer?: boolean;
}

export const AGENT_DEPENDENCY_REGISTRY: Record<string, AgentDependencyMetadata> = {
  // 14 Council Agents (Excluding FINAL_DECISION)
  TECHNICAL: {
    agentId: 'TECHNICAL',
    agentName: 'Technical Agent',
    primaryFamilies: ['PRICE_STRUCTURE', 'MOMENTUM'],
    secondaryFamilies: ['VOLATILITY'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'MATHEMATICAL_STRUCTURE'
  },
  VISION: {
    agentId: 'VISION',
    agentName: 'Vision / Chart Agent',
    primaryFamilies: ['PRICE_STRUCTURE'],
    secondaryFamilies: ['LIQUIDITY'],
    independenceGroup: 'CHART_COMPUTER_VISION',
    isDerived: true,
    derivationType: 'MULTIMODAL_IMAGE_PERCEPTION'
  },
  STRATEGY: {
    agentId: 'STRATEGY',
    agentName: 'Strategy Agent',
    primaryFamilies: ['PRICE_STRUCTURE'],
    secondaryFamilies: ['RISK'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'HEURISTIC_RULE'
  },
  OPPORTUNITY: {
    agentId: 'OPPORTUNITY',
    agentName: 'Opportunity Agent',
    primaryFamilies: ['PRICE_STRUCTURE', 'RISK'],
    secondaryFamilies: ['MOMENTUM'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'ASYMMETRIC_REWARD'
  },
  LIQUIDITY_MAP: {
    agentId: 'LIQUIDITY_MAP',
    agentName: 'Liquidity Agent',
    primaryFamilies: ['LIQUIDITY', 'PRICE_STRUCTURE'],
    secondaryFamilies: [],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'LEVEL_DETECTION'
  },
  ORDER_FLOW: {
    agentId: 'ORDER_FLOW',
    agentName: 'Scalper / Flow Sniper',
    primaryFamilies: ['ORDER_FLOW_PROXY'],
    secondaryFamilies: ['MOMENTUM'],
    independenceGroup: 'BROKER_TICK_PROXY',
    isDerived: true,
    derivationType: 'TICK_VOLUME_DELTA'
  },
  KILLZONE: {
    agentId: 'KILLZONE',
    agentName: 'Session / Killzone Agent',
    primaryFamilies: ['SESSION'],
    secondaryFamilies: ['LIQUIDITY'],
    independenceGroup: 'EXCHANGE_CLOCK',
    isDerived: false,
    derivationType: 'SESSION_ALGORITHM'
  },
  RISK_GUARDIAN: {
    agentId: 'RISK_GUARDIAN',
    agentName: 'Risk Guardian',
    primaryFamilies: ['RISK', 'DATA_QUALITY'],
    secondaryFamilies: ['VOLATILITY'],
    independenceGroup: 'RISK_ENGINE',
    isDerived: true,
    derivationType: 'EXPOSURE_BOUNDS'
  },
  MACRO: {
    agentId: 'MACRO',
    agentName: 'Macro Agent',
    primaryFamilies: ['MACRO'],
    secondaryFamilies: ['CROSS_ASSET'],
    independenceGroup: 'MACRO_ECONOMIC',
    isDerived: false,
    derivationType: 'EXTERNAL_TELEMETRY'
  },
  CORRELATION: {
    agentId: 'CORRELATION',
    agentName: 'Correlation Agent',
    primaryFamilies: ['CROSS_ASSET'],
    secondaryFamilies: ['MOMENTUM'],
    independenceGroup: 'CROSS_ASSET_QUOTES',
    isDerived: true,
    derivationType: 'INTERMARKET_BETA'
  },
  NEWS: {
    agentId: 'NEWS',
    agentName: 'News Agent',
    primaryFamilies: ['NEWS'],
    secondaryFamilies: ['MACRO'],
    independenceGroup: 'NEWSWIRE',
    isDerived: false,
    derivationType: 'EXTERNAL_EVENTS'
  },
  GEOPOLITICAL: {
    agentId: 'GEOPOLITICAL',
    agentName: 'Geopolitical Agent',
    primaryFamilies: ['GEOPOLITICAL'],
    secondaryFamilies: ['MACRO'],
    independenceGroup: 'GEOPOLITICAL_FEED',
    isDerived: false,
    derivationType: 'EXTERNAL_EVENTS'
  },
  SENTIMENT: {
    agentId: 'SENTIMENT',
    agentName: 'Sentiment Agent',
    primaryFamilies: ['SENTIMENT'],
    secondaryFamilies: ['POSITIONING'],
    independenceGroup: 'RETAIL_SENTIMENT',
    isDerived: false,
    derivationType: 'EXTERNAL_SENTIMENT'
  },
  INSTITUTIONAL: {
    agentId: 'INSTITUTIONAL',
    agentName: 'Institutional Agent',
    primaryFamilies: ['INSTITUTIONAL_PROXY', 'LIQUIDITY'],
    secondaryFamilies: ['PRICE_STRUCTURE'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'VOLUME_PROFILE_PROXY'
  },

  // 17 Specialists
  DATA_SENTINEL: {
    agentId: 'DATA_SENTINEL',
    agentName: 'Data Sentinel Specialist',
    primaryFamilies: ['DATA_QUALITY'],
    secondaryFamilies: [],
    independenceGroup: 'TELEMETRY_SUPERVISOR',
    isDerived: false,
    derivationType: 'INTEGRITY_CHECK'
  },
  VOLATILITY: {
    agentId: 'VOLATILITY',
    agentName: 'Volatility Specialist',
    primaryFamilies: ['VOLATILITY'],
    secondaryFamilies: ['PRICE_STRUCTURE'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'STATISTICAL_SPREAD'
  },
  VOLATILITY_SQUEEZE: {
    agentId: 'VOLATILITY_SQUEEZE',
    agentName: 'Volatility Squeeze Specialist',
    primaryFamilies: ['VOLATILITY', 'MOMENTUM'],
    secondaryFamilies: ['PRICE_STRUCTURE'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'COMPRESSION_EXPANSION'
  },
  ANCHORED_VWAP: {
    agentId: 'ANCHORED_VWAP',
    agentName: 'Anchored VWAP Specialist',
    primaryFamilies: ['INSTITUTIONAL_PROXY', 'PRICE_STRUCTURE'],
    secondaryFamilies: ['LIQUIDITY'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'VWAP_ANCHOR'
  },
  MARKET_REGIME_CLASSIFIER: {
    agentId: 'MARKET_REGIME_CLASSIFIER',
    agentName: 'Market Regime Classifier',
    primaryFamilies: ['PRICE_STRUCTURE', 'VOLATILITY'],
    secondaryFamilies: ['MOMENTUM'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'REGIME_CLASSIFICATION'
  },
  ORDER_FLOW_DELTA: {
    agentId: 'ORDER_FLOW_DELTA',
    agentName: 'Order Flow Delta Specialist',
    primaryFamilies: ['ORDER_FLOW_PROXY'],
    secondaryFamilies: ['MOMENTUM'],
    independenceGroup: 'BROKER_TICK_PROXY',
    isDerived: true,
    derivationType: 'CUMULATIVE_DELTA_PROXY'
  },
  QUANT_MOMENTUM: {
    agentId: 'QUANT_MOMENTUM',
    agentName: 'Quant Momentum Specialist',
    primaryFamilies: ['MOMENTUM', 'PRICE_STRUCTURE'],
    secondaryFamilies: ['VOLATILITY'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'QUANT_OSCILLATOR'
  },
  QUANT_MONTE_CARLO: {
    agentId: 'QUANT_MONTE_CARLO',
    agentName: 'Quant Monte Carlo Specialist',
    primaryFamilies: ['MONTE_CARLO', 'RISK'],
    secondaryFamilies: ['VOLATILITY'],
    independenceGroup: 'PRICE_OHLC_DERIVED',
    isDerived: true,
    derivationType: 'STRESS_SIMULATION'
  },
  CROSS_ASSET: {
    agentId: 'CROSS_ASSET',
    agentName: 'Cross Asset Specialist',
    primaryFamilies: ['CROSS_ASSET'],
    secondaryFamilies: [],
    independenceGroup: 'CROSS_ASSET_QUOTES',
    isDerived: true,
    derivationType: 'CORRELATION_MATRIX'
  },
  CROSS_ASSET_LEAD_LAG: {
    agentId: 'CROSS_ASSET_LEAD_LAG',
    agentName: 'Cross Asset Lead-Lag Specialist',
    primaryFamilies: ['CROSS_ASSET', 'MOMENTUM'],
    secondaryFamilies: [],
    independenceGroup: 'CROSS_ASSET_QUOTES',
    isDerived: true,
    derivationType: 'LEAD_LAG_REGRESSION'
  },
  CURRENCY_STRENGTH: {
    agentId: 'CURRENCY_STRENGTH',
    agentName: 'Currency Strength Specialist',
    primaryFamilies: ['CROSS_ASSET', 'MOMENTUM'],
    secondaryFamilies: [],
    independenceGroup: 'CROSS_ASSET_QUOTES',
    isDerived: true,
    derivationType: 'RELATIVE_STRENGTH'
  },
  RATES: {
    agentId: 'RATES',
    agentName: 'Rates Specialist',
    primaryFamilies: ['MACRO'],
    secondaryFamilies: ['CROSS_ASSET'],
    independenceGroup: 'MACRO_ECONOMIC',
    isDerived: false,
    derivationType: 'YIELD_CURVE'
  },
  INFLATION: {
    agentId: 'INFLATION',
    agentName: 'Inflation Specialist',
    primaryFamilies: ['MACRO'],
    secondaryFamilies: [],
    independenceGroup: 'MACRO_ECONOMIC',
    isDerived: false,
    derivationType: 'INFLATION_METRICS'
  },
  MACRO_CORRELATOR: {
    agentId: 'MACRO_CORRELATOR',
    agentName: 'Macro Correlator Specialist',
    primaryFamilies: ['MACRO', 'CROSS_ASSET'],
    secondaryFamilies: [],
    independenceGroup: 'MACRO_ECONOMIC',
    isDerived: true,
    derivationType: 'INTERMARKET_MACRO'
  },
  CENTRAL_BANK_POLICY: {
    agentId: 'CENTRAL_BANK_POLICY',
    agentName: 'Central Bank Policy Specialist',
    primaryFamilies: ['MACRO'],
    secondaryFamilies: ['CROSS_ASSET'],
    independenceGroup: 'MACRO_ECONOMIC',
    isDerived: false,
    derivationType: 'POLICY_DIFFERENTIAL'
  },
  COT_POSITIONING: {
    agentId: 'COT_POSITIONING',
    agentName: 'COT Positioning Specialist',
    primaryFamilies: ['POSITIONING'],
    secondaryFamilies: ['INSTITUTIONAL_PROXY'],
    independenceGroup: 'CFTC_REGULATORY',
    isDerived: false,
    derivationType: 'COMMERCIAL_NET_POSITIONING'
  },
  ECONOMIC_NEWS_MOMENTUM: {
    agentId: 'ECONOMIC_NEWS_MOMENTUM',
    agentName: 'Economic News Momentum Specialist',
    primaryFamilies: ['NEWS', 'MOMENTUM'],
    secondaryFamilies: ['MACRO'],
    independenceGroup: 'NEWSWIRE',
    isDerived: false,
    derivationType: 'CALENDAR_SURPRISE'
  },

  // 1 Downstream Synthesizer (Excluded from upstream voting/consensus)
  FINAL_DECISION: {
    agentId: 'FINAL_DECISION',
    agentName: 'Final Decision Agent',
    primaryFamilies: [],
    secondaryFamilies: [],
    independenceGroup: 'SYNTHESIZER',
    isDerived: true,
    derivationType: 'SWARM_SYNTHESIS',
    isSynthesizer: true
  }
};

export type SetupMaturityState =
  | 'UNAVAILABLE'
  | 'DATA_LIMITED'
  | 'OBSERVING'
  | 'WATCH'
  | 'SETUP_FORMING'
  | 'VALIDATED_SETUP'
  | 'INVALIDATED';

export interface VetoRecord {
  type: 'HARD_VETO' | 'SOFT_VETO';
  source: 'DATA_SENTINEL' | 'RISK_GUARDIAN' | 'SESSION' | 'MARKET_DATA' | 'CONFLICT_ENGINE';
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  effect: 'FORCE_WAIT' | 'BLOCK_SETUP_VALIDATION' | 'DOWNGRADE_MATURITY' | 'CAP_CONFIDENCE';
}

export interface ConflictRecord {
  type: 'INTRA_DOMAIN' | 'CROSS_DOMAIN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  parties: string[];
}

export interface DomainConsensusResult {
  family: CanonicalEvidenceFamily;
  polarity: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CONFLICT';
  readiness: 'READY' | 'PARTIAL' | 'STALE' | 'DATA_LIMITED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
  trust: number;               // 0 to 100
  quality: number;             // 0 to 100
  participatingAgentCount: number;
  independenceGroup: IndependenceGroup;
  primaryAgents: string[];
}

export interface SessionContextModel {
  marketAvailability: 'OPEN' | 'CLOSED' | 'UNAVAILABLE';
  sessionModel: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP' | 'CONTINUOUS_24_7' | 'OFF_HOURS';
  killzoneWindow: 'ACTIVE' | 'INACTIVE' | 'NOT_APPLICABLE';
  is24x7: boolean;
  statusLabel: string;
}

export const NON_DIRECTIONAL_DOMAINS: CanonicalEvidenceFamily[] = [
  'SESSION',
  'DATA_QUALITY',
  'RISK'
];

export interface DecisionIntelligenceV2 {
  maturity: SetupMaturityState;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  evidenceCompleteness: number;

  registeredAgentCount: number; // 32
  upstreamAgentCount: number;   // 31

  domains: DomainConsensusResult[];

  independentDomainCount: number;
  supportingDomains: CanonicalEvidenceFamily[];
  opposingDomains: CanonicalEvidenceFamily[];
  unavailableDomains: CanonicalEvidenceFamily[];

  hardVetoes: VetoRecord[];
  softVetoes: VetoRecord[];
  conflicts: ConflictRecord[];

  requirementsToAdvance: string[];
  blockingConditions: string[];
  invalidationConditions: string[];

  explanation: string;
  sessionContext: SessionContextModel;
  tradeExecutable: false; // Always false in READ_ONLY local mode
  executionMode: 'READ_ONLY';
  mt5OrderTransportEnabled: false;

  snapshotId: string;
  asOf: number;
  generatedAt: number;

  legacyCompatibility: {
    confluenceScore: number;
    conflictScore: number;
    decisionPosture: string;
    directionalBias: string;
    setupQuality: number;
  };
}

export interface DecisionEvaluationInputs {
  evidenceBundle: CanonicalEvidenceBundle;
  agents: any[];
  hasBlueprint?: boolean;
  dataSentinelOverride?: { status: string; reason?: string };
  requireActiveKillzone?: boolean;
}

export class DecisionEngineV2 {
  /**
   * Resolves canonical dependency metadata for an agent.
   */
  public getAgentDependency(agentIdOrType: string): AgentDependencyMetadata {
    const norm = (agentIdOrType || '').toUpperCase().replace(/[\s-]/g, '_');
    if (AGENT_DEPENDENCY_REGISTRY[norm]) {
      return AGENT_DEPENDENCY_REGISTRY[norm];
    }
    // Alias lookups
    if (norm === 'VOLATILITYSPECIALIST' || norm === 'VOLATILITY') return AGENT_DEPENDENCY_REGISTRY['VOLATILITY'];
    if (norm === 'VOLATILITYSQUEEZESPECIALIST' || norm === 'VOLATILITY_SQUEEZE') return AGENT_DEPENDENCY_REGISTRY['VOLATILITY_SQUEEZE'];
    if (norm === 'ANCHOREDVWAPSPECIALIST' || norm === 'ANCHORED_VWAP') return AGENT_DEPENDENCY_REGISTRY['ANCHORED_VWAP'];
    if (norm === 'MARKETREGIMECLASSIFIERSPECIALIST' || norm === 'MARKET_REGIME_CLASSIFIER') return AGENT_DEPENDENCY_REGISTRY['MARKET_REGIME_CLASSIFIER'];
    if (norm === 'ORDERFLOWDELTASPECIALIST' || norm === 'ORDER_FLOW_DELTA') return AGENT_DEPENDENCY_REGISTRY['ORDER_FLOW_DELTA'];
    if (norm === 'QUANTSPECIALIST' || norm === 'QUANT_MOMENTUM') return AGENT_DEPENDENCY_REGISTRY['QUANT_MOMENTUM'];
    if (norm === 'QUANTMONTECARLOSPECIALIST' || norm === 'QUANT_MONTE_CARLO') return AGENT_DEPENDENCY_REGISTRY['QUANT_MONTE_CARLO'];
    if (norm === 'CROSSASSETSPECIALIST' || norm === 'CROSS_ASSET') return AGENT_DEPENDENCY_REGISTRY['CROSS_ASSET'];
    if (norm === 'CROSSASSETLEADLAGSPECIALIST' || norm === 'CROSS_ASSET_LEAD_LAG') return AGENT_DEPENDENCY_REGISTRY['CROSS_ASSET_LEAD_LAG'];
    if (norm === 'CURRENCYSTRENGTHSPECIALIST' || norm === 'CURRENCY_STRENGTH') return AGENT_DEPENDENCY_REGISTRY['CURRENCY_STRENGTH'];
    if (norm === 'RATESSPECIALIST' || norm === 'RATES') return AGENT_DEPENDENCY_REGISTRY['RATES'];
    if (norm === 'INFLATIONSPECIALIST' || norm === 'INFLATION') return AGENT_DEPENDENCY_REGISTRY['INFLATION'];
    if (norm === 'MACROCORRELATORSPECIALIST' || norm === 'MACRO_CORRELATOR') return AGENT_DEPENDENCY_REGISTRY['MACRO_CORRELATOR'];
    if (norm === 'CENTRALBANKPOLICYSPECIALIST' || norm === 'CENTRAL_BANK_POLICY') return AGENT_DEPENDENCY_REGISTRY['CENTRAL_BANK_POLICY'];
    if (norm === 'COTPOSITIONINGSPECIALIST' || norm === 'COT_POSITIONING') return AGENT_DEPENDENCY_REGISTRY['COT_POSITIONING'];
    if (norm === 'ECONOMICNEWSMOMENTUMSPECIALIST' || norm === 'ECONOMIC_NEWS_MOMENTUM') return AGENT_DEPENDENCY_REGISTRY['ECONOMIC_NEWS_MOMENTUM'];
    if (norm === 'DATASENTINELSPECIALIST' || norm === 'DATA_SENTINEL') return AGENT_DEPENDENCY_REGISTRY['DATA_SENTINEL'];

    // Default fallback
    return {
      agentId: agentIdOrType,
      agentName: agentIdOrType,
      primaryFamilies: ['PRICE_STRUCTURE'],
      secondaryFamilies: [],
      independenceGroup: 'PRICE_OHLC_DERIVED',
      isDerived: true,
      derivationType: 'UNKNOWN'
    };
  }

  /**
  /**
   * Evaluates domain applicability for a specific asset symbol.
   * All 16 canonical evidence families are applicable.
   */
  public getDomainApplicability(symbol: string): Record<CanonicalEvidenceFamily, 'APPLICABLE' | 'NOT_APPLICABLE'> {
    const result: Record<CanonicalEvidenceFamily, 'APPLICABLE' | 'NOT_APPLICABLE'> = {} as any;
    for (const fam of CANONICAL_EVIDENCE_FAMILIES) {
      result[fam] = 'APPLICABLE';
    }
    return result;
  }

  /**
   * Evaluates session applicability.
   */
  public evaluateSessionApplicability(symbol: string): { is24x7: boolean; penalizeClosedForexSessions: boolean } {
    const assetClass = resolveAssetClass(symbol);
    const isCrypto = assetClass === 'CRYPTO';
    return {
      is24x7: isCrypto,
      penalizeClosedForexSessions: !isCrypto
    };
  }

  /**
   * Evaluates session context model for an asset.
   */
  public evaluateSessionContext(symbol: string, bundle: CanonicalEvidenceBundle): SessionContextModel {
    const norm = (symbol || '').toUpperCase().trim();
    const assetClass = resolveAssetClass(norm);
    const isCrypto = assetClass === 'CRYPTO';

    // 1. Fail-closed / unavailable check
    if (
      bundle?.market?.marketState === 'UNAVAILABLE' ||
      bundle?.market?.quoteFreshness === 'UNAVAILABLE' ||
      bundle?.provenance?.classification === 'UNAVAILABLE' ||
      norm === 'GER40'
    ) {
      return {
        marketAvailability: 'UNAVAILABLE',
        sessionModel: 'OFF_HOURS',
        killzoneWindow: 'INACTIVE',
        is24x7: isCrypto,
        statusLabel: 'TELEMETRY UNAVAILABLE'
      };
    }

    // 2. Crypto 24/7 continuous session
    if (isCrypto) {
      return {
        marketAvailability: 'OPEN',
        sessionModel: 'CONTINUOUS_24_7',
        killzoneWindow: 'NOT_APPLICABLE',
        is24x7: true,
        statusLabel: '24/7 ACTIVE'
      };
    }

    // 3. Non-crypto (Forex, Metals, Energies, Indices)
    const marketState = bundle?.market?.marketState;
    const sessionState = bundle?.market?.sessionState;

    const isClosed =
      (marketState as string) === 'WEEKEND_CLOSED' ||
      marketState === 'CLOSED' ||
      marketState === 'DAILY_BREAK' ||
      sessionState?.marketState === 'WEEKEND_CLOSED' ||
      sessionState?.marketState === 'CLOSED' ||
      sessionState?.marketState === 'DAILY_BREAK' ||
      (sessionState && sessionState.isOpen === false);

    if (isClosed) {
      return {
        marketAvailability: 'CLOSED',
        sessionModel: 'OFF_HOURS',
        killzoneWindow: 'INACTIVE',
        is24x7: false,
        statusLabel: marketState || 'MARKET CLOSED'
      };
    }

    // Market is OPEN
    let sessionModel: 'ASIA' | 'LONDON' | 'NEW_YORK' | 'OVERLAP' | 'CONTINUOUS_24_7' | 'OFF_HOURS' = 'ASIA';
    let killzoneWindow: 'ACTIVE' | 'INACTIVE' | 'NOT_APPLICABLE' = 'INACTIVE';

    const sName = (sessionState?.sessionName || '').toUpperCase();
    if (sName.includes('LONDON') && (sName.includes('NEW YORK') || sName.includes('NY') || sName.includes('OVERLAP'))) {
      sessionModel = 'OVERLAP';
      killzoneWindow = 'ACTIVE';
    } else if (sName.includes('LONDON')) {
      sessionModel = 'LONDON';
      killzoneWindow = 'ACTIVE';
    } else if (sName.includes('NEW YORK') || sName.includes('NY')) {
      sessionModel = 'NEW_YORK';
      killzoneWindow = 'ACTIVE';
    } else if (sName.includes('ASIA') || sName.includes('ASIAN') || sName.includes('TOKYO')) {
      sessionModel = 'ASIA';
      killzoneWindow = 'INACTIVE';
    } else {
      const asOfDate = new Date(bundle?.asOf || Date.now());
      const utcHour = asOfDate.getUTCHours();
      if (utcHour >= 12 && utcHour < 16) {
        sessionModel = 'OVERLAP';
        killzoneWindow = 'ACTIVE';
      } else if (utcHour >= 7 && utcHour < 12) {
        sessionModel = 'LONDON';
        killzoneWindow = 'ACTIVE';
      } else if (utcHour >= 16 && utcHour < 21) {
        sessionModel = 'NEW_YORK';
        killzoneWindow = 'ACTIVE';
      } else if (utcHour >= 0 && utcHour < 7) {
        sessionModel = 'ASIA';
        killzoneWindow = 'INACTIVE';
      } else {
        sessionModel = 'OFF_HOURS';
        killzoneWindow = 'INACTIVE';
      }
    }

    return {
      marketAvailability: 'OPEN',
      sessionModel,
      killzoneWindow,
      is24x7: false,
      statusLabel: `${sessionModel} SESSION`
    };
  }

  /**
   * Primary V2 synthesis method.
   */
  public evaluateDecision(inputs: DecisionEvaluationInputs): DecisionIntelligenceV2 {
    const { evidenceBundle, agents, hasBlueprint, dataSentinelOverride } = inputs;
    const symbol = evidenceBundle.symbol || 'XAUUSD';
    const snapshotId = evidenceBundle.snapshotId;
    const asOf = evidenceBundle.asOf;
    const generatedAt = Date.now();

    const hardVetoes: VetoRecord[] = [];
    const softVetoes: VetoRecord[] = [];
    const conflicts: ConflictRecord[] = [];
    const requirementsToAdvance: string[] = [];
    const blockingConditions: string[] = [];
    const invalidationConditions: string[] = [];

    const sessionContext = this.evaluateSessionContext(symbol, evidenceBundle);

    // 1. Fail-closed check: Instrument availability
    if (
      evidenceBundle.market.marketState === 'UNAVAILABLE' ||
      evidenceBundle.provenance.classification === 'UNAVAILABLE' ||
      symbol === 'GER40'
    ) {
      hardVetoes.push({
        type: 'HARD_VETO',
        source: 'MARKET_DATA',
        reason: 'Broker instrument telemetry unavailable or fail-closed',
        severity: 'CRITICAL',
        effect: 'FORCE_WAIT'
      });
      blockingConditions.push('Broker instrument telemetry is unavailable in local MT5 bridge.');
      requirementsToAdvance.push('Verify MT5 broker quotes and subscriptions for instrument.');

      return {
        maturity: 'UNAVAILABLE',
        bias: 'NEUTRAL',
        confidence: 0,
        evidenceCompleteness: 0,
        registeredAgentCount: 32,
        upstreamAgentCount: 31,
        domains: [],
        independentDomainCount: 0,
        supportingDomains: [],
        opposingDomains: [],
        unavailableDomains: CANONICAL_EVIDENCE_FAMILIES,
        hardVetoes,
        softVetoes: [],
        conflicts: [],
        requirementsToAdvance,
        blockingConditions,
        invalidationConditions: ['Telemetry unavailable'],
        explanation: 'UNAVAILABLE: Instrument telemetry is not provided by active broker connection.',
        sessionContext,
        tradeExecutable: false,
        executionMode: 'READ_ONLY',
        mt5OrderTransportEnabled: false,
        snapshotId,
        asOf,
        generatedAt,
        legacyCompatibility: {
          confluenceScore: 0,
          conflictScore: 0,
          decisionPosture: 'DATA LIMITED',
          directionalBias: 'NEUTRAL',
          setupQuality: 0
        }
      };
    }

    // 2. Data Sentinel / Telemetry Freshness checks
    if (dataSentinelOverride && dataSentinelOverride.status === 'ERROR') {
      hardVetoes.push({
        type: 'HARD_VETO',
        source: 'DATA_SENTINEL',
        reason: dataSentinelOverride.reason || 'Data Sentinel reported critical telemetry corruption',
        severity: 'CRITICAL',
        effect: 'FORCE_WAIT'
      });
      blockingConditions.push(`Data Sentinel critical error: ${dataSentinelOverride.reason || 'Telemetry corruption'}`);
    } else if (
      (evidenceBundle.provenance.source === 'MT5_BROKER' || evidenceBundle.provenance.classification === 'LIVE_MT5') &&
      (evidenceBundle.market.quoteFreshness === 'STALE' || evidenceBundle.market.quoteAgeMs > 60_000)
    ) {
      hardVetoes.push({
        type: 'HARD_VETO',
        source: 'DATA_SENTINEL',
        reason: `Broker quote is stale (${evidenceBundle.market.quoteAgeMs}ms age)`,
        severity: 'CRITICAL',
        effect: 'FORCE_WAIT'
      });
      blockingConditions.push(`Stale quote age (${evidenceBundle.market.quoteAgeMs}ms) violates 60s freshness gate.`);
    } else if (
      evidenceBundle.provenance.source === 'REFERENCE_MARKET' &&
      (evidenceBundle.market.quoteFreshness === 'UNAVAILABLE' || evidenceBundle.market.price <= 0)
    ) {
      hardVetoes.push({
        type: 'HARD_VETO',
        source: 'DATA_SENTINEL',
        reason: `Reference market price is unavailable`,
        severity: 'CRITICAL',
        effect: 'FORCE_WAIT'
      });
      blockingConditions.push(`Reference market price is unavailable.`);
    }

    // 3. Market Session Check
    if (sessionContext.marketAvailability === 'CLOSED') {
      hardVetoes.push({
        type: 'HARD_VETO',
        source: 'SESSION',
        reason: `Market session is currently closed (${evidenceBundle.market.marketState || 'CLOSED'})`,
        severity: 'HIGH',
        effect: 'FORCE_WAIT'
      });
      blockingConditions.push(`Session closed: ${evidenceBundle.market.marketState || 'CLOSED'}.`);
    } else if (sessionContext.marketAvailability === 'OPEN' && sessionContext.killzoneWindow === 'INACTIVE' && inputs.requireActiveKillzone) {
      softVetoes.push({
        type: 'SOFT_VETO',
        source: 'SESSION',
        reason: 'Current market session is outside active strategy killzone window',
        severity: 'MEDIUM',
        effect: 'CAP_CONFIDENCE'
      });
      blockingConditions.push('Outside active strategy killzone window.');
    }

    // 4. Filter upstream agents (strictly excluding FINAL_DECISION synthesizer)
    const upstreamAgents = agents.filter((a) => {
      const dep = this.getAgentDependency(a.agentId || a.type || a.name);
      return !dep.isSynthesizer && a.agentId !== 'FINAL_DECISION' && a.type !== 'FINAL_DECISION';
    });

    // 5. Invalidation conditions from agents
    for (const ag of upstreamAgents) {
      if (ag.invalidation && !invalidationConditions.includes(ag.invalidation)) {
        invalidationConditions.push(ag.invalidation);
      }
    }

    // 6. Level 1: Domain-Level Consensus & Correlated-Vote Cap
    // Group agents by primary evidence family and independence group
    const domainBuckets = new Map<CanonicalEvidenceFamily, any[]>();
    for (const fam of CANONICAL_EVIDENCE_FAMILIES) {
      domainBuckets.set(fam, []);
    }

    for (const ag of upstreamAgents) {
      const dep = this.getAgentDependency(ag.agentId || ag.type || ag.name);
      for (const fam of dep.primaryFamilies) {
        domainBuckets.get(fam)?.push({ agent: ag, dep });
      }
    }

    const domainConsensusList: DomainConsensusResult[] = [];
    const supportingDomains: CanonicalEvidenceFamily[] = [];
    const opposingDomains: CanonicalEvidenceFamily[] = [];
    const unavailableDomains: CanonicalEvidenceFamily[] = [];
    const activeIndependenceGroups = new Set<IndependenceGroup>();

    const applicability = this.getDomainApplicability(symbol);

    for (const fam of CANONICAL_EVIDENCE_FAMILIES) {
      const entries = domainBuckets.get(fam) || [];
      const isApplicable = applicability[fam] === 'APPLICABLE';

      if (!isApplicable) {
        domainConsensusList.push({
          family: fam,
          polarity: 'NEUTRAL',
          readiness: 'NOT_APPLICABLE',
          trust: 100,
          quality: 100,
          participatingAgentCount: 0,
          independenceGroup: 'EXCHANGE_CLOCK',
          primaryAgents: []
        });
        continue;
      }

      // Handle non-directional contextual domains
      if (NON_DIRECTIONAL_DOMAINS.includes(fam)) {
        let domainReadiness: 'READY' | 'PARTIAL' | 'STALE' | 'DATA_LIMITED' | 'UNAVAILABLE' | 'NOT_APPLICABLE' = 'READY';
        let trust = 90;
        let quality = 90;
        let indGroup: IndependenceGroup = 'EXCHANGE_CLOCK';

        if (fam === 'SESSION') {
          indGroup = 'EXCHANGE_CLOCK';
          if (sessionContext.marketAvailability === 'UNAVAILABLE') {
            domainReadiness = 'UNAVAILABLE';
            trust = 0;
            quality = 0;
            unavailableDomains.push(fam);
          } else if (sessionContext.marketAvailability === 'CLOSED') {
            domainReadiness = 'PARTIAL';
            trust = 85;
            quality = 85;
          } else {
            domainReadiness = 'READY';
            trust = 90;
            quality = 90;
          }
        } else if (fam === 'DATA_QUALITY') {
          indGroup = 'TELEMETRY_SUPERVISOR';
          if (dataSentinelOverride && dataSentinelOverride.status === 'ERROR') {
            domainReadiness = 'UNAVAILABLE';
            trust = 0;
            quality = 0;
            unavailableDomains.push(fam);
          } else if (evidenceBundle.market.quoteFreshness === 'STALE' || evidenceBundle.market.quoteAgeMs > 60_000) {
            domainReadiness = 'STALE';
            trust = 30;
            quality = 30;
          } else {
            domainReadiness = 'READY';
            trust = 100;
            quality = 100;
          }
        } else if (fam === 'RISK') {
          indGroup = 'RISK_ENGINE';
          domainReadiness = 'READY';
          trust = 95;
          quality = 95;
        }

        const participatingAgents = entries.map(e => e.agent.agentName || e.agent.agentId || 'Agent');

        domainConsensusList.push({
          family: fam,
          polarity: 'NEUTRAL',
          readiness: domainReadiness,
          trust,
          quality,
          participatingAgentCount: entries.length,
          independenceGroup: indGroup,
          primaryAgents: participatingAgents
        });

        // Invariant: Non-directional domains NEVER manufacture directional consensus
        // or inflate independentDomainCount.
        continue;
      }

      if (entries.length === 0) {
        domainConsensusList.push({
          family: fam,
          polarity: 'NEUTRAL',
          readiness: 'DATA_LIMITED',
          trust: 0,
          quality: 0,
          participatingAgentCount: 0,
          independenceGroup: 'PRICE_OHLC_DERIVED',
          primaryAgents: []
        });
        unavailableDomains.push(fam);
        continue;
      }

      // Group entries by independenceGroup to apply diminishing weights within correlated groups
      const byGroup = new Map<IndependenceGroup, any[]>();
      for (const item of entries) {
        const grp = item.dep.independenceGroup;
        if (!byGroup.has(grp)) byGroup.set(grp, []);
        byGroup.get(grp)!.push(item);
      }

      let bullishWeightedScore = 0;
      let bearishWeightedScore = 0;
      let totalTrustAccum = 0;
      let totalQualityAccum = 0;
      let totalWeightAccum = 0;
      const participatingAgents: string[] = [];

      let hasReady = false;
      let hasPartial = false;
      let hasStale = false;
      let hasDataLimited = false;
      let hasUnavailable = false;

      for (const [grp, grpEntries] of Array.from(byGroup.entries())) {
        // Sort agents by trust/confidence descending so highest-quality interpretation gets w=1.0
        grpEntries.sort((a, b) => (b.agent.evidenceTrust || b.agent.confidence || 0) - (a.agent.evidenceTrust || a.agent.confidence || 0));

        grpEntries.forEach((item, idx) => {
          const ag = item.agent;
          participatingAgents.push(ag.agentName || ag.agentId || 'Agent');

          if (ag.readiness === 'READY') { hasReady = true; }
          else if (ag.readiness === 'PARTIAL') { hasPartial = true; }
          else if (ag.readiness === 'STALE') { hasStale = true; }
          else if (ag.readiness === 'DATA_LIMITED') { hasDataLimited = true; }
          else if (ag.readiness === 'UNAVAILABLE') { hasUnavailable = true; }

          // Correlated diminishing return formula: w_k = 0.5^(idx)
          // idx=0: 1.0, idx=1: 0.5, idx=2: 0.25, idx=3: 0.125...
          // 7 correlated agents have total weight ~1.984 (strictly capped < 2.0)
          const weight = Math.pow(0.5, idx);
          const conf = ag.confidence || 0;
          const trust = ag.evidenceTrust ?? conf;

          // Check if evidence records are valid direct or derived evidence
          const evList = ag.evidence || [];
          const isStaticOnly = evList.length > 0 && evList.every((e: any) =>
            e.classification === 'STATIC_REFERENCE' || e.classification === 'MOCK' || e.classification === 'FALLBACK' || !e.decisionEligible
          );

          if (!isStaticOnly && ag.readiness !== 'UNAVAILABLE' && ag.readiness !== 'DATA_LIMITED' && conf > 0) {
            const dir = ag.direction || ag.bias;
            if (dir === 'BULLISH') {
              bullishWeightedScore += weight * (conf / 100) * (trust / 100);
            } else if (dir === 'BEARISH') {
              bearishWeightedScore += weight * (conf / 100) * (trust / 100);
            }
          }

          totalTrustAccum += trust;
          totalQualityAccum += conf;
          totalWeightAccum += weight;
        });
      }

      const domainReadiness: 'READY' | 'PARTIAL' | 'STALE' | 'DATA_LIMITED' | 'UNAVAILABLE' | 'NOT_APPLICABLE' =
        hasReady ? 'READY' :
        hasPartial ? 'PARTIAL' :
        hasStale ? 'STALE' :
        hasDataLimited ? 'DATA_LIMITED' :
        hasUnavailable ? 'UNAVAILABLE' : 'DATA_LIMITED';

      if (domainReadiness === 'UNAVAILABLE' || domainReadiness === 'DATA_LIMITED') {
        unavailableDomains.push(fam);
      }

      const avgTrust = entries.length > 0 ? Math.round(totalTrustAccum / entries.length) : 0;
      const avgQuality = entries.length > 0 ? Math.round(totalQualityAccum / entries.length) : 0;

      // Check for intra-domain conflict whenever both sides have active participation
      if (bullishWeightedScore > 0.2 && bearishWeightedScore > 0.2) {
        conflicts.push({
          type: 'INTRA_DOMAIN',
          severity: 'MEDIUM',
          description: `Internal disagreement in evidence family ${fam} between bullish and bearish agents.`,
          parties: participatingAgents
        });
      }

      // Determine domain polarity
      let domainPolarity: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CONFLICT' = 'NEUTRAL';
      if (bullishWeightedScore > 0.35 && bullishWeightedScore > bearishWeightedScore * 1.4) {
        domainPolarity = 'BULLISH';
        supportingDomains.push(fam);
        entries.forEach(e => activeIndependenceGroups.add(e.dep.independenceGroup));
      } else if (bearishWeightedScore > 0.35 && bearishWeightedScore > bullishWeightedScore * 1.4) {
        domainPolarity = 'BEARISH';
        opposingDomains.push(fam);
        entries.forEach(e => activeIndependenceGroups.add(e.dep.independenceGroup));
      } else if (bullishWeightedScore > 0.2 && bearishWeightedScore > 0.2) {
        domainPolarity = 'CONFLICT';
      }

      domainConsensusList.push({
        family: fam,
        polarity: domainPolarity,
        readiness: domainReadiness,
        trust: avgTrust,
        quality: avgQuality,
        participatingAgentCount: entries.length,
        independenceGroup: entries[0]?.dep?.independenceGroup || 'PRICE_OHLC_DERIVED',
        primaryAgents: participatingAgents
      });
    }

    // 7. Check Cross-Domain Conflicts & Risk Guardian
    const rgAgent = upstreamAgents.find(a => a.agentId === 'RISK_GUARDIAN' || a.type === 'RISK_GUARDIAN');
    if (rgAgent) {
      if (rgAgent.bias === 'RESTRICTED' || rgAgent.direction === 'RESTRICTED') {
        hardVetoes.push({
          type: 'HARD_VETO',
          source: 'RISK_GUARDIAN',
          reason: rgAgent.keyRisk || 'Risk Guardian mathematical exposure limits reached',
          severity: 'CRITICAL',
          effect: 'BLOCK_SETUP_VALIDATION'
        });
        blockingConditions.push(`Risk Guardian restriction: ${rgAgent.keyRisk || 'Exposure limits exceeded'}`);
      } else if (rgAgent.direction === 'CAUTION' || rgAgent.bias === 'CAUTION') {
        softVetoes.push({
          type: 'SOFT_VETO',
          source: 'RISK_GUARDIAN',
          reason: rgAgent.keyRisk || 'Risk Guardian elevated caution',
          severity: 'MEDIUM',
          effect: 'CAP_CONFIDENCE'
        });
        blockingConditions.push(`Risk Guardian caution active: ${rgAgent.keyRisk || 'Elevated risk parameters'}`);
      }
    }

    // Cross-Domain disagreement (e.g. Technical Bullish vs Macro Bearish)
    if (supportingDomains.length > 0 && opposingDomains.length > 0) {
      conflicts.push({
        type: 'CROSS_DOMAIN',
        severity: 'HIGH',
        description: `Cross-domain thesis conflict: ${supportingDomains.join(', ')} (BULLISH) vs ${opposingDomains.join(', ')} (BEARISH).`,
        parties: [...supportingDomains, ...opposingDomains]
      });
      softVetoes.push({
        type: 'SOFT_VETO',
        source: 'CONFLICT_ENGINE',
        reason: 'Cross-domain thesis disagreement between supporting and opposing evidence families',
        severity: 'HIGH',
        effect: 'DOWNGRADE_MATURITY'
      });
      blockingConditions.push(`Major cross-domain disagreement between ${supportingDomains.join(', ')} and ${opposingDomains.join(', ')}.`);
    }

    // 8. Level 2: Cross-Domain Independence Count & Setup Maturity
    // Distinct independent evidence groups active with clear polarity
    const independentDomainCount = activeIndependenceGroups.size;

    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (supportingDomains.length > opposingDomains.length) {
      bias = 'BULLISH';
    } else if (opposingDomains.length > supportingDomains.length) {
      bias = 'BEARISH';
    }

    let maturity: SetupMaturityState = 'OBSERVING';

    if (hardVetoes.length > 0) {
      maturity = 'DATA_LIMITED';
    } else if (evidenceBundle.timeframes.M15.state === 'INSUFFICIENT_DATA') {
      maturity = 'DATA_LIMITED';
      requirementsToAdvance.push('Awaiting sufficient M15 closed bars from broker.');
    } else if (independentDomainCount === 0 || (supportingDomains.length === 0 && opposingDomains.length === 0)) {
      maturity = 'OBSERVING';
      requirementsToAdvance.push('Awaiting directional alignment across primary evidence domains.');
    } else if (independentDomainCount === 1) {
      // Correlated technical only (e.g. 7 candle agents) can reach WATCH, but NEVER VALIDATED_SETUP!
      maturity = 'WATCH';
      requirementsToAdvance.push('Requires confirmation from at least 1 additional independent domain (e.g. Order Flow or Cross-Asset or Macro).');
      if (!hasBlueprint) {
        requirementsToAdvance.push('Requires active valid trade blueprint with R:R > 2.0.');
      }
    } else if (independentDomainCount === 2) {
      if (conflicts.length > 0 || softVetoes.length > 0) {
        maturity = 'WATCH';
        requirementsToAdvance.push('Resolve active cross-domain conflict to advance to SETUP_FORMING.');
      } else {
        maturity = 'SETUP_FORMING';
        requirementsToAdvance.push('Requires 3rd independent confirmation domain and confirmed execution blueprint for VALIDATED_SETUP.');
      }
    } else if (independentDomainCount >= 3) {
      if (conflicts.length > 0 || softVetoes.length > 0) {
        maturity = 'SETUP_FORMING';
        requirementsToAdvance.push('Resolve active conflicts to advance to VALIDATED_SETUP.');
      } else if (hasBlueprint) {
        maturity = 'VALIDATED_SETUP';
      } else {
        maturity = 'SETUP_FORMING';
        requirementsToAdvance.push('Requires verified trade blueprint structure with asymmetric entry zone.');
      }
    }

    // 9. Deterministic Confidence Calculation
    let confidence = 0;
    if (hardVetoes.length > 0 || maturity === 'DATA_LIMITED') {
      confidence = 0;
    } else {
      // Base confidence proportional to independent domains and domain trust
      const activeDomains = domainConsensusList.filter(d => d.polarity === bias && d.trust > 0);
      const avgActiveTrust = activeDomains.length > 0
        ? activeDomains.reduce((acc, d) => acc + d.trust, 0) / activeDomains.length
        : 50;

      if (maturity === 'OBSERVING') {
        confidence = Math.min(20, Math.round(avgActiveTrust * 0.2));
      } else if (maturity === 'WATCH') {
        confidence = Math.min(55, Math.round(avgActiveTrust * 0.55));
      } else if (maturity === 'SETUP_FORMING') {
        confidence = Math.min(75, Math.round(avgActiveTrust * 0.75));
      } else if (maturity === 'VALIDATED_SETUP') {
        confidence = Math.min(95, Math.round(avgActiveTrust * 0.90));
      }

      // Conflict penalty
      if (conflicts.length > 0) {
        confidence = Math.max(10, confidence - (conflicts.length * 15));
      }

      // Soft veto cap
      if (softVetoes.length > 0) {
        confidence = Math.min(65, confidence);
      }
    }

    // 10. Structured Explainability Engine
    let explanation = `POSTURE: ${maturity} | BIAS: ${bias} | CONFIDENCE: ${confidence}%\n`;
    explanation += `SUPPORT: ${supportingDomains.length > 0 ? supportingDomains.join(', ') : 'None'}\n`;
    explanation += `OPPOSE: ${opposingDomains.length > 0 ? opposingDomains.join(', ') : 'None'}\n`;
    if (hardVetoes.length > 0) {
      explanation += `HARD VETO: ${hardVetoes.map(v => v.reason).join('; ')}\n`;
    }
    if (softVetoes.length > 0) {
      explanation += `SOFT VETO: ${softVetoes.map(v => v.reason).join('; ')}\n`;
    }
    if (conflicts.length > 0) {
      explanation += `CONFLICTS: ${conflicts.map(c => c.description).join('; ')}\n`;
    }

    const legacyPosture =
      maturity === 'DATA_LIMITED' ? 'DATA LIMITED' :
      maturity === 'VALIDATED_SETUP' && bias === 'BULLISH' ? 'WATCH FOR BUY' :
      maturity === 'VALIDATED_SETUP' && bias === 'BEARISH' ? 'WATCH FOR SELL' :
      maturity === 'SETUP_FORMING' && bias === 'BULLISH' ? 'WATCH FOR BUY' :
      maturity === 'SETUP_FORMING' && bias === 'BEARISH' ? 'WATCH FOR SELL' : 'WAIT';

    return {
      maturity,
      bias,
      confidence,
      evidenceCompleteness: evidenceBundle.completeness?.overallCompleteness ?? 78,
      registeredAgentCount: 32,
      upstreamAgentCount: 31,
      domains: domainConsensusList,
      independentDomainCount,
      supportingDomains,
      opposingDomains,
      unavailableDomains,
      hardVetoes,
      softVetoes,
      conflicts,
      requirementsToAdvance,
      blockingConditions,
      invalidationConditions,
      explanation,
      sessionContext,
      tradeExecutable: false,
      executionMode: 'READ_ONLY',
      mt5OrderTransportEnabled: false,
      snapshotId,
      asOf,
      generatedAt,
      legacyCompatibility: {
        confluenceScore: confidence,
        conflictScore: conflicts.length * 20,
        decisionPosture: legacyPosture,
        directionalBias: bias,
        setupQuality: maturity === 'VALIDATED_SETUP' ? 85 : maturity === 'SETUP_FORMING' ? 70 : 40
      }
    };
  }
}
