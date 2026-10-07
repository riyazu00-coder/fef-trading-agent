/**
 * Multi-Asset Intelligence & Canonical 15-Agent Dynamic Swarm Pipeline
 * 
 * Guarantees that EVERY active asset (XAUUSD, XAGUSD, USOIL, EURUSD, GBPUSD, USDJPY, AUDUSD, BTCUSD, etc.)
 * receives exactly the canonical 15-agent voting council in deterministic order.
 * 
 * Phase 2D & V1.1:
 * - Asset-specific agent evidence readiness: Agents unlock per asset when required verified inputs exist.
 * - Missing broker data on one asset does NOT disable other assets.
 * - If verified OHLC candles exist (MT5 broker or independent feed), Technical, Strategy, Liquidity,
 *   Opportunity, and Session agents perform real structure-derived analysis.
 * - Unconnected feeds (News, Macro, Geopolitical, Sentiment, Institutional, Order Flow) remain
 *   honestly DATA LIMITED without synthetic fabrication.
 * - Final AI distinguishes:
 *     * WAIT (sufficient information exists, but setup criteria not justified)
 *     * INSUFFICIENT INFORMATION (evidence trust below required threshold)
 *     * WATCH FOR BUY / WATCH FOR SELL (strictly requires confirmed eligible directional votes)
 */

import { LiveMarketAsset } from '../providers/real-market-api';
import { AgentNodeStatus, AgentState, AgentType, BiasType } from './agent-types';
import { getMarketDefinition, MarketCategory } from '../registry/market-registry';
import { evaluateMarketSession, MarketSessionState } from '../session/market-session-engine';
import {
  calculateAgentEvidenceTrust,
  calculateConsensusTrust,
  evaluateActionabilityGate,
  isEvidenceDecisionEligible,
  FRESHNESS_POLICIES,
  AgentEvidence,
  ActionabilityState,
  EvidenceClassification
} from '../evidence/agent-evidence';
import { TIMEFRAME_INTERVAL_MS } from '../candles/candle-validator';
import { analyzeMarketStructure, MarketStructure } from '../market/market-structure-engine';
import {
  buildBuyBlueprint,
  buildSellBlueprint,
  updateBlueprintLifecycle,
  evaluateBlueprintMarketCompatibility,
  BlueprintCandleSource,
  TradeBlueprint,
  LevelWithProvenance
} from '../trading/trade-blueprint-engine';
import { OHLCCandle } from '../market/canonical-market-snapshot';
import { calculateVolumeProfile } from '../market/volume-profile-engine';
import { evaluateCorrelationRegime } from '../market/dynamic-correlation-engine';
import { scanCandlesForStructureEvents, structureEventBus } from '../market/structure-event-engine';
import { computeOrderFlowMetrics } from '../market/order-flow-engine';
import { globalNewsEngine } from '../news/global-news-engine';
import { economicCalendarEngine } from '../calendar/economic-calendar-engine';
import { globalMacroEngine } from '../macro/global-macro-engine';
import { geopoliticalEngine } from '../geopolitical/geopolitical-engine';
import { marketSentimentEngine } from '../sentiment/market-sentiment-engine';
import { LiveIntelligenceFeeds } from '../intelligence/feed-types';
import { CortexConfluenceEngine, ConfluenceOutput } from '../confluence/confluence-engine';
import { MarketRegimeAssessment } from '../regime/market-regime-engine';
import { CrossAssetMatrix } from '../cross-asset/cross-asset-engine';
import { QuantMetricsResult, HistoricalAnalogueResult } from '../quant/quant-engine';
import {
  UnifiedAgentResponse,
  UnifiedAgentEvidence,
  EvidenceDomainFamily
} from './contracts/unified-agent-contract';
import {
  evaluateRatesAgent,
  evaluateInflationAgent,
  evaluateVolatilityAgent,
  evaluateCrossAssetAgent,
  evaluateDataSentinelAgent,
  evaluateQuantAgent
} from './specialists/specialist-agents';
import { MultiTimeframeContext, CandleCloseTriggerEvidence } from '../triggers/trigger-types';
import { CandleCloseTriggerEngine } from '../triggers/candle-close-trigger-engine';
import { SetupLifecycleEngine } from '../trading/setup-lifecycle-engine';
import { SetupLifecycleRecord } from '../trading/setup-lifecycle-types';
import { FastOpportunityEngine } from '../radar/fast-opportunity-engine';

export type DirectionalBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type DecisionPosture = 'WATCH FOR BUY' | 'WATCH FOR SELL' | 'WAIT' | 'NO TRADE' | 'BUY OPPORTUNITY' | 'SELL OPPORTUNITY' | 'MONITOR NEXT OPEN' | 'PRE-OPEN WATCH' | 'REVALIDATING...' | 'WAIT (MARKET CLOSED)' | 'ANALYSIS ONLY' | 'DATA LIMITED';
export type RiskPosture = 'CLEAR' | 'CAUTION' | 'RESTRICTED';

export interface AssetIntelligenceProfile {
  symbol: string;
  name: string;
  timeframe?: string;
  category: MarketCategory | 'COMMODITY' | 'METALS' | 'FOREX' | 'CRYPTO' | 'INDICES';
  regime: string;
  session: string;
  trend: string;
  volatility: string;
  newsRisk: string;
  liquidity: string;
  setupDirection: DecisionPosture;
  directionalBias: DirectionalBias;
  decisionPosture: DecisionPosture;
  riskPosture: RiskPosture;
  confidence: number;
  entryZone: [number, number];
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: string;
  invalidation: string;
  whyThisTrade: string[];
  opposingRisks: string[];
  agents: AgentState[];
  sessionState: MarketSessionState;
  tradeExecutable: boolean;
  setupQuality: number;
  debateMessages: {
    time: string;
    agent: string;
    text: string;
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'RESTRICTED' | 'CAUTION' | 'DATA LIMITED';
  }[];
  // Phase 34 Consensus Trust Additions
  evidenceTrust?: number;
  verifiedAgentCount?: number;
  limitedAgentCount?: number;
  unavailableAgentCount?: number;
  actionabilityState?: ActionabilityState;
  // V1.1 Blueprint & Structure Additions
  blueprint?: TradeBlueprint | null;
  marketStructure?: MarketStructure | null;
  // Terminal Expansion Additions
  confluence?: ConfluenceOutput | null;
  regimeAssessment?: MarketRegimeAssessment | null;
  crossAssetMatrix?: CrossAssetMatrix | null;
  quantMetrics?: QuantMetricsResult | null;
  historicalAnalogue?: HistoricalAnalogueResult | null;
  dataSentinel?: UnifiedAgentResponse | null;
  specialistAgents?: UnifiedAgentResponse[];
  // M15/M30 Opportunity Recovery & Decision Consistency Additions
  multiTimeframeContext?: MultiTimeframeContext | null;
  triggerEvidence?: CandleCloseTriggerEvidence | null;
  setupLifecycle?: SetupLifecycleRecord | null;
}

/**
 * The Canonical 15-Agent Council Roster in strict deterministic order.
 */
export const CANONICAL_COUNCIL_KEYS: { type: AgentType; name: string; role: string }[] = [
  { type: 'TECHNICAL', name: 'Technical Agent', role: 'SMC, Structure & Fractals' },
  { type: 'MACRO', name: 'Macro Agent', role: 'Central Banks & Yield Differentials' },
  { type: 'CORRELATION', name: 'Correlation Agent', role: 'DXY, Crosses & Intermarket Beta' },
  { type: 'NEWS', name: 'News Agent', role: 'Live Wire & Headline Disruption' },
  { type: 'GEOPOLITICAL', name: 'Geopolitical Agent', role: 'Sovereign Conflict & Energy Flows' },
  { type: 'SENTIMENT', name: 'Sentiment Agent', role: 'Retail Crowding & Contrarian Skew' },
  { type: 'INSTITUTIONAL', name: 'Institutional Agent', role: 'Volume Profile & Structural Imbalances' },
  { type: 'RISK_GUARDIAN', name: 'Risk Guardian', role: 'Mathematical Exposure Bounds' },
  { type: 'VISION', name: 'Vision / Chart Agent', role: 'Computer Vision Technical Detection' },
  { type: 'OPPORTUNITY', name: 'Opportunity Agent', role: 'Risk / Reward Optimization' },
  { type: 'STRATEGY', name: 'Strategy Agent', role: 'Execution Protocols & Rules' },
  { type: 'ORDER_FLOW', name: 'Scalper / Flow Sniper', role: 'M1/M5 Micro-Structure & Momentum' },
  { type: 'KILLZONE', name: 'Session / Killzone Agent', role: 'ICT Algorithmic Timing & IPDA' },
  { type: 'LIQUIDITY_MAP', name: 'Liquidity Agent', role: 'Structural BSL/SSL Pools & Zones' },
  { type: 'FINAL_DECISION', name: 'Final Decision Agent', role: 'Swarm Consensus Engine' },
];

/**
 * Base Agent Registry: Generates clean unadulterated baseline for all 15 agents.
 */
export function getBaseAgentRegistry(symbol: string): AgentState[] {
  return CANONICAL_COUNCIL_KEYS.map((spec) => ({
    type: spec.type,
    name: spec.name,
    role: spec.role,
    bias: 'NEUTRAL' as BiasType,
    confidence: 0,
    status: 'DATA LIMITED' as AgentNodeStatus,
    lastOpinion: `Initializing base telemetry model for ${symbol}.`,
    evidence: [`Awaiting telemetry synchronization for ${symbol}`],
    keyRisk: 'Data stream latency buffer',
    invalidation: 'Structural violation',
  }));
}

// In-memory cache for active trade blueprints to guarantee state stability across tick fluctuations
const activeBlueprintCache = new Map<string, TradeBlueprint>();

export function clearBlueprintCacheForTesting(): void {
  activeBlueprintCache.clear();
}

export function getActiveBlueprintCacheForTesting(): ReadonlyMap<string, TradeBlueprint> {
  return activeBlueprintCache;
}

/**
 * Fail-closed validation to ensure MarketStructure belongs to the exact current analysis context.
 */
export function isMarketStructureCompatibleWithContext(
  structure: MarketStructure | null | undefined,
  expectedSymbol: string,
  expectedTf: string,
  expectedSource: BlueprintCandleSource
): boolean {
  if (!structure) return false;
  if ((structure.symbol || '').toUpperCase() !== expectedSymbol.toUpperCase()) return false;
  if ((structure.timeframe || '').toUpperCase() !== expectedTf.toUpperCase()) return false;
  if (structure.source !== expectedSource) return false;
  return true;
}

/**
 * Fail-closed validation to ensure a TradeBlueprint strictly matches the current symbol,
 * timeframe, and candle source provenance across all its structural levels.
 */
export function isBlueprintCompatibleWithContext(
  bp: TradeBlueprint | null | undefined,
  expectedSymbol: string,
  expectedTf: string,
  expectedSource: BlueprintCandleSource,
  structure?: MarketStructure | null
): boolean {
  if (!bp) return false;

  // 1. Symbol integrity (case-insensitive normalization)
  if ((bp.symbol || '').toUpperCase() !== expectedSymbol.toUpperCase()) {
    return false;
  }

  // 2. Market structure integrity (if provided)
  if (structure && !isMarketStructureCompatibleWithContext(structure, expectedSymbol, expectedTf, expectedSource)) {
    return false;
  }

  // 3. Mandatory structural levels existence
  if (!bp.entryZoneHigh || !bp.entryZoneLow || !bp.invalidation || !bp.sl || !bp.tp1) {
    return false;
  }

  // 4. Validate provenance-bearing levels
  const levels: (LevelWithProvenance | undefined)[] = [
    bp.entryZoneHigh,
    bp.entryZoneLow,
    bp.invalidation,
    bp.sl,
    bp.tp1,
    bp.tp2,
    bp.tp3,
  ];

  const normTf = expectedTf.toUpperCase();
  for (const lvl of levels) {
    if (!lvl) continue;
    // Source check: must match current blueprint candle source
    if (lvl.source !== expectedSource) {
      return false;
    }
    // Timeframe check: must match structure timeframe used to create blueprint
    if ((lvl.timeframe || '').toUpperCase() !== normTf) {
      return false;
    }
  }

  return true;
}

export type CandleBundle = Record<string, OHLCCandle[]>;

/**
 * Canonical 15-Agent Swarm Pipeline Engine
 */
export function generateAssetIntelligence(
  symbol: string,
  liveAsset: LiveMarketAsset,
  timeframe: string = 'H1',
  verifiedCandles?: OHLCCandle[] | CandleBundle,
  candleProvenance?: EvidenceClassification,
  candleProvider?: string,
  evaluationTime?: Date,
  feeds?: LiveIntelligenceFeeds
): AssetIntelligenceProfile {
  const normSymbol = (symbol || 'XAUUSD').toUpperCase();
  const normTf = (timeframe || 'H1').toUpperCase();
  const p = liveAsset?.price || 0;
  const isPos = (liveAsset?.change24h || 0) >= 0;

  let candleBundle: CandleBundle | null = null;
  let activeCandles: OHLCCandle[] | undefined = undefined;

  if (Array.isArray(verifiedCandles)) {
    activeCandles = verifiedCandles;
  } else if (verifiedCandles && typeof verifiedCandles === 'object') {
    candleBundle = verifiedCandles as CandleBundle;
    activeCandles = candleBundle[normTf] || candleBundle['H1'] || candleBundle['M15'] || candleBundle['M5'] || Object.values(candleBundle)[0];
  }

  // Canonical multi-timeframe resolution:
  const h1Candles = candleBundle?.['H1'] || (normTf === 'H1' ? activeCandles : undefined);
  const m30Candles = candleBundle?.['M30'] || (normTf === 'M30' ? activeCandles : undefined);
  const m15Candles = candleBundle?.['M15'] || (normTf === 'M15' ? activeCandles : undefined);
  const m5Candles = candleBundle?.['M5'] || (normTf === 'M5' ? activeCandles : undefined);

  // Structure setup: prefer M30 from bundle, then H1, then H4
  const structureCandles = (m30Candles && m30Candles.length >= 10)
    ? m30Candles
    : (candleBundle && (candleBundle['H1'] || candleBundle['H4'] || candleBundle['M15']))
      ? (candleBundle['H1'] || candleBundle['H4'] || candleBundle['M15'])
      : activeCandles;
  const structureTf = (m30Candles && m30Candles.length >= 10)
    ? 'M30'
    : (candleBundle && candleBundle['H1']) ? 'H1' : (candleBundle && candleBundle['H4']) ? 'H4' : normTf;

  // Micro-momentum (Scalper / Order Flow): prefer M5 or M15 from bundle
  const microCandles = (candleBundle && (candleBundle['M5'] || candleBundle['M15']))
    ? (candleBundle['M5'] || candleBundle['M15'])
    : activeCandles;

  const symbolMeta: Record<string, { name: string; category: string }> = {
    XAUUSD: { name: 'Gold Spot / USD', category: 'METALS' },
    XAGUSD: { name: 'Silver Spot / USD', category: 'METALS' },
    USOIL:  { name: 'WTI Crude Oil / USD', category: 'COMMODITY' },
    EURUSD: { name: 'Euro / US Dollar', category: 'FOREX' },
    USDJPY: { name: 'US Dollar / Japanese Yen', category: 'FOREX' },
    BTCUSD: { name: 'Bitcoin / US Dollar', category: 'CRYPTO' },
    ETHUSD: { name: 'Ethereum / US Dollar', category: 'CRYPTO' },
    US100:  { name: 'Nasdaq 100 Index Cash', category: 'INDICES' },
    US30:   { name: 'Dow Jones Industrial 30', category: 'INDICES' },
    US500:  { name: 'S&P 500 Index Cash', category: 'INDICES' },
    GBPUSD: { name: 'Pound / US Dollar', category: 'FOREX' },
    GBPJPY: { name: 'Pound / Japanese Yen', category: 'FOREX' },
    AUDUSD: { name: 'Australian Dollar / USD', category: 'FOREX' },
    XRPUSD: { name: 'XRP / US Dollar', category: 'CRYPTO' },
  };

  const meta = symbolMeta[normSymbol] || { name: normSymbol, category: 'FOREX' };

  // 1. Evaluate Session & Trading Temporal Window
  const evalTimeMs = evaluationTime ? evaluationTime.getTime() : Date.now();
  const quoteTimestampMs = liveAsset?.lastUpdated && !isNaN(new Date(liveAsset.lastUpdated).getTime())
    ? new Date(liveAsset.lastUpdated).getTime()
    : undefined;
  const sessionState = evaluateMarketSession(normSymbol, evaluationTime, quoteTimestampMs);
  const tradeExecutable = sessionState.tradeExecutable;
  const setupQuality = sessionState.setupQuality;

  // 2. Market Structure Analysis if verified candles are provided
  const hasCandles = (Array.isArray(activeCandles) && activeCandles.length >= 10) ||
                     (Array.isArray(structureCandles) && structureCandles.length >= 10);
  let marketStructure: MarketStructure | null = null;

  // Resolve truthful provenance & provider metadata
  let effectiveCandleProvenance: EvidenceClassification = 'UNAVAILABLE';
  let effectiveCandleProvider: string = 'NONE';

  if (hasCandles) {
    if (candleProvenance) {
      const rawProv = candleProvenance as string;
      if (rawProv === 'INDEPENDENT_VERIFIED_OHLC') {
        effectiveCandleProvenance = 'INDEPENDENT_VERIFIED';
      } else if (rawProv === 'INDEPENDENT_REFERENCE_OHLC') {
        effectiveCandleProvenance = 'INDEPENDENT_REFERENCE';
      } else {
        effectiveCandleProvenance = candleProvenance;
      }
      effectiveCandleProvider = candleProvider || 'Verified Provider';
    } else if (normSymbol === 'BTCUSD' || normSymbol === 'ETHUSD' || normSymbol === 'SOLUSD') {
      effectiveCandleProvenance = 'INDEPENDENT_VERIFIED';
      effectiveCandleProvider = 'Binance Public Spot';
    } else if (normSymbol === 'EURUSD' || normSymbol === 'GBPUSD' || normSymbol === 'USDJPY' || normSymbol === 'USDCHF') {
      effectiveCandleProvenance = 'INDEPENDENT_VERIFIED';
      effectiveCandleProvider = 'Yahoo Finance Spot FX';
    } else if (normSymbol === 'US100' || normSymbol === 'US500' || normSymbol === 'US30' || normSymbol === 'USOIL') {
      effectiveCandleProvenance = 'INDEPENDENT_VERIFIED';
      effectiveCandleProvider = 'Yahoo Finance Public Chart';
    } else if (normSymbol === 'XAUUSD' || normSymbol === 'XAGUSD') {
      effectiveCandleProvenance = 'INDEPENDENT_REFERENCE';
      effectiveCandleProvider = 'Binance PAXG / Yahoo Futures (Proxy)';
    } else {
      effectiveCandleProvenance = 'INDEPENDENT_VERIFIED';
      effectiveCandleProvider = 'Independent Verified Feed';
    }
  }

  // 3. Trade Blueprint Synthesis from real structure with hysteresis & persistence
  let blueprint: TradeBlueprint | null = null;
  const blueprintCandleSource: BlueprintCandleSource = effectiveCandleProvenance === 'LIVE_MT5'
    ? 'MT5_BROKER_OHLC'
    : effectiveCandleProvenance === 'INDEPENDENT_REFERENCE'
      ? 'INDEPENDENT_REFERENCE_OHLC'
      : 'INDEPENDENT_VERIFIED_OHLC';

  const analysisCandles = (Array.isArray(structureCandles) && structureCandles.length >= 10)
    ? structureCandles
    : (Array.isArray(activeCandles) ? activeCandles : []);

  marketStructure = analysisCandles.length >= 10
    ? analyzeMarketStructure(analysisCandles, normSymbol, structureTf, blueprintCandleSource)
    : null;

  // Multi-Timeframe Context Construction
  const h1Structure = (h1Candles && h1Candles.length >= 10 && structureTf !== 'H1')
    ? analyzeMarketStructure(h1Candles, normSymbol, 'H1', blueprintCandleSource)
    : (structureTf === 'H1' ? marketStructure : null);

  const m15Structure = (m15Candles && m15Candles.length >= 10 && structureTf !== 'M15')
    ? analyzeMarketStructure(m15Candles, normSymbol, 'M15', blueprintCandleSource)
    : (structureTf === 'M15' ? marketStructure : null);

  let m5Momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (microCandles && microCandles.length >= 3) {
    const last3 = microCandles.slice(-3);
    const lastClose = last3[last3.length - 1].close;
    const firstOpen = last3[0].open;
    if (lastClose > firstOpen) m5Momentum = 'BULLISH';
    else if (lastClose < firstOpen) m5Momentum = 'BEARISH';
  }

  const htfBias = (h1Structure?.trend === 'BULLISH' || h1Structure?.trend === 'BEARISH') ? h1Structure.trend : 'NEUTRAL';
  const setupStructureTrend = (marketStructure?.trend === 'BULLISH' || marketStructure?.trend === 'BEARISH') ? marketStructure.trend : 'NEUTRAL';

  // Evaluate M15 Candle-Close Trigger Evidence
  const triggerEvidence = CandleCloseTriggerEngine.evaluateTrigger({
    symbol: normSymbol,
    candlesM15: m15Candles,
    candlesM30: m30Candles || (structureTf === 'M30' ? analysisCandles : undefined),
    currentPrice: p,
    structure: marketStructure,
    htfBias,
    provenance: effectiveCandleProvenance,
    currentTimeMs: evalTimeMs,
  });

  const multiTimeframeContext: MultiTimeframeContext = {
    symbol: normSymbol,
    contextTimeframe: 'H1',
    setupTimeframe: 'M30',
    triggerTimeframe: 'M15',
    precisionTimeframe: 'M5',
    htfBias,
    setupStructure: setupStructureTrend,
    triggerState: triggerEvidence.isConfirmed ? 'CONFIRMED' : 'WAITING',
    htfCandleCount: h1Candles?.length || (structureTf === 'H1' ? analysisCandles.length : 0),
    m30CandleCount: m30Candles?.length || (structureTf === 'M30' ? analysisCandles.length : 0),
    m15CandleCount: m15Candles?.length || 0,
    m5CandleCount: microCandles?.length || 0,
    isTriggerConfirmed: triggerEvidence.isConfirmed,
    triggerConfirmationDetails: triggerEvidence.reason,
    nextConfirmationRequirement: triggerEvidence.isConfirmed
      ? 'Confirmed closed candle breakout'
      : (triggerEvidence.rejectionReason || 'Awaiting confirmed closed M15 candle breakout'),
    h1: {
      available: Boolean(h1Candles && h1Candles.length >= 10),
      trend: htfBias,
      candleCount: h1Candles?.length || (structureTf === 'H1' ? analysisCandles.length : 0),
      provenance: effectiveCandleProvenance,
    },
    m30: {
      available: Boolean((m30Candles && m30Candles.length >= 10) || structureTf === 'M30'),
      trend: setupStructureTrend,
      candleCount: m30Candles?.length || (structureTf === 'M30' ? analysisCandles.length : 0),
      swingsIdentified: Boolean(marketStructure && ((marketStructure.swingHighs?.length || 0) > 0 || (marketStructure.swingLows?.length || 0) > 0)),
      structureVersion: SetupLifecycleEngine.computeStructureVersion(marketStructure),
    },
    m15: {
      available: Boolean(m15Candles && m15Candles.length >= 10),
      trend: (m15Structure?.trend === 'BULLISH' || m15Structure?.trend === 'BEARISH') ? m15Structure.trend : 'NEUTRAL',
      candleCount: m15Candles?.length || 0,
      latestClosedTimestamp: m15Candles && m15Candles.length > 0 ? m15Candles[m15Candles.length - 1].timestamp : 0,
    },
    m5: {
      available: Boolean(microCandles && microCandles.length >= 3),
      candleCount: microCandles?.length || 0,
      momentum: m5Momentum,
    },
  };

  const bpKey = `${normSymbol}:${structureTf}`;
  let cachedBp = activeBlueprintCache.get(bpKey);

  // Fail-closed cached blueprint check: if already permanently invalidated, remove from cache
  if (cachedBp && SetupLifecycleEngine.isSetupInvalidated(cachedBp.setupId)) {
    activeBlueprintCache.delete(bpKey);
    cachedBp = undefined;
  }

  const isStructureValid = isMarketStructureCompatibleWithContext(marketStructure, normSymbol, structureTf, blueprintCandleSource);

  if (isStructureValid && marketStructure && marketStructure.trend !== 'INSUFFICIENT_DATA') {
    let freshBlueprint: TradeBlueprint | null = null;
    const candidateDir = marketStructure.trend === 'BULLISH' ? 'BUY' : 'SELL';

    // Anti-flip-flop guard: Require genuinely new structural evidence before regenerating same-direction setup
    const evidenceCheck = SetupLifecycleEngine.hasNewStructuralEvidence(
      normSymbol,
      candidateDir,
      marketStructure,
      analysisCandles
    );

    if (evidenceCheck.hasNewEvidence) {
      if (candidateDir === 'BUY') {
        freshBlueprint = buildBuyBlueprint(marketStructure, analysisCandles, normSymbol, p, blueprintCandleSource);
      } else if (candidateDir === 'SELL') {
        freshBlueprint = buildSellBlueprint(marketStructure, analysisCandles, normSymbol, p, blueprintCandleSource);
      }

      if (freshBlueprint) {
        if (isBlueprintCompatibleWithContext(freshBlueprint, normSymbol, structureTf, blueprintCandleSource, marketStructure)) {
          activeBlueprintCache.set(bpKey, freshBlueprint);
          blueprint = freshBlueprint;
          SetupLifecycleEngine.registerActiveSetup(freshBlueprint, marketStructure, 'ARMED');
        } else {
          activeBlueprintCache.delete(bpKey);
          blueprint = null;
        }
      }
    }

    if (!freshBlueprint && cachedBp) {
      // Fail-closed cached blueprint integrity and market compatibility validation
      if (!isBlueprintCompatibleWithContext(cachedBp, normSymbol, structureTf, blueprintCandleSource, marketStructure)) {
        activeBlueprintCache.delete(bpKey);
        blueprint = null;
      } else {
        const compat = evaluateBlueprintMarketCompatibility(cachedBp, p, marketStructure, analysisCandles);
        if (!compat.isCompatible) {
          activeBlueprintCache.delete(bpKey);
          blueprint = null;
        } else {
          // Blueprint remains active with updated lifecycle state
          const updatedBp = updateBlueprintLifecycle(cachedBp, p, analysisCandles, marketStructure);
          if (updatedBp.state === 'INVALIDATED' || updatedBp.state === 'EXPIRED') {
            activeBlueprintCache.delete(bpKey);
            blueprint = null;
          } else if (isBlueprintCompatibleWithContext(updatedBp, normSymbol, structureTf, blueprintCandleSource, marketStructure)) {
            activeBlueprintCache.set(bpKey, updatedBp);
            blueprint = updatedBp;
            SetupLifecycleEngine.registerActiveSetup(updatedBp, marketStructure, updatedBp.state as any);
          } else {
            activeBlueprintCache.delete(bpKey);
            blueprint = null;
          }
        }
      }
    }
  } else {
    activeBlueprintCache.delete(bpKey);
    blueprint = null;
  }

  const setupLifecycleRecord = SetupLifecycleEngine.getActiveSetup(normSymbol);

  // 3b. Specialist Market Diagnostics: Volume Profile & Order Flow
  const isExchangeVol = (normSymbol === 'BTCUSD' || normSymbol === 'ETHUSD' || normSymbol === 'SOLUSD');
  const volumeProfile = hasCandles
    ? calculateVolumeProfile(analysisCandles, normSymbol, structureTf, 24, isExchangeVol)
    : null;

  const flowCandles = (Array.isArray(microCandles) && microCandles.length >= 3)
    ? microCandles
    : (analysisCandles.length >= 3 ? analysisCandles : null);

  const orderFlowRecord = flowCandles
    ? computeOrderFlowMetrics(flowCandles, normSymbol, 'M5', isExchangeVol)
    : null;

  // 3c. Synchronous Retrieval of Cached Live Feeds
  const cachedNews = (feeds?.news && feeds.news.length > 0)
    ? feeds.news.filter(n => !n.symbols || n.symbols.length === 0 || n.symbols.includes(normSymbol) || n.symbols.includes('GLOBAL')).slice(0, 5)
    : globalNewsEngine.getCachedNews([normSymbol], 5);
  const cachedMacro = (feeds?.macro && feeds.macro.length > 0)
    ? feeds.macro
    : globalMacroEngine.getCachedIndicators();
  const cachedEvents = (feeds?.events && feeds.events.length > 0)
    ? feeds.events
    : economicCalendarEngine.getCachedUpcomingEvents(24);
  const cachedAlerts = (feeds?.alerts && feeds.alerts.length > 0 ? feeds.alerts : geopoliticalEngine.getCachedAlerts())
    .filter(a => a.affectedCommodities.includes(normSymbol) || a.region === 'GLOBAL');
  const cachedSentiment = (feeds?.sentiment && feeds.sentiment[normSymbol] !== undefined)
    ? feeds.sentiment[normSymbol]
    : marketSentimentEngine.getCachedSentiment(normSymbol);
  const cachedXauusdMacro = (normSymbol === 'XAUUSD' && feeds?.xauusdMacro)
    ? feeds.xauusdMacro
    : null;

  // 4. Assemble the Canonical 15 Agents deterministically
  const assembledAgents: AgentState[] = getBaseAgentRegistry(normSymbol).map((base) => {
    switch (base.type) {
      case 'TECHNICAL': {
        if (hasCandles && marketStructure) {
          const bias: BiasType = marketStructure.trend === 'BULLISH' ? 'BULLISH' : marketStructure.trend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
          const conf = marketStructure.trend === 'INSUFFICIENT_DATA' ? 50 : bias === 'NEUTRAL' ? 50 : 78;
          return {
            ...base,
            bias,
            confidence: conf,
            status: 'ONLINE',
            lastOpinion: `${structureTf} structure: ${marketStructure.trend}. Swings: ${marketStructure.swingHighs.length}H / ${marketStructure.swingLows.length}L.`,
            evidence: [
              `Verified ${structureTf} candles: ${marketStructure.candleCount} bars`,
              `Structure trend: ${marketStructure.trend}`,
              marketStructure.lastSwingHigh ? `Swing High: ${marketStructure.lastSwingHigh}` : 'Swing high mapped',
              marketStructure.lastSwingLow ? `Swing Low: ${marketStructure.lastSwingLow}` : 'Swing low mapped',
              volumeProfile ? `Volume Profile POC: ${volumeProfile.poc} [VAL: ${volumeProfile.val} / VAH: ${volumeProfile.vah}] (${volumeProfile.isExchangeVolume ? 'Exchange Vol' : 'Broker Tick Proxy'})` : 'Volume Profile: CALIBRATING'
            ],
            keyRisk: 'Structural pivot invalidation',
            invalidation: marketStructure.trend === 'BULLISH'
              ? (marketStructure.lastSwingLow ? `Break below ${marketStructure.lastSwingLow}` : 'Swing breach')
              : (marketStructure.lastSwingHigh ? `Break above ${marketStructure.lastSwingHigh}` : 'Swing breach'),
          };
        }
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `Awaiting verified OHLC candles for ${normSymbol}. No structure analysis yet.`,
          evidence: [`Candle feed: PENDING FOR ${normSymbol}`],
          keyRisk: 'No data',
          invalidation: 'N/A',
        };
      }

      case 'KILLZONE': {
        const isSessionActive = sessionState.marketState === 'OPEN';
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: isSessionActive ? 75 : 40,
          status: isSessionActive ? 'ONLINE' : 'CAUTION',
          lastOpinion: `${sessionState.sessionName} — ${sessionState.statusLabel}. ${isSessionActive ? `Active until ${sessionState.closesAt}` : `Opens ${sessionState.nextOpenAt}`}`,
          evidence: [
            `Session: ${sessionState.sessionName}`,
            `Status: ${sessionState.statusLabel}`,
            `Executability: ${sessionState.executabilityScore}/100`
          ],
          keyRisk: isSessionActive ? 'Session rollover liquidity fade' : 'Market closed gap risk',
          invalidation: 'Session transition'
        };
      }

      case 'LIQUIDITY_MAP': {
        if (hasCandles && marketStructure) {
          const bias: BiasType = marketStructure.trend === 'BULLISH' ? 'BULLISH' : marketStructure.trend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
          const hasZones = marketStructure.fvg.length > 0 || marketStructure.orderBlocks.length > 0;
          return {
            ...base,
            bias,
            confidence: 0,
            status: 'ONLINE',
            lastOpinion: hasZones
              ? `Structural liquidity zones mapped. ${marketStructure.fvg.length} active FVGs, ${marketStructure.orderBlocks.length} Order Blocks.`
              : `Liquidity surveillance active. Monitoring structural liquidity zones around recent swings [${marketStructure.lastSwingLow ?? 'N/A'} - ${marketStructure.lastSwingHigh ?? 'N/A'}].`,
            evidence: [
              `FVG count: ${marketStructure.fvg.length}`,
              `Order Blocks: ${marketStructure.orderBlocks.length}`,
              `Surveillance: ACTIVE (${marketStructure.candleCount} bars)`
            ],
            keyRisk: 'Liquidity sweep continuation',
            invalidation: 'Opposing pool breach'
          };
        }
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `Liquidity mapping awaiting verified OHLC swing detection for ${normSymbol}.`,
          evidence: ['OHLC candles: PENDING'],
          keyRisk: 'N/A',
          invalidation: 'N/A'
        };
      }

      case 'STRATEGY': {
        if (blueprint && blueprint.state !== 'INVALIDATED' && blueprint.state !== 'EXPIRED') {
          return {
            ...base,
            bias: blueprint.direction === 'BUY' ? 'BULLISH' : 'BEARISH',
            confidence: 76,
            status: 'ONLINE',
            lastOpinion: `Strategy setup identified from verified structural blueprint: ${blueprint.direction} setup at [${blueprint.entryZoneLow.price} - ${blueprint.entryZoneHigh.price}].`,
            evidence: [
              `Entry: [${blueprint.entryZoneLow.price} - ${blueprint.entryZoneHigh.price}]`,
              `SL: ${blueprint.sl.price}`,
              `TP1: ${blueprint.tp1.price}`,
              `R:R: ${blueprint.rrRatio || '1:1.5'}`
            ],
            keyRisk: 'Invalidation price violation',
            invalidation: `Structural stop at ${blueprint.sl.price}`
          };
        }
        if (hasCandles && marketStructure) {
          const trendBias: BiasType = marketStructure.trend === 'BULLISH' ? 'BULLISH' : marketStructure.trend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
          return {
            ...base,
            bias: trendBias,
            confidence: 65,
            status: 'ONLINE',
            lastOpinion: `${normTf} continuous surveillance active. Monitoring price action for liquidity sweep & CHOCH displacement on ${normSymbol}.`,
            evidence: [
              `Verified ${normTf} candles: ${marketStructure.candleCount} bars`,
              `Structure state: ${marketStructure.trend}`,
              'Execution protocol: CONTINUOUS SEARCHING',
              'Trigger criteria: Liquidity sweep validation required'
            ],
            keyRisk: 'Premature entry during range chop',
            invalidation: 'Break of structure'
          };
        }
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `Strategy engine awaiting verified market structure for ${normSymbol}.`,
          evidence: ['Structure engine: PENDING CANDLES'],
          keyRisk: 'N/A',
          invalidation: 'N/A'
        };
      }

      case 'OPPORTUNITY': {
        if (blueprint && blueprint.rrRatio) {
          return {
            ...base,
            bias: blueprint.direction === 'BUY' ? 'BULLISH' : 'BEARISH',
            confidence: 78,
            status: 'ONLINE',
            lastOpinion: `Structural R:R calculated as ${blueprint.rrRatio} against target ${blueprint.tp1.price}.`,
            evidence: [
              `Target TP1: ${blueprint.tp1.price}`,
              `Risk/Reward: ${blueprint.rrRatio}`
            ],
            keyRisk: 'Momentum stall before target',
            invalidation: 'Momentum breakdown'
          };
        }
        if (hasCandles && marketStructure) {
          return {
            ...base,
            bias: 'NEUTRAL',
            confidence: 60,
            status: 'ONLINE',
            lastOpinion: `Continuous surveillance active. Scanning ${normTf} swings for asymmetric >= 2.0x R:R setups on ${normSymbol}.`,
            evidence: [
              `Verified ${normTf} candles: ${marketStructure.candleCount} bars`,
              'Target criteria: Min 2.0x Risk/Reward',
              'Opportunity radar: ACTIVE SURVEILLANCE'
            ],
            keyRisk: 'Risk/reward compression in narrow ranges',
            invalidation: 'Adverse volatility spike'
          };
        }
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `No actionable setup identified for ${normSymbol}. Blueprint not yet generated.`,
          evidence: ['Blueprint engine: PENDING CANDLES'],
          keyRisk: 'N/A',
          invalidation: 'N/A'
        };
      }

      case 'RISK_GUARDIAN': {
        const nowMs = Date.now();
        const highImpactNear = cachedEvents.find((e) =>
          (e.impact === 'CRITICAL' || e.impact === 'HIGH') &&
          e.relatedSymbols.includes(normSymbol) &&
          e.epochMs >= nowMs &&
          e.epochMs <= nowMs + 3600 * 1000
        );

        if (blueprint) {
          return {
            ...base,
            bias: highImpactNear ? 'RESTRICTED' : 'CAUTION',
            confidence: 85,
            status: highImpactNear ? 'RESTRICTED' : 'ONLINE',
            lastOpinion: highImpactNear
              ? `Event Risk Lockout: High-impact release "${highImpactNear.title}" in ${Math.round((highImpactNear.epochMs - nowMs) / 60000)}m. Execution eligibility restricted.`
              : `Structural stop defined at ${blueprint.sl.price}. Risk policy cap is 0.50% equity. Position sizing remains pending validation.`,
            evidence: [
              `Structural SL: ${blueprint.sl.price}`,
              'Risk policy cap: 0.50% equity',
              'Position sizing: PENDING VALIDATION',
              highImpactNear
                ? `Event Risk: ${highImpactNear.title} (${highImpactNear.country}) — ${highImpactNear.scheduledAt}`
                : 'Economic calendar telemetry unavailable'
            ],
            keyRisk: highImpactNear ? `Imminent release ${highImpactNear.title}` : 'Spread widening during volatility',
            invalidation: 'N/A'
          };
        }
        if (hasCandles && marketStructure) {
          return {
            ...base,
            bias: highImpactNear ? 'RESTRICTED' : 'NEUTRAL',
            confidence: 70,
            status: highImpactNear ? 'RESTRICTED' : 'ONLINE',
            lastOpinion: highImpactNear
              ? `Risk Guardian armed with event lockout: "${highImpactNear.title}" approaching. Execution eligibility restricted.`
              : `Risk Guardian armed. Maximum risk policy cap is 0.50% equity. Position sizing and execution remain pending a validated blueprint.`,
            evidence: [
              'Mandatory SL policy: ARMED',
              'Risk policy cap: 0.50% equity',
              'Execution state: READ_ONLY / STANDBY',
              highImpactNear
                ? `Event Risk: ${highImpactNear.title} (${highImpactNear.country}) — ${highImpactNear.scheduledAt}`
                : 'Economic calendar telemetry unavailable'
            ],
            keyRisk: highImpactNear ? `Imminent release ${highImpactNear.title}` : 'Slippage during news spikes',
            invalidation: 'N/A'
          };
        }
        return {
          ...base,
          bias: 'CAUTION',
          confidence: 0,
          status: 'CAUTION',
          lastOpinion: `Risk Guardian armed. Execution locked until verified structure blueprint exists.`,
          evidence: ['Blueprint: PENDING'],
          keyRisk: 'No SL available',
          invalidation: 'N/A'
        };
      }

      case 'FINAL_DECISION': {
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: 'Awaiting evidence trust evaluation.',
          evidence: ['Evidence Trust: EVALUATING'],
          keyRisk: 'N/A',
          invalidation: 'N/A'
        };
      }

      // Specialist feeds: consume genuine cached records or truthfully report DATA LIMITED
      case 'MACRO': {
        // If official XAUUSD Macro Intelligence exists from Sprint 1C engine
        if (cachedXauusdMacro && cachedXauusdMacro.dataReadiness !== 'UNAVAILABLE') {
          let mappedBias: BiasType = 'NEUTRAL';
          if (cachedXauusdMacro.macroBias === 'BULLISH') mappedBias = 'BULLISH';
          else if (cachedXauusdMacro.macroBias === 'BEARISH') mappedBias = 'BEARISH';
          else if (cachedXauusdMacro.macroBias === 'MIXED') mappedBias = 'CAUTION';
          else mappedBias = 'NEUTRAL';

          const evidenceLines: string[] = [];
          for (const ev of cachedXauusdMacro.bullishEvidence) {
            evidenceLines.push(`[BULLISH] ${ev.factor}: ${ev.claim} (${ev.observationDate})`);
          }
          for (const ev of cachedXauusdMacro.bearishEvidence) {
            evidenceLines.push(`[BEARISH] ${ev.factor}: ${ev.claim} (${ev.observationDate})`);
          }
          for (const ev of cachedXauusdMacro.neutralEvidence) {
            evidenceLines.push(`[NEUTRAL] ${ev.factor}: ${ev.claim} (${ev.observationDate})`);
          }
          for (const c of cachedXauusdMacro.conflictingEvidence) {
            evidenceLines.push(`[CONFLICT] ${c}`);
          }
          for (const m of cachedXauusdMacro.missingEvidence) {
            evidenceLines.push(`[MISSING] ${m}`);
          }

          const status: AgentNodeStatus = cachedXauusdMacro.dataReadiness === 'DATA_LIMITED'
            ? 'DATA LIMITED'
            : 'ONLINE';

          const freshnessStr: 'REALTIME' | 'CURRENT' | 'DELAYED' | 'STALE' | 'OFFLINE' =
            cachedXauusdMacro.freshness === 'CURRENT'
              ? 'CURRENT'
              : cachedXauusdMacro.freshness === 'AGING'
              ? 'DELAYED'
              : cachedXauusdMacro.freshness === 'STALE'
              ? 'STALE'
              : 'OFFLINE';

          return {
            ...base,
            bias: mappedBias,
            confidence: cachedXauusdMacro.confidence,
            status,
            lastOpinion: cachedXauusdMacro.reasoningSummary,
            evidence: evidenceLines.length > 0 ? evidenceLines : ['Awaiting official macro series'],
            keyRisk: cachedXauusdMacro.conflictingEvidence.length > 0 ? 'Macro factor divergence' : 'Central bank rate shock',
            invalidation: 'Reversal in Treasury/Real Yield momentum',
            requiredInputs: ['US 10Y Yield', 'US 2Y Yield', '10Y Real Yield', 'Breakeven Inflation', 'Fed Policy'],
            availableInputs: cachedXauusdMacro.seriesCoverage,
            missingInputs: cachedXauusdMacro.missingEvidence,
            lastRun: new Date(cachedXauusdMacro.assembledAt).toISOString(),
            freshness: freshnessStr,
            evidenceTrustScore: cachedXauusdMacro.evidenceTrust,
            provenanceBadge: 'INDEPENDENT',
          };
        }

        const relevantMacro = cachedMacro.filter((m) =>
          !m.affectedAssets || m.affectedAssets.length === 0 || m.affectedAssets.includes(normSymbol)
        );

        if (relevantMacro.length > 0) {
          // Determine macro bias from yield / currency / commodity delta
          let macroBias: BiasType = 'NEUTRAL';
          const lead = relevantMacro[0];
          if (lead.bias === 'BULLISH' || lead.bias === 'BEARISH') {
            macroBias = lead.bias;
          }

          return {
            ...base,
            bias: macroBias,
            confidence: 0,
            status: 'ONLINE',
            lastOpinion: `Macro telemetry synchronized. ${relevantMacro.map((m) => `${m.name}: ${m.currentValue} (${m.percentageDelta && m.percentageDelta >= 0 ? '+' : ''}${m.percentageDelta ?? 0}%)`).join(' • ')}.`,
            evidence: relevantMacro.map((m) =>
              `${m.name}: ${m.currentValue} [${m.regime || 'NORMAL'}] (Delta: ${m.delta ?? '0'}) — ${m.releaseDate}`
            ),
            keyRisk: 'Central bank emergency liquidity pivot',
            invalidation: 'Macro regime breakdown',
            requiredInputs: ['Sovereign Yields', 'Dollar Index (DXY)', 'Inflation Trajectory'],
            availableInputs: relevantMacro.map((m) => m.name),
            missingInputs: [],
            lastRun: new Date().toISOString(),
            freshness: 'CURRENT',
          };
        }

        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `No live macro indicators matched for ${normSymbol}. Telemetry awaiting update.`,
          evidence: ['Live Macro Telemetry: AWAITING REFRESH'],
          keyRisk: 'N/A',
          invalidation: 'N/A',
          requiredInputs: ['Sovereign Yields', 'Dollar Index (DXY)'],
          availableInputs: [],
          missingInputs: ['Live Macro API Telemetry'],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }

      case 'CORRELATION': {
        const corrTarget = normSymbol === 'XAUUSD' ? 'DXY' : (normSymbol === 'USOIL' ? 'DXY' : 'US500');
        const expectedBenchmark = normSymbol === 'XAUUSD' ? -0.72 : (normSymbol === 'USOIL' ? -0.45 : +0.65);
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `Intermarket correlation data limited: Synchronized benchmark OHLC (${corrTarget}) not connected. Historical correlation baseline (${expectedBenchmark}) is contextual reference only.`,
          evidence: [
            `Benchmark Asset: ${corrTarget} (OHLC UNAVAILABLE)`,
            `Historical Reference Baseline: ${expectedBenchmark} (Contextual Reference Only)`,
            'Live Beta: UNMEASURED (Awaiting synchronized benchmark feed)',
            'Regime State: UNVERIFIED'
          ],
          keyRisk: 'Abrupt cross-asset contagion',
          invalidation: 'Regime breakdown',
          requiredInputs: ['Base Asset OHLC', 'Benchmark OHLC'],
          availableInputs: hasCandles ? ['Base Asset OHLC'] : [],
          missingInputs: ['Benchmark OHLC'],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }

      case 'NEWS': {
        if (cachedNews.length > 0) {
          const top = cachedNews[0];
          // Conservative fail-closed invariant: News agent maintains NEUTRAL trading bias.
          // Event awareness, severity, and authentic provenance are contributed without inventing directional conviction.
          const newsBias: BiasType = 'NEUTRAL';

          // Determine authentic freshness from top article's publishedAt timestamp
          const now = Date.now();
          const topEpoch = top.epochMs || Date.parse(top.publishedAt);
          let articleFreshness: 'REALTIME' | 'CURRENT' | 'DELAYED' | 'STALE' = 'CURRENT';
          if (!isNaN(topEpoch)) {
            const ageMs = now - topEpoch;
            if (ageMs <= 2 * 3600 * 1000) {
              articleFreshness = 'CURRENT';
            } else if (ageMs <= 24 * 3600 * 1000) {
              articleFreshness = 'DELAYED';
            } else {
              articleFreshness = 'STALE';
            }
          }

          return {
            ...base,
            bias: newsBias,
            confidence: 0,
            status: 'ONLINE',
            lastOpinion: `Live newswire active [${top.impactTier}]: "${top.headline.slice(0, 85)}..." (${top.source}). Event context noted; market direction neutral.`,
            evidence: cachedNews.slice(0, 3).map((n) =>
              `[${n.impactTier}] ${n.headline} (${n.source}) — ${n.publishedAt}`
            ),
            keyRisk: 'Unscheduled headline disruption',
            invalidation: 'Official release revision',
            requiredInputs: ['Global Newswire Stream', 'Central Bank Wires'],
            availableInputs: ['Yahoo Market Wire / Fed RSS'],
            missingInputs: [],
            lastRun: new Date().toISOString(),
            freshness: articleFreshness,
          };
        }

        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `No active wire reports matched for ${normSymbol}. Newswire stream connected.`,
          evidence: ['Newswire: 0 MATCHED STORIES (AWAITING WIRE)'],
          keyRisk: 'N/A',
          invalidation: 'N/A',
          requiredInputs: ['Global Newswire Stream'],
          availableInputs: [],
          missingInputs: ['Matched Newswire Wire'],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }

      case 'GEOPOLITICAL': {
        if (cachedAlerts.length > 0) {
          const top = cachedAlerts[0];
          const hasRisk = normSymbol === 'XAUUSD' || normSymbol === 'USOIL';
          const geoBias: BiasType = hasRisk && (top.threatLevel === 'CRITICAL' || top.threatLevel === 'HIGH' || top.threatLevel === 'ELEVATED')
            ? 'BULLISH'
            : 'NEUTRAL';

          return {
            ...base,
            bias: geoBias,
            confidence: 0,
            status: 'ONLINE',
            lastOpinion: `[${top.threatLevel}] ${top.headline} (${top.region}). ${top.marketImpactAssessment.slice(0, 100)}...`,
            evidence: cachedAlerts.map((a) =>
              `[${a.threatLevel}] ${a.headline} | Impact: ${a.marketImpactAssessment}`
            ),
            keyRisk: 'Escalation impacting maritime transit',
            invalidation: 'Comprehensive geopolitical de-escalation',
            requiredInputs: ['Geopolitical Risk Feed', 'Maritime Transit Alerts'],
            availableInputs: ['Global Wire Surveillance'],
            missingInputs: [],
            lastRun: new Date().toISOString(),
            freshness: 'CURRENT',
          };
        }

        // No corroborated geopolitical alerts in feed: enter DATA LIMITED
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `Geopolitical surveillance active. No corroborated risk events recorded for ${normSymbol}.`,
          evidence: ['Geopolitical stream: NO ACTIVE FLASHPOINTS (DATA LIMITED)'],
          keyRisk: 'N/A',
          invalidation: 'N/A',
          requiredInputs: ['Geopolitical Risk Feed', 'Maritime Transit Alerts'],
          availableInputs: [],
          missingInputs: ['Corroborated Geopolitical Alert Feed'],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }

      case 'SENTIMENT': {
        if (cachedSentiment && cachedSentiment.status === 'AVAILABLE') {
          // Genuine Binance Futures retail positioning for crypto
          let sentBias: BiasType = 'NEUTRAL';
          if (cachedSentiment.bullishPercent > 65) sentBias = 'BEARISH'; // Contrarian crowd fade
          else if (cachedSentiment.bearishPercent > 65) sentBias = 'BULLISH';

          return {
            ...base,
            bias: sentBias,
            confidence: 0,
            status: 'ONLINE',
            lastOpinion: `Binance Futures LSR: ${cachedSentiment.bullishPercent}% Long vs ${cachedSentiment.bearishPercent}% Short. ${cachedSentiment.bullishPercent > 65 ? 'Retail crowd long-heavy (Contrarian Short bias)' : (cachedSentiment.bearishPercent > 65 ? 'Retail crowd short-heavy (Contrarian Long bias)' : 'Balanced crowd positioning')}.`,
            evidence: [
              `Long Account Ratio: ${cachedSentiment.bullishPercent}%`,
              `Short Account Ratio: ${cachedSentiment.bearishPercent}%`,
              `Contrarian Skew: ${cachedSentiment.overallScore > 0 ? 'LONG_CROWDED' : 'SHORT_CROWDED'}`,
              `Provenance: ${cachedSentiment.provenance}`
            ],
            keyRisk: 'Extreme retail crowding squeeze continuation',
            invalidation: 'Positioning rebalance past 50/50',
            requiredInputs: ['Positioning Flow Stream', 'Derivatives Metrics'],
            availableInputs: ['Binance Futures Public LSR'],
            missingInputs: [],
            lastRun: new Date().toISOString(),
            freshness: 'REALTIME',
          };
        }

        // Truthfully mark OTC spot DATA LIMITED without synthetic percentages
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `No centralized positioning feed available for OTC spot ${normSymbol}. Crowd positioning unavailable.`,
          evidence: [
            'Retail Positioning: UNAVAILABLE FOR OTC SPOT',
            'Fabrication Policy: ZERO FAKE PERCENTAGES ENFORCED'
          ],
          keyRisk: 'N/A',
          invalidation: 'N/A',
          requiredInputs: ['Positioning Flow Stream', 'Social & News Sentiment'],
          availableInputs: [],
          missingInputs: ['Centralized Positioning Gateway'],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }

      case 'INSTITUTIONAL': {
        if (hasCandles && volumeProfile) {
          const volType = volumeProfile.isExchangeVolume ? 'EXCHANGE_VOLUME' : 'BROKER_TICK_VOLUME_PROXY';
          const abovePoc = p >= volumeProfile.poc;
          const instBias: BiasType = abovePoc ? 'BULLISH' : 'BEARISH';

          return {
            ...base,
            bias: instBias,
            confidence: 0,
            status: 'ONLINE',
            lastOpinion: `Volume profile structural distribution active (${volType}). Price is trading ${abovePoc ? 'ABOVE' : 'BELOW'} Point of Control (${volumeProfile.poc}). VAH: ${volumeProfile.vah}, VAL: ${volumeProfile.val}.`,
            evidence: [
              `Volume Mode: ${volType}`,
              `Point of Control (POC): ${volumeProfile.poc}`,
              `Value Area (70%): [${volumeProfile.val} - ${volumeProfile.vah}]`,
              `High Volume Nodes: ${volumeProfile.hvnLevels.length} mapped`,
              `Structural Bias: ${abovePoc ? 'ACCEPTANCE_ABOVE_POC' : 'ACCEPTANCE_BELOW_POC'}`
            ],
            keyRisk: 'Late London fix algorithmic rebalancing',
            invalidation: 'POC level breach and volume migration',
            requiredInputs: ['Volume Profile Engine', 'Volume Cluster Telemetry'],
            availableInputs: ['Volume Profile Engine', 'Volume Cluster Telemetry'],
            missingInputs: [],
            lastRun: new Date().toISOString(),
            freshness: 'CURRENT',
          };
        }

        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `Volume profile structural distribution awaiting verified OHLC candles for ${normSymbol}.`,
          evidence: ['Volume Profile: PENDING CANDLES'],
          keyRisk: 'N/A',
          invalidation: 'N/A',
          requiredInputs: ['Volume Profile Engine', 'Volume Cluster Telemetry'],
          availableInputs: [],
          missingInputs: ['Verified OHLC Candles'],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }

      case 'ORDER_FLOW': {
        if (orderFlowRecord) {
          let flowBias: BiasType = 'NEUTRAL';
          let flowOpinion = '';

          if (orderFlowRecord.buyerSellerDelta > 0.15) {
            flowBias = 'BULLISH';
            flowOpinion = `Micro-flow buyer aggression detected (${orderFlowRecord.flowType}). Delta: +${(orderFlowRecord.buyerSellerDelta * 100).toFixed(1)}%. Velocity: ${orderFlowRecord.tickVelocity} ticks/bar. Fast bias LONG.`;
          } else if (orderFlowRecord.buyerSellerDelta < -0.15) {
            flowBias = 'BEARISH';
            flowOpinion = `Micro-flow selling absorption detected (${orderFlowRecord.flowType}). Delta: ${(orderFlowRecord.buyerSellerDelta * 100).toFixed(1)}%. Velocity: ${orderFlowRecord.tickVelocity} ticks/bar. Fast bias SHORT.`;
          } else {
            flowBias = 'NEUTRAL';
            flowOpinion = `Micro-flow balanced (${orderFlowRecord.flowType}). Delta within normal bounds. Velocity: ${orderFlowRecord.tickVelocity} ticks/bar.`;
          }

          return {
            ...base,
            name: 'Scalper / Flow Sniper',
            role: 'M1/M5 Micro-Structure & Momentum',
            bias: flowBias,
            confidence: 0,
            status: 'ONLINE',
            lastOpinion: flowOpinion,
            evidence: [
              `Flow Mode: ${orderFlowRecord.flowType}`,
              `Buyer/Seller Delta: ${(orderFlowRecord.buyerSellerDelta * 100).toFixed(1)}%`,
              `Volume Velocity: ${orderFlowRecord.tickVelocity} ticks/bar`,
              `Timeframe: ${orderFlowRecord.timeframe}`
            ],
            keyRisk: 'Fast mean-reversion whip',
            invalidation: 'Micro delta flip',
            requiredInputs: ['M1/M5 Verified Candles', 'Tick Volume Delta'],
            availableInputs: ['M1/M5 Verified Candles', 'Tick Volume Delta'],
            missingInputs: [],
            lastRun: new Date().toISOString(),
            freshness: 'REALTIME',
          };
        }

        return {
          ...base,
          name: 'Scalper / Flow Sniper',
          role: 'M1/M5 Micro-Structure & Momentum',
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: 'Awaiting verified candle stream to compute micro-momentum and order flow delta.',
          evidence: ['Candle feed: PENDING'],
          keyRisk: 'N/A',
          invalidation: 'N/A',
          requiredInputs: ['M1/M5 Verified Candles', 'Tick Volume Delta'],
          availableInputs: [],
          missingInputs: ['M1/M5 Verified Candles'],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }

      case 'VISION': {
        if (hasCandles && marketStructure) {
          const visBias: BiasType = marketStructure.trend === 'BULLISH' ? 'BULLISH' : (marketStructure.trend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL');
          const hasZones = marketStructure.orderBlocks.length > 0 || marketStructure.fvg.length > 0;
          return {
            ...base,
            bias: visBias,
            confidence: hasZones ? 76 : 65,
            status: 'ONLINE',
            lastOpinion: `Structured chart pattern recognition active. ${marketStructure.trend} structure with ${marketStructure.fvg.length} FVGs and ${marketStructure.orderBlocks.length} Order Blocks mapped on ${structureTf}.`,
            evidence: [
              `SMC Chart Structure: ${marketStructure.trend} (${marketStructure.candleCount} bars)`,
              `Active Order Blocks: ${marketStructure.orderBlocks.length}`,
              `Active Fair Value Gaps: ${marketStructure.fvg.length}`,
              `Key Swings: [${marketStructure.lastSwingLow ?? 'N/A'} - ${marketStructure.lastSwingHigh ?? 'N/A'}]`,
              volumeProfile ? `Volume Profile POC: ${volumeProfile.poc}` : 'Volume Profile: CALIBRATING'
            ],
            keyRisk: 'Pattern invalidation on opposing boundary break',
            invalidation: marketStructure.trend === 'BULLISH'
              ? (marketStructure.lastSwingLow ? `Breach of swing low ${marketStructure.lastSwingLow}` : 'Structure breach')
              : (marketStructure.lastSwingHigh ? `Breach of swing high ${marketStructure.lastSwingHigh}` : 'Structure breach'),
            requiredInputs: ['Verified OHLC Candles', 'Structure Geometry'],
            availableInputs: ['Verified OHLC Candles', 'Structure Geometry'],
            missingInputs: [],
            lastRun: new Date().toISOString(),
            freshness: 'CURRENT',
          };
        }

        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `Awaiting verified chart candles for structural vision analysis on ${normSymbol}.`,
          evidence: ['Chart structure: PENDING CANDLES'],
          keyRisk: 'N/A',
          invalidation: 'N/A',
          requiredInputs: ['Verified OHLC Candles'],
          availableInputs: [],
          missingInputs: ['Verified OHLC Candles'],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }

      default: {
        return {
          ...base,
          bias: 'NEUTRAL',
          confidence: 0,
          status: 'DATA LIMITED',
          lastOpinion: `Surveillance active for ${base.name}. Feed connection pending.`,
          evidence: ['Feed: PENDING'],
          keyRisk: 'N/A',
          invalidation: 'N/A',
          requiredInputs: [],
          availableInputs: [],
          missingInputs: [],
          lastRun: new Date().toISOString(),
          freshness: 'OFFLINE',
        };
      }
    }
  });

  // 5. Attach Canonical Machine-Readable Evidence & Trust Scores
  const latestCandle = analysisCandles.length > 0 ? analysisCandles[analysisCandles.length - 1] : undefined;
  const tfInterval = TIMEFRAME_INTERVAL_MS[structureTf] || 3600_000;
  const candleCloseTs = latestCandle && typeof latestCandle.timestamp === 'number'
    ? latestCandle.timestamp + tfInterval
    : undefined;
  const candleTimestampMs = quoteTimestampMs || (candleCloseTs && candleCloseTs <= evalTimeMs ? candleCloseTs : latestCandle?.timestamp);

  const latestMicroCandle = (Array.isArray(microCandles) && microCandles.length > 0)
    ? microCandles[microCandles.length - 1]
    : undefined;
  const microInterval = TIMEFRAME_INTERVAL_MS['M5'] || 300_000;
  const microCloseTs = latestMicroCandle && typeof latestMicroCandle.timestamp === 'number'
    ? latestMicroCandle.timestamp + microInterval
    : undefined;
  const microCandleTimestampMs = quoteTimestampMs || (microCloseTs && microCloseTs <= evalTimeMs ? microCloseTs : latestMicroCandle?.timestamp) || candleTimestampMs;

  assembledAgents.forEach((ag) => {
    const rawItems = ag.evidence && ag.evidence.length > 0 ? ag.evidence : [ag.lastOpinion];
    const evidenceRecords: AgentEvidence[] = rawItems.map((item, idx) => {
      let classification: EvidenceClassification = 'HEURISTIC';
      let sourceName = 'Heuristic or Unavailable';
      let sourceType = 'HEURISTIC';
      let sourceTimestampMs: number | undefined = undefined;
      let structuralGate = false;
      const lower = item.toLowerCase();
      const agentStatus = ag.status;

      if (
        lower.includes('not connected') ||
        lower.includes('unavailable') ||
        lower.includes('data limited') ||
        lower.includes('pending') ||
        agentStatus === 'DATA LIMITED' ||
        agentStatus === 'OFFLINE' ||
        agentStatus === 'ERROR'
      ) {
        classification = 'UNAVAILABLE';
        sourceName = 'Unconnected Feed';
        sourceType = 'UNAVAILABLE';
        sourceTimestampMs = undefined;
        structuralGate = false;
      } else if (ag.type === 'RISK_GUARDIAN' && (blueprint || hasCandles)) {
        classification = 'DERIVED';
        sourceName = 'Risk Rules Matrix';
        sourceType = 'RISK_ENGINE';
        sourceTimestampMs = blueprint
          ? (blueprint.updatedAt || blueprint.createdAt)
          : (quoteTimestampMs || candleTimestampMs);
        structuralGate = Boolean(blueprint);
      } else if (ag.type === 'KILLZONE') {
        classification = 'DERIVED';
        sourceName = 'Temporal Session Engine';
        sourceType = 'TEMPORAL_SESSION';
        sourceTimestampMs = evalTimeMs;
        structuralGate = true;
      } else if (ag.type === 'TECHNICAL' && hasCandles) {
        classification = effectiveCandleProvenance;
        sourceName = effectiveCandleProvenance === 'LIVE_MT5'
          ? 'MT5 Broker Telemetry'
          : effectiveCandleProvider;
        sourceType = effectiveCandleProvenance === 'LIVE_MT5'
          ? 'BROKER_MT5'
          : (effectiveCandleProvenance === 'INDEPENDENT_REFERENCE' ? 'REFERENCE_PROXY' : 'INDEPENDENT_EXCHANGE');
        sourceTimestampMs = candleTimestampMs;
        structuralGate = effectiveCandleProvenance !== 'INDEPENDENT_REFERENCE';
      } else if ((ag.type === 'STRATEGY' || ag.type === 'OPPORTUNITY' || ag.type === 'LIQUIDITY_MAP' || ag.type === 'ORDER_FLOW') && hasCandles) {
        if (effectiveCandleProvenance === 'INDEPENDENT_REFERENCE') {
          // B. Reference-derived candle evidence retains explicit reference/proxy semantics
          // MUST NOT become DERIVED_FROM_VERIFIED; non-executable
          classification = 'INDEPENDENT_REFERENCE';
          sourceType = 'REFERENCE_PROXY';
          structuralGate = false;
        } else if (effectiveCandleProvenance === 'LIVE_MT5') {
          classification = 'DERIVED';
          sourceType = ag.type === 'ORDER_FLOW' ? 'ORDER_FLOW_ENGINE' : 'MATHEMATICAL';
          structuralGate = ag.type === 'ORDER_FLOW' ? true : Boolean(blueprint);
        } else if (effectiveCandleProvenance === 'INDEPENDENT_VERIFIED') {
          classification = 'DERIVED_FROM_VERIFIED';
          sourceType = ag.type === 'ORDER_FLOW' ? 'ORDER_FLOW_ENGINE' : 'MATHEMATICAL';
          structuralGate = ag.type === 'ORDER_FLOW' ? true : Boolean(blueprint);
        } else {
          classification = 'DERIVED';
          sourceType = ag.type === 'ORDER_FLOW' ? 'ORDER_FLOW_ENGINE' : 'MATHEMATICAL';
          structuralGate = ag.type === 'ORDER_FLOW' ? true : Boolean(blueprint);
        }

        if (ag.type === 'ORDER_FLOW') {
          sourceName = orderFlowRecord
            ? (orderFlowRecord.flowType === 'EXCHANGE_VOLUME_DELTA' ? 'Exchange Volume Delta' : 'Broker Flow Proxy')
            : `Micro-Momentum Engine (${effectiveCandleProvider})`;
          sourceTimestampMs = orderFlowRecord?.timestamp && !isNaN(new Date(orderFlowRecord.timestamp).getTime())
            ? new Date(orderFlowRecord.timestamp).getTime()
            : microCandleTimestampMs;
        } else {
          sourceName = `Deterministic SMC (${effectiveCandleProvider})`;
          sourceTimestampMs = blueprint
            ? (blueprint.updatedAt || blueprint.createdAt || candleTimestampMs)
            : candleTimestampMs;
        }
      } else if (ag.type === 'INSTITUTIONAL' && hasCandles && volumeProfile) {
        if (effectiveCandleProvenance === 'INDEPENDENT_REFERENCE') {
          classification = 'INDEPENDENT_REFERENCE';
          sourceType = 'REFERENCE_PROXY';
        } else if (effectiveCandleProvenance === 'LIVE_MT5') {
          classification = 'DERIVED';
          sourceType = 'VOLUME_PROFILE_ENGINE';
        } else if (effectiveCandleProvenance === 'INDEPENDENT_VERIFIED') {
          classification = 'DERIVED_FROM_VERIFIED';
          sourceType = 'VOLUME_PROFILE_ENGINE';
        } else {
          classification = 'DERIVED';
          sourceType = 'VOLUME_PROFILE_ENGINE';
        }
        sourceName = volumeProfile.isExchangeVolume ? 'Exchange Volume Profile' : 'Broker Tick Volume Profile';
        sourceTimestampMs = candleTimestampMs;
        structuralGate = false;
      } else if (ag.type === 'CORRELATION') {
        classification = 'UNAVAILABLE';
        sourceName = 'Intermarket Correlation Baseline';
        sourceType = 'HISTORICAL_REFERENCE';
        sourceTimestampMs = undefined;
        structuralGate = false;
      } else if (ag.type === 'VISION' && hasCandles && marketStructure) {
        classification = effectiveCandleProvenance === 'INDEPENDENT_REFERENCE'
          ? 'INDEPENDENT_REFERENCE'
          : 'MODEL_INFERENCE';
        sourceName = 'Computer Vision Technical Detection';
        sourceType = 'MODEL_INFERENCE';
        sourceTimestampMs = candleTimestampMs;
        structuralGate = false;
      } else if (ag.type === 'MACRO' && cachedXauusdMacro && cachedXauusdMacro.dataReadiness !== 'UNAVAILABLE') {
        classification = 'INDEPENDENT_VERIFIED';
        sourceName = 'Official Federal Reserve Economic Data (FRED)';
        sourceType = 'MACROECONOMIC_ENGINE';
        sourceTimestampMs = cachedXauusdMacro.assembledAt;
        structuralGate = false;
      } else if (ag.type === 'MACRO' && cachedMacro.length > 0) {
        const relevantMacro = cachedMacro.filter((m) =>
          !m.affectedAssets || m.affectedAssets.length === 0 || m.affectedAssets.includes(normSymbol)
        );
        if (relevantMacro.length > 0) {
          const lead = relevantMacro[0];
          classification = lead.classification || 'DELAYED_EXTERNAL';
          sourceName = lead.source || 'Global Macroeconomic Engine';
          sourceType = 'ECONOMIC_CALENDAR';
          const rawMacroTs = lead.timestamp || lead.releaseDate;
          sourceTimestampMs = rawMacroTs && !isNaN(new Date(rawMacroTs).getTime())
            ? new Date(rawMacroTs).getTime()
            : undefined;
          structuralGate = false;
        } else {
          classification = 'UNAVAILABLE';
          sourceName = 'Unconnected Feed';
          sourceType = 'UNAVAILABLE';
          sourceTimestampMs = undefined;
          structuralGate = false;
        }
      } else if (ag.type === 'NEWS' && cachedNews.length > 0) {
        const top = cachedNews[0];
        classification = top.classification || 'DELAYED_EXTERNAL';
        sourceName = top.source || 'Global Newswire Stream';
        sourceType = 'FINANCIAL_NEWS';
        sourceTimestampMs = top.epochMs || (top.publishedAt && !isNaN(new Date(top.publishedAt).getTime())
          ? new Date(top.publishedAt).getTime()
          : undefined);
        structuralGate = false;
      } else if (ag.type === 'GEOPOLITICAL' && cachedAlerts.length > 0) {
        const top = cachedAlerts[0];
        classification = top.classification || 'DELAYED_EXTERNAL';
        sourceName = 'Geopolitical Risk Engine';
        sourceType = 'GEOPOLITICAL_STREAM';
        sourceTimestampMs = top.timestamp && !isNaN(new Date(top.timestamp).getTime())
          ? new Date(top.timestamp).getTime()
          : undefined;
        structuralGate = false;
      } else if (ag.type === 'SENTIMENT' && cachedSentiment && cachedSentiment.status === 'AVAILABLE') {
        classification = cachedSentiment.classification || 'INDEPENDENT_VERIFIED';
        sourceName = cachedSentiment.provenance || 'Binance Futures Public LSR';
        sourceType = 'SENTIMENT_FEED';
        sourceTimestampMs = cachedSentiment.timestamp && !isNaN(new Date(cachedSentiment.timestamp).getTime())
          ? new Date(cachedSentiment.timestamp).getTime()
          : undefined;
        structuralGate = false;
      } else if (lower.includes('mt5 broker') || lower.includes('live_mt5') || lower.includes('broker candle')) {
        classification = 'LIVE_MT5';
        sourceName = 'MT5 Broker Telemetry';
        sourceType = 'BROKER_MT5';
        sourceTimestampMs = quoteTimestampMs || candleTimestampMs;
        structuralGate = true;
      } else {
        classification = 'HEURISTIC';
        sourceName = 'Heuristic or Unavailable';
        sourceType = 'HEURISTIC';
        sourceTimestampMs = undefined;
        structuralGate = false;
      }

      // Compute actual observation timestamp and freshness without fabrication
      let observedAt: string;
      let freshnessMs: number;

      if (typeof sourceTimestampMs === 'number' && !isNaN(sourceTimestampMs) && sourceTimestampMs > 0) {
        observedAt = new Date(sourceTimestampMs).toISOString();
        freshnessMs = Math.max(0, evalTimeMs - sourceTimestampMs);
      } else {
        // Trustworthy observation timestamp is genuinely unavailable:
        // Do NOT fabricate 5-second freshness; keep evidence non-decision-eligible if freshness cannot be verified.
        observedAt = 'UNAVAILABLE';
        const policy = FRESHNESS_POLICIES[classification as EvidenceClassification] ?? 0;
        freshnessMs = policy > 0 ? policy + 60_000 : 86_400_000;
      }

      // Canonical Decision Eligibility
      const canonicalEligibility = isEvidenceDecisionEligible(classification, freshnessMs);
      const verified = canonicalEligibility.verified;
      const decisionEligible = canonicalEligibility.eligible && structuralGate;
      const reason = (!decisionEligible && canonicalEligibility.eligible && !structuralGate)
        ? (ag.type === 'STRATEGY' || ag.type === 'OPPORTUNITY' || ag.type === 'LIQUIDITY_MAP'
            ? 'Structural blueprint required for decision eligibility'
            : 'Specialist analytical context only — not eligible for unilateral execution weight')
        : canonicalEligibility.reason;

      return {
        id: `ev-${normSymbol}-${ag.type}-${idx + 1}`,
        agentKey: ag.type,
        asset: normSymbol,
        claim: item,
        source: sourceName,
        sourceType,
        classification,
        observedAt,
        freshnessMs,
        confidence: ag.confidence,
        assetSpecific: true,
        verified,
        decisionEligible,
        reason
      };
    });

    const trustResult = calculateAgentEvidenceTrust(evidenceRecords);
    ag.evidenceRecords = evidenceRecords;
    ag.evidenceTrustScore = trustResult.trustScore;
    ag.provenanceBadge = trustResult.badge;

    // P1 Confidence Integrity: Synchronize agent production confidence with evidence trust.
    // DATA LIMITED / OFFLINE / ERROR agents with no trustworthy evidence fail closed (confidence = 0).
    // Heuristic, simulated, hardcoded, or unavailable evidence cannot masquerade as verified confidence.
    if (ag.status === 'DATA LIMITED' || ag.status === 'OFFLINE' || ag.status === 'ERROR' || trustResult.trustScore === 0) {
      ag.confidence = 0;
      ag.evidenceTrustScore = 0;
    } else {
      ag.confidence = trustResult.trustScore;
    }

    // Synchronize individual evidence records so they reflect truthful confidence
    evidenceRecords.forEach((ev) => {
      ev.confidence = ag.confidence;
    });
  });

  const rgAgent = assembledAgents.find((a) => a.type === 'RISK_GUARDIAN');

  // 6. Specialist Agents & Cortex Confluence Engine Integration
  const ratesSpecialist = evaluateRatesAgent({
    yieldCurve: feeds?.macroDetails?.yieldCurve,
    fedPolicy: feeds?.macroDetails?.fedPolicy,
    tenYearYield: feeds?.macroDetails?.tenYearYield,
  });

  const inflationSpecialist = evaluateInflationAgent({
    breakevenAnalysis: feeds?.macroDetails?.breakeven,
    realYieldAnalysis: feeds?.macroDetails?.realYield,
  });

  const volatilitySpecialist = evaluateVolatilityAgent({
    regime: feeds?.regime || undefined,
  });

  const crossAssetSpecialist = evaluateCrossAssetAgent({
    matrix: feeds?.crossAsset || undefined,
  });

  const rawSentinel = feeds?.sentinel || evaluateDataSentinelAgent({
    isMt5Online: false,
    activeProviders: [],
    offlineProviders: [],
    feedAgeMs: 0,
  });

  const dataSentinelSpecialist: UnifiedAgentResponse = {
    ...rawSentinel,
    instrument: normSymbol,
  };

  const quantSpecialist = evaluateQuantAgent({
    metrics: feeds?.quant?.metrics || undefined,
    analogue: feeds?.quant?.analogue || undefined,
  });

  const specialistsList: UnifiedAgentResponse[] = [
    ratesSpecialist,
    inflationSpecialist,
    volatilitySpecialist,
    crossAssetSpecialist,
    dataSentinelSpecialist,
    quantSpecialist,
  ].map((spec) => ({
    ...spec,
    instrument: normSymbol,
  }));

  const domainMapping: Record<AgentType, EvidenceDomainFamily> = {
    TECHNICAL: 'PRICE_TECHNICAL',
    MACRO: 'MACRO_REGIME',
    CORRELATION: 'CROSS_ASSET',
    NEWS: 'NEWS_EVENT',
    GEOPOLITICAL: 'GEOPOLITICAL_EVENT',
    SENTIMENT: 'SENTIMENT',
    INSTITUTIONAL: 'ORDER_FLOW',
    RISK_GUARDIAN: 'RISK_GEOMETRY',
    VISION: 'MARKET_STRUCTURE',
    OPPORTUNITY: 'PRICE_TECHNICAL',
    STRATEGY: 'PRICE_TECHNICAL',
    ORDER_FLOW: 'ORDER_FLOW',
    KILLZONE: 'LIQUIDITY',
    LIQUIDITY_MAP: 'LIQUIDITY',
    FINAL_DECISION: 'SYSTEM_INTEGRITY',
  };

  const councilUnifiedResponses: UnifiedAgentResponse[] = assembledAgents
    .filter((a) => a.type !== 'FINAL_DECISION')
    .map((a) => {
      const family = domainMapping[a.type] || 'PRICE_TECHNICAL';
      const dir: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' =
        a.bias === 'BULLISH' ? 'BULLISH' :
        a.bias === 'BEARISH' ? 'BEARISH' :
        a.bias === 'CAUTION' ? 'CAUTION' : 'NEUTRAL';

      const readinessState = (a.status === 'ONLINE' || a.status === 'ANALYZING' || a.status === 'PROCESSING')
        ? (a.confidence >= 50 ? 'READY' : 'PARTIAL')
        : 'DATA_LIMITED';

      return {
        agentId: a.type,
        agentName: a.name,
        role: a.role,
        domainFamily: family,
        instrument: normSymbol,
        direction: dir,
        confidence: a.confidence,
        evidenceTrust: a.evidenceTrustScore || a.confidence,
        readiness: readinessState,
        primaryThesis: a.lastOpinion,
        evidence: (a.evidenceRecords || []).map((ev) => ({
          id: ev.id,
          agentId: a.type,
          domainFamily: family,
          nature: 'DATA' as const,
          classification: ev.classification,
          polarity: dir,
          strength: ev.decisionEligible ? 0.8 : 0.4,
          confidence: ev.confidence,
          claim: ev.claim,
          source: ev.source,
          provider: ev.source,
          observedAt: ev.observedAt,
          receivedAt: Date.now(),
          freshnessMs: ev.freshnessMs,
          isStale: ev.freshnessMs > 60_000,
          instrument: normSymbol,
        })),
        conflicts: [],
        missingEvidence: a.missingInputs || [],
        invalidation: a.invalidation || 'Structural violation',
        keyRisk: a.keyRisk || 'Market latency',
        provenanceBadge: a.provenanceBadge || 'INDEPENDENT',
        generatedAt: Date.now(),
      };
    });

  const allUnifiedAgents: UnifiedAgentResponse[] = [
    ...specialistsList,
    ...councilUnifiedResponses,
  ];

  const confluenceEngine = new CortexConfluenceEngine();
  const confluenceResult = confluenceEngine.evaluateConfluence({
    instrument: normSymbol,
    agents: allUnifiedAgents,
    riskCheckPassed: !rgAgent || rgAgent.bias !== 'RESTRICTED',
  });

  // Compute Consensus Trust & Actionability Gate
  const consensusTrust = calculateConsensusTrust(assembledAgents);
  const actionability = evaluateActionabilityGate({
    evidenceTrust: consensusTrust.evidenceTrust,
    verifiedAgentCount: consensusTrust.verifiedAgentCount,
    tradeExecutable,
    marketState: sessionState.marketState
  });

  // 7. Directional Evidence Gating & Confluence Integration:
  // WATCH FOR BUY requires verified bullish confluence and setup alignment.
  // WATCH FOR SELL requires verified bearish confluence and setup alignment.
  // Confluence engine ensures 5 weak agents never beat 2 trusted independent sources.
  const eligibleBullishCount = assembledAgents.filter((a) => {
    if (a.bias !== 'BULLISH') return false;
    if (a.status === 'DATA LIMITED' || a.status === 'OFFLINE' || a.status === 'ERROR') return false;
    return a.evidenceRecords?.some((e) => e.decisionEligible && e.verified);
  }).length;

  const eligibleBearishCount = assembledAgents.filter((a) => {
    if (a.bias !== 'BEARISH') return false;
    if (a.status === 'DATA LIMITED' || a.status === 'OFFLINE' || a.status === 'ERROR') return false;
    return a.evidenceRecords?.some((e) => e.decisionEligible && e.verified);
  }).length;

  let effectiveSetupDirection: AssetIntelligenceProfile['setupDirection'] = 'WAIT';

  // Single Authoritative Final Decision: CortexConfluenceEngine is the canonical presentation authority.
  // If Confluence presentationPosture === 'WAIT', effectiveSetupDirection MUST be 'WAIT'!
  if (confluenceResult.presentationPosture === 'WAIT') {
    effectiveSetupDirection = 'WAIT';
  } else if (
    confluenceResult.presentationPosture === 'WATCH FOR BUY' &&
    blueprint &&
    blueprint.state !== 'INVALIDATED' &&
    blueprint.state !== 'EXPIRED' &&
    blueprint.direction === 'BUY' &&
    eligibleBullishCount > 0 &&
    consensusTrust.evidenceTrust >= 40 &&
    setupLifecycleRecord?.state !== 'INVALIDATED'
  ) {
    effectiveSetupDirection = 'WATCH FOR BUY';
  } else if (
    confluenceResult.presentationPosture === 'WATCH FOR SELL' &&
    blueprint &&
    blueprint.state !== 'INVALIDATED' &&
    blueprint.state !== 'EXPIRED' &&
    blueprint.direction === 'SELL' &&
    eligibleBearishCount > 0 &&
    consensusTrust.evidenceTrust >= 40 &&
    setupLifecycleRecord?.state !== 'INVALIDATED'
  ) {
    effectiveSetupDirection = 'WATCH FOR SELL';
  } else {
    // Insufficient evidence, waiting posture, or no directional setup -> WAIT
    effectiveSetupDirection = 'WAIT';
  }

  // Session closed override
  if (!tradeExecutable) {
    if (sessionState.marketState === 'PRE_OPEN') {
      effectiveSetupDirection = 'PRE-OPEN WATCH';
    } else if (sessionState.marketState === 'DAILY_BREAK') {
      effectiveSetupDirection = 'WAIT (MARKET CLOSED)';
    } else {
      effectiveSetupDirection = 'MONITOR NEXT OPEN';
    }
  }

  // 8. Update Final Decision Agent from Confluence consensus
  const finalAgent = assembledAgents.find((a) => a.type === 'FINAL_DECISION');
  if (finalAgent) {
    finalAgent.bias = effectiveSetupDirection.includes('BUY')
      ? 'BULLISH'
      : effectiveSetupDirection.includes('SELL')
      ? 'BEARISH'
      : 'NEUTRAL';
    const isFinalOnline = confluenceResult.dataReadiness === 'READY' || consensusTrust.verifiedAgentCount >= 3;
    finalAgent.status = isFinalOnline ? 'ONLINE' : 'DATA LIMITED';
    if (!isFinalOnline) {
      finalAgent.confidence = 0;
      finalAgent.evidenceTrustScore = 0;
    } else {
      finalAgent.confidence = confluenceResult.evidenceTrust;
      finalAgent.evidenceTrustScore = confluenceResult.evidenceTrust;
    }
    finalAgent.lastOpinion = `Cortex Confluence: ${effectiveSetupDirection}. Posture: ${confluenceResult.presentationPosture}. Agreement: ${confluenceResult.agreementScore}%, Conflict: ${confluenceResult.conflictScore}%. Evidence Trust: ${confluenceResult.evidenceTrust}%.`;
  }

  const directionalBias: DirectionalBias = effectiveSetupDirection.includes('BUY')
    ? 'BULLISH'
    : effectiveSetupDirection.includes('SELL')
      ? 'BEARISH'
      : 'NEUTRAL';
  const riskPosture: RiskPosture = !tradeExecutable
    ? 'RESTRICTED'
    : rgAgent?.bias === 'RESTRICTED'
    ? 'RESTRICTED'
    : rgAgent?.bias === 'NEUTRAL'
    ? 'CLEAR'
    : 'CAUTION';

  // Canonical Consensus Confidence Authority (P1 Integrity):
  // User-facing profile confidence is strictly derived from consensus evidence trust,
  // NOT produced by averaging arbitrary hardcoded agent confidence constants.
  // Truthfulness gate: Final profile confidence is strictly 0 when:
  // - effectiveSetupDirection is 'WAIT'
  // - there is no eligible bullish or bearish directional evidence
  // - evidence trust is below the minimum truthfulness threshold (< 30%)
  const isConfidenceTruthful =
    consensusTrust.evidenceTrust >= 30 &&
    effectiveSetupDirection !== 'WAIT' &&
    (eligibleBullishCount > 0 || eligibleBearishCount > 0);

  const profileConfidence = isConfidenceTruthful
    ? Math.round(consensusTrust.evidenceTrust)
    : 0;

  const macroDebateAgent = assembledAgents.find((a) => a.type === 'MACRO');
  const techDebateAgent = assembledAgents.find((a) => a.type === 'TECHNICAL');
  const debateTimeStr = new Date(evalTimeMs).toISOString().substring(11, 19);

  const debateMessages = [
    {
      time: debateTimeStr,
      agent: 'TECHNICAL AGENT',
      text: hasCandles
        ? `${normSymbol} ${normTf} structure ${marketStructure?.trend || 'analyzed'}. Swings: ${marketStructure?.swingHighs.length || 0}H / ${marketStructure?.swingLows.length || 0}L.`
        : `Phase 2D: ${normSymbol} awaiting verified OHLC candles from broker before structure analysis.`,
      status: (techDebateAgent?.status === 'ONLINE'
        ? techDebateAgent?.bias
        : 'DATA LIMITED') as any
    },
    {
      time: debateTimeStr,
      agent: 'MACRO AGENT',
      text: macroDebateAgent?.lastOpinion || `No live macro indicators matched for ${normSymbol}. Telemetry awaiting update.`,
      status: (macroDebateAgent?.status === 'ONLINE'
        ? macroDebateAgent.bias
        : 'DATA LIMITED') as any
    },
    {
      time: debateTimeStr,
      agent: 'RISK GUARDIAN',
      text: tradeExecutable
        ? (blueprint ? `Structural stop defined at ${blueprint.sl.price}. Risk policy cap is 0.50% equity. Position sizing unvalidated.` : `Risk Guardian armed. Maximum risk policy cap is 0.50% equity. Execution locked until verified blueprint exists.`)
        : `Execution hard-locked: Market is ${sessionState.marketState}. All order routes disabled.`,
      status: (rgAgent?.bias === 'RESTRICTED' ? 'RESTRICTED' : rgAgent?.bias === 'NEUTRAL' ? 'ACTIVE' : 'CAUTION') as any
    },
    {
      time: debateTimeStr,
      agent: 'FINAL DECISION',
      text: `Council status: ${effectiveSetupDirection}. Verified evidence trust: ${consensusTrust.evidenceTrust}%.`,
      status: (finalAgent?.bias || 'NEUTRAL') as any
    }
  ];

  const limitedAgentsList = assembledAgents
    .filter((a) => a.status === 'DATA LIMITED' || a.status === 'OFFLINE' || a.status === 'ERROR')
    .map((a) => a.name.replace(' Agent', ''));
  const feedStatusLine = limitedAgentsList.length > 0
    ? `Feeds currently DATA LIMITED: ${limitedAgentsList.slice(0, 4).join(', ')}${limitedAgentsList.length > 4 ? ` (+${limitedAgentsList.length - 4} more)` : ''}.`
    : 'All 15 council agent telemetry feeds active.';

  return {
    symbol: normSymbol,
    name: meta.name,
    timeframe: normTf,
    category: meta.category as any,
    regime: hasCandles && marketStructure ? `Structure ${marketStructure.trend}` : 'Awaiting Market Structure Analysis',
    session: sessionState.sessionName,
    trend: hasCandles && marketStructure ? marketStructure.trend : 'INSUFFICIENT DATA — Awaiting verified OHLC candles',
    volatility: hasCandles ? 'ATR computed from verified candles' : 'ATR: PENDING CANDLES',
    newsRisk: 'DATA LIMITED — No live news feed',
    liquidity: 'Broker specification available',
    setupDirection: effectiveSetupDirection,
    directionalBias,
    decisionPosture: effectiveSetupDirection,
    riskPosture,
    confidence: profileConfidence,
    entryZone: blueprint ? [blueprint.entryZoneLow.price, blueprint.entryZoneHigh.price] : (null as any),
    stopLoss: blueprint ? blueprint.sl.price : (null as any),
    tp1: blueprint ? blueprint.tp1.price : (null as any),
    tp2: blueprint && blueprint.tp2 ? blueprint.tp2.price : (null as any),
    tp3: blueprint && blueprint.tp3 ? blueprint.tp3.price : (null as any),
    rr: blueprint ? blueprint.rrRatio || '1:1.5' : (null as any),
    invalidation: blueprint ? blueprint.invalidation.reason : 'No structural invalidation computed yet — awaiting verified candles',
    whyThisTrade: [
      `Price: ${p.toFixed(5)} (${isPos ? '+' : ''}${liveAsset?.change24h?.toFixed(2) || 0}% 24h).`,
      hasCandles ? `Market structure: ${marketStructure?.trend}. Verified ${verifiedCandles?.length} bars.` : 'Market structure analysis pending. Verified OHLC candles required.',
      feedStatusLine,
    ],
    opposingRisks: [
      blueprint ? 'Structural invalidation level breach' : 'No verified blueprint exists — do not trade without structure-derived levels.',
      'Evidence Trust insufficient for ACTIONABLE state.',
    ],
    agents: assembledAgents,
    sessionState,
    tradeExecutable,
    setupQuality,
    debateMessages: debateMessages as any,
    evidenceTrust: consensusTrust.evidenceTrust,
    verifiedAgentCount: consensusTrust.verifiedAgentCount,
    limitedAgentCount: consensusTrust.limitedAgentCount,
    unavailableAgentCount: consensusTrust.unavailableAgentCount,
    actionabilityState: actionability.actionabilityState,
    blueprint,
    marketStructure,
    // Terminal Expansion Additions
    confluence: confluenceResult,
    regimeAssessment: feeds?.regime || null,
    crossAssetMatrix: feeds?.crossAsset || null,
    quantMetrics: feeds?.quant?.metrics || null,
    historicalAnalogue: feeds?.quant?.analogue || null,
    dataSentinel: dataSentinelSpecialist,
    specialistAgents: specialistsList,
    // M15/M30 Opportunity Recovery & Decision Consistency Additions
    multiTimeframeContext,
    triggerEvidence,
    setupLifecycle: setupLifecycleRecord,
  };
}
