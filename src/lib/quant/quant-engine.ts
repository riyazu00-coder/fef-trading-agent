/**
 * FEF CORTEX — QUANT INTELLIGENCE FOUNDATION & HISTORICAL ANALOGUE ENGINE
 * Milestone G Clean-Room Implementation
 * 
 * Rules:
 * 1. Zero look-ahead bias and zero fake backtest precision.
 * 2. Statistical calculations:
 *    - Log / Simple Returns
 *    - Historical Volatility (sample standard deviation annualized)
 *    - Maximum Drawdown
 *    - Rolling Percentile Rank
 * 3. Historical Analogue Engine:
 *    - Matches past multi-dimensional regimes (macro + technical + volatility)
 *    - Mandatory sample size validation: never outputs probability without sampleCount
 *    - Outputs distribution and forward horizon medians
 */

export interface PriceBar {
  date: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface QuantMetricsResult {
  sampleCount: number;
  annualizedVolatilityPct: number;
  maxDrawdownPct: number;
  meanDailyReturnPct: number;
  positiveReturnFrequencyPct: number;
  sharpeRatioProxy: number;
  status: 'VALID' | 'INSUFFICIENT_DATA';
}

/**
 * Calculates essential quantitative metrics over a series of price bars.
 */
export function calculateQuantMetrics(bars: PriceBar[], riskFreeRatePct: number = 4.0): QuantMetricsResult {
  if (!bars || bars.length < 5) {
    return {
      sampleCount: bars ? bars.length : 0,
      annualizedVolatilityPct: 0,
      maxDrawdownPct: 0,
      meanDailyReturnPct: 0,
      positiveReturnFrequencyPct: 0,
      sharpeRatioProxy: 0,
      status: 'INSUFFICIENT_DATA',
    };
  }

  // Calculate daily returns
  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const curr = bars[i].close;
    if (prev > 0) {
      returns.push((curr - prev) / prev);
    }
  }

  const n = returns.length;
  if (n < 4) {
    return {
      sampleCount: n,
      annualizedVolatilityPct: 0,
      maxDrawdownPct: 0,
      meanDailyReturnPct: 0,
      positiveReturnFrequencyPct: 0,
      sharpeRatioProxy: 0,
      status: 'INSUFFICIENT_DATA',
    };
  }

  // Mean return
  const meanReturn = returns.reduce((acc, r) => acc + r, 0) / n;

  // Sample variance and standard deviation
  const variance = returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / (n - 1);
  const dailyVol = Math.sqrt(variance);
  const annualizedVolPct = Math.round(dailyVol * Math.sqrt(252) * 100 * 100) / 100;

  // Positive return frequency
  const positiveCount = returns.filter((r) => r > 0).length;
  const positiveFrequencyPct = Math.round((positiveCount / n) * 100 * 10) / 10;

  // Max Drawdown calculation
  let peak = bars[0].close;
  let maxDd = 0;
  for (const b of bars) {
    if (b.close > peak) {
      peak = b.close;
    }
    const dd = peak > 0 ? (peak - b.close) / peak : 0;
    if (dd > maxDd) {
      maxDd = dd;
    }
  }
  const maxDrawdownPct = Math.round(maxDd * 100 * 100) / 100;

  // Annualized Sharpe Proxy
  const annualizedReturn = meanReturn * 252;
  const rf = riskFreeRatePct / 100;
  const sharpe = annualizedVolPct > 0 ? (annualizedReturn - rf) / (annualizedVolPct / 100) : 0;

  return {
    sampleCount: n,
    annualizedVolatilityPct: annualizedVolPct,
    maxDrawdownPct,
    meanDailyReturnPct: Math.round(meanReturn * 100 * 1000) / 1000,
    positiveReturnFrequencyPct: positiveFrequencyPct,
    sharpeRatioProxy: Math.round(sharpe * 100) / 100,
    status: 'VALID',
  };
}

export interface HistoricalAnalogueQuery {
  currentTrend: 'BULLISH' | 'BEARISH' | 'RANGING';
  realYieldDirection: 'RISING' | 'FALLING' | 'FLAT';
  volatilityLevel: 'HIGH' | 'NORMAL' | 'LOW';
  historicalPeriods: Array<{
    date: string;
    trend: 'BULLISH' | 'BEARISH' | 'RANGING';
    realYieldDirection: 'RISING' | 'FALLING' | 'FLAT';
    volatilityLevel: 'HIGH' | 'NORMAL' | 'LOW';
    forwardReturnsPct: {
      tPlus5: number;
      tPlus20: number;
    };
  }>;
}

export interface HistoricalAnalogueResult {
  matchedSampleCount: number;
  similarityCriteria: string;
  forward5dMedianReturnPct?: number;
  forward20dMedianReturnPct?: number;
  positiveOutcomeFrequency5dPct?: number;
  positiveOutcomeFrequency20dPct?: number;
  limitationsNotice: string;
  status: 'VALID' | 'INSUFFICIENT_SAMPLE';
}

/**
 * Deterministic Historical Analogue Engine
 */
export function matchHistoricalAnalogues(query: HistoricalAnalogueQuery): HistoricalAnalogueResult {
  const matches = (query.historicalPeriods || []).filter((period) => {
    return (
      period.trend === query.currentTrend &&
      period.realYieldDirection === query.realYieldDirection &&
      period.volatilityLevel === query.volatilityLevel
    );
  });

  const n = matches.length;
  // If fewer than 3 historical matches found, fail closed to INSUFFICIENT_SAMPLE
  if (n < 3) {
    return {
      matchedSampleCount: n,
      similarityCriteria: `Trend=${query.currentTrend}, RealYield=${query.realYieldDirection}, Vol=${query.volatilityLevel}`,
      limitationsNotice: 'Sample size below threshold (n < 3). Historical analogies require larger benchmark corpus.',
      status: 'INSUFFICIENT_SAMPLE',
    };
  }

  // Calculate forward return stats
  const ret5 = matches.map((m) => m.forwardReturnsPct.tPlus5).sort((a, b) => a - b);
  const ret20 = matches.map((m) => m.forwardReturnsPct.tPlus20).sort((a, b) => a - b);

  const median5 = ret5[Math.floor(ret5.length / 2)];
  const median20 = ret20[Math.floor(ret20.length / 2)];

  const pos5 = Math.round((ret5.filter((r) => r > 0).length / n) * 100);
  const pos20 = Math.round((ret20.filter((r) => r > 0).length / n) * 100);

  return {
    matchedSampleCount: n,
    similarityCriteria: `Trend=${query.currentTrend}, RealYield=${query.realYieldDirection}, Vol=${query.volatilityLevel}`,
    forward5dMedianReturnPct: Math.round(median5 * 100) / 100,
    forward20dMedianReturnPct: Math.round(median20 * 100) / 100,
    positiveOutcomeFrequency5dPct: pos5,
    positiveOutcomeFrequency20dPct: pos20,
    limitationsNotice: 'Past regimes do not guarantee future performance. Research evidence for contextual hypothesis only.',
    status: 'VALID',
  };
}

