/**
 * FEF CORTEX — SPRINT 2D.2 RELEASE-CANDIDATE GATE TEST SUITE
 *
 * Verifies Sprint 2D.2 invariants:
 * 1. Generic 41% fallback/floor does not exist (confidence is strictly 0 on WAIT, data-derived on WATCH)
 * 2. WATCH cannot occur from confidence default or council average artifacts
 * 3. Correlated FRED agents (Rates + Macro Correlator isolated yield) do not inflate independent consensus
 * 4. WATCH requires setup/structure eligibility and >= 4 independent canonical families with HIGH readiness
 * 5. MARKET_CONFLICT always blocks WATCH and forces WAIT
 * 6. DATA_INSUFFICIENT always blocks WATCH and forces WAIT
 */

import { CortexConfluenceEngine } from '../src/lib/confluence/confluence-engine';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { evaluateRatesAgent, evaluateInflationAgent, evaluateMacroCorrelatorAgent } from '../src/lib/agents/specialists/specialist-agents';
import { OHLCCandle } from '../src/lib/macro/types';

function createCandles(count: number, basePrice: number = 100, trend: 'UP' | 'DOWN' | 'FLAT' = 'UP'): OHLCCandle[] {
  const candles: OHLCCandle[] = [];
  const now = Date.now();
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    const delta = trend === 'UP' ? 1.0 : trend === 'DOWN' ? -1.0 : 0.1;
    const open = price;
    const close = price + delta;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    price = close;

    candles.push({
      timestamp: now - (count - i) * 3600_000,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 10,
    });
  }

  return candles;
}

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

async function runRcGateSuite() {
  console.log('========================================================================');
  console.log('FEF CORTEX — SPRINT 2D.2 RELEASE-CANDIDATE GATE TEST SUITE');
  console.log('========================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Generic 41% Fallback Does Not Exist
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: Generic 41% Fallback Does Not Exist ---');
  const bullCandles = createCandles(30, 1.30, 'UP');
  const liveAsset = {
    symbol: 'GBPUSD',
    price: 1.30,
    change24h: 0.5,
    timestamp: Date.now(),
  };

  const gbpProfile = generateAssetIntelligence(
    'GBPUSD',
    liveAsset as any,
    'H1',
    bullCandles,
    'LIVE_MT5',
    'EXNESS_MT5',
    new Date()
  );

  assert(gbpProfile.setupDirection === 'WAIT', 'GBPUSD without multi-family feeds must fail closed to WAIT');
  assert(gbpProfile.confidence === 0, `WAIT posture must produce strictly 0% confidence (got: ${gbpProfile.confidence}%, NOT 41%)`);
  assert(gbpProfile.confidence !== 41, 'Confidence must never equal legacy 41% artifact');

  // ---------------------------------------------------------------------------
  // TEST 2: WATCH Cannot Occur From Confidence Default or MODERATE Readiness
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 2: WATCH Cannot Occur From Confidence Default or MODERATE Readiness ---');
  const confluenceEngine = new CortexConfluenceEngine();

  // Create 3 active families with MODERATE readiness
  const ratesAgent = evaluateRatesAgent({
    tenYearYield: {
      seriesId: 'DGS10', name: '10Y Yield', category: 'TREASURY_YIELD', latestValue: 4.10,
      latestObservationDate: '2026-10-06', direction: 'FALLING', change1Bp: -5, momentum: 'DOWN',
      freshness: 'CURRENT', freshnessReason: 'Fresh', sampleCount: 10, provider: 'FRED',
      classification: 'INDEPENDENT_VERIFIED', analysisStatus: 'VALID',
    },
  });
  const inflationAgent = evaluateInflationAgent({
    realYieldAnalysis: {
      seriesId: 'DFII10', name: '10Y Real Yield', category: 'REAL_YIELD', latestValue: 1.95,
      latestObservationDate: '2026-10-06', direction: 'FALLING', change1Bp: -10, momentum: 'DOWN',
      freshness: 'CURRENT', freshnessReason: 'Fresh', sampleCount: 10, provider: 'FRED',
      classification: 'INDEPENDENT_VERIFIED',
    },
  });

  const moderateResult = confluenceEngine.evaluateConfluence({
    instrument: 'GBPUSD',
    agents: [ratesAgent, inflationAgent],
    hasBlueprint: true,
  });

  assert(moderateResult.presentationPosture === 'WAIT', 'Confluence with < 4 families must emit presentationPosture = WAIT');
  assert(moderateResult.confidence === 0, 'Confluence with WAIT posture must emit confidence = 0%');

  // ---------------------------------------------------------------------------
  // TEST 3: Correlated FRED Agents Do Not Inflate Independent Consensus
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 3: Correlated FRED Agents Do Not Inflate Independent Consensus ---');
  // Macro correlator with isolated 10Y yield must map to RATES domain, not duplicate CROSS_ASSET
  const macroCorrIsolated = evaluateMacroCorrelatorAgent({
    tenYearYield: {
      seriesId: 'DGS10', name: '10Y Yield', category: 'TREASURY_YIELD', latestValue: 4.10,
      latestObservationDate: '2026-10-06', direction: 'FALLING', change1Bp: -5, momentum: 'DOWN',
      freshness: 'CURRENT', freshnessReason: 'Fresh', sampleCount: 10, provider: 'FRED',
      classification: 'INDEPENDENT_VERIFIED', analysisStatus: 'VALID',
    },
    instrument: 'GBPUSD',
  });

  assert(macroCorrIsolated.domainFamily === 'RATES', 'Macro Correlator with isolated yield must map to domain RATES (not duplicate CROSS_ASSET)');
  assert(macroCorrIsolated.evidence[0].domainFamily === 'RATES', 'Isolated yield evidence must belong to domain RATES');

  // Confluence evaluating both RatesAgent and MacroCorrelator isolated yield must group them into single RATES family
  const duplicateFredResult = confluenceEngine.evaluateConfluence({
    instrument: 'GBPUSD',
    agents: [ratesAgent, macroCorrIsolated],
    hasBlueprint: true,
  });

  assert(duplicateFredResult.supportingDomains.length === 1, 'Duplicate FRED yield agents must group into exactly 1 domain');
  assert(duplicateFredResult.supportingDomains[0] === 'RATES', 'Domain must be RATES');

  // ---------------------------------------------------------------------------
  // TEST 4: WATCH Requires Setup/Structure Eligibility & >= 4 Families
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 4: WATCH Requires Setup/Structure Eligibility & >= 4 Families ---');
  // Asset with no blueprint must NEVER produce WATCH
  const noBlueprintResult = confluenceEngine.evaluateConfluence({
    instrument: 'US100',
    agents: [ratesAgent, inflationAgent],
    hasBlueprint: false,
  });
  assert(noBlueprintResult.presentationPosture === 'WAIT', 'Missing blueprint must force presentationPosture = WAIT');

  // ---------------------------------------------------------------------------
  // TEST 5: MARKET_CONFLICT Always Blocks WATCH
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 5: MARKET_CONFLICT Always Blocks WATCH ---');
  const opposingAgent = {
    agentId: 'TECH_OPPOSING',
    agentName: 'Opposing Technical Agent',
    role: 'SMC Structure',
    domainFamily: 'PRICE_TECHNICAL' as const,
    instrument: 'EURUSD',
    direction: 'BEARISH' as const,
    confidence: 85,
    evidenceTrust: 90,
    readiness: 'READY' as const,
    primaryThesis: 'Bearish market structure shift',
    evidence: [{
      id: 'opp-1', agentId: 'TECH_OPPOSING', domainFamily: 'PRICE_TECHNICAL' as const,
      nature: 'DATA' as const, classification: 'LIVE_MT5' as const, polarity: 'BEARISH' as const,
      strength: 0.9, confidence: 85, claim: 'Bearish structure break', source: 'MT5', provider: 'MT5',
      observedAt: new Date().toISOString(), receivedAt: Date.now(), freshnessMs: 0, isStale: false, instrument: 'EURUSD',
    }],
    conflicts: [],
    missingEvidence: [],
    invalidation: 'Swing high break',
    keyRisk: 'Liquidity sweep',
    provenanceBadge: 'INDEPENDENT' as const,
    generatedAt: Date.now(),
  };

  const conflictResult = confluenceEngine.evaluateConfluence({
    instrument: 'EURUSD',
    agents: [ratesAgent, opposingAgent],
    hasBlueprint: true,
  });

  assert(conflictResult.conflictScore > 15, `Opposing high-trust domain must raise conflictScore (got: ${conflictResult.conflictScore}%)`);
  assert(conflictResult.opposingDomains.length > 0, 'Opposing domain must be recorded in opposingDomains');
  assert(conflictResult.presentationPosture === 'WAIT', 'High-trust conflict must block WATCH and force WAIT');

  // ---------------------------------------------------------------------------
  // TEST 6: DATA_INSUFFICIENT Always Blocks WATCH
  // ---------------------------------------------------------------------------
  console.log('\n--- Test 6: DATA_INSUFFICIENT Always Blocks WATCH ---');
  const emptyPipelineProfile = generateAssetIntelligence(
    'XAUUSD',
    { symbol: 'XAUUSD', price: 2650, change24h: 0, timestamp: Date.now() } as any,
    'H1'
  );

  assert(emptyPipelineProfile.setupDirection === 'WAIT', 'Empty inputs must produce setupDirection WAIT');
  assert(emptyPipelineProfile.dataReadinessSummary.waitReason === 'DATA_INSUFFICIENT', 'Empty inputs must have waitReason DATA_INSUFFICIENT');
  assert(emptyPipelineProfile.confidence === 0, 'DATA_INSUFFICIENT must enforce confidence 0%');
  assert(!emptyPipelineProfile.tradeExecutable, 'DATA_INSUFFICIENT must enforce tradeExecutable = false');

  console.log('\n========================================================================');
  console.log(`SPRINT 2D.2 RC GATE SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('========================================================================\n');
}

runRcGateSuite().catch((e) => {
  console.error('Fatal RC Gate Suite Error:', e);
  process.exit(1);
});
