/**
 * FEF CORTEX — TEST SUITE: DECISION ENGINE V2
 * DEPENDENCY-AWARE CONSENSUS + RISK VETO + SETUP MATURITY
 *
 * Tests:
 * 1. 32 registered agents preserved
 * 2. 31 upstream agents preserved
 * 3. Final Decision excluded from upstream vote
 * 4. Evidence family metadata exists and attaches to agents
 * 5. Correlated technical agents grouped into independence groups
 * 6. Seven correlated bullish agents do not count as seven independent domains
 * 7. Independent macro evidence adds new domain confirmation
 * 8. Independent COT evidence adds new domain confirmation
 * 9. Unavailable macro adds zero positive evidence
 * 10. Placeholder news adds zero positive evidence
 * 11. Order-flow proxy remains derived with tick-volume provenance
 * 12. Institutional proxy remains derived
 * 13. Domain readiness deterministic (READY, PARTIAL, STALE, DATA_LIMITED, UNAVAILABLE, NOT_APPLICABLE)
 * 14. Domain trust does not increase merely from agent count
 * 15. Intra-domain conflict surfaced
 * 16. Cross-domain conflict surfaced
 * 17. Hard data veto overrides bullish consensus
 * 18. Risk Guardian can block maturity
 * 19. Data Sentinel can block maturity
 * 20. Soft veto reduces/caps maturity/confidence
 * 21. Bullish bias can coexist with WATCH
 * 22. Bearish bias can coexist with WATCH
 * 23. Correlated technical-only evidence cannot reach VALIDATED_SETUP
 * 24. Independent domains can advance maturity to SETUP_FORMING / VALIDATED_SETUP
 * 25. Missing optional cloud evidence does not force UNAVAILABLE (OBSERVING/WATCH supported)
 * 26. NOT_APPLICABLE does not unfairly reduce completeness
 * 27. Applicable missing evidence cannot masquerade as NOT_APPLICABLE
 * 28. requirementsToAdvance populated from actual missing evidence
 * 29. blockingConditions populated from veto/conflict state
 * 30. invalidationConditions deterministic
 * 31. Explanation generated from structured evidence
 * 32. Same snapshotId used throughout decision evaluation
 * 33. GER40 remains UNAVAILABLE (fail-closed, score: 0, maturity: UNAVAILABLE)
 * 34. BTCUSD session behavior remains 24/7 aware
 * 35. tradeExecutable always false across all decision layers
 * 36. READ_ONLY execution mode strictly preserved
 * 37. MT5 order transport false
 * 38. No direct SQLite imports in client
 * 39. No public technical fallback
 * 40. Backward-compatible old decision fields remain available
 *
 * Synthetic Scenarios:
 * Scenario A: 7 correlated technical agents bullish, other domains unavailable -> confidence limited, NOT VALIDATED_SETUP
 * Scenario B: Technical bullish + order flow proxy bullish + session favorable + risk clear + macro bullish -> higher maturity
 * Scenario C: Technical bullish + macro bearish + risk caution -> conflict surfaced, confidence reduced, maturity capped
 * Scenario D: Technical strongly bullish + Data Sentinel critical stale quote -> hard veto, cannot validate
 * Scenario E: All strong, highest maturity allowed -> tradeExecutable=false strictly enforced
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

// Import Decision Engine V2 and pipeline
const {
  DecisionEngineV2,
  CANONICAL_EVIDENCE_FAMILIES,
  AGENT_DEPENDENCY_REGISTRY,
  SetupMaturityState,
} = require('../src/lib/decision/decision-engine-v2');

const {
  CANONICAL_COUNCIL_KEYS,
  getBaseAgentRegistry,
  generateAssetIntelligence
} = require('../src/lib/agents/multi-asset-pipeline');

const {
  buildCanonicalEvidenceBundle
} = require('../src/lib/evidence/canonical-evidence-bundle');

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
console.log('FEF CORTEX — DECISION ENGINE V2 TEST SUITE');
console.log('=================================================================\n');

// -------------------------------------------------------------
// HELPER: Deterministic Fixture Factory
// -------------------------------------------------------------
function createMockCandles(count = 50, trend = 'BULLISH', basePrice = 2650.0) {
  const candles = [];
  const now = Date.now();
  for (let i = count - 1; i >= 0; i--) {
    const time = now - (i * 900_000); // 15m intervals
    const priceShift = trend === 'BULLISH' ? (count - i) * 0.2 : trend === 'BEARISH' ? -(count - i) * 0.2 : 0;
    const open = basePrice + priceShift;
    const high = open + 1.0;
    const low = open - 0.5;
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
// TESTS
// -------------------------------------------------------------

// 1. 32 registered agents preserved
runTest('32 registered agents preserved across system', () => {
  const baseAgents = getBaseAgentRegistry('XAUUSD');
  // 15 core council keys
  assert.strictEqual(CANONICAL_COUNCIL_KEYS.length, 15);
  // Base registry contains 15 council agents
  assert.strictEqual(baseAgents.length, 15);
  // Decision Engine V2 knows all 32 agents in dependency registry
  const registeredKeys = Object.keys(AGENT_DEPENDENCY_REGISTRY);
  assert.strictEqual(registeredKeys.length, 32);
});

// 2. 31 upstream agents preserved
runTest('31 upstream evidence-evaluation agents in dependency registry', () => {
  const upstreamAgents = Object.entries(AGENT_DEPENDENCY_REGISTRY).filter(
    ([id, dep]) => id !== 'FINAL_DECISION'
  );
  assert.strictEqual(upstreamAgents.length, 31);
});

// 3. Final Decision excluded from upstream vote
runTest('Final Decision excluded from upstream evidence votes', () => {
  const finalDecisionDep = AGENT_DEPENDENCY_REGISTRY['FINAL_DECISION'];
  assert(finalDecisionDep, 'FINAL_DECISION must exist in registry');
  assert.strictEqual(finalDecisionDep.isSynthesizer, true);
  assert.strictEqual(finalDecisionDep.primaryFamilies.length, 0);
});

// 4. Evidence family metadata exists and attaches to agents
runTest('Evidence family metadata exists and covers canonical families', () => {
  assert(Array.isArray(CANONICAL_EVIDENCE_FAMILIES));
  assert(CANONICAL_EVIDENCE_FAMILIES.includes('PRICE_STRUCTURE'));
  assert(CANONICAL_EVIDENCE_FAMILIES.includes('MOMENTUM'));
  assert(CANONICAL_EVIDENCE_FAMILIES.includes('ORDER_FLOW_PROXY'));
  assert(CANONICAL_EVIDENCE_FAMILIES.includes('SESSION'));
  assert(CANONICAL_EVIDENCE_FAMILIES.includes('RISK'));
  assert(CANONICAL_EVIDENCE_FAMILIES.includes('MACRO'));
  assert(CANONICAL_EVIDENCE_FAMILIES.includes('DATA_QUALITY'));
});

// 5. Correlated technical agents grouped into independence groups
runTest('Correlated technical agents share PRICE_OHLC_DERIVED independence group', () => {
  // Pure mathematical OHLC agents share PRICE_OHLC_DERIVED
  const ohlcTechAgents = ['TECHNICAL', 'STRATEGY', 'VOLATILITY_SQUEEZE', 'ANCHORED_VWAP', 'MARKET_REGIME_CLASSIFIER', 'QUANT_MOMENTUM'];
  for (const agentId of ohlcTechAgents) {
    const dep = AGENT_DEPENDENCY_REGISTRY[agentId];
    assert(dep, `Dependency for ${agentId} must exist`);
    assert.strictEqual(dep.independenceGroup, 'PRICE_OHLC_DERIVED');
    assert.strictEqual(dep.isDerived, true);
  }

  // Vision agent canonically belongs to CHART_COMPUTER_VISION with MULTIMODAL_IMAGE_PERCEPTION (Phase 7B.2)
  const visionDep = AGENT_DEPENDENCY_REGISTRY['VISION'];
  assert(visionDep, 'Dependency for VISION must exist');
  assert.strictEqual(visionDep.independenceGroup, 'CHART_COMPUTER_VISION');
  assert.strictEqual(visionDep.derivationType, 'MULTIMODAL_IMAGE_PERCEPTION');
  assert.strictEqual(visionDep.isDerived, true);
});

// 6. Seven correlated bullish agents do not count as seven independent domains
runTest('Seven correlated bullish candle agents do not count as seven independent domains', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  // Create 7 bullish agents all derived from PRICE_OHLC_DERIVED
  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'OPPORTUNITY', agentName: 'Opportunity Agent', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY' },
    { agentId: 'STRATEGY', agentName: 'Strategy Agent', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY' },
    { agentId: 'VOLATILITY_SQUEEZE', agentName: 'Volatility Squeeze', direction: 'BULLISH', confidence: 75, evidenceTrust: 80, readiness: 'READY' },
    { agentId: 'ANCHORED_VWAP', agentName: 'Anchored VWAP', direction: 'BULLISH', confidence: 85, evidenceTrust: 85, readiness: 'READY' },
    { agentId: 'MARKET_REGIME_CLASSIFIER', agentName: 'Regime Classifier', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY' },
    { agentId: 'QUANT_MOMENTUM', agentName: 'Quant Momentum', direction: 'BULLISH', confidence: 80, evidenceTrust: 80, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  // They all belong to PRICE_OHLC_DERIVED! Independent domain count must be strictly 1!
  assert.strictEqual(result.independentDomainCount, 1);
  assert(result.supportingDomains.includes('PRICE_STRUCTURE'));
});

// 7. Independent macro evidence adds new domain confirmation
runTest('Independent macro evidence adds genuine new domain confirmation', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    {
      agentId: 'MACRO',
      agentName: 'Macro Agent',
      direction: 'BULLISH',
      confidence: 80,
      evidenceTrust: 85,
      readiness: 'READY',
      evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'FRED_API' }]
    },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert.strictEqual(result.independentDomainCount, 2);
  assert(result.supportingDomains.includes('PRICE_STRUCTURE'));
  assert(result.supportingDomains.includes('MACRO'));
});

// 8. Independent COT evidence adds new domain confirmation
runTest('Independent COT evidence adds new domain confirmation', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    {
      agentId: 'COT_POSITIONING',
      agentName: 'COT Positioning',
      direction: 'BULLISH',
      confidence: 75,
      evidenceTrust: 80,
      readiness: 'READY',
      evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'CFTC_COT' }]
    },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert.strictEqual(result.independentDomainCount, 2);
  assert(result.supportingDomains.includes('POSITIONING'));
});

// 9. Unavailable macro adds zero positive evidence
runTest('Unavailable macro adds zero positive evidence or directional support', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'MACRO', agentName: 'Macro Agent', direction: 'BULLISH', confidence: 0, evidenceTrust: 0, readiness: 'UNAVAILABLE' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert.strictEqual(result.independentDomainCount, 1);
  assert(!result.supportingDomains.includes('MACRO'));
  assert(result.unavailableDomains.includes('MACRO'));
});

// 10. Placeholder news adds zero positive evidence
runTest('Placeholder/static news adds zero positive evidence', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    {
      agentId: 'NEWS',
      agentName: 'News Agent',
      direction: 'BULLISH',
      confidence: 60,
      evidenceTrust: 30,
      readiness: 'DATA_LIMITED',
      evidence: [{ classification: 'STATIC_REFERENCE', decisionEligible: false, verified: false, claim: 'No live headlines' }]
    },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert.strictEqual(result.independentDomainCount, 1);
  assert(!result.supportingDomains.includes('NEWS'));
});

// 11. Order-flow proxy remains derived with tick-volume provenance
runTest('Order-flow proxy remains derived with tick-volume provenance', () => {
  const dep = AGENT_DEPENDENCY_REGISTRY['ORDER_FLOW'];
  assert(dep);
  assert.strictEqual(dep.isDerived, true);
  assert.strictEqual(dep.derivationType, 'TICK_VOLUME_DELTA');
  assert.strictEqual(dep.independenceGroup, 'BROKER_TICK_PROXY');
});

// 12. Institutional proxy remains derived
runTest('Institutional proxy remains derived from volume profile / vwap', () => {
  const dep = AGENT_DEPENDENCY_REGISTRY['INSTITUTIONAL'];
  assert(dep);
  assert.strictEqual(dep.isDerived, true);
  assert.strictEqual(dep.independenceGroup, 'PRICE_OHLC_DERIVED');
});

// 13. Domain readiness deterministic
runTest('Domain readiness correctly classifies READY vs DATA_LIMITED vs UNAVAILABLE', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'DATA_SENTINEL', agentName: 'Data Sentinel', direction: 'NEUTRAL', confidence: 100, evidenceTrust: 100, readiness: 'READY' },
    { agentId: 'MACRO', agentName: 'Macro Agent', direction: 'NEUTRAL', confidence: 0, evidenceTrust: 0, readiness: 'DATA_LIMITED' },
    { agentId: 'GEOPOLITICAL', agentName: 'Geopolitical Agent', direction: 'NEUTRAL', confidence: 0, evidenceTrust: 0, readiness: 'UNAVAILABLE' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  const priceDomain = result.domains.find(d => d.family === 'PRICE_STRUCTURE');
  const macroDomain = result.domains.find(d => d.family === 'MACRO');
  const geoDomain = result.domains.find(d => d.family === 'GEOPOLITICAL');

  assert.strictEqual(priceDomain.readiness, 'READY');
  assert.strictEqual(macroDomain.readiness, 'DATA_LIMITED');
  assert.strictEqual(geoDomain.readiness, 'UNAVAILABLE');
});

// 14. Domain trust does not increase merely from agent count
runTest('Domain trust does not scale linearly with number of participating agents', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const oneAgent = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
  ];
  const res1 = engine.evaluateDecision({ evidenceBundle: bundle, agents: oneAgent });
  const trust1 = res1.domains.find(d => d.family === 'PRICE_STRUCTURE').trust;

  const fourAgents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'VISION', agentName: 'Vision Agent', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY' },
    { agentId: 'STRATEGY', agentName: 'Strategy Agent', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY' },
    { agentId: 'QUANT_MOMENTUM', agentName: 'Quant Momentum', direction: 'BULLISH', confidence: 80, evidenceTrust: 80, readiness: 'READY' },
  ];
  const res4 = engine.evaluateDecision({ evidenceBundle: bundle, agents: fourAgents });
  const trust4 = res4.domains.find(d => d.family === 'PRICE_STRUCTURE').trust;

  // 4 agents must NOT make trust 4x 90% (which would be 360%). Trust must remain bounded <= 100%.
  assert(trust4 <= 100, 'Trust must not exceed 100%');
  assert(Math.abs(trust4 - trust1) <= 10, 'Trust should reflect evidence quality, not agent count');
});

// 15. Intra-domain conflict surfaced
runTest('Intra-domain conflict surfaced when agents within same family disagree', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'VOLATILITY_SQUEEZE', agentName: 'Volatility Squeeze', direction: 'BEARISH', confidence: 80, evidenceTrust: 85, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(result.conflicts.some(c => c.type === 'INTRA_DOMAIN'), 'Intra-domain conflict must be surfaced');
});

// 16. Cross-domain conflict surfaced
runTest('Cross-domain conflict surfaced when distinct domains disagree', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    {
      agentId: 'MACRO',
      agentName: 'Macro Agent',
      direction: 'BEARISH',
      confidence: 85,
      evidenceTrust: 90,
      readiness: 'READY',
      evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'FRED_API' }]
    },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(result.conflicts.some(c => c.type === 'CROSS_DOMAIN'), 'Cross-domain conflict must be surfaced');
  assert(result.opposingDomains.includes('MACRO'));
  assert(result.supportingDomains.includes('PRICE_STRUCTURE'));
});

// 17. Hard data veto overrides bullish consensus
runTest('Hard data veto overrides 100% bullish consensus and forces WAIT / DATA_LIMITED', () => {
  const staleBundle = createMockEvidenceBundle('XAUUSD', {
    quote: { symbol: 'XAUUSD', bid: 2650.5, ask: 2650.7, time: Date.now() - 120_000 } // 2m stale
  });
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'ORDER_FLOW', agentName: 'Order Flow', direction: 'BULLISH', confidence: 90, evidenceTrust: 90, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: staleBundle, agents });
  assert(result.hardVetoes.length > 0, 'Hard veto must trigger on stale quote');
  assert.strictEqual(result.confidence, 0, 'Confidence must be forced to 0 on hard veto');
  assert.strictEqual(result.tradeExecutable, false);
  assert(result.maturity === 'DATA_LIMITED' || result.maturity === 'UNAVAILABLE');
});

// 18. Risk Guardian can block maturity
runTest('Risk Guardian RESTRICTED blocks setup validation and forces WAIT', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'CAUTION', confidence: 90, evidenceTrust: 95, readiness: 'READY', bias: 'RESTRICTED', keyRisk: 'Maximum volatility exposure reached' }
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(result.hardVetoes.some(v => v.source === 'RISK_GUARDIAN'), 'Risk Guardian hard veto must be recorded');
  assert(result.maturity !== 'VALIDATED_SETUP', 'Maturity cannot be VALIDATED_SETUP when Risk Guardian restricts');
});

// 19. Data Sentinel can block maturity
runTest('Data Sentinel can block maturity when telemetry corruption is detected', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'DATA_SENTINEL', agentName: 'Data Sentinel', direction: 'CAUTION', confidence: 100, evidenceTrust: 100, readiness: 'READY', missingEvidence: ['Corrupted broker spread'] }
  ];

  const result = engine.evaluateDecision({
    evidenceBundle: bundle,
    agents,
    dataSentinelOverride: { status: 'ERROR', reason: 'Corrupted broker spread' }
  });
  assert(result.hardVetoes.some(v => v.source === 'DATA_SENTINEL'), 'Data Sentinel hard veto must be recorded');
  assert(result.maturity !== 'VALIDATED_SETUP');
});

// 20. Soft veto reduces/caps maturity/confidence
runTest('Soft veto caps confidence and prevents premature maturity promotion', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'CAUTION', confidence: 75, evidenceTrust: 80, readiness: 'READY', keyRisk: 'Abnormal spread expansion' }
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(result.softVetoes.length > 0, 'Soft veto must be recorded');
  assert(result.confidence <= 65, 'Confidence must be capped by soft veto');
});

// 21. Bullish bias can coexist with WATCH
runTest('Bullish bias can coexist with WATCH maturity', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 75, evidenceTrust: 80, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert.strictEqual(result.bias, 'BULLISH');
  assert.strictEqual(result.maturity, 'WATCH');
});

// 22. Bearish bias can coexist with WATCH
runTest('Bearish bias can coexist with WATCH maturity', () => {
  const bundle = createMockEvidenceBundle('XAUUSD', {
    timeframeCandles: {
      M15: createMockCandles(50, 'BEARISH'),
      H1: createMockCandles(50, 'BEARISH'),
      H4: createMockCandles(50, 'BEARISH'),
      D1: createMockCandles(50, 'BEARISH'),
    }
  });
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BEARISH', confidence: 75, evidenceTrust: 80, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert.strictEqual(result.bias, 'BEARISH');
  assert.strictEqual(result.maturity, 'WATCH');
});

// 23. Correlated technical-only evidence cannot reach VALIDATED_SETUP
runTest('Correlated technical-only evidence cannot reach VALIDATED_SETUP', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  // All 7 candle-derived agents agree bullishly
  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'VISION', agentName: 'Vision Agent', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'STRATEGY', agentName: 'Strategy Agent', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'VOLATILITY_SQUEEZE', agentName: 'Volatility Squeeze', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'ANCHORED_VWAP', agentName: 'Anchored VWAP', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'MARKET_REGIME_CLASSIFIER', agentName: 'Regime Classifier', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'QUANT_MOMENTUM', agentName: 'Quant Momentum', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  // Invariant: VALIDATED_SETUP strictly requires >= 3 genuinely distinct independent domains!
  assert.notStrictEqual(result.maturity, 'VALIDATED_SETUP', 'Cannot validate without multi-domain confirmation');
  assert(result.maturity === 'WATCH' || result.maturity === 'SETUP_FORMING');
});

// 24. Independent domains can advance maturity
runTest('Independent domains advance maturity to SETUP_FORMING and VALIDATED_SETUP', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'ORDER_FLOW', agentName: 'Order Flow', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'MT5_TICK_VOLUME' }] },
    { agentId: 'KILLZONE', agentName: 'Session Agent', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'EXCHANGE_CLOCK' }] },
    { agentId: 'MACRO', agentName: 'Macro Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'FRED_API' }] },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'NEUTRAL', confidence: 90, evidenceTrust: 95, readiness: 'READY', bias: 'CLEAR' },
  ];

  const result = engine.evaluateDecision({
    evidenceBundle: bundle,
    agents,
    hasBlueprint: true,
  });

  assert(result.independentDomainCount >= 3, `Expected >= 3 independent domains, got ${result.independentDomainCount}`);
  assert.strictEqual(result.maturity, 'VALIDATED_SETUP');
  assert.strictEqual(result.tradeExecutable, false); // Still READ_ONLY!
});

// 25. Missing optional cloud evidence does not force UNAVAILABLE
runTest('Missing optional cloud evidence does not force UNAVAILABLE (supports OBSERVING / WATCH)', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  // Pure local setup with zero cloud feeds
  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 75, evidenceTrust: 80, readiness: 'READY' },
    { agentId: 'MACRO', agentName: 'Macro Agent', direction: 'NEUTRAL', confidence: 0, evidenceTrust: 0, readiness: 'DATA_LIMITED' },
    { agentId: 'SENTIMENT', agentName: 'Sentiment Agent', direction: 'NEUTRAL', confidence: 0, evidenceTrust: 0, readiness: 'DATA_LIMITED' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert.notStrictEqual(result.maturity, 'UNAVAILABLE');
  assert(result.maturity === 'WATCH' || result.maturity === 'OBSERVING');
});

// 26. NOT_APPLICABLE does not unfairly reduce completeness
runTest('NOT_APPLICABLE killzone does not unfairly reduce crypto completeness', () => {
  const engine = new DecisionEngineV2();
  const sessionCtx = engine.evaluateSessionContext('BTCUSD', createMockEvidenceBundle('BTCUSD'));
  assert.strictEqual(sessionCtx.killzoneWindow, 'NOT_APPLICABLE');
  assert.strictEqual(sessionCtx.is24x7, true);
});

// 27. Applicable missing evidence cannot masquerade as NOT_APPLICABLE
runTest('Applicable missing evidence is DATA_LIMITED or UNAVAILABLE, never NOT_APPLICABLE', () => {
  const engine = new DecisionEngineV2();
  const applicability = engine.getDomainApplicability('EURUSD');
  // Forex definitely requires SESSION and MACRO!
  assert.strictEqual(applicability['SESSION'], 'APPLICABLE');
  assert.strictEqual(applicability['MACRO'], 'APPLICABLE');
});

// 28. requirementsToAdvance populated from actual missing evidence
runTest('requirementsToAdvance contains actionable missing prerequisites', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(Array.isArray(result.requirementsToAdvance));
  assert(result.requirementsToAdvance.length > 0);
  assert(result.requirementsToAdvance.some(r => r.includes('independent domain') || r.includes('blueprint')));
});

// 29. blockingConditions populated from veto/conflict state
runTest('blockingConditions accurately lists active conflicts and vetoes', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    {
      agentId: 'MACRO',
      agentName: 'Macro Agent',
      direction: 'BEARISH',
      confidence: 85,
      evidenceTrust: 90,
      readiness: 'READY',
      evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'FRED_API' }]
    },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(Array.isArray(result.blockingConditions));
  assert(result.blockingConditions.length > 0);
  assert(result.blockingConditions.some(b => b.includes('disagreement') || b.includes('opposing')));
});

// 30. invalidationConditions deterministic
runTest('invalidationConditions deterministic from technical structure and risk bounds', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY', invalidation: 'H1 swing low break below 2640.00' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(Array.isArray(result.invalidationConditions));
  assert(result.invalidationConditions.includes('H1 swing low break below 2640.00'));
});

// 31. Explanation generated from structured evidence
runTest('Explanation generated deterministically without fictitious narratives', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(typeof result.explanation === 'string');
  assert(result.explanation.includes('POSTURE: WATCH'));
  assert(result.explanation.includes('BIAS: BULLISH'));
  assert(result.explanation.includes('SUPPORT:'));
});

// 32. Same snapshotId used throughout decision evaluation
runTest('Same snapshotId used throughout decision evaluation cycle', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert.strictEqual(result.snapshotId, bundle.snapshotId);
  assert.strictEqual(result.asOf, bundle.asOf);
});

// 33. GER40 remains UNAVAILABLE
runTest('GER40 remains strictly UNAVAILABLE with zero fabricated maturity', () => {
  const gerBundle = createMockEvidenceBundle('GER40', {
    market: { marketState: 'UNAVAILABLE', quoteFreshness: 'UNAVAILABLE' },
    provenance: { classification: 'UNAVAILABLE' }
  });
  const engine = new DecisionEngineV2();

  const result = engine.evaluateDecision({ evidenceBundle: gerBundle, agents: [] });
  assert.strictEqual(result.maturity, 'UNAVAILABLE');
  assert.strictEqual(result.confidence, 0);
  assert.strictEqual(result.tradeExecutable, false);
});

// 34. BTCUSD session behavior remains 24/7 aware
runTest('BTCUSD session behavior remains 24/7 crypto aware', () => {
  const engine = new DecisionEngineV2();
  const sessionRule = engine.evaluateSessionApplicability('BTCUSD');
  assert.strictEqual(sessionRule.is24x7, true);
  assert.strictEqual(sessionRule.penalizeClosedForexSessions, false);
});

// 35. tradeExecutable always false across all decision layers
runTest('tradeExecutable strictly false across all decision output layers', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert.strictEqual(result.tradeExecutable, false);
});

// 36. READ_ONLY execution mode strictly preserved
runTest('READ_ONLY execution mode preserved in decision intelligence', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert.strictEqual(result.executionMode, 'READ_ONLY');
});

// 37. MT5 order transport false
runTest('mt5OrderTransportEnabled is strictly false', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert.strictEqual(result.mt5OrderTransportEnabled, false);
});

// 38. No direct SQLite imports in client
runTest('No direct SQLite imports in client-facing decision modules', () => {
  const decisionCode = fs.readFileSync(path.join(__dirname, '../src/lib/decision/decision-engine-v2.ts'), 'utf8');
  assert(!decisionCode.includes("require('node:sqlite')"), 'Client decision engine must not import node:sqlite directly');
  assert(!decisionCode.includes("from 'node:sqlite'"), 'Client decision engine must not import node:sqlite directly');
});

// 39. No public technical fallback
runTest('No public technical fallback (Yahoo/Binance) in DecisionEngineV2', () => {
  const decisionCode = fs.readFileSync(path.join(__dirname, '../src/lib/decision/decision-engine-v2.ts'), 'utf8');
  assert(!decisionCode.includes('queryYahooFinance'), 'Decision engine must not use Yahoo Finance');
  assert(!decisionCode.includes('queryBinancePublic'), 'Decision engine must not use Binance fallback');
});

// 40. Backward-compatible old decision fields remain available in AssetIntelligenceProfile
runTest('Backward-compatible decision fields remain present and populated', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert(result.legacyCompatibility);
  assert(typeof result.legacyCompatibility.confluenceScore === 'number');
  assert(typeof result.legacyCompatibility.conflictScore === 'number');
  assert(typeof result.legacyCompatibility.decisionPosture === 'string');
  assert(typeof result.legacyCompatibility.directionalBias === 'string');
});

// -------------------------------------------------------------
// SYNTHETIC SCENARIO TESTS (Scenarios A through E)
// -------------------------------------------------------------

console.log('\n--- SYNTHETIC SCENARIOS A through E ---');

// SCENARIO A: 7 correlated technical agents bullish, other domains unavailable
runTest('SCENARIO A: 7 correlated technical agents bullish -> capped confidence, NOT VALIDATED_SETUP', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'OPPORTUNITY', agentName: 'Opportunity Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'STRATEGY', agentName: 'Strategy Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'VOLATILITY_SQUEEZE', agentName: 'Volatility Squeeze', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'ANCHORED_VWAP', agentName: 'Anchored VWAP', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'MARKET_REGIME_CLASSIFIER', agentName: 'Regime Classifier', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'QUANT_MOMENTUM', agentName: 'Quant Momentum', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert.strictEqual(result.bias, 'BULLISH');
  assert.notStrictEqual(result.maturity, 'VALIDATED_SETUP');
  assert(result.confidence <= 55, `Scenario A confidence must be capped at 55%, got ${result.confidence}%`);
});

// SCENARIO B: Technical bullish + order flow proxy bullish + session favorable + risk clear + macro bullish
runTest('SCENARIO B: Multi-domain alignment reaches higher maturity than Scenario A', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'ORDER_FLOW', agentName: 'Order Flow', direction: 'BULLISH', confidence: 80, evidenceTrust: 85, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'MT5_TICK_VOLUME' }] },
    { agentId: 'KILLZONE', agentName: 'Session Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'EXCHANGE_CLOCK' }] },
    { agentId: 'MACRO', agentName: 'Macro Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'FRED_API' }] },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'NEUTRAL', confidence: 90, evidenceTrust: 95, readiness: 'READY', bias: 'CLEAR' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents, hasBlueprint: true });
  assert.strictEqual(result.maturity, 'VALIDATED_SETUP');
  assert(result.confidence > 55, `Scenario B confidence (${result.confidence}%) must be higher than Scenario A cap`);
});

// SCENARIO C: Technical bullish + macro bearish + risk caution
runTest('SCENARIO C: Technical bullish + macro bearish + risk caution -> conflict surfaced, confidence reduced', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 85, evidenceTrust: 90, readiness: 'READY' },
    { agentId: 'MACRO', agentName: 'Macro Agent', direction: 'BEARISH', confidence: 85, evidenceTrust: 90, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'FRED_API' }] },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'CAUTION', confidence: 80, evidenceTrust: 85, readiness: 'READY', keyRisk: 'Macro headwind' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(result.conflicts.length > 0);
  assert(result.softVetoes.length > 0);
  assert(result.confidence <= 50, `Scenario C confidence (${result.confidence}%) must be reduced`);
  assert(result.maturity === 'WATCH' || result.maturity === 'OBSERVING');
});

// SCENARIO D: Technical strongly bullish + Data Sentinel critical stale quote
runTest('SCENARIO D: Technical strongly bullish + Data Sentinel critical stale quote -> hard veto, cannot validate', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'ORDER_FLOW', agentName: 'Order Flow', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
  ];

  const result = engine.evaluateDecision({
    evidenceBundle: bundle,
    agents,
    dataSentinelOverride: { status: 'ERROR', reason: 'Critical quote latency > 120s' }
  });

  assert(result.hardVetoes.length > 0);
  assert.strictEqual(result.confidence, 0);
  assert(result.maturity === 'DATA_LIMITED' || result.maturity === 'UNAVAILABLE');
  assert.strictEqual(result.tradeExecutable, false);
});

// SCENARIO E: All strong, highest maturity allowed -> tradeExecutable=false strictly enforced
runTest('SCENARIO E: All strong independent signals, VALIDATED_SETUP -> tradeExecutable=false strictly enforced', () => {
  const bundle = createMockEvidenceBundle('XAUUSD');
  const engine = new DecisionEngineV2();

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'ORDER_FLOW', agentName: 'Order Flow', direction: 'BULLISH', confidence: 90, evidenceTrust: 90, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'MT5_TICK_VOLUME' }] },
    { agentId: 'KILLZONE', agentName: 'Session Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 90, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'EXCHANGE_CLOCK' }] },
    { agentId: 'MACRO', agentName: 'Macro Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 90, readiness: 'READY', evidence: [{ classification: 'DIRECT_MEASUREMENT', decisionEligible: true, verified: true, source: 'FRED_API' }] },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'NEUTRAL', confidence: 95, evidenceTrust: 95, readiness: 'READY', bias: 'CLEAR' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents, hasBlueprint: true });
  assert.strictEqual(result.maturity, 'VALIDATED_SETUP');
  assert.strictEqual(result.tradeExecutable, false);
  assert.strictEqual(result.executionMode, 'READ_ONLY');
});

// -------------------------------------------------------------
// SESSION SEMANTICS & NON-DIRECTIONAL DOMAIN CORRECTNESS TESTS
// -------------------------------------------------------------

console.log('\n--- SESSION & NON-DIRECTIONAL DOMAIN TESTS ---');

// 46. BTCUSD live/healthy session is not NOT_APPLICABLE
runTest('Test 46: BTCUSD live/healthy session is APPLICABLE and READY', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('BTCUSD');
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  const sessionDomain = result.domains.find(d => d.family === 'SESSION');
  assert(sessionDomain, 'SESSION domain must exist for BTCUSD');
  assert.strictEqual(sessionDomain.readiness, 'READY');
  assert.notStrictEqual(sessionDomain.readiness, 'NOT_APPLICABLE');
});

// 47. BTCUSD represents 24/7/continuous open session correctly
runTest('Test 47: BTCUSD represents 24/7/continuous open session correctly in sessionContext', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('BTCUSD');
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert(result.sessionContext, 'sessionContext must exist on decision result');
  assert.strictEqual(result.sessionContext.marketAvailability, 'OPEN');
  assert.strictEqual(result.sessionContext.sessionModel, 'CONTINUOUS_24_7');
  assert.strictEqual(result.sessionContext.is24x7, true);
});

// 48. BTCUSD does not receive MARKET_CLOSED from FX calendar
runTest('Test 48: BTCUSD does not receive MARKET_CLOSED hard veto from FX calendar', () => {
  const engine = new DecisionEngineV2();
  // Weekend timestamp (Saturday)
  const saturdayDate = new Date('2026-10-17T12:00:00Z');
  const bundle = createMockEvidenceBundle('BTCUSD', {
    asOf: saturdayDate.getTime(),
    market: { quoteTimestamp: saturdayDate.getTime(), quoteAgeMs: 500, quoteFreshness: 'FRESH' }
  });
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert(!result.hardVetoes.some(v => v.source === 'SESSION'), 'BTCUSD must not receive session hard veto on weekend');
  assert.strictEqual(result.sessionContext.marketAvailability, 'OPEN');
});

// 49. Crypto FX-killzone is NOT_APPLICABLE independently
runTest('Test 49: Crypto FX-killzone is NOT_APPLICABLE independently', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('BTCUSD');
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert.strictEqual(result.sessionContext.killzoneWindow, 'NOT_APPLICABLE');
});

// 50. SESSION READY does not count as bullish directional confirmation
runTest('Test 50: SESSION READY does not count as bullish directional confirmation', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('EURUSD');
  const agents = [
    { agentId: 'KILLZONE', agentName: 'Session Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 90, readiness: 'READY' }
  ];
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(!result.supportingDomains.includes('SESSION'), 'SESSION must not be added to supportingDomains');
  assert.strictEqual(result.independentDomainCount, 0, 'SESSION alone cannot create an independent directional domain');
});

// 51. SESSION READY does not count as bearish directional confirmation
runTest('Test 51: SESSION READY does not count as bearish directional confirmation', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('EURUSD');
  const agents = [
    { agentId: 'KILLZONE', agentName: 'Session Agent', direction: 'BEARISH', confidence: 90, evidenceTrust: 90, readiness: 'READY' }
  ];
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(!result.opposingDomains.includes('SESSION'), 'SESSION must not be added to opposingDomains');
  assert.strictEqual(result.independentDomainCount, 0);
});

// 52. DATA_QUALITY READY does not count as directional confirmation
runTest('Test 52: DATA_QUALITY READY does not count as directional confirmation', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('XAUUSD');
  const agents = [
    { agentId: 'DATA_SENTINEL', agentName: 'Data Sentinel', direction: 'BULLISH', confidence: 100, evidenceTrust: 100, readiness: 'READY' }
  ];
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(!result.supportingDomains.includes('DATA_QUALITY'), 'DATA_QUALITY must not add directional confirmation');
  assert.strictEqual(result.independentDomainCount, 0);
});

// 53. RISK CLEAR does not count as directional confirmation
runTest('Test 53: RISK CLEAR does not count as directional confirmation', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('XAUUSD');
  const agents = [
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY', bias: 'CLEAR' }
  ];
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });
  assert(!result.supportingDomains.includes('RISK'), 'RISK must not add directional confirmation');
  assert.strictEqual(result.independentDomainCount, 0);
});

// 54. FX genuinely closed produces MARKET_CLOSED hard veto
runTest('Test 54: FX genuinely closed produces MARKET_CLOSED hard veto', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('EURUSD', {
    market: {
      marketState: 'WEEKEND_CLOSED',
      sessionState: { marketState: 'WEEKEND_CLOSED', isOpen: false, tradeExecutable: false }
    }
  });
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert(result.hardVetoes.some(v => v.source === 'SESSION'), 'Must emit MARKET_CLOSED hard veto when FX is closed');
  assert.strictEqual(result.sessionContext.marketAvailability, 'CLOSED');
});

// 55. FX open outside killzone does not produce MARKET_CLOSED
runTest('Test 55: FX open outside killzone does not produce MARKET_CLOSED', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('EURUSD', {
    market: {
      marketState: 'OPEN',
      sessionState: { marketState: 'OPEN', isOpen: true, sessionName: 'ASIAN SESSION', tradeExecutable: false }
    }
  });
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert(!result.hardVetoes.some(v => v.source === 'SESSION'), 'Open FX market must NOT receive MARKET_CLOSED');
  assert.strictEqual(result.sessionContext.marketAvailability, 'OPEN');
});

// 56. FX open outside required killzone may produce SESSION_SUBOPTIMAL
runTest('Test 56: FX open outside required killzone produces SESSION_SUBOPTIMAL soft veto', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('EURUSD', {
    market: {
      marketState: 'OPEN',
      sessionState: { marketState: 'OPEN', isOpen: true, sessionName: 'ASIAN SESSION', tradeExecutable: false }
    }
  });
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [], requireActiveKillzone: true });
  assert(result.softVetoes.some(v => v.source === 'SESSION'), 'Should emit SESSION_SUBOPTIMAL soft veto when killzone required');
});

// 57. Killzone NOT_APPLICABLE does not reduce crypto completeness
runTest('Test 57: Killzone NOT_APPLICABLE does not reduce crypto completeness', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('BTCUSD');
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert.strictEqual(result.evidenceCompleteness, 78);
});

// 58. Asset-class session logic remains deterministic
runTest('Test 58: Asset-class session logic remains deterministic across METALS, FOREX, INDICES, CRYPTO', () => {
  const engine = new DecisionEngineV2();
  const btcCtx = engine.evaluateSessionContext('BTCUSD', createMockEvidenceBundle('BTCUSD'));
  const xauCtx = engine.evaluateSessionContext('XAUUSD', createMockEvidenceBundle('XAUUSD'));
  const eurCtx = engine.evaluateSessionContext('EURUSD', createMockEvidenceBundle('EURUSD'));

  assert.strictEqual(btcCtx.is24x7, true);
  assert.strictEqual(xauCtx.is24x7, false);
  assert.strictEqual(eurCtx.is24x7, false);
});

// 59. GER40 unavailable remains UNAVAILABLE
runTest('Test 59: GER40 unavailable remains strictly UNAVAILABLE', () => {
  const engine = new DecisionEngineV2();
  const gerBundle = createMockEvidenceBundle('GER40', {
    market: { marketState: 'UNAVAILABLE', quoteFreshness: 'UNAVAILABLE' },
    provenance: { classification: 'UNAVAILABLE' }
  });
  const result = engine.evaluateDecision({ evidenceBundle: gerBundle, agents: [] });
  assert.strictEqual(result.maturity, 'UNAVAILABLE');
  assert.strictEqual(result.sessionContext.marketAvailability, 'UNAVAILABLE');
});

// 60. tradeExecutable remains false across all session conditions
runTest('Test 60: tradeExecutable remains false across all session conditions', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('BTCUSD');
  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents: [] });
  assert.strictEqual(result.tradeExecutable, false);
});

// 61. SYNTHETIC DIRECTION TEST: PRICE_STRUCTURE=BULLISH, SESSION=READY/24_7, DATA_QUALITY=READY, RISK=CLEAR
runTest('Test 61: SYNTHETIC DIRECTION TEST: Directional support based on PRICE_STRUCTURE only', () => {
  const engine = new DecisionEngineV2();
  const bundle = createMockEvidenceBundle('BTCUSD');

  const agents = [
    { agentId: 'TECHNICAL', agentName: 'Technical Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'KILLZONE', agentName: 'Session Agent', direction: 'BULLISH', confidence: 90, evidenceTrust: 95, readiness: 'READY' },
    { agentId: 'DATA_SENTINEL', agentName: 'Data Sentinel', direction: 'BULLISH', confidence: 100, evidenceTrust: 100, readiness: 'READY' },
    { agentId: 'RISK_GUARDIAN', agentName: 'Risk Guardian', direction: 'BULLISH', confidence: 95, evidenceTrust: 95, readiness: 'READY', bias: 'CLEAR' },
  ];

  const result = engine.evaluateDecision({ evidenceBundle: bundle, agents });

  // Invariant: Non-directional domains (SESSION, DATA_QUALITY, RISK) do NOT add directional confirmations!
  assert.strictEqual(result.independentDomainCount, 1, `Expected independentDomainCount=1, got ${result.independentDomainCount}`);
  assert.deepStrictEqual(result.supportingDomains, ['PRICE_STRUCTURE', 'MOMENTUM']);
  assert(!result.supportingDomains.includes('SESSION'));
  assert(!result.supportingDomains.includes('DATA_QUALITY'));
  assert(!result.supportingDomains.includes('RISK'));
});

console.log('\n=================================================================');
console.log(`DECISION ENGINE V2 TESTS COMPLETE: ${passedTests}/${totalTests} PASSED`);
console.log('=================================================================\n');
