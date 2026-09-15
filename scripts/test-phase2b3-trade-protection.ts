/**
 * FEF TRADING SOLUTIONS — PHASE 2B.3 TEST SUITE
 * Mandatory SL/TP Protection & Broker Constraint Verification
 * 
 * 28 Comprehensive Scenarios:
 * 1. BUY Valid: SL < Entry < TP1, positive R:R -> VALID / PROTECTED ORDER
 * 2. SELL Valid: SL > Entry > TP1, positive R:R -> VALID / PROTECTED ORDER
 * 3. BUY Missing SL -> MISSING_SL / EXECUTION LOCKED
 * 4. BUY Missing TP1 -> MISSING_TP1 / EXECUTION LOCKED
 * 5. SELL Missing SL -> MISSING_SL / EXECUTION LOCKED
 * 6. SELL Missing TP1 -> MISSING_TP1 / EXECUTION LOCKED
 * 7. BUY Inverted SL (SL >= Entry) -> INVALID_GEOMETRY
 * 8. BUY Zero-distance SL (SL == Entry) -> INVALID_GEOMETRY
 * 9. BUY Inverted TP1 (TP1 <= Entry) -> INVALID_GEOMETRY
 * 10. BUY Zero-distance TP1 (TP1 == Entry) -> INVALID_GEOMETRY
 * 11. SELL Inverted SL (SL <= Entry) -> INVALID_GEOMETRY
 * 12. SELL Zero-distance SL (SL == Entry) -> INVALID_GEOMETRY
 * 13. SELL Inverted TP1 (TP1 >= Entry) -> INVALID_GEOMETRY
 * 14. SELL Zero-distance TP1 (TP1 == Entry) -> INVALID_GEOMETRY
 * 15. BUY Multi-target TP2 Inverted (TP2 <= TP1) -> INVALID_GEOMETRY
 * 16. BUY Multi-target TP3 Inverted (TP3 <= TP2) -> INVALID_GEOMETRY
 * 17. SELL Multi-target TP2 Inverted (TP2 >= TP1) -> INVALID_GEOMETRY
 * 18. SELL Multi-target TP3 Inverted (TP3 >= TP2) -> INVALID_GEOMETRY
 * 19. Non-numeric / NaN / Infinity inputs -> Rejection (INVALID_PRICE or MISSING_SL/TP1)
 * 20. Broker Stop Level Violation for SL (SL dist < stopsLevel * point) -> BROKER_STOP_LEVEL_VIOLATION
 * 21. Broker Stop Level Violation for TP (TP dist < stopsLevel * point) -> BROKER_STOP_LEVEL_VIOLATION
 * 22. Broker Freeze Level Violation (SL dist < freezeLevel * point) -> BROKER_FREEZE_LEVEL_VIOLATION
 * 23. Stale Broker Quote Rejection (age > maxQuoteAgeMs) -> STALE_PRICE
 * 24. Missing / Ambiguous Symbol Specs -> Safe fallback with protection preserved
 * 25. Safe Lot Size Calculation: Safe Lot = 0 locks execution
 * 26. Down-Rounding Lot Sizing Invariant: Loss never exceeds risk capital
 * 27. Server-Side Bridge / Route Rejection: Dispatches rejected on missing SL or TP
 * 28. Post-Fill Protection Verification Contract: Live broker SL/TP verified vs failure
 */

import assert from 'assert';
import { EventEmitter } from 'events';
import {
  validateTradeProtection,
  calculateRR,
  TradeProtectionInput,
} from '../src/lib/execution/trade-protection-validator';
import {
  verifyPostFillProtection,
  ExpectedOrderContract,
} from '../src/lib/execution/post-fill-verifier';
import {
  calculatePositionSize,
} from '../src/lib/calculator/position-size-calculator';
import {
  validateTradeBlueprint,
} from '../src/lib/chart-analysis/blueprint-validator';

// Import bridge handlers
const {
  handleHttpRequest,
  bridgeState,
  setOperatingMode,
  executedRequestIds,
  VALID_TOKEN,
} = require('./mt5-http-bridge-service.js');

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

// In-memory HTTP dispatcher for testing bridge endpoint
function dispatchBridgeRequest(urlPath: string, method: string, bodyObj: any = null): Promise<any> {
  return new Promise((resolve) => {
    const req: any = new EventEmitter();
    req.method = method;
    req.url = urlPath;
    const postData = bodyObj ? JSON.stringify(bodyObj) : '';
    req.headers = {
      host: '127.0.0.1:5556',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(postData),
      'authorization': `Bearer ${VALID_TOKEN}`,
      'x-bridge-token': VALID_TOKEN,
    };

    let statusCode = 200;
    let resHeaders: any = {};
    let responseBody = '';

    const res: any = {
      writeHead(code: number, headers: any) {
        statusCode = code;
        resHeaders = headers || {};
      },
      setHeader(k: string, v: any) { resHeaders[k] = v; },
      end(chunk: any) {
        if (chunk) responseBody += chunk.toString('utf8');
        let parsed = null;
        try {
          parsed = JSON.parse(responseBody);
        } catch {
          parsed = responseBody;
        }
        resolve({ status: statusCode, headers: resHeaders, data: parsed });
      },
    };

    handleHttpRequest(req, res).catch((err: any) => {
      resolve({ status: 500, error: err });
    });

    setImmediate(() => {
      if (postData) {
        req.emit('data', Buffer.from(postData));
      }
      req.emit('end');
    });
  });
}

async function main() {
  console.log('================================================================');
  console.log('FEF TRADING SOLUTIONS — PHASE 2B.3 TEST SUITE');
  console.log('MANDATORY SL/TP PROTECTION & BROKER CONSTRAINTS');
  console.log('================================================================\n');

  // Baseline broker quote
  const freshBrokerQuote = {
    canonicalSymbol: 'XAUUSD',
    brokerSymbol: 'XAUUSD',
    bid: 2650.00,
    ask: 2650.20,
    spread: 2.0,
    digits: 2,
    point: 0.01,
    time: new Date().toISOString(),
    timestamp: Date.now(),
    freshness: 'FRESH' as const,
    isStale: false,
    ageMs: 50,
  };

  const defaultSpec = {
    point: 0.01,
    digits: 2,
    stopsLevel: 10,  // 10 points = 0.10 distance
    freezeLevel: 5,  // 5 points = 0.05 distance
  };

  // 1. BUY Valid
  runTest(1, 'BUY valid geometry (SL < Entry < TP1)', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2640.00,
      tp1: 2670.00,
      brokerQuote: freshBrokerQuote,
      symbolSpec: defaultSpec,
    });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.state, 'VALID');
    assert.strictEqual(res.statusLabel, 'PROTECTED ORDER');
    assert.strictEqual(res.normalized?.tp1RR, '1 : 1.94');
  });

  // 2. SELL Valid
  runTest(2, 'SELL valid geometry (SL > Entry > TP1)', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: 2660.00,
      tp1: 2630.00,
      brokerQuote: freshBrokerQuote,
      symbolSpec: defaultSpec,
    });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.state, 'VALID');
    assert.strictEqual(res.statusLabel, 'PROTECTED ORDER');
    assert.strictEqual(res.normalized?.tp1RR, '1 : 2.00');
  });

  // 3. BUY Missing SL
  runTest(3, 'BUY missing Stop Loss rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 0,
      tp1: 2670.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'MISSING_SL');
    assert.strictEqual(res.statusLabel, 'PROTECTION INVALID / EXECUTION LOCKED');
  });

  // 4. BUY Missing TP1
  runTest(4, 'BUY missing Take Profit 1 rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2640.00,
      tp1: 0,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'MISSING_TP1');
    assert.strictEqual(res.statusLabel, 'PROTECTION INVALID / EXECUTION LOCKED');
  });

  // 5. SELL Missing SL
  runTest(5, 'SELL missing Stop Loss rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: (null as any),
      tp1: 2630.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'MISSING_SL');
  });

  // 6. SELL Missing TP1
  runTest(6, 'SELL missing Take Profit 1 rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: 2660.00,
      tp1: (undefined as any),
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'MISSING_TP1');
  });

  // 7. BUY Inverted SL
  runTest(7, 'BUY inverted SL (SL > Entry) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2655.00,
      tp1: 2670.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 8. BUY Zero-distance SL
  runTest(8, 'BUY zero-distance SL (SL == Entry) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2650.20,
      tp1: 2670.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 9. BUY Inverted TP1
  runTest(9, 'BUY inverted TP1 (TP1 < Entry) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2640.00,
      tp1: 2645.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 10. BUY Zero-distance TP1
  runTest(10, 'BUY zero-distance TP1 (TP1 == Entry) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2640.00,
      tp1: 2650.20,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 11. SELL Inverted SL
  runTest(11, 'SELL inverted SL (SL < Entry) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: 2645.00,
      tp1: 2630.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 12. SELL Zero-distance SL
  runTest(12, 'SELL zero-distance SL (SL == Entry) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: 2650.00,
      tp1: 2630.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 13. SELL Inverted TP1
  runTest(13, 'SELL inverted TP1 (TP1 > Entry) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: 2660.00,
      tp1: 2655.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 14. SELL Zero-distance TP1
  runTest(14, 'SELL zero-distance TP1 (TP1 == Entry) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: 2660.00,
      tp1: 2650.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 15. BUY Multi-target TP2 Inverted
  runTest(15, 'BUY multi-target TP2 inverted (TP2 <= TP1) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2640.00,
      tp1: 2670.00,
      tp2: 2665.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 16. BUY Multi-target TP3 Inverted
  runTest(16, 'BUY multi-target TP3 inverted (TP3 <= TP2) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2640.00,
      tp1: 2670.00,
      tp2: 2680.00,
      tp3: 2675.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 17. SELL Multi-target TP2 Inverted
  runTest(17, 'SELL multi-target TP2 inverted (TP2 >= TP1) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: 2660.00,
      tp1: 2630.00,
      tp2: 2635.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 18. SELL Multi-target TP3 Inverted
  runTest(18, 'SELL multi-target TP3 inverted (TP3 >= TP2) rejected', () => {
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'SELL',
      entry: 2650.00,
      sl: 2660.00,
      tp1: 2630.00,
      tp2: 2620.00,
      tp3: 2625.00,
      brokerQuote: freshBrokerQuote,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'INVALID_GEOMETRY');
  });

  // 19. Non-numeric / NaN / Infinity inputs
  runTest(19, 'Non-numeric / NaN / Infinity inputs safely rejected', () => {
    const res1 = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: NaN,
      sl: 2640.00,
      tp1: 2670.00,
    });
    assert.strictEqual(res1.valid, false);
    assert.strictEqual(res1.state, 'INVALID_PRICE');

    const res2 = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.00,
      sl: Infinity,
      tp1: 2670.00,
    });
    assert.strictEqual(res2.valid, false);
    assert.strictEqual(res2.state, 'MISSING_SL');
  });

  // 20. Broker Stop Level Violation for SL
  runTest(20, 'Broker stop-level violation for SL rejected', () => {
    // defaultSpec: stopsLevel = 10 points * 0.01 = 0.10 min distance
    // SL distance = |2650.20 - 2650.15| = 0.05 < 0.10
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2650.15,
      tp1: 2670.00,
      brokerQuote: freshBrokerQuote,
      symbolSpec: defaultSpec,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'BROKER_STOP_LEVEL_VIOLATION');
  });

  // 21. Broker Stop Level Violation for TP
  runTest(21, 'Broker stop-level violation for TP rejected', () => {
    // TP1 distance = |2650.25 - 2650.20| = 0.05 < 0.10
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2640.00,
      tp1: 2650.25,
      brokerQuote: freshBrokerQuote,
      symbolSpec: defaultSpec,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'BROKER_STOP_LEVEL_VIOLATION');
  });

  // 22. Broker Freeze Level Violation
  runTest(22, 'Broker freeze-level violation rejected', () => {
    // freezeLevel = 25 points * 0.01 = 0.25 distance
    // SL distance = |2650.20 - 2650.05| = 0.15 (stopsLevel is 10 = 0.10 so stops pass, but freeze fails)
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2650.05,
      tp1: 2670.00,
      brokerQuote: freshBrokerQuote,
      symbolSpec: { ...defaultSpec, stopsLevel: 5, freezeLevel: 25 },
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'BROKER_FREEZE_LEVEL_VIOLATION');
  });

  // 23. Stale Broker Quote Rejection
  runTest(23, 'Stale broker quote (> 5000ms old) rejected', () => {
    const staleQuote = {
      ...freshBrokerQuote,
      timestamp: Date.now() - 15000,
      ageMs: 15000,
      isStale: true,
      freshness: 'STALE' as const,
    };
    const res = validateTradeProtection({
      symbol: 'XAUUSD',
      direction: 'BUY',
      entry: 2650.20,
      sl: 2640.00,
      tp1: 2670.00,
      brokerQuote: staleQuote,
      symbolSpec: defaultSpec,
    });
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.state, 'STALE_PRICE');
  });

  // 24. Missing / Ambiguous Symbol Specs
  runTest(24, 'Missing / ambiguous symbol specs fallback safely', () => {
    const res = validateTradeProtection({
      symbol: 'UNKNOWN_CRYPTO',
      direction: 'BUY',
      entry: 100.0,
      sl: 90.0,
      tp1: 120.0,
      symbolSpec: null,
    });
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.state, 'VALID');
  });

  // 25. Safe Lot Size Calculation: Safe Lot = 0 locks execution
  runTest(25, 'Safe lot size = 0 when risk capital is below minLot requirement', () => {
    // Capital $100, riskPct 0.01% -> riskAmount = $0.01
    // XAUUSD with $10 stop -> loss per 0.01 lot is $10 -> required lot < 0.01 minLot
    const sizing = calculatePositionSize({
      symbol: 'XAUUSD',
      direction: 'BUY',
      capital: 100,
      riskPct: 0.01,
      entryPrice: 2650.00,
      stopLoss: 2640.00,
      tp1: 2670.00,
    });
    assert.strictEqual(sizing.safeLotSize, 0, 'Safe lot size must be rounded down to 0');
    assert.strictEqual(sizing.isBelowMinLot, true, 'isBelowMinLot flag must be true');
  });

  // 26. Down-Rounding Lot Sizing Invariant: Loss never exceeds risk capital
  runTest(26, 'Position sizing down-rounding invariant: estimated loss <= risk capital', () => {
    const capital = 25000;
    const riskPct = 1.0; // $250 risk
    const sizing = calculatePositionSize({
      symbol: 'XAUUSD',
      direction: 'BUY',
      capital,
      riskPct,
      entryPrice: 2650.00,
      stopLoss: 2636.50, // 13.50 stop
      tp1: 2675.00,
    });
    assert(sizing.safeLotSize > 0, 'Safe lot size should be positive');
    // Ensure raw lot was rounded DOWN
    assert(sizing.safeLotSize <= sizing.rawLotSize, 'Safe lot must be <= raw lot');
    // Ensure estimated loss NEVER exceeds risk amount ($250)
    assert(sizing.estimatedLossAtSL <= sizing.riskAmount + 1e-6, `Estimated loss $${sizing.estimatedLossAtSL} must not exceed risk amount $${sizing.riskAmount}`);
  });

  // 27. Server-Side Bridge / Route Rejection
  await runTest(27, 'Server-side MT5 HTTP bridge rejects orders missing SL or TP1', async () => {
    // Arm bridge in DEMO_EXECUTION with fresh quote
    setOperatingMode('DEMO_EXECUTION');
    bridgeState.lastHeartbeat = Date.now();
    bridgeState.account.tradeMode = 'DEMO';
    bridgeState.account.freeMargin = 20000;
    bridgeState.quotes['XAUUSD'] = {
      canonicalSymbol: 'XAUUSD',
      brokerSymbol: 'XAUUSD',
      bid: 2650.10,
      ask: 2650.30,
      spread: 2.0,
      point: 0.01,
      digits: 2,
      stopsLevel: 10,
      timestamp: Date.now(),
    };

    // Missing SL
    const resNoSl = await dispatchBridgeRequest('/api/command', 'POST', {
      command: 'PLACE_ORDER',
      params: {
        requestId: `test-nosl-${Date.now()}`,
        symbol: 'XAUUSD',
        volume: 0.1,
        direction: 'BUY',
        price: 2650.30,
        sl: 0,
        tp: 2670.00,
        humanApproved: true,
      },
    });
    assert.strictEqual(resNoSl.data.success, false);
    assert(
      resNoSl.data.error.code === 'INVALID_SL' || resNoSl.data.error.code === 'MISSING_SL',
      `Expected INVALID_SL or MISSING_SL, got ${resNoSl.data.error.code}`
    );

    // Missing TP
    const resNoTp = await dispatchBridgeRequest('/api/command', 'POST', {
      command: 'PLACE_ORDER',
      params: {
        requestId: `test-notp-${Date.now()}`,
        symbol: 'XAUUSD',
        volume: 0.1,
        direction: 'BUY',
        price: 2650.30,
        sl: 2640.00,
        tp: 0,
        humanApproved: true,
      },
    });
    assert.strictEqual(resNoTp.data.success, false);
    assert(
      resNoTp.data.error.code === 'MISSING_TP1' || resNoTp.data.error.code === 'INVALID_TP',
      `Expected MISSING_TP1 or INVALID_TP, got ${resNoTp.data.error.code}`
    );

    // Inverted geometry
    const resInverted = await dispatchBridgeRequest('/api/command', 'POST', {
      command: 'PLACE_ORDER',
      params: {
        requestId: `test-inverted-${Date.now()}`,
        symbol: 'XAUUSD',
        volume: 0.1,
        direction: 'BUY',
        price: 2650.30,
        sl: 2660.00, // Inverted SL > Entry
        tp: 2670.00,
        humanApproved: true,
      },
    });
    assert.strictEqual(resInverted.data.success, false);
    assert.strictEqual(resInverted.data.error.code, 'INVALID_GEOMETRY');
  });

  // 28. Post-Fill Protection Verification Contract
  runTest(28, 'Post-fill protection verification contract verifies broker SL/TP', () => {
    const expectedContract: ExpectedOrderContract = {
      ticket: 991234,
      symbol: 'XAUUSD',
      direction: 'BUY',
      expectedVolume: 0.10,
      expectedSl: 2640.00,
      expectedTp1: 2670.00,
    };

    // 28a: Protected fill (both broker SL & TP confirmed)
    const resProtected = verifyPostFillProtection(expectedContract, [
      {
        ticket: 991234,
        symbol: 'XAUUSD',
        type: 'BUY',
        lots: 0.10,
        volume: 0.10,
        openPrice: 2650.30,
        currentPrice: 2650.50,
        sl: 2640.00,
        tp: 2670.00,
        pnl: 2.00,
        profit: 2.00,
        swap: 0,
        magic: 8882026,
        comment: '',
        openTime: new Date().toISOString(),
      },
    ]);
    assert.strictEqual(resProtected.verified, true);
    assert.strictEqual(resProtected.status, 'PROTECTED');
    assert.strictEqual(resProtected.hasBrokerSl, true);
    assert.strictEqual(resProtected.hasBrokerTp, true);

    // 28b: Unprotected fill (broker SL missing = 0)
    const resNoSl = verifyPostFillProtection(expectedContract, [
      {
        ticket: 991234,
        symbol: 'XAUUSD',
        type: 'BUY',
        lots: 0.10,
        volume: 0.10,
        openPrice: 2650.30,
        currentPrice: 2650.50,
        sl: 0,
        tp: 2670.00,
        pnl: 2.00,
        profit: 2.00,
        swap: 0,
        magic: 8882026,
        comment: '',
        openTime: new Date().toISOString(),
      },
    ]);
    assert.strictEqual(resNoSl.verified, false);
    assert.strictEqual(resNoSl.status, 'PROTECTION_FAILURE');
    assert.strictEqual(resNoSl.hasBrokerSl, false);

    // 28c: Missing TP fill (broker TP missing = 0)
    const resNoTp = verifyPostFillProtection(expectedContract, [
      {
        ticket: 991234,
        symbol: 'XAUUSD',
        type: 'BUY',
        lots: 0.10,
        volume: 0.10,
        openPrice: 2650.30,
        currentPrice: 2650.50,
        sl: 2640.00,
        tp: 0,
        pnl: 2.00,
        profit: 2.00,
        swap: 0,
        magic: 8882026,
        comment: '',
        openTime: new Date().toISOString(),
      },
    ]);
    assert.strictEqual(resNoTp.verified, false);
    assert.strictEqual(resNoTp.status, 'PROTECTION_FAILURE');
    assert.strictEqual(resNoTp.hasBrokerTp, false);

    // 28d: Position not found in live registry
    const resNotFound = verifyPostFillProtection(expectedContract, []);
    assert.strictEqual(resNotFound.verified, false);
    assert.strictEqual(resNotFound.status, 'POSITION_NOT_FOUND');
  });

  console.log('\n================================================================');
  console.log(`PHASE 2B.3 TEST RESULTS: ${passCount} PASSED | ${failCount} FAILED`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test suite runner crashed:', err);
  process.exit(1);
});
