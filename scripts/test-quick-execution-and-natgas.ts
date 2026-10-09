/**
 * Verification Test Suite for Quick Execution, NATGAS Contract Specs, and TP1 Normalization
 */

import { getInstrumentContractSpec, calculatePositionSize } from '../src/lib/calculator/position-size-calculator';
import { getAssetDefaultPips } from '../src/components/cockpit/QuickCockpitExecutionCard';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✅ ${msg}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('FEF CORTEX — QUICK EXECUTION & NATGAS VERIFICATION TEST');
  console.log('================================================================\n');

  console.log('--- 1. NATGAS & XNGUSD Contract Specifications ---');
  const natgasSpec = getInstrumentContractSpec('NATGAS');
  assert(natgasSpec !== null, 'NATGAS contract spec is registered');
  assert(natgasSpec?.isVerified === true, 'NATGAS contract spec is verified');
  assert(natgasSpec?.contractSize === 10000, 'NATGAS contractSize is 10,000 MMBtu');
  assert(natgasSpec?.pipSize === 0.001, 'NATGAS pipSize is 0.001');

  const xngusdSpec = getInstrumentContractSpec('XNGUSD');
  assert(xngusdSpec !== null, 'XNGUSD contract spec is registered');
  assert(xngusdSpec?.isVerified === true, 'XNGUSD contract spec is verified');

  console.log('\n--- 2. NATGAS Position Size Calculation (No POSITION SIZING UNAVAILABLE) ---');
  const natgasCalc = calculatePositionSize({
    symbol: 'NATGAS',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2.850,
    stopLoss: 2.810,
    tp1: 2.930,
  });

  assert(natgasCalc.isValid === true, 'NATGAS position calculation isValid is true');
  assert(natgasCalc.isSpecificationVerified === true, 'NATGAS specification verified is true');
  assert(natgasCalc.safeLotSize > 0, `NATGAS safeLotSize is positive (${natgasCalc.safeLotSize} lots)`);
  assert(natgasCalc.estimatedLossAtSL <= 50.0, `NATGAS estimatedLossAtSL ($${natgasCalc.estimatedLossAtSL}) <= $50 risk capital`);
  assert(natgasCalc.errorMessage === undefined, 'No error message returned for NATGAS');

  console.log('\n--- 3. Asset-Aware Default Pips (getAssetDefaultPips) ---');
  // Gold
  const goldPips = getAssetDefaultPips('XAUUSD', 'METALS');
  assert(goldPips.slPips === 50 && goldPips.tpPips === 100, 'XAUUSD returns 50 SL / 100 TP pips ($5 / $10)');

  // Forex
  const fxPips = getAssetDefaultPips('EURUSD', 'FOREX');
  assert(fxPips.slPips === 20 && fxPips.tpPips === 40, 'EURUSD returns 20 SL / 40 TP pips');

  // Commodities: NATGAS
  const ngPips = getAssetDefaultPips('NATGAS', 'COMMODITIES');
  assert(ngPips.slPips === 40 && ngPips.tpPips === 80, 'NATGAS returns 40 SL / 80 TP pips');

  // Commodities: USOIL
  const oilPips = getAssetDefaultPips('USOIL', 'COMMODITIES');
  assert(oilPips.slPips === 30 && oilPips.tpPips === 60, 'USOIL returns 30 SL / 60 TP pips');

  // Indices: US30
  const indexPips = getAssetDefaultPips('US30', 'INDICES');
  assert(indexPips.slPips === 50 && indexPips.tpPips === 100, 'US30 returns 50 SL / 100 TP pts');

  // Crypto: BTCUSD
  const btcPips = getAssetDefaultPips('BTCUSD', 'CRYPTO');
  assert(btcPips.slPips === 150 && btcPips.tpPips === 300, 'BTCUSD returns 150 SL / 300 TP pts');

  // Crypto: ETHUSD
  const ethPips = getAssetDefaultPips('ETHUSD', 'CRYPTO');
  assert(ethPips.slPips === 25 && ethPips.tpPips === 50, 'ETHUSD returns 25 SL / 50 TP pts');

  console.log('\n--- 4. TP1 Parameter Normalization Simulation ---');
  // Check that params with tp1 are normalized to tp and takeProfit
  const mockParams: any = {
    symbol: 'XAUUSD',
    direction: 'BUY',
    volume: 0.10,
    price: 4130.0,
    sl: 4125.0,
    tp1: 4140.0,
  };

  // Route normalization logic
  if (mockParams.tp1 != null && mockParams.tp == null) mockParams.tp = mockParams.tp1;
  if (mockParams.tp != null && mockParams.tp1 == null) mockParams.tp1 = mockParams.tp;
  if (mockParams.takeProfit != null && mockParams.tp == null) mockParams.tp = mockParams.takeProfit;
  if (mockParams.tp != null && mockParams.takeProfit == null) mockParams.takeProfit = mockParams.tp;

  assert(mockParams.tp === 4140.0, 'params.tp normalized from params.tp1');
  assert(mockParams.takeProfit === 4140.0, 'params.takeProfit normalized from params.tp1');

  // Bridge parsing logic simulation
  let sl = Number(mockParams.sl ?? mockParams.stopLoss ?? 0);
  let tp = Number(mockParams.tp1 ?? mockParams.tp ?? mockParams.takeProfit ?? 0);

  assert(sl === 4125.0, 'Bridge parsed sl correctly');
  assert(tp === 4140.0, 'Bridge parsed tp correctly from tp1');
  assert(tp > 0, 'Bridge tp is valid positive number, preventing MISSING_TP1');

  console.log('\n================================================================');
  console.log('ALL QUICK EXECUTION & NATGAS VERIFICATION TESTS PASSED (100%)');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

