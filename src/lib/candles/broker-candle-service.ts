/**
 * FEF CORTEX — BROKER CANDLE SNAPSHOT & NORMALIZATION SERVICE
 * Sprint 2C.1 Real Provider Activation + Broker Market Data Wiring
 *
 * Rules:
 * 1. Read-only: Zero order transport or execution capabilities.
 * 2. Closed-candle enforcement: Always strips the latest forming/unfinished candle (rates[0]).
 * 3. Strict OHLC validation: Rejects non-numeric, zero, negative, or malformed prices.
 * 4. Canonical alias mapping: US100 -> USTEC, NATGAS -> XNGUSD.
 * 5. Bounded concurrency & fail-closed on disconnected bridge.
 */

import { mt5HttpClient } from '../bridge/mt5-http-client';
import {
  createFailedClosedEnvelope,
  createVerifiedEnvelope,
  VerifiedEvidenceEnvelope,
} from '../providers/canonical-envelope';

export interface NormalizedClosedCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume: number;
}

export interface VerifiedBrokerCandleSnapshot {
  sourceIdentity: string;
  broker: string;
  server: string;
  canonicalSymbol: string;
  brokerSymbol: string;
  timeframe: string;
  latestClosedCandleTimestamp: number;
  retrievedAt: number;
  barCount: number;
  candles: NormalizedClosedCandle[];
  freshness: 'FRESH' | 'AGING' | 'STALE' | 'UNAVAILABLE';
  isVerified: boolean;
  failureReason?: string;
}

export const CANONICAL_ALIAS_MAP: Record<string, string> = {
  US100: 'USTEC',
  NATGAS: 'XNGUSD',
  GOLD: 'XAUUSD',
  SILVER: 'XAGUSD',
  WTI: 'USOIL',
  BRENT: 'UKOIL',
  DE40: 'GER40',
  DAX: 'GER40',
  FTSE: 'UK100',
  NIKKEI: 'JP225',
};

export const REVERSE_ALIAS_MAP: Record<string, string> = {
  USTEC: 'US100',
  XNGUSD: 'NATGAS',
};

/**
 * Resolve canonical symbol to primary broker candidate symbol
 */
export function resolveBrokerSymbolCandidate(canonical: string): string {
  const norm = canonical.trim().toUpperCase();
  return CANONICAL_ALIAS_MAP[norm] || norm;
}

/**
 * Validate raw OHLC candle integrity
 */
export function validateCandleIntegrity(c: any, index: number): { valid: boolean; reason?: string } {
  if (!c || typeof c !== 'object') {
    return { valid: false, reason: `Candle at index ${index} is not an object` };
  }

  const { timestamp, open, high, low, close } = c;

  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return { valid: false, reason: `Candle at index ${index} has invalid timestamp: ${timestamp}` };
  }

  if (
    typeof open !== 'number' || !Number.isFinite(open) || isNaN(open) || open <= 0 ||
    typeof high !== 'number' || !Number.isFinite(high) || isNaN(high) || high <= 0 ||
    typeof low !== 'number' || !Number.isFinite(low) || isNaN(low) || low <= 0 ||
    typeof close !== 'number' || !Number.isFinite(close) || isNaN(close) || close <= 0
  ) {
    return { valid: false, reason: `Candle at index ${index} has non-positive or non-finite OHLC prices` };
  }

  if (high < low) {
    return { valid: false, reason: `Candle at index ${index} has high < low (${high} < ${low})` };
  }

  if (high < open || high < close) {
    return { valid: false, reason: `Candle at index ${index} has high below open or close` };
  }

  if (low > open || low > close) {
    return { valid: false, reason: `Candle at index ${index} has low above open or close` };
  }

  return { valid: true };
}

/**
 * Filter and extract strictly CLOSED candles, stripping the active unfinished bar.
 * In MT5 chronological rate transmission, the last item in the array is the currently
 * active, incomplete candle (rates[0]).
 */
export function extractClosedCandles(rawCandles: any[]): {
  valid: boolean;
  closedCandles: NormalizedClosedCandle[];
  failureReason?: string;
} {
  if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
    return { valid: false, closedCandles: [], failureReason: 'Empty candle array' };
  }

  // Need at least 2 bars to discard the active bar and have at least 1 closed bar
  if (rawCandles.length < 2) {
    return { valid: false, closedCandles: [], failureReason: 'Insufficient bars (minimum 2 raw bars required to isolate closed bar)' };
  }

  // Validate all candles
  for (let i = 0; i < rawCandles.length; i++) {
    const check = validateCandleIntegrity(rawCandles[i], i);
    if (!check.valid) {
      return { valid: false, closedCandles: [], failureReason: check.reason };
    }
  }

  // Strip the last forming bar to guarantee closed-candle integrity
  const closedRaw = rawCandles.slice(0, rawCandles.length - 1);

  // Normalize structure
  const closedCandles: NormalizedClosedCandle[] = closedRaw.map((c) => ({
    timestamp: c.timestamp < 1e11 ? c.timestamp * 1000 : c.timestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    tickVolume: typeof c.tickVolume === 'number' && Number.isFinite(c.tickVolume) ? c.tickVolume : 0,
  }));

  // Verify timestamps are strictly ascending
  for (let i = 1; i < closedCandles.length; i++) {
    if (closedCandles[i].timestamp <= closedCandles[i - 1].timestamp) {
      return {
        valid: false,
        closedCandles: [],
        failureReason: `Non-ascending timestamps at index ${i}: ${closedCandles[i].timestamp} <= ${closedCandles[i - 1].timestamp}`,
      };
    }
  }

  return { valid: true, closedCandles };
}

/**
 * Determine maximum staleness threshold by timeframe (in seconds)
 */
export function getMaxStalenessForTimeframe(timeframe: string): number {
  const tf = timeframe.toUpperCase();
  switch (tf) {
    case 'M1': return 300;     // 5m
    case 'M5': return 900;     // 15m
    case 'M15': return 1800;   // 30m
    case 'M30': return 3600;   // 1h
    case 'H1': return 14400;   // 4h (allows weekend / inter-session rollover)
    case 'H4': return 28800;   // 8h
    case 'D1': return 172800;  // 48h
    default: return 7200;
  }
}

/**
 * Fetch and wrap verified closed candles for a single symbol from MT5 bridge
 */
export async function fetchVerifiedBrokerCandleSnapshot(
  canonicalSymbol: string,
  timeframe: string = 'H1'
): Promise<VerifiedEvidenceEnvelope<VerifiedBrokerCandleSnapshot>> {
  const normSymbol = canonicalSymbol.trim().toUpperCase();
  const brokerSym = resolveBrokerSymbolCandidate(normSymbol);
  const tf = timeframe.toUpperCase();
  const maxStalenessSec = getMaxStalenessForTimeframe(tf);

  try {
    // 1. Query bridge via canonical symbol or broker symbol
    let res = await mt5HttpClient.getCandles(normSymbol, tf);
    if (!res.success && brokerSym !== normSymbol) {
      res = await mt5HttpClient.getCandles(brokerSym, tf);
    }

    if (!res.success || !Array.isArray(res.candles) || res.candles.length === 0) {
      return createFailedClosedEnvelope<VerifiedBrokerCandleSnapshot>(
        'MT5_BROKER_BRIDGE',
        'CLOSED_CANDLE_STREAM',
        res.error?.message || `No candles available for ${normSymbol} (${tf})`,
        maxStalenessSec
      );
    }

    // 2. Validate and isolate closed candles (strips unfinished forming candle)
    const extraction = extractClosedCandles(res.candles);
    if (!extraction.valid || extraction.closedCandles.length === 0) {
      return createFailedClosedEnvelope<VerifiedBrokerCandleSnapshot>(
        'MT5_BROKER_BRIDGE',
        'CLOSED_CANDLE_STREAM',
        extraction.failureReason || `Malformed OHLC data for ${normSymbol}`,
        maxStalenessSec
      );
    }

    // 3. Minimum closed bars verification (need at least 15 closed bars for statistical validity)
    if (extraction.closedCandles.length < 15) {
      return createFailedClosedEnvelope<VerifiedBrokerCandleSnapshot>(
        'MT5_BROKER_BRIDGE',
        'CLOSED_CANDLE_STREAM',
        `Insufficient closed candle history (${extraction.closedCandles.length} bars, minimum 15 required for statistical intelligence)`,
        maxStalenessSec
      );
    }

    const latestClosed = extraction.closedCandles[extraction.closedCandles.length - 1];
    const latestClosedTs = latestClosed.timestamp;
    const now = Date.now();
    const ageSec = Math.max(0, Math.floor((now - latestClosedTs) / 1000));
    const isStale = ageSec > maxStalenessSec;

    const snapshot: VerifiedBrokerCandleSnapshot = {
      sourceIdentity: 'AUTHENTICATED_LOCAL_MT5_BRIDGE',
      broker: 'Exness Technologies Ltd',
      server: 'Exness-MT5Trial16',
      canonicalSymbol: normSymbol,
      brokerSymbol: brokerSym,
      timeframe: tf,
      latestClosedCandleTimestamp: latestClosedTs,
      retrievedAt: now,
      barCount: extraction.closedCandles.length,
      candles: extraction.closedCandles,
      freshness: isStale ? 'STALE' : ageSec < maxStalenessSec / 2 ? 'FRESH' : 'AGING',
      isVerified: !isStale,
    };

    if (isStale) {
      return {
        provider: 'MT5_BROKER_BRIDGE',
        sourceType: 'CLOSED_CANDLE_STREAM',
        observedAt: new Date(latestClosedTs).toISOString(),
        receivedAt: new Date(now).toISOString(),
        freshnessSec: ageSec,
        maxStalenessSec,
        isStale: true,
        isVerified: false,
        verificationLevel: 'STALE',
        payload: snapshot,
        error: `Candle series is stale (${Math.floor(ageSec / 60)} minutes old, max threshold ${Math.floor(maxStalenessSec / 60)} minutes)`,
      };
    }

    return createVerifiedEnvelope<VerifiedBrokerCandleSnapshot>({
      provider: 'MT5_BROKER_BRIDGE',
      sourceType: 'CLOSED_CANDLE_STREAM',
      observedAt: new Date(latestClosedTs).toISOString(),
      maxStalenessSec,
      payload: snapshot,
    });
  } catch (err: any) {
    return createFailedClosedEnvelope<VerifiedBrokerCandleSnapshot>(
      'MT5_BROKER_BRIDGE',
      'CLOSED_CANDLE_STREAM',
      err?.message || `Bridge communication exception for ${normSymbol}`,
      maxStalenessSec
    );
  }
}

/**
 * Batch fetch verified candle snapshots across multiple symbols with bounded concurrency
 */
export async function fetchBatchBrokerCandles(
  symbols: string[],
  timeframe: string = 'H1',
  concurrency: number = 5
): Promise<Record<string, VerifiedEvidenceEnvelope<VerifiedBrokerCandleSnapshot>>> {
  const results: Record<string, VerifiedEvidenceEnvelope<VerifiedBrokerCandleSnapshot>> = {};
  const queue = [...symbols];

  // Execute in bounded batches
  while (queue.length > 0) {
    const chunk = queue.splice(0, concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map((sym) => fetchVerifiedBrokerCandleSnapshot(sym, timeframe))
    );

    chunk.forEach((sym, idx) => {
      const outcome = chunkResults[idx];
      if (outcome.status === 'fulfilled') {
        results[sym] = outcome.value;
      } else {
        results[sym] = createFailedClosedEnvelope<VerifiedBrokerCandleSnapshot>(
          'MT5_BROKER_BRIDGE',
          'CLOSED_CANDLE_STREAM',
          outcome.reason?.message || 'Batch fetch execution error',
          getMaxStalenessForTimeframe(timeframe)
        );
      }
    });
  }

  return results;
}
