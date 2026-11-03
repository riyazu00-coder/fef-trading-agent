/**
 * FEF CORTEX — CANONICAL TIMESTAMP & DATA FRESHNESS CONTRACT
 * Phase 17 Critical Backend Repair
 *
 * Enforces strict mathematical evaluation of quote and candle timestamps:
 * 1. Never parses display labels ('FRESH', 'Live', '15s ago') as epoch milliseconds.
 * 2. Never silently converts invalid, missing, or null timestamps to zero.
 * 3. Never classifies missing timestamps as fresh.
 * 4. Validates timestamps as finite positive epoch milliseconds.
 * 5. Accurately calculates quote age: nowMs - quoteTimestampMs.
 * 6. Explicitly distinguishes missing data ('UNAVAILABLE') from stale data ('STALE')
 *    and malformed future/corrupted data ('INVALID_TIMESTAMP').
 */

export type DataFreshnessState = 'FRESH' | 'STALE' | 'UNAVAILABLE' | 'INVALID_TIMESTAMP';
export type DataAvailabilityState = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';

export interface CanonicalTimestampContract {
  quoteTimestampMs?: number;
  candleTimestampMs?: number;
  lastReceivedAtMs?: number;
  lastValidatedAtMs?: number;
  dataAgeMs: number;
  dataFreshness: DataFreshnessState;
  dataAvailability: DataAvailabilityState;
  rawDisplayLabel?: string;
}

export const DEFAULT_QUOTE_FRESHNESS_THRESHOLD_MS = 30_000;
export const MAX_CLOCK_SKEW_FUTURE_TOLERANCE_MS = 60_000;

/**
 * Extracts a trustworthy numeric epoch millisecond timestamp from an unknown input.
 * Rejects display strings, non-date strings, NaN, non-positive numbers, and future dates.
 */
export function parseEpochTimestampMs(input: unknown, nowMs: number = Date.now()): {
  valid: boolean;
  timestampMs?: number;
  error?: 'MISSING' | 'NOT_NUMERIC' | 'DISPLAY_STRING' | 'NON_POSITIVE' | 'FUTURE_SKEW';
} {
  if (input === null || input === undefined || input === '') {
    return { valid: false, error: 'MISSING' };
  }

  // 1. Direct positive finite number
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || isNaN(input)) {
      return { valid: false, error: 'NOT_NUMERIC' };
    }
    if (input <= 0) {
      return { valid: false, error: 'NON_POSITIVE' };
    }
    // Normalize second timestamps (10 digits) to millisecond timestamps (13 digits)
    const ms = input < 1e11 ? input * 1000 : input;
    if (ms > nowMs + MAX_CLOCK_SKEW_FUTURE_TOLERANCE_MS) {
      return { valid: false, error: 'FUTURE_SKEW', timestampMs: ms };
    }
    return { valid: true, timestampMs: ms };
  }

  // 2. Date object
  if (input instanceof Date) {
    const ms = input.getTime();
    if (isNaN(ms) || ms <= 0) {
      return { valid: false, error: 'NON_POSITIVE' };
    }
    if (ms > nowMs + MAX_CLOCK_SKEW_FUTURE_TOLERANCE_MS) {
      return { valid: false, error: 'FUTURE_SKEW', timestampMs: ms };
    }
    return { valid: true, timestampMs: ms };
  }

  // 3. String representation
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      return { valid: false, error: 'MISSING' };
    }

    // Check for display strings that should NEVER be parsed as dates
    const lower = trimmed.toLowerCase();
    if (
      lower === 'fresh' ||
      lower === 'live' ||
      lower === 'stale' ||
      lower === 'unavailable' ||
      lower === 'offline' ||
      lower.includes('ago') ||
      lower.includes('fallback') ||
      lower.includes('reference')
    ) {
      return { valid: false, error: 'DISPLAY_STRING' };
    }

    // Check if string is a numeric string (e.g. '1730620000000')
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = parseFloat(trimmed);
      if (Number.isFinite(num) && num > 0) {
        const ms = num < 1e11 ? num * 1000 : num;
        if (ms > nowMs + MAX_CLOCK_SKEW_FUTURE_TOLERANCE_MS) {
          return { valid: false, error: 'FUTURE_SKEW', timestampMs: ms };
        }
        return { valid: true, timestampMs: ms };
      }
    }

    // Attempt ISO-8601 date parse
    const parsed = new Date(trimmed).getTime();
    if (isNaN(parsed) || parsed <= 0) {
      return { valid: false, error: 'NOT_NUMERIC' };
    }
    if (parsed > nowMs + MAX_CLOCK_SKEW_FUTURE_TOLERANCE_MS) {
      return { valid: false, error: 'FUTURE_SKEW', timestampMs: parsed };
    }
    return { valid: true, timestampMs: parsed };
  }

  return { valid: false, error: 'NOT_NUMERIC' };
}

/**
 * Resolves the Canonical Timestamp Contract for an incoming market quote.
 */
export function resolveCanonicalTimestampContract(params: {
  quoteTimestamp?: unknown;
  lastUpdated?: unknown;
  candleTimestamp?: unknown;
  lastReceivedAt?: unknown;
  nowMs?: number;
  maxFreshAgeMs?: number;
  isBrokerFeed?: boolean;
}): CanonicalTimestampContract {
  const now = params.nowMs ?? Date.now();
  const maxAge = params.maxFreshAgeMs ?? DEFAULT_QUOTE_FRESHNESS_THRESHOLD_MS;

  // 1. Resolve quote timestamp: check explicit quoteTimestamp first, then lastUpdated, then lastReceivedAt
  let quoteParsed = parseEpochTimestampMs(params.quoteTimestamp, now);
  if (!quoteParsed.valid) {
    // Try lastReceivedAt
    const recvParsed = parseEpochTimestampMs(params.lastReceivedAt, now);
    if (recvParsed.valid) {
      quoteParsed = recvParsed;
    } else {
      // Try parsing lastUpdated if it's not a display string
      const luParsed = parseEpochTimestampMs(params.lastUpdated, now);
      if (luParsed.valid) {
        quoteParsed = luParsed;
      }
    }
  }

  // 2. Resolve candle timestamp
  const candleParsed = parseEpochTimestampMs(params.candleTimestamp, now);

  const rawDisplayLabel = typeof params.lastUpdated === 'string' ? params.lastUpdated : undefined;

  // 3. Determine data availability & freshness
  if (!quoteParsed.valid) {
    if (quoteParsed.error === 'FUTURE_SKEW') {
      return {
        quoteTimestampMs: quoteParsed.timestampMs,
        candleTimestampMs: candleParsed.timestampMs,
        lastReceivedAtMs: undefined,
        lastValidatedAtMs: now,
        dataAgeMs: quoteParsed.timestampMs ? Math.max(0, quoteParsed.timestampMs - now) : 0,
        dataFreshness: 'INVALID_TIMESTAMP',
        dataAvailability: 'UNAVAILABLE',
        rawDisplayLabel,
      };
    }

    return {
      quoteTimestampMs: undefined,
      candleTimestampMs: candleParsed.timestampMs,
      lastReceivedAtMs: undefined,
      lastValidatedAtMs: now,
      dataAgeMs: 999_999_999, // Explicit high value, never 0
      dataFreshness: 'UNAVAILABLE',
      dataAvailability: candleParsed.valid ? 'PARTIAL' : 'UNAVAILABLE',
      rawDisplayLabel,
    };
  }

  const quoteMs = quoteParsed.timestampMs!;
  const dataAgeMs = Math.max(0, now - quoteMs);

  let dataFreshness: DataFreshnessState = 'STALE';
  if (dataAgeMs <= maxAge) {
    dataFreshness = 'FRESH';
  }

  return {
    quoteTimestampMs: quoteMs,
    candleTimestampMs: candleParsed.timestampMs,
    lastReceivedAtMs: quoteMs,
    lastValidatedAtMs: now,
    dataAgeMs,
    dataFreshness,
    dataAvailability: 'AVAILABLE',
    rawDisplayLabel,
  };
}

