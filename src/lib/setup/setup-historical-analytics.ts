/**
 * FEF CORTEX — SETUP HISTORICAL OUTCOME ANALYTICS V1
 *
 * Deterministic aggregation and sample-honest analytics over persisted setups.
 *
 * Absolute Invariants:
 * 1. Calibration firewall: Strictly observational. Does NOT modify Decision V2
 *    confidence, completeness, agent votes, or tradeExecutable status.
 * 2. Minimum sample honesty: Exposes exact sample count (n). If n < 10,
 *    classifies as INSUFFICIENT_SAMPLE rather than manufacturing confidence.
 * 3. Accurate terminology: Uses `targetReachRate` and `setupSuccessRate`, NEVER "win rate"
 *    (as no brokerage execution or account P&L occurred).
 * 4. Dimensional slicing: Supports symbol, setupType, direction, and sessionModel filtering.
 */

import {
  LocalSetupLifecycleRepository,
  PersistedSetupRecord,
} from './setup-lifecycle-persistence';

export type StatisticalReliabilityTier =
  | 'INSUFFICIENT_SAMPLE'
  | 'LOW_SAMPLE'
  | 'MODERATE_SAMPLE'
  | 'LARGE_SAMPLE';

export const MINIMUM_STATISTICAL_SAMPLE = 10;

export interface SetupHistoricalAnalyticsFilter {
  symbol?: string;
  setupType?: string;
  direction?: string;
  sessionModel?: string;
  validatedOnly?: boolean;
  limit?: number;
}

export interface SetupHistoricalAnalyticsResult {
  filter: SetupHistoricalAnalyticsFilter;
  sampleCount: number;
  statisticalReliability: StatisticalReliabilityTier;

  totalSetupsObserved: number;
  validatedCount: number;
  validationRate: number; // 0–100%

  target1ReachedCount: number;
  target1ReachRate: number; // 0–100% of validated setups
  target2ReachedCount: number;
  target2ReachRate: number;
  target3ReachedCount: number;
  target3ReachRate: number;

  stopReachedCount: number;
  stopReachedRate: number;
  structuralInvalidationCount: number;
  invalidatedPreTriggerCount: number;
  expiredCount: number;
  unresolvedCount: number;
  ambiguousConflictCount: number;
  invalidatedCount: number;
  invalidationRate: number; // 0–100% of total setups
  invalidationAfterTarget1Count: number;
  invalidationAfterTarget1Rate: number; // 0–100% of setups that reached TP1
  setupSuccessRate: number; // 0–100% of validated setups (TP1 reach)

  entryZoneTouchedCount: number;
  entryZoneTouchRate: number; // 0–100%

  averageInitialRr: number | null;
  averageMfeR: number | null;
  averageMaeR: number | null;
  medianDurationMinutes: number | null;

  conversions: {
    watchToFormingRate: number | null;
    formingToValidatedRate: number | null;
  };

  bySetupType: Record<string, { total: number; validated: number; target1Reached: number; successRate: number }>;
  byDirection: Record<string, { total: number; validated: number; target1Reached: number; successRate: number }>;
  bySessionModel: Record<string, { total: number; validated: number; target1Reached: number; successRate: number }>;

  disclaimer: string;
}

export class SetupHistoricalAnalyticsEngine {
  /**
   * Computes comprehensive historical setup intelligence from SQLite records.
   */
  public static computeAnalytics(
    repo: LocalSetupLifecycleRepository,
    filter: SetupHistoricalAnalyticsFilter = {}
  ): SetupHistoricalAnalyticsResult {
    const allSetups = repo.getAllSetups({
      symbol: filter.symbol,
      limit: filter.limit || 5000,
    });

    // Apply in-memory filters
    const filtered = allSetups.filter((s) => {
      if (filter.setupType && s.setupType !== filter.setupType) return false;
      if (filter.direction && s.direction !== filter.direction) return false;
      if (filter.sessionModel && s.sessionModel !== filter.sessionModel) return false;
      if (filter.validatedOnly && !s.validatedAt && s.currentLifecycle !== 'VALIDATED') return false;
      return true;
    });

    const sampleCount = filtered.length;
    let reliability: StatisticalReliabilityTier = 'INSUFFICIENT_SAMPLE';
    if (sampleCount >= 100) {
      reliability = 'LARGE_SAMPLE';
    } else if (sampleCount >= 30) {
      reliability = 'MODERATE_SAMPLE';
    } else if (sampleCount >= MINIMUM_STATISTICAL_SAMPLE) {
      reliability = 'LOW_SAMPLE';
    } else {
      reliability = 'INSUFFICIENT_SAMPLE';
    }

    if (sampleCount === 0) {
      return this.emptyResult(filter, reliability);
    }

    let validatedCount = 0;
    let target1ReachedCount = 0;
    let target2ReachedCount = 0;
    let target3ReachedCount = 0;
    let stopReachedCount = 0;
    let structuralInvalidationCount = 0;
    let invalidatedPreTriggerCount = 0;
    let expiredCount = 0;
    let unresolvedCount = 0;
    let ambiguousConflictCount = 0;
    let entryZoneTouchedCount = 0;
    let invalidationAfterTarget1Count = 0;

    const rrValues: number[] = [];
    const mfeRValues: number[] = [];
    const maeRValues: number[] = [];
    const durationsMs: number[] = [];

    const bySetupType: Record<string, { total: number; validated: number; target1Reached: number; successRate: number }> = {};
    const byDirection: Record<string, { total: number; validated: number; target1Reached: number; successRate: number }> = {};
    const bySessionModel: Record<string, { total: number; validated: number; target1Reached: number; successRate: number }> = {};

    let watchCount = 0;
    let formingCount = 0;

    for (const setup of filtered) {
      const isValidated = setup.validatedAt !== null || setup.currentLifecycle === 'VALIDATED';
      if (isValidated) validatedCount++;

      if (setup.currentLifecycle === 'WATCH' || setup.currentLifecycle === 'FORMING' || isValidated) {
        watchCount++;
      }
      if (setup.currentLifecycle === 'FORMING' || isValidated) {
        formingCount++;
      }

      if (setup.entryZoneTouched) entryZoneTouchedCount++;

      // Objective Milestones Recognition
      const hasTarget1 = Boolean(
        setup.target1Reached ||
        setup.target1ReachedAt !== null ||
        setup.firstTargetReachedAt !== null ||
        setup.terminalState === 'TARGET_1_REACHED' ||
        setup.terminalState === 'TARGET_2_REACHED' ||
        setup.terminalState === 'TARGET_3_REACHED' ||
        setup.terminalState === 'COMPLETED'
      );
      const hasTarget2 = Boolean(
        setup.target2Reached ||
        setup.target2ReachedAt !== null ||
        setup.terminalState === 'TARGET_2_REACHED' ||
        setup.terminalState === 'TARGET_3_REACHED' ||
        setup.terminalState === 'COMPLETED'
      );
      const hasTarget3 = Boolean(
        setup.target3Reached ||
        setup.target3ReachedAt !== null ||
        setup.terminalState === 'TARGET_3_REACHED' ||
        setup.terminalState === 'COMPLETED'
      );

      if (hasTarget1) target1ReachedCount++;
      if (hasTarget2) target2ReachedCount++;
      if (hasTarget3) target3ReachedCount++;

      // Invalidation after Target 1
      const hitStopOrInvAfterT1 =
        hasTarget1 &&
        (setup.stopLevelReachedAt !== null ||
          setup.terminalState === 'STOP_LEVEL_REACHED' ||
          setup.outcomeResolution === 'STOP_LEVEL_REACHED' ||
          (setup.invalidatedAt && setup.invalidatedAt > (setup.target1ReachedAt || setup.firstTargetReachedAt || 0)));
      if (hitStopOrInvAfterT1) {
        invalidationAfterTarget1Count++;
      }

      // Terminal Resolution Breakdown
      if (setup.terminalState === 'STOP_LEVEL_REACHED' || setup.terminalState === 'STOP_REACHED') {
        stopReachedCount++;
      } else if (setup.terminalState === 'STRUCTURAL_INVALIDATION') {
        structuralInvalidationCount++;
      } else if (setup.terminalState === 'AMBIGUOUS_BAR_CONFLICT') {
        ambiguousConflictCount++;
      } else if (setup.terminalState === 'EXPIRED' || setup.terminalState === 'EXPIRED_UNTRIGGERED') {
        expiredCount++;
      } else if (setup.terminalState === 'INVALIDATED' || setup.terminalState === 'INVALIDATED_PRE_TRIGGER') {
        invalidatedPreTriggerCount++;
      } else if (!setup.terminalState || setup.terminalState === 'UNRESOLVED') {
        unresolvedCount++;
      }

      // Initial R:R
      if (setup.initialRr !== null && setup.initialRr > 0) {
        rrValues.push(setup.initialRr);
      }

      // Excursions
      if (setup.mfeR !== null) mfeRValues.push(setup.mfeR);
      if (setup.maeR !== null) maeRValues.push(setup.maeR);

      // Duration
      const endTimestamp = setup.resolvedAt || setup.lastSeenAt;
      if (endTimestamp > setup.firstSeenAt) {
        durationsMs.push(endTimestamp - setup.firstSeenAt);
      }

      // Dimensional aggregations
      this.accumulateDimension(bySetupType, setup.setupType, isValidated, hasTarget1);
      this.accumulateDimension(byDirection, setup.direction, isValidated, hasTarget1);
      this.accumulateDimension(bySessionModel, setup.sessionModel || 'UNKNOWN', isValidated, hasTarget1);
    }

    const validationRate = Number(((validatedCount / sampleCount) * 100).toFixed(1));
    const denominator = validatedCount > 0 ? validatedCount : sampleCount;
    const target1ReachRate = denominator > 0
      ? Number(((target1ReachedCount / denominator) * 100).toFixed(1))
      : 0;
    const target2ReachRate = denominator > 0
      ? Number(((target2ReachedCount / denominator) * 100).toFixed(1))
      : 0;
    const target3ReachRate = denominator > 0
      ? Number(((target3ReachedCount / denominator) * 100).toFixed(1))
      : 0;
    const stopReachedRate = denominator > 0
      ? Number(((stopReachedCount / denominator) * 100).toFixed(1))
      : 0;
    const invalidatedCount = structuralInvalidationCount + invalidatedPreTriggerCount;
    const invalidationRate = sampleCount > 0
      ? Number(((invalidatedCount / sampleCount) * 100).toFixed(1))
      : 0;
    const invalidationAfterTarget1Rate = target1ReachedCount > 0
      ? Number(((invalidationAfterTarget1Count / target1ReachedCount) * 100).toFixed(1))
      : 0;
    const setupSuccessRate = target1ReachRate;
    const entryZoneTouchRate = Number(((entryZoneTouchedCount / sampleCount) * 100).toFixed(1));

    const averageInitialRr = rrValues.length > 0
      ? Number((rrValues.reduce((a, b) => a + b, 0) / rrValues.length).toFixed(2))
      : null;
    const averageMfeR = mfeRValues.length > 0
      ? Number((mfeRValues.reduce((a, b) => a + b, 0) / mfeRValues.length).toFixed(2))
      : null;
    const averageMaeR = maeRValues.length > 0
      ? Number((maeRValues.reduce((a, b) => a + b, 0) / maeRValues.length).toFixed(2))
      : null;

    durationsMs.sort((a, b) => a - b);
    const medianDurationMinutes = durationsMs.length > 0
      ? Number((durationsMs[Math.floor(durationsMs.length / 2)] / 60_000).toFixed(1))
      : null;

    const watchToFormingRate = watchCount > 0
      ? Number(((formingCount / watchCount) * 100).toFixed(1))
      : null;
    const formingToValidatedRate = formingCount > 0
      ? Number(((validatedCount / formingCount) * 100).toFixed(1))
      : null;

    // Finalize dimension success rates
    for (const dim of [bySetupType, byDirection, bySessionModel]) {
      for (const key of Object.keys(dim)) {
        const item = dim[key];
        item.successRate = item.validated > 0
          ? Number(((item.target1Reached / item.validated) * 100).toFixed(1))
          : 0;
      }
    }

    return {
      filter,
      sampleCount,
      statisticalReliability: reliability,
      totalSetupsObserved: sampleCount,
      validatedCount,
      validationRate,
      target1ReachedCount,
      target1ReachRate,
      target2ReachedCount,
      target2ReachRate,
      target3ReachedCount,
      target3ReachRate,
      stopReachedCount,
      stopReachedRate,
      structuralInvalidationCount,
      invalidatedPreTriggerCount,
      expiredCount,
      unresolvedCount,
      ambiguousConflictCount,
      invalidatedCount,
      invalidationRate,
      invalidationAfterTarget1Count,
      invalidationAfterTarget1Rate,
      setupSuccessRate,
      entryZoneTouchedCount,
      entryZoneTouchRate,
      averageInitialRr,
      averageMfeR,
      averageMaeR,
      medianDurationMinutes,
      conversions: {
        watchToFormingRate,
        formingToValidatedRate,
      },
      bySetupType,
      byDirection,
      bySessionModel,
      disclaimer: reliability === 'INSUFFICIENT_SAMPLE'
        ? '[INSUFFICIENT SAMPLE - n < 10]: Pure observational setup outcome tracking. CORTEX maintains execution mode READ_ONLY. These metrics represent structural objective reach without simulated or realized brokerage P&L.'
        : 'Pure observational setup outcome tracking. CORTEX maintains execution mode READ_ONLY. These metrics represent structural objective reach without simulated or realized brokerage P&L.',
    };
  }

  private static accumulateDimension(
    dict: Record<string, { total: number; validated: number; target1Reached: number; successRate: number }>,
    key: string,
    isValidated: boolean,
    isTargetReached: boolean
  ): void {
    if (!dict[key]) {
      dict[key] = { total: 0, validated: 0, target1Reached: 0, successRate: 0 };
    }
    dict[key].total++;
    if (isValidated) dict[key].validated++;
    if (isTargetReached) dict[key].target1Reached++;
  }

  private static emptyResult(
    filter: SetupHistoricalAnalyticsFilter,
    reliability: StatisticalReliabilityTier
  ): SetupHistoricalAnalyticsResult {
    return {
      filter,
      sampleCount: 0,
      statisticalReliability: reliability,
      totalSetupsObserved: 0,
      validatedCount: 0,
      validationRate: 0,
      target1ReachedCount: 0,
      target1ReachRate: 0,
      target2ReachedCount: 0,
      target2ReachRate: 0,
      target3ReachedCount: 0,
      target3ReachRate: 0,
      stopReachedCount: 0,
      stopReachedRate: 0,
      structuralInvalidationCount: 0,
      invalidatedPreTriggerCount: 0,
      expiredCount: 0,
      unresolvedCount: 0,
      ambiguousConflictCount: 0,
      invalidatedCount: 0,
      invalidationRate: 0,
      invalidationAfterTarget1Count: 0,
      invalidationAfterTarget1Rate: 0,
      setupSuccessRate: 0,
      entryZoneTouchedCount: 0,
      entryZoneTouchRate: 0,
      averageInitialRr: null,
      averageMfeR: null,
      averageMaeR: null,
      medianDurationMinutes: null,
      conversions: {
        watchToFormingRate: null,
        formingToValidatedRate: null,
      },
      bySetupType: {},
      byDirection: {},
      bySessionModel: {},
      disclaimer: 'No setup observations found for specified filters.',
    };
  }
}
