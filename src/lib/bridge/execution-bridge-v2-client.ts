/**
 * FEF CORTEX — EXECUTION BRIDGE V2 CLIENT
 * 
 * Direct typed client for Execution Bridge V2 service (:5560).
 * Handles end-to-end integration between MetaTrader 5 (FEF_HTTP_Bridge_V2 EA)
 * and the FEF CORTEX Next.js application.
 * 
 * Real account trading is strictly HARD-LOCKED.
 */

import {
  MT5UnifiedTelemetry,
  MT5AccountContext,
  MarginStressLevel,
} from './mt5-telemetry-state';
import {
  MT5QuoteData,
  MT5PositionItem,
  MT5SymbolSpecification,
  MT5TerminalStatus,
  BridgeConnectionState,
} from './mt5-bridge-protocol';
import { symbolDirectory } from './symbol-mapper';

export interface BridgeV2Health {
  status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
  uptimeSec: number;
  terminalConnected: boolean;
  lastTerminalPollAt: number | null;
  accountMode: 'DEMO' | 'REAL' | 'UNKNOWN';
  realExecutionLocked: boolean;
  activeCommandsQueued: number;
  specsAvailable: number;
  quotesAvailable: number;
  positionsAvailable?: number;
  port: number;
}

export interface BridgeV2Account {
  accountNumber: number;
  broker: string;
  currency: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  tradeMode: 'DEMO' | 'REAL';
  tradeAllowed: boolean;
  updatedAt: number;
}

export interface BridgeV2Spec {
  symbol: string;
  digits: number;
  point: number;
  contractSize: number;
  volumeMin: number;
  volumeMax: number;
  volumeStep: number;
  stopsLevel: number;
  freezeLevel: number;
  marginInitial?: number;
  currencyBase?: string;
  currencyProfit?: string;
  tradeMode?: number;
  updatedAt: number;
}

export interface BridgeV2Quote {
  symbol: string;
  bid: number;
  ask: number;
  spreadPoints: number;
  timestamp: number;
  ageMs: number;
}

export interface BridgeV2Position {
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  comment: string;
  magic: number;
  openTime: number;
  updatedAt: number;
}

export class ExecutionBridgeV2Client {
  private baseUrl: string;
  private timeoutMs: number;

  constructor(baseUrl = process.env.BRIDGE_V2_URL || 'http://127.0.0.1:5560', timeoutMs = 3000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  private async fetchJson<T>(endpoint: string): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  public async getHealth(): Promise<BridgeV2Health | null> {
    return this.fetchJson<BridgeV2Health>('/v2/health');
  }

  public async getAccount(): Promise<{ success: boolean; account: BridgeV2Account | null } | null> {
    return this.fetchJson<{ success: boolean; account: BridgeV2Account | null }>('/v2/account');
  }

  public async getSpecs(): Promise<{ success: boolean; specs: BridgeV2Spec[] } | null> {
    return this.fetchJson<{ success: boolean; specs: BridgeV2Spec[] }>('/v2/specs');
  }

  public async getQuotes(): Promise<{ success: boolean; quotes: BridgeV2Quote[] } | null> {
    return this.fetchJson<{ success: boolean; quotes: BridgeV2Quote[] }>('/v2/quotes');
  }

  public async getPositions(): Promise<{ success: boolean; positions: BridgeV2Position[] } | null> {
    return this.fetchJson<{ success: boolean; positions: BridgeV2Position[] }>('/v2/positions');
  }

  /**
   * Aggregates live V2 telemetry and shapes it into MT5UnifiedTelemetry
   */
  public async getUnifiedTelemetry(): Promise<MT5UnifiedTelemetry | null> {
    const startTime = Date.now();

    // Query endpoints concurrently
    const [health, accountData, specsData, quotesData, positionsData] = await Promise.all([
      this.getHealth(),
      this.getAccount(),
      this.getSpecs(),
      this.getQuotes(),
      this.getPositions(),
    ]);

    if (!health) {
      return null; // Bridge V2 is completely unreachable
    }

    const account = accountData?.account || null;
    const isTerminalFresh = Boolean(
      health.terminalConnected &&
      health.lastTerminalPollAt &&
      (Date.now() - health.lastTerminalPollAt) < 15000
    );

    const heartbeatAgeMs = health.lastTerminalPollAt ? (Date.now() - health.lastTerminalPollAt) : null;
    const isRealAccount = account?.tradeMode === 'REAL' || health.accountMode === 'REAL';

    // Hydrate specs into symbolDirectory
    if (specsData && Array.isArray(specsData.specs) && specsData.specs.length > 0) {
      const brokerSyms = specsData.specs.map(s => s.symbol);
      symbolDirectory.discoverFromBrokerSymbols(brokerSyms);

      for (const s of specsData.specs) {
        const canonical = s.symbol.toUpperCase();
        symbolDirectory.registerSpec({
          canonicalSymbol: canonical,
          brokerSymbol: s.symbol,
          description: s.symbol,
          digits: s.digits,
          point: s.point,
          contractSize: s.contractSize,
          minLot: s.volumeMin,
          maxLot: s.volumeMax,
          lotStep: s.volumeStep,
          tickValue: 1.0,
          tickSize: s.point,
          tradeMode: s.tradeMode === 0 ? 'DISABLED' : (s.tradeMode === 1 ? 'CLOSE_ONLY' : 'FULL'),
          pipSize: s.point * 10,
          source: 'BROKER',
        });
      }
    }

    // Build quotes dictionary
    const allQuotes: Record<string, MT5QuoteData> = {};
    if (quotesData && Array.isArray(quotesData.quotes)) {
      for (const q of quotesData.quotes) {
        const canonical = q.symbol.toUpperCase();
        const brokerSymbol = symbolDirectory.toBrokerSymbol(canonical) || canonical;
        const spec = symbolDirectory.getSpec(canonical);
        const digits = spec?.digits ?? 5;
        const point = spec?.point ?? 0.00001;
        const ageMs = Math.max(0, Date.now() - q.timestamp);
        const isStale = ageMs > 15000;

        allQuotes[canonical] = {
          canonicalSymbol: canonical,
          brokerSymbol,
          bid: q.bid,
          ask: q.ask,
          spread: q.spreadPoints,
          digits,
          point,
          time: new Date(q.timestamp).toISOString(),
          timestamp: q.timestamp,
          isStale,
          freshness: isStale ? 'STALE' : 'FRESH',
          ageMs,
        };
      }
    }

    // Convert positions
    const allPositions: MT5PositionItem[] = [];
    if (positionsData && Array.isArray(positionsData.positions)) {
      for (const p of positionsData.positions) {
        allPositions.push({
          ticket: p.ticket,
          symbol: p.symbol,
          type: p.type === 'BUY' ? 'BUY' : 'SELL',
          direction: p.type === 'BUY' ? 'BUY' : 'SELL',
          volume: p.volume,
          lots: p.volume,
          openPrice: p.openPrice,
          priceOpen: p.openPrice,
          currentPrice: p.currentPrice,
          priceCurrent: p.currentPrice,
          sl: p.sl,
          tp: p.tp,
          profit: p.profit,
          swap: p.swap,
          comment: p.comment,
          magic: p.magic,
          openTime: p.openTime,
          time: new Date(p.openTime).toISOString(),
        } as any);
      }
    }

    // Build Account Context
    let accountContext: MT5AccountContext | null = null;
    if (account) {
      const balance = account.balance || 0;
      const equity = account.equity || 0;
      const margin = account.margin || 0;
      const freeMargin = account.freeMargin || 0;
      const marginLevel = account.marginLevel || 0;
      const floatingPnl = equity - balance;
      const floatingPnlPct = balance > 0 ? (floatingPnl / balance) * 100 : 0;
      const freeMarginRatio = equity > 0 ? freeMargin / equity : 1.0;
      const equityToBalanceRatio = balance > 0 ? equity / balance : 1.0;

      let marginStressLevel: MarginStressLevel = 'SAFE';
      if (marginLevel > 0 && marginLevel < 100) marginStressLevel = 'CRITICAL_STOP_OUT_ALERT';
      else if (marginLevel > 0 && marginLevel < 200) marginStressLevel = 'HIGH_RISK';
      else if (marginLevel > 0 && marginLevel < 500) marginStressLevel = 'ELEVATED';

      const maskedLogin = account.accountNumber
        ? `${String(account.accountNumber).slice(0, 2)}***${String(account.accountNumber).slice(-2)}`
        : 'Unknown';

      accountContext = {
        maskedLogin,
        company: account.broker,
        broker: account.broker,
        server: 'Exness-MT5Trial16',
        currency: account.currency || 'USD',
        tradeMode: account.tradeMode,
        balance,
        equity,
        margin,
        freeMargin,
        marginLevel,
        leverage: 2000,
        tradeAllowed: account.tradeAllowed && !isRealAccount,
        soCall: 60,
        soStop: 0,
        marginStressLevel,
        freeMarginRatio,
        equityToBalanceRatio,
        floatingPnl,
        floatingPnlPct,
        isDemo: !isRealAccount,
        operatingMode: isRealAccount ? 'READ_ONLY' : 'DEMO_EXECUTION',
      };
    }

    // Build Terminal Status
    const terminal: MT5TerminalStatus = {
      terminalConnected: isTerminalFresh,
      brokerConnected: isTerminalFresh,
      brokerName: account?.broker || 'Exness Technologies Ltd',
      brokerServer: 'Exness-MT5Trial16',
      terminalBuild: 6230,
      tradeAllowed: !isRealAccount && Boolean(account?.tradeAllowed),
      tradeExpert: true,
      pingToBrokerMs: 196,
      bridgeVersion: '2.00',
      operatingMode: isRealAccount ? 'READ_ONLY' : 'DEMO_EXECUTION',
      lastHeartbeat: health.lastTerminalPollAt ? new Date(health.lastTerminalPollAt).toISOString() : new Date().toISOString(),
    };

    let state: BridgeConnectionState = 'CONNECTED_DEMO_EXECUTION';
    if (!isTerminalFresh) {
      state = 'MT5_OFFLINE';
    } else if (isRealAccount) {
      state = 'CONNECTED_READ_ONLY';
    }

    return {
      localBridgeOnline: true,
      mt5Connected: isTerminalFresh,
      isRemote: false,
      state,
      transport: 'EXECUTION BRIDGE V2 (HTTP / WEBREQUEST)',
      heartbeatAgeMs,
      lastHeartbeat: terminal.lastHeartbeat,
      terminal,
      account: accountContext,
      allPositions,
      allPendingOrders: [],
      allQuotes,
      operatingMode: isRealAccount ? 'READ_ONLY' : 'DEMO_EXECUTION',
      readOnlyLockActive: isRealAccount,
      lastSyncTimestamp: Date.now(),
    };
  }
}

export const executionBridgeV2Client = new ExecutionBridgeV2Client();
