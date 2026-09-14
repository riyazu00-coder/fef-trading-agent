/**
 * FEF AI TRADING — Price Authority & Cross-Feed Consistency Regression Suite
 * 
 * Verifies that:
 * 1. MT5 broker BID/ASK is the sole authoritative execution price when connected.
 * 2. BUY resolves strictly to broker ASK; SELL resolves strictly to broker BID.
 * 3. MT5 disconnection or stale quotes (>5s) fail closed and never fall back to reference feeds for execution.
 * 4. Reference feeds are strictly preserved for AGENT_ANALYSIS, CHART_CONTEXT, and DISPLAY_REFERENCE.
 * 5. Cross-feed divergence is accurately computed in basis points and percentage.
 * 6. Sizing and risk guardian calculations track price provenance.
 * 7. Production environment without remote bridge remains locked against execution.
 * 8. Zero synthetic spread offsets or fabricated quotes exist.
 */

import {
  resolvePriceForPurpose,
  evaluateCrossFeedDivergence,
  buildCanonicalFromBrokerQuote,
  buildCanonicalFromReferenceFeed,
  isProductionWithoutRemoteBridge,
  CanonicalPrice
} from '../src/lib/price/price-authority';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

console.log('=================================================================');
console.log('FEF AI TRADING — PRICE AUTHORITY & CROSS-FEED REGRESSION SUITE');
console.log('=================================================================\n');

let passedTests = 0;

// Mock Data
const mockReferenceAsset: any = {
  symbol: 'XAUUSD',
  price: 4334.60,
  change24h: 1.25,
  provider: 'Gold-API Spot Feed'
};

const mockFreshBrokerQuote: any = {
  symbol: 'XAUUSD',
  brokerSymbol: 'XAUUSD',
  bid: 4335.58,
  ask: 4335.63,
  spread: 50,
  digits: 3,
  timestamp: Date.now() - 1200, // 1.2s ago (fresh)
  isStale: false,
  freshness: 'FRESH'
};

const mockStaleBrokerQuote: any = {
  symbol: 'XAUUSD',
  brokerSymbol: 'XAUUSD',
  bid: 4335.58,
  ask: 4335.63,
  spread: 50,
  digits: 3,
  timestamp: Date.now() - 15000, // 15s ago (> 5s stale threshold)
  isStale: true,
  freshness: 'STALE'
};

// -----------------------------------------------------------------
// Test 1: Authoritative execution price uses MT5 broker price
// -----------------------------------------------------------------
console.log('TEST 1: Authoritative Execution Price Under Connected MT5');
const buyExec = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  operatingMode: 'DEMO_EXECUTION',
  brokerName: 'Exness Technologies Ltd',
  brokerServer: 'Exness-MT5Trial16'
});

assert(buyExec.executable === true, 'Execution is executable when MT5 is connected with fresh quote');
assert(buyExec.priceClass === 'EXECUTABLE_BROKER', 'Price class is EXECUTABLE_BROKER');
assert(buyExec.providerType === 'MT5_BROKER', 'Provider type is MT5_BROKER');
assert(buyExec.provenance.includes('Exness'), 'Provenance includes broker identity');
passedTests++;

// -----------------------------------------------------------------
// Test 2: Directional BID / ASK discipline (BUY = ASK, SELL = BID)
// -----------------------------------------------------------------
console.log('\nTEST 2: Directional BID/ASK Discipline (BUY = ASK, SELL = BID)');
assert(buyExec.price === 4335.63, `BUY resolves strictly to broker ASK (expected 4335.63, got ${buyExec.price})`);

const sellExec = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'SELL',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  operatingMode: 'DEMO_EXECUTION',
  brokerName: 'Exness Technologies Ltd',
  brokerServer: 'Exness-MT5Trial16'
});

assert(sellExec.price === 4335.58, `SELL resolves strictly to broker BID (expected 4335.58, got ${sellExec.price})`);
assert(sellExec.executable === true, 'SELL execution is executable');
passedTests++;

// -----------------------------------------------------------------
// Test 3: Disconnected MT5 fails closed and NEVER falls back to reference feed
// -----------------------------------------------------------------
console.log('\nTEST 3: Fail-Closed Protection When MT5 is Disconnected');
const disconnectedExec = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: null,
  isMt5Connected: false,
  operatingMode: 'READ_ONLY'
});

assert(disconnectedExec.executable === false, 'Execution is strictly locked (executable = false)');
assert(disconnectedExec.priceClass === 'REFERENCE', 'Price class is marked as non-executable REFERENCE');
assert(disconnectedExec.price === mockReferenceAsset.price, 'Price retains reference value for logging only');
assert(Boolean(disconnectedExec.reason?.includes('MT5 broker terminal is not connected')), 'Fail-closed reason correctly documented');
passedTests++;

// -----------------------------------------------------------------
// Test 4: Stale MT5 quote (>5s) locks execution (Fail-Closed)
// -----------------------------------------------------------------
console.log('\nTEST 4: Stale MT5 Quote Fail-Closed Enforcement');
const staleExec = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockStaleBrokerQuote,
  isMt5Connected: true,
  operatingMode: 'DEMO_EXECUTION'
});

assert(staleExec.executable === false, 'Execution locks when broker quote is stale');
assert(staleExec.freshness === 'STALE', 'Quote freshness is classified as STALE');
assert(Boolean(staleExec.reason?.includes('stale')), 'Fail-closed reason mentions stale quote');
passedTests++;

// -----------------------------------------------------------------
// Test 5: Reference feed remains valid and labeled for AGENT_ANALYSIS & CHART
// -----------------------------------------------------------------
console.log('\nTEST 5: Reference Feed Provenance for AI Agent Analysis & Charts');
const analysisPrice = resolvePriceForPurpose('XAUUSD', 'AGENT_ANALYSIS', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  operatingMode: 'DEMO_EXECUTION'
});

assert(analysisPrice.price === mockReferenceAsset.price, 'Analysis price correctly returns reference feed value');
assert(analysisPrice.priceClass === 'REFERENCE', 'Analysis price class is strictly labeled REFERENCE');
assert(analysisPrice.executable === false, 'Analysis price is non-executable');
assert(analysisPrice.provenance.includes('Gold-API Spot Feed'), 'Provenance explicitly tracks reference provider');
passedTests++;

// -----------------------------------------------------------------
// Test 6: Cross-feed divergence calculation (bps & percentage)
// -----------------------------------------------------------------
console.log('\nTEST 6: Cross-Feed Divergence & Basis Calculation');
const divergence = evaluateCrossFeedDivergence('XAUUSD', mockFreshBrokerQuote, mockReferenceAsset);
// Reference = 4334.60, Broker Mid = (4335.58 + 4335.63)/2 = 4335.605
// Absolute Diff = 1.005, Basis Bps = (1.005 / 4334.60) * 10000 = ~2.318 bps
assert(divergence.brokerPrice === 4335.605, `Broker MID is 4335.605 (got ${divergence.brokerPrice})`);
assert(divergence.referencePrice === 4334.60, `Reference price is 4334.60 (got ${divergence.referencePrice})`);
assert(divergence.divergenceAbs === 1.005, `Absolute diff is 1.005 (got ${divergence.divergenceAbs})`);
assert(divergence.basisBps >= 2.0 && divergence.basisBps <= 2.5, `Basis bps is within expected ~2.32 bps (got ${divergence.basisBps})`);
assert(divergence.status === 'NORMAL_BASIS', `Status is NORMAL_BASIS for < 15 bps diff (got ${divergence.status})`);
passedTests++;

// -----------------------------------------------------------------
// Test 7: Elevated divergence detection (> 15 bps)
// -----------------------------------------------------------------
console.log('\nTEST 7: Elevated Cross-Feed Divergence Detection');
const elevatedRefAsset = {
  ...mockReferenceAsset,
  price: 4325.00 // ~10.60 diff on 4335 = ~24 bps
};
const elevatedDivergence = evaluateCrossFeedDivergence('XAUUSD', mockFreshBrokerQuote, elevatedRefAsset);
assert(elevatedDivergence.status === 'ELEVATED_BASIS', `Status is ELEVATED_BASIS (got ${elevatedDivergence.status})`);
assert(elevatedDivergence.basisBps > 15, `Basis bps is > 15 (got ${elevatedDivergence.basisBps})`);
passedTests++;

// -----------------------------------------------------------------
// Test 8: Position Sizing Price Provenance
// -----------------------------------------------------------------
console.log('\nTEST 8: Position Sizing Provenance Tracking');
const sizingWithBroker = resolvePriceForPurpose('XAUUSD', 'POSITION_SIZING', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  operatingMode: 'DEMO_EXECUTION'
});
assert(sizingWithBroker.price === mockFreshBrokerQuote.ask, 'Sizing uses broker ASK for BUY when connected');
assert(sizingWithBroker.providerType === 'MT5_BROKER', 'Sizing logs MT5_BROKER provider');

const sizingWithoutBroker = resolvePriceForPurpose('XAUUSD', 'POSITION_SIZING', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: null,
  isMt5Connected: false,
  operatingMode: 'READ_ONLY'
});
assert(sizingWithoutBroker.price === mockReferenceAsset.price, 'Sizing falls back to reference price for estimation only');
assert(sizingWithoutBroker.priceClass === 'ESTIMATION_REFERENCE', 'Price class labeled ESTIMATION_REFERENCE');
passedTests++;

// -----------------------------------------------------------------
// Test 9: Pre-flight ticket metadata validation
// -----------------------------------------------------------------
console.log('\nTEST 9: Pre-Flight Ticket Metadata Integrity');
const ticketCanonical = buildCanonicalFromBrokerQuote(
  'XAUUSD',
  mockFreshBrokerQuote,
  'Exness Technologies Ltd',
  'Exness-MT5Trial16'
);
assert(ticketCanonical.executable === true, 'Ticket canonical is executable');
assert(ticketCanonical.providerType === 'MT5_BROKER', 'Ticket canonical has MT5_BROKER provider type');
assert(ticketCanonical.provenance === 'MT5:Exness Technologies Ltd (Exness-MT5Trial16)', 'Ticket canonical provenance is fully qualified');
assert(ticketCanonical.bid === 4335.58 && ticketCanonical.ask === 4335.63, 'Bid and ask are intact');
passedTests++;

// -----------------------------------------------------------------
// Test 10: Production environment fail-closed isolation
// -----------------------------------------------------------------
console.log('\nTEST 10: Production Isolation Without Remote Bridge');
assert(
  isProductionWithoutRemoteBridge('production', undefined) === true,
  'Production without remote bridge is identified as isolated'
);
assert(
  isProductionWithoutRemoteBridge('production', 'https://bridge.secure.com') === false,
  'Production with remote bridge is allowed'
);
assert(
  isProductionWithoutRemoteBridge('development', undefined) === false,
  'Development environment can connect to localhost bridge'
);
passedTests++;

// -----------------------------------------------------------------
// Test 11: Read-Only Operating Mode Fail-Closed
// -----------------------------------------------------------------
console.log('\nTEST 11: Read-Only Operating Mode Fail-Closed');
const readOnlyExec = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  operatingMode: 'READ_ONLY'
});
assert(readOnlyExec.executable === false, 'Operating mode READ_ONLY prevents execution');
assert(Boolean(readOnlyExec.reason?.includes('READ_ONLY')), 'Reason notes operating mode');
passedTests++;

// -----------------------------------------------------------------
// Test 12: Zero Synthetic Price Fabrication Verification
// -----------------------------------------------------------------
console.log('\nTEST 12: Zero Synthetic Price / Spread Fabrication Verification');
// When broker is disconnected, buildCanonicalFromBrokerQuote must never fabricate prices
const refCanonical = buildCanonicalFromReferenceFeed('XAUUSD', 4334.60, 'Gold-API Spot');
assert(refCanonical.bid === undefined, 'Reference feed canonical has no fabricated bid');
assert(refCanonical.ask === undefined, 'Reference feed canonical has no fabricated ask');
assert(refCanonical.spread === undefined, 'Reference feed canonical has no fabricated spread');
assert(refCanonical.executable === false, 'Reference feed is never executable');
passedTests++;

// -----------------------------------------------------------------
// Test 13: Neutral Display Resolution (MID only when explicitly requested)
// -----------------------------------------------------------------
console.log('\nTEST 13: Neutral Display Resolution');
const neutralDisplay = resolvePriceForPurpose('XAUUSD', 'DISPLAY_REFERENCE', {
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  operatingMode: 'DEMO_EXECUTION'
});
assert(neutralDisplay.price === 4335.605, 'Neutral display with connected broker uses broker MID');
assert(neutralDisplay.priceClass === 'REFERENCE', 'Neutral display is labeled REFERENCE');
assert(neutralDisplay.executable === false, 'Neutral display is not executable');
passedTests++;

console.log('\n=================================================================');
console.log(`ALL ${passedTests} AUDIT & REGRESSION TESTS PASSED CLEANLY.`);
console.log('=================================================================');
