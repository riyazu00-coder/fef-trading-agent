import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedCandles, registerTrustedBrokerCandles } from '@/lib/candles/independent-candle-service';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';
import { evaluateExternalCandleMutation } from '@/lib/candles/candle-provenance-policy';

export const dynamic = 'force-dynamic';

async function resolveCandlesForTimeframe(symbol: string, timeframe: string) {
  // 1. Try MT5 Broker bridge first if connected
  try {
    const bridgeCandles = await mt5HttpClient.getCandles(symbol, timeframe);
    if (bridgeCandles.success && Array.isArray(bridgeCandles.candles) && bridgeCandles.candles.length >= 10) {
      const registered = registerTrustedBrokerCandles(symbol, timeframe, bridgeCandles.candles, {
        sourceIdentity: 'AUTHENTICATED_LOCAL_MT5_BRIDGE',
        broker: (bridgeCandles as any).broker || 'Connected MT5 Broker',
        server: (bridgeCandles as any).server || 'MT5-Server',
      });
      return {
        success: true,
        state: 'VERIFIED',
        symbol,
        timeframe,
        count: registered.count,
        provider: registered.provider,
        broker: registered.broker,
        server: registered.server,
        source: registered.source,
        provenance: registered.provenance,
        updatedAt: bridgeCandles.updatedAt || Date.now(),
        ageMs: bridgeCandles.ageMs || 0,
        candles: registered.candles,
      };
    }
  } catch {}

  // 2. Try Secure Remote Relay (for Cloud Production / Vercel Lambdas)
  const relayUrl = process.env.FEF_REMOTE_RELAY_URL;
  const deviceId = process.env.FEF_REMOTE_DEVICE_ID || 'fef-connector-primary-01';
  if (relayUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const relayRes = await fetch(`${relayUrl}/device/${deviceId}/candles?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);

      if (relayRes.ok) {
        const relayData = await relayRes.json();
        if (relayData.success && Array.isArray(relayData.candles) && relayData.candles.length >= 10 && !relayData.isStale) {
          const registered = registerTrustedBrokerCandles(symbol, timeframe, relayData.candles, {
            sourceIdentity: 'AUTHENTICATED_REMOTE_MT5_RELAY',
            broker: relayData.broker || 'Connected MT5 Broker',
            server: relayData.server || 'MT5-Server',
          });
          return {
            success: true,
            state: 'VERIFIED',
            symbol,
            timeframe,
            count: registered.count,
            provider: registered.provider,
            broker: registered.broker,
            server: registered.server,
            source: registered.source,
            provenance: registered.provenance,
            updatedAt: relayData.updatedAt || Date.now(),
            ageMs: relayData.ageMs || 0,
            freshness: relayData.freshness || 'FRESH',
            candles: registered.candles,
          };
        }
      }
    } catch {}
  }

  // 3. Fall back to independent verified candle feed (e.g. Binance for Crypto/PAXG, Yahoo for FX/Indices)
  return await getVerifiedCandles(symbol, timeframe);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'XAUUSD').toUpperCase();
  const timeframe = (searchParams.get('timeframe') || 'H1').toUpperCase();
  const isBundle = searchParams.get('bundle') === 'true' || timeframe === 'BUNDLE';

  if (isBundle) {
    const bundleTimeframes = ['M5', 'M15', 'H1', 'H4', 'D1'];
    const results = await Promise.allSettled(
      bundleTimeframes.map((tf) => resolveCandlesForTimeframe(symbol, tf))
    );

    const timeframes: Record<string, any[]> = {};
    const bundleDetails: Record<string, any> = {};
    let dominantProvenance = 'UNAVAILABLE';
    let dominantProvider = 'NONE';
    let totalBars = 0;

    results.forEach((res, i) => {
      const tf = bundleTimeframes[i];
      if (res.status === 'fulfilled' && res.value && res.value.success && Array.isArray(res.value.candles)) {
        timeframes[tf] = res.value.candles;
        bundleDetails[tf] = {
          count: res.value.candles.length,
          provenance: res.value.provenance,
          provider: res.value.provider,
          updatedAt: res.value.updatedAt,
        };
        totalBars += res.value.candles.length;
        if (res.value.provenance === 'LIVE_MT5' || dominantProvenance === 'UNAVAILABLE') {
          dominantProvenance = res.value.provenance;
          dominantProvider = res.value.provider || res.value.broker || 'Provider';
        }
      }
    });

    const primaryTf = timeframes[timeframe] ? timeframe : (timeframes['H1'] ? 'H1' : Object.keys(timeframes)[0]);
    const primaryCandles = primaryTf ? timeframes[primaryTf] : [];

    return NextResponse.json({
      success: Object.keys(timeframes).length > 0,
      bundle: true,
      symbol,
      timeframe: primaryTf || timeframe,
      timeframes,
      bundleDetails,
      provenance: dominantProvenance,
      provider: dominantProvider,
      totalBars,
      count: primaryCandles.length,
      candles: primaryCandles,
    });
  }

  const result = await resolveCandlesForTimeframe(symbol, timeframe);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  void req;
  const denial = evaluateExternalCandleMutation();
  return NextResponse.json(
    {
      success: false,
      state: 'READ_ONLY',
      error: {
        code: denial.code,
        message: denial.message,
      },
    },
    { status: 405, headers: { Allow: 'GET' } }
  );
}
