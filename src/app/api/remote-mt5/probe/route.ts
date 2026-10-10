import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  signProbePayload,
  validateRemoteProbeCommand,
} from '@/lib/remote/remote-security-validator';
import { RemoteTransportProbe } from '@/lib/remote/remote-types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const relayUrl = process.env.FEF_REMOTE_RELAY_URL || 'http://127.0.0.1:5557';
  const deviceId = process.env.FEF_REMOTE_DEVICE_ID || 'fef-connector-primary-01';
  const deviceSecret = process.env.FEF_REMOTE_DEVICE_SECRET || 'dev-secret-do-not-use-in-prod';

  try {
    const body = await req.json().catch(() => ({}));
    const nonce = typeof body.nonce === 'number' ? body.nonce : Date.now();
    const ttlMs = typeof body.ttlMs === 'number' && body.ttlMs > 0 ? Math.min(body.ttlMs, 30000) : 10000;
    const now = Date.now();
    const expiresAt = now + ttlMs;
    const requestId = body.requestId || `probe-${now}-${crypto.randomBytes(4).toString('hex')}`;

    const probePayload: RemoteTransportProbe = {
      commandType: 'TRANSPORT_PROBE',
      requestId,
      deviceId,
      nonce,
      createdAt: now,
      expiresAt,
    };

    probePayload.signature = signProbePayload(probePayload, deviceSecret);

    const preflight = validateRemoteProbeCommand(probePayload, null, now, deviceSecret);
    if (!preflight.valid) {
      return NextResponse.json(
        {
          success: false,
          error: preflight.error,
        },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const relayRes = await fetch(`${relayUrl}/device/${deviceId}/probe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(probePayload),
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeout);

    const relayJson = await relayRes.json();
    return NextResponse.json(relayJson, { status: relayRes.status });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: err.name === 'AbortError' ? 'RELAY_TIMEOUT' : 'PROBE_DISPATCH_FAILED',
          message: err.message || 'Failed to dispatch transport probe to relay.',
        },
      },
      { status: 500 }
    );
  }
}
