/**
 * FEF CORTEX — TELEGRAM SIGNAL CARD PREVIEW API
 * GET /api/telegram/preview?symbol=XAUUSD
 * Returns rendered preview PNG or SVG for Cockpit visualization
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderSignalCardPng, resolveInstrumentCategory } from '@/lib/telegram/telegram-image-renderer';
import { ValidatedSignalPayload } from '@/lib/telegram/telegram-signal-eligibility';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get('symbol') || 'XAUUSD').toUpperCase();
    const asJson = searchParams.get('format') === 'json';

    const theme = resolveInstrumentCategory(symbol);

    const mockPrice = symbol === 'XAUUSD' ? 2741.50 : (symbol === 'BTCUSD' ? 69500.0 : (symbol === 'EURUSD' ? 1.0845 : 20450.0));
    const mockSl = symbol === 'XAUUSD' ? 2735.00 : (symbol === 'BTCUSD' ? 68200.0 : (symbol === 'EURUSD' ? 1.0810 : 20300.0));
    const mockTp1 = symbol === 'XAUUSD' ? 2755.00 : (symbol === 'BTCUSD' ? 72100.0 : (symbol === 'EURUSD' ? 1.0915 : 20750.0));

    const payload: ValidatedSignalPayload = {
      signalId: `PREV-${symbol}-M15`,
      setupId: `setup-preview-${symbol.toLowerCase()}`,
      setupRevision: 1,
      symbol,
      direction: 'BUY',
      timeframe: 'M15',
      marketPrice: mockPrice,
      entryZone: { low: mockPrice - 0.5, high: mockPrice + 0.5, midpoint: mockPrice },
      stopLoss: { price: mockSl, distance: Math.abs(mockPrice - mockSl) },
      takeProfit1: { price: mockTp1, distance: Math.abs(mockTp1 - mockPrice), riskReward: 2.33 },
      riskRewardRatio: 2.33,
      decisionEngine: {
        bias: 'BULLISH',
        confidencePct: 88,
        completenessPct: 92,
        independentDomainsCount: 3,
        maturity: 'VALIDATED_SETUP',
      },
      setupIntelligence: {
        type: 'BREAKOUT',
        lifecycle: 'VALIDATED',
        thesis: `Price is showing bullish continuation above the key support. Momentum and structure favor upside toward the next resistance zone.`,
        invalidationPrice: mockSl,
      },
      sessionContext: { currentSession: 'LONDON', activeKillzone: true },
      timestamps: {
        asOf: Date.now(),
        marketDataTimestamp: Date.now(),
        validatedAt: new Date().toISOString(),
      },
      idempotencyKey: `PREV_${symbol}_1`,
    };

    const pngBuffer = await renderSignalCardPng(payload, { isPreview: true });

    if (asJson) {
      return NextResponse.json({
        success: true,
        symbol,
        category: theme.category,
        heroImage: theme.heroImageFile,
        base64Png: pngBuffer.toString('base64'),
      });
    }

    return new NextResponse(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=30',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to render signal preview' },
      { status: 500 }
    );
  }
}

