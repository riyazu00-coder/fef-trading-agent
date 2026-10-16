/**
 * FEF CORTEX — SETUP INTELLIGENCE V3
 *
 * Structured Setup Lifecycle + Entry/Risk/Target Intelligence Layer.
 * Downstream of Decision Engine V2; does NOT vote into upstream consensus.
 * Pure intelligence contract — tradeExecutable is strictly false.
 */

import { OHLCCandle } from '../market/canonical-market-snapshot';
import { MarketStructure } from '../market/market-structure-engine';
import { TradeBlueprint, evaluateBlueprintRiskGeometry, CANONICAL_SL_POLICY } from '../trading/trade-blueprint-engine';
import { SetupLifecycleState } from '../trading/setup-lifecycle-types';
import { DecisionIntelligenceV2 } from '../decision/decision-engine-v2';
import { CandleCloseTriggerEvidence, MultiTimeframeContext } from '../triggers/trigger-types';
import { LiveMarketAsset } from '../providers/real-market-api';
import { CanonicalEvidenceBundle } from '../evidence/canonical-evidence-bundle';
import { getMarketDefinition } from '../registry/market-registry';

export type SetupLifecycleV3 =
  | 'NO_SETUP'
  | 'OBSERVING'
  | 'WATCH'
  | 'FORMING'
  | 'VALIDATED'
  | 'INVALIDATED'
  | 'EXPIRED';

export type SetupDirectionV3 = 'LONG' | 'SHORT' | 'NONE';

export type SetupTypeV3 =
  | 'BREAKOUT'
  | 'RETEST'
  | 'REVERSAL'
  | 'CONTINUATION'
  | 'RANGE_REJECTION'
  | 'LIQUIDITY_SWEEP'
  | 'MOMENTUM_EXPANSION'
  | 'UNCLASSIFIED';

export type ConfirmationStatusV3 = 'SATISFIED' | 'MISSING' | 'FAILED' | 'NOT_APPLICABLE';

export interface SetupConfirmationRequirementV3 {
  id: string;
  label: string;
  status: ConfirmationStatusV3;
  source: string;
  details?: string;
}

export interface SetupEntryZoneV3 {
  low: number;
  high: number;
  midpoint: number;
  source: string;
  rationale: string;
}

export interface SetupTriggerV3 {
  state: 'WAITING' | 'CONFIRMED' | 'FAILED' | 'NOT_REQUIRED' | 'UNAVAILABLE';
  type: string;
  triggerLevel?: number;
  confirmationClose?: number;
  timeframe?: string;
  reason?: string;
}

export interface SetupInvalidationV3 {
  price: number;
  condition: string;
  source: string;
  rationale: string;
}

export interface SetupStopLossV3 {
  price: number;
  rationale: string;
  bufferAtrMultiplier: number;
  distance: number;
}

export interface SetupTargetV3 {
  targetIndex: number;
  label: 'TP1' | 'TP2' | 'TP3';
  price: number;
  source: string;
  rationale: string;
  rewardDistance: number;
  riskReward: number;
}

export interface SetupRiskV3 {
  riskDistance: number;
  riskAtrMultiple: number;
}

export interface SetupRewardV3 {
  rewardDistance: number;
  primaryTargetPrice: number;
}

export interface SetupRiskRewardV3 {
  ratio: number;
  formatted: string;
  meetsMinimumThreshold: boolean;
}

export interface SetupIntelligenceV3 {
  version: '3.0';
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

  tradeExecutable: false;
}

export interface SetupIntelligenceV3Inputs {
  symbol: string;
  currentPrice: number;
  marketStructure: MarketStructure | null;
  candles?: OHLCCandle[];
  blueprint: TradeBlueprint | null;
  decisionV2: DecisionIntelligenceV2;
  triggerEvidence?: CandleCloseTriggerEvidence | null;
  multiTimeframeContext?: MultiTimeframeContext | null;
  liveAsset?: LiveMarketAsset | null;
  evidenceBundle?: CanonicalEvidenceBundle | null;
  evaluationTime?: Date;
}

export const MINIMUM_SETUP_RR = 2.0;

/**
 * Builds deterministic Setup ID based on stable structural anchors
 * rather than high-frequency telemetry timestamps.
 */
export function buildDeterministicSetupId(
  symbol: string,
  direction: SetupDirectionV3,
  setupType: SetupTypeV3,
  structuralAnchorTs: number
): string {
  if (direction === 'NONE' || setupType === 'UNCLASSIFIED' || structuralAnchorTs <= 0) {
    return `SETUP-${symbol}-NONE`;
  }
  return `SETUP-${symbol}-${direction}-${setupType}-${structuralAnchorTs}`;
}

export class SetupIntelligenceEngineV3 {
  /**
   * Primary Evaluation Entrypoint for Setup Intelligence V3.
   */
  public static evaluateSetup(inputs: SetupIntelligenceV3Inputs): SetupIntelligenceV3 {
    const {
      symbol,
      currentPrice,
      marketStructure,
      candles,
      blueprint,
      decisionV2,
      triggerEvidence,
      multiTimeframeContext,
      liveAsset,
      evidenceBundle,
      evaluationTime = new Date()
    } = inputs;

    const marketDef = getMarketDefinition(symbol);
    const precision = marketDef?.decimalPrecision ?? 2;
    const asOf = evaluationTime.getTime();
    const snapshotId = decisionV2?.snapshotId || `snap-${symbol}-${asOf}`;

    // 1. Initial State / Fail-Closed Guards
    const isGer40 = symbol === 'GER40';
    const isLiveAssetPresent = Boolean(liveAsset && liveAsset.price > 0);
    const isTelemetryUnavailable = isGer40 || !isLiveAssetPresent || liveAsset?.feedStatus === 'OFFLINE' || decisionV2?.maturity === 'UNAVAILABLE';

    if (isTelemetryUnavailable) {
      return {
        version: '3.0',
        setupId: `SETUP-${symbol}-UNAVAILABLE`,
        symbol,
        snapshotId,
        asOf,
        lifecycle: 'NO_SETUP',
        direction: 'NONE',
        setupType: 'UNCLASSIFIED',
        thesis: isGer40
          ? 'Instrument telemetry unavailable for GER40 (broker instrument not mapped).'
          : 'Broker telemetry offline or unavailable for instrument.',
        entryZone: null,
        trigger: { state: 'UNAVAILABLE', type: 'NONE', reason: 'Market telemetry unavailable' },
        invalidation: null,
        stopLoss: null,
        targets: [],
        risk: null,
        reward: null,
        riskReward: null,
        confirmationRequirements: [
          { id: 'MARKET_DATA', label: 'Broker quote & candle telemetry', status: 'FAILED', source: 'TELEMETRY_SUPERVISOR' }
        ],
        confirmationsSatisfied: [],
        confirmationsMissing: ['Broker quote & candle telemetry'],
        supportingEvidence: [],
        opposingEvidence: ['Broker instrument unavailable'],
        structuralContext: { structureTf: 'NONE', trend: 'UNAVAILABLE', swingsIdentified: false, fvgCount: 0, obCount: 0 },
        liquidityContext: { sweepDetected: false },
        volatilityContext: { atr: 0, spreadPts: 0, isSpreadNormal: false },
        sessionContext: {
          marketAvailability: 'UNAVAILABLE',
          sessionModel: 'OFF_HOURS',
          killzoneWindow: 'NOT_APPLICABLE',
          is24x7: Boolean(marketDef?.is24x7)
        },
        expiresAt: null,
        invalidatedAt: null,
        invalidationReason: 'Broker telemetry unavailable',
        readiness: 'UNAVAILABLE',
        dataQuality: 'UNAVAILABLE',
        tradeExecutable: false
      };
    }

    // 2. Derive Volatility Context & Spread
    const derivedDefaultAtr = currentPrice > 0
      ? currentPrice * 0.008
      : (marketDef?.basePrice ? marketDef.basePrice * 0.008 : 1.0);
    const lastAtr = (candles && candles.length >= 14)
      ? this.calculateSimpleAtr(candles, 14)
      : derivedDefaultAtr;
    const spreadPts = liveAsset?.spread ?? 0;
    const isSpreadNormal = Boolean(
      spreadPts === 0 ||
      (marketDef?.typicalSpread && (liveAsset?.ask && liveAsset?.bid)
        ? (liveAsset.ask - liveAsset.bid) < (marketDef.typicalSpread * 2.5)
        : true)
    );

    // 3. Resolve Candidate Direction (Strictly Non-Executable Thesis)
    let candidateDirection: SetupDirectionV3 = 'NONE';
    if (blueprint && ((blueprint.direction as any) === 'BUY' || (blueprint.direction as any) === 'LONG' || (blueprint.direction as any) === 'SELL' || (blueprint.direction as any) === 'SHORT')) {
      candidateDirection = ((blueprint.direction as any) === 'BUY' || (blueprint.direction as any) === 'LONG') ? 'LONG' : 'SHORT';
    } else if (marketStructure && marketStructure.trend !== 'INSUFFICIENT_DATA') {
      if (marketStructure.trend === 'BULLISH' && decisionV2.bias !== 'BEARISH') {
        candidateDirection = 'LONG';
      } else if (marketStructure.trend === 'BEARISH' && decisionV2.bias !== 'BULLISH') {
        candidateDirection = 'SHORT';
      }
    }

    // 4. Determine Setup Type Taxonomy
    let setupType: SetupTypeV3 = 'UNCLASSIFIED';
    if (candidateDirection !== 'NONE') {
      const explicitType = (blueprint as any)?.type;
      if (explicitType && ['BREAKOUT', 'RETEST', 'REVERSAL', 'CONTINUATION', 'RANGE_REJECTION', 'LIQUIDITY_SWEEP', 'MOMENTUM_EXPANSION'].includes(explicitType)) {
        setupType = explicitType as SetupTypeV3;
      } else if (triggerEvidence?.triggerType === 'BREAK_OF_STRUCTURE') {
        setupType = 'BREAKOUT';
      } else if (triggerEvidence?.triggerType === 'LIQUIDITY_CLOSE') {
        setupType = 'LIQUIDITY_SWEEP';
      } else if (
        blueprint && (
          (blueprint.entryZoneLow?.structureType && (blueprint.entryZoneLow.structureType.includes('FVG') || blueprint.entryZoneLow.structureType.includes('OB'))) ||
          (blueprint.entryZoneLow?.source && (blueprint.entryZoneLow.source.includes('FVG') || blueprint.entryZoneLow.source.includes('OB')))
        )
      ) {
        setupType = 'RETEST';
      } else if (marketStructure?.choch && marketStructure.choch.length > 0) {
        setupType = 'REVERSAL';
      } else if (multiTimeframeContext?.h1?.trend === marketStructure?.trend && multiTimeframeContext?.m5?.momentum === marketStructure?.trend) {
        setupType = 'CONTINUATION';
      } else {
        setupType = 'RETEST';
      }
    }

    // 5. Structure Anchor for Deterministic Setup Identity
    const structuralAnchorTs = blueprint?.latestAnalyzedCandleTimestamp ||
      marketStructure?.analyzedAt ||
      (candles && candles.length > 0 ? candles[candles.length - 1].timestamp : 0);
    const setupId = buildDeterministicSetupId(symbol, candidateDirection, setupType, structuralAnchorTs);

    // 6. Entry Zone, Invalidation, Stop Loss, and Targets from Blueprint
    let entryZone: SetupEntryZoneV3 | null = null;
    let invalidation: SetupInvalidationV3 | null = null;
    let stopLoss: SetupStopLossV3 | null = null;
    let targets: SetupTargetV3[] = [];
    let risk: SetupRiskV3 | null = null;
    let reward: SetupRewardV3 | null = null;
    let riskReward: SetupRiskRewardV3 | null = null;

    let isGeometryValid = false;
    let geometryRejectionReason: string | undefined;

    if (blueprint && candidateDirection !== 'NONE') {
      const eLow = Number(blueprint.entryZoneLow.price.toFixed(precision));
      const eHigh = Number(blueprint.entryZoneHigh.price.toFixed(precision));
      const eMid = Number(((eLow + eHigh) / 2).toFixed(precision));

      // Geometric Validity Invariant
      if (Number.isFinite(eLow) && Number.isFinite(eHigh) && eLow <= eHigh) {
        entryZone = {
          low: eLow,
          high: eHigh,
          midpoint: eMid,
          source: blueprint.entryZoneLow.source || 'STRUCTURE_ANALYSIS',
          rationale: blueprint.entryZoneLow.reason || 'Structural fair value / order block entry zone'
        };

        const invPrice = Number(blueprint.invalidation.price.toFixed(precision));
        const slPrice = Number(blueprint.sl.price.toFixed(precision));
        const tp1Price = Number(blueprint.tp1.price.toFixed(precision));

        invalidation = {
          price: invPrice,
          condition: candidateDirection === 'LONG'
            ? 'Confirmed closed candle below structural swing low'
            : 'Confirmed closed candle above structural swing high',
          source: blueprint.invalidation.source || 'SWING_STRUCTURE',
          rationale: blueprint.invalidation.reason || 'Structural invalidation anchor'
        };

        const riskDist = Math.abs(eMid - slPrice);
        stopLoss = {
          price: slPrice,
          rationale: blueprint.sl.reason || 'Structural swing invalidation minus volatility buffer',
          bufferAtrMultiplier: CANONICAL_SL_POLICY.atrBufferMultiplier,
          distance: Number(riskDist.toFixed(precision))
        };

        const geomEval = evaluateBlueprintRiskGeometry(
          candidateDirection === 'LONG' ? 'BUY' : 'SELL',
          eMid,
          slPrice,
          invPrice,
          tp1Price,
          lastAtr
        );

        isGeometryValid = geomEval.isAcceptable;
        geometryRejectionReason = geomEval.rejectionReason;

        if (isGeometryValid) {
          const rewardDist = Math.abs(tp1Price - eMid);
          const tp1Rr = Number((rewardDist / riskDist).toFixed(2));

          targets.push({
            targetIndex: 1,
            label: 'TP1',
            price: tp1Price,
            source: blueprint.tp1.source || 'SWING_PROJECTION',
            rationale: blueprint.tp1.reason || 'Nearest structural target',
            rewardDistance: Number(rewardDist.toFixed(precision)),
            riskReward: tp1Rr
          });

          if (blueprint.tp2) {
            const tp2Price = Number(blueprint.tp2.price.toFixed(precision));
            const tp2Dist = Math.abs(tp2Price - eMid);
            targets.push({
              targetIndex: 2,
              label: 'TP2',
              price: tp2Price,
              source: blueprint.tp2.source || 'EXTENSION_PROJECTION',
              rationale: blueprint.tp2.reason || 'Secondary structural objective',
              rewardDistance: Number(tp2Dist.toFixed(precision)),
              riskReward: Number((tp2Dist / riskDist).toFixed(2))
            });
          }

          if (blueprint.tp3) {
            const tp3Price = Number(blueprint.tp3.price.toFixed(precision));
            const tp3Dist = Math.abs(tp3Price - eMid);
            targets.push({
              targetIndex: 3,
              label: 'TP3',
              price: tp3Price,
              source: blueprint.tp3.source || 'MACRO_EXTENSION',
              rationale: blueprint.tp3.reason || 'Macro structural extension',
              rewardDistance: Number(tp3Dist.toFixed(precision)),
              riskReward: Number((tp3Dist / riskDist).toFixed(2))
            });
          }

          // Target Monotonicity Invariant Check
          let monotonic = true;
          for (let i = 1; i < targets.length; i++) {
            if (candidateDirection === 'LONG' && targets[i].price <= targets[i - 1].price) {
              monotonic = false;
            }
            if (candidateDirection === 'SHORT' && targets[i].price >= targets[i - 1].price) {
              monotonic = false;
            }
          }

          if (!monotonic) {
            isGeometryValid = false;
            geometryRejectionReason = 'Target progression violates directional monotonicity';
            targets = [];
          } else {
            risk = {
              riskDistance: Number(riskDist.toFixed(precision)),
              riskAtrMultiple: Number(geomEval.riskAtrMultiple.toFixed(2))
            };
            reward = {
              rewardDistance: Number(rewardDist.toFixed(precision)),
              primaryTargetPrice: tp1Price
            };
            riskReward = {
              ratio: tp1Rr,
              formatted: `1:${tp1Rr.toFixed(2)}`,
              meetsMinimumThreshold: tp1Rr >= MINIMUM_SETUP_RR
            };
          }
        }
      }
    }

    // 7. Resolve Trigger State
    let trigger: SetupTriggerV3 = {
      state: 'UNAVAILABLE',
      type: 'NONE',
      reason: 'Awaiting trigger evaluation'
    };

    if (triggerEvidence) {
      const isConfirmed = Boolean(
        triggerEvidence.isConfirmed ||
        triggerEvidence.state === 'CONFIRMED' ||
        (triggerEvidence as any).status === 'CONFIRMED'
      );
      const isFailed = Boolean(
        triggerEvidence.state === 'FAILED' ||
        (triggerEvidence as any).status === 'FAILED'
      );
      trigger = {
        state: isConfirmed ? 'CONFIRMED' : isFailed ? 'FAILED' : 'WAITING',
        type: triggerEvidence.triggerType || 'CANDLE_CLOSE',
        triggerLevel: triggerEvidence.triggerLevel,
        confirmationClose: triggerEvidence.confirmationClose,
        timeframe: triggerEvidence.triggerTimeframe || (triggerEvidence as any).timeframe,
        reason: triggerEvidence.reason || triggerEvidence.rejectionReason
      };
    } else if (candidateDirection !== 'NONE') {
      trigger = {
        state: 'WAITING',
        type: 'CANDLE_CLOSE',
        timeframe: 'M15',
        reason: 'Awaiting qualifying M15 closed candle'
      };
    }

    // 8. Invalidation Tracking
    let isInvalidated = false;
    let invalidationReason: string | null = null;
    let invalidatedAt: number | null = null;

    if (blueprint) {
      if (trigger.state === 'FAILED') {
        isInvalidated = true;
        invalidationReason = `Trigger confirmation failed: ${trigger.reason || 'Rejection criterion breached'}`;
        invalidatedAt = asOf;
      } else if (blueprint.state === 'INVALIDATED') {
        isInvalidated = true;
        invalidationReason = 'Structural invalidation breached in prior cycle';
      } else if (!isGeometryValid && geometryRejectionReason) {
        isInvalidated = true;
        invalidationReason = `Setup geometry violation: ${geometryRejectionReason}`;
        invalidatedAt = asOf;
      } else if (stopLoss && ((candidateDirection === 'LONG' && currentPrice <= stopLoss.price) || (candidateDirection === 'SHORT' && currentPrice >= stopLoss.price))) {
        isInvalidated = true;
        invalidationReason = `Current price (${currentPrice}) violated stop loss level (${stopLoss.price})`;
        invalidatedAt = asOf;
      } else if (invalidation && ((candidateDirection === 'LONG' && currentPrice <= invalidation.price) || (candidateDirection === 'SHORT' && currentPrice >= invalidation.price))) {
        isInvalidated = true;
        invalidationReason = `Current price (${currentPrice}) breached structural invalidation level (${invalidation.price}) (violated)`;
        invalidatedAt = asOf;
      } else if (
        (candidateDirection === 'LONG' && marketStructure?.trend === 'BEARISH' && decisionV2?.bias === 'BEARISH') ||
        (candidateDirection === 'SHORT' && marketStructure?.trend === 'BULLISH' && decisionV2?.bias === 'BULLISH')
      ) {
        isInvalidated = true;
        invalidationReason = `Opposing structural bias detected (${marketStructure?.trend}) - candidate invalidated`;
        invalidatedAt = asOf;
      }
    }

    // 9. Structured Confirmation Requirements
    const reqs: SetupConfirmationRequirementV3[] = [];

    // Directional structure requirement
    const hasDirection = candidateDirection !== 'NONE';
    reqs.push({
      id: 'DIRECTIONAL_STRUCTURE',
      label: 'Directional Market Structure',
      status: hasDirection ? 'SATISFIED' : 'MISSING',
      source: 'PRICE_STRUCTURE',
      details: hasDirection ? `${candidateDirection} structure identified` : 'Awaiting directional trend'
    });

    // Entry Geometry requirement
    reqs.push({
      id: 'ENTRY_GEOMETRY',
      label: 'Valid Entry Zone Geometry',
      status: (entryZone && isGeometryValid) ? 'SATISFIED' : 'MISSING',
      source: 'TRADE_BLUEPRINT',
      details: (entryZone && isGeometryValid)
        ? `Zone: ${entryZone.low} - ${entryZone.high}`
        : (geometryRejectionReason || 'No actionable entry zone identified')
    });

    // Invalidation requirement
    reqs.push({
      id: 'STRUCTURAL_INVALIDATION',
      label: 'Structural Invalidation Anchor',
      status: invalidation ? 'SATISFIED' : 'MISSING',
      source: 'PRICE_STRUCTURE',
      details: invalidation ? `Level: ${invalidation.price}` : 'No confirmed swing anchor'
    });

    // Minimum R:R requirement
    const hasMinRr = Boolean(riskReward && riskReward.meetsMinimumThreshold);
    reqs.push({
      id: 'MINIMUM_RISK_REWARD',
      label: `Minimum Risk/Reward (>= 1:${MINIMUM_SETUP_RR.toFixed(1)})`,
      status: hasMinRr ? 'SATISFIED' : (riskReward ? 'FAILED' : 'MISSING'),
      source: 'RISK_ENGINE',
      details: riskReward ? `${riskReward.formatted} (Min: 1:${MINIMUM_SETUP_RR.toFixed(1)})` : 'Awaiting geometry'
    });

    // Independent Confirmation requirement (Decision Engine V2 dependency groups)
    const hasIndependentDomains = (decisionV2?.independentDomainCount ?? 0) >= 3;
    reqs.push({
      id: 'INDEPENDENT_EVIDENCE',
      label: 'Multi-Domain Independent Alignment (>= 3 Domains)',
      status: hasIndependentDomains ? 'SATISFIED' : 'MISSING',
      source: 'DECISION_ENGINE_V2',
      details: `${decisionV2?.independentDomainCount ?? 0} independent domains aligned`
    });

    // Risk Guardian Gate
    const hasHardVeto = Boolean(decisionV2?.hardVetoes && decisionV2.hardVetoes.length > 0);
    reqs.push({
      id: 'RISK_GUARDIAN_CLEAR',
      label: 'Risk Guardian Mathematical Clearance',
      status: !hasHardVeto ? 'SATISFIED' : 'FAILED',
      source: 'RISK_GUARDIAN',
      details: hasHardVeto ? decisionV2.hardVetoes[0].reason : 'Exposure and spread limits clear'
    });

    // Session Open Gate
    const isSessionOpen = (decisionV2?.sessionContext?.marketAvailability === 'OPEN') ||
      ((decisionV2 as any)?.marketAvailability === 'OPEN') ||
      (decisionV2?.sessionContext === undefined && (decisionV2 as any)?.marketAvailability !== 'CLOSED');
    reqs.push({
      id: 'SESSION_OPEN',
      label: 'Active Market Session',
      status: isSessionOpen ? 'SATISFIED' : ((decisionV2?.sessionContext?.marketAvailability === 'CLOSED' || (decisionV2 as any)?.marketAvailability === 'CLOSED') ? 'FAILED' : 'MISSING'),
      source: 'SESSION_ENGINE',
      details: decisionV2?.sessionContext?.statusLabel || (decisionV2 as any)?.statusLabel || 'Session state'
    });

    // Trigger confirmation (if required)
    const isTriggerConfirmed = trigger.state === 'CONFIRMED';
    reqs.push({
      id: 'TRIGGER_CONFIRMATION',
      label: 'M15 Closed-Candle Trigger Confirmation',
      status: isTriggerConfirmed ? 'SATISFIED' : 'MISSING',
      source: 'CANDLE_CLOSE_TRIGGER',
      details: trigger.reason || 'Awaiting qualifying closed breakout'
    });

    const confirmationsSatisfied = reqs.filter(r => r.status === 'SATISFIED').map(r => r.id);
    const confirmationsMissing = reqs.filter(r => r.status !== 'SATISFIED').map(r => r.id);

    // 10. Map Decision V2 Maturity & Confirmations to Setup V3 Lifecycle
    let lifecycle: SetupLifecycleV3 = 'NO_SETUP';

    if (isInvalidated) {
      lifecycle = 'INVALIDATED';
    } else if (blueprint && ((blueprint.expiry && asOf > blueprint.expiry) || blueprint.state === 'EXPIRED')) {
      lifecycle = 'EXPIRED';
    } else if (!hasDirection || candidateDirection === 'NONE') {
      lifecycle = ((marketStructure && marketStructure.trend !== 'INSUFFICIENT_DATA') || decisionV2?.maturity === 'OBSERVING')
        ? 'OBSERVING'
        : 'NO_SETUP';
    } else if (!entryZone || !invalidation || !isGeometryValid) {
      lifecycle = 'WATCH';
    } else {
      // Setup geometry exists (entryZone, invalidation, SL, TP)
      const allValidationGatesPassed =
        hasDirection &&
        entryZone &&
        invalidation &&
        isGeometryValid &&
        hasMinRr &&
        hasIndependentDomains &&
        !hasHardVeto &&
        isSessionOpen &&
        isTriggerConfirmed &&
        decisionV2.maturity === 'VALIDATED_SETUP';

      if (allValidationGatesPassed) {
        lifecycle = 'VALIDATED';
      } else {
        lifecycle = 'FORMING';
      }
    }

    // 11. Structured Thesis Formulation
    let thesis = '';
    if (lifecycle === 'NO_SETUP') {
      thesis = 'No structured trade setup identified. CORTEX is monitoring market structure.';
    } else if (lifecycle === 'OBSERVING') {
      thesis = `Observing ${symbol} structure. Awaiting directional alignment across independent evidence domains.`;
    } else if (lifecycle === 'WATCH') {
      thesis = `${candidateDirection} candidate thesis under observation. Awaiting identifiable structural entry zone and R:R asymmetry.`;
    } else if (lifecycle === 'FORMING') {
      thesis = `${setupType} setup forming for ${candidateDirection} candidate. ${confirmationsSatisfied.length}/${reqs.length} confirmations satisfied.`;
    } else if (lifecycle === 'VALIDATED') {
      thesis = `VALIDATED ${setupType} ${candidateDirection} candidate. Structural geometry, independent confirmation, and R:R threshold verified.`;
    } else if (lifecycle === 'INVALIDATED') {
      thesis = `Setup invalidated: ${invalidationReason || 'Structural breach'}.`;
    } else if (lifecycle === 'EXPIRED') {
      thesis = 'Candidate setup expired without qualifying validation.';
    }

    return {
      version: '3.0',
      setupId,
      symbol,
      snapshotId,
      asOf,
      lifecycle,
      direction: candidateDirection,
      setupType,
      thesis,
      entryZone,
      trigger,
      invalidation,
      stopLoss,
      targets,
      risk,
      reward,
      riskReward,
      confirmationRequirements: reqs,
      confirmationsSatisfied,
      confirmationsMissing,
      supportingEvidence: decisionV2?.supportingDomains || [],
      opposingEvidence: [
        ...(decisionV2?.opposingDomains || []),
        ...(decisionV2?.hardVetoes?.map(v => `${v.source}: ${v.reason}`) || []),
        ...(decisionV2?.softVetoes?.map(v => `${v.source}: ${v.reason}`) || [])
      ],
      structuralContext: {
        structureTf: blueprint?.entryZoneLow.timeframe || 'M30',
        trend: marketStructure?.trend || 'NEUTRAL',
        swingsIdentified: Boolean(
          marketStructure && (
            (marketStructure.swingHighs?.length ?? 0) > 0 ||
            (marketStructure.swingLows?.length ?? 0) > 0 ||
            ((marketStructure as any).swings?.highs?.length ?? 0) > 0
          )
        ),
        fvgCount: marketStructure?.fvg?.length ?? (marketStructure as any)?.fvgs?.length ?? 0,
        obCount: marketStructure?.orderBlocks?.length ?? 0
      },
      liquidityContext: {
        sweepDetected: Boolean(triggerEvidence?.triggerType === 'LIQUIDITY_CLOSE'),
        opposingLiquidityTarget: targets.length > 0 ? targets[0].price : undefined
      },
      volatilityContext: {
        atr: Number(lastAtr.toFixed(precision)),
        spreadPts,
        isSpreadNormal
      },
      sessionContext: {
        marketAvailability: decisionV2?.sessionContext?.marketAvailability || (decisionV2 as any)?.marketAvailability || 'OPEN',
        sessionModel: decisionV2?.sessionContext?.sessionModel || (decisionV2 as any)?.sessionModel || 'OFF_HOURS',
        killzoneWindow: decisionV2?.sessionContext?.killzoneWindow || (decisionV2 as any)?.killzoneWindow || 'NOT_APPLICABLE',
        is24x7: Boolean(decisionV2?.sessionContext?.is24x7 ?? (decisionV2 as any)?.is24x7)
      },
      expiresAt: blueprint?.expiry || null,
      invalidatedAt,
      invalidationReason,
      readiness: decisionV2?.maturity === 'UNAVAILABLE' ? 'UNAVAILABLE' : (decisionV2?.maturity === 'DATA_LIMITED' ? 'DATA_LIMITED' : (lifecycle === 'VALIDATED' ? 'READY' : 'PARTIAL')),
      dataQuality: decisionV2?.maturity === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'HEALTHY',
      tradeExecutable: false
    };
  }

  private static calculateSimpleAtr(candles: OHLCCandle[], period: number = 14): number {
    if (candles.length < 2) return 0.001;
    let trSum = 0;
    const start = Math.max(1, candles.length - period);
    for (let i = start; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trSum += tr;
    }
    const count = candles.length - start;
    return count > 0 ? trSum / count : 0.001;
  }
}