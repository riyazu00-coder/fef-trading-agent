import { NextRequest, NextResponse } from 'next/server';
import { verifyAndConsumeConfirmationToken } from '@/lib/execution/confirmation-authority';
import { evaluateMarketSession } from '@/lib/session/market-session-engine';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';
import { mt5BridgeClient } from '@/lib/bridge/mt5-client';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { confirmationToken, order, humanConfirmed, isAutomatic } = body;

    // 1. Invariant: Automated execution prohibited
    if (isAutomatic === true) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'AUTOMATIC_DISPATCH_FORBIDDEN',
          message: 'Execution rejected: Automatic order transmission is permanently disabled.',
        },
        { status: 403 }
      );
    }

    // 2. Invariant: Mandatory Human Confirmation
    if (humanConfirmed !== true) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'HUMAN_CONFIRMATION_MISSING',
          message: 'Execution rejected: Explicit human operator confirmation is required.',
        },
        { status: 403 }
      );
    }

    // 3. Cryptographic Token & Fingerprint Gate (Single-use, 60s TTL)
    const verification = verifyAndConsumeConfirmationToken(confirmationToken, {
      ...order,
      humanConfirmed: true,
      isAutomatic: false,
    });

    if (!verification.valid || !verification.artifact) {
      return NextResponse.json(
        {
          success: false,
          errorCode: verification.errorCode || 'CONFIRMATION_FAILED',
          message: verification.message || 'Execution confirmation verification failed.',
        },
        { status: 403 }
      );
    }

    const confirmedOrder = verification.artifact.order;

    // 4. Session Active Check
    const session = evaluateMarketSession(confirmedOrder.canonicalSymbol, new Date());
    if (!session.tradeExecutable) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'MARKET_CLOSED',
          message: `Execution rejected: Market for ${confirmedOrder.canonicalSymbol} is ${session.statusLabel}.`,
        },
        { status: 403 }
      );
    }

    // 5. Check MT5 Bridge Health & Quote Freshness
    let bridgeStatus: any = null;
    try {
      bridgeStatus = await mt5HttpClient.getStatus();
      if (!bridgeStatus || (!bridgeStatus.mt5Connected && bridgeStatus.localBridge !== 'ONLINE')) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'MT5_NOT_CONNECTED',
            message: 'Execution rejected: MT5 bridge is not connected.',
          },
          { status: 503 }
        );
      }
    } catch {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'BRIDGE_UNREACHABLE',
          message: 'Execution rejected: Unable to communicate with MT5 bridge.',
        },
        { status: 503 }
      );
    }

    // 6. Build execution parameters for MT5 bridge
    const dispatchParams = {
      requestId: `fef-exec-${Date.now()}`,
      action: 'PLACE_ORDER',
      symbol: confirmedOrder.canonicalSymbol,
      brokerSymbol: confirmedOrder.brokerSymbol,
      orderType: confirmedOrder.orderType,
      volume: confirmedOrder.volume,
      price: confirmedOrder.entryPrice,
      sl: confirmedOrder.stopLoss,
      tp: confirmedOrder.takeProfit1,
      tp1: confirmedOrder.takeProfit1,
      tp2: confirmedOrder.takeProfit2,
      tp3: confirmedOrder.takeProfit3,
      comment: `FEF-${confirmedOrder.canonicalSymbol}-${confirmedOrder.direction}`,
      humanApproved: true,
      confirmationToken,
      fingerprint: verification.artifact.fingerprint,
      tradeMode: confirmedOrder.tradeMode,
      timestamp: Date.now(),
    };

    // 7. Dispatch to MT5 Transport
    let execRes: any = null;
    try {
      execRes = await mt5HttpClient.sendCommand('PLACE_ORDER', dispatchParams, confirmedOrder.brokerSymbol);
      if (execRes.state === 'BRIDGE_OFFLINE') {
        execRes = await mt5BridgeClient.sendCommand('PLACE_ORDER', dispatchParams, confirmedOrder.brokerSymbol);
      }
    } catch (dispatchErr: any) {
      return NextResponse.json(
        {
          success: false,
          errorCode: 'DISPATCH_EXCEPTION',
          message: dispatchErr.message || 'Error transmitting order to MT5 bridge.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: execRes?.success ?? false,
      result: execRes,
      confirmationToken,
      consumedAt: Date.now(),
      artifactSummary: verification.artifact.summary,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        errorCode: 'CONFIRM_EXCEPTION',
        message: err.message || 'Execution confirmation encounter server error.',
      },
      { status: 500 }
    );
  }
}
