/**
 * FEF CORTEX — CANONICAL VERIFIED DATA ENVELOPE CONTRACT
 * Sprint 2C Verified Real-Data Intelligence Foundation
 *
 * Wraps all external, government, exchange, and derived data feeds with strict
 * provenance, freshness, and verification guarantees.
 */

export type EnvelopeSourceType =
  | 'OFFICIAL_GOVERNMENT'
  | 'REGULATED_EXCHANGE'
  | 'CENTRAL_BANK'
  | 'CLOSED_CANDLE_STREAM'
  | 'DERIVED_ANALYTICS';

export type EnvelopeVerificationLevel =
  | 'UNVERIFIED'
  | 'STALE'
  | 'VERIFIED_REAL'
  | 'FAILED_CLOSED';

export interface VerifiedEvidenceEnvelope<T> {
  provider: string; // e.g., 'FRED', 'CFTC_COT', 'CENTRAL_BANKS', 'DERIVED_CANDLES'
  sourceType: EnvelopeSourceType;
  observedAt: string; // ISO-8601
  receivedAt: string; // ISO-8601
  freshnessSec: number;
  maxStalenessSec: number;
  isStale: boolean;
  isVerified: boolean;
  verificationLevel: EnvelopeVerificationLevel;
  payload: T | null;
  error?: string;
}

export interface CreateEnvelopeOptions<T> {
  provider: string;
  sourceType: EnvelopeSourceType;
  observedAt: string;
  maxStalenessSec: number;
  payload: T;
  receivedAt?: string;
}

/**
 * Creates a verified envelope. Validates freshness against maxStalenessSec.
 * If stale, automatically marks isStale=true, isVerified=false, verificationLevel='STALE'.
 */
export function createVerifiedEnvelope<T>(opts: CreateEnvelopeOptions<T>): VerifiedEvidenceEnvelope<T> {
  const receivedAt = opts.receivedAt || new Date().toISOString();
  const observedTime = new Date(opts.observedAt).getTime();
  const now = Date.now();

  const freshnessSec = isNaN(observedTime)
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Math.floor((now - observedTime) / 1000));

  const isStale = freshnessSec > opts.maxStalenessSec;
  const isVerified = !isStale && !isNaN(observedTime);

  return {
    provider: opts.provider,
    sourceType: opts.sourceType,
    observedAt: opts.observedAt,
    receivedAt,
    freshnessSec,
    maxStalenessSec: opts.maxStalenessSec,
    isStale,
    isVerified,
    verificationLevel: isStale ? 'STALE' : isVerified ? 'VERIFIED_REAL' : 'UNVERIFIED',
    payload: isVerified ? opts.payload : null,
    error: isStale ? `Data exceeds max staleness threshold of ${opts.maxStalenessSec}s (${freshnessSec}s old)` : undefined,
  };
}

/**
 * Creates a failed-closed envelope representing missing, failed, or unauthorized feed.
 */
export function createFailedClosedEnvelope<T>(
  provider: string,
  sourceType: EnvelopeSourceType,
  error: string,
  maxStalenessSec: number = 3600
): VerifiedEvidenceEnvelope<T> {
  const now = new Date().toISOString();
  return {
    provider,
    sourceType,
    observedAt: now,
    receivedAt: now,
    freshnessSec: 0,
    maxStalenessSec,
    isStale: false,
    isVerified: false,
    verificationLevel: 'FAILED_CLOSED',
    payload: null,
    error,
  };
}

/**
 * Validates whether an envelope contains actionable verified evidence.
 * Returns true strictly if isVerified === true, isStale === false, and payload !== null.
 */
export function isEnvelopeActionable<T>(
  envelope?: VerifiedEvidenceEnvelope<T> | null
): envelope is VerifiedEvidenceEnvelope<T> & { payload: T } {
  if (!envelope) return false;
  return (
    envelope.isVerified === true &&
    envelope.isStale === false &&
    envelope.verificationLevel === 'VERIFIED_REAL' &&
    envelope.payload !== null
  );
}
