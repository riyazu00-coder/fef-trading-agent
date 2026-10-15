#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — LOCAL-FIRST TELEMETRY REPOSITORY
 *
 * Persistent local SQLite telemetry repository utilizing Node.js v24 native
 * `node:sqlite` (DatabaseSync) engine.
 *
 * Features:
 * - Zero external npm dependencies
 * - WAL mode with NORMAL durability-safe synchronous policy
 * - Idempotent schema migrations
 * - Atomic multi-table telemetry transaction per poll cycle
 * - Single UPSERT row per canonical quote symbol (Zero amplification)
 * - Deduplicated closed candle storage indexed by (canonical_symbol, timeframe, open_time)
 * - Safe filesystem isolation at $HOME/.fef/data/fef-cortex.db (0700 dir, 0600 file)
 * - Zero authentication credentials or order execution logic
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DEFAULT_FEF_DIR = path.resolve(process.env.HOME || os.homedir(), '.fef');
const DEFAULT_DATA_DIR = path.resolve(DEFAULT_FEF_DIR, 'data');
const DEFAULT_DB_PATH = path.resolve(DEFAULT_DATA_DIR, 'fef-cortex.db');

const SCHEMA_VERSION = '1.0.0';

class LocalTelemetryRepository {
  /**
   * @param {Object} options
   * @param {string} [options.dbPath] - Custom db path, or ':memory:' for tests
   * @param {boolean} [options.readonly] - Open in read-only mode if supported
   */
  constructor(options = {}) {
    const customPath = typeof options === 'string' ? options : (options && options.dbPath);
    this.dbPath = customPath || process.env.FEF_SQLITE_DB_PATH || DEFAULT_DB_PATH;
    this.isMemory = this.dbPath === ':memory:';
    this.db = null;
    this.statements = {};
    this.isInitialized = false;

    this.init();
  }

  /**
   * Ensure directory structure with strict permissions (0700)
   */
  ensureDirectories() {
    if (this.isMemory) return;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    // Also enforce 0700 on parent .fef if present
    const parentDir = path.dirname(dir);
    try {
      if (fs.existsSync(parentDir)) fs.chmodSync(parentDir, 0o700);
      if (fs.existsSync(dir)) fs.chmodSync(dir, 0o700);
    } catch {}
  }

  /**
   * Initialize SQLite connection and apply pragmas and schema
   */
  init() {
    if (this.isInitialized && this.db) return;

    try {
      this.ensureDirectories();

      const fileExisted = !this.isMemory && fs.existsSync(this.dbPath);
      this.db = new DatabaseSync(this.dbPath);

      // If new file created on disk, enforce 0600 permissions
      if (!this.isMemory && !fileExisted && fs.existsSync(this.dbPath)) {
        try { fs.chmodSync(this.dbPath, 0o600); } catch {}
      }

      // Apply performance & durability PRAGMAs
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
      `);

      // Run migrations
      this.migrate();

      // Prepare statements for high efficiency
      this.prepareStatements();

      this.isInitialized = true;
    } catch (err) {
      this.isInitialized = false;
      this.initError = err.message;
      if (this.db) {
        try { this.db.close(); } catch {}
        this.db = null;
      }
    }
  }

  /**
   * Idempotent schema migration
   */
  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS terminal_heartbeat (
        device_id TEXT PRIMARY KEY,
        terminal_build INTEGER NOT NULL,
        broker TEXT NOT NULL,
        server TEXT NOT NULL,
        magic_number INTEGER NOT NULL,
        heartbeat_interval_sec INTEGER NOT NULL,
        operating_mode TEXT NOT NULL,
        active_symbols_count INTEGER NOT NULL,
        quotes_count INTEGER NOT NULL,
        terminal_connected INTEGER NOT NULL,
        captured_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        sequence INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS account_snapshot (
        device_id TEXT PRIMARY KEY,
        masked_login TEXT NOT NULL,
        broker TEXT NOT NULL,
        server TEXT NOT NULL,
        currency TEXT NOT NULL,
        trade_mode TEXT NOT NULL,
        leverage REAL NOT NULL,
        balance REAL NOT NULL,
        equity REAL NOT NULL,
        margin REAL NOT NULL,
        free_margin REAL NOT NULL,
        margin_level REAL NOT NULL,
        operating_mode TEXT NOT NULL,
        trade_allowed INTEGER NOT NULL,
        captured_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        sequence INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quote_snapshot (
        symbol TEXT PRIMARY KEY,
        bid REAL NOT NULL,
        ask REAL NOT NULL,
        mid REAL NOT NULL,
        spread REAL NOT NULL,
        quote_timestamp INTEGER NOT NULL,
        captured_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        device_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS candle_snapshot (
        canonical_symbol TEXT NOT NULL,
        broker_symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        open_time INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        tick_volume REAL NOT NULL DEFAULT 0,
        provider TEXT NOT NULL DEFAULT 'MT5_BROKER_BRIDGE',
        received_at TEXT NOT NULL,
        PRIMARY KEY (canonical_symbol, timeframe, open_time)
      );

      CREATE INDEX IF NOT EXISTS idx_candles_lookup
      ON candle_snapshot (canonical_symbol, timeframe, open_time DESC);

      CREATE TABLE IF NOT EXISTS connector_state (
        device_id TEXT PRIMARY KEY,
        last_bridge_heartbeat INTEGER,
        last_local_persist INTEGER,
        last_error TEXT,
        state TEXT NOT NULL,
        storage_mode TEXT NOT NULL DEFAULT 'LOCAL',
        consecutive_errors INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
    `);

    // Record or update schema version
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO schema_metadata (key, value, updated_at)
      VALUES ('version', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(SCHEMA_VERSION, now);
  }

  /**
   * Pre-compile SQL statements for maximum execution speed
   */
  prepareStatements() {
    this.statements.upsertHeartbeat = this.db.prepare(`
      INSERT INTO terminal_heartbeat (
        device_id, terminal_build, broker, server, magic_number,
        heartbeat_interval_sec, operating_mode, active_symbols_count,
        quotes_count, terminal_connected, captured_at, received_at, sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        terminal_build = excluded.terminal_build,
        broker = excluded.broker,
        server = excluded.server,
        magic_number = excluded.magic_number,
        heartbeat_interval_sec = excluded.heartbeat_interval_sec,
        operating_mode = excluded.operating_mode,
        active_symbols_count = excluded.active_symbols_count,
        quotes_count = excluded.quotes_count,
        terminal_connected = excluded.terminal_connected,
        captured_at = excluded.captured_at,
        received_at = excluded.received_at,
        sequence = excluded.sequence
    `);

    this.statements.upsertAccount = this.db.prepare(`
      INSERT INTO account_snapshot (
        device_id, masked_login, broker, server, currency, trade_mode,
        leverage, balance, equity, margin, free_margin, margin_level,
        operating_mode, trade_allowed, captured_at, received_at, sequence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        masked_login = excluded.masked_login,
        broker = excluded.broker,
        server = excluded.server,
        currency = excluded.currency,
        trade_mode = excluded.trade_mode,
        leverage = excluded.leverage,
        balance = excluded.balance,
        equity = excluded.equity,
        margin = excluded.margin,
        free_margin = excluded.free_margin,
        margin_level = excluded.margin_level,
        operating_mode = excluded.operating_mode,
        trade_allowed = excluded.trade_allowed,
        captured_at = excluded.captured_at,
        received_at = excluded.received_at,
        sequence = excluded.sequence
    `);

    this.statements.upsertQuote = this.db.prepare(`
      INSERT INTO quote_snapshot (
        symbol, bid, ask, mid, spread, quote_timestamp,
        captured_at, received_at, sequence, device_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        bid = excluded.bid,
        ask = excluded.ask,
        mid = excluded.mid,
        spread = excluded.spread,
        quote_timestamp = excluded.quote_timestamp,
        captured_at = excluded.captured_at,
        received_at = excluded.received_at,
        sequence = excluded.sequence,
        device_id = excluded.device_id
    `);

    this.statements.insertCandle = this.db.prepare(`
      INSERT OR IGNORE INTO candle_snapshot (
        canonical_symbol, broker_symbol, timeframe, open_time,
        open, high, low, close, tick_volume, provider, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.statements.upsertConnectorState = this.db.prepare(`
      INSERT INTO connector_state (
        device_id, last_bridge_heartbeat, last_local_persist,
        last_error, state, storage_mode, consecutive_errors, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        last_bridge_heartbeat = excluded.last_bridge_heartbeat,
        last_local_persist = excluded.last_local_persist,
        last_error = excluded.last_error,
        state = excluded.state,
        storage_mode = excluded.storage_mode,
        consecutive_errors = excluded.consecutive_errors,
        updated_at = excluded.updated_at
    `);

    this.statements.selectHeartbeat = this.db.prepare(`
      SELECT * FROM terminal_heartbeat ORDER BY sequence DESC LIMIT 1
    `);

    this.statements.selectAccount = this.db.prepare(`
      SELECT * FROM account_snapshot ORDER BY sequence DESC LIMIT 1
    `);

    this.statements.selectQuote = this.db.prepare(`
      SELECT * FROM quote_snapshot WHERE symbol = ?
    `);

    this.statements.selectAllQuotes = this.db.prepare(`
      SELECT * FROM quote_snapshot ORDER BY symbol ASC
    `);

    this.statements.selectCandles = this.db.prepare(`
      SELECT * FROM (
        SELECT * FROM candle_snapshot
        WHERE canonical_symbol = ? AND timeframe = ?
        ORDER BY open_time DESC
        LIMIT ?
      ) ORDER BY open_time ASC
    `);

    this.statements.selectConnectorState = this.db.prepare(`
      SELECT * FROM connector_state ORDER BY updated_at DESC LIMIT 1
    `);

    this.statements.countCandles = this.db.prepare(`
      SELECT COUNT(*) as count FROM candle_snapshot
    `);

    this.statements.candleTimeRange = this.db.prepare(`
      SELECT MIN(open_time) as oldest, MAX(open_time) as newest FROM candle_snapshot
    `);

    this.statements.pruneOldCandles = this.db.prepare(`
      DELETE FROM candle_snapshot
      WHERE canonical_symbol = ? AND timeframe = ? AND open_time NOT IN (
        SELECT open_time FROM candle_snapshot
        WHERE canonical_symbol = ? AND timeframe = ?
        ORDER BY open_time DESC
        LIMIT ?
      )
    `);
  }

  /**
   * Health check
   */
  isHealthy() {
    try {
      if (!this.db) return false;
      const res = this.db.prepare('SELECT 1 as alive').get();
      return Boolean(res && res.alive === 1);
    } catch {
      return false;
    }
  }

  /**
   * Save Heartbeat
   */
  saveHeartbeat(deviceId, capturedAt, sequence, payload) {
    const receivedAt = new Date().toISOString();
    return this.statements.upsertHeartbeat.run(
      deviceId,
      payload.terminalBuild || 5000,
      payload.broker || 'UNKNOWN',
      payload.server || 'UNKNOWN',
      payload.magicNumber || 8882026,
      payload.heartbeatIntervalSec || 2,
      payload.operatingMode || 'READ_ONLY',
      payload.activeSymbolsCount || 0,
      payload.quotesCount || 0,
      payload.terminalConnected ? 1 : 0,
      capturedAt,
      receivedAt,
      sequence
    );
  }

  /**
   * Save Account Status
   */
  saveAccountStatus(deviceId, capturedAt, sequence, payload) {
    const receivedAt = new Date().toISOString();
    return this.statements.upsertAccount.run(
      deviceId,
      payload.maskedLogin || '00***00',
      payload.broker || 'UNKNOWN',
      payload.server || 'UNKNOWN',
      payload.currency || 'USD',
      payload.tradeMode || 'DEMO',
      payload.leverage || 100,
      payload.balance || 0,
      payload.equity || 0,
      payload.margin || 0,
      payload.freeMargin || 0,
      payload.marginLevel || 0,
      payload.operatingMode || 'READ_ONLY',
      payload.tradeAllowed ? 1 : 0,
      capturedAt,
      receivedAt,
      sequence
    );
  }

  /**
   * Save Batch Quotes (Atomic UPSERT)
   */
  saveQuotes(quotes, deviceId, capturedAt, sequence) {
    if (!Array.isArray(quotes) || quotes.length === 0) return 0;
    const receivedAt = new Date().toISOString();
    let saved = 0;
    for (const q of quotes) {
      if (!q || !q.symbol || typeof q.bid !== 'number' || typeof q.ask !== 'number') continue;
      const mid = Number(((q.bid + q.ask) / 2).toFixed(5));
      const spread = typeof q.spread === 'number' ? q.spread : Math.round((q.ask - q.bid) * 10000);
      const ts = q.timestamp || Date.now();
      this.statements.upsertQuote.run(
        q.symbol.toUpperCase(),
        q.bid,
        q.ask,
        mid,
        spread,
        ts,
        capturedAt,
        receivedAt,
        sequence,
        deviceId
      );
      saved++;
    }
    return saved;
  }

  /**
   * Save Closed Candles (Deduplicated with INSERT OR IGNORE)
   */
  saveCandles(canonicalSymbol, brokerSymbol, timeframe, candles) {
    if (!Array.isArray(candles) || candles.length === 0) return 0;
    const receivedAt = new Date().toISOString();
    const canSym = canonicalSymbol.toUpperCase();
    const brkSym = (brokerSymbol || canonicalSymbol).toUpperCase();
    const tf = timeframe.toUpperCase();
    let inserted = 0;

    for (const c of candles) {
      if (!c || typeof c.timestamp !== 'number' || c.open <= 0 || c.close <= 0) continue;
      const res = this.statements.insertCandle.run(
        canSym,
        brkSym,
        tf,
        c.timestamp,
        c.open,
        c.high,
        c.low,
        c.close,
        c.tickVolume || 0,
        'MT5_BROKER_BRIDGE',
        receivedAt
      );
      if (res && res.changes > 0) inserted++;
    }
    return inserted;
  }

  /**
   * Update connector agent state
   */
  updateConnectorState(deviceId, state, meta = {}) {
    const now = Date.now();
    return this.statements.upsertConnectorState.run(
      deviceId,
      meta.lastBridgeHeartbeat || now,
      meta.lastLocalPersist || now,
      meta.lastError || null,
      state,
      meta.storageMode || 'LOCAL',
      meta.consecutiveErrors || 0,
      now
    );
  }

  /**
   * Atomic Telemetry Cycle Transaction
   * Commits heartbeat, account, quotes, and optional candles in ONE single transaction
   */
  saveTelemetryCycle({ deviceId, capturedAt, sequence, heartbeat, account, quotes, candleSnapshots, connectorState }) {
    this.db.exec('BEGIN TRANSACTION;');
    try {
      if (heartbeat) {
        this.saveHeartbeat(deviceId, capturedAt, sequence, heartbeat);
      }
      if (account) {
        this.saveAccountStatus(deviceId, capturedAt, sequence, account);
      }
      if (quotes && quotes.length > 0) {
        this.saveQuotes(quotes, deviceId, capturedAt, sequence);
      }
      if (Array.isArray(candleSnapshots)) {
        for (const cs of candleSnapshots) {
          if (cs && cs.canonicalSymbol && cs.timeframe && cs.candles) {
            this.saveCandles(cs.canonicalSymbol, cs.brokerSymbol, cs.timeframe, cs.candles);
          }
        }
      }
      if (connectorState) {
        this.updateConnectorState(deviceId, connectorState.state || 'ONLINE', connectorState);
      }

      this.db.exec('COMMIT;');
      return { success: true };
    } catch (err) {
      try { this.db.exec('ROLLBACK;'); } catch {}
      return { success: false, error: err.message };
    }
  }

  /**
   * Read latest terminal heartbeat
   */
  getLatestHeartbeat() {
    try {
      return this.statements.selectHeartbeat.get() || null;
    } catch {
      return null;
    }
  }

  /**
   * Read latest account snapshot
   */
  getLatestAccount() {
    try {
      return this.statements.selectAccount.get() || null;
    } catch {
      return null;
    }
  }

  /**
   * Read quote by symbol
   */
  getLatestQuote(symbol) {
    try {
      return this.statements.selectQuote.get(symbol.toUpperCase()) || null;
    } catch {
      return null;
    }
  }

  /**
   * Read all quotes
   */
  getAllQuotes() {
    try {
      const rows = this.statements.selectAllQuotes.all();
      const map = {};
      for (const r of rows) {
        map[r.symbol] = r;
      }
      return map;
    } catch {
      return {};
    }
  }

  /**
   * Read candles
   */
  getCandles(symbol, timeframe, limit = 50) {
    try {
      const rows = this.statements.selectCandles.all(
        symbol.toUpperCase(),
        timeframe.toUpperCase(),
        limit
      );
      return rows.map((r) => ({
        timestamp: r.open_time,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
        tickVolume: r.tick_volume,
        provider: r.provider,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Read connector health
   */
  getConnectorState() {
    try {
      return this.statements.selectConnectorState.get() || null;
    } catch {
      return null;
    }
  }

  /**
   * Get candle count and time range metrics
   */
  getCandleMetrics() {
    try {
      const countRes = this.statements.countCandles.get();
      const rangeRes = this.statements.candleTimeRange.get();
      return {
        count: countRes?.count || 0,
        oldest: rangeRes?.oldest || null,
        newest: rangeRes?.newest || null,
      };
    } catch {
      return { count: 0, oldest: null, newest: null };
    }
  }

  /**
   * Bounded retention: prune closed candles per symbol/timeframe
   */
  pruneCandles(symbols, timeframes, keepBars = 500) {
    let pruned = 0;
    for (const sym of symbols) {
      for (const tf of timeframes) {
        try {
          const res = this.statements.pruneOldCandles.run(sym, tf, sym, tf, keepBars);
          if (res && res.changes > 0) pruned += res.changes;
        } catch {}
      }
    }
    return pruned;
  }

  /**
   * Close database connection cleanly
   */
  close() {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
      this.isInitialized = false;
    }
  }
}

module.exports = {
  LocalTelemetryRepository,
  DEFAULT_DB_PATH,
  DEFAULT_DATA_DIR,
  DEFAULT_FEF_DIR,
  SCHEMA_VERSION,
};
