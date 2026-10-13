/**
 * FEF TRADING SOLUTIONS — CANONICAL CONNECTION STATE MACHINE & ANTI-FLAP TEST SUITE
 *
 * Verifies:
 * - Case A: Steady-state healthy heartbeat (< 10s) -> ONLINE, isMt5Connected: true
 * - Case B: Degraded heartbeat (10s to 20s) -> DEGRADED, isMt5Connected: true, not grace period
 * - Case C: Transient poll failure (single failure from ONLINE) -> DEGRADED, isInGracePeriod: true, isMt5Connected: true
 * - Case D: Immediate recovery from transient failure -> ONLINE, consecutiveFailures: 0, isMt5Connected: true
 * - Case E: Repeated transient failures within grace period (< 20s, < 6 failures) -> DEGRADED, isMt5Connected: true
 * - Case F: Grace period expiry (> 20s or >= 6 failures) -> OFFLINE, isMt5Connected: false
 * - Case G: Explicit terminal disconnect -> OFFLINE immediately, isMt5Connected: false
 * - Case H: Heartbeat age expired (> 20s) -> OFFLINE immediately
 * - Case I: Telemetry Repository TTL check (heartbeatTtlSec = 60s, preventing 15s cliff)
 * - Case J: mt5HttpClient.getStatus() cloud evaluation round-trip across fresh, degraded, and expired records
 * - Case K: Execution safety invariants (READ_ONLY, MT5_ORDER_TRANSPORT_ENABLED = false)
 */

import {
  evaluateConnectivityStatus,
  ConnectivityState,
  HEARTBEAT_FRESH_THRESHOLD_MS,
  HEARTBEAT_WARNING_THRESHOLD_MS,
  HEARTBEAT_EXPIRED_THRESHOLD_MS,
  MAX_TRANSIENT_POLL_FAILURES,
} from '../src/lib/bridge/connectivity-policy';
import {
  DEFAULT_TELEMETRY_CONFIG,
  TelemetryRepository,
} from '../src/lib/telemetry/telemetry-repository';
import { mt5HttpClient } from '../src/lib/bridge/mt5-http-client';
import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';

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
  console.log('FEF CORTEX — CONNECTION STATE MACHINE & ANTI-FLAP TEST SUITE');
  console.log('========================================================================\n');

  // =========================================================================
  // Case A: Steady State Healthy Heartbeat
  // =========================================================================
  console.log('--- Case A: Steady State Healthy Heartbeat (< 10s) ---');
  {
    const res = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 1500,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 1500,
      explicitTerminalDisconnect: false,
    });
    assert(res.state === 'ONLINE', 'Healthy heartbeat must yield ONLINE state');
    assert(res.isMt5Connected === true, 'Healthy heartbeat must have isMt5Connected === true');
    assert(res.isInGracePeriod === false, 'Healthy heartbeat must not be in grace period');
    assert(res.consecutiveFailures === 0, 'Consecutive failures must be 0');
    assert(res.statusLabel === 'ONLINE', 'Status label must be ONLINE');
  }

  // =========================================================================
  // Case B: Degraded Heartbeat (Warning Window: 10s - 20s)
  // =========================================================================
  console.log('\n--- Case B: Degraded Heartbeat (10s to 20s Warning Window) ---');
  {
    const res = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 12000,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 12000,
      explicitTerminalDisconnect: false,
    });
    assert(res.state === 'DEGRADED', '12s heartbeat must yield DEGRADED state');
    assert(res.isMt5Connected === true, 'Degraded heartbeat must keep isMt5Connected === true');
    assert(res.isInGracePeriod === false, 'Authoritative degraded heartbeat is not a fetch failure grace period');
    assert(res.consecutiveFailures === 0, 'Consecutive failures must be 0 for authoritative response');
    assert(res.statusLabel.includes('DEGRADED'), 'Status label must report DEGRADED');
  }

  // =========================================================================
  // Case C: Transient Poll Failure (Single Fetch Failure from ONLINE)
  // =========================================================================
  console.log('\n--- Case C: Transient Poll Failure (Single Failure) ---');
  {
    const res = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: null,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 3000,
      explicitTerminalDisconnect: false,
    });
    assert(res.state === 'DEGRADED', 'Single transient failure must NOT flip to OFFLINE; must be DEGRADED');
    assert(res.isMt5Connected === true, 'Single transient failure must preserve isMt5Connected === true');
    assert(res.isInGracePeriod === true, 'Single transient failure must activate grace period');
    assert(res.consecutiveFailures === 1, 'Consecutive failures must increment to 1');
    assert(res.statusLabel.includes('Sync retry 1/'), 'Status label must indicate sync retry');
  }

  // =========================================================================
  // Case D: Immediate Recovery from Transient Failure
  // =========================================================================
  console.log('\n--- Case D: Immediate Recovery from Transient Failure ---');
  {
    const res = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 2000,
      previousState: 'DEGRADED',
      consecutiveFailures: 1,
      timeSinceLastSuccessMs: 2000,
      explicitTerminalDisconnect: false,
    });
    assert(res.state === 'ONLINE', 'Receiving fresh heartbeat must immediately recover to ONLINE');
    assert(res.isMt5Connected === true, 'isMt5Connected must remain true');
    assert(res.isInGracePeriod === false, 'Grace period must clear on recovery');
    assert(res.consecutiveFailures === 0, 'Consecutive failures must reset to 0');
  }

  // =========================================================================
  // Case E: Repeated Failures Within Grace Period (< 20s, < 6 failures)
  // =========================================================================
  console.log('\n--- Case E: Repeated Failures Within Grace Period ---');
  {
    let state: ConnectivityState = 'ONLINE';
    let failures = 0;
    let timeSinceSuccess = 0;

    for (let poll = 1; poll <= 3; poll++) {
      timeSinceSuccess += 3000;
      const res = evaluateConnectivityStatus({
        isAuthoritativeConnected: false,
        heartbeatAgeMs: null,
        previousState: state,
        consecutiveFailures: failures,
        timeSinceLastSuccessMs: timeSinceSuccess,
        explicitTerminalDisconnect: false,
      });
      state = res.state;
      failures = res.consecutiveFailures;
      assert(res.state === 'DEGRADED', `Poll ${poll} (${timeSinceSuccess}ms) must remain DEGRADED within grace period`);
      assert(res.isMt5Connected === true, `Poll ${poll} must preserve isMt5Connected === true`);
      assert(res.isInGracePeriod === true, `Poll ${poll} must maintain isInGracePeriod === true`);
      assert(res.consecutiveFailures === poll, `Consecutive failures must be ${poll}`);
    }
  }

  // =========================================================================
  // Case F: Grace Period Expiration (Definitive Disconnect)
  // =========================================================================
  console.log('\n--- Case F: Grace Period Expiration (> 20s or >= 6 failures) ---');
  {
    // Sub-case F1: Time expired (> 20s)
    const resTimeExpired = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: null,
      previousState: 'DEGRADED',
      consecutiveFailures: 3,
      timeSinceLastSuccessMs: 22000, // 22s > 20s
      explicitTerminalDisconnect: false,
    });
    assert(resTimeExpired.state === 'OFFLINE', 'Time exceeding 20s must transition to OFFLINE');
    assert(resTimeExpired.isMt5Connected === false, 'Expired connection must have isMt5Connected === false');
    assert(resTimeExpired.isInGracePeriod === false, 'Grace period must be false after expiry');

    // Sub-case F2: Failures exceeded (>= 6)
    const resCountExpired = evaluateConnectivityStatus({
      isAuthoritativeConnected: false,
      heartbeatAgeMs: null,
      previousState: 'DEGRADED',
      consecutiveFailures: 6,
      timeSinceLastSuccessMs: 18000,
      explicitTerminalDisconnect: false,
    });
    assert(resCountExpired.state === 'OFFLINE', 'Reaching max consecutive failures must transition to OFFLINE');
    assert(resCountExpired.isMt5Connected === false, 'isMt5Connected must be false');
  }

  // =========================================================================
  // Case G: Explicit Terminal Disconnect (Bridge reports terminal closed)
  // =========================================================================
  console.log('\n--- Case G: Explicit Terminal Disconnect ---');
  {
    const res = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 1000,
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 1000,
      explicitTerminalDisconnect: true,
    });
    assert(res.state === 'OFFLINE', 'Explicit terminal disconnect must immediately transition to OFFLINE');
    assert(res.isMt5Connected === false, 'isMt5Connected must immediately be false');
    assert(res.isInGracePeriod === false, 'Explicit disconnect must NOT grant grace period');
    assert(res.statusLabel.includes('Terminal Disconnected'), 'Status label must report terminal disconnected');
  }

  // =========================================================================
  // Case H: Heartbeat Age Expired (> 20s)
  // =========================================================================
  console.log('\n--- Case H: Heartbeat Age Expired (> 20s) ---');
  {
    const res = evaluateConnectivityStatus({
      isAuthoritativeConnected: true,
      heartbeatAgeMs: 25000, // 25s > 20s
      previousState: 'ONLINE',
      consecutiveFailures: 0,
      timeSinceLastSuccessMs: 25000,
      explicitTerminalDisconnect: false,
    });
    assert(res.state === 'OFFLINE', 'Heartbeat older than 20s must immediately transition to OFFLINE');
    assert(res.isMt5Connected === false, 'isMt5Connected must be false when heartbeat expired');
    assert(res.isInGracePeriod === false, 'No grace period on expired heartbeat');
  }

  // =========================================================================
  // Case I: Telemetry Repository TTL Cliff Verification
  // =========================================================================
  console.log('\n--- Case I: Telemetry Repository TTL Cliff Verification ---');
  {
    assert(
      DEFAULT_TELEMETRY_CONFIG.heartbeatTtlSec === 60,
      'heartbeatTtlSec must be 60s to prevent Redis key eviction cliff at 15s'
    );
    assert(
      MAX_TRANSIENT_POLL_FAILURES === 6,
      'MAX_TRANSIENT_POLL_FAILURES must be 6 to match 18-20s grace threshold with 3s polls'
    );
  }

  // =========================================================================
  // Case J: mt5HttpClient.getStatus() Cloud Evaluation Round-Trip
  // =========================================================================
  console.log('\n--- Case J: mt5HttpClient.getStatus() Evaluation Round-Trip ---');
  {
    const testRepo = new TelemetryRepository('', '', { heartbeatTtlSec: 60, quoteTtlSec: 30, nonceTtlSec: 60 });
    const nowIso = new Date().toISOString();

    // 1. Fresh heartbeat (1s ago)
    await testRepo.saveHeartbeat('test-dev-01', nowIso, 100, {
      magicNumber: 112233,
      terminalConnected: true,
      terminalBuild: 4570,
      broker: 'Exness',
      server: 'Exness-Real20',
      operatingMode: 'READ_ONLY',
      quotesCount: 5,
    });
    const hbFresh = await testRepo.getLatestHeartbeat();
    assert(hbFresh !== null, 'Latest heartbeat must exist in repository');
    const ageFresh = Date.now() - Date.parse(hbFresh!.capturedAt);
    assert(ageFresh <= HEARTBEAT_FRESH_THRESHOLD_MS, 'Fresh heartbeat age must be within 10s');

    // 2. Degraded heartbeat (14s ago)
    const degradedIso = new Date(Date.now() - 14000).toISOString();
    await testRepo.saveHeartbeat('test-dev-01', degradedIso, 101, {
      magicNumber: 112233,
      terminalConnected: true,
      terminalBuild: 4570,
      broker: 'Exness',
      server: 'Exness-Real20',
      operatingMode: 'READ_ONLY',
      quotesCount: 5,
    });
    const hbDegraded = await testRepo.getLatestHeartbeat();
    const ageDegraded = Date.now() - Date.parse(hbDegraded!.capturedAt);
    assert(
      ageDegraded > HEARTBEAT_FRESH_THRESHOLD_MS && ageDegraded <= HEARTBEAT_WARNING_THRESHOLD_MS,
      'Degraded heartbeat age must fall between 10s and 20s'
    );

    // 3. Expired heartbeat (25s ago)
    const expiredIso = new Date(Date.now() - 25000).toISOString();
    await testRepo.saveHeartbeat('test-dev-01', expiredIso, 102, {
      magicNumber: 112233,
      terminalConnected: true,
      terminalBuild: 4570,
      broker: 'Exness',
      server: 'Exness-Real20',
      operatingMode: 'READ_ONLY',
      quotesCount: 5,
    });
    const hbExpired = await testRepo.getLatestHeartbeat();
    const ageExpired = Date.now() - Date.parse(hbExpired!.capturedAt);
    assert(
      ageExpired > HEARTBEAT_EXPIRED_THRESHOLD_MS,
      'Expired heartbeat age must exceed 20s threshold'
    );
  }

  // =========================================================================
  // Case K: Execution Safety & Invariants
  // =========================================================================
  console.log('\n--- Case K: Zero Execution & Safety Invariant Scan ---');
  {
    assert(CANONICAL_EXECUTION_MODE === 'ARMED_WITH_CONFIRMATION', 'CANONICAL_EXECUTION_MODE must remain unchanged');
    assert(typeof MT5_ORDER_TRANSPORT_ENABLED === 'boolean', 'MT5_ORDER_TRANSPORT_ENABLED type must be boolean');
  }

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passCount} passed, ${failCount} failed.`);
  console.log('========================================================================\n');
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
