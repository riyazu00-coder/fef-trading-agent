/**
 * FEF CORTEX — INTERMARKET LEAD/LAG ANALYTICS ENGINE
 * Sprint 2C.1 Real Provider Activation + Broker Market Data Wiring
 *
 * Rules:
 * 1. Zero synthetic correlations: ordinary same-time correlation is NOT lead/lag.
 * 2. Tests lagged returns over bounded windows (lag k in [1, 2, 3] bars).
 * 3. Requires at least 20 aligned closed-candle return observations.
 * 4. Requires relationship significance threshold (|r| >= 0.30).
 * 5. Fails closed with DATA_LIMITED when requirements are not met.
 */

import {
  createFailedClosedEnvelope,
  createVerifiedEnvelope,
  VerifiedEvidenceEnvelope,
} from '../providers/canonical-envelope';
import { NormalizedClosedCandle } from '../candles/broker-candle-service';

export interface LeadLagObservation {
  leader: string;
  follower: string;
  lagBars: number;
  sampleSize: number;
  relationshipStrength: number;
  correlation: number;
  timeframe: string;
  freshness: string;
  isVerified: boolean;
  status: 'VERIFIED' | 'DATA_LIMITED' | 'UNAVAILABLE';
  notes: string;
}

export const CANONICAL_LEAD_LAG_PAIRS: Record<string, { leader: string; follower: string }> = {
  XAUUSD: { leader: 'XAUUSD', follower: 'XAGUSD' },
  XAGUSD: { leader: 'XAUUSD', follower: 'XAGUSD' },
  BTCUSD: { leader: 'BTCUSD', follower: 'ETHUSD' },
  ETHUSD: { leader: 'BTCUSD', follower: 'ETHUSD' },
  SOLUSD: { leader: 'BTCUSD', follower: 'SOLUSD' },
  US100:  { leader: 'US500', follower: 'US100' },
  US30:   { leader: 'US500', follower: 'US30' },
  US500:  { leader: 'US500', follower: 'US100' },
  USOIL:  { leader: 'USOIL', follower: 'UKOIL' },
  UKOIL:  { leader: 'USOIL', follower: 'UKOIL' },
  NATGAS: { leader: 'USOIL', follower: 'NATGAS' },
  EURUSD: { leader: 'EURUSD', follower: 'GBPUSD' },
  GBPUSD: { leader: 'EURUSD', follower: 'GBPUSD' },
  AUDUSD: { leader: 'EURUSD', follower: 'AUDUSD' },
};

/**
 * Align two candle series and extract aligned return series
 */
export function alignAndComputeReturns(
  candlesA: NormalizedClosedCandle[],
  candlesB: NormalizedClosedCandle[],
  maxToleranceMs: number = 300000 // 5m
): { returnsA: number[]; returnsB: number[]; alignedCount: number } {
  if (!Array.isArray(candlesA) || !Array.isArray(candlesB) || candlesA.length < 2 || candlesB.length < 2) {
    return { returnsA: [], returnsB: [], alignedCount: 0 };
  }

  const sortedA = [...candlesA].sort((a, b) => a.timestamp - b.timestamp);
  const sortedB = [...candlesB].sort((a, b) => a.timestamp - b.timestamp);

  const matchedPricesA: number[] = [];
  const matchedPricesB: number[] = [];

  let bIdx = 0;
  for (const cA of sortedA) {
    while (bIdx < sortedB.length && sortedB[bIdx].timestamp < cA.timestamp - maxToleranceMs) {
      bIdx++;
    }
    if (bIdx < sortedB.length) {
      const cB = sortedB[bIdx];
      if (Math.abs(cA.timestamp - cB.timestamp) <= maxToleranceMs) {
        matchedPricesA.push(cA.close);
        matchedPricesB.push(cB.close);
        bIdx++;
      }
    }
  }

  if (matchedPricesA.length < 2) {
    return { returnsA: [], returnsB: [], alignedCount: 0 };
  }

  const returnsA: number[] = [];
  const returnsB: number[] = [];

  for (let i = 1; i < matchedPricesA.length; i++) {
    const prevA = matchedPricesA[i - 1];
    const prevB = matchedPricesB[i - 1];
    if (prevA > 0 && prevB > 0) {
      returnsA.push((matchedPricesA[i] - prevA) / prevA);
      returnsB.push((matchedPricesB[i] - prevB) / prevB);
    }
  }

  return { returnsA, returnsB, alignedCount: returnsA.length };
}

/**
 * Compute Pearson correlation between two number arrays
 */
function pearsonCorr(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 5 || n !== y.length) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let cov = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  if (varX <= 0 || varY <= 0) return null;
  return cov / Math.sqrt(varX * varY);
}

/**
 * Calculate lagged cross-correlation where leader return leads follower return by k bars.
 * Tests lags k in [1, 2, 3].
 */
export function calculateLeadLagMetrics(
  leaderReturns: number[],
  followerReturns: number[],
  leaderSymbol: string,
  followerSymbol: string,
  timeframe: string = 'H1'
): LeadLagObservation {
  const n = leaderReturns.length;
  const MIN_REQUIRED_SAMPLES = 20;
  const MIN_CORRELATION_THRESHOLD = 0.30;

  if (n < MIN_REQUIRED_SAMPLES || followerReturns.length !== n) {
    return {
      leader: leaderSymbol,
      follower: followerSymbol,
      lagBars: 0,
      sampleSize: n,
      relationshipStrength: 0,
      correlation: 0,
      timeframe,
      freshness: 'UNAVAILABLE',
      isVerified: false,
      status: 'DATA_LIMITED',
      notes: `Insufficient aligned samples (${n} returns, minimum ${MIN_REQUIRED_SAMPLES} required).`,
    };
  }

  let bestLag = 1;
  let maxAbsCorr = 0;
  let bestCorr = 0;

  // Test lags 1, 2, 3 bars
  for (let lag = 1; lag <= 3; lag++) {
    const xLagged: number[] = [];
    const yCurrent: number[] = [];

    for (let t = lag; t < n; t++) {
      xLagged.push(leaderReturns[t - lag]);
      yCurrent.push(followerReturns[t]);
    }

    const r = pearsonCorr(xLagged, yCurrent);
    if (r !== null && Math.abs(r) > maxAbsCorr) {
      maxAbsCorr = Math.abs(r);
      bestLag = lag;
      bestCorr = r;
    }
  }

  const roundedCorr = Math.round(bestCorr * 1000) / 1000;
  const roundedStrength = Math.round(maxAbsCorr * 1000) / 1000;

  if (maxAbsCorr >= MIN_CORRELATION_THRESHOLD) {
    return {
      leader: leaderSymbol,
      follower: followerSymbol,
      lagBars: bestLag,
      sampleSize: n,
      relationshipStrength: roundedStrength,
      correlation: roundedCorr,
      timeframe,
      freshness: 'FRESH',
      isVerified: true,
      status: 'VERIFIED',
      notes: `Statistically significant lead identified: ${leaderSymbol} leads ${followerSymbol} by ${bestLag} bar(s) with correlation ${roundedCorr} over ${n} observations.`,
    };
  }

  return {
    leader: leaderSymbol,
    follower: followerSymbol,
    lagBars: bestLag,
    sampleSize: n,
    relationshipStrength: roundedStrength,
    correlation: roundedCorr,
    timeframe,
    freshness: 'FRESH',
    isVerified: false,
    status: 'DATA_LIMITED',
    notes: `Lead-lag relationship below significance threshold (|r|=${roundedStrength} < ${MIN_CORRELATION_THRESHOLD}). Zero synthetic assumption.`,
  };
}

/**
 * Wraps LeadLagObservation in a canonical VerifiedEvidenceEnvelope
 */
export function buildVerifiedLeadLagEnvelope(
  leaderCandles: NormalizedClosedCandle[],
  followerCandles: NormalizedClosedCandle[],
  leaderSymbol: string,
  followerSymbol: string,
  timeframe: string = 'H1'
): VerifiedEvidenceEnvelope<LeadLagObservation> {
  const { returnsA, returnsB, alignedCount } = alignAndComputeReturns(leaderCandles, followerCandles);

  const metrics = calculateLeadLagMetrics(returnsA, returnsB, leaderSymbol, followerSymbol, timeframe);

  if (metrics.isVerified) {
    return createVerifiedEnvelope<LeadLagObservation>({
      provider: 'FEF_LEAD_LAG_ENGINE',
      sourceType: 'DERIVED_ANALYTICS',
      observedAt: new Date().toISOString(),
      maxStalenessSec: 14400, // 4 hours
      payload: metrics,
    });
  }

  return createFailedClosedEnvelope<LeadLagObservation>(
    'FEF_LEAD_LAG_ENGINE',
    'DERIVED_ANALYTICS',
    metrics.notes,
    14400
  );
}
