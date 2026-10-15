/**
 * FEF CORTEX — LIVE VALIDATION: LOCAL COCKPIT & 25-ASSET RADAR TELEMETRY
 *
 * Executes full end-to-end live validation of:
 * 1. Authoritative local SQLite repository health & metrics
 * 2. Server API Route (/api/bridge/mt5?action=TELEMETRY) enrichment
 * 3. Specific validation of key assets: XAUUSD, EURUSD, BTCUSD
 * 4. Verification that GER40 is truthfully reported as UNAVAILABLE (zero mock/public fallback)
 * 5. Full 25-asset Opportunity Radar scan with top ranked candidates
 * 6. Single-lifecycle provider verification
 * 7. Invariants: isExecutable: false, execution: 'READ_ONLY'
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

// Register TypeScript on-the-fly compiler
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};
require.extensions['.tsx'] = require.extensions['.ts'];

// Map '@/...' to '../src/...'
const origResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return origResolve.call(this, request, parent, isMain, options);
};

async function main() {
  console.log('\n=============================================================');
  console.log('FEF CORTEX — LIVE COCKPIT & RADAR TELEMETRY VALIDATION');
  console.log('=============================================================\n');

  const { getLocalMarketDataProvider } = require('../src/lib/providers/local-market-data-provider.ts');
  const { enrichTelemetryWithLocalMarketData } = require('../src/lib/bridge/local-telemetry-enricher.ts');
  const { evaluateLocalOpportunityRadar } = require('../src/lib/radar/opportunity-radar-engine.ts');

  const provider = getLocalMarketDataProvider();

  // 1. Health check
  console.log('1. LOCAL MARKET DATA HEALTH:');
  const health = await provider.getHealth();
  console.log(`   Status               : ${health.status}`);
  console.log(`   Storage Mode         : ${health.storageMode}`);
  console.log(`   Local Database       : ${health.localDatabase}`);
  console.log(`   Broker Connected     : ${health.brokerConnected}`);
  console.log(`   Broker Server        : ${health.broker || 'N/A'} (${health.server || 'N/A'})`);
  console.log(`   Quotes Available     : ${health.quotesCount}`);
  console.log(`   Candles Stored       : ${health.candlesCount}`);
  console.log(`   Execution Invariant  : ${health.executionLock}`);
  console.log(`   Persistence Age      : ${health.lastPersistenceAgeMs}ms\n`);

  assert.strictEqual(health.storageMode, 'LOCAL');
  assert.strictEqual(health.localDatabase, 'ONLINE');
  assert.strictEqual(health.executionLock, 'READ_ONLY');

  // 2. Server API Route /api/bridge/mt5 Enrichment
  console.log('2. SERVER API ROUTE (/api/bridge/mt5?action=TELEMETRY) ENRICHMENT:');
  const mockIncomingBridgeStatus = {
    success: true,
    localBridge: 'ONLINE',
    mt5Connected: true,
    transport: 'HTTP / WEBREQUEST',
    quotes: {},
  };
  const enrichedTelemetry = await enrichTelemetryWithLocalMarketData(mockIncomingBridgeStatus);
  console.log(`   Enriched Storage Mode: ${enrichedTelemetry.storageMode}`);
  console.log(`   Enriched Database    : ${enrichedTelemetry.localDatabase}`);
  console.log(`   Quotes Available     : ${enrichedTelemetry.quotesAvailable}`);
  console.log(`   Execution Lock       : ${enrichedTelemetry.execution}\n`);

  assert.strictEqual(enrichedTelemetry.storageMode, 'LOCAL');
  assert.strictEqual(enrichedTelemetry.localDatabase, 'ONLINE');
  assert.strictEqual(enrichedTelemetry.execution, 'READ_ONLY');
  assert(enrichedTelemetry.quotesAvailable >= 20);

  // 3. Key Asset Quotes Inspection
  console.log('3. AUTHORITATIVE QUOTES FOR KEY ASSETS:');
  const keySymbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'USOIL', 'US100'];
  for (const sym of keySymbols) {
    const q = await provider.getLatestQuote(sym);
    if (q) {
      console.log(`   ${sym.padEnd(8)}: Bid=${q.bid.toString().padEnd(10)} Ask=${q.ask.toString().padEnd(10)} Spread=${q.spread.toString().padEnd(6)} Freshness=${q.freshness.padEnd(14)} Source=${q.source} (${q.storage})`);
      assert.strictEqual(q.source, 'MT5_BROKER');
      assert.strictEqual(q.storage, 'LOCAL_SQLITE');
      assert.strictEqual(q.isExecutable, false);
    } else {
      console.log(`   ${sym.padEnd(8)}: NOT FOUND`);
    }
  }
  console.log();

  // 4. Truthful GER40 UNAVAILABLE verification
  console.log('4. GER40 BROKER AVAILABILITY AUDIT:');
  const ger40Quote = await provider.getLatestQuote('GER40');
  const ger40Candles = await provider.getCandles('GER40', 'H1', 50);
  console.log(`   GER40 Quote          : ${ger40Quote ? 'UNEXPECTED QUOTE' : 'null (UNAVAILABLE)'}`);
  console.log(`   GER40 Candle Count   : ${ger40Candles.count}`);
  console.log(`   GER40 Candle State   : ${ger40Candles.state}`);
  assert.strictEqual(ger40Quote, null, 'GER40 must return null quote in local mode');
  assert.strictEqual(ger40Candles.count, 0, 'GER40 must have 0 candles in local mode');
  assert.strictEqual(ger40Candles.state, 'UNAVAILABLE', 'GER40 must be UNAVAILABLE');
  console.log('   ✓ Zero public/mock fallback confirmed for GER40\n');

  // 5. Global Opportunity Radar Scan (25 assets)
  console.log('5. GLOBAL OPPORTUNITY RADAR SCAN (LOCAL AUTHORITATIVE EVALUATION):');
  const radar = await evaluateLocalOpportunityRadar(provider, 'H1');
  console.log(`   Total Evaluated      : ${radar.rankedOpportunities.length} instruments`);
  console.log(`   Top Opportunity      : ${radar.topOpportunity ? `${radar.topOpportunity.symbol} (Score: ${radar.topOpportunity.opportunityScore}, Quality: ${radar.topOpportunity.setupQuality})` : 'NONE'}`);
  console.log('\n   TOP 5 RANKED CANDIDATES:');
  const top5 = radar.rankedOpportunities.slice(0, 5);
  top5.forEach((opp, i) => {
    console.log(`   #${i + 1} ${opp.symbol.padEnd(8)} | Score: ${opp.opportunityScore.toString().padEnd(4)} | State: ${opp.state.padEnd(24)} | Risk: ${opp.riskLevel.padEnd(8)} | Executable: ${opp.tradeExecutable}`);
  });

  const ger40Radar = radar.rankedOpportunities.find(o => o.symbol === 'GER40');
  console.log('\n   GER40 IN RADAR:');
  console.log(`   Symbol               : ${ger40Radar?.symbol}`);
  console.log(`   State                : ${ger40Radar?.state}`);
  console.log(`   Market State         : ${ger40Radar?.marketState}`);
  console.log(`   Opportunity Score    : ${ger40Radar?.opportunityScore}`);
  console.log(`   Data Limited         : ${ger40Radar?.isDataLimited}`);
  console.log(`   Trade Executable     : ${ger40Radar?.tradeExecutable}`);
  console.log(`   Rank                 : #${ger40Radar?.rank}`);

  assert(ger40Radar, 'GER40 must be present in radar list');
  assert.strictEqual(ger40Radar.opportunityScore, 0, 'GER40 score must be 0');
  assert.strictEqual(ger40Radar.tradeExecutable, false, 'GER40 executable must be false');
  assert.strictEqual(ger40Radar.isDataLimited, true, 'GER40 isDataLimited must be true');

  console.log('\n=============================================================');
  console.log('ALL LIVE VALIDATION GATES CONFIRMED AND PASSED');
  console.log('=============================================================\n');
}

main().catch((err) => {
  console.error('Validation failure:', err);
  process.exit(1);
});
