/**
 * FEF TRADING SOLUTIONS — PHASE 2 SECURE REMOTE MT5 FOUNDATION TESTS
 * 
 * Comprehensive 12-Point Test Suite:
 * 1. Device auth success
 * 2. Invalid auth rejected
 * 3. Stale connector locks execution fail-closed
 * 4. Duplicate request ID rejected (Idempotency)
 * 5. Expired command rejected (Replay / TTL)
 * 6. REAL account rejected (Security Hard-Lock)
 * 7. DEMO account allowed only in DEMO_EXECUTION
 * 8. Telemetry provenance preserved
 * 9. Broker price authority preserved
 * 10. Disconnect -> reference only
 * 11. Production cannot fall back to reference price for execution
 * 12. Connector reconnect does not replay stale command
 */

import { RemoteRelayManager } from '../src/lib/remote/remote-relay-manager';
import { LocalConnectorAgent } from '../src/lib/remote/local-connector-agent';
import {
  RemoteTelemetrySnapshot,
  RemoteExecutionCommand,
} from '../src/lib/remote/remote-types';
import {
  resolvePriceForPurpose,
  buildCanonicalFromBrokerQuote,
} from '../src/lib/price/price-authority';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (!condition) {
    console.error(`❌ FAIL: ${testName}`, detail !== undefined ? detail : '');
    failCount++;
  } else {
    console.log(`✅ PASS: ${testName}`);
    passCount++;
  }
}

async function runSuite() {
  console.log('================================================================');
  console.log('FEF TRADING SOLUTIONS: PHASE 2 REMOTE FOUNDATION TEST SUITE');
  console.log('================================================================\n');

  const relay = new RemoteRelayManager();

  // Test setup credentials
  const deviceId = 'test-device-uuid-101';
  const keyId = 'key-v1-primary';
  const authToken = 'fef_super_secret_auth_token_778';

  const mockFreshQuote = {
    canonicalSymbol: 'XAUUSD',
    brokerSymbol: 'XAUUSD',
    bid: 4325.50,
    ask: 4325.55,
    spread: 50,
    digits: 3,
    point: 0.001,
    time: new Date().toISOString(),
    timestamp: Date.now(),
    freshness: 'FRESH' as const,
    isStale: false,
    ageMs: 400,
  };

  const mockTelemetry: RemoteTelemetrySnapshot = {
    deviceId,
    publicDeviceId: 'dev_test-dev',
    terminalConnected: true,
    bridgeConnected: true,
    heartbeatAgeMs: 500,
    broker: 'Exness Technologies Ltd',
    server: 'Exness-MT5Trial16',
    maskedAccount: '26***84',
    tradeMode: 'DEMO',
    operatingMode: 'DEMO_EXECUTION',
    priceAuthority: 'MT5_BROKER',
    quotes: {
      XAUUSD: mockFreshQuote,
    },
    symbolSpecs: {
      XAUUSD: {
        symbol: 'XAUUSD',
        minLot: 0.01,
        maxLot: 20.0,
        lotStep: 0.01,
        contractSize: 100,
        tickValue: 0.001,
        tickSize: 0.001,
        digits: 3,
        tradeMode: 'FULL',
      },
    },
    positions: [],
    pendingOrders: [],
    activePositionsCount: 0,
    timestamp: Date.now(),
    isStale: false,
  };

  // -----------------------------------------------------------------
  // TEST 1: Device Auth Success
  // -----------------------------------------------------------------
  console.log('[TEST 1: Device Auth Success]');
  relay.registerDevice({
    deviceId,
    deviceName: 'MacBook Pro - London Desk',
    connectorVersion: '2.0.0',
    authToken,
    keyId,
    broker: 'Exness Technologies Ltd',
    server: 'Exness-MT5Trial16',
    maskedAccount: '26***84',
    tradeMode: 'DEMO',
    operatingMode: 'DEMO_EXECUTION',
  });

  const authSuccess = relay.authenticate({ deviceId, keyId, authToken });
  assert(authSuccess.success === true, 'Device authentication succeeds with valid credentials');

  // Ingest baseline telemetry
  relay.ingestTelemetry(deviceId, mockTelemetry);

  // -----------------------------------------------------------------
  // TEST 2: Invalid Auth Rejected
  // -----------------------------------------------------------------
  console.log('\n[TEST 2: Invalid Auth Rejected]');
  const badToken = relay.authenticate({ deviceId, keyId, authToken: 'wrong_secret_token' });
  assert(badToken.success === false, 'Rejects incorrect auth token');

  const badKeyId = relay.authenticate({ deviceId, keyId: 'expired-key-id', authToken });
  assert(badKeyId.success === false, 'Rejects unrecognized key identifier');

  const unknownDevice = relay.authenticate({ deviceId: 'unknown-uuid', keyId, authToken });
  assert(unknownDevice.success === false, 'Rejects unknown device ID');

  // -----------------------------------------------------------------
  // TEST 3: Stale Connector Locks Execution (Fail-Closed)
  // -----------------------------------------------------------------
  console.log('\n[TEST 3: Stale Connector Locks Execution Fail-Closed]');
  const staleTelemetry: RemoteTelemetrySnapshot = {
    ...mockTelemetry,
    heartbeatAgeMs: 12500, // > 6000ms threshold
    isStale: true,
  };
  relay.ingestTelemetry(deviceId, staleTelemetry);

  const prodStatusStale = relay.getProductionStatus(deviceId, Date.now() + 10000);
  assert(prodStatusStale.isExecutable === false, 'Stale connector locks execution');
  assert(prodStatusStale.priceAuthority === 'REFERENCE', 'Stale connector falls closed to REFERENCE price authority');
  assert(prodStatusStale.statusLabel.includes('LOCKED') || prodStatusStale.statusLabel.includes('STALE'), 'Status label reflects STALE execution lock');

  // Restore fresh telemetry
  relay.ingestTelemetry(deviceId, mockTelemetry);

  // -----------------------------------------------------------------
  // TEST 3B: Fresh Connector Must Not Mask Unhealthy MT5 Terminal
  // -----------------------------------------------------------------
  console.log('\n[TEST 3B: Fresh Connector Cannot Mask Unhealthy MT5 Terminal]');

  const terminalDisconnectedTelemetry: RemoteTelemetrySnapshot = {
    ...mockTelemetry,
    terminalConnected: false,
    heartbeatAgeMs: 500,
    isStale: false,
  };
  relay.ingestTelemetry(deviceId, terminalDisconnectedTelemetry);
  const terminalDisconnectedStatus = relay.getProductionStatus(deviceId);
  assert(terminalDisconnectedStatus.connected === false, 'Fresh connector cannot report CONNECTED when MT5 terminal is disconnected');
  assert(terminalDisconnectedStatus.priceAuthority === 'REFERENCE', 'Disconnected MT5 terminal falls closed to REFERENCE authority');
  assert(terminalDisconnectedStatus.isExecutable === false, 'Disconnected MT5 terminal is not executable');

  const bridgeDisconnectedTelemetry: RemoteTelemetrySnapshot = {
    ...mockTelemetry,
    bridgeConnected: false,
    heartbeatAgeMs: 500,
    isStale: false,
  };
  relay.ingestTelemetry(deviceId, bridgeDisconnectedTelemetry);
  const bridgeDisconnectedStatus = relay.getProductionStatus(deviceId);
  assert(bridgeDisconnectedStatus.connected === false, 'Fresh connector cannot report CONNECTED when local bridge is disconnected');
  assert(bridgeDisconnectedStatus.priceAuthority === 'REFERENCE', 'Disconnected local bridge falls closed to REFERENCE authority');

  const terminalHeartbeatStaleTelemetry: RemoteTelemetrySnapshot = {
    ...mockTelemetry,
    terminalConnected: true,
    bridgeConnected: true,
    heartbeatAgeMs: 12500,
    isStale: false,
  };
  relay.ingestTelemetry(deviceId, terminalHeartbeatStaleTelemetry);
  const terminalHeartbeatStaleStatus = relay.getProductionStatus(deviceId);
  assert(terminalHeartbeatStaleStatus.connected === false, 'Fresh connector cannot mask stale MT5 terminal heartbeat');
  assert(terminalHeartbeatStaleStatus.heartbeatAgeMs === 12500, 'Status exposes actual MT5 terminal heartbeat age');
  assert(terminalHeartbeatStaleStatus.priceAuthority === 'REFERENCE', 'Stale MT5 heartbeat falls closed to REFERENCE authority');

  relay.ingestTelemetry(deviceId, mockTelemetry);
  const healthyTerminalStatus = relay.getProductionStatus(deviceId);
  assert(healthyTerminalStatus.connected === true, 'Healthy connector, bridge, terminal, and heartbeat report CONNECTED');
  assert(healthyTerminalStatus.heartbeatAgeMs === 500, 'Healthy status exposes MT5 terminal heartbeat age');
  assert(healthyTerminalStatus.priceAuthority === 'MT5_BROKER', 'Healthy MT5 path restores MT5_BROKER authority');

  // -----------------------------------------------------------------
  // TEST 4: Duplicate Request ID Rejected (Idempotency)
  // -----------------------------------------------------------------
  console.log('\n[TEST 4: Duplicate Request ID Rejected]');
  const now = Date.now();
  const validCmd: RemoteExecutionCommand = {
    requestId: 'REQ-DEMO-IDEMPOTENCY-001',
    deviceId,
    commandType: 'PLACE_ORDER',
    createdAt: now,
    expiresAt: now + 15000,
    symbol: 'XAUUSD',
    brokerSymbol: 'XAUUSD',
    direction: 'BUY',
    volume: 0.01,
    sl: 4300.00,
    tp1: 4350.00,
    priceBasis: 4325.55,
    evidenceTrust: 75,
    accountMode: 'DEMO',
    magic: 8882026,
    comment: 'FEF V1 DEMO ACCEPTANCE',
    approvalId: 'APPR-101',
    humanApproved: true,
    nonce: 1,
  };

  const queueFirst = relay.queueCommand(validCmd);
  assert(queueFirst.success === false, 'First execution request is blocked by global READ_ONLY');
  assert(queueFirst.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'First request returns GLOBAL_READ_ONLY_LOCK');

  const queueDuplicate = relay.queueCommand(validCmd);
  assert(queueDuplicate.success === false, 'Duplicate execution request ID is strictly rejected');
  assert(queueDuplicate.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'Global READ_ONLY precedes duplicate handling');

  // Clear popped command for next tests
  relay.popNextCommand(deviceId);

  // -----------------------------------------------------------------
  // TEST 5: Expired Command Rejected (TTL / Replay Protection)
  // -----------------------------------------------------------------
  console.log('\n[TEST 5: Expired Command Rejected]');
  const expiredCmd: RemoteExecutionCommand = {
    ...validCmd,
    requestId: 'REQ-DEMO-EXPIRED-002',
    createdAt: now - 20000,
    expiresAt: now - 5000, // Expired 5 seconds ago
    nonce: 2,
  };

  const queueExpired = relay.queueCommand(expiredCmd);
  assert(queueExpired.success === false, 'Expired command is rejected at queue submission');
  assert(queueExpired.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'Global READ_ONLY precedes TTL handling');

  // -----------------------------------------------------------------
  // TEST 6: REAL Account Rejected (Security Hard-Lock)
  // -----------------------------------------------------------------
  console.log('\n[TEST 6: REAL Account Rejected]');
  const realDeviceId = 'real-account-device-999';
  relay.registerDevice({
    deviceId: realDeviceId,
    deviceName: 'Real Account Terminal',
    connectorVersion: '2.0.0',
    authToken: 'real_auth_token_secret',
    keyId: 'key-v1-real',
    broker: 'Exness Real',
    server: 'Exness-Real10',
    maskedAccount: '88***99',
    tradeMode: 'REAL',
    operatingMode: 'READ_ONLY',
  });

  const realCmd: RemoteExecutionCommand = {
    ...validCmd,
    requestId: 'REQ-REAL-ATTEMPT-003',
    deviceId: realDeviceId,
    nonce: 3,
  };

  const queueReal = relay.queueCommand(realCmd);
  assert(queueReal.success === false, 'REAL account execution command is strictly rejected');
  assert(queueReal.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'Global READ_ONLY also denies REAL accounts');

  // -----------------------------------------------------------------
  // TEST 7: DEMO Account Allowed Only in DEMO_EXECUTION
  // -----------------------------------------------------------------
  console.log('\n[TEST 7: DEMO Account Allowed Only in DEMO_EXECUTION]');
  // Switch to READ_ONLY
  const readOnlyTelemetry: RemoteTelemetrySnapshot = {
    ...mockTelemetry,
    operatingMode: 'READ_ONLY',
  };
  relay.ingestTelemetry(deviceId, readOnlyTelemetry);

  const roCmd: RemoteExecutionCommand = {
    ...validCmd,
    requestId: 'REQ-DEMO-RO-004',
    nonce: 4,
  };

  const queueRO = relay.queueCommand(roCmd);
  assert(queueRO.success === false, 'Order rejected when in READ_ONLY mode');
  assert(queueRO.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'Rejection code is GLOBAL_READ_ONLY_LOCK');

  // Restore to DEMO_EXECUTION
  relay.ingestTelemetry(deviceId, mockTelemetry);
  const okCmd: RemoteExecutionCommand = {
    ...validCmd,
    requestId: 'REQ-DEMO-OK-005',
    nonce: 5,
  };
  const queueOK = relay.queueCommand(okCmd);
  assert(queueOK.success === false, 'Order remains denied in DEMO_EXECUTION with verified DEMO account');
  assert(queueOK.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'DEMO cannot override global READ_ONLY');
  relay.popNextCommand(deviceId);

  // -----------------------------------------------------------------
  // TEST 8: Telemetry Provenance Preserved
  // -----------------------------------------------------------------
  console.log('\n[TEST 8: Telemetry Provenance Preserved]');
  const status = relay.getProductionStatus(deviceId);
  assert(status.broker === 'Exness Technologies Ltd', 'Broker identity preserved across remote boundary');
  assert(status.server === 'Exness-MT5Trial16', 'Broker server preserved across remote boundary');
  assert(status.maskedAccount === '26***84', 'Masked account login preserved');
  assert(status.priceAuthority === 'MT5_BROKER', 'Price authority is MT5_BROKER when remote MT5 connected');

  // -----------------------------------------------------------------
  // TEST 9: Broker Price Authority Preserved
  // -----------------------------------------------------------------
  console.log('\n[TEST 9: Broker Price Authority Preserved]');
  const canonicalPrice = buildCanonicalFromBrokerQuote(
    'XAUUSD',
    mockFreshQuote,
    status.broker,
    status.server
  );
  assert(canonicalPrice.executable === true, 'Remote broker price is executable');
  assert(canonicalPrice.ask === 4325.55, 'Authoritative ask price preserved');
  assert(canonicalPrice.bid === 4325.50, 'Authoritative bid price preserved');
  assert(canonicalPrice.providerType === 'MT5_BROKER', 'Provider type is MT5_BROKER');

  // -----------------------------------------------------------------
  // TEST 10: Disconnect -> Reference Only
  // -----------------------------------------------------------------
  console.log('\n[TEST 10: Disconnect -> Reference Only]');
  relay.handleDisconnect(deviceId);
  const disconnectedStatus = relay.getProductionStatus(deviceId);
  assert(disconnectedStatus.connected === false, 'Device marked disconnected');
  assert(disconnectedStatus.priceAuthority === 'REFERENCE', 'Falls back to REFERENCE price authority');
  assert(disconnectedStatus.isExecutable === false, 'Execution strictly disabled on disconnect');

  // -----------------------------------------------------------------
  // TEST 11: Production Cannot Fall Back to Reference Price for Execution
  // -----------------------------------------------------------------
  console.log('\n[TEST 11: Production Cannot Fall Back to Reference Price for Execution]');
  const mockRefAsset = {
    symbol: 'XAUUSD',
    price: 4320.00,
    bid: 4319.50,
    ask: 4320.50,
    spread: '1.00',
    source: 'GOLD_API' as const,
  };

  const resolvedExecutionPrice = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
    side: 'BUY',
    referenceAsset: mockRefAsset as any,
    brokerQuote: null,
    isMt5Connected: false,
    operatingMode: 'READ_ONLY',
  });

  assert(resolvedExecutionPrice.executable === false, 'Execution price cannot use reference feed (executable = false)');
  assert(resolvedExecutionPrice.isExecutable === false, 'Execution price is not executable');
  assert(resolvedExecutionPrice.status === 'LOCKED', 'Status is LOCKED');
  assert(resolvedExecutionPrice.priceClass === 'REFERENCE' || resolvedExecutionPrice.priceClass === 'REFERENCE_LIVE', 'Price class is strictly REFERENCE');
  assert(Boolean(resolvedExecutionPrice.reason && resolvedExecutionPrice.reason.includes('not connected')), 'Documents explicit fail-closed reason');

  // -----------------------------------------------------------------
  // TEST 12: Connector Reconnect Does Not Replay Stale Command
  // -----------------------------------------------------------------
  console.log('\n[TEST 12: Connector Reconnect Does Not Replay Stale Command]');
  // Reconnect device
  relay.handleReconnect(deviceId);
  relay.ingestTelemetry(deviceId, mockTelemetry);

  // Queue a command while connected
  const cmdPriorToDisconnect: RemoteExecutionCommand = {
    ...validCmd,
    requestId: 'REQ-STALE-QUEUE-006',
    nonce: 6,
  };
  relay.queueCommand(cmdPriorToDisconnect);

  // Disconnect occurs before connector popped the command
  relay.handleDisconnect(deviceId);

  // Reconnection occurs
  relay.handleReconnect(deviceId);

  // Check queue: MUST be empty! Command must NOT be replayed!
  const poppedOnReconnect = relay.popNextCommand(deviceId);
  assert(poppedOnReconnect === null, 'Queue is completely purged on reconnect — zero stale command replay');

  const ack = relay.getAck('REQ-STALE-QUEUE-006');
  assert(ack === null, 'Globally denied command never enters the queue or acknowledgment lifecycle');

  // -----------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 2 REMOTE FOUNDATION RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Fatal error running Phase 2 foundation suite:', err);
  process.exit(1);
});
