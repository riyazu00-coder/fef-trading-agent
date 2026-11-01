/**
 * FEF TRADING SOLUTIONS — PRODUCTION CLOUD TELEMETRY INGRESS
 *
 * POST /api/telemetry/ingress
 *
 * Receives signed, read-only MT5 telemetry from the Mac connector agent.
 * Verifies HMAC signature, timestamp window, and persistent nonce replay protection.
 * Writes sanitized telemetry snapshots directly to Upstash Redis.
 *
 * PHYSICALLY INCAPABLE OF ISSUING OR ACCEPTING TRADING COMMANDS.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  extractAuthHeaders,
  verifyTelemetrySignature,
} from '@/lib/telemetry/telemetry-auth';
import {
  MAX_TELEMETRY_BODY_BYTES,
} from '@/lib/telemetry/telemetry-contract';
import { validateTelemetryEnvelope } from '@/lib/telemetry/telemetry-validator';
import { telemetryRepository } from '@/lib/telemetry/telemetry-repository';

export const dynamic = 'force-dynamic';

// Simple sliding-window rate limiter per deviceId
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX_PER_MINUTE = 60;

function checkRateLimit(deviceId: string, now: number = Date.now()): boolean {
  let timestamps = rateLimitMap.get(deviceId);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(deviceId, timestamps);
  }
  const windowStart = now - 60000;
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT_MAX_PER_MINUTE) {
    return false; // Rate limit exceeded
  }
  timestamps.push(now);
  return true;
}

export async function POST(req: NextRequest) {
  // 1. Enforce secret presence (Fail closed if server environment is unconfigured)
  const secret = (process.env.FEF_TELEMETRY_DEVICE_SECRET || '').trim();
  if (!secret) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_UNCONFIGURED', message: 'Telemetry device secret unconfigured' } },
      { status: 503 }
    );
  }

  // 2. Validate Content-Length to prevent oversized payloads
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_TELEMETRY_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeds maximum limit' } },
      { status: 413 }
    );
  }

  // 3. Read raw body text for exact hash calculation
  let rawBody = '';
  try {
    rawBody = await req.text();
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'READ_BODY_FAILED', message: 'Failed to read request body' } },
      { status: 400 }
    );
  }

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_TELEMETRY_BODY_BYTES) {
    return NextResponse.json(
      { success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeds maximum limit' } },
      { status: 413 }
    );
  }

  // 4. Extract and validate authentication headers
  const authHeaders = extractAuthHeaders((name) => req.headers.get(name));
  if (!authHeaders) {
    return NextResponse.json(
      { success: false, error: { code: 'MISSING_AUTH_HEADERS', message: 'Required telemetry auth headers missing' } },
      { status: 401 }
    );
  }

  // 4b. Enforce per-device rate limiting
  if (!checkRateLimit(authHeaders.deviceId)) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many telemetry requests. Limit: 60/min' } },
      { status: 429 }
    );
  }

  // 5. Verify HMAC signature & timestamp freshness
  const path = req.nextUrl.pathname;
  const authResult = verifyTelemetrySignature(secret, authHeaders, 'POST', path, rawBody);
  if (!authResult.valid) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_FAILED', message: authResult.error } },
      { status: authResult.status }
    );
  }

  // 6. Atomically consume nonce in persistent storage (Replay Protection)
  try {
    const isFreshNonce = await telemetryRepository.consumeNonce(authHeaders.deviceId, authHeaders.nonce);
    if (!isFreshNonce) {
      return NextResponse.json(
        { success: false, error: { code: 'REPLAY_DETECTED', message: 'Request nonce has already been consumed' } },
        { status: 409 }
      );
    }
  } catch (err: any) {
    console.error('[INGRESS] consumeNonce failed:', err?.message || err);
    return NextResponse.json(
      { success: false, error: { code: 'STORAGE_UNAVAILABLE', message: `Persistent telemetry store unavailable: ${err?.message || err}` } },
      { status: 503 }
    );
  }

  // 7. Parse and validate JSON envelope schema
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_JSON', message: 'Malformed JSON payload' } },
      { status: 400 }
    );
  }

  const validation = validateTelemetryEnvelope(parsedJson);
  if (!validation.valid || !validation.envelope) {
    return NextResponse.json(
      { success: false, error: { code: 'SCHEMA_VALIDATION_FAILED', message: validation.error } },
      { status: 422 }
    );
  }

  const env = validation.envelope;

  // 8. Device ID match verification
  if (env.deviceId !== authHeaders.deviceId) {
    return NextResponse.json(
      { success: false, error: { code: 'DEVICE_MISMATCH', message: 'Header deviceId does not match envelope' } },
      { status: 401 }
    );
  }

  // 9. Persist into canonical persistent store
  try {
    switch (env.type) {
      case 'HEARTBEAT':
        await telemetryRepository.saveHeartbeat(env.deviceId, env.capturedAt, env.sequence, env.payload);
        break;
      case 'ACCOUNT_STATUS':
        await telemetryRepository.saveAccountStatus(env.deviceId, env.capturedAt, env.sequence, env.payload);
        break;
      case 'QUOTE_SNAPSHOT':
        await telemetryRepository.saveQuoteSnapshot(env.deviceId, env.capturedAt, env.sequence, env.payload.quotes);
        break;
      case 'CANDLE_SNAPSHOT':
        await telemetryRepository.saveCandleSnapshot(env.deviceId, env.capturedAt, env.sequence, env.payload);
        break;
      case 'INTELLIGENCE_SNAPSHOT':
        await telemetryRepository.saveIntelligenceSnapshot(env.deviceId, env.capturedAt, env.sequence, env.payload);
        break;
    }
  } catch (err: any) {
    console.error('[INGRESS] save failed:', err?.message || err);
    return NextResponse.json(
      { success: false, error: { code: 'PERSISTENCE_FAILED', message: `Failed to write telemetry to storage: ${err?.message || err}` } },
      { status: 503 }
    );
  }

  return NextResponse.json({
    success: true,
    acceptedAt: new Date().toISOString(),
    type: env.type,
    sequence: env.sequence,
  });
}
