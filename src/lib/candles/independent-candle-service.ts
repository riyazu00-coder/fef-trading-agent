/**
 * FEF TRADING SOLUTIONS — INDEPENDENT CANDLE SERVICE
 * Phase 2D & V1.1 Verified OHLC Engine
 *
 * Provides real historical OHLC candlesticks from verified public endpoints:
 * 1. Binance Public Klines for Crypto (BTCUSD, ETHUSD, SOLUSD) and Gold proxy (PAXGUSDT)
 * 2. Yahoo Finance Public Chart API for Forex (EURUSD, GBPUSD, USDJPY, USDCHF),
 *    Indices (US100, US500, US30), Energy (USOIL), and CME Futures Proxy (GC=F, SI=F)
 * 3. In-Memory Rolling Verified Candle Cache
 * 4. Fallback to DATA LIMITED with zero synthetic or fake candle generation
 */

import { validateCandleSeries, RawCandleInput } from './candle-validator';
import { OHLCCandle } from '../market/canonical-market-snapshot';
import {
  deriveTrustedBrokerCandleProvenance,
  TrustedBrokerCandleIdentity,
} from './candle-provenance-policy';

export interface VerifiedCandleResponse {
  success: boolean;
  state: 'VERIFIED' | 'UNAVAILABLE' | 'DATA_LIMITED';
  symbol: string;
  timeframe: string;
  count: number;
  provider: string;
  broker?: string;
  server?: string;
  provenance: string;
  source?: string;
  authenticatedSource?: string;
  updatedAt: number;
  ageMs: number;
  candles: OHLCCandle[];
  error?: { code: string; message: string };
}

export interface CandleProviderAdapter {
  name: string;
  supports(symbol: string, timeframe: string): boolean;
  fetchCandles(
    symbol: string,
    timeframe: string,
    limit?: number
  ): Promise<{
    candles: RawCandleInput[];
    provider: string;
    provenance: string;
  } | null>;
}

// Global memory cache for verified candle batches
const candleCache = new Map<string, { response: VerifiedCandleResponse; cachedAt: number }>();
const CACHE_TTL_MS: Record<string, number> = {
  M1: 15_000,
  M5: 30_000,
  M15: 60_000,
  M30: 90_000,
  H1: 120_000,
  H4: 300_000,
  D1: 600_000,
};

// =========================================================================
// 1. BINANCE PUBLIC SPOT ADAPTER
// =========================================================================

const BINANCE_INTERVAL_MAP: Record<string, string> = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
};

const BINANCE_SYMBOLS: Record<string, string> = {
  BTCUSD: 'BTCUSDT',
  ETHUSD: 'ETHUSDT',
  SOLUSD: 'SOLUSDT',
  XAUUSD: 'PAXGUSDT', // Reference proxy only
};

export class BinanceSpotAdapter implements CandleProviderAdapter {
  name = 'Binance Public Spot';

  supports(symbol: string, timeframe: string): boolean {
    const sym = symbol.toUpperCase();
    const tf = timeframe.toUpperCase();
    return Boolean(BINANCE_SYMBOLS[sym] && BINANCE_INTERVAL_MAP[tf]);
  }

  async fetchCandles(
    symbol: string,
    timeframe: string,
    limit: number = 50
  ): Promise<{ candles: RawCandleInput[]; provider: string; provenance: string } | null> {
    const sym = symbol.toUpperCase();
    const tf = timeframe.toUpperCase();
    const binanceSym = BINANCE_SYMBOLS[sym];
    const bInterval = BINANCE_INTERVAL_MAP[tf];
    if (!binanceSym || !bInterval) return null;

    const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binanceSym)}&interval=${encodeURIComponent(bInterval)}&limit=${limit}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data)) return null;

      // Binance format: [openTime, open, high, low, close, volume, closeTime, ...]
      const candles: RawCandleInput[] = data.map((item: any) => ({
        timestamp: Number(item[0]),
        open: parseFloat(item[1]),
        high: parseFloat(item[2]),
        low: parseFloat(item[3]),
        close: parseFloat(item[4]),
        tickVolume: parseFloat(item[5]) || 0,
      }));

      const isProxy = sym === 'XAUUSD';
      return {
        candles,
        provider: isProxy ? 'Binance PAXG/USDT (Spot Proxy)' : 'Binance Public Spot',
        provenance: isProxy ? 'INDEPENDENT_REFERENCE_OHLC' : 'INDEPENDENT_VERIFIED_OHLC',
      };
    } catch {
      clearTimeout(timer);
      return null;
    }
  }
}

// =========================================================================
// 2. YAHOO FINANCE PUBLIC CHART ADAPTER
// =========================================================================

const YAHOO_SYMBOLS: Record<string, string> = {
  // Forex
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'JPY=X',
  USDCHF: 'CHF=X',
  AUDUSD: 'AUDUSD=X',
  GBPJPY: 'GBPJPY=X',

  // Indices
  US100: '^NDX',
  US500: '^GSPC',
  US30: '^DJI',

  // Commodities & Energy
  USOIL: 'CL=F',

  // Metals Reference / Proxies
  XAUUSD: 'GC=F',
  XAGUSD: 'SI=F',

  // Macro & Yield Feeds
  TNX: '^TNX',
  DXY: 'DX-Y.NYB',
};

function aggregateCandlesToH4(hourlyCandles: RawCandleInput[]): RawCandleInput[] {
  if (!hourlyCandles || hourlyCandles.length === 0) return [];
  const FOUR_HOURS_MS = 4 * 3600 * 1000;
  const h4Buckets = new Map<number, RawCandleInput[]>();

  for (const c of hourlyCandles) {
    const bucketStart = Math.floor(c.timestamp / FOUR_HOURS_MS) * FOUR_HOURS_MS;
    if (!h4Buckets.has(bucketStart)) {
      h4Buckets.set(bucketStart, []);
    }
    h4Buckets.get(bucketStart)!.push(c);
  }

  const h4Candles: RawCandleInput[] = [];
  const sortedStarts = Array.from(h4Buckets.keys()).sort((a, b) => a - b);

  for (const start of sortedStarts) {
    const group = h4Buckets.get(start)!;
    if (group.length === 0) continue;
    const open = group[0].open;
    const close = group[group.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let tickVolume = 0;
    for (const item of group) {
      if (item.high > high) high = item.high;
      if (item.low < low) low = item.low;
      tickVolume += item.tickVolume || 0;
    }
    h4Candles.push({
      timestamp: start,
      open,
      high,
      low,
      close,
      tickVolume,
    });
  }

  return h4Candles;
}

export class YahooFinanceChartAdapter implements CandleProviderAdapter {
  name = 'Yahoo Finance Public Chart';

  supports(symbol: string, timeframe: string): boolean {
    const sym = symbol.toUpperCase();
    const tf = timeframe.toUpperCase();
    const validTfs = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    return Boolean(YAHOO_SYMBOLS[sym] && validTfs.includes(tf));
  }

  async fetchCandles(
    symbol: string,
    timeframe: string,
    limit: number = 50
  ): Promise<{ candles: RawCandleInput[]; provider: string; provenance: string } | null> {
    const sym = symbol.toUpperCase();
    const tf = timeframe.toUpperCase();
    const yahooSym = YAHOO_SYMBOLS[sym];
    if (!yahooSym) return null;

    let interval = '1h';
    let range = '5d';

    if (tf === 'M1') {
      interval = '1m';
      range = '1d';
    } else if (tf === 'M5') {
      interval = '5m';
      range = '1d';
    } else if (tf === 'M15') {
      interval = '15m';
      range = '5d';
    } else if (tf === 'M30') {
      interval = '30m';
      range = '5d';
    } else if (tf === 'H1') {
      interval = '1h';
      range = '1mo';
    } else if (tf === 'H4') {
      interval = '1h';
      range = '1mo';
    } else if (tf === 'D1') {
      interval = '1d';
      range = '3mo';
    }

    const hosts = ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com'];
    let lastError: any = null;

    for (const host of hosts) {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=${interval}&range=${range}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
          },
        });
        clearTimeout(timer);

        if (!res.ok) {
          continue; // Try next host if 429 or 5xx
        }

        const data = await res.json();
        const res0 = data.chart?.result?.[0];
        if (!res0) continue;

        const timestamps: number[] = res0.timestamp || [];
        const quote = res0.indicators?.quote?.[0] || {};
        const opens = quote.open || [];
        const highs = quote.high || [];
        const lows = quote.low || [];
        const closes = quote.close || [];
        const volumes = quote.volume || [];

        const parsed: RawCandleInput[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          const o = opens[i];
          const h = highs[i];
          const l = lows[i];
          const c = closes[i];
          const v = volumes[i] || 0;

          // Skip null or corrupted intervals
          if (o != null && h != null && l != null && c != null && !isNaN(o) && !isNaN(h) && !isNaN(l) && !isNaN(c)) {
            const numOpen = Number(o.toFixed(5));
            const numClose = Number(c.toFixed(5));
            const numHigh = Number(Math.max(h, o, c).toFixed(5));
            const numLow = Number(Math.min(l, o, c).toFixed(5));
            parsed.push({
              timestamp: timestamps[i] * 1000,
              open: numOpen,
              high: numHigh,
              low: numLow,
              close: numClose,
              tickVolume: v,
            });
          }
        }

        if (parsed.length === 0) continue;

        let resultCandles = parsed;
        if (tf === 'H4') {
          resultCandles = aggregateCandlesToH4(parsed);
        }

        // Limit to requested count
        if (resultCandles.length > limit) {
          resultCandles = resultCandles.slice(-limit);
        }

        // Determine truthful provider & provenance labels
        let provider = 'Yahoo Finance Public Chart';
        let provenance = 'INDEPENDENT_VERIFIED_OHLC';

        if (sym === 'XAUUSD') {
          provider = 'Yahoo Finance CME GC=F (Gold Futures Proxy)';
          provenance = 'INDEPENDENT_REFERENCE_OHLC';
        } else if (sym === 'XAGUSD') {
          provider = 'Yahoo Finance CME SI=F (Silver Futures Proxy)';
          provenance = 'INDEPENDENT_REFERENCE_OHLC';
        } else if (['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'GBPJPY'].includes(sym)) {
          provider = 'Yahoo Finance Spot FX';
          provenance = 'INDEPENDENT_VERIFIED_OHLC';
        } else if (['US100', 'US500', 'US30'].includes(sym)) {
          provider = 'Yahoo Finance US Indices';
          provenance = 'INDEPENDENT_VERIFIED_OHLC';
        } else if (sym === 'USOIL') {
          provider = 'Yahoo Finance WTI Crude';
          provenance = 'INDEPENDENT_VERIFIED_OHLC';
        }

        return {
          candles: resultCandles,
          provider,
          provenance,
        };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
      }
    }

    return null;
  }
}

// Instantiate default provider adapters
const binanceAdapter = new BinanceSpotAdapter();
const yahooAdapter = new YahooFinanceChartAdapter();

/**
 * Get verified OHLC candles for any supported asset using adapter architecture
 */
export async function getVerifiedCandles(
  symbol: string,
  timeframe: string = 'M30',
  limit: number = 40
): Promise<VerifiedCandleResponse> {
  const normSymbol = (symbol || 'XAUUSD').toUpperCase();
  const normTf = (timeframe || 'M30').toUpperCase();
  const cacheKey = `${normSymbol}:${normTf}`;
  const now = Date.now();

  // 1. Check in-memory cache
  const cached = candleCache.get(cacheKey);
  const ttl = CACHE_TTL_MS[normTf] || 60_000;
  if (cached && (now - cached.cachedAt) < ttl) {
    return {
      ...cached.response,
      ageMs: now - cached.response.updatedAt,
    };
  }

  // 2. Dispatch to registered adapters
  const adapters: CandleProviderAdapter[] = [];
  if (['BTCUSD', 'ETHUSD', 'SOLUSD'].includes(normSymbol)) {
    adapters.push(binanceAdapter);
  } else if (normSymbol === 'XAUUSD') {
    // For Gold proxy, try Yahoo CME futures first, then Binance PAXG
    adapters.push(yahooAdapter, binanceAdapter);
  } else {
    // Forex, Indices, USOIL, XAGUSD
    adapters.push(yahooAdapter);
  }

  for (const adapter of adapters) {
    if (adapter.supports(normSymbol, normTf)) {
      try {
        const res = await adapter.fetchCandles(normSymbol, normTf, limit);
        if (res && res.candles && res.candles.length >= 10) {
          const val = validateCandleSeries(res.candles, normTf);
          if (val.valid) {
            const verifiedResult: VerifiedCandleResponse = {
              success: true,
              state: 'VERIFIED',
              symbol: normSymbol,
              timeframe: normTf,
              count: res.candles.length,
              provider: res.provider,
              provenance: res.provenance,
              updatedAt: now,
              ageMs: 0,
              candles: res.candles as OHLCCandle[],
            };

            candleCache.set(cacheKey, { response: verifiedResult, cachedAt: now });
            return verifiedResult;
          }
        }
      } catch {
        // Fall through to next adapter or unavailable
      }
    }
  }

  // 3. Fallback: DATA LIMITED with zero synthetic fabrication
  return {
    success: false,
    state: 'UNAVAILABLE',
    symbol: normSymbol,
    timeframe: normTf,
    count: 0,
    provider: 'NONE',
    provenance: 'UNAVAILABLE',
    updatedAt: now,
    ageMs: 0,
    candles: [],
    error: {
      code: 'OHLC_UNAVAILABLE',
      message: `No verified independent OHLC feed currently connected for ${normSymbol} on ${normTf}.`,
    },
  };
}

/**
 * Register candle batch explicitly into cache (e.g. pushed from MT5 bridge)
 */
export function registerTrustedBrokerCandles(
  symbol: string,
  timeframe: string,
  candles: RawCandleInput[],
  identity: TrustedBrokerCandleIdentity
): VerifiedCandleResponse {
  const normSymbol = symbol.toUpperCase();
  const normTf = timeframe.toUpperCase();
  const canonicalProvenance = deriveTrustedBrokerCandleProvenance(identity);
  const val = validateCandleSeries(candles, normTf);

  if (!val.valid) {
    return {
      success: false,
      state: 'UNAVAILABLE',
      symbol: normSymbol,
      timeframe: normTf,
      count: 0,
      provider: canonicalProvenance.provider,
      broker: canonicalProvenance.broker,
      server: canonicalProvenance.server,
      provenance: canonicalProvenance.provenance,
      source: canonicalProvenance.source,
      authenticatedSource: canonicalProvenance.authenticatedSource,
      updatedAt: Date.now(),
      ageMs: 0,
      candles: [],
      error: { code: 'INVALID_CANDLES', message: val.reason || 'Invalid candle data' },
    };
  }

  const now = Date.now();
  const result: VerifiedCandleResponse = {
    success: true,
    state: 'VERIFIED',
    symbol: normSymbol,
    timeframe: normTf,
    count: candles.length,
    provider: canonicalProvenance.provider,
    broker: canonicalProvenance.broker,
    server: canonicalProvenance.server,
    provenance: canonicalProvenance.provenance,
    source: canonicalProvenance.source,
    authenticatedSource: canonicalProvenance.authenticatedSource,
    updatedAt: now,
    ageMs: 0,
    candles: candles as OHLCCandle[],
  };

  candleCache.set(`${normSymbol}:${normTf}`, { response: result, cachedAt: now });
  return result;
}
