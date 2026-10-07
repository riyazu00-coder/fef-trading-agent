/**
 * FEF CORTEX — OFFICIAL FRED CONNECTOR (SERVER-SIDE ONLY)
 * Sprint 1B Clean-Room Implementation
 * 
 * Rules:
 * 1. Server-side only: never imports or executes in client/browser bundles.
 * 2. Zero secret leakage: FRED_API_KEY is never logged, serialized, or exposed.
 * 3. Structured error classification (AUTHENTICATION, RATE_LIMIT, NETWORK, etc.).
 * 4. Pluggable transport (defaults to node https/fetch, injectable for testing).
 * 5. Returns DataHubEnvelope<NormalizedMacroObservation> ready for FEFDataHub.
 * 6. ZERO EXECUTION AUTHORITY.
 */

import { HistoricalMacroObservations, MacroObservationFetchOptions, NormalizedMacroObservation } from '../types';
import { getMacroSeriesDefinition } from '../catalog/fred-catalog';
import { normalizeFredObservation, RawFredObservation } from '../normalization/fred-normalizer';
import { DataHubEnvelope, formatDataHubKey, ProviderErrorCategory } from '../../datahub/types';

export type HttpFetchFn = (url: string) => Promise<{ status: number; text: () => Promise<string> }>;

export class FredConnector {
  public static readonly PROVIDER_ID = 'fred';
  public static readonly BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';
  public static readonly DEFAULT_HISTORY_LIMIT = 20;
  public static readonly MAX_HISTORY_LIMIT = 100;

  private fetchTransport: HttpFetchFn;
  private now: () => number;

  constructor(options: { fetchTransport?: HttpFetchFn; now?: () => number } = {}) {
    // Server-side environment verification
    if (typeof window !== 'undefined') {
      throw new Error('SECURITY_VIOLATION: FredConnector is server-side only and cannot run in the browser.');
    }

    this.fetchTransport = options.fetchTransport || (async (url: string) => {
      const res = await fetch(url);
      return {
        status: res.status,
        text: () => res.text(),
      };
    });

    this.now = options.now || (() => Date.now());
  }

  /**
   * Resolve API key strictly from environment or caller options
   */
  private resolveApiKey(options?: MacroObservationFetchOptions): string | null {
    if (options?.apiKey && typeof options.apiKey === 'string' && options.apiKey.trim() !== '') {
      return options.apiKey.trim();
    }
    const envKey = process.env.FRED_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim() !== '') {
      return envKey.trim();
    }
    return null;
  }

  /**
   * Fetch the latest observation for a specific series from official FRED API
   */
  public async fetchLatestObservation(
    seriesId: string,
    options?: MacroObservationFetchOptions
  ): Promise<DataHubEnvelope<NormalizedMacroObservation>> {
    const normSeriesId = seriesId.trim().toUpperCase();
    const currentNow = this.now();
    const key = formatDataHubKey({ topic: 'macro', symbol: normSeriesId, provider: FredConnector.PROVIDER_ID });

    // 1. Verify Catalog Definition
    const seriesDef = getMacroSeriesDefinition(normSeriesId);
    if (!seriesDef) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'UNKNOWN_SERIES',
        `Series ${normSeriesId} is not in the official FEF macro series catalog.`,
        'INVALID_DATA'
      );
    }

    // 2. Resolve API Key
    const apiKey = this.resolveApiKey(options);
    if (!apiKey) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'MISSING_API_KEY',
        'FRED_API_KEY is not configured in environment.',
        'AUTHENTICATION'
      );
    }

    // 3. Construct URL (Desc sort, limit=1 to get latest observation)
    // Note: apiKey is kept in local memory, never logged
    const url = `${FredConnector.BASE_URL}?series_id=${encodeURIComponent(normSeriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=1`;

    let httpStatus = 0;
    let responseText = '';

    try {
      const res = await this.fetchTransport(url);
      httpStatus = res.status;
      responseText = await res.text();
    } catch (err: any) {
      // Network failure
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'NETWORK_FAILURE',
        `Network transport failure contacting FRED: ${err?.message || 'Connection error'}`,
        'NETWORK'
      );
    }

    // 4. Classify HTTP Status Codes
    if (httpStatus === 401 || httpStatus === 403) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'AUTH_FAILURE',
        'FRED API rejected request with 401/403 (Invalid or unauthorized API key).',
        'AUTHENTICATION'
      );
    }

    if (httpStatus === 429) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'RATE_LIMITED',
        'FRED API rate limit exceeded (HTTP 429).',
        'RATE_LIMIT'
      );
    }

    if (httpStatus >= 500) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'PROVIDER_ERROR',
        `FRED server returned error (HTTP ${httpStatus}).`,
        'PROVIDER_ERROR'
      );
    }

    if (httpStatus !== 200) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'HTTP_ERROR',
        `FRED request failed with HTTP ${httpStatus}.`,
        'PROVIDER_ERROR'
      );
    }

    // 5. Parse JSON Payload
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'MALFORMED_JSON',
        'FRED response was not valid JSON.',
        'MALFORMED_RESPONSE'
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'MALFORMED_PAYLOAD',
        'FRED payload is not a valid JSON object.',
        'MALFORMED_RESPONSE'
      );
    }

    // Check for provider-level error message in JSON
    if (parsed.error_code || parsed.error_message) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'PROVIDER_REJECTED',
        `FRED API reported error: ${parsed.error_message || parsed.error_code}`,
        'PROVIDER_ERROR'
      );
    }

    // 6. Validate Observations Array
    if (!Array.isArray(parsed.observations) || parsed.observations.length === 0) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'EMPTY_OBSERVATIONS',
        `No observations returned by FRED for series ${normSeriesId}.`,
        'INVALID_DATA'
      );
    }

    const latestRaw: RawFredObservation = parsed.observations[0];

    // 7. Normalize Observation
    const normResult = normalizeFredObservation(seriesDef, latestRaw, currentNow, currentNow);
    if (!normResult.success || !normResult.observation) {
      return this.buildErrorEnvelope(
        normSeriesId,
        key,
        'NORMALIZATION_FAILED',
        normResult.error || 'Failed to normalize observation.',
        'INVALID_DATA'
      );
    }

    const obs = normResult.observation;

    // 8. Build Canonical DataHub Envelope
    const envelope: DataHubEnvelope<NormalizedMacroObservation> = {
      topic: 'macro',
      symbol: normSeriesId,
      key,
      provider: FredConnector.PROVIDER_ID,
      sourceType: 'PUBLIC_API',
      provenance: obs.provenance,
      observedAt: obs.observationTimestamp,
      receivedAt: currentNow,
      ageMs: Math.max(0, currentNow - obs.observationTimestamp),
      ttlMs: seriesDef.maxAgeHoursCurrent * 3600 * 1000,
      freshness: obs.freshness === 'CURRENT' ? 'FRESH' : obs.freshness === 'AGING' ? 'FRESH' : 'STALE',
      isStale: obs.freshness === 'STALE',
      isAvailable: true,
      payload: obs,
    };

    return envelope;
  }

  /**
   * Fetch a bounded historical observation window for a specific series from official FRED API
   * 
   * Invariants:
   * - Bounded: limit is clamped between 1 and MAX_HISTORY_LIMIT (default 20, max 100). Never unlimited.
   * - Deterministic: observations sorted chronologically (ascending date) with deduplication.
   * - Missing "." observations are excluded from numeric observations array, preserving truthfulness.
   * - Fail-closed: returns an UNAVAILABLE envelope on any auth/network/validation error.
   */
  public async fetchHistoricalObservations(
    seriesId: string,
    options?: MacroObservationFetchOptions
  ): Promise<DataHubEnvelope<HistoricalMacroObservations>> {
    const normSeriesId = seriesId.trim().toUpperCase();
    const currentNow = this.now();
    const key = formatDataHubKey({ topic: 'macro', symbol: `${normSeriesId}:history`, provider: FredConnector.PROVIDER_ID });

    // 1. Verify Catalog Definition
    const seriesDef = getMacroSeriesDefinition(normSeriesId);
    if (!seriesDef) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'UNKNOWN_SERIES',
        `Series ${normSeriesId} is not in the official FEF macro series catalog.`,
        'INVALID_DATA'
      );
    }

    // 2. Resolve API Key
    const apiKey = this.resolveApiKey(options);
    if (!apiKey) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'MISSING_API_KEY',
        'FRED_API_KEY is not configured in environment.',
        'AUTHENTICATION'
      );
    }

    // 3. Bound and clamp limit (strictly bounded, default 20, max 100)
    let requestedLimit = options?.limit ?? FredConnector.DEFAULT_HISTORY_LIMIT;
    if (typeof requestedLimit !== 'number' || isNaN(requestedLimit) || requestedLimit < 1) {
      requestedLimit = FredConnector.DEFAULT_HISTORY_LIMIT;
    }
    const boundedLimit = Math.min(Math.floor(requestedLimit), FredConnector.MAX_HISTORY_LIMIT);

    // Fetch descending so limit retrieves the most recent observations
    const url = `${FredConnector.BASE_URL}?series_id=${encodeURIComponent(normSeriesId)}&api_key=${encodeURIComponent(apiKey)}&file_type=json&sort_order=desc&limit=${boundedLimit}`;

    let httpStatus = 0;
    let responseText = '';

    try {
      const res = await this.fetchTransport(url);
      httpStatus = res.status;
      responseText = await res.text();
    } catch (err: any) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'NETWORK_FAILURE',
        `Network transport failure contacting FRED: ${err?.message || 'Connection error'}`,
        'NETWORK'
      );
    }

    // 4. HTTP Status Classification
    if (httpStatus === 401 || httpStatus === 403) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'AUTH_FAILURE',
        'FRED API rejected request with 401/403 (Invalid or unauthorized API key).',
        'AUTHENTICATION'
      );
    }

    if (httpStatus === 429) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'RATE_LIMITED',
        'FRED API rate limit exceeded (HTTP 429).',
        'RATE_LIMIT'
      );
    }

    if (httpStatus >= 500) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'PROVIDER_ERROR',
        `FRED server returned error (HTTP ${httpStatus}).`,
        'PROVIDER_ERROR'
      );
    }

    if (httpStatus !== 200) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'HTTP_ERROR',
        `FRED request failed with HTTP ${httpStatus}.`,
        'PROVIDER_ERROR'
      );
    }

    // 5. Parse JSON
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'MALFORMED_JSON',
        'FRED response was not valid JSON.',
        'MALFORMED_RESPONSE'
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'MALFORMED_PAYLOAD',
        'FRED payload is not a valid JSON object.',
        'MALFORMED_RESPONSE'
      );
    }

    if (parsed.error_code || parsed.error_message) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'PROVIDER_REJECTED',
        `FRED API reported error: ${parsed.error_message || parsed.error_code}`,
        'PROVIDER_ERROR'
      );
    }

    if (!Array.isArray(parsed.observations) || parsed.observations.length === 0) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'EMPTY_OBSERVATIONS',
        `No observations returned by FRED for series ${normSeriesId}.`,
        'INVALID_DATA'
      );
    }

    // 6. Normalize and Filter Observations
    // Deduplicate by date (keep latest occurrence) and sort chronologically (ascending)
    const dateMap = new Map<string, NormalizedMacroObservation>();
    for (const raw of parsed.observations as RawFredObservation[]) {
      // Missing "." or empty is cleanly skipped from numeric history (never converted to 0)
      if (!raw || typeof raw.value !== 'string' || raw.value.trim() === '.' || raw.value.trim() === '') {
        continue;
      }
      const normResult = normalizeFredObservation(seriesDef, raw, currentNow, currentNow);
      if (normResult.success && normResult.observation) {
        dateMap.set(normResult.observation.observationDate, normResult.observation);
      }
    }

    // Sort ascending by observationDate
    const sortedObs = Array.from(dateMap.values()).sort((a, b) => 
      a.observationTimestamp - b.observationTimestamp
    );

    if (sortedObs.length === 0) {
      return this.buildHistoryErrorEnvelope(
        normSeriesId,
        key,
        'NO_VALID_OBSERVATIONS',
        `No valid numeric observations found in FRED response for series ${normSeriesId}.`,
        'INVALID_DATA'
      );
    }

    const latestObs = sortedObs[sortedObs.length - 1];
    const historyPayload: HistoricalMacroObservations = {
      seriesId: seriesDef.seriesId,
      name: seriesDef.name,
      category: seriesDef.category,
      unit: seriesDef.unit,
      provider: FredConnector.PROVIDER_ID,
      source: seriesDef.source,
      provenance: 'INDEPENDENT_VERIFIED',
      observations: sortedObs,
      totalSamples: sortedObs.length,
      startDate: sortedObs[0]?.observationDate,
      endDate: latestObs?.observationDate,
      receivedAt: currentNow,
    };

    return {
      topic: 'macro',
      symbol: `${normSeriesId}:history`,
      key,
      provider: FredConnector.PROVIDER_ID,
      sourceType: 'PUBLIC_API',
      provenance: 'INDEPENDENT_VERIFIED',
      observedAt: latestObs.observationTimestamp,
      receivedAt: currentNow,
      ageMs: Math.max(0, currentNow - latestObs.observationTimestamp),
      ttlMs: seriesDef.maxAgeHoursCurrent * 3600 * 1000,
      freshness: latestObs.freshness === 'CURRENT' ? 'FRESH' : latestObs.freshness === 'AGING' ? 'FRESH' : 'STALE',
      isStale: latestObs.freshness === 'STALE',
      isAvailable: true,
      payload: historyPayload,
    };
  }

  /**
   * Helper to build clean fail-closed error envelopes for history
   */
  private buildHistoryErrorEnvelope(
    seriesId: string,
    key: string,
    errorCode: string,
    errorMessage: string,
    category: ProviderErrorCategory
  ): DataHubEnvelope<HistoricalMacroObservations> {
    const currentNow = this.now();

    const sanitizedMsg = errorMessage
      .replace(/api_key=[^&]+/gi, 'api_key=REDACTED')
      .replace(/key=[^&]+/gi, 'key=REDACTED');

    return {
      topic: 'macro',
      symbol: `${seriesId}:history`,
      key,
      provider: FredConnector.PROVIDER_ID,
      sourceType: 'UNAVAILABLE',
      provenance: 'UNAVAILABLE',
      observedAt: currentNow,
      receivedAt: currentNow,
      ageMs: 0,
      ttlMs: 0,
      freshness: 'UNAVAILABLE',
      isStale: true,
      isAvailable: false,
      payload: null,
      error: {
        code: errorCode,
        message: sanitizedMsg,
        timestamp: currentNow,
        category,
      },
    };
  }

  /**
   * Helper to build clean fail-closed error envelopes without leaking secrets
   */
  private buildErrorEnvelope(
    seriesId: string,
    key: string,
    errorCode: string,
    errorMessage: string,
    category: ProviderErrorCategory
  ): DataHubEnvelope<NormalizedMacroObservation> {
    const currentNow = this.now();

    // Redact any accidental secret pattern in error messages
    const sanitizedMsg = errorMessage
      .replace(/api_key=[^&]+/gi, 'api_key=REDACTED')
      .replace(/key=[^&]+/gi, 'key=REDACTED');

    return {
      topic: 'macro',
      symbol: seriesId,
      key,
      provider: FredConnector.PROVIDER_ID,
      sourceType: 'UNAVAILABLE',
      provenance: 'UNAVAILABLE',
      observedAt: currentNow,
      receivedAt: currentNow,
      ageMs: 0,
      ttlMs: 0,
      freshness: 'UNAVAILABLE',
      isStale: true,
      isAvailable: false,
      payload: null,
      error: {
        code: errorCode,
        message: sanitizedMsg,
        timestamp: currentNow,
        category,
      },
    };
  }
}


