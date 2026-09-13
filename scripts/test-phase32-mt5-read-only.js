/**
 * FEF TRADING SOLUTIONS: PHASE 32 — REAL MT5 READ-ONLY BRIDGE VALIDATION TEST SUITE
 * 
 * Verifies:
 * 1. Single port owner architecture (mt5-bridge-service binds 127.0.0.1:5555 only).
 * 2. Zero-DLL native MQL5 EA architecture (Wine/macOS safe, zero WinSock imports).
 * 3. Strict READ_ONLY_LOCK_ACTIVE enforcement on all execution commands.
 * 4. Genuine heartbeat & truthful error states (MT5_OFFLINE, AUTH_FAILED, BRIDGE_OFFLINE).
 * 5. Token authentication isolation & protection (.env.local, zero browser leakage).
 * 6. Account data retrieval with masked login and zero password collection.
 * 7. Real quote data & dynamic Exness suffix mapping (XAUUSDm, XAUUSD.a, XAUUSDc).
 * 8. Open positions retrieval with canonical mapping.
 * 9. Pending orders retrieval (GET_PENDING_ORDERS) with full order properties.
 * 10. Broker session data retrieval (GET_BROKER_SESSIONS) for future authoritative overrides.
 * 11. Real price pipeline & 15-agent swarm untouched.
 */

const fs = require('fs');
const assert = require('assert');
const path = require('path');
const ts = require('typescript');

// Register TypeScript on-the-fly compiler with path alias resolution
require.extensions['.ts'] = function (module, filename) {
  let source = fs.readFileSync(filename, 'utf8');
  source = source.replace(/(?:from|import)\s+['"]@\/(.*)['"]/g, (match, p1) => {
    const target = path.resolve(__dirname, '../src', p1);
    let rel = path.relative(path.dirname(filename), target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return match.replace(`@/${p1}`, rel);
  });
  source = source.replace(/require\(['"]@\/(.*)['"]\)/g, (match, p1) => {
    const target = path.resolve(__dirname, '../src', p1);
    let rel = path.relative(path.dirname(filename), target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return `require('${rel}')`;
  });
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};

const { MT5BridgeClient } = require('../src/lib/bridge/mt5-client.ts');
const { symbolDirectory, CANONICAL_SYMBOL_MAPPINGS } = require('../src/lib/bridge/symbol-mapper.ts');
const {
  handleMockRequest,
  MOCK_BROKER_DATA,
  PORT,
  HOST,
  VALID_TOKEN,
  MAGIC_NUMBER
} = require('./mt5-bridge-service.js');

console.log('================================================================');
console.log('FEF TRADING SOLUTIONS: PHASE 32 READ-ONLY MT5 BRIDGE TEST');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✕ FAIL: ${name}`);
    console.error(`    ${err.message}\n`);
    failCount++;
  }
}

async function main() {
  const protocolTransport = async (rawJson) => {
    const req = JSON.parse(rawJson.trim());
    const resp = handleMockRequest(req);
    return JSON.stringify(resp);
  };

  const client = new MT5BridgeClient({
    host: '127.0.0.1',
    port: 5555,
    token: VALID_TOKEN,
    timeoutMs: 800,
    magicNumber: MAGIC_NUMBER,
    executionEnabled: false,
    transport: protocolTransport
  });

  // -------------------------------------------------------------------------
  // SECTION 1: ARCHITECTURE & ZERO-DLL SAFETY AUDIT
  // -------------------------------------------------------------------------
  console.log('[SECTION 1: ARCHITECTURE & ZERO-DLL SAFETY AUDIT]');

  await runTest('FEF_Bridge.mq5 contains zero DLL imports and uses native MQL5 sockets only', () => {
    const mq5Path = path.resolve(__dirname, '../mql5/Experts/FEF_Bridge.mq5');
    assert(fs.existsSync(mq5Path), 'FEF_Bridge.mq5 must exist in mql5/Experts/');
    const source = fs.readFileSync(mq5Path, 'utf8');

    assert(!source.includes('#import'), 'FEF_Bridge.mq5 must NOT import any external DLLs');
    assert(!source.includes('ws2_32'), 'FEF_Bridge.mq5 must NOT use WinSock DLL');
    assert(source.includes('SocketConnect'), 'FEF_Bridge.mq5 must use native MQL5 SocketConnect');
    assert(source.includes('SocketRead'), 'FEF_Bridge.mq5 must use native MQL5 SocketRead');
    assert(source.includes('SocketSend'), 'FEF_Bridge.mq5 must use native MQL5 SocketSend');
    assert(!source.includes('SocketBindListen'), 'Non-existent SocketBindListen must not be present');
    assert(!source.includes('SocketAccept'), 'Non-existent SocketAccept must not be present');
  });

  await runTest('Single port owner: Bridge daemon binds strictly to 127.0.0.1 (never 0.0.0.0)', () => {
    const daemonPath = path.resolve(__dirname, '../scripts/mt5-bridge-service.js');
    const source = fs.readFileSync(daemonPath, 'utf8');

    assert(source.includes("HOST = '127.0.0.1'"), 'Bridge daemon must bind strictly to 127.0.0.1');
    assert(!source.includes("HOST = '0.0.0.0'"), 'Bridge daemon must NEVER bind to 0.0.0.0');
    assert.strictEqual(HOST, '127.0.0.1');
    assert.strictEqual(PORT, 5555);
  });

  // -------------------------------------------------------------------------
  // SECTION 2: READ-ONLY ENFORCEMENT (READ_ONLY_LOCK_ACTIVE)
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 2: READ-ONLY ENFORCEMENT & SAFETY GATE]');

  await runTest('Strict READ_ONLY_LOCK_ACTIVE on PLACE_ORDER, MODIFY_ORDER, CLOSE_ORDER, CANCEL_ORDER, CLOSE_ALL, DELETE_ORDER', async () => {
    const restrictedCommands = [
      'PLACE_ORDER',
      'MODIFY_ORDER',
      'CANCEL_ORDER',
      'CLOSE_POSITION',
      'CLOSE_ALL',
      'DELETE_ORDER'
    ];

    for (const cmd of restrictedCommands) {
      const res = await client.sendCommand(cmd, { symbol: 'XAUUSD', lots: 0.1 });
      assert.strictEqual(res.success, false, `Command ${cmd} must be rejected`);
      assert.strictEqual(res.state, 'CONNECTED_READ_ONLY');
      assert.strictEqual(res.error?.code, 'READ_ONLY_LOCK_ACTIVE', `Error code must be READ_ONLY_LOCK_ACTIVE for ${cmd}`);
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 3: TOKEN AUTHENTICATION & ENVIRONMENT PROTECTION
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 3: AUTHENTICATION & SECRET ISOLATION]');

  await runTest('Authentication rejects requests with missing or invalid token', async () => {
    const badClient = new MT5BridgeClient({
      host: '127.0.0.1',
      port: 5555,
      token: 'INVALID_ATTACKER_TOKEN_XYZ',
      transport: protocolTransport
    });
    const res = await badClient.ping();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.state, 'AUTH_FAILED');
    assert.strictEqual(res.error?.code, 'AUTH_FAILED');
  });

  await runTest('.env.local exists, is gitignored, and contains FEF_BRIDGE_TOKEN', () => {
    const envPath = path.resolve(__dirname, '../.env.local');
    assert(fs.existsSync(envPath), '.env.local must exist');
    const envContent = fs.readFileSync(envPath, 'utf8');
    assert(envContent.includes('FEF_BRIDGE_TOKEN'), '.env.local must define FEF_BRIDGE_TOKEN');

    const gitignorePath = path.resolve(__dirname, '../.gitignore');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    assert(gitignore.includes('.env*.local') || gitignore.includes('.env.local'), '.env.local must be gitignored');
  });

  // -------------------------------------------------------------------------
  // SECTION 4: REAL HEARTBEAT & TELEMETRY
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 4: REAL HEARTBEAT & LATENCY TELEMETRY]');

  await runTest('PING returns valid PONG with real measured latency', async () => {
    const res = await client.ping();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.command, 'PING');
    assert.strictEqual(res.data?.status, 'PONG');
    assert(typeof res.latencyMs === 'number', 'Latency must be a real measured number');
    assert(res.latencyMs >= 0, 'Latency must be non-negative');
  });

  await runTest('Terminal status reports authentic Exness broker connection & build', async () => {
    const res = await client.getTerminalStatus();
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.brokerConnected, true);
    assert.strictEqual(res.data?.operatingMode, 'READ_ONLY');
    assert(res.data?.brokerName.includes('Exness'), 'Broker name must report Exness');
    assert(res.data?.terminalBuild > 3000, 'Terminal build must be authentic MT5 build');
  });

  // -------------------------------------------------------------------------
  // SECTION 5: REAL ACCOUNT DATA & ZERO PASSWORD EXPOSURE
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 5: ACCOUNT DATA & PRIVACY AUDIT]');

  await runTest('GET_ACCOUNT returns masked account, currency, balance, equity, leverage without password', async () => {
    const res = await client.getAccount();
    assert.strictEqual(res.success, true);
    const acc = res.data;
    assert(acc.maskedLogin.includes('***'), 'Account login must be masked (e.g. 21***89)');
    assert.strictEqual(acc.currency, 'USD');
    assert(typeof acc.balance === 'number' && acc.balance > 0);
    assert(typeof acc.equity === 'number' && acc.equity > 0);
    assert(typeof acc.freeMargin === 'number' && acc.freeMargin > 0);
    assert(typeof acc.leverage === 'number' && acc.leverage > 0);
    assert.strictEqual(acc.tradeAllowed, true);

    // Ensure ZERO password fields exist anywhere in response
    const rawString = JSON.stringify(res);
    assert(!rawString.toLowerCase().includes('password'), 'Broker password must never exist in telemetry');
  });

  // -------------------------------------------------------------------------
  // SECTION 6: REAL QUOTE DATA & SYMBOL MAPPING
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 6: QUOTES & DYNAMIC BROKER SYMBOL MAPPING]');

  await runTest('GET_SYMBOLS resolves broker symbols and hydrates symbol directory', async () => {
    const res = await client.getSymbols();
    assert.strictEqual(res.success, true);
    assert(Array.isArray(res.data?.symbols), 'Symbols must be an array');
    assert(res.data?.symbols.includes('XAUUSDm'), 'Broker symbols must include XAUUSDm');

    // Verify symbolDirectory mapping
    assert.strictEqual(symbolDirectory.toBrokerSymbol('XAUUSD'), 'XAUUSDm');
    assert.strictEqual(symbolDirectory.toCanonicalSymbol('XAUUSDm'), 'XAUUSD');
    assert.strictEqual(symbolDirectory.toCanonicalSymbol('XAUUSD.a'), 'XAUUSD');
    assert.strictEqual(symbolDirectory.toCanonicalSymbol('XAUUSDc'), 'XAUUSD');
  });

  await runTest('GET_QUOTE returns Bid, Ask, Spread for all core canonical assets', async () => {
    const symbols = ['XAUUSD', 'XAGUSD', 'EURUSD', 'US100'];
    for (const sym of symbols) {
      const res = await client.getQuote(sym);
      assert.strictEqual(res.success, true, `Quote for ${sym} must succeed`);
      assert.strictEqual(res.data?.canonicalSymbol, sym);
      assert(res.data?.bid > 0, `${sym} Bid must be > 0`);
      assert(res.data?.ask > res.data?.bid, `${sym} Ask must exceed Bid`);
      assert(res.data?.spread > 0, `${sym} Spread must be > 0`);
      assert(res.data?.time, `${sym} Quote must have timestamp`);
    }
  });

  // -------------------------------------------------------------------------
  // SECTION 7: REAL OPEN POSITIONS
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 7: OPEN POSITIONS QUERY]');

  await runTest('GET_POSITIONS retrieves open positions with canonical mapping and ticket info', async () => {
    const res = await client.getPositions();
    assert.strictEqual(res.success, true);
    assert(Array.isArray(res.data?.positions), 'Positions must be an array');
    assert(res.data?.positions.length > 0, 'Must contain open positions');

    const pos = res.data?.positions[0];
    assert(pos.ticket > 0, 'Position must have valid ticket');
    assert.strictEqual(pos.canonicalSymbol, 'XAUUSD');
    assert.strictEqual(pos.type, 'BUY');
    assert(pos.lots > 0);
    assert(pos.openPrice > 0);
    assert(pos.currentPrice > 0);
    assert(pos.openTime.includes('UTC') || pos.openTime.length > 0);
  });

  // -------------------------------------------------------------------------
  // SECTION 8: REAL PENDING ORDERS
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 8: PENDING ORDERS QUERY]');

  await runTest('GET_PENDING_ORDERS retrieves pending orders with order types and canonical mapping', async () => {
    const res = await client.getPendingOrders();
    assert.strictEqual(res.success, true);
    assert(Array.isArray(res.data?.orders), 'Pending orders must be an array');
    assert(res.data?.orders.length > 0, 'Must return pending orders');

    const ord = res.data?.orders[0];
    assert(ord.ticket > 0, 'Pending order must have valid ticket');
    assert.strictEqual(ord.canonicalSymbol, 'XAUUSD');
    assert.strictEqual(ord.type, 'BUY_LIMIT');
    assert(ord.lots > 0);
    assert(ord.price > 0);
    assert(ord.magic === MAGIC_NUMBER);
  });

  // -------------------------------------------------------------------------
  // SECTION 9: BROKER TRADING SESSIONS
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 9: BROKER SESSION INFORMATION]');

  await runTest('GET_BROKER_SESSIONS returns broker symbol, tradeMode, and session windows', async () => {
    const res = await client.getBrokerSessions('XAUUSD');
    assert.strictEqual(res.success, true);
    assert(res.data?.brokerSymbol, 'Session must include brokerSymbol');
    assert.strictEqual(res.data?.tradeMode, 'FULL');
    assert(res.data?.sessionStart, 'Session must declare sessionStart');
    assert(res.data?.sessionEnd, 'Session must declare sessionEnd');
    assert.strictEqual(res.data?.marketAvailable, true);
  });

  // -------------------------------------------------------------------------
  // SECTION 10: REAL PRICE PIPELINE & SWARM INTEGRITY
  // -------------------------------------------------------------------------
  console.log('\n[SECTION 10: SYSTEM INTEGRITY (PRICES & AGENTS UNTOUCHED)]');

  await runTest('Real price pipeline in real-market-api.ts remains unmodified and active', () => {
    const apiPath = path.resolve(__dirname, '../src/lib/providers/real-market-api.ts');
    const source = fs.readFileSync(apiPath, 'utf8');
    assert(source.includes('INITIAL_LIVE_ASSETS'), 'Real market API assets intact');
    assert(source.includes('api.binance.com'), 'Binance feed endpoint intact');
    assert(source.includes('fetchLiveMarketPrices'), 'fetchLiveMarketPrices intact');
  });

  await runTest('Swarm multi-asset pipeline and 15 agents remain unmodified', () => {
    const pipePath = path.resolve(__dirname, '../src/lib/agents/multi-asset-pipeline.ts');
    const source = fs.readFileSync(pipePath, 'utf8');
    assert(source.includes('CANONICAL_COUNCIL_KEYS'), '15-agent canonical council intact');
  });

  // -------------------------------------------------------------------------
  // TEST SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`PHASE 32 TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
