/**
 * FEF CORTEX V1.3 — UNIVERSAL MT5 + OPPORTUNITY INTELLIGENCE TEST SUITE
 * 
 * Strict Invariants Tested:
 * 1. ORDERS SENT = 0 Invariant (Never dispatch real orders)
 * 2. Universal Symbol Prefix/Suffix Stripping & Spec Validation
 * 3. Final Human Confirmation Gate & Cryptographic Authority
 *    - HMAC-SHA256 fingerprint verification
 *    - 60s TTL expiration
 *    - Single-use token enforcement
 *    - Parameter tampering rejection
 *    - Automatic dispatch permanent lock (AUTOMATIC_DISPATCH_FORBIDDEN)
 * 4. Opportunity Lifecycle & Decoupling of Bias vs Execution Quality
 *    - R:R < 1.5 cannot be EXECUTION READY (marked UNFAVORABLE_RR)
 *    - Lifecycle state transitions & frozen structural levels
 * 5. Multi-Timeframe Alignment Engine (M5, M15, M30, H1, H4)
 * 6. Volume Profile Value Acceptance & Honest Tick Volume Labeling
 * 7. Order Flow Provenance & Flow Proxy Disclosure
 * 8. Global Macro Engine Multi-Economy Filtering (US, EU, UK, JP, CN)
 * 9. Price Authority Reference Divergence & Dynamic Broker Identity
 */

import assert from 'assert';
import {
  stripBrokerSymbolAffixes,
  resolveCanonicalSymbol,
  validateOrderAgainstSpec
} from '../src/lib/bridge/symbol-mapper';
import {
  MT5SymbolSpecification
} from '../src/lib/bridge/mt5-bridge-protocol';
import {
  confirmationAuthority,
  FinalOrderConfirmationPayload
} from '../src/lib/execution/confirmation-authority';
import {
  CANONICAL_EXECUTION_MODE,
  MT5_ORDER_TRANSPORT_ENABLED,
  isMt5OrderTransportAllowed
} from '../src/lib/execution/execution-policy';
import {
  updateBlueprintLifecycle,
  TradeBlueprint
} from '../src/lib/trading/trade-blueprint-engine';
import {
  evaluateMultiTimeframeAlignment,
  TimeframeId
} from '../src/lib/market/multi-timeframe-alignment-engine';
import {
  OHLCCandle
} from '../src/lib/market/canonical-market-snapshot';
import {
  calculateVolumeProfile
} from '../src/lib/market/volume-profile-engine';
import {
  computeOrderFlowMetrics
} from '../src/lib/market/order-flow-engine';
import {
  globalMacroEngine
} from '../src/lib/macro/global-macro-engine';
import {
  evaluateCrossFeedDivergence
} from '../src/lib/price/price-authority';

let passed = 0;
let failed = 0;

function check(condition: unknown, message: string, details?: any) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ FAILED: ${message}`, details || '');
  }
}

// Generate deterministic bars for MTF and Volume tests
function createBars(count: number, startPrice: number, trend: number = 0): OHLCCandle[] {
  const bars: OHLCCandle[] = [];
  let price = startPrice;
  const baseTime = Date.UTC(2026, 8, 28, 12, 0, 0);

  for (let i = 0; i < count; i++) {
    price += trend + (Math.sin(i / 2) * 0.5);
    const open = Number(price.toFixed(2));
    const close = Number((price + (trend >= 0 ? 0.3 : -0.3)).toFixed(2));
    const high = Number((Math.max(open, close) + 0.8).toFixed(2));
    const low = Number((Math.min(open, close) - 0.8).toFixed(2));
    bars.push({
      timestamp: baseTime + i * 60000,
      open,
      high,
      low,
      close,
      volume: 100 + (i % 5) * 20
    });
  }
  return bars;
}

async function runV13TestSuite() {
  console.log('\n================================================================');
  console.log(' FEF CORTEX V1.3 — UNIVERSAL MT5 + OPPORTUNITY INTELLIGENCE TEST');
  console.log('================================================================\n');

  // =====================================================================
  // 1. ORDERS SENT = 0 INVARIANT & EXECUTION POLICY
  // =====================================================================
  console.log('[SECTION 1] Orders Sent = 0 & Execution Policy Invariants');
  {
    check(CANONICAL_EXECUTION_MODE === 'CONFIRMED_HUMAN_EXECUTION', 'Canonical execution mode is CONFIRMED_HUMAN_EXECUTION');
    // Without valid cryptographic token, transport must be disallowed
    check(isMt5OrderTransportAllowed() === false, 'MT5 order transport is disallowed without human confirmation token');
    check(MT5_ORDER_TRANSPORT_ENABLED === false, 'MT5_ORDER_TRANSPORT_ENABLED defaults to false for backward compatibility');
  }

  // =====================================================================
  // 2. UNIVERSAL SYMBOL PREFIX/SUFFIX STRIPPING & SPEC VALIDATION
  // =====================================================================
  console.log('\n[SECTION 2] Universal Symbol Prefix/Suffix Stripping & Spec Validation');
  {
    const testCases: Array<[string, string]> = [
      ['XAUUSDm', 'XAUUSD'],
      ['EURUSD.r', 'EURUSD'],
      ['GBPUSD.pro', 'GBPUSD'],
      ['USDJPY.ecn', 'USDJPY'],
      ['BTCUSD_i', 'BTCUSD'],
      ['US30Cash', 'US30'],
      ['m_XAUUSD', 'XAUUSD'],
      ['i_BTCUSD', 'BTCUSD'],
      ['ecn.EURUSD', 'EURUSD'],
      ['XAUUSD+', 'XAUUSD'],
      ['EURUSD.std', 'EURUSD'],
      ['GBPUSD.raw', 'GBPUSD'],
      ['AUDUSD.micro', 'AUDUSD'],
      ['US30_sb', 'US30'],
      ['ETHUSDc', 'ETHUSD'],
      ['NZDUSD.a', 'NZDUSD']
    ];

    for (const [brokerSymbol, expectedCanonical] of testCases) {
      const stripped = stripBrokerSymbolAffixes(brokerSymbol);
      check(stripped === expectedCanonical, `Stripped ${brokerSymbol} -> ${stripped} (expected ${expectedCanonical})`);
      const canonical = resolveCanonicalSymbol(brokerSymbol);
      check(canonical === expectedCanonical, `Resolved canonical ${brokerSymbol} -> ${canonical}`);
    }

    // Spec validation: stops level and freeze level checks
    const mockSpec: MT5SymbolSpecification = {
      brokerSymbol: 'XAUUSDm',
      canonicalSymbol: 'XAUUSD',
      description: 'Gold vs US Dollar',
      digits: 2,
      point: 0.01,
      contractSize: 100,
      minLot: 0.01,
      maxLot: 50.0,
      lotStep: 0.01,
      tickValue: 1.0,
      tickSize: 0.01,
      tradeMode: 'FULL',
      stopsLevel: 30, // 30 points = $0.30
      freezeLevel: 10 // 10 points = $0.10
    };

    // Valid order: Entry 2650.00, BUY, SL 2645.00 (5.00 diff > 0.30), TP 2660.00 (10.00 diff > 0.30)
    const validResult = validateOrderAgainstSpec({
      symbol: 'XAUUSDm',
      volume: 0.1,
      entryPrice: 2650.00,
      sl: 2645.00,
      tp: 2660.00,
      spec: mockSpec
    });
    check(validResult.valid === true, 'Order satisfying stopsLevel and volume limits is valid');

    // Invalid volume: below minLot
    const invalidVolResult = validateOrderAgainstSpec({
      symbol: 'XAUUSDm',
      volume: 0.005,
      entryPrice: 2650.00,
      sl: 2645.00,
      tp: 2660.00,
      spec: mockSpec
    });
    check(invalidVolResult.valid === false && invalidVolResult.errors.some(e => e.includes('minimum lot size')), 'Rejects volume below broker minimum');

    // Invalid SL: violation of stopsLevel (diff is $0.20, required $0.30)
    const invalidSlResult = validateOrderAgainstSpec({
      symbol: 'XAUUSDm',
      volume: 0.1,
      entryPrice: 2650.00,
      sl: 2649.80,
      tp: 2660.00,
      spec: mockSpec
    });
    check(invalidSlResult.valid === false && invalidSlResult.errors.some(e => e.includes('stops level minimum')), 'Rejects SL closer than stopsLevel allows');
  }

  // =====================================================================
  // 3. FINAL HUMAN CONFIRMATION GATE & CRYPTOGRAPHIC TOKEN AUTHORITY
  // =====================================================================
  console.log('\n[SECTION 3] Final Human Confirmation Gate & Cryptographic Authority');
  {
    // Test 3.1: Automatic dispatch must fail permanently
    let autoFailed = false;
    let autoCode = '';
    try {
      confirmationAuthority.generateOrderConfirmation({
        canonicalSymbol: 'XAUUSD',
        brokerSymbol: 'XAUUSDm',
        direction: 'BUY',
        volume: 0.1,
        entryPrice: 2650.00,
        stopLoss: 2640.00,
        takeProfit1: 2670.00,
        tradeMode: 'DEMO',
        accountId: 'DEMO-12345',
        brokerServer: 'Demo-Server',
        evidenceTrust: 85,
        isAutomatic: true // ILLEGAL
      });
    } catch (err: any) {
      autoFailed = true;
      autoCode = err.message || '';
    }
    check(autoFailed && autoCode.includes('AUTOMATIC_DISPATCH_FORBIDDEN'),
      'Automatic order dispatch is strictly forbidden (AUTOMATIC_DISPATCH_FORBIDDEN)');

    // Test 3.2: Valid Human Preparation creates artifact with 60s TTL
    const humanInput = {
      canonicalSymbol: 'XAUUSD',
      brokerSymbol: 'XAUUSDm',
      direction: 'BUY' as const,
      volume: 0.1,
      entryPrice: 2650.00,
      stopLoss: 2640.00,
      takeProfit1: 2670.00,
      tradeMode: 'DEMO' as const,
      accountId: 'DEMO-12345',
      brokerServer: 'Demo-Server',
      evidenceTrust: 85,
      isAutomatic: false
    };

    const artifact = confirmationAuthority.generateOrderConfirmation(humanInput, 60);
    check(!!artifact && typeof artifact.token === 'string', 'Human order preparation succeeds and issues artifact');
    check(artifact.expiresAt > Date.now() + 50000 && artifact.expiresAt <= Date.now() + 61000, 'Artifact TTL is configured to 60 seconds');
    check(typeof artifact.fingerprint === 'string' && artifact.fingerprint.length > 20, 'Cryptographic confirmation fingerprint is generated');

    // Test 3.3: Attempt to confirm without user confirmation flag fails
    const unconfirmedAttempt = confirmationAuthority.verifyOrderConfirmationToken(
      artifact.token,
      { ...humanInput, humanConfirmed: false }
    );
    check(unconfirmedAttempt.valid === false && (unconfirmedAttempt as any).errorCode === 'HUMAN_CONFIRMATION_MISSING',
      'Execution fails if humanConfirmed is false (HUMAN_CONFIRMATION_MISSING)');

    // Test 3.4: Parameter tampering detection (changing price or volume)
    const tamperedAttempt = confirmationAuthority.verifyOrderConfirmationToken(
      artifact.token,
      { ...humanInput, humanConfirmed: true, volume: 1.0 } // Changed volume from 0.1 to 1.0!
    );
    check(tamperedAttempt.valid === false && (tamperedAttempt as any).errorCode === 'TICKET_FINGERPRINT_MISMATCH',
      'Parameter tampering (volume modified) is rejected via HMAC fingerprint mismatch');

    // Test 3.5: Successful human confirmation with exact payload
    const legitConfirmation = confirmationAuthority.verifyOrderConfirmationToken(
      artifact.token,
      { ...humanInput, humanConfirmed: true }
    );
    check(legitConfirmation.valid === true, 'Legitimate human confirmation succeeds and consumes token');

    // Test 3.6: Single-use token enforcement (Replay attack prevention)
    const replayAttempt = confirmationAuthority.verifyOrderConfirmationToken(
      artifact.token,
      { ...humanInput, humanConfirmed: true }
    );
    check(replayAttempt.valid === false && (replayAttempt as any).errorCode === 'CONFIRMATION_ALREADY_USED',
      'Replay of already consumed confirmation token is rejected (CONFIRMATION_ALREADY_USED)');

    // Test 3.7: Expired token rejection
    const freshArtifact = confirmationAuthority.generateOrderConfirmation(humanInput, 60);
    // Artificially age the artifact beyond 60s
    (freshArtifact as any).expiresAt = Date.now() - 5000;
    const expiredAttempt = confirmationAuthority.verifyOrderConfirmationToken(
      freshArtifact.token,
      { ...humanInput, humanConfirmed: true }
    );
    check(expiredAttempt.valid === false && (expiredAttempt as any).errorCode === 'CONFIRMATION_EXPIRED',
      'Token older than 60s is strictly rejected (CONFIRMATION_EXPIRED)');
  }

  // =====================================================================
  // 4. OPPORTUNITY LIFECYCLE & DECOUPLING OF BIAS VS EXECUTION QUALITY
  // =====================================================================
  console.log('\n[SECTION 4] Opportunity Lifecycle & Decoupling of Bias vs Execution Quality');
  {
    const now = Date.now();
    // Setup with poor R:R (Risk 10, Reward 10 -> 1:1.0)
    const unfavorableBp: TradeBlueprint = {
      setupId: 'SETUP-XAUUSD-BUY-TEST1',
      createdAt: now,
      updatedAt: now,
      symbol: 'XAUUSD',
      direction: 'BUY',
      entryZoneHigh: { price: 2652, reason: 'Test FVG', source: 'INDEPENDENT_VERIFIED_OHLC', timeframe: 'H1', structureType: 'BULLISH_FVG', candleTimestamp: now, classification: 'DERIVED_FROM_VERIFIED' },
      entryZoneLow: { price: 2648, reason: 'Test FVG', source: 'INDEPENDENT_VERIFIED_OHLC', timeframe: 'H1', structureType: 'BULLISH_FVG', candleTimestamp: now, classification: 'DERIVED_FROM_VERIFIED' },
      invalidation: { price: 2640, reason: 'Swing low', source: 'INDEPENDENT_VERIFIED_OHLC', timeframe: 'H1', structureType: 'SWING_LOW', candleTimestamp: now, classification: 'DERIVED_FROM_VERIFIED' },
      sl: { price: 2640, reason: 'SL', source: 'INDEPENDENT_VERIFIED_OHLC', timeframe: 'H1', structureType: 'SL_DERIVED', candleTimestamp: now, classification: 'DERIVED_FROM_VERIFIED' },
      tp1: { price: 2660, reason: 'TP1', source: 'INDEPENDENT_VERIFIED_OHLC', timeframe: 'H1', structureType: 'SWING_HIGH', candleTimestamp: now, classification: 'DERIVED_FROM_VERIFIED' },
      rrRatio: '1:1.00', // Unfavorable R:R (< 1.5)
      expiry: now + 3600000,
      state: 'DEVELOPING',
      blueprintProvenanceVerified: true,
      provenanceNote: 'Test blueprint',
    };

    const evaluatedUnfavorable = updateBlueprintLifecycle(unfavorableBp, 2650.00);
    check(evaluatedUnfavorable.state === 'UNFAVORABLE_RR', `Blueprint with R:R 1.0 is marked UNFAVORABLE_RR (actual: ${evaluatedUnfavorable.state})`);
    check(evaluatedUnfavorable.state !== 'EXECUTION READY', 'Setup with R:R < 1.5 is strictly blocked from EXECUTION READY even when price is inside entry zone');

    // Setup with favorable R:R (1:2.5) inside entry zone
    const favorableBp: TradeBlueprint = {
      ...unfavorableBp,
      setupId: 'SETUP-XAUUSD-BUY-TEST2',
      tp1: { price: 2675, reason: 'TP1 High Target', source: 'INDEPENDENT_VERIFIED_OHLC', timeframe: 'H1', structureType: 'SWING_HIGH', candleTimestamp: now, classification: 'DERIVED_FROM_VERIFIED' },
      rrRatio: '1:2.50',
    };

    const evaluatedFavorable = updateBlueprintLifecycle(favorableBp, 2650.00);
    check(evaluatedFavorable.state === 'EXECUTION READY', `Favorable setup inside entry zone transitions to EXECUTION READY (actual: ${evaluatedFavorable.state})`);

    // Invalidation check: Price falls below invalidation level (2638 < 2640)
    const evaluatedInvalidated = updateBlueprintLifecycle(favorableBp, 2638.00);
    check(evaluatedInvalidated.state === 'INVALIDATED', `Setup where price breaches invalidation is marked INVALIDATED (actual: ${evaluatedInvalidated.state})`);
  }

  // =====================================================================
  // 5. MULTI-TIMEFRAME ALIGNMENT ENGINE (M5, M15, M30, H1, H4)
  // =====================================================================
  console.log('\n[SECTION 5] Multi-Timeframe Alignment Engine (5 Timeframes)');
  {
    const bullishBars = createBars(50, 2600, 0.5);
    const pullbackBars = createBars(50, 2625, -0.2);

    const bundle: Partial<Record<TimeframeId, OHLCCandle[]>> = {
      M5: pullbackBars,
      M15: pullbackBars,
      M30: bullishBars,
      H1: bullishBars,
      H4: bullishBars
    };

    const alignment = evaluateMultiTimeframeAlignment('XAUUSD', bundle);
    check(!!alignment.alignmentState, `Alignment state calculated: ${alignment.alignmentState}`);
    check(alignment.timeframeDetails.M5 !== undefined && alignment.timeframeDetails.H4 !== undefined, 'All 5 timeframes (M5 to H4) analyzed');
    check(typeof alignment.alignmentScore === 'number' && alignment.alignmentScore >= 0 && alignment.alignmentScore <= 100,
      `Alignment score in valid range: ${alignment.alignmentScore}%`);
    check(alignment.htfTrend === 'BULLISH', 'Higher timeframe trend recognized as BULLISH');
    check(alignment.alignmentState === 'HTF_BULLISH_LTF_PULLBACK', `Structural pullback recognized: ${alignment.alignmentState}`);
  }

  // =====================================================================
  // 6. VOLUME PROFILE VALUE ACCEPTANCE & HONEST LABELING
  // =====================================================================
  console.log('\n[SECTION 6] Volume Profile Value Acceptance & Honest Labeling');
  {
    const bars = createBars(60, 2650, 0.1);
    const vp = calculateVolumeProfile(bars, 'XAUUSD', 'H1', 24, false);

    check(!!vp, 'Volume profile calculated successfully');
    if (vp) {
      check(vp.poc > 0 && vp.vah >= vp.poc && vp.val <= vp.poc,
        `Volume profile computed: VAL=${vp.val.toFixed(2)}, POC=${vp.poc.toFixed(2)}, VAH=${vp.vah.toFixed(2)}`);
      check(!!vp.acceptanceState, `Value acceptance state classified: ${vp.acceptanceState}`);
      check(vp.volumeSourceLabel === 'TICK_VOLUME_PROXY',
        `Volume source honestly labeled as tick volume proxy: ${vp.volumeSourceLabel}`);
    }
  }

  // =====================================================================
  // 7. ORDER FLOW PROVENANCE & FLOW PROXY DISCLOSURE
  // =====================================================================
  console.log('\n[SECTION 7] Order Flow Provenance & Flow Proxy Disclosure');
  {
    const bars = createBars(30, 2650, 0.2);
    const flow = computeOrderFlowMetrics(bars, 'XAUUSD', 'M5', false);

    check(!!flow, 'Order flow calculated successfully');
    if (flow) {
      check(flow.flowProvenance === 'FLOW_PROXY', `Order flow provenance disclosed as FLOW_PROXY (actual: ${flow.flowProvenance})`);
      check(typeof flow.buyerSellerDelta === 'number', `Buyer seller delta computed: ${flow.buyerSellerDelta}`);
      check(typeof flow.tickVelocity === 'number', `Tick velocity computed: ${flow.tickVelocity}`);
    }
  }

  // =====================================================================
  // 8. GLOBAL MACRO ENGINE MULTI-ECONOMY FILTERING
  // =====================================================================
  console.log('\n[SECTION 8] Global Macro Engine Multi-Economy Filtering');
  {
    const configs = globalMacroEngine.getMacroConfigs();
    const configRegions = new Set(configs.map(c => c.region));
    check(configRegions.has('US') && configRegions.has('EUROZONE') && configRegions.has('UK') && configRegions.has('JAPAN') && configRegions.has('COMMODITIES'),
      `Macro configs cover US, Eurozone, UK, Japan, and Commodities: ${Array.from(configRegions).join(', ')}`);

    // Populate verified indicators into engine for deterministic asset filtering tests
    globalMacroEngine.setIndicatorsForTesting([
      {
        name: 'DXY Trade-Weighted Dollar Index',
        region: 'US',
        currentValue: 102.5,
        previousValue: 102.1,
        delta: 0.4,
        percentageDelta: 0.39,
        velocity: 'STABLE',
        regime: 'DOLLAR_BALANCED',
        unit: 'Index Points',
        releaseDate: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        freshness: 'CURRENT',
        source: 'Yahoo Finance Public Market Telemetry',
        affectedAssets: ['XAUUSD', 'EURUSD', 'GBPUSD', 'US500', 'USDJPY', 'USDCAD'],
        directionalImplication: 'DXY firm -> Dollar headwind',
        confidence: 88,
        bias: 'BEARISH',
        goldCorrelation: 'NEGATIVE',
        classification: 'INDEPENDENT_VERIFIED',
      },
      {
        name: 'US 10-Year Treasury Yield',
        region: 'US',
        currentValue: 4.15,
        previousValue: 4.10,
        delta: 0.05,
        percentageDelta: 1.22,
        velocity: 'ELEVATED',
        regime: 'NEUTRAL_YIELD',
        unit: '% Yield',
        releaseDate: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        freshness: 'CURRENT',
        source: 'Yahoo Finance Public Market Telemetry',
        affectedAssets: ['XAUUSD', 'US100', 'US500', 'USDJPY', 'EURUSD'],
        directionalImplication: 'US 10Y Yields rising -> Gold headwind',
        confidence: 90,
        bias: 'BEARISH',
        goldCorrelation: 'NEGATIVE',
        classification: 'INDEPENDENT_VERIFIED',
      },
      {
        name: 'Euro Stoxx 50 (Eurozone)',
        region: 'EUROZONE',
        currentValue: 4850,
        previousValue: 4830,
        delta: 20,
        percentageDelta: 0.41,
        velocity: 'STABLE',
        regime: 'NORMAL',
        unit: 'Index Points',
        releaseDate: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        freshness: 'CURRENT',
        source: 'Yahoo Finance Public Market Telemetry',
        affectedAssets: ['EURUSD', 'US500'],
        directionalImplication: 'Euro Stoxx positive -> EUR supportive',
        confidence: 85,
        bias: 'BULLISH',
        goldCorrelation: 'NEUTRAL',
        classification: 'INDEPENDENT_VERIFIED',
      },
      {
        name: 'Nikkei 225 (Japan)',
        region: 'JAPAN',
        currentValue: 38500,
        previousValue: 38200,
        delta: 300,
        percentageDelta: 0.78,
        velocity: 'STABLE',
        regime: 'NORMAL',
        unit: 'Index Points',
        releaseDate: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        freshness: 'CURRENT',
        source: 'Yahoo Finance Public Market Telemetry',
        affectedAssets: ['USDJPY', 'GBPJPY'],
        directionalImplication: 'Nikkei up -> JPY softer',
        confidence: 82,
        bias: 'NEUTRAL',
        goldCorrelation: 'NEUTRAL',
        classification: 'INDEPENDENT_VERIFIED',
      }
    ]);

    // Asset specific filtering
    const goldMacro = globalMacroEngine.getIndicatorsForAsset('XAUUSD');
    const eurMacro = globalMacroEngine.getIndicatorsForAsset('EURUSD');
    const jpyMacro = globalMacroEngine.getIndicatorsForAsset('USDJPY');

    check(goldMacro.length > 0 && goldMacro.some(i => i.name.includes('Yield') || i.name.includes('Dollar')),
      'Gold macro includes Treasury Yields and Dollar Index');
    check(eurMacro.some(i => i.region === 'EUROZONE') && eurMacro.some(i => i.region === 'US'),
      'EURUSD macro includes both Eurozone and US indicators');
    check(jpyMacro.some(i => i.region === 'JAPAN'),
      'USDJPY macro includes Japan indicators');
  }

  // =====================================================================
  // 9. PRICE AUTHORITY REFERENCE DIVERGENCE & DYNAMIC BROKER IDENTITY
  // =====================================================================
  console.log('\n[SECTION 9] Price Authority Reference Divergence & Neutral Branding');
  {
    const testSymbol = 'XAUUSD';
    const mockBrokerQuote = {
      canonicalSymbol: testSymbol,
      brokerSymbol: 'XAUUSDm',
      bid: 2650.00,
      ask: 2650.30,
      last: 2650.15,
      spread: 30,
      digits: 2,
      timestamp: Date.now(),
      freshness: 'FRESH' as const
    };
    const mockRefAsset = {
      symbol: testSymbol,
      name: 'Gold Spot',
      price: 2670.00, // 20.00 divergence = ~75 bps > 50 bps threshold
      change: 0,
      changePercent: 0,
      dayHigh: 2680,
      dayLow: 2640,
      volume: 10000,
      category: 'COMMODITIES' as const,
      sparkline: []
    };

    const divergenceComparison = evaluateCrossFeedDivergence(testSymbol, mockBrokerQuote, mockRefAsset);
    check(divergenceComparison.status === 'REFERENCE_DIVERGENCE', `Significant price divergence is categorized as REFERENCE_DIVERGENCE (actual: ${divergenceComparison.status})`);
    check(divergenceComparison.basisBps > 50, `Basis difference calculated accurately: ${divergenceComparison.basisBps} bps`);
    check(divergenceComparison.explanation.includes('Connected MT5 Broker'), 'Authoritative MT5 broker primacy preserved');
  }

  // =====================================================================
  // SUMMARY
  // =====================================================================
  console.log('\n================================================================');
  console.log(` TOTAL CHECKS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error(`❌ TEST SUITE FAILED with ${failed} failures.`);
    process.exit(1);
  } else {
    console.log('✅ ALL FEF CORTEX V1.3 TEST CHECKS PASSED PERFECTLY.');
    console.log('   Zero real orders dispatched (ORDERS SENT = 0 verified).');
  }
}

runV13TestSuite().catch(err => {
  console.error('Fatal error in V1.3 test suite:', err);
  process.exit(1);
});
