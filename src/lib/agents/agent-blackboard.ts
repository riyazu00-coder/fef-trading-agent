import { evaluateMarketSession, MarketSessionState } from '../session/market-session-engine';

/**
 * Shared Agent Blackboard (Shared Intelligence Memory Context)
 * Agents publish structured observations here and read other agents' analyses.
 */

export interface SharedMarketContext {
  timestamp: string;
  selectedSymbol: string;
  assetPrice: number | null;
  xauusdPrice?: number | null; // backwards compatibility
  bid: number | null;
  ask: number | null;
  spread: number | null;
  marketRegime: string;
  session: string;
  marketSession?: {
    marketState: string;
    sessionName: string;
    tradeExecutable: boolean;
    nextOpenCountdown?: string | null;
    nextCloseCountdown?: string | null;
    statusLabel: string;
    scheduleSource: string;
  };
  dxyState: {
    price?: number | null;
    trend: 'WEAKENING' | 'STRENGTHENING' | 'NEUTRAL' | 'DATA LIMITED';
    change?: number | null;
    correlationStatus: string;
    divergenceToGold?: 'CONFIRMED' | 'DIVERGENT' | 'NORMAL' | 'DATA LIMITED';
  };
  yieldState: {
    us10y?: number | null;
    trend: 'FALLING' | 'RISING' | 'FLAT' | 'DATA LIMITED';
    change?: number | null;
    macroBias: string;
    realYieldBias?: 'BULLISH_GOLD' | 'BEARISH_GOLD' | 'NEUTRAL' | 'DATA LIMITED';
  };
  eventRisk: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'DATA LIMITED' | 'UNKNOWN';
    nextEvent: string;
    countdown: string;
    lockoutActive: boolean;
  };
  agentBiases: Record<string, {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' | 'RESTRICTED' | 'DATA LIMITED';
    confidence: number;
    score: number; // -1.0 to +1.0
    lastObservation: string;
    evidence: string[];
    updatedAt: string;
  }>;
  consensusScore: number; // e.g. 0%
  directionalVerdict: 'BUY SETUP' | 'SELL SETUP' | 'WATCH BUY' | 'WATCH SELL' | 'WAIT' | 'NO TRADE';
  activeDisagreements: string[];
  invalidationLevel?: number;
}

export const INITIAL_BLACKBOARD_STATE: SharedMarketContext = {
  timestamp: '--:--:--',
  selectedSymbol: 'STANDBY',
  assetPrice: null,
  xauusdPrice: null,
  bid: null,
  ask: null,
  spread: null,
  marketRegime: 'Awaiting market data feed',
  session: 'STANDBY',
  marketSession: {
    marketState: 'CLOSED',
    sessionName: 'STANDBY',
    tradeExecutable: false,
    nextOpenCountdown: null,
    nextCloseCountdown: null,
    statusLabel: 'CLOSED',
    scheduleSource: 'BOOTSTRAP'
  },
  dxyState: {
    price: null,
    trend: 'DATA LIMITED',
    change: null,
    correlationStatus: 'DXY correlation feed uninitialized',
    divergenceToGold: 'DATA LIMITED'
  },
  yieldState: {
    us10y: null,
    trend: 'DATA LIMITED',
    change: null,
    macroBias: 'Treasury yield feed uninitialized',
    realYieldBias: 'DATA LIMITED'
  },
  eventRisk: {
    level: 'DATA LIMITED',
    nextEvent: 'Economic calendar unavailable',
    countdown: 'DATA LIMITED',
    lockoutActive: false
  },
  agentBiases: {},
  consensusScore: 0,
  directionalVerdict: 'WAIT',
  activeDisagreements: [],
  invalidationLevel: undefined
};

/**
 * Dynamically construct a shared intelligence blackboard for ANY instrument
 * ensuring zero residual gold context on non-metal instruments.
 */
export function createSharedBlackboardForAsset(
  symbol: string,
  price: number,
  spread: number,
  change24h: number,
  category: string,
  regime: string,
  session: string,
  consensusScore: number,
  directionalVerdict: 'BUY SETUP' | 'SELL SETUP' | 'WATCH BUY' | 'WATCH SELL' | 'WAIT' | 'NO TRADE',
  invalidation: number,
  agentList: { name: string; bias: any; confidence: number; lastOpinion: string; evidence: string[] }[],
  verifiedMacroContext?: {
    dxy?: { price: number; change: number; trend: 'WEAKENING' | 'STRENGTHENING' | 'NEUTRAL'; divergenceToGold?: 'CONFIRMED' | 'DIVERGENT' | 'NORMAL' };
    yields?: { us10y: number; change: number; trend: 'FALLING' | 'RISING' | 'FLAT'; realYieldBias?: 'BULLISH_GOLD' | 'BEARISH_GOLD' | 'NEUTRAL' };
  }
): SharedMarketContext {
  const isMetal = category === 'METALS';
  const isForex = category === 'FOREX';
  const isCrypto = category === 'CRYPTO';
  const isIndex = category === 'INDICES';

  const dxyStatus = isForex
    ? 'Direct dollar exchange cross sensitivity active'
    : isMetal
    ? 'Inverse correlation with precious metals reserve demand'
    : isIndex
    ? 'Liquidity condition tracking equity beta'
    : 'Macro liquidity context';

  const macroBias = isCrypto
    ? 'Global risk liquidity and real yields guide spot capital flows'
    : isIndex
    ? 'Earnings discount rate tied to US 10-year benchmark yield'
    : isForex
    ? 'Transatlantic yield spreads define carry momentum'
    : 'Real yield cost of carry guides sovereign reserves';

  const agentBiases: SharedMarketContext['agentBiases'] = {};
  for (const a of agentList) {
    agentBiases[a.name] = {
      bias: a.bias,
      confidence: a.confidence,
      score: a.bias === 'BULLISH' ? 0.8 : a.bias === 'BEARISH' ? -0.8 : 0.0,
      lastObservation: a.lastOpinion,
      evidence: a.evidence,
      updatedAt: new Date().toTimeString().split(' ')[0]
    };
  }

  const sessionInfo = evaluateMarketSession(symbol, new Date());

  // Ground DXY & Yields only in verified upstream telemetry, never fabricated defaults
  const dxyPrice = verifiedMacroContext?.dxy?.price ?? null;
  const dxyChange = verifiedMacroContext?.dxy?.change ?? null;
  const dxyTrend = verifiedMacroContext?.dxy?.trend ?? 'DATA LIMITED';
  const dxyDivergence = verifiedMacroContext?.dxy?.divergenceToGold ?? (isMetal && verifiedMacroContext?.dxy ? 'NORMAL' : 'DATA LIMITED');

  const us10yPrice = verifiedMacroContext?.yields?.us10y ?? null;
  const us10yChange = verifiedMacroContext?.yields?.change ?? null;
  const us10yTrend = verifiedMacroContext?.yields?.trend ?? 'DATA LIMITED';
  const realYieldBias = verifiedMacroContext?.yields?.realYieldBias ?? (isMetal && verifiedMacroContext?.yields ? 'NEUTRAL' : 'DATA LIMITED');

  return {
    timestamp: new Date().toTimeString().split(' ')[0],
    selectedSymbol: symbol,
    assetPrice: price,
    xauusdPrice: isMetal && symbol === 'XAUUSD' ? price : undefined,
    bid: Number((price - spread / 2).toFixed(symbol.includes('JPY') ? 2 : isForex ? 4 : 2)),
    ask: Number((price + spread / 2).toFixed(symbol.includes('JPY') ? 2 : isForex ? 4 : 2)),
    spread,
    marketRegime: regime,
    session: sessionInfo.sessionName || session,
    marketSession: {
      marketState: sessionInfo.marketState,
      sessionName: sessionInfo.sessionName,
      tradeExecutable: sessionInfo.tradeExecutable,
      nextOpenCountdown: sessionInfo.nextOpenCountdown,
      nextCloseCountdown: sessionInfo.nextCloseCountdown,
      statusLabel: sessionInfo.statusLabel,
      scheduleSource: sessionInfo.scheduleSource
    },
    dxyState: {
      price: dxyPrice,
      trend: dxyTrend,
      change: dxyChange,
      correlationStatus: dxyStatus,
      divergenceToGold: dxyDivergence
    },
    yieldState: {
      us10y: us10yPrice,
      trend: us10yTrend,
      change: us10yChange,
      macroBias,
      realYieldBias
    },
    eventRisk: {
      level: 'DATA LIMITED',
      nextEvent: 'Economic calendar unavailable',
      countdown: 'DATA LIMITED',
      lockoutActive: false
    },
    agentBiases,
    consensusScore,
    directionalVerdict,
    activeDisagreements: [
      'Risk Guardian mandates conservative lot sizing pending macroeconomic prints'
    ],
    invalidationLevel: invalidation
  };
}

