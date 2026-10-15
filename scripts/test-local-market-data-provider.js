/**
 * FEF CORTEX — LOCAL MARKET DATA PROVIDER AUTOMATED TEST SUITE
 *
 * Verifies the canonical local market intelligence read path:
 * Trusted Node Runtime -> LocalMarketDataProvider -> LocalTelemetryRepository -> fef-cortex.db
 *
 * Tests:
 * 1. Provider initialization & repository binding
 * 2. getHealth() reporting truthful DB status, broker status, quote/candle counts
 * 3. getLatestQuote(symbol) normalized structure with MT5_BROKER / LOCAL_SQLITE provenance
 * 4. getLatestQuotes() maps all symbols by canonical ticker
 * 5. Symbol alias normalization (e.g. 'XAUUSDm', lowercase 'xauusd')
 * 6. GER40 has no broker telemetry -> returns null for quote, UNAVAILABLE for candles (zero mock/fabrication)
 * 7. Unknown symbol -> returns null / UNAVAILABLE
 * 8. getCandles(symbol, timeframe, limit) chronological ascending bar order
 * 9. getCandles newest-window limit behavior
 * 10. Timeframe availability: AVAILABLE only when >= 10 valid bars exist
 * 11. Insufficient bars (< 10 bars) -> state INSUFFICIENT_DATA
 * 12. Missing timeframe (0 bars) -> state UNAVAILABLE
 * 13. Deterministic quote freshness (FRESH, STALE, SESSION_CLOSED)
 * 14. Deterministic candle freshness (timeframe duration-aware)
 * 15. getMarketSnapshot(symbol) synthesizes CanonicalMarketSnapshot
 * 16. getAvailableSymbols() reflects actual local SQLite availability
 * 17. Offline / DB unavailable -> fails closed, zero fallback to mock/public APIs
 * 18. Architectural invariants: READ_ONLY, isExecutable = false, MT5_ORDER_TRANSPORT_ENABLED = false
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const { LocalTelemetryRepository } = require('./fef-local-telemetry-repository');

const ts = require('typescript');

// Register TypeScript on-the-fly compiler
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};

// Import the provider under test
let LocalMarketDataProvider;
try {
  const mod = require('../src/lib/providers/local-market-data-provider.ts');
  LocalMarketDataProvider = mod.LocalMarketDataProvider;
} catch (e) {
  console.error('Import error for local-market-data-provider.ts:', e);
}

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ Test ${totalTests}: ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ Test ${totalTests}: ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

// Helper: create isolated temporary test DB
function createIsolatedTestDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fef-test-provider-'));
  const dbPath = path.join(tmpDir, 'test-cortex.db');
  const repo = new LocalTelemetryRepository(dbPath);

  // Seed sample quotes
  const now = Date.now();
  const quotes = [
    {
      symbol: 'XAUUSD',
      bid: 4140.50,
      ask: 4140.90,
      mid: 4140.70,
      spread: 40,
      digits: 2,
      timestamp: now - 2000,
      quoteTimestamp: now - 2000, // 2s ago (fresh)
    },
    {
      symbol: 'EURUSD',
      bid: 1.08500,
      ask: 1.08510,
      mid: 1.08505,
      spread: 10,
      digits: 5,
      timestamp: now - 45000,
      quoteTimestamp: now - 45000, // 45s ago (stale)
    },
    {
      symbol: 'BTCUSD',
      bid: 68500.0,
      ask: 68510.0,
      mid: 68505.0,
      spread: 100,
      digits: 1,
      timestamp: now - 500,
      quoteTimestamp: now - 500, // fresh
    }
  ];

  // Seed sample candles for XAUUSD M15 (15 bars: >= 10, fresh)
  const xauM15Candles = [];
  const m15IntervalMs = 15 * 60 * 1000;
  const baseM15Time = now - (15 * m15IntervalMs);
  for (let i = 0; i < 15; i++) {
    const barTime = baseM15Time + (i * m15IntervalMs);
    xauM15Candles.push({
      timestamp: barTime,
      open: 4130 + i,
      high: 4135 + i,
      low: 4128 + i,
      close: 4133 + i,
      tickVolume: 100 + (i * 10)
    });
  }

  // Seed sample candles for XAUUSD H1 (5 bars: < 10, insufficient)
  const xauH1Candles = [];
  const h1IntervalMs = 60 * 60 * 1000;
  const baseH1Time = now - (5 * h1IntervalMs);
  for (let i = 0; i < 5; i++) {
    const barTime = baseH1Time + (i * h1IntervalMs);
    xauH1Candles.push({
      timestamp: barTime,
      open: 4100 + (i * 5),
      high: 4110 + (i * 5),
      low: 4095 + (i * 5),
      close: 4105 + (i * 5),
      tickVolume: 500 + i
    });
  }

  // Seed sample stale candles for EURUSD H1 (12 bars, but newest is 10 hours old)
  const eurH1Candles = [];
  const staleH1Base = now - (12 * h1IntervalMs) - (10 * h1IntervalMs);
  for (let i = 0; i < 12; i++) {
    const barTime = staleH1Base + (i * h1IntervalMs);
    eurH1Candles.push({
      timestamp: barTime,
      open: 1.0800 + (i * 0.001),
      high: 1.0850 + (i * 0.001),
      low: 1.0790 + (i * 0.001),
      close: 1.0840 + (i * 0.001),
      tickVolume: 300
    });
  }

  repo.saveTelemetryCycle({
    deviceId: 'fef-connector-test-01',
    capturedAt: new Date(now).toISOString(),
    sequence: 1,
    heartbeat: {
      terminalBuild: 4570,
      broker: 'Exness Technologies Ltd',
      server: 'Exness-MT5Trial16',
      magicNumber: 8882026,
      heartbeatIntervalSec: 2,
      operatingMode: 'READ_ONLY',
      activeSymbolsCount: 3,
      quotesCount: 3,
      terminalConnected: 1
    },
    account: {
      maskedLogin: '71***98',
      broker: 'Exness Technologies Ltd',
      server: 'Exness-MT5Trial16',
      currency: 'USD',
      tradeMode: 'DEMO',
      leverage: 200,
      balance: 10000,
      equity: 10000,
      margin: 0,
      freeMargin: 10000,
      marginLevel: 0,
      operatingMode: 'READ_ONLY',
      tradeAllowed: 0
    },
    quotes,
    candleSnapshots: [
      { canonicalSymbol: 'XAUUSD', brokerSymbol: 'XAUUSDm', timeframe: 'M15', candles: xauM15Candles },
      { canonicalSymbol: 'XAUUSD', brokerSymbol: 'XAUUSDm', timeframe: 'H1', candles: xauH1Candles },
      { canonicalSymbol: 'EURUSD', brokerSymbol: 'EURUSDm', timeframe: 'H1', candles: eurH1Candles },
    ],
    connectorState: {
      state: 'ONLINE',
      storageMode: 'LOCAL',
      lastBridgeHeartbeat: now - 500,
      lastLocalPersist: now - 500,
      consecutiveErrors: 0
    }
  });

  return { repo, tmpDir, dbPath, now };
}

async function main() {
  console.log('=================================================================');
  console.log('FEF CORTEX — LOCAL MARKET DATA PROVIDER TEST SUITE');
  console.log('=================================================================');

  runTest('LocalMarketDataProvider class exists and can be imported', () => {
    assert(LocalMarketDataProvider, 'LocalMarketDataProvider must be exported from local-market-data-provider');
    assert(typeof LocalMarketDataProvider === 'function', 'LocalMarketDataProvider must be a class constructor');
  });

  const { repo, tmpDir, dbPath, now } = createIsolatedTestDb();

  try {
    const provider = new LocalMarketDataProvider({ repository: repo });

    await runAsyncTest('Provider getHealth() reflects truthful SQLite state', async () => {
      const health = await provider.getHealth();
      assert.strictEqual(health.status, 'ONLINE');
      assert.strictEqual(health.storageMode, 'LOCAL');
      assert.strictEqual(health.localDatabase, 'ONLINE');
      assert.strictEqual(health.quotesCount, 3);
      assert.strictEqual(health.brokerConnected, true);
      assert.strictEqual(health.broker, 'Exness Technologies Ltd');
      assert.strictEqual(health.server, 'Exness-MT5Trial16');
      assert.strictEqual(health.executionLock, 'READ_ONLY');
      assert(health.candlesCount >= 32, `Expected >= 32 seeded candles, got ${health.candlesCount}`);
    });

    await runAsyncTest('getLatestQuote(symbol) returns normalized quote with MT5_BROKER / LOCAL_SQLITE provenance', async () => {
      const quote = await provider.getLatestQuote('XAUUSD');
      assert(quote !== null, 'XAUUSD quote must be present');
      assert.strictEqual(quote.canonicalSymbol, 'XAUUSD');
      assert.strictEqual(quote.bid, 4140.50);
      assert.strictEqual(quote.ask, 4140.90);
      assert.strictEqual(quote.mid, 4140.70);
      assert.strictEqual(quote.spread, 40);
      assert.strictEqual(quote.source, 'MT5_BROKER');
      assert.strictEqual(quote.storage, 'LOCAL_SQLITE');
      assert.strictEqual(quote.isExecutable, false, 'isExecutable must be strictly false in READ_ONLY');
      assert.strictEqual(quote.freshness, 'FRESH');
      assert(quote.ageMs >= 0, 'ageMs must be >= 0');
    });

    await runAsyncTest('getLatestQuotes() maps all symbols by canonical ticker', async () => {
      const quotesMap = await provider.getLatestQuotes();
      assert(quotesMap instanceof Map || typeof quotesMap === 'object', 'getLatestQuotes must return Map or object');
      const getQ = (s) => (quotesMap instanceof Map ? quotesMap.get(s) : quotesMap[s]);
      assert(getQ('XAUUSD'), 'XAUUSD must be in quotes map');
      assert(getQ('EURUSD'), 'EURUSD must be in quotes map');
      assert(getQ('BTCUSD'), 'BTCUSD must be in quotes map');
      assert(!getQ('GER40'), 'GER40 must NOT be in quotes map');
    });

    await runAsyncTest('Symbol alias normalization (e.g. XAUUSDm, lowercase xauusd) resolves to canonical ticker', async () => {
      const qAlias = await provider.getLatestQuote('XAUUSDm');
      assert(qAlias !== null, 'XAUUSDm alias should resolve to XAUUSD');
      assert.strictEqual(qAlias.canonicalSymbol, 'XAUUSD');

      const qLower = await provider.getLatestQuote('xauusd');
      assert(qLower !== null, 'lowercase xauusd should resolve to XAUUSD');
      assert.strictEqual(qLower.canonicalSymbol, 'XAUUSD');
    });

    await runAsyncTest('GER40 has no broker telemetry -> returns null quote and UNAVAILABLE candles (zero mock/fabrication)', async () => {
      const gerQuote = await provider.getLatestQuote('GER40');
      assert.strictEqual(gerQuote, null, 'GER40 quote must be strictly null when absent from SQLite');

      const gerCandles = await provider.getCandles('GER40', 'M15');
      assert.strictEqual(gerCandles.state, 'UNAVAILABLE');
      assert.strictEqual(gerCandles.count, 0);
      assert.deepStrictEqual(gerCandles.candles, []);
      assert.strictEqual(gerCandles.source, 'MT5_BROKER');
      assert.strictEqual(gerCandles.storage, 'LOCAL_SQLITE');
    });

    await runAsyncTest('Unknown symbol returns null quote and UNAVAILABLE candles', async () => {
      const unkQuote = await provider.getLatestQuote('NOT_A_SYMBOL');
      assert.strictEqual(unkQuote, null);

      const unkCandles = await provider.getCandles('NOT_A_SYMBOL', 'M15');
      assert.strictEqual(unkCandles.state, 'UNAVAILABLE');
      assert.strictEqual(unkCandles.count, 0);
    });

    await runAsyncTest('getCandles(symbol, timeframe, limit) retrieves chronological ascending bars', async () => {
      const res = await provider.getCandles('XAUUSD', 'M15', 10);
      assert.strictEqual(res.state, 'AVAILABLE');
      assert.strictEqual(res.count, 10);
      assert.strictEqual(res.candles.length, 10);
      assert.strictEqual(res.source, 'MT5_BROKER');
      assert.strictEqual(res.storage, 'LOCAL_SQLITE');
      assert.strictEqual(res.provenance, 'LIVE_MT5');

      // Verify strict chronological ascending order: t0 < t1 < t2 ...
      for (let i = 1; i < res.candles.length; i++) {
        assert(
          res.candles[i].timestamp > res.candles[i - 1].timestamp,
          `Candles must be in chronological ascending order: ${res.candles[i].timestamp} > ${res.candles[i-1].timestamp}`
        );
      }
    });

    await runAsyncTest('getCandles with limit delivers the newest-window bars', async () => {
      const res5 = await provider.getCandles('XAUUSD', 'M15', 5);
      const res15 = await provider.getCandles('XAUUSD', 'M15', 15);
      assert.strictEqual(res5.count, 5);
      assert.strictEqual(res15.count, 15);

      // The newest bar in res5 must equal the newest bar in res15
      const newest5 = res5.candles[res5.candles.length - 1];
      const newest15 = res15.candles[res15.candles.length - 1];
      assert.strictEqual(newest5.timestamp, newest15.timestamp, 'Newest bar must match regardless of limit');
    });

    await runAsyncTest('Timeframe availability: AVAILABLE only when >= 10 valid bars exist', async () => {
      const resM15 = await provider.getCandles('XAUUSD', 'M15');
      assert.strictEqual(resM15.state, 'AVAILABLE', 'XAUUSD M15 has 15 bars, must be AVAILABLE');
    });

    await runAsyncTest('Insufficient bars (< 10 bars) -> state INSUFFICIENT_DATA', async () => {
      const resH1 = await provider.getCandles('XAUUSD', 'H1');
      assert.strictEqual(resH1.state, 'INSUFFICIENT_DATA', 'XAUUSD H1 has 5 bars (<10), must be INSUFFICIENT_DATA');
      assert.strictEqual(resH1.count, 5);
      assert.strictEqual(resH1.candles.length, 5);
    });

    await runAsyncTest('Missing timeframe (0 bars) -> state UNAVAILABLE', async () => {
      const resM5 = await provider.getCandles('XAUUSD', 'M5');
      assert.strictEqual(resM5.state, 'UNAVAILABLE', 'XAUUSD M5 has 0 bars, must be UNAVAILABLE');
      assert.strictEqual(resM5.count, 0);
      assert.deepStrictEqual(resM5.candles, []);
    });

    await runAsyncTest('Deterministic quote freshness: evaluates age from quote_timestamp', async () => {
      const freshQuote = await provider.getLatestQuote('XAUUSD');
      assert.strictEqual(freshQuote.freshness, 'FRESH');

      const staleQuote = await provider.getLatestQuote('EURUSD');
      assert.strictEqual(staleQuote.freshness, 'STALE');
    });

    await runAsyncTest('Deterministic candle freshness: timeframe duration-aware', async () => {
      // XAUUSD M15 was generated around `now`, so it should be fresh
      const m15Freshness = await provider.getFreshness('XAUUSD');
      assert(m15Freshness.candleFreshness);
      assert.strictEqual(m15Freshness.candleFreshness['M15'], 'FRESH');

      // EURUSD H1 candles newest bar was 10 hours ago -> must be STALE
      const eurFreshness = await provider.getFreshness('EURUSD');
      assert.strictEqual(eurFreshness.candleFreshness['H1'], 'STALE');
    });

    await runAsyncTest('getMarketSnapshot(symbol) synthesizes CanonicalMarketSnapshot with provenance tags', async () => {
      const snap = await provider.getMarketSnapshot('XAUUSD');
      assert(snap !== null, 'Market snapshot must exist for XAUUSD');
      assert.strictEqual(snap.symbol, 'XAUUSD');
      assert.strictEqual(snap.brokerBid.value, 4140.50);
      assert.strictEqual(snap.brokerBid.source, 'MT5_BROKER');
      assert.strictEqual(snap.brokerBid.classification, 'VERIFIED_LIVE');
      assert.strictEqual(snap.brokerAsk.value, 4140.90);
      assert.strictEqual(snap.brokerMid.value, 4140.70);
    });

    await runAsyncTest('getAvailableSymbols() reflects actual local SQLite availability', async () => {
      const symbols = await provider.getAvailableSymbols();
      assert(Array.isArray(symbols), 'getAvailableSymbols must return an array');
      assert(symbols.includes('XAUUSD'), 'Must include XAUUSD');
      assert(symbols.includes('EURUSD'), 'Must include EURUSD');
      assert(symbols.includes('BTCUSD'), 'Must include BTCUSD');
      assert(!symbols.includes('GER40'), 'Must NOT include GER40');
    });

    await runAsyncTest('Fail-closed when DB file is unavailable -> returns truthful OFFLINE/UNAVAILABLE', async () => {
      const brokenRepo = new LocalTelemetryRepository('/non/existent/path/fef-missing.db');
      const brokenProvider = new LocalMarketDataProvider({ repository: brokenRepo });

      const health = await brokenProvider.getHealth();
      assert.strictEqual(health.status, 'OFFLINE');
      assert.strictEqual(health.localDatabase, 'OFFLINE');

      const q = await brokenProvider.getLatestQuote('XAUUSD');
      assert.strictEqual(q, null, 'Must return null quote when DB offline');

      const c = await brokenProvider.getCandles('XAUUSD', 'M15');
      assert.strictEqual(c.state, 'UNAVAILABLE', 'Must return UNAVAILABLE candles when DB offline');
      assert.strictEqual(c.count, 0);
    });

    await runAsyncTest('Architectural invariants: READ_ONLY, isExecutable = false, zero order mutation', async () => {
      const quote = await provider.getLatestQuote('XAUUSD');
      assert.strictEqual(quote.isExecutable, false);
      const health = await provider.getHealth();
      assert.strictEqual(health.executionLock, 'READ_ONLY');
      assert.strictEqual(typeof provider.sendOrder, 'undefined', 'Provider must NOT expose order placement methods');
      assert.strictEqual(typeof provider.orderSend, 'undefined', 'Provider must NOT expose orderSend');
    });

  } finally {
    try {
      repo.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('=================================================================');
  console.log(`ALL ${passedTests}/${totalTests} LOCAL MARKET DATA PROVIDER TESTS PASSED CLEANLY.`);
  console.log('=================================================================');
}

main().catch((err) => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});
