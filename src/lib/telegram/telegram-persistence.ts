/**
 * FEF CORTEX — TELEGRAM SIGNAL & DELIVERY PERSISTENCE STORE
 *
 * Phase 13 Workstream: Durable SQLite Storage for Telegram Signals
 * Uses Node native SQLite (`node:sqlite DatabaseSync`) targeting canonical ~/.fef/data/fef-cortex.db.
 *
 * INVARIANTS:
 * - Never stores bot tokens, raw credentials, or personal recipient details
 * - Uses WAL mode with 5000ms busy timeout
 * - Atomic queue claiming with transactional row locking
 * - Does not modify or touch the execution journal or unrelated tables
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

let DatabaseSyncClass: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DatabaseSyncClass = require('node:sqlite').DatabaseSync;
} catch {
  // Fallback for non-Node environments
}

const DEFAULT_FEF_DIR = path.resolve(process.env.HOME || os.homedir(), '.fef');
const DEFAULT_DATA_DIR = path.resolve(DEFAULT_FEF_DIR, 'data');
export const CANONICAL_DB_PATH = path.resolve(DEFAULT_DATA_DIR, 'fef-cortex.db');

export type DeliveryStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERY_FAILED'
  | 'CANCELLED'
  | 'PAUSED';

export interface TelegramSignalEventRecord {
  id?: number;
  signalId: string;
  setupId: string;
  setupRevision: number;
  symbol: string;
  direction: 'BUY' | 'SELL';
  timeframe: string;
  eligibilityStatus: string;
  rejectionReason?: string;
  payloadHash?: string;
  payloadJson?: string;
  createdAt?: number;
  validatedAt?: string;
  invalidatedAt?: string;
}

export interface TelegramQueueRecord {
  id: number;
  signalId: string;
  idempotencyKey: string;
  destinationKey: string;
  deliveryStatus: DeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  claimedAt: number | null;
  deliveredAt: number | null;
  telegramMessageId: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TelegramAuditRecord {
  id?: number;
  signalId: string;
  eventType: 'ENQUEUED' | 'CLAIMED' | 'DELIVERED' | 'RETRY_SCHEDULED' | 'FAILED_TERMINAL' | 'PAUSED' | 'UNPAUSED';
  status: string;
  safeErrorCode?: string;
  details?: string;
  timestamp: number;
}

export class TelegramPersistenceService {
  private db: any = null;
  private dbPath: string;
  private isMemory: boolean;
  private isInitialized = false;

  constructor(options: { dbPath?: string } | string = {}) {
    if (typeof options === 'string') {
      this.dbPath = options;
    } else {
      this.dbPath = options.dbPath || process.env.FEF_SQLITE_DB_PATH || CANONICAL_DB_PATH;
    }
    this.isMemory = this.dbPath === ':memory:';
    this.init();
  }

  private ensureDirectories(): void {
    if (this.isMemory) return;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  private init(): void {
    if (this.isInitialized && this.db) return;

    try {
      this.ensureDirectories();

      if (!DatabaseSyncClass) {
        throw new Error('Node.js native SQLite DatabaseSync not available');
      }

      this.db = new DatabaseSyncClass(this.dbPath);

      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
      `);

      this.migrate();
      this.isInitialized = true;
    } catch (err: any) {
      this.isInitialized = false;
      if (this.db) {
        try { this.db.close(); } catch {}
        this.db = null;
      }
    }
  }

  public migrate(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS telegram_signal_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id TEXT UNIQUE NOT NULL,
        setup_id TEXT NOT NULL,
        setup_revision INTEGER NOT NULL DEFAULT 1,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        eligibility_status TEXT NOT NULL,
        rejection_reason TEXT,
        payload_hash TEXT NOT NULL,
        payload_json TEXT,
        created_at INTEGER NOT NULL,
        validated_at TEXT,
        invalidated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tg_signal_id ON telegram_signal_events (signal_id);
      CREATE INDEX IF NOT EXISTS idx_tg_setup_id ON telegram_signal_events (setup_id);
      CREATE INDEX IF NOT EXISTS idx_tg_symbol ON telegram_signal_events (symbol);

      CREATE TABLE IF NOT EXISTS telegram_delivery_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        destination_key TEXT NOT NULL,
        delivery_status TEXT NOT NULL DEFAULT 'QUEUED',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        next_attempt_at INTEGER NOT NULL,
        claimed_at INTEGER,
        delivered_at INTEGER,
        telegram_message_id INTEGER,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tg_queue_status ON telegram_delivery_queue (delivery_status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_tg_queue_idempotency ON telegram_delivery_queue (idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_tg_queue_signal ON telegram_delivery_queue (signal_id);

      CREATE TABLE IF NOT EXISTS telegram_delivery_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        signal_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        safe_error_code TEXT,
        details TEXT,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tg_audit_signal ON telegram_delivery_audit (signal_id, timestamp);
    `);
  }

  public recordSignalEvent(event: TelegramSignalEventRecord): boolean {
    if (!this.db) return false;
    const now = Date.now();
    const payloadHash = event.payloadHash || crypto.createHash('sha256').update(event.payloadJson || '').digest('hex');

    try {
      const stmt = this.db.prepare(`
        INSERT INTO telegram_signal_events (
          signal_id, setup_id, setup_revision, symbol, direction,
          timeframe, eligibility_status, rejection_reason, payload_hash,
          payload_json, created_at, validated_at, invalidated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        event.signalId,
        event.setupId,
        event.setupRevision,
        event.symbol,
        event.direction,
        event.timeframe,
        event.eligibilityStatus,
        event.rejectionReason || null,
        payloadHash,
        event.payloadJson || null,
        event.createdAt || now,
        event.validatedAt || null,
        event.invalidatedAt || null
      );

      this.recordAudit({
        signalId: event.signalId,
        eventType: 'ENQUEUED',
        status: event.eligibilityStatus,
        details: `Signal event recorded with status ${event.eligibilityStatus}`,
        timestamp: now,
      });

      return true;
    } catch {
      return false;
    }
  }

  public enqueueSignal(params: {
    signalId: string;
    idempotencyKey: string;
    destinationKey: string;
    maxAttempts?: number;
  }): TelegramQueueRecord | null {
    if (!this.db) return null;
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT INTO telegram_delivery_queue (
          signal_id, idempotency_key, destination_key, delivery_status,
          attempts, max_attempts, next_attempt_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'QUEUED', 0, ?, ?, ?, ?)
      `);

      const maxAttempts = params.maxAttempts || 3;
      const res = stmt.run(
        params.signalId,
        params.idempotencyKey,
        params.destinationKey,
        maxAttempts,
        now,
        now,
        now
      );

      return this.getDeliveryBySignalId(params.signalId);
    } catch {
      return null;
    }
  }

  public hasBeenEnqueuedOrDelivered(idempotencyKey: string): boolean {
    if (!this.db) return false;
    try {
      const stmt = this.db.prepare(`
        SELECT id FROM telegram_delivery_queue
        WHERE idempotency_key = ?
        LIMIT 1
      `);
      const row = stmt.get(idempotencyKey);
      return Boolean(row);
    } catch {
      return false;
    }
  }

  public getKnownIdempotencyKeys(): Set<string> {
    if (!this.db) return new Set();
    try {
      const stmt = this.db.prepare(`SELECT idempotency_key FROM telegram_delivery_queue`);
      const rows = stmt.all();
      return new Set(rows.map((r: any) => r.idempotency_key));
    } catch {
      return new Set();
    }
  }

  /**
   * Atomic batch claiming with lock timeout (120s stale recovery)
   */
  public claimNextPendingBatch(limit = 1): TelegramQueueRecord[] {
    if (!this.db) return [];
    const now = Date.now();
    const staleClaimThreshold = now - 120000; // 2 minutes

    try {
      this.db.exec('BEGIN IMMEDIATE');

      // Select candidate items that are ready to send or have timed out in SENDING state
      const selectStmt = this.db.prepare(`
        SELECT id, signal_id, idempotency_key, destination_key, delivery_status,
               attempts, max_attempts, next_attempt_at, claimed_at, delivered_at,
               telegram_message_id, last_error_code, last_error_message, created_at, updated_at
        FROM telegram_delivery_queue
        WHERE (delivery_status = 'QUEUED' AND next_attempt_at <= ?)
           OR (delivery_status = 'SENDING' AND claimed_at < ?)
        ORDER BY next_attempt_at ASC
        LIMIT ?
      `);

      const candidates: any[] = selectStmt.all(now, staleClaimThreshold, limit);

      const claimed: TelegramQueueRecord[] = [];
      const updateStmt = this.db.prepare(`
        UPDATE telegram_delivery_queue
        SET delivery_status = 'SENDING', claimed_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ?
      `);

      for (const row of candidates) {
        updateStmt.run(now, now, row.id);
        claimed.push({
          id: row.id,
          signalId: row.signal_id,
          idempotencyKey: row.idempotency_key,
          destinationKey: row.destination_key,
          deliveryStatus: 'SENDING',
          attempts: row.attempts + 1,
          maxAttempts: row.max_attempts,
          nextAttemptAt: row.next_attempt_at,
          claimedAt: now,
          deliveredAt: row.delivered_at,
          telegramMessageId: row.telegram_message_id,
          lastErrorCode: row.last_error_code,
          lastErrorMessage: row.last_error_message,
          createdAt: row.created_at,
          updatedAt: now,
        });

        this.recordAudit({
          signalId: row.signal_id,
          eventType: 'CLAIMED',
          status: 'SENDING',
          details: `Claimed attempt #${row.attempts + 1}`,
          timestamp: now,
        });
      }

      this.db.exec('COMMIT');
      return claimed;
    } catch {
      try { this.db.exec('ROLLBACK'); } catch {}
      return [];
    }
  }

  public markDelivered(queueId: number, telegramMessageId: number): boolean {
    if (!this.db) return false;
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        UPDATE telegram_delivery_queue
        SET delivery_status = 'SENT', delivered_at = ?, telegram_message_id = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(now, telegramMessageId, now, queueId);

      const queueRecord = this.getDeliveryById(queueId);
      if (queueRecord) {
        this.recordAudit({
          signalId: queueRecord.signalId,
          eventType: 'DELIVERED',
          status: 'SENT',
          details: `Successfully delivered to Telegram. Message ID: ${telegramMessageId}`,
          timestamp: now,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  public markFailed(queueId: number, errorCode: string, errorMessage: string, retryDelayMs?: number): boolean {
    if (!this.db) return false;
    const now = Date.now();

    try {
      const queueRecord = this.getDeliveryById(queueId);
      if (!queueRecord) return false;

      const isTerminal = queueRecord.attempts >= queueRecord.maxAttempts || errorCode === 'INVALID_DESTINATION';
      const newStatus: DeliveryStatus = isTerminal ? 'DELIVERY_FAILED' : 'QUEUED';
      const nextAttemptAt = isTerminal ? now : now + (retryDelayMs || Math.min(300000, 5000 * Math.pow(2, queueRecord.attempts)));

      const stmt = this.db.prepare(`
        UPDATE telegram_delivery_queue
        SET delivery_status = ?, last_error_code = ?, last_error_message = ?, next_attempt_at = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(newStatus, errorCode, errorMessage.slice(0, 200), nextAttemptAt, now, queueId);

      this.recordAudit({
        signalId: queueRecord.signalId,
        eventType: isTerminal ? 'FAILED_TERMINAL' : 'RETRY_SCHEDULED',
        status: newStatus,
        safeErrorCode: errorCode,
        details: errorMessage.slice(0, 150),
        timestamp: now,
      });

      return true;
    } catch {
      return false;
    }
  }

  public recordAudit(audit: TelegramAuditRecord): void {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO telegram_delivery_audit (signal_id, event_type, status, safe_error_code, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        audit.signalId,
        audit.eventType,
        audit.status,
        audit.safeErrorCode || null,
        audit.details || null,
        audit.timestamp || Date.now()
      );
    } catch {}
  }

  public retryFailedSignal(signalId: string): boolean {
    if (!this.db) return false;
    try {
      const stmt = this.db.prepare(`
        UPDATE telegram_delivery_queue
        SET delivery_status = 'QUEUED', next_attempt_at = ?, attempts = 0, updated_at = ?
        WHERE signal_id = ? AND delivery_status != 'SENT'
      `);
      const info = stmt.run(Date.now(), Date.now(), signalId);
      if (info.changes > 0) {
        this.recordAudit({
          signalId,
          eventType: 'RETRY_SCHEDULED',
          status: 'QUEUED',
          details: 'Signal delivery reset to QUEUED for retry attempt',
          timestamp: Date.now(),
        });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  public getDeliveryBySignalId(signalId: string): TelegramQueueRecord | null {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare(`
        SELECT id, signal_id as signalId, idempotency_key as idempotencyKey, destination_key as destinationKey,
               delivery_status as deliveryStatus, attempts, max_attempts as maxAttempts, next_attempt_at as nextAttemptAt,
               claimed_at as claimedAt, delivered_at as deliveredAt, telegram_message_id as telegramMessageId,
               last_error_code as lastErrorCode, last_error_message as lastErrorMessage, created_at as createdAt, updated_at as updatedAt
        FROM telegram_delivery_queue
        WHERE signal_id = ?
        ORDER BY id DESC
        LIMIT 1
      `);
      return stmt.get(signalId) as TelegramQueueRecord || null;
    } catch {
      return null;
    }
  }

  public getDeliveryById(id: number): TelegramQueueRecord | null {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare(`
        SELECT id, signal_id as signalId, idempotency_key as idempotencyKey, destination_key as destinationKey,
               delivery_status as deliveryStatus, attempts, max_attempts as maxAttempts, next_attempt_at as nextAttemptAt,
               claimed_at as claimedAt, delivered_at as deliveredAt, telegram_message_id as telegramMessageId,
               last_error_code as lastErrorCode, last_error_message as lastErrorMessage, created_at as createdAt, updated_at as updatedAt
        FROM telegram_delivery_queue
        WHERE id = ?
      `);
      return stmt.get(id) as TelegramQueueRecord || null;
    } catch {
      return null;
    }
  }

  public getAuditTrail(signalId: string): TelegramAuditRecord[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT signal_id as signalId, event_type as eventType, status, safe_error_code as safeErrorCode, details, timestamp
        FROM telegram_delivery_audit
        WHERE signal_id = ?
        ORDER BY timestamp ASC
      `);
      return stmt.all(signalId) as TelegramAuditRecord[];
    } catch {
      return [];
    }
  }

  public listRecentSignals(limit = 50): any[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT s.signal_id as signalId, s.setup_id as setupId, s.setup_revision as setupRevision,
               s.symbol, s.direction, s.timeframe, s.eligibility_status as eligibilityStatus,
               s.rejection_reason as rejectionReason, s.created_at as createdAt,
               q.delivery_status as deliveryStatus, q.telegram_message_id as telegramMessageId,
               q.attempts, q.last_error_code as lastErrorCode, q.delivered_at as deliveredAt
        FROM telegram_signal_events s
        LEFT JOIN telegram_delivery_queue q ON s.signal_id = q.signal_id
        ORDER BY s.created_at DESC
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch {
      return [];
    }
  }

  public getRejectionsBreakdown(): { reason: string; count: number }[] {
    if (!this.db) return [];
    try {
      const stmt = this.db.prepare(`
        SELECT rejection_reason as reason, COUNT(*) as count
        FROM telegram_signal_events
        WHERE eligibility_status != 'ELIGIBLE' AND rejection_reason IS NOT NULL
        GROUP BY rejection_reason
        ORDER BY count DESC
        LIMIT 20
      `);
      return stmt.all() as { reason: string; count: number }[];
    } catch {
      return [];
    }
  }

  public getDuplicateSuppressionCount(): number {
    if (!this.db) return 0;
    try {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM telegram_signal_events
        WHERE rejection_reason LIKE '%Idempotency%' OR rejection_reason LIKE '%Micro-update%' OR rejection_reason LIKE '%DUPLICATE%'
      `);
      return (stmt.get() as any)?.count || 0;
    } catch {
      return 0;
    }
  }

  public getAverageDeliveryLatencyMs(): number | null {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare(`
        SELECT AVG(delivered_at - created_at) as avgLatency
        FROM telegram_delivery_queue
        WHERE delivery_status = 'SENT' AND delivered_at IS NOT NULL AND delivered_at > created_at
      `);
      const res = stmt.get() as any;
      return res && res.avgLatency ? Math.round(res.avgLatency) : null;
    } catch {
      return null;
    }
  }

  public close(): void {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
    }
  }

  public getQueueStats() {
    if (!this.db) {
      return {
        queuedCount: 0,
        sendingCount: 0,
        sentCount: 0,
        failedCount: 0,
        totalSignals: 0,
        lastDeliveredAt: null,
      };
    }

    try {
      const countsStmt = this.db.prepare(`
        SELECT delivery_status, COUNT(*) as cnt
        FROM telegram_delivery_queue
        GROUP BY delivery_status
      `);
      const rows: any[] = countsStmt.all();
      const statsMap: Record<string, number> = {};
      for (const r of rows) statsMap[r.delivery_status] = r.cnt;

      const lastDeliveredStmt = this.db.prepare(`
        SELECT delivered_at FROM telegram_delivery_queue
        WHERE delivery_status = 'SENT'
        ORDER BY delivered_at DESC LIMIT 1
      `);
      const lastRow = lastDeliveredStmt.get() as any;

      const totalSignalsStmt = this.db.prepare(`SELECT COUNT(*) as cnt FROM telegram_signal_events`);
      const totalSignals = (totalSignalsStmt.get() as any)?.cnt || 0;

      return {
        queuedCount: statsMap['QUEUED'] || 0,
        sendingCount: statsMap['SENDING'] || 0,
        sentCount: statsMap['SENT'] || 0,
        failedCount: statsMap['DELIVERY_FAILED'] || 0,
        totalSignals,
        lastDeliveredAt: lastRow?.delivered_at || null,
      };
    } catch {
      return {
        queuedCount: 0,
        sendingCount: 0,
        sentCount: 0,
        failedCount: 0,
        totalSignals: 0,
        lastDeliveredAt: null,
      };
    }
  }
}

export const telegramPersistence = new TelegramPersistenceService();
