import { AgentState, AgentDialogueMessage, TradeSetup, DecisionStatus } from './agent-types';

/**
 * Phase 2D: DEMO_FIXTURE — STATIC AGENT STATES FOR VISUALIZATION/FALLBACK ONLY.
 * These are static demonstration fixtures used strictly for cinematic UI fallback
 * when live agent pipeline telemetry is not yet active.
 * They MUST NOT be used for production trade decisions or execution authorization.
 */
export const INITIAL_AGENTS: AgentState[] = [
  {
    type: 'TECHNICAL',
    name: 'Technical Agent',
    role: 'SMC, ICT, Market Structure & Price Action',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Live market telemetry unavailable. Awaiting verified broker price feed.',
    evidence: ['Verified price feed offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified price data'
  },
  {
    type: 'MACRO',
    name: 'Macro Agent',
    role: 'Central Bank Policy, Rates & Growth',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Macro yields and intermarket data stream unavailable.',
    evidence: ['Yield telemetry offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified macro data'
  },
  {
    type: 'CORRELATION',
    name: 'Correlation Agent',
    role: 'DXY, Yields, Equities & Commodities',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Cross-asset correlation matrix unavailable.',
    evidence: ['DXY / secondary asset feeds offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified correlation data'
  },
  {
    type: 'NEWS',
    name: 'News Agent',
    role: 'Live Wire Intelligence & Breaking Feeds',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Live news wire and economic calendar feed unavailable.',
    evidence: ['News feed offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified news feed'
  },
  {
    type: 'GEOPOLITICAL',
    name: 'Geopolitical Agent',
    role: 'Conflict, Sanctions & Safe-Haven Flows',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Geopolitical risk telemetry unavailable.',
    evidence: ['Geopolitical risk stream uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified risk feed'
  },
  {
    type: 'SENTIMENT',
    name: 'Sentiment Agent',
    role: 'Crowd Positioning & Fear vs Greed',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Crowd sentiment and positioning data unavailable.',
    evidence: ['Positioning telemetry offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified sentiment data'
  },
  {
    type: 'INSTITUTIONAL',
    name: 'Institutional Agent',
    role: 'COT Reports, ETF Inflows & Smart Money Pools',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Institutional order flow and COT telemetry unavailable.',
    evidence: ['Institutional feed offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified institutional data'
  },
  {
    type: 'RISK',
    name: 'Risk Agent',
    role: 'Capital Preservation, Sizing & Lockouts',
    bias: 'CAUTION',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Risk parameters locked. Sizing and exposure unvalidated without active setup.',
    evidence: ['Live execution parameters unverified'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified broker risk telemetry'
  },
  {
    type: 'VISION',
    name: 'Vision / Chart Agent',
    role: 'Computer Vision & Visual Structure Recognition',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Visual chart pattern recognition feed unavailable.',
    evidence: ['Chart rendering stream offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified chart frame'
  },
  {
    type: 'SNIPER',
    name: 'Opportunity Sniper',
    role: 'Dynamic Lot Sizing & 3-Tier Take Profit Brackets',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Opportunity brackets disarmed. Awaiting verified multi-agent consensus.',
    evidence: ['Bracket parameters uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified trade blueprint'
  },
  {
    type: 'DEVILS_ADVOCATE',
    name: "Devil's Advocate",
    role: 'Adversarial Stress-Testing & Trap Audit',
    bias: 'CAUTION',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Stress testing paused. No verified candidate setup to stress-test.',
    evidence: ['Candidate blueprint unavailable'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified candidate setup'
  },
  {
    type: 'ORDER_FLOW',
    name: 'Order Flow Delta Agent',
    role: 'CVD, Volume Footprint & Passive Limit Absorption',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Tick delta and volume footprint data unavailable.',
    evidence: ['Order flow tick feed offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified tick data'
  },
  {
    type: 'KILLZONE',
    name: 'Session Killzone Agent',
    role: 'ICT Session Timing, Judas Swings & Algorithmic Windows',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Session timing telemetry standing by.',
    evidence: ['Session schedule monitoring standing by'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified session clock'
  },
  {
    type: 'MTF_FRACTAL',
    name: 'MTF Fractal Matrix Agent',
    role: 'Multi-Timeframe Fractal Alignment (Daily / H4 / M15 / M5)',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Multi-timeframe fractal alignment data unavailable.',
    evidence: ['Multi-timeframe bar feed offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified candle history'
  },
  {
    type: 'LIQUIDITY_MAP',
    name: 'Liquidity Heatmap Agent',
    role: 'Resting BSL/SSL Pools, Retail Stop Clusters & Liquidation Magnet',
    bias: 'NEUTRAL',
    confidence: 0,
    status: 'DATA LIMITED',
    lastOpinion: 'Liquidity heatmap and resting pool telemetry unavailable.',
    evidence: ['Liquidity map feed offline or uninitialized'],
    keyRisk: 'DATA LIMITED',
    invalidation: 'Unavailable without verified depth data'
  }
];

export const INITIAL_DIALOGUE: AgentDialogueMessage[] = [
  {
    id: 'msg-init-1',
    timestamp: '--:--:--',
    sender: 'FINAL_DECISION',
    recipient: 'SWARM',
    message: 'Live agent debate telemetry unavailable. Awaiting verified market data feed.',
    bias: 'NEUTRAL',
    confidence: 0,
    tags: ['DATA LIMITED', 'STANDBY']
  }
];

export const CURRENT_TRADE_SETUP: TradeSetup | null = null;

// Fallback telemetry pool for background stream standby (fail-closed, 0% confidence)
export const SIMULATED_DIALOGUE_POOL = [
  {
    sender: 'TECHNICAL' as const,
    recipient: 'SWARM' as const,
    message: 'Live market telemetry unavailable. Awaiting verified price feed.',
    bias: 'NEUTRAL' as const,
    confidence: 0,
    tags: ['DATA LIMITED', 'STANDBY']
  },
  {
    sender: 'RISK' as const,
    recipient: 'SWARM' as const,
    message: 'Risk policy cap active (0.50% equity cap). Position sizing unvalidated without active setup.',
    bias: 'CAUTION' as const,
    confidence: 0,
    tags: ['Risk Policy Cap', 'STANDBY']
  },
  {
    sender: 'MACRO' as const,
    recipient: 'SWARM' as const,
    message: 'Macro yields and intermarket data stream uninitialized. Standing by.',
    bias: 'NEUTRAL' as const,
    confidence: 0,
    tags: ['DATA LIMITED', 'STANDBY']
  },
  {
    sender: 'FINAL_DECISION' as const,
    recipient: 'SWARM' as const,
    message: 'Collective consensus standing by. Awaiting live broker market telemetry.',
    bias: 'NEUTRAL' as const,
    confidence: 0,
    tags: ['DATA LIMITED', 'STANDBY']
  }
];
