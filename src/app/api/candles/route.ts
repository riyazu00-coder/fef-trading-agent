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
      registerVerifiedCandles(symbol, timeframe, bridgeCandles.candles, 'MT5 Broker', 'MT5_BROKER_OHLC');
      return NextResponse.json({
        success: true,
        state: 'VERIFIED',
        symbol,
        timeframe,
        count: bridgeCandles.candles.length,
        provider: 'MT5 Broker',
        provenance: 'MT5_BROKER_OHLC',
        updatedAt: bridgeCandles.updatedAt || Date.now(),
        ageMs: bridgeCandles.ageMs || 0,
        candles: bridgeCandles.candles,
      });
    }
  } catch {}

  // 2. Fall back to independent verified candle feed (e.g. Binance for Crypto/PAXG)
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
