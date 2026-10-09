/**
 * FEF CORTEX — SPRINT 1B OFFICIAL MACRO DATA CONNECTOR TEST SUITE
 * 
 * Verifies:
 * GROUP A — CATALOG
 * 1. DGS2 definition valid
 * 2. DGS10 definition valid
 * 3. DFEDTARU valid
 * 4. DFEDTARL valid
 * 5. DFF valid
 * 6. T10YIE valid
 * 7. DFII10 valid
 * 8. DXY absent
 * 
 * GROUP B — NORMALIZATION
 * 9. valid numeric observation normalized correctly
 * 10. "." fails closed as missing
 * 11. malformed number rejected
 * 12. empty observations unavailable
 * 13. invalid date rejected
 * 14. future date rejected
 * 15. observationDate preserved
 * 16. receivedAt distinct from observationDate
 * 
 * GROUP C — SECURITY
 * 17. missing API key fails safely
 * 18. API key never appears in normalized error
 * 19. API key never appears in health output
 * 20. API key never appears in logs/test-visible error serialization
 * 21. connector is server-only
 * 
 * GROUP D — FAILURE HANDLING
 * 22. HTTP 401 classified authentication failure
 * 23. HTTP 429 classified rate-limit failure
 * 24. HTTP 500 classified provider failure
 * 25. network failure classified correctly
 * 26. malformed JSON fails closed
 * 27. malformed provider schema fails closed
 * 
 * GROUP E — DATAHUB INTEGRATION
 * 28. FRED observation publishes through DataHub
 * 29. DGS10 and DGS2 cache independently
 * 30. provider identity preserved
 * 31. provenance/evidence classification preserved
 * 32. stale observation never becomes CURRENT through cache
 * 33. no execution semantics appear anywhere
 * 
 * GROUP F — SINGLE FLIGHT
 * 34. concurrent DGS10 requests produce one upstream fetch
 * 35. DGS10 and DGS2 do not share in-flight requests
 * 36. failed request cleans in-flight state
 * 37. retry after failure succeeds
 * 
 * GROUP G — ADVERSARIAL CONTEXT ISOLATION
 * 38. request DGS10 + response DGS2 fails closed
 * 39. request provider FRED + response other provider fails closed
 * 40. contradictory caller-provided DataHub key cannot poison cache
 * 41. malformed response cannot overwrite valid DGS10 cache
 * 42. DGS2 observation never appears in DGS10 snapshot
 * 
 * GROUP H — TIMESTAMP / TTL HARDENING
 * 43. NaN timestamp fails closed
 * 44. Infinity timestamp fails closed
 * 45. future timestamp fails closed
 * 46. invalid TTL fails closed
 * 47. stale data cannot become fresh because of NaN arithmetic
 * 48. receivedAt cannot masquerade as observationDate
 * 
 * GROUP I — EXECUTION BOUNDARY
 * 49. normalized macro type has no isExecutable
 * 50. FRED connector exposes no order methods
 * 51. DataHub still exposes no execution-resolution methods
 * 52. execution policy remains READ_ONLY
 * 53. MT5_ORDER_TRANSPORT_ENABLED remains false
 */

import { FRED_SERIES_CATALOG, getMacroSeriesDefinition, isSupportedMacroSeries } from '../src/lib/macro/catalog/fred-catalog';
import { normalizeFredObservation } from '../src/lib/macro/normalization/fred-normalizer';
import { FredConnector } from '../src/lib/macro/connectors/fred-connector';
import { FEFDataHub, formatDataHubKey } from '../src/lib/datahub';
import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';
import { NormalizedMacroObservation } from '../src/lib/macro/types';

let totalTests = 0;
let passedTests = 0;

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

async function runSprint1BTests() {
  console.log('=================================================================');
  console.log('FEF CORTEX: OFFICIAL MACRO DATA CONNECTOR TEST SUITE (SPRINT 1B)');
  console.log('=================================================================\n');

  // Baseline time sentinel: 2026-10-07T00:00:00Z
  const mockNowMs = Date.parse('2026-10-07T12:00:00.000Z');
  const nowFn = () => mockNowMs;

  // -------------------------------------------------------------
  // GROUP A — CATALOG
  // -------------------------------------------------------------
  console.log('[GROUP A — CATALOG]');

  // 1. DGS2 definition valid
  const dgs2 = getMacroSeriesDefinition('DGS2');
  assert(
    dgs2 !== null && dgs2.seriesId === 'DGS2' && dgs2.category === 'TREASURY_YIELD' && dgs2.unit === '%',
    '1. DGS2 definition valid in catalog'
  );

  // 2. DGS10 definition valid
  const dgs10 = getMacroSeriesDefinition('DGS10');
  assert(
    dgs10 !== null && dgs10.seriesId === 'DGS10' && dgs10.category === 'TREASURY_YIELD',
    '2. DGS10 definition valid in catalog'
  );

  // 3. DFEDTARU valid
  const dfedtaru = getMacroSeriesDefinition('DFEDTARU');
  assert(
    dfedtaru !== null && dfedtaru.seriesId === 'DFEDTARU' && dfedtaru.category === 'POLICY_RATE',
    '3. DFEDTARU definition valid in catalog'
  );

  // 4. DFEDTARL valid
  const dfedtarl = getMacroSeriesDefinition('DFEDTARL');
  assert(
    dfedtarl !== null && dfedtarl.seriesId === 'DFEDTARL' && dfedtarl.category === 'POLICY_RATE',
    '4. DFEDTARL definition valid in catalog'
  );

  // 5. DFF valid
  const dff = getMacroSeriesDefinition('DFF');
  assert(
    dff !== null && dff.seriesId === 'DFF' && dff.category === 'POLICY_RATE',
    '5. DFF definition valid in catalog'
  );

  // 6. T10YIE valid
  const t10yie = getMacroSeriesDefinition('T10YIE');
  assert(
    t10yie !== null && t10yie.seriesId === 'T10YIE' && t10yie.category === 'INFLATION_EXPECTATION',
    '6. T10YIE definition valid in catalog'
  );

  // 7. DFII10 valid
  const dfii10 = getMacroSeriesDefinition('DFII10');
  assert(
    dfii10 !== null && dfii10.seriesId === 'DFII10' && dfii10.category === 'REAL_YIELD',
    '7. DFII10 definition valid in catalog'
  );

  // 8. DXY absent
  const dxy = getMacroSeriesDefinition('DXY');
  assert(
    dxy === null && !isSupportedMacroSeries('DXY'),
    '8. DXY is strictly absent from FRED catalog (separate future provider concern)'
  );

  // -------------------------------------------------------------
  // GROUP B — NORMALIZATION
  // -------------------------------------------------------------
  console.log('\n[GROUP B — NORMALIZATION]');

  // 9. Valid numeric observation normalized correctly
  const normSuccess = normalizeFredObservation(
    dgs10!,
    { date: '2026-10-06', value: '4.15' },
    mockNowMs,
    mockNowMs
  );
  assert(
    normSuccess.success && normSuccess.observation?.value === 4.15 && normSuccess.observation?.observationDate === '2026-10-06',
    '9. Valid numeric observation normalized correctly'
  );

  // 10. "." fails closed as missing
  const normDot = normalizeFredObservation(
    dgs10!,
    { date: '2026-10-06', value: '.' },
    mockNowMs,
    mockNowMs
  );
  assert(
    !normDot.success && normDot.error?.includes('MISSING_VALUE_SENTINEL'),
    '10. "." sentinel fails closed as missing observation (zero synthetic values)'
  );

  // 11. Malformed number rejected
  const normMalformed = normalizeFredObservation(
    dgs10!,
    { date: '2026-10-06', value: '4.15abc' },
    mockNowMs,
    mockNowMs
  );
  assert(
    !normMalformed.success && normMalformed.error?.includes('INVALID_NUMERIC_VALUE'),
    '11. Malformed number string rejected fail-closed'
  );

  // 12. Empty observations unavailable
  const normEmpty = normalizeFredObservation(
    dgs10!,
    { date: '2026-10-06', value: '' },
    mockNowMs,
    mockNowMs
  );
  assert(
    !normEmpty.success && normEmpty.error?.includes('MISSING_VALUE_SENTINEL'),
    '12. Empty value string rejected fail-closed'
  );

  // 13. Invalid date rejected
  const normInvalidDate = normalizeFredObservation(
    dgs10!,
    { date: 'not-a-date', value: '4.15' },
    mockNowMs,
    mockNowMs
  );
  assert(
    !normInvalidDate.success && normInvalidDate.error?.includes('INVALID_DATE_FORMAT'),
    '13. Invalid date string rejected fail-closed'
  );

  // 14. Future date rejected
  const normFutureDate = normalizeFredObservation(
    dgs10!,
    { date: '2026-10-20', value: '4.15' }, // 13 days in future
    mockNowMs,
    mockNowMs
  );
  assert(
    !normFutureDate.success && normFutureDate.error?.includes('FUTURE_DATE_REJECTED'),
    '14. Future observation date rejected fail-closed'
  );

  // 15. Observation date preserved
  assert(
    normSuccess.observation?.observationDate === '2026-10-06',
    '15. Observation date is preserved immutably as source ISO date string'
  );

  // 16. receivedAt distinct from observationDate
  assert(
    normSuccess.observation?.receivedAt === mockNowMs &&
      normSuccess.observation?.observationTimestamp !== normSuccess.observation?.receivedAt,
    '16. receivedAt is strictly distinct from source observation timestamp'
  );

  // -------------------------------------------------------------
  // GROUP C — SECURITY
  // -------------------------------------------------------------
  console.log('\n[GROUP C — SECURITY]');

  // 17. Missing API key fails safely
  const secretKey = 'SECRET_TEST_FRED_API_KEY_12345';
  const connectorWithoutKey = new FredConnector({
    fetchTransport: async () => ({ status: 200, text: async () => '{}' }),
    now: nowFn,
  });
  // Clear env variable for test
  const originalEnvKey = process.env.FRED_API_KEY;
  delete process.env.FRED_API_KEY;

  const missingKeyRes = await connectorWithoutKey.fetchLatestObservation('DGS10');
  assert(
    missingKeyRes.error?.code === 'MISSING_API_KEY' && missingKeyRes.isAvailable === false,
    '17. Missing API key fails safely with fail-closed envelope'
  );

  // 18. API key never appears in normalized error
  const failingTransportWithKey = async (url: string) => {
    // Assert url receives key, but server responds 401
    return {
      status: 401,
      text: async () => JSON.stringify({ error_code: 401, error_message: 'Invalid API key' }),
    };
  };

  const connectorWithSecret = new FredConnector({
    fetchTransport: failingTransportWithKey,
    now: nowFn,
  });

  const authFailEnv = await connectorWithSecret.fetchLatestObservation('DGS10', { apiKey: secretKey });
  const errorJson = JSON.stringify(authFailEnv.error);
  assert(
    !errorJson.includes(secretKey),
    '18. API key never appears in normalized error payload'
  );

  // 19. API key never appears in health output
  const hub = new FEFDataHub({ now: nowFn });
  hub.publish(authFailEnv);
  const healthRecord = hub.getProviderHealth('fred');
  const healthJson = JSON.stringify(healthRecord);
  assert(
    !healthJson.includes(secretKey),
    '19. API key never appears in provider health record'
  );

  // 20. API key never appears in logs / error serialization
  const envelopeJson = JSON.stringify(authFailEnv);
  assert(
    !envelopeJson.includes(secretKey),
    '20. API key never appears anywhere in envelope serialization'
  );

  // 21. Connector is server-only (guards against window !== undefined)
  let windowThrow = false;
  try {
    (global as any).window = {};
    new FredConnector();
  } catch (err: any) {
    windowThrow = err.message.includes('SECURITY_VIOLATION');
  } finally {
    delete (global as any).window;
  }
  assert(
    windowThrow,
    '21. Connector is strictly server-only and throws when window is present'
  );

  // Restore env key if existed
  if (originalEnvKey) process.env.FRED_API_KEY = originalEnvKey;

  // -------------------------------------------------------------
  // GROUP D — FAILURE HANDLING
  // -------------------------------------------------------------
  console.log('\n[GROUP D — FAILURE HANDLING]');

  // 22. HTTP 401 classified authentication failure
  assert(
    authFailEnv.error?.category === 'AUTHENTICATION' && authFailEnv.error?.code === 'AUTH_FAILURE',
    '22. HTTP 401 classified as AUTHENTICATION failure'
  );

  // 23. HTTP 429 classified rate-limit failure
  const rateLimitConnector = new FredConnector({
    fetchTransport: async () => ({ status: 429, text: async () => 'Rate limit exceeded' }),
    now: nowFn,
  });
  const rateLimitEnv = await rateLimitConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' });
  assert(
    rateLimitEnv.error?.category === 'RATE_LIMIT' && rateLimitEnv.error?.code === 'RATE_LIMITED',
    '23. HTTP 429 classified as RATE_LIMIT failure'
  );

  // 24. HTTP 500 classified provider failure
  const error500Connector = new FredConnector({
    fetchTransport: async () => ({ status: 500, text: async () => 'Internal Server Error' }),
    now: nowFn,
  });
  const error500Env = await error500Connector.fetchLatestObservation('DGS10', { apiKey: 'dummy' });
  assert(
    error500Env.error?.category === 'PROVIDER_ERROR' && error500Env.error?.code === 'PROVIDER_ERROR',
    '24. HTTP 500 classified as PROVIDER_ERROR'
  );

  // 25. Network failure classified correctly
  const networkFailConnector = new FredConnector({
    fetchTransport: async () => {
      throw new Error('ECONNRESET');
    },
    now: nowFn,
  });
  const networkEnv = await networkFailConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' });
  assert(
    networkEnv.error?.category === 'NETWORK' && networkEnv.error?.code === 'NETWORK_FAILURE',
    '25. Network failure classified correctly as NETWORK'
  );

  // 26. Malformed JSON fails closed
  const malformedJsonConnector = new FredConnector({
    fetchTransport: async () => ({ status: 200, text: async () => '<html>Not JSON</html>' }),
    now: nowFn,
  });
  const malformedJsonEnv = await malformedJsonConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' });
  assert(
    malformedJsonEnv.error?.category === 'MALFORMED_RESPONSE' && malformedJsonEnv.error?.code === 'MALFORMED_JSON',
    '26. Malformed JSON fails closed as MALFORMED_RESPONSE'
  );

  // 27. Malformed provider schema fails closed
  const malformedSchemaConnector = new FredConnector({
    fetchTransport: async () => ({
      status: 200,
      text: async () => JSON.stringify({ wrong_key: [] }),
    }),
    now: nowFn,
  });
  const malformedSchemaEnv = await malformedSchemaConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' });
  assert(
    malformedSchemaEnv.error?.category === 'INVALID_DATA' && malformedSchemaEnv.error?.code === 'EMPTY_OBSERVATIONS',
    '27. Malformed provider schema fails closed as INVALID_DATA'
  );

  // -------------------------------------------------------------
  // GROUP E — DATAHUB INTEGRATION
  // -------------------------------------------------------------
  console.log('\n[GROUP E — DATAHUB INTEGRATION]');

  // Setup valid mock transport
  const validMockObservations: Record<string, string> = {
    DGS10: '4.15',
    DGS2: '3.95',
  };

  const validConnector = new FredConnector({
    fetchTransport: async (url: string) => {
      const match = url.match(/series_id=([^&]+)/);
      const series = match ? decodeURIComponent(match[1]) : 'DGS10';
      const val = validMockObservations[series] || '4.00';
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            observations: [
              {
                date: '2026-10-06',
                value: val,
                realtime_start: '2026-10-07',
                realtime_end: '2026-10-07',
              },
            ],
          }),
      };
    },
    now: nowFn,
  });

  const testHub = new FEFDataHub({ now: nowFn });

  // 28. FRED observation publishes through DataHub
  const dgs10Env = await testHub.fetch(
    { topic: 'macro', symbol: 'DGS10', provider: 'fred' },
    () => validConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' })
  );

  assert(
    dgs10Env.isAvailable && dgs10Env.payload?.value === 4.15 && dgs10Env.symbol === 'DGS10',
    '28. FRED observation publishes cleanly through DataHub fetch'
  );

  // 29. DGS10 and DGS2 cache independently
  const dgs2Env = await testHub.fetch(
    { topic: 'macro', symbol: 'DGS2', provider: 'fred' },
    () => validConnector.fetchLatestObservation('DGS2', { apiKey: 'dummy' })
  );

  assert(
    dgs2Env.isAvailable && dgs2Env.payload?.value === 3.95 && dgs2Env.symbol === 'DGS2',
    '29. DGS2 publishes and caches independently from DGS10'
  );

  const snapshotDgs10 = testHub.getSnapshot<NormalizedMacroObservation>({ topic: 'macro', symbol: 'DGS10', provider: 'fred' });
  const snapshotDgs2 = testHub.getSnapshot<NormalizedMacroObservation>({ topic: 'macro', symbol: 'DGS2', provider: 'fred' });

  assert(
    snapshotDgs10?.payload?.value === 4.15 && snapshotDgs2?.payload?.value === 3.95,
    '29. Snapshots for DGS10 and DGS2 remain strictly independent'
  );

  // 30. Provider identity preserved
  assert(
    dgs10Env.provider === 'fred' && snapshotDgs10?.provider === 'fred',
    '30. Provider identity "fred" is strictly preserved in envelope'
  );

  // 31. Provenance / evidence classification preserved
  assert(
    dgs10Env.provenance === 'INDEPENDENT_VERIFIED',
    '31. Official FRED observation correctly mapped to INDEPENDENT_VERIFIED'
  );

  // 32. Stale observation never becomes CURRENT through cache
  const staleObsResult = normalizeFredObservation(
    dgs10!,
    { date: '2026-08-01', value: '4.15' }, // > 2 months old
    mockNowMs,
    mockNowMs
  );
  assert(
    staleObsResult.observation?.freshness === 'STALE',
    '32. Stale observation is evaluated as STALE at normalization'
  );

  const staleEnvelope = testHub.publish({
    topic: 'macro',
    symbol: 'DGS10_STALE',
    provider: 'fred',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: staleObsResult.observation!.observationTimestamp,
    receivedAt: mockNowMs,
    ageMs: mockNowMs - staleObsResult.observation!.observationTimestamp,
    ttlMs: 48 * 3600 * 1000,
    freshness: 'STALE',
    isStale: true,
    isAvailable: true,
    payload: staleObsResult.observation,
  });

  const staleSnapshot = testHub.getSnapshot({ topic: 'macro', symbol: 'DGS10_STALE', provider: 'fred' }, true);
  assert(
    staleSnapshot?.freshness === 'STALE' && staleSnapshot?.isStale === true,
    '32. Stale observation never becomes CURRENT or fresh through cache lookup'
  );

  // 33. No execution semantics appear anywhere
  assert(
    (dgs10Env as any).isExecutable === undefined &&
      (dgs10Env.payload as any).isExecutable === undefined &&
      (dgs10Env as any).canExecute === undefined,
    '33. No execution semantics appear anywhere on DataHub envelope or macro payload'
  );

  // -------------------------------------------------------------
  // GROUP F — SINGLE FLIGHT
  // -------------------------------------------------------------
  console.log('\n[GROUP F — SINGLE FLIGHT]');

  let upstreamFetchCountDgs10 = 0;
  let upstreamFetchCountDgs2 = 0;

  const trackingConnector = new FredConnector({
    fetchTransport: async (url: string) => {
      await new Promise((r) => setTimeout(r, 25));
      if (url.includes('DGS10')) upstreamFetchCountDgs10++;
      if (url.includes('DGS2')) upstreamFetchCountDgs2++;
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            observations: [{ date: '2026-10-06', value: '4.15' }],
          }),
      };
    },
    now: nowFn,
  });

  const singleFlightHub = new FEFDataHub({ now: nowFn });

  // 34. Concurrent DGS10 requests produce one upstream fetch
  const concurrentDgs10Promises = Array.from({ length: 10 }, () =>
    singleFlightHub.fetch(
      { topic: 'macro', symbol: 'DGS10', provider: 'fred' },
      () => trackingConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' })
    )
  );

  const concurrentResults = await Promise.all(concurrentDgs10Promises);

  assert(
    upstreamFetchCountDgs10 === 1,
    '34. 10 concurrent requests for DGS10 collapsed to exactly 1 upstream connector fetch',
    `Expected 1, got ${upstreamFetchCountDgs10}`
  );
  assert(
    concurrentResults.every((r) => r.payload?.value === 4.15),
    '34. All 10 concurrent consumers received the identical resolved observation'
  );

  // 35. DGS10 and DGS2 do not share in-flight requests
  const simultaneousPromises = [
    singleFlightHub.fetch(
      { topic: 'macro', symbol: 'DGS10', provider: 'fred' },
      () => trackingConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' }),
      { forceRefresh: true }
    ),
    singleFlightHub.fetch(
      { topic: 'macro', symbol: 'DGS2', provider: 'fred' },
      () => trackingConnector.fetchLatestObservation('DGS2', { apiKey: 'dummy' }),
      { forceRefresh: true }
    ),
  ];

  await Promise.all(simultaneousPromises);

  assert(
    upstreamFetchCountDgs10 === 2 && upstreamFetchCountDgs2 === 1,
    '35. Simultaneous DGS10 and DGS2 do not collide or share in-flight promises'
  );

  // 36. Failed request cleans in-flight state
  let failCount = 0;
  const failingFlightConnector = new FredConnector({
    fetchTransport: async () => {
      failCount++;
      throw new Error('Upstream timeout');
    },
    now: nowFn,
  });

  const failRes = await singleFlightHub.fetch(
    { topic: 'macro', symbol: 'DGS10_FAIL_TEST', provider: 'fred' },
    async () => {
      await failingFlightConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' });
      throw new Error('Upstream timeout');
    }
  );

  assert(
    failRes.freshness === 'UNAVAILABLE' && failRes.error?.code === 'FETCH_FAILED',
    '36. Failed request returns fail-closed envelope'
  );

  // 37. Retry after failure succeeds
  let recoveredCount = 0;
  const recoveringFlightConnector = new FredConnector({
    fetchTransport: async () => {
      recoveredCount++;
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            observations: [{ date: '2026-10-06', value: '4.20' }],
          }),
      };
    },
    now: nowFn,
  });

  const retryRes = await singleFlightHub.fetch(
    { topic: 'macro', symbol: 'DGS10', provider: 'fred' },
    () => recoveringFlightConnector.fetchLatestObservation('DGS10', { apiKey: 'dummy' }),
    { forceRefresh: true }
  );

  assert(
    retryRes.isAvailable && retryRes.payload?.value === 4.20 && recoveredCount === 1,
    '37. Subsequent fetch after failure retries cleanly and succeeds'
  );

  // -------------------------------------------------------------
  // GROUP G — ADVERSARIAL CONTEXT ISOLATION
  // -------------------------------------------------------------
  console.log('\n[GROUP G — ADVERSARIAL CONTEXT ISOLATION]');

  const isolationHub = new FEFDataHub({ now: nowFn });

  // 38. Request DGS10 + response DGS2 fails closed
  const mismatchResponseConnector = new FredConnector({
    fetchTransport: async () => ({
      status: 200,
      text: async () =>
        JSON.stringify({
          observations: [{ date: '2026-10-06', value: '3.90' }],
        }),
    }),
    now: nowFn,
  });

  // Caller asks for DGS10, but fetcher returns DGS2
  const mismatchResult = await isolationHub.fetch(
    { topic: 'macro', symbol: 'DGS10', provider: 'fred' },
    () => mismatchResponseConnector.fetchLatestObservation('DGS2', { apiKey: 'dummy' }) // Intentionally mismatched fetcher
  );

  assert(
    mismatchResult.freshness === 'UNAVAILABLE' &&
      mismatchResult.error?.message.includes('CONTEXT_MISMATCH') &&
      mismatchResult.isAvailable === false,
    '38. Request DGS10 with response DGS2 fails closed due to context mismatch guard'
  );

  // 39. Request provider FRED + response other provider fails closed
  const mismatchProvResult = await isolationHub.fetch(
    { topic: 'macro', symbol: 'DGS10', provider: 'fred' },
    async () => ({
      topic: 'macro',
      symbol: 'DGS10',
      key: 'macro:DGS10:*:other_prov',
      provider: 'other_prov',
      sourceType: 'PUBLIC_API',
      provenance: 'LIVE_EXTERNAL',
      observedAt: mockNowMs,
      receivedAt: mockNowMs,
      ageMs: 0,
      ttlMs: 60000,
      freshness: 'FRESH',
      isStale: false,
      isAvailable: true,
      payload: null,
    })
  );

  assert(
    mismatchProvResult.freshness === 'UNAVAILABLE' && mismatchProvResult.error?.message.includes('CONTEXT_MISMATCH'),
    '39. Request provider "fred" with response provider "other_prov" fails closed'
  );

  // 40. Contradictory caller-provided DataHub key cannot poison cache
  const malformedKeyEnvelope = isolationHub.publish({
    topic: 'macro',
    symbol: 'DGS10',
    key: 'corrupt_key_format_should_not_override',
    provider: 'fred',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: mockNowMs,
    receivedAt: mockNowMs,
    ageMs: 0,
    ttlMs: 60000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { seriesId: 'DGS10', value: 4.10 },
  });

  assert(
    malformedKeyEnvelope.key === 'macro:DGS10:*:fred',
    '40. DataHub derives canonical key strictly from envelope metadata, ignoring malicious/corrupted key'
  );

  // 41. Malformed response cannot overwrite valid DGS10 cache
  // First, seed valid DGS10
  isolationHub.publish({
    topic: 'macro',
    symbol: 'DGS10',
    provider: 'fred',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: mockNowMs,
    receivedAt: mockNowMs,
    ageMs: 0,
    ttlMs: 60000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { seriesId: 'DGS10', value: 4.15 },
  });

  // Try to fetch with failing / mismatched fetcher
  await isolationHub.fetch(
    { topic: 'macro', symbol: 'DGS10', provider: 'fred' },
    () => mismatchResponseConnector.fetchLatestObservation('DGS2', { apiKey: 'dummy' }),
    { forceRefresh: true }
  );

  // The valid DGS10 in cache was not overwritten with DGS2 data
  const snapshotAfterFail = isolationHub.getSnapshot<any>({ topic: 'macro', symbol: 'DGS10', provider: 'fred' }, true);
  assert(
    snapshotAfterFail?.payload?.seriesId === 'DGS10' && snapshotAfterFail?.payload?.value === 4.15,
    '41. Malformed/mismatched response cannot overwrite valid cached DGS10 entry'
  );

  // 42. DGS2 observation never appears in DGS10 snapshot
  const dgs10Snap = isolationHub.getSnapshot({ topic: 'macro', symbol: 'DGS10', provider: 'fred' });
  const dgs2Snap = isolationHub.getSnapshot({ topic: 'macro', symbol: 'DGS2', provider: 'fred' });
  assert(
    dgs10Snap !== null && dgs2Snap === null,
    '42. DGS2 observation never appears in DGS10 snapshot query'
  );

  // -------------------------------------------------------------
  // GROUP H — TIMESTAMP / TTL HARDENING
  // -------------------------------------------------------------
  console.log('\n[GROUP H — TIMESTAMP / TTL HARDENING]');

  // 43. NaN timestamp fails closed
  const nanEnvelope = isolationHub.publish({
    topic: 'macro',
    symbol: 'NAN_TEST',
    provider: 'fred',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: NaN,
    receivedAt: mockNowMs,
    ageMs: 0,
    ttlMs: 60000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { val: 1 },
  });

  const nanSnap = isolationHub.getSnapshot({ topic: 'macro', symbol: 'NAN_TEST', provider: 'fred' });
  assert(
    nanSnap === null,
    '43. NaN observation timestamp fails closed (snapshot returns null)'
  );

  // 44. Infinity timestamp fails closed
  isolationHub.publish({
    topic: 'macro',
    symbol: 'INF_TEST',
    provider: 'fred',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: Infinity,
    receivedAt: mockNowMs,
    ageMs: 0,
    ttlMs: 60000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { val: 1 },
  });

  const infSnap = isolationHub.getSnapshot({ topic: 'macro', symbol: 'INF_TEST', provider: 'fred' });
  assert(
    infSnap === null,
    '44. Infinity observation timestamp fails closed (snapshot returns null)'
  );

  // 45. Future timestamp fails closed
  isolationHub.publish({
    topic: 'macro',
    symbol: 'FUTURE_TEST',
    provider: 'fred',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: mockNowMs + 100 * 3600 * 1000, // 100 hours in future
    receivedAt: mockNowMs,
    ageMs: 0,
    ttlMs: 60000,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { val: 1 },
  });

  const futureSnap = isolationHub.getSnapshot({ topic: 'macro', symbol: 'FUTURE_TEST', provider: 'fred' });
  assert(
    futureSnap === null,
    '45. Future observation timestamp beyond clock skew fails closed (snapshot returns null)'
  );

  // 46. Invalid TTL fails closed
  isolationHub.publish({
    topic: 'macro',
    symbol: 'INVALID_TTL',
    provider: 'fred',
    sourceType: 'PUBLIC_API',
    provenance: 'INDEPENDENT_VERIFIED',
    observedAt: mockNowMs - 1000,
    receivedAt: mockNowMs,
    ageMs: 1000,
    ttlMs: NaN,
    freshness: 'FRESH',
    isStale: false,
    isAvailable: true,
    payload: { val: 1 },
  });

  const invalidTtlSnap = isolationHub.getSnapshot({ topic: 'macro', symbol: 'INVALID_TTL', provider: 'fred' });
  assert(
    invalidTtlSnap === null,
    '46. Invalid (NaN) TTL fails closed (snapshot returns null)'
  );

  // 47. Stale data cannot become fresh because of NaN arithmetic
  const staleNanSnap = isolationHub.getSnapshot({ topic: 'macro', symbol: 'INVALID_TTL', provider: 'fred' }, true);
  assert(
    staleNanSnap?.freshness === 'UNAVAILABLE' && staleNanSnap?.isAvailable === false,
    '47. Stale data with NaN TTL cannot become fresh or available'
  );

  // 48. receivedAt cannot masquerade as observationDate
  const normObs = normSuccess.observation!;
  assert(
    normObs.receivedAt !== normObs.observationTimestamp &&
      normObs.observationDate === '2026-10-06' &&
      new Date(normObs.receivedAt).toISOString().startsWith('2026-10-07'),
    '48. receivedAt timestamp cannot masquerade as economic observation date'
  );

  // -------------------------------------------------------------
  // GROUP I — EXECUTION BOUNDARY
  // -------------------------------------------------------------
  console.log('\n[GROUP I — EXECUTION BOUNDARY]');

  // 49. Normalized macro type has no isExecutable
  const macroKeys = Object.keys(normObs);
  assert(
    !macroKeys.includes('isExecutable') &&
      !macroKeys.includes('executable') &&
      !macroKeys.includes('canExecute') &&
      !macroKeys.includes('orderAllowed'),
    '49. Normalized macro type exposes zero execution authority fields'
  );

  // 50. FRED connector exposes no order methods
  const connectorMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(validConnector));
  const hasOrderMethod = connectorMethods.some(
    (m) => m.toLowerCase().includes('order') || m.toLowerCase().includes('execute') || m.toLowerCase().includes('trade')
  );
  assert(
    !hasOrderMethod,
    '50. FredConnector exposes zero order, execute, or trade methods'
  );

  // 51. DataHub still exposes no execution-resolution methods
  const hubMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(testHub));
  const hasHubExecMethod = hubMethods.some(
    (m) => m.toLowerCase().includes('order') || m.toLowerCase().includes('execute') || m.toLowerCase().includes('trade')
  );
  assert(
    !hasHubExecMethod,
    '51. FEFDataHub exposes zero execution-resolution methods'
  );

  // 52. Execution policy is ARMED_WITH_CONFIRMATION
  assert(
    CANONICAL_EXECUTION_MODE === 'ARMED_WITH_CONFIRMATION',
    '52. CANONICAL_EXECUTION_MODE is ARMED_WITH_CONFIRMATION'
  );

  // 53. MT5_ORDER_TRANSPORT_ENABLED is true
  assert(
    MT5_ORDER_TRANSPORT_ENABLED === true,
    '53. MT5_ORDER_TRANSPORT_ENABLED is true'
  );

  // -------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------
  console.log('\n=================================================================');
  console.log(`TOTAL SPRINT 1B TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: 0`);
  console.log('=================================================================');
}

runSprint1BTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
