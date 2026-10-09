/**
 * FEF CORTEX: BRIDGE V2 END-TO-END VERIFICATION TEST SUITE
 * 
 * Verifies the complete live integration path:
 * MT5 -> FEF_HTTP_Bridge_V2 EA -> Execution Bridge V2 (:5560) -> Next.js Application
 */

async function runEndToEndVerification() {
  console.log('================================================================');
  console.log('FEF CORTEX: BRIDGE V2 END-TO-END VERIFICATION SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Check Bridge V2 direct health
  try {
    const healthRes = await fetch('http://127.0.0.1:5560/v2/health');
    assert(healthRes.ok, 'Bridge V2 (:5560) HTTP listener is reachable and returns 200');
    const health = await healthRes.json();
    assert(health.terminalConnected === true, 'Bridge V2 reports terminalConnected === true');
    assert(typeof health.lastTerminalPollAt === 'number', 'Bridge V2 reports numeric lastTerminalPollAt');
    const pollAgeMs = Date.now() - health.lastTerminalPollAt;
    assert(pollAgeMs < 10000, `Bridge V2 poll cadence is fresh (age: ${pollAgeMs}ms < 10000ms)`);
    assert(health.realExecutionLocked === true, 'Bridge V2 real execution is strictly HARD-LOCKED');
    assert(health.specsAvailable > 0, `Bridge V2 has ingested broker specs (${health.specsAvailable} available)`);
    assert(health.quotesAvailable > 0, `Bridge V2 has ingested broker quotes (${health.quotesAvailable} available)`);
  } catch (err: any) {
    assert(false, 'Bridge V2 health check threw exception', err.message);
  }

  // 2. Check Bridge V2 direct account telemetry
  try {
    const acctRes = await fetch('http://127.0.0.1:5560/v2/account');
    assert(acctRes.ok, 'Bridge V2 /v2/account returns 200');
    const acctData = await acctRes.json();
    assert(acctData.success === true, 'Bridge V2 account response has success: true');
    assert(Boolean(acctData.account), 'Bridge V2 account object is populated');
    assert(acctData.account.tradeMode === 'DEMO', `Bridge V2 reports tradeMode === 'DEMO' (got ${acctData.account?.tradeMode})`);
    assert(acctData.account.balance > 0, `Bridge V2 balance is positive ($${acctData.account?.balance})`);
    assert(acctData.account.equity > 0, `Bridge V2 equity is positive ($${acctData.account?.equity})`);
    assert(acctData.account.broker.includes('Exness'), `Bridge V2 broker is Exness (${acctData.account?.broker})`);
  } catch (err: any) {
    assert(false, 'Bridge V2 account check threw exception', err.message);
  }

  // 3. Check Bridge V2 direct quotes telemetry
  try {
    const quotesRes = await fetch('http://127.0.0.1:5560/v2/quotes');
    assert(quotesRes.ok, 'Bridge V2 /v2/quotes returns 200');
    const quotesData = await quotesRes.json();
    assert(Array.isArray(quotesData.quotes), 'Bridge V2 quotes is an array');
    assert(quotesData.quotes.length >= 20, `Bridge V2 quotes has >= 20 symbols (got ${quotesData.quotes.length})`);
    const goldQuote = quotesData.quotes.find((q: any) => q.symbol === 'XAUUSD');
    assert(Boolean(goldQuote && goldQuote.bid > 0 && goldQuote.ask > 0), `XAUUSD broker quote present (Bid: ${goldQuote?.bid}, Ask: ${goldQuote?.ask})`);
  } catch (err: any) {
    assert(false, 'Bridge V2 quotes check threw exception', err.message);
  }

  // 4. Check Next.js /api/bridge/mt5 telemetry route
  try {
    const nextRes = await fetch('http://localhost:3000/api/bridge/mt5?action=TELEMETRY');
    assert(nextRes.ok, 'Next.js /api/bridge/mt5?action=TELEMETRY returns 200');
    const nextData = await nextRes.json();
    assert(nextData.localBridgeOnline === true, 'Next.js reports localBridgeOnline === true');
    assert(nextData.mt5Connected === true, 'Next.js reports mt5Connected === true');
    assert(nextData.transport === 'EXECUTION BRIDGE V2 (HTTP / WEBREQUEST)', `Next.js reports V2 transport (got ${nextData.transport})`);
    assert(nextData.state === 'CONNECTED_DEMO_EXECUTION', `Next.js reports state CONNECTED_DEMO_EXECUTION (got ${nextData.state})`);
    assert(Boolean(nextData.account && nextData.account.balance > 0), `Next.js account context has balance $${nextData.account?.balance}`);
    assert(Boolean(nextData.allQuotes && Object.keys(nextData.allQuotes).length >= 20), `Next.js allQuotes dictionary populated (${Object.keys(nextData.allQuotes || {}).length} symbols)`);
  } catch (err: any) {
    assert(false, 'Next.js telemetry route threw exception', err.message);
  }

  // 5. Check Next.js dedicated /api/bridge/v2 route
  try {
    const v2ApiRes = await fetch('http://localhost:3000/api/bridge/v2?resource=telemetry');
    assert(v2ApiRes.ok, 'Next.js /api/bridge/v2?resource=telemetry returns 200');
    const v2ApiData = await v2ApiRes.json();
    assert(v2ApiData.success === true, 'Dedicated V2 route returns success: true');
    assert(v2ApiData.mt5Connected === true, 'Dedicated V2 route confirms MT5 is connected');
  } catch (err: any) {
    assert(false, 'Next.js dedicated V2 route threw exception', err.message);
  }

  // 6. Check Next.js live broker quote endpoint
  try {
    const quoteRes = await fetch('http://localhost:3000/api/bridge/mt5?action=GET_QUOTE&symbol=XAUUSD');
    assert(quoteRes.ok, 'Next.js GET_QUOTE for XAUUSD returns 200');
    const quoteData = await quoteRes.json();
    assert(quoteData.success === true, 'GET_QUOTE returns success: true');
    assert(quoteData.data.canonicalSymbol === 'XAUUSD', 'GET_QUOTE canonicalSymbol is XAUUSD');
    assert(quoteData.data.bid > 0 && quoteData.data.ask > 0, `GET_QUOTE valid bid/ask: ${quoteData.data.bid} / ${quoteData.data.ask}`);
    assert(quoteData.data.isStale === false, 'GET_QUOTE is marked fresh (isStale === false)');
  } catch (err: any) {
    assert(false, 'Next.js quote route threw exception', err.message);
  }

  // 7. Check Next.js live account endpoint
  try {
    const acctRouteRes = await fetch('http://localhost:3000/api/bridge/mt5?action=GET_ACCOUNT');
    assert(acctRouteRes.ok, 'Next.js GET_ACCOUNT returns 200');
    const acctRouteData = await acctRouteRes.json();
    assert(acctRouteData.success === true, 'GET_ACCOUNT returns success: true');
    assert(acctRouteData.data.tradeMode === 'DEMO', `GET_ACCOUNT reports DEMO mode (${acctRouteData.data.tradeMode})`);
    assert(acctRouteData.data.marginStressLevel === 'SAFE', `GET_ACCOUNT reports SAFE margin stress level (${acctRouteData.data.marginStressLevel})`);
  } catch (err: any) {
    assert(false, 'Next.js account route threw exception', err.message);
  }

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runEndToEndVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

