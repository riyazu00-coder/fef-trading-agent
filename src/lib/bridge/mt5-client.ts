/**
 * FEF TRADING SOLUTIONS — SERVER-SIDE MT5 BRIDGE CLIENT
 * 
 * Communicates with the local MT5 Expert Advisor over TCP socket loopback (127.0.0.1:5555).
 * Enforces command allowlists, request timeouts, real latency measurement, and strict read-only safety.
 */

import * as net from 'net';
import {
  BridgeCommand,
  BridgeConnectionState,
  BridgeRequestPayload,
  BridgeResponsePayload,
  ALLOWED_READ_COMMANDS,
  RESTRICTED_EXECUTION_COMMANDS,
  MT5TerminalStatus,
  MT5AccountInfo,
  MT5QuoteData,
  MT5PositionItem,
  MT5PendingOrderItem,
  MT5SymbolSpecification,
  MT5BrokerSessionInfo
} from './mt5-bridge-protocol';
import { symbolDirectory } from './symbol-mapper';
import { evaluateMarketSession } from '../session/market-session-engine';
import { READ_ONLY_EXECUTION_ERROR, isMt5OrderTransportAllowed } from '../execution/execution-policy';

export interface MT5ClientConfig {
  host: string;
  port: number;
  token?: string;
  timeoutMs: number;
  magicNumber: number;
  executionEnabled: boolean;
  transport?: (rawJson: string) => Promise<string>;
}

export const DEFAULT_BRIDGE_CONFIG: MT5ClientConfig = {
  host: '127.0.0.1',
  port: 5555,
  token: process.env.FEF_BRIDGE_TOKEN || 'fef_local_bridge_token_v1',
  timeoutMs: 1500,
  magicNumber: 8882026,
  executionEnabled: false // STRICT READ-ONLY DEFAULT
};

export class MT5BridgeClient {
  private config: MT5ClientConfig;
  private pendingRequests: Map<string, {
    resolve: (res: BridgeResponsePayload) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
    startTime: number;
  }> = new Map();

  constructor(config?: Partial<MT5ClientConfig>) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };
  }

  public updateConfig(config: Partial<MT5ClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getConfig(): MT5ClientConfig {
    return { ...this.config };
  }

  /**
   * Low-level socket dispatch to MT5 bridge with structured timeout and response parsing
   */
  public async sendCommand<T = any>(
    command: BridgeCommand,
    params?: Record<string, any>,
    symbol?: string
  ): Promise<BridgeResponsePayload<T>> {
    // 1. Safety Gate: Reject write commands unless execution is explicitly enabled
    if (RESTRICTED_EXECUTION_COMMANDS.has(command) && (!this.config.executionEnabled || !isMt5OrderTransportAllowed())) {
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

    // 1b. Risk Guardian Hard Gate: Market Session Executability Check
    if (RESTRICTED_EXECUTION_COMMANDS.has(command) && symbol) {
      const session = evaluateMarketSession(symbol, new Date());
      if (!session.tradeExecutable) {
        return {
          reqId: `req-${Date.now()}`,
          command,
          success: false,
          state: 'ERROR',
          error: {
            code: 'MARKET_CLOSED',
            message: `Risk Guardian Hard Gate: Execution command '${command}' rejected because market for ${symbol} is ${session.statusLabel}. Reopens in ${session.nextOpenCountdown}.`
          },
          timestamp: Date.now()
        };
      }
    }

    // 2. Validate command allowlist
    if (!ALLOWED_READ_COMMANDS.has(command) && !RESTRICTED_EXECUTION_COMMANDS.has(command)) {
      return {
        reqId: `req-${Date.now()}`,
        command,
        success: false,
        state: 'ERROR',
        error: {
          code: 'INVALID_COMMAND',
          message: `Command '${command}' is not recognized in MT5 bridge protocol allowlist.`
        },
        timestamp: Date.now()
      };
    }

    const reqId = `fef-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const payload: BridgeRequestPayload = {
      reqId,
      command,
      token: this.config.token,
      magicNumber: this.config.magicNumber,
      symbol,
      params,
      timestamp: Date.now()
    };

    // Optional direct transport (used for sandbox test suite isolation or custom IPC)
    if (this.config.transport) {
      const startTime = Date.now();
      try {
        const rawJson = JSON.stringify(payload) + '\n';
        const rawResp = await this.config.transport(rawJson);
        const parsed = JSON.parse(rawResp.trim()) as BridgeResponsePayload<T>;
        parsed.latencyMs = Date.now() - startTime;
        return parsed;
      } catch (err: any) {
        return {
          reqId,
          command,
          success: false,
          state: 'ERROR',
          error: { code: 'TRANSPORT_ERROR', message: err.message || 'Direct transport error' },
          latencyMs: Date.now() - startTime,
          timestamp: Date.now()
        };
      }
    }

    return new Promise<BridgeResponsePayload<T>>((resolve) => {
      const startTime = Date.now();
      const socket = new net.Socket();
      let responseBuffer = '';
      let isResolved = false;

      const finish = (result: BridgeResponsePayload<T>) => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(result);
      };

      const timer = setTimeout(() => {
        finish({
          reqId,
          command,
          success: false,
          state: 'BRIDGE_OFFLINE',
          error: {
            code: 'SOCKET_TIMEOUT',
            message: `MT5 Bridge socket timed out after ${this.config.timeoutMs}ms waiting for response.`
          },
          latencyMs: Date.now() - startTime,
          timestamp: Date.now()
        });
      }, this.config.timeoutMs);

      socket.connect(this.config.port, this.config.host, () => {
        const jsonStr = JSON.stringify(payload) + '\n';
        socket.write(jsonStr, 'utf8');
      });

      socket.on('data', (chunk) => {
        responseBuffer += chunk.toString('utf8');
        // Parse newline-delimited JSON response
        if (responseBuffer.includes('\n')) {
          const lines = responseBuffer.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.length > 0) {
              try {
                const parsed = JSON.parse(trimmed) as BridgeResponsePayload<T>;
                parsed.latencyMs = Date.now() - startTime;
                finish(parsed);
                return;
              } catch (parseErr) {
                // If malformed, continue buffering or error out
              }
            }
          }
        }
      });

      socket.on('error', (err: any) => {
        let state: BridgeConnectionState = 'ERROR';
        let code = 'SOCKET_ERROR';
        let msg = err.message || 'Unknown socket error';

        if (err.code === 'ECONNREFUSED' || err.code === 'EPERM') {
          state = 'BRIDGE_OFFLINE';
          code = 'ECONNREFUSED';
          msg = `MT5 Bridge is offline. Connection refused at ${this.config.host}:${this.config.port}. Ensure MetaTrader 5 is running with FEF_Bridge.mq5 attached.`;
        } else if (err.code === 'ETIMEDOUT') {
          state = 'BRIDGE_OFFLINE';
          code = 'ETIMEDOUT';
          msg = `Connection to MT5 Bridge at ${this.config.host}:${this.config.port} timed out.`;
        }

        finish({
          reqId,
          command,
          success: false,
          state,
          error: {
            code,
            message: msg
          },
          latencyMs: Date.now() - startTime,
          timestamp: Date.now()
        });
      });

      socket.on('close', () => {
        if (!isResolved) {
          finish({
            reqId,
            command,
            success: false,
            state: 'MT5_OFFLINE',
            error: {
              code: 'CONNECTION_CLOSED',
              message: 'Bridge socket closed before response completed.'
            },
            latencyMs: Date.now() - startTime,
            timestamp: Date.now()
          });
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // High-Level Authenticated API Methods
  // --------------------------------------------------------------------------

  public async ping(): Promise<BridgeResponsePayload<{ status: string; terminalBuild: number }>> {
    return this.sendCommand('PING');
  }

  public async getTerminalStatus(): Promise<BridgeResponsePayload<MT5TerminalStatus>> {
    return this.sendCommand('GET_TERMINAL_STATUS');
  }

  public async getAccount(): Promise<BridgeResponsePayload<MT5AccountInfo>> {
    return this.sendCommand('GET_ACCOUNT');
  }

  public async getSymbols(): Promise<BridgeResponsePayload<{ symbols: string[] }>> {
    const res = await this.sendCommand<{ symbols: string[] }>('GET_SYMBOLS');
    if (res.success && res.data?.symbols) {
      symbolDirectory.discoverFromBrokerSymbols(res.data.symbols);
    }
    return res;
  }

  public async getSymbolInfo(symbol: string): Promise<BridgeResponsePayload<MT5SymbolSpecification>> {
    const brokerSym = symbolDirectory.toBrokerSymbol(symbol) || symbol;
    const res = await this.sendCommand<MT5SymbolSpecification>('GET_SYMBOL_INFO', undefined, brokerSym);
    if (res.success && res.data) {
      symbolDirectory.registerSpec(res.data);
    }
    return res;
  }

  public async getQuote(canonicalSymbol: string): Promise<BridgeResponsePayload<MT5QuoteData>> {
    const brokerSym = symbolDirectory.toBrokerSymbol(canonicalSymbol) || canonicalSymbol;
    const res = await this.sendCommand<MT5QuoteData>('GET_QUOTE', undefined, brokerSym);
    if (res.success && res.data) {
      res.data.canonicalSymbol = canonicalSymbol;
    }
    return res;
  }

  public async getPositions(): Promise<BridgeResponsePayload<{ positions: MT5PositionItem[] }>> {
    const res = await this.sendCommand<{ positions: MT5PositionItem[] }>('GET_POSITIONS');
    if (res.success && res.data?.positions) {
      // Map broker symbols to canonical FEF symbols for display
      res.data.positions.forEach((pos) => {
        pos.canonicalSymbol = symbolDirectory.toCanonicalSymbol(pos.symbol);
      });
    }
    return res;
  }

  public async getPendingOrders(): Promise<BridgeResponsePayload<{ orders: MT5PendingOrderItem[] }>> {
    const res = await this.sendCommand<{ orders: MT5PendingOrderItem[] }>('GET_PENDING_ORDERS');
    if (res.success && res.data?.orders) {
      res.data.orders.forEach((ord) => {
        ord.canonicalSymbol = symbolDirectory.toCanonicalSymbol(ord.symbol);
      });
    }
    return res;
  }

  public async getBrokerSessions(canonicalSymbol?: string): Promise<BridgeResponsePayload<MT5BrokerSessionInfo>> {
    const brokerSym = canonicalSymbol ? (symbolDirectory.toBrokerSymbol(canonicalSymbol) || canonicalSymbol) : undefined;
    return this.sendCommand<MT5BrokerSessionInfo>('GET_BROKER_SESSIONS', undefined, brokerSym);
  }
}

export const mt5BridgeClient = new MT5BridgeClient();
