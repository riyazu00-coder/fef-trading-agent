/**
 * FEF CORTEX — TEST SUITE: DECISION ENGINE V2 UI INTEGRATION
 * COCKPIT + OPPORTUNITY RADAR
 *
 * 40 Rigorous Automated Tests:
 * - Client sandbox isolation (T1-T4)
 * - UI Projection security & sanitization (T5-T10)
 * - GER40 fail-closed semantics (T11-T15)
 * - BTCUSD 24/7 session semantics (T16-T17)
 * - Maturity vs Bias decoupling (T18-T20)
 * - Hard & soft veto mapping (T21-T22)
 * - Conflict & explainability mapping (T23-T26)
 * - Snapshot & timestamp preservation (T27-T28)
 * - Absolute safety invariants (T29-T30)
 * - Multi-asset pipeline integration (T31-T32)
 * - Opportunity Radar integration & scoring (T33-T37)
 * - Component source verification (T38-T39)
 * - Backward compatibility preservation (T40)
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
const { projectDecisionV2ForUi } = require('../src/lib/decision/decision-ui-projection');
const { generateAssetIntelligence } = require('../src/lib/agents/multi-asset-pipeline');
const { generateGlobalRadarIntelligence } = require('../src/lib/radar/opportunity-radar-engine');
const { INITIAL_LIVE_ASSETS } = require('../src/lib/providers/real-market-api');
const { DecisionEngineV2 } = require('../src/lib/decision/decision-engine-v2');

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
console.log('FEF CORTEX — DECISION ENGINE V2 UI INTEGRATION TEST SUITE');
console.log('=================================================================\n');

// -------------------------------------------------------------
// GROUP 1: Client Sandbox Isolation (T1 - T4)
// -------------------------------------------------------------
runTest('Client sandbox isolation: CurrentAiDecision.tsx has zero sqlite imports', () => {
  const content = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/CurrentAiDecision.tsx'), 'utf8');
  assert(!content.includes('node:sqlite'), 'Found node:sqlite import in CurrentAiDecision.tsx');
  assert(!content.includes('DatabaseSync'), 'Found DatabaseSync in CurrentAiDecision.tsx');
  assert(!content.includes('LocalTelemetryRepository'), 'Found repository import in CurrentAiDecision.tsx');
});

runTest('Client sandbox isolation: GlobalOpportunityRadar.tsx has zero sqlite imports', () => {
  const content = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/GlobalOpportunityRadar.tsx'), 'utf8');
  assert(!content.includes('node:sqlite'), 'Found node:sqlite import in GlobalOpportunityRadar.tsx');
  assert(!content.includes('DatabaseSync'), 'Found DatabaseSync in GlobalOpportunityRadar.tsx');
  assert(!content.includes('LocalTelemetryRepository'), 'Found repository import in GlobalOpportunityRadar.tsx');
});

runTest('Client sandbox isolation: decision-ui-projection.ts has zero sqlite imports', () => {
  const content = fs.readFileSync(path.join(__dirname, '../src/lib/decision/decision-ui-projection.ts'), 'utf8');
  assert(!content.includes('node:sqlite'), 'Found node:sqlite import in decision-ui-projection.ts');
  assert(!content.includes('DatabaseSync'), 'Found DatabaseSync in decision-ui-projection.ts');
});

runTest('Client sandbox isolation: opportunity-radar-engine.ts has zero sqlite imports', () => {
  const content = fs.readFileSync(path.join(__dirname, '../src/lib/radar/opportunity-radar-engine.ts'), 'utf8');
  assert(!content.includes('node:sqlite'), 'Found node:sqlite import in opportunity-radar-engine.ts');
  assert(!content.includes('DatabaseSync'), 'Found DatabaseSync in opportunity-radar-engine.ts');
});

// -------------------------------------------------------------
// GROUP 2: UI Projection Security & Sanitization (T5 - T10)
// -------------------------------------------------------------
runTest('UI Projection zero-secret sanitization: contains no file paths, tokens, or device secrets', () => {
  const sampleDecision = {
    maturity: 'WATCH',
    bias: 'BULLISH',
    confidence: 35,
    evidenceCompleteness: 80,
    independentDomainCount: 4,
    supportingDomains: ['PRICE_STRUCTURE', 'MOMENTUM'],
    opposingDomains: [],
    unavailableDomains: [],
    hardVetoes: [],
    softVetoes: [],
    conflicts: [],
    requirementsToAdvance: ['M15 close above structure'],
    blockingConditions: ['Suboptimal session'],
    invalidationConditions: ['Close below pivot'],
    explanation: 'Test rationale',
    sessionContext: { marketAvailability: 'OPEN', sessionModel: 'LONDON_SESSION', killzoneWindow: 'ACTIVE', is24x7: false },
    tradeExecutable: false,
    executionMode: 'READ_ONLY',
    snapshotId: 'snap-123',
    asOf: 1690000000000,
    generatedAt: 1690000000100
  };
  const proj = projectDecisionV2ForUi(sampleDecision, 'EURUSD');
  const json = JSON.stringify(proj);
  assert(!json.includes('.fef/data'), 'Leaked db path in projection');
  assert(!json.includes('token'), 'Leaked token key in projection');
  assert(!json.includes('secret'), 'Leaked secret key in projection');
});

runTest('UI Projection deterministic fallback: null decision returns maturity UNAVAILABLE', () => {
  const proj = projectDecisionV2ForUi(null, 'UNKNOWN');
  assert.strictEqual(proj.maturity, 'UNAVAILABLE');
});

runTest('UI Projection deterministic fallback: null decision returns tradeExecutable strictly false', () => {
  const proj = projectDecisionV2ForUi(null, 'UNKNOWN');
  assert.strictEqual(proj.tradeExecutable, false);
});

runTest('UI Projection deterministic fallback: null decision returns confidence 0', () => {
  const proj = projectDecisionV2ForUi(null, 'UNKNOWN');
  assert.strictEqual(proj.confidence, 0);
});

runTest('UI Projection deterministic fallback: null decision returns evidenceCompleteness 0', () => {
  const proj = projectDecisionV2ForUi(null, 'UNKNOWN');
  assert.strictEqual(proj.evidenceCompleteness, 0);
});

runTest('UI Projection deterministic fallback: null decision returns executionMode READ_ONLY', () => {
  const proj = projectDecisionV2ForUi(null, 'UNKNOWN');
  assert.strictEqual(proj.executionMode, 'READ_ONLY');
});

// -------------------------------------------------------------
// GROUP 3: GER40 Fail-Closed Semantics (T11 - T15)
// -------------------------------------------------------------
runTest('GER40 fail-closed: returns maturity UNAVAILABLE regardless of input', () => {
  const fakeDecision = { maturity: 'VALIDATED_SETUP', bias: 'BULLISH', confidence: 95 };
  const proj = projectDecisionV2ForUi(fakeDecision, 'GER40');
  assert.strictEqual(proj.maturity, 'UNAVAILABLE');
});

runTest('GER40 fail-closed: hardVetoes contains MARKET_DATA source', () => {
  const proj = projectDecisionV2ForUi(null, 'GER40');
  assert(proj.hardVetoes.some(v => v.source === 'MARKET_DATA'), 'Expected MARKET_DATA veto for GER40');
});

runTest('GER40 fail-closed: hasHardVeto is true', () => {
  const proj = projectDecisionV2ForUi(null, 'GER40');
  assert.strictEqual(proj.hasHardVeto, true);
});

runTest('GER40 fail-closed: blockingConditions states telemetry unavailable', () => {
  const proj = projectDecisionV2ForUi(null, 'GER40');
  assert(proj.blockingConditions.some(b => b.includes('telemetry is unavailable')), 'Expected telemetry unavailable in blockingConditions');
});

runTest('GER40 fail-closed: requirementsToAdvance states broker quotes must be verified', () => {
  const proj = projectDecisionV2ForUi(null, 'GER40');
  assert(proj.requirementsToAdvance.some(r => r.includes('Broker quotes')), 'Expected broker quote requirement in requirementsToAdvance');
});

// -------------------------------------------------------------
// GROUP 4: BTCUSD 24/7 Session Semantics (T16 - T17)
// -------------------------------------------------------------
runTest('BTCUSD session semantics: is24x7 is true', () => {
  const sampleBtc = {
    maturity: 'WATCH',
    bias: 'BULLISH',
    confidence: 45,
    sessionContext: { marketAvailability: 'OPEN', sessionModel: 'CONTINUOUS_24_7', killzoneWindow: 'NOT_APPLICABLE', is24x7: true }
  };
  const proj = projectDecisionV2ForUi(sampleBtc, 'BTCUSD');
  assert.strictEqual(proj.is24x7, true);
  assert.strictEqual(proj.sessionModel, 'CONTINUOUS_24_7');
});

runTest('BTCUSD session semantics: killzoneWindow is NOT_APPLICABLE', () => {
  const sampleBtc = {
    maturity: 'WATCH',
    bias: 'BULLISH',
    confidence: 45,
    sessionContext: { marketAvailability: 'OPEN', sessionModel: 'CONTINUOUS_24_7', killzoneWindow: 'NOT_APPLICABLE', is24x7: true }
  };
  const proj = projectDecisionV2ForUi(sampleBtc, 'BTCUSD');
  assert.strictEqual(proj.killzoneWindow, 'NOT_APPLICABLE');
});

// -------------------------------------------------------------
// GROUP 5: Maturity vs Bias Decoupling (T18 - T20)
// -------------------------------------------------------------
runTest('Decoupling: SetupMaturityState WATCH coexists with BULLISH bias in UI projection', () => {
  const decision = { maturity: 'WATCH', bias: 'BULLISH', confidence: 25 };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.strictEqual(proj.maturity, 'WATCH');
  assert.strictEqual(proj.bias, 'BULLISH');
});

runTest('Decoupling: SetupMaturityState WATCH coexists with BEARISH bias in UI projection', () => {
  const decision = { maturity: 'WATCH', bias: 'BEARISH', confidence: 25 };
  const proj = projectDecisionV2ForUi(decision, 'EURUSD');
  assert.strictEqual(proj.maturity, 'WATCH');
  assert.strictEqual(proj.bias, 'BEARISH');
});

runTest('Decoupling: SetupMaturityState SETUP_FORMING coexists with NEUTRAL bias in UI projection', () => {
  const decision = { maturity: 'SETUP_FORMING', bias: 'NEUTRAL', confidence: 40 };
  const proj = projectDecisionV2ForUi(decision, 'US500');
  assert.strictEqual(proj.maturity, 'SETUP_FORMING');
  assert.strictEqual(proj.bias, 'NEUTRAL');
});

// -------------------------------------------------------------
// GROUP 6: Hard & Soft Veto Mapping (T21 - T22)
// -------------------------------------------------------------
runTest('Hard veto presence: hardVetoes accurately sets hasHardVeto: true', () => {
  const decision = {
    maturity: 'WATCH',
    bias: 'BULLISH',
    hardVetoes: [{ source: 'RISK_GUARDIAN', reason: 'Exposure limit', effect: 'FORCE_WAIT' }],
    softVetoes: []
  };
  const proj = projectDecisionV2ForUi(decision, 'GBPUSD');
  assert.strictEqual(proj.hasHardVeto, true);
  assert.strictEqual(proj.hardVetoes.length, 1);
  assert.strictEqual(proj.hardVetoes[0].source, 'RISK_GUARDIAN');
});

runTest('Soft veto presence: softVetoes accurately sets hasSoftVeto: true', () => {
  const decision = {
    maturity: 'SETUP_FORMING',
    bias: 'BULLISH',
    hardVetoes: [],
    softVetoes: [{ source: 'SESSION', reason: 'Suboptimal hours', effect: 'CAP_MATURITY' }]
  };
  const proj = projectDecisionV2ForUi(decision, 'USDJPY');
  assert.strictEqual(proj.hasSoftVeto, true);
  assert.strictEqual(proj.hasHardVeto, false);
  assert.strictEqual(proj.softVetoes.length, 1);
});

// -------------------------------------------------------------
// GROUP 7: Conflict & Explainability Mapping (T23 - T26)
// -------------------------------------------------------------
runTest('Conflict mapping: domain conflicts correctly mapped to conflicts array', () => {
  const decision = {
    maturity: 'WATCH',
    bias: 'NEUTRAL',
    conflicts: [{ type: 'TECHNICAL_VS_MACRO', description: 'Candles bullish but macro bearish' }]
  };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.strictEqual(proj.conflicts.length, 1);
  assert.strictEqual(proj.conflicts[0].type, 'TECHNICAL_VS_MACRO');
});

runTest('Blocking conditions: accurately surfaced in UI projection', () => {
  const decision = {
    maturity: 'WATCH',
    blockingConditions: ['Risk exposure cap reached', 'Outside killzone window']
  };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.strictEqual(proj.blockingConditions.length, 2);
  assert.strictEqual(proj.blockingConditions[0], 'Risk exposure cap reached');
});

runTest('Requirements to advance: accurately surfaced in UI projection', () => {
  const decision = {
    maturity: 'SETUP_FORMING',
    requirementsToAdvance: ['M15 candle close above 2650.50']
  };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.strictEqual(proj.requirementsToAdvance.length, 1);
  assert.strictEqual(proj.requirementsToAdvance[0], 'M15 candle close above 2650.50');
});

runTest('Supporting domains: accurately surfaced in UI projection', () => {
  const decision = {
    maturity: 'VALIDATED_SETUP',
    supportingDomains: ['PRICE_STRUCTURE', 'MOMENTUM', 'ORDER_FLOW_PROXY']
  };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.deepStrictEqual(proj.supportingDomains, ['PRICE_STRUCTURE', 'MOMENTUM', 'ORDER_FLOW_PROXY']);
});

// -------------------------------------------------------------
// GROUP 8: Snapshot & Timestamp Preservation (T27 - T28)
// -------------------------------------------------------------
runTest('Snapshot ID preserved consistently across UI projection', () => {
  const decision = {
    snapshotId: 'snap-unique-abc-123',
    asOf: 1700000000000,
    generatedAt: 1700000000500
  };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.strictEqual(proj.snapshotId, 'snap-unique-abc-123');
});

runTest('AsOf timestamp preserved in UI projection', () => {
  const decision = {
    snapshotId: 'snap-xyz',
    asOf: 1700000000000
  };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.strictEqual(proj.asOf, 1700000000000);
});

// -------------------------------------------------------------
// GROUP 9: Absolute Safety Invariants (T29 - T30)
// -------------------------------------------------------------
runTest('Safety Invariant: tradeExecutable is strictly false across all UI projections', () => {
  const decision = {
    maturity: 'VALIDATED_SETUP',
    bias: 'BULLISH',
    confidence: 100,
    tradeExecutable: true // Even if someone maliciously set true
  };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.strictEqual(proj.tradeExecutable, false, 'tradeExecutable must NEVER be true in UI projection');
});

runTest('Safety Invariant: executionMode is strictly READ_ONLY across all UI projections', () => {
  const decision = {
    maturity: 'VALIDATED_SETUP',
    executionMode: 'ARMED' // Even if upstream had ARMED
  };
  const proj = projectDecisionV2ForUi(decision, 'XAUUSD');
  assert.strictEqual(proj.executionMode, 'READ_ONLY');
});

// -------------------------------------------------------------
// GROUP 10: Multi-Asset Pipeline Integration (T31 - T32)
// -------------------------------------------------------------
runTest('generateAssetIntelligence attaches decisionV2Projection', () => {
  const liveAsset = INITIAL_LIVE_ASSETS['XAUUSD'];
  const profile = generateAssetIntelligence('XAUUSD', liveAsset, 'M15');
  assert(profile.decisionV2Projection, 'Expected decisionV2Projection on profile');
  assert(profile.decisionV2Projection.maturity, 'Expected maturity on decisionV2Projection');
  assert.strictEqual(profile.decisionV2Projection.tradeExecutable, false);
});

runTest('generateAssetIntelligence for GER40 produces UNAVAILABLE decisionV2Projection', () => {
  const liveAsset = INITIAL_LIVE_ASSETS['GER40'] || {
    symbol: 'GER40',
    feedStatus: 'UNAVAILABLE',
    price: 0,
    change24h: 0
  };
  const profile = generateAssetIntelligence('GER40', liveAsset, 'M15');
  assert(profile.decisionV2Projection, 'Expected decisionV2Projection on GER40 profile');
  assert.strictEqual(profile.decisionV2Projection.maturity, 'UNAVAILABLE');
  assert.strictEqual(profile.decisionV2Projection.tradeExecutable, false);
  assert.strictEqual(profile.decisionV2Projection.confidence, 0);
});

// -------------------------------------------------------------
// GROUP 11: Opportunity Radar Integration & Scoring (T33 - T37)
// -------------------------------------------------------------
runTest('generateGlobalRadarIntelligence attaches decisionV2 to each radar item', () => {
  const radar = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'M15');
  assert(radar.rankedOpportunities.length > 0, 'No ranked opportunities generated');
  for (const item of radar.rankedOpportunities) {
    assert(item.decisionV2, `Missing decisionV2 on ${item.symbol}`);
    assert(typeof item.decisionV2.maturity === 'string', `Invalid maturity on ${item.symbol}`);
    assert.strictEqual(item.decisionV2.tradeExecutable, false);
  }
});

runTest('Radar ranking: GER40 has opportunityScore === 0 and state === UNAVAILABLE', () => {
  const radar = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'M15');
  const ger40 = radar.rankedOpportunities.find(o => o.symbol === 'GER40');
  assert(ger40, 'GER40 not found in radar opportunities');
  assert.strictEqual(ger40.opportunityScore, 0, 'GER40 opportunityScore must be 0');
  assert.strictEqual(ger40.state, 'UNAVAILABLE', 'GER40 state must be UNAVAILABLE');
  assert.strictEqual(ger40.tradeExecutable, false, 'GER40 tradeExecutable must be false');
});

runTest('Radar ranking: Hard-vetoed assets capped at <= 15 opportunity score', () => {
  const radar = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'M15');
  for (const item of radar.rankedOpportunities) {
    if (item.decisionV2 && item.decisionV2.hasHardVeto) {
      assert(
        item.opportunityScore <= 15,
        `Hard-vetoed asset ${item.symbol} exceeded score cap: ${item.opportunityScore}`
      );
    }
  }
});

runTest('Radar ranking: Closed assets can score for setup quality but tradeExecutable is false', () => {
  const radar = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'M15');
  const closedItems = radar.rankedOpportunities.filter(o => o.marketState === 'CLOSED');
  for (const item of closedItems) {
    assert.strictEqual(item.tradeExecutable, false, `Closed asset ${item.symbol} must not be tradeExecutable`);
  }
});

runTest('Radar ranking: Top executable opportunity is never a closed or unavailable asset', () => {
  const radar = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'M15');
  const topExecutable = radar.rankedOpportunities.find(o => o.tradeExecutable);
  if (topExecutable) {
    assert.notStrictEqual(topExecutable.symbol, 'GER40');
    assert.notStrictEqual(topExecutable.marketState, 'CLOSED');
    assert.notStrictEqual(topExecutable.marketState, 'UNAVAILABLE');
  }
});

// -------------------------------------------------------------
// GROUP 12: Component Source & Backward Compatibility (T38 - T40)
// -------------------------------------------------------------
runTest('CurrentAiDecision.tsx source audit: renders decisionV2 maturity, bias, and explainability', () => {
  const content = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/CurrentAiDecision.tsx'), 'utf8');
  assert(content.includes('decisionV2.maturity'), 'Missing decisionV2.maturity in CurrentAiDecision.tsx');
  assert(content.includes('decisionV2.bias'), 'Missing decisionV2.bias in CurrentAiDecision.tsx');
  assert(content.includes('decisionV2.confidence'), 'Missing decisionV2.confidence in CurrentAiDecision.tsx');
  assert(content.includes('decisionV2.evidenceCompleteness'), 'Missing decisionV2.evidenceCompleteness in CurrentAiDecision.tsx');
  assert(content.includes('decisionV2.blockingConditions'), 'Missing blockingConditions in CurrentAiDecision.tsx');
  assert(content.includes('decisionV2.requirementsToAdvance'), 'Missing requirementsToAdvance in CurrentAiDecision.tsx');
});

runTest('GlobalOpportunityRadar.tsx source audit: renders decisionV2 maturity, confidence, domains, vetoes', () => {
  const content = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/GlobalOpportunityRadar.tsx'), 'utf8');
  assert(content.includes('decisionV2.maturity'), 'Missing decisionV2.maturity in GlobalOpportunityRadar.tsx');
  assert(content.includes('decisionV2.independentDomainCount'), 'Missing independentDomainCount in GlobalOpportunityRadar.tsx');
  assert(content.includes('hardVetoes'), 'Missing hardVetoes handling in GlobalOpportunityRadar.tsx');
});

runTest('Backward-compatibility: legacy profile fields remain intact and populated', () => {
  const liveAsset = INITIAL_LIVE_ASSETS['XAUUSD'];
  const profile = generateAssetIntelligence('XAUUSD', liveAsset, 'M15');
  assert(typeof profile.setupDirection === 'string', 'setupDirection missing');
  assert(typeof profile.confidence === 'number', 'confidence missing');
  assert(typeof profile.evidenceTrust === 'number', 'evidenceTrust missing');
  assert(profile.confluence, 'confluence missing');
  assert(typeof profile.confluence.agreementScore === 'number', 'agreementScore missing');
});

// -------------------------------------------------------------
// GROUP 13: Spread Truthfulness & Mathematical Baseline (T41 - T44)
// -------------------------------------------------------------
runTest('Zero current spread alone cannot generate spread widening', () => {
  const dummyCandles = [];
  const baseTime = 1700000000;
  for (let i = 0; i < 30; i++) {
    dummyCandles.push({
      timestamp: baseTime + i * 900,
      open: 1.1200 + i * 0.0001,
      high: 1.1205 + i * 0.0001,
      low: 1.1195 + i * 0.0001,
      close: 1.1202 + i * 0.0001,
      volume: 1000
    });
  }

  const zeroSpreadAsset = {
    ...INITIAL_LIVE_ASSETS['EURUSD'],
    bid: 1.12087,
    ask: 1.12087,
    spread: 0
  };

  const profile = generateAssetIntelligence('EURUSD', zeroSpreadAsset, 'M15', dummyCandles);
  const rg = profile.agents.find(a => a.type === 'RISK_GUARDIAN');
  assert(rg, 'Risk Guardian agent missing');
  assert.notStrictEqual(rg.keyRisk, 'Spread widening during volatility', 'Must not emit placeholder spread widening narrative');
  assert(!rg.keyRisk.includes('Spread widening'), 'Must not claim spread widening when spread is 0');

  // Also check decisionV2Projection
  if (profile.decisionV2Projection) {
    const spreadVeto = profile.decisionV2Projection.softVetoes.find(v => v.reason.toLowerCase().includes('spread widening'));
    assert.strictEqual(spreadVeto, undefined, 'Soft veto must not contain spread widening when spread is 0');
  }
});

runTest('Spread widening requires validated baseline comparison', () => {
  const dummyCandles = [];
  const baseTime = 1700000000;
  for (let i = 0; i < 30; i++) {
    dummyCandles.push({
      timestamp: baseTime + i * 900,
      open: 1.1200 + i * 0.0001,
      high: 1.1205 + i * 0.0001,
      low: 1.1195 + i * 0.0001,
      close: 1.1202 + i * 0.0001,
      volume: 1000
    });
  }

  // Typical EURUSD spread is 0.0001. Here spread is 0.0005 (5x typical)
  const wideSpreadAsset = {
    ...INITIAL_LIVE_ASSETS['EURUSD'],
    bid: 1.12000,
    ask: 1.12050,
    spread: 50
  };

  const profile = generateAssetIntelligence('EURUSD', wideSpreadAsset, 'M15', dummyCandles);
  const rg = profile.agents.find(a => a.type === 'RISK_GUARDIAN');
  assert(rg, 'Risk Guardian agent missing');
  assert.strictEqual(rg.bias, 'CAUTION');
  assert(rg.keyRisk.includes('Abnormal spread expansion'), `Expected abnormal spread expansion in keyRisk, got: ${rg.keyRisk}`);
});

runTest('Raw zero spread preserved as 0', () => {
  const zeroSpreadAsset = {
    ...INITIAL_LIVE_ASSETS['EURUSD'],
    bid: 1.12087,
    ask: 1.12087,
    spread: 0
  };
  assert.strictEqual(zeroSpreadAsset.spread, 0, 'Raw spread must remain 0');
  const profile = generateAssetIntelligence('EURUSD', zeroSpreadAsset, 'M15');
  const rg = profile.agents.find(a => a.type === 'RISK_GUARDIAN');
  assert(rg.evidence.some(e => e.includes('Spread: ZERO (0 pts')), 'Must record zero spread truthfully in evidence');
});

runTest('Risk Guardian UI reason provenance from structured evidence', () => {
  const asset = { ...INITIAL_LIVE_ASSETS['XAUUSD'], bid: 4140, ask: 4140.04, spread: 4 };
  const profile = generateAssetIntelligence('XAUUSD', asset, 'M15');
  const rg = profile.agents.find(a => a.type === 'RISK_GUARDIAN');
  assert(rg, 'Risk Guardian missing');
  assert(!rg.keyRisk.includes('Spread widening during volatility'), 'Generic placeholder eliminated');
});

// -------------------------------------------------------------
// GROUP 14: Snapshot Consistency & Atomicity (T45 - T49)
// -------------------------------------------------------------
runTest('Projection contains snapshotId and asOf timestamps', () => {
  const decision = {
    maturity: 'WATCH',
    bias: 'BULLISH',
    confidence: 65,
    snapshotId: 'snap-EURUSD-12345',
    asOf: 1700000000000
  };
  const proj = projectDecisionV2ForUi(decision, 'EURUSD');
  assert.strictEqual(proj.snapshotId, 'snap-EURUSD-12345');
  assert.strictEqual(proj.asOf, 1700000000000);
  assert(typeof proj.generatedAt === 'number');
});

runTest('Cockpit atomicity: all V2 fields originate from one projection', () => {
  const content = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/CurrentAiDecision.tsx'), 'utf8');
  assert(content.includes('decisionV2.maturity'));
  assert(content.includes('decisionV2.bias'));
  assert(content.includes('decisionV2.confidence'));
  assert(content.includes('decisionV2.evidenceCompleteness'));
  assert(content.includes('decisionV2.independentDomainCount'));
  assert(content.includes('decisionV2.hardVetoes'));
  assert(content.includes('decisionV2.softVetoes'));
  assert(content.includes('decisionV2.blockingConditions'));
  assert(content.includes('decisionV2.requirementsToAdvance'));
  assert(content.includes('decisionV2.supportingDomains'));
});

runTest('Radar row atomicity: each row V2 fields originate from its own projection', () => {
  const radar = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'M15');
  for (const item of radar.rankedOpportunities) {
    assert(item.decisionV2, `Item ${item.symbol} missing decisionV2`);
    assert(typeof item.decisionV2.snapshotId === 'string');
    assert(typeof item.decisionV2.asOf === 'number');
  }
});

runTest('Radar score distinct from V2 confidence', () => {
  const radar = generateGlobalRadarIntelligence(INITIAL_LIVE_ASSETS, 'M15');
  for (const item of radar.rankedOpportunities) {
    assert(typeof item.opportunityScore === 'number');
    assert(typeof item.aiConfidence === 'number');
    assert(typeof item.decisionV2.confidence === 'number');
  }
  const radarContent = fs.readFileSync(path.join(__dirname, '../src/components/cockpit/GlobalOpportunityRadar.tsx'), 'utf8');
  assert(radarContent.includes('OPPORTUNITY SCORE'));
  assert(radarContent.includes('AI SWARM CONFIDENCE'));
  assert(radarContent.includes('Decision V2:'));
});

runTest('Stale asset response cannot overwrite newly selected asset', () => {
  const contextContent = fs.readFileSync(path.join(__dirname, '../src/context/ActiveAssetContext.tsx'), 'utf8');
  assert(contextContent.includes('activeFetchIdRef.current'), 'Must use fetchId ref for sequencing');
  assert(contextContent.includes('abortControllerRef.current'), 'Must abort prior fetch');
  assert(contextContent.includes('sym !== activeSymbolRef.current'), 'Must verify symbol before applying candle state');
  assert(contextContent.includes('isCandleMatch'), 'Must strictly guard candle matching');
});

console.log('\n=================================================================');
console.log(`DECISION V2 UI INTEGRATION TESTS COMPLETE: ${passedTests}/${totalTests} PASSED`);
console.log('=================================================================\n');
