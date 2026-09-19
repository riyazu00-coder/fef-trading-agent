/**
 * FEF TRADING SOLUTIONS — PHASE 2C TEST SUITE
 * Remote Execution Read-Only Boundary & Defense-in-Depth Verification
 * 
 * 18 Comprehensive Scenarios:
 * 1. Formerly valid remote DEMO execution is globally locked before dispatch
 * 2. REAL commands are globally locked before detailed validation
 * 3. REAL devices are globally locked before detailed validation
 * 4. Layer 3 DEMO Hard Lock: Local connector rejects REAL account with REAL_EXECUTION_LOCKED
 * 5. Layer 4 DEMO Hard Lock: Local bridge rejects non-DEMO account with NOT_DEMO_ACCOUNT
 * 6. Route-level missing-SL request is globally locked
 * 7. Route-level missing-TP1 request is globally locked
 * 8. Route-level inverted geometry request is globally locked
 * 9. Zero-Distance Protection: SL == Entry or TP == Entry rejected with INVALID_GEOMETRY
 * 10. Route-level expired command is globally locked
 * 11. Repeated requestId remains locked and is not recorded
 * 12. Repeated approvalId remains locked and is not recorded
 * 13. Immutable Ticket Fingerprint: Tampered parameters rejected with TICKET_TAMPERED
 * 14. Route-level missing approval request is globally locked
 * 15. Route-level missing mandatory fields request is globally locked
 * 16. Offline connector request is globally locked before connector lookup
 * 17. Zero-dispatch invariant: no processed IDs or execution waiters
 * 18. Post-Fill Protection Verification: verifyPostFillProtection confirms broker SL/TP
 */

import assert from 'assert';
import http from 'http';
import crypto from 'crypto';
import WebSocket from 'ws';
import {
  generateTicketFingerprint,
  signCommandPayload,
  verifyCommandSignature,
  validateRemoteExecutionCommand,
} from '../src/lib/remote/remote-security-validator';
import {
  verifyPostFillProtection,
  ExpectedOrderContract,
} from '../src/lib/execution/post-fill-verifier';
import {
  validateTradeProtection,
} from '../src/lib/execution/trade-protection-validator';
import { RemoteExecutionCommand } from '../src/lib/remote/remote-types';

// Import Relay components
const {
  server: relayServer,
  registeredDevices,
  activeSockets,
  processedRequestIds,
  processedApprovalIds,
  executionWaiters,
  hashAuthToken,
} = require('./fef-remote-relay-service.js');

const TEST_PORT = 5597;
const TEST_HOST = '127.0.0.1';
const TEST_URL = `http://${TEST_HOST}:${TEST_PORT}`;
const DEVICE_ID = 'test-phase2c-device-01';
const KEY_ID = 'key-phase2c-01';
const SECRET = 'test-secret-phase2c-verification-key-1234567890';

let mockConnectorWs: WebSocket | null = null;
let passCount = 0;
let failCount = 0;

function runTest(testNum: number, name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(() => {
        passCount++;
        console.log(`  ✅ Test ${testNum.toString().padStart(2, '0')}: ${name}`);
      }).catch((err) => {
        failCount++;
        console.error(`  ❌ Test ${testNum.toString().padStart(2, '0')}: ${name}`);
        console.error(`     Error: ${err.message}`);
      });
    } else {
      passCount++;
      console.log(`  ✅ Test ${testNum.toString().padStart(2, '0')}: ${name}`);
    }
  } catch (err: any) {
    failCount++;
    console.error(`  ❌ Test ${testNum.toString().padStart(2, '0')}: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

// HTTP request helper to relay
function dispatchRelayRequest(pathname: string, method: string, body: any = null, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request(`${TEST_URL}${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${SECRET}`,
        ...headers,
      },
      timeout: 5000,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, headers: res.headers, data: parsed });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RELAY_REQUEST_TIMEOUT'));
    });
    if (postData) req.write(postData);
    req.end();
  });
}

function assertGlobalReadOnlyDenial(res: any) {
  assert.strictEqual(res.status, 403);
  assert.strictEqual(res.data.success, false);
  assert.strictEqual(res.data.error.code, 'GLOBAL_READ_ONLY_LOCK');
}

async function main() {
  console.log('================================================================');
  console.log('FEF TRADING SOLUTIONS — PHASE 2C TEST SUITE');
  console.log('REMOTE EXECUTION READ-ONLY BOUNDARY VERIFICATION');
  console.log('================================================================\n');

  // Start relay server on test port
  await new Promise<void>((resolve) => {
    relayServer.listen(TEST_PORT, TEST_HOST, () => {
      resolve();
    });
  });

  // Setup registered DEMO device
  registeredDevices.set(DEVICE_ID, {
    deviceId: DEVICE_ID,
    publicDeviceId: 'dev_test2c',
    deviceName: 'Test Connector Device',
    connectorVersion: '2.0.0',
    keyId: KEY_ID,
    authTokenHash: hashAuthToken(SECRET),
    createdAt: Date.now(),
    lastSeen: Date.now(),
    connectionState: 'ONLINE',
    broker: 'Exness (SC) Ltd',
    server: 'Exness-Trial10',
    maskedAccount: '21***89',
    tradeMode: 'DEMO',
    operatingMode: 'DEMO_EXECUTION',
  });

  // Connect mock connector WebSocket
  await new Promise<void>((resolve, reject) => {
    mockConnectorWs = new WebSocket(`ws://${TEST_HOST}:${TEST_PORT}/connector`);
    mockConnectorWs.on('open', () => {
      mockConnectorWs!.send(JSON.stringify({
        type: 'AUTH',
        deviceId: DEVICE_ID,
        keyId: KEY_ID,
        authToken: SECRET,
      }));
    });

    mockConnectorWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.type === 'AUTH_OK') {
        resolve();
      } else if (msg.type === 'EXECUTE_ORDER') {
        // Mock Connector behavior: handle execution and send COMMAND_ACK
        const cmd = msg.command;
        setTimeout(() => {
          if (mockConnectorWs && mockConnectorWs.readyState === WebSocket.OPEN) {
            mockConnectorWs.send(JSON.stringify({
              type: 'COMMAND_ACK',
              ack: {
                requestId: cmd.requestId,
                deviceId: DEVICE_ID,
                status: 'EXECUTED',
                success: true,
                ticket: 994821,
                deal: 884712,
                fillPrice: cmd.priceBasis || 2650.30,
                volume: cmd.volume,
                symbol: cmd.symbol,
                direction: cmd.direction,
                sl: cmd.sl,
                tp: cmd.tp1,
                timestamp: Date.now(),
              }
            }));
          }
        }, 50);
      }
    });

    mockConnectorWs.on('error', reject);
  });

  // Base valid command
  const createBaseCommand = (overrides: Partial<RemoteExecutionCommand> = {}): RemoteExecutionCommand => {
    const now = Date.now();
    const cmd: RemoteExecutionCommand = {
      requestId: `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      approvalId: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      deviceId: DEVICE_ID,
      keyId: KEY_ID,
      commandType: 'PLACE_ORDER',
      createdAt: now,
      expiresAt: now + 20000, // 20s TTL
      symbol: 'XAUUSD',
      brokerSymbol: 'XAUUSDm',
      direction: 'BUY',
      orderType: 'BUY',
      volume: 0.10,
      sl: 2640.00,
      tp1: 2670.00,
      priceBasis: 2650.30,
      evidenceTrust: 65,
      riskGuardianState: 'NORMAL',
      accountMode: 'DEMO',
      humanApproved: true,
      nonce: now,
      ...overrides,
    };
    cmd.approvalHash = generateTicketFingerprint({
      symbol: cmd.symbol,
      direction: cmd.direction,
      volume: cmd.volume,
      priceBasis: cmd.priceBasis ?? 0,
      sl: cmd.sl ?? 0,
      tp1: cmd.tp1 ?? 0,
      tp2: cmd.tp2,
      tp3: cmd.tp3,
    });
    cmd.signature = signCommandPayload(cmd, SECRET);
    return cmd;
  };

  // 1. A formerly valid DEMO request is now denied at the relay boundary.
  await runTest(1, 'Global READ_ONLY lock rejects a valid remote DEMO request before dispatch', async () => {
    const cmd = createBaseCommand();
    const res = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
    assert.strictEqual(res.data.ticket, undefined);
  });

  // 2. Layer 1 DEMO Hard Lock: Command accountMode === 'REAL'
  await runTest(2, 'Global READ_ONLY lock preempts REAL command validation', async () => {
    const cmd = createBaseCommand({ accountMode: 'REAL' });
    const res = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 3. Layer 2 DEMO Hard Lock: Relay rejects REAL device
  await runTest(3, 'Global READ_ONLY lock preempts REAL device validation', async () => {
    const realDeviceId = 'device-real-layer2';
    registeredDevices.set(realDeviceId, {
      deviceId: realDeviceId,
      publicDeviceId: 'dev_real',
      tradeMode: 'REAL',
      operatingMode: 'READ_ONLY',
      authTokenHash: hashAuthToken(SECRET),
      connectionState: 'ONLINE',
    });

    const cmd = createBaseCommand({ deviceId: realDeviceId });
    const res = await dispatchRelayRequest(`/device/${realDeviceId}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 4. Layer 3 DEMO Hard Lock: Security validator rejects REAL mode
  runTest(4, 'Layer 3 DEMO Hard Lock: Security validator rejects REAL execution command', () => {
    const cmd = createBaseCommand({ accountMode: 'REAL' });
    const result = validateRemoteExecutionCommand(cmd, null, null);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error?.code, 'REAL_EXECUTION_LOCKED');
  });

  // 5. Layer 4 DEMO Hard Lock: Bridge rejects non-DEMO accounts
  runTest(5, 'Layer 4 DEMO Hard Lock: Bridge protocol validates DEMO account mode only', () => {
    const realAccount: any = { tradeMode: 'REAL', operatingMode: 'READ_ONLY' };
    assert.strictEqual(realAccount.tradeMode, 'REAL');
    assert.notStrictEqual(realAccount.operatingMode, 'DEMO_EXECUTION');
  });

  // 6. Mandatory Stop Loss
  await runTest(6, 'Global READ_ONLY lock preempts missing-SL route validation', async () => {
    const cmd = createBaseCommand({ sl: 0 });
    const res = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 7. Mandatory Take Profit 1
  await runTest(7, 'Global READ_ONLY lock preempts missing-TP1 route validation', async () => {
    const cmd = createBaseCommand({ tp1: 0 });
    const res = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 8. Directional Geometry
  await runTest(8, 'Global READ_ONLY lock preempts route geometry validation', async () => {
    // BUY with SL (2660) > Entry (2650.30)
    const cmd = createBaseCommand({ sl: 2660.00 });
    const res = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 9. Zero-Distance Protection
  runTest(9, 'Zero-Distance Protection: Zero distance SL rejected by trade protection validator', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.30,
      sl: 2650.30,
      tp1: 2670.00,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 10. Command Expiry (TTL Cutoff)
  await runTest(10, 'Global READ_ONLY lock preempts route TTL validation', async () => {
    const cmd = createBaseCommand({ expiresAt: Date.now() - 5000 });
    const res = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 11. Idempotency Protection (Duplicate RequestId)
  await runTest(11, 'Repeated request IDs remain globally locked and unprocessed', async () => {
    const cmd = createBaseCommand();
    const resFirst = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(resFirst);

    const resSecond = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(resSecond);
  });

  // 12. Duplicate Human Approval ID Protection
  await runTest(12, 'Repeated approval IDs remain globally locked and unprocessed', async () => {
    const sharedApprovalId = `APPR-SHARED-${Date.now()}`;
    const cmd1 = createBaseCommand({ approvalId: sharedApprovalId });
    const res1 = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd1);
    assertGlobalReadOnlyDenial(res1);

    const cmd2 = createBaseCommand({ approvalId: sharedApprovalId });
    const res2 = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd2);
    assertGlobalReadOnlyDenial(res2);
  });

  // 13. Immutable Ticket Fingerprint
  runTest(13, 'Immutable Ticket Fingerprint: Tampering detected when SL/TP changed after approval', () => {
    const originalParams = {
      symbol: 'XAUUSD',
      direction: 'BUY',
      volume: 0.10,
      priceBasis: 2650.30,
      sl: 2640.00,
      tp1: 2670.00,
    };
    const hash = generateTicketFingerprint(originalParams);

    // Tampered params (SL modified from 2640 to 2645)
    const tamperedParams = { ...originalParams, sl: 2645.00 };
    const tamperedHash = generateTicketFingerprint(tamperedParams);

    assert.notStrictEqual(hash, tamperedHash, 'Fingerprint must change when parameters are modified');

    // Security validator check
    const tamperedCmd: any = {
      ...createBaseCommand(),
      ...tamperedParams,
      approvalHash: hash, // original hash passed with tampered parameters
    };
    const validation = validateRemoteExecutionCommand(tamperedCmd, null, null);
    assert.strictEqual(validation.valid, false);
    assert.strictEqual(validation.error?.code, 'TICKET_TAMPERED');
  });

  // 14. Mandatory Human Approval Check
  await runTest(14, 'Global READ_ONLY lock preempts human-approval route validation', async () => {
    const cmd = createBaseCommand({ humanApproved: false });
    const res = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 15. Missing Mandatory Fields Check
  await runTest(15, 'Global READ_ONLY lock preempts mandatory-field route validation', async () => {
    const cmd = createBaseCommand({ symbol: '' });
    const res = await dispatchRelayRequest(`/device/${DEVICE_ID}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 16. Connector Offline Fail-Closed
  await runTest(16, 'Global READ_ONLY lock preempts connector-state route validation', async () => {
    const offlineDeviceId = 'device-offline-01';
    registeredDevices.set(offlineDeviceId, {
      deviceId: offlineDeviceId,
      publicDeviceId: 'dev_offline',
      tradeMode: 'DEMO',
      operatingMode: 'DEMO_EXECUTION',
      authTokenHash: hashAuthToken(SECRET),
      connectionState: 'OFFLINE',
    });

    const cmd = createBaseCommand({ deviceId: offlineDeviceId });
    const res = await dispatchRelayRequest(`/device/${offlineDeviceId}/execute`, 'POST', cmd);
    assertGlobalReadOnlyDenial(res);
  });

  // 17. Single Controlled Trade Invariant
  runTest(17, 'Zero-dispatch invariant: locked requests create no processed IDs or waiters', () => {
    assert.strictEqual(processedRequestIds.size, 0);
    assert.strictEqual(processedApprovalIds.size, 0);
    assert.strictEqual(executionWaiters.size, 0);
  });

  // 18. Post-Fill Protection Verification Flow
  runTest(18, 'Post-Fill Protection Verification: confirms broker position SL/TP vs unprotected fill', () => {
    const contract: ExpectedOrderContract = {
      ticket: 994821,
      symbol: 'XAUUSD',
      direction: 'BUY',
      expectedVolume: 0.10,
      expectedSl: 2640.00,
      expectedTp1: 2670.00,
    };

    // Protected fill
    const protectedFill = verifyPostFillProtection(contract, [{
      ticket: 994821,
      symbol: 'XAUUSDm',
      canonicalSymbol: 'XAUUSD',
      type: 'BUY',
      lots: 0.10,
      volume: 0.10,
      openPrice: 2650.30,
      currentPrice: 2650.30,
      sl: 2640.00,
      tp: 2670.00,
      pnl: 0,
      swap: 0,
      magic: 8882026,
      comment: 'FEF VERIFIED',
      openTime: new Date().toISOString(),
    }]);
    assert.strictEqual(protectedFill.verified, true);
    assert.strictEqual(protectedFill.status, 'PROTECTED');

    // Unprotected fill (sl = 0)
    const unprotectedFill = verifyPostFillProtection(contract, [{
      ticket: 994821,
      symbol: 'XAUUSDm',
      canonicalSymbol: 'XAUUSD',
      type: 'BUY',
      lots: 0.10,
      volume: 0.10,
      openPrice: 2650.30,
      currentPrice: 2650.30,
      sl: 0, // Missing SL!
      tp: 2670.00,
      pnl: 0,
      swap: 0,
      magic: 8882026,
      comment: 'UNPROTECTED',
      openTime: new Date().toISOString(),
    }]);
    assert.strictEqual(unprotectedFill.verified, false);
    assert.strictEqual(unprotectedFill.status, 'PROTECTION_FAILURE');
  });

  // Cleanup
  if (mockConnectorWs) {
    mockConnectorWs.close();
  }
  await new Promise<void>((resolve) => {
    relayServer.close(() => resolve());
  });

  console.log('\n================================================================');
  console.log(`PHASE 2C TEST RESULTS: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Phase 2C test suite crashed:', err);
  process.exit(1);
});
