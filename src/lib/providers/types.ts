/**
 * FEF CORTEX — PROVIDER ABSTRACTION & CONTRACT TYPES
 * 
 * Defines standard interfaces for multi-source market intelligence:
 * MarketDataProvider, BrokerDataProvider, NewsProvider, MacroProvider,
 * CalendarProvider, SentimentProvider, OrderFlowProvider, GeopoliticalProvider.
 */

import { EvidenceClassification } from '@/lib/evidence/agent-evidence';

export type ProviderSourceType =
  | 'BROKER_MT5'
  | 'INDEPENDENT_EXCHANGE'
  | 'PUBLIC_FEED'
  | 'FINANCIAL_NEWS'
  | 'ECONOMIC_CALENDAR'
  | 'CENTRAL_BANK'
  | 'SENTIMENT_FEED'
  | 'DERIVED_ENGINE';

export type ProviderHealthStatus = 'HEALTHY' | 'DEGRADED' | 'RATE_LIMITED' | 'OFFLINE';

export interface RateLimitState {
  requestsRemaining?: number;
  resetAt?: number; // epoch ms
  isThrottled: boolean;
  retryAfterMs?: number;
}

export interface ProviderHealth {
  providerId: string;
  name: string;
  sourceType: ProviderSourceType;
  status: ProviderHealthStatus;
  latencyMs: number;
  lastChecked: string; // ISO
  lastSuccess?: string; // ISO
  errorCount: number;
  rateLimit: RateLimitState;
  isFreeTier: boolean;
}

export interface BaseProvider {
  readonly id: string;
  readonly name: string;
  readonly sourceType: ProviderSourceType;
  readonly supportedAssets: readonly string[];
  getHealth(): Promise<ProviderHealth>;
}

export interface NormalizedMarketQuote {
  symbol: string;
  canonicalSymbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  spreadPips: number;
  high24h?: number;
  low24h?: number;
  change24h?: number;
  changePercent24h?: number;
  volume24h?: number;
  timestamp: string; // ISO
  epochMs: number;
  providerId: string;
  sourceType: ProviderSourceType;
  classification: EvidenceClassification;
  isExecutable: boolean; // Always false unless broker verified
}

export interface NormalizedCandle {
  symbol: string;
  timeframe: string; // 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1'
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
  realVolume?: number;
  time: string; // ISO
  epochMs: number;
  isComplete: boolean;
}

export interface MarketDataProvider extends BaseProvider {
  getQuote(symbol: string): Promise<NormalizedMarketQuote | null>;
  getQuotes(symbols: string[]): Promise<Map<string, NormalizedMarketQuote>>;
  getCandles?(symbol: string, timeframe: string, count: number): Promise<NormalizedCandle[]>;
}

export interface BrokerDataProvider extends MarketDataProvider {
  getBrokerName(): string;
  getServerName(): string;
  getAccountType(): string; // 'DEMO' | 'REAL'
  isExecutionLocked(): true; // STRICT ARCHITECTURAL INVARIANT: ALWAYS TRUE
}

export interface NormalizedNewsItem {
  id: string;
  headline: string;
  summary?: string;
  source: string;
  publishedAt: string; // ISO
  epochMs: number;
  url?: string;
  symbols: string[];
  relevanceScore: number; // 0.0 - 1.0
  impactTier: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  sentimentBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  classification: EvidenceClassification;
  region: 'US' | 'EU' | 'UK' | 'ASIA' | 'MIDDLE_EAST' | 'GLOBAL';
}

export interface NewsProvider extends BaseProvider {
  getLatestNews(symbols?: string[], limit?: number): Promise<NormalizedNewsItem[]>;
}

export interface NormalizedCalendarEvent {
  id: string;
  title: string;
  country: string;
  currency: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  scheduledAt: string; // ISO
  epochMs: number;
  actual?: number | string;
  forecast?: number | string;
  previous?: number | string;
  surpriseValue?: number; // actual - forecast normalized
  surpriseDirection?: 'BETTER_THAN_EXPECTED' | 'WORSE_THAN_EXPECTED' | 'IN_LINE' | 'PENDING';
  marketEffect?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  relatedSymbols: string[];
  classification: EvidenceClassification;
}

export interface CalendarProvider extends BaseProvider {
  getUpcomingEvents(hoursAhead?: number): Promise<NormalizedCalendarEvent[]>;
  getRecentReleases(hoursBehind?: number): Promise<NormalizedCalendarEvent[]>;
}

export interface MacroIndicatorRecord {
  name: string;
  region: string;
  currentValue: number | string;
  previousValue: number | string;
  forecastValue?: number | string;
  delta?: number | string;
  percentageDelta?: number;
  velocity?: string;
  regime?: string;
  unit: string;
  releaseDate: string; // Authentic publication date
  timestamp?: string; // Retrieval timestamp
  freshness?: 'REALTIME' | 'CURRENT' | 'DELAYED' | 'STALE' | 'OFFLINE';
  source?: string;
  affectedAssets?: string[];
  directionalImplication?: string;
  confidence?: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  goldCorrelation: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  classification: EvidenceClassification;
}

export interface MacroProvider extends BaseProvider {
  getMacroIndicators(region?: string): Promise<MacroIndicatorRecord[]>;
}

export interface SentimentRecord {
  symbol: string;
  overallScore: number; // -1.0 (bearish) to +1.0 (bullish)
  bullishPercent: number; // 0 - 100
  bearishPercent: number; // 0 - 100
  neutralPercent: number; // 0 - 100
  sampleSize: number;
  sentimentType: 'MARKET_FLOW' | 'NEWS_SENTIMENT' | 'SOCIAL_SENTIMENT' | 'POSITIONING_PROXY' | 'BINANCE_FUTURES_LSR';
  timestamp: string;
  classification: EvidenceClassification;
  status?: 'AVAILABLE' | 'DATA_LIMITED' | 'UNAVAILABLE';
  provenance?: string;
}

export interface SentimentProvider extends BaseProvider {
  getSentiment(symbol: string): Promise<SentimentRecord | null>;
}

export interface OrderFlowRecord {
  symbol: string;
  timeframe: string;
  timestamp: string;
  flowType: 'BROKER_FLOW_PROXY' | 'EXCHANGE_ORDER_BOOK';
  buyerSellerDelta: number; // positive = buy dominant, negative = sell dominant
  tickVelocity: number; // ticks per second or volume velocity
  largeOrderCount?: number;
  pocLevel?: number; // Point of Control
  valueAreaHigh?: number;
  valueAreaLow?: number;
  isExchangeVolume: boolean;
  classification: EvidenceClassification;
}

export interface OrderFlowProvider extends BaseProvider {
  getOrderFlow(symbol: string, timeframe?: string): Promise<OrderFlowRecord | null>;
}

export interface GeopoliticalEventRecord {
  id: string;
  headline: string;
  region: 'MIDDLE_EAST' | 'EASTERN_EUROPE' | 'ASIA_PACIFIC' | 'GLOBAL';
  threatLevel: 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'NORMAL';
  status: 'CONFIRMED' | 'DEVELOPING' | 'UNVERIFIED';
  affectedCommodities: string[]; // e.g. ['XAUUSD', 'USOIL']
  marketImpactAssessment: string;
  timestamp: string;
  classification: EvidenceClassification;
}

export interface GeopoliticalProvider extends BaseProvider {
  getGeopoliticalAlerts(): Promise<GeopoliticalEventRecord[]>;
}
