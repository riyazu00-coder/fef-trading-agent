/**
 * FEF TRADING SOLUTIONS — CANDLESTICK VALIDATOR
 * Phase 2D & V1.1 Verified OHLC Pipeline
 *
 * Strict mathematical and chronological validation of historical candlestick data.
 * Zero tolerance for malformed candles, negative prices, inverted highs/lows,
 * non-monotonic timestamps, or future-dated records.
 */

export interface RawCandleInput {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  tickVolume?: number;
}

export interface CandleValidationResult {
  valid: boolean;
  count: number;
  reason?: string;
  firstTimestamp?: number;
  lastTimestamp?: number;
  timeframe?: string;
}

/**
 * Expected timeframe intervals in milliseconds
 */
export const TIMEFRAME_INTERVAL_MS: Record<string, number> = {
  M1: 60 * 1000,
  M5: 5 * 60 * 1000,
  M15: 15 * 60 * 1000,
  M30: 30 * 60 * 1000,
  H1: 60 * 60 * 1000,
  H4: 4 * 60 * 60 * 1000,
  D1: 24 * 60 * 60 * 1000,
  W1: 7 * 24 * 60 * 60 * 1000,
};

/**
 * Validate an array of OHLC candles with strict integrity rules.
 */
export function validateCandleSeries(
  candles: RawCandleInput[],
  timeframe: string = 'H1',
  maxAllowedFutureSkewMs: number = 60_000
): CandleValidationResult {
  if (!Array.isArray(candles) || candles.length === 0) {
    return { valid: false, count: 0, reason: 'Candle payload is empty or not an array' };
  }

  const now = Date.now();
  const tf = timeframe.toUpperCase();

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // 1. Timestamp validity
    if (typeof c.timestamp !== 'number' || isNaN(c.timestamp) || c.timestamp <= 0) {
      return { valid: false, count: candles.length, reason: `Candle index ${i} has invalid timestamp: ${c.timestamp}` };
    }

    // 2. Prevent future-dated candles
    if (c.timestamp > now + maxAllowedFutureSkewMs) {
      return {
        valid: false,
        count: candles.length,
        reason: `Candle index ${i} has future timestamp (${c.timestamp} > now ${now})`
      };
    }

    // 3. Numeric type assertions
    if (
      typeof c.open !== 'number' || isNaN(c.open) ||
      typeof c.high !== 'number' || isNaN(c.high) ||
      typeof c.low !== 'number' || isNaN(c.low) ||
      typeof c.close !== 'number' || isNaN(c.close)
    ) {
      return { valid: false, count: candles.length, reason: `Candle index ${i} contains NaN or non-numeric OHLC values` };
    }

    // 4. Positive price assertions
    if (c.open <= 0 || c.high <= 0 || c.low <= 0 || c.close <= 0) {
      return { valid: false, count: candles.length, reason: `Candle index ${i} has non-positive OHLC price values` };
    }

    // 5. High / Low boundary bounds
    if (c.high < c.low) {
      return { valid: false, count: candles.length, reason: `Candle index ${i} high < low (${c.high} < ${c.low})` };
    }
    if (c.high < c.open || c.high < c.close) {
      return { valid: false, count: candles.length, reason: `Candle index ${i} high is below open or close (H=${c.high}, O=${c.open}, C=${c.close})` };
    }
    if (c.low > c.open || c.low > c.close) {
      return { valid: false, count: candles.length, reason: `Candle index ${i} low is above open or close (L=${c.low}, O=${c.open}, C=${c.close})` };
    }

    // 6. Strictly ascending chronological ordering (no duplicates or reversals)
    if (i > 0) {
      const prev = candles[i - 1];
      if (c.timestamp <= prev.timestamp) {
        return {
          valid: false,
          count: candles.length,
          reason: `Candles not in strictly ascending chronological order at index ${i}: prev=${prev.timestamp}, curr=${c.timestamp}`
        };
      }
    }
  }

  return {
    valid: true,
    count: candles.length,
    firstTimestamp: candles[0].timestamp,
    lastTimestamp: candles[candles.length - 1].timestamp,
    timeframe: tf,
  };
}
