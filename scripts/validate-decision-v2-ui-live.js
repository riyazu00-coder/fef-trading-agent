/**
 * FEF CORTEX — LIVE VALIDATION: DECISION ENGINE V2 UI INTEGRATION
 * COCKPIT + OPPORTUNITY RADAR
 *
 * Validates the full live pipeline from local MT5/SQLite -> LocalMarketDataProvider ->
 * Decision Engine V2 -> DecisionV2UiProjection -> Opportunity Radar & Cockpit cards.
 *
 * Assets audited:
 * 1. XAUUSD (Metals)
 * 2. EURUSD (Forex)
 * 3. BTCUSD (Crypto, 24/7 continuous session)
 * 4. GER40 (Unavailable broker asset fail-closed check)
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

const { getLocalMarketDataProvider } = require('../src/lib/providers/local-market-data-provider.ts');
const { generateGlobalRadarIntelligence } = require('../src/lib/radar/opportunity-radar-engine.ts');
const { projectDecisionV2ForUi } = require('../src/lib/decision/decision-ui-projection.ts');

async function auditAssetUi(provider, symbol) {
  console.log(`\n-----------------------------------------------------------------`);
  console.log(`COCKPIT UI AUDIT: ${symbol}`);
  console.log(`-----------------------------------------------------------------`);

  const quote = await provider.getLatestQuote(symbol);
  if (!quote) {
    console.log(`[BROKER TELEMETRY] : Quote UNAVAILABLE for ${symbol} (Fail-closed)`);
  } else {
    console.log(`[BROKER TELEMETRY] : Bid=${quote.bid} / Ask=${quote.ask} / Spread=${quote.spread} pts (Age: ${quote.ageMs}ms)`);
  }

  const profile = await provider.assembleLocalAssetIntelligence(symbol, 'M15');
  const proj = profile?.decisionV2Projection || projectDecisionV2ForUi(profile?.decisionIntelligenceV2, symbol);

  console.log(`[CORTEX DECISION V2 UI PROJECTION]`);
  console.log(`  Maturity State       : ${proj.maturity}`);
  console.log(`  Directional Bias     : ${proj.bias}`);
  console.log(`  Confidence Score     : ${proj.confidence}%`);
  console.log(`  Evidence Completeness: ${proj.evidenceCompleteness}%`);
  console.log(`  Independent Domains  : ${proj.independentDomainCount}`);
  console.log(`  Supporting Domains   : [${proj.supportingDomains.join(', ')}]`);
  console.log(`  Hard Vetoes (${proj.hardVetoes.length}): ${proj.hardVetoes.map(v => `${v.source}: ${v.reason}`).join('; ') || 'None'}`);
  console.log(`  Soft Vetoes (${proj.softVetoes.length}): ${proj.softVetoes.map(v => `${v.source}: ${v.reason}`).join('; ') || 'None'}`);
  console.log(`  Session Model        : ${proj.sessionModel} (Market: ${proj.marketAvailability}, Killzone: ${proj.killzoneWindow}, 24/7: ${proj.is24x7})`);
  console.log(`  Trade Executable     : ${proj.tradeExecutable} (Strict invariant)`);
  console.log(`  Execution Mode       : ${proj.executionMode}`);
  console.log(`  Explainability:`);
  console.log(`    * Why Wait         : ${proj.blockingConditions[0] || 'None'}`);
  console.log(`    * Next Requirement : ${proj.requirementsToAdvance[0] || 'None'}`);

  return { quote, profile, proj };
}

async function main() {
  console.log('=================================================================');
  console.log('FEF CORTEX — DECISION ENGINE V2 LIVE UI INTEGRATION AUDIT');
  console.log('=================================================================');

  const provider = getLocalMarketDataProvider();

  try {
    const xau = await auditAssetUi(provider, 'XAUUSD');
    const eur = await auditAssetUi(provider, 'EURUSD');
    if (eur.quote && eur.quote.spread === 0) {
      const spreadVeto = eur.proj.softVetoes.find(v => v.reason.toLowerCase().includes('spread widening'));
      if (spreadVeto) {
        throw new Error(`Contradiction detected: EURUSD broker quote has spread=0 but soft veto claims "${spreadVeto.reason}"`);
      }
      console.log(`  [SPREAD AUDIT PASS]  : Zero spread verified with zero false spread-widening vetoes.`);
    }
    const btc = await auditAssetUi(provider, 'BTCUSD');
    const ger = await auditAssetUi(provider, 'GER40');

    console.log(`\n=================================================================`);
    console.log(`OPPORTUNITY RADAR LIVE AUDIT`);
    console.log(`=================================================================`);

    const { evaluateLocalOpportunityRadar } = require('../src/lib/radar/opportunity-radar-engine.ts');
    const radar = await evaluateLocalOpportunityRadar(provider, 'M15');

    console.log(`Total Radar Opportunities Ranked: ${radar.rankedOpportunities.length}`);
    console.log(`Summary Stats: Buy=${radar.summaryStats.buyOpportunities}, Sell=${radar.summaryStats.sellOpportunities}, Watch=${radar.summaryStats.watchlistCount}`);

    console.log(`\nTOP 5 RADAR RANKINGS:`);
    for (let i = 0; i < Math.min(5, radar.rankedOpportunities.length); i++) {
      const opp = radar.rankedOpportunities[i];
      console.log(`  #${opp.rank} ${opp.symbol.padEnd(8)} Score: ${String(opp.opportunityScore).padStart(3)} | State: ${opp.state.padEnd(16)} | V2 Maturity: ${opp.decisionV2?.maturity.padEnd(14)} | Conf: ${String(opp.decisionV2?.confidence ?? opp.aiConfidence).padStart(3)}% | Executable: ${opp.tradeExecutable}`);
    }

    const ger40Radar = radar.rankedOpportunities.find(o => o.symbol === 'GER40');
    console.log(`\nGER40 RADAR AUDIT:`);
    if (ger40Radar) {
      console.log(`  Rank                 : #${ger40Radar.rank}`);
      console.log(`  Opportunity Score    : ${ger40Radar.opportunityScore} (Must be 0)`);
      console.log(`  Radar State          : ${ger40Radar.state} (Must be UNAVAILABLE)`);
      console.log(`  V2 Maturity          : ${ger40Radar.decisionV2?.maturity} (Must be UNAVAILABLE)`);
      console.log(`  Trade Executable     : ${ger40Radar.tradeExecutable} (Must be false)`);
    } else {
      console.log(`  GER40 not found in radar items`);
    }

    const topExec = radar.rankedOpportunities.find(o => o.tradeExecutable);
    console.log(`\nTOP EXECUTABLE TRADE: ${topExec ? `${topExec.symbol} (#${topExec.rank})` : 'NONE (Strictly Fail-Closed / Read-Only)'}`);

  } finally {
    provider.close();
  }

  console.log('\n=================================================================');
  console.log('LIVE DECISION ENGINE V2 UI INTEGRATION AUDIT COMPLETE');
  console.log('=================================================================\n');
}

main().catch(err => {
  console.error('Live audit failed:', err);
  process.exit(1);
});
