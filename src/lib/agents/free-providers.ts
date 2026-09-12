import { MarketAsset, EconomicEvent } from './agent-types';

export const FREE_MARKET_ASSETS: MarketAsset[] = [
  { symbol: 'XAUUSD', name: 'Gold Spot / US Dollar', price: 4349.70, change: -0.85, category: 'COMMODITY', correlationToGold: 'STRONG_POSITIVE', isLive: true },
  { symbol: 'DXY', name: 'US Dollar Index', price: 104.18, change: -0.36, category: 'CURRENCY', correlationToGold: 'STRONG_NEGATIVE', isLive: true },
  { symbol: 'US10Y', name: 'US 10-Year Treasury Yield', price: 4.214, change: -1.40, category: 'BOND', correlationToGold: 'STRONG_NEGATIVE', isLive: true },
  { symbol: 'US02Y', name: 'US 2-Year Treasury Yield', price: 4.462, change: -0.85, category: 'BOND', correlationToGold: 'MODERATE_NEGATIVE', isLive: true },
  { symbol: 'XAGUSD', name: 'Silver Spot', price: 64.62, change: +1.28, category: 'COMMODITY', correlationToGold: 'STRONG_POSITIVE', isLive: true },
  { symbol: 'VIX', name: 'CBOE Volatility Index', price: 14.82, change: -2.10, category: 'EQUITY', correlationToGold: 'NEUTRAL', isLive: true },
  { symbol: 'SPX', name: 'S&P 500 Index', price: 5468.20, change: +0.28, category: 'EQUITY', correlationToGold: 'MODERATE_POSITIVE', isLive: true },
  { symbol: 'BTCUSD', name: 'Bitcoin / USD', price: 77366.00, change: +1.48, category: 'CRYPTO', correlationToGold: 'MODERATE_POSITIVE', isLive: true },
  { symbol: 'USOIL', name: 'WTI Crude Oil', price: 100.05, change: -2.37, category: 'COMMODITY', correlationToGold: 'MODERATE_POSITIVE', isLive: true }
];

export const FREE_ECONOMIC_CALENDAR: EconomicEvent[] = [
  { id: 'ev-1', time: '18:30 GMT', currency: 'USD', title: 'Core PCE Price Index (MoM)', impact: 'CRITICAL', countdown: 'T - 1h 45m', forecast: '0.2%', previous: '0.3%' },
  { id: 'ev-2', time: '19:15 GMT', currency: 'USD', title: 'Fed Governor Speech (FOMC)', impact: 'HIGH', countdown: 'T - 2h 30m' },
  { id: 'ev-3', time: '21:00 GMT', currency: 'USD', title: '10-Year Bond Auction', impact: 'MEDIUM', countdown: 'T - 4h 15m' },
  { id: 'ev-4', time: 'Tomorrow', currency: 'USD', title: 'Non-Farm Payrolls (NFP Preview)', impact: 'CRITICAL', countdown: 'T - 22h 00m', forecast: '185K', previous: '206K' }
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
}

// Free client-side zero-cost vision parsing simulator
export function analyzeChartImageOffline(fileName: string): FreeVisionAnalysisResult {
  const isGoldLikely = fileName.toLowerCase().includes('gold') || fileName.toLowerCase().includes('xau') || true;
  return {
    symbolDetected: isGoldLikely ? 'XAUUSD' : 'UNKNOWN',
    symbolConfidence: 94,
    timeframeDetected: 'M15',
    timeframeConfidence: 89,
    chartQuality: 'EXCELLENT',
    freshness: 'RECENT',
    visiblePrice: '4349.70',
    marketStructure: 'BULLISH',
    detectedConcepts: [
      { name: 'Sell-Side Liquidity Sweep', type: 'LIQUIDITY_SWEEP', zone: '4341.20', confidence: 91 },
      { name: 'Bullish Change of Character (CHOCH)', type: 'CHOCH', zone: '4348.50', confidence: 88 },
      { name: 'Bullish Fair Value Gap (FVG)', type: 'FVG', zone: '4346.80 - 4349.00', confidence: 85 },
      { name: 'Demand Order Block (OB)', type: 'ORDER_BLOCK', zone: '4344.00 - 4348.00', confidence: 82 }
    ],
    opportunityState: 'BUY OPPORTUNITY',
    possibleEntry: '4348.50 - 4351.00',
    invalidation: '4343.80 (M15 candle close below swing low)',
    stopLoss: '4343.80',
    targets: ['4358.50 (TP1)', '4368.00 (TP2 - Buy-side Liquidity)', '4378.50 (TP3 - Daily Resistance)'],
    estimatedRR: '1 : 2.85',
    visionConfidence: 84,
    supportingEvidence: [
      'Clean wick rejection and sweep of Asian session lows',
      'Strong bullish displacement leaving unmitigated M15 FVG',
      'Price currently finding support inside the discount demand zone'
    ],
    opposingEvidence: [
      'H4 overhead supply level remains active at 4368.00',
      'High-impact economic release scheduled within 2 hours'
    ],
    confirmationRequired: 'Bullish M5 candle close confirming rejection from 4348 demand.'
  };
}
