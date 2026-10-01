/**
 * FEF CORTEX — TRUTHFULNESS HARDENING REGRESSION TEST SUITE
 * 
 * Verifies all 12 truthfulness invariants from the hardening pass:
 * 1. Missing debateMessages produces empty array in getTruthfulLiveMessages (no synthetic fallback)
 * 2. Empty debateMessages produces empty array in getTruthfulLiveMessages (no synthetic fallback)
 * 3. BTC, EURUSD, and non-XAU assets contain zero gold/XAU leakage in orchestrator or debate
 * 4. DATA LIMITED status cannot be mapped to BULLISH by orchestrator
 * 5. NEUTRAL status cannot be mapped to BULLISH by orchestrator
 * 6. Missing/NaN spread does not default to 1.2
 * 7. Missing ATR data does not claim "35% above average"
 * 8. Risk validation text does not claim "Within Risk Limits" without blueprint validation
 * 9. Consensus confidence remains derived from evidence trust
 * 10. HEURISTIC/SIMULATED/HARDCODED/UNAVAILABLE evidence cannot become verified execution evidence
 * 11. Directional WATCH semantics remain distinct from actionability
 * 12. Canonical execution mode is READ_ONLY and MT5_ORDER_TRANSPORT_ENABLED is false
 */

const fs = require('fs');
const assert = require('assert');
const ts = require('typescript');

// Register TypeScript on-the-fly compiler
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};

const { getTruthfulLiveMessages, evaluateTradingRisk } = require('../src/lib/agents/hub-animation-engine.ts');
const { FEFAIOrchestrator } = require('../src/lib/agents/fef-orchestrator.ts');
const { calculateConsensusTrust, calculateAgentEvidenceTrust, isEvidenceDecisionEligible, evaluateActionabilityGate } = require('../src/lib/evidence/agent-evidence.ts');
const { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } = require('../src/lib/execution/execution-policy.ts');

console.log('=================================================================');
console.log('FEF CORTEX: TRUTHFULNESS HARDENING TEST SUITE');
console.log('=================================================================\n');

let passedCount = 0;
function pass(msg) {
  passedCount++;
  console.log(`  ✅ PASS: ${msg}`);
}

// 1. Missing debateMessages produces empty array in getTruthfulLiveMessages
{
  const profileWithoutDebate = {
    symbol: 'EURUSD',
    agents: []
  };
  const msgs = getTruthfulLiveMessages(profileWithoutDebate);
  assert.strictEqual(Array.isArray(msgs), true);
  assert.strictEqual(msgs.length, 0, 'Must return empty array when debateMessages is missing');
  pass('Missing debateMessages returns empty array (zero synthetic messages)');
}

// 2. Empty debateMessages produces empty array in getTruthfulLiveMessages
{
  const profileWithEmptyDebate = {
    symbol: 'EURUSD',
    debateMessages: [],
    agents: []
  };
  const msgs = getTruthfulLiveMessages(profileWithEmptyDebate);
  assert.strictEqual(Array.isArray(msgs), true);
  assert.strictEqual(msgs.length, 0, 'Must return empty array when debateMessages is empty');
  pass('Empty debateMessages returns empty array (zero synthetic fallback)');
}

// 3. BTC, EURUSD, and non-XAU assets contain zero gold/XAU leakage in orchestrator or debate
{
  const orchestrator = new FEFAIOrchestrator();
  assert.strictEqual(orchestrator.getMessages().length, 0, 'Fresh orchestrator must have empty messages, no default gold messages');

  const btcProfile = {
    symbol: 'BTCUSD',
    regime: 'RANGING',
    session: '24/7 Crypto',
    confidence: 0,
    setupDirection: 'WAIT',
    stopLoss: null,
    whyThisTrade: ['Crypto market ranging', 'Telemetry active'],
    agents: [
      { name: 'Technical Agent', type: 'TECHNICAL', bias: 'NEUTRAL', status: 'ONLINE', confidence: 0, evidence: ['BTC rangebound'] },
      { name: 'Macro Agent', type: 'MACRO', bias: 'DATA LIMITED', status: 'DATA LIMITED', confidence: 0, evidence: [] }
    ],
    debateMessages: [
      { time: '12:00:00', agent: 'TECHNICAL AGENT', text: 'BTCUSD M15 structure neutral.', status: 'NEUTRAL' },
      { time: '12:00:00', agent: 'MACRO AGENT', text: 'No live macro indicators matched for BTCUSD.', status: 'DATA LIMITED' }
    ]
  };

  orchestrator.syncWithActiveAsset('BTCUSD', 65000.0, 5.0, 1.2, btcProfile);
  const msgs = orchestrator.getMessages();
  assert.strictEqual(msgs.length, 2);
  msgs.forEach(m => {
    assert.strictEqual(m.observation.includes('4341.20'), false, 'BTC messages must not leak gold price 4341.20');
    assert.strictEqual(m.observation.includes('XAU'), false, 'BTC messages must not mention XAU');
    assert.strictEqual(m.observation.includes('Gold'), false, 'BTC messages must not mention Gold');
    assert.strictEqual(m.observation.includes('Silver'), false, 'BTC messages must not mention Silver');
    assert.strictEqual(m.observation.includes('DXY'), false, 'BTC messages must not mention DXY');
  });
  pass('Non-gold asset (BTCUSD) contains zero XAU/Gold leakage in messages or observations');
}

// 4. DATA LIMITED status cannot be mapped to BULLISH by orchestrator
{
  const orchestrator = new FEFAIOrchestrator();
  const testProfile = {
    symbol: 'EURUSD',
    regime: 'CONSOLIDATION',
    session: 'London',
    confidence: 0,
    setupDirection: 'WAIT',
    whyThisTrade: ['Testing bias truthfulness'],
    agents: [
      { name: 'News Agent', type: 'NEWS', bias: 'NEUTRAL', status: 'DATA LIMITED', confidence: 0, evidenceTrustScore: 0 }
    ],
    debateMessages: [
      { time: '10:00:00', agent: 'NEWS AGENT', text: 'News feed offline.', status: 'DATA LIMITED' }
    ]
  };
  orchestrator.syncWithActiveAsset('EURUSD', 1.0850, 0.5, 0.1, testProfile);
  const msgs = orchestrator.getMessages();
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].bias, 'DATA LIMITED', 'DATA LIMITED debate message must map to DATA LIMITED bias, never BULLISH');
  assert.strictEqual(msgs[0].confidence, 0, 'DATA LIMITED message must have 0 confidence');
  pass('DATA LIMITED status correctly maps to DATA LIMITED bias (never BULLISH)');
}

// 5. NEUTRAL status cannot be mapped to BULLISH by orchestrator
{
  const orchestrator = new FEFAIOrchestrator();
  const testProfile = {
    symbol: 'EURUSD',
    regime: 'CONSOLIDATION',
    session: 'London',
    confidence: 30,
    setupDirection: 'WAIT',
    whyThisTrade: ['Testing neutral bias truthfulness'],
    agents: [
      { name: 'Technical Agent', type: 'TECHNICAL', bias: 'NEUTRAL', status: 'ONLINE', confidence: 30, evidenceTrustScore: 30 }
    ],
    debateMessages: [
      { time: '10:00:00', agent: 'TECHNICAL AGENT', text: 'Market in balance.', status: 'NEUTRAL' }
    ]
  };
  orchestrator.syncWithActiveAsset('EURUSD', 1.0850, 0.5, 0.1, testProfile);
  const msgs = orchestrator.getMessages();
  assert.strictEqual(msgs.length, 1);
  assert.strictEqual(msgs[0].bias, 'NEUTRAL', 'NEUTRAL debate message must map to NEUTRAL bias, never BULLISH');
  pass('NEUTRAL status correctly maps to NEUTRAL bias (never BULLISH)');
}

// 6. Missing/NaN/negative spread does not default to 1.2 and becomes DATA LIMITED
{
  const mockProfile = {
    symbol: 'GBPUSD',
    tradeExecutable: true,
    volatility: 'LOW',
    agents: [
      { name: 'Risk Guardian', type: 'RISK_GUARDIAN', bias: 'ARMED', status: 'ONLINE', confidence: 80 }
    ],
    setupDirection: 'WAIT'
  };
  const riskNaN = evaluateTradingRisk(mockProfile, NaN, true);
  assert.strictEqual(riskNaN.spreadStatus, 'DATA LIMITED', 'NaN spread must report DATA LIMITED spreadStatus');
  assert.strictEqual(riskNaN.spreadDetail, 'Spread: DATA LIMITED / UNAVAILABLE', 'NaN spread must report DATA LIMITED, never 1.2');
  assert.strictEqual(riskNaN.spreadDetail.includes('1.2'), false);
  assert.notStrictEqual(riskNaN.level, 'HIGH', 'DATA LIMITED spread must not automatically become HIGH market risk');

  const riskInf = evaluateTradingRisk(mockProfile, Infinity, true);
  assert.strictEqual(riskInf.spreadStatus, 'DATA LIMITED', 'Infinity spread must report DATA LIMITED');
  assert.notStrictEqual(riskInf.level, 'HIGH', 'Infinity spread must not escalate to HIGH risk directly');

  const riskNegInf = evaluateTradingRisk(mockProfile, -Infinity, true);
  assert.strictEqual(riskNegInf.spreadStatus, 'DATA LIMITED', '-Infinity spread must report DATA LIMITED');

  const riskMissing = evaluateTradingRisk(mockProfile, undefined, true);
  assert.strictEqual(riskMissing.spreadStatus, 'DATA LIMITED', 'Missing spread must report DATA LIMITED spreadStatus');
  assert.notStrictEqual(riskMissing.level, 'HIGH', 'Missing spread must not escalate to HIGH risk directly');

  const riskNegative = evaluateTradingRisk(mockProfile, -1.0, true);
  assert.strictEqual(riskNegative.spreadStatus, 'DATA LIMITED', 'Negative spread must report DATA LIMITED spreadStatus');
  assert.notStrictEqual(riskNegative.level, 'HIGH', 'Negative spread must not escalate to HIGH risk directly');

  const riskZero = evaluateTradingRisk(mockProfile, 0, true);
  assert.strictEqual(riskZero.spreadStatus, 'NORMAL', 'Zero spread must remain NORMAL');
  assert.strictEqual(riskZero.spreadDetail.includes('0.0 pips'), true, 'Zero spread must be preserved legitimately');

  const riskElevated = evaluateTradingRisk(mockProfile, 3.0, true);
  assert.strictEqual(riskElevated.spreadStatus, 'ELEVATED');

  const riskWide = evaluateTradingRisk(mockProfile, 4.5, true);
  assert.strictEqual(riskWide.spreadStatus, 'WIDE');
  pass('Missing, NaN, Infinity, or negative spread fails closed to DATA LIMITED; zero spread preserved as NORMAL; data-limited spread does not become HIGH risk');
}

// 7. Missing ATR data does not claim "35% above average" or mention ATR
{
  const mockProfileNormal = {
    symbol: 'EURUSD',
    volatility: 'NORMAL',
    agents: [],
    setupDirection: 'WAIT'
  };
  const riskNormal = evaluateTradingRisk(mockProfileNormal, 1.0, true);
  assert.strictEqual(riskNormal.volatilityDetail.includes('35%'), false, 'Normal volatility must not contain fake 35% text');
  assert.strictEqual(riskNormal.volatilityDetail.includes('ATR'), false, 'Normal volatility must not fabricate ATR claims');
  assert.strictEqual(riskNormal.volatilityDetail, 'Normal volatility regime detected');

  const mockProfileHigh = {
    symbol: 'EURUSD',
    volatility: 'HIGH',
    agents: [],
    setupDirection: 'WAIT'
  };
  const riskHigh = evaluateTradingRisk(mockProfileHigh, 1.0, true);
  assert.strictEqual(riskHigh.volatilityDetail.includes('35%'), false, 'High volatility must not contain fake 35% text');
  assert.strictEqual(riskHigh.volatilityDetail.includes('ATR'), false, 'High volatility must not fabricate ATR claims');
  assert.strictEqual(riskHigh.volatilityDetail, 'Elevated volatility regime detected');
  pass('Missing ATR data does not invent ATR values, bounds, or "35% above average" text');
}

// 8. Risk validation text does not claim "Within Risk Limits" or "clear for blueprint execution"
{
  const mockProfileNoBlueprint = {
    symbol: 'EURUSD',
    tradeExecutable: true,
    volatility: 'LOW',
    agents: [],
    setupDirection: 'WAIT'
  };
  const riskNoBp = evaluateTradingRisk(mockProfileNoBlueprint, 1.0, true);
  assert.strictEqual(riskNoBp.positionCheck.includes('Within Risk Limits'), false, 'Without blueprint, cannot claim Within Risk Limits');
  assert.strictEqual(riskNoBp.positionCheck, 'Awaiting validated position sizing');
  assert.strictEqual(riskNoBp.summary.includes('All confluence checks clear'), false, 'Summary cannot claim confluence checks clear without actionable blueprint');

  const mockProfileWithBp = {
    symbol: 'AUDCAD',
    tradeExecutable: true,
    volatility: 'LOW',
    actionabilityState: 'ACTIONABLE',
    blueprint: { sl: { price: 1.0800 } },
    agents: [
      { name: 'Risk Guardian', type: 'RISK_GUARDIAN', bias: 'NEUTRAL', status: 'ONLINE', confidence: 80 }
    ],
    setupDirection: 'WATCH FOR BUY'
  };
  const riskWithBp = evaluateTradingRisk(mockProfileWithBp, 1.0, true);
  assert.strictEqual(riskWithBp.positionCheck.includes('Structural Stop Pegged (1.08)'), true);
  assert.strictEqual(riskWithBp.summary.includes('clear for blueprint execution'), false, 'Must never say clear for blueprint execution');
  assert.strictEqual(riskWithBp.summary.includes('Execution remains READ-ONLY'), true, 'Summary must explicitly preserve READ-ONLY execution boundary');
  pass('Risk check and summary truthfully preserve READ-ONLY and await validation');
}

// 9. Consensus confidence remains derived from evidence trust
{
  const mockAgents = Array.from({ length: 15 }, (_, i) => ({
    name: `Agent ${i + 1}`,
    type: 'TECHNICAL',
    bias: 'BULLISH',
    status: 'ONLINE',
    confidence: 90, // nominal confidence 90
    evidenceTrustScore: 40, // verified evidence trust 40
    evidenceRecords: []
  }));

  const metrics = calculateConsensusTrust(mockAgents);
  assert.strictEqual(metrics.councilConfidence, 40, 'Council confidence must equal average evidenceTrustScore (40), not nominal confidence (90)');
  assert.strictEqual(metrics.evidenceTrust, 40);
  assert.strictEqual(metrics.councilDirection, undefined, 'councilDirection field must be deleted');
  pass('Consensus confidence remains derived strictly from evidence trust, dead councilDirection removed');
}

// 10. HEURISTIC/SIMULATED/HARDCODED/UNAVAILABLE evidence cannot become verified execution evidence
{
  const ineligibleClasses = ['HEURISTIC', 'SIMULATED', 'HARDCODED', 'UNAVAILABLE'];
  ineligibleClasses.forEach(cls => {
    const eligibility = isEvidenceDecisionEligible(cls, 100);
    assert.strictEqual(eligibility.verified, false, `${cls} must never be verified`);
    assert.strictEqual(eligibility.eligible, false, `${cls} must never be eligible`);
  });

  const agentTrust = calculateAgentEvidenceTrust([
    {
      id: 'ev-1',
      agentKey: 'NEWS',
      asset: 'EURUSD',
      claim: 'Unconnected wire feed',
      source: 'Mock',
      sourceType: 'UNAVAILABLE',
      classification: 'UNAVAILABLE',
      observedAt: new Date().toISOString(),
      freshnessMs: 500,
      confidence: 80,
      assetSpecific: true,
      verified: false,
      decisionEligible: false,
      reason: 'Feed offline'
    }
  ]);
  assert.strictEqual(agentTrust.trustScore, 0, 'Unavailable feed must yield 0 trust');
  assert.strictEqual(agentTrust.verifiedCount, 0);
  pass('HEURISTIC, SIMULATED, HARDCODED, and UNAVAILABLE evidence fail closed');
}

// 11. Directional WATCH semantics remain distinct from actionability
{
  // High trust, open market, 10 verified agents -> ACTIONABLE
  const actionableGate = evaluateActionabilityGate({
    evidenceTrust: 75,
    verifiedAgentCount: 10,
    tradeExecutable: true,
    marketState: 'OPEN'
  });
  assert.strictEqual(actionableGate.actionabilityState, 'ACTIONABLE');
  assert.strictEqual(actionableGate.isActionable, true);

  // WATCH direction when market is closed -> NOT ACTIONABLE (MONITOR)
  const closedGate = evaluateActionabilityGate({
    evidenceTrust: 75,
    verifiedAgentCount: 10,
    tradeExecutable: false,
    marketState: 'CLOSED'
  });
  assert.strictEqual(closedGate.actionabilityState, 'MONITOR');
  assert.strictEqual(closedGate.isActionable, false);
  pass('WATCH directional posture remains separate from actionability');
}

// 12. Canonical execution mode is READ_ONLY and MT5_ORDER_TRANSPORT_ENABLED is false
{
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY', 'CANONICAL_EXECUTION_MODE must be READ_ONLY');
  assert.strictEqual(MT5_ORDER_TRANSPORT_ENABLED, false, 'MT5_ORDER_TRANSPORT_ENABLED must be false');
  pass('Canonical execution lock verified: READ_ONLY and MT5_ORDER_TRANSPORT_ENABLED=false');
}

// 13. Unmatched debate sender provenance isolation (zero confidence, empty evidence, zero profile leakage)
{
  const orchestrator = new FEFAIOrchestrator();
  const testProfile = {
    symbol: 'EURUSD',
    regime: 'TRENDING_BULLISH',
    session: 'London',
    confidence: 88,
    setupDirection: 'WATCH FOR BUY',
    stopLoss: 1.0820,
    whyThisTrade: [
      'GLOBAL PROFILE EVIDENCE MUST NOT LEAK',
      'SECOND GLOBAL CLAIM MUST NOT LEAK'
    ],
    agents: [
      {
        name: 'Technical Agent',
        type: 'TECHNICAL',
        bias: 'BULLISH',
        status: 'ONLINE',
        confidence: 85,
        evidenceTrustScore: 85,
        evidence: ['Local Technical Agent Claim']
      }
    ],
    debateMessages: [
      {
        time: '10:00:00',
        agent: 'UNKNOWN EXTERNAL AGENT',
        text: 'Unmatched telemetry message.',
        status: 'BULLISH'
      }
    ]
  };

  orchestrator.syncWithActiveAsset('EURUSD', 1.0850, 0.5, 0.1, testProfile);
  const msgs = orchestrator.getMessages();
  assert.strictEqual(msgs.length, 1, 'Exactly one message must exist');
  const msg = msgs[0];
  assert.strictEqual(msg.confidence, 0, 'Unmatched debate sender confidence must be 0, never inherited from profile');
  assert.deepStrictEqual(msg.evidence, [], 'Unmatched debate sender evidence must be strictly [], never inherited from profile');
  assert.strictEqual(msg.evidence.includes('GLOBAL PROFILE EVIDENCE MUST NOT LEAK'), false);
  assert.strictEqual(msg.evidence.includes('SECOND GLOBAL CLAIM MUST NOT LEAK'), false);
  assert.strictEqual(msg.bias, 'BULLISH', 'Directional status from debate message is preserved');
  pass('Unmatched debate sender provenance isolated: 0 confidence, [] evidence, zero global leakage');
}

// 14. Matched agent evidence trust isolation (cannot inherit global profile confidence)
{
  const orchestrator = new FEFAIOrchestrator();
  const testProfile = {
    symbol: 'GBPUSD',
    regime: 'BREAKOUT',
    session: 'New York',
    confidence: 99, // global profile confidence 99
    setupDirection: 'WATCH FOR BUY',
    whyThisTrade: ['Global trade rationale'],
    agents: [
      {
        name: 'Macro Agent',
        type: 'MACRO',
        bias: 'CAUTION',
        status: 'ONLINE',
        confidence: 80, // nominal agent confidence 80
        evidenceTrustScore: 27, // genuine evidence trust score 27
        evidence: ['Macro rate disparity 25bps']
      }
    ],
    debateMessages: [
      {
        time: '14:30:00',
        agent: 'MACRO AGENT',
        text: 'Macro disparity verified.',
        status: 'CAUTION'
      }
    ]
  };

  orchestrator.syncWithActiveAsset('GBPUSD', 1.2750, 0.8, 0.2, testProfile);
  const msgs = orchestrator.getMessages();
  assert.strictEqual(msgs.length, 1);
  const msg = msgs[0];
  assert.strictEqual(msg.confidence, 27, 'Matched agent message confidence must strictly equal evidenceTrustScore (27), NOT profile.confidence (99)');
  assert.deepStrictEqual(msg.evidence, ['Macro rate disparity 25bps'], 'Matched agent evidence must come strictly from agent local evidence');
  pass('Matched agent confidence isolated: strictly uses evidenceTrustScore (27), never leaks profile.confidence (99)');
}

// 15. Risk Guardian distinguishes policy cap from position sizing validation
{
  const { generateAssetIntelligence } = require('../src/lib/agents/multi-asset-pipeline.ts');
  const mockCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: 1710000000000 + i * 3600000,
    open: 1.0800 + i * 0.0005,
    high: 1.0810 + i * 0.0005,
    low: 1.0790 + i * 0.0005,
    close: 1.0805 + i * 0.0005,
    volume: 1000
  }));

  const profile = generateAssetIntelligence(
    'EURUSD',
    { price: mockCandles[mockCandles.length - 1].close, change24h: 0.1 },
    'H1',
    mockCandles
  );

  const rg = profile.agents.find(a => a.type === 'RISK_GUARDIAN');
  assert.ok(rg, 'Risk Guardian agent must exist');
  assert.strictEqual(rg.lastOpinion.includes('Exposure bounds verified'), false, 'Must never claim exposure bounds verified');
  assert.strictEqual(rg.lastOpinion.includes('Mandatory SL enforced'), false, 'Must never claim Mandatory SL enforced without sizing');
  assert.strictEqual(rg.lastOpinion.includes('Maximum 0.50% exposure per execution enforced'), false);
  assert.strictEqual(rg.lastOpinion.includes('policy cap'), true, 'Must describe 0.50% as a policy cap');

  const hasExposureVerified = rg.evidence.some(e => e.includes('Exposure bounds verified') || e.includes('Exposure cap: 0.50% equity'));
  assert.strictEqual(hasExposureVerified, false, 'Evidence must not claim unverified exposure bounds');
  pass('Risk Guardian distinguishes policy cap from position validation (no unverified exposure claims)');
}

// 16. Unknown debate sender in getTruthfulLiveMessages does NOT fall back to TECHNICAL
{
  const testProfile = {
    symbol: 'EURUSD',
    agents: [
      { name: 'Macro Agent', type: 'MACRO', bias: 'CAUTION', status: 'ONLINE', confidence: 70, evidence: [] }
    ],
    debateMessages: [
      {
        time: '11:00:00',
        agent: 'UNKNOWN OBSERVER',
        text: 'External comment.',
        status: 'NEUTRAL'
      }
    ]
  };

  const msgs = getTruthfulLiveMessages(testProfile);
  assert.strictEqual(msgs.length, 1);
  assert.notStrictEqual(msgs[0].agentType, 'TECHNICAL', 'Unknown sender must never masquerade as TECHNICAL');
  assert.strictEqual(msgs[0].agentType, 'COUNCIL_DEBATE', 'Unknown sender must use truthful generic council representation');
  pass('Unknown debate sender never masquerades as TECHNICAL');
}

// 17. Risk Guardian debate message separates structural SL from position validation
{
  const { generateAssetIntelligence } = require('../src/lib/agents/multi-asset-pipeline.ts');
  const mockCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: 1710000000000 + i * 3600000,
    open: 1.0800 + i * 0.0005,
    high: 1.0810 + i * 0.0005,
    low: 1.0790 + i * 0.0005,
    close: 1.0805 + i * 0.0005,
    volume: 1000
  }));

  const profile = generateAssetIntelligence(
    'EURUSD',
    { price: mockCandles[mockCandles.length - 1].close, change24h: 0.1 },
    'H1',
    mockCandles
  );

  const rgDebateMsg = profile.debateMessages.find(m => m.agent === 'RISK GUARDIAN');
  assert.ok(rgDebateMsg, 'Risk Guardian debate message must exist');
  assert.strictEqual(rgDebateMsg.text.includes('Risk budget capped at 0.50%'), false);
  assert.strictEqual(rgDebateMsg.text.includes('policy cap'), true, 'Debate message text must accurately describe policy cap');
  pass('Risk Guardian debate message text accurately describes policy cap and unvalidated sizing');
}

// 18. Economic event telemetry truthfully reports DATA LIMITED and never fabricates NFP/ECB/PCE/Tokyo CPI
{
  const symbols = ['XAUUSD', 'EURUSD', 'USDJPY', 'GBPUSD', 'BTCUSD'];
  symbols.forEach(sym => {
    const mockProfile = {
      symbol: sym,
      tradeExecutable: true,
      volatility: 'LOW',
      agents: [],
      setupDirection: 'WAIT'
    };
    const risk = evaluateTradingRisk(mockProfile, 1.0, true);
    assert.strictEqual(risk.impactEvent.impact, 'DATA LIMITED', `${sym} must report DATA LIMITED impact`);
    assert.strictEqual(risk.impactEvent.name, 'Economic calendar unavailable', `${sym} must report unavailable calendar`);
    assert.strictEqual(risk.impactEvent.countdown, 'DATA LIMITED', `${sym} must report DATA LIMITED countdown`);

    const serialized = JSON.stringify(risk.impactEvent);
    assert.strictEqual(serialized.includes('Non-Farm Payrolls'), false, `${sym} must not fabricate Non-Farm Payrolls`);
    assert.strictEqual(serialized.includes('ECB Monetary Policy'), false, `${sym} must not fabricate ECB Monetary Policy`);
    assert.strictEqual(serialized.includes('Tokyo CPI'), false, `${sym} must not fabricate Tokyo CPI`);
    assert.strictEqual(serialized.includes('Core PCE'), false, `${sym} must not fabricate Core PCE`);
  });
  pass('No fabricated NFP/PCE/ECB/Tokyo CPI event emitted; unavailable event telemetry reports DATA LIMITED');
}

// 19. Missing/unavailable economic event telemetry does NOT independently escalate risk or lock execution
{
  const mockProfile = {
    symbol: 'EURUSD',
    tradeExecutable: true,
    volatility: 'LOW',
    agents: [
      { name: 'Risk Guardian', type: 'RISK_GUARDIAN', bias: 'ARMED', status: 'ONLINE', confidence: 80 }
    ],
    setupDirection: 'WAIT'
  };
  const risk = evaluateTradingRisk(mockProfile, 1.0, true);
  assert.strictEqual(risk.level, 'LOW', 'Unavailable event telemetry must not escalate risk level to MODERATE or HIGH');
  assert.strictEqual(risk.riskGuardianAction, 'NORMAL', 'Unavailable event telemetry must not lock or restrict execution');
  assert.strictEqual(risk.summary.includes('upcoming event caution'), false, 'Summary must not mention upcoming event caution');
  assert.strictEqual(risk.summary.includes('event shock filters armed'), false, 'Summary must not mention event shock filters');
  pass('Unavailable event telemetry does not independently escalate risk level, action, or summary warnings');
}

// 20. Risk Guardian evidence wording truthfully reflects unavailable economic calendar telemetry
{
  const { generateAssetIntelligence } = require('../src/lib/agents/multi-asset-pipeline.ts');
  const mockCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: 1710000000000 + i * 3600000,
    open: 1.0800 + i * 0.0005,
    high: 1.0810 + i * 0.0005,
    low: 1.0790 + i * 0.0005,
    close: 1.0805 + i * 0.0005,
    volume: 1000
  }));

  const profile = generateAssetIntelligence(
    'EURUSD',
    { price: mockCandles[mockCandles.length - 1].close, change24h: 0.1 },
    'H1',
    mockCandles
  );

  const rg = profile.agents.find(a => a.type === 'RISK_GUARDIAN');
  assert.ok(rg, 'Risk Guardian must exist in assembled agents');
  assert.strictEqual(
    rg.evidence.some(e => e.includes('Economic Release Window: CLEAR')),
    false,
    'Must not claim Economic Release Window: CLEAR without verified calendar telemetry'
  );
  assert.strictEqual(
    rg.evidence.some(e => e.includes('Economic calendar telemetry unavailable')),
    true,
    'Must include truthful statement that calendar telemetry is unavailable'
  );
  pass('Risk Guardian evidence wording truthfully reports economic calendar telemetry unavailable');
}

console.log(`\n=================================================================`);
console.log(`ALL ${passedCount}/20 TRUTHFULNESS REGRESSION TESTS PASSED CLEANLY.`);
console.log(`=================================================================`);
