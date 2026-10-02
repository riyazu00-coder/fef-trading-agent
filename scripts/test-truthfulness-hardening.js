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
const path = require('path');
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

// 21. No production Core PCE, fake 105m countdown, fixed $512.25, or fixed 4341.70 stop
{
  const filesToCheck = [
    'src/components/cockpit/EconomicEventsCard.tsx',
    'src/components/cinematic/HexagonalSecurityShield.tsx',
    'src/components/cockpit/RiskGuardianPolicy.tsx',
    'src/components/cockpit/ExecutionControlCard.tsx',
    'src/components/central-core/CompactCentralAgentCore.tsx',
    'src/components/cockpit/VulnerabilityAuditCard.tsx',
    'src/components/trading/DevilsAdvocateCard.tsx',
    'src/lib/agents/system-architecture-state.ts',
    'src/lib/agents/collective-calculation.ts',
    'src/lib/agents/agent-swarm.ts',
    'src/lib/agents/synapse-data-feed.ts',
    'src/lib/agents/agent-blackboard.ts',
    'src/components/cockpit/MasterTopNav.tsx'
  ];

  filesToCheck.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    assert.strictEqual(content.includes('Core PCE'), false, `${file} must not contain Core PCE`);
    assert.strictEqual(content.includes('512.25'), false, `${file} must not contain fixed $512.25`);
    assert.strictEqual(content.includes('4341.70'), false, `${file} must not contain fixed 4341.70 stop`);
    assert.strictEqual(content.includes('in 105 mins'), false, `${file} must not contain in 105 mins countdown`);
  });
  pass('Zero production Core PCE, 105m countdown, fixed $512.25, or fixed 4341.70 stop across all audited components');
}

// 22. No "limits loss to exactly 0.50%" or "strictly enforced" broker claims under READ_ONLY
{
  const devilsCard = fs.readFileSync('src/components/trading/DevilsAdvocateCard.tsx', 'utf8');
  assert.strictEqual(devilsCard.includes('limits loss to exactly 0.50%'), false, 'DevilsAdvocateCard must not guarantee exact loss limits');
  assert.strictEqual(devilsCard.includes('Hard SL mandated'), false, 'DevilsAdvocateCard must not claim mandated hard SL');

  const chartEngine = fs.readFileSync('src/lib/chart-analysis/engine.ts', 'utf8');
  assert.strictEqual(chartEngine.includes('strictly enforced'), false, 'chart-analysis engine must not claim strictly enforced broker stops under READ_ONLY');
  pass('No "limits loss to exactly 0.50%" or "strictly enforced" broker stop claims');
}

// 23. MasterTopNav dynamically grounds Council evidence trust and removes static "15 Council agents report"
{
  const masterNav = fs.readFileSync('src/components/cockpit/MasterTopNav.tsx', 'utf8');
  assert.strictEqual(masterNav.includes('15 Council agents report'), false, 'MasterTopNav must not assert static 15 Council agents report');
  assert.strictEqual(masterNav.includes('Macro scheduled event shock buffer'), false, 'MasterTopNav must not claim fabricated scheduled event buffer');
  assert.strictEqual(masterNav.includes('Council evidence trust:'), true, 'MasterTopNav must truthfully refer to Council evidence trust');
  pass('MasterTopNav dynamically grounds Council evidence trust without static claims');
}

// 24. Strategy and Opportunity opinions do not overclaim external validation
{
  const pipeline = fs.readFileSync('src/lib/agents/multi-asset-pipeline.ts', 'utf8');
  assert.strictEqual(pipeline.includes('Strategy protocol validated:'), false, 'Pipeline must not claim strategy protocol validated');
  assert.strictEqual(pipeline.includes('risk-to-reward ratio verified'), false, 'Pipeline must not claim R:R verified without live execution');
  assert.strictEqual(pipeline.includes('Strategy setup identified from verified structural blueprint'), true);
  assert.strictEqual(pipeline.includes('Structural R:R calculated as'), true);
  pass('Strategy and Opportunity opinions accurately distinguish structural calculation from external validation');
}

// 25. Static blackboard and swarm fixtures cannot claim 1-Click order ticket prepared or fake 88% confluence
{
  const blackboard = fs.readFileSync('src/lib/agents/agent-blackboard.ts', 'utf8');
  assert.strictEqual(blackboard.includes('1-Click order ticket prepared'), false, 'Blackboard must not claim 1-Click order ticket prepared');

  const swarm = fs.readFileSync('src/lib/agents/agent-swarm.ts', 'utf8');
  assert.strictEqual(swarm.includes('confluence aligns at 88%'), false, 'Swarm must not claim arbitrary 88% confluence');
  assert.strictEqual(swarm.includes('down 6 bps to 4.21%'), false, 'Swarm must not claim fake 10Y yield drop');
  pass('Zero "1-Click order ticket", fake 88% confluence, or fake 10Y yield drop in agent fixtures');
}

// 26. 0.50% equity policy cap remains allowed and canonical execution lock is verified
{
  const { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } = require('../src/lib/execution/execution-policy.ts');
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY');
  assert.strictEqual(MT5_ORDER_TRANSPORT_ENABLED, false);

  const policyFile = fs.readFileSync('src/components/cockpit/RiskGuardianPolicy.tsx', 'utf8');
  assert.strictEqual(policyFile.includes('0.50% equity (Max policy cap)'), true, '0.50% equity policy cap must remain visible as policy');
  pass('0.50% equity policy cap preserved and canonical execution lock strictly verified');
}

// 27. agent-swarm demo fixtures fail closed without fabricated trading intelligence
{
  const { INITIAL_AGENTS, INITIAL_DIALOGUE, SIMULATED_DIALOGUE_POOL, CURRENT_TRADE_SETUP } = require('../src/lib/agents/agent-swarm.ts');

  // Verify all 15 agents fail closed
  assert.strictEqual(INITIAL_AGENTS.length, 15, 'INITIAL_AGENTS must contain 15 council agents');
  INITIAL_AGENTS.forEach(agent => {
    assert.strictEqual(agent.bias !== 'BULLISH' && agent.bias !== 'BEARISH', true, `${agent.name} must not have BULLISH or BEARISH bias`);
    assert.strictEqual(agent.confidence, 0, `${agent.name} must have 0 confidence`);
    assert.strictEqual(agent.status, 'DATA LIMITED', `${agent.name} must have DATA LIMITED status`);
    assert.strictEqual(agent.keyRisk, 'DATA LIMITED', `${agent.name} must have DATA LIMITED keyRisk`);
  });

  // Verify CURRENT_TRADE_SETUP is null
  assert.strictEqual(CURRENT_TRADE_SETUP, null, 'CURRENT_TRADE_SETUP must be null');

  // Verify INITIAL_DIALOGUE has 0 confidence and no BULLISH bias
  INITIAL_DIALOGUE.forEach(msg => {
    assert.strictEqual(msg.confidence, 0, 'INITIAL_DIALOGUE message must have 0 confidence');
    assert.strictEqual(msg.bias, 'NEUTRAL', 'INITIAL_DIALOGUE message must be NEUTRAL');
  });

  // Verify SIMULATED_DIALOGUE_POOL has 0 confidence and no BULLISH/BEARISH bias
  SIMULATED_DIALOGUE_POOL.forEach(msg => {
    assert.strictEqual(msg.confidence, 0, 'SIMULATED_DIALOGUE_POOL message must have 0 confidence');
    assert.strictEqual(msg.bias !== 'BULLISH' && msg.bias !== 'BEARISH', true, 'SIMULATED_DIALOGUE_POOL message must not be BULLISH/BEARISH');
  });

  // Verify no fabricated prices in agent-swarm.ts
  const swarmCode = fs.readFileSync('src/lib/agents/agent-swarm.ts', 'utf8');
  ['4341.20', '4348.50', '4368.00', '4343.80', 'CHOCH confirmed', 'breaker block completed'].forEach(pattern => {
    assert.strictEqual(swarmCode.includes(pattern), false, `agent-swarm.ts must not contain '${pattern}'`);
  });

  pass('Agent-swarm demo fixtures fail closed: 0 confidence, DATA LIMITED status, null trade setup, and zero fabricated price levels');
}

// 28. Blackboard and createSharedBlackboardForAsset fail-closed truthfulness (Requirements A through Q)
{
  const { INITIAL_BLACKBOARD_STATE, createSharedBlackboardForAsset } = require('../src/lib/agents/agent-blackboard.ts');

  // A. INITIAL_BLACKBOARD_STATE contains no hardcoded XAUUSD market snapshot
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.selectedSymbol !== 'XAUUSD', true, 'INITIAL_BLACKBOARD_STATE must not hardcode XAUUSD');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.assetPrice, null, 'INITIAL_BLACKBOARD_STATE assetPrice must be null');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.bid, null, 'INITIAL_BLACKBOARD_STATE bid must be null');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.ask, null, 'INITIAL_BLACKBOARD_STATE ask must be null');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.spread, null, 'INITIAL_BLACKBOARD_STATE spread must be null');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.marketRegime.includes('FVG'), false, 'INITIAL_BLACKBOARD_STATE must not contain FVG claims');

  // B. INITIAL_BLACKBOARD_STATE does not start WATCH BUY/WATCH SELL/BUY/SELL
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.directionalVerdict, 'WAIT', 'INITIAL_BLACKBOARD_STATE must start in non-directional WAIT');

  // C. INITIAL_BLACKBOARD_STATE does not claim market tradeExecutable=true
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.marketSession?.tradeExecutable, false, 'INITIAL_BLACKBOARD_STATE marketSession must not be tradeExecutable');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.marketSession?.marketState, 'CLOSED', 'INITIAL_BLACKBOARD_STATE marketSession must start CLOSED');

  // D. INITIAL_BLACKBOARD_STATE does not contain hardcoded DXY 104.18
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.dxyState.price, null, 'INITIAL_BLACKBOARD_STATE DXY price must be null');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.dxyState.trend, 'DATA LIMITED', 'INITIAL_BLACKBOARD_STATE DXY trend must be DATA LIMITED');

  // E. INITIAL_BLACKBOARD_STATE does not contain hardcoded US10Y 4.214
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.yieldState.us10y, null, 'INITIAL_BLACKBOARD_STATE US10Y must be null');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.yieldState.trend, 'DATA LIMITED', 'INITIAL_BLACKBOARD_STATE US10Y trend must be DATA LIMITED');

  // F, G, H. INITIAL_BLACKBOARD_STATE contains no static SPDR, retail %, or fabricated agent confidence
  const bbCode = fs.readFileSync('src/lib/agents/agent-blackboard.ts', 'utf8');
  assert.strictEqual(bbCode.includes('+3.2 tonnes'), false, 'agent-blackboard.ts must not contain SPDR +3.2 tonnes');
  assert.strictEqual(bbCode.includes('Retail positioning long cooled to 56%'), false, 'agent-blackboard.ts must not contain retail 56% claim');
  assert.strictEqual(bbCode.includes('Fear & Greed index stable at 52'), false, 'agent-blackboard.ts must not contain Fear & Greed 52');
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.consensusScore, 0, 'INITIAL_BLACKBOARD_STATE consensusScore must be 0');
  assert.strictEqual(Object.keys(INITIAL_BLACKBOARD_STATE.agentBiases).length, 0, 'INITIAL_BLACKBOARD_STATE agentBiases must be empty');

  // I, J, K, L. createSharedBlackboardForAsset does not inject DXY 104.18/-0.36 or US10Y 4.214/-1.40 or automatic CONFIRMED/BULLISH_GOLD
  const testBB = createSharedBlackboardForAsset(
    'XAUUSD', 4350.0, 0.35, 1.2, 'METALS', 'Balanced Market', 'London', 0, 'WAIT', 4320.0, []
  );
  assert.strictEqual(testBB.dxyState.price, null, 'createSharedBlackboardForAsset without verified telemetry must not inject DXY price');
  assert.strictEqual(testBB.dxyState.change, null, 'createSharedBlackboardForAsset without verified telemetry must not inject DXY change');
  assert.strictEqual(testBB.dxyState.trend, 'DATA LIMITED', 'createSharedBlackboardForAsset DXY trend must be DATA LIMITED');
  assert.strictEqual(testBB.dxyState.divergenceToGold !== 'CONFIRMED', true, 'Metals must not automatically receive CONFIRMED DXY divergence');

  assert.strictEqual(testBB.yieldState.us10y, null, 'createSharedBlackboardForAsset without verified telemetry must not inject US10Y');
  assert.strictEqual(testBB.yieldState.change, null, 'createSharedBlackboardForAsset without verified telemetry must not inject US10Y change');
  assert.strictEqual(testBB.yieldState.trend, 'DATA LIMITED', 'createSharedBlackboardForAsset US10Y trend must be DATA LIMITED');
  assert.strictEqual(testBB.yieldState.realYieldBias !== 'BULLISH_GOLD', true, 'Metals must not automatically receive BULLISH_GOLD real-yield bias');

  // M, N. unavailable economic calendar is represented DATA LIMITED, not LOW; does not create directional bias
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.eventRisk.level, 'DATA LIMITED', 'INITIAL_BLACKBOARD_STATE eventRisk must be DATA LIMITED, not LOW');
  assert.strictEqual(testBB.eventRisk.level, 'DATA LIMITED', 'createSharedBlackboardForAsset eventRisk must be DATA LIMITED, not LOW');
  assert.strictEqual(testBB.eventRisk.lockoutActive, false, 'Unavailable calendar must not claim active lockout');

  // O. bootstrap state is fail-closed/non-executable
  assert.strictEqual(INITIAL_BLACKBOARD_STATE.marketSession?.tradeExecutable, false, 'Bootstrap state must be non-executable');

  // P, Q. execution policy remains READ_ONLY and MT5_ORDER_TRANSPORT_ENABLED remains false
  const { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } = require('../src/lib/execution/execution-policy.ts');
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY');
  assert.strictEqual(MT5_ORDER_TRANSPORT_ENABLED, false);

  pass('Shared blackboard fail-closed truthfulness verified across requirements A through Q');
}

// 29. Settings MT5 Status Truthfulness and Configuration Isolation (Requirements A through L)
{
  const settingsCode = fs.readFileSync('src/app/settings/page.tsx', 'utf8');
  const routeCode = fs.readFileSync('src/app/api/bridge/mt5/route.ts', 'utf8');
  const { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } = require('../src/lib/execution/execution-policy.ts');

  // A. Canonical HTTP status ONLINE + MT5 connected = connected state
  assert.strictEqual(settingsCode.includes("localProbeStatus.localBridge === 'ONLINE'"), true, 'Must test localProbeStatus.localBridge === ONLINE');
  assert.strictEqual(settingsCode.includes("✓ Connected: Local HTTP Bridge & MetaTrader 5 live"), true, 'Must report connected when both bridge and MT5 are online');

  // B. Canonical HTTP status ONLINE + MT5 disconnected = bridge online / terminal waiting, NOT bridge offline
  assert.strictEqual(settingsCode.includes("Local HTTP Bridge is ONLINE"), true, 'Must report bridge ONLINE when MT5 is disconnected');
  assert.strictEqual(settingsCode.includes("FEF_HTTP_Bridge.mq5 is not connected") || settingsCode.includes("terminal is not connected"), true, 'Must state terminal is not connected');

  // C. Healthy HTTP status is authoritative and not overridden by failed legacy TCP fallback
  const indexOfHttpCheck = settingsCode.indexOf("if (localProbeStatus && localProbeStatus.localBridge === 'ONLINE')");
  const indexOfPingFallback = settingsCode.indexOf("fetch('/api/bridge/mt5?action=PING')");
  assert.strictEqual(indexOfHttpCheck !== -1 && indexOfPingFallback !== -1, true, 'Both checks present');
  assert.strictEqual(indexOfHttpCheck < indexOfPingFallback, true, 'Authoritative HTTP status must precede legacy PING fallback');

  // D. Canonical HTTP port is 5556, legacy port 5555 is not presented as canonical HTTP
  assert.strictEqual(settingsCode.includes("useState<number>(5556)"), true, 'Settings default MT5 port must be 5556');

  // E. Connected MT5 does NOT imply execution-ready; mode defaults/falls back to READ_ONLY
  assert.strictEqual(settingsCode.includes("const isExecutionReady = effectiveIsConnected;"), false, 'Connected MT5 must NOT set isExecutionReady');
  assert.strictEqual(settingsCode.includes("effectiveMode = CANONICAL_EXECUTION_MODE"), true, 'effectiveMode must be CANONICAL_EXECUTION_MODE');

  // F. Operating mode in Settings defaults to READ_ONLY
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY');

  // G. Settings has zero occurrences of UNIVERSAL_EXECUTION or UNIVERSAL MT5 ACTIVE
  assert.strictEqual(settingsCode.includes('UNIVERSAL_EXECUTION'), false, 'Settings must not contain UNIVERSAL_EXECUTION');
  assert.strictEqual(settingsCode.includes('UNIVERSAL MT5 ACTIVE'), false, 'Settings must not contain UNIVERSAL MT5 ACTIVE');

  // H. Status payload does not fabricate 5ms or 8ms latency fallbacks
  assert.strictEqual(settingsCode.includes('|| 5'), false, 'Settings must not fabricate 5ms latency fallback');
  assert.strictEqual(settingsCode.includes('|| 8'), false, 'Settings must not fabricate 8ms latency fallback');

  // I. Status payload handles heartbeatAgeMs = 0 truthfully (<1s ago, not false/none)
  assert.strictEqual(settingsCode.includes("localProbeStatus.heartbeatAgeMs != null"), true, 'Must treat heartbeatAgeMs = 0 as valid non-null number');
  assert.strictEqual(settingsCode.includes("mt5TestResult.heartbeatAgeMs != null"), true, 'UI metric must treat heartbeatAgeMs = 0 as valid non-null');

  // J. route.ts handles port configuration updates without confusing HTTP and legacy TCP
  assert.strictEqual(routeCode.includes("numericPort === 5556"), true, 'route.ts must distinguish port 5556 for mt5HttpClient');
  assert.strictEqual(routeCode.includes("numericPort === 5555"), true, 'route.ts must distinguish port 5555 for mt5BridgeClient');

  // K. Execution policy constants preserved
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY');
  assert.strictEqual(MT5_ORDER_TRANSPORT_ENABLED, false);

  // L. Legacy TCP fallback clearly labeled if invoked
  assert.strictEqual(settingsCode.includes("Legacy TCP Bridge handshake verified"), true, 'Legacy TCP fallback must be clearly labeled');
  assert.strictEqual(settingsCode.includes("TCP SOCKET (LEGACY)"), true, 'Legacy transport must be clearly labeled TCP SOCKET (LEGACY)');

  pass('Settings MT5 status truthfulness and configuration isolation verified (Requirements A through L)');
}

// 30. MT5 Telemetry Context, Execution Semantics & Fabricated Fallback Elimination (Requirements 1 through 20)
{
  const contextCode = fs.readFileSync('src/context/MT5TelemetryContext.tsx', 'utf8');
  const settingsCode = fs.readFileSync('src/app/settings/page.tsx', 'utf8');
  const { deriveAccountRiskContext } = require('../src/lib/bridge/mt5-telemetry-state.ts');
  const { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } = require('../src/lib/execution/execution-policy.ts');

  // 1. MT5 connected does NOT imply execution permission
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY');
  assert.strictEqual(MT5_ORDER_TRANSPORT_ENABLED, false);

  // 2. CANONICAL_EXECUTION_MODE remains READ_ONLY
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY');

  // 3. MT5_ORDER_TRANSPORT_ENABLED remains false
  assert.strictEqual(MT5_ORDER_TRANSPORT_ENABLED, false);

  // 4. MT5TelemetryContext contains zero UNIVERSAL_EXECUTION derivation from mt5Online
  assert.strictEqual(contextCode.includes("mt5Online ? 'UNIVERSAL_EXECUTION' : 'READ_ONLY'"), false, 'Must not derive UNIVERSAL_EXECUTION from mt5Online');
  assert.strictEqual(contextCode.includes("const isReadOnly = !mt5Online;"), false, 'Must not derive isReadOnly from !mt5Online');

  // 5. Offline/unavailable telemetry remains READ_ONLY
  assert.strictEqual(contextCode.includes("operatingMode: 'READ_ONLY'"), true, 'Offline/unavailable telemetry must be READ_ONLY');

  // 6. readOnlyLockActive remains true under current policy
  assert.strictEqual(contextCode.includes("readOnlyLockActive: true"), true, 'readOnlyLockActive must remain true');
  assert.strictEqual(contextCode.includes("readOnlyLockActive: false"), false, 'readOnlyLockActive must never be set false');

  // 7, 8. No fabricated Exness broker or Exness-MT5Trial16 server fallback
  assert.strictEqual(contextCode.includes("broker: 'Exness'"), false, 'Context must not contain fabricated broker: Exness fallback');
  assert.strictEqual(contextCode.includes("server: 'Exness-MT5Trial16'"), false, 'Context must not contain fabricated server: Exness-MT5Trial16 fallback');
  assert.strictEqual(contextCode.includes("brokerName: data.broker || 'Exness'"), false, 'Terminal must not fabricate brokerName Exness');
  assert.strictEqual(contextCode.includes("brokerServer: data.server || 'Exness-MT5Trial16'"), false, 'Terminal must not fabricate brokerServer Exness-MT5Trial16');

  // 9. No fabricated $10,000 account fallback in MT5TelemetryContext
  assert.strictEqual(contextCode.includes("balance: data.balance || 10000"), false, 'Context must not fabricate balance 10000');
  assert.strictEqual(contextCode.includes("equity: data.equity || 10000"), false, 'Context must not fabricate equity 10000');
  assert.strictEqual(contextCode.includes("freeMargin: data.freeMargin || 10000"), false, 'Context must not fabricate freeMargin 10000');

  // 10. No fabricated leverage 200 fallback in MT5TelemetryContext
  assert.strictEqual(contextCode.includes("leverage: data.leverage || 200"), false, 'Context must not fabricate leverage 200');

  // 11. No fabricated terminal ping 5ms fallback
  assert.strictEqual(contextCode.includes("ping: data.ping ?? 5"), false, 'Context must not fabricate terminal ping 5ms');

  // 12. No fabricated tradeAllowed=true fallback in MT5TelemetryContext
  assert.strictEqual(contextCode.includes("tradeAllowed: true"), false, 'Context must not fabricate tradeAllowed: true');

  // 13. heartbeatAgeMs 0 remains valid
  assert.strictEqual(contextCode.includes("data.heartbeatAgeMs ?? null"), true, 'Context must preserve heartbeatAgeMs=0 via nullish coalescing');

  // 14. latency 0 remains valid (typeof check or ?? null)
  assert.strictEqual(contextCode.includes("typeof data.terminal.pingToBrokerMs === 'number'"), true, 'Context must preserve pingToBrokerMs=0');

  // 15. Remote telemetry success can represent MT5 CONNECTED without claiming cloud localhost bridge access
  assert.strictEqual(contextCode.includes("localOnline = isRemote ? false : (data.localBridge === 'ONLINE' || data.success === true)"), true, 'Remote telemetry must not claim localBridgeOnline=true');

  // 16. Settings cannot let failed localhost diagnostics override healthy canonical remote telemetry
  assert.strictEqual(settingsCode.includes("refreshTelemetry()"), true, 'Settings test must refresh canonical telemetry');
  assert.strictEqual(settingsCode.includes("if (isMt5Connected || telemetry.mt5Connected)"), true, 'Settings must respect canonical remote MT5 connection');
  assert.strictEqual(settingsCode.includes("NOT DIRECTLY OBSERVABLE FROM CLOUD"), true, 'Settings must explain cloud-side local probe status');

  // 17. Settings does not contain UNIVERSAL_EXECUTION
  assert.strictEqual(settingsCode.includes('UNIVERSAL_EXECUTION'), false, 'Settings must not contain UNIVERSAL_EXECUTION');

  // 18. Settings does not equate connected with execution-ready
  assert.strictEqual(settingsCode.includes("const isExecutionReady"), false, 'Settings must not define isExecutionReady');

  // 19. Legacy TCP 5555 remains explicitly legacy and does not replace canonical HTTP 5556
  const routeCode = fs.readFileSync('src/app/api/bridge/mt5/route.ts', 'utf8');
  assert.strictEqual(routeCode.includes("numericPort === 5556"), true, 'route.ts must support canonical HTTP port 5556');
  assert.strictEqual(routeCode.includes("numericPort === 5555"), true, 'route.ts must preserve legacy TCP port 5555');

  // 20. deriveAccountRiskContext returns null when account has no numeric balance (no fabricated account)
  const emptyContext = deriveAccountRiskContext(null, [], 'READ_ONLY');
  assert.strictEqual(emptyContext, null, 'deriveAccountRiskContext(null) must return null');
  const invalidContext = deriveAccountRiskContext({ balance: undefined }, [], 'READ_ONLY');
  assert.strictEqual(invalidContext, null, 'deriveAccountRiskContext with undefined balance must return null');

  pass('MT5 Telemetry Context, execution semantics, and fabricated fallback elimination verified (Requirements 1 through 20)');
}

// 31. Static-truthfulness cleanups: MT5 heartbeat, CompactCentralAgentCore, HubRiskWarningStrip
{
  // 1. scripts/mt5-http-bridge-service.js contains state: 'CONNECTED_READ_ONLY' and not CONNECTED_UNIVERSAL_EXECUTION
  const bridgeServiceCode = fs.readFileSync('scripts/mt5-http-bridge-service.js', 'utf8');
  assert.strictEqual(
    bridgeServiceCode.includes("state: 'CONNECTED_READ_ONLY'"),
    true,
    'mt5-http-bridge-service.js must return state: CONNECTED_READ_ONLY in heartbeat response'
  );
  assert.strictEqual(
    bridgeServiceCode.includes("state: 'CONNECTED_UNIVERSAL_EXECUTION'"),
    false,
    'mt5-http-bridge-service.js must not return state: CONNECTED_UNIVERSAL_EXECUTION'
  );

  // 2. src/components/central-core/CompactCentralAgentCore.tsx contains truthful evidence impact wording
  const compactCoreCode = fs.readFileSync('src/components/central-core/CompactCentralAgentCore.tsx', 'utf8');
  assert.strictEqual(
    compactCoreCode.includes('+8% collective confluence contribution'),
    false,
    'CompactCentralAgentCore.tsx must not contain static +8% collective confluence contribution'
  );
  assert.strictEqual(
    compactCoreCode.includes("impact: 'Collective confluence evidence contribution'"),
    true,
    'CompactCentralAgentCore.tsx must contain truthful impact description'
  );

  // 3. src/components/central-hub/HubRiskWarningStrip.tsx does not default confluenceScore to 81
  const warningStripCode = fs.readFileSync('src/components/central-hub/HubRiskWarningStrip.tsx', 'utf8');
  assert.strictEqual(
    warningStripCode.includes('confluenceScore = 81'),
    false,
    'HubRiskWarningStrip.tsx must not default confluenceScore to 81'
  );
  assert.strictEqual(
    warningStripCode.includes("confluenceScore == null ? 'DATA LIMITED'"),
    true,
    'HubRiskWarningStrip.tsx must render DATA LIMITED when confluenceScore is null/undefined'
  );

  pass('MT5 HTTP heartbeat state, CompactCentralAgentCore impact wording, and HubRiskWarningStrip confluenceScore defaults truthfully verified');
}

// 32. News & Calendar provenance truthfulness (Bug 1 & Bug 2)
{
  const newsEngineFile = fs.readFileSync('src/lib/news/global-news-engine.ts', 'utf8');
  const calendarEngineFile = fs.readFileSync('src/lib/calendar/economic-calendar-engine.ts', 'utf8');

  // 1. Missing news timestamp != Date.now() / no pubDate || new Date()
  assert.strictEqual(
    newsEngineFile.includes('pubDate || new Date().toISOString()'),
    false,
    'global-news-engine.ts must never default missing pubDate to new Date().toISOString()'
  );
  assert.strictEqual(
    newsEngineFile.includes(': Date.now()'),
    false,
    'global-news-engine.ts must never fallback unparseable pubDate to Date.now()'
  );

  // 2. Malformed news timestamp != Date.now() and is dropped fail-closed
  assert.strictEqual(
    newsEngineFile.includes('!isNaN(publishedEpoch)'),
    true,
    'global-news-engine.ts must require authentic finite publishedEpoch'
  );

  // 3. Atom/RSS date format support
  assert.strictEqual(
    newsEngineFile.includes('(?:published|updated)'),
    true,
    'global-news-engine.ts must support Atom published and updated tags'
  );
  assert.strictEqual(
    newsEngineFile.includes('dc:date'),
    true,
    'global-news-engine.ts must support dc:date tag'
  );

  // 4. Collision-resistant SHA-256 news ID generation
  assert.strictEqual(
    newsEngineFile.includes('crypto.createHash(\'sha256\')'),
    true,
    'global-news-engine.ts must use crypto sha256 for deterministic collision-resistant ID'
  );
  assert.strictEqual(
    newsEngineFile.includes('Buffer.from(normTitle).toString(\'base64\').slice(0, 16)'),
    false,
    'global-news-engine.ts must not use truncated Base64 normTitle slice that causes collisions'
  );

  // 5. Test parseXmlFeed and normalizeAndDeduplicate functionality directly
  const { globalNewsEngine } = require('../src/lib/news/global-news-engine');

  // Test old Fed release preserves authentic timestamp and does not become current
  const testFedXml = `<?xml version="1.0" encoding="utf-8" ?>
  <rss version="2.0">
    <channel>
      <item>
        <title>Minutes of the Federal Open Market Committee, June 16-17, 2026</title>
        <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260708a.htm</link>
        <description>Minutes of the FOMC meeting</description>
        <pubDate>Wed, 08 Jul 2026 18:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Minutes of the Federal Open Market Committee, July 28–29, 2026</title>
        <link>https://www.federalreserve.gov/newsevents/pressreleases/monetary20260819a.htm</link>
        <description>Minutes of the FOMC meeting</description>
        <pubDate>Wed, 19 Aug 2026 18:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Malformed Date Article</title>
        <link>https://example.com/bad-date</link>
        <description>This should be dropped</description>
        <pubDate>invalid-date-string-not-real</pubDate>
      </item>
      <item>
        <title>Missing Date Article</title>
        <link>https://example.com/no-date</link>
        <description>This should be dropped</description>
      </item>
    </channel>
  </rss>`;

  const parsedItems = globalNewsEngine.parseXmlFeed(testFedXml, 'Federal Reserve');
  assert.strictEqual(parsedItems.length, 2, 'Malformed and missing date articles must be dropped (fail-closed)');

  const item1 = parsedItems.find((i) => i.title.includes('June 16-17'));
  assert.strictEqual(Boolean(item1), true, 'June FOMC release must be present');
  assert.strictEqual(item1.publishedEpoch, Date.parse('Wed, 08 Jul 2026 18:00:00 GMT'), 'Authentic July 2026 timestamp must be preserved');
  assert.notStrictEqual(item1.publishedIso.slice(0, 7), '2026-10', 'July release must not be stamped with October current date');

  // Test deduplication and unique collision-resistant IDs
  const normalized = globalNewsEngine.normalizeAndDeduplicate(parsedItems);
  assert.strictEqual(normalized.length, 2, 'Both distinct Fed releases must be normalized');
  assert.notStrictEqual(normalized[0].id, normalized[1].id, 'Distinct Fed releases with similar title prefixes must have different IDs');
  assert.strictEqual(normalized[0].id.startsWith('news-'), true, 'News ID must start with news-');

  // Test deterministic ID across normalization
  const normalizedAgain = globalNewsEngine.normalizeAndDeduplicate(parsedItems);
  assert.strictEqual(normalized[0].id, normalizedAgain[0].id, 'News item ID must be deterministic across calls');
  assert.strictEqual(normalized[1].id, normalizedAgain[1].id, 'News item ID must be deterministic across calls');

  // Test Atom feed support
  const testAtomXml = `<?xml version="1.0" encoding="utf-8"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>Atom Fed Telemetry Release</title>
      <link href="https://example.com/atom-fed-release" />
      <updated>2026-05-10T14:30:00Z</updated>
      <summary>Atom feed summary</summary>
    </entry>
  </feed>`;
  const parsedAtom = globalNewsEngine.parseXmlFeed(testAtomXml, 'Atom Test Source');
  assert.strictEqual(parsedAtom.length, 1, 'Valid Atom entry must be parsed');
  assert.strictEqual(parsedAtom[0].publishedEpoch, Date.parse('2026-05-10T14:30:00Z'), 'Atom updated timestamp must be preserved');

  // 6. Calendar engine provenance & date validation
  const { economicCalendarEngine } = require('../src/lib/calendar/economic-calendar-engine');
  const mockCalendarRecords = [
    {
      title: 'US Non-Farm Payrolls',
      country: 'USD',
      date: '2026-10-02T12:30:00Z',
      impact: 'High',
      forecast: '180K',
      previous: '142K'
    },
    {
      title: 'Corrupted Event Date',
      country: 'USD',
      date: 'invalid-date-not-parseable',
      impact: 'High',
      forecast: '100',
      previous: '90'
    },
    {
      title: 'Unknown Country Reserve Rate',
      country: 'XYZ',
      date: '2026-10-02T15:00:00Z',
      impact: 'Medium',
      forecast: '5.0%',
      previous: '4.5%'
    }
  ];

  const normCalendar = economicCalendarEngine.normalizeCalendarEvents(mockCalendarRecords);
  assert.strictEqual(normCalendar.length, 2, 'Corrupted date calendar event must be discarded, valid events kept');

  const nfpEvent = normCalendar.find((e) => e.title === 'US Non-Farm Payrolls');
  assert.strictEqual(Boolean(nfpEvent), true, 'US Non-Farm Payrolls must be normalized');
  assert.strictEqual(nfpEvent.forecast, '180K', 'Forecast must be preserved');
  assert.strictEqual(nfpEvent.previous, '142K', 'Previous must be preserved');
  assert.strictEqual(nfpEvent.scheduledAt, '2026-10-02T12:30:00.000Z', 'Scheduled ISO must match authentic date');
  assert.strictEqual(nfpEvent.classification, 'LIVE_EXTERNAL', 'Calendar event classification must be LIVE_EXTERNAL');
  assert.notStrictEqual(nfpEvent.classification, 'INDEPENDENT_VERIFIED', 'Calendar event must NOT be classified as INDEPENDENT_VERIFIED');
  assert.strictEqual(Boolean(nfpEvent.source), true, 'Source metadata must be populated');
  assert.strictEqual(
    nfpEvent.source.includes('Single Upstream Source'),
    true,
    'Calendar record must truthfully state single upstream source wire provenance'
  );
  assert.strictEqual(nfpEvent.providerId, 'economic-calendar-engine', 'providerId must be economic-calendar-engine');
  assert.strictEqual(nfpEvent.relatedSymbols.includes('XAUUSD'), true, 'USD event should map to XAUUSD');
  assert.strictEqual(nfpEvent.relatedSymbols.includes('EURUSD'), true, 'USD event should map to EURUSD');

  // Verify unknown country event does NOT invent XAUUSD relevance
  const unknownEvent = normCalendar.find((e) => e.title === 'Unknown Country Reserve Rate');
  assert.strictEqual(Boolean(unknownEvent), true, 'Unknown country event must be normalized');
  assert.strictEqual(unknownEvent.relatedSymbols.includes('XAUUSD'), false, 'Unknown event must NOT default or invent XAUUSD relevance');
  assert.strictEqual(unknownEvent.relatedSymbols.length, 0, 'Unknown event should return empty relatedSymbols');
  assert.strictEqual(unknownEvent.classification, 'LIVE_EXTERNAL', 'Unknown event must be LIVE_EXTERNAL');

  // Verify economic-calendar-engine.ts file does not contain INDEPENDENT_VERIFIED or syms.add('XAUUSD') fallback
  assert.strictEqual(
    calendarEngineFile.includes("'INDEPENDENT_VERIFIED'"),
    false,
    'economic-calendar-engine.ts must not classify events as INDEPENDENT_VERIFIED'
  );
  assert.strictEqual(
    calendarEngineFile.includes("if (syms.size === 0) syms.add('XAUUSD')"),
    false,
    'economic-calendar-engine.ts must not contain fallback adding XAUUSD to unmapped symbols'
  );

  pass('News timestamp authenticity, collision-resistant deterministic IDs, and calendar LIVE_EXTERNAL single-source provenance verified');
}

// 33. Macro Evidence Truthfulness Hardening
(async () => {
  const macroEngineSource = fs.readFileSync(
    path.join(__dirname, '../src/lib/macro/global-macro-engine.ts'),
    'utf8'
  );
  const { GlobalMacroEngine, globalMacroEngine } = require('../src/lib/macro/global-macro-engine.ts');

  // 1. GlobalMacroEngine.sourceType === 'PUBLIC_FEED'
  assert.strictEqual(
    globalMacroEngine.sourceType,
    'PUBLIC_FEED',
    'Macro engine sourceType must be PUBLIC_FEED'
  );
  assert.strictEqual(
    macroEngineSource.includes("sourceType = 'CENTRAL_BANK'"),
    false,
    'Macro engine must not declare sourceType CENTRAL_BANK'
  );

  // Secondary regression guard: Source text must not contain static fabricated claims
  assert.strictEqual(
    macroEngineSource.includes('confidence: 88'),
    false,
    'Macro engine must not stamp fabricated confidence: 88'
  );
  assert.strictEqual(
    macroEngineSource.includes('latencyMs: 25'),
    false,
    'Macro engine must not contain static latencyMs: 25'
  );

  // -------------------------------------------------------------
  // BEHAVIORAL TESTING UNDER CONTROLLED MOCKED FETCH ENVIRONMENT
  // -------------------------------------------------------------
  const originalFetch = global.fetch;
  const originalDateNow = Date.now;

  try {
    // SCENARIO 1: Fresh GlobalMacroEngine instance reports initial sentinel latencyMs = 0
    global.fetch = async () => {
      throw new Error('Offline network simulation');
    };

    const freshEngine = new GlobalMacroEngine();
    const offlineHealth = await freshEngine.getHealth();
    assert.strictEqual(
      offlineHealth.latencyMs,
      0,
      'Fresh GlobalMacroEngine before any completed request must report latency sentinel 0'
    );
    assert.strictEqual(
      offlineHealth.status,
      'OFFLINE',
      'Offline fresh engine with 0 cached records must be OFFLINE'
    );
    assert.notStrictEqual(
      offlineHealth.latencyMs,
      25,
      'Provider health latency must not be the historical static 25'
    );

    // SCENARIO 2: Valid mock response emits authentic releaseDate, distinct retrieval timestamp, and NO confidence property
    const authenticEpochSec = 1775012345;
    const expectedReleaseIso = new Date(authenticEpochSec * 1000).toISOString();

    const makeValidYahooPayload = (symbol = 'DX-Y.NYB', price = 104.25, prevClose = 104.00, timeSec = authenticEpochSec) => ({
      chart: {
        result: [
          {
            meta: {
              currency: 'USD',
              symbol,
              regularMarketPrice: price,
              chartPreviousClose: prevClose,
              regularMarketTime: timeSec
            }
          }
        ]
      }
    });

    global.fetch = async () => ({
      ok: true,
      json: async () => makeValidYahooPayload()
    });

    const testEngine = new GlobalMacroEngine();
    await testEngine.refreshIndicators();
    const indicators = testEngine.getCachedIndicators();
    assert.strictEqual(indicators.length > 0, true, 'Mocked refresh must produce indicators');

    const dxyRecord = indicators.find((i) => i.name.includes('Dollar'));
    assert.strictEqual(Boolean(dxyRecord), true, 'DXY record must be emitted');

    // Assert authentic releaseDate
    assert.strictEqual(
      dxyRecord.releaseDate,
      expectedReleaseIso,
      'Emitted releaseDate must exactly match authentic regularMarketTime in ISO format'
    );
    assert.strictEqual(
      typeof dxyRecord.timestamp === 'string' && dxyRecord.timestamp.length > 0,
      true,
      'Retrieval timestamp must exist as valid ISO string'
    );
    assert.notStrictEqual(
      dxyRecord.releaseDate,
      dxyRecord.timestamp,
      'releaseDate (observation time) and timestamp (retrieval time) must be semantically distinct'
    );

    // Assert NO own property "confidence"
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(dxyRecord, 'confidence'),
      false,
      'Emitted MacroIndicatorRecord must NOT possess own property "confidence"'
    );
    assert.strictEqual(
      dxyRecord.confidence,
      undefined,
      'MacroIndicatorRecord.confidence must be undefined'
    );

    // Measured latency on completed request cycle
    const postRefreshHealth = await testEngine.getHealth();
    assert.strictEqual(
      typeof postRefreshHealth.latencyMs === 'number',
      true,
      'Health latencyMs must be a number'
    );
    assert.strictEqual(
      postRefreshHealth.latencyMs >= 0,
      true,
      'Health latencyMs must be non-negative measured number'
    );
    assert.notStrictEqual(
      postRefreshHealth.latencyMs,
      25,
      'Post-refresh health latency must not be the historical static 25'
    );

    // SCENARIO 3: Missing, zero, negative, or invalid regularMarketTime fails closed
    const failClosedTimestampCases = [
      { label: 'missing regularMarketTime', meta: { regularMarketPrice: 100, chartPreviousClose: 99 } },
      { label: 'zero regularMarketTime', meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketTime: 0 } },
      { label: 'negative regularMarketTime', meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketTime: -1000 } },
      { label: 'null regularMarketTime', meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketTime: null } },
      { label: 'undefined regularMarketTime', meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketTime: undefined } },
      { label: 'NaN regularMarketTime', meta: { regularMarketPrice: 100, chartPreviousClose: 99, regularMarketTime: NaN } }
    ];

    for (const testCase of failClosedTimestampCases) {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          chart: {
            result: [{ meta: testCase.meta }]
          }
        })
      });

      const failEngine = new GlobalMacroEngine();
      await failEngine.refreshIndicators();
      assert.strictEqual(
        failEngine.getCachedIndicators().length,
        0,
        `Engine must fail closed and emit ZERO records when ${testCase.label}`
      );
    }

    // SCENARIO 4: Materially future regularMarketTime fails closed (> 5 min future)
    const farFutureEpochSec = Math.floor(Date.now() / 1000) + 7200; // 2 hours into future
    global.fetch = async () => ({
      ok: true,
      json: async () => makeValidYahooPayload('DX-Y.NYB', 104.25, 104.00, farFutureEpochSec)
    });

    const futureEngine = new GlobalMacroEngine();
    await futureEngine.refreshIndicators();
    assert.strictEqual(
      futureEngine.getCachedIndicators().length,
      0,
      'Materially future regularMarketTime (> 5m) must fail closed and emit zero records'
    );

    // SCENARIO 5: NaN, Infinity, -Infinity current value fails closed
    const nonFiniteCurrentCases = [
      { label: 'NaN current', val: NaN },
      { label: 'Infinity current', val: Infinity },
      { label: '-Infinity current', val: -Infinity },
      { label: 'null current', val: null },
      { label: 'undefined current', val: undefined },
      { label: 'string current', val: '104.25' }
    ];

    for (const testCase of nonFiniteCurrentCases) {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: {
                  regularMarketPrice: testCase.val,
                  chartPreviousClose: 104.00,
                  regularMarketTime: authenticEpochSec
                }
              }
            ]
          }
        })
      });

      const nonFiniteEngine = new GlobalMacroEngine();
      await nonFiniteEngine.refreshIndicators();
      assert.strictEqual(
        nonFiniteEngine.getCachedIndicators().length,
        0,
        `Non-finite/unusable current value (${testCase.label}) must fail closed and emit zero records`
      );
    }

    // SCENARIO 6: Missing/invalid previous close fails closed; NEVER fabricates delta = 0 or previous = current
    const invalidPreviousCases = [
      { label: 'missing chartPreviousClose', meta: { regularMarketPrice: 104.25, regularMarketTime: authenticEpochSec } },
      { label: 'null chartPreviousClose', meta: { regularMarketPrice: 104.25, chartPreviousClose: null, regularMarketTime: authenticEpochSec } },
      { label: 'NaN chartPreviousClose', meta: { regularMarketPrice: 104.25, chartPreviousClose: NaN, regularMarketTime: authenticEpochSec } },
      { label: 'Infinity chartPreviousClose', meta: { regularMarketPrice: 104.25, chartPreviousClose: Infinity, regularMarketTime: authenticEpochSec } },
      { label: 'zero chartPreviousClose', meta: { regularMarketPrice: 104.25, chartPreviousClose: 0, regularMarketTime: authenticEpochSec } },
      { label: 'negative chartPreviousClose', meta: { regularMarketPrice: 104.25, chartPreviousClose: -10, regularMarketTime: authenticEpochSec } }
    ];

    for (const testCase of invalidPreviousCases) {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                meta: testCase.meta
              }
            ]
          }
        })
      });

      const prevFailEngine = new GlobalMacroEngine();
      await prevFailEngine.refreshIndicators();
      assert.strictEqual(
        prevFailEngine.getCachedIndicators().length,
        0,
        `Missing/invalid previous close (${testCase.label}) must fail closed rather than manufacturing zero delta or previous = current`
      );
    }

    // SCENARIO 7: Cached record freshness ages dynamically through getCachedIndicators() without receiving new upstream data
    // Seed with valid record at observation time T_obs
    const baseObsTimeSec = 1775000000;
    const baseObsTimeMs = baseObsTimeSec * 1000;
    global.fetch = async () => ({
      ok: true,
      json: async () => makeValidYahooPayload('DX-Y.NYB', 104.25, 104.00, baseObsTimeSec)
    });

    const agingEngine = new GlobalMacroEngine();
    // Ingest while simulated clock is at T_obs + 1h
    Date.now = () => baseObsTimeMs + (1 * 3600 * 1000);
    await agingEngine.refreshIndicators();

    // Call getCachedIndicators() at ~2h age
    Date.now = () => baseObsTimeMs + (2 * 3600 * 1000);
    const indicatorsAt2h = agingEngine.getCachedIndicators();
    assert.strictEqual(indicatorsAt2h.length > 0, true, 'Seeded aging record exists in cache');
    const recordAt2h = indicatorsAt2h[0];
    const initialReleaseDate = recordAt2h.releaseDate;
    const initialRetrievalTimestamp = recordAt2h.timestamp;
    assert.strictEqual(recordAt2h.freshness, 'CURRENT', 'At ~2h observation age, public cache freshness must be CURRENT');

    // Call getCachedIndicators() at ~12h age without refreshing upstream
    Date.now = () => baseObsTimeMs + (12 * 3600 * 1000);
    const indicatorsAt12h = agingEngine.getCachedIndicators();
    const recordAt12h = indicatorsAt12h[0];
    assert.strictEqual(recordAt12h.freshness, 'DELAYED', 'At ~12h observation age, public cache freshness must dynamically age to DELAYED');
    assert.strictEqual(recordAt12h.releaseDate, initialReleaseDate, 'releaseDate must remain unchanged');
    assert.strictEqual(recordAt12h.timestamp, initialRetrievalTimestamp, 'retrieval timestamp must remain unchanged');

    // Call getCachedIndicators() at ~48h age without refreshing upstream
    Date.now = () => baseObsTimeMs + (48 * 3600 * 1000);
    const indicatorsAt48h = agingEngine.getCachedIndicators();
    const recordAt48h = indicatorsAt48h[0];
    assert.strictEqual(recordAt48h.freshness, 'STALE', 'At ~48h observation age, public cache freshness must dynamically age to STALE');
    assert.strictEqual(recordAt48h.releaseDate, initialReleaseDate, 'releaseDate must remain unchanged');
    assert.strictEqual(recordAt48h.timestamp, initialRetrievalTimestamp, 'retrieval timestamp must remain unchanged');

    // SCENARIO 8: Full refresh failure with existing cached records:
    // Captures lastSuccess before failure, then asserts lastSuccess DOES NOT advance on failed refresh
    Date.now = () => baseObsTimeMs + (49 * 3600 * 1000);
    const healthyHealthBeforeFailure = await agingEngine.getHealth();
    const lastSuccessBeforeFailure = healthyHealthBeforeFailure.lastSuccess;
    assert.strictEqual(
      Boolean(lastSuccessBeforeFailure),
      true,
      'Initial successful refresh must have populated lastSuccess'
    );

    // Advance simulated clock by 5 hours so any accidental advancement would be distinct
    Date.now = () => baseObsTimeMs + (54 * 3600 * 1000);

    // Simulate complete network failure
    global.fetch = async () => {
      throw new Error('Network failure');
    };

    await agingEngine.refreshIndicators();
    const indicatorsAfterFailure = agingEngine.getCachedIndicators();
    assert.strictEqual(
      indicatorsAfterFailure.length,
      indicatorsAt2h.length,
      'Existing cache must be retained on full failure'
    );
    assert.strictEqual(
      indicatorsAfterFailure[0].releaseDate,
      initialReleaseDate,
      'Authentic releaseDate must remain intact on failure'
    );

    const degradedHealth = await agingEngine.getHealth();
    assert.strictEqual(
      degradedHealth.status,
      'DEGRADED',
      'Provider health must be DEGRADED on refresh failure with existing cache'
    );
    assert.strictEqual(
      degradedHealth.errorCount > 0,
      true,
      'Error count must truthfully increment on failure'
    );
    assert.strictEqual(
      degradedHealth.lastSuccess,
      lastSuccessBeforeFailure,
      'ProviderHealth.lastSuccess must remain EXACTLY equal to the value before failure and NOT advance'
    );

    // SCENARIO 9: Partial refresh:
    // 1 metric succeeds, others fail. Health must be DEGRADED. Failed metrics retain cached records.
    const partialEngine = new GlobalMacroEngine();
    Date.now = () => baseObsTimeMs + (55 * 3600 * 1000);
    // First, populate full healthy cache with 4 metrics
    global.fetch = async (url) => {
      return {
        ok: true,
        json: async () => makeValidYahooPayload('TEST', 100, 99, Math.floor(Date.now() / 1000) - 3600)
      };
    };
    await partialEngine.refreshIndicators();
    const fullInitialHealth = await partialEngine.getHealth();
    assert.strictEqual(fullInitialHealth.status, 'HEALTHY', 'Full refresh with all 4 metrics must be HEALTHY');
    assert.strictEqual(fullInitialHealth.errorCount, 0, 'Full refresh has errorCount 0');

    // Next cycle: Only DXY succeeds, others fail
    Date.now = () => baseObsTimeMs + (56 * 3600 * 1000);
    global.fetch = async (url) => {
      if (url.includes('DX-Y.NYB')) {
        return {
          ok: true,
          json: async () => makeValidYahooPayload('DX-Y.NYB', 105.50, 104.25, Math.floor(Date.now() / 1000) - 1800)
        };
      }
      return { ok: false, status: 500 };
    };

    await partialEngine.refreshIndicators();
    const partialHealth = await partialEngine.getHealth();
    assert.strictEqual(
      partialHealth.status,
      'DEGRADED',
      'Partial refresh where only some metrics succeed must report DEGRADED'
    );
    assert.strictEqual(
      partialHealth.errorCount > 0,
      true,
      'Partial refresh failure must reflect error state'
    );

    const partialRecords = partialEngine.getCachedIndicators();
    assert.strictEqual(partialRecords.length, 4, 'Partial refresh must preserve prior genuine records for failed metrics');
    const updatedDxy = partialRecords.find((i) => i.name.includes('Dollar'));
    assert.strictEqual(updatedDxy.currentValue, 105.50, 'Successful metric must update with newest value');

    // SCENARIO 10: Complete successful refresh restores HEALTHY
    Date.now = () => baseObsTimeMs + (57 * 3600 * 1000);
    global.fetch = async () => ({
      ok: true,
      json: async () => makeValidYahooPayload('TEST', 101, 100, Math.floor(Date.now() / 1000) - 1200)
    });

    await partialEngine.refreshIndicators();
    const recoveredHealth = await partialEngine.getHealth();
    assert.strictEqual(
      recoveredHealth.status,
      'HEALTHY',
      'Complete successful refresh after degradation must restore HEALTHY status'
    );
    assert.strictEqual(
      recoveredHealth.errorCount,
      0,
      'Error count must reset to 0 upon complete success'
    );

  } finally {
    // TEST ISOLATION: Always restore global fetch and Date.now
    global.fetch = originalFetch;
    Date.now = originalDateNow;
  }

  // DXY naming: US Dollar Index (DXY) without false Trade-Weighted claim
  assert.strictEqual(
    macroEngineSource.includes("'DXY Trade-Weighted Dollar Index'"),
    false,
    'Must not misidentify DX-Y.NYB as trade-weighted dollar index'
  );
  assert.strictEqual(
    macroEngineSource.includes("'US Dollar Index (DXY)'"),
    true,
    'Must name DX-Y.NYB accurately as US Dollar Index (DXY)'
  );

  // Execution invariants strictly maintained
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY');
  pass('Macro evidence truthfulness, measured latency, authentic releaseDate, and derived freshness verified');

  // =================================================================
  // 34. Geopolitical Intelligence Truthfulness Hardening
  // =================================================================
  const geoEngineSource = fs.readFileSync(
    path.join(__dirname, '../src/lib/geopolitical/geopolitical-engine.ts'),
    'utf8'
  );
  const { GeopoliticalEngine, geopoliticalEngine } = require('../src/lib/geopolitical/geopolitical-engine.ts');
  const { globalNewsEngine } = require('../src/lib/news/global-news-engine.ts');

  // Source inspection: Ensure purged static artifacts and uncorroborated CONFIRMED/INDEPENDENT_VERIFIED
  assert.strictEqual(
    geoEngineSource.includes("latencyMs: 15"),
    false,
    'Must not hardcode latencyMs: 15'
  );
  assert.strictEqual(
    geoEngineSource.includes("Baseline supply flows operational"),
    false,
    'Must not include unsupported claim: Baseline supply flows operational'
  );
  assert.strictEqual(
    geoEngineSource.includes("classification: 'INDEPENDENT_VERIFIED'"),
    false,
    'Geopolitical engine must not claim INDEPENDENT_VERIFIED for derived assessments'
  );

  // Behavioral test suite for GeopoliticalEngine with controlled news engine responses
  const originalGetLatestNews = globalNewsEngine.getLatestNews;
  const originalNewsGetHealth = globalNewsEngine.getHealth;
  const originalDateNowGeo = Date.now;

  try {
    const testGeoEngine = new GeopoliticalEngine();

    // SUB-REQUIREMENT A: False-positive rejection
    // Commercial, equity, labor, regulatory, corporate idioms, and non-sovereign trade commentary must NEVER qualify
    const falsePositiveHeadlines = [
      {
        id: 'news-crwd-52w',
        headline: 'Why Did CRWD, TWLO, P Stocks Hit 52-Week Highs Today?',
        summary: 'Cloud and security software stocks rally to 52-week highs amid solid earnings.',
        source: 'MarketWatch',
        publishedAt: '2026-10-02T10:00:00Z',
        epochMs: 1790935200000,
        symbols: ['CRWD', 'TWLO'],
        relevanceScore: 0.8,
        impactTier: 'LOW',
        sentimentBias: 'BULLISH',
        classification: 'LIVE_EXTERNAL',
        region: 'US'
      },
      {
        id: 'news-bmo-loan',
        headline: 'BMO reports surge in commercial loan demand across North American branches',
        summary: 'Commercial lending expansion reflects corporate borrowing appetite.',
        source: 'Reuters',
        publishedAt: '2026-10-02T10:15:00Z',
        epochMs: 1790936100000,
        symbols: ['BMO'],
        relevanceScore: 0.7,
        impactTier: 'LOW',
        sentimentBias: 'BULLISH',
        classification: 'LIVE_EXTERNAL',
        region: 'US'
      },
      {
        id: 'news-price-war',
        headline: 'Supermarket giant sparks fierce price war with discount rivals',
        summary: 'Retailers engage in price war cutting grocery margins.',
        source: 'Bloomberg',
        publishedAt: '2026-10-02T10:30:00Z',
        epochMs: 1790937000000,
        symbols: [],
        relevanceScore: 0.5,
        impactTier: 'LOW',
        sentimentBias: 'NEUTRAL',
        classification: 'LIVE_EXTERNAL',
        region: 'UK'
      },
      {
        id: 'news-war-chest',
        headline: 'Tech giant builds massive war chest for artificial intelligence acquisitions',
        summary: 'Company accumulates cash reserves and debt facility to finance acquisitions.',
        source: 'Financial Times',
        publishedAt: '2026-10-02T10:35:00Z',
        epochMs: 1790937300000,
        symbols: [],
        relevanceScore: 0.5,
        impactTier: 'LOW',
        sentimentBias: 'NEUTRAL',
        classification: 'LIVE_EXTERNAL',
        region: 'US'
      },
      {
        id: 'news-generic-trade-war',
        headline: 'Commentators debate whether retail competition resembles a trade war',
        summary: 'Economists discuss market dynamics and corporate rivalry between retail giants.',
        source: 'Bloomberg',
        publishedAt: '2026-10-02T10:40:00Z',
        epochMs: 1790937600000,
        symbols: [],
        relevanceScore: 0.4,
        impactTier: 'LOW',
        sentimentBias: 'NEUTRAL',
        classification: 'LIVE_EXTERNAL',
        region: 'GLOBAL'
      },
      {
        id: 'news-labor-strike',
        headline: 'Dock workers union votes for labor strike over wage dispute',
        summary: 'Port authority faces worker strike following contract deadlock.',
        source: 'Associated Press',
        publishedAt: '2026-10-02T10:45:00Z',
        epochMs: 1790937900000,
        symbols: [],
        relevanceScore: 0.6,
        impactTier: 'MEDIUM',
        sentimentBias: 'BEARISH',
        classification: 'LIVE_EXTERNAL',
        region: 'US'
      },
      {
        id: 'news-strike-price',
        headline: 'Options trading volumes surge at $2700 strike price for gold contracts',
        summary: 'Derivative traders position for expiration at $2700 strike price.',
        source: 'Financial Times',
        publishedAt: '2026-10-02T11:00:00Z',
        epochMs: 1790938800000,
        symbols: ['XAUUSD'],
        relevanceScore: 0.9,
        impactTier: 'MEDIUM',
        sentimentBias: 'NEUTRAL',
        classification: 'LIVE_EXTERNAL',
        region: 'GLOBAL'
      },
      {
        id: 'news-cybersec',
        headline: 'Tech firm rolls out critical cybersecurity patch to fix software vulnerability',
        summary: 'Security patch addresses zero-day vulnerability across cloud systems.',
        source: 'TechCrunch',
        publishedAt: '2026-10-02T11:15:00Z',
        epochMs: 1790939700000,
        symbols: [],
        relevanceScore: 0.4,
        impactTier: 'LOW',
        sentimentBias: 'NEUTRAL',
        classification: 'LIVE_EXTERNAL',
        region: 'GLOBAL'
      },
      {
        id: 'news-trade-deficit',
        headline: 'US trade deficit narrows slightly in second quarter economic report',
        summary: 'Commerce department reports monthly trade deficit data.',
        source: 'CNBC',
        publishedAt: '2026-10-02T11:30:00Z',
        epochMs: 1790940600000,
        symbols: [],
        relevanceScore: 0.6,
        impactTier: 'MEDIUM',
        sentimentBias: 'NEUTRAL',
        classification: 'LIVE_EXTERNAL',
        region: 'US'
      }
    ];

    globalNewsEngine.getLatestNews = async () => falsePositiveHeadlines;
    await testGeoEngine.refreshAlerts();

    const falsePositiveAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(
      falsePositiveAlerts.length,
      0,
      'Commercial, equity, labor, war chest, options strike, and cybersecurity news must yield ZERO geopolitical alerts'
    );

    // SUB-REQUIREMENT B: SOURCE INDEPENDENCE & CORROBORATION
    // A) Reuters + Reuters alias/casing variation => DEVELOPING
    const casingSourceItems = [
      {
        id: 'news-case-1',
        headline: 'Naval escort requested following maritime security advisory in Baltic Sea',
        summary: 'Defense advisory notes navigation hazard and naval monitoring.',
        source: 'Reuters News Wire',
        publishedAt: '2026-10-02T12:00:00Z'
      },
      {
        id: 'news-case-2',
        headline: 'Baltic maritime security advisory prompts request for naval escort',
        summary: 'Follow-up bulletin on Baltic shipping advisory.',
        source: '  THOMSON REUTERS  ',
        publishedAt: '2026-10-02T12:05:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => casingSourceItems;
    await testGeoEngine.refreshAlerts();
    const casingAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(
      casingAlerts[0].status,
      'DEVELOPING',
      'Reuters + Reuters alias/casing variation must remain DEVELOPING'
    );

    // B) PR Newswire + Business Wire => DEVELOPING
    const prBusinessWireItems = [
      {
        id: 'news-pr-1',
        headline: 'Naval escort requested following maritime security advisory in Baltic Sea',
        summary: 'Defense advisory notes navigation hazard and naval monitoring.',
        source: 'PR Newswire',
        publishedAt: '2026-10-02T12:00:00Z'
      },
      {
        id: 'news-bw-1',
        headline: 'Baltic maritime security advisory prompts request for naval escort',
        summary: 'Follow-up bulletin on Baltic shipping advisory.',
        source: 'Business Wire',
        publishedAt: '2026-10-02T12:05:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => prBusinessWireItems;
    await testGeoEngine.refreshAlerts();
    const prBwAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(
      prBwAlerts[0].status,
      'DEVELOPING',
      'PR Newswire + Business Wire must remain DEVELOPING (syndicates cannot establish independent corroboration)'
    );

    // C) Unknown Publisher Alpha + Unknown Publisher Beta => DEVELOPING
    const unknownPublishersItems = [
      {
        id: 'news-unk-1',
        headline: 'Naval escort requested following maritime security advisory in Baltic Sea',
        summary: 'Defense advisory notes navigation hazard and naval monitoring.',
        source: 'Publisher Alpha News',
        publishedAt: '2026-10-02T12:00:00Z'
      },
      {
        id: 'news-unk-2',
        headline: 'Baltic maritime security advisory prompts request for naval escort',
        summary: 'Follow-up bulletin on Baltic shipping advisory.',
        source: 'Publisher Beta Dispatch',
        publishedAt: '2026-10-02T12:05:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => unknownPublishersItems;
    await testGeoEngine.refreshAlerts();
    const unkAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(
      unkAlerts[0].status,
      'DEVELOPING',
      'Unknown Publisher Alpha + Unknown Publisher Beta must remain DEVELOPING'
    );

    // D) Unknown Publisher + Reuters => DEVELOPING
    const unkAndReutersItems = [
      {
        id: 'news-unk-r1',
        headline: 'Naval escort requested following maritime security advisory in Baltic Sea',
        summary: 'Defense advisory notes navigation hazard and naval monitoring.',
        source: 'Publisher Gamma Wire',
        publishedAt: '2026-10-02T12:00:00Z'
      },
      {
        id: 'news-unk-r2',
        headline: 'Baltic maritime security advisory prompts request for naval escort',
        summary: 'Follow-up bulletin on Baltic shipping advisory.',
        source: 'Reuters',
        publishedAt: '2026-10-02T12:05:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => unkAndReutersItems;
    await testGeoEngine.refreshAlerts();
    const unkReutersAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(
      unkReutersAlerts[0].status,
      'DEVELOPING',
      'Unknown Publisher + Reuters must remain DEVELOPING (requires >= 2 eligible families)'
    );

    // E) Reuters + Associated Press for the same event => CONFIRMED
    const independentSourceItems = [
      {
        id: 'news-indep-1',
        headline: 'Missile attack strikes commercial tanker in southern Red Sea corridor',
        summary: 'Naval forces report ballistic missile attack targeting cargo ship off Yemen coast near Bab el-Mandeb.',
        source: 'Reuters',
        publishedAt: '2026-10-02T12:00:00Z'
      },
      {
        id: 'news-indep-2',
        headline: 'Commercial vessel hit by missile strike in Red Sea transit lane',
        summary: 'UK maritime trade operations confirms missile strike against merchant tanker near Yemen.',
        source: 'Associated Press',
        publishedAt: '2026-10-02T12:05:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => independentSourceItems;
    await testGeoEngine.refreshAlerts();
    const indepAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(
      indepAlerts[0].status,
      'CONFIRMED',
      'Reuters + Associated Press for the same event must achieve CONFIRMED'
    );

    // F) Reuters + AP + syndicated duplicate => CONFIRMED based only on Reuters + AP (syndicated contributes zero weight)
    const indepPlusSyndicatedItems = [
      {
        id: 'news-indep-f1',
        headline: 'Missile attack strikes commercial tanker in southern Red Sea corridor',
        summary: 'Naval forces report ballistic missile attack targeting cargo ship off Yemen coast near Bab el-Mandeb.',
        source: 'Reuters',
        publishedAt: '2026-10-02T12:00:00Z'
      },
      {
        id: 'news-indep-f2',
        headline: 'Commercial vessel hit by missile strike in Red Sea transit lane',
        summary: 'UK maritime trade operations confirms missile strike against merchant tanker near Yemen.',
        source: 'Associated Press',
        publishedAt: '2026-10-02T12:05:00Z'
      },
      {
        id: 'news-indep-f3',
        headline: 'Commercial vessel damaged in Red Sea missile attack',
        summary: 'Syndicated wire copy of maritime incident.',
        source: 'GlobeNewswire Feed',
        publishedAt: '2026-10-02T12:06:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => indepPlusSyndicatedItems;
    await testGeoEngine.refreshAlerts();
    const indepSynAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(
      indepSynAlerts[0].status,
      'CONFIRMED',
      'Reuters + AP + syndicated duplicate must be CONFIRMED strictly from Reuters + AP'
    );

    // G) Two syndicated versions with different normalized strings => DEVELOPING
    const twoDiffSyndicatedItems = [
      {
        id: 'news-syn-g1',
        headline: 'Naval escort requested following maritime security advisory in Baltic Sea',
        summary: 'Defense advisory notes navigation hazard and naval monitoring.',
        source: 'PR Newswire Wire Service',
        publishedAt: '2026-10-02T12:00:00Z'
      },
      {
        id: 'news-syn-g2',
        headline: 'Baltic maritime security advisory prompts request for naval escort',
        summary: 'Follow-up bulletin on Baltic shipping advisory.',
        source: 'GlobeNewswire Syndicate Feed',
        publishedAt: '2026-10-02T12:05:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => twoDiffSyndicatedItems;
    await testGeoEngine.refreshAlerts();
    const twoDiffSynAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(
      twoDiffSynAlerts[0].status,
      'DEVELOPING',
      'Two syndicated versions with different normalized strings must remain DEVELOPING'
    );

    // SUB-REQUIREMENT C: ASSET MAPPING REQUIRES EXPLICIT TRANSMISSION CHANNEL
    // A) Taiwan live-fire drill with no gold/oil/FX transmission: affectedCommodities === []
    const taiwanNoAssetItem = [
      {
        id: 'news-taiwan-drill',
        headline: 'Naval deployment and live-fire drills surrounding Taiwan Strait reported',
        summary: 'Defense ministry monitors carrier strike group deployed and air patrols near Taiwan.',
        source: 'Bloomberg',
        publishedAt: '2026-10-02T12:15:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => taiwanNoAssetItem;
    await testGeoEngine.refreshAlerts();
    const taiwanAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(taiwanAlerts.length, 1, 'Taiwan drill qualifies for geopolitical monitoring');
    assert.deepStrictEqual(
      taiwanAlerts[0].affectedCommodities,
      [],
      'Taiwan live-fire drill without stated transmission must have affectedCommodities: [] (no automatic XAUUSD)'
    );
    assert.strictEqual(
      taiwanAlerts[0].marketImpactAssessment.includes('No direct asset transmission is established'),
      true,
      'Assessment must state no direct asset transmission is established'
    );

    // B) Red Sea missile attack on a generic commercial vessel with no stated energy cargo/transmission:
    // No automatic XAUUSD, no automatic USOIL
    const redSeaGenericVessel = [
      {
        id: 'news-redsea-generic',
        headline: 'Missile attack strikes cargo ship in southern Red Sea corridor',
        summary: 'Naval forces report ballistic missile attack targeting commercial container ship off Yemen coast near Bab el-Mandeb.',
        source: 'Reuters',
        publishedAt: '2026-10-02T12:20:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => redSeaGenericVessel;
    await testGeoEngine.refreshAlerts();
    const genericVesselAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(genericVesselAlerts.length, 1, 'Generic Red Sea attack qualifies');
    assert.deepStrictEqual(
      genericVesselAlerts[0].affectedCommodities,
      [],
      'Red Sea attack on generic cargo vessel must not automatically map USOIL or XAUUSD'
    );

    // C) Red Sea attack explicitly involving an oil tanker / energy shipping disruption:
    // USOIL may be present, XAUUSD must still be absent unless gold/safe-haven is explicitly reported
    const redSeaOilTanker = [
      {
        id: 'news-redsea-oil',
        headline: 'Missile attack strikes crude oil tanker in Red Sea energy transit corridor',
        summary: 'Naval forces report damage to oil tanker carrying petroleum, causing energy shipping disruption near Bab el-Mandeb.',
        source: 'Reuters',
        publishedAt: '2026-10-02T12:25:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => redSeaOilTanker;
    await testGeoEngine.refreshAlerts();
    const oilTankerAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(oilTankerAlerts.length, 1, 'Oil tanker event qualifies');
    assert.strictEqual(oilTankerAlerts[0].affectedCommodities.includes('USOIL'), true, 'Explicit crude oil tanker attack must map USOIL');
    assert.strictEqual(oilTankerAlerts[0].affectedCommodities.includes('XAUUSD'), false, 'XAUUSD must remain absent when only oil transmission is reported');
    assert.strictEqual(
      oilTankerAlerts[0].marketImpactAssessment.includes('energy/petroleum'),
      true,
      'Assessment must explicitly cite energy/petroleum transmission'
    );

    // D) Geopolitical report explicitly reporting gold safe-haven transmission:
    // XAUUSD may be present
    const goldTransmissionItem = [
      {
        id: 'news-gold-safehaven',
        headline: 'Air strike reported in Middle East as spot gold rose on safe-haven demand',
        summary: 'Military strike near regional border prompts safe-haven flows into gold as traders seek protection.',
        source: 'Bloomberg',
        publishedAt: '2026-10-02T12:30:00Z'
      }
    ];
    globalNewsEngine.getLatestNews = async () => goldTransmissionItem;
    await testGeoEngine.refreshAlerts();
    const goldAlerts = testGeoEngine.getCachedAlerts();
    assert.strictEqual(goldAlerts.length, 1, 'Gold transmission event qualifies');
    assert.strictEqual(goldAlerts[0].affectedCommodities.includes('XAUUSD'), true, 'Explicit safe-haven gold demand must map XAUUSD');
    assert.strictEqual(
      goldAlerts[0].marketImpactAssessment.includes('gold/safe-haven'),
      true,
      'Assessment must explicitly cite gold/safe-haven transmission'
    );

    // SUB-REQUIREMENT D: CLUSTERING INTEGRITY
    // 1. Same Red Sea tanker event with different wording => same cluster
    const clusterTestEngine = new GeopoliticalEngine();
    const cluster1 = clusterTestEngine.extractClusterKey(
      'Missile attack strikes oil tanker in Red Sea',
      'Yemen coastal strike against commercial vessel in Bab el-Mandeb',
      'MIDDLE_EAST',
      'KINETIC_MILITARY_ACTION'
    );
    const cluster2 = clusterTestEngine.extractClusterKey(
      'Commercial tanker hit by missile near Bab el-Mandeb in Red Sea transit lane',
      'Naval operations report missile damage to vessel',
      'MIDDLE_EAST',
      'KINETIC_MILITARY_ACTION'
    );
    assert.strictEqual(cluster1, cluster2, 'Same Red Sea tanker missile event with different phrasing must cluster identically');

    // 2. Unrelated Middle East missile events in different locations/targets => separate clusters
    const clusterLevant = clusterTestEngine.extractClusterKey(
      'Airstrike barrage hits military airbase in Lebanon',
      'Rocket attack against outpost',
      'MIDDLE_EAST',
      'KINETIC_MILITARY_ACTION'
    );
    assert.notStrictEqual(cluster1, clusterLevant, 'Red Sea vessel event and Lebanon airbase event must NOT be merged into same cluster');

    // SUB-REQUIREMENT E: TIMESTAMP HARDENING & CLOCK SKEW TOLERANCE
    const baseTimeMs = 1790940000000;
    Date.now = () => baseTimeMs;

    // 1. Missing timestamp => rejected
    const missingDateItem = [{
      id: 'news-missing',
      headline: 'Airstrike reported near border outpost',
      summary: 'Military strike reported in conflict zone.',
      source: 'Reuters',
      publishedAt: undefined
    }];
    globalNewsEngine.getLatestNews = async () => missingDateItem;
    const timeEngine = new GeopoliticalEngine();
    await timeEngine.refreshAlerts();
    assert.strictEqual(timeEngine.getCachedAlerts().length, 0, 'Missing timestamp must fail-closed');

    // 2. Invalid date string => rejected
    const invalidDateItem = [{
      id: 'news-invalid',
      headline: 'Airstrike reported near border outpost',
      summary: 'Military strike reported in conflict zone.',
      source: 'Reuters',
      publishedAt: 'not-a-valid-date-string'
    }];
    globalNewsEngine.getLatestNews = async () => invalidDateItem;
    await timeEngine.refreshAlerts();
    assert.strictEqual(timeEngine.getCachedAlerts().length, 0, 'Invalid date string must fail-closed');

    // 3. >5 minutes future => rejected
    const futureDateItem = [{
      id: 'news-future',
      headline: 'Airstrike reported near border outpost',
      summary: 'Military strike reported in conflict zone.',
      source: 'Reuters',
      publishedAt: new Date(baseTimeMs + (10 * 60 * 1000)).toISOString() // +10 min
    }];
    globalNewsEngine.getLatestNews = async () => futureDateItem;
    await timeEngine.refreshAlerts();
    assert.strictEqual(timeEngine.getCachedAlerts().length, 0, 'Timestamp >5m in future must be rejected');

    // 4. Within allowed clock skew (+3 minutes) => accepted
    const acceptableSkewItem = [{
      id: 'news-skew',
      headline: 'Airstrike reported near border outpost',
      summary: 'Military strike reported in conflict zone.',
      source: 'Reuters',
      publishedAt: new Date(baseTimeMs + (3 * 60 * 1000)).toISOString() // +3 min
    }];
    globalNewsEngine.getLatestNews = async () => acceptableSkewItem;
    await timeEngine.refreshAlerts();
    assert.strictEqual(timeEngine.getCachedAlerts().length, 1, 'Timestamp within 5m future clock skew must be accepted');

    // 5. Older than 7 days => rejected
    const oldDateItem = [{
      id: 'news-old',
      headline: 'Airstrike reported near border outpost',
      summary: 'Military strike reported in conflict zone.',
      source: 'Reuters',
      publishedAt: new Date(baseTimeMs - (8 * 24 * 3600 * 1000)).toISOString() // 8 days old
    }];
    globalNewsEngine.getLatestNews = async () => oldDateItem;
    await timeEngine.refreshAlerts();
    assert.strictEqual(timeEngine.getCachedAlerts().length, 0, 'Timestamp older than 7 days must be rejected');

    // 6. Cached alert crossing 7-day boundary => pruned dynamically by getCachedAlerts()
    const alertCrossingBoundary = [{
      id: 'news-boundary',
      headline: 'Airstrike reported near border outpost',
      summary: 'Military strike reported in conflict zone.',
      source: 'Reuters',
      publishedAt: new Date(baseTimeMs - (6.9 * 24 * 3600 * 1000)).toISOString() // 6.9 days old
    }];
    globalNewsEngine.getLatestNews = async () => alertCrossingBoundary;
    await timeEngine.refreshAlerts();
    assert.strictEqual(timeEngine.getCachedAlerts().length, 1, 'Freshly fetched alert within 7 days is returned');

    // Advance time by 0.5 days so age becomes 7.4 days without calling refreshAlerts()
    Date.now = () => baseTimeMs + (0.5 * 24 * 3600 * 1000);
    assert.strictEqual(
      timeEngine.getCachedAlerts().length,
      0,
      'Cached alert crossing 7-day age boundary must disappear dynamically without waiting for refresh'
    );

    // SUB-REQUIREMENT F: HEALTH / CACHE / EMPTY-RESULT TTL
    let fetchCount = 0;
    globalNewsEngine.getLatestNews = async () => {
      fetchCount += 1;
      return []; // Zero qualifying news
    };

    const cachingEngine = new GeopoliticalEngine();
    let simTime = baseTimeMs;
    Date.now = () => simTime;

    // First call: triggers initial fetch
    const firstCallAlerts = await cachingEngine.getGeopoliticalAlerts();
    assert.strictEqual(firstCallAlerts.length, 0, 'First call with zero qualifying news returns empty array');
    assert.strictEqual(fetchCount, 1, 'First call must invoke upstream fetch once');

    // Second call 30s later (within 120s TTL): must NOT re-fetch even though alerts array is empty
    simTime += 30_000;
    const secondCallAlerts = await cachingEngine.getGeopoliticalAlerts();
    assert.strictEqual(secondCallAlerts.length, 0, 'Second call returns empty array');
    assert.strictEqual(fetchCount, 1, 'Second call within TTL must not re-fetch upstream news');

    // Third call 150s later (TTL expired): must re-fetch
    simTime += 120_000;
    const thirdCallAlerts = await cachingEngine.getGeopoliticalAlerts();
    assert.strictEqual(thirdCallAlerts.length, 0, 'Third call returns empty array');
    assert.strictEqual(fetchCount, 2, 'Call after TTL expiration must refresh upstream news');

    // Health reporting and latency truthfulness
    globalNewsEngine.getHealth = async () => ({
      providerId: 'global-news-engine',
      name: 'Global News Wire Aggregator',
      sourceType: 'FINANCIAL_NEWS',
      status: 'HEALTHY',
      latencyMs: 40,
      lastChecked: new Date(simTime).toISOString(),
      errorCount: 0,
      rateLimit: { isThrottled: false },
      isFreeTier: true
    });

    const health = await cachingEngine.getHealth();
    assert.strictEqual(health.status, 'HEALTHY', 'Empty alerts with successful refresh must report HEALTHY status');
    assert.strictEqual(typeof health.latencyMs, 'number', 'Latency must be numerical');
    assert.strictEqual(health.latencyMs >= 0, true, 'Latency must be non-negative');
    assert.strictEqual(health.errorCount, 0, 'Zero errors on successful empty refresh');

    // Upstream degradation propagation
    globalNewsEngine.getHealth = async () => ({
      providerId: 'global-news-engine',
      name: 'Global News Wire Aggregator',
      sourceType: 'FINANCIAL_NEWS',
      status: 'OFFLINE',
      latencyMs: 0,
      lastChecked: new Date(simTime).toISOString(),
      errorCount: 5,
      rateLimit: { isThrottled: false },
      isFreeTier: true
    });

    const degradedHealth = await cachingEngine.getHealth();
    assert.strictEqual(degradedHealth.status, 'OFFLINE', 'Upstream news offline state must propagate to geopolitical engine');
    assert.strictEqual(degradedHealth.errorCount >= 5, true, 'Upstream error count must be reflected in health');

  } finally {
    // Restore mocks
    globalNewsEngine.getLatestNews = originalGetLatestNews;
    globalNewsEngine.getHealth = originalNewsGetHealth;
    Date.now = originalDateNowGeo;
  }

  // Execution invariants strictly maintained
  assert.strictEqual(CANONICAL_EXECUTION_MODE, 'READ_ONLY');
  assert.strictEqual(MT5_ORDER_TRANSPORT_ENABLED, false);

  pass('Geopolitical intelligence truthfulness, strict qualification, corridor mapping, and corroboration verified');

  console.log(`\n=================================================================`);
  console.log(`ALL ${passedCount}/34 TRUTHFULNESS REGRESSION TESTS PASSED CLEANLY.`);
  console.log(`=================================================================`);
})().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
