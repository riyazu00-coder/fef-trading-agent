import {
  calculateEMA,
  calculateRSI,
  calculateATR,
  computeTechnicalIndicators,
  analyzeTimeframeDirection,
  evaluateMultiTimeframeDirection
} from '../src/lib/market/multi-timeframe-direction-engine';
import { OHLCCandle } from '../src/lib/market/canonical-market-snapshot';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}

console.log('--- Testing Multi-Timeframe Direction Engine ---');

// 1. Generate 30 synthetic bullish candles
const now = Date.now();
const bullishCandles: OHLCCandle[] = Array.from({ length: 30 }, (_, i) => {
  const t = Math.floor((now - (30 - i) * 900_000) / 1000);
  const base = 2700 + i * 2.0;
  return {
    time: t,
    timestamp: t * 1000,
    open: base,
    high: base + 3.0,
    low: base - 0.5,
    close: base + 2.5,
    volume: 100 + i * 10
  };
});

// 2. EMA Calculation
const ema9 = calculateEMA(bullishCandles, 9);
const ema21 = calculateEMA(bullishCandles, 21);
assert(ema9 !== null && ema21 !== null, 'EMAs 9 and 21 are calculated');
assert(ema9! > ema21!, `EMA9 (${ema9}) > EMA21 (${ema21}) for steady bullish trend`);

// 3. RSI Calculation
const rsi = calculateRSI(bullishCandles, 14);
assert(rsi !== null, 'RSI 14 is calculated');
assert(rsi! > 60, `RSI (${rsi}) reflects bullish momentum (> 60)`);

// 4. ATR Calculation
const atr = calculateATR(bullishCandles, 14);
assert(atr !== null && atr! > 0, `ATR (${atr}) is positive`);

// 5. Technical Indicators Suite
const indicators = computeTechnicalIndicators(bullishCandles);
assert(indicators.lastCandleColor === 'GREEN', 'Last candle is GREEN');
assert(indicators.momentumScore > 30, `Momentum score (${indicators.momentumScore}) is strongly bullish`);

// 6. Timeframe Direction Analysis
const tfAnalysis = analyzeTimeframeDirection(bullishCandles, 'M15', 'XAUUSD');
assert(tfAnalysis.lastCandleDirection === 'BULLISH', 'Last candle direction is BULLISH');
assert(tfAnalysis.shortTermMomentum === 'BULLISH', 'Short-term momentum is BULLISH');
assert(tfAnalysis.timeframeTrend === 'BULLISH', 'Timeframe trend is BULLISH');

// 7. Retracement Candles (Bearish pullback in an overall bullish context)
const pullbackCandles: OHLCCandle[] = Array.from({ length: 15 }, (_, i) => {
  const t = Math.floor((now - (15 - i) * 300_000) / 1000);
  const base = 2760 - i * 1.5;
  return {
    time: t,
    timestamp: t * 1000,
    open: base,
    high: base + 0.5,
    low: base - 2.0,
    close: base - 1.2,
    volume: 80
  };
});

// 8. Multi-Timeframe Bundle Evaluation
const bundle = {
  H1: bullishCandles,
  H4: bullishCandles,
  M15: pullbackCandles,
  M5: pullbackCandles
};

const mtfReport = evaluateMultiTimeframeDirection(bundle, 'XAUUSD', 'M15');
assert(mtfReport.higherTimeframeBias === 'BULLISH', `Higher timeframe bias is BULLISH (${mtfReport.higherTimeframeBias})`);
assert(mtfReport.shortTermMomentum === 'BEARISH', `Short term momentum is BEARISH (${mtfReport.shortTermMomentum})`);
assert(mtfReport.executionDirection === 'WAIT', `Execution direction is WAIT during retracement (${mtfReport.executionDirection})`);
assert(mtfReport.confluenceDescription.includes('Bullish Trend Retracement'), `Confluence correctly explains pullback: "${mtfReport.confluenceDescription}"`);

// 9. Fully Aligned Bundle
const alignedBundle = {
  H1: bullishCandles,
  H4: bullishCandles,
  M15: bullishCandles,
  M5: bullishCandles
};
const alignedReport = evaluateMultiTimeframeDirection(alignedBundle, 'XAUUSD', 'M15');
assert(alignedReport.isHtfltfAligned === true, 'HTF and LTF are aligned');
assert(alignedReport.executionDirection === 'BUY', 'Execution direction is BUY when aligned');

console.log('ALL 9 TESTS PASSED SUCCESSFULLY!');

