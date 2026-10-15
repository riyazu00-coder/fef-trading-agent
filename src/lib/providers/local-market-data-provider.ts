/**
 * FEF CORTEX — CANONICAL LOCAL MARKET DATA READ LAYER
 *
 * Single authoritative local read path for all FEF CORTEX market intelligence consumers:
 * Trusted Local Node Runtime -> LocalMarketDataProvider -> LocalTelemetryRepository -> fef-cortex.db
 *
 * Architectural Invariants:
 * 1. Storage Authority: LocalTelemetryRepository ($HOME/.fef/data/fef-cortex.db).
 * 2. Price Authority: MT5_BROKER.
 * 3. Provenance: source: 'MT5_BROKER', storage: 'LOCAL_SQLITE'.
 * 4. Zero Fabricated Fallbacks: When SQLite has no data for a symbol/timeframe (e.g. GER40),
 *    returns null / UNAVAILABLE truthfully. Never substitutes public/mock data.
 * 5. Execution Locked: isExecutable: false, executionLock: 'READ_ONLY'.
 * 6. Single Path: No automatic fallback between SQLite and :5558.
 */

import { OHLCCandle, CanonicalMarketSnapshot, ProvenanceTag, VerifiedTimeframe } from '../market/canonical-market-snapshot';
import { CANONICAL_SYMBOL_MAPPINGS } from '../bridge/symbol-mapper';

// Import repository dynamically to support both TS execution and Node CJS runtimes
const {
  LocalTelemetryRepository,
  DEFAULT_DB_PATH,
  TIMEFRAMES: SUPPORTED_TIMEFRAMES,
} = require('../../../scripts/fef-local-telemetry-repository');

export const CANONICAL_26_UNIVERSE = [
  'XAUUSD', 'XAGUSD',
  'US100', 'US30', 'US500', 'GER40', 'UK100', 'JP225',
  'USOIL', 'UKOIL', 'NATGAS',
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY', 'EURGBP',
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'
] as const;

export type CanonicalSymbol = typeof CANONICAL_26_UNIVERSE[number];

export const TIMEFRAME_DURATION_MS: Record<string, number> = {
  M1: 60 * 1000,
  M5: 5 * 60 * 1000,
  M15: 15 * 60 * 1000,
  M30: 30 * 60 * 1000,
  H1: 60 * 60 * 1000,
  H4: 4 * 60 * 60 * 1000,
  D1: 24 * 60 * 60 * 1000,
};

export const MIN_BARS_FOR_AVAILABILITY = 10;

export interface LocalMarketDataHealth {
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  storageMode: 'LOCAL';
  localDatabase: 'ONLINE' | 'OFFLINE';
  quotesCount: number;
  candlesCount: number;
  brokerConnected: boolean;
  broker?: string;
  server?: string;
  feedStatus: 'LIVE' | 'FALLBACK' | 'OFFLINE';
  executionLock: 'READ_ONLY';
  lastPersistenceAgeMs: number | null;
}

export interface NormalizedQuoteItem {
  canonicalSymbol: string;
  brokerSymbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread: number;
  digits: number;
  quoteTimestamp: number;
  ageMs: number;
  freshness: 'FRESH' | 'STALE' | 'SESSION_CLOSED' | 'UNAVAILABLE';
  source: 'MT5_BROKER';
  storage: 'LOCAL_SQLITE';
  isExecutable: false;
}

export type CandleState = 'AVAILABLE' | 'INSUFFICIENT_DATA' | 'STALE' | 'UNAVAILABLE';

export interface NormalizedCandleResult {
  symbol: string;
  timeframe: string;
  count: number;
  state: CandleState;
  candles: OHLCCandle[];
  newestBarTime?: number;
  oldestBarTime?: number;
  source: 'MT5_BROKER';
  storage: 'LOCAL_SQLITE';
  provenance: 'LIVE_MT5';
}

export interface LocalMarketDataProviderConfig {
  repository?: any;
  dbPath?: string;
}

export class LocalMarketDataProvider {
  private repository: any;
  private ownRepo: boolean = false;
  private aliasToCanonicalMap: Map<string, string> = new Map();

  constructor(config?: LocalMarketDataProviderConfig) {
    if (config?.repository) {
      this.repository = config.repository;
    } else {
      const dbPath = config?.dbPath || DEFAULT_DB_PATH;
      this.repository = new LocalTelemetryRepository(dbPath);
      this.ownRepo = true;
    }
    this.buildAliasIndex();
  }

  private buildAliasIndex() {
    this.aliasToCanonicalMap.clear();
    for (const [canonical, aliases] of Object.entries(CANONICAL_SYMBOL_MAPPINGS)) {
      this.aliasToCanonicalMap.set(canonical.toUpperCase(), canonical.toUpperCase());
      for (const alias of aliases) {
        this.aliasToCanonicalMap.set(alias.toUpperCase(), canonical.toUpperCase());
      }
    }
  }

  /**
   * Resolve any input ticker or alias to canonical FEF ticker
   */
  public toCanonicalSymbol(symbol: string): string {
    if (!symbol) return '';
    const upper = symbol.trim().toUpperCase();
    return this.aliasToCanonicalMap.get(upper) || upper;
  }

  /**
   * Get health of local SQLite telemetry repository
   */
  public async getHealth(): Promise<LocalMarketDataHealth> {
    try {
      if (!this.repository || !this.repository.isInitialized) {
        return {
          status: 'OFFLINE',
          storageMode: 'LOCAL',
          localDatabase: 'OFFLINE',
          quotesCount: 0,
          candlesCount: 0,
          brokerConnected: false,
          feedStatus: 'OFFLINE',
          executionLock: 'READ_ONLY',
          lastPersistenceAgeMs: null,
        };
      }

      const hb = this.repository.getLatestHeartbeat();
      const quotes = this.repository.getAllQuotes();
      const candleMetrics = this.repository.getCandleMetrics();
      const connectorState = this.repository.getConnectorState();

      const quotesCount = Object.keys(quotes || {}).length;
      const candlesCount = candleMetrics?.count || 0;
      const isBrokerConnected = Boolean(hb && hb.terminal_connected === 1);

      const now = Date.now();
      const lastPersist = connectorState?.last_local_persist || null;
      const lastPersistenceAgeMs = lastPersist ? Math.max(0, now - lastPersist) : null;

      let feedStatus: 'LIVE' | 'FALLBACK' | 'OFFLINE' = 'OFFLINE';
      if (isBrokerConnected && lastPersistenceAgeMs !== null && lastPersistenceAgeMs < 10000) {
        feedStatus = 'LIVE';
      } else if (quotesCount > 0) {
        feedStatus = 'FALLBACK';
      }

      return {
        status: isBrokerConnected && quotesCount > 0 ? 'ONLINE' : (quotesCount > 0 ? 'DEGRADED' : 'OFFLINE'),
        storageMode: 'LOCAL',
        localDatabase: 'ONLINE',
        quotesCount,
        candlesCount,
        brokerConnected: isBrokerConnected,
        broker: hb?.broker,
        server: hb?.server,
        feedStatus,
        executionLock: 'READ_ONLY',
        lastPersistenceAgeMs,
      };
    } catch {
      return {
        status: 'OFFLINE',
        storageMode: 'LOCAL',
        localDatabase: 'OFFLINE',
        quotesCount: 0,
        candlesCount: 0,
        brokerConnected: false,
        feedStatus: 'OFFLINE',
        executionLock: 'READ_ONLY',
        lastPersistenceAgeMs: null,
      };
    }
  }

  /**
   * Read the latest quote for a canonical or alias symbol
   */
  public async getLatestQuote(symbol: string): Promise<NormalizedQuoteItem | null> {
    if (!symbol) return null;
    const canonical = this.toCanonicalSymbol(symbol);

    try {
      if (!this.repository || !this.repository.isInitialized) return null;

      let raw = this.repository.getLatestQuote(canonical);

      // If not directly found under canonical key, search raw quotes by alias
      if (!raw) {
        const all = this.repository.getAllQuotes();
        if (all) {
          for (const [key, q] of Object.entries(all)) {
            if (this.toCanonicalSymbol(key) === canonical) {
              raw = q;
              break;
            }
          }
        }
      }

      if (!raw || typeof raw.bid !== 'number' || typeof raw.ask !== 'number' || raw.bid <= 0 || raw.ask <= 0) {
        return null;
      }

      const now = Date.now();
      const qTime = raw.quote_timestamp || now;
      const ageMs = Math.max(0, now - qTime);

      let freshness: NormalizedQuoteItem['freshness'] = 'FRESH';
      if (ageMs > 60000) {
        freshness = 'SESSION_CLOSED';
      } else if (ageMs > 10000) {
        freshness = 'STALE';
      }

      return {
        canonicalSymbol: canonical,
        brokerSymbol: raw.symbol || canonical,
        bid: raw.bid,
        ask: raw.ask,
        mid: raw.mid || Number(((raw.bid + raw.ask) / 2).toFixed(5)),
        spread: raw.spread || 0,
        digits: typeof raw.spread === 'number' && raw.spread > 0 ? (raw.bid.toString().split('.')[1] || '').length : 2,
        quoteTimestamp: qTime,
        ageMs,
        freshness,
        source: 'MT5_BROKER',
        storage: 'LOCAL_SQLITE',
        isExecutable: false,
      };
    } catch {
      return null;
    }
  }

  /**
   * Read all available quotes mapped by canonical symbol
   */
  public async getLatestQuotes(): Promise<Record<string, NormalizedQuoteItem>> {
    const result: Record<string, NormalizedQuoteItem> = {};
    try {
      if (!this.repository || !this.repository.isInitialized) return result;
      const all = this.repository.getAllQuotes();
      if (!all) return result;

      const now = Date.now();
      for (const [rawKey, raw] of Object.entries(all)) {
        if (!raw || typeof (raw as any).bid !== 'number' || (raw as any).bid <= 0) continue;
        const canonical = this.toCanonicalSymbol(rawKey);
        const qTime = (raw as any).quote_timestamp || now;
        const ageMs = Math.max(0, now - qTime);

        let freshness: NormalizedQuoteItem['freshness'] = 'FRESH';
        if (ageMs > 60000) {
          freshness = 'SESSION_CLOSED';
        } else if (ageMs > 10000) {
          freshness = 'STALE';
        }

        result[canonical] = {
          canonicalSymbol: canonical,
          brokerSymbol: (raw as any).symbol || rawKey,
          bid: (raw as any).bid,
          ask: (raw as any).ask,
          mid: (raw as any).mid || Number((((raw as any).bid + (raw as any).ask) / 2).toFixed(5)),
          spread: (raw as any).spread || 0,
          digits: 2,
          quoteTimestamp: qTime,
          ageMs,
          freshness,
          source: 'MT5_BROKER',
          storage: 'LOCAL_SQLITE',
          isExecutable: false,
        };
      }
      return result;
    } catch {
      return result;
    }
  }

  /**
   * Retrieve deduplicated historical closed candles in chronological ascending order
   */
  public async getCandles(
    symbol: string,
    timeframe: string = 'H1',
    limit: number = 50
  ): Promise<NormalizedCandleResult> {
    const canonical = this.toCanonicalSymbol(symbol);
    const normTf = (timeframe || 'H1').toUpperCase();

    const emptyResult: NormalizedCandleResult = {
      symbol: canonical,
      timeframe: normTf,
      count: 0,
      state: 'UNAVAILABLE',
      candles: [],
      source: 'MT5_BROKER',
      storage: 'LOCAL_SQLITE',
      provenance: 'LIVE_MT5',
    };

    if (!symbol || !canonical) return emptyResult;

    try {
      if (!this.repository || !this.repository.isInitialized) return emptyResult;

      let rows = this.repository.getCandles(canonical, normTf, limit);

      // If no rows, try checking broker alias
      if ((!rows || rows.length === 0) && CANONICAL_SYMBOL_MAPPINGS[canonical]) {
        for (const alias of CANONICAL_SYMBOL_MAPPINGS[canonical]) {
          const aliasRows = this.repository.getCandles(alias, normTf, limit);
          if (aliasRows && aliasRows.length > 0) {
            rows = aliasRows;
            break;
          }
        }
      }

      if (!rows || rows.length === 0) {
        return emptyResult;
      }

      const count = rows.length;
      const oldestBarTime = rows[0]?.timestamp;
      const newestBarTime = rows[count - 1]?.timestamp;

      // Evaluate availability & freshness
      let state: CandleState = 'AVAILABLE';
      if (count < MIN_BARS_FOR_AVAILABILITY) {
        state = 'INSUFFICIENT_DATA';
      } else {
        const tfDuration = TIMEFRAME_DURATION_MS[normTf] || (60 * 60 * 1000);
        const staleThresholdMs = tfDuration * 3;
        const now = Date.now();
        const candleAgeMs = now - (newestBarTime + tfDuration);

        if (candleAgeMs > staleThresholdMs) {
          state = 'STALE';
        }
      }

      return {
        symbol: canonical,
        timeframe: normTf,
        count,
        state,
        candles: rows.map((r: any) => ({
          timestamp: r.timestamp,
          open: r.open,
          high: r.high,
          low: r.low,
          close: r.close,
          tickVolume: r.tickVolume || 0,
        })),
        newestBarTime,
        oldestBarTime,
        source: 'MT5_BROKER',
        storage: 'LOCAL_SQLITE',
        provenance: 'LIVE_MT5',
      };
    } catch {
      return emptyResult;
    }
  }

  /**
   * Deterministic Freshness Breakdown for an asset
   */
  public async getFreshness(symbol: string): Promise<{
    quoteFreshness: string;
    candleFreshness: Record<string, string>;
  }> {
    const canonical = this.toCanonicalSymbol(symbol);
    const quote = await this.getLatestQuote(canonical);
    const quoteFreshness = quote?.freshness || 'UNAVAILABLE';

    const candleFreshness: Record<string, string> = {};
    const tfs = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

    for (const tf of tfs) {
      const cRes = await this.getCandles(canonical, tf, 15);
      if (cRes.state === 'UNAVAILABLE' || cRes.count === 0) {
        candleFreshness[tf] = 'UNAVAILABLE';
      } else if (cRes.state === 'STALE') {
        candleFreshness[tf] = 'STALE';
      } else if (cRes.state === 'INSUFFICIENT_DATA') {
        candleFreshness[tf] = 'INSUFFICIENT_DATA';
      } else {
        candleFreshness[tf] = 'FRESH';
      }
    }

    return {
      quoteFreshness,
      candleFreshness,
    };
  }

  /**
   * Get all symbols that actually have stored quotes or candles in SQLite
   */
  public async getAvailableSymbols(): Promise<string[]> {
    try {
      if (!this.repository || !this.repository.isInitialized) return [];

      const quotes = this.repository.getAllQuotes() || {};
      const found = new Set<string>();

      for (const rawSym of Object.keys(quotes)) {
        const can = this.toCanonicalSymbol(rawSym);
        if (can) found.add(can);
      }

      // Also check candle_snapshot if supported
      try {
        const stmt = this.repository.db.prepare('SELECT DISTINCT canonical_symbol FROM candle_snapshot');
        const rows = stmt.all();
        for (const r of rows) {
          const can = this.toCanonicalSymbol((r as any).canonical_symbol);
          if (can) found.add(can);
        }
      } catch {}

      return Array.from(found).sort();
    } catch {
      return [];
    }
  }

  /**
   * Synthesize CanonicalMarketSnapshot from SQLite quote and verified candles
   */
  public async getMarketSnapshot(symbol: string): Promise<CanonicalMarketSnapshot | null> {
    const canonical = this.toCanonicalSymbol(symbol);
    const quote = await this.getLatestQuote(canonical);
    if (!quote) return null;

    const now = Date.now();
    const makeTag = (val: number | null, isVer: boolean): ProvenanceTag => ({
      value: val,
      source: 'MT5_BROKER',
      classification: isVer ? 'VERIFIED_LIVE' : 'UNAVAILABLE',
      timestamp: quote.quoteTimestamp,
      freshnessMs: quote.ageMs,
    });

    // Load available timeframes
    const timeframes: Record<string, VerifiedTimeframe> = {};
    const tfs: ('M5' | 'M15' | 'H1' | 'H4' | 'D1')[] = ['M5', 'M15', 'H1', 'H4', 'D1'];
    let hasSufficient = false;

    for (const tf of tfs) {
      const cRes = await this.getCandles(canonical, tf, 50);
      if (cRes.state === 'AVAILABLE' && cRes.count >= MIN_BARS_FOR_AVAILABILITY) {
        hasSufficient = true;
        timeframes[tf] = {
          timeframe: tf,
          candles: cRes.candles,
          count: cRes.count,
          updatedAt: cRes.newestBarTime || now,
          ageMs: now - (cRes.newestBarTime || now),
          state: 'VERIFIED',
          minCandlesForIndicators: MIN_BARS_FOR_AVAILABILITY,
        };
      }
    }

    return {
      symbol: canonical,
      capturedAt: now,
      brokerBid: makeTag(quote.bid, true),
      brokerAsk: makeTag(quote.ask, true),
      brokerMid: makeTag(quote.mid, true),
      spread: makeTag(quote.spread, true),
      quoteAgeMs: quote.ageMs,
      priceAuthority: 'MT5_BROKER',
      sessionState: quote.freshness === 'SESSION_CLOSED' ? 'SESSION_CLOSED' : 'OPEN',
      tradeExecutable: false, // Invariant: READ_ONLY
      timeframes,
      indicators: {},
      hasLiveQuote: quote.freshness === 'FRESH',
      hasSufficientCandles: hasSufficient,
      readyForStructureAnalysis: hasSufficient && quote.freshness !== 'UNAVAILABLE',
    };
  }

  /**
   * Get CanonicalEvidenceBundle directly from LocalMarketDataProvider
   */
  public async getCanonicalEvidenceBundle(
    symbol: string,
    options?: { evaluationTime?: Date; feeds?: any }
  ): Promise<any> {
    const { buildCanonicalEvidenceBundle } = require('../evidence/canonical-evidence-bundle');
    return buildCanonicalEvidenceBundle(this, symbol, options);
  }

  /**
   * Assembles authoritative local market evidence into a complete AssetIntelligenceProfile
   * for consumption by agent orchestration and decision engines.
   */
  public async assembleLocalAssetIntelligence(
    symbol: string,
    timeframe: string = 'H1'
  ): Promise<any | null> {
    const canonical = this.toCanonicalSymbol(symbol);
    const quote = await this.getLatestQuote(canonical);
    if (!quote) return null;

    // Build canonical evidence bundle for this asset
    const { buildCanonicalEvidenceBundle } = require('../evidence/canonical-evidence-bundle');
    const evidenceBundle = await buildCanonicalEvidenceBundle(this, canonical, {
      evaluationTime: new Date()
    });

    // Load available timeframes from SQLite
    const bundle: Record<string, OHLCCandle[]> = {};
    const tfs = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
    let dominantCandles: OHLCCandle[] = [];

    for (const tf of tfs) {
      const cRes = await this.getCandles(canonical, tf, 60);
      if (cRes.candles && cRes.candles.length > 0) {
        bundle[tf] = cRes.candles;
        if (tf === timeframe.toUpperCase()) {
          dominantCandles = cRes.candles;
        }
      }
    }

    if (dominantCandles.length === 0 && bundle['H1']) {
      dominantCandles = bundle['H1'];
    }

    // Construct LiveMarketAsset normalized from MT5 SQLite quote
    const { getMarketDefinition } = require('../registry/market-registry');
    const marketDef = getMarketDefinition(canonical);

    const liveAsset: any = {
      symbol: canonical,
      name: marketDef?.displayName || canonical,
      price: quote.mid,
      bid: quote.bid,
      ask: quote.ask,
      spread: quote.spread,
      change24h: 0,
      high24h: quote.mid,
      low24h: quote.mid,
      volume: 'MT5 Broker Feed',
      sparkline: '',
      source: 'MT5_BROKER',
      provider: 'MT5_BROKER_BRIDGE',
      lastUpdated: new Date(quote.quoteTimestamp).toISOString(),
      category: marketDef?.category || 'FOREX',
      feedStatus: quote.freshness === 'FRESH' ? 'LIVE' : (quote.freshness === 'STALE' ? 'DATA LIMITED' : 'OFFLINE'),
      classification: 'LIVE_MT5',
    };

    const { generateAssetIntelligence } = require('../agents/multi-asset-pipeline');
    return generateAssetIntelligence(
      canonical,
      liveAsset,
      timeframe,
      bundle,
      'LIVE_MT5',
      'Exness MT5 Broker (Local SQLite)',
      new Date(),
      undefined,
      evidenceBundle
    );
  }

  public close() {
    if (this.ownRepo && this.repository) {
      try {
        this.repository.close();
      } catch {}
    }
  }
}

// Global default singleton
let defaultProvider: LocalMarketDataProvider | null = null;

export function getLocalMarketDataProvider(): LocalMarketDataProvider {
  if (!defaultProvider) {
    defaultProvider = new LocalMarketDataProvider();
  }
  return defaultProvider;
}

// CommonJS export support for Node test scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LocalMarketDataProvider,
    getLocalMarketDataProvider,
    CANONICAL_26_UNIVERSE,
    TIMEFRAME_DURATION_MS,
    MIN_BARS_FOR_AVAILABILITY,
  };
}
