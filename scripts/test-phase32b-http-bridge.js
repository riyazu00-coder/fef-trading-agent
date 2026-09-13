#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — PHASE 32B REGRESSION TEST SUITE
 * 
 * Validates:
 * 1. Valid UTF-8 JSON body with zero trailing NUL byte (Strict MQL5 serialization)
 * 2. Compatibility tolerance for trailing 0x00 NUL byte
 * 3. Heartbeat payload parsing & verification
 * 4. Empty positions array handling
 * 5. Empty pending-orders array handling
 * 6. Escaped broker/server strings handling
 * 7. Broker symbol suffix mapping
 * 8. Malformed JSON rejection (HTTP 400 INVALID_JSON)
 * 9. Defense-in-depth write rejection (READ_ONLY_LOCK_ACTIVE)
 * 10. FEF_HTTP_Bridge.mq5 zero DLL and zero execution functions
 */

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { EventEmitter } = require('events');

const {
  handleHttpRequest,
  bridgeState,
  PORT,
  HOST,
  VALID_TOKEN,
  HEARTBEAT_TIMEOUT_MS,
} = require('./mt5-http-bridge-service.js');

let passCount = 0;
let failCount = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✕ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    failCount++;
  }
}

// In-Memory HTTP request dispatcher supporting raw Buffers or Objects
function makeRequest({ method = 'GET', path = '/', headers = {}, body = null, rawBuffer = null }) {
  return new Promise((resolve, reject) => {
    let postData = rawBuffer;
    if (!postData && body) {
      postData = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
    }

    const reqHeaders = {
      ...headers,
      ...(postData ? { 'content-length': postData.length } : {}),
    };

    const req = new EventEmitter();
    req.method = method;
    req.url = path;
    req.headers = reqHeaders;
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    let resStatusCode = 200;
    let resHeaders = {};
    let resData = '';

    const res = {
      writeHead: (status, h) => {
        resStatusCode = status;
        if (h) resHeaders = { ...resHeaders, ...h };
      },
      write: (chunk) => { resData += chunk; },
      end: (chunk) => {
        if (chunk) resData += chunk;
        try {
          const parsed = JSON.parse(resData);
          resolve({ statusCode: resStatusCode, headers: resHeaders, body: parsed });
        } catch {
          resolve({ statusCode: resStatusCode, headers: resHeaders, raw: resData });
        }
      },
    };

    handleHttpRequest(req, res).catch(reject);

    if (postData) {
      req.emit('data', postData);
    }
    req.emit('end');
  });
}

async function main() {
  console.log('================================================================');
  console.log('FEF TRADING SOLUTIONS: PHASE 32B JSON & TRANSPORT REGRESSION AUDIT');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // SECTION 1: ARCHITECTURE & ZERO-DLL AUDIT
  // -------------------------------------------------------------------------
  console.log('[SECTION 1: MQL5 SOURCE & ZERO-DLL AUDIT]');

  await runTest('FEF_HTTP_Bridge.mq5 resizes buffer to strip trailing null terminator', () => {
    const mq5Path = path.resolve(__dirname, '../mql5/Experts/FEF_HTTP_Bridge.mq5');
    assert(fs.existsSync(mq5Path), 'FEF_HTTP_Bridge.mq5 must exist');
    const source = fs.readFileSync(mq5Path, 'utf8');

    assert(source.includes('ArrayResize(postData, bytes - 1)'), 'Must strip trailing null byte using ArrayResize');
    assert(!source.includes('#import'), 'Must contain ZERO DLL imports');
    assert(!source.includes('OrderSend'), 'Must contain ZERO OrderSend calls');
    assert(!source.includes('CTrade'), 'Must contain ZERO CTrade references');
    assert(!source.includes('PositionOpen'), 'Must contain ZERO PositionOpen calls');
  });

  // -------------------------------------------------------------------------
  // SECTION 2: JSON SERIALIZATION & NUL BYTE REGRESSIONS
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 2: JSON SERIALIZATION & NUL TOLERANCE]');

  await runTest('Clean UTF-8 JSON without null terminator succeeds (HTTP 200)', async () => {
    const jsonStr = JSON.stringify({
      terminalBuild: 4570,
      accountLogin: '21058291',
      broker: 'Exness (SC) Ltd',
      server: 'Exness-Real15',
      accountCurrency: 'USD',
      magic: 8882026,
      timestamp: Date.now()
    });
    const cleanBuffer = Buffer.from(jsonStr, 'utf8');

    const res = await makeRequest({
      method: 'POST',
      path: '/mt5/heartbeat',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${VALID_TOKEN}`
      },
      rawBuffer: cleanBuffer
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.mode, 'READ_ONLY');
  });

  await runTest('Payload with trailing 0x00 NUL byte is safely tolerated by Node bridge', async () => {
    const jsonStr = JSON.stringify({
      terminalBuild: 4570,
      accountLogin: '21058291',
      broker: 'Exness (SC) Ltd',
      server: 'Exness-Real15',
      accountCurrency: 'USD',
      magic: 8882026,
      timestamp: Date.now()
    });
    // Append 0x00 null byte directly to simulate older or un-recompiled EA
    const bufferWithNul = Buffer.concat([Buffer.from(jsonStr, 'utf8'), Buffer.from([0x00])]);

    const res = await makeRequest({
      method: 'POST',
      path: '/mt5/heartbeat',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${VALID_TOKEN}`
      },
      rawBuffer: bufferWithNul
    });
    assert.strictEqual(res.statusCode, 200, 'Must succeed despite trailing NUL byte');
    assert.strictEqual(res.body.success, true);
  });

  await runTest('Truly malformed JSON is cleanly rejected with HTTP 400 INVALID_JSON', async () => {
    const badJson = Buffer.from('{"terminalBuild": 4570, broker: NOT_VALID_JSON', 'utf8');
    const res = await makeRequest({
      method: 'POST',
      path: '/mt5/heartbeat',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${VALID_TOKEN}`
      },
      rawBuffer: badJson
    });
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error?.code, 'INVALID_JSON');
  });

  // -------------------------------------------------------------------------
  // SECTION 3: PAYLOAD BUILDERS & EDGE CASES
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 3: PAYLOAD BUILDERS & ESCAPING]');

  await runTest('Escaped strings in broker and server names parse accurately', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/mt5/account',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${VALID_TOKEN}`
      },
      body: {
        maskedLogin: '21058291',
        broker: 'Exness \"Global\" Ltd \\ Europe',
        server: 'Exness\\Real-15',
        currency: 'USD',
        tradeMode: 'REAL',
        balance: 10500.25,
        equity: 10520.50
      }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(bridgeState.account.broker, 'Exness \"Global\" Ltd \\ Europe');
  });

  await runTest('Empty positions array ([]) parses cleanly with count = 0', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/mt5/positions',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${VALID_TOKEN}`
      },
      body: { positions: [] }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.count, 0);
  });

  await runTest('Empty pending-orders array ([]) parses cleanly with count = 0', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/mt5/pending-orders',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${VALID_TOKEN}`
      },
      body: { orders: [] }
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.count, 0);
  });

  await runTest('Quote telemetry with broker suffixes resolves canonical tickers', async () => {
    const res = await makeRequest({
      method: 'POST',
      path: '/mt5/quote',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${VALID_TOKEN}`
      },
      body: {
        quotes: [
          { canonicalSymbol: 'XAUUSD', brokerSymbol: 'XAUUSDm', bid: 2892.50, ask: 2892.75, spread: 25.0 },
          { canonicalSymbol: 'XAGUSD', brokerSymbol: 'XAGUSD.a', bid: 32.40, ask: 32.42, spread: 2.0 }
        ]
      }
    });
    assert.strictEqual(res.statusCode, 200);

    const quoteRes = await makeRequest({
      method: 'POST',
      path: '/api/command',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${VALID_TOKEN}`
      },
      body: { command: 'GET_QUOTE', symbol: 'XAUUSD' }
    });
    assert.strictEqual(quoteRes.body.success, true);
    assert.strictEqual(quoteRes.body.data.canonicalSymbol, 'XAUUSD');
    assert.strictEqual(quoteRes.body.data.brokerSymbol, 'XAUUSDm');
  });

  // -------------------------------------------------------------------------
  // SECTION 4: STRICT READ-ONLY DEFENSE-IN-DEPTH
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 4: DEFENSE-IN-DEPTH WRITE REJECTION]');

  await runTest('Mutating commands strictly rejected with READ_ONLY_LOCK_ACTIVE', async () => {
    const mutatingCommands = [
      'PLACE_ORDER',
      'MODIFY_ORDER',
      'CANCEL_ORDER',
      'CLOSE_POSITION',
      'CLOSE_ALL',
      'DELETE_ORDER'
    ];

    for (const cmd of mutatingCommands) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/command',
        headers: {
          'content-type': 'application/json',
          'authorization': `Bearer ${VALID_TOKEN}`
        },
        body: { command: cmd, symbol: 'XAUUSD', lots: 0.1 }
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.state, 'CONNECTED_READ_ONLY');
      assert.strictEqual(res.body.error?.code, 'READ_ONLY_LOCK_ACTIVE');
    }
  });

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 32B REGRESSION RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
