/**
 * FEF CORTEX — BROKER CONTRACT SPEC REGISTRY
 * Master Consolidation V2: Grounded Contract Specifications from MT5
 */

import { BrokerContractSpec } from './types';

export class BrokerContractSpecRegistry {
  private readonly specs: Map<string, BrokerContractSpec> = new Map();

  /**
   * Register or update a symbol contract spec published by MT5 EA
   */
  public registerSpec(rawSpec: Partial<BrokerContractSpec> & { symbol: string }): { success: boolean; error?: string } {
    if (!rawSpec || !rawSpec.symbol || typeof rawSpec.symbol !== 'string') {
      return { success: false, error: 'Invalid spec: symbol is required' };
    }

    const symbol = rawSpec.symbol.trim().toUpperCase();

    // Validate required numerical attributes
    if (typeof rawSpec.digits !== 'number' || rawSpec.digits < 0 || rawSpec.digits > 8) {
      return { success: false, error: `Invalid digits for ${symbol}: ${rawSpec.digits}` };
    }
    if (typeof rawSpec.point !== 'number' || rawSpec.point <= 0) {
      return { success: false, error: `Invalid point for ${symbol}: ${rawSpec.point}` };
    }
    if (typeof rawSpec.contractSize !== 'number' || rawSpec.contractSize <= 0) {
      return { success: false, error: `Invalid contractSize for ${symbol}: ${rawSpec.contractSize}` };
    }
    if (typeof rawSpec.volumeMin !== 'number' || rawSpec.volumeMin <= 0) {
      return { success: false, error: `Invalid volumeMin for ${symbol}: ${rawSpec.volumeMin}` };
    }
    if (typeof rawSpec.volumeMax !== 'number' || rawSpec.volumeMax < rawSpec.volumeMin) {
      return { success: false, error: `Invalid volumeMax for ${symbol}: ${rawSpec.volumeMax}` };
    }
    if (typeof rawSpec.volumeStep !== 'number' || rawSpec.volumeStep <= 0) {
      return { success: false, error: `Invalid volumeStep for ${symbol}: ${rawSpec.volumeStep}` };
    }

    const validatedSpec: BrokerContractSpec = {
      symbol,
      digits: rawSpec.digits,
      point: rawSpec.point,
      contractSize: rawSpec.contractSize,
      volumeMin: rawSpec.volumeMin,
      volumeMax: rawSpec.volumeMax,
      volumeStep: rawSpec.volumeStep,
      stopsLevel: typeof rawSpec.stopsLevel === 'number' ? Math.max(0, rawSpec.stopsLevel) : 0,
      freezeLevel: typeof rawSpec.freezeLevel === 'number' ? Math.max(0, rawSpec.freezeLevel) : 0,
      marginInitial: rawSpec.marginInitial,
      currencyBase: (rawSpec.currencyBase || '').toUpperCase(),
      currencyProfit: (rawSpec.currencyProfit || 'USD').toUpperCase(),
      tradeMode: rawSpec.tradeMode,
      updatedAt: Date.now(),
    };

    this.specs.set(symbol, validatedSpec);
    return { success: true };
  }

  public getSpec(symbol: string): BrokerContractSpec | null {
    if (!symbol) return null;
    return this.specs.get(symbol.trim().toUpperCase()) || null;
  }

  public hasSpec(symbol: string): boolean {
    if (!symbol) return false;
    return this.specs.has(symbol.trim().toUpperCase());
  }

  public getAllSpecs(): BrokerContractSpec[] {
    return Array.from(this.specs.values());
  }

  public count(): number {
    return this.specs.size;
  }

  public clear(): void {
    this.specs.clear();
  }
}

export const globalContractSpecRegistry = new BrokerContractSpecRegistry();

