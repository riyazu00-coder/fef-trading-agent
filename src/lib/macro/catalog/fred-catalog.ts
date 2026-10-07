/**
 * FEF CORTEX — OFFICIAL MACRO SERIES CATALOG
 * Sprint 1B Clean-Room Implementation
 * 
 * High-value U.S. macroeconomic series from official FRED (St. Louis Fed).
 * 
 * Required Series:
 * - DGS2: 2-Year Treasury Constant Maturity Rate
 * - DGS10: 10-Year Treasury Constant Maturity Rate
 * - DFEDTARU: Federal Funds Target Range - Upper Limit
 * - DFEDTARL: Federal Funds Target Range - Lower Limit
 * - DFF: Effective Federal Funds Rate
 * - T10YIE: 10-Year Breakeven Inflation Rate
 * - DFII10: 10-Year Treasury Inflation-Indexed Security (Real Yield)
 * 
 * Verified Optional Series:
 * - T5YIE: 5-Year Breakeven Inflation Rate
 * - DFII5: 5-Year Treasury Inflation-Indexed Security (Real Yield)
 * 
 * Invariants:
 * - DXY is NOT in this catalog (separate future provider concern).
 * - No trade direction or signals are encoded here.
 */

import { MacroSeriesDefinition } from '../types';

export const FRED_SERIES_CATALOG: Record<string, MacroSeriesDefinition> = {
  DGS2: {
    seriesId: 'DGS2',
    name: '2-Year Treasury Constant Maturity Rate',
    category: 'TREASURY_YIELD',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Short-term policy rate expectations and front-end yield benchmark.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 48,  // Business daily (allows normal overnight gap)
    maxAgeHoursAging: 96,    // Allows weekend gap (Friday to Monday)
    description: 'Yield on actively traded U.S. Treasury securities with 2-year maturity, constant maturity nominal.',
  },
  DGS10: {
    seriesId: 'DGS10',
    name: '10-Year Treasury Constant Maturity Rate',
    category: 'TREASURY_YIELD',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Benchmark global risk-free rate, sovereign discount rate, and gold opportunity cost.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US100', 'US500'],
    maxAgeHoursCurrent: 48,
    maxAgeHoursAging: 96,
    description: 'Yield on actively traded U.S. Treasury securities with 10-year maturity, constant maturity nominal.',
  },
  DFEDTARU: {
    seriesId: 'DFEDTARU',
    name: 'Federal Funds Target Range - Upper Limit',
    category: 'POLICY_RATE',
    unit: '%',
    frequency: 'DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Upper boundary of FOMC policy target corridor.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 72,
    maxAgeHoursAging: 168,   // Target ranges rarely change outside FOMC meetings
    description: 'The upper limit of the target range for the federal funds rate established by the FOMC.',
  },
  DFEDTARL: {
    seriesId: 'DFEDTARL',
    name: 'Federal Funds Target Range - Lower Limit',
    category: 'POLICY_RATE',
    unit: '%',
    frequency: 'DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Lower boundary of FOMC policy target corridor.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 72,
    maxAgeHoursAging: 168,
    description: 'The lower limit of the target range for the federal funds rate established by the FOMC.',
  },
  DFF: {
    seriesId: 'DFF',
    name: 'Effective Federal Funds Rate',
    category: 'POLICY_RATE',
    unit: '%',
    frequency: 'DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Volume-weighted median of overnight federal funds transactions.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 72,
    maxAgeHoursAging: 120,
    description: 'The volume-weighted median of overnight interbank lending transactions reported by broker-dealers.',
  },
  T10YIE: {
    seriesId: 'T10YIE',
    name: '10-Year Breakeven Inflation Rate',
    category: 'INFLATION_EXPECTATION',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Market-implied 10-year average inflation expectation (Nominal 10Y minus 10Y TIPS).',
    affectedAssets: ['XAUUSD', 'US500', 'USOIL'],
    maxAgeHoursCurrent: 48,
    maxAgeHoursAging: 96,
    description: 'Measure of expected inflation over 10 years derived from 10-Year Treasury and TIPS constant maturity yields.',
  },
  DFII10: {
    seriesId: 'DFII10',
    name: '10-Year Treasury Inflation-Indexed Security, Constant Maturity',
    category: 'REAL_YIELD',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: '10-Year U.S. Real Yield; primary sovereign opportunity cost driver for gold (XAUUSD).',
    affectedAssets: ['XAUUSD', 'US500'],
    maxAgeHoursCurrent: 48,
    maxAgeHoursAging: 96,
    description: '10-Year real interest rate measured on U.S. Treasury Inflation-Protected Securities (TIPS).',
  },
  T5YIE: {
    seriesId: 'T5YIE',
    name: '5-Year Breakeven Inflation Rate',
    category: 'INFLATION_EXPECTATION',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Market-implied 5-year average inflation expectation.',
    affectedAssets: ['XAUUSD', 'USOIL'],
    maxAgeHoursCurrent: 48,
    maxAgeHoursAging: 96,
    description: 'Measure of expected inflation over 5 years derived from 5-Year Treasury and TIPS constant maturity yields.',
  },
  DFII5: {
    seriesId: 'DFII5',
    name: '5-Year Treasury Inflation-Indexed Security, Constant Maturity',
    category: 'REAL_YIELD',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: '5-Year U.S. Real Yield; medium-term sovereign real rate benchmark.',
    affectedAssets: ['XAUUSD', 'US500'],
    maxAgeHoursCurrent: 48,
    maxAgeHoursAging: 96,
    description: '5-Year real interest rate measured on U.S. Treasury Inflation-Protected Securities (TIPS).',
  },
};

/**
 * Get series definition from catalog
 */
export function getMacroSeriesDefinition(seriesId: string): MacroSeriesDefinition | null {
  const normId = seriesId.trim().toUpperCase();
  return FRED_SERIES_CATALOG[normId] || null;
}

/**
 * Check if a series ID is supported in the official catalog
 */
export function isSupportedMacroSeries(seriesId: string): boolean {
  return getMacroSeriesDefinition(seriesId) !== null;
}

