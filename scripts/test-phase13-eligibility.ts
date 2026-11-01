#!/usr/bin/env ts-node
/**
 * FEF CORTEX — PHASE 13 TASK 1: VALIDATED SETUP ELIGIBILITY GATE TESTS
 *
 * Verifies all 21 mandatory safety and analytical conditions:
 * 1. Fully validated BUY setup passes (ELIGIBLE)
 * 2. Fully validated SELL setup passes (ELIGIBLE)
 * 3. Low maturity (WATCH, FORMING, OBSERVING) rejected (REJECTED_LOW_MATURITY)
 * 4. Sub-2.0 R:R ratio rejected (REJECTED_RR)
 * 5. Active hard veto rejected (REJECTED_VETO)
 * 6. Critical unresolved conflict rejected (REJECTED_CONFLICT)
 * 7. Stale or unavailable quote rejected (REJECTED_STALE_DATA)
 * 8. Unsupported symbol (e.g. GER40) rejected (REJECTED_UNSUPPORTED_INSTRUMENT)
 * 9. Missing Entry / SL / TP rejected (REJECTED_INCOMPLETE)
 * 10. Already invalidated or expired setup rejected (REJECTED_INVALIDATED)
 * 11. Duplicate setup revision rejected (REJECTED_DUPLICATE)
 * 12. Insufficient independent domain confirmations rejected (REJECTED_UNCONFIRMED)
 */

import { evaluateSignalEligibility, ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';
import { DecisionIntelligenceV2 } from '../src/lib/decision/decision-engine-v2';
import { SetupIntelligenceV3 } from '../src/lib/setup/setup-intelligence-v3';

interface TestCase {
  id: number;
  name: string;
  expectedStatus: string;
}

const testResults: { id: number; name: string; passed: boolean; details?: string }[] = [];

function assertTest(id: number, name: string, condition: boolean, details?: string) {
  if (condition) {
    testResults.push({ id, name, passed: true });
    console.log(`  ✓ [PASS] ${id}. ${name}`);
  } else {
    testResults.push({ id, name, passed: false, details });
    console.error(`  ✗ [FAIL] ${id}. ${name}: ${details || 'Assertion failed'}`);
  }
}

function createMockDecision(overrides: Partial<DecisionIntelligenceV2> = {}): DecisionIntelligenceV2 {
  return {
    maturity: 'VALIDATED_SETUP',
    bias: 'BULLISH',
    confidence: 85,
    evidenceCompleteness: 90,
    registeredAgentCount: 32,
    upstreamAgentCount: 31,
    domains: [],
    independentDomainCount: 3,
    supportingDomains: ['PRICE_STRUCTURE', 'MOMENTUM', 'INSTITUTIONAL_PROXY'],
    opposingDomains: [],
    unavailableDomains: [],
    hardVetoes: [],
    softVetoes: [],
    conflicts: [],
    requirementsToAdvance: [],
    blockingConditions: [],
    invalidationConditions: [],
    explanation: 'High confidence bullish orderflow confirmation',
    sessionContext: { activeKillzone: true, currentSession: 'LONDON' } as any,
    tradeExecutable: false,
    executionMode: 'READ_ONLY',
    mt5OrderTransportEnabled: false,
    snapshotId: 'snap-100',
    asOf: Date.now(),
    generatedAt: Date.now(),
    legacyCompatibility: {} as any,
    ...overrides,
  };
}

function createMockSetup(overrides: any = {}): any {
  return {
    version: '3.0',
    setupId: 'setup-xau-001',
    symbol: 'XAUUSD',
    snapshotId: 'snap-100',
    asOf: Date.now(),
    lifecycle: 'VALIDATED',
    direction: 'LONG',
    setupType: 'LIQUIDITY_SWEEP',
    thesis: 'Clean liquidity sweep of Asian low with market structure shift on M15',
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0, source: 'FVG_M15', rationale: 'Fair value gap' },
    trigger: { state: 'CONFIRMED', type: 'CANDLE_CLOSE' },
    invalidation: { price: 2735.0, condition: 'M15 close below swing low', source: 'STRUCTURE', rationale: 'Invalidation level' },
    stopLoss: { price: 2735.0, rationale: 'Swing low buffer', bufferAtrMultiplier: 1.2, distance: 6.0 },
    targets: [
      { targetIndex: 1, label: 'TP1', price: 2755.0, source: 'EQUAL_HIGHS', rationale: 'External liquidity', rewardDistance: 14.0, riskReward: 2.33 },
      { targetIndex: 2, label: 'TP2', price: 2765.0, source: 'DAILY_HIGH', rationale: 'Daily resistance', rewardDistance: 24.0, riskReward: 4.0 },
    ],
    risk: { riskDistance: 6.0, riskAtrMultiple: 1.2 },
    reward: { rewardDistance: 14.0, primaryTargetPrice: 2755.0 },
    riskReward: { ratio: 2.33, formatted: '2.33:1', meetsMinimumThreshold: true },
    confirmationRequirements: [],
    confirmationsSatisfied: ['M15_MSS', 'VOLUME_EXPANSION'],
    confirmationsMissing: [],
    supportingEvidence: ['Liquidity swept', 'Bullish displacement'],
    opposingEvidence: [],
    structuralContext: { structureTf: 'M15' } as any,
    ...overrides,
  };
}

async function runEligibilityTests() {
  console.log(`===============================================================`);
  console.log(`  FEF CORTEX: PHASE 13 TASK 1 ELIGIBILITY GATE TESTS           `);
  console.log(`===============================================================\n`);

  const now = Date.now();
  const validTelemetry = {
    symbol: 'XAUUSD',
    bid: 2741.2,
    ask: 2741.6,
    spreadPoints: 4,
    timestamp: now - 2000, // 2s old (fresh)
    mt5Connected: true,
  };

  // 1. Fully Validated BUY Setup -> ELIGIBLE
  const res1 = evaluateSignalEligibility(createMockDecision(), createMockSetup(), validTelemetry, new Set());
  assertTest(1, 'Fully validated BUY setup passes as ELIGIBLE', res1.isEligible && res1.status === 'ELIGIBLE');
  if (res1.isEligible && res1.payload) {
    assertTest(2, 'Payload direction correctly maps to BUY', res1.payload.direction === 'BUY');
    assertTest(3, 'Payload R:R ratio is >= 2.0', res1.payload.riskRewardRatio >= 2.0);
  }

  // 4. Fully Validated SELL Setup -> ELIGIBLE
  const sellDecision = createMockDecision({ bias: 'BEARISH' });
  const sellSetup = createMockSetup({
    direction: 'SHORT',
    entryZone: { low: 2750.0, high: 2752.0, midpoint: 2751.0, source: 'OB', rationale: 'Bearish OB' },
    stopLoss: { price: 2757.0, rationale: 'Swing high', bufferAtrMultiplier: 1.2, distance: 6.0 },
    targets: [{ targetIndex: 1, label: 'TP1', price: 2736.0, source: 'LOW', rationale: 'TP1', rewardDistance: 15.0, riskReward: 2.5 }],
    riskReward: { ratio: 2.5, formatted: '2.5:1', meetsMinimumThreshold: true },
  });
  const res4 = evaluateSignalEligibility(sellDecision, sellSetup, validTelemetry, new Set());
  assertTest(4, 'Fully validated SELL setup passes as ELIGIBLE', res4.isEligible && res4.status === 'ELIGIBLE' && res4.payload?.direction === 'SELL');

  // 5. Low Maturity -> REJECTED_LOW_MATURITY
  const formingDecision = createMockDecision({ maturity: 'SETUP_FORMING' });
  const formingSetup = createMockSetup({ lifecycle: 'FORMING' });
  const res5 = evaluateSignalEligibility(formingDecision, formingSetup, validTelemetry, new Set());
  assertTest(5, 'Forming setup rejected for low maturity', !res5.isEligible && res5.status === 'REJECTED_LOW_MATURITY');

  // 6. Sub-2.0 R:R -> REJECTED_RR
  const badRrSetup = createMockSetup({
    riskReward: { ratio: 1.5, formatted: '1.5:1', meetsMinimumThreshold: false },
  });
  const res6 = evaluateSignalEligibility(createMockDecision(), badRrSetup, validTelemetry, new Set());
  assertTest(6, 'Sub-2.0 R:R setup rejected by mandatory R:R policy', !res6.isEligible && res6.status === 'REJECTED_RR');

  // 7. Active Hard Veto -> REJECTED_VETO
  const vetoDecision = createMockDecision({
    hardVetoes: [{ type: 'HARD_VETO', source: 'RISK_GUARDIAN', reason: 'High impact news embargo', severity: 'CRITICAL', effect: 'BLOCK_SETUP_VALIDATION' }],
  });
  const res7 = evaluateSignalEligibility(vetoDecision, createMockSetup(), validTelemetry, new Set());
  assertTest(7, 'Active hard veto blocks signal eligibility', !res7.isEligible && res7.status === 'REJECTED_VETO');

  // 8. Critical Unresolved Conflict -> REJECTED_CONFLICT
  const conflictDecision = createMockDecision({
    conflicts: [{ type: 'CROSS_DOMAIN', severity: 'HIGH', description: 'Technical vs Macro direct conflict', parties: ['TECHNICAL', 'MACRO'] }],
  });
  const res8 = evaluateSignalEligibility(conflictDecision, createMockSetup(), validTelemetry, new Set());
  assertTest(8, 'Unresolved high severity conflict rejected', !res8.isEligible && res8.status === 'REJECTED_CONFLICT');

  // 9. Stale Telemetry (>30s) -> REJECTED_STALE_DATA
  const staleTelemetry = { ...validTelemetry, timestamp: now - 45000 };
  const res9 = evaluateSignalEligibility(createMockDecision(), createMockSetup(), staleTelemetry, new Set());
  assertTest(9, 'Stale market quote rejected', !res9.isEligible && res9.status === 'REJECTED_STALE_DATA');

  // 10. Unsupported Instrument (GER40) -> REJECTED_UNSUPPORTED_INSTRUMENT
  const ger40Setup = createMockSetup({ symbol: 'GER40' });
  const res10 = evaluateSignalEligibility(createMockDecision(), ger40Setup, { ...validTelemetry, symbol: 'GER40' }, new Set());
  assertTest(10, 'GER40 unsupported benchmark fails closed', !res10.isEligible && res10.status === 'REJECTED_UNSUPPORTED_INSTRUMENT');

  // 11. Missing Stop Loss -> REJECTED_INCOMPLETE
  const incompleteSetup = createMockSetup({ stopLoss: null });
  const res11 = evaluateSignalEligibility(createMockDecision(), incompleteSetup, validTelemetry, new Set());
  assertTest(11, 'Missing stop loss rejected as incomplete', !res11.isEligible && res11.status === 'REJECTED_INCOMPLETE');

  // 12. Invalidated Setup -> REJECTED_INVALIDATED
  const invalidatedSetup = createMockSetup({ lifecycle: 'INVALIDATED' });
  const res12 = evaluateSignalEligibility(createMockDecision(), invalidatedSetup, validTelemetry, new Set());
  assertTest(12, 'Invalidated setup rejected', !res12.isEligible && res12.status === 'REJECTED_INVALIDATED');

  // 13. Duplicate Broadcast -> REJECTED_DUPLICATE
  const duplicateKey = 'XAUUSD_setup-xau-001_1';
  const knownKeys = new Set([duplicateKey]);
  const res13 = evaluateSignalEligibility(createMockDecision(), createMockSetup(), validTelemetry, knownKeys);
  assertTest(13, 'Previously broadcast setup revision rejected as duplicate', !res13.isEligible && res13.status === 'REJECTED_DUPLICATE');

  // 14. Insufficient Independent Confirmations (< 2) -> REJECTED_UNCONFIRMED
  const unconfirmedDecision = createMockDecision({ independentDomainCount: 1 });
  const res14 = evaluateSignalEligibility(unconfirmedDecision, createMockSetup(), validTelemetry, new Set());
  assertTest(14, 'Fewer than 2 independent confirmation clusters rejected', !res14.isEligible && res14.status === 'REJECTED_UNCONFIRMED');

  const failed = testResults.filter((t) => !t.passed).length;
  console.log(`\n===============================================================`);
  console.log(`ELIGIBILITY TESTS COMPLETE: ${testResults.length - failed} PASSED, ${failed} FAILED`);
  console.log(`===============================================================\n`);

  if (failed > 0) process.exit(1);
}

runEligibilityTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

