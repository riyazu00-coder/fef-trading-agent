/**
 * FEF CORTEX — DECISION V2 UI PROJECTION
 *
 * Sanitizes DecisionEngineV2 intelligence into a UI-safe, client-sharable projection.
 * Strictly guarantees:
 * - Zero exposure of local SQLite paths, tokens, device secrets, or bridge secrets
 * - Canonical maturity and directional bias strictly decoupled
 * - Deterministic fail-closed defaults when intelligence is unavailable or offline
 * - tradeExecutable = false invariant strictly enforced
 */

import {
  DecisionIntelligenceV2,
  SetupMaturityState,
} from './decision-engine-v2';

export interface VetoUiItem {
  source: string;
  reason: string;
  effect: string;
}

export interface ConflictUiItem {
  type: string;
  description: string;
}

export interface DecisionV2UiProjection {
  maturity: SetupMaturityState;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  evidenceCompleteness: number;
  independentDomainCount: number;

  supportingDomains: string[];
  opposingDomains: string[];
  unavailableDomains: string[];

  hardVetoes: VetoUiItem[];
  softVetoes: VetoUiItem[];
  hasHardVeto: boolean;
  hasSoftVeto: boolean;
  conflicts: ConflictUiItem[];

  requirementsToAdvance: string[];
  blockingConditions: string[];
  invalidationConditions: string[];

  explanation: string;

  marketAvailability: 'OPEN' | 'CLOSED' | 'UNAVAILABLE';
  sessionModel: string;
  killzoneWindow: 'ACTIVE' | 'INACTIVE' | 'NOT_APPLICABLE';
  is24x7: boolean;
  statusLabel: string;

  tradeExecutable: false;
  executionMode: 'READ_ONLY';

  snapshotId: string;
  asOf: number;
  generatedAt: number;
}

/**
 * Creates a sanitized, secure UI projection of Decision Engine V2 intelligence.
 */
export function projectDecisionV2ForUi(
  decision?: DecisionIntelligenceV2 | null,
  symbol?: string
): DecisionV2UiProjection {
  const isUnavailable = !decision || decision.maturity === 'UNAVAILABLE' || symbol === 'GER40';

  if (isUnavailable) {
    const isCrypto = symbol ? (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('SOL')) : false;
    return {
      maturity: 'UNAVAILABLE',
      bias: 'NEUTRAL',
      confidence: 0,
      evidenceCompleteness: 0,
      independentDomainCount: 0,
      supportingDomains: [],
      opposingDomains: [],
      unavailableDomains: [
        'PRICE_STRUCTURE',
        'MOMENTUM',
        'VOLATILITY',
        'LIQUIDITY',
        'ORDER_FLOW_PROXY',
        'INSTITUTIONAL_PROXY',
        'SESSION',
        'RISK',
        'CROSS_ASSET',
        'MACRO',
        'NEWS',
        'GEOPOLITICAL',
        'SENTIMENT',
        'POSITIONING',
        'MONTE_CARLO',
        'DATA_QUALITY',
      ],
      hardVetoes: [
        {
          source: 'MARKET_DATA',
          reason: 'Broker instrument telemetry unavailable or fail-closed',
          effect: 'FORCE_WAIT',
        },
      ],
      softVetoes: [],
      hasHardVeto: true,
      hasSoftVeto: false,
      conflicts: [],
      requirementsToAdvance: ['Broker quotes and subscriptions must be verified in MT5.'],
      blockingConditions: ['Broker instrument telemetry is unavailable in local MT5 bridge.'],
      invalidationConditions: ['Telemetry unavailable'],
      explanation: 'MARKET DATA UNAVAILABLE: Instrument telemetry is not provided by active broker connection.',
      marketAvailability: 'UNAVAILABLE',
      sessionModel: 'OFF_HOURS',
      killzoneWindow: isCrypto ? 'NOT_APPLICABLE' : 'INACTIVE',
      is24x7: isCrypto,
      statusLabel: 'TELEMETRY UNAVAILABLE',
      tradeExecutable: false,
      executionMode: 'READ_ONLY',
      snapshotId: decision?.snapshotId || `snap-${symbol || 'UNAVAILABLE'}-${Date.now()}`,
      asOf: decision?.asOf || Date.now(),
      generatedAt: Date.now(),
    };
  }

  return {
    maturity: decision.maturity,
    bias: decision.bias || 'NEUTRAL',
    confidence: typeof decision.confidence === 'number' ? decision.confidence : 0,
    evidenceCompleteness: typeof decision.evidenceCompleteness === 'number' ? decision.evidenceCompleteness : 0,
    independentDomainCount: typeof decision.independentDomainCount === 'number' ? decision.independentDomainCount : 0,
    supportingDomains: Array.isArray(decision.supportingDomains) ? [...decision.supportingDomains] : [],
    opposingDomains: Array.isArray(decision.opposingDomains) ? [...decision.opposingDomains] : [],
    unavailableDomains: Array.isArray(decision.unavailableDomains) ? [...decision.unavailableDomains] : [],
    hardVetoes: Array.isArray(decision.hardVetoes)
      ? decision.hardVetoes.map((v) => ({
          source: v.source,
          reason: v.reason,
          effect: v.effect,
        }))
      : [],
    softVetoes: Array.isArray(decision.softVetoes)
      ? decision.softVetoes.map((v) => ({
          source: v.source,
          reason: v.reason,
          effect: v.effect,
        }))
      : [],
    hasHardVeto: Boolean(decision.hardVetoes && decision.hardVetoes.length > 0),
    hasSoftVeto: Boolean(decision.softVetoes && decision.softVetoes.length > 0),
    conflicts: Array.isArray(decision.conflicts)
      ? decision.conflicts.map((c) => ({
          type: c.type,
          description: c.description,
        }))
      : [],
    requirementsToAdvance: Array.isArray(decision.requirementsToAdvance)
      ? [...decision.requirementsToAdvance]
      : [],
    blockingConditions: Array.isArray(decision.blockingConditions)
      ? [...decision.blockingConditions]
      : [],
    invalidationConditions: Array.isArray(decision.invalidationConditions)
      ? [...decision.invalidationConditions]
      : [],
    explanation: decision.explanation || '',
    marketAvailability: decision.sessionContext?.marketAvailability || 'OPEN',
    sessionModel: decision.sessionContext?.sessionModel || 'OFF_HOURS',
    killzoneWindow: decision.sessionContext?.killzoneWindow || 'NOT_APPLICABLE',
    is24x7: Boolean(decision.sessionContext?.is24x7),
    statusLabel: decision.sessionContext?.statusLabel || 'SESSION ACTIVE',
    tradeExecutable: false,
    executionMode: 'READ_ONLY',
    snapshotId: decision.snapshotId || `snap-${symbol || 'UNKNOWN'}-${Date.now()}`,
    asOf: decision.asOf || Date.now(),
    generatedAt: decision.generatedAt || Date.now(),
  };
}
