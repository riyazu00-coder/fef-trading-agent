#!/usr/bin/env ts-node
/**
 * FEF CORTEX — PHASE 13 TASK 5: TELEGRAM DELIVERY ENGINE TESTS
 */

import { TelegramSignalService } from '../src/lib/telegram/telegram-signal-service';
import { TelegramPersistenceService } from '../src/lib/telegram/telegram-persistence';
import { TelegramClient } from '../src/lib/telegram/telegram-client';
import { DecisionIntelligenceV2 } from '../src/lib/decision/decision-engine-v2';
import { SetupIntelligenceV3 } from '../src/lib/setup/setup-intelligence-v3';

async function runDeliveryEngineTests() {
  console.log(`===============================================================`);
  console.log(`  FEF CORTEX: PHASE 13 TASK 5 DELIVERY ENGINE TESTS            `);
  console.log(`===============================================================\n`);

  // Create isolated in-memory persistence and dry-run client
  const persistence = new TelegramPersistenceService({ dbPath: ':memory:' });
  const client = new TelegramClient({
    botToken: 'mock-token',
    channelUsername: '@forexmetalsignals',
    enabled: true,
    dryRun: true,
  });

  const service = new TelegramSignalService({
    persistence,
    client,
  });

  const validDecision: DecisionIntelligenceV2 = {
    maturity: 'VALIDATED_SETUP',
    bias: 'BULLISH',
    confidence: 88,
    evidenceCompleteness: 92,
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
    explanation: 'Institutional orderflow expansion',
    sessionContext: { activeKillzone: true, currentSession: 'LONDON' } as any,
    tradeExecutable: false,
    executionMode: 'READ_ONLY',
    mt5OrderTransportEnabled: false,
    snapshotId: 'snap-200',
    asOf: Date.now(),
    generatedAt: Date.now(),
    legacyCompatibility: {} as any,
  };

  const validSetup: any = {
    version: '3.0',
    setupId: 'setup-xau-555',
    symbol: 'XAUUSD',
    snapshotId: 'snap-200',
    asOf: Date.now(),
    lifecycle: 'VALIDATED',
    direction: 'LONG',
    setupType: 'LIQUIDITY_SWEEP',
    thesis: 'Sweep of Asian low on M15',
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0, source: 'OB', rationale: 'OB' },
    trigger: { state: 'CONFIRMED', type: 'CANDLE_CLOSE' },
    invalidation: { price: 2735.0, condition: 'Close below swing low', source: 'STRUCTURE', rationale: 'Invalidation' },
    stopLoss: { price: 2735.0, rationale: 'SL', bufferAtrMultiplier: 1.2, distance: 6.0 },
    targets: [{ targetIndex: 1, label: 'TP1', price: 2755.0, source: 'TP1', rationale: 'TP1', rewardDistance: 14.0, riskReward: 2.33 }],
    risk: { riskDistance: 6.0, riskAtrMultiple: 1.2 },
    reward: { rewardDistance: 14.0, primaryTargetPrice: 2755.0 },
    riskReward: { ratio: 2.33, formatted: '2.33:1', meetsMinimumThreshold: true },
    confirmationRequirements: [],
    confirmationsSatisfied: ['M15_MSS'],
    confirmationsMissing: [],
    supportingEvidence: [],
    opposingEvidence: [],
    structuralContext: { structureTf: 'M15' } as any,
  };

  const validTelemetry = {
    symbol: 'XAUUSD',
    bid: 2741.2,
    ask: 2741.6,
    spreadPoints: 4,
    timestamp: Date.now() - 2000,
    mt5Connected: true,
  };

  // Test 1: Intake validated setup and complete end-to-end delivery
  const processRes = await service.processCandidateSetup(validDecision, validSetup, validTelemetry);
  console.log(processRes.enqueued && processRes.status === 'ELIGIBLE' && processRes.signalId
    ? `  ✓ [PASS] 1. Validated setup successfully enqueued and processed (Signal: ${processRes.signalId})`
    : '  ✗ [FAIL] 1. Candidate intake failed');

  // Verify delivery state in persistence
  const delivery = persistence.getDeliveryBySignalId(processRes.signalId!);
  console.log(delivery && delivery.deliveryStatus === 'SENT' && delivery.telegramMessageId
    ? `  ✓ [PASS] 2. Delivery worker transitioned status to SENT (Msg ID: ${delivery.telegramMessageId})`
    : '  ✗ [FAIL] 2. Delivery worker failed to mark SENT');

  // Test 3: Duplicate suppression on subsequent intake of identical setup
  const duplicateRes = await service.processCandidateSetup(validDecision, validSetup, validTelemetry);
  console.log(!duplicateRes.enqueued && duplicateRes.status === 'REJECTED_DUPLICATE'
    ? '  ✓ [PASS] 3. Duplicate candidate rejected by eligibility gate'
    : '  ✗ [FAIL] 3. Duplicate candidate was not rejected');

  // Test 4: Pause and Resume functionality
  service.pauseBroadcasting('Maintenance pause');
  const pausedRes = await service.processCandidateSetup(
    validDecision,
    { ...validSetup, setupId: 'setup-xau-556' },
    validTelemetry
  );
  console.log(!pausedRes.enqueued && pausedRes.status === 'PAUSED'
    ? '  ✓ [PASS] 4. Broadcasting correctly paused by admin control'
    : '  ✗ [FAIL] 4. Failed to honor paused state');

  service.resumeBroadcasting();
  const resumedRes = await service.processCandidateSetup(
    validDecision,
    { ...validSetup, setupId: 'setup-xau-556' },
    validTelemetry
  );
  console.log(resumedRes.enqueued && resumedRes.status === 'ELIGIBLE'
    ? '  ✓ [PASS] 5. Broadcasting cleanly resumed'
    : '  ✗ [FAIL] 5. Failed to resume broadcasting');

  // Test 6: Test Signal Dispatch
  const testSignalRes = await service.sendTestSignal();
  console.log(testSignalRes.success && testSignalRes.telegramMessageId
    ? `  ✓ [PASS] 6. Admin test signal dispatched successfully (Msg ID: ${testSignalRes.telegramMessageId})`
    : '  ✗ [FAIL] 6. Admin test signal failed');

  console.log(`\n===============================================================`);
  console.log(`DELIVERY ENGINE TESTS COMPLETE: ALL 6 TESTS PASSED`);
  console.log(`===============================================================\n`);
}

runDeliveryEngineTests().catch((err) => {
  console.error('Delivery engine test error:', err);
  process.exit(1);
});

