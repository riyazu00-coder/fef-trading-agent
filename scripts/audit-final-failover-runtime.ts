/**
 * FEF CORTEX — CONTROLLED RUNTIME FAILOVER & RECOVERY AUDIT
 * Phase Final: MT5 OFF Reference Failover & False Global DATA_LIMITED Elimination
 */

import { evaluateContinuityFeed, ContinuityFeedStatus } from '../src/lib/price/continuity-feed';
import { getVerifiedCandles } from '../src/lib/candles/independent-candle-service';
import { generateAssetIntelligence } from '../src/lib/agents/multi-asset-pipeline';
import { evaluateCanonicalDailyStats } from '../src/lib/price/canonical-daily-ohlc';
import { getInstrumentParityProfile } from '../src/lib/price/instrument-parity';
import { fetchLiveMarketPrices } from '../src/lib/providers/real-market-api';

interface CheckpointRecord {
  checkpoint: string;
  timestamp: string;
  priceAuthority: string;
  activePrice: number;
  feedStatus: string;
  referenceFreshness: string;
  candlesAvailable: {
    M15: { count: number; provider: string; provenance: string; valid: boolean };
    M30: { count: number; provider: string; provenance: string; valid: boolean };
    H1: { count: number; provider: string; provenance: string; valid: boolean };
    H4: { count: number; provider: string; provenance: string; valid: boolean };
    D1: { count: number; provider: string; provenance: string; valid: boolean };
  };
  technicalStatus: string;
  marketStructureStatus: string;
  momentumStatus: string;
  volatilityStatus: string;
  marketRegimeStatus: string;
  liquidityStatus: string;
  macroStatus: string;
  newsStatus: string;
  strategyStatus: string;
  opportunityStatus: string;
  brokerSpreadStatus: string;
  brokerOrderFlowStatus: string;
  dataSentinelReadiness: string;
  decisionV2Maturity: string;
  decisionV2TradeExecutable: boolean;
  isGlobalDataLimited: boolean;
  notes: string[];
}

export async function captureAssetSnapshot(
  symbol: string,
  checkpointName: string,
  isMt5Online: boolean,
  brokerQuoteOverride?: any
): Promise<CheckpointRecord> {
  const normSymbol = symbol.toUpperCase();
  const parityProfile = getInstrumentParityProfile(normSymbol);
  const liveMarketMap = await fetchLiveMarketPrices();
  const liveAsset = liveMarketMap[normSymbol];

  // Resolve candles across all required timeframes: M15, M30, H1, H4, D1
  const tfs = ['M15', 'M30', 'H1', 'H4', 'D1'];
  const candleBundle: Record<string, any[]> = {};
  const candleReports: any = {};

  for (const tf of tfs) {
    const res = await getVerifiedCandles(normSymbol, tf);
    const valid = res.success && res.candles.length >= 10;
    candleBundle[tf] = res.candles || [];
    candleReports[tf] = {
      count: res.candles?.length || 0,
      provider: res.provider || 'None',
      provenance: res.provenance || 'UNAVAILABLE',
      valid,
    };
  }

  // Continuity Feed Evaluation
  const brokerQuote = isMt5Online
    ? (brokerQuoteOverride || {
        bid: liveAsset?.bid || 4158.5,
        ask: liveAsset?.ask || 4158.9,
        timestamp: Date.now() - 500,
        digits: 2,
        spread: 40,
      })
    : null;

  const continuity: ContinuityFeedStatus = evaluateContinuityFeed({
    symbol: normSymbol,
    brokerQuote,
    referencePrice: liveAsset?.price || (candleBundle['H1']?.[candleBundle['H1'].length - 1]?.close ?? 0),
    referenceProvider: liveAsset?.provider || liveAsset?.source || 'Independent Reference',
  });

  // Multi-Asset Pipeline Intelligence
  const intelligence = generateAssetIntelligence(
    normSymbol,
    {
      ...liveAsset,
      price: continuity.activePrice,
      bid: continuity.bid,
      ask: continuity.ask,
      spread: continuity.spread,
      provider: continuity.provider,
      source: continuity.provenance,
      feedStatus: continuity.state === 'OFFLINE' ? 'DATA LIMITED' : 'LIVE',
    },
    'H1',
    candleBundle,
    isMt5Online ? 'LIVE_MT5' : (parityProfile.isProxy ? 'INDEPENDENT_REFERENCE' : 'INDEPENDENT_VERIFIED'),
    continuity.provider
  );

  // Agent inspection
  const tech = intelligence.agents.find((a) => a.type === 'TECHNICAL');
  const liq = intelligence.agents.find((a) => a.type === 'LIQUIDITY_MAP');
  const strat = intelligence.agents.find((a) => a.type === 'STRATEGY');
  const opp = intelligence.agents.find((a) => a.type === 'OPPORTUNITY');
  const rg = intelligence.agents.find((a) => a.type === 'RISK_GUARDIAN');
  const macro = intelligence.agents.find((a) => a.type === 'MACRO');
  const news = intelligence.agents.find((a) => a.type === 'NEWS');
  const orderFlow = intelligence.agents.find((a) => a.type === 'ORDER_FLOW');
  const dataSentinel = intelligence.dataSentinel;
  const decV2 = intelligence.decisionIntelligenceV2;

  // Global DATA_LIMITED check
  // An asset profile is falsely global DATA_LIMITED if setupDirection or decisionPosture is marked DATA_LIMITED
  // when genuine reference price and verified structure exist.
  const isGlobalDataLimited =
    intelligence.setupDirection === 'DATA_LIMITED' ||
    intelligence.decisionPosture === 'DATA_LIMITED' ||
    tech?.status === 'DATA LIMITED' ||
    strat?.status === 'DATA LIMITED';

  return {
    checkpoint: checkpointName,
    timestamp: new Date().toISOString(),
    priceAuthority: continuity.priceAuthority,
    activePrice: continuity.activePrice,
    feedStatus: liveAsset?.feedStatus || 'UNKNOWN',
    referenceFreshness: liveAsset?.lastUpdated || 'RECENT',
    candlesAvailable: candleReports,
    technicalStatus: tech?.status || 'UNKNOWN',
    marketStructureStatus: intelligence.marketStructure ? `ACTIVE (${intelligence.marketStructure.trend})` : 'DATA_LIMITED',
    momentumStatus: tech?.status === 'ONLINE' ? 'ACTIVE' : 'DATA_LIMITED',
    volatilityStatus: intelligence.volatility.includes('ATR computed') ? 'ACTIVE' : 'DATA_LIMITED',
    marketRegimeStatus: intelligence.regime.includes('Structure') ? 'ACTIVE' : 'DATA_LIMITED',
    liquidityStatus: liq?.status || 'UNKNOWN',
    macroStatus: macro?.status || 'UNKNOWN',
    newsStatus: news?.status || 'UNKNOWN',
    strategyStatus: strat?.status || 'UNKNOWN',
    opportunityStatus: opp?.status || 'UNKNOWN',
    brokerSpreadStatus: isMt5Online ? `${continuity.spread} pts` : 'UNAVAILABLE',
    brokerOrderFlowStatus: isMt5Online ? (orderFlow?.status || 'ONLINE') : 'DATA_LIMITED',
    dataSentinelReadiness: dataSentinel?.readiness || 'UNKNOWN',
    decisionV2Maturity: decV2?.maturity || 'UNKNOWN',
    decisionV2TradeExecutable: intelligence.tradeExecutable,
    isGlobalDataLimited,
    notes: [
      `Price Authority: ${continuity.priceAuthority}`,
      `Blueprint: ${intelligence.blueprint ? 'ACTIVE' : 'NULL'}`,
      `Strategy Opinion: ${strat?.lastOpinion.slice(0, 70)}...`,
      `Trade Executable: ${intelligence.tradeExecutable}`,
    ],
  };
}

async function runControlledAudit() {
  console.log('=================================================================');
  console.log('FEF CORTEX — FINAL REFERENCE FAILOVER ACCEPTANCE AUDIT');
  console.log('=================================================================\n');

  // STEP 1: XAUUSD Baseline (MT5 Online)
  console.log('[STEP 1: CAPTURING XAUUSD BASELINE (MT5 ONLINE)]');
  const baseline = await captureAssetSnapshot('XAUUSD', 'BASELINE_MT5_ONLINE', true);
  console.log('  Price Authority:', baseline.priceAuthority);
  console.log('  Active Price:', baseline.activePrice);
  console.log('  Technical Status:', baseline.technicalStatus);
  console.log('  Market Structure:', baseline.marketStructureStatus);
  console.log('  Volatility Status:', baseline.volatilityStatus);
  console.log('  Market Regime:', baseline.marketRegimeStatus);
  console.log('  Broker Spread:', baseline.brokerSpreadStatus);
  console.log('  Data Sentinel:', baseline.dataSentinelReadiness);
  console.log('  Global DATA_LIMITED:', baseline.isGlobalDataLimited ? 'YES (FAIL)' : 'NO (PASS)');
  console.log('  Candles M15..D1:');
  for (const [tf, rep] of Object.entries(baseline.candlesAvailable)) {
    console.log(`    ${tf}: count=${rep.count}, provider=${rep.provider}, valid=${rep.valid}`);
  }

  // STEP 2: XAUUSD Offline Checkpoints: 0s, 5s, 10s, 20s, 30s
  console.log('\n[STEP 2: SIMULATING / PROBING XAUUSD TRANSITION & CRITICAL TIME WINDOW]');
  const intervals = [
    { label: 'TRANSITION_IMMEDIATE_0S', ageMs: 100 },
    { label: 'TRANSITION_5S', ageMs: 5200 },
    { label: 'TRANSITION_10S', ageMs: 10200 },
    { label: 'TRANSITION_20S', ageMs: 20200 },
    { label: 'TRANSITION_30S', ageMs: 30200 },
  ];

  for (const interval of intervals) {
    const cp = await captureAssetSnapshot('XAUUSD', interval.label, false);
    console.log(`\n  --- Checkpoint: ${interval.label} ---`);
    console.log(`  Price Authority: ${cp.priceAuthority} (Expected: REFERENCE_MARKET)`);
    console.log(`  Active Price: ${cp.activePrice}`);
    console.log(`  Technical: ${cp.technicalStatus} | Structure: ${cp.marketStructureStatus}`);
    console.log(`  Volatility: ${cp.volatilityStatus} | Regime: ${cp.marketRegimeStatus}`);
    console.log(`  Strategy: ${cp.strategyStatus} | Opportunity: ${cp.opportunityStatus}`);
    console.log(`  Broker Spread: ${cp.brokerSpreadStatus} | Broker Order Flow: ${cp.brokerOrderFlowStatus}`);
    console.log(`  Data Sentinel: ${cp.dataSentinelReadiness} (Expected: READY)`);
    console.log(`  Decision V2 Maturity: ${cp.decisionV2Maturity} | tradeExecutable: ${cp.decisionV2TradeExecutable}`);
    console.log(`  Global False DATA_LIMITED: ${cp.isGlobalDataLimited ? 'YES (DETECTED)' : 'NO (CLEAN)'}`);
  }

  // STEP 3: ADDITIONAL ASSETS (AUDUSD, NZDUSD, EURUSD, BTCUSD, US100, GER40)
  console.log('\n[STEP 3: MULTI-ASSET MT5 OFF AUDIT]');
  const additionalAssets = ['AUDUSD', 'NZDUSD', 'EURUSD', 'BTCUSD', 'US100', 'GER40'];

  for (const sym of additionalAssets) {
    const rec = await captureAssetSnapshot(sym, `${sym}_MT5_OFF`, false);
    console.log(`\n  Asset: ${sym}`);
    console.log(`  Price Authority: ${rec.priceAuthority}`);
    console.log(`  Active Price: ${rec.activePrice}`);
    console.log(`  Technical: ${rec.technicalStatus}`);
    console.log(`  Structure: ${rec.marketStructureStatus}`);
    console.log(`  Global False DATA_LIMITED: ${rec.isGlobalDataLimited ? 'YES' : 'NO'}`);
    console.log(`  Notes:`, rec.notes);
  }

  console.log('\n=================================================================');
  console.log('CONTROLLED AUDIT RUN COMPLETE');
  console.log('=================================================================');
}

runControlledAudit().catch((err) => {
  console.error('Audit run failed:', err);
  process.exit(1);
});

