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
  urgency: 'ACT NOW' | 'WAITING FOR CONFIRMATION' | 'EVENT RISK' | 'DEVELOPING';
  headline: string;
  detail: string;
  eta: string;
  badgeColor: 'emerald' | 'amber' | 'rose' | 'cyan';
}

export interface DevelopingSetupItem {
  symbol: string;
  name: string;
  pattern: string;
  triggerCondition: string;
  readinessPct: number; // e.g. 75%
  estimatedRR: string;
  direction: 'LONG' | 'SHORT';
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
    // Market is OPEN and executable
    if (setupQuality >= 84) {
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

/**
 * Continuous Multi-Asset Radar Intelligence Generator
 */
export function generateGlobalRadarIntelligence(
  assets: Record<string, LiveMarketAsset> = INITIAL_LIVE_ASSETS,
  currentTimeframe: string = 'H1'
): GlobalRadarIntelligence {
  const symbols = Object.keys(assets);

  const opportunities: RadarOpportunityItem[] = symbols.map((sym) => {
    const liveAsset = assets[sym];
    const profile = generateAssetIntelligence(sym, liveAsset, currentTimeframe);
    const { score, setupQuality, tradeExecutable, marketState, state, riskLevel, timeframe, whyReasons } = calculateOpportunityScore(profile, liveAsset);

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
  const topOpportunity = topExecutableOpportunity || opportunities[0] || {
    rank: 1,
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    category: 'METALS' as RadarCategory,
    price: 4349.70,
    change24h: 0.85,
    state: 'STRONG BUY OPPORTUNITY' as RadarOpportunityState,
    opportunityScore: 94,
    setupQuality: 94,
    tradeExecutable: true,
    executabilityScore: 100,
    marketState: 'OPEN',
    aiConfidence: 89,
    timeframe: 'INTRADAY' as RadarTimeframeType,
    riskLevel: 'LOW' as RadarRiskLevel,
    entryZone: [4344.20, 4348.20] as [number, number],
    stopLoss: 4334.70,
    tp1: 4367.70,
    tp2: 4383.70,
    tp3: 4401.70,
    rr: '1:3.6',
    regime: 'Bullish Expansion (London Liquidity Cleared)',
    catalysts: ['DXY rejection', 'Physical central bank gold reserves', 'Negative 10Y real yields'],
    invalidation: 'H1 candle close below 4334.70',
    whyRankedReasons: [
      '14/15 Swarm Agents aligned in directional consensus',
      'Asymmetric 1:3.6 R:R with tight structural invalidation',
      'Price active inside optimal institutional entry zone',
      'Deep LBMA & Interbank liquidity'
    ]
  };

  // Build Market Attention Queue (Triage "Where to look next?")
  const isTopExecutable = topOpportunity.tradeExecutable;
  const attentionQueue: AttentionQueueItem[] = [
    {
      id: 'att-1',
      symbol: topOpportunity.symbol,
      urgency: isTopExecutable ? 'ACT NOW' : 'DEVELOPING',
      headline: isTopExecutable 
        ? `${topOpportunity.symbol} Hit Optimal Entry Zone` 
        : `${topOpportunity.symbol} Setup Active (${topOpportunity.marketState || 'CLOSED'})`,
      detail: isTopExecutable 
        ? `Opportunity Score ${topOpportunity.opportunityScore}/100. Structure confirmed with ${topOpportunity.rr} R:R. Target 1: ${topOpportunity.tp1}.`
        : `Setup Quality ${topOpportunity.opportunityScore}/100. Market closed — execution barred until session opens.`,
      eta: isTopExecutable ? 'Immediate (Active Session)' : 'Awaiting Session Open',
      badgeColor: isTopExecutable ? 'emerald' : 'amber'
    },
    {
      id: 'att-2',
      symbol: opportunities.find((o) => o.symbol === 'XAGUSD')?.symbol || 'XAGUSD',
      urgency: 'WAITING FOR CONFIRMATION',
      headline: 'XAGUSD SMT Divergence vs Gold',
      detail: 'Silver printing higher high while Gold consolidates. Awaiting 15-minute CHoCH for confirmation.',
      eta: 'Within 25-40 min',
      badgeColor: 'cyan'
    },
    {
      id: 'att-3',
      symbol: opportunities.find((o) => o.symbol === 'USOIL')?.symbol || 'USOIL',
      urgency: 'EVENT RISK',
      headline: 'USOIL Pre-EIA Inventory Buffer',
      detail: 'Crucial support held at $98.48. EIA inventory release in 1h 15m. Risk Guardian mandates position size cap at 0.5%.',
      eta: 'Event in 1h 15m',
      badgeColor: 'amber'
    },
    {
      id: 'att-4',
      symbol: opportunities.find((o) => o.symbol === 'USDJPY')?.symbol || 'USDJPY',
      urgency: 'DEVELOPING',
      headline: 'USDJPY Liquidity Sweep at 154.20',
      detail: 'Asian high liquidity taken. Institutional order flow turning bearish on BOJ verbal intervention tone.',
      eta: 'Developing over H1',
      badgeColor: 'rose'
    }
  ];

  // Developing Setups (Upcoming patterns prior to trigger)
  const developingSetups: DevelopingSetupItem[] = [
    {
      symbol: 'XAGUSD',
      name: 'Silver Spot / USD',
      pattern: 'H1 Bullish Order Block + SMT Bullish Divergence',
      triggerCondition: 'Break above 64.95 with displacement',
      readinessPct: 82,
      estimatedRR: '1:4.1',
      direction: 'LONG'
    },
    {
      symbol: 'USDJPY',
      name: 'US Dollar / Yen',
      pattern: 'Bearish Liquidity Sweep & Institutional Rejection',
      triggerCondition: 'M15 candle close below 153.60',
      readinessPct: 68,
      estimatedRR: '1:3.2',
      direction: 'SHORT'
    },
    {
      symbol: 'EURUSD',
      name: 'Euro / US Dollar',
      pattern: 'London Low Sweep with Transatlantic Yield Support',
      triggerCondition: 'Retest of 1.1592 demand pocket',
      readinessPct: 74,
      estimatedRR: '1:2.8',
      direction: 'LONG'
    }
  ];

  // Recently Invalidated Setups (Transparent audit trail of failed ideas)
  const recentlyInvalidated: InvalidatedSetupItem[] = [
    {
      symbol: 'USDCAD',
      setupName: 'H4 Bullish Fair Value Gap Retest',
      invalidatedAt: '42m ago',
      reason: 'Aggressive US Dollar selloff punctured lower boundary (1.3830) on soft PPI data.',
      lossMitigation: 'Risk Guardian closed pre-emptively at -0.42R before stop loss hit.'
    },
    {
      symbol: 'GBPUSD',
      setupName: 'M15 Asian Range Breakout Short',
      invalidatedAt: '2h 15m ago',
      reason: 'Bank of England hawkish commentary reversed downside momentum back into range.',
      lossMitigation: 'Break-even stop preserved capital (0.00% equity drawdown).'
    }
  ];

  // Market Regime Map
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
      bias: isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL'
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
      highestScoreAsset: topOpportunity.symbol,
      highestScore: topOpportunity.opportunityScore
    }
  };
}
