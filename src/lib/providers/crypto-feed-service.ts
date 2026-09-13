/**
 * Crypto Feed Service
 * Multi-tier resilient crypto pricing engine:
 * 1. Primary: Binance Spot API (Live Last Price)
 * 2. Secondary: Kraken Public API (Live Last Price + Real Bid/Ask)
 * 3. Tertiary: Coinbase Public API (Live Spot Price)
 * 4. Fallback: DATA LIMITED / UNAVAILABLE (Truthful degradation, no static prices masquerading as live)
 */

import { MARKET_REGISTRY } from '../registry/market-registry';

export type CryptoPriceType = 'LAST' | 'SPOT' | 'MID' | 'DERIVED';
export type CryptoClassification = 'LIVE' | 'LIVE FALLBACK' | 'DATA LIMITED';

export interface CryptoSymbolMapping {
  symbol: string;
  binance: string;
  kraken: string;
  coinbase: string;
  decimalPrecision: number;
  typicalSpread: number;
}

export const CRYPTO_SYMBOL_MAPPINGS: Record<string, CryptoSymbolMapping> = {
  BTCUSD: {
    symbol: 'BTCUSD',
    binance: 'BTCUSDT',
    kraken: 'XXBTZUSD',
    coinbase: 'BTC-USD',
    decimalPrecision: 2,
    typicalSpread: 8.0
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    binance: 'ETHUSDT',
    kraken: 'XETHZUSD',
    coinbase: 'ETH-USD',
    decimalPrecision: 2,
    typicalSpread: 1.2
  },
  SOLUSD: {
    symbol: 'SOLUSD',
    binance: 'SOLUSDT',
    kraken: 'SOLUSD',
    coinbase: 'SOL-USD',
    decimalPrecision: 2,
    typicalSpread: 0.15
  },
  XRPUSD: {
    symbol: 'XRPUSD',
    binance: 'XRPUSDT',
    kraken: 'XXRPZUSD',
    coinbase: 'XRP-USD',
    decimalPrecision: 4,
    typicalSpread: 0.0005
  },
  BNBUSD: {
    symbol: 'BNBUSD',
    binance: 'BNBUSDT',
    kraken: 'BNBUSD',
    coinbase: 'BNB-USD',
    decimalPrecision: 2,
    typicalSpread: 0.4
  },
  ADAUSD: {
    symbol: 'ADAUSD',
    binance: 'ADAUSDT',
    kraken: 'ADAUSD',
    coinbase: 'ADA-USD',
    decimalPrecision: 4,
    typicalSpread: 0.0002
  },
  DOGEUSD: {
    symbol: 'DOGEUSD',
    binance: 'DOGEUSDT',
    kraken: 'XDGUSD',
    coinbase: 'DOGE-USD',
    decimalPrecision: 5,
    typicalSpread: 0.0001
  },
  LTCUSD: {
    symbol: 'LTCUSD',
    binance: 'LTCUSDT',
    kraken: 'XLTCZUSD',
    coinbase: 'LTC-USD',
    decimalPrecision: 2,
    typicalSpread: 0.05
  },
  AVAXUSD: {
    symbol: 'AVAXUSD',
    binance: 'AVAXUSDT',
    kraken: 'AVAXUSD',
    coinbase: 'AVAX-USD',
    decimalPrecision: 2,
    typicalSpread: 0.02
  },
  LINKUSD: {
    symbol: 'LINKUSD',
    binance: 'LINKUSDT',
    kraken: 'LINKUSD',
    coinbase: 'LINK-USD',
    decimalPrecision: 3,
    typicalSpread: 0.01
  }
};

export interface CryptoFeedQuote {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  change24h: number;
  high24h: number;
  low24h: number;
  source: string;
  provider: string;
  classification: CryptoClassification;
  feedStatus: 'LIVE' | 'DATA LIMITED';
  priceType: CryptoPriceType;
  referencePrice?: number;
  lastUpdated: string;
}

interface FetchOptions {
  customFetch?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Probes all 3 providers and reports exact status codes and response headers/bodies.
 * Used for production diagnostic verification.
 */
export async function probeCryptoProviders(customFetch?: typeof fetch) {
  const f = customFetch || fetch;
  const timeout = 4000;

  const probeOne = async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await f(url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { 'User-Agent': 'FEF-Trading-Dashboard/1.0' }
      });
      clearTimeout(timer);
      const text = await res.text();
      let preview = text.slice(0, 200);
      try {
        const j = JSON.parse(text);
        preview = JSON.stringify(j).slice(0, 200);
      } catch {}
      return {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        bodyPreview: preview
      };
    } catch (err: any) {
      clearTimeout(timer);
      return {
        status: 0,
        statusText: err.name === 'AbortError' ? 'TIMEOUT' : 'ERROR',
        ok: false,
        error: err.message
      };
    }
  };

  const [binance, kraken, coinbase] = await Promise.all([
    probeOne('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'),
    probeOne('https://api.kraken.com/0/public/Ticker?pair=XXBTZUSD'),
    probeOne('https://api.coinbase.com/v2/prices/BTC-USD/spot')
  ]);

  return { binance, kraken, coinbase };
}

/**
 * Fetch quotes for target symbols using the resilient fallback chain:
 * Binance -> Kraken -> Coinbase -> Data Limited
 */
export async function fetchCryptoQuotesWithFallback(
  symbols: string[],
  options?: FetchOptions
): Promise<Record<string, CryptoFeedQuote>> {
  const f = options?.customFetch || fetch;
  const timeoutMs = options?.timeoutMs || 3500;
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const results: Record<string, CryptoFeedQuote> = {};
  const pendingSymbols: string[] = [];

  // Filter to known mappings and set initial degraded baseline
  for (const sym of symbols) {
    const mapping = CRYPTO_SYMBOL_MAPPINGS[sym];
    const regDef = MARKET_REGISTRY[sym];
    if (mapping) {
      pendingSymbols.push(sym);
      results[sym] = {
        symbol: sym,
        price: 0,
        bid: 0,
        ask: 0,
        spread: mapping.typicalSpread,
        change24h: 0,
        high24h: 0,
        low24h: 0,
        source: 'None',
        provider: 'None',
        classification: 'DATA LIMITED',
        feedStatus: 'DATA LIMITED',
        priceType: 'DERIVED',
        referencePrice: regDef?.basePrice,
        lastUpdated: timeStr
      };
    }
  }

  if (pendingSymbols.length === 0) {
    return results;
  }

  // Helper with timeout
  const fetchWithTimeout = async (url: string, init?: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await f(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  };

  // ---------------------------------------------------------------------------
  // 1. PRIMARY: Binance 24hr Ticker API
  // ---------------------------------------------------------------------------
  const binanceAttempts = await Promise.allSettled(
    pendingSymbols.map(async (sym) => {
      const mapping = CRYPTO_SYMBOL_MAPPINGS[sym];
      const res = await fetchWithTimeout(
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${mapping.binance}`,
        { next: { revalidate: 4 } }
      );
      if (!res.ok) {
        throw new Error(`Binance HTTP ${res.status}`);
      }
      const data = await res.json();
      return { sym, data, mapping };
    })
  );

  const unfulfilledSymbols: string[] = [];

  binanceAttempts.forEach((att, idx) => {
    const sym = pendingSymbols[idx];
    if (att.status === 'fulfilled' && att.value && att.value.data) {
      const { data, mapping } = att.value;
      const lastPrice = parseFloat(data.lastPrice);
      const bidPrice = parseFloat(data.bidPrice);
      const askPrice = parseFloat(data.askPrice);
      const changePct = parseFloat(data.priceChangePercent);
      const high = parseFloat(data.highPrice);
      const low = parseFloat(data.lowPrice);

      if (!isNaN(lastPrice) && lastPrice > 0) {
        const spread =
          !isNaN(askPrice) && !isNaN(bidPrice) && askPrice > bidPrice
            ? Number((askPrice - bidPrice).toFixed(mapping.decimalPrecision))
            : mapping.typicalSpread;
        const bid = !isNaN(bidPrice) && bidPrice > 0 ? bidPrice : Number((lastPrice - spread / 2).toFixed(mapping.decimalPrecision));
        const ask = !isNaN(askPrice) && askPrice > 0 ? askPrice : Number((lastPrice + spread / 2).toFixed(mapping.decimalPrecision));

        results[sym] = {
          symbol: sym,
          price: lastPrice,
          bid,
          ask,
          spread,
          change24h: !isNaN(changePct) ? Number(changePct.toFixed(2)) : 0,
          high24h: !isNaN(high) ? high : lastPrice,
          low24h: !isNaN(low) ? low : lastPrice,
          source: `Binance Spot API Live (${mapping.binance})`,
          provider: 'Binance Spot API',
          classification: 'LIVE',
          feedStatus: 'LIVE',
          priceType: 'LAST',
          referencePrice: MARKET_REGISTRY[sym]?.basePrice,
          lastUpdated: timeStr
        };
        return;
      }
    }
    unfulfilledSymbols.push(sym);
  });

  if (unfulfilledSymbols.length === 0) {
    return results;
  }

  // ---------------------------------------------------------------------------
  // 2. SECONDARY: Kraken Public API (covers all pairs in a single request)
  // ---------------------------------------------------------------------------
  try {
    const krakenPairs = unfulfilledSymbols
      .map((sym) => CRYPTO_SYMBOL_MAPPINGS[sym]?.kraken)
      .filter(Boolean);

    if (krakenPairs.length > 0) {
      const krakenUrl = `https://api.kraken.com/0/public/Ticker?pair=${krakenPairs.join(',')}`;
      const krakenRes = await fetchWithTimeout(krakenUrl, { next: { revalidate: 4 } });

      if (krakenRes.ok) {
        const krakenJson = await krakenRes.json();
        if (
          krakenJson &&
          (!krakenJson.error || krakenJson.error.length === 0) &&
          krakenJson.result
        ) {
          const kResult = krakenJson.result;

          // Check each unfulfilled symbol against Kraken response
          const remainingAfterKraken: string[] = [];
          for (const sym of unfulfilledSymbols) {
            const mapping = CRYPTO_SYMBOL_MAPPINGS[sym];
            const kPairData = kResult[mapping.kraken];

            if (kPairData && kPairData.c && kPairData.c[0]) {
              const lastPrice = parseFloat(kPairData.c[0]);
              const bidPrice = kPairData.b ? parseFloat(kPairData.b[0]) : NaN;
              const askPrice = kPairData.a ? parseFloat(kPairData.a[0]) : NaN;
              const high = kPairData.h ? parseFloat(kPairData.h[1]) : lastPrice;
              const low = kPairData.l ? parseFloat(kPairData.l[1]) : lastPrice;
              const openPrice = kPairData.o ? parseFloat(kPairData.o) : 0;
              const changePct =
                openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0;

              if (!isNaN(lastPrice) && lastPrice > 0) {
                const spread =
                  !isNaN(askPrice) && !isNaN(bidPrice) && askPrice > bidPrice
                    ? Number((askPrice - bidPrice).toFixed(mapping.decimalPrecision))
                    : mapping.typicalSpread;
                const bid =
                  !isNaN(bidPrice) && bidPrice > 0
                    ? bidPrice
                    : Number((lastPrice - spread / 2).toFixed(mapping.decimalPrecision));
                const ask =
                  !isNaN(askPrice) && askPrice > 0
                    ? askPrice
                    : Number((lastPrice + spread / 2).toFixed(mapping.decimalPrecision));

                results[sym] = {
                  symbol: sym,
                  price: lastPrice,
                  bid,
                  ask,
                  spread,
                  change24h: Number(changePct.toFixed(2)),
                  high24h: high,
                  low24h: low,
                  source: 'Kraken Public API (Spot Ticker)',
                  provider: 'Kraken Public API',
                  classification: 'LIVE FALLBACK',
                  feedStatus: 'LIVE',
                  priceType: 'LAST',
                  referencePrice: MARKET_REGISTRY[sym]?.basePrice,
                  lastUpdated: timeStr
                };
                continue;
              }
            }
            remainingAfterKraken.push(sym);
          }

          unfulfilledSymbols.length = 0;
          unfulfilledSymbols.push(...remainingAfterKraken);
        }
      }
    }
  } catch (err) {
    // Kraken failed, proceed to tertiary
  }

  if (unfulfilledSymbols.length === 0) {
    return results;
  }

  // ---------------------------------------------------------------------------
  // 3. TERTIARY: Coinbase Public Spot API
  // ---------------------------------------------------------------------------
  const coinbaseAttempts = await Promise.allSettled(
    unfulfilledSymbols.map(async (sym) => {
      const mapping = CRYPTO_SYMBOL_MAPPINGS[sym];
      const res = await fetchWithTimeout(
        `https://api.coinbase.com/v2/prices/${mapping.coinbase}/spot`,
        { next: { revalidate: 4 } }
      );
      if (!res.ok) {
        throw new Error(`Coinbase HTTP ${res.status}`);
      }
      const data = await res.json();
      return { sym, data, mapping };
    })
  );

  coinbaseAttempts.forEach((att) => {
    if (att.status === 'fulfilled' && att.value && att.value.data) {
      const { sym, data, mapping } = att.value;
      const amount = data.data?.amount;
      const spotPrice = parseFloat(amount);

      if (!isNaN(spotPrice) && spotPrice > 0) {
        const spread = mapping.typicalSpread;
        // DERIVED bid/ask from spot price + typicalSpread
        const bid = Number((spotPrice - spread / 2).toFixed(mapping.decimalPrecision));
        const ask = Number((spotPrice + spread / 2).toFixed(mapping.decimalPrecision));

        results[sym] = {
          symbol: sym,
          price: spotPrice,
          bid,
          ask,
          spread,
          change24h: 0,
          high24h: spotPrice,
          low24h: spotPrice,
          source: 'Coinbase Public Spot API',
          provider: 'Coinbase Public Spot API',
          classification: 'LIVE FALLBACK',
          feedStatus: 'LIVE',
          priceType: 'SPOT',
          referencePrice: MARKET_REGISTRY[sym]?.basePrice,
          lastUpdated: timeStr
        };
      }
    }
  });

  // Any remaining symbols stay as DATA LIMITED (price: 0, source: 'None', feedStatus: 'DATA LIMITED')
  return results;
}
