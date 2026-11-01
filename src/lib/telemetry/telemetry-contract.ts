/**
 * FEF TRADING SOLUTIONS — CANONICAL TELEMETRY CONTRACT & TYPES
 *
 * Strictly typed, bounded, read-only telemetry contract.
 * Telemetry transport is physically and logically incapable of issuing
 * trading commands.
 */

export const TELEMETRY_PROTOCOL_VERSION = 1;

export type TelemetryMessageType =
  | 'HEARTBEAT'
  | 'ACCOUNT_STATUS'
  | 'QUOTE_SNAPSHOT'
  | 'CANDLE_SNAPSHOT'
  | 'INTELLIGENCE_SNAPSHOT';

export interface BaseTelemetryEnvelope<T = unknown> {
  version: 1;
  deviceId: string;
  type: TelemetryMessageType;
  capturedAt: string; // ISO 8601 string
  sequence: number;
  payload: T;
}

// 1. HEARTBEAT
export interface HeartbeatPayload {
  terminalBuild: number;
  broker: string;
  server: string;
  magicNumber: number;
  heartbeatIntervalSec: number;
  operatingMode: 'READ_ONLY' | 'DEMO_EXECUTION' | 'LIVE_EXECUTION';
  activeSymbolsCount: number;
  quotesCount: number;
  terminalConnected: boolean;
}

export type HeartbeatEnvelope = BaseTelemetryEnvelope<HeartbeatPayload> & {
  type: 'HEARTBEAT';
};

// 2. ACCOUNT_STATUS (Privacy-safe: no passwords, no tokens, masked account only)
export interface AccountStatusPayload {
  maskedLogin: string;
  broker: string;
  server: string;
  currency: string;
  tradeMode: 'DEMO' | 'CONTEST' | 'REAL';
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  operatingMode: string;
  tradeAllowed: boolean;
}

export type AccountStatusEnvelope = BaseTelemetryEnvelope<AccountStatusPayload> & {
  type: 'ACCOUNT_STATUS';
};

// 3. QUOTE_SNAPSHOT
export interface QuoteItem {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  timestamp: number; // Unix ms
}

export interface QuoteSnapshotPayload {
  quotes: QuoteItem[];
}

export type QuoteSnapshotEnvelope = BaseTelemetryEnvelope<QuoteSnapshotPayload> & {
  type: 'QUOTE_SNAPSHOT';
};

// 4. CANDLE_SNAPSHOT
export interface ClosedCandleItem {
  timestamp: number; // Unix ms of open time
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
}

export interface CandleSnapshotPayload {
  canonicalSymbol: string;
  brokerSymbol: string;
  timeframe: 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';
  candles: ClosedCandleItem[];
  closed: true;
  provider: 'MT5_BROKER_BRIDGE';
}

export type CandleSnapshotEnvelope = BaseTelemetryEnvelope<CandleSnapshotPayload> & {
  type: 'CANDLE_SNAPSHOT';
};

// 5. INTELLIGENCE_SNAPSHOT (Read-only summary of local 32-agent architecture and Decision Engine V2)
export interface IntelligenceAgentSummary {
  id: string;
  name: string;
  category: string;
  status: 'ONLINE' | 'DEGRADED' | 'DISCONNECTED';
  ready: boolean;
  inputFreshness: string;
  missingDependencies: string[];
  evidenceSummary?: string;
  lastEvaluatedAt?: number;
}

export interface IntelligenceDecisionSummary {
  symbol: string;
  decision: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  engineVersion: 'V2';
  setupGrade?: string;
  blockingReasons: string[];
  vetoes: string[];
  correlationClusters?: Record<string, any>;
  synthesizer: 'FINAL_DECISION';
  evaluatedAt: number;
  source: 'LOCAL_ENGINE' | 'REMOTE_TELEMETRY';
}

export interface IntelligenceSnapshotPayload {
  sourceAuthority: 'LOCAL_ENGINE';
  evaluatedAt: number;
  agents: IntelligenceAgentSummary[];
  decisions: Record<string, IntelligenceDecisionSummary>;
  activeClusters?: string[];
  finalDecisionSynthesizer: 'FINAL_DECISION';
}

export type IntelligenceSnapshotEnvelope = BaseTelemetryEnvelope<IntelligenceSnapshotPayload> & {
  type: 'INTELLIGENCE_SNAPSHOT';
};

export type CanonicalTelemetryEnvelope =
  | HeartbeatEnvelope
  | AccountStatusEnvelope
  | QuoteSnapshotEnvelope
  | CandleSnapshotEnvelope
  | IntelligenceSnapshotEnvelope;

// Allowed canonical symbols & timeframes
export const CANONICAL_TELEMETRY_SYMBOLS = new Set([
  'XAUUSD', 'XAGUSD',
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY', 'EURGBP',
  'US100', 'US30', 'US500', 'GER40', 'UK100', 'JP225',
  'USOIL', 'UKOIL', 'NATGAS',
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'
]);

export const CANONICAL_TELEMETRY_TIMEFRAMES = new Set([
  'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'
]);

// Maximum sizes to prevent denial-of-service or oversized payloads
export const MAX_TELEMETRY_BODY_BYTES = 512 * 1024; // 512 KB
export const MAX_CANDLES_PER_SNAPSHOT = 100;
export const MAX_QUOTES_PER_SNAPSHOT = 50;
