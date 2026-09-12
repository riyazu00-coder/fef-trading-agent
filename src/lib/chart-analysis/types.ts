/**
 * Shared Type Definitions for Chart Vision Analyzer
 * Safe for import in both server and client environments.
 */

export interface ChartAnalysisRequest {
  image: string; // Base64 or Data URI
  selectedAsset: string;
  symbol?: string;
  timeframe?: string;
  analysisMode: 'CHART_ONLY' | 'FULL_INTELLIGENCE';
  simulateError?: boolean;
}

export interface ChartAnalysisResponse {
  id: string;
  timestamp: string;
  symbol: string;
  timeframe: string;
  analysisMode: 'CHART_ONLY' | 'FULL_INTELLIGENCE';
  chartQuality: string;
  freshness: string;
  visiblePrice: number;

  marketStructure: {
    trend: string;
    swingStructure: string;
    bos: string;
    choch: string;
  };

  smartMoney: {
    fvgs: string[];
    orderBlocks: string[];
    liquidityPools: string[];
    sweeps: string[];
    premiumDiscount: string;
  };

  supportResistance: {
    resistanceLevels: number[];
    supportLevels: number[];
  };

  indicators: {
    rsi: number;
    volume: string;
    momentum: string;
  };

  setup: {
    state: 'BUY OPPORTUNITY' | 'SELL OPPORTUNITY' | 'WATCH FOR BUY' | 'WATCH FOR SELL' | 'WAIT' | 'NO TRADE' | 'INSUFFICIENT INFORMATION';
    confidence: number;
    entryLow: number;
    entryHigh: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    riskReward: string;
    invalidation: string;
    riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
  };

  supportingEvidence: string[]; // Why this trade
  opposingEvidence: string[]; // Risks / Opposing evidence
  confirmationRequired: string; // What must happen next
  alternativeScenario: string; // If this idea fails

  agentFeedback: {
    agentName: string;
    type: string;
    confirmed: boolean;
    comment: string;
  }[];

  livePriceCrossCheck: {
    chartDetectedPrice: number;
    liveExnessPrice: number;
    diffPercent: number;
    isOutdated: boolean;
    warningMessage: string;
  };

  providerStatus: 'LIVE_MULTIMODAL' | 'HEURISTIC_DEMO' | 'NOT_CONFIGURED';
  imageThumbnail?: string;
}

export interface ChartAnalysisHistoryItem {
  id: string;
  timestamp: string;
  symbol: string;
  timeframe: string;
  setupState: string;
  confidence: number;
  thumbnail?: string;
}
