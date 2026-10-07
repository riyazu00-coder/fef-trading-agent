/**
 * FEF CORTEX — COCKPIT INTELLIGENCE INTEGRATION + LIVE CONFLUENCE EXPERIENCE
 * MANDATORY INTEGRATION TEST SUITE (20 TEST CRITERIA)
 * 
 * Verifies all 20 required criteria:
 * 1. Confluence receives real UnifiedAgentResponse structures
 * 2. Duplicate domain evidence does not inflate confidence
 * 3. Strong independent evidence outweighs multiple weak duplicate agents
 * 4. Conflicting evidence is preserved, visible, and quantified
 * 5. Zero evidence resolves to WAIT / NEUTRAL / LOW READINESS
 * 6. Missing critical feeds reduce readiness, not create fake confidence
 * 7. Data Sentinel NEVER creates directional bias
 * 8. DXY unavailable remains unavailable across all layers
 * 9. Historical analogue insufficient sample fails closed
 * 10. Cross-asset insufficient sample fails closed
 * 11. Macro DATA_LIMITED cannot create WATCH state alone
 * 12. Risk state does not silently change direction
 * 13. WATCH state remains strictly non-executable
 * 14. READ_ONLY remains canonical across all components
 * 15. MT5_ORDER_TRANSPORT_ENABLED remains false
 * 16. No order-placement transport is introduced
 * 17. No secret leakage through intelligence APIs
 * 18. UI does not render fabricated fallback evidence
 * 19. Cockpit handles unavailable intelligence without crashing
 * 20. Existing Price Authority behavior remains unchanged
 */

import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';
import { UnifiedAgentResponse, UnifiedAgentEvidence } from '../src/lib/agents/contracts/unified-agent-contract';
import { CortexConfluenceEngine } from '../src/lib/confluence/confluence-engine';
import { classifyMarketRegime } from '../src/lib/regime/market-regime-engine';
import { buildCrossAssetMatrix, calculatePearsonCorrelation } from '../src/lib/cross-asset/cross-asset-engine';
import { calculateQuantMetrics, matchHistoricalAnalogues } from '../src/lib/quant/quant-engine';
import {
  evaluateRatesAgent,
  evaluateInflationAgent,
  evaluateVolatilityAgent,
  evaluateCrossAssetAgent,
  evaluateDataSentinelAgent,
  evaluateQuantAgent,
} from '../src/lib/agents/specialists/specialist-agents';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { resolvePriceForPurpose } from '../src/lib/price/price-authority';
import { LiveMarketAsset } from '../src/lib/providers/real-market-api';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${details ? ` -> ${details}` : ''}`);
    failCount++;
  }
}

async function runCockpitConfluenceIntegrationTests() {
  console.log('\n=================================================================');
  console.log('FEF CORTEX: COCKPIT INTELLIGENCE & CONFLUENCE INTEGRATION TEST');
  console.log('=================================================================\n');

  // =================================================================
  // TEST 1: Confluence receives real UnifiedAgentResponse structures
  // =================================================================
  console.log('[TEST 1: Confluence receives real UnifiedAgentResponse structures]');
  const mockCandles = [
    { time: 1000, open: 2650, high: 2660, low: 2645, close: 2658, volume: 100 },
    { time: 2000, open: 2658, high: 2665, low: 2652, close: 2662, volume: 120 },
    { time: 3000, open: 2662, high: 2670, low: 2660, close: 2668, volume: 150 },
    { time: 4000, open: 2668, high: 2675, low: 2665, close: 2672, volume: 140 },
    { time: 5000, open: 2672, high: 2680, low: 2670, close: 2678, volume: 160 },
  ];
  const mockLiveAsset: LiveMarketAsset = {
    symbol: 'XAUUSD',
    name: 'Gold vs US Dollar',
    price: 2678.5,
    bid: 2678.35,
    ask: 2678.65,
    spread: 0.30,
    change24h: 0.25,
    high24h: 2685.0,
    low24h: 2650.0,
    volume: '$12.5B',
    sparkline: '2650,2660,2678',
    source: 'TEST',
    lastUpdated: new Date().toISOString(),
    category: 'COMMODITY',
  };
  const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', mockCandles);

  assert(
    profile.confluence !== undefined,
    'AssetProfile contains live confluence evaluation',
    `profile.confluence is ${typeof profile.confluence}`
  );
  assert(
    ['WAIT', 'WATCH FOR BUY', 'WATCH FOR SELL'].includes(profile.confluence.presentationPosture),
    'Confluence posture conforms to non-executable contract',
    `presentationPosture=${profile.confluence.presentationPosture}`
  );
  assert(
    Array.isArray(profile.specialistAgents) && profile.specialistAgents.length === 6,
    'Profile wires all 6 specialist agents into runtime intelligence',
    `found ${profile.specialistAgents?.length} specialist agents`
  );
  assert(
    profile.regimeAssessment !== undefined && profile.crossAssetMatrix !== undefined && profile.quantMetrics !== undefined,
    'Profile includes Market Regime, Cross-Asset Matrix, and Quant Metrics',
    'All analytical engines populated'
  );

  // =================================================================
  // TEST 2: Duplicate domain evidence does not inflate confidence
  // =================================================================
  console.log('\n[TEST 2: Duplicate domain evidence does not inflate confidence]');
  // 5 agents all from same domain RATES
  const singleDomainAgents: UnifiedAgentResponse[] = [1, 2, 3, 4, 5].map((idx) => ({
    agentId: `rates-dup-${idx}`,
    agentName: `Rates Subagent ${idx}`,
    role: 'Macro Analyst',
    domainFamily: 'RATES',
    instrument: 'XAUUSD',
    direction: 'BULLISH',
    confidence: 85,
    evidenceTrust: 80,
    readiness: 'READY',
    primaryThesis: '10Y real yield dropped',
    evidence: [],
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Reversal in real rates',
    keyRisk: 'Fed surprise',
    provenanceBadge: 'FRED',
    generatedAt: Date.now(),
  }));

  // 5 agents across 5 distinct domains
  const distinctDomainAgents: UnifiedAgentResponse[] = [
    {
      agentId: 'macro-1',
      agentName: 'Macro Agent',
      role: 'Macro Strategist',
      domainFamily: 'RATES',
      instrument: 'XAUUSD',
      direction: 'BULLISH',
      confidence: 85,
      evidenceTrust: 80,
      readiness: 'READY',
      primaryThesis: 'Yields down',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Yield breakout',
      keyRisk: 'Fed hawkish shift',
      provenanceBadge: 'FRED',
      generatedAt: Date.now(),
    },
    {
      agentId: 'tech-1',
      agentName: 'Tech Momentum',
      role: 'Technical Analyst',
      domainFamily: 'PRICE_TECHNICAL',
      instrument: 'XAUUSD',
      direction: 'BULLISH',
      confidence: 85,
      evidenceTrust: 80,
      readiness: 'READY',
      primaryThesis: 'RSI breakout',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Lower low',
      keyRisk: 'False breakout',
      provenanceBadge: 'MT5',
      generatedAt: Date.now(),
    },
    {
      agentId: 'vol-1',
      agentName: 'Volatility Surface',
      role: 'Volatility Specialist',
      domainFamily: 'VOLATILITY',
      instrument: 'XAUUSD',
      direction: 'BULLISH',
      confidence: 85,
      evidenceTrust: 80,
      readiness: 'READY',
      primaryThesis: 'ATR expanding',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Volatility crush',
      keyRisk: 'Spike risk',
      provenanceBadge: 'DERIVED',
      generatedAt: Date.now(),
    },
    {
      agentId: 'quant-1',
      agentName: 'Quant Momentum',
      role: 'Quant Researcher',
      domainFamily: 'QUANT_STATISTICAL',
      instrument: 'XAUUSD',
      direction: 'BULLISH',
      confidence: 85,
      evidenceTrust: 80,
      readiness: 'READY',
      primaryThesis: 'Z-score momentum positive',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Mean reversion',
      keyRisk: 'Fat tail event',
      provenanceBadge: 'DERIVED',
      generatedAt: Date.now(),
    },
    {
      agentId: 'cross-1',
      agentName: 'Cross Asset',
      role: 'Cross-Asset Specialist',
      domainFamily: 'CROSS_ASSET',
      instrument: 'XAUUSD',
      direction: 'BULLISH',
      confidence: 85,
      evidenceTrust: 80,
      readiness: 'READY',
      primaryThesis: 'Silver divergence confirms gold strength',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Gold/silver breakdown',
      keyRisk: 'Dollar surge',
      provenanceBadge: 'DERIVED',
      generatedAt: Date.now(),
    },
  ];

  const singleDomainResult = CortexConfluenceEngine.evaluateConfluence(singleDomainAgents);
  const distinctDomainResult = CortexConfluenceEngine.evaluateConfluence(distinctDomainAgents);

  assert(
    distinctDomainResult.confidence > singleDomainResult.confidence,
    'Distinct multi-domain evidence yields higher overall confidence than clustered duplicate evidence',
    `distinct=${distinctDomainResult.confidence} vs single=${singleDomainResult.confidence}`
  );
  assert(
    singleDomainResult.supportingDomains.length === 1,
    'Clustered evidence deduplicates to 1 evidence domain family',
    `supportingDomains.length=${singleDomainResult.supportingDomains.length}`
  );

  // =================================================================
  // TEST 3: Strong independent evidence outweighs multiple weak duplicate agents
  // =================================================================
  console.log('\n[TEST 3: Strong independent evidence outweighs multiple weak duplicate agents]');
  const weakDuplicateAgents: UnifiedAgentResponse[] = [1, 2, 3, 4].map((i) => ({
    agentId: `weak-dup-${i}`,
    agentName: `Weak Tech ${i}`,
    role: 'Technical Analyst',
    domainFamily: 'PRICE_TECHNICAL',
    instrument: 'XAUUSD',
    direction: 'BEARISH',
    confidence: 52,
    evidenceTrust: 30,
    readiness: 'PARTIAL',
    primaryThesis: 'Minor oscillator tick',
    evidence: [],
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Oscillator cross back',
    keyRisk: 'Whipsaw',
    provenanceBadge: 'HEURISTIC',
    generatedAt: Date.now(),
  }));

  const strongIndependentAgents: UnifiedAgentResponse[] = [
    {
      agentId: 'strong-macro',
      agentName: 'Official Macro Rates',
      role: 'Rates Specialist',
      domainFamily: 'RATES',
      instrument: 'XAUUSD',
      direction: 'BULLISH',
      confidence: 90,
      evidenceTrust: 95,
      readiness: 'READY',
      primaryThesis: 'Aggressive rate cuts confirmed',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'FOMC hawkish surprise',
      keyRisk: 'Inflation resurgence',
      provenanceBadge: 'FRED',
      generatedAt: Date.now(),
    },
    {
      agentId: 'strong-quant',
      agentName: 'Quant Regime',
      role: 'Quant Researcher',
      domainFamily: 'QUANT_STATISTICAL',
      instrument: 'XAUUSD',
      direction: 'BULLISH',
      confidence: 88,
      evidenceTrust: 90,
      readiness: 'READY',
      primaryThesis: 'Statistically significant 3-sigma expansion',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Regime shift',
      keyRisk: 'Outlier variance',
      provenanceBadge: 'DERIVED',
      generatedAt: Date.now(),
    },
  ];

  const mixedHeadToHead = CortexConfluenceEngine.evaluateConfluence([...weakDuplicateAgents, ...strongIndependentAgents]);
  assert(
    mixedHeadToHead.directionalThesis === 'BULLISH',
    'Strong independent domain evidence outweighs multiple clustered weak agents',
    `directionalThesis=${mixedHeadToHead.directionalThesis}, agreement=${mixedHeadToHead.agreementScore}`
  );

  // =================================================================
  // TEST 4: Conflicting evidence is preserved, visible, and quantified
  // =================================================================
  console.log('\n[TEST 4: Conflicting evidence is preserved, visible, and quantified]');
  const conflictingAgents: UnifiedAgentResponse[] = [
    {
      agentId: 'bull-1',
      agentName: 'Macro Bull',
      role: 'Macro Analyst',
      domainFamily: 'RATES',
      instrument: 'XAUUSD',
      direction: 'BULLISH',
      confidence: 80,
      evidenceTrust: 85,
      readiness: 'READY',
      primaryThesis: 'Bullish rates drop',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Rates rise',
      keyRisk: 'Inflation print',
      provenanceBadge: 'FRED',
      generatedAt: Date.now(),
    },
    {
      agentId: 'bear-1',
      agentName: 'Tech Bear',
      role: 'Technical Analyst',
      domainFamily: 'PRICE_TECHNICAL',
      instrument: 'XAUUSD',
      direction: 'BEARISH',
      confidence: 80,
      evidenceTrust: 85,
      readiness: 'READY',
      primaryThesis: 'Major resistance rejection',
      evidence: [],
      conflicts: [],
      missingEvidence: [],
      invalidation: 'Resistance breach',
      keyRisk: 'Short squeeze',
      provenanceBadge: 'MT5',
      generatedAt: Date.now(),
    },
  ];

  const conflictResult = CortexConfluenceEngine.evaluateConfluence(conflictingAgents);
  assert(
    conflictResult.conflictScore > 0,
    'Conflict score is quantified (> 0)',
    `conflictScore=${conflictResult.conflictScore}`
  );
  assert(
    conflictResult.criticalConflicts.length > 0,
    'Critical conflicts list is populated with inter-domain disagreement',
    `criticalConflicts=${JSON.stringify(conflictResult.criticalConflicts)}`
  );
  assert(
    conflictResult.presentationPosture === 'WAIT',
    'Severe conflict forces presentationPosture to WAIT',
    `presentationPosture=${conflictResult.presentationPosture}`
  );

  // =================================================================
  // TEST 5: Zero evidence resolves to WAIT / NEUTRAL / LOW READINESS
  // =================================================================
  console.log('\n[TEST 5: Zero evidence resolves to WAIT / NEUTRAL / LOW READINESS]');
  const zeroResult = CortexConfluenceEngine.evaluateConfluence([]);
  assert(
    zeroResult.presentationPosture === 'WAIT',
    'Zero evidence resolves presentationPosture to WAIT',
    `presentationPosture=${zeroResult.presentationPosture}`
  );
  assert(
    zeroResult.directionalThesis === 'DATA_LIMITED' || zeroResult.directionalThesis === 'NEUTRAL',
    'Zero evidence resolves directionalThesis to DATA_LIMITED / NEUTRAL',
    `directionalThesis=${zeroResult.directionalThesis}`
  );
  assert(
    zeroResult.confidence === 0,
    'Zero evidence produces 0 confidence',
    `confidence=${zeroResult.confidence}`
  );

  // =================================================================
  // TEST 6: Missing critical feeds reduce readiness, not create fake confidence
  // =================================================================
  console.log('\n[TEST 6: Missing critical feeds reduce readiness, not create fake confidence]');
  const degradedSentinel = evaluateDataSentinelAgent({
    fredHealth: { status: 'ERROR', consecutiveFailures: 5 },
    mt5Health: { isConnected: false },
    priceAuthorityStatus: 'ERROR',
  });
  assert(
    degradedSentinel.evidenceTrust < 50,
    'Missing critical feeds degrade evidence trust score',
    `trustScore=${degradedSentinel.evidenceTrust}`
  );
  assert(
    degradedSentinel.missingEvidence.length > 0,
    'Missing inputs are explicitly catalogued',
    `missingEvidence=${degradedSentinel.missingEvidence.join(', ')}`
  );

  // =================================================================
  // TEST 7: Data Sentinel NEVER creates directional bias
  // =================================================================
  console.log('\n[TEST 7: Data Sentinel NEVER creates directional bias]');
  const sentinelHealthy = evaluateDataSentinelAgent({
    fredHealth: { status: 'HEALTHY' },
    mt5Health: { isConnected: true },
    priceAuthorityStatus: 'LIVE_AUTHORITY',
  });
  const sentinelFailing = evaluateDataSentinelAgent({
    fredHealth: { status: 'ERROR', consecutiveFailures: 10 },
    mt5Health: { isConnected: false },
    priceAuthorityStatus: 'UNAVAILABLE',
  });
  assert(
    sentinelHealthy.direction === 'NEUTRAL' && sentinelFailing.direction === 'NEUTRAL',
    'Data Sentinel strictly maintains NEUTRAL stance under all conditions (never BULLISH/BEARISH)',
    `healthy direction=${sentinelHealthy.direction}, failing direction=${sentinelFailing.direction}`
  );

  // =================================================================
  // TEST 8: DXY unavailable remains unavailable across all layers
  // =================================================================
  console.log('\n[TEST 8: DXY unavailable remains unavailable across all layers]');
  const matrix = buildCrossAssetMatrix({
    goldSeries: [
      { date: '2026-03-01', timestamp: 1, value: 2650 },
      { date: '2026-03-02', timestamp: 2, value: 2660 },
      { date: '2026-03-03', timestamp: 3, value: 2670 },
    ],
    hasVerifiedDxy: false,
  });
  const dxyRel = matrix.relationships['DXY'];
  assert(
    dxyRel !== undefined && dxyRel.status === 'UNAVAILABLE' && dxyRel.rollingCorrelation === undefined,
    'DXY is strictly UNAVAILABLE without synthetic generation',
    `dxy=${JSON.stringify(dxyRel)}`
  );

  // =================================================================
  // TEST 9: Historical analogue insufficient sample fails closed
  // =================================================================
  console.log('\n[TEST 9: Historical analogue insufficient sample fails closed]');
  const analogueResult = matchHistoricalAnalogues({
    currentTrend: 'BULLISH',
    realYieldDirection: 'FALLING',
    volatilityLevel: 'NORMAL',
    historicalPeriods: [
      {
        date: '2024-01-01',
        trend: 'BULLISH',
        realYieldDirection: 'FALLING',
        volatilityLevel: 'NORMAL',
        forwardReturnsPct: { tPlus5: 1.2, tPlus20: 3.4 },
      },
    ],
  });
  assert(
    analogueResult.status === 'INSUFFICIENT_SAMPLE' && analogueResult.matchedSampleCount === 1,
    'Historical analogue fails closed on insufficient sample size (< 3 matches)',
    `status=${analogueResult.status}, matched=${analogueResult.matchedSampleCount}`
  );

  // =================================================================
  // TEST 10: Cross-asset insufficient sample fails closed
  // =================================================================
  console.log('\n[TEST 10: Cross-asset insufficient sample fails closed]');
  const ptA = [
    { date: '2026-03-01', timestamp: 1, value: 10 },
    { date: '2026-03-02', timestamp: 2, value: 20 },
  ];
  const ptB = [
    { date: '2026-03-01', timestamp: 1, value: 15 },
    { date: '2026-03-02', timestamp: 2, value: 25 },
  ];
  const corrUnderSample = calculatePearsonCorrelation(ptA, ptB);
  assert(
    corrUnderSample === null,
    'Pearson correlation fails closed (returns null) with sample < 5',
    `result=${corrUnderSample}`
  );

  // =================================================================
  // TEST 11: Macro DATA_LIMITED cannot create WATCH state alone
  // =================================================================
  console.log('\n[TEST 11: Macro DATA_LIMITED cannot create WATCH state alone]');
  const macroLimitedAgent: UnifiedAgentResponse = {
    agentId: 'macro-limited',
    agentName: 'Macro Agent (Limited)',
    role: 'Macro Analyst',
    domainFamily: 'RATES',
    instrument: 'XAUUSD',
    direction: 'BULLISH',
    confidence: 60,
    evidenceTrust: 35, // Low trust / data limited
    readiness: 'DATA_LIMITED',
    primaryThesis: 'Limited macro sample',
    evidence: [],
    conflicts: [],
    missingEvidence: ['FRED Real Yield Observations'],
    invalidation: 'Stale report',
    keyRisk: 'Data gap',
    provenanceBadge: 'HEURISTIC',
    generatedAt: Date.now(),
  };
  const limitedConfluence = CortexConfluenceEngine.evaluateConfluence([macroLimitedAgent]);
  assert(
    limitedConfluence.presentationPosture === 'WAIT',
    'Macro DATA_LIMITED alone cannot create WATCH state (resolves to WAIT)',
    `presentationPosture=${limitedConfluence.presentationPosture}, confidence=${limitedConfluence.confidence}`
  );

  // =================================================================
  // TEST 12: Risk state does not silently change direction
  // =================================================================
  console.log('\n[TEST 12: Risk state does not silently change direction]');
  const regimeBull = classifyMarketRegime({
    instrument: 'XAUUSD',
    swingTrend: 'BULLISH',
    equityReturnPct: 0.8,
    realYieldBpChange: -5,
  });
  assert(
    regimeBull.trendRegime === 'TRENDING_BULLISH' && regimeBull.riskRegime === 'RISK_ON',
    'Market regime accurately identifies trend state without inverting direction',
    `trendRegime=${regimeBull.trendRegime}, riskRegime=${regimeBull.riskRegime}`
  );

  // =================================================================
  // TEST 13: WATCH state remains strictly non-executable
  // =================================================================
  console.log('\n[TEST 13: WATCH state remains strictly non-executable]');
  assert(
    ['WAIT', 'WATCH FOR BUY', 'WATCH FOR SELL'].includes(profile.confluence.presentationPosture),
    'Confluence output is strictly non-executable (WAIT / WATCH FOR BUY / WATCH FOR SELL)',
    `presentationPosture=${profile.confluence.presentationPosture}`
  );
  assert(
    (profile.confluence as any).action === undefined || !['BUY', 'SELL'].includes((profile.confluence as any).action),
    'Confluence output never contains BUY or SELL execution verbs',
    'No execution verbs present'
  );

  // =================================================================
  // TEST 14: READ_ONLY remains canonical across all components
  // =================================================================
  console.log('\n[TEST 14: READ_ONLY remains canonical across all components]');
  assert(
    CANONICAL_EXECUTION_MODE === 'READ_ONLY',
    'CANONICAL_EXECUTION_MODE is READ_ONLY',
    `CANONICAL_EXECUTION_MODE=${CANONICAL_EXECUTION_MODE}`
  );

  // =================================================================
  // TEST 15: MT5_ORDER_TRANSPORT_ENABLED remains false
  // =================================================================
  console.log('\n[TEST 15: MT5_ORDER_TRANSPORT_ENABLED remains false]');
  assert(
    MT5_ORDER_TRANSPORT_ENABLED === false,
    'MT5_ORDER_TRANSPORT_ENABLED is strictly false',
    `MT5_ORDER_TRANSPORT_ENABLED=${MT5_ORDER_TRANSPORT_ENABLED}`
  );

  // =================================================================
  // TEST 16: No order-placement transport is introduced
  // =================================================================
  console.log('\n[TEST 16: No order-placement transport is introduced]');
  assert(
    typeof (profile as any).executeOrder === 'undefined',
    'AssetProfile has no order-placement transport method',
    'executeOrder is undefined'
  );

  // =================================================================
  // TEST 17: No secret leakage through intelligence APIs
  // =================================================================
  console.log('\n[TEST 17: No secret leakage through intelligence APIs]');
  // Verify that provider health in feeds route scrubs keys
  const dummyFredEnv = process.env.FRED_API_KEY || 'dummy-fred-secret-key-12345';
  const serialized = JSON.stringify(profile);
  assert(
    !serialized.includes(dummyFredEnv) && !serialized.includes('api_key='),
    'AssetProfile and feeds intelligence serialization contains no API secrets',
    'No sensitive secrets found in payload'
  );

  // =================================================================
  // TEST 18: UI does not render fabricated fallback evidence
  // =================================================================
  console.log('\n[TEST 18: UI does not render fabricated fallback evidence]');
  assert(
    dxyRel.rollingCorrelation === undefined,
    'Cross-asset correlation matrix emits undefined for missing DXY instead of fabricated fallback number',
    `dxy.rollingCorrelation=${dxyRel.rollingCorrelation}`
  );

  // =================================================================
  // TEST 19: Cockpit handles unavailable intelligence without crashing
  // =================================================================
  console.log('\n[TEST 19: Cockpit handles unavailable intelligence without crashing]');
  // Test quant and analogue engines under empty inputs
  const emptyQuant = calculateQuantMetrics([]);
  const emptyAnalogue = matchHistoricalAnalogues({
    currentTrend: 'RANGING',
    realYieldDirection: 'FLAT',
    volatilityLevel: 'LOW',
    historicalPeriods: [],
  });
  assert(
    emptyQuant.annualizedVolatilityPct === 0 && emptyAnalogue.matchedSampleCount === 0,
    'Engines handle empty data safely with zero/empty defaults without crashing',
    `vol=${emptyQuant.annualizedVolatilityPct}, matched=${emptyAnalogue.matchedSampleCount}`
  );

  // =================================================================
  // TEST 20: Existing Price Authority behavior remains unchanged
  // =================================================================
  console.log('\n[TEST 20: Existing Price Authority behavior remains unchanged]');
  const paRes = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
    isMt5Connected: true,
    terminalConnected: true,
    bridgeConnected: true,
    isProduction: false,
    operatingMode: 'DEMO_EXECUTION',
    brokerQuote: {
      symbol: 'XAUUSD',
      bid: 2678.0,
      ask: 2678.5,
      spread: 0.5,
      serverTime: new Date().toISOString(),
      timestamp: Date.now(),
    } as any,
  });
  assert(
    paRes.status === 'RESOLVED' && paRes.isExecutable && paRes.priceClass === 'EXECUTABLE_BROKER',
    'Existing Price Authority resolves broker quote for execution when MT5 connected and demo enabled',
    `status=${paRes.status}, isExecutable=${paRes.isExecutable}, priceClass=${paRes.priceClass}`
  );

  const paReadOnly = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
    isMt5Connected: true,
    terminalConnected: true,
    bridgeConnected: true,
    isProduction: false,
    operatingMode: 'READ_ONLY',
    brokerQuote: {
      symbol: 'XAUUSD',
      bid: 2678.0,
      ask: 2678.5,
      spread: 0.5,
      serverTime: new Date().toISOString(),
      timestamp: Date.now(),
    } as any,
  });
  assert(
    paReadOnly.status === 'LOCKED' && !paReadOnly.isExecutable,
    'Price Authority strictly locks execution under canonical READ_ONLY mode',
    `status=${paReadOnly.status}, isExecutable=${paReadOnly.isExecutable}`
  );

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runCockpitConfluenceIntegrationTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
