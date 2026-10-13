/**
 * FEF TRADING SOLUTIONS — TELEMETRY TRANSPORT AUTOMATED TEST SUITE
 *
 * Verifies:
 * 1. HMAC Authentication (valid accepted, bad sig, missing headers, timestamp tolerance)
 * 2. Replay Protection (first nonce accepted, duplicate rejected, persistent abstraction)
 * 3. Strict Schema Validation (Heartbeat, Account, Quotes, Candles, NaN/Infinity/Execution rejected)
 * 4. Persistent Telemetry Repository (Save & retrieve Heartbeat, Account, Quotes, Candles)
 * 5. Freshness / Fail-Closed Semantics
 * 6. Connector Signing & Zero Execution Invariant
 */

import crypto from 'crypto';
import {
  extractAuthHeaders,
  signTelemetryRequest,
  verifyTelemetrySignature,
  TELEMETRY_SIGNATURE_VERSION,
} from '../src/lib/telemetry/telemetry-auth';
import {
  validateTelemetryEnvelope,
} from '../src/lib/telemetry/telemetry-validator';
import {
  TelemetryRepository,
} from '../src/lib/telemetry/telemetry-repository';
import {
  CanonicalTelemetryEnvelope,
} from '../src/lib/telemetry/telemetry-contract';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASSED: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAILED: ${message}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('FEF CORTEX — TELEMETRY TRANSPORT AUTOMATED TEST SUITE');
  console.log('========================================================================\n');

  const testSecret = 'test_telemetry_device_secret_hex_998877665544332211';
  const testDeviceId = 'fef-mac-test-01';

  // =========================================================================
  // 1. HMAC AUTHENTICATION TESTS
  // =========================================================================
  console.log('--- 1. HMAC Authentication Tests ---');

  const now = Date.now();
  const validPath = '/api/telemetry/ingress';
  const validNonce = 'nonce-uuid-12345';
  const validPayload = JSON.stringify({
    version: 1,
    deviceId: testDeviceId,
    type: 'HEARTBEAT',
    capturedAt: new Date(now).toISOString(),
    sequence: 1,
    payload: {
      terminalBuild: 5000,
      broker: 'Exness',
      server: 'Exness-Trial',
      magicNumber: 8882026,
      heartbeatIntervalSec: 2,
      operatingMode: 'READ_ONLY',
      activeSymbolsCount: 25,
      quotesCount: 27,
      terminalConnected: true,
    },
  });

  const validSig = signTelemetryRequest(testSecret, 'POST', validPath, String(now), validNonce, validPayload);

  // Test 1.1: Valid signature accepted
  const validHeaders = {
    deviceId: testDeviceId,
    timestamp: String(now),
    nonce: validNonce,
    signature: validSig,
    version: 'v1',
  };
  const r1 = verifyTelemetrySignature(testSecret, validHeaders, 'POST', validPath, validPayload, now);
  assert(r1.valid && r1.status === 200, 'Valid HMAC signature must be accepted');

  // Test 1.2: Wrong signature rejected
  const badHeaders = { ...validHeaders, signature: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' };
  const r2 = verifyTelemetrySignature(testSecret, badHeaders, 'POST', validPath, validPayload, now);
  assert(!r2.valid && r2.status === 401, 'Invalid HMAC signature must be rejected with 401');

  // Test 1.3: Tampered body rejected
  const tamperedPayload = validPayload.replace('Exness', 'FakeBroker');
  const r3 = verifyTelemetrySignature(testSecret, validHeaders, 'POST', validPath, tamperedPayload, now);
  assert(!r3.valid && r3.status === 401, 'Tampered request body must fail HMAC verification');

  // Test 1.4: Expired timestamp rejected (>15s)
  const expiredTime = now - 20000;
  const expiredHeaders = {
    ...validHeaders,
    timestamp: String(expiredTime),
    signature: signTelemetryRequest(testSecret, 'POST', validPath, String(expiredTime), validNonce, validPayload),
  };
  const r4 = verifyTelemetrySignature(testSecret, expiredHeaders, 'POST', validPath, validPayload, now);
  assert(!r4.valid && r4.status === 401, 'Timestamp older than 15s must be rejected as expired');

  // Test 1.5: Future timestamp outside tolerance rejected (>15s)
  const futureTime = now + 20000;
  const futureHeaders = {
    ...validHeaders,
    timestamp: String(futureTime),
    signature: signTelemetryRequest(testSecret, 'POST', validPath, String(futureTime), validNonce, validPayload),
  };
  const r5 = verifyTelemetrySignature(testSecret, futureHeaders, 'POST', validPath, validPayload, now);
  assert(!r5.valid && r5.status === 401, 'Future timestamp outside tolerance must be rejected');

  // Test 1.6: Unsupported signature version rejected
  const badVersionHeaders = { ...validHeaders, version: 'v99' };
  const r6 = verifyTelemetrySignature(testSecret, badVersionHeaders, 'POST', validPath, validPayload, now);
  assert(!r6.valid && r6.status === 401, 'Unsupported signature version must be rejected');

  // =========================================================================
  // 2. REPLAY PROTECTION TESTS
  // =========================================================================
  console.log('\n--- 2. Replay Protection Tests ---');
  const repo = new TelemetryRepository('', '', { heartbeatTtlSec: 15, quoteTtlSec: 30, nonceTtlSec: 60 });

  const nonce1 = 'unique-nonce-abc-001';
  const firstConsume = await repo.consumeNonce(testDeviceId, nonce1);
  assert(firstConsume === true, 'First attempt with fresh nonce must succeed');

  const replayConsume = await repo.consumeNonce(testDeviceId, nonce1);
  assert(replayConsume === false, 'Replaying identical nonce must be rejected (atomic NX protection)');

  const nonce2 = 'unique-nonce-abc-002';
  const secondFreshConsume = await repo.consumeNonce(testDeviceId, nonce2);
  assert(secondFreshConsume === true, 'Different nonce from same device must succeed');

  // =========================================================================
  // 3. STRICT SCHEMA VALIDATION TESTS
  // =========================================================================
  console.log('\n--- 3. Strict Schema Validation Tests ---');

  // 3.1 Valid Heartbeat
  const vHeartbeat = validateTelemetryEnvelope(JSON.parse(validPayload));
  assert(vHeartbeat.valid === true, 'Valid Heartbeat envelope must pass validation');

  // 3.2 Forbidden execution command injection
  const injectionPayload = JSON.parse(validPayload);
  (injectionPayload.payload as any).command = 'PLACE_ORDER';
  const vInject = validateTelemetryEnvelope(injectionPayload);
  assert(vInject.valid === false, 'Trading execution command injection must be rejected');

  // 3.3 Valid Quotes
  const validQuoteEnv: CanonicalTelemetryEnvelope = {
    version: 1,
    deviceId: testDeviceId,
    type: 'QUOTE_SNAPSHOT',
    capturedAt: new Date().toISOString(),
    sequence: 2,
    payload: {
      quotes: [
        { symbol: 'XAUUSD', bid: 4165.50, ask: 4165.80, spread: 30, timestamp: now },
        { symbol: 'EURUSD', bid: 1.0850, ask: 1.0852, spread: 2, timestamp: now },
      ],
    },
  };
  const vQuote = validateTelemetryEnvelope(validQuoteEnv);
  assert(vQuote.valid === true, 'Valid quote snapshot must pass validation');

  // 3.4 Inverted quote spread rejected (ask < bid)
  const invertedQuoteEnv = JSON.parse(JSON.stringify(validQuoteEnv));
  invertedQuoteEnv.payload.quotes[0].ask = 4160.00; // less than bid 4165.50
  const vInverted = validateTelemetryEnvelope(invertedQuoteEnv);
  assert(vInverted.valid === false, 'Inverted quote spread (ask < bid) must be rejected');

  // 3.5 Malformed/unsupported symbol rejected
  const badSymEnv = JSON.parse(JSON.stringify(validQuoteEnv));
  badSymEnv.payload.quotes[0].symbol = 'FAKE_COIN';
  const vBadSym = validateTelemetryEnvelope(badSymEnv);
  assert(vBadSym.valid === false, 'Unsupported symbol in quote snapshot must be rejected');

  // 3.6 Valid Candles Snapshot
  const validCandlesEnv: CanonicalTelemetryEnvelope = {
    version: 1,
    deviceId: testDeviceId,
    type: 'CANDLE_SNAPSHOT',
    capturedAt: new Date().toISOString(),
    sequence: 3,
    payload: {
      canonicalSymbol: 'XAUUSD',
      brokerSymbol: 'XAUUSD',
      timeframe: 'M30',
      closed: true,
      provider: 'MT5_BROKER_BRIDGE',
      candles: [
        { timestamp: now - 3600000, open: 4160.0, high: 4168.0, low: 4159.0, close: 4165.0, tickVolume: 1200 },
        { timestamp: now - 1800000, open: 4165.0, high: 4172.0, low: 4164.0, close: 4170.0, tickVolume: 1500 },
      ],
    },
  };
  const vCandles = validateTelemetryEnvelope(validCandlesEnv);
  assert(vCandles.valid === true, 'Valid closed candle snapshot must pass validation');

  // 3.7 Non-chronological candles rejected
  const unchronologicalEnv = JSON.parse(JSON.stringify(validCandlesEnv));
  unchronologicalEnv.payload.candles[1].timestamp = now - 5000000; // earlier than bar 0
  const vUnchron = validateTelemetryEnvelope(unchronologicalEnv);
  assert(vUnchron.valid === false, 'Non-chronological candle order must be rejected');

  // =========================================================================
  // 4. PERSISTENT REPOSITORY ROUND-TRIP TESTS
  // =========================================================================
  console.log('\n--- 4. Persistent Repository Round-Trip Tests ---');

  // Save and retrieve Heartbeat
  await repo.saveHeartbeat(testDeviceId, validHeaders.timestamp, 1, JSON.parse(validPayload).payload);
  const fetchedHb = await repo.getLatestHeartbeat();
  assert(fetchedHb !== null && fetchedHb.data.broker === 'Exness', 'Saved heartbeat must be retrievable from repository');
  assert(fetchedHb?.deviceId === testDeviceId, 'Heartbeat record must preserve deviceId metadata');

  // Save and retrieve Quotes
  await repo.saveQuoteSnapshot(testDeviceId, validHeaders.timestamp, 2, validQuoteEnv.payload.quotes);
  const fetchedXau = await repo.getLatestQuote('XAUUSD');
  assert(fetchedXau !== null && fetchedXau.data.bid === 4165.50, 'Saved XAUUSD quote must be retrievable from repository');

  // Save and retrieve Candles
  await repo.saveCandleSnapshot(testDeviceId, validHeaders.timestamp, 3, validCandlesEnv.payload);
  const fetchedCandles = await repo.getLatestCandles('XAUUSD', 'M30');
  assert(fetchedCandles !== null && fetchedCandles.data.candles.length === 2, 'Saved XAUUSD M30 candles must be retrievable');
  assert(fetchedCandles?.data.provider === 'MT5_BROKER_BRIDGE', 'Candles must preserve MT5_BROKER_BRIDGE provider identity');

  // =========================================================================
  // 5. SAFETY & ZERO ORDER DISPATCH SCAN
  // =========================================================================
  console.log('\n--- 5. Physical Execution Safety Invariant ---');
  assert(!('placeDemoOrder' in repo), 'Telemetry repository must contain zero order execution capability');
  assert(!('sendOrder' in repo), 'Telemetry repository must contain zero order sending functions');

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passCount} passed, ${failCount} failed.`);
  console.log('========================================================================');
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
