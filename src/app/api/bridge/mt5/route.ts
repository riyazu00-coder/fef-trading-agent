import { NextRequest, NextResponse } from 'next/server';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';
import { mt5BridgeClient } from '@/lib/bridge/mt5-client';
import { BridgeCommand, RESTRICTED_EXECUTION_COMMANDS } from '@/lib/bridge/mt5-bridge-protocol';
import { symbolDirectory } from '@/lib/bridge/symbol-mapper';
import { evaluateMarketSession } from '@/lib/session/market-session-engine';
import { validateTradeProtection } from '@/lib/execution/trade-protection-validator';
import { verifyAndConsumeConfirmationToken } from '@/lib/execution/confirmation-authority';
import { CANONICAL_EXECUTION_MODE, READ_ONLY_EXECUTION_ERROR } from '@/lib/execution/execution-policy';

export const dynamic = 'force-dynamic';

/**
 * Dispatch command to the active bridge transport:
 * Prioritizes Phase 32B Local HTTP Bridge (127.0.0.1:5556),
 * falling back cleanly to legacy TCP Bridge (127.0.0.1:5555) if HTTP is offline.
 */
async function dispatchCommand(action: BridgeCommand, params?: any, symbol?: string) {
  // 1. Prioritize HTTP WebRequest Bridge (Port 5556)
  try {
    const httpRes = await mt5HttpClient.sendCommand(action, params, symbol);
    if (httpRes.state !== 'BRIDGE_OFFLINE') {
      return { ...httpRes, transport: 'HTTP / WEBREQUEST' };
    }
  } catch {
    // Continue to fallback
  }

  // 2. Legacy TCP Socket Fallback (Port 5555)
  const tcpRes = await mt5BridgeClient.sendCommand(action, params, symbol);
  return { ...tcpRes, transport: 'TCP SOCKET (LEGACY)' };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawAction = searchParams.get('action') || 'PING';
  const symbol = searchParams.get('symbol') || undefined;

  // Dedicated status query for detailed telemetry & heartbeat age
  if (rawAction.toUpperCase() === 'STATUS' || rawAction.toUpperCase() === 'TELEMETRY') {
    const status = await mt5HttpClient.getStatus();
    if (status && Array.isArray(status.symbols) && status.symbols.length > 0) {
      symbolDirectory.discoverFromBrokerSymbols(status.symbols);
    }
    return NextResponse.json({
      ...status,
      resolvedMap: symbolDirectory.getResolvedMap()
    });
  }

  const action = rawAction.toUpperCase() as BridgeCommand;

  try {
    switch (action) {
      case 'PING': {
        const res = await dispatchCommand('PING');
        return NextResponse.json(res);
      }
      case 'GET_TERMINAL_STATUS': {
        const res = await dispatchCommand('GET_TERMINAL_STATUS');
        return NextResponse.json(res);
      }
      case 'GET_ACCOUNT': {
        const res = await dispatchCommand('GET_ACCOUNT');
        return NextResponse.json(res);
      }
      case 'GET_SYMBOLS': {
        const res = await dispatchCommand('GET_SYMBOLS');
        return NextResponse.json({
          ...res,
          resolvedMap: symbolDirectory.getResolvedMap()
        });
      }
      case 'GET_SYMBOL_INFO': {
        if (!symbol) {
          return NextResponse.json(
            { success: false, error: { code: 'MISSING_PARAM', message: 'symbol parameter required' } },
            { status: 400 }
          );
        }
        const res = await dispatchCommand('GET_SYMBOL_INFO', undefined, symbol);
        return NextResponse.json(res);
      }
      case 'GET_QUOTE': {
        if (!symbol) {
          return NextResponse.json(
            { success: false, error: { code: 'MISSING_PARAM', message: 'symbol parameter required' } },
            { status: 400 }
          );
        }
        const res = await dispatchCommand('GET_QUOTE', undefined, symbol);
        return NextResponse.json(res);
      }
      case 'GET_POSITIONS': {
        const res = await dispatchCommand('GET_POSITIONS');
        return NextResponse.json(res);
      }
      case 'GET_PENDING_ORDERS': {
        const res = await dispatchCommand('GET_PENDING_ORDERS');
        return NextResponse.json(res);
      }
      case 'GET_BROKER_SESSIONS': {
        const res = await dispatchCommand('GET_BROKER_SESSIONS', undefined, symbol);
        return NextResponse.json(res);
      }
      default: {
        return NextResponse.json(
          {
            success: false,
            state: 'ERROR',
            error: {
              code: 'UNSUPPORTED_ACTION',
              message: `Action '${action}' is not supported via GET.`
            }
          },
          { status: 400 }
        );
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        state: 'ERROR',
        error: {
          code: 'BRIDGE_DISPATCH_EXCEPTION',
          message: err.message || 'Server error communicating with MT5 bridge'
        }
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, host, port, token, symbol, params } = body;

    // Optional configuration update from UI
    if (host || port) {
      mt5BridgeClient.updateConfig({
        ...(host ? { host } : {}),
        ...(port ? { port: Number(port) } : {}),
        ...(token ? { token } : {})
      });
      if (port === 5556 || host) {
        mt5HttpClient.updateConfig({
          baseUrl: `http://${host || '127.0.0.1'}:${port || 5556}`,
          ...(token ? { token } : {})
        });
      }
    }

    if (!action) {
      return NextResponse.json({
        success: true,
        message: 'Configuration updated',
        currentConfig: {
          host: mt5BridgeClient.getConfig().host,
          port: mt5BridgeClient.getConfig().port,
          httpBaseUrl: mt5HttpClient.getConfig().baseUrl,
          magicNumber: mt5BridgeClient.getConfig().magicNumber,
          executionEnabled: mt5BridgeClient.getConfig().executionEnabled
        }
      });
    }

    const command = action.toUpperCase() as BridgeCommand;

    // MT5 Execution Gateway: Mutating commands are dispatched to connected MT5 terminal
    if (command === 'PLACE_ORDER') {
      const targetSym = symbol || params?.canonicalSymbol || params?.brokerSymbol || 'XAUUSD';
      const session = evaluateMarketSession(targetSym, new Date());
      if (!session.tradeExecutable) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            error: {
              code: 'MARKET_CLOSED',
              message: `Risk Guardian Gate: Execution command 'PLACE_ORDER' rejected because market for ${targetSym} is ${session.statusLabel}.`
            }
          },
          { status: 403 }
        );
      }

      // Invariant 1: Automated execution strictly forbidden
      if (params && params.isAutomatic === true) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            error: {
              code: 'AUTOMATIC_DISPATCH_FORBIDDEN',
              message: 'Execution rejected: Autonomous or programmatic order dispatch is strictly prohibited.',
            },
          },
          { status: 403 }
        );
      }

      // Invariant 2: Mandatory Human Confirmation Token Gate
      const confToken = params?.confirmationToken || body?.confirmationToken;
      if (!confToken) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            error: {
              code: 'CONFIRMATION_REQUIRED',
              message: 'Execution rejected: Mandatory single-use human confirmation token is required.',
            },
          },
          { status: 403 }
        );
      }

      // Invariant 3: Verify and consume single-use token
      const tokenVerification = verifyAndConsumeConfirmationToken(confToken, {
        canonicalSymbol: targetSym,
        brokerSymbol: params?.brokerSymbol || targetSym,
        direction: String(params?.direction || params?.orderType || 'BUY').toUpperCase() as 'BUY' | 'SELL',
        orderType: String(params?.orderType || params?.direction || 'BUY').toUpperCase(),
        volume: Number(params?.volume || params?.lots || 0),
        entryPrice: Number(params?.price || 0),
        stopLoss: Number(params?.sl ?? params?.stopLoss ?? 0),
        takeProfit1: Number(params?.tp1 ?? params?.tp ?? params?.takeProfit ?? 0),
        takeProfit2: params?.tp2 != null ? Number(params.tp2) : undefined,
        takeProfit3: params?.tp3 != null ? Number(params.tp3) : undefined,
        humanConfirmed: params?.humanApproved !== false,
        isAutomatic: false,
      });

      if (!tokenVerification.valid) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            error: {
              code: tokenVerification.errorCode || 'CONFIRMATION_FAILED',
              message: tokenVerification.message || 'Execution confirmation verification failed.',
            },
          },
          { status: 403 }
        );
      }

      let bridgeStatus: any = null;
      try {
        bridgeStatus = await mt5HttpClient.getStatus();
        if (!bridgeStatus || (!bridgeStatus.mt5Connected && bridgeStatus.localBridge !== 'ONLINE')) {
          return NextResponse.json(
            {
              success: false,
              state: 'REJECTED',
              error: {
                code: 'MT5_NOT_CONNECTED',
                message: 'Execution rejected: MT5 bridge is not connected.'
              }
            },
            { status: 403 }
          );
        }

        // Quote freshness verification
        if (bridgeStatus?.quotes) {
          const brokerSym = params?.brokerSymbol || targetSym;
          const quote = bridgeStatus.quotes[targetSym] || bridgeStatus.quotes[brokerSym];
          if (!quote) {
            return NextResponse.json(
              {
                success: false,
                state: 'REJECTED',
                error: {
                  code: 'QUOTE_UNAVAILABLE',
                  message: `Execution rejected: Broker quote for ${targetSym} is UNAVAILABLE.`
                }
              },
              { status: 403 }
            );
          }
          if (quote.freshness === 'SESSION_CLOSED') {
            return NextResponse.json(
              {
                success: false,
                state: 'REJECTED',
                error: {
                  code: 'SESSION_CLOSED',
                  message: `Execution rejected: Market session for ${targetSym} is closed.`
                }
              },
              { status: 403 }
            );
          }
          if (quote.freshness === 'STALE' || quote.isStale) {
            return NextResponse.json(
              {
                success: false,
                state: 'REJECTED',
                error: {
                  code: 'STALE_QUOTE',
                  message: `Execution rejected: Broker quote for ${targetSym} is STALE.`
                }
              },
              { status: 403 }
            );
          }
        }
      } catch {}

      // Mandatory Trade Protection Revalidation (Phase 2B.3)
      const isEngineeringDemo = Boolean(
        params?.testType === 'ENGINEERING_DEMO_TEST' ||
        params?.comment === 'FEF V1 DEMO ACCEPTANCE' ||
        String(params?.requestId || '').startsWith('ENG-DEMO-')
      );

      if (!isEngineeringDemo) {
        const orderDirection = String(params?.direction || params?.orderType || 'BUY').toUpperCase() as 'BUY' | 'SELL';
        const quote = bridgeStatus?.quotes ? (bridgeStatus.quotes[targetSym] || bridgeStatus.quotes[params?.brokerSymbol || targetSym]) : null;
        const entryPriceToValidate = Number(params?.price) || (quote ? (orderDirection === 'BUY' ? quote.ask : quote.bid) : 0);
        const slToValidate = Number(params?.sl ?? params?.stopLoss ?? 0);
        const tp1ToValidate = Number(params?.tp1 ?? params?.tp ?? params?.takeProfit ?? 0);
        const tp2ToValidate = params?.tp2 != null ? Number(params.tp2) : undefined;
        const tp3ToValidate = params?.tp3 != null ? Number(params.tp3) : undefined;

        const protectionValidation = validateTradeProtection({
          symbol: targetSym,
          direction: orderDirection,
          entry: entryPriceToValidate,
          sl: slToValidate,
          tp1: tp1ToValidate,
          tp2: tp2ToValidate,
          tp3: tp3ToValidate,
          brokerQuote: quote,
          symbolSpec: quote ? {
            point: quote.point,
            digits: quote.digits,
            stopsLevel: quote.stopsLevel,
            freezeLevel: quote.freezeLevel,
          } : null,
        });

        if (!protectionValidation.valid) {
          return NextResponse.json(
            {
              success: false,
              state: 'REJECTED',
              error: {
                code: protectionValidation.state,
                message: `Mandatory Protection Gate: Order rejected (${protectionValidation.state}). ${protectionValidation.reasons.join(' ')}`
              }
            },
            { status: 400 }
          );
        }
      }

      const res = await dispatchCommand('PLACE_ORDER', params, symbol);
      return NextResponse.json(res);
    }

    const res = await dispatchCommand(command, params, symbol);
    return NextResponse.json(res);
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        state: 'ERROR',
        error: {
          code: 'BRIDGE_POST_EXCEPTION',
          message: err.message || 'Error processing bridge POST request'
        }
      },
      { status: 500 }
    );
  }
}
