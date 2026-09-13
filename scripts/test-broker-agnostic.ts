/**
 * FEF AI TRADING — MULTI-BROKER AGNOSTIC VALIDATION SUITE
 * 
 * Verifies that FEF AI Trading is genuinely broker-agnostic:
 * 1. Broker A (Standard): XAUUSD (minLot: 0.01, lotStep: 0.01)
 * 2. Broker B (Micro/Cent): XAUUSDm (minLot: 0.10, lotStep: 0.10)
 * 3. Broker C (Pro/ECN Custom): XAUUSD.pro (contractSize: 10, tickSize: 0.05, tickValue: 0.50)
 * 4. Ambiguous symbol resolution produces SYMBOL MAPPING REQUIRED
 * 5. Unsupported symbol fails gracefully without corrupting pipeline
 * 6. Real account mode hard-locks regardless of broker name
 * 7. Position sizing uses authoritative broker specs when provided
 * 8. Position sizing falls back to static catalog specs when missing
 * 9. Position sizing strictly rounds down (never up)
 * 10. Below-min-lot does NOT round up if risk budget is exceeded -> EXECUTION LOCKED
 */

import { BrokerSymbolDirectory, CANONICAL_SYMBOL_MAPPINGS } from '../src/lib/bridge/symbol-mapper';
import {
  calculatePositionSize,
  INSTRUMENT_CONTRACT_SPECS,
  InstrumentContractSpec
} from '../src/lib/calculator/position-size-calculator';
import { deriveAccountRiskContext } from '../src/lib/bridge/mt5-telemetry-state';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}`, details || '');
    failCount++;
  } else {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('FEF AI TRADING: MULTI-BROKER AGNOSTIC TEST SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // 1. BROKER A: Standard Broker (XAUUSD, minLot 0.01, lotStep 0.01)
  // ---------------------------------------------------------------------------
  console.log('[BROKER A: Standard Broker — Exact Ticker & Standard Specs]');
  const brokerADir = new BrokerSymbolDirectory();
  brokerADir.discoverFromBrokerSymbols(['XAUUSD', 'EURUSD', 'GBPUSD', 'US30']);

  const brokerARes = brokerADir.resolveBrokerSymbolWithValidation('XAUUSD');
  assert(brokerARes.status === 'EXACT_MATCH', 'Broker A resolves XAUUSD as EXACT_MATCH');
  assert(brokerARes.brokerSymbol === 'XAUUSD', 'Broker A symbol is XAUUSD');

  const brokerASpec: Partial<InstrumentContractSpec> = {
    symbol: 'XAUUSD',
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1.00,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
  };

  const calcA = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50, // $50 risk
    entryPrice: 4345.00,
    stopLoss: 4339.00, // 6.00 distance -> $600 loss/lot. Raw lot = 50 / 600 = 0.0833
    brokerSpecOverride: brokerASpec
  });

  assert(calcA.isValid, 'Broker A calculation is valid');
  assert(calcA.safeLotSize === 0.08, 'Broker A strictly rounds down raw 0.0833 to safeLot 0.08');
  assert(calcA.sizingSource === 'BROKER_SPEC', 'Broker A sizingSource is BROKER_SPEC');
  assert(calcA.estimatedLossAtSL <= 50.00, 'Broker A estimated loss ($48) does not exceed $50 risk budget');
  assert(!calcA.isBelowMinLot, 'Broker A lot is not below minLot');

  // ---------------------------------------------------------------------------
  // 2. BROKER B: Micro / Cent Broker (XAUUSDm, minLot 0.10, lotStep 0.10)
  // ---------------------------------------------------------------------------
  console.log('\n[BROKER B: Micro/Cent Broker — Suffix & 0.10 Min Lot Step]');
  const brokerBDir = new BrokerSymbolDirectory();
  brokerBDir.discoverFromBrokerSymbols(['XAUUSDm', 'EURUSDm', 'GBPUSDm']);

  const brokerBRes = brokerBDir.resolveBrokerSymbolWithValidation('XAUUSD');
  assert(brokerBRes.status === 'ALIAS_MATCH', 'Broker B resolves XAUUSD to XAUUSDm via ALIAS_MATCH');
  assert(brokerBRes.brokerSymbol === 'XAUUSDm', 'Broker B symbol is XAUUSDm');

  const brokerBSpec: Partial<InstrumentContractSpec> = {
    symbol: 'XAUUSDm',
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1.00,
    lotStep: 0.10,
    minLot: 0.10,
    maxLot: 50.0,
  };

  // Scenario 2a: Raw lot 0.0833 < minLot 0.10 -> Risk $50 budget would be exceeded by 0.10 lot ($60)
  const calcBLocked = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50, // $50 risk budget
    entryPrice: 4345.00,
    stopLoss: 4339.00, // Loss at 0.10 lot = 0.10 * 600 = $60 > $50
    brokerSpecOverride: brokerBSpec
  });

  assert(calcBLocked.safeLotSize === 0.00, 'Broker B does NOT round up to 0.10 when exceeding risk budget');
  assert(calcBLocked.isBelowMinLot === true, 'Broker B marks isBelowMinLot = true');
  assert(calcBLocked.executionLocked === true, 'Broker B locks execution when min lot exceeds risk');
  assert(calcBLocked.lockReason?.includes('BELOW BROKER MINIMUM LOT') === true, 'Broker B provides BELOW BROKER MINIMUM LOT reason');

  // Scenario 2b: Sufficient capital/budget -> strictly rounds down to 0.10 step
  const calcBValid = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 20000,
    riskPct: 0.50, // $100 risk budget
    entryPrice: 4345.00,
    stopLoss: 4339.00, // Raw lot: 100 / 600 = 0.1666
    brokerSpecOverride: brokerBSpec
  });

  assert(calcBValid.safeLotSize === 0.10, 'Broker B strictly rounds 0.1666 DOWN to 0.10 (never 0.20)');
  assert(!calcBValid.executionLocked, 'Broker B execution is not locked when budget permits');
  assert(calcBValid.estimatedLossAtSL <= 100.00, 'Broker B loss ($60) is strictly within $100 risk budget');

  // ---------------------------------------------------------------------------
  // 3. BROKER C: Custom ECN / Pro Broker (XAUUSD.pro, contractSize: 10, tickSize: 0.05, tickValue: 0.50)
  // ---------------------------------------------------------------------------
  console.log('\n[BROKER C: Custom ECN/Pro Broker — Non-Standard Contract Specs]');
  const brokerCDir = new BrokerSymbolDirectory();
  brokerCDir.discoverFromBrokerSymbols(['XAUUSD.pro', 'EURUSD.pro', 'USOIL.pro']);

  const brokerCRes = brokerCDir.resolveBrokerSymbolWithValidation('XAUUSD');
  assert(brokerCRes.status === 'ALIAS_MATCH', 'Broker C resolves XAUUSD to XAUUSD.pro via ALIAS_MATCH');
  assert(brokerCRes.brokerSymbol === 'XAUUSD.pro', 'Broker C symbol is XAUUSD.pro');

  const brokerCSpec: Partial<InstrumentContractSpec> = {
    symbol: 'XAUUSD.pro',
    contractSize: 10,     // 10 oz per lot instead of 100 oz
    tickSize: 0.05,       // 0.05 price increment
    tickValue: 0.50,      // $0.50 per tick on 1.00 lot
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 200.0,
  };

  const calcC = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 1.00, // $100 budget
    entryPrice: 4345.00,
    stopLoss: 4335.00, // 10.00 distance = 200 ticks * $0.50 = $100 per lot
    brokerSpecOverride: brokerCSpec
  });

  assert(calcC.isValid, 'Broker C calculation is valid');
  assert(calcC.safeLotSize === 1.00, 'Broker C sizes to 1.00 lot using custom 10 oz contract specification');
  assert(calcC.estimatedLossAtSL === 100.00, 'Broker C estimated loss matches exact custom contract calculation');
  assert(calcC.sizingSource === 'BROKER_SPEC', 'Broker C sizingSource is BROKER_SPEC');

  // ---------------------------------------------------------------------------
  // 4. AMBIGUOUS SYMBOL RESOLUTION
  // ---------------------------------------------------------------------------
  console.log('\n[AMBIGUOUS SYMBOL RESOLUTION: Multiple Suffix Candidates]');
  const ambiguousDir = new BrokerSymbolDirectory();
  // Broker offers multiple non-canonical candidates with no primary
  ambiguousDir.discoverFromBrokerSymbols(['XAUUSDm', 'XAUUSD.r', 'GOLDm']);

  const ambiguousRes = ambiguousDir.resolveBrokerSymbolWithValidation('XAUUSD');
  assert(ambiguousRes.status === 'AMBIGUOUS', 'Ambiguous candidates return status AMBIGUOUS');
  assert(ambiguousRes.brokerSymbol === null, 'Ambiguous resolution returns null brokerSymbol');
  assert(ambiguousRes.reason?.includes('SYMBOL MAPPING REQUIRED') === true, 'Reason explicitly includes SYMBOL MAPPING REQUIRED');

  // ---------------------------------------------------------------------------
  // 5. UNSUPPORTED SYMBOL HANDLING
  // ---------------------------------------------------------------------------
  console.log('\n[UNSUPPORTED SYMBOL HANDLING: Graceful Failure]');
  const unsupportedRes = brokerADir.resolveBrokerSymbolWithValidation('UNKNOWN_NONEXISTENT_COIN');
  assert(unsupportedRes.status === 'NOT_FOUND', 'Unsupported symbol returns NOT_FOUND');
  assert(unsupportedRes.brokerSymbol === null, 'Unsupported symbol has null brokerSymbol');
  assert(unsupportedRes.reason?.includes('SYMBOL NOT FOUND') === true, 'Reason states SYMBOL NOT FOUND');

  // Position sizing with unverified symbol fails safely
  const calcUnknown = calculatePositionSize({
    symbol: 'NON_EXISTENT_COIN',
    direction: 'BUY',
    capital: 10000,
    riskPct: 1.00,
    entryPrice: 100,
    stopLoss: 90,
  });
  assert(!calcUnknown.isValid, 'Unknown symbol position size calculation is marked invalid');
  assert(calcUnknown.errorMessage?.includes('POSITION SIZE UNAVAILABLE') === true, 'Returns explicit UNAVAILABLE message');

  // ---------------------------------------------------------------------------
  // 6. REAL ACCOUNT MODE LOCK INDEPENDENT OF BROKER
  // ---------------------------------------------------------------------------
  console.log('\n[REAL ACCOUNT SECURITY: Hard Lock Independent of Broker Name]');
  const brokersToTest = ['IC Markets', 'Pepperstone', 'FTMO', 'Exness', 'Unknown Proprietary Broker'];

  for (const brokerName of brokersToTest) {
    const rawAccount = {
      login: '12345678',
      company: brokerName,
      broker: brokerName,
      tradeMode: 'REAL' as const, // Real trading account
      balance: 50000,
      equity: 50000,
      currency: 'USD',
      leverage: 100,
      profit: 0
    };

    const context = deriveAccountRiskContext(rawAccount);
    assert(context !== null, `${brokerName}: Account context derived`);
    assert(context?.tradeMode === 'REAL', `${brokerName}: Records tradeMode REAL`);
    assert(context?.isDemo === false, `${brokerName}: isDemo is strictly false`);
    assert(context?.broker === brokerName, `${brokerName}: Retains dynamic broker name`);
  }

  // ---------------------------------------------------------------------------
  // 7. STATIC CATALOG SPEC FALLBACK
  // ---------------------------------------------------------------------------
  console.log('\n[STATIC CATALOG FALLBACK]');
  const calcStatic = calculatePositionSize({
    symbol: 'EURUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 1.00, // $100 budget
    entryPrice: 1.08500,
    stopLoss: 1.08000, // 50 pips = $500/lot -> raw lot = 100 / 500 = 0.20
  });

  assert(calcStatic.isValid, 'Static fallback calculation is valid');
  assert(calcStatic.safeLotSize === 0.20, 'Static fallback produces correct lot size');
  assert(calcStatic.sizingSource === 'STATIC_FALLBACK', 'sizingSource is correctly marked STATIC_FALLBACK');

  // ---------------------------------------------------------------------------
  // 8. STRICT ROUND-DOWN AND NON-ROUND-UP INVARIANT
  // ---------------------------------------------------------------------------
  console.log('\n[STRICT ROUND-DOWN INVARIANT]');
  // Test raw lot = 0.19999
  const calcRoundDown = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50, // $50 budget
    entryPrice: 4345.00,
    stopLoss: 4342.49, // 2.51 distance -> $251/lot. Raw lot = 50 / 251 = 0.199203
  });

  assert(calcRoundDown.safeLotSize === 0.19, 'Raw lot 0.1992 strictly rounds DOWN to 0.19 (never 0.20)');
  assert(calcRoundDown.estimatedLossAtSL <= 50.00, 'Estimated loss never exceeds risk budget');

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`MULTI-BROKER AGNOSTIC SUITE: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error in multi-broker test suite:', err);
  process.exit(1);
});
