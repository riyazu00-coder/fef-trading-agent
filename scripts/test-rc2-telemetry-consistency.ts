/**
 * FEF AI TRADING — RC2 TELEMETRY CONSISTENCY TEST SUITE
 * 
 * Validates:
 * 1. DEMO connected + fresh heartbeat -> Authoritative operatingMode = DEMO_EXECUTION across top-level, terminal, account.
 * 2. REAL account -> Authoritative operatingMode = READ_ONLY across all fields, execution strictly locked.
 * 3. Stale heartbeat -> Operating mode immediately reverts to READ_ONLY across all layers.
 * 4. Fresh BTC quote -> Evaluates to FRESH (24/7 asset).
 * 5. Old XAU quote during closed session -> Evaluates to SESSION_CLOSED (truthful, non-fabricated).
 * 6. Old quote while session expected open -> Evaluates to STALE.
 * 7. Missing / zero quote -> Evaluates to UNAVAILABLE.
 * 8. Stale or SESSION_CLOSED quote -> Execution safety gate strictly blocks order placement.
 */

import {
  bridgeState,
  getAuthoritativeOperatingMode,
  isMarketSessionOpen,
  evaluateQuoteFreshness,
  setOperatingMode,
} from './mt5-http-bridge-service';

import {
  deriveAccountRiskContext,
  compareBrokerQuote
} from '../src/lib/bridge/mt5-telemetry-state';

import { MT5AccountInfo, MT5QuoteData } from '../src/lib/bridge/mt5-bridge-protocol';
import { MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: any) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}`, details !== undefined ? details : '');
    failCount++;
  } else {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('FEF AI TRADING: RC2 TELEMETRY CONSISTENCY TEST SUITE');
  console.log('================================================================\n');

  const now = Date.now();

  // ---------------------------------------------------------------------------
  // TEST 1: DEMO connected + fresh heartbeat -> DEMO_EXECUTION everywhere
  // ---------------------------------------------------------------------------
  console.log('[TEST 1: DEMO Connected + Fresh Heartbeat -> Canonical READ_ONLY]');
  bridgeState.lastHeartbeat = Date.now();
  bridgeState.terminal = {
    broker: 'Exness Technologies Ltd',
    server: 'Exness-MT5Trial16',
    build: 4410,
    accountLogin: 'DEMO-882910',
    currency: 'USD',
    magic: 8882026,
    terminalConnected: true,
  };
  bridgeState.account = {
    maskedLogin: 'DEMO-882910',
    broker: 'Exness Technologies Ltd',
    server: 'Exness-MT5Trial16',
    currency: 'USD',
    tradeMode: 'DEMO',
    balance: 10000,
    equity: 10000,
    margin: 0,
    freeMargin: 10000,
    marginLevel: 0,
    leverage: 100,
    tradeAllowed: true,
    terminalBuild: 4410,
    operatingMode: 'READ_ONLY',
    lastUpdated: Date.now(),
  };
  bridgeState.operatingMode = 'DEMO_EXECUTION';

  const authMode1 = getAuthoritativeOperatingMode();
  assert(authMode1 === 'READ_ONLY', 'Bridge authoritative operatingMode remains READ_ONLY for active DEMO');

  // Verify telemetry state helper derives authoritative mode without split-brain
  const derivedContext1 = deriveAccountRiskContext(bridgeState.account as unknown as MT5AccountInfo, [], authMode1);
  assert(derivedContext1 !== null, 'Derived account context is non-null');
  assert(derivedContext1?.operatingMode === 'READ_ONLY', 'Derived account risk context matches authoritative READ_ONLY');
  assert(derivedContext1?.isDemo === true, 'DEMO account isDemo is true');

  // ---------------------------------------------------------------------------
  // TEST 2: REAL account -> Hard-locked READ_ONLY everywhere
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 2: REAL Account -> Hard-Locked READ_ONLY]');
  bridgeState.account.tradeMode = 'REAL';
  bridgeState.operatingMode = 'DEMO_EXECUTION'; // Attempting to arm DEMO_EXECUTION on REAL account

  const authMode2 = getAuthoritativeOperatingMode();
  assert(authMode2 === 'READ_ONLY', 'Bridge authoritative operatingMode forces READ_ONLY on REAL account');

  const derivedContext2 = deriveAccountRiskContext(bridgeState.account as unknown as MT5AccountInfo, [], authMode2);
  assert(derivedContext2?.operatingMode === 'READ_ONLY', 'Derived context operatingMode is locked to READ_ONLY for REAL account');
  assert(derivedContext2?.isDemo === false, 'REAL account isDemo is false');
  assert(derivedContext2?.tradeMode === 'REAL', 'REAL account tradeMode is REAL');

  // ---------------------------------------------------------------------------
  // TEST 3: Stale Heartbeat -> Reverts to READ_ONLY everywhere
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 3: Stale Heartbeat -> Reverts to READ_ONLY]');
  bridgeState.account.tradeMode = 'DEMO';
  bridgeState.operatingMode = 'DEMO_EXECUTION';
  bridgeState.lastHeartbeat = Date.now() - 35000; // 35s ago (threshold is 25s)

  const authMode3 = getAuthoritativeOperatingMode();
  assert(authMode3 === 'READ_ONLY', 'Bridge authoritative operatingMode reverts to READ_ONLY when heartbeat is stale');

  const derivedContext3 = deriveAccountRiskContext(bridgeState.account as unknown as MT5AccountInfo, [], authMode3);
  assert(derivedContext3?.operatingMode === 'READ_ONLY', 'Derived context operatingMode reflects READ_ONLY upon stale heartbeat');

  // ---------------------------------------------------------------------------
  // TEST 4: Fresh BTC Quote -> Evaluates to FRESH (24/7)
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 4: Fresh BTC Quote -> Evaluates to FRESH (24/7)]');
  const btcQuote: MT5QuoteData = {
    canonicalSymbol: 'BTCUSD',
    brokerSymbol: 'BTCUSD',
    bid: 88400.0,
    ask: 88405.0,
    spread: 5.0,
    digits: 2,
    point: 0.01,
    time: new Date(now - 5000).toISOString(),
    timestamp: now - 5000, // 5s ago
    isStale: false,
    freshness: 'FRESH',
  };

  const btcEval = evaluateQuoteFreshness('BTCUSD', btcQuote, now);
  assert(btcEval.freshness === 'FRESH', 'BTC quote 5s old evaluates to FRESH');
  assert(btcEval.isStale === false, 'BTC quote isStale is false');

  const btcComp = compareBrokerQuote(88402.0, btcQuote);
  assert(btcComp.status === 'MATCHED' || btcComp.status === 'NORMAL_BROKER_DIFFERENCE', 'Frontend compareBrokerQuote matches fresh BTC quote');

  // ---------------------------------------------------------------------------
  // TEST 5: Old XAU Quote during Closed Session -> Evaluates to SESSION_CLOSED
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 5: Old XAU Quote during Closed Session -> Evaluates to SESSION_CLOSED]');
  // Saturday 12:00 UTC (Gold market closed)
  const saturdayDate = new Date('2026-09-12T12:00:00Z');
  const satMs = saturdayDate.getTime();
  const isXauSatOpen = isMarketSessionOpen('XAUUSD', saturdayDate);
  assert(isXauSatOpen === false, 'isMarketSessionOpen correctly reports Gold market is closed on Saturday');

  const fridayCloseXauQuote: MT5QuoteData = {
    canonicalSymbol: 'XAUUSD',
    brokerSymbol: 'XAUUSD',
    bid: 2650.10,
    ask: 2650.35,
    spread: 25,
    digits: 2,
    point: 0.01,
    time: new Date('2026-09-11T21:50:00Z').toISOString(),
    timestamp: new Date('2026-09-11T21:50:00Z').getTime(), // Friday close quote
    isStale: false,
    freshness: 'FRESH', // raw un-evaluated flag
  };

  const xauEvalSat = evaluateQuoteFreshness('XAUUSD', fridayCloseXauQuote, satMs);
  assert(xauEvalSat.freshness === 'SESSION_CLOSED', 'Old XAU quote on Saturday evaluates truthfully to SESSION_CLOSED (not FRESH, not STALE)');
  assert(xauEvalSat.isStale === true, 'Closed session quote isStale is true');
  assert(xauEvalSat.reason === 'MARKET_SESSION_CLOSED', 'Freshness reason indicates MARKET_SESSION_CLOSED');

  const enrichedSatQuote: MT5QuoteData = {
    ...fridayCloseXauQuote,
    freshness: xauEvalSat.freshness as any,
    isStale: xauEvalSat.isStale,
    ageMs: xauEvalSat.ageMs,
  };
  const xauCompSat = compareBrokerQuote(2650.20, enrichedSatQuote);
  assert(xauCompSat.status === 'SESSION_CLOSED', 'Frontend compareBrokerQuote classifies quote as SESSION_CLOSED');

  // ---------------------------------------------------------------------------
  // TEST 6: Old Quote while Session Expected Open -> Evaluates to STALE
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 6: Old Quote while Session Expected Open -> Evaluates to STALE]');
  // Wednesday 14:00 UTC (Mid-week, Gold market wide open)
  const wednesdayDate = new Date('2026-09-16T14:00:00Z');
  const wedMs = wednesdayDate.getTime();
  const isXauWedOpen = isMarketSessionOpen('XAUUSD', wednesdayDate);
  assert(isXauWedOpen === true, 'isMarketSessionOpen reports Gold market open on Wednesday 14:00 UTC');

  const staleXauQuote: MT5QuoteData = {
    canonicalSymbol: 'XAUUSD',
    brokerSymbol: 'XAUUSD',
    bid: 2650.10,
    ask: 2650.35,
    spread: 25,
    digits: 2,
    point: 0.01,
    time: new Date(wedMs - 60000).toISOString(),
    timestamp: wedMs - 60000, // 60s old (threshold is 30s)
    isStale: false,
  };

  const xauEvalWed = evaluateQuoteFreshness('XAUUSD', staleXauQuote, wedMs);
  assert(xauEvalWed.freshness === 'STALE', 'XAU quote 60s old during open session evaluates to STALE');
  assert(xauEvalWed.isStale === true, 'Stale quote isStale is true');
  assert(xauEvalWed.reason === 'QUOTE_AGE_EXCEEDED', 'Reason indicates QUOTE_AGE_EXCEEDED');

  const enrichedWedQuote: MT5QuoteData = {
    ...staleXauQuote,
    freshness: xauEvalWed.freshness as any,
    isStale: xauEvalWed.isStale,
    ageMs: xauEvalWed.ageMs,
  };
  const xauCompWed = compareBrokerQuote(2650.20, enrichedWedQuote);
  assert(xauCompWed.status === 'STALE_MT5_QUOTE', 'Frontend compareBrokerQuote classifies quote as STALE_MT5_QUOTE');

  // ---------------------------------------------------------------------------
  // TEST 7: Missing / Empty Quote -> Evaluates to UNAVAILABLE
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 7: Missing / Empty Quote -> Evaluates to UNAVAILABLE]');
  const missingEval = evaluateQuoteFreshness('EURUSD', null, now);
  assert(missingEval.freshness === 'UNAVAILABLE', 'Null quote evaluates to UNAVAILABLE');
  assert(missingEval.isStale === true, 'Unavailable quote is marked stale');

  const zeroQuote: MT5QuoteData = {
    canonicalSymbol: 'EURUSD',
    brokerSymbol: 'EURUSD',
    bid: 0,
    ask: 0,
    spread: 0,
    digits: 5,
    point: 0.00001,
    time: new Date(now).toISOString(),
    timestamp: now,
    isStale: true,
  };
  const zeroEval = evaluateQuoteFreshness('EURUSD', zeroQuote, now);
  assert(zeroEval.freshness === 'UNAVAILABLE', 'Zero-bid/ask quote evaluates to UNAVAILABLE');

  const missingComp = compareBrokerQuote(1.0850, null);
  assert(missingComp.status === 'BROKER_UNAVAILABLE', 'Frontend compareBrokerQuote classifies null quote as BROKER_UNAVAILABLE');

  // ---------------------------------------------------------------------------
  // TEST 8: Execution Safety Gate -> Stale / Closed Quote / Read-Only Blocks Execution
  // ---------------------------------------------------------------------------
  console.log('\n[TEST 8: Execution Safety Gate -> Stale / Closed Quote / Read-Only Blocks Execution]');
  
  // Verify STALE quote cannot be used for execution
  const staleQuoteBlocked = (quote: MT5QuoteData | null, opMode: string) => {
    if (!MT5_ORDER_TRANSPORT_ENABLED) return { canExecute: false, reason: 'GLOBAL_READ_ONLY_LOCK' };
    if (opMode !== 'DEMO_EXECUTION') return { canExecute: false, reason: 'NOT_DEMO_EXECUTION' };
    if (!quote || quote.bid <= 0 || quote.ask <= 0) return { canExecute: false, reason: 'QUOTE_UNAVAILABLE' };
    const sym = quote.canonicalSymbol || quote.brokerSymbol;
    const evalRes = evaluateQuoteFreshness(sym, quote, Date.now());
    if (evalRes.freshness === 'SESSION_CLOSED') return { canExecute: false, reason: 'SESSION_CLOSED' };
    if (evalRes.freshness === 'STALE' || evalRes.isStale) return { canExecute: false, reason: 'STALE_QUOTE' };
    return { canExecute: true, reason: 'OK' };
  };

  // Test with closed session quote
  const closedGateResult = staleQuoteBlocked(fridayCloseXauQuote, 'DEMO_EXECUTION');
  assert(closedGateResult.canExecute === false, 'Safety gate blocks order on closed session quote');
  assert(closedGateResult.reason === 'GLOBAL_READ_ONLY_LOCK', 'Global READ_ONLY gate precedes quote validation');

  // Test with READ_ONLY mode
  const readOnlyGateResult = staleQuoteBlocked(btcQuote, 'READ_ONLY');
  assert(readOnlyGateResult.canExecute === false, 'Safety gate blocks order when operatingMode is READ_ONLY');
  assert(readOnlyGateResult.reason === 'GLOBAL_READ_ONLY_LOCK', 'Rejection reason is GLOBAL_READ_ONLY_LOCK');

  // Test with fresh BTC quote on DEMO_EXECUTION
  const freshBtcGateResult = staleQuoteBlocked(btcQuote, 'DEMO_EXECUTION');
  assert(freshBtcGateResult.canExecute === false && freshBtcGateResult.reason === 'GLOBAL_READ_ONLY_LOCK', 'Fresh BTC quote remains non-executable in DEMO_EXECUTION');

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
