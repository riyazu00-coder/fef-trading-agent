import { NextRequest, NextResponse } from 'next/server';

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

    if (!res.ok) {
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
        error: { code: `RELAY_HTTP_${res.status}`, message: 'Relay returned error status.' },
      });
    }

    const data = await res.json();

    // Strict sanitization: ensure secrets/tokens are never sent to client
    const { authToken, authTokenHash, keyId, ...sanitized } = data;

    return NextResponse.json({
      ...sanitized,
      isExecutable: false, // Phase 2B is TELEMETRY ONLY
    });
  } catch (err: any) {
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
      error: { code: 'RELAY_UNREACHABLE', message: 'Cannot connect to secure remote relay.' },
    });
  }
}
