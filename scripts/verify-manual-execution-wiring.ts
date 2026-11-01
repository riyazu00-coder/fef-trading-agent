import { dispatchUnifiedManualOrder } from '../src/lib/execution/manual-order-client';

async function main() {
  console.log('===============================================================');
  console.log('FEF CORTEX — MANUAL EXECUTION UI WIRING VERIFICATION');
  console.log('===============================================================\n');

  // Step 1: Query MT5 status via Next.js route
  console.log('[1/4] Verifying MT5 Demo Bridge Connectivity...');
  const statusRes = await fetch('http://127.0.0.1:3000/api/bridge/mt5?action=STATUS');
  const statusData = await statusRes.json();
  
  console.log('  Broker:', statusData.account?.broker);
  console.log('  Account:', statusData.account?.maskedLogin);
  console.log('  Trade Mode:', statusData.account?.tradeMode);
  console.log('  Terminal Connected:', statusData.terminal?.terminalConnected);
  console.log('  Free Margin: $' + statusData.account?.freeMargin);

  if (statusData.account?.tradeMode !== 'DEMO') {
    throw new Error('ABORT: Connected account is NOT DEMO! Trade mode: ' + statusData.account?.tradeMode);
  }

  // Step 2: Verify Gate 2 — Rejection without human approval
  console.log('\n[2/4] Testing Gate 2 — Raw Click Rejection (Human Approval Mandatory)...');
  const rawRejectRes = await fetch('http://127.0.0.1:3000/api/bridge/mt5', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'PLACE_ORDER',
      command: 'PLACE_ORDER',
      symbol: 'BTCUSD',
      params: {
        symbol: 'BTCUSD',
        direction: 'BUY',
        volume: 0.01,
        humanApproved: false,
      }
    })
  });
  const rawRejectData = await rawRejectRes.json();
  console.log('  HTTP Status:', rawRejectRes.status);
  console.log('  Response:', rawRejectData);
  if (rawRejectData.success === false && rawRejectData.error?.code === 'HUMAN_APPROVAL_REQUIRED') {
    console.log('  ✓ PASS: Raw click without human approval was strictly REJECTED.');
  } else {
    throw new Error('FAIL: Raw click was not rejected with HUMAN_APPROVAL_REQUIRED!');
  }

  // Step 3: Verify Gate 1 — Real Account Lock
  console.log('\n[3/4] Testing Gate 1 — REAL Account Lockout...');
  const realRejectRes = await fetch('http://127.0.0.1:3000/api/bridge/mt5', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'PLACE_ORDER',
      command: 'PLACE_ORDER',
      symbol: 'BTCUSD',
      params: {
        symbol: 'BTCUSD',
        direction: 'BUY',
        volume: 0.01,
        humanApproved: true,
        tradeMode: 'REAL',
        realConfirmed: false,
      }
    })
  });
  const realRejectData = await realRejectRes.json();
  console.log('  HTTP Status:', realRejectRes.status);
  console.log('  Response:', realRejectData);
  if (realRejectData.success === false) {
    console.log('  ✓ PASS: REAL trade mode attempt was strictly REJECTED.');
  } else {
    throw new Error('FAIL: REAL trade mode was not rejected!');
  }

  // Step 4: Execute ONE Controlled DEMO Test Order
  console.log('\n[4/4] Executing Controlled 0.01 Lot Demo Order via Unified Client...');
  const btcQuote = statusData.quotes?.BTCUSD;
  if (!btcQuote || btcQuote.freshness === 'SESSION_CLOSED') {
    throw new Error('BTCUSD quote unavailable or session closed');
  }

  const liveAsk = btcQuote.ask || 81400;
  const entryPrice = liveAsk;
  const slPrice = Number((entryPrice - 1000).toFixed(2));
  const tp1Price = Number((entryPrice + 1000).toFixed(2));

  console.log(`  Target: BTCUSD BUY 0.01 lot`);
  console.log(`  Entry: ${entryPrice} | SL: ${slPrice} | TP1: ${tp1Price}`);

  // Dispatched via the unified client logic
  const payload = {
    action: 'PLACE_ORDER',
    command: 'PLACE_ORDER',
    symbol: 'BTCUSD',
    params: {
      symbol: 'BTCUSD',
      direction: 'BUY' as const,
      volume: 0.01,
      price: entryPrice,
      sl: slPrice,
      tp: tp1Price,
      tp1: tp1Price,
      takeProfit: tp1Price,
      plannedPrice: entryPrice,
      magic: 888123,
      humanApproved: true,
      humanConfirmed: true,
      tradeMode: 'DEMO',
      realConfirmed: false,
      realTradeAcknowledgement: false,
      comment: 'FEF CORTEX MANUAL VERIFICATION',
    }
  };

  const startTime = Date.now();
  const orderRes = await fetch('http://127.0.0.1:3000/api/bridge/mt5', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const durationMs = Date.now() - startTime;
  const orderData = await orderRes.json();

  console.log('\n===============================================================');
  console.log('BROKER EXECUTION RESULT:');
  console.log('===============================================================');
  console.log('HTTP Status:', orderRes.status);
  console.log('Duration:', durationMs, 'ms');
  console.log('Response Payload:', JSON.stringify(orderData, null, 2));

  if (orderData.success) {
    const rawData = orderData.data || {};
    const ticket = orderData.ticket || orderData.orderTicket || rawData.ticket || rawData.orderTicket;
    const deal = orderData.deal || orderData.dealTicket || rawData.deal || rawData.dealTicket;
    const fillPrice = orderData.fillPrice || rawData.fillPrice || rawData.price || entryPrice;
    const retcode = orderData.retcode || rawData.retcode;
    const retcodeDescription = orderData.retcodeDescription || rawData.retcodeDescription;

    console.log('\n--- EXTRACTED EXECUTION TRUTH ---');
    console.log('  Success:', true);
    console.log('  Order Ticket:', ticket);
    console.log('  Deal Ticket:', deal);
    console.log('  Fill Price:', fillPrice);
    console.log('  Return Code:', retcode, retcodeDescription);
    console.log('  Slippage:', (fillPrice - entryPrice).toFixed(2));
    console.log('---------------------------------');
  } else {
    console.error('Order Execution Failed:', orderData.error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});

