/**
 * FEF TRADING SOLUTIONS — CANONICAL DATAHUB TYPES & CONTRACTS
 * 
 * Foundational Clean-Room Contracts for FEF DataHub (Sprint 1A + Sprint 1B)
 * 
 * Core Architectural Invariants:
 * 1. ONE FETCH -> NORMALIZE ONCE -> PRESERVE PROVENANCE -> MANY CONSUMERS
 * 2. Immutable provenance preservation (integrating canonical EvidenceClassification).
 * 3. ZERO EXECUTION AUTHORITY: DataHub has ZERO authority or capability to determine,
 *    grant, evaluate, or advertise execution eligibility.
 *    Execution authority is the exclusive domain of PriceAuthority & ExecutionPolicy.
 * 4. Deterministic Context Isolation: symbol, timeframe, topic, and provider keys are strictly isolated.
 * 5. Fail-closed freshness & availability: no synthetic prices, no fabricated timestamps.
 */

import { EvidenceClassification } from '../evidence/agent-evidence';

export type DataHubFreshness = 'FRESH' | 'STALE' | 'OFFLINE' | 'UNAVAILABLE';

export type DataHubSourceType =
  | 'BROKER_DIRECT'
  | 'PUBLIC_API'
  | 'DERIVED_MATH'
  | 'INDEPENDENT_FEED'
  | 'HEURISTIC'
  | 'UNAVAILABLE';

export type ProviderHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'STALE'
  | 'OFFLINE'
  | 'UNKNOWN';

export type ProviderErrorCategory =
  | 'AUTHENTICATION'
  | 'RATE_LIMIT'
  | 'NETWORK'
  | 'PROVIDER_ERROR'
  | 'MALFORMED_RESPONSE'
  | 'INVALID_DATA'
  | 'UNKNOWN';

/**
 * Deterministic Context Key for subscriptions, caching, and single-flight execution
 */
export interface DataHubTopicKey {
  topic: string;
  symbol?: string;
  timeframe?: string;
  provider?: string;
}

/**
 * Format a canonical string key from a topic key specification.
 * Ensures case-insensitivity and strict parameter separation.
 */
export function formatDataHubKey(key: DataHubTopicKey): string {
  const normTopic = (key.topic || '').trim().toLowerCase();
  const normSymbol = key.symbol ? key.symbol.trim().toUpperCase() : '*';
  const normTf = key.timeframe ? key.timeframe.trim().toUpperCase() : '*';
  const normProvider = key.provider ? key.provider.trim().toLowerCase() : '*';

  return `${normTopic}:${normSymbol}:${normTf}:${normProvider}`;
}

/**
 * Parse a formatted string key back into structured components
 */
export function parseDataHubKey(keyStr: string): DataHubTopicKey {
  const parts = keyStr.split(':');
  return {
    topic: parts[0] || '',
    symbol: parts[1] && parts[1] !== '*' ? parts[1] : undefined,
    timeframe: parts[2] && parts[2] !== '*' ? parts[2] : undefined,
    provider: parts[3] && parts[3] !== '*' ? parts[3] : undefined,
  };
}

/**
 * Canonical DataHub Envelope
 * Every data item delivered through DataHub is wrapped in this envelope.
 * 
 * NOTE: DataHub strictly omits execution eligibility concepts (`isExecutable`).
 * Execution eligibility is exclusively resolved by the hardened PriceAuthority engine.
 */
export interface DataHubEnvelope<T = unknown> {
  // Key Identity
  topic: string;
  symbol?: string;
  timeframe?: string;
  key: string; // The formatted unique context key

  // Provenance & Source Attribution
  provider: string;
  sourceType: DataHubSourceType;
  provenance: EvidenceClassification; // Reuses FEF canonical evidence classifications

  // Timestamps (All in epoch milliseconds)
  observedAt: number;        // When the primary source emitted or measured the data
  receivedAt: number;        // When FEF DataHub first ingested this specific observation
  cachedAt?: number;         // When this entry was written to the local DataHub cache
  ageMs: number;             // Age relative to current evaluation time
  ttlMs: number;             // Configured or applied TTL for this topic

  // Freshness & Availability Status
  freshness: DataHubFreshness;
  isStale: boolean;
  isAvailable: boolean;

  // Content
  payload: T | null;
  error?: {
    code: string;
    message: string;
    timestamp: number;
    category?: ProviderErrorCategory;
  };
}

/**
 * Provider Health Record
 */
export interface DataHubProviderHealth {
  providerId: string;
  name: string;
  sourceType: DataHubSourceType;
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastSuccessTimestamp?: number;
  lastFailureTimestamp?: number;
  lastLatencyMs?: number;
  lastError?: {
    message: string;
    timestamp: number;
    category?: ProviderErrorCategory;
  };
}

/**
 * Subscriber Callback Contract
 */
export type DataHubSubscriber<T = unknown> = (envelope: DataHubEnvelope<T>) => void | Promise<void>;

/**
 * Subscription Handle for clean unsubscribing
 */
export interface DataHubSubscription {
  id: string;
  keyPattern: string;
  unsubscribe: () => void;
}

/**
 * Fetcher function signature for single-flight coordination
 */
export type DataHubFetcher<T = unknown> = () => Promise<DataHubEnvelope<T>>;
