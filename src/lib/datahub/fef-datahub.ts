/**
 * FEF TRADING SOLUTIONS — CANONICAL DATAHUB FOUNDATION
 * 
 * Clean-Room Implementation (Sprint 1A)
 * 
 * Core Design:
 * - In-process pub/sub topic coordinator.
 * - Single-flight asynchronous fetch deduplication.
 * - Deterministic context keying (symbol, timeframe, provider, topic).
 * - Implements TTL caching with truthful freshness calculation.
 * - Immutable provenance preservation.
 * - ZERO EXECUTION AUTHORITY: DataHub NEVER creates, promotes, grants, or advertises
 *   executable authority. Execution decisions belong exclusively to PriceAuthority & ExecutionPolicy.
 * - Fail-closed error handling: returns unavailable envelopes instead of inventing fallbacks.
 */

import {
  DataHubEnvelope,
  DataHubFetcher,
  DataHubSubscriber,
  DataHubSubscription,
  DataHubTopicKey,
  formatDataHubKey,
  DataHubFreshness,
  DataHubProviderHealth,
} from './types';
import { DataHubCache } from './datahub-cache';
import { DataHubHealthRegistry } from './datahub-health';

export interface DataHubConfig {
  now?: () => number;
  maxCacheEntries?: number;
}

export class FEFDataHub {
  private static instance: FEFDataHub;

  // Cache & Health Singletons
  private cache: DataHubCache;
  private health: DataHubHealthRegistry;

  // In-flight Single-Flight Map (Key -> Active Promise)
  private inFlightFetches = new Map<string, Promise<DataHubEnvelope<any>>>();

  // Pub/Sub Subscription Registry (KeyPattern -> Set of Subscriber Wrappers)
  private subscribers = new Map<string, Set<{ id: string; callback: DataHubSubscriber<any> }>>();
  private subscriptionCounter = 0;

  // Time provider for deterministic testing
  private now: () => number;

  constructor(config: DataHubConfig = {}) {
    this.now = config.now || (() => Date.now());
    this.cache = new DataHubCache({ now: this.now, maxEntries: config.maxCacheEntries });
    this.health = new DataHubHealthRegistry({ now: this.now });
  }

  public static getInstance(): FEFDataHub {
    if (!FEFDataHub.instance) {
      FEFDataHub.instance = new FEFDataHub();
    }
    return FEFDataHub.instance;
  }

  /**
   * Primary Ingestion Point:
   * Ingest an authoritative or reference envelope into DataHub, cache it,
   * update provider health, and broadcast to all matching subscribers.
   */
  public publish<T>(envelope: DataHubEnvelope<T>): DataHubEnvelope<T> {
    const currentNow = this.now();
    const formattedKey = envelope.key || formatDataHubKey({
      topic: envelope.topic,
      symbol: envelope.symbol,
      timeframe: envelope.timeframe,
      provider: envelope.provider,
    });

    const calculatedAge = Math.max(0, currentNow - envelope.observedAt);
    const isPastTtl = calculatedAge > envelope.ttlMs;

    let freshness: DataHubFreshness = envelope.freshness;
    let isStale = envelope.isStale;

    if (envelope.freshness === 'OFFLINE' || envelope.freshness === 'UNAVAILABLE') {
      freshness = envelope.freshness;
      isStale = true;
    } else if (isPastTtl) {
      freshness = 'STALE';
      isStale = true;
    }

    const sanitizedEnvelope: DataHubEnvelope<T> = {
      ...envelope,
      key: formattedKey,
      receivedAt: envelope.receivedAt || currentNow,
      ageMs: calculatedAge,
      freshness,
      isStale,
    };

    // Update Cache
    this.cache.set(formattedKey, sanitizedEnvelope);

    // Update Provider Health
    if (envelope.isAvailable && !envelope.error) {
      this.health.recordSuccess(envelope.provider);
    } else if (envelope.error) {
      this.health.recordFailure(envelope.provider, envelope.error.message);
    }

    // Broadcast to Pub/Sub Subscribers
    this.broadcast(formattedKey, sanitizedEnvelope);

    return sanitizedEnvelope;
  }

  /**
   * Request / Query Data with Single-Flight Fetch Coordination:
   * 1. Returns fresh cached entry if available.
   * 2. If fetcher is provided and no fresh entry exists:
   *    - Checks if an in-flight fetch already exists for this exact key.
   *    - If yes: joins and awaits the in-flight Promise.
   *    - If no: initiates the fetcher, stores the Promise, resolves, publishes, and cleans up.
   */
  public async fetch<T>(
    keySpec: DataHubTopicKey,
    fetcher: DataHubFetcher<T>,
    options: {
      forceRefresh?: boolean;
      allowStale?: boolean;
    } = {}
  ): Promise<DataHubEnvelope<T>> {
    const formattedKey = formatDataHubKey(keySpec);

    // 1. Check Cache
    if (!options.forceRefresh) {
      const cached = this.cache.get<T>(formattedKey, options.allowStale || false);
      if (cached && (cached.freshness === 'FRESH' || options.allowStale)) {
        return cached;
      }
    }

    // 2. Check In-Flight Fetches (Single-Flight Deduplication)
    const existingInFlight = this.inFlightFetches.get(formattedKey);
    if (existingInFlight) {
      return (await existingInFlight) as DataHubEnvelope<T>;
    }

    // 3. Initiate New Single-Flight Fetch
    const fetchPromise = (async () => {
      try {
        const rawEnvelope = await fetcher();
        const published = this.publish<T>(rawEnvelope);
        return published;
      } catch (err: any) {
        // Record provider failure if provider specified
        if (keySpec.provider) {
          this.health.recordFailure(keySpec.provider, err?.message || String(err));
        }

        // Build fail-closed error envelope (ZERO execution metadata)
        const errEnvelope: DataHubEnvelope<T> = {
          topic: keySpec.topic,
          symbol: keySpec.symbol,
          timeframe: keySpec.timeframe,
          key: formattedKey,
          provider: keySpec.provider || 'UNKNOWN',
          sourceType: 'UNAVAILABLE',
          provenance: 'UNAVAILABLE',
          observedAt: this.now(),
          receivedAt: this.now(),
          ageMs: 0,
          ttlMs: 0,
          freshness: 'UNAVAILABLE',
          isStale: true,
          isAvailable: false,
          payload: null,
          error: {
            code: 'FETCH_FAILED',
            message: err?.message || String(err),
            timestamp: this.now(),
          },
        };

        return errEnvelope;
      } finally {
        // ALWAYS clean up in-flight map so future calls can retry
        this.inFlightFetches.delete(formattedKey);
      }
    })();

    this.inFlightFetches.set(formattedKey, fetchPromise);
    return await fetchPromise;
  }

  /**
   * Subscribe to topic events.
   * Pattern can be an exact key ("quote:XAUUSD:*:exness") or a wildcard prefix ("quote:XAUUSD:*").
   */
  public subscribe<T>(
    keySpec: DataHubTopicKey,
    callback: DataHubSubscriber<T>
  ): DataHubSubscription {
    const formattedKey = formatDataHubKey(keySpec);
    const subId = `sub_${++this.subscriptionCounter}_${this.now()}`;

    let subSet = this.subscribers.get(formattedKey);
    if (!subSet) {
      subSet = new Set();
      this.subscribers.set(formattedKey, subSet);
    }

    const subEntry = { id: subId, callback: callback as DataHubSubscriber<any> };
    subSet.add(subEntry);

    const subscription: DataHubSubscription = {
      id: subId,
      keyPattern: formattedKey,
      unsubscribe: () => {
        const set = this.subscribers.get(formattedKey);
        if (set) {
          set.delete(subEntry);
          if (set.size === 0) {
            this.subscribers.delete(formattedKey);
          }
        }
      },
    };

    return subscription;
  }

  /**
   * Broadcast an envelope to exact subscribers and wildcard matching subscribers.
   * Isolates exceptions so a failing subscriber never blocks others.
   */
  private broadcast<T>(formattedKey: string, envelope: DataHubEnvelope<T>): void {
    const matchingCallbacks: DataHubSubscriber<T>[] = [];

    // Exact key matches
    const exactSubSet = this.subscribers.get(formattedKey);
    if (exactSubSet) {
      exactSubSet.forEach((entry) => {
        matchingCallbacks.push(entry.callback);
      });
    }

    // Wildcard pattern matches (e.g. topic:symbol:*:*)
    this.subscribers.forEach((set, pattern) => {
      if (pattern !== formattedKey && this.isPatternMatch(pattern, formattedKey)) {
        set.forEach((entry) => {
          matchingCallbacks.push(entry.callback);
        });
      }
    });

    // Execute callbacks with error containment
    matchingCallbacks.forEach((cb) => {
      try {
        const result = cb(envelope);
        if (result && typeof (result as any).catch === 'function') {
          (result as any).catch((err: any) => {
            console.error(`[DataHub] Async subscriber exception caught:`, err?.message || err);
          });
        }
      } catch (err: any) {
        console.error(`[DataHub] Sync subscriber exception caught:`, err?.message || err);
      }
    });
  }

  /**
   * Check if pattern matches key with wildcards (*)
   */
  private isPatternMatch(pattern: string, key: string): boolean {
    const pParts = pattern.split(':');
    const kParts = key.split(':');

    if (pParts.length !== kParts.length) return false;

    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i] !== '*' && pParts[i] !== kParts[i]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get direct cache snapshot
   */
  public getSnapshot<T>(keySpec: DataHubTopicKey, allowStale: boolean = false): DataHubEnvelope<T> | null {
    const formattedKey = formatDataHubKey(keySpec);
    return this.cache.get<T>(formattedKey, allowStale);
  }

  /**
   * Health registry access
   */
  public getProviderHealth(providerId: string): DataHubProviderHealth | null {
    return this.health.getHealth(providerId);
  }

  public getAllProviderHealth(): DataHubProviderHealth[] {
    return this.health.getAllHealth();
  }

  /**
   * Clear all internal state (e.g. for testing)
   */
  public resetForTesting(): void {
    this.cache.clear();
    this.health.clear();
    this.inFlightFetches.clear();
    this.subscribers.clear();
  }
}

export const fefDataHub = FEFDataHub.getInstance();
