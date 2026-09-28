/**
 * FEF CORTEX — VOLUME PROFILE ENGINE
 * 
 * Computes deterministic volume profiles across M15/M30/H1/H4 timeframes:
 * - Point of Control (POC)
 * - Value Area High (VAH, 70% volume envelope)
 * - Value Area Low (VAL)
 * - High Volume Nodes (HVN) & Low Volume Nodes (LVN)
 * - Explicit distinction between TICK volume (broker proxy) vs REAL exchange volume
 */

import { OHLCCandle } from './canonical-market-snapshot';

export interface VolumeProfileBucket {
  priceLevel: number;
  volume: number;
  percentOfTotal: number;
  isPOC: boolean;
  isValueArea: boolean;
  isHVN: boolean;
  isLVN: boolean;
}

export interface VolumeProfileResult {
  symbol: string;
  timeframe: string;
  poc: number;
  vah: number;
  val: number;
  totalVolume: number;
  isExchangeVolume: boolean;
  buckets: VolumeProfileBucket[];
  hvnLevels: number[];
  lvnLevels: number[];
  calculatedAt: string;
}

export function calculateVolumeProfile(
  candles: OHLCCandle[],
  symbol: string,
  timeframe: string,
  numBuckets: number = 24,
  isExchangeVolume: boolean = false
): VolumeProfileResult | null {
  if (!candles || candles.length < 5) return null;

  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let totalVol = 0;

  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    const vol = (isExchangeVolume && c.realVolume && c.realVolume > 0)
      ? c.realVolume
      : (c.tickVolume || 1);
    totalVol += vol;
  }

  if (minPrice >= maxPrice || totalVol <= 0) return null;

  const bucketHeight = (maxPrice - minPrice) / numBuckets;
  const rawBuckets = new Array(numBuckets).fill(0);

  // Distribute candle volume uniformly across candle range
  for (const c of candles) {
    const vol = (isExchangeVolume && c.realVolume && c.realVolume > 0)
      ? c.realVolume
      : (c.tickVolume || 1);
    const cLow = Math.max(c.low, minPrice);
    const cHigh = Math.min(c.high, maxPrice);
    const candleSpan = Math.max(0.00001, cHigh - cLow);

    for (let b = 0; b < numBuckets; b++) {
      const bLow = minPrice + b * bucketHeight;
      const bHigh = bLow + bucketHeight;

      // Overlap between candle and bucket
      const overlapLow = Math.max(cLow, bLow);
      const overlapHigh = Math.min(cHigh, bHigh);
      if (overlapHigh > overlapLow) {
        const fraction = (overlapHigh - overlapLow) / candleSpan;
        rawBuckets[b] += vol * fraction;
      }
    }
  }

  // Find POC
  let maxVol = 0;
  let pocIdx = 0;
  for (let i = 0; i < numBuckets; i++) {
    if (rawBuckets[i] > maxVol) {
      maxVol = rawBuckets[i];
      pocIdx = i;
    }
  }

  const pocPrice = Number((minPrice + (pocIdx + 0.5) * bucketHeight).toFixed(5));

  // Determine Value Area (70% total volume centered around POC)
  const targetAreaVol = totalVol * 0.70;
  let accumulatedVol = rawBuckets[pocIdx];
  const valueAreaIndices = new Set<number>([pocIdx]);
  let upper = pocIdx + 1;
  let lower = pocIdx - 1;

  while (accumulatedVol < targetAreaVol && (upper < numBuckets || lower >= 0)) {
    const upperVol = upper < numBuckets ? rawBuckets[upper] : -1;
    const lowerVol = lower >= 0 ? rawBuckets[lower] : -1;

    if (upperVol >= lowerVol && upperVol > 0) {
      accumulatedVol += upperVol;
      valueAreaIndices.add(upper);
      upper++;
    } else if (lowerVol > 0) {
      accumulatedVol += lowerVol;
      valueAreaIndices.add(lower);
      lower--;
    } else {
      break;
    }
  }

  const sortedVa = Array.from(valueAreaIndices).sort((a, b) => a - b);
  const minVaIdx = sortedVa[0];
  const maxVaIdx = sortedVa[sortedVa.length - 1];

  const valPrice = Number((minPrice + minVaIdx * bucketHeight).toFixed(5));
  const vahPrice = Number((minPrice + (maxVaIdx + 1) * bucketHeight).toFixed(5));

  // Detect HVNs and LVNs based on standard deviation of volume distribution
  const avgVol = totalVol / numBuckets;
  const hvnCutoff = avgVol * 1.35;
  const lvnCutoff = avgVol * 0.45;

  const hvnLevels: number[] = [];
  const lvnLevels: number[] = [];

  const profileBuckets: VolumeProfileBucket[] = rawBuckets.map((v, idx) => {
    const center = Number((minPrice + (idx + 0.5) * bucketHeight).toFixed(5));
    const isPOC = idx === pocIdx;
    const isValueArea = valueAreaIndices.has(idx);
    const isHVN = v >= hvnCutoff;
    const isLVN = v <= lvnCutoff && v > 0;

    if (isHVN) hvnLevels.push(center);
    if (isLVN) lvnLevels.push(center);

    return {
      priceLevel: center,
      volume: Number(v.toFixed(1)),
      percentOfTotal: Number(((v / totalVol) * 100).toFixed(2)),
      isPOC,
      isValueArea,
      isHVN,
      isLVN,
    };
  });

  return {
    symbol,
    timeframe,
    poc: pocPrice,
    vah: vahPrice,
    val: valPrice,
    totalVolume: Math.round(totalVol),
    isExchangeVolume,
    buckets: profileBuckets,
    hvnLevels,
    lvnLevels,
    calculatedAt: new Date().toISOString(),
  };
}
