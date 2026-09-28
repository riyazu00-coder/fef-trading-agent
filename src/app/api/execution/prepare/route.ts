import { NextRequest, NextResponse } from 'next/server';
import { generateOrderConfirmation, OrderConfirmationInput } from '@/lib/execution/confirmation-authority';
import { validateTradeProtection } from '@/lib/execution/trade-protection-validator';
import { validateOrderAgainstSpec, symbolDirectory } from '@/lib/bridge/symbol-mapper';
import { evaluateMarketSession } from '@/lib/session/market-session-engine';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.isAutomatic === true) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'AUTOMATIC_DISPATCH_FORBIDDEN',
          message: 'Automated processes may not prepare order confirmations.',
        },
        { status: 403 }
      );
    }

    const canonicalSymbol = (body.canonicalSymbol || body.symbol || 'XAUUSD').trim().toUpperCase();
    const brokerSymbol = (body.brokerSymbol || symbolDirectory.toBrokerSymbol(canonicalSymbol) || canonicalSymbol).trim().toUpperCase();
    const direction = String(body.direction || body.orderType || 'BUY').trim().toUpperCase() as 'BUY' | 'SELL';
    const volume = Number(body.volume || body.lots || 0.01);
    const sl = Number(body.sl ?? body.stopLoss ?? 0);
    const tp1 = Number(body.tp1 ?? body.tp ?? body.takeProfit ?? 0);
    const tp2 = body.tp2 != null ? Number(body.tp2) : undefined;
    const tp3 = body.tp3 != null ? Number(body.tp3) : undefined;
    const entryPrice = Number(body.entryPrice || body.price || 0);

    // 1. Session check
    const session = evaluateMarketSession(canonicalSymbol, new Date());
    if (!session.tradeExecutable) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'MARKET_CLOSED',
          message: `Cannot prepare order: Market for ${canonicalSymbol} is ${session.statusLabel}.`,
        },
        { status: 403 }
      );
    }

    // 2. Query broker quote and spec for validation
    let quote = null;
    let spec = symbolDirectory.getSpec(canonicalSymbol) || symbolDirectory.getSpec(brokerSymbol);

    try {
      const qRes = await mt5HttpClient.getQuote(brokerSymbol);
      if (qRes.success && qRes.data) {
        quote = qRes.data;
      }
    } catch {}

    const effectiveEntry = entryPrice > 0
      ? entryPrice
      : (quote ? (direction === 'BUY' ? quote.ask : quote.bid) : 0);

    if (effectiveEntry <= 0) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'INVALID_ENTRY_PRICE',
          message: 'Cannot prepare order: Unable to determine valid market entry price.',
        },
        { status: 400 }
      );
    }

    // 3. Contract Specification Validation
    const specValidation = validateOrderAgainstSpec({
      symbol: canonicalSymbol,
      volume,
      sl,
      tp: tp1,
      entryPrice: effectiveEntry,
      orderType: direction,
      spec,
    });

    if (!specValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'SPEC_VIOLATION',
          message: `Broker specification check failed: ${specValidation.errors.join('; ')}`,
          errors: specValidation.errors,
          warnings: specValidation.warnings,
        },
        { status: 400 }
      );
    }

    // 4. Trade Protection Validation (Geometry, SL/TP)
    const protectionValidation = validateTradeProtection({
      symbol: canonicalSymbol,
      direction,
      entry: effectiveEntry,
      sl: specValidation.normalizedSl ?? sl,
      tp1: specValidation.normalizedTp ?? tp1,
      tp2,
      tp3,
      brokerQuote: quote,
      symbolSpec: spec ? {
        point: spec.point,
        digits: spec.digits,
        stopsLevel: spec.stopsLevel,
        freezeLevel: spec.freezeLevel,
      } : null,
    });

    if (!protectionValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          errorCode: protectionValidation.state,
          message: `Trade protection check failed: ${protectionValidation.reasons.join(' ')}`,
          reasons: protectionValidation.reasons,
        },
        { status: 400 }
      );
    }

    // 5. Generate Cryptographic Confirmation Artifact
    const orderInput: OrderConfirmationInput = {
      canonicalSymbol,
      brokerSymbol,
      direction,
      orderType: direction,
      volume: specValidation.normalizedVolume,
      entryPrice: effectiveEntry,
      stopLoss: specValidation.normalizedSl ?? sl,
      takeProfit1: specValidation.normalizedTp ?? tp1,
      takeProfit2: tp2,
      takeProfit3: tp3,
      accountId: body.accountId || 'CONNECTED_MT5_ACCOUNT',
      brokerServer: body.brokerServer || 'MT5_SERVER',
      tradeMode: (body.tradeMode || 'DEMO').toUpperCase() as 'DEMO' | 'REAL',
      evidenceTrust: typeof body.evidenceTrust === 'number' ? body.evidenceTrust : 75,
      humanConfirmed: false, // Must be confirmed in step 2
      isAutomatic: false,
    };

    const artifact = generateOrderConfirmation(orderInput, 60);

    return NextResponse.json({
      success: true,
      artifact,
      warnings: specValidation.warnings,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        errorCode: 'PREPARE_EXCEPTION',
        message: err.message || 'Failed to prepare order confirmation.',
      },
      { status: 500 }
    );
  }
}
