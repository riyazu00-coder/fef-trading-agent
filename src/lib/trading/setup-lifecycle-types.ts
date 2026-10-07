/**
 * FEF CORTEX — SETUP LIFECYCLE & ANTI-FLIP-FLOP TYPES
 * M15/M30 Trade Opportunity Recovery Foundation
 *
 * Rules:
 * 1. Stable setupId: every setup has a deterministic setupId.
 * 2. Terminal invalidation: once INVALIDATED, that exact setupId can NEVER become active again.
 * 3. Market-state invalidation: anti-flip-flop requires genuinely new structural evidence
 *    (new swing, new BOS, new CHOCH, new trigger level) before allowing a new setup in the same direction.
 * 4. Stale protection: setups beyond structural relevance must be INVALIDATED or COMPLETED.
 */

export type SetupLifecycleState =
  | 'FORMING'
  | 'ARMED'
  | 'TRIGGERED'
  | 'INVALIDATED'
  | 'EXPIRED'
  | 'COMPLETED';

export interface SetupLifecycleRecord {
  setupId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  state: SetupLifecycleState;
  createdAt: number;
  updatedAt: number;

  entryZoneLow: number;
  entryZoneHigh: number;
  invalidationPrice: number;
  slPrice: number;
  tp1Price: number;

  structureVersion: string;
  triggerCandleTimestamp?: number;

  // Invalidation tracking (Anti-Flip-Flop)
  invalidatedAt?: number;
  invalidatedPrice?: number;
  invalidationReason?: string;

  // Completion tracking
  completedAt?: number;
  completionReason?: string;
}

export interface InvalidationArchiveEntry {
  setupId: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  invalidatedAt: number;
  invalidatedPrice: number;
  invalidationReason: string;
  structureVersion: string;
  lastKnownSwingHigh?: number;
  lastKnownSwingLow?: number;
  triggerCandleTimestamp?: number;
}

