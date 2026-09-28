/**
 * FEF CORTEX — MARKET STRUCTURE EVENT ENGINE
 * 
 * Detects and dispatches canonical market structure events:
 * - BOS (Break of Structure: M15_BOS_BULL, H1_BOS_BEAR, etc.)
 * - CHoCH (Change of Character)
 * - S/R Break & Retest
 * - Liquidity Sweep & Reclaim
 * - Volatility / Momentum Expansion
 * 
 * Supports reactive wakeups of relevant council agents without polling delays.
 */

import { OHLCCandle } from './canonical-market-snapshot';

export type StructureEventType =
  | 'BOS_BULLISH'
  | 'BOS_BEARISH'
  | 'CHOCH_BULLISH'
  | 'CHOCH_BEARISH'
  | 'SUPPORT_BREAK'
  | 'RESISTANCE_BREAK'
  | 'LIQUIDITY_SWEEP_HIGHS'
  | 'LIQUIDITY_SWEEP_LOWS'
  | 'MOMENTUM_EXPANSION';

export interface StructureMarketEvent {
  id: string;
  symbol: string;
  timeframe: string;
  eventType: StructureEventType;
  priceLevel: number;
  triggerPrice: number;
  timestamp: string;
  epochMs: number;
  description: string;
  significance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export type StructureEventListener = (event: StructureMarketEvent) => void;

export class StructureEventBus {
  private static instance: StructureEventBus;
  private listeners: Set<StructureEventListener> = new Set();
  private recentEvents: StructureMarketEvent[] = [];
  private readonly maxHistory = 100;

  private constructor() {}

  public static getInstance(): StructureEventBus {
    if (!StructureEventBus.instance) {
      StructureEventBus.instance = new StructureEventBus();
    }
    return StructureEventBus.instance;
  }

  public subscribe(listener: StructureEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(event: StructureMarketEvent): void {
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > this.maxHistory) {
      this.recentEvents.pop();
    }
    Array.from(this.listeners).forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error('StructureEventBus listener error:', err);
      }
    });
  }

  public getRecentEvents(symbol?: string, limit: number = 20): StructureMarketEvent[] {
    if (!symbol) return this.recentEvents.slice(0, limit);
    const norm = symbol.toUpperCase();
    return this.recentEvents.filter((e) => e.symbol === norm).slice(0, limit);
  }
}

export const structureEventBus = StructureEventBus.getInstance();

export function scanCandlesForStructureEvents(
  symbol: string,
  timeframe: string,
  candles: OHLCCandle[]
): StructureMarketEvent[] {
  if (!candles || candles.length < 5) return [];

  const events: StructureMarketEvent[] = [];
  const normSymbol = symbol.toUpperCase();
  const normTf = timeframe.toUpperCase();
  const len = candles.length;
  const current = candles[len - 1];
  const prev = candles[len - 2];

  // 1. Detect Momentum Expansion
  const currentBody = Math.abs(current.close - current.open);
  const currentRange = current.high - current.low;
  const prevRange = prev.high - prev.low;

  if (currentRange > prevRange * 1.8 && currentRange > 0 && currentBody / currentRange > 0.65) {
    events.push({
      id: `evt-${normSymbol}-${normTf}-MOM-${current.timestamp}`,
      symbol: normSymbol,
      timeframe: normTf,
      eventType: 'MOMENTUM_EXPANSION',
      priceLevel: current.close,
      triggerPrice: current.close,
      timestamp: new Date(current.timestamp).toISOString(),
      epochMs: current.timestamp,
      description: `${normTf} Momentum expansion: Volatility burst (${(currentRange).toFixed(2)} pts) favoring ${current.close > current.open ? 'BULLS' : 'BEARS'}.`,
      significance: 'MEDIUM',
    });
  }

  // 2. Detect Liquidity Sweep (Highs or Lows)
  const windowCandles = candles.slice(-20, -1);
  if (windowCandles.length >= 10) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (const c of windowCandles) {
      if (c.high > highestHigh) highestHigh = c.high;
      if (c.low < lowestLow) lowestLow = c.low;
    }

    // Sweep Highs: pierced highestHigh then closed below it
    if (current.high > highestHigh && current.close < highestHigh) {
      events.push({
        id: `evt-${normSymbol}-${normTf}-SWP-H-${current.timestamp}`,
        symbol: normSymbol,
        timeframe: normTf,
        eventType: 'LIQUIDITY_SWEEP_HIGHS',
        priceLevel: highestHigh,
        triggerPrice: current.high,
        timestamp: new Date(current.timestamp).toISOString(),
        epochMs: current.timestamp,
        description: `${normTf} Buy-side liquidity sweep above ${highestHigh.toFixed(2)} followed by immediate rejection back below level.`,
        significance: 'HIGH',
      });
    }

    // Sweep Lows: pierced lowestLow then closed above it
    if (current.low < lowestLow && current.close > lowestLow) {
      events.push({
        id: `evt-${normSymbol}-${normTf}-SWP-L-${current.timestamp}`,
        symbol: normSymbol,
        timeframe: normTf,
        eventType: 'LIQUIDITY_SWEEP_LOWS',
        priceLevel: lowestLow,
        triggerPrice: current.low,
        timestamp: new Date(current.timestamp).toISOString(),
        epochMs: current.timestamp,
        description: `${normTf} Sell-side liquidity sweep below ${lowestLow.toFixed(2)} followed by immediate absorption back above level.`,
        significance: 'HIGH',
      });
    }
  }

  return events;
}
