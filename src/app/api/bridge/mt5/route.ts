import { NextRequest, NextResponse } from 'next/server';
import { mt5BridgeClient } from '@/lib/bridge/mt5-client';
import { BridgeCommand } from '@/lib/bridge/mt5-bridge-protocol';
import { symbolDirectory } from '@/lib/bridge/symbol-mapper';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = (searchParams.get('action') || 'PING').toUpperCase() as BridgeCommand;
  const symbol = searchParams.get('symbol') || undefined;

  try {
    switch (action) {
      case 'PING': {
        const res = await mt5BridgeClient.ping();
        return NextResponse.json(res);
      }
      case 'GET_TERMINAL_STATUS': {
        const res = await mt5BridgeClient.getTerminalStatus();
        return NextResponse.json(res);
      }
      case 'GET_ACCOUNT': {
        const res = await mt5BridgeClient.getAccount();
        return NextResponse.json(res);
      }
      case 'GET_SYMBOLS': {
        const res = await mt5BridgeClient.getSymbols();
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
        const res = await mt5BridgeClient.getSymbolInfo(symbol);
        return NextResponse.json(res);
      }
      case 'GET_QUOTE': {
        if (!symbol) {
          return NextResponse.json(
            { success: false, error: { code: 'MISSING_PARAM', message: 'symbol parameter required' } },
            { status: 400 }
          );
        }
        const res = await mt5BridgeClient.getQuote(symbol);
        return NextResponse.json(res);
      }
      case 'GET_POSITIONS': {
        const res = await mt5BridgeClient.getPositions();
        return NextResponse.json(res);
      }
      case 'GET_PENDING_ORDERS': {
        const res = await mt5BridgeClient.getPendingOrders();
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
    }

    if (!action) {
      return NextResponse.json({
        success: true,
        message: 'Configuration updated',
        currentConfig: {
          host: mt5BridgeClient.getConfig().host,
          port: mt5BridgeClient.getConfig().port,
          magicNumber: mt5BridgeClient.getConfig().magicNumber,
          executionEnabled: mt5BridgeClient.getConfig().executionEnabled
        }
      });
    }

    const command = action.toUpperCase() as BridgeCommand;
    const res = await mt5BridgeClient.sendCommand(command, params, symbol);
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
