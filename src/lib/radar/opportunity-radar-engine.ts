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
import { MarketCategory } from '../registry/market-registry';
import { OHLCCandle } from '../market/canonical-market-snapshot';
import { EvidenceClassification } from '../evidence/agent-evidence';

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
  | 'WAIT (MARKET CLOSED)';

export type RadarTimeframeType = 'SCALPING' | 'INTRADAY' | 'SWING';
export type RadarRiskLevel = 'LOW' | 'MEDIUM' | 'ELEVATED' | 'HIGH';
export type RadarCategory = MarketCategory | 'COMMODITY';

export interface RadarOpportunityItem {
  rank: number;
  symbol: string;
  name: string;
  category: RadarCategory;
  price: number;
  change24h: number;
  state: RadarOpportunityState;
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
  topOpportunity: RadarOpportunityItem;
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

  // 5. Event Risk / Shock Filter Penalty (up to 10 pts)
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

  // Clamp score strictly to 0 - 100 (Setup Quality)
  const setupQuality = Math.max(10, Math.min(99, Math.round(score)));

  // Derive Radar Opportunity State & Session Executability
  const isBullishDominant = bullishAgents > bearishAgents;
  let state: RadarOpportunityState = 'WAIT';

  const isSessionExecutable = profile.tradeExecutable ?? (profile.sessionState ? profile.sessionState.tradeExecutable : true);
  const sessionState = profile.sessionState;
  const marketState = sessionState?.marketState || (isSessionExecutable ? 'OPEN' : 'CLOSED');

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
    // If the swarm profile has an established setup direction, adhere to it without flapping
    if (profile.setupDirection === 'WATCH FOR BUY' || profile.setupDirection === 'BUY OPPORTUNITY') {
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
    } else if (profile.setupDirection === 'WATCH FOR SELL' || profile.setupDirection === 'SELL OPPORTUNITY') {
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
    } else if (setupQuality >= 84) {
      state = isBullishDominant ? 'STRONG BUY OPPORTUNITY' : 'STRONG SELL OPPORTUNITY';
      riskLevel = 'LOW';
    } else if (setupQuality >= 72) {
      state = isBullishDominant ? 'BUY OPPORTUNITY' : 'SELL OPPORTUNITY';
      if (riskLevel !== 'ELEVATED') riskLevel = 'LOW';
    } else if (setupQuality >= 58) {
      state = isBullishDominant ? 'WATCH FOR BUY' : 'WATCH FOR SELL';
      riskLevel = 'MEDIUM';
    } else if (setupQuality < 40) {
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

  return {
    score: setupQuality,
    setupQuality,
    tradeExecutable: isSessionExecutable,
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
  multiAssetCandles?: Record<string, SymbolCandleFeed>
): GlobalRadarIntelligence {
  const symbols = Object.keys(assets);

  const opportunities: RadarOpportunityItem[] = symbols.map((sym) => {
    const liveAsset = assets[sym];
    const isMatched = activeCandles && activeCandles.symbol === sym && Array.isArray(activeCandles.candles) && activeCandles.candles.length >= 10;
    const multiFeed = multiAssetCandles && multiAssetCandles[sym];
    const hasMultiCandles = multiFeed && Array.isArray(multiFeed.candles) && multiFeed.candles.length >= 10;

    let profile: AssetIntelligenceProfile;
    if (isMatched) {
      const feedBundle = activeCandles.bundle || activeCandles.candles;
      profile = generateAssetIntelligence(sym, liveAsset, currentTimeframe, feedBundle, activeCandles.provenance, activeCandles.provider);
    } else if (hasMultiCandles) {
      const feedBundle = multiFeed.bundle || multiFeed.candles;
      profile = generateAssetIntelligence(sym, liveAsset, currentTimeframe, feedBundle, multiFeed.provenance, multiFeed.provider);
    } else {
      profile = generateAssetIntelligence(sym, liveAsset, currentTimeframe);
    }

    const { score, setupQuality, tradeExecutable, marketState, state, riskLevel, timeframe, whyReasons } = calculateOpportunityScore(profile, liveAsset);

    // Derive true execution readiness: session must be open AND actionabilityState must be ACTIONABLE
    // AND R:R must be >= 1.5. Do NOT let a poor-R:R open-market asset appear as EXECUTABLE 100%.
    const isSessionExec = tradeExecutable; // from calculateOpportunityScore (session only)
    const profileActionable = profile.actionabilityState === 'ACTIONABLE';
    const bpRrMatch = profile.rr?.match(/1:([0-9.]+)/);
    const bpRrVal = bpRrMatch ? parseFloat(bpRrMatch[1]) : 0;
    const isRrFavorable = !profile.rr || bpRrVal === 0 || bpRrVal >= 1.5;
    const isBlueprintReady = !profile.blueprint || profile.blueprint.state === 'EXECUTION READY';
    const trulyExecutable = isSessionExec && profileActionable && isRrFavorable && isBlueprintReady;

    // Executability score: 100 only when truly ready; scaled based on quality otherwise
    const execScore = trulyExecutable
      ? 100
      : isSessionExec && isRrFavorable && (profile.evidenceTrust ?? 0) >= 40
      ? Math.min(80, Math.round((profile.evidenceTrust ?? 0) * 0.8))
      : 0;

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
      tradeExecutable: trulyExecutable,
      executabilityScore: execScore,
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
      feedStatus: liveAsset.feedStatus,
      isDataLimited: liveAsset.feedStatus === 'DATA LIMITED' || liveAsset.feedStatus === 'DEMO' || liveAsset.feedStatus === 'OFFLINE'
    };
  });

  // Sort descending by Opportunity Score (Setup Quality), breaking ties with AI Confidence
  // Note: Closed assets CAN rank high for setup quality, but NEVER rank as best immediately executable trade
  opportunities.sort((a, b) => {
    if (b.opportunityScore !== a.opportunityScore) {
      return b.opportunityScore - a.opportunityScore;
    }
    return b.aiConfidence - a.aiConfidence;
  });

  // Assign sequential ranks based on setup quality
  opportunities.forEach((item, index) => {
    item.rank = index + 1;
  });

  // Requirement: Closed assets can rank for setup quality but NEVER rank as best immediately executable trade
  const topExecutableOpportunity = opportunities.find((o) => o.tradeExecutable);
  // Phase 2D: NO fallback fabricated object. If no executable opportunity exists, use best available or null.
  // This is the truthful equivalent: the system must report NO ACTIONABLE OPPORTUNITY rather than invent one.
  const topOpportunity = topExecutableOpportunity || opportunities[0] || null;

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
        ? `${topOpportunity.symbol} — Top Ranked Executable Opportunity`
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
      eta: opp.tradeExecutable ? 'Executable' : 'Session closed',
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

  // Phase 2D: Recently invalidated is always empty at startup.
  // Only real-time engine lifecycle updates populate this list.
  const recentlyInvalidated: InvalidatedSetupItem[] = [];

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

  opportunities.sort((a, b) => {
    if (b.opportunityScore !== a.opportunityScore) {
      return b.opportunityScore - a.opportunityScore;
    }
    return b.aiConfidence - a.aiConfidence;
  });

  opportunities.forEach((item, index) => {
    item.rank = index + 1;
  });

  return opportunities;
}
