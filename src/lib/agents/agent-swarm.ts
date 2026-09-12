import { AgentState, AgentDialogueMessage, TradeSetup, DecisionStatus } from './agent-types';

export const INITIAL_AGENTS: AgentState[] = [
  {
    type: 'TECHNICAL',
    name: 'Technical Agent',
    role: 'SMC, ICT, Market Structure & Price Action',
    bias: 'BULLISH',
    confidence: 84,
    status: 'DEBATING',
    lastOpinion: 'M15 sell-side liquidity swept at 4341.20, followed by bullish CHOCH and displacement into H1 FVG.',
    evidence: [
      'Asian session low swept during London open',
      'M15 Change of Character (CHOCH) confirmed at 4348.50',
      'Price currently retesting Fair Value Gap (4346.80 - 4349.00)'
    ],
    keyRisk: 'Immediate H4 resistance ceiling at 4368.00',
    invalidation: 'M15 body close below 4343.80'
  },
  {
    type: 'MACRO',
    name: 'Macro Agent',
    role: 'Central Bank Policy, Rates & Growth',
    bias: 'BULLISH',
    confidence: 76,
    status: 'ONLINE',
    lastOpinion: 'US 10-year Treasury yields slipping below 4.22%; softening real yields favor gold allocation.',
    evidence: [
      'US10Y yield down 6 bps to 4.21%',
      'Fed rate cut odds for next FOMC pricing at 72%',
      'Global central bank gold reserve purchases +14 tonnes this month'
    ],
    keyRisk: 'Upcoming Core PCE print in 1h 45m',
    invalidation: 'US10Y yield breaking above 4.35%'
  },
  {
    type: 'CORRELATION',
    name: 'Correlation Agent',
    role: 'DXY, Yields, Equities & Commodities',
    bias: 'BULLISH',
    confidence: 81,
    status: 'DEBATING',
    lastOpinion: 'Strong inverse divergence: DXY rejected 104.40 key resistance while XAUUSD formed higher low.',
    evidence: [
      'DXY -0.38% intraday breakdown',
      'Silver (XAGUSD) leading with +1.4% gain (SMT confirmation)',
      'USDJPY failing to maintain 156.20 psychological handle'
    ],
    keyRisk: 'Crude Oil volatility spike could trigger safe-haven USD bid',
    invalidation: 'DXY reclaim of 104.85'
  },
  {
    type: 'NEWS',
    name: 'News Agent',
    role: 'Live Wire Intelligence & Breaking Feeds',
    bias: 'NEUTRAL',
    confidence: 68,
    status: 'ONLINE',
    lastOpinion: 'Headline flow is moderate. No major breaking shocks, but markets are quiet ahead of tier-1 US releases.',
    evidence: [
      'Reuters: Middle East ceasefire diplomatic talks underway',
      'Bloomberg: Asian physical gold premiums stable in Shanghai',
      'Free RSS feed scanned 142 articles in last 60 mins'
    ],
    keyRisk: 'Surprise unscheduled geopolitical comments',
    invalidation: 'Sudden hawkish leak by Fed speakers'
  },
  {
    type: 'GEOPOLITICAL',
    name: 'Geopolitical Agent',
    role: 'Conflict, Sanctions & Safe-Haven Flows',
    bias: 'BULLISH',
    confidence: 74,
    status: 'ONLINE',
    lastOpinion: 'Persistent shipping security risks in Red Sea maintaining baseline geopolitical floor under precious metals.',
    evidence: [
      'Maritime insurance premiums remain at elevated tiers',
      'BRICS trade settlement discussions advancing de-dollarization theme'
    ],
    keyRisk: 'De-escalation accord announced during US session',
    invalidation: 'Normalised shipping routes and reduced defense risk premium'
  },
  {
    type: 'SENTIMENT',
    name: 'Sentiment Agent',
    role: 'Crowd Positioning & Fear vs Greed',
    bias: 'NEUTRAL',
    confidence: 65,
    status: 'ONLINE',
    lastOpinion: 'Retail sentiment is 56% long (slight fade candidate), while institutional futures show steady commercial accumulation.',
    evidence: [
      'Fear & Greed Index at 52 (Neutral equilibrium)',
      'Retail broker long/short ratio cooled down from 68% long',
      'Options skew reflects heavy call volume above 2360'
    ],
    keyRisk: 'Retail FOMO chasing breakouts prematurely',
    invalidation: 'Retail long position surges above 75%'
  },
  {
    type: 'INSTITUTIONAL',
    name: 'Institutional Agent',
    role: 'COT Reports, ETF Inflows & Smart Money Pools',
    bias: 'BULLISH',
    confidence: 79,
    status: 'DEBATING',
    lastOpinion: 'GLD & IAU gold ETFs recorded second consecutive day of net institutional fund inflows.',
    evidence: [
      'SPDR Gold Trust holdings increased by +3.2 tonnes',
      'COT non-commercial net spec positions increased +4,200 contracts',
      'Liquidity heatmaps show massive resting bid orders at 4335-4340'
    ],
    keyRisk: 'Commercial hedging pressure capping rallies near 4375',
    invalidation: 'Institutional block distribution above 4370'
  },
  {
    type: 'RISK',
    name: 'Risk Agent',
    role: 'Capital Preservation, Sizing & Lockouts',
    bias: 'CAUTION',
    confidence: 88,
    status: 'ALERT',
    lastOpinion: 'Valid technical pattern detected, BUT Core PCE event in 105 mins warrants reducing trade risk to 0.50% max.',
    evidence: [
      'ATR (14) on H1 is 14.80 points (elevated range)',
      'Spread currently 36 cents (acceptable condition)',
      'Daily max drawdown safety boundary is strictly respected (+0.8% today)'
    ],
    keyRisk: 'Holding open risk through high-impact economic release',
    invalidation: 'Spread expands beyond 65 cents or slippage anomaly'
  },
  {
    type: 'VISION',
    name: 'Vision / Chart Agent',
    role: 'Computer Vision & Visual Structure Recognition',
    bias: 'BULLISH',
    confidence: 82,
    status: 'ONLINE',
    lastOpinion: 'Visual inspection confirms cleanly formed H1 Order Block reacting with rejection wicks from demand.',
    evidence: [
      'Candle wick rejection identified at lower bounds',
      'No visual indicator divergence on RSI (54.2 neutral-bullish)',
      'Clean unmitigated Fair Value Gap marked on M15'
    ],
    keyRisk: 'Chart resolution blur or truncated right margin',
    invalidation: 'Reversal candle closing below visible swing low'
  },
  {
    type: 'SNIPER',
    name: 'Opportunity Sniper',
    role: 'Dynamic Lot Sizing & 3-Tier Take Profit Brackets',
    bias: 'BULLISH',
    confidence: 88,
    status: 'ONLINE',
    lastOpinion: 'Calculated 1:2.85 R:R bracket execution. Recommended 0.50% risk with TP1 (+1.5R), TP2 (+2.85R), and TP3 (+4.5R).',
    evidence: [
      'Dynamic lot size calibrated against $102,450 balance',
      'Volatility-adjusted stop loss based on ATR swing bounds',
      '1-Click MT5 execution bridge armed'
    ],
    keyRisk: 'Premature spread widening during session overlap',
    invalidation: 'Spread expands beyond 65 cents'
  },
  {
    type: 'DEVILS_ADVOCATE',
    name: "Devil's Advocate",
    role: 'Adversarial Stress-Testing & Trap Audit',
    bias: 'CAUTION',
    confidence: 84,
    status: 'ALERT',
    lastOpinion: 'Stress-test passed with resilience 78/100. Watch for inducement into session highs before true expansion.',
    evidence: [
      'Retail long crowd creeping toward 58% threshold',
      'Event blindsiding risk from approaching tier-1 release',
      '3 Worst-case failure scenarios modeled with strict SL guardrails'
    ],
    keyRisk: 'Macro release headline shock causing gap slippage',
    invalidation: '15-minute body close breaching structural stop'
  },
  {
    type: 'ORDER_FLOW',
    name: 'Order Flow Delta Agent',
    role: 'CVD, Volume Footprint & Passive Limit Absorption',
    bias: 'BULLISH',
    confidence: 86,
    status: 'DEBATING',
    lastOpinion: 'Cumulative Volume Delta (CVD) diverged bullishly at 4341.20; +1,240 contracts absorbed by passive limit bids.',
    evidence: [
      'Aggressive market sellers trapped into resting bid wall at 4341.00',
      'CVD slope turned positive on M5 with rising delta bars',
      'Bid-Ask imbalance shows 3.2:1 buyers defending 4346.50 VWAP'
    ],
    keyRisk: 'Large institutional sell icebergs at 4368.00 liquidity pool',
    invalidation: 'Sustained delta breakdown below -850 contracts'
  },
  {
    type: 'KILLZONE',
    name: 'Session Killzone Agent',
    role: 'ICT Session Timing, Judas Swings & Algorithmic Windows',
    bias: 'BULLISH',
    confidence: 85,
    status: 'DEBATING',
    lastOpinion: 'Active London/NY overlap killzone window. Classic Judas swing expansion completed; trend continuation phase underway.',
    evidence: [
      'Judas swing fakeout swept Asian low during 08:15 GMT window',
      'London close liquidity injection aligning with NY morning momentum',
      'Algorithmic IPDA time-of-day expansion active through 15:30 EST'
    ],
    keyRisk: 'Session transition liquidity vacuum between 11:30-12:00 EST',
    invalidation: 'Price failure to expand before session window closes'
  },
  {
    type: 'MTF_FRACTAL',
    name: 'MTF Fractal Matrix Agent',
    role: 'Multi-Timeframe Fractal Alignment (Daily / H4 / M15 / M5)',
    bias: 'BULLISH',
    confidence: 88,
    status: 'ONLINE',
    lastOpinion: 'Fractal hierarchy synchronized: Daily bullish expansion confirmed; H4 demand holding; M15 trigger aligned with M5 entry.',
    evidence: [
      'Daily trend: Bullish market structure with higher highs',
      'H4 structure: Retest of breaker block completed at 4338.00',
      'M15 & M5 fractals: Nested bullish order blocks triggering in unison'
    ],
    keyRisk: 'H4 supply mitigation at 4368.00 may trigger fractal pullback',
    invalidation: 'H1 candle close breaking below structural fractal low 4343.80'
  },
  {
    type: 'LIQUIDITY_MAP',
    name: 'Liquidity Heatmap Agent',
    role: 'Resting BSL/SSL Pools, Retail Stop Clusters & Liquidation Magnet',
    bias: 'BULLISH',
    confidence: 87,
    status: 'ALERT',
    lastOpinion: 'Massive Buy-Side Liquidity (BSL) cluster pool concentrated at 4358.50 - 4368.00 acting as a price magnet after Sell-Side Liquidity (SSL) flush.',
    evidence: [
      'Sell-side stops under 4342.00 completely wiped out in recent sweep',
      'Heatmap indicates $148M resting short stop-losses stacked at 4368.00',
      'Zero resting liquidity clusters remaining below 4340.00 support'
    ],
    keyRisk: 'Secondary liquidation sweep attempting to test 4338 before taking off',
    invalidation: 'Liquidity pool absorption failure and cascade below SSL threshold'
  }
];

export const INITIAL_DIALOGUE: AgentDialogueMessage[] = [
  {
    id: 'msg-1',
    timestamp: '17:28:12',
    sender: 'TECHNICAL',
    recipient: 'SWARM',
    message: 'Alert: Sell-side liquidity swept at 4341.20 during London-NY transition. M15 CHOCH printed with strong displacement.',
    bias: 'BULLISH',
    confidence: 84,
    tags: ['ICT', 'Liquidity Sweep', 'M15 CHOCH']
  },
  {
    id: 'msg-2',
    timestamp: '17:28:18',
    sender: 'CORRELATION',
    recipient: 'TECHNICAL',
    message: 'Confirming your bias: DXY just rejected the 104.40 session resistance, and Silver (XAGUSD) is showing relative strength (+1.28%). Correlation is healthy.',
    bias: 'BULLISH',
    confidence: 81,
    tags: ['DXY Reject', 'Silver Divergence']
  },
  {
    id: 'msg-3',
    timestamp: '17:28:25',
    sender: 'MACRO',
    recipient: 'SWARM',
    message: 'US 10-Year yield down 6 bps to 4.21%. Macro tailwind is present, but remind all agents: Core PCE drops in 1h 45m. Volatility will spike.',
    bias: 'BULLISH',
    confidence: 76,
    tags: ['Yields Down', 'Event Warning']
  },
  {
    id: 'msg-4',
    timestamp: '17:28:34',
    sender: 'RISK',
    recipient: 'TECHNICAL',
    message: 'I concur with the structure, but we CANNOT take full 1.5% risk. Maximum allocated exposure must be capped at 0.50% with a hard stop under 4343.80.',
    bias: 'CAUTION',
    confidence: 88,
    tags: ['Risk Override', 'Size Reduction']
  },
  {
    id: 'msg-5',
    timestamp: '17:28:42',
    sender: 'VISION',
    recipient: 'SWARM',
    message: 'Chart vision parser confirms clean FVG mitigation between 4346.80 and 4349.00. Rejection wicks visible on M5 and M15.',
    bias: 'BULLISH',
    confidence: 82,
    tags: ['Vision Match', 'FVG Retest']
  },
  {
    id: 'msg-6',
    timestamp: '17:28:45',
    sender: 'ORDER_FLOW',
    recipient: 'TECHNICAL',
    message: 'Cross-verifying your CHOCH: CVD printed positive divergence at 4341.20 with +1,240 contracts aggressive bid absorption. Smart buyers are locking in the low.',
    bias: 'BULLISH',
    confidence: 86,
    tags: ['CVD Divergence', 'Limit Absorption']
  },
  {
    id: 'msg-7',
    timestamp: '17:28:48',
    sender: 'KILLZONE',
    recipient: 'SWARM',
    message: 'Session timing alert: London/NY overlap killzone active. Judas swing completed its manipulation phase; algorithmic trend expansion phase now open.',
    bias: 'BULLISH',
    confidence: 85,
    tags: ['Killzone Active', 'Judas Expansion']
  },
  {
    id: 'msg-8',
    timestamp: '17:28:51',
    sender: 'MTF_FRACTAL',
    recipient: 'DEVILS_ADVOCATE',
    message: 'Fractal safety check: Daily bullish trend intact, H4 breaker retested at 4338, M15 trigger confirmed. Multi-timeframe confluence aligns at 88%.',
    bias: 'BULLISH',
    confidence: 88,
    tags: ['MTF Alignment', 'Fractal Confluence']
  },
  {
    id: 'msg-9',
    timestamp: '17:28:54',
    sender: 'LIQUIDITY_MAP',
    recipient: 'SNIPER',
    message: 'SSL pool cleared at 4341.20. Massive $148M Buy-Side Liquidity cluster resting between 4358.50-4368.00. Upside path of least resistance.',
    bias: 'BULLISH',
    confidence: 87,
    tags: ['BSL Magnet', 'SSL Cleared']
  },
  {
    id: 'msg-10',
    timestamp: '17:28:58',
    sender: 'FINAL_DECISION',
    recipient: 'SWARM',
    message: 'All 15 Specialized Council Agents connected. Consensus synthesized: 11 Bullish, 2 Neutral, 2 Caution. Collective Confluence: 85%. Status upgraded to: BUY SETUP (Armed).',
    bias: 'BULLISH',
    confidence: 85,
    tags: ['15-Agent Consensus', '85% Confluence']
  }
];

export const CURRENT_TRADE_SETUP: TradeSetup = {
  id: 'XAU-20260912-01',
  instrument: 'XAUUSD (Gold Spot)',
  direction: 'BUY',
  decision: 'BUY SETUP',
  entryZone: [4348.50, 4351.00],
  stopLoss: 4343.80,
  tp1: 4358.50,
  tp2: 4368.00,
  tp3: 4378.50,
  riskReward: '1 : 2.85',
  confidence: 81,
  confluenceScore: 84,
  recommendedVolume: 0.50,
  riskPercent: 0.50,
  marketRegime: 'Bullish Continuation / Liquidity Sweep',
  supportingFactors: [
    'London sell-side liquidity swept followed by M15 CHOCH',
    'DXY inverse correlation holding with rejection at 104.40',
    'US10Y yields sliding towards 4.21%',
    'Chart Vision confirms unmitigated bullish FVG entry zone',
    'Institutional ETF inflows recorded for 2nd straight session'
  ],
  opposingFactors: [
    'Upcoming high-impact US Core PCE in 105 mins',
    'H4 swing high supply barrier at 4368.00'
  ],
  invalidationLevel: 4343.80,
  status: 'PENDING_APPROVAL'
};

// Simulation dialogue pool for active 24/7 conversation in the session
export const SIMULATED_DIALOGUE_POOL = [
  {
    sender: 'TECHNICAL' as const,
    recipient: 'SWARM' as const,
    message: 'M5 candle closed with high volume displacement. Buy-side liquidity pool at 4358.00 is being targeted.',
    bias: 'BULLISH' as const,
    confidence: 86,
    tags: ['Displacement', 'BSL Target']
  },
  {
    sender: 'CORRELATION' as const,
    recipient: 'TECHNICAL' as const,
    message: 'US02Y yield also ticked down -0.5%. Short-end yield curve confirming Dollar softness.',
    bias: 'BULLISH' as const,
    confidence: 79,
    tags: ['Yield Curve', 'Dollar Softness']
  },
  {
    sender: 'INSTITUTIONAL' as const,
    recipient: 'SWARM' as const,
    message: 'Order flow delta shows +840 lots net passive absorption at 4346.20. Smart money defending entry zone.',
    bias: 'BULLISH' as const,
    confidence: 83,
    tags: ['Delta Absorption', 'Smart Money']
  },
  {
    sender: 'RISK' as const,
    recipient: 'SWARM' as const,
    message: 'Monitoring spread: steady at 0.36. If spread widens over 0.65 ahead of news, auto-lockout will trigger.',
    bias: 'CAUTION' as const,
    confidence: 90,
    tags: ['Spread Monitor', 'Lockout Guard']
  },
  {
    sender: 'NEWS' as const,
    recipient: 'SWARM' as const,
    message: 'Financial wire update: ECB speaker remarks emphasize slower rate cuts, strengthening EUR and weighing on DXY.',
    bias: 'BULLISH' as const,
    confidence: 72,
    tags: ['ECB Wire', 'FX Impact']
  },
  {
    sender: 'SENTIMENT' as const,
    recipient: 'SWARM' as const,
    message: 'Crowd sentiment tracker: Social mentions for #GOLD bullish up 12%, but institutional skew is leading the move.',
    bias: 'NEUTRAL' as const,
    confidence: 67,
    tags: ['Sentiment Ratio', 'Institutional Lead']
  },
  {
    sender: 'VISION' as const,
    recipient: 'SWARM' as const,
    message: 'Visual chart frame re-scanned: Order block upper boundary respected at 4346.50. Price action pristine.',
    bias: 'BULLISH' as const,
    confidence: 85,
    tags: ['OB Confirmation', 'Clean Price Action']
  },
  {
    sender: 'ORDER_FLOW' as const,
    recipient: 'SNIPER' as const,
    message: 'Footprint cluster shows aggressive delta flip from -420 to +1,180 on M5. Sellers exhausted at low of day.',
    bias: 'BULLISH' as const,
    confidence: 87,
    tags: ['Footprint Cluster', 'Delta Flip']
  },
  {
    sender: 'KILLZONE' as const,
    recipient: 'SWARM' as const,
    message: 'New York morning algorithmic delivery phase in progress. Target window active until 11:00 AM NY time.',
    bias: 'BULLISH' as const,
    confidence: 86,
    tags: ['NY Killzone', 'Algo Delivery']
  },
  {
    sender: 'MTF_FRACTAL' as const,
    recipient: 'TECHNICAL' as const,
    message: 'Nested fractal matrix confirmed: H1 displacement candle breaking minor swing high 4352.80. Structure confirmed.',
    bias: 'BULLISH' as const,
    confidence: 89,
    tags: ['Fractal High', 'Displacement']
  },
  {
    sender: 'LIQUIDITY_MAP' as const,
    recipient: 'DEVILS_ADVOCATE' as const,
    message: 'Liquidity heatmap alert: Buy stops at 4358.00 and 4368.00 represent total resting pool of $210M. Strong magnetic draw.',
    bias: 'BULLISH' as const,
    confidence: 88,
    tags: ['Liquidity Magnet', 'Resting Pool']
  },
  {
    sender: 'FINAL_DECISION' as const,
    recipient: 'SWARM' as const,
    message: 'Confluence remains robust at 85% across all 15 agents. Waiting on human trader sign-off. Remember: Discipline over hype.',
    bias: 'BULLISH' as const,
    confidence: 85,
    tags: ['Human Gatekeeper', 'Discipline Over Hype']
  }
];
