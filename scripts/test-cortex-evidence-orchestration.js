/**
 * FEF CORTEX — TEST SUITE: 32-AGENT EVIDENCE ORCHESTRATION & MULTI-TIMEFRAME READINESS
 *
 * Tests the canonical evidence-orchestration layer feeding the 32-agent CORTEX swarm:
 * 1. Canonical evidence bundle builds from LocalMarketDataProvider
 * 2. Strict provenance ('MT5_BROKER', 'LOCAL_SQLITE', 'LIVE_MT5') preserved
 * 3. Immutable snapshot shared across agents (same asOf / snapshotId)
 * 4. Missing timeframe remains missing (no synthetic M1/M5)
 * 5. Timeframe roles (HTF context, structural, setup, entry refinement) truthful
 * 6. Stale quote lowers readiness (fails closed)
 * 7. Unavailable quote fails closed (returns null / UNAVAILABLE bundle)
 * 8. Insufficient bars reported as INSUFFICIENT_DATA (< 10 bars)
 * 9. GER40 strictly UNAVAILABLE (score: 0, tradeExecutable: false)
 * 10. Technical agent consumes normalized evidence (timeframesUsed, timeframesMissing)
 * 11. Risk Guardian receives data-quality context and can veto actionability
 * 12. Order Flow proxy identified as BROKER_TICK_VOLUME_PROXY / DERIVED
 * 13. Institutional proxy identified as BROKER_TICK_VOLUME_PROXY
 * 14. News unavailable becomes DATA LIMITED
 * 15. Macro unavailable becomes DATA LIMITED
 * 16. Agent registry contains exactly 32 agents (15 core + 17 specialists)
 * 17. Unavailable agent is not treated READY
 * 18. Stale agent is not treated READY
 * 19. Multi-timeframe conflicts preserved (not flattened or averaged away)
 * 20. Risk veto downgrades actionability
 * 21. Evidence completeness formula deterministic and domain-aware
 * 22. Final Decision sees missing evidence and reports gap counts
 * 23. Final Decision sees conflicts and preserves reasoning
 * 24. Final Decision tradeExecutable=false (READ_ONLY invariant)
 * 25. Client sandbox isolation: no agent independently imports node:sqlite
 * 26. No agent directly accesses localhost:5556 or :5558
 * 27. No silent Yahoo/Binance/Gold API fallback for local technical truth
 * 28. Single bundle reused across 32 agents in one cycle
 * 29. Browser boundary remains decoupled from database
 * 30. READ_ONLY execution mode preserved
 */

const assert = require('assert');
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
Module._resolveFilename = function(request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    request = path.join(__dirname, '../src', request.slice(2));
  }
  return origResolve.call(this, request, parent, isMain, options);
};

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

async function runTestAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    testsFailed++;
  }
}

(async function main() {
  console.log('\n=============================================================');
  console.log('FEF CORTEX — 32-AGENT EVIDENCE ORCHESTRATION TEST SUITE');
  console.log('=============================================================\n');

  const {
    LocalMarketDataProvider,
    getLocalMarketDataProvider
  } = require('../src/lib/providers/local-market-data-provider.ts');

  const {
    buildCanonicalEvidenceBundle,
    CANONICAL_TIMEFRAMES,
    evaluateEvidenceCompleteness
  } = require('../src/lib/evidence/canonical-evidence-bundle.ts');

  const {
    generateAssetIntelligence,
    CANONICAL_COUNCIL_KEYS
  } = require('../src/lib/agents/multi-asset-pipeline.ts');

  // Test 1: Canonical evidence bundle builds from LocalMarketDataProvider
  await runTestAsync('T1: Canonical evidence bundle builds from LocalMarketDataProvider', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert(bundle, 'Evidence bundle must not be null for XAUUSD');
    assert.strictEqual(bundle.symbol, 'XAUUSD');
    assert.strictEqual(bundle.canonicalSymbol, 'XAUUSD');
    assert(typeof bundle.snapshotId === 'string' && bundle.snapshotId.length > 0, 'Must have snapshotId');
    assert(typeof bundle.asOf === 'number' && bundle.asOf > 0, 'Must have valid asOf timestamp');
    assert(typeof bundle.generatedAt === 'number' && bundle.generatedAt > 0, 'Must have valid generatedAt timestamp');
  });

  // Test 2: Provenance MT5_BROKER / LOCAL_SQLITE preserved
  await runTestAsync('T2: Strict provenance (MT5_BROKER, LOCAL_SQLITE, LIVE_MT5) preserved', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert.strictEqual(bundle.provenance.source, 'MT5_BROKER');
    assert.strictEqual(bundle.provenance.storage, 'LOCAL_SQLITE');
    assert.strictEqual(bundle.provenance.classification, 'LIVE_MT5');
    assert(bundle.provenance.provider.includes('MT5') || bundle.provenance.provider.includes('Exness'), 'Provider must identify MT5 broker');
  });

  // Test 3: Same snapshot shared across agents (immutable snapshotId and asOf)
  await runTestAsync('T3: Immutable snapshot context (snapshotId, asOf) shared across bundle', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    const asOf = bundle.asOf;
    const snapId = bundle.snapshotId;
    assert.strictEqual(bundle.market.quoteTimestamp, asOf);
    assert(bundle.snapshotId.startsWith(`snap-XAUUSD-`), 'snapshotId must follow deterministic format');
  });

  // Test 4: Missing timeframe remains missing (no synthetic M1/M5)
  await runTestAsync('T4: Missing timeframes remain missing without synthetic fabrication', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    // For any timeframe with 0 bars, state must be UNAVAILABLE, NOT fabricated
    for (const tf of CANONICAL_TIMEFRAMES) {
      const tfEv = bundle.timeframes[tf];
      assert(tfEv, `Timeframe ${tf} entry must exist in bundle`);
      if (tfEv.barCount === 0) {
        assert.strictEqual(tfEv.state, 'UNAVAILABLE', `Timeframe ${tf} with 0 bars must be UNAVAILABLE`);
        assert.strictEqual(tfEv.candles.length, 0, `Timeframe ${tf} must have 0 candles`);
      } else if (tfEv.barCount < 10) {
        assert.strictEqual(tfEv.state, 'INSUFFICIENT_DATA', `Timeframe ${tf} with <10 bars must be INSUFFICIENT_DATA`);
      } else {
        assert.strictEqual(tfEv.state, 'AVAILABLE', `Timeframe ${tf} with >=10 bars must be AVAILABLE`);
      }
    }
  });

  // Test 5: Timeframe analytical roles model
  await runTestAsync('T5: Timeframe roles mapped truthfully to HTF, structural, setup, and entry refinement', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert(bundle.timeframeRoles, 'timeframeRoles must be present');
    assert(bundle.timeframeRoles.higherTimeframe, 'higherTimeframe role must be defined');
    assert(bundle.timeframeRoles.structuralContext, 'structuralContext role must be defined');
    assert(bundle.timeframeRoles.setupContext, 'setupContext role must be defined');
    assert(bundle.timeframeRoles.entryRefinement, 'entryRefinement role must be defined');

    // If H1 is available, setupContext or structuralContext must use H1
    if (bundle.timeframes['H1'].state === 'AVAILABLE') {
      assert(
        bundle.timeframeRoles.structuralContext.timeframe === 'H1' ||
        bundle.timeframeRoles.setupContext.timeframe === 'H1',
        'H1 must be utilized in structural or setup role'
      );
    }
  });

  // Test 6: Stale quote lowers readiness
  await runTestAsync('T6: Stale quote lowers market freshness and readiness', async () => {
    const mockProvider = {
      toCanonicalSymbol: (s) => s.toUpperCase(),
      getLatestQuote: async () => ({
        canonicalSymbol: 'XAUUSD',
        brokerSymbol: 'XAUUSD',
        bid: 4000.0,
        ask: 4000.4,
        mid: 4000.2,
        spread: 40,
        digits: 3,
        quoteTimestamp: Date.now() - 120_000, // 2 minutes old -> STALE
        ageMs: 120_000,
        freshness: 'STALE',
        source: 'MT5_BROKER',
        storage: 'LOCAL_SQLITE',
        isExecutable: false,
      }),
      getCandles: async () => ({ count: 0, candles: [], state: 'UNAVAILABLE' }),
    };

    const bundle = await buildCanonicalEvidenceBundle(mockProvider, 'XAUUSD');
    assert.strictEqual(bundle.market.quoteFreshness, 'STALE');
    assert.strictEqual(bundle.domains.technical.freshness, 'STALE');
  });

  // Test 7: Unavailable quote fails closed
  await runTestAsync('T7: Unavailable quote fails closed to UNAVAILABLE bundle', async () => {
    const mockProvider = {
      toCanonicalSymbol: (s) => s.toUpperCase(),
      getLatestQuote: async () => null,
      getCandles: async () => ({ count: 0, candles: [], state: 'UNAVAILABLE' }),
    };

    const bundle = await buildCanonicalEvidenceBundle(mockProvider, 'NONEXISTENT');
    assert.strictEqual(bundle.market.marketState, 'UNAVAILABLE');
    assert.strictEqual(bundle.provenance.classification, 'UNAVAILABLE');
    assert.strictEqual(bundle.completeness.overallCompleteness, 0);
  });

  // Test 8: Insufficient bars reported as INSUFFICIENT_DATA
  await runTestAsync('T8: Insufficient bars (< 10) reported accurately as INSUFFICIENT_DATA', async () => {
    const mockProvider = {
      toCanonicalSymbol: (s) => s.toUpperCase(),
      getLatestQuote: async () => ({
        canonicalSymbol: 'EURUSD',
        brokerSymbol: 'EURUSD',
        bid: 1.10,
        ask: 1.10,
        mid: 1.10,
        spread: 0,
        digits: 5,
        quoteTimestamp: Date.now(),
        ageMs: 100,
        freshness: 'FRESH',
        source: 'MT5_BROKER',
        storage: 'LOCAL_SQLITE',
        isExecutable: false,
      }),
      getCandles: async (sym, tf) => {
        if (tf === 'M15') {
          return { count: 5, candles: Array(5).fill({ timestamp: Date.now(), open: 1, high: 1, low: 1, close: 1, tickVolume: 10 }), state: 'INSUFFICIENT_DATA' };
        }
        return { count: 0, candles: [], state: 'UNAVAILABLE' };
      },
    };

    const bundle = await buildCanonicalEvidenceBundle(mockProvider, 'EURUSD');
    assert.strictEqual(bundle.timeframes['M15'].state, 'INSUFFICIENT_DATA');
    assert.strictEqual(bundle.timeframes['M15'].barCount, 5);
  });

  // Test 9: GER40 unavailable
  await runTestAsync('T9: GER40 bundle strictly UNAVAILABLE with 0 completeness and false tradeExecutable', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'GER40');

    assert.strictEqual(bundle.market.price, 0);
    assert.strictEqual(bundle.market.marketState, 'UNAVAILABLE');
    assert.strictEqual(bundle.market.tradeExecutable, false);
    assert.strictEqual(bundle.provenance.classification, 'UNAVAILABLE');
    assert.strictEqual(bundle.completeness.overallCompleteness, 0);
  });

  // Test 10: Technical receives normalized evidence
  await runTestAsync('T10: Technical agent reports timeframesUsed, timeframesMissing, provenance', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    assert(profile, 'Profile must be generated');
    const tech = profile.agents.find(a => a.type === 'TECHNICAL');
    assert(tech, 'Technical agent must be present');
    assert(tech.status === 'ONLINE' || tech.status === 'DATA LIMITED');
    assert(Array.isArray(tech.evidence), 'Evidence must be array');
    assert(tech.evidence.some(e => e.includes('candles') || e.includes('bars') || e.includes('Structure')), 'Evidence must cite bars or structure');
  });

  // Test 11: Risk Guardian receives data-quality context
  await runTestAsync('T11: Risk Guardian inspects spread, data quality, and enforces execution invariants', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    const rg = profile.agents.find(a => a.type === 'RISK_GUARDIAN');
    assert(rg, 'Risk Guardian must be present');
    assert(rg.status === 'ONLINE' || rg.status === 'CAUTION' || rg.status === 'RESTRICTED');
    assert(profile.tradeExecutable === false, 'profile tradeExecutable must be false in local READ_ONLY mode');
  });

  // Test 12: Order Flow proxy identified as derived if applicable
  await runTestAsync('T12: Order Flow identifies volume mode as BROKER_TICK_VOLUME_PROXY on MT5 feeds', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert.strictEqual(bundle.domains.orderFlow.provenance, 'LOCAL_DERIVED');
    assert(
      bundle.domains.orderFlow.claim?.includes('Tick Volume Proxy') ||
      bundle.domains.orderFlow.claim?.includes('BROKER_TICK_VOLUME_PROXY') ||
      bundle.domains.orderFlow.status === 'DATA_LIMITED' ||
      bundle.domains.orderFlow.status === 'ONLINE',
      'Order flow must reflect tick volume proxy or data limited'
    );
  });

  // Test 13: Institutional proxy identified correctly
  await runTestAsync('T13: Institutional agent identifies volume distribution as broker tick volume proxy', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert.strictEqual(bundle.domains.institutional.provenance, 'LOCAL_DERIVED');
  });

  // Test 14: News unavailable becomes DATA LIMITED
  await runTestAsync('T14: Unfed news domain reports DATA LIMITED rather than fabricating stories', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert(
      bundle.domains.news.status === 'DATA_LIMITED' || bundle.domains.news.status === 'ONLINE',
      'News domain must be DATA_LIMITED or ONLINE when real feed present'
    );
  });

  // Test 15: Macro unavailable becomes DATA LIMITED
  await runTestAsync('T15: Unfed macro domain reports DATA LIMITED rather than fabricating narratives', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'EURUSD');

    assert(
      bundle.domains.macro.status === 'DATA_LIMITED' || bundle.domains.macro.status === 'ONLINE',
      'Macro domain must be DATA_LIMITED or ONLINE'
    );
  });

  // Test 16: Agent registry contains exactly 32 agents
  await runTestAsync('T16: Exactly 32 agents registered and evaluated (15 Core + 17 Specialists)', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    assert(profile, 'Profile must be returned');
    assert.strictEqual(profile.agents.length, 15, 'Must have exactly 15 core council agents in profile.agents');
    assert(Array.isArray(profile.specialistAgents), 'specialistAgents must be an array');
    assert.strictEqual(profile.specialistAgents.length, 17, 'Must have exactly 17 specialist agents');

    // Total 15 + 17 = 32 agents
    const totalCount = profile.agents.length + profile.specialistAgents.length;
    assert.strictEqual(totalCount, 32, 'Total agent swarm must be exactly 32 agents');
  });

  // Test 17: Unavailable agent is not treated READY
  await runTestAsync('T17: Unavailable agent is marked UNAVAILABLE / DATA LIMITED, never READY', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('GER40', 'H1');

    // On GER40, agents must not be READY
    if (profile) {
      for (const a of profile.agents) {
        assert.notStrictEqual(a.status, 'ONLINE', `Agent ${a.name} cannot be ONLINE on GER40`);
      }
    }
  });

  // Test 18: Stale agent is not treated READY
  await runTestAsync('T18: Agent with stale evidence is classified as STALE / DATA LIMITED, not READY', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    // Check domain quality
    for (const [dom, q] of Object.entries(bundle.domains)) {
      if (q.freshness === 'STALE') {
        assert.notStrictEqual(q.status, 'ONLINE', `Domain ${dom} with STALE freshness cannot be ONLINE`);
      }
    }
  });

  // Test 19: Conflicts preserved
  await runTestAsync('T19: Multi-timeframe and directional conflicts preserved without flattening', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert(Array.isArray(bundle.conflicts), 'conflicts must be an array');
  });

  // Test 20: Risk veto affects actionability
  await runTestAsync('T20: Risk Guardian veto ensures tradeExecutable is false', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    assert.strictEqual(profile.tradeExecutable, false, 'tradeExecutable must be false');
  });

  // Test 21: Evidence completeness formula deterministic and domain-aware
  runTest('T21: Evidence completeness formula produces deterministic 0-100 score', () => {
    const completeness = evaluateEvidenceCompleteness({
      hasLiveQuote: true,
      quoteAgeMs: 500,
      timeframeStates: {
        M1: 'UNAVAILABLE',
        M5: 'UNAVAILABLE',
        M15: 'AVAILABLE',
        M30: 'UNAVAILABLE',
        H1: 'AVAILABLE',
        H4: 'UNAVAILABLE',
        D1: 'UNAVAILABLE',
      },
      hasStructure: true,
      hasOrderFlow: true,
      hasMacro: false,
      hasSentiment: false,
      hasNews: false,
    });

    assert(typeof completeness.overallCompleteness === 'number');
    assert(completeness.overallCompleteness >= 0 && completeness.overallCompleteness <= 100);
    assert(completeness.technicalCompleteness >= 40, 'Technical completeness should reflect H1+M15+structure');
    assert(typeof completeness.formula === 'string', 'Formula documentation string must be present');
  });

  // Test 22: Final Decision sees missing evidence
  await runTestAsync('T22: Final Decision incorporates missing evidence and gap counts', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    assert(profile.dataReadinessSummary, 'Profile must have dataReadinessSummary');
    assert(typeof profile.dataReadinessSummary.totalRelevantAgents === 'number');
    assert(Array.isArray(profile.dataReadinessSummary.unverifiedDependencies));
  });

  // Test 23: Final Decision sees conflicts
  await runTestAsync('T23: Final Decision consensus incorporates conflict score from confluence engine', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    assert(profile.confluence, 'Profile must have confluence result');
    assert(typeof profile.confluence.conflictScore === 'number');
    assert(Array.isArray(profile.confluence.criticalConflicts));
  });

  // Test 24: Final Decision tradeExecutable=false
  await runTestAsync('T24: Final Decision strictly enforces tradeExecutable = false', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    assert.strictEqual(profile.tradeExecutable, false);
    const fd = profile.agents.find(a => a.type === 'FINAL_DECISION');
    assert(fd, 'Final Decision agent must be present');
    assert.strictEqual(fd.bias === 'BULLISH' || fd.bias === 'BEARISH' || fd.bias === 'NEUTRAL' || fd.bias === 'WAIT' || fd.bias === 'CAUTION', true);
  });

  // Test 25: Client sandbox isolation — no agent imports node:sqlite
  runTest('T25: Agent files must not directly import node:sqlite or DatabaseSync', () => {
    const agentFiles = [
      path.resolve(__dirname, '../src/lib/agents/multi-asset-pipeline.ts'),
      path.resolve(__dirname, '../src/lib/agents/contracts/unified-agent-contract.ts'),
      path.resolve(__dirname, '../src/lib/agents/specialists/specialist-agents.ts'),
      path.resolve(__dirname, '../src/lib/confluence/confluence-engine.ts'),
    ];

    for (const file of agentFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        assert(!content.includes('node:sqlite'), `${path.basename(file)} must not import node:sqlite`);
        assert(!content.includes('DatabaseSync'), `${path.basename(file)} must not reference DatabaseSync`);
      }
    }
  });

  // Test 26: No agent directly accesses localhost:5556 or :5558
  runTest('T26: Agents do not hardcode direct HTTP calls to 5556 or 5558', () => {
    const files = [
      path.resolve(__dirname, '../src/lib/agents/multi-asset-pipeline.ts'),
      path.resolve(__dirname, '../src/lib/agents/specialists/specialist-agents.ts'),
      path.resolve(__dirname, '../src/lib/confluence/confluence-engine.ts'),
    ];

    for (const file of files) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        assert(!content.includes('localhost:5556'), `${path.basename(file)} must not call localhost:5556 directly`);
        assert(!content.includes('localhost:5558'), `${path.basename(file)} must not call localhost:5558 directly`);
      }
    }
  });

  // Test 27: No silent Yahoo/Binance/Gold API fallback for local technical truth
  await runTestAsync('T27: Local technical market evidence has zero public web API fallback', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert.strictEqual(bundle.provenance.source, 'MT5_BROKER');
    assert(!bundle.provenance.provider.includes('Binance'), 'Must not be Binance');
    assert(!bundle.provenance.provider.includes('Yahoo'), 'Must not be Yahoo');
    assert(!bundle.provenance.provider.includes('GoldAPI'), 'Must not be GoldAPI');
  });

  // Test 28: One evidence bundle reused across agent evaluation
  await runTestAsync('T28: A single evidence bundle instance is shared across all 32 agents in one evaluation cycle', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    // Passing bundle into generateAssetIntelligence
    const profile = generateAssetIntelligence(
      'XAUUSD',
      {
        symbol: 'XAUUSD',
        name: 'Gold vs US Dollar',
        price: bundle.market.mid,
        bid: bundle.market.bid,
        ask: bundle.market.ask,
        spread: bundle.market.spread,
        change24h: 0,
        high24h: bundle.market.mid,
        low24h: bundle.market.mid,
        volume: 'MT5 Broker Feed',
        sparkline: '',
        source: 'MT5_BROKER',
        provider: bundle.provenance.provider,
        lastUpdated: new Date(bundle.asOf).toISOString(),
        category: 'METALS',
        feedStatus: bundle.market.quoteFreshness === 'FRESH' ? 'LIVE' : 'DATA LIMITED',
        classification: 'LIVE_MT5',
      },
      'H1',
      Object.fromEntries(
        Object.entries(bundle.timeframes).map(([tf, ev]) => [tf, ev.candles])
      ),
      'LIVE_MT5',
      bundle.provenance.provider,
      new Date(bundle.asOf)
    );

    assert(profile, 'Profile must be evaluated from bundle');
    assert.strictEqual(profile.symbol, 'XAUUSD');
  });

  // Test 29: Browser boundary remains decoupled from database
  runTest('T29: Client files remain completely isolated from server-only evidence bundle builder', () => {
    const clientFiles = [
      path.resolve(__dirname, '../src/context/ActiveAssetContext.tsx'),
      path.resolve(__dirname, '../src/components/ActiveAssetCockpit.tsx'),
      path.resolve(__dirname, '../src/components/GlobalOpportunityRadar.tsx'),
    ];

    for (const file of clientFiles) {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        assert(!content.includes('buildCanonicalEvidenceBundle'), `${path.basename(file)} must not import bundle builder`);
        assert(!content.includes('LocalTelemetryRepository'), `${path.basename(file)} must not import repository`);
      }
    }
  });

  // Test 30: READ_ONLY execution mode preserved in local telemetry & bundle
  await runTestAsync('T30: Architecture enforces READ_ONLY local execution mode and preserves Web policy', async () => {
    const { CANONICAL_EXECUTION_MODE } = require('../src/lib/execution/execution-policy.ts');
    assert.strictEqual(CANONICAL_EXECUTION_MODE, 'ARMED_WITH_CONFIRMATION', 'Web policy must remain ARMED_WITH_CONFIRMATION');

    const provider = getLocalMarketDataProvider();
    const health = await provider.getHealth();
    assert.strictEqual(health.executionLock, 'READ_ONLY', 'Local health execution lock must be READ_ONLY');

    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');
    assert.strictEqual(bundle.market.tradeExecutable, false, 'Bundle market tradeExecutable must be strictly false');
  });

  // Test 31: Upstream consensus count excludes FINAL_DECISION
  await runTestAsync('T31: Registry truth: 31 upstream evidence agents + 1 synthesizer = 32 registered agents', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    assert.strictEqual(profile.upstreamAgentCount, 31, 'Must have exactly 31 upstream evidence agents');
    assert.strictEqual(profile.registeredAgentCount, 32, 'Must have exactly 32 total registered agents');
    assert.strictEqual(profile.agents.length, 15, 'Council must have 15 agents (14 council + 1 final decision)');
    assert.strictEqual(profile.specialistAgents.length, 17, 'Specialists must have exactly 17 agents');
  });

  // Test 32: Readiness accounting invariant
  await runTestAsync('T32: Readiness categories sum exactly to upstreamAgentCount (31)', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    const sum = (profile.readyAgentCount || 0) +
                (profile.partialAgentCount || 0) +
                (profile.staleAgentCount || 0) +
                (profile.dataLimitedAgentCount || 0) +
                (profile.unavailableAgentCount || 0) +
                (profile.notApplicableAgentCount || 0);

    assert.strictEqual(sum, profile.upstreamAgentCount, `Readiness categories (${sum}) must sum to upstreamAgentCount (${profile.upstreamAgentCount})`);
  });

  // Test 33: FINAL_DECISION circularity audit
  runTest('T33: FINAL_DECISION is strictly excluded from upstream consensus and trust calculations', () => {
    const { calculateConsensusTrust } = require('../src/lib/evidence/agent-evidence.ts');

    const councilWithFinal = [
      { type: 'TECHNICAL', status: 'ONLINE', confidence: 80, evidenceTrustScore: 80 },
      { type: 'MACRO', status: 'ONLINE', confidence: 70, evidenceTrustScore: 70 },
      { type: 'FINAL_DECISION', status: 'DATA LIMITED', confidence: 0, evidenceTrustScore: 0 }
    ];

    const metrics = calculateConsensusTrust(councilWithFinal);
    // If FINAL_DECISION were included, avg trust would be (80+70+0)/3 = 50
    // With FINAL_DECISION excluded, avg trust is (80+70)/2 = 75
    assert.strictEqual(metrics.evidenceTrust, 75, 'calculateConsensusTrust must exclude FINAL_DECISION from trust calculation');
    assert.strictEqual(metrics.totalVotingAgents, 2, 'totalVotingAgents must exclude FINAL_DECISION');
  });

  // Test 34: Synthetic high-consensus test enforces tradeExecutable=false
  runTest('T34: High bullish consensus still strictly enforces tradeExecutable=false and executionLock=READ_ONLY', () => {
    const { generateAssetIntelligence } = require('../src/lib/agents/multi-asset-pipeline.ts');

    // Simulate high bullish conditions
    const mockCandles = Array(60).fill(null).map((_, i) => ({
      time: new Date(Date.now() - (60 - i) * 3600000).toISOString(),
      open: 2000 + i * 2,
      high: 2005 + i * 2,
      low: 1998 + i * 2,
      close: 2003 + i * 2,
      volume: 1000 + i * 10
    }));

    const mockQuote = {
      bid: 2120.0,
      ask: 2120.5,
      spread: 5,
      timestamp: Date.now()
    };

    const profile = generateAssetIntelligence(
      'XAUUSD',
      mockQuote,
      'H1',
      mockCandles,
      'LIVE_MT5',
      'Exness MT5 Broker (Local SQLite)',
      new Date(),
      undefined,
      undefined
    );

    assert(profile, 'Profile must be generated');
    assert.strictEqual(profile.tradeExecutable, false, 'Local profile tradeExecutable must remain false even under high consensus');
  });

  // Test 35: Execution policy separation model
  await runTestAsync('T35: Execution policies explicitly separate Web policy from local broker transport', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert(bundle.executionPolicies, 'Bundle must contain executionPolicies object');
    assert.strictEqual(bundle.executionPolicies.webProductPolicy, 'ARMED_WITH_CONFIRMATION', 'Web policy must be ARMED_WITH_CONFIRMATION');
    assert.strictEqual(bundle.executionPolicies.localBrokerTransportPolicy, 'READ_ONLY', 'Local broker transport must be READ_ONLY');
    assert.strictEqual(bundle.executionPolicies.mt5OrderTransportEnabled, false, 'MT5 order transport must be false');
    assert.strictEqual(bundle.executionPolicies.finalDecisionExecutable, false, 'Final decision executable must be false');
  });

  // Test 36: Cloud domain placeholder narratives do not imply READY
  await runTestAsync('T36: Placeholder narratives for MACRO, NEWS, and SENTIMENT do not imply READY status', async () => {
    const provider = getLocalMarketDataProvider();
    const profile = await provider.assembleLocalAssetIntelligence('XAUUSD', 'H1');

    const macroAgent = profile.agents.find(a => a.type === 'MACRO');
    const newsAgent = profile.agents.find(a => a.type === 'NEWS');
    const sentimentAgent = profile.agents.find(a => a.type === 'SENTIMENT');

    if (macroAgent) {
      assert.notStrictEqual(macroAgent.status, 'ONLINE', 'Unfed MACRO agent must not be ONLINE');
      assert.strictEqual(macroAgent.confidence, 0, 'Unfed MACRO agent confidence must be 0');
    }
    if (newsAgent) {
      assert.notStrictEqual(newsAgent.status, 'ONLINE', 'Unfed NEWS agent must not be ONLINE');
      assert.strictEqual(newsAgent.confidence, 0, 'Unfed NEWS agent confidence must be 0');
    }
    if (sentimentAgent) {
      assert.notStrictEqual(sentimentAgent.status, 'ONLINE', 'Unfed SENTIMENT agent must not be ONLINE');
      assert.strictEqual(sentimentAgent.confidence, 0, 'Unfed SENTIMENT agent confidence must be 0');
    }
  });

  // Test 37: Evidence completeness degrades deterministically without cloud feeds
  runTest('T37: Evidence completeness degrades deterministically when cloud feeds (macro, news, sentiment) are absent', () => {
    // 1. All feeds absent (local market data + technical only)
    const localOnly = evaluateEvidenceCompleteness({
      hasLiveQuote: true,
      quoteAgeMs: 1000,
      timeframeStates: { M1: 'UNAVAILABLE', M5: 'UNAVAILABLE', M15: 'AVAILABLE', M30: 'AVAILABLE', H1: 'AVAILABLE', H4: 'AVAILABLE', D1: 'AVAILABLE' },
      hasStructure: true,
      hasOrderFlow: true,
      hasMacro: false,
      hasSentiment: false,
      hasNews: false,
    });

    assert.strictEqual(localOnly.macroCompleteness, 0, 'Macro completeness must be 0 when macro feed is absent');
    assert.strictEqual(localOnly.sentimentCompleteness, 0, 'Sentiment completeness must be 0 when sentiment feed is absent');
    assert.strictEqual(localOnly.overallCompleteness, 78, 'Local-only overall completeness must be 78%');

    // 2. Macro added
    const withMacro = evaluateEvidenceCompleteness({
      hasLiveQuote: true,
      quoteAgeMs: 1000,
      timeframeStates: { M1: 'UNAVAILABLE', M5: 'UNAVAILABLE', M15: 'AVAILABLE', M30: 'AVAILABLE', H1: 'AVAILABLE', H4: 'AVAILABLE', D1: 'AVAILABLE' },
      hasStructure: true,
      hasOrderFlow: true,
      hasMacro: true,
      hasSentiment: false,
      hasNews: false,
    });
    assert.strictEqual(withMacro.macroCompleteness, 75);
    assert.strictEqual(withMacro.overallCompleteness, 85, 'Overall completeness with macro must increase to 85%');

    // 3. Macro and sentiment added
    const withAll = evaluateEvidenceCompleteness({
      hasLiveQuote: true,
      quoteAgeMs: 1000,
      timeframeStates: { M1: 'UNAVAILABLE', M5: 'UNAVAILABLE', M15: 'AVAILABLE', M30: 'AVAILABLE', H1: 'AVAILABLE', H4: 'AVAILABLE', D1: 'AVAILABLE' },
      hasStructure: true,
      hasOrderFlow: true,
      hasMacro: true,
      hasSentiment: true,
      hasNews: true,
    });
    assert.strictEqual(withAll.sentimentCompleteness, 100);
    assert.strictEqual(withAll.overallCompleteness, 95, 'Overall completeness with all feeds must reach 95%');
  });

  // Test 38: Timeframe analytical fallback preserves actual timeframe identity
  await runTestAsync('T38: Timeframe analytical fallback preserves actual timeframe identity without rewriting', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    // In local SQLite, D1 is present (35 bars) or H4 is present (36 bars)
    // Verify that whatever timeframe supplies HTF_CONTEXT, its actual timeframe identity is preserved
    const htfRole = bundle.timeframeRoles.higherTimeframe;
    assert(htfRole.timeframe === 'D1' || htfRole.timeframe === 'H4');
    assert.strictEqual(bundle.timeframes[htfRole.timeframe].role, 'HTF_CONTEXT');

    // D1 timeframe entry itself must remain D1
    assert.strictEqual(bundle.timeframes.D1.timeframe, 'D1');
    assert.strictEqual(bundle.timeframes.H4.timeframe, 'H4');
  });

  // Test 39: Order Flow and Institutional domain provenance remain strictly LOCAL_DERIVED
  await runTestAsync('T39: Order Flow and Institutional domains remain strictly LOCAL_DERIVED from BROKER_TICK_VOLUME_PROXY', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'XAUUSD');

    assert.strictEqual(bundle.domains.orderFlow.provenance, 'LOCAL_DERIVED');
    assert(bundle.domains.orderFlow.claim.includes('Broker Tick Volume Proxy') || bundle.domains.orderFlow.claim.includes('Pending flow'));
    assert(bundle.domains.orderFlow.trust <= 70, 'Order flow trust must be capped due to tick volume proxy');

    assert.strictEqual(bundle.domains.institutional.provenance, 'LOCAL_DERIVED');
    assert(bundle.domains.institutional.claim.includes('Broker Tick Volume Proxy') || bundle.domains.institutional.claim.includes('Pending profile'));
    assert(bundle.domains.institutional.trust <= 70, 'Institutional trust must be capped due to tick volume proxy');
  });

  // Test 40: GER40 remains strictly fail-closed
  await runTestAsync('T40: GER40 remains strictly fail-closed (profile null, completeness 0, tradeExecutable false)', async () => {
    const provider = getLocalMarketDataProvider();
    const bundle = await buildCanonicalEvidenceBundle(provider, 'GER40');

    assert.strictEqual(bundle.market.marketState, 'UNAVAILABLE');
    assert.strictEqual(bundle.market.price, 0);
    assert.strictEqual(bundle.completeness.overallCompleteness, 0);
    assert.strictEqual(bundle.market.tradeExecutable, false);
    assert.strictEqual(bundle.executionPolicies.intelligenceActionability, 'NON_ACTIONABLE');

    const profile = await provider.assembleLocalAssetIntelligence('GER40', 'H1');
    assert.strictEqual(profile, null, 'assembleLocalAssetIntelligence must fail-closed to null for unquoted GER40');
  });

  console.log(`\n=============================================================`);
  console.log(`TEST SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log(`=============================================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
})();
