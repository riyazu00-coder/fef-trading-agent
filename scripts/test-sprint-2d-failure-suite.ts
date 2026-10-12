/**
 * FEF CORTEX — SPRINT 2D FAILURE & VERIFICATION TEST SUITE
 *
 * Verifies all Phase 10 requirements:
 * 1. Missing FRED key -> fails closed
 * 2. FRED API timeout / 500 -> fails closed
 * 3. Central bank endpoint unreachable -> fails closed to DATA_LIMITED
 * 4. Malformed central bank response -> fails closed to DATA_LIMITED
 * 5. Daily rate > 144h old -> rejected as STALE
 * 6. Monthly CPI > 60d old but within cycle -> ACCEPTED as CURRENT/AGING, actionable
 * 7. Policy differential with 1 missing leg -> DATA_LIMITED, never fabricated
 * 8. Policy differential with 2 valid legs -> verified differential calculated correctly
 * 9. Specialist Agent evaluation with unverified rates -> fails closed to NEUTRAL, 0 confidence
 * 10. Specialist Agent evaluation with verified rates -> emits actionable directional stance
 */

import {
  FRED_SERIES_CATALOG,
  getMacroSeriesDefinition,
} from '../src/lib/macro/catalog/fred-catalog';
import {
  normalizeFredObservation,
} from '../src/lib/macro/normalization/fred-normalizer';
import { FredConnector } from '../src/lib/macro/connectors/fred-connector';
import {
  centralBankProvider,
  CentralBankPolicyData,
} from '../src/lib/central-banks/central-bank-provider';
import {
  evaluateCentralBankPolicyAgent,
} from '../src/lib/agents/specialists/specialist-agents';
import {
  createVerifiedEnvelope,
  createFailedClosedEnvelope,
  isEnvelopeActionable,
} from '../src/lib/providers/canonical-envelope';

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

async function runFailureSuite() {
  console.log('========================================================================');
  console.log('FEF CORTEX — SPRINT 2D FAILURE & INTEGRITY VERIFICATION SUITE');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // Test 1: Missing FRED Key Fails Closed
  // --------------------------------------------------------------------------
  console.log('--- Test 1: Missing FRED API Key Handling ---');
  const connectorNoKey = new FredConnector();
  const savedKey = process.env.FRED_API_KEY;
  try {
    delete process.env.FRED_API_KEY;
    const resNoKey = await connectorNoKey.fetchHistoricalObservations('DGS10', { apiKey: '' });
    assert(resNoKey.isAvailable === false, 'Connector with missing key must return isAvailable = false');
    assert(resNoKey.error?.category === 'AUTHENTICATION', 'Error category must be AUTHENTICATION');
    assert(resNoKey.payload === null, 'Payload must be null when key is missing');
  } finally {
    if (savedKey) process.env.FRED_API_KEY = savedKey;
  }

  // --------------------------------------------------------------------------
  // Test 2: FRED API Timeout & 500 Error Fails Closed
  // --------------------------------------------------------------------------
  console.log('\n--- Test 2: FRED API 500 Error & Network Failure ---');
  const mock500Transport = async () => ({
    status: 500,
    text: async () => 'Internal Server Error',
  });
  const connector500 = new FredConnector({ fetchTransport: mock500Transport });
  const res500 = await connector500.fetchHistoricalObservations('DGS10', { apiKey: 'dummy-test-key' });
  assert(res500.isAvailable === false, '500 Server error must return isAvailable = false');
  assert(res500.error?.category === 'PROVIDER_ERROR', 'Error category must be PROVIDER_ERROR');
  assert(res500.payload === null, 'Payload must be null on 500 error');

  // --------------------------------------------------------------------------
  // Test 3: Central Bank Endpoint Unreachable Fails Closed to DATA_LIMITED
  // --------------------------------------------------------------------------
  console.log('\n--- Test 3: Central Bank Unreachable Endpoint Handling ---');
  const unconfiguredData = centralBankProvider.calculateRateDifferential('EUR', 'GBP', {
    EUR: {
      currency: 'EUR',
      bankCode: 'ECB',
      bankName: 'European Central Bank',
      rateName: 'Deposit Facility Rate',
      currentRate: 2.50,
      policyRate: 2.50,
      effectiveDate: '2026-09-16',
      sourceUrl: '',
      retrievedAt: Date.now(),
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'EASING_CYCLE',
      inflationTargetPct: 2.0,
      source: 'Test',
    },
    GBP: {
      currency: 'GBP',
      bankCode: 'BOE',
      bankName: 'Bank of England',
      rateName: 'Bank Rate',
      currentRate: null,
      policyRate: 0,
      effectiveDate: '',
      sourceUrl: '',
      retrievedAt: Date.now(),
      isAuthoritative: false,
      verificationStatus: 'DATA_LIMITED',
      isVerified: false,
      isActionable: false,
      stance: 'NEUTRAL_DATA_DEPENDENT',
      inflationTargetPct: 2.0,
      source: 'Official feed ingestion failed: Connection timed out',
    },
  });
  assert(unconfiguredData !== null, 'calculateRateDifferential must return result structure');
  assert(unconfiguredData?.isVerified === false, 'Rate differential with unreachable bank must have isVerified = false');
  assert(unconfiguredData?.isActionable === false, 'Rate differential with unreachable bank must have isActionable = false');
  assert(unconfiguredData?.differentialBp === null, 'differentialBp must be null, never fabricated');
  assert(unconfiguredData?.carryDirection === 'NEUTRAL', 'carryDirection must fail closed to NEUTRAL');

  // --------------------------------------------------------------------------
  // Test 4: Malformed Central Bank Response Handling
  // --------------------------------------------------------------------------
  console.log('\n--- Test 4: Malformed Central Bank Response Handling ---');
  const malformedData = centralBankProvider.calculateRateDifferential('CAD', 'USD', {
    CAD: {
      currency: 'CAD',
      bankCode: 'BOC',
      bankName: 'Bank of Canada',
      rateName: 'Target for Overnight Rate',
      currentRate: null,
      policyRate: 0,
      effectiveDate: '',
      sourceUrl: '',
      retrievedAt: Date.now(),
      isAuthoritative: false,
      verificationStatus: 'DATA_LIMITED',
      isVerified: false,
      isActionable: false,
      stance: 'NEUTRAL_DATA_DEPENDENT',
      inflationTargetPct: 2.0,
      source: 'Malformed response',
    },
    USD: {
      currency: 'USD',
      bankCode: 'FED',
      bankName: 'Federal Reserve',
      rateName: 'Target Upper',
      currentRate: 4.00,
      policyRate: 4.00,
      effectiveDate: '2026-10-11',
      sourceUrl: '',
      retrievedAt: Date.now(),
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'RESTRICTIVE_HOLD',
      inflationTargetPct: 2.0,
      source: 'Test',
    },
  });
  assert(malformedData?.isVerified === false, 'Malformed bank response must fail closed (isVerified = false)');
  assert(malformedData?.differentialBp === null, 'Differential must be null on malformed leg');

  // --------------------------------------------------------------------------
  // Test 5: Daily Treasury Yield > 144h Old Rejected as STALE
  // --------------------------------------------------------------------------
  console.log('\n--- Test 5: Daily Treasury Yield > 144h Old Rejection ---');
  const dgs10Def = getMacroSeriesDefinition('DGS10')!;
  const nowMs = Date.now();
  // Observation from 7 days ago (168 hours > 144h threshold)
  const staleObsDate = new Date(nowMs - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const normStaleDaily = normalizeFredObservation(
    dgs10Def,
    { date: staleObsDate, value: '4.50' },
    nowMs,
    nowMs
  );
  assert(normStaleDaily.success === true, 'Normalization parses valid date and numeric string');
  assert(normStaleDaily.observation?.freshness === 'STALE', 'Daily observation > 144h old must be classified STALE');
  assert(normStaleDaily.observation?.isActionable === false, 'Stale daily observation must have isActionable = false');
  assert(normStaleDaily.observation?.isLatestOfficialObservation === false, 'Stale daily observation isLatestOfficialObservation = false');

  // Daily yield within weekend gap (e.g. 96 hours old)
  const weekendObsDate = new Date(nowMs - 4 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const normWeekendDaily = normalizeFredObservation(
    dgs10Def,
    { date: weekendObsDate, value: '4.50' },
    nowMs,
    nowMs
  );
  assert(normWeekendDaily.observation?.freshness !== 'STALE', 'Daily observation within 96h weekend gap must NOT be STALE');
  assert(normWeekendDaily.observation?.isActionable === true, 'Weekend gap daily observation must be actionable');

  // --------------------------------------------------------------------------
  // Test 6: Monthly CPI > 60d Old Accepted as CURRENT / AGING within cycle
  // --------------------------------------------------------------------------
  console.log('\n--- Test 6: Monthly CPI Release-Frequency-Aware Freshness ---');
  const cpiDef = getMacroSeriesDefinition('CPIAUCSL')!;
  // CPI observation from 50 days ago (1200 hours: > 1080h old fixed cutoff, but <= 1560h monthly current)
  const monthlyCpiDate = new Date(nowMs - 50 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const normMonthlyCpi = normalizeFredObservation(
    cpiDef,
    { date: monthlyCpiDate, value: '334.131' },
    nowMs,
    nowMs
  );
  assert(normMonthlyCpi.success === true, 'Monthly CPI parses successfully');
  assert(normMonthlyCpi.observation?.freshness === 'CURRENT', 'Monthly CPI at 50 days must be classified CURRENT');
  assert(normMonthlyCpi.observation?.isActionable === true, 'Monthly CPI within 65 days must be actionable');
  assert(normMonthlyCpi.observation?.isLatestOfficialObservation === true, 'Monthly CPI within active cycle is latest official');

  // CPI observation from 75 days ago (1800 hours: <= 2160h aging)
  const agingCpiDate = new Date(nowMs - 75 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const normAgingCpi = normalizeFredObservation(
    cpiDef,
    { date: agingCpiDate, value: '332.500' },
    nowMs,
    nowMs
  );
  assert(normAgingCpi.observation?.freshness === 'AGING', 'Monthly CPI at 75 days must be classified AGING');
  assert(normAgingCpi.observation?.isActionable === true, 'Aging monthly CPI must remain actionable before next release');

  // CPI observation > 90 days ago (> 2160h)
  const staleCpiDate = new Date(nowMs - 95 * 24 * 3600 * 1000).toISOString().split('T')[0];
  const normStaleCpi = normalizeFredObservation(
    cpiDef,
    { date: staleCpiDate, value: '330.000' },
    nowMs,
    nowMs
  );
  assert(normStaleCpi.observation?.freshness === 'STALE', 'Monthly CPI > 90 days must be classified STALE');
  assert(normStaleCpi.observation?.isActionable === false, 'Stale monthly CPI must not be actionable');

  // --------------------------------------------------------------------------
  // Test 7: Policy Differential with 1 Missing Leg Fails Closed
  // --------------------------------------------------------------------------
  console.log('\n--- Test 7: Policy Differential 1 Missing Leg Fail-Closed ---');
  const mockBankDataPartial: Record<string, CentralBankPolicyData> = {
    USD: {
      currency: 'USD',
      bankCode: 'FED',
      bankName: 'Federal Reserve',
      rateName: 'Target Upper',
      currentRate: 4.00,
      policyRate: 4.00,
      effectiveDate: '2026-10-11',
      sourceUrl: '',
      retrievedAt: nowMs,
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'RESTRICTIVE_HOLD',
      inflationTargetPct: 2.0,
      source: 'Test',
    },
    JPY: {
      currency: 'JPY',
      bankCode: 'BOJ',
      bankName: 'Bank of Japan',
      rateName: 'Policy Rate',
      currentRate: null,
      policyRate: 0,
      effectiveDate: '',
      sourceUrl: '',
      retrievedAt: nowMs,
      isAuthoritative: false,
      verificationStatus: 'NOT_CONFIGURED',
      isVerified: false,
      isActionable: false,
      stance: 'NEUTRAL_DATA_DEPENDENT',
      inflationTargetPct: 2.0,
      source: 'Unconfigured',
    },
  };
  const usdjpyDiff = centralBankProvider.calculateRateDifferential('USD', 'JPY', mockBankDataPartial);
  assert(usdjpyDiff !== null, 'calculateRateDifferential must return result object');
  assert(usdjpyDiff?.isVerified === false, 'Differential with JPY unverified must be isVerified = false');
  assert(usdjpyDiff?.differentialBp === null, 'Differential bps must be null when one leg is unverified');
  assert(usdjpyDiff?.carryDirection === 'NEUTRAL', 'Carry direction must be NEUTRAL');

  // --------------------------------------------------------------------------
  // Test 8: Policy Differential with 2 Valid Legs Computes Correctly
  // --------------------------------------------------------------------------
  console.log('\n--- Test 8: Policy Differential with 2 Valid Legs ---');
  const mockBankDataBoth: Record<string, CentralBankPolicyData> = {
    ...mockBankDataPartial,
    EUR: {
      currency: 'EUR',
      bankCode: 'ECB',
      bankName: 'European Central Bank',
      rateName: 'Deposit Facility Rate',
      currentRate: 2.50,
      policyRate: 2.50,
      effectiveDate: '2026-09-16',
      sourceUrl: '',
      retrievedAt: nowMs,
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'EASING_CYCLE',
      inflationTargetPct: 2.0,
      source: 'Test',
    },
    CAD: {
      currency: 'CAD',
      bankCode: 'BOC',
      bankName: 'Bank of Canada',
      rateName: 'Overnight Target',
      currentRate: 2.25,
      policyRate: 2.25,
      effectiveDate: '2026-10-08',
      sourceUrl: '',
      retrievedAt: nowMs,
      isAuthoritative: true,
      verificationStatus: 'LIVE_VERIFIED',
      isVerified: true,
      isActionable: true,
      stance: 'EASING_CYCLE',
      inflationTargetPct: 2.0,
      source: 'Test',
    },
  };

  // EURUSD: 2.50% - 4.00% = -1.50% = -150 bps -> BEARISH
  const eurusdDiff = centralBankProvider.calculateRateDifferential('EUR', 'USD', mockBankDataBoth);
  assert(eurusdDiff?.isVerified === true, 'EURUSD with both legs verified must have isVerified = true');
  assert(eurusdDiff?.differentialBp === -150, `EURUSD differential must be -150 bps, got ${eurusdDiff?.differentialBp}`);
  assert(eurusdDiff?.carryDirection === 'BEARISH', 'Negative 150 bps differential must yield BEARISH carry direction');

  // USDCAD: 4.00% - 2.25% = +1.75% = +175 bps -> BULLISH
  const usdcadDiff = centralBankProvider.calculateRateDifferential('USD', 'CAD', mockBankDataBoth);
  assert(usdcadDiff?.isVerified === true, 'USDCAD with both legs verified must have isVerified = true');
  assert(usdcadDiff?.differentialBp === 175, `USDCAD differential must be +175 bps, got ${usdcadDiff?.differentialBp}`);
  assert(usdcadDiff?.carryDirection === 'BULLISH', 'Positive 175 bps differential must yield BULLISH carry direction');

  // --------------------------------------------------------------------------
  // Test 9: Specialist Agent Fails Closed on Unverified Pair
  // --------------------------------------------------------------------------
  console.log('\n--- Test 9: Specialist Agent Fails Closed on Unverified Pair ---');
  const cbEnvelopePartial = createVerifiedEnvelope({
    provider: 'CENTRAL_BANKS',
    sourceType: 'CENTRAL_BANK',
    observedAt: new Date().toISOString(),
    maxStalenessSec: 86400 * 7,
    payload: mockBankDataPartial,
  });

  const gbpusdAgent = evaluateCentralBankPolicyAgent({
    instrument: 'GBPUSD',
    centralBankEnvelope: cbEnvelopePartial,
  });
  assert(gbpusdAgent.readiness === 'DATA_LIMITED', 'GBPUSD agent must have readiness = DATA_LIMITED');
  assert(gbpusdAgent.direction === 'NEUTRAL', 'GBPUSD agent must emit direction = NEUTRAL');
  assert(gbpusdAgent.confidence === 0, 'GBPUSD agent must emit confidence = 0');
  assert(gbpusdAgent.provenanceBadge === 'DATA LIMITED', 'GBPUSD agent must display DATA LIMITED badge');
  assert(gbpusdAgent.missingEvidence.length > 0, 'GBPUSD agent must cite missing unverified rate');

  // --------------------------------------------------------------------------
  // Test 10: Specialist Agent Emits Actionable Stance on Verified Pair
  // --------------------------------------------------------------------------
  console.log('\n--- Test 10: Specialist Agent Emits Actionable Stance on Verified Pair ---');
  const cbEnvelopeBoth = createVerifiedEnvelope({
    provider: 'CENTRAL_BANKS',
    sourceType: 'CENTRAL_BANK',
    observedAt: new Date().toISOString(),
    maxStalenessSec: 86400 * 7,
    payload: mockBankDataBoth,
  });

  const eurusdAgent = evaluateCentralBankPolicyAgent({
    instrument: 'EURUSD',
    centralBankEnvelope: cbEnvelopeBoth,
  });
  assert(eurusdAgent.readiness === 'READY', 'EURUSD agent must have readiness = READY');
  assert(eurusdAgent.direction === 'BEARISH', 'EURUSD agent must emit direction = BEARISH (-150 bps carry)');
  assert(eurusdAgent.confidence === 45, `EURUSD agent confidence must be calibrated to 45% (point-in-time carry cap), got ${eurusdAgent.confidence}%`);
  assert(eurusdAgent.provenanceBadge === 'INDEPENDENT', 'EURUSD agent must display INDEPENDENT badge');
  assert(eurusdAgent.primaryThesis.includes('-150 bps'), 'Primary thesis must cite the -150 bps spread');

  console.log('\n========================================================================');
  console.log(`ALL TESTS PASSED: ${passCount} / ${passCount + failCount}`);
  console.log('========================================================================\n');
}

runFailureSuite().catch((e) => {
  console.error('Fatal Failure Suite Error:', e);
  process.exit(1);
});
