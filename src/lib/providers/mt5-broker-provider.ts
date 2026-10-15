/**
 * FEF CORTEX — MT5 BROKER PROVIDER ADAPTER
 * 
 * Integrates the local MT5 bridge client into the multi-source provider architecture.
 * Implements BrokerDataProvider with mandatory read-only execution lock and
 * dynamic broker/server provenance attribution.
 */

import {
  BrokerDataProvider,
  ProviderHealth,
  NormalizedMarketQuote,
  NormalizedCandle,
  ProviderSourceType,
} from './types';
import { mt5HttpClient } from '../bridge/mt5-http-client';
import { providerRegistry } from './provider-registry';

export class MT5BrokerProvider implements BrokerDataProvider {
  public readonly id = 'mt5-broker-bridge';
  public readonly name = 'MetaTrader 5 Bridge';
  public readonly sourceType: ProviderSourceType = 'BROKER_MT5';
  public readonly supportedAssets = [
    'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'BTCUSD', 'ETHUSD', 'USOIL', 'US100', 'US500'
  ] as const;

  private cachedBrokerName: string = 'Broker Bridge';
  private cachedServerName: string = 'MT5 Server';
  private cachedAccountType: string = 'DEMO';
  private lastAccountCheck: number = 0;

  constructor() {
    this.refreshAccountInfoSilently();
  }

  private async refreshAccountInfoSilently(): Promise<void> {
    const now = Date.now();
    if (now - this.lastAccountCheck < 30000) return; // Cache for 30s
    this.lastAccountCheck = now;

    try {
      const res = await mt5HttpClient.getAccount();
      if (res.success && res.data) {
        if (res.data.company) this.cachedBrokerName = res.data.company;
        if (res.data.server) this.cachedServerName = res.data.server;
        if (res.data.tradeMode === 'REAL') {
          this.cachedAccountType = 'REAL';
        } else {
          this.cachedAccountType = 'DEMO';
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  public getBrokerName(): string {
    this.refreshAccountInfoSilently();
    return this.cachedBrokerName;
  }

  public getServerName(): string {
    return this.cachedServerName;
  }

  public getAccountType(): string {
    return this.cachedAccountType;
  }

  /**
   * STRICT ARCHITECTURAL INVARIANT: Read-only execution lock is permanently active.
   */
  public isExecutionLocked(): true {
    return true;
  }

  public async getHealth(): Promise<ProviderHealth> {
    const status = await mt5HttpClient.getStatus();
    const isHealthy = status.success && status.mt5Connected;
    const isDegraded = status.success && !status.mt5Connected;

    return {
      providerId: this.id,
      name: `${this.name} (${this.cachedBrokerName})`,
      sourceType: this.sourceType,
      status: isHealthy ? 'HEALTHY' : isDegraded ? 'DEGRADED' : 'OFFLINE',
      latencyMs: status.localBridgeLatencyMs || 0,
      lastChecked: new Date().toISOString(),
      lastSuccess: isHealthy ? new Date().toISOString() : undefined,
      errorCount: isHealthy ? 0 : 1,
      rateLimit: { isThrottled: false },
      isFreeTier: true,
    };
  }

  public async getQuote(symbol: string): Promise<NormalizedMarketQuote | null> {
    const norm = (symbol || 'XAUUSD').toUpperCase();

    // 0. Primary: Authoritative Local SQLite Market Data
    try {
      const { getLocalMarketDataProvider } = await import('./local-market-data-provider');
      const localProvider = getLocalMarketDataProvider();
      const localQuote = await localProvider.getLatestQuote(norm);
      if (localQuote && localQuote.bid > 0) {
        return {
          symbol: norm,
          canonicalSymbol: norm,
          bid: localQuote.bid,
          ask: localQuote.ask,
          mid: localQuote.mid,
          spread: localQuote.spread,
          spreadPips: localQuote.spread,
          timestamp: new Date(localQuote.quoteTimestamp).toISOString(),
          epochMs: localQuote.quoteTimestamp,
          providerId: this.id,
          sourceType: this.sourceType,
          classification: 'LIVE_MT5',
          isExecutable: false,
        };
      }
    } catch {}

    try {
      const res = await mt5HttpClient.getQuote(norm);
      if (res.success && res.data) {
        const q = res.data;
        const bid = q.bid;
        const ask = q.ask;
        const mid = (bid + ask) / 2;
        const spread = q.spread || (ask - bid);
        const epochMs = q.timestamp || (q.time ? new Date(q.time).getTime() : Date.now());

        return {
          symbol: norm,
          canonicalSymbol: norm,
          bid,
          ask,
          mid,
          spread,
          spreadPips: spread,
          timestamp: new Date(epochMs).toISOString(),
          epochMs,
          providerId: this.id,
          sourceType: this.sourceType,
          classification: 'LIVE_MT5',
          isExecutable: false, // Architectural invariant: analysis only
        };
      }
    } catch {
      // Fallback
    }
    return null;
  }

  public async getQuotes(symbols: string[]): Promise<Map<string, NormalizedMarketQuote>> {
    const map = new Map<string, NormalizedMarketQuote>();
    await Promise.all(
      symbols.map(async (s) => {
        const q = await this.getQuote(s);
        if (q) map.set(s, q);
      })
    );
    return map;
  }

  public async getCandles(symbol: string, timeframe: string, count: number = 50): Promise<NormalizedCandle[]> {
    const norm = (symbol || 'XAUUSD').toUpperCase();

    // 0. Primary: Authoritative Local SQLite Market Data
    try {
      const { getLocalMarketDataProvider } = await import('./local-market-data-provider');
      const localProvider = getLocalMarketDataProvider();
      const cRes = await localProvider.getCandles(norm, timeframe, count);
      if (cRes && cRes.count >= 10) {
        return cRes.candles.map((c) => ({
          symbol: norm,
          timeframe,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          tickVolume: c.tickVolume,
          time: new Date(c.timestamp).toISOString(),
          epochMs: c.timestamp,
          isComplete: true,
        }));
      }
    } catch {}

    try {
      const res = await mt5HttpClient.getCandles(norm, timeframe);
      if (res.success && Array.isArray(res.candles) && res.candles.length > 0) {
        return res.candles.slice(-count).map((c) => ({
          symbol: norm,
          timeframe,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          tickVolume: c.tickVolume,
          time: new Date(c.timestamp).toISOString(),
          epochMs: c.timestamp,
          isComplete: true,
        }));
      }
    } catch {
      // Fallback
    }
    return [];
  }
}

export const mt5BrokerProvider = new MT5BrokerProvider();
providerRegistry.registerBrokerProvider(mt5BrokerProvider, true);
