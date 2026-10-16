/**
 * FEF TRADING SOLUTIONS — PHASE 2 REFERENCE CONTINUITY ACCEPTANCE SUITE
 * Validates:
 * 1. Test A: MT5 Online (authority = MT5_BROKER)
 * 2. Test B: MT5 Offline / Stale (authority = REFERENCE_MARKET, spread UNAVAILABLE, fail closed)
 * 3. Test C: MT5 Recovery (automatic return to MT5_BROKER with anti-flap hysteresis)
 * 4. Multi-Asset: XAUUSD, EURUSD, BTCUSD, US100, USOIL, GER40 (GER40 fails closed)
 * 5. Execution safety: strictly locked / non-executable
 */

import assert from 'assert';
import { evaluateContinuityFeed } from '../src/lib/price/continuity-feed';
import { canonicalDataRouter } from '../src/lib/data-router/canonical-data-router';
import { evaluateConnectivityStatus } from '../src/lib/bridge/connectivity-policy';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { RawCandleInput } from '../src/lib/candles/candle-validator';

async function runAcceptance() {
  console.log('=================================================================');
  console.log('FEF CORTEX — PHASE 2 REFERENCE CONTINUITY ACCEPTANCE SUITE');
  console.log('=================================================================\n');

  const now = Date.now();
  const testCandles: RawCandleInput[] = [];
  const basePrice = 4180;
  for (let i = 0; i < 50; i++) {
    const wave = Math.sin(i * 1.0) * 10;
    const trendOffset = i * 2;
    const close = basePrice + trendOffset + wave;
    const open = close - 3;
    const high = Math.max(open, close) + 5;
    const low = Math.min(open, close) - 5;
    testCandles.push({
      timestamp: now - (50 - i) * 3600 * 1000,
      open,
      high,
      low,
      close,
      tickVolume: 100 + i,
    });
  }

  // -------------------------------------------------------------
  // TEST A: MT5 ONLINE
  // -------------------------------------------------------------
  console.log('[TEST A: MT5 ONLINE]');
  const feedOnline = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4193.50, ask: 4193.54, timestamp: now - 500, digits: 2, spread: 40 },
    referencePrice: 4195.00,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(feedOnline.state, 'BROKER_PRIMARY', 'State must be BROKER_PRIMARY');
  assert.strictEqual(feedOnline.priceAuthority, 'MT5_BROKER', 'Price authority must be MT5_BROKER');
  assert.strictEqual(feedOnline.bid, 4193.50, 'Broker bid must be genuine');
  assert.strictEqual(feedOnline.ask, 4193.54, 'Broker ask must be genuine');
  assert.strictEqual(feedOnline.spread, 0.04, 'Broker spread must be genuine');
  assert.strictEqual(feedOnline.brokerConnected, true, 'Broker must be connected');
  console.log('  ✓ Price authority is MT5_BROKER');
  console.log('  ✓ Genuine broker bid/ask/spread verified (4193.50 / 4193.54, spread 0.04 USD)');

  // Router evaluation
  const routedOnline = canonicalDataRouter.resolveQuote({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4193.50, ask: 4193.54, timestamp: now - 500, digits: 2 },
    referencePrice: 4195.00,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(routedOnline.provenance.sourceType, 'BROKER_DIRECT');
  assert.strictEqual(routedOnline.provenance.brokerSpecific, true);
  console.log('  ✓ Data router maps QUOTE with BROKER_DIRECT provenance');

  // -------------------------------------------------------------
  // TEST B: MT5 OFFLINE / STALE
  // -------------------------------------------------------------
  console.log('\n[TEST B: MT5 OFFLINE / STALE]');
  const feedOffline = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: null,
    referencePrice: 4199.50,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(feedOffline.state, 'REFERENCE_ACTIVE', 'State must be REFERENCE_ACTIVE');
  assert.strictEqual(feedOffline.priceAuthority, 'REFERENCE_MARKET', 'Price authority must be REFERENCE_MARKET');
  assert.strictEqual(feedOffline.activePrice, 4199.50, 'Active price is fresh reference price');
  assert.strictEqual(feedOffline.spread, 0, 'Broker spread is not fabricated in reference mode');
  assert.strictEqual(feedOffline.executionLocked, true, 'Execution is strictly locked in reference mode');
  console.log('  ✓ Price authority successfully transitioned to REFERENCE_MARKET');
  console.log('  ✓ Fresh reference price 4199.50 active from Gold-API Live (Verified)');
  console.log('  ✓ Execution strictly locked (executionLocked = true)');

  // Technical intelligence continues using independent OHLC
  const intelOffline = generateAssetIntelligence('XAUUSD', {
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    price: feedOffline.activePrice,
    change24h: 0.15,
    category: 'METALS',
  } as any, 'H1', testCandles, 'INDEPENDENT_VERIFIED', 'Binance PAXG/USDT Proxy', new Date(now));
  const techAgent = intelOffline.agents.find(a => a.type === 'TECHNICAL');
  assert.strictEqual(techAgent?.status, 'ONLINE', 'Technical analysis continues online');
  assert.notStrictEqual(intelOffline.marketStructure, null, 'Market structure continues active');
  console.log('  ✓ Technical intelligence remains ONLINE using independent verified OHLC');
  console.log('  ✓ Market structure engine continues active without MT5 dependency');

  // Router evaluation in reference mode
  const routedOffline = canonicalDataRouter.resolveQuote({
    symbol: 'XAUUSD',
    brokerQuote: null,
    referencePrice: 4199.50,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(routedOffline.provenance.sourceType, 'PUBLIC_API');
  assert.strictEqual(routedOffline.provenance.brokerSpecific, false);
  assert.strictEqual(routedOffline.provenance.executable, false);
  assert.strictEqual(routedOffline.provenance.referenceOnly, true);
  console.log('  ✓ Data router tags quote PUBLIC_API, referenceOnly: true, executable: false');

  // Stale quote failover test (>= 5000ms)
  const feedStale = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4193.50, ask: 4193.54, timestamp: now - 8000, digits: 2 },
    referencePrice: 4199.50,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(feedStale.state, 'FAILOVER_ACTIVE', 'State must be FAILOVER_ACTIVE on stale broker quote');
  assert.strictEqual(feedStale.priceAuthority, 'REFERENCE_MARKET', 'Price authority falls back to REFERENCE_MARKET');
  assert.strictEqual(feedStale.executionLocked, true, 'Execution locked on failover');
  console.log('  ✓ Stale broker quote (8s old) triggers FAILOVER_ACTIVE → REFERENCE_MARKET');

  // -------------------------------------------------------------
  // TEST C: AUTOMATIC MT5 RECOVERY & HYSTERESIS
  // -------------------------------------------------------------
  console.log('\n[TEST C: AUTOMATIC MT5 RECOVERY & HYSTERESIS]');
  // Simulate returning broker telemetry
  const feedRecovered = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4194.10, ask: 4194.14, timestamp: now - 300, digits: 2, spread: 40 },
    referencePrice: 4199.50,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(feedRecovered.state, 'BROKER_PRIMARY', 'State must immediately return to BROKER_PRIMARY');
  assert.strictEqual(feedRecovered.priceAuthority, 'MT5_BROKER', 'Price authority immediately returns to MT5_BROKER');
  assert.strictEqual(feedRecovered.bid, 4194.10, 'Bid updated to fresh broker value');
  assert.strictEqual(feedRecovered.executionLocked, false, 'Execution unlocked upon recovery');
  console.log('  ✓ Instant recovery: REFERENCE_MARKET → MT5_BROKER upon fresh quote arrival');
  console.log('  ✓ Zero manual refresh or restart required');

  // Hysteresis test: Single transient drop does not flip to OFFLINE immediately
  const eval1 = evaluateConnectivityStatus({
    isAuthoritativeConnected: false,
    heartbeatAgeMs: 3000,
    previousState: 'ONLINE',
    consecutiveFailures: 1,
    timeSinceLastSuccessMs: 3000,
  });
  assert.strictEqual(eval1.state, 'DEGRADED', 'First failure enters DEGRADED state (grace period)');
  assert.strictEqual(eval1.isMt5Connected, true, 'isMt5Connected remains true during grace period');
  console.log('  ✓ Anti-flap: transient 3s drop kept in grace period (state = DEGRADED, isMt5Connected = true)');

  // Definitive disconnect after 20s or explicit terminal disconnect
  const eval2 = evaluateConnectivityStatus({
    isAuthoritativeConnected: false,
    heartbeatAgeMs: 25000,
    previousState: 'DEGRADED',
    consecutiveFailures: 7,
    timeSinceLastSuccessMs: 25000,
  });
  assert.strictEqual(eval2.state, 'OFFLINE', 'Expired heartbeat (> 20s) flips to OFFLINE');
  assert.strictEqual(eval2.isMt5Connected, false, 'isMt5Connected becomes false');
  console.log('  ✓ Fail-closed: heartbeat expired (> 20s) flips decisively to OFFLINE');

  // -------------------------------------------------------------
  // MULTI-ASSET ACCEPTANCE (XAUUSD, EURUSD, BTCUSD, US100, USOIL, GER40)
  // -------------------------------------------------------------
  console.log('\n[MULTI-ASSET ACCEPTANCE]');
  const representativeSymbols = [
    { symbol: 'XAUUSD', brokerOk: true, refQuoteOk: true, refCandleOk: true, liveRef: 4199.50, brokerQuote: { bid: 4193.50, ask: 4193.54, timestamp: now - 400, digits: 2 } },
    { symbol: 'EURUSD', brokerOk: true, refQuoteOk: true, refCandleOk: true, liveRef: 1.1215, brokerQuote: { bid: 1.1256, ask: 1.1256, timestamp: now - 400, digits: 5 } },
    { symbol: 'BTCUSD', brokerOk: true, refQuoteOk: true, refCandleOk: true, liveRef: 82350.00, brokerQuote: { bid: 82300.0, ask: 82300.0, timestamp: now - 400, digits: 2 } },
    { symbol: 'US100', brokerOk: true, refQuoteOk: true, refCandleOk: true, liveRef: 20412.00, brokerQuote: { bid: 29670.0, ask: 29670.0, timestamp: now - 400, digits: 2 } },
    { symbol: 'USOIL', brokerOk: true, refQuoteOk: true, refCandleOk: true, liveRef: 74.50, brokerQuote: { bid: 95.40, ask: 95.40, timestamp: now - 400, digits: 3 } },
    { symbol: 'GER40', brokerOk: false, refQuoteOk: false, refCandleOk: true, liveRef: 0, brokerQuote: null },
  ];

  for (const item of representativeSymbols) {
    // 1. Online condition
    const online = evaluateContinuityFeed({
      symbol: item.symbol,
      brokerQuote: item.brokerQuote,
      referencePrice: item.liveRef > 0 ? item.liveRef : null,
      referenceProvider: 'Verified Public Reference',
    });

    // 2. Offline condition
    const offline = evaluateContinuityFeed({
      symbol: item.symbol,
      brokerQuote: null,
      referencePrice: item.liveRef > 0 ? item.liveRef : null,
      referenceProvider: 'Verified Public Reference',
    });

    if (item.symbol === 'GER40') {
      assert.strictEqual(online.priceAuthority, 'UNAVAILABLE', 'GER40 must fail closed online when broker has no quote');
      assert.strictEqual(offline.priceAuthority, 'UNAVAILABLE', 'GER40 must fail closed offline without genuine live ticker');
      assert.strictEqual(offline.state, 'OFFLINE', 'GER40 state must be OFFLINE');
      console.log(`  ✓ ${item.symbol}: Online Authority = ${online.priceAuthority} | Offline Authority = ${offline.priceAuthority} (FAILS CLOSED TRUTHFULLY)`);
    } else {
      assert.strictEqual(online.priceAuthority, 'MT5_BROKER', `${item.symbol} online authority must be MT5_BROKER`);
      assert.strictEqual(offline.priceAuthority, 'REFERENCE_MARKET', `${item.symbol} offline authority must be REFERENCE_MARKET`);
      console.log(`  ✓ ${item.symbol}: Online Authority = ${online.priceAuthority} | Offline Authority = ${offline.priceAuthority} (Seamless Fallback)`);
    }
  }

  console.log('\n=================================================================');
  console.log('ALL PHASE 2 ACCEPTANCE CRITERIA VERIFIED AND PASSED CLEANLY.');
  console.log('=================================================================');
}

runAcceptance().catch((err) => {
  console.error('Acceptance suite failed:', err);
  process.exit(1);
});
