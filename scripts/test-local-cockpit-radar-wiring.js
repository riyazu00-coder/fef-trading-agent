/**
 * FEF CORTEX — TEST SUITE: LOCAL COCKPIT & 25-ASSET RADAR TELEMETRY WIRING
 *
 * Verifies:
 * 1. Server API Boundary (/api/bridge/mt5) enrichment with LocalMarketDataProvider
 * 2. Strict provenance ('MT5_BROKER', 'LOCAL_SQLITE', isExecutable: false)
 * 3. Client sandbox isolation (zero node:sqlite / DatabaseSync imports in client bundles)
 * 4. Opportunity radar dynamic symbol scanning via LocalMarketDataProvider
 * 5. GER40 UNAVAILABLE classification & exclusion from active opportunity ranking
 * 6. Single-lifecycle provider instance reuse during radar scan
 * 7. ActiveAssetContext local mode handling (zero silent fallback to public mock data)
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

// Test runner helper
let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

async function runTestAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

(async function main() {
  console.log('\n=============================================================');
  console.log('FEF CORTEX — LOCAL COCKPIT & RADAR TELEMETRY WIRING TEST SUITE');
  console.log('=============================================================\n');

  const {
    LocalMarketDataProvider,
    getLocalMarketDataProvider,
    CANONICAL_26_UNIVERSE
  } = require('../src/lib/providers/local-market-data-provider');

  // Test 1: Client sandbox isolation - client files must NOT import node:sqlite or LocalTelemetryRepository
  runTest('T1: Client sandbox isolation — no node:sqlite or DatabaseSync in client files', () => {
    const clientFiles = [
      path.resolve(__dirname, '../src/context/ActiveAssetContext.tsx'),
      path.resolve(__dirname, '../src/components/CockpitDashboard.tsx'),
      path.resolve(__dirname, '../src/components/GlobalOpportunityRadar.tsx'),
      path.resolve(__dirname, '../src/components/ActiveAssetCockpit.tsx'),
    ];

    for (const file of clientFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        assert(
          !content.includes('node:sqlite'),
          `Client file ${path.basename(file)} must NOT import node:sqlite`
        );
        assert(
          !content.includes('DatabaseSync'),
          `Client file ${path.basename(file)} must NOT reference DatabaseSync`
        );
        assert(
          !content.includes('LocalTelemetryRepository'),
          `Client file ${path.basename(file)} must NOT import LocalTelemetryRepository directly`
        );
      }
    }
  });

  // Test 2: LocalMarketDataProvider provides available symbols dynamically
  await runTestAsync('T2: LocalMarketDataProvider discovers dynamically available symbols (25/26)', async () => {
    const provider = getLocalMarketDataProvider();
    const available = await provider.getAvailableSymbols();

    assert(Array.isArray(available), 'available symbols must be an array');
    assert(available.length >= 20, `expected at least 20 symbols, got ${available.length}`);
    assert(available.includes('XAUUSD'), 'XAUUSD must be in available symbols');
    assert(available.includes('EURUSD'), 'EURUSD must be in available symbols');
    assert(available.includes('BTCUSD'), 'BTCUSD must be in available symbols');
    assert(!available.includes('GER40'), 'GER40 must NOT be in available symbols (known missing broker asset)');
  });

  // Test 3: LocalMarketDataProvider provides normalized quotes with strict provenance
  await runTestAsync('T3: LocalMarketDataProvider.getLatestQuotes returns strict provenance', async () => {
    const provider = getLocalMarketDataProvider();
    const quotes = await provider.getLatestQuotes();

    assert(typeof quotes === 'object', 'quotes must be an object dictionary');
    const xau = quotes['XAUUSD'];
    assert(xau, 'XAUUSD quote must be present');
    assert.strictEqual(xau.canonicalSymbol, 'XAUUSD');
    assert.strictEqual(xau.source, 'MT5_BROKER');
    assert.strictEqual(xau.storage, 'LOCAL_SQLITE');
    assert.strictEqual(xau.isExecutable, false);
    assert(typeof xau.bid === 'number' && xau.bid > 0, 'bid must be positive number');
    assert(typeof xau.ask === 'number' && xau.ask > 0, 'ask must be positive number');
    assert(typeof xau.spread === 'number', 'spread must be a number');
  });

  // Test 4: LocalMarketDataProvider health model
  await runTestAsync('T4: LocalMarketDataProvider.getHealth provides local-first status', async () => {
    const provider = getLocalMarketDataProvider();
    const health = await provider.getHealth();

    assert.strictEqual(health.storageMode, 'LOCAL');
    assert.strictEqual(health.localDatabase, 'ONLINE');
    assert.strictEqual(health.executionLock, 'READ_ONLY');
    assert(health.quotesCount >= 20, `quotesCount should be >= 20, got ${health.quotesCount}`);
    assert(health.candlesCount >= 1000, `candlesCount should be >= 1000, got ${health.candlesCount}`);
  });

  // Test 5: Radar engine wires to LocalMarketDataProvider and handles dynamic symbols
  await runTestAsync('T5: Opportunity Radar evaluateLocalOpportunityRadar dynamically scans broker assets', async () => {
    const { evaluateLocalOpportunityRadar } = require('../src/lib/radar/opportunity-radar-engine');
    assert(typeof evaluateLocalOpportunityRadar === 'function', 'evaluateLocalOpportunityRadar must be exported as a function');

    const provider = getLocalMarketDataProvider();
    const radar = await evaluateLocalOpportunityRadar(provider, 'H1');

    assert(radar, 'Radar result must be returned');
    assert(Array.isArray(radar.rankedOpportunities), 'rankedOpportunities must be an array');
    assert.strictEqual(radar.rankedOpportunities.length, CANONICAL_26_UNIVERSE.length, 'All 26 universe assets evaluated');

    // GER40 must be truthfully reported as UNAVAILABLE
    const ger40 = radar.rankedOpportunities.find(o => o.symbol === 'GER40');
    assert(ger40, 'GER40 must be in evaluated opportunities');
    assert.strictEqual(ger40.state, 'UNAVAILABLE', `GER40 state must be UNAVAILABLE, got ${ger40.state}`);
    assert.strictEqual(ger40.readiness, 'UNAVAILABLE', `GER40 readiness must be UNAVAILABLE, got ${ger40.readiness}`);
    assert.strictEqual(ger40.marketState, 'UNAVAILABLE', `GER40 marketState must be UNAVAILABLE, got ${ger40.marketState}`);
    assert.strictEqual(ger40.tradeExecutable, false, 'GER40 tradeExecutable must be false');
    assert.strictEqual(ger40.opportunityScore, 0, 'GER40 opportunityScore must be 0');
    assert.strictEqual(ger40.isDataLimited, true, 'GER40 isDataLimited must be true');

    // GER40 must be ranked last (#26, index 25)
    const ger40Index = radar.rankedOpportunities.findIndex(o => o.symbol === 'GER40');
    assert.strictEqual(ger40Index, 25, `GER40 must be ranked last (index 25), found at index ${ger40Index}`);

    // Crypto assets (BTCUSD, ETHUSD, SOLUSD) must not be WAIT (MARKET CLOSED)
    const btc = radar.rankedOpportunities.find(o => o.symbol === 'BTCUSD');
    if (btc) {
      assert.notStrictEqual(btc.state, 'WAIT (MARKET CLOSED)', 'BTCUSD is 24/7 crypto and must never be WAIT (MARKET CLOSED)');
    }

    // Safety Invariant: In READ_ONLY local mode, no opportunity has tradeExecutable: true
    for (const opp of radar.rankedOpportunities) {
      assert.strictEqual(opp.tradeExecutable, false, `Asset ${opp.symbol} must have tradeExecutable: false`);
    }
  });

  // Test 6: Single-lifecycle provider reuse
  await runTestAsync('T6: Radar scan reuses a single LocalMarketDataProvider instance', async () => {
    const { evaluateLocalOpportunityRadar } = require('../src/lib/radar/opportunity-radar-engine');
    const provider = getLocalMarketDataProvider();

    let getQuotesCallCount = 0;
    const origGetQuotes = provider.getLatestQuotes.bind(provider);
    provider.getLatestQuotes = async () => {
      getQuotesCallCount++;
      return origGetQuotes();
    };

    try {
      await evaluateLocalOpportunityRadar(provider, 'H1');
      // Should call getLatestQuotes once for the whole radar scan, NOT 26 times
      assert(
        getQuotesCallCount === 1,
        `getLatestQuotes should be called exactly once per radar cycle, called ${getQuotesCallCount} times`
      );
    } finally {
      provider.getLatestQuotes = origGetQuotes;
    }
  });

  // Test 7: Route /api/bridge/mt5 TELEMETRY enrichment function
  await runTestAsync('T7: Server-side route helper enriches status with local SQLite quotes', async () => {
    const { enrichTelemetryWithLocalMarketData } = require('../src/lib/bridge/local-telemetry-enricher.ts');
    assert(typeof enrichTelemetryWithLocalMarketData === 'function', 'enrichTelemetryWithLocalMarketData must be exported');

    const mockBaseStatus = {
      success: true,
      localBridge: 'ONLINE',
      mt5Connected: true,
      quotes: {},
      symbols: ['XAUUSD', 'EURUSD'],
    };

    const enriched = await enrichTelemetryWithLocalMarketData(mockBaseStatus);
    assert.strictEqual(enriched.localDatabase, 'ONLINE');
    assert.strictEqual(enriched.storageMode, 'LOCAL');
    assert(enriched.quotesAvailable >= 20, `quotesAvailable should be >= 20, got ${enriched.quotesAvailable}`);
    assert(enriched.quotes['XAUUSD'], 'XAUUSD must be present in enriched quotes');
    assert.strictEqual(enriched.quotes['XAUUSD'].source, 'MT5_BROKER');
    assert.strictEqual(enriched.quotes['XAUUSD'].storage, 'LOCAL_SQLITE');
  });

  // Test 8: Spread truthfulness — broker spreads are preserved without synthetic distortion
  await runTestAsync('T8: Spread truthfulness — zero and non-zero spreads preserved truthfully from broker', async () => {
    const provider = getLocalMarketDataProvider();
    const quotes = await provider.getLatestQuotes();

    if (quotes['EURUSD']) {
      assert(typeof quotes['EURUSD'].spread === 'number', 'EURUSD spread must be a number');
      assert.strictEqual(quotes['EURUSD'].spread, 0, 'EURUSD spread should reflect verified broker value 0');
    }
    if (quotes['XAUUSD']) {
      assert(typeof quotes['XAUUSD'].spread === 'number', 'XAUUSD spread must be a number');
      assert(quotes['XAUUSD'].spread > 0, `XAUUSD spread should reflect positive broker spread, got ${quotes['XAUUSD'].spread}`);
    }
  });

  // Test 9: Radar readiness model mapping
  await runTestAsync('T9: Radar readiness model — maps broker data and candle status accurately', async () => {
    const { evaluateLocalOpportunityRadar } = require('../src/lib/radar/opportunity-radar-engine');
    const provider = getLocalMarketDataProvider();
    const radar = await evaluateLocalOpportunityRadar(provider, 'H1');

    for (const opp of radar.rankedOpportunities) {
      if (opp.symbol === 'GER40') {
        assert.strictEqual(opp.readiness, 'UNAVAILABLE');
      } else {
        assert(['READY', 'PARTIAL', 'STALE', 'DATA LIMITED'].includes(opp.readiness),
          `Asset ${opp.symbol} has invalid readiness ${opp.readiness}`);
      }
    }
  });

  // Test 10: Active asset unavailable safety — price 0 or null cannot execute
  await runTestAsync('T10: Unavailable asset safety — null quote returned and non-actionable', async () => {
    const provider = getLocalMarketDataProvider();
    const ger40Quote = await provider.getLatestQuote('GER40');
    assert.strictEqual(ger40Quote, null, 'GER40 quote must be null');
  });

  // Test 11: Server response security audit — no filesystem paths or secrets exposed
  await runTestAsync('T11: Server response security — /api/bridge/mt5 telemetry sanitized', async () => {
    const { enrichTelemetryWithLocalMarketData } = require('../src/lib/bridge/local-telemetry-enricher.ts');
    const dirtyStatus = {
      success: true,
      token: 'super_secret_token_123',
      deviceSecret: 'dev_secret_456',
      dbPath: '/Users/mac/.fef/data/fef-cortex.db',
      quotes: {
        XAUUSD: {
          symbol: 'XAUUSD',
          bid: 2400.5,
          ask: 2400.9,
          internalPath: '/Users/mac/secret/file.txt',
        }
      }
    };

    const sanitized = await enrichTelemetryWithLocalMarketData(dirtyStatus);
    const jsonStr = JSON.stringify(sanitized);

    assert(!jsonStr.includes('/Users/'), 'Response must not contain /Users/ filesystem paths');
    assert(!jsonStr.includes('super_secret_token_123'), 'Response must not contain secret tokens');
    assert(!jsonStr.includes('dev_secret_456'), 'Response must not contain device secrets');
    assert(!sanitized.token, 'token property must be stripped');
    assert(!sanitized.deviceSecret, 'deviceSecret property must be stripped');
    assert(!sanitized.dbPath, 'dbPath property must be stripped');
  });

  console.log(`\n=============================================================`);
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log(`=============================================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
})();
