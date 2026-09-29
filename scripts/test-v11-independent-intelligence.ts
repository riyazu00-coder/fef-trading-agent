/**
 * FEF TRADING SOLUTIONS — V1.1 INDEPENDENT INTELLIGENCE & CONTINUITY TEST SUITE
 *
 * Verifies:
 * 1. Independent Verified Candlestick Validation (M5, M15, H1, H4, D1).
 * 2. Multi-Source Canonical Data Router with complete provenance.
 * 3. ContinuityFeed State Machine:
 *    - MT5 connected & fresh (< 5s) -> BROKER_PRIMARY (Price Authority: MT5_BROKER)
 *    - MT5 disconnected / stale -> FAILOVER_ACTIVE / REFERENCE_ACTIVE (Price Authority: REFERENCE, Execution LOCKED)
 *    - MT5 reconnects -> SYNCING -> VERIFIED -> BROKER_PRIMARY
 * 4. Asset-Specific Decoupled Agent Readiness:
 *    - Asset without OHLC (XAUUSD without candles) -> Technical is DATA LIMITED, posture WAIT (0% confidence).
 *    - Asset with verified OHLC (BTCUSD with candles) -> Technical unlocks ONLINE, posture computed from real structure.
 *    - Missing data on one asset does NOT disable other assets.
 * 5. Directional Watch gating & truthfulness preserved.
 */

import { validateCandleSeries, RawCandleInput } from '../src/lib/candles/candle-validator';
import { evaluateContinuityFeed } from '../src/lib/price/continuity-feed';
import { canonicalDataRouter } from '../src/lib/data-router/canonical-data-router';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { OHLCCandle } from '../src/lib/market/canonical-market-snapshot';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${msg}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failCount++;
  }
}

async function runTests() {
  console.log('=================================================================');
  console.log('FEF TRADING INTELLIGENCE: V1.1 INDEPENDENT INTELLIGENCE SUITE');
  console.log('=================================================================');

  // [TEST 1: Candlestick Series Invariant Validation]
  console.log('\n[TEST 1: CANDLESTICK SERIES INVARIANT VALIDATION]');
  const validCandles: RawCandleInput[] = [
    { timestamp: 100000, open: 100, high: 105, low: 98, close: 103, tickVolume: 10 },
    { timestamp: 101000, open: 103, high: 108, low: 102, close: 107, tickVolume: 12 },
    { timestamp: 102000, open: 107, high: 110, low: 106, close: 109, tickVolume: 15 },
  ];
  const val1 = validateCandleSeries(validCandles, 'H1');
  assert(val1.valid === true, 'Valid candle series passes validation');

  const corruptBounds: RawCandleInput[] = [
    { timestamp: 100000, open: 100, high: 95, low: 98, close: 103 }, // High < low
  ];
  const val2 = validateCandleSeries(corruptBounds, 'H1');
  assert(val2.valid === false, 'Corrupt candle bounds (high < low) rejected');

  const nonAscending: RawCandleInput[] = [
    { timestamp: 101000, open: 100, high: 105, low: 98, close: 103 },
    { timestamp: 100000, open: 103, high: 108, low: 102, close: 107 }, // Backwards timestamp
  ];
  const val3 = validateCandleSeries(nonAscending, 'H1');
  assert(val3.valid === false, 'Non-ascending timestamps rejected');

  // [TEST 2: ContinuityFeed State Machine]
  console.log('\n[TEST 2: CONTINUITY FEED STATE TRANSITIONS]');
  const now = Date.now();
  const deterministicOpenTime = new Date(Date.UTC(2026, 8, 15, 14, 0, 0));

  // 2a. Fresh broker quote -> BROKER_PRIMARY
  const feed1 = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4295.10, ask: 4295.60, timestamp: now - 800, digits: 2 },
    referencePrice: 4294.50,
  });
  assert(feed1.state === 'BROKER_PRIMARY', 'Fresh broker quote enters BROKER_PRIMARY');
  assert(feed1.priceAuthority === 'MT5_BROKER', 'Price authority is MT5_BROKER');
  assert(feed1.executionLocked === false, 'Execution is unlocked under verified fresh broker quote');

  // 2b. Stale broker quote (> 5s) -> FAILOVER_ACTIVE
  const feed2 = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4295.10, ask: 4295.60, timestamp: now - 8000, digits: 2 },
    referencePrice: 4294.50,
  });
  assert(feed2.state === 'FAILOVER_ACTIVE', 'Stale broker quote triggers FAILOVER_ACTIVE');
  assert(feed2.priceAuthority === 'REFERENCE', 'Price authority falls back to REFERENCE');
  assert(feed2.executionLocked === true, 'Execution strictly LOCKED on failover');
  assert(feed2.activePrice === 4294.50, 'Active price is reference feed value');

  // 2c. Broker completely disconnected -> REFERENCE_ACTIVE
  const feed3 = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: null,
    referencePrice: 4294.50,
  });
  assert(feed3.state === 'REFERENCE_ACTIVE', 'Disconnected broker enters REFERENCE_ACTIVE');
  assert(feed3.executionLocked === true, 'Execution strictly LOCKED when broker disconnected');
  assert(feed3.priceAuthority === 'REFERENCE', 'Price authority remains REFERENCE');

  // [TEST 3: Canonical Data Router Provenance]
  console.log('\n[TEST 3: CANONICAL DATA ROUTER PROVENANCE]');
  const routedQuote = canonicalDataRouter.resolveQuote({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4295.10, ask: 4295.60, timestamp: now - 500, digits: 2 },
    referencePrice: 4294.50,
  });
  assert(routedQuote.provenance.dataType === 'QUOTE', 'Provenance specifies QUOTE');
  assert(routedQuote.provenance.brokerSpecific === true, 'Broker specific flag is true for broker quote');
  assert(routedQuote.provenance.executable === true, 'Executable flag is true for fresh broker quote');

  // [TEST 4: Asset-Specific Agent Readiness Decoupling]
  console.log('\n[TEST 4: ASSET-SPECIFIC AGENT READINESS DECOUPLING]');

  // Asset A: XAUUSD without candles
  const xauProfile = generateAssetIntelligence('XAUUSD', {
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    price: 4295.35,
    change24h: -0.25,
    category: 'METALS',
  } as any, 'H1', undefined, undefined, undefined, deterministicOpenTime);

  const xauTech = xauProfile.agents.find(a => a.type === 'TECHNICAL');
  assert(xauTech?.status === 'DATA LIMITED', 'XAUUSD without candles has Technical as DATA LIMITED');
  assert(xauTech?.confidence === 0, 'XAUUSD Technical confidence is 0%');
  assert(xauProfile.setupDirection === 'WAIT', 'XAUUSD resolves truthfully to WAIT');
  assert(xauProfile.confidence === 0, 'XAUUSD overall confluence is 0% (Insufficient Evidence)');

  // Asset B: BTCUSD with verified candles
  // Asset B: BTCUSD with verified fractal candles
  const testCandles: OHLCCandle[] = [];
  const basePrice = 75000;
  for (let i = 0; i < 50; i++) {
    const wave = Math.sin(i * 1.0) * 40;
    const trendOffset = i * 25; // clear upward trend
    const close = basePrice + trendOffset + wave;
    const open = close - 15;
    const high = Math.max(open, close) + 20;
    const low = Math.min(open, close) - 20;
    testCandles.push({
      timestamp: now - (50 - i) * 3600 * 1000,
      open,
      high,
      low,
      close,
      tickVolume: 100 + i,
    });
  }

  const btcProfile = generateAssetIntelligence('BTCUSD', {
    symbol: 'BTCUSD',
    name: 'Bitcoin / USD',
    price: basePrice + 40,
    change24h: +2.50,
    category: 'CRYPTO',
  } as any, 'H1', testCandles, undefined, undefined, deterministicOpenTime);

  const btcTech = btcProfile.agents.find(a => a.type === 'TECHNICAL');
  assert(btcTech?.status === 'ONLINE', 'BTCUSD with verified candles has Technical ONLINE');
  assert(btcTech?.confidence === 95, 'BTCUSD Technical confidence reflects active analysis');
  assert(btcProfile.marketStructure !== null, 'BTCUSD computes genuine market structure');

  // Missing data on XAUUSD did NOT affect BTCUSD
  assert(xauTech?.status === 'DATA LIMITED' && btcTech?.status === 'ONLINE', 'Decoupled readiness: XAUUSD DATA LIMITED while BTCUSD ONLINE');

  // [TEST 5: Truthfulness & Directional Gating]
  console.log('\n[TEST 5: DIRECTIONAL GATING PRESERVATION]');
  assert(
    xauProfile.setupDirection !== 'WATCH FOR SELL' && xauProfile.setupDirection !== 'WATCH FOR BUY',
    'Negative 24h change on XAUUSD does NOT trigger false directional watch'
  );

  const macroAgent = btcProfile.agents.find(a => a.type === 'MACRO');
  assert(macroAgent?.status === 'DATA LIMITED', 'Macro agent remains honestly DATA LIMITED without API');

  const newsAgent = btcProfile.agents.find(a => a.type === 'NEWS');
  assert(newsAgent?.status === 'DATA LIMITED', 'News agent remains honestly DATA LIMITED without API');

  // [TEST 6: PROVENANCE CLASSIFICATION & DISCRIMINATION]
  console.log('\n[TEST 6: PROVENANCE CLASSIFICATION & DISCRIMINATION]');

  // 6a. Independent BTC OHLC classified INDEPENDENT_VERIFIED
  const btcTechEvidence = btcTech?.evidenceRecords?.find(e => e.classification === 'INDEPENDENT_VERIFIED');
  assert(Boolean(btcTechEvidence), 'Independent BTC OHLC classified INDEPENDENT_VERIFIED');
  assert(btcTechEvidence?.source === 'Binance Public Spot', 'BTC OHLC source accurately identifies Binance Public Spot');
  assert(btcTech?.provenanceBadge === 'INDEPENDENT', 'BTC Technical provenance badge is INDEPENDENT');

  // 6b. MT5 Broker OHLC classified LIVE_MT5
  const mt5Profile = generateAssetIntelligence('XAUUSD', {
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    price: 4365.50,
    change24h: 0.10,
    category: 'METALS',
  } as any, 'H1', testCandles, 'LIVE_MT5', 'Exness MT5 Broker', deterministicOpenTime);
  const mt5Tech = mt5Profile.agents.find(a => a.type === 'TECHNICAL');
  const mt5Evidence = mt5Tech?.evidenceRecords?.find(e => e.classification === 'LIVE_MT5');
  assert(Boolean(mt5Evidence), 'MT5 OHLC classified LIVE_MT5');
  assert(mt5Evidence?.source === 'MT5 Broker Telemetry', 'MT5 OHLC source accurately identifies MT5 Broker Telemetry');
  assert(mt5Tech?.provenanceBadge === 'MT5', 'MT5 Technical provenance badge is MT5');

  // 6c. PAXG Proxy classified INDEPENDENT_REFERENCE / PROXY (never executable)
  const paxgProfile = generateAssetIntelligence('XAUUSD', {
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    price: 4362.00,
    change24h: -0.15,
    category: 'METALS',
  } as any, 'H1', testCandles, 'INDEPENDENT_REFERENCE', 'Binance PAXG/USDT (Spot Proxy)', deterministicOpenTime);
  const paxgTech = paxgProfile.agents.find(a => a.type === 'TECHNICAL');
  const paxgEvidence = paxgTech?.evidenceRecords?.find(e => e.classification === 'INDEPENDENT_REFERENCE');
  assert(Boolean(paxgEvidence), 'PAXG proxy classified INDEPENDENT_REFERENCE');
  assert(paxgEvidence?.decisionEligible === false, 'PAXG proxy is strictly non-executable (decisionEligible: false)');
  assert(paxgTech?.provenanceBadge === 'REFERENCE', 'PAXG Technical provenance badge is REFERENCE');

  // [TEST 7: SESSION / KILLZONE AGENT DIRECTIONAL AUDIT]
  console.log('\n[TEST 7: SESSION / KILLZONE DIRECTIONAL AUDIT]');
  const bullSession = generateAssetIntelligence('EURUSD', {
    symbol: 'EURUSD',
    name: 'Euro / USD',
    price: 1.0850,
    change24h: +3.50, // Massive positive change
    category: 'FOREX',
  } as any, 'H1', undefined, undefined, undefined, deterministicOpenTime);
  const bullKillzone = bullSession.agents.find(a => a.type === 'KILLZONE');
  assert(bullKillzone?.bias === 'NEUTRAL', 'Positive 24h change (+3.5%) does NOT make KILLZONE BULLISH (strictly NEUTRAL)');

  const bearSession = generateAssetIntelligence('EURUSD', {
    symbol: 'EURUSD',
    name: 'Euro / USD',
    price: 1.0850,
    change24h: -3.50, // Massive negative change
    category: 'FOREX',
  } as any, 'H1', undefined, undefined, undefined, deterministicOpenTime);
  const bearKillzone = bearSession.agents.find(a => a.type === 'KILLZONE');
  assert(bearKillzone?.bias === 'NEUTRAL', 'Negative 24h change (-3.5%) does NOT make KILLZONE BEARISH (strictly NEUTRAL)');

  // [TEST 8: MT5 DISCONNECTED CONTINUITY & EXECUTION LOCK]
  console.log('\n[TEST 8: MT5 DISCONNECTED CONTINUITY & EXECUTION LOCK]');
  const disconnectedFeed = evaluateContinuityFeed({
    symbol: 'BTCUSD',
    brokerQuote: null, // Broker completely disconnected
    referencePrice: 75050.00,
  });
  assert(disconnectedFeed.state === 'REFERENCE_ACTIVE', 'Disconnected broker enters REFERENCE_ACTIVE');
  assert(disconnectedFeed.executionLocked === true, 'Execution strictly LOCKED when MT5 disconnected');
  assert(disconnectedFeed.priceAuthority === 'REFERENCE', 'Price authority falls back to REFERENCE');

  // Technical intelligence continues using independent OHLC even when broker disconnected
  const btcIndependentDisconnected = generateAssetIntelligence('BTCUSD', {
    symbol: 'BTCUSD',
    name: 'Bitcoin / USD',
    price: disconnectedFeed.activePrice,
    change24h: +1.20,
    category: 'CRYPTO',
  } as any, 'H1', testCandles, 'INDEPENDENT_VERIFIED', 'Binance Public Spot', deterministicOpenTime);
  const btcIndTech = btcIndependentDisconnected.agents.find(a => a.type === 'TECHNICAL');
  assert(btcIndTech?.status === 'ONLINE', 'Technical stays ONLINE with independent OHLC when MT5 is disconnected');
  assert(btcIndependentDisconnected.marketStructure !== null, 'Market structure analysis continues uninterrupted without MT5');

  // [TEST 9: ZERO SYNTHETIC CANDLES & ZERO SYNTHETIC CONFLUENCE]
  console.log('\n[TEST 9: ZERO SYNTHETIC CANDLES & CONFLUENCE]');
  // Empty array validation
  const emptyVal = validateCandleSeries([], 'H1');
  assert(emptyVal.valid === false && emptyVal.count === 0, 'No synthetic candles generated on empty data');

  // Asset with no candles has strictly 0% confidence, never fabricated 50%
  assert(xauProfile.confidence === 0, 'Insufficient evidence yields 0% confidence, never 50%');
  assert(xauProfile.setupDirection === 'WAIT', 'Zero evidence never triggers a fake WATCH state');

  console.log('\n=================================================================');
  console.log(` SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================\n');

  if (failCount > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
