import { NextRequest, NextResponse } from 'next/server';
import { mt5HttpClient } from '@/lib/bridge/mt5-http-client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const relayUrl = process.env.FEF_REMOTE_RELAY_URL || 'http://127.0.0.1:5557';
  const deviceId = process.env.FEF_REMOTE_DEVICE_ID || process.env.FEF_TELEMETRY_DEVICE_ID || 'fef-connector-primary-01';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${relayUrl}/device/${deviceId}/telemetry`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const { authToken, authTokenHash, keyId, ...sanitized } = data;
      const brokerSymbols = Array.isArray(data.symbols) && data.symbols.length > 0
        ? data.symbols
        : Object.keys(data.quotes || {});

      return NextResponse.json({
        ...sanitized,
        symbols: brokerSymbols,
        isExecutable: false,
      });
    }
  } catch (err: any) {
    // Relay failed or timed out — fall back to cloud telemetry store
  }

  // Cloud Telemetry Store fallback
  try {
    const cloudStatus = await mt5HttpClient.getStatus();
    if (cloudStatus && (cloudStatus.localBridge === 'ONLINE' || cloudStatus.mt5Connected || Object.keys(cloudStatus.quotes || {}).length > 0)) {
      const brokerSymbols = Array.isArray(cloudStatus.symbols) && cloudStatus.symbols.length > 0
        ? cloudStatus.symbols
        : Object.keys(cloudStatus.quotes || {});

      return NextResponse.json({
        ...cloudStatus,
        symbols: brokerSymbols,
        isExecutable: false,
        transport: 'OUTBOUND_TELEMETRY_INGRESS',
        priceAuthority: 'MT5_BROKER',
      });
    }
  } catch {}

  return NextResponse.json({
    success: false,
    connected: false,
    priceAuthority: 'REFERENCE',
    broker: 'UNKNOWN',
    server: 'UNKNOWN',
    maskedAccount: '00***00',
    quotes: {},
    symbolSpecs: {},
    positions: [],
    pendingOrders: [],
    isExecutable: false,
    error: { code: 'RELAY_UNREACHABLE', message: 'No active remote telemetry received.' },
  });
}
