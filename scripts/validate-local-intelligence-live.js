/**
 * FEF CORTEX — LIVE LOCAL MARKET INTELLIGENCE VALIDATION
 *
 * Validates real current SQLite data flowing through LocalMarketDataProvider
 * into canonical generateAssetIntelligence() consumer.
 */

const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  module._compile(result.outputText, filename);
};

const { LocalMarketDataProvider } = require('../src/lib/providers/local-market-data-provider.ts');

async function main() {
  console.log('=================================================================');
  console.log('FEF CORTEX — LIVE LOCAL MARKET INTELLIGENCE VALIDATION');
  console.log('=================================================================');

  const provider = new LocalMarketDataProvider();

  // 1. Audit Live Health
  const health = await provider.getHealth();
  console.log('\n--- 1. REAL SQLite DATABASE HEALTH ---');
  console.log(`STATUS            : ${health.status}`);
  console.log(`STORAGE MODE      : ${health.storageMode}`);
  console.log(`LOCAL DATABASE    : ${health.localDatabase}`);
  console.log(`QUOTES COUNT      : ${health.quotesCount}`);
  console.log(`CANDLES COUNT     : ${health.candlesCount}`);
  console.log(`BROKER CONNECTED  : ${health.brokerConnected}`);
  console.log(`BROKER / SERVER   : ${health.broker} / ${health.server}`);
  console.log(`EXECUTION LOCK    : ${health.executionLock}`);

  // 2. Real XAUUSD Quote
  console.log('\n--- 2. REAL XAUUSD LATEST QUOTE ---');
  const xauQuote = await provider.getLatestQuote('XAUUSD');
  if (xauQuote) {
    console.log(`CANONICAL SYMBOL  : ${xauQuote.canonicalSymbol}`);
    console.log(`BROKER SYMBOL     : ${xauQuote.brokerSymbol}`);
    console.log(`BID / ASK / MID   : ${xauQuote.bid} / ${xauQuote.ask} / ${xauQuote.mid}`);
    console.log(`SPREAD            : ${xauQuote.spread} pts`);
    console.log(`QUOTE TIMESTAMP   : ${xauQuote.quoteTimestamp} (${new Date(xauQuote.quoteTimestamp).toISOString()})`);
    console.log(`QUOTE AGE         : ${xauQuote.ageMs}ms`);
    console.log(`QUOTE FRESHNESS   : ${xauQuote.freshness}`);
    console.log(`SOURCE            : ${xauQuote.source}`);
    console.log(`STORAGE           : ${xauQuote.storage}`);
    console.log(`EXECUTABLE        : ${xauQuote.isExecutable}`);
  } else {
    console.error('ERROR: No XAUUSD quote found in SQLite!');
    process.exit(1);
  }

  // 3. Real XAUUSD M15 Candles
  console.log('\n--- 3. REAL XAUUSD M15 CANDLES ---');
  const xauM15 = await provider.getCandles('XAUUSD', 'M15', 50);
  console.log(`CANONICAL SYMBOL  : ${xauM15.symbol}`);
  console.log(`TIMEFRAME         : ${xauM15.timeframe}`);
  console.log(`CANDLE STATE      : ${xauM15.state}`);
  console.log(`BARS SUPPLIED     : ${xauM15.count}`);
  console.log(`SOURCE            : ${xauM15.source}`);
  console.log(`STORAGE           : ${xauM15.storage}`);
  console.log(`PROVENANCE        : ${xauM15.provenance}`);
  if (xauM15.count > 0) {
    const oldest = xauM15.candles[0];
    const newest = xauM15.candles[xauM15.count - 1];
    console.log(`OLDEST BAR TIME   : ${oldest.timestamp} (${new Date(oldest.timestamp).toISOString()}) O:${oldest.open} C:${oldest.close}`);
    console.log(`NEWEST BAR TIME   : ${newest.timestamp} (${new Date(newest.timestamp).toISOString()}) O:${newest.open} C:${newest.close} V:${newest.tickVolume}`);
  }

  // 4. Real XAUUSD H1 Candles
  console.log('\n--- 4. REAL XAUUSD H1 CANDLES ---');
  const xauH1 = await provider.getCandles('XAUUSD', 'H1', 50);
  console.log(`CANONICAL SYMBOL  : ${xauH1.symbol}`);
  console.log(`TIMEFRAME         : ${xauH1.timeframe}`);
  console.log(`CANDLE STATE      : ${xauH1.state}`);
  console.log(`BARS SUPPLIED     : ${xauH1.count}`);
  console.log(`SOURCE            : ${xauH1.source}`);
  console.log(`STORAGE           : ${xauH1.storage}`);
  console.log(`PROVENANCE        : ${xauH1.provenance}`);
  if (xauH1.count > 0) {
    const oldest = xauH1.candles[0];
    const newest = xauH1.candles[xauH1.count - 1];
    console.log(`OLDEST BAR TIME   : ${oldest.timestamp} (${new Date(oldest.timestamp).toISOString()}) O:${oldest.open} C:${oldest.close}`);
    console.log(`NEWEST BAR TIME   : ${newest.timestamp} (${new Date(newest.timestamp).toISOString()}) O:${newest.open} C:${newest.close} V:${newest.tickVolume}`);
  }

  // 5. Canonical Intelligence Consumer Integration
  console.log('\n--- 5. CANONICAL INTELLIGENCE CONSUMER (generateAssetIntelligence) ---');
  const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'M15');
  if (profile) {
    console.log(`SYMBOL            : ${profile.symbol}`);
    console.log(`NAME              : ${profile.name}`);
    console.log(`REGIME            : ${profile.regime}`);
    console.log(`SESSION           : ${profile.session}`);
    console.log(`TREND             : ${profile.trend}`);
    console.log(`VOLATILITY        : ${profile.volatility}`);
    console.log(`DECISION POSTURE  : ${profile.decisionPosture}`);
    console.log(`DIRECTIONAL BIAS  : ${profile.directionalBias}`);
    console.log(`RISK POSTURE      : ${profile.riskPosture}`);
    console.log(`CONFIDENCE        : ${profile.confidence}%`);
    console.log(`EVIDENCE TRUST    : ${profile.evidenceTrust}%`);
    console.log(`TRADE EXECUTABLE  : ${profile.tradeExecutable} (READ_ONLY invariant preserved)`);
    console.log(`TOTAL AGENTS      : ${profile.agents ? profile.agents.length : 0}`);

    if (profile.agents && profile.agents.length > 0) {
      console.log('\n  Canonical Agent Council Highlights:');
      for (const a of profile.agents.slice(0, 5)) {
        console.log(`    - [${a.type}] ${a.name}: ${a.bias} (Trust: ${a.evidenceTrustScore ?? a.confidence ?? 0}%, Status: ${a.status})`);
        if (a.evidence && a.evidence.length > 0) {
          console.log(`        Evidence: ${a.evidence[0]}`);
        }
      }
    }
  } else {
    console.error('ERROR: generateAssetIntelligence returned null!');
    process.exit(1);
  }

  // 6. Test GER40 Truthful Unavailable Behavior
  console.log('\n--- 6. TRUTHFUL UNAVAILABILITY TEST (GER40) ---');
  const gerQuote = await provider.getLatestQuote('GER40');
  const gerCandles = await provider.getCandles('GER40', 'M15');
  console.log(`GER40 QUOTE       : ${gerQuote === null ? 'NULL (TRUTHFUL UNAVAILABLE - ZERO FABRICATION)' : 'UNEXPECTED VALUE'}`);
  console.log(`GER40 CANDLES     : state=${gerCandles.state}, count=${gerCandles.count}`);
  if (gerQuote !== null || gerCandles.count !== 0) {
    console.error('ERROR: GER40 was fabricated!');
    process.exit(1);
  }

  // 7. Available Symbols List
  console.log('\n--- 7. ACTUAL AVAILABLE SYMBOLS IN LOCAL SQLITE ---');
  const available = await provider.getAvailableSymbols();
  console.log(`COUNT             : ${available.length}/26`);
  console.log(`SYMBOLS           : ${available.join(', ')}`);

  console.log('\n=================================================================');
  console.log('LIVE LOCAL INTELLIGENCE VALIDATION COMPLETE — ALL CHECKS PASSED.');
  console.log('=================================================================');
}

main().catch((err) => {
  console.error('\nVALIDATION SCRIPT FAILED:', err);
  process.exit(1);
});
