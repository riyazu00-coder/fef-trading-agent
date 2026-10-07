/**
 * FEF TRADING SOLUTIONS — DATAHUB PROVIDER HEALTH MONITOR
 * 
 * Foundational Clean-Room Implementation (Sprint 1A + Sprint 1B)
 * 
 * Rules:
 * 1. Tracks factual success/failure metrics only.
 * 2. Does NOT mark providers healthy merely because the runtime process is alive.
 * 3. Transitions to DEGRADED after consecutive failures, OFFLINE after prolonged failure.
 * 4. Resets failure counters upon authentic verified success.
 * 5. Supports structured error categories without exposing credentials or secret tokens.
 */

import { DataHubProviderHealth, DataHubSourceType, ProviderErrorCategory, ProviderHealthStatus } from './types';

export interface HealthTrackerOptions {
  degradedFailureThreshold?: number;
  offlineFailureThreshold?: number;
  now?: () => number;
}

export class DataHubHealthRegistry {
  private providers = new Map<string, DataHubProviderHealth>();
  private degradedThreshold: number;
  private offlineThreshold: number;
  private now: () => number;

  constructor(options: HealthTrackerOptions = {}) {
    this.degradedThreshold = options.degradedFailureThreshold || 3;
    this.offlineThreshold = options.offlineFailureThreshold || 6;
    this.now = options.now || (() => Date.now());
  }

  /**
   * Register or get provider health record
   */
  public getOrCreate(providerId: string, name: string, sourceType: DataHubSourceType): DataHubProviderHealth {
    const normId = providerId.trim().toLowerCase();
    let record = this.providers.get(normId);

    if (!record) {
      record = {
        providerId: normId,
        name,
        sourceType,
        status: 'UNKNOWN',
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
      };
      this.providers.set(normId, record);
    }

    return record;
  }

  /**
   * Record a successful response
   */
  public recordSuccess(providerId: string, latencyMs?: number): DataHubProviderHealth {
    const normId = providerId.trim().toLowerCase();
    const record = this.providers.get(normId) || {
      providerId: normId,
      name: providerId,
      sourceType: 'PUBLIC_API',
      status: 'HEALTHY',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };

    record.consecutiveFailures = 0;
    record.consecutiveSuccesses += 1;
    record.lastSuccessTimestamp = this.now();
    record.status = 'HEALTHY';
    if (typeof latencyMs === 'number' && latencyMs >= 0) {
      record.lastLatencyMs = latencyMs;
    }

    this.providers.set(normId, record);
    return { ...record };
  }

  /**
   * Record a failed response with optional category
   */
  public recordFailure(providerId: string, errorMessage: string, category: ProviderErrorCategory = 'UNKNOWN'): DataHubProviderHealth {
    const normId = providerId.trim().toLowerCase();
    const record = this.providers.get(normId) || {
      providerId: normId,
      name: providerId,
      sourceType: 'PUBLIC_API',
      status: 'UNKNOWN',
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };

    const currentNow = this.now();
    record.consecutiveSuccesses = 0;
    record.consecutiveFailures += 1;
    record.lastFailureTimestamp = currentNow;
    record.lastError = {
      message: errorMessage,
      timestamp: currentNow,
      category,
    };

    if (record.consecutiveFailures >= this.offlineThreshold) {
      record.status = 'OFFLINE';
    } else if (record.consecutiveFailures >= this.degradedThreshold) {
      record.status = 'DEGRADED';
    } else {
      record.status = 'DEGRADED';
    }

    this.providers.set(normId, record);
    return { ...record };
  }

  /**
   * Get health record for a provider
   */
  public getHealth(providerId: string): DataHubProviderHealth | null {
    const record = this.providers.get(providerId.trim().toLowerCase());
    return record ? { ...record } : null;
  }

  /**
   * Get all provider health records
   */
  public getAllHealth(): DataHubProviderHealth[] {
    const list: DataHubProviderHealth[] = [];
    this.providers.forEach((record) => {
      list.push({ ...record });
    });
    return list;
  }

  /**
   * Reset all health states (e.g. for testing)
   */
  public clear(): void {
    this.providers.clear();
  }
}
