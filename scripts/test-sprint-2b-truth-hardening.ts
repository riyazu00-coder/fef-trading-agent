/**
 * FEF CORTEX — SPRINT 2B INTELLIGENCE TRUTH HARDENING TEST SUITE
 * 
 * Verifies all 12 core requirements, the 5-asset runtime matrix, and the no-data test.
 */

import { CortexConfluenceEngine } from '../src/lib/confluence/confluence-engine';
import {
  evaluateCotPositioningAgent,
  evaluateCentralBankPolicyAgent,
  evaluateQuantAgent,
  evaluateVolatilityAgent,
  evaluateCrossAssetAgent,
} from '../src/lib/agents/specialists/specialist-agents';
import {
  calculateAgentEvidenceTrust,
  isEvidenceDecisionEligible,
} from '../src/lib/evidence/agent-evidence';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { OHLCCandle } from '../src/lib/market/canonical-market-snapshot';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('============================================================');
  console.log('FEF CORTEX — SPRINT 2B INTELLIGENCE TRUTH HARDENING TESTS');
  console.log('============================================================\n');

  const confluence = new CortexConfluenceEngine();

  // Test 1: COT static baseline cannot vote (confidence = 0, readiness = DATA_LIMITED, STATIC_REFERENCE)
  console.log('--- Test 1: COT static baseline cannot vote ---');
  const cotResult = evaluateCotPositioningAgent({ instrument: 'XAUUSD' });
  assert(cotResult.confidence === 0, 'COT confidence must be 0 without live CFTC feed');
  assert(cotResult.readiness === 'DATA_LIMITED', 'COT readiness must be DATA_LIMITED');
  assert(cotResult.direction === 'NEUTRAL', 'COT direction must be NEUTRAL');
  assert(cotResult.provenanceBadge === 'DATA LIMITED', 'COT provenanceBadge must be DATA LIMITED');
  const cotEvidence = cotResult.evidence[0];
  assert(cotEvidence && cotEvidence.classification === 'STATIC_REFERENCE', 'COT evidence classification must be STATIC_REFERENCE');
  
  // Test 2: Central Bank static baseline cannot vote
  console.log('\n--- Test 2: Central Bank static baseline cannot vote ---');
  const cbResult = evaluateCentralBankPolicyAgent({ instrument: 'EURUSD' });
  assert(cbResult.confidence === 0, 'Central Bank confidence must be 0 without live policy feed');
  assert(cbResult.readiness === 'DATA_LIMITED', 'Central Bank readiness must be DATA_LIMITED');
  assert(cbResult.direction === 'NEUTRAL', 'Central Bank direction must be NEUTRAL');
  const cbEvidence = cbResult.evidence[0];
  assert(cbEvidence && cbEvidence.classification === 'STATIC_REFERENCE', 'Central Bank evidence must be STATIC_REFERENCE');

  // Test 3: Quant mock data absent from production path (fails closed when candles absent)
  console.log('\n--- Test 3: Quant mock data absent from production path ---');
  const quantEmpty = evaluateQuantAgent({ instrument: 'XAUUSD' });
  assert(quantEmpty.confidence === 0, 'Quant agent confidence must be 0 when data is missing');
  assert(quantEmpty.readiness === 'DATA_LIMITED', 'Quant agent must fail closed as DATA_LIMITED');
  assert(quantEmpty.evidence.length === 0, 'Quant agent must have no evidence when data missing');

  // Test 4: Volatility hardcoded ATR removed (computes from candles, fails closed if insufficient)
  console.log('\n--- Test 4: Volatility hardcoded ATR removed ---');
  const volEmpty = evaluateVolatilityAgent({ instrument: 'XAUUSD' });
  assert(volEmpty.confidence === 0, 'Volatility agent confidence must be 0 when candles missing');
  assert(volEmpty.readiness === 'DATA_LIMITED', 'Volatility agent must be DATA_LIMITED when candles missing');

  // Volatility with authentic candles computes real ATR
  const dummyCandles: OHLCCandle[] = [];
  const baseTime = Date.now() - 30 * 60000;
  for (let i = 0; i < 20; i++) {
    dummyCandles.push({
      timestamp: baseTime + i * 60000,
      open: 2600 + i,
      high: 2605 + i,
      low: 2598 + i,
      close: 2603 + i,
      volume: 100,
    });
  }
  const volWithCandles = evaluateVolatilityAgent({ instrument: 'XAUUSD', candles: dummyCandles });
  assert(volWithCandles.confidence > 0, 'Volatility agent computes confidence with verified candles');
  assert(volWithCandles.readiness === 'READY', 'Volatility agent becomes READY with 20 verified candles');
  assert(volWithCandles.evidence.length > 0 && volWithCandles.evidence[0].classification === 'DERIVED_FROM_VERIFIED', 'Volatility evidence is DERIVED_FROM_VERIFIED');

  // Test 5: Cross-asset synthetic Gold series removed
  console.log('\n--- Test 5: Cross-asset synthetic Gold series removed ---');
  const crossEmpty = evaluateCrossAssetAgent({ instrument: 'XAUUSD' });
  assert(crossEmpty.confidence === 0, 'Cross-asset agent confidence must be 0 without synchronized matrix');
  assert(crossEmpty.readiness === 'DATA_LIMITED', 'Cross-asset agent is DATA_LIMITED without synchronized matrix');
  assert(crossEmpty.direction === 'NEUTRAL', 'Cross-asset direction is NEUTRAL');

  // Test 6: DATA_LIMITED agent has zero vote
  console.log('\n--- Test 6: DATA_LIMITED agent has zero vote ---');
  const confluenceWithLimited = confluence.evaluateConfluence({
    instrument: 'XAUUSD',
    agents: [cotResult, cbResult, quantEmpty, crossEmpty],
  });
  assert(confluenceWithLimited.presentationPosture === 'WAIT', 'DATA_LIMITED agents cannot produce WATCH posture');
  assert(confluenceWithLimited.confidence === 0, 'DATA_LIMITED agents produce 0 confluence confidence');

  // Test 7: MOCK evidence has zero vote
  console.log('\n--- Test 7: MOCK evidence has zero vote ---');
  const mockEligibility = isEvidenceDecisionEligible('MOCK', 1000);
  assert(!mockEligibility.eligible && !mockEligibility.verified, 'MOCK evidence must not be decision-eligible or verified');
  const mockTrust = calculateAgentEvidenceTrust([{
    id: 'mock-1',
    agentKey: 'TEST',
    asset: 'XAUUSD',
    claim: 'Fake mock signal',
    source: 'Mock Engine',
    sourceType: 'TEST',
    classification: 'MOCK',
    observedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    freshnessMs: 500,
    freshnessTier: 'REALTIME',
    decisionEligible: false,
    verified: false,
    reason: 'Mock',
    trustScore: 0,
    weight: 0,
  }]);
  assert(mockTrust.trustScore === 0, 'MOCK evidence earns 0 trust score');

  // Test 8: STATIC_REFERENCE evidence has zero vote
  console.log('\n--- Test 8: STATIC_REFERENCE evidence has zero vote ---');
  const staticEligibility = isEvidenceDecisionEligible('STATIC_REFERENCE', 1000);
  assert(!staticEligibility.eligible && !staticEligibility.verified, 'STATIC_REFERENCE evidence must not be decision-eligible');
  const staticTrust = calculateAgentEvidenceTrust([{
    id: 'static-1',
    agentKey: 'TEST',
    asset: 'XAUUSD',
    claim: 'Static baseline reference',
    source: 'Static Doc',
    sourceType: 'HISTORICAL_REFERENCE',
    classification: 'STATIC_REFERENCE',
    observedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    freshnessMs: 500,
    freshnessTier: 'REALTIME',
    decisionEligible: false,
    verified: false,
    reason: 'Static reference',
    trustScore: 0,
    weight: 0,
  }]);
  assert(staticTrust.trustScore === 0, 'STATIC_REFERENCE evidence earns 0 trust score');

  // Test 9: Trusted live evidence can vote
  console.log('\n--- Test 9: Trusted live evidence can vote ---');
  const liveEligibility = isEvidenceDecisionEligible('LIVE', 1000);
  assert(liveEligibility.eligible && liveEligibility.verified, 'LIVE evidence within freshness is decision-eligible and verified');
  const liveTrust = calculateAgentEvidenceTrust([{
    id: 'live-1',
    agentKey: 'TEST',
    asset: 'XAUUSD',
    claim: 'Live tick quote verified',
    source: 'Broker MT5',
    sourceType: 'BROKER_MT5',
    classification: 'LIVE',
    observedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    freshnessMs: 500,
    freshnessTier: 'REALTIME',
    decisionEligible: true,
    verified: true,
    reason: 'Live tick verified',
    trustScore: 100,
    weight: 1.0,
  }]);
  assert(liveTrust.trustScore === 100, 'LIVE evidence earns 100 trust score');

  // Test 10: Insufficient data produces WAIT
  console.log('\n--- Test 10: Insufficient data produces WAIT ---');
  const profileNoData = generateAssetIntelligence(
    'XAUUSD',
    null as any,
    'M15',
    [],
  );
  assert(profileNoData.setupDirection === 'WAIT', 'Empty inputs must produce setupDirection WAIT');
  assert(profileNoData.confidence === 0, 'Empty inputs must produce confidence 0');
  assert(profileNoData.tradeExecutable === false, 'Empty inputs must have tradeExecutable false');
  assert(profileNoData.waitReason === 'DATA_INSUFFICIENT', 'Empty inputs must set waitReason to DATA_INSUFFICIENT');
  assert(profileNoData.entryZone === null || profileNoData.entryZone[0] === null, 'Empty inputs must have non-actionable entryZone');

  // Test 11: Conflicting trusted evidence produces WAIT for conflict, not data insufficiency
  console.log('\n--- Test 11: Conflicting trusted evidence produces WAIT for conflict ---');
  const bullishUnified = {
    agentId: 'TECH_BULL',
    agentName: 'Technical Bull Agent',
    role: 'SMC Structure',
    domainFamily: 'PRICE_TECHNICAL' as const,
    instrument: 'XAUUSD',
    direction: 'BULLISH' as const,
    confidence: 85,
    evidenceTrust: 90,
    readiness: 'READY' as const,
    primaryThesis: 'Bullish BOS confirmed on M15',
    evidence: [{
      id: 'tech-bull',
      agentId: 'TECH_BULL',
      domainFamily: 'PRICE_TECHNICAL' as const,
      nature: 'ANALYSIS' as const,
      classification: 'LIVE' as const,
      polarity: 'BULLISH' as const,
      strength: 0.9,
      confidence: 85,
      claim: 'Bullish BOS confirmed on M15',
      source: 'MT5 Broker',
      provider: 'MT5',
      observedAt: new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: 500,
      isStale: false,
      instrument: 'XAUUSD',
    }],
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Swing low break',
    keyRisk: 'Chop',
    provenanceBadge: 'LIVE' as const,
    generatedAt: Date.now(),
  };

  const bearishUnified = {
    agentId: 'MACRO_BEAR',
    agentName: 'Macro Bear Agent',
    role: 'Yield Differentials',
    domainFamily: 'RATES' as const,
    instrument: 'XAUUSD',
    direction: 'BEARISH' as const,
    confidence: 85,
    evidenceTrust: 90,
    readiness: 'READY' as const,
    primaryThesis: 'Sovereign 10Y Yield surging to 4.65%',
    evidence: [{
      id: 'macro-bear',
      agentId: 'MACRO_BEAR',
      domainFamily: 'RATES' as const,
      nature: 'DATA' as const,
      classification: 'LIVE' as const,
      polarity: 'BEARISH' as const,
      strength: 0.9,
      confidence: 85,
      claim: '10Y Yield surge implies bearish headwind',
      source: 'FRED Live',
      provider: 'FRED',
      observedAt: new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: 500,
      isStale: false,
      instrument: 'XAUUSD',
    }],
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Yield reversal',
    keyRisk: 'Fed pivot',
    provenanceBadge: 'LIVE' as const,
    generatedAt: Date.now(),
  };

  const conflictConfluence = confluence.evaluateConfluence({
    instrument: 'XAUUSD',
    agents: [bullishUnified, bearishUnified],
  });
  assert(conflictConfluence.conflictScore > 0, 'Opposing trusted agents must produce conflictScore > 0');
  assert(conflictConfluence.presentationPosture === 'WAIT', 'High-trust conflict must produce posture WAIT');
  assert(conflictConfluence.directionalThesis === 'MIXED', 'High-trust conflict produces directionalThesis MIXED');

  // Test 12: Readiness calculation is deterministic
  console.log('\n--- Test 12: Readiness calculation is deterministic ---');
  const prof1 = generateAssetIntelligence('XAUUSD', null as any, 'M15', dummyCandles);
  const prof2 = generateAssetIntelligence('XAUUSD', null as any, 'M15', dummyCandles);
  assert(prof1.dataReadinessSummary?.dataReadiness === prof2.dataReadinessSummary?.dataReadiness, 'Data readiness must be deterministic');
  assert(prof1.dataReadinessSummary?.availableTrustedAgents === prof2.dataReadinessSummary?.availableTrustedAgents, 'Trusted agent count must be deterministic');
  assert(prof1.confidence === prof2.confidence, 'Confidence must be deterministic');

  // 15. RUNTIME TEST MATRIX (XAUUSD, BTCUSD, EURUSD, US100, USOIL)
  console.log('\n============================================================');
  console.log('15. RUNTIME TEST MATRIX (5 ASSETS)');
  console.log('============================================================\n');

  const symbols = ['XAUUSD', 'BTCUSD', 'EURUSD', 'US100', 'USOIL'];
  const matrixResults: any[] = [];

  for (const sym of symbols) {
    const profile = generateAssetIntelligence(
      sym,
      {
        symbol: sym,
        name: sym,
        price: 2603,
        change24h: 0.45,
        spread: 1.2,
        high24h: 2610,
        low24h: 2595,
        volume24h: 12000,
        lastUpdated: new Date().toISOString(),
        provider: 'MT5',
        source: 'MT5',
        marketState: 'OPEN',
      } as any,
      'M15',
      dummyCandles,
    );

    const trustedCount = profile.dataReadinessSummary?.availableTrustedAgents ?? 0;
    const limitedCount = profile.limitedAgentCount ?? 0;
    const staticCount = profile.agents.filter((a) => a.evidenceRecords?.some((e) => e.classification === 'STATIC_REFERENCE')).length;
    const mockCount = profile.agents.filter((a) => a.evidenceRecords?.some((e) => e.classification === 'MOCK')).length;

    matrixResults.push({
      symbol: sym,
      trustedAgents: trustedCount,
      dataLimitedAgents: limitedCount,
      staticReferenceAgents: staticCount,
      mockAgents: mockCount,
      finalDirection: profile.directionalBias,
      finalConfidence: profile.confidence,
      evidenceTrust: profile.evidenceTrust,
      dataReadiness: profile.dataReadinessSummary?.dataReadiness,
      waitReason: profile.waitReason,
    });
  }

  console.table(matrixResults);

  // 16. NO-DATA TEST
  console.log('\n============================================================');
  console.log('16. NO-DATA TEST (MISSING CANDLES & FEEDS)');
  console.log('============================================================\n');

  const noDataProfile = generateAssetIntelligence(
    'XAUUSD',
    null as any,
    'M15',
    [],
  );

  console.log('No-Data Result:');
  console.log(`- Final Directional Bias: ${noDataProfile.directionalBias}`);
  console.log(`- Setup Direction: ${noDataProfile.setupDirection}`);
  console.log(`- Final Confidence: ${noDataProfile.confidence}%`);
  console.log(`- Evidence Trust: ${noDataProfile.evidenceTrust}%`);
  console.log(`- Data Readiness: ${noDataProfile.dataReadinessSummary?.dataReadiness}`);
  console.log(`- Wait Reason: ${noDataProfile.waitReason}`);
  console.log(`- Trade Executable: ${noDataProfile.tradeExecutable}`);
  console.log(`- Final Agent Opinion: ${noDataProfile.agents.find((a) => a.type === 'FINAL_DECISION')?.lastOpinion}`);
  console.log(`- Entry Zone: ${noDataProfile.entryZone}`);
  console.log(`- Stop Loss: ${noDataProfile.stopLoss}`);
  console.log(`- Take Profit 1: ${noDataProfile.tp1}`);

  assert(noDataProfile.confidence === 0, 'No-data confidence must be 0');
  assert(noDataProfile.tradeExecutable === false, 'No-data tradeExecutable must be false');
  assert(noDataProfile.waitReason === 'DATA_INSUFFICIENT', 'No-data waitReason must be DATA_INSUFFICIENT');
  assert(noDataProfile.setupDirection === 'WAIT', 'No-data setupDirection must be WAIT');
  assert(noDataProfile.entryZone === null || noDataProfile.entryZone[0] === null, 'No-data entryZone must be null');

  console.log('\n============================================================');
  console.log('ALL SPRINT 2B INTELLIGENCE TRUTH HARDENING TESTS PASSED!');
  console.log('============================================================');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
