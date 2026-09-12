/**
 * Shared Agent Blackboard (Shared Intelligence Memory Context)
 * Agents publish structured observations here and read other agents' analyses.
 */

export interface SharedMarketContext {
  timestamp: string;
  selectedSymbol: string;
  assetPrice: number;
  xauusdPrice?: number; // backwards compatibility
  bid: number;
  ask: number;
  spread: number;
  marketRegime: string;
  session: string;
  dxyState: {
    price: number;
    trend: 'WEAKENING' | 'STRENGTHENING' | 'NEUTRAL';
    change: number;
    correlationStatus: string;
    divergenceToGold?: 'CONFIRMED' | 'DIVERGENT' | 'NORMAL';
  };
  yieldState: {
    us10y: number;
    trend: 'FALLING' | 'RISING' | 'FLAT';
    change: number;
    macroBias: string;
    realYieldBias?: 'BULLISH_GOLD' | 'BEARISH_GOLD' | 'NEUTRAL';
  };
  eventRisk: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    nextEvent: string;
    countdown: string;
    lockoutActive: boolean;
  };
  agentBiases: Record<string, {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' | 'RESTRICTED';
    confidence: number;
    score: number; // -1.0 to +1.0
    lastObservation: string;
    evidence: string[];
    updatedAt: string;
  }>;
  consensusScore: number; // e.g. 74%
  directionalVerdict: 'BUY SETUP' | 'SELL SETUP' | 'WATCH BUY' | 'WATCH SELL' | 'WAIT' | 'NO TRADE';
  activeDisagreements: string[];
  invalidationLevel: number;
}

export const INITIAL_BLACKBOARD_STATE: SharedMarketContext = {
  timestamp: '18:15:00',
  selectedSymbol: 'XAUUSD',
  assetPrice: 4349.70,
  xauusdPrice: 4349.70,
  bid: 4349.52,
  ask: 4349.88,
  spread: 0.36,
  marketRegime: 'Bullish Expansion (H1 FVG Retest)',
  session: 'London / NY Overlap',
  dxyState: {
    price: 104.18,
    trend: 'WEAKENING',
    change: -0.36,
    correlationStatus: 'Softening USD provides tailwind to non-dollar and commodity assets',
    divergenceToGold: 'CONFIRMED'
  },
  yieldState: {
    us10y: 4.214,
    trend: 'FALLING',
    change: -1.40,
    macroBias: 'Falling real yields soften rate-sensitive assets',
    realYieldBias: 'BULLISH_GOLD'
  },
  eventRisk: {
    level: 'HIGH',
    nextEvent: 'Core PCE Price Index (MoM)',
    countdown: 'T - 1h 45m',
    lockoutActive: false
  },
  agentBiases: {
    Technical: {
      bias: 'BULLISH',
      confidence: 84,
      score: 0.82,
      lastObservation: 'M15 sell-side liquidity swept at 4341.20; confirmed bullish CHOCH with H1 demand displacement.',
      evidence: ['Asian low sweep', 'M15 CHOCH at 4348.50', 'Unmitigated FVG retest at 4346.00'],
      updatedAt: '18:14:48'
    },
    Macro: {
      bias: 'BULLISH',
      confidence: 76,
      score: 0.61,
      lastObservation: 'US 10Y yield sliding to 4.214% (-1.40%); softening real yields favor precious metals.',
      evidence: ['US10Y broke session support', 'Fed cut odds steady at 72%'],
      updatedAt: '18:14:50'
    },
    Correlation: {
      bias: 'BULLISH',
      confidence: 81,
      score: 0.77,
      lastObservation: 'DXY rejected 104.40 resistance; Silver (XAGUSD) outperforming at +1.28% (SMT confirmation).',
      evidence: ['DXY -0.36%', 'Silver SMT relative strength', 'USDJPY failing 154.50'],
      updatedAt: '18:14:52'
    },
    Institutional: {
      bias: 'BULLISH',
      confidence: 79,
      score: 0.43,
      lastObservation: 'SPDR Gold Trust ETF logged +3.2 tonnes net institutional accumulation; commercial hedging neutral.',
      evidence: ['2nd day net ETF inflows', 'Delta absorption at 4345.20 support'],
      updatedAt: '18:14:54'
    },
    News: {
      bias: 'NEUTRAL',
      confidence: 68,
      score: -0.10,
      lastObservation: 'Wire flow subdued ahead of Tier-1 US PCE data. Moderate headlines indicate quiet positioning.',
      evidence: ['No unscheduled macro leaks', 'Pre-data wait-and-see sentiment'],
      updatedAt: '18:14:55'
    },
    Geopolitical: {
      bias: 'BULLISH',
      confidence: 74,
      score: 0.38,
      lastObservation: 'Persistent maritime risk in Red Sea maintaining a structural floor under safe-haven commodities.',
      evidence: ['Shipping route deviations', 'BRICS settlement de-dollarization theme'],
      updatedAt: '18:14:56'
    },
    Sentiment: {
      bias: 'NEUTRAL',
      confidence: 65,
      score: -0.32,
      lastObservation: 'Retail positioning long cooled to 56% (fade risk reduced). Fear & Greed index stable at 52.',
      evidence: ['Retail longs down from 68%', 'Options call skew intact above 4370'],
      updatedAt: '18:14:57'
    },
    'Risk Guardian': {
      bias: 'RESTRICTED',
      confidence: 88,
      score: 0.00,
      lastObservation: 'Valid structural setup, but Core PCE event in 105 mins mandates max trade risk cap at 0.50%.',
      evidence: ['Spread 36¢ (Normal)', 'ATR 14.8 (Elevated)', 'Event proximity discount applied'],
      updatedAt: '18:14:58'
    },
    'Chart Vision': {
      bias: 'BULLISH',
      confidence: 82,
      score: 0.75,
      lastObservation: 'Visual inspection confirms H1 Order Block reaction with lower wick rejections in discount zone.',
      evidence: ['Order Block respected at 4346.00', 'Clean FVG on M15', 'No bearish divergence on RSI'],
      updatedAt: '18:14:59'
    },
    'Opportunity Sniper': {
      bias: 'BULLISH',
      confidence: 88,
      score: 0.85,
      lastObservation: 'A+ ICT confluence formed: Asian low sweep + M15 CHOCH + FVG discount retest. 1-Click order ticket prepared.',
      evidence: ['R:R 1:2.85 confirmed', 'Volatility SL at 4,343.80', 'Optimal lot size: 0.50 lots ($512 risk)'],
      updatedAt: '18:15:00'
    },
    "Devil's Advocate": {
      bias: 'CAUTION',
      confidence: 78,
      score: -0.20,
      lastObservation: 'Stress test warning: Upcoming Core PCE in 105 mins could cause whip-saw spread expansion before continuation.',
      evidence: ['Event trap probability: 22%', 'Immediate overhead H4 supply at 4,368.00'],
      updatedAt: '18:15:01'
    },
    'Session Killzone': {
      bias: 'BULLISH',
      confidence: 85,
      score: 0.80,
      lastObservation: 'London/NY Overlap Killzone active (Peak institutional liquidity window). Favorable execution timing.',
      evidence: ['Volume index at 142% of 30-day baseline', 'Spread compressed to 36¢'],
      updatedAt: '18:15:02'
    }
  },
  consensusScore: 74,
  directionalVerdict: 'WATCH BUY',
  activeDisagreements: [
    'Risk Guardian restricting trade size due to upcoming PCE release',
    "Devil's Advocate notes potential pre-PCE liquidity trap at 4,341"
  ],
  invalidationLevel: 4343.80
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
  agentList: { name: string; bias: any; confidence: number; lastOpinion: string; evidence: string[] }[]
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

  return {
    timestamp: new Date().toTimeString().split(' ')[0],
    selectedSymbol: symbol,
    assetPrice: price,
    xauusdPrice: isMetal && symbol === 'XAUUSD' ? price : undefined,
    bid: Number((price - spread / 2).toFixed(symbol.includes('JPY') ? 2 : isForex ? 4 : 2)),
    ask: Number((price + spread / 2).toFixed(symbol.includes('JPY') ? 2 : isForex ? 4 : 2)),
    spread,
    marketRegime: regime,
    session,
    dxyState: {
      price: 104.18,
      trend: 'WEAKENING',
      change: -0.36,
      correlationStatus: dxyStatus,
      divergenceToGold: isMetal ? 'CONFIRMED' : undefined
    },
    yieldState: {
      us10y: 4.214,
      trend: 'FALLING',
      change: -1.40,
      macroBias,
      realYieldBias: isMetal ? 'BULLISH_GOLD' : undefined
    },
    eventRisk: {
      level: 'HIGH',
      nextEvent: 'Core PCE Price Index (MoM)',
      countdown: 'T - 1h 45m',
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

