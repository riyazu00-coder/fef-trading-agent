/**
 * FEF CORTEX — PHASE 17 MANDATORY TP2 QUALIFICATION REGRESSION SUITE
 *
 * Verifies strict institutional Risk/Reward policy:
 * 1. A setup MUST have a valid TP2 target, and TP2_RR MUST be >= 2.0.
 * 2. TP1 MUST NOT independently qualify a setup.
 * 3. TP3 must NOT silently replace a missing or invalid TP2.
 * 4. Downstream components CANNOT override a failed TP2 qualification.
 */

import { evaluateSignalEligibility } from '../src/lib/telegram/telegram-signal-eligibility';
import { SetupIntelligenceEngineV3 } from '../src/lib/setup/setup-intelligence-v3';

console.log('===============================================================');
console.log('   FEF CORTEX: PHASE 17 TP2 QUALIFICATION REGRESSION SUITE     ');
console.log('===============================================================\n');

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    totalPassed++;
  } else {
    console.error(`  ✕ [FAIL] ${testName}`);
    if (detail) console.error(`    ↳ ${detail}`);
    totalFailed++;
  }
}

const now = Date.now();

const validDecision: any = {
  bias: 'BULLISH',
  maturity: 'VALIDATED_SETUP',
  confidence: 85,
  evidenceCompleteness: 90,
  independentDomainCount: 4,
  tradeExecutable: false,
  mt5OrderTransportEnabled: false,
  hardVetoes: [],
  conflicts: [],
};

const validTelemetry: any = {
  symbol: 'XAUUSD',
  bid: 2741.0,
  ask: 2741.4,
  spreadPoints: 4,
  timestamp: now - 2000,
  mt5Connected: true,
};

function createMockSetup(overrides: Partial<any>): any {
  return {
    version: '3.0',
    setupId: 'setup-tp2-test',
    symbol: 'XAUUSD',
    snapshotId: 'snap-tp2-test',
    asOf: now,
    lifecycle: 'VALIDATED',
    direction: 'LONG',
    setupType: 'BREAKOUT_EXPANSION',
    thesis: 'Test thesis',
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0 },
    stopLoss: { price: 2731.0, distance: 10.0 },
    targets: [
      { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
      { targetIndex: 2, label: 'TP2', price: 2766.0, rewardDistance: 25.0, riskReward: 2.50 },
    ],
    riskReward: { ratio: 2.5, formatted: '1:2.50', meetsMinimumThreshold: true },
    structuralContext: { structureTf: 'M15' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TEST GROUP 1: User-Specified Mandatory Qualification Scenarios
// ---------------------------------------------------------------------------
console.log('[TEST GROUP 1] User-Specified Mandatory Qualification Scenarios');

// Scenario 1: TP1 = 1.2R, TP2 = 2.5R -> PASS
const s1 = createMockSetup({
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
    { targetIndex: 2, label: 'TP2', price: 2766.0, rewardDistance: 25.0, riskReward: 2.50 },
  ],
  riskReward: { ratio: 2.5, formatted: '1:2.50', meetsMinimumThreshold: true },
});
const res1 = evaluateSignalEligibility(validDecision, s1, validTelemetry, new Set());
assert(res1.isEligible && res1.status === 'ELIGIBLE', 'Scenario 1: TP1 = 1.2R, TP2 = 2.5R → PASS');

// Scenario 2: TP1 = 1.5R, TP2 = 2.0R -> PASS
const s2 = createMockSetup({
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2756.0, rewardDistance: 15.0, riskReward: 1.50 },
    { targetIndex: 2, label: 'TP2', price: 2761.0, rewardDistance: 20.0, riskReward: 2.00 },
  ],
  riskReward: { ratio: 2.0, formatted: '1:2.00', meetsMinimumThreshold: true },
});
const res2 = evaluateSignalEligibility(validDecision, s2, validTelemetry, new Set());
assert(res2.isEligible && res2.status === 'ELIGIBLE', 'Scenario 2: TP1 = 1.5R, TP2 = 2.0R → PASS');

// Scenario 3: TP1 = 2.5R, TP2 = 1.5R -> FAIL (TP1 cannot independently qualify)
const s3 = createMockSetup({
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2766.0, rewardDistance: 25.0, riskReward: 2.50 },
    { targetIndex: 2, label: 'TP2', price: 2756.0, rewardDistance: 15.0, riskReward: 1.50 }, // violates geometry & sub-2.0
  ],
  riskReward: { ratio: 1.5, formatted: '1:1.50', meetsMinimumThreshold: false },
});
const res3 = evaluateSignalEligibility(validDecision, s3, validTelemetry, new Set());
assert(!res3.isEligible && res3.status === 'REJECTED_RR', 'Scenario 3: TP1 = 2.5R, TP2 = 1.5R → FAIL');

// Scenario 4: TP1 = 2.5R, TP2 missing -> FAIL (TP1 cannot independently qualify)
const s4 = createMockSetup({
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2766.0, rewardDistance: 25.0, riskReward: 2.50 },
  ],
  riskReward: { ratio: 0, formatted: 'INVALID_RR', meetsMinimumThreshold: false },
});
const res4 = evaluateSignalEligibility(validDecision, s4, validTelemetry, new Set());
assert(!res4.isEligible && res4.status === 'REJECTED_RR', 'Scenario 4: TP1 = 2.5R, TP2 missing → FAIL');

// Scenario 5: TP1 valid, TP2 invalid (e.g. price <= 0 or NaN) -> FAIL
const s5 = createMockSetup({
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
    { targetIndex: 2, label: 'TP2', price: 0, rewardDistance: 0, riskReward: 0 },
  ],
  riskReward: { ratio: 0, formatted: 'INVALID_RR', meetsMinimumThreshold: false },
});
const res5 = evaluateSignalEligibility(validDecision, s5, validTelemetry, new Set());
assert(!res5.isEligible && res5.status === 'REJECTED_RR', 'Scenario 5: TP1 valid, TP2 invalid → FAIL');

// Scenario 6: TP2 = 1.99R -> FAIL
const s6 = createMockSetup({
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
    { targetIndex: 2, label: 'TP2', price: 2760.9, rewardDistance: 19.9, riskReward: 1.99 },
  ],
  riskReward: { ratio: 1.99, formatted: '1:1.99', meetsMinimumThreshold: false },
});
const res6 = evaluateSignalEligibility(validDecision, s6, validTelemetry, new Set());
assert(!res6.isEligible && res6.status === 'REJECTED_RR', 'Scenario 6: TP2 = 1.99R → FAIL');

// ---------------------------------------------------------------------------
// TEST GROUP 2: Structural Integrity & Boundary Robustness
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Structural Integrity & Boundary Robustness');

// Test 7: TP3 must not silently replace missing TP2
const s7 = createMockSetup({
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
    { targetIndex: 3, label: 'TP3', price: 2776.0, rewardDistance: 35.0, riskReward: 3.50 },
  ],
  riskReward: { ratio: 0, formatted: 'INVALID_RR', meetsMinimumThreshold: false },
});
const res7 = evaluateSignalEligibility(validDecision, s7, validTelemetry, new Set());
assert(!res7.isEligible && res7.status === 'REJECTED_RR', 'Test 7: TP3 does not replace missing TP2 → FAIL');

// Test 8: Null TP2
const s8 = createMockSetup({
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
    null as any,
  ].filter(Boolean),
  riskReward: { ratio: 0, formatted: 'INVALID_RR', meetsMinimumThreshold: false },
});
const res8 = evaluateSignalEligibility(validDecision, s8, validTelemetry, new Set());
assert(!res8.isEligible && res8.status === 'REJECTED_RR', 'Test 8: Null TP2 → FAIL');

// Test 9: TP2 target on wrong side of entry (BUY with TP2 below entry)
const s9 = createMockSetup({
  direction: 'LONG',
  entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0 },
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
    { targetIndex: 2, label: 'TP2', price: 2735.0, rewardDistance: -6.0, riskReward: -0.60 },
  ],
  riskReward: { ratio: 0, formatted: 'INVALID_RR', meetsMinimumThreshold: false },
});
const res9 = evaluateSignalEligibility(validDecision, s9, validTelemetry, new Set());
assert(!res9.isEligible && res9.status === 'REJECTED_RR', 'Test 9: TP2 on wrong side of entry → FAIL');

// Test 10: SELL setup with TP2 on wrong side (above entry)
const sellDecision = { ...validDecision, bias: 'BEARISH' };
const s10 = createMockSetup({
  direction: 'SHORT',
  entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0 },
  stopLoss: { price: 2750.0, distance: 9.0 },
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2730.0, rewardDistance: 11.0, riskReward: 1.22 },
    { targetIndex: 2, label: 'TP2', price: 2745.0, rewardDistance: -4.0, riskReward: -0.44 },
  ],
  riskReward: { ratio: 0, formatted: 'INVALID_RR', meetsMinimumThreshold: false },
});
const res10 = evaluateSignalEligibility(sellDecision, s10, validTelemetry, new Set());
assert(!res10.isEligible && res10.status === 'REJECTED_RR', 'Test 10: SELL with TP2 above entry → FAIL');

// Test 11: Zero risk distance (SL distance = 0)
const s11 = createMockSetup({
  stopLoss: { price: 2741.0, distance: 0 },
});
const res11 = evaluateSignalEligibility(validDecision, s11, validTelemetry, new Set());
assert(!res11.isEligible, 'Test 11: Zero risk distance → FAIL');

// Test 12: Invalid negative stop loss price
const s12 = createMockSetup({
  stopLoss: { price: -5.0, distance: 10.0 },
});
const res12 = evaluateSignalEligibility(validDecision, s12, validTelemetry, new Set());
assert(!res12.isEligible, 'Test 12: Invalid negative stop loss → FAIL');

// Test 13: Floating-point precision boundary (1.999R -> FAIL)
const s13 = createMockSetup({
  stopLoss: { price: 2731.0, distance: 10.0 },
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
    { targetIndex: 2, label: 'TP2', price: 2760.99, rewardDistance: 19.99, riskReward: 1.999 },
  ],
  riskReward: { ratio: 1.999, formatted: '1:2.00', meetsMinimumThreshold: false },
});
const res13 = evaluateSignalEligibility(validDecision, s13, validTelemetry, new Set());
assert(!res13.isEligible && res13.status === 'REJECTED_RR', 'Test 13: Floating-point boundary 1.999R → FAIL');

// Test 14: Floating-point precision boundary (exactly 2.000R -> PASS)
const s14 = createMockSetup({
  stopLoss: { price: 2731.0, distance: 10.0 },
  targets: [
    { targetIndex: 1, label: 'TP1', price: 2753.0, rewardDistance: 12.0, riskReward: 1.20 },
    { targetIndex: 2, label: 'TP2', price: 2761.0, rewardDistance: 20.0, riskReward: 2.00 },
  ],
  riskReward: { ratio: 2.00, formatted: '1:2.00', meetsMinimumThreshold: true },
});
const res14 = evaluateSignalEligibility(validDecision, s14, validTelemetry, new Set());
assert(res14.isEligible && res14.status === 'ELIGIBLE', 'Test 14: Floating-point boundary exactly 2.000R → PASS');

// ---------------------------------------------------------------------------
// TEST GROUP 3: Setup Intelligence V3 Lifecycle Sync
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] Setup Intelligence V3 Lifecycle Sync');

// Test 15: Blueprint with missing TP2 cannot achieve VALIDATED lifecycle in SetupIntelligenceEngineV3
const mockBlueprintMissingTp2: any = {
  setupId: 'bp-test-missing-tp2',
  symbol: 'XAUUSD',
  direction: 'BUY',
  entryZoneHigh: { price: 2742.0 },
  entryZoneLow: { price: 2740.0 },
  sl: { price: 2729.0 },
  invalidation: { price: 2731.0 },
  tp1: { price: 2753.0 }, // 1.0R
  // tp2 missing
  rrRatio: '1:1.00',
};

const setupMissingTp2 = SetupIntelligenceEngineV3.evaluateSetup({
  symbol: 'XAUUSD',
  blueprint: mockBlueprintMissingTp2,
  decisionV2: validDecision,
  currentPrice: 2741.0,
  liveAsset: { price: 2741.0, feedStatus: 'LIVE' } as any,
});
assert(setupMissingTp2.riskReward?.meetsMinimumThreshold === false, 'Test 15a: SetupIntelligenceV3 sets meetsMinimumThreshold=false when TP2 missing');
assert(setupMissingTp2.lifecycle !== 'VALIDATED', 'Test 15b: SetupIntelligenceV3 blocks VALIDATED lifecycle when TP2 missing');

// Test 16: Blueprint with valid TP2 >= 2.0 achieves meetsMinimumThreshold=true
const mockBlueprintValidTp2: any = {
  setupId: 'bp-test-valid-tp2',
  symbol: 'XAUUSD',
  direction: 'BUY',
  entryZoneHigh: { price: 2742.0 },
  entryZoneLow: { price: 2740.0 },
  sl: { price: 2729.0 },
  invalidation: { price: 2731.0 },
  tp1: { price: 2753.0 }, // 1.0R
  tp2: { price: 2766.0 }, // 2.08R (>= 2.0)
  rrRatio: '1:2.08',
};

const setupValidTp2 = SetupIntelligenceEngineV3.evaluateSetup({
  symbol: 'XAUUSD',
  blueprint: mockBlueprintValidTp2,
  decisionV2: validDecision,
  currentPrice: 2741.0,
  liveAsset: { price: 2741.0, feedStatus: 'LIVE' } as any,
});
assert(setupValidTp2.riskReward?.meetsMinimumThreshold === true, 'Test 16a: SetupIntelligenceV3 sets meetsMinimumThreshold=true when TP2 >= 2.0');
assert((setupValidTp2.riskReward?.ratio || 0) >= 2.0, 'Test 16b: SetupIntelligenceV3 ratio reflects qualifying TP2 R:R (>= 2.0)');

console.log('\n===============================================================');
console.log(`TP2 QUALIFICATION TESTS COMPLETE: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log('===============================================================\n');

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
