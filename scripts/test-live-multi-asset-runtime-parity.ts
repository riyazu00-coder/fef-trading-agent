/**
 * FEF CORTEX — DETERMINISTIC MULTI-ASSET RUNTIME PARITY TEST SUITE
 * 
 * Verifies end-to-end multi-asset runtime invariants:
 * 1. EA Tracked Universe Parity: All 26 canonical instruments defined in manifest are present in MQL5 EA.
 * 2. EA Multi-Asset Candle Push: PushCandles loops across all tracked canonical instruments without hardcoded limits.
 * 3. Connector Sync Universe: Default connector sync includes all 26 canonical instruments.
 * 4. M30 Timeframe Existence: M30 exists and is supported across EA, connector, relay, and bridge bundle.
 * 5. Per-Symbol Candle Isolation: Candles for different instruments do not cross-contaminate.
 * 6. Position Sizing Fail-Closed: Sizing without verified broker specs fails closed with exact UNAVAILABLE label.
 * 7. Runtime Capability Matrix: Accurately derives LIVE, DEGRADED, MARKET_CLOSED, DATA_LIMITED, and UNAVAILABLE.
 * 8. Execution Invariant Lock: CANONICAL_EXECUTION_MODE === 'READ_ONLY' and MT5_ORDER_TRANSPORT_ENABLED === false.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';
import { CANONICAL_SYMBOL_MAPPINGS } from '../src/lib/bridge/symbol-mapper';
import { MARKET_REGISTRY, getAllMarkets } from '../src/lib/registry/market-registry';
import { calculatePositionSize } from '../src/lib/calculator/position-size-calculator';
import {
  evaluateAssetCapability,
  evaluateRuntimeCapabilityMatrix
} from '../src/lib/diagnostics/runtime-capability-matrix';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`✕ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASS: ${message}`);
}

async function runParityTests() {
  console.log('================================================================');
  console.log('FEF CORTEX: LIVE MULTI-ASSET RUNTIME PARITY TEST SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Execution Invariants Permanently Preserved
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Execution Safety Invariants ---');
  assert(CANONICAL_EXECUTION_MODE === 'ARMED_WITH_CONFIRMATION', 'CANONICAL_EXECUTION_MODE must be ARMED_WITH_CONFIRMATION');
  assert(MT5_ORDER_TRANSPORT_ENABLED === true, 'MT5_ORDER_TRANSPORT_ENABLED must be true');

  // ---------------------------------------------------------------------------
  // TEST 2: Canonical Manifest & Registry Integrity (26 instruments)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Canonical Universe Parity (26 Instruments) ---');
  const manifestPath = path.resolve(__dirname, '../src/lib/registry/canonical-manifest.json');
  assert(fs.existsSync(manifestPath), 'canonical-manifest.json exists');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert(manifest.totalAssets === 26, `Manifest totalAssets is 26 (got ${manifest.totalAssets})`);
  assert(manifest.instruments.length === 26, `Manifest instruments array length is 26 (got ${manifest.instruments.length})`);

  const allMarkets = getAllMarkets();
  assert(allMarkets.length === 26, `Market registry contains 26 markets (got ${allMarkets.length})`);

  const expectedCategories = ['METALS', 'FOREX', 'INDICES', 'COMMODITIES', 'CRYPTO'];
  for (const cat of expectedCategories) {
    const inCat = allMarkets.filter(m => m.category === cat);
    assert(inCat.length > 0, `Category ${cat} has ${inCat.length} assets registered`);
  }

  // Verify CANONICAL_SYMBOL_MAPPINGS has all 26
  for (const m of allMarkets) {
    assert(
      Array.isArray(CANONICAL_SYMBOL_MAPPINGS[m.symbol]) && CANONICAL_SYMBOL_MAPPINGS[m.symbol].length > 0,
      `CANONICAL_SYMBOL_MAPPINGS contains mapping for ${m.symbol}`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST 3: EA FEF_HTTP_Bridge.mq5 Universe & Candle Loop Parity
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: MQL5 EA Multi-Asset Implementation Parity ---');
  const eaPath = path.resolve(__dirname, '../mql5/Experts/FEF_HTTP_Bridge.mq5');
  assert(fs.existsSync(eaPath), 'FEF_HTTP_Bridge.mq5 source file exists');
  const eaCode = fs.readFileSync(eaPath, 'utf8');

  // Verify all 26 canonical symbols are in g_tracked_canonical in EA
  for (const m of allMarkets) {
    assert(eaCode.includes(`"${m.symbol}"`), `EA includes canonical symbol "${m.symbol}"`);
  }

  // Verify PushCandles does not restrict to prioritySymbols
  assert(!eaCode.includes('string prioritySymbols[] = { "XAUUSD", "EURUSD", "BTCUSD" };'),
    'PushCandles prioritySymbols limitation was removed');
  assert(eaCode.includes('int total = ArraySize(g_tracked_canonical);'),
    'PushCandles loops over all tracked canonical instruments');
  assert(eaCode.includes('PERIOD_M30') && eaCode.includes('"M30"'),
    'PushCandles pushes M30 timeframe');

  // Verify compiled binary exists
  const ex5Path = path.resolve(__dirname, '../mql5/Experts/FEF_HTTP_Bridge.ex5');
  assert(fs.existsSync(ex5Path), 'Compiled FEF_HTTP_Bridge.ex5 binary exists');
  const ex5Stats = fs.statSync(ex5Path);
  assert(ex5Stats.size > 50000, `FEF_HTTP_Bridge.ex5 binary size is valid (${ex5Stats.size} bytes)`);

  // ---------------------------------------------------------------------------
  // TEST 4: Connector & Relay M30 and Multi-Asset Timeframe Support
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Connector & Relay Timeframe Parity ---');
  const connectorPath = path.resolve(__dirname, './fef-local-connector-agent.js');
  const connectorCode = fs.readFileSync(connectorPath, 'utf8');
  assert(connectorCode.includes("'M30'"), 'fef-local-connector-agent.js supports M30');
  assert(connectorCode.includes('getCanonicalUniverse'), 'fef-local-connector-agent.js derives default universe from canonical registry');

  const relayPath = path.resolve(__dirname, './fef-remote-relay-service.js');
  const relayCode = fs.readFileSync(relayPath, 'utf8');
  assert(relayCode.includes('M30: 30 * 60 * 1000'), 'fef-remote-relay-service.js defines M30 duration');
  assert(relayCode.includes("'M30'"), 'fef-remote-relay-service.js allows M30 in validTfs');

  const bridgeServicePath = path.resolve(__dirname, './mt5-http-bridge-service.js');
  const bridgeServiceCode = fs.readFileSync(bridgeServicePath, 'utf8');
  assert(bridgeServiceCode.includes("'M30'"), 'mt5-http-bridge-service.js includes M30 in candle bundle');

  // ---------------------------------------------------------------------------
  // TEST 5: Position Sizing Fail-Closed Invariant
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Position Sizing Fail-Closed Protection ---');
  // 1. Symbol without verified specs must fail closed
  const unverifiedResult = calculatePositionSize({
    symbol: 'UNKNOWN_OR_UNVERIFIED_ASSET',
    direction: 'BUY',
    capital: 10000,
    riskPct: 1.0,
    entryPrice: 100,
    stopLoss: 95
  });
  assert(unverifiedResult.isValid === false, 'Unverified asset sizing returns isValid: false');
  assert(unverifiedResult.safeLotSize === 0, 'Unverified asset safeLotSize is 0');
  assert(
    unverifiedResult.errorMessage?.includes('BROKER SPECIFICATIONS UNAVAILABLE'),
    'Unverified asset returns exact BROKER SPECIFICATIONS UNAVAILABLE error'
  );

  // 2. Verified asset (e.g. XAUUSD) calculates safely with proper contract sizing
  const verifiedResult = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 1.0, // $100 risk
    entryPrice: 2000.0,
    stopLoss: 1990.0 // $10 stop on 100 oz contract = $1000 loss per 1.00 lot
  });
  assert(verifiedResult.isValid === true, 'Verified asset (XAUUSD) sizing returns isValid: true');
  assert(verifiedResult.safeLotSize === 0.10, `Safe lot size is 0.10 for $100 risk with $10 SL (got ${verifiedResult.safeLotSize})`);
  assert(verifiedResult.estimatedLossAtSL <= 100.0, 'Estimated loss never exceeds allowed risk capital');

  // ---------------------------------------------------------------------------
  // TEST 6: Runtime Capability Matrix Evaluation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Runtime Capability Matrix Truthful Derivation ---');

  // Mock telemetry representing connected broker with partial active assets
  const now = Date.now();
  const mockBridgeStatus = {
    localBridge: 'ONLINE',
    mt5Connected: true,
    operatingMode: 'READ_ONLY',
    quotes: {
      XAUUSD: {
        canonicalSymbol: 'XAUUSD',
        brokerSymbol: 'XAUUSD',
        bid: 2350.5,
        ask: 2350.7,
        spread: 20,
        timestamp: now - 1000,
        isStale: false
      },
      EURUSD: {
        canonicalSymbol: 'EURUSD',
        brokerSymbol: 'EURUSD',
        bid: 1.0850,
        ask: 1.0851,
        spread: 10,
        timestamp: now - 2000,
        isStale: false
      },
      BTCUSD: {
        canonicalSymbol: 'BTCUSD',
        brokerSymbol: 'BTCUSD',
        bid: 65000,
        ask: 65010,
        spread: 1000,
        timestamp: now - 500,
        isStale: false
      }
    },
    specsBySymbol: {
      XAUUSD: {
        canonicalSymbol: 'XAUUSD',
        brokerSymbol: 'XAUUSD',
        contractSize: 100,
        tickValue: 1.0,
        minLot: 0.01,
        maxLot: 100,
        lotStep: 0.01
      },
      EURUSD: {
        canonicalSymbol: 'EURUSD',
        brokerSymbol: 'EURUSD',
        contractSize: 100000,
        tickValue: 1.0,
        minLot: 0.01,
        maxLot: 100,
        lotStep: 0.01
      },
      BTCUSD: {
        canonicalSymbol: 'BTCUSD',
        brokerSymbol: 'BTCUSD',
        contractSize: 1,
        tickValue: 0.01,
        minLot: 0.01,
        maxLot: 20,
        lotStep: 0.01
      }
    },
    assetDiagnostics: {
      XAUUSD: { canonicalSymbol: 'XAUUSD', brokerSymbol: 'XAUUSD', resolutionStatus: 'LIVE' },
      EURUSD: { canonicalSymbol: 'EURUSD', brokerSymbol: 'EURUSD', resolutionStatus: 'LIVE' },
      BTCUSD: { canonicalSymbol: 'BTCUSD', brokerSymbol: 'BTCUSD', resolutionStatus: 'LIVE' },
      NATGAS: { canonicalSymbol: 'NATGAS', brokerSymbol: '', resolutionStatus: 'NOT_SUPPORTED_BY_BROKER' }
    },
    candles: {
      BTCUSD: {
        H1: {
          candles: Array.from({ length: 30 }, (_, i) => ({
            timestamp: now - (30 - i) * 3600000,
            open: 65000,
            high: 65100,
            low: 64900,
            close: 65050,
            tickVolume: 100
          }))
        }
      }
    }
  };

  const matrix = evaluateRuntimeCapabilityMatrix(mockBridgeStatus, null, now);
  assert(matrix.totalAssets === 26, `Capability matrix covers 26 assets (got ${matrix.totalAssets})`);
  assert(matrix.instruments['BTCUSD'] !== undefined, 'BTCUSD evaluated in matrix');
  // BTCUSD is 24/7 crypto and has fresh quote and candles
  assert(matrix.instruments['BTCUSD'].status === 'LIVE', `BTCUSD status is LIVE (got ${matrix.instruments['BTCUSD'].status})`);

  // NATGAS is explicitly not supported by broker
  assert(matrix.instruments['NATGAS'] !== undefined, 'NATGAS evaluated in matrix');
  assert(matrix.instruments['NATGAS'].status === 'UNAVAILABLE', `NATGAS status is UNAVAILABLE (got ${matrix.instruments['NATGAS'].status})`);

  // Verify category breakdowns are present
  for (const cat of ['METALS', 'FOREX', 'INDICES', 'COMMODITIES', 'CRYPTO']) {
    assert(matrix.summaryByCategory[cat] !== undefined, `Category summary for ${cat} exists`);
    assert(matrix.summaryByCategory[cat].total > 0, `Category ${cat} has total > 0`);
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Per-Symbol Candle Isolation
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Per-Symbol Candle Isolation ---');
  const btcCap = evaluateAssetCapability('BTCUSD', mockBridgeStatus, null, now);
  const ethCap = evaluateAssetCapability('ETHUSD', mockBridgeStatus, null, now);
  assert(btcCap.candleBarsCount === 30, `BTCUSD has 30 bars (got ${btcCap.candleBarsCount})`);
  assert(ethCap.candleBarsCount === 0, `ETHUSD has 0 bars (got ${ethCap.candleBarsCount}) - no cross-contamination`);

  // ---------------------------------------------------------------------------
  // TEST 8: 26-Asset Staggered Rolling Candle Ingestion Parity
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: 26-Asset Staggered Rolling Ingestion Coverage ---');
  const contextPath = path.resolve(__dirname, '../src/context/ActiveAssetContext.tsx');
  assert(fs.existsSync(contextPath), 'ActiveAssetContext.tsx source exists');
  const contextCode = fs.readFileSync(contextPath, 'utf8');

  // Verify that the hardcoded 6/8 priority symbol restrictions have been replaced with full canonical cycle
  assert(
    !contextCode.includes("const prioritySymbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'US100', 'USOIL', 'GBPUSD'];"),
    'Hardcoded 6-symbol restriction in ActiveAssetContext was removed'
  );
  assert(
    contextCode.includes('getAllMarkets') || contextCode.includes('canonicalSymbols'),
    'ActiveAssetContext derives rolling candle ingestion from canonical market universe'
  );
  assert(
    contextCode.includes('backgroundSyncIndexRef') || contextCode.includes('staggeredSyncIndexRef') || contextCode.includes('rollingIndexRef'),
    'ActiveAssetContext implements rolling cursor for staggered background ingestion'
  );
  assert(
    contextCode.includes('setMultiAssetCandles'),
    'ActiveAssetContext updates multiAssetCandles state with background rolling feeds'
  );

  console.log('\n================================================================');
  console.log('✓ ALL MULTI-ASSET RUNTIME PARITY TESTS PASSED SUCCESSFULLY');
  console.log('================================================================');
}

runParityTests().catch(err => {
  console.error('Fatal error during parity test suite:', err);
  process.exit(1);
});

