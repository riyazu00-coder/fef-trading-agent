import { NextRequest, NextResponse } from 'next/server';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';
import { mt5BridgeClient } from '@/lib/bridge/mt5-client';
import { executionBridgeV2Client } from '@/lib/bridge/execution-bridge-v2-client';
import { BridgeCommand, RESTRICTED_EXECUTION_COMMANDS } from '@/lib/bridge/mt5-bridge-protocol';
import { symbolDirectory } from '@/lib/bridge/symbol-mapper';
import { evaluateMarketSession } from '@/lib/session/market-session-engine';
import { validateTradeProtection, reanchorProtectionLevels } from '@/lib/execution/trade-protection-validator';
import { calculateAutomaticStopLoss } from '@/lib/execution/auto-stop-loss-policy';
import {
  CANONICAL_EXECUTION_MODE,
  READ_ONLY_EXECUTION_ERROR,
  validateAccountExecutionMode,
  validateLicensedExecution,
  EXECUTION_GATE_ERRORS,
} from '@/lib/execution/execution-policy';
import { clientLicenseController } from '@/lib/licensing/client-license-controller';
import { verifySessionToken } from '@/lib/licensing/member-session-token';

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

import { enrichTelemetryWithLocalMarketData } from '@/lib/bridge/local-telemetry-enricher';

// Hop 1 Production Transport Configuration (Single-User Execution)
const REMOTE_RELAY_URL = (
  process.env.FEF_REMOTE_RELAY_URL ||
  'https://fef-secure-remote-relay.onrender.com'
).trim().replace(/\/$/, '');

const REMOTE_DEVICE_ID = (
  process.env.FEF_REMOTE_DEVICE_ID ||
  process.env.FEF_TELEMETRY_DEVICE_ID ||
  'fef-connector-primary-01'
).trim();

const REMOTE_DEVICE_SECRET = (
  process.env.FEF_REMOTE_DEVICE_SECRET ||
  process.env.FEF_TELEMETRY_DEVICE_SECRET ||
  ''
).trim();

function isProductionExecutionTransport(): boolean {
  if (process.env.FEF_EXECUTION_TRANSPORT === 'REMOTE_RELAY') return true;
  if (process.env.FEF_EXECUTION_TRANSPORT === 'LOCAL_BRIDGE') return false;
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) return true;
  return false;
}

async function fetchRemoteRelayTelemetry(): Promise<any> {
  const telemetryUrl = `${REMOTE_RELAY_URL}/device/${encodeURIComponent(REMOTE_DEVICE_ID)}/telemetry`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(telemetryUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
      return null;
    }
    return {
      success: true,
      transport: 'REMOTE_RELAY',
      localBridge: data.connected ? 'ONLINE' : 'OFFLINE',
      mt5Connected: Boolean(data.terminalConnected && data.connected),
      state: data.connected ? 'CONNECTED_DEMO_EXECUTION' : 'MT5_OFFLINE',
      mode: 'DEMO_EXECUTION',
      operatingMode: 'DEMO_EXECUTION',
      heartbeatAgeMs: data.heartbeatAgeMs,
      broker: data.broker,
      server: data.server,
      account: {
        maskedLogin: data.maskedAccount || '00***00',
        broker: data.broker,
        server: data.server,
        tradeMode: data.tradeMode || 'DEMO',
        operatingMode: 'DEMO_EXECUTION',
      },
      terminal: {
        broker: data.broker,
        server: data.server,
        connected: Boolean(data.terminalConnected),
        operatingMode: 'DEMO_EXECUTION',
      },
      quotes: data.quotes || {},
      symbols: Array.isArray(data.symbols) && data.symbols.length > 0 ? data.symbols : Object.keys(data.quotes || {}),
      positions: Array.isArray(data.positions) ? data.positions : [],
      pendingOrders: Array.isArray(data.pendingOrders) ? data.pendingOrders : [],
      sessions: data.sessions || {},
      assetDiagnostics: data.assetDiagnostics || {},
    };
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function dispatchRemoteRelayProbe(requestId?: string): Promise<any> {
  const reqId = requestId || `probe-${Date.now()}`;
  const probeUrl = `${REMOTE_RELAY_URL}/device/${encodeURIComponent(REMOTE_DEVICE_ID)}/probe`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(probeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: reqId,
        commandType: 'TRANSPORT_PROBE',
        expiresAt: Date.now() + 15000,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => null);
    return {
      ...data,
      transport: 'REMOTE_RELAY',
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      success: false,
      state: 'ERROR',
      transport: 'REMOTE_RELAY',
      error: {
        code: 'RELAY_PROBE_ERROR',
        message: err.message || 'Failed to probe remote relay transport',
      },
    };
  }
}

async function dispatchRemoteRelayOrder(
  params: any,
  symbol: string,
  direction: 'BUY' | 'SELL',
  priceBasis: number
): Promise<any> {
  if (!REMOTE_DEVICE_SECRET) {
    return {
      success: false,
      state: 'ERROR',
      transport: 'REMOTE_RELAY',
      error: {
        code: 'RELAY_AUTH_SECRET_MISSING',
        message: 'FEF_REMOTE_DEVICE_SECRET or FEF_TELEMETRY_DEVICE_SECRET is required for production remote execution.',
      },
    };
  }

  const reqId = params.requestId || `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const approvalId = params.approvalId || `appr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();
  const expiresAt = now + 15000;

  const payload = {
    requestId: reqId,
    approvalId,
    deviceId: REMOTE_DEVICE_ID,
    symbol,
    brokerSymbol: params.brokerSymbol || symbol,
    direction,
    volume: Number(params.volume ?? params.lots ?? 0.01),
    priceBasis: Number(priceBasis || params.price || 0),
    sl: Number(params.sl ?? 0),
    tp1: Number(params.tp1 ?? params.tp ?? 0),
    humanApproved: true,
    humanConfirmed: true,
    accountMode: 'DEMO',
    tradeMode: 'DEMO',
    expiresAt,
    comment: String(params.comment || 'FEF-Cockpit-Remote'),
  };

  const executeUrl = `${REMOTE_RELAY_URL}/device/${encodeURIComponent(REMOTE_DEVICE_ID)}/execute`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 16000);

  try {
    const res = await fetch(executeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${REMOTE_DEVICE_SECRET}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      return {
        success: false,
        state: 'REJECTED',
        transport: 'REMOTE_RELAY',
        error: data?.error || {
          code: 'RELAY_EXECUTION_FAILED',
          message: `Remote relay rejected execution with status ${res.status}`,
        },
      };
    }

    return {
      ...data,
      transport: 'REMOTE_RELAY',
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      success: false,
      state: 'ERROR',
      transport: 'REMOTE_RELAY',
      error: {
        code: err.name === 'AbortError' ? 'RELAY_EXECUTION_TIMEOUT' : 'RELAY_FETCH_EXCEPTION',
        message: err.message || 'Network exception communicating with remote relay.',
      },
    };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawAction = searchParams.get('action') || 'PING';
  const symbol = searchParams.get('symbol') || undefined;

  const isProd = isProductionExecutionTransport();

  // Query status according to environment transport
  let status: any = null;
  let isV1Online = false;
  let v2Telemetry: any = null;
  let isV2Connected = false;

  if (isProd) {
    status = await fetchRemoteRelayTelemetry();
    isV1Online = Boolean(status && status.localBridge === 'ONLINE');
  } else {
    status = await mt5HttpClient.getStatus();
    isV1Online = Boolean(status && (status.localBridge === 'ONLINE' || status.success));
    if (!isV1Online) {
      v2Telemetry = await executionBridgeV2Client.getUnifiedTelemetry();
      isV2Connected = Boolean(v2Telemetry && v2Telemetry.mt5Connected);
    }
  }

  // Dedicated status query for detailed telemetry & heartbeat age
  if (rawAction.toUpperCase() === 'STATUS' || rawAction.toUpperCase() === 'TELEMETRY') {
    if (isProd) {
      if (status) {
        if (Array.isArray(status.symbols) && status.symbols.length > 0) {
          symbolDirectory.discoverFromBrokerSymbols(status.symbols);
        }
        return NextResponse.json({
          ...status,
          resolvedMap: symbolDirectory.getResolvedMap(),
        });
      }
      return NextResponse.json({
        success: false,
        state: 'MT5_OFFLINE',
        localBridge: 'OFFLINE',
        mt5Connected: false,
        transport: 'REMOTE_RELAY',
        error: { code: 'RELAY_OFFLINE', message: 'Remote MT5 relay is unreachable.' },
        resolvedMap: symbolDirectory.getResolvedMap(),
      });
    }

    const enriched = await enrichTelemetryWithLocalMarketData(status);
    const effectiveStatus = enriched || status;
    const isLocalOnline = Boolean(effectiveStatus && effectiveStatus.localDatabase === 'ONLINE');

    // 1. Prioritize Canonical HTTP Bridge V1 (:5556) or Local SQLite Telemetry
    if ((isV1Online || isLocalOnline) && effectiveStatus) {
      if (Array.isArray(effectiveStatus.symbols) && effectiveStatus.symbols.length > 0) {
        symbolDirectory.discoverFromBrokerSymbols(effectiveStatus.symbols);
      }
      return NextResponse.json({
        ...effectiveStatus,
        resolvedMap: symbolDirectory.getResolvedMap()
      });
    }

    // 2. Dormant V2 (:5560) fallback only if V1 is not running
    if (isV2Connected && v2Telemetry) {
      return NextResponse.json({
        ...v2Telemetry,
        resolvedMap: symbolDirectory.getResolvedMap(),
      });
    }

    return NextResponse.json({
      ...effectiveStatus,
      resolvedMap: symbolDirectory.getResolvedMap()
    });
  }

  const action = rawAction.toUpperCase() as BridgeCommand;

  try {
    switch (action) {
      case 'PING': {
        if (isProd) {
          const probeRes = await dispatchRemoteRelayProbe();
          return NextResponse.json(probeRes);
        }
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
        try {
          const { getLocalMarketDataProvider } = await import('@/lib/providers/local-market-data-provider');
          const localProvider = getLocalMarketDataProvider();
          const localSymbols = await localProvider.getAvailableSymbols();
          if (localSymbols && localSymbols.length > 0) {
            symbolDirectory.discoverFromBrokerSymbols(localSymbols);
            return NextResponse.json({
              success: true,
              data: { symbols: localSymbols },
              resolvedMap: symbolDirectory.getResolvedMap(),
              storage: 'LOCAL_SQLITE',
              timestamp: Date.now(),
            });
          }
        } catch {}
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
        try {
          const { getLocalMarketDataProvider } = await import('@/lib/providers/local-market-data-provider');
          const localProvider = getLocalMarketDataProvider();
          const localQuote = await localProvider.getLatestQuote(symbol);
          if (localQuote) {
            return NextResponse.json({
              success: true,
              data: localQuote,
              storage: 'LOCAL_SQLITE',
              timestamp: Date.now(),
            });
          }
        } catch {}
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

      // 1. Mandatory Human Approval check
      const humanApproved = Boolean(params && (params.humanApproved === true || params.humanConfirmed === true));
      if (!humanApproved) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            error: EXECUTION_GATE_ERRORS.HUMAN_APPROVAL_REQUIRED,
          },
          { status: 403 }
        );
      }

      let bridgeStatus: any = null;
      if (isProductionExecutionTransport()) {
        bridgeStatus = await fetchRemoteRelayTelemetry();
        if (!bridgeStatus || (!bridgeStatus.mt5Connected && bridgeStatus.localBridge !== 'ONLINE')) {
          return NextResponse.json(
            {
              success: false,
              state: 'REJECTED',
              transport: 'REMOTE_RELAY',
              error: EXECUTION_GATE_ERRORS.MT5_NOT_CONNECTED,
            },
            { status: 403 }
          );
        }
      } else {
        try {
          bridgeStatus = await mt5HttpClient.getStatus();
        } catch (err: any) {
          return NextResponse.json(
            {
              success: false,
              state: 'REJECTED',
              error: {
                code: 'MT5_BRIDGE_UNREACHABLE',
                message: `Execution rejected: Failed to query MT5 bridge status (${err.message || 'connection error'}).`
              }
            },
            { status: 503 }
          );
        }

        if (!bridgeStatus || (!bridgeStatus.mt5Connected && bridgeStatus.localBridge !== 'ONLINE')) {
          return NextResponse.json(
            {
              success: false,
              state: 'REJECTED',
              error: EXECUTION_GATE_ERRORS.MT5_NOT_CONNECTED,
            },
            { status: 403 }
          );
        }
      }

      // 2. Client Device License Gate (Single-Device Enforcement with MASTER bypass)
      const sessionCookie =
        req.cookies.get('fef_member_session')?.value ||
        req.cookies.get('fef_session')?.value ||
        req.headers.get('x-session-token') ||
        req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      const authSession = sessionCookie ? verifySessionToken(sessionCookie) : { valid: false };
      const isMasterSession = Boolean(authSession.valid && authSession.role === 'MASTER');
      const isMemberSession = Boolean(authSession.valid && (authSession.role === 'MEMBER' || authSession.role === 'MASTER'));

      // 3. Authoritative Account Trade Mode Gate (DEMO / REAL ONLY)
      const reportedTradeMode = bridgeStatus.account?.tradeMode ?? params?.tradeMode ?? null;
      const realConfirmed = Boolean(params && (params.realConfirmed === true || params.realTradeAcknowledgement === true));
      const isVerifiedDemoAccount = bridgeStatus?.account?.tradeMode === 'DEMO' && (reportedTradeMode === 'DEMO' || params?.tradeMode === 'DEMO');

      // Require authenticated session for execution (unless connected to verified local DEMO account)
      if (!isMemberSession && !isVerifiedDemoAccount) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            error: {
              code: 'MEMBER_AUTH_REQUIRED',
              message: 'Execution rejected: Authenticated Member or Master session required.',
            },
          },
          { status: 401 }
        );
      }

      const licenseEval = isMasterSession || isVerifiedDemoAccount
        ? { valid: true, status: 'ACTIVE' as const, code: 'MASTER_BYPASS', message: 'Master owner authenticated or local demo verified' }
        : clientLicenseController.evaluateClientLicense();

      if (!licenseEval.valid) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            error: {
              code: licenseEval.code,
              message: licenseEval.message,
            },
          },
          { status: 403 }
        );
      }

      const gateValidation = validateLicensedExecution({
        isLicensed: licenseEval.valid,
        licenseErrorCode: licenseEval.code,
        reportedMode: reportedTradeMode,
        humanApproved,
        realConfirmed,
      });

      if (!gateValidation.allowed) {
        return NextResponse.json(
          {
            success: false,
            state: 'REJECTED',
            tradeMode: gateValidation.mode,
            error: gateValidation.error,
          },
          { status: 403 }
        );
      }

      try {

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

      const orderDirection = String(params?.direction || params?.orderType || 'BUY').toUpperCase() as 'BUY' | 'SELL';
      const quote = bridgeStatus?.quotes ? (bridgeStatus.quotes[targetSym] || bridgeStatus.quotes[params?.brokerSymbol || targetSym]) : null;
      let entryPriceToValidate = Number(params?.price) || (quote ? (orderDirection === 'BUY' ? quote.ask : quote.bid) : 0);

      if (!isEngineeringDemo) {
        let slToValidate = Number(params?.sl ?? params?.stopLoss ?? 0);
        let tp1ToValidate = Number(params?.tp1 ?? params?.tp ?? params?.takeProfit ?? 0);
        let tp2ToValidate = params?.tp2 != null ? Number(params.tp2) : undefined;
        let tp3ToValidate = params?.tp3 != null ? Number(params.tp3) : undefined;

        // Enforce Central Asset-Aware Auto SL Policy if SL is missing or for Gold mandatory 50-pip rule
        if (slToValidate <= 0 || targetSym.toUpperCase() === 'XAUUSD') {
          const autoSl = calculateAutomaticStopLoss({
            symbol: targetSym,
            side: orderDirection,
            executionPrice: entryPriceToValidate,
            brokerSpec: quote ? {
              digits: quote.digits,
              point: quote.point,
              stopsLevel: quote.stopsLevel,
              freezeLevel: quote.freezeLevel,
            } : null,
          });
          slToValidate = autoSl.stopLossPrice;
          if (params) params.sl = slToValidate;
        }

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

      if (isProductionExecutionTransport()) {
        const remoteRes = await dispatchRemoteRelayOrder(
          params,
          targetSym,
          orderDirection,
          entryPriceToValidate
        );
        return NextResponse.json(remoteRes);
      }

      const res = await dispatchCommand('PLACE_ORDER', params, symbol);
      return NextResponse.json(res);
    }

    if (command === 'PING') {
      if (isProductionExecutionTransport()) {
        const probeRes = await dispatchRemoteRelayProbe(params?.requestId || body.requestId);
        return NextResponse.json(probeRes);
      }
      const res = await dispatchCommand('PING', params, symbol);
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
