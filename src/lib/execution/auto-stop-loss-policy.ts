/**
 * FEF CORTEX — CENTRAL ASSET-AWARE AUTOMATIC STOP LOSS POLICY
 * 
 * Master Policy Rules:
 * 1. XAUUSD / GOLD: Fixed mandatory rule of EXACTLY 50 GOLD PIPS ($5.000 price distance on 100 oz contract).
 *    Never applies Gold's 50-pip distance blindly to other markets.
 * 2. FOREX: Asset-appropriate volatility-adaptive protective SL in PIPS respecting symbol pip size,
 *    digits, tick size, broker stop level, and JPY pair conventions (0.01 pip size).
 * 3. INDICES: Broker-valid protection in index POINTS/TICKS (never labelled "Gold pips") bounded by index volatility.
 * 4. CRYPTO: Volatility-aware protection in USD (e.g. BTCUSD, ETHUSD, SOLUSD) adapted to actual crypto volatility.
 * 5. COMMODITIES / OTHER METALS: Own contract/tick structure (XAGUSD, USOIL, UKOIL, NATGAS) in USD/ticks.
 * 6. CENTRAL POLICY: Single canonical function used identically by Cockpit, TradingView dock, and Order API.
 * 7. BROKER COMPLIANCE: If broker stopsLevel requires a larger distance, the stop is safely adjusted fail-closed.
 */

export type AssetClass = 'METALS' | 'FOREX' | 'INDICES' | 'CRYPTO' | 'COMMODITIES';

export type OrderSide = 'BUY' | 'SELL';

export type AutoStopLossMethod =
  | 'XAUUSD_FIXED_50_PIPS'
  | 'FOREX_VOLATILITY_ADAPTIVE'
  | 'INDEX_VOLATILITY_ADAPTIVE'
  | 'CRYPTO_VOLATILITY_ADAPTIVE'
  | 'COMMODITY_VOLATILITY_ADAPTIVE';

export type DistanceUnit = 'PIPS' | 'POINTS' | 'USD';

export interface BrokerSpecInput {
  digits?: number;
  point?: number;
  tickSize?: number;
  stopsLevel?: number; // in broker points
  freezeLevel?: number; // in broker points
  contractSize?: number;
}

export interface VerifiedVolatilityInput {
  atr?: number; // In price units (e.g. 0.0022 for EURUSD, 45.0 for US100, 450.0 for BTCUSD)
  timeframe?: string;
  sampleCount?: number;
  annualizedVolatilityPct?: number;
}

export interface CalculateAutoStopLossParams {
  symbol: string;
  assetClass?: AssetClass;
  side: OrderSide;
  executionPrice: number;
  brokerSpec?: BrokerSpecInput | null;
  verifiedVolatility?: VerifiedVolatilityInput | null;
}

export interface AutomaticStopLossResult {
  symbol: string;
  assetClass: AssetClass;
  side: OrderSide;
  executionPrice: number;
  stopLossPrice: number;
  distance: number; // In distanceUnit (e.g. 50 pips, 50 points, 488.00 USD)
  distancePrice: number; // Absolute price difference |executionPrice - stopLossPrice|
  distanceUnit: DistanceUnit; // 'PIPS' | 'POINTS' | 'USD'
  method: AutoStopLossMethod;
  brokerAdjusted: boolean; // True if broker stopsLevel enforced a wider distance
  minBrokerDistancePrice: number; // Broker minimum stop distance in price units
  digits: number;
  point: number;
  tickSize: number;
  formattedDisplay: string; // e.g. "50.0 PIPS", "25.0 PIPS", "50.0 POINTS", "$488.00"
  volatilityAtrUsed?: number | null;
}

/**
 * Determine asset class from symbol if not explicitly provided
 */
export function resolveAssetClass(symbol: string): AssetClass {
  const s = symbol.trim().toUpperCase();
  if (s === 'XAUUSD' || s === 'XAGUSD' || s.startsWith('XAU') || s.startsWith('XAG')) {
    return 'METALS';
  }
  if (
    ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD', 'BTC', 'ETH', 'SOL', 'XRP', 'BNB'].some((c) =>
      s.includes(c)
    )
  ) {
    return 'CRYPTO';
  }
  if (
    [
      'US100',
      'US500',
      'US30',
      'GER40',
      'UK100',
      'JP225',
      'USTEC',
      'NAS100',
      'SPX500',
      'DAX40',
      'DJ30',
      'FTSE100',
      'NIKKEI',
    ].some((idx) => s === idx || s.includes(idx))
  ) {
    return 'INDICES';
  }
  if (
    ['USOIL', 'UKOIL', 'NATGAS', 'XNGUSD', 'BRENT', 'WTI', 'CRUDE', 'GAS'].some(
      (cmd) => s === cmd || s.includes(cmd)
    )
  ) {
    return 'COMMODITIES';
  }
  return 'FOREX';
}

/**
 * Institutional Default Contract & Pip Properties per Symbol
 */
interface DefaultSymbolSpec {
  digits: number;
  point: number;
  tickSize: number;
  pipSize: number;
}

function getDefaultSpecForSymbol(symbol: string, assetClass: AssetClass): DefaultSymbolSpec {
  const s = symbol.trim().toUpperCase();

  // Metals
  if (s === 'XAUUSD') return { digits: 3, point: 0.001, tickSize: 0.001, pipSize: 0.1 };
  if (s === 'XAGUSD') return { digits: 3, point: 0.001, tickSize: 0.001, pipSize: 0.01 };

  // Forex JPY
  if (s.endsWith('JPY')) return { digits: 3, point: 0.001, tickSize: 0.001, pipSize: 0.01 };

  // Forex Standard Majors
  if (assetClass === 'FOREX') return { digits: 5, point: 0.00001, tickSize: 0.00001, pipSize: 0.0001 };

  // Indices
  if (s === 'US100' || s === 'USTEC' || s === 'NAS100') return { digits: 2, point: 0.01, tickSize: 0.01, pipSize: 1.0 };
  if (s === 'US500' || s === 'SPX500') return { digits: 2, point: 0.01, tickSize: 0.01, pipSize: 1.0 };
  if (s === 'US30' || s === 'DJ30') return { digits: 2, point: 0.01, tickSize: 0.01, pipSize: 1.0 };
  if (s === 'GER40' || s === 'DAX40') return { digits: 2, point: 0.01, tickSize: 0.01, pipSize: 1.0 };
  if (s === 'UK100') return { digits: 2, point: 0.01, tickSize: 0.01, pipSize: 1.0 };
  if (s === 'JP225') return { digits: 2, point: 0.01, tickSize: 0.01, pipSize: 1.0 };

  // Crypto
  if (s === 'BTCUSD') return { digits: 2, point: 0.01, tickSize: 0.01, pipSize: 1.0 };
  if (s === 'ETHUSD') return { digits: 2, point: 0.01, tickSize: 0.01, pipSize: 1.0 };
  if (s === 'SOLUSD') return { digits: 4, point: 0.0001, tickSize: 0.0001, pipSize: 0.1 };
  if (s === 'XRPUSD') return { digits: 5, point: 0.00001, tickSize: 0.00001, pipSize: 0.001 };
  if (s === 'BNBUSD') return { digits: 3, point: 0.001, tickSize: 0.001, pipSize: 0.1 };

  // Commodities
  if (s === 'USOIL' || s === 'UKOIL' || s === 'WTI' || s === 'BRENT') return { digits: 3, point: 0.001, tickSize: 0.001, pipSize: 0.01 };
  if (s === 'NATGAS' || s === 'XNGUSD') return { digits: 4, point: 0.0001, tickSize: 0.0001, pipSize: 0.001 };

  return { digits: 5, point: 0.00001, tickSize: 0.00001, pipSize: 0.0001 };
}

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round((val + Number.EPSILON) * factor) / factor;
}

/**
 * CENTRAL ASSET-AWARE AUTOMATIC STOP LOSS CALCULATOR
 * 
 * Computes the exact protective stop loss price and metadata for any instrument.
 */
export function calculateAutomaticStopLoss(
  params: CalculateAutoStopLossParams
): AutomaticStopLossResult {
  const { symbol, side, executionPrice, brokerSpec, verifiedVolatility } = params;
  const assetClass = params.assetClass || resolveAssetClass(symbol);
  const upperSym = symbol.trim().toUpperCase();

  // 1. Resolve Broker Specification Details
  const defaultSpec = getDefaultSpecForSymbol(upperSym, assetClass);
  const digits = typeof brokerSpec?.digits === 'number' && brokerSpec.digits >= 0 ? brokerSpec.digits : defaultSpec.digits;
  const point = typeof brokerSpec?.point === 'number' && brokerSpec.point > 0 ? brokerSpec.point : defaultSpec.point;
  const tickSize = typeof brokerSpec?.tickSize === 'number' && brokerSpec.tickSize > 0 ? brokerSpec.tickSize : defaultSpec.tickSize;
  const stopsLevel = typeof brokerSpec?.stopsLevel === 'number' ? Math.max(0, brokerSpec.stopsLevel) : 0;
  const minBrokerDistancePrice = stopsLevel > 0 ? stopsLevel * point : 0;

  let distancePrice = 0;
  let distance = 0;
  let distanceUnit: DistanceUnit = 'PIPS';
  let method: AutoStopLossMethod = 'FOREX_VOLATILITY_ADAPTIVE';
  let formattedDisplay = '';
  let volatilityAtrUsed: number | null = null;

  // =========================================================================
  // 1. XAUUSD / GOLD — MANDATORY FIXED 50 GOLD PIPS RULE
  // =========================================================================
  if (upperSym === 'XAUUSD' || (assetClass === 'METALS' && upperSym.includes('XAU'))) {
    method = 'XAUUSD_FIXED_50_PIPS';
    distanceUnit = 'PIPS';
    distance = 50.0;

    // Pip math for Gold:
    // 1 Gold pip = $0.10 (10 cents of price move on 100 oz contract)
    // 50 Gold pips = 50 * $0.10 = $5.000 price distance
    // On 3-digit broker (point = 0.001): $5.000 = 5,000 broker points
    // On 2-digit broker (point = 0.01): $5.000 = 500 broker points
    const goldPipPrice = defaultSpec.pipSize || 0.10;
    distancePrice = 50.0 * goldPipPrice; // Exactly 5.000 dollars
    formattedDisplay = '50.0 PIPS';
  }

  // =========================================================================
  // 2. FOREX — ASSET-APPROPRIATE VOLATILITY-ADAPTIVE SL
  // =========================================================================
  else if (assetClass === 'FOREX') {
    method = 'FOREX_VOLATILITY_ADAPTIVE';
    distanceUnit = 'PIPS';
    const pipSize = defaultSpec.pipSize;
    const isJpy = upperSym.endsWith('JPY');

    // Bounds in pips: prevent abnormal ATR from producing an absurd stop
    const minPips = isJpy ? 15.0 : 12.0;
    const maxPips = isJpy ? 45.0 : 35.0;
    const defaultBaselinePips = isJpy ? 25.0 : 20.0;

    const rawAtr = verifiedVolatility?.atr;
    if (rawAtr && rawAtr > 0) {
      volatilityAtrUsed = rawAtr;
      const atrPips = rawAtr / pipSize;
      const adaptivePips = Math.round(atrPips * 1.25);
      distance = Math.min(Math.max(adaptivePips, minPips), maxPips);
    } else {
      distance = defaultBaselinePips;
    }

    distancePrice = distance * pipSize;
    formattedDisplay = `${distance.toFixed(1)} PIPS`;
  }

  // =========================================================================
  // 3. INDICES — BROKER-VALID INDEX POINTS / TICKS
  // =========================================================================
  else if (assetClass === 'INDICES') {
    method = 'INDEX_VOLATILITY_ADAPTIVE';
    distanceUnit = 'POINTS';

    // Bounded corridors per specific index
    let minPoints = 30.0;
    let maxPoints = 100.0;
    let baselinePoints = 50.0;

    if (upperSym.includes('US500') || upperSym.includes('SPX')) {
      minPoints = 10.0;
      maxPoints = 30.0;
      baselinePoints = 15.0;
    } else if (upperSym.includes('US30') || upperSym.includes('DJ')) {
      minPoints = 80.0;
      maxPoints = 250.0;
      baselinePoints = 120.0;
    } else if (upperSym.includes('GER40') || upperSym.includes('DAX')) {
      minPoints = 40.0;
      maxPoints = 120.0;
      baselinePoints = 60.0;
    } else if (upperSym.includes('UK100') || upperSym.includes('FTSE')) {
      minPoints = 25.0;
      maxPoints = 70.0;
      baselinePoints = 35.0;
    } else if (upperSym.includes('JP225') || upperSym.includes('NIKKEI')) {
      minPoints = 100.0;
      maxPoints = 350.0;
      baselinePoints = 150.0;
    }

    const rawAtr = verifiedVolatility?.atr;
    if (rawAtr && rawAtr > 0) {
      volatilityAtrUsed = rawAtr;
      const adaptivePoints = Math.round(rawAtr * 1.2);
      distance = Math.min(Math.max(adaptivePoints, minPoints), maxPoints);
    } else {
      distance = baselinePoints;
    }

    distancePrice = distance;
    formattedDisplay = `${distance.toFixed(1)} POINTS`;
  }

  // =========================================================================
  // 4. CRYPTO — VOLATILITY-AWARE PROTECTION IN USD
  // =========================================================================
  else if (assetClass === 'CRYPTO') {
    method = 'CRYPTO_VOLATILITY_ADAPTIVE';
    distanceUnit = 'USD';

    // Crypto volatility is materially different from Forex and Gold
    // Clamped strictly to a defensible percentage of price (0.4% - 2.0%)
    const minPct = 0.004; // 0.4%
    const maxPct = 0.020; // 2.0%
    const defaultPct = upperSym.includes('BTC') ? 0.006 : 0.008; // 0.6% BTC, 0.8% others

    const rawAtr = verifiedVolatility?.atr;
    if (rawAtr && rawAtr > 0) {
      volatilityAtrUsed = rawAtr;
      const adaptivePrice = rawAtr * 1.2;
      const minDollar = executionPrice * minPct;
      const maxDollar = executionPrice * maxPct;
      distancePrice = Math.min(Math.max(adaptivePrice, minDollar), maxDollar);
    } else {
      distancePrice = executionPrice * defaultPct;
    }

    // Round to tickSize or digits
    distancePrice = roundTo(distancePrice, digits);
    distance = distancePrice;
    formattedDisplay = `$${distancePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
  }

  // =========================================================================
  // 5. OTHER METALS / COMMODITIES (XAGUSD, USOIL, UKOIL, NATGAS)
  // =========================================================================
  else {
    method = 'COMMODITY_VOLATILITY_ADAPTIVE';
    distanceUnit = 'USD';

    let minPrice = 0.40;
    let maxPrice = 1.50;
    let baselinePrice = 0.75;

    if (upperSym === 'XAGUSD' || upperSym.includes('XAG')) {
      // Silver: trades $30-$60, 20-80 cents
      minPrice = 0.20;
      maxPrice = 0.80;
      baselinePrice = 0.35;
    } else if (upperSym === 'NATGAS' || upperSym === 'XNGUSD') {
      // Natural Gas: trades $2.50-$4.50, 4-18 cents
      minPrice = 0.04;
      maxPrice = 0.18;
      baselinePrice = 0.08;
    }

    const rawAtr = verifiedVolatility?.atr;
    if (rawAtr && rawAtr > 0) {
      volatilityAtrUsed = rawAtr;
      const adaptivePrice = rawAtr * 1.2;
      distancePrice = Math.min(Math.max(adaptivePrice, minPrice), maxPrice);
    } else {
      distancePrice = baselinePrice;
    }

    distancePrice = roundTo(distancePrice, digits);
    distance = distancePrice;
    formattedDisplay = `$${distancePrice.toFixed(digits)}`;
  }

  // =========================================================================
  // 6. BROKER CONSTRAINT ADJUSTMENT (stopsLevel fail-closed protection)
  // =========================================================================
  let brokerAdjusted = false;
  if (minBrokerDistancePrice > 0 && distancePrice < minBrokerDistancePrice) {
    distancePrice = minBrokerDistancePrice;
    brokerAdjusted = true;
    if (distanceUnit === 'PIPS') {
      distance = distancePrice / (defaultSpec.pipSize || point * 10);
      formattedDisplay = `${distance.toFixed(1)} PIPS (BROKER MIN)`;
    } else if (distanceUnit === 'POINTS') {
      distance = distancePrice;
      formattedDisplay = `${distance.toFixed(1)} POINTS (BROKER MIN)`;
    } else {
      distance = distancePrice;
      formattedDisplay = `$${distancePrice.toFixed(digits)} (BROKER MIN)`;
    }
  }

  // =========================================================================
  // 7. FINAL DIRECTIONAL STOP LOSS CALCULATION
  // =========================================================================
  let stopLossPrice = 0;
  if (side === 'BUY') {
    stopLossPrice = roundTo(executionPrice - distancePrice, digits);
  } else {
    stopLossPrice = roundTo(executionPrice + distancePrice, digits);
  }

  return {
    symbol: upperSym,
    assetClass,
    side,
    executionPrice,
    stopLossPrice,
    distance,
    distancePrice: roundTo(distancePrice, digits),
    distanceUnit,
    method,
    brokerAdjusted,
    minBrokerDistancePrice,
    digits,
    point,
    tickSize,
    formattedDisplay,
    volatilityAtrUsed,
  };
}

