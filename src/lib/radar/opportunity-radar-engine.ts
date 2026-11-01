/**
 * Global Opportunity Radar Engine
 * 
 * Continuously evaluates all connected multi-asset markets (Metals, Forex, Commodities, Crypto, Indices)
 * to surface the highest-quality trade opportunities in real-time.
 * 
 * Mathematical Formulation:
 * - AI Confidence (0-100%): Swarm directional consensus & conviction from the canonical 15 agents.
 * - Opportunity Score (0-100): Multi-factor composite measuring setup maturity, R:R asymmetry,
 *   liquidity clearance, entry proximity, and event risk penalty.
 */

import { LiveMarketAsset, INITIAL_LIVE_ASSETS } from '../providers/real-market-api';
import { generateAssetIntelligence, AssetIntelligenceProfile } from '../agents/multi-asset-pipeline';
import { MarketCategory, getAllMarkets, getMarketDefinition } from '../registry/market-registry';
import { OHLCCandle } from '../market/canonical-market-snapshot';
import { EvidenceClassification } from '../evidence/agent-evidence';
import { FastOpportunityEngine, FastOpportunityEvaluation } from './fast-opportunity-engine';
import { SetupLifecycleEngine } from '../trading/setup-lifecycle-engine';
import { SetupLifecycleState } from '../trading/setup-lifecycle-types';
import { DecisionV2UiProjection, projectDecisionV2ForUi } from '../decision/decision-ui-projection';
import { SetupIntelligenceV3UiProjection, projectSetupV3ForUi } from '../setup/setup-ui-projection';

export type RadarOpportunityState =
  | 'STRONG BUY OPPORTUNITY'
  | 'BUY OPPORTUNITY'
  | 'WATCH FOR BUY'
  | 'STRONG SELL OPPORTUNITY'
  | 'SELL OPPORTUNITY'
  | 'WATCH FOR SELL'
  | 'WAIT'
  | 'NO TRADE'
  | 'DATA LIMITED'
  | 'MONITOR NEXT OPEN'
  | 'PRE-OPEN WATCH'
  | 'WAIT (MARKET CLOSED)'
  | 'UNAVAILABLE';

export type RadarTimeframeType = 'SCALPING' | 'INTRADAY' | 'SWING';
export type RadarRiskLevel = 'LOW' | 'MEDIUM' | 'ELEVATED' | 'HIGH';
export type RadarCategory = MarketCategory | 'COMMODITY';

/**
 * Evaluates the market availability tier for an Opportunity Radar candidate.
 *
 * Tier 0: Genuinely open/tradable market + valid live intelligence
 * Tier 1: Market closed (e.g. weekend, daily break), but historical/planning intelligence remains valid
 * Tier 2: DATA_LIMITED / UNAVAILABLE / offline / 0 score / unsupported broker instrument
 */
export function getRadarOpportunityTier(item: RadarOpportunityItem): number {
  if (
    item.isDataLimited ||
    item.state === 'UNAVAILABLE' ||
    item.readiness === 'UNAVAILABLE' ||
    item.marketState === 'UNAVAILABLE' ||
    item.opportunityScore === 0 ||
    item.feedStatus === 'OFFLINE'
  ) {
    return 2;
  }

  // Canonical open market check: OPEN or CLOSING_SOON and broker trading permitted
  const isTradeDisabled = item.isTradeDisabled === true || item.marketAvailable === false;
  const isMarketOpen = (item.marketState === 'OPEN' || item.marketState === 'CLOSING_SOON') && !isTradeDisabled;

  if (isMarketOpen) {
    return 0;
  }

  return 1;
}

/**
 * Authoritative market-hours-aware opportunity comparator.
 * Enforces:
 * 1. Tier 0 (Open & tradable) candidates strictly rank above Tier 1 (Market closed) candidates.
 * 2. Tier 1 candidates strictly rank above Tier 2 (Data limited / unavailable) candidates.
 * 3. Within each tier, opportunity quality is preserved: opportunityScore descending, then aiConfidence descending.
 */
export function compareRadarOpportunities(a: RadarOpportunityItem, b: RadarOpportunityItem): number {
  const tierA = getRadarOpportunityTier(a);
  const tierB = getRadarOpportunityTier(b);

  if (tierA !== tierB) {
    return tierA - tierB;
  }

  if (b.opportunityScore !== a.opportunityScore) {
    return b.opportunityScore - a.opportunityScore;
  }
  return b.aiConfidence - a.aiConfidence;
}

export interface RadarOpportunityItem {
  rank: number;
  symbol: string;
  name: string;
  category: RadarCategory;
  price: number;
  change24h: number;
  state: RadarOpportunityState;
  readiness?: 'UNAVAILABLE' | 'DATA LIMITED' | 'PARTIAL' | 'STALE' | 'READY';
  opportunityScore: number; // 0 - 100
  aiConfidence: number;      // 0 - 100%
  timeframe: RadarTimeframeType;
  riskLevel: RadarRiskLevel;
  tradeExecutable: boolean;
  setupQuality: number;
  executabilityScore: number; // 100 if open, 0 if closed
  marketState: string;
  sessionCountdown?: string;
  entryZone: [number, number];
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: string;
  regime: string;
  catalysts: string[];
  invalidation: string;
  whyRankedReasons?: string[];
  evidenceTrust?: number;
  actionabilityState?: string;
  verifiedAgentCount?: number;
  feedStatus?: string;
  isDataLimited?: boolean;
  setupLifecycleState?: SetupLifecycleState;
  decisionV2?: DecisionV2UiProjection;
  setupV3?: SetupIntelligenceV3UiProjection;
  marketAvailable?: boolean;
  isTradeDisabled?: boolean;
}

export interface AttentionQueueItem {
  id: string;
  symbol: string;
  urgency: 'ACT NOW' | 'WAITING FOR CONFIRMATION' | 'EVENT RISK' | 'DEVELOPING' | 'MONITORING';
  headline: string;
  detail: string;
  eta: string;
  badgeColor: 'emerald' | 'amber' | 'rose' | 'cyan' | 'slate';
}

export interface DevelopingSetupItem {
  symbol: string;
  name: string;
  pattern: string;
  triggerCondition: string;
  readinessPct: number;
  estimatedRR: string;
  direction: 'LONG' | 'SHORT' | 'UNDETERMINED';
}

export interface InvalidatedSetupItem {
  symbol: string;
  setupName: string;
  invalidatedAt: string;
  reason: string;
  lossMitigation: string;
}

export interface RegimeMapItem {
  symbol: string;
  name: string;
  category: RadarCategory;
  regime: string;
  volatility: string;
  session: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export interface GlobalRadarIntelligence {
  timestamp: string;
  activeScanCount: number;
  topOpportunity: RadarOpportunityItem | null;
  rankedOpportunities: RadarOpportunityItem[];
  attentionQueue: AttentionQueueItem[];
  developingSetups: DevelopingSetupItem[];
  recentlyInvalidated: InvalidatedSetupItem[];
  regimeMap: RegimeMapItem[];
  summaryStats: {
    totalScanned: number;
    buyOpportunities: number;
    sellOpportunities: number;
    watchlistCount: number;
    highestScoreAsset: string;
    highestScore: number;
  };
}

/**
 * Parses numeric R:R ratio from string like "1:3.6" -> 3.6
 */
function parseRR(rrStr: string): number {
  if (!rrStr) return 1.5;
  const parts = rrStr.split(':');
  if (parts.length === 2) {
    const parsed = parseFloat(parts[1]);
    return isNaN(parsed) ? 1.5 : parsed;
  }
  return 1.5;
}

/**
 * Calculates Opportunity Score (0-100) mathematically distinct from AI Confidence.
 * 
 * Components:
 * 1. Technical Structure & Proximity (30 pts)
 * 2. Swarm Consensus Alignment (25 pts)
 * 3. Risk-to-Reward Attractiveness (20 pts)
 * 4. Liquidity & Execution Clearance (15 pts)
 * 5. Macro/News Event Safety Buffer (10 pts)
 */
export function calculateOpportunityScore(
  profile: AssetIntelligenceProfile,
  asset: LiveMarketAsset
): {
  score: number;
  setupQuality: number;
  tradeExecutable: boolean;
  marketState: string;
  state: RadarOpportunityState;
  riskLevel: RadarRiskLevel;
  timeframe: RadarTimeframeType;
  whyReasons: string[];
} {
  let score = 50; // base median
  const reasons: string[] = [];

  // 1. Swarm Consensus Alignment (up to 25 pts)
  const bullishAgents = profile.agents.filter((a) => a.bias === 'BULLISH').length;
  const bearishAgents = profile.agents.filter((a) => a.bias === 'BEARISH').length;
  const maxConsensus = Math.max(bullishAgents, bearishAgents);
  const consensusRatio = maxConsensus / profile.agents.length;

  if (consensusRatio >= 0.8) {
    score += 20;
    reasons.push(`${maxConsensus}/15 Swarm Agents aligned in strict directional consensus`);
  } else if (consensusRatio >= 0.65) {
    score += 12;
    reasons.push(`Supermajority agreement across ${maxConsensus} agent models`);
  } else {
    score -= 8;
  }

  // 2. Risk to Reward Attractiveness (up to 20 pts)
  const rrValue = parseRR(profile.rr);
  if (rrValue >= 3.5) {
    score += 18;
    reasons.push(`Asymmetric ${profile.rr} R:R with tight structural invalidation`);
  } else if (rrValue >= 2.5) {
    score += 12;
    reasons.push(`Favorable ${profile.rr} risk-to-reward ratio to primary liquidity targets`);
  } else if (rrValue < 1.8) {
    score -= 10;
  }

  // 3. Entry Proximity to Institutional Zone (up to 25 pts)
  const p = asset.price;
  if (profile.entryZone && Array.isArray(profile.entryZone) && profile.entryZone.length === 2) {
    const [eLow, eHigh] = profile.entryZone;
    const zoneMid = (eLow + eHigh) / 2;
    const zoneSpread = Math.abs(eHigh - eLow) || (p * 0.005);
    const distFromZone = Math.abs(p - zoneMid) / zoneSpread;

    if (distFromZone <= 1.2) {
      score += 18;
      reasons.push(`Price is active inside optimal institutional entry zone (${eLow} - ${eHigh})`);
    } else if (distFromZone <= 2.5) {
      score += 8;
      reasons.push(`Approaching entry mitigation zone (${eLow} - ${eHigh})`);
    } else {
      score -= 12;
      reasons.push(`Extended from ideal entry; pullback required before trigger`);
    }
  } else {
    // Structure analysis pending — entry zone not yet established
    score -= 10;
    reasons.push(`Structure analysis pending — awaiting verified entry zone`);
  }

  // 4. Liquidity & Volatility Quality (up to 15 pts)
  if (profile.liquidity.toLowerCase().includes('deep') || profile.liquidity.toLowerCase().includes('prime')) {
    score += 10;
    reasons.push(`High institutional book depth with low execution friction`);
  } else if (profile.liquidity.toLowerCase().includes('low') || profile.liquidity.toLowerCase().includes('sweep')) {
    score += 4;
  }

  // Event Risk / Shock Filter Penalty (up to 10 pts)
  const newsRisk = profile.newsRisk.toLowerCase();
  let riskLevel: RadarRiskLevel = 'MEDIUM';
  if (newsRisk.includes('low') || newsRisk.includes('clear') || newsRisk.includes('safe')) {
    score += 10;
    riskLevel = 'LOW';
    reasons.push(`Clean macroeconomic runway without impending high-impact embargoes`);
  } else if (newsRisk.includes('high') || newsRisk.includes('extreme') || newsRisk.includes('pce')) {
    score -= 12; // event risk deduction
    riskLevel = 'ELEVATED';
  } else {
    riskLevel = 'MEDIUM';
  }

  // Trend and Regime confirmation
  if (profile.regime.toLowerCase().includes('expansion') || profile.regime.toLowerCase().includes('trend')) {
    score += 8;
    reasons.push(`Clean regime confluence: ${profile.regime}`);
  }

  // 6. Fast Opportunity Engine & M15/M30 Candle-Close Trigger Integration
  const sessionState = profile.sessionState;
  const isSessionExecutable = (profile.tradeExecutable !== false) && (profile.sessionState ? profile.sessionState.tradeExecutable : true);
  const marketState = sessionState?.marketState || (isSessionExecutable ? 'OPEN' : 'CLOSED');
  const isInvalidated =
    profile.setupLifecycle?.state === 'INVALIDATED' ||
    profile.blueprint?.state === 'INVALIDATED' ||
    (profile.blueprint?.setupId ? SetupLifecycleEngine.isSetupInvalidated(profile.blueprint.setupId) : false);

  let fastEval: FastOpportunityEvaluation | null = null;
  if (profile.blueprint && profile.triggerEvidence && !isInvalidated) {
    const hasVerifiedBrokerPrice = (asset.price > 0 && asset.feedStatus !== 'OFFLINE' && (asset.feedStatus as string) !== 'UNAVAILABLE') || asset.provider === 'MT5';
    const spreadQuality = asset.spread !== undefined && asset.spread > 0
      ? (asset.spread <= 25 ? 'TIGHT' : 'NORMAL')
      : 'NORMAL';

    fastEval = FastOpportunityEngine.evaluateFastOpportunity({
      symbol: profile.symbol,
      currentPrice: asset.price,
      triggerEvidence: profile.triggerEvidence,
      blueprint: profile.blueprint,
      marketStructure: profile.marketStructure || null,
      sessionExecutable: isSessionExecutable,
      spreadQuality,
      hasVerifiedBrokerPrice,
      macroCoverage: {
        isRatesAvailable: true,
        isRealYieldAvailable: true,
        isDxyAvailable: false,
      },
    });

    if (fastEval.isTriggerConfirmed) {
      score += 20;
      score = Math.max(score, fastEval.rankingScore);
      reasons.unshift(fastEval.reasoning);
    }
  }

  if (isInvalidated) {
    score = Math.min(score, 35);
    reasons.unshift(`[INVALIDATED] Setup invalidated: ${profile.setupLifecycle?.invalidationReason || 'Structural violation'}`);
  }

  // Clamp score strictly to 0 - 100 (Setup Quality)
  const setupQuality = Math.max(10, Math.min(99, Math.round(score)));

  // Derive Radar Opportunity State & Session Executability
  const isBullishDominant = bullishAgents > bearishAgents;
  let state: RadarOpportunityState = 'WAIT';

  if (!isSessionExecutable) {
    // Market is CLOSED, PRE_OPEN, DAILY_BREAK, WEEKEND_CLOSED, etc.
    // Core Rule: NEVER present an executable BUY or SELL opportunity for an instrument whose market is currently CLOSED.
    if (marketState === 'PRE_OPEN') {
      state = 'PRE-OPEN WATCH';
    } else if (marketState === 'DAILY_BREAK' || marketState === 'CLOSED' || marketState === 'WEEKEND_CLOSED' || marketState === 'HOLIDAY' || marketState === 'EARLY_CLOSE') {
      state = 'MONITOR NEXT OPEN';
    } else {
      state = 'WAIT (MARKET CLOSED)';
    }
    const countdown = sessionState?.nextOpenCountdown ? ` in ${sessionState.nextOpenCountdown}` : '';
    reasons.unshift(`[MARKET ${sessionState?.statusLabel || 'CLOSED'}] Analysis active; execution gated until session opens${countdown}`);
  } else {
    const isFastBuyTrigger = fastEval?.isTriggerConfirmed && fastEval.direction === 'BUY';
    const isFastSellTrigger = fastEval?.isTriggerConfirmed && fastEval.direction === 'SELL';

    if (isInvalidated) {
      state = 'WAIT';
      riskLevel = 'HIGH';
    } else if (profile.setupDirection === 'WATCH FOR BUY' || profile.setupDirection === 'BUY OPPORTUNITY' || isFastBuyTrigger) {
      if (setupQuality >= 84) {
        state = 'STRONG BUY OPPORTUNITY';
        riskLevel = 'LOW';
      } else if (setupQuality >= 70) {
        state = 'BUY OPPORTUNITY';
        if (riskLevel !== 'ELEVATED') riskLevel = 'LOW';
      } else {
        state = 'WATCH FOR BUY';
        riskLevel = 'MEDIUM';
      }
    } else if (profile.setupDirection === 'WATCH FOR SELL' || profile.setupDirection === 'SELL OPPORTUNITY' || isFastSellTrigger) {
      if (setupQuality >= 84) {
        state = 'STRONG SELL OPPORTUNITY';
        riskLevel = 'LOW';
      } else if (setupQuality >= 70) {
        state = 'SELL OPPORTUNITY';
        if (riskLevel !== 'ELEVATED') riskLevel = 'LOW';
      } else {
        state = 'WATCH FOR SELL';
        riskLevel = 'MEDIUM';
      }
    } else if (
      profile.setupDirection === 'WAIT' ||
      profile.setupDirection === 'WAIT (MARKET CLOSED)' ||
      profile.setupDirection === 'PRE-OPEN WATCH' ||
      profile.setupDirection === 'MONITOR NEXT OPEN' ||
      profile.setupDirection === 'DATA LIMITED' ||
      profile.setupDirection === 'ANALYSIS ONLY'
    ) {
      state = profile.setupDirection as RadarOpportunityState;
      riskLevel = 'MEDIUM';
    } else if (profile.setupDirection === 'NO TRADE' || setupQuality < 40) {
      state = 'NO TRADE';
      riskLevel = 'HIGH';
    } else {
      state = 'WAIT';
      riskLevel = 'MEDIUM';
    }

    if (marketState === 'CLOSING_SOON') {
      reasons.unshift(`[CLOSING SOON] Liquidity narrowing — session closes in ${sessionState?.nextCloseCountdown || '15m'}`);
    }
  }

  // Derive Timeframe from asset profile & volatility
  let timeframe: RadarTimeframeType = 'INTRADAY';
  if (profile.category === 'CRYPTO' || profile.volatility.toLowerCase().includes('high') || profile.volatility.toLowerCase().includes('elevated')) {
    timeframe = profile.category === 'CRYPTO' ? 'SCALPING' : 'INTRADAY';
  } else if (profile.category === 'METALS') {
    timeframe = 'INTRADAY';
  } else {
    timeframe = 'SWING';
  }

  // tradeExecutable should NEVER be true if posture/state is WAIT, NO TRADE, or market is closed
  const isActionableState = (state.includes('BUY') || state.includes('SELL')) && !state.includes('WAIT') && state !== 'NO TRADE';
  const effectiveTradeExecutable = isSessionExecutable && isActionableState;

  return {
    score: setupQuality,
    setupQuality,
    tradeExecutable: effectiveTradeExecutable,
    marketState,
    state,
    riskLevel,
    timeframe,
    whyReasons: reasons.slice(0, 4)
  };
}

export interface SymbolCandleFeed {
  candles: OHLCCandle[];
  bundle?: Record<string, OHLCCandle[]>;
  provenance?: EvidenceClassification;
  provider?: string;
}

/**
 * Continuous Multi-Asset Radar Intelligence Generator
 */
export function generateGlobalRadarIntelligence(
  assets: Record<string, LiveMarketAsset> = INITIAL_LIVE_ASSETS,
  currentTimeframe: string = 'H1',
  activeCandles?: {
    symbol: string;
    candles: OHLCCandle[];
    bundle?: Record<string, OHLCCandle[]>;
    provenance?: EvidenceClassification;
    provider?: string;
  },
  multiAssetCandles?: Record<string, SymbolCandleFeed>,
  evaluationTime: Date = new Date()
): GlobalRadarIntelligence {
  if (!assets || Object.keys(assets).length === 0) {
    return {
      timestamp: evaluationTime.toLocaleTimeString(),
      activeScanCount: 0,
      topOpportunity: null,
      rankedOpportunities: [],
      attentionQueue: [],
      developingSetups: [],
      recentlyInvalidated: [],
      regimeMap: [],
      summaryStats: {
        totalScanned: 0,
        buyOpportunities: 0,
        sellOpportunities: 0,
        watchlistCount: 0,
        highestScoreAsset: 'NONE',
        highestScore: 0,
      },
    };
  }

  const canonicalMarkets = getAllMarkets();

  // Create lookup for incoming assets normalized to canonical symbols
  const resolvedAssets: Record<string, LiveMarketAsset> = {};
  for (const [key, val] of Object.entries(assets)) {
    const marketDef = getMarketDefinition(key);
    const canonicalKey = marketDef ? marketDef.symbol : key.toUpperCase().trim();
    // Prioritize direct canonical match, or adopt alias quote
    if (!resolvedAssets[canonicalKey] || key === canonicalKey) {
      resolvedAssets[canonicalKey] = {
        ...val,
        symbol: canonicalKey,
      };
    }
  }

  // Iterate strictly across the canonical 26 universe without duplicating aliases
  const opportunities: RadarOpportunityItem[] = canonicalMarkets.map((canonicalDef) => {
    const sym = canonicalDef.symbol;
    const isLiveAssetPresent = Boolean(resolvedAssets[sym]);
    const liveAsset: LiveMarketAsset = resolvedAssets[sym] || {
      symbol: sym,
      name: canonicalDef.displayName,
      price: canonicalDef.basePrice || 0,
      change24h: 0,
      volume24h: 0,
      high24h: canonicalDef.basePrice || 0,
      low24h: canonicalDef.basePrice || 0,
      lastUpdated: evaluationTime.toISOString(),
      provider: 'UNAVAILABLE',
      feedStatus: 'OFFLINE',
    };

    const isMatched = activeCandles && (activeCandles.symbol === sym || getMarketDefinition(activeCandles.symbol)?.symbol === sym) && Array.isArray(activeCandles.candles) && activeCandles.candles.length >= 10;
    const multiFeed = multiAssetCandles && (multiAssetCandles[sym] || (canonicalDef.brokerAliases && canonicalDef.brokerAliases.map(ba => multiAssetCandles[ba]).find(Boolean)));
    const hasMultiCandles = multiFeed && Array.isArray(multiFeed.candles) && multiFeed.candles.length >= 10;

    let profile: AssetIntelligenceProfile;
    if (isMatched) {
      const feedBundle = activeCandles.bundle || activeCandles.candles;
      profile = generateAssetIntelligence(sym, liveAsset, currentTimeframe, feedBundle, activeCandles.provenance, activeCandles.provider, evaluationTime);
    } else if (hasMultiCandles) {
      const feedBundle = multiFeed.bundle || multiFeed.candles;
      profile = generateAssetIntelligence(sym, liveAsset, currentTimeframe, feedBundle, multiFeed.provenance, multiFeed.provider, evaluationTime);
    } else {
      profile = generateAssetIntelligence(sym, liveAsset, currentTimeframe, undefined, undefined, undefined, evaluationTime);
    }

    const { score, setupQuality, tradeExecutable, marketState, state, riskLevel, timeframe, whyReasons } = calculateOpportunityScore(profile, liveAsset);

    const isUnsupportedOrOffline = sym === 'GER40' || !isLiveAssetPresent || liveAsset.feedStatus === 'OFFLINE' || (liveAsset.feedStatus as string) === 'UNAVAILABLE';
    const decisionV2Ui = profile.decisionV2Projection || projectDecisionV2ForUi(profile.decisionIntelligenceV2, sym);
    const setupV3Ui = profile.setupIntelligenceV3Projection || projectSetupV3ForUi(profile.setupIntelligenceV3, sym);
    const hasHardVeto = Boolean(profile.decisionIntelligenceV2?.hardVetoes?.length || decisionV2Ui?.hasHardVeto);

    const effectiveState = isUnsupportedOrOffline ? 'UNAVAILABLE' : state;
    let effectiveScore = isUnsupportedOrOffline ? 0 : score;
    if (hasHardVeto && effectiveScore > 15) {
      effectiveScore = 15;
    }
    const effectiveExecutable = isUnsupportedOrOffline ? false : tradeExecutable;

    return {
      rank: 0,
      symbol: sym,
      name: profile.name,
      category: profile.category as RadarCategory,
      price: liveAsset.price,
      change24h: liveAsset.change24h,
      state: effectiveState,
      opportunityScore: effectiveScore,
      setupQuality: isUnsupportedOrOffline ? 0 : (hasHardVeto && setupQuality > 15 ? 15 : setupQuality),
      tradeExecutable: effectiveExecutable,
      executabilityScore: effectiveExecutable ? 100 : 0,
      marketState: isUnsupportedOrOffline ? 'UNAVAILABLE' : marketState,
      sessionCountdown: profile.sessionState?.nextOpenCountdown,
      aiConfidence: isUnsupportedOrOffline ? 0 : profile.confidence,
      timeframe,
      riskLevel: isUnsupportedOrOffline ? 'HIGH' : riskLevel,
      entryZone: profile.entryZone,
      stopLoss: profile.stopLoss,
      tp1: profile.tp1,
      tp2: profile.tp2,
      tp3: profile.tp3,
      rr: profile.rr,
      regime: isUnsupportedOrOffline ? 'DATA LIMITED — Broker Feed Unavailable' : profile.regime,
      catalysts: isUnsupportedOrOffline ? ['Broker unsupported / instrument unavailable'] : profile.whyThisTrade,
      invalidation: profile.invalidation,
      whyRankedReasons: isUnsupportedOrOffline ? ['Broker unsupported / instrument unavailable'] : whyReasons,
      evidenceTrust: isUnsupportedOrOffline ? 0 : profile.evidenceTrust,
      actionabilityState: isUnsupportedOrOffline ? 'INSUFFICIENT_INFORMATION' : profile.actionabilityState,
      verifiedAgentCount: isUnsupportedOrOffline ? 0 : profile.verifiedAgentCount,
      feedStatus: liveAsset.feedStatus,
      isDataLimited: isUnsupportedOrOffline || liveAsset.feedStatus === 'DATA LIMITED' || liveAsset.feedStatus === 'DEMO',
      setupLifecycleState: profile.setupLifecycle?.state || (profile.blueprint ? 'ARMED' : 'FORMING'),
      decisionV2: decisionV2Ui,
      setupV3: setupV3Ui,
      marketAvailable: liveAsset.marketAvailable !== false && liveAsset.tradeMode !== 'DISABLED',
      isTradeDisabled: liveAsset.isTradeDisabled === true || liveAsset.tradeMode === 'DISABLED' || liveAsset.marketAvailable === false,
    };
  });

  // Market-hours-aware ranking:
  // Tier 0 (Active Open) > Tier 1 (Closed with valid analysis) > Tier 2 (Data limited/offline)
  // Within each tier: opportunityScore desc, then aiConfidence desc.
  opportunities.sort(compareRadarOpportunities);

  // Assign sequential ranks based on sorted order
  opportunities.forEach((item, index) => {
    item.rank = index + 1;
  });

  // Top opportunity: prefer the highest-ranked executable/actionable opportunity in Tier 0.
  // If no executable opportunity, use the highest-ranked Tier 0 open opportunity, or top opportunity.
  const topExecutableOpportunity = opportunities.find((o) => o.tradeExecutable);
  const topOpportunity = topExecutableOpportunity || opportunities.find((o) => getRadarOpportunityTier(o) === 0) || opportunities[0] || null;

  // Build Market Attention Queue — derived ONLY from real-ranked opportunities.
  // Phase 2D: No hardcoded/fictional symbols, prices, ETA text, or intelligence commentary.
  const attentionQueue: AttentionQueueItem[] = [];
  if (topOpportunity) {
    const isTopExecutable = topOpportunity.tradeExecutable;
    attentionQueue.push({
      id: 'att-1',
      symbol: topOpportunity.symbol,
      urgency: isTopExecutable ? 'ACT NOW' : 'DEVELOPING',
      headline: isTopExecutable
        ? `${topOpportunity.symbol} — Top Ranked Setup Opportunity`
        : `${topOpportunity.symbol} Setup Developing (${topOpportunity.marketState || 'CLOSED'})`,
      detail: isTopExecutable
        ? `Opportunity Score ${topOpportunity.opportunityScore}/100. R:R ${topOpportunity.rr || 'N/A'}. TP1: ${topOpportunity.tp1 ?? 'N/A'}.`
        : `Setup Score ${topOpportunity.opportunityScore}/100. Market session closed — execution gated until session opens.`,
      eta: isTopExecutable ? 'Active Session' : 'Awaiting Session Open',
      badgeColor: isTopExecutable ? 'emerald' : 'amber',
    });
  }
  // Additional attention items: next 3 ranked non-top opportunities if they exist (making up to 4 items)
  const secondaryItems = opportunities.filter(o => topOpportunity ? o.symbol !== topOpportunity.symbol : true).slice(0, 3);
  secondaryItems.forEach((opp, idx) => {
    attentionQueue.push({
      id: `att-${idx + 2}`,
      symbol: opp.symbol,
      urgency: opp.tradeExecutable ? 'DEVELOPING' : 'MONITORING',
      headline: `${opp.symbol} — Rank #${opp.rank} Setup (Score ${opp.opportunityScore}/100)`,
      detail: `State: ${opp.state}. Market: ${opp.marketState || 'UNKNOWN'}.${opp.rr ? ` R:R ${opp.rr}` : ''}`,
      eta: opp.tradeExecutable ? 'Active Session' : 'Session closed',
      badgeColor: opp.tradeExecutable ? 'cyan' : 'slate',
    });
  });

  // Phase 2D: Developing setups derived from opportunities in WATCH/approaching states.
  // No hardcoded fictional patterns, trigger conditions, or R:R.
  const developingSetups: DevelopingSetupItem[] = opportunities
    .filter(o => o.state.includes('WATCH') || o.opportunityScore >= 60)
    .slice(0, 4)
    .map(o => ({
      symbol: o.symbol,
      name: o.name,
      pattern: o.regime || 'Structure Being Analyzed',
      triggerCondition: 'Awaiting verified trigger from market structure engine',
      readinessPct: o.opportunityScore,
      estimatedRR: o.rr || 'N/A',
      direction: (o.state.includes('BUY') ? 'LONG' : o.state.includes('SELL') ? 'SHORT' : 'UNDETERMINED') as 'LONG' | 'SHORT' | 'UNDETERMINED',
    }));

  // Populated from SetupLifecycleEngine real-time invalidation records
  const recentlyInvalidated: InvalidatedSetupItem[] = SetupLifecycleEngine.getRecentlyInvalidated(5).map((inv) => ({
    symbol: inv.symbol,
    setupName: `${inv.symbol} ${inv.direction} Setup`,
    invalidatedAt: new Date(inv.invalidatedAt).toLocaleTimeString(),
    reason: inv.invalidationReason,
    lossMitigation: `Structural exit at ${inv.invalidatedPrice.toFixed(2)}`,
  }));

  // Market Regime Map — derived from real opportunities only
  const regimeMap: RegimeMapItem[] = opportunities.map((opp) => {
    const isBull = opp.state.includes('BUY');
    const isBear = opp.state.includes('SELL');
    return {
      symbol: opp.symbol,
      name: opp.name,
      category: opp.category,
      regime: opp.regime,
      volatility: opp.riskLevel === 'HIGH' ? 'High ATR' : opp.riskLevel === 'ELEVATED' ? 'Elevated ATR' : 'Normal / Low',
      session: 'Active Institutional',
      bias: isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL',
    };
  });

  // Summary statistics
  const buyOpportunities = opportunities.filter((o) => o.state.includes('BUY')).length;
  const sellOpportunities = opportunities.filter((o) => o.state.includes('SELL')).length;
  const watchlistCount = opportunities.filter((o) => o.state.includes('WATCH')).length;

  return {
    timestamp: new Date().toLocaleTimeString(),
    activeScanCount: opportunities.length,
    topOpportunity,
    rankedOpportunities: opportunities,
    attentionQueue,
    developingSetups,
    recentlyInvalidated,
    regimeMap,
    summaryStats: {
      totalScanned: opportunities.length,
      buyOpportunities,
      sellOpportunities,
      watchlistCount,
      highestScoreAsset: topOpportunity?.symbol ?? 'NONE',
      highestScore: topOpportunity?.opportunityScore ?? 0,
    },
  };
}

/**
 * Evaluates ranked opportunities across pre-computed profiles and market quotes.
 * Canonical server-side function used by the 24/7 background surveillance worker.
 */
export function evaluateOpportunityRadar(
  profiles: Record<string, AssetIntelligenceProfile>,
  marketQuotes: Record<string, { price: number; change24h: number }>,
  evaluationTime: Date = new Date()
): RadarOpportunityItem[] {
  const symbols = Object.keys(profiles);

  const opportunities: RadarOpportunityItem[] = symbols.map((sym) => {
    const profile = profiles[sym];
    const quote = marketQuotes[sym] || { price: 0, change24h: 0 };
    const liveAsset: LiveMarketAsset = {
      symbol: sym,
      name: profile.name,
      price: quote.price,
      bid: quote.price,
      ask: quote.price,
      spread: 0,
      change24h: quote.change24h,
      high24h: quote.price,
      low24h: quote.price,
      volume: '$1B',
      sparkline: '0,10 100,10',
      source: 'Radar Surveillance',
      lastUpdated: evaluationTime.toISOString(),
      category: profile.category as any,
    };

    const { score, setupQuality, tradeExecutable, marketState, state, riskLevel, timeframe, whyReasons } =
      calculateOpportunityScore(profile, liveAsset);

    return {
      rank: 0,
      symbol: sym,
      name: profile.name,
      category: profile.category as RadarCategory,
      price: liveAsset.price,
      change24h: liveAsset.change24h,
      state,
      opportunityScore: score,
      setupQuality,
      tradeExecutable,
      executabilityScore: tradeExecutable ? 100 : 0,
      marketState,
      sessionCountdown: profile.sessionState?.nextOpenCountdown,
      aiConfidence: profile.confidence,
      timeframe,
      riskLevel,
      entryZone: profile.entryZone,
      stopLoss: profile.stopLoss,
      tp1: profile.tp1,
      tp2: profile.tp2,
      tp3: profile.tp3,
      rr: profile.rr,
      regime: profile.regime,
      catalysts: profile.whyThisTrade,
      invalidation: profile.invalidation,
      whyRankedReasons: whyReasons,
      evidenceTrust: profile.evidenceTrust,
      actionabilityState: profile.actionabilityState,
      verifiedAgentCount: profile.verifiedAgentCount,
      feedStatus: 'LIVE',
      isDataLimited: false,
    };
  });

  opportunities.sort(compareRadarOpportunities);

  opportunities.forEach((item, index) => {
    item.rank = index + 1;
  });

  return opportunities;
}

/**
 * Authoritative Local Opportunity Radar Evaluation
 *
 * Uses LocalMarketDataProvider to scan dynamically available broker assets directly from SQLite
 * without hybrid switching or fallback to public mock data.
 *
 * Guarantees:
 * 1. Single-lifecycle provider instance per radar scan cycle.
 * 2. Scans dynamically available symbols from provider (25 broker assets).
 * 3. Unavailable / missing broker assets (e.g. GER40) are explicitly marked as UNAVAILABLE / DATA LIMITED,
 *    unranked in active setups, opportunityScore: 0, tradeExecutable: false.
 * 4. Safety Invariant: In local READ_ONLY mode, tradeExecutable is always false.
 */
export async function evaluateLocalOpportunityRadar(
  provider?: any,
  currentTimeframe: string = 'H1'
): Promise<GlobalRadarIntelligence> {
  let marketProvider = provider;
  if (!marketProvider && typeof window === 'undefined') {
    const getMod = () => '../providers/local-market-data-provider';
    const dynReq = eval('require');
    const { getLocalMarketDataProvider } = dynReq(getMod());
    marketProvider = getLocalMarketDataProvider();
  }

  // 1. Single-lifecycle retrieval of available symbols and latest quotes
  const [availableSymbols, latestQuotes] = await Promise.all([
    marketProvider.getAvailableSymbols(),
    marketProvider.getLatestQuotes(),
  ]);

  const availableSet = new Set((availableSymbols || []).map((s: string) => s.toUpperCase()));
  const allCanonicalMarkets = getAllMarkets();

  // Map each asset to a normalized LiveMarketAsset
  const liveAssetsMap: Record<string, LiveMarketAsset> = {};
  const multiAssetCandles: Record<string, SymbolCandleFeed> = {};

  // For available symbols, retrieve quotes & candles reusing the single marketProvider instance
  for (const m of allCanonicalMarkets) {
    const sym = m.symbol.toUpperCase();
    const quote = latestQuotes[sym];
    const isAvailable = availableSet.has(sym) && Boolean(quote && quote.bid > 0) && sym !== 'GER40';

    if (isAvailable && quote) {
      liveAssetsMap[sym] = {
        symbol: sym,
        name: m.displayName || sym,
        price: quote.mid,
        bid: quote.bid,
        ask: quote.ask,
        spread: quote.spread,
        change24h: 0,
        high24h: quote.mid,
        low24h: quote.mid,
        volume: 'MT5 Broker Feed',
        sparkline: '0,20 140,20',
        source: 'MT5_BROKER',
        provider: 'Exness MT5 Broker (Local SQLite)',
        lastUpdated: new Date(quote.quoteTimestamp).toISOString(),
        category: m.category,
        feedStatus: quote.freshness === 'FRESH'
          ? 'LIVE'
          : (quote.freshness === 'SESSION_CLOSED'
            ? 'DELAYED'
            : (quote.freshness === 'STALE' ? 'DATA LIMITED' : 'OFFLINE')),
        classification: 'LIVE_MT5',
      };

      // Retrieve candles for this asset from the local provider
      try {
        const candleRes = await marketProvider.getCandles(sym, currentTimeframe, 50);
        if (candleRes && candleRes.count >= 10) {
          multiAssetCandles[sym] = {
            candles: candleRes.candles,
            bundle: { [currentTimeframe]: candleRes.candles },
            provenance: 'LIVE_MT5',
            provider: 'Exness MT5 Broker (Local SQLite)',
          };
        }
      } catch {}
    } else {
      // Missing or unquoted broker symbol (e.g. GER40) -> strictly UNAVAILABLE, ZERO mock fallback
      liveAssetsMap[sym] = {
        symbol: sym,
        name: m.displayName || sym,
        price: 0,
        bid: 0,
        ask: 0,
        spread: 0,
        change24h: 0,
        high24h: 0,
        low24h: 0,
        volume: 'UNAVAILABLE',
        sparkline: '0,20 140,20',
        source: 'MT5_BROKER',
        provider: 'UNAVAILABLE',
        lastUpdated: new Date().toISOString(),
        category: m.category,
        feedStatus: 'OFFLINE',
        classification: 'UNAVAILABLE',
      };
    }
  }

  // Generate radar intelligence using canonical generateGlobalRadarIntelligence
  const radar = generateGlobalRadarIntelligence(
    liveAssetsMap,
    currentTimeframe,
    undefined,
    multiAssetCandles
  );

  // Invariant enforcement across all radar items:
  // 1. In READ_ONLY local mode, tradeExecutable must be false.
  // 2. Missing/unsupported broker symbols (like GER40) must have opportunityScore = 0, isDataLimited = true, state = 'UNAVAILABLE', marketState = 'UNAVAILABLE'.
  // 3. Truthful readiness mapping: UNAVAILABLE, PARTIAL, STALE, READY.
  for (const opp of radar.rankedOpportunities) {
    opp.tradeExecutable = false;
    opp.executabilityScore = 0;

    const hasBrokerData = availableSet.has(opp.symbol) && opp.symbol !== 'GER40';
    if (!hasBrokerData) {
      opp.state = 'UNAVAILABLE';
      opp.readiness = 'UNAVAILABLE';
      opp.marketState = 'UNAVAILABLE';
      opp.opportunityScore = 0;
      opp.setupQuality = 0;
      opp.aiConfidence = 0;
      opp.isDataLimited = true;
      opp.tradeExecutable = false;
      opp.feedStatus = 'OFFLINE';
      opp.regime = 'UNAVAILABLE — Broker Instrument Unavailable';
      opp.whyRankedReasons = ['Broker instrument unavailable in local MT5 / zero evidence'];
      opp.decisionV2 = projectDecisionV2ForUi(null, opp.symbol);
      opp.setupV3 = projectSetupV3ForUi(null, opp.symbol);
    } else {
      const q = latestQuotes[opp.symbol];
      const c = multiAssetCandles[opp.symbol];
      const isStale = q?.freshness === 'STALE' || opp.feedStatus === 'DATA LIMITED';
      const hasSufficientCandles = Boolean(c && c.candles && c.candles.length >= 10);

      if (isStale) {
        opp.readiness = 'STALE';
      } else if (!hasSufficientCandles) {
        opp.readiness = 'PARTIAL';
        opp.isDataLimited = true;
      } else {
        opp.readiness = 'READY';
      }
    }
  }

  // Market-hours-aware ranking:
  // Tier 0 (Active Open) > Tier 1 (Closed with valid analysis) > Tier 2 (Data limited/offline)
  // Within each tier: opportunityScore desc, then aiConfidence desc.
  radar.rankedOpportunities.sort(compareRadarOpportunities);

  // Re-assign ranks 1..N based on final sorted order
  radar.rankedOpportunities.forEach((item, index) => {
    item.rank = index + 1;
  });

  // Ensure topOpportunity cannot be an unavailable asset (like GER40)
  if (radar.topOpportunity && (!availableSet.has(radar.topOpportunity.symbol) || radar.topOpportunity.symbol === 'GER40')) {
    radar.topOpportunity = radar.rankedOpportunities.find(o => availableSet.has(o.symbol) && o.symbol !== 'GER40' && o.opportunityScore > 0) || null;
  }

  return radar;
}
