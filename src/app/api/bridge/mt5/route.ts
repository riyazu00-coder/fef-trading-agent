import { NextRequest, NextResponse } from 'next/server';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';
import { mt5BridgeClient } from '@/lib/bridge/mt5-client';
import { BridgeCommand, RESTRICTED_EXECUTION_COMMANDS } from '@/lib/bridge/mt5-bridge-protocol';
import { symbolDirectory } from '@/lib/bridge/symbol-mapper';
import { evaluateMarketSession } from '@/lib/session/market-session-engine';

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

    // Defense-in-depth: Reject any mutating command
    if (RESTRICTED_EXECUTION_COMMANDS.has(command)) {
      if (symbol) {
        const session = evaluateMarketSession(symbol, new Date());
        if (!session.tradeExecutable) {
          return NextResponse.json(
            {
              success: false,
              state: 'REJECTED',
              error: {
                code: 'MARKET_CLOSED_EXECUTION_BLOCKED',
                message: `Risk Guardian Gate: Execution command '${command}' rejected because market for ${symbol} is ${session.statusLabel}.`
              }
            },
            { status: 403 }
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          state: 'CONNECTED_READ_ONLY',
          error: {
            code: 'READ_ONLY_LOCK_ACTIVE',
            message: `Write action '${command}' rejected: FEF MT5 Bridge is locked in READ_ONLY safety mode. Real execution is blocked.`
          }
        },
        { status: 403 }
      );
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
