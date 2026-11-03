#!/usr/bin/env ts-node
/**
 * FEF CORTEX — PHASE 13 MASTER ACCEPTANCE & INTEGRATION TEST SUITE
 *
 * Verifies:
 * 1. Validated Setup Eligibility Gate (21 Mandatory Checks)
 * 2. SQLite Durable Delivery Queue Persistence & Atomic Claiming
 * 3. 1080x1350 High-Contrast Signal Card PNG/SVG Local Rasterization
 * 4. Telegram Bot API Client with Private Group Allowlist & Token Redaction
 * 5. Telegram Signal Service Lifecycle & End-to-End Delivery
 * 6. Zero-Cost Policy Enforcement (No OpenAI, No Paid Image APIs)
 * 7. Security Invariants (READ_ONLY, MT5_ORDER_TRANSPORT_ENABLED=false, 17-line journal SHA-256)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { evaluateSignalEligibility, ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';
import { TelegramPersistenceService } from '../src/lib/telegram/telegram-persistence';
import { TelegramClient } from '../src/lib/telegram/telegram-client';
import { renderSignalCardSvg, renderSignalCardPng } from '../src/lib/telegram/telegram-image-renderer';
import { TelegramSignalService } from '../src/lib/telegram/telegram-signal-service';
import { generateSignalIdempotencyKey } from '../src/lib/telegram/telegram-idempotency';
import { MT5_ORDER_TRANSPORT_ENABLED, CANONICAL_EXECUTION_MODE } from '../src/lib/execution/execution-policy';
import { openAiService } from '../src/lib/intelligence/openai-client';

interface TestResult {
  id: number;
  name: string;
  category: 'ELIGIBILITY' | 'PERSISTENCE' | 'IMAGE_RENDERER' | 'CLIENT_SECURITY' | 'E2E_PIPELINE' | 'INVARIANTS';
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(id: number, name: string, category: TestResult['category'], condition: boolean, error?: string) {
  if (condition) {
    results.push({ id, name, category, passed: true });
    console.log(`  ✓ [PASS] ${id}. ${name}`);
  } else {
    results.push({ id, name, category, passed: false, error: error || 'Assertion failed' });
    console.error(`  ✗ [FAIL] ${id}. ${name}: ${error || 'Assertion failed'}`);
  }
}

async function runMasterSuite() {
  console.log(`===============================================================`);
  console.log(`    FEF CORTEX: PHASE 13 MASTER ACCEPTANCE SUITE               `);
  console.log(`===============================================================\n`);

  const now = Date.now();

  const mockDecision: any = {
    maturity: 'VALIDATED_SETUP',
    bias: 'BULLISH',
    confidence: 88,
    evidenceCompleteness: 92,
    independentDomainCount: 3,
    supportingDomains: ['PRICE_STRUCTURE', 'MOMENTUM', 'INSTITUTIONAL_PROXY'],
    hardVetoes: [],
    conflicts: [],
    sessionContext: { sessionModel: 'LONDON', killzoneWindow: 'ACTIVE' },
    tradeExecutable: false,
    executionMode: 'READ_ONLY',
    mt5OrderTransportEnabled: false,
    snapshotId: 'snap-master-01',
    asOf: now,
  };

  const mockSetup: any = {
    version: '3.0',
    setupId: 'setup-master-001',
    symbol: 'XAUUSD',
    snapshotId: 'snap-master-01',
    asOf: now,
    lifecycle: 'VALIDATED',
    direction: 'LONG',
    setupType: 'LIQUIDITY_SWEEP',
    thesis: 'M15 liquidity sweep with strong bullish displacement into London open',
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0 },
    stopLoss: { price: 2735.0, distance: 6.0 },
    targets: [
      { targetIndex: 1, label: 'TP1', price: 2749.0, rewardDistance: 8.0, riskReward: 1.33 },
      { targetIndex: 2, label: 'TP2', price: 2755.0, rewardDistance: 14.0, riskReward: 2.33 },
    ],
    riskReward: { ratio: 2.33, formatted: '1:2.33', meetsMinimumThreshold: true },
    structuralContext: { structureTf: 'M15' },
  };

  const mockTelemetry = {
    symbol: 'XAUUSD',
    bid: 2741.2,
    ask: 2741.6,
    spreadPoints: 4,
    timestamp: now - 3000,
    mt5Connected: true,
  };

  // --- SECTION A: ELIGIBILITY GATE ---
  console.log(`[A. Validated Setup Eligibility Gate]`);
  const el1 = evaluateSignalEligibility(mockDecision, mockSetup, mockTelemetry, new Set());
  assert(1, 'Fully validated BUY setup passes as ELIGIBLE', 'ELIGIBILITY', el1.isEligible && el1.status === 'ELIGIBLE');
  assert(2, 'Direction correctly mapped from LONG to BUY', 'ELIGIBILITY', el1.payload?.direction === 'BUY');
  assert(3, 'Mandatory R:R threshold verified (≥ 2.0:1)', 'ELIGIBILITY', (el1.payload?.riskRewardRatio || 0) >= 2.0);

  const elSubRr = evaluateSignalEligibility(mockDecision, {
    ...mockSetup,
    targets: [
      { targetIndex: 1, label: 'TP1', price: 2749.0, rewardDistance: 8.0, riskReward: 1.33 },
      { targetIndex: 2, label: 'TP2', price: 2745.8, rewardDistance: 4.8, riskReward: 0.8 },
    ],
    riskReward: { ratio: 0.8, meetsMinimumThreshold: false }
  }, mockTelemetry, new Set());
  assert(4, 'Sub-2.0 R:R setup rejected by gate (REJECTED_RR)', 'ELIGIBILITY', !elSubRr.isEligible && elSubRr.status === 'REJECTED_RR');

  const elVeto = evaluateSignalEligibility({ ...mockDecision, hardVetoes: [{ type: 'HARD_VETO', effect: 'BLOCK_SETUP_VALIDATION', reason: 'Veto' }] }, mockSetup, mockTelemetry, new Set());
  assert(5, 'Active hard veto strictly blocks signal eligibility', 'ELIGIBILITY', !elVeto.isEligible && elVeto.status === 'REJECTED_VETO');

  const elGer40 = evaluateSignalEligibility(mockDecision, { ...mockSetup, symbol: 'GER40' }, mockTelemetry, new Set());
  assert(6, 'Unsupported instrument GER40 fails closed', 'ELIGIBILITY', !elGer40.isEligible && elGer40.status === 'REJECTED_UNSUPPORTED_INSTRUMENT');

  const elStale = evaluateSignalEligibility(mockDecision, mockSetup, { ...mockTelemetry, timestamp: now - 45000 }, new Set());
  assert(7, 'Stale quote (>30s) rejected by gate', 'ELIGIBILITY', !elStale.isEligible && elStale.status === 'REJECTED_STALE_DATA');

  // --- SECTION B: PERSISTENCE & QUEUE ---
  console.log(`\n[B. SQLite Persistence & Durable Queue]`);
  const memDb = new TelegramPersistenceService({ dbPath: ':memory:' });
  const eventRecorded = memDb.recordSignalEvent({
    signalId: 'SIG-TEST-001',
    setupId: 'setup-001',
    setupRevision: 1,
    symbol: 'XAUUSD',
    direction: 'BUY',
    timeframe: 'M15',
    eligibilityStatus: 'ELIGIBLE',
    payloadHash: 'hash123',
    payloadJson: JSON.stringify(el1.payload),
  });
  assert(8, 'Signal event successfully recorded in SQLite', 'PERSISTENCE', eventRecorded);

  const queueItem = memDb.enqueueSignal({
    signalId: 'SIG-TEST-001',
    idempotencyKey: 'XAUUSD_setup-001_1',
    destinationKey: 'hash-priv-01',
  });
  assert(9, 'Signal queued with QUEUED status', 'PERSISTENCE', queueItem?.deliveryStatus === 'QUEUED');

  const isDup = memDb.hasBeenEnqueuedOrDelivered('XAUUSD_setup-001_1');
  assert(10, 'Idempotency check identifies duplicate setup key', 'PERSISTENCE', isDup);

  const claimed = memDb.claimNextPendingBatch(1);
  assert(11, 'Batch claiming atomically transitions status to SENDING', 'PERSISTENCE', claimed.length === 1 && claimed[0].deliveryStatus === 'SENDING');

  memDb.markDelivered(claimed[0].id, 887766);
  const delivered = memDb.getDeliveryBySignalId('SIG-TEST-001');
  assert(12, 'Mark delivered saves Telegram Message ID', 'PERSISTENCE', delivered?.deliveryStatus === 'SENT' && delivered?.telegramMessageId === 887766);

  // --- SECTION C: LOCAL IMAGE RENDERER ---
  console.log(`\n[C. 1080x1350 Local Image Renderer]`);
  const buySvg = renderSignalCardSvg(el1.payload!);
  assert(13, 'Generated SVG contains 1080x1350 dimensions and branding', 'IMAGE_RENDERER',
    buySvg.includes('width="1080"') && buySvg.includes('height="1350"') && buySvg.includes('FEF CORTEX'));

  const previewSvg = renderSignalCardSvg(el1.payload!, { isPreview: true });
  assert(14, 'Preview mode renders PREVIEW ONLY watermark banner', 'IMAGE_RENDERER',
    previewSvg.includes('PREVIEW ONLY') && previewSvg.includes('SYNTHETIC DEMO'));

  const png = await renderSignalCardPng(el1.payload!);
  assert(15, 'Locally rasterized PNG has valid magic bytes and high-res size', 'IMAGE_RENDERER',
    png.length > 50000 && png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a');

  // --- SECTION D: TELEGRAM CLIENT & SECURITY ---
  console.log(`\n[D. Telegram Client & Public Channel Security]`);
  const tgClient = new TelegramClient({
    botToken: '123456:MOCK_TOKEN_VAL',
    enabled: true,
    dryRun: true,
  });

  const pubCfg = tgClient.getPublicConfig();
  assert(16, 'Public configuration strictly redacts token string and targets @forexmetalsignals', 'CLIENT_SECURITY',
    !JSON.stringify(pubCfg).includes('MOCK_TOKEN_VAL') && pubCfg.channelUsername === '@forexmetalsignals');

  const unauthChat = await tgClient.sendSignalPhoto({
    chatId: '-100999999999', // Private group attempt (prohibited)
    photoBuffer: png,
    caption: 'Test',
  });
  assert(17, 'Private groups or arbitrary chats strictly rejected', 'CLIENT_SECURITY',
    !unauthChat.success && (unauthChat.errorCode === 'PRIVATE_GROUPS_PROHIBITED' || unauthChat.errorCode === 'CHANNEL_NOT_ALLOWED'));

  const dryRunRes = await tgClient.sendSignalPhoto({
    chatId: '@forexmetalsignals',
    photoBuffer: png,
    caption: 'Test',
  });
  assert(18, 'Dry-run delivery simulates success to @forexmetalsignals without outbound network call', 'CLIENT_SECURITY',
    dryRunRes.success && dryRunRes.isDryRun === true && typeof dryRunRes.telegramMessageId === 'number');

  // --- SECTION E: END-TO-END ORCHESTRATION ---
  console.log(`\n[E. End-to-End Orchestration Pipeline]`);
  const testService = new TelegramSignalService({
    persistence: memDb,
    client: tgClient,
  });

  const candidateRes = await testService.processCandidateSetup(
    mockDecision,
    { ...mockSetup, setupId: 'setup-master-e2e' },
    mockTelemetry
  );
  assert(19, 'E2E candidate setup intake enqueued and processed successfully', 'E2E_PIPELINE',
    candidateRes.enqueued === true && candidateRes.status === 'ELIGIBLE' && Boolean(candidateRes.signalId));

  const e2eDelivery = memDb.getDeliveryBySignalId(candidateRes.signalId!);
  assert(20, 'E2E delivery worker transitioned signal status to SENT', 'E2E_PIPELINE',
    e2eDelivery?.deliveryStatus === 'SENT' && typeof e2eDelivery?.telegramMessageId === 'number');

  // --- SECTION F: ZERO-COST & INVARIANTS ---
  console.log(`\n[F. Zero-Cost Policy & Security Invariants]`);
  const openAiCfg = openAiService.loadConfig();
  assert(21, 'Zero-Cost Compliance: OPENAI_ENABLED remains strictly false', 'INVARIANTS',
    openAiCfg.enabled === false);

  assert(22, 'Zero-Cost Compliance: OPENAI_DAILY_BUDGET_USD remains strictly $0.00', 'INVARIANTS',
    openAiCfg.dailyBudgetUsd === 0.0);

  assert(23, 'MT5_ORDER_TRANSPORT_ENABLED remains strictly false', 'INVARIANTS',
    MT5_ORDER_TRANSPORT_ENABLED === false && CANONICAL_EXECUTION_MODE === 'READ_ONLY');

  const journalPath = path.resolve(__dirname, '../data/fef-execution-journal.jsonl');
  const journalContent = fs.readFileSync(journalPath, 'utf8');
  const journalLines = journalContent.trim().split('\n').filter(Boolean);
  const journalHash = crypto.createHash('sha256').update(journalContent).digest('hex');
  const EXPECTED_HASH = '88dfd508701125d3b7de67be64f87ce25fab091deb22b260da18c27473c2834b';

  assert(24, 'Execution journal line count remains exactly 17 lines', 'INVARIANTS',
    journalLines.length === 17);

  assert(25, 'Execution journal SHA-256 matches audited baseline', 'INVARIANTS',
    journalHash === EXPECTED_HASH);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n===============================================================`);
  console.log(`PHASE 13 MASTER SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${results.length})`);
  console.log(`===============================================================\n`);

  if (failed > 0) process.exit(1);
}

runMasterSuite().catch((err) => {
  console.error('Master suite fatal error:', err);
  process.exit(1);
});

