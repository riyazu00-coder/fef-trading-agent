/**
 * FEF CORTEX — CANDLE-CLOSE TRIGGER & MULTI-TIMEFRAME TYPES
 * M15/M30 Trade Opportunity Recovery Foundation
 *
 * Rules:
 * 1. Zero synthetic values: all trigger levels and candle closes derive strictly from verified OHLC.
 * 2. Closed candles only: intrabar wicks are strictly non-confirming.
 * 3. Multi-timeframe responsibility separation:
 *    - H1: Higher-Timeframe Context & Directional Regime
 *    - M30: Setup Structure & Intermediate Confirmation
 *    - M15: Primary Opportunity Trigger Timeframe
 *    - M5: Precision / Timing Evidence (where verified data exists)
 * 4. Non-executable: triggers provide analytical evidence, NEVER execution commands.
 */

import { EvidenceClassification } from '../evidence/agent-evidence';

export type TriggerDirection = 'BUY' | 'SELL' | 'NEUTRAL';

export type TriggerType =
  | 'BREAK_OF_STRUCTURE'
  | 'SWING_CLOSE'
  | 'LIQUIDITY_CLOSE'
  | 'NONE';

export interface MultiTimeframeContext {
  symbol?: string;
  contextTimeframe: 'H1';
  setupTimeframe: 'M30';
  triggerTimeframe: 'M15';
  precisionTimeframe: 'M5';

  htfBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DATA_LIMITED';
  setupStructure: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DATA_LIMITED';
  triggerState: 'WAITING' | 'CONFIRMED' | 'INVALIDATED' | 'DATA_LIMITED';

  htfCandleCount: number;
  m30CandleCount: number;
  m15CandleCount: number;
  m5CandleCount: number;

  isTriggerConfirmed: boolean;
  triggerConfirmationDetails?: string;
  nextConfirmationRequirement: string;

  h1: {
    available: boolean;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DATA_LIMITED';
    candleCount: number;
    provenance: string;
  };
  m30: {
    available: boolean;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DATA_LIMITED';
    candleCount: number;
    swingsIdentified: boolean;
    structureVersion: string;
  };
  m15: {
    available: boolean;
    trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'DATA_LIMITED';
    candleCount: number;
    latestClosedTimestamp: number;
  };
  m5: {
    available: boolean;
    candleCount: number;
    momentum: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  };
}

export interface CandleCloseTriggerEvidence {
  direction: TriggerDirection;
  triggerType: TriggerType;
  triggerTimeframe: 'M15' | 'M30';
  triggerLevel: number;
  triggerCandleTimestamp: number;
  confirmationClose: number;
  priorHigh: number;
  priorLow: number;
  structureState: string;
  freshness: string;
  provenance: EvidenceClassification;
  confidenceContribution: number;
  reason: string;
  isConfirmed: boolean;
  rejectionReason?: string;
}
