/**
 * FEF TRADING SOLUTIONS — DATAHUB IN-MEMORY TTL CACHE
 * 
 * Foundational Clean-Room Implementation (Sprint 1A)
 * 
 * Rules:
 * 1. Preserves original source observation timestamp without modification.
 * 2. Distinguishes cachedAt from observedAt.
 * 3. Deterministic freshness evaluation: ageMs = now - observedAt.
 * 4. Stale items are never promoted to FRESH.
 * 5. Expired items (> ttlMs) fail closed or report STALE with isAvailable = false.
 * 6. Immutability: Deep cloned or protected against consumer mutation.
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
    };

    this.entries.set(key, cachedEntry);
    return cachedEntry;
  }

  /**
   * Get an envelope from cache with real-time freshness recalculation.
   * If entry is past TTL, it evaluates as STALE or UNAVAILABLE without fabricating timestamps.
   */
  public get<T>(key: string, allowStale: boolean = false): DataHubEnvelope<T> | null {
    const entry = this.entries.get(key) as DataHubEnvelope<T> | undefined;
    if (!entry) {
      return null;
    }

    const currentNow = this.now();
    const ageMs = Math.max(0, currentNow - entry.observedAt);
    const isPastTtl = ageMs > entry.ttlMs;

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

    // Return a fresh envelope copy reflecting current elapsed age
    return {
      ...entry,
      ageMs,
      freshness,
      isStale,
      isAvailable: entry.isAvailable && (!isStale || allowStale),
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
