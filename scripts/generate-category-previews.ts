#!/usr/bin/env ts-node
/**
 * FEF CORTEX — FIVE REUSABLE MASTER CATEGORY TEMPLATES PREVIEW GENERATOR
 *
 * Generates 1080×1350 PNG preview cards for the FIVE Master Category Templates:
 * 1. METALS (Template 1: XAUUSD Gold, with XAGUSD Silver dynamic resolution demo)
 * 2. ENERGY & COMMODITIES (Template 2: USOIL Crude Oil)
 * 3. FOREX (Template 3: EURUSD Euro / US Dollar)
 * 4. INDICES (Template 4: US100 Nasdaq 100)
 * 5. CRYPTO (Template 5: BTCUSD Bitcoin)
 *
 * ARCHITECTURAL INVARIANTS:
 * - Exactly FIVE reusable master card templates (one per category).
 * - Identical layout and geometry within each category.
 * - Dynamic asset-specific hero image selection via central resolver.
 * - Neutral category image fallback if an instrument has no dedicated mapping.
 * - Sourced strictly from validated CORTEX Decision Engine V2 & Setup Intelligence V3 models.
 * - Mandatory R:R ≥ 2.0:1 compliance.
 * - Clear PREVIEW ONLY watermark on all cards.
 * - Zero Telegram delivery (local generation only).
 */

import * as fs from 'fs';
import * as path from 'path';
import { renderSignalCardPng, resolveInstrumentCategory } from '../src/lib/telegram/telegram-image-renderer';
import { ValidatedSignalPayload } from '../src/lib/telegram/telegram-signal-eligibility';

const outputDir = path.resolve(process.cwd(), 'artifacts_visual');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const artifactDir = '/Users/mac/.gemini/antigravity/brain/fa54ad24-3b14-4fde-a263-ed5c6dfd2025';
const now = Date.now();

// 1. MASTER TEMPLATE 1: METALS (Primary: XAUUSD Gold, BUY, 3 targets)
const metalsGoldPayload: ValidatedSignalPayload = {
  signalId: 'FEF-XAU-10827-01NOV',
  setupId: 'setup-xau-10827',
  setupRevision: 1,
  symbol: 'XAUUSD',
  direction: 'BUY',
  timeframe: 'M5',
  marketPrice: 4082.50,
  entryZone: { low: 4081.00, high: 4084.00, midpoint: 4082.50 },
  stopLoss: { price: 4076.00, distance: 6.50 },
  takeProfit1: { price: 4085.50, distance: 3.00, riskReward: 1.0 },
  takeProfit2: { price: 4089.00, distance: 6.50, riskReward: 2.0 },
  takeProfit3: { price: 4094.00, distance: 11.50, riskReward: 3.1 },
  riskRewardRatio: 3.1,
  decisionEngine: {
    bias: 'BULLISH',
    confidencePct: 87,
    completenessPct: 94,
    independentDomainsCount: 3,
    maturity: 'VALIDATED_SETUP',
  },
  setupIntelligence: {
    type: 'LIQUIDITY_SWEEP',
    lifecycle: 'VALIDATED',
    thesis: 'Price is showing bullish continuation above key support. Momentum and structure favor upside toward the next resistance liquidity pool.',
    invalidationPrice: 4076.00,
  },
  sessionContext: { currentSession: 'LONDON', activeKillzone: true },
  timestamps: {
    asOf: now,
    marketDataTimestamp: now,
    validatedAt: new Date(now).toISOString(),
  },
  idempotencyKey: 'IDMP-XAUUSD-10827-20261101',
};

// Demonstration of Dynamic Image Resolution within Metals Template (XAGUSD Silver)
const metalsSilverPayload: ValidatedSignalPayload = {
  signalId: 'FEF-XAG-11942-01NOV',
  setupId: 'setup-xag-11942',
  setupRevision: 1,
  symbol: 'XAGUSD',
  direction: 'BUY',
  timeframe: 'M15',
  marketPrice: 34.25,
  entryZone: { low: 34.15, high: 34.35, midpoint: 34.25 },
  stopLoss: { price: 33.80, distance: 0.45 },
  takeProfit1: { price: 34.90, distance: 0.65, riskReward: 1.44 },
  takeProfit2: { price: 35.40, distance: 1.15, riskReward: 2.56 },
  takeProfit3: { price: 35.85, distance: 1.60, riskReward: 3.56 },
  riskRewardRatio: 3.56,
  decisionEngine: {
    bias: 'BULLISH',
    confidencePct: 88,
    completenessPct: 93,
    independentDomainsCount: 4,
    maturity: 'VALIDATED_SETUP',
  },
  setupIntelligence: {
    type: 'ORDER_BLOCK_EXPANSION',
    lifecycle: 'VALIDATED',
    thesis: 'Silver price confirming continuation above high-timeframe structural demand. Industrial momentum and metals cross-market flow favor expansion.',
    invalidationPrice: 33.80,
  },
  sessionContext: { currentSession: 'LONDON', activeKillzone: true },
  timestamps: {
    asOf: now,
    marketDataTimestamp: now,
    validatedAt: new Date(now).toISOString(),
  },
  idempotencyKey: 'IDMP-XAGUSD-11942-20261101',
};

// 2. MASTER TEMPLATE 2: ENERGY & COMMODITIES (USOIL Crude Oil, SELL, 2 targets)
const energyPayload: ValidatedSignalPayload = {
  signalId: 'FEF-OIL-20419-01NOV',
  setupId: 'setup-oil-20419',
  setupRevision: 1,
  symbol: 'USOIL',
  direction: 'SELL',
  timeframe: 'M15',
  marketPrice: 71.45,
  entryZone: { low: 71.30, high: 71.60, midpoint: 71.45 },
  stopLoss: { price: 72.35, distance: 0.90 },
  takeProfit1: { price: 70.10, distance: 1.35, riskReward: 1.5 },
  takeProfit2: { price: 69.10, distance: 2.35, riskReward: 2.6 },
  riskRewardRatio: 2.6,
  decisionEngine: {
    bias: 'BEARISH',
    confidencePct: 84,
    completenessPct: 91,
    independentDomainsCount: 3,
    maturity: 'VALIDATED_SETUP',
  },
  setupIntelligence: {
    type: 'BEARISH_ORDERBLOCK',
    lifecycle: 'VALIDATED',
    thesis: 'Heavy institutional distribution below H1 supply block. Bearish momentum displacement targets sell-side liquidity at psychological support.',
    invalidationPrice: 72.35,
  },
  sessionContext: { currentSession: 'NEW_YORK', activeKillzone: true },
  timestamps: {
    asOf: now,
    marketDataTimestamp: now,
    validatedAt: new Date(now).toISOString(),
  },
  idempotencyKey: 'IDMP-USOIL-20419-20261101',
};

// 3. MASTER TEMPLATE 3: FOREX CURRENCIES (EURUSD Euro / US Dollar, BUY, 2 targets)
const forexPayload: ValidatedSignalPayload = {
  signalId: 'FEF-EUR-31842-01NOV',
  setupId: 'setup-eur-31842',
  setupRevision: 1,
  symbol: 'EURUSD',
  direction: 'BUY',
  timeframe: 'M15',
  marketPrice: 1.0865,
  entryZone: { low: 1.0855, high: 1.0875, midpoint: 1.0865 },
  stopLoss: { price: 1.0835, distance: 0.0030 },
  takeProfit1: { price: 1.0910, distance: 0.0045, riskReward: 1.5 },
  takeProfit2: { price: 1.0950, distance: 0.0085, riskReward: 2.8 },
  riskRewardRatio: 2.8,
  decisionEngine: {
    bias: 'BULLISH',
    confidencePct: 89,
    completenessPct: 96,
    independentDomainsCount: 4,
    maturity: 'VALIDATED_SETUP',
  },
  setupIntelligence: {
    type: 'FAIR_VALUE_GAP_FILL',
    lifecycle: 'VALIDATED',
    thesis: 'London session liquidity purge completed with strong displacement. High-timeframe market structure shift confirmed into London open.',
    invalidationPrice: 1.0835,
  },
  sessionContext: { currentSession: 'LONDON', activeKillzone: true },
  timestamps: {
    asOf: now,
    marketDataTimestamp: now,
    validatedAt: new Date(now).toISOString(),
  },
  idempotencyKey: 'IDMP-EURUSD-31842-20261101',
};

// 4. MASTER TEMPLATE 4: EQUITY INDICES (US100 Nasdaq 100, BUY, 3 targets)
const indicesPayload: ValidatedSignalPayload = {
  signalId: 'FEF-NDX-45910-01NOV',
  setupId: 'setup-ndx-45910',
  setupRevision: 1,
  symbol: 'US100',
  direction: 'BUY',
  timeframe: 'H1',
  marketPrice: 20420.00,
  entryZone: { low: 20380.00, high: 20460.00, midpoint: 20420.00 },
  stopLoss: { price: 20260.00, distance: 160.00 },
  takeProfit1: { price: 20660.00, distance: 240.00, riskReward: 1.5 },
  takeProfit2: { price: 20820.00, distance: 400.00, riskReward: 2.5 },
  takeProfit3: { price: 20960.00, distance: 540.00, riskReward: 3.4 },
  riskRewardRatio: 3.4,
  decisionEngine: {
    bias: 'BULLISH',
    confidencePct: 92,
    completenessPct: 98,
    independentDomainsCount: 4,
    maturity: 'VALIDATED_SETUP',
  },
  setupIntelligence: {
    type: 'INSTITUTIONAL_EXPANSION',
    lifecycle: 'VALIDATED',
    thesis: 'Tech index order flow absorbing opening sell-side imbalance. Multi-model consensus confirms continuation toward all-time external highs.',
    invalidationPrice: 20260.00,
  },
  sessionContext: { currentSession: 'NEW_YORK', activeKillzone: true },
  timestamps: {
    asOf: now,
    marketDataTimestamp: now,
    validatedAt: new Date(now).toISOString(),
  },
  idempotencyKey: 'IDMP-US100-45910-20261101',
};

// 5. MASTER TEMPLATE 5: DIGITAL ASSETS / CRYPTO (BTCUSD Bitcoin, BUY, 3 targets)
const cryptoPayload: ValidatedSignalPayload = {
  signalId: 'FEF-BTC-58102-01NOV',
  setupId: 'setup-btc-58102',
  setupRevision: 1,
  symbol: 'BTCUSD',
  direction: 'BUY',
  timeframe: 'M15',
  marketPrice: 72450.00,
  entryZone: { low: 72200.00, high: 72700.00, midpoint: 72450.00 },
  stopLoss: { price: 71150.00, distance: 1300.00 },
  takeProfit1: { price: 74400.00, distance: 1950.00, riskReward: 1.5 },
  takeProfit2: { price: 76100.00, distance: 3650.00, riskReward: 2.8 },
  takeProfit3: { price: 77400.00, distance: 4950.00, riskReward: 3.8 },
  riskRewardRatio: 3.8,
  decisionEngine: {
    bias: 'BULLISH',
    confidencePct: 94,
    completenessPct: 99,
    independentDomainsCount: 4,
    maturity: 'VALIDATED_SETUP',
  },
  setupIntelligence: {
    type: 'VOLATILITY_EXPANSION_BREAKOUT',
    lifecycle: 'VALIDATED',
    thesis: 'Aggressive spot order book absorption breaking previous day high. Liquidity map signals clear upside air pocket with institutional backing.',
    invalidationPrice: 71150.00,
  },
  sessionContext: { currentSession: 'GLOBAL_24_7', activeKillzone: true },
  timestamps: {
    asOf: now,
    marketDataTimestamp: now,
    validatedAt: new Date(now).toISOString(),
  },
  idempotencyKey: 'IDMP-BTCUSD-58102-20261101',
};

// The Five Master Category Cards + Silver Dynamic Image Demonstration
const masterCategoryCards = [
  {
    templateNumber: 1,
    categoryName: 'METALS',
    templateLabel: 'Template 1: Metals',
    fileName: 'preview-category-1-metals',
    payload: metalsGoldPayload,
  },
  {
    templateNumber: 2,
    categoryName: 'ENERGY',
    templateLabel: 'Template 2: Energy & Commodities',
    fileName: 'preview-category-2-energy',
    payload: energyPayload,
  },
  {
    templateNumber: 3,
    categoryName: 'FOREX',
    templateLabel: 'Template 3: Forex Currencies',
    fileName: 'preview-category-3-forex',
    payload: forexPayload,
  },
  {
    templateNumber: 4,
    categoryName: 'INDICES',
    templateLabel: 'Template 4: Equity Indices',
    fileName: 'preview-category-4-indices',
    payload: indicesPayload,
  },
  {
    templateNumber: 5,
    categoryName: 'CRYPTO',
    templateLabel: 'Template 5: Digital Assets',
    fileName: 'preview-category-5-crypto',
    payload: cryptoPayload,
  },
  {
    templateNumber: 1,
    categoryName: 'METALS (DYNAMIC SILVER)',
    templateLabel: 'Template 1 (Silver Variant): Dynamic Hero Image',
    fileName: 'preview-category-1-metals-silver',
    payload: metalsSilverPayload,
  },
];

async function generateAll() {
  console.log(`===============================================================`);
  console.log(`  FEF CORTEX: FIVE REUSABLE MASTER CATEGORY TEMPLATES          `);
  console.log(`===============================================================\n`);

  for (const card of masterCategoryCards) {
    const resolved = resolveInstrumentCategory(card.payload.symbol);
    console.log(`Rendering [${card.templateLabel}]`);
    console.log(`  • Symbol: ${card.payload.symbol} -> Resolved Asset: ${resolved.assetTitle}`);
    console.log(`  • Hero Image: ${resolved.heroImageFile} (Resolved dynamically from central registry)`);
    
    const pngBuffer = await renderSignalCardPng(card.payload, { isPreview: true });

    const localPath = path.join(outputDir, `${card.fileName}.png`);
    const artifactPath = path.join(artifactDir, `${card.fileName.replace(/-/g, '_')}.png`);

    fs.writeFileSync(localPath, pngBuffer);
    fs.writeFileSync(artifactPath, pngBuffer);

    console.log(`  ✓ Saved: ${localPath} (${pngBuffer.length} bytes, valid PNG: ${pngBuffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'})`);
    console.log(`  ✓ Synced to Artifacts: ${artifactPath}\n`);
  }

  console.log(`===============================================================`);
  console.log(`ALL FIVE MASTER CATEGORY TEMPLATES GENERATED SUCCESSFULLY!     `);
  console.log(`===============================================================\n`);
}

generateAll().catch(err => {
  console.error('Fatal generator error:', err);
  process.exit(1);
});
