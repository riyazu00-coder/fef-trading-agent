export interface SynapseNode {
  id: string;
  category: 'PRICE' | 'MACRO' | 'TECHNICAL' | 'CORRELATION' | 'INSTITUTIONAL' | 'NEWS' | 'GEOPOLITICAL' | 'RISK' | 'SENTIMENT';
  title: string;
  detail: string;
  value: string | number;
  agent: string;
  source: string;
  timestamp: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION';
  confidence: number;
  theta: number; // spherical angle
  phi: number;   // spherical elevation
  radius: number;
  color: string;
  size: number;
  isNew?: boolean;
}

export const BASE_SYNAPSE_NODES: SynapseNode[] = [
  {
    id: 'syn-1',
    category: 'PRICE',
    title: 'XAUUSD Live Spot Tick',
    detail: 'Stooq Real-Time Data Stream: 18¢ tight spread, volume surging on London overlap',
    value: '$2,345.82',
    agent: 'Technical Agent',
    source: 'Stooq / Public Live Stream',
    timestamp: '18:25:12',
    bias: 'BULLISH',
    confidence: 92,
    theta: 0.45,
    phi: 0.22,
    radius: 175,
    color: '#38bdf8',
    size: 4.5
  },
  {
    id: 'syn-2',
    category: 'MACRO',
    title: 'US 10-Year Treasury Yield',
    detail: 'Yield falling -1.40% to 4.214%; softening real rates lower gold opportunity cost',
    value: '4.214%',
    agent: 'Macro Agent',
    source: 'US Treasury / FRED',
    timestamp: '18:25:14',
    bias: 'BULLISH',
    confidence: 86,
    theta: 1.25,
    phi: -0.45,
    radius: 180,
    color: '#00f0ff',
    size: 5.0
  },
  {
    id: 'syn-3',
    category: 'TECHNICAL',
    title: 'M15 Bullish CHOCH Displacement',
    detail: 'Price swept sell-side liquidity at 2,341.20 and aggressively broke structure upwards',
    value: 'CHOCH @ 2,345.50',
    agent: 'Technical Agent',
    source: 'SMC Price Engine',
    timestamp: '18:25:16',
    bias: 'BULLISH',
    confidence: 89,
    theta: 2.10,
    phi: 0.65,
    radius: 170,
    color: '#ffffff',
    size: 5.5
  },
  {
    id: 'syn-4',
    category: 'CORRELATION',
    title: 'DXY Dollar Index Rejection',
    detail: 'US Dollar rejected 104.40 session resistance ceiling (-0.36% intraday drop)',
    value: '104.18 (-0.36%)',
    agent: 'Correlation Agent',
    source: 'Yahoo Finance Free',
    timestamp: '18:25:18',
    bias: 'BULLISH',
    confidence: 84,
    theta: 2.85,
    phi: -0.15,
    radius: 175,
    color: '#38bdf8',
    size: 4.8
  },
  {
    id: 'syn-5',
    category: 'CORRELATION',
    title: 'Silver SMT Relative Strength',
    detail: 'XAGUSD leading the precious metals complex (+1.42%), validating strong bullion demand',
    value: '$29.84 (+1.42%)',
    agent: 'Correlation Agent',
    source: 'Stooq Free',
    timestamp: '18:25:20',
    bias: 'BULLISH',
    confidence: 88,
    theta: 3.60,
    phi: 0.35,
    radius: 172,
    color: '#ffffff',
    size: 5.2
  },
  {
    id: 'syn-6',
    category: 'TECHNICAL',
    title: 'Demand Fair Value Gap Retest',
    detail: 'H1 bullish FVG unmitigated zone holding firm between 2,343.80 and 2,345.00',
    value: '2,344.00 FVG',
    agent: 'Technical Agent',
    source: 'ICT Pattern Engine',
    timestamp: '18:25:22',
    bias: 'BULLISH',
    confidence: 85,
    theta: 4.30,
    phi: -0.55,
    radius: 178,
    color: '#00f0ff',
    size: 4.5
  },
  {
    id: 'syn-7',
    category: 'INSTITUTIONAL',
    title: 'ETF Net Physical Inflows',
    detail: 'SPDR Gold Trust (GLD) logged +3.2 tonnes institutional accumulation',
    value: '+3.2 tonnes',
    agent: 'Institutional Agent',
    source: 'SPDR / World Gold Council',
    timestamp: '18:25:24',
    bias: 'BULLISH',
    confidence: 82,
    theta: 5.10,
    phi: 0.15,
    radius: 175,
    color: '#ffffff',
    size: 5.0
  },
  {
    id: 'syn-8',
    category: 'INSTITUTIONAL',
    title: 'Order Flow Delta Absorption',
    detail: '+840 lots net passive buy limit orders absorbed sellers at 2,344.20 demand zone',
    value: '+840 Lots Absorbed',
    agent: 'Institutional Agent',
    source: 'Order Flow Depth',
    timestamp: '18:25:26',
    bias: 'BULLISH',
    confidence: 87,
    theta: 0.95,
    phi: 0.85,
    radius: 168,
    color: '#38bdf8',
    size: 4.8
  },
  {
    id: 'syn-9',
    category: 'RISK',
    title: 'Economic Calendar Telemetry',
    detail: 'Calendar feed: DATA LIMITED / UNAVAILABLE. Risk policy cap: 0.50% equity active.',
    value: 'DATA LIMITED',
    agent: 'Risk Guardian',
    source: 'Economic Calendar Service',
    timestamp: '18:25:28',
    bias: 'CAUTION',
    confidence: 90,
    theta: 1.85,
    phi: -0.75,
    radius: 182,
    color: '#fbbf24',
    size: 5.4
  },
  {
    id: 'syn-10',
    category: 'GEOPOLITICAL',
    title: 'Red Sea Shipping Risk Premium',
    detail: 'Maritime route deviations remain elevated, maintaining safe-haven baseline floor',
    value: 'Elevated Risk Index',
    agent: 'Geopolitical Agent',
    source: 'Global Maritime Intel',
    timestamp: '18:25:30',
    bias: 'BULLISH',
    confidence: 76,
    theta: 3.15,
    phi: 0.70,
    radius: 174,
    color: '#38bdf8',
    size: 4.2
  },
  {
    id: 'syn-11',
    category: 'SENTIMENT',
    title: 'Retail Positioning Long Ratio',
    detail: 'Retail trader long bias cooled to 56% (fading risk dropped from extreme 68%)',
    value: '56% Long (Neutral)',
    agent: 'Sentiment Agent',
    source: 'Broker Sentiment Feed',
    timestamp: '18:25:32',
    bias: 'NEUTRAL',
    confidence: 68,
    theta: 4.75,
    phi: -0.30,
    radius: 176,
    color: '#94a3b8',
    size: 4.0
  },
  {
    id: 'syn-12',
    category: 'NEWS',
    title: 'ECB Monetary Policy Remarks',
    detail: 'ECB officials signal caution on aggressive rate cuts, supporting EUR and pressuring USD',
    value: 'Subdued Wire',
    agent: 'News Agent',
    source: 'Reuters Financial RSS',
    timestamp: '18:25:34',
    bias: 'BULLISH',
    confidence: 72,
    theta: 5.80,
    phi: 0.40,
    radius: 170,
    color: '#00f0ff',
    size: 4.2
  }
];

export const INCOMING_DATA_POOL: Omit<SynapseNode, 'id' | 'theta' | 'phi' | 'radius'>[] = [
  {
    category: 'PRICE',
    title: 'XAUUSD Sub-Pip Tick Ingested',
    detail: 'Aggressive buy order lifted ask to $2,346.10 with zero slippage',
    value: '$2,346.10',
    agent: 'Technical Agent',
    source: 'Stooq Live Stream',
    timestamp: '',
    bias: 'BULLISH',
    confidence: 94,
    color: '#ffffff',
    size: 5.5
  },
  {
    category: 'MACRO',
    title: 'US 2-Year Yield Micro-Decline',
    detail: 'US02Y short-end yield slips -0.85% to 4.462%, confirming broad curve softening',
    value: '4.462%',
    agent: 'Macro Agent',
    source: 'US Treasury Feed',
    timestamp: '',
    bias: 'BULLISH',
    confidence: 82,
    color: '#00f0ff',
    size: 4.8
  },
  {
    category: 'TECHNICAL',
    title: 'M5 Bullish Order Block Reaction',
    detail: 'Price tested upper boundary of discount demand order block and closed with rejection wick',
    value: 'OB Defended @ 2,344.50',
    agent: 'Technical Agent',
    source: 'SMC Price Engine',
    timestamp: '',
    bias: 'BULLISH',
    confidence: 91,
    color: '#38bdf8',
    size: 5.2
  },
  {
    category: 'INSTITUTIONAL',
    title: 'COMEX Non-Commercial Spec Positions',
    detail: 'Weekly speculative net long positioning expanded by +4,200 futures contracts',
    value: '+4,200 Contracts',
    agent: 'Institutional Agent',
    source: 'CFTC COT Report',
    timestamp: '',
    bias: 'BULLISH',
    confidence: 85,
    color: '#ffffff',
    size: 5.0
  },
  {
    category: 'CORRELATION',
    title: 'USDJPY Psychological Level Breakdown',
    detail: 'USDJPY broke below 156.20 support as Dollar weakness accelerates',
    value: '156.12 (-0.42%)',
    agent: 'Correlation Agent',
    source: 'Public FX Feed',
    timestamp: '',
    bias: 'BULLISH',
    confidence: 80,
    color: '#38bdf8',
    size: 4.6
  },
  {
    category: 'RISK',
    title: 'Real-Time Volatility ATR Calculation',
    detail: 'Average True Range (14) measured at 7.80 points; volatility stop loss calibrated to $2,339.80',
    value: 'ATR 7.80',
    agent: 'Risk Guardian',
    source: 'Risk Engine',
    timestamp: '',
    bias: 'CAUTION',
    confidence: 93,
    color: '#fbbf24',
    size: 5.3
  }
];
