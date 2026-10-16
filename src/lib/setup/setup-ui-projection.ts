/**
 * FEF CORTEX — SETUP INTELLIGENCE V3 UI PROJECTION
 *
 * Sanitizes SetupIntelligenceV3 into a client-safe, lightweight projection.
 * Strictly guarantees:
 * - Pure intelligence contract: tradeExecutable is strictly false
 * - executionMode is strictly 'READ_ONLY'
 * - Zero exposure of secrets, tokens, or local storage paths
 * - Deterministic fail-closed defaults when telemetry is offline or unmapped (GER40)
 */

import {
  SetupIntelligenceV3,
  SetupLifecycleV3,
  SetupDirectionV3,
  SetupTypeV3,
  SetupEntryZoneV3,
  SetupTriggerV3,
  SetupInvalidationV3,
  SetupStopLossV3,
  SetupTargetV3,
  SetupRiskV3,
  SetupRewardV3,
  SetupRiskRewardV3,
  SetupConfirmationRequirementV3,
} from './setup-intelligence-v3';

export interface SetupIntelligenceV3UiProjection {
  setupId: string;
  symbol: string;
  snapshotId: string;
  asOf: number;

  lifecycle: SetupLifecycleV3;
  direction: SetupDirectionV3;
  setupType: SetupTypeV3;

  thesis: string;

  entryZone: SetupEntryZoneV3 | null;
  trigger: SetupTriggerV3;

  invalidation: SetupInvalidationV3 | null;
  stopLoss: SetupStopLossV3 | null;

  targets: SetupTargetV3[];

  risk: SetupRiskV3 | null;
  reward: SetupRewardV3 | null;
  riskReward: SetupRiskRewardV3 | null;

  confirmationRequirements: SetupConfirmationRequirementV3[];
  confirmationsSatisfied: string[];
  confirmationsMissing: string[];

  supportingEvidence: string[];
  opposingEvidence: string[];

  structuralContext: {
    structureTf: string;
    trend: string;
    swingsIdentified: boolean;
    fvgCount: number;
    obCount: number;
  };

  liquidityContext: {
    sweepDetected: boolean;
    opposingLiquidityTarget?: number;
    poolProximity?: string;
  };

  volatilityContext: {
    atr: number;
    spreadPts: number;
    isSpreadNormal: boolean;
  };

  sessionContext: {
    marketAvailability: 'OPEN' | 'CLOSED' | 'UNAVAILABLE';
    sessionModel: string;
    killzoneWindow: string;
    is24x7: boolean;
  };

  expiresAt: number | null;
  invalidatedAt: number | null;
  invalidationReason: string | null;

  readiness: 'READY' | 'PARTIAL' | 'DATA_LIMITED' | 'UNAVAILABLE';
  dataQuality: 'HEALTHY' | 'STALE' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE';

  history?: SetupHistoricalIntelligenceUiProjection;

  tradeExecutable: false;
  executionMode: 'READ_ONLY';
}

export interface SetupHistoricalIntelligenceUiProjection {
  sampleCount: number;
  statisticalReliability: string;
  totalSetups: number;
  validatedCount: number;
  validationRate: number; // 0-100%
  targetReachRate: number; // 0-100%
  target1ReachRate?: number;
  target2ReachRate?: number;
  target3ReachRate?: number;
  invalidationRate: number; // 0-100%
  invalidationAfterTarget1Rate?: number;
  averageMfeR: number | null;
  averageMaeR: number | null;
  averageInitialRr: number | null;
  entryZoneTouchRate: number;
  recentSetups: Array<{
    setupId: string;
    lifecycle: string;
    direction: string;
    setupType: string;
    initialRr: number | null;
    outcomeResolution: string;
    mfeR: number | null;
    firstSeenAt: number;
    resolvedAt: number | null;
  }>;
}

/**
 * Projects SetupIntelligenceV3 safely for client UI consumption.
 */
export function projectSetupV3ForUi(
  setup?: SetupIntelligenceV3 | null,
  symbol?: string,
  history?: SetupHistoricalIntelligenceUiProjection | null
): SetupIntelligenceV3UiProjection {
  const isUnavailable = !setup || setup.readiness === 'UNAVAILABLE' || symbol === 'GER40';

  if (isUnavailable) {
    const sym = symbol || setup?.symbol || 'UNKNOWN';
    const isCrypto = sym.includes('BTC') || sym.includes('ETH') || sym.includes('SOL');
    const asOf = setup?.asOf || Date.now();

    return {
      setupId: `SETUP-${sym}-UNAVAILABLE`,
      symbol: sym,
      snapshotId: setup?.snapshotId || `snap-${sym}-${asOf}`,
      asOf,
      lifecycle: 'NO_SETUP',
      direction: 'NONE',
      setupType: 'UNCLASSIFIED',
      thesis: sym === 'GER40'
        ? 'Instrument telemetry unavailable for GER40 (broker instrument not mapped).'
        : 'Setup intelligence unavailable: missing telemetry or fail-closed state.',
      entryZone: null,
      trigger: {
        state: 'UNAVAILABLE',
        type: 'NONE',
        reason: 'Market telemetry unavailable',
      },
      invalidation: null,
      stopLoss: null,
      targets: [],
      risk: null,
      reward: null,
      riskReward: null,
      confirmationRequirements: [],
      confirmationsSatisfied: [],
      confirmationsMissing: ['Market telemetry stream required'],
      supportingEvidence: [],
      opposingEvidence: [],
      structuralContext: {
        structureTf: 'H1',
        trend: 'UNKNOWN',
        swingsIdentified: false,
        fvgCount: 0,
        obCount: 0,
      },
      liquidityContext: {
        sweepDetected: false,
      },
      volatilityContext: {
        atr: 0,
        spreadPts: 0,
        isSpreadNormal: false,
      },
      sessionContext: {
        marketAvailability: 'UNAVAILABLE',
        sessionModel: 'OFF_HOURS',
        killzoneWindow: isCrypto ? 'NOT_APPLICABLE' : 'INACTIVE',
        is24x7: isCrypto,
      },
      expiresAt: null,
      invalidatedAt: null,
      invalidationReason: null,
      readiness: 'UNAVAILABLE',
      dataQuality: 'UNAVAILABLE',
      history: history || undefined,
      tradeExecutable: false,
      executionMode: 'READ_ONLY',
    };
  }

  return {
    setupId: setup.setupId,
    symbol: setup.symbol,
    snapshotId: setup.snapshotId,
    asOf: setup.asOf,
    lifecycle: setup.lifecycle,
    direction: setup.direction,
    setupType: setup.setupType,
    thesis: setup.thesis,
    entryZone: setup.entryZone ? { ...setup.entryZone } : null,
    trigger: { ...setup.trigger },
    invalidation: setup.invalidation ? { ...setup.invalidation } : null,
    stopLoss: setup.stopLoss ? { ...setup.stopLoss } : null,
    targets: setup.targets.map(t => ({ ...t })),
    risk: setup.risk ? { ...setup.risk } : null,
    reward: setup.reward ? { ...setup.reward } : null,
    riskReward: setup.riskReward ? { ...setup.riskReward } : null,
    confirmationRequirements: setup.confirmationRequirements.map(c => ({ ...c })),
    confirmationsSatisfied: [...setup.confirmationsSatisfied],
    confirmationsMissing: [...setup.confirmationsMissing],
    supportingEvidence: [...setup.supportingEvidence],
    opposingEvidence: [...setup.opposingEvidence],
    structuralContext: { ...setup.structuralContext },
    liquidityContext: { ...setup.liquidityContext },
    volatilityContext: { ...setup.volatilityContext },
    sessionContext: { ...setup.sessionContext },
    expiresAt: setup.expiresAt,
    invalidatedAt: setup.invalidatedAt,
    invalidationReason: setup.invalidationReason,
    readiness: setup.readiness,
    dataQuality: setup.dataQuality,
    history: history || undefined,
    tradeExecutable: false,
    executionMode: 'READ_ONLY',
  };
}
