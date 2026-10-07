/**
 * FEF CORTEX — M15/M30 TRADE OPPORTUNITY RECOVERY + DECISION CONSISTENCY SPRINT
 * COMPREHENSIVE VERIFICATION SUITE (35 TESTS)
 *
 * Verifies all 35 required criteria:
 *  1. H1 bullish + M15 bearish trigger produces visible conflict, not fake buy.
 *  2. H1 bearish + M30 bearish + M15 confirmed close can create WATCH FOR SELL.
 *  3. M15 trigger cannot create executable SELL.
 *  4. M15 trigger requires CLOSED candle.
 *  5. Intrabar wick does not count as close confirmation.
 *  6. Bullish close above valid prior high recognized.
 *  7. Bearish close below valid prior low recognized.
 *  8. Missing M15 candles fail closed.
 *  9. Stale M15 candles fail closed.
 * 10. Invalidated setup cannot reactivate.
 * 11. Same-direction new setup requires new structure.
 * 12. Opposing BOS invalidates old setup.
 * 13. TP fulfillment invalidates/completes old geometry appropriately.
 * 14. Current price materially beyond stale setup forces revalidation.
 * 15. Current Decision always equals canonical Final Council posture.
 * 16. Opportunity Radar uses canonical posture.
 * 17. Chart Vision disagreement increases conflict.
 * 18. Chart Vision cannot become canonical decision itself.
 * 19. Macro disagreement reduces confidence but does not fabricate veto.
 * 20. DXY unavailable stays unavailable.
 * 21. Data Sentinel never creates direction.
 * 22. Provider reachable but data stale is represented truthfully.
 * 23. What Changed panel cannot display unproven catalyst.
 * 24. Vulnerability Matrix cannot display hardcoded current DXY value.
 * 25. READ_ONLY remains canonical.
 * 26. MT5_ORDER_TRANSPORT_ENABLED remains false.
 * 27. No order placement transport introduced.
 * 28. Broker BID/ASK authority unchanged.
 * 29. No synthetic candles.
 * 30. No synthetic correlation.
 * 31. No fake macro values.
 * 32. No stale setup geometry reused.
 * 33. M15/M30/H1 context remains asset-isolated.
 * 34. XAUUSD evidence never leaks into another asset.
 * 35. Existing confluence domain deduplication still works.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CANONICAL_EXECUTION_MODE, MT5_ORDER_TRANSPORT_ENABLED } from '../src/lib/execution/execution-policy';
import { CandleCloseTriggerEngine } from '../src/lib/triggers/candle-close-trigger-engine';
import { SetupLifecycleEngine } from '../src/lib/trading/setup-lifecycle-engine';
import { FastOpportunityEngine } from '../src/lib/radar/fast-opportunity-engine';
import { CortexConfluenceEngine } from '../src/lib/confluence/confluence-engine';
import { evaluateOpportunityRadar } from '../src/lib/radar/opportunity-radar-engine';
import { resolvePriceForPurpose } from '../src/lib/price/price-authority';
import { TradeBlueprint } from '../src/lib/trading/trade-blueprint-engine';
import { MarketStructure } from '../src/lib/market/market-structure-engine';
import { OHLCCandle } from '../src/lib/market/canonical-market-snapshot';
import { UnifiedAgentResponse } from '../src/lib/agents/contracts/unified-agent-contract';
import { evaluateDataSentinelAgent } from '../src/lib/agents/specialists/specialist-agents';
import { calculatePearsonCorrelation } from '../src/lib/cross-asset/cross-asset-engine';
import { getVerifiedHistoricalChanges, recordDecisionTransition, clearHistoricalChanges } from '../src/lib/agents/what-changed-engine';
import { generateAssetIntelligence, AssetIntelligenceProfile } from '../src/lib/agents/multi-asset-pipeline';
import { LiveMarketAsset } from '../src/lib/providers/real-market-api';

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

function makeCandleSeries(
  count: number,
  startPrice: number,
  trend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT',
  timeframeMinutes: number = 15,
  baseTime: number = Date.now() - (count + 1) * timeframeMinutes * 60 * 1000
): OHLCCandle[] {
  const candles: OHLCCandle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const timestamp = baseTime + i * timeframeMinutes * 60 * 1000;
    const delta = trend === 'UP' ? 1.0 : trend === 'DOWN' ? -1.0 : (i % 2 === 0 ? 0.5 : -0.5);
    const open = price;
    const close = price + delta;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    price = close;

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 10,
    });
  }

  return candles;
}

function makeMockStructure(symbol: string, trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL', high: number, low: number): MarketStructure {
  return {
    symbol,
    timeframe: 'M30',
    trend,
    trendConfidence: 80,
    structureState: 'STABLE',
    swings: [],
    swingHighs: [{ index: 5, price: high, type: 'SWING_HIGH', barTimestamp: Date.now() - 3600000, confirmed: true }],
    swingLows: [{ index: 2, price: low, type: 'SWING_LOW', barTimestamp: Date.now() - 7200000, confirmed: true }],
    bos: [],
    choch: [],
    currentRange: { high, low, eq: (high + low) / 2 },
    lastSwingHigh: high,
    lastSwingLow: low,
    lastBos: null,
    lastChoch: null,
    summary: `${symbol} structure ${trend}`,
  };
}

let blueprintSeq = 1;

function makeMockBlueprint(symbol: string, direction: 'BUY' | 'SELL', entry: number, sl: number, tp1: number, idSuffix?: string): TradeBlueprint {
  const id = idSuffix ? `BP-${symbol}-${direction}-${idSuffix}` : `BP-${symbol}-${direction}-${Date.now()}-${blueprintSeq++}`;
  return {
    setupId: id,
    symbol,
    timeframe: 'M30',
    direction,
    bias: direction === 'BUY' ? 'BULLISH' : 'BEARISH',
    entryZoneLow: { price: direction === 'BUY' ? entry - 1 : entry },
    entryZoneHigh: { price: direction === 'BUY' ? entry : entry + 1 },
    sl: { price: sl, distancePips: Math.abs(entry - sl) * 10, rationale: 'Swing invalidation' },
    tp1: { price: tp1, distancePips: Math.abs(tp1 - entry) * 10, rr: 1.5, rationale: 'Target 1' },
    tp2: { price: direction === 'BUY' ? tp1 + 5 : tp1 - 5, distancePips: 20, rr: 2.5, rationale: 'Target 2' },
    invalidation: { price: sl, levelType: 'SWING_LOW', reason: 'SL breach' },
    rrRatio: '1:1.5',
    riskRewardScore: 75,
    state: 'ARMED',
    confidenceScore: 78,
    createdAt: Date.now() - 1800000,
    expiry: Date.now() + 7200000,
    latestAnalyzedCandleTimestamp: Date.now() - 1800000,
    rationale: 'Structural M30 setup',
    tradeFeasibility: 'FEASIBLE',
  };
}

function makeMockAgent(id: string, name: string, family: string, stance: 'BULLISH' | 'BEARISH' | 'NEUTRAL', conf: number): UnifiedAgentResponse {
  return {
    agentId: id,
    agentName: name,
    domainFamily: family as any,
    stance,
    confidence: conf,
    direction: stance === 'BULLISH' ? 'BUY' : stance === 'BEARISH' ? 'SELL' : 'NEUTRAL',
    readiness: 'REALTIME',
    evidenceTrust: 80,
    primaryObservation: `${name} stance ${stance}`,
    evidences: [
      {
        source: name,
        classification: 'VERIFIED',
        freshness: 'FRESH',
        weight: 1.0,
        observation: `${name} analysis`,
        metric: 'SCORE',
        value: conf,
      },
    ],
    timestamp: Date.now(),
  };
}

async function runM15M30OpportunityRecoveryTests() {
  console.log('\n=================================================================');
  console.log('FEF CORTEX: M15/M30 TRADE OPPORTUNITY RECOVERY & DECISION CONSISTENCY');
  console.log('35 COMPREHENSIVE REGRESSION TESTS');
  console.log('=================================================================\n');

  SetupLifecycleEngine.reset();

  // =================================================================
  // TEST 1: H1 bullish + M15 bearish trigger produces visible conflict, not fake buy
  // =================================================================
  console.log('[TEST 1: H1 bullish + M15 bearish trigger produces visible conflict, not fake buy]');
  {
    const candles = makeCandleSeries(15, 2050, 'DOWN', 15);
    // Force latest candle to close below prior low (2035)
    candles[candles.length - 1].close = 2030;
    candles[candles.length - 1].low = 2028;
    const structure = makeMockStructure('XAUUSD', 'BEARISH', 2060, 2035);

    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2030,
      structure,
      htfBias: 'BULLISH', // Conflicting H1 bias
      currentTimeMs: candles[candles.length - 1].timestamp + 60000,
    });

    assert(
      trigger.isConfirmed === true && trigger.direction === 'SELL',
      'M15 bearish trigger confirmed on closed breakdown',
      `direction: ${trigger.direction}`
    );
    assert(
      trigger.reason.includes('HTF H1 BULLISH CONTEXT CONFLICT'),
      'Trigger evidence explicitly surfaces H1 bullish context conflict',
      trigger.reason
    );
    assert(
      trigger.direction !== 'BUY',
      'Trigger does NOT produce a fake buy despite H1 bullishness'
    );
  }

  // =================================================================
  // TEST 2: H1 bearish + M30 bearish + M15 confirmed close can create WATCH FOR SELL
  // =================================================================
  console.log('[TEST 2: H1 bearish + M30 bearish + M15 confirmed close can create WATCH FOR SELL]');
  {
    const candles = makeCandleSeries(15, 2050, 'DOWN', 15);
    candles[candles.length - 1].close = 2030;
    const structure = makeMockStructure('XAUUSD', 'BEARISH', 2060, 2035);
    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2030,
      structure,
      htfBias: 'BEARISH',
      currentTimeMs: candles[candles.length - 1].timestamp + 60000,
    });

    const bp = makeMockBlueprint('XAUUSD', 'SELL', 2035, 2045, 2020);
    const fastOpp = FastOpportunityEngine.evaluateFastOpportunity({
      symbol: 'XAUUSD',
      currentPrice: 2030,
      triggerEvidence: trigger,
      blueprint: bp,
      marketStructure: structure,
      candlesM15: candles,
      sessionExecutable: true,
      spreadQuality: 'NORMAL',
      hasVerifiedBrokerPrice: true,
      macroCoverage: { isRatesAvailable: true, isRealYieldAvailable: true, isDxyAvailable: false },
    });

    assert(
      fastOpp.posture === 'WATCH FOR SELL',
      'FastOpportunityEngine correctly produces WATCH FOR SELL',
      `posture: ${fastOpp.posture}`
    );
    assert(
      fastOpp.direction === 'SELL',
      'FastOpportunityEngine correctly sets direction to SELL'
    );
  }

  // =================================================================
  // TEST 3: M15 trigger cannot create executable SELL
  // =================================================================
  console.log('[TEST 3: M15 trigger cannot create executable SELL]');
  {
    assert(
      CANONICAL_EXECUTION_MODE === 'READ_ONLY',
      'CANONICAL_EXECUTION_MODE is strictly READ_ONLY',
      CANONICAL_EXECUTION_MODE
    );
    assert(
      MT5_ORDER_TRANSPORT_ENABLED === false,
      'MT5_ORDER_TRANSPORT_ENABLED is strictly false'
    );
    const candles = makeCandleSeries(15, 2050, 'DOWN', 15);
    candles[candles.length - 1].close = 2030;
    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2030,
      currentTimeMs: candles[candles.length - 1].timestamp + 60000,
    });
    // Ensure trigger does not contain execution commands
    assert(
      (trigger as any).orderType === undefined && (trigger as any).executeOrder === undefined,
      'CandleCloseTriggerEvidence contains zero execution commands'
    );
  }

  // =================================================================
  // TEST 4: M15 trigger requires CLOSED candle
  // =================================================================
  console.log('[TEST 4: M15 trigger requires CLOSED candle]');
  {
    const candles = makeCandleSeries(15, 2050, 'UP', 15);
    const structure = makeMockStructure('XAUUSD', 'BULLISH', 2060, 2040);
    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2065,
      structure,
      isInProgressIntraBar: true, // Marked explicitly as in-progress intrabar
      currentTimeMs: candles[candles.length - 1].timestamp + 60000,
    });

    assert(
      trigger.isConfirmed === false,
      'In-progress bar is rejected; close confirmation requires completed candle',
      `isConfirmed: ${trigger.isConfirmed}`
    );
    assert(
      trigger.rejectionReason === 'INTRABAR_WICK_NOT_CONFIRMED',
      'Rejection reason is INTRABAR_WICK_NOT_CONFIRMED',
      trigger.rejectionReason
    );
  }

  // =================================================================
  // TEST 5: Intrabar wick does not count as close confirmation
  // =================================================================
  console.log('[TEST 5: Intrabar wick does not count as close confirmation]');
  {
    const candles = makeCandleSeries(15, 2050, 'FLAT', 15);
    const triggerLevelHigh = 2055;
    // Construct candle where high spiked to 2060, but closed at 2052 (<= 2055)
    const lastBar = candles[candles.length - 1];
    lastBar.high = 2060;
    lastBar.close = 2052;
    const structure = makeMockStructure('XAUUSD', 'BULLISH', triggerLevelHigh, 2040);

    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2052,
      structure,
      currentTimeMs: lastBar.timestamp + 60000,
    });

    assert(
      trigger.isConfirmed === false,
      'High-wick breakout with close below trigger level does NOT confirm trigger',
      `isConfirmed: ${trigger.isConfirmed}`
    );
    assert(
      trigger.rejectionReason === 'INTRABAR_WICK_REJECTION',
      'Rejection reason is INTRABAR_WICK_REJECTION',
      trigger.rejectionReason
    );
    assert(
      trigger.structureState === 'WICK_REJECTION',
      'Structure state is WICK_REJECTION',
      trigger.structureState
    );
  }

  // =================================================================
  // TEST 6: Bullish close above valid prior high recognized
  // =================================================================
  console.log('[TEST 6: Bullish close above valid prior high recognized]');
  {
    const candles = makeCandleSeries(15, 2050, 'FLAT', 15);
    const triggerLevelHigh = 2055;
    const lastBar = candles[candles.length - 1];
    lastBar.open = 2053;
    lastBar.high = 2059;
    lastBar.low = 2052;
    lastBar.close = 2058; // Closed strictly above 2055
    const structure = makeMockStructure('XAUUSD', 'BULLISH', triggerLevelHigh, 2040);

    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2058,
      structure,
      currentTimeMs: lastBar.timestamp + 60000,
    });

    assert(
      trigger.isConfirmed === true,
      'Bullish close strictly above prior high is confirmed',
      `isConfirmed: ${trigger.isConfirmed}`
    );
    assert(
      trigger.direction === 'BUY',
      'Trigger direction is BUY',
      `direction: ${trigger.direction}`
    );
    assert(
      trigger.confirmationClose === 2058,
      'Confirmation close matches candle close',
      `close: ${trigger.confirmationClose}`
    );
  }

  // =================================================================
  // TEST 7: Bearish close below valid prior low recognized
  // =================================================================
  console.log('[TEST 7: Bearish close below valid prior low recognized]');
  {
    const candles = makeCandleSeries(15, 2050, 'FLAT', 15);
    const triggerLevelLow = 2045;
    const lastBar = candles[candles.length - 1];
    lastBar.open = 2046;
    lastBar.high = 2047;
    lastBar.low = 2038;
    lastBar.close = 2040; // Closed strictly below 2045
    const structure = makeMockStructure('XAUUSD', 'BEARISH', 2060, triggerLevelLow);

    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2040,
      structure,
      currentTimeMs: lastBar.timestamp + 60000,
    });

    assert(
      trigger.isConfirmed === true,
      'Bearish close strictly below prior low is confirmed',
      `isConfirmed: ${trigger.isConfirmed}`
    );
    assert(
      trigger.direction === 'SELL',
      'Trigger direction is SELL',
      `direction: ${trigger.direction}`
    );
    assert(
      trigger.confirmationClose === 2040,
      'Confirmation close matches candle close',
      `close: ${trigger.confirmationClose}`
    );
  }

  // =================================================================
  // TEST 8: Missing M15 candles fail closed
  // =================================================================
  console.log('[TEST 8: Missing M15 candles fail closed]');
  {
    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: [], // Empty candles
      currentPrice: 2050,
      currentTimeMs: Date.now(),
    });

    assert(
      trigger.isConfirmed === false,
      'Missing candles fail closed with isConfirmed=false',
      `isConfirmed: ${trigger.isConfirmed}`
    );
    assert(
      trigger.direction === 'NEUTRAL',
      'Missing candles return NEUTRAL direction',
      `direction: ${trigger.direction}`
    );
    assert(
      trigger.rejectionReason === 'INSUFFICIENT_CANDLES',
      'Rejection reason is INSUFFICIENT_CANDLES',
      trigger.rejectionReason
    );
  }

  // =================================================================
  // TEST 9: Stale M15 candles fail closed
  // =================================================================
  console.log('[TEST 9: Stale M15 candles fail closed]');
  {
    const currentTimeMs = Date.now();
    const staleLatestCandleTs = currentTimeMs - 120 * 60 * 1000; // 2 hours ago
    const baseTime = staleLatestCandleTs - 14 * 15 * 60 * 1000;
    const candles = makeCandleSeries(15, 2050, 'FLAT', 15, baseTime);
    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2050,
      currentTimeMs, // Current time is 2 hours later
    });

    assert(
      trigger.isConfirmed === false,
      'Stale candles fail closed with isConfirmed=false',
      `isConfirmed: ${trigger.isConfirmed}`
    );
    assert(
      trigger.freshness === 'STALE',
      'Freshness is marked STALE',
      trigger.freshness
    );
    assert(
      trigger.rejectionReason === 'STALE_CANDLES',
      'Rejection reason is STALE_CANDLES',
      trigger.rejectionReason
    );
  }

  // =================================================================
  // TEST 10: Invalidated setup cannot reactivate
  // =================================================================
  console.log('[TEST 10: Invalidated setup cannot reactivate]');
  {
    const bp = makeMockBlueprint('XAUUSD', 'BUY', 2050, 2040, 2065, 'test-10');
    const structure = makeMockStructure('XAUUSD', 'BULLISH', 2060, 2040);

    // Record invalidation
    SetupLifecycleEngine.recordInvalidation(bp, 2038, 'SL breached by price 2038', structure);

    // Attempt to revalidate with favorable market price
    const reval = SetupLifecycleEngine.validateBlueprintRelevance(bp, 2055, structure);

    assert(
      reval.isValid === false,
      'Invalidated blueprint cannot reactivate',
      `isValid: ${reval.isValid}`
    );
    assert(
      reval.updatedState === 'INVALIDATED',
      'Lifecycle state remains strictly INVALIDATED',
      reval.updatedState
    );
    assert(
      reval.reason.includes('permanently invalidated'),
      'Reason cites permanent invalidation archive',
      reval.reason
    );
  }

  // =================================================================
  // TEST 11: Same-direction new setup requires new structure
  // =================================================================
  console.log('[TEST 11: Same-direction new setup requires new structure]');
  {
    const structure = makeMockStructure('XAUUSD', 'BUY' as any, 2060, 2040);
    // Structure is identical to when setup was invalidated in Test 10
    const check1 = SetupLifecycleEngine.hasNewStructuralEvidence('XAUUSD', 'BUY', structure);

    assert(
      check1.hasNewEvidence === false,
      'Same-direction setup rejected when structure has not changed',
      check1.reason
    );

    // Now introduce genuine new structure: new higher swing high postdating invalidation
    const newStructure: MarketStructure = {
      ...structure,
      lastSwingHigh: 2075,
      bos: [
        {
          index: 10,
          price: 2065,
          type: 'BOS_HIGH',
          brokenSwingIndex: 5,
          candleTimestamp: Date.now() + 5000,
        },
      ],
    };

    const check2 = SetupLifecycleEngine.hasNewStructuralEvidence('XAUUSD', 'BUY', newStructure);
    assert(
      check2.hasNewEvidence === true,
      'New structural evidence (new swing high and new BOS) allows new setup',
      check2.reason
    );
  }

  // =================================================================
  // TEST 12: Opposing BOS invalidates old setup
  // =================================================================
  console.log('[TEST 12: Opposing BOS invalidates old setup]');
  {
    const bp = makeMockBlueprint('XAUUSD', 'BUY', 2050, 2040, 2065, 'test-12');
    const opposingStructure: MarketStructure = {
      ...makeMockStructure('XAUUSD', 'BULLISH', 2060, 2040),
      bos: [
        {
          index: 12,
          price: 2038,
          type: 'BOS_LOW', // Opposing bearish BOS
          brokenSwingIndex: 2,
          candleTimestamp: Date.now(),
        },
      ],
    };

    const reval = SetupLifecycleEngine.validateBlueprintRelevance(bp, 2048, opposingStructure);

    assert(
      reval.isValid === false,
      'Opposing BOS invalidates existing BUY setup',
      `isValid: ${reval.isValid}`
    );
    assert(
      reval.updatedState === 'INVALIDATED',
      'Setup state becomes INVALIDATED',
      reval.updatedState
    );
    assert(
      reval.reason.includes('Opposing BOS'),
      'Reason cites Opposing BOS detection',
      reval.reason
    );
  }

  // =================================================================
  // TEST 13: TP fulfillment invalidates/completes old geometry appropriately
  // =================================================================
  console.log('[TEST 13: TP fulfillment invalidates/completes old geometry appropriately]');
  {
    const bp = makeMockBlueprint('XAUUSD', 'BUY', 2050, 2040, 2065, 'test-13');
    const structure = makeMockStructure('XAUUSD', 'BULLISH', 2060, 2040);

    // Current price reaches TP1 price (2065)
    const reval = SetupLifecycleEngine.validateBlueprintRelevance(bp, 2066, structure);

    assert(
      reval.isValid === false,
      'TP fulfillment marks blueprint non-executable/completed',
      `isValid: ${reval.isValid}`
    );
    assert(
      reval.updatedState === 'COMPLETED',
      'Setup state is COMPLETED upon reaching TP1',
      reval.updatedState
    );
    assert(
      reval.reason.includes('target TP1'),
      'Reason cites TP1 fulfillment',
      reval.reason
    );
  }

  // =================================================================
  // TEST 14: Current price materially beyond stale setup forces revalidation
  // =================================================================
  console.log('[TEST 14: Current price materially beyond stale setup forces revalidation]');
  {
    // Setup: entry 2050, SL 2040 (risk 10), TP1 2065
    // Price moves to 2059 (drifts past entry towards TP1 without trigger, exceeding 6.75 allowed drift)
    const bp = makeMockBlueprint('XAUUSD', 'BUY', 2050, 2040, 2065, 'test-14');
    const structure = makeMockStructure('XAUUSD', 'BULLISH', 2060, 2040);

    const reval = SetupLifecycleEngine.validateBlueprintRelevance(bp, 2059, structure);

    assert(
      reval.isValid === false,
      'Material price runaway beyond setup envelope forces invalidation/expiration',
      `isValid: ${reval.isValid}`
    );
    assert(
      reval.updatedState === 'EXPIRED',
      'Updated state is EXPIRED due to price drift',
      reval.updatedState
    );
    assert(
      reval.reason.includes('materially beyond'),
      'Reason cites material drift beyond structural relevance',
      reval.reason
    );
  }

  // =================================================================
  // TEST 15: Current Decision always equals canonical Final Council posture
  // =================================================================
  console.log('[TEST 15: Current Decision always equals canonical Final Council posture]');
  {
    // Create an AssetProfile where confluence posture is WAIT
    const mockLiveAsset: LiveMarketAsset = {
      symbol: 'XAUUSD',
      name: 'Gold vs US Dollar',
      price: 2050.0,
      bid: 2049.85,
      ask: 2050.15,
      spread: 0.30,
      change24h: 0.1,
      high24h: 2060.0,
      low24h: 2040.0,
      volume: '$10B',
      sparkline: '2045,2050',
      source: 'TEST',
      lastUpdated: new Date().toISOString(),
      category: 'COMMODITY',
    };
    const mockCandles = makeCandleSeries(20, 2050, 'FLAT', 60);
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', mockCandles);

    // Verify that profile.setupDirection matches profile.confluence.presentationPosture
    if (profile.confluence.presentationPosture === 'WAIT') {
      assert(
        profile.setupDirection === 'WAIT',
        'When Confluence posture is WAIT, profile.setupDirection is strictly WAIT',
        `setupDirection: ${profile.setupDirection}`
      );
    } else {
      assert(
        profile.setupDirection === profile.confluence.presentationPosture,
        'Profile setupDirection matches confluence presentationPosture',
        `setupDirection: ${profile.setupDirection}, posture: ${profile.confluence.presentationPosture}`
      );
    }
  }

  // =================================================================
  // TEST 16: Opportunity Radar uses canonical posture
  // =================================================================
  console.log('[TEST 16: Opportunity Radar uses canonical posture]');
  {
    const mockLiveAsset: LiveMarketAsset = {
      symbol: 'XAUUSD',
      name: 'Gold',
      price: 2050.0,
      bid: 2049.85,
      ask: 2050.15,
      spread: 0.30,
      change24h: 0.1,
      high24h: 2060.0,
      low24h: 2040.0,
      volume: '$10B',
      sparkline: '2045,2050',
      source: 'TEST',
      lastUpdated: new Date().toISOString(),
      category: 'COMMODITY',
    };
    const mockCandles = makeCandleSeries(20, 2050, 'FLAT', 60);
    const profile = generateAssetIntelligence('XAUUSD', mockLiveAsset, 'H1', mockCandles);
    // Explicitly enforce profile.setupDirection = 'WAIT'
    profile.setupDirection = 'WAIT';

    const radarOpps = evaluateOpportunityRadar({ XAUUSD: profile }, { XAUUSD: { price: 2050, change24h: 0.1 } });
    assert(
      radarOpps.length > 0 && radarOpps[0].state === 'WAIT',
      'Opportunity Radar reflects canonical WAIT posture',
      `state: ${radarOpps[0]?.state}`
    );
    assert(
      radarOpps[0].tradeExecutable === false,
      'Opportunity is not immediately tradeExecutable when state is WAIT',
      `tradeExecutable: ${radarOpps[0].tradeExecutable}`
    );
  }

  // =================================================================
  // TEST 17: Chart Vision disagreement increases conflict
  // =================================================================
  console.log('[TEST 17: Chart Vision disagreement increases conflict]');
  {
    const agentsWithoutVision: UnifiedAgentResponse[] = [
      makeMockAgent('TECH', 'Technical Analyst', 'PRICE_TECHNICAL', 'BULLISH', 80),
      makeMockAgent('INST', 'Institutional Flow', 'LIQUIDITY', 'BULLISH', 75),
    ];
    const confluenceBase = CortexConfluenceEngine.evaluateConfluence(agentsWithoutVision);

    const agentsWithOpposingVision: UnifiedAgentResponse[] = [
      ...agentsWithoutVision,
      makeMockAgent('VISION', 'Chart Vision Agent', 'SENTIMENT', 'BEARISH', 85),
    ];
    const confluenceOpposed = CortexConfluenceEngine.evaluateConfluence(agentsWithOpposingVision);

    assert(
      confluenceOpposed.conflictScore > confluenceBase.conflictScore,
      'Opposing Chart Vision increases conflictScore',
      `base: ${confluenceBase.conflictScore}, opposed: ${confluenceOpposed.conflictScore}`
    );
    assert(
      confluenceOpposed.criticalConflicts.some((c) => c.toLowerCase().includes('vision')),
      'Opposing Chart Vision is explicitly noted in criticalConflicts',
      JSON.stringify(confluenceOpposed.criticalConflicts)
    );
    assert(
      confluenceOpposed.presentationPosture === 'WAIT',
      'Strong Chart Vision conflict forces presentation posture to WAIT',
      `posture: ${confluenceOpposed.presentationPosture}`
    );
  }

  // =================================================================
  // TEST 18: Chart Vision cannot become canonical decision itself
  // =================================================================
  console.log('[TEST 18: Chart Vision cannot become canonical decision itself]');
  {
    // Vision alone with high bearish confidence (90%)
    const visionAlone: UnifiedAgentResponse[] = [
      makeMockAgent('VISION', 'Chart Vision Agent', 'SENTIMENT', 'BEARISH', 90),
    ];
    const confluence = CortexConfluenceEngine.evaluateConfluence(visionAlone);

    assert(
      confluence.presentationPosture === 'WAIT',
      'Vision alone cannot unilaterally trigger WATCH FOR SELL (must be WAIT)',
      `posture: ${confluence.presentationPosture}`
    );
    assert(
      confluence.dataReadiness === 'DATA_LIMITED',
      'Single agent provides insufficient domain coverage',
      confluence.dataReadiness
    );
  }

  // =================================================================
  // TEST 19: Macro disagreement reduces confidence but does not fabricate veto
  // =================================================================
  console.log('[TEST 19: Macro disagreement reduces confidence but does not fabricate veto]');
  {
    const candles = makeCandleSeries(15, 2050, 'UP', 15);
    candles[candles.length - 1].close = 2062;
    const structure = makeMockStructure('XAUUSD', 'BULLISH', 2060, 2040);
    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2062,
      structure,
      currentTimeMs: candles[candles.length - 1].timestamp + 60000,
    });
    const bp = makeMockBlueprint('XAUUSD', 'BUY', 2060, 2050, 2080);

    // Macro coverage missing DXY and real yields
    const fastOpp = FastOpportunityEngine.evaluateFastOpportunity({
      symbol: 'XAUUSD',
      currentPrice: 2062,
      triggerEvidence: trigger,
      blueprint: bp,
      marketStructure: structure,
      candlesM15: candles,
      sessionExecutable: true,
      spreadQuality: 'NORMAL',
      hasVerifiedBrokerPrice: true,
      macroCoverage: { isRatesAvailable: true, isRealYieldAvailable: false, isDxyAvailable: false },
    });

    assert(
      fastOpp.tradeSetupQuality >= 70,
      'Price-action trade setup quality remains intact despite missing macro feeds',
      `setupQuality: ${fastOpp.tradeSetupQuality}`
    );
    assert(
      fastOpp.effectiveConfidence < fastOpp.tradeSetupQuality,
      'Effective confidence is penalized by lower macro evidence coverage without vetoing setup',
      `effectiveConfidence: ${fastOpp.effectiveConfidence}, setupQuality: ${fastOpp.tradeSetupQuality}`
    );
  }

  // =================================================================
  // TEST 20: DXY unavailable stays unavailable
  // =================================================================
  console.log('[TEST 20: DXY unavailable stays unavailable]');
  {
    const fastOpp = FastOpportunityEngine.evaluateFastOpportunity({
      symbol: 'XAUUSD',
      currentPrice: 2050,
      triggerEvidence: {
        direction: 'NEUTRAL',
        triggerType: 'NONE',
        triggerTimeframe: 'M15',
        triggerLevel: 0,
        triggerCandleTimestamp: Date.now(),
        confirmationClose: 2050,
        priorHigh: 0,
        priorLow: 0,
        structureState: 'STABLE',
        freshness: 'FRESH',
        provenance: 'VERIFIED',
        confidenceContribution: 0,
        reason: 'Waiting',
        isConfirmed: false,
      },
      blueprint: null,
      marketStructure: null,
      sessionExecutable: true,
      spreadQuality: 'NORMAL',
      hasVerifiedBrokerPrice: true,
      macroCoverage: { isRatesAvailable: true, isRealYieldAvailable: true, isDxyAvailable: false },
    });

    assert(
      fastOpp.missingEvidenceNotes.some((n) => n.includes('DXY is strictly UNAVAILABLE')),
      'Missing evidence notes explicitly declare DXY UNAVAILABLE',
      JSON.stringify(fastOpp.missingEvidenceNotes)
    );
  }

  // =================================================================
  // TEST 21: Data Sentinel never creates direction
  // =================================================================
  console.log('[TEST 21: Data Sentinel never creates direction]');
  {
    const sentinel = evaluateDataSentinelAgent({
      isMt5Online: true,
      activeProviders: ['MT5', 'FRED'],
    });

    assert(
      sentinel.direction === 'NEUTRAL',
      'Data Sentinel direction is strictly NEUTRAL',
      sentinel.direction
    );
    assert(
      sentinel.domainFamily === 'SYSTEM_INTEGRITY',
      'Data Sentinel domain family is SYSTEM_INTEGRITY',
      sentinel.domainFamily
    );
  }

  // =================================================================
  // TEST 22: Provider reachable but data stale is represented truthfully
  // =================================================================
  console.log('[TEST 22: Provider reachable but data stale is represented truthfully]');
  {
    const sentinel = evaluateDataSentinelAgent({
      isMt5Online: false,
      offlineProviders: ['MT5'],
      feedAgeMs: 120 * 60 * 1000,
    });

    assert(
      sentinel.readiness === 'DATA_LIMITED',
      'Data Sentinel marks readiness DATA_LIMITED when providers are offline or stale',
      sentinel.readiness
    );
    assert(
      sentinel.evidenceTrust <= 30,
      'Data Sentinel heavily penalizes evidence trust when feeds are degraded/stale',
      `evidenceTrust: ${sentinel.evidenceTrust}`
    );
    assert(
      sentinel.primaryThesis.toLowerCase().includes('degraded') ||
      sentinel.primaryThesis.toLowerCase().includes('offline'),
      'Data Sentinel observation truthfully notes degraded telemetry',
      sentinel.primaryThesis
    );
  }

  // =================================================================
  // TEST 23: What Changed panel cannot display unproven catalyst
  // =================================================================
  console.log('[TEST 23: What Changed panel cannot display unproven catalyst]');
  {
    clearHistoricalChanges();
    const changes = getVerifiedHistoricalChanges();
    assert(
      Array.isArray(changes) && changes.length === 0,
      'What Changed returns empty array when no verified transitions exist (no fake catalyst fixtures)',
      `changes count: ${changes.length}`
    );

    // Verify recording a real decision transition
    recordDecisionTransition({
      id: 'delta-1',
      timePrevious: '12:00:00',
      timeCurrent: '12:15:00',
      previousVerdict: 'WAIT',
      currentVerdict: 'WATCH FOR BUY',
      previousConsensus: 50,
      currentConsensus: 80,
      marketCatalysts: ['Confirmed M15 close above 2060.00'],
      agentShifts: [{ agent: 'Technical', from: 'WAIT', to: 'BUY', reason: 'Confirmed M15 close' }],
      criticalTakeaway: 'Structure breakout verified on M15 close',
    });
    const xauChanges = getVerifiedHistoricalChanges();
    assert(
      xauChanges.length >= 1,
      'Real transition is accurately stored and retrieved',
      `xauChanges count: ${xauChanges.length}`
    );
    assert(
      xauChanges[0].marketCatalysts[0].includes('2060.00'),
      'Recorded transition contains actual catalyst rationale',
      xauChanges[0].marketCatalysts[0]
    );
  }

  // =================================================================
  // TEST 24: Vulnerability Matrix cannot display hardcoded current DXY value
  // =================================================================
  console.log('[TEST 24: Vulnerability Matrix cannot display hardcoded current DXY value]');
  {
    const vulFile = path.resolve(__dirname, '../src/components/cockpit/VulnerabilityAuditCard.tsx');
    const vulContent = fs.readFileSync(vulFile, 'utf8');
    const devFile = path.resolve(__dirname, '../src/components/trading/DevilsAdvocateCard.tsx');
    const devContent = fs.readFileSync(devFile, 'utf8');

    assert(
      !vulContent.includes('104.20') && !vulContent.includes('58%'),
      'VulnerabilityAuditCard does not contain hardcoded 104.20 or 58%',
      'Checked VulnerabilityAuditCard.tsx'
    );
    assert(
      !devContent.includes('104.20') && !devContent.includes('58%'),
      'DevilsAdvocateCard does not contain hardcoded 104.20 or 58%',
      'Checked DevilsAdvocateCard.tsx'
    );
  }

  // =================================================================
  // TEST 25: READ_ONLY remains canonical
  // =================================================================
  console.log('[TEST 25: READ_ONLY remains canonical]');
  {
    assert(
      CANONICAL_EXECUTION_MODE === 'READ_ONLY',
      'CANONICAL_EXECUTION_MODE strictly matches READ_ONLY',
      CANONICAL_EXECUTION_MODE
    );
  }

  // =================================================================
  // TEST 26: MT5_ORDER_TRANSPORT_ENABLED remains false
  // =================================================================
  console.log('[TEST 26: MT5_ORDER_TRANSPORT_ENABLED remains false]');
  {
    assert(
      MT5_ORDER_TRANSPORT_ENABLED === false,
      'MT5_ORDER_TRANSPORT_ENABLED is strictly false'
    );
  }

  // =================================================================
  // TEST 27: No order placement transport introduced
  // =================================================================
  console.log('[TEST 27: No order placement transport introduced]');
  {
    // Verify execution policy does not allow order dispatch
    const executionPolicyFile = path.resolve(__dirname, '../src/lib/execution/execution-policy.ts');
    const policyContent = fs.readFileSync(executionPolicyFile, 'utf8');
    assert(
      policyContent.includes("CANONICAL_EXECUTION_MODE = 'READ_ONLY'") &&
      policyContent.includes('MT5_ORDER_TRANSPORT_ENABLED = false'),
      'Execution policy constants remain permanently locked',
      'Checked execution-policy.ts'
    );
  }

  // =================================================================
  // TEST 28: Broker BID/ASK authority unchanged
  // =================================================================
  console.log('[TEST 28: Broker BID/ASK authority unchanged]');
  {
    const execPriceRes = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
      isMt5Connected: true,
      terminalConnected: true,
      bridgeConnected: true,
      isProduction: false,
      operatingMode: 'DEMO_EXECUTION',
      direction: 'BUY',
      brokerQuote: {
        symbol: 'XAUUSD',
        bid: 2050.10,
        ask: 2050.40,
        spread: 0.30,
        serverTime: new Date().toISOString(),
        timestamp: Date.now(),
      } as any,
    });

    assert(
      execPriceRes.isExecutable === true && execPriceRes.priceClass === 'EXECUTABLE_BROKER',
      'Broker direct BID/ASK is approved for execution purpose',
      `status: ${execPriceRes.status}, isExecutable: ${execPriceRes.isExecutable}`
    );

    const nonBrokerRes = resolvePriceForPurpose('XAUUSD', 'EXECUTION', {
      isMt5Connected: false,
      direction: 'BUY',
      referenceAsset: {
        symbol: 'XAUUSD',
        price: 2050.25,
      } as any,
    });

    assert(
      nonBrokerRes.isExecutable === false,
      'External non-broker feed is strictly rejected for execution purpose',
      `isExecutable: ${nonBrokerRes.isExecutable}`
    );
  }

  // =================================================================
  // TEST 29: No synthetic candles
  // =================================================================
  console.log('[TEST 29: No synthetic candles]');
  {
    const candles = makeCandleSeries(15, 2050, 'UP', 15);
    const trigger = CandleCloseTriggerEngine.evaluateTrigger({
      symbol: 'XAUUSD',
      candlesM15: candles,
      currentPrice: 2060,
      provenance: 'UNAVAILABLE', // Non-verified provenance
      currentTimeMs: candles[candles.length - 1].timestamp + 60000,
    });

    assert(
      trigger.provenance === 'UNAVAILABLE',
      'Trigger preserves provenance truthfulness without fabricating verified status',
      trigger.provenance
    );
  }

  // =================================================================
  // TEST 30: No synthetic correlation
  // =================================================================
  console.log('[TEST 30: No synthetic correlation]');
  {
    // Insufficient samples (< 5 observations) returns null (no fabricated correlation)
    const correlation = calculatePearsonCorrelation(
      [
        { date: '2026-01-01', value: 10 },
        { date: '2026-01-02', value: 20 },
      ],
      [
        { date: '2026-01-01', value: 15 },
        { date: '2026-01-02', value: 25 },
      ]
    );
    assert(
      correlation === null,
      'Pearson correlation with insufficient observations returns null (fails closed, no synthetic correlation)',
      `correlation: ${correlation}`
    );
  }

  // =================================================================
  // TEST 31: No fake macro values
  // =================================================================
  console.log('[TEST 31: No fake macro values]');
  {
    // FastOpportunityEngine notes when DXY or real yields are missing without inventing numbers
    const fastOpp = FastOpportunityEngine.evaluateFastOpportunity({
      symbol: 'XAUUSD',
      currentPrice: 2050,
      triggerEvidence: {
        direction: 'NEUTRAL',
        triggerType: 'NONE',
        triggerTimeframe: 'M15',
        triggerLevel: 0,
        triggerCandleTimestamp: Date.now(),
        confirmationClose: 2050,
        priorHigh: 0,
        priorLow: 0,
        structureState: 'STABLE',
        freshness: 'FRESH',
        provenance: 'VERIFIED',
        confidenceContribution: 0,
        reason: 'Waiting',
        isConfirmed: false,
      },
      blueprint: null,
      marketStructure: null,
      sessionExecutable: true,
      spreadQuality: 'NORMAL',
      hasVerifiedBrokerPrice: true,
      macroCoverage: { isRatesAvailable: false, isRealYieldAvailable: false, isDxyAvailable: false },
    });

    assert(
      fastOpp.globalEvidenceCoverage <= 20,
      'Global evidence coverage drops truthfully when macro observations are missing',
      `coverage: ${fastOpp.globalEvidenceCoverage}`
    );
  }

  // =================================================================
  // TEST 32: No stale setup geometry reused
  // =================================================================
  console.log('[TEST 32: No stale setup geometry reused]');
  {
    const bp = makeMockBlueprint('XAUUSD', 'BUY', 2050, 2040, 2065);
    const structure = makeMockStructure('XAUUSD', 'BULLISH', 2060, 2040);
    // Invalidate setup
    SetupLifecycleEngine.recordInvalidation(bp, 2039, 'Breached SL', structure);

    // Verify reuse of same blueprint is rejected
    const reval = SetupLifecycleEngine.validateBlueprintRelevance(bp, 2052, structure);
    assert(
      reval.isValid === false,
      'Revalidation rejects reusing invalidated blueprint geometry',
      reval.reason
    );
  }

  // =================================================================
  // TEST 33: M15/M30/H1 context remains asset-isolated
  // =================================================================
  console.log('[TEST 33: M15/M30/H1 context remains asset-isolated]');
  {
    const mockAssetXAU: LiveMarketAsset = {
      symbol: 'XAUUSD',
      name: 'Gold',
      price: 2050.0,
      bid: 2049.85,
      ask: 2050.15,
      spread: 0.30,
      change24h: 0.1,
      high24h: 2060.0,
      low24h: 2040.0,
      volume: '$10B',
      sparkline: '2045,2050',
      source: 'TEST',
      lastUpdated: new Date().toISOString(),
      category: 'COMMODITY',
    };
    const mockAssetEUR: LiveMarketAsset = {
      symbol: 'EURUSD',
      name: 'Euro',
      price: 1.0850,
      bid: 1.0849,
      ask: 1.0851,
      spread: 0.0002,
      change24h: 0.05,
      high24h: 1.0900,
      low24h: 1.0800,
      volume: '$50B',
      sparkline: '1.084,1.085',
      source: 'TEST',
      lastUpdated: new Date().toISOString(),
      category: 'FOREX',
    };

    const xauProfile = generateAssetIntelligence('XAUUSD', mockAssetXAU, 'H1', makeCandleSeries(15, 2050, 'FLAT', 60));
    const eurProfile = generateAssetIntelligence('EURUSD', mockAssetEUR, 'H1', makeCandleSeries(15, 1.085, 'FLAT', 60));

    assert(
      xauProfile.multiTimeframeContext?.symbol === 'XAUUSD',
      'XAUUSD multi-timeframe context holds XAUUSD symbol',
      xauProfile.multiTimeframeContext?.symbol
    );
    assert(
      eurProfile.multiTimeframeContext?.symbol === 'EURUSD',
      'EURUSD multi-timeframe context holds EURUSD symbol',
      eurProfile.multiTimeframeContext?.symbol
    );
  }

  // =================================================================
  // TEST 34: XAUUSD evidence never leaks into another asset
  // =================================================================
  console.log('[TEST 34: XAUUSD evidence never leaks into another asset]');
  {
    const mockAssetEUR: LiveMarketAsset = {
      symbol: 'EURUSD',
      name: 'Euro',
      price: 1.0850,
      bid: 1.0849,
      ask: 1.0851,
      spread: 0.0002,
      change24h: 0.05,
      high24h: 1.0900,
      low24h: 1.0800,
      volume: '$50B',
      sparkline: '1.084,1.085',
      source: 'TEST',
      lastUpdated: new Date().toISOString(),
      category: 'FOREX',
    };
    const eurProfile = generateAssetIntelligence('EURUSD', mockAssetEUR, 'H1', makeCandleSeries(15, 1.085, 'FLAT', 60));

    // Confirm that EURUSD blueprint or trigger levels do not contain gold prices (> 1000)
    const triggerLevel = eurProfile.triggerEvidence?.triggerLevel || 0;
    assert(
      triggerLevel < 100,
      'EURUSD trigger level is within FX range (< 100), no XAUUSD gold price contamination',
      `triggerLevel: ${triggerLevel}`
    );
  }

  // =================================================================
  // TEST 35: Existing confluence domain deduplication still works
  // =================================================================
  console.log('[TEST 35: Existing confluence domain deduplication still works]');
  {
    // Pass 4 technical agents with same stance
    const duplicateAgents: UnifiedAgentResponse[] = [
      makeMockAgent('TECH1', 'Technical 1', 'TECHNICAL', 'BULLISH', 80),
      makeMockAgent('TECH2', 'Technical 2', 'TECHNICAL', 'BULLISH', 80),
      makeMockAgent('TECH3', 'Technical 3', 'TECHNICAL', 'BULLISH', 80),
      makeMockAgent('TECH4', 'Technical 4', 'TECHNICAL', 'BULLISH', 80),
    ];
    const confluence = CortexConfluenceEngine.evaluateConfluence(duplicateAgents);

    // Coverage score for a single domain family should be 20% (1/5)
    assert(
      confluence.coverageScore <= 25,
      'Multiple agents from single domain do NOT inflate domain coverage score',
      `coverageScore: ${confluence.coverageScore}`
    );
    assert(
      confluence.dataReadiness === 'DATA_LIMITED',
      'Confluence remains DATA_LIMITED when only 1 domain is represented',
      confluence.dataReadiness
    );
  }

  // =================================================================
  // SUMMARY
  // =================================================================
  console.log('\n=================================================================');
  console.log(`TOTAL TESTS: ${passCount + failCount}`);
  console.log(`PASSED: ${passCount}`);
  console.log(`FAILED: ${failCount}`);
  console.log('=================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runM15M30OpportunityRecoveryTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
