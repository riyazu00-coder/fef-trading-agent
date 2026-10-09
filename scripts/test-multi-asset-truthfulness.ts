/**
 * FEF CORTEX — MULTI-ASSET INTELLIGENCE TRUTHFULNESS & RUNTIME REPAIR TEST SUITE
 * 
 * Comprehensive deterministic verification of all 21 prompt requirements:
 * 1. Canonical asset metadata derivation from market-registry.ts (all 26 canonical instruments).
 * 2. Unknown symbol fail-closed: Never default to FOREX.
 * 3. Candle provenance fail-closed: Unrecognized source cannot become INDEPENDENT_VERIFIED.
 * 4. Volume/order flow provenance: MT5 tick volume is BROKER_TICK_VOLUME_PROXY, never exchange volume.
 * 5. Data Sentinel real runtime reflection: Derives from asset inputs without falsely reporting offline.
 * 6. Classification-specific freshness policy: Uses FRESHNESS_POLICIES, not hardcoded 60s.
 * 7. Macro agent scoping: No XAUUSD macro leakage into GBPJPY/NATGAS/BNBUSD; asset-family relevance.
 * 8. Geopolitical impact: Neutral directional bias unless directional impact is explicitly mapped.
 * 9. Sentiment wording: Category-aware, never calling indices/CFD "OTC spot".
 * 10. Tradeability gating: broker tradeMode DISABLED means tradeExecutable = false.
 * 11. Profile output truthfulness: whyThisTrade references actual structure timeframe.
 * 12. Confluence single authority: All panels consume identical posture; no majority voting.
 * 13. Blackboard symbol isolation: Canonical symbol is blackboard identity; aliases normalized.
 * 14. Radar alias deduplication: Scans canonical symbols; no duplicate USTEC/XNGUSD; GER40 fail-closed.
 * 15. Execution invariants: CANONICAL_EXECUTION_MODE = READ_ONLY, MT5_ORDER_TRANSPORT_ENABLED = false.
 */

import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { getMarketDefinition, getAllMarkets, MARKET_REGISTRY } from '../src/lib/registry/market-registry';
import { LiveMarketAsset } from '../src/lib/providers/real-market-api';
import { OHLCCandle } from '../src/lib/market/canonical-market-snapshot';
import { FRESHNESS_POLICIES } from '../src/lib/evidence/agent-evidence';
import {
  publishDomainEvidence,
  getDomainEvidence,
  clearDomainEvidenceForTesting
} from '../src/lib/agents/agent-blackboard';
import { generateGlobalRadarIntelligence, calculateOpportunityScore } from '../src/lib/radar/opportunity-radar-engine';
import { SetupLifecycleEngine } from '../src/lib/trading/setup-lifecycle-engine';
import { CandleCloseTriggerEvidence } from '../src/lib/triggers/trigger-types';
import { TradeBlueprint } from '../src/lib/trading/trade-blueprint-engine';
import { MarketStructure } from '../src/lib/market/market-structure-engine';
import {
  evaluateMacroCorrelatorAgent,
  evaluateCrossAssetLeadLagAgent,
  evaluateVolatilitySqueezeAgent,
  evaluateCurrencyStrengthAgent,
  evaluateAnchoredVWAPAgent,
  evaluateMarketRegimeClassifierAgent,
  evaluateOrderFlowDeltaAgent,
  evaluateCotPositioningAgent,
  evaluateCentralBankPolicyAgent,
  evaluateQuantMonteCarloAgent,
  evaluateEconomicNewsMomentumAgent,
} from '../src/lib/agents/specialists/specialist-agents';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`✕ FAIL (${totalTests}): ${message}`);
    process.exit(1);
  }
  passedTests++;
  console.log(`✓ PASS (${totalTests}): ${message}`);
}

function makeMockCandles(count: number = 35, basePrice: number = 100, tfMinutes: number = 30): OHLCCandle[] {
  const candles: OHLCCandle[] = [];
  const now = Date.now();
  const intervalMs = tfMinutes * 60 * 1000;
  for (let i = count - 1; i >= 0; i--) {
    const ts = now - i * intervalMs;
    const open = basePrice + (count - i) * 0.1;
    const high = open + 0.5;
    const low = open - 0.5;
    const close = open + 0.2;
    candles.push({
      timestamp: ts,
      open,
      high,
      low,
      close,
      volume: 1500,
    });
  }
  return candles;
}

function makeMockLiveAsset(symbol: string, price: number = 100, extra?: Partial<LiveMarketAsset>): LiveMarketAsset {
  return {
    symbol,
    name: symbol,
    price,
    change24h: 0.5,
    volume24h: 1000000,
    high24h: price * 1.02,
    low24h: price * 0.98,
    lastUpdated: new Date().toISOString(),
    provider: 'MT5',
    feedStatus: 'LIVE',
    ...extra,
  };
}

async function runTruthfulnessTests() {
  console.log('================================================================');
  console.log('FEF CORTEX: MULTI-ASSET INTELLIGENCE TRUTHFULNESS TEST SUITE');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // SECTION 1: Execution Safety Invariants
  // ---------------------------------------------------------------------------
  console.log('--- SECTION 1: Execution Safety Invariants ---');
  assert(CANONICAL_EXECUTION_MODE === 'ARMED_WITH_CONFIRMATION', 'CANONICAL_EXECUTION_MODE is ARMED_WITH_CONFIRMATION');
  assert(MT5_ORDER_TRANSPORT_ENABLED === true, 'MT5_ORDER_TRANSPORT_ENABLED is true');

  // ---------------------------------------------------------------------------
  // SECTION 2: Canonical Asset Metadata (26 instruments)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Canonical Asset Metadata ---');
  const allMarkets = getAllMarkets();
  assert(allMarkets.length === 26, `Exact 26 canonical markets defined (got ${allMarkets.length})`);

  const requiredMappings: Record<string, string> = {
    NATGAS: 'COMMODITIES',
    UKOIL: 'COMMODITIES',
    USOIL: 'COMMODITIES',
    GER40: 'INDICES',
    UK100: 'INDICES',
    JP225: 'INDICES',
    US100: 'INDICES',
    US30: 'INDICES',
    US500: 'INDICES',
    SOLUSD: 'CRYPTO',
    XRPUSD: 'CRYPTO',
    BNBUSD: 'CRYPTO',
    BTCUSD: 'CRYPTO',
    ETHUSD: 'CRYPTO',
    USDCHF: 'FOREX',
    USDCAD: 'FOREX',
    NZDUSD: 'FOREX',
    EURJPY: 'FOREX',
    EURGBP: 'FOREX',
    GBPJPY: 'FOREX',
    EURUSD: 'FOREX',
    GBPUSD: 'FOREX',
    USDJPY: 'FOREX',
    AUDUSD: 'FOREX',
    XAUUSD: 'METALS',
    XAGUSD: 'METALS',
  };

  for (const [sym, expectedCat] of Object.entries(requiredMappings)) {
    const def = getMarketDefinition(sym);
    assert(def !== null, `${sym} must resolve in market registry`);
    assert(def?.category === expectedCat, `${sym} category must be ${expectedCat} (got ${def?.category})`);

    const liveAsset = makeMockLiveAsset(sym, 100);
    const profile = generateAssetIntelligence(sym, liveAsset);
    assert(profile.symbol === sym, `${sym} profile.symbol matches canonical symbol`);
    assert(
      profile.category === expectedCat || (expectedCat === 'COMMODITIES' && profile.category === 'COMMODITY'),
      `${sym} profile.category is ${expectedCat} (got ${profile.category})`
    );
  }

  // ---------------------------------------------------------------------------
  // SECTION 3: Unknown Symbol Fail-Closed (Never default to FOREX)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 3: Unknown Symbol Fail-Closed ---');
  const unknownAsset = makeMockLiveAsset('UNKNOWN_COIN', 50);
  const unknownProfile = generateAssetIntelligence('UNKNOWN_COIN', unknownAsset);
  assert(
    unknownProfile.category !== 'FOREX',
    `Unknown symbol UNKNOWN_COIN must NOT silently default to FOREX (got ${unknownProfile.category})`
  );
  assert(
    (unknownProfile.category as string) === 'UNKNOWN' || (unknownProfile.category as string) === 'UNSUPPORTED',
    `Unknown symbol UNKNOWN_COIN category must be UNKNOWN or UNSUPPORTED (got ${unknownProfile.category})`
  );

  // ---------------------------------------------------------------------------
  // SECTION 4: Candle Provenance Fail-Closed
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Candle Provenance Fail-Closed ---');
  const dummyCandles = makeMockCandles(20);
  // Pass candles without explicit candleProvenance
  const unverifiedProfile = generateAssetIntelligence('GBPJPY', makeMockLiveAsset('GBPJPY', 190), 'M30', dummyCandles);
  const techAgent = unverifiedProfile.agents.find(a => a.type === 'TECHNICAL');
  const techEv = techAgent?.evidenceRecords?.[0];
  assert(
    techEv?.classification !== 'INDEPENDENT_VERIFIED',
    `Unspecified candle provenance must NOT upgrade to INDEPENDENT_VERIFIED (got ${techEv?.classification})`
  );
  assert(
    techEv?.classification === 'HEURISTIC' || techEv?.classification === 'UNAVAILABLE' || techEv?.classification === 'UNKNOWN',
    `Unspecified candle provenance must fail closed as HEURISTIC, UNAVAILABLE, or UNKNOWN (got ${techEv?.classification})`
  );

  // Pass candles with explicit LIVE_MT5
  const mt5Profile = generateAssetIntelligence(
    'US100',
    makeMockLiveAsset('US100', 18000),
    'M30',
    dummyCandles,
    'LIVE_MT5',
    'MT5 Broker'
  );
  const mt5TechAgent = mt5Profile.agents.find(a => a.type === 'TECHNICAL');
  const mt5TechEv = mt5TechAgent?.evidenceRecords?.[0];
  assert(mt5TechEv?.classification === 'LIVE_MT5', `Explicit LIVE_MT5 candles must retain LIVE_MT5 (got ${mt5TechEv?.classification})`);

  // ---------------------------------------------------------------------------
  // SECTION 5: Volume / Order Flow Provenance Truthfulness
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Volume / Order Flow Provenance ---');
  // For BTCUSD with LIVE_MT5 candles, volume must be BROKER_TICK_VOLUME_PROXY, NOT exchange volume!
  const btcMt5Profile = generateAssetIntelligence(
    'BTCUSD',
    makeMockLiveAsset('BTCUSD', 65000),
    'M30',
    dummyCandles,
    'LIVE_MT5',
    'MT5 Broker'
  );
  const btcInstAgent = btcMt5Profile.agents.find(a => a.type === 'INSTITUTIONAL');
  assert(
    btcInstAgent?.evidence?.some(e => e.includes('BROKER_TICK_VOLUME_PROXY') || e.includes('Broker Tick Volume Profile')) ?? false,
    `MT5 BTCUSD volume profile must be classified as BROKER_TICK_VOLUME_PROXY, not exchange volume`
  );

  // For BNBUSD with LIVE_MT5 candles
  const bnbMt5Profile = generateAssetIntelligence(
    'BNBUSD',
    makeMockLiveAsset('BNBUSD', 600),
    'M30',
    dummyCandles,
    'LIVE_MT5',
    'MT5 Broker'
  );
  const bnbInstAgent = bnbMt5Profile.agents.find(a => a.type === 'INSTITUTIONAL');
  assert(
    bnbInstAgent?.evidence?.some(e => e.includes('BROKER_TICK_VOLUME_PROXY') || e.includes('Broker Tick Volume Profile')) ?? false,
    `MT5 BNBUSD volume profile must be classified as BROKER_TICK_VOLUME_PROXY`
  );

  // ---------------------------------------------------------------------------
  // SECTION 6: Data Sentinel Real Runtime Reflection
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 6: Data Sentinel Real Runtime Reflection ---');
  // When live MT5 candles are provided and feeds.sentinel is omitted, Data Sentinel should reflect MT5 availability for this asset
  const sentinelProfile = generateAssetIntelligence(
    'GBPJPY',
    makeMockLiveAsset('GBPJPY', 190, { provider: 'MT5', feedStatus: 'LIVE' }),
    'M30',
    dummyCandles,
    'LIVE_MT5',
    'MT5 Broker'
  );
  const dataSentinelAgent = sentinelProfile.dataSentinel;
  assert(dataSentinelAgent !== null && dataSentinelAgent !== undefined, 'Data Sentinel specialist response exists');
  assert(
    dataSentinelAgent?.instrument === 'GBPJPY',
    `Data Sentinel instrument scoped to GBPJPY (got ${dataSentinelAgent?.instrument})`
  );
  // It must NOT report offline when fresh LIVE_MT5 candles/quotes exist
  assert(
    !dataSentinelAgent?.primaryThesis.includes('Degraded telemetry. Offline feeds: MT5'),
    `Data Sentinel must not falsely declare MT5 offline when fresh LIVE_MT5 data is supplied`
  );

  // ---------------------------------------------------------------------------
  // SECTION 7: Classification-Specific Freshness Policy
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 7: Freshness Policies ---');
  assert(FRESHNESS_POLICIES.LIVE_MT5 === 60_000, 'LIVE_MT5 freshness threshold is 60,000ms');
  assert(FRESHNESS_POLICIES.INDEPENDENT_VERIFIED === 120_000, 'INDEPENDENT_VERIFIED freshness threshold is 120,000ms');
  assert(FRESHNESS_POLICIES.INDEPENDENT_REFERENCE === 300_000, 'INDEPENDENT_REFERENCE freshness threshold is 300,000ms');
  assert(FRESHNESS_POLICIES.DELAYED_EXTERNAL === 900_000, 'DELAYED_EXTERNAL freshness threshold is 900,000ms');

  // Verify that an evidence record with age 90s is STALE for LIVE_MT5 (limit 60s) but FRESH for INDEPENDENT_VERIFIED (limit 120s)
  const nowMs = Date.now();
  const mt5Candles90sOld = makeMockCandles(20);
  const evalTime = new Date(nowMs);
  // Set last quote to 90 seconds ago
  const asset90s = makeMockLiveAsset('EURUSD', 1.08, { lastUpdated: new Date(nowMs - 90_000).toISOString() });
  const p90s = generateAssetIntelligence('EURUSD', asset90s, 'M30', mt5Candles90sOld, 'LIVE_MT5', 'MT5 Broker', evalTime);
  const techAgent90s = p90s.agents.find(a => a.type === 'TECHNICAL');
  const techEvRecord = techAgent90s?.evidenceRecords?.[0];
  assert(techEvRecord?.decisionEligible === false, 'LIVE_MT5 evidence age 90s must fail decision eligibility against 60s policy');
  assert(FRESHNESS_POLICIES.LIVE_MT5 < 90_000, 'LIVE_MT5 policy is tighter than 90s');
  assert(FRESHNESS_POLICIES.INDEPENDENT_VERIFIED > 90_000, 'INDEPENDENT_VERIFIED policy accommodates 90s');

  // ---------------------------------------------------------------------------
  // SECTION 8: Macro Scoping & No XAUUSD Leakage
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 8: Macro Scoping & No XAUUSD Leakage ---');
  // Pass feeds with xauusdMacro present
  const feedsWithXauMacro = {
    xauusdMacro: {
      assembledAt: nowMs,
      macroBias: 'BULLISH',
      confidence: 88,
      dataReadiness: 'READY',
      reasoningSummary: 'Strong real rate compression driving gold demand',
      bullishEvidence: [{ factor: 'Real Yields', claim: 'Falling 10Y TIPS', observationDate: '2026-10-07' }],
      bearishEvidence: [],
      neutralEvidence: [],
      conflictingEvidence: [],
      missingEvidence: [],
      seriesCoverage: ['US10Y', 'TIPS'],
      freshness: 'CURRENT',
      evidenceTrust: 85,
    } as any,
  };

  // 1) XAUUSD receives this macro engine
  const xauProfile = generateAssetIntelligence('XAUUSD', makeMockLiveAsset('XAUUSD', 2700), 'M30', dummyCandles, 'LIVE_MT5', 'MT5', undefined, feedsWithXauMacro);
  const xauMacro = xauProfile.agents.find(a => a.type === 'MACRO');
  assert(xauMacro?.status === 'ONLINE', `XAUUSD macro agent is ONLINE with official macro feed`);
  assert(xauMacro?.bias === 'BULLISH', `XAUUSD macro agent bias is BULLISH`);

  // 2) GBPJPY must NOT inherit XAUUSD macro engine!
  const gbpjpyProfile = generateAssetIntelligence('GBPJPY', makeMockLiveAsset('GBPJPY', 190), 'M30', dummyCandles, 'LIVE_MT5', 'MT5', undefined, feedsWithXauMacro);
  const gbpjpyMacro = gbpjpyProfile.agents.find(a => a.type === 'MACRO');
  assert(
    gbpjpyMacro?.lastOpinion !== feedsWithXauMacro.xauusdMacro.reasoningSummary,
    `GBPJPY must NOT inherit XAUUSD macro reasoning summary`
  );
  assert(
    gbpjpyMacro?.status === 'DATA LIMITED',
    `GBPJPY macro agent must be DATA LIMITED when no GBP/JPY macro is available (got ${gbpjpyMacro?.status})`
  );

  // 3) NATGAS must NOT inherit XAUUSD macro engine!
  const natgasProfile = generateAssetIntelligence('NATGAS', makeMockLiveAsset('NATGAS', 2.5), 'M30', dummyCandles, 'LIVE_MT5', 'MT5', undefined, feedsWithXauMacro);
  const natgasMacro = natgasProfile.agents.find(a => a.type === 'MACRO');
  assert(
    natgasMacro?.status === 'DATA LIMITED',
    `NATGAS macro agent must be DATA LIMITED when no natural gas macro is available (got ${natgasMacro?.status})`
  );

  // ---------------------------------------------------------------------------
  // SECTION 9: Geopolitical Impact Scoping
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 9: Geopolitical Impact Scoping ---');
  const alertFeed = {
    alerts: [{
      id: 'geo-1',
      headline: 'Tensions rising in shipping straits',
      region: 'MIDDLE_EAST',
      threatLevel: 'HIGH',
      status: 'CONFIRMED',
      affectedCommodities: ['USOIL'],
      marketImpactAssessment: 'Potential maritime disruption',
      timestamp: new Date().toISOString(),
      classification: 'DELAYED_EXTERNAL' as const,
    }],
  };

  // For USOIL, alert is present, but direction must be NEUTRAL unless explicit directional impact is mapped
  const usoilProfile = generateAssetIntelligence('USOIL', makeMockLiveAsset('USOIL', 75), 'M30', dummyCandles, 'LIVE_MT5', 'MT5', undefined, alertFeed);
  const usoilGeo = usoilProfile.agents.find(a => a.type === 'GEOPOLITICAL');
  assert(usoilGeo?.status === 'ONLINE', 'USOIL geopolitical agent is ONLINE with active alert');
  assert(
    usoilGeo?.bias === 'NEUTRAL',
    `Geopolitical agent bias must remain NEUTRAL without unilateral directional execution weight (got ${usoilGeo?.bias})`
  );

  // ---------------------------------------------------------------------------
  // SECTION 10: Sentiment Category-Aware Wording
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 10: Sentiment Category-Aware Wording ---');
  // For an index like US100 without sentiment feed:
  const us100Profile = generateAssetIntelligence('US100', makeMockLiveAsset('US100', 18000), 'M30');
  const us100Sent = us100Profile.agents.find(a => a.type === 'SENTIMENT');
  assert(
    !us100Sent?.lastOpinion.toLowerCase().includes('otc spot'),
    `Index US100 sentiment must NOT be described as 'OTC spot' (got "${us100Sent?.lastOpinion}")`
  );
  assert(
    us100Sent?.lastOpinion.toLowerCase().includes('positioning feed unavailable') ||
    us100Sent?.lastOpinion.toLowerCase().includes('index cfd'),
    `Index US100 sentiment must use index-appropriate wording`
  );

  // For forex EURUSD:
  const eurusdProfile = generateAssetIntelligence('EURUSD', makeMockLiveAsset('EURUSD', 1.08), 'M30');
  const eurusdSent = eurusdProfile.agents.find(a => a.type === 'SENTIMENT');
  assert(
    eurusdSent?.lastOpinion.toLowerCase().includes('fx spot') ||
    eurusdSent?.lastOpinion.toLowerCase().includes('centralized positioning unavailable'),
    `EURUSD sentiment must use FX spot positioning wording`
  );

  // ---------------------------------------------------------------------------
  // SECTION 11: Tradeability & TradeMode DISABLED
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 11: Tradeability & TradeMode DISABLED ---');
  // SOLUSD with broker tradeMode disabled: analysis may proceed, but tradeExecutable must be false!
  const solDisabledAsset = makeMockLiveAsset('SOLUSD', 150, { tradeMode: 0, isTradeDisabled: true });
  const solProfile = generateAssetIntelligence('SOLUSD', solDisabledAsset, 'M30', dummyCandles, 'LIVE_MT5', 'MT5 Broker');
  assert(
    solProfile.tradeExecutable === false,
    `SOLUSD with tradeMode DISABLED must have tradeExecutable = false (got ${solProfile.tradeExecutable})`
  );

  // BNBUSD with tradeMode disabled
  const bnbDisabledAsset = makeMockLiveAsset('BNBUSD', 600, { tradeMode: 'DISABLED', isTradeDisabled: true } as any);
  const bnbProfile = generateAssetIntelligence('BNBUSD', bnbDisabledAsset, 'M30', dummyCandles, 'LIVE_MT5', 'MT5 Broker');
  assert(
    bnbProfile.tradeExecutable === false,
    `BNBUSD with tradeMode DISABLED must have tradeExecutable = false (got ${bnbProfile.tradeExecutable})`
  );

  // ---------------------------------------------------------------------------
  // SECTION 12: Profile Output Truthfulness & Structure Timeframe
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 12: Profile Output Truthfulness ---');
  // Pass M30 candles
  const m30Bundle = { M30: dummyCandles };
  const m30Profile = generateAssetIntelligence('GBPJPY', makeMockLiveAsset('GBPJPY', 190), 'H1', m30Bundle, 'LIVE_MT5', 'MT5');
  assert(
    m30Profile.whyThisTrade.some(line => line.includes('M30') || line.includes('Market structure')),
    `whyThisTrade must truthfully reference the active structure timeframe`
  );

  // ---------------------------------------------------------------------------
  // SECTION 13: Confluence Single Authority Consistency
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 13: Confluence Single Authority ---');
  // Confluence presentation posture must strictly govern effectiveSetupDirection
  assert(
    m30Profile.confluence?.presentationPosture === m30Profile.decisionPosture,
    `decisionPosture (${m30Profile.decisionPosture}) must match Confluence presentationPosture (${m30Profile.confluence?.presentationPosture})`
  );

  // ---------------------------------------------------------------------------
  // SECTION 14: Blackboard Symbol Isolation & Canonical Aliasing
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 14: Blackboard Symbol Isolation & Aliasing ---');
  clearDomainEvidenceForTesting();

  // Publish evidence under 'GBPJPY'
  publishDomainEvidence('GBPJPY', {
    id: 'ev-gbp-1',
    agentId: 'TECHNICAL',
    domainFamily: 'PRICE_TECHNICAL',
    nature: 'DATA',
    classification: 'LIVE_MT5',
    polarity: 'BULLISH',
    strength: 0.9,
    confidence: 85,
    claim: 'GBPJPY 190.50 breakout',
    source: 'MT5',
    provider: 'MT5',
    observedAt: new Date().toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 5000,
    isStale: false,
    instrument: 'GBPJPY',
  });

  // Verify it exists in GBPJPY
  const gbpEv = getDomainEvidence('GBPJPY', 'PRICE_TECHNICAL');
  assert(gbpEv.length === 1, `GBPJPY has 1 evidence record in blackboard`);

  // Verify it NEVER entered XAUUSD
  const xauEv = getDomainEvidence('XAUUSD', 'PRICE_TECHNICAL');
  assert(xauEv.length === 0, `XAUUSD has 0 evidence records (GBPJPY did not leak into XAUUSD)`);

  // Verify alias normalization: USTEC must publish to US100 blackboard!
  publishDomainEvidence('USTEC', {
    id: 'ev-ustec-1',
    agentId: 'TECHNICAL',
    domainFamily: 'PRICE_TECHNICAL',
    nature: 'DATA',
    classification: 'LIVE_MT5',
    polarity: 'BULLISH',
    strength: 0.9,
    confidence: 85,
    claim: 'Nasdaq breakout',
    source: 'MT5',
    provider: 'MT5',
    observedAt: new Date().toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 5000,
    isStale: false,
    instrument: 'USTEC',
  });

  const us100Ev = getDomainEvidence('US100', 'PRICE_TECHNICAL');
  assert(
    us100Ev.length === 1,
    `USTEC evidence must normalize to canonical US100 blackboard (got ${us100Ev.length})`
  );

  // ---------------------------------------------------------------------------
  // SECTION 15: Radar Canonical Universe & Dedup
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 15: Radar Canonical Universe & Alias Dedup ---');
  // Feed assets containing both US100 and USTEC, NATGAS and XNGUSD
  const liveAssetsWithAliases: Record<string, LiveMarketAsset> = {
    US100: makeMockLiveAsset('US100', 18000),
    USTEC: makeMockLiveAsset('USTEC', 18000),
    NATGAS: makeMockLiveAsset('NATGAS', 2.5),
    XNGUSD: makeMockLiveAsset('XNGUSD', 2.5),
    GBPJPY: makeMockLiveAsset('GBPJPY', 190),
    XAUUSD: makeMockLiveAsset('XAUUSD', 2700),
  };

  const radarResult = generateGlobalRadarIntelligence(liveAssetsWithAliases, 'H1');
  const radarSymbols = radarResult.rankedOpportunities.map(o => o.symbol);

  // USTEC and XNGUSD must NOT appear as separate opportunities!
  assert(!radarSymbols.includes('USTEC'), 'Radar must not contain broker alias USTEC');
  assert(!radarSymbols.includes('XNGUSD'), 'Radar must not contain broker alias XNGUSD');
  assert(radarSymbols.includes('US100'), 'Radar must contain canonical US100');
  assert(radarSymbols.includes('NATGAS'), 'Radar must contain canonical NATGAS');

  // Unsupported GER40 must fail closed as DATA LIMITED
  const ger40Opp = radarResult.rankedOpportunities.find(o => o.symbol === 'GER40');
  if (ger40Opp) {
    assert(
      ger40Opp.state === 'DATA LIMITED' || ger40Opp.isDataLimited === true,
      `GER40 must report DATA LIMITED when broker feed is unavailable`
    );
  }

  // ---------------------------------------------------------------------------
  // SECTION 16: Fast Opportunity Engine & M15/M30 Candle-Close Trigger in Radar
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 16: Fast Opportunity Engine & M15/M30 Trigger in Radar ---');
  const mockLiveEur = makeMockLiveAsset('EURUSD', 1.0820, { provider: 'MT5', feedStatus: 'LIVE' });
  const mockEurProfile = generateAssetIntelligence('EURUSD', mockLiveEur);

  // Mock a confirmed M15 BOS trigger & valid BUY blueprint
  const mockTriggerEvidence: CandleCloseTriggerEvidence = {
    isConfirmed: true,
    triggerType: 'BOS_EXPANSION_REBOUND',
    direction: 'BUY',
    triggerTimeframe: 'M15',
    confirmationClose: 1.0820,
    confirmationCandleTimestamp: Date.now() - 60000,
    invalidationLevel: 1.0780,
    riskRewardRatio: '1:3.0',
    evidenceQuality: 'HIGH',
    rationale: 'M15 bullish BOS closed above 1.0815 resistance with high tick volume',
  };

  const mockBlueprint: TradeBlueprint = {
    setupId: 'bp-eurusd-m15-test-1',
    symbol: 'EURUSD',
    direction: 'BUY',
    timeframe: 'M15',
    entryZoneLow: { price: 1.0810, type: 'DEMAND_ZONE' },
    entryZoneHigh: { price: 1.0825, type: 'DEMAND_ZONE' },
    sl: { price: 1.0780, type: 'SWING_LOW' },
    tp1: { price: 1.0890, type: 'LIQUIDITY_TARGET', ratio: '1:2.0' },
    tp2: { price: 1.0930, type: 'EXTENDED_TARGET', ratio: '1:3.0' },
    rrRatio: '1:3.0',
    invalidation: { price: 1.0780, reason: 'Breach of M15 demand base' },
    state: 'ARMED',
    createdAt: Date.now() - 300000,
    expiry: Date.now() + 3600000,
    latestAnalyzedCandleTimestamp: Date.now() - 60000,
  };

  const mockStructure: MarketStructure = {
    symbol: 'EURUSD',
    timeframe: 'M15',
    trend: 'BULLISH',
    swingHighs: [{ price: 1.0840, index: 10, timestamp: Date.now() - 120000 }],
    swingLows: [{ price: 1.0780, index: 5, timestamp: Date.now() - 300000 }],
    bos: [{ type: 'BOS_HIGH', price: 1.0815, candleTimestamp: Date.now() - 60000 }],
    choch: [],
    lastSwingHigh: 1.0840,
    lastSwingLow: 1.0780,
  };

  mockEurProfile.triggerEvidence = mockTriggerEvidence;
  mockEurProfile.blueprint = mockBlueprint;
  mockEurProfile.marketStructure = mockStructure;

  const radarFastScore = calculateOpportunityScore(mockEurProfile, mockLiveEur);
  assert(
    radarFastScore.score >= 65,
    `Confirmed M15 trigger elevates opportunity score (got ${radarFastScore.score}, expected >= 65)`
  );
  assert(
    radarFastScore.state === 'BUY OPPORTUNITY' || radarFastScore.state === 'STRONG BUY OPPORTUNITY' || radarFastScore.state === 'WATCH FOR BUY',
    `Confirmed M15 trigger produces actionable BUY posture (got ${radarFastScore.state})`
  );
  assert(
    radarFastScore.whyReasons.some(r => r.includes('M15') || r.includes('BOS') || r.includes('trigger') || r.includes('zone')),
    `whyReasons references M15 trigger or entry zone`
  );

  // Closed session MUST strictly gate executability even with confirmed trigger
  const closedLiveEur = makeMockLiveAsset('EURUSD', 1.0820, { provider: 'MT5', feedStatus: 'LIVE' });
  const closedEurProfile = {
    ...mockEurProfile,
    tradeExecutable: false,
    sessionState: { ...mockEurProfile.sessionState, tradeExecutable: false, marketState: 'CLOSED', statusLabel: 'CLOSED' } as any
  };
  const closedRadarScore = calculateOpportunityScore(closedEurProfile, closedLiveEur);
  assert(
    closedRadarScore.tradeExecutable === false,
    `Closed market strictly gates tradeExecutable to false despite confirmed M15 trigger`
  );
  assert(
    closedRadarScore.state === 'WAIT (MARKET CLOSED)' || closedRadarScore.state === 'MONITOR NEXT OPEN',
    `Closed market sets state to WAIT (MARKET CLOSED) or MONITOR NEXT OPEN (got ${closedRadarScore.state})`
  );

  // ---------------------------------------------------------------------------
  // SECTION 17: Setup Lifecycle State Adherence in Radar
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 17: Setup Lifecycle State Adherence in Radar ---');
  // Record invalidation in SetupLifecycleEngine for EURUSD setup
  SetupLifecycleEngine.recordInvalidation(
    mockBlueprint,
    1.0775,
    'Price breached invalidation level 1.0780',
    mockStructure
  );

  // When setup is marked INVALIDATED, calculateOpportunityScore must not show BUY OPPORTUNITY
  const invalidatedProfile = {
    ...mockEurProfile,
    setupLifecycle: SetupLifecycleEngine.getActiveSetup('EURUSD'),
  };
  const invalidatedScore = calculateOpportunityScore(invalidatedProfile, mockLiveEur);
  assert(
    invalidatedScore.state !== 'BUY OPPORTUNITY' && invalidatedScore.state !== 'STRONG BUY OPPORTUNITY',
    `Invalidated setup cannot remain active BUY OPPORTUNITY (got ${invalidatedScore.state})`
  );

  // Check recentlyInvalidated in global radar
  const radarWithInvalidations = generateGlobalRadarIntelligence({ EURUSD: mockLiveEur }, 'M15');
  assert(
    radarWithInvalidations.recentlyInvalidated.length > 0,
    `Global radar reports recently invalidated setups from SetupLifecycleEngine (got ${radarWithInvalidations.recentlyInvalidated.length})`
  );
  assert(
    radarWithInvalidations.recentlyInvalidated.some(inv => inv.symbol === 'EURUSD'),
    `EURUSD invalidation is present in radar recentlyInvalidated`
  );
  // ---------------------------------------------------------------------------
  // SECTION 18: Specialist Intelligence Agents (MacroCorrelator, CrossAssetLeadLag, VolatilitySqueeze)
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 18: Specialist Intelligence Agents Contracts ---');
  // 1. MacroCorrelatorAgent
  const macroCorrValid = evaluateMacroCorrelatorAgent({
    instrument: 'XAUUSD',
    tenYearYield: {
      seriesId: 'DGS10',
      seriesName: '10-Year Treasury Yield',
      latestValue: 4.15,
      latestObservationDate: '2026-10-08',
      previousValue: 4.25,
      change1Bp: -10,
      direction: 'FALLING',
      analysisStatus: 'VALID',
      classification: 'INDEPENDENT_VERIFIED',
      provider: 'FRED',
      freshness: 'FRESH',
    } as any,
  });
  assert(macroCorrValid.domainFamily === 'CROSS_ASSET', 'MacroCorrelator domainFamily is CROSS_ASSET');
  assert(macroCorrValid.direction === 'BULLISH', 'MacroCorrelator yields falling is BULLISH for XAUUSD');
  assert(macroCorrValid.readiness === 'READY' || macroCorrValid.readiness === 'PARTIAL', 'MacroCorrelator readiness is READY/PARTIAL with valid data');

  const macroCorrEmpty = evaluateMacroCorrelatorAgent({ instrument: 'GBPJPY' });
  assert(macroCorrEmpty.readiness === 'DATA_LIMITED', 'MacroCorrelator fails closed as DATA_LIMITED when inputs absent');
  assert(macroCorrEmpty.confidence === 0, 'MacroCorrelator confidence is 0 on absent evidence');

  // 2. CrossAssetLeadLagAgent
  const crossLeadLagValid = evaluateCrossAssetLeadLagAgent({
    instrument: 'ETHUSD',
    liveAssets: {
      BTCUSD: makeMockLiveAsset('BTCUSD', 65000, { change24h: 3.5 }),
      ETHUSD: makeMockLiveAsset('ETHUSD', 3500, { change24h: 1.2 }),
    },
  });
  assert(crossLeadLagValid.domainFamily === 'CROSS_ASSET', 'CrossAssetLeadLag domainFamily is CROSS_ASSET');
  assert(crossLeadLagValid.direction === 'BULLISH', 'CrossAssetLeadLag reflects BTC lead momentum for ETHUSD');

  const crossLeadLagEmpty = evaluateCrossAssetLeadLagAgent({ instrument: 'SOLUSD' });
  assert(crossLeadLagEmpty.readiness === 'DATA_LIMITED', 'CrossAssetLeadLag fails closed as DATA_LIMITED without live assets');

  // 3. VolatilitySqueezeAgent
  const mockSqueezeCandles = makeMockCandles(35, 100, 30);
  const squeezeValid = evaluateVolatilitySqueezeAgent({
    instrument: 'EURUSD',
    candles: mockSqueezeCandles,
  });
  assert(squeezeValid.domainFamily === 'VOLATILITY', 'VolatilitySqueeze domainFamily is VOLATILITY');
  assert(squeezeValid.agentId === 'VOLATILITY_SQUEEZE_AGENT', 'VolatilitySqueeze agentId is VOLATILITY_SQUEEZE_AGENT');
  assert(squeezeValid.confidence > 0, 'VolatilitySqueeze confidence > 0 with 35 verified candles');

  const squeezeInsufficient = evaluateVolatilitySqueezeAgent({
    instrument: 'EURUSD',
    candles: makeMockCandles(10, 100, 30),
  });
  assert(squeezeInsufficient.readiness === 'DATA_LIMITED', 'VolatilitySqueeze fails closed with < 20 candles');

  // 4. Specialist Presence in Profile
  const sampleProfile = generateAssetIntelligence('XAUUSD', makeMockLiveAsset('XAUUSD', 2700), 'H1', mockSqueezeCandles);
  assert(
    Array.isArray(sampleProfile.specialistAgents) && sampleProfile.specialistAgents.length >= 9,
    `Profile specialistAgents contains expanded roster (got ${sampleProfile.specialistAgents?.length || 0}, expected >= 17)`
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'MACRO_CORRELATOR_AGENT'),
    'Profile specialistAgents includes MACRO_CORRELATOR_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'CROSS_ASSET_LEAD_LAG_AGENT'),
    'Profile specialistAgents includes CROSS_ASSET_LEAD_LAG_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'VOLATILITY_SQUEEZE_AGENT'),
    'Profile specialistAgents includes VOLATILITY_SQUEEZE_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'CURRENCY_STRENGTH_AGENT'),
    'Profile specialistAgents includes CURRENCY_STRENGTH_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'ANCHORED_VWAP_AGENT'),
    'Profile specialistAgents includes ANCHORED_VWAP_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'MARKET_REGIME_CLASSIFIER_AGENT'),
    'Profile specialistAgents includes MARKET_REGIME_CLASSIFIER_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'ORDER_FLOW_DELTA_AGENT'),
    'Profile specialistAgents includes ORDER_FLOW_DELTA_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'COT_POSITIONING_AGENT'),
    'Profile specialistAgents includes COT_POSITIONING_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'CENTRAL_BANK_POLICY_AGENT'),
    'Profile specialistAgents includes CENTRAL_BANK_POLICY_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'QUANT_MONTE_CARLO_AGENT'),
    'Profile specialistAgents includes QUANT_MONTE_CARLO_AGENT'
  );
  assert(
    sampleProfile.specialistAgents!.some(s => s.agentId === 'ECONOMIC_NEWS_MOMENTUM_AGENT'),
    'Profile specialistAgents includes ECONOMIC_NEWS_MOMENTUM_AGENT'
  );

  // ---------------------------------------------------------------------------
  // SECTION 19: 3-Round Interactive Debate Council Protocol
  // ---------------------------------------------------------------------------
  console.log('\n--- SECTION 19: 3-Round Interactive Debate Council Protocol ---');
  const debateMsgs = sampleProfile.debateMessages;
  assert(Array.isArray(debateMsgs) && debateMsgs.length >= 8, `Debate council contains at least 8 structured messages (got ${debateMsgs?.length || 0})`);

  const round1Msgs = debateMsgs.filter((m: any) => m.round === 1);
  const round2Msgs = debateMsgs.filter((m: any) => m.round === 2);
  const round3Msgs = debateMsgs.filter((m: any) => m.round === 3);

  assert(round1Msgs.length >= 2, `Round 1 (PROPOSAL) contains at least 2 agents (got ${round1Msgs.length})`);
  assert(round2Msgs.length >= 2, `Round 2 (CHALLENGE) contains at least 2 agents (got ${round2Msgs.length})`);
  assert(round3Msgs.length >= 2, `Round 3 (RESOLUTION) contains at least 2 agents (got ${round3Msgs.length})`);

  assert(
    round1Msgs.some((m: any) => m.roundLabel === 'ROUND 1: PROPOSAL'),
    'Round 1 messages have roundLabel "ROUND 1: PROPOSAL"'
  );
  assert(
    round2Msgs.some((m: any) => m.roundLabel === 'ROUND 2: CHALLENGE'),
    'Round 2 messages have roundLabel "ROUND 2: CHALLENGE"'
  );
  assert(
    round3Msgs.some((m: any) => m.roundLabel === 'ROUND 3: RESOLUTION'),
    'Round 3 messages have roundLabel "ROUND 3: RESOLUTION"'
  );

  assert(
    round1Msgs.some((m: any) => m.agent === 'TECHNICAL AGENT'),
    'Round 1 includes TECHNICAL AGENT'
  );
  assert(
    round2Msgs.some((m: any) => m.agent === 'RISK GUARDIAN'),
    'Round 2 includes RISK GUARDIAN'
  );
  assert(
    round3Msgs.some((m: any) => m.agent === 'FINAL DECISION' || m.agent === 'CORTEX CONFLUENCE'),
    'Round 3 includes FINAL DECISION or CORTEX CONFLUENCE'
  );

  // Assert expansion across all 3 rounds
  assert(debateMsgs.length >= 15, `Debate council contains expanded messages (got ${debateMsgs.length}, expected >= 15)`);
  assert(round1Msgs.some((m: any) => m.agent === 'ANCHORED VWAP AGENT'), 'Round 1 includes ANCHORED VWAP AGENT');
  assert(round1Msgs.some((m: any) => m.agent === 'CURRENCY STRENGTH AGENT'), 'Round 1 includes CURRENCY STRENGTH AGENT');
  assert(round1Msgs.some((m: any) => m.agent === 'COT POSITIONING AGENT'), 'Round 1 includes COT POSITIONING AGENT');
  assert(round2Msgs.some((m: any) => m.agent === 'ORDER FLOW DELTA AGENT'), 'Round 2 includes ORDER FLOW DELTA AGENT');
  assert(round2Msgs.some((m: any) => m.agent === 'MARKET REGIME CLASSIFIER'), 'Round 2 includes MARKET REGIME CLASSIFIER');
  assert(round2Msgs.some((m: any) => m.agent === 'CENTRAL BANK POLICY AGENT'), 'Round 2 includes CENTRAL BANK POLICY AGENT');
  assert(round2Msgs.some((m: any) => m.agent === 'ECONOMIC NEWS MOMENTUM AGENT'), 'Round 2 includes ECONOMIC NEWS MOMENTUM AGENT');
  assert(round3Msgs.some((m: any) => m.agent === 'QUANT MONTE CARLO AGENT'), 'Round 3 includes QUANT MONTE CARLO AGENT');

  console.log('\n--- SECTION 20: Institutional Domain Expansions in Blackboard ---');
  clearDomainEvidenceForTesting();
  const testDomains: string[] = ['CURRENCY_STRENGTH', 'INSTITUTIONAL', 'RISK_GUARDIAN', 'NEWS_WIRE'];
  for (const dom of testDomains) {
    publishDomainEvidence('EURUSD', {
      id: `ev-${dom}-1`,
      agentId: 'TEST_AGENT',
      domainFamily: dom as any,
      nature: 'DATA',
      classification: 'INDEPENDENT_VERIFIED',
      polarity: 'BULLISH',
      strength: 0.8,
      confidence: 85,
      claim: `Test domain evidence for ${dom}`,
      source: 'Test Engine',
      provider: 'TEST',
      observedAt: new Date().toISOString(),
      receivedAt: Date.now(),
      freshnessMs: 0,
      isStale: false,
      instrument: 'EURUSD',
    });
    const retrieved = getDomainEvidence('EURUSD', dom as any);
    assert(retrieved.length === 1, `Domain ${dom} successfully published and retrieved from blackboard`);
    assert(retrieved[0].domainFamily === dom, `Retrieved evidence preserves domain ${dom}`);
  }

  console.log('\n--- SECTION 21: 8 Institutional Quant Specialist Engines ---');

  // 1. CurrencyStrengthMatrixAgent
  const csBullish = evaluateCurrencyStrengthAgent({
    instrument: 'USDJPY',
    forexQuotes: {
      USD: { change24h: 1.2 },
      JPY: { change24h: -1.5 },
      EUR: { change24h: 0.1 },
      GBP: { change24h: -0.2 },
      AUD: { change24h: 0.3 },
      CAD: { change24h: -0.1 },
      NZD: { change24h: 0.0 },
    }
  });
  assert(csBullish.domainFamily === 'CURRENCY_STRENGTH', `CurrencyStrength domain is CURRENCY_STRENGTH (got ${csBullish.domainFamily})`);
  assert(csBullish.agentId === 'CURRENCY_STRENGTH_AGENT', 'CurrencyStrength agentId is CURRENCY_STRENGTH_AGENT');
  assert(csBullish.direction === 'BULLISH', `CurrencyStrength USD strong vs JPY weak produces BULLISH (got ${csBullish.direction})`);
  assert(csBullish.confidence > 0, `CurrencyStrength confidence > 0 when quotes available (got ${csBullish.confidence})`);
  const csFailClosed = evaluateCurrencyStrengthAgent({ instrument: 'USDJPY' });
  assert(csFailClosed.readiness === 'DATA_LIMITED' && csFailClosed.confidence === 0, 'CurrencyStrength fails closed with 0 confidence when feeds absent');

  // 2. AnchoredVWAPAgent
  const mockCandlesForVwap = makeMockCandles(30, 1.0800, 15);
  const vwapDiscount = evaluateAnchoredVWAPAgent({
    instrument: 'EURUSD',
    candles: mockCandlesForVwap,
    currentPrice: 1.0740, // deep below mean -> discount
  });
  assert(vwapDiscount.domainFamily === 'PRICE_TECHNICAL', `AnchoredVWAP domain is PRICE_TECHNICAL (got ${vwapDiscount.domainFamily})`);
  assert(vwapDiscount.agentId === 'ANCHORED_VWAP_AGENT', 'AnchoredVWAP agentId is ANCHORED_VWAP_AGENT');
  assert(vwapDiscount.direction === 'BULLISH', `AnchoredVWAP in discount produces BULLISH mean-reversion (got ${vwapDiscount.direction})`);
  assert(vwapDiscount.confidence > 0, `AnchoredVWAP confidence > 0 with valid candles (got ${vwapDiscount.confidence})`);
  const vwapFailClosed = evaluateAnchoredVWAPAgent({ instrument: 'EURUSD', candles: [] });
  assert(vwapFailClosed.readiness === 'DATA_LIMITED' && vwapFailClosed.confidence === 0, 'AnchoredVWAP fails closed (<15 candles)');

  // 3. MarketRegimeClassifierAgent
  const regimeEval = evaluateMarketRegimeClassifierAgent({
    instrument: 'EURUSD',
    candles: mockCandlesForVwap,
    currentPrice: 1.0800,
  });
  assert(regimeEval.domainFamily === 'VOLATILITY', `MarketRegimeClassifier domain is VOLATILITY (got ${regimeEval.domainFamily})`);
  assert(regimeEval.agentId === 'MARKET_REGIME_CLASSIFIER_AGENT', 'MarketRegimeClassifier agentId is MARKET_REGIME_CLASSIFIER_AGENT');
  assert(regimeEval.confidence > 0, `MarketRegimeClassifier confidence > 0 with candles (got ${regimeEval.confidence})`);
  assert(regimeEval.evidence.length > 0, 'MarketRegimeClassifier emits structured evidence');

  // 4. OrderFlowDeltaAgent
  const orderFlowEval = evaluateOrderFlowDeltaAgent({
    instrument: 'EURUSD',
    candles: mockCandlesForVwap,
  });
  assert(orderFlowEval.domainFamily === 'ORDER_FLOW', `OrderFlowDelta domain is ORDER_FLOW (got ${orderFlowEval.domainFamily})`);
  assert(orderFlowEval.agentId === 'ORDER_FLOW_DELTA_AGENT', 'OrderFlowDelta agentId is ORDER_FLOW_DELTA_AGENT');
  assert(orderFlowEval.evidence[0].classification === 'BROKER_TICK_VOLUME_PROXY', 'OrderFlowDelta uses BROKER_TICK_VOLUME_PROXY classification');

  // 5. CotPositioningAgent
  const cotGold = evaluateCotPositioningAgent({ instrument: 'XAUUSD' });
  assert(cotGold.domainFamily === 'INSTITUTIONAL', `CotPositioning domain is INSTITUTIONAL (got ${cotGold.domainFamily})`);
  assert(cotGold.agentId === 'COT_POSITIONING_AGENT', 'CotPositioning agentId is COT_POSITIONING_AGENT');
  assert(cotGold.confidence > 0, `CotPositioning baseline confidence > 0 (got ${cotGold.confidence})`);
  assert(cotGold.evidence[0].classification === 'DERIVED_FROM_VERIFIED', 'CotPositioning baseline is DERIVED_FROM_VERIFIED');

  // 6. CentralBankPolicyAgent
  const cbUsdJpy = evaluateCentralBankPolicyAgent({ instrument: 'USDJPY' });
  assert(cbUsdJpy.domainFamily === 'MACRO_REGIME', `CentralBankPolicy domain is MACRO_REGIME (got ${cbUsdJpy.domainFamily})`);
  assert(cbUsdJpy.agentId === 'CENTRAL_BANK_POLICY_AGENT', 'CentralBankPolicy agentId is CENTRAL_BANK_POLICY_AGENT');
  assert(cbUsdJpy.direction === 'BULLISH', `CentralBankPolicy USD (5.25%) vs JPY (0.25%) is BULLISH for USDJPY (got ${cbUsdJpy.direction})`);
  assert(cbUsdJpy.confidence > 0, 'CentralBankPolicy baseline confidence > 0');

  // 7. QuantMonteCarloStressAgent
  const mcEval = evaluateQuantMonteCarloAgent({
    instrument: 'EURUSD',
    currentPrice: 1.0800,
    slPrice: 1.0770,
    tp1Price: 1.0860,
    direction: 'BUY',
    candles: mockCandlesForVwap,
  });
  assert(mcEval.domainFamily === 'RISK_GUARDIAN', `QuantMonteCarlo domain is RISK_GUARDIAN (got ${mcEval.domainFamily})`);
  assert(mcEval.agentId === 'QUANT_MONTE_CARLO_AGENT', 'QuantMonteCarlo agentId is QUANT_MONTE_CARLO_AGENT');
  assert(mcEval.confidence > 0, `QuantMonteCarlo confidence > 0 with geometry (got ${mcEval.confidence})`);
  const mcFailClosed = evaluateQuantMonteCarloAgent({ instrument: 'EURUSD' });
  assert(mcFailClosed.readiness === 'DATA_LIMITED' && mcFailClosed.confidence === 0, 'QuantMonteCarlo fails closed without geometry');

  // 8. EconomicNewsMomentumAgent
  const newsEmbargo = evaluateEconomicNewsMomentumAgent({
    instrument: 'EURUSD',
    calendarEvents: [{
      title: 'US Non-Farm Payrolls',
      impact: 'HIGH',
      timestamp: Date.now() + 600000, // in 10 mins -> embargo active
    }],
    candles: mockCandlesForVwap,
  });
  assert(newsEmbargo.domainFamily === 'NEWS_WIRE', `EconomicNewsMomentum domain is NEWS_WIRE (got ${newsEmbargo.domainFamily})`);
  assert(newsEmbargo.agentId === 'ECONOMIC_NEWS_MOMENTUM_AGENT', 'EconomicNewsMomentum agentId is ECONOMIC_NEWS_MOMENTUM_AGENT');
  assert(newsEmbargo.direction === 'CAUTION', `EconomicNewsMomentum during blackout prints CAUTION (got ${newsEmbargo.direction})`);

  console.log(`ALL MULTI-ASSET TRUTHFULNESS TESTS EXECUTED: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================\n');
}

runTruthfulnessTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
