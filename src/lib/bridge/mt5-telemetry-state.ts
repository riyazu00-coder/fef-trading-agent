/**
 * FEF TRADING SOLUTIONS — CANONICAL MT5 TELEMETRY STATE & HELPERS
 * 
 * Phase 33: Live MT5 Telemetry Integration (Read-Only Broker Context Layer)
 * 
 * Defines unified telemetry interfaces, deterministic quote comparison math,
 * and account margin risk evaluations without altering primary public market data
 * or the 15-agent cognitive swarms.
 */

import {
  BridgeConnectionState,
  MT5TerminalStatus,
  MT5AccountInfo,
  MT5QuoteData,
  MT5PositionItem,
  MT5PendingOrderItem,
  MT5SymbolSpecification,
  MT5BrokerSessionInfo
} from './mt5-bridge-protocol';
import { symbolDirectory } from './symbol-mapper';

export type QuoteMatchStatus =
  | 'MATCHED'
  | 'NORMAL_BROKER_DIFFERENCE'
  | 'WIDE_SPREAD'
  | 'STALE_MT5_QUOTE'
  | 'SESSION_CLOSED'
  | 'BROKER_UNAVAILABLE';

export interface BrokerQuoteComparison {
  status: QuoteMatchStatus;
  statusLabel: string;
  publicPrice: number;
  brokerBid: number;
  brokerAsk: number;
  brokerMid: number;
  spreadPips: number;
  pointDiff: number;
  pointDiffPips: number;
  pointDiffPct: number;
  isStale: boolean;
  ageMs: number;
  comparisonTimestamp: number;
}

export type MarginStressLevel =
  | 'SAFE'
  | 'ELEVATED'
  | 'HIGH_RISK'
  | 'CRITICAL_STOP_OUT_ALERT';

export interface MT5AccountContext extends MT5AccountInfo {
  broker?: string;
  marginStressLevel: MarginStressLevel;
  freeMarginRatio: number; // freeMargin / equity
  equityToBalanceRatio: number; // equity / balance
  floatingPnl: number;
  floatingPnlPct: number;
  isDemo: boolean;
  operatingMode: 'READ_ONLY' | 'DEMO_EXECUTION' | 'LIVE_EXECUTION';
}

export interface MT5ActiveSymbolTelemetry {
  canonicalSymbol: string;
  brokerSymbol: string;
  quote: MT5QuoteData | null;
  spec: MT5SymbolSpecification | null;
  session: MT5BrokerSessionInfo | null;
  comparison: BrokerQuoteComparison;
  positions: MT5PositionItem[];
  pendingOrders: MT5PendingOrderItem[];
}

export interface MT5UnifiedTelemetry {
  localBridgeOnline: boolean;
  mt5Connected: boolean;
  isRemote?: boolean;
  state: BridgeConnectionState;
  transport: string;
  heartbeatAgeMs: number | null;
  lastHeartbeat: string | null;
  terminal: MT5TerminalStatus | null;
  account: MT5AccountContext | null;
  allPositions: MT5PositionItem[];
  allPendingOrders: MT5PendingOrderItem[];
  allQuotes: Record<string, MT5QuoteData>;
  operatingMode: 'READ_ONLY' | 'DEMO_EXECUTION';
  readOnlyLockActive: boolean;
  lastSyncTimestamp: number;
}

/**
 * Compare public primary market feed with broker quote
 */
export function compareBrokerQuote(
  publicPrice: number,
  brokerQuote: MT5QuoteData | null | undefined,
  pipSize: number = 0.1,
  staleThresholdMs: number = 20000
): BrokerQuoteComparison {
  const now = Date.now();

  if (!brokerQuote || brokerQuote.bid <= 0 || brokerQuote.ask <= 0) {
    return {
      status: 'BROKER_UNAVAILABLE',
      statusLabel: 'NO BROKER QUOTE',
      publicPrice,
      brokerBid: 0,
      brokerAsk: 0,
      brokerMid: 0,
      spreadPips: 0,
      pointDiff: 0,
      pointDiffPips: 0,
      pointDiffPct: 0,
      isStale: true,
      ageMs: Infinity,
      comparisonTimestamp: now
    };
  }

  const quoteTime = brokerQuote.timestamp || (brokerQuote.time ? new Date(brokerQuote.time).getTime() : now);
  const calculatedAge = now - (isNaN(quoteTime) ? now : quoteTime);
  const ageMs = typeof brokerQuote.ageMs === 'number' ? brokerQuote.ageMs : calculatedAge;
  const isStale = brokerQuote.freshness === 'SESSION_CLOSED'
    ? true
    : brokerQuote.freshness === 'STALE'
      ? true
      : (ageMs > staleThresholdMs || Boolean(brokerQuote.isStale));

  const brokerMid = (brokerQuote.bid + brokerQuote.ask) / 2;
  const pointDiff = Math.abs(publicPrice - brokerMid);
  const effectivePipSize = pipSize > 0 ? pipSize : (brokerQuote.point ? brokerQuote.point * 10 : 0.01);
  const pointDiffPips = effectivePipSize > 0 ? pointDiff / effectivePipSize : 0;
  const pointDiffPct = publicPrice > 0 ? (pointDiff / publicPrice) * 100 : 0;
  const spreadPips = effectivePipSize > 0 ? brokerQuote.spread / (effectivePipSize / (brokerQuote.point || 0.01)) : brokerQuote.spread;

  let status: QuoteMatchStatus = 'MATCHED';
  let statusLabel = 'VERIFIED MATCH';

  if (brokerQuote.freshness === 'SESSION_CLOSED') {
    status = 'SESSION_CLOSED';
    statusLabel = 'SESSION CLOSED';
  } else if (isStale) {
    status = 'STALE_MT5_QUOTE';
    statusLabel = 'STALE BROKER FEED';
  } else if (brokerQuote.spread > 50 || spreadPips > 5.0) {
    status = 'WIDE_SPREAD';
    statusLabel = 'WIDE BROKER SPREAD';
  } else if (pointDiffPips > 3.0) {
    status = 'NORMAL_BROKER_DIFFERENCE';
    statusLabel = 'BROKER DELTA NORMAL';
  } else {
    status = 'MATCHED';
    statusLabel = 'VERIFIED MATCH';
  }

  return {
    status,
    statusLabel,
    publicPrice,
    brokerBid: brokerQuote.bid,
    brokerAsk: brokerQuote.ask,
    brokerMid: Number(brokerMid.toFixed(5)),
    spreadPips: Number(spreadPips.toFixed(1)),
    pointDiff: Number(pointDiff.toFixed(5)),
    pointDiffPips: Number(pointDiffPips.toFixed(2)),
    pointDiffPct: Number(pointDiffPct.toFixed(4)),
    isStale,
    ageMs,
    comparisonTimestamp: now
  };
}

/**
 * Derive account risk context and evaluate margin stress
 */
export function deriveAccountRiskContext(
  account: Partial<MT5AccountInfo> | null | undefined,
  positions: MT5PositionItem[] = [],
  effectiveOperatingMode?: 'READ_ONLY' | 'DEMO_EXECUTION'
): MT5AccountContext | null {
  if (!account || typeof account.balance !== 'number') {
    return null;
  }

  const balance = Number(account.balance || 0);
  const equity = Number(account.equity || balance);
  const margin = Number(account.margin || 0);
  const freeMargin = Number(account.freeMargin || (equity - margin));
  const leverage = Number(account.leverage || 100);

  const calculatedMarginLevel = margin > 0 ? (equity / margin) * 100 : (account.marginLevel || 10000);
  const marginLevel = Number(calculatedMarginLevel.toFixed(1));

  const floatingPnl = equity - balance;
  const floatingPnlPct = balance > 0 ? (floatingPnl / balance) * 100 : 0;

  const freeMarginRatio = equity > 0 ? freeMargin / equity : 0;
  const equityToBalanceRatio = balance > 0 ? equity / balance : 1;

  let marginStressLevel: MarginStressLevel = 'SAFE';
  if (marginLevel > 0 && marginLevel < 100) {
    marginStressLevel = 'CRITICAL_STOP_OUT_ALERT';
  } else if (marginLevel > 0 && marginLevel < 200) {
    marginStressLevel = 'HIGH_RISK';
  } else if (marginLevel > 0 && marginLevel < 500) {
    marginStressLevel = 'ELEVATED';
  } else {
    marginStressLevel = 'SAFE';
  }

  const tradeMode = account.tradeMode === 'REAL' ? 'REAL' : 'DEMO';
  const isDemo = tradeMode !== 'REAL';

  let authoritativeOperatingMode: 'READ_ONLY' | 'DEMO_EXECUTION' = 'READ_ONLY';
  if (!isDemo) {
    authoritativeOperatingMode = 'READ_ONLY';
  } else if (effectiveOperatingMode) {
    authoritativeOperatingMode = effectiveOperatingMode === 'DEMO_EXECUTION' ? 'DEMO_EXECUTION' : 'READ_ONLY';
  } else if (account.operatingMode === 'DEMO_EXECUTION') {
    authoritativeOperatingMode = 'DEMO_EXECUTION';
  }

  return {
    maskedLogin: account.maskedLogin || '00***00',
    company: account.company || (account as any).broker || 'UNKNOWN BROKER',
    broker: (account as any).broker || account.company || 'UNKNOWN BROKER',
    server: account.server || 'MT5 SERVER',
    currency: account.currency || 'USD',
    tradeMode,
    balance,
    equity,
    margin,
    freeMargin,
    marginLevel,
    leverage,
    tradeAllowed: Boolean(account.tradeAllowed),
    soCall: account.soCall || 60,
    soStop: account.soStop || 30,
    marginStressLevel,
    freeMarginRatio: Number(freeMarginRatio.toFixed(4)),
    equityToBalanceRatio: Number(equityToBalanceRatio.toFixed(4)),
    floatingPnl: Number(floatingPnl.toFixed(2)),
    floatingPnlPct: Number(floatingPnlPct.toFixed(2)),
    isDemo,
    operatingMode: authoritativeOperatingMode
  };
}

/**
 * Filter positions belonging to a canonical symbol (with alias matching)
 */
export function filterPositionsForSymbol(
  positions: MT5PositionItem[],
  canonicalSymbol: string
): MT5PositionItem[] {
  if (!Array.isArray(positions)) return [];
  const target = canonicalSymbol.toUpperCase().trim();

  return positions.filter((p) => {
    const pCanonical = p.canonicalSymbol
      ? p.canonicalSymbol.toUpperCase().trim()
      : symbolDirectory.toCanonicalSymbol(p.symbol || '').toUpperCase().trim();
    return pCanonical === target;
  });
}

/**
 * Filter pending orders belonging to a canonical symbol
 */
export function filterOrdersForSymbol(
  orders: MT5PendingOrderItem[],
  canonicalSymbol: string
): MT5PendingOrderItem[] {
  if (!Array.isArray(orders)) return [];
  const target = canonicalSymbol.toUpperCase().trim();

  return orders.filter((o) => {
    const oCanonical = o.canonicalSymbol
      ? o.canonicalSymbol.toUpperCase().trim()
      : symbolDirectory.toCanonicalSymbol(o.symbol || '').toUpperCase().trim();
    return oCanonical === target;
  });
}
