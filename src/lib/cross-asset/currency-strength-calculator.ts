/**
 * FEF CORTEX — CURRENCY MATRIX REAL-TIME SYNCHRONIZER
 * Sprint 2C Verified Real-Data Intelligence Foundation
 *
 * Computes relative currency strength across the 7 major currencies (USD, EUR, GBP, JPY, AUD, CAD, NZD)
 * from synchronized live forex pair observations.
 *
 * Rules:
 * 1. Requires at least 4 active live forex pairs to produce a valid matrix.
 * 2. Zero synthetic quotes: if fewer than 4 pairs are live, fails closed with isVerified=false.
 * 3. Deterministic mathematical derivation based on pair returns.
 */

import {
  createFailedClosedEnvelope,
  createVerifiedEnvelope,
  VerifiedEvidenceEnvelope,
} from '../providers/canonical-envelope';

export interface ForexPairQuote {
  symbol: string;
  price?: number;
  change24h?: number;
  timestamp?: number | string;
}

export const MAJOR_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD', 'CHF'] as const;
export type MajorCurrency = (typeof MAJOR_CURRENCIES)[number];

const MAX_CURRENCY_MATRIX_STALENESS_SEC = 300; // 5 minutes

/**
 * Computes relative strength scores for major currencies from synchronized live forex pair quotes.
 */
export function calculateCurrencyStrengthMatrix(
  quotes: Record<string, ForexPairQuote>
): VerifiedEvidenceEnvelope<Record<string, number>> {
  if (!quotes || typeof quotes !== 'object') {
    return createFailedClosedEnvelope<Record<string, number>>(
      'FEF_CURRENCY_MATRIX',
      'DERIVED_ANALYTICS',
      'Forex quotes object is missing or null.',
      MAX_CURRENCY_MATRIX_STALENESS_SEC
    );
  }

  // Extract change24h for standard USD crosses
  const pairChanges: Record<string, number> = {};
  for (const [sym, q] of Object.entries(quotes)) {
    const cleanSym = sym.trim().toUpperCase();
    if (q && typeof q.change24h === 'number' && Number.isFinite(q.change24h)) {
      pairChanges[cleanSym] = q.change24h;
    }
  }

  const validPairCount = Object.keys(pairChanges).length;
  if (validPairCount < 4) {
    return createFailedClosedEnvelope<Record<string, number>>(
      'FEF_CURRENCY_MATRIX',
      'DERIVED_ANALYTICS',
      `Insufficient live forex pairs (${validPairCount} available, minimum 4 required). Zero synthetic quotes.`,
      MAX_CURRENCY_MATRIX_STALENESS_SEC
    );
  }

  // Calculate currency performance relative to USD
  // For EURUSD, GBPUSD, AUDUSD, NZDUSD: base currency change vs USD is +change24h
  // For USDJPY, USDCAD, USDCHF: quote currency change vs USD is -change24h
  const vsUsd: Partial<Record<MajorCurrency, number>> = {};
  vsUsd['USD'] = 0;

  if (pairChanges['EURUSD'] !== undefined) vsUsd['EUR'] = pairChanges['EURUSD'];
  if (pairChanges['GBPUSD'] !== undefined) vsUsd['GBP'] = pairChanges['GBPUSD'];
  if (pairChanges['AUDUSD'] !== undefined) vsUsd['AUD'] = pairChanges['AUDUSD'];
  if (pairChanges['NZDUSD'] !== undefined) vsUsd['NZD'] = pairChanges['NZDUSD'];
  if (pairChanges['USDJPY'] !== undefined) vsUsd['JPY'] = -pairChanges['USDJPY'];
  if (pairChanges['USDCAD'] !== undefined) vsUsd['CAD'] = -pairChanges['USDCAD'];
  if (pairChanges['USDCHF'] !== undefined) vsUsd['CHF'] = -pairChanges['USDCHF'];

  // Calculate basket mean return vs USD
  const nonUsdValues = Object.entries(vsUsd)
    .filter(([curr]) => curr !== 'USD')
    .map(([, val]) => val!);

  if (nonUsdValues.length < 3) {
    return createFailedClosedEnvelope<Record<string, number>>(
      'FEF_CURRENCY_MATRIX',
      'DERIVED_ANALYTICS',
      `Fewer than 3 non-USD majors active. Cannot construct balanced currency basket.`,
      MAX_CURRENCY_MATRIX_STALENESS_SEC
    );
  }

  const basketMeanVsUsd = nonUsdValues.reduce((a, b) => a + b, 0) / nonUsdValues.length;

  // Center all currencies against the basket mean:
  // Basket mean is 0. USD relative to basket is -basketMeanVsUsd.
  const matrix: Record<string, number> = {};
  matrix['USD'] = Math.round(-basketMeanVsUsd * 100) / 100;

  for (const [curr, val] of Object.entries(vsUsd)) {
    if (curr !== 'USD' && val !== undefined) {
      matrix[curr] = Math.round((val - basketMeanVsUsd) * 100) / 100;
    }
  }

  return createVerifiedEnvelope<Record<string, number>>({
    provider: 'FEF_CURRENCY_MATRIX',
    sourceType: 'DERIVED_ANALYTICS',
    observedAt: new Date().toISOString(),
    maxStalenessSec: MAX_CURRENCY_MATRIX_STALENESS_SEC,
    payload: matrix,
  });
}

export interface CurrencyStrengthDetail {
  matrix: Record<string, number>;
  contributingPairs: string[];
  coverageRatio: number;
  observationWindow: string;
  observationCount: number;
}

/**
 * Computes currency strength matrix from verified closed FX candles across major pairs
 */
export function calculateCurrencyStrengthFromCandles(
  candlesByPair: Record<string, Array<{ open: number; close: number; timestamp: number }>>,
  timeframe: string = 'H1'
): VerifiedEvidenceEnvelope<CurrencyStrengthDetail> {
  if (!candlesByPair || typeof candlesByPair !== 'object') {
    return createFailedClosedEnvelope<CurrencyStrengthDetail>(
      'FEF_CURRENCY_MATRIX',
      'DERIVED_ANALYTICS',
      'Forex candle data is missing or null.',
      MAX_CURRENCY_MATRIX_STALENESS_SEC
    );
  }

  const quotesFromCandles: Record<string, ForexPairQuote> = {};
  const contributingPairs: string[] = [];
  let minBars = Number.MAX_SAFE_INTEGER;

  for (const [pair, candles] of Object.entries(candlesByPair)) {
    if (Array.isArray(candles) && candles.length >= 2) {
      const oldest = candles[0].close;
      const newest = candles[candles.length - 1].close;
      if (oldest > 0 && newest > 0) {
        const retPct = ((newest - oldest) / oldest) * 100;
        quotesFromCandles[pair] = {
          symbol: pair,
          price: newest,
          change24h: retPct,
          timestamp: candles[candles.length - 1].timestamp,
        };
        contributingPairs.push(pair);
        if (candles.length < minBars) minBars = candles.length;
      }
    }
  }

  const matrixEnv = calculateCurrencyStrengthMatrix(quotesFromCandles);
  if (!matrixEnv.isVerified || !matrixEnv.payload) {
    return createFailedClosedEnvelope<CurrencyStrengthDetail>(
      'FEF_CURRENCY_MATRIX',
      'DERIVED_ANALYTICS',
      matrixEnv.error || 'Insufficient valid forex pairs from candles (< 4 pairs).',
      MAX_CURRENCY_MATRIX_STALENESS_SEC
    );
  }

  const detail: CurrencyStrengthDetail = {
    matrix: matrixEnv.payload,
    contributingPairs,
    coverageRatio: Math.round((contributingPairs.length / 7) * 100) / 100,
    observationWindow: `${minBars} closed ${timeframe} bars`,
    observationCount: minBars,
  };

  return createVerifiedEnvelope<CurrencyStrengthDetail>({
    provider: 'FEF_CURRENCY_MATRIX',
    sourceType: 'DERIVED_ANALYTICS',
    observedAt: new Date().toISOString(),
    maxStalenessSec: MAX_CURRENCY_MATRIX_STALENESS_SEC,
    payload: detail,
  });
}
