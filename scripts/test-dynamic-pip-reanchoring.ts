/**
 * FEF TRADING SOLUTIONS — DYNAMIC LIVE PIP RE-ANCHORING TEST SUITE
 * 
 * Verifies that relative stop loss and take profit pip distances are preserved
 * and re-anchored to fresh live execution ticks, preventing INVALID_GEOMETRY
 * order rejections when prices drift between setup calculation and dispatch.
 */

import assert from 'assert';
import {
  reanchorProtectionLevels,
  validateTradeProtection,
} from '../src/lib/execution/trade-protection-validator';

let passCount = 0;
let failCount = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (err: any) {
    failCount++;
    console.error(`  ❌ ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

console.log('================================================================');
console.log('FEF CORTEX — DYNAMIC LIVE PIP RE-ANCHORING TESTS');
console.log('================================================================');

// Test 1: BUY order where price drifted higher (static TP1 would be below fresh entry)
runTest('BUY order re-anchoring preserves geometry and pip distances when price drifted higher', () => {
  const plannedEntry = 1.12000;
  const plannedSl = 1.11800; // 20 pips
  const plannedTp1 = 1.12400; // 40 pips
  const freshAsk = 1.12500; // Market drifted up past planned TP1

  // Static check fails
  const staticCheck = validateTradeProtection({
    symbol: 'EURUSD',
    direction: 'BUY',
    entry: freshAsk,
    sl: plannedSl,
    tp1: plannedTp1,
  });
  assert.strictEqual(staticCheck.valid, false, 'Static levels should have failed geometry');
  assert.strictEqual(staticCheck.state, 'INVALID_GEOMETRY');

  // Re-anchored check succeeds
  const reanchored = reanchorProtectionLevels({
    direction: 'BUY',
    plannedEntry,
    freshEntry: freshAsk,
    sl: plannedSl,
    tp1: plannedTp1,
    digits: 5,
  });

  assert.strictEqual(reanchored.entry, 1.12500);
  assert.strictEqual(reanchored.sl, 1.12300); // exactly 20 pips below fresh entry
  assert.strictEqual(reanchored.tp1, 1.12900); // exactly 40 pips above fresh entry

  const validCheck = validateTradeProtection({
    symbol: 'EURUSD',
    direction: 'BUY',
    entry: reanchored.entry,
    sl: reanchored.sl,
    tp1: reanchored.tp1,
  });
  assert.strictEqual(validCheck.valid, true);
  assert.strictEqual(validCheck.state, 'VALID');
});

// Test 2: BUY order where price drifted lower (static SL would be above fresh entry)
runTest('BUY order re-anchoring preserves geometry when price drifted lower', () => {
  const plannedEntry = 1.12000;
  const plannedSl = 1.11800;
  const plannedTp1 = 1.12400;
  const freshAsk = 1.11700; // Market drifted down below planned SL

  const reanchored = reanchorProtectionLevels({
    direction: 'BUY',
    plannedEntry,
    freshEntry: freshAsk,
    sl: plannedSl,
    tp1: plannedTp1,
    digits: 5,
  });

  assert.strictEqual(reanchored.entry, 1.11700);
  assert.strictEqual(reanchored.sl, 1.11500);
  assert.strictEqual(reanchored.tp1, 1.12100);

  const validCheck = validateTradeProtection({
    symbol: 'EURUSD',
    direction: 'BUY',
    entry: reanchored.entry,
    sl: reanchored.sl,
    tp1: reanchored.tp1,
  });
  assert.strictEqual(validCheck.valid, true);
});

// Test 3: SELL order where price drifted lower (The exact user bug: TP1 1.11979 > Entry 1.11787)
runTest('SELL order re-anchoring resolves user reported bug (TP1 1.11979 with Entry 1.11787)', () => {
  const plannedEntry = 1.12200;
  const plannedSl = 1.12500; // 30 pips distance
  const plannedTp1 = 1.11979; // 22.1 pips distance
  const freshBid = 1.11787; // Real-time broker quote

  // Confirm static check reproduces the exact user rejection
  const staticCheck = validateTradeProtection({
    symbol: 'EURUSD',
    direction: 'SELL',
    entry: freshBid,
    sl: plannedSl,
    tp1: plannedTp1,
  });
  assert.strictEqual(staticCheck.valid, false);
  assert.strictEqual(staticCheck.state, 'INVALID_GEOMETRY');
  assert.ok(staticCheck.reasons[0].includes('SELL geometry violation: Take Profit 1 (1.11979) must be strictly below Entry (1.11787)'));

  // Re-anchor to fresh bid
  const reanchored = reanchorProtectionLevels({
    direction: 'SELL',
    plannedEntry,
    freshEntry: freshBid,
    sl: plannedSl,
    tp1: plannedTp1,
    digits: 5,
  });

  assert.strictEqual(reanchored.entry, 1.11787);
  // SL distance = 1.12500 - 1.12200 = 0.00300. Fresh SL = 1.11787 + 0.00300 = 1.12087
  assert.strictEqual(reanchored.sl, 1.12087);
  // TP distance = 1.12200 - 1.11979 = 0.00221. Fresh TP1 = 1.11787 - 0.00221 = 1.11566
  assert.strictEqual(reanchored.tp1, 1.11566);

  const validCheck = validateTradeProtection({
    symbol: 'EURUSD',
    direction: 'SELL',
    entry: reanchored.entry,
    sl: reanchored.sl,
    tp1: reanchored.tp1,
  });
  assert.strictEqual(validCheck.valid, true);
  assert.strictEqual(validCheck.state, 'VALID');
});

// Test 4: SELL order where price drifted higher (static SL would be below fresh entry)
runTest('SELL order re-anchoring preserves geometry when price drifted higher', () => {
  const plannedEntry = 1.12000;
  const plannedSl = 1.12200;
  const plannedTp1 = 1.11500;
  const freshBid = 1.12350; // Drifts higher past planned SL

  const reanchored = reanchorProtectionLevels({
    direction: 'SELL',
    plannedEntry,
    freshEntry: freshBid,
    sl: plannedSl,
    tp1: plannedTp1,
    digits: 5,
  });

  assert.strictEqual(reanchored.entry, 1.12350);
  assert.strictEqual(reanchored.sl, 1.12550);
  assert.strictEqual(reanchored.tp1, 1.11850);

  const validCheck = validateTradeProtection({
    symbol: 'EURUSD',
    direction: 'SELL',
    entry: reanchored.entry,
    sl: reanchored.sl,
    tp1: reanchored.tp1,
  });
  assert.strictEqual(validCheck.valid, true);
});

// Test 5: Multi-target TP2 and TP3 cascading preservation
runTest('Multi-target TP1, TP2, TP3 cascading order is strictly preserved', () => {
  // BUY multi-target
  const buyReanchored = reanchorProtectionLevels({
    direction: 'BUY',
    plannedEntry: 1.10000,
    freshEntry: 1.10500,
    sl: 1.09800,
    tp1: 1.10300,
    tp2: 1.10600,
    tp3: 1.11000,
    digits: 5,
  });

  assert.strictEqual(buyReanchored.entry < buyReanchored.tp1!, true);
  assert.strictEqual(buyReanchored.tp1! < buyReanchored.tp2!, true);
  assert.strictEqual(buyReanchored.tp2! < buyReanchored.tp3!, true);

  // SELL multi-target
  const sellReanchored = reanchorProtectionLevels({
    direction: 'SELL',
    plannedEntry: 1.10000,
    freshEntry: 1.09500,
    sl: 1.10200,
    tp1: 1.09700,
    tp2: 1.09400,
    tp3: 1.09000,
    digits: 5,
  });

  assert.strictEqual(sellReanchored.entry > sellReanchored.tp1!, true);
  assert.strictEqual(sellReanchored.tp1! > sellReanchored.tp2!, true);
  assert.strictEqual(sellReanchored.tp2! > sellReanchored.tp3!, true);
});

// Test 6: Precision rounding for XAUUSD, USDJPY, and BTCUSD
runTest('Handles diverse asset precisions (XAUUSD 2 digits, USDJPY 3 digits, BTCUSD 2 digits)', () => {
  // Gold (2 digits)
  const gold = reanchorProtectionLevels({
    direction: 'BUY',
    plannedEntry: 2650.00,
    freshEntry: 2662.35,
    sl: 2640.00, // 10.00 dist
    tp1: 2670.00, // 20.00 dist
    digits: 2,
  });
  assert.strictEqual(gold.sl, 2652.35);
  assert.strictEqual(gold.tp1, 2682.35);

  // Yen (3 digits)
  const yen = reanchorProtectionLevels({
    direction: 'SELL',
    plannedEntry: 152.500,
    freshEntry: 151.800,
    sl: 153.000, // 0.500 dist
    tp1: 151.500, // 1.000 dist
    digits: 3,
  });
  assert.strictEqual(yen.sl, 152.300);
  assert.strictEqual(yen.tp1, 150.800);
});

// Test 7: Fail-safe fallback when fresh entry is 0 or negative
runTest('Safe fallback when fresh entry is 0 or negative', () => {
  const fallback = reanchorProtectionLevels({
    direction: 'BUY',
    plannedEntry: 1.10000,
    freshEntry: 0,
    sl: 1.09500,
    tp1: 1.10500,
    digits: 5,
  });
  assert.strictEqual(fallback.entry, 1.10000);
  assert.strictEqual(fallback.sl, 1.09500);
  assert.strictEqual(fallback.tp1, 1.10500);
});

// Test 8: Non-cascading SELL TP2 (production issue: TP2 closer than TP1) is decoupled gracefully
runTest('SELL order: Non-cascading TP2 is gracefully dropped to prevent INVALID_GEOMETRY', () => {
  // Production scenario: SELL entry 4130, TP1 4123.913 (dist 6.087), invalid TP2 4128.413 (dist 1.587)
  const sellResult = reanchorProtectionLevels({
    direction: 'SELL',
    plannedEntry: 4130.000,
    freshEntry: 4130.000,
    sl: 4140.000,
    tp1: 4123.913,
    tp2: 4128.413, // Closer than TP1 in a SELL -> invalid cascade!
    digits: 3,
  });

  // TP2 must be dropped rather than producing an inverted target above TP1
  assert.strictEqual(sellResult.tp2, undefined, 'Invalid TP2 should be dropped');
  assert.strictEqual(sellResult.tp2Distance, undefined);
  assert.strictEqual(sellResult.tp1, 4123.913);

  // Validation passes without rejection
  const validation = validateTradeProtection({
    symbol: 'XAUUSD',
    direction: 'SELL',
    entry: sellResult.entry,
    sl: sellResult.sl,
    tp1: sellResult.tp1,
    tp2: sellResult.tp2,
  });
  assert.strictEqual(validation.valid, true, 'Order validation should succeed when invalid TP2 is decoupled');
  assert.strictEqual(validation.state, 'VALID');
});

// Test 9: Non-cascading BUY TP2 is decoupled gracefully
runTest('BUY order: Non-cascading TP2 is gracefully dropped to prevent INVALID_GEOMETRY', () => {
  const buyResult = reanchorProtectionLevels({
    direction: 'BUY',
    plannedEntry: 1.12000,
    freshEntry: 1.12100,
    sl: 1.11800, // 20 pips dist
    tp1: 1.12500, // 50 pips dist
    tp2: 1.12200, // Only 20 pips dist -> closer than TP1
    digits: 5,
  });

  assert.strictEqual(buyResult.tp2, undefined, 'Invalid BUY TP2 should be dropped');
  assert.strictEqual(buyResult.tp1, 1.12600); // 50 pips above fresh 1.12100

  const validation = validateTradeProtection({
    symbol: 'EURUSD',
    direction: 'BUY',
    entry: buyResult.entry,
    sl: buyResult.sl,
    tp1: buyResult.tp1,
    tp2: buyResult.tp2,
  });
  assert.strictEqual(validation.valid, true);
  assert.strictEqual(validation.state, 'VALID');
});

// Test 10: Non-cascading TP3 is decoupled while keeping valid TP1 and TP2
runTest('Multi-target: Non-cascading TP3 is decoupled while keeping valid TP1 and TP2', () => {
  const result = reanchorProtectionLevels({
    direction: 'BUY',
    plannedEntry: 1.10000,
    freshEntry: 1.10000,
    sl: 1.09500,
    tp1: 1.10500, // 50 pips
    tp2: 1.11000, // 100 pips (valid)
    tp3: 1.10800, // 80 pips (invalid: less than TP2)
    digits: 5,
  });

  assert.strictEqual(result.tp1, 1.10500);
  assert.strictEqual(result.tp2, 1.11000);
  assert.strictEqual(result.tp3, undefined, 'Invalid TP3 should be dropped');

  const validation = validateTradeProtection({
    symbol: 'EURUSD',
    direction: 'BUY',
    entry: result.entry,
    sl: result.sl,
    tp1: result.tp1,
    tp2: result.tp2,
    tp3: result.tp3,
  });
  assert.strictEqual(validation.valid, true);
});

console.log('================================================================');
console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('================================================================');

if (failCount > 0) {
  process.exit(1);
}

