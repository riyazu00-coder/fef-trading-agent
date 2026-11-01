/**
 * FEF CORTEX — PHASE 14 TEST: CAPTION FORMATTER & 3 LIFECYCLE TYPES
 */

import { telegramClient } from '../src/lib/telegram/telegram-client';
import { ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';

function runCaptionTests() {
  console.log('===============================================================');
  console.log('   FEF CORTEX: PHASE 14 CAPTION FORMATTER & LIFECYCLE TESTS    ');
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

  const basePayload: ValidatedSignalPayload = {
    signalId: 'SIG-XAUUSD-10827-M15',
    setupId: 'setup-xau-10827',
    setupRevision: 1,
    messageType: 'NEW_OPPORTUNITY',
    symbol: 'XAUUSD',
    direction: 'BUY',
    timeframe: 'M15',
    marketPrice: 2741.50,
    entryZone: { low: 2740.0, high: 2742.0, midpoint: 2741.0 },
    stopLoss: { price: 2735.0, distance: 6.0 },
    takeProfit1: { price: 2755.0, distance: 14.0, riskReward: 2.33 },
    riskRewardRatio: 2.33,
    decisionEngine: {
      bias: 'BULLISH',
      confidencePct: 88,
      completenessPct: 92,
      independentDomainsCount: 3,
      maturity: 'VALIDATED_SETUP',
    },
    setupIntelligence: {
      type: 'BREAKOUT',
      lifecycle: 'VALIDATED',
      thesis: 'Price is showing bullish continuation above key support with strong momentum toward resistance.',
      invalidationPrice: 2735.0,
    },
    timestamps: {
      asOf: Date.now(),
      marketDataTimestamp: Date.now(),
      validatedAt: new Date().toISOString(),
    },
    idempotencyKey: 'XAUUSD_setup-xau-10827_1',
  };

  // Test 1: NEW_OPPORTUNITY Caption Length (< 1024)
  const cap1 = telegramClient.formatSignalCaption(basePayload);
  assert('NEW_OPPORTUNITY caption strictly under 1024 characters', cap1.length <= 1024, `(length: ${cap1.length})`);
  assert('NEW_OPPORTUNITY contains header', cap1.includes('FEF CORTEX | NEW OPPORTUNITY'));
  assert('NEW_OPPORTUNITY contains official dashboard link', cap1.includes('app.feftradingsolutions.com'));
  assert('NEW_OPPORTUNITY contains official website link', cap1.includes('www.feftradingsolutions.com'));

  // Test 2: Payload with TP1, TP2, TP3 (maximum target density)
  const densePayload: ValidatedSignalPayload = {
    ...basePayload,
    takeProfit2: { price: 2765.0, distance: 24.0, riskReward: 4.0 },
    takeProfit3: { price: 2780.0, distance: 39.0, riskReward: 6.5 },
  };
  const capDense = telegramClient.formatSignalCaption(densePayload);
  assert('Dense 3-TP caption strictly under 1024 characters', capDense.length <= 1024, `(length: ${capDense.length})`);
  assert('Dense caption renders TP1, TP2, TP3', capDense.includes('TP1') && capDense.includes('TP2') && capDense.includes('TP3'));

  // Test 3: SETUP_UPDATE (Rev 2)
  const updatePayload: ValidatedSignalPayload = {
    ...densePayload,
    setupRevision: 2,
    messageType: 'SETUP_UPDATE',
    entryZone: { low: 2742.0, high: 2744.0, midpoint: 2743.0 },
  };
  const capUpdate = telegramClient.formatSignalCaption(updatePayload);
  assert('SETUP_UPDATE caption strictly under 1024 characters', capUpdate.length <= 1024, `(length: ${capUpdate.length})`);
  assert('SETUP_UPDATE header indicates Revision 2', capUpdate.includes('SETUP UPDATE (Rev 2)'));

  // Test 4: SETUP_INVALIDATED
  const invalidPayload: ValidatedSignalPayload = {
    ...basePayload,
    messageType: 'SETUP_INVALIDATED',
    setupIntelligence: {
      ...basePayload.setupIntelligence,
      lifecycle: 'INVALIDATED',
    },
  };
  const capInvalid = telegramClient.formatSignalCaption(invalidPayload);
  assert('SETUP_INVALIDATED caption strictly under 1024 characters', capInvalid.length <= 1024, `(length: ${capInvalid.length})`);
  assert('SETUP_INVALIDATED contains invalidation header', capInvalid.includes('FEF CORTEX | SETUP INVALIDATED'));

  // Test 5: HTML Escaping of Special Characters
  const rawHtmlPayload: ValidatedSignalPayload = {
    ...basePayload,
    setupIntelligence: {
      ...basePayload.setupIntelligence,
      thesis: 'Test <script>alert("hack")</script> & dynamic "rates" > 100',
    },
  };
  const capEscaped = telegramClient.formatSignalCaption(rawHtmlPayload);
  assert('HTML tags safely escaped (< to &lt;, & to &amp;)', capEscaped.includes('&lt;script&gt;') && capEscaped.includes('&amp;'));

  console.log('===============================================================');
  console.log(`CAPTION TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('===============================================================');

  if (failed > 0) process.exit(1);
}

runCaptionTests();

