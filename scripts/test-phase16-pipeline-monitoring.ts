/**
 * FEF CORTEX — PHASE 16 REGRESSION & PIPELINE MONITORING TEST SUITE
 *
 * Verifies:
 * 1. 10-Stage Pipeline Tracing Engine (`getPipelineTrace`)
 * 2. Earliest failure pinpointing mechanism
 * 3. 12 Canonical Instruments across 5 master categories
 * 4. Signal rejection attribution & honest zero-activity reporting
 * 5. Idempotency & duplicate suppression shield
 * 6. Non-duplicating safe retry behavior
 * 7. System invariants: READ_ONLY mode, MT5 transport false, zero OpenAI cost, 17-line execution journal
 *
 * CRITICAL CONSTRAINT: ZERO messages sent to Telegram.
 */

import { getPipelineTrace, CANONICAL_MONITORED_INSTRUMENTS, CANONICAL_JOURNAL_SHA256 } from '../src/lib/telegram/telegram-pipeline-monitor';
import { TelegramPersistenceService } from '../src/lib/telegram/telegram-persistence';
import { evaluateSignalEligibility } from '../src/lib/telegram/telegram-signal-eligibility';
import { hashDestinationChat, generateSignalIdempotencyKey } from '../src/lib/telegram/telegram-idempotency';
import { CANONICAL_CHANNEL_USERNAME } from '../src/lib/telegram/telegram-client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`  ✓ ${name}`);
    if (details) console.log(`    ↳ ${details}`);
  } else {
    results.push({ name, passed: false, error: details || 'Assertion failed' });
    console.error(`  ✗ ${name}`);
    if (details) console.error(`    ↳ ${details}`);
  }
}

async function runPhase16Suite() {
  console.log('\n================================================================');
  console.log(' FEF CORTEX — PHASE 16 OPERATIONAL MONITORING VERIFICATION');
  console.log('================================================================\n');

  // Test 1: Full 10-Stage Pipeline Tracing
  console.log('[TEST GROUP 1] 10-Stage Signal Pipeline Tracing');
  const trace = await getPipelineTrace();
  assert(trace.stages.length >= 10, 'Pipeline has at least 10 stages', `Discovered ${trace.stages.length} stages`);
  
  const expectedStageIds = [
    'MT5_TERMINAL',
    'LOCAL_BRIDGE',
    'LOCAL_CONNECTOR',
    'SQLITE_REPOSITORY',
    'MARKET_DATA_PROVIDER',
    'AGENT_SWARM_32',
    'DECISION_ENGINE_V2',
    'SETUP_INTELLIGENCE_V3',
    'SIGNAL_ELIGIBILITY_GATES',
    'TELEGRAM_QUEUE',
    'TELEGRAM_CHANNEL',
  ];

  for (const expId of expectedStageIds) {
    const stage = trace.stages.find((s) => s.id === expId);
    assert(Boolean(stage), `Stage ${expId} is present and traced`, `Status: ${stage?.status || 'MISSING'}`);
  }

  // Test 2: Failure Pinpointing
  console.log('\n[TEST GROUP 2] Stage Failure Pinpointing');
  assert(typeof trace.overallStatus === 'string', 'Overall status is evaluated', `Status: ${trace.overallStatus}`);
  if (trace.overallStatus === 'HEALTHY') {
    assert(trace.earliestFailingStage === null, 'Earliest failing stage is null when healthy', 'Healthy state confirmed');
  } else {
    assert(trace.earliestFailingStage !== null, 'Earliest failing stage is identified', `Failing stage: ${trace.earliestFailingStage}`);
  }

  // Test 3: 12 Canonical Instruments across 5 Categories
  console.log('\n[TEST GROUP 3] 12 Canonical Instruments & 5 Categories Coverage');
  assert(CANONICAL_MONITORED_INSTRUMENTS.length === 12, 'Universe contains exactly 12 canonical instruments', `Count: ${CANONICAL_MONITORED_INSTRUMENTS.length}`);

  const categories = new Set(CANONICAL_MONITORED_INSTRUMENTS.map((i) => i.category));
  assert(categories.has('METALS'), 'Category METALS covered', 'XAUUSD, XAGUSD, XPTUSD, XPDUSD');
  assert(categories.has('COMMODITIES'), 'Category COMMODITIES covered', 'USOIL, NATGAS');
  assert(categories.has('FOREX'), 'Category FOREX covered', 'EURUSD, USDJPY');
  assert(categories.has('INDICES'), 'Category INDICES covered', 'US100, US500');
  assert(categories.has('CRYPTO'), 'Category CRYPTO covered', 'BTCUSD, ETHUSD');
  assert(categories.size === 5, 'Exactly 5 master categories architecture verified', `Categories: ${Array.from(categories).join(', ')}`);

  // Verify all 12 are in the trace monitoredInstruments
  for (const inst of CANONICAL_MONITORED_INSTRUMENTS) {
    const record = trace.monitoredInstruments.find((m) => m.symbol === inst.symbol);
    assert(Boolean(record), `Instrument ${inst.symbol} (${inst.category}) is actively monitored`, `Bid: ${record?.bid}, Freshness: ${record?.freshness}`);
  }

  // Test 4: Signal Rejection Attribution & Strict Gates (R:R >= 2.0:1)
  console.log('\n[TEST GROUP 4] Signal Rejection Attribution & 21-Gate Enforcement');
  
  // Synthetic test candidate with R:R = 1.4:1 (below 2.0:1 floor) and VALIDATED_SETUP
  const mockDecisionLowRR: any = {
    bias: 'BULLISH',
    confidence: 85,
    independentDomainCount: 4,
    maturity: 'VALIDATED_SETUP',
  };
  const mockSetupLowRR: any = {
    setupId: 'TEST-LOW-RR-001',
    symbol: 'XAUUSD',
    direction: 'LONG',
    lifecycle: 'VALIDATED',
    entryZone: { low: 2649.00, high: 2651.00, midpoint: 2650.00 },
    stopLoss: { price: 2640.00, distance: 10.00 },
    targets: [{ targetIndex: 1, label: 'TP1', price: 2664.00, rewardDistance: 14.00 }],
    riskReward: { ratio: 1.4, formatted: '1.40:1', meetsMinimumThreshold: false },
    structuralContext: { structureTf: 'M15' },
    triggerEvidence: ['Bullish order-block test'],
  };
  const mockTelemetryFresh: any = {
    timestamp: Date.now() - 5000, // 5s old (fresh)
    bid: 2650.10,
    ask: 2650.30,
  };

  const lowRREvaluation = evaluateSignalEligibility(mockDecisionLowRR, mockSetupLowRR, mockTelemetryFresh, new Set());
  assert(!lowRREvaluation.isEligible, 'Sub-2.0 R:R setup is rejected', `Status: ${lowRREvaluation.status}`);
  assert(
    lowRREvaluation.status === 'REJECTED_RR' && (lowRREvaluation.rejectionReason || '').includes('2.0'),
    'Rejection explicitly notes Risk/Reward minimum threshold (2.0:1)',
    `Reason: ${lowRREvaluation.rejectionReason}`
  );

  // Synthetic test candidate with Stale Telemetry (> 30s)
  const mockSetupValidRR: any = {
    ...mockSetupLowRR,
    targets: [{ targetIndex: 1, label: 'TP1', price: 2675.00, rewardDistance: 25.00 }],
    riskReward: { ratio: 2.5, formatted: '2.50:1', meetsMinimumThreshold: true },
  };
  const mockTelemetryStale: any = {
    timestamp: Date.now() - 45000, // 45s old (stale)
    bid: 2650.10,
    ask: 2650.30,
  };
  const staleEvaluation = evaluateSignalEligibility(mockDecisionLowRR, mockSetupValidRR, mockTelemetryStale, new Set());
  assert(!staleEvaluation.isEligible, 'Stale quote telemetry (>30s) is strictly rejected', `Status: ${staleEvaluation.status}`);
  assert(
    staleEvaluation.status === 'REJECTED_STALE_DATA' && (staleEvaluation.rejectionReason || '').includes('stale'),
    'Rejection explicitly notes quote telemetry staleness threshold',
    `Reason: ${staleEvaluation.rejectionReason}`
  );

  // Test 5: Idempotency & Safe Non-Duplicating Retry
  console.log('\n[TEST GROUP 5] Idempotency & Safe Retry Verification');
  const testDbPath = path.resolve('/tmp', `fef-test-phase16-${Date.now()}.db`);
  const testPersistence = new TelegramPersistenceService(testDbPath);

  const destKey = hashDestinationChat(CANONICAL_CHANNEL_USERNAME);
  const testSignalId = 'TEST-SIG-16-001';
  const idemKey = generateSignalIdempotencyKey('XAUUSD', 'SETUP-16-A', 1);

  // Enqueue first time
  const enq1 = testPersistence.enqueueSignal({
    signalId: testSignalId,
    idempotencyKey: idemKey,
    destinationKey: destKey,
  });
  assert(Boolean(enq1), 'First signal enqueue succeeds', `Queue ID: ${enq1?.id}`);

  // Check known idempotency keys
  const knownKeys = testPersistence.getKnownIdempotencyKeys();
  assert(knownKeys.has(idemKey), 'Idempotency key recorded in database', `Key: ${idemKey.slice(0, 16)}...`);

  // Attempt duplicate enqueue with identical idempotency key
  const isDupe = testPersistence.hasBeenEnqueuedOrDelivered(idemKey);
  assert(isDupe, 'Duplicate check identifies already-enqueued idempotency key', 'Duplicate correctly flagged');

  // Verify safe retry behavior
  testPersistence.markFailed(enq1!.id, 'INVALID_DESTINATION', 'Simulated failure to verify retry transition');
  const deliveryAfterFail = testPersistence.getDeliveryById(enq1!.id);
  assert(deliveryAfterFail?.deliveryStatus === 'DELIVERY_FAILED', 'Failed status recorded as DELIVERY_FAILED', `Status: ${deliveryAfterFail?.deliveryStatus}`);

  const retrySuccess = testPersistence.retryFailedSignal(testSignalId);
  assert(retrySuccess, 'Retry updates existing record to QUEUED without creating duplicate row', 'Non-duplicating retry verified');

  const deliveryAfterRetry = testPersistence.getDeliveryById(enq1!.id);
  assert(deliveryAfterRetry?.deliveryStatus === 'QUEUED', 'Delivery record reset to QUEUED', `Status: ${deliveryAfterRetry?.deliveryStatus}`);

  const allQueueRecords = testPersistence.claimNextPendingBatch(10);
  assert(allQueueRecords.length === 1, 'Queue contains exactly 1 claimed record (no duplicates generated)', `Record count: ${allQueueRecords.length}`);

  testPersistence.close();
  try { fs.unlinkSync(testDbPath); } catch {}

  // Test 6: Invariant Verification
  console.log('\n[TEST GROUP 6] System Invariants & Safety Verification');
  assert(trace.safetyInvariants.operatingMode === 'READ_ONLY', 'Operating mode is strictly READ_ONLY', 'READ_ONLY locked');
  assert(trace.safetyInvariants.orderTransportAllowed === false, 'MT5 Order Transport is hard-locked to FALSE', 'No OrderSend capability');
  assert(trace.safetyInvariants.openAiEnabled === false, 'OpenAI is completely DISABLED', 'Zero cost ($0.00)');
  assert(trace.safetyInvariants.openAiBudgetUsd === 0, 'OpenAI daily budget is $0.00', 'Budget compliance verified');
  assert(trace.safetyInvariants.executionJournalLines === 17, 'Execution journal line count invariant is 17', '17 lines verified');

  // Verify real disk journal file
  const journalPath = path.resolve(process.cwd(), 'data/fef-execution-journal.jsonl');
  const journalContent = fs.readFileSync(journalPath, 'utf8');
  const lines = journalContent.trim().split('\n').filter((l) => l.trim().length > 0);
  assert(lines.length === 17, 'Actual execution journal has exactly 17 lines on disk', `Line count: ${lines.length}`);

  const diskHash = crypto.createHash('sha256').update(journalContent).digest('hex');
  assert(diskHash === CANONICAL_JOURNAL_SHA256, 'Actual execution journal SHA-256 matches canonical hash', `Hash: ${diskHash}`);

  // Summary
  console.log('\n================================================================');
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(` PHASE 16 SUITE SUMMARY: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase16Suite().catch((err) => {
  console.error('Phase 16 test suite failed with unhandled exception:', err);
  process.exit(1);
});
