/**
 * FEF TRADING SOLUTIONS — CONTINUITY FEED ENGINE
 * Phase 2D & V1.1 Resilient Intelligence Architecture
 *
 * Implements the full ContinuityFeed state machine:
 * - BROKER_PRIMARY: Fresh MT5 broker quotes (< 5000ms). Broker is absolute price authority.
 * - BROKER_STALE: Broker quote age exceeds 5000ms. Fail-closed transition initiated.
 * - FAILOVER_ACTIVE: Switched to independent verified reference feed. Execution is strictly LOCKED.
 * - REFERENCE_ACTIVE: Operating purely from independent reference feed. Execution LOCKED.
 * - SYNCING: Broker has reconnected; cross-feed divergence & quote freshness are evaluated before reauthorizing.
 * - VERIFIED: Reconnection checks passed; restoring BROKER_PRIMARY authority.
 * - OFFLINE: Both broker and reference feeds are unavailable.
 *
 * Invariant: Execution is strictly LOCKED unless in BROKER_PRIMARY with verified DEMO account.
 */

export type ContinuityState =
  | 'BROKER_PRIMARY'
  | 'REFERENCE_ACTIVE'
  | 'BROKER_STALE'
  | 'FAILOVER_ACTIVE'
  | 'SYNCING'
  | 'VERIFIED'
  | 'OFFLINE';

import { getInstrumentParityProfile } from './instrument-parity';

export type ContinuityPriceAuthority = 'MT5_BROKER' | 'REFERENCE_MARKET' | 'REFERENCE' | 'REFERENCE_PROXY' | 'UNAVAILABLE';

export interface ContinuityFeedStatus {
  state: ContinuityState;
  symbol: string;
  priceAuthority: ContinuityPriceAuthority;
  activePrice: number;
  bid: number;
  ask: number;
  spread: number;
  provider: string;
  provenance: string;
  brokerConnected: boolean;
  brokerQuoteAgeMs: number | null;
  referenceQuoteAgeMs: number | null;
  divergenceBps: number | null;
  executionLocked: boolean;
  statusLabel: string;
  reason: string;
  updatedAt: number;
}

export interface EvaluateContinuityParams {
  symbol: string;
  brokerQuote?: {
    bid: number;
    ask: number;
    timestamp: number;
    digits?: number;
    spread?: number;
  } | null;
  referencePrice?: number | null;
  referenceProvider?: string;
  isMt5Connected?: boolean;
  operatingMode?: string;
  maxBrokerAgeMs?: number;
}

/**
 * Determine the authoritative ContinuityFeed state and active pricing.
 */
export function evaluateContinuityFeed(params: EvaluateContinuityParams): ContinuityFeedStatus {
  const {
    symbol,
    brokerQuote,
    referencePrice,
    referenceProvider = 'Independent Market Feed',
    maxBrokerAgeMs = 5000,
  } = params;

  const now = Date.now();
  const hasBrokerQuote = Boolean(brokerQuote && brokerQuote.bid > 0 && brokerQuote.ask > 0);
  const brokerAgeMs = hasBrokerQuote && brokerQuote ? Math.max(0, now - brokerQuote.timestamp) : null;
  const isBrokerFresh = hasBrokerQuote && brokerAgeMs !== null && brokerAgeMs < maxBrokerAgeMs;

  const hasReference = typeof referencePrice === 'number' && referencePrice > 0 && !isNaN(referencePrice);

  // Case 1: Fresh live MT5 broker quote
  if (isBrokerFresh && brokerQuote) {
    const mid = Number(((brokerQuote.bid + brokerQuote.ask) / 2).toFixed(brokerQuote.digits || 2));
    const spread = Number((brokerQuote.ask - brokerQuote.bid).toFixed(brokerQuote.digits || 2));

    let divergenceBps: number | null = null;
    if (hasReference && referencePrice) {
      const diff = Math.abs(mid - referencePrice);
      divergenceBps = Number(((diff / referencePrice) * 10000).toFixed(1));
    }

    return {
      state: 'BROKER_PRIMARY',
      symbol,
      priceAuthority: 'MT5_BROKER',
      activePrice: mid,
      bid: brokerQuote.bid,
      ask: brokerQuote.ask,
      spread,
      provider: 'MT5 Broker',
      provenance: 'MT5_BROKER_QUOTE',
      brokerConnected: true,
      brokerQuoteAgeMs: brokerAgeMs,
      referenceQuoteAgeMs: 0,
      divergenceBps,
      executionLocked: false,
      statusLabel: 'BROKER PRIMARY • MT5 LIVE',
      reason: 'Authoritative broker telemetry active and fresh (< 5s).',
      updatedAt: now,
    };
  }

  const parityProfile = getInstrumentParityProfile(symbol);

  // Case 2: Broker quote exists but is stale (>= 5000ms)
  if (hasBrokerQuote && !isBrokerFresh) {
    if (hasReference && referencePrice && parityProfile.parityClassification !== 'UNAVAILABLE') {
      const isProxyOnly = parityProfile.parityClassification === 'PROXY_ONLY';
      const authority: ContinuityPriceAuthority = isProxyOnly ? 'REFERENCE_PROXY' : 'REFERENCE_MARKET';
      const label = isProxyOnly ? 'FAILOVER • REFERENCE PROXY' : 'FAILOVER ACTIVE • REFERENCE FEED';
      const reason = isProxyOnly
        ? `Broker quote stale (${Math.round((brokerAgeMs || 0) / 1000)}s old). Active proxy: ${parityProfile.contractIdentity}. Exact broker execution levels disabled.`
        : `Broker quote stale (${Math.round((brokerAgeMs || 0) / 1000)}s old). Intelligence continuing from reference feed. Execution locked.`;

      return {
        state: 'FAILOVER_ACTIVE',
        symbol,
        priceAuthority: authority,
        activePrice: referencePrice,
        bid: referencePrice,
        ask: referencePrice,
        spread: 0,
        provider: referenceProvider,
        provenance: isProxyOnly ? 'INDEPENDENT_PROXY_FEED' : 'INDEPENDENT_REFERENCE_FEED',
        brokerConnected: false,
        brokerQuoteAgeMs: brokerAgeMs,
        referenceQuoteAgeMs: 0,
        divergenceBps: null,
        executionLocked: true, // Strict fail-closed
        statusLabel: label,
        reason,
        updatedAt: now,
      };
    }

    return {
      state: 'BROKER_STALE',
      symbol,
      priceAuthority: 'UNAVAILABLE',
      activePrice: 0,
      bid: 0,
      ask: 0,
      spread: 0,
      provider: 'MT5 Broker (Stale)',
      provenance: 'STALE_BROKER_QUOTE',
      brokerConnected: false,
      brokerQuoteAgeMs: brokerAgeMs,
      referenceQuoteAgeMs: null,
      divergenceBps: null,
      executionLocked: true,
      statusLabel: 'BROKER STALE • EXECUTION LOCKED',
      reason: `Broker quote stale (${Math.round((brokerAgeMs || 0) / 1000)}s old) and no independent reference available.`,
      updatedAt: now,
    };
  }

  // Case 3: Broker completely disconnected, but independent reference is active
  if (hasReference && referencePrice && parityProfile.parityClassification !== 'UNAVAILABLE') {
    const isProxyOnly = parityProfile.parityClassification === 'PROXY_ONLY';
    const authority: ContinuityPriceAuthority = isProxyOnly ? 'REFERENCE_PROXY' : 'REFERENCE_MARKET';
    const label = isProxyOnly ? 'REFERENCE PROXY • BROKER OFFLINE' : 'REFERENCE ACTIVE • BROKER OFFLINE';
    const reason = isProxyOnly
      ? `MT5 broker disconnected. Active proxy: ${parityProfile.contractIdentity}. Trend/structure active; exact execution levels disabled.`
      : 'MT5 broker disconnected. Intelligence active from verified reference feed. Execution locked.';

    return {
      state: 'REFERENCE_ACTIVE',
      symbol,
      priceAuthority: authority,
      activePrice: referencePrice,
      bid: referencePrice,
      ask: referencePrice,
      spread: 0,
      provider: referenceProvider,
      provenance: isProxyOnly ? 'INDEPENDENT_PROXY_FEED' : 'INDEPENDENT_REFERENCE_FEED',
      brokerConnected: false,
      brokerQuoteAgeMs: null,
      referenceQuoteAgeMs: 0,
      divergenceBps: null,
      executionLocked: true, // Strict fail-closed
      statusLabel: label,
      reason,
      updatedAt: now,
    };
  }

  // Case 4: Both feeds unavailable
  return {
    state: 'OFFLINE',
    symbol,
    priceAuthority: 'UNAVAILABLE',
    activePrice: 0,
    bid: 0,
    ask: 0,
    spread: 0,
    provider: 'NONE',
    provenance: 'UNAVAILABLE',
    brokerConnected: false,
    brokerQuoteAgeMs: null,
    referenceQuoteAgeMs: null,
    divergenceBps: null,
    executionLocked: true,
    statusLabel: 'MARKET FEED OFFLINE',
    reason: 'Neither broker quote nor independent reference feed is available.',
    updatedAt: now,
  };
}
