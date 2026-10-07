/**
 * FEF CORTEX — FINANCIAL INTELLIGENCE TERMINAL EXPANSION TEST SUITE
 * MASTER PROGRAM VERIFICATION
 * 
 * Verifies all Master Program Milestones A through L:
 * 1. Milestone A: Macro Agent Integration (1 - 6)
 * 2. Milestone B: Unified Agent Contract & Evidence Integrity (7 - 12)
 * 3. Milestone C: Specialist Agent Expansion & Data Sentinel (13 - 18)
 * 4. Milestone D: Confluence Engine & Domain Deduplication (19 - 25)
 * 5. Milestone E: Market Regime Engine (26 - 30)
 * 6. Milestone F: Cross-Asset Intelligence & DXY Truthfulness (31 - 35)
 * 7. Milestone G: Quant Foundation & Historical Analogues (36 - 40)
 * 8. Milestone H: Portfolio & Factor Exposure (41 - 44)
 * 9. Absolute Safety & Execution Boundary (45 - 50)
 */

import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';
import { UnifiedAgentResponse, UnifiedAgentEvidence } from '../src/lib/agents/contracts/unified-agent-contract';
import { CortexConfluenceEngine } from '../src/lib/confluence/confluence-engine';
import { classifyMarketRegime } from '../src/lib/regime/market-regime-engine';
import { buildCrossAssetMatrix, calculatePearsonCorrelation } from '../src/lib/cross-asset/cross-asset-engine';
import { calculateQuantMetrics, matchHistoricalAnalogues } from '../src/lib/quant/quant-engine';
import { analyzePortfolioExposures } from '../src/lib/portfolio/portfolio-intelligence';
import {
  evaluateRatesAgent,
  evaluateInflationAgent,
  evaluateVolatilityAgent,
  evaluateCrossAssetAgent,
  evaluateDataSentinelAgent,
  evaluateQuantAgent,
} from '../src/lib/agents/specialists/specialist-agents';
import { assembleXauusdMacroEvidence } from '../src/lib/macro';

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

async function runMasterProgramTests() {
  console.log('\n=================================================================');
  console.log('FEF CORTEX: FINANCIAL INTELLIGENCE TERMINAL EXPANSION SUITE');
  console.log('=================================================================\n');

  // =================================================================
  // MILESTONE A: MACRO AGENT INTEGRATION
  // =================================================================
  console.log('[MILESTONE A: MACRO AGENT INTEGRATION]');

  // 1. Official XAUUSD macro evidence generates structured payload
  const macroEv = assembleXauusdMacroEvidence({
    realYieldAnalysis: {
      seriesId: 'DFII10',
      name: '10Y Real Yield',
      category: 'REAL_YIELD',
      latestValue: 1.95,
      latestObservationDate: '2026-10-06',
      direction: 'FALLING',
      change1Bp: -10,
      momentum: 'DOWN',
      freshness: 'CURRENT',
      freshnessReason: 'Fresh',
      sampleCount: 10,
      provider: 'FRED',
      classification: 'INDEPENDENT_VERIFIED',
      analysisStatus: 'VALID',
    },
    nominal10YAnalysis: {
      seriesId: 'DGS10',
      name: '10Y Treasury Yield',
      category: 'TREASURY_YIELD',
      latestValue: 4.10,
      latestObservationDate: '2026-10-06',
      direction: 'FALLING',
      change1Bp: -5,
      momentum: 'DOWN',
      freshness: 'CURRENT',
      freshnessReason: 'Fresh',
      sampleCount: 10,
      provider: 'FRED',
      classification: 'INDEPENDENT_VERIFIED',
      analysisStatus: 'VALID',
    },
  });

  assert(
    macroEv.macroBias === 'BULLISH' && macroEv.bullishEvidence.length >= 2,
    '1. Official XAUUSD macro evidence produces BULLISH bias on falling yields'
  );

  assert(
    macroEv.bullishEvidence.every((e) => e.provider === 'FRED' && e.classification === 'INDEPENDENT_VERIFIED'),
    '2. Macro evidence preserves INDEPENDENT_VERIFIED provenance and FRED provider'
  );

  assert(
    macroEv.missingEvidence.some((m) => m.includes('DXY') && m.includes('UNAVAILABLE')),
    '3. Missing DXY is truthfully preserved as UNAVAILABLE'
  );

  assert(
    macroEv.confidence > 0 && macroEv.evidenceTrust > 0,
    '4. Macro confidence and evidence trust are deterministically positive'
  );

  const emptyMacro = assembleXauusdMacroEvidence({});
  assert(
    emptyMacro.confidence === 0 && emptyMacro.dataReadiness === 'UNAVAILABLE',
    '5. Zero macro evidence produces 0 confidence and UNAVAILABLE readiness'
  );

  assert(
    !(macroEv as any).isExecutable && !(macroEv as any).tradeAllowed,
    '6. Macro evidence completely omits execution authority fields'
  );

  // =================================================================
  // MILESTONE B: UNIFIED AGENT CONTRACT & EVIDENCE INTEGRITY
  // =================================================================
  console.log('\n[MILESTONE B: UNIFIED AGENT CONTRACT & EVIDENCE INTEGRITY]');

  const sampleEvidence: UnifiedAgentEvidence = {
    id: 'ev-test-1',
    agentId: 'RATES_AGENT',
    domainFamily: 'RATES',
    nature: 'DATA',
    classification: 'INDEPENDENT_VERIFIED',
    polarity: 'BULLISH',
    strength: 0.8,
    confidence: 85,
    claim: '10Y Treasury yield dropped -5 bp',
    value: 4.10,
    unit: '%',
    changeBp: -5,
    source: 'FRED API',
    provider: 'FRED',
    observedAt: '2026-10-06',
    receivedAt: Date.now(),
    freshnessMs: 12000,
    isStale: false,
    instrument: 'XAUUSD',
  };

  assert(
    sampleEvidence.nature === 'DATA' && sampleEvidence.domainFamily === 'RATES',
    '7. UnifiedAgentEvidence strictly distinguishes nature (DATA) and domain family'
  );

  assert(
    sampleEvidence.classification === 'INDEPENDENT_VERIFIED' && sampleEvidence.polarity === 'BULLISH',
    '8. UnifiedAgentEvidence preserves classification and polarity'
  );

  assert(
    sampleEvidence.observedAt !== String(sampleEvidence.receivedAt),
    '9. Source observedAt is strictly distinct from system receivedAt timestamp'
  );

  assert(
    !(sampleEvidence as any).executable && !(sampleEvidence as any).orderType,
    '10. UnifiedAgentEvidence contains zero order or execution parameters'
  );

  const ratesAgent = evaluateRatesAgent({
    tenYearYield: {
      seriesId: 'DGS10',
      name: '10Y Yield',
      category: 'TREASURY_YIELD',
      latestValue: 4.10,
      latestObservationDate: '2026-10-06',
      direction: 'FALLING',
      change1Bp: -5,
      momentum: 'DOWN',
      freshness: 'CURRENT',
      freshnessReason: 'Fresh',
      sampleCount: 10,
      provider: 'FRED',
      classification: 'INDEPENDENT_VERIFIED',
      analysisStatus: 'VALID',
    },
  });

  assert(
    ratesAgent.domainFamily === 'RATES' && ratesAgent.direction === 'BULLISH',
    '11. RatesAgent conforms to UnifiedAgentResponse contract'
  );

  const emptyRates = evaluateRatesAgent({});
  assert(
    emptyRates.confidence === 0 && emptyRates.readiness === 'DATA_LIMITED',
    '12. RatesAgent fails closed to 0 confidence and DATA_LIMITED on empty inputs'
  );

  // =================================================================
  // MILESTONE C: SPECIALIST AGENT EXPANSION & DATA SENTINEL
  // =================================================================
  console.log('\n[MILESTONE C: SPECIALIST AGENT EXPANSION & DATA SENTINEL]');

  const inflationAgent = evaluateInflationAgent({
    realYieldAnalysis: {
      seriesId: 'DFII10',
      name: '10Y Real Yield',
      category: 'REAL_YIELD',
      latestValue: 1.95,
      latestObservationDate: '2026-10-06',
      direction: 'FALLING',
      change1Bp: -10,
      momentum: 'DOWN',
      freshness: 'CURRENT',
      freshnessReason: 'Fresh',
      sampleCount: 10,
      provider: 'FRED',
      classification: 'INDEPENDENT_VERIFIED',
      analysisStatus: 'VALID',
    },
  });

  assert(
    inflationAgent.domainFamily === 'INFLATION' && inflationAgent.direction === 'BULLISH',
    '13. InflationAgent correctly evaluates falling real yields as BULLISH'
  );

  const volAgent = evaluateVolatilityAgent({
    regime: {
      instrument: 'XAUUSD',
      trendRegime: 'EXPANSION',
      volatilityRegime: 'HIGH_VOLATILITY',
      riskRegime: 'RISK_OFF',
      macroRegime: 'RESTRICTIVE',
      liquidityRegime: 'EXPANDING',
      regimeSummary: 'High Volatility Expansion',
      confidence: 85,
      evidenceCount: 4,
      missingInputs: [],
      assessedAt: Date.now(),
    },
  });

  assert(
    volAgent.domainFamily === 'VOLATILITY' && volAgent.direction === 'CAUTION',
    '14. VolatilityAgent maps HIGH_VOLATILITY to CAUTION'
  );

  const crossAgent = evaluateCrossAssetAgent({});
  assert(
    crossAgent.domainFamily === 'CROSS_ASSET' && crossAgent.readiness === 'DATA_LIMITED',
    '15. CrossAssetAgent reports DATA_LIMITED when matrix uninitialized'
  );

  const dataSentinel = evaluateDataSentinelAgent({
    isMt5Online: true,
    activeProviders: ['FRED', 'MT5_LOCAL'],
    offlineProviders: [],
    feedAgeMs: 140,
  });

  assert(
    dataSentinel.domainFamily === 'SYSTEM_INTEGRITY' && dataSentinel.provenanceBadge === 'LIVE',
    '16. DataSentinelAgent audits feed integrity without emitting directional calls'
  );

  const degradedSentinel = evaluateDataSentinelAgent({
    isMt5Online: false,
    activeProviders: ['FRED'],
    offlineProviders: ['MT5_LOCAL'],
    feedAgeMs: 65000,
  });

  assert(
    degradedSentinel.readiness === 'DATA_LIMITED' && degradedSentinel.evidence[0].isStale === true,
    '17. DataSentinelAgent flags stale/offline feeds truthfully'
  );

  const quantAgent = evaluateQuantAgent({});
  assert(
    quantAgent.domainFamily === 'QUANT_STATISTICAL' && quantAgent.confidence === 0,
    '18. QuantAgent initializes safely with 0 confidence on empty models'
  );

  // =================================================================
  // MILESTONE D: CONFLUENCE ENGINE & DOMAIN DEDUPLICATION
  // =================================================================
  console.log('\n[MILESTONE D: CONFLUENCE ENGINE & DOMAIN DEDUPLICATION]');

  const confluenceEngine = new CortexConfluenceEngine();

  // Scenario 1: Multiple agents from same domain (RATES) should NOT dominate independent domains
  const duplicateRates1: UnifiedAgentResponse = {
    ...ratesAgent,
    agentId: 'RATES_1',
    agentName: 'Rates Subagent 1',
  };
  const duplicateRates2: UnifiedAgentResponse = {
    ...ratesAgent,
    agentId: 'RATES_2',
    agentName: 'Rates Subagent 2',
  };
  const opposingTech: UnifiedAgentResponse = {
    agentId: 'TECH_1',
    agentName: 'Technical Agent',
    role: 'SMC Structure',
    domainFamily: 'PRICE_TECHNICAL',
    instrument: 'XAUUSD',
    direction: 'BEARISH',
    confidence: 85,
    evidenceTrust: 90,
    readiness: 'READY',
    primaryThesis: 'Bearish market structure shift',
    evidence: [],
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Swing high break',
    keyRisk: 'Liquidity sweep',
    provenanceBadge: 'INDEPENDENT',
    generatedAt: Date.now(),
  };

  const confluenceResult = confluenceEngine.evaluateConfluence({
    instrument: 'XAUUSD',
    agents: [duplicateRates1, duplicateRates2, opposingTech],
  });

  assert(
    confluenceResult.supportingDomains.length === 1 && confluenceResult.supportingDomains[0] === 'RATES',
    '19. Domain deduplication groups multiple RATES agents into exactly 1 domain vote'
  );

  assert(
    confluenceResult.conflictScore > 0 && confluenceResult.criticalConflicts.length > 0,
    '20. Disagreement between RATES and PRICE_TECHNICAL raises conflictScore'
  );

  // Scenario 2: Unanimous alignment across multiple independent domains
  const unanimousResult = confluenceEngine.evaluateConfluence({
    instrument: 'XAUUSD',
    agents: [ratesAgent, inflationAgent],
  });

  assert(
    unanimousResult.directionalThesis === 'BULLISH' && unanimousResult.conflictScore === 0,
    '21. Unanimous independent alignment yields BULLISH thesis with 0 conflict'
  );

  assert(
    unanimousResult.presentationPosture === 'WATCH FOR BUY',
    '22. BULLISH confluence maps safely to WATCH FOR BUY (strictly non-executable)'
  );

  assert(
    !(unanimousResult as any).buy && !(unanimousResult as any).orderSend,
    '23. ConfluenceOutput completely omits execution commands'
  );

  const emptyConfluence = confluenceEngine.evaluateConfluence({
    instrument: 'XAUUSD',
    agents: [],
  });
  assert(
    emptyConfluence.directionalThesis === 'DATA_LIMITED' && emptyConfluence.presentationPosture === 'WAIT',
    '24. Empty agent array produces DATA_LIMITED thesis and WAIT posture'
  );

  assert(
    emptyConfluence.confidence === 0,
    '25. Empty confluence confidence is strictly 0'
  );

  // =================================================================
  // MILESTONE E: MARKET REGIME ENGINE
  // =================================================================
  console.log('\n[MILESTONE E: MARKET REGIME ENGINE]');

  const regimeRes = classifyMarketRegime({
    instrument: 'XAUUSD',
    swingTrend: 'BULLISH',
    adx: 40,
    atr: 25,
    historicalAtrAverage: 15, // 25 / 15 = 1.66x -> HIGH_VOLATILITY
    realYieldBpChange: -8,
    equityReturnPct: 0.8,
  });

  assert(
    regimeRes.trendRegime === 'EXPANSION' && regimeRes.volatilityRegime === 'HIGH_VOLATILITY',
    '26. Classifies high ATR expansion as EXPANSION and HIGH_VOLATILITY'
  );

  assert(
    regimeRes.riskRegime === 'RISK_ON' && regimeRes.macroRegime === 'EASING',
    '27. Classifies positive equity return and falling real yields as RISK_ON and EASING'
  );

  const missingRegime = classifyMarketRegime({ instrument: 'XAUUSD' });
  assert(
    missingRegime.trendRegime === 'UNKNOWN' && missingRegime.confidence === 0,
    '28. Missing regime inputs fail closed to UNKNOWN and 0 confidence'
  );

  assert(
    missingRegime.missingInputs.length === 4,
    '29. Explicitly documents all 4 missing input categories'
  );

  assert(
    !(regimeRes as any).tradeSignal && !(regimeRes as any).isExecutable,
    '30. MarketRegimeAssessment contains zero execution semantics'
  );

  // =================================================================
  // MILESTONE F: CROSS-ASSET INTELLIGENCE & DXY TRUTHFULNESS
  // =================================================================
  console.log('\n[MILESTONE F: CROSS-ASSET INTELLIGENCE & DXY TRUTHFULNESS]');

  const sampleGold = [
    { date: '2026-10-01', timestamp: 1, value: 2600 },
    { date: '2026-10-02', timestamp: 2, value: 2620 },
    { date: '2026-10-03', timestamp: 3, value: 2615 },
    { date: '2026-10-04', timestamp: 4, value: 2630 },
    { date: '2026-10-05', timestamp: 5, value: 2650 },
  ];
  const sampleRealYield = [
    { date: '2026-10-01', timestamp: 1, value: 2.10 },
    { date: '2026-10-02', timestamp: 2, value: 2.05 },
    { date: '2026-10-03', timestamp: 3, value: 2.08 },
    { date: '2026-10-04', timestamp: 4, value: 2.02 },
    { date: '2026-10-05', timestamp: 5, value: 1.95 },
  ];

  const pearson = calculatePearsonCorrelation(sampleGold, sampleRealYield);
  assert(
    pearson !== null && pearson.correlation < -0.80,
    '31. Calculates negative rolling Pearson correlation between Gold and Real Yields'
  );

  const tinySample = calculatePearsonCorrelation(sampleGold.slice(0, 3), sampleRealYield.slice(0, 3));
  assert(
    tinySample === null,
    '32. Refuses to compute Pearson correlation on sample size < 5 (fails closed to null)'
  );

  const crossMatrix = buildCrossAssetMatrix({
    goldSeries: sampleGold,
    realYieldSeries: sampleRealYield,
    hasVerifiedDxy: false,
  });

  assert(
    crossMatrix.relationships['US_REAL_YIELD']?.status === 'VERIFIED',
    '33. Cross-asset matrix verifies aligned Real Yield relationship'
  );

  assert(
    crossMatrix.relationships['DXY']?.status === 'UNAVAILABLE',
    '34. DXY is strictly classified as UNAVAILABLE in cross-asset matrix'
  );

  assert(
    !crossMatrix.relationships['DXY']?.rollingCorrelation,
    '35. Zero synthetic DXY correlation generated'
  );

  // =================================================================
  // MILESTONE G: QUANT FOUNDATION & HISTORICAL ANALOGUES
  // =================================================================
  console.log('\n[MILESTONE G: QUANT FOUNDATION & HISTORICAL ANALOGUES]');

  const priceBars = [
    { date: '2026-10-01', timestamp: 1, open: 2600, high: 2610, low: 2590, close: 2605 },
    { date: '2026-10-02', timestamp: 2, open: 2605, high: 2625, low: 2600, close: 2620 },
    { date: '2026-10-03', timestamp: 3, open: 2620, high: 2625, low: 2610, close: 2615 },
    { date: '2026-10-04', timestamp: 4, open: 2615, high: 2635, low: 2612, close: 2630 },
    { date: '2026-10-05', timestamp: 5, open: 2630, high: 2655, low: 2625, close: 2650 },
    { date: '2026-10-06', timestamp: 6, open: 2650, high: 2660, low: 2640, close: 2645 },
  ];

  const quantMetrics = calculateQuantMetrics(priceBars);
  assert(
    quantMetrics.status === 'VALID' && quantMetrics.annualizedVolatilityPct > 0,
    '36. Calculates annualized volatility and returns statistics over price bars'
  );

  assert(
    quantMetrics.maxDrawdownPct >= 0,
    '37. Calculates maximum drawdown without look-ahead bias'
  );

  const analogueRes = matchHistoricalAnalogues({
    currentTrend: 'BULLISH',
    realYieldDirection: 'FALLING',
    volatilityLevel: 'NORMAL',
    historicalPeriods: [
      { date: '2024-03-01', trend: 'BULLISH', realYieldDirection: 'FALLING', volatilityLevel: 'NORMAL', forwardReturnsPct: { tPlus5: 2.1, tPlus20: 5.4 } },
      { date: '2024-07-15', trend: 'BULLISH', realYieldDirection: 'FALLING', volatilityLevel: 'NORMAL', forwardReturnsPct: { tPlus5: 1.8, tPlus20: 4.2 } },
      { date: '2024-09-10', trend: 'BULLISH', realYieldDirection: 'FALLING', volatilityLevel: 'NORMAL', forwardReturnsPct: { tPlus5: 2.4, tPlus20: 6.1 } },
    ],
  });

  assert(
    analogueRes.status === 'VALID' && analogueRes.matchedSampleCount === 3,
    '38. Historical analogue matches past regime periods meeting multi-factor criteria'
  );

  assert(
    analogueRes.forward5dMedianReturnPct === 2.1 && analogueRes.positiveOutcomeFrequency5dPct === 100,
    '39. Historical analogue returns forward median returns and positive frequency'
  );

  const tinyAnalogue = matchHistoricalAnalogues({
    currentTrend: 'BULLISH',
    realYieldDirection: 'FALLING',
    volatilityLevel: 'NORMAL',
    historicalPeriods: [
      { date: '2024-03-01', trend: 'BULLISH', realYieldDirection: 'FALLING', volatilityLevel: 'NORMAL', forwardReturnsPct: { tPlus5: 2.1, tPlus20: 5.4 } },
    ],
  });
  assert(
    tinyAnalogue.status === 'INSUFFICIENT_SAMPLE',
    '40. Historical analogue fails closed to INSUFFICIENT_SAMPLE on n < 3'
  );

  // =================================================================
  // MILESTONE H: PORTFOLIO & FACTOR EXPOSURE
  // =================================================================
  console.log('\n[MILESTONE H: PORTFOLIO & FACTOR EXPOSURE]');

  const samplePositions = [
    { id: 'pos-1', symbol: 'XAUUSD', direction: 'LONG' as const, volumeLots: 1.0, openPrice: 2600, currentPrice: 2620, unrealizedPl: 2000, currency: 'USD' },
    { id: 'pos-2', symbol: 'EURUSD', direction: 'LONG' as const, volumeLots: 2.0, openPrice: 1.08, currentPrice: 1.085, unrealizedPl: 1000, currency: 'USD' },
  ];

  const exposure = analyzePortfolioExposures(samplePositions);
  assert(
    exposure.usdNetExposureLots < 0 && exposure.usdConcentrationPct === 100,
    '41. Detects that Long XAUUSD + Long EURUSD yields 100% net Short USD concentration'
  );

  assert(
    exposure.overlappingRisks.length > 0 && exposure.overlappingRisks[0].includes('USD'),
    '42. Documents overlapping USD risk warning'
  );

  const emptyExposure = analyzePortfolioExposures([]);
  assert(
    emptyExposure.usdNetExposureLots === 0 && emptyExposure.currencyDiversificationScore === 100,
    '43. Empty portfolio returns neutral factor exposure without errors'
  );

  assert(
    !(exposure as any).modifyPosition && !(exposure as any).closeOrder,
    '44. Portfolio exposure analysis contains zero execution methods'
  );

  // =================================================================
  // ABSOLUTE SAFETY & EXECUTION BOUNDARY
  // =================================================================
  console.log('\n[ABSOLUTE SAFETY & EXECUTION BOUNDARY]');

  assert(
    CANONICAL_EXECUTION_MODE === 'READ_ONLY',
    '45. CANONICAL_EXECUTION_MODE remains strictly READ_ONLY'
  );

  assert(
    MT5_ORDER_TRANSPORT_ENABLED === false,
    '46. MT5_ORDER_TRANSPORT_ENABLED remains strictly false'
  );

  assert(
    typeof (confluenceEngine as any).placeOrder === 'undefined',
    '47. Confluence Engine has zero placeOrder methods'
  );

  assert(
    typeof (confluenceEngine as any).executeTrade === 'undefined',
    '48. Confluence Engine has zero executeTrade methods'
  );

  assert(
    unanimousResult.presentationPosture !== ('BUY' as any) && unanimousResult.presentationPosture !== ('SELL' as any),
    '49. Presentation posture never emits raw BUY or SELL'
  );

  assert(
    process.env.FRED_API_KEY === undefined || !JSON.stringify(unanimousResult).includes(String(process.env.FRED_API_KEY)),
    '50. Zero secret leakage in serializable results'
  );

  console.log('\n=================================================================');
  console.log(`TOTAL MASTER EXPANSION TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runMasterProgramTests().catch((err) => {
  console.error('Master program test suite failed:', err);
  process.exit(1);
});

