export interface MarketDataQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  timestamp: string;
  source: string;
  status: 'VERIFIED' | 'DELAYED' | 'FALLBACK';
}

export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  timestamp: string;
  url?: string;
  relevanceToGold: 'HIGH' | 'MEDIUM' | 'LOW';
  impactBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
}

export interface MacroIndicator {
  name: string;
  current: string | number;
  previous: string | number;
  forecast: string | number;
  releaseDate: string;
  goldEffect: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  source: string;
}

export interface ProviderHealth {
  name: string;
  type: 'MARKET' | 'NEWS' | 'MACRO' | 'AI' | 'MT5' | 'DATABASE' | 'CALENDAR' | 'SENTIMENT';
  status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
  latencyMs: number;
  lastChecked: string;
  isFreeTier: boolean;
}

export interface IMarketDataProvider {
  getQuote(symbol: string): Promise<MarketDataQuote>;
  getCrossAssetMatrix(): Promise<MarketDataQuote[]>;
}

export interface INewsProvider {
  getLatestFinancialNews(): Promise<NewsItem[]>;
}

export interface IMacroProvider {
  getMacroIndicators(): Promise<MacroIndicator[]>;
}
