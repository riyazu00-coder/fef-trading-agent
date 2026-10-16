import { fetchLiveMarketPrices } from '../src/lib/providers/real-market-api';
import { MARKET_REGISTRY } from '../src/lib/registry/market-registry';
import { evaluateCanonicalDailyStats } from '../src/lib/price/canonical-daily-ohlc';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';

async function runPhase3bAcceptance() {
  console.log('=================================================================');
  console.log('FEF CORTEX — PHASE 3B MULTI-ASSET COVERAGE ACCEPTANCE SUITE');
  console.log('=================================================================\n');

  console.log('[STEP 1: FETCHING LIVE MARKET ASSETS ACROSS ALL CONFIGURED SYMBOLS]');
  const liveAssets = await fetchLiveMarketPrices();
  const configuredSymbols = Object.keys(MARKET_REGISTRY);

  console.log(`Total configured symbols in registry: ${configuredSymbols.length}`);

  let passCount = 0;
  let failCount = 0;

  // 1. FOREX CHECK
  console.log('\n[1. FOREX COVERAGE (10 Assets)]');
  const forexSymbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURJPY', 'EURGBP'];
  for (const sym of forexSymbols) {
    const a = liveAssets[sym];
    if (a && a.price > 0 && a.feedStatus === 'LIVE') {
      console.log(`  ✓ ${sym}: Price=${a.price} | Provider=${a.provider || a.source} | Feed=${a.feedStatus}`);
      passCount++;
    } else {
      console.error(`  ✗ ${sym}: Missing or non-live price! (${JSON.stringify(a)})`);
      failCount++;
    }
  }

  // 2. METALS CHECK
  console.log('\n[2. METALS COVERAGE (2 Assets)]');
  const metalSymbols = ['XAUUSD', 'XAGUSD'];
  for (const sym of metalSymbols) {
    const a = liveAssets[sym];
    if (a && a.price > 0 && a.feedStatus === 'LIVE') {
      console.log(`  ✓ ${sym}: Price=${a.price} | Provider=${a.provider || a.source} | Feed=${a.feedStatus}`);
      passCount++;
    } else {
      console.error(`  ✗ ${sym}: Missing or non-live price! (${JSON.stringify(a)})`);
      failCount++;
    }
  }

  // 3. CRYPTO CHECK
  console.log('\n[3. CRYPTO COVERAGE (5 Assets)]');
  const cryptoSymbols = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'];
  for (const sym of cryptoSymbols) {
    const a = liveAssets[sym];
    if (a && a.price > 0 && a.feedStatus === 'LIVE') {
      console.log(`  ✓ ${sym}: Price=${a.price} | Provider=${a.provider || a.source} | Feed=${a.feedStatus}`);
      passCount++;
    } else {
      console.error(`  ✗ ${sym}: Missing or non-live price! (${JSON.stringify(a)})`);
      failCount++;
    }
  }

  // 4. INDICES CHECK (with GER40 fail-closed verification)
  console.log('\n[4. INDICES COVERAGE (6 Assets)]');
  const indexSymbols = ['US100', 'US30', 'US500', 'UK100', 'JP225'];
  for (const sym of indexSymbols) {
    const a = liveAssets[sym];
    if (a && a.price > 0 && (a.feedStatus === 'LIVE' || a.feedStatus === 'FALLBACK')) {
      console.log(`  ✓ ${sym}: Price=${a.price} | Provider=${a.provider || a.source} | Feed=${a.feedStatus}`);
      passCount++;
    } else {
      console.error(`  ✗ ${sym}: Missing or non-live price! (${JSON.stringify(a)})`);
      failCount++;
    }
  }

  // GER40 rule verification
  const ger40 = liveAssets['GER40'];
  if (ger40 && ger40.price === 0 && (ger40.feedStatus === 'UNAVAILABLE' || ger40.feedStatus === 'DATA LIMITED')) {
    console.log(`  ✓ GER40: Price=0 (LOCKED FAIL-CLOSED LIVE PRICE) | Status=${ger40.feedStatus}`);
    passCount++;
  } else {
    console.error(`  ✗ GER40: Must remain fail-closed 0 for live price! Got: ${JSON.stringify(ger40)}`);
    failCount++;
  }

  // 5. COMMODITIES / ENERGY CHECK
  console.log('\n[5. COMMODITIES / ENERGY COVERAGE (3 Assets)]');
  const commSymbols = ['USOIL', 'UKOIL', 'NATGAS'];
  for (const sym of commSymbols) {
    const a = liveAssets[sym];
    if (a && a.price > 0 && (a.feedStatus === 'LIVE' || a.feedStatus === 'FALLBACK')) {
      console.log(`  ✓ ${sym}: Price=${a.price} | Provider=${a.provider || a.source} | Feed=${a.feedStatus}`);
      passCount++;
    } else {
      console.error(`  ✗ ${sym}: Missing or non-live price! (${JSON.stringify(a)})`);
      failCount++;
    }
  }

  // 6. CANONICAL DAILY STATS CHECK FOR AUDUSD & NZDUSD
  console.log('\n[6. CANONICAL DAILY STATS RESOLUTION FOR AUDUSD & NZDUSD]');
  const audAsset = liveAssets['AUDUSD'];
  const audDaily = evaluateCanonicalDailyStats({
    symbol: 'AUDUSD',
    isBrokerConnected: false,
    referencePrice: audAsset.price,
    referenceProvider: audAsset.source,
    d1Candles: [{
      open: audAsset.price * 0.998,
      high: audAsset.price * 1.004,
      low: audAsset.price * 0.995,
      close: audAsset.price,
      timestamp: Date.now() - 3600000,
    }],
    d1Provenance: 'INDEPENDENT_VERIFIED',
    d1Provider: 'Open-ER USD Benchmark',
  });

  if (audDaily.isVerified && audDaily.provenance === 'INDEPENDENT_VERIFIED' && audDaily.currentPrice === audAsset.price) {
    console.log(`  ✓ AUDUSD Daily Stats: VERIFIED | StatusLabel="${audDaily.statusLabel}" | Change=${audDaily.changePct?.toFixed(2)}%`);
    passCount++;
  } else {
    console.error(`  ✗ AUDUSD Daily Stats Failed: ${JSON.stringify(audDaily)}`);
    failCount++;
  }

  const nzdAsset = liveAssets['NZDUSD'];
  const nzdDaily = evaluateCanonicalDailyStats({
    symbol: 'NZDUSD',
    isBrokerConnected: false,
    referencePrice: nzdAsset.price,
    referenceProvider: nzdAsset.source,
    d1Candles: [{
      open: nzdAsset.price * 0.997,
      high: nzdAsset.price * 1.003,
      low: nzdAsset.price * 0.994,
      close: nzdAsset.price,
      timestamp: Date.now() - 3600000,
    }],
    d1Provenance: 'INDEPENDENT_VERIFIED',
    d1Provider: 'Open-ER USD Benchmark',
  });

  if (nzdDaily.isVerified && nzdDaily.provenance === 'INDEPENDENT_VERIFIED' && nzdDaily.currentPrice === nzdAsset.price) {
    console.log(`  ✓ NZDUSD Daily Stats: VERIFIED | StatusLabel="${nzdDaily.statusLabel}" | Change=${nzdDaily.changePct?.toFixed(2)}%`);
    passCount++;
  } else {
    console.error(`  ✗ NZDUSD Daily Stats Failed: ${JSON.stringify(nzdDaily)}`);
    failCount++;
  }

  // 7. CORTEX INTELLIGENCE PIPELINE TRUTHFULNESS
  console.log('\n[7. MULTI-ASSET INTELLIGENCE PIPELINE TRUTHFULNESS]');
  const audMockCandles = Array.from({ length: 30 }, (_, i) => ({
    timestamp: Date.now() - (30 - i) * 3600000,
    open: audAsset.price * (1 + (i - 15) * 0.0005),
    high: audAsset.price * (1 + (i - 15) * 0.0005 + 0.001),
    low: audAsset.price * (1 + (i - 15) * 0.0005 - 0.001),
    close: audAsset.price * (1 + (i - 15) * 0.0005 + 0.0002),
    tickVolume: 1000 + i * 10,
  }));

  const audIntelligence = generateAssetIntelligence(
    'AUDUSD',
    audAsset,
    'H1',
    audMockCandles,
    'INDEPENDENT_VERIFIED',
    'Open-ER Spot Benchmark'
  );

  const sentinel = audIntelligence.dataSentinel;
  if (sentinel && sentinel.readiness === 'READY' && sentinel.evidenceTrust >= 80) {
    console.log(`  ✓ AUDUSD Data Sentinel: READY (Trust=${sentinel.evidenceTrust}) under Verified Reference`);
    passCount++;
  } else {
    console.error(`  ✗ AUDUSD Data Sentinel Failed: Readiness=${sentinel?.readiness}`);
    failCount++;
  }

  // Execution Lockout Check
  if (audIntelligence.tradeExecutable === false) {
    console.log(`  ✓ Execution Safety: tradeExecutable is strictly false under reference operation`);
    passCount++;
  } else {
    console.error(`  ✗ Execution Safety Violation: tradeExecutable is true under reference mode!`);
    failCount++;
  }

  console.log('\n=================================================================');
  console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('=================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runPhase3bAcceptance().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
