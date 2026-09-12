import { NextResponse } from 'next/server';
import { MARKET_REGISTRY } from '@/lib/registry/market-registry';
import { LiveMarketAsset } from '@/lib/providers/real-market-api';

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
    const p = def.basePrice;
    const spread = def.typicalSpread;
    const change = def.typicalDailyChangePct;
    const isPos = change >= 0;

    map[def.symbol] = {
      symbol: def.symbol,
      name: def.displayName,
      price: p,
      bid: Number((p - spread / 2).toFixed(def.decimalPrecision)),
      ask: Number((p + spread / 2).toFixed(def.decimalPrecision)),
      spread: spread,
      change24h: change,
      high24h: Number((p * (1 + Math.abs(change) * 0.008 + 0.004)).toFixed(def.decimalPrecision)),
      low24h: Number((p * (1 - Math.abs(change) * 0.008 - 0.004)).toFixed(def.decimalPrecision)),
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
      source: def.feedProvider,
      lastUpdated: timeStr,
      category: def.category,
      feedStatus: def.feedStatus
    };
  }

  return map;
}

export async function GET() {
  const now = Date.now();
  if (cachedData && now - cachedData.timestamp < CACHE_TTL_MS) {
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
        lastUpdated: timeStr,
        feedStatus: 'LIVE'
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
        lastUpdated: timeStr,
        feedStatus: 'LIVE'
      };
    }
  } catch (e: any) {
    // Graceful offline fallback
  }

  // 2. Fetch Real Crypto Spot from Binance
  try {
    const cryptoPairs = [
      { sym: 'BTCUSD', binance: 'BTCUSDT' },
      { sym: 'ETHUSD', binance: 'ETHUSDT' },
      { sym: 'SOLUSD', binance: 'SOLUSDT' },
      { sym: 'XRPUSD', binance: 'XRPUSDT' },
      { sym: 'BNBUSD', binance: 'BNBUSDT' }
    ];

    const results = await Promise.allSettled(
      cryptoPairs.map((cp) =>
        fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${cp.binance}`, {
          next: { revalidate: 4 }
        }).then((r) => (r.ok ? r.json() : null))
      )
    );

    results.forEach((res, idx) => {
      if (res.status === 'fulfilled' && res.value) {
        const d = res.value;
        const sym = cryptoPairs[idx].sym;
        const price = parseFloat(d.lastPrice);
        const change = parseFloat(d.priceChangePercent);
        const high = parseFloat(d.highPrice);
        const low = parseFloat(d.lowPrice);

        if (!isNaN(price) && price > 0 && assets[sym]) {
          const spread = assets[sym].spread;
          assets[sym] = {
            ...assets[sym],
            price,
            bid: Number((price - spread / 2).toFixed(assets[sym].symbol.includes('XRP') ? 4 : 2)),
            ask: Number((price + spread / 2).toFixed(assets[sym].symbol.includes('XRP') ? 4 : 2)),
            change24h: Number(change.toFixed(2)),
            high24h: high,
            low24h: low,
            source: 'Binance 24hr Live API',
            lastUpdated: timeStr,
            feedStatus: 'LIVE'
          };
        }
      }
    });
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
            lastUpdated: timeStr,
            feedStatus: 'LIVE'
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
            lastUpdated: timeStr,
            feedStatus: 'LIVE'
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
            lastUpdated: timeStr,
            feedStatus: 'LIVE'
          };
        }
      }
    }
  } catch (e: any) {
    // Graceful offline fallback
  }

  cachedData = {
    data: assets,
    timestamp: now
  };

  return NextResponse.json({
    success: true,
    cached: false,
    ageMs: 0,
    data: assets
  });
}
