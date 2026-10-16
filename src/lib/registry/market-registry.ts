/**
 * Central Canonical Market Registry
 * 
 * Single source of truth for all 26 tradable assets across:
 * - METALS: XAUUSD, XAGUSD
 * - FOREX: EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF, GBPJPY, EURJPY, EURGBP
 * - INDICES: US30, US100, US500, GER40, UK100, JP225
 * - COMMODITIES: USOIL, UKOIL, NATGAS
 * - CRYPTO: BTCUSD, ETHUSD, SOLUSD, XRPUSD, BNBUSD
 */

export type MarketCategory = 'METALS' | 'FOREX' | 'INDICES' | 'COMMODITIES' | 'CRYPTO';

export type MarketFeedStatus = 'LIVE' | 'DEMO' | 'DELAYED' | 'DATA LIMITED' | 'OFFLINE' | 'STALE' | 'FALLBACK';

export type SessionModel =
  | 'METALS_24_5'
  | 'FOREX_24_5'
  | 'CME_EQUITY_INDEX'
  | 'EUREX_INDEX'
  | 'LSE_INDEX'
  | 'TSE_INDEX'
  | 'NYMEX_ENERGY'
  | 'ICE_BRENT'
  | 'CRYPTO_24_7';

export interface MacroSensitivityProfile {
  interestRates: 'INVERSE' | 'DIRECT' | 'NEUTRAL';
  inflation: 'DIRECT' | 'INVERSE' | 'NEUTRAL';
  dollarSensitivity: 'STRONG_INVERSE' | 'INVERSE' | 'DIRECT' | 'NEUTRAL';
  energyPrice: 'DIRECT' | 'INVERSE' | 'NEUTRAL';
  riskAppetite: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
}

export interface MarketDefinition {
  symbol: string;
  displayName: string;
  shortName: string;
  category: MarketCategory;
  providerSymbol: string;
  decimalPrecision: number;
  pipSize: number;
  tickSize: number;
  currency: string;
  enabled: boolean;
  feedStatus: MarketFeedStatus;
  feedProvider: string;
  aliases: string[];
  description: string;
  isPriority: boolean;
  basePrice: number;
  typicalSpread: number;
  typicalDailyChangePct: number;
  sparklineBaseline: number[];
  sessionModel: SessionModel;
  is24x7: boolean;
  baseAsset: string;
  quoteAsset: string;
  brokerAliases: string[];
  macroSensitivity: MacroSensitivityProfile;
  crossAssetBenchmark: string;
  expectedBenchmarkCorrelation: number;
}

export const MARKET_REGISTRY: Record<string, MarketDefinition> = {
  // -------------------------------------------------------------------------
  // METALS
  // -------------------------------------------------------------------------
  XAUUSD: {
    symbol: 'XAUUSD',
    displayName: 'Gold Spot / US Dollar',
    shortName: 'Gold',
    category: 'METALS',
    providerSymbol: 'XAUUSD',
    decimalPrecision: 2,
    pipSize: 0.1,
    tickSize: 0.01,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'MT5 / Gold-API Live',
    aliases: ['GOLD', 'XAU', 'GOLDUSD', 'SPOTGOLD'],
    description: 'Gold Spot price vs US Dollar (LBMA benchmark)',
    isPriority: true,
    basePrice: 4160.00,
    typicalSpread: 0.16,
    typicalDailyChangePct: -0.85,
    sparklineBaseline: [4175, 4168, 4162, 4150, 4154, 4158, 4160.0],
    sessionModel: 'METALS_24_5',
    is24x7: false,
    baseAsset: 'XAU',
    quoteAsset: 'USD',
    brokerAliases: ['GOLD', 'XAU', 'GOLDUSD', 'SPOTGOLD', 'XAUUSDm', 'XAUUSD.cash'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'STRONG_INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_OFF'
    },
    crossAssetBenchmark: 'DXY',
    expectedBenchmarkCorrelation: -0.72
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    displayName: 'Silver Spot / US Dollar',
    shortName: 'Silver',
    category: 'METALS',
    providerSymbol: 'XAGUSD',
    decimalPrecision: 2,
    pipSize: 0.01,
    tickSize: 0.005,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'MT5 / Gold-API Live',
    aliases: ['SILVER', 'XAG', 'SILVERUSD'],
    description: 'Silver Spot price vs US Dollar (LBMA benchmark)',
    isPriority: true,
    basePrice: 64.62,
    typicalSpread: 0.02,
    typicalDailyChangePct: +1.28,
    sparklineBaseline: [63.2, 63.6, 63.8, 64.1, 64.0, 64.4, 64.62],
    sessionModel: 'METALS_24_5',
    is24x7: false,
    baseAsset: 'XAG',
    quoteAsset: 'USD',
    brokerAliases: ['SILVER', 'XAG', 'SILVERUSD', 'XAGUSDm', 'XAGUSD.cash'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'STRONG_INVERSE',
      energyPrice: 'DIRECT',
      riskAppetite: 'NEUTRAL'
    },
    crossAssetBenchmark: 'XAUUSD',
    expectedBenchmarkCorrelation: +0.82
  },

  // -------------------------------------------------------------------------
  // INDICES (US & Global Equity Benchmarks)
  // -------------------------------------------------------------------------
  US100: {
    symbol: 'US100',
    displayName: 'Nasdaq 100 Index Cash',
    shortName: 'Nasdaq 100',
    category: 'INDICES',
    providerSymbol: 'USTEC',
    decimalPrecision: 2,
    pipSize: 1.0,
    tickSize: 0.25,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Broker Index Feed (MT5 / CME Proxy)',
    aliases: ['NAS100', 'USTEC', 'NASDAQ', 'NASDAQ100', 'NDX', 'NQ'],
    description: 'Top 100 non-financial tech mega-cap companies listed on Nasdaq',
    isPriority: true,
    basePrice: 20412.00,
    typicalSpread: 1.10,
    typicalDailyChangePct: +0.72,
    sparklineBaseline: [20280, 20310, 20350, 20390, 20370, 20440, 20412],
    sessionModel: 'CME_EQUITY_INDEX',
    is24x7: false,
    baseAsset: 'NDX',
    quoteAsset: 'USD',
    brokerAliases: ['NAS100', 'USTEC', 'NASDAQ', 'NASDAQ100', 'NDX', 'NQ', 'US100m', 'USTECm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'INVERSE',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'INVERSE',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'US500',
    expectedBenchmarkCorrelation: +0.92
  },
  US30: {
    symbol: 'US30',
    displayName: 'Dow Jones Industrial Average 30',
    shortName: 'Wall Street 30',
    category: 'INDICES',
    providerSymbol: 'US30',
    decimalPrecision: 2,
    pipSize: 1.0,
    tickSize: 1.0,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Broker Index Feed (MT5 / CBOT Proxy)',
    aliases: ['DOW', 'DOWJONES', 'DJI', 'DJ30', 'WALLSTREET30', 'YM'],
    description: '30 prominent blue-chip companies traded in the United States',
    isPriority: true,
    basePrice: 42890.00,
    typicalSpread: 2.20,
    typicalDailyChangePct: +0.38,
    sparklineBaseline: [42720, 42760, 42810, 42790, 42850, 42920, 42890],
    sessionModel: 'CME_EQUITY_INDEX',
    is24x7: false,
    baseAsset: 'DJI',
    quoteAsset: 'USD',
    brokerAliases: ['DOW', 'DOWJONES', 'DJI', 'DJ30', 'WALLSTREET30', 'YM', 'US30m'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'INVERSE',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'US500',
    expectedBenchmarkCorrelation: +0.88
  },
  US500: {
    symbol: 'US500',
    displayName: 'S&P 500 Index Cash',
    shortName: 'S&P 500',
    category: 'INDICES',
    providerSymbol: 'US500',
    decimalPrecision: 2,
    pipSize: 0.1,
    tickSize: 0.1,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Broker Index Feed (MT5 / CME Proxy)',
    aliases: ['SPX', 'SP500', 'SPX500', 'ES'],
    description: 'Benchmark index tracking the stock performance of 500 large companies',
    isPriority: true,
    basePrice: 5824.20,
    typicalSpread: 0.40,
    typicalDailyChangePct: +0.45,
    sparklineBaseline: [5795, 5805, 5812, 5818, 5814, 5830, 5824.2],
    sessionModel: 'CME_EQUITY_INDEX',
    is24x7: false,
    baseAsset: 'SPX',
    quoteAsset: 'USD',
    brokerAliases: ['SPX', 'SP500', 'SPX500', 'ES', 'US500m'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'INVERSE',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'TNX',
    expectedBenchmarkCorrelation: -0.45
  },
  GER40: {
    symbol: 'GER40',
    displayName: 'DAX 40 Index Cash',
    shortName: 'DAX 40',
    category: 'INDICES',
    providerSymbol: 'DE40',
    decimalPrecision: 2,
    pipSize: 1.0,
    tickSize: 0.5,
    currency: 'EUR',
    enabled: true,
    feedStatus: 'DEMO',
    feedProvider: 'Eurex Proxy Tick Feed',
    aliases: ['DAX', 'DE40', 'GERMANY40', 'FDAX'],
    description: '40 major German blue chip companies trading on Frankfurt Stock Exchange',
    isPriority: false,
    basePrice: 19450.00,
    typicalSpread: 1.50,
    typicalDailyChangePct: +0.18,
    sparklineBaseline: [19380, 19410, 19420, 19460, 19440, 19470, 19450],
    sessionModel: 'EUREX_INDEX',
    is24x7: false,
    baseAsset: 'DAX',
    quoteAsset: 'EUR',
    brokerAliases: ['DAX', 'DE40', 'GERMANY40', 'FDAX', 'GER40m'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'INVERSE',
      dollarSensitivity: 'DIRECT',
      energyPrice: 'INVERSE',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'US500',
    expectedBenchmarkCorrelation: +0.78
  },
  UK100: {
    symbol: 'UK100',
    displayName: 'FTSE 100 Index Cash',
    shortName: 'FTSE 100',
    category: 'INDICES',
    providerSymbol: 'UK100',
    decimalPrecision: 2,
    pipSize: 1.0,
    tickSize: 0.5,
    currency: 'GBP',
    enabled: true,
    feedStatus: 'DEMO',
    feedProvider: 'London Stock Exchange Proxy',
    aliases: ['FTSE', 'FTSE100', 'UKX'],
    description: '100 companies listed on LSE with highest market capitalization',
    isPriority: false,
    basePrice: 8260.00,
    typicalSpread: 1.00,
    typicalDailyChangePct: -0.12,
    sparklineBaseline: [8290, 8280, 8270, 8265, 8272, 8255, 8260],
    sessionModel: 'LSE_INDEX',
    is24x7: false,
    baseAsset: 'FTSE',
    quoteAsset: 'GBP',
    brokerAliases: ['FTSE', 'FTSE100', 'UKX', 'UK100m'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'INVERSE',
      dollarSensitivity: 'DIRECT',
      energyPrice: 'DIRECT',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'US500',
    expectedBenchmarkCorrelation: +0.72
  },
  JP225: {
    symbol: 'JP225',
    displayName: 'Nikkei 225 Index Cash',
    shortName: 'Nikkei 225',
    category: 'INDICES',
    providerSymbol: 'JP225',
    decimalPrecision: 2,
    pipSize: 1.0,
    tickSize: 5.0,
    currency: 'JPY',
    enabled: true,
    feedStatus: 'DEMO',
    feedProvider: 'Tokyo Stock Exchange Proxy',
    aliases: ['NIKKEI', 'N225', 'JAPAN225'],
    description: 'Price-weighted index composed of Japan top 225 blue-chip companies',
    isPriority: false,
    basePrice: 38650.00,
    typicalSpread: 6.00,
    typicalDailyChangePct: +0.65,
    sparklineBaseline: [38300, 38450, 38520, 38480, 38600, 38720, 38650],
    sessionModel: 'TSE_INDEX',
    is24x7: false,
    baseAsset: 'N225',
    quoteAsset: 'JPY',
    brokerAliases: ['NIKKEI', 'N225', 'JAPAN225', 'JP225m'],
    macroSensitivity: {
      interestRates: 'DIRECT',
      inflation: 'NEUTRAL',
      dollarSensitivity: 'DIRECT',
      energyPrice: 'INVERSE',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'USDJPY',
    expectedBenchmarkCorrelation: +0.68
  },

  // -------------------------------------------------------------------------
  // COMMODITIES
  // -------------------------------------------------------------------------
  USOIL: {
    symbol: 'USOIL',
    displayName: 'WTI Light Sweet Crude Oil',
    shortName: 'Crude Oil',
    category: 'COMMODITIES',
    providerSymbol: 'USOIL',
    decimalPrecision: 2,
    pipSize: 0.01,
    tickSize: 0.01,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'MT5 Live Tick Feed',
    aliases: ['OIL', 'WTI', 'CRUDE', 'CL'],
    description: 'West Texas Intermediate Light Sweet Crude Oil',
    isPriority: true,
    basePrice: 100.05,
    typicalSpread: 0.03,
    typicalDailyChangePct: -2.37,
    sparklineBaseline: [102.8, 102.1, 101.5, 101.0, 100.8, 100.4, 100.05],
    sessionModel: 'NYMEX_ENERGY',
    is24x7: false,
    baseAsset: 'WTI',
    quoteAsset: 'USD',
    brokerAliases: ['OIL', 'WTI', 'CRUDE', 'CL', 'USOILm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'DIRECT',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'DXY',
    expectedBenchmarkCorrelation: -0.45
  },
  UKOIL: {
    symbol: 'UKOIL',
    displayName: 'Brent Crude Oil Spot',
    shortName: 'Brent Oil',
    category: 'COMMODITIES',
    providerSymbol: 'UKOIL',
    decimalPrecision: 2,
    pipSize: 0.01,
    tickSize: 0.01,
    currency: 'USD',
    enabled: true,
    feedStatus: 'DEMO',
    feedProvider: 'ICE Brent Proxy Feed',
    aliases: ['BRENT', 'BRENTOIL'],
    description: 'North Sea Brent Crude Oil international benchmark',
    isPriority: false,
    basePrice: 104.30,
    typicalSpread: 0.03,
    typicalDailyChangePct: -1.85,
    sparklineBaseline: [106.2, 105.8, 105.2, 104.9, 104.7, 104.2, 104.3],
    sessionModel: 'ICE_BRENT',
    is24x7: false,
    baseAsset: 'BRENT',
    quoteAsset: 'USD',
    brokerAliases: ['BRENT', 'BRENTOIL', 'UKOILm', 'BZ'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'DIRECT',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'USOIL',
    expectedBenchmarkCorrelation: +0.94
  },
  NATGAS: {
    symbol: 'NATGAS',
    displayName: 'Henry Hub Natural Gas',
    shortName: 'Natural Gas',
    category: 'COMMODITIES',
    providerSymbol: 'NATGAS',
    decimalPrecision: 3,
    pipSize: 0.001,
    tickSize: 0.001,
    currency: 'USD',
    enabled: true,
    feedStatus: 'DEMO',
    feedProvider: 'NYMEX Proxy Feed',
    aliases: ['GAS', 'NG'],
    description: 'US Natural Gas deliverable at Henry Hub Louisiana',
    isPriority: false,
    basePrice: 2.845,
    typicalSpread: 0.004,
    typicalDailyChangePct: +2.15,
    sparklineBaseline: [2.76, 2.78, 2.81, 2.80, 2.83, 2.86, 2.845],
    sessionModel: 'NYMEX_ENERGY',
    is24x7: false,
    baseAsset: 'NG',
    quoteAsset: 'USD',
    brokerAliases: ['GAS', 'NG', 'NATGASm'],
    macroSensitivity: {
      interestRates: 'NEUTRAL',
      inflation: 'DIRECT',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'DIRECT',
      riskAppetite: 'NEUTRAL'
    },
    crossAssetBenchmark: 'USOIL',
    expectedBenchmarkCorrelation: +0.42
  },

  // -------------------------------------------------------------------------
  // FOREX MAJORS & CROSSES
  // -------------------------------------------------------------------------
  EURUSD: {
    symbol: 'EURUSD',
    displayName: 'Euro / US Dollar',
    shortName: 'Euro',
    category: 'FOREX',
    providerSymbol: 'EURUSD',
    decimalPrecision: 4,
    pipSize: 0.0001,
    tickSize: 0.00001,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Interbank Forex Live',
    aliases: ['FIBER', 'EUR'],
    description: 'European Euro vs US Dollar major currency pair',
    isPriority: true,
    basePrice: 1.1601,
    typicalSpread: 0.0001,
    typicalDailyChangePct: +0.22,
    sparklineBaseline: [1.157, 1.158, 1.1575, 1.159, 1.1585, 1.1598, 1.1601],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'EUR',
    quoteAsset: 'USD',
    brokerAliases: ['FIBER', 'EUR', 'EURUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'NEUTRAL',
      dollarSensitivity: 'STRONG_INVERSE',
      energyPrice: 'INVERSE',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'DXY',
    expectedBenchmarkCorrelation: -0.92
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    displayName: 'British Pound / US Dollar',
    shortName: 'Pound',
    category: 'FOREX',
    providerSymbol: 'GBPUSD',
    decimalPrecision: 4,
    pipSize: 0.0001,
    tickSize: 0.00001,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Interbank Forex Live',
    aliases: ['CABLE', 'GBP'],
    description: 'British Pound Sterling vs US Dollar major currency pair',
    isPriority: true,
    basePrice: 1.3522,
    typicalSpread: 0.0001,
    typicalDailyChangePct: +0.31,
    sparklineBaseline: [1.348, 1.349, 1.350, 1.351, 1.3505, 1.3518, 1.3522],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'GBP',
    quoteAsset: 'USD',
    brokerAliases: ['CABLE', 'GBP', 'GBPUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'NEUTRAL',
      dollarSensitivity: 'STRONG_INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'DXY',
    expectedBenchmarkCorrelation: -0.84
  },
  USDJPY: {
    symbol: 'USDJPY',
    displayName: 'US Dollar / Japanese Yen',
    shortName: 'Yen',
    category: 'FOREX',
    providerSymbol: 'USDJPY',
    decimalPrecision: 2,
    pipSize: 0.01,
    tickSize: 0.001,
    currency: 'JPY',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Interbank Forex Live',
    aliases: ['NINJA', 'JPY'],
    description: 'US Dollar vs Japanese Yen major currency pair',
    isPriority: true,
    basePrice: 153.76,
    typicalSpread: 0.01,
    typicalDailyChangePct: -0.45,
    sparklineBaseline: [154.5, 154.2, 154.0, 153.9, 154.1, 153.8, 153.76],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'USD',
    quoteAsset: 'JPY',
    brokerAliases: ['NINJA', 'JPY', 'USDJPYm'],
    macroSensitivity: {
      interestRates: 'DIRECT',
      inflation: 'INVERSE',
      dollarSensitivity: 'DIRECT',
      energyPrice: 'DIRECT',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'TNX',
    expectedBenchmarkCorrelation: +0.78
  },
  AUDUSD: {
    symbol: 'AUDUSD',
    displayName: 'Australian Dollar / US Dollar',
    shortName: 'Aussie',
    category: 'FOREX',
    providerSymbol: 'AUDUSD',
    decimalPrecision: 4,
    pipSize: 0.0001,
    tickSize: 0.00001,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Interbank Forex Live',
    aliases: ['AUSSIE', 'AUD'],
    description: 'Australian Dollar vs US Dollar commodity major',
    isPriority: false,
    basePrice: 0.7170,
    typicalSpread: 0.0001,
    typicalDailyChangePct: +0.28,
    sparklineBaseline: [0.714, 0.715, 0.7148, 0.716, 0.7155, 0.7168, 0.717],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'AUD',
    quoteAsset: 'USD',
    brokerAliases: ['AUSSIE', 'AUD', 'AUDUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'STRONG_INVERSE',
      energyPrice: 'DIRECT',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'US500',
    expectedBenchmarkCorrelation: +0.65
  },
  NZDUSD: {
    symbol: 'NZDUSD',
    displayName: 'New Zealand Dollar / US Dollar',
    shortName: 'Kiwi',
    category: 'FOREX',
    providerSymbol: 'NZDUSD',
    decimalPrecision: 4,
    pipSize: 0.0001,
    tickSize: 0.00001,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Interbank Forex Live',
    aliases: ['KIWI', 'NZD'],
    description: 'New Zealand Dollar vs US Dollar major currency pair',
    isPriority: false,
    basePrice: 0.6342,
    typicalSpread: 0.0001,
    typicalDailyChangePct: +0.18,
    sparklineBaseline: [0.631, 0.632, 0.6325, 0.6338, 0.633, 0.6345, 0.6342],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'NZD',
    quoteAsset: 'USD',
    brokerAliases: ['KIWI', 'NZD', 'NZDUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'STRONG_INVERSE',
      energyPrice: 'DIRECT',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'AUDUSD',
    expectedBenchmarkCorrelation: +0.89
  },
  USDCAD: {
    symbol: 'USDCAD',
    displayName: 'US Dollar / Canadian Dollar',
    shortName: 'Loonie',
    category: 'FOREX',
    providerSymbol: 'USDCAD',
    decimalPrecision: 4,
    pipSize: 0.0001,
    tickSize: 0.00001,
    currency: 'CAD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Interbank Forex Live',
    aliases: ['LOONIE', 'CAD'],
    description: 'US Dollar vs Canadian Dollar petro-currency major',
    isPriority: false,
    basePrice: 1.3861,
    typicalSpread: 0.0001,
    typicalDailyChangePct: -0.18,
    sparklineBaseline: [1.389, 1.388, 1.3875, 1.3868, 1.387, 1.3858, 1.3861],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'USD',
    quoteAsset: 'CAD',
    brokerAliases: ['LOONIE', 'CAD', 'USDCADm'],
    macroSensitivity: {
      interestRates: 'DIRECT',
      inflation: 'NEUTRAL',
      dollarSensitivity: 'DIRECT',
      energyPrice: 'INVERSE',
      riskAppetite: 'RISK_OFF'
    },
    crossAssetBenchmark: 'USOIL',
    expectedBenchmarkCorrelation: -0.62
  },
  USDCHF: {
    symbol: 'USDCHF',
    displayName: 'US Dollar / Swiss Franc',
    shortName: 'Swissie',
    category: 'FOREX',
    providerSymbol: 'USDCHF',
    decimalPrecision: 4,
    pipSize: 0.0001,
    tickSize: 0.00001,
    currency: 'CHF',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Interbank Forex Live',
    aliases: ['SWISSIE', 'CHF'],
    description: 'US Dollar vs Swiss Franc safe-haven major currency pair',
    isPriority: false,
    basePrice: 0.8161,
    typicalSpread: 0.0001,
    typicalDailyChangePct: -0.22,
    sparklineBaseline: [0.819, 0.818, 0.8175, 0.8168, 0.817, 0.8158, 0.8161],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'USD',
    quoteAsset: 'CHF',
    brokerAliases: ['SWISSIE', 'CHF', 'USDCHFm'],
    macroSensitivity: {
      interestRates: 'DIRECT',
      inflation: 'NEUTRAL',
      dollarSensitivity: 'DIRECT',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_OFF'
    },
    crossAssetBenchmark: 'EURUSD',
    expectedBenchmarkCorrelation: -0.88
  },
  GBPJPY: {
    symbol: 'GBPJPY',
    displayName: 'British Pound / Japanese Yen',
    shortName: 'Guppy',
    category: 'FOREX',
    providerSymbol: 'GBPJPY',
    decimalPrecision: 2,
    pipSize: 0.01,
    tickSize: 0.001,
    currency: 'JPY',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Cross Rate Calculation',
    aliases: ['GUPPY', 'DRAGON', 'GEPPY'],
    description: 'High-volatility cross pair driven by UK yields & BOJ monetary policy',
    isPriority: false,
    basePrice: 207.91,
    typicalSpread: 0.02,
    typicalDailyChangePct: -0.14,
    sparklineBaseline: [208.5, 208.2, 207.9, 208.1, 207.8, 208.0, 207.91],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'GBP',
    quoteAsset: 'JPY',
    brokerAliases: ['GUPPY', 'DRAGON', 'GEPPY', 'GBPJPYm'],
    macroSensitivity: {
      interestRates: 'DIRECT',
      inflation: 'NEUTRAL',
      dollarSensitivity: 'NEUTRAL',
      energyPrice: 'DIRECT',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'USDJPY',
    expectedBenchmarkCorrelation: +0.75
  },
  EURJPY: {
    symbol: 'EURJPY',
    displayName: 'Euro / Japanese Yen',
    shortName: 'Eppy',
    category: 'FOREX',
    providerSymbol: 'EURJPY',
    decimalPrecision: 2,
    pipSize: 0.01,
    tickSize: 0.001,
    currency: 'JPY',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Cross Rate Calculation',
    aliases: ['EURJPY', 'EPPY'],
    description: 'Euro vs Japanese Yen cross currency pair',
    isPriority: false,
    basePrice: 178.38,
    typicalSpread: 0.015,
    typicalDailyChangePct: -0.23,
    sparklineBaseline: [178.8, 178.6, 178.4, 178.5, 178.3, 178.4, 178.38],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'EUR',
    quoteAsset: 'JPY',
    brokerAliases: ['EURJPY', 'EPPY', 'EURJPYm'],
    macroSensitivity: {
      interestRates: 'DIRECT',
      inflation: 'NEUTRAL',
      dollarSensitivity: 'NEUTRAL',
      energyPrice: 'DIRECT',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'USDJPY',
    expectedBenchmarkCorrelation: +0.72
  },
  EURGBP: {
    symbol: 'EURGBP',
    displayName: 'Euro / British Pound',
    shortName: 'Chunnel',
    category: 'FOREX',
    providerSymbol: 'EURGBP',
    decimalPrecision: 4,
    pipSize: 0.0001,
    tickSize: 0.00001,
    currency: 'GBP',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Open-ER Cross Rate Calculation',
    aliases: ['CHUNNEL'],
    description: 'Euro vs British Pound European regional monetary cross',
    isPriority: false,
    basePrice: 0.8579,
    typicalSpread: 0.0001,
    typicalDailyChangePct: -0.09,
    sparklineBaseline: [0.859, 0.8585, 0.858, 0.8575, 0.8582, 0.8576, 0.8579],
    sessionModel: 'FOREX_24_5',
    is24x7: false,
    baseAsset: 'EUR',
    quoteAsset: 'GBP',
    brokerAliases: ['CHUNNEL', 'EURGBPm'],
    macroSensitivity: {
      interestRates: 'NEUTRAL',
      inflation: 'NEUTRAL',
      dollarSensitivity: 'NEUTRAL',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'NEUTRAL'
    },
    crossAssetBenchmark: 'EURUSD',
    expectedBenchmarkCorrelation: +0.48
  },

  // -------------------------------------------------------------------------
  // CRYPTO ASSETS (Binance 24hr API Live Feeds)
  // -------------------------------------------------------------------------
  BTCUSD: {
    symbol: 'BTCUSD',
    displayName: 'Bitcoin / US Dollar',
    shortName: 'Bitcoin',
    category: 'CRYPTO',
    providerSymbol: 'BTCUSDT',
    decimalPrecision: 2,
    pipSize: 1.0,
    tickSize: 0.1,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Binance Spot API Live (BTCUSDT)',
    aliases: ['BTC', 'BITCOIN', 'BTCUSDT', 'XBTUSD'],
    description: 'Primary cryptocurrency benchmark by institutional market cap',
    isPriority: true,
    basePrice: 77366.00,
    typicalSpread: 8.00,
    typicalDailyChangePct: +1.48,
    sparklineBaseline: [76100, 76500, 77000, 76800, 77400, 77800, 77366],
    sessionModel: 'CRYPTO_24_7',
    is24x7: true,
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    brokerAliases: ['BTC', 'BITCOIN', 'BTCUSDT', 'XBTUSD', 'BTCUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'US100',
    expectedBenchmarkCorrelation: +0.58
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    displayName: 'Ethereum / US Dollar',
    shortName: 'Ethereum',
    category: 'CRYPTO',
    providerSymbol: 'ETHUSDT',
    decimalPrecision: 2,
    pipSize: 0.1,
    tickSize: 0.01,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Binance Spot API Live (ETHUSDT)',
    aliases: ['ETH', 'ETHEREUM', 'ETHUSDT'],
    description: 'Decentralized smart contracts network utility asset',
    isPriority: false,
    basePrice: 2542.50,
    typicalSpread: 1.20,
    typicalDailyChangePct: -3.54,
    sparklineBaseline: [2650, 2620, 2580, 2560, 2575, 2530, 2542.5],
    sessionModel: 'CRYPTO_24_7',
    is24x7: true,
    baseAsset: 'ETH',
    quoteAsset: 'USD',
    brokerAliases: ['ETH', 'ETHEREUM', 'ETHUSDT', 'ETHUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'BTCUSD',
    expectedBenchmarkCorrelation: +0.86
  },
  SOLUSD: {
    symbol: 'SOLUSD',
    displayName: 'Solana / US Dollar',
    shortName: 'Solana',
    category: 'CRYPTO',
    providerSymbol: 'SOLUSDT',
    decimalPrecision: 2,
    pipSize: 0.1,
    tickSize: 0.01,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Binance Spot API Live (SOLUSDT)',
    aliases: ['SOL', 'SOLANA', 'SOLUSDT'],
    description: 'High-throughput layer-1 blockchain asset',
    isPriority: false,
    basePrice: 198.40,
    typicalSpread: 0.15,
    typicalDailyChangePct: +4.22,
    sparklineBaseline: [188, 191, 194, 192, 196, 201, 198.4],
    sessionModel: 'CRYPTO_24_7',
    is24x7: true,
    baseAsset: 'SOL',
    quoteAsset: 'USD',
    brokerAliases: ['SOL', 'SOLANA', 'SOLUSDT', 'SOLUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'BTCUSD',
    expectedBenchmarkCorrelation: +0.82
  },
  XRPUSD: {
    symbol: 'XRPUSD',
    displayName: 'Ripple XRP / US Dollar',
    shortName: 'Ripple XRP',
    category: 'CRYPTO',
    providerSymbol: 'XRPUSDT',
    decimalPrecision: 4,
    pipSize: 0.001,
    tickSize: 0.0001,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Binance Spot API Live (XRPUSDT)',
    aliases: ['XRP', 'RIPPLE', 'XRPUSDT'],
    description: 'Cross-border interbank settlement token',
    isPriority: false,
    basePrice: 0.6124,
    typicalSpread: 0.0005,
    typicalDailyChangePct: +1.84,
    sparklineBaseline: [0.595, 0.602, 0.608, 0.605, 0.615, 0.618, 0.6124],
    sessionModel: 'CRYPTO_24_7',
    is24x7: true,
    baseAsset: 'XRP',
    quoteAsset: 'USD',
    brokerAliases: ['XRP', 'RIPPLE', 'XRPUSDT', 'XRPUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'BTCUSD',
    expectedBenchmarkCorrelation: +0.72
  },
  BNBUSD: {
    symbol: 'BNBUSD',
    displayName: 'BNB Chain / US Dollar',
    shortName: 'BNB',
    category: 'CRYPTO',
    providerSymbol: 'BNBUSDT',
    decimalPrecision: 2,
    pipSize: 0.1,
    tickSize: 0.01,
    currency: 'USD',
    enabled: true,
    feedStatus: 'LIVE',
    feedProvider: 'Binance Spot API Live (BNBUSDT)',
    aliases: ['BNB', 'BINANCECOIN', 'BNBUSDT'],
    description: 'Binance ecosystem and BNB Chain native asset',
    isPriority: false,
    basePrice: 624.80,
    typicalSpread: 0.40,
    typicalDailyChangePct: +0.65,
    sparklineBaseline: [615, 618, 622, 620, 626, 628, 624.8],
    sessionModel: 'CRYPTO_24_7',
    is24x7: true,
    baseAsset: 'BNB',
    quoteAsset: 'USD',
    brokerAliases: ['BNB', 'BINANCECOIN', 'BNBUSDT', 'BNBUSDm'],
    macroSensitivity: {
      interestRates: 'INVERSE',
      inflation: 'DIRECT',
      dollarSensitivity: 'INVERSE',
      energyPrice: 'NEUTRAL',
      riskAppetite: 'RISK_ON'
    },
    crossAssetBenchmark: 'BTCUSD',
    expectedBenchmarkCorrelation: +0.76
  }
};

/**
 * Returns all registered canonical market definitions.
 */
export function getAllMarkets(): MarketDefinition[] {
  return Object.values(MARKET_REGISTRY);
}

/**
 * Returns canonical market definition resolving standard symbols and common aliases.
 */
export function getMarketDefinition(query: string): MarketDefinition | null {
  if (!query) return null;
  const clean = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  // 1. Direct symbol match
  if (MARKET_REGISTRY[clean]) {
    return MARKET_REGISTRY[clean];
  }

  // 2. Alias resolution
  for (const def of Object.values(MARKET_REGISTRY)) {
    if (def.symbol === clean || def.providerSymbol === clean) {
      return def;
    }
    if (def.aliases.some((alias) => alias.toUpperCase() === clean)) {
      return def;
    }
    if (def.brokerAliases && def.brokerAliases.some((ba) => ba.toUpperCase() === clean)) {
      return def;
    }
  }

  return null;
}

/**
 * Retrieves all enabled markets for a specific category
 */
export function getMarketsByCategory(category: string): MarketDefinition[] {
  const all = Object.values(MARKET_REGISTRY);
  if (!category || category === 'ALL' || category === 'EXNESS FEED' || category === 'BROKER FEED' || category === 'MT5 FEED') {
    return all;
  }
  const normCat = category.toUpperCase();
  return all.filter((m) => {
    if (normCat === 'COMMODITIES' || normCat === 'COMMODITY') {
      return m.category === 'COMMODITIES';
    }
    return m.category === normCat;
  });
}

/**
 * Returns default priority markets for the top ticker strip
 */
export function getPriorityMarkets(): MarketDefinition[] {
  return Object.values(MARKET_REGISTRY).filter((m) => m.isPriority);
}

/**
 * Search markets by symbol, name, or aliases
 */
export function searchMarkets(searchTerm: string, category: string = 'ALL'): MarketDefinition[] {
  const catMatches = getMarketsByCategory(category);
  if (!searchTerm || !searchTerm.trim()) {
    return catMatches;
  }
  const q = searchTerm.trim().toLowerCase();

  return catMatches.filter((m) => {
    if (m.symbol.toLowerCase().includes(q)) return true;
    if (m.displayName.toLowerCase().includes(q)) return true;
    if (m.shortName.toLowerCase().includes(q)) return true;
    if (m.aliases.some((a) => a.toLowerCase().includes(q))) return true;
    if (m.brokerAliases && m.brokerAliases.some((ba) => ba.toLowerCase().includes(q))) return true;
    return false;
  });
}

/**
 * Helper: Check if an asset trades 24/7 (e.g. Crypto)
 */
export function isAsset24x7(symbol: string): boolean {
  const def = getMarketDefinition(symbol);
  if (def) return Boolean(def.is24x7);
  const s = symbol.toUpperCase();
  return s.startsWith('BTC') || s.startsWith('ETH') || s.startsWith('SOL') || s.startsWith('XRP') || s.startsWith('BNB');
}

/**
 * Helper: Get session model for an asset
 */
export function getAssetSessionModel(symbol: string): SessionModel {
  const def = getMarketDefinition(symbol);
  if (def && def.sessionModel) return def.sessionModel;
  if (isAsset24x7(symbol)) return 'CRYPTO_24_7';
  const s = symbol.toUpperCase();
  if (s.startsWith('XAU') || s.startsWith('XAG')) return 'METALS_24_5';
  if (s.startsWith('US30') || s.startsWith('US100') || s.startsWith('US500')) return 'CME_EQUITY_INDEX';
  if (s === 'GER40') return 'EUREX_INDEX';
  if (s === 'UK100') return 'LSE_INDEX';
  if (s === 'JP225') return 'TSE_INDEX';
  if (s === 'UKOIL') return 'ICE_BRENT';
  if (s === 'USOIL' || s === 'NATGAS') return 'NYMEX_ENERGY';
  return 'FOREX_24_5';
}

/**
 * Helper: Get benchmark asset for intermarket correlation
 */
export function getCrossAssetBenchmark(symbol: string): string {
  const def = getMarketDefinition(symbol);
  if (def && def.crossAssetBenchmark) return def.crossAssetBenchmark;
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD' || s === 'USOIL' || s === 'EURUSD' || s === 'GBPUSD') return 'DXY';
  if (s === 'XAGUSD') return 'XAUUSD';
  if (s === 'USDJPY') return 'TNX';
  if (s.startsWith('BTC') || s.startsWith('ETH') || s.startsWith('SOL')) return 'US100';
  return 'US500';
}

/**
 * Helper: Get expected benchmark correlation coefficient
 */
export function getExpectedBenchmarkCorrelation(symbol: string): number {
  const def = getMarketDefinition(symbol);
  if (def && typeof def.expectedBenchmarkCorrelation === 'number') {
    return def.expectedBenchmarkCorrelation;
  }
  const s = symbol.toUpperCase();
  if (s === 'XAUUSD') return -0.72;
  if (s === 'EURUSD') return -0.92;
  if (s === 'GBPUSD') return -0.84;
  if (s === 'USOIL') return -0.45;
  if (s === 'XAGUSD') return +0.82;
  if (s === 'USDJPY') return +0.78;
  return +0.65;
}

/**
 * Helper: Get macro sensitivity profile for an asset
 */
export function getMacroSensitivities(symbol: string): MacroSensitivityProfile {
  const def = getMarketDefinition(symbol);
  if (def && def.macroSensitivity) return def.macroSensitivity;
  return {
    interestRates: 'INVERSE',
    inflation: 'NEUTRAL',
    dollarSensitivity: 'INVERSE',
    energyPrice: 'NEUTRAL',
    riskAppetite: 'RISK_ON'
  };
}
