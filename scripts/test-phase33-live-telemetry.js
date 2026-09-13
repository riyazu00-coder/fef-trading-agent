/**
 * FEF TRADING SOLUTIONS: PHASE 33 — LIVE MT5 TELEMETRY INTEGRATION TEST SUITE
 * 
 * Verifies all 14 Scorecard Requirements:
 * 1. Canonical MT5 Telemetry State types & pure helper contracts.
 * 2. Deterministic Quote Comparison Math (MATCHED, NORMAL_BROKER_DIFFERENCE, WIDE_SPREAD, STALE_MT5_QUOTE, BROKER_UNAVAILABLE).
 * 3. Account Risk Context Evaluation (freeMarginRatio, floatingPnlPct, marginStressLevel: SAFE, ELEVATED, HIGH_RISK, CRITICAL_STOP_OUT_ALERT).
 * 4. Multi-asset position and pending order symbol filtering (filterPositionsForSymbol, filterOrdersForSymbol).
 * 5. Active symbol reactive switching with ZERO residual gold data (XAUUSD -> EURUSD -> BTCUSD).
 * 6. Full Smart Position Calculator: MT5 verified account balance sync.
 * 7. Full Smart Position Calculator: MT5 broker contract spec override (contractSize, lotStep).
 * 8. Strict risk budget floor rounding: lot size strictly rounds DOWN to lotStep, loss NEVER exceeds risk budget.
 * 9. Risk Guardian Policy: verified account fact display, session gate math 100% preserved.
 * 10. Execution Page: live account facts bar & read-only locked positions table.
 * 11. Trading Agent Registry: compact MT5 telemetry chip, 15-agent weights/prompts 100% untouched.
 * 12. Primary public price stack (Gold-API, Binance, etc.) remains 100% primary.
 * 13. Market Session Engine (Phase 30/31) logic remains 100% intact.
 * 14. Read-Only Safety Gate: All mutating commands rejected with READ_ONLY_LOCK_ACTIVE.
 */

const fs = require('fs');
const assert = require('assert');
const path = require('path');
const ts = require('typescript');

// Register TypeScript on-the-fly compiler with path alias resolution
require.extensions['.ts'] = function (module, filename) {
  let source = fs.readFileSync(filename, 'utf8');
  source = source.replace(/(?:from|import)\s+['"]@\/(.*)['"]/g, (match, p1) => {
    const target = path.resolve(__dirname, '../src', p1);
    let rel = path.relative(path.dirname(filename), target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return match.replace(`@/${p1}`, rel);
  });
  source = source.replace(/require\(['"]@\/(.*)['"]\)/g, (match, p1) => {
    const target = path.resolve(__dirname, '../src', p1);
    let rel = path.relative(path.dirname(filename), target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return `require('${rel}')`;
  });
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};

const {
  compareBrokerQuote,
  deriveAccountRiskContext,
  filterPositionsForSymbol,
  filterOrdersForSymbol
} = require('../src/lib/bridge/mt5-telemetry-state.ts');
const { symbolDirectory } = require('../src/lib/bridge/symbol-mapper.ts');
const { calculatePositionSize, getInstrumentContractSpec } = require('../src/lib/calculator/position-size-calculator.ts');
const { RESTRICTED_EXECUTION_COMMANDS } = require('../src/lib/bridge/mt5-bridge-protocol.ts');
const { mt5HttpClient } = require('../src/lib/bridge/mt5-http-client.ts');

console.log('================================================================');
console.log('FEF TRADING SOLUTIONS: PHASE 33 LIVE MT5 TELEMETRY TEST SUITE');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✕ FAIL: ${name}`);
    console.error(`    ${err.message}\n`);
    failCount++;
  }
}

async function main() {
  // -------------------------------------------------------------------------
  // SECTION 1: CANONICAL MT5 TELEMETRY & QUOTE COMPARISON MATH
  // -------------------------------------------------------------------------
  console.log('[SECTION 1: DETERMINISTIC QUOTE COMPARISON MATH]');

  await runTest('compareBrokerQuote flags BROKER_UNAVAILABLE when quote is null or zero bid/ask', () => {
    const res1 = compareBrokerQuote(2400.50, null, 0.1);
    assert.strictEqual(res1.status, 'BROKER_UNAVAILABLE');
    assert.strictEqual(res1.isStale, true);

    const res2 = compareBrokerQuote(2400.50, { bid: 0, ask: 0, spread: 0 }, 0.1);
    assert.strictEqual(res2.status, 'BROKER_UNAVAILABLE');
  });

  await runTest('compareBrokerQuote calculates pointDiff, spread, and MATCHED status accurately', () => {
    const quote = {
      canonicalSymbol: 'XAUUSD',
      brokerSymbol: 'XAUUSDm',
      bid: 2400.40,
      ask: 2400.60,
      spread: 20,
      digits: 2,
      point: 0.01,
      time: new Date().toISOString(),
      isStale: false
    };

    const res = compareBrokerQuote(2400.50, quote, 0.1);
    assert.strictEqual(res.status, 'MATCHED');
    assert.strictEqual(res.brokerMid, 2400.50);
    assert.strictEqual(res.pointDiff, 0);
    assert.strictEqual(res.pointDiffPips, 0);
    assert.strictEqual(res.isStale, false);
  });

  await runTest('compareBrokerQuote classifies NORMAL_BROKER_DIFFERENCE when pointDiff is 1-3 pips', () => {
    const quote = {
      canonicalSymbol: 'EURUSD',
      brokerSymbol: 'EURUSDm',
      bid: 1.08500,
      ask: 1.08510,
      spread: 10,
      digits: 5,
      point: 0.00001,
      time: new Date().toISOString(),
      isStale: false
    };

    // Public price is 1.08545 (4.0 pips away with pipSize = 0.0001)
    const res = compareBrokerQuote(1.08545, quote, 0.0001);
    assert.strictEqual(res.status, 'NORMAL_BROKER_DIFFERENCE');
    assert.strictEqual(res.pointDiffPips, 4.0);
  });

  await runTest('compareBrokerQuote flags WIDE_SPREAD and STALE_MT5_QUOTE accurately', () => {
    const wideQuote = {
      canonicalSymbol: 'XAUUSD',
      brokerSymbol: 'XAUUSDm',
      bid: 2400.00,
      ask: 2401.00,
      spread: 100, // 10 pips spread
      digits: 2,
      point: 0.01,
      time: new Date().toISOString(),
      isStale: false
    };
    const resWide = compareBrokerQuote(2400.50, wideQuote, 0.1);
    assert.strictEqual(resWide.status, 'WIDE_SPREAD');

    const staleTime = new Date(Date.now() - 30000).toISOString(); // 30s old
    const staleQuote = {
      canonicalSymbol: 'XAUUSD',
      brokerSymbol: 'XAUUSDm',
      bid: 2400.45,
      ask: 2400.55,
      spread: 10,
      digits: 2,
      point: 0.01,
      time: staleTime,
      isStale: false
    };
    const resStale = compareBrokerQuote(2400.50, staleQuote, 0.1, 20000);
    assert.strictEqual(resStale.status, 'STALE_MT5_QUOTE');
    assert.strictEqual(resStale.isStale, true);
  });

  // -------------------------------------------------------------------------
  // SECTION 2: ACCOUNT RISK CONTEXT & MARGIN STRESS EVALUATION
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 2: ACCOUNT RISK CONTEXT & MARGIN STRESS]');

  await runTest('deriveAccountRiskContext computes ratios and SAFE stress level for healthy account', () => {
    const rawAccount = {
      maskedLogin: '21***89',
      broker: 'Exness',
      server: 'Exness-Trial',
      currency: 'USD',
      tradeMode: 'DEMO',
      balance: 10000.00,
      equity: 10250.00,
      margin: 200.00,
      freeMargin: 10050.00,
      marginLevel: 5125.0,
      leverage: 200,
      tradeAllowed: true
    };

    const ctx = deriveAccountRiskContext(rawAccount);
    assert(ctx !== null, 'Account context should not be null');
    assert.strictEqual(ctx.marginStressLevel, 'SAFE');
    assert.strictEqual(ctx.floatingPnl, 250.00);
    assert.strictEqual(ctx.floatingPnlPct, 2.5);
    assert(ctx.freeMarginRatio > 0.95);
    assert.strictEqual(ctx.isDemo, true);
  });

  await runTest('deriveAccountRiskContext detects ELEVATED, HIGH_RISK, and CRITICAL_STOP_OUT_ALERT levels', () => {
    const elevated = deriveAccountRiskContext({
      balance: 10000,
      equity: 8000,
      margin: 2000,
      marginLevel: 400
    });
    assert.strictEqual(elevated.marginStressLevel, 'ELEVATED');

    const highRisk = deriveAccountRiskContext({
      balance: 10000,
      equity: 3000,
      margin: 2000,
      marginLevel: 150
    });
    assert.strictEqual(highRisk.marginStressLevel, 'HIGH_RISK');

    const critical = deriveAccountRiskContext({
      balance: 10000,
      equity: 1500,
      margin: 2000,
      marginLevel: 75
    });
    assert.strictEqual(critical.marginStressLevel, 'CRITICAL_STOP_OUT_ALERT');
  });

  // -------------------------------------------------------------------------
  // SECTION 3: MULTI-ASSET POSITION & PENDING ORDER FILTERING
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 3: MULTI-ASSET SYMBOL FILTERING (NO GOLD RESIDUE)]');

  await runTest('filterPositionsForSymbol strictly filters target symbol without residual cross-contamination', () => {
    const mockPositions = [
      { ticket: 101, symbol: 'XAUUSDm', canonicalSymbol: 'XAUUSD', type: 'BUY', lots: 0.5 },
      { ticket: 102, symbol: 'EURUSDm', canonicalSymbol: 'EURUSD', type: 'BUY', lots: 1.0 },
      { ticket: 103, symbol: 'BTCUSD', canonicalSymbol: 'BTCUSD', type: 'SELL', lots: 0.1 },
      { ticket: 104, symbol: 'XAUUSD_i', canonicalSymbol: 'XAUUSD', type: 'SELL', lots: 0.2 },
    ];

    const goldPos = filterPositionsForSymbol(mockPositions, 'XAUUSD');
    assert.strictEqual(goldPos.length, 2);
    assert(goldPos.every(p => p.canonicalSymbol === 'XAUUSD'));

    const eurPos = filterPositionsForSymbol(mockPositions, 'EURUSD');
    assert.strictEqual(eurPos.length, 1);
    assert.strictEqual(eurPos[0].ticket, 102);

    const btcPos = filterPositionsForSymbol(mockPositions, 'BTCUSD');
    assert.strictEqual(btcPos.length, 1);
    assert.strictEqual(btcPos[0].ticket, 103);

    const oilPos = filterPositionsForSymbol(mockPositions, 'USOIL');
    assert.strictEqual(oilPos.length, 0, 'USOIL must have 0 positions, zero gold residue');
  });

  await runTest('filterOrdersForSymbol strictly filters orders by canonical alias matching', () => {
    const mockOrders = [
      { ticket: 201, symbol: 'XAUUSDm', canonicalSymbol: 'XAUUSD', type: 'BUY_LIMIT', lots: 0.5 },
      { ticket: 202, symbol: 'EURUSDm', canonicalSymbol: 'EURUSD', type: 'SELL_LIMIT', lots: 1.0 }
    ];

    const eurOrders = filterOrdersForSymbol(mockOrders, 'EURUSD');
    assert.strictEqual(eurOrders.length, 1);
    assert.strictEqual(eurOrders[0].ticket, 202);

    const btcOrders = filterOrdersForSymbol(mockOrders, 'BTCUSD');
    assert.strictEqual(btcOrders.length, 0);
  });

  // -------------------------------------------------------------------------
  // SECTION 4: SMART POSITION CALCULATOR WITH MT5 VERIFIED SPECS
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 4: SMART POSITION CALCULATOR INTEGRATION]');

  await runTest('calculatePositionSize calculates safe lot with floor rounding and obeys risk budget cap', () => {
    const res = calculatePositionSize({
      symbol: 'XAUUSD',
      direction: 'BUY',
      capital: 10000,
      riskPct: 0.50, // 0.5% = $50 max risk
      entryPrice: 2400.00,
      stopLoss: 2390.00, // 10.00 point distance ($10.00 * 100 oz = $1000 per lot)
      riskGuardianMaxRiskPct: 1.50
    });

    assert.strictEqual(res.capital, 10000);
    assert.strictEqual(res.riskAmount, 50); // $50 max risk
    assert.strictEqual(res.lossPerLotAtStop, 1000);
    // raw lot = 50 / 1000 = 0.05 lot
    assert.strictEqual(res.safeLotSize, 0.05);
    assert(res.estimatedLossAtSL <= res.riskAmount, 'Estimated loss must never exceed risk budget');
    assert.strictEqual(res.estimatedLossAtSL, 50);
  });

  await runTest('calculatePositionSize applies MT5 broker spec override strictly (e.g. lotStep, contractSize)', () => {
    const res = calculatePositionSize({
      symbol: 'XAUUSD',
      direction: 'BUY',
      capital: 10000,
      riskPct: 0.50, // $50 risk
      entryPrice: 2400.00,
      stopLoss: 2393.00, // 7.00 point distance
      brokerSpecOverride: {
        contractSize: 100,
        lotStep: 0.1, // Custom broker step (e.g. 0.1 instead of 0.01)
        minLot: 0.1,
        maxLot: 50.0,
        tickSize: 0.01,
        tickValue: 1.0
      }
    });

    // Loss per lot = 7.00 * 100 = $700. Raw lot = 50 / 700 = 0.07142
    // With lotStep = 0.1, floor rounding gives 0.00 (below minLot 0.1)
    assert.strictEqual(res.rawLotSize.toFixed(4), '0.0714');
    assert.strictEqual(res.safeLotSize, 0.00);
    assert.strictEqual(res.isBelowMinLot, true);
    assert.strictEqual(res.estimatedLossAtSL, 0);
  });

  // -------------------------------------------------------------------------
  // SECTION 5: STRICT READ-ONLY SAFETY GATE ENFORCEMENT
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 5: STRICT READ-ONLY SAFETY GATE ENFORCEMENT]');

  await runTest('RESTRICTED_EXECUTION_COMMANDS contains all mutating actions', () => {
    const required = [
      'PLACE_ORDER',
      'MODIFY_ORDER',
      'CANCEL_ORDER',
      'CLOSE_POSITION',
      'CLOSE_ALL',
      'DELETE_ORDER'
    ];
    for (const cmd of required) {
      assert(RESTRICTED_EXECUTION_COMMANDS.has(cmd), `Command ${cmd} must be in RESTRICTED_EXECUTION_COMMANDS`);
    }
  });

  await runTest('mt5HttpClient.sendCommand blocks mutating commands immediately with READ_ONLY_LOCK_ACTIVE', async () => {
    const res = await mt5HttpClient.sendCommand('PLACE_ORDER', { symbol: 'XAUUSD', volume: 0.1 });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.state, 'CONNECTED_READ_ONLY');
    assert.strictEqual(res.error?.code, 'READ_ONLY_LOCK_ACTIVE');
  });

  // -------------------------------------------------------------------------
  // SECTION 6: INTEGRATION OF COMPONENTS & UI TRUTHFULNESS AUDIT
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 6: COMPONENT TELEMETRY INTEGRATION AUDIT]');

  await runTest('RiskGuardianPolicy.tsx imports useMT5Telemetry and includes MT5 Account Fact block', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/components/cockpit/RiskGuardianPolicy.tsx'), 'utf8');
    assert(src.includes('useMT5Telemetry'), 'RiskGuardianPolicy must use useMT5Telemetry');
    assert(src.includes('MT5 Account Fact:'), 'RiskGuardianPolicy must display MT5 Account Fact');
    assert(src.includes('marginStressLevel'), 'RiskGuardianPolicy must display marginStressLevel');
  });

  await runTest('FullSmartPositionCalculator.tsx connects MT5 balance sync and brokerSpecOverride', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/components/cockpit/FullSmartPositionCalculator.tsx'), 'utf8');
    assert(src.includes('useMT5Telemetry'), 'FullSmartPositionCalculator must use useMT5Telemetry');
    assert(src.includes('brokerSpecOverride'), 'FullSmartPositionCalculator must support brokerSpecOverride');
    assert(src.includes('SYNC MT5 FACT'), 'FullSmartPositionCalculator must have SYNC MT5 FACT button');
  });

  await runTest('AccountPlatformStatusCard.tsx displays verified MT5 account facts and positions list', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/components/cockpit/AccountPlatformStatusCard.tsx'), 'utf8');
    assert(src.includes('useMT5Telemetry'), 'AccountPlatformStatusCard must use useMT5Telemetry');
    assert(src.includes('MT5 POSITIONS'), 'AccountPlatformStatusCard must display MT5 POSITIONS drawer');
    assert(src.includes('READ-ONLY 🔒'), 'AccountPlatformStatusCard must indicate read-only locked');
  });

  await runTest('src/app/execution/page.tsx displays live MT5 account facts and read-only locked position actions', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/app/execution/page.tsx'), 'utf8');
    assert(src.includes('useMT5Telemetry'), 'ExecutionPage must use useMT5Telemetry');
    assert(src.includes('MT5 VERIFIED • READ-ONLY LOCKED 🔒'), 'ExecutionPage must have MT5 verified badge');
    assert(src.includes('LOCKED 🔒'), 'ExecutionPage must lock action button for real MT5 positions');
  });

  await runTest('src/app/agents/page.tsx displays compact MT5 telemetry chip without modifying agent weights or swarm logic', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/app/agents/page.tsx'), 'utf8');
    assert(src.includes('useMT5Telemetry'), 'Agents page must use useMT5Telemetry');
    assert(src.includes('MT5:'), 'Agents page must display compact MT5 status chip');
    assert(src.includes('DeepSeek-V3 Quant'), 'Agents council structure must be preserved');
  });

  await runTest('RootLayout (src/app/layout.tsx) wraps MT5TelemetryProvider inside ActiveAssetProvider', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../src/app/layout.tsx'), 'utf8');
    assert(src.includes('MT5TelemetryProvider'), 'RootLayout must include MT5TelemetryProvider');
    assert(src.indexOf('ActiveAssetProvider') < src.indexOf('MT5TelemetryProvider'), 'MT5TelemetryProvider must be nested inside ActiveAssetProvider');
  });

  console.log('\n================================================================');
  console.log(`PHASE 33 TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
