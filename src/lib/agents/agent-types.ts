export type AgentType = 
  | 'TECHNICAL'
  | 'MACRO'
  | 'NEWS'
  | 'GEOPOLITICAL'
  | 'SENTIMENT'
  | 'CORRELATION'
  | 'INSTITUTIONAL'
  | 'RISK'
  | 'RISK_GUARDIAN'
  | 'VISION'
  | 'SNIPER'
  | 'DEVILS_ADVOCATE'
  | 'ORDER_FLOW'
  | 'KILLZONE'
  | 'MTF_FRACTAL'
  | 'LIQUIDITY_MAP'
  | 'FINAL_DECISION'
  | 'OPPORTUNITY'
  | 'STRATEGY'
  | 'SYNAPSE_SENTINEL'
  | 'DARK_POOL_RADAR'
  | 'BLACK_SWAN_SCANNER'
  | 'SPREAD_ARBITRAGE'
  | 'HUMAN_ALIGNMENT'
  | string;

export type BiasType = 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' | 'WAIT' | 'RESTRICTED' | 'ACTIVE';

export type DecisionStatus = 'BUY SETUP' | 'SELL SETUP' | 'WATCH' | 'WAIT' | 'NO TRADE';

export interface AgentDialogueMessage {
  id: string;
  timestamp: string;
  sender: AgentType;
  recipient?: AgentType | 'SWARM';
  message: string;
  bias: BiasType;
  confidence: number;
  tags?: string[];
}

export type AgentNodeStatus = 
  | 'ONLINE'
  | 'PROCESSING'
  | 'DEBATING'
  | 'CAUTION'
  | 'RESTRICTED'
  | 'DATA LIMITED'
  | 'WAITING'
  | 'OFFLINE'
  | 'ERROR'
  | 'ALERT'
  | 'ANALYZING';

export interface AgentState {
  type: AgentType;
  name: string;
  role: string;
  bias: BiasType;
  confidence: number;
  status: AgentNodeStatus;
  lastOpinion: string;
  evidence: string[];
  keyRisk: string;
  invalidation: string;
  dataLimitedReason?: string;
  evidenceRecords?: any[];
  evidenceTrustScore?: number;
  provenanceBadge?: 'LIVE' | 'MT5' | 'INDEPENDENT' | 'REFERENCE' | 'DERIVED' | 'INFERENCE' | 'DATA LIMITED' | 'UNAVAILABLE';
  // V1.2 Observability & Readiness Contracts
  requiredInputs?: string[];
  availableInputs?: string[];
  missingInputs?: string[];
  lastRun?: string;
  freshness?: 'REALTIME' | 'CURRENT' | 'STALE' | 'OFFLINE';
}

export interface MarketAsset {
  symbol: string;
  name: string;
  price: number;
  change: number;
  category: 'COMMODITY' | 'CURRENCY' | 'BOND' | 'EQUITY' | 'CRYPTO';
  correlationToGold: 'STRONG_NEGATIVE' | 'MODERATE_NEGATIVE' | 'NEUTRAL' | 'MODERATE_POSITIVE' | 'STRONG_POSITIVE';
  isLive: boolean;
}

export interface EconomicEvent {
  id: string;
  time: string;
  currency: string;
  title: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  countdown: string;
  forecast?: string;
  previous?: string;
}

export interface TradeSetup {
  id: string;
  instrument: string;
  direction: 'BUY' | 'SELL';
  decision: DecisionStatus;
  entryZone: [number, number];
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskReward: string;
  confidence: number;
  confluenceScore: number;
  recommendedVolume: number;
  riskPercent: number;
  marketRegime: string;
  supportingFactors: string[];
  opposingFactors: string[];
  invalidationLevel: number;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'MODIFIED' | 'EXPIRED';
}
