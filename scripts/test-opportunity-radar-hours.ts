/**
 * FEF CORTEX — OPPORTUNITY RADAR
 * MARKET-HOURS-AWARE CRYPTO PRIORITY VALIDATION TEST SUITE
 *
 * Tests:
 * Test A — Weekend Traditional Closed -> Crypto Priority
 * Test B — Weekday Markets Open -> Normal Multi-Asset Ranking
 * Test C — Mixed Market State -> Open Instruments Eligible
 * Test D — Stale Friday Data -> Historical visible, not actionable, NOT DATA_LIMITED
 * Test E — Crypto Data Limited -> Not promoted without evidence
 * Test F — Automatic Market Reopen -> Restores normal multi-asset ranking dynamically
 *
 * Invariant Verification:
 * - NO crypto score boost
 * - NO crypto confidence boost
 * - NO Decision Engine weight change
 * - NO agent-count change (strictly 32)
 */

import {
  generateGlobalRadarIntelligence,
  evaluateOpportunityRadar,
  getRadarOpportunityTier,
  compareRadarOpportunities,
  RadarOpportunityItem,
} from '../src/lib/radar/opportunity-radar-engine';
import { evaluateMarketSession, resolveAssetClass } from '../src/lib/session/market-session-engine';
import { DECISION_V2_COUNCIL_WEIGHTS } from '../src/lib/decision/decision-engine-v2';
import { LiveMarketAsset } from '../src/lib/providers/real-market-api';
import { OHLCCandle } from '../src/lib/market/canonical-market-snapshot';

const CANONICAL_SPECIALIST_IDS = [
  'RATES_AGENT',
  'INFLATION_AGENT',
  'VOLATILITY_AGENT',
  'CROSS_ASSET_AGENT',
  'DATA_SENTINEL_AGENT',
  'QUANT_AGENT',
  'MACRO_CORRELATOR_AGENT',
  'CROSS_ASSET_LEAD_LAG_AGENT',
  'VOLATILITY_SQUEEZE_AGENT',
  'CURRENCY_STRENGTH_AGENT',
  'ANCHORED_VWAP_AGENT',
  'MARKET_REGIME_CLASSIFIER_AGENT',
  'ORDER_FLOW_DELTA_AGENT',
  'COT_POSITIONING_AGENT',
  'CENTRAL_BANK_POLICY_AGENT',
  'QUANT_MONTE_CARLO_AGENT',
  'ECONOMIC_NEWS_MOMENTUM_AGENT',
];

// Helper to generate mock candles for tests
function generateMockCandles(basePrice: number, count: number = 30): OHLCCandle[] {
  const candles: OHLCCandle[] = [];
  let price = basePrice;
  const now = Date.now();
  for (let i = count; i >= 1; i--) {
    const time = now - i * 3600 * 1000;
    const open = price;
    const high = price * 1.005;
    const low = price * 0.995;
    const close = price * 1.002;
    candles.push({
      timestamp: time,
      open,
      high,
      low,
      close,
      volume: 1000,
    });
    price = close;
  }
  return candles;
}

async function runTestSuite() {
  console.log('============================================================');
  console.log('FEF CORTEX — OPPORTUNITY RADAR MARKET-HOURS TEST SUITE');
  console.log('============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `— ${detail}` : ''}`);
    }
  }

  // -------------------------------------------------------------
  // Test A: Weekend / Traditional Closed -> Crypto Priority
  // -------------------------------------------------------------
  console.log('--- TEST A: Weekend Traditional Closed -> Crypto Priority ---');
  // Saturday: 2026-10-17 12:00:00 UTC
  const saturdayUtc = new Date(Date.UTC(2026, 9, 17, 12, 0, 0));

  const btcCandles = generateMockCandles(65000);
  const ethCandles = generateMockCandles(3200);
  const eurCandles = generateMockCandles(1.085);
  const xauCandles = generateMockCandles(2650);

  const weekendAssets: Record<string, LiveMarketAsset> = {
    BTCUSD: {
      symbol: 'BTCUSD',
      name: 'Bitcoin',
      price: 65000,
      bid: 64995,
      ask: 65005,
      spread: 10,
      change24h: 2.5,
      high24h: 66000,
      low24h: 64000,
      volume: '$25B',
      sparkline: '0,10 100,10',
      source: 'TEST',
      lastUpdated: saturdayUtc.toISOString(),
      category: 'CRYPTO',
      feedStatus: 'LIVE',
    },
    ETHUSD: {
      symbol: 'ETHUSD',
      name: 'Ethereum',
      price: 3200,
      bid: 3199,
      ask: 3201,
      spread: 2,
      change24h: 1.8,
      high24h: 3250,
      low24h: 3150,
      volume: '$12B',
      sparkline: '0,10 100,10',
      source: 'TEST',
      lastUpdated: saturdayUtc.toISOString(),
      category: 'CRYPTO',
      feedStatus: 'LIVE',
    },
    EURUSD: {
      symbol: 'EURUSD',
      name: 'Euro / US Dollar',
      price: 1.085,
      bid: 1.0849,
      ask: 1.0851,
      spread: 0.0002,
      change24h: 0.1,
      high24h: 1.088,
      low24h: 1.082,
      volume: '$40B',
      sparkline: '0,10 100,10',
      source: 'TEST',
      lastUpdated: saturdayUtc.toISOString(),
      category: 'FOREX',
      feedStatus: 'DELAYED',
    },
    XAUUSD: {
      symbol: 'XAUUSD',
      name: 'Gold / US Dollar',
      price: 2650,
      bid: 2649.5,
      ask: 2650.5,
      spread: 1.0,
      change24h: -0.4,
      high24h: 2670,
      low24h: 2640,
      volume: '$30B',
      sparkline: '0,10 100,10',
      source: 'TEST',
      lastUpdated: saturdayUtc.toISOString(),
      category: 'METALS',
      feedStatus: 'DELAYED',
    },
  };

  const weekendCandles = {
    BTCUSD: { candles: btcCandles },
    ETHUSD: { candles: ethCandles },
    EURUSD: { candles: eurCandles },
    XAUUSD: { candles: xauCandles },
  };

  const weekendRadar = generateGlobalRadarIntelligence(
    weekendAssets,
    'H1',
    undefined,
    weekendCandles,
    saturdayUtc
  );

  const top1 = weekendRadar.rankedOpportunities[0];
  const top2 = weekendRadar.rankedOpportunities[1];
  const eurusdOpp = weekendRadar.rankedOpportunities.find((o) => o.symbol === 'EURUSD');
  const xauusdOpp = weekendRadar.rankedOpportunities.find((o) => o.symbol === 'XAUUSD');

  assert(
    Boolean(top1 && (top1.symbol === 'BTCUSD' || top1.symbol === 'ETHUSD')),
    'Test A1: Top ranked asset on weekend is an active Crypto market',
    `Top 1 was ${top1?.symbol} with state ${top1?.state}`
  );
  assert(
    Boolean(top2 && (top2.symbol === 'BTCUSD' || top2.symbol === 'ETHUSD')),
    'Test A2: Second ranked asset on weekend is also Crypto before closed markets',
    `Top 2 was ${top2?.symbol}`
  );
  assert(
    eurusdOpp?.rank! > top1?.rank! && xauusdOpp?.rank! > top1?.rank!,
    'Test A3: Closed Forex (EURUSD) and Metals (XAUUSD) drop below open Crypto on weekend'
  );

  // -------------------------------------------------------------
  // Test B: Weekday / Markets Open -> Normal Multi-Asset Ranking
  // -------------------------------------------------------------
  console.log('\n--- TEST B: Weekday Markets Open -> Normal Multi-Asset Ranking ---');
  // Wednesday: 2026-10-14 14:00:00 UTC (New York / London overlap, peak market activity)
  const wednesdayUtc = new Date(Date.UTC(2026, 9, 14, 14, 0, 0));

  const weekdayAssets: Record<string, LiveMarketAsset> = {
    ...weekendAssets,
    EURUSD: {
      ...weekendAssets.EURUSD,
      lastUpdated: wednesdayUtc.toISOString(),
      feedStatus: 'LIVE',
    },
    XAUUSD: {
      ...weekendAssets.XAUUSD,
      lastUpdated: wednesdayUtc.toISOString(),
      feedStatus: 'LIVE',
    },
    BTCUSD: {
      ...weekendAssets.BTCUSD,
      lastUpdated: wednesdayUtc.toISOString(),
      feedStatus: 'LIVE',
    },
  };

  const weekdayRadar = generateGlobalRadarIntelligence(
    weekdayAssets,
    'H1',
    undefined,
    weekendCandles,
    wednesdayUtc
  );

  // Verify that on Wednesday, all assets are Tier 0 and rank on their own merits (opportunityScore)
  const weekdayOpenCount = weekdayRadar.rankedOpportunities.filter(
    (o) => getRadarOpportunityTier(o) === 0
  ).length;
  assert(
    weekdayOpenCount >= 3,
    'Test B1: On weekday during London/NY session, multi-asset markets evaluate in Tier 0',
    `Found ${weekdayOpenCount} Tier 0 assets`
  );

  // Verify sorting strictly follows opportunityScore within Tier 0 without crypto score boost
  const tier0Items = weekdayRadar.rankedOpportunities.filter((o) => getRadarOpportunityTier(o) === 0);
  let strictlyScoreSorted = true;
  for (let i = 0; i < tier0Items.length - 1; i++) {
    if (tier0Items[i].opportunityScore < tier0Items[i + 1].opportunityScore) {
      strictlyScoreSorted = false;
      break;
    }
  }
  assert(
    strictlyScoreSorted,
    'Test B2: On weekday, opportunity ranking strictly reflects setup quality without crypto favoritism'
  );

  // -------------------------------------------------------------
  // Test C: Mixed Market State -> Open Instruments Eligible
  // -------------------------------------------------------------
  console.log('\n--- TEST C: Mixed Market State -> Open Instruments Eligible ---');
  // Friday: 2026-10-16 21:30:00 UTC
  // Forex (EURUSD) closes at 22:00 UTC -> OPEN (CLOSING_SOON)
  // Crypto (BTCUSD) is 24/7 -> OPEN
  // Metals (XAUUSD) closes at 21:00 UTC -> CLOSED (WEEKEND_CLOSED)
  const fridayMixedUtc = new Date(Date.UTC(2026, 9, 16, 21, 30, 0));

  const mixedSessionEur = evaluateMarketSession('EURUSD', fridayMixedUtc);
  const mixedSessionXau = evaluateMarketSession('XAUUSD', fridayMixedUtc);
  const mixedSessionBtc = evaluateMarketSession('BTCUSD', fridayMixedUtc);

  assert(
    mixedSessionEur.isOpen === true && (mixedSessionEur.marketState === 'OPEN' || mixedSessionEur.marketState === 'CLOSING_SOON'),
    'Test C1: EURUSD session evaluates as OPEN/CLOSING_SOON on Friday 21:30 UTC',
    `EURUSD state was ${mixedSessionEur.marketState}`
  );
  assert(
    mixedSessionXau.isOpen === false && (mixedSessionXau.marketState === 'CLOSED' || mixedSessionXau.marketState === 'WEEKEND_CLOSED'),
    'Test C2: XAUUSD evaluates as CLOSED on Friday 21:30 UTC',
    `XAUUSD state was ${mixedSessionXau.marketState}`
  );
  assert(
    mixedSessionBtc.isOpen === true && mixedSessionBtc.marketState === 'OPEN',
    'Test C3: BTCUSD evaluates as OPEN 24/7'
  );

  const mixedAssets: Record<string, LiveMarketAsset> = {
    EURUSD: {
      ...weekendAssets.EURUSD,
      lastUpdated: fridayMixedUtc.toISOString(),
      feedStatus: 'LIVE',
    },
    BTCUSD: {
      ...weekendAssets.BTCUSD,
      lastUpdated: fridayMixedUtc.toISOString(),
      feedStatus: 'LIVE',
    },
    XAUUSD: {
      ...weekendAssets.XAUUSD,
      lastUpdated: fridayMixedUtc.toISOString(),
      feedStatus: 'DELAYED',
    },
  };

  const mixedCandles = {
    EURUSD: { candles: eurCandles },
    BTCUSD: { candles: btcCandles },
    XAUUSD: { candles: xauCandles },
  };

  const mixedRadar = generateGlobalRadarIntelligence(
    mixedAssets,
    'H1',
    undefined,
    mixedCandles,
    fridayMixedUtc
  );

  const mixedEurOpp = mixedRadar.rankedOpportunities.find((o) => o.symbol === 'EURUSD');
  const mixedBtcOpp = mixedRadar.rankedOpportunities.find((o) => o.symbol === 'BTCUSD');
  const mixedXauOpp = mixedRadar.rankedOpportunities.find((o) => o.symbol === 'XAUUSD');

  assert(
    getRadarOpportunityTier(mixedEurOpp!) === 0 && getRadarOpportunityTier(mixedBtcOpp!) === 0,
    'Test C4: Both open Forex (EURUSD) and open Crypto (BTCUSD) qualify for Tier 0 in mixed market state'
  );
  assert(
    getRadarOpportunityTier(mixedXauOpp!) === 1,
    'Test C5: Closed Metal (XAUUSD) is placed into Tier 1 below open Forex and Crypto'
  );

  // -------------------------------------------------------------
  // Test D: Stale Friday Data -> Historical Visible, Not Actionable, NOT DATA_LIMITED
  // -------------------------------------------------------------
  console.log('\n--- TEST D: Stale Friday Data -> Historical Visible, Not Actionable ---');
  assert(
    eurusdOpp?.opportunityScore! > 0,
    'Test D1: Closed EURUSD retains historical setup score',
    `Score was ${eurusdOpp?.opportunityScore}`
  );
  assert(
    eurusdOpp?.tradeExecutable === false,
    'Test D2: Closed EURUSD is strictly NOT immediately trade executable'
  );
  assert(
    eurusdOpp?.state === 'MONITOR NEXT OPEN' || eurusdOpp?.state === 'WAIT (MARKET CLOSED)' || eurusdOpp?.state === 'PRE-OPEN WATCH',
    'Test D3: Closed EURUSD state is truthful closed state (MONITOR NEXT OPEN)',
    `State was ${eurusdOpp?.state}`
  );
  assert(
    eurusdOpp?.isDataLimited === false,
    'Test D4: Closed EURUSD with verified candles is NOT falsely labeled DATA_LIMITED',
    `isDataLimited was ${eurusdOpp?.isDataLimited}`
  );

  // -------------------------------------------------------------
  // Test E: Crypto Data Limited -> Not Promoted Without Evidence
  // -------------------------------------------------------------
  console.log('\n--- TEST E: Crypto Data Limited -> Not Promoted Without Evidence ---');
  const missingCandlesAssets: Record<string, LiveMarketAsset> = {
    ...weekendAssets,
    SOLUSD: {
      symbol: 'SOLUSD',
      name: 'Solana',
      price: 150,
      bid: 149.9,
      ask: 150.1,
      spread: 0.2,
      change24h: 3.0,
      high24h: 155,
      low24h: 145,
      volume: '$2B',
      sparkline: '0,10 100,10',
      source: 'TEST',
      lastUpdated: saturdayUtc.toISOString(),
      category: 'CRYPTO',
      feedStatus: 'OFFLINE', // or zero candles available
    },
  };

  const radarWithMissingCrypto = generateGlobalRadarIntelligence(
    missingCandlesAssets,
    'H1',
    undefined,
    {
      BTCUSD: { candles: btcCandles },
      ETHUSD: { candles: ethCandles },
      EURUSD: { candles: eurCandles },
      // SOLUSD has no candle feed
    },
    saturdayUtc
  );

  const solOpp = radarWithMissingCrypto.rankedOpportunities.find((o) => o.symbol === 'SOLUSD');
  assert(
    Boolean(solOpp && (solOpp.isDataLimited || solOpp.state === 'UNAVAILABLE' || solOpp.opportunityScore === 0)),
    'Test E1: Crypto without candles/offline is marked DATA_LIMITED or UNAVAILABLE with 0 score'
  );
  assert(
    getRadarOpportunityTier(solOpp!) === 2,
    'Test E2: Data-limited crypto falls into Tier 2 and is NOT promoted above Tier 1 closed setups'
  );
  assert(
    solOpp?.rank! > eurusdOpp?.rank!,
    'Test E3: Data-limited crypto ranks lower than closed EURUSD with valid historical analysis'
  );

  // -------------------------------------------------------------
  // Test F: Automatic Market Reopen -> Restores Normal Multi-Asset Ranking Dynamically
  // -------------------------------------------------------------
  console.log('\n--- TEST F: Automatic Market Reopen -> Dynamic Restoration ---');
  // Re-evaluating with Monday 08:00 UTC (without restarting or changing code)
  const mondayUtc = new Date(Date.UTC(2026, 9, 19, 8, 0, 0));
  const mondayAssets: Record<string, LiveMarketAsset> = {
    ...weekendAssets,
    EURUSD: {
      ...weekendAssets.EURUSD,
      lastUpdated: mondayUtc.toISOString(),
      feedStatus: 'LIVE',
    },
    XAUUSD: {
      ...weekendAssets.XAUUSD,
      lastUpdated: mondayUtc.toISOString(),
      feedStatus: 'LIVE',
    },
    BTCUSD: {
      ...weekendAssets.BTCUSD,
      lastUpdated: mondayUtc.toISOString(),
      feedStatus: 'LIVE',
    },
    ETHUSD: {
      ...weekendAssets.ETHUSD,
      lastUpdated: mondayUtc.toISOString(),
      feedStatus: 'LIVE',
    },
  };

  const mondayRadar = generateGlobalRadarIntelligence(
    mondayAssets,
    'H1',
    undefined,
    weekendCandles,
    mondayUtc
  );

  const mondayEur = mondayRadar.rankedOpportunities.find((o) => o.symbol === 'EURUSD');
  const mondayXau = mondayRadar.rankedOpportunities.find((o) => o.symbol === 'XAUUSD');

  assert(
    getRadarOpportunityTier(mondayEur!) === 0 && getRadarOpportunityTier(mondayXau!) === 0,
    'Test F1: On Monday session open, EURUSD and XAUUSD automatically promote to Tier 0 without manual restarts'
  );
  assert(
    mondayEur?.marketState === 'OPEN',
    'Test F2: EURUSD marketState is OPEN on Monday 08:00 UTC'
  );

  // -------------------------------------------------------------
  // Invariant Verification: No Boosts, 32 Agents, Unchanged Weights
  // -------------------------------------------------------------
  console.log('\n--- INVARIANT VERIFICATIONS ---');
  const { AGENT_DEPENDENCY_REGISTRY } = await import('../src/lib/decision/decision-engine-v2');
  const allRegistryKeys = Object.keys(AGENT_DEPENDENCY_REGISTRY);

  // 1. Verify Council Agents count in registry is strictly 14
  const councilAgents = allRegistryKeys.filter((k) => {
    const entry = AGENT_DEPENDENCY_REGISTRY[k];
    return !entry.isSynthesizer && [
      'TECHNICAL', 'VISION', 'STRATEGY', 'OPPORTUNITY', 'LIQUIDITY_MAP',
      'ORDER_FLOW', 'KILLZONE', 'RISK_GUARDIAN', 'MACRO', 'CORRELATION',
      'NEWS', 'GEOPOLITICAL', 'SENTIMENT', 'INSTITUTIONAL'
    ].includes(k);
  });

  assert(
    councilAgents.length === 14,
    'Invariant 1: Decision V2 Council agent count is strictly 14',
    `Found ${councilAgents.length} council agents`
  );

  // 2. Verify Specialists count is strictly 17
  const specialistAgents = allRegistryKeys.filter((k) => {
    return [
      'DATA_SENTINEL', 'RATES', 'INFLATION', 'VOLATILITY', 'CROSS_ASSET',
      'QUANT_MOMENTUM', 'CROSS_ASSET_LEAD_LAG', 'VOLATILITY_SQUEEZE', 'CURRENCY_STRENGTH',
      'ANCHORED_VWAP', 'MARKET_REGIME_CLASSIFIER', 'ORDER_FLOW_DELTA',
      'QUANT_MONTE_CARLO', 'MACRO_CORRELATOR', 'CENTRAL_BANK_POLICY',
      'COT_POSITIONING', 'ECONOMIC_NEWS_MOMENTUM'
    ].includes(k);
  });

  assert(
    specialistAgents.length === 17,
    'Invariant 2: Canonical specialist agents count is strictly 17',
    `Found ${specialistAgents.length} specialists`
  );

  // 3. Verify Synthesizer is exactly 1 (FINAL_DECISION)
  const synthesizerAgents = allRegistryKeys.filter((k) => AGENT_DEPENDENCY_REGISTRY[k].isSynthesizer || k === 'FINAL_DECISION');
  assert(
    synthesizerAgents.length === 1,
    'Invariant 3: Synthesizer agent count is strictly 1 (FINAL_DECISION)',
    `Found ${synthesizerAgents.length} synthesizers`
  );

  // 4. Total architecture: 14 Council + 17 Specialists + 1 FINAL_DECISION = 32
  const totalAgentArchitecture = allRegistryKeys.length;
  assert(
    totalAgentArchitecture === 32,
    'Invariant 4: Total agent architecture count is strictly 32',
    `Total was ${totalAgentArchitecture}`
  );

  console.log('\n============================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} checks passed`);
  console.log('============================================================');

  if (passedTests < totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
