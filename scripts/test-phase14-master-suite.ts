/**
 * FEF CORTEX — PHASE 14 MASTER ACCEPTANCE TEST SUITE
 *
 * Covers all 16 explicit acceptance scenarios mandated by Phase 14 spec:
 * 1. Missing bot token
 * 2. Invalid destination configuration
 * 3. Invalid caption
 * 4. Missing card image
 * 5. Oversized image
 * 6. Duplicate signal
 * 7. Stale market data
 * 8. Invalid signal eligibility
 * 9. Valid BUY signal
 * 10. Valid SELL signal
 * 11. Signal update
 * 12. Signal invalidation
 * 13. Failed delivery simulation
 * 14. Retry handling
 * 15. Zero-cost compliance
 * 16. Read-only execution protection
 */

import * as fs from 'fs';
import * as crypto from 'crypto';
import { TelegramClient, CANONICAL_CHANNEL_USERNAME } from '../src/lib/telegram/telegram-client';
import { evaluateSignalEligibility, ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';
import { renderSignalCardPng } from '../src/lib/telegram/telegram-image-renderer';
import { TelegramPersistenceService } from '../src/lib/telegram/telegram-persistence';
import { simulateDryRunDelivery } from '../src/lib/telegram/telegram-dry-run';
import { MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';

async function runMasterAcceptanceSuite() {
  console.log('===============================================================');
  console.log('      FEF CORTEX: PHASE 14 MASTER ACCEPTANCE TEST SUITE        ');
  console.log('         16 Explicit Production-Readiness Scenarios           ');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;

  function assert(num: number, name: string, cond: boolean, extra = '') {
    if (cond) {
      console.log(`  ✓ [PASS] Scenario ${num.toString().padStart(2, '0')}: ${name}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] Scenario ${num.toString().padStart(2, '0')}: ${name} ${extra}`);
      failed++;
    }
  }

  // Base Valid Decision
  const baseDecision: any = {
    version: '2.0',
    decisionId: 'dec-suite-01',
    symbol: 'XAUUSD',
    bias: 'BULLISH',
    confidence: 88,
    evidenceCompleteness: 92,
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
  };

  // Base Valid Setup
  const baseSetup: any = {
    version: '3.0',
    setupId: 'setup-suite-01',
    symbol: 'XAUUSD',
    snapshotId: 'snap-suite-1',
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
  };

  const telemetry = {
    symbol: 'XAUUSD',
    bid: 2741.2,
    ask: 2741.5,
    timestamp: Date.now(),
  };

  // -------------------------------------------------------------------------
  // Scenario 1: Missing bot token
  // -------------------------------------------------------------------------
  const unauthClient = new TelegramClient({ botToken: '' });
  const checkBot = await unauthClient.verifyBot();
  assert(1, 'Missing bot token fails closed safely', !checkBot.isConfigured && checkBot.status === 'NOT_CONFIGURED');

  // -------------------------------------------------------------------------
  // Scenario 2: Invalid destination configuration
  // -------------------------------------------------------------------------
  const invalidPrivateChat = unauthClient.verifyDestinationSafety('-100987654321');
  const invalidForeignChannel = unauthClient.verifyDestinationSafety('@some_random_channel');
  const validCanonicalChannel = unauthClient.verifyDestinationSafety('@forexmetalsignals');
  assert(
    2,
    'Invalid destination rejected (Private prohibited, Foreign rejected, @forexmetalsignals allowed)',
    !invalidPrivateChat.isValid &&
    invalidPrivateChat.errorCode === 'PRIVATE_GROUPS_PROHIBITED' &&
    !invalidForeignChannel.isValid &&
    invalidForeignChannel.errorCode === 'CHANNEL_NOT_ALLOWED' &&
    validCanonicalChannel.isValid
  );

  // -------------------------------------------------------------------------
  // Scenario 3: Invalid caption (> 1024 chars rejected)
  // -------------------------------------------------------------------------
  const oversizedCaption = 'A'.repeat(1025);
  const oversizedCapResult = await unauthClient.sendSignalPhoto({
    chatId: CANONICAL_CHANNEL_USERNAME,
    photoBuffer: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
    caption: oversizedCaption,
  });
  assert(3, 'Invalid caption exceeding 1024 characters rejected by client gate', !oversizedCapResult.success && oversizedCapResult.errorCode === 'CAPTION_TOO_LONG');

  // -------------------------------------------------------------------------
  // Scenario 4: Missing card image / invalid payload
  // -------------------------------------------------------------------------
  let missingImageError = false;
  try {
    await renderSignalCardPng(null as any);
  } catch {
    missingImageError = true;
  }
  assert(4, 'Missing card image payload safely handled without silent crash', missingImageError);

  // -------------------------------------------------------------------------
  // Scenario 5: Oversized image (> 10 MB boundary)
  // -------------------------------------------------------------------------
  // Telegram has a 10MB limit for sendPhoto. We verify that our rendered PNG is well under 10MB (typically ~800KB)
  const samplePng = await renderSignalCardPng({
    ...baseSetup,
    signalId: 'TEST-SIZE',
    direction: 'BUY',
    timeframe: 'M15',
    marketPrice: 2741.5,
    entryZone: { low: 2740, high: 2742, midpoint: 2741 },
    stopLoss: { price: 2735, distance: 6 },
    takeProfit1: { price: 2755, distance: 14, riskReward: 2.33 },
    riskRewardRatio: 2.33,
    decisionEngine: baseDecision,
    setupIntelligence: baseSetup,
    timestamps: { asOf: Date.now(), marketDataTimestamp: Date.now(), validatedAt: new Date().toISOString() },
    idempotencyKey: 'TEST_SIZE_1',
  });
  assert(5, 'Image size strictly conforms to Telegram boundaries (< 10 MB)', samplePng.length < 10_000_000 && samplePng.length > 200_000);

  // -------------------------------------------------------------------------
  // Scenario 6: Duplicate signal
  // -------------------------------------------------------------------------
  const knownKeys = new Set<string>(['XAUUSD_setup-suite-01_1']);
  const dupCheck = evaluateSignalEligibility(baseDecision, baseSetup, telemetry, knownKeys);
  assert(6, 'Duplicate setup revision rejected (REJECTED_DUPLICATE)', !dupCheck.isEligible && dupCheck.status === 'REJECTED_DUPLICATE');

  // -------------------------------------------------------------------------
  // Scenario 7: Stale market data
  // -------------------------------------------------------------------------
  const staleTelem = { ...telemetry, timestamp: Date.now() - 40000 };
  const staleCheck = evaluateSignalEligibility(baseDecision, baseSetup, staleTelem, new Set());
  assert(7, 'Stale telemetry (> 30s) rejected (REJECTED_STALE_DATA)', !staleCheck.isEligible && staleCheck.status === 'REJECTED_STALE_DATA');

  // -------------------------------------------------------------------------
  // Scenario 8: Invalid signal eligibility (e.g. Critical Veto Active)
  // -------------------------------------------------------------------------
  const vetoDecision = {
    ...baseDecision,
    hardVetoes: [{ reason: 'High-Impact NFP Release in 5 minutes', severity: 'CRITICAL', effect: 'BLOCK_SETUP_VALIDATION' }],
  };
  const vetoCheck = evaluateSignalEligibility(vetoDecision, baseSetup, telemetry, new Set());
  assert(8, 'Active hard veto strictly blocks signal eligibility (REJECTED_VETO)', !vetoCheck.isEligible && vetoCheck.status === 'REJECTED_VETO');

  // -------------------------------------------------------------------------
  // Scenario 9: Valid BUY signal
  // -------------------------------------------------------------------------
  const buyCheck = evaluateSignalEligibility(baseDecision, baseSetup, telemetry, new Set());
  assert(9, 'Valid BUY setup passes with direction mapped to BUY and messageType NEW_OPPORTUNITY', buyCheck.isEligible && buyCheck.payload?.direction === 'BUY' && buyCheck.payload?.messageType === 'NEW_OPPORTUNITY');

  // -------------------------------------------------------------------------
  // Scenario 10: Valid SELL signal
  // -------------------------------------------------------------------------
  const sellDecision = { ...baseDecision, bias: 'BEARISH' };
  const sellSetup = {
    ...baseSetup,
    setupId: 'setup-suite-sell-01',
    direction: 'SHORT',
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0, source: 'FVG', rationale: 'Fair Value Gap' },
    stopLoss: { price: 2748.0, distance: 7.0, rationale: 'Swing High', bufferAtrMultiplier: 1.5 },
    targets: [
      { targetIndex: 0, label: 'TP1', price: 2725.0, source: 'Liquidity', rationale: 'Equal Lows', rewardDistance: 16.0, riskReward: 2.29 },
    ],
    invalidation: { price: 2748.0, condition: 'Candle close above 2748.0', source: 'Structure', rationale: 'Structure invalidation' },
  };
  const sellCheck = evaluateSignalEligibility(sellDecision, sellSetup, telemetry, new Set());
  assert(10, 'Valid SELL setup passes with direction mapped to SELL', sellCheck.isEligible && sellCheck.payload?.direction === 'SELL');

  // -------------------------------------------------------------------------
  // Scenario 11: Signal update
  // -------------------------------------------------------------------------
  const updateSetup = {
    ...baseSetup,
    setupRevision: 2,
    entryZone: { low: 2745.0, high: 2747.0, midpoint: 2746.0 }, // significant 5 pts movement
    stopLoss: { price: 2740.0, distance: 6.0 },
    targets: [{ targetIndex: 0, label: 'TP1', price: 2760.0, rewardDistance: 14.0, riskReward: 2.33 }],
  };
  const updateCheck = evaluateSignalEligibility(
    baseDecision,
    updateSetup,
    telemetry,
    new Set(['XAUUSD_setup-suite-01_1']),
    { previousSetup: { entryMidpoint: 2741.0, stopLoss: 2735.0, tp1: 2755.0 } }
  );
  assert(11, 'Significant setup revision passes as SETUP_UPDATE', updateCheck.isEligible && updateCheck.payload?.messageType === 'SETUP_UPDATE' && updateCheck.payload?.setupRevision === 2);

  // -------------------------------------------------------------------------
  // Scenario 12: Signal invalidation
  // -------------------------------------------------------------------------
  const invalidSetup = { ...baseSetup, lifecycle: 'INVALIDATED' };
  const invalidCheck = evaluateSignalEligibility(
    baseDecision,
    invalidSetup,
    telemetry,
    new Set(['XAUUSD_setup-suite-01_1']),
    { allowInvalidationNotice: true }
  );
  assert(12, 'Setup invalidation passes as SETUP_INVALIDATED', invalidCheck.isEligible && invalidCheck.payload?.messageType === 'SETUP_INVALIDATED');

  // -------------------------------------------------------------------------
  // Scenario 13: Failed delivery simulation
  // -------------------------------------------------------------------------
  const mockFailingClient = new TelegramClient({
    botToken: '123456:FAKE_TOKEN_FOR_TEST',
    dryRun: false,
    fetchFn: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }),
    } as any),
  });
  const failResult = await mockFailingClient.sendSignalPhoto({
    chatId: CANONICAL_CHANNEL_USERNAME,
    photoBuffer: Buffer.from([0x89, 0x50, 0x4E, 0x47]),
    caption: 'Test fail caption',
    forceLive: true,
  });
  assert(13, 'Failed delivery returns structured error without throw', !failResult.success && failResult.errorCode === 'TELEGRAM_400');

  // -------------------------------------------------------------------------
  // Scenario 14: Retry handling
  // -------------------------------------------------------------------------
  const testPersistence = new TelegramPersistenceService(':memory:');
  const testSignalId = 'SIG-RETRY-TEST-101';
  testPersistence.enqueueSignal({
    signalId: testSignalId,
    idempotencyKey: 'RETRY_TEST_101',
    destinationKey: 'canonical-channel',
    maxAttempts: 1, // Will fail terminally on first error
  });
  const claimed = testPersistence.claimNextPendingBatch(1);
  testPersistence.markFailed(claimed[0].id, 'NETWORK_ERROR', 'Simulated failure');
  const failedItem = testPersistence.getDeliveryBySignalId(testSignalId);
  const isFailedTerminally = failedItem?.deliveryStatus === 'DELIVERY_FAILED';

  const retried = testPersistence.retryFailedSignal(testSignalId);
  const retriedItem = testPersistence.getDeliveryBySignalId(testSignalId);
  const isBackToQueued = retriedItem?.deliveryStatus === 'QUEUED' && retriedItem?.attempts === 0;

  assert(14, 'Failed delivery can be retried into QUEUED status', isFailedTerminally && retried && isBackToQueued);
  testPersistence.close();

  // -------------------------------------------------------------------------
  // Scenario 15: Zero-cost compliance
  // -------------------------------------------------------------------------
  const openaiEnabled = process.env.OPENAI_ENABLED === 'true';
  const openaiBudget = parseFloat(process.env.OPENAI_DAILY_BUDGET_USD || '0');
  assert(15, 'Zero-Cost Compliance: OPENAI_ENABLED is false and DAILY_BUDGET is $0.00', !openaiEnabled && openaiBudget === 0);

  // -------------------------------------------------------------------------
  // Scenario 16: Read-only execution protection
  // -------------------------------------------------------------------------
  const transportLocked = MT5_ORDER_TRANSPORT_ENABLED === false;
  const journalFile = 'data/fef-execution-journal.jsonl';
  const journalLines = fs.existsSync(journalFile) ? fs.readFileSync(journalFile, 'utf8').trim().split('\n').length : 0;
  const journalSha = fs.existsSync(journalFile)
    ? crypto.createHash('sha256').update(fs.readFileSync(journalFile)).digest('hex')
    : '';
  const expectedSha = '88dfd508701125d3b7de67be64f87ce25fab091deb22b260da18c27473c2834b';

  assert(
    16,
    `Read-only execution protection verified (Transport locked, Journal 17 lines, SHA match)`,
    transportLocked && journalLines === 17 && journalSha === expectedSha
  );

  console.log('===============================================================');
  console.log(`PHASE 14 ACCEPTANCE SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runMasterAcceptanceSuite();
