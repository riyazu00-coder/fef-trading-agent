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

export interface MT5HttpClientConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  magicNumber: number;
}

export const DEFAULT_HTTP_BRIDGE_CONFIG: MT5HttpClientConfig = {
  baseUrl: 'http://127.0.0.1:5556',
  token: process.env.FEF_BRIDGE_TOKEN || 'fef_local_bridge_token_v1',
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
    // 1. Reject live execution and unauthorized mutating commands
    if (RESTRICTED_EXECUTION_COMMANDS.has(command) && command !== 'PLACE_ORDER') {
      return {
        reqId: `req-${Date.now()}`,
        command,
        success: false,
        state: 'CONNECTED_READ_ONLY',
        error: {
          code: 'READ_ONLY_LOCK_ACTIVE',
          message: `Execution command '${command}' rejected: FEF MT5 Bridge is locked in READ_ONLY safety mode.`
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
      console.warn('[MT5HttpClient.getStatus non-200]:', res.status, res.statusText);
      return {
        success: false,
        localBridge: 'OFFLINE',
        mt5Connected: false,
        state: 'BRIDGE_OFFLINE',
        localBridgeLatencyMs: localLatencyMs,
      };
    } catch (err: any) {
      console.error('[MT5HttpClient.getStatus error]:', err?.message, err?.code, err?.cause);
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
   * Retrieve verified OHLC candles from the local MT5 bridge.
   * Returns UNAVAILABLE if the EA has not yet pushed candles for the requested symbol/timeframe.
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
