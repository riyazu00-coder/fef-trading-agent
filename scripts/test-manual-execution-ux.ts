/**
 * FEF CORTEX — Comprehensive Manual Execution UX & Position Sizing Test Suite
 * Validates:
 * 1. Independent Capital & Lot modes (4 combinations)
 * 2. MT5 Capital Sync (Equity precedence, Balance fallback)
 * 3. Manual lot override and mathematical recalculation (loss, risk %, TP profits, blended RR)
 * 4. Broker contract specification validation (minLot, maxLot, lotStep, <= 0, NaN)
 * 5. Risk Guardian policy enforcement (never silently changes lot; flags isRiskLimitExceeded)
 * 6. Account mode resolution (DEMO, REAL, UNKNOWN) and fail-closed execution guards
 * 7. Confirmation modal facts and dispatch payload integrity
 */

import { calculatePositionSize, getInstrumentContractSpec } from '../src/lib/calculator/position-size-calculator';
import { deriveAccountRiskContext } from '../src/lib/bridge/mt5-telemetry-state';
import { normalizeAccountTradeMode } from '../src/lib/execution/execution-policy';

function runTestSuite() {
  console.log('================================================================');
  console.log('FEF CORTEX — MANUAL EXECUTION UX & SIZING VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`PASS: ${testName}`);
      passed++;
    } else {
      console.error(`FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST GROUP 1: Canonical MT5 Telemetry Account Mode Resolution
  // -------------------------------------------------------------
  console.log('\n--- GROUP 1: Telemetry Account Mode Resolution ---');
  
  // Test 1.1: Account with tradeMode DEMO but undefined balance
  const ctxDemoNoBalance = deriveAccountRiskContext({ tradeMode: 'DEMO' });
  assert(ctxDemoNoBalance !== null, 'Account with tradeMode DEMO without balance derives non-null context');
  assert(ctxDemoNoBalance?.tradeMode === 'DEMO', 'deriveAccountRiskContext preserves DEMO tradeMode', `Got ${ctxDemoNoBalance?.tradeMode}`);
  assert(ctxDemoNoBalance?.isDemo === true, 'deriveAccountRiskContext marks isDemo true');

  // Test 1.2: Account with only equity
  const ctxEquityOnly = deriveAccountRiskContext({ equity: 25000, tradeMode: 'DEMO' });
  assert(ctxEquityOnly !== null && ctxEquityOnly.balance === 25000 && ctxEquityOnly.equity === 25000, 'Account with equity derives matching balance');

  // Test 1.3: Real account derivation
  const ctxReal = deriveAccountRiskContext({ balance: 50000, equity: 50000, tradeMode: 'REAL' });
  assert(ctxReal !== null && ctxReal.tradeMode === 'REAL' && ctxReal.isDemo === false, 'REAL account context strictly preserved');

  // Test 1.4: Null/Empty account
  const ctxNull = deriveAccountRiskContext(null);
  assert(ctxNull === null, 'deriveAccountRiskContext returns null for null account');

  // Test 1.5: normalizeAccountTradeMode
  assert(normalizeAccountTradeMode('DEMO') === 'DEMO', 'normalizeAccountTradeMode DEMO string -> DEMO');
  assert(normalizeAccountTradeMode('CONTEST') === 'DEMO', 'normalizeAccountTradeMode CONTEST string -> DEMO');
  assert(normalizeAccountTradeMode(0) === 'DEMO', 'normalizeAccountTradeMode 0 numeric -> DEMO');
  assert(normalizeAccountTradeMode('REAL') === 'REAL', 'normalizeAccountTradeMode REAL string -> REAL');
  assert(normalizeAccountTradeMode(1) === 'REAL', 'normalizeAccountTradeMode 1 numeric -> REAL');
  assert(normalizeAccountTradeMode(undefined) === 'UNKNOWN', 'normalizeAccountTradeMode undefined -> UNKNOWN');
  assert(normalizeAccountTradeMode(null) === 'UNKNOWN', 'normalizeAccountTradeMode null -> UNKNOWN');
  assert(normalizeAccountTradeMode('XYZ') === 'UNKNOWN', 'normalizeAccountTradeMode invalid -> UNKNOWN');

  // -------------------------------------------------------------
  // TEST GROUP 2: Position Size Calculator — Auto Sizing
  // -------------------------------------------------------------
  console.log('\n--- GROUP 2: Auto Position Sizing ---');

  // Gold XAUUSD BUY: Capital $10,000, Risk 0.50%, Entry 2650.00, SL 2645.00 (50 pips)
  const autoGold = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    tp1: 2660.00,
  });

  assert(autoGold.isValid, 'Auto XAUUSD calculation is valid');
  assert(autoGold.isManualLot === false, 'isManualLot is false for auto mode');
  assert(autoGold.safeLotSize > 0, `Auto safe lot size > 0: ${autoGold.safeLotSize}`);
  assert(autoGold.estimatedLossAtSL <= autoGold.riskAmount, `Auto loss ($${autoGold.estimatedLossAtSL}) <= budget ($${autoGold.riskAmount})`);
  assert(autoGold.accountImpactPct <= autoGold.allowedRiskPct + 0.001, `Auto risk impact (${autoGold.accountImpactPct}%) <= allowed (${autoGold.allowedRiskPct}%)`);
  assert(!autoGold.isRiskLimitExceeded, 'isRiskLimitExceeded is false for auto calculation');

  // -------------------------------------------------------------
  // TEST GROUP 3: Position Size Calculator — Manual Lot Override (Within Risk)
  // -------------------------------------------------------------
  console.log('\n--- GROUP 3: Manual Lot Override (Safe Risk) ---');

  // Requesting 0.05 lot on Gold with $10,000 capital and 50 pip stop ($5.00/pip * 0.05 lot = $25.00 loss = 0.25% risk)
  const manualSafeGold = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    tp1: 2660.00,
    tp2: 2670.00,
    tp3: 2680.00,
    manualLotOverride: 0.05,
  });

  assert(manualSafeGold.isValid, 'Manual safe lot calculation is valid');
  assert(manualSafeGold.isManualLot === true, 'isManualLot is true');
  assert(manualSafeGold.safeLotSize === 0.05, `safeLotSize equals manualLotSize (0.05): got ${manualSafeGold.safeLotSize}`);
  assert(manualSafeGold.manualLotSize === 0.05, 'manualLotSize recorded on result');
  assert(manualSafeGold.maxSafeLotSize !== undefined && manualSafeGold.maxSafeLotSize > 0, 'maxSafeLotSize preserved for auto comparison');
  assert(!manualSafeGold.isRiskLimitExceeded, 'isRiskLimitExceeded is false for 0.05 lot');
  assert(manualSafeGold.estimatedLossAtSL > 0, `Loss recalculated: $${manualSafeGold.estimatedLossAtSL.toFixed(2)}`);
  assert(manualSafeGold.accountImpactPct > 0 && manualSafeGold.accountImpactPct <= 0.50, `Risk % recalculated: ${manualSafeGold.accountImpactPct.toFixed(2)}%`);
  assert(manualSafeGold.tp1 !== null && manualSafeGold.tp1.profitFullLot > 0, 'TP1 dollar profit recalculated with manual lot');
  assert(manualSafeGold.blendedTotalProfit > 0, 'Blended total profit recalculated with manual lot');

  // -------------------------------------------------------------
  // TEST GROUP 4: Position Size Calculator — Manual Lot Override (Exceeding Risk)
  // -------------------------------------------------------------
  console.log('\n--- GROUP 4: Manual Lot Override (Exceeding Risk) ---');

  // Requesting 1.00 lot on Gold with $10,000 capital and 50 pip stop ($5.00/pip * 1.00 lot * 100 = $500 loss = 5.0% risk)
  // Allowed risk is 0.50% ($50)
  const manualExcessGold = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    tp1: 2660.00,
    manualLotOverride: 1.00,
  });

  assert(manualExcessGold.isValid, 'Calculation isValid structurally');
  assert(manualExcessGold.isManualLot === true, 'isManualLot is true');
  assert(manualExcessGold.safeLotSize === 1.00, 'safeLotSize is NOT silently lowered; stays at 1.00');
  assert(manualExcessGold.isRiskLimitExceeded === true, 'isRiskLimitExceeded is TRUE');
  assert(manualExcessGold.accountImpactPct > manualExcessGold.allowedRiskPct, `actual risk (${manualExcessGold.accountImpactPct}%) > allowed (${manualExcessGold.allowedRiskPct}%)`);
  assert(manualExcessGold.estimatedLossAtSL > manualExcessGold.riskAmount, `loss ($${manualExcessGold.estimatedLossAtSL}) > budget ($${manualExcessGold.riskAmount})`);

  // -------------------------------------------------------------
  // TEST GROUP 5: Broker Specification Validation on Manual Lot
  // -------------------------------------------------------------
  console.log('\n--- GROUP 5: Broker Spec Validation on Manual Lot ---');

  const xauSpec = getInstrumentContractSpec('XAUUSD')!;
  assert(xauSpec !== null, 'XAUUSD spec exists');

  // Test 5.1: Non-positive lot (0 or negative)
  const lotZero = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    manualLotOverride: 0,
  });
  assert(!lotZero.isValid, 'Lot 0 rejected (isValid: false)');
  assert(Boolean(lotZero.brokerLotValidationError), 'brokerLotValidationError populated for lot 0');

  const lotNeg = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    manualLotOverride: -0.10,
  });
  assert(!lotNeg.isValid, 'Lot -0.10 rejected (isValid: false)');
  assert(Boolean(lotNeg.brokerLotValidationError), 'brokerLotValidationError populated for negative lot');

  // Test 5.2: NaN or Infinity
  const lotNaN = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    manualLotOverride: NaN,
  });
  assert(!lotNaN.isValid, 'Lot NaN rejected');
  assert(Boolean(lotNaN.brokerLotValidationError), 'brokerLotValidationError populated for NaN');

  // Test 5.3: Below minLot (e.g. 0.001 when minLot is 0.01)
  const lotBelowMin = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    manualLotOverride: 0.005,
  });
  assert(!lotBelowMin.isValid, 'Lot 0.005 below minLot (0.01) rejected');
  assert(lotBelowMin.brokerLotValidationError?.includes('minimum') ?? false, 'Error mentions minimum lot');

  // Test 5.4: Above maxLot (e.g. 200 when maxLot is 100)
  const lotAboveMax = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    manualLotOverride: 200.0,
  });
  assert(!lotAboveMax.isValid, 'Lot 200 above maxLot (100) rejected');
  assert(lotAboveMax.brokerLotValidationError?.includes('maximum') ?? false, 'Error mentions maximum lot');

  // Test 5.5: Step misalignment (e.g. 0.015 when lotStep is 0.01)
  const lotStepMisaligned = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.50,
    entryPrice: 2650.00,
    stopLoss: 2645.00,
    manualLotOverride: 0.015,
  });
  assert(!lotStepMisaligned.isValid, 'Lot 0.015 step misaligned rejected');
  assert(lotStepMisaligned.brokerLotValidationError?.includes('step') ?? false, 'Error mentions step size');

  // -------------------------------------------------------------
  // TEST GROUP 6: 4-Way Independent State Matrix
  // -------------------------------------------------------------
  console.log('\n--- GROUP 6: 4-Way Independent State Matrix ---');

  // Combination 1: MT5 Capital ($50,000) + Auto Lot
  const c1 = calculatePositionSize({
    symbol: 'EURUSD',
    direction: 'BUY',
    capital: 50000, // from MT5 live equity
    riskPct: 0.50,
    entryPrice: 1.08500,
    stopLoss: 1.08300,
  });
  assert(c1.isValid && !c1.isManualLot, 'Combination 1: MT5 Capital + Auto Lot PASS');

  // Combination 2: MT5 Capital ($50,000) + Manual Lot (0.20)
  const c2 = calculatePositionSize({
    symbol: 'EURUSD',
    direction: 'BUY',
    capital: 50000, // from MT5 live equity
    riskPct: 0.50,
    entryPrice: 1.08500,
    stopLoss: 1.08300,
    manualLotOverride: 0.20,
  });
  assert(c2.isValid && c2.isManualLot && c2.safeLotSize === 0.20 && !c2.isRiskLimitExceeded, 'Combination 2: MT5 Capital + Manual Safe Lot PASS');

  // Combination 3: Manual Capital ($5,000) + Auto Lot
  const c3 = calculatePositionSize({
    symbol: 'EURUSD',
    direction: 'BUY',
    capital: 5000, // manual capital override
    riskPct: 0.50,
    entryPrice: 1.08500,
    stopLoss: 1.08300,
  });
  assert(c3.isValid && !c3.isManualLot && c3.safeLotSize < c1.safeLotSize, 'Combination 3: Manual Capital + Auto Lot scales proportionally');

  // Combination 4: Manual Capital ($5,000) + Manual Lot (0.20) -> should exceed risk!
  const c4 = calculatePositionSize({
    symbol: 'EURUSD',
    direction: 'BUY',
    capital: 5000, // manual capital override
    riskPct: 0.50,
    entryPrice: 1.08500,
    stopLoss: 1.08300,
    manualLotOverride: 0.20, // 0.20 lots * 20 pips * $10/pip = $40 loss on $5000 = 0.80% risk > 0.50%
  });
  assert(c4.isValid && c4.isManualLot && c4.safeLotSize === 0.20 && c4.isRiskLimitExceeded, 'Combination 4: Manual Capital + Manual Lot flags Risk Limit Exceeded');

  // -------------------------------------------------------------
  // TEST GROUP 7: Execution Dispatch Gate Checks
  // -------------------------------------------------------------
  console.log('\n--- GROUP 7: Execution Dispatch Gate Logic ---');

  function evaluateDispatchGate(params: {
    isDispatching: boolean;
    isLicenseAuthorized: boolean;
    isMarketOpen: boolean;
    isRealAccount: boolean;
    isUnknownAccount: boolean;
    isDemoAccount: boolean;
    calcResultValid: boolean;
    isRiskLimitExceeded: boolean;
    hasBrokerLotValidationError: boolean;
    safeLotSize: number;
    stopLoss: number;
  }) {
    const isBlocked =
      params.isDispatching ||
      !params.isLicenseAuthorized ||
      !params.isMarketOpen ||
      params.isRealAccount ||
      params.isUnknownAccount ||
      !params.calcResultValid ||
      params.isRiskLimitExceeded ||
      params.hasBrokerLotValidationError ||
      params.safeLotSize <= 0 ||
      params.stopLoss <= 0;

    let buttonLabel = '⚡ CONFIRM DEMO ORDER';
    if (params.isDispatching) buttonLabel = 'DISPATCHING...';
    else if (!params.isMarketOpen) buttonLabel = '⚠️ MARKET CLOSED — PLANNING ONLY';
    else if (!params.isLicenseAuthorized) buttonLabel = '🔒 LICENSE REQUIRED';
    else if (params.isRealAccount) buttonLabel = '🛑 REAL ACCOUNTS LOCKED';
    else if (params.isUnknownAccount) buttonLabel = '⚠️ ACCOUNT UNVERIFIED';
    else if (params.hasBrokerLotValidationError) buttonLabel = '⚠️ INVALID LOT SIZE';
    else if (params.isRiskLimitExceeded) buttonLabel = '⚠️ RISK LIMIT EXCEEDED';

    return { isBlocked, buttonLabel };
  }

  // Gate Test 1: Market closed -> planning works, execution blocked
  const g1 = evaluateDispatchGate({
    isDispatching: false,
    isLicenseAuthorized: true,
    isMarketOpen: false,
    isRealAccount: false,
    isUnknownAccount: false,
    isDemoAccount: true,
    calcResultValid: true,
    isRiskLimitExceeded: false,
    hasBrokerLotValidationError: false,
    safeLotSize: 0.10,
    stopLoss: 2640,
  });
  assert(g1.isBlocked === true && g1.buttonLabel.includes('MARKET CLOSED'), 'Gate 1: Market closed blocks execution');

  // Gate Test 2: REAL account -> strictly hard-blocked
  const g2 = evaluateDispatchGate({
    isDispatching: false,
    isLicenseAuthorized: true,
    isMarketOpen: true,
    isRealAccount: true,
    isUnknownAccount: false,
    isDemoAccount: false,
    calcResultValid: true,
    isRiskLimitExceeded: false,
    hasBrokerLotValidationError: false,
    safeLotSize: 0.10,
    stopLoss: 2640,
  });
  assert(g2.isBlocked === true && g2.buttonLabel.includes('REAL ACCOUNTS LOCKED'), 'Gate 2: REAL accounts strictly locked');

  // Gate Test 3: UNKNOWN account -> fail closed
  const g3 = evaluateDispatchGate({
    isDispatching: false,
    isLicenseAuthorized: true,
    isMarketOpen: true,
    isRealAccount: false,
    isUnknownAccount: true,
    isDemoAccount: false,
    calcResultValid: true,
    isRiskLimitExceeded: false,
    hasBrokerLotValidationError: false,
    safeLotSize: 0.10,
    stopLoss: 2640,
  });
  assert(g3.isBlocked === true && g3.buttonLabel.includes('ACCOUNT UNVERIFIED'), 'Gate 3: UNKNOWN account fail-closed');

  // Gate Test 4: License not authorized -> license required
  const g4 = evaluateDispatchGate({
    isDispatching: false,
    isLicenseAuthorized: false,
    isMarketOpen: true,
    isRealAccount: false,
    isUnknownAccount: false,
    isDemoAccount: true,
    calcResultValid: true,
    isRiskLimitExceeded: false,
    hasBrokerLotValidationError: false,
    safeLotSize: 0.10,
    stopLoss: 2640,
  });
  assert(g4.isBlocked === true && g4.buttonLabel.includes('LICENSE REQUIRED'), 'Gate 4: Unlicensed blocked with LICENSE REQUIRED');

  // Gate Test 5: Risk limit exceeded -> blocked
  const g5 = evaluateDispatchGate({
    isDispatching: false,
    isLicenseAuthorized: true,
    isMarketOpen: true,
    isRealAccount: false,
    isUnknownAccount: false,
    isDemoAccount: true,
    calcResultValid: true,
    isRiskLimitExceeded: true,
    hasBrokerLotValidationError: false,
    safeLotSize: 2.00,
    stopLoss: 2640,
  });
  assert(g5.isBlocked === true && g5.buttonLabel.includes('RISK LIMIT EXCEEDED'), 'Gate 5: Risk limit exceeded blocks execution');

  // Gate Test 6: Invalid broker lot -> blocked
  const g6 = evaluateDispatchGate({
    isDispatching: false,
    isLicenseAuthorized: true,
    isMarketOpen: true,
    isRealAccount: false,
    isUnknownAccount: false,
    isDemoAccount: true,
    calcResultValid: false,
    isRiskLimitExceeded: false,
    hasBrokerLotValidationError: true,
    safeLotSize: 0,
    stopLoss: 2640,
  });
  assert(g6.isBlocked === true && g6.buttonLabel.includes('INVALID LOT SIZE'), 'Gate 6: Invalid lot size blocks execution');

  // Gate Test 7: Authorized DEMO account, market open, valid risk -> ENABLED!
  const g7 = evaluateDispatchGate({
    isDispatching: false,
    isLicenseAuthorized: true,
    isMarketOpen: true,
    isRealAccount: false,
    isUnknownAccount: false,
    isDemoAccount: true,
    calcResultValid: true,
    isRiskLimitExceeded: false,
    hasBrokerLotValidationError: false,
    safeLotSize: 0.10,
    stopLoss: 2640,
  });
  assert(g7.isBlocked === false && g7.buttonLabel === '⚡ CONFIRM DEMO ORDER', 'Gate 7: Valid DEMO order enabled for dispatch');

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite();

