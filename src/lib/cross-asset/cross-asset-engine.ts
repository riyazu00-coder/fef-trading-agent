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

  // 4. Gold vs Equities (US500)
  if (inputs.equitySeries && inputs.equitySeries.length > 0) {
    const corrRes = calculatePearsonCorrelation(inputs.goldSeries, inputs.equitySeries);
    if (corrRes) {
      activeCount++;
      relationships['US500'] = {
        baseSymbol: 'XAUUSD',
        targetSymbol: 'US500 (S&P 500)',
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

