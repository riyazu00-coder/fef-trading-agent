/**
 * FEF CORTEX — DYNAMIC CORRELATION ENGINE
 * 
 * Computes rolling Pearson correlation coefficients across multi-asset benchmarks:
 * - XAUUSD vs DXY (Dollar Index)
 * - XAUUSD vs US10Y (10-Year Treasury Yield)
 * - XAUUSD vs XAGUSD (Silver Spot)
 * - XAUUSD vs USOIL (Crude Oil)
 * - XAUUSD vs SPX / US500 (Equities)
 * - Detects regime shifts, decouplings, and flight-to-safety signals.
 */

import { OHLCCandle } from './canonical-market-snapshot';

export interface AssetCorrelationResult {
  baseSymbol: string;
  targetSymbol: string;
  timeframe: string;
  windowBars: number;
  pearsonR: number; // -1.0 to +1.0
  historicalMean: number;
  divergence: number; // delta from expected norm
  regime: 'NORMAL' | 'DECOUPLING' | 'BREAKDOWN' | 'INSUFFICIENT_DATA';
  signal: 'NEUTRAL' | 'GOLD_BULLISH_DIVERGENCE' | 'GOLD_BEARISH_DIVERGENCE' | 'RISK_OFF_FLOW';
  description: string;
  calculatedAt: string;
}

export interface MultiAssetCorrelationMatrix {
  baseSymbol: string;
  calculatedAt: string;
  correlations: Record<string, AssetCorrelationResult>;
  macroHealthScore: number; // 0 - 100
  dominantMacroDriver: string;
}

export function computePearsonR(seriesA: number[], seriesB: number[]): number {
  const n = Math.min(seriesA.length, seriesB.length);
  if (n < 5) return 0;

  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += seriesA[i];
    sumB += seriesB[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = seriesA[i] - meanA;
    const diffB = seriesB[i] - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  }

  const denominator = Math.sqrt(denomA * denomB);
  if (denominator === 0) return 0;

  return Math.max(-1, Math.min(1, numerator / denominator));
}

export function evaluateCorrelationRegime(
  baseSymbol: string,
  targetSymbol: string,
  baseCandles: OHLCCandle[],
  targetCandles: OHLCCandle[],
  timeframe: string = 'H1',
  windowBars: number = 20
): AssetCorrelationResult {
  const normBase = baseSymbol.toUpperCase();
  const normTarget = targetSymbol.toUpperCase();

  if (!baseCandles || !targetCandles || baseCandles.length < 5 || targetCandles.length < 5) {
    return {
      baseSymbol: normBase,
      targetSymbol: normTarget,
      timeframe,
      windowBars,
      pearsonR: 0,
      historicalMean: getExpectedHistoricalMean(normBase, normTarget),
      divergence: 0,
      regime: 'INSUFFICIENT_DATA',
      signal: 'NEUTRAL',
      description: `Insufficient overlapping candles to compute rolling correlation between ${normBase} and ${normTarget}.`,
      calculatedAt: new Date().toISOString(),
    };
  }

  // Align timestamps or take latest N close prices
  const baseCloses = baseCandles.slice(-windowBars).map((c) => c.close);
  const targetCloses = targetCandles.slice(-windowBars).map((c) => c.close);

  const r = Number(computePearsonR(baseCloses, targetCloses).toFixed(3));
  const expectedMean = getExpectedHistoricalMean(normBase, normTarget);
  const divergence = Number((r - expectedMean).toFixed(3));

  let regime: 'NORMAL' | 'DECOUPLING' | 'BREAKDOWN' | 'INSUFFICIENT_DATA' = 'NORMAL';
  let signal: 'NEUTRAL' | 'GOLD_BULLISH_DIVERGENCE' | 'GOLD_BEARISH_DIVERGENCE' | 'RISK_OFF_FLOW' = 'NEUTRAL';
  let desc = '';

  // Analysis for Gold vs DXY (normally strongly negative ~ -0.75)
  if (normBase === 'XAUUSD' && (normTarget === 'DXY' || normTarget === 'USDJPY')) {
    if (r > 0.15) {
      regime = 'DECOUPLING';
      signal = 'GOLD_BULLISH_DIVERGENCE';
      desc = `Abnormal positive correlation (r=${r}). Gold holding bid despite Dollar strength — indicates sovereign/geopolitical safe-haven bid.`;
    } else if (r < -0.85) {
      regime = 'NORMAL';
      desc = `Strong inverse correlation (r=${r}). Standard FX/macro pricing dynamics intact.`;
    } else {
      regime = 'NORMAL';
      desc = `Moderate negative correlation (r=${r}). Aligned with expected currency transmission.`;
    }
  } else if (normBase === 'XAUUSD' && normTarget === 'XAGUSD') {
    // Silver (normally strongly positive ~ +0.85)
    if (r < 0.40) {
      regime = 'DECOUPLING';
      desc = `Precious metals divergence (r=${r}). Gold/Silver ratio expanding.`;
    } else {
      regime = 'NORMAL';
      desc = `Healthy co-movement (r=${r}) across precious metals complex.`;
    }
  } else {
    desc = `Rolling correlation r=${r} vs historical benchmark ${expectedMean}.`;
  }

  return {
    baseSymbol: normBase,
    targetSymbol: normTarget,
    timeframe,
    windowBars,
    pearsonR: r,
    historicalMean: expectedMean,
    divergence,
    regime,
    signal,
    description: desc,
    calculatedAt: new Date().toISOString(),
  };
}

function getExpectedHistoricalMean(base: string, target: string): number {
  if (base === 'XAUUSD') {
    if (target === 'DXY' || target === 'USDJPY') return -0.72;
    if (target === 'US10Y') return -0.65;
    if (target === 'XAGUSD') return +0.82;
    if (target === 'USOIL') return +0.40;
    if (target === 'US500' || target === 'SPX') return +0.25;
  }
  return 0.0;
}
