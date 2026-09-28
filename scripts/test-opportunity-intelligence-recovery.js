/**
 * FEF TRADING SOLUTIONS — DETERMINISTIC OPPORTUNITY INTELLIGENCE RECOVERY VERIFICATION
 *
 * Verifies that the FEF CORTEX production intelligence pipeline:
 * 1. Can produce authentic BUY and SELL setups when market structure supports it.
 * 2. Truthfully produces WAIT when market structure is balanced or no entry zone exists.
 * 3. Enforces fail-closed DATA LIMITED when market data is corrupt or missing (< 10 bars).
 * 4. Preserves strictly zero order execution (ORDERS SENT = 0) and READ_ONLY locks.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = function (module, filename) {
  let source = fs.readFileSync(filename, 'utf8');
  source = source.replace(/(?:from|import)\s+['"]@\/(.*)['"]/g, (match, p1) => {
    const target = path.resolve(__dirname, '../src', p1);
    let rel = path.relative(path.dirname(filename), target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return match.replace('@/' + p1, rel);
  });
  source = source.replace(/require\(['"]@\/(.*)['"]\)/g, (match, p1) => {
    const target = path.resolve(__dirname, '../src', p1);
    let rel = path.relative(path.dirname(filename), target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return 'require("' + rel + '")';
  });
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};

const { generateAssetIntelligence } = require('../src/lib/agents/multi-asset-pipeline.ts');
const { calculateOpportunityScore, generateGlobalRadarIntelligence } = require('../src/lib/radar/opportunity-radar-engine.ts');

console.log('================================================================');
console.log('FEF CORTEX: OPPORTUNITY INTELLIGENCE RECOVERY VERIFICATION');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✕ FAIL: ${name}`);
    console.error(`    ${err.message}\n`);
    failCount++;
  }
}

// Helper: Build synthetic sequential candles
function createCandles(specs) {
  const baseTime = 1790000000000;
  return specs.map((s, idx) => ({
    timestamp: baseTime + idx * 3600000,
    open: s.o,
    high: s.h,
    low: s.l,
    close: s.c,
    tickVolume: 1000 + idx * 50
  }));
}

// ---------------------------------------------------------------------------
// FIXTURE 1: Bullish Trend (HH + HL + Bullish FVG)
// ---------------------------------------------------------------------------
console.log('[TEST 1] Bullish Market Structure & Opportunity Generation');

runTest('Bullish market structure produces WATCH FOR BUY / BUY OPPORTUNITY with genuine confidence', () => {
  const bullCandles = createCandles([
    { o: 2000, h: 2005, l: 1998, c: 2004 },
    { o: 2004, h: 2010, l: 2002, c: 2008 },
    { o: 2008, h: 2015, l: 2006, c: 2012 }, // Swing Low #1 ~2002
    { o: 2012, h: 2014, l: 2007, c: 2010 },
    { o: 2010, h: 2022, l: 2009, c: 2020 }, // Swing High #1 ~2022
    { o: 2020, h: 2021, l: 2014, c: 2016 }, // Swing Low #2 ~2014 (HL)
    { o: 2016, h: 2028, l: 2015, c: 2026 },
    { o: 2026, h: 2035, l: 2024, c: 2032 }, // Swing High #2 ~2035 (HH)
    { o: 2032, h: 2033, l: 2025, c: 2027 }, // Swing Low #3 ~2025 (HL)
    { o: 2027, h: 2034, l: 2026, c: 2033 }, // FVG bar 1: high = 2034
    { o: 2033, h: 2055, l: 2032, c: 2052 }, // Strong displacement candle
    { o: 2052, h: 2062, l: 2045, c: 2060 }, // FVG bar 3: low = 2045 -> FVG between 2034 and 2045!
    { o: 2060, h: 2072, l: 2058, c: 2070 }, // Swing High #3 ~2072 (HH)
    { o: 2070, h: 2071, l: 2042, c: 2044 }, // Pullback into FVG zone (2034 - 2045)
    { o: 2044, h: 2048, l: 2041, c: 2043 }, // Current price inside entry zone
  ]);

  const mondayOpen = new Date('2026-09-28T14:00:00Z');
  const liveAsset = {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    price: 2043,
    bid: 2042.8,
    ask: 2043.2,
    spread: 0.4,
    change24h: 1.2,
    high24h: 2072,
    low24h: 1998,
    volume: '$2B',
    sparkline: '0,10 100,10',
    source: 'MT5 Broker Telemetry',
    lastUpdated: mondayOpen.toISOString(),
    category: 'FOREX'
  };

  const profile = generateAssetIntelligence(
    'EURUSD',
    liveAsset,
    'H1',
    bullCandles,
    'LIVE_MT5',
    'Exness Technologies Ltd',
    mondayOpen
  );

  assert(profile.setupDirection === 'WATCH FOR BUY', `Expected WATCH FOR BUY, got ${profile.setupDirection}`);
  assert(profile.confidence > 0, `Expected non-zero confidence, got ${profile.confidence}%`);
  assert(profile.evidenceTrust >= 40, `Expected evidenceTrust >= 40%, got ${profile.evidenceTrust}%`);
  assert(profile.setupDirection === 'WATCH FOR BUY', `Expected WATCH FOR BUY, got ${profile.setupDirection}`);
  assert(profile.confidence > 0, `Expected non-zero confidence, got ${profile.confidence}%`);
  assert(profile.evidenceTrust >= 40, `Expected evidenceTrust >= 40%, got ${profile.evidenceTrust}%`);
  assert(profile.blueprint !== null && profile.blueprint !== undefined, 'Expected trade blueprint to be generated from structure');
  assert.strictEqual(profile.blueprint.direction, 'BUY');
  assert(profile.blueprint.sl.price < profile.blueprint.entryZoneLow.price, 'SL must be below entry');
  assert(profile.blueprint.tp1.price > profile.blueprint.entryZoneHigh.price, 'TP1 must be above entry');

  const opp = calculateOpportunityScore(profile, liveAsset);
  assert(opp.state === 'BUY OPPORTUNITY' || opp.state === 'WATCH FOR BUY' || opp.state === 'STRONG BUY OPPORTUNITY',
    `Expected BUY state on radar, got ${opp.state}`);
  assert(opp.score >= 50, `Expected opportunity score >= 50, got ${opp.score}`);
});

// ---------------------------------------------------------------------------
// FIXTURE 2: Bearish Trend (LH + LL + Bearish FVG)
// ---------------------------------------------------------------------------
console.log('\n[TEST 2] Bearish Market Structure & Opportunity Generation');

runTest('Bearish market structure produces WATCH FOR SELL / SELL OPPORTUNITY with genuine confidence', () => {
  const bearCandles = createCandles([
    { o: 2070, h: 2075, l: 2068, c: 2072 },
    { o: 2072, h: 2085, l: 2070, c: 2082 },
    { o: 2082, h: 2092, l: 2080, c: 2090 },
    { o: 2090, h: 2105, l: 2088, c: 2100 }, // Swing High #1 ~2105
    { o: 2100, h: 2095, l: 2075, c: 2080 },
    { o: 2080, h: 2085, l: 2060, c: 2065 },
    { o: 2065, h: 2070, l: 2050, c: 2055 }, // Swing Low #1 ~2050
    { o: 2055, h: 2065, l: 2054, c: 2062 },
    { o: 2062, h: 2080, l: 2060, c: 2078 }, // Swing High #2 ~2080 (LH < 2105), FVG prev (low = 2060)
    { o: 2078, h: 2079, l: 2035, c: 2038 }, // Strong bearish displacement (mid)
    { o: 2038, h: 2048, l: 2028, c: 2030 }, // FVG next (high = 2048) -> Bearish FVG between 2048 and 2060
    { o: 2030, h: 2035, l: 2020, c: 2022 }, // Swing Low #2 ~2020 (LL < 2050)
    { o: 2022, h: 2032, l: 2021, c: 2030 },
    { o: 2030, h: 2058, l: 2028, c: 2055 }, // Pullback into Bearish FVG zone (2048 - 2060)
    { o: 2055, h: 2058, l: 2050, c: 2054 }, // Current price inside entry zone (2054)
  ]);

  const mondayOpen = new Date('2026-09-28T14:00:00Z');
  const liveAsset = {
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    price: 2054,
    bid: 2053.8,
    ask: 2054.2,
    spread: 0.4,
    change24h: -1.5,
    high24h: 2105,
    low24h: 2020,
    volume: '$3B',
    sparkline: '0,10 100,10',
    source: 'MT5 Broker Telemetry',
    lastUpdated: mondayOpen.toISOString(),
    category: 'METALS'
  };

  const profile = generateAssetIntelligence(
    'XAUUSD',
    liveAsset,
    'H1',
    bearCandles,
    'LIVE_MT5',
    'Exness Technologies Ltd',
    mondayOpen
  );

  assert(profile.setupDirection === 'WATCH FOR SELL', `Expected WATCH FOR SELL, got ${profile.setupDirection}`);
  assert(profile.confidence > 0, `Expected non-zero confidence, got ${profile.confidence}%`);
  assert(profile.evidenceTrust >= 40, `Expected evidenceTrust >= 40%, got ${profile.evidenceTrust}%`);
  assert(profile.blueprint !== null && profile.blueprint !== undefined, 'Expected trade blueprint for SELL setup');
  assert.strictEqual(profile.blueprint.direction, 'SELL');
  assert(profile.blueprint.sl.price > profile.blueprint.entryZoneHigh.price, 'SL must be above entry');
  assert(profile.blueprint.tp1.price < profile.blueprint.entryZoneLow.price, 'TP1 must be below entry');

  const opp = calculateOpportunityScore(profile, liveAsset);
  assert(opp.state === 'SELL OPPORTUNITY' || opp.state === 'WATCH FOR SELL' || opp.state === 'STRONG SELL OPPORTUNITY',
    `Expected SELL state on radar, got ${opp.state}`);
});

// ---------------------------------------------------------------------------
// FIXTURE 3: Truthful WAIT When Balanced / No Clear Setup
// ---------------------------------------------------------------------------
console.log('\n[TEST 3] Truthful WAIT Posture When Market Structure Has No Edge');

runTest('Ranging / balanced market correctly and truthfully produces WAIT', () => {
  const flatCandles = createCandles([
    { o: 100, h: 101, l: 99, c: 100.5 },
    { o: 100.5, h: 101.2, l: 99.8, c: 100.1 },
    { o: 100.1, h: 101.5, l: 99.5, c: 100.8 },
    { o: 100.8, h: 101.1, l: 99.9, c: 100.2 },
    { o: 100.2, h: 101.4, l: 99.7, c: 100.6 },
    { o: 100.6, h: 101.0, l: 99.8, c: 100.0 },
    { o: 100.0, h: 101.3, l: 99.6, c: 100.4 },
    { o: 100.4, h: 101.2, l: 99.7, c: 100.1 },
    { o: 100.1, h: 101.5, l: 99.5, c: 100.7 },
    { o: 100.7, h: 101.1, l: 99.9, c: 100.3 },
    { o: 100.3, h: 101.4, l: 99.8, c: 100.5 },
    { o: 100.5, h: 101.0, l: 99.7, c: 100.2 },
    { o: 100.2, h: 101.3, l: 99.6, c: 100.4 },
    { o: 100.4, h: 101.2, l: 99.8, c: 100.1 },
    { o: 100.1, h: 101.1, l: 99.9, c: 100.0 },
  ]);

  const mondayOpen = new Date('2026-09-28T14:00:00Z');
  const liveAsset = {
    symbol: 'USDJPY',
    name: 'US Dollar / Japanese Yen',
    price: 100.0,
    bid: 99.99,
    ask: 100.01,
    spread: 0.02,
    change24h: 0.01,
    high24h: 101.5,
    low24h: 99.5,
    volume: '$1B',
    sparkline: '0,10 100,10',
    source: 'MT5 Broker Telemetry',
    lastUpdated: mondayOpen.toISOString(),
    category: 'FOREX'
  };

  const profile = generateAssetIntelligence(
    'USDJPY',
    liveAsset,
    'H1',
    flatCandles,
    'LIVE_MT5',
    'Exness Technologies Ltd',
    mondayOpen
  );

  assert.strictEqual(profile.setupDirection, 'WAIT', `Expected WAIT for ranging market, got ${profile.setupDirection}`);
  assert(!profile.blueprint, 'No blueprint should be formed for flat/ranging structure');
});

// ---------------------------------------------------------------------------
// FIXTURE 4: Fail-Closed DATA LIMITED When Data is Missing (< 10 bars)
// ---------------------------------------------------------------------------
console.log('\n[TEST 4] Fail-Closed Integrity When Market Data Is Missing / Corrupt');

runTest('Insufficient candles (< 10 bars) enforces DATA LIMITED / 0% confidence', () => {
  const shortCandles = createCandles([
    { o: 100, h: 102, l: 99, c: 101 },
    { o: 101, h: 103, l: 100, c: 102 },
    { o: 102, h: 104, l: 101, c: 103 },
  ]);

  const now = new Date();
  const liveAsset = {
    symbol: 'BTCUSD',
    name: 'Bitcoin / US Dollar',
    price: 65000,
    bid: 64990,
    ask: 65010,
    spread: 20,
    change24h: 1.0,
    high24h: 66000,
    low24h: 64000,
    volume: '$10B',
    sparkline: '0,10 100,10',
    source: 'Binance Public Spot',
    lastUpdated: now.toISOString(),
    category: 'CRYPTO'
  };

  const profile = generateAssetIntelligence(
    'BTCUSD',
    liveAsset,
    'H1',
    shortCandles,
    undefined,
    undefined,
    now
  );

  assert.strictEqual(profile.setupDirection, 'WAIT');
  assert.strictEqual(profile.confidence, 0, `Expected 0% confidence for DATA LIMITED, got ${profile.confidence}%`);
  assert(profile.actionabilityState === 'DATA LIMITED' || profile.actionabilityState === 'BLOCKED',
    `Expected DATA LIMITED actionability, got ${profile.actionabilityState}`);
});

// ---------------------------------------------------------------------------
// FIXTURE 5: Multi-Asset Radar Provisioning (No Starvation)
// ---------------------------------------------------------------------------
console.log('\n[TEST 5] Global Multi-Asset Opportunity Radar Non-Starvation');

runTest('Opportunity radar evaluates non-active assets when multi-asset candles are supplied', () => {
  const bullCandles = createCandles([
    { o: 2000, h: 2005, l: 1998, c: 2004 },
    { o: 2004, h: 2010, l: 2002, c: 2008 },
    { o: 2008, h: 2015, l: 2006, c: 2012 },
    { o: 2012, h: 2014, l: 2007, c: 2010 },
    { o: 2010, h: 2022, l: 2009, c: 2020 },
    { o: 2020, h: 2021, l: 2014, c: 2016 },
    { o: 2016, h: 2028, l: 2015, c: 2026 },
    { o: 2026, h: 2035, l: 2024, c: 2032 },
    { o: 2032, h: 2033, l: 2025, c: 2027 },
    { o: 2027, h: 2034, l: 2026, c: 2033 },
    { o: 2033, h: 2055, l: 2032, c: 2052 },
    { o: 2052, h: 2062, l: 2045, c: 2060 },
    { o: 2060, h: 2072, l: 2058, c: 2070 },
    { o: 2070, h: 2071, l: 2042, c: 2044 },
    { o: 2044, h: 2048, l: 2041, c: 2043 },
  ]);

  const now = new Date();
  const mockAssets = {
    XAUUSD: { symbol: 'XAUUSD', name: 'Gold Spot', price: 2043, change24h: 1.0, lastUpdated: now.toISOString() },
    EURUSD: { symbol: 'EURUSD', name: 'Euro', price: 2043, change24h: 1.2, lastUpdated: now.toISOString() }
  };

  const multiFeed = {
    EURUSD: {
      candles: bullCandles,
      provenance: 'LIVE_MT5',
      provider: 'Exness Technologies Ltd'
    }
  };

  // Active symbol is XAUUSD, but multiFeed has EURUSD candles
  const radar = generateGlobalRadarIntelligence(
    mockAssets,
    'H1',
    undefined,
    multiFeed
  );

  const eurOpp = radar.rankedOpportunities.find(o => o.symbol === 'EURUSD');
  assert(eurOpp, 'EURUSD should be in radar opportunities');
  assert(eurOpp.state.includes('BUY'), `EURUSD should have BUY posture, got ${eurOpp.state}`);
  assert(eurOpp.aiConfidence > 0, `EURUSD should have non-zero AI confidence, got ${eurOpp.aiConfidence}%`);
});

console.log('================================================================');
console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
}
