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
    expectedReleaseCadence: 'Business Daily (Next Business Day 16:15 ET)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Short-term policy rate expectations and front-end yield benchmark.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 120, // Allows normal overnight gap plus 3-day weekend (72h weekdays, 120h weekend)
    maxAgeHoursAging: 144,   // Allows extended holiday weekends (up to 6 days)
    description: 'Yield on actively traded U.S. Treasury securities with 2-year maturity, constant maturity nominal.',
  },
  DGS10: {
    seriesId: 'DGS10',
    name: '10-Year Treasury Constant Maturity Rate',
    category: 'TREASURY_YIELD',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    expectedReleaseCadence: 'Business Daily (Next Business Day 16:15 ET)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Benchmark global risk-free rate, sovereign discount rate, and gold opportunity cost.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US100', 'US500'],
    maxAgeHoursCurrent: 120,
    maxAgeHoursAging: 144,
    description: 'Yield on actively traded U.S. Treasury securities with 10-year maturity, constant maturity nominal.',
  },
  DFEDTARU: {
    seriesId: 'DFEDTARU',
    name: 'Federal Funds Target Range - Upper Limit',
    category: 'POLICY_RATE',
    unit: '%',
    frequency: 'DAILY',
    expectedReleaseCadence: 'Daily (Following Morning)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Upper boundary of FOMC policy target corridor.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 120,
    maxAgeHoursAging: 144,
    description: 'The upper limit of the target range for the federal funds rate established by the FOMC.',
  },
  DFEDTARL: {
    seriesId: 'DFEDTARL',
    name: 'Federal Funds Target Range - Lower Limit',
    category: 'POLICY_RATE',
    unit: '%',
    frequency: 'DAILY',
    expectedReleaseCadence: 'Daily (Following Morning)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Lower boundary of FOMC policy target corridor.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 120,
    maxAgeHoursAging: 144,
    description: 'The lower limit of the target range for the federal funds rate established by the FOMC.',
  },
  DFF: {
    seriesId: 'DFF',
    name: 'Effective Federal Funds Rate',
    category: 'POLICY_RATE',
    unit: '%',
    frequency: 'DAILY',
    expectedReleaseCadence: 'Daily (Following Morning)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Volume-weighted median of overnight federal funds transactions.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 120,
    maxAgeHoursAging: 144,
    description: 'The volume-weighted median of overnight interbank lending transactions reported by broker-dealers.',
  },
  T10YIE: {
    seriesId: 'T10YIE',
    name: '10-Year Breakeven Inflation Rate',
    category: 'INFLATION_EXPECTATION',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    expectedReleaseCadence: 'Business Daily (Next Business Day 16:15 ET)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Market-implied 10-year average inflation expectation (Nominal 10Y minus 10Y TIPS).',
    affectedAssets: ['XAUUSD', 'US500', 'USOIL'],
    maxAgeHoursCurrent: 120,
    maxAgeHoursAging: 144,
    description: 'Measure of expected inflation over 10 years derived from 10-Year Treasury and TIPS constant maturity yields.',
  },
  DFII10: {
    seriesId: 'DFII10',
    name: '10-Year Treasury Inflation-Indexed Security, Constant Maturity',
    category: 'REAL_YIELD',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    expectedReleaseCadence: 'Business Daily (Next Business Day 16:15 ET)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: '10-Year U.S. Real Yield; primary sovereign opportunity cost driver for gold (XAUUSD).',
    affectedAssets: ['XAUUSD', 'US500'],
    maxAgeHoursCurrent: 120,
    maxAgeHoursAging: 144,
    description: '10-Year real interest rate measured on U.S. Treasury Inflation-Protected Securities (TIPS).',
  },
  T5YIE: {
    seriesId: 'T5YIE',
    name: '5-Year Breakeven Inflation Rate',
    category: 'INFLATION_EXPECTATION',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    expectedReleaseCadence: 'Business Daily (Next Business Day 16:15 ET)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Market-implied 5-year average inflation expectation.',
    affectedAssets: ['XAUUSD', 'USOIL'],
    maxAgeHoursCurrent: 120,
    maxAgeHoursAging: 144,
    description: 'Measure of expected inflation over 5 years derived from 5-Year Treasury and TIPS constant maturity yields.',
  },
  DFII5: {
    seriesId: 'DFII5',
    name: '5-Year Treasury Inflation-Indexed Security, Constant Maturity',
    category: 'REAL_YIELD',
    unit: '%',
    frequency: 'BUSINESS_DAILY',
    expectedReleaseCadence: 'Business Daily (Next Business Day 16:15 ET)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: '5-Year U.S. Real Yield; medium-term sovereign real rate benchmark.',
    affectedAssets: ['XAUUSD', 'US500'],
    maxAgeHoursCurrent: 120,
    maxAgeHoursAging: 144,
    description: '5-Year real interest rate measured on U.S. Treasury Inflation-Protected Securities (TIPS).',
  },
  CPIAUCSL: {
    seriesId: 'CPIAUCSL',
    name: 'Consumer Price Index for All Urban Consumers: All Items',
    category: 'INFLATION',
    unit: 'Index 1982-1984=100',
    frequency: 'MONTHLY',
    expectedReleaseCadence: 'Monthly (~8:30 ET mid-month for prior month)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Headline U.S. consumer price index, primary benchmark for consumer inflation expectations and Fed policy.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 1560, // ~65 days (accommodates prior reference month plus release lag)
    maxAgeHoursAging: 2160,   // ~90 days (up to 3 months)
    description: 'Consumer Price Index for All Urban Consumers: All Items in U.S. City Average, monthly seasonally adjusted.',
  },
  CPILFESL: {
    seriesId: 'CPILFESL',
    name: 'Consumer Price Index for All Urban Consumers: All Items Less Food and Energy',
    category: 'INFLATION',
    unit: 'Index 1982-1984=100',
    frequency: 'MONTHLY',
    expectedReleaseCadence: 'Monthly (~8:30 ET mid-month for prior month)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Core U.S. CPI excluding volatile food and energy components, measures sticky underlying price trends.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 1560,
    maxAgeHoursAging: 2160,
    description: 'Core CPI excluding food and energy, monthly seasonally adjusted.',
  },
  PCEPI: {
    seriesId: 'PCEPI',
    name: 'Personal Consumption Expenditures Price Index',
    category: 'INFLATION',
    unit: 'Index 2017=100',
    frequency: 'MONTHLY',
    expectedReleaseCadence: 'Monthly (End of month for prior month)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Headline PCE Price Index, the Federal Reserve formal headline inflation mandate target.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 1800, // ~75 days (PCE reports ~4-5 weeks after reference month end)
    maxAgeHoursAging: 2160,   // ~90 days
    description: 'Personal Consumption Expenditures Price Index measuring prices paid by domestic consumers.',
  },
  PCEPILFE: {
    seriesId: 'PCEPILFE',
    name: 'Personal Consumption Expenditures Excluding Food and Energy',
    category: 'INFLATION',
    unit: 'Index 2017=100',
    frequency: 'MONTHLY',
    expectedReleaseCadence: 'Monthly (End of month for prior month)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Core PCE Price Index, the Federal Reserve preferred core inflation measure.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 1800,
    maxAgeHoursAging: 2160,
    description: 'Core Personal Consumption Expenditures Price Index excluding food and energy.',
  },
  UNRATE: {
    seriesId: 'UNRATE',
    name: 'Civilian Unemployment Rate',
    category: 'LABOR_MARKET',
    unit: '%',
    frequency: 'MONTHLY',
    expectedReleaseCadence: 'Monthly (First Friday of following month)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Headline U.S. unemployment rate, key metric for the Fed maximum employment mandate.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 1560, // ~65 days
    maxAgeHoursAging: 2160,   // ~90 days
    description: 'The civilian unemployment rate represents the number of unemployed as a percentage of the labor force.',
  },
  PAYEMS: {
    seriesId: 'PAYEMS',
    name: 'Total Nonfarm Payrolls',
    category: 'LABOR_MARKET',
    unit: 'Thousands of Persons',
    frequency: 'MONTHLY',
    expectedReleaseCadence: 'Monthly (First Friday of following month)',
    source: 'Federal Reserve Bank of St. Louis (FRED)',
    marketRelevance: 'Total Nonfarm Payroll employment count, primary monthly macroeconomic gauge of labor market momentum.',
    affectedAssets: ['XAUUSD', 'EURUSD', 'USDJPY', 'US500'],
    maxAgeHoursCurrent: 1560,
    maxAgeHoursAging: 2160,
    description: 'Total nonfarm payroll employment measure of goods, construction, and manufacturing companies in the US.',
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

