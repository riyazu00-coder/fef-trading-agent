/**
 * FEF TRADING SOLUTIONS — HTTP / WEBREQUEST MT5 BRIDGE CLIENT
 * 
 * Communicates with the local Node HTTP Bridge service (127.0.0.1:5556).
 * Queries aggregated push telemetry from FEF_HTTP_Bridge.mq5.
 * Distinguishes LOCAL HTTP BRIDGE LATENCY from MT5 HEARTBEAT AGE.
 * Defense-in-depth: Rejects all mutating commands with READ_ONLY_LOCK_ACTIVE.
 */

import {
  BridgeCommand,
  BridgeResponsePayload,
  RESTRICTED_EXECUTION_COMMANDS,
  MT5TerminalStatus,
  MT5AccountInfo,
  MT5QuoteData,
  MT5PositionItem,
  MT5PendingOrderItem,
  MT5BrokerSessionInfo,
  DemoOrderPayload,
  DemoExecutionResult
} from './mt5-bridge-protocol';
import { symbolDirectory } from './symbol-mapper';
import { READ_ONLY_EXECUTION_ERROR, isMt5OrderTransportAllowed } from '../execution/execution-policy';
import { telemetryRepository } from '../telemetry/telemetry-repository';

export interface MT5HttpClientConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  magicNumber: number;
}

export const DEFAULT_HTTP_BRIDGE_CONFIG: MT5HttpClientConfig = {
  baseUrl: 'http://127.0.0.1:5556',
  token: (process.env.FEF_BRIDGE_TOKEN || '').trim(),
  timeoutMs: 4000,
  magicNumber: 8882026,
};

export class MT5HttpClient {
  private config: MT5HttpClientConfig;

  constructor(config?: Partial<MT5HttpClientConfig>) {
    this.config = { ...DEFAULT_HTTP_BRIDGE_CONFIG, ...config };
  }

  public getConfig(): MT5HttpClientConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<MT5HttpClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Execute a command via POST /api/command to the HTTP Bridge service
   */
  public async sendCommand<T = any>(
    command: BridgeCommand,
    params?: Record<string, any>,
    symbol?: string
  ): Promise<BridgeResponsePayload<T>> {
    // 0. Enforce configured local bridge authentication token (fail-closed, no public fallback)
    if (!this.config.token || this.config.token === 'fef_local_bridge_token_v1') {
      return {
        reqId: `req-${Date.now()}`,
        command,
        success: false,
        state: 'ERROR',
        error: {
          code: 'BRIDGE_AUTH_NOT_CONFIGURED',
          message: 'FEF_BRIDGE_TOKEN is unconfigured or uses retired public fallback. Fail-closed.'
        },
        timestamp: Date.now()
      };
    }

    // 1. Reject live execution and unauthorized mutating commands if order transport is locked
    if (RESTRICTED_EXECUTION_COMMANDS.has(command) && !isMt5OrderTransportAllowed()) {
      return {
        reqId: `req-${Date.now()}`,
        command,
        success: false,
        state: 'CONNECTED_READ_ONLY',
        error: {
          code: READ_ONLY_EXECUTION_ERROR.code,
          message: `${READ_ONLY_EXECUTION_ERROR.message} Command '${command}' was denied.`
        },
        timestamp: Date.now()
      };
    }

    const startTime = Date.now();
    const reqId = `http-cmd-${startTime}`;

    try {
      const controller = new AbortController();
      const effectiveTimeout = command === 'PLACE_ORDER' ? Math.max(12000, this.config.timeoutMs) : this.config.timeoutMs;
      const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

      const res = await fetch(`${this.config.baseUrl}/api/command`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.token}`,
          'x-bridge-token': this.config.token,
        },
        body: JSON.stringify({
          reqId,
          command,
          symbol,
          params,
          token: this.config.token,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const localLatencyMs = Date.now() - startTime;

      if (!res.ok) {
        return {
          reqId,
          command,
          success: false,
          state: 'ERROR',
          latencyMs: localLatencyMs,
          error: {
            code: `HTTP_${res.status}`,
            message: `HTTP bridge service returned status ${res.status}`
          },
          timestamp: Date.now()
        };
      }

      const json = await res.json();
      return {
        ...json,
        latencyMs: localLatencyMs, // Local HTTP request latency
      };
    } catch (err: any) {
      const localLatencyMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError';

      return {
        reqId,
        command,
        success: false,
        state: 'BRIDGE_OFFLINE',
        latencyMs: localLatencyMs,
        error: {
          code: isTimeout ? 'BRIDGE_TIMEOUT' : 'BRIDGE_OFFLINE',
          message: isTimeout
            ? `HTTP bridge request exceeded ${this.config.timeoutMs}ms cap`
            : `Cannot connect to HTTP bridge on ${this.config.baseUrl}`
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get raw aggregated bridge status
   */
  public async getStatus(): Promise<any> {
    const isVercel = process.env.VERCEL === '1';

    // 1. In Vercel cloud production, NEVER attempt to contact localhost:5556
    if (isVercel || telemetryRepository.isCloudStoreConfigured()) {
      try {
        const hbRecord = await telemetryRepository.getLatestHeartbeat();
        const accRecord = await telemetryRepository.getLatestAccountStatus();

        if (hbRecord) {
          const hb = hbRecord.data;
          const acc = accRecord?.data;
          const capturedTime = Date.parse(hbRecord.capturedAt) || Date.now();
          const heartbeatAgeMs = Math.max(0, Date.now() - capturedTime);

          // Load all persisted broker quotes from the persistent symbol-indexed repository.
          // Returns {} when no quotes are present or all have expired — never invents data.
          const quotesMap = await telemetryRepository.getLatestQuotes();

          // Convert StoredRecord<QuoteItem> map to the quote dict shape expected by
          // MT5TelemetryContext (allQuotes / quotes) and MarketOverviewCard.
          // Each entry retains the fields needed for buildCanonicalFromBrokerQuote().
          const quotesDict: Record<string, {
            symbol: string;
            bid: number;
            ask: number;
            spread: number;
            timestamp: number;
            capturedAt: string;
            receivedAt: string;
            sequence: number;
            deviceId: string;
          }> = {};
          for (const [sym, rec] of Object.entries(quotesMap)) {
            quotesDict[sym] = {
              symbol: rec.data.symbol,
              bid: rec.data.bid,
              ask: rec.data.ask,
              spread: rec.data.spread,
              timestamp: rec.data.timestamp,
              capturedAt: rec.capturedAt,
              receivedAt: rec.receivedAt,
              sequence: rec.sequence,
              deviceId: rec.deviceId,
            };
          }

          // quotesAvailable reflects the number of actually retrievable quote records,
          // not the heartbeat's quotesCount (which could be stale / ahead of stored data).
          const quotesAvailable = Object.keys(quotesDict).length;

          return {
            success: true,
            transport: 'CLOUD_PERSISTENT_TELEMETRY',
            localBridge: 'ONLINE',
            mt5Connected: hb.terminalConnected,
            state: hb.terminalConnected ? 'CONNECTED_READ_ONLY' : 'MT5_OFFLINE',
            mode: 'READ_ONLY',
            operatingMode: hb.operatingMode || 'READ_ONLY',
            heartbeatAgeMs,
            lastHeartbeat: hbRecord.capturedAt,
            heartbeatCount: hbRecord.sequence,
            host: 'cloud-ingress',
            port: 443,
            terminal: {
              build: hb.terminalBuild,
              broker: hb.broker,
              server: hb.server,
              accountLogin: acc?.maskedLogin || '00***00',
              currency: acc?.currency || 'USD',
              magic: hb.magicNumber,
              terminalConnected: hb.terminalConnected,
              operatingMode: hb.operatingMode || 'READ_ONLY',
            },
            account: acc
              ? {
                  maskedLogin: acc.maskedLogin,
                  broker: acc.broker,
                  server: acc.server,
                  currency: acc.currency,
                  tradeMode: acc.tradeMode,
                  balance: acc.balance,
                  equity: acc.equity,
                  margin: acc.margin,
                  freeMargin: acc.freeMargin,
                  marginLevel: acc.marginLevel,
                  leverage: acc.leverage,
                  tradeAllowed: false,
                  terminalBuild: hb.terminalBuild,
                  operatingMode: acc.operatingMode,
                  lastUpdated: Date.parse(accRecord!.capturedAt) || Date.now(),
                }
              : undefined,
            activePositionsCount: 0,
            activeOrdersCount: 0,
            quotesAvailable,
            quotes: quotesDict,
            allQuotes: quotesDict,
            positions: [],
            orders: [],
            sessions: {},
            symbols: Object.keys(quotesDict),
            symbolSpecs: [],
            specsBySymbol: {},
            assetDiagnostics: {},
            journal: [],
            localBridgeLatencyMs: 5,
          };
        }
      } catch (err: any) {
        console.warn('[MT5HttpClient.getStatus] Error reading cloud telemetry:', err?.message);
      }

      // If running on Vercel and no cloud telemetry found, fail closed immediately (DO NOT call localhost)
      if (isVercel) {
        return {
          success: false,
          localBridge: 'OFFLINE',
          mt5Connected: false,
          state: 'BRIDGE_OFFLINE',
          localBridgeLatencyMs: 0,
          error: { code: 'NO_CLOUD_TELEMETRY', message: 'No live telemetry found in cloud persistent store' },
        };
      }
    }

    // 2. Local development: query local HTTP Bridge (:5556)
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const res = await fetch(`${this.config.baseUrl}/api/status`, {
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'x-bridge-token': this.config.token,
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const localLatencyMs = Date.now() - startTime;

      if (res.ok) {
        const json = await res.json();
        return {
          ...json,
          localBridgeLatencyMs: localLatencyMs,
        };
      }
      return {
        success: false,
        localBridge: 'OFFLINE',
        mt5Connected: false,
        state: 'BRIDGE_OFFLINE',
        localBridgeLatencyMs: localLatencyMs,
      };
    } catch (err: any) {
      return {
        success: false,
        localBridge: 'OFFLINE',
        mt5Connected: false,
        state: 'BRIDGE_OFFLINE',
        localBridgeLatencyMs: Date.now() - startTime,
      };
    }
  }

  public async ping(): Promise<BridgeResponsePayload<{ status: string }>> {
    return this.sendCommand<{ status: string }>('PING');
  }

  public async getTerminalStatus(): Promise<BridgeResponsePayload<MT5TerminalStatus>> {
    return this.sendCommand<MT5TerminalStatus>('GET_TERMINAL_STATUS');
  }

  public async getAccount(): Promise<BridgeResponsePayload<MT5AccountInfo>> {
    return this.sendCommand<MT5AccountInfo>('GET_ACCOUNT');
  }

  public async getQuote(symbol: string): Promise<BridgeResponsePayload<MT5QuoteData>> {
    const isVercel = process.env.VERCEL === '1';

    // 1. In cloud production or when cloud store is configured, check persistent repository first
    if (isVercel || telemetryRepository.isCloudStoreConfigured()) {
      try {
        const record = await telemetryRepository.getLatestQuote(symbol.toUpperCase());
        if (record) {
          const q = record.data;
          const quoteAgeMs = Math.max(0, Date.now() - q.timestamp);
          const normSym = symbol.toUpperCase();
          return {
            reqId: `cloud-quote-${Date.now()}`,
            command: 'GET_QUOTE',
            success: true,
            state: 'CONNECTED_READ_ONLY',
            data: {
              canonicalSymbol: normSym,
              brokerSymbol: normSym,
              bid: q.bid,
              ask: q.ask,
              spread: q.spread,
              digits: 5,
              point: 0.00001,
              time: new Date(q.timestamp).toISOString(),
              timestamp: q.timestamp,
              isStale: quoteAgeMs > 15000,
              ageMs: quoteAgeMs,
            },
            timestamp: Date.now(),
          };
        }
      } catch (err: any) {
        console.warn('[MT5HttpClient.getQuote] Cloud quote error:', err?.message);
      }

      if (isVercel) {
        return {
          reqId: `cloud-quote-${Date.now()}`,
          command: 'GET_QUOTE',
          success: false,
          state: 'MT5_OFFLINE',
          error: { code: 'QUOTE_UNAVAILABLE', message: `No quote available in cloud store for ${symbol}` },
          timestamp: Date.now(),
        };
      }
    }

    return this.sendCommand<MT5QuoteData>('GET_QUOTE', undefined, symbol);
  }

  public async getPositions(): Promise<BridgeResponsePayload<{ positions: MT5PositionItem[] }>> {
    return this.sendCommand<{ positions: MT5PositionItem[] }>('GET_POSITIONS');
  }

  public async getPendingOrders(): Promise<BridgeResponsePayload<{ orders: MT5PendingOrderItem[] }>> {
    return this.sendCommand<{ orders: MT5PendingOrderItem[] }>('GET_PENDING_ORDERS');
  }

  public async getSymbols(): Promise<BridgeResponsePayload<{ symbols: string[] }>> {
    const res = await this.sendCommand<{ symbols: string[] }>('GET_SYMBOLS');
    if (res.success && res.data?.symbols) {
      symbolDirectory.discoverFromBrokerSymbols(res.data.symbols);
    }
    return res;
  }

  public async getBrokerSessions(symbol?: string): Promise<BridgeResponsePayload<MT5BrokerSessionInfo>> {
    return this.sendCommand<MT5BrokerSessionInfo>('GET_BROKER_SESSIONS', undefined, symbol);
  }

  /**
   * Retrieve verified OHLC candles from persistent cloud telemetry or local bridge.
   * Returns UNAVAILABLE if candles have not yet been pushed for the requested symbol/timeframe.
   */
  public async getCandles(symbol: string, timeframe: string): Promise<{
    success: boolean;
    state: string;
    symbol: string;
    timeframe: string;
    count: number;
    updatedAt?: number;
    ageMs?: number;
    candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; tickVolume: number }>;
    error?: { code: string; message: string };
  }> {
    const isVercel = process.env.VERCEL === '1';

    // 1. Check persistent cloud telemetry store
    if (isVercel || telemetryRepository.isCloudStoreConfigured()) {
      try {
        const record = await telemetryRepository.getLatestCandles(symbol.toUpperCase(), timeframe.toUpperCase());
        if (record && record.data.candles && record.data.candles.length > 0) {
          const c = record.data;
          const capturedTime = Date.parse(record.capturedAt) || Date.now();
          return {
            success: true,
            state: 'VERIFIED_REAL',
            symbol: c.canonicalSymbol,
            timeframe: c.timeframe,
            count: c.candles.length,
            updatedAt: capturedTime,
            ageMs: Math.max(0, Date.now() - capturedTime),
            candles: c.candles.map((b) => ({
              timestamp: b.timestamp,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              tickVolume: b.tickVolume || 0,
            })),
          };
        }
      } catch (err: any) {
        console.warn('[MT5HttpClient.getCandles] Cloud candles error:', err?.message);
      }

      if (isVercel) {
        return {
          success: false,
          state: 'UNAVAILABLE',
          symbol,
          timeframe,
          count: 0,
          candles: [],
          error: { code: 'NO_CLOUD_CANDLES', message: `No verified candles in cloud store for ${symbol} (${timeframe})` },
        };
      }
    }

    // 2. Local development fallback to local HTTP Bridge
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      const res = await fetch(
        `${this.config.baseUrl}/api/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.token}`,
            'x-bridge-token': this.config.token,
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (res.ok) {
        return await res.json();
      }
      return { success: false, state: 'UNAVAILABLE', symbol, timeframe, count: 0, candles: [], error: { code: 'BRIDGE_ERROR', message: `HTTP ${res.status}` } };
    } catch (err: any) {
      return { success: false, state: 'BRIDGE_OFFLINE', symbol, timeframe, count: 0, candles: [], error: { code: 'BRIDGE_OFFLINE', message: err?.message || 'Bridge unreachable' } };
    }
  }

  public async placeDemoOrder(payload: DemoOrderPayload): Promise<BridgeResponsePayload<DemoExecutionResult>> {
    return this.sendCommand<DemoExecutionResult>('PLACE_ORDER', payload as any, payload.brokerSymbol);
  }
}

export const mt5HttpClient = new MT5HttpClient();
