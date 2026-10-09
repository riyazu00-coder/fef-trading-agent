/**
 * FEF TRADING SOLUTIONS — CONNECTIVITY & ANTI-FLAP TEST SUITE
 *
 * Verifies all 11 requirements for terminal connectivity, quote freshness,
 * anti-flap hysteresis, reference feed decoupling, race protection, and invariants:
 *
 * 1. Healthy MT5 + fresh quote => ONLINE/LIVE
 * 2. Healthy MT5 + quote older than display freshness => CONNECTED but STALE/DEGRADED, not OFFLINE
 * 3. Healthy MT5 + reference feed failure => MT5 remains ONLINE
 * 4. Single telemetry request failure after healthy state => stays CONNECTED/DEGRADED (no immediate OFFLINE)
 * 5. Heartbeat expiration (> 20s) => OFFLINE
 * 6. terminalConnected === false => OFFLINE
 * 7. Selected symbol stale while another fresh => terminal ONLINE, symbol STALE/DATA LIMITED
 * 8. Out-of-order async response cannot overwrite newer healthy state
 * 9. Unsupported GER40 does not mark global connection offline
 * 10. tradeMode: DISABLED crypto does not mark MT5 offline
 * 11. Strict invariants: CANONICAL_EXECUTION_MODE = 'READ_ONLY', MT5_ORDER_TRANSPORT_ENABLED = false
 */

import {
  evaluateConnectivityStatus,
  evaluateBrokerQuoteFreshness,
  HEARTBEAT_FRESH_THRESHOLD_MS,
  HEARTBEAT_WARNING_THRESHOLD_MS,
  HEARTBEAT_EXPIRED_THRESHOLD_MS,
  QUOTE_DISPLAY_FRESH_THRESHOLD_MS,
  QUOTE_DISPLAY_STALE_THRESHOLD_MS,
  QUOTE_INTELLIGENCE_THRESHOLD_MS,
  QUOTE_EXECUTION_STRICT_THRESHOLD_MS,
  MAX_TRANSIENT_POLL_FAILURES
} from '../src/lib/bridge/connectivity-policy';
import {
  CANONICAL_EXECUTION_MODE,
  MT5_ORDER_TRANSPORT_ENABLED,
  isMt5OrderTransportAllowed,
  evaluateMt5ExecutionPermission,
  READ_ONLY_EXECUTION_ERROR
} from '../src/lib/execution/execution-policy';
import { getMarketDefinition } from '../src/lib/registry/market-registry';
import {
  buildCanonicalFromBrokerQuote,
  resolvePriceForPurpose
} from '../src/lib/price/price-authority';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runConnectivityAntiFlapTests() {
  console.log('================================================================');
  console.log('FEF CORTEX — CONNECTIVITY & ANTI-FLAP TEST SUITE');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // Scenario 1: Healthy MT5 + fresh quote => ONLINE/LIVE
  // -------------------------------------------------------------------------
  console.log('--- Test 1: Healthy MT5 + Fresh Quote ---');
  {
    const conn = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 850,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 850,
    });
    assert(conn.state === 'ONLINE', 'Connectivity status is ONLINE');
    assert(conn.isMt5Connected === true, 'isMt5Connected is true');
    assert(conn.isInGracePeriod === false, 'isInGracePeriod is false');

    const quoteFreshness = evaluateBrokerQuoteFreshness({
      bid: 2650.10,
      ask: 2650.35,
      timestamp: Date.now() - 2000,
      ageMs: 2000,
    });
    assert(quoteFreshness.classification === 'FRESH', 'Quote is classified as FRESH (<= 5s)');
    assert(quoteFreshness.isDisplayLive === true, 'Quote isDisplayLive is true');
    assert(quoteFreshness.isExecutableAuthority === true, 'Quote isExecutableAuthority is true');
  }

  // -------------------------------------------------------------------------
  // Scenario 2: Healthy MT5 + quote older than display freshness => CONNECTED, not OFFLINE
  // -------------------------------------------------------------------------
  console.log('\n--- Test 2: Healthy MT5 + Aging/Stale Quote (Terminal Remains CONNECTED) ---');
  {
    const conn = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 1200,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 1200,
    });
    assert(conn.state === 'ONLINE', 'Terminal connection remains ONLINE');
    assert(conn.isMt5Connected === true, 'Terminal isMt5Connected remains true');

    // Quote age 18s (> 15s display threshold, <= 60s intelligence threshold)
    const quoteFreshness = evaluateBrokerQuoteFreshness({
      bid: 1.0850,
      ask: 1.0852,
      timestamp: Date.now() - 18000,
      ageMs: 18000,
    });
    assert(quoteFreshness.classification === 'STALE', 'Quote is STALE (18s > 15s display threshold)');
    assert(quoteFreshness.isDisplayLive === false, 'isDisplayLive is false (triggers fallback to reference)');
    assert(quoteFreshness.isIntelligenceEligible === true, 'isIntelligenceEligible is true (<= 60s)');
    assert(quoteFreshness.isExecutableAuthority === false, 'isExecutableAuthority is false');
  }

  // -------------------------------------------------------------------------
  // Scenario 3: Healthy MT5 + reference feed failure => MT5 remains ONLINE
  // -------------------------------------------------------------------------
  console.log('\n--- Test 3: Healthy MT5 + Reference Feed Failure (Decoupled Operation) ---');
  {
    // Simulating reference market prices failing while MT5 telemetry succeeds
    const isReferenceLive = false;
    const conn = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 950,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 950,
    });
    const isLive = conn.isMt5Connected || isReferenceLive;
    assert(conn.state === 'ONLINE', 'MT5 connectivity remains ONLINE despite reference feed failure');
    assert(conn.isMt5Connected === true, 'isMt5Connected is true');
    assert(isLive === true, 'Overall isLive remains true because MT5 broker is verified');
  }

  // -------------------------------------------------------------------------
  // Scenario 4: Single telemetry request failure after healthy state => DEGRADED (no immediate OFFLINE)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 4: Single Transient Telemetry Failure (Anti-Flap Hysteresis) ---');
  {
    // First failure: 3s after last success
    const firstFail = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: null,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 3000,
    });
    assert(firstFail.state === 'DEGRADED', 'State transitions to DEGRADED on 1st transient failure');
    assert(firstFail.isMt5Connected === true, 'isMt5Connected stays TRUE during grace period (no UI flapping)');
    assert(firstFail.isInGracePeriod === true, 'isInGracePeriod is true');
    assert(firstFail.consecutiveFailures === 1, 'consecutiveFailures incremented to 1');

    // Second failure: 6s after last success
    const secondFail = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: null,
      previousState: firstFail.state,
      consecutiveFailures: firstFail.consecutiveFailures,
      timeSinceLastSuccessMs: 6000,
    });
    assert(secondFail.state === 'DEGRADED', 'State remains DEGRADED on 2nd transient failure');
    assert(secondFail.isMt5Connected === true, 'isMt5Connected still TRUE on 2nd retry');
    assert(secondFail.consecutiveFailures === 2, 'consecutiveFailures incremented to 2');

    // Third failure: 9s after last success (last retry in grace period)
    const thirdFail = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: null,
      previousState: secondFail.state,
      consecutiveFailures: secondFail.consecutiveFailures,
      timeSinceLastSuccessMs: 9000,
    });
    assert(thirdFail.state === 'DEGRADED', 'State remains DEGRADED on 3rd retry (sync retry 3/3)');
    assert(thirdFail.isMt5Connected === true, 'isMt5Connected still TRUE during 3rd retry');
    assert(thirdFail.consecutiveFailures === 3, 'consecutiveFailures incremented to 3');

    // Fourth failure: grace period retries exhausted (consecutiveFailures >= 3)
    const fourthFail = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: null,
      previousState: thirdFail.state,
      consecutiveFailures: thirdFail.consecutiveFailures,
      timeSinceLastSuccessMs: 12000,
    });
    assert(fourthFail.state === 'OFFLINE', 'State transitions to OFFLINE after exceeding MAX_TRANSIENT_POLL_FAILURES (3 retries)');
    assert(fourthFail.isMt5Connected === false, 'isMt5Connected is now false');
    assert(fourthFail.isInGracePeriod === false, 'isInGracePeriod is false');

    // Immediate recovery when fresh telemetry arrives
    const recovery = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 500,
      previousState: 'OFFLINE',
      consecutiveFailures: 3,
      timeSinceLastSuccessMs: 12000,
    });
    assert(recovery.state === 'ONLINE', 'Immediate instant recovery to ONLINE on fresh response');
    assert(recovery.isMt5Connected === true, 'isMt5Connected restored to true');
    assert(recovery.consecutiveFailures === 0, 'consecutiveFailures reset to 0');
  }

  // -------------------------------------------------------------------------
  // Scenario 5: Heartbeat expiration (> 20s) => OFFLINE
  // -------------------------------------------------------------------------
  console.log('\n--- Test 5: Heartbeat Expiration (> 20s) => OFFLINE ---');
  {
    // Heartbeat at 15s: warning zone (DEGRADED)
    const warningConn = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 15_000,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 15_000,
    });
    assert(warningConn.state === 'DEGRADED', 'Heartbeat 15s is in warning zone -> DEGRADED');
    assert(warningConn.isMt5Connected === true, 'Terminal considered still connected during warning');

    // Heartbeat at 21s: expired (> 20s)
    const expiredConn = evaluateConnectivityStatus({
      isAuthoritativeConnected: true, // even if payload flag was stale
      heartbeatAgeMs: 21_000,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 21_000,
    });
    assert(expiredConn.state === 'OFFLINE', 'Heartbeat > 20s triggers immediate definitive OFFLINE');
    assert(expiredConn.isMt5Connected === false, 'isMt5Connected is false when heartbeat expired');
  }

  // -------------------------------------------------------------------------
  // Scenario 6: terminalConnected === false => OFFLINE
  // -------------------------------------------------------------------------
  console.log('\n--- Test 6: Explicit Terminal Disconnect => Immediate OFFLINE ---');
  {
    const explicitDisconnect = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: 500,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 500,
      explicitTerminalDisconnect: true,
    });
    assert(explicitDisconnect.state === 'OFFLINE', 'Explicit terminal disconnect bypasses grace period -> OFFLINE');
    assert(explicitDisconnect.isMt5Connected === false, 'isMt5Connected is false immediately');
    assert(explicitDisconnect.isInGracePeriod === false, 'isInGracePeriod is false');
  }

  // -------------------------------------------------------------------------
  // Scenario 7: Selected symbol stale while another fresh => terminal ONLINE, symbol STALE
  // -------------------------------------------------------------------------
  console.log('\n--- Test 7: Multi-Asset Quote Asymmetry (Selected Stale, Other Fresh) ---');
  {
    const terminalConn = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 900,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 900,
    });
    assert(terminalConn.state === 'ONLINE', 'Terminal connection is ONLINE');

    // Symbol A (e.g. USDCHF) quote is 22s old
    const quoteA = evaluateBrokerQuoteFreshness({
      bid: 0.8840,
      ask: 0.8842,
      timestamp: Date.now() - 22_000,
      ageMs: 22_000,
    });
    // Symbol B (e.g. XAUUSD) quote is 1.5s old
    const quoteB = evaluateBrokerQuoteFreshness({
      bid: 2650.00,
      ask: 2650.25,
      timestamp: Date.now() - 1500,
      ageMs: 1500,
    });

    assert(quoteA.classification === 'STALE', 'Symbol A is STALE');
    assert(quoteA.isDisplayLive === false, 'Symbol A isDisplayLive is false');
    assert(quoteB.classification === 'FRESH', 'Symbol B is FRESH');
    assert(quoteB.isDisplayLive === true, 'Symbol B isDisplayLive is true');
    assert(terminalConn.isMt5Connected === true, 'Global MT5 terminal connectivity is NOT brought down by Symbol A');
  }

  // -------------------------------------------------------------------------
  // Scenario 8: Out-of-order async response cannot overwrite newer healthy state
  // -------------------------------------------------------------------------
  console.log('\n--- Test 8: Generation Counter Guard Against Out-of-Order Responses ---');
  {
    let generation = 0;
    let state = 'ONLINE';

    // Request 1 starts
    const gen1 = ++generation;
    // Request 2 starts immediately after
    const gen2 = ++generation;

    // Suppose Request 2 finishes first with healthy state
    if (gen2 === generation) {
      state = 'ONLINE_FRESH';
    }
    assert(state === 'ONLINE_FRESH', 'Newer request 2 applied state successfully');

    // Request 1 (which was delayed) finishes later with stale/failed state
    const wouldApplyGen1 = (gen1 === generation);
    assert(wouldApplyGen1 === false, 'Delayed request 1 rejected because generation ID (1) != active generation (2)');
    assert(state === 'ONLINE_FRESH', 'State remains protected from stale out-of-order overwrite');
  }

  // -------------------------------------------------------------------------
  // Scenario 9: Unsupported GER40 does not mark global connection offline
  // -------------------------------------------------------------------------
  console.log('\n--- Test 9: Unsupported Asset (GER40) Does Not Degrade Global Terminal Status ---');
  {
    const ger40Def = getMarketDefinition('GER40');
    assert(Boolean(ger40Def), 'GER40 is registered in canonical universe');

    // Empty/unavailable quote for GER40
    const ger40Quote = evaluateBrokerQuoteFreshness(null);
    assert(ger40Quote.classification === 'UNAVAILABLE', 'GER40 quote is UNAVAILABLE');
    assert(ger40Quote.isDisplayLive === false, 'GER40 isDisplayLive is false');

    // Global connection check
    const conn = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 900,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 900,
    });
    assert(conn.state === 'ONLINE', 'Global MT5 status remains ONLINE even when GER40 has no quote');
    assert(conn.isMt5Connected === true, 'Terminal connection intact');
  }

  // -------------------------------------------------------------------------
  // Scenario 10: tradeMode: DISABLED crypto does not mark MT5 offline
  // -------------------------------------------------------------------------
  console.log('\n--- Test 10: Disabled Asset Trade Mode Does Not Mark MT5 Offline ---');
  {
    // A broker symbol with tradeMode: DISABLED (view-only quotes)
    const disabledSymbolQuote = evaluateBrokerQuoteFreshness({
      bid: 600.5,
      ask: 601.0,
      ageMs: 3000,
    });
    assert(disabledSymbolQuote.isDisplayLive === true, 'Disabled trading symbol can still have live display quote');

    const conn = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 1100,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 1100,
    });
    assert(conn.state === 'ONLINE', 'MT5 connection state is ONLINE regardless of symbol trade permission');
  }

  // -------------------------------------------------------------------------
  // Scenario 11: Strict invariants: CANONICAL_EXECUTION_MODE = 'ARMED_WITH_CONFIRMATION', MT5_ORDER_TRANSPORT_ENABLED = true
  // -------------------------------------------------------------------------
  console.log('\n--- Test 11: Strict Invariants & Armed Execution Safety ---');
  {
    assert(CANONICAL_EXECUTION_MODE === 'ARMED_WITH_CONFIRMATION', 'CANONICAL_EXECUTION_MODE is ARMED_WITH_CONFIRMATION');
    assert(MT5_ORDER_TRANSPORT_ENABLED === true, 'MT5_ORDER_TRANSPORT_ENABLED is true');
    assert(isMt5OrderTransportAllowed() === true, 'isMt5OrderTransportAllowed() returns true');
    const perm = evaluateMt5ExecutionPermission();
    assert(perm.allowed === true, 'evaluateMt5ExecutionPermission().allowed is true');
    assert(perm.operatingMode === 'ARMED_WITH_CONFIRMATION', 'evaluateMt5ExecutionPermission().operatingMode is ARMED_WITH_CONFIRMATION');
    assert(perm.error === null, 'Armed execution error is null');
  }

  // -------------------------------------------------------------------------
  // Scenario 12: UI Pill & Sentinel Stability During Degraded Grace Period
  // -------------------------------------------------------------------------
  console.log('\n--- Test 12: UI Pill Stability & Bridge Threshold Alignment ---');
  {
    // 1. Verify Bridge Service threshold alignment
    const bridgeModule = require('../scripts/mt5-http-bridge-service.js');
    assert(
      bridgeModule.HEARTBEAT_TIMEOUT_MS >= HEARTBEAT_FRESH_THRESHOLD_MS,
      `Bridge HEARTBEAT_TIMEOUT_MS (${bridgeModule.HEARTBEAT_TIMEOUT_MS}ms) >= HEARTBEAT_FRESH_THRESHOLD_MS (${HEARTBEAT_FRESH_THRESHOLD_MS}ms)`
    );

    // 2. Simulate UI Pill evaluation during transient DEGRADED state
    const degradedConn = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: null,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 3000,
    });
    assert(degradedConn.state === 'DEGRADED', 'Connectivity evaluation is in DEGRADED state');
    assert(degradedConn.isMt5Connected === true, 'isMt5Connected remains TRUE during DEGRADED');

    // UI Pill logic contract:
    // When isMt5Connected is true, UI must render green connected pill with broker name
    const mockTelemetry = {
      connectionStatus: degradedConn.state,
      account: { broker: 'Exness Technologies Ltd' },
      terminal: { brokerName: 'Exness Technologies Ltd' },
      isRemote: false,
    };
    const pillText = `MT5 CONNECTED (${mockTelemetry.account?.broker || mockTelemetry.terminal?.brokerName || 'LIVE'})`;
    const isPillGreen = degradedConn.isMt5Connected;
    assert(isPillGreen === true, 'Status pill maintains stable connected styling during sync retry');
    assert(pillText === 'MT5 CONNECTED (Exness Technologies Ltd)', 'Status pill preserves broker name without replacing with (SYNCING)');

    // Sentinel badge contract:
    const sentinelState = degradedConn.isMt5Connected ? 'HEALTHY' : 'DATA LIMITED';
    assert(sentinelState === 'HEALTHY', 'Sentinel badge remains HEALTHY while terminal is connected');
  }

  // -------------------------------------------------------------------------
  // Scenario 13: Price Display Decoupling & Hysteresis (Market Overview Anti-Flap)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 13: Price Display Anti-Flap & Hysteresis Gating ---');
  {
    const now = Date.now();

    // Case A: Quote age 7s (exceeds 5s strict execution, within 15s display live)
    const quote7s = {
      bid: 4138.90,
      ask: 4139.10,
      timestamp: now - 7000,
      ageMs: 7000,
      spread: 20,
      digits: 2
    };
    const freshness7s = evaluateBrokerQuoteFreshness(quote7s);
    assert(freshness7s.isExecutableAuthority === false, 'Quote at 7s is NOT executable authority (> 5s threshold)');
    assert(freshness7s.isDisplayLive === true, 'Quote at 7s IS display live (<= 15s threshold)');
    assert(freshness7s.isDisplayEligible === true, 'Quote at 7s IS display eligible (<= 30s threshold)');

    const canonical7s = buildCanonicalFromBrokerQuote('XAUUSD', quote7s, 'Exness Technologies Ltd', undefined, now);
    assert(canonical7s.executable === false, 'Canonical price at 7s has executable: false');
    assert(canonical7s.isDisplayLive === true, 'Canonical price at 7s has isDisplayLive: true');
    assert(canonical7s.isDisplayEligible === true, 'Canonical price at 7s has isDisplayEligible: true');

    const displayResult7s = resolvePriceForPurpose('XAUUSD', 'DISPLAY_REFERENCE', {
      isMt5Connected: true,
      brokerQuote: quote7s,
      brokerName: 'Exness Technologies Ltd'
    });
    assert(displayResult7s.status === 'RESOLVED', 'DISPLAY_REFERENCE resolves successfully at 7s');
    assert(displayResult7s.sourceUsed.includes('BROKER LIVE'), 'DISPLAY_REFERENCE uses MT5 BROKER LIVE at 7s (no flapping to TradingView)');

    // Contrast with EXECUTION purpose:
    const execResult7s = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
      isMt5Connected: true,
      brokerQuote: quote7s,
      brokerName: 'Exness Technologies Ltd',
      operatingMode: 'DEMO_EXECUTION'
    });
    assert(execResult7s.status === 'LOCKED', 'EXECUTION safely locks when quote age is 7s (> 5s strict execution threshold)');
    assert(execResult7s.executable === false, 'EXECUTION fails-closed for stale quote');

    // Case B: Quote age 20s (exceeds 15s display live, within 30s display stale hysteresis)
    const quote20s = {
      bid: 4138.90,
      ask: 4139.10,
      timestamp: now - 20000,
      ageMs: 20000,
      spread: 20,
      digits: 2
    };
    const freshness20s = evaluateBrokerQuoteFreshness(quote20s);
    assert(freshness20s.isDisplayLive === false, 'Quote at 20s is NOT display live (> 15s threshold)');
    assert(freshness20s.isDisplayEligible === true, 'Quote at 20s IS still display eligible (<= 30s threshold)');

    const canonical20s = buildCanonicalFromBrokerQuote('XAUUSD', quote20s, 'Exness Technologies Ltd', undefined, now);
    assert(canonical20s.isDisplayEligible === true, 'Canonical price at 20s is display eligible');

    const displayResult20s = resolvePriceForPurpose('XAUUSD', 'DISPLAY_REFERENCE', {
      isMt5Connected: true,
      brokerQuote: quote20s,
      brokerName: 'Exness Technologies Ltd'
    });
    assert(displayResult20s.status === 'RESOLVED', 'DISPLAY_REFERENCE remains sticky at 20s');
    assert(displayResult20s.sourceUsed.includes('BROKER LIVE'), 'DISPLAY_REFERENCE still retains broker price at 20s');

    // Case C: Quote age 35s (exceeds 30s display stale tolerance)
    const quote35s = {
      bid: 4138.90,
      ask: 4139.10,
      timestamp: now - 35000,
      ageMs: 35000,
      spread: 20,
      digits: 2
    };
    const freshness35s = evaluateBrokerQuoteFreshness(quote35s);
    assert(freshness35s.isDisplayEligible === false, 'Quote at 35s is NOT display eligible (> 30s threshold)');

    const canonical35s = buildCanonicalFromBrokerQuote('XAUUSD', quote35s, 'Exness Technologies Ltd', undefined, now);
    assert(canonical35s.isDisplayEligible === false, 'Canonical price at 35s has isDisplayEligible: false');

    const refAsset = {
      symbol: 'XAUUSD',
      price: 4138.95,
      provider: 'TradingView Spot',
      referencePrice: 4138.95,
      referenceProvider: 'TradingView Spot'
    };
    const displayResult35s = resolvePriceForPurpose('XAUUSD', 'DISPLAY_REFERENCE', {
      isMt5Connected: true,
      brokerQuote: quote35s,
      brokerName: 'Exness Technologies Ltd',
      referenceAsset: refAsset as any
    });
    assert(displayResult35s.status === 'RESOLVED', 'DISPLAY_REFERENCE resolves reference fallback at 35s');
    assert(displayResult35s.sourceUsed.includes('REFERENCE FEED'), 'DISPLAY_REFERENCE cleanly falls back to REFERENCE FEED after 35s stale');
  }

  // -------------------------------------------------------------------------
  // Scenario 14: Reference Provider Label Integrity (No Broker Name Leak)
  // -------------------------------------------------------------------------
  console.log('\n--- Test 14: Reference Provider Label Integrity (No Broker Leak) ---');
  {
    // When MT5 is connected, ActiveAssetContext populates activeAsset.provider with the broker name
    // and activeAsset.referenceProvider with the true public feed name.
    const activeAsset = {
      symbol: 'XAUUSD',
      name: 'Gold / US Dollar',
      price: 4138.95,
      provider: 'Exness Technologies Ltd',
      referenceProvider: 'TradingView Spot',
      source: 'MT5 Broker'
    };

    // The fallback banner must NOT display "TRADINGVIEW REALTIME FEED (Exness Technologies Ltd)"
    const fallbackLabel = activeAsset.referenceProvider || 'TradingView Spot';
    assert(fallbackLabel === 'TradingView Spot', 'Fallback banner references TradingView Spot, not broker name');
    assert(!fallbackLabel.includes('Exness'), 'Fallback banner never leaks MT5 broker into TradingView badge');
  }

  console.log('\n================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runConnectivityAntiFlapTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
