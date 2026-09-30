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
  evaluateBlueprintMarketCompatibility,
  MAXIMUM_BLUEPRINT_LIFETIME_MS,
  CANONICAL_SL_POLICY,
  TradeBlueprint
} from '../src/lib/trading/trade-blueprint-engine';
import {
  isBlueprintCompatibleWithContext,
  isMarketStructureCompatibleWithContext,
  clearBlueprintCacheForTesting,
  getActiveBlueprintCacheForTesting,
  generateAssetIntelligence
} from '../src/lib/agents/multi-asset-pipeline';
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
  console.log('TEST 7: P1 Blueprint Cache & Market-Aware Lifecycle Integrity Suite');
  console.log('====================================================');

  // 1. Same symbol + timeframe + source + unchanged structure
  const compat1 = evaluateBlueprintMarketCompatibility(buyBp, 2042, buyStructure, testCandles);
  assert(compat1.isCompatible === true, '1. Same context & structure remains compatible');

  // 2. Symbol mismatch
  const diffSymbolStruct = { ...buyStructure, symbol: 'EURUSD' };
  const compat2 = evaluateBlueprintMarketCompatibility(buyBp, 2042, diffSymbolStruct, testCandles);
  assert(compat2.isCompatible === false, '2. Symbol mismatch is rejected');
  assert(isBlueprintCompatibleWithContext(buyBp, 'EURUSD', 'H1', 'MT5_BROKER_OHLC') === false, '2b. Context validator rejects symbol mismatch');

  // 3. Timeframe mismatch
  const diffTfStruct = { ...buyStructure, timeframe: 'H4' };
  const compat3 = evaluateBlueprintMarketCompatibility(buyBp, 2042, diffTfStruct, testCandles);
  assert(compat3.isCompatible === false, '3. Timeframe mismatch is rejected');
  assert(isBlueprintCompatibleWithContext(buyBp, 'XAUUSD', 'H4', 'MT5_BROKER_OHLC') === false, '3b. Context validator rejects timeframe mismatch');

  // 4. Source provenance mismatch
  const diffSourceStruct = { ...buyStructure, source: 'INDEPENDENT_VERIFIED_OHLC' as const };
  const compat4 = evaluateBlueprintMarketCompatibility(buyBp, 2042, diffSourceStruct, testCandles);
  assert(compat4.isCompatible === false, '4. Source mismatch is rejected');
  assert(isBlueprintCompatibleWithContext(buyBp, 'XAUUSD', 'H1', 'INDEPENDENT_VERIFIED_OHLC') === false, '4b. Context validator rejects source mismatch');

  // 5. BUY structural invalidation break
  const priceBelowInv = buyBp.invalidation.price - 1.0;
  const compat5 = evaluateBlueprintMarketCompatibility(buyBp, priceBelowInv, buyStructure, testCandles);
  assert(compat5.isCompatible === false && compat5.shouldInvalidate === true, '5. BUY invalidation breach detected immediately');
  const updatedInvBuy = updateBlueprintLifecycle(buyBp, priceBelowInv, testCandles, buyStructure);
  assert(updatedInvBuy.state === 'INVALIDATED', '5b. updateBlueprintLifecycle transitions BUY to INVALIDATED immediately');

  // 6. SELL structural invalidation break
  const priceAboveInv = sellBp.invalidation.price + 1.0;
  const compat6 = evaluateBlueprintMarketCompatibility(sellBp, priceAboveInv, sellStructure, testCandles);
  assert(compat6.isCompatible === false && compat6.shouldInvalidate === true, '6. SELL invalidation breach detected immediately');
  const updatedInvSell = updateBlueprintLifecycle(sellBp, priceAboveInv, testCandles, sellStructure);
  assert(updatedInvSell.state === 'INVALIDATED', '6b. updateBlueprintLifecycle transitions SELL to INVALIDATED immediately');

  // 7. New verified candles + materially incompatible structure (trend reversal)
  const bearReversalStruct: MarketStructure = { ...buyStructure, trend: 'BEARISH' };
  const compat7 = evaluateBlueprintMarketCompatibility(buyBp, 2042, bearReversalStruct, testCandles);
  assert(compat7.isCompatible === false && compat7.shouldInvalidate === true, '7. Trend reversal against BUY is incompatible');

  const bullReversalStruct: MarketStructure = { ...sellStructure, trend: 'BULLISH' };
  const compat7b = evaluateBlueprintMarketCompatibility(sellBp, 2052, bullReversalStruct, testCandles);
  assert(compat7b.isCompatible === false && compat7b.shouldInvalidate === true, '7b. Trend reversal against SELL is incompatible');

  // 8. New verified candles + compatible structure
  const compat8 = evaluateBlueprintMarketCompatibility(buyBp, 2044, buyStructure, testCandles);
  assert(compat8.isCompatible === true, '8. New tick with compatible structure remains valid');
  const updatedValid = updateBlueprintLifecycle(buyBp, 2044, testCandles, buyStructure);
  assert(updatedValid.state === 'TRIGGER_READY', '8b. Price in entry zone transitions to TRIGGER_READY');
  assert(updatedValid.sl.price === buyBp.sl.price, '8c. SL remains strictly frozen');
  assert(updatedValid.tp1.price === buyBp.tp1.price, '8d. TP1 remains strictly frozen');
  assert(updatedValid.invalidation.price === buyBp.invalidation.price, '8e. Invalidation price remains strictly frozen');

  // 9. Missing/insufficient structure required for revalidation
  const emptyStruct = { ...buyStructure, trend: 'INSUFFICIENT_DATA' as const, candleCount: 0 };
  const compat9 = evaluateBlueprintMarketCompatibility(buyBp, 2042, emptyStruct, testCandles);
  assert(compat9.isCompatible === false, '9. Insufficient structure fails closed');
  const nullCompat = evaluateBlueprintMarketCompatibility(buyBp, 2042, null, testCandles);
  assert(nullCompat.isCompatible === false, '9b. Null structure fails closed');

  // 10. Safety ceiling expiry
  const expiredBp: TradeBlueprint = { ...buyBp, expiry: Date.now() - 1000 };
  const compat10 = evaluateBlueprintMarketCompatibility(expiredBp, 2042, buyStructure, testCandles);
  assert(compat10.isCompatible === false, '10. Exceeded safety ceiling expires blueprint');
  const updatedExpired = updateBlueprintLifecycle(expiredBp, 2042, testCandles, buyStructure);
  assert(updatedExpired.state === 'EXPIRED', '10b. updateBlueprintLifecycle transitions to EXPIRED');

  // 11. Frozen geometry: lifecycle evaluation never moves levels
  const testTicks = [2042, 2044, 2040, 2045, 2039];
  let currentFrozen = buyBp;
  for (const t of testTicks) {
    currentFrozen = updateBlueprintLifecycle(currentFrozen, t, testCandles, buyStructure);
    assert(
      currentFrozen.sl.price === buyBp.sl.price &&
      currentFrozen.tp1.price === buyBp.tp1.price &&
      currentFrozen.invalidation.price === buyBp.invalidation.price,
      `11. Frozen geometry holds at price ${t}`
    );
  }

  // 12. Cross-asset regression: XAUUSD in cache cannot contaminate EURUSD
  clearBlueprintCacheForTesting();
  const baseTime = Date.now() - 20 * 3600000;
  const bullCandles: OHLCCandle[] = [
    { o: 2000, h: 2005, l: 1998, c: 2004 },
    { o: 2004, h: 2010, l: 2002, c: 2008 },
    { o: 2008, h: 2015, l: 2006, c: 2012 },
    { o: 2012, h: 2014, l: 2007, c: 2010 },
    { o: 2010, h: 2022, l: 2009, c: 2020 },
    { o: 2020, h: 2021, l: 2014, c: 2016 },
    { o: 2016, h: 2028, l: 2015, c: 2026 },
    { o: 2026, h: 2035, l: 2024, c: 2032 },
    { o: 2032, h: 2033, l: 2025, c: 2027 },
    { o: 2027, h: 2034, l: 2026, c: 2033 },
    { o: 2033, h: 2055, l: 2032, c: 2052 },
    { o: 2052, h: 2062, l: 2045, c: 2060 },
    { o: 2060, h: 2072, l: 2058, c: 2070 },
    { o: 2070, h: 2071, l: 2042, c: 2044 },
    { o: 2044, h: 2048, l: 2041, c: 2043 },
  ].map((s, idx) => ({
    timestamp: baseTime + idx * 3600000,
    open: s.o, high: s.h, low: s.l, close: s.c, tickVolume: 1000 + idx * 50
  }));

  const liveXAU = {
    symbol: 'XAUUSD', name: 'Gold Spot', price: 2043, bid: 2042.8, ask: 2043.2, spread: 0.4,
    change24h: 1.0, high24h: 2072, low24h: 1998, volume: '$1B', sparkline: '0,10 100,10',
    source: 'MT5 Broker Telemetry', lastUpdated: new Date().toISOString(), category: 'METALS'
  };
  const profXAU = generateAssetIntelligence('XAUUSD', liveXAU as any, 'H1', bullCandles, 'LIVE_MT5');
  assert(profXAU.blueprint !== null, '12. XAUUSD generates valid blueprint');

  const cache = getActiveBlueprintCacheForTesting();
  assert(cache.has('XAUUSD:H1'), '12b. XAUUSD:H1 exists in cache');
  assert(!cache.has('EURUSD:H1'), '12c. EURUSD:H1 does not exist in cache');

  const liveEUR = {
    symbol: 'EURUSD', name: 'Euro / USD', price: 1.0850, bid: 1.0849, ask: 1.0851, spread: 0.0002,
    change24h: 0.1, high24h: 1.0900, low24h: 1.0800, volume: '$1B', sparkline: '0,10 100,10',
    source: 'MT5 Broker Telemetry', lastUpdated: new Date().toISOString(), category: 'FOREX'
  };
  const profEUR = generateAssetIntelligence('EURUSD', liveEUR as any, 'H1', [], 'LIVE_MT5');
  assert(profEUR.blueprint === null, '12d. EURUSD without candles has null blueprint (no cross-asset contamination)');
  assert(profEUR.setupDirection === 'WAIT', '12e. EURUSD posture is WAIT');

  // 13. Cross-timeframe regression: H1 cannot contaminate H4
  const profXAU_H4 = generateAssetIntelligence('XAUUSD', liveXAU as any, 'H4', [], 'LIVE_MT5');
  assert(profXAU_H4.blueprint === null, '13. XAUUSD:H4 without candles has null blueprint (no cross-timeframe contamination)');

  // 14. Cache replacement: when a new valid blueprint is created, old one replaced
  const newerBullCandles = [
    ...bullCandles,
    { timestamp: baseTime + 15 * 3600000, open: 2043, high: 2046, low: 2042, close: 2045, tickVolume: 1200 },
    { timestamp: baseTime + 16 * 3600000, open: 2045, high: 2075, low: 2044, close: 2070, tickVolume: 1500 },
    { timestamp: baseTime + 17 * 3600000, open: 2070, high: 2085, low: 2065, close: 2080, tickVolume: 1400 },
    { timestamp: baseTime + 18 * 3600000, open: 2080, high: 2082, low: 2060, close: 2062, tickVolume: 1100 },
  ];
  const profNewXAU = generateAssetIntelligence('XAUUSD', { ...liveXAU, price: 2062 } as any, 'H1', newerBullCandles, 'LIVE_MT5');
  assert(profNewXAU.blueprint !== null, '14. New setup generated');
  const cacheAfter = getActiveBlueprintCacheForTesting();
  const cachedAfterBp = cacheAfter.get('XAUUSD:H1');
  assert(cachedAfterBp !== undefined && cachedAfterBp.setupId === profNewXAU.blueprint?.setupId,
    '14b. Cache was deterministically replaced with the new blueprint');

  // 15. READ_ONLY/execution safety behavior remains unchanged
  assert(MAXIMUM_BLUEPRINT_LIFETIME_MS === 4 * 60 * 60 * 1000, '15. Maximum safety ceiling constant preserved');
  assert(CANONICAL_SL_POLICY.maxRiskAtrMultiplier === 4.5, '15b. P1 SL policy preserved (4.5x ATR max risk)');
  assert(CANONICAL_SL_POLICY.atrBufferMultiplier === 0.5, '15c. P1 SL policy preserved (0.5x ATR buffer)');
  assert(CANONICAL_SL_POLICY.minRewardRiskRatio === 0.40, '15d. P1 SL policy preserved (0.40 min R:R)');

  // 16. Missing/unknown candle provenance cannot create a blueprint falsely labeled as verified (Req A)
  const noSourceStruct = { ...buyStructure, source: undefined as any };
  const noSourceBp = buildBuyBlueprint(noSourceStruct, testCandles, 'XAUUSD', 2042);
  assert(noSourceBp === null, '16a. Missing structure source fails closed (returns null, never fabricates verified source)');

  const unknownSourceBp = buildBuyBlueprint(buyStructure, testCandles, 'XAUUSD', 2042, 'FABRICATED_SOURCE' as any);
  assert(unknownSourceBp === null, '16b. Fabricated/unknown candleSource fails closed (returns null)');

  const mismatchSourceBp = buildBuyBlueprint(buyStructure, testCandles, 'XAUUSD', 2042, 'INDEPENDENT_REFERENCE_OHLC');
  assert(mismatchSourceBp === null, '16c. Provenance conflict between caller and structure fails closed (returns null)');

  const refStruct: MarketStructure = { ...buyStructure, source: 'INDEPENDENT_REFERENCE_OHLC' };
  const refBp = buildBuyBlueprint(refStruct, testCandles, 'XAUUSD', 2042, 'INDEPENDENT_REFERENCE_OHLC');
  assert(refBp !== null, '16d. Reference source blueprint created successfully');
  if (refBp) {
    assert(refBp.blueprintProvenanceVerified === false, '16e. Reference source is truthful and NOT labeled as verified');
  }

  // 17. Originating/predating candle does NOT retrospectively invalidate blueprint (Req B)
  // buyBp has baselineMarketTs = max(testCandles.timestamp).
  // A candle timestamped earlier than or equal to baseline evidence does not retrospectively invalidate it,
  // even if its low dipped below invalidation level.
  const baselineTs = buyBp ? (buyBp.latestAnalyzedCandleTimestamp || 0) : 0;
  assert(baselineTs > 0, '17a. buyBp has valid positive latestAnalyzedCandleTimestamp');
  if (buyBp) {
    const historicalDipCandle: OHLCCandle = {
      timestamp: baselineTs - 60000, // strictly predates baseline evidence
      open: 2035, high: 2036, low: buyBp.invalidation.price - 2.0, close: 2034, tickVolume: 100
    };
    const compatHistorical = evaluateBlueprintMarketCompatibility(buyBp, 2042, buyStructure, [historicalDipCandle]);
    assert(compatHistorical.isCompatible === true, '17b. Candle predating blueprint baseline evidence does NOT retrospectively invalidate it');
  }

  // 18. Genuinely subsequent candle that breaches invalidation DOES invalidate it (Req C)
  if (buyBp) {
    const subsequentBreachCandle: OHLCCandle = {
      timestamp: baselineTs + 60000, // strictly subsequent to baseline evidence
      open: 2042, high: 2043, low: buyBp.invalidation.price - 0.5, close: 2040, tickVolume: 100
    };
    const compatSubsequent = evaluateBlueprintMarketCompatibility(buyBp, 2042, buyStructure, [subsequentBreachCandle]);
    assert(compatSubsequent.isCompatible === false && compatSubsequent.shouldInvalidate === true,
      '18. Genuinely subsequent candle that breaches invalidation DOES invalidate it');
  }

  // 19. H1/H4/D1 blueprint validity is not rejected by an arbitrary universal 15-minute freshness rule (Req D)
  if (buyBp) {
    const fortyFiveMinAgo = Date.now() - 45 * 60 * 1000;
    const h1Blueprint: TradeBlueprint = {
      ...buyBp,
      createdAt: fortyFiveMinAgo,
      updatedAt: fortyFiveMinAgo,
      expiry: fortyFiveMinAgo + MAXIMUM_BLUEPRINT_LIFETIME_MS, // Well within 4h ceiling
      state: 'WATCH'
    };
    const compatH1 = evaluateBlueprintMarketCompatibility(h1Blueprint, 2042, buyStructure, testCandles);
    assert(compatH1.isCompatible === true, '19a. H1 setup 45 minutes old is NOT rejected by 15-minute rule');

    const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
    const h4Blueprint: TradeBlueprint = {
      ...buyBp,
      createdAt: twoHoursAgo,
      updatedAt: twoHoursAgo,
      expiry: twoHoursAgo + MAXIMUM_BLUEPRINT_LIFETIME_MS,
      state: 'WATCH'
    };
    const compatH4 = evaluateBlueprintMarketCompatibility(h4Blueprint, 2042, buyStructure, testCandles);
    assert(compatH4.isCompatible === true, '19b. H4 setup 2 hours old is NOT rejected by 15-minute rule');
  }

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
