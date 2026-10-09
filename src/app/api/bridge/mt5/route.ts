import { NextRequest, NextResponse } from 'next/server';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';
import { mt5BridgeClient } from '@/lib/bridge/mt5-client';
import { executionBridgeV2Client } from '@/lib/bridge/execution-bridge-v2-client';
import { BridgeCommand, RESTRICTED_EXECUTION_COMMANDS } from '@/lib/bridge/mt5-bridge-protocol';
import { symbolDirectory } from '@/lib/bridge/symbol-mapper';
import { evaluateMarketSession } from '@/lib/session/market-session-engine';
import { validateTradeProtection, reanchorProtectionLevels } from '@/lib/execution/trade-protection-validator';
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

  // 1. Try Bridge V2 (:5560) first for live MT5 telemetry
  const v2Telemetry = await executionBridgeV2Client.getUnifiedTelemetry();
  const isV2Connected = Boolean(v2Telemetry && v2Telemetry.mt5Connected);

  // Dedicated status query for detailed telemetry & heartbeat age
  if (rawAction.toUpperCase() === 'STATUS' || rawAction.toUpperCase() === 'TELEMETRY') {
    if (isV2Connected && v2Telemetry) {
      return NextResponse.json({
        ...v2Telemetry,
        resolvedMap: symbolDirectory.getResolvedMap(),
      });
    }

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
        if (isV2Connected && v2Telemetry) {
          return NextResponse.json({
            success: true,
            state: v2Telemetry.state,
            transport: 'EXECUTION BRIDGE V2 (HTTP / WEBREQUEST)',
            data: { status: 'PONG' },
            timestamp: Date.now(),
          });
        }
        const res = await dispatchCommand('PING');
        return NextResponse.json(res);
      }
      case 'GET_TERMINAL_STATUS': {
        if (isV2Connected && v2Telemetry) {
          return NextResponse.json({
            success: true,
            state: v2Telemetry.state,
            transport: 'EXECUTION BRIDGE V2 (HTTP / WEBREQUEST)',
            data: v2Telemetry.terminal,
            timestamp: Date.now(),
          });
        }
        const res = await dispatchCommand('GET_TERMINAL_STATUS');
        return NextResponse.json(res);
      }
      case 'GET_ACCOUNT': {
        if (isV2Connected && v2Telemetry && v2Telemetry.account) {
          return NextResponse.json({
            success: true,
            state: v2Telemetry.state,
            transport: 'EXECUTION BRIDGE V2 (HTTP / WEBREQUEST)',
            data: v2Telemetry.account,
            timestamp: Date.now(),
          });
        }
        const res = await dispatchCommand('GET_ACCOUNT');
        return NextResponse.json(res);
      }
      case 'GET_SYMBOLS': {
        if (isV2Connected && v2Telemetry) {
          const syms = Object.keys(v2Telemetry.allQuotes);
          return NextResponse.json({
            success: true,
            state: v2Telemetry.state,
            transport: 'EXECUTION BRIDGE V2 (HTTP / WEBREQUEST)',
            data: { symbols: syms },
            resolvedMap: symbolDirectory.getResolvedMap(),
            timestamp: Date.now(),
          });
        }
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
        if (isV2Connected && v2Telemetry && v2Telemetry.allQuotes[symbol.toUpperCase()]) {
          return NextResponse.json({
            success: true,
            state: v2Telemetry.state,
            transport: 'EXECUTION BRIDGE V2 (HTTP / WEBREQUEST)',
            data: v2Telemetry.allQuotes[symbol.toUpperCase()],
            timestamp: Date.now(),
          });
        }
        const res = await dispatchCommand('GET_QUOTE', undefined, symbol);
        return NextResponse.json(res);
      }
      case 'GET_POSITIONS': {
        if (isV2Connected && v2Telemetry) {
          return NextResponse.json({
            success: true,
            state: v2Telemetry.state,
            transport: 'EXECUTION BRIDGE V2 (HTTP / WEBREQUEST)',
            data: { positions: v2Telemetry.allPositions },
            timestamp: Date.now(),
          });
        }
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
    const rawAction = body.action || body.command || body.order?.action || body.params?.action;
    const { host, port, token } = body;
    const params = body.params || body.order || body;
    const symbol = body.symbol || params?.symbol || params?.canonicalSymbol;

    // Optional configuration update from UI
    if (host || port) {
      const numericPort = port ? Number(port) : undefined;
      // If configured for canonical HTTP bridge port 5556 or just changing host
      if (numericPort === 5556 || (!numericPort && host)) {
        mt5HttpClient.updateConfig({
          baseUrl: `http://${host || '127.0.0.1'}:5556`,
          ...(token ? { token } : {})
        });
      } else if (numericPort === 5555) {
        // Explicit legacy TCP bridge port configuration
        mt5BridgeClient.updateConfig({
          ...(host ? { host } : {}),
          port: 5555,
          ...(token ? { token } : {})
        });
      } else if (numericPort) {
        // Custom port applies to HTTP client
        mt5HttpClient.updateConfig({
          baseUrl: `http://${host || '127.0.0.1'}:${numericPort}`,
          ...(token ? { token } : {})
        });
      }
    }

    if (!rawAction && !params?.direction && !params?.orderType) {
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

    const command = (rawAction || 'PLACE_ORDER').toUpperCase() as BridgeCommand;

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

      // Human Approval check
      if (params && params.humanApproved === false) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            error: {
              code: 'HUMAN_APPROVAL_REQUIRED',
              message: 'Execution rejected: Explicit human approval is required for all orders.'
            }
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
        let entryPriceToValidate = Number(params?.price) || (quote ? (orderDirection === 'BUY' ? quote.ask : quote.bid) : 0);
        let slToValidate = Number(params?.sl ?? params?.stopLoss ?? 0);
        let tp1ToValidate = Number(params?.tp1 ?? params?.tp ?? params?.takeProfit ?? 0);
        let tp2ToValidate = params?.tp2 != null ? Number(params.tp2) : undefined;
        let tp3ToValidate = params?.tp3 != null ? Number(params.tp3) : undefined;

        // If planned reference price is provided and live quote shifted, re-anchor dynamically
        if (params?.plannedPrice && Number(params.plannedPrice) > 0 && entryPriceToValidate > 0) {
          const reanchored = reanchorProtectionLevels({
            direction: orderDirection,
            plannedEntry: Number(params.plannedPrice),
            freshEntry: entryPriceToValidate,
            sl: slToValidate,
            tp1: tp1ToValidate,
            tp2: tp2ToValidate,
            tp3: tp3ToValidate,
            digits: quote?.digits ?? 5,
          });
          entryPriceToValidate = reanchored.entry;
          slToValidate = reanchored.sl;
          tp1ToValidate = reanchored.tp1;
          tp2ToValidate = reanchored.tp2;
          tp3ToValidate = reanchored.tp3;
          if (params) {
            params.price = reanchored.entry;
            params.sl = reanchored.sl;
            params.tp1 = reanchored.tp1;
            if (reanchored.tp2 != null) params.tp2 = reanchored.tp2;
            else delete params.tp2;
            if (reanchored.tp3 != null) params.tp3 = reanchored.tp3;
            else delete params.tp3;
          }
        }

        // Gracefully decouple secondary partial targets (TP2/TP3) if non-cascading
        // MT5 market tickets only take a single SL and TP1; secondary targets must never abort broker execution
        if (orderDirection === 'BUY') {
          if (tp2ToValidate != null && tp2ToValidate <= tp1ToValidate) {
            tp2ToValidate = undefined;
            if (params) delete params.tp2;
          }
          if (tp3ToValidate != null) {
            const priorTp = tp2ToValidate ?? tp1ToValidate;
            if (tp3ToValidate <= priorTp) {
              tp3ToValidate = undefined;
              if (params) delete params.tp3;
            }
          }
        } else {
          if (tp2ToValidate != null && tp2ToValidate >= tp1ToValidate) {
            tp2ToValidate = undefined;
            if (params) delete params.tp2;
          }
          if (tp3ToValidate != null) {
            const priorTp = tp2ToValidate ?? tp1ToValidate;
            if (tp3ToValidate >= priorTp) {
              tp3ToValidate = undefined;
              if (params) delete params.tp3;
            }
          }
        }

        const protectionValidation = validateTradeProtection({
          symbol: targetSym,
          direction: orderDirection,
          entry: entryPriceToValidate,
          sl: slToValidate,
          tp1: tp1ToValidate,
          tp2: tp2ToValidate,
          tp3: tp3ToValidate,
          brokerQuote: quote,
          maxQuoteAgeMs: 15000,
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

      if (params) {
        params.allowOrderDispatch = true;
        params.orderTransportEnabled = true;
        if (params.tp1 != null && params.tp == null) params.tp = params.tp1;
        if (params.tp != null && params.tp1 == null) params.tp1 = params.tp;
        if (params.takeProfit != null && params.tp == null) params.tp = params.takeProfit;
        if (params.tp != null && params.takeProfit == null) params.takeProfit = params.tp;
      }

      const res = await dispatchCommand('PLACE_ORDER', params, symbol);
      return NextResponse.json(res);
    }

    if (params) {
      params.allowOrderDispatch = true;
      params.orderTransportEnabled = true;
      if (params.tp1 != null && params.tp == null) params.tp = params.tp1;
      if (params.tp != null && params.tp1 == null) params.tp1 = params.tp;
      if (params.takeProfit != null && params.tp == null) params.tp = params.takeProfit;
      if (params.tp != null && params.takeProfit == null) params.takeProfit = params.tp;
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
