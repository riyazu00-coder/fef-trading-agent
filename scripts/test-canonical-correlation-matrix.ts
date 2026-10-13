/**
 * FEF TRADING SOLUTIONS — CANONICAL CORRELATION AGENT VERIFICATION SUITE
 *
 * Verifies that the canonical CORRELATION council agent accurately consumes
 * the existing verified cross-asset matrix (feeds.crossAsset) without:
 * - Creating a secondary correlation engine
 * - Fabricating correlation numbers
 * - Using static expected baselines as live evidence
 * - Altering fail-closed invariants
 *
 * Tests:
 * A. No crossAsset matrix -> canonical CORRELATION remains DATA LIMITED.
 * B. Empty matrix / zero active pairs -> DATA LIMITED.
 * C. Partial/insufficient matrix (<2 verified pairs) -> DATA LIMITED.
 * D. Sufficient verified matrix (>=2 verified pairs with n>=5) -> ONLINE.
 * E. ONLINE evidence contains actual runtime correlation/sample information.
 * F. Static expected correlation baseline alone can never make agent ONLINE.
 * G. No fabricated correlation values.
 * H. Canonical correlation and CrossAsset specialist use compatible readiness semantics.
 * I. Existing fail-closed behavior remains intact.
 * J. No execution/trade behavior changed.
 */

import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { evaluateCrossAssetAgent } from '../src/lib/agents/specialists/specialist-agents';
import { CrossAssetMatrix } from '../src/lib/cross-asset/cross-asset-engine';
import { LiveIntelligenceFeeds } from '../src/lib/intelligence/feed-types';
import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASSED: ${message}`);
    passCount++;
  } else {
    console.error(`❌ FAILED: ${message}`);
    failCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

const mockLiveAsset = {
  symbol: 'XAUUSD',
  price: 2650.00,
  bid: 2649.80,
  ask: 2650.20,
  spread: 40,
  change24h: 0.5,
  lastUpdated: new Date().toISOString(),
};

function makeMockFeeds(crossAsset: CrossAssetMatrix | null | undefined): LiveIntelligenceFeeds {
  return {
    timestamp: new Date().toISOString(),
    news: [],
    macro: [],
    events: [],
    alerts: [],
    sentiment: {},
    crossAsset,
  };
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('FEF CORTEX — CANONICAL CORRELATION AGENT VERIFICATION SUITE');
  console.log('========================================================================\n');

  // --- Test A: No crossAsset matrix -> canonical CORRELATION remains DATA LIMITED ---
  console.log('--- Test A: No crossAsset Matrix ---');
  {
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', [], [], undefined, undefined, makeMockFeeds(undefined));
    const corr = profile.agents.find(a => a.type === 'CORRELATION');
    assert(!!corr, 'Correlation agent must exist');
    assert(corr!.status === 'DATA LIMITED', 'Status must be DATA LIMITED when crossAsset is undefined');
    assert(corr!.confidence === 0, 'Confidence must be 0 when data limited');
    assert(corr!.bias === 'NEUTRAL', 'Bias must remain NEUTRAL');
    assert(corr!.missingInputs?.includes('Benchmark OHLC') === true, 'missingInputs must record missing benchmark');
  }

  // --- Test B: Empty matrix / zero active pairs -> DATA LIMITED ---
  console.log('\n--- Test B: Empty Matrix / Zero Active Pairs ---');
  {
    const emptyMatrix: CrossAssetMatrix = {
      baseSymbol: 'XAUUSD',
      relationships: {},
      activePairCount: 0,
      summary: 'Cross-asset matrix currently data-limited; awaiting synchronized multi-asset time series.',
      computedAt: Date.now(),
    };
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', [], [], undefined, undefined, makeMockFeeds(emptyMatrix));
    const corr = profile.agents.find(a => a.type === 'CORRELATION');
    assert(corr!.status === 'DATA LIMITED', 'Status must be DATA LIMITED when matrix has 0 relationships');
    assert(corr!.confidence === 0, 'Confidence must be 0');
    assert(corr!.missingInputs?.some(m => m.includes('Verified benchmark')) === true, 'missingInputs must specify benchmark shortfall');
  }

  // --- Test C: Partial / insufficient matrix (< 2 verified relationships) -> DATA LIMITED ---
  console.log('\n--- Test C: Partial / Insufficient Matrix ---');
  {
    const partialMatrix: CrossAssetMatrix = {
      baseSymbol: 'XAUUSD',
      relationships: {
        'US_REAL_YIELD': {
          baseSymbol: 'XAUUSD',
          targetSymbol: 'DFII10 (10Y Real Yield)',
          relationType: 'NEGATIVE_BETA',
          rollingCorrelation: -0.62,
          sampleCount: 25,
          status: 'VERIFIED',
          notes: 'Single verified benchmark only.',
        },
        'US500': {
          baseSymbol: 'XAUUSD',
          targetSymbol: 'US500',
          relationType: 'NEUTRAL_OR_DYNAMIC',
          sampleCount: 2,
          status: 'DATA_LIMITED',
          notes: 'Insufficient samples.',
        },
      },
      activePairCount: 1,
      summary: 'Cross-asset matrix computed for 1 active factor(s).',
      computedAt: Date.now(),
    };
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', [], [], undefined, undefined, makeMockFeeds(partialMatrix));
    const corr = profile.agents.find(a => a.type === 'CORRELATION');
    assert(corr!.status === 'DATA LIMITED', 'Status must remain DATA LIMITED with only 1 verified factor');
    assert(corr!.confidence === 0, 'Confidence must be 0');
    assert(corr!.missingInputs?.some(m => m.includes('Additional verified benchmark series')) === true, 'missingInputs must note 1/2 verified');
  }

  // --- Test D: Sufficient verified matrix (>= 2 verified relationships with n >= 5) -> ONLINE ---
  console.log('\n--- Test D: Sufficient Verified Matrix -> ONLINE ---');
  {
    const validMatrix: CrossAssetMatrix = {
      baseSymbol: 'XAUUSD',
      relationships: {
        'US_REAL_YIELD': {
          baseSymbol: 'XAUUSD',
          targetSymbol: 'DFII10 (10Y Real Yield)',
          relationType: 'NEGATIVE_BETA',
          rollingCorrelation: -0.63,
          sampleCount: 30,
          status: 'VERIFIED',
          notes: 'Negative fundamental relationship.',
        },
        'XAGUSD': {
          baseSymbol: 'XAUUSD',
          targetSymbol: 'XAGUSD (Silver)',
          relationType: 'POSITIVE_BETA',
          rollingCorrelation: 0.81,
          sampleCount: 30,
          status: 'VERIFIED',
          notes: 'Precious metals beta benchmark.',
        },
        'USOIL': {
          baseSymbol: 'XAUUSD',
          targetSymbol: 'USOIL (WTI Crude)',
          relationType: 'NEUTRAL_OR_DYNAMIC',
          rollingCorrelation: 0.22,
          sampleCount: 28,
          status: 'VERIFIED',
          notes: 'Energy cost passthrough.',
        },
      },
      activePairCount: 3,
      summary: 'Cross-asset matrix computed for 3 active factor(s) with zero fabricated correlations.',
      computedAt: Date.now(),
    };
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', [], [], undefined, undefined, makeMockFeeds(validMatrix));
    const corr = profile.agents.find(a => a.type === 'CORRELATION');
    assert(corr!.status === 'ONLINE', 'Status must transition to ONLINE when >= 2 verified relationships exist');
    assert(corr!.bias === 'NEUTRAL', 'Bias must remain NEUTRAL (correlation is context, not directional trigger)');
    assert(corr!.missingInputs?.length === 0, 'missingInputs must be empty when verified');
    assert(corr!.availableInputs?.some(i => i.includes('DFII10')) === true, 'availableInputs must include DFII10');
    assert(corr!.availableInputs?.some(i => i.includes('XAGUSD')) === true, 'availableInputs must include XAGUSD');
    assert(corr!.provenanceBadge === 'DERIVED', 'provenanceBadge must be DERIVED');
    assert(corr!.freshness === 'CURRENT', 'freshness must be CURRENT for fresh matrix');

    // --- Test E: ONLINE evidence contains actual runtime correlation & sample count ---
    console.log('\n--- Test E: Runtime Evidence Verification ---');
    assert(corr!.evidence.some(e => e.includes('DFII10') && e.includes('-0.63') && e.includes('n=30')), 'Evidence must contain DFII10 correlation -0.63 and n=30');
    assert(corr!.evidence.some(e => e.includes('XAGUSD') && e.includes('+0.81') && e.includes('n=30')), 'Evidence must contain XAGUSD correlation +0.81 and n=30');
    assert(corr!.evidence.some(e => e.includes('VERIFIED')), 'Evidence must label relationships as VERIFIED');
  }

  // --- Test F: Static expected baseline alone can NEVER make agent ONLINE ---
  console.log('\n--- Test F: Static Baseline Isolation ---');
  {
    // Profile with no feeds
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1');
    const corr = profile.agents.find(a => a.type === 'CORRELATION');
    assert(corr!.status === 'DATA LIMITED', 'Agent without matrix must not be ONLINE');
    assert(corr!.evidence.some(e => e.includes('Contextual Reference Only')), 'Static baseline must be explicitly labeled Contextual Reference Only');
    assert(corr!.confidence === 0, 'Static baseline must contribute 0 confidence');
  }

  // --- Test G: No fabricated correlation values ---
  console.log('\n--- Test G: Zero Fabrication Verification ---');
  {
    const zeroMatrix: CrossAssetMatrix = {
      baseSymbol: 'XAUUSD',
      relationships: {
        'DXY': {
          baseSymbol: 'XAUUSD',
          targetSymbol: 'DXY (US Dollar Index)',
          relationType: 'NEGATIVE_BETA',
          sampleCount: 0,
          status: 'UNAVAILABLE',
          notes: 'DXY provider is not configured. Zero synthetic correlation generated.',
        },
      },
      activePairCount: 0,
      summary: 'Data-limited matrix.',
      computedAt: Date.now(),
    };
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', [], [], undefined, undefined, makeMockFeeds(zeroMatrix));
    const corr = profile.agents.find(a => a.type === 'CORRELATION');
    assert(corr!.status === 'DATA LIMITED', 'Status must be DATA LIMITED');
    assert(!corr!.lastOpinion.includes('rolling correlation'), 'Opinion must not report rolling correlation when unmeasured');
  }

  // --- Test H: Canonical Correlation & Specialist compatibility ---
  console.log('\n--- Test H: Specialist Compatibility ---');
  {
    const validMatrix: CrossAssetMatrix = {
      baseSymbol: 'XAUUSD',
      relationships: {
        'US_REAL_YIELD': {
          baseSymbol: 'XAUUSD',
          targetSymbol: 'DFII10',
          relationType: 'NEGATIVE_BETA',
          rollingCorrelation: -0.55,
          sampleCount: 20,
          status: 'VERIFIED',
          notes: 'Verified.',
        },
        'US_10Y_YIELD': {
          baseSymbol: 'XAUUSD',
          targetSymbol: 'DGS10',
          relationType: 'NEGATIVE_BETA',
          rollingCorrelation: -0.40,
          sampleCount: 20,
          status: 'VERIFIED',
          notes: 'Verified.',
        },
      },
      activePairCount: 2,
      summary: 'Cross-asset matrix computed for 2 active factor(s).',
      computedAt: Date.now(),
    };

    const councilProfile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', [], [], undefined, undefined, makeMockFeeds(validMatrix));
    const canonicalCorr = councilProfile.agents.find(a => a.type === 'CORRELATION');
    const specialistCorr = evaluateCrossAssetAgent({ matrix: validMatrix, instrument: 'XAUUSD' });

    assert(canonicalCorr!.status === 'ONLINE', 'Canonical agent must be ONLINE');
    assert(specialistCorr.readiness === 'READY', 'Specialist must be READY');
    assert(canonicalCorr!.bias === 'NEUTRAL', 'Canonical bias must be NEUTRAL');
    assert(specialistCorr.direction === 'NEUTRAL', 'Specialist direction must be NEUTRAL');

    // Both fail-closed with undefined matrix
    const councilProfileEmpty = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', [], [], undefined, undefined, makeMockFeeds(undefined));
    const canonicalCorrEmpty = councilProfileEmpty.agents.find(a => a.type === 'CORRELATION');
    const specialistCorrEmpty = evaluateCrossAssetAgent({ matrix: undefined, instrument: 'XAUUSD' });

    assert(canonicalCorrEmpty!.status === 'DATA LIMITED', 'Canonical agent must be DATA LIMITED when empty');
    assert(specialistCorrEmpty.readiness === 'DATA_LIMITED', 'Specialist must be DATA_LIMITED when empty');
  }

  // --- Test I: Fail-closed behavior preservation ---
  console.log('\n--- Test I: Fail-Closed Invariant Preservation ---');
  {
    const malformedMatrix = {
      baseSymbol: 'XAUUSD',
      relationships: null as any,
      activePairCount: 5,
    } as any;
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', [], [], undefined, undefined, makeMockFeeds(malformedMatrix));
    const corr = profile.agents.find(a => a.type === 'CORRELATION');
    assert(corr!.status === 'DATA LIMITED', 'Malformed relationships must fail closed to DATA LIMITED');
  }

  // --- Test J: Safety Invariant Verification ---
  console.log('\n--- Test J: Safety & Execution Invariants ---');
  {
    assert(CANONICAL_EXECUTION_MODE === 'ARMED_WITH_CONFIRMATION', 'CANONICAL_EXECUTION_MODE must remain ARMED_WITH_CONFIRMATION');
    assert(MT5_ORDER_TRANSPORT_ENABLED === true, 'MT5_ORDER_TRANSPORT_ENABLED must remain true');
  }

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passCount} passed, ${failCount} failed.`);
  console.log('========================================================================');
}

runTestSuite().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

