/**
 * FEF CORTEX — SETUP LIFECYCLE PERSISTENCE LAYER V1
 *
 * Local-first SQLite persistence for Setup Intelligence V3 lifecycle evolution.
 * Adheres strictly to:
 * - Native `node:sqlite` (DatabaseSync) engine
 * - WAL mode with synchronous = NORMAL, foreign_keys = ON, busy_timeout = 5000
 * - Filesystem isolation at $HOME/.fef/data/fef-cortex.db (0700 dir, 0600 file)
 * - Zero write amplification: tick-level deduplication (no redundant events)
 * - Legal lifecycle state transitions (anti-resurrection, fail-closed terminal states)
 * - Truthful NO_SETUP handling: never inserts fake records for absence of setups
 * - GER40 fail-closed: zero fabricated setup history
 * - Pure intelligence: tradeExecutable strictly false, READ_ONLY
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  SetupIntelligenceV3,
  SetupLifecycleV3,
  SetupDirectionV3,
  SetupTypeV3,
} from './setup-intelligence-v3';

// Dynamic loader for Node native SQLite DatabaseSync
let DatabaseSyncClass: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DatabaseSyncClass = require('node:sqlite').DatabaseSync;
} catch {
  // Fallback for build time or non-Node environments
}

const DEFAULT_FEF_DIR = path.resolve(process.env.HOME || os.homedir(), '.fef');
const DEFAULT_DATA_DIR = path.resolve(DEFAULT_FEF_DIR, 'data');
export const DEFAULT_CORTEX_DB_PATH = path.resolve(DEFAULT_DATA_DIR, 'fef-cortex.db');

export type SetupTerminalState =
  | 'STOP_LEVEL_REACHED'
  | 'STOP_REACHED'
  | 'STRUCTURAL_INVALIDATION'
  | 'INVALIDATED'
  | 'INVALIDATED_PRE_TRIGGER'
  | 'EXPIRED'
  | 'EXPIRED_UNTRIGGERED'
  | 'AMBIGUOUS_BAR_CONFLICT'
  | 'COMPLETED'
  | 'TARGET_1_REACHED'
  | 'TARGET_2_REACHED'
  | 'TARGET_3_REACHED'
  | 'UNRESOLVED';

export type SetupOutcomeResolution =
  | 'UNRESOLVED'
  | 'STOP_LEVEL_REACHED'
  | 'STOP_REACHED'
  | 'STRUCTURAL_INVALIDATION'
  | 'INVALIDATED'
  | 'INVALIDATED_PRE_TRIGGER'
  | 'EXPIRED_UNTRIGGERED'
  | 'EXPIRED'
  | 'AMBIGUOUS_BAR_CONFLICT'
  | 'COMPLETED'
  | 'TARGET_1_REACHED'
  | 'TARGET_2_REACHED'
  | 'TARGET_3_REACHED';

export interface PersistedSetupRecord {
  setupId: string;
  symbol: string;
  direction: SetupDirectionV3;
  setupType: SetupTypeV3;
  anchorTimestamp: number;
  firstSeenAt: number;
  lastSeenAt: number;
  createdAt: number;
  currentLifecycle: SetupLifecycleV3;
  terminalState: SetupTerminalState | null;
  resolvedAt: number | null;
  validatedAt: number | null;
  invalidatedAt: number | null;
  expiredAt: number | null;
  invalidationReason: string | null;

  // Geometry snapshot at observation
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  entryMidpoint: number | null;
  stopLoss: number | null;
  invalidationPrice: number | null;
  target1: number | null;
  target2: number | null;
  target3: number | null;
  riskDistance: number | null;
  rewardDistance: number | null;
  initialRr: number | null;

  // Context & Metadata
  sessionModel: string | null;
  regime: string | null;
  dataQuality: string;

  // Objective Milestones & Excursion Tracking
  entryZoneTouched: boolean;
  entryZoneTouchedAt: number | null;
  triggerConfirmedAt: number | null;
  firstTargetReachedAt: number | null;
  target1Reached: boolean;
  target1ReachedAt: number | null;
  target2Reached: boolean;
  target2ReachedAt: number | null;
  target3Reached: boolean;
  target3ReachedAt: number | null;
  stopLevelReachedAt: number | null;
  mfePrice: number | null;
  maePrice: number | null;
  mfeR: number | null;
  maeR: number | null;
  outcomeResolution: SetupOutcomeResolution;
  outcomeAmbiguous: boolean;

  tradeExecutable: false;
  executionMode: 'READ_ONLY';
}

export interface PersistedLifecycleEvent {
  id?: number;
  setupId: string;
  snapshotId: string;
  observedAt: number;
  previousLifecycle: SetupLifecycleV3;
  newLifecycle: SetupLifecycleV3;
  direction: SetupDirectionV3;
  setupType: SetupTypeV3;
  readiness: string;
  currentPrice: number;
  entryMidpoint: number | null;
  stopLoss: number | null;
  invalidationPrice: number | null;
  target1: number | null;
  riskReward: number | null;
  confirmationsSatisfiedCount: number;
  confirmationsMissingCount: number;
  confirmationsJson?: string;
  sessionModel: string | null;
  dataQuality: string;
  transitionCause: string;
}

/**
 * Explicit Defensible Lifecycle Transitions Matrix
 * Terminal states (INVALIDATED, EXPIRED) have ZERO valid outgoing transitions.
 */
export const LEGAL_LIFECYCLE_TRANSITIONS: Record<SetupLifecycleV3, SetupLifecycleV3[]> = {
  NO_SETUP: ['OBSERVING', 'WATCH', 'FORMING'],
  OBSERVING: ['WATCH', 'FORMING', 'INVALIDATED', 'EXPIRED'],
  WATCH: ['FORMING', 'VALIDATED', 'INVALIDATED', 'EXPIRED'],
  FORMING: ['VALIDATED', 'INVALIDATED', 'EXPIRED'],
  VALIDATED: ['INVALIDATED', 'EXPIRED'],
  INVALIDATED: [], // Terminal - cannot resurrect
  EXPIRED: [],     // Terminal - cannot resurrect
};

export function isValidLifecycleTransition(
  from: SetupLifecycleV3,
  to: SetupLifecycleV3
): boolean {
  if (from === to) return true; // Idempotent same-state update
  const legalTargets = LEGAL_LIFECYCLE_TRANSITIONS[from];
  return Boolean(legalTargets && legalTargets.includes(to));
}

export class LocalSetupLifecycleRepository {
  public dbPath: string;
  public isMemory: boolean;
  public db: any;
  public isInitialized = false;
  public initError: string | null = null;
  private statements: Record<string, any> = {};

  constructor(options: { dbPath?: string; db?: any } = {}) {
    if (options.db) {
      this.db = options.db;
      this.dbPath = options.dbPath || ':memory:';
      this.isMemory = this.dbPath === ':memory:';
      this.migrate();
      this.prepareStatements();
      this.isInitialized = true;
      return;
    }

    this.dbPath = options.dbPath || process.env.FEF_SQLITE_DB_PATH || DEFAULT_CORTEX_DB_PATH;
    this.isMemory = this.dbPath === ':memory:';
    this.init();
  }

  private ensureDirectories(): void {
    if (this.isMemory) return;
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const parentDir = path.dirname(dir);
    try {
      if (fs.existsSync(parentDir)) fs.chmodSync(parentDir, 0o700);
      if (fs.existsSync(dir)) fs.chmodSync(dir, 0o700);
    } catch {
      // Ignore filesystem permission errors on non-posix systems
    }
  }

  private init(): void {
    if (this.isInitialized && this.db) return;

    try {
      this.ensureDirectories();

      if (!DatabaseSyncClass) {
        throw new Error('Node.js native SQLite DatabaseSync is not available in current runtime');
      }

      const fileExisted = !this.isMemory && fs.existsSync(this.dbPath);
      this.db = new DatabaseSyncClass(this.dbPath);

      if (!this.isMemory && !fileExisted && fs.existsSync(this.dbPath)) {
        try { fs.chmodSync(this.dbPath, 0o600); } catch {}
      }

      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
      `);

      this.migrate();
      this.prepareStatements();
      this.isInitialized = true;
    } catch (err: any) {
      this.isInitialized = false;
      this.initError = err.message;
      if (this.db) {
        try { this.db.close(); } catch {}
        this.db = null;
      }
    }
  }

  public migrate(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS setup_identity (
        setup_id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        setup_type TEXT NOT NULL,
        anchor_timestamp INTEGER NOT NULL,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        current_lifecycle TEXT NOT NULL,
        terminal_state TEXT,
        resolved_at INTEGER,
        validated_at INTEGER,
        invalidated_at INTEGER,
        expired_at INTEGER,
        invalidation_reason TEXT,
        entry_zone_low REAL,
        entry_zone_high REAL,
        entry_midpoint REAL,
        stop_loss REAL,
        invalidation_price REAL,
        target_1 REAL,
        target_2 REAL,
        target_3 REAL,
        risk_distance REAL,
        reward_distance REAL,
        initial_rr REAL,
        session_model TEXT,
        regime TEXT,
        entry_zone_touched INTEGER DEFAULT 0,
        entry_zone_touched_at INTEGER,
        trigger_confirmed_at INTEGER,
        first_target_reached_at INTEGER,
        mfe_price REAL,
        mae_price REAL,
        mfe_r REAL,
        mae_r REAL,
        outcome_resolution TEXT DEFAULT 'UNRESOLVED',
        outcome_ambiguous INTEGER DEFAULT 0,
        data_quality TEXT DEFAULT 'HEALTHY'
      );

      CREATE INDEX IF NOT EXISTS idx_setup_symbol_lifecycle
      ON setup_identity (symbol, current_lifecycle);

      CREATE INDEX IF NOT EXISTS idx_setup_last_seen
      ON setup_identity (last_seen_at DESC);

      CREATE TABLE IF NOT EXISTS setup_lifecycle_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setup_id TEXT NOT NULL,
        snapshot_id TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        previous_lifecycle TEXT NOT NULL,
        new_lifecycle TEXT NOT NULL,
        direction TEXT NOT NULL,
        setup_type TEXT NOT NULL,
        readiness TEXT NOT NULL,
        current_price REAL NOT NULL,
        entry_midpoint REAL,
        stop_loss REAL,
        invalidation_price REAL,
        target_1 REAL,
        risk_reward REAL,
        confirmations_satisfied_count INTEGER NOT NULL,
        confirmations_missing_count INTEGER NOT NULL,
        confirmations_json TEXT,
        session_model TEXT,
        data_quality TEXT NOT NULL,
        transition_cause TEXT NOT NULL,
        FOREIGN KEY (setup_id) REFERENCES setup_identity(setup_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_setup_events_lookup
      ON setup_lifecycle_events (setup_id, observed_at DESC);

      CREATE INDEX IF NOT EXISTS idx_setup_events_observed
      ON setup_lifecycle_events (observed_at DESC);
    `);
  }

  private prepareStatements(): void {
    if (!this.db) return;

    this.statements.insertSetupIdentity = this.db.prepare(`
      INSERT INTO setup_identity (
        setup_id, symbol, direction, setup_type, anchor_timestamp,
        first_seen_at, last_seen_at, created_at, current_lifecycle,
        terminal_state, resolved_at, validated_at, invalidated_at, expired_at,
        invalidation_reason, entry_zone_low, entry_zone_high, entry_midpoint,
        stop_loss, invalidation_price, target_1, target_2, target_3,
        risk_distance, reward_distance, initial_rr, session_model, regime,
        entry_zone_touched, entry_zone_touched_at, trigger_confirmed_at,
        first_target_reached_at, mfe_price, mae_price, mfe_r, mae_r,
        outcome_resolution, outcome_ambiguous, data_quality
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    this.statements.updateSetupLastSeen = this.db.prepare(`
      UPDATE setup_identity
      SET last_seen_at = ?
      WHERE setup_id = ?
    `);

    this.statements.updateSetupLifecycle = this.db.prepare(`
      UPDATE setup_identity
      SET
        current_lifecycle = ?,
        last_seen_at = ?,
        terminal_state = COALESCE(?, terminal_state),
        resolved_at = COALESCE(?, resolved_at),
        validated_at = COALESCE(?, validated_at),
        invalidated_at = COALESCE(?, invalidated_at),
        expired_at = COALESCE(?, expired_at),
        invalidation_reason = COALESCE(?, invalidation_reason),
        entry_zone_low = COALESCE(?, entry_zone_low),
        entry_zone_high = COALESCE(?, entry_zone_high),
        entry_midpoint = COALESCE(?, entry_midpoint),
        stop_loss = COALESCE(?, stop_loss),
        invalidation_price = COALESCE(?, invalidation_price),
        target_1 = COALESCE(?, target_1),
        target_2 = COALESCE(?, target_2),
        target_3 = COALESCE(?, target_3),
        risk_distance = COALESCE(?, risk_distance),
        reward_distance = COALESCE(?, reward_distance),
        initial_rr = COALESCE(?, initial_rr),
        trigger_confirmed_at = COALESCE(?, trigger_confirmed_at),
        session_model = COALESCE(?, session_model),
        data_quality = ?
      WHERE setup_id = ?
    `);

    this.statements.insertEvent = this.db.prepare(`
      INSERT INTO setup_lifecycle_events (
        setup_id, snapshot_id, observed_at, previous_lifecycle,
        new_lifecycle, direction, setup_type, readiness, current_price,
        entry_midpoint, stop_loss, invalidation_price, target_1,
        risk_reward, confirmations_satisfied_count, confirmations_missing_count,
        confirmations_json, session_model, data_quality, transition_cause
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    this.statements.getSetupById = this.db.prepare(`
      SELECT * FROM setup_identity WHERE setup_id = ?
    `);

    this.statements.getEventsBySetupId = this.db.prepare(`
      SELECT * FROM setup_lifecycle_events
      WHERE setup_id = ?
      ORDER BY observed_at ASC, id ASC
    `);

    this.statements.updateExcursion = this.db.prepare(`
      UPDATE setup_identity
      SET
        mfe_price = ?,
        mae_price = ?,
        mfe_r = ?,
        mae_r = ?,
        entry_zone_touched = ?,
        entry_zone_touched_at = COALESCE(?, entry_zone_touched_at),
        first_target_reached_at = COALESCE(?, first_target_reached_at),
        target2_reached_at = COALESCE(?, target2_reached_at),
        target3_reached_at = COALESCE(?, target3_reached_at),
        stop_level_reached_at = COALESCE(?, stop_level_reached_at),
        terminal_state = COALESCE(?, terminal_state),
        resolved_at = COALESCE(?, resolved_at),
        outcome_resolution = ?,
        outcome_ambiguous = ?
      WHERE setup_id = ?
    `);
  }

  /**
   * Records a setup observation with strict deduplication and transition enforcement.
   *
   * Deduplication Rule:
   * - If an equivalent observation exists with identical lifecycle, trigger state,
   *   confirmations count, and geometry, ONLY last_seen_at is updated.
   * - ZERO new event rows inserted unless a material state change occurred.
   */
  public recordObservation(
    setup: SetupIntelligenceV3,
    currentPrice: number,
    snapshotId: string,
    options: { transitionCause?: string; evaluationTime?: number } = {}
  ): {
    recorded: boolean;
    setupId?: string;
    isNew?: boolean;
    eventCreated?: boolean;
    deduplicated?: boolean;
    transition?: string;
    reason?: string;
    transitionOccurred?: boolean;
    previousLifecycle?: SetupLifecycleV3;
    newLifecycle?: SetupLifecycleV3;
  } {
    if (!this.isInitialized || !this.db) {
      return { recorded: false, reason: 'Repository offline' };
    }

    // Fail-Closed Invariant: GER40 has zero broker telemetry -> zero setup history
    if (setup.symbol === 'GER40' || setup.readiness === 'UNAVAILABLE') {
      return { recorded: false, isNew: false, transitionOccurred: false, reason: 'Telemetry UNAVAILABLE (Fail-closed)' };
    }

    // NO_SETUP represents absence of setup -> never persist fake empty setup identity
    if (setup.lifecycle === 'NO_SETUP' || setup.direction === 'NONE') {
      return { recorded: false, isNew: false, transitionOccurred: false, reason: 'NO_SETUP (No structural thesis)' };
    }

    const now = options.evaluationTime || setup.asOf || Date.now();
    const existing = this.getSetupById(setup.setupId);

    if (!existing) {
      // 1. Initial Setup Observation
      const initialTransitionCause = options.transitionCause || `Initial ${setup.lifecycle} observation`;
      const anchorTime = this.extractAnchorTimestamp(setup.setupId, now);

      const validatedAt = setup.lifecycle === 'VALIDATED' ? now : null;
      const invalidatedAt = setup.lifecycle === 'INVALIDATED' ? now : null;
      const expiredAt = setup.lifecycle === 'EXPIRED' ? now : null;
      const terminalState = setup.lifecycle === 'INVALIDATED'
        ? 'INVALIDATED'
        : (setup.lifecycle === 'EXPIRED' ? 'EXPIRED' : null);

      const triggerConfirmedAt = setup.trigger.state === 'CONFIRMED' ? now : null;
      const riskDistance = setup.risk ? (setup.risk.riskDistance ?? null) : null;
      const rewardDistance = setup.reward ? ((setup.reward as any).tp1Distance ?? setup.reward.rewardDistance ?? null) : null;
      const initialRr = setup.riskReward ? ((setup.riskReward as any).primaryRatio ?? setup.riskReward.ratio ?? null) : null;

      this.statements.insertSetupIdentity.run(
        setup.setupId,
        setup.symbol,
        setup.direction,
        setup.setupType,
        anchorTime,
        now, // first_seen_at
        now, // last_seen_at
        now, // created_at
        setup.lifecycle,
        terminalState,
        terminalState ? now : null, // resolved_at
        validatedAt,
        invalidatedAt,
        expiredAt,
        setup.invalidationReason || null,
        setup.entryZone ? (setup.entryZone.low ?? null) : null,
        setup.entryZone ? (setup.entryZone.high ?? null) : null,
        setup.entryZone ? (setup.entryZone.midpoint ?? null) : null,
        setup.stopLoss ? (setup.stopLoss.price ?? null) : null,
        setup.invalidation ? (setup.invalidation.price ?? null) : null,
        setup.targets.length > 0 ? (setup.targets[0].price ?? null) : null,
        setup.targets.length > 1 ? (setup.targets[1].price ?? null) : null,
        setup.targets.length > 2 ? (setup.targets[2].price ?? null) : null,
        riskDistance,
        rewardDistance,
        initialRr,
        setup.sessionContext?.sessionModel || 'UNKNOWN',
        setup.structuralContext?.trend || 'UNKNOWN',
        0, // entry_zone_touched
        null, // entry_zone_touched_at
        triggerConfirmedAt,
        null, // first_target_reached_at
        null, // mfe_price
        null, // mae_price
        null, // mfe_r
        null, // mae_r
        'UNRESOLVED',
        0, // outcome_ambiguous
        setup.dataQuality || 'HEALTHY'
      );

      // Record first lifecycle event
      this.recordEvent({
        setupId: setup.setupId,
        snapshotId,
        observedAt: now,
        previousLifecycle: 'NO_SETUP',
        newLifecycle: setup.lifecycle,
        direction: setup.direction,
        setupType: setup.setupType,
        readiness: setup.readiness,
        currentPrice,
        entryMidpoint: setup.entryZone ? (setup.entryZone.midpoint ?? null) : null,
        stopLoss: setup.stopLoss ? (setup.stopLoss.price ?? null) : null,
        invalidationPrice: setup.invalidation ? (setup.invalidation.price ?? null) : null,
        target1: setup.targets.length > 0 ? (setup.targets[0].price ?? null) : null,
        riskReward: initialRr,
        confirmationsSatisfiedCount: setup.confirmationsSatisfied.length,
        confirmationsMissingCount: setup.confirmationsMissing.length,
        confirmationsJson: JSON.stringify(setup.confirmationRequirements),
        sessionModel: setup.sessionContext?.sessionModel || 'UNKNOWN',
        dataQuality: setup.dataQuality || 'HEALTHY',
        transitionCause: initialTransitionCause,
      });

      return {
        recorded: true,
        setupId: setup.setupId,
        isNew: true,
        eventCreated: true,
        transition: `NO_SETUP -> ${setup.lifecycle}`,
        transitionOccurred: false,
      };
    }

    // 2. Existing Setup Observation Handling
    // Terminal Invariant: Once terminal (INVALIDATED, EXPIRED), setup CANNOT resurrect
    if (existing.currentLifecycle === 'INVALIDATED' || existing.currentLifecycle === 'EXPIRED') {
      if (setup.lifecycle !== existing.currentLifecycle) {
        // Attempting to resurrect terminal setup -> Reject
        return {
          recorded: false,
          setupId: setup.setupId,
          transitionOccurred: false,
          reason: `Illegal resurrection: setup ${setup.setupId} is in terminal state ${existing.currentLifecycle}`,
        };
      }
      // Same terminal state tick -> lightweight last_seen_at update
      this.statements.updateSetupLastSeen.run(now, setup.setupId);
      return { recorded: true, setupId: setup.setupId, isNew: false, deduplicated: true, transitionOccurred: false };
    }

    // Validate Transition Legality
    if (!isValidLifecycleTransition(existing.currentLifecycle, setup.lifecycle)) {
      return {
        recorded: false,
        setupId: setup.setupId,
        transitionOccurred: false,
        reason: `Illegal lifecycle transition: ${existing.currentLifecycle} -> ${setup.lifecycle}`,
      };
    }

    // Check for Material Changes (Lifecycle change, trigger confirmation, geometry change)
    const lifecycleChanged = existing.currentLifecycle !== setup.lifecycle;
    const triggerNewlyConfirmed =
      existing.triggerConfirmedAt === null && setup.trigger.state === 'CONFIRMED';
    const geometryNewlyArmed =
      existing.entryMidpoint === null && setup.entryZone !== null;
    const geometryChanged =
      existing.entryMidpoint !== null &&
      setup.entryZone !== null &&
      Math.abs((existing.entryMidpoint || 0) - setup.entryZone.midpoint) > 0.0001;
    const confirmationsCountChanged =
      existing.validatedAt === null &&
      setup.confirmationsSatisfied.length !==
        (setup.confirmationRequirements.length - setup.confirmationsMissing.length);

    const isMaterialChange =
      lifecycleChanged || triggerNewlyConfirmed || geometryNewlyArmed || geometryChanged;

    if (!isMaterialChange) {
      // DEDUPLICATION: Redundant equivalent observation -> update last_seen_at only
      this.statements.updateSetupLastSeen.run(now, setup.setupId);
      return {
        recorded: true,
        setupId: setup.setupId,
        isNew: false,
        eventCreated: false,
        deduplicated: true,
        transitionOccurred: false,
      };
    }

    // Apply Material Transition
    const validatedAt = setup.lifecycle === 'VALIDATED'
      ? (existing.validatedAt || now)
      : existing.validatedAt;
    const invalidatedAt = setup.lifecycle === 'INVALIDATED'
      ? (existing.invalidatedAt || now)
      : existing.invalidatedAt;
    const expiredAt = setup.lifecycle === 'EXPIRED'
      ? (existing.expiredAt || now)
      : existing.expiredAt;

    let terminalState: SetupTerminalState | null = existing.terminalState;
    let resolvedAt: number | null = existing.resolvedAt;

    if (setup.lifecycle === 'INVALIDATED') {
      terminalState = 'INVALIDATED';
      resolvedAt = resolvedAt || now;
    } else if (setup.lifecycle === 'EXPIRED') {
      terminalState = 'EXPIRED';
      resolvedAt = resolvedAt || now;
    }

    const triggerConfirmedAt = triggerNewlyConfirmed
      ? now
      : existing.triggerConfirmedAt;

    this.statements.updateSetupLifecycle.run(
      setup.lifecycle,
      now, // last_seen_at
      terminalState,
      resolvedAt,
      validatedAt,
      invalidatedAt,
      expiredAt,
      setup.invalidationReason || existing.invalidationReason,
      setup.entryZone ? (setup.entryZone.low ?? null) : existing.entryZoneLow,
      setup.entryZone ? (setup.entryZone.high ?? null) : existing.entryZoneHigh,
      setup.entryZone ? (setup.entryZone.midpoint ?? null) : existing.entryMidpoint,
      setup.stopLoss ? (setup.stopLoss.price ?? null) : existing.stopLoss,
      setup.invalidation ? (setup.invalidation.price ?? null) : existing.invalidationPrice,
      setup.targets.length > 0 ? (setup.targets[0].price ?? null) : existing.target1,
      setup.targets.length > 1 ? (setup.targets[1].price ?? null) : existing.target2,
      setup.targets.length > 2 ? (setup.targets[2].price ?? null) : existing.target3,
      setup.risk ? (setup.risk.riskDistance ?? null) : existing.riskDistance,
      setup.reward ? ((setup.reward as any).tp1Distance ?? setup.reward.rewardDistance ?? null) : existing.rewardDistance,
      setup.riskReward ? ((setup.riskReward as any).primaryRatio ?? setup.riskReward.ratio ?? null) : existing.initialRr,
      triggerConfirmedAt,
      setup.sessionContext?.sessionModel || 'UNKNOWN',
      setup.dataQuality || 'HEALTHY',
      setup.setupId
    );

    const transitionCause = options.transitionCause || (
      lifecycleChanged
        ? `State transition: ${existing.currentLifecycle} -> ${setup.lifecycle}`
        : triggerNewlyConfirmed
        ? 'M15 closed trigger confirmed'
        : 'Geometry armed / refined'
    );

    const updatedRr = setup.riskReward
      ? ((setup.riskReward as any).primaryRatio ?? setup.riskReward.ratio ?? null)
      : existing.initialRr;

    this.recordEvent({
      setupId: setup.setupId,
      snapshotId,
      observedAt: now,
      previousLifecycle: existing.currentLifecycle,
      newLifecycle: setup.lifecycle,
      direction: setup.direction,
      setupType: setup.setupType,
      readiness: setup.readiness,
      currentPrice,
      entryMidpoint: setup.entryZone ? (setup.entryZone.midpoint ?? null) : existing.entryMidpoint,
      stopLoss: setup.stopLoss ? (setup.stopLoss.price ?? null) : existing.stopLoss,
      invalidationPrice: setup.invalidation ? (setup.invalidation.price ?? null) : existing.invalidationPrice,
      target1: setup.targets.length > 0 ? (setup.targets[0].price ?? null) : existing.target1,
      riskReward: updatedRr,
      confirmationsSatisfiedCount: setup.confirmationsSatisfied.length,
      confirmationsMissingCount: setup.confirmationsMissing.length,
      confirmationsJson: JSON.stringify(setup.confirmationRequirements),
      sessionModel: setup.sessionContext?.sessionModel || 'UNKNOWN',
      dataQuality: setup.dataQuality || 'HEALTHY',
      transitionCause,
    });

    return {
      recorded: true,
      setupId: setup.setupId,
      isNew: false,
      eventCreated: true,
      deduplicated: false,
      transition: `${existing.currentLifecycle} -> ${setup.lifecycle}`,
      transitionOccurred: lifecycleChanged,
      previousLifecycle: existing.currentLifecycle,
      newLifecycle: setup.lifecycle,
    };
  }

  private recordEvent(event: PersistedLifecycleEvent): void {
    if (!this.statements.insertEvent) return;
    this.statements.insertEvent.run(
      event.setupId,
      event.snapshotId,
      event.observedAt,
      event.previousLifecycle,
      event.newLifecycle,
      event.direction,
      event.setupType,
      event.readiness,
      event.currentPrice,
      event.entryMidpoint,
      event.stopLoss,
      event.invalidationPrice,
      event.target1,
      event.riskReward,
      event.confirmationsSatisfiedCount,
      event.confirmationsMissingCount,
      event.confirmationsJson || null,
      event.sessionModel || null,
      event.dataQuality,
      event.transitionCause
    );
  }

  public getSetupById(setupId: string): PersistedSetupRecord | null {
    if (!this.statements.getSetupById) return null;
    const row = this.statements.getSetupById.get(setupId);
    return row ? this.mapRowToSetupRecord(row) : null;
  }

  public getSetupsBySymbol(
    symbol: string | { symbol?: string },
    options: { limit?: number; activeOnly?: boolean } = {}
  ): PersistedSetupRecord[] {
    if (!this.db) return [];
    const sym = typeof symbol === 'string' ? symbol : (symbol as any)?.symbol || '';
    let sql = `SELECT * FROM setup_identity WHERE symbol = ?`;
    const params: any[] = [sym];

    if (options.activeOnly) {
      sql += ` AND current_lifecycle NOT IN ('INVALIDATED', 'EXPIRED') AND terminal_state IS NULL`;
    }

    sql += ` ORDER BY last_seen_at DESC`;

    if (options.limit && options.limit > 0) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r: any) => this.mapRowToSetupRecord(r));
  }

  public getActiveSetups(optionsOrSymbol?: string | { symbol?: string }): PersistedSetupRecord[] {
    const sym = typeof optionsOrSymbol === 'string'
      ? optionsOrSymbol
      : (optionsOrSymbol && typeof optionsOrSymbol === 'object' ? optionsOrSymbol.symbol : undefined);
    if (sym) {
      return this.getSetupsBySymbol(sym, { activeOnly: true });
    }
    return this.getAllSetups({ activeOnly: true } as any);
  }

  public getAllSetups(
    options: { symbol?: string; lifecycle?: string; limit?: number } = {}
  ): PersistedSetupRecord[] {
    if (!this.db) return [];
    let sql = `SELECT * FROM setup_identity WHERE 1=1`;
    const params: any[] = [];

    if (options.symbol) {
      sql += ` AND symbol = ?`;
      params.push(options.symbol);
    }
    if (options.lifecycle) {
      sql += ` AND current_lifecycle = ?`;
      params.push(options.lifecycle);
    }

    sql += ` ORDER BY last_seen_at DESC`;

    if (options.limit && options.limit > 0) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map((r: any) => this.mapRowToSetupRecord(r));
  }

  public getLifecycleEvents(setupId: string): PersistedLifecycleEvent[] {
    if (!this.statements.getEventsBySetupId) return [];
    const rows = this.statements.getEventsBySetupId.all(setupId);
    return rows.map((r: any) => ({
      id: r.id,
      setupId: r.setup_id,
      snapshotId: r.snapshot_id,
      observedAt: r.observed_at,
      previousLifecycle: r.previous_lifecycle as SetupLifecycleV3,
      newLifecycle: r.new_lifecycle as SetupLifecycleV3,
      direction: r.direction as SetupDirectionV3,
      setupType: r.setup_type as SetupTypeV3,
      readiness: r.readiness,
      currentPrice: r.current_price,
      entryMidpoint: r.entry_midpoint,
      stopLoss: r.stop_loss,
      invalidationPrice: r.invalidation_price,
      target1: r.target_1,
      riskReward: r.risk_reward,
      confirmationsSatisfiedCount: r.confirmations_satisfied_count,
      confirmationsMissingCount: r.confirmations_missing_count,
      confirmationsJson: r.confirmations_json,
      sessionModel: r.session_model,
      dataQuality: r.data_quality,
      transitionCause: r.transition_cause,
    }));
  }

  public updateExcursionAndOutcome(
    setupId: string,
    update: {
      mfePrice: number | null;
      maePrice: number | null;
      mfeR: number | null;
      maeR: number | null;
      entryZoneTouched: boolean;
      entryZoneTouchedAt: number | null;
      firstTargetReachedAt: number | null;
      target2ReachedAt?: number | null;
      target3ReachedAt?: number | null;
      stopLevelReachedAt?: number | null;
      terminalState: SetupTerminalState | null;
      resolvedAt: number | null;
      outcomeResolution: SetupOutcomeResolution;
      outcomeAmbiguous: boolean;
    }
  ): boolean {
    if (!this.statements.updateExcursion) return false;
    this.statements.updateExcursion.run(
      update.mfePrice,
      update.maePrice,
      update.mfeR,
      update.maeR,
      update.entryZoneTouched ? 1 : 0,
      update.entryZoneTouchedAt,
      update.firstTargetReachedAt,
      update.target2ReachedAt !== undefined ? update.target2ReachedAt : null,
      update.target3ReachedAt !== undefined ? update.target3ReachedAt : null,
      update.stopLevelReachedAt !== undefined ? update.stopLevelReachedAt : null,
      update.terminalState,
      update.resolvedAt,
      update.outcomeResolution,
      update.outcomeAmbiguous ? 1 : 0,
      setupId
    );
    return true;
  }

  public updateOutcome(
    setupId: string,
    update: Partial<{
      mfePrice: number | null;
      maePrice: number | null;
      mfeR: number | null;
      maeR: number | null;
      entryZoneTouched: boolean;
      entryZoneTouchedAt: number | null;
      firstTargetReachedAt: number | null;
      target1ReachedAt: number | null;
      target2ReachedAt: number | null;
      target3ReachedAt: number | null;
      stopLevelReachedAt: number | null;
      invalidatedAt: number | null;
      expiredAt: number | null;
      terminalState: SetupTerminalState | null;
      resolvedAt: number | null;
      outcomeResolution: SetupOutcomeResolution;
      outcomeAmbiguous: boolean;
    }>
  ): boolean {
    const existing = this.getSetupById(setupId);
    if (!existing) return false;

    // Terminal state lock: if already in a true terminal state, do not overwrite terminalState or outcomeResolution
    const isAlreadyTerminal =
      existing.terminalState === 'STOP_LEVEL_REACHED' ||
      existing.terminalState === 'STOP_REACHED' ||
      existing.terminalState === 'STRUCTURAL_INVALIDATION' ||
      existing.terminalState === 'INVALIDATED' ||
      existing.terminalState === 'INVALIDATED_PRE_TRIGGER' ||
      existing.terminalState === 'EXPIRED' ||
      existing.terminalState === 'EXPIRED_UNTRIGGERED' ||
      existing.terminalState === 'AMBIGUOUS_BAR_CONFLICT' ||
      existing.terminalState === 'COMPLETED';

    if (isAlreadyTerminal) {
      return false;
    }

    const t1 = update.target1ReachedAt !== undefined
      ? update.target1ReachedAt
      : (update.firstTargetReachedAt !== undefined ? update.firstTargetReachedAt : existing.firstTargetReachedAt);

    return this.updateExcursionAndOutcome(setupId, {
      mfePrice: update.mfePrice !== undefined ? update.mfePrice : existing.mfePrice,
      maePrice: update.maePrice !== undefined ? update.maePrice : existing.maePrice,
      mfeR: update.mfeR !== undefined ? update.mfeR : existing.mfeR,
      maeR: update.maeR !== undefined ? update.maeR : existing.maeR,
      entryZoneTouched: update.entryZoneTouched !== undefined ? update.entryZoneTouched : existing.entryZoneTouched,
      entryZoneTouchedAt: update.entryZoneTouchedAt !== undefined ? update.entryZoneTouchedAt : existing.entryZoneTouchedAt,
      firstTargetReachedAt: t1,
      target2ReachedAt: update.target2ReachedAt !== undefined ? update.target2ReachedAt : existing.target2ReachedAt,
      target3ReachedAt: update.target3ReachedAt !== undefined ? update.target3ReachedAt : existing.target3ReachedAt,
      stopLevelReachedAt: update.stopLevelReachedAt !== undefined ? update.stopLevelReachedAt : existing.stopLevelReachedAt,
      terminalState: update.terminalState !== undefined ? update.terminalState : existing.terminalState,
      resolvedAt: update.resolvedAt !== undefined ? update.resolvedAt : existing.resolvedAt,
      outcomeResolution: update.outcomeResolution !== undefined ? update.outcomeResolution : existing.outcomeResolution,
      outcomeAmbiguous: update.outcomeAmbiguous !== undefined ? update.outcomeAmbiguous : existing.outcomeAmbiguous,
    });
  }

  public recordTransition(event: {
    setupId: string;
    fromState: SetupLifecycleV3;
    toState: SetupLifecycleV3;
    timestamp: number;
    reason: string;
    snapshotId: string;
    triggerDetails?: any;
  }): void {
    const existing = this.getSetupById(event.setupId);
    this.recordEvent({
      setupId: event.setupId,
      snapshotId: event.snapshotId,
      observedAt: event.timestamp,
      previousLifecycle: event.fromState,
      newLifecycle: event.toState,
      direction: existing ? existing.direction : 'NONE',
      setupType: existing ? existing.setupType : 'UNCLASSIFIED',
      readiness: 'READY',
      currentPrice: existing ? existing.entryMidpoint || 0 : 0,
      entryMidpoint: existing ? existing.entryMidpoint : null,
      stopLoss: existing ? existing.stopLoss : null,
      invalidationPrice: existing ? existing.invalidationPrice : null,
      target1: existing ? existing.target1 : null,
      riskReward: existing ? existing.initialRr : null,
      confirmationsSatisfiedCount: 0,
      confirmationsMissingCount: 0,
      confirmationsJson: event.triggerDetails ? JSON.stringify(event.triggerDetails) : undefined,
      sessionModel: existing ? existing.sessionModel : null,
      dataQuality: 'HEALTHY',
      transitionCause: event.reason,
    });
  }

  public close(): void {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
      this.isInitialized = false;
    }
  }

  private mapRowToSetupRecord(row: any): PersistedSetupRecord {
    return {
      setupId: row.setup_id,
      symbol: row.symbol,
      direction: row.direction as SetupDirectionV3,
      setupType: row.setup_type as SetupTypeV3,
      anchorTimestamp: row.anchor_timestamp,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
      currentLifecycle: row.current_lifecycle as SetupLifecycleV3,
      terminalState: row.terminal_state as SetupTerminalState | null,
      resolvedAt: row.resolved_at,
      validatedAt: row.validated_at,
      invalidatedAt: row.invalidated_at,
      expiredAt: row.expired_at,
      invalidationReason: row.invalidation_reason,
      entryZoneLow: row.entry_zone_low,
      entryZoneHigh: row.entry_zone_high,
      entryMidpoint: row.entry_midpoint,
      stopLoss: row.stop_loss,
      invalidationPrice: row.invalidation_price,
      target1: row.target_1,
      target2: row.target_2,
      target3: row.target_3,
      riskDistance: row.risk_distance,
      rewardDistance: row.reward_distance,
      initialRr: row.initial_rr,
      sessionModel: row.session_model,
      regime: row.regime,
      dataQuality: row.data_quality,
      entryZoneTouched: Boolean(row.entry_zone_touched),
      entryZoneTouchedAt: row.entry_zone_touched_at,
      triggerConfirmedAt: row.trigger_confirmed_at,
      firstTargetReachedAt: row.first_target_reached_at,
      target1Reached: Boolean(row.first_target_reached_at || row.target1_reached_at),
      target1ReachedAt: row.target1_reached_at || row.first_target_reached_at || null,
      target2Reached: Boolean(row.target2_reached_at),
      target2ReachedAt: row.target2_reached_at || null,
      target3Reached: Boolean(row.target3_reached_at),
      target3ReachedAt: row.target3_reached_at || null,
      stopLevelReachedAt: row.stop_level_reached_at || null,
      mfePrice: row.mfe_price,
      maePrice: row.mae_price,
      mfeR: row.mfe_r,
      maeR: row.mae_r,
      outcomeResolution: row.outcome_resolution as SetupOutcomeResolution,
      outcomeAmbiguous: Boolean(row.outcome_ambiguous),
      tradeExecutable: false,
      executionMode: 'READ_ONLY',
    };
  }

  private extractAnchorTimestamp(setupId: string, fallbackTime: number): number {
    const parts = setupId.split('-');
    const lastPart = parts[parts.length - 1];
    const parsed = Number(lastPart);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackTime;
  }
}

// Singleton repository for runtime consumers
let globalSetupRepo: LocalSetupLifecycleRepository | null = null;

export function getLocalSetupLifecycleRepository(
  options: { dbPath?: string } = {}
): LocalSetupLifecycleRepository {
  if (!globalSetupRepo || (options.dbPath && globalSetupRepo.dbPath !== options.dbPath)) {
    globalSetupRepo = new LocalSetupLifecycleRepository(options);
  }
  return globalSetupRepo;
}
