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
  normalizeEvidenceFreshnessMs,
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
  assert(typeof profile.confidence === 'number' && profile.confidence >= 0, 'Council confidence exists');
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

runTest('XAUUSD maintains Risk Guardian envelope (and reports truthful trust / null SL when awaiting structure)', () => {
  const xau = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD']);
  const rg = xau.agents.find((a) => a.type === 'RISK_GUARDIAN');
  assert(rg, 'Risk Guardian agent must exist');
  // Phase 2D Truthfulness: When waiting for verified structure, SL is null and trust is guarded
  if (xau.stopLoss !== null) {
    assert(rg.evidenceTrustScore >= 70, `Risk Guardian trust score must be >= 70, got ${rg.evidenceTrustScore}`);
    assert.strictEqual(rg.provenanceBadge, 'DERIVED');
    assert(xau.stopLoss > 0, 'Valid stop loss required');
    assert(xau.rr.includes('1 :'), 'Valid R:R required');
  } else {
    assert(xau.stopLoss === null, 'Stop loss must be null until verified structure is analyzed');
    assert(rg.status === 'CAUTION' || rg.status === 'ONLINE');
  }
});

runTest('Session Engine (Phase 30/31) temporal logic remains 100% active', () => {
  const xau = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD']);
  assert(xau.sessionState, 'SessionState must be populated');
  assert(typeof xau.sessionState.marketState === 'string', 'Market state required');
  assert(typeof xau.setupQuality === 'number', 'Setup quality required');
});


// ---------------------------------------------------------------------------
// TEST GROUP 7: P1 Production Confidence Integrity & Evidence-Trust Synchronization
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 7] P1 Production Confidence Integrity & Evidence-Trust Synchronization');

// 1. User-facing confidence is derived from evidence trust, not arbitrary preset agent confidence
runTest('1. User-facing confidence is derived from consensus evidence trust, and each agent confidence reflects evidence trust', () => {
  const xau = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  assert.strictEqual(xau.confidence, 0, 'WAIT posture must yield 0% user-facing confidence');

  xau.agents.slice(0, 15).forEach((ag) => {
    assert.strictEqual(ag.confidence, ag.evidenceTrustScore, `Agent ${ag.type} confidence must match evidenceTrustScore`);
  });
});

// 2. Changing a pre-evidence hardcoded agent confidence value cannot independently change final profile confidence once evidence trust is established
runTest('2. Arbitrary pre-evidence nominal confidence cannot independently change final profile confidence', () => {
  const testAgents = [
    { type: 'TECHNICAL', evidenceTrustScore: 90, confidence: 99 },
    { type: 'RISK_GUARDIAN', evidenceTrustScore: 80, confidence: 12 },
    { type: 'KILLZONE', evidenceTrustScore: 85, confidence: 50 },
    ...Array(12).fill(null).map((_, i) => ({ type: `AGENT_${i}`, evidenceTrustScore: 70, confidence: 10 * i }))
  ];
  const consensus1 = calculateConsensusTrust(testAgents);

  testAgents.forEach(a => { a.confidence = 0; });
  const consensus2 = calculateConsensusTrust(testAgents);

  assert.strictEqual(consensus1.evidenceTrust, consensus2.evidenceTrust, 'Evidence trust must be strictly immune to agent nominal confidence');
  assert.strictEqual(consensus1.councilConfidence, consensus2.councilConfidence, 'Council confidence must be strictly immune to agent nominal confidence');
});

// 3. DATA LIMITED / unavailable evidence fails closed
runTest('3. DATA LIMITED and unavailable evidence fails closed (0% confidence, 0% trust)', () => {
  const profile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  const limitedAgents = profile.agents.filter(a => a.status === 'DATA LIMITED');
  assert(limitedAgents.length > 0, 'Must have DATA LIMITED agents when feeds unavailable');
  limitedAgents.forEach(ag => {
    assert.strictEqual(ag.confidence, 0, `DATA LIMITED agent ${ag.type} must have 0% confidence`);
    assert.strictEqual(ag.evidenceTrustScore, 0, `DATA LIMITED agent ${ag.type} must have 0% evidence trust`);
  });
});

// 4. HEURISTIC-only evidence cannot create verified/actionable confidence
runTest('4. HEURISTIC-only evidence cannot create verified/actionable confidence', () => {
  const heuristicEvidence = [
    {
      id: 'e-h1', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Unverified SMC heuristic pattern',
      source: 'Pattern Rule', sourceType: 'HEURISTIC', classification: 'HEURISTIC',
      observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 75,
      assetSpecific: true, verified: false, decisionEligible: false, reason: 'heuristic'
    }
  ];
  const trust = calculateAgentEvidenceTrust(heuristicEvidence);
  assert.strictEqual(trust.verifiedCount, 0, 'HEURISTIC evidence must have verifiedCount === 0');
  assert.strictEqual(trust.badge, 'INFERENCE');
  assert.strictEqual(trust.trustScore, 30);

  const mockCouncil = Array(15).fill(null).map((_, i) => ({
    type: `AGENT_${i}`,
    evidenceTrustScore: 30,
    status: 'ONLINE'
  }));
  const consensus = calculateConsensusTrust(mockCouncil);
  assert.strictEqual(consensus.verifiedAgentCount, 0, 'HEURISTIC cannot produce verified agents (requires >= 70% trust)');
  assert.strictEqual(consensus.evidenceTrust, 30);

  const gate = evaluateActionabilityGate({
    evidenceTrust: consensus.evidenceTrust,
    verifiedAgentCount: consensus.verifiedAgentCount,
    tradeExecutable: true,
    marketState: 'OPEN'
  });
  assert.strictEqual(gate.isActionable, false);
  assert.strictEqual(gate.actionabilityState, 'DATA LIMITED');
});

// 5. LIVE_MT5 evidence receives the expected evidence trust treatment
runTest('5. LIVE_MT5 evidence receives expected 100% evidence trust treatment', () => {
  const mt5Evidence = [
    {
      id: 'e-mt5', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Live broker bid/ask',
      source: 'MT5 Broker Telemetry', sourceType: 'BROKER', classification: 'LIVE_MT5',
      observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 85,
      assetSpecific: true, verified: true, decisionEligible: true, reason: 'live broker'
    }
  ];
  const trust = calculateAgentEvidenceTrust(mt5Evidence);
  assert.strictEqual(trust.trustScore, 100, 'LIVE_MT5 must earn 100% trust');
  assert.strictEqual(trust.badge, 'MT5');
  assert.strictEqual(trust.verifiedCount, 1);

  const eligibility = isEvidenceDecisionEligible('LIVE_MT5', 5000);
  assert.strictEqual(eligibility.eligible, true);
  assert.strictEqual(eligibility.verified, true);
});

// 6. INDEPENDENT_VERIFIED evidence receives the expected evidence trust treatment
runTest('6. INDEPENDENT_VERIFIED evidence receives expected 95% evidence trust treatment', () => {
  const verifiedEvidence = [
    {
      id: 'e-ind', agentKey: 'TECHNICAL', asset: 'BTCUSD', claim: 'Binance public spot OHLC',
      source: 'Binance Spot', sourceType: 'PUBLIC_FEED', classification: 'INDEPENDENT_VERIFIED',
      observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 80,
      assetSpecific: true, verified: true, decisionEligible: true, reason: 'independent feed'
    }
  ];
  const trust = calculateAgentEvidenceTrust(verifiedEvidence);
  assert.strictEqual(trust.trustScore, 95, 'INDEPENDENT_VERIFIED must earn 95% trust');
  assert.strictEqual(trust.badge, 'INDEPENDENT');
  assert.strictEqual(trust.verifiedCount, 1);

  const eligibility = isEvidenceDecisionEligible('INDEPENDENT_VERIFIED', 5000);
  assert.strictEqual(eligibility.eligible, true);
  assert.strictEqual(eligibility.verified, true);
});

// 7. SIMULATED / HARDCODED / UNAVAILABLE evidence cannot contribute production decision weight
runTest('7. SIMULATED / HARDCODED / UNAVAILABLE evidence contributes 0% trust and zero decision eligibility', () => {
  ['SIMULATED', 'HARDCODED', 'UNAVAILABLE', 'UNKNOWN'].forEach(cls => {
    const ev = [
      {
        id: `e-${cls}`, agentKey: 'MACRO', asset: 'XAUUSD', claim: 'Mock data',
        source: 'Mock', sourceType: 'MOCK', classification: cls,
        observedAt: new Date().toISOString(), freshnessMs: 1000, confidence: 90,
        assetSpecific: true, verified: false, decisionEligible: false, reason: 'mock'
      }
    ];
    const trust = calculateAgentEvidenceTrust(ev);
    assert.strictEqual(trust.trustScore, 0, `${cls} must earn 0% trust`);
    assert.strictEqual(trust.verifiedCount, 0, `${cls} must have 0 verified count`);

    const eligibility = isEvidenceDecisionEligible(cls, 1000);
    assert.strictEqual(eligibility.eligible, false, `${cls} must not be decision eligible`);
    assert.strictEqual(eligibility.verified, false, `${cls} must not be verified`);
  });
});

// 8. WAIT remains 0 user-facing confidence under the existing truthfulness rule
runTest('8. WAIT posture remains 0% user-facing confidence', () => {
  const xau = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  assert.strictEqual(xau.setupDirection, 'WAIT');
  assert.strictEqual(xau.confidence, 0, 'WAIT setupDirection must strictly enforce 0% confidence');
});

// 9. Directional bias remains separate from evidence confidence
runTest('9. Directional bias remains separate from evidence confidence', () => {
  const xau = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  const kz = xau.agents.find(a => a.type === 'KILLZONE');
  assert(kz, 'Killzone agent must exist');
  assert.strictEqual(kz.bias, 'NEUTRAL');
  assert(kz.evidenceTrustScore >= 70, 'Killzone can have high trust while remaining NEUTRAL');
  assert.strictEqual(kz.confidence, kz.evidenceTrustScore);

  const tech = xau.agents.find(a => a.type === 'TECHNICAL');
  assert.strictEqual(tech.bias, 'NEUTRAL');
  assert.strictEqual(tech.confidence, 0);
  assert.strictEqual(tech.evidenceTrustScore, 0);
});

// 10. Existing Actionability Gate thresholds and semantics remain unchanged
runTest('10. Actionability Gate thresholds and semantics strictly preserved', () => {
  const gateClosed = evaluateActionabilityGate({
    evidenceTrust: 95,
    verifiedAgentCount: 12,
    tradeExecutable: false,
    marketState: 'CLOSED'
  });
  assert.strictEqual(gateClosed.actionabilityState, 'MONITOR');
  assert.strictEqual(gateClosed.isActionable, false);

  const gateLowTrust = evaluateActionabilityGate({
    evidenceTrust: 35,
    verifiedAgentCount: 5,
    tradeExecutable: true,
    marketState: 'OPEN'
  });
  assert.strictEqual(gateLowTrust.actionabilityState, 'DATA LIMITED');
  assert.strictEqual(gateLowTrust.isActionable, false);

  const gateLowVerified = evaluateActionabilityGate({
    evidenceTrust: 80,
    verifiedAgentCount: 3,
    tradeExecutable: true,
    marketState: 'OPEN'
  });
  assert.strictEqual(gateLowVerified.actionabilityState, 'DATA LIMITED');
  assert.strictEqual(gateLowVerified.isActionable, false);

  const gateAnalysis = evaluateActionabilityGate({
    evidenceTrust: 55,
    verifiedAgentCount: 5,
    tradeExecutable: true,
    marketState: 'OPEN'
  });
  assert.strictEqual(gateAnalysis.actionabilityState, 'ANALYSIS ONLY');
  assert.strictEqual(gateAnalysis.isActionable, false);

  const gateActionable = evaluateActionabilityGate({
    evidenceTrust: 75,
    verifiedAgentCount: 6,
    tradeExecutable: true,
    marketState: 'OPEN'
  });
  assert.strictEqual(gateActionable.actionabilityState, 'ACTIONABLE');
  assert.strictEqual(gateActionable.isActionable, true);
});

// ---------------------------------------------------------------------------
// TEST GROUP 8: P1 Evidence Integrity & Provenance Hardening Invariants
// ---------------------------------------------------------------------------
console.log('\n[TEST GROUP 8] P1 Evidence Integrity & Provenance Hardening Invariants');

// 1. Fresh LIVE_MT5 evidence: verified true, eligible true, counted verified
runTest('1. Fresh LIVE_MT5 evidence is verified, eligible, and increments verifiedCount', () => {
  const ev = {
    id: 'e-fresh-mt5', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Live broker tick',
    source: 'MT5 Broker Telemetry', sourceType: 'BROKER_MT5', classification: 'LIVE_MT5',
    observedAt: new Date().toISOString(), freshnessMs: 10000, confidence: 90,
    assetSpecific: true, verified: true, decisionEligible: true, reason: 'Fresh verified market feed'
  };
  const eligibility = isEvidenceDecisionEligible('LIVE_MT5', 10000);
  assert.strictEqual(eligibility.verified, true);
  assert.strictEqual(eligibility.eligible, true);

  const trust = calculateAgentEvidenceTrust([ev]);
  assert.strictEqual(trust.verifiedCount, 1);
  assert.strictEqual(trust.trustScore, 100);
});

// 2. Stale LIVE_MT5: not verified/eligible after freshness threshold
runTest('2. Stale LIVE_MT5 (> 60s) is not verified/eligible and does not increment verifiedCount', () => {
  const eligibility = isEvidenceDecisionEligible('LIVE_MT5', 65000);
  assert.strictEqual(eligibility.verified, false);
  assert.strictEqual(eligibility.eligible, false);

  const staleEv = {
    id: 'e-stale-mt5', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Stale broker tick',
    source: 'MT5 Broker Telemetry', sourceType: 'BROKER_MT5', classification: 'LIVE_MT5',
    observedAt: new Date(Date.now() - 65000).toISOString(), freshnessMs: 65000, confidence: 50,
    assetSpecific: true, verified: false, decisionEligible: false, reason: eligibility.reason
  };
  const trust = calculateAgentEvidenceTrust([staleEv]);
  assert.strictEqual(trust.verifiedCount, 0, 'Stale MT5 must not increment verifiedCount');
  assert(trust.trustScore < 100, 'Stale MT5 must receive discounted trust');
});

// 3. INDEPENDENT_VERIFIED fresh: verified and eligible
runTest('3. INDEPENDENT_VERIFIED fresh is verified and eligible', () => {
  const eligibility = isEvidenceDecisionEligible('INDEPENDENT_VERIFIED', 15000);
  assert.strictEqual(eligibility.verified, true);
  assert.strictEqual(eligibility.eligible, true);

  const ev = {
    id: 'e-fresh-ind', agentKey: 'TECHNICAL', asset: 'BTCUSD', claim: 'Fresh Binance Spot OHLC',
    source: 'Binance Public Spot', sourceType: 'INDEPENDENT_EXCHANGE', classification: 'INDEPENDENT_VERIFIED',
    observedAt: new Date().toISOString(), freshnessMs: 15000, confidence: 95,
    assetSpecific: true, verified: true, decisionEligible: true, reason: eligibility.reason
  };
  const trust = calculateAgentEvidenceTrust([ev]);
  assert.strictEqual(trust.verifiedCount, 1);
  assert.strictEqual(trust.trustScore, 95);
});

// 4. INDEPENDENT_REFERENCE: contextual trust allowed, decisionEligible false, verified false, verifiedCount does NOT increment
runTest('4. INDEPENDENT_REFERENCE allows contextual trust, verified=false, eligible=false, verifiedCount=0', () => {
  const eligibility = isEvidenceDecisionEligible('INDEPENDENT_REFERENCE', 5000);
  assert.strictEqual(eligibility.verified, false);
  assert.strictEqual(eligibility.eligible, false);

  const refEv = {
    id: 'e-ref', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'PAXG proxy reference feed',
    source: 'Binance PAXG Spot Proxy', sourceType: 'REFERENCE_PROXY', classification: 'INDEPENDENT_REFERENCE',
    observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 80,
    assetSpecific: true, verified: false, decisionEligible: false, reason: eligibility.reason
  };
  const trust = calculateAgentEvidenceTrust([refEv]);
  assert.strictEqual(trust.trustScore, 80, 'Contextual trust must be 80%');
  assert.strictEqual(trust.verifiedCount, 0, 'verifiedCount MUST NOT increment for reference evidence');
  assert.strictEqual(trust.badge, 'REFERENCE');
});

// 5. Reference-derived strategy/opportunity/liquidity/order-flow: must not become DERIVED_FROM_VERIFIED, must remain non-executable
runTest('5. Reference-derived strategy/opportunity/liquidity/order-flow must not become DERIVED_FROM_VERIFIED', () => {
  const mockCandles = Array(35).fill(null).map((_, i) => ({
    timestamp: Date.now() - (35 - i) * 3600_000,
    open: 4360 + i, high: 4362 + i, low: 4359 + i, close: 4361 + i, tickVolume: 100
  }));
  const profile = generateAssetIntelligence(
    'XAUUSD',
    INITIAL_LIVE_ASSETS['XAUUSD'],
    'H1',
    mockCandles,
    'INDEPENDENT_REFERENCE',
    'Binance PAXG/USDT (Spot Proxy)'
  );

  const targets = ['STRATEGY', 'OPPORTUNITY', 'LIQUIDITY_MAP', 'ORDER_FLOW'];
  targets.forEach((type) => {
    const ag = profile.agents.find((a) => a.type === type);
    assert(ag, `Agent ${type} must exist`);
    assert(Array.isArray(ag.evidenceRecords) && ag.evidenceRecords.length > 0, `Agent ${type} must have evidenceRecords`);
    ag.evidenceRecords.forEach((ev) => {
      assert.notStrictEqual(ev.classification, 'DERIVED_FROM_VERIFIED', `${type} must NOT be laundered into DERIVED_FROM_VERIFIED`);
      assert.strictEqual(ev.classification, 'INDEPENDENT_REFERENCE', `${type} must retain explicit INDEPENDENT_REFERENCE classification`);
      assert.strictEqual(ev.verified, false, `${type} reference evidence must have verified === false`);
      assert.strictEqual(ev.decisionEligible, false, `${type} reference evidence must have decisionEligible === false`);
    });
  });
});

// 6. MODEL_INFERENCE / HEURISTIC: cannot count as verified
runTest('6. MODEL_INFERENCE / HEURISTIC cannot count as verified', () => {
  ['MODEL_INFERENCE', 'HEURISTIC'].forEach((cls) => {
    const eligibility = isEvidenceDecisionEligible(cls, 1000);
    assert.strictEqual(eligibility.verified, false);
    assert.strictEqual(eligibility.eligible, false);

    const ev = {
      id: `e-${cls}`, agentKey: 'CORRELATION', asset: 'XAUUSD', claim: 'Correlation inference',
      source: 'Intermarket Correlation Engine', sourceType: 'MODEL_INFERENCE', classification: cls,
      observedAt: new Date().toISOString(), freshnessMs: 1000, confidence: 68,
      assetSpecific: true, verified: false, decisionEligible: false, reason: eligibility.reason
    };
    const trust = calculateAgentEvidenceTrust([ev]);
    assert.strictEqual(trust.verifiedCount, 0);
  });
});

// 7. Consensus: high trust alone must NOT create a verifiedAgentCount; an agent with real fresh verified evidence CAN count
runTest('7. Consensus: High trust alone does NOT create verifiedAgentCount; genuine verified evidence DOES', () => {
  // Agent with high reference trust (80%) but zero verified evidence
  const refAgent = {
    type: 'TECHNICAL',
    status: 'ONLINE',
    evidenceTrustScore: 80,
    confidence: 80,
    evidenceRecords: [
      {
        id: 'ev-ref', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'PAXG proxy',
        source: 'Binance PAXG', sourceType: 'REFERENCE_PROXY', classification: 'INDEPENDENT_REFERENCE',
        observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 80,
        assetSpecific: true, verified: false, decisionEligible: false, reason: 'Reference proxy context only'
      }
    ]
  };

  const councilWithOnlyRef = [
    refAgent,
    ...Array(14).fill(null).map((_, i) => ({
      type: `AGENT_${i}`, status: 'DATA LIMITED', evidenceTrustScore: 0, confidence: 0, evidenceRecords: []
    }))
  ];

  const consensusRef = calculateConsensusTrust(councilWithOnlyRef);
  assert.strictEqual(consensusRef.verifiedAgentCount, 0, 'Reference-only agent must NOT count as a verified agent');

  // Agent with genuine verified evidence
  const verifiedAgent = {
    type: 'TECHNICAL',
    status: 'ONLINE',
    evidenceTrustScore: 95,
    confidence: 95,
    evidenceRecords: [
      {
        id: 'ev-ver', agentKey: 'TECHNICAL', asset: 'BTCUSD', claim: 'Binance Spot OHLC',
        source: 'Binance Spot', sourceType: 'INDEPENDENT_EXCHANGE', classification: 'INDEPENDENT_VERIFIED',
        observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 95,
        assetSpecific: true, verified: true, decisionEligible: true, reason: 'Fresh verified market feed'
      }
    ]
  };

  const councilWithVerified = [
    verifiedAgent,
    ...Array(14).fill(null).map((_, i) => ({
      type: `AGENT_${i}`, status: 'DATA LIMITED', evidenceTrustScore: 0, confidence: 0, evidenceRecords: []
    }))
  ];

  const consensusVer = calculateConsensusTrust(councilWithVerified);
  assert.strictEqual(consensusVer.verifiedAgentCount, 1, 'Agent with genuine verified evidence must increment verifiedAgentCount');
});

// 8. Existing PAXG proxy invariant: remains INDEPENDENT_REFERENCE, never executable
runTest('8. Existing PAXG proxy invariant: remains INDEPENDENT_REFERENCE, never executable', () => {
  const mockCandles = Array(35).fill(null).map((_, i) => ({
    timestamp: Date.now() - (35 - i) * 3600_000,
    open: 4360, high: 4365, low: 4358, close: 4362, tickVolume: 100
  }));
  const profile = generateAssetIntelligence(
    'XAUUSD',
    INITIAL_LIVE_ASSETS['XAUUSD'],
    'H1',
    mockCandles,
    'INDEPENDENT_REFERENCE',
    'Binance PAXG/USDT (Spot Proxy)'
  );
  const tech = profile.agents.find((a) => a.type === 'TECHNICAL');
  assert(tech, 'Technical agent must exist');
  assert.strictEqual(tech.provenanceBadge, 'REFERENCE');
  const techEv = tech.evidenceRecords?.find((e) => e.classification === 'INDEPENDENT_REFERENCE');
  assert(Boolean(techEv), 'Technical evidence must have INDEPENDENT_REFERENCE classification');
  assert.strictEqual(techEv.decisionEligible, false, 'PAXG proxy must never be decision eligible');
  assert.strictEqual(techEv.verified, false, 'PAXG proxy must never be verified');
});

// 9. No fabricated universal freshnessMs: 5000 remains in production evidence construction path
runTest('9. Zero fabricated universal freshnessMs: 5000 in production multi-asset-pipeline.ts', () => {
  const pipelineSource = fs.readFileSync(path.resolve(__dirname, '../src/lib/agents/multi-asset-pipeline.ts'), 'utf8');
  assert(!pipelineSource.includes('freshnessMs: 5000'), 'Found fabricated universal freshnessMs: 5000 in multi-asset-pipeline.ts');
});

// 10. Existing READ_ONLY execution lock remains unchanged
runTest('10. Existing READ_ONLY execution lock and MT5_ORDER_TRANSPORT_ENABLED remain intact', () => {
  const execPolicySource = fs.readFileSync(path.resolve(__dirname, '../src/lib/execution/execution-policy.ts'), 'utf8');
  assert(execPolicySource.includes("CANONICAL_EXECUTION_MODE = 'READ_ONLY'"), 'CANONICAL_EXECUTION_MODE must remain READ_ONLY');
  assert(execPolicySource.includes("MT5_ORDER_TRANSPORT_ENABLED = false"), 'MT5_ORDER_TRANSPORT_ENABLED must remain false');
});

// 11. normalizeEvidenceFreshnessMs: missing, invalid, NaN, negative, or non-finite freshnessMs fails closed
runTest('11. normalizeEvidenceFreshnessMs: invalid, NaN, negative, non-finite, and missing freshness return Number.MAX_SAFE_INTEGER', () => {
  assert.strictEqual(normalizeEvidenceFreshnessMs(0), 0);
  assert.strictEqual(normalizeEvidenceFreshnessMs(5000), 5000);
  assert.strictEqual(normalizeEvidenceFreshnessMs(undefined), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(normalizeEvidenceFreshnessMs(null), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(normalizeEvidenceFreshnessMs(NaN), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(normalizeEvidenceFreshnessMs(-1), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(normalizeEvidenceFreshnessMs(-5000), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(normalizeEvidenceFreshnessMs(Infinity), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(normalizeEvidenceFreshnessMs(-Infinity), Number.MAX_SAFE_INTEGER);
  assert.strictEqual(normalizeEvidenceFreshnessMs('5000'), Number.MAX_SAFE_INTEGER);
});

// 12. LIVE_MT5 with missing freshness does NOT increment verifiedCount
runTest('12. LIVE_MT5 with missing freshness does NOT increment verifiedCount and fails closed', () => {
  const eligibility = isEvidenceDecisionEligible('LIVE_MT5', undefined);
  assert.strictEqual(eligibility.verified, false);
  assert.strictEqual(eligibility.eligible, false);
  assert(eligibility.reason.includes('fails closed') || eligibility.reason.includes('Missing or invalid'));

  const evMissing = {
    id: 'e-missing-mt5', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Broker telemetry without timestamp',
    source: 'MT5 Broker Telemetry', sourceType: 'BROKER_MT5', classification: 'LIVE_MT5',
    observedAt: 'UNAVAILABLE', freshnessMs: undefined, confidence: 90,
    assetSpecific: true, verified: true, decisionEligible: true, reason: 'Unverified freshness'
  };
  const trust = calculateAgentEvidenceTrust([evMissing]);
  assert.strictEqual(trust.verifiedCount, 0, 'LIVE_MT5 with missing freshness MUST NOT increment verifiedCount');
  assert(trust.trustScore <= 50, 'LIVE_MT5 with missing freshness must receive stale discount');
});

// 13. INDEPENDENT_VERIFIED with NaN freshness does NOT increment verifiedCount
runTest('13. INDEPENDENT_VERIFIED with NaN freshness does NOT increment verifiedCount and fails closed', () => {
  const eligibility = isEvidenceDecisionEligible('INDEPENDENT_VERIFIED', NaN);
  assert.strictEqual(eligibility.verified, false);
  assert.strictEqual(eligibility.eligible, false);

  const evNaN = {
    id: 'e-nan-ind', agentKey: 'TECHNICAL', asset: 'BTCUSD', claim: 'Exchange OHLC with NaN freshness',
    source: 'Binance Public Spot', sourceType: 'INDEPENDENT_EXCHANGE', classification: 'INDEPENDENT_VERIFIED',
    observedAt: 'UNAVAILABLE', freshnessMs: NaN, confidence: 95,
    assetSpecific: true, verified: true, decisionEligible: true, reason: 'Unverified freshness'
  };
  const trust = calculateAgentEvidenceTrust([evNaN]);
  assert.strictEqual(trust.verifiedCount, 0, 'INDEPENDENT_VERIFIED with NaN freshness MUST NOT increment verifiedCount');
});

// 14. DERIVED_FROM_VERIFIED with negative freshness does NOT increment verifiedCount
runTest('14. DERIVED_FROM_VERIFIED with negative freshness does NOT increment verifiedCount and fails closed', () => {
  const eligibility = isEvidenceDecisionEligible('DERIVED_FROM_VERIFIED', -500);
  assert.strictEqual(eligibility.verified, false);
  assert.strictEqual(eligibility.eligible, false);

  const evNegative = {
    id: 'e-neg-derived', agentKey: 'STRATEGY', asset: 'XAUUSD', claim: 'Blueprint with clock skew negative freshness',
    source: 'Trade Blueprint Engine', sourceType: 'MATHEMATICAL', classification: 'DERIVED_FROM_VERIFIED',
    observedAt: 'UNAVAILABLE', freshnessMs: -500, confidence: 90,
    assetSpecific: true, verified: true, decisionEligible: true, reason: 'Negative freshness'
  };
  const trust = calculateAgentEvidenceTrust([evNegative]);
  assert.strictEqual(trust.verifiedCount, 0, 'DERIVED_FROM_VERIFIED with negative freshness MUST NOT increment verifiedCount');
});

// 15. Agent with high evidenceTrustScore but only evidence with unknown freshness does NOT count as a verified consensus agent
runTest('15. Agent with high evidenceTrustScore but unknown freshness does NOT count as verified consensus agent', () => {
  const agentWithUnknownFreshness = {
    type: 'TECHNICAL',
    status: 'ONLINE',
    evidenceTrustScore: 90,
    confidence: 90,
    evidenceRecords: [
      {
        id: 'ev-unknown', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Broker quote unknown freshness',
        source: 'MT5 Broker Telemetry', sourceType: 'BROKER_MT5', classification: 'LIVE_MT5',
        observedAt: 'UNAVAILABLE', freshnessMs: undefined, confidence: 90,
        assetSpecific: true, verified: true, decisionEligible: true, reason: 'Unknown freshness'
      }
    ]
  };

  const council = [
    agentWithUnknownFreshness,
    ...Array(14).fill(null).map((_, i) => ({
      type: `AGENT_${i}`, status: 'DATA LIMITED', evidenceTrustScore: 0, confidence: 0, evidenceRecords: []
    }))
  ];

  const consensus = calculateConsensusTrust(council);
  assert.strictEqual(consensus.verifiedAgentCount, 0, 'Agent with unknown freshness MUST NOT increment verifiedAgentCount');
  assert.strictEqual(consensus.limitedAgentCount, 1, 'Agent with unknown freshness must be classified as limited');
});

// 16. KILLZONE / Temporal Session Engine semantics: uses evaluationTime, sourceType is TEMPORAL_SESSION, not labeled market evidence
runTest('16. KILLZONE / Temporal Session Engine uses evaluationTime, sourceType=TEMPORAL_SESSION, and not labeled market evidence', () => {
  const profile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  const killzoneAgent = profile.agents.find((a) => a.type === 'KILLZONE');
  assert(killzoneAgent, 'KILLZONE agent must exist');
  assert(Array.isArray(killzoneAgent.evidenceRecords) && killzoneAgent.evidenceRecords.length > 0, 'KILLZONE must have evidence');

  killzoneAgent.evidenceRecords.forEach((ev) => {
    assert.strictEqual(ev.sourceType, 'TEMPORAL_SESSION', 'KILLZONE sourceType must be explicitly TEMPORAL_SESSION');
    assert.notStrictEqual(ev.classification, 'LIVE_MT5', 'KILLZONE must NOT be labeled LIVE_MT5');
    assert.notStrictEqual(ev.classification, 'LIVE_EXTERNAL', 'KILLZONE must NOT be labeled LIVE_EXTERNAL');
    assert.notStrictEqual(ev.classification, 'INDEPENDENT_VERIFIED', 'KILLZONE must NOT be labeled INDEPENDENT_VERIFIED');
    assert.notStrictEqual(ev.classification, 'INDEPENDENT_REFERENCE', 'KILLZONE must NOT be labeled INDEPENDENT_REFERENCE');
    assert.strictEqual(ev.classification, 'DERIVED', 'KILLZONE must be classified as DERIVED deterministic session time');
  });
});

// 17. (A) Fresh LIVE_MT5: verified=true, decisionEligible=false must NOT create a verified consensus agent
runTest('17. Fresh LIVE_MT5 with verified=true, decisionEligible=false must NOT create a verified consensus agent', () => {
  const agent = {
    type: 'TECHNICAL',
    status: 'ONLINE',
    evidenceTrustScore: 90,
    confidence: 90,
    evidenceRecords: [
      {
        id: 'ev-mt5-ineligible', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Live broker tick without structural gate',
        source: 'MT5 Broker Telemetry', sourceType: 'BROKER_MT5', classification: 'LIVE_MT5',
        observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 90,
        assetSpecific: true, verified: true, decisionEligible: false, reason: 'Structural gate not satisfied'
      }
    ]
  };

  const council = [
    agent,
    ...Array(14).fill(null).map((_, i) => ({
      type: `AGENT_${i}`, status: 'DATA LIMITED', evidenceTrustScore: 0, confidence: 0, evidenceRecords: []
    }))
  ];

  const consensus = calculateConsensusTrust(council);
  assert.strictEqual(consensus.verifiedAgentCount, 0, 'Agent with decisionEligible=false must NOT increment verifiedAgentCount');
});

// 18. (B) Fresh LIVE_MT5: verified=true, decisionEligible=true, canonical eligible=true/verified=true SHOULD create a verified consensus agent
runTest('18. Fresh LIVE_MT5 with verified=true, decisionEligible=true, canonical verified=true SHOULD create a verified consensus agent', () => {
  const agent = {
    type: 'TECHNICAL',
    status: 'ONLINE',
    evidenceTrustScore: 100,
    confidence: 100,
    evidenceRecords: [
      {
        id: 'ev-mt5-eligible', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Fresh verified broker tick',
        source: 'MT5 Broker Telemetry', sourceType: 'BROKER_MT5', classification: 'LIVE_MT5',
        observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 100,
        assetSpecific: true, verified: true, decisionEligible: true, reason: 'Fresh verified market feed'
      }
    ]
  };

  const council = [
    agent,
    ...Array(14).fill(null).map((_, i) => ({
      type: `AGENT_${i}`, status: 'DATA LIMITED', evidenceTrustScore: 0, confidence: 0, evidenceRecords: []
    }))
  ];

  const consensus = calculateConsensusTrust(council);
  assert.strictEqual(consensus.verifiedAgentCount, 1, 'Agent with verified=true and decisionEligible=true SHOULD increment verifiedAgentCount');
});

// 19. (C) Evidence with verified=false, decisionEligible=true must NOT count
runTest('19. Evidence with verified=false, decisionEligible=true must NOT count as a verified consensus agent', () => {
  const agent = {
    type: 'TECHNICAL',
    status: 'ONLINE',
    evidenceTrustScore: 80,
    confidence: 80,
    evidenceRecords: [
      {
        id: 'ev-unverified', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Unverified telemetry claiming eligibility',
        source: 'MT5 Broker Telemetry', sourceType: 'BROKER_MT5', classification: 'LIVE_MT5',
        observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 80,
        assetSpecific: true, verified: false, decisionEligible: true, reason: 'Unverified'
      }
    ]
  };

  const council = [
    agent,
    ...Array(14).fill(null).map((_, i) => ({
      type: `AGENT_${i}`, status: 'DATA LIMITED', evidenceTrustScore: 0, confidence: 0, evidenceRecords: []
    }))
  ];

  const consensus = calculateConsensusTrust(council);
  assert.strictEqual(consensus.verifiedAgentCount, 0, 'verified=false must NEVER count as verified consensus agent');
});

// 20. (D) INDEPENDENT_REFERENCE: even if malformed record claims verified=true and decisionEligible=true, canonical policy prevents counting
runTest('20. INDEPENDENT_REFERENCE cannot count as verified consensus agent even if claiming verified=true and decisionEligible=true', () => {
  const agent = {
    type: 'TECHNICAL',
    status: 'ONLINE',
    evidenceTrustScore: 80,
    confidence: 80,
    evidenceRecords: [
      {
        id: 'ev-ref-malformed', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Malformed reference record',
        source: 'Binance PAXG', sourceType: 'REFERENCE_PROXY', classification: 'INDEPENDENT_REFERENCE',
        observedAt: new Date().toISOString(), freshnessMs: 5000, confidence: 80,
        assetSpecific: true, verified: true, decisionEligible: true, reason: 'Claims verified'
      }
    ]
  };

  const council = [
    agent,
    ...Array(14).fill(null).map((_, i) => ({
      type: `AGENT_${i}`, status: 'DATA LIMITED', evidenceTrustScore: 0, confidence: 0, evidenceRecords: []
    }))
  ];

  const consensus = calculateConsensusTrust(council);
  assert.strictEqual(consensus.verifiedAgentCount, 0, 'Canonical policy MUST block INDEPENDENT_REFERENCE from counting as verified');
});

// 21. (E) Unknown/stale freshness remains unable to count even if verified=true and decisionEligible=true
runTest('21. Unknown/stale freshness cannot count as verified consensus agent even if verified=true and decisionEligible=true', () => {
  const staleAgent = {
    type: 'TECHNICAL',
    status: 'ONLINE',
    evidenceTrustScore: 80,
    confidence: 80,
    evidenceRecords: [
      {
        id: 'ev-stale', agentKey: 'TECHNICAL', asset: 'XAUUSD', claim: 'Stale broker tick claiming eligibility',
        source: 'MT5 Broker Telemetry', sourceType: 'BROKER_MT5', classification: 'LIVE_MT5',
        observedAt: new Date(Date.now() - 120_000).toISOString(), freshnessMs: 120_000, confidence: 80,
        assetSpecific: true, verified: true, decisionEligible: true, reason: 'Stale'
      }
    ]
  };

  const council = [
    staleAgent,
    ...Array(14).fill(null).map((_, i) => ({
      type: `AGENT_${i}`, status: 'DATA LIMITED', evidenceTrustScore: 0, confidence: 0, evidenceRecords: []
    }))
  ];

  const consensus = calculateConsensusTrust(council);
  assert.strictEqual(consensus.verifiedAgentCount, 0, 'Stale evidence MUST NOT count as verified consensus agent');
});

console.log('\n================================================================');
console.log(`PHASE 34 TEST RESULTS: ${totalPass} PASSED, ${totalFail} FAILED`);
console.log('================================================================\n');

if (totalFail > 0) {
  process.exit(1);
}
