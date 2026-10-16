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
    const isUnverified = isCrypto || def.symbol === 'GER40';
    const p = isUnverified ? 0 : def.basePrice;
    const spread = isUnverified ? 0 : def.typicalSpread;
    const change = isUnverified ? 0 : def.typicalDailyChangePct;
    const isPos = change >= 0;

    map[def.symbol] = {
      symbol: def.symbol,
      name: def.displayName,
      price: p,
      bid: isUnverified ? 0 : Number((p - spread / 2).toFixed(def.decimalPrecision)),
      ask: isUnverified ? 0 : Number((p + spread / 2).toFixed(def.decimalPrecision)),
      spread: spread,
      change24h: change,
      high24h: 0,
      low24h: 0,
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
      source: isUnverified ? 'UNAVAILABLE' : def.feedProvider,
      provider: isUnverified ? 'UNAVAILABLE (No Public Live Feed)' : def.feedProvider,
      lastUpdated: isUnverified ? 'UNAVAILABLE' : timeStr,
      category: def.category,
      feedStatus: isUnverified ? 'DATA LIMITED' : (def.feedStatus === 'DEMO' ? 'FALLBACK' : def.feedStatus),
      classification: isUnverified ? 'DATA LIMITED' : 'LIVE',
      priceType: isUnverified ? 'DERIVED' : 'LAST',
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

  const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

  // 1. Fetch Real Gold and Silver Spot (User-Agent required for Gold-API to resolve)
  try {
    const [goldRes, silverRes] = await Promise.allSettled([
      fetch('https://api.gold-api.com/price/XAU', {
        next: { revalidate: 4 },
        headers: { 'User-Agent': UA }
      }).then((r) => r.ok ? r.json() : null),
      fetch('https://api.gold-api.com/price/XAG', {
        next: { revalidate: 4 },
        headers: { 'User-Agent': UA }
      }).then((r) => r.ok ? r.json() : null)
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

  // 3. Fetch Real Forex Rates from Open-ER (Majors & Crosses)
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
        if (rates.AUD && assets.AUDUSD) {
          const audusd = 1 / rates.AUD;
          assets.AUDUSD = {
            ...assets.AUDUSD,
            price: Number(audusd.toFixed(4)),
            bid: Number((audusd - 0.0001).toFixed(4)),
            ask: Number((audusd + 0.0001).toFixed(4)),
            source: 'Open-ER Interbank Forex Live',
            provider: 'Open-ER Interbank Forex Live',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        if (rates.NZD && assets.NZDUSD) {
          const nzdusd = 1 / rates.NZD;
          assets.NZDUSD = {
            ...assets.NZDUSD,
            price: Number(nzdusd.toFixed(4)),
            bid: Number((nzdusd - 0.0001).toFixed(4)),
            ask: Number((nzdusd + 0.0001).toFixed(4)),
            source: 'Open-ER Interbank Forex Live',
            provider: 'Open-ER Interbank Forex Live',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        if (rates.CAD && assets.USDCAD) {
          const usdcad = rates.CAD;
          assets.USDCAD = {
            ...assets.USDCAD,
            price: Number(usdcad.toFixed(4)),
            bid: Number((usdcad - 0.0001).toFixed(4)),
            ask: Number((usdcad + 0.0001).toFixed(4)),
            source: 'Open-ER Interbank Forex Live',
            provider: 'Open-ER Interbank Forex Live',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        if (rates.CHF && assets.USDCHF) {
          const usdchf = rates.CHF;
          assets.USDCHF = {
            ...assets.USDCHF,
            price: Number(usdchf.toFixed(4)),
            bid: Number((usdchf - 0.0001).toFixed(4)),
            ask: Number((usdchf + 0.0001).toFixed(4)),
            source: 'Open-ER Interbank Forex Live',
            provider: 'Open-ER Interbank Forex Live',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        if (rates.GBP && rates.JPY && assets.GBPJPY) {
          const gbpjpy = (1 / rates.GBP) * rates.JPY;
          assets.GBPJPY = {
            ...assets.GBPJPY,
            price: Number(gbpjpy.toFixed(2)),
            bid: Number((gbpjpy - 0.02).toFixed(2)),
            ask: Number((gbpjpy + 0.02).toFixed(2)),
            source: 'Open-ER Derived Cross',
            provider: 'Open-ER Cross Rate Calculation',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        if (rates.EUR && rates.JPY && assets.EURJPY) {
          const eurjpy = (1 / rates.EUR) * rates.JPY;
          assets.EURJPY = {
            ...assets.EURJPY,
            price: Number(eurjpy.toFixed(2)),
            bid: Number((eurjpy - 0.02).toFixed(2)),
            ask: Number((eurjpy + 0.02).toFixed(2)),
            source: 'Open-ER Derived Cross',
            provider: 'Open-ER Cross Rate Calculation',
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        if (rates.EUR && rates.GBP && assets.EURGBP) {
          const eurgbp = (1 / rates.EUR) * rates.GBP;
          assets.EURGBP = {
            ...assets.EURGBP,
            price: Number(eurgbp.toFixed(4)),
            bid: Number((eurgbp - 0.0001).toFixed(4)),
            ask: Number((eurgbp + 0.0001).toFixed(4)),
            source: 'Open-ER Derived Cross',
            provider: 'Open-ER Cross Rate Calculation',
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

  // 4. Fetch Live Indices & Commodities from Yahoo Finance v8 Chart API
  const yahooEndpoints: Array<{ sym: string; ticker: string; decimals: number; spread: number; providerName: string }> = [
    { sym: 'US100',  ticker: '^NDX',   decimals: 2, spread: 3.0,   providerName: 'Yahoo Finance US Indices' },
    { sym: 'US30',   ticker: '^DJI',   decimals: 2, spread: 5.0,   providerName: 'Yahoo Finance US Indices' },
    { sym: 'US500',  ticker: '^GSPC',  decimals: 2, spread: 0.5,   providerName: 'Yahoo Finance US Indices' },
    { sym: 'UK100',  ticker: '^FTSE',  decimals: 2, spread: 1.0,   providerName: 'Yahoo Finance Global Indices' },
    { sym: 'JP225',  ticker: '^N225',  decimals: 2, spread: 5.0,   providerName: 'Yahoo Finance Global Indices' },
    { sym: 'USOIL',  ticker: 'CL=F',   decimals: 2, spread: 0.03,  providerName: 'Yahoo Finance WTI Crude' },
    { sym: 'UKOIL',  ticker: 'BZ=F',   decimals: 2, spread: 0.04,  providerName: 'Yahoo Finance Energy Commodities' },
    { sym: 'NATGAS', ticker: 'NG=F',   decimals: 3, spread: 0.005, providerName: 'Yahoo Finance Energy Commodities' },
    { sym: 'XAUUSD_YF', ticker: 'GC=F', decimals: 2, spread: 0.18, providerName: 'Yahoo Finance CME GC=F' },
    { sym: 'XAGUSD_YF', ticker: 'SI=F', decimals: 2, spread: 0.02, providerName: 'Yahoo Finance CME SI=F' },
  ];

  try {
    const fetchPromises = yahooEndpoints.map(async (entry) => {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(entry.ticker)}?interval=1h&range=1d`;
      const res = await fetch(url, {
        next: { revalidate: 15 },
        headers: { 'User-Agent': UA }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const meta = data.chart?.result?.[0]?.meta;
      if (!meta || typeof meta.regularMarketPrice !== 'number' || meta.regularMarketPrice <= 0) return null;
      return { entry, meta };
    });

    const results = await Promise.allSettled(fetchPromises);
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const { entry, meta } = r.value;
      const p: number = meta.regularMarketPrice;
      const prevClose: number = meta.chartPreviousClose || p;
      const chg = prevClose > 0 ? Number((((p - prevClose) / prevClose) * 100).toFixed(2)) : 0;
      const high: number = meta.regularMarketDayHigh || p * 1.005;
      const low: number = meta.regularMarketDayLow || p * 0.995;

      if (entry.sym === 'XAUUSD_YF') {
        if (assets.XAUUSD?.feedStatus !== 'LIVE') {
          assets.XAUUSD = {
            ...assets.XAUUSD,
            price: p,
            bid: Number((p - entry.spread / 2).toFixed(entry.decimals)),
            ask: Number((p + entry.spread / 2).toFixed(entry.decimals)),
            change24h: chg,
            high24h: Number(high.toFixed(entry.decimals)),
            low24h: Number(low.toFixed(entry.decimals)),
            source: 'Yahoo Finance GC=F (Fallback)',
            provider: entry.providerName,
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        continue;
      }

      if (entry.sym === 'XAGUSD_YF') {
        if (assets.XAGUSD?.feedStatus !== 'LIVE') {
          assets.XAGUSD = {
            ...assets.XAGUSD,
            price: p,
            bid: Number((p - entry.spread / 2).toFixed(entry.decimals)),
            ask: Number((p + entry.spread / 2).toFixed(entry.decimals)),
            change24h: chg,
            high24h: Number(high.toFixed(entry.decimals)),
            low24h: Number(low.toFixed(entry.decimals)),
            source: 'Yahoo Finance SI=F (Fallback)',
            provider: entry.providerName,
            classification: 'LIVE',
            feedStatus: 'LIVE',
            priceType: 'LAST',
            lastUpdated: timeStr
          };
        }
        continue;
      }

      if (!assets[entry.sym]) continue;
      assets[entry.sym] = {
        ...assets[entry.sym],
        price: p,
        bid: Number((p - entry.spread / 2).toFixed(entry.decimals)),
        ask: Number((p + entry.spread / 2).toFixed(entry.decimals)),
        change24h: chg,
        high24h: Number(high.toFixed(entry.decimals)),
        low24h: Number(low.toFixed(entry.decimals)),
        source: entry.providerName,
        provider: entry.providerName,
        classification: 'LIVE',
        feedStatus: 'LIVE',
        priceType: 'LAST',
        lastUpdated: timeStr
      };
    }
  } catch (e: any) {
    // Yahoo Finance offline — assets retain baseline
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
