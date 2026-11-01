/**
 * FEF CORTEX — PHASE 14 IMAGE DELIVERY VALIDATION SUITE
 * Validates 1080x1350 resolution, PNG format, authentic branding, and 5-category asset mapping.
 */

import * as fs from 'fs';
import * as path from 'path';
import { renderSignalCardPng, resolveInstrumentCategory } from '../src/lib/telegram/telegram-image-renderer';
import { ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';

interface AssetTestCase {
  symbol: string;
  category: string;
  expectedHero: string;
  price: number;
  sl: number;
  tp1: number;
}

const TEST_ASSETS: AssetTestCase[] = [
  // 1. Metals
  { symbol: 'XAUUSD', category: 'METALS', expectedHero: 'hero-metals-gold.jpg', price: 2741.50, sl: 2735.00, tp1: 2755.00 },
  { symbol: 'XAGUSD', category: 'METALS', expectedHero: 'hero-metals-silver.jpg', price: 33.85, sl: 33.20, tp1: 35.15 },
  { symbol: 'XPTUSD', category: 'METALS', expectedHero: 'hero-metals-platinum.jpg', price: 1024.50, sl: 1010.00, tp1: 1055.00 },
  { symbol: 'XPDUSD', category: 'METALS', expectedHero: 'hero-metals-palladium.jpg', price: 1145.00, sl: 1120.00, tp1: 1195.00 },
  // 2. Energy
  { symbol: 'USOIL', category: 'ENERGY', expectedHero: 'hero-energy-oil.jpg', price: 71.40, sl: 69.80, tp1: 74.60 },
  { symbol: 'NATGAS', category: 'ENERGY', expectedHero: 'hero-energy-gas.jpg', price: 2.850, sl: 2.720, tp1: 3.110 },
  // 3. Forex
  { symbol: 'EURUSD', category: 'FOREX', expectedHero: 'hero-forex-eurusd.jpg', price: 1.0845, sl: 1.0810, tp1: 1.0915 },
  { symbol: 'USDJPY', category: 'FOREX', expectedHero: 'hero-forex-usdjpy.jpg', price: 152.40, sl: 151.60, tp1: 154.00 },
  // 4. Indices
  { symbol: 'US100', category: 'INDICES', expectedHero: 'hero-indices-exchange.jpg', price: 20450.0, sl: 20300.0, tp1: 20750.0 },
  { symbol: 'US500', category: 'INDICES', expectedHero: 'hero-indices-sp500.jpg', price: 5820.5, sl: 5780.0, tp1: 5900.0 },
  // 5. Crypto
  { symbol: 'BTCUSD', category: 'CRYPTO', expectedHero: 'hero-crypto-bitcoin.jpg', price: 69500.0, sl: 68200.0, tp1: 72100.0 },
  { symbol: 'ETHUSD', category: 'CRYPTO', expectedHero: 'hero-crypto-ethereum.jpg', price: 2540.0, sl: 2480.0, tp1: 2660.0 },
];

export async function validateAllImages(): Promise<{ passed: number; failed: number; results: any[] }> {
  console.log('===============================================================');
  console.log('   FEF CORTEX: PHASE 14 IMAGE DELIVERY VALIDATION SUITE        ');
  console.log('   Validating 12 Assets Across 5 Master Categories            ');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;
  const results: any[] = [];

  for (const asset of TEST_ASSETS) {
    const theme = resolveInstrumentCategory(asset.symbol);

    // 1. Verify Category & Hero Selection
    const heroMatch = theme.heroImageFile === asset.expectedHero;
    const catMatch = theme.category === asset.category;

    // 2. Synthesize Signal Payload
    const payload: ValidatedSignalPayload = {
      signalId: `SIG-${asset.symbol}-VALIDATE-M15`,
      setupId: `setup-${asset.symbol.toLowerCase()}-val`,
      setupRevision: 1,
      symbol: asset.symbol,
      direction: 'BUY',
      timeframe: 'M15',
      marketPrice: asset.price,
      entryZone: { low: asset.price - 0.5, high: asset.price + 0.5, midpoint: asset.price },
      stopLoss: { price: asset.sl, distance: Math.abs(asset.price - asset.sl) },
      takeProfit1: { price: asset.tp1, distance: Math.abs(asset.tp1 - asset.price), riskReward: 2.5 },
      riskRewardRatio: 2.5,
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
        thesis: `Dynamic validation setup for ${asset.symbol} in ${asset.category} category.`,
        invalidationPrice: asset.sl,
      },
      timestamps: {
        asOf: Date.now(),
        marketDataTimestamp: Date.now(),
        validatedAt: new Date().toISOString(),
      },
      idempotencyKey: `${asset.symbol}_setup-val_1`,
    };

    // 3. Render PNG
    const pngBuffer = await renderSignalCardPng(payload);

    // 4. Validate PNG Magic Bytes
    const isPng = pngBuffer.length >= 8 &&
      pngBuffer[0] === 0x89 &&
      pngBuffer[1] === 0x50 && // P
      pngBuffer[2] === 0x4E && // N
      pngBuffer[3] === 0x47 && // G
      pngBuffer[4] === 0x0D &&
      pngBuffer[5] === 0x0A &&
      pngBuffer[6] === 0x1A &&
      pngBuffer[7] === 0x0A;

    // 5. Read IHDR dimensions (offset 16-24: 4 bytes width, 4 bytes height)
    let width = 0;
    let height = 0;
    if (pngBuffer.length >= 24) {
      width = pngBuffer.readUInt32BE(16);
      height = pngBuffer.readUInt32BE(20);
    }
    const hasCorrectDimensions = width === 1080 && height === 1350;

    // 6. Check size within Telegram boundaries (< 10 MB, expected 500KB - 2MB)
    const sizeOk = pngBuffer.length > 200_000 && pngBuffer.length < 10_000_000;

    const allOk = heroMatch && catMatch && isPng && hasCorrectDimensions && sizeOk;

    if (allOk) {
      console.log(`  ✓ [PASS] ${asset.symbol.padEnd(7)} | ${theme.category.padEnd(8)} | ${width}x${height} | ${(pngBuffer.length / 1024).toFixed(0)} KB | Hero: ${theme.heroImageFile}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${asset.symbol.padEnd(7)} | ${theme.category.padEnd(8)} | dimensions: ${width}x${height} | isPng: ${isPng} | size: ${pngBuffer.length}`);
      failed++;
    }

    results.push({
      symbol: asset.symbol,
      category: theme.category,
      heroImage: theme.heroImageFile,
      width,
      height,
      bytes: pngBuffer.length,
      passed: allOk,
    });
  }

  console.log('===============================================================');
  console.log(`IMAGE VALIDATION COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('===============================================================');

  return { passed, failed, results };
}

if (require.main === module || process.argv[1]?.endsWith('validate-phase14-images.ts')) {
  validateAllImages().then(({ failed }) => {
    if (failed > 0) process.exit(1);
  });
}

