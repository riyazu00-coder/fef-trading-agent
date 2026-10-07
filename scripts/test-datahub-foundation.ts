/**
 * FEF TRADING SOLUTIONS — DATAHUB FOUNDATION TEST SUITE (SPRINT 1A)
 * 
 * Verifies:
 * A. Single-flight concurrent request deduplication
 * B. Single-flight rejection cleanup & retry safety
 * C. TTL caching, freshness evaluation, & timestamp immutability
 * D. Symbol, timeframe, topic, & provider context isolation
 * E. Pub/Sub subscription, wildcard broadcast, & exception isolation
 * F. Provider health transition (HEALTHY -> DEGRADED -> OFFLINE -> RECOVERY)
 * G. Truthfulness & fail-closed behavior (no fake prices, no synthetic timestamps)
 * H. Execution Safety Boundary: DataHub CANNOT express, evaluate, or grant execution eligibility.
 *    DataHubEnvelope exposes ZERO isExecutable property.
 */

import { FEFDataHub, formatDataHubKey, DataHubEnvelope } from '../src/lib/datahub';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    process.exit(1);
  }
}

async function runTestSuite() {
  console.log('=================================================================');
  console.log('FEF CORTEX: DATAHUB FOUNDATION TEST SUITE (SPRINT 1A - REVISED)');
  console.log('=================================================================\n');

  // Time-mocked DataHub instance
  let currentTime = 1700000000000;
  const mockNow = () => currentTime;
  const hub = new FEFDataHub({ now: mockNow });

  // -------------------------------------------------------------
  // TEST GROUP A: Single-Flight Concurrent Request Deduplication
  // -------------------------------------------------------------
  console.log('[GROUP A: SINGLE-FLIGHT CONCURRENT REQUEST DEDUPLICATION]');
  let providerFetchCount = 0;

  const mockFetcher = async (): Promise<DataHubEnvelope<{ value: number }>> => {
    providerFetchCount++;
    // Simulate async network delay
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      topic: 'macro',
      symbol: 'US10Y',
      key: formatDataHubKey({ topic: 'macro', symbol: 'US10Y', provider: 'fred' }),
      provider: 'fred',
      sourceType: 'PUBLIC_API',
      provenance: 'LIVE_EXTERNAL',
      observedAt: currentTime,
      receivedAt: currentTime,
      ageMs: 0,
      ttlMs: 60000,
      freshness: 'FRESH',
      isStale: false,
      isAvailable: true,
      payload: { value: 4.25 },
    };
  };

  // Launch 10 simultaneous fetch requests for the exact same key
  const fetchPromises = Array.from({ length: 10 }, () =>
    hub.fetch<{ value: number }>({ topic: 'macro', symbol: 'US10Y', provider: 'fred' }, mockFetcher)
  );

  const results = await Promise.all(fetchPromises);

  assert(
    providerFetchCount === 1,
    'Single-flight deduplicates 10 concurrent requests to exactly 1 provider execution',
    `Expected providerFetchCount = 1, got ${providerFetchCount}`
  );

  assert(
    results.length === 10 && results.every((r) => r.payload?.value === 4.25),
    'All 10 concurrent consumers receive the identical resolved envelope'
  );

  // -------------------------------------------------------------
  // TEST GROUP B: Single-Flight Rejection Cleanup & Retry Safety
  // -------------------------------------------------------------
  console.log('\n[GROUP B: SINGLE-FLIGHT REJECTION CLEANUP & RETRY SAFETY]');
  let failAttemptCount = 0;

  const failingFetcher = async (): Promise<DataHubEnvelope<any>> => {
    failAttemptCount++;
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new Error('Simulated network timeout');
  };

  // 3 concurrent requests to failing endpoint
  const failPromises = Array.from({ length: 3 }, () =>
    hub.fetch({ topic: 'macro', symbol: 'FAIL_TEST', provider: 'failing_api' }, failingFetcher)
  );

  const failResults = await Promise.all(failPromises);

  assert(
    failAttemptCount === 1,
    'Failing single-flight executes failing provider only once across concurrent requests',
    `Expected 1 call, got ${failAttemptCount}`
  );

  assert(
    failResults.every((r) => r.freshness === 'UNAVAILABLE' && r.error?.code === 'FETCH_FAILED'),
    'All consumers receive fail-closed UNAVAILABLE envelope without throwing unhandled exceptions'
  );

  // Verify subsequent fetch after failure CAN retry and is not permanently blocked
  let retryCount = 0;
  const recoveringFetcher = async (): Promise<DataHubEnvelope<{ recovered: boolean }>> => {
    retryCount++;
    return {
      topic: 'macro',
      symbol: 'FAIL_TEST',
      key: formatDataHubKey({ topic: 'macro', symbol: 'FAIL_TEST', provider: 'failing_api' }),
      provider: 'failing_api',
      sourceType: 'PUBLIC_API',
      provenance: 'LIVE_EXTERNAL',
      observedAt: currentTime,
      receivedAt: currentTime,
      ageMs: 0,
      ttlMs: 60000,
      freshness: 'FRESH',
      isStale: false,
      isAvailable: true,
      payload: { recovered: true },
    };
  };

  const retryResult = await hub.fetch<{ recovered: boolean }>(
    { topic: 'macro', symbol: 'FAIL_TEST', provider: 'failing_api' },
    recoveringFetcher,
    { forceRefresh: true }
  );

  assert(
    retryResult.payload?.recovered === true && retryCount === 1,
    'Subsequent fetch after failure retries cleanly without getting poisoned'
  );

  // -------------------------------------------------------------
  // TEST GROUP C: TTL Caching, Freshness, & Timestamp Immutability
  // -------------------------------------------------------------
  console.log('\n[GROUP C: TTL CACHING, FRESHNESS, & TIMESTAMP IMMUTABILITY]');
  const originalObservedAt = currentTime;

  hub.publish<{ price: number }>({
    topic: 'quote',
    symbol: 'EURUSD',
    key: formatDataHubKey({ topic: 'quote', symbol: 'EURUSD', provider: 'yahoo' }),
    provider: 'yahoo',
    sourceType: 'PUBLIC_API',
    provenance: 'LIVE_EXTERNAL',
    observedAt: originalObservedAt,
    receivedAt: originalObservedAt,
    ageMs: 0,
    ttlMs: 5000, // 5 second TTL
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { price: 1.0850 },
  });

  // Verify fresh cache hit
  const freshSnapshot = hub.getSnapshot<{ price: number }>({ topic: 'quote', symbol: 'EURUSD', provider: 'yahoo' });
  assert(
    freshSnapshot !== null && freshSnapshot.freshness === 'FRESH' && !freshSnapshot.isStale,
    'Fresh item retrieved from cache within TTL'
  );

  // Advance time past TTL (6 seconds)
  currentTime += 6000;

  const expiredSnapshot = hub.getSnapshot<{ price: number }>(
    { topic: 'quote', symbol: 'EURUSD', provider: 'yahoo' },
    false // do not allow stale
  );
  assert(
    expiredSnapshot === null,
    'Expired item returns null when allowStale is false'
  );

  const staleSnapshot = hub.getSnapshot<{ price: number }>(
    { topic: 'quote', symbol: 'EURUSD', provider: 'yahoo' },
    true // allow stale
  );
  assert(
    staleSnapshot !== null && staleSnapshot.freshness === 'STALE' && staleSnapshot.isStale,
    'Expired item truthfully evaluates as STALE when allowStale is true'
  );

  assert(
    staleSnapshot?.observedAt === originalObservedAt,
    'Original observation timestamp is preserved immutably (no timestamp rewriting)',
    `Expected ${originalObservedAt}, got ${staleSnapshot?.observedAt}`
  );

  assert(
    staleSnapshot?.ageMs === 6000,
    'Envelope accurately calculates true elapsed age in milliseconds',
    `Expected 6000ms, got ${staleSnapshot?.ageMs}ms`
  );

  // -------------------------------------------------------------
  // TEST GROUP D: Context Isolation (Symbol, Timeframe, Provider)
  // -------------------------------------------------------------
  console.log('\n[GROUP D: CONTEXT ISOLATION (SYMBOL, TIMEFRAME, PROVIDER)]');

  // Ingest XAUUSD quote
  hub.publish({
    topic: 'quote',
    symbol: 'XAUUSD',
    key: formatDataHubKey({ topic: 'quote', symbol: 'XAUUSD', provider: 'exness' }),
    provider: 'exness',
    sourceType: 'BROKER_DIRECT',
    provenance: 'LIVE_MT5',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 10000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { bid: 2750.10, ask: 2750.30 },
  });

  // Ingest M5 candles for EURUSD
  hub.publish({
    topic: 'candles',
    symbol: 'EURUSD',
    timeframe: 'M5',
    key: formatDataHubKey({ topic: 'candles', symbol: 'EURUSD', timeframe: 'M5', provider: 'yahoo' }),
    provider: 'yahoo',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 300000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { candleCount: 100, barTime: 'M5_BAR' },
  });

  // Ingest H1 candles for EURUSD
  hub.publish({
    topic: 'candles',
    symbol: 'EURUSD',
    timeframe: 'H1',
    key: formatDataHubKey({ topic: 'candles', symbol: 'EURUSD', timeframe: 'H1', provider: 'yahoo' }),
    provider: 'yahoo',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 3600000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { candleCount: 200, barTime: 'H1_BAR' },
  });

  // 1. Symbol Isolation: XAUUSD cannot be retrieved as EURUSD
  const eurusdQuote = hub.getSnapshot({ topic: 'quote', symbol: 'EURUSD', provider: 'exness' });
  assert(
    eurusdQuote === null,
    'Symbol Isolation: XAUUSD quote cannot leak to EURUSD query'
  );

  // 2. Timeframe Isolation: M5 candles cannot be retrieved as H1
  const h1Snapshot = hub.getSnapshot<{ candleCount: number; barTime: string }>({
    topic: 'candles',
    symbol: 'EURUSD',
    timeframe: 'H1',
    provider: 'yahoo',
  });
  const m5Snapshot = hub.getSnapshot<{ candleCount: number; barTime: string }>({
    topic: 'candles',
    symbol: 'EURUSD',
    timeframe: 'M5',
    provider: 'yahoo',
  });

  assert(
    h1Snapshot?.payload?.barTime === 'H1_BAR' && m5Snapshot?.payload?.barTime === 'M5_BAR',
    'Timeframe Isolation: H1 and M5 candle stores remain strictly isolated'
  );

  // 3. Provider Isolation: Provider A cannot masquerade as Provider B
  const binanceQuote = hub.getSnapshot({ topic: 'quote', symbol: 'XAUUSD', provider: 'binance' });
  assert(
    binanceQuote === null,
    'Provider Isolation: Exness quote cannot satisfy Binance query'
  );

  // -------------------------------------------------------------
  // TEST GROUP E: Pub/Sub Subscription, Wildcard, & Exception Isolation
  // -------------------------------------------------------------
  console.log('\n[GROUP E: PUB/SUB SUBSCRIPTION & EXCEPTION ISOLATION]');
  let subscriberEventCount = 0;
  let receivedPayloadVal = 0;

  // Exact topic subscription
  const sub = hub.subscribe<{ val: number }>(
    { topic: 'signal', symbol: 'BTCUSD', provider: 'test_engine' },
    (envelope) => {
      subscriberEventCount++;
      receivedPayloadVal = envelope.payload?.val || 0;
    }
  );

  // Wildcard topic subscription (all providers for BTCUSD signal)
  let wildcardCount = 0;
  const wildcardSub = hub.subscribe(
    { topic: 'signal', symbol: 'BTCUSD', provider: '*' },
    () => {
      wildcardCount++;
    }
  );

  // Throwing subscriber (must NOT break the other subscribers)
  let postCrashSubscriberRan = false;
  hub.subscribe(
    { topic: 'signal', symbol: 'BTCUSD', provider: 'test_engine' },
    () => {
      throw new Error('Subscriber intentional throw for test containment');
    }
  );

  // Second subscriber registered after the throwing one
  hub.subscribe(
    { topic: 'signal', symbol: 'BTCUSD', provider: 'test_engine' },
    () => {
      postCrashSubscriberRan = true;
    }
  );

  // Publish event
  hub.publish({
    topic: 'signal',
    symbol: 'BTCUSD',
    key: formatDataHubKey({ topic: 'signal', symbol: 'BTCUSD', provider: 'test_engine' }),
    provider: 'test_engine',
    sourceType: 'DERIVED_MATH',
    provenance: 'DERIVED',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 5000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { val: 99 },
  });

  assert(
    subscriberEventCount === 1 && receivedPayloadVal === 99,
    'Subscriber receives published envelope accurately'
  );

  assert(
    wildcardCount === 1,
    'Wildcard subscriber accurately matches broadcast event'
  );

  assert(
    postCrashSubscriberRan === true,
    'Exception Isolation: Throwing subscriber does not abort or crash sibling subscribers'
  );

  // Test Unsubscribe
  sub.unsubscribe();
  hub.publish({
    topic: 'signal',
    symbol: 'BTCUSD',
    key: formatDataHubKey({ topic: 'signal', symbol: 'BTCUSD', provider: 'test_engine' }),
    provider: 'test_engine',
    sourceType: 'DERIVED_MATH',
    provenance: 'DERIVED',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 5000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { val: 100 },
  });

  assert(
    subscriberEventCount === 1,
    'Unsubscribe cleanly stops event delivery without residual callbacks',
    `Expected count = 1, got ${subscriberEventCount}`
  );

  // -------------------------------------------------------------
  // TEST GROUP F: Provider Health Model
  // -------------------------------------------------------------
  console.log('\n[GROUP F: PROVIDER HEALTH MODEL]');

  // Success recording
  hub.publish({
    topic: 'feed',
    key: 'feed:*:*:test_feed',
    provider: 'test_feed',
    sourceType: 'PUBLIC_API',
    provenance: 'LIVE_EXTERNAL',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 60000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { ok: true },
  });

  let health = hub.getProviderHealth('test_feed');
  assert(
    health !== null && health.status === 'HEALTHY' && health.consecutiveSuccesses === 1,
    'Provider marks HEALTHY after successful data ingestion'
  );

  // Consecutive failures -> DEGRADED -> OFFLINE
  for (let i = 0; i < 3; i++) {
    hub.publish({
      topic: 'feed',
      key: 'feed:*:*:test_feed',
      provider: 'test_feed',
      sourceType: 'PUBLIC_API',
      provenance: 'UNAVAILABLE',
      observedAt: currentTime,
      receivedAt: currentTime,
      ageMs: 0,
      ttlMs: 0,
      freshness: 'UNAVAILABLE',
      isStale: true,
      isAvailable: false,
      payload: null,
      error: { code: 'HTTP_500', message: 'Down', timestamp: currentTime },
    });
  }

  health = hub.getProviderHealth('test_feed');
  assert(
    health?.status === 'DEGRADED' && health?.consecutiveFailures === 3,
    'Provider transitions to DEGRADED after 3 consecutive failures'
  );

  for (let i = 0; i < 3; i++) {
    hub.publish({
      topic: 'feed',
      key: 'feed:*:*:test_feed',
      provider: 'test_feed',
      sourceType: 'PUBLIC_API',
      provenance: 'UNAVAILABLE',
      observedAt: currentTime,
      receivedAt: currentTime,
      ageMs: 0,
      ttlMs: 0,
      freshness: 'UNAVAILABLE',
      isStale: true,
      isAvailable: false,
      payload: null,
      error: { code: 'HTTP_500', message: 'Down', timestamp: currentTime },
    });
  }

  health = hub.getProviderHealth('test_feed');
  assert(
    health?.status === 'OFFLINE' && health?.consecutiveFailures === 6,
    'Provider transitions to OFFLINE after 6 consecutive failures'
  );

  // Recovery
  hub.publish({
    topic: 'feed',
    key: 'feed:*:*:test_feed',
    provider: 'test_feed',
    sourceType: 'PUBLIC_API',
    provenance: 'LIVE_EXTERNAL',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 60000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { ok: true },
  });

  health = hub.getProviderHealth('test_feed');
  assert(
    health?.status === 'HEALTHY' && health?.consecutiveFailures === 0,
    'Provider recovers to HEALTHY on first verified successful publication'
  );

  // -------------------------------------------------------------
  // TEST GROUP G: Truthfulness & Fail-Closed Safeguards
  // -------------------------------------------------------------
  console.log('\n[GROUP G: TRUTHFULNESS & FAIL-CLOSED SAFEGUARDS]');

  const unavailableEnv = hub.publish({
    topic: 'order_flow',
    symbol: 'XAUUSD',
    key: formatDataHubKey({ topic: 'order_flow', symbol: 'XAUUSD', provider: 'none' }),
    provider: 'none',
    sourceType: 'UNAVAILABLE',
    provenance: 'UNAVAILABLE',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 0,
    freshness: 'UNAVAILABLE',
    isStale: true,
    isAvailable: false,
    payload: null,
  });

  assert(
    unavailableEnv.isAvailable === false && unavailableEnv.payload === null,
    'Fail-closed: Unavailable feed publishes explicit isAvailable=false with null payload (zero synthetic values)'
  );

  // -------------------------------------------------------------
  // TEST GROUP H: Strict Execution Boundary & Authority Invariance
  // -------------------------------------------------------------
  console.log('\n[GROUP H: STRICT EXECUTION BOUNDARY & ZERO EXECUTION AUTHORITY]');

  // Test Case A: LIVE_MT5 + BROKER_DIRECT remains broker-origin data only (ZERO execution authority)
  const brokerDirectEnv = hub.publish({
    topic: 'quote',
    symbol: 'XAUUSD',
    key: formatDataHubKey({ topic: 'quote', symbol: 'XAUUSD', provider: 'exness' }),
    provider: 'exness',
    sourceType: 'BROKER_DIRECT',
    provenance: 'LIVE_MT5',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 1000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { bid: 2750.10, ask: 2750.30 },
  });

  assert(
    (brokerDirectEnv as any).isExecutable === undefined,
    'Case A: LIVE_MT5 + BROKER_DIRECT envelope does NOT expose isExecutable property'
  );
  assert(
    brokerDirectEnv.provenance === 'LIVE_MT5' && brokerDirectEnv.sourceType === 'BROKER_DIRECT',
    'Case A: Preserves factual broker telemetry origin without claiming execution authority'
  );

  // Test Case B: LIVE_MT5 + PUBLIC_API (mismatched/adversarial) cannot gain execution semantics
  const mismatchedMt5Env = hub.publish({
    topic: 'quote',
    symbol: 'XAUUSD',
    key: formatDataHubKey({ topic: 'quote', symbol: 'XAUUSD', provider: 'untrusted_api' }),
    provider: 'untrusted_api',
    sourceType: 'PUBLIC_API',
    provenance: 'LIVE_MT5',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 1000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { price: 2750.20 },
  });

  assert(
    (mismatchedMt5Env as any).isExecutable === undefined,
    'Case B: LIVE_MT5 + PUBLIC_API cannot gain execution semantics'
  );

  // Test Case C: INDEPENDENT_REFERENCE + BROKER_DIRECT cannot gain execution semantics
  const mismatchedRefEnv = hub.publish({
    topic: 'quote',
    symbol: 'XAUUSD',
    key: formatDataHubKey({ topic: 'quote', symbol: 'XAUUSD', provider: 'proxy_broker' }),
    provider: 'proxy_broker',
    sourceType: 'BROKER_DIRECT',
    provenance: 'INDEPENDENT_REFERENCE',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 5000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { price: 2750.50 },
  });

  assert(
    (mismatchedRefEnv as any).isExecutable === undefined,
    'Case C: INDEPENDENT_REFERENCE + BROKER_DIRECT cannot gain execution semantics'
  );

  // Test Case D: INDEPENDENT_REFERENCE + PUBLIC_API remains reference data only
  const refPublicEnv = hub.publish({
    topic: 'quote',
    symbol: 'XAUUSD',
    key: formatDataHubKey({ topic: 'quote', symbol: 'XAUUSD', provider: 'gold_api' }),
    provider: 'gold_api',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_REFERENCE',
    observedAt: currentTime,
    receivedAt: currentTime,
    ageMs: 0,
    ttlMs: 5000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { price: 2751.50 },
  });

  assert(
    (refPublicEnv as any).isExecutable === undefined && refPublicEnv.provenance === 'INDEPENDENT_REFERENCE',
    'Case D: INDEPENDENT_REFERENCE + PUBLIC_API remains reference data without execution authority'
  );

  // Test Case E: No DataHub output contract exposes isExecutable across any method
  const fetchedEnv = await hub.fetch(
    { topic: 'quote', symbol: 'BTCUSD', provider: 'binance' },
    async () => ({
      topic: 'quote',
      symbol: 'BTCUSD',
      key: formatDataHubKey({ topic: 'quote', symbol: 'BTCUSD', provider: 'binance' }),
      provider: 'binance',
      sourceType: 'PUBLIC_API',
      provenance: 'INDEPENDENT_VERIFIED',
      observedAt: currentTime,
      receivedAt: currentTime,
      ageMs: 0,
      ttlMs: 5000,
      freshness: 'FRESH',
      isStale: false,
      isAvailable: true,
      payload: { price: 68000 },
    })
  );

  assert(
    (fetchedEnv as any).isExecutable === undefined,
    'Case E: fetch() output contract completely omits isExecutable'
  );

  const snapshotEnv = hub.getSnapshot({ topic: 'quote', symbol: 'BTCUSD', provider: 'binance' });
  assert(
    (snapshotEnv as any).isExecutable === undefined,
    'Case E: getSnapshot() output contract completely omits isExecutable'
  );

  // Test Case F: No DataHub method performs execution-authority resolution
  const allMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(hub));
  const hasExecutionMethod = allMethods.some(
    (m) => m.toLowerCase().includes('execute') || m.toLowerCase().includes('executable') || m.toLowerCase().includes('order')
  );
  assert(
    !hasExecutionMethod,
    'Case F: FEFDataHub exposes ZERO execution resolution methods (pure data coordination layer)'
  );

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n=================================================================');
  console.log(`TOTAL SPRINT 1A TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: 0`);
  console.log('=================================================================');
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
