/**
 * Blueprint Geometry and Direction Validation Test Suite
 * Tests strict directional geometry, color mapping, and safety locks.
 */

import {
  validateTradeBlueprint,
  normalizeTradeDirection,
  calculateBlueprintRR
} from '../src/lib/chart-analysis/blueprint-validator';
import { processChartAnalysis } from '../src/lib/chart-analysis/engine';
import {
  buildBuyBlueprint,
  buildSellBlueprint,
  updateBlueprintLifecycle,
  CANONICAL_SL_POLICY
} from '../src/lib/trading/trade-blueprint-engine';
import { MarketStructure } from '../src/lib/market/market-structure-engine';
import { OHLCCandle } from '../src/lib/market/canonical-market-snapshot';

let failures = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}`, details || '');
    failures++;
  } else {
    console.log(`✅ PASS: ${testName}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('TEST 1: Bug Case Reproduction (Contradictory SELL Setup)');
  console.log('====================================================');

  // The exact values reported in the bug:
  // State: WATCH FOR SELL, Entry: 4337.52 - 4354.27, SL: 4317.73, TP1: 4386.24, TP2: 4413.64, TP3: 4448.66
  const bugCaseSetup = {
    state: 'WATCH FOR SELL',
    entryLow: 4337.52,
    entryHigh: 4354.27,
    stopLoss: 4317.73,
    tp1: 4386.24,
    tp2: 4413.64,
    tp3: 4448.66
  };

  const bugResult = validateTradeBlueprint(bugCaseSetup);
  assert(!bugResult.isValid, 'Contradictory SELL setup must be marked invalid');
  assert(bugResult.status === 'BLUEPRINT INCONSISTENT', 'Status must be BLUEPRINT INCONSISTENT');
  assert(bugResult.direction === 'SELL', 'Direction recognized as SELL');
  assert(bugResult.badgeClasses.includes('rose'), 'Inconsistent badge has rose/warning styling');
  assert(bugResult.rrRatio === 'INCONSISTENT', 'Inconsistent setup reports rrRatio as INCONSISTENT');
  assert(Boolean(bugResult.reason && bugResult.reason.length > 0), 'Provides clear failure reason');

  console.log('\n====================================================');
  console.log('TEST 2: Valid SELL Setup');
  console.log('====================================================');

  const validSellSetup = {
    state: 'WATCH FOR SELL',
    entryLow: 4337.52,
    entryHigh: 4354.27,
    stopLoss: 4375.00, // Above entry zone
    tp1: 4315.00,      // Below entry zone
    tp2: 4290.00,      // Below TP1
    tp3: 4260.00       // Below TP2
  };

  const validSellResult = validateTradeBlueprint(validSellSetup);
  assert(validSellResult.isValid, 'Proper SELL geometry is valid');
  assert(validSellResult.status === 'VALID', 'Status is VALID');
  assert(validSellResult.direction === 'SELL', 'Direction is SELL');
  assert(validSellResult.directionColorClass.includes('rose'), 'SELL direction color is rose');
  assert(validSellResult.badgeClasses.includes('rose'), 'SELL badge class is rose');
  assert(validSellResult.tpColorClasses.tp1.includes('rose'), 'SELL TP color is rose');
  assert(validSellResult.rrRatio !== 'INCONSISTENT' && validSellResult.rrRatio.startsWith('1 : '), 'Calculates valid R:R ratio');

  console.log('\n====================================================');
  console.log('TEST 3: Valid BUY Setup');
  console.log('====================================================');

  const validBuySetup = {
    state: 'WATCH FOR BUY',
    entryLow: 4337.52,
    entryHigh: 4354.27,
    stopLoss: 4317.73, // Below entry zone
    tp1: 4386.24,      // Above entry zone
    tp2: 4413.64,      // Above TP1
    tp3: 4448.66       // Above TP2
  };

  const validBuyResult = validateTradeBlueprint(validBuySetup);
  assert(validBuyResult.isValid, 'Proper BUY geometry is valid');
  assert(validBuyResult.status === 'VALID', 'Status is VALID');
  assert(validBuyResult.direction === 'BUY', 'Direction is BUY');
  assert(validBuyResult.directionColorClass.includes('emerald'), 'BUY direction color is emerald');
  assert(validBuyResult.badgeClasses.includes('emerald'), 'BUY badge class is emerald');
  assert(validBuyResult.tpColorClasses.tp1.includes('emerald'), 'BUY TP color is emerald');
  assert(validBuyResult.rrRatio !== 'INCONSISTENT' && validBuyResult.rrRatio.startsWith('1 : '), 'Calculates valid R:R ratio');

  console.log('\n====================================================');
  console.log('TEST 4: Inverted TP Sequence Detection');
  console.log('====================================================');

  // BUY with TP2 lower than TP1
  const invertedBuyTp = {
    state: 'BUY',
    entryLow: 100,
    entryHigh: 102,
    stopLoss: 95,
    tp1: 110,
    tp2: 108, // Inverted!
    tp3: 115
  };
  const invertedBuyResult = validateTradeBlueprint(invertedBuyTp);
  assert(!invertedBuyResult.isValid, 'BUY with inverted TP2 < TP1 is invalid');

  // SELL with TP2 higher than TP1
  const invertedSellTp = {
    state: 'SELL',
    entryLow: 100,
    entryHigh: 102,
    stopLoss: 108,
    tp1: 95,
    tp2: 97, // Inverted!
    tp3: 90
  };
  const invertedSellResult = validateTradeBlueprint(invertedSellTp);
  assert(!invertedSellResult.isValid, 'SELL with inverted TP2 > TP1 is invalid');

  console.log('\n====================================================');
  console.log('TEST 5: Engine Generator Validation');
  console.log('====================================================');

  // Test Bearish chart generation (> 500 chars)
  const mockChartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect width="100%" height="100%" fill="#040814"/><line x1="50" y1="350" x2="750" y2="350" stroke="#1e293b" stroke-width="1"/><line x1="50" y1="250" x2="750" y2="250" stroke="#1e293b" stroke-width="1"/><line x1="120" y1="280" x2="120" y2="380" stroke="#10b981" stroke-width="2"/><rect x="110" y="300" width="20" height="60" fill="#10b981"/><line x1="180" y1="240" x2="180" y2="340" stroke="#10b981" stroke-width="2"/><rect x="170" y="260" width="20" height="50" fill="#10b981"/><line x1="240" y1="270" x2="240" y2="360" stroke="#f43f5e" stroke-width="2"/><rect x="230" y="290" width="20" height="40" fill="#f43f5e"/><text x="60" y="80" fill="#00f0ff">MOCK CHART FOR BLUEPRINT VALIDATION</text></svg>`;
  const chartBase64 = `data:image/svg+xml;base64,${Buffer.from(mockChartSvg).toString('base64')}`;

  // XAUUSD currently has negative change in INITIAL_LIVE_ASSETS (-0.85%), which generates a SELL setup
  const bearishAnalysis = await processChartAnalysis({
    image: chartBase64,
    selectedAsset: 'XAUUSD',
    timeframe: 'H1',
    analysisMode: 'CHART_ONLY'
  });

  console.log('Generated XAUUSD Setup State:', bearishAnalysis.setup.state);
  console.log('Entry:', bearishAnalysis.setup.entryLow, '-', bearishAnalysis.setup.entryHigh);
  console.log('SL:', bearishAnalysis.setup.stopLoss);
  console.log('TP1:', bearishAnalysis.setup.tp1, 'TP2:', bearishAnalysis.setup.tp2, 'TP3:', bearishAnalysis.setup.tp3);

  const bearishValidation = validateTradeBlueprint(bearishAnalysis.setup);
  assert(bearishValidation.isValid, 'Engine generated bearish setup must pass validation');
  assert(bearishValidation.direction === 'SELL', 'Engine generated bearish setup is recognized as SELL');
  assert(bearishAnalysis.setup.stopLoss > bearishAnalysis.setup.entryHigh, 'Engine SL is above entry for SELL');
  assert(bearishAnalysis.setup.tp1 < bearishAnalysis.setup.entryLow, 'Engine TP1 is below entry for SELL');
  assert(bearishAnalysis.setup.tp2 < bearishAnalysis.setup.tp1, 'Engine TP2 is below TP1 for SELL');
  assert(bearishAnalysis.setup.tp3 < bearishAnalysis.setup.tp2, 'Engine TP3 is below TP2 for SELL');

  // Test Bullish chart generation with an asset that has positive change (e.g. BTCUSD: +2.15%)
  const bullishAnalysis = await processChartAnalysis({
    image: chartBase64,
    selectedAsset: 'BTCUSD',
    timeframe: 'H1',
    analysisMode: 'CHART_ONLY'
  });

  console.log('Generated BTCUSD Setup State:', bullishAnalysis.setup.state);
  console.log('Entry:', bullishAnalysis.setup.entryLow, '-', bullishAnalysis.setup.entryHigh);
  console.log('SL:', bullishAnalysis.setup.stopLoss);
  console.log('TP1:', bullishAnalysis.setup.tp1, 'TP2:', bullishAnalysis.setup.tp2, 'TP3:', bullishAnalysis.setup.tp3);

  const bullishValidation = validateTradeBlueprint(bullishAnalysis.setup);
  assert(bullishValidation.isValid, 'Engine generated bullish setup must pass validation');
  assert(bullishValidation.direction === 'BUY', 'Engine generated bullish setup is recognized as BUY');
  assert(bullishAnalysis.setup.stopLoss < bullishAnalysis.setup.entryLow, 'Engine SL is below entry for BUY');
  assert(bullishAnalysis.setup.tp1 > bullishAnalysis.setup.entryHigh, 'Engine TP1 is above entry for BUY');
  assert(bullishAnalysis.setup.tp2 > bullishAnalysis.setup.tp1, 'Engine TP2 is above TP1 for BUY');
  assert(bullishAnalysis.setup.tp3 > bullishAnalysis.setup.tp2, 'Engine TP3 is above TP2 for BUY');

  console.log('\n====================================================');
  console.log('TEST 6: P1 Trade Blueprint Engine SL Geometry Integrity & Risk Policy');
  console.log('====================================================');

  function makeTestCandles(count: number, basePrice: number, spread = 4): OHLCCandle[] {
    const c: OHLCCandle[] = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      c.push({
        timestamp: now - (count - i) * 60000,
        open: basePrice,
        high: basePrice + spread,
        low: basePrice - spread,
        close: basePrice + 1,
        tickVolume: 100,
      });
    }
    return c;
  }

  const testCandles = makeTestCandles(30, 2040, 5); // ATR is approx 10

  // 1. BUY normal structural invalidation produces SL < invalidation < entry < TP1
  const buyStructure: MarketStructure = {
    timeframe: 'H1',
    symbol: 'XAUUSD',
    analyzedAt: Date.now(),
    candleCount: 30,
    source: 'MT5_BROKER_OHLC',
    classification: 'DERIVED_FROM_VERIFIED',
    trend: 'BULLISH',
    swingHighs: [
      { price: 2070, type: 'SWING_HIGH', timeframe: 'H1', candleTimestamp: 1000, candleIndex: 10, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ],
    swingLows: [
      { price: 2010, type: 'SWING_LOW', timeframe: 'H1', candleTimestamp: 800, candleIndex: 5, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' },
      { price: 2030, type: 'SWING_LOW', timeframe: 'H1', candleTimestamp: 900, candleIndex: 8, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ],
    bos: [],
    choch: [],
    support: [],
    resistance: [],
    fvg: [
      { type: 'BULLISH_FVG', high: 2046, low: 2038, midpoint: 2042, timeframe: 'H1', candleTimestamp: 950, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED', filled: false }
    ],
    orderBlocks: [],
    lastSwingHigh: 2070,
    lastSwingLow: 2030
  };

  const buyBp = buildBuyBlueprint(buyStructure, testCandles, 'XAUUSD', 2042);
  assert(buyBp !== null, 'BUY normal setup produces a non-null blueprint');
  if (buyBp) {
    assert(buyBp.sl.price < buyBp.invalidation.price, '1. BUY: SL < structural invalidation');
    assert(buyBp.invalidation.price < buyBp.entryZoneLow.price, '1. BUY: structural invalidation < entry reference');
    assert(buyBp.entryZoneHigh.price < buyBp.tp1.price, '1. BUY: entry reference < TP1');
    assert(buyBp.invalidation.price === 2030, 'Nearest structural swing low (2030) selected over distant swing low (2010)');
  }

  // 2. SELL normal structural invalidation produces TP1 < entry < invalidation < SL
  const sellStructure: MarketStructure = {
    timeframe: 'H1',
    symbol: 'XAUUSD',
    analyzedAt: Date.now(),
    candleCount: 30,
    source: 'MT5_BROKER_OHLC',
    classification: 'DERIVED_FROM_VERIFIED',
    trend: 'BEARISH',
    swingHighs: [
      { price: 2095, type: 'SWING_HIGH', timeframe: 'H1', candleTimestamp: 800, candleIndex: 5, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' },
      { price: 2065, type: 'SWING_HIGH', timeframe: 'H1', candleTimestamp: 900, candleIndex: 8, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ],
    swingLows: [
      { price: 2020, type: 'SWING_LOW', timeframe: 'H1', candleTimestamp: 1000, candleIndex: 10, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ],
    bos: [],
    choch: [],
    support: [],
    resistance: [],
    fvg: [
      { type: 'BEARISH_FVG', high: 2056, low: 2048, midpoint: 2052, timeframe: 'H1', candleTimestamp: 950, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED', filled: false }
    ],
    orderBlocks: [],
    lastSwingHigh: 2065,
    lastSwingLow: 2020
  };

  const sellBp = buildSellBlueprint(sellStructure, testCandles, 'XAUUSD', 2052);
  assert(sellBp !== null, 'SELL normal setup produces a non-null blueprint');
  if (sellBp) {
    assert(sellBp.tp1.price < sellBp.entryZoneLow.price, '2. SELL: TP1 < entry reference');
    assert(sellBp.entryZoneHigh.price < sellBp.invalidation.price, '2. SELL: entry reference < structural invalidation');
    assert(sellBp.invalidation.price < sellBp.sl.price, '2. SELL: structural invalidation < SL');
    assert(sellBp.invalidation.price === 2065, 'Nearest structural swing high (2065) selected over distant swing high (2095)');
  }

  // 3. BUY far structural swing cannot create an absurd distant SL blueprint
  const farBuyStructure: MarketStructure = {
    ...buyStructure,
    swingLows: [
      { price: 1890, type: 'SWING_LOW', timeframe: 'H1', candleTimestamp: 500, candleIndex: 2, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ],
  };
  const farBuyBp = buildBuyBlueprint(farBuyStructure, testCandles, 'XAUUSD', 2042);
  assert(farBuyBp === null, '3. BUY: Far structural swing fails closed (returns null, no absurd distant SL)');

  // 4. SELL far structural swing cannot create an absurd distant SL blueprint
  const farSellStructure: MarketStructure = {
    ...sellStructure,
    swingHighs: [
      { price: 2150, type: 'SWING_HIGH', timeframe: 'H1', candleTimestamp: 500, candleIndex: 2, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ],
  };
  const farSellBp = buildSellBlueprint(farSellStructure, testCandles, 'XAUUSD', 2052);
  assert(farSellBp === null, '4. SELL: Far structural swing fails closed (returns null, no absurd distant SL)');

  // 5. If only structural invalidation creates unacceptable R:R, fails closed
  const badRrBuyStructure: MarketStructure = {
    ...buyStructure,
    swingHighs: [
      { price: 2047, type: 'SWING_HIGH', timeframe: 'H1', candleTimestamp: 1000, candleIndex: 10, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ],
  };
  const badRrBp = buildBuyBlueprint(badRrBuyStructure, testCandles, 'XAUUSD', 2042);
  assert(badRrBp === null, '5. Unacceptable risk/reward geometry fails closed without fabricating a fake stop');

  // 6. Missing/unusable ATR does not create a fake percentage-based verified SL
  const shortCandles = makeTestCandles(8, 2040, 5); // insufficient for 14-period ATR
  const noAtrBpBuy = buildBuyBlueprint(buyStructure, shortCandles, 'XAUUSD', 2042);
  assert(noAtrBpBuy === null, '6. Missing ATR on BUY fails closed (returns null, never fabricates synthetic 0.2% stop)');
  const noAtrBpSell = buildSellBlueprint(sellStructure, shortCandles, 'XAUUSD', 2052);
  assert(noAtrBpSell === null, '6. Missing ATR on SELL fails closed (returns null)');

  // 7. SL provenance remains truthful
  if (buyBp) {
    assert(buyBp.sl.classification === 'DERIVED_FROM_VERIFIED', '7. SL classification is DERIVED_FROM_VERIFIED');
    assert(buyBp.sl.structureType === 'SL_DERIVED', '7. SL structureType is SL_DERIVED');
    assert(buyBp.invalidation.classification === 'DERIVED_FROM_VERIFIED', '7. Invalidation classification is DERIVED_FROM_VERIFIED');
    assert(buyBp.blueprintProvenanceVerified === true, '7. blueprintProvenanceVerified is true');
  }

  // 8. Existing TP directional ordering remains valid
  const multiTargetBuyStructure: MarketStructure = {
    ...buyStructure,
    swingHighs: [
      { price: 2060, type: 'SWING_HIGH', timeframe: 'H1', candleTimestamp: 1000, candleIndex: 10, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' },
      { price: 2075, type: 'SWING_HIGH', timeframe: 'H1', candleTimestamp: 1010, candleIndex: 11, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' },
      { price: 2090, type: 'SWING_HIGH', timeframe: 'H1', candleTimestamp: 1020, candleIndex: 12, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ]
  };
  const multiBuyBp = buildBuyBlueprint(multiTargetBuyStructure, testCandles, 'XAUUSD', 2042);
  if (multiBuyBp && multiBuyBp.tp2 && multiBuyBp.tp3) {
    assert(multiBuyBp.tp1.price < multiBuyBp.tp2.price, '8. BUY TP1 < TP2');
    assert(multiBuyBp.tp2.price < multiBuyBp.tp3.price, '8. BUY TP2 < TP3');
  }

  const multiTargetSellStructure: MarketStructure = {
    ...sellStructure,
    swingLows: [
      { price: 2030, type: 'SWING_LOW', timeframe: 'H1', candleTimestamp: 1000, candleIndex: 10, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' },
      { price: 2015, type: 'SWING_LOW', timeframe: 'H1', candleTimestamp: 1010, candleIndex: 11, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' },
      { price: 2000, type: 'SWING_LOW', timeframe: 'H1', candleTimestamp: 1020, candleIndex: 12, source: 'MT5_BROKER_OHLC', classification: 'DERIVED_FROM_VERIFIED' }
    ]
  };
  const multiSellBp = buildSellBlueprint(multiTargetSellStructure, testCandles, 'XAUUSD', 2052);
  if (multiSellBp && multiSellBp.tp2 && multiSellBp.tp3) {
    assert(multiSellBp.tp1.price > multiSellBp.tp2.price, '8. SELL TP1 > TP2');
    assert(multiSellBp.tp2.price > multiSellBp.tp3.price, '8. SELL TP2 > TP3');
  }

  // 9. Existing blueprint lifecycle still freezes SL/TP after creation
  if (buyBp) {
    const updatedBp = updateBlueprintLifecycle(buyBp, 2044);
    assert(updatedBp.sl.price === buyBp.sl.price, '9. Lifecycle update freezes SL price');
    assert(updatedBp.tp1.price === buyBp.tp1.price, '9. Lifecycle update freezes TP1 price');
    assert(updatedBp.invalidation.price === buyBp.invalidation.price, '9. Lifecycle update freezes invalidation price');

    const invalidatedBp = updateBlueprintLifecycle(buyBp, buyBp.invalidation.price - 1.0);
    assert(invalidatedBp.state === 'INVALIDATED', '9. Breaking invalidation transitions state to INVALIDATED');
  }

  // 10. Existing valid blueprints continue to pass when geometry is genuinely acceptable
  assert(buyBp !== null, '10. Genuine acceptable BUY blueprint passes');
  assert(sellBp !== null, '10. Genuine acceptable SELL blueprint passes');

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${failures === 0 ? 'ALL TESTS PASSED' : `${failures} FAILURES`}`);
  console.log('====================================================');

  if (failures > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
