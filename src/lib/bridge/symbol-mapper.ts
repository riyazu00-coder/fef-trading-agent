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
  XAUUSD: ['XAUUSD', 'XAUUSDm', 'XAUUSD.r', 'XAUUSD.a', 'XAUUSDc', 'GOLD', 'GOLDm', 'XAUUSD_i'],
  XAGUSD: ['XAGUSD', 'XAGUSDm', 'XAGUSD.r', 'XAGUSD.a', 'XAGUSDc', 'SILVER', 'SILVERm'],
  EURUSD: ['EURUSD', 'EURUSDm', 'EURUSD.r', 'EURUSD.a', 'EURUSDc', 'EURUSD_i'],
  GBPUSD: ['GBPUSD', 'GBPUSDm', 'GBPUSD.r', 'GBPUSD.a', 'GBPUSDc', 'GBPUSD_i'],
  USDJPY: ['USDJPY', 'USDJPYm', 'USDJPY.r', 'USDJPY.a', 'USDJPYc', 'USDJPY_i'],
  GBPJPY: ['GBPJPY', 'GBPJPYm', 'GBPJPY.r', 'GBPJPY.a', 'GBPJPYc'],
  AUDUSD: ['AUDUSD', 'AUDUSDm', 'AUDUSD.r', 'AUDUSD.a', 'AUDUSDc'],
  NZDUSD: ['NZDUSD', 'NZDUSDm', 'NZDUSD.r', 'NZDUSD.a', 'NZDUSDc'],
  USOIL: ['USOIL', 'USOILm', 'USOIL.r', 'USOIL.a', 'USOILc', 'WTI', 'WTICRUDE', 'CRUDE'],
  US100: ['US100', 'US100m', 'USTEC', 'USTECm', 'USTEC.a', 'NAS100', 'NAS100m', 'NQ'],
  US30: ['US30', 'US30m', 'US30.r', 'US30.a', 'DJ30', 'WS30', 'YM'],
  US500: ['US500', 'US500m', 'US500.r', 'US500.a', 'SPX500', 'SP500', 'ES'],
  BTCUSD: ['BTCUSD', 'BTCUSDm', 'BTCUSDT', 'BTCUSD.r', 'BTCUSD.a', 'BTCUSDc'],
  ETHUSD: ['ETHUSD', 'ETHUSDm', 'ETHUSDT', 'ETHUSD.r', 'ETHUSD.a', 'ETHUSDc'],
  SOLUSD: ['SOLUSD', 'SOLUSDm', 'SOLUSDT', 'SOLUSD.r', 'SOLUSD.a', 'SOLUSDc']
};

class BrokerSymbolDirectory {
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
    this.specs.set(spec.brokerSymbol, spec);
    if (spec.canonicalSymbol) {
      this.specs.set(spec.canonicalSymbol, spec);
    }
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
    if (this.brokerToCanonical.has(brokerSymbol)) {
      return this.brokerToCanonical.get(brokerSymbol)!;
    }
    // Check if broker symbol matches any alias list
    for (const [canonical, aliases] of Object.entries(CANONICAL_SYMBOL_MAPPINGS)) {
      if (aliases.includes(brokerSymbol)) {
        return canonical;
      }
    }

    // Dynamic suffix stripping fallback (e.g., XAUUSDm, XAUUSD.a, XAUUSDc -> XAUUSD)
    const cleanSym = brokerSymbol.replace(/m|\.a|\.r|c|_i$/i, '');
    if (CANONICAL_SYMBOL_MAPPINGS[cleanSym]) {
      return cleanSym;
    }

    return brokerSymbol;
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
