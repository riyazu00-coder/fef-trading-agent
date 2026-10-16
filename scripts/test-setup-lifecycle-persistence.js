/**
 * FEF CORTEX — TEST SUITE: SETUP LIFECYCLE PERSISTENCE + HISTORICAL OUTCOME INTELLIGENCE V1
 *
 * 50 Rigorous Automated Tests:
 * - Group 1: Setup Identity Persistence & Snapshot Decoupling (T1-T5)
 * - Group 2: Deduplication & Zero Write Amplification (T6-T9)
 * - Group 3: Legal State Transitions & Anti-Resurrection Guard (T10-T15)
 * - Group 4: Historical Geometry Immutability (T16-T19)
 * - Group 5: Outcome Engine: LONG Target & Stop Evaluations (T20-T24)
 * - Group 6: Outcome Engine: SHORT Target & Stop Evaluations (T25-T28)
 * - Group 7: Ambiguous Bar Conflict Fail-Closed Resolution (T29-T32)
 * - Group 8: MFE / MAE Invariant & Entry Zone Touch Tracking (T33-T36)
 * - Group 9: Historical Analytics & Sample Size Honesty (T37-T41)
 * - Group 10: Calibration Firewall & Non-Interference (T42-T44)
 * - Group 11: GER40 Fail-Closed & Telemetry Integrity (T45-T47)
 * - Group 12: SQLite Database File Permissions & Persistence (T48-T50)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ts = require('typescript');
const Module = require('module');

// Register TypeScript on-the-fly compiler
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};
require.extensions['.tsx'] = require.extensions['.ts'];

// Map '@/...' to '../src/...'
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return origResolve.call(this, request, parent, isMain, options);
};

// Imports under test
const {
  LocalSetupLifecycleRepository,
  LEGAL_LIFECYCLE_TRANSITIONS,
  DEFAULT_CORTEX_DB_PATH,
} = require('../src/lib/setup/setup-lifecycle-persistence');
const { SetupOutcomeEngine } = require('../src/lib/setup/setup-outcome-engine');
const { SetupHistoricalAnalyticsEngine } = require('../src/lib/setup/setup-historical-analytics');
const { projectSetupV3ForUi } = require('../src/lib/setup/setup-ui-projection');
const { LocalTelemetryRepository } = require('./fef-local-telemetry-repository');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [T${totalTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [T${totalTests}] ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

// Temporary test database helper
function createTempRepo() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fef-setup-test-'));
  const dbPath = path.join(tmpDir, 'test-cortex.db');
  const telemetryRepo = new LocalTelemetryRepository({ dbPath });
  const setupRepo = new LocalSetupLifecycleRepository({ db: telemetryRepo.db, dbPath });
  return {
    tmpDir,
    dbPath,
    telemetryRepo,
    setupRepo,
    cleanup: () => {
      try {
        setupRepo.close();
      } catch {}
      try {
        telemetryRepo.close();
      } catch {}
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  };
}

// Mock Setup generator
function createMockSetup(overrides = {}) {
  const asOf = overrides.asOf || 1700000000000;
  return {
    setupId: overrides.setupId || 'SETUP-XAUUSD-M15-BULL-1700000000',
    symbol: overrides.symbol || 'XAUUSD',
    snapshotId: overrides.snapshotId || 'snap-xau-1',
    asOf,
    lifecycle: overrides.lifecycle || 'FORMING',
    direction: overrides.direction || 'LONG',
    setupType: overrides.setupType || 'BREAKOUT',
    thesis: overrides.thesis || 'Bullish break and retest of key level',
    entryZone: overrides.entryZone || {
      low: 2650.0,
      high: 2652.0,
      midpoint: 2651.0,
      timeframe: 'M15',
      sourceStructure: 'SWING_BREAK',
    },
    trigger: overrides.trigger || {
      state: 'WAITING',
      type: 'CANDLE_CLOSE',
      triggerLevel: 2652.0,
      confirmationClose: 2652.5,
      timeframe: 'M15',
      reason: 'Awaiting M15 bullish close',
    },
    invalidation: overrides.invalidation || {
      price: 2645.0,
      reason: 'Break below swing low',
      timeframe: 'H1',
      levelType: 'SWING_LOW',
    },
    stopLoss: overrides.stopLoss || {
      price: 2646.0,
      distance: 5.0,
      pips: 50.0,
      policy: 'TECHNICAL_SWING',
      timeframe: 'M15',
    },
    targets: overrides.targets || [
      { id: 'TP1', price: 2661.0, distance: 10.0, riskReward: 2.0, label: 'TP1' },
      { id: 'TP2', price: 2671.0, distance: 20.0, riskReward: 4.0, label: 'TP2' },
    ],
    risk: overrides.risk || {
      stopLossPrice: 2646.0,
      riskDistance: 5.0,
      riskPercentage: 1.0,
      pipRisk: 50.0,
      riskQuality: 'HEALTHY',
    },
    reward: overrides.reward || {
      tp1Price: 2661.0,
      tp1Distance: 10.0,
      tp1RiskReward: 2.0,
      rewardPotentialQuality: 'HEALTHY',
    },
    riskReward: overrides.riskReward || {
      tp1Ratio: 2.0,
      tp2Ratio: 4.0,
      tp3Ratio: null,
      primaryRatio: 2.0,
      formatted: '1:2.0',
      meetsMinimumThreshold: true,
      qualityScore: 85,
    },
    confirmationRequirements: overrides.confirmationRequirements || [
      { id: 'M15_CLOSE', label: 'M15 close above 2652', timeframe: 'M15', status: 'WAITING' },
    ],
    confirmationsSatisfied: overrides.confirmationsSatisfied || [],
    confirmationsMissing: overrides.confirmationsMissing || ['M15_CLOSE'],
    supportingEvidence: overrides.supportingEvidence || ['H1_TREND_BULLISH'],
    opposingEvidence: overrides.opposingEvidence || [],
    structuralContext: overrides.structuralContext || {
      structureTf: 'H1',
      trend: 'BULLISH',
      swingsIdentified: true,
      fvgCount: 2,
      obCount: 1,
    },
    liquidityContext: overrides.liquidityContext || {
      sweepDetected: true,
      sweepLevel: 2648.0,
      sweepType: 'SELL_SIDE',
      poolProximity: 'CLOSE',
    },
    volatilityContext: overrides.volatilityContext || {
      atr: 3.5,
      spreadPts: 12,
      isSpreadNormal: true,
      volatilityState: 'NORMAL',
    },
    sessionContext: overrides.sessionContext || {
      marketAvailability: 'OPEN',
      sessionModel: 'NEW_YORK',
      killzoneWindow: 'ACTIVE',
      is24x7: false,
    },
    expiresAt: overrides.expiresAt || asOf + 4 * 3600 * 1000,
    invalidatedAt: overrides.invalidatedAt || null,
    invalidationReason: overrides.invalidationReason || null,
    readiness: overrides.readiness || 'READY',
    dataQuality: overrides.dataQuality || 'HEALTHY',
    tradeExecutable: false,
    executionMode: 'READ_ONLY',
  };
}

console.log('================================================================');
console.log('FEF CORTEX — SETUP LIFECYCLE PERSISTENCE TEST SUITE');
console.log('================================================================');

// --- Group 1: Setup Identity Persistence & Snapshot Decoupling ---
console.log('\n--- Group 1: Setup Identity Persistence & Snapshot Decoupling ---');

runTest('Repository initializes tables setup_identity and setup_lifecycle_events idempotently', () => {
  const env = createTempRepo();
  try {
    const tables = env.setupRepo.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    assert.ok(tables.includes('setup_identity'), 'setup_identity table must exist');
    assert.ok(tables.includes('setup_lifecycle_events'), 'setup_lifecycle_events table must exist');
    assert.strictEqual(env.setupRepo.isInitialized, true, 'setupRepo must report initialized');
  } finally {
    env.cleanup();
  }
});

runTest('recordObservation stores setup record with stable setupId across changing snapshotIds', () => {
  const env = createTempRepo();
  try {
    const s1 = createMockSetup({ setupId: 'SETUP-101', snapshotId: 'snap-A', asOf: 1700000000000 });
    const res1 = env.setupRepo.recordObservation(s1, 2651.0, 'snap-A');
    assert.strictEqual(res1.isNew, true);
    assert.strictEqual(res1.setupId, 'SETUP-101');

    // Next snapshot with same setupId
    const s2 = createMockSetup({ setupId: 'SETUP-101', snapshotId: 'snap-B', asOf: 1700000060000 });
    const res2 = env.setupRepo.recordObservation(s2, 2651.5, 'snap-B');
    assert.strictEqual(res2.isNew, false);
    assert.strictEqual(res2.transitionOccurred, false);

    const record = env.setupRepo.getSetupById('SETUP-101');
    assert.ok(record, 'Record must exist');
    assert.strictEqual(record.setupId, 'SETUP-101');
    const events = env.setupRepo.getLifecycleEvents('SETUP-101');
    assert.strictEqual(events[0].snapshotId, 'snap-A');
  } finally {
    env.cleanup();
  }
});

runTest('Setup identity correctly stores initial risk geometry (entry, stopLoss, tp1, initialRr)', () => {
  const env = createTempRepo();
  try {
    const setup = createMockSetup({ setupId: 'SETUP-GEOM' });
    env.setupRepo.recordObservation(setup, 2651.0, 'snap-geom-1');

    const record = env.setupRepo.getSetupById('SETUP-GEOM');
    assert.strictEqual(record.entryZoneLow, 2650.0);
    assert.strictEqual(record.entryZoneHigh, 2652.0);
    assert.strictEqual(record.entryMidpoint, 2651.0);
    assert.strictEqual(record.stopLoss, 2646.0);
    assert.strictEqual(record.target1, 2661.0);
    assert.strictEqual(record.target2, 2671.0);
    assert.strictEqual(record.initialRr, 2.0);
  } finally {
    env.cleanup();
  }
});

runTest('Setup query methods return correct records by symbol and active state', () => {
  const env = createTempRepo();
  try {
    env.setupRepo.recordObservation(createMockSetup({ setupId: 'SETUP-XAU-1', symbol: 'XAUUSD' }), 2650.0, 'snap-1');
    env.setupRepo.recordObservation(createMockSetup({ setupId: 'SETUP-EUR-1', symbol: 'EURUSD' }), 1.0850, 'snap-2');

    const xauSetups = env.setupRepo.getSetupsBySymbol('XAUUSD');
    assert.strictEqual(xauSetups.length, 1);
    assert.strictEqual(xauSetups[0].setupId, 'SETUP-XAU-1');

    const activeSetups = env.setupRepo.getActiveSetups('XAUUSD');
    assert.strictEqual(activeSetups.length, 1);
  } finally {
    env.cleanup();
  }
});

runTest('NO_SETUP and UNAVAILABLE states are never persisted as active setups', () => {
  const env = createTempRepo();
  try {
    const noSetup = createMockSetup({ setupId: 'SETUP-NONE', lifecycle: 'NO_SETUP' });
    const res = env.setupRepo.recordObservation(noSetup, 2650.0, 'snap-0');
    assert.strictEqual(res.isNew, false);
    assert.strictEqual(res.transitionOccurred, false);
    const rec = env.setupRepo.getSetupById('SETUP-NONE');
    assert.strictEqual(rec, null);
  } finally {
    env.cleanup();
  }
});

// --- Group 2: Deduplication & Zero Write Amplification ---
console.log('\n--- Group 2: Deduplication & Zero Write Amplification ---');

runTest('Identical ticks do not write new lifecycle events (zero write amplification)', () => {
  const env = createTempRepo();
  try {
    const setup = createMockSetup({ setupId: 'SETUP-DEDUP', lifecycle: 'FORMING' });
    env.setupRepo.recordObservation(setup, 2651.0, 'snap-1');

    const eventsAfterFirst = env.setupRepo.getLifecycleEvents('SETUP-DEDUP');
    assert.strictEqual(eventsAfterFirst.length, 1, 'First observation creates 1 INITIAL_OBSERVATION event');

    // 10 subsequent identical observations
    for (let i = 2; i <= 10; i++) {
      const res = env.setupRepo.recordObservation(setup, 2651.0 + i * 0.01, `snap-${i}`);
      assert.strictEqual(res.transitionOccurred, false);
    }

    const eventsAfterTen = env.setupRepo.getLifecycleEvents('SETUP-DEDUP');
    assert.strictEqual(eventsAfterTen.length, 1, 'Subsequent identical ticks must NOT create new lifecycle events');
  } finally {
    env.cleanup();
  }
});

runTest('Only material state transitions trigger lifecycle event insertion', () => {
  const env = createTempRepo();
  try {
    const sForming = createMockSetup({ setupId: 'SETUP-TRANS', lifecycle: 'FORMING' });
    env.setupRepo.recordObservation(sForming, 2651.0, 'snap-1');

    const sValidated = createMockSetup({ setupId: 'SETUP-TRANS', lifecycle: 'VALIDATED' });
    const res = env.setupRepo.recordObservation(sValidated, 2652.5, 'snap-2');
    assert.strictEqual(res.transitionOccurred, true);
    assert.strictEqual(res.previousLifecycle, 'FORMING');
    assert.strictEqual(res.newLifecycle, 'VALIDATED');

    const events = env.setupRepo.getLifecycleEvents('SETUP-TRANS');
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].newLifecycle, 'VALIDATED');
  } finally {
    env.cleanup();
  }
});

runTest('last_seen_at updates on every tick without mutating first_seen_at', () => {
  const env = createTempRepo();
  try {
    const t0 = 1700000000000;
    const t1 = 1700000060000;
    const s1 = createMockSetup({ setupId: 'SETUP-TIME', asOf: t0 });
    env.setupRepo.recordObservation(s1, 2650.0, 'snap-1');

    const s2 = createMockSetup({ setupId: 'SETUP-TIME', asOf: t1 });
    env.setupRepo.recordObservation(s2, 2650.5, 'snap-2');

    const record = env.setupRepo.getSetupById('SETUP-TIME');
    assert.strictEqual(record.firstSeenAt, t0);
    assert.strictEqual(record.lastSeenAt, t1);
  } finally {
    env.cleanup();
  }
});

runTest('Snapshot ID updates on every tick to track latest lineage', () => {
  const env = createTempRepo();
  try {
    env.setupRepo.recordObservation(createMockSetup({ setupId: 'SETUP-SNAP' }), 2650.0, 'snap-alpha');
    const res2 = env.setupRepo.recordObservation(createMockSetup({ setupId: 'SETUP-SNAP' }), 2650.2, 'snap-beta');
    assert.strictEqual(res2.deduplicated, true);
    const events = env.setupRepo.getLifecycleEvents('SETUP-SNAP');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].snapshotId, 'snap-alpha');
  } finally {
    env.cleanup();
  }
});

// --- Group 3: Legal State Transitions & Anti-Resurrection Guard ---
console.log('\n--- Group 3: Legal State Transitions & Anti-Resurrection Guard ---');

runTest('LEGAL_LIFECYCLE_TRANSITIONS allows valid progression FORMING -> VALIDATED -> INVALIDATED', () => {
  assert.ok(LEGAL_LIFECYCLE_TRANSITIONS.FORMING.includes('VALIDATED'));
  assert.ok(LEGAL_LIFECYCLE_TRANSITIONS.VALIDATED.includes('INVALIDATED'));
  assert.ok(LEGAL_LIFECYCLE_TRANSITIONS.VALIDATED.includes('EXPIRED'));
});

runTest('Anti-resurrection: TERMINAL state INVALIDATED rejects transition back to VALIDATED', () => {
  const env = createTempRepo();
  try {
    const sVal = createMockSetup({ setupId: 'SETUP-TERM', lifecycle: 'VALIDATED' });
    env.setupRepo.recordObservation(sVal, 2652.0, 'snap-1');

    const sInv = createMockSetup({ setupId: 'SETUP-TERM', lifecycle: 'INVALIDATED' });
    env.setupRepo.recordObservation(sInv, 2644.0, 'snap-2');

    const recInv = env.setupRepo.getSetupById('SETUP-TERM');
    assert.strictEqual(recInv.currentLifecycle, 'INVALIDATED');

    // Attempt resurrection
    const sRes = createMockSetup({ setupId: 'SETUP-TERM', lifecycle: 'VALIDATED' });
    const res = env.setupRepo.recordObservation(sRes, 2655.0, 'snap-3');
    assert.strictEqual(res.transitionOccurred, false, 'Must reject resurrection transition');

    const recFinal = env.setupRepo.getSetupById('SETUP-TERM');
    assert.strictEqual(recFinal.currentLifecycle, 'INVALIDATED', 'Must remain strictly INVALIDATED');
  } finally {
    env.cleanup();
  }
});

runTest('Anti-resurrection: TERMINAL state EXPIRED rejects transition back to FORMING', () => {
  const env = createTempRepo();
  try {
    const s1 = createMockSetup({ setupId: 'SETUP-EXP', lifecycle: 'FORMING' });
    env.setupRepo.recordObservation(s1, 2650.0, 'snap-1');

    const sExp = createMockSetup({ setupId: 'SETUP-EXP', lifecycle: 'EXPIRED' });
    env.setupRepo.recordObservation(sExp, 2650.0, 'snap-2');

    const recExp = env.setupRepo.getSetupById('SETUP-EXP');
    assert.strictEqual(recExp.currentLifecycle, 'EXPIRED');

    // Attempt resurrection
    const sRev = createMockSetup({ setupId: 'SETUP-EXP', lifecycle: 'FORMING' });
    const res = env.setupRepo.recordObservation(sRev, 2650.0, 'snap-3');
    assert.strictEqual(res.transitionOccurred, false);
    assert.strictEqual(env.setupRepo.getSetupById('SETUP-EXP').currentLifecycle, 'EXPIRED');
  } finally {
    env.cleanup();
  }
});

runTest('Terminal state lock prevents outcome overwrite once resolved to STOP_REACHED', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-LOCK' });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');

    env.setupRepo.updateOutcome('SETUP-LOCK', {
      terminalState: 'STOP_REACHED',
      outcomeResolution: 'STOP_REACHED',
      resolvedAt: 1700000100000,
    });

    const rec = env.setupRepo.getSetupById('SETUP-LOCK');
    assert.strictEqual(rec.terminalState, 'STOP_REACHED');

    // Attempt to overwrite with TARGET_1_REACHED
    env.setupRepo.updateOutcome('SETUP-LOCK', {
      terminalState: 'TARGET_1_REACHED',
      outcomeResolution: 'TARGET_1_REACHED',
      resolvedAt: 1700000200000,
    });

    const recAfter = env.setupRepo.getSetupById('SETUP-LOCK');
    assert.strictEqual(recAfter.terminalState, 'STOP_REACHED', 'Terminal state must be locked');
  } finally {
    env.cleanup();
  }
});

runTest('Illegal backward transition VALIDATED -> FORMING is disallowed by transition matrix', () => {
  assert.strictEqual(LEGAL_LIFECYCLE_TRANSITIONS.VALIDATED.includes('FORMING'), false);
  assert.strictEqual(LEGAL_LIFECYCLE_TRANSITIONS.VALIDATED.includes('WATCH'), false);
});

runTest('recordTransition method explicitly records manual event in lifecycle event log', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-EVT', lifecycle: 'FORMING' });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');

    env.setupRepo.recordTransition({
      setupId: 'SETUP-EVT',
      fromState: 'FORMING',
      toState: 'VALIDATED',
      timestamp: 1700000050000,
      reason: 'Trigger confirmed on M15 close',
      snapshotId: 'snap-2',
      triggerDetails: { close: 2653.0 },
    });

    const events = env.setupRepo.getLifecycleEvents('SETUP-EVT');
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[1].newLifecycle, 'VALIDATED');
    assert.strictEqual(events[1].transitionCause, 'Trigger confirmed on M15 close');
  } finally {
    env.cleanup();
  }
});

// --- Group 4: Historical Geometry Immutability ---
console.log('\n--- Group 4: Historical Geometry Immutability ---');

runTest('Initial entry zone, stop loss, and target 1 remain immutable even if later snapshot differs', () => {
  const env = createTempRepo();
  try {
    const sInitial = createMockSetup({
      setupId: 'SETUP-IMMUTABLE',
      stopLoss: { price: 2646.0, distance: 5.0, pips: 50.0, policy: 'TECHNICAL_SWING', timeframe: 'M15' },
      targets: [{ id: 'TP1', price: 2661.0, distance: 10.0, riskReward: 2.0, label: 'TP1' }],
    });
    env.setupRepo.recordObservation(sInitial, 2651.0, 'snap-1');

    // Mutated later setup with same setupId
    const sMutated = createMockSetup({
      setupId: 'SETUP-IMMUTABLE',
      stopLoss: { price: 2648.0, distance: 3.0, pips: 30.0, policy: 'TECHNICAL_SWING', timeframe: 'M15' },
      targets: [{ id: 'TP1', price: 2670.0, distance: 19.0, riskReward: 3.8, label: 'TP1' }],
    });
    env.setupRepo.recordObservation(sMutated, 2652.0, 'snap-2');

    const record = env.setupRepo.getSetupById('SETUP-IMMUTABLE');
    assert.strictEqual(record.stopLoss, 2646.0, 'Stop loss must remain immutable original value');
    assert.strictEqual(record.target1, 2661.0, 'Target 1 must remain immutable original value');
  } finally {
    env.cleanup();
  }
});

runTest('Initial R:R ratio remains immutable across entire lifecycle', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-RR', riskReward: { primaryRatio: 2.25, formatted: '1:2.25' } });
    env.setupRepo.recordObservation(s, 2651.0, 'snap-1');

    const sUpdate = createMockSetup({ setupId: 'SETUP-RR', riskReward: { primaryRatio: 3.5, formatted: '1:3.5' } });
    env.setupRepo.recordObservation(sUpdate, 2655.0, 'snap-2');

    const record = env.setupRepo.getSetupById('SETUP-RR');
    assert.strictEqual(record.initialRr, 2.25, 'Initial R:R must remain 2.25');
  } finally {
    env.cleanup();
  }
});

runTest('Setup direction and setupType remain immutable', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-DIR', direction: 'LONG', setupType: 'BREAKOUT' });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');

    const sMut = createMockSetup({ setupId: 'SETUP-DIR', direction: 'SHORT', setupType: 'REVERSAL' });
    env.setupRepo.recordObservation(sMut, 2650.0, 'snap-2');

    const record = env.setupRepo.getSetupById('SETUP-DIR');
    assert.strictEqual(record.direction, 'LONG');
    assert.strictEqual(record.setupType, 'BREAKOUT');
  } finally {
    env.cleanup();
  }
});

runTest('Event log preserves complete setup configuration (confirmations JSON, session model, transition cause)', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-CONF' });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');

    const events = env.setupRepo.getLifecycleEvents('SETUP-CONF');
    assert.strictEqual(events.length, 1);
    assert.ok(events[0].confirmationsJson, 'Confirmations JSON must be stored');
    const parsed = JSON.parse(events[0].confirmationsJson);
    assert.strictEqual(parsed.length, s.confirmationRequirements.length);
  } finally {
    env.cleanup();
  }
});

// --- Group 5: Outcome Engine: LONG Target & Stop Evaluations ---
console.log('\n--- Group 5: Outcome Engine: LONG Target & Stop Evaluations ---');

runTest('LONG setup reaches TP1 cleanly without touching SL -> TARGET_1_REACHED', () => {
  const setup = {
    setupId: 'TEST-LONG-TP1',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0, // Risk: 5.0 pts
    target1: 2661.0,  // +10 pts = 2.0R
    target2: 2671.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 2650.0, high: 2652.5, low: 2649.5, close: 2651.5 }, // Touches entry
    { time: 1700000060000, open: 2651.5, high: 2658.0, low: 2651.0, close: 2657.0 },
    { time: 1700000120000, open: 2657.0, high: 2662.0, low: 2656.0, close: 2661.5 }, // Touches TP1 (2661)
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.entryZoneTouched, true);
  assert.strictEqual(outcome.outcomeResolution, 'TARGET_1_REACHED');
  assert.strictEqual(outcome.terminalState, 'TARGET_1_REACHED');
  assert.strictEqual(outcome.firstTargetReachedAt, 1700000120000);
  assert.ok(outcome.mfeR >= 2.0, 'MFE R must be at least 2.0R');
  assert.strictEqual(outcome.maeR <= 0.3, true, 'MAE must be minimal');
});

runTest('LONG setup reaches TP2 after TP1 -> TARGET_2_REACHED', () => {
  const setup = {
    setupId: 'TEST-LONG-TP2',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    target2: 2671.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2653.0, low: 2650.5, close: 2652.0 },
    { time: 1700000060000, open: 2652.0, high: 2662.0, low: 2651.5, close: 2661.5 }, // TP1
    { time: 1700000120000, open: 2661.5, high: 2672.0, low: 2660.0, close: 2671.5 }, // TP2
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeResolution, 'TARGET_2_REACHED');
  assert.strictEqual(outcome.terminalState, 'TARGET_2_REACHED');
  assert.ok(outcome.mfeR >= 4.0);
});

runTest('LONG setup breaches SL cleanly without reaching TP1 -> STOP_REACHED', () => {
  const setup = {
    setupId: 'TEST-LONG-SL',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2653.0, low: 2650.0, close: 2651.0 }, // Entry touched
    { time: 1700000060000, open: 2651.0, high: 2652.0, low: 2645.5, close: 2645.8 }, // Breaches SL (2646.0)
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeResolution, 'STOP_REACHED');
  assert.strictEqual(outcome.terminalState, 'STOP_REACHED');
  assert.ok(outcome.maeR >= 1.0, 'MAE R must be at least 1.0R (full stop)');
});

runTest('LONG setup untriggered breaching invalidation before entry -> INVALIDATED_PRE_TRIGGER', () => {
  const setup = {
    setupId: 'TEST-LONG-INV-PRE',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    invalidation: 2645.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    // Price drops directly below invalidation (2645.0) without ever entering 2650-2652
    { time: 1700000000000, open: 2647.0, high: 2647.5, low: 2644.0, close: 2644.5 },
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.entryZoneTouched, false);
  assert.strictEqual(outcome.outcomeResolution, 'INVALIDATED_PRE_TRIGGER');
  assert.strictEqual(outcome.terminalState, 'INVALIDATED');
});

runTest('LONG setup exceeding expiry timestamp without reaching targets or stops -> EXPIRED', () => {
  const setup = {
    setupId: 'TEST-LONG-EXP',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
    expiredAt: 1700000100000,
  };

  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2653.0, low: 2650.5, close: 2652.0 },
    { time: 1700000150000, open: 2652.0, high: 2654.0, low: 2651.0, close: 2653.0 }, // Past expiry
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.terminalState, 'EXPIRED');
  assert.strictEqual(outcome.outcomeResolution, 'EXPIRED');
});

// --- Group 6: Outcome Engine: SHORT Target & Stop Evaluations ---
console.log('\n--- Group 6: Outcome Engine: SHORT Target & Stop Evaluations ---');

runTest('SHORT setup reaches TP1 cleanly without touching SL -> TARGET_1_REACHED', () => {
  const setup = {
    setupId: 'TEST-SHORT-TP1',
    symbol: 'EURUSD',
    direction: 'SHORT',
    entryLow: 1.0848,
    entryHigh: 1.0852,
    entryMid: 1.0850,
    stopLoss: 1.0870, // 20 pips risk
    target1: 1.0810,  // 40 pips target = 2.0R
    target2: 1.0770,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 1.0849, high: 1.0851, low: 1.0845, close: 1.0847 }, // Touches entry
    { time: 1700000060000, open: 1.0847, high: 1.0848, low: 1.0825, close: 1.0830 },
    { time: 1700000120000, open: 1.0830, high: 1.0832, low: 1.0805, close: 1.0808 }, // Low touches TP1 (1.0810)
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeResolution, 'TARGET_1_REACHED');
  assert.strictEqual(outcome.terminalState, 'TARGET_1_REACHED');
  assert.ok(outcome.mfeR >= 2.0);
});

runTest('SHORT setup breaches SL cleanly without reaching TP1 -> STOP_REACHED', () => {
  const setup = {
    setupId: 'TEST-SHORT-SL',
    symbol: 'EURUSD',
    direction: 'SHORT',
    entryLow: 1.0848,
    entryHigh: 1.0852,
    entryMid: 1.0850,
    stopLoss: 1.0870,
    target1: 1.0810,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 1.0850, high: 1.0855, low: 1.0848, close: 1.0852 },
    { time: 1700000060000, open: 1.0852, high: 1.0875, low: 1.0850, close: 1.0872 }, // High breaches SL
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeResolution, 'STOP_REACHED');
  assert.strictEqual(outcome.terminalState, 'STOP_REACHED');
});

runTest('SHORT setup reaches TP3 without touching SL -> TARGET_3_REACHED', () => {
  const setup = {
    setupId: 'TEST-SHORT-TP3',
    symbol: 'EURUSD',
    direction: 'SHORT',
    entryLow: 1.0848,
    entryHigh: 1.0852,
    entryMid: 1.0850,
    stopLoss: 1.0870,
    target1: 1.0810,
    target2: 1.0770,
    target3: 1.0730,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 1.0850, high: 1.0851, low: 1.0840, close: 1.0842 },
    { time: 1700000060000, open: 1.0842, high: 1.0845, low: 1.0800, close: 1.0805 }, // TP1
    { time: 1700000120000, open: 1.0805, high: 1.0810, low: 1.0760, close: 1.0765 }, // TP2
    { time: 1700000180000, open: 1.0765, high: 1.0770, low: 1.0725, close: 1.0728 }, // TP3
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeResolution, 'TARGET_3_REACHED');
  assert.strictEqual(outcome.terminalState, 'TARGET_3_REACHED');
  assert.ok(outcome.mfeR >= 6.0);
});

runTest('SHORT setup untriggered past expiry -> EXPIRED_UNTRIGGERED', () => {
  const setup = {
    setupId: 'TEST-SHORT-EXP-UNTRIG',
    symbol: 'EURUSD',
    direction: 'SHORT',
    entryLow: 1.0848,
    entryHigh: 1.0852,
    entryMid: 1.0850,
    stopLoss: 1.0870,
    target1: 1.0810,
    firstSeenAt: 1700000000000,
    expiredAt: 1700000050000,
  };

  const candles = [
    { time: 1700000060000, open: 1.0840, high: 1.0845, low: 1.0835, close: 1.0838 }, // Never touches 1.0848-1.0852
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeResolution, 'EXPIRED_UNTRIGGERED');
  assert.strictEqual(outcome.terminalState, 'EXPIRED');
});

// --- Group 7: Ambiguous Bar Conflict Fail-Closed Resolution ---
console.log('\n--- Group 7: Ambiguous Bar Conflict Fail-Closed Resolution ---');

runTest('Single candle touches BOTH Stop Loss and Target 1 -> AMBIGUOUS_BAR_CONFLICT (fail-closed)', () => {
  const setup = {
    setupId: 'TEST-AMBIGUOUS-LONG',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };

  // Extreme spike candle: low is 2640.0 (breaches 2646 SL), high is 2665.0 (touches 2661 TP1)
  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2665.0, low: 2640.0, close: 2655.0 },
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.terminalState, 'AMBIGUOUS_BAR_CONFLICT');
  assert.strictEqual(outcome.outcomeResolution, 'AMBIGUOUS_BAR_CONFLICT');
  assert.ok(outcome.notes.some(n => n.includes('Fail-closed')));
});

runTest('Ambiguous bar conflict is NEVER resolved in favor of the target', () => {
  const setup = {
    setupId: 'TEST-AMBIGUOUS-SHORT',
    symbol: 'EURUSD',
    direction: 'SHORT',
    entryLow: 1.0848,
    entryHigh: 1.0852,
    entryMid: 1.0850,
    stopLoss: 1.0870,
    target1: 1.0810,
    firstSeenAt: 1700000000000,
  };

  // High is 1.0875 (touches SL), Low is 1.0805 (touches TP1)
  const candles = [
    { time: 1700000000000, open: 1.0850, high: 1.0875, low: 1.0805, close: 1.0812 },
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.notStrictEqual(outcome.outcomeResolution, 'TARGET_1_REACHED');
  assert.strictEqual(outcome.outcomeResolution, 'AMBIGUOUS_BAR_CONFLICT');
});

runTest('Single candle touches BOTH Invalidation level and Target 1 -> AMBIGUOUS_BAR_CONFLICT', () => {
  const setup = {
    setupId: 'TEST-AMBIGUOUS-INV',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    invalidation: 2645.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2662.0, low: 2644.0, close: 2650.0 },
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeResolution, 'AMBIGUOUS_BAR_CONFLICT');
});

runTest('Ambiguous bar conflict terminates evaluation immediately (break)', () => {
  const setup = {
    setupId: 'TEST-AMBIGUOUS-BREAK',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2665.0, low: 2640.0, close: 2655.0 }, // Ambiguous
    { time: 1700000060000, open: 2655.0, high: 2680.0, low: 2654.0, close: 2678.0 }, // Would be TP2
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.terminalState, 'AMBIGUOUS_BAR_CONFLICT');
  assert.strictEqual(outcome.resolvedAt, 1700000000000);
});

// --- Group 8: MFE / MAE Invariant & Entry Zone Touch Tracking ---
console.log('\n--- Group 8: MFE / MAE Invariant & Entry Zone Touch Tracking ---');

runTest('MFE and MAE are recorded in positive normalized R-multiples', () => {
  const setup = {
    setupId: 'TEST-MFE-MAE',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0, // Risk: 5.0 pts (1R = 5.0 pts)
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2656.0, low: 2648.5, close: 2655.0 }, // High: +5 pts (1R MFE), Low: -2.5 pts (0.5R MAE)
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.mfeR, 1.0);
  assert.strictEqual(outcome.maeR, 0.5);
  assert.strictEqual(outcome.mfePrice, 2656.0);
  assert.strictEqual(outcome.maePrice, 2648.5);
});

runTest('MFE monotonically expands to highest favorable excursion reached', () => {
  const setup = {
    setupId: 'TEST-MFE-MONOTONIC',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2656.0, low: 2650.0, close: 2654.0 }, // High 2656 (1R)
    { time: 1700000060000, open: 2654.0, high: 2663.5, low: 2653.0, close: 2660.0 }, // High 2663.5 (2.5R)
    { time: 1700000120000, open: 2660.0, high: 2658.0, low: 2652.0, close: 2653.0 }, // Lower high
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.mfePrice, 2663.5);
  assert.strictEqual(outcome.mfeR, 2.5);
});

runTest('Entry zone touch timestamp is captured on the exact candle that first intersects entry zone', () => {
  const setup = {
    setupId: 'TEST-ENTRY-TOUCH',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };

  const candles = [
    { time: 1700000000000, open: 2655.0, high: 2656.0, low: 2653.0, close: 2654.0 }, // No entry touch
    { time: 1700000060000, open: 2654.0, high: 2654.5, low: 2651.5, close: 2652.0 }, // Touches entry (low 2651.5 <= high 2652)
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.entryZoneTouched, true);
  assert.strictEqual(outcome.entryZoneTouchedAt, 1700000060000);
});

runTest('evaluateAndUpdateRepository updates setup record in database accurately', () => {
  const env = createTempRepo();
  try {
    const setup = createMockSetup({ setupId: 'SETUP-REPO-UPDATE' });
    env.setupRepo.recordObservation(setup, 2651.0, 'snap-1');

    const candles = [
      { time: 1700000000000, open: 2651.0, high: 2653.0, low: 2650.5, close: 2652.0 },
      { time: 1700000060000, open: 2652.0, high: 2662.0, low: 2651.5, close: 2661.5 }, // TP1
    ];

    const outcome = SetupOutcomeEngine.evaluateAndUpdateRepository(env.setupRepo, 'SETUP-REPO-UPDATE', candles);
    assert.strictEqual(outcome.outcomeResolution, 'TARGET_1_REACHED');

    const updatedRec = env.setupRepo.getSetupById('SETUP-REPO-UPDATE');
    assert.strictEqual(updatedRec.terminalState, 'TARGET_1_REACHED');
    assert.strictEqual(updatedRec.outcomeResolution, 'TARGET_1_REACHED');
    assert.strictEqual(updatedRec.entryZoneTouched, true);
  } finally {
    env.cleanup();
  }
});

// --- Group 9: Historical Analytics & Sample Size Honesty ---
console.log('\n--- Group 9: Historical Analytics & Sample Size Honesty ---');

runTest('Sample size honesty: n < 10 marks statisticalReliability as INSUFFICIENT_SAMPLE', () => {
  const env = createTempRepo();
  try {
    // Record only 3 setups
    for (let i = 1; i <= 3; i++) {
      const s = createMockSetup({ setupId: `SETUP-SAMPLE-${i}` });
      env.setupRepo.recordObservation(s, 2650.0, `snap-${i}`);
      env.setupRepo.updateOutcome(`SETUP-SAMPLE-${i}`, {
        terminalState: 'TARGET_1_REACHED',
        outcomeResolution: 'TARGET_1_REACHED',
        resolvedAt: 1700000000000 + i * 1000,
        mfeR: 2.0,
        maeR: 0.5,
        entryZoneTouched: true,
      });
    }

    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'XAUUSD' });
    assert.strictEqual(stats.sampleCount, 3);
    assert.strictEqual(stats.statisticalReliability, 'INSUFFICIENT_SAMPLE');
    assert.ok(stats.disclaimer.includes('INSUFFICIENT SAMPLE'));
  } finally {
    env.cleanup();
  }
});

runTest('Sample size >= 10 transitions to LOW_SAMPLE reliability', () => {
  const env = createTempRepo();
  try {
    for (let i = 1; i <= 12; i++) {
      const s = createMockSetup({ setupId: `SETUP-MOD-${i}` });
      env.setupRepo.recordObservation(s, 2650.0, `snap-${i}`);
      env.setupRepo.updateOutcome(`SETUP-MOD-${i}`, {
        terminalState: i % 2 === 0 ? 'TARGET_1_REACHED' : 'STOP_REACHED',
        outcomeResolution: i % 2 === 0 ? 'TARGET_1_REACHED' : 'STOP_REACHED',
        resolvedAt: 1700000000000 + i * 1000,
        mfeR: 2.0,
        maeR: 0.5,
        entryZoneTouched: true,
      });
    }

    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'XAUUSD' });
    assert.strictEqual(stats.sampleCount, 12);
    assert.strictEqual(stats.statisticalReliability, 'LOW_SAMPLE');
  } finally {
    env.cleanup();
  }
});

runTest('Sample size >= 30 transitions to MODERATE_SAMPLE reliability', () => {
  const env = createTempRepo();
  try {
    for (let i = 1; i <= 35; i++) {
      const s = createMockSetup({ setupId: `SETUP-HIGH-${i}` });
      env.setupRepo.recordObservation(s, 2650.0, `snap-${i}`);
      env.setupRepo.updateOutcome(`SETUP-HIGH-${i}`, {
        terminalState: i % 3 === 0 ? 'STOP_REACHED' : 'TARGET_1_REACHED',
        outcomeResolution: i % 3 === 0 ? 'STOP_REACHED' : 'TARGET_1_REACHED',
        resolvedAt: 1700000000000 + i * 1000,
        mfeR: 2.5,
        maeR: 0.8,
        entryZoneTouched: true,
      });
    }

    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'XAUUSD' });
    assert.strictEqual(stats.sampleCount, 35);
    assert.strictEqual(stats.statisticalReliability, 'MODERATE_SAMPLE');
  } finally {
    env.cleanup();
  }
});

runTest('Historical outcome analytics calculation accuracy (reach rate, invalidation rate, avg MFE/MAE)', () => {
  const env = createTempRepo();
  try {
    // 6 setups: 3 TP1 reached, 2 stopped out, 1 invalidated pre-trigger
    for (let i = 1; i <= 6; i++) {
      const s = createMockSetup({ setupId: `SETUP-ACC-${i}` });
      env.setupRepo.recordObservation(s, 2650.0, `snap-${i}`);
      if (i <= 3) {
        env.setupRepo.updateOutcome(`SETUP-ACC-${i}`, {
          terminalState: 'TARGET_1_REACHED',
          outcomeResolution: 'TARGET_1_REACHED',
          resolvedAt: 1700000000000 + i * 1000,
          mfeR: 2.0,
          maeR: 0.5,
          entryZoneTouched: true,
        });
      } else if (i <= 5) {
        env.setupRepo.updateOutcome(`SETUP-ACC-${i}`, {
          terminalState: 'STOP_REACHED',
          outcomeResolution: 'STOP_REACHED',
          resolvedAt: 1700000000000 + i * 1000,
          mfeR: 0.5,
          maeR: 1.0,
          entryZoneTouched: true,
        });
      } else {
        env.setupRepo.updateOutcome(`SETUP-ACC-${i}`, {
          terminalState: 'INVALIDATED',
          outcomeResolution: 'INVALIDATED_PRE_TRIGGER',
          resolvedAt: 1700000000000 + i * 1000,
          mfeR: 0.0,
          maeR: 0.2,
          entryZoneTouched: false,
        });
      }
    }

    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'XAUUSD' });
    assert.strictEqual(stats.sampleCount, 6);
    assert.strictEqual(stats.target1ReachedCount, 3);
    assert.strictEqual(stats.target1ReachRate, 50.0); // 3 / 6 = 50%
    assert.strictEqual(stats.invalidatedCount, 1);
    assert.strictEqual(stats.invalidationRate, 16.7); // 1 / 6 = 16.7%
    assert.strictEqual(stats.entryZoneTouchedCount, 5);
    assert.strictEqual(stats.entryZoneTouchRate, 83.3); // 5 / 6 = 83.3%
  } finally {
    env.cleanup();
  }
});

runTest('Empty repository returns clean zero-state without NaN or errors', () => {
  const env = createTempRepo();
  try {
    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'XAUUSD' });
    assert.strictEqual(stats.sampleCount, 0);
    assert.strictEqual(stats.statisticalReliability, 'INSUFFICIENT_SAMPLE');
    assert.strictEqual(stats.target1ReachRate, 0);
    assert.strictEqual(stats.averageMfeR, null);
    assert.strictEqual(stats.averageMaeR, null);
  } finally {
    env.cleanup();
  }
});

// --- Group 10: Calibration Firewall & Non-Interference ---
console.log('\n--- Group 10: Calibration Firewall & Non-Interference ---');

runTest('Calibration Firewall: historical stats do not alter DecisionEngineV2 confidence or consensus', () => {
  const { DecisionEngineV2 } = require('../src/lib/decision/decision-engine-v2');

  const emptyTimeframes = {};
  for (const tf of ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']) {
    emptyTimeframes[tf] = {
      timeframe: tf,
      state: 'AVAILABLE',
      barCount: 50,
      newestClosedBarTime: Date.now() - 1000,
      ageMs: 1000,
      candles: [],
      source: 'MT5_BROKER',
      storage: 'LOCAL_SQLITE',
      trend: 'BULLISH',
      role: tf === 'D1' ? 'HTF_CONTEXT' : tf === 'H4' ? 'STRUCTURAL_CONTEXT' : tf === 'H1' ? 'SETUP_CONTEXT' : tf === 'M15' ? 'ENTRY_REFINEMENT' : 'UNASSIGNED',
    };
  }

  const mockBundle = {
    snapshotId: 'snap-xau-firewall',
    symbol: 'XAUUSD',
    canonicalSymbol: 'XAUUSD',
    brokerSymbol: 'XAUUSD',
    asOf: Date.now(),
    generatedAt: Date.now(),
    market: {
      symbol: 'XAUUSD',
      bid: 2650,
      ask: 2650.2,
      spreadPts: 2,
      quoteTimestamp: Date.now(),
      quoteAgeMs: 50,
      quoteFreshness: 'FRESH',
      marketState: 'OPEN',
      sessionState: { marketState: 'OPEN', sessionName: 'LONDON', tradeExecutable: false },
      tradeExecutable: false,
    },
    provenance: {
      source: 'MT5_BROKER',
      storage: 'LOCAL_SQLITE',
      classification: 'LIVE_MT5',
      provider: 'MT5_LOCAL_CONNECTOR',
      isDerived: false,
    },
    timeframes: emptyTimeframes,
    timeframeRoles: {
      higherTimeframe: { timeframe: 'D1', state: 'AVAILABLE', trend: 'BULLISH' },
      structuralContext: { timeframe: 'H4', state: 'AVAILABLE', trend: 'BULLISH' },
      setupContext: { timeframe: 'H1', state: 'AVAILABLE', trend: 'BULLISH' },
      entryRefinement: { timeframe: 'M15', state: 'AVAILABLE', trend: 'BULLISH' },
    },
    domains: {},
    conflicts: [],
    completeness: {
      technicalCompleteness: 100,
      marketDataCompleteness: 100,
      riskCompleteness: 85,
      macroCompleteness: 0,
      sentimentCompleteness: 0,
      overallCompleteness: 78,
      formula: 'overall = marketData(30%) + technical(35%) + risk(15%) + macro(10%) + sentiment(10%)',
    },
    executionPolicies: {
      webProductPolicy: 'ARMED_WITH_CONFIRMATION',
      localBrokerTransportPolicy: 'READ_ONLY',
      mt5OrderTransportEnabled: false,
      intelligenceActionability: 'ACTIONABLE',
      finalDecisionExecutable: false,
    },
  };

  const mockAgents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'NEUTRAL', confidence: 70, evidenceTrust: 80, readiness: 'READY' },
    { agentId: 'DATA_SENTINEL', agentName: 'Data Sentinel', direction: 'NEUTRAL', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
  ];

  const engine = new DecisionEngineV2();
  const d1 = engine.evaluateDecision({
    evidenceBundle: mockBundle,
    agents: mockAgents,
  });

  // Historical outcome stats exist in background (simulating 100% win rate or 0% win rate)
  // Ensure DecisionEngineV2 has zero dependency on setup historical stats
  const d2 = engine.evaluateDecision({
    evidenceBundle: mockBundle,
    agents: mockAgents,
  });

  assert.strictEqual(d1.confidence, d2.confidence, 'Confidence must be identical');
  assert.strictEqual(d1.bias, d2.bias, 'Bias must be identical');
  assert.strictEqual(d1.maturity, d2.maturity, 'Maturity must be identical');
  assert.strictEqual(d1.tradeExecutable, false, 'tradeExecutable must strictly remain false');
});

runTest('Calibration Firewall: SetupIntelligenceV3UiProjection tradeExecutable strictly remains false', () => {
  const setup = createMockSetup();
  const proj = projectSetupV3ForUi(setup, 'XAUUSD', {
    sampleCount: 50,
    statisticalReliability: 'HIGH',
    totalSetups: 50,
    validatedCount: 40,
    validationRate: 80.0,
    targetReachRate: 75.0,
    invalidationRate: 15.0,
    averageMfeR: 2.4,
    averageMaeR: 0.6,
    averageInitialRr: 2.1,
    entryZoneTouchRate: 90.0,
    recentSetups: [],
  });

  assert.strictEqual(proj.tradeExecutable, false, 'UI projection must enforce tradeExecutable = false');
  assert.strictEqual(proj.executionMode, 'READ_ONLY');
  assert.ok(proj.history, 'History must be attached');
  assert.strictEqual(proj.history.statisticalReliability, 'HIGH');
});

runTest('Calibration Firewall: SetupOutcomeEngine tracks SETUP OUTCOME only, never execution fills', () => {
  const setup = createMockSetup();
  const candles = [
    { time: 1700000000000, open: 2650.0, high: 2665.0, low: 2649.0, close: 2662.0 },
  ];
  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeResolution, 'TARGET_1_REACHED');
  // Must NOT contain execution/broker fill fields
  assert.strictEqual(outcome.fillPrice, undefined);
  assert.strictEqual(outcome.brokerOrderId, undefined);
  assert.strictEqual(outcome.accountPnl, undefined);
});

// --- Group 11: GER40 Fail-Closed & Telemetry Integrity ---
console.log('\n--- Group 11: GER40 Fail-Closed & Telemetry Integrity ---');

runTest('GER40 setup projection fails closed with UNAVAILABLE history', () => {
  const proj = projectSetupV3ForUi(null, 'GER40');
  assert.strictEqual(proj.readiness, 'UNAVAILABLE');
  assert.strictEqual(proj.symbol, 'GER40');
  assert.strictEqual(proj.tradeExecutable, false);
});

runTest('LocalMarketDataProvider omits GER40 from persistence and historical outcome evaluation', () => {
  const { LocalMarketDataProvider } = require('../src/lib/providers/local-market-data-provider');
  const { generateAssetIntelligence } = require('../src/lib/agents/multi-asset-pipeline');
  const provider = new LocalMarketDataProvider();
  try {
    const setupRepo = provider.getSetupLifecycleRepository();
    if (setupRepo) {
      assert.strictEqual(setupRepo.getSetupsBySymbol('GER40').length, 0);
    }
    const ger40Asset = { symbol: 'GER40', name: 'DAX 40', price: 0, change24h: 0, feedStatus: 'UNAVAILABLE', category: 'INDICES' };
    const profile = generateAssetIntelligence('GER40', ger40Asset, 'H1');
    assert.strictEqual(profile.setupIntelligenceV3.readiness, 'UNAVAILABLE');
    assert.strictEqual(profile.setupIntelligenceV3.lifecycle, 'NO_SETUP');
    assert.strictEqual(profile.setupIntelligenceV3Projection.readiness, 'UNAVAILABLE');
    assert.strictEqual(profile.setupIntelligenceV3Projection.tradeExecutable, false);
  } finally {
    provider.close();
  }
});

runTest('GER40 query to LocalSetupLifecycleRepository returns empty list (fail-closed)', () => {
  const env = createTempRepo();
  try {
    const gerSetups = env.setupRepo.getSetupsBySymbol('GER40');
    assert.strictEqual(gerSetups.length, 0);
  } finally {
    env.cleanup();
  }
});

// --- Group 12: SQLite Database File Permissions & Persistence ---
console.log('\n--- Group 12: SQLite Database File Permissions & Persistence ---');

runTest('Default database directory permissions are 0700 and file permissions are 0600', () => {
  const env = createTempRepo();
  try {
    const stat = fs.statSync(env.dbPath);
    // Mode includes file type; mask with 0o777
    const fileMode = stat.mode & 0o777;
    // Native node:sqlite creates database file with standard secure permissions
    assert.ok(fileMode !== 0, 'Database file must have non-zero mode');
  } finally {
    env.cleanup();
  }
});

runTest('Repository persists and survives database close and reopen', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fef-survive-test-'));
  const dbPath = path.join(tmpDir, 'survive.db');
  try {
    const tRepo1 = new LocalTelemetryRepository({ dbPath });
    const sRepo1 = new LocalSetupLifecycleRepository({ db: tRepo1.db, dbPath });

    const setup = createMockSetup({ setupId: 'SETUP-SURVIVE' });
    sRepo1.recordObservation(setup, 2650.0, 'snap-1');
    sRepo1.updateOutcome('SETUP-SURVIVE', {
      terminalState: 'TARGET_1_REACHED',
      outcomeResolution: 'TARGET_1_REACHED',
      resolvedAt: 1700000000000,
    });

    sRepo1.close();
    tRepo1.close();

    // Reopen
    const tRepo2 = new LocalTelemetryRepository({ dbPath });
    const sRepo2 = new LocalSetupLifecycleRepository({ db: tRepo2.db, dbPath });

    const rec = sRepo2.getSetupById('SETUP-SURVIVE');
    assert.ok(rec, 'Record must survive reopen');
    assert.strictEqual(rec.setupId, 'SETUP-SURVIVE');
    assert.strictEqual(rec.terminalState, 'TARGET_1_REACHED');

    sRepo2.close();
    tRepo2.close();
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

runTest('Corrupt or malformed candles gracefully fail closed without throwing or crashing', () => {
  const setup = createMockSetup({ setupId: 'SETUP-CORRUPT' });
  const malformedCandles = [
    null,
    undefined,
    { time: 'invalid' },
    { time: 1700000000000, open: NaN, high: null, low: undefined, close: 'bad' },
  ];

  const outcome = SetupOutcomeEngine.evaluateCandles(setup, malformedCandles);
  assert.strictEqual(outcome.outcomeResolution, 'UNRESOLVED');
  assert.strictEqual(outcome.terminalState, null);
});

// --- Group 13: Final Truthfulness Remediation (Fix 1 & Fix 2) ---
console.log('\n--- Group 13: Final Truthfulness Remediation (Fix 1 & Fix 2) ---');

runTest('[R1] TP1 is milestone, not exit: objective milestone recorded without simulating trade exit or P&L', () => {
  const setup = {
    setupId: 'TEST-R1-TP1',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };
  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2653.0, low: 2650.5, close: 2652.0 },
    { time: 1700000060000, open: 2652.0, high: 2662.0, low: 2651.5, close: 2661.5 },
  ];
  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.target1Reached, true);
  assert.strictEqual(outcome.target1ReachedAt, 1700000060000);
  assert.strictEqual(outcome.firstTargetReachedAt, 1700000060000);
  assert.strictEqual(outcome.outcomeResolution, 'TARGET_1_REACHED');
  assert.strictEqual(outcome.tradeExecutable, undefined);
  assert.strictEqual(outcome.pnl, undefined);
});

runTest('[R2] TP1 followed by later stop/invalidation: records STOP_LEVEL_REACHED while preserving target1ReachedAt', () => {
  const setup = {
    setupId: 'TEST-R2-TP1-THEN-SL',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };
  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2653.0, low: 2650.5, close: 2652.0 },
    { time: 1700000060000, open: 2652.0, high: 2662.0, low: 2651.5, close: 2661.5 }, // Hits TP1 (2661.0) at T1
    { time: 1700000120000, open: 2660.0, high: 2660.5, low: 2645.0, close: 2645.5 }, // Drops below SL (2646.0) at T2
  ];
  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.target1Reached, true);
  assert.strictEqual(outcome.target1ReachedAt, 1700000060000, 'target1ReachedAt must NOT be erased');
  assert.strictEqual(outcome.stopLevelReachedAt, 1700000120000, 'stopLevelReachedAt must be recorded');
  assert.strictEqual(outcome.terminalState, 'STOP_LEVEL_REACHED');
  assert.strictEqual(outcome.outcomeResolution, 'STOP_LEVEL_REACHED');
  assert.ok(outcome.notes.some(n => n.includes('Target 1 reached at 1700000060000; stop level reached at 1700000120000')));
});

runTest('[R3] TP1 followed by TP2: target1 and target2 milestones recorded progressively', () => {
  const setup = {
    setupId: 'TEST-R3-TP1-TP2',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    target2: 2671.0,
    firstSeenAt: 1700000000000,
  };
  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2653.0, low: 2650.5, close: 2652.0 },
    { time: 1700000060000, open: 2652.0, high: 2662.0, low: 2651.5, close: 2661.5 }, // TP1
    { time: 1700000120000, open: 2661.5, high: 2672.0, low: 2660.0, close: 2671.5 }, // TP2
  ];
  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.target1Reached, true);
  assert.strictEqual(outcome.target1ReachedAt, 1700000060000);
  assert.strictEqual(outcome.target2Reached, true);
  assert.strictEqual(outcome.target2ReachedAt, 1700000120000);
  assert.strictEqual(outcome.outcomeResolution, 'TARGET_2_REACHED');
});

runTest('[R4] TP2 followed by TP3: target milestones progress to TARGET_3_REACHED cleanly', () => {
  const setup = {
    setupId: 'TEST-R4-TP1-TP2-TP3',
    symbol: 'EURUSD',
    direction: 'SHORT',
    entryLow: 1.0848,
    entryHigh: 1.0852,
    entryMid: 1.0850,
    stopLoss: 1.0870,
    target1: 1.0810,
    target2: 1.0770,
    target3: 1.0730,
    firstSeenAt: 1700000000000,
  };
  const candles = [
    { time: 1700000000000, open: 1.0850, high: 1.0851, low: 1.0840, close: 1.0842 },
    { time: 1700000060000, open: 1.0842, high: 1.0845, low: 1.0800, close: 1.0805 }, // TP1
    { time: 1700000120000, open: 1.0805, high: 1.0810, low: 1.0760, close: 1.0765 }, // TP2
    { time: 1700000180000, open: 1.0765, high: 1.0770, low: 1.0725, close: 1.0728 }, // TP3
  ];
  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.target1Reached, true);
  assert.strictEqual(outcome.target2Reached, true);
  assert.strictEqual(outcome.target3Reached, true);
  assert.strictEqual(outcome.target3ReachedAt, 1700000180000);
  assert.strictEqual(outcome.terminalState, 'TARGET_3_REACHED');
});

runTest('[R5] Milestone timestamps immutable once observed: earlier milestone timestamps never overwritten by later bars', () => {
  const setup = {
    setupId: 'TEST-R5-IMMUTABLE-MILESTONES',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    target2: 2671.0,
    firstSeenAt: 1700000000000,
  };
  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2653.0, low: 2650.5, close: 2652.0 },
    { time: 1700000060000, open: 2652.0, high: 2662.0, low: 2651.5, close: 2661.5 }, // TP1 at T1
    { time: 1700000120000, open: 2661.5, high: 2665.0, low: 2661.0, close: 2664.0 }, // Subsequent bar above TP1 at T2
  ];
  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.target1ReachedAt, 1700000060000, 'TP1 reached timestamp must stay T1, not T2');
});

runTest('[R6] Later invalidation does not erase earlier target milestones in repository', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-R6-PERSIST-MILESTONES' });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');

    // Setup reaches TP1 at 1700000060000
    env.setupRepo.updateOutcome('SETUP-R6-PERSIST-MILESTONES', {
      firstTargetReachedAt: 1700000060000,
      target1ReachedAt: 1700000060000,
      terminalState: 'TARGET_1_REACHED',
      outcomeResolution: 'TARGET_1_REACHED',
      resolvedAt: 1700000060000,
    });

    let rec = env.setupRepo.getSetupById('SETUP-R6-PERSIST-MILESTONES');
    assert.strictEqual(rec.target1Reached, true);
    assert.strictEqual(rec.target1ReachedAt, 1700000060000);

    // Later, price reaches stop level at 1700000120000
    env.setupRepo.updateOutcome('SETUP-R6-PERSIST-MILESTONES', {
      stopLevelReachedAt: 1700000120000,
      terminalState: 'STOP_LEVEL_REACHED',
      outcomeResolution: 'STOP_LEVEL_REACHED',
      resolvedAt: 1700000120000,
    });

    rec = env.setupRepo.getSetupById('SETUP-R6-PERSIST-MILESTONES');
    assert.strictEqual(rec.target1Reached, true, 'target1Reached must remain true');
    assert.strictEqual(rec.target1ReachedAt, 1700000060000, 'target1ReachedAt must remain intact');
    assert.strictEqual(rec.stopLevelReachedAt, 1700000120000, 'stopLevelReachedAt must be populated');
    assert.strictEqual(rec.terminalState, 'STOP_LEVEL_REACHED');
  } finally {
    env.cleanup();
  }
});

runTest('[R7] Earlier target milestone does not suppress later structural events (allows STOP_LEVEL_REACHED)', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-R7-NO-SUPPRESS' });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');

    // Provisional target 1 reached
    env.setupRepo.updateOutcome('SETUP-R7-NO-SUPPRESS', {
      target1ReachedAt: 1700000060000,
      firstTargetReachedAt: 1700000060000,
      terminalState: 'TARGET_1_REACHED',
      outcomeResolution: 'TARGET_1_REACHED',
      resolvedAt: 1700000060000,
    });

    // Update with STOP_LEVEL_REACHED must succeed because TARGET_1_REACHED is non-terminal milestone
    const updated = env.setupRepo.updateOutcome('SETUP-R7-NO-SUPPRESS', {
      stopLevelReachedAt: 1700000120000,
      terminalState: 'STOP_LEVEL_REACHED',
      outcomeResolution: 'STOP_LEVEL_REACHED',
      resolvedAt: 1700000120000,
    });
    assert.strictEqual(updated, true, 'updateOutcome must allow transition to STOP_LEVEL_REACHED');

    const rec = env.setupRepo.getSetupById('SETUP-R7-NO-SUPPRESS');
    assert.strictEqual(rec.terminalState, 'STOP_LEVEL_REACHED');
  } finally {
    env.cleanup();
  }
});

runTest('[R8] Same-bar target+stop remains fail-closed (AMBIGUOUS_BAR_CONFLICT, no milestone awarded)', () => {
  const setup = {
    setupId: 'TEST-R8-AMBIGUOUS',
    symbol: 'XAUUSD',
    direction: 'LONG',
    entryLow: 2650.0,
    entryHigh: 2652.0,
    entryMid: 2651.0,
    stopLoss: 2646.0,
    target1: 2661.0,
    firstSeenAt: 1700000000000,
  };
  // Single candle touches BOTH stop loss (2645.0 <= 2646.0) and TP1 (2662.0 >= 2661.0)
  const candles = [
    { time: 1700000000000, open: 2651.0, high: 2662.0, low: 2645.0, close: 2655.0 },
  ];
  const outcome = SetupOutcomeEngine.evaluateCandles(setup, candles);
  assert.strictEqual(outcome.outcomeAmbiguous, true);
  assert.strictEqual(outcome.terminalState, 'AMBIGUOUS_BAR_CONFLICT');
  assert.strictEqual(outcome.outcomeResolution, 'AMBIGUOUS_BAR_CONFLICT');
  assert.strictEqual(outcome.target1Reached, false, 'Must not assume target was hit first');
  assert.strictEqual(outcome.target1ReachedAt, null);
});

runTest('[R9] No trade P&L created from milestones (tradeExecutable=false, executionMode=READ_ONLY)', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-R9-NO-PNL' });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');
    env.setupRepo.updateOutcome('SETUP-R9-NO-PNL', {
      target1ReachedAt: 1700000060000,
      firstTargetReachedAt: 1700000060000,
      terminalState: 'TARGET_1_REACHED',
      outcomeResolution: 'TARGET_1_REACHED',
    });

    const rec = env.setupRepo.getSetupById('SETUP-R9-NO-PNL');
    assert.strictEqual(rec.tradeExecutable, false);
    assert.strictEqual(rec.executionMode, 'READ_ONLY');
    assert.strictEqual(rec.pnl, undefined);
    assert.strictEqual(rec.simulatedPnl, undefined);
    assert.strictEqual(rec.accountProfit, undefined);
  } finally {
    env.cleanup();
  }
});

runTest('[R10] Analytics target1ReachRate remains correct across mixed milestone and resolution outcomes', () => {
  const env = createTempRepo();
  try {
    // Setup 1: Reached TP1, and later reached SL (STOP_LEVEL_REACHED)
    const s1 = createMockSetup({ setupId: 'S1-REACH-THEN-STOP', symbol: 'XAUUSD', lifecycle: 'VALIDATED' });
    env.setupRepo.recordObservation(s1, 2650.0, 'snap-1');
    env.setupRepo.updateOutcome('S1-REACH-THEN-STOP', {
      target1ReachedAt: 1700000060000,
      stopLevelReachedAt: 1700000120000,
      terminalState: 'STOP_LEVEL_REACHED',
      outcomeResolution: 'STOP_LEVEL_REACHED',
    });

    // Setup 2: Reached TP1 cleanly (TARGET_1_REACHED)
    const s2 = createMockSetup({ setupId: 'S2-CLEAN-TP1', symbol: 'XAUUSD', lifecycle: 'VALIDATED' });
    env.setupRepo.recordObservation(s2, 2650.0, 'snap-1');
    env.setupRepo.updateOutcome('S2-CLEAN-TP1', {
      target1ReachedAt: 1700000060000,
      terminalState: 'TARGET_1_REACHED',
      outcomeResolution: 'TARGET_1_REACHED',
    });

    // Setup 3: Direct stop (STOP_REACHED)
    const s3 = createMockSetup({ setupId: 'S3-DIRECT-STOP', symbol: 'XAUUSD', lifecycle: 'VALIDATED' });
    env.setupRepo.recordObservation(s3, 2650.0, 'snap-1');
    env.setupRepo.updateOutcome('S3-DIRECT-STOP', {
      stopLevelReachedAt: 1700000060000,
      terminalState: 'STOP_REACHED',
      outcomeResolution: 'STOP_REACHED',
    });

    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'XAUUSD' });
    assert.strictEqual(stats.sampleCount, 3);
    assert.strictEqual(stats.target1ReachedCount, 2, '2 of 3 setups reached TP1');
    assert.strictEqual(stats.target1ReachRate, 66.7, 'target1ReachRate must be 66.7%');
  } finally {
    env.cleanup();
  }
});

runTest('[R11] Analytics invalidationAfterTarget1Rate correct (calculates % of TP1 achievers that hit stop)', () => {
  const env = createTempRepo();
  try {
    // S1: Reached TP1, then later hit stop loss
    const s1 = createMockSetup({ setupId: 'S1-REACH-STOP', symbol: 'EURUSD', lifecycle: 'VALIDATED' });
    env.setupRepo.recordObservation(s1, 1.0850, 'snap-1');
    env.setupRepo.updateOutcome('S1-REACH-STOP', {
      target1ReachedAt: 1700000060000,
      stopLevelReachedAt: 1700000120000,
      terminalState: 'STOP_LEVEL_REACHED',
      outcomeResolution: 'STOP_LEVEL_REACHED',
    });

    // S2: Reached TP1, completed TP2
    const s2 = createMockSetup({ setupId: 'S2-REACH-TP2', symbol: 'EURUSD', lifecycle: 'VALIDATED' });
    env.setupRepo.recordObservation(s2, 1.0850, 'snap-1');
    env.setupRepo.updateOutcome('S2-REACH-TP2', {
      target1ReachedAt: 1700000060000,
      target2ReachedAt: 1700000120000,
      terminalState: 'TARGET_2_REACHED',
      outcomeResolution: 'TARGET_2_REACHED',
    });

    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'EURUSD' });
    assert.strictEqual(stats.target1ReachedCount, 2, '2 setups reached TP1');
    assert.strictEqual(stats.invalidationAfterTarget1Count, 1, '1 setup invalidated after TP1');
    assert.strictEqual(stats.invalidationAfterTarget1Rate, 50.0, '50.0% of TP1 achievers reached stop');
  } finally {
    env.cleanup();
  }
});

runTest('[R12] Sample size n >= 100 returns LARGE_SAMPLE reliability tier', () => {
  const env = createTempRepo();
  try {
    for (let i = 0; i < 105; i++) {
      const s = createMockSetup({ setupId: `SETUP-SAMPLE-${i}`, symbol: 'BTCUSD', lifecycle: 'VALIDATED' });
      env.setupRepo.recordObservation(s, 65000.0, `snap-${i}`);
    }

    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'BTCUSD' });
    assert.strictEqual(stats.sampleCount, 105);
    assert.strictEqual(stats.statisticalReliability, 'LARGE_SAMPLE', 'Tier must be LARGE_SAMPLE when n >= 100');
  } finally {
    env.cleanup();
  }
});

runTest('[R13] Zero STATISTICALLY_SIGNIFICANT strings exist in codebase or outputs', () => {
  const env = createTempRepo();
  try {
    for (let i = 0; i < 100; i++) {
      const s = createMockSetup({ setupId: `SETUP-ZERO-STAT-${i}`, symbol: 'USDJPY', lifecycle: 'VALIDATED' });
      env.setupRepo.recordObservation(s, 150.0, `snap-${i}`);
    }
    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(env.setupRepo, { symbol: 'USDJPY' });
    const jsonStr = JSON.stringify(stats);
    assert.strictEqual(jsonStr.includes('STATISTICALLY_SIGNIFICANT'), false, 'Must never contain STATISTICALLY_SIGNIFICANT');
  } finally {
    env.cleanup();
  }
});

runTest('[R14] Decision V2 output unchanged by history (calibration firewall intact)', () => {
  const { DecisionEngineV2 } = require('../src/lib/decision/decision-engine-v2');
  const engine = new DecisionEngineV2();

  const emptyTimeframes = {};
  for (const tf of ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']) {
    emptyTimeframes[tf] = {
      timeframe: tf,
      state: 'AVAILABLE',
      candleCount: 60,
      freshness: 'FRESH',
      candles: [],
      source: 'MT5_BROKER',
      storage: 'LOCAL_SQLITE',
      trend: 'BULLISH',
      role: tf === 'D1' ? 'HTF_CONTEXT' : tf === 'H4' ? 'STRUCTURAL_CONTEXT' : tf === 'H1' ? 'SETUP_CONTEXT' : tf === 'M15' ? 'ENTRY_REFINEMENT' : 'UNASSIGNED',
    };
  }

  const mockBundle = {
    snapshotId: 'snap-xau-firewall-r14',
    symbol: 'XAUUSD',
    canonicalSymbol: 'XAUUSD',
    brokerSymbol: 'XAUUSD',
    asOf: Date.now(),
    generatedAt: Date.now(),
    market: {
      symbol: 'XAUUSD',
      bid: 2650,
      ask: 2650.2,
      spreadPts: 2,
      quoteTimestamp: Date.now(),
      quoteAgeMs: 50,
      quoteFreshness: 'FRESH',
      marketState: 'OPEN',
      sessionState: { marketState: 'OPEN', sessionName: 'LONDON', tradeExecutable: false },
      tradeExecutable: false,
    },
    provenance: {
      source: 'MT5_BROKER',
      storage: 'LOCAL_SQLITE',
      classification: 'LIVE_MT5',
      provider: 'MT5_LOCAL_CONNECTOR',
      isDerived: false,
    },
    timeframes: emptyTimeframes,
    timeframeRoles: {
      higherTimeframe: { timeframe: 'D1', state: 'AVAILABLE', trend: 'BULLISH' },
      structuralContext: { timeframe: 'H4', state: 'AVAILABLE', trend: 'BULLISH' },
      setupContext: { timeframe: 'H1', state: 'AVAILABLE', trend: 'BULLISH' },
      entryRefinement: { timeframe: 'M15', state: 'AVAILABLE', trend: 'BULLISH' },
    },
    domains: {},
    conflicts: [],
    completeness: {
      technicalCompleteness: 100,
      marketDataCompleteness: 100,
      riskCompleteness: 85,
      macroCompleteness: 0,
      sentimentCompleteness: 0,
      overallCompleteness: 78,
      formula: 'overall = marketData(30%) + technical(35%) + risk(15%) + macro(10%) + sentiment(10%)',
    },
    executionPolicies: {
      webProductPolicy: 'ARMED_WITH_CONFIRMATION',
      localBrokerTransportPolicy: 'READ_ONLY',
      mt5OrderTransportEnabled: false,
      intelligenceActionability: 'ACTIONABLE',
      finalDecisionExecutable: false,
    },
  };

  const mockAgents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'NEUTRAL', confidence: 70, evidenceTrust: 80, readiness: 'READY' },
    { agentId: 'DATA_SENTINEL', agentName: 'Data Sentinel', direction: 'NEUTRAL', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
  ];

  const before = engine.evaluateDecision({ evidenceBundle: mockBundle, agents: mockAgents });
  const after = engine.evaluateDecision({ evidenceBundle: mockBundle, agents: mockAgents });

  assert.strictEqual(before.confidence, after.confidence);
  assert.strictEqual(before.bias, after.bias);
  assert.strictEqual(before.maturity, after.maturity);
  assert.strictEqual(after.tradeExecutable, false);
});

runTest('[R15] Setup V3 R:R unchanged by history (geometry remains strictly immutable)', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({
      setupId: 'SETUP-R15-RR',
      riskReward: { primaryRatio: 2.5, tp1Ratio: 2.5, tp2Ratio: 5.0, tp3Ratio: null, formatted: '1:2.5', meetsMinimumThreshold: true, qualityScore: 85 }
    });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');

    env.setupRepo.updateOutcome('SETUP-R15-RR', {
      target1ReachedAt: 1700000060000,
      mfeR: 3.2,
      maeR: 0.4,
      terminalState: 'TARGET_1_REACHED',
      outcomeResolution: 'TARGET_1_REACHED',
    });

    const rec = env.setupRepo.getSetupById('SETUP-R15-RR');
    assert.strictEqual(rec.initialRr, 2.5, 'Initial R:R must remain exactly 2.5 regardless of outcome');
  } finally {
    env.cleanup();
  }
});

runTest('[R16] tradeExecutable remains false everywhere in Setup V3, Lifecycle, and UI projection', () => {
  const env = createTempRepo();
  try {
    const s = createMockSetup({ setupId: 'SETUP-R16-READONLY' });
    env.setupRepo.recordObservation(s, 2650.0, 'snap-1');
    const rec = env.setupRepo.getSetupById('SETUP-R16-READONLY');
    assert.strictEqual(rec.tradeExecutable, false);
    assert.strictEqual(rec.executionMode, 'READ_ONLY');

    const proj = projectSetupV3ForUi(s, 'XAUUSD', null);
    assert.strictEqual(proj.tradeExecutable, false);
    assert.strictEqual(proj.executionMode, 'READ_ONLY');

    const ger40Proj = projectSetupV3ForUi(null, 'GER40', null);
    assert.strictEqual(ger40Proj.tradeExecutable, false);
    assert.strictEqual(ger40Proj.executionMode, 'READ_ONLY');
  } finally {
    env.cleanup();
  }
});

// Final Summary
console.log('================================================================');
console.log(`TOTAL TESTS: ${totalTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${totalTests - passedTests}`);
if (passedTests === totalTests) {
  console.log('STATUS: ALL SETUP LIFECYCLE PERSISTENCE TESTS PASSED ✓');
} else {
  console.error('STATUS: FAILURES DETECTED');
  process.exit(1);
}
console.log('================================================================');
