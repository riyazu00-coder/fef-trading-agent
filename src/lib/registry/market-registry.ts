/**
 * Central Canonical Market Registry
 * 
 * Single source of truth for all tradable assets across:
 * - METALS: XAUUSD, XAGUSD
 * - FOREX: EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF, EURJPY, GBPJPY, EURGBP, AUDJPY, CADJPY, CHFJPY
 * - INDICES: US30, US100, US500, GER40, UK100, JP225
 * - COMMODITIES: USOIL, UKOIL, NATGAS
 * - CRYPTO: BTCUSD, ETHUSD, SOLUSD, XRPUSD, BNBUSD, ADAUSD, DOGEUSD, LTCUSD, AVAXUSD, LINKUSD
 */

export type MarketCategory = 'METALS' | 'FOREX' | 'INDICES' | 'COMMODITIES' | 'CRYPTO';

export type MarketFeedStatus = 'LIVE' | 'DEMO' | 'DELAYED' | 'DATA LIMITED' | 'OFFLINE';

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
    feedProvider: 'Exness / Gold-API Live',
    aliases: ['GOLD', 'XAU', 'GOLDUSD', 'SPOTGOLD'],
    description: 'Gold Spot price vs US Dollar (LBMA benchmark)',
    isPriority: true,
    basePrice: 4349.70,
    typicalSpread: 0.16,
    typicalDailyChangePct: -0.85,
    sparklineBaseline: [4375, 4368, 4362, 4350, 4354, 4342, 4349.7]
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
    feedProvider: 'Exness / Gold-API Live',
    aliases: ['SILVER', 'XAG', 'SILVERUSD'],
    description: 'Silver Spot price vs US Dollar (LBMA benchmark)',
    isPriority: true,
    basePrice: 64.62,
    typicalSpread: 0.02,
    typicalDailyChangePct: +1.28,
    sparklineBaseline: [63.2, 63.6, 63.8, 64.1, 64.0, 64.4, 64.62]
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
    feedProvider: 'Broker Index Feed (Exness / CME Proxy)',
    aliases: ['NAS100', 'USTEC', 'NASDAQ', 'NASDAQ100', 'NDX', 'NQ'],
    description: 'Top 100 non-financial tech mega-cap companies listed on Nasdaq',
    isPriority: true,
    basePrice: 20412.00,
    typicalSpread: 1.10,
    typicalDailyChangePct: +0.72,
    sparklineBaseline: [20280, 20310, 20350, 20390, 20370, 20440, 20412]
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
    feedProvider: 'Broker Index Feed (Exness / CBOT Proxy)',
    aliases: ['DOW', 'DOWJONES', 'DJI', 'DJ30', 'WALLSTREET30', 'YM'],
    description: '30 prominent blue-chip companies traded in the United States',
    isPriority: true,
    basePrice: 42890.00,
    typicalSpread: 2.20,
    typicalDailyChangePct: +0.38,
    sparklineBaseline: [42720, 42760, 42810, 42790, 42850, 42920, 42890]
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
    feedProvider: 'Broker Index Feed (Exness / CME Proxy)',
    aliases: ['SPX', 'SP500', 'SPX500', 'ES'],
    description: 'Benchmark index tracking the stock performance of 500 large companies',
    isPriority: true,
    basePrice: 5824.20,
    typicalSpread: 0.40,
    typicalDailyChangePct: +0.45,
    sparklineBaseline: [5795, 5805, 5812, 5818, 5814, 5830, 5824.2]
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
    sparklineBaseline: [19380, 19410, 19420, 19460, 19440, 19470, 19450]
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
    sparklineBaseline: [8290, 8280, 8270, 8265, 8272, 8255, 8260]
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
    sparklineBaseline: [38300, 38450, 38520, 38480, 38600, 38720, 38650]
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
    feedProvider: 'Exness Live Tick Feed',
    aliases: ['OIL', 'WTI', 'CRUDE', 'CL'],
    description: 'West Texas Intermediate Light Sweet Crude Oil',
    isPriority: true,
    basePrice: 100.05,
    typicalSpread: 0.03,
    typicalDailyChangePct: -2.37,
    sparklineBaseline: [102.8, 102.1, 101.5, 101.0, 100.8, 100.4, 100.05]
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
    sparklineBaseline: [106.2, 105.8, 105.2, 104.9, 104.7, 104.2, 104.3]
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
    sparklineBaseline: [2.76, 2.78, 2.81, 2.80, 2.83, 2.86, 2.845]
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
    sparklineBaseline: [1.157, 1.158, 1.1575, 1.159, 1.1585, 1.1598, 1.1601]
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
    sparklineBaseline: [1.348, 1.349, 1.350, 1.351, 1.3505, 1.3518, 1.3522]
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
    sparklineBaseline: [154.5, 154.2, 154.0, 153.9, 154.1, 153.8, 153.76]
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
    sparklineBaseline: [0.714, 0.715, 0.7148, 0.716, 0.7155, 0.7168, 0.717]
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
    sparklineBaseline: [0.631, 0.632, 0.6325, 0.6338, 0.633, 0.6345, 0.6342]
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
    sparklineBaseline: [1.389, 1.388, 1.3875, 1.3868, 1.387, 1.3858, 1.3861]
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
    sparklineBaseline: [0.819, 0.818, 0.8175, 0.8168, 0.817, 0.8158, 0.8161]
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
    sparklineBaseline: [208.5, 208.2, 207.9, 208.1, 207.8, 208.0, 207.91]
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
    sparklineBaseline: [178.8, 178.6, 178.4, 178.5, 178.3, 178.4, 178.38]
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
    sparklineBaseline: [0.859, 0.8585, 0.858, 0.8575, 0.8582, 0.8576, 0.8579]
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
    sparklineBaseline: [76100, 76500, 77000, 76800, 77400, 77800, 77366]
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
    sparklineBaseline: [2650, 2620, 2580, 2560, 2575, 2530, 2542.5]
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
    sparklineBaseline: [188, 191, 194, 192, 196, 201, 198.4]
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
    sparklineBaseline: [0.595, 0.602, 0.608, 0.605, 0.615, 0.618, 0.6124]
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
    sparklineBaseline: [615, 618, 622, 620, 626, 628, 624.8]
  }
};

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
  }

  return null;
}

/**
 * Retrieves all enabled markets for a specific category
 */
export function getMarketsByCategory(category: string): MarketDefinition[] {
  const all = Object.values(MARKET_REGISTRY);
  if (!category || category === 'ALL' || category === 'EXNESS FEED') {
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
    return false;
  });
}
