/**
 * FEF CORTEX — FAST OPPORTUNITY ENGINE
 * M15/M30 Trade Opportunity Recovery Foundation
 *
 * Principles:
 * 1. Evaluates intraday opportunities on M15/M30 without requiring every macro/cross-asset agent.
 * 2. Strict separation: TRADE SETUP QUALITY vs GLOBAL EVIDENCE COVERAGE.
 * 3. Does NOT lower truthfulness standards:
 *    - Missing non-critical macro (e.g. DXY unavailable) reduces global coverage and penalizes overall confidence,
 *      but does NOT erase verified price-action evidence.
 *    - Critical missing broker/price/candle integrity data strictly FAILS CLOSED.
 * 4. Presentation posture: WATCH FOR BUY, WATCH FOR SELL, or WAIT. Zero execution commands.
 */

import { OHLCCandle } from '../market/canonical-market-snapshot';
import { EvidenceClassification } from '../evidence/agent-evidence';
import { MarketStructure } from '../market/market-structure-engine';
import { TradeBlueprint } from '../trading/trade-blueprint-engine';
import { CandleCloseTriggerEvidence } from '../triggers/trigger-types';
import { PresentationPosture } from '../confluence/confluence-engine';

export interface FastOpportunityInputs {
  symbol: string;
  currentPrice: number;
  triggerEvidence: CandleCloseTriggerEvidence;
  blueprint: TradeBlueprint | null;
  marketStructure: MarketStructure | null;
  candlesM15?: OHLCCandle[];
  candlesM30?: OHLCCandle[];
  sessionExecutable: boolean;
  spreadQuality: 'TIGHT' | 'NORMAL' | 'WIDE' | 'DATA_LIMITED';
  hasVerifiedBrokerPrice: boolean;
  macroCoverage: {
    isRatesAvailable: boolean;
    isRealYieldAvailable: boolean;
    isDxyAvailable: boolean; // strictly false in current FRED connector
  };
}

export interface FastOpportunityEvaluation {
  symbol: string;
  posture: PresentationPosture;
  tradeSetupQuality: number;       // 0 - 100 based on price-action and geometry
  globalEvidenceCoverage: number;  // 0 - 100 based on external macro / cross-asset coverage
  effectiveConfidence: number;     // 0 - 100 synthesized confidence score
  isTriggerConfirmed: boolean;
  triggerType: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  riskRewardRatio: string;
  missingEvidenceNotes: string[];
  rankingScore: number;            // 0 - 100 composite for opportunity radar
  reasoning: string;
}

export class FastOpportunityEngine {
  /**
   * Deterministically evaluates an M15/M30 opportunity.
   */
  public static evaluateFastOpportunity(inputs: FastOpportunityInputs): FastOpportunityEvaluation {
    const {
      symbol,
      currentPrice,
      triggerEvidence,
      blueprint,
      marketStructure,
      sessionExecutable,
      spreadQuality,
      hasVerifiedBrokerPrice,
      macroCoverage,
    } = inputs;

    const missingNotes: string[] = [];

    // 1. Critical Fail-Closed Checks
    if (!hasVerifiedBrokerPrice) {
      return {
        symbol,
        posture: 'WAIT',
        tradeSetupQuality: 0,
        globalEvidenceCoverage: 0,
        effectiveConfidence: 0,
        isTriggerConfirmed: false,
        triggerType: 'NONE',
        direction: 'NEUTRAL',
        riskRewardRatio: 'N/A',
        missingEvidenceNotes: ['Verified broker price feed unavailable (fail closed)'],
        rankingScore: 0,
        reasoning: 'Missing verified broker price feed. Critical security fail-closed.',
      };
    }

    if (!sessionExecutable) {
      return {
        symbol,
        posture: 'WAIT',
        tradeSetupQuality: blueprint ? 65 : 0,
        globalEvidenceCoverage: 50,
        effectiveConfidence: 0,
        isTriggerConfirmed: false,
        triggerType: 'NONE',
        direction: 'NEUTRAL',
        riskRewardRatio: blueprint?.rrRatio || 'N/A',
        missingEvidenceNotes: ['Market session is currently closed'],
        rankingScore: 10,
        reasoning: 'Market session is closed. Analysis active; execution gated until next session open.',
      };
    }

    if (spreadQuality === 'WIDE' || spreadQuality === 'DATA_LIMITED') {
      missingNotes.push(`Spread quality is ${spreadQuality}`);
    }

    // 2. Global Evidence Coverage Calculation
    let coveragePoints = 0;
    if (macroCoverage.isRatesAvailable) coveragePoints += 40;
    if (macroCoverage.isRealYieldAvailable) coveragePoints += 40;
    if (macroCoverage.isDxyAvailable) {
      coveragePoints += 20;
    } else {
      missingNotes.push('DXY is strictly UNAVAILABLE (Pending official connector)');
    }
    const globalEvidenceCoverage = Math.max(20, coveragePoints);

    // 3. Trade Setup Quality Calculation (Price-Action & Structure)
    let setupQuality = 0;
    if (marketStructure && marketStructure.trend !== 'INSUFFICIENT_DATA') {
      setupQuality += 25; // valid market structure
    }
    if (blueprint && blueprint.state !== 'INVALIDATED' && blueprint.state !== 'EXPIRED') {
      setupQuality += 30; // valid blueprint geometry
      const rrNum = parseFloat(blueprint.rrRatio?.split(':')[1] || '1.5');
      if (rrNum >= 2.0) setupQuality += 15;
    }
    if (triggerEvidence.isConfirmed) {
      setupQuality += 30; // confirmed candle-close trigger
    }

    // 4. Direction & Posture Determination
    let posture: PresentationPosture = 'WAIT';
    let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';

    const isBuyTrigger = triggerEvidence.isConfirmed && triggerEvidence.direction === 'BUY';
    const isSellTrigger = triggerEvidence.isConfirmed && triggerEvidence.direction === 'SELL';

    if (isBuyTrigger && blueprint && blueprint.direction === 'BUY') {
      posture = 'WATCH FOR BUY';
      direction = 'BUY';
    } else if (isSellTrigger && blueprint && blueprint.direction === 'SELL') {
      posture = 'WATCH FOR SELL';
      direction = 'SELL';
    } else if (blueprint && blueprint.state !== 'INVALIDATED' && blueprint.state !== 'EXPIRED') {
      // Setup is armed/active but trigger not yet confirmed -> remains WAIT
      posture = 'WAIT';
      direction = blueprint.direction;
    } else {
      posture = 'WAIT';
      direction = 'NEUTRAL';
    }

    // 5. Effective Confidence & Composite Radar Ranking Score
    // Coverage penalty reduces confidence without zeroing genuine structural evidence
    const coverageMultiplier = 0.5 + (globalEvidenceCoverage / 200); // 0.60 to 1.00
    const effectiveConfidence = posture === 'WAIT'
      ? (blueprint ? Math.round(setupQuality * 0.4) : 0)
      : Math.round(setupQuality * coverageMultiplier);

    const rankingScore = Math.round((setupQuality * 0.65) + (effectiveConfidence * 0.35));

    const reasoning = triggerEvidence.isConfirmed
      ? `Verified ${triggerEvidence.triggerTimeframe} candle-close trigger confirmed at ${triggerEvidence.confirmationClose.toFixed(2)}. ${posture} active (Setup Quality: ${setupQuality}%, Evidence Coverage: ${globalEvidenceCoverage}%).`
      : `Setup awaiting qualifying candle-close trigger. Market structure: ${marketStructure?.trend || 'CALIBRATING'}. Posture: WAIT.`;

    return {
      symbol,
      posture,
      tradeSetupQuality: Math.min(100, setupQuality),
      globalEvidenceCoverage,
      effectiveConfidence: Math.min(100, effectiveConfidence),
      isTriggerConfirmed: triggerEvidence.isConfirmed,
      triggerType: triggerEvidence.triggerType,
      direction,
      riskRewardRatio: blueprint?.rrRatio || '1:1.5',
      missingEvidenceNotes: missingNotes,
      rankingScore: Math.min(100, rankingScore),
      reasoning,
    };
  }
}
