/**
 * FEF TRADING SOLUTIONS: CANONICAL AGENT EVIDENCE INTEGRITY & TRUST GATE
 * Phase 34 Architecture Implementation
 * 
 * Provides machine-readable provenance, classification, decision eligibility,
 * evidence trust scoring, and consensus actionability gates.
 */

import { AgentType, AgentState } from '@/lib/agents/agent-types';
import { MarketSessionState } from '@/lib/session/market-session-engine';

/**
 * The Canonical Evidence Classifications
 */
export type EvidenceClassification =
  | 'LIVE_MT5'            // Measured directly via verified local MT5 WebRequest/HTTP telemetry
  | 'INDEPENDENT_VERIFIED' // Measured directly via verified independent public market feed (Binance spot, Yahoo FX/Indices)
  | 'INDEPENDENT_REFERENCE'// Reference/proxy market feed (e.g. PAXG proxy for gold, CME futures proxy) — strictly non-executable
  | 'DERIVED_FROM_VERIFIED'// Mathematically computed from verified independent OHLC or telemetry
  | 'BROKER_TICK_VOLUME_PROXY' // Measured via broker CFD tick volume rather than centralized exchange volume
  | 'LIVE_EXTERNAL'       // Measured via connected public market API (Gold-API, Binance, open.er-api)
  | 'DELAYED_EXTERNAL'    // Public API feed with known timestamp delay (> 60s)
  | 'CACHED'              // Cached memory snapshot within acceptable TTL
  | 'DERIVED'             // Pure deterministic mathematical calculation (SL, TP, R:R, session state)
  | 'MODEL_INFERENCE'     // Output of an analytical/machine learning model, clearly labeled as inference
  | 'HEURISTIC'           // Algorithmic rule or SMC technical pattern matching logic
  | 'SIMULATED'           // Synthetically generated scenario or template (strictly ineligible for execution)
  | 'HARDCODED'           // Static literal fixture (strictly ineligible for execution)
  | 'UNAVAILABLE'         // Required data feed is offline or not connected
  | 'UNKNOWN';            // Unverified or untracked origin

export type ProvenanceBadgeType =
  | 'LIVE'
  | 'MT5'
  | 'INDEPENDENT'
  | 'REFERENCE'
  | 'DERIVED'
  | 'INFERENCE'
  | 'DATA LIMITED'
  | 'UNAVAILABLE';

export interface AgentEvidence {
  id: string;
  agentKey: AgentType;
  asset: string;
  claim: string;
  value?: string | number;
  unit?: string;
  source: string;
  sourceType: string;
  classification: EvidenceClassification;
  observedAt: string;
  freshnessMs: number;
  confidence: number;
  assetSpecific: boolean;
  verified: boolean;
  decisionEligible: boolean;
  reason: string;
}

/**
 * Maximum acceptable freshness thresholds in milliseconds
 */
export const FRESHNESS_POLICIES: Record<EvidenceClassification, number> = {
  LIVE_MT5: 60_000,              // 60 seconds for broker telemetry
  INDEPENDENT_VERIFIED: 120_000, // 2 minutes for verified independent public market feeds
  INDEPENDENT_REFERENCE: 300_000,// 5 minutes for reference/proxy feeds (PAXG, CME Futures)
  DERIVED_FROM_VERIFIED: 300_000,// 5 minutes for mathematical analysis derived from verified OHLC
  BROKER_TICK_VOLUME_PROXY: 300_000, // 5 minutes for broker tick volume proxy analysis
  LIVE_EXTERNAL: 120_000,         // 2 minutes for public price feeds
  DELAYED_EXTERNAL: 900_000,      // 15 minutes for delayed wire/macro data
  CACHED: 300_000,                // 5 minutes for cached profiles
  DERIVED: 300_000,               // Derived from recent price within 5 mins
  MODEL_INFERENCE: 600_000,       // 10 minutes
  HEURISTIC: 600_000,             // 10 minutes
  SIMULATED: 0,                   // Never fresh for production
  HARDCODED: 0,                   // Never fresh for production
  UNAVAILABLE: 0,
  UNKNOWN: 0,
};

/**
 * Normalizes evidence freshness to a safe, non-negative, finite number.
 * Missing, invalid, NaN, negative, or non-finite values fail closed by
 * returning Number.MAX_SAFE_INTEGER (treated as maximally stale/ineligible).
 */
export function normalizeEvidenceFreshnessMs(freshnessMs: unknown): number {
  if (typeof freshnessMs === 'number' && Number.isFinite(freshnessMs) && freshnessMs >= 0) {
    return freshnessMs;
  }
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Evaluates whether a piece of evidence is eligible to participate in a production trading decision.
 * 
 * Rules:
 * - LIVE_MT5, LIVE_EXTERNAL, INDEPENDENT_VERIFIED: Eligible when fresh.
 * - DERIVED, DERIVED_FROM_VERIFIED: Eligible when derived from fresh verified telemetry/OHLC.
 * - INDEPENDENT_REFERENCE: Verified context/structure, but non-executable (ineligible for automated broker execution).
 * - DELAYED_EXTERNAL, CACHED: Eligible only if within freshness policy window.
 * - MODEL_INFERENCE, HEURISTIC: Ineligible to masquerade as observed facts; provide contextual bias only.
 * - SIMULATED, HARDCODED, UNAVAILABLE, UNKNOWN: Strictly ineligible.
 */
export function isEvidenceDecisionEligible(
  classification: EvidenceClassification,
  freshnessMs?: number | unknown
): { eligible: boolean; verified: boolean; reason: string } {
  const safeFreshness = normalizeEvidenceFreshnessMs(freshnessMs);

  switch (classification) {
    case 'LIVE_MT5':
    case 'LIVE_EXTERNAL':
    case 'INDEPENDENT_VERIFIED': {
      const maxAge = FRESHNESS_POLICIES[classification];
      if (safeFreshness > maxAge) {
        return {
          eligible: false,
          verified: false,
          reason: safeFreshness === Number.MAX_SAFE_INTEGER
            ? `Missing or invalid freshness for ${classification}: fails closed`
            : `Stale live feed: ${Math.round(safeFreshness / 1000)}s exceeds limit of ${maxAge / 1000}s`
        };
      }
      return { eligible: true, verified: true, reason: 'Fresh verified market feed' };
    }

    case 'DERIVED':
    case 'DERIVED_FROM_VERIFIED':
    case 'BROKER_TICK_VOLUME_PROXY': {
      const maxAge = FRESHNESS_POLICIES[classification];
      if (safeFreshness > maxAge) {
        return {
          eligible: false,
          verified: false,
          reason: safeFreshness === Number.MAX_SAFE_INTEGER
            ? `Missing or invalid freshness for ${classification}: fails closed`
            : `Stale derived computation: ${Math.round(safeFreshness / 1000)}s`
        };
      }
      return { eligible: true, verified: true, reason: 'Mathematically derived from verified price/OHLC' };
    }

    case 'INDEPENDENT_REFERENCE':
      return {
        eligible: false,
        verified: false,
        reason: 'Reference proxy feed contributes analytical context only, not verified execution evidence'
      };

    case 'DELAYED_EXTERNAL':
    case 'CACHED': {
      const maxAge = FRESHNESS_POLICIES[classification];
      if (safeFreshness <= maxAge) {
        return { eligible: true, verified: true, reason: `Acceptable ${classification.toLowerCase()} window` };
      }
      return {
        eligible: false,
        verified: false,
        reason: safeFreshness === Number.MAX_SAFE_INTEGER
          ? `Missing or invalid freshness for ${classification}: fails closed`
          : `${classification} expired (${Math.round(safeFreshness / 1000)}s > ${maxAge / 1000}s)`
      };
    }

    case 'MODEL_INFERENCE':
    case 'HEURISTIC':
      return {
        eligible: false,
        verified: false,
        reason: `${classification} contributes structural context only, not verified observation`
      };

    case 'SIMULATED':
    case 'HARDCODED':
    case 'UNAVAILABLE':
    case 'UNKNOWN':
    default:
      return {
        eligible: false,
        verified: false,
        reason: `Classification ${classification} strictly prohibited from production decision weight`
      };
  }
}

/**
 * Calculates the Evidence Trust Score (0 - 100%) for an individual agent
 * based on the quality and freshness of its evidence records.
 */
export function calculateAgentEvidenceTrust(evidences: AgentEvidence[]): {
  trustScore: number;
  badge: ProvenanceBadgeType;
  verifiedCount: number;
  totalCount: number;
} {
  if (!evidences || evidences.length === 0) {
    return { trustScore: 0, badge: 'UNAVAILABLE', verifiedCount: 0, totalCount: 0 };
  }

  let totalWeight = 0;
  let earnedScore = 0;
  let verifiedCount = 0;

  evidences.forEach((ev) => {
    totalWeight += 1;

    const freshness = normalizeEvidenceFreshnessMs(ev.freshnessMs);
    const eligibility = isEvidenceDecisionEligible(ev.classification, freshness);
    const isCanonicallyVerified = eligibility.verified && ev.verified !== false;

    switch (ev.classification as string) {
      case 'LIVE_MT5':
        if (isCanonicallyVerified) {
          earnedScore += 1.0;
          verifiedCount += 1;
        } else {
          // Stale broker telemetry: partial contextual trust, not full verified trust
          earnedScore += 0.50;
        }
        break;
      case 'INDEPENDENT_VERIFIED':
      case 'INDEPENDENT_VERIFIED_OHLC':
      case 'LIVE_EXTERNAL':
        if (isCanonicallyVerified) {
          earnedScore += 0.95;
          verifiedCount += 1;
        } else {
          earnedScore += 0.45;
        }
        break;
      case 'DERIVED_FROM_VERIFIED':
      case 'DERIVED':
      case 'BROKER_TICK_VOLUME_PROXY':
        if (isCanonicallyVerified) {
          earnedScore += 0.90;
          verifiedCount += 1;
        } else {
          earnedScore += 0.40;
        }
        break;
      case 'INDEPENDENT_REFERENCE':
      case 'INDEPENDENT_REFERENCE_OHLC':
        // Retains analytical/contextual trust, strictly non-executable: MUST NOT increment verifiedCount
        earnedScore += (freshness <= FRESHNESS_POLICIES.INDEPENDENT_REFERENCE) ? 0.80 : 0.40;
        break;
      case 'DELAYED_EXTERNAL':
        if (isCanonicallyVerified && ev.decisionEligible) {
          earnedScore += 0.65;
          verifiedCount += 1;
        } else {
          earnedScore += 0.35;
        }
        break;
      case 'CACHED':
        if (isCanonicallyVerified && ev.decisionEligible) {
          earnedScore += 0.60;
          verifiedCount += 1;
        } else {
          earnedScore += 0.30;
        }
        break;
      case 'MODEL_INFERENCE':
        earnedScore += 0.35;
        break;
      case 'HEURISTIC':
        earnedScore += 0.30;
        break;
      case 'SIMULATED':
      case 'HARDCODED':
      case 'UNAVAILABLE':
      case 'UNKNOWN':
      default:
        earnedScore += 0.0;
        break;
    }
  });

  const trustScore = Math.round((earnedScore / totalWeight) * 100);

  let badge: ProvenanceBadgeType = 'UNAVAILABLE';
  if (evidences.some((e) => e.classification === 'LIVE_MT5')) {
    badge = 'MT5';
  } else if (evidences.some((e) => (e.classification as string).startsWith('INDEPENDENT_VERIFIED') || e.classification === 'LIVE_EXTERNAL')) {
    badge = 'INDEPENDENT';
  } else if (evidences.some((e) => (e.classification as string).startsWith('INDEPENDENT_REFERENCE'))) {
    badge = 'REFERENCE';
  } else if (evidences.some((e) => e.classification === 'DERIVED_FROM_VERIFIED' || e.classification === 'DERIVED')) {
    badge = 'DERIVED';
  } else if (evidences.some((e) => e.classification === 'MODEL_INFERENCE' || e.classification === 'HEURISTIC')) {
    badge = 'INFERENCE';
  } else if (trustScore < 40) {
    badge = 'DATA LIMITED';
  }

  return {
    trustScore,
    badge,
    verifiedCount,
    totalCount: evidences.length
  };
}

/**
 * Consensus Trust Metrics across the 15-Agent Council
 */
export interface ConsensusTrustMetrics {
  councilConfidence: number;
  evidenceTrust: number;
  verifiedAgentCount: number;
  limitedAgentCount: number;
  unavailableAgentCount: number;
  totalVotingAgents: number; // Strictly 15
}

/**
 * Computes Consensus Trust across the 15 Voting Council Members
 */
export function calculateConsensusTrust(agents: AgentState[]): ConsensusTrustMetrics {
  // Enforce strictly 15 voting agents
  const votingAgents = agents.slice(0, 15);

  let totalTrust = 0;
  let verifiedAgentCount = 0;
  let limitedAgentCount = 0;
  let unavailableAgentCount = 0;

  votingAgents.forEach((ag) => {
    const score = ag.evidenceTrustScore ?? 0;
    totalTrust += score;

    // An agent counts as verified ONLY when its actual evidenceRecords contain genuinely
    // verified evidence under canonical eligibility/freshness rules AND its structural gate
    // has marked it decision-eligible.
    let isVerified = false;
    if (ag.status !== 'DATA LIMITED' && ag.status !== 'OFFLINE' && ag.status !== 'ERROR') {
      if (Array.isArray(ag.evidenceRecords) && ag.evidenceRecords.length > 0) {
        isVerified = ag.evidenceRecords.some((ev) => {
          if (!ev.verified || !ev.decisionEligible) return false;
          const freshness = normalizeEvidenceFreshnessMs(ev.freshnessMs);
          const eligibility = isEvidenceDecisionEligible(ev.classification, freshness);
          return eligibility.verified && eligibility.eligible;
        });
      }
    }

    if (isVerified) {
      verifiedAgentCount += 1;
    } else if (score >= 25) {
      limitedAgentCount += 1;
    } else {
      unavailableAgentCount += 1;
    }
  });

  const avgTrust = Math.round(totalTrust / (votingAgents.length || 1));

  return {
    councilConfidence: avgTrust,
    evidenceTrust: avgTrust,
    verifiedAgentCount,
    limitedAgentCount,
    unavailableAgentCount,
    totalVotingAgents: 15
  };
}

/**
 * Production Actionability Gate
 * 
 * Pipeline:
 * Market Data -> Agent Evidence -> Evidence Integrity Gate -> 15-Agent Consensus -> Market Session Gate -> Risk Guardian -> Position Sizing -> Human Approval -> Execution
 */
export type ActionabilityState =
  | 'ACTIONABLE'
  | 'ANALYSIS ONLY'
  | 'DATA LIMITED'
  | 'WAIT FOR VERIFIED DATA'
  | 'MONITOR'
  | 'NO TRADE';

export function evaluateActionabilityGate(params: {
  evidenceTrust: number;
  verifiedAgentCount: number;
  tradeExecutable: boolean;
  marketState?: string;
}): {
  actionabilityState: ActionabilityState;
  isActionable: boolean;
  reason: string;
} {
  const { evidenceTrust, verifiedAgentCount, tradeExecutable, marketState } = params;

  // 1. Session Gate takes strict precedence if market is closed
  if (!tradeExecutable || marketState === 'CLOSED' || marketState === 'WEEKEND_BREAK') {
    return {
      actionabilityState: 'MONITOR',
      isActionable: false,
      reason: `Market closed (${marketState || 'SESSION_GATE_LOCKED'}). Deliberations are for pre-open monitoring only.`
    };
  }

  // 2. Evidence Trust Gate: Requires at least 4 verified council agents and >= 40% evidence trust
  if (evidenceTrust < 40 || verifiedAgentCount < 4) {
    return {
      actionabilityState: 'DATA LIMITED',
      isActionable: false,
      reason: `Evidence quality limited (Trust: ${evidenceTrust}%, Verified agents: ${verifiedAgentCount}/15). Execution blocked.`
    };
  }

  // 3. Conditional: High setup confidence with partial verified evidence
  if (evidenceTrust < 60) {
    return {
      actionabilityState: 'ANALYSIS ONLY',
      isActionable: false,
      reason: `Moderate evidence trust (${evidenceTrust}%). Consensus available for analysis only.`
    };
  }

  // 4. Fully qualified
  return {
    actionabilityState: 'ACTIONABLE',
    isActionable: true,
    reason: `Verified evidence integrity verified (${evidenceTrust}% trust, ${verifiedAgentCount}/15 verified agents).`
  };
}
