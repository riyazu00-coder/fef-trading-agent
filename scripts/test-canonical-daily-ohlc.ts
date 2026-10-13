/**
 * FEF TRADING SOLUTIONS — CANONICAL ALL-ASSET DAILY OHLC TEST SUITE
 *
 * Verifies mathematical invariants, provenance coupling, freshness thresholds,
 * fail-closed integrity, and universe-wide consistency across all 26 canonical assets.
 */

import {
  evaluateCanonicalDailyStats,
  EvaluateDailyStatsInput,
  DailyCandleBar,
} from '../src/lib/price/canonical-daily-ohlc';
import { getAllMarkets, MARKET_REGISTRY } from '../src/lib/registry/market-registry';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ PASSED: ${msg}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAILED: ${msg}`);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('FEF CORTEX — CANONICAL ALL-ASSET DAILY OHLC AUDIT & TEST SUITE');
  console.log('========================================================================\n');

  const nowMs = Date.now();
  const oneHourAgo = nowMs - 3600 * 1000;

  // --- Case A: Valid MT5 D1 OHLC + quote -> PASS ---
  console.log('--- Case A: Valid MT5 D1 OHLC + quote -> PASS ---');
  {
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: oneHourAgo,
        open: 4165.50,
        high: 4180.20,
        low: 4150.10,
        close: 4160.00,
        tickVolume: 1250,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: {
        bid: 4159.98,
        ask: 4160.02,
        mid: 4160.00,
        spread: 0.04,
        broker: 'Exness Technologies Ltd',
        isDisplayLive: true,
      },
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      d1Provider: 'Exness Technologies Ltd',
      nowMs,
    });

    assert(res.isVerified === true, 'A1: Valid MT5 D1 + quote is verified');
    assert(res.provenance === 'LIVE_MT5', 'A2: Provenance is LIVE_MT5');
    assert(res.open === 4165.50, 'A3: Day Open equals bar open');
    assert(res.high === 4180.20, 'A4: Day High equals bar high');
    assert(res.low === 4150.10, 'A5: Day Low equals bar low');
    assert(res.currentPrice === 4159.98, 'A6: Current Price matches broker bid');
    assert(res.change !== null && Math.abs(res.change - (4159.98 - 4165.50)) < 0.001, 'A7: Change is currentPrice - open');
    assert(res.changePct !== null && Math.abs(res.changePct - ((4159.98 - 4165.50) / 4165.50 * 100)) < 0.001, 'A8: Change % is mathematically derived');
    assert(res.isPositive === false, 'A9: isPositive is false for downward movement');
  }

  // --- Case B: Current price below Day Low -> Reject ---
  console.log('\n--- Case B: Current price below Day Low (The Observed Bug) -> Reject ---');
  {
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: oneHourAgo,
        open: 4349.70,
        high: 4396.68,
        low: 4302.72, // Alien low > current price 4160
        close: 4350.00,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: {
        bid: 4159.98,
        ask: 4160.02,
        mid: 4160.00,
        spread: 0.04,
        broker: 'Exness Technologies Ltd',
        isDisplayLive: true,
      },
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      nowMs,
    });

    assert(res.isVerified === false, 'B1: Price below Low must fail verification');
    assert(res.provenance === 'DATA_LIMITED', 'B2: Provenance falls back to DATA_LIMITED');
    assert(res.open === null, 'B3: Unverified Open is null (never fake number)');
    assert(res.high === null, 'B4: Unverified High is null');
    assert(res.low === null, 'B5: Unverified Low is null');
    assert(res.reason?.includes('INVARIANT_VIOLATION_CURRENT_BELOW_LOW') === true, 'B6: Correct invariant violation reason');
  }

  // --- Case C: Current price above Day High -> Reject ---
  console.log('\n--- Case C: Current price above Day High -> Reject ---');
  {
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: oneHourAgo,
        open: 4000.00,
        high: 4100.00, // Alien high < current price 4160
        low: 3950.00,
        close: 4050.00,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: {
        bid: 4159.98,
        ask: 4160.02,
        broker: 'Exness',
        isDisplayLive: true,
      },
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      nowMs,
    });

    assert(res.isVerified === false, 'C1: Price above High fails verification');
    assert(res.provenance === 'DATA_LIMITED', 'C2: Falls back to DATA_LIMITED');
    assert(res.reason?.includes('INVARIANT_VIOLATION_CURRENT_ABOVE_HIGH') === true, 'C3: Correct invariant violation reason');
  }

  // --- Case D: Open outside Low/High -> Reject ---
  console.log('\n--- Case D: Open outside Low/High -> Reject ---');
  {
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: oneHourAgo,
        open: 4200.00, // Open > High (4180)
        high: 4180.00,
        low: 4150.00,
        close: 4160.00,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: { bid: 4160.00, ask: 4160.04 },
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      nowMs,
    });

    assert(res.isVerified === false, 'D1: Open outside range fails verification');
    assert(res.reason?.includes('INVARIANT_VIOLATION_OPEN_OUTSIDE_RANGE') === true, 'D2: Correct open outside range reason');
  }

  // --- Case E: High < Low -> Reject ---
  console.log('\n--- Case E: High < Low -> Reject ---');
  {
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: oneHourAgo,
        open: 4160.00,
        high: 4140.00, // High < Low (4170)
        low: 4170.00,
        close: 4150.00,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: { bid: 4150.00, ask: 4150.04 },
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      nowMs,
    });

    assert(res.isVerified === false, 'E1: High < Low fails verification');
    assert(res.reason?.includes('INVARIANT_VIOLATION_LOW_EXCEEDS_HIGH') === true, 'E2: Correct low exceeds high reason');
  }

  // --- Case F: Stale D1 candle -> DATA LIMITED ---
  console.log('\n--- Case F: Stale D1 candle (> 120h for traditional) -> DATA LIMITED ---');
  {
    const staleTimestamp = nowMs - (125 * 3600 * 1000); // 125 hours ago (> 120h)
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: staleTimestamp,
        open: 4150.00,
        high: 4170.00,
        low: 4140.00,
        close: 4160.00,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: { bid: 4160.00, ask: 4160.04 },
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      nowMs,
    });

    assert(res.isVerified === false, 'F1: Stale D1 candle fails verification');
    assert(res.reason?.includes('STALE_DAILY_CANDLE') === true, 'F2: Reason is STALE_DAILY_CANDLE');
  }

  // --- Case G: Previous day candle within weekend window (48h) for traditional asset ---
  console.log('\n--- Case G: Traditional asset D1 candle within 120h weekend gap ---');
  {
    const weekendTimestamp = nowMs - (48 * 3600 * 1000); // 48 hours ago (Sunday over weekend)
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: weekendTimestamp,
        open: 4150.00,
        high: 4170.00,
        low: 4140.00,
        close: 4160.00,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: { bid: 4160.00, ask: 4160.04 },
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      nowMs,
    });

    assert(res.isVerified === true, 'G1: Traditional asset accepts 48h D1 bar across weekend');
  }

  // --- Case H: MT5 quote + reference OHLC mix -> Reject provenance ---
  console.log('\n--- Case H: MT5 quote + reference OHLC mix -> Reject provenance ---');
  {
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: oneHourAgo,
        open: 4150.00,
        high: 4170.00,
        low: 4140.00,
        close: 4160.00,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: { bid: 4160.00, ask: 4160.04 },
      d1Candles,
      d1Provenance: 'INDEPENDENT_REFERENCE', // Prov mix: MT5 broker quote with Reference OHLC
      nowMs,
    });

    assert(res.isVerified === false, 'H1: Mixed provenance fails verification');
    assert(res.reason?.includes('PROVENANCE_MISMATCH') === true, 'H2: Reason is PROVENANCE_MISMATCH');
  }

  // --- Case I: Missing D1 candle -> DATA LIMITED ---
  console.log('\n--- Case I: Missing D1 candle -> DATA LIMITED ---');
  {
    const res = evaluateCanonicalDailyStats({
      symbol: 'XAUUSD',
      category: 'METALS',
      isBrokerConnected: true,
      brokerQuote: { bid: 4160.00, ask: 4160.04 },
      d1Candles: null,
      nowMs,
    });

    assert(res.isVerified === false, 'I1: Missing D1 candles fails verification');
    assert(res.reason === 'MISSING_D1_CANDLES', 'I2: Reason is MISSING_D1_CANDLES');
    assert(res.open === null, 'I3: Open is null');
    assert(res.high === null, 'I4: High is null');
    assert(res.low === null, 'I5: Low is null');
  }

  // --- Case J: Unavailable broker symbol (e.g. GER40) -> Truthful unavailable ---
  console.log('\n--- Case J: Unavailable broker symbol (e.g. GER40) -> Truthful unavailable ---');
  {
    const res = evaluateCanonicalDailyStats({
      symbol: 'GER40',
      category: 'INDICES',
      isBrokerConnected: false, // broker does not have GER40
      referencePrice: 19850.5,
      referenceProvider: 'Yahoo Finance Reference',
      d1Candles: null,
      nowMs,
    });

    assert(res.isVerified === false, 'J1: Unavailable broker/candles returns unverified');
    assert(res.currentPrice === 19850.5, 'J2: Reference price preserved honestly');
    assert(res.open === null, 'J3: Open is null without D1');
  }

  // --- Case K: Market closed asset -> Invariants remain strictly evaluated ---
  console.log('\n--- Case K: Market closed asset -> Invariants remain strictly evaluated ---');
  {
    const closedTimestamp = nowMs - (36 * 3600 * 1000); // 36 hours ago (Saturday close)
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: closedTimestamp,
        open: 1.0850,
        high: 1.0890,
        low: 1.0820,
        close: 1.0865,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'EURUSD',
      category: 'FOREX',
      isBrokerConnected: true,
      brokerQuote: { bid: 1.0865, ask: 1.0866 }, // Friday close bid
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      nowMs,
    });

    assert(res.isVerified === true, 'K1: Market closed asset with valid close quote verifies cleanly');
    assert(res.open === 1.0850, 'K2: Open preserved from last active bar');
    assert(res.high === 1.0890, 'K3: High preserved');
    assert(res.low === 1.0820, 'K4: Low preserved');
  }

  // --- Case L: Crypto 24/7 daily boundary -> 36h freshness cutoff ---
  console.log('\n--- Case L: Crypto 24/7 daily boundary -> 36h freshness cutoff ---');
  {
    const staleCryptoTimestamp = nowMs - (40 * 3600 * 1000); // 40 hours ago (> 36h cutoff)
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: staleCryptoTimestamp,
        open: 65000,
        high: 67000,
        low: 64000,
        close: 66000,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'BTCUSD',
      category: 'CRYPTO',
      isBrokerConnected: false,
      referencePrice: 66500,
      d1Candles,
      d1Provenance: 'INDEPENDENT_VERIFIED',
      nowMs,
    });

    assert(res.isVerified === false, 'L1: Crypto bar older than 36h fails verification');
    assert(res.reason?.includes('STALE_DAILY_CANDLE') === true, 'L2: Correct stale reason on crypto');
  }

  // --- Case M: Day Change and Day Change % mathematically consistent from same open ---
  console.log('\n--- Case M: Day Change & Day Change % consistency ---');
  {
    const d1Candles: DailyCandleBar[] = [
      {
        timestamp: oneHourAgo,
        open: 100.00,
        high: 110.00,
        low: 95.00,
        close: 105.00,
      },
    ];

    const res = evaluateCanonicalDailyStats({
      symbol: 'USOIL',
      category: 'COMMODITIES',
      isBrokerConnected: true,
      brokerQuote: { bid: 105.00, ask: 105.04 },
      d1Candles,
      d1Provenance: 'LIVE_MT5',
      nowMs,
    });

    assert(res.isVerified === true, 'M1: Verified USOIL');
    assert(res.change === 5.00, 'M2: Change is exactly 5.00');
    assert(res.changePct === 5.00, 'M3: Change % is exactly 5.00%');
    assert(res.isPositive === true, 'M4: isPositive is true');
  }

  // --- Case N: Audit all 26 canonical assets ---
  console.log('\n--- Case N: Comprehensive Audit Across All 26 Canonical Assets ---');
  {
    const allMarkets = getAllMarkets();
    assert(allMarkets.length === 26, `N0: Market registry contains exactly 26 canonical assets (found: ${allMarkets.length})`);

    let auditSuccessCount = 0;
    for (const mkt of allMarkets) {
      const isCrypto = mkt.category === 'CRYPTO';
      const basePrice = mkt.basePrice;
      const spread = mkt.typicalSpread;

      // Construct realistic active D1 bar for this symbol
      const barOpen = basePrice;
      const barHigh = basePrice * 1.01;
      const barLow = basePrice * 0.99;
      const barClose = basePrice * 1.002;

      const d1Candles: DailyCandleBar[] = [
        {
          timestamp: oneHourAgo,
          open: barOpen,
          high: barHigh,
          low: barLow,
          close: barClose,
        },
      ];

      const res = evaluateCanonicalDailyStats({
        symbol: mkt.symbol,
        category: mkt.category,
        isBrokerConnected: true,
        brokerQuote: {
          bid: barClose,
          ask: barClose + spread,
          mid: barClose + spread / 2,
          spread,
          broker: 'Exness Technologies Ltd',
          isDisplayLive: true,
        },
        d1Candles,
        d1Provenance: 'LIVE_MT5',
        d1Provider: 'Exness Technologies Ltd',
        nowMs,
      });

      if (
        res.isVerified === true &&
        res.open === barOpen &&
        res.high === barHigh &&
        res.low === barLow &&
        res.currentPrice === barClose &&
        res.change !== null &&
        res.changePct !== null
      ) {
        auditSuccessCount++;
      } else {
        console.error(`  ❌ Failed canonical audit on ${mkt.symbol}:`, res.reason);
      }
    }

    assert(auditSuccessCount === 26, `N1: All 26 canonical assets pass daily OHLC evaluation cleanly (verified: ${auditSuccessCount}/26)`);
  }

  console.log('\n========================================================================');
  console.log(`TEST SUMMARY: ${passedTests} passed, ${failedTests} failed.`);
  console.log('========================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
