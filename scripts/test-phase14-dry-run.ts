/**
 * FEF CORTEX — PHASE 14 TEST: DRY-RUN SIMULATION PIPELINE
 */

import { simulateDryRunDelivery } from '../src/lib/telegram/telegram-dry-run';
import { DecisionIntelligenceV2 } from '../src/lib/decision/decision-engine-v2';
import { SetupIntelligenceV3 } from '../src/lib/setup/setup-intelligence-v3';

async function runDryRunPipelineTests() {
  console.log('===============================================================');
  console.log('    FEF CORTEX: PHASE 14 DRY-RUN SIMULATION PIPELINE TEST     ');
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
    decisionId: 'dec-dryrun-01',
    symbol: 'XAUUSD',
    bias: 'BULLISH',
    confidence: 89,
    evidenceCompleteness: 94,
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
    setupId: 'setup-dryrun-gold',
    symbol: 'XAUUSD',
    snapshotId: 'snap-dryrun-1',
    asOf: Date.now(),
    lifecycle: 'VALIDATED',
    direction: 'LONG',
    setupType: 'CONTINUATION',
    thesis: 'Price is showing bullish continuation above key support. Momentum and structure favor upside toward the next resistance zone.',
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0, source: 'FVG', rationale: 'Fair Value Gap' },
    stopLoss: { price: 2735.0, distance: 6.0, rationale: 'Swing Low', bufferAtrMultiplier: 1.5 },
    targets: [
      { targetIndex: 0, label: 'TP1', price: 2755.0, source: 'Resistance', rationale: 'Key Level', rewardDistance: 14.0, riskReward: 2.33 },
      { targetIndex: 1, label: 'TP2', price: 2765.0, source: 'Expansion', rationale: 'Fib Target', rewardDistance: 24.0, riskReward: 4.0 },
    ],
    invalidation: { price: 2735.0, condition: 'Candle close below 2735.0', source: 'Structure', rationale: 'Structure invalidation' },
  } as any;

  const telemetry = {
    symbol: 'XAUUSD',
    bid: 2741.2,
    ask: 2741.5,
    timestamp: Date.now(),
  };

  // 1. Execute Dry-Run Simulation
  const receipt = await simulateDryRunDelivery(mockDecision, mockSetup, telemetry);

  assert('Simulated delivery status is DELIVERED_DRY_RUN', receipt.simulatedDeliveryStatus === 'DELIVERED_DRY_RUN');
  assert('Image dimensions are 1080x1350', receipt.imageDimensions === '1080x1350');
  assert('Image size is valid high-res PNG (> 500 KB)', receipt.imageSizeBytes > 500_000);
  assert('Caption fits Telegram 1024-char limit', receipt.captionValidation.fitsTelegramLimit);
  assert('All 11 caption fields verified', Object.values(receipt.captionValidation.fieldsPresent).every(Boolean));
  assert('Destination is canonical @forexmetalsignals', receipt.destinationConfigStatus.canonicalDestination === '@forexmetalsignals');
  assert('Destination is verified allowlisted', receipt.destinationConfigStatus.isAllowlisted);
  assert('Private groups are strictly prohibited', receipt.destinationConfigStatus.privateGroupsProhibited);

  console.log('\n--- SAMPLE DRY-RUN DELIVERY RECEIPT ---');
  console.log(JSON.stringify({
    signalId: receipt.signalId,
    instrument: receipt.instrument,
    category: receipt.category,
    cardFilename: receipt.cardFilename,
    captionValidation: {
      charCount: receipt.captionValidation.characterCount,
      fitsTelegramLimit: receipt.captionValidation.fitsTelegramLimit,
      validHtml: receipt.captionValidation.validHtml,
    },
    destinationConfigStatus: receipt.destinationConfigStatus,
    duplicateCheck: receipt.duplicateCheck,
    eligibilityResult: receipt.eligibilityResult,
    simulatedDeliveryStatus: receipt.simulatedDeliveryStatus,
  }, null, 2));

  console.log('\n===============================================================');
  console.log(`DRY-RUN TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runDryRunPipelineTests();

