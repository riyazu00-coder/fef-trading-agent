/**
 * UNIT TEST SUITE: CANONICAL TIMESTAMP & DATA FRESHNESS CONTRACT
 * Verifies all 10 requirements of Section 5.
 */

import {
  parseEpochTimestampMs,
  resolveCanonicalTimestampContract,
  DEFAULT_QUOTE_FRESHNESS_THRESHOLD_MS
} from '../src/lib/price/canonical-timestamp-contract';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Assertion Failed: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
}

async function runTests() {
  console.log('--- Testing parseEpochTimestampMs ---');

  const now = Date.now();

  // 1. Numeric timestamp in ms
  const numMs = parseEpochTimestampMs(now - 5000, now);
  assert(numMs.valid && numMs.timestampMs === now - 5000, 'Valid numeric epoch ms accepted');

  // 2. Numeric timestamp in seconds (10 digits)
  const numSec = parseEpochTimestampMs(Math.floor((now - 5000) / 1000), now);
  assert(numSec.valid && Math.abs(numSec.timestampMs! - (now - 5000)) < 1500, 'Valid numeric epoch seconds normalized to ms');

  // 3. ISO string timestamp
  const isoStr = new Date(now - 10000).toISOString();
  const isoRes = parseEpochTimestampMs(isoStr, now);
  assert(isoRes.valid && isoRes.timestampMs === new Date(isoStr).getTime(), 'Valid ISO-8601 string accepted');

  // 4. Missing values
  assert(!parseEpochTimestampMs(undefined, now).valid, 'undefined rejected');
  assert(!parseEpochTimestampMs(null, now).valid, 'null rejected');
  assert(!parseEpochTimestampMs('', now).valid, 'empty string rejected');

  // 5. Display string labels (MUST NEVER BE PARSED AS TIMESTAMPS)
  assert(parseEpochTimestampMs('FRESH', now).error === 'DISPLAY_STRING', '"FRESH" rejected with DISPLAY_STRING');
  assert(parseEpochTimestampMs('Live', now).error === 'DISPLAY_STRING', '"Live" rejected with DISPLAY_STRING');
  assert(parseEpochTimestampMs('15s ago', now).error === 'DISPLAY_STRING', '"15s ago" rejected with DISPLAY_STRING');
  assert(parseEpochTimestampMs('Stale', now).error === 'DISPLAY_STRING', '"Stale" rejected with DISPLAY_STRING');
  assert(parseEpochTimestampMs('UNAVAILABLE', now).error === 'DISPLAY_STRING', '"UNAVAILABLE" rejected with DISPLAY_STRING');

  // 6. Non-numeric / malformed strings
  assert(parseEpochTimestampMs('invalid-date-xyz', now).error === 'NOT_NUMERIC', 'invalid string rejected with NOT_NUMERIC');
  assert(parseEpochTimestampMs(NaN, now).error === 'NOT_NUMERIC', 'NaN rejected with NOT_NUMERIC');
  assert(parseEpochTimestampMs(-500, now).error === 'NON_POSITIVE', 'Negative number rejected with NON_POSITIVE');
  assert(parseEpochTimestampMs(0, now).error === 'NON_POSITIVE', 'Zero rejected with NON_POSITIVE');

  // 7. Future timestamps (> 60s ahead)
  const farFuture = now + 120_000;
  assert(parseEpochTimestampMs(farFuture, now).error === 'FUTURE_SKEW', 'Far future timestamp rejected with FUTURE_SKEW');

  console.log('\n--- Testing resolveCanonicalTimestampContract ---');

  // 8. Fresh quote (10 seconds old)
  const freshContract = resolveCanonicalTimestampContract({
    quoteTimestamp: now - 10_000,
    lastUpdated: 'FRESH',
    nowMs: now,
  });
  assert(freshContract.dataFreshness === 'FRESH', 'Quote age 10s is FRESH');
  assert(freshContract.dataAvailability === 'AVAILABLE', 'Data availability is AVAILABLE');
  assert(freshContract.dataAgeMs === 10_000, 'Quote age is exactly 10,000ms');
  assert(freshContract.rawDisplayLabel === 'FRESH', 'Raw display label preserved');

  // 9. Stale quote (45 seconds old)
  const staleContract = resolveCanonicalTimestampContract({
    quoteTimestamp: now - 45_000,
    lastUpdated: '45s ago',
    nowMs: now,
  });
  assert(staleContract.dataFreshness === 'STALE', 'Quote age 45s is STALE');
  assert(staleContract.dataAvailability === 'AVAILABLE', 'Quote age 45s data availability is AVAILABLE');
  assert(staleContract.dataAgeMs === 45_000, 'Quote age is 45,000ms');

  // 10. Missing timestamp with "FRESH" label (Must NOT underflow or become fresh)
  const missingContract = resolveCanonicalTimestampContract({
    quoteTimestamp: undefined,
    lastUpdated: 'FRESH',
    nowMs: now,
  });
  assert(missingContract.dataFreshness === 'UNAVAILABLE', 'Missing timestamp with "FRESH" display string is UNAVAILABLE, not FRESH');
  assert(missingContract.dataAvailability === 'UNAVAILABLE', 'Data availability is UNAVAILABLE');
  assert(missingContract.dataAgeMs > 1_000_000, 'Data age is high sentinel, never 0ms underflow');

  // 11. Future timestamp
  const futureContract = resolveCanonicalTimestampContract({
    quoteTimestamp: now + 90_000,
    nowMs: now,
  });
  assert(futureContract.dataFreshness === 'INVALID_TIMESTAMP', 'Future timestamp contract is INVALID_TIMESTAMP');

  console.log('\nAll 11 Canonical Timestamp Contract tests passed successfully!');
}

runTests().catch(console.error);

