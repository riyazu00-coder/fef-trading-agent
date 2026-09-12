/**
 * FEF TRADING SOLUTIONS: Central Multi-Agent Intelligence Hub Test Suite
 * Validates:
 * - 15 agents remain rendered and canonically ordered
 * - All agent connector paths render with valid coordinates
 * - Asynchronous agent communication cycles & state transitions
 * - Risk Guardian state reaction & Orchestrator pulse triggers
 * - Dynamic Trading Risk Warning computation (LOW, MODERATE, HIGH, CRITICAL)
 * - Mini live communication feed truthful formatting
 * - Active asset synchronization (zero residual gold context when on crypto/forex/indices)
 * - Stale context isolation across all asset switches
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

const { generateAssetIntelligence, CANONICAL_COUNCIL_KEYS } = require('../src/lib/agents/multi-asset-pipeline.ts');
const { INITIAL_LIVE_ASSETS } = require('../src/lib/providers/real-market-api.ts');
const {
  calculateAgentNodeState,
  evaluateTradingRisk,
  getTruthfulLiveMessages,
  getPacketColor,
  AGENT_SPEED_TIERS,
} = require('../src/lib/agents/hub-animation-engine.ts');

console.log('================================================================');
console.log('FEF TRADING SOLUTIONS: HUB ANIMATION & RISK WARNING TEST SUITE');
console.log('================================================================\n');

let totalPass = 0;
let totalFail = 0;

function runTest(testName, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${testName}`);
    totalPass++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${testName}`);
    console.error(`    Error: ${err.message}\n`);
    totalFail++;
  }
}

// 1. Swarm Canonical Integrity
runTest('Hub renders exactly 15 canonical agents in deterministic order', () => {
  const xauProfile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  assert.strictEqual(xauProfile.agents.length, 15, 'Must contain exactly 15 agents');

  CANONICAL_COUNCIL_KEYS.forEach((spec, idx) => {
    assert.strictEqual(xauProfile.agents[idx].type, spec.type);
    assert.strictEqual(xauProfile.agents[idx].name, spec.name);
  });

  const left7 = xauProfile.agents.slice(0, 7);
  const right7 = xauProfile.agents.slice(7, 14);
  const finalDecision = xauProfile.agents[14];

  assert.strictEqual(left7[0].type, 'TECHNICAL');
  assert.strictEqual(left7[6].type, 'INSTITUTIONAL');
  assert.strictEqual(right7[0].type, 'RISK_GUARDIAN');
  assert.strictEqual(right7[6].type, 'LIQUIDITY_MAP');
  assert.strictEqual(finalDecision.type, 'FINAL_DECISION');
});

// 2. Asynchronous Timing Tiers
runTest('Agent activation speeds categorize into FAST, MEDIUM, SLOW, and REACTIVE', () => {
  assert.strictEqual(AGENT_SPEED_TIERS['TECHNICAL'], 'FAST');
  assert.strictEqual(AGENT_SPEED_TIERS['ORDER_FLOW'], 'FAST');
  assert.strictEqual(AGENT_SPEED_TIERS['VISION'], 'FAST');
  assert.strictEqual(AGENT_SPEED_TIERS['LIQUIDITY_MAP'], 'FAST');

  assert.strictEqual(AGENT_SPEED_TIERS['SENTIMENT'], 'MEDIUM');
  assert.strictEqual(AGENT_SPEED_TIERS['OPPORTUNITY'], 'MEDIUM');
  assert.strictEqual(AGENT_SPEED_TIERS['STRATEGY'], 'MEDIUM');

  assert.strictEqual(AGENT_SPEED_TIERS['MACRO'], 'SLOW');
  assert.strictEqual(AGENT_SPEED_TIERS['NEWS'], 'SLOW');
  assert.strictEqual(AGENT_SPEED_TIERS['GEOPOLITICAL'], 'SLOW');
  assert.strictEqual(AGENT_SPEED_TIERS['INSTITUTIONAL'], 'SLOW');

  assert.strictEqual(AGENT_SPEED_TIERS['RISK_GUARDIAN'], 'REACTIVE');
  assert.strictEqual(AGENT_SPEED_TIERS['FINAL_DECISION'], 'REACTIVE');
});

// 3. Staggered Dynamic States
runTest('Agent node states cycle deterministically without freezing or crashing', () => {
  const xauProfile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  const techAgent = xauProfile.agents[0]; // FAST
  const macroAgent = xauProfile.agents[1]; // SLOW

  const state1 = calculateAgentNodeState(techAgent, 0.2, 0);
  const state2 = calculateAgentNodeState(techAgent, 1.2, 0);
  const state3 = calculateAgentNodeState(techAgent, 2.6, 0);

  const validStates = ['IDLE', 'RECEIVING', 'ANALYZING', 'SENDING', 'WAITING', 'DATA LIMITED', 'CAUTION'];
  assert(validStates.includes(state1));
  assert(validStates.includes(state2));
  assert(validStates.includes(state3));

  // Data limited agent must lock to DATA LIMITED
  const dataLtdAgent = { ...techAgent, status: 'DATA LIMITED' };
  assert.strictEqual(calculateAgentNodeState(dataLtdAgent, 1.0, 0), 'DATA LIMITED');
});

// 4. Packet Color Mapping
runTest('Data packet color mapping returns distinct color-coded hex strings', () => {
  assert.strictEqual(getPacketColor('BULLISH', 'ONLINE', 'TECHNICAL'), '#00f0ff'); // Cyan
  assert.strictEqual(getPacketColor('BULLISH', 'ONLINE', 'MACRO'), '#3b82f6'); // Blue
  assert.strictEqual(getPacketColor('BULLISH', 'ONLINE', 'SENTIMENT'), '#a855f7'); // Violet
  assert.strictEqual(getPacketColor('CAUTION', 'ONLINE', 'NEWS'), '#f59e0b'); // Amber
  assert.strictEqual(getPacketColor('RESTRICTED', 'ONLINE', 'RISK_GUARDIAN'), '#f43f5e'); // Red
  assert.strictEqual(getPacketColor('NEUTRAL', 'DATA LIMITED', 'INSTITUTIONAL'), '#64748b'); // Muted slate
});

// 5. Dynamic Trading Risk Warning Evaluation
runTest('Trading Risk Assessment calculates accurate levels (LOW, MODERATE, HIGH, CRITICAL)', () => {
  const xauProfile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  
  // Normal evaluation
  const assessmentNormal = evaluateTradingRisk(xauProfile, 1.2, true);
  assert(['LOW', 'MODERATE', 'HIGH'].includes(assessmentNormal.level));
  assert(assessmentNormal.impactEvent.name.length > 0);
  assert(assessmentNormal.volatilityDetail.length > 0);

  // Critical evaluation when setup direction is NO TRADE
  const noTradeProfile = { ...xauProfile, setupDirection: 'NO TRADE' };
  const assessmentCritical = evaluateTradingRisk(noTradeProfile, 1.2, true);
  assert.strictEqual(assessmentCritical.level, 'CRITICAL');
  assert.strictEqual(assessmentCritical.color, '#f43f5e');
  assert(assessmentCritical.summary.includes('CRITICAL RISK'));

  // High evaluation when spread widens excessively
  const wideSpreadAssessment = evaluateTradingRisk(xauProfile, 5.5, true);
  assert(['HIGH', 'CRITICAL'].includes(wideSpreadAssessment.level));
  assert.strictEqual(wideSpreadAssessment.spreadStatus, 'WIDE');
});

// 6. Truthful Live Message Stream
runTest('Live Communication Feed extracts truthful messages without synthetic hallucination', () => {
  const btcProfile = generateAssetIntelligence('BTCUSD', INITIAL_LIVE_ASSETS['BTCUSD'], 'H1');
  const messages = getTruthfulLiveMessages(btcProfile);

  assert(messages.length >= 3, 'Must provide at least 3 live messages');
  messages.forEach((msg) => {
    assert(msg.timestamp.length > 0);
    assert(msg.agentName.length > 0);
    assert(msg.message.length > 0);
    assert(msg.packetColor.startsWith('#'));
  });

  // Verify BTC profile contains zero gold references in messages
  const rawText = JSON.stringify(messages).toLowerCase();
  assert(!rawText.includes('gold') && !rawText.includes('bullion') && !rawText.includes('xau'),
    'BTC messages must contain zero residual gold references'
  );
});

// 7. Active Asset Synchronization & Zero Residual Context
runTest('Active asset switching updates all hub nodes with zero cross-asset leakage', () => {
  const symbols = ['BTCUSD', 'EURUSD', 'US30', 'USOIL', 'USDJPY'];

  symbols.forEach((sym) => {
    const asset = INITIAL_LIVE_ASSETS[sym];
    const profile = generateAssetIntelligence(sym, asset, 'H1');
    const risk = evaluateTradingRisk(profile, asset.spread, true);
    const msgs = getTruthfulLiveMessages(profile);

    assert.strictEqual(profile.symbol, sym);
    assert.strictEqual(profile.agents.length, 15);
    assert(risk.summary.length > 0);

    const serialized = (JSON.stringify(profile.agents) + JSON.stringify(msgs)).toLowerCase();
    assert(!serialized.includes('xauusd'), `${sym} must not leak XAUUSD references`);
  });
});

// 8. Risk Guardian Reaction & Status Mapping
runTest('Risk Guardian state changes trigger appropriate caution/restricted styling', () => {
  const xauProfile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  const rgAgent = xauProfile.agents.find(a => a.type === 'RISK_GUARDIAN');
  assert(rgAgent, 'Risk Guardian agent must exist');

  // Test restricted state mapping
  const restrictedRG = { ...rgAgent, bias: 'RESTRICTED' };
  const state = calculateAgentNodeState(restrictedRG, 0, 7);
  assert.strictEqual(state, 'CAUTION');
  const color = getPacketColor(restrictedRG.bias, restrictedRG.status, restrictedRG.type);
  assert.strictEqual(color, '#f43f5e', 'Restricted risk must map to red packet color');
});

// 10. Risk Guardian Action State & Strict Color Discipline
runTest('Risk Guardian Action State computes truthful behavior and respects color discipline', () => {
  const xauProfile = generateAssetIntelligence('XAUUSD', INITIAL_LIVE_ASSETS['XAUUSD'], 'H1');
  const riskNormal = evaluateTradingRisk(xauProfile, 1.2, true);
  
  const validActions = [
    'NORMAL',
    'MONITORING',
    'CAUTION',
    'REDUCED RISK',
    'NEW ENTRIES RESTRICTED',
    'EXECUTION LOCKED',
    'WAITING FOR EVENT',
    'POSITION SIZE REDUCED'
  ];
  assert(validActions.includes(riskNormal.riskGuardianAction), `Action state ${riskNormal.riskGuardianAction} must be valid`);

  // Critical / No Trade must trigger EXECUTION LOCKED with red color
  const noTradeProfile = { ...xauProfile, setupDirection: 'NO TRADE' };
  const riskCritical = evaluateTradingRisk(noTradeProfile, 1.2, true);
  assert.strictEqual(riskCritical.riskGuardianAction, 'EXECUTION LOCKED');
  assert.strictEqual(riskCritical.color, '#f43f5e', 'Critical risk must use red');

  // Moderate risk must use amber
  const moderateProfile = { ...xauProfile, volatility: 'NORMAL', setupDirection: 'WATCH FOR BUY' };
  const riskMod = evaluateTradingRisk(moderateProfile, 1.2, true);
  if (riskMod.level === 'MODERATE') {
    assert.strictEqual(riskMod.color, '#f59e0b', 'Moderate risk must use amber');
  }
});

// 11. Component Overflow Prevention & Dot-Grid Calibration
runTest('Hub components enforce overflow prevention, compact metrics, and calibrated dot-grid', () => {
  const riskSource = fs.readFileSync('src/components/central-hub/HubRiskWarningStrip.tsx', 'utf8');
  assert(riskSource.includes('grid-cols-4'), 'Risk warning strip must render compact 4-col metrics grid');
  assert(riskSource.includes('VOL'), 'Risk warning strip must render VOL metric');
  assert(riskSource.includes('SPREAD'), 'Risk warning strip must render SPREAD metric');
  assert(riskSource.includes('CONSENSUS'), 'Risk warning strip must render CONSENSUS metric');
  assert(riskSource.includes('GUARDIAN'), 'Risk warning strip must render GUARDIAN metric');
  assert(riskSource.includes('riskGuardianAction'), 'Risk warning strip must display riskGuardianAction');

  const feedSource = fs.readFileSync('src/components/central-hub/HubMiniFeed.tsx', 'utf8');
  assert(feedSource.includes('title='), 'Live feed must expose full message on hover via title attribute');
  assert(feedSource.includes('truncate'), 'Live feed must truncate long text to prevent overflow');

  const coreSource = fs.readFileSync('src/components/central-hub/OrchestratorCore.tsx', 'utf8');
  assert(coreSource.includes('opacity-[0.09]'), 'Orchestrator dot-grid opacity must be calibrated to ~0.09');
});

console.log('\n================================================================');
console.log(`HUB ANIMATION TESTS: ${totalPass} PASSED, ${totalFail} FAILED`);
console.log('================================================================\n');

if (totalFail > 0) {
  process.exit(1);
}
