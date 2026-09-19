import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedCandles, registerTrustedBrokerCandles } from '@/lib/candles/independent-candle-service';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';
import { evaluateExternalCandleMutation } from '@/lib/candles/candle-provenance-policy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'XAUUSD').toUpperCase();
  const timeframe = (searchParams.get('timeframe') || 'H1').toUpperCase();

  // 1. Try MT5 Broker bridge first if connected
  try {
    const bridgeCandles = await mt5HttpClient.getCandles(symbol, timeframe);
    if (bridgeCandles.success && Array.isArray(bridgeCandles.candles) && bridgeCandles.candles.length >= 10) {
      const registered = registerTrustedBrokerCandles(symbol, timeframe, bridgeCandles.candles, {
        sourceIdentity: 'AUTHENTICATED_LOCAL_MT5_BRIDGE',
        broker: 'Exness Technologies Ltd',
        server: 'Exness-MT5Trial16',
      });
      return NextResponse.json({
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
          const registered = registerTrustedBrokerCandles(symbol, timeframe, relayData.candles, {
            sourceIdentity: 'AUTHENTICATED_REMOTE_MT5_RELAY',
            broker: relayData.broker || 'Exness Technologies Ltd',
            server: relayData.server || 'Exness-MT5Trial16',
          });
          return NextResponse.json({
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
