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

import { MacroObservationFetchOptions, NormalizedMacroObservation } from '../types';
import { getMacroSeriesDefinition } from '../catalog/fred-catalog';
import { normalizeFredObservation, RawFredObservation } from '../normalization/fred-normalizer';
import { DataHubEnvelope, formatDataHubKey, ProviderErrorCategory } from '../../datahub/types';

export type HttpFetchFn = (url: string) => Promise<{ status: number; text: () => Promise<string> }>;

export class FredConnector {
  public static readonly PROVIDER_ID = 'fred';
  public static readonly BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

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

