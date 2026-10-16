/**
 * FEF CORTEX — SETUP HISTORICAL OUTCOME & EXCURSION ENGINE V1
 *
 * Deterministic outcome evaluation for persisted setups against subsequent
 * broker market observations (OHLC candles or tick prices).
 *
 * Absolute Invariants:
 * 1. Truthful outcome semantics: Tracks SETUP outcome, NEVER trade execution or account P&L.
 * 2. Ambiguous bar fail-closed: If a single OHLC candle touches both stop and target,
 *    CORTEX represents ambiguity truthfully as AMBIGUOUS_BAR_CONFLICT rather than
 *    arbitrarily selecting the favorable outcome.
 * 3. Directional asymmetry: Correctly handles LONG vs SHORT level polarity.
 * 4. MFE / MAE normalized R metrics require valid reference entry midpoint and risk distance.
 * 5. Target progression: Validates ordered objective achievement (TP1 -> TP2 -> TP3).
 * 6. Entry zone touch tracking: Accurately identifies whether price entered the zone.
 */

import { OHLCCandle } from '../market/canonical-market-snapshot';
import {
  PersistedSetupRecord,
  SetupOutcomeResolution,
  SetupTerminalState,
  LocalSetupLifecycleRepository,
} from './setup-lifecycle-persistence';

export interface SetupOutcomeEvaluation {
  setupId: string;
  evaluatedBarsCount: number;
  entryZoneTouched: boolean;
  entryZoneTouchedAt: number | null;
  triggerConfirmedAt: number | null;
  firstTargetReachedAt: number | null;
  target1Reached: boolean;
  target1ReachedAt: number | null;
  target2Reached: boolean;
  target2ReachedAt: number | null;
  target3Reached: boolean;
  target3ReachedAt: number | null;
  stopLevelReachedAt: number | null;
  invalidatedAt: number | null;
  expiredAt: number | null;
  mfePrice: number | null;
  maePrice: number | null;
  mfeR: number | null;
  maeR: number | null;
  outcomeResolution: SetupOutcomeResolution;
  terminalState: SetupTerminalState | null;
  resolvedAt: number | null;
  outcomeAmbiguous: boolean;
  notes: string[];
}

export class SetupOutcomeEngine {
  public static evaluateCandles(setup: any, subsequentCandles: any[]): SetupOutcomeEvaluation {
    return SetupOutcomeEngine.evaluateOutcome(setup, subsequentCandles);
  }

  /**
   * Evaluates setup outcome and excursions against subsequent chronological candles.
   */
  public static evaluateOutcome(
    setup: PersistedSetupRecord | any,
    subsequentCandles: OHLCCandle[]
  ): SetupOutcomeEvaluation {
    const isLong = setup.direction === 'LONG';
    const isShort = setup.direction === 'SHORT';

    const entryMid = setup.entryMidpoint ?? setup.entryMid ?? (
      setup.entryZoneLow != null && setup.entryZoneHigh != null
        ? (setup.entryZoneLow + setup.entryZoneHigh) / 2
        : (setup.entryLow != null && setup.entryHigh != null
            ? (setup.entryLow + setup.entryHigh) / 2
            : (setup.entryZone?.midpoint ?? (setup.entryZone?.low != null && setup.entryZone?.high != null ? (setup.entryZone.low + setup.entryZone.high) / 2 : null)))
    );
    const sl = setup.stopLoss != null ? (typeof setup.stopLoss === 'object' ? setup.stopLoss.price : setup.stopLoss) : null;
    const computedRisk = setup.riskDistance ?? (entryMid !== null && sl !== null ? Math.abs(entryMid - sl) : null);

    const resolvedTarget1 = setup.target1 ?? (Array.isArray(setup.targets) && setup.targets.length > 0 ? setup.targets[0].price : null) ?? setup.reward?.tp1Price ?? null;
    const resolvedTarget2 = setup.target2 ?? (Array.isArray(setup.targets) && setup.targets.length > 1 ? setup.targets[1].price : null) ?? setup.reward?.tp2Price ?? null;
    const resolvedTarget3 = setup.target3 ?? (Array.isArray(setup.targets) && setup.targets.length > 2 ? setup.targets[2].price : null) ?? setup.reward?.tp3Price ?? null;

    const hasGeometry =
      entryMid !== null &&
      sl !== null &&
      resolvedTarget1 !== null &&
      computedRisk !== null &&
      computedRisk > 0;

    let entryZoneTouched = Boolean(setup.entryZoneTouched);
    let entryZoneTouchedAt = setup.entryZoneTouchedAt || null;
    let target1ReachedAt = setup.target1ReachedAt || setup.firstTargetReachedAt || null;
    let target1Reached = Boolean(target1ReachedAt || setup.target1Reached);
    let target2ReachedAt = setup.target2ReachedAt || null;
    let target2Reached = Boolean(target2ReachedAt || setup.target2Reached);
    let target3ReachedAt = setup.target3ReachedAt || null;
    let target3Reached = Boolean(target3ReachedAt || setup.target3Reached);
    let stopLevelReachedAt = setup.stopLevelReachedAt || null;
    let invalidatedAt = setup.invalidatedAt || null;
    let expiredAt = setup.expiredAt || null;
    const triggerConfirmedAt = setup.triggerConfirmedAt || null;

    let mfePrice = setup.mfePrice ?? null;
    let maePrice = setup.maePrice ?? null;
    let mfeR = setup.mfeR ?? null;
    let maeR = setup.maeR ?? null;

    let outcomeResolution: SetupOutcomeResolution = setup.outcomeResolution || 'UNRESOLVED';
    let terminalState: SetupTerminalState | null = setup.terminalState || null;
    let resolvedAt: number | null = setup.resolvedAt || null;
    let outcomeAmbiguous = setup.outcomeAmbiguous || false;
    const notes: string[] = [];

    if (!hasGeometry || (!isLong && !isShort)) {
      return {
        setupId: setup.setupId,
        evaluatedBarsCount: subsequentCandles ? subsequentCandles.length : 0,
        entryZoneTouched,
        entryZoneTouchedAt,
        triggerConfirmedAt,
        firstTargetReachedAt: target1ReachedAt,
        target1Reached,
        target1ReachedAt,
        target2Reached,
        target2ReachedAt,
        target3Reached,
        target3ReachedAt,
        stopLevelReachedAt,
        invalidatedAt,
        expiredAt,
        mfePrice,
        maePrice,
        mfeR,
        maeR,
        outcomeResolution: setup.terminalState === 'INVALIDATED'
          ? 'INVALIDATED_PRE_TRIGGER'
          : (setup.terminalState === 'EXPIRED' ? 'EXPIRED_UNTRIGGERED' : 'UNRESOLVED'),
        terminalState,
        resolvedAt,
        outcomeAmbiguous,
        notes: ['Setup lacks complete geometry for excursion evaluation'],
      };
    }

    const midpoint = entryMid!;
    const inv = setup.invalidationPrice ?? (typeof setup.invalidation === 'object' ? setup.invalidation?.price : setup.invalidation) ?? null;
    const tp1 = resolvedTarget1!;
    const tp2 = resolvedTarget2;
    const tp3 = resolvedTarget3;
    const riskDist = computedRisk!;
    const entryLow = setup.entryZoneLow ?? setup.entryLow ?? setup.entryZone?.low ?? midpoint;
    const entryHigh = setup.entryZoneHigh ?? setup.entryHigh ?? setup.entryZone?.high ?? midpoint;

    // Filter and sort candles chronologically ascending
    const candles = (subsequentCandles || [])
      .filter((c) => c && typeof c === 'object' && Number.isFinite(c.high) && Number.isFinite(c.low))
      .filter((c) => (c.timestamp || (c as any).time) >= (setup.firstSeenAt || setup.asOf || 0))
      .sort((a, b) => (a.timestamp || (a as any).time) - (b.timestamp || (b as any).time));

    for (const candle of candles) {
      const cTime = candle.timestamp || (candle as any).time;
      const cHigh = candle.high;
      const cLow = candle.low;

      // 1. Entry zone touch evaluation
      if (!entryZoneTouched && entryLow !== null && entryHigh !== null) {
        const touched = isLong
          ? cLow <= entryHigh && cHigh >= entryLow
          : cHigh >= entryLow && cLow <= entryHigh;

        if (touched) {
          entryZoneTouched = true;
          entryZoneTouchedAt = cTime;
          notes.push(`Entry zone touched at bar ${cTime} [${cLow} - ${cHigh}]`);
        }
      }

      // 2. Excursion tracking (MFE & MAE)
      if (isLong) {
        if (mfePrice === null || cHigh > mfePrice) {
          mfePrice = cHigh;
          mfeR = Number(((mfePrice - midpoint) / riskDist).toFixed(2));
        }
        if (maePrice === null || cLow < maePrice) {
          maePrice = cLow;
          maeR = Number(((midpoint - maePrice) / riskDist).toFixed(2));
        }
      } else if (isShort) {
        if (mfePrice === null || cLow < mfePrice) {
          mfePrice = cLow;
          mfeR = Number(((midpoint - mfePrice) / riskDist).toFixed(2));
        }
        if (maePrice === null || cHigh > maePrice) {
          maePrice = cHigh;
          maeR = Number(((maePrice - midpoint) / riskDist).toFixed(2));
        }
      }

      const touchesStop = isLong ? cLow <= sl : cHigh >= sl;
      const touchesInv = inv !== null ? (isLong ? cLow <= inv : cHigh >= inv) : false;
      const touchesTp1 = isLong ? cHigh >= tp1 : cLow <= tp1;
      const touchesTp2 = tp2 !== null ? (isLong ? cHigh >= tp2 : cLow <= tp2) : false;
      const touchesTp3 = tp3 !== null ? (isLong ? cHigh >= tp3 : cLow <= tp3) : false;

      // Check if already in a permanent terminal state before evaluating further
      const isPermanentlyTerminal =
        terminalState === 'STOP_LEVEL_REACHED' ||
        terminalState === 'STOP_REACHED' ||
        terminalState === 'STRUCTURAL_INVALIDATION' ||
        terminalState === 'INVALIDATED' ||
        terminalState === 'INVALIDATED_PRE_TRIGGER' ||
        terminalState === 'EXPIRED' ||
        terminalState === 'EXPIRED_UNTRIGGERED' ||
        terminalState === 'AMBIGUOUS_BAR_CONFLICT' ||
        terminalState === 'COMPLETED' ||
        terminalState === 'TARGET_3_REACHED';

      if (isPermanentlyTerminal) {
        break;
      }

      // 3. Ambiguous Bar Conflict Invariant
      // If a single bar touches BOTH stop loss/invalidation AND a new target milestone,
      // intrabar ordering is unknown. Must FAIL CLOSED: mark AMBIGUOUS_BAR_CONFLICT without assuming favorable execution.
      if (!target1Reached && (touchesStop || touchesInv) && touchesTp1) {
        outcomeAmbiguous = true;
        terminalState = 'AMBIGUOUS_BAR_CONFLICT';
        outcomeResolution = 'AMBIGUOUS_BAR_CONFLICT';
        resolvedAt = cTime;
        notes.push(
          `Ambiguous bar conflict at bar ${cTime}: bar touched stop/invalidation and TP1. Fail-closed.`
        );
        break;
      }
      if (target1Reached && !target2Reached && (touchesStop || touchesInv) && touchesTp2) {
        outcomeAmbiguous = true;
        terminalState = 'AMBIGUOUS_BAR_CONFLICT';
        outcomeResolution = 'AMBIGUOUS_BAR_CONFLICT';
        resolvedAt = cTime;
        notes.push(
          `Ambiguous bar conflict at bar ${cTime}: bar touched stop/invalidation and TP2. Fail-closed.`
        );
        break;
      }
      if (target2Reached && !target3Reached && (touchesStop || touchesInv) && touchesTp3) {
        outcomeAmbiguous = true;
        terminalState = 'AMBIGUOUS_BAR_CONFLICT';
        outcomeResolution = 'AMBIGUOUS_BAR_CONFLICT';
        resolvedAt = cTime;
        notes.push(
          `Ambiguous bar conflict at bar ${cTime}: bar touched stop/invalidation and TP3. Fail-closed.`
        );
        break;
      }

      // 4. Milestone Tracking (TP1 -> TP2 -> TP3)
      if (!target1Reached && touchesTp1) {
        target1Reached = true;
        target1ReachedAt = cTime;
        terminalState = 'TARGET_1_REACHED';
        outcomeResolution = 'TARGET_1_REACHED';
        resolvedAt = cTime;
        notes.push(`Target 1 (${tp1}) reached at bar ${cTime}`);
      }

      if (target1Reached && !target2Reached && touchesTp2) {
        target2Reached = true;
        target2ReachedAt = cTime;
        terminalState = 'TARGET_2_REACHED';
        outcomeResolution = 'TARGET_2_REACHED';
        resolvedAt = cTime;
        notes.push(`Target 2 (${tp2}) reached at bar ${cTime}`);
      }

      if (target2Reached && !target3Reached && touchesTp3) {
        target3Reached = true;
        target3ReachedAt = cTime;
        terminalState = 'TARGET_3_REACHED';
        outcomeResolution = 'TARGET_3_REACHED';
        resolvedAt = cTime;
        notes.push(`Target 3 (${tp3}) reached at bar ${cTime}`);
        break; // All targets achieved
      }

      // 5. Stop Loss / Structural Invalidation Resolution
      if (touchesStop || touchesInv) {
        if (!entryZoneTouched) {
          // Untriggered setup breaching adverse boundary before entry zone was ever touched
          terminalState = 'INVALIDATED';
          outcomeResolution = 'INVALIDATED_PRE_TRIGGER';
          invalidatedAt = cTime;
          resolvedAt = cTime;
          notes.push(`Adverse boundary breached before entry zone was touched at bar ${cTime}`);
          break;
        } else if (touchesStop) {
          stopLevelReachedAt = cTime;
          if (target1Reached) {
            terminalState = 'STOP_LEVEL_REACHED';
            outcomeResolution = 'STOP_LEVEL_REACHED';
            notes.push(`Target 1 reached at ${target1ReachedAt}; stop level reached at ${cTime}`);
          } else {
            terminalState = 'STOP_REACHED';
            outcomeResolution = 'STOP_REACHED';
            notes.push(`Stop loss level (${sl}) breached at bar ${cTime} (low: ${cLow}, high: ${cHigh})`);
          }
          resolvedAt = cTime;
          break;
        } else {
          invalidatedAt = cTime;
          terminalState = 'STRUCTURAL_INVALIDATION';
          outcomeResolution = 'STRUCTURAL_INVALIDATION';
          resolvedAt = cTime;
          if (target1Reached) {
            notes.push(`Target 1 reached at ${target1ReachedAt}; structural invalidation level breached at ${cTime}`);
          } else {
            notes.push(`Structural invalidation level (${inv}) breached at bar ${cTime}`);
          }
          break;
        }
      }

      // 6. Expiry Resolution
      if (setup.expiredAt && cTime >= setup.expiredAt && (!terminalState || terminalState === 'UNRESOLVED' || terminalState === 'TARGET_1_REACHED' || terminalState === 'TARGET_2_REACHED')) {
        if (target1Reached) {
          notes.push(`Setup reached expiry timestamp (${setup.expiredAt}) after achieving target milestone at bar ${cTime}`);
          break;
        } else {
          terminalState = 'EXPIRED';
          outcomeResolution = entryZoneTouched ? 'EXPIRED' : 'EXPIRED_UNTRIGGERED';
          expiredAt = cTime;
          resolvedAt = cTime;
          notes.push(`Setup reached expiry timestamp (${setup.expiredAt}) at bar ${cTime}`);
          break;
        }
      }
    }

    return {
      setupId: setup.setupId,
      evaluatedBarsCount: candles.length,
      entryZoneTouched,
      entryZoneTouchedAt,
      triggerConfirmedAt,
      firstTargetReachedAt: target1ReachedAt,
      target1Reached,
      target1ReachedAt,
      target2Reached,
      target2ReachedAt,
      target3Reached,
      target3ReachedAt,
      stopLevelReachedAt,
      invalidatedAt,
      expiredAt,
      mfePrice,
      maePrice,
      mfeR,
      maeR,
      outcomeResolution,
      terminalState,
      resolvedAt,
      outcomeAmbiguous,
      notes,
    };
  }

  /**
   * Evaluates outcomes and updates the SQLite repository.
   */
  public static evaluateAndUpdateRepository(
    repo: LocalSetupLifecycleRepository,
    setupId: string,
    candles: OHLCCandle[]
  ): SetupOutcomeEvaluation | null {
    const setup = repo.getSetupById(setupId);
    if (!setup) return null;

    const evaluation = this.evaluateOutcome(setup, candles);

    repo.updateExcursionAndOutcome(setupId, {
      mfePrice: evaluation.mfePrice,
      maePrice: evaluation.maePrice,
      mfeR: evaluation.mfeR,
      maeR: evaluation.maeR,
      entryZoneTouched: evaluation.entryZoneTouched,
      entryZoneTouchedAt: evaluation.entryZoneTouchedAt,
      firstTargetReachedAt: evaluation.target1ReachedAt,
      target2ReachedAt: evaluation.target2ReachedAt,
      target3ReachedAt: evaluation.target3ReachedAt,
      stopLevelReachedAt: evaluation.stopLevelReachedAt,
      terminalState: evaluation.terminalState,
      resolvedAt: evaluation.resolvedAt,
      outcomeResolution: evaluation.outcomeResolution,
      outcomeAmbiguous: evaluation.outcomeAmbiguous,
    });

    return evaluation;
  }
}
