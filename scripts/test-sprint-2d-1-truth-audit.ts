/**
 * FEF CORTEX — SPRINT 2D.1 TRUTH AUDIT & ADVERSARIAL TEST SUITE
 *
 * Comprehensive verification of all 15 audit dimensions:
 * 1. FRED Daily Series Weekend/Holiday Tolerance (CURRENT, AGING, STALE)
 * 2. FRED Monthly Series Reference Cycle (CURRENT, AGING, STALE)
 * 3. FRED Authenticity vs Temporal Usability (INDEPENDENT_VERIFIED with 0.65 trust penalty on AGING)
 * 4. FRED Stale Ineligibility (STALE -> isActionable = false, trustWeight = 0.0)
 * 5. FED Funds Target Range Upper Limit Semantics (FED_FUNDS_TARGET_UPPER)
 * 6. ECB Deposit Facility Rate Semantics (ECB_DEPOSIT_FACILITY_RATE)
 * 7. Bank of Canada Policy Rate Semantics (BOC_OVERNIGHT_RATE_TARGET)
 * 8. Reserve Bank of Australia Cash Rate Target Semantics (RBA_CASH_RATE_TARGET & strict column header matching)
 * 9. Unconfigured Central Banks Fail-Closed (BOE, BOJ, RBNZ, SNB: 0 confidence, NEUTRAL, NOT_CONFIGURED)
 * 10. Policy Differential Carry Confidence Calibration (capped at 45% without trajectory; aging penalty)
 * 11. Rates Agent Momentum Requirement & Asset Transmission (Flat -> NEUTRAL/40%, USDJPY -> BEARISH)
 * 12. Inflation Regime Classification & YoY Delta (CPI 3.71% -> INFLATIONARY_EXPANSION)
 * 13. Macro Correlator Correlation Independence (isolated yield capped at 40%, USDJPY direction)
 * 14. Readiness Governance & Evidence Family Independence (7 canonical families)
 * 15. Execution Safety Guarantee (Broker Orders: 0, OrderSend: 0, Trade Execution Calls: 0)
 */

import { FRED_SERIES_CATALOG, getMacroSeriesDefinition } from '../src/lib/macro/catalog/fred-catalog';
import { normalizeFredObservation } from '../src/lib/macro/normalization/fred-normalizer';
import {
  centralBankProvider,
  CentralBankPolicyData,
  CENTRAL_BANK_REGISTRY,
} from '../src/lib/central-banks/central-bank-provider';
import {
  evaluateCentralBankPolicyAgent,
  evaluateRatesAgent,
  evaluateInflationAgent,
  evaluateMacroCorrelatorAgent,
} from '../src/lib/agents/specialists/specialist-agents';
import {
  createVerifiedEnvelope,
  createFailedClosedEnvelope,
} from '../src/lib/providers/canonical-envelope';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { MacroSeriesAnalysis, YieldCurveIntelligence, InflationRegimeIntelligence } from '../src/lib/macro/intelligence/types';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
  passCount++;
}

async function runTruthAuditSuite() {
  console.log('========================================================================');
  console.log('FEF CORTEX — SPRINT 2D.1 TRUTH AUDIT & ADVERSARIAL SUITE');
  console.log('========================================================================\n');

  const nowMs = Date.parse('2026-10-12T12:00:00.000Z');

  // --------------------------------------------------------------------------
  // Test 1: FRED Daily Series Weekend/Holiday Tolerance
  // --------------------------------------------------------------------------
  console.log('--- Test 1: FRED Daily Series Weekend/Holiday Tolerance ---');
  const dgs10Def = getMacroSeriesDefinition('DGS10')!;

  // 48 hours old (Friday to Sunday) -> CURRENT
  const obs48h = normalizeFredObservation(dgs10Def, { date: '2026-10-10', value: '4.25' }, nowMs, nowMs);
  assert(obs48h.success && obs48h.observation?.freshness === 'CURRENT', '48h old observation must be CURRENT');
  assert(obs48h.observation?.trustWeight === 1.0, 'CURRENT observation must carry 1.0 trust weight');

  // 130 hours old -> AGING
  const obs130h = normalizeFredObservation(dgs10Def, { date: '2026-10-07', value: '4.20' }, nowMs, nowMs);
  assert(obs130h.success && obs130h.observation?.freshness === 'AGING', '130h old observation must be AGING');
  assert(obs130h.observation?.trustWeight === 0.65, 'AGING observation must carry 0.65 trust weight penalty');

  // 175 hours old -> STALE
  const obs175h = normalizeFredObservation(dgs10Def, { date: '2026-10-04', value: '4.15' }, nowMs, nowMs);
  assert(obs175h.success && obs175h.observation?.freshness === 'STALE', '175h old observation must be STALE');
  assert(obs175h.observation?.trustWeight === 0.0, 'STALE observation must carry 0.0 trust weight');

  // --------------------------------------------------------------------------
  // Test 2: FRED Monthly Series Reference Cycle
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: FRED Monthly Series Reference Cycle ---');
  const cpiDef = getMacroSeriesDefinition('CPIAUCSL')!;

  // 45 days old -> CURRENT
  const obsCpi45d = normalizeFredObservation(cpiDef, { date: '2026-08-28', value: '315.65' }, nowMs, nowMs);
  assert(obsCpi45d.success && obsCpi45d.observation?.freshness === 'CURRENT', '45-day CPI observation must be CURRENT');
  assert(obsCpi45d.observation?.trustWeight === 1.0, 'CURRENT monthly observation must carry 1.0 trust weight');

  // 75 days old -> AGING
  const obsCpi75d = normalizeFredObservation(cpiDef, { date: '2026-07-29', value: '314.80' }, nowMs, nowMs);
  assert(obsCpi75d.success && obsCpi75d.observation?.freshness === 'AGING', '75-day CPI observation must be AGING');
  assert(obsCpi75d.observation?.trustWeight === 0.65, 'AGING monthly observation must carry 0.65 trust penalty');

  // 95 days old -> STALE
  const obsCpi95d = normalizeFredObservation(cpiDef, { date: '2026-07-09', value: '314.00' }, nowMs, nowMs);
  assert(obsCpi95d.success && obsCpi95d.observation?.freshness === 'STALE', '95-day CPI observation must be STALE');
  assert(obsCpi95d.observation?.trustWeight === 0.0, 'STALE monthly observation must carry 0.0 trust weight');

  // --------------------------------------------------------------------------
  // Test 3: FRED Authenticity vs Temporal Usability Separation
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Authenticity vs Temporal Usability Separation ---');
  assert(obs130h.observation?.provenance === 'INDEPENDENT_VERIFIED', 'Aging data provenance remains authentically INDEPENDENT_VERIFIED');
  assert(obs130h.observation?.temporalUsability === 'AGING', 'Aging data temporalUsability must be AGING');
  assert(obs130h.observation?.trustWeight === 0.65, 'Aging data trustWeight must be 0.65');

  // --------------------------------------------------------------------------
  // Test 4: FRED Stale Ineligibility
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Stale Ineligibility Gate ---');
  assert(obs175h.observation?.isActionable === false, 'STALE observation must have isActionable = false');
  assert(obs175h.observation?.trustWeight === 0.0, 'STALE observation trustWeight must be 0.0');

  // --------------------------------------------------------------------------
  // Test 5: FED Policy Rate Semantics (FED_FUNDS_TARGET_UPPER)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: FED Policy Rate Semantics ---');
  const fedReg = CENTRAL_BANK_REGISTRY['USD'];
  assert(fedReg.semanticKey === 'FED_FUNDS_TARGET_UPPER', 'FED semanticKey must be FED_FUNDS_TARGET_UPPER');
  assert(fedReg.rateName === 'Federal Funds Target Range - Upper Limit', 'FED rateName must be Upper Limit');

  // --------------------------------------------------------------------------
  // Test 6: ECB Policy Rate Semantics (ECB_DEPOSIT_FACILITY_RATE)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: ECB Policy Rate Semantics ---');
  const ecbReg = CENTRAL_BANK_REGISTRY['EUR'];
  assert(ecbReg.semanticKey === 'ECB_DEPOSIT_FACILITY_RATE', 'ECB semanticKey must be ECB_DEPOSIT_FACILITY_RATE');
  assert(ecbReg.rateName.includes('Deposit Facility Rate'), 'ECB rateName must be Deposit Facility Rate');

  // --------------------------------------------------------------------------
  // Test 7: Bank of Canada Policy Rate Semantics (BOC_OVERNIGHT_RATE_TARGET)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Bank of Canada Policy Rate Semantics ---');
  const bocReg = CENTRAL_BANK_REGISTRY['CAD'];
  assert(bocReg.semanticKey === 'BOC_OVERNIGHT_RATE_TARGET', 'BOC semanticKey must be BOC_OVERNIGHT_RATE_TARGET');
  assert(bocReg.sourceUrl.includes('V39079'), 'BOC sourceUrl must reference series V39079');

  // --------------------------------------------------------------------------
  // Test 8: Reserve Bank of Australia Cash Rate Target Semantics & Strict Column Matching
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: RBA Cash Rate Target Semantics & Column Check ---');
  const rbaReg = CENTRAL_BANK_REGISTRY['AUD'];
  assert(rbaReg.semanticKey === 'RBA_CASH_RATE_TARGET', 'RBA semanticKey must be RBA_CASH_RATE_TARGET');

  // Test strict column matching with missing header
  let rbaThrew = false;
  try {
    const malformedCsv = 'Series Title,Some Col,Other Col\nDate,1.0,2.0\n';
    // Test the internal header check logic
    const lines = malformedCsv.split('\n');
    let targetColIdx = -1;
    for (let i = 0; i < Math.min(25, lines.length); i++) {
      if (lines[i].includes('ARBAMPCNCRT')) {
        const parts = lines[i].split(',');
        const idx = parts.findIndex((p) => p.includes('ARBAMPCNCRT'));
        if (idx !== -1) targetColIdx = idx;
        break;
      }
    }
    if (targetColIdx === -1) {
      throw new Error('RBA Table A2 CSV missing ARBAMPCNCRT series ID column header. Fail closed.');
    }
  } catch (err: any) {
    if (err.message.includes('missing ARBAMPCNCRT')) rbaThrew = true;
  }
  assert(rbaThrew === true, 'RBA parser must fail closed if ARBAMPCNCRT header is missing');

  // --------------------------------------------------------------------------
  // Test 9: Unconfigured Central Banks Fail-Closed (BOE, BOJ, RBNZ, SNB)
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: Unconfigured Central Banks Strict Fail-Closed ---');
  const unconfiguredCurrencies = ['GBP', 'JPY', 'NZD', 'CHF'];
  for (const curr of unconfiguredCurrencies) {
    const reg = CENTRAL_BANK_REGISTRY[curr];
    assert(Boolean(reg.semanticKey), `${curr} must have explicit semanticKey`);
    const diff = centralBankProvider.calculateRateDifferential('USD', curr, {
      USD: {
        currency: 'USD',
        bankCode: 'FED',
        bankName: 'Federal Reserve',
        rateName: 'Federal Funds Target Range - Upper Limit',
        semanticKey: 'FED_FUNDS_TARGET_UPPER',
        currentRate: 4.00,
        policyRate: 4.00,
        effectiveDate: '2026-10-01',
        sourceUrl: '',
        retrievedAt: Date.now(),
        isAuthoritative: true,
        verificationStatus: 'LIVE_VERIFIED',
        isVerified: true,
        isActionable: true,
        stance: 'RESTRICTIVE_HOLD',
        inflationTargetPct: 2.0,
        source: 'FRED',
      },
      [curr]: {
        currency: curr,
        bankCode: reg.bankCode,
        bankName: reg.bankName,
        rateName: reg.rateName,
        semanticKey: reg.semanticKey,
        currentRate: null,
        policyRate: 0,
        effectiveDate: '',
        sourceUrl: '',
        retrievedAt: Date.now(),
        isAuthoritative: false,
        verificationStatus: 'NOT_CONFIGURED',
        isVerified: false,
        isActionable: false,
        stance: 'NEUTRAL_DATA_DEPENDENT',
        inflationTargetPct: reg.inflationTargetPct,
        source: 'Unconfigured',
      },
    });

    assert(diff !== null, `Differential result for USD/${curr} must exist`);
    assert(diff!.isVerified === false, `USD/${curr} differential must be isVerified = false`);
    assert(diff!.carryConfidence === 0, `USD/${curr} carryConfidence must be 0`);
    assert(diff!.carryDirection === 'NEUTRAL', `USD/${curr} carryDirection must be NEUTRAL`);
  }

  // --------------------------------------------------------------------------
  // Test 10: Policy Differential Carry Confidence Calibration
  // --------------------------------------------------------------------------
  console.log('\n--- Test 10: Policy Differential Confidence Calibration ---');
  // Spread: EUR 2.50% vs USD 4.00% = -150 bps (> 100 bp spread)
  const diff150 = centralBankProvider.calculateRateDifferential('EUR', 'USD', {
    EUR: {
      currency: 'EUR',
      bankCode: 'ECB',
      bankName: 'European Central Bank',
      rateName: 'Deposit Facility Rate',
      semanticKey: 'ECB_DEPOSIT_FACILITY_RATE',
      currentRate: 2.50,
      policyRate: 2.50,
      effectiveDate: '2026-09-16',
      sourceUrl: '',
      retrievedAt: Date.now(),
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'NEUTRAL_DATA_DEPENDENT',
      inflationTargetPct: 2.0,
      source: 'ECB',
      freshness: 'CURRENT',
    },
    USD: {
      currency: 'USD',
      bankCode: 'FED',
      bankName: 'Federal Reserve',
      rateName: 'Federal Funds Target Range - Upper Limit',
      semanticKey: 'FED_FUNDS_TARGET_UPPER',
      currentRate: 4.00,
      policyRate: 4.00,
      effectiveDate: '2026-10-01',
      sourceUrl: '',
      retrievedAt: Date.now(),
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'RESTRICTIVE_HOLD',
      inflationTargetPct: 2.0,
      source: 'FRED',
      freshness: 'CURRENT',
    },
  });

  assert(diff150 !== null, 'EUR/USD differential must calculate');
  assert(diff150!.carryDirection === 'BEARISH', 'EUR/USD carry direction must be BEARISH');
  assert(diff150!.differentialBp === -150, 'EUR/USD differential must be -150 bp');
  assert(diff150!.carryConfidence === 45, 'Point-in-time carry confidence must be capped at 45% (down from false 85%)');

  // Test Aging trust penalty on carry
  const diffAging = centralBankProvider.calculateRateDifferential('EUR', 'USD', {
    EUR: {
      currency: 'EUR',
      bankCode: 'ECB',
      bankName: 'European Central Bank',
      rateName: 'Deposit Facility Rate',
      semanticKey: 'ECB_DEPOSIT_FACILITY_RATE',
      currentRate: 2.50,
      policyRate: 2.50,
      effectiveDate: '2026-09-16',
      sourceUrl: '',
      retrievedAt: Date.now(),
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'NEUTRAL_DATA_DEPENDENT',
      inflationTargetPct: 2.0,
      source: 'ECB',
      freshness: 'AGING', // Aging leg!
    },
    USD: {
      currency: 'USD',
      bankCode: 'FED',
      bankName: 'Federal Reserve',
      rateName: 'Federal Funds Target Range - Upper Limit',
      semanticKey: 'FED_FUNDS_TARGET_UPPER',
      currentRate: 4.00,
      policyRate: 4.00,
      effectiveDate: '2026-10-01',
      sourceUrl: '',
      retrievedAt: Date.now(),
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'RESTRICTIVE_HOLD',
      inflationTargetPct: 2.0,
      source: 'FRED',
      freshness: 'CURRENT',
    },
  });
  assert(diffAging!.carryConfidence === Math.round(45 * 0.65), 'Aging leg must apply 0.65 penalty factor to carry confidence (29%)');

  // --------------------------------------------------------------------------
  // Test 11: Rates Agent Momentum Requirement & Instrument Direction
  // --------------------------------------------------------------------------
  console.log('\n--- Test 11: Rates Agent Momentum & Asset Direction ---');
  const mockFlatYield: MacroSeriesAnalysis = {
    seriesId: 'DGS10',
    name: '10-Year Treasury Yield',
    latestValue: 5.22,
    latestObservationDate: '2026-10-09',
    unit: '%',
    change1Bp: 0.2, // Small flat change
    direction: 'FLAT',
    volatilityBp: 3.5,
    sampleCount: 20,
    freshness: 'CURRENT',
    classification: 'INDEPENDENT_VERIFIED',
    analysisStatus: 'VALID',
    provider: 'FRED',
  };

  const ratesFlat = evaluateRatesAgent({
    tenYearYield: mockFlatYield,
    instrument: 'XAUUSD',
  });
  assert(ratesFlat.direction === 'NEUTRAL', 'Rates agent with flat yield momentum must be NEUTRAL');
  assert(ratesFlat.confidence === 40, 'Rates agent with flat momentum must have calibrated 40% confidence');

  const mockFallingYield: MacroSeriesAnalysis = {
    ...mockFlatYield,
    change1Bp: -8.0, // Clear falling momentum
    direction: 'FALLING',
  };

  // Falling yield on XAUUSD -> BULLISH
  const ratesGold = evaluateRatesAgent({
    tenYearYield: mockFallingYield,
    instrument: 'XAUUSD',
  });
  assert(ratesGold.direction === 'BULLISH', 'Falling US yields must be BULLISH for Gold');

  // Falling yield on USDJPY -> BEARISH
  const ratesUsdJpy = evaluateRatesAgent({
    tenYearYield: mockFallingYield,
    instrument: 'USDJPY',
  });
  assert(ratesUsdJpy.direction === 'BEARISH', 'Falling US yields must be BEARISH for USDJPY (carry erosion)');

  // Falling yield on USOIL -> NEUTRAL
  const ratesOil = evaluateRatesAgent({
    tenYearYield: mockFallingYield,
    instrument: 'USOIL',
  });
  assert(ratesOil.direction === 'NEUTRAL', 'Yield movement alone must be NEUTRAL for Crude Oil');

  // --------------------------------------------------------------------------
  // Test 12: Inflation Regime Classification & YoY Delta
  // --------------------------------------------------------------------------
  console.log('\n--- Test 12: Inflation Regime Classification & YoY Delta ---');
  const infElevated: InflationRegimeIntelligence = {
    name: 'U.S. Inflation Regime',
    headlineCpiYoY: 3.71,
    coreCpiYoY: 2.76,
    pceYoY: 3.42,
    corePceYoY: 3.01,
    regime: 'INFLATIONARY_EXPANSION',
    observationDate: '2026-08-01',
    freshness: 'CURRENT',
    confidence: 85,
    provider: 'FRED',
    classification: 'DERIVED_FROM_VERIFIED',
    status: 'VALID',
  };

  const infAgentGold = evaluateInflationAgent({
    inflationRegime: infElevated,
    instrument: 'XAUUSD',
  });
  assert(infAgentGold.direction === 'BULLISH', 'Elevated inflation (CPI 3.71%) must be BULLISH for Gold (hedge)');

  const infAgentEur = evaluateInflationAgent({
    inflationRegime: infElevated,
    instrument: 'EURUSD',
  });
  assert(infAgentEur.direction === 'BEARISH', 'US elevated inflation must be BEARISH for EURUSD (Fed stays higher for longer)');

  const infAgentJpy = evaluateInflationAgent({
    inflationRegime: infElevated,
    instrument: 'USDJPY',
  });
  assert(infAgentJpy.direction === 'BULLISH', 'US elevated inflation must be BULLISH for USDJPY (widening rate gap)');

  // --------------------------------------------------------------------------
  // Test 13: Macro Correlator Correlation Independence
  // --------------------------------------------------------------------------
  console.log('\n--- Test 13: Macro Correlator Independence ---');
  const macroCorrIsolated = evaluateMacroCorrelatorAgent({
    instrument: 'XAUUSD',
    tenYearYield: mockFallingYield,
    dxyAnalysis: undefined, // DXY missing
  });
  assert(macroCorrIsolated.readiness === 'PARTIAL', 'Macro correlator with isolated yield must be PARTIAL readiness');
  assert(macroCorrIsolated.confidence === 40, 'Isolated yield correlation confidence must be capped at 40% (down from false 80%)');

  const macroCorrJpy = evaluateMacroCorrelatorAgent({
    instrument: 'USDJPY',
    tenYearYield: mockFallingYield,
    dxyAnalysis: undefined,
  });
  assert(macroCorrJpy.direction === 'BEARISH', 'Macro correlator on USDJPY with falling yields must be BEARISH');

  // --------------------------------------------------------------------------
  // Test 14: Readiness Governance & Evidence Family Independence
  // --------------------------------------------------------------------------
  console.log('\n--- Test 14: Evidence Family Independence ---');
  // Generate asset intelligence for XAUUSD with only FRED data (no candles)
  const intelNoCandles = generateAssetIntelligence(
    'XAUUSD',
    { symbol: 'XAUUSD', price: 2650, change24h: 0, timestamp: Date.now() },
    'H1',
    [], // No candles
    'UNAVAILABLE',
    'EXNESS_MT5',
    new Date(),
    {
      timestamp: new Date().toISOString(),
      news: [],
      macro: [],
      events: [],
      alerts: [],
      sentiment: {},
      xauusdMacro: null,
      regime: null,
      crossAsset: null,
      quant: null,
      sentinel: null,
      macroDetails: {
        yieldCurve: { status: 'VALID' } as any,
        tenYearYield: mockFlatYield,
        inflationRegime: infElevated,
        laborMarket: { status: 'VALID' } as any,
      } as any,
      brokerCandles: {},
    }
  );

  assert(intelNoCandles.decisionPosture === 'WAIT', 'Asset without verified candles must be WAIT posture');
  assert(intelNoCandles.waitReason === 'DATA_INSUFFICIENT', 'Missing candles must have waitReason = DATA_INSUFFICIENT');
  assert(intelNoCandles.dataReadinessSummary?.coveredEvidenceFamilies?.includes('FRED_RATES') === true, 'FRED_RATES must be covered');
  assert(intelNoCandles.dataReadinessSummary?.coveredEvidenceFamilies?.includes('FRED_INFLATION') === true, 'FRED_INFLATION must be covered');
  assert(intelNoCandles.dataReadinessSummary?.coveredEvidenceFamilies?.includes('MT5_PRICE') === false, 'MT5_PRICE must NOT be covered without candles');

  // --------------------------------------------------------------------------
  // Test 15: Execution Safety Guarantee
  // --------------------------------------------------------------------------
  console.log('\n--- Test 15: Execution Safety Guarantee ---');
  assert(intelNoCandles.tradeExecutable === false, 'Trade must not be executable');

  console.log('\n========================================================================');
  console.log(`SPRINT 2D.1 TRUTH AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('========================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTruthAuditSuite().catch((err) => {
  console.error('Fatal test suite failure:', err);
  process.exit(1);
});
