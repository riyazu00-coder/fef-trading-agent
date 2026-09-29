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

// -----------------------------------------------------------------
// Test Case A: Fresh local MT5 (BUY -> ASK, SELL -> BID, executablePrice present, executable true)
// -----------------------------------------------------------------
console.log('\nTEST CASE A: Fresh Local MT5 (BUY -> ASK, SELL -> BID, executablePrice present, executable true)');
const caseABuy = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  terminalConnected: true,
  bridgeConnected: true,
  heartbeatAgeMs: 1200,
  isStale: false,
  operatingMode: 'DEMO_EXECUTION',
  brokerName: 'Exness',
  brokerServer: 'Exness-MT5'
});
assert(caseABuy.executable === true, 'Case A: BUY is executable');
assert(caseABuy.price === mockFreshBrokerQuote.ask, 'Case A: BUY price is broker ASK');
assert(caseABuy.executablePrice === mockFreshBrokerQuote.ask, 'Case A: executablePrice is broker ASK');

const caseASell = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'SELL',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  terminalConnected: true,
  bridgeConnected: true,
  heartbeatAgeMs: 1200,
  isStale: false,
  operatingMode: 'DEMO_EXECUTION',
  brokerName: 'Exness',
  brokerServer: 'Exness-MT5'
});
assert(caseASell.executable === true, 'Case A: SELL is executable');
assert(caseASell.price === mockFreshBrokerQuote.bid, 'Case A: SELL price is broker BID');
assert(caseASell.executablePrice === mockFreshBrokerQuote.bid, 'Case A: executablePrice is broker BID');
passedTests++;

// -----------------------------------------------------------------
// Test Case B: MT5 Disconnected (Execution locked, executablePrice null, reference fallback labeled non-executable)
// -----------------------------------------------------------------
console.log('\nTEST CASE B: MT5 Disconnected (Execution locked, executablePrice null, reference fallback labeled non-executable)');
const caseB = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: null,
  isMt5Connected: false,
  terminalConnected: false,
  bridgeConnected: false,
  operatingMode: 'DEMO_EXECUTION'
});
assert(caseB.executable === false, 'Case B: Executable is false');
assert(caseB.executablePrice === null, 'Case B: executablePrice is strictly null');
assert(caseB.priceClass === 'REFERENCE', 'Case B: Price class is non-executable REFERENCE');
assert(caseB.reason?.includes('MT5 broker terminal is not connected') === true, 'Case B: Reason documented');
passedTests++;

// -----------------------------------------------------------------
// Test Case C: MT5 Terminal Heartbeat Stale (>10s) (Execution locked, executablePrice null)
// -----------------------------------------------------------------
console.log('\nTEST CASE C: MT5 Terminal Heartbeat Stale (>10s) (Execution locked, executablePrice null)');
const caseC = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  terminalConnected: true,
  bridgeConnected: true,
  heartbeatAgeMs: 12500, // 12.5s > 10s
  isStale: false,
  operatingMode: 'DEMO_EXECUTION'
});
assert(caseC.executable === false, 'Case C: Execution locked due to stale terminal heartbeat');
assert(caseC.executablePrice === null, 'Case C: executablePrice is strictly null');
assert(caseC.reason?.includes('heartbeat is stale') === true, 'Case C: Reason cites stale heartbeat');
passedTests++;

// -----------------------------------------------------------------
// Test Case D: Bridge Connected but Terminal Disconnected (Execution locked, executablePrice null)
// -----------------------------------------------------------------
console.log('\nTEST CASE D: Bridge Connected but Terminal Disconnected (Execution locked, executablePrice null)');
const caseD = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  terminalConnected: false, // Terminal disconnected
  bridgeConnected: true,
  heartbeatAgeMs: null,
  isStale: false,
  operatingMode: 'DEMO_EXECUTION'
});
assert(caseD.executable === false, 'Case D: Execution locked when terminal disconnected');
assert(caseD.executablePrice === null, 'Case D: executablePrice is strictly null');
assert(caseD.reason?.includes('terminal is disconnected') === true, 'Case D: Reason cites terminal disconnection');
passedTests++;

// -----------------------------------------------------------------
// Test Case E: Reference Feed Only (Execution locked, analysis/display permitted with REFERENCE priceClass)
// -----------------------------------------------------------------
console.log('\nTEST CASE E: Reference Feed Only (Execution locked, analysis/display permitted with REFERENCE priceClass)');
const caseEExec = resolvePriceForPurpose('EURUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: { symbol: 'EURUSD', price: 1.0850, change24h: 0.1, provider: 'TwelveData' } as any,
  brokerQuote: null,
  isMt5Connected: false,
  operatingMode: 'DEMO_EXECUTION'
});
assert(caseEExec.executable === false, 'Case E: Execution is locked');
assert(caseEExec.executablePrice === null, 'Case E: executablePrice is strictly null');
assert(caseEExec.priceClass === 'REFERENCE', 'Case E: Price class is REFERENCE');

const caseEAnalysis = resolvePriceForPurpose('EURUSD', 'AGENT_ANALYSIS', {
  referenceAsset: { symbol: 'EURUSD', price: 1.0850, change24h: 0.1, provider: 'TwelveData' } as any,
  brokerQuote: null,
  isMt5Connected: false
});
assert(caseEAnalysis.price === 1.0850, 'Case E: Analysis price is reference price');
assert(caseEAnalysis.priceClass === 'REFERENCE', 'Case E: Analysis priceClass is REFERENCE');
assert(caseEAnalysis.executable === false, 'Case E: Analysis price is strictly non-executable');
passedTests++;

// -----------------------------------------------------------------
// Test Case F: Stale Quote (Execution locked, executablePrice null)
// -----------------------------------------------------------------
console.log('\nTEST CASE F: Stale Quote (Execution locked, executablePrice null)');
const caseF = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockStaleBrokerQuote, // quote > 5s old
  isMt5Connected: true,
  terminalConnected: true,
  bridgeConnected: true,
  heartbeatAgeMs: 1000,
  isStale: false,
  operatingMode: 'DEMO_EXECUTION'
});
assert(caseF.executable === false, 'Case F: Execution locked due to stale quote');
assert(caseF.executablePrice === null, 'Case F: executablePrice is null');
assert(caseF.freshness === 'STALE', 'Case F: Freshness is STALE');
passedTests++;

// -----------------------------------------------------------------
// Test Case G: Remote MT5 Telemetry Present (Read-only permitted, execution locked, WS freshness != authority)
// -----------------------------------------------------------------
console.log('\nTEST CASE G: Remote MT5 Telemetry Present (Read-only permitted, execution locked, WS freshness != authority)');
const caseGExec = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: { ...mockFreshBrokerQuote, brokerSymbol: 'XAUUSD.r' },
  isMt5Connected: true,
  terminalConnected: true,
  bridgeConnected: true,
  heartbeatAgeMs: 500,
  isRemoteMt5: true,
  operatingMode: 'READ_ONLY'
});
assert(caseGExec.executable === false, 'Case G: Remote MT5 in READ_ONLY mode is locked');
assert(caseGExec.executablePrice === null, 'Case G: executablePrice is strictly null');
assert(caseGExec.reason?.includes('TELEMETRY ONLY') === true || caseGExec.reason?.includes('Remote execution is disabled') === true, 'Case G: Locked with remote telemetry-only reason');

const caseGDisplay = resolvePriceForPurpose('XAUUSD', 'DISPLAY_REFERENCE', {
  referenceAsset: mockReferenceAsset,
  brokerQuote: { ...mockFreshBrokerQuote, brokerSymbol: 'XAUUSD.r' },
  isMt5Connected: true,
  terminalConnected: true,
  bridgeConnected: true,
  heartbeatAgeMs: 500,
  isRemoteMt5: true
});
assert(caseGDisplay.executable === false, 'Case G: Remote display is non-executable');
assert(caseGDisplay.providerType === 'MT5_REMOTE_BROKER', 'Case G: Provider is MT5_REMOTE_BROKER');
assert(caseGDisplay.price === 4335.605, 'Case G: Remote broker MID is displayed');
passedTests++;

// -----------------------------------------------------------------
// Test Case H: No SYNTHETIC_FALLBACK Emitted for Missing Prices (Uses UNAVAILABLE)
// -----------------------------------------------------------------
console.log('\nTEST CASE H: No SYNTHETIC_FALLBACK Emitted for Missing Prices (Uses UNAVAILABLE)');
const caseHMissingExec = resolvePriceForPurpose('UNKNOWN', 'EXECUTION', {
  brokerQuote: null,
  referenceAsset: null,
  isMt5Connected: false
});
assert(caseHMissingExec.providerType === 'UNAVAILABLE', `Case H: Missing price providerType is UNAVAILABLE (got ${caseHMissingExec.providerType})`);
assert(caseHMissingExec.status === 'UNAVAILABLE', `Case H: Missing price status is UNAVAILABLE (got ${caseHMissingExec.status})`);
assert(caseHMissingExec.priceClass === 'UNAVAILABLE', `Case H: Missing price priceClass is UNAVAILABLE (got ${caseHMissingExec.priceClass})`);
assert(caseHMissingExec.providerType !== 'SYNTHETIC_FALLBACK', 'Case H: Missing price is NEVER labeled SYNTHETIC_FALLBACK');

const caseHMissingDisplay = resolvePriceForPurpose('UNKNOWN', 'DISPLAY_REFERENCE', {
  brokerQuote: null,
  referenceAsset: null,
  isMt5Connected: false
});
assert(caseHMissingDisplay.providerType === 'UNAVAILABLE', 'Case H: Missing display providerType is UNAVAILABLE');
assert(caseHMissingDisplay.priceClass === 'UNAVAILABLE', 'Case H: Missing display priceClass is UNAVAILABLE');
passedTests++;

// -----------------------------------------------------------------
// Test Case I: Execution-Page Semantics (Separation between executableEntryPrice and referencePrice / sizingEstimationPrice)
// -----------------------------------------------------------------
console.log('\nTEST CASE I: Execution-Page Semantics (Separation between executableEntryPrice and referencePrice / sizingEstimationPrice)');
const caseIDisconnectedExec = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: null,
  isMt5Connected: false,
  operatingMode: 'DEMO_EXECUTION'
});
const caseIDisconnectedSizing = resolvePriceForPurpose('XAUUSD', 'POSITION_SIZING', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: null,
  isMt5Connected: false,
  operatingMode: 'DEMO_EXECUTION'
});

const pageRefPrice = mockReferenceAsset.price;
const pageExecutableEntryPrice = (caseIDisconnectedExec.executable && caseIDisconnectedExec.price > 0)
  ? caseIDisconnectedExec.price
  : null;
const pageSizingEstimationPrice = (caseIDisconnectedSizing.price && caseIDisconnectedSizing.price > 0)
  ? caseIDisconnectedSizing.price
  : pageRefPrice;

assert(pageExecutableEntryPrice === null, 'Case I: executableEntryPrice is strictly null when MT5 disconnected');
assert(pageRefPrice === 4334.60, 'Case I: referencePrice holds spot feed price');
assert(pageSizingEstimationPrice === 4334.60, 'Case I: sizingEstimationPrice is populated for estimation');
assert(pageExecutableEntryPrice !== pageRefPrice, 'Case I: reference price does NOT masquerade as executable entry price');

const caseIConnectedExec = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
  side: 'BUY',
  referenceAsset: mockReferenceAsset,
  brokerQuote: mockFreshBrokerQuote,
  isMt5Connected: true,
  terminalConnected: true,
  bridgeConnected: true,
  heartbeatAgeMs: 1000,
  operatingMode: 'DEMO_EXECUTION'
});
const connectedExecutableEntryPrice = (caseIConnectedExec.executable && caseIConnectedExec.price > 0)
  ? caseIConnectedExec.price
  : null;
assert(connectedExecutableEntryPrice === 4335.63, 'Case I: connected executableEntryPrice resolves to broker ASK');
passedTests++;

console.log('\n=================================================================');
console.log(`ALL ${passedTests} AUDIT & REGRESSION TESTS PASSED CLEANLY.`);
console.log('=================================================================');
