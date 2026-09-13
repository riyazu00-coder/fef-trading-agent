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
