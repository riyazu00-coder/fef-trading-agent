/**
 * FEF CORTEX — TEST SUITE: SETUP INTELLIGENCE V3
 * STRUCTURED SETUP LIFECYCLE + ENTRY/RISK/TARGET INTELLIGENCE
 *
 * 70 Rigorous Automated Tests:
 * - Group 1: Lifecycle state transitions & state machine (T1-T10)
 * - Group 2: Taxonomy classification (T11-T18)
 * - Group 3: Geometric validation & mathematical invariants (T19-T28)
 * - Group 4: Minimum R:R gate & threshold enforcement (T29-T34)
 * - Group 5: Trigger separation & confirmation (T35-T42)
 * - Group 6: Invalidation semantics & structural tracking (T43-T48)
 * - Group 7: Multi-domain & Decision V2 integration (T49-T54)
 * - Group 8: Deterministic Setup ID stability (T55-T58)
 * - Group 9: GER40 & broker telemetry fail-closed semantics (T59-T64)
 * - Group 10: UI projection sanitization & radar integration (T65-T70)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

// Register TypeScript on-the-fly compiler
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};
require.extensions['.tsx'] = require.extensions['.ts'];

// Map '@/...' to '../src/...'
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return origResolve.call(this, request, parent, isMain, options);
};

// Imports under test
const {
  SetupIntelligenceEngineV3,
  buildDeterministicSetupId,
  MINIMUM_SETUP_RR
} = require('../src/lib/setup/setup-intelligence-v3');
const { projectSetupV3ForUi } = require('../src/lib/setup/setup-ui-projection');
const { generateAssetIntelligence } = require('../src/lib/agents/multi-asset-pipeline');
const { generateGlobalRadarIntelligence } = require('../src/lib/radar/opportunity-radar-engine');
const { INITIAL_LIVE_ASSETS } = require('../src/lib/providers/real-market-api');
const { DecisionEngineV2 } = require('../src/lib/decision/decision-engine-v2');
const { buildCanonicalEvidenceBundle } = require('../src/lib/evidence/canonical-evidence-bundle');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ Test ${totalTests} FAILED: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('=================================================================');
console.log('FEF CORTEX — SETUP INTELLIGENCE V3 TEST SUITE');
console.log('=================================================================\n');

// Helper function to build mock DecisionV2 result
function createMockDecisionV2(overrides = {}) {
  return {
    maturity: 'VALIDATED_SETUP',
    bias: 'BULLISH',
    confidence: 85,
    evidenceCompleteness: 90,
    independentDomainCount: 4,
    supportingDomains: ['PRICE_STRUCTURE', 'MOMENTUM', 'LIQUIDITY', 'SESSION'],
    opposingDomains: [],
    unavailableDomains: [],
    hardVetoes: [],
    softVetoes: [],
    conflicts: [],
    requirementsToAdvance: [],
    blockingConditions: [],
    invalidationConditions: [],
    explanation: 'Test decision explanation',
    marketAvailability: 'OPEN',
    sessionModel: 'NEW_YORK',
    killzoneWindow: 'ACTIVE',
    is24x7: false,
    statusLabel: 'VALIDATED SETUP (ACTIVE)',
    tradeExecutable: false,
    executionMode: 'READ_ONLY',
    snapshotId: 'snap-XAUUSD-test',
    asOf: Date.now(),
    generatedAt: Date.now(),
    ...overrides
  };
}

// Helper function to build mock Blueprint
function createMockBlueprint(direction = 'LONG', overrides = {}) {
  const isLong = direction === 'LONG';
  return {
    id: 'bp-xauusd-1',
    symbol: 'XAUUSD',
    direction,
    state: 'VALIDATED',
    entryZoneLow: { price: isLong ? 2640.0 : 2655.0, source: 'FVG' },
    entryZoneHigh: { price: isLong ? 2645.0 : 2660.0, source: 'FVG' },
    sl: { price: isLong ? 2630.0 : 2670.0, rationale: 'Swing Low' },
    tp1: { price: isLong ? 2670.0 : 2625.0, rationale: 'Liquidity Pool' },
    tp2: { price: isLong ? 2690.0 : 2605.0, rationale: 'Major High' },
    tp3: { price: isLong ? 2710.0 : 2585.0, rationale: 'Macro Target' },
    invalidation: {
      price: isLong ? 2632.0 : 2668.0,
      condition: isLong ? 'Price below 2632.0' : 'Price above 2668.0',
      reason: 'Breach of swing level'
    },
    rrRatio: 2.33,
    confidence: 85,
    timestamp: 1700000000000,
    ...overrides
  };
}

// Helper function to build mock MarketStructure
function createMockStructure(overrides = {}) {
  const highs = [{ price: 2665.0, time: 1700000000000, source: 'MT5_BROKER_OHLC' }];
  const lows = [{ price: 2630.0, time: 1699990000000, source: 'MT5_BROKER_OHLC' }];
  const fvgs = [{ low: 2640.0, high: 2645.0, timeframe: 'H1', type: 'BULLISH', source: 'MT5_BROKER_OHLC' }];
  return {
    symbol: 'XAUUSD',
    timeframe: 'H1',
    trend: 'BULLISH',
    swings: { highs, lows },
    swingHighs: highs,
    swingLows: lows,
    bos: [],
    choch: [],
    fvg: fvgs,
    fvgs: fvgs,
    orderBlocks: [{ low: 2635.0, high: 2642.0, timeframe: 'H1', type: 'BULLISH', source: 'MT5_BROKER_OHLC' }],
    liquiditySweeps: [],
    source: 'MT5_BROKER_OHLC',
    analyzedAt: 1700000000000,
    ...overrides
  };
}

// Helper function to build mock LiveAsset
function createMockLiveAsset(symbol = 'XAUUSD', price = 2648.5) {
  return {
    symbol,
    name: 'Gold',
    price,
    change24h: 0.5,
    feedStatus: 'ONLINE',
    category: 'METALS'
  };
}

function createMockCandles(count = 50, trend = 'BULLISH') {
  const candles = [];
  const now = Date.now();
  for (let i = count; i >= 0; i--) {
    const time = now - (i * 900_000);
    const open = 2640.0 + (trend === 'BULLISH' ? (count - i) * 0.2 : (i - count) * 0.2);
    const high = open + 1.5;
    const low = open - 1.5;
    const close = open + (trend === 'BULLISH' ? 0.4 : trend === 'BEARISH' ? -0.4 : 0);
    candles.push({ time, open, high, low, close, volume: 1000 + i * 10 });
  }
  return candles;
}

function createMockEvidenceBundle(symbol = 'XAUUSD', overrides = {}) {
  const now = Date.now();
  const qInput = overrides.market || overrides.quote || {};
  const quoteTimestamp = qInput.quoteTimestamp || qInput.time || (now - 500);
  const quoteAgeMs = qInput.quoteAgeMs !== undefined ? qInput.quoteAgeMs : Math.max(0, now - quoteTimestamp);
  const quoteFreshness = qInput.quoteFreshness || (quoteAgeMs > 60_000 ? 'STALE' : 'FRESH');

  const quote = {
    price: qInput.price || 2650.60,
    bid: qInput.bid || 2650.50,
    ask: qInput.ask || 2650.70,
    mid: qInput.mid || 2650.60,
    spread: qInput.spread || 20,
    digits: qInput.digits || 2,
    quoteTimestamp,
    quoteAgeMs,
    quoteFreshness,
    marketState: qInput.marketState || 'OPEN',
    sessionState: qInput.sessionState || { marketState: 'OPEN', sessionName: 'NEW_YORK', tradeExecutable: false },
    tradeExecutable: false,
    ...qInput
  };

  const emptyTimeframes = {};
  for (const tf of ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1']) {
    const candles = (overrides.timeframeCandles && overrides.timeframeCandles[tf]) || createMockCandles(50, 'BULLISH');
    emptyTimeframes[tf] = {
      timeframe: tf,
      state: 'AVAILABLE',
      barCount: candles.length,
      newestClosedBarTime: now - 1000,
      ageMs: 1000,
      candles,
      source: 'MT5_BROKER',
      storage: 'LOCAL_SQLITE',
      trend: 'BULLISH',
      role: tf === 'D1' ? 'HTF_CONTEXT' : tf === 'H4' ? 'STRUCTURAL_CONTEXT' : tf === 'H1' ? 'SETUP_CONTEXT' : tf === 'M15' ? 'ENTRY_REFINEMENT' : 'UNASSIGNED'
    };
  }

  return {
    snapshotId: `snap-${symbol}-${now}`,
    symbol,
    canonicalSymbol: symbol,
    brokerSymbol: symbol,
    asOf: now,
    generatedAt: now,
    market: quote,
    provenance: {
      source: 'MT5_BROKER',
      storage: 'LOCAL_SQLITE',
      classification: symbol === 'GER40' ? 'UNAVAILABLE' : 'LIVE_MT5',
      provider: 'MT5_LOCAL_CONNECTOR',
      isDerived: false,
      ...(overrides.provenance || {})
    },
    timeframes: emptyTimeframes,
    timeframeRoles: {
      higherTimeframe: { timeframe: 'D1', state: 'AVAILABLE', trend: 'BULLISH' },
      structuralContext: { timeframe: 'H4', state: 'AVAILABLE', trend: 'BULLISH' },
      setupContext: { timeframe: 'H1', state: 'AVAILABLE', trend: 'BULLISH' },
      entryRefinement: { timeframe: 'M15', state: 'AVAILABLE', trend: 'BULLISH' },
    },
    domains: {},
    conflicts: [],
    completeness: {
      technicalCompleteness: 100,
      marketDataCompleteness: 100,
      riskCompleteness: 85,
      macroCompleteness: 0,
      sentimentCompleteness: 0,
      overallCompleteness: 78,
      formula: 'overall = marketData(30%) + technical(35%) + risk(15%) + macro(10%) + sentiment(10%)',
      ...(overrides.completeness || {})
    },
    executionPolicies: {
      webProductPolicy: 'ARMED_WITH_CONFIRMATION',
      localBrokerTransportPolicy: 'READ_ONLY',
      mt5OrderTransportEnabled: false,
      intelligenceActionability: 'ACTIONABLE',
      finalDecisionExecutable: false,
    },
    ...overrides
  };
}


// -------------------------------------------------------------
// GROUP 1: Lifecycle State Transitions & State Machine (T1 - T10)
// -------------------------------------------------------------
console.log('Group 1: Lifecycle State Transitions (T1 - T10)...');

runTest('T1: NO_SETUP when no blueprint and no structure exists', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2650.0,
    marketStructure: null,
    blueprint: null,
    decisionV2: createMockDecisionV2({ maturity: 'MONITORING' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2650.0)
  });
  assert.strictEqual(result.lifecycle, 'NO_SETUP');
  assert.strictEqual(result.direction, 'NONE');
  assert.strictEqual(result.entryZone, null);
  assert.strictEqual(result.targets.length, 0);
  assert.strictEqual(result.riskReward, null);
});

runTest('T2: OBSERVING when market is open with structure but no directional thesis', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2650.0,
    marketStructure: createMockStructure({ trend: 'RANGING' }),
    blueprint: null,
    decisionV2: createMockDecisionV2({ maturity: 'MONITORING', bias: 'NEUTRAL' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2650.0)
  });
  assert.strictEqual(result.lifecycle, 'OBSERVING');
  assert.strictEqual(result.direction, 'NONE');
  assert.strictEqual(result.entryZone, null);
});

runTest('T3: WATCH when directional bias and structure exist but no blueprint', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2650.0,
    marketStructure: createMockStructure({ trend: 'BULLISH' }),
    blueprint: null,
    decisionV2: createMockDecisionV2({ maturity: 'WATCH', bias: 'BULLISH' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2650.0)
  });
  assert.strictEqual(result.lifecycle, 'WATCH');
  assert.strictEqual(result.direction, 'LONG');
  assert.strictEqual(result.entryZone, null);
});

runTest('T4: FORMING when valid blueprint exists but trigger is WAITING', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2650.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ maturity: 'SETUP_FORMING' }),
    triggerEvidence: { state: 'WAITING', reason: 'Awaiting M15 close' },
    liveAsset: createMockLiveAsset('XAUUSD', 2650.0)
  });
  assert.strictEqual(result.lifecycle, 'FORMING');
  assert.strictEqual(result.direction, 'LONG');
  assert(result.entryZone !== null);
  assert.strictEqual(result.trigger.state, 'WAITING');
});

runTest('T5: VALIDATED when all criteria met (blueprint, trigger CONFIRMED, R:R >= 2.0, Decision V2 VALIDATED_SETUP)', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ maturity: 'VALIDATED_SETUP', independentDomainCount: 4 }),
    triggerEvidence: { state: 'CONFIRMED', confirmationClose: 2643.0, triggerLevel: 2640.0 },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.lifecycle, 'VALIDATED');
  assert.strictEqual(result.direction, 'LONG');
  assert(result.riskReward.meetsMinimumThreshold);
  assert(result.riskReward.ratio >= 2.0);
  assert.strictEqual(result.trigger.state, 'CONFIRMED');
});

runTest('T6: FORMING cannot advance to VALIDATED if trigger is WAITING', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ maturity: 'VALIDATED_SETUP' }),
    triggerEvidence: { state: 'WAITING' },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.notStrictEqual(result.lifecycle, 'VALIDATED');
  assert.strictEqual(result.lifecycle, 'FORMING');
});

runTest('T7: INVALIDATED when price violates stop loss', () => {
  const bp = createMockBlueprint('LONG', { sl: { price: 2630.0 } });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2628.0, // breached SL
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2628.0)
  });
  assert.strictEqual(result.lifecycle, 'INVALIDATED');
  assert(result.invalidationReason.includes('violated'));
});

runTest('T8: INVALIDATED when price violates structural invalidation level', () => {
  const bp = createMockBlueprint('LONG', {
    sl: { price: 2620.0 },
    invalidation: { price: 2635.0, reason: 'Swing low break' }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2633.0, // breached invalidation level (2635.0)
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2633.0)
  });
  assert.strictEqual(result.lifecycle, 'INVALIDATED');
  assert(result.invalidationReason.includes('violated'));
});

runTest('T9: EXPIRED when blueprint state is EXPIRED', () => {
  const bp = createMockBlueprint('LONG', { state: 'EXPIRED' });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.lifecycle, 'EXPIRED');
});

runTest('T10: Decision V2 maturity UNAVAILABLE forces NO_SETUP', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: createMockBlueprint('LONG'),
    decisionV2: createMockDecisionV2({ maturity: 'UNAVAILABLE' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.lifecycle, 'NO_SETUP');
  assert.strictEqual(result.readiness, 'UNAVAILABLE');
});

// -------------------------------------------------------------
// GROUP 2: Taxonomy Classification (T11 - T18)
// -------------------------------------------------------------
console.log('Group 2: Taxonomy Classification (T11 - T18)...');

runTest('T11: BREAKOUT taxonomy classification from BOS or structure type', () => {
  const bp = createMockBlueprint('LONG', { type: 'BREAKOUT' });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.setupType, 'BREAKOUT');
});

runTest('T12: RETEST taxonomy classification from blueprint type', () => {
  const bp = createMockBlueprint('LONG', { type: 'RETEST' });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.setupType, 'RETEST');
});

runTest('T13: REVERSAL taxonomy classification from CHOCH or reversal type', () => {
  const bp = createMockBlueprint('SHORT', { type: 'REVERSAL' });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ bias: 'BEARISH' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.setupType, 'REVERSAL');
});

runTest('T14: CONTINUATION taxonomy classification from trend continuation', () => {
  const bp = createMockBlueprint('LONG', { type: 'CONTINUATION' });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.setupType, 'CONTINUATION');
});

runTest('T15: RANGE_REJECTION taxonomy classification', () => {
  const bp = createMockBlueprint('SHORT', { type: 'RANGE_REJECTION' });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ bias: 'BEARISH' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.setupType, 'RANGE_REJECTION');
});

runTest('T16: LIQUIDITY_SWEEP taxonomy classification from liquidity sweep event', () => {
  const bp = createMockBlueprint('LONG', { type: 'LIQUIDITY_SWEEP' });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.setupType, 'LIQUIDITY_SWEEP');
});

runTest('T17: MOMENTUM_EXPANSION taxonomy classification', () => {
  const bp = createMockBlueprint('LONG', { type: 'MOMENTUM_EXPANSION' });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.setupType, 'MOMENTUM_EXPANSION');
});

runTest('T18: UNCLASSIFIED fallback when no type can be derived', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2650.0,
    marketStructure: null,
    blueprint: null,
    decisionV2: createMockDecisionV2({ maturity: 'MONITORING' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2650.0)
  });
  assert.strictEqual(result.setupType, 'UNCLASSIFIED');
});

// -------------------------------------------------------------
// GROUP 3: Geometric Validation & Invariants (T19 - T28)
// -------------------------------------------------------------
console.log('Group 3: Geometric Validation & Invariants (T19 - T28)...');

runTest('T19: LONG geometric invariant: SL < Invalidation <= Low <= Mid <= High < TP1', () => {
  const bp = createMockBlueprint('LONG', {
    sl: { price: 2630.0 },
    invalidation: { price: 2635.0 },
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2645.0 },
    tp1: { price: 2670.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert(result.stopLoss.price < result.invalidation.price, 'SL must be < Invalidation');
  assert(result.invalidation.price <= result.entryZone.low, 'Invalidation must be <= Entry Low');
  assert(result.entryZone.low <= result.entryZone.midpoint, 'Entry Low must be <= Midpoint');
  assert(result.entryZone.midpoint <= result.entryZone.high, 'Midpoint must be <= Entry High');
  assert(result.entryZone.high < result.targets[0].price, 'Entry High must be < TP1');
});

runTest('T20: SHORT geometric invariant: SL > Invalidation >= High >= Mid >= Low > TP1', () => {
  const bp = createMockBlueprint('SHORT', {
    sl: { price: 2670.0 },
    invalidation: { price: 2665.0 },
    entryZoneHigh: { price: 2660.0 },
    entryZoneLow: { price: 2655.0 },
    tp1: { price: 2625.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2658.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ bias: 'BEARISH' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2658.0)
  });
  assert(result.stopLoss.price > result.invalidation.price, 'SL must be > Invalidation');
  assert(result.invalidation.price >= result.entryZone.high, 'Invalidation must be >= Entry High');
  assert(result.entryZone.high >= result.entryZone.midpoint, 'Entry High must be >= Midpoint');
  assert(result.entryZone.midpoint >= result.entryZone.low, 'Midpoint must be >= Entry Low');
  assert(result.entryZone.low > result.targets[0].price, 'Entry Low must be > TP1');
});

runTest('T21: Target monotonicity: TP1 < TP2 < TP3 for LONG', () => {
  const bp = createMockBlueprint('LONG', {
    tp1: { price: 2670.0 },
    tp2: { price: 2690.0 },
    tp3: { price: 2710.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.targets.length, 3);
  assert(result.targets[0].price < result.targets[1].price);
  assert(result.targets[1].price < result.targets[2].price);
});

runTest('T22: Target monotonicity: TP1 > TP2 > TP3 for SHORT', () => {
  const bp = createMockBlueprint('SHORT', {
    sl: { price: 2670.0 },
    invalidation: { price: 2665.0 },
    entryZoneHigh: { price: 2660.0 },
    entryZoneLow: { price: 2655.0 },
    tp1: { price: 2630.0 },
    tp2: { price: 2610.0 },
    tp3: { price: 2590.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2658.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ bias: 'BEARISH' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2658.0)
  });
  assert.strictEqual(result.targets.length, 3);
  assert(result.targets[0].price > result.targets[1].price);
  assert(result.targets[1].price > result.targets[2].price);
});

runTest('T23: Crossed levels (SL >= Entry for LONG) causes INVALIDATED', () => {
  const bp = createMockBlueprint('LONG', {
    sl: { price: 2645.0 }, // SL equal to high
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2645.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.lifecycle, 'INVALIDATED');
  assert(result.invalidationReason.includes('geometry violation') || result.invalidationReason.includes('Invalid'));
});

runTest('T24: Midpoint is exact average of low and high', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.entryZone.midpoint, 2645.0);
});

runTest('T25: Risk distance matches Math.abs(midpoint - sl)', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 },
    sl: { price: 2630.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  // midpoint = 2645.0, sl = 2630.0 => riskDistance = 15.0
  assert.strictEqual(result.risk.riskDistance, 15.0);
});

runTest('T26: Reward distance matches Math.abs(tp1 - midpoint)', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 },
    tp1: { price: 2675.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  // midpoint = 2645.0, tp1 = 2675.0 => rewardDistance = 30.0
  assert.strictEqual(result.reward.rewardDistance, 30.0);
});

runTest('T27: R:R ratio calculation matches rewardDistance / riskDistance', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 },
    sl: { price: 2630.0 },
    tp1: { price: 2675.0 }
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  // risk = 15.0, reward = 30.0 => ratio = 2.0
  assert.strictEqual(result.riskReward.ratio, 2.0);
  assert.strictEqual(result.riskReward.formatted, '1:2.00');
});

runTest('T28: Zero fake numbers: if no setup, entryZone, targets, riskReward are null/empty', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2650.0,
    marketStructure: null,
    blueprint: null,
    decisionV2: createMockDecisionV2({ maturity: 'MONITORING' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2650.0)
  });
  assert.strictEqual(result.entryZone, null);
  assert.strictEqual(result.stopLoss, null);
  assert.strictEqual(result.invalidation, null);
  assert.strictEqual(result.targets.length, 0);
  assert.strictEqual(result.riskReward, null);
  assert.strictEqual(result.risk, null);
  assert.strictEqual(result.reward, null);
});

// -------------------------------------------------------------
// GROUP 4: Minimum R:R Gate & Threshold Enforcement (T29 - T34)
// -------------------------------------------------------------
console.log('Group 4: Minimum R:R Gate (T29 - T34)...');

runTest('T29: MINIMUM_SETUP_RR constant is 2.0', () => {
  assert.strictEqual(MINIMUM_SETUP_RR, 2.0);
});

runTest('T30: R:R >= 2.0 sets meetsMinimumThreshold to true', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 },
    sl: { price: 2630.0 }, // risk = 15
    tp1: { price: 2675.0 } // reward = 30 => RR = 2.0
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.riskReward.meetsMinimumThreshold, true);
});

runTest('T31: R:R < 2.0 sets meetsMinimumThreshold to false', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 },
    sl: { price: 2630.0 }, // risk = 15
    tp1: { price: 2660.0 } // reward = 15 => RR = 1.0
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.riskReward.meetsMinimumThreshold, false);
});

runTest('T32: R:R < 2.0 prevents VALIDATED status even if trigger is CONFIRMED', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 },
    sl: { price: 2630.0 },
    tp1: { price: 2660.0 } // RR = 1.0
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ maturity: 'VALIDATED_SETUP' }),
    triggerEvidence: { state: 'CONFIRMED' },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.notStrictEqual(result.lifecycle, 'VALIDATED');
  assert.strictEqual(result.lifecycle, 'FORMING');
});

runTest('T33: R:R format string is properly formatted as 1:X.XX', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 },
    sl: { price: 2630.0 },
    tp1: { price: 2680.0 } // reward = 35, risk = 15 => RR = 2.333...
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.riskReward.formatted, '1:2.33');
});

runTest('T34: Each target has individual riskReward calculated against riskDistance', () => {
  const bp = createMockBlueprint('LONG', {
    entryZoneLow: { price: 2640.0 },
    entryZoneHigh: { price: 2650.0 }, // mid = 2645
    invalidation: { price: 2637.0 },
    sl: { price: 2635.0 }, // risk = 10
    tp1: { price: 2665.0 }, // reward = 20 => 2.0R
    tp2: { price: 2675.0 }, // reward = 30 => 3.0R
    tp3: { price: 2695.0 }  // reward = 50 => 5.0R
  });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.targets[0].riskReward, 2.0);
  assert.strictEqual(result.targets[1].riskReward, 3.0);
  assert.strictEqual(result.targets[2].riskReward, 5.0);
});

// -------------------------------------------------------------
// GROUP 5: Trigger Separation & Confirmation (T35 - T42)
// -------------------------------------------------------------
console.log('Group 5: Trigger Separation & Confirmation (T35 - T42)...');

runTest('T35: Trigger state defaults to WAITING when trigger evidence not yet confirmed', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ maturity: 'SETUP_FORMING' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.trigger.state, 'WAITING');
});

runTest('T36: Trigger state CONFIRMED populates triggerLevel and confirmationClose', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    triggerEvidence: {
      state: 'CONFIRMED',
      confirmationClose: 2644.5,
      triggerLevel: 2640.0,
      timeframe: 'M15'
    },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.trigger.state, 'CONFIRMED');
  assert.strictEqual(result.trigger.confirmationClose, 2644.5);
  assert.strictEqual(result.trigger.triggerLevel, 2640.0);
  assert.strictEqual(result.trigger.timeframe, 'M15');
});

runTest('T37: Trigger FAILED forces INVALIDATED state', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    triggerEvidence: { state: 'FAILED', reason: 'Opposing candle close' },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.lifecycle, 'INVALIDATED');
  assert.strictEqual(result.trigger.state, 'FAILED');
});

runTest('T38: Confirmation requirement for candle close trigger is MISSING when WAITING', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    triggerEvidence: { state: 'WAITING' },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  const triggerReq = result.confirmationRequirements.find(r => r.id === 'TRIGGER_CONFIRMATION');
  assert(triggerReq, 'TRIGGER_CONFIRMATION requirement must exist');
  assert.strictEqual(triggerReq.status, 'MISSING');
});

runTest('T39: Confirmation requirement for candle close trigger is SATISFIED when CONFIRMED', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    triggerEvidence: { state: 'CONFIRMED' },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  const triggerReq = result.confirmationRequirements.find(r => r.id === 'TRIGGER_CONFIRMATION');
  assert(triggerReq);
  assert.strictEqual(triggerReq.status, 'SATISFIED');
  assert(result.confirmationsSatisfied.includes('TRIGGER_CONFIRMATION'));
});

runTest('T40: Confirmations checklist includes R:R threshold requirement', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  const rrReq = result.confirmationRequirements.find(r => r.id === 'MINIMUM_RISK_REWARD' || r.id === 'MINIMUM_RR');
  assert(rrReq, 'MINIMUM_RISK_REWARD requirement must exist');
  assert.strictEqual(rrReq.status, 'SATISFIED');
});

runTest('T41: Confirmations checklist includes independent domain consensus requirement', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ independentDomainCount: 4 }),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  const domainReq = result.confirmationRequirements.find(r => r.id === 'INDEPENDENT_EVIDENCE' || r.id === 'INDEPENDENT_DOMAINS');
  assert(domainReq);
  assert.strictEqual(domainReq.status, 'SATISFIED');
});

runTest('T42: If independentDomainCount < 3, INDEPENDENT_DOMAINS requirement is MISSING', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ independentDomainCount: 2 }),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  const domainReq = result.confirmationRequirements.find(r => r.id === 'INDEPENDENT_EVIDENCE' || r.id === 'INDEPENDENT_DOMAINS');
  assert(domainReq);
  assert.strictEqual(domainReq.status, 'MISSING');
});

// -------------------------------------------------------------
// GROUP 6: Invalidation Semantics & Structural Tracking (T43 - T48)
// -------------------------------------------------------------
console.log('Group 6: Invalidation Semantics (T43 - T48)...');

runTest('T43: Invalidation records invalidatedAt timestamp', () => {
  const bp = createMockBlueprint('LONG', { sl: { price: 2630.0 } });
  const evalTime = new Date(1705000000000);
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2625.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2625.0),
    evaluationTime: evalTime
  });
  assert.strictEqual(result.lifecycle, 'INVALIDATED');
  assert.strictEqual(result.invalidatedAt, evalTime.getTime());
});

runTest('T44: Opposite trend displacement invalidates pending setup', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure({ trend: 'BEARISH' }), // opposing trend
    blueprint: bp,
    decisionV2: createMockDecisionV2({ bias: 'BEARISH' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.lifecycle, 'INVALIDATED');
  assert(result.invalidationReason.includes('Opposing structural bias') || result.invalidationReason.includes('invalidated'));
});

runTest('T45: Volatility context captures spread and ATR metrics', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert(result.volatilityContext !== undefined);
  assert(typeof result.volatilityContext.spreadPts === 'number');
  assert(typeof result.volatilityContext.isSpreadNormal === 'boolean');
});

runTest('T46: Session context reflects Decision V2 availability and model', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ sessionModel: 'LONDON', killzoneWindow: 'ACTIVE' }),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.sessionContext.sessionModel, 'LONDON');
  assert.strictEqual(result.sessionContext.killzoneWindow, 'ACTIVE');
  assert.strictEqual(result.sessionContext.is24x7, false);
});

runTest('T47: BTCUSD session context reflects is24x7 = true', () => {
  const bp = createMockBlueprint('LONG', { symbol: 'BTCUSD', entryZoneLow: { price: 65000 }, entryZoneHigh: { price: 65500 }, sl: { price: 64000 }, tp1: { price: 68500 } });
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'BTCUSD',
    currentPrice: 65200.0,
    marketStructure: createMockStructure({ symbol: 'BTCUSD' }),
    blueprint: bp,
    decisionV2: createMockDecisionV2({ symbol: 'BTCUSD', is24x7: true, killzoneWindow: 'NOT_APPLICABLE' }),
    liveAsset: createMockLiveAsset('BTCUSD', 65200.0)
  });
  assert.strictEqual(result.sessionContext.is24x7, true);
  assert.strictEqual(result.sessionContext.killzoneWindow, 'NOT_APPLICABLE');
});

runTest('T48: Structural context reports FVG and OrderBlock counts', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert(result.structuralContext.fvgCount >= 0);
  assert(result.structuralContext.obCount >= 0);
  assert(result.structuralContext.swingsIdentified === true);
});

// -------------------------------------------------------------
// GROUP 7: Multi-Domain & Decision V2 Integration (T49 - T54)
// -------------------------------------------------------------
console.log('Group 7: Multi-Domain & Decision V2 Integration (T49 - T54)...');

runTest('T49: Setup V3 does not participate in upstream agent count', () => {
  const profile = generateAssetIntelligence('XAUUSD', createMockLiveAsset('XAUUSD', 2642.0), 'H1');
  assert.strictEqual(profile.upstreamAgentCount, 31);
  assert.strictEqual(profile.registeredAgentCount, 32);
});

runTest('T50: Decision Engine V2 does not depend on Setup V3', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('XAUUSD');
  const evaluation = engine.evaluateDecision({
    evidenceBundle: bundle,
    agents: [],
    hasBlueprint: false
  });
  assert(evaluation !== null);
  assert(typeof evaluation.confidence === 'number');
});

runTest('T51: Hard veto in Decision V2 prevents VALIDATED status in Setup V3', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({
      hardVetoes: [{ source: 'RISK_VETO', reason: 'Excessive daily drawdown', effect: 'FORCE_WAIT' }],
      maturity: 'WATCH'
    }),
    triggerEvidence: { state: 'CONFIRMED' },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.notStrictEqual(result.lifecycle, 'VALIDATED');
  assert(result.opposingEvidence.some(e => e.includes('Excessive daily drawdown')));
});

runTest('T52: Soft veto in Decision V2 does not automatically invalidate setup', () => {
  const bp = createMockBlueprint('LONG');
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2({
      softVetoes: [{ source: 'NEWS_FILTER', reason: 'High-impact news in 4 hours', effect: 'WARN' }],
      maturity: 'VALIDATED_SETUP'
    }),
    triggerEvidence: { state: 'CONFIRMED' },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  assert.strictEqual(result.lifecycle, 'VALIDATED');
  assert(result.opposingEvidence.some(e => e.includes('High-impact news')));
});

runTest('T53: Setup Intelligence V3 attached to AssetIntelligenceProfile', () => {
  const profile = generateAssetIntelligence('XAUUSD', createMockLiveAsset('XAUUSD', 2642.0), 'H1');
  assert(profile.setupIntelligenceV3 !== undefined);
  assert(profile.setupIntelligenceV3Projection !== undefined);
  assert.strictEqual(profile.setupIntelligenceV3.symbol, 'XAUUSD');
});

runTest('T54: Final Decision agent synthesizes Setup V3 in evidence', () => {
  const profile = generateAssetIntelligence('XAUUSD', createMockLiveAsset('XAUUSD', 2642.0), 'H1');
  const finalAgent = profile.agents?.find(a => a.type === 'FINAL_DECISION');
  assert(finalAgent, 'FINAL_DECISION agent must exist');
  const hasSetupEvidence = finalAgent.evidence.some(e => e.includes('Setup Intelligence V3'));
  assert(hasSetupEvidence, 'FINAL_DECISION must report Setup Intelligence V3 in evidence');
});

// -------------------------------------------------------------
// GROUP 8: Deterministic Setup ID Stability (T55 - T58)
// -------------------------------------------------------------
console.log('Group 8: Deterministic Setup ID (T55 - T58)...');

runTest('T55: buildDeterministicSetupId format matches SETUP-symbol-direction-type-anchor', () => {
  const id = buildDeterministicSetupId('XAUUSD', 'LONG', 'BREAKOUT', 1700000000000);
  assert.strictEqual(id, 'SETUP-XAUUSD-LONG-BREAKOUT-1700000000000');
});

runTest('T56: buildDeterministicSetupId returns SETUP-symbol-NONE when direction is NONE', () => {
  const id = buildDeterministicSetupId('XAUUSD', 'NONE', 'UNCLASSIFIED', 0);
  assert.strictEqual(id, 'SETUP-XAUUSD-NONE');
});

runTest('T57: Setup ID remains stable across consecutive ticks for identical structure', () => {
  const bp = createMockBlueprint('LONG', { timestamp: 1700000000000 });
  const result1 = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure({ analyzedAt: 1700000000000 }),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0),
    evaluationTime: new Date(1705000000000)
  });
  const result2 = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2643.0,
    marketStructure: createMockStructure({ analyzedAt: 1700000000000 }),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    liveAsset: createMockLiveAsset('XAUUSD', 2643.0),
    evaluationTime: new Date(1705000002000) // 2 seconds later
  });
  assert.strictEqual(result1.setupId, result2.setupId);
});

runTest('T58: Setup ID changes when structural anchor timestamp changes', () => {
  const bp1 = createMockBlueprint('LONG', { timestamp: 1700000000000 });
  const bp2 = createMockBlueprint('LONG', { timestamp: 1700003600000 });
  const id1 = buildDeterministicSetupId('XAUUSD', 'LONG', 'BREAKOUT', bp1.timestamp);
  const id2 = buildDeterministicSetupId('XAUUSD', 'LONG', 'BREAKOUT', bp2.timestamp);
  assert.notStrictEqual(id1, id2);
});

// -------------------------------------------------------------
// GROUP 9: GER40 & Broker Telemetry Fail-Closed Semantics (T59 - T64)
// -------------------------------------------------------------
console.log('Group 9: GER40 Fail-Closed Semantics (T59 - T64)...');

runTest('T59: GER40 always returns NO_SETUP regardless of inputs', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'GER40',
    currentPrice: 19500.0,
    marketStructure: createMockStructure({ symbol: 'GER40' }),
    blueprint: createMockBlueprint('LONG', { symbol: 'GER40' }),
    decisionV2: createMockDecisionV2({ symbol: 'GER40', maturity: 'UNAVAILABLE' }),
    liveAsset: { symbol: 'GER40', name: 'DAX', price: 0, change24h: 0, feedStatus: 'UNAVAILABLE', category: 'INDICES' }
  });
  assert.strictEqual(result.lifecycle, 'NO_SETUP');
  assert.strictEqual(result.direction, 'NONE');
  assert.strictEqual(result.readiness, 'UNAVAILABLE');
});

runTest('T60: GER40 returns entryZone = null and targets = []', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'GER40',
    currentPrice: 0,
    marketStructure: null,
    blueprint: null,
    decisionV2: createMockDecisionV2({ symbol: 'GER40', maturity: 'UNAVAILABLE' }),
    liveAsset: { symbol: 'GER40', name: 'DAX', price: 0, change24h: 0, feedStatus: 'UNAVAILABLE', category: 'INDICES' }
  });
  assert.strictEqual(result.entryZone, null);
  assert.strictEqual(result.stopLoss, null);
  assert.strictEqual(result.targets.length, 0);
  assert.strictEqual(result.riskReward, null);
});

runTest('T61: GER40 thesis explains telemetry unavailable', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'GER40',
    currentPrice: 0,
    marketStructure: null,
    blueprint: null,
    decisionV2: createMockDecisionV2({ symbol: 'GER40', maturity: 'UNAVAILABLE' }),
    liveAsset: { symbol: 'GER40', name: 'DAX', price: 0, change24h: 0, feedStatus: 'UNAVAILABLE', category: 'INDICES' }
  });
  assert(result.thesis.includes('GER40') && result.thesis.includes('unavailable'));
});

runTest('T62: LiveAsset with feedStatus OFFLINE returns NO_SETUP fail-closed', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 0,
    marketStructure: null,
    blueprint: null,
    decisionV2: createMockDecisionV2({ maturity: 'UNAVAILABLE' }),
    liveAsset: { symbol: 'XAUUSD', name: 'Gold', price: 0, change24h: 0, feedStatus: 'OFFLINE', category: 'METALS' }
  });
  assert.strictEqual(result.lifecycle, 'NO_SETUP');
  assert.strictEqual(result.readiness, 'UNAVAILABLE');
});

runTest('T63: Zero price in liveAsset returns fail-closed state', () => {
  const result = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'EURUSD',
    currentPrice: 0,
    marketStructure: null,
    blueprint: null,
    decisionV2: createMockDecisionV2({ maturity: 'UNAVAILABLE' }),
    liveAsset: { symbol: 'EURUSD', name: 'Euro', price: 0, change24h: 0, feedStatus: 'DATA LIMITED', category: 'FOREX' }
  });
  assert.strictEqual(result.lifecycle, 'NO_SETUP');
});

runTest('T64: GER40 in multi-asset pipeline produces fail-closed setup V3', () => {
  const ger40Asset = { symbol: 'GER40', name: 'DAX 40', price: 0, change24h: 0, feedStatus: 'UNAVAILABLE', category: 'INDICES' };
  const profile = generateAssetIntelligence('GER40', ger40Asset, 'H1');
  assert.strictEqual(profile.setupIntelligenceV3.lifecycle, 'NO_SETUP');
  assert.strictEqual(profile.setupIntelligenceV3.readiness, 'UNAVAILABLE');
  assert.strictEqual(profile.setupIntelligenceV3.entryZone, null);
});

// -------------------------------------------------------------
// GROUP 10: UI Projection Sanitization & Radar Integration (T65 - T70)
// -------------------------------------------------------------
console.log('Group 10: UI Projection & Radar Integration (T65 - T70)...');

runTest('T65: projectSetupV3ForUi strictly enforces tradeExecutable = false', () => {
  const bp = createMockBlueprint('LONG');
  const setup = SetupIntelligenceEngineV3.evaluateSetup({
    symbol: 'XAUUSD',
    currentPrice: 2642.0,
    marketStructure: createMockStructure(),
    blueprint: bp,
    decisionV2: createMockDecisionV2(),
    triggerEvidence: { state: 'CONFIRMED' },
    liveAsset: createMockLiveAsset('XAUUSD', 2642.0)
  });
  const ui = projectSetupV3ForUi(setup, 'XAUUSD');
  assert.strictEqual(ui.tradeExecutable, false);
});

runTest('T66: projectSetupV3ForUi strictly enforces executionMode = READ_ONLY', () => {
  const ui = projectSetupV3ForUi(null, 'XAUUSD');
  assert.strictEqual(ui.executionMode, 'READ_ONLY');
});

runTest('T67: projectSetupV3ForUi sanitizes null or unavailable input with zero fake numbers', () => {
  const ui = projectSetupV3ForUi(null, 'GER40');
  assert.strictEqual(ui.lifecycle, 'NO_SETUP');
  assert.strictEqual(ui.entryZone, null);
  assert.strictEqual(ui.targets.length, 0);
  assert.strictEqual(ui.riskReward, null);
  assert.strictEqual(ui.readiness, 'UNAVAILABLE');
});

runTest('T68: Radar opportunity items attach setupV3 projection', () => {
  const radar = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'H1');
  assert(radar.rankedOpportunities.length > 0);
  for (const opp of radar.rankedOpportunities) {
    assert(opp.setupV3 !== undefined, `Opportunity ${opp.symbol} missing setupV3`);
    assert.strictEqual(opp.setupV3.tradeExecutable, false);
    assert.strictEqual(opp.setupV3.executionMode, 'READ_ONLY');
  }
});

runTest('T69: GER40 in radar has fail-closed setupV3', () => {
  const ger40Asset = {
    GER40: { symbol: 'GER40', name: 'DAX 40', price: 0, change24h: 0, feedStatus: 'UNAVAILABLE', category: 'INDICES' }
  };
  const radar = generateGlobalRadarIntelligence(ger40Asset, 'H1');
  const ger40Opp = radar.rankedOpportunities.find(o => o.symbol === 'GER40');
  assert(ger40Opp, 'GER40 must exist in radar opportunities');
  assert.strictEqual(ger40Opp.setupV3.lifecycle, 'NO_SETUP');
  assert.strictEqual(ger40Opp.setupV3.readiness, 'UNAVAILABLE');
  assert.strictEqual(ger40Opp.setupV3.entryZone, null);
});

runTest('T70: UI files contain zero SQLite or device secrets imports', () => {
  const cockpitFile = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/CurrentAiDecision.tsx'), 'utf8');
  const radarFile = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/GlobalOpportunityRadar.tsx'), 'utf8');
  const projectionFile = fs.readFileSync(path.join(__dirname, '../src/lib/setup/setup-ui-projection.ts'), 'utf8');

  for (const [name, content] of Object.entries({ cockpitFile, radarFile, projectionFile })) {
    assert(!content.includes('node:sqlite'), `${name} contains node:sqlite!`);
    assert(!content.includes('DatabaseSync'), `${name} contains DatabaseSync!`);
    assert(!content.includes('FEF_TELEMETRY_STORAGE_PATH'), `${name} contains storage path!`);
  }
});

console.log('\n=================================================================');
console.log(`ALL ${totalTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
console.log('=================================================================');
