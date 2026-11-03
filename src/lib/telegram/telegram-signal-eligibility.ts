/**
 * FEF CORTEX — VALIDATED SETUP ELIGIBILITY GATE
 *
 * Phase 13 Workstream: Private Telegram Signal Broadcasting Gate
 * Strictly downstream of Decision Engine V2 and Setup Intelligence V3.
 *
 * MANDATORY SAFETY GATE:
 * A setup can be broadcast ONLY when all 21 institutional requirements are satisfied.
 * Never broadcasts raw agent detections, preliminary opportunities, or sub-2.0 R:R setups.
 */

import { DecisionIntelligenceV2 } from '../decision/decision-engine-v2';
import { SetupIntelligenceV3 } from '../setup/setup-intelligence-v3';

export type EligibilityStatus =
  | 'ELIGIBLE'
  | 'REJECTED_INCOMPLETE'
  | 'REJECTED_UNCONFIRMED'
  | 'REJECTED_LOW_MATURITY'
  | 'REJECTED_STALE_DATA'
  | 'REJECTED_CONFLICT'
  | 'REJECTED_VETO'
  | 'REJECTED_RR'
  | 'REJECTED_UNSUPPORTED_INSTRUMENT'
  | 'REJECTED_INVALIDATED'
  | 'REJECTED_DUPLICATE'
  | 'REJECTED_INSIGNIFICANT_UPDATE';

export interface ValidatedSignalPayload {
  signalId: string;
  setupId: string;
  setupRevision: number;
  messageType?: 'NEW_OPPORTUNITY' | 'SETUP_UPDATE' | 'SETUP_INVALIDATED';
  symbol: string;
  direction: 'BUY' | 'SELL';
  timeframe: string;
  marketPrice: number;
  entryZone: {
    low: number;
    high: number;
    midpoint: number;
  };
  stopLoss: {
    price: number;
    distance: number;
  };
  takeProfit1: {
    price: number;
    distance: number;
    riskReward: number;
  };
  takeProfit2?: {
    price: number;
    distance: number;
    riskReward: number;
  };
  takeProfit3?: {
    price: number;
    distance: number;
    riskReward: number;
  };
  riskRewardRatio: number;
  decisionEngine: {
    bias: string;
    confidencePct: number;
    completenessPct: number;
    independentDomainsCount: number;
    maturity: string;
  };
  setupIntelligence: {
    type: string;
    lifecycle: string;
    thesis: string;
    invalidationPrice: number;
  };
  sessionContext?: {
    currentSession?: string;
    activeKillzone?: boolean;
  };
  timestamps: {
    asOf: number;
    marketDataTimestamp: number;
    validatedAt: string;
  };
  idempotencyKey: string;
}

export interface EligibilityResult {
  isEligible: boolean;
  status: EligibilityStatus;
  rejectionReason?: string;
  failedCheckIndex?: number;
  payload?: ValidatedSignalPayload;
}

const SUPPORTED_INSTRUMENTS = new Set([
  'XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD',
  'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP', 'US30', 'US100', 'US500', 'UK100',
  'JP225', 'USOIL', 'UKOIL', 'NATGAS', 'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD'
]);

/**
 * Single Authoritative Eligibility Service for Telegram Broadcasting
 */
export function evaluateSignalEligibility(
  decision: DecisionIntelligenceV2 | null | undefined,
  setup: SetupIntelligenceV3 | null | undefined,
  telemetry: {
    symbol?: string;
    bid?: number;
    ask?: number;
    spreadPoints?: number;
    timestamp?: number;
    mt5Connected?: boolean;
  } | null | undefined,
  knownBroadcastKeys: Set<string>,
  options?: {
    allowInvalidationNotice?: boolean;
    previousSetup?: { entryMidpoint: number; stopLoss: number; tp1: number };
  }
): EligibilityResult {
  const now = Date.now();

  // Check 1: Decision Engine V2 must exist
  if (!decision) {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: 'Decision Engine V2 output missing',
      failedCheckIndex: 1,
    };
  }

  // Check 2: Setup Intelligence V3 must exist
  if (!setup) {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: 'Setup Intelligence V3 output missing',
      failedCheckIndex: 2,
    };
  }

  // Check 3: Symbol must be defined and supported (GER40 fails closed)
  const symbol = (setup.symbol || telemetry?.symbol || '').toUpperCase().trim();
  if (!symbol || !SUPPORTED_INSTRUMENTS.has(symbol)) {
    return {
      isEligible: false,
      status: 'REJECTED_UNSUPPORTED_INSTRUMENT',
      rejectionReason: `Instrument '${symbol}' is not a supported canonical live instrument (GER40 or unsupported)`,
      failedCheckIndex: 3,
    };
  }

  // Check 4: Decision Engine maturity must be strictly VALIDATED_SETUP
  if (decision.maturity !== 'VALIDATED_SETUP') {
    return {
      isEligible: false,
      status: 'REJECTED_LOW_MATURITY',
      rejectionReason: `Decision Engine maturity is '${decision.maturity}', requires 'VALIDATED_SETUP'`,
      failedCheckIndex: 4,
    };
  }

  // Check 5: Setup Intelligence lifecycle must be strictly VALIDATED (or INVALIDATED with broadcast permission)
  const isInvalidatedNotice = setup.lifecycle === 'INVALIDATED' && options?.allowInvalidationNotice && knownBroadcastKeys.has(`${symbol}_${setup.setupId}_1`);

  if (setup.lifecycle !== 'VALIDATED' && !isInvalidatedNotice) {
    if (setup.lifecycle === 'INVALIDATED' || setup.lifecycle === 'EXPIRED') {
      return {
        isEligible: false,
        status: 'REJECTED_INVALIDATED',
        rejectionReason: `Setup lifecycle is terminal (${setup.lifecycle})`,
        failedCheckIndex: 5,
      };
    }
    return {
      isEligible: false,
      status: 'REJECTED_LOW_MATURITY',
      rejectionReason: `Setup Intelligence lifecycle is '${setup.lifecycle}', requires 'VALIDATED'`,
      failedCheckIndex: 5,
    };
  }

  // Check 6: Direction must be unambiguous (LONG/BUY or SHORT/SELL)
  if (setup.direction !== 'LONG' && setup.direction !== 'SHORT') {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: `Setup direction is '${setup.direction}', must be LONG or SHORT`,
      failedCheckIndex: 6,
    };
  }

  const broadcastDirection: 'BUY' | 'SELL' = setup.direction === 'LONG' ? 'BUY' : 'SELL';
  if ((broadcastDirection === 'BUY' && decision.bias !== 'BULLISH') ||
      (broadcastDirection === 'SELL' && decision.bias !== 'BEARISH')) {
    return {
      isEligible: false,
      status: 'REJECTED_CONFLICT',
      rejectionReason: `Direction conflict between Setup (${setup.direction}) and Decision Engine (${decision.bias})`,
      failedCheckIndex: 6,
    };
  }

  // Check 7: Quote and telemetry freshness (must be <= 30 seconds)
  const quoteTimestamp = typeof telemetry?.timestamp === 'number' ? telemetry.timestamp : 0;
  const quoteAgeMs = now - quoteTimestamp;
  if (!quoteTimestamp || quoteAgeMs > 30000 || quoteAgeMs < -15000) {
    return {
      isEligible: false,
      status: 'REJECTED_STALE_DATA',
      rejectionReason: `Market quote data is stale or unavailable (age: ${Math.round(quoteAgeMs / 1000)}s)`,
      failedCheckIndex: 7,
    };
  }

  // Check 8: Entry reference must be available and valid (> 0)
  if (!setup.entryZone || setup.entryZone.low <= 0 || setup.entryZone.high <= 0 || setup.entryZone.midpoint <= 0) {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: 'Setup entry zone is missing or has non-positive prices',
      failedCheckIndex: 8,
    };
  }

  // Check 9: Stop loss must be available and valid (> 0)
  if (!setup.stopLoss || setup.stopLoss.price <= 0 || setup.stopLoss.distance <= 0) {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: 'Setup stop loss is missing or invalid',
      failedCheckIndex: 9,
    };
  }

  // Check 10: Take profit target must exist and be valid (> 0)
  const primaryTarget = setup.targets && setup.targets.length > 0 ? setup.targets[0] : null;
  if (!primaryTarget || primaryTarget.price <= 0 || primaryTarget.rewardDistance <= 0) {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: 'Setup primary take profit target (TP1) is missing or invalid',
      failedCheckIndex: 10,
    };
  }

  // Check 11: Mandatory TP2 Qualification: TP2 must exist, be valid, and TP2_RR >= 2.0:1
  // Strict institutional policy: TP1 MUST NOT independently qualify a setup.
  // TP3 must not silently replace a missing or invalid TP2.
  const tp2 = setup.targets?.find((t) => t.targetIndex === 2 || t.label === 'TP2');
  if (!tp2) {
    return {
      isEligible: false,
      status: 'REJECTED_RR',
      rejectionReason: 'Setup secondary target (TP2) is missing. Mandatory policy requires valid TP2 with R:R >= 2.0:1. TP1 cannot independently qualify.',
      failedCheckIndex: 11,
    };
  }

  if (
    typeof tp2.price !== 'number' ||
    isNaN(tp2.price) ||
    tp2.price <= 0 ||
    typeof tp2.rewardDistance !== 'number' ||
    isNaN(tp2.rewardDistance) ||
    tp2.rewardDistance <= 0
  ) {
    return {
      isEligible: false,
      status: 'REJECTED_RR',
      rejectionReason: 'Setup secondary target (TP2) price or reward distance is invalid or non-positive',
      failedCheckIndex: 11,
    };
  }

  // Verify TP2 is on the correct side of the entry zone and strictly beyond TP1
  if (broadcastDirection === 'BUY') {
    if (tp2.price <= setup.entryZone.high || (primaryTarget && tp2.price <= primaryTarget.price)) {
      return {
        isEligible: false,
        status: 'REJECTED_RR',
        rejectionReason: `Invalid BUY TP2 geometry: TP2 (${tp2.price}) must be strictly above Entry (${setup.entryZone.high}) and above TP1 (${primaryTarget?.price})`,
        failedCheckIndex: 11,
      };
    }
  } else {
    if (tp2.price >= setup.entryZone.low || (primaryTarget && tp2.price >= primaryTarget.price)) {
      return {
        isEligible: false,
        status: 'REJECTED_RR',
        rejectionReason: `Invalid SELL TP2 geometry: TP2 (${tp2.price}) must be strictly below Entry (${setup.entryZone.low}) and below TP1 (${primaryTarget?.price})`,
        failedCheckIndex: 11,
      };
    }
  }

  // Verify stop loss distance is strictly positive
  if (!setup.stopLoss || typeof setup.stopLoss.distance !== 'number' || setup.stopLoss.distance <= 0) {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: 'Setup stop loss distance is invalid or zero',
      failedCheckIndex: 9,
    };
  }

  // Calculate TP2 R:R (with standard 2-decimal institutional precision)
  const tp2Rr = Number((tp2.rewardDistance / setup.stopLoss.distance).toFixed(2));
  const meetsThreshold = setup.riskReward ? setup.riskReward.meetsMinimumThreshold : (tp2Rr >= 2.0);

  if (tp2Rr < 2.0 || !meetsThreshold) {
    return {
      isEligible: false,
      status: 'REJECTED_RR',
      rejectionReason: `TP2 Risk/Reward ratio ${tp2Rr.toFixed(2)}:1 fails mandatory minimum threshold of 2.0:1 (TP1 cannot independently qualify)`,
      failedCheckIndex: 11,
    };
  }

  // Check 12: Confidence threshold (Decision Engine confidence >= 70%)
  if (decision.confidence < 70) {
    return {
      isEligible: false,
      status: 'REJECTED_UNCONFIRMED',
      rejectionReason: `Decision confidence ${decision.confidence}% is below institutional threshold (70%)`,
      failedCheckIndex: 12,
    };
  }

  // Check 13: Completeness threshold (Evidence completeness >= 75%)
  if (decision.evidenceCompleteness < 75) {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: `Evidence completeness ${decision.evidenceCompleteness}% is below institutional threshold (75%)`,
      failedCheckIndex: 13,
    };
  }

  // Check 14: Independent confirmation clusters (must be >= 2 distinct non-correlated evidence families)
  const independentCount = decision.independentDomainCount ?? decision.supportingDomains?.length ?? 0;
  if (independentCount < 2) {
    return {
      isEligible: false,
      status: 'REJECTED_UNCONFIRMED',
      rejectionReason: `Only ${independentCount} independent confirmation domain(s), minimum 2 required`,
      failedCheckIndex: 14,
    };
  }

  // Check 15: No active hard vetoes
  const activeHardVetoes = (decision.hardVetoes || []).filter((v) => v.effect === 'BLOCK_SETUP_VALIDATION' || v.severity === 'CRITICAL');
  if (activeHardVetoes.length > 0) {
    return {
      isEligible: false,
      status: 'REJECTED_VETO',
      rejectionReason: `Active hard veto enforced: ${activeHardVetoes.map((v) => v.reason).join(', ')}`,
      failedCheckIndex: 15,
    };
  }

  // Check 16: No unresolved critical conflicts
  const criticalConflicts = (decision.conflicts || []).filter((c) => c.severity === 'HIGH');
  if (criticalConflicts.length > 0) {
    return {
      isEligible: false,
      status: 'REJECTED_CONFLICT',
      rejectionReason: `Unresolved high severity conflict: ${criticalConflicts.map((c) => c.description).join(', ')}`,
      failedCheckIndex: 16,
    };
  }

  // Check 17: Invalidation price must exist
  const invalidationPrice = setup.invalidation?.price ?? setup.stopLoss.price;
  if (!invalidationPrice || invalidationPrice <= 0) {
    return {
      isEligible: false,
      status: 'REJECTED_INCOMPLETE',
      rejectionReason: 'Setup invalidation price is missing or non-positive',
      failedCheckIndex: 17,
    };
  }

  // Check 18: Geometry directional validity
  // For BUY: SL < Entry < TP1. For SELL: SL > Entry > TP1.
  if (broadcastDirection === 'BUY') {
    if (setup.stopLoss.price >= setup.entryZone.low || primaryTarget.price <= setup.entryZone.high) {
      return {
        isEligible: false,
        status: 'REJECTED_INCOMPLETE',
        rejectionReason: `Invalid BUY geometry: SL (${setup.stopLoss.price}) must be below Entry (${setup.entryZone.low}) and TP (${primaryTarget.price}) above Entry`,
        failedCheckIndex: 18,
      };
    }
  } else {
    if (setup.stopLoss.price <= setup.entryZone.high || primaryTarget.price >= setup.entryZone.low) {
      return {
        isEligible: false,
        status: 'REJECTED_INCOMPLETE',
        rejectionReason: `Invalid SELL geometry: SL (${setup.stopLoss.price}) must be above Entry (${setup.entryZone.high}) and TP (${primaryTarget.price}) below Entry`,
        failedCheckIndex: 18,
      };
    }
  }

  // Check 19: Idempotency, Setup Revisions & Insignificant Change Throttling
  const setupRevision = (setup as any).revision || (setup as any).setupRevision || 1;
  const idempotencyKey = isInvalidatedNotice
    ? `${symbol}_${setup.setupId}_INVALIDATED`
    : `${symbol}_${setup.setupId}_${setupRevision}`;

  if (knownBroadcastKeys.has(idempotencyKey)) {
    return {
      isEligible: false,
      status: 'REJECTED_DUPLICATE',
      rejectionReason: `Setup revision '${idempotencyKey}' was already broadcast to Telegram`,
      failedCheckIndex: 19,
    };
  }

  // Check 19b: Insignificant Price Change Throttling for Updates
  if (setupRevision > 1 && options?.previousSetup) {
    const prev = options.previousSetup;
    const currentMid = setup.entryZone.midpoint;
    const currentSl = setup.stopLoss.price;
    const currentTp = primaryTarget.price;

    const entryDiffPct = Math.abs(currentMid - prev.entryMidpoint) / prev.entryMidpoint;
    const slDiffPct = Math.abs(currentSl - prev.stopLoss) / prev.stopLoss;
    const tpDiffPct = Math.abs(currentTp - prev.tp1) / prev.tp1;

    // Minimum 0.05% (5 bps) movement required to justify broadcasting an update
    if (entryDiffPct < 0.0005 && slDiffPct < 0.0005 && tpDiffPct < 0.0005) {
      return {
        isEligible: false,
        status: 'REJECTED_INSIGNIFICANT_UPDATE',
        rejectionReason: `Setup revision ${setupRevision} price changes (< 0.05%) are insignificant. Broadcast throttled.`,
        failedCheckIndex: 19,
      };
    }
  }

  // Check 20: MT5 order transport remains strictly false (safety invariant check)
  if (decision.tradeExecutable !== false || decision.mt5OrderTransportEnabled !== false) {
    return {
      isEligible: false,
      status: 'REJECTED_VETO',
      rejectionReason: 'Safety invariant violation: execution flags are not locked READ_ONLY',
      failedCheckIndex: 20,
    };
  }

  // Check 21: Market price reference validity
  const marketPrice = telemetry?.bid && telemetry.bid > 0
    ? (broadcastDirection === 'BUY' ? telemetry.ask || telemetry.bid : telemetry.bid)
    : setup.entryZone.midpoint;

  // ALL 21 CHECKS PASSED: CONSTRUCT VALIDATED SIGNAL PAYLOAD
  const signalId = `SIG-${symbol}-${setup.setupId.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const target2 = tp2;
  const target3 = setup.targets && setup.targets.length > 2 ? setup.targets.find(t => t.targetIndex === 3 || t.label === 'TP3') : undefined;

  const messageType: 'NEW_OPPORTUNITY' | 'SETUP_UPDATE' | 'SETUP_INVALIDATED' =
    isInvalidatedNotice ? 'SETUP_INVALIDATED' : (setupRevision > 1 ? 'SETUP_UPDATE' : 'NEW_OPPORTUNITY');

  const tp1Ratio = Number((primaryTarget.rewardDistance / setup.stopLoss.distance).toFixed(2));

  const payload: ValidatedSignalPayload = {
    signalId,
    setupId: setup.setupId,
    setupRevision,
    messageType,
    symbol,
    direction: broadcastDirection,
    timeframe: setup.structuralContext?.structureTf || 'M15',
    marketPrice: Number(marketPrice.toFixed(5)),
    entryZone: {
      low: Number(setup.entryZone.low.toFixed(5)),
      high: Number(setup.entryZone.high.toFixed(5)),
      midpoint: Number(setup.entryZone.midpoint.toFixed(5)),
    },
    stopLoss: {
      price: Number(setup.stopLoss.price.toFixed(5)),
      distance: Number(setup.stopLoss.distance.toFixed(5)),
    },
    takeProfit1: {
      price: Number(primaryTarget.price.toFixed(5)),
      distance: Number(primaryTarget.rewardDistance.toFixed(5)),
      riskReward: tp1Ratio,
    },
    takeProfit2: {
      price: Number(target2.price.toFixed(5)),
      distance: Number(target2.rewardDistance.toFixed(5)),
      riskReward: Number(tp2Rr.toFixed(2)),
    },
    takeProfit3: target3 ? {
      price: Number(target3.price.toFixed(5)),
      distance: Number(target3.rewardDistance.toFixed(5)),
      riskReward: Number((target3.riskReward || (target3.rewardDistance / setup.stopLoss.distance)).toFixed(2)),
    } : undefined,
    riskRewardRatio: Number(tp2Rr.toFixed(2)),
    decisionEngine: {
      bias: decision.bias,
      confidencePct: decision.confidence,
      completenessPct: decision.evidenceCompleteness,
      independentDomainsCount: independentCount,
      maturity: decision.maturity,
    },
    setupIntelligence: {
      type: setup.setupType,
      lifecycle: setup.lifecycle,
      thesis: setup.thesis,
      invalidationPrice: Number(invalidationPrice.toFixed(5)),
    },
    sessionContext: {
      currentSession: decision.sessionContext?.sessionModel,
      activeKillzone: decision.sessionContext?.killzoneWindow === 'ACTIVE',
    },
    timestamps: {
      asOf: setup.asOf,
      marketDataTimestamp: quoteTimestamp,
      validatedAt: new Date().toISOString(),
    },
    idempotencyKey,
  };

  return {
    isEligible: true,
    status: 'ELIGIBLE',
    payload,
  };
}
