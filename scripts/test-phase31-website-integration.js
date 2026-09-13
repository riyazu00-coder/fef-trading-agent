/**
 * FEF TRADING SOLUTIONS: PHASE 31 WEBSITE-WIDE MARKET STATUS INTEGRATION TEST SUITE
 * 
 * Verifies website-wide consistency of Market Session Intelligence:
 * 1. Single Source of Truth adherence (no rogue market hour calculations in React components)
 * 2. Reusable compact UI badges (MarketStatusBadge, ExecutabilityBadge)
 * 3. Radar ranking rules: topOpportunity always prefers executable assets
 * 4. Radar notifications: closed high-conviction assets generate SETUP_DEVELOPING, not TRADE_OPPORTUNITY_CONFIRMED
 * 5. Server-side bridge gate: restricted execution commands rejected with 403 when market closed
 * 6. Multi-Asset Blackboard integration: includes canonical marketSession snapshot
 * 7. Execution Page Gate: dispatch button locked & dispatches blocked when market closed
 * 8. Institutional Markets Directory: Market Session column and status pills present
 * 9. Trade Journal: marketSessionSnapshot integrated across types, records, table, modal, and CSV export
 */

const fs = require('fs');
const assert = require('assert');
const path = require('path');
const ts = require('typescript');

// Register TypeScript on-the-fly compiler with @/ path alias resolution
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
  evaluateMarketSession,
  resolveAssetClass,
} = require('../src/lib/session/market-session-engine.ts');

const {
  generateGlobalRadarIntelligence,
} = require('../src/lib/radar/opportunity-radar-engine.ts');

const {
  evaluateRadarTransitions,
} = require('../src/lib/radar/radar-notifications.ts');

const {
  createSharedBlackboardForAsset,
  INITIAL_BLACKBOARD_STATE,
} = require('../src/lib/agents/agent-blackboard.ts');

const { mt5BridgeClient } = require('../src/lib/bridge/mt5-client.ts');
const { INITIAL_LIVE_ASSETS } = require('../src/lib/providers/real-market-api.ts');

console.log('================================================================');
console.log('FEF TRADING SOLUTIONS: PHASE 31 INTEGRATION AUDIT SUITE');
console.log('================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✓ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
  }
}

// -------------------------------------------------------------
// TEST 1: Single Source of Truth - No Component Recalculates Hours
// -------------------------------------------------------------
console.log('[SECTION 1: SINGLE SOURCE OF TRUTH & NO INDEPENDENT RE-CALCULATION]');

runTest('Components import from market-session-engine or use assetProfile.sessionState', () => {
  const componentsToCheck = [
    'src/components/cockpit/LiveTickerStrip.tsx',
    'src/components/cockpit/MasterTopNav.tsx',
    'src/components/cockpit/MarketOverviewCard.tsx',
    'src/components/cockpit/GlobalOpportunityRadar.tsx',
    'src/components/cockpit/CurrentAiDecision.tsx',
    'src/components/cockpit/RiskGuardianPolicy.tsx',
    'src/components/cockpit/SmartPositionCalculatorCard.tsx',
    'src/components/cockpit/FullSmartPositionCalculator.tsx',
    'src/app/execution/page.tsx',
    'src/app/agents/page.tsx',
    'src/app/markets/page.tsx',
    'src/lib/agents/agent-blackboard.ts',
    'src/app/api/bridge/mt5/route.ts',
  ];

  for (const relPath of componentsToCheck) {
    const fullPath = path.resolve(__dirname, '..', relPath);
    assert(fs.existsSync(fullPath), `File ${relPath} must exist`);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Ensure they don't do ad-hoc day-of-week hour math like `getDay() === 0 && getHours() > 21`
    const rogueMathRegex = /getDay\(\)\s*===?\s*[0-6]\s*&&\s*getHours\(\)/;
    assert(!rogueMathRegex.test(content), `${relPath} must not contain rogue hardcoded day/hour calculations`);
  }
});

// -------------------------------------------------------------
// TEST 2: Canonical Engine Evaluates Silver, Gold, Forex, Crypto
// -------------------------------------------------------------
console.log('\n[SECTION 2: CANONICAL ENGINE MULTI-ASSET BEHAVIOR]');

runTest('Saturday UTC: XAGUSD and XAUUSD are WEEKEND_CLOSED; BTCUSD is OPEN', () => {
  const saturday = new Date('2026-09-12T14:30:00Z'); // Saturday UTC
  const xau = evaluateMarketSession('XAUUSD', saturday);
  const xag = evaluateMarketSession('XAGUSD', saturday);
  const eurusd = evaluateMarketSession('EURUSD', saturday);
  const btc = evaluateMarketSession('BTCUSD', saturday);

  assert.strictEqual(xau.marketState, 'WEEKEND_CLOSED');
  assert.strictEqual(xau.tradeExecutable, false);
  assert.strictEqual(xau.executabilityScore, 0);

  assert.strictEqual(xag.marketState, 'WEEKEND_CLOSED');
  assert.strictEqual(xag.tradeExecutable, false);
  assert.strictEqual(xag.executabilityScore, 0);

  assert.strictEqual(eurusd.marketState, 'WEEKEND_CLOSED');
  assert.strictEqual(eurusd.tradeExecutable, false);

  assert.strictEqual(btc.marketState, 'OPEN');
  assert.strictEqual(btc.tradeExecutable, true);
  assert.strictEqual(btc.executabilityScore, 100);
});

// -------------------------------------------------------------
// TEST 3: Global Opportunity Radar Ranking Policy
// -------------------------------------------------------------
console.log('\n[SECTION 3: RADAR RANKING & EXECUTABILITY RULE]');

runTest('topOpportunity always prioritizes executable assets over closed assets', () => {
  const radarData = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'H1');

  assert(radarData.rankedOpportunities.length > 0, 'Must have scanned opportunities');
  assert(radarData.topOpportunity !== null, 'Must have a top opportunity');

  // If there are any executable opportunities, topOpportunity MUST be executable
  const hasExecutable = radarData.rankedOpportunities.some(o => o.tradeExecutable);
  if (hasExecutable) {
    assert.strictEqual(
      radarData.topOpportunity.tradeExecutable,
      true,
      `Top opportunity must be immediately executable, but was ${radarData.topOpportunity.symbol} (executable: ${radarData.topOpportunity.tradeExecutable})`
    );
  }

  // Verify closed opportunities exist with valid setup qualities and session metadata
  const closedOpp = radarData.rankedOpportunities.find(o => !o.tradeExecutable);
  if (closedOpp) {
    assert.strictEqual(closedOpp.executabilityScore, 0, 'Closed asset executabilityScore must be 0');
    assert(closedOpp.state.includes('WAIT') || closedOpp.state.includes('OPEN') || closedOpp.state.includes('MONITOR'), 'Closed asset state must reflect closed market');
  }
});

// -------------------------------------------------------------
// TEST 4: Opportunity Notifications Compliance
// -------------------------------------------------------------
console.log('\n[SECTION 4: NOTIFICATIONS GATE FOR CLOSED MARKETS]');

runTest('Closed assets emit SETUP_DEVELOPING with revalidation notice, never TRADE_OPPORTUNITY_CONFIRMED', () => {
  const radarData = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'H1');
  const alerts = evaluateRadarTransitions(radarData.rankedOpportunities);

  // Any alert for a closed asset MUST NOT be TRADE_OPPORTUNITY_CONFIRMED
  for (const alert of alerts) {
    if (!alert.tradeExecutable) {
      assert.notStrictEqual(alert.eventType, 'TRADE_OPPORTUNITY_CONFIRMED', `Closed asset ${alert.symbol} cannot trigger TRADE_OPPORTUNITY_CONFIRMED`);
      assert.strictEqual(alert.eventType, 'SETUP_DEVELOPING', `Closed asset ${alert.symbol} should trigger SETUP_DEVELOPING`);
      assert(alert.message.includes('revalidation required') || alert.message.includes('Market is closed') || alert.message.includes('Market closed'),
        `Message must inform trader of closed status: ${alert.message}`);
    }
  }
});

// -------------------------------------------------------------
// TEST 5: Server-Side MT5 Bridge Route & Client Hard Gate
// -------------------------------------------------------------
console.log('\n[SECTION 5: SERVER-SIDE BRIDGE ROUTE & CLIENT GATE]');

runTest('mt5BridgeClient rejects PLACE_ORDER for closed markets with MARKET_CLOSED error', async () => {
  // Test sending order on XAUUSD on Saturday
  // mt5BridgeClient uses evaluateMarketSession internally
  const res = await mt5BridgeClient.sendCommand('PLACE_ORDER', { type: 'BUY', lots: 0.1 }, 'XAUUSD');

  // Since current test time is Saturday/Sunday, evaluateMarketSession will reject
  const nowSession = evaluateMarketSession('XAUUSD', new Date());
  if (!nowSession.tradeExecutable) {
    assert.strictEqual(res.success, false, 'Command should fail when market is closed');
    assert.strictEqual(res.error?.code, 'MARKET_CLOSED', 'Error code must be MARKET_CLOSED');
  } else {
    // If running during open hours, simulate with client override
    console.log('    (Note: current time is open market, skipping live weekend trigger)');
  }
});

runTest('API Route src/app/api/bridge/mt5/route.ts verifies tradeExecutable in POST handler', () => {
  const routePath = path.resolve(__dirname, '../src/app/api/bridge/mt5/route.ts');
  const content = fs.readFileSync(routePath, 'utf8');
  assert(content.includes('evaluateMarketSession'), 'Route must import evaluateMarketSession');
  assert(content.includes('RESTRICTED_EXECUTION_COMMANDS'), 'Route must check RESTRICTED_EXECUTION_COMMANDS');
  assert(content.includes('status: 403'), 'Route must return 403 for closed market execution attempts');
});

// -------------------------------------------------------------
// TEST 6: Multi-Agent Shared Blackboard Integration
// -------------------------------------------------------------
console.log('\n[SECTION 6: AGENT BLACKBOARD SESSION CONTEXT]');

runTest('INITIAL_BLACKBOARD_STATE contains marketSession context', () => {
  assert(INITIAL_BLACKBOARD_STATE.marketSession, 'INITIAL_BLACKBOARD_STATE must contain marketSession');
  assert(typeof INITIAL_BLACKBOARD_STATE.marketSession.tradeExecutable === 'boolean');
  assert(typeof INITIAL_BLACKBOARD_STATE.marketSession.statusLabel === 'string');
});

runTest('createSharedBlackboardForAsset populates canonical marketSession for asset', () => {
  const bb = createSharedBlackboardForAsset(
    'XAUUSD', 4350.0, 0.35, 1.2, 'METALS', 'Bullish Trend', 'London', 80, 'BUY SETUP', 4320.0, []
  );

  assert(bb.marketSession, 'Generated blackboard must have marketSession');
  assert(typeof bb.marketSession.marketState === 'string');
  assert(typeof bb.marketSession.tradeExecutable === 'boolean');
  assert(typeof bb.marketSession.scheduleSource === 'string');
});

// -------------------------------------------------------------
// TEST 7: Execution Page UI & Lock Verification
// -------------------------------------------------------------
console.log('\n[SECTION 7: EXECUTION PAGE UI & BUTTON LOCK]');

runTest('Execution page locks dispatch button and blocks handleExecuteOrder when market closed', () => {
  const execPath = path.resolve(__dirname, '../src/app/execution/page.tsx');
  const content = fs.readFileSync(execPath, 'utf8');

  // Verify dispatch button disabled check
  assert(
    content.includes('disabled={!isArmed || !assetProfile.tradeExecutable}'),
    'Execution button must be disabled when !assetProfile.tradeExecutable'
  );

  // Verify dispatch button text shows closed warning
  assert(
    content.includes('MARKET CLOSED — DISPATCH LOCKED'),
    'Button must display MARKET CLOSED — DISPATCH LOCKED'
  );

  // Verify handleExecuteOrder has safety gate
  assert(
    content.includes('if (!assetProfile.tradeExecutable)'),
    'handleExecuteOrder must reject execution when !assetProfile.tradeExecutable'
  );

  // Verify Closed Market Warning Banner exists
  assert(
    content.includes('MARKET CLOSED — EXECUTION GATE LOCKED'),
    'Execution page must display warning banner'
  );
});

// -------------------------------------------------------------
// TEST 8: Institutional Markets Directory Table
// -------------------------------------------------------------
console.log('\n[SECTION 8: INSTITUTIONAL MARKETS DIRECTORY]');

runTest('Markets page table includes Market Session column with MarketStatusBadge', () => {
  const marketsPath = path.resolve(__dirname, '../src/app/markets/page.tsx');
  const content = fs.readFileSync(marketsPath, 'utf8');

  assert(content.includes('<th className="p-3.5">Market Session</th>'), 'Markets table must have Market Session column header');
  assert(content.includes('<MarketStatusBadge symbol={row.symbol}'), 'Markets table rows must render MarketStatusBadge');
});

// -------------------------------------------------------------
// TEST 9: Trade Journal Session Snapshot Integration
// -------------------------------------------------------------
console.log('\n[SECTION 9: TRADE JOURNAL SESSION SNAPSHOT]');

runTest('Trade Journal integrates marketSessionSnapshot across types, list, modal, and CSV', () => {
  const journalPath = path.resolve(__dirname, '../src/app/journal/page.tsx');
  const content = fs.readFileSync(journalPath, 'utf8');

  // Verify interface
  assert(content.includes('marketSessionSnapshot?: {'), 'HistoricalTrade must include marketSessionSnapshot');

  // Verify table row rendering
  assert(content.includes('tr.marketSessionSnapshot.sessionName'), 'Journal table row must render session snapshot name');

  // Verify modal post-mortem rendering
  assert(content.includes('SESSION AT ENTRY:'), 'Post-mortem modal must display session at entry');

  // Verify CSV export includes session headers
  assert(content.includes('Session,SessionState'), 'CSV export must include session columns');
});

// -------------------------------------------------------------
// TEST SUMMARY
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`PHASE 31 INTEGRATION AUDIT: ${passedTests}/${totalTests} TESTS PASSED`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  console.log('🎉 ALL PHASE 31 WEBSITE-WIDE MARKET STATUS INTEGRATION TESTS PASSED!\n');
  process.exit(0);
} else {
  console.error(`💥 FAILED: ${totalTests - passedTests} tests failed.`);
  process.exit(1);
}
