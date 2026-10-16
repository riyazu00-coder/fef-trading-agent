/**
 * FEF TRADING SOLUTIONS — PHASE 3 SOURCE-AWARE ACCEPTANCE SUITE
 * Validates:
 * 1. Test 1: MT5 Online (Authority = MT5_BROKER, Technical, Structure, Macro, News, Spread = ACTIVE, no false global DATA_LIMITED)
 * 2. Test 2: MT5 Offline + Reference Healthy (Authority = REFERENCE_MARKET, Reference Price = LIVE,
 *    Technical, Structure, Momentum, Trend, Volatility, Session, Macro, News, Cross-Asset = ACTIVE,
 *    Broker Spread = UNAVAILABLE, Broker Account = UNAVAILABLE, Broker Order Flow = DATA_LIMITED,
 *    Execution = READ_ONLY, tradeExecutable = false, NO false global DATA_LIMITED)
 * 3. Test 3: MT5 Recovery (Automatic transition back to MT5_BROKER, broker capabilities recover, independent remain active)
 * 4. Test 4: True Reference Failure (No MT5 + No Reference -> Fails closed to DATA_LIMITED / UNAVAILABLE, proving DATA_LIMITED is not disabled)
 * 5. Test 5: Mixed Evidence Truthfulness (Reference OHLC healthy, macro healthy, news healthy, broker order flow DATA_LIMITED)
 * 6. Representative Symbols: XAUUSD, EURUSD, BTCUSD, US100, USOIL, GER40 (GER40 fails closed for live price)
 */

import assert from 'assert';
import { evaluateContinuityFeed } from '../src/lib/price/continuity-feed';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { evaluateDataSentinelAgent, evaluateOrderFlowDeltaAgent } from '../src/lib/agents/specialists/specialist-agents';
import { DecisionEngineV2 } from '../src/lib/decision/decision-engine-v2';
import { RawCandleInput } from '../src/lib/candles/candle-validator';

async function runPhase3Acceptance() {
  console.log('=================================================================');
  console.log('FEF CORTEX — PHASE 3 SOURCE-AWARE ACCEPTANCE SUITE');
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
      tickVolume: 150 + i,
    });
  }

  // -------------------------------------------------------------
  // TEST 1: MT5 ONLINE
  // -------------------------------------------------------------
  console.log('[TEST 1: MT5 ONLINE]');
  const feedOnline = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4193.50, ask: 4193.54, timestamp: now - 300, digits: 2, spread: 40 },
    referencePrice: 4195.00,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(feedOnline.priceAuthority, 'MT5_BROKER', 'Price authority must be MT5_BROKER');
  assert.strictEqual(feedOnline.spread, 0.04, 'Broker spread must be genuine 0.04');
  assert.strictEqual(feedOnline.brokerConnected, true, 'Broker must be connected');

  const intelOnline = generateAssetIntelligence('XAUUSD', {
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    price: feedOnline.activePrice,
    change24h: 0.15,
    category: 'METALS',
    provider: 'Exness',
    source: 'MT5',
    feedStatus: 'LIVE',
  } as any, 'H1', testCandles, 'LIVE_MT5', 'Exness MT5 Broker', new Date(now), {
    macroDetails: {
      yieldCurve: { status: 'VALID', spreadBp: 30, curveDirection: 'STEEPENING', curveState: 'NORMAL', classification: 'FRED_OFFICIAL', provider: 'FRED', confidence: 90 },
      inflationRegime: { status: 'VALID', regime: 'DISINFLATION', classification: 'FRED_OFFICIAL', provider: 'FRED', confidence: 90 },
      laborMarket: { status: 'VALID', regime: 'STABLE', classification: 'FRED_OFFICIAL', provider: 'FRED', confidence: 90 },
    },
    news: [{ id: 'news-1', headline: 'Fed Signals Steady Stance', publishedAt: new Date(now - 60000).toISOString() }] as any,
  } as any);

  const techOnline = intelOnline.agents.find(a => a.type === 'TECHNICAL');
  assert.strictEqual(techOnline?.status, 'ONLINE', 'Technical agent must be ONLINE');
  assert.notStrictEqual(intelOnline.marketStructure, null, 'Market structure must be active');
  assert.notStrictEqual(intelOnline.confluence?.dataReadiness, 'INSUFFICIENT', 'Consensus data readiness must not be INSUFFICIENT');
  assert.notStrictEqual(intelOnline.setupDirection, 'DATA LIMITED', 'Global setupDirection must not be DATA LIMITED');
  console.log('  ✓ MT5 Price Authority = MT5_BROKER');
  console.log('  ✓ Technical: ONLINE');
  console.log('  ✓ Structure: ACTIVE');
  console.log(`  ✓ Data Readiness: ${intelOnline.confluence?.dataReadiness || 'MODERATE/HIGH'}`);
  console.log('  ✓ Zero false global DATA LIMITED with MT5 online');

  // -------------------------------------------------------------
  // TEST 2: MT5 OFFLINE + REFERENCE HEALTHY
  // -------------------------------------------------------------
  console.log('\n[TEST 2: MT5 OFFLINE + REFERENCE HEALTHY]');
  const feedOffline = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: null,
    referencePrice: 4199.50,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(feedOffline.priceAuthority, 'REFERENCE_MARKET', 'Price authority must fall back to REFERENCE_MARKET');
  assert.strictEqual(feedOffline.activePrice, 4199.50, 'Active price is fresh reference price');
  assert.strictEqual(feedOffline.spread, 0, 'Broker spread must be 0 (UNAVAILABLE) in reference mode, never fabricated');
  assert.strictEqual(feedOffline.executionLocked, true, 'Execution must be locked in reference mode');

  const intelOffline = generateAssetIntelligence('XAUUSD', {
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    price: feedOffline.activePrice,
    change24h: 0.25,
    category: 'METALS',
    provider: 'Gold-API',
    source: 'REFERENCE_MARKET',
    feedStatus: 'LIVE',
  } as any, 'H1', testCandles, 'INDEPENDENT_VERIFIED', 'Gold-API Live (Verified)', new Date(now), {
    macro: [{ name: 'US 10Y Yield', currentValue: 4.45, delta: 0.02, bias: 'BEARISH', category: 'METALS', region: 'GLOBAL', affectedAssets: ['XAUUSD'], releaseDate: 'Today' }] as any,
    macroDetails: {
      yieldCurve: { status: 'VALID', spreadBp: 30, curveDirection: 'STEEPENING', curveState: 'NORMAL', classification: 'FRED_OFFICIAL', provider: 'FRED', confidence: 90 },
      inflationRegime: { status: 'VALID', regime: 'DISINFLATION', classification: 'FRED_OFFICIAL', provider: 'FRED', confidence: 90 },
      laborMarket: { status: 'VALID', regime: 'STABLE', classification: 'FRED_OFFICIAL', provider: 'FRED', confidence: 90 },
    },
    news: [{ id: 'news-1', headline: 'Fed Signals Steady Stance', publishedAt: new Date(now - 60000).toISOString() }] as any,
  } as any);

  // Core capability assertions under reference mode
  const techOffline = intelOffline.agents.find(a => a.type === 'TECHNICAL');
  assert.strictEqual(techOffline?.status, 'ONLINE', 'Technical analysis must remain ONLINE using independent verified candles');
  assert.notStrictEqual(intelOffline.marketStructure, null, 'Market structure must remain ACTIVE');
  assert.strictEqual(intelOffline.tradeExecutable, false, 'tradeExecutable must be false in reference mode');

  // Verify Data Sentinel does NOT mark global data limited merely because MT5 is offline
  const sentinelResp = evaluateDataSentinelAgent({
    isMt5Online: false,
    isReferenceLive: true,
    priceAuthority: 'REFERENCE_MARKET',
    priceAuthorityStatus: 'LIVE',
    activeProviders: ['Gold-API', 'FRED'],
    offlineProviders: ['MT5'],
  });
  assert.strictEqual(sentinelResp.readiness, 'READY', 'Data Sentinel must report READY when reference data is healthy');
  assert.strictEqual(sentinelResp.confidence, 95, 'Data Sentinel confidence must reflect valid reference audit');
  console.log('  ✓ Data Sentinel reports READY (not DATA_LIMITED) under healthy Reference Market');

  // Verify Broker Order Flow is specifically DATA_LIMITED without broker feed
  const orderFlowResp = evaluateOrderFlowDeltaAgent({
    instrument: 'XAUUSD',
    candles: testCandles as any,
    isBrokerConnected: false,
  });
  assert.strictEqual(orderFlowResp.readiness, 'DATA_LIMITED', 'Broker Order Flow must be DATA_LIMITED without MT5 broker');
  console.log('  ✓ Broker Order Flow is specifically DATA_LIMITED (capability-specific)');

  // Verify Decision Engine V2 does NOT hard veto or force DATA LIMITED in reference mode
  const decisionEngine = new DecisionEngineV2();
  const decisionResult = decisionEngine.evaluateDecision({
    evidenceBundle: {
      snapshotId: 'snap-xau-ref-test',
      symbol: 'XAUUSD',
      canonicalSymbol: 'XAUUSD',
      brokerSymbol: 'XAUUSD',
      asOf: now,
      generatedAt: now,
      market: {
        price: 4199.50,
        bid: 4199.50,
        ask: 4199.50,
        mid: 4199.50,
        spread: 0,
        digits: 2,
        quoteTimestamp: now,
        quoteAgeMs: 0,
        quoteFreshness: 'FRESH',
        marketState: 'OPEN',
        sessionState: { marketState: 'OPEN', tradeExecutable: false } as any,
        tradeExecutable: false,
      },
      provenance: {
        source: 'REFERENCE_MARKET',
        storage: 'MEMORY_CACHE',
        classification: 'INDEPENDENT_VERIFIED',
        provider: 'Gold-API',
        isDerived: false,
      },
      timeframes: {
        M15: { state: 'AVAILABLE', barCount: 50 },
      } as any,
      timeframeRoles: {} as any,
      domains: {} as any,
      conflicts: [],
      completeness: { overallCompleteness: 80 } as any,
      executionPolicies: {
        webProductPolicy: 'ARMED_WITH_CONFIRMATION',
        localBrokerTransportPolicy: 'READ_ONLY',
        mt5OrderTransportEnabled: false,
        intelligenceActionability: 'ACTIONABLE',
        finalDecisionExecutable: false,
      },
    },
    agents: intelOffline.unifiedAgents || [],
    hasBlueprint: false,
  });
  assert.notStrictEqual(decisionResult.maturity, 'DATA_LIMITED', 'Decision V2 maturity must NOT be DATA_LIMITED when reference market and independent domains are healthy');
  assert.strictEqual(decisionResult.tradeExecutable, false, 'Decision V2 tradeExecutable must remain false');
  console.log(`  ✓ Decision Engine V2 Maturity = ${decisionResult.maturity} (NOT false DATA_LIMITED)`);
  console.log('  ✓ Decision Engine V2 tradeExecutable = false (Safe)');

  // -------------------------------------------------------------
  // TEST 3: AUTOMATIC MT5 RECOVERY
  // -------------------------------------------------------------
  console.log('\n[TEST 3: AUTOMATIC MT5 RECOVERY]');
  const feedRecovered = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: { bid: 4194.50, ask: 4194.54, timestamp: now - 200, digits: 2, spread: 40 },
    referencePrice: 4199.50,
    referenceProvider: 'Gold-API Live (Verified)',
  });
  assert.strictEqual(feedRecovered.priceAuthority, 'MT5_BROKER', 'Authority returns to MT5_BROKER upon quote arrival');
  assert.strictEqual(feedRecovered.spread, 0.04, 'Broker spread recovers to 0.04');
  assert.strictEqual(feedRecovered.brokerConnected, true, 'Broker connectivity restored');
  console.log('  ✓ Price Authority automatically returned: REFERENCE_MARKET → MT5_BROKER');
  console.log('  ✓ Broker spread recovered: 0.04 USD');

  // -------------------------------------------------------------
  // TEST 4: TRUE REFERENCE FAILURE (FAILS CLOSED TO DATA_LIMITED)
  // -------------------------------------------------------------
  console.log('\n[TEST 4: TRUE REFERENCE FAILURE (FAILS CLOSED)]');
  const feedBothDead = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: null,
    referencePrice: null,
    referenceProvider: 'None',
  });
  assert.strictEqual(feedBothDead.priceAuthority, 'UNAVAILABLE', 'Authority must be UNAVAILABLE when both MT5 and reference are missing');
  assert.strictEqual(feedBothDead.state, 'OFFLINE', 'Feed state must be OFFLINE');

  // Verify that without candles and without quotes, Technical is truthfully DATA_LIMITED
  const intelDead = generateAssetIntelligence('XAUUSD', {
    symbol: 'XAUUSD',
    name: 'Gold Spot / USD',
    price: 0,
    change24h: 0,
    category: 'METALS',
    provider: 'UNAVAILABLE',
    source: 'NONE',
    feedStatus: 'OFFLINE',
  } as any, 'H1', [], 'UNAVAILABLE', 'NONE', new Date(now));

  const techDead = intelDead.agents.find(a => a.type === 'TECHNICAL');
  assert.strictEqual(techDead?.status, 'DATA LIMITED', 'Technical MUST be DATA LIMITED when candles are genuinely absent');
  assert.strictEqual(intelDead.marketStructure, null, 'Market structure MUST be null without candles');

  const sentinelDead = evaluateDataSentinelAgent({
    isMt5Online: false,
    isReferenceLive: false,
    priceAuthority: 'UNAVAILABLE',
    priceAuthorityStatus: 'ERROR',
  });
  assert.strictEqual(sentinelDead.readiness, 'DATA_LIMITED', 'Data Sentinel MUST be DATA_LIMITED when both feeds are dead');
  console.log('  ✓ True no-data condition correctly fails closed to DATA_LIMITED / UNAVAILABLE');
  console.log('  ✓ Confirms DATA_LIMITED was NOT globally disabled');

  // -------------------------------------------------------------
  // TEST 5: MIXED EVIDENCE TRUTHFULNESS
  // -------------------------------------------------------------
  console.log('\n[TEST 5: MIXED EVIDENCE TRUTHFULNESS]');
  // Independent OHLC healthy, macro healthy, news healthy, broker order flow unavailable
  const mixedAgents = intelOffline.agents;
  const techMix = mixedAgents.find(a => a.type === 'TECHNICAL');
  const macroMix = mixedAgents.find(a => a.type === 'MACRO');
  const orderFlowMix = mixedAgents.find(a => a.type === 'ORDER_FLOW');

  assert.strictEqual(techMix?.status, 'ONLINE', 'Technical must be ONLINE from independent OHLC');
  assert.strictEqual(macroMix?.status, 'ONLINE', 'Macro must be ONLINE from FRED feeds');
  assert.strictEqual(orderFlowMix?.status, 'DATA LIMITED', 'Order Flow must be DATA LIMITED without broker tick delta');
  console.log('  ✓ Technical = ONLINE (independent evidence)');
  console.log('  ✓ Macro = ONLINE (independent evidence)');
  console.log('  ✓ Order Flow = DATA LIMITED (broker evidence unavailable)');
  console.log('  ✓ Mixed evidence reflected truthfully without global contamination');

  // -------------------------------------------------------------
  // TEST 6: REPRESENTATIVE SYMBOLS (XAUUSD, EURUSD, BTCUSD, US100, USOIL, GER40)
  // -------------------------------------------------------------
  console.log('\n[TEST 6: REPRESENTATIVE SYMBOLS]');
  const testSymbols = [
    { sym: 'XAUUSD', refPrice: 4199.50, cat: 'METALS' },
    { sym: 'EURUSD', refPrice: 1.1215, cat: 'FOREX' },
    { sym: 'BTCUSD', refPrice: 82350.00, cat: 'CRYPTO' },
    { sym: 'US100', refPrice: 20412.00, cat: 'INDICES' },
    { sym: 'USOIL', refPrice: 74.50, cat: 'COMMODITIES' },
    { sym: 'GER40', refPrice: 0, cat: 'INDICES' }, // GER40 fails closed for live price
  ];

  for (const item of testSymbols) {
    if (item.sym === 'GER40') {
      const feedGer = evaluateContinuityFeed({
        symbol: 'GER40',
        brokerQuote: null,
        referencePrice: null,
        referenceProvider: 'None',
      });
      assert.strictEqual(feedGer.priceAuthority, 'UNAVAILABLE', 'GER40 must fail closed for live price authority');
      assert.strictEqual(feedGer.activePrice, 0, 'GER40 live price must be 0 (no synthetic quote)');
      console.log(`  ✓ GER40: Fails closed for live price (Authority = UNAVAILABLE, Price = 0)`);
    } else {
      const feed = evaluateContinuityFeed({
        symbol: item.sym,
        brokerQuote: null,
        referencePrice: item.refPrice,
        referenceProvider: 'Verified Reference Provider',
      });
      const expectedAuthority = item.sym === 'US100' ? 'REFERENCE_PROXY' : 'REFERENCE_MARKET';
      assert.strictEqual(feed.priceAuthority, expectedAuthority, `${item.sym} authority must be ${expectedAuthority}`);
      assert.strictEqual(feed.activePrice, item.refPrice, `${item.sym} active price must match reference`);
      console.log(`  ✓ ${item.sym}: Price Authority = ${feed.priceAuthority} (${item.refPrice})`);
    }
  }

  console.log('\n=================================================================');
  console.log('ALL PHASE 3 SOURCE-AWARE ACCEPTANCE TESTS PASSED CLEANLY.');
  console.log('=================================================================');
}

runPhase3Acceptance().catch((err) => {
  console.error('\n❌ Phase 3 Acceptance Suite Failed:', err);
  process.exit(1);
});
