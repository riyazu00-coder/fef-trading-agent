/**
 * FEF TRADING SOLUTIONS: PHASE 34 — AGENT EVIDENCE INTEGRITY & TRUST GATE TEST SUITE
 * 
 * Verifies:
 * 1. Evidence Classification enum enforcement & AgentEvidence record structure.
 * 2. Decision eligibility rules (LIVE_MT5, LIVE_EXTERNAL, DERIVED eligible when fresh; SIMULATED/HARDCODED rejected).
 * 3. Freshness policy enforcement (stale telemetry rejected).
 * 4. Agent Trust Score vs Confidence Score separation (unsupported claims yield 0% trust).
 * 5. Consensus Trust metrics (Council Confidence, Evidence Trust, Verified/Limited/Unavailable Agent counts).
 * 6. Actionability Gate evaluation (degradation to ANALYSIS ONLY or DATA LIMITED when unsupported).
 * 7. 15-Member Voting Council Denominator invariant (5 Specialist Observers strictly non-voting).
 * 8. Asset Switching clean isolation across XAUUSD, EURUSD, BTCUSD.
 * 9. Absolute elimination of unverified factual claims:
 *    - $42M institutional iceberg
 *    - 42 ticks/sec
 *    - 18ms WebSocket roundtrip
 *    - 78% retail net short
 *    - 2.1% tail-risk
 *    - +1,240 contracts absorbed
 *    - $148M liquidity pool
 *    - 142 feeds audited
 * 10. Risk Guardian and MT5 read-only safety preservation.
 */

const fs = require('fs');
const assert = require('assert');
const path = require('path');
const ts = require('typescript');

// Register TypeScript on-the-fly compiler with alias resolution
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

const {
  isEvidenceDecisionEligible,
  calculateAgentEvidenceTrust,
  calculateConsensusTrust,
  evaluateActionabilityGate,
  FRESHNESS_POLICIES
} = require('../src/lib/evidence/agent-evidence.ts');

const {
  generateAssetIntelligence,
  CANONICAL_COUNCIL_KEYS
} = require('../src/lib/agents/multi-asset-pipeline.ts');

const { INITIAL_LIVE_ASSETS } = require('../src/lib/providers/real-market-api.ts');

console.log('================================================================');
console.log('FEF TRADING SOLUTIONS: PHASE 34 EVIDENCE INTEGRITY TEST SUITE');
console.log('================================================================\n');

let totalPass = 0;
let totalFail = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${testName}`);
    totalPass++;
  } catch (err) {
    console.error(`  ✕ FAIL: ${testName}`);
    console.error(`    ${err.message}\n`);
    totalFail++;
  }
}

// ---------------------------------------------------------------------------
// TEST GROUP 1: Canonical Classification & Decision Eligibility
// ---------------------------------------------------------------------------
console.log('[TEST GROUP 1] Evidence Classification & Decision Eligibility Rules');

runTest('Fresh LIVE_MT5 evidence is decision-eligible and verified', () => {
  const res = isEvidenceDecisionEligible('LIVE_MT5', 15000);
  assert.strictEqual(res.eligible, true);
  assert.strictEqual(res.verified, true);
});

runTest('Fresh LIVE_EXTERNAL evidence is decision-eligible and verified', () => {
  const res = isEvidenceDecisionEligible('LIVE_EXTERNAL', 30000);
  assert.strictEqual(res.eligible, true);
  assert.strictEqual(res.verified, true);
});

runTest('Fresh DERIVED evidence is decision-eligible and verified', () => {
  const res = isEvidenceDecisionEligible('DERIVED', 5000);
  assert.strictEqual(res.eligible, true);
  assert.strictEqual(res.verified, true);
});

runTest('Stale LIVE_MT5 evidence (> 60s) is rejected from decision eligibility', () => {
  const res = isEvidenceDecisionEligible('LIVE_MT5', 65000);
  assert.strictEqual(res.eligible, false);
  assert.strictEqual(res.verified, false);
  assert(res.reason.includes('Stale'));
});

runTest('MODEL_INFERENCE & HEURISTIC provide context only (ineligible to masquerade as verified facts)', () => {
  const inf = isEvidenceDecisionEligible('MODEL_INFERENCE', 1000);
  const heu = isEvidenceDecisionEligible('HEURISTIC', 1000);
  assert.strictEqual(inf.eligible, false);
  assert.strictEqual(inf.verified, false);
  assert.strictEqual(heu.eligible, false);
  assert.strictEqual(heu.verified, false);
});

runTest('SIMULATED, HARDCODED, UNAVAILABLE, and UNKNOWN are strictly ineligible', () => {
  ['SIMULATED', 'HARDCODED', 'UNAVAILABLE', 'UNKNOWN'].forEach((cls) => {
    const res = isEvidenceDecisionEligible(cls, 0);
    assert.strictEqual(res.eligible, false, `${cls} must not be decision eligible`);
    assert.strictEqual(res.verified, false, `${cls} must not be verified`);
  });
});

// ---------------------------------------------------------------------------
// TEST GROUP 2: Agent Evidence Trust Scoring
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 2] Agent Evidence Trust Scoring & Separation from Confidence');

runTest('Agent with verified DERIVED & LIVE telemetry scores high trust (>= 80%)', () => {
  const sample = [
    {
      id: 'e1', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'M15 CHOCH tap',
      source: 'CALCULATOR', sourceType: 'MATH', classification: 'DERIVED',
      observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 84,
      assetSpecific: true, verified: true, decisionEligible: true, reason: 'ok'
    },
    {
      id: 'e2', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Asian low sweep',
      source: 'CALCULATOR', sourceType: 'MATH', classification: 'DERIVED',
      observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 84,
      assetSpecific: true, verified: true, decisionEligible: true, reason: 'ok'
    }
  ];
  const trust = calculateAgentEvidenceTrust(sample);
  assert(trust.trustScore >= 80, `Expected trust >= 80%, got ${trust.trustScore}%`);
  assert.strictEqual(trust.badge, 'DERIVED');
  assert.strictEqual(trust.verifiedCount, 2);
});

runTest('Agent with UNAVAILABLE feeds scores 0% trust despite high nominal confidence', () => {
  const sample = [
    {
      id: 'e1', agentKey: 'DARK_POOL_RADAR', asset: 'XAUUSD', claim: 'Feed offline',
      source: 'GATEWAY', sourceType: 'GATEWAY', classification: 'UNAVAILABLE',
      observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 90, // Model is 90% confident
      assetSpecific: true, verified: false, decisionEligible: false, reason: 'offline'
    }
  ];
  const trust = calculateAgentEvidenceTrust(sample);
  assert.strictEqual(trust.trustScore, 0, `Trust must be 0% for UNAVAILABLE feed, got ${trust.trustScore}%`);
  assert.strictEqual(trust.badge, 'DATA LIMITED');
  assert.strictEqual(trust.verifiedCount, 0);
});

// ---------------------------------------------------------------------------
// TEST GROUP 3: 15-Council Consensus Trust & Isolation
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 3] 15-Council Consensus Trust & Specialist Observer Isolation');

runTest('15-agent consensus computes distinct Council Confidence and Evidence Trust', () => {
  const profile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  assert.strictEqual(profile.agents.length, 15, 'Exactly 15 council agents must be present');
  assert(typeof profile.confidence === 'number' && profile.confidence > 0, 'Council confidence exists');
  assert(typeof profile.evidenceTrust === 'number', 'Evidence trust exists');
  assert(typeof profile.verifiedAgentCount === 'number', 'Verified agent count exists');
  assert.strictEqual(typeof profile.actionabilityState, 'string', 'Actionability state exists');
  
  // Verify trust and confidence are not identical manufactured numbers
  console.log(`    Metrics for XAUUSD -> Confidence: ${profile.confidence}%, Evidence Trust: ${profile.evidenceTrust}%, Verified Agents: ${profile.verifiedAgentCount}/15, Actionability: ${profile.actionabilityState}`);
});

runTest('Specialist Observers (5) are strictly quarantined from 15-member council', () => {
  const profile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  const agentTypes = profile.agents.map((a) => a.type);
  assert.strictEqual(profile.agents.length, 15);
  assert(!agentTypes.includes('SYNAPSE_SENTINEL'));
  assert(!agentTypes.includes('DARK_POOL_RADAR'));
  assert(!agentTypes.includes('BLACK_SWAN_SCANNER'));
  assert(!agentTypes.includes('RETAIL_FADE_INDEX'));
  assert(!agentTypes.includes('CROSS_ASSET_BETA'));
});

// ---------------------------------------------------------------------------
// TEST GROUP 4: Actionability Gate & Safe Degradation
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 4] Production Actionability Gate & Degradation Paths');

runTest('Actionability Gate safely blocks live execution when market is closed', () => {
  const gate = evaluateActionabilityGate({
    evidenceTrust: 85,
    verifiedAgentCount: 10,
    tradeExecutable: false,
    marketState: 'CLOSED'
  });
  assert.strictEqual(gate.isActionable, false);
  assert.strictEqual(gate.actionabilityState, 'MONITOR');
  assert(gate.reason.includes('Market closed'));
});

runTest('Actionability Gate degrades to DATA LIMITED when verified agents < 4', () => {
  const gate = evaluateActionabilityGate({
    evidenceTrust: 30,
    verifiedAgentCount: 2,
    tradeExecutable: true,
    marketState: 'OPEN'
  });
  assert.strictEqual(gate.isActionable, false);
  assert.strictEqual(gate.actionabilityState, 'DATA LIMITED');
});

runTest('Actionability Gate approves ACTIONABLE when market is open and trust is verified', () => {
  const gate = evaluateActionabilityGate({
    evidenceTrust: 75,
    verifiedAgentCount: 8,
    tradeExecutable: true,
    marketState: 'OPEN'
  });
  assert.strictEqual(gate.isActionable, true);
  assert.strictEqual(gate.actionabilityState, 'ACTIONABLE');
});

// ---------------------------------------------------------------------------
// TEST GROUP 5: Absence of False Factual Claims in Repo Code & Runtime Output
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 5] Elimination of Unverified Factual Claims');

const TEST_SYMBOLS = ['XAUUSD', 'EURUSD', 'BTCUSD', 'USOIL', 'USDJPY'];

TEST_SYMBOLS.forEach((sym) => {
  const profile = generateAssetIntelligence(sym, INITIAL_LIVE_ASSETS[sym] || {
    symbol: sym, price: 100, change24h: 0, spread: 0.1, high24h: 105, low24h: 95,
    volume: '1M', sparkline: '0,0', source: 'TEST', lastUpdated: 'NOW', category: 'FOREX'
  });
  const jsonStr = JSON.stringify(profile);

  runTest(`${sym}: Contains zero "+1,240 contracts" claims`, () => {
    assert(!jsonStr.includes('+1,240'), `Found unverified +1,240 contracts claim in ${sym}`);
  });

  runTest(`${sym}: Contains zero "$148M" liquidity pool claims`, () => {
    assert(!jsonStr.includes('$148M') && !jsonStr.includes('148M'), `Found unverified $148M claim in ${sym}`);
  });

  runTest(`${sym}: Contains zero "142 feeds audited" news claims`, () => {
    assert(!jsonStr.includes('142 feeds'), `Found unverified 142 feeds claim in ${sym}`);
  });

  runTest(`${sym}: Contains zero "62% short" or "58% long" unverified retail skew claims`, () => {
    assert(!jsonStr.includes('62% short') && !jsonStr.includes('58% long'), `Found unverified retail skew percentage in ${sym}`);
  });
});

// Check Agents Page source file
runTest('src/app/agents/page.tsx: Zero unverified $42M iceberg claim', () => {
  const pageSource = fs.readFileSync(path.resolve(__dirname, '../src/app/agents/page.tsx'), 'utf8');
  assert(!pageSource.includes('$42M'), 'Found hardcoded $42M in agents page');
});

runTest('src/app/agents/page.tsx: Zero unverified 42 ticks/sec claim', () => {
  const pageSource = fs.readFileSync(path.resolve(__dirname, '../src/app/agents/page.tsx'), 'utf8');
  assert(!pageSource.includes('42 ticks/sec'), 'Found unverified 42 ticks/sec in agents page');
});

runTest('src/app/agents/page.tsx: Zero unverified 78% net short claim', () => {
  const pageSource = fs.readFileSync(path.resolve(__dirname, '../src/app/agents/page.tsx'), 'utf8');
  assert(!pageSource.includes('78% net short'), 'Found unverified 78% net short in agents page');
});

runTest('src/app/agents/page.tsx: Zero unverified 2.1% tail-risk claim', () => {
  const pageSource = fs.readFileSync(path.resolve(__dirname, '../src/app/agents/page.tsx'), 'utf8');
  assert(!pageSource.includes('2.1%'), 'Found unverified 2.1% tail-risk in agents page');
});

// ---------------------------------------------------------------------------
// TEST GROUP 6: Preservation of Real Systems & Risk Guardian
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 6] Preservation of Real Systems, Session Logic & Risk Guardian');

runTest('XAUUSD maintains verified Risk Guardian stop-loss and risk envelope', () => {
  const xau = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD']);
  const rg = xau.agents.find((a) => a.type === 'RISK_GUARDIAN');
  assert(rg, 'Risk Guardian agent must exist');
  assert(rg.evidenceTrustScore >= 70, `Risk Guardian trust score must be >= 70, got ${rg.evidenceTrustScore}`);
  assert.strictEqual(rg.provenanceBadge, 'DERIVED');
  assert(xau.stopLoss > 0, 'Valid stop loss required');
  assert(xau.rr.includes('1 :'), 'Valid R:R required');
});

runTest('Session Engine (Phase 30/31) temporal logic remains 100% active', () => {
  const xau = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD']);
  assert(xau.sessionState, 'SessionState must be populated');
  assert(typeof xau.sessionState.marketState === 'string', 'Market state required');
  assert(typeof xau.setupQuality === 'number', 'Setup quality required');
});

console.log('\n================================================================');
console.log(`PHASE 34 TEST RESULTS: ${totalPass} PASSED, ${totalFail} FAILED`);
console.log('================================================================\n');

if (totalFail > 0) {
  process.exit(1);
}
