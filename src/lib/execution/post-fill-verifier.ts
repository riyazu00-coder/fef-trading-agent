/**
 * FEF TRADING SOLUTIONS — POST-FILL PROTECTION VERIFIER
 * 
 * Future Phase 2C Verification Contract
 * 
 * After an order is dispatched to MT5, FEF verifies against fresh telemetry:
 * 1. Position exists in live MT5 position registry.
 * 2. Position symbol matches intended symbol.
 * 3. Position direction matches intended direction.
 * 4. Position volume matches authorized lot size.
 * 5. Position has non-zero broker-accepted Stop Loss.
 * 6. Position has non-zero broker-accepted Take Profit.
 * 
 * If a position appears on MT5 without mandatory SL/TP protection:
 * status = 'PROTECTION FAILURE'
 * Never display 'PROTECTED' unless fresh broker telemetry confirms active protection.
 */

import { MT5PositionItem } from '../bridge/mt5-bridge-protocol';

export type PostFillProtectionStatus =
  | 'PROTECTED'
  | 'PROTECTION_FAILURE'
  | 'POSITION_NOT_FOUND'
  | 'VOLUME_MISMATCH'
  | 'DIRECTION_MISMATCH'
  | 'PENDING_TELEMETRY';

export interface ExpectedOrderContract {
  ticket?: number;
  symbol: string;
  brokerSymbol?: string;
  direction: 'BUY' | 'SELL';
  expectedVolume: number;
  expectedSl: number;
  expectedTp1: number;
  maxSlippagePoints?: number;
}

export interface PostFillVerificationResult {
  verified: boolean;
  status: PostFillProtectionStatus;
  statusLabel: string;
  matchedPosition?: MT5PositionItem;
  hasBrokerSl: boolean;
  hasBrokerTp: boolean;
  actualSl?: number;
  actualTp?: number;
  actualVolume?: number;
  reasons: string[];
  timestamp: number;
}

/**
 * Verify post-fill protection from fresh MT5 positions array
 */
export function verifyPostFillProtection(
  expected: ExpectedOrderContract,
  livePositions: MT5PositionItem[]
): PostFillVerificationResult {
  const reasons: string[] = [];
  const now = Date.now();

  // 1. Find matched position by ticket or symbol + direction + volume
  let matched = livePositions.find(p => expected.ticket != null && p.ticket === expected.ticket);

  if (!matched) {
    // Match by symbol and direction
    const candidates = livePositions.filter(p => {
      const symMatch = p.symbol === expected.symbol || (expected.brokerSymbol && p.symbol === expected.brokerSymbol);
      const dirMatch = p.type === expected.direction;
      return symMatch && dirMatch;
    });

    if (candidates.length > 0) {
      // Pick the closest matching volume
      matched = candidates.find(p => Math.abs((p.volume ?? p.lots ?? 0) - expected.expectedVolume) < 0.001) || candidates[0];
    }
  }

  if (!matched) {
    return {
      verified: false,
      status: 'POSITION_NOT_FOUND',
      statusLabel: 'POSITION PENDING TELEMETRY CONFIRMATION',
      hasBrokerSl: false,
      hasBrokerTp: false,
      reasons: [`No active MT5 position found matching ticket ${expected.ticket || 'N/A'} for ${expected.symbol}.`],
      timestamp: now,
    };
  }

  const actualVol = matched.volume ?? matched.lots ?? 0;

  // 2. Validate volume
  if (Math.abs(actualVol - expected.expectedVolume) > 0.001) {
    reasons.push(`Volume mismatch: expected ${expected.expectedVolume} lots, actual broker volume is ${actualVol} lots.`);
  }

  // 3. Validate broker SL presence
  const hasBrokerSl = typeof matched.sl === 'number' && matched.sl > 0;
  if (!hasBrokerSl) {
    reasons.push('CRITICAL: Position opened without broker-accepted Stop Loss!');
  }

  // 4. Validate broker TP presence
  const hasBrokerTp = typeof matched.tp === 'number' && matched.tp > 0;
  if (!hasBrokerTp) {
    reasons.push('CRITICAL: Position opened without broker-accepted Take Profit!');
  }

  // 5. Determine protection outcome
  const isFullyProtected = hasBrokerSl && hasBrokerTp && reasons.length === 0;

  if (!hasBrokerSl || !hasBrokerTp) {
    return {
      verified: false,
      status: 'PROTECTION_FAILURE',
      statusLabel: 'PROTECTION FAILURE — BROKER SL/TP MISSING',
      matchedPosition: matched,
      hasBrokerSl,
      hasBrokerTp,
      actualSl: matched.sl,
      actualTp: matched.tp,
      actualVolume: actualVol,
      reasons,
      timestamp: now,
    };
  }

  if (reasons.length > 0) {
    return {
      verified: false,
      status: 'VOLUME_MISMATCH',
      statusLabel: 'PROTECTION ANOMALY — VOLUME MISMATCH',
      matchedPosition: matched,
      hasBrokerSl,
      hasBrokerTp,
      actualSl: matched.sl,
      actualTp: matched.tp,
      actualVolume: actualVol,
      reasons,
      timestamp: now,
    };
  }

  return {
    verified: true,
    status: 'PROTECTED',
    statusLabel: 'PROTECTED — BROKER SL/TP VERIFIED',
    matchedPosition: matched,
    hasBrokerSl: true,
    hasBrokerTp: true,
    actualSl: matched.sl,
    actualTp: matched.tp,
    actualVolume: actualVol,
    reasons: ['Broker position verified with active Stop Loss and Take Profit.'],
    timestamp: now,
  };
}
