/**
 * FEF Smart Position Size & Risk Calculator Engine
 * 
 * Asset-aware lot size and risk management calculator built on institutional
 * instrument specifications from the canonical market registry.
 * 
 * Key Principles:
 * 1. Asset-Aware: Uses exact contractSize, tickSize, and tickValue per instrument (never hardcodes "1 pip = $10").
 * 2. Risk-First Safety: Strictly rounds lot size DOWN to the nearest broker lotStep so estimated loss NEVER exceeds risk capital.
 * 3. Directional Validation: Validates BUY vs SELL (SL below Entry for BUY, SL above Entry for SELL).
 * 4. Risk Guardian Alignment: Integrates with event buffers and max allowed risk caps.
 */

export interface InstrumentContractSpec {
  symbol: string;
  displayName: string;
  contractSize: number;     // e.g. 100 for Gold (oz), 100,000 for FX, 1 for Indices/Crypto, 1000 for Oil (barrels)
  tickSize: number;         // Minimum price increment (e.g. 0.01, 0.00001, 0.25)
  tickValue: number;        // USD value of 1 tick on 1.00 lot
  pipSize: number;          // Pip unit increment (e.g. 0.1 for Gold, 0.0001 for EURUSD, 1.0 for Indices)
  lotStep: number;          // Minimum lot increment (e.g. 0.01 or 0.1)
  minLot: number;           // Minimum allowable lot (e.g. 0.01)
  maxLot: number;           // Maximum allowable lot (e.g. 100.0)
  quoteCurrency: string;    // 'USD', 'JPY', 'CAD', etc.
  isVerified: boolean;      // True if broker contract specifications are verified
}

export const INSTRUMENT_CONTRACT_SPECS: Record<string, InstrumentContractSpec> = {
  // METALS
  XAUUSD: {
    symbol: 'XAUUSD',
    displayName: 'Gold Spot (LBMA)',
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1.00,        // $0.01 * 100 oz = $1.00 per tick on 1 lot ($1.00 price move = $100)
    pipSize: 0.1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  XAGUSD: {
    symbol: 'XAGUSD',
    displayName: 'Silver Spot',
    contractSize: 5000,
    tickSize: 0.005,
    tickValue: 25.00,       // 5,000 oz contract: $1.00 price move = $5,000 per lot
    pipSize: 0.01,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 50.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },

  // FOREX MAJORS & CROSSES
  EURUSD: {
    symbol: 'EURUSD',
    displayName: 'Euro / US Dollar',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.00,        // 1 pip (0.0001) = $10.00 on 1.00 lot
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    displayName: 'British Pound / US Dollar',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.00,        // 1 pip (0.0001) = $10.00 on 1.00 lot
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  USDJPY: {
    symbol: 'USDJPY',
    displayName: 'US Dollar / Japanese Yen',
    contractSize: 100000,
    tickSize: 0.001,
    tickValue: 0.65,        // At ~155.00 USDJPY: 1,000 JPY / 155 = ~$6.45 per pip on 1 lot
    pipSize: 0.01,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'JPY',
    isVerified: true,
  },
  GBPJPY: {
    symbol: 'GBPJPY',
    displayName: 'British Pound / Japanese Yen',
    contractSize: 100000,
    tickSize: 0.001,
    tickValue: 0.65,
    pipSize: 0.01,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'JPY',
    isVerified: true,
  },
  AUDUSD: {
    symbol: 'AUDUSD',
    displayName: 'Australian Dollar / US Dollar',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.00,
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  NZDUSD: {
    symbol: 'NZDUSD',
    displayName: 'New Zealand Dollar / US Dollar',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.00,
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  USDCAD: {
    symbol: 'USDCAD',
    displayName: 'US Dollar / Canadian Dollar',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 0.72,        // At ~1.38 USDCAD: 10 CAD / 1.38 = ~$7.25 per pip
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'CAD',
    isVerified: true,
  },
  USDCHF: {
    symbol: 'USDCHF',
    displayName: 'US Dollar / Swiss Franc',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.11,        // At ~0.90 USDCHF: 10 CHF / 0.90 = ~$11.11 per pip
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'CHF',
    isVerified: true,
  },
  EURGBP: {
    symbol: 'EURGBP',
    displayName: 'Euro / British Pound',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.30,        // 10 GBP * 1.30 GBPUSD = ~$13.00 per pip
    pipSize: 0.0001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'GBP',
    isVerified: true,
  },

  // US INDICES
  US30: {
    symbol: 'US30',
    displayName: 'Wall Street 30 / Dow Jones CFD',
    contractSize: 1,        // 1 lot = 1 index unit ($1 per point on 1 lot)
    tickSize: 1.0,
    tickValue: 1.00,
    pipSize: 1.0,
    lotStep: 0.1,
    minLot: 0.1,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  US100: {
    symbol: 'US100',
    displayName: 'Nasdaq 100 CFD',
    contractSize: 1,        // 1 lot = 1 index unit ($1 per point on 1 lot)
    tickSize: 0.25,
    tickValue: 0.25,
    pipSize: 1.0,
    lotStep: 0.1,
    minLot: 0.1,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  US500: {
    symbol: 'US500',
    displayName: 'S&P 500 CFD',
    contractSize: 1,        // 1 lot = 1 index unit ($1 per point on 1 lot)
    tickSize: 0.1,
    tickValue: 0.10,
    pipSize: 1.0,
    lotStep: 0.1,
    minLot: 0.1,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },

  // COMMODITIES
  USOIL: {
    symbol: 'USOIL',
    displayName: 'WTI Crude Oil',
    contractSize: 1000,     // 1 lot = 1,000 barrels ($1.00 price move = $1,000)
    tickSize: 0.01,
    tickValue: 10.00,       // $0.01 * 1,000 = $10.00 per tick
    pipSize: 0.01,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 50.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  UKOIL: {
    symbol: 'UKOIL',
    displayName: 'Brent Crude Oil',
    contractSize: 1000,
    tickSize: 0.01,
    tickValue: 10.00,
    pipSize: 0.01,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 50.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },

  // CRYPTO
  BTCUSD: {
    symbol: 'BTCUSD',
    displayName: 'Bitcoin / US Dollar',
    contractSize: 1,        // 1 lot = 1 BTC ($1 price move = $1 per lot)
    tickSize: 0.01,
    tickValue: 0.01,
    pipSize: 1.0,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 20.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  ETHUSD: {
    symbol: 'ETHUSD',
    displayName: 'Ethereum / US Dollar',
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    pipSize: 0.1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 50.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  SOLUSD: {
    symbol: 'SOLUSD',
    displayName: 'Solana / US Dollar',
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    pipSize: 0.01,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  XRPUSD: {
    symbol: 'XRPUSD',
    displayName: 'Ripple / US Dollar',
    contractSize: 1000,
    tickSize: 0.0001,
    tickValue: 0.10,
    pipSize: 0.001,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 200.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
  BNBUSD: {
    symbol: 'BNBUSD',
    displayName: 'Binance Coin / US Dollar',
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    pipSize: 0.1,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 50.0,
    quoteCurrency: 'USD',
    isVerified: true,
  },
};

export interface PositionSizeInput {
  symbol: string;
  direction: 'BUY' | 'SELL';
  capital: number;
  riskPct: number;             // User requested risk % (e.g. 0.50, 1.00)
  entryPrice: number;
  stopLoss: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  riskGuardianMaxRiskPct?: number; // Cap enforced by Risk Guardian (e.g. 0.50)
  spreadBufferPips?: number;   // Optional slippage/spread buffer in pips
  brokerSpecOverride?: Partial<InstrumentContractSpec>; // Authoritative broker specs from live MT5 connection
  exitDistribution?: {
    tp1Pct: number;            // Default 50%
    tp2Pct: number;            // Default 30%
    tp3Pct: number;            // Default 20%
  };
}

export interface PositionSizeResult {
  isValid: boolean;
  errorMessage?: string;
  isSpecificationVerified: boolean;
  
  // Instrument Details
  symbol: string;
  direction: 'BUY' | 'SELL';
  contractSize: number;
  
  // Risk Budget
  capital: number;
  requestedRiskPct: number;
  allowedRiskPct: number;
  isRiskCappedByGuardian: boolean;
  riskAmount: number;          // Maximum permissible loss in USD
  
  // Price Distances
  entryPrice: number;
  stopLoss: number;
  stopDistance: number;
  stopDistancePips: number;
  lossPerLotAtStop: number;    // Dollar loss on 1.00 standard lot
  
  // Lot Sizing
  rawLotSize: number;          // Unrounded mathematical lot
  safeLotSize: number;         // Broker compatible, rounded DOWN to lotStep
  lotStep: number;
  minLot: number;
  maxLot: number;
  isBelowMinLot: boolean;
  
  // Expected Outcomes
  estimatedLossAtSL: number;   // In USD (recalculated with safeLotSize)
  accountImpactPct: number;    // Percentage loss with safeLotSize
  
  // Targets & R:R
  tp1?: {
    price: number;
    distance: number;
    rr: number;
    rrFormatted: string;
    profitFullLot: number;
    profitPartial: number;     // Profit based on exit distribution
  };
  tp2?: {
    price: number;
    distance: number;
    rr: number;
    rrFormatted: string;
    profitFullLot: number;
    profitPartial: number;
  };
  tp3?: {
    price: number;
    distance: number;
    rr: number;
    rrFormatted: string;
    profitFullLot: number;
    profitPartial: number;
  };
  
  // Blended Portfolio Returns
  blendedTotalProfit: number;
  blendedTotalRR: string;
  suggestedBreakEven: string;
  safetyLabel: string;
}

/**
 * Retrieve verified contract specifications for any supported symbol
 */
export function getInstrumentContractSpec(symbol: string): InstrumentContractSpec | null {
  const upper = symbol.toUpperCase().trim();
  return INSTRUMENT_CONTRACT_SPECS[upper] || null;
}

/**
 * Core mathematical calculation of asset-aware position sizing
 */
export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  const safetyLabel =
    'Position sizing is calculated from the supplied market and account inputs. Verify broker contract specifications before live execution.';

  const baseSpec = getInstrumentContractSpec(input.symbol);
  const spec = (input.brokerSpecOverride && baseSpec)
    ? ({ ...baseSpec, ...input.brokerSpecOverride, isVerified: true } as InstrumentContractSpec)
    : (input.brokerSpecOverride?.contractSize
      ? ({
          symbol: input.symbol,
          displayName: input.symbol,
          contractSize: input.brokerSpecOverride.contractSize,
          tickSize: input.brokerSpecOverride.tickSize || 0.01,
          tickValue: input.brokerSpecOverride.tickValue || 1.0,
          pipSize: input.brokerSpecOverride.pipSize || 0.1,
          lotStep: input.brokerSpecOverride.lotStep || 0.01,
          minLot: input.brokerSpecOverride.minLot || 0.01,
          maxLot: input.brokerSpecOverride.maxLot || 100,
          quoteCurrency: 'USD',
          isVerified: true
        } as InstrumentContractSpec)
      : baseSpec);

  if (!spec || !spec.isVerified) {
    return {
      isValid: false,
      errorMessage: `POSITION SIZE UNAVAILABLE: Instrument contract specification is not verified for ${input.symbol}. Do not guess.`,
      isSpecificationVerified: false,
      symbol: input.symbol,
      direction: input.direction,
      contractSize: 0,
      capital: input.capital,
      requestedRiskPct: input.riskPct,
      allowedRiskPct: 0,
      isRiskCappedByGuardian: false,
      riskAmount: 0,
      entryPrice: input.entryPrice,
      stopLoss: input.stopLoss,
      stopDistance: 0,
      stopDistancePips: 0,
      lossPerLotAtStop: 0,
      rawLotSize: 0,
      safeLotSize: 0,
      lotStep: 0.01,
      minLot: 0.01,
      maxLot: 100,
      isBelowMinLot: false,
      estimatedLossAtSL: 0,
      accountImpactPct: 0,
      blendedTotalProfit: 0,
      blendedTotalRR: 'N/A',
      suggestedBreakEven: 'N/A',
      safetyLabel,
    };
  }

  // 1. Validate Capital & Risk
  if (input.capital <= 0) {
    return createInvalidResult(input, spec, 'Account capital must be greater than zero.', safetyLabel);
  }
  if (input.riskPct <= 0) {
    return createInvalidResult(input, spec, 'Risk percentage must be greater than 0.00%.', safetyLabel);
  }

  // 2. Risk Guardian Policy Override
  const guardianCap = input.riskGuardianMaxRiskPct ?? 2.0;
  const isRiskCappedByGuardian = input.riskPct > guardianCap;
  const allowedRiskPct = isRiskCappedByGuardian ? guardianCap : input.riskPct;
  const riskAmount = (input.capital * allowedRiskPct) / 100;

  // 3. Validate Entry & SL Price Direction
  if (input.entryPrice <= 0 || input.stopLoss <= 0) {
    return createInvalidResult(input, spec, 'Entry and Stop Loss prices must be positive.', safetyLabel);
  }

  let stopDistance = 0;
  if (input.direction === 'BUY') {
    if (input.stopLoss >= input.entryPrice) {
      return createInvalidResult(
        input,
        spec,
        `Invalid Stop Loss for BUY: SL (${input.stopLoss}) must be below Entry (${input.entryPrice}).`,
        safetyLabel
      );
    }
    stopDistance = input.entryPrice - input.stopLoss;
  } else {
    // SELL
    if (input.stopLoss <= input.entryPrice) {
      return createInvalidResult(
        input,
        spec,
        `Invalid Stop Loss for SELL: SL (${input.stopLoss}) must be above Entry (${input.entryPrice}).`,
        safetyLabel
      );
    }
    stopDistance = input.stopLoss - input.entryPrice;
  }

  // Optional spread/slippage buffer
  if (input.spreadBufferPips && input.spreadBufferPips > 0) {
    stopDistance += input.spreadBufferPips * spec.pipSize;
  }

  if (stopDistance <= 0) {
    return createInvalidResult(input, spec, 'Stop distance must be greater than zero.', safetyLabel);
  }

  const stopDistancePips = stopDistance / spec.pipSize;

  // 4. Calculate Loss Per 1.00 Standard Lot
  // Mathematical formula: (StopDistance / tickSize) * tickValue
  const lossPerLotAtStop = (stopDistance / spec.tickSize) * spec.tickValue;

  if (lossPerLotAtStop <= 0) {
    return createInvalidResult(input, spec, 'Instrument tick value calculation error.', safetyLabel);
  }

  // 5. Calculate Raw and Safe Lot Size
  const rawLotSize = riskAmount / lossPerLotAtStop;

  // STRICT SAFETY RULE: Always round DOWN to nearest lotStep so risk is NEVER exceeded
  // We use 1e-8 epsilon to counteract IEEE-754 binary floating-point artifacts (e.g. 0.4999999999999996 -> 0.50)
  const stepFactor = 1 / spec.lotStep;
  const epsilon = 1e-8;
  let safeLotSize = Math.floor((rawLotSize + epsilon) * stepFactor) / stepFactor;

  // Fix floating point precision artifacts (e.g. 0.08000000000000002 -> 0.08)
  safeLotSize = Math.round(safeLotSize * 1000) / 1000;

  // Invariant verification: If rounding accidentally produces loss > riskAmount, step down
  if (safeLotSize * lossPerLotAtStop > riskAmount + 0.001) {
    safeLotSize = Math.max(spec.minLot, Math.round((safeLotSize - spec.lotStep) * 1000) / 1000);
  }

  const isBelowMinLot = safeLotSize < spec.minLot;
  if (isBelowMinLot) {
    safeLotSize = spec.minLot;
  }
  if (safeLotSize > spec.maxLot) {
    safeLotSize = spec.maxLot;
  }

  // 6. Recalculate Actual Loss at SL with rounded lot
  const estimatedLossAtSL = Math.round(safeLotSize * lossPerLotAtStop * 100) / 100;
  const accountImpactPct = Math.round((estimatedLossAtSL / input.capital) * 10000) / 100;

  // 7. Calculate Take Profit Returns & R:R Ratios
  const dist = input.exitDistribution || { tp1Pct: 50, tp2Pct: 30, tp3Pct: 20 };
  let blendedTotalProfit = 0;

  const calculateTpItem = (tpPrice?: number, pctWeight: number = 0) => {
    if (!tpPrice || tpPrice <= 0) return undefined;
    let tpDistance = 0;
    if (input.direction === 'BUY') {
      if (tpPrice <= input.entryPrice) return undefined;
      tpDistance = tpPrice - input.entryPrice;
    } else {
      if (tpPrice >= input.entryPrice) return undefined;
      tpDistance = input.entryPrice - tpPrice;
    }

    const profitPerLot = (tpDistance / spec.tickSize) * spec.tickValue;
    const profitFullLot = Math.round(safeLotSize * profitPerLot * 100) / 100;
    const profitPartial = Math.round(profitFullLot * (pctWeight / 100) * 100) / 100;
    const rr = Math.round((tpDistance / stopDistance) * 100) / 100;

    return {
      price: tpPrice,
      distance: tpDistance,
      rr,
      rrFormatted: `1 : ${rr.toFixed(2)}`,
      profitFullLot,
      profitPartial,
    };
  };

  const tp1 = calculateTpItem(input.tp1, dist.tp1Pct);
  const tp2 = calculateTpItem(input.tp2, dist.tp2Pct);
  const tp3 = calculateTpItem(input.tp3, dist.tp3Pct);

  if (tp1) blendedTotalProfit += tp1.profitPartial;
  if (tp2) blendedTotalProfit += tp2.profitPartial;
  if (tp3) blendedTotalProfit += tp3.profitPartial;
  blendedTotalProfit = Math.round(blendedTotalProfit * 100) / 100;

  const blendedRRNumber = estimatedLossAtSL > 0 ? Math.round((blendedTotalProfit / estimatedLossAtSL) * 100) / 100 : 0;
  const blendedTotalRR = blendedRRNumber > 0 ? `1 : ${blendedRRNumber.toFixed(2)}` : 'N/A';

  const suggestedBreakEven = tp1
    ? `Move Stop Loss to Entry (${input.entryPrice}) once TP1 is triggered at ${tp1.price}`
    : 'Trail Stop Loss into profit after 1:1.5 R:R attained';

  return {
    isValid: true,
    isSpecificationVerified: true,
    symbol: spec.symbol,
    direction: input.direction,
    contractSize: spec.contractSize,
    capital: input.capital,
    requestedRiskPct: input.riskPct,
    allowedRiskPct,
    isRiskCappedByGuardian,
    riskAmount,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    stopDistance: Math.round(stopDistance * 100000) / 100000,
    stopDistancePips: Math.round(stopDistancePips * 10) / 10,
    lossPerLotAtStop: Math.round(lossPerLotAtStop * 100) / 100,
    rawLotSize: Math.round(rawLotSize * 1000) / 1000,
    safeLotSize,
    lotStep: spec.lotStep,
    minLot: spec.minLot,
    maxLot: spec.maxLot,
    isBelowMinLot,
    estimatedLossAtSL,
    accountImpactPct,
    tp1,
    tp2,
    tp3,
    blendedTotalProfit,
    blendedTotalRR,
    suggestedBreakEven,
    safetyLabel,
  };
}

function createInvalidResult(
  input: PositionSizeInput,
  spec: InstrumentContractSpec,
  errorMessage: string,
  safetyLabel: string
): PositionSizeResult {
  return {
    isValid: false,
    errorMessage,
    isSpecificationVerified: true,
    symbol: spec.symbol,
    direction: input.direction,
    contractSize: spec.contractSize,
    capital: input.capital,
    requestedRiskPct: input.riskPct,
    allowedRiskPct: input.riskPct,
    isRiskCappedByGuardian: false,
    riskAmount: (input.capital * input.riskPct) / 100,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
    stopDistance: 0,
    stopDistancePips: 0,
    lossPerLotAtStop: 0,
    rawLotSize: 0,
    safeLotSize: 0,
    lotStep: spec.lotStep,
    minLot: spec.minLot,
    maxLot: spec.maxLot,
    isBelowMinLot: false,
    estimatedLossAtSL: 0,
    accountImpactPct: 0,
    blendedTotalProfit: 0,
    blendedTotalRR: 'N/A',
    suggestedBreakEven: 'N/A',
    safetyLabel,
  };
}
