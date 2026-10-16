/**
 * FEF TRADING SOLUTIONS — CANONICAL INSTRUMENT PARITY & REFERENCE QUALITY REGISTRY
 * Phase 4 Clean-Room Implementation
 *
 * Establishes strict economic comparability rules between MT5 Broker instruments
 * and Independent Reference Market Feeds across all 26 configured assets.
 *
 * Classification Definitions:
 * - PARITY_VERIFIED: Same economic contract with tight price alignment (< 0.5% FX/Metals, < 0.4% Crypto).
 *   Permitted for live price authority fallback and reference-based structural levels.
 * - PARITY_ACCEPTABLE: Minor basis differences (e.g. spot vs front-month futures basis in Energy < 3.0%).
 *   Permitted for live price authority fallback with referenceOnly metadata.
 * - PROXY_ONLY: Major numerical/basis divergence (e.g. US100 Exness USTEC CFD @ ~29430 vs Nasdaq-100 Cash @ ~20412).
 *   Permitted for trend, macro correlation, and historical structure ONLY.
 *   Strictly FORBIDDEN from acting as broker-equivalent live price authority or generating exact execution levels.
 * - NOT_COMPARABLE: Economically divergent contract with inverted or broken beta.
 * - UNAVAILABLE: Feed genuinely absent or unverified (e.g. GER40 live price fail-closed 0).
 */

export type ParityClassification =
  | 'PARITY_VERIFIED'
  | 'PARITY_ACCEPTABLE'
  | 'PROXY_ONLY'
  | 'NOT_COMPARABLE'
  | 'UNAVAILABLE';

export interface ParityCapabilities {
  livePriceAuthority: boolean;     // Can reference feed be the live price authority if MT5 is offline?
  exactExecutionLevels: boolean;   // Can reference candles calculate exact SL/TP/Entry levels?
  trendAnalysis: boolean;          // Can reference feed evaluate trend direction & swings?
  macroContext: boolean;           // Can reference feed contribute to macro & correlation matrices?
  historicalStructure: boolean;    // Can reference candles populate market structure?
  orderFlow: boolean;              // Requires verified exchange volume or live broker tick flow
}

export interface InstrumentParityProfile {
  symbol: string;
  category: 'METALS' | 'FOREX' | 'INDICES' | 'COMMODITIES' | 'CRYPTO';
  brokerSymbol: string;
  brokerDescription: string;
  referenceProvider: string;
  referenceSymbol: string;
  instrumentType: string;
  contractIdentity: string;
  parityClassification: ParityClassification;
  isDirect: boolean;
  isDerived: boolean;
  isProxy: boolean;
  maxAcceptableDivergencePct: number;
  reason: string;
  allowedCapabilities: ParityCapabilities;
}

export const INSTRUMENT_PARITY_REGISTRY: Record<string, InstrumentParityProfile> = {
  // =========================================================================
  // 1. INDICES (6 Assets)
  // =========================================================================
  US100: {
    symbol: 'US100',
    category: 'INDICES',
    brokerSymbol: 'USTEC',
    brokerDescription: 'US Tech 100 Index Cash CFD',
    referenceProvider: 'Yahoo Finance CME Proxy / ^NDX',
    referenceSymbol: '^NDX / NQ=F',
    instrumentType: 'Index CFD vs Underlying Cash Index',
    contractIdentity: 'Exness USTEC (proprietary scaled Tech 100 CFD) vs Nasdaq-100 Cash (^NDX)',
    parityClassification: 'PROXY_ONLY',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 5.0,
    reason: 'Major basis divergence (~30.7%): Exness quotes USTEC as a proprietary scaled Tech CFD (~29440) vs Underlying Index (~20412). Valid for trend/macro/structure proxy; strictly INVALID for exact broker execution levels.',
    allowedCapabilities: {
      livePriceAuthority: false,
      exactExecutionLevels: false,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  US30: {
    symbol: 'US30',
    category: 'INDICES',
    brokerSymbol: 'US30',
    brokerDescription: 'US Wall Street 30 Index Cash CFD',
    referenceProvider: 'Yahoo Finance CBOT Proxy / ^DJI',
    referenceSymbol: '^DJI / YM=F',
    instrumentType: 'Index CFD vs Underlying Cash Index',
    contractIdentity: 'Exness US30 (DJIA proprietary CFD) vs Dow Jones Cash (^DJI)',
    parityClassification: 'PROXY_ONLY',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 5.0,
    reason: 'Basis divergence (~17.6%): Broker US30 CFD (~52070) vs Underlying Dow Jones Index (~42890). Directionally correlated proxy; not price-equivalent.',
    allowedCapabilities: {
      livePriceAuthority: false,
      exactExecutionLevels: false,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  US500: {
    symbol: 'US500',
    category: 'INDICES',
    brokerSymbol: 'US500',
    brokerDescription: 'US SPX 500 Index Cash CFD',
    referenceProvider: 'Yahoo Finance CME Proxy / ^GSPC',
    referenceSymbol: '^GSPC / ES=F',
    instrumentType: 'Index CFD vs Underlying Cash Index',
    contractIdentity: 'Exness US500 CFD vs S&P 500 Cash (^GSPC)',
    parityClassification: 'PROXY_ONLY',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 5.0,
    reason: 'Basis divergence (~24.3%): Broker US500 CFD (~7690) vs S&P 500 Index (~5824). Directionally correlated proxy; not price-equivalent.',
    allowedCapabilities: {
      livePriceAuthority: false,
      exactExecutionLevels: false,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  GER40: {
    symbol: 'GER40',
    category: 'INDICES',
    brokerSymbol: 'NOT_OFFERED',
    brokerDescription: 'DAX 40 Index (Broker Unoffered)',
    referenceProvider: 'UNAVAILABLE (No Public Live Feed)',
    referenceSymbol: '^GDAXI',
    instrumentType: 'Underlying Index Structure',
    contractIdentity: 'DAX 40 (^GDAXI)',
    parityClassification: 'UNAVAILABLE',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 0.0,
    reason: 'Broker does not stream GER40 live quotes. Public live feed unverified. Fails closed to live price 0; historical ^GDAXI structure preserved for technical/macro context.',
    allowedCapabilities: {
      livePriceAuthority: false,
      exactExecutionLevels: false,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  UK100: {
    symbol: 'UK100',
    category: 'INDICES',
    brokerSymbol: 'UK100',
    brokerDescription: 'UK 100 Index Cash CFD',
    referenceProvider: 'London Stock Exchange Proxy (^FTSE)',
    referenceSymbol: '^FTSE',
    instrumentType: 'Index CFD vs Underlying Cash Index',
    contractIdentity: 'Exness UK100 CFD vs FTSE 100 Cash (^FTSE)',
    parityClassification: 'PROXY_ONLY',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 5.0,
    reason: 'Basis divergence (~23.9%): Broker UK100 (~10850) vs FTSE 100 Cash (~8260). Proxy only.',
    allowedCapabilities: {
      livePriceAuthority: false,
      exactExecutionLevels: false,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  JP225: {
    symbol: 'JP225',
    category: 'INDICES',
    brokerSymbol: 'JP225',
    brokerDescription: 'Japan 225 Index Cash CFD',
    referenceProvider: 'Tokyo Stock Exchange Proxy (^N225)',
    referenceSymbol: '^N225',
    instrumentType: 'Index CFD vs Underlying Cash Index',
    contractIdentity: 'Exness JP225 CFD vs Nikkei 225 Cash (^N225)',
    parityClassification: 'PROXY_ONLY',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 5.0,
    reason: 'Basis divergence (~40.0%): Broker JP225 (~64360) vs Nikkei 225 Cash (~38650). Proxy only.',
    allowedCapabilities: {
      livePriceAuthority: false,
      exactExecutionLevels: false,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },

  // =========================================================================
  // 2. COMMODITIES / ENERGY (3 Assets)
  // =========================================================================
  USOIL: {
    symbol: 'USOIL',
    category: 'COMMODITIES',
    brokerSymbol: 'USOIL',
    brokerDescription: 'Crude Oil Spot CFD',
    referenceProvider: 'NYMEX WTI Front-Month (CL=F)',
    referenceSymbol: 'CL=F',
    instrumentType: 'Spot Crude CFD vs Front-Month WTI Futures',
    contractIdentity: 'Exness USOIL Spot CFD vs NYMEX WTI Futures (CL=F)',
    parityClassification: 'PARITY_ACCEPTABLE',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 3.0,
    reason: 'Basis difference (~1.6%): Spot CFD (~98.5) vs NYMEX WTI Front-Month (~100.0). Minor spot-futures basis.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  UKOIL: {
    symbol: 'UKOIL',
    category: 'COMMODITIES',
    brokerSymbol: 'UKOIL',
    brokerDescription: 'Crude Oil Brent Spot CFD',
    referenceProvider: 'ICE Brent Futures (BZ=F)',
    referenceSymbol: 'BZ=F',
    instrumentType: 'Spot Brent CFD vs ICE Brent Futures',
    contractIdentity: 'Exness UKOIL Spot CFD vs ICE Brent Futures (BZ=F)',
    parityClassification: 'PARITY_ACCEPTABLE',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 3.5,
    reason: 'Basis difference (~2.8%): Spot Brent CFD (~107.3) vs ICE Brent Futures (~104.3). Minor spot-futures basis.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  NATGAS: {
    symbol: 'NATGAS',
    category: 'COMMODITIES',
    brokerSymbol: 'XNGUSD',
    brokerDescription: 'Natural Gas Spot CFD',
    referenceProvider: 'NYMEX Henry Hub Futures (NG=F)',
    referenceSymbol: 'NG=F',
    instrumentType: 'Spot Gas CFD vs Henry Hub Futures',
    contractIdentity: 'Exness XNGUSD Spot CFD vs NYMEX Henry Hub Futures (NG=F)',
    parityClassification: 'PROXY_ONLY',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 5.0,
    reason: 'Seasonal contract basis difference (~15.5%): Spot Natural Gas CFD (~3.37) vs Futures Benchmark (~2.85). Proxy only.',
    allowedCapabilities: {
      livePriceAuthority: false,
      exactExecutionLevels: false,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },

  // =========================================================================
  // 3. METALS (2 Assets)
  // =========================================================================
  XAUUSD: {
    symbol: 'XAUUSD',
    category: 'METALS',
    brokerSymbol: 'XAUUSD',
    brokerDescription: 'Gold vs US Dollar Spot',
    referenceProvider: 'Gold-API Live (LBMA Benchmark)',
    referenceSymbol: 'XAU',
    instrumentType: 'Physical Spot Gold CFD vs LBMA Benchmark',
    contractIdentity: 'Exness XAUUSD Spot vs LBMA Gold Fix (Gold-API)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.25,
    reason: 'Tight interbank/spot alignment (< 0.02% divergence): LBMA spot benchmark tightly tracks broker spot CFD.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    category: 'METALS',
    brokerSymbol: 'XAGUSD',
    brokerDescription: 'Silver vs US Dollar Spot',
    referenceProvider: 'Gold-API Live (LBMA Benchmark)',
    referenceSymbol: 'XAG',
    instrumentType: 'Physical Spot Silver CFD vs LBMA Benchmark',
    contractIdentity: 'Exness XAGUSD Spot vs LBMA Silver Fix (Gold-API)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.35,
    reason: 'Tight spot silver alignment (< 0.20% divergence): LBMA Benchmark tracks broker CFD.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },

  // =========================================================================
  // 4. FOREX MAJORS & CROSSES (10 Assets)
  // =========================================================================
  EURUSD: {
    symbol: 'EURUSD',
    category: 'FOREX',
    brokerSymbol: 'EURUSD',
    brokerDescription: 'Euro vs US Dollar',
    referenceProvider: 'Open-ER Interbank Forex Live',
    referenceSymbol: 'EURUSD',
    instrumentType: 'Spot Forex CFD vs Interbank Spot Rate',
    contractIdentity: 'Interbank Spot Midrate (Open-ER / ECB)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Interbank FX alignment: < 0.05% divergence (0.3 bps). Economically identical market.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    category: 'FOREX',
    brokerSymbol: 'GBPUSD',
    brokerDescription: 'Great Britain Pound vs US Dollar',
    referenceProvider: 'Open-ER Interbank Forex Live',
    referenceSymbol: 'GBPUSD',
    instrumentType: 'Spot Forex CFD vs Interbank Spot Rate',
    contractIdentity: 'Interbank Spot Midrate (Open-ER / ECB)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Interbank FX alignment: < 0.40% divergence (38.8 bps). Economically identical market.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  USDJPY: {
    symbol: 'USDJPY',
    category: 'FOREX',
    brokerSymbol: 'USDJPY',
    brokerDescription: 'US Dollar vs Japanese Yen',
    referenceProvider: 'Open-ER Interbank Forex Live',
    referenceSymbol: 'USDJPY',
    instrumentType: 'Spot Forex CFD vs Interbank Spot Rate',
    contractIdentity: 'Interbank Spot Midrate (Open-ER / BOJ)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Interbank FX alignment: < 0.20% divergence (14.8 bps). Economically identical market.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  USDCHF: {
    symbol: 'USDCHF',
    category: 'FOREX',
    brokerSymbol: 'USDCHF',
    brokerDescription: 'US Dollar vs Swiss Franc',
    referenceProvider: 'Open-ER Interbank Forex Live',
    referenceSymbol: 'USDCHF',
    instrumentType: 'Spot Forex CFD vs Interbank Spot Rate',
    contractIdentity: 'Interbank Spot Midrate (Open-ER / SNB)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Interbank FX alignment: < 0.30% divergence (28.9 bps). Economically identical market.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  AUDUSD: {
    symbol: 'AUDUSD',
    category: 'FOREX',
    brokerSymbol: 'AUDUSD',
    brokerDescription: 'Australian Dollar vs US Dollar',
    referenceProvider: 'Open-ER Interbank Forex Live',
    referenceSymbol: 'AUDUSD',
    instrumentType: 'Spot Forex CFD vs Interbank Spot Rate',
    contractIdentity: 'Interbank Spot Midrate (Open-ER / RBA)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Interbank FX alignment: < 0.40% divergence (38.9 bps). Economically identical market.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  USDCAD: {
    symbol: 'USDCAD',
    category: 'FOREX',
    brokerSymbol: 'USDCAD',
    brokerDescription: 'US Dollar vs Canadian Dollar',
    referenceProvider: 'Open-ER Interbank Forex Live',
    referenceSymbol: 'USDCAD',
    instrumentType: 'Spot Forex CFD vs Interbank Spot Rate',
    contractIdentity: 'Interbank Spot Midrate (Open-ER / BOC)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Interbank FX alignment: < 0.25% divergence (20.5 bps). Economically identical market.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  NZDUSD: {
    symbol: 'NZDUSD',
    category: 'FOREX',
    brokerSymbol: 'NZDUSD',
    brokerDescription: 'New Zealand Dollar vs US Dollar',
    referenceProvider: 'Open-ER Interbank Forex Live',
    referenceSymbol: 'NZDUSD',
    instrumentType: 'Spot Forex CFD vs Interbank Spot Rate',
    contractIdentity: 'Interbank Spot Midrate (Open-ER / RBNZ)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Interbank FX alignment: < 0.50% divergence (47.1 bps). Economically identical market.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  EURJPY: {
    symbol: 'EURJPY',
    category: 'FOREX',
    brokerSymbol: 'EURJPY',
    brokerDescription: 'Euro vs Japanese Yen Cross',
    referenceProvider: 'Open-ER Cross Rate Calculation',
    referenceSymbol: 'EURJPY',
    instrumentType: 'Derived Interbank Cross Rate',
    contractIdentity: 'Derived Interbank Cross Rate (EUR/USD * USD/JPY)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: false,
    isDerived: true,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Derived interbank cross rate (< 0.15% divergence / 14.4 bps).',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  GBPJPY: {
    symbol: 'GBPJPY',
    category: 'FOREX',
    brokerSymbol: 'GBPJPY',
    brokerDescription: 'Great Britain Pound vs Japanese Yen Cross',
    referenceProvider: 'Open-ER Cross Rate Calculation',
    referenceSymbol: 'GBPJPY',
    instrumentType: 'Derived Interbank Cross Rate',
    contractIdentity: 'Derived Interbank Cross Rate (GBP/USD * USD/JPY)',
    parityClassification: 'PARITY_ACCEPTABLE',
    isDirect: false,
    isDerived: true,
    isProxy: false,
    maxAcceptableDivergencePct: 0.8,
    reason: 'Derived interbank cross rate (~0.54% divergence due to high volatility beta). Economically identical market.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  EURGBP: {
    symbol: 'EURGBP',
    category: 'FOREX',
    brokerSymbol: 'EURGBP',
    brokerDescription: 'Euro vs Great Britain Pound Cross',
    referenceProvider: 'Open-ER Cross Rate Calculation',
    referenceSymbol: 'EURGBP',
    instrumentType: 'Derived Interbank Cross Rate',
    contractIdentity: 'Derived Interbank Cross Rate (EUR/USD / GBP/USD)',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: false,
    isDerived: true,
    isProxy: false,
    maxAcceptableDivergencePct: 0.5,
    reason: 'Derived interbank cross rate (< 0.40% divergence / 39.7 bps).',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },

  // =========================================================================
  // 5. CRYPTO (5 Assets)
  // =========================================================================
  BTCUSD: {
    symbol: 'BTCUSD',
    category: 'CRYPTO',
    brokerSymbol: 'BTCUSD',
    brokerDescription: 'Bitcoin vs US Dollar CFD',
    referenceProvider: 'Binance / Kraken Spot API',
    referenceSymbol: 'BTCUSD / BTCUSDT',
    instrumentType: 'Crypto CFD vs Exchange Spot (USD/USDT)',
    contractIdentity: 'Exness Crypto CFD vs Binance/Kraken Exchange Spot',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.4,
    reason: 'Centralized exchange spot alignment (< 0.15% divergence). USDT/USD basis accounted for in metadata.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    category: 'CRYPTO',
    brokerSymbol: 'ETHUSD',
    brokerDescription: 'Ethereum vs US Dollar CFD',
    referenceProvider: 'Binance / Kraken Spot API',
    referenceSymbol: 'ETHUSD / ETHUSDT',
    instrumentType: 'Crypto CFD vs Exchange Spot (USD/USDT)',
    contractIdentity: 'Exness Crypto CFD vs Binance/Kraken Exchange Spot',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.4,
    reason: 'Centralized exchange spot alignment (< 0.20% divergence). USDT/USD basis accounted for in metadata.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  SOLUSD: {
    symbol: 'SOLUSD',
    category: 'CRYPTO',
    brokerSymbol: 'SOLUSD',
    brokerDescription: 'Solana Token vs US Dollar CFD',
    referenceProvider: 'Binance / Kraken Spot API',
    referenceSymbol: 'SOLUSD / SOLUSDT',
    instrumentType: 'Crypto CFD vs Exchange Spot (USD/USDT)',
    contractIdentity: 'Exness Crypto CFD vs Binance/Kraken Exchange Spot',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.4,
    reason: 'Centralized exchange spot alignment (< 0.12% divergence). USDT/USD basis accounted for in metadata.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  XRPUSD: {
    symbol: 'XRPUSD',
    category: 'CRYPTO',
    brokerSymbol: 'XRPUSD',
    brokerDescription: 'Ripple vs US Dollar CFD',
    referenceProvider: 'Binance / Kraken Spot API',
    referenceSymbol: 'XRPUSD / XRPUSDT',
    instrumentType: 'Crypto CFD vs Exchange Spot (USD/USDT)',
    contractIdentity: 'Exness Crypto CFD vs Binance/Kraken Exchange Spot',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.4,
    reason: 'Centralized exchange spot alignment (< 0.25% divergence). USDT/USD basis accounted for in metadata.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
  BNBUSD: {
    symbol: 'BNBUSD',
    category: 'CRYPTO',
    brokerSymbol: 'BNBUSD',
    brokerDescription: 'BNB Token vs US Dollar CFD',
    referenceProvider: 'Binance / Kraken Spot API',
    referenceSymbol: 'BNBUSD / BNBUSDT',
    instrumentType: 'Crypto CFD vs Exchange Spot (USD/USDT)',
    contractIdentity: 'Exness Crypto CFD vs Binance/Kraken Exchange Spot',
    parityClassification: 'PARITY_VERIFIED',
    isDirect: true,
    isDerived: false,
    isProxy: false,
    maxAcceptableDivergencePct: 0.4,
    reason: 'Centralized exchange spot alignment (< 0.12% divergence). USDT/USD basis accounted for in metadata.',
    allowedCapabilities: {
      livePriceAuthority: true,
      exactExecutionLevels: true,
      trendAnalysis: true,
      macroContext: true,
      historicalStructure: true,
      orderFlow: false,
    },
  },
};

/**
 * Retrieve the canonical parity profile for an asset
 */
export function getInstrumentParityProfile(symbol: string): InstrumentParityProfile {
  const norm = (symbol || '').toUpperCase().trim();
  if (INSTRUMENT_PARITY_REGISTRY[norm]) {
    return INSTRUMENT_PARITY_REGISTRY[norm];
  }

  // Fail-closed default for unconfigured instruments
  return {
    symbol: norm,
    category: 'FOREX',
    brokerSymbol: norm,
    brokerDescription: norm,
    referenceProvider: 'Unverified Reference',
    referenceSymbol: norm,
    instrumentType: 'Unknown',
    contractIdentity: 'Unverified',
    parityClassification: 'UNAVAILABLE',
    isDirect: false,
    isDerived: false,
    isProxy: true,
    maxAcceptableDivergencePct: 0.0,
    reason: 'Instrument unconfigured in canonical parity registry (fail-closed).',
    allowedCapabilities: {
      livePriceAuthority: false,
      exactExecutionLevels: false,
      trendAnalysis: false,
      macroContext: false,
      historicalStructure: false,
      orderFlow: false,
    },
  };
}

/**
 * Check whether reference market pricing is permitted to act as price authority
 */
export function isReferencePriceAuthorityPermitted(symbol: string): boolean {
  const profile = getInstrumentParityProfile(symbol);
  return profile.allowedCapabilities.livePriceAuthority;
}

/**
 * Check whether reference-derived candles are permitted to calculate exact execution levels (Entry, SL, TP)
 */
export function isReferenceExecutionLevelPermitted(symbol: string): boolean {
  const profile = getInstrumentParityProfile(symbol);
  return profile.allowedCapabilities.exactExecutionLevels;
}

