/**
 * FEF TRADING SOLUTIONS — TELEMETRY RUNTIME VALIDATION
 *
 * Strict runtime schema and sanity verification for telemetry payloads.
 * Rejects NaN, Infinity, negative spreads, execution instructions, malformed timestamps.
 */

import {
  CanonicalTelemetryEnvelope,
  CANONICAL_TELEMETRY_SYMBOLS,
  CANONICAL_TELEMETRY_TIMEFRAMES,
  MAX_CANDLES_PER_SNAPSHOT,
  MAX_QUOTES_PER_SNAPSHOT,
  TELEMETRY_PROTOCOL_VERSION,
} from './telemetry-contract';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  envelope?: CanonicalTelemetryEnvelope;
}

function isFiniteNumber(val: any): boolean {
  return typeof val === 'number' && Number.isFinite(val);
}

function isValidIsoTimestamp(str: any): boolean {
  if (typeof str !== 'string') return false;
  const time = Date.parse(str);
  return !Number.isNaN(time);
}

export function validateTelemetryEnvelope(data: any): ValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Envelope must be a JSON object' };
  }

  // Check version
  if (data.version !== TELEMETRY_PROTOCOL_VERSION) {
    return { valid: false, error: `Invalid protocol version: expected ${TELEMETRY_PROTOCOL_VERSION}` };
  }

  // Check deviceId
  if (!data.deviceId || typeof data.deviceId !== 'string' || data.deviceId.length > 64) {
    return { valid: false, error: 'Invalid or missing deviceId' };
  }

  // Check capturedAt
  if (!isValidIsoTimestamp(data.capturedAt)) {
    return { valid: false, error: 'capturedAt must be a valid ISO 8601 string' };
  }

  // Check sequence
  if (!isFiniteNumber(data.sequence) || data.sequence < 0) {
    return { valid: false, error: 'sequence must be a non-negative finite number' };
  }

  // Check type
  const type = data.type;
  if (!['HEARTBEAT', 'ACCOUNT_STATUS', 'QUOTE_SNAPSHOT', 'CANDLE_SNAPSHOT', 'INTELLIGENCE_SNAPSHOT'].includes(type)) {
    return { valid: false, error: `Unsupported telemetry message type: ${type}` };
  }

  // Guard against any injection of execution commands
  if ('command' in data || 'action' in data || 'order' in data || 'OrderSend' in data) {
    return { valid: false, error: 'Trading execution commands are forbidden in telemetry envelope' };
  }

  const payload = data.payload;
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be a non-null object' };
  }

  if ('command' in payload || 'action' in payload || 'order' in payload || 'OrderSend' in payload) {
    return { valid: false, error: 'Trading execution commands are forbidden in telemetry payload' };
  }

  // Validate per message type
  switch (type) {
    case 'HEARTBEAT': {
      if (!isFiniteNumber(payload.terminalBuild)) return { valid: false, error: 'Invalid terminalBuild' };
      if (typeof payload.broker !== 'string') return { valid: false, error: 'Invalid broker' };
      if (typeof payload.server !== 'string') return { valid: false, error: 'Invalid server' };
      if (typeof payload.terminalConnected !== 'boolean') return { valid: false, error: 'terminalConnected must be boolean' };
      break;
    }

    case 'ACCOUNT_STATUS': {
      if (typeof payload.maskedLogin !== 'string') return { valid: false, error: 'Invalid maskedLogin' };
      if (typeof payload.broker !== 'string') return { valid: false, error: 'Invalid broker' };
      if (!isFiniteNumber(payload.balance) || payload.balance < 0) return { valid: false, error: 'Invalid balance' };
      if (!isFiniteNumber(payload.equity) || payload.equity < 0) return { valid: false, error: 'Invalid equity' };
      if (!isFiniteNumber(payload.margin) || payload.margin < 0) return { valid: false, error: 'Invalid margin' };
      if (!isFiniteNumber(payload.freeMargin)) return { valid: false, error: 'Invalid freeMargin' };
      break;
    }

    case 'QUOTE_SNAPSHOT': {
      if (!Array.isArray(payload.quotes)) {
        return { valid: false, error: 'quotes must be an array' };
      }
      if (payload.quotes.length > MAX_QUOTES_PER_SNAPSHOT) {
        return { valid: false, error: `Quote count exceeds maximum of ${MAX_QUOTES_PER_SNAPSHOT}` };
      }
      for (const q of payload.quotes) {
        if (!q || typeof q !== 'object') return { valid: false, error: 'Malformed quote item' };
        if (typeof q.symbol !== 'string' || !CANONICAL_TELEMETRY_SYMBOLS.has(q.symbol)) {
          return { valid: false, error: `Unsupported or invalid quote symbol: ${q.symbol}` };
        }
        if (!isFiniteNumber(q.bid) || q.bid <= 0) return { valid: false, error: `Invalid bid for ${q.symbol}` };
        if (!isFiniteNumber(q.ask) || q.ask <= 0) return { valid: false, error: `Invalid ask for ${q.symbol}` };
        if (q.ask < q.bid) return { valid: false, error: `Inverted spread (ask < bid) for ${q.symbol}` };
        if (!isFiniteNumber(q.spread) || q.spread < 0) return { valid: false, error: `Invalid spread for ${q.symbol}` };
        if (!isFiniteNumber(q.timestamp) || q.timestamp <= 0) return { valid: false, error: `Invalid quote timestamp for ${q.symbol}` };
      }
      break;
    }

    case 'CANDLE_SNAPSHOT': {
      if (typeof payload.canonicalSymbol !== 'string' || !CANONICAL_TELEMETRY_SYMBOLS.has(payload.canonicalSymbol)) {
        return { valid: false, error: `Unsupported or invalid candle symbol: ${payload.canonicalSymbol}` };
      }
      if (typeof payload.timeframe !== 'string' || !CANONICAL_TELEMETRY_TIMEFRAMES.has(payload.timeframe)) {
        return { valid: false, error: `Unsupported or invalid timeframe: ${payload.timeframe}` };
      }
      if (payload.closed !== true) {
        return { valid: false, error: 'Only verified closed candles are allowed' };
      }
      if (payload.provider !== 'MT5_BROKER_BRIDGE') {
        return { valid: false, error: 'Invalid candle provider identity' };
      }
      if (!Array.isArray(payload.candles)) {
        return { valid: false, error: 'candles must be an array' };
      }
      if (payload.candles.length > MAX_CANDLES_PER_SNAPSHOT) {
        return { valid: false, error: `Candle count exceeds maximum of ${MAX_CANDLES_PER_SNAPSHOT}` };
      }

      for (let i = 0; i < payload.candles.length; i++) {
        const c = payload.candles[i];
        if (!c || typeof c !== 'object') return { valid: false, error: 'Malformed candle bar' };
        if (!isFiniteNumber(c.timestamp) || c.timestamp <= 0) return { valid: false, error: 'Invalid bar timestamp' };
        if (!isFiniteNumber(c.open) || c.open <= 0) return { valid: false, error: 'Invalid bar open' };
        if (!isFiniteNumber(c.high) || c.high <= 0) return { valid: false, error: 'Invalid bar high' };
        if (!isFiniteNumber(c.low) || c.low <= 0) return { valid: false, error: 'Invalid bar low' };
        if (!isFiniteNumber(c.close) || c.close <= 0) return { valid: false, error: 'Invalid bar close' };
        if (c.high < c.low || c.high < c.open || c.high < c.close || c.low > c.open || c.low > c.close) {
          return { valid: false, error: 'Invalid bar OHLC relationships (high/low violated)' };
        }
        if (i > 0 && c.timestamp <= payload.candles[i - 1].timestamp) {
          return { valid: false, error: 'Candle bars must be in strictly ascending chronological order' };
        }
      }
      break;
    }

    case 'INTELLIGENCE_SNAPSHOT': {
      if (payload.sourceAuthority !== 'LOCAL_ENGINE') {
        return { valid: false, error: 'sourceAuthority must be LOCAL_ENGINE' };
      }
      if (!isFiniteNumber(payload.evaluatedAt) || payload.evaluatedAt <= 0) {
        return { valid: false, error: 'Invalid evaluatedAt timestamp' };
      }
      if (!Array.isArray(payload.agents)) {
        return { valid: false, error: 'agents must be an array' };
      }
      if (!payload.decisions || typeof payload.decisions !== 'object') {
        return { valid: false, error: 'decisions must be an object' };
      }
      if (payload.finalDecisionSynthesizer !== 'FINAL_DECISION') {
        return { valid: false, error: 'finalDecisionSynthesizer must be FINAL_DECISION' };
      }
      break;
    }
  }

  return { valid: true, envelope: data as CanonicalTelemetryEnvelope };
}
