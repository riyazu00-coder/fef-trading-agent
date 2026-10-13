/**
 * FEF TRADING SOLUTIONS — CANONICAL CONNECTIVITY & FRESHNESS POLICY
 *
 * Centralizes thresholds, anti-flap hysteresis rules, and quote/heartbeat freshness
 * classifications for the entire FEF CORTEX terminal.
 *
 * Invariants:
 * - CANONICAL_EXECUTION_MODE remains READ_ONLY
 * - MT5_ORDER_TRANSPORT_ENABLED remains false
 * - Fresh verified MT5 BID/ASK is sole execution price authority
 * - Stale quotes are never used as current executable price
 */

import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../execution/execution-policy';

// ---------------------------------------------------------------------------
// 1. Polling Intervals (Frontend Polling Cadence)
// ---------------------------------------------------------------------------
export const MARKET_DATA_POLL_INTERVAL_MS = 5000;
export const TELEMETRY_POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// 2. Authoritative Heartbeat & Terminal Liveness Thresholds
// ---------------------------------------------------------------------------
/** Under 10s: Healthy, actively beating terminal */
export const HEARTBEAT_FRESH_THRESHOLD_MS = 10_000;

/** 10s to 20s: Warning/Degraded heartbeat, within anti-flap tolerance */
export const HEARTBEAT_WARNING_THRESHOLD_MS = 20_000;

/** Over 20s: Definitive heartbeat loss — terminal is disconnected / OFFLINE */
export const HEARTBEAT_EXPIRED_THRESHOLD_MS = 20_000;

/** Max transient poll failures before transitioning from DEGRADED to OFFLINE (6 * 3s = 18s, aligned with 20s grace threshold) */
export const MAX_TRANSIENT_POLL_FAILURES = 6;

// ---------------------------------------------------------------------------
// 3. Broker Quote Freshness Thresholds
// ---------------------------------------------------------------------------
/**
 * Display Freshness: Quotes <= 15s (3x the 5s polling cycle) are rendered as LIVE MT5.
 * Prevents the 5-second polling race from causing visual UI flapping.
 */
export const QUOTE_DISPLAY_FRESH_THRESHOLD_MS = 15_000;

/**
 * Display Stale Threshold: Quotes between 15s and 30s are marked STALE / FALLBACK
 * for display, while terminal remains CONNECTED.
 */
export const QUOTE_DISPLAY_STALE_THRESHOLD_MS = 30_000;

/**
 * Trading Intelligence Threshold: Aligned with FRESHNESS_POLICIES['LIVE_MT5'] = 60_000ms.
 * After 60s, quote evidence is considered expired for algorithmic decision gating.
 */
export const QUOTE_INTELLIGENCE_THRESHOLD_MS = 60_000;

/**
 * Execution Price Authority Freshness:
 * Even in READ_ONLY mode, price authority requires quoteAge <= 5000ms
 * to be considered EXECUTABLE_BROKER.
 */
export const QUOTE_EXECUTION_STRICT_THRESHOLD_MS = 5_000;

// ---------------------------------------------------------------------------
// 4. Connectivity State Model
// ---------------------------------------------------------------------------
export type ConnectivityState = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface AntiFlapEvaluationParams {
  isAuthoritativeConnected: boolean; // terminalConnected || mt5Connected
  heartbeatAgeMs: number | null;
  previousState: ConnectivityState;
  consecutiveFailures: number;
  timeSinceLastSuccessMs: number;
  explicitTerminalDisconnect?: boolean; // bridge responded with terminalConnected === false
}

export interface AntiFlapEvaluationResult {
  state: ConnectivityState;
  consecutiveFailures: number;
  statusLabel: string;
  isMt5Connected: boolean;
  isInGracePeriod: boolean;
}

/**
 * Deterministic Anti-Flap / Hysteresis State Machine Evaluator
 *
 * Rules:
 * - A single transient network/fetch failure does NOT immediately flip an ONLINE connection to OFFLINE.
 * - Transitions to DEGRADED while within grace period (up to 20s or 3 consecutive failures).
 * - Immediate recovery to ONLINE upon receiving fresh authoritative telemetry.
 * - If heartbeat has expired (> 20s) or terminalConnected is explicitly false, transitions to OFFLINE immediately.
 */
export function evaluateConnectivityStatus(params: AntiFlapEvaluationParams): AntiFlapEvaluationResult {
  const {
    isAuthoritativeConnected,
    heartbeatAgeMs,
    previousState,
    consecutiveFailures,
    timeSinceLastSuccessMs,
    explicitTerminalDisconnect,
  } = params;

  // Case 0: Explicit terminal disconnect reported by bridge (terminal closed or broker disconnected)
  if (explicitTerminalDisconnect) {
    return {
      state: 'OFFLINE',
      consecutiveFailures: consecutiveFailures + 1,
      statusLabel: 'OFFLINE (Terminal Disconnected)',
      isMt5Connected: false,
      isInGracePeriod: false,
    };
  }

  // Case 1: Heartbeat has expired (> 20s): terminal lost communication definitively
  if (heartbeatAgeMs !== null && heartbeatAgeMs > HEARTBEAT_EXPIRED_THRESHOLD_MS) {
    return {
      state: 'OFFLINE',
      consecutiveFailures: consecutiveFailures + 1,
      statusLabel: `OFFLINE (Heartbeat Expired ${Math.round(heartbeatAgeMs / 1000)}s)`,
      isMt5Connected: false,
      isInGracePeriod: false,
    };
  }

  // Case 2: Fresh authoritative success reported by bridge/relay
  if (isAuthoritativeConnected) {
    if (heartbeatAgeMs === null || heartbeatAgeMs <= HEARTBEAT_FRESH_THRESHOLD_MS) {
      return {
        state: 'ONLINE',
        consecutiveFailures: 0,
        statusLabel: 'ONLINE',
        isMt5Connected: true,
        isInGracePeriod: false,
      };
    }

    if (heartbeatAgeMs <= HEARTBEAT_WARNING_THRESHOLD_MS) {
      return {
        state: 'DEGRADED',
        consecutiveFailures: 0,
        statusLabel: `DEGRADED (Heartbeat ${Math.round(heartbeatAgeMs / 1000)}s)`,
        isMt5Connected: true,
        isInGracePeriod: false,
      };
    }

    return {
      state: 'OFFLINE',
      consecutiveFailures: consecutiveFailures + 1,
      statusLabel: 'OFFLINE (Heartbeat Expired)',
      isMt5Connected: false,
      isInGracePeriod: false,
    };
  }

  // Case 3: Authoritative connection reported false or telemetry fetch failed
  // Anti-flap hysteresis: If previously ONLINE or DEGRADED, allow a deterministic grace period
  const isWithinGracePeriod =
    timeSinceLastSuccessMs <= HEARTBEAT_WARNING_THRESHOLD_MS &&
    consecutiveFailures < MAX_TRANSIENT_POLL_FAILURES &&
    previousState !== 'OFFLINE';

  if (isWithinGracePeriod) {
    return {
      state: 'DEGRADED',
      consecutiveFailures: consecutiveFailures + 1,
      statusLabel: `DEGRADED (Sync retry ${consecutiveFailures + 1}/${MAX_TRANSIENT_POLL_FAILURES})`,
      isMt5Connected: true, // Keep connected flag true during transient grace period
      isInGracePeriod: true,
    };
  }

  // Grace period expired or repeated failures confirmed
  return {
    state: 'OFFLINE',
    consecutiveFailures: consecutiveFailures + 1,
    statusLabel: 'OFFLINE',
    isMt5Connected: false,
    isInGracePeriod: false,
  };
}

// ---------------------------------------------------------------------------
// 5. Quote Freshness Evaluator
// ---------------------------------------------------------------------------
export type QuoteFreshnessClassification = 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED' | 'UNAVAILABLE';

export interface QuoteFreshnessEvaluation {
  classification: QuoteFreshnessClassification;
  ageMs: number;
  isDisplayLive: boolean;
  isDisplayEligible: boolean;
  isExecutableAuthority: boolean;
  isIntelligenceEligible: boolean;
  statusLabel: string;
}

export function evaluateBrokerQuoteFreshness(
  quote: { timestamp?: number; time?: string; ageMs?: number; bid?: number; ask?: number } | null | undefined,
  nowMs: number = Date.now()
): QuoteFreshnessEvaluation {
  if (!quote || typeof quote.bid !== 'number' || typeof quote.ask !== 'number' || quote.bid <= 0 || quote.ask <= 0) {
    return {
      classification: 'UNAVAILABLE',
      ageMs: Infinity,
      isDisplayLive: false,
      isDisplayEligible: false,
      isExecutableAuthority: false,
      isIntelligenceEligible: false,
      statusLabel: 'NO QUOTE',
    };
  }

  const quoteTime = quote.timestamp || (quote.time ? new Date(quote.time).getTime() : nowMs);
  const ageMs = typeof quote.ageMs === 'number' && Number.isFinite(quote.ageMs)
    ? quote.ageMs
    : Math.max(0, nowMs - quoteTime);

  const isExecutableAuthority = ageMs <= QUOTE_EXECUTION_STRICT_THRESHOLD_MS;
  const isDisplayLive = ageMs <= QUOTE_DISPLAY_FRESH_THRESHOLD_MS;
  const isDisplayEligible = ageMs <= QUOTE_DISPLAY_STALE_THRESHOLD_MS;
  const isIntelligenceEligible = ageMs <= QUOTE_INTELLIGENCE_THRESHOLD_MS;

  let classification: QuoteFreshnessClassification;
  let statusLabel: string;

  if (isExecutableAuthority) {
    classification = 'FRESH';
    statusLabel = 'LIVE MT5';
  } else if (isDisplayLive) {
    classification = 'AGING';
    statusLabel = `LIVE MT5 (${Math.round(ageMs / 1000)}s)`;
  } else if (isIntelligenceEligible) {
    classification = 'STALE';
    statusLabel = `STALE MT5 (${Math.round(ageMs / 1000)}s)`;
  } else {
    classification = 'EXPIRED';
    statusLabel = `EXPIRED MT5 (${Math.round(ageMs / 1000)}s)`;
  }

  return {
    classification,
    ageMs,
    isDisplayLive,
    isDisplayEligible,
    isExecutableAuthority,
    isIntelligenceEligible,
    statusLabel,
  };
}
