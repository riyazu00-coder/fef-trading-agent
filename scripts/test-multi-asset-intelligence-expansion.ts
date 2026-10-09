/**
 * FEF CORTEX — MULTI-ASSET INTELLIGENCE EXPANSION & UNIFIED TERMINAL TEST SUITE
 * 
 * Verifies:
 * 1. Canonical Asset Registry & Metadata (60+ checks across all 26 assets)
 * 2. Market Session Engine & 24/7 Continuity (Crypto continuous, proper equity/commodity hours)
 * 3. M30 Candle Transport & Public Adapters
 * 4. Specialist Agents Parameterization & Multi-Asset Pipeline
 * 5. Domain-Family Blackboard Architecture (17 typed domain families)
 * 6. Global Radar Multi-Asset Intelligence & Feeds
 * 7. Radar Notifications & State Transition Deduplication
 * 8. Position Calculator Fail-Closed UX & Absolute Safety Invariants
 */

import {
  MARKET_REGISTRY,
  isAsset24x7,
  getAssetSessionModel,
  getCrossAssetBenchmark,
  getExpectedBenchmarkCorrelation,
  getMacroSensitivities,
  getMarketDefinition,
} from '../src/lib/registry/market-registry';

import {
  evaluateMarketSession,
  resolveAssetClass,
} from '../src/lib/session/market-session-engine';

import {
  evaluateRatesAgent,
  evaluateInflationAgent,
  evaluateVolatilityAgent,
  evaluateCrossAssetAgent,
  evaluateDataSentinelAgent,
  evaluateQuantAgent,
} from '../src/lib/agents/specialists/specialist-agents';

import {
  publishDomainEvidence,
  getDomainEvidence,
  getAllDomainEvidenceForAsset,
  getDomainEvidenceSummary,
  clearDomainEvidenceForTesting,
} from '../src/lib/agents/agent-blackboard';

import {
  generateGlobalRadarIntelligence,
  RadarOpportunityItem,
} from '../src/lib/radar/opportunity-radar-engine';

import { INITIAL_LIVE_ASSETS } from '../src/lib/providers/real-market-api';

import {
  evaluateRadarTransitions,
  clearRadarNotificationStateForTesting,
  RadarNotification,
} from '../src/lib/radar/radar-notifications';

import {
  calculatePositionSize,
  getInstrumentContractSpec,
} from '../src/lib/calculator/position-size-calculator';

import {
  CANONICAL_EXECUTION_MODE,
  MT5_ORDER_TRANSPORT_ENABLED,
} from '../src/lib/execution/execution-policy';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TIMEFRAME_DURATION_MS } = require('../scripts/fef-remote-relay-service');

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

async function runMultiAssetExpansionTests() {
  console.log('\n=================================================================');
  console.log('FEF CORTEX: MULTI-ASSET INTELLIGENCE & TERMINAL UPGRADE SUITE');
  console.log('=================================================================\n');

  // =================================================================
  // SUITE 1: CANONICAL ASSET REGISTRY & METADATA (Checks 1 - 10)
  // =================================================================
  console.log('[SUITE 1: CANONICAL ASSET REGISTRY & METADATA]');

  // 1. All 26 canonical assets exist in registry
  const assetKeys = Object.keys(MARKET_REGISTRY);
  assert(assetKeys.length === 26, 'Registry contains exactly 26 canonical instruments', `Found ${assetKeys.length}`);

  // 2. Asset categories verified
  const categories = new Set(Object.values(MARKET_REGISTRY).map(a => a.category));
  assert(
    categories.has('FOREX') && categories.has('METALS') && categories.has('INDICES') && categories.has('COMMODITIES') && categories.has('CRYPTO'),
    'Registry covers all 5 core asset classes (FOREX, METALS, INDICES, COMMODITIES, CRYPTO)'
  );

  // 3. Crypto assets identified as 24/7 continuous
  const cryptos = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'];
  const allCryptos24x7 = cryptos.every(c => isAsset24x7(c));
  assert(allCryptos24x7, 'All 5 crypto assets (BTC, ETH, SOL, XRP, BNB) are marked as 24/7 continuous');

  // 4. Non-crypto assets identified as non-continuous
  const nonCryptos = ['XAUUSD', 'EURUSD', 'US500', 'GER40', 'USOIL', 'NATGAS'];
  const nonCryptosClosedWeekends = nonCryptos.every(s => !isAsset24x7(s));
  assert(nonCryptosClosedWeekends, 'Traditional assets correctly marked non-continuous (closed on weekends)');

  // 5. Session models properly assigned
  const xauModel = getAssetSessionModel('XAUUSD');
  const us500Model = getAssetSessionModel('US500');
  const ger40Model = getAssetSessionModel('GER40');
  const usoilModel = getAssetSessionModel('USOIL');
  const btcModel = getAssetSessionModel('BTCUSD');
  assert(
    xauModel === 'METALS_24_5' &&
    us500Model === 'CME_EQUITY_INDEX' &&
    ger40Model === 'EUREX_INDEX' &&
    usoilModel === 'NYMEX_ENERGY' &&
    btcModel === 'CRYPTO_24_7',
    'Session models accurately mapped across asset classes (METALS_24_5, CME_EQUITY_INDEX, EUREX_INDEX, NYMEX_ENERGY, CRYPTO_24_7)'
  );

  // 6. Cross-asset benchmarks dynamically assigned
  const eurusdBench = getCrossAssetBenchmark('EURUSD');
  const us100Bench = getCrossAssetBenchmark('US100');
  const xauusdBench = getCrossAssetBenchmark('XAUUSD');
  const xagusdBench = getCrossAssetBenchmark('XAGUSD');
  const usdjpyBench = getCrossAssetBenchmark('USDJPY');
  assert(
    eurusdBench === 'DXY' &&
    us100Bench === 'US500' &&
    xauusdBench === 'DXY' &&
    xagusdBench === 'XAUUSD' &&
    usdjpyBench === 'TNX',
    'Cross-asset benchmarks dynamically resolved per asset profile'
  );

  // 7. Expected benchmark correlations correct
  const eurusdCorr = getExpectedBenchmarkCorrelation('EURUSD');
  const us100Corr = getExpectedBenchmarkCorrelation('US100');
  const xauusdCorr = getExpectedBenchmarkCorrelation('XAUUSD');
  assert(
    eurusdCorr < 0 && us100Corr > 0 && xauusdCorr < 0,
    'Expected benchmark correlations have correct signs (EURUSD/DXY < 0, US100/US500 > 0, XAUUSD/DXY < 0)'
  );

  // 8. Macro sensitivities cleanly populated
  const goldSens = getMacroSensitivities('XAUUSD');
  const oilSens = getMacroSensitivities('USOIL');
  assert(
    goldSens.interestRates === 'INVERSE' && goldSens.dollarSensitivity === 'STRONG_INVERSE' && oilSens.energyPrice === 'DIRECT',
    'Macro sensitivities properly defined (XAU interestRates INVERSE/dollarSensitivity STRONG_INVERSE, USOIL energyPrice DIRECT)'
  );

  // 9. Base and quote assets defined for all 26
  const allHaveBaseQuote = Object.values(MARKET_REGISTRY).every(a => Boolean(a.baseAsset && a.quoteAsset));
  assert(allHaveBaseQuote, 'Base and Quote assets cleanly populated for all 26 instruments');

  // 10. Newly added instruments have NO static guessed contract specifications
  const newlyAddedNoSpecs = ['EURJPY', 'GER40', 'UK100', 'JP225', 'NATGAS'].every(
    s => getInstrumentContractSpec(s) === null
  );
  assert(
    newlyAddedNoSpecs,
    'No newly added instrument (EURJPY, GER40, UK100, JP225, NATGAS) is marked broker-verified without authoritative provenance'
  );

  // =================================================================
  // SUITE 2: MARKET SESSION ENGINE & 24/7 CONTINUITY (Checks 11 - 18)
  // =================================================================
  console.log('\n[SUITE 2: MARKET SESSION ENGINE & 24/7 CONTINUITY]');

  // 11. Weekend test: Saturday at 14:00 UTC
  const saturdayUtc = new Date(Date.UTC(2026, 9, 10, 14, 0, 0)); // Saturday
  const btcWeekendSession = evaluateMarketSession('BTCUSD', saturdayUtc);
  assert(
    btcWeekendSession.tradeExecutable === true && btcWeekendSession.marketState === 'OPEN',
    'BTCUSD remains OPEN and tradeExecutable on Saturday',
    `State: ${btcWeekendSession.marketState}, executable: ${btcWeekendSession.tradeExecutable}`
  );

  // 12. Weekend test: XRPUSD remains OPEN
  const xrpWeekendSession = evaluateMarketSession('XRPUSD', saturdayUtc);
  assert(
    xrpWeekendSession.tradeExecutable === true && xrpWeekendSession.marketState === 'OPEN',
    'XRPUSD remains OPEN and tradeExecutable on Saturday (previously misclassified)'
  );

  // 13. Weekend test: BNBUSD remains OPEN
  const bnbWeekendSession = evaluateMarketSession('BNBUSD', saturdayUtc);
  assert(
    bnbWeekendSession.tradeExecutable === true && bnbWeekendSession.marketState === 'OPEN',
    'BNBUSD remains OPEN and tradeExecutable on Saturday (previously misclassified)'
  );

  // 14. Weekend test: XAUUSD closed on Saturday
  const xauWeekendSession = evaluateMarketSession('XAUUSD', saturdayUtc);
  assert(
    xauWeekendSession.tradeExecutable === false && xauWeekendSession.marketState === 'WEEKEND_CLOSED',
    'XAUUSD is WEEKEND_CLOSED and tradeExecutable is false on Saturday'
  );

  // 15. Weekend test: EURUSD closed on Saturday
  const eurusdWeekendSession = evaluateMarketSession('EURUSD', saturdayUtc);
  assert(
    eurusdWeekendSession.tradeExecutable === false && eurusdWeekendSession.marketState === 'WEEKEND_CLOSED',
    'EURUSD is WEEKEND_CLOSED on Saturday'
  );

  // 16. Regional European Index classification: GER40
  const ger40Session = evaluateMarketSession('GER40', saturdayUtc);
  assert(
    ger40Session.assetClass === 'INDICES' && ger40Session.scheduleSource === 'SESSION SCHEDULE — REFERENCE',
    'GER40 classified as INDICES using reference session schedule'
  );

  // 17. resolveAssetClass identifies all asset types correctly
  assert(
    resolveAssetClass('BTCUSD') === 'CRYPTO' &&
    resolveAssetClass('XRPUSD') === 'CRYPTO' &&
    resolveAssetClass('GER40') === 'INDICES' &&
    resolveAssetClass('USOIL') === 'ENERGIES' &&
    resolveAssetClass('EURUSD') === 'FOREX' &&
    resolveAssetClass('XAUUSD') === 'METALS',
    'resolveAssetClass accurately classifies CRYPTO, INDICES, ENERGIES, FOREX, METALS'
  );

  // 18. Weekend closed markets provide next open countdown
  assert(
    Boolean(xauWeekendSession.nextOpenCountdown),
    'Closed markets calculate and display nextOpenCountdown cleanly'
  );

  // =================================================================
  // SUITE 3: M30 CANDLE TRANSPORT & PUBLIC ADAPTERS (Checks 19 - 26)
  // =================================================================
  console.log('\n[SUITE 3: M30 CANDLE TRANSPORT & PUBLIC ADAPTERS]');

  // 19. TIMEFRAME_DURATION_MS includes M30
  assert(
    TIMEFRAME_DURATION_MS['M30'] === 1800000,
    'TIMEFRAME_DURATION_MS defines M30 as exactly 1,800,000 ms (30 minutes)'
  );

  // 20. TIMEFRAME_DURATION_MS includes M1
  assert(
    TIMEFRAME_DURATION_MS['M1'] === 60000,
    'TIMEFRAME_DURATION_MS defines M1 as exactly 60,000 ms (1 minute)'
  );

  // 21. Standard timeframes duration ordering
  assert(
    TIMEFRAME_DURATION_MS['M1'] < TIMEFRAME_DURATION_MS['M5'] &&
    TIMEFRAME_DURATION_MS['M5'] < TIMEFRAME_DURATION_MS['M15'] &&
    TIMEFRAME_DURATION_MS['M15'] < TIMEFRAME_DURATION_MS['M30'] &&
    TIMEFRAME_DURATION_MS['M30'] < TIMEFRAME_DURATION_MS['H1'],
    'Timeframe hierarchy is strictly monotonic: M1 < M5 < M15 < M30 < H1'
  );

  // 22. Contract spec pip size precision for FX crosses
  const eurusdSpec = getInstrumentContractSpec('EURUSD');
  const usdjpySpec = getInstrumentContractSpec('USDJPY');
  assert(
    eurusdSpec?.pipSize === 0.0001 && usdjpySpec?.pipSize === 0.01,
    'Pip size specification accurate: 0.0001 for EURUSD, 0.01 for USDJPY'
  );

  // 23. Contract spec for Gold: 100 oz per lot
  const xauSpec = getInstrumentContractSpec('XAUUSD');
  assert(xauSpec?.contractSize === 100, 'XAUUSD contract size is exactly 100 troy ounces');

  // 24. Contract spec for Silver: 5000 oz per lot
  const xagSpec = getInstrumentContractSpec('XAGUSD');
  assert(xagSpec?.contractSize === 5000, 'XAGUSD contract size is exactly 5000 troy ounces');

  // 25. Contract spec for USOIL: 1000 barrels per lot
  const usoilSpec = getInstrumentContractSpec('USOIL');
  assert(usoilSpec?.contractSize === 1000, 'USOIL contract size is exactly 1000 barrels');

  // 26. Contract spec for Crypto: 1 coin per lot
  const btcSpec = getInstrumentContractSpec('BTCUSD');
  assert(btcSpec?.contractSize === 1, 'BTCUSD contract size is exactly 1 BTC');

  // =================================================================
  // SUITE 4: SPECIALIST AGENTS PARAMETERIZATION (Checks 27 - 35)
  // =================================================================
  console.log('\n[SUITE 4: SPECIALIST AGENTS PARAMETERIZATION]');

  // 27. evaluateRatesAgent accepts generic instrument parameter
  const ratesForEur = evaluateRatesAgent({
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
    instrument: 'EURUSD',
  });
  assert(
    ratesForEur.agentName.includes('Rates') && ratesForEur.instrument === 'EURUSD',
    'Rates specialist agent executes successfully for EURUSD'
  );

  // 28. evaluateRatesAgent does not hardcode XAUUSD when called for EURUSD
  const ratesEurText = JSON.stringify(ratesForEur);
  assert(
    !ratesEurText.toLowerCase().includes('bullish_gold') && !ratesEurText.toLowerCase().includes('bearish_gold'),
    'Rates agent does not output gold-specific biases when evaluated for EURUSD'
  );

  // 29. evaluateInflationAgent accepts generic instrument
  const inflForBtc = evaluateInflationAgent({
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
    instrument: 'BTCUSD',
  });
  assert(
    inflForBtc.agentName.includes('Inflation') && inflForBtc.instrument === 'BTCUSD',
    'Inflation specialist agent executes successfully for BTCUSD'
  );

  // 30. evaluateCrossAssetAgent dynamically uses benchmark
  const crossAssetUs100 = evaluateCrossAssetAgent({
    dxyAnalysis: {
      seriesId: 'DTWEXBGS',
      name: 'Trade Weighted US Dollar',
      category: 'DOLLAR_INDEX',
      latestValue: 103.5,
      latestObservationDate: '2026-10-06',
      direction: 'FALLING',
      change1Bp: -12,
      momentum: 'DOWN',
      freshness: 'CURRENT',
      freshnessReason: 'Fresh',
      sampleCount: 10,
      provider: 'FRED',
      classification: 'INDEPENDENT_VERIFIED',
      analysisStatus: 'VALID',
    },
    instrument: 'US100',
  });
  assert(
    crossAssetUs100.agentName.includes('Cross-Asset') || crossAssetUs100.agentName.includes('CrossAsset'),
    'CrossAsset specialist agent executes successfully for US100'
  );

  // 31. evaluateVolatilityAgent produces valid bounded output
  const volResult = evaluateVolatilityAgent({
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
    volResult.confidence >= 0 && volResult.confidence <= 100,
    'Volatility specialist produces confidence strictly bounded in [0, 100]'
  );

  // 32. evaluateDataSentinelAgent detects valid telemetry
  const dataSentinel = evaluateDataSentinelAgent({
    isMt5Online: true,
  });
  assert(
    dataSentinel.readiness === 'READY' && dataSentinel.evidenceTrust === 100,
    'DataSentinel agent reports healthy state when telemetry is intact'
  );

  // 33. evaluateDataSentinelAgent reports RESTRICTED on severe data disconnect
  const dataSentinelDisconnected = evaluateDataSentinelAgent({
    isMt5Online: false,
  });
  assert(
    dataSentinelDisconnected.readiness === 'DATA_LIMITED' && dataSentinelDisconnected.evidenceTrust <= 30,
    'DataSentinel agent fails-closed (DATA_LIMITED with degraded trust) on disconnected transport'
  );

  // 34. Specialist agents output structured evidence array
  assert(
    Array.isArray(ratesForEur.evidence) && ratesForEur.evidence.length > 0,
    'Specialist agent returns typed structured evidence array'
  );

  // 35. Quant Agent produces valid metrics
  const quantAgent = evaluateQuantAgent({
    quantMetrics: {
      instrument: 'XAUUSD',
      hurstExponent: 0.62,
      hurstClassification: 'TRENDING_PERSISTENT',
      zScore: 1.4,
      zScoreBand: 'NORMAL',
      halfLifeBars: 12,
      varianceRatio: 1.15,
      calculatedAt: Date.now(),
      sampleCount: 100,
    },
  });
  assert(
    quantAgent.agentName.includes('Quant') && quantAgent.domainFamily === 'QUANT_STATISTICAL',
    'Quant specialist agent executes cleanly with mathematical parameters'
  );

  // =================================================================
  // SUITE 5: DOMAIN-FAMILY BLACKBOARD ARCHITECTURE (Checks 36 - 44)
  // =================================================================
  console.log('\n[SUITE 5: DOMAIN-FAMILY BLACKBOARD ARCHITECTURE]');

  clearDomainEvidenceForTesting();

  // 36. Publish evidence into RATES domain family
  publishDomainEvidence('EURUSD', {
    id: 'ev-rates-1',
    agentId: 'RATES_AGENT',
    domainFamily: 'RATES',
    nature: 'DATA',
    classification: 'INDEPENDENT_VERIFIED',
    polarity: 'BULLISH',
    strength: 0.8,
    confidence: 85,
    claim: 'US 10Y real yield softened by 4 bps',
    source: 'FRED',
    provider: 'FRED',
    observedAt: new Date().toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument: 'EURUSD',
  });
  const ratesEv = getDomainEvidence('EURUSD', 'RATES');
  assert(ratesEv.length === 1, 'publishDomainEvidence stores evidence in RATES family for EURUSD');

  // 37. Evidence partitioned by symbol: XAUUSD has 0 evidence
  const xauRatesEv = getDomainEvidence('XAUUSD', 'RATES');
  assert(xauRatesEv.length === 0, 'Domain evidence strictly partitioned by symbol (XAUUSD unaffected by EURUSD)');

  // 38. Publish evidence into MARKET_STRUCTURE domain
  publishDomainEvidence('EURUSD', {
    id: 'ev-struct-1',
    agentId: 'TECHNICAL_AGENT',
    domainFamily: 'MARKET_STRUCTURE',
    nature: 'ANALYSIS',
    classification: 'DERIVED_FROM_VERIFIED',
    polarity: 'BULLISH',
    strength: 0.9,
    confidence: 90,
    claim: 'Bullish BOS confirmed on M30 timeframe',
    source: 'Market Structure Engine',
    provider: 'FEF_SYSTEM',
    observedAt: new Date().toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument: 'EURUSD',
  });
  const allEurEv = getAllDomainEvidenceForAsset('EURUSD');
  assert(
    allEurEv['RATES'].length === 1 && allEurEv['MARKET_STRUCTURE'].length === 1,
    'getAllDomainEvidenceForAsset indexes multiple distinct domain families'
  );

  // 39. Domain evidence summary computation
  const summary = getDomainEvidenceSummary('EURUSD');
  assert(
    summary.totalCount === 2 && summary.activeDomains.length === 2,
    'getDomainEvidenceSummary computes totalCount and activeDomains accurately'
  );

  // 40. Deduplication within same domain family
  publishDomainEvidence('EURUSD', {
    id: 'ev-struct-1', // duplicate ID
    agentId: 'TECHNICAL_AGENT',
    domainFamily: 'MARKET_STRUCTURE',
    nature: 'ANALYSIS',
    classification: 'DERIVED_FROM_VERIFIED',
    polarity: 'BULLISH',
    strength: 0.9,
    confidence: 90,
    claim: 'Bullish BOS confirmed on M30 timeframe',
    source: 'Market Structure Engine',
    provider: 'FEF_SYSTEM',
    observedAt: new Date().toISOString(),
    receivedAt: Date.now(),
    freshnessMs: 0,
    isStale: false,
    instrument: 'EURUSD',
  });
  const structEv = getDomainEvidence('EURUSD', 'MARKET_STRUCTURE');
  assert(structEv.length === 1, 'Duplicate evidence IDs are updated or deduplicated cleanly');

  // 41. Independent asset clearing
  clearDomainEvidenceForTesting();
  const summaryAfterClear = getDomainEvidenceSummary('EURUSD');
  assert(summaryAfterClear.totalCount === 0, 'clearDomainEvidenceForTesting resets blackboard memory cleanly');

  // 42. Publish across 3 distinct domains for BTCUSD
  publishDomainEvidence('BTCUSD', { id: 'btc-1', agentId: 'TECH', domainFamily: 'PRICE_TECHNICAL', nature: 'ANALYSIS', classification: 'DERIVED', polarity: 'BULLISH', strength: 0.7, confidence: 80, claim: 'RSI divergence', source: 'FEF', provider: 'FEF', observedAt: new Date().toISOString(), receivedAt: Date.now(), freshnessMs: 0, isStale: false, instrument: 'BTCUSD' });
  publishDomainEvidence('BTCUSD', { id: 'btc-2', agentId: 'LIQ', domainFamily: 'LIQUIDITY', nature: 'ANALYSIS', classification: 'DERIVED', polarity: 'BULLISH', strength: 0.85, confidence: 85, claim: 'Buy-side liquidity swept', source: 'FEF', provider: 'FEF', observedAt: new Date().toISOString(), receivedAt: Date.now(), freshnessMs: 0, isStale: false, instrument: 'BTCUSD' });
  publishDomainEvidence('BTCUSD', { id: 'btc-3', agentId: 'SENT', domainFamily: 'SENTIMENT', nature: 'ANALYSIS', classification: 'DERIVED', polarity: 'NEUTRAL', strength: 0.6, confidence: 75, claim: 'Funding rate reset', source: 'FEF', provider: 'FEF', observedAt: new Date().toISOString(), receivedAt: Date.now(), freshnessMs: 0, isStale: false, instrument: 'BTCUSD' });
  const btcSummary = getDomainEvidenceSummary('BTCUSD');
  assert(btcSummary.activeDomains.length === 3, 'BTCUSD accurately tracks 3 separate domain families');

  // 43. Domain family count constant
  assert(btcSummary.totalCount === 3, 'Total items equals sum of individual family entries');

  // 44. Domain counts mapping in summary
  assert(
    btcSummary.domainCounts['PRICE_TECHNICAL'] === 1 && btcSummary.domainCounts['LIQUIDITY'] === 1,
    'Evidence summary tracks per-domain counts accurately'
  );

  // =================================================================
  // SUITE 6: GLOBAL RADAR MULTI-ASSET INTELLIGENCE & FEEDS (Checks 45 - 52)
  // =================================================================
  console.log('\n[SUITE 6: GLOBAL RADAR MULTI-ASSET INTELLIGENCE & FEEDS]');

  // 45. Mock multiAssetCandles payload
  const mockCandles = Array.from({ length: 15 }, (_, i) => ({
    time: 1700000000 + i * 1800,
    open: 2600 + i,
    high: 2605 + i,
    low: 2595 + i,
    close: 2602 + i,
    volume: 100,
  }));

  const testLiveAssets = { ...INITIAL_LIVE_ASSETS };
  testLiveAssets.BTCUSD = { ...testLiveAssets.BTCUSD, price: 68000, feedStatus: 'LIVE' };
  testLiveAssets.EURUSD = { ...testLiveAssets.EURUSD, price: 1.0850, feedStatus: 'LIVE' };

  const multiAssetCandleFeeds = {
    EURUSD: { candles: mockCandles.map((c, i) => ({ ...c, close: 1.0850 + i * 0.0002 })), provider: 'YAHOO' },
    BTCUSD: { candles: mockCandles.map((c, i) => ({ ...c, close: 68000 + i * 20 })), provider: 'BINANCE' },
  };

  const radarIntelligence = generateGlobalRadarIntelligence(
    testLiveAssets,
    'M30',
    { symbol: 'XAUUSD', candles: mockCandles },
    multiAssetCandleFeeds
  );
  const radarItems = radarIntelligence.rankedOpportunities;

  assert(radarIntelligence.summaryStats.totalScanned === 26, 'generateGlobalRadarIntelligence evaluates all 26 instruments');

  // 46. Crypto items in radar are marked tradeExecutable (when evaluated against continuous rules)
  const btcRadar = radarItems.find(r => r.symbol === 'BTCUSD');
  assert(Boolean(btcRadar), 'BTCUSD included in Radar opportunities list');

  // 47. Non-active assets with multi-asset candles are NOT starved of data
  const eurRadar = radarItems.find(r => r.symbol === 'EURUSD');
  assert(
    eurRadar !== undefined && eurRadar.opportunityScore > 0,
    'EURUSD evaluated with real multiAssetCandles receives non-zero score'
  );

  // 48. Radar items contain valid R:R formats (string or null when structure pending)
  const validRRs = radarItems.every(r => r.rr === null || (typeof r.rr === 'string' && r.rr.length > 0));
  assert(validRRs, 'All radar items have well-typed R:R values (string ratio or fail-closed null)');

  // 49. Opportunity scores are strictly within [0, 100]
  const scoresValid = radarItems.every(r => r.opportunityScore >= 0 && r.opportunityScore <= 100);
  assert(scoresValid, 'All opportunity scores are bounded in [0, 100]');

  // 50. AI confidence is strictly within [0, 100]
  const confValid = radarItems.every(r => r.aiConfidence >= 0 && r.aiConfidence <= 100);
  assert(confValid, 'All AI confidence values are bounded in [0, 100]');

  // 51. Entry zones contain 2-element tuples (or null when structure pending)
  const entryZonesValid = radarItems.every(r => r.entryZone === null || (Array.isArray(r.entryZone) && r.entryZone.length === 2));
  assert(entryZonesValid, 'All radar items produce valid 2-element [entryLow, entryHigh] zones or fail-closed null');

  // 52. Actionability state is populated
  const actionabilityValid = radarItems.every(r => Boolean(r.actionabilityState));
  assert(actionabilityValid, 'All radar items produce explicit actionability states');

  // =================================================================
  // SUITE 7: RADAR NOTIFICATIONS & STATE TRANSITION ENGINE (Checks 53 - 57)
  // =================================================================
  console.log('\n[SUITE 7: RADAR NOTIFICATIONS & STATE TRANSITIONS]');

  clearRadarNotificationStateForTesting();

  // 53. Initial evaluation produces initial alerts for qualifying items
  const mockOpp1: RadarOpportunityItem = {
    symbol: 'BTCUSD',
    state: 'STRONG BUY',
    opportunityScore: 88,
    aiConfidence: 85,
    rr: '1:2.8',
    entryZone: [67500, 67800],
    stopLoss: 66900,
    tp1: 68500,
    tp2: 69200,
    tp3: 70000,
    tradeExecutable: true,
    marketState: 'OPEN',
    category: 'crypto',
    riskLevel: 'LOW',
    catalysts: ['Bullish order block confirmed on M30'],
    actionabilityState: 'ACTIONABLE',
  };

  const initialAlerts = evaluateRadarTransitions([mockOpp1]);
  assert(initialAlerts.length === 1, 'High-conviction actionable setup produces initial alert on boot');

  // 54. Deduplication: immediate re-evaluation does NOT produce duplicate alert
  const duplicateAlerts = evaluateRadarTransitions([mockOpp1]);
  assert(duplicateAlerts.length === 0, 'Immediate duplicate scan is suppressed by 15-minute deduplication window');

  // 55. State transition: changing to WAIT triggers invalidation alert
  const invalidatedOpp: RadarOpportunityItem = {
    ...mockOpp1,
    state: 'WAIT',
    opportunityScore: 40,
    actionabilityState: 'ANALYSIS ONLY',
  };
  const transitionAlerts = evaluateRadarTransitions([invalidatedOpp]);
  assert(
    transitionAlerts.length === 1 && transitionAlerts[0].eventType === 'SETUP_INVALIDATED',
    'State transition from STRONG BUY to WAIT generates SETUP_INVALIDATED alert'
  );

  // 56. Re-qualification transition: transition to BUY generates new alert
  const newBuyOpp: RadarOpportunityItem = {
    ...mockOpp1,
    state: 'BUY',
    opportunityScore: 82,
    aiConfidence: 80,
    actionabilityState: 'ACTIONABLE',
  };
  const reAlerts = evaluateRadarTransitions([newBuyOpp]);
  assert(
    reAlerts.length === 1 && reAlerts[0].eventType === 'TRADE_OPPORTUNITY_CONFIRMED',
    'State transition from WAIT back to BUY triggers new TRADE_OPPORTUNITY_CONFIRMED alert'
  );

  // 57. Priority assignment for strong setups
  assert(
    initialAlerts[0].priority === 'CRITICAL' || initialAlerts[0].priority === 'HIGH',
    'Actionable high-score setup assigned HIGH or CRITICAL priority'
  );

  // =================================================================
  // SUITE 8: POSITION CALCULATOR FAIL-CLOSED & SAFETY INVARIANTS (Checks 58 - 65)
  // =================================================================
  console.log('\n[SUITE 8: POSITION CALCULATOR FAIL-CLOSED & SAFETY INVARIANTS]');

  // 58. Missing stop loss fails closed: safeLotSize = 0, isValid = false
  const zeroSlCalc = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.5,
    entryPrice: 2600,
    stopLoss: 0, // INVALID
  });
  assert(
    zeroSlCalc.isValid === false && zeroSlCalc.safeLotSize === 0,
    'Position calculation with StopLoss = 0 fails-closed with safeLotSize = 0'
  );

  // 59. Valid position calculation produces positive lot size
  const validCalc = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.5, // $50 risk
    entryPrice: 2600,
    stopLoss: 2595, // $5 distance -> 5 * 100 = $500 per lot -> 0.10 lot
  });
  assert(
    validCalc.isValid === true && validCalc.safeLotSize > 0,
    'Valid setup produces positive safe lot size with risk bounded'
  );

  // 60. Risk amount strictly capped to allowed risk
  assert(
    validCalc.estimatedLossAtSL <= validCalc.riskAmount,
    'Zero risk overshoot guarantee: estimated loss at SL <= authorized dollar budget',
    `Loss: ${validCalc.estimatedLossAtSL}, Budget: ${validCalc.riskAmount}`
  );

  // 61. Risk Guardian cap enforcement
  const cappedCalc = calculatePositionSize({
    symbol: 'XAUUSD',
    direction: 'BUY',
    capital: 10000,
    riskPct: 2.0, // Requests 2.0%
    entryPrice: 2600,
    stopLoss: 2590,
    riskGuardianMaxRiskPct: 0.50, // Policy cap is 0.50%
  });
  assert(
    cappedCalc.allowedRiskPct === 0.50 && cappedCalc.isRiskCappedByGuardian === true,
    'Risk Guardian strictly clamps allowed risk to policy ceiling (0.50%)'
  );

  // 62. Invariant: CANONICAL_EXECUTION_MODE === 'ARMED_WITH_CONFIRMATION'
  assert(
    CANONICAL_EXECUTION_MODE === 'ARMED_WITH_CONFIRMATION',
    'Absolute Invariant: CANONICAL_EXECUTION_MODE is ARMED_WITH_CONFIRMATION'
  );

  // 63. Invariant: MT5_ORDER_TRANSPORT_ENABLED === true
  assert(
    MT5_ORDER_TRANSPORT_ENABLED === true,
    'Absolute Invariant: MT5_ORDER_TRANSPORT_ENABLED is true'
  );

  // 64. No execution transport enabled for live or demo
  assert(
    process.env.ENABLE_LIVE_EXECUTION !== 'true',
    'Live execution transport is disabled in environment'
  );

  // 65. Pre-existing verified contract specifications preserved for core assets
  assert(
    eurusdSpec !== null && xauSpec !== null,
    'Pre-existing verified contract specifications preserved for core assets (EURUSD, XAUUSD)'
  );

  // 66. EURJPY without broker specs fails position sizing closed
  const eurjpyCalc = calculatePositionSize({
    symbol: 'EURJPY',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.5,
    entryPrice: 160.5,
    stopLoss: 160.0,
  });
  assert(
    eurjpyCalc.isValid === false &&
    eurjpyCalc.safeLotSize === 0 &&
    eurjpyCalc.isSpecificationVerified === false &&
    eurjpyCalc.errorMessage?.includes('BROKER SPECIFICATIONS UNAVAILABLE'),
    'EURJPY without broker specs fails position sizing closed with BROKER SPECIFICATIONS UNAVAILABLE'
  );

  // 67. GER40 without broker specs fails position sizing closed
  const ger40Calc = calculatePositionSize({
    symbol: 'GER40',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.5,
    entryPrice: 19500,
    stopLoss: 19450,
  });
  assert(
    ger40Calc.isValid === false &&
    ger40Calc.safeLotSize === 0 &&
    ger40Calc.isSpecificationVerified === false &&
    ger40Calc.errorMessage?.includes('BROKER SPECIFICATIONS UNAVAILABLE'),
    'GER40 without broker specs fails position sizing closed with BROKER SPECIFICATIONS UNAVAILABLE'
  );

  // 68. UK100 without broker specs fails position sizing closed
  const uk100Calc = calculatePositionSize({
    symbol: 'UK100',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.5,
    entryPrice: 8300,
    stopLoss: 8250,
  });
  assert(
    uk100Calc.isValid === false &&
    uk100Calc.safeLotSize === 0 &&
    uk100Calc.isSpecificationVerified === false &&
    uk100Calc.errorMessage?.includes('BROKER SPECIFICATIONS UNAVAILABLE'),
    'UK100 without broker specs fails position sizing closed with BROKER SPECIFICATIONS UNAVAILABLE'
  );

  // 69. JP225 without broker specs fails position sizing closed
  const jp225Calc = calculatePositionSize({
    symbol: 'JP225',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.5,
    entryPrice: 38500,
    stopLoss: 38400,
  });
  assert(
    jp225Calc.isValid === false &&
    jp225Calc.safeLotSize === 0 &&
    jp225Calc.isSpecificationVerified === false &&
    jp225Calc.errorMessage?.includes('BROKER SPECIFICATIONS UNAVAILABLE'),
    'JP225 without broker specs fails position sizing closed with BROKER SPECIFICATIONS UNAVAILABLE'
  );

  // 70. NATGAS without broker specs fails position sizing closed
  const natgasCalc = calculatePositionSize({
    symbol: 'NATGAS',
    direction: 'BUY',
    capital: 10000,
    riskPct: 0.5,
    entryPrice: 2.85,
    stopLoss: 2.75,
  });
  assert(
    natgasCalc.isValid === false &&
    natgasCalc.safeLotSize === 0 &&
    natgasCalc.isSpecificationVerified === false &&
    natgasCalc.errorMessage?.includes('BROKER SPECIFICATIONS UNAVAILABLE'),
    'NATGAS without broker specs fails position sizing closed with BROKER SPECIFICATIONS UNAVAILABLE'
  );

  // 71. Missing broker specs never create assumed lot sizing
  const unverifiedSymbols = ['EURJPY', 'GER40', 'UK100', 'JP225', 'NATGAS'];
  const allSafeZero = unverifiedSymbols.every(sym => {
    const res = calculatePositionSize({
      symbol: sym,
      direction: 'BUY',
      capital: 50000,
      riskPct: 1.0,
      entryPrice: 100,
      stopLoss: 95,
    });
    return res.safeLotSize === 0 && res.rawLotSize === 0 && res.allowedRiskPct === 0;
  });
  assert(
    allSafeZero,
    'Missing broker specs never create assumed lot sizing (safeLotSize and rawLotSize strictly 0)'
  );

  // 72. Multi-asset analysis remains fully operational when position sizing is unavailable
  const eurjpySession = evaluateMarketSession('EURJPY');
  const eurjpySens = getMacroSensitivities('EURJPY');
  const ger40Class = resolveAssetClass('GER40');
  const natgasClass = resolveAssetClass('NATGAS');
  assert(
    Boolean(eurjpySession) &&
    Boolean(eurjpySens) &&
    ger40Class === 'INDICES' &&
    natgasClass === 'ENERGIES',
    'Multi-asset intelligence (session, classification, sensitivities) remains fully operational when position sizing is unavailable'
  );

  // =================================================================
  // FINAL SUMMARY
  // =================================================================
  console.log('\n=================================================================');
  console.log(`TOTAL CHECKS: ${passCount + failCount}`);
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runMultiAssetExpansionTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
