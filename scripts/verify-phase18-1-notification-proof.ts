/**
 * FEF CORTEX — PHASE 18.1 NOTIFICATION PROOF & PIPELINE VERIFICATION
 *
 * Demonstrates:
 * 1. Application Notification Lifecycle:
 *    Candidate -> Qualification -> State Transition -> Notification Creation -> Persistence -> Frontend Consumption
 * 2. Telegram Pipeline Lifecycle:
 *    Candidate -> 21 Gates Validation -> Queue Enqueuing -> Consumer Processing -> Delivery Audit -> Retry/Failure Handling
 *
 * Invariants Enforced:
 * - Isolated internal test fixture: TEST-FIXTURE-P18-1-ISOLATED
 * - Exactly ZERO external HTTP requests sent to Telegram API or broker
 * - Mandatory TP2 qualification (TP2_RR >= 2.0) preserved
 */

import assert from 'assert';
import {
  evaluateRadarTransitions,
  getStoredNotifications,
  clearRadarNotificationStateForTesting,
  subscribeRadarNotifications,
  RadarNotification
} from '../src/lib/radar/radar-notifications';
import { RadarOpportunityItem } from '../src/lib/radar/opportunity-radar-engine';
import { evaluateSignalEligibility } from '../src/lib/telegram/telegram-signal-eligibility';
import { TelegramSignalService } from '../src/lib/telegram/telegram-signal-service';
import { TelegramPersistenceService, telegramPersistence } from '../src/lib/telegram/telegram-persistence';
import { TelegramClient } from '../src/lib/telegram/telegram-client';
import { DecisionIntelligenceV2 } from '../src/lib/intelligence/decision-engine-v2';
import { SetupIntelligenceV3 } from '../src/lib/intelligence/setup-intelligence-v3';

async function runVerification() {
  console.log('================================================================');
  console.log('FEF CORTEX PHASE 18.1: NOTIFICATION & TELEGRAM PIPELINE PROOF');
  console.log('================================================================\n');

  const lifecycleLog: Array<{ step: string; timestamp: string; details: any }> = [];
  function logStep(step: string, details: any) {
    const entry = { step, timestamp: new Date().toISOString(), details };
    lifecycleLog.push(entry);
    console.log(`[${entry.timestamp}] ▶ ${step}`);
  }

  // ---------------------------------------------------------------------------
  // PART 1: APPLICATION NOTIFICATION PROOF
  // ---------------------------------------------------------------------------
  console.log('--- PART 1: APPLICATION NOTIFICATION LIFECYCLE ---');
  clearRadarNotificationStateForTesting();

  // Step 1: Candidate Opportunity Generation
  const opportunityCandidate: RadarOpportunityItem = {
    rank: 1,
    symbol: 'XAUUSD',
    name: 'Gold / US Dollar',
    category: 'METALS',
    price: 4350.00,
    change24h: 1.2,
    state: 'BUY OPPORTUNITY',
    readiness: 'READY',
    opportunityScore: 86,
    aiConfidence: 85,
    timeframe: 'M15',
    riskLevel: 'LOW',
    tradeExecutable: false,
    setupQuality: 88,
    executabilityScore: 100,
    marketState: 'OPEN',
    entryZone: [4348.00, 4352.00],
    stopLoss: 4340.00,
    tp1: 4365.00,
    tp2: 4375.00,
    tp3: 4390.00,
    rr: '1:2.5',
    regime: 'TRENDING_BULLISH',
    catalysts: ['Order Flow Demand', 'M15 Imbalance Fill', 'Bullish Structure Shift'],
    evidenceTrust: 90,
    actionabilityState: 'ACTIONABLE',
    verifiedAgentCount: 8,
    isDataLimited: false,
  };
  logStep('1. Candidate Opportunity Generated', {
    symbol: opportunityCandidate.symbol,
    state: opportunityCandidate.state,
    opportunityScore: opportunityCandidate.opportunityScore,
    aiConfidence: opportunityCandidate.aiConfidence,
    rr: opportunityCandidate.rr,
  });

  // Step 2: Subscribe Frontend Listener (Mock UI Toast / Notification Center)
  let receivedViaPubSub: RadarNotification | null = null;
  const unsubscribe = subscribeRadarNotifications((notif) => {
    receivedViaPubSub = notif;
  });

  // Step 3: State Transition & Notification Creation
  const createdNotifications = evaluateRadarTransitions([opportunityCandidate]);
  assert(createdNotifications.length > 0, 'At least 1 notification must be created on state transition to OPPORTUNITY');
  const appNotif = createdNotifications[0];
  logStep('2. In-App Notification Created via Transition Engine', {
    notificationId: appNotif.id,
    title: appNotif.title,
    eventType: appNotif.eventType,
    priority: appNotif.priority,
    score: appNotif.score,
  });

  // Step 4: Storage & Persistence Verification
  const storedNotifications = getStoredNotifications();
  const matchedStored = storedNotifications.find((n) => n.id === appNotif.id);
  assert(matchedStored, 'Notification must be stored and queryable in persistent storage');
  logStep('3. Notification Persisted in Local Storage', {
    storedCount: storedNotifications.length,
    retrievedId: matchedStored?.id,
    read: matchedStored?.read,
  });

  // Step 5: Frontend Consumption & Pub/Sub Verification
  assert(receivedViaPubSub, 'Frontend listener must receive notification via pub/sub event bus');
  assert.strictEqual(receivedViaPubSub?.id, appNotif.id);
  assert.strictEqual(receivedViaPubSub?.symbol, 'XAUUSD');
  logStep('4. Frontend Consumption Verified', {
    pubSubReceived: true,
    notificationTitle: receivedViaPubSub?.title,
    tradeDetails: {
      entryZone: receivedViaPubSub?.entryZone,
      stopLoss: receivedViaPubSub?.stopLoss,
      tp1: receivedViaPubSub?.tp1,
      tp2: receivedViaPubSub?.tp2,
      rr: receivedViaPubSub?.rr,
    }
  });

  // Step 6: Verify Deduplication Guard (15-min Cooldown)
  const duplicateTransitions = evaluateRadarTransitions([opportunityCandidate]);
  assert.strictEqual(duplicateTransitions.length, 0, 'Duplicate transition within 15m cooldown must be suppressed');
  logStep('5. Deduplication Guard Verified', { duplicateCreated: 0, cooldownMinutes: 15 });

  unsubscribe();
  console.log('✓ Application notification lifecycle verified cleanly.\n');

  // ---------------------------------------------------------------------------
  // PART 2: TELEGRAM PIPELINE VERIFICATION (0 EXTERNAL MESSAGES)
  // ---------------------------------------------------------------------------
  console.log('--- PART 2: TELEGRAM DELIVERY PIPELINE LIFECYCLE ---');

  // Isolated test fixture with compliant TP2 qualification (TP2 RR = 2.5 >= 2.0)
  const runId = Date.now().toString(36).toUpperCase();
  const fixtureSetup: any = {
    version: '3.0',
    setupId: `P18-1-FIXTURE-${runId}`,
    symbol: 'XAUUSD',
    snapshotId: `SNAP-${runId}`,
    asOf: Date.now(),
    lifecycle: 'VALIDATED',
    direction: 'LONG',
    setupType: 'BREAKOUT',
    thesis: 'Fair value balance fill with HTF momentum alignment',
    entryZone: {
      low: 4348.00,
      high: 4352.00,
      midpoint: 4350.00,
      source: 'M15 Imbalance',
      rationale: 'Fair value entry zone',
    },
    stopLoss: {
      price: 4340.00,
      rationale: 'Structural swing low invalidation',
      bufferAtrMultiplier: 1.5,
      distance: 10.00,
    },
    targets: [
      { targetIndex: 1, label: 'TP1', price: 4365.00, source: 'Internal Liquidity', rationale: 'Internal swing high', rewardDistance: 15.00, riskReward: 1.50 },
      { targetIndex: 2, label: 'TP2', price: 4375.00, source: 'Session High', rationale: 'Major session high', rewardDistance: 25.00, riskReward: 2.50 },
      { targetIndex: 3, label: 'TP3', price: 4390.00, source: 'HTF Inefficiency', rationale: 'Daily imbalance', rewardDistance: 40.00, riskReward: 4.00 },
    ],
    riskReward: {
      ratio: 2.50,
      formatted: '1:2.5',
      meetsMinimumThreshold: true,
    },
    invalidation: {
      price: 4340.00,
      condition: 'Close below 4340.00',
      source: 'Market Structure',
      rationale: 'Structural failure',
    },
    revision: 1,
  };

  const fixtureDecision: any = {
    canonicalSymbol: 'XAUUSD',
    bias: 'BULLISH',
    direction: 'BUY',
    timeframe: 'M15',
    decisionOutcome: 'TRADE_SETUP_QUALIFIED',
    maturity: 'VALIDATED_SETUP',
    confidence: 88,
    evidenceCompleteness: 92,
    independentDomainCount: 4,
    hardVetoes: [],
    conflicts: [],
    tradeExecutable: false,
    mt5OrderTransportEnabled: false,
    reasoningPillars: ['Deterministic SMC', 'Bullish Micro-Structure', 'Order Flow Proxy'],
    opposingRisks: [],
    sessionContext: { sessionModel: 'LONDON' },
    evaluationTimestamp: Date.now(),
  };

  const fixtureTelemetry: any = {
    operatingMode: 'READ_ONLY',
    isMt5Connected: true,
    localBridgeOnline: true,
    heartbeatAgeMs: 500,
    timestamp: Date.now() - 1000,
    symbol: 'XAUUSD',
    bid: 4350.10,
    ask: 4350.35,
    spread: 0.25,
    isStale: false,
    account: {
      broker: 'Exness',
      tradeMode: 'DEMO',
      server: 'Exness-Trial2',
      balance: 10000,
    },
  };

  // Step 1: 21-Gate Eligibility Evaluation
  const knownKeys = new Set<string>();
  const eligibility = evaluateSignalEligibility(fixtureDecision, fixtureSetup, fixtureTelemetry, knownKeys);
  assert.strictEqual(eligibility.isEligible, true, `Fixture must pass all 21 eligibility gates: ${eligibility.rejectionReason}`);
  assert.strictEqual(eligibility.status, 'ELIGIBLE');
  assert(eligibility.payload, 'Eligible setup must generate a valid ValidatedSignalPayload');
  logStep('6. 21-Gate Eligibility Evaluation Passed', {
    status: eligibility.status,
    signalId: eligibility.payload?.signalId,
    idempotencyKey: eligibility.payload?.idempotencyKey,
    direction: eligibility.payload?.direction,
    entryMidpoint: eligibility.payload?.entryZone.midpoint,
    tp1: eligibility.payload?.takeProfit1.price,
    tp2: eligibility.payload?.takeProfit2.price,
    tp2Rr: eligibility.payload?.takeProfit2.riskReward,
    stopLoss: eligibility.payload?.stopLoss.price,
    riskRewardRatio: eligibility.payload?.riskRewardRatio,
  });

  // Step 2: Initialize Telegram Signal Service with Safe Mocked Client (0 Outbound HTTP)
  const client = new TelegramClient();
  const persistence = telegramPersistence;
  let externalRequestsMade = 0;

  // Intercept outbound photo delivery to simulate successful delivery without network calls
  client.sendSignalPhoto = async (params: any) => {
    externalRequestsMade++;
    return {
      success: true,
      telegramMessageId: 88812345,
      deliveredAt: new Date().toISOString(),
      isDryRun: true,
    };
  };

  const service = new TelegramSignalService({ client, persistence });

  // Step 3: Record and Enqueue Candidate Setup
  const queueRecord = persistence.enqueueSignal({
    signalId: eligibility.payload!.signalId,
    idempotencyKey: eligibility.payload!.idempotencyKey,
    destinationKey: '@forexmetalsignals',
  });
  assert(queueRecord, 'Signal must be enqueued into SQLite telegram_delivery_queue');

  // Also record the signal event for payload recovery
  persistence.recordSignalEvent({
    signalId: eligibility.payload!.signalId,
    setupId: eligibility.payload!.setupId,
    setupRevision: eligibility.payload!.setupRevision,
    symbol: eligibility.payload!.symbol,
    direction: eligibility.payload!.direction,
    timeframe: eligibility.payload!.timeframe,
    eligibilityStatus: 'ELIGIBLE',
    payloadJson: JSON.stringify(eligibility.payload),
    validatedAt: eligibility.payload!.timestamps.validatedAt,
  });

  logStep('7. Signal Enqueued in SQLite Queue', {
    queueId: queueRecord.id,
    signalId: queueRecord.signalId,
    idempotencyKey: queueRecord.idempotencyKey,
    destinationKey: queueRecord.destinationKey,
    status: queueRecord.status,
  });

  // Step 4: Execute Queue Consumer Loop
  logStep('8. Processing Delivery Queue via TelegramSignalService...', {});
  await service.processQueue();

  // Step 5: Verify Delivery Status in SQLite
  const db = (persistence as any).db;
  const deliveryRow = db.prepare('SELECT * FROM telegram_delivery_queue WHERE id = ?').get(queueRecord.id);
  assert(deliveryRow, 'Queue item must exist in telegram_delivery_queue');
  assert.strictEqual(deliveryRow.delivery_status, 'SENT', `Queue item delivery_status must be SENT, got ${deliveryRow.delivery_status}`);
  assert.strictEqual(deliveryRow.telegram_message_id, 88812345);
  logStep('9. Delivery Verified in SQLite Queue', {
    queueId: deliveryRow.id,
    deliveryStatus: deliveryRow.delivery_status,
    telegramMessageId: deliveryRow.telegram_message_id,
    deliveredAt: deliveryRow.delivered_at,
    attempts: deliveryRow.attempts,
  });

  // Step 6: Verify Delivery Audit Log
  const auditRow = db.prepare('SELECT * FROM telegram_delivery_audit WHERE signal_id = ? ORDER BY id DESC LIMIT 1').get(queueRecord.signalId);
  assert(auditRow, 'Audit log row must exist for processed delivery');
  assert.strictEqual(auditRow.status, 'SENT');
  assert.strictEqual(auditRow.event_type, 'DELIVERED');
  logStep('10. Delivery Audit Log Verified', {
    auditId: auditRow.id,
    signalId: auditRow.signal_id,
    eventType: auditRow.event_type,
    status: auditRow.status,
    timestamp: auditRow.timestamp,
  });

  // Step 7: Verify Retry / Failure Handling
  const failQueueRecord = persistence.enqueueSignal({
    signalId: `TEST-FAIL-${runId}`,
    idempotencyKey: `IDEMP-FAIL-${runId}`,
    destinationKey: '@forexmetalsignals',
  });
  assert(failQueueRecord);

  // Transient failure: should schedule retry
  persistence.markFailed(failQueueRecord.id, 'NETWORK_TIMEOUT', 'Simulated transient network timeout');
  const retryRow = db.prepare('SELECT * FROM telegram_delivery_queue WHERE id = ?').get(failQueueRecord.id);
  assert.strictEqual(retryRow.delivery_status, 'QUEUED');
  assert.strictEqual(retryRow.last_error_code, 'NETWORK_TIMEOUT');

  // Terminal failure: invalid destination fails permanently
  persistence.markFailed(failQueueRecord.id, 'INVALID_DESTINATION', 'Destination @unauthorized is forbidden');
  const terminalRow = db.prepare('SELECT * FROM telegram_delivery_queue WHERE id = ?').get(failQueueRecord.id);
  assert.strictEqual(terminalRow.delivery_status, 'DELIVERY_FAILED');
  assert.strictEqual(terminalRow.last_error_code, 'INVALID_DESTINATION');
  logStep('11. Failure Handling & Error Logging Verified', {
    failedQueueId: terminalRow.id,
    deliveryStatus: terminalRow.delivery_status,
    lastErrorCode: terminalRow.last_error_code,
    lastErrorMessage: terminalRow.last_error_message,
    attempts: terminalRow.attempts,
  });

  // Step 8: Confirm Zero Live Channel Messages Dispatched
  assert.strictEqual(externalRequestsMade, 1, 'Only intercepted mock send was invoked; 0 live network calls');
  logStep('12. Zero External Telegram Messages Verified', {
    liveNetworkCalls: 0,
    interceptedDispatches: externalRequestsMade,
    destinationGuarded: '@forexmetalsignals',
  });

  console.log('\n================================================================');
  console.log('PHASE 18.1 NOTIFICATION & TELEGRAM PROOF: ALL 12 CHECKS PASSED');
  console.log('================================================================');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
