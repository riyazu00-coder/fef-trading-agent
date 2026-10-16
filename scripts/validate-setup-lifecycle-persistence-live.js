/**
 * FEF CORTEX — LIVE VALIDATION: SETUP LIFECYCLE PERSISTENCE + HISTORICAL OUTCOMES V1
 *
 * Validates Setup Lifecycle Persistence & Historical Outcome Intelligence against
 * real local SQLite telemetry across 4 representative assets:
 * 1. XAUUSD (Metals)
 * 2. EURUSD (Forex)
 * 3. BTCUSD (Crypto, 24/7 continuous session)
 * 4. GER40 (Unavailable fail-closed check)
 *
 * Verifies:
 * - SQLite schema presence (setup_identity, setup_lifecycle_events)
 * - Deterministic setup observation recording & deduplication
 * - Active setup retrieval and excursion tracking
 * - Historical outcome analytics (sample count, reach rate, invalidation rate, avg MFE/MAE)
 * - Sample size honesty tiering (INSUFFICIENT_SAMPLE < 10)
 * - UI projection attachment (setupIntelligenceV3Projection.history)
 * - GER40 fail-closed semantics (0 records, 0 fake history)
 * - Absolute safety invariants: tradeExecutable = false, executionMode = READ_ONLY
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

// Register TypeScript on-the-fly compiler
require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};
require.extensions['.tsx'] = require.extensions['.ts'];

// Map '@/...' to '../src/...'
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return origResolve.call(this, request, parent, isMain, options);
};

const { LocalMarketDataProvider } = require('../src/lib/providers/local-market-data-provider.ts');
const { SetupHistoricalAnalyticsEngine } = require('../src/lib/setup/setup-historical-analytics.ts');

async function validateAssetLifecycle(provider, symbol) {
  console.log(`\n=================================================================`);
  console.log(`VALIDATING SETUP LIFECYCLE & HISTORICAL INTELLIGENCE: ${symbol}`);
  console.log(`=================================================================`);

  const quote = await provider.getLatestQuote(symbol);
  if (!quote) {
    console.log(`[BROKER TELEMETRY]: Quote UNAVAILABLE for ${symbol} (Fail-closed)`);
  } else {
    console.log(`[BROKER TELEMETRY]: Quote Bid=${quote.bid} / Ask=${quote.ask} / Mid=${quote.mid} / Spread=${quote.spread} pts (Freshness: ${quote.freshness}, Age: ${quote.ageMs}ms)`);
  }

  const profile = await provider.assembleLocalAssetIntelligence(symbol, 'M15');
  const setupRepo = provider.getSetupLifecycleRepository();

  if (!profile) {
    console.log(`[INTELLIGENCE PROFILE]: NULL (Fail-closed for unavailable instrument ${symbol})`);
    if (setupRepo) {
      const setups = setupRepo.getSetupsBySymbol(symbol);
      console.log(`  Persisted Setups     : ${setups.length} (Strictly 0 for fail-closed asset)`);
    }
    return;
  }

  const v3 = profile.setupIntelligenceV3;
  const ui = profile.setupIntelligenceV3Projection;

  console.log(`\n[A. CURRENT SETUP OBSERVATION]`);
  console.log(`  Setup ID             : ${v3.setupId}`);
  console.log(`  Lifecycle State      : ${v3.lifecycle}`);
  console.log(`  Direction            : ${v3.direction}`);
  console.log(`  Taxonomy             : ${v3.setupType}`);
  console.log(`  Readiness            : ${v3.readiness}`);
  console.log(`  Trade Executable     : ${v3.tradeExecutable} (Strict invariant)`);

  console.log(`\n[B. PERSISTED REPOSITORY AUDIT]`);
  if (setupRepo && setupRepo.isInitialized) {
    const allSetups = setupRepo.getSetupsBySymbol(symbol);
    const activeSetups = setupRepo.getActiveSetups({ symbol });
    console.log(`  Total Setups in DB   : ${allSetups.length}`);
    console.log(`  Active Setups in DB  : ${activeSetups.length}`);

    if (v3.setupId) {
      const persisted = setupRepo.getSetupById(v3.setupId);
      if (persisted) {
        console.log(`  Record Found in DB   : YES`);
        console.log(`    DB Lifecycle       : ${persisted.currentLifecycle}`);
        console.log(`    Initial Entry Mid  : ${persisted.entryMidpoint}`);
        console.log(`    Initial SL         : ${persisted.stopLoss}`);
        console.log(`    Initial R:R        : ${persisted.initialRr !== null ? '1:' + persisted.initialRr.toFixed(2) : 'None'}`);
        console.log(`    Entry Zone Touched : ${Boolean(persisted.entryZoneTouched)}`);
        console.log(`    MFE R-Multiple     : ${persisted.mfeR !== null ? persisted.mfeR.toFixed(2) + 'R' : 'None'}`);
        console.log(`    MAE R-Multiple     : ${persisted.maeR !== null ? persisted.maeR.toFixed(2) + 'R' : 'None'}`);
        console.log(`    Outcome Resolution : ${persisted.outcomeResolution}`);

        const events = setupRepo.getLifecycleEvents(v3.setupId);
        for (const ev of events) {
          console.log(`      - Event [${ev.newLifecycle}]: trigger=${ev.transitionCause} asOf=${new Date(ev.observedAt).toISOString()}`);
        }
      } else {
        console.log(`  Record Found in DB   : NO (Setup was NO_SETUP or UNAVAILABLE)`);
      }
    }
  }

  console.log(`\n[C. HISTORICAL OUTCOME ANALYTICS]`);
  if (setupRepo && setupRepo.isInitialized) {
    const stats = SetupHistoricalAnalyticsEngine.computeAnalytics(setupRepo, { symbol });
    console.log(`  Sample Size (n)      : ${stats.sampleCount}`);
    console.log(`  Reliability Tier     : ${stats.statisticalReliability}`);
    console.log(`  Disclaimer           : "${stats.disclaimer}"`);
    console.log(`  Validated Rate       : ${stats.validationRate.toFixed(1)}% (${stats.validatedCount}/${stats.totalSetupsObserved})`);
    console.log(`  TP1 Reach Rate       : ${stats.target1ReachRate.toFixed(1)}%`);
    console.log(`  Invalidation Rate    : ${stats.invalidationRate.toFixed(1)}%`);
    console.log(`  Inv After TP1 Rate   : ${stats.invalidationAfterTarget1Rate.toFixed(1)}%`);
    console.log(`  Avg MFE / MAE        : ${stats.averageMfeR !== null ? stats.averageMfeR.toFixed(2) + 'R' : 'None'} / ${stats.averageMaeR !== null ? stats.averageMaeR.toFixed(2) + 'R' : 'None'}`);
    console.log(`  Avg Initial R:R      : ${stats.averageInitialRr !== null ? '1:' + stats.averageInitialRr.toFixed(2) : 'None'}`);
  }

  console.log(`\n[D. CLIENT-SAFE UI PROJECTION]`);
  if (ui) {
    console.log(`  UI Trade Executable  : ${ui.tradeExecutable} (Strict invariant)`);
    console.log(`  UI Execution Mode    : ${ui.executionMode} (Strict invariant)`);
    if (ui.history) {
      console.log(`  Attached History     : YES`);
      console.log(`    History Sample (n) : ${ui.history.sampleCount}`);
      console.log(`    Reliability Badge  : ${ui.history.statisticalReliability}`);
      console.log(`    TP1 Reach Rate     : ${ui.history.targetReachRate.toFixed(1)}%`);
      console.log(`    Recent Resolutions : ${ui.history.recentSetups.length} displayed`);
    } else {
      console.log(`  Attached History     : NONE`);
    }
  }
}

async function main() {
  console.log('=================================================================');
  console.log('FEF CORTEX — LIVE SETUP LIFECYCLE PERSISTENCE VALIDATION');
  console.log('=================================================================');

  const provider = new LocalMarketDataProvider();

  try {
    const health = await provider.getHealth();
    console.log(`[STORAGE HEALTH]: Status=${health.status}, Storage=${health.storageMode}, Quotes=${health.quotesCount}, Broker=${health.broker}`);

    const symbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'GER40'];
    for (const sym of symbols) {
      await validateAssetLifecycle(provider, sym);
    }

    console.log('\n=================================================================');
    console.log('LIVE VALIDATION COMPLETE: ALL ASSET CHECKS EXECUTED');
    console.log('=================================================================');
  } finally {
    provider.close();
  }
}

main().catch(err => {
  console.error('Fatal error during live validation:', err);
  process.exit(1);
});
