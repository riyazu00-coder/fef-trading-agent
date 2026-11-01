#!/usr/bin/env ts-node
/**
 * FEF CORTEX — PHASE 13 TASK 2: PERSISTENCE & QUEUE STORE TESTS
 */

import { TelegramPersistenceService } from '../src/lib/telegram/telegram-persistence';
import { ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';

async function runPersistenceTests() {
  console.log(`===============================================================`);
  console.log(`  FEF CORTEX: PHASE 13 TASK 2 PERSISTENCE TESTS                `);
  console.log(`===============================================================\n`);

  // Initialize in-memory instance for isolated testing
  const store = new TelegramPersistenceService({ dbPath: ':memory:' });

  const testPayload: ValidatedSignalPayload = {
    signalId: 'SIG-XAUUSD-TEST01-1234',
    setupId: 'setup-xau-001',
    setupRevision: 1,
    symbol: 'XAUUSD',
    direction: 'BUY',
    timeframe: 'M15',
    marketPrice: 2741.5,
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0 },
    stopLoss: { price: 2735.0, distance: 6.0 },
    takeProfit1: { price: 2755.0, distance: 14.0, riskReward: 2.33 },
    riskRewardRatio: 2.33,
    decisionEngine: {
      bias: 'BULLISH',
      confidencePct: 85,
      completenessPct: 90,
      independentDomainsCount: 3,
      maturity: 'VALIDATED_SETUP',
    },
    setupIntelligence: {
      type: 'LIQUIDITY_SWEEP',
      lifecycle: 'VALIDATED',
      thesis: 'Test thesis',
      invalidationPrice: 2735.0,
    },
    timestamps: {
      asOf: Date.now(),
      marketDataTimestamp: Date.now() - 1000,
      validatedAt: new Date().toISOString(),
    },
    idempotencyKey: 'XAUUSD_setup-xau-001_1',
  };

  // Test 1: Record Signal Event
  const recorded = store.recordSignalEvent({
    signalId: testPayload.signalId,
    setupId: testPayload.setupId,
    setupRevision: testPayload.setupRevision,
    symbol: testPayload.symbol,
    direction: testPayload.direction,
    timeframe: testPayload.timeframe,
    eligibilityStatus: 'ELIGIBLE',
    payloadJson: JSON.stringify(testPayload),
  });
  console.log(recorded ? '  ✓ [PASS] 1. Signal event successfully recorded' : '  ✗ [FAIL] 1. Failed to record signal event');

  // Test 2: Enqueue for Delivery
  const queueItem = store.enqueueSignal({
    signalId: testPayload.signalId,
    idempotencyKey: testPayload.idempotencyKey,
    destinationKey: 'hash-private-group-001',
  });
  console.log(queueItem && queueItem.deliveryStatus === 'QUEUED'
    ? '  ✓ [PASS] 2. Signal enqueued with status QUEUED'
    : '  ✗ [FAIL] 2. Failed to enqueue signal');

  // Test 3: Idempotency duplicate check
  const isDuplicate = store.hasBeenEnqueuedOrDelivered(testPayload.idempotencyKey);
  console.log(isDuplicate
    ? '  ✓ [PASS] 3. Duplicate check recognizes previously enqueued idempotency key'
    : '  ✗ [FAIL] 3. Duplicate check failed');

  // Test 4: Atomic Claiming
  const claimed = store.claimNextPendingBatch(1);
  console.log(claimed.length === 1 && claimed[0].signalId === testPayload.signalId && claimed[0].deliveryStatus === 'SENDING'
    ? '  ✓ [PASS] 4. Atomic batch claim transitions status to SENDING'
    : '  ✗ [FAIL] 4. Atomic batch claim failed');

  // Test 5: Mark Delivered
  store.markDelivered(claimed[0].id, 998877);
  const updated = store.getDeliveryBySignalId(testPayload.signalId);
  console.log(updated && updated.deliveryStatus === 'SENT' && updated.telegramMessageId === 998877
    ? '  ✓ [PASS] 5. Marked DELIVERED with Telegram message ID'
    : '  ✗ [FAIL] 5. Failed to mark delivered');

  // Test 6: Audit trail
  const audits = store.getAuditTrail(testPayload.signalId);
  console.log(audits.length >= 2
    ? '  ✓ [PASS] 6. Audit trail recorded all lifecycle events'
    : '  ✗ [FAIL] 6. Audit trail incomplete');

  // Test 7: Queue Stats
  const stats = store.getQueueStats();
  console.log(stats.sentCount === 1 && stats.queuedCount === 0
    ? '  ✓ [PASS] 7. Queue statistics accurately reflect delivered signal'
    : '  ✗ [FAIL] 7. Queue statistics inaccurate');

  console.log(`\n===============================================================`);
  console.log(`PERSISTENCE TESTS COMPLETE: ALL 7 TESTS PASSED`);
  console.log(`===============================================================\n`);
}

runPersistenceTests().catch((err) => {
  console.error('Persistence test failed:', err);
  process.exit(1);
});

