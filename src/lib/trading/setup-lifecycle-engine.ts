/**
 * FEF CORTEX — SETUP LIFECYCLE & ANTI-FLIP-FLOP ENGINE
 * M15/M30 Trade Opportunity Recovery Foundation
 *
 * Invariants:
 * 1. Stable setupId: Every setup possesses a stable, unique setupId.
 * 2. Terminal invalidation: Once INVALIDATED, that exact setupId can NEVER become active again.
 * 3. Market-state anti-flip-flop: A new setup in the same direction requires genuinely new
 *    structural evidence (new swing formation, new BOS, new CHOCH, or new trigger level).
 * 4. Stale protection: Blueprints where price has moved materially beyond structural relevance
 *    are strictly INVALIDATED, never silently refreshed with identical geometry.
 */

import { MarketStructure } from '../market/market-structure-engine';
import { OHLCCandle } from '../market/canonical-market-snapshot';
import { TradeBlueprint } from './trade-blueprint-engine';
import { InvalidationArchiveEntry, SetupLifecycleRecord, SetupLifecycleState } from './setup-lifecycle-types';

export class SetupLifecycleEngine {
  // Archive of permanently invalidated setups (setupId -> InvalidationArchiveEntry)
  private static readonly invalidatedRegistry = new Map<string, InvalidationArchiveEntry>();

  // Most recent invalidation per symbol and direction (symbol:direction -> InvalidationArchiveEntry)
  private static readonly lastInvalidationBySymbolDir = new Map<string, InvalidationArchiveEntry>();

  // Active lifecycle records (symbol -> SetupLifecycleRecord)
  private static readonly activeLifecycleStore = new Map<string, SetupLifecycleRecord>();

  /**
   * Resets internal lifecycle registries (for testing and isolated evaluation).
   */
  public static reset(): void {
    this.invalidatedRegistry.clear();
    this.lastInvalidationBySymbolDir.clear();
    this.activeLifecycleStore.clear();
  }

  /**
   * Generates a stable deterministic fingerprint of the current market structure.
   */
  public static computeStructureVersion(structure: MarketStructure | null): string {
    if (!structure) return 'NONE';
    const swingsCount = (structure.swingHighs?.length || 0) + (structure.swingLows?.length || 0);
    const bosCount = structure.bos?.length || 0;
    const chochCount = structure.choch?.length || 0;
    const lastHigh = structure.lastSwingHigh ?? 0;
    const lastLow = structure.lastSwingLow ?? 0;
    return `${structure.symbol}:${structure.timeframe}:${swingsCount}:${bosCount}:${chochCount}:${lastHigh.toFixed(2)}:${lastLow.toFixed(2)}`;
  }

  /**
   * Evaluates whether genuinely new structural evidence has developed since the last invalidation.
   */
  public static hasNewStructuralEvidence(
    symbol: string,
    direction: 'BUY' | 'SELL',
    currentStructure: MarketStructure | null,
    currentCandles?: OHLCCandle[]
  ): { hasNewEvidence: boolean; reason: string } {
    const key = `${symbol.toUpperCase()}:${direction}`;
    const lastInvalid = this.lastInvalidationBySymbolDir.get(key);

    if (!lastInvalid) {
      return { hasNewEvidence: true, reason: 'No prior invalidation recorded for symbol and direction.' };
    }

    if (!currentStructure) {
      return { hasNewEvidence: false, reason: 'Market structure is unavailable; cannot prove new evidence.' };
    }

    const currentVersion = this.computeStructureVersion(currentStructure);

    // 1. Check if structure version has genuinely changed
    if (currentVersion !== lastInvalid.structureVersion) {
      // Verify that the change represents a real new swing, BOS, or CHOCH
      const hasNewSwingHigh = currentStructure.lastSwingHigh != null && currentStructure.lastSwingHigh !== lastInvalid.lastKnownSwingHigh;
      const hasNewSwingLow = currentStructure.lastSwingLow != null && currentStructure.lastSwingLow !== lastInvalid.lastKnownSwingLow;

      const hasRecentBos = currentStructure.bos.some((b) => b.candleTimestamp > lastInvalid.invalidatedAt);
      const hasRecentChoch = currentStructure.choch.some((c) => c.candleTimestamp > lastInvalid.invalidatedAt);

      if (hasNewSwingHigh || hasNewSwingLow || hasRecentBos || hasRecentChoch) {
        return {
          hasNewEvidence: true,
          reason: `New structural formation detected (New Swing: ${hasNewSwingHigh || hasNewSwingLow}, New BOS: ${hasRecentBos}, New CHOCH: ${hasRecentChoch}).`,
        };
      }
    }

    // 2. Check if subsequent candles produced a new qualifying trigger
    if (currentCandles && Array.isArray(currentCandles) && currentCandles.length > 0) {
      const subsequentCandles = currentCandles.filter((c) => c.timestamp > lastInvalid.invalidatedAt);
      if (subsequentCandles.length >= 3) {
        const lastCandle = subsequentCandles[subsequentCandles.length - 1];
        if (direction === 'BUY' && lastInvalid.lastKnownSwingHigh && lastCandle.close > lastInvalid.lastKnownSwingHigh) {
          return { hasNewEvidence: true, reason: 'New candle closed above prior invalidation reference high.' };
        }
        if (direction === 'SELL' && lastInvalid.lastKnownSwingLow && lastCandle.close < lastInvalid.lastKnownSwingLow) {
          return { hasNewEvidence: true, reason: 'New candle closed below prior invalidation reference low.' };
        }
      }
    }

    return {
      hasNewEvidence: false,
      reason: `Market remains in identical structural state as when setup ${lastInvalid.setupId} was invalidated at price ${lastInvalid.invalidatedPrice} (${lastInvalid.invalidationReason}). Anti-flip-flop guard prevents duplicate setup.`,
    };
  }

  /**
   * Revalidates an existing blueprint against live market conditions and material price movement.
   */
  public static validateBlueprintRelevance(
    bp: TradeBlueprint,
    currentPrice: number,
    structure: MarketStructure | null,
    candles?: OHLCCandle[],
    currentTimeMs: number = Date.now()
  ): { isValid: boolean; updatedState: SetupLifecycleState; reason: string } {
    if (!bp) {
      return { isValid: false, updatedState: 'INVALIDATED', reason: 'Blueprint is null' };
    }

    // Check if this setupId has already been recorded as permanently invalidated
    if (this.invalidatedRegistry.has(bp.setupId)) {
      const archive = this.invalidatedRegistry.get(bp.setupId)!;
      return {
        isValid: false,
        updatedState: 'INVALIDATED',
        reason: `Setup ${bp.setupId} was permanently invalidated at ${archive.invalidatedPrice}: ${archive.invalidationReason}`,
      };
    }

    // 1. Time-based Fail-Safe Ceiling
    if (currentTimeMs > bp.expiry) {
      this.recordInvalidation(bp, currentPrice, 'EXPIRED_LIFETIME_CEILING', structure);
      return { isValid: false, updatedState: 'EXPIRED', reason: 'Setup exceeded maximum safety ceiling (expired).' };
    }

    // 2. Strict Invalidation Level Breach
    if (bp.direction === 'BUY') {
      if (currentPrice <= bp.invalidation.price || currentPrice < bp.sl.price) {
        this.recordInvalidation(bp, currentPrice, `Current price ${currentPrice} breached BUY invalidation level ${bp.invalidation.price}`, structure);
        return { isValid: false, updatedState: 'INVALIDATED', reason: `Current price ${currentPrice} breached BUY invalidation ${bp.invalidation.price}.` };
      }
    } else if (bp.direction === 'SELL') {
      if (currentPrice >= bp.invalidation.price || currentPrice > bp.sl.price) {
        this.recordInvalidation(bp, currentPrice, `Current price ${currentPrice} breached SELL invalidation level ${bp.invalidation.price}`, structure);
        return { isValid: false, updatedState: 'INVALIDATED', reason: `Current price ${currentPrice} breached SELL invalidation ${bp.invalidation.price}.` };
      }
    }

    // 3. Subsequent Candle Extremum Invalidation Check
    const baselineTs = bp.latestAnalyzedCandleTimestamp || bp.createdAt;
    if (candles && Array.isArray(candles) && candles.length > 0) {
      const subsequentCandles = candles.filter((c) => c.timestamp > baselineTs);
      for (const c of subsequentCandles) {
        if (bp.direction === 'BUY' && (c.low <= bp.invalidation.price || c.low <= bp.sl.price)) {
          this.recordInvalidation(bp, c.low, `Subsequent candle low ${c.low} breached BUY invalidation level ${bp.invalidation.price}`, structure);
          return { isValid: false, updatedState: 'INVALIDATED', reason: `Subsequent candle low breached BUY invalidation ${bp.invalidation.price}.` };
        }
        if (bp.direction === 'SELL' && (c.high >= bp.invalidation.price || c.high >= bp.sl.price)) {
          this.recordInvalidation(bp, c.high, `Subsequent candle high ${c.high} breached SELL invalidation level ${bp.invalidation.price}`, structure);
          return { isValid: false, updatedState: 'INVALIDATED', reason: `Subsequent candle high breached SELL invalidation ${bp.invalidation.price}.` };
        }
      }
    }

    // 4. TP1 Target Completion Check
    if (bp.direction === 'BUY' && currentPrice >= bp.tp1.price) {
      this.recordCompletion(bp, currentPrice, `Target TP1 (${bp.tp1.price}) reached by market price`);
      return { isValid: false, updatedState: 'COMPLETED', reason: `BUY target TP1 (${bp.tp1.price}) reached.` };
    }
    if (bp.direction === 'SELL' && currentPrice <= bp.tp1.price) {
      this.recordCompletion(bp, currentPrice, `Target TP1 (${bp.tp1.price}) reached by market price`);
      return { isValid: false, updatedState: 'COMPLETED', reason: `SELL target TP1 (${bp.tp1.price}) reached.` };
    }

    // 5. Material Runaway / Drift Protection (Section 6: Stale blueprint survives material market movement)
    // If the market is at 4119 while entry was 4109 and SL 4097 (risk distance = 12, TP 4134),
    // and price has run away far beyond entry towards TP without pullback, or drifted excessively
    const entryMid = (bp.entryZoneLow.price + bp.entryZoneHigh.price) / 2;
    const riskDistance = Math.abs(entryMid - bp.sl.price);
    const tpDistance = Math.abs(bp.tp1.price - entryMid);
    const maxAllowedExtension = Math.min(riskDistance * 0.8, tpDistance * 0.45);

    if (bp.direction === 'BUY' && currentPrice > entryMid + maxAllowedExtension) {
      this.recordInvalidation(bp, currentPrice, `Price extended materially beyond setup relevance (${currentPrice} >> entry ${entryMid.toFixed(2)})`, structure);
      return { isValid: false, updatedState: 'EXPIRED', reason: `Price moved materially beyond structural relevance (${currentPrice}).` };
    }
    if (bp.direction === 'SELL' && currentPrice < entryMid - maxAllowedExtension) {
      this.recordInvalidation(bp, currentPrice, `Price extended materially beyond setup relevance (${currentPrice} << entry ${entryMid.toFixed(2)})`, structure);
      return { isValid: false, updatedState: 'EXPIRED', reason: `Price moved materially beyond structural relevance (${currentPrice}).` };
    }

    // 6. Opposing Structure Invalidation
    if (structure) {
      if (bp.direction === 'BUY' && structure.trend === 'BEARISH') {
        this.recordInvalidation(bp, currentPrice, 'Market trend reversed to BEARISH', structure);
        return { isValid: false, updatedState: 'INVALIDATED', reason: 'Market trend reversed to BEARISH against BUY setup.' };
      }
      if (bp.direction === 'SELL' && structure.trend === 'BULLISH') {
        this.recordInvalidation(bp, currentPrice, 'Market trend reversed to BULLISH', structure);
        return { isValid: false, updatedState: 'INVALIDATED', reason: 'Market trend reversed to BULLISH against SELL setup.' };
      }

      // Opposing CHOCH
      const opposingChoch = structure.choch.find((c) =>
        (bp.direction === 'BUY' ? c.type === 'CHOCH_LOW' : c.type === 'CHOCH_HIGH') &&
        c.candleTimestamp > baselineTs
      );
      if (opposingChoch) {
        this.recordInvalidation(bp, currentPrice, `Opposing CHOCH detected at ${opposingChoch.price}`, structure);
        return { isValid: false, updatedState: 'INVALIDATED', reason: `Opposing CHOCH detected at ${opposingChoch.price}.` };
      }

      // Opposing BOS
      const opposingBos = structure.bos.find((b) =>
        (bp.direction === 'BUY' ? b.type === 'BOS_LOW' : b.type === 'BOS_HIGH') &&
        b.candleTimestamp > baselineTs
      );
      if (opposingBos) {
        this.recordInvalidation(bp, currentPrice, `Opposing BOS detected at ${opposingBos.price}`, structure);
        return { isValid: false, updatedState: 'INVALIDATED', reason: `Opposing BOS detected at ${opposingBos.price}.` };
      }
    }

    return { isValid: true, updatedState: 'ARMED', reason: 'Setup remains structurally relevant and armed.' };
  }

  /**
   * Permanently archives an invalidated setup.
   */
  public static recordInvalidation(
    bp: TradeBlueprint,
    invalidatedPrice: number,
    reason: string,
    structure: MarketStructure | null
  ): void {
    const entry: InvalidationArchiveEntry = {
      setupId: bp.setupId,
      symbol: bp.symbol,
      direction: bp.direction,
      invalidatedAt: Date.now(),
      invalidatedPrice,
      invalidationReason: reason,
      structureVersion: this.computeStructureVersion(structure),
      lastKnownSwingHigh: structure?.lastSwingHigh ?? undefined,
      lastKnownSwingLow: structure?.lastSwingLow ?? undefined,
      triggerCandleTimestamp: bp.latestAnalyzedCandleTimestamp,
    };

    this.invalidatedRegistry.set(bp.setupId, entry);
    const key = `${bp.symbol.toUpperCase()}:${bp.direction}`;
    this.lastInvalidationBySymbolDir.set(key, entry);

    // Update active record state
    const active = this.activeLifecycleStore.get(bp.symbol.toUpperCase());
    if (active && active.setupId === bp.setupId) {
      active.state = 'INVALIDATED';
      active.invalidatedAt = entry.invalidatedAt;
      active.invalidatedPrice = invalidatedPrice;
      active.invalidationReason = reason;
      active.updatedAt = Date.now();
    }
  }

  /**
   * Records successful setup completion (TP fulfillment).
   */
  public static recordCompletion(
    bp: TradeBlueprint,
    completedPrice: number,
    reason: string
  ): void {
    const active = this.activeLifecycleStore.get(bp.symbol.toUpperCase());
    if (active && active.setupId === bp.setupId) {
      active.state = 'COMPLETED';
      active.completedAt = Date.now();
      active.completionReason = reason;
      active.updatedAt = Date.now();
    }
  }

  /**
   * Checks whether a setupId was ever invalidated.
   */
  public static isSetupInvalidated(setupId: string): boolean {
    return this.invalidatedRegistry.has(setupId);
  }

  /**
   * Registers a newly formed or updated setup in the active lifecycle store.
   */
  public static registerActiveSetup(bp: TradeBlueprint, structure: MarketStructure | null, state: SetupLifecycleState = 'ARMED'): SetupLifecycleRecord {
    const record: SetupLifecycleRecord = {
      setupId: bp.setupId,
      symbol: bp.symbol,
      direction: bp.direction,
      state,
      createdAt: bp.createdAt,
      updatedAt: Date.now(),
      entryZoneLow: bp.entryZoneLow.price,
      entryZoneHigh: bp.entryZoneHigh.price,
      invalidationPrice: bp.invalidation.price,
      slPrice: bp.sl.price,
      tp1Price: bp.tp1.price,
      structureVersion: this.computeStructureVersion(structure),
      triggerCandleTimestamp: bp.latestAnalyzedCandleTimestamp,
    };

    this.activeLifecycleStore.set(bp.symbol.toUpperCase(), record);
    return record;
  }

  /**
   * Retrieves the current lifecycle record for a symbol.
   */
  public static getActiveSetup(symbol: string): SetupLifecycleRecord | null {
    return this.activeLifecycleStore.get(symbol.toUpperCase()) || null;
  }
}
