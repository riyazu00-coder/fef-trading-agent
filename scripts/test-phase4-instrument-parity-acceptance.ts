import {
  INSTRUMENT_PARITY_REGISTRY,
  getInstrumentParityProfile,
  isReferencePriceAuthorityPermitted,
  isReferenceExecutionLevelPermitted,
  ParityClassification
} from '../src/lib/price/instrument-parity';
import { evaluateContinuityFeed } from '../src/lib/price/continuity-feed';
import { CanonicalDataRouter } from '../src/lib/data-router/canonical-data-router';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { evaluateCanonicalDailyStats } from '../src/lib/price/canonical-daily-ohlc';
import { MARKET_REGISTRY } from '../src/lib/registry/market-registry';

async function runPhase4Acceptance() {
  console.log('=================================================================');
  console.log('FEF CORTEX — PHASE 4 INSTRUMENT PARITY & REFERENCE QUALITY ACCEPTANCE');
  console.log('=================================================================\n');

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passCount++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failCount++;
    }
  }

  // TEST 1: REGISTRY COMPLETENESS
  console.log('[TEST 1: REGISTRY ASSET COVERAGE & CLASSIFICATION DISTRIBUTION]');
  const configuredSymbols = Object.keys(MARKET_REGISTRY);
  assert(configuredSymbols.length === 26, `Configured symbols in MARKET_REGISTRY === 26 (found ${configuredSymbols.length})`);

  const registryKeys = Object.keys(INSTRUMENT_PARITY_REGISTRY);
  assert(registryKeys.length === 26, `All 26 assets registered in INSTRUMENT_PARITY_REGISTRY (found ${registryKeys.length})`);

  const counts: Record<ParityClassification, number> = {
    PARITY_VERIFIED: 0,
    PARITY_ACCEPTABLE: 0,
    PROXY_ONLY: 0,
    NOT_COMPARABLE: 0,
    UNAVAILABLE: 0,
  };

  for (const sym of configuredSymbols) {
    const profile = getInstrumentParityProfile(sym);
    counts[profile.parityClassification]++;
  }

  console.log(`  Classification counts: Verified=${counts.PARITY_VERIFIED}, Acceptable=${counts.PARITY_ACCEPTABLE}, Proxy=${counts.PROXY_ONLY}, NotComparable=${counts.NOT_COMPARABLE}, Unavailable=${counts.UNAVAILABLE}`);

  assert(counts.PARITY_VERIFIED === 16, `PARITY_VERIFIED count === 16 (found ${counts.PARITY_VERIFIED})`);
  assert(counts.PARITY_ACCEPTABLE === 3, `PARITY_ACCEPTABLE count === 3 (found ${counts.PARITY_ACCEPTABLE})`);
  assert(counts.PROXY_ONLY === 6, `PROXY_ONLY count === 6 (found ${counts.PROXY_ONLY})`);
  assert(counts.NOT_COMPARABLE === 0, `NOT_COMPARABLE count === 0 (found ${counts.NOT_COMPARABLE})`);
  assert(counts.UNAVAILABLE === 1, `UNAVAILABLE count === 1 (GER40 locked fail-closed) (found ${counts.UNAVAILABLE})`);

  // TEST 2: US100 PROXY PARITY AND EXECUTION ISOLATION
  console.log('\n[TEST 2: US100 PROXY_ONLY BEHAVIOR & CAPABILITY ENFORCEMENT]');
  const us100Profile = getInstrumentParityProfile('US100');
  assert(us100Profile.parityClassification === 'PROXY_ONLY', `US100 is classified as PROXY_ONLY`);
  assert(us100Profile.allowedCapabilities.livePriceAuthority === false, `US100 livePriceAuthority === false in reference mode`);
  assert(us100Profile.allowedCapabilities.exactExecutionLevels === false, `US100 exactExecutionLevels === false in reference mode`);
  assert(us100Profile.allowedCapabilities.trendAnalysis === true, `US100 trendAnalysis === true (proxy structure permitted)`);
  assert(us100Profile.allowedCapabilities.macroContext === true, `US100 macroContext === true`);
  assert(us100Profile.allowedCapabilities.historicalStructure === true, `US100 historicalStructure === true`);
  assert(!isReferencePriceAuthorityPermitted('US100'), `isReferencePriceAuthorityPermitted('US100') returns false`);
  assert(!isReferenceExecutionLevelPermitted('US100'), `isReferenceExecutionLevelPermitted('US100') returns false`);

  // TEST 3: CONTINUITY FEED PROVENANCE & PRICE AUTHORITY
  console.log('\n[TEST 3: CONTINUITY FEED PRICE AUTHORITY & PROVENANCE]');
  // US100 MT5 offline -> REFERENCE_PROXY
  const us100Offline = evaluateContinuityFeed({
    symbol: 'US100',
    brokerQuote: null,
    referencePrice: 20415.5,
    referenceProvider: 'Yahoo Finance CME Proxy / ^NDX',
  });
  assert(us100Offline.priceAuthority === 'REFERENCE_PROXY', `US100 MT5 offline: priceAuthority === 'REFERENCE_PROXY' (found ${us100Offline.priceAuthority})`);
  assert(us100Offline.provenance === 'INDEPENDENT_PROXY_FEED', `US100 MT5 offline: provenance === 'INDEPENDENT_PROXY_FEED'`);
  assert(us100Offline.executionLocked === true, `US100 MT5 offline: executionLocked === true`);
  assert(us100Offline.statusLabel.includes('REFERENCE PROXY'), `US100 MT5 offline: statusLabel includes 'REFERENCE PROXY'`);

  // US100 MT5 online -> BROKER_PRIMARY
  const us100Online = evaluateContinuityFeed({
    symbol: 'US100',
    brokerQuote: { bid: 29430.5, ask: 29432.5, timestamp: Date.now() },
    referencePrice: 20415.5,
    referenceProvider: 'Yahoo Finance CME Proxy / ^NDX',
  });
  assert(us100Online.priceAuthority === 'MT5_BROKER', `US100 MT5 online: priceAuthority === 'MT5_BROKER'`);
  assert(us100Online.provenance === 'MT5_BROKER_QUOTE', `US100 MT5 online: provenance === 'MT5_BROKER_QUOTE'`);
  assert(us100Online.activePrice === 29431.5, `US100 MT5 online: activePrice === 29431.5`);

  // XAUUSD MT5 offline -> REFERENCE_MARKET
  const xauOffline = evaluateContinuityFeed({
    symbol: 'XAUUSD',
    brokerQuote: null,
    referencePrice: 2715.4,
    referenceProvider: 'Gold-API Live',
  });
  assert(xauOffline.priceAuthority === 'REFERENCE_MARKET', `XAUUSD MT5 offline: priceAuthority === 'REFERENCE_MARKET'`);
  assert(xauOffline.provenance === 'INDEPENDENT_REFERENCE_FEED', `XAUUSD MT5 offline: provenance === 'INDEPENDENT_REFERENCE_FEED'`);

  // GER40 -> UNAVAILABLE fail-closed
  const ger40Offline = evaluateContinuityFeed({
    symbol: 'GER40',
    brokerQuote: null,
    referencePrice: 0,
    referenceProvider: 'UNAVAILABLE',
  });
  assert(ger40Offline.priceAuthority === 'UNAVAILABLE', `GER40 priceAuthority === 'UNAVAILABLE'`);
  assert(ger40Offline.activePrice === 0, `GER40 activePrice === 0`);

  // TEST 4: CANONICAL DATA ROUTER PROVENANCE MAPPING
  console.log('\n[TEST 4: CANONICAL DATA ROUTER SOURCE TYPE]');
  const router = new CanonicalDataRouter();
  const routedProxyQuote = router.resolveQuote({
    symbol: 'US100',
    brokerQuote: null,
    referencePrice: 20415.5,
    referenceProvider: 'Yahoo Finance CME Proxy',
  });
  assert(routedProxyQuote.provenance.sourceType === 'REFERENCE_PROXY', `Router maps US100 proxy to sourceType 'REFERENCE_PROXY'`);
  assert(routedProxyQuote.provenance.executable === false, `Router marks proxy quote executable === false`);
  assert(routedProxyQuote.provenance.referenceOnly === true, `Router marks proxy quote referenceOnly === true`);

  // TEST 5: MULTI-ASSET PIPELINE BLUEPRINT & AGENT ISOLATION
  console.log('\n[TEST 5: MULTI-ASSET PIPELINE BLUEPRINT & AGENT EXECUTION LEVEL GATING]');
  // Mock 20 candles with clear bullish trend
  const mockCandles = Array.from({ length: 20 }, (_, i) => ({
    timestamp: Date.now() - (20 - i) * 1800000,
    open: 20000 + i * 20,
    high: 20025 + i * 20,
    low: 19995 + i * 20,
    close: 20020 + i * 20,
    volume: 500,
  }));

  const us100Analysis = generateAssetIntelligence(
    'US100',
    {
      symbol: 'US100',
      price: 20400,
      bid: 20398,
      ask: 20402,
      spread: 0,
      provider: 'Yahoo Finance CME Proxy',
      source: 'REFERENCE_PROXY',
      feedStatus: 'LIVE',
      category: 'INDICES',
      change24h: 1.2,
      lastUpdated: new Date().toISOString(),
    },
    'M30',
    mockCandles,
    'INDEPENDENT_REFERENCE',
    'Yahoo Finance CME Proxy'
  );

  assert(us100Analysis.blueprint === null, `US100 in reference mode has blueprint === null (No proxy execution levels)`);

  const strategyAgent = us100Analysis.agents.find((a) => a.type === 'STRATEGY');
  assert(Boolean(strategyAgent), `STRATEGY agent exists for US100`);
  assert(
    strategyAgent?.lastOpinion.includes('Exact execution levels disabled (PROXY_ONLY parity policy)') ?? false,
    `STRATEGY agent opinion states exact execution levels disabled`
  );
  assert(
    strategyAgent?.evidence.some((e) => e.includes('DISABLED (Prevents proxy price leak)')) ?? false,
    `STRATEGY evidence explicitly marks execution levels DISABLED`
  );

  const opportunityAgent = us100Analysis.agents.find((a) => a.type === 'OPPORTUNITY');
  assert(Boolean(opportunityAgent), `OPPORTUNITY agent exists for US100`);
  assert(
    opportunityAgent?.lastOpinion.includes('Exact R:R levels disabled under PROXY_ONLY parity policy') ?? false,
    `OPPORTUNITY agent opinion states exact R:R levels disabled under PROXY_ONLY`
  );

  // Data Sentinel check
  assert(Boolean(us100Analysis.dataSentinel), `DataSentinel agent evaluated for US100`);
  assert(us100Analysis.dataSentinel?.readiness === 'READY', `DataSentinel readiness === 'READY' for US100 proxy mode`);

  // TEST 6: CANONICAL DAILY OHLC STATUS LABEL
  console.log('\n[TEST 6: CANONICAL DAILY OHLC STATUS LABEL]');
  const mockD1 = [{
    timestamp: Date.now() - 3600000,
    open: 20200,
    high: 20500,
    low: 20150,
    close: 20400,
  }];

  const us100Daily = evaluateCanonicalDailyStats({
    symbol: 'US100',
    category: 'INDICES',
    referencePrice: 20400,
    d1Candles: mockD1,
    isBrokerConnected: false,
    d1Provenance: 'INDEPENDENT_REFERENCE',
    d1Provider: 'Yahoo Finance CME Proxy',
  });
  assert(us100Daily.statusLabel === 'REFERENCE PROXY', `US100 daily stats statusLabel === 'REFERENCE PROXY' (found '${us100Daily.statusLabel}')`);

  const xauDaily = evaluateCanonicalDailyStats({
    symbol: 'XAUUSD',
    category: 'METALS',
    referencePrice: 2715,
    d1Candles: [{
      timestamp: Date.now() - 3600000,
      open: 2700,
      high: 2720,
      low: 2695,
      close: 2715,
    }],
    isBrokerConnected: false,
    d1Provenance: 'INDEPENDENT_VERIFIED',
    d1Provider: 'Gold-API Live',
  });
  assert(xauDaily.statusLabel === 'VERIFIED REFERENCE', `XAUUSD daily stats statusLabel === 'VERIFIED REFERENCE'`);

  // FINAL SUMMARY
  console.log('\n=================================================================');
  console.log(`PHASE 4 ACCEPTANCE RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase4Acceptance().catch((err) => {
  console.error('Fatal error during Phase 4 acceptance:', err);
  process.exit(1);
});
