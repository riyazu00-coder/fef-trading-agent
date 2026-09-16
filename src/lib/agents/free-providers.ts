import { MarketAsset, EconomicEvent } from './agent-types';

/**
 * Phase 2D: DEMO_FIXTURE — NOT LIVE DATA.
 * These are static demonstration assets used ONLY in demo mode and unit tests.
 * isLive is explicitly false. These values MUST NOT be used in production
 * intelligence decisions, agent evidence scoring, or execution authorization.
 * For live prices, use the MT5 broker quote via mt5HttpClient.getQuote().
 */
export const DEMO_FIXTURE_WARNING = 'STATIC_DEMO_FIXTURE — NOT LIVE. Do not use in production intelligence paths.';

export const FREE_MARKET_ASSETS: MarketAsset[] = [
  { symbol: 'XAUUSD', name: 'Gold Spot / US Dollar', price: 0, change: 0, category: 'COMMODITY', correlationToGold: 'STRONG_POSITIVE', isLive: false },
  { symbol: 'DXY', name: 'US Dollar Index', price: 0, change: 0, category: 'CURRENCY', correlationToGold: 'STRONG_NEGATIVE', isLive: false },
  { symbol: 'US10Y', name: 'US 10-Year Treasury Yield', price: 0, change: 0, category: 'BOND', correlationToGold: 'STRONG_NEGATIVE', isLive: false },
  { symbol: 'US02Y', name: 'US 2-Year Treasury Yield', price: 0, change: 0, category: 'BOND', correlationToGold: 'MODERATE_NEGATIVE', isLive: false },
  { symbol: 'XAGUSD', name: 'Silver Spot', price: 0, change: 0, category: 'COMMODITY', correlationToGold: 'STRONG_POSITIVE', isLive: false },
  { symbol: 'VIX', name: 'CBOE Volatility Index', price: 0, change: 0, category: 'EQUITY', correlationToGold: 'NEUTRAL', isLive: false },
  { symbol: 'SPX', name: 'S&P 500 Index', price: 0, change: 0, category: 'EQUITY', correlationToGold: 'MODERATE_POSITIVE', isLive: false },
  { symbol: 'BTCUSD', name: 'Bitcoin / USD', price: 0, change: 0, category: 'CRYPTO', correlationToGold: 'MODERATE_POSITIVE', isLive: false },
  { symbol: 'USOIL', name: 'WTI Crude Oil', price: 0, change: 0, category: 'COMMODITY', correlationToGold: 'MODERATE_POSITIVE', isLive: false },
];

export const FREE_ECONOMIC_CALENDAR: EconomicEvent[] = [
  { id: 'ev-1', time: 'DATA LIMITED', currency: 'USD', title: 'Economic calendar unavailable — no live news API connected', impact: 'CRITICAL', countdown: 'UNAVAILABLE' },
];

export interface FreeVisionAnalysisResult {
  symbolDetected: string;
  symbolConfidence: number;
  timeframeDetected: string;
  timeframeConfidence: number;
  chartQuality: 'EXCELLENT' | 'GOOD' | 'LIMITED' | 'POOR';
  freshness: 'CURRENT' | 'RECENT' | 'OLD' | 'UNKNOWN';
  visiblePrice: string;
  marketStructure: 'BULLISH' | 'BEARISH' | 'RANGING';
  detectedConcepts: {
    name: string;
    type: 'BOS' | 'CHOCH' | 'FVG' | 'ORDER_BLOCK' | 'LIQUIDITY_SWEEP';
    zone?: string;
    confidence: number;
  }[];
  opportunityState: 'BUY OPPORTUNITY' | 'SELL OPPORTUNITY' | 'WATCH FOR BUY' | 'WATCH FOR SELL' | 'WAIT' | 'NO TRADE';
  possibleEntry: string;
  invalidation: string;
  stopLoss: string;
  targets: string[];
  estimatedRR: string;
  visionConfidence: number;
  supportingEvidence: string[];
  opposingEvidence: string[];
  confirmationRequired: string;
  // Phase 2D provenance flag
  isDemoFixture: true;
  productionEligible: false;
}

/**
 * Phase 2D: DEMO-ONLY SIMULATOR — BLOCKED FROM PRODUCTION DECISION PATHS.
 * This function returns a static hardcoded result regardless of the chart image.
 * It MUST NOT be used for evidence scoring, Evidence Trust calculation, or execution authorization.
 * Use the Chart Analyzer (Vision Agent) with a real AI vision model for production.
 */
export function analyzeChartImageOffline(_fileName: string): FreeVisionAnalysisResult {
  console.warn('[free-providers] analyzeChartImageOffline() is a DEMO SIMULATOR — results are static and MUST NOT be used in production intelligence decisions.');
  return {
    symbolDetected: 'UNKNOWN',
    symbolConfidence: 0,
    timeframeDetected: 'UNKNOWN',
    timeframeConfidence: 0,
    chartQuality: 'POOR',
    freshness: 'UNKNOWN',
    visiblePrice: 'UNAVAILABLE',
    marketStructure: 'RANGING',
    detectedConcepts: [],
    opportunityState: 'WAIT',
    possibleEntry: 'UNAVAILABLE — Demo simulator, not real analysis',
    invalidation: 'UNAVAILABLE',
    stopLoss: 'UNAVAILABLE',
    targets: ['UNAVAILABLE'],
    estimatedRR: 'N/A',
    visionConfidence: 0,
    supportingEvidence: ['Chart image analysis requires a live AI vision model — not connected in Phase 2D.'],
    opposingEvidence: ['All offline analysis results are static fixtures. Do not use for trading decisions.'],
    confirmationRequired: 'Submit chart to a live AI vision endpoint for real analysis.',
    isDemoFixture: true,
    productionEligible: false,
  };
}

