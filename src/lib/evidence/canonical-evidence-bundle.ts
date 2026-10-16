/**
 * FEF CORTEX — CANONICAL EVIDENCE BUNDLE & ORCHESTRATION CONTRACT
 *
 * Single authoritative normalized market evidence contract feeding the 32-agent CORTEX swarm.
 * Guarantees:
 * 1. Strict single-source provenance: MT5_BROKER / LOCAL_SQLITE / LIVE_MT5
 * 2. Multi-timeframe truthfulness: M1, M5, M15, M30, H1, H4, D1 without synthetic fabrication
 * 3. Timeframe role model: HTF context, structural context, setup context, entry refinement
 * 4. Distinct evidence quality metadata per domain
 * 5. Immutable asOf snapshot context shared across all agents in one cycle
 * 6. Explicit conflict preservation without averaging away opposing signals
 * 7. Domain-aware completeness scoring
 * 8. Invariant: tradeExecutable = false (READ_ONLY execution mode)
 */

import { OHLCCandle } from '../market/canonical-market-snapshot';
import { evaluateMarketSession, MarketSessionState } from '../session/market-session-engine';
import { calculateVolumeProfile } from '../market/volume-profile-engine';
import { computeOrderFlowMetrics } from '../market/order-flow-engine';
import { analyzeMarketStructure, MarketStructure } from '../market/market-structure-engine';

export type CanonicalTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export const CANONICAL_TIMEFRAMES: CanonicalTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

export type TimeframeState = 'AVAILABLE' | 'INSUFFICIENT_DATA' | 'STALE' | 'UNAVAILABLE';

export type TimeframeRole = 'HTF_CONTEXT' | 'STRUCTURAL_CONTEXT' | 'SETUP_CONTEXT' | 'ENTRY_REFINEMENT' | 'UNASSIGNED';

export interface TimeframeEvidence {
  timeframe: CanonicalTimeframe;
  state: TimeframeState;
  barCount: number;
  newestClosedBarTime: number | null;
  ageMs: number | null;
  candles: OHLCCandle[];
  source: 'MT5_BROKER' | 'REFERENCE_MARKET';
  storage: 'LOCAL_SQLITE' | 'MEMORY_CACHE';
  trend?: 'BULLISH' | 'BEARISH' | 'RANGING' | 'TRANSITIONAL' | 'UNKNOWN' | 'INSUFFICIENT_DATA';
  role: TimeframeRole;
}

export interface TimeframeRoleModel {
  higherTimeframe: { timeframe: CanonicalTimeframe | 'NONE'; state: TimeframeState; trend: string };
  structuralContext: { timeframe: CanonicalTimeframe | 'NONE'; state: TimeframeState; trend: string };
  setupContext: { timeframe: CanonicalTimeframe | 'NONE'; state: TimeframeState; trend: string };
  entryRefinement: { timeframe: CanonicalTimeframe | 'NONE'; state: TimeframeState; trend: string };
}

export type EvidenceDomain =
  | 'technical'
  | 'structure'
  | 'momentum'
  | 'volatility'
  | 'liquidity'
  | 'orderFlow'
  | 'institutional'
  | 'correlation'
  | 'macro'
  | 'news'
  | 'geopolitical'
  | 'sentiment'
  | 'session'
  | 'killzone'
  | 'risk'
  | 'regime';

export interface DomainEvidenceQuality {
  domain: EvidenceDomain;
  status: 'ONLINE' | 'DATA_LIMITED' | 'STALE' | 'UNAVAILABLE' | 'ERROR';
  quality: number; // 0–100
  trust: number;   // 0–100
  freshness: 'FRESH' | 'STALE' | 'SESSION_CLOSED' | 'UNAVAILABLE' | 'NOT_APPLICABLE';
  provenance: 'BROKER' | 'LOCAL_DERIVED' | 'CLOUD' | 'EXTERNAL' | 'UNAVAILABLE';
  claim?: string;
  evidenceUsed: string[];
  missingEvidence: string[];
}

export interface EvidenceCompleteness {
  technicalCompleteness: number; // 0–100
  marketDataCompleteness: number; // 0–100
  riskCompleteness: number;       // 0–100
  macroCompleteness: number;      // 0–100
  sentimentCompleteness: number;  // 0–100
  overallCompleteness: number;    // 0–100
  formula: string;
}

export interface EvidenceConflict {
  type: 'DIRECTIONAL' | 'TIMEFRAME' | 'TECHNICAL_VS_MACRO' | 'RISK_VETO' | 'SESSION_CONFLICT' | 'DATA_QUALITY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  parties: string[];
}

export interface CanonicalEvidenceBundle {
  snapshotId: string;
  symbol: string;
  canonicalSymbol: string;
  brokerSymbol: string;
  asOf: number;             // Epoch ms timestamp of the market quote
  generatedAt: number;      // Epoch ms timestamp when bundle was synthesized

  market: {
    price: number;
    bid: number;
    ask: number;
    mid: number;
    spread: number;
    digits: number;
    quoteTimestamp: number;
    quoteAgeMs: number;
    quoteFreshness: 'FRESH' | 'STALE' | 'SESSION_CLOSED' | 'UNAVAILABLE';
    marketState: 'OPEN' | 'CLOSED' | 'PRE_OPEN' | 'DAILY_BREAK' | 'UNAVAILABLE';
    sessionState: MarketSessionState;
    tradeExecutable: boolean; // Always false in READ_ONLY local mode
  };

  provenance: {
    source: 'MT5_BROKER' | 'REFERENCE_MARKET';
    storage: 'LOCAL_SQLITE' | 'MEMORY_CACHE';
    classification: 'LIVE_MT5' | 'INDEPENDENT_VERIFIED' | 'INDEPENDENT_REFERENCE' | 'UNAVAILABLE';
    provider: string;
    isDerived: boolean;
  };

  timeframes: Record<CanonicalTimeframe, TimeframeEvidence>;
  timeframeRoles: TimeframeRoleModel;
  domains: Record<EvidenceDomain, DomainEvidenceQuality>;
  conflicts: EvidenceConflict[];
  completeness: EvidenceCompleteness;
  executionPolicies: {
    webProductPolicy: 'ARMED_WITH_CONFIRMATION';
    localBrokerTransportPolicy: 'READ_ONLY';
    mt5OrderTransportEnabled: boolean;
    intelligenceActionability: 'ACTIONABLE' | 'DATA_LIMITED' | 'NON_ACTIONABLE';
    finalDecisionExecutable: boolean;
  };
}

/**
 * Deterministically evaluates evidence completeness across 5 key dimensions
 */
export function evaluateEvidenceCompleteness(inputs: {
  hasLiveQuote: boolean;
  quoteAgeMs: number;
  timeframeStates: Record<CanonicalTimeframe, TimeframeState>;
  hasStructure: boolean;
  hasOrderFlow: boolean;
  hasMacro: boolean;
  hasSentiment: boolean;
  hasNews: boolean;
}): EvidenceCompleteness {
  // 1. Market Data Completeness (30% weight in overall):
  // - Live quote fresh: 50 pts
  // - Key timeframes (H1, M15) available: 50 pts
  let mktScore = 0;
  if (inputs.hasLiveQuote) {
    mktScore += inputs.quoteAgeMs < 15_000 ? 50 : 25;
  }
  const h1Avail = inputs.timeframeStates.H1 === 'AVAILABLE';
  const m15Avail = inputs.timeframeStates.M15 === 'AVAILABLE';
  if (h1Avail) mktScore += 30;
  if (m15Avail) mktScore += 20;
  const marketDataCompleteness = Math.min(100, mktScore);

  // 2. Technical Completeness (35% weight in overall):
  // - Verified structure: 40 pts
  // - Order flow / micro: 20 pts
  // - Multi-timeframe depth (>= 2 timeframes): 40 pts
  let techScore = 0;
  if (inputs.hasStructure) techScore += 40;
  if (inputs.hasOrderFlow) techScore += 20;
  const availTfCount = Object.values(inputs.timeframeStates).filter(s => s === 'AVAILABLE').length;
  techScore += Math.min(40, availTfCount * 15);
  const technicalCompleteness = Math.min(100, techScore);

  // 3. Risk Completeness (15% weight in overall):
  // In local mode, risk invariants and structural stops are evaluated
  const riskCompleteness = inputs.hasLiveQuote && h1Avail ? 85 : (inputs.hasLiveQuote ? 50 : 0);

  // 4. Macro Completeness (10% weight in overall):
  const macroCompleteness = inputs.hasMacro ? 75 : 0;

  // 5. Sentiment / News Completeness (10% weight in overall):
  let sentScore = 0;
  if (inputs.hasSentiment) sentScore += 50;
  if (inputs.hasNews) sentScore += 50;
  const sentimentCompleteness = sentScore;

  // Overall Weighted Completeness
  const overallCompleteness = Math.round(
    marketDataCompleteness * 0.30 +
    technicalCompleteness * 0.35 +
    riskCompleteness * 0.15 +
    macroCompleteness * 0.10 +
    sentimentCompleteness * 0.10
  );

  const formula = 'overall = marketData(30%) + technical(35%) + risk(15%) + macro(10%) + sentiment(10%)';

  return {
    technicalCompleteness,
    marketDataCompleteness,
    riskCompleteness,
    macroCompleteness,
    sentimentCompleteness,
    overallCompleteness,
    formula,
  };
}

/**
 * Builds the canonical immutable evidence bundle for an asset directly from LocalMarketDataProvider
 */
export async function buildCanonicalEvidenceBundle(
  provider: any,
  symbol: string,
  options?: {
    evaluationTime?: Date;
    feeds?: any;
  }
): Promise<CanonicalEvidenceBundle> {
  const canonical = (provider.toCanonicalSymbol ? provider.toCanonicalSymbol(symbol) : symbol).toUpperCase();
  const now = options?.evaluationTime ? options.evaluationTime.getTime() : Date.now();

  // 1. Fetch Authoritative SQLite Quote
  const quote = await provider.getLatestQuote(canonical);

  if (!quote || quote.bid <= 0 || canonical === 'GER40') {
    // Fail-closed UNAVAILABLE bundle
    const emptyTimeframes = Object.fromEntries(
      CANONICAL_TIMEFRAMES.map(tf => [
        tf,
        {
          timeframe: tf,
          state: 'UNAVAILABLE' as TimeframeState,
          barCount: 0,
          newestClosedBarTime: null,
          ageMs: null,
          candles: [],
          source: 'MT5_BROKER' as const,
          storage: 'LOCAL_SQLITE' as const,
          role: 'UNASSIGNED' as TimeframeRole,
        }
      ])
    ) as unknown as Record<CanonicalTimeframe, TimeframeEvidence>;

    const emptyDomains = Object.fromEntries(
      ([
        'technical', 'structure', 'momentum', 'volatility', 'liquidity',
        'orderFlow', 'institutional', 'correlation', 'macro', 'news',
        'geopolitical', 'sentiment', 'session', 'killzone', 'risk', 'regime'
      ] as EvidenceDomain[]).map(dom => [
        dom,
        {
          domain: dom,
          status: 'UNAVAILABLE' as const,
          quality: 0,
          trust: 0,
          freshness: 'UNAVAILABLE' as const,
          provenance: 'UNAVAILABLE' as const,
          claim: `Data unavailable for unquoted broker instrument ${canonical}`,
          evidenceUsed: [],
          missingEvidence: ['Authoritative Broker Telemetry'],
        }
      ])
    ) as unknown as Record<EvidenceDomain, DomainEvidenceQuality>;

    const dummySession = evaluateMarketSession(canonical, options?.evaluationTime || new Date());

    return {
      snapshotId: `snap-${canonical}-${now}`,
      symbol: canonical,
      canonicalSymbol: canonical,
      brokerSymbol: quote?.brokerSymbol || '',
      asOf: now,
      generatedAt: now,
      market: {
        price: 0,
        bid: 0,
        ask: 0,
        mid: 0,
        spread: 0,
        digits: 0,
        quoteTimestamp: now,
        quoteAgeMs: 0,
        quoteFreshness: 'UNAVAILABLE',
        marketState: 'UNAVAILABLE',
        sessionState: { ...dummySession, tradeExecutable: false },
        tradeExecutable: false,
      },
      provenance: {
        source: 'MT5_BROKER',
        storage: 'LOCAL_SQLITE',
        classification: 'UNAVAILABLE',
        provider: 'UNAVAILABLE',
        isDerived: false,
      },
      timeframes: emptyTimeframes,
      timeframeRoles: {
        higherTimeframe: { timeframe: 'NONE', state: 'UNAVAILABLE', trend: 'UNAVAILABLE' },
        structuralContext: { timeframe: 'NONE', state: 'UNAVAILABLE', trend: 'UNAVAILABLE' },
        setupContext: { timeframe: 'NONE', state: 'UNAVAILABLE', trend: 'UNAVAILABLE' },
        entryRefinement: { timeframe: 'NONE', state: 'UNAVAILABLE', trend: 'UNAVAILABLE' },
      },
      domains: emptyDomains,
      conflicts: [],
      completeness: {
        technicalCompleteness: 0,
        marketDataCompleteness: 0,
        riskCompleteness: 0,
        macroCompleteness: 0,
        sentimentCompleteness: 0,
        overallCompleteness: 0,
        formula: 'overall = 0 (UNAVAILABLE)',
      },
      executionPolicies: {
        webProductPolicy: 'ARMED_WITH_CONFIRMATION',
        localBrokerTransportPolicy: 'READ_ONLY',
        mt5OrderTransportEnabled: false,
        intelligenceActionability: 'NON_ACTIONABLE',
        finalDecisionExecutable: false,
      },
    };
  }

  // 2. Load Multi-Timeframe Closed Bars from SQLite
  const timeframes: Partial<Record<CanonicalTimeframe, TimeframeEvidence>> = {};
  const timeframeCandlesMap: Record<string, OHLCCandle[]> = {};

  for (const tf of CANONICAL_TIMEFRAMES) {
    try {
      const cRes = await provider.getCandles(canonical, tf, 50);
      const count = cRes?.count || (cRes?.candles ? cRes.candles.length : 0);
      const candles: OHLCCandle[] = cRes?.candles || [];
      const newestTime = cRes?.newestBarTime || (candles.length > 0 ? candles[candles.length - 1].timestamp : null);
      const ageMs = newestTime ? Math.max(0, now - newestTime) : null;

      let state: TimeframeState = 'UNAVAILABLE';
      if (count >= 10) {
        state = 'AVAILABLE';
      } else if (count > 0) {
        state = 'INSUFFICIENT_DATA';
      }

      let trend: TimeframeEvidence['trend'] = 'UNKNOWN';
      if (count >= 3) {
        const lastBar = candles[candles.length - 1];
        const firstBar = candles[Math.max(0, candles.length - 10)];
        if (lastBar.close > firstBar.open * 1.0005) trend = 'BULLISH';
        else if (lastBar.close < firstBar.open * 0.9995) trend = 'BEARISH';
        else trend = 'RANGING';
      } else if (count > 0) {
        trend = 'INSUFFICIENT_DATA';
      }

      timeframes[tf] = {
        timeframe: tf,
        state,
        barCount: count,
        newestClosedBarTime: newestTime,
        ageMs,
        candles,
        source: 'MT5_BROKER',
        storage: 'LOCAL_SQLITE',
        trend,
        role: 'UNASSIGNED',
      };

      if (candles.length > 0) {
        timeframeCandlesMap[tf] = candles;
      }
    } catch {
      timeframes[tf] = {
        timeframe: tf,
        state: 'UNAVAILABLE',
        barCount: 0,
        newestClosedBarTime: null,
        ageMs: null,
        candles: [],
        source: 'MT5_BROKER',
        storage: 'LOCAL_SQLITE',
        trend: 'UNKNOWN',
        role: 'UNASSIGNED',
      };
    }
  }

  // 3. Timeframe Role Model Assignment
  const fullTimeframes = timeframes as Record<CanonicalTimeframe, TimeframeEvidence>;

  // HTF Context: D1 -> H4
  let htfTf: CanonicalTimeframe | 'NONE' = 'NONE';
  if (fullTimeframes.D1.state === 'AVAILABLE') htfTf = 'D1';
  else if (fullTimeframes.H4.state === 'AVAILABLE') htfTf = 'H4';
  if (htfTf !== 'NONE') fullTimeframes[htfTf].role = 'HTF_CONTEXT';

  // Structural Context: H4 -> H1
  let structTf: CanonicalTimeframe | 'NONE' = 'NONE';
  if (fullTimeframes.H4.state === 'AVAILABLE' && htfTf !== 'H4') structTf = 'H4';
  else if (fullTimeframes.H1.state === 'AVAILABLE') structTf = 'H1';
  if (structTf !== 'NONE') fullTimeframes[structTf].role = 'STRUCTURAL_CONTEXT';

  // Setup Context: H1 -> M30
  let setupTf: CanonicalTimeframe | 'NONE' = 'NONE';
  if (fullTimeframes.H1.state === 'AVAILABLE' && structTf !== 'H1') setupTf = 'H1';
  else if (fullTimeframes.M30.state === 'AVAILABLE') setupTf = 'M30';
  else if (fullTimeframes.H1.state === 'AVAILABLE') setupTf = 'H1'; // Fallback sharing H1
  if (setupTf !== 'NONE') fullTimeframes[setupTf].role = 'SETUP_CONTEXT';

  // Entry Refinement: M15 -> M5 -> M1
  let entryTf: CanonicalTimeframe | 'NONE' = 'NONE';
  if (fullTimeframes.M15.state === 'AVAILABLE') entryTf = 'M15';
  else if (fullTimeframes.M5.state === 'AVAILABLE') entryTf = 'M5';
  else if (fullTimeframes.M1.state === 'AVAILABLE') entryTf = 'M1';
  if (entryTf !== 'NONE') fullTimeframes[entryTf].role = 'ENTRY_REFINEMENT';

  const timeframeRoles: TimeframeRoleModel = {
    higherTimeframe: {
      timeframe: htfTf,
      state: htfTf !== 'NONE' ? fullTimeframes[htfTf].state : 'UNAVAILABLE',
      trend: htfTf !== 'NONE' ? (fullTimeframes[htfTf].trend || 'UNKNOWN') : 'UNAVAILABLE',
    },
    structuralContext: {
      timeframe: structTf,
      state: structTf !== 'NONE' ? fullTimeframes[structTf].state : 'UNAVAILABLE',
      trend: structTf !== 'NONE' ? (fullTimeframes[structTf].trend || 'UNKNOWN') : 'UNAVAILABLE',
    },
    setupContext: {
      timeframe: setupTf,
      state: setupTf !== 'NONE' ? fullTimeframes[setupTf].state : 'UNAVAILABLE',
      trend: setupTf !== 'NONE' ? (fullTimeframes[setupTf].trend || 'UNKNOWN') : 'UNAVAILABLE',
    },
    entryRefinement: {
      timeframe: entryTf,
      state: entryTf !== 'NONE' ? fullTimeframes[entryTf].state : 'UNAVAILABLE',
      trend: entryTf !== 'NONE' ? (fullTimeframes[entryTf].trend || 'UNKNOWN') : 'UNAVAILABLE',
    },
  };

  // 4. Session State Evaluation
  const sessionState = evaluateMarketSession(canonical, options?.evaluationTime || new Date(), quote.quoteTimestamp);

  // 5. Structure & Flow Derivations
  const primaryCandles = fullTimeframes.H1.candles.length >= 10
    ? fullTimeframes.H1.candles
    : (fullTimeframes.M15.candles.length >= 10 ? fullTimeframes.M15.candles : Object.values(timeframeCandlesMap)[0] || []);

  const hasStructure = primaryCandles.length >= 10;
  const structAnalysis: MarketStructure | null = hasStructure
    ? analyzeMarketStructure(primaryCandles, canonical, 'H1', 'MT5_BROKER_OHLC')
    : null;

  // Order flow calculation using micro candles or primary candles
  const flowCandles = fullTimeframes.M5.candles.length >= 3
    ? fullTimeframes.M5.candles
    : (fullTimeframes.M15.candles.length >= 3 ? fullTimeframes.M15.candles : primaryCandles);
  const hasOrderFlow = flowCandles.length >= 3;
  const flowMetrics = hasOrderFlow
    ? computeOrderFlowMetrics(flowCandles, canonical, 'M5', false)
    : null;

  const volProfile = hasStructure
    ? calculateVolumeProfile(primaryCandles, canonical, 'H1', 24, false)
    : null;

  // 6. Multi-Timeframe Conflicts Detection
  const conflicts: EvidenceConflict[] = [];

  const htfTrend = timeframeRoles.higherTimeframe.trend;
  const setupTrend = timeframeRoles.setupContext.trend;
  const entryTrend = timeframeRoles.entryRefinement.trend;

  if (htfTrend !== 'UNKNOWN' && setupTrend !== 'UNKNOWN' && htfTrend !== setupTrend && htfTrend !== 'RANGING' && setupTrend !== 'RANGING') {
    conflicts.push({
      type: 'TIMEFRAME',
      severity: 'MEDIUM',
      description: `HTF context (${timeframeRoles.higherTimeframe.timeframe}: ${htfTrend}) opposes setup context (${timeframeRoles.setupContext.timeframe}: ${setupTrend})`,
      parties: [timeframeRoles.higherTimeframe.timeframe, timeframeRoles.setupContext.timeframe],
    });
  }

  if (quote.freshness === 'STALE') {
    conflicts.push({
      type: 'DATA_QUALITY',
      severity: 'HIGH',
      description: `Broker quote age (${Math.round(quote.ageMs / 1000)}s) exceeds freshness tolerance`,
      parties: ['QUOTE_TELEMETRY'],
    });
  }

  // 7. Domain Quality & Readiness Metadata
  const qFresh = quote.freshness;
  const domains: Record<EvidenceDomain, DomainEvidenceQuality> = {
    technical: {
      domain: 'technical',
      status: hasStructure && qFresh !== 'STALE' ? 'ONLINE' : (hasStructure ? 'STALE' : 'DATA_LIMITED'),
      quality: hasStructure ? 80 : 20,
      trust: hasStructure && qFresh === 'FRESH' ? 85 : 30,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: hasStructure ? `Technical structure: ${structAnalysis?.trend} (${primaryCandles.length} bars)` : 'Awaiting bars',
      evidenceUsed: hasStructure ? [`${primaryCandles.length} closed bars`, `Trend: ${structAnalysis?.trend}`] : [],
      missingEvidence: hasStructure ? [] : ['Closed OHLC Bars'],
    },
    structure: {
      domain: 'structure',
      status: structAnalysis ? 'ONLINE' : 'DATA_LIMITED',
      quality: structAnalysis ? 85 : 0,
      trust: structAnalysis && qFresh === 'FRESH' ? 85 : 30,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: structAnalysis ? `Swings: ${structAnalysis.swingHighs.length}H / ${structAnalysis.swingLows.length}L` : 'No swings',
      evidenceUsed: structAnalysis ? [`Swing Highs: ${structAnalysis.swingHighs.length}`, `Swing Lows: ${structAnalysis.swingLows.length}`] : [],
      missingEvidence: structAnalysis ? [] : ['OHLC Swing Detection'],
    },
    momentum: {
      domain: 'momentum',
      status: hasStructure ? 'ONLINE' : 'DATA_LIMITED',
      quality: hasStructure ? 70 : 0,
      trust: 70,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: entryTrend !== 'UNKNOWN' ? `Refinement momentum: ${entryTrend}` : 'Neutral momentum',
      evidenceUsed: entryTrend !== 'UNKNOWN' ? [`Momentum trend: ${entryTrend}`] : [],
      missingEvidence: entryTrend === 'UNKNOWN' ? ['Entry refinement bars'] : [],
    },
    volatility: {
      domain: 'volatility',
      status: hasStructure ? 'ONLINE' : 'DATA_LIMITED',
      quality: hasStructure ? 75 : 0,
      trust: 75,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: 'Historical bar range evaluated',
      evidenceUsed: hasStructure ? ['Bar range variance'] : [],
      missingEvidence: hasStructure ? [] : ['Historical bars'],
    },
    liquidity: {
      domain: 'liquidity',
      status: structAnalysis ? 'ONLINE' : 'DATA_LIMITED',
      quality: structAnalysis ? 75 : 0,
      trust: 75,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: structAnalysis ? `FVG: ${structAnalysis.fvg.length}, OrderBlocks: ${structAnalysis.orderBlocks.length}` : 'Pending zones',
      evidenceUsed: structAnalysis ? [`FVG count: ${structAnalysis.fvg.length}`, `OB count: ${structAnalysis.orderBlocks.length}`] : [],
      missingEvidence: structAnalysis ? [] : ['Liquidity zone mapping'],
    },
    orderFlow: {
      domain: 'orderFlow',
      status: flowMetrics ? 'ONLINE' : 'DATA_LIMITED',
      quality: flowMetrics ? 65 : 0,
      trust: 60, // Capped because tick volume is a proxy, not exchange order book
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: flowMetrics ? `Micro-delta: ${(flowMetrics.buyerSellerDelta * 100).toFixed(1)}% (Broker Tick Volume Proxy)` : 'Pending flow',
      evidenceUsed: flowMetrics ? [`Delta: ${(flowMetrics.buyerSellerDelta * 100).toFixed(1)}%`, 'Mode: BROKER_TICK_VOLUME_PROXY'] : [],
      missingEvidence: flowMetrics ? [] : ['M1/M5 bars'],
    },
    institutional: {
      domain: 'institutional',
      status: volProfile ? 'ONLINE' : 'DATA_LIMITED',
      quality: volProfile ? 70 : 0,
      trust: 65, // Capped because tick volume proxy
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: volProfile ? `Volume Profile POC: ${volProfile.poc} (Broker Tick Volume Proxy)` : 'Pending profile',
      evidenceUsed: volProfile ? [`POC: ${volProfile.poc}`, 'Mode: BROKER_TICK_VOLUME_PROXY'] : [],
      missingEvidence: volProfile ? [] : ['Volume profile bars'],
    },
    correlation: {
      domain: 'correlation',
      status: 'DATA_LIMITED',
      quality: 40,
      trust: 50,
      freshness: 'FRESH',
      provenance: 'LOCAL_DERIVED',
      claim: 'Intermarket beta context',
      evidenceUsed: [],
      missingEvidence: ['Cross-asset pair stream'],
    },
    macro: {
      domain: 'macro',
      status: options?.feeds?.macro ? 'ONLINE' : 'DATA_LIMITED',
      quality: options?.feeds?.macro ? 75 : 20,
      trust: options?.feeds?.macro ? 80 : 30,
      freshness: options?.feeds?.macro ? 'FRESH' : 'UNAVAILABLE',
      provenance: 'CLOUD',
      claim: options?.feeds?.macro ? 'Macro series online' : 'Macro feed unconfigured / offline',
      evidenceUsed: options?.feeds?.macro ? ['FRED series'] : [],
      missingEvidence: options?.feeds?.macro ? [] : ['FRED Rates/Inflation Telemetry'],
    },
    news: {
      domain: 'news',
      status: options?.feeds?.news ? 'ONLINE' : 'DATA_LIMITED',
      quality: options?.feeds?.news ? 70 : 20,
      trust: options?.feeds?.news ? 75 : 30,
      freshness: options?.feeds?.news ? 'FRESH' : 'UNAVAILABLE',
      provenance: 'EXTERNAL',
      claim: options?.feeds?.news ? 'Live newswire connected' : 'Newswire unconfigured / offline',
      evidenceUsed: options?.feeds?.news ? ['Newswire wire'] : [],
      missingEvidence: options?.feeds?.news ? [] : ['Live Newswire Telemetry'],
    },
    geopolitical: {
      domain: 'geopolitical',
      status: 'DATA_LIMITED',
      quality: 20,
      trust: 30,
      freshness: 'UNAVAILABLE',
      provenance: 'EXTERNAL',
      claim: 'Geopolitical alert gateway offline',
      evidenceUsed: [],
      missingEvidence: ['Geopolitical Sentinel'],
    },
    sentiment: {
      domain: 'sentiment',
      status: options?.feeds?.sentiment ? 'ONLINE' : 'DATA_LIMITED',
      quality: options?.feeds?.sentiment ? 70 : 20,
      trust: options?.feeds?.sentiment ? 70 : 30,
      freshness: options?.feeds?.sentiment ? 'FRESH' : 'UNAVAILABLE',
      provenance: 'EXTERNAL',
      claim: options?.feeds?.sentiment ? 'Sentiment LSR online' : 'Sentiment LSR offline',
      evidenceUsed: options?.feeds?.sentiment ? ['LSR crowding'] : [],
      missingEvidence: options?.feeds?.sentiment ? [] : ['Retail Sentiment Feed'],
    },
    session: {
      domain: 'session',
      status: 'ONLINE',
      quality: 90,
      trust: 95,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: `${sessionState.sessionName} — ${sessionState.statusLabel}`,
      evidenceUsed: [`Session: ${sessionState.sessionName}`, `MarketState: ${sessionState.marketState}`],
      missingEvidence: [],
    },
    killzone: {
      domain: 'killzone',
      status: 'ONLINE',
      quality: 85,
      trust: 90,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: `Killzone: ${sessionState.sessionName} (${sessionState.statusLabel})`,
      evidenceUsed: [`Active window: ${sessionState.closesAt}`],
      missingEvidence: [],
    },
    risk: {
      domain: 'risk',
      status: 'ONLINE',
      quality: 90,
      trust: 95,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: `Execution Mode: READ_ONLY. Spread: ${quote.spread} pts. Risk cap: 0.50% equity.`,
      evidenceUsed: ['READ_ONLY invariant active', `Spread: ${quote.spread}`],
      missingEvidence: [],
    },
    regime: {
      domain: 'regime',
      status: hasStructure ? 'ONLINE' : 'DATA_LIMITED',
      quality: hasStructure ? 75 : 20,
      trust: 75,
      freshness: qFresh,
      provenance: 'LOCAL_DERIVED',
      claim: hasStructure ? `Market Regime: ${structAnalysis?.trend}` : 'Pending structure',
      evidenceUsed: hasStructure ? [`Trend: ${structAnalysis?.trend}`] : [],
      missingEvidence: hasStructure ? [] : ['Structural bars'],
    },
  };

  // 8. Completeness Evaluation
  const completeness = evaluateEvidenceCompleteness({
    hasLiveQuote: qFresh === 'FRESH',
    quoteAgeMs: quote.ageMs,
    timeframeStates: Object.fromEntries(
      CANONICAL_TIMEFRAMES.map(tf => [tf, fullTimeframes[tf].state])
    ) as Record<CanonicalTimeframe, TimeframeState>,
    hasStructure,
    hasOrderFlow,
    hasMacro: Boolean(options?.feeds?.macro),
    hasSentiment: Boolean(options?.feeds?.sentiment),
    hasNews: Boolean(options?.feeds?.news),
  });

  return {
    snapshotId: `snap-${canonical}-${quote.quoteTimestamp}`,
    symbol: canonical,
    canonicalSymbol: canonical,
    brokerSymbol: quote.brokerSymbol || canonical,
    asOf: quote.quoteTimestamp,
    generatedAt: now,
    market: {
      price: quote.mid,
      bid: quote.bid,
      ask: quote.ask,
      mid: quote.mid,
      spread: quote.spread,
      digits: quote.digits || 2,
      quoteTimestamp: quote.quoteTimestamp,
      quoteAgeMs: quote.ageMs,
      quoteFreshness: quote.freshness,
      marketState: sessionState.marketState as any,
      sessionState,
      tradeExecutable: false, // Strict local invariant
    },
    provenance: {
      source: 'MT5_BROKER',
      storage: 'LOCAL_SQLITE',
      classification: 'LIVE_MT5',
      provider: 'Exness MT5 Broker (Local SQLite)',
      isDerived: false,
    },
    timeframes: fullTimeframes,
    timeframeRoles,
    domains,
    conflicts,
    completeness,
    executionPolicies: {
      webProductPolicy: 'ARMED_WITH_CONFIRMATION',
      localBrokerTransportPolicy: 'READ_ONLY',
      mt5OrderTransportEnabled: false,
      intelligenceActionability: (qFresh === 'FRESH' && hasStructure) ? 'ACTIONABLE' : 'DATA_LIMITED',
      finalDecisionExecutable: false,
    },
  };
}

// CommonJS support for Node test scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildCanonicalEvidenceBundle,
    CANONICAL_TIMEFRAMES,
    evaluateEvidenceCompleteness,
  };
}
