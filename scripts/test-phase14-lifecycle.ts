/**
 * FEF CORTEX — PHASE 14 TEST: SIGNAL LIFECYCLE & DUPLICATE PROTECTION
 */

import { evaluateSignalEligibility, ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';
import { DecisionIntelligenceV2 } from '../src/lib/decision/decision-engine-v2';
import { SetupIntelligenceV3 } from '../src/lib/setup/setup-intelligence-v3';

function runLifecycleTests() {
  console.log('===============================================================');
  console.log('  FEF CORTEX: PHASE 14 LIFECYCLE & DUPLICATE PROTECTION TESTS  ');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(desc: string, cond: boolean, extra = '') {
    if (cond) {
      console.log(`  ✓ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${desc} ${extra}`);
      failed++;
    }
  }

  const mockDecision: DecisionIntelligenceV2 = {
    version: '2.0',
    decisionId: 'dec-gold-test-01',
    symbol: 'XAUUSD',
    bias: 'BULLISH',
    confidence: 88,
    evidenceCompleteness: 90,
    supportingDomains: ['MARKET_STRUCTURE', 'TECHNICAL_INDICATORS', 'VOLUME_FLOW'],
    opposingDomains: [],
    independentDomainCount: 3,
    maturity: 'VALIDATED_SETUP',
    maturityLevel: 5,
    tradeExecutable: false,
    mt5OrderTransportEnabled: false,
    sessionContext: { sessionModel: 'LONDON', killzoneWindow: 'ACTIVE' },
    hardVetoes: [],
    conflicts: [],
  } as any;

  const mockSetup: SetupIntelligenceV3 = {
    version: '3.0',
    setupId: 'setup-lifecycle-101',
    symbol: 'XAUUSD',
    snapshotId: 'snap-1',
    asOf: Date.now(),
    lifecycle: 'VALIDATED',
    direction: 'LONG',
    setupType: 'BREAKOUT',
    thesis: 'Bullish breakout above Asian range high with volume expansion',
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0, source: 'FVG', rationale: 'Fair Value Gap' },
    stopLoss: { price: 2735.0, distance: 6.0, rationale: 'Swing Low', bufferAtrMultiplier: 1.5 },
    targets: [
      { targetIndex: 0, label: 'TP1', price: 2755.0, source: 'Liquidity', rationale: 'Equal Highs', rewardDistance: 14.0, riskReward: 2.33 },
    ],
    invalidation: { price: 2735.0, condition: 'Candle close below 2735.0', source: 'Structure', rationale: 'Structure invalidation' },
  } as any;

  const telemetry = {
    symbol: 'XAUUSD',
    bid: 2741.2,
    ask: 2741.5,
    timestamp: Date.now(),
  };

  const knownKeys = new Set<string>();

  // 1. New Opportunity Broadcast
  const res1 = evaluateSignalEligibility(mockDecision, mockSetup, telemetry, knownKeys);
  assert('New validated setup is ELIGIBLE', res1.isEligible && res1.status === 'ELIGIBLE');
  assert('Message type is NEW_OPPORTUNITY', res1.payload?.messageType === 'NEW_OPPORTUNITY');
  assert('Setup revision is 1', res1.payload?.setupRevision === 1);

  // Register broadcast key
  if (res1.payload) {
    knownKeys.add(res1.payload.idempotencyKey);
  }

  // 2. Duplicate Detection (Same Setup Revision 1)
  const resDuplicate = evaluateSignalEligibility(mockDecision, mockSetup, telemetry, knownKeys);
  assert('Identical setup revision rejected as duplicate (REJECTED_DUPLICATE)', !resDuplicate.isEligible && resDuplicate.status === 'REJECTED_DUPLICATE');

  // 3. Insignificant Price Change Update (Revision 2, entry moved by only 0.01%)
  const insignificantSetup: any = {
    ...mockSetup,
    setupRevision: 2,
    entryZone: { low: 2740.05, high: 2742.05, midpoint: 2741.05 }, // moved 0.05 pts = 0.0018%
  };
  const resInsignificant = evaluateSignalEligibility(
    mockDecision,
    insignificantSetup,
    telemetry,
    knownKeys,
    { previousSetup: { entryMidpoint: 2741.0, stopLoss: 2735.0, tp1: 2755.0 } }
  );
  assert('Insignificant price change update rejected (REJECTED_INSIGNIFICANT_UPDATE)', !resInsignificant.isEligible && resInsignificant.status === 'REJECTED_INSIGNIFICANT_UPDATE');

  // 4. Significant Price Change Update (Revision 2, entry moved by 5 points = 0.18%)
  const significantSetup: any = {
    ...mockSetup,
    setupRevision: 2,
    entryZone: { low: 2745.0, high: 2747.0, midpoint: 2746.0 },
    stopLoss: { price: 2740.0, distance: 6.0 },
    targets: [
      { targetIndex: 0, label: 'TP1', price: 2760.0, rewardDistance: 14.0, riskReward: 2.33 },
    ],
  };
  const resSignificant = evaluateSignalEligibility(
    mockDecision,
    significantSetup,
    telemetry,
    knownKeys,
    { previousSetup: { entryMidpoint: 2741.0, stopLoss: 2735.0, tp1: 2755.0 } }
  );
  assert('Significant price change update passes as ELIGIBLE', resSignificant.isEligible && resSignificant.status === 'ELIGIBLE');
  assert('Message type is SETUP_UPDATE', resSignificant.payload?.messageType === 'SETUP_UPDATE');
  assert('Revision is 2', resSignificant.payload?.setupRevision === 2);

  // 5. Setup Invalidation Notice Handling
  const invalidatedSetup: any = {
    ...mockSetup,
    lifecycle: 'INVALIDATED',
  };
  const resInvalidNotice = evaluateSignalEligibility(
    mockDecision,
    invalidatedSetup,
    telemetry,
    knownKeys,
    { allowInvalidationNotice: true }
  );
  assert('Previously broadcast setup invalidation permitted as SETUP_INVALIDATED', resInvalidNotice.isEligible && resInvalidNotice.payload?.messageType === 'SETUP_INVALIDATED');

  // 6. Unbroadcast Invalidation Rejection
  const freshInvalidSetup: any = {
    ...mockSetup,
    setupId: 'setup-never-broadcast-999',
    lifecycle: 'INVALIDATED',
  };
  const resFreshInvalid = evaluateSignalEligibility(
    mockDecision,
    freshInvalidSetup,
    telemetry,
    knownKeys,
    { allowInvalidationNotice: true }
  );
  assert('Unbroadcast setup invalidation rejected (REJECTED_INVALIDATED)', !resFreshInvalid.isEligible && resFreshInvalid.status === 'REJECTED_INVALIDATED');

  // 7. Stale Market Data Rejection (> 30s)
  const staleTelemetry = {
    ...telemetry,
    timestamp: Date.now() - 35000,
  };
  const resStale = evaluateSignalEligibility(mockDecision, mockSetup, staleTelemetry, new Set());
  assert('Stale market quote rejected (REJECTED_STALE_DATA)', !resStale.isEligible && resStale.status === 'REJECTED_STALE_DATA');

  // 8. Sub-2.0 R:R Policy Rejection
  const subRrSetup: any = {
    ...mockSetup,
    setupId: 'setup-low-rr',
    targets: [
      { targetIndex: 0, label: 'TP1', price: 2745.0, rewardDistance: 4.0, riskReward: 0.67 },
    ],
  };
  const resSubRr = evaluateSignalEligibility(mockDecision, subRrSetup, telemetry, new Set());
  assert('Sub-2.0 R:R rejected (REJECTED_RR)', !resSubRr.isEligible && resSubRr.status === 'REJECTED_RR');

  console.log('===============================================================');
  console.log(`LIFECYCLE TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runLifecycleTests();

