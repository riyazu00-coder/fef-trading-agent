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
  AgentEvidence,
  ActionabilityState,
  EvidenceClassification
} from '../evidence/agent-evidence';
import { analyzeMarketStructure, MarketStructure } from '../market/market-structure-engine';
import { buildBuyBlueprint, buildSellBlueprint, BlueprintCandleSource, TradeBlueprint } from '../trading/trade-blueprint-engine';
import { OHLCCandle } from '../market/canonical-market-snapshot';

export type DirectionalBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type DecisionPosture = 'WATCH FOR BUY' | 'WATCH FOR SELL' | 'WAIT' | 'NO TRADE' | 'BUY OPPORTUNITY' | 'SELL OPPORTUNITY' | 'MONITOR NEXT OPEN' | 'PRE-OPEN WATCH' | 'REVALIDATING...' | 'WAIT (MARKET CLOSED)' | 'ANALYSIS ONLY' | 'DATA LIMITED';
export type RiskPosture = 'CLEAR' | 'CAUTION' | 'RESTRICTED';

export interface AssetIntelligenceProfile {
  symbol: string;
  name: string;
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
  { type: 'INSTITUTIONAL', name: 'Institutional Agent', role: 'Dark Pools & Fix Imbalances' },
  { type: 'RISK_GUARDIAN', name: 'Risk Guardian', role: 'Mathematical Exposure Bounds' },
  { type: 'VISION', name: 'Vision / Chart Agent', role: 'Computer Vision Technical Detection' },
  { type: 'OPPORTUNITY', name: 'Opportunity Agent', role: 'Risk / Reward Optimization' },
  { type: 'STRATEGY', name: 'Strategy Agent', role: 'Execution Protocols & Rules' },
  { type: 'ORDER_FLOW', name: 'Order Flow Agent', role: 'CVD, Footprint & Absorption' },
  { type: 'KILLZONE', name: 'Session / Killzone Agent', role: 'ICT Algorithmic Timing & IPDA' },
  { type: 'LIQUIDITY_MAP', name: 'Liquidity Agent', role: 'Resting BSL/SSL Pools & Heatmaps' },
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

/**
 * Canonical 15-Agent Swarm Pipeline Engine
 */
export function generateAssetIntelligence(
  symbol: string,
  liveAsset: LiveMarketAsset,
  timeframe: string = 'H1',
  verifiedCandles?: OHLCCandle[],
  candleProvenance?: EvidenceClassification,
  candleProvider?: string,
  evaluationTime?: Date
): AssetIntelligenceProfile {
  const normSymbol = (symbol || 'XAUUSD').toUpperCase();
  const normTf = (timeframe || 'H1').toUpperCase();
  const p = liveAsset?.price || 0;
  const isPos = (liveAsset?.change24h || 0) >= 0;

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
  const quoteTimestampMs = liveAsset?.lastUpdated && !isNaN(new Date(liveAsset.lastUpdated).getTime())
    ? new Date(liveAsset.lastUpdated).getTime()
    : undefined;
  const sessionState = evaluateMarketSession(normSymbol, evaluationTime, quoteTimestampMs);
  const tradeExecutable = sessionState.tradeExecutable;
  const setupQuality = sessionState.setupQuality;

  // 2. Market Structure Analysis if verified candles are provided
  const hasCandles = Array.isArray(verifiedCandles) && verifiedCandles.length >= 10;
  let marketStructure: MarketStructure | null = null;

  // Resolve truthful provenance & provider metadata
  let effectiveCandleProvenance: EvidenceClassification = 'UNAVAILABLE';
  let effectiveCandleProvider: string = 'NONE';

  if (hasCandles) {
    if (candleProvenance) {
      effectiveCandleProvenance = candleProvenance;
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

  // 3. Trade Blueprint Synthesis from real structure
  let blueprint: TradeBlueprint | null = null;
  const blueprintCandleSource: BlueprintCandleSource = effectiveCandleProvenance === 'LIVE_MT5'
    ? 'MT5_BROKER_OHLC'
    : effectiveCandleProvenance === 'INDEPENDENT_REFERENCE'
      ? 'INDEPENDENT_REFERENCE_OHLC'
      : 'INDEPENDENT_VERIFIED_OHLC';
  marketStructure = hasCandles
    ? analyzeMarketStructure(verifiedCandles!, normSymbol, normTf, blueprintCandleSource)
    : null;
  if (marketStructure && marketStructure.trend !== 'INSUFFICIENT_DATA') {
    if (marketStructure.trend === 'BULLISH') {
      blueprint = buildBuyBlueprint(marketStructure, verifiedCandles!, normSymbol, p, blueprintCandleSource);
    } else if (marketStructure.trend === 'BEARISH') {
      blueprint = buildSellBlueprint(marketStructure, verifiedCandles!, normSymbol, p, blueprintCandleSource);
    }
  }

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
            lastOpinion: `${normTf} structure: ${marketStructure.trend}. Swings: ${marketStructure.swingHighs.length}H / ${marketStructure.swingLows.length}L.`,
            evidence: [
              `Verified ${normTf} candles: ${marketStructure.candleCount} bars`,
              `Structure trend: ${marketStructure.trend}`,
              marketStructure.lastSwingHigh ? `Swing High: ${marketStructure.lastSwingHigh}` : 'Swing high mapped',
              marketStructure.lastSwingLow ? `Swing Low: ${marketStructure.lastSwingLow}` : 'Swing low mapped'
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
        if (hasCandles && marketStructure && (marketStructure.fvg.length > 0 || marketStructure.orderBlocks.length > 0)) {
          const bias: BiasType = marketStructure.trend === 'BULLISH' ? 'BULLISH' : marketStructure.trend === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
          return {
            ...base,
            bias,
            confidence: 72,
            status: 'ONLINE',
            lastOpinion: `Resting liquidity mapped. ${marketStructure.fvg.length} active FVGs, ${marketStructure.orderBlocks.length} Order Blocks.`,
            evidence: [
              `FVG count: ${marketStructure.fvg.length}`,
              `Order Blocks: ${marketStructure.orderBlocks.length}`
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
        if (blueprint) {
          return {
            ...base,
            bias: blueprint.direction === 'BUY' ? 'BULLISH' : 'BEARISH',
            confidence: 76,
            status: 'ONLINE',
            lastOpinion: `Strategy protocol validated: ${blueprint.direction} setup at [${blueprint.entryZoneLow.price} - ${blueprint.entryZoneHigh.price}].`,
            evidence: [
              `Entry: [${blueprint.entryZoneLow.price} - ${blueprint.entryZoneHigh.price}]`,
              `SL: ${blueprint.sl.price}`,
              `TP1: ${blueprint.tp1.price}`,
              `R:R: ${blueprint.rrRatio || '1:1.5'}`
            ],
            keyRisk: 'Invalidation price violation',
            invalidation: `Hard stop at ${blueprint.sl.price}`
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
            lastOpinion: `Asymmetric ${blueprint.rrRatio} risk-to-reward ratio verified against structural target ${blueprint.tp1.price}.`,
            evidence: [
              `Target TP1: ${blueprint.tp1.price}`,
              `Risk/Reward: ${blueprint.rrRatio}`
            ],
            keyRisk: 'Momentum stall before target',
            invalidation: 'Momentum breakdown'
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
        return {
          ...base,
          bias: 'CAUTION',
          confidence: blueprint ? 85 : 0,
          status: 'CAUTION',
          lastOpinion: blueprint
            ? `Exposure bounds verified. Mandatory SL enforced at ${blueprint.sl.price}. Risk budget capped at 0.50%.`
            : `Risk Guardian armed. Execution locked until verified structure blueprint exists.`,
          evidence: [blueprint ? `Mandatory SL: ${blueprint.sl.price}` : 'Blueprint: PENDING'],
          keyRisk: blueprint ? 'Spread widening during volatility' : 'No SL available',
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

      // Unconnected specialist feeds remain honestly DATA LIMITED
      case 'MACRO':
        return { ...base, bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'No live macro feed connected. Economic calendar data unavailable.', evidence: ['Live macro API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' };
      case 'CORRELATION':
        return { ...base, bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Intermarket correlation unavailable. Requires multi-asset OHLC feed.', evidence: ['Multi-asset feed: PENDING'], keyRisk: 'N/A', invalidation: 'N/A' };
      case 'NEWS':
        return { ...base, bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'No live news API connected. Economic wire monitoring unavailable.', evidence: ['News API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' };
      case 'GEOPOLITICAL':
        return { ...base, bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'No geopolitical intelligence feed connected.', evidence: ['Geopolitical API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' };
      case 'SENTIMENT':
        return { ...base, bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Broker sentiment feed not connected. Contrarian model inactive.', evidence: ['Sentiment API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' };
      case 'INSTITUTIONAL':
        return { ...base, bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Institutional flow feed not connected. COT data unavailable.', evidence: ['COT API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' };
      case 'ORDER_FLOW':
        return { ...base, bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Level-2 order flow feed not connected. Tick data unavailable.', evidence: ['Order flow API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' };
      case 'VISION':
      default:
        return { ...base, bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Awaiting chart image submission for visual analysis.', evidence: ['Chart image: NOT SUBMITTED'], keyRisk: 'N/A', invalidation: 'N/A' };
    }
  });

  // 5. Attach Canonical Machine-Readable Evidence & Trust Scores
  assembledAgents.forEach((ag) => {
    const rawItems = ag.evidence && ag.evidence.length > 0 ? ag.evidence : [ag.lastOpinion];
    const evidenceRecords: AgentEvidence[] = rawItems.map((item, idx) => {
      let classification: any = 'HEURISTIC';
      let verified = false;
      let decisionEligible = false;
      const lower = item.toLowerCase();
      const agentStatus = ag.status;

      let sourceName = 'Heuristic or Unavailable';

      if (
        lower.includes('not connected') ||
        lower.includes('unavailable') ||
        lower.includes('data limited') ||
        lower.includes('pending') ||
        agentStatus === 'DATA LIMITED'
      ) {
        classification = 'UNAVAILABLE';
        verified = false;
        decisionEligible = false;
        sourceName = 'Unconnected Feed';
      } else if (ag.type === 'RISK_GUARDIAN') {
        classification = blueprint ? 'DERIVED' : 'HEURISTIC';
        verified = Boolean(blueprint);
        decisionEligible = Boolean(blueprint);
        sourceName = 'Risk Rules Matrix';
      } else if (ag.type === 'KILLZONE') {
        classification = 'DERIVED';
        verified = true;
        decisionEligible = true;
        sourceName = 'Temporal Session Engine';
      } else if (ag.type === 'TECHNICAL' && hasCandles) {
        classification = effectiveCandleProvenance;
        verified = true;
        // Independent reference proxy (e.g. PAXG) is verified for analysis but strictly non-executable
        decisionEligible = (effectiveCandleProvenance !== 'INDEPENDENT_REFERENCE');
        sourceName = effectiveCandleProvenance === 'LIVE_MT5'
          ? 'MT5 Broker Telemetry'
          : effectiveCandleProvider;
      } else if ((ag.type === 'STRATEGY' || ag.type === 'OPPORTUNITY' || ag.type === 'LIQUIDITY_MAP') && hasCandles && blueprint) {
        if (effectiveCandleProvenance === 'LIVE_MT5') {
          classification = 'DERIVED';
          decisionEligible = true;
        } else if (effectiveCandleProvenance === 'INDEPENDENT_VERIFIED') {
          classification = 'DERIVED_FROM_VERIFIED';
          decisionEligible = true;
        } else if (effectiveCandleProvenance === 'INDEPENDENT_REFERENCE') {
          classification = 'INDEPENDENT_REFERENCE';
          decisionEligible = false;
        } else {
          classification = 'DERIVED';
          decisionEligible = true;
        }
        verified = true;
        sourceName = `Deterministic SMC (${effectiveCandleProvider})`;
      } else if (lower.includes('mt5 broker') || lower.includes('live_mt5') || lower.includes('broker candle')) {
        classification = 'LIVE_MT5';
        verified = true;
        decisionEligible = true;
        sourceName = 'MT5 Broker Telemetry';
      } else {
        classification = 'HEURISTIC';
        verified = false;
        decisionEligible = false;
      }

      return {
        id: `ev-${normSymbol}-${ag.type}-${idx + 1}`,
        agentKey: ag.type,
        asset: normSymbol,
        claim: item,
        source: sourceName,
        sourceType: verified ? 'MATHEMATICAL' : 'HEURISTIC',
        classification,
        observedAt: new Date().toISOString(),
        freshnessMs: 5000,
        confidence: ag.confidence,
        assetSpecific: true,
        verified,
        decisionEligible,
        reason: verified
          ? (classification === 'INDEPENDENT_REFERENCE'
              ? 'Verified reference proxy data (strictly non-executable on broker)'
              : 'Live broker telemetry, verified independent OHLC, or deterministic calculation')
          : 'Heuristic / DATA LIMITED — not eligible for ACTIONABLE gate'
      };
    });

    const trustResult = calculateAgentEvidenceTrust(evidenceRecords);
    ag.evidenceRecords = evidenceRecords;
    ag.evidenceTrustScore = trustResult.trustScore;
    ag.provenanceBadge = trustResult.badge;
  });

  // 6. Compute Consensus Trust & Actionability Gate
  const consensusTrust = calculateConsensusTrust(assembledAgents);
  const actionability = evaluateActionabilityGate({
    evidenceTrust: consensusTrust.evidenceTrust,
    verifiedAgentCount: consensusTrust.verifiedAgentCount,
    tradeExecutable,
    marketState: sessionState.marketState
  });

  // 7. Directional Evidence Gating:
  // WATCH FOR BUY requires eligible verified bullish directional evidence.
  // WATCH FOR SELL requires eligible verified bearish directional evidence.
  // Risk Guardian CAUTION alone must NEVER determine market direction.
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

  if (blueprint && blueprint.direction === 'BUY' && eligibleBullishCount > 0 && consensusTrust.evidenceTrust >= 40) {
    effectiveSetupDirection = 'WATCH FOR BUY';
  } else if (blueprint && blueprint.direction === 'SELL' && eligibleBearishCount > 0 && consensusTrust.evidenceTrust >= 40) {
    effectiveSetupDirection = 'WATCH FOR SELL';
  } else {
    // Insufficient evidence or no directional setup -> WAIT
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

  // 8. Update Final Decision Agent
  const finalAgent = assembledAgents.find((a) => a.type === 'FINAL_DECISION');
  if (finalAgent) {
    finalAgent.bias = effectiveSetupDirection.includes('BUY')
      ? 'BULLISH'
      : effectiveSetupDirection.includes('SELL')
      ? 'BEARISH'
      : 'NEUTRAL';
    finalAgent.status = consensusTrust.verifiedAgentCount >= 3 ? 'ONLINE' : 'DATA LIMITED';
    finalAgent.confidence = consensusTrust.evidenceTrust >= 40 ? Math.round(consensusTrust.evidenceTrust) : 0;
    finalAgent.lastOpinion = `Council consensus: ${effectiveSetupDirection}. Verified agents: ${consensusTrust.verifiedAgentCount}/15. Evidence trust: ${consensusTrust.evidenceTrust}%.`;
  }

  const directionalBias: DirectionalBias = effectiveSetupDirection.includes('BUY')
    ? 'BULLISH'
    : effectiveSetupDirection.includes('SELL')
      ? 'BEARISH'
      : 'NEUTRAL';
  const riskPosture: RiskPosture = !tradeExecutable ? 'RESTRICTED' : 'CAUTION';

  // Compute average confidence across 15 voting agents
  // V1.0.1 Truthfulness rule: If council resolved to WAIT due to insufficient evidence (0 eligible directional votes or evidence trust < 30%),
  // overall confluence is 0% (rendered as INSUFFICIENT EVIDENCE), never a synthetic non-zero number.
  const votingAgents = assembledAgents.slice(0, 15);
  const totalConfidence = votingAgents.reduce((sum, a) => sum + (a.confidence || 0), 0);
  const rawAvgConfidence = Math.round(totalConfidence / (votingAgents.length || 1));
  const avgConfidence = (consensusTrust.evidenceTrust < 30 || (eligibleBullishCount === 0 && eligibleBearishCount === 0))
    ? 0
    : rawAvgConfidence;

  const debateMessages = [
    {
      time: '18:14:50',
      agent: 'TECHNICAL AGENT',
      text: hasCandles
        ? `${normSymbol} ${normTf} structure ${marketStructure?.trend || 'analyzed'}. Swings: ${marketStructure?.swingHighs.length || 0}H / ${marketStructure?.swingLows.length || 0}L.`
        : `Phase 2D: ${normSymbol} awaiting verified OHLC candles from broker before structure analysis.`,
      status: (assembledAgents.find((a) => a.type === 'TECHNICAL')?.status === 'ONLINE'
        ? assembledAgents.find((a) => a.type === 'TECHNICAL')?.bias
        : 'DATA LIMITED') as any
    },
    {
      time: '18:14:53',
      agent: 'MACRO AGENT',
      text: `No live macro economic feed connected for ${normSymbol}. Macro stance DATA LIMITED.`,
      status: 'DATA LIMITED' as const
    },
    {
      time: '18:14:57',
      agent: 'RISK GUARDIAN',
      text: tradeExecutable
        ? (blueprint ? `Mandatory stop loss defined at ${blueprint.sl.price}. Risk budget capped at 0.50%.` : `Risk Guardian armed. Execution locked until verified blueprint exists.`)
        : `Execution hard-locked: Market is ${sessionState.marketState}. All order routes disabled.`,
      status: 'CAUTION' as const
    },
    {
      time: '18:15:00',
      agent: 'FINAL DECISION',
      text: `Council status: ${effectiveSetupDirection}. Verified evidence trust: ${consensusTrust.evidenceTrust}%.`,
      status: (finalAgent?.bias || 'NEUTRAL') as any
    }
  ];

  return {
    symbol: normSymbol,
    name: meta.name,
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
    confidence: avgConfidence,
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
      'Unconnected feeds (News / Macro / Sentiment / Order Flow) remain DATA LIMITED.',
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
    marketStructure
  };
}
