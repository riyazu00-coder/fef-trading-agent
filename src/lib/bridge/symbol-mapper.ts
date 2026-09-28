/**
 * FEF TRADING SOLUTIONS — BROKER SYMBOL MAPPER & CONTRACT SPEC CACHE
 * 
 * Maps canonical FEF symbols to broker-specific symbols (e.g. Exness Standard vs Raw accounts)
 * and maintains authoritative contract specifications.
 */

import { MT5SymbolSpecification } from './mt5-bridge-protocol';

export interface BrokerSymbolCandidate {
  canonical: string;
  brokerAliases: string[];
}

export const CANONICAL_SYMBOL_MAPPINGS: Record<string, string[]> = {
  XAUUSD: ['XAUUSD', 'XAUUSDm', 'XAUUSD.r', 'XAUUSD.a', 'XAUUSDc', 'GOLD', 'GOLDm', 'XAUUSD_i', 'XAUUSD.pro', 'XAUUSD.ecn', 'XAUUSD+', 'XAUUSD.raw', 'GOLD.pro', 'GOLD.ecn', 'XAU/USD'],
  XAGUSD: ['XAGUSD', 'XAGUSDm', 'XAGUSD.r', 'XAGUSD.a', 'XAGUSDc', 'SILVER', 'SILVERm', 'XAGUSD.pro', 'XAGUSD.ecn', 'XAGUSD+', 'XAGUSD.raw', 'SILVER.pro', 'SILVER.ecn', 'XAG/USD'],
  EURUSD: ['EURUSD', 'EURUSDm', 'EURUSD.r', 'EURUSD.a', 'EURUSDc', 'EURUSD_i', 'EURUSD.pro', 'EURUSD.ecn', 'EURUSD+', 'EURUSD.raw', 'EUR/USD'],
  GBPUSD: ['GBPUSD', 'GBPUSDm', 'GBPUSD.r', 'GBPUSD.a', 'GBPUSDc', 'GBPUSD_i', 'GBPUSD.pro', 'GBPUSD.ecn', 'GBPUSD+', 'GBPUSD.raw', 'GBP/USD'],
  USDJPY: ['USDJPY', 'USDJPYm', 'USDJPY.r', 'USDJPY.a', 'USDJPYc', 'USDJPY_i', 'USDJPY.pro', 'USDJPY.ecn', 'USDJPY+', 'USDJPY.raw', 'USD/JPY'],
  GBPJPY: ['GBPJPY', 'GBPJPYm', 'GBPJPY.r', 'GBPJPY.a', 'GBPJPYc', 'GBPJPY.pro', 'GBPJPY.ecn', 'GBPJPY+', 'GBPJPY.raw', 'GBP/JPY'],
  AUDUSD: ['AUDUSD', 'AUDUSDm', 'AUDUSD.r', 'AUDUSD.a', 'AUDUSDc', 'AUDUSD.pro', 'AUDUSD.ecn', 'AUDUSD+', 'AUDUSD.raw', 'AUD/USD'],
  NZDUSD: ['NZDUSD', 'NZDUSDm', 'NZDUSD.r', 'NZDUSD.a', 'NZDUSDc', 'NZDUSD.pro', 'NZDUSD.ecn', 'NZDUSD+', 'NZDUSD.raw', 'NZD/USD'],
  USDCAD: ['USDCAD', 'USDCADm', 'USDCAD.r', 'USDCAD.a', 'USDCADc', 'USDCAD.pro', 'USDCAD.ecn', 'USDCAD+', 'USDCAD.raw', 'USD/CAD'],
  USDCHF: ['USDCHF', 'USDCHFm', 'USDCHF.r', 'USDCHF.a', 'USDCHFc', 'USDCHF.pro', 'USDCHF.ecn', 'USDCHF+', 'USDCHF.raw', 'USD/CHF'],
  USOIL: ['USOIL', 'USOILm', 'USOIL.r', 'USOIL.a', 'USOILc', 'WTI', 'WTICRUDE', 'CRUDE', 'USOIL.pro', 'USOIL.ecn', 'WTI.pro', 'CL', 'XTIUSD'],
  UKOIL: ['UKOIL', 'UKOILm', 'UKOIL.r', 'UKOIL.a', 'BRENT', 'BRENTCRUDE', 'UKOIL.pro', 'CO', 'XBRUSD'],
  US100: ['US100', 'US100m', 'USTEC', 'USTECm', 'USTEC.a', 'NAS100', 'NAS100m', 'NQ', 'US100.pro', 'US100.ecn', 'US100Cash', 'USTEC.pro', 'NAS100.pro'],
  US30: ['US30', 'US30m', 'US30.r', 'US30.a', 'DJ30', 'WS30', 'YM', 'US30.pro', 'US30.ecn', 'US30Cash', 'DJ30.pro'],
  US500: ['US500', 'US500m', 'US500.r', 'US500.a', 'SPX500', 'SP500', 'ES', 'US500.pro', 'US500.ecn', 'US500Cash', 'SPX500.pro'],
  BTCUSD: ['BTCUSD', 'BTCUSDm', 'BTCUSDT', 'BTCUSD.r', 'BTCUSD.a', 'BTCUSDc', 'BTCUSD.pro', 'BTCUSD.ecn', 'BTC/USD', 'BTCUSD+'],
  ETHUSD: ['ETHUSD', 'ETHUSDm', 'ETHUSDT', 'ETHUSD.r', 'ETHUSD.a', 'ETHUSDc', 'ETHUSD.pro', 'ETHUSD.ecn', 'ETH/USD', 'ETHUSD+'],
  SOLUSD: ['SOLUSD', 'SOLUSDm', 'SOLUSDT', 'SOLUSD.r', 'SOLUSD.a', 'SOLUSDc', 'SOLUSD.pro', 'SOLUSD.ecn', 'SOL/USD', 'SOLUSD+']
};

export class BrokerSymbolDirectory {
  private canonicalToBroker: Map<string, string> = new Map();
  private brokerToCanonical: Map<string, string> = new Map();
  private specs: Map<string, MT5SymbolSpecification> = new Map();
  private availableBrokerSymbols: Set<string> = new Set();
  private isInitialized = false;

  /**
   * Hydrate mapping from live symbols returned by MT5 terminal Market Watch
   */
  public discoverFromBrokerSymbols(brokerSymbols: string[]): void {
    this.availableBrokerSymbols = new Set(brokerSymbols.map((s) => s.trim()));
    this.canonicalToBroker.clear();
    this.brokerToCanonical.clear();

    for (const [canonical, aliases] of Object.entries(CANONICAL_SYMBOL_MAPPINGS)) {
      // Find the first alias present in the broker's active symbol list
      const matched = aliases.find((alias) => this.availableBrokerSymbols.has(alias));
      if (matched) {
        this.canonicalToBroker.set(canonical, matched);
        this.brokerToCanonical.set(matched, canonical);
      }
    }

    this.isInitialized = true;
  }

  /**
   * Register or update authoritative specifications for a broker symbol
   */
  public registerSpec(spec: MT5SymbolSpecification): void {
    const enrichedSpec: MT5SymbolSpecification = {
      ...spec,
      source: spec.source || 'BROKER'
    };
    this.specs.set(enrichedSpec.brokerSymbol, enrichedSpec);
    if (enrichedSpec.canonicalSymbol) {
      this.specs.set(enrichedSpec.canonicalSymbol, enrichedSpec);
    }
  }

  /**
   * Resolve a canonical FEF ticker to the broker's specific symbol with validation
   */
  public resolveBrokerSymbolWithValidation(canonicalSymbol: string): {
    brokerSymbol: string | null;
    status: 'EXACT_MATCH' | 'ALIAS_MATCH' | 'AMBIGUOUS' | 'NOT_FOUND';
    reason?: string;
  } {
    if (!this.isInitialized || this.availableBrokerSymbols.size === 0) {
      const direct = this.toBrokerSymbol(canonicalSymbol);
      return {
        brokerSymbol: direct,
        status: direct ? 'ALIAS_MATCH' : 'NOT_FOUND',
        reason: direct ? 'Resolved from canonical static alias mapping' : 'Symbol not found in broker catalogue'
      };
    }

    const aliases = CANONICAL_SYMBOL_MAPPINGS[canonicalSymbol] || [canonicalSymbol];
    const presentMatches = aliases.filter(a => this.availableBrokerSymbols.has(a));

    if (presentMatches.length === 1) {
      return {
        brokerSymbol: presentMatches[0],
        status: presentMatches[0] === canonicalSymbol ? 'EXACT_MATCH' : 'ALIAS_MATCH'
      };
    }

    if (presentMatches.length > 1) {
      if (this.availableBrokerSymbols.has(canonicalSymbol)) {
        return {
          brokerSymbol: canonicalSymbol,
          status: 'EXACT_MATCH'
        };
      }
      return {
        brokerSymbol: null,
        status: 'AMBIGUOUS',
        reason: `SYMBOL MAPPING REQUIRED: Multiple broker symbols found for ${canonicalSymbol} (${presentMatches.join(', ')}). Explicit mapping required.`
      };
    }

    // Fallback prefix search
    const prefixMatches = Array.from(this.availableBrokerSymbols).filter(b => b.startsWith(canonicalSymbol));
    if (prefixMatches.length === 1) {
      return {
        brokerSymbol: prefixMatches[0],
        status: 'ALIAS_MATCH'
      };
    } else if (prefixMatches.length > 1) {
      return {
        brokerSymbol: null,
        status: 'AMBIGUOUS',
        reason: `SYMBOL MAPPING REQUIRED: Ambiguous broker symbol candidates (${prefixMatches.join(', ')}). Explicit confirmation required.`
      };
    }

    return {
      brokerSymbol: null,
      status: 'NOT_FOUND',
      reason: `SYMBOL NOT FOUND: No compatible broker symbol discovered for ${canonicalSymbol}.`
    };
  }

  /**
   * Resolve a canonical FEF ticker to the broker's specific symbol
   */
  public toBrokerSymbol(canonicalSymbol: string): string | null {
    if (this.canonicalToBroker.has(canonicalSymbol)) {
      return this.canonicalToBroker.get(canonicalSymbol)!;
    }
    // Fallback: If canonical is directly recognized by broker
    if (this.availableBrokerSymbols.has(canonicalSymbol)) {
      return canonicalSymbol;
    }
    // Fallback search in aliases
    const aliases = CANONICAL_SYMBOL_MAPPINGS[canonicalSymbol];
    if (aliases) {
      for (const alias of aliases) {
        if (this.availableBrokerSymbols.has(alias)) {
          return alias;
        }
      }
    }

    // Dynamic suffix detection fallback (e.g. broker has XAUUSDm, XAUUSD.a, XAUUSDc)
    for (const brokerSym of Array.from(this.availableBrokerSymbols)) {
      if (brokerSym.startsWith(canonicalSymbol)) {
        return brokerSym;
      }
    }

    return null;
  }

  /**
   * Resolve a broker symbol back to FEF canonical ticker
   */
  public toCanonicalSymbol(brokerSymbol: string): string {
    if (!brokerSymbol) return 'XAUUSD';
    const trimmed = brokerSymbol.trim();
    if (this.brokerToCanonical.has(trimmed)) {
      return this.brokerToCanonical.get(trimmed)!;
    }
    // Check if broker symbol matches any alias list
    for (const [canonical, aliases] of Object.entries(CANONICAL_SYMBOL_MAPPINGS)) {
      if (aliases.includes(trimmed)) {
        return canonical;
      }
    }

    // Dynamic prefix and suffix stripping fallback
    // e.g. m_XAUUSD, i_EURUSD, XAUUSDm, XAUUSD.a, XAUUSDc, XAUUSD.pro, XAUUSD.ecn, XAUUSD.raw, XAUUSD+, XAUUSD.std, GOLD.pro
    const cleanSym = trimmed
      .replace(/^(m_|i_|c_|r_|ecn\.)/i, '')
      .replace(/(\.r|\.a|\.pro|\.ecn|\.raw|\.std|m|c|_i|\+|Cash|\.micro|_sb)$/i, '')
      .replace('/', '');

    if (CANONICAL_SYMBOL_MAPPINGS[cleanSym]) {
      return cleanSym;
    }

    // Check alias mapping against stripped symbol
    for (const [canonical, aliases] of Object.entries(CANONICAL_SYMBOL_MAPPINGS)) {
      if (aliases.includes(cleanSym)) {
        return canonical;
      }
    }

    return trimmed;
  }

  /**
   * Get authoritative specification for either canonical or broker symbol
   */
  public getSpec(symbol: string): MT5SymbolSpecification | null {
    return this.specs.get(symbol) || null;
  }

  /**
   * Check if mapping has been populated from a real MT5 session
   */
  public isReady(): boolean {
    return this.isInitialized && this.canonicalToBroker.size > 0;
  }

  /**
   * Return a summary map of all resolved symbols
   */
  public getResolvedMap(): Record<string, string> {
    const result: Record<string, string> = {};
    this.canonicalToBroker.forEach((v, k) => {
      result[k] = v;
    });
    return result;
  }
}

export const symbolDirectory = new BrokerSymbolDirectory();

/**
 * Strips common broker prefixes, suffixes, and separators to expose core symbol root.
 */
export function stripBrokerSymbolAffixes(symbol: string): string {
  if (!symbol) return '';
  return symbol
    .trim()
    .replace(/^(m_|i_|c_|r_|ecn\.)/i, '')
    .replace(/(\.r|\.a|\.pro|\.ecn|\.raw|\.std|m|c|_i|\+|Cash|\.micro|_sb)$/i, '')
    .replace('/', '');
}

/**
 * Resolves any broker symbol to its canonical FEF symbol name.
 */
export function resolveCanonicalSymbol(brokerSymbol: string): string {
  return symbolDirectory.toCanonicalSymbol(brokerSymbol);
}

export interface OrderSpecValidationResult {
  valid: boolean;
  normalizedVolume: number;
  normalizedSl?: number;
  normalizedTp?: number;
  errors: string[];
  warnings: string[];
  specUsed: boolean;
  specDetails?: {
    minLot: number;
    maxLot: number;
    lotStep: number;
    stopsLevelPoints: number;
    digits: number;
    tradeMode: string;
  };
}

/**
 * Validates and normalizes an order volume, SL, and TP against authoritative MT5 broker contract specifications.
 * Enforces:
 * 1. Volume within [minLot, maxLot] and multiple of lotStep.
 * 2. StopsLevel compliance: SL and TP distance >= stopsLevel in points.
 * 3. Trade mode: not DISABLED.
 * 4. Price formatting to broker digits.
 */
export function validateOrderAgainstSpec(params: {
  symbol: string;
  volume: number;
  sl?: number;
  tp?: number;
  entryPrice?: number;
  orderType?: string;
  spec?: MT5SymbolSpecification | null;
}): OrderSpecValidationResult {
  const { symbol, volume, sl, tp, entryPrice, orderType, spec } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  const effectiveSpec = spec || symbolDirectory.getSpec(symbol);

  if (!effectiveSpec) {
    // Spec unavailable: enforce standard prudent defaults
    warnings.push(`Contract specification unavailable for ${symbol}. Using standard fallback boundaries.`);
    const fallbackVol = Math.max(0.01, Math.min(100, Number(volume.toFixed(2))));
    return {
      valid: volume > 0 && volume <= 100,
      normalizedVolume: fallbackVol,
      normalizedSl: sl ? Number(sl.toFixed(5)) : undefined,
      normalizedTp: tp ? Number(tp.toFixed(5)) : undefined,
      errors: volume <= 0 ? ['Volume must be greater than 0'] : [],
      warnings,
      specUsed: false,
    };
  }

  // 1. Trade mode check
  if (effectiveSpec.tradeMode === 'DISABLED') {
    errors.push(`Trading is DISABLED by broker for symbol ${effectiveSpec.brokerSymbol || symbol}.`);
  }

  // 2. Volume bounds check
  const minLot = effectiveSpec.minLot || 0.01;
  const maxLot = effectiveSpec.maxLot || 100;
  const lotStep = effectiveSpec.lotStep || 0.01;

  let normVol = volume;
  if (volume < minLot) {
    errors.push(`Requested volume (${volume}) is below broker minimum lot size (${minLot}).`);
  } else if (volume > maxLot) {
    errors.push(`Requested volume (${volume}) exceeds broker maximum lot size (${maxLot}).`);
  } else {
    // Check lot step alignment
    const steps = Math.round((volume - minLot) / lotStep);
    const alignedVol = Number((minLot + steps * lotStep).toFixed(4));
    if (Math.abs(alignedVol - volume) > 0.0001) {
      warnings.push(`Volume adjusted from ${volume} to ${alignedVol} to match broker lot step (${lotStep}).`);
      normVol = alignedVol;
    }
  }

  // 3. Price formatting and stopsLevel check
  const digits = effectiveSpec.digits ?? 2;
  const point = effectiveSpec.point || Math.pow(10, -digits);
  const stopsLevelPoints = effectiveSpec.stopsLevel || 0;
  const minStopDistance = stopsLevelPoints * point;

  let normSl: number | undefined = sl != null ? Number(sl.toFixed(digits)) : undefined;
  let normTp: number | undefined = tp != null ? Number(tp.toFixed(digits)) : undefined;

  if (entryPrice && entryPrice > 0 && minStopDistance > 0) {
    if (normSl != null) {
      const slDist = Math.abs(entryPrice - normSl);
      if (slDist < minStopDistance) {
        errors.push(`Stop Loss distance (${slDist.toFixed(digits)}) is less than broker stops level minimum (${minStopDistance.toFixed(digits)} / ${stopsLevelPoints} pts).`);
      }
    }
    if (normTp != null) {
      const tpDist = Math.abs(normTp - entryPrice);
      if (tpDist < minStopDistance) {
        errors.push(`Take Profit distance (${tpDist.toFixed(digits)}) is less than broker stops level minimum (${minStopDistance.toFixed(digits)} / ${stopsLevelPoints} pts).`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    normalizedVolume: normVol,
    normalizedSl: normSl,
    normalizedTp: normTp,
    errors,
    warnings,
    specUsed: true,
    specDetails: {
      minLot,
      maxLot,
      lotStep,
      stopsLevelPoints,
      digits,
      tradeMode: effectiveSpec.tradeMode,
    },
  };
}

