/**
 * FEF TRADING SOLUTIONS — PERSISTENT TELEMETRY REPOSITORY
 *
 * Server-side durable telemetry abstraction backed by Upstash Redis REST API
 * (using KV_REST_API_URL and KV_REST_API_TOKEN) with memory fallback for test environments.
 *
 * Implements:
 * - Atomic replay protection (SET NX EX)
 * - Heartbeat persistence with 10s TTL
 * - Account status persistence
 * - Quotes persistence with 15s TTL
 * - Candle persistence with timeframe-aware TTL (hours/days, not deleted on heartbeat expiry)
 */

import {
  AccountStatusPayload,
  CandleSnapshotPayload,
  ClosedCandleItem,
  HeartbeatPayload,
  QuoteItem,
} from './telemetry-contract';

export interface StoredRecord<T> {
  data: T;
  deviceId: string;
  capturedAt: string;
  receivedAt: string;
  sequence: number;
}

export interface TelemetryConfig {
  heartbeatTtlSec: number;
  quoteTtlSec: number;
  nonceTtlSec: number;
}

export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  heartbeatTtlSec: 15, // Mark disconnected if no heartbeat for 15s
  quoteTtlSec: 30, // Quotes expire if older than 30s
  nonceTtlSec: 60, // Nonce stored for 60s (must exceed 15s timestamp tolerance)
};

export class TelemetryRepository {
  private kvUrl: string;
  private kvToken: string;
  private config: TelemetryConfig;

  // In-memory test fallback store (used ONLY when Redis is not configured, e.g. in local mock unit tests)
  private memoryStore: Map<string, { value: any; expiresAt: number }> = new Map();

  constructor(
    kvUrl?: string,
    kvToken?: string,
    config: TelemetryConfig = DEFAULT_TELEMETRY_CONFIG
  ) {
    this.kvUrl = (kvUrl || process.env.KV_REST_API_URL || '').replace(/\/$/, '');
    this.kvToken = (kvToken || process.env.KV_REST_API_TOKEN || '').trim();
    this.config = config;
  }

  public isCloudStoreConfigured(): boolean {
    return Boolean(this.kvUrl && this.kvToken);
  }

  /**
   * Execute raw Upstash Redis command via REST API
   */
  private async execRedisCommand(command: string[]): Promise<any> {
    if (!this.isCloudStoreConfigured()) {
      return this.execMemoryCommand(command);
    }

    const res = await fetch(`${this.kvUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.kvToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!res.ok) {
      throw new Error(`Upstash Redis HTTP error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`Upstash Redis error: ${data.error}`);
    }

    return data.result;
  }

  /**
   * Test-only memory fallback implementation
   */
  private execMemoryCommand(command: string[]): any {
    const now = Date.now();
    const [cmd, key, arg1, arg2, arg3] = command;

    switch (cmd.toUpperCase()) {
      case 'SET': {
        const value = arg1;
        let ttlMs = 0;
        let nx = false;

        for (let i = 2; i < command.length; i++) {
          if (command[i].toUpperCase() === 'EX') {
            ttlMs = parseInt(command[i + 1], 10) * 1000;
          }
          if (command[i].toUpperCase() === 'NX') {
            nx = true;
          }
        }

        const existing = this.memoryStore.get(key);
        if (nx && existing && existing.expiresAt > now) {
          return null; // Already exists
        }

        this.memoryStore.set(key, {
          value,
          expiresAt: ttlMs > 0 ? now + ttlMs : Infinity,
        });
        return 'OK';
      }

      case 'GET': {
        const item = this.memoryStore.get(key);
        if (!item) return null;
        if (item.expiresAt <= now) {
          this.memoryStore.delete(key);
          return null;
        }
        return item.value;
      }

      case 'MGET': {
        const keys = command.slice(1);
        return keys.map((k) => {
          const it = this.memoryStore.get(k);
          if (!it || it.expiresAt <= now) return null;
          return it.value;
        });
      }

      case 'DEL': {
        const existed = this.memoryStore.delete(key);
        return existed ? 1 : 0;
      }

      default:
        throw new Error(`Unsupported memory command: ${cmd}`);
    }
  }

  // =========================================================================
  // REPLAY PROTECTION (ATOMIC NONCE CONSUMPTION)
  // =========================================================================

  /**
   * Consume a nonce atomically.
   * Returns true if the nonce is fresh and recorded successfully.
   * Returns false if the nonce was already consumed (replay detected).
   */
  public async consumeNonce(deviceId: string, nonce: string): Promise<boolean> {
    const key = `cortex:telemetry:v1:nonce:${deviceId}:${nonce}`;
    // SET key 1 EX ttl NX (Set if Not eXists with EXpiry)
    const result = await this.execRedisCommand([
      'SET',
      key,
      '1',
      'EX',
      String(this.config.nonceTtlSec),
      'NX',
    ]);
    return result === 'OK';
  }

  // =========================================================================
  // HEARTBEAT
  // =========================================================================

  public async saveHeartbeat(
    deviceId: string,
    capturedAt: string,
    sequence: number,
    payload: HeartbeatPayload
  ): Promise<void> {
    const key = `cortex:telemetry:v1:heartbeat:${deviceId}`;
    const latestKey = `cortex:telemetry:v1:heartbeat:latest`;
    const record: StoredRecord<HeartbeatPayload> = {
      data: payload,
      deviceId,
      capturedAt,
      receivedAt: new Date().toISOString(),
      sequence,
    };
    const jsonStr = JSON.stringify(record);

    await this.execRedisCommand(['SET', key, jsonStr, 'EX', String(this.config.heartbeatTtlSec)]);
    await this.execRedisCommand(['SET', latestKey, jsonStr, 'EX', String(this.config.heartbeatTtlSec)]);
  }

  public async getLatestHeartbeat(): Promise<StoredRecord<HeartbeatPayload> | null> {
    const key = `cortex:telemetry:v1:heartbeat:latest`;
    const result = await this.execRedisCommand(['GET', key]);
    if (!result) return null;
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }

  // =========================================================================
  // ACCOUNT STATUS
  // =========================================================================

  public async saveAccountStatus(
    deviceId: string,
    capturedAt: string,
    sequence: number,
    payload: AccountStatusPayload
  ): Promise<void> {
    const key = `cortex:telemetry:v1:account:latest`;
    const record: StoredRecord<AccountStatusPayload> = {
      data: payload,
      deviceId,
      capturedAt,
      receivedAt: new Date().toISOString(),
      sequence,
    };
    // Account info kept for up to 60s
    await this.execRedisCommand(['SET', key, JSON.stringify(record), 'EX', '60']);
  }

  public async getLatestAccountStatus(): Promise<StoredRecord<AccountStatusPayload> | null> {
    const key = `cortex:telemetry:v1:account:latest`;
    const result = await this.execRedisCommand(['GET', key]);
    if (!result) return null;
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }

  // =========================================================================
  // QUOTE SNAPSHOTS
  // =========================================================================

  /**
   * Canonical versioned key for the quote symbol index.
   * Stores a JSON array of symbol strings from the most recent QUOTE_SNAPSHOT.
   * TTL is aligned with quoteTtlSec so the index cannot outlive the quote data.
   */
  private static readonly QUOTE_INDEX_KEY = 'cortex:telemetry:v1:quote:index';

  public async saveQuoteSnapshot(
    deviceId: string,
    capturedAt: string,
    sequence: number,
    quotes: QuoteItem[]
  ): Promise<void> {
    const receivedAt = new Date().toISOString();

    // Persist individual quote records
    for (const q of quotes) {
      const key = `cortex:telemetry:v1:quote:${q.symbol}`;
      const record: StoredRecord<QuoteItem> = {
        data: q,
        deviceId,
        capturedAt,
        receivedAt,
        sequence,
      };
      await this.execRedisCommand(['SET', key, JSON.stringify(record), 'EX', String(this.config.quoteTtlSec)]);
    }

    // Persist a quote-symbol index so getLatestQuotes() can enumerate without KEYS/SCAN.
    // TTL matches quoteTtlSec — the index is invalidated at the same time as quote data.
    if (quotes.length > 0) {
      const symbols = quotes.map((q) => q.symbol);
      await this.execRedisCommand([
        'SET',
        TelemetryRepository.QUOTE_INDEX_KEY,
        JSON.stringify(symbols),
        'EX',
        String(this.config.quoteTtlSec),
      ]);
    }
  }

  public async getLatestQuote(symbol: string): Promise<StoredRecord<QuoteItem> | null> {
    const key = `cortex:telemetry:v1:quote:${symbol}`;
    const result = await this.execRedisCommand(['GET', key]);
    if (!result) return null;
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }

  /**
   * Retrieve all currently persisted quote records using the persistent quote-symbol index.
   *
   * Algorithm (no Redis KEYS/SCAN):
   *  1. Read the index key to obtain the list of canonical symbols.
   *  2. Bulk-fetch all per-symbol quote keys with a single MGET command.
   *  3. Deserialize, discard missing/expired/malformed entries.
   *  4. Return a map of { symbol → StoredRecord<QuoteItem> }.
   *
   * Returns {} when the index is absent, empty, or all quotes have expired.
   * Never synthesizes a quote, never reuses expired data, fails closed on errors.
   */
  public async getLatestQuotes(): Promise<Record<string, StoredRecord<QuoteItem>>> {
    try {
      // Step 1: read symbol index
      const indexRaw = await this.execRedisCommand(['GET', TelemetryRepository.QUOTE_INDEX_KEY]);
      if (!indexRaw) return {};

      let symbols: string[];
      try {
        symbols = JSON.parse(indexRaw);
      } catch {
        return {}; // malformed index — fail closed
      }

      if (!Array.isArray(symbols) || symbols.length === 0) return {};

      // Defensive: limit to a sane bound to guard against oversized index
      const bounded = symbols.slice(0, 50);

      // Step 2: bulk-fetch all per-symbol keys with MGET (single round trip)
      const quoteKeys = bounded.map((sym) => `cortex:telemetry:v1:quote:${sym}`);
      const results: (string | null)[] = await this.execRedisCommand(['MGET', ...quoteKeys]);

      // Step 3: deserialize; skip missing/expired/malformed entries
      const output: Record<string, StoredRecord<QuoteItem>> = {};
      for (let i = 0; i < bounded.length; i++) {
        const raw = results[i];
        if (!raw) continue; // key expired or absent
        try {
          const record: StoredRecord<QuoteItem> = JSON.parse(raw);
          // Basic structural integrity check — must have non-null data with numeric bid/ask
          if (
            record &&
            record.data &&
            typeof record.data.symbol === 'string' &&
            typeof record.data.bid === 'number' &&
            typeof record.data.ask === 'number' &&
            isFinite(record.data.bid) &&
            isFinite(record.data.ask)
          ) {
            output[record.data.symbol] = record;
          }
        } catch {
          // malformed JSON — discard silently (fail closed)
        }
      }

      return output;
    } catch {
      // Storage/network error — fail closed, return empty map
      return {};
    }
  }

  // =========================================================================
  // CANDLE SNAPSHOTS
  // =========================================================================

  public async saveCandleSnapshot(
    deviceId: string,
    capturedAt: string,
    sequence: number,
    payload: CandleSnapshotPayload
  ): Promise<void> {
    const key = `cortex:telemetry:v1:candles:${payload.canonicalSymbol}:${payload.timeframe}`;
    const record: StoredRecord<CandleSnapshotPayload> = {
      data: payload,
      deviceId,
      capturedAt,
      receivedAt: new Date().toISOString(),
      sequence,
    };
    // Timeframe-aware TTL (closed historical candles remain valid longer)
    // M1/M5: 2 hours, M15/M30: 6 hours, H1/H4: 24 hours, D1: 7 days
    let ttlSec = 86400; // default 24h
    if (payload.timeframe === 'M1' || payload.timeframe === 'M5') ttlSec = 7200;
    else if (payload.timeframe === 'M15' || payload.timeframe === 'M30') ttlSec = 21600;
    else if (payload.timeframe === 'D1') ttlSec = 604800;

    await this.execRedisCommand(['SET', key, JSON.stringify(record), 'EX', String(ttlSec)]);
  }

  public async getLatestCandles(
    symbol: string,
    timeframe: string
  ): Promise<StoredRecord<CandleSnapshotPayload> | null> {
    const key = `cortex:telemetry:v1:candles:${symbol}:${timeframe}`;
    const result = await this.execRedisCommand(['GET', key]);
    if (!result) return null;
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }
}

// Global singleton instance for production serverless execution
export const telemetryRepository = new TelemetryRepository();
