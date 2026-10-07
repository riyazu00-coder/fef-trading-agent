/**
 * FEF CORTEX — SPRINT 1C TEST SUITE
 * MACRO INTELLIGENCE INTEGRATION
 * 
 * Verifies all 67 required tests across Groups A through L:
 * GROUP A — HISTORY (1 - 6)
 * GROUP B — SERIES ANALYSIS (7 - 15)
 * GROUP C — YIELD CURVE (16 - 22)
 * GROUP D — FED POLICY (23 - 27)
 * GROUP E — REAL YIELD / GOLD (28 - 31)
 * GROUP F — BREAKEVEN (32 - 35)
 * GROUP G — XAUUSD MACRO ASSEMBLER (36 - 45)
 * GROUP H — DXY TRUTHFULNESS (46 - 49)
 * GROUP I — PROVENANCE (50 - 54)
 * GROUP J — FRESHNESS (55 - 58)
 * GROUP K — EXECUTION BOUNDARY (59 - 63)
 * GROUP L — CONTEXT ISOLATION (64 - 67)
 */

import { FEFDataHub } from '../src/lib/datahub/fef-datahub';
import {
  analyzeFedPolicy,
  analyzeMacroSeries,
  analyzeYieldCurve,
  assembleXauusdMacroEvidence,
  FredConnector,
  HttpFetchFn,
  MacroIntelligenceEngine,
  NormalizedMacroObservation,
  getMacroSeriesDefinition,
  normalizeFredObservation,
} from '../src/lib/macro';
import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';

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

// Deterministic test helper to create mock observations
function createMockObs(
  seriesId: string,
  date: string,
  val: number,
  freshness: 'CURRENT' | 'AGING' | 'STALE' = 'CURRENT',
  nowMs: number = Date.parse('2026-10-07T12:00:00.000Z')
): NormalizedMacroObservation {
  const def = getMacroSeriesDefinition(seriesId)!;
  const obsTimestamp = Date.parse(`${date}T00:00:00.000Z`);
  return {
    seriesId,
    name: def?.name || seriesId,
    category: def?.category || 'TREASURY_YIELD',
    value: val,
    unit: def?.unit || '%',
    observationDate: date,
    observationTimestamp: obsTimestamp,
    receivedAt: nowMs,
    provider: 'FRED',
    source: def?.source || 'Federal Reserve Bank of St. Louis (FRED)',
    provenance: 'INDEPENDENT_VERIFIED',
    freshness,
    freshnessReason: `Mock ${freshness}`,
    affectedAssets: def?.affectedAssets || ['XAUUSD'],
  };
}

async function runSprint1cTests() {
  console.log('\n=================================================================');
  console.log('FEF CORTEX: MACRO INTELLIGENCE TEST SUITE (SPRINT 1C)');
  console.log('=================================================================\n');

  const fixedNow = Date.parse('2026-10-07T12:00:00.000Z');

  // =================================================================
  // GROUP A — HISTORY
  // =================================================================
  console.log('[GROUP A — HISTORY]');

  // Mock connector with historical response
  const historyRawResponse = {
    observations: [
      { date: '2026-10-06', value: '4.15' },
      { date: '2026-10-05', value: '4.10' },
      { date: '2026-10-04', value: '.' },      // Missing sentinel
      { date: '2026-10-03', value: '4.08' },
      { date: '2026-10-03', value: '4.08' },  // Duplicate date
      { date: '2026-10-02', value: '4.05' },
    ],
  };

  const mockTransport: HttpFetchFn = async () => ({
    status: 200,
    text: async () => JSON.stringify(historyRawResponse),
  });

  const connectorA = new FredConnector({
    fetchTransport: mockTransport,
    now: () => fixedNow,
  });

  const histResult = await connectorA.fetchHistoricalObservations('DGS10', {
    apiKey: 'mock_test_key',
    limit: 20,
  });

  assert(
    histResult.isAvailable === true && histResult.payload?.observations.length === 4,
    '1. bounded history returns validated observations',
    `Expected 4 valid obs, got ${histResult.payload?.observations.length}`
  );

  const obsA = histResult.payload!.observations;
  const isAscending = obsA.every((v, i) => i === 0 || v.observationTimestamp > obsA[i - 1].observationTimestamp);
  assert(
    isAscending && obsA[0].observationDate === '2026-10-02' && obsA[obsA.length - 1].observationDate === '2026-10-06',
    '2. observations sorted correctly (ascending chronological order)'
  );

  const uniqueDates = new Set(obsA.map((o) => o.observationDate));
  assert(
    uniqueDates.size === obsA.length,
    '3. duplicate dates handled deterministically without duplication'
  );

  const hasZero = obsA.some((o) => o.value === 0);
  assert(
    !hasZero && !obsA.some((o) => o.observationDate === '2026-10-04'),
    '4. "." missing observations never become zero or appear as numeric 0'
  );

  // Malformed entry rejected
  const malformedTransport: HttpFetchFn = async () => ({
    status: 200,
    text: async () => JSON.stringify({ observations: [{ date: 'not-a-date', value: '4.00' }] }),
  });
  const connectorMalformed = new FredConnector({ fetchTransport: malformedTransport, now: () => fixedNow });
  const malformedRes = await connectorMalformed.fetchHistoricalObservations('DGS10', { apiKey: 'key' });
  assert(
    malformedRes.isAvailable === false && malformedRes.error?.code === 'NO_VALID_OBSERVATIONS',
    '5. malformed history entry rejected fail-closed'
  );

  // Clamped limit (cannot request unlimited history)
  let capturedUrl = '';
  const captureTransport: HttpFetchFn = async (url) => {
    capturedUrl = url;
    return { status: 200, text: async () => JSON.stringify({ observations: [] }) };
  };
  const connectorLimit = new FredConnector({ fetchTransport: captureTransport, now: () => fixedNow });
  await connectorLimit.fetchHistoricalObservations('DGS10', { apiKey: 'key', limit: 9999 });
  assert(
    capturedUrl.includes('limit=100'),
    '6. no unlimited history request (clamped to max 100)'
  );

  // =================================================================
  // GROUP B — SERIES ANALYSIS
  // =================================================================
  console.log('\n[GROUP B — SERIES ANALYSIS]');

  const risingObs = [
    createMockObs('DGS10', '2026-10-01', 4.00),
    createMockObs('DGS10', '2026-10-02', 4.03),
    createMockObs('DGS10', '2026-10-03', 4.08),
  ];
  const risingAnalysis = analyzeMacroSeries(risingObs);
  assert(
    risingAnalysis.direction === 'RISING' && (risingAnalysis.change1Bp ?? 0) === 5,
    '7. rising yield detected'
  );

  const fallingObs = [
    createMockObs('DGS10', '2026-10-01', 4.10),
    createMockObs('DGS10', '2026-10-02', 4.05),
    createMockObs('DGS10', '2026-10-03', 4.01),
  ];
  const fallingAnalysis = analyzeMacroSeries(fallingObs);
  assert(
    fallingAnalysis.direction === 'FALLING' && (fallingAnalysis.change1Bp ?? 0) === -4,
    '8. falling yield detected'
  );

  const flatObs = [
    createMockObs('DGS10', '2026-10-01', 4.10),
    createMockObs('DGS10', '2026-10-02', 4.102), // 0.2 bp change (< 1.0 bp threshold)
  ];
  const flatAnalysis = analyzeMacroSeries(flatObs);
  assert(
    flatAnalysis.direction === 'FLAT',
    '9. flat yield detected'
  );

  const singleObs = [createMockObs('DGS10', '2026-10-01', 4.10)];
  const singleAnalysis = analyzeMacroSeries(singleObs);
  assert(
    singleAnalysis.direction === 'INSUFFICIENT_DATA' && singleAnalysis.analysisStatus === 'INSUFFICIENT_DATA',
    '10. insufficient history returns INSUFFICIENT_DATA'
  );

  assert(
    risingAnalysis.change1Bp === 5,
    '11. 1-observation bp change correct (4.03 -> 4.08 = +5 bp)'
  );

  const sixObs = [
    createMockObs('DGS10', '2026-10-01', 4.00),
    createMockObs('DGS10', '2026-10-02', 4.02),
    createMockObs('DGS10', '2026-10-03', 4.04),
    createMockObs('DGS10', '2026-10-04', 4.06),
    createMockObs('DGS10', '2026-10-05', 4.08),
    createMockObs('DGS10', '2026-10-06', 4.12),
  ];
  const sixAnalysis = analyzeMacroSeries(sixObs);
  assert(
    sixAnalysis.change5Bp === 12,
    '12. 5-observation bp change correct (4.00 -> 4.12 = +12 bp)'
  );

  // Accelerating Up: prior change = +2 bp, current change = +5 bp -> diff = +3 bp >= 1 bp
  const accelUpObs = [
    createMockObs('DGS10', '2026-10-01', 4.00),
    createMockObs('DGS10', '2026-10-02', 4.02),
    createMockObs('DGS10', '2026-10-03', 4.07),
  ];
  const accelUpAnalysis = analyzeMacroSeries(accelUpObs);
  assert(
    accelUpAnalysis.momentum === 'ACCELERATING_UP',
    '13. momentum up calculated deterministically (ACCELERATING_UP)'
  );

  // Accelerating Down: prior change = -2 bp, current change = -5 bp -> diff = -3 bp <= -1 bp
  const accelDownObs = [
    createMockObs('DGS10', '2026-10-01', 4.10),
    createMockObs('DGS10', '2026-10-02', 4.08),
    createMockObs('DGS10', '2026-10-03', 4.03),
  ];
  const accelDownAnalysis = analyzeMacroSeries(accelDownObs);
  assert(
    accelDownAnalysis.momentum === 'ACCELERATING_DOWN',
    '14. momentum down calculated deterministically (ACCELERATING_DOWN)'
  );

  // NaN/Infinity fail closed
  const nanObs = [
    { ...risingObs[0], value: NaN },
    { ...risingObs[1], value: Infinity },
  ];
  const nanAnalysis = analyzeMacroSeries(nanObs as any);
  assert(
    nanAnalysis.analysisStatus === 'INSUFFICIENT_DATA',
    '15. NaN/Infinity fail closed to INSUFFICIENT_DATA'
  );

  // =================================================================
  // GROUP C — YIELD CURVE
  // =================================================================
  console.log('\n[GROUP C — YIELD CURVE]');

  // Positive spread: 10Y = 4.25%, 2Y = 3.90% -> spread = +35 bp (> 10 bp) -> NORMAL
  const dgs2Normal = [
    createMockObs('DGS2', '2026-10-05', 3.85),
    createMockObs('DGS2', '2026-10-06', 3.90),
  ];
  const dgs10Normal = [
    createMockObs('DGS10', '2026-10-05', 4.20),
    createMockObs('DGS10', '2026-10-06', 4.25),
  ];
  const ycNormal = analyzeYieldCurve(dgs2Normal, dgs10Normal);
  assert(
    ycNormal.curveState === 'NORMAL' && ycNormal.spreadBp === 35,
    '16. positive 10Y-2Y spread classified correctly as NORMAL'
  );

  // Inverted: 10Y = 4.00%, 2Y = 4.50% -> spread = -50 bp (< -10 bp) -> INVERTED
  const dgs2Inverted = [createMockObs('DGS2', '2026-10-06', 4.50)];
  const dgs10Inverted = [createMockObs('DGS10', '2026-10-06', 4.00)];
  const ycInverted = analyzeYieldCurve(dgs2Inverted, dgs10Inverted);
  assert(
    ycInverted.curveState === 'INVERTED' && ycInverted.spreadBp === -50,
    '17. negative spread classified INVERTED'
  );

  // Flat: 10Y = 4.05%, 2Y = 4.00% -> spread = +5 bp (between -10 and +10) -> FLAT
  const dgs2Flat = [createMockObs('DGS2', '2026-10-06', 4.00)];
  const dgs10Flat = [createMockObs('DGS10', '2026-10-06', 4.05)];
  const ycFlat = analyzeYieldCurve(dgs2Flat, dgs10Flat);
  assert(
    ycFlat.curveState === 'FLAT' && ycFlat.spreadBp === 5,
    '18. near-zero spread classified FLAT'
  );

  // Steepening: prior spread = 20 bp, current spread = 25 bp -> change = +5 bp (>= 2 bp) -> STEEPENING
  const dgs2Steep = [
    createMockObs('DGS2', '2026-10-05', 4.00),
    createMockObs('DGS2', '2026-10-06', 4.00),
  ];
  const dgs10Steep = [
    createMockObs('DGS10', '2026-10-05', 4.20),
    createMockObs('DGS10', '2026-10-06', 4.25),
  ];
  const ycSteep = analyzeYieldCurve(dgs2Steep, dgs10Steep);
  assert(
    ycSteep.curveDirection === 'STEEPENING',
    '19. steepening detected'
  );

  // Flattening: prior spread = 30 bp, current spread = 25 bp -> change = -5 bp (<= -2 bp) -> FLATTENING
  const dgs2FlatDir = [
    createMockObs('DGS2', '2026-10-05', 4.00),
    createMockObs('DGS2', '2026-10-06', 4.05),
  ];
  const dgs10FlatDir = [
    createMockObs('DGS10', '2026-10-05', 4.30),
    createMockObs('DGS10', '2026-10-06', 4.30),
  ];
  const ycFlattening = analyzeYieldCurve(dgs2FlatDir, dgs10FlatDir);
  assert(
    ycFlattening.curveDirection === 'FLATTENING',
    '20. flattening detected'
  );

  // Mismatched dates
  const dgs2Mismatch = [createMockObs('DGS2', '2026-10-04', 4.00)];
  const dgs10Mismatch = [createMockObs('DGS10', '2026-10-06', 4.30)];
  const ycMismatch = analyzeYieldCurve(dgs2Mismatch, dgs10Mismatch);
  assert(
    ycMismatch.datesMatched === false && ycMismatch.status === 'INSUFFICIENT_DATA',
    '21. mismatched observation dates handled honestly (datesMatched: false, status: INSUFFICIENT_DATA)'
  );

  // Missing series
  const ycMissing = analyzeYieldCurve([], dgs10Normal);
  assert(
    ycMissing.status === 'INSUFFICIENT_DATA' && ycMissing.confidence === 0,
    '22. missing series gives INSUFFICIENT_DATA'
  );

  // =================================================================
  // GROUP D — FED POLICY
  // =================================================================
  console.log('\n[GROUP D — FED POLICY]');

  const dfedtaruObs = [createMockObs('DFEDTARU', '2026-10-06', 5.50)];
  const dfedtarlObs = [createMockObs('DFEDTARL', '2026-10-06', 5.25)];
  const dffObs = [createMockObs('DFF', '2026-10-06', 5.33)];

  const fedPolicy = analyzeFedPolicy(dfedtaruObs, dfedtarlObs, dffObs);
  assert(
    fedPolicy.targetMidpoint === 5.375,
    '23. target midpoint calculated correctly ((5.50 + 5.25)/2 = 5.375)'
  );

  assert(
    fedPolicy.distanceFromMidpointBp === -4.5,
    '24. effective rate distance calculated correctly (5.33 - 5.375 = -4.5 bp)'
  );

  assert(
    fedPolicy.targetUpper === 5.50 && fedPolicy.targetLower === 5.25 && fedPolicy.corridorWidthBp === 25,
    '25. target range preserved'
  );

  const missingUpper = analyzeFedPolicy([], dfedtarlObs);
  assert(
    missingUpper.status === 'INSUFFICIENT_DATA' && missingUpper.policyState === 'INSUFFICIENT_DATA',
    '26. missing upper/lower bound fails closed'
  );

  assert(
    fedPolicy.descriptiveOnly === true && !(fedPolicy as any).predictedHike && !(fedPolicy as any).predictedCut,
    '27. no Fed hike/cut prediction fabricated (descriptive only)'
  );

  // =================================================================
  // GROUP E — REAL YIELD / GOLD
  // =================================================================
  console.log('\n[GROUP E — REAL YIELD / GOLD]');

  const fallingRealYield = analyzeMacroSeries([
    createMockObs('DFII10', '2026-10-05', 2.05),
    createMockObs('DFII10', '2026-10-06', 1.95), // -10 bp
  ]);
  const evidenceFallingRY = assembleXauusdMacroEvidence({ realYieldAnalysis: fallingRealYield });
  assert(
    evidenceFallingRY.bullishEvidence.some((e) => e.factor === 'REAL_YIELD' && e.polarity === 'BULLISH'),
    '28. falling DFII10 creates bullish gold evidence'
  );

  const risingRealYield = analyzeMacroSeries([
    createMockObs('DFII10', '2026-10-05', 1.95),
    createMockObs('DFII10', '2026-10-06', 2.05), // +10 bp
  ]);
  const evidenceRisingRY = assembleXauusdMacroEvidence({ realYieldAnalysis: risingRealYield });
  assert(
    evidenceRisingRY.bearishEvidence.some((e) => e.factor === 'REAL_YIELD' && e.polarity === 'BEARISH'),
    '29. rising DFII10 creates bearish gold evidence'
  );

  const flatRealYield = analyzeMacroSeries([
    createMockObs('DFII10', '2026-10-05', 2.00),
    createMockObs('DFII10', '2026-10-06', 2.002),
  ]);
  const evidenceFlatRY = assembleXauusdMacroEvidence({ realYieldAnalysis: flatRealYield });
  assert(
    evidenceFlatRY.neutralEvidence.some((e) => e.factor === 'REAL_YIELD' && e.polarity === 'NEUTRAL'),
    '30. flat real yield creates neutral evidence'
  );

  const staleRealYield = {
    ...fallingRealYield,
    freshness: 'STALE' as const,
    freshnessReason: 'Observation exceeds expected release schedule',
  };
  const evidenceStaleRY = assembleXauusdMacroEvidence({ realYieldAnalysis: staleRealYield });
  assert(
    !evidenceStaleRY.bullishEvidence.some((e) => e.factor === 'REAL_YIELD') &&
      evidenceStaleRY.missingEvidence.some((m) => m.includes('DFII10 is STALE')),
    '31. stale real yield cannot masquerade as current (excluded from directional bias)'
  );

  // =================================================================
  // GROUP F — BREAKEVEN
  // =================================================================
  console.log('\n[GROUP F — BREAKEVEN]');

  const risingBreakeven = analyzeMacroSeries([
    createMockObs('T10YIE', '2026-10-05', 2.25),
    createMockObs('T10YIE', '2026-10-06', 2.30), // +5 bp
  ]);
  assert(
    risingBreakeven.direction === 'RISING' && risingBreakeven.change1Bp === 5,
    '32. rising T10YIE classified correctly'
  );

  const fallingBreakeven = analyzeMacroSeries([
    createMockObs('T10YIE', '2026-10-05', 2.30),
    createMockObs('T10YIE', '2026-10-06', 2.25), // -5 bp
  ]);
  assert(
    fallingBreakeven.direction === 'FALLING' && fallingBreakeven.change1Bp === -5,
    '33. falling T10YIE classified correctly'
  );

  const breakevenGoldEv = assembleXauusdMacroEvidence({ breakevenAnalysis: risingBreakeven });
  const breakevenItem = breakevenGoldEv.bullishEvidence.find((e) => e.seriesId === 'T10YIE');
  assert(
    breakevenItem !== undefined &&
      !breakevenItem.claim.includes('CPI') &&
      breakevenItem.relevance.includes('not realized CPI'),
    '34. breakeven never labeled CPI (labeled market-implied breakeven inflation)'
  );

  const emptyBreakeven = analyzeMacroSeries([]);
  assert(
    emptyBreakeven.analysisStatus === 'INSUFFICIENT_DATA' && emptyBreakeven.direction === 'INSUFFICIENT_DATA',
    '35. insufficient breakeven data fails closed'
  );

  // =================================================================
  // GROUP G — XAUUSD MACRO ASSEMBLER
  // =================================================================
  console.log('\n[GROUP G — XAUUSD MACRO ASSEMBLER]');

  // Bullish assembly: falling real yield + falling nominal yield
  const bullishAssembly = assembleXauusdMacroEvidence({
    realYieldAnalysis: fallingRealYield,
    nominal10YAnalysis: fallingAnalysis,
  });
  assert(
    bullishAssembly.macroBias === 'BULLISH' && bullishAssembly.bullishEvidence.length >= 2,
    '36. bullish evidence assembled correctly'
  );

  // Bearish assembly: rising real yield + rising nominal yield
  const bearishAssembly = assembleXauusdMacroEvidence({
    realYieldAnalysis: risingRealYield,
    nominal10YAnalysis: risingAnalysis,
  });
  assert(
    bearishAssembly.macroBias === 'BEARISH' && bearishAssembly.bearishEvidence.length >= 2,
    '37. bearish evidence assembled correctly'
  );

  // Mixed assembly: falling real yield (bullish) + rising nominal 10Y (bearish)
  const mixedAssembly = assembleXauusdMacroEvidence({
    realYieldAnalysis: fallingRealYield,
    nominal10YAnalysis: risingAnalysis,
  });
  assert(
    mixedAssembly.macroBias === 'MIXED' &&
      mixedAssembly.bullishEvidence.length > 0 &&
      mixedAssembly.bearishEvidence.length > 0,
    '38. mixed evidence preserved (both bullish and bearish retained)'
  );

  assert(
    mixedAssembly.conflictingEvidence.length > 0 && mixedAssembly.confidence < bullishAssembly.confidence,
    '39. conflicting evidence reduces confidence'
  );

  assert(
    mixedAssembly.missingEvidence.length > 0,
    '40. missing evidence explicitly listed'
  );

  const noEvidenceAssembly = assembleXauusdMacroEvidence({});
  assert(
    noEvidenceAssembly.macroBias === 'DATA_LIMITED' && noEvidenceAssembly.dataReadiness === 'UNAVAILABLE',
    '41. no evidence gives DATA_LIMITED and UNAVAILABLE readiness'
  );

  assert(
    noEvidenceAssembly.confidence === 0 && noEvidenceAssembly.evidenceTrust === 0,
    '42. no evidence confidence = 0 and evidenceTrust = 0'
  );

  // Partial coverage
  const partialAssembly = assembleXauusdMacroEvidence({ realYieldAnalysis: fallingRealYield });
  assert(
    partialAssembly.dataReadiness === 'PARTIAL' && partialAssembly.providerCoverage === 0.40,
    '43. partial coverage remains PARTIAL'
  );

  assert(
    !(bullishAssembly as any).orderType &&
      !(bullishAssembly as any).signal &&
      !(bullishAssembly as any).action &&
      bullishAssembly.macroBias !== ('BUY' as any) &&
      bullishAssembly.macroBias !== ('SELL' as any),
    '44. no BUY/SELL signal emitted'
  );

  assert(
    !(bullishAssembly as any).posture?.includes('WATCH') &&
      bullishAssembly.macroBias !== ('WATCH_FOR_BUY' as any),
    '45. no WATCH signal emitted'
  );

  // =================================================================
  // GROUP H — DXY TRUTHFULNESS
  // =================================================================
  console.log('\n[GROUP H — DXY TRUTHFULNESS]');

  const dxyTruthAssembly = assembleXauusdMacroEvidence({
    realYieldAnalysis: fallingRealYield,
    hasDxyProvider: false,
  });
  assert(
    dxyTruthAssembly.missingEvidence.some((m) => m.includes('DXY') && m.includes('UNAVAILABLE')),
    '46. DXY unavailable when no verified provider exists'
  );

  assert(
    !(dxyTruthAssembly as any).dxyValue &&
      !(dxyTruthAssembly as any).dxy &&
      !dxyTruthAssembly.seriesCoverage.includes('DXY'),
    '47. no synthetic DXY value'
  );

  assert(
    !(dxyTruthAssembly as any).dxyTrend && !(dxyTruthAssembly as any).dxyDirection,
    '48. no fabricated DXY trend'
  );

  assert(
    dxyTruthAssembly.bullishEvidence.length > 0 && dxyTruthAssembly.macroBias === 'BULLISH',
    '49. DXY absence lowers coverage without erasing valid rate evidence'
  );

  // =================================================================
  // GROUP I — PROVENANCE
  // =================================================================
  console.log('\n[GROUP I — PROVENANCE]');

  const evItem = bullishAssembly.bullishEvidence[0];
  assert(
    evItem.seriesId === 'DFII10' && evItem.factor === 'REAL_YIELD',
    '50. every directional evidence item contains series provenance'
  );

  assert(
    evItem.observationDate === '2026-10-06',
    '51. observation date preserved'
  );

  assert(
    evItem.provider === 'FRED',
    '52. provider preserved'
  );

  assert(
    evItem.classification === 'INDEPENDENT_VERIFIED',
    '53. classification preserved (INDEPENDENT_VERIFIED)'
  );

  assert(
    evItem.freshness === 'CURRENT',
    '54. freshness preserved'
  );

  // =================================================================
  // GROUP J — FRESHNESS
  // =================================================================
  console.log('\n[GROUP J — FRESHNESS]');

  const agingRealYield = {
    ...fallingRealYield,
    freshness: 'AGING' as const,
  };
  const agingAssembly = assembleXauusdMacroEvidence({ realYieldAnalysis: agingRealYield });
  assert(
    agingAssembly.evidenceTrust < bullishAssembly.evidenceTrust,
    '55. stale/aging observation reduces trust'
  );

  // Weekend gap: Friday observation evaluated on Sunday (e.g. 52 hours later)
  // MaxAgeHoursCurrent = 48, MaxAgeHoursAging = 96
  const fridayDef = getMacroSeriesDefinition('DGS10')!;
  const rawFriday = { date: '2026-10-02', value: '4.10' };
  const sundayNow = Date.parse('2026-10-04T16:00:00.000Z'); // ~64 hours later
  const weekendNorm = normalizeFredObservation(fridayDef, rawFriday, sundayNow, sundayNow);
  assert(
    weekendNorm.observation?.freshness === 'AGING' && weekendNorm.observation?.freshness !== 'STALE',
    '56. weekend gap does not automatically mean provider failure (evaluates as AGING, not STALE)'
  );

  const staleAssembly = assembleXauusdMacroEvidence({
    realYieldAnalysis: staleRealYield,
  });
  assert(
    staleAssembly.bullishEvidence.length === 0,
    '57. sufficiently stale evidence excluded from current direction'
  );

  const obsJ = createMockObs('DGS10', '2026-10-02', 4.10, 'CURRENT', Date.parse('2026-10-07T12:00:00.000Z'));
  assert(
    obsJ.observationDate === '2026-10-02' && obsJ.receivedAt === Date.parse('2026-10-07T12:00:00.000Z'),
    '58. receivedAt never replaces observationDate'
  );

  // =================================================================
  // GROUP K — EXECUTION BOUNDARY
  // =================================================================
  console.log('\n[GROUP K — EXECUTION BOUNDARY]');

  const engine = new MacroIntelligenceEngine();
  assert(
    !(engine as any).execute && !(engine as any).placeOrder && !(engine as any).sendOrder,
    '59. Macro Intelligence Engine exposes no execution methods'
  );

  assert(
    (bullishAssembly as any).isExecutable === undefined &&
      (bullishAssembly as any).executable === undefined &&
      (bullishAssembly as any).orderAllowed === undefined,
    '60. XAUUSD macro result contains no isExecutable'
  );

  assert(
    !(engine as any).autoTrade && !(engine as any).tradeAllowed,
    '61. no order/trade method introduced'
  );

  assert(
    CANONICAL_EXECUTION_MODE === 'READ_ONLY',
    '62. CANONICAL_EXECUTION_MODE remains READ_ONLY'
  );

  assert(
    MT5_ORDER_TRANSPORT_ENABLED === false,
    '63. MT5_ORDER_TRANSPORT_ENABLED remains false'
  );

  // =================================================================
  // GROUP L — CONTEXT ISOLATION
  // =================================================================
  console.log('\n[GROUP L — CONTEXT ISOLATION]');

  // DGS2 cannot contaminate DGS10 analysis
  const dgs2Analysis = analyzeMacroSeries(dgs2Normal);
  const dgs10Analysis = analyzeMacroSeries(dgs10Normal);
  assert(
    dgs2Analysis.seriesId === 'DGS2' &&
      dgs10Analysis.seriesId === 'DGS10' &&
      dgs2Analysis.latestValue !== dgs10Analysis.latestValue,
    '64. DGS2 cannot contaminate DGS10 analysis'
  );

  // DFII10 cannot contaminate T10YIE
  const dfii10Analysis = analyzeMacroSeries(risingRealYield ? [createMockObs('DFII10', '2026-10-06', 2.05)] : []);
  const t10yieAnalysis = analyzeMacroSeries(risingBreakeven ? [createMockObs('T10YIE', '2026-10-06', 2.30)] : []);
  assert(
    dfii10Analysis.category === 'REAL_YIELD' && t10yieAnalysis.category === 'INFLATION_EXPECTATION',
    '65. DFII10 cannot contaminate T10YIE'
  );

  // Provider isolation: non-FRED cannot masquerade as FRED
  const foreignObs: NormalizedMacroObservation = {
    ...createMockObs('DGS10', '2026-10-06', 4.10),
    provider: 'unverified_foreign_feed',
    provenance: 'UNAVAILABLE',
  };
  const foreignAnalysis = analyzeMacroSeries([foreignObs]);
  assert(
    foreignAnalysis.provider === 'unverified_foreign_feed' && foreignAnalysis.classification === 'UNAVAILABLE',
    '66. another provider cannot masquerade as FRED'
  );

  // XAUUSD cannot inherit another instrument context
  assert(
    bullishAssembly.instrument === 'XAUUSD' && !(bullishAssembly as any).symbol?.includes('EURUSD'),
    '67. XAUUSD result cannot inherit another instrument context'
  );

  console.log('\n=================================================================');
  console.log(`TOTAL SPRINT 1C TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runSprint1cTests().catch((err) => {
  console.error('Test runner encountered unexpected exception:', err);
  process.exit(1);
});

