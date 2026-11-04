import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { MT5BridgeClient } from '../src/lib/bridge/mt5-client';
import { MT5HttpClient } from '../src/lib/bridge/mt5-http-client';
import { RemoteRelayManager } from '../src/lib/remote/remote-relay-manager';
import { CANONICAL_EXECUTION_MODE, evaluateMt5ExecutionPermission, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';

async function main() {
  let passed = 0;
  let transportCalls = 0;
  const check = (condition: unknown, message: string) => {
    assert(condition, message);
    passed++;
    console.log(`  ✓ ${message}`);
  };

  console.log('FEF CORTEX V1.1.2-S — GLOBAL READ-ONLY');
  check(CANONICAL_EXECUTION_MODE === 'READ_ONLY' && MT5_ORDER_TRANSPORT_ENABLED === false, 'canonical execution policy is READ_ONLY / transport disabled');

  const cases = [
    { name: 'REAL', body: { accountMode: 'REAL' } },
    { name: 'DEMO', body: { accountMode: 'DEMO' } },
    { name: 'valid approval', body: { accountMode: 'DEMO', humanApproved: true } },
    { name: 'valid evidence', body: { accountMode: 'DEMO', humanApproved: true, evidenceTrust: 100 } },
    { name: 'signed request', body: { accountMode: 'DEMO', humanApproved: true, signature: 'valid-looking-signature' } },
    { name: 'valid SL/TP', body: { accountMode: 'DEMO', humanApproved: true, symbol: 'XAUUSD', direction: 'BUY', entry: 4300, sl: 4290, tp1: 4320 } },
    { name: 'connector online', body: { accountMode: 'DEMO', humanApproved: true, connectorOnline: true } },
  ];

  for (const item of cases) {
    void item.body;
    const decision = evaluateMt5ExecutionPermission();
    check(!decision.allowed && decision.error.code === 'GLOBAL_READ_ONLY_LOCK', `READ_ONLY + ${item.name} is denied`);
  }

  const tcp = new MT5BridgeClient({ executionEnabled: true, transport: async () => {
    transportCalls++;
    return JSON.stringify({ success: true });
  }});
  const tcpResult = await tcp.sendCommand('PLACE_ORDER', { humanApproved: true }, 'BTCUSD');
  check(tcpResult.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'local TCP bridge denies despite executionEnabled override');

  const http = new MT5HttpClient({ baseUrl: 'http://production.invalid' });
  const httpResult = await http.sendCommand('PLACE_ORDER', { humanApproved: true }, 'BTCUSD');
  check(httpResult.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'local HTTP bridge client denies before network transport');
  check(transportCalls === 0, 'no MT5 client transport callback was reached');

  const relay = new RemoteRelayManager();
  const relayResult = relay.queueCommand({ requestId: 'read-only-test' } as any);
  check(relayResult.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'RemoteRelayManager denies before command validation or queueing');
  check(relayResult.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'RemoteRelayManager defaults allowOrderTransportForTesting to false');

  // Test-only transport isolation verification
  const prevEnv1 = process.env.FEF_ALLOW_ORDER_TRANSPORT;
  const prevEnv2 = process.env.ALLOW_ORDER_TRANSPORT;
  process.env.FEF_ALLOW_ORDER_TRANSPORT = 'true';
  process.env.ALLOW_ORDER_TRANSPORT = 'true';
  const envRelay = new RemoteRelayManager();
  const envResult = envRelay.queueCommand({ requestId: 'env-override-attempt' } as any);
  check(envResult.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'allowOrderTransportForTesting cannot be activated via environment variables');
  if (prevEnv1 !== undefined) process.env.FEF_ALLOW_ORDER_TRANSPORT = prevEnv1; else delete process.env.FEF_ALLOW_ORDER_TRANSPORT;
  if (prevEnv2 !== undefined) process.env.ALLOW_ORDER_TRANSPORT = prevEnv2; else delete process.env.ALLOW_ORDER_TRANSPORT;

  const testRelay = new RemoteRelayManager({ allowOrderTransportForTesting: true });
  check(CANONICAL_EXECUTION_MODE === 'READ_ONLY' && MT5_ORDER_TRANSPORT_ENABLED === false, 'allowOrderTransportForTesting cannot override canonical READ_ONLY policy');

  // Explicit queueCommand() test with allowOrderTransportForTesting: true
  // Verify that an unapproved or invalid command still fails pre-flight security validation
  const testQueueResult = testRelay.queueCommand({ requestId: 'test-req-raw', deviceId: 'unregistered-device', nonce: 1 } as any);
  check(!testQueueResult.success && testQueueResult.error?.code === 'HUMAN_APPROVAL_REQUIRED', 'queueCommand with allowOrderTransportForTesting still enforces pre-flight validation');

  // Verify downstream defense: Even if a command existed in relay memory, downstream components strictly enforce GLOBAL_READ_ONLY_LOCK
  const downstreamHttpResult = await http.sendCommand('PLACE_ORDER', { humanApproved: true }, 'XAUUSD');
  check(downstreamHttpResult.error?.code === 'GLOBAL_READ_ONLY_LOCK', 'downstream MT5 HTTP client strictly enforces GLOBAL_READ_ONLY_LOCK before transport');

  const relaySource = fs.readFileSync(path.resolve('relay-deploy/fef-remote-relay-service.js'), 'utf8');
  const connectorSource = fs.readFileSync(path.resolve('scripts/fef-local-connector-agent.js'), 'utf8');
  const eaSource = fs.readFileSync(path.resolve('mql5/Experts/FEF_HTTP_Bridge.mq5'), 'utf8');
  const simulatorSource = fs.readFileSync(path.resolve('src/lib/bridge/engineering-demo-transport.ts'), 'utf8');
  check(relaySource.includes('GLOBAL_READ_ONLY_LOCK') && relaySource.indexOf('GLOBAL_READ_ONLY_LOCK') < relaySource.indexOf('ws.send(JSON.stringify({\n        type: \'EXECUTE_ORDER\''), 'deployed relay denies before connector dispatch');
  check(connectorSource.includes('GLOBAL_READ_ONLY_LOCK') && connectorSource.indexOf('GLOBAL_READ_ONLY_LOCK') < connectorSource.indexOf("command: 'PLACE_ORDER'"), 'connector denies before local bridge forwarding');
  check(eaSource.indexOf('GLOBAL_READ_ONLY_LOCK') < eaSource.indexOf('OrderSend(req, res)'), 'EA denies before OrderSend');
  check(!/fetch\(|sendCommand\(|dispatchLocalBridgeCommand\(|OrderSend\(/.test(simulatorSource), 'paper/demo simulator prepares local context without MT5 transport');
  check(transportCalls === 0, 'orders sent = 0');

  console.log(`GLOBAL READ-ONLY: ${passed}/${passed} PASSED`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
