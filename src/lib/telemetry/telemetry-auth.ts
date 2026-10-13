/**
 * FEF TRADING SOLUTIONS — TELEMETRY HMAC AUTHENTICATION
 *
 * Cryptographically binds HTTP Method, Path, Timestamp, Nonce, and SHA256(RawBody).
 * Enforces timing-safe comparison and strict timestamp tolerance.
 */

import crypto from 'crypto';

export interface TelemetryAuthHeaders {
  deviceId: string;
  timestamp: string;
  nonce: string;
  signature: string;
  version: string;
}

export const TELEMETRY_SIGNATURE_VERSION = 'v1';
export const TIMESTAMP_TOLERANCE_MS = 15000; // ±15 seconds tolerance for clock skew

export function extractAuthHeaders(getHeader: (name: string) => string | null | undefined): TelemetryAuthHeaders | null {
  const deviceId = getHeader('x-fef-device-id') || getHeader('X-FEF-Device-Id');
  const timestamp = getHeader('x-fef-timestamp') || getHeader('X-FEF-Timestamp');
  const nonce = getHeader('x-fef-nonce') || getHeader('X-FEF-Nonce');
  const signature = getHeader('x-fef-signature') || getHeader('X-FEF-Signature');
  const version = getHeader('x-fef-signature-version') || getHeader('X-FEF-Signature-Version') || TELEMETRY_SIGNATURE_VERSION;

  if (!deviceId || !timestamp || !nonce || !signature) {
    return null;
  }

  return {
    deviceId: deviceId.trim(),
    timestamp: timestamp.trim(),
    nonce: nonce.trim(),
    signature: signature.trim(),
    version: version.trim(),
  };
}

export function buildCanonicalSigningString(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  rawBody: string | Buffer
): string {
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  return [
    method.toUpperCase(),
    path,
    timestamp,
    nonce,
    bodyHash,
  ].join('\n');
}

export function signTelemetryRequest(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  rawBody: string | Buffer
): string {
  const canonical = buildCanonicalSigningString(method, path, timestamp, nonce, rawBody);
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

export interface VerificationResult {
  valid: boolean;
  status: number;
  error?: string;
}

export function verifyTelemetrySignature(
  secret: string,
  headers: TelemetryAuthHeaders,
  method: string,
  path: string,
  rawBody: string | Buffer,
  nowMs: number = Date.now()
): VerificationResult {
  if (headers.version !== TELEMETRY_SIGNATURE_VERSION) {
    return { valid: false, status: 401, error: 'Unsupported signature version' };
  }

  // Validate timestamp numeric format
  const reqTime = parseInt(headers.timestamp, 10);
  if (!Number.isFinite(reqTime) || reqTime <= 0) {
    return { valid: false, status: 400, error: 'Malformed timestamp' };
  }

  // Timestamp freshness check (± tolerance)
  const diff = Math.abs(nowMs - reqTime);
  if (diff > TIMESTAMP_TOLERANCE_MS) {
    return {
      valid: false,
      status: 401,
      error: `Timestamp out of tolerance (diff: ${diff}ms, max: ${TIMESTAMP_TOLERANCE_MS}ms)`,
    };
  }

  // Calculate expected signature
  const expectedSig = signTelemetryRequest(
    secret,
    method,
    path,
    headers.timestamp,
    headers.nonce,
    rawBody
  );

  // Timing-safe constant-time comparison
  const sigBuffer = Buffer.from(headers.signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSig, 'hex');

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false, status: 401, error: 'Invalid HMAC signature' };
  }

  return { valid: true, status: 200 };
}
