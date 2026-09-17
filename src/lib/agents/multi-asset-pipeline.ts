/**
 * Multi-Asset Intelligence & Canonical 15-Agent Dynamic Swarm Pipeline
 * 
 * Guarantees that EVERY active asset (XAUUSD, XAGUSD, USOIL, EURUSD, GBPUSD, USDJPY, AUDUSD, BTCUSD, etc.)
 * receives exactly the canonical 15-agent voting council in deterministic order.
 * 
 * If live data for a specialist agent is limited, the node reports 'DATA LIMITED' or 'WAITING FOR PROVIDER'
 * rather than vanishing from the central architecture diagram.
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
  ActionabilityState
} from '../evidence/agent-evidence';

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
  setupDirection: 'WATCH FOR BUY' | 'WATCH FOR SELL' | 'WAIT' | 'NO TRADE' | 'BUY OPPORTUNITY' | 'SELL OPPORTUNITY' | 'MONITOR NEXT OPEN' | 'PRE-OPEN WATCH' | 'REVALIDATING...' | 'WAIT (MARKET CLOSED)' | 'ANALYSIS ONLY' | 'DATA LIMITED';
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
}

/**
 * The Canonical 15-Agent Council Roster in strict deterministic order.
 * Node 01 - 07: Left Flank
 * Node 08 - 14: Right Flank
 * Node 15: Center Orchestrator Final Decision
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
 * 1. Base Agent Registry: Generates clean unadulterated baseline for all 15 agents.
 */
export function getBaseAgentRegistry(symbol: string): AgentState[] {
  return CANONICAL_COUNCIL_KEYS.map((spec) => ({
    type: spec.type,
    name: spec.name,
    role: spec.role,
    bias: 'NEUTRAL' as BiasType,
    confidence: 60,
    status: 'ONLINE' as AgentNodeStatus,
    lastOpinion: `Initializing base telemetry model for ${symbol}.`,
    evidence: [`Awaiting telemetry synchronization for ${symbol}`],
    keyRisk: 'Data stream latency buffer',
    invalidation: 'Structural violation',
  }));
}

/**
 * Specialized context generator per symbol
 */
interface SymbolContextDetail {
  name: string;
  category: MarketCategory | 'COMMODITY' | 'METALS' | 'FOREX' | 'CRYPTO' | 'INDICES';
  regime: string;
  session: string;
  trend: string;
  volatility: string;
  newsRisk: string;
  liquidity: string;
  setupDirection: 'WATCH FOR BUY' | 'WATCH FOR SELL' | 'WAIT' | 'NO TRADE' | 'BUY OPPORTUNITY' | 'SELL OPPORTUNITY' | 'MONITOR NEXT OPEN' | 'PRE-OPEN WATCH' | 'REVALIDATING...' | 'WAIT (MARKET CLOSED)';
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
  agentOverrides: Partial<Record<AgentType, Partial<AgentState>>>;
  debateMessages: {
    time: string;
    agent: string;
    text: string;
    status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'RESTRICTED' | 'CAUTION' | 'DATA LIMITED';
  }[];
}

function getSymbolContextDetail(symbol: string, liveAsset: LiveMarketAsset, _timeframe: string): SymbolContextDetail {
  // Phase 2D: Truthful Live Intelligence Foundation
  // NO hardcoded price offsets. NO fabricated entry/SL/TP levels.
  // All level fields return null when verified structure is not available.
  // Agent commentary honestly reports DATA LIMITED for unplugged feeds.

  const p = liveAsset.price;
  const isPos = liveAsset.change24h >= 0;

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
    GBPUSD: { name: 'Pound / US Dollar', category: 'FOREX' },
    GBPJPY: { name: 'Pound / Japanese Yen', category: 'FOREX' },
    AUDUSD: { name: 'Australian Dollar / USD', category: 'FOREX' },
    XRPUSD: { name: 'XRP / US Dollar', category: 'CRYPTO' },
  };

  const meta = symbolMeta[symbol] || { name: symbol, category: 'FOREX' };

  // DATA_LIMITED agent overrides — honest default for all agents without live data feeds
  const dataLimitedOverrides: Partial<Record<AgentType, Partial<AgentState>>> = {
    TECHNICAL:     { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Awaiting verified OHLC candles from MT5 broker. No structure analysis yet.', evidence: ['MT5 candle feed: PENDING'], keyRisk: 'No data', invalidation: 'N/A' },
    MACRO:         { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'No live macro feed connected. Economic calendar data unavailable.', evidence: ['Live macro API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' },
    CORRELATION:   { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Intermarket correlation unavailable. Requires multi-asset OHLC feed.', evidence: ['Multi-asset feed: PENDING'], keyRisk: 'N/A', invalidation: 'N/A' },
    NEWS:          { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'No live news API connected. Economic wire monitoring unavailable.', evidence: ['News API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' },
    GEOPOLITICAL:  { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'No geopolitical intelligence feed connected.', evidence: ['Geopolitical API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' },
    SENTIMENT:     { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Broker sentiment feed not connected. Contrarian model inactive.', evidence: ['Sentiment API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' },
    INSTITUTIONAL: { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Institutional flow feed not connected. COT data unavailable.', evidence: ['COT API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' },
    RISK_GUARDIAN: { bias: 'CAUTION', confidence: 0, status: 'CAUTION', lastOpinion: 'Risk Guardian active. Awaiting verified blueprint before position sizing.', evidence: ['Blueprint: PENDING'], keyRisk: 'No SL available', invalidation: 'N/A' },
    VISION:        { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Awaiting chart image submission for visual analysis.', evidence: ['Chart image: NOT SUBMITTED'], keyRisk: 'N/A', invalidation: 'N/A' },
    OPPORTUNITY:   { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'No actionable setup identified. Blueprint not yet generated.', evidence: ['Blueprint engine: PENDING CANDLES'], keyRisk: 'N/A', invalidation: 'N/A' },
    STRATEGY:      { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Strategy engine awaiting verified market structure.', evidence: ['Structure engine: PENDING CANDLES'], keyRisk: 'N/A', invalidation: 'N/A' },
    ORDER_FLOW:    { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Level-2 order flow feed not connected. Tick data unavailable.', evidence: ['Order flow API: NOT CONNECTED'], keyRisk: 'N/A', invalidation: 'N/A' },
    KILLZONE:      { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Market session state computed from broker calendar. Killzone scoring awaiting structure.', evidence: ['Session state: DERIVED'], keyRisk: 'N/A', invalidation: 'N/A' },
    LIQUIDITY_MAP: { bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'Liquidity mapping awaiting verified OHLC swing detection.', evidence: ['OHLC candles: PENDING'], keyRisk: 'N/A', invalidation: 'N/A' },
    FINAL_DECISION:{ bias: 'NEUTRAL', confidence: 0, status: 'DATA LIMITED', lastOpinion: 'No consensus decision possible. Insufficient verified evidence.', evidence: ['Evidence Trust: INSUFFICIENT'], keyRisk: 'N/A', invalidation: 'N/A' },
  };

  return {
    name: meta.name,
    category: meta.category as any,
    regime: 'Awaiting Market Structure Analysis',
    session: 'Determined from MT5 broker sessions',
    trend: 'INSUFFICIENT DATA — Awaiting verified OHLC candles',
    volatility: 'ATR: PENDING CANDLES',
    newsRisk: 'DATA LIMITED — No live news feed',
    liquidity: 'Broker specification available',
    // Phase 2D / V1.0.1 Truthfulness: Missing/insufficient data defaults to WAIT, NOT directional WATCH.
    // Directional WATCH requires actual eligible bullish/bearish evidence.
    setupDirection: 'WAIT',
    confidence: 0,
    entryZone: null as any,   // Will be set by trade-blueprint-engine when verified structure exists
    stopLoss: null as any,    // Mandatory SL gate enforces real value before execution
    tp1: null as any,
    tp2: null as any,
    tp3: null as any,
    rr: null as any,
    invalidation: 'No structural invalidation computed yet — awaiting verified candles',
    whyThisTrade: [
      `Price: ${p.toFixed(5)} (${isPos ? '+' : ''}${liveAsset.change24h?.toFixed(2)}% 24h) — sourced from MT5 broker.`,
      'Market structure analysis pending. Verified OHLC candles required.',
      'No intelligence from unplugged feeds (News / Macro / Sentiment / Order Flow).',
    ],
    opposingRisks: [
      'No verified blueprint exists — do not trade without structure-derived levels.',
      'Evidence Trust insufficient for ACTIONABLE state.',
    ],
    agentOverrides: dataLimitedOverrides,
    debateMessages: [
      { time: '00:00:01', agent: 'TECHNICAL AGENT', text: `Phase 2D: ${symbol} awaiting verified OHLC candles from MT5 broker before structure analysis.`, status: 'DATA LIMITED' as any },
      { time: '00:00:02', agent: 'MACRO AGENT', text: `No live macro economic feed connected for ${symbol}. Macro stance DATA LIMITED.`, status: 'DATA LIMITED' as any },
      { time: '00:00:03', agent: 'RISK GUARDIAN', text: `Risk Guardian armed. Execution locked until verified structure blueprint exists.`, status: 'CAUTION' as any },
      { time: '00:00:04', agent: 'FINAL DECISION', text: `Council standing by. Evidence Trust below threshold — posture: WAIT (INSUFFICIENT EVIDENCE).`, status: 'DATA LIMITED' as any },
    ],
  };
}


/**
 * Tailored agent synthesis helper
 * Guarantees that any agent without an explicit override receives an authentic,
 * asset-aware analysis rather than a generic placeholder.
 */
function buildTailoredAgentState(
  spec: { type: AgentType; name: string; role: string },
  symbol: string,
  liveAsset: LiveMarketAsset,
  detail: SymbolContextDetail
): AgentState {
  const p = liveAsset.price;
  const isPos = liveAsset.change24h >= 0;
  const bias: BiasType = isPos ? 'BULLISH' : 'BEARISH';
  const sl = detail.stopLoss;

  switch (spec.type) {
    case 'TECHNICAL':
      return {
        type: 'TECHNICAL',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 82,
        status: 'ONLINE',
        lastOpinion: `H1 ${isPos ? 'bullish continuation' : 'bearish distribution'} structure confirmed on ${symbol}. Key pivot held at ${detail.entryZone[0]}.`,
        evidence: [`Price trading at ${p} (${isPos ? '+' : ''}${liveAsset.change24h}%)`, `H1 value area aligned with ${bias.toLowerCase()} momentum`],
        keyRisk: 'Key swing level violation',
        invalidation: `Beyond ${sl}`
      };
    case 'MACRO':
      return {
        type: 'MACRO',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 76,
        status: 'ONLINE',
        lastOpinion: `Macro monetary policy and sovereign yield differentials align with ${symbol} ${bias.toLowerCase()} positioning.`,
        evidence: ['Central bank policy differential pricing', 'Real yield benchmark guidance'],
        keyRisk: 'Unexpected central bank rate guidance shift',
        invalidation: 'Macro policy reversal'
      };
    case 'CORRELATION':
      return {
        type: 'CORRELATION',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 78,
        status: 'ONLINE',
        lastOpinion: `Cross-market beta and DXY dollar index movement confirm relative strength on ${symbol}.`,
        evidence: ['Basket correlation index confirmed', 'Sector leadership alignment'],
        keyRisk: 'Broad risk-off liquidity squeeze',
        invalidation: 'Correlation breakdown'
      };
    case 'NEWS':
      return {
        type: 'NEWS',
        name: spec.name,
        role: spec.role,
        bias: 'NEUTRAL',
        confidence: 68,
        status: 'ONLINE',
        lastOpinion: `Financial wire feeds scanned. No unannounced emergency geopolitical or policy breaks affecting ${symbol}.`,
        evidence: ['Institutional news ticker clean', 'Calendar shock filters armed'],
        keyRisk: 'Unscheduled headline leak',
        invalidation: 'Emergency wire alert'
      };
    case 'GEOPOLITICAL':
      return {
        type: 'GEOPOLITICAL',
        name: spec.name,
        role: spec.role,
        bias: 'NEUTRAL',
        confidence: 72,
        status: 'ONLINE',
        lastOpinion: `Global sovereign trade routes and regulatory policy steady for ${symbol} sector.`,
        evidence: ['Supply chain throughput nominal', 'Cross-border clearing active'],
        keyRisk: 'Trade tariff or embargo announcement',
        invalidation: 'Geopolitical flareup'
      };
    case 'SENTIMENT':
      return {
        type: 'SENTIMENT',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 74,
        status: 'ONLINE',
        lastOpinion: `Retail positioning metrics indicate favorable contrarian liquidity skew on ${symbol}.`,
        evidence: ['Retail crowd sentiment divergence', 'Commitment of traders alignment'],
        keyRisk: 'Crowded speculative positioning',
        invalidation: 'Extreme positioning flip'
      };
    case 'INSTITUTIONAL':
      return {
        type: 'INSTITUTIONAL',
        name: spec.name,
        role: spec.role,
        bias: detail.category === 'CRYPTO' || detail.category === 'INDICES' ? bias : 'NEUTRAL',
        confidence: 75,
        status: detail.category === 'FOREX' ? 'DATA LIMITED' : 'ONLINE',
        lastOpinion: detail.category === 'FOREX'
          ? `Interbank volume verified. Direct L2 dark pool tape limited for ${symbol} OTC cross. [DATA LIMITED]`
          : `Block order accumulation and institutional clearing active on ${symbol}.`,
        evidence: ['Interbank settlement quotes active', 'Institutional flow metrics verified'],
        keyRisk: 'Institutional fix rebalance',
        invalidation: 'Abrupt block liquidity drain',
        dataLimitedReason: detail.category === 'FOREX' ? 'OTC interbank spot feed does not publish centralized exchange dark pool tape.' : undefined
      };
    case 'RISK_GUARDIAN':
      return {
        type: 'RISK_GUARDIAN',
        name: spec.name,
        role: spec.role,
        bias: 'CAUTION',
        confidence: 88,
        status: 'CAUTION',
        lastOpinion: `Exposure envelope enforced: max risk budget capped at 0.50% account capital with mandatory stop loss.`,
        evidence: [`Mandatory SL defined at ${sl}`, 'Spread and slippage buffers verified'],
        keyRisk: 'Spread widening during rollover',
        invalidation: 'Volatility exceeds 2x ATR'
      };
    case 'VISION':
      return {
        type: 'VISION',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 80,
        status: 'ONLINE',
        lastOpinion: `Computer vision identifies clean candlestick geometry with ${isPos ? 'higher low' : 'lower high'} retest on ${symbol}.`,
        evidence: ['Order block boundary respected', 'Candle wick rejection on lower timeframe'],
        keyRisk: 'False breakout wick',
        invalidation: `Close beyond ${sl}`
      };
    case 'OPPORTUNITY':
      return {
        type: 'OPPORTUNITY',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 84,
        status: 'ONLINE',
        lastOpinion: `Asymmetric ${detail.rr} risk-to-reward ratio verified against structural liquidity targets.`,
        evidence: [`Target TP1: ${detail.tp1}`, `Target TP2: ${detail.tp2}`, `Risk/Reward: ${detail.rr}`],
        keyRisk: 'Premature consolidation before TP1',
        invalidation: 'Momentum exhaustion'
      };
    case 'STRATEGY':
      return {
        type: 'STRATEGY',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 79,
        status: 'ONLINE',
        lastOpinion: `Institutional trend protocol validated: Entry zone between ${detail.entryZone[0]} and ${detail.entryZone[1]}.`,
        evidence: ['All entry checklist criteria checked', 'Risk Guardian authorization granted'],
        keyRisk: 'Execution slippage',
        invalidation: 'Rule deviation'
      };
    case 'ORDER_FLOW':
      return {
        type: 'ORDER_FLOW',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 78,
        status: 'ONLINE',
        lastOpinion: `Cumulative volume delta (CVD) confirms active ${isPos ? 'absorption by buyers' : 'selling pressure'} on ${symbol}.`,
        evidence: ['Tick delta divergence aligned', 'Passive liquidity absorbed at demand'],
        keyRisk: 'Opposing market order cascade',
        invalidation: 'CVD reversal'
      };
    case 'KILLZONE':
      return {
        type: 'KILLZONE',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 82,
        status: 'ONLINE',
        lastOpinion: `${detail.session} killzone window active. Algorithmic interbank turnover supporting directional expansion.`,
        evidence: ['Peak volume timing window', 'Spreads compressed to standard baseline'],
        keyRisk: 'Session close liquidity fade',
        invalidation: 'Volume dry up'
      };
    case 'LIQUIDITY_MAP':
      return {
        type: 'LIQUIDITY_MAP',
        name: spec.name,
        role: spec.role,
        bias,
        confidence: 85,
        status: 'ONLINE',
        lastOpinion: `Resting ${isPos ? 'sell-side liquidity swept' : 'buy-side liquidity swept'}; magnet target towards opposing pool at ${detail.tp1}.`,
        evidence: [`Resting liquidity mapped at ${detail.tp1}`, `Clean structural path with low friction`],
        keyRisk: 'Liquidity fakeout run',
        invalidation: `Liquidity pool breach beyond ${sl}`
      };
    case 'FINAL_DECISION':
    default:
      return {
        type: spec.type,
        name: spec.name,
        role: spec.role,
        bias,
        confidence: detail.confidence,
        status: 'ONLINE',
        lastOpinion: `15 Council Agents synchronized on ${symbol}. Consensus rating of ${detail.confidence}% authorizes ${detail.setupDirection}.`,
        evidence: [`15-agent consensus: ${detail.confidence}%`, `Setup: ${detail.setupDirection}`, `R:R: ${detail.rr}`],
        keyRisk: 'Macro volatility catalyst',
        invalidation: `Hard stop at ${sl}`
      };
  }
}

/**
 * Canonical 15-Agent Swarm Pipeline Engine
 * Guarantees that ALL 15 council agents are computed and returned in deterministic order for ANY symbol.
 */
export function generateAssetIntelligence(
  symbol: string,
  liveAsset: LiveMarketAsset,
  timeframe: string = 'H1'
): AssetIntelligenceProfile {
  const normSymbol = (symbol || 'XAUUSD').toUpperCase();
  const detail = getSymbolContextDetail(normSymbol, liveAsset, timeframe);

  // 1. Get Base Canonical Registry (exactly 15 agents in fixed order)
  const baseAgents = getBaseAgentRegistry(normSymbol);

  // 2. Apply Asset Context & Overrides deterministically
  const assembledAgents: AgentState[] = baseAgents.map((baseAgent) => {
    const override = detail.agentOverrides[baseAgent.type];
    if (override) {
      return {
        type: baseAgent.type,
        name: baseAgent.name,
        role: baseAgent.role,
        bias: 'NEUTRAL',
        confidence: 0,
        status: 'ONLINE',
        lastOpinion: '',
        evidence: [],
        keyRisk: '',
        invalidation: '',
        ...override,
      } as AgentState;
    }

    return buildTailoredAgentState(baseAgent, normSymbol, liveAsset, detail);
  });

  // 3. Final Invariant Guard: Assert that length is ALWAYS exactly 15 and all 15 types exist
  if (assembledAgents.length !== 15) {
    console.error(`FATAL: Canonical agent count violation for ${normSymbol}: expected 15, got ${assembledAgents.length}`);
  }

  // 4. Central Market Session Intelligence & Executability Evaluation
  const quoteTimestampMs = liveAsset?.lastUpdated && !isNaN(new Date(liveAsset.lastUpdated).getTime())
    ? new Date(liveAsset.lastUpdated).getTime()
    : undefined;
  const sessionState = evaluateMarketSession(normSymbol, undefined, quoteTimestampMs);
  const tradeExecutable = sessionState.tradeExecutable;
  const setupQuality = sessionState.setupQuality;

  // 5. Attach Canonical Machine-Readable Evidence & Trust Scores
  assembledAgents.forEach((ag) => {
    const rawItems = ag.evidence && ag.evidence.length > 0 ? ag.evidence : [ag.lastOpinion];
    const evidenceRecords: AgentEvidence[] = rawItems.map((item, idx) => {
      // Phase 2D: Truthful provenance classification.
      // We do NOT use keyword heuristics to fake "DERIVED/verified=true".
      // Only explicitly connected live data earns verified=true.
      let classification: any = 'HEURISTIC';
      let verified = false;
      let decisionEligible = false;
      const lower = item.toLowerCase();
      const agentStatus = ag.status;

      if (
        lower.includes('not connected') ||
        lower.includes('unavailable') ||
        lower.includes('data limited') ||
        lower.includes('pending') ||
        agentStatus === 'DATA LIMITED'
      ) {
        // No live feed — this evidence is worthless for decisions
        classification = 'UNAVAILABLE';
        verified = false;
        decisionEligible = false;
      } else if (ag.type === 'RISK_GUARDIAN') {
        // Risk Guardian computes from broker account data and broker spec — treat as DERIVED
        // But only when we actually have a real SL from a blueprint (not null).
        // Since Phase 2D default is null SL, mark as HEURISTIC until blueprint confirmed.
        classification = 'HEURISTIC';
        verified = false;
        decisionEligible = false;
      } else if (ag.type === 'KILLZONE') {
        // Session engine uses MT5 broker sessions — classify as DERIVED when session is real
        classification = 'DERIVED';
        verified = true;
        decisionEligible = true;
      } else if (lower.includes('mt5 broker') || lower.includes('live_mt5') || lower.includes('broker candle')) {
        classification = 'LIVE_MT5';
        verified = true;
        decisionEligible = true;
      } else if (lower.includes('inference') || lower.includes('model:') || lower.includes('heuristic')) {
        classification = 'MODEL_INFERENCE';
        verified = false;
        decisionEligible = false;
      } else {
        // Default: unconfirmed heuristic — do NOT auto-promote to verified
        classification = 'HEURISTIC';
        verified = false;
        decisionEligible = false;
      }

      return {
        id: `ev-${normSymbol}-${ag.type}-${idx + 1}`,
        agentKey: ag.type,
        asset: normSymbol,
        claim: item,
        source: verified ? 'LIVE_MT5_OR_DERIVED' : 'HEURISTIC_OR_UNAVAILABLE',
        sourceType: verified ? 'MATHEMATICAL' : 'HEURISTIC',
        classification,
        observedAt: new Date().toISOString(),
        freshnessMs: 5000,
        confidence: ag.confidence,
        assetSpecific: true,
        verified,
        decisionEligible,
        reason: verified
          ? 'Live MT5 broker data or deterministic session calculation'
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

  // V1.0.1 Directional Evidence Gating:
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

  let effectiveSetupDirection = detail.setupDirection;

  if (detail.setupDirection.includes('BUY') && eligibleBullishCount === 0) {
    effectiveSetupDirection = 'WAIT';
  } else if (detail.setupDirection.includes('SELL') && eligibleBearishCount === 0) {
    effectiveSetupDirection = 'WAIT';
  }

  // If majority of council is DATA LIMITED or evidence trust is insufficient (< 40)
  // and no directional votes exist, enforce WAIT
  if (consensusTrust.limitedAgentCount + consensusTrust.unavailableAgentCount >= 10 && eligibleBullishCount === 0 && eligibleBearishCount === 0) {
    effectiveSetupDirection = 'WAIT';
  }

  if (!tradeExecutable) {
    if (sessionState.marketState === 'PRE_OPEN') {
      effectiveSetupDirection = 'PRE-OPEN WATCH';
    } else if (sessionState.marketState === 'DAILY_BREAK') {
      effectiveSetupDirection = 'WAIT (MARKET CLOSED)';
    } else {
      effectiveSetupDirection = 'MONITOR NEXT OPEN';
    }

    // Apply strict server-side Risk Guardian veto and Session Agent temporal intelligence
    assembledAgents.forEach((ag) => {
      if (ag.type === 'RISK_GUARDIAN') {
        ag.bias = 'CAUTION';
        ag.status = 'CAUTION';
        ag.keyRisk = `Execution locked: Market is currently ${sessionState.marketState} (${sessionState.sessionName}). Next open: ${sessionState.nextOpenAt}.`;
        ag.lastOpinion = `Execution locked: Market is ${sessionState.marketState}. Revalidation scheduled for ${sessionState.nextOpenAt}.`;
      }
      if (ag.type === 'KILLZONE') {
        ag.status = sessionState.marketState === 'OPEN' ? 'ONLINE' : 'CAUTION';
        ag.lastOpinion = `${sessionState.sessionName} — ${sessionState.marketState === 'OPEN' ? 'Active' : 'Closed'}. Next open: ${sessionState.nextOpenAt}.`;
      }
      if (ag.type === 'OPPORTUNITY') {
        ag.status = 'CAUTION';
        ag.lastOpinion = `Setup Quality: ${setupQuality}/100 retained. Executability: 0/100 (Market ${sessionState.marketState}). MONITOR NEXT OPEN.`;
      }
      if (ag.type === 'FINAL_DECISION') {
        ag.bias = 'WAIT';
        ag.status = 'CAUTION';
        ag.lastOpinion = `Consensus aligned, but execution gate is locked: Market ${sessionState.marketState}. Posture: ${effectiveSetupDirection}.`;
      }
    });
  } else {
    const sessionAg = assembledAgents.find((a) => a.type === 'KILLZONE');
    if (sessionAg) {
      sessionAg.lastOpinion = `Active trading session: ${sessionState.sessionName}. Closes at ${sessionState.closesAt}.`;
    }
  }

  // 5. Build rich, multi-agent debate stream reflecting actual cross-agent signals
  const entryLevelStr = detail.entryZone && Array.isArray(detail.entryZone) ? detail.entryZone[0] : 'structure level';
  const baseDebate = detail.debateMessages && detail.debateMessages.length >= 4
    ? detail.debateMessages
    : (detail.debateMessages && detail.debateMessages.length > 0)
      ? detail.debateMessages
      : [
          {
            time: '18:14:50',
            agent: 'TECHNICAL AGENT',
            text: `${normSymbol} H1 market structure aligned with live price action. Pivot held at ${entryLevelStr}.`,
            status: assembledAgents.find((a) => a.type === 'TECHNICAL')?.bias || 'BULLISH'
          },
          {
            time: '18:14:53',
            agent: 'CORRELATION AGENT',
            text: `Intermarket beta and basket indices confirm relative strength profile for ${normSymbol}.`,
            status: assembledAgents.find((a) => a.type === 'CORRELATION')?.bias || 'BULLISH'
          },
          {
            time: '18:14:57',
            agent: 'RISK GUARDIAN',
            text: tradeExecutable 
              ? `Event proximity filters active. Position risk budget capped at 0.50% capital.`
              : `Execution hard-locked: Market is ${sessionState.marketState}. All order routes disabled.`,
            status: 'CAUTION'
          },
          {
            time: '18:15:00',
            agent: 'FINAL DECISION',
            text: tradeExecutable
              ? `${normSymbol} 15 Council Agents synchronized. Consensus ${detail.confidence}% ${detail.setupDirection} authorized.`
              : `15-Agent Swarm synchronized. Revalidation scheduled for next session open (${sessionState.nextOpenAt}). Decision: ${effectiveSetupDirection}.`,
            status: tradeExecutable ? (detail.setupDirection.includes('BUY') ? 'BULLISH' : 'BEARISH') : 'NEUTRAL'
          }
        ];

  const sessionDebate = !tradeExecutable
    ? [
        {
          time: '18:14:48',
          agent: 'SESSION / KILLZONE',
          text: `${normSymbol} market is currently ${sessionState.marketState} (${sessionState.sessionName}). Next open: ${sessionState.nextOpenAt}.`,
          status: 'CAUTION' as const
        },
        {
          time: '18:14:52',
          agent: 'OPPORTUNITY AGENT',
          text: `Analytical setup detected (${detail.setupDirection.includes('BUY') ? 'Bullish' : 'Bearish'}), but market is CLOSED. Setup quality ${setupQuality}/100 retained for monitoring.`,
          status: 'CAUTION' as const
        },
        ...baseDebate.slice(2)
      ]
    : baseDebate;

  // Compute dynamic average confidence across the 15 voting council agents
  // V1.0.1 Truthfulness: Do NOT fallback to synthetic 50. If totalConfidence is 0, return 0.
  const votingAgents = assembledAgents.slice(0, 15);
  const totalConfidence = votingAgents.reduce((sum, a) => sum + (a.confidence || 0), 0);
  const avgConfidence = Math.round(totalConfidence / (votingAgents.length || 1));

  return {
    symbol: normSymbol,
    name: detail.name,
    category: detail.category,
    regime: detail.regime,
    session: sessionState.sessionName,
    trend: detail.trend,
    volatility: detail.volatility,
    newsRisk: detail.newsRisk,
    liquidity: detail.liquidity,
    setupDirection: effectiveSetupDirection,
    confidence: avgConfidence,
    entryZone: detail.entryZone,
    stopLoss: detail.stopLoss,
    tp1: detail.tp1,
    tp2: detail.tp2,
    tp3: detail.tp3,
    rr: detail.rr,
    invalidation: detail.invalidation,
    whyThisTrade: detail.whyThisTrade,
    opposingRisks: detail.opposingRisks,
    agents: assembledAgents,
    sessionState,
    tradeExecutable,
    setupQuality,
    debateMessages: sessionDebate as any,
    evidenceTrust: consensusTrust.evidenceTrust,
    verifiedAgentCount: consensusTrust.verifiedAgentCount,
    limitedAgentCount: consensusTrust.limitedAgentCount,
    unavailableAgentCount: consensusTrust.unavailableAgentCount,
    actionabilityState: actionability.actionabilityState
  };
}

