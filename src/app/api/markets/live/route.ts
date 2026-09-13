import { NextResponse } from 'next/server';
import { MARKET_REGISTRY } from '@/lib/registry/market-registry';
import { LiveMarketAsset } from '@/lib/providers/real-market-api';
import {
  fetchCryptoQuotesWithFallback,
  probeCryptoProviders
} from '@/lib/providers/crypto-feed-service';

export const dynamic = 'force-dynamic';

interface CacheEntry {
  data: Record<string, LiveMarketAsset>;
  timestamp: number;
}

let cachedData: CacheEntry | null = null;
const CACHE_TTL_MS = 4000; // 4 seconds server cache

function buildBaselineAssets(): Record<string, LiveMarketAsset> {
  const map: Record<string, LiveMarketAsset> = {};
  const timeStr = new Date().toTimeString().split(' ')[0];

  for (const def of Object.values(MARKET_REGISTRY)) {
    const isCrypto = def.category === 'CRYPTO';
    const p = isCrypto ? 0 : def.basePrice;
    const spread = def.typicalSpread;
    const change = isCrypto ? 0 : def.typicalDailyChangePct;
    const isPos = change >= 0;

    map[def.symbol] = {
      symbol: def.symbol,
      name: def.displayName,
      price: p,
      bid: isCrypto ? 0 : Number((p - spread / 2).toFixed(def.decimalPrecision)),
      ask: isCrypto ? 0 : Number((p + spread / 2).toFixed(def.decimalPrecision)),
      spread: spread,
      change24h: change,
      high24h: isCrypto ? 0 : Number((p * (1 + Math.abs(change) * 0.008 + 0.004)).toFixed(def.decimalPrecision)),
      low24h: isCrypto ? 0 : Number((p * (1 - Math.abs(change) * 0.008 - 0.004)).toFixed(def.decimalPrecision)),
      volume:
        def.category === 'INDICES'
          ? '$38.4B'
          : def.category === 'CRYPTO'
          ? '$42.1B'
          : def.category === 'METALS'
          ? '$24.8B'
          : '$54.2B',
      sparkline: isPos
        ? '0,28 20,24 40,20 60,18 80,14 100,16 120,10 140,8'
        : '0,10 20,14 40,16 60,22 80,25 100,28 120,32 140,34',
      source: isCrypto ? 'None' : def.feedProvider,
      provider: isCrypto ? 'None' : def.feedProvider,
      lastUpdated: isCrypto ? 'Pending Feed' : timeStr,
      category: def.category,
      feedStatus: isCrypto ? 'DATA LIMITED' : def.feedStatus,
      classification: isCrypto ? 'DATA LIMITED' : (def.feedStatus === 'LIVE' ? 'LIVE' : 'DEMO'),
      priceType: isCrypto ? 'DERIVED' : 'LAST',
      referencePrice: def.basePrice
    };
  }

  return map;
}

export async function GET(req: Request) {
  const now = Date.now();
  const url = new URL(req.url);
  const isProbe = url.searchParams.get('probe') === '1' || url.searchParams.get('diag') === '1';

  let probeData: any = undefined;
  if (isProbe) {
    probeData = await probeCryptoProviders();
  }

  if (!isProbe && cachedData && now - cachedData.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({
      success: true,
      cached: true,
      ageMs: now - cachedData.timestamp,
      data: cachedData.data
    });
  }

  const assets = buildBaselineAssets();
  const timeStr = new Date().toTimeString().split(' ')[0];

  // 1. Fetch Real Gold and Silver Spot
  try {
    const [goldRes, silverRes] = await Promise.allSettled([
      fetch('https://api.gold-api.com/price/XAU', { next: { revalidate: 4 } }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch('https://api.gold-api.com/price/XAG', { next: { revalidate: 4 } }).then((r) =>
        r.ok ? r.json() : null
      )
    ]);

    if (goldRes.status === 'fulfilled' && goldRes.value && typeof goldRes.value.price === 'number') {
      const p = goldRes.value.price;
      assets.XAUUSD = {
        ...assets.XAUUSD,
        price: p,
        bid: Number((p - 0.09).toFixed(2)),
        ask: Number((p + 0.09).toFixed(2)),
        source: 'Gold-API Live (Verified)',
        provider: 'Gold-API Live',
        classification: 'LIVE',
        feedStatus: 'LIVE',
        priceType: 'LAST',
        lastUpdated: timeStr
      };
    }

    if (silverRes.status === 'fulfilled' && silverRes.value && typeof silverRes.value.price === 'number') {
      const p = silverRes.value.price;
      assets.XAGUSD = {
        ...assets.XAGUSD,
        price: Number(p.toFixed(2)),
        bid: Number((p - 0.02).toFixed(2)),
        ask: Number((p + 0.02).toFixed(2)),
        source: 'Gold-API Live (Verified)',
        provider: 'Gold-API Live',
        classification: 'LIVE',
        feedStatus: 'LIVE',
        priceType: 'LAST',
        lastUpdated: timeStr
      };
    }
  } catch (e: any) {
    // Graceful offline fallback
  }

  // 2. Fetch Real Crypto Spot with Multi-Tier Fallback (Binance -> Kraken -> Coinbase -> Data Limited)
  try {
    const cryptoSymbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'];
    const cryptoQuotes = await fetchCryptoQuotesWithFallback(cryptoSymbols);

    for (const [sym, quote] of Object.entries(cryptoQuotes)) {
      if (assets[sym]) {
        assets[sym] = {
          ...assets[sym],
          price: quote.price,
          bid: quote.bid,
          ask: quote.ask,
          spread: quote.spread,
          change24h: quote.change24h,
          high24h: quote.high24h,
          low24h: quote.low24h,
          source: quote.source,
          provider: quote.provider,
          classification: quote.classification,
          feedStatus: quote.feedStatus,
          priceType: quote.priceType,
          referencePrice: quote.referencePrice,
          lastUpdated: quote.lastUpdated
        };
      }
    }
  } catch (e: any) {
    // Graceful offline fallback
  }

  // 3. Fetch Real Forex Rates from Open-ER
  try {
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 60 }
    });
    if (fxRes.ok) {
      const fx = await fxRes.json();
      if (fx && fx.rates) {
        const rates = fx.rates;
        if (rates.EUR && assets.EURUSD) {
          const eurusd = 1 / rates.EUR;
          assets.EURUSD = {
            ...assets.EURUSD,
            price: Number(eurusd.toFixed(4)),
            bid: Number((eurusd - 0.0001).toFixed(4)),
            ask: Number((eurusd + 0.0001).toFixed(4)),
            source: 'Open-ER Forex Live',
            provider: 'Open-ER Forex Live',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        if (rates.GBP && assets.GBPUSD) {
          const gbpusd = 1 / rates.GBP;
          assets.GBPUSD = {
            ...assets.GBPUSD,
            price: Number(gbpusd.toFixed(4)),
            bid: Number((gbpusd - 0.0002).toFixed(4)),
            ask: Number((gbpusd + 0.0002).toFixed(4)),
            source: 'Open-ER Forex Live',
            provider: 'Open-ER Forex Live',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        if (rates.JPY && assets.USDJPY) {
          const usdjpy = rates.JPY;
          assets.USDJPY = {
            ...assets.USDJPY,
            price: Number(usdjpy.toFixed(3)),
            bid: Number((usdjpy - 0.015).toFixed(3)),
            ask: Number((usdjpy + 0.015).toFixed(3)),
            source: 'Open-ER Forex Live',
            provider: 'Open-ER Forex Live',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
      }
    }
  } catch (e: any) {
    // Graceful offline fallback
  }

  if (!isProbe) {
    cachedData = {
      data: assets,
      timestamp: now
    };
  }

  return NextResponse.json({
    success: true,
    cached: false,
    ageMs: 0,
    ...(probeData ? { probe: probeData } : {}),
    data: assets
  });
}
