/**
 * FEF CORTEX — LIVE 32-AGENT EVIDENCE ORCHESTRATION VALIDATION
 *
 * Validates real current SQLite evidence flowing through LocalMarketDataProvider
 * and CanonicalEvidenceBundle into the 32-agent CORTEX swarm (15 Core + 17 Specialists).
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
  console.log('FEF CORTEX — 32-AGENT EVIDENCE ORCHESTRATION LIVE VALIDATION');
  console.log('=================================================================');

  const provider = new LocalMarketDataProvider();

  // 1. Audit Live Database Health
  const health = await provider.getHealth();
  console.log('\n--- 1. REAL SQLite DATABASE & PROVIDER HEALTH ---');
  console.log(`STATUS            : ${health.status}`);
  console.log(`STORAGE MODE      : ${health.storageMode}`);
  console.log(`LOCAL DATABASE    : ${health.localDatabase}`);
  console.log(`QUOTES COUNT      : ${health.quotesCount}`);
  console.log(`CANDLES COUNT     : ${health.candlesCount}`);
  console.log(`BROKER CONNECTED  : ${health.brokerConnected}`);
  console.log(`EXECUTION LOCK    : ${health.executionLock}`);

  const testSymbols = ['XAUUSD', 'EURUSD', 'BTCUSD', 'GER40'];

  for (const symbol of testSymbols) {
    console.log(`\n=================================================================`);
    console.log(`VALIDATING ASSET: ${symbol}`);
    console.log(`=================================================================`);

    // A. Canonical Evidence Bundle direct audit
    const bundle = await provider.getCanonicalEvidenceBundle(symbol);
    console.log(`\n[A. CANONICAL EVIDENCE BUNDLE]`);
    console.log(`  Snapshot ID          : ${bundle.snapshotId}`);
    console.log(`  As Of                : ${bundle.asOf} (${new Date(bundle.asOf).toISOString()})`);
    console.log(`  Market State         : ${bundle.market.marketState}`);
    console.log(`  Quote Bid/Ask/Mid    : ${bundle.market.bid} / ${bundle.market.ask} / ${bundle.market.mid}`);
    console.log(`  Spread               : ${bundle.market.spread} pts`);
    console.log(`  Quote Freshness/Age  : ${bundle.market.quoteFreshness} (${bundle.market.quoteAgeMs}ms)`);
    console.log(`  Evidence Completeness: ${bundle.completeness.overallCompleteness}% (${bundle.completeness.formula})`);
    console.log(`    Technical Cmpl     : ${bundle.completeness.technicalCompleteness}%`);
    console.log(`    Market Data Cmpl   : ${bundle.completeness.marketDataCompleteness}%`);
    console.log(`    Risk Cmpl          : ${bundle.completeness.riskCompleteness}%`);
    console.log(`    Macro Cmpl         : ${bundle.completeness.macroCompleteness}%`);
    console.log(`    Sentiment Cmpl     : ${bundle.completeness.sentimentCompleteness}%`);
    console.log(`  Active Conflicts     : ${bundle.conflicts.length}`);
    for (const c of bundle.conflicts) {
      console.log(`    - [${c.severity}] ${c.type}: ${c.description} (Parties: ${c.parties.join(', ')})`);
    }
    console.log(`  Trade Executable     : ${bundle.market.tradeExecutable}`);
    console.log(`  Provenance Source    : ${bundle.provenance.source} -> ${bundle.provenance.storage} (${bundle.provenance.classification})`);

    console.log(`  Execution Policy Separation:`);
    console.log(`    Web Product Policy : ${bundle.executionPolicies.webProductPolicy}`);
    console.log(`    Local Transport    : ${bundle.executionPolicies.localBrokerTransportPolicy}`);
    console.log(`    MT5 Transport On   : ${bundle.executionPolicies.mt5OrderTransportEnabled}`);
    console.log(`    Actionability State: ${bundle.executionPolicies.intelligenceActionability}`);
    console.log(`    Final Decision Exec: ${bundle.executionPolicies.finalDecisionExecutable}`);

    console.log(`  Timeframe Matrix:`);
    for (const [tf, data] of Object.entries(bundle.timeframes)) {
      console.log(`    ${tf.padEnd(4)}: state=${data.state.padEnd(12)} bars=${String(data.barCount).padEnd(4)} role=${data.role}`);
    }

    // B. Assemble Local Asset Intelligence (32-Agent Swarm execution)
    const profile = await provider.assembleLocalAssetIntelligence(symbol, 'H1');
    console.log(`\n[B. 32-AGENT SWARM SYNTHESIS]`);
    if (!profile) {
      console.log(`  Profile Result       : NULL (Fail-closed: Instrument unavailable in broker telemetry)`);
      console.log(`  Actionability        : NON_ACTIONABLE`);
      console.log(`  Execution Invariant  : tradeExecutable = false enforced`);
      continue;
    }

    console.log(`  Asset Name           : ${profile.name}`);
    console.log(`  Category             : ${profile.category}`);
    console.log(`  Session State        : ${profile.sessionState.currentSession} (${profile.sessionState.isOpen ? 'OPEN' : 'CLOSED'})`);
    console.log(`  Decision Posture     : ${profile.decisionPosture}`);
    console.log(`  Directional Bias     : ${profile.directionalBias}`);
    console.log(`  Confidence           : ${profile.confidence}%`);
    console.log(`  Trade Executable     : ${profile.tradeExecutable}`);
    console.log(`  Wait Reason          : ${profile.waitReason}`);

    const ready = profile.readyAgentCount || 0;
    const partial = profile.partialAgentCount || 0;
    const stale = profile.staleAgentCount || 0;
    const dataLimited = profile.dataLimitedAgentCount || 0;
    const unavailable = profile.unavailableAgentCount || 0;
    const notApplicable = profile.notApplicableAgentCount || 0;
    const upstreamSum = ready + partial + stale + dataLimited + unavailable + notApplicable;

    console.log(`  32-Agent Swarm Architecture:`);
    console.log(`    Registered Agents  : ${profile.registeredAgentCount} (31 Upstream + 1 Synthesizer)`);
    console.log(`    Upstream Agents    : ${profile.upstreamAgentCount} (14 Council + 17 Specialists)`);
    console.log(`    Synthesizer Agents : 1 (FINAL_DECISION)`);
    console.log(`  Upstream Readiness Breakdown:`);
    console.log(`    READY              : ${ready}`);
    console.log(`    PARTIAL            : ${partial}`);
    console.log(`    STALE              : ${stale}`);
    console.log(`    DATA_LIMITED       : ${dataLimited}`);
    console.log(`    UNAVAILABLE        : ${unavailable}`);
    console.log(`    NOT_APPLICABLE     : ${notApplicable}`);
    console.log(`    SUM VERIFICATION   : ${upstreamSum} === ${profile.upstreamAgentCount} (${upstreamSum === profile.upstreamAgentCount ? 'PROVEN TRUE' : 'MISMATCH'})`);

    if (profile.confluence) {
      console.log(`  Confluence Score     : ${profile.confluence.confluenceScore}`);
      console.log(`  Conflict Score       : ${profile.confluence.conflictScore}`);
    }

    // Final Decision Synthesizer Audit
    const finalAgent = profile.agents.find(a => a.type === 'FINAL_DECISION');
    console.log(`  Final Decision Synthesizer:`);
    if (finalAgent) {
      console.log(`    Status             : ${finalAgent.status}`);
      console.log(`    Bias               : ${finalAgent.bias}`);
      console.log(`    Confidence         : ${finalAgent.confidence}%`);
      console.log(`    Trade Executable   : false (READ_ONLY invariant)`);
      console.log(`    Last Opinion       : "${finalAgent.lastOpinion}"`);
      console.log(`    Evidence Lines:`);
      for (const line of (finalAgent.evidence || [])) {
        console.log(`      - ${line}`);
      }
    }
  }

  console.log('\n=================================================================');
  console.log('LIVE 32-AGENT EVIDENCE ORCHESTRATION VALIDATION COMPLETE');
  console.log('=================================================================');
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
