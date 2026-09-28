import {
  MarketDataQuote,
  NewsItem,
  MacroIndicator,
  ProviderHealth,
  IMarketDataProvider
} from './provider-types';
import { providerRegistry } from './provider-registry';

export const SYSTEM_HEALTH_STATUS: ProviderHealth[] = [
  { name: 'Global News Wire (Yahoo / Fed RSS)', type: 'NEWS', status: 'HEALTHY', latencyMs: 24, lastChecked: 'Just now', isFreeTier: true },
  { name: 'Macro & Yields (Yahoo Finance ^TNX / DXY)', type: 'MACRO', status: 'HEALTHY', latencyMs: 38, lastChecked: '1m ago', isFreeTier: true },
  { name: 'Economic Calendar (FairEconomy / FF Feed)', type: 'CALENDAR', status: 'HEALTHY', latencyMs: 30, lastChecked: 'Just now', isFreeTier: true },
  { name: 'Crypto Feed (Binance Public Spot / LSR)', type: 'MARKET', status: 'HEALTHY', latencyMs: 18, lastChecked: 'Active', isFreeTier: true },
  { name: 'MetaTrader 5 Bridge (Telemetry / Socket)', type: 'MT5', status: 'HEALTHY', latencyMs: 12, lastChecked: 'Connected', isFreeTier: true },
  { name: 'Volume Profile & Flow Engine (Deterministic)', type: 'AI', status: 'HEALTHY', latencyMs: 6, lastChecked: 'Active', isFreeTier: true },
];

export class FreeMarketDataProvider implements IMarketDataProvider {
  async getQuote(symbol: string): Promise<MarketDataQuote> {
    const norm = (symbol || 'XAUUSD').toUpperCase();
    const primary = providerRegistry.getPrimaryMarketProvider();
    if (primary) {
      const q = await primary.getQuote(norm);
      if (q) {
        return {
          symbol: q.canonicalSymbol || norm,
          price: q.mid,
          bid: q.bid,
          ask: q.ask,
          spread: q.spread,
          changePercent: q.changePercent24h || 0,
          high: q.high24h || q.mid,
          low: q.low24h || q.mid,
          volume: q.volume24h || 0,
          timestamp: q.timestamp,
          source: q.providerId,
          status: 'VERIFIED'
        };
      }
    }

    return {
      symbol: norm,
      price: 0,
      bid: 0,
      ask: 0,
      spread: 0,
      changePercent: 0,
      high: 0,
      low: 0,
      volume: 0,
      timestamp: new Date().toISOString(),
      source: 'NONE',
      status: 'FALLBACK'
    };
  }

  async getCrossAssetMatrix(): Promise<MarketDataQuote[]> {
    const symbols = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USOIL', 'BTCUSD', 'US100', 'US500'];
    const results: MarketDataQuote[] = [];
    for (const sym of symbols) {
      results.push(await this.getQuote(sym));
    }
    return results;
  }
}

export const freeMarketDataProvider = new FreeMarketDataProvider();
