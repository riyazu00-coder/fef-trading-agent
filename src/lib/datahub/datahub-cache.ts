/**
 * FEF TRADING SOLUTIONS — DATAHUB IN-MEMORY TTL CACHE
 * 
 * Foundational Clean-Room Implementation (Sprint 1A + Sprint 1B Hardening)
 * 
 * Rules:
 * 1. Preserves original source observation timestamp without modification.
 * 2. Distinguishes cachedAt from observedAt.
 * 3. Deterministic freshness evaluation: ageMs = now - observedAt.
 * 4. Stale items are never promoted to FRESH.
 * 5. Expired items (> ttlMs) fail closed or report STALE with isAvailable = false.
 * 6. Hardening: NaN, Infinity, negative, or future timestamps fail closed to STALE/UNAVAILABLE.
 * 7. Immutability: Returns cloned envelopes to prevent consumer mutation of cached state.
 */

import { DataHubEnvelope, DataHubFreshness } from './types';

export interface CacheOptions {
  now?: () => number;
  maxEntries?: number;
}

export class DataHubCache {
  private entries = new Map<string, DataHubEnvelope<any>>();
  private now: () => number;
  private maxEntries: number;

  constructor(options: CacheOptions = {}) {
    this.now = options.now || (() => Date.now());
    this.maxEntries = options.maxEntries || 2000;
  }

  /**
   * Set an envelope in cache.
   * Attaches cachedAt timestamp while strictly preserving observedAt.
   * Stores a defensive copy to prevent caller mutation of stored state.
   */
  public set<T>(key: string, envelope: DataHubEnvelope<T>): DataHubEnvelope<T> {
    const currentNow = this.now();

    // Prevent unbounded memory expansion
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      const keys: string[] = [];
      this.entries.forEach((_, k) => {
        if (keys.length === 0) keys.push(k);
      });
      if (keys.length > 0) {
        this.entries.delete(keys[0]);
      }
    }

    const cachedEntry: DataHubEnvelope<T> = {
      ...envelope,
      cachedAt: currentNow,
      payload: envelope.payload !== null && typeof envelope.payload === 'object'
        ? JSON.parse(JSON.stringify(envelope.payload))
        : envelope.payload,
    };

    this.entries.set(key, cachedEntry);
    return cachedEntry;
  }

  /**
   * Get an envelope from cache with real-time freshness recalculation.
   * If entry is past TTL or has invalid/future timestamps, it evaluates as STALE or UNAVAILABLE.
   * Returns a defensive clone so callers cannot mutate cached state.
   */
  public get<T>(key: string, allowStale: boolean = false): DataHubEnvelope<T> | null {
    const entry = this.entries.get(key) as DataHubEnvelope<T> | undefined;
    if (!entry) {
      return null;
    }

    const currentNow = this.now();

    // Timestamp & TTL Hardening: NaN, Infinity, non-finite, negative, or excessive future
    const obs = entry.observedAt;
    const ttl = entry.ttlMs;

    const isObsValid = typeof obs === 'number' && Number.isFinite(obs) && obs > 0;
    const isTtlValid = typeof ttl === 'number' && Number.isFinite(ttl) && ttl >= 0;

    // Check future timestamp beyond 5-minute clock-skew tolerance
    const isFuture = isObsValid && (obs > currentNow + 5 * 60 * 1000);

    if (!isObsValid || !isTtlValid || isFuture) {
      if (!allowStale) return null;
      return {
        ...entry,
        ageMs: Number.MAX_SAFE_INTEGER,
        freshness: 'UNAVAILABLE',
        isStale: true,
        isAvailable: false,
        payload: entry.payload !== null && typeof entry.payload === 'object'
          ? JSON.parse(JSON.stringify(entry.payload))
          : entry.payload,
      };
    }

    const ageMs = Math.max(0, currentNow - obs);
    const isPastTtl = ageMs > ttl;

    let freshness: DataHubFreshness = entry.freshness;
    let isStale = entry.isStale;

    if (entry.freshness === 'OFFLINE' || entry.freshness === 'UNAVAILABLE') {
      freshness = entry.freshness;
      isStale = true;
    } else if (isPastTtl) {
      freshness = 'STALE';
      isStale = true;
    } else {
      freshness = 'FRESH';
      isStale = false;
    }

    if (isStale && !allowStale) {
      return null;
    }

    // Return a fresh envelope copy reflecting current elapsed age with cloned payload
    return {
      ...entry,
      ageMs,
      freshness,
      isStale,
      isAvailable: entry.isAvailable && (!isStale || allowStale),
      payload: entry.payload !== null && typeof entry.payload === 'object'
        ? JSON.parse(JSON.stringify(entry.payload))
        : entry.payload,
    };
  }

  /**
   * Check if a valid fresh entry exists
   */
  public hasFresh(key: string): boolean {
    const entry = this.get(key, false);
    return entry !== null && entry.freshness === 'FRESH' && entry.isAvailable;
  }

  /**
   * Remove an entry
   */
  public delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /**
   * Clear all cached entries
   */
  public clear(): void {
    this.entries.clear();
  }

  /**
   * Get total number of stored entries
   */
  public size(): number {
    return this.entries.size;
  }
}
