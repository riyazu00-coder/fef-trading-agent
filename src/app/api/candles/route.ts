import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedCandles, registerVerifiedCandles } from '@/lib/candles/independent-candle-service';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'XAUUSD').toUpperCase();
  const timeframe = (searchParams.get('timeframe') || 'H1').toUpperCase();

  // 1. Try MT5 Broker bridge first if connected
  try {
    const bridgeCandles = await mt5HttpClient.getCandles(symbol, timeframe);
    if (bridgeCandles.success && Array.isArray(bridgeCandles.candles) && bridgeCandles.candles.length >= 10) {
      registerVerifiedCandles(symbol, timeframe, bridgeCandles.candles, 'Exness Technologies Ltd', 'LIVE_MT5');
      return NextResponse.json({
        success: true,
        state: 'VERIFIED',
        symbol,
        timeframe,
        count: bridgeCandles.candles.length,
        provider: 'Exness Technologies Ltd',
        broker: 'Exness Technologies Ltd',
        server: 'Exness-MT5Trial16',
        source: 'MT5_BROKER_OHLC',
        provenance: 'LIVE_MT5',
        updatedAt: bridgeCandles.updatedAt || Date.now(),
        ageMs: bridgeCandles.ageMs || 0,
        candles: bridgeCandles.candles,
      });
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
          registerVerifiedCandles(symbol, timeframe, relayData.candles, relayData.broker || 'Exness Technologies Ltd', 'LIVE_MT5');
          return NextResponse.json({
            success: true,
            state: 'VERIFIED',
            symbol,
            timeframe,
            count: relayData.candles.length,
            provider: relayData.provider || 'Exness Technologies Ltd',
            broker: relayData.broker || 'Exness Technologies Ltd',
            server: relayData.server || 'Exness-MT5Trial16',
            source: 'MT5_BROKER_OHLC',
            provenance: 'LIVE_MT5',
            updatedAt: relayData.updatedAt || Date.now(),
            ageMs: relayData.ageMs || 0,
            freshness: relayData.freshness || 'FRESH',
            candles: relayData.candles,
          });
        }
      }
    } catch {}
  }

  // 3. Fall back to independent verified candle feed (e.g. Binance for Crypto/PAXG)
  const indyCandles = await getVerifiedCandles(symbol, timeframe);
  return NextResponse.json(indyCandles);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, timeframe, candles, provider, provenance } = body;
    if (!symbol || !timeframe || !Array.isArray(candles)) {
      return NextResponse.json(
        { success: false, error: { code: 'MISSING_PARAMS', message: 'symbol, timeframe, and candles array required' } },
        { status: 400 }
      );
    }
    const res = registerVerifiedCandles(symbol, timeframe, candles, provider, provenance);
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'POST_ERROR', message: err?.message || 'Error processing candle registration' } },
      { status: 500 }
    );
  }
}
