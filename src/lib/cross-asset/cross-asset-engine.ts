/**
 * FEF CORTEX — CROSS-ASSET INTELLIGENCE FOUNDATION
 * Milestone F Clean-Room Implementation
 * 
 * Rules:
 * 1. Zero synthetic correlations: calculates rolling Pearson correlation over verified aligned observations.
 * 2. Never claims causation from correlation.
 * 3. DXY is strictly classified as UNAVAILABLE when unconfigured.
 * 4. Intermarket relationships anchored to XAUUSD:
 *    - Real Yields (Negative correlation benchmark)
 *    - Nominal Yields (Negative correlation benchmark)
 *    - Equities / US500 (Risk sentiment beta)
 *    - Oil / USOIL (Energy / commodity inflation basket)
 *    - Silver / XAGUSD (Precious metals beta)
 */

import {
  createFailedClosedEnvelope,
  createVerifiedEnvelope,
  VerifiedEvidenceEnvelope,
} from '../providers/canonical-envelope';

export interface TimeSeriesPoint {
  date: string;
  timestamp: number;
  value: number;
}

export interface CrossAssetRelationship {
  baseSymbol: string;
  targetSymbol: string;
  relationType: 'NEGATIVE_BETA' | 'POSITIVE_BETA' | 'NEUTRAL_OR_DYNAMIC';
  rollingCorrelation?: number;
  sampleCount: number;
  startDate?: string;
  endDate?: string;
  status: 'VERIFIED' | 'DATA_LIMITED' | 'UNAVAILABLE';
  notes: string;
}

/**
 * Calculates Pearson correlation between two aligned time series.
 * Returns null if sample count < 5 or variance is zero.
 */
export function calculatePearsonCorrelation(
  seriesA: TimeSeriesPoint[],
  seriesB: TimeSeriesPoint[]
): { correlation: number; sampleCount: number } | null {
  // Map series B by date
  const mapB = new Map<string, number>();
  for (const pt of seriesB) {
    if (pt && typeof pt.value === 'number' && Number.isFinite(pt.value) && !isNaN(pt.value)) {
      mapB.set(pt.date, pt.value);
    }
  }

  // Find overlapping aligned pairs
  const alignedA: number[] = [];
  const alignedB: number[] = [];

  for (const pt of seriesA) {
    if (pt && typeof pt.value === 'number' && Number.isFinite(pt.value) && !isNaN(pt.value)) {
      if (mapB.has(pt.date)) {
        alignedA.push(pt.value);
        alignedB.push(mapB.get(pt.date)!);
      }
    }
  }

  const n = alignedA.length;
  if (n < 5) {
    return null; // Insufficient samples for statistically sound correlation
  }

  // Means
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += alignedA[i];
    sumB += alignedB[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  // Covariance & standard deviations
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const diffA = alignedA[i] - meanA;
    const diffB = alignedB[i] - meanB;
    cov += diffA * diffB;
    varA += diffA * diffA;
    varB += diffB * diffB;
  }

  if (varA <= 0 || varB <= 0) {
    return null; // Zero variance cannot compute correlation
  }

  const r = cov / Math.sqrt(varA * varB);
  return {
    correlation: Math.round(r * 1000) / 1000,
    sampleCount: n,
  };
}

export interface CrossAssetUniverseInputs {
  goldSeries: TimeSeriesPoint[];
  tenYearYieldSeries?: TimeSeriesPoint[];
  realYieldSeries?: TimeSeriesPoint[];
  equitySeries?: TimeSeriesPoint[];
  oilSeries?: TimeSeriesPoint[];
  silverSeries?: TimeSeriesPoint[];
  hasVerifiedDxy?: boolean;
}

export interface CrossAssetMatrix {
  baseSymbol: 'XAUUSD';
  relationships: Record<string, CrossAssetRelationship>;
  activePairCount: number;
  summary: string;
  computedAt: number;
}

export function buildCrossAssetMatrix(inputs: CrossAssetUniverseInputs): CrossAssetMatrix {
  const relationships: Record<string, CrossAssetRelationship> = {};
  let activeCount = 0;

  // 1. Gold vs Real Yields (DFII10)
  if (inputs.realYieldSeries && inputs.realYieldSeries.length > 0) {
    const corrRes = calculatePearsonCorrelation(inputs.goldSeries, inputs.realYieldSeries);
    if (corrRes) {
      activeCount++;
      relationships['US_REAL_YIELD'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'DFII10 (10Y Real Yield)',
        relationType: 'NEGATIVE_BETA',
        rollingCorrelation: corrRes.correlation,
        sampleCount: corrRes.sampleCount,
        status: 'VERIFIED',
        notes: 'Negative fundamental relationship: real yield rises increase opportunity cost of gold.',
      };
    } else {
      relationships['US_REAL_YIELD'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'DFII10',
        relationType: 'NEGATIVE_BETA',
        sampleCount: 0,
        status: 'DATA_LIMITED',
        notes: 'Insufficient aligned dates to compute rolling correlation.',
      };
    }
  } else {
    relationships['US_REAL_YIELD'] = {
      baseSymbol: 'XAUUSD',
      targetSymbol: 'DFII10',
      relationType: 'NEGATIVE_BETA',
      sampleCount: 0,
      status: 'UNAVAILABLE',
      notes: 'Real yield time series unavailable.',
    };
  }

  // 2. Gold vs 10Y Nominal Yield (DGS10)
  if (inputs.tenYearYieldSeries && inputs.tenYearYieldSeries.length > 0) {
    const corrRes = calculatePearsonCorrelation(inputs.goldSeries, inputs.tenYearYieldSeries);
    if (corrRes) {
      activeCount++;
      relationships['US_10Y_YIELD'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'DGS10 (10Y Nominal Yield)',
        relationType: 'NEGATIVE_BETA',
        rollingCorrelation: corrRes.correlation,
        sampleCount: corrRes.sampleCount,
        status: 'VERIFIED',
        notes: 'Sovereign benchmark discount rate.',
      };
    } else {
      relationships['US_10Y_YIELD'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'DGS10',
        relationType: 'NEGATIVE_BETA',
        sampleCount: 0,
        status: 'DATA_LIMITED',
        notes: 'Insufficient aligned dates for 10Y Treasury correlation.',
      };
    }
  } else {
    relationships['US_10Y_YIELD'] = {
      baseSymbol: 'XAUUSD',
      targetSymbol: 'DGS10',
      relationType: 'NEGATIVE_BETA',
      sampleCount: 0,
      status: 'UNAVAILABLE',
      notes: 'Nominal 10Y Treasury series unavailable.',
    };
  }

  // 3. Gold vs DXY (US Dollar Index) — Strictly UNAVAILABLE when not verified
  if (!inputs.hasVerifiedDxy) {
    relationships['DXY'] = {
      baseSymbol: 'XAUUSD',
      targetSymbol: 'DXY (US Dollar Index)',
      relationType: 'NEGATIVE_BETA',
      sampleCount: 0,
      status: 'UNAVAILABLE',
      notes: 'DXY provider is not configured. Zero synthetic correlation generated.',
    };
  }

  // 4. Gold vs Equities (US500 / US100)
  if (inputs.equitySeries && inputs.equitySeries.length > 0) {
    const corrRes = calculatePearsonCorrelation(inputs.goldSeries, inputs.equitySeries);
    if (corrRes) {
      activeCount++;
      relationships['US500'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'US500 (Equities Benchmark)',
        relationType: 'NEUTRAL_OR_DYNAMIC',
        rollingCorrelation: corrRes.correlation,
        sampleCount: corrRes.sampleCount,
        status: 'VERIFIED',
        notes: 'Risk appetite proxy; dynamic correlation depending on inflation vs growth shocks.',
      };
    } else {
      relationships['US500'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'US500',
        relationType: 'NEUTRAL_OR_DYNAMIC',
        sampleCount: 0,
        status: 'DATA_LIMITED',
        notes: 'Insufficient samples for US500 correlation.',
      };
    }
  }

  // 5. Gold vs Silver (XAGUSD)
  if (inputs.silverSeries && inputs.silverSeries.length > 0) {
    const corrRes = calculatePearsonCorrelation(inputs.goldSeries, inputs.silverSeries);
    if (corrRes) {
      activeCount++;
      relationships['XAGUSD'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'XAGUSD (Silver)',
        relationType: 'POSITIVE_BETA',
        rollingCorrelation: corrRes.correlation,
        sampleCount: corrRes.sampleCount,
        status: 'VERIFIED',
        notes: 'Precious metals beta benchmark; high historical co-movement.',
      };
    } else {
      relationships['XAGUSD'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'XAGUSD',
        relationType: 'POSITIVE_BETA',
        sampleCount: 0,
        status: 'DATA_LIMITED',
        notes: 'Insufficient samples for XAGUSD correlation.',
      };
    }
  }

  // 6. Gold vs Oil (USOIL)
  if (inputs.oilSeries && inputs.oilSeries.length > 0) {
    const corrRes = calculatePearsonCorrelation(inputs.goldSeries, inputs.oilSeries);
    if (corrRes) {
      activeCount++;
      relationships['USOIL'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'USOIL (WTI Crude)',
        relationType: 'NEUTRAL_OR_DYNAMIC',
        rollingCorrelation: corrRes.correlation,
        sampleCount: corrRes.sampleCount,
        status: 'VERIFIED',
        notes: 'Commodity inflation basket proxy; energy cost passthrough.',
      };
    } else {
      relationships['USOIL'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'USOIL',
        relationType: 'NEUTRAL_OR_DYNAMIC',
        sampleCount: 0,
        status: 'DATA_LIMITED',
        notes: 'Insufficient samples for USOIL correlation.',
      };
    }
  }

  const summary = activeCount > 0
    ? `Cross-asset matrix computed for ${activeCount} active factor(s) with zero fabricated correlations.`
    : 'Cross-asset matrix currently data-limited; awaiting synchronized multi-asset time series.';

  return {
    baseSymbol: 'XAUUSD',
    relationships,
    activePairCount: activeCount,
    summary,
    computedAt: Date.now(),
  };
}

/**
 * Convert price series to return series
 */
export function convertToReturnSeries(series: TimeSeriesPoint[]): TimeSeriesPoint[] {
  if (!Array.isArray(series) || series.length < 2) return [];
  const returns: TimeSeriesPoint[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].value;
    const curr = series[i].value;
    if (prev > 0) {
      returns.push({
        date: series[i].date,
        timestamp: series[i].timestamp,
        value: (curr - prev) / prev,
      });
    }
  }
  return returns;
}

/**
 * Builds verified cross-asset matrix envelope directly from verified candle series
 */
export function buildCrossAssetMatrixFromCandles(
  goldCandles: Array<{ timestamp: number; close: number }>,
  relatedCandles: {
    silverCandles?: Array<{ timestamp: number; close: number }>;
    oilCandles?: Array<{ timestamp: number; close: number }>;
    equityCandles?: Array<{ timestamp: number; close: number }>;
  },
  useReturns: boolean = true
): VerifiedEvidenceEnvelope<CrossAssetMatrix> {
  let silverSeries: TimeSeriesPoint[] | undefined;
  let oilSeries: TimeSeriesPoint[] | undefined;
  let equitySeries: TimeSeriesPoint[] | undefined;
  let goldSeries: TimeSeriesPoint[] = [];

  if (relatedCandles.silverCandles && relatedCandles.silverCandles.length > 0) {
    const aligned = alignCandleSeries(goldCandles, relatedCandles.silverCandles);
    goldSeries = useReturns ? convertToReturnSeries(aligned.seriesA) : aligned.seriesA;
    silverSeries = useReturns ? convertToReturnSeries(aligned.seriesB) : aligned.seriesB;
  }

  if (relatedCandles.oilCandles && relatedCandles.oilCandles.length > 0) {
    const aligned = alignCandleSeries(goldCandles, relatedCandles.oilCandles);
    if (goldSeries.length === 0) {
      goldSeries = useReturns ? convertToReturnSeries(aligned.seriesA) : aligned.seriesA;
    }
    oilSeries = useReturns ? convertToReturnSeries(aligned.seriesB) : aligned.seriesB;
  }

  if (relatedCandles.equityCandles && relatedCandles.equityCandles.length > 0) {
    const aligned = alignCandleSeries(goldCandles, relatedCandles.equityCandles);
    if (goldSeries.length === 0) {
      goldSeries = useReturns ? convertToReturnSeries(aligned.seriesA) : aligned.seriesA;
    }
    equitySeries = useReturns ? convertToReturnSeries(aligned.seriesB) : aligned.seriesB;
  }

  return buildVerifiedCrossAssetMatrixEnvelope({
    goldSeries,
    silverSeries,
    oilSeries,
    equitySeries,
  });
}

/**
 * Aligns two candle series by timestamp within a maximum tolerance window (default 5 minutes).
 * Strict rule: Zero synthetic price backfilling or interpolation.
 */
export function alignCandleSeries(
  candlesA: { timestamp: number; close: number }[],
  candlesB: { timestamp: number; close: number }[],
  maxToleranceMs: number = 300000 // 5 minutes
): { seriesA: TimeSeriesPoint[]; seriesB: TimeSeriesPoint[] } {
  const seriesA: TimeSeriesPoint[] = [];
  const seriesB: TimeSeriesPoint[] = [];

  if (!Array.isArray(candlesA) || !Array.isArray(candlesB)) {
    return { seriesA, seriesB };
  }

  // Sort both series ascending
  const sortedA = [...candlesA].sort((a, b) => a.timestamp - b.timestamp);
  const sortedB = [...candlesB].sort((a, b) => a.timestamp - b.timestamp);

  let bIdx = 0;
  for (const cA of sortedA) {
    if (!cA || !Number.isFinite(cA.close) || cA.close <= 0) continue;

    // Advance B while B is older than A minus tolerance
    while (bIdx < sortedB.length && sortedB[bIdx].timestamp < cA.timestamp - maxToleranceMs) {
      bIdx++;
    }

    if (bIdx < sortedB.length) {
      const cB = sortedB[bIdx];
      const diff = Math.abs(cA.timestamp - cB.timestamp);
      if (diff <= maxToleranceMs && Number.isFinite(cB.close) && cB.close > 0) {
        const dateStr = new Date(cA.timestamp).toISOString();
        seriesA.push({ date: dateStr, timestamp: cA.timestamp, value: cA.close });
        seriesB.push({ date: dateStr, timestamp: cB.timestamp, value: cB.close });
        bIdx++;
      }
    }
  }

  return { seriesA, seriesB };
}

/**
 * Wraps CrossAssetMatrix in a canonical VerifiedEvidenceEnvelope.
 * Requires at least 2 active verified relationships to be considered actionable.
 */
export function buildVerifiedCrossAssetMatrixEnvelope(
  inputs: CrossAssetUniverseInputs
): VerifiedEvidenceEnvelope<CrossAssetMatrix> {
  const matrix = buildCrossAssetMatrix(inputs);

  if (matrix.activePairCount >= 2) {
    return createVerifiedEnvelope<CrossAssetMatrix>({
      provider: 'FEF_CROSS_ASSET_ENGINE',
      sourceType: 'DERIVED_ANALYTICS',
      observedAt: new Date(matrix.computedAt).toISOString(),
      maxStalenessSec: 3600, // 1 hour
      payload: matrix,
    });
  }

  return createFailedClosedEnvelope<CrossAssetMatrix>(
    'FEF_CROSS_ASSET_ENGINE',
    'DERIVED_ANALYTICS',
    'Cross-asset matrix has insufficient active pairs (< 2 verified pairs). Zero synthetic correlation.',
    3600
  );
}

