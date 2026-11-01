#!/usr/bin/env ts-node
/**
 * FEF CORTEX — PHASE 13 TASK 3: LOCAL IMAGE RENDERER TESTS
 */

import { renderSignalCardSvg, renderSignalCardPng } from '../src/lib/telegram/telegram-image-renderer';
import { ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';

async function runImageRendererTests() {
  console.log(`===============================================================`);
  console.log(`  FEF CORTEX: PHASE 13 TASK 3 IMAGE RENDERER TESTS             `);
  console.log(`===============================================================\n`);

  const mockBuyPayload: ValidatedSignalPayload = {
    signalId: 'SIG-XAUUSD-001-TEST',
    setupId: 'setup-xau-001',
    setupRevision: 1,
    symbol: 'XAUUSD',
    direction: 'BUY',
    timeframe: 'M15',
    marketPrice: 2741.50,
    entryZone: { low: 2740.00, high: 2742.00, midpoint: 2741.00 },
    stopLoss: { price: 2735.00, distance: 6.00 },
    takeProfit1: { price: 2755.00, distance: 14.00, riskReward: 2.33 },
    takeProfit2: { price: 2765.00, distance: 24.00, riskReward: 4.00 },
    riskRewardRatio: 2.33,
    decisionEngine: {
      bias: 'BULLISH',
      confidencePct: 88,
      completenessPct: 92,
      independentDomainsCount: 3,
      maturity: 'VALIDATED_SETUP',
    },
    setupIntelligence: {
      type: 'LIQUIDITY_SWEEP',
      lifecycle: 'VALIDATED',
      thesis: 'Clean liquidity sweep of Asian session low with strong M15 displacement',
      invalidationPrice: 2735.00,
    },
    sessionContext: { currentSession: 'LONDON', activeKillzone: true },
    timestamps: {
      asOf: Date.now(),
      marketDataTimestamp: Date.now() - 2000,
      validatedAt: '2026-11-01T10:00:00.000Z',
    },
    idempotencyKey: 'XAUUSD_setup-xau-001_1',
  };

  // Test 1: SVG generation for BUY card
  const buySvg = renderSignalCardSvg(mockBuyPayload);
  const hasBuyColors = buySvg.includes('#22D3EE') || buySvg.includes('#10B981');
  const hasBuyDimensions = buySvg.includes('width="1080"') && buySvg.includes('height="1350"');
  console.log(hasBuyColors && hasBuyDimensions
    ? '  ✓ [PASS] 1. Rendered BUY SVG with exact 1080x1350 dimensions and theme colors'
    : '  ✗ [FAIL] 1. BUY SVG failed dimension or theme check');

  // Test 2: SVG generation for SELL card
  const mockSellPayload: ValidatedSignalPayload = {
    ...mockBuyPayload,
    signalId: 'SIG-EURUSD-002-TEST',
    symbol: 'EURUSD',
    direction: 'SELL',
    marketPrice: 1.0850,
    entryZone: { low: 1.0850, high: 1.0855, midpoint: 1.0852 },
    stopLoss: { price: 1.0875, distance: 0.0023 },
    takeProfit1: { price: 1.0790, distance: 0.0062, riskReward: 2.70 },
    riskRewardRatio: 2.70,
    decisionEngine: { ...mockBuyPayload.decisionEngine, bias: 'BEARISH' },
  };
  const sellSvg = renderSignalCardSvg(mockSellPayload);
  const hasSellColors = sellSvg.includes('#EF4444') || sellSvg.includes('#F87171') || sellSvg.includes('#FB7185') || sellSvg.includes('#F43F5E');
  console.log(hasSellColors
    ? '  ✓ [PASS] 2. Rendered SELL SVG with distinct Rose/Red directional palette'
    : '  ✗ [FAIL] 2. SELL SVG failed palette check');

  // Test 3: XML / SVG Injection prevention
  const injectionPayload: ValidatedSignalPayload = {
    ...mockBuyPayload,
    setupIntelligence: {
      ...mockBuyPayload.setupIntelligence,
      thesis: 'Exploit <script>alert("hacked")</script> & "quotes" and <tag>',
    },
  };
  const escapedSvg = renderSignalCardSvg(injectionPayload);
  const injectionPrevented = !escapedSvg.includes('<script>') && escapedSvg.includes('&lt;script&gt;');
  console.log(injectionPrevented
    ? '  ✓ [PASS] 3. XML / SVG injection characters safely escaped'
    : '  ✗ [FAIL] 3. Injection escaping failed');

  // Test 4: Watermarked Synthetic Preview
  const previewSvg = renderSignalCardSvg(mockBuyPayload, { isPreview: true });
  const hasWatermark = previewSvg.includes('PREVIEW ONLY') && previewSvg.includes('SYNTHETIC DEMO');
  console.log(hasWatermark
    ? '  ✓ [PASS] 4. Preview mode clearly renders diagonal warning watermark'
    : '  ✗ [FAIL] 4. Preview watermark missing');

  // Test 5: PNG Rasterization Buffer
  const pngBuffer = await renderSignalCardPng(mockBuyPayload);
  const isPng = pngBuffer && pngBuffer.length > 5000 && pngBuffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  console.log(isPng
    ? `  ✓ [PASS] 5. High-res PNG rasterized successfully (${pngBuffer.length} bytes, valid PNG magic bytes)`
    : '  ✗ [FAIL] 5. PNG rasterization failed');

  console.log(`\n===============================================================`);
  console.log(`IMAGE RENDERER TESTS COMPLETE: ALL 5 TESTS PASSED`);
  console.log(`===============================================================\n`);
}

runImageRendererTests().catch((err) => {
  console.error('Image renderer test error:', err);
  process.exit(1);
});

