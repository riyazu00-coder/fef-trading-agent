/**
 * FEF CORTEX — DETERMINISTIC CONFLUENCE ENGINE
 * Milestone D Clean-Room Implementation
 * 
 * Rules:
 * 1. Zero naive majority voting: 5 weak or correlated agents agreeing must NOT beat
 *    2 agents with verified, high-quality, independent evidence.
 * 2. Domain-family deduplication: multiple agents citing the same underlying domain
 *    (e.g. Technical + Structure sharing candles, Macro + Rates sharing 10Y yield)
 *    are grouped into evidence families so correlated evidence is not multi-counted.
 * 3. Conflict preservation: when high-trust agents disagree, conflictScore rises,
 *    thesis becomes MIXED or CAUTION, and confidence drops.
 * 4. Distinct dimensions:
 *    - directionalThesis: BULLISH | BEARISH | MIXED | NEUTRAL | DATA_LIMITED
 *    - presentationPosture: WAIT | WATCH FOR BUY | WATCH FOR SELL (strictly non-executable)
 *    - riskState: LOW | NORMAL | ELEVATED | CRITICAL
 *    - dataReadiness: READY | PARTIAL | DATA_LIMITED | UNAVAILABLE
 */

import { EvidenceDomainFamily, EvidencePolarity, UnifiedAgentResponse } from '../agents/contracts/unified-agent-contract';

export type ConfluenceDirection = 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL' | 'DATA_LIMITED';

export type PresentationPosture = 'WAIT' | 'WATCH FOR BUY' | 'WATCH FOR SELL';

export type ConfluenceRiskState = 'LOW' | 'NORMAL' | 'ELEVATED' | 'CRITICAL';

export interface ConfluenceEngineInputs {
  instrument: string;
  agents: UnifiedAgentResponse[];
  riskCheckPassed?: boolean;
}

export interface ConfluenceOutput {
  instrument: string;
  directionalThesis: ConfluenceDirection;
  presentationPosture: PresentationPosture;
  
  confidence: number;       // 0 to 100 deterministic confluence score
  evidenceTrust: number;    // 0 to 100 aggregate evidence trust
  dataReadiness: 'READY' | 'PARTIAL' | 'DATA_LIMITED' | 'UNAVAILABLE';
  riskState: ConfluenceRiskState;
  
  agreementScore: number;   // 0 to 100
  conflictScore: number;    // 0 to 100
  coverageScore: number;    // 0 to 100 (domain families covered)
  
  supportingDomains: EvidenceDomainFamily[];
  opposingDomains: EvidenceDomainFamily[];
  
  supportingAgents: string[];
  opposingAgents: string[];
  neutralAgents: string[];
  unavailableAgents: string[];
  
  criticalConflicts: string[];
  missingEvidence: string[];
  invalidationFactors: string[];
  
  summaryReasoning: string;
  generatedAt: number;
}

// Weights by Evidence Domain Family (Sum of primary domain weights normalized)
export const DOMAIN_WEIGHTS: Record<EvidenceDomainFamily, number> = {
  RATES: 0.18,
  INFLATION: 0.10,
  PRICE_TECHNICAL: 0.15,
  MARKET_STRUCTURE: 0.15,
  LIQUIDITY: 0.12,
  ORDER_FLOW: 0.10,
  MACRO_REGIME: 0.10,
  NEWS_EVENT: 0.05,
  GEOPOLITICAL_EVENT: 0.05,
  SENTIMENT: 0.05,
  CROSS_ASSET: 0.05,
  VOLATILITY: 0.05,
  QUANT_STATISTICAL: 0.05,
  HISTORICAL_ANALOGUE: 0.05,
  PORTFOLIO_EXPOSURE: 0.02,
  RISK_GEOMETRY: 0.05,
  SYSTEM_INTEGRITY: 0.05,
};

export class CortexConfluenceEngine {
  public static evaluateConfluence(inputs: ConfluenceEngineInputs | UnifiedAgentResponse[]): ConfluenceOutput {
    return new CortexConfluenceEngine().evaluateConfluence(inputs);
  }

  /**
   * Deterministically synthesizes unified agent responses into a Confluence decision.
   */
  public evaluateConfluence(inputs: ConfluenceEngineInputs | UnifiedAgentResponse[]): ConfluenceOutput {
    const normInputs: ConfluenceEngineInputs = Array.isArray(inputs)
      ? { instrument: 'XAUUSD', agents: inputs }
      : inputs;
    const agents = normInputs.agents || [];
    const missingEvidence: string[] = [];
    const criticalConflicts: string[] = [];
    const invalidationFactors: string[] = [];

    const supportingAgents: string[] = [];
    const opposingAgents: string[] = [];
    const neutralAgents: string[] = [];
    const unavailableAgents: string[] = [];

    // 1. Group Agents by Domain Family (Deduplication Layer)
    const domainMap = new Map<EvidenceDomainFamily, {
      bullishTrustSum: number;
      bearishTrustSum: number;
      agents: UnifiedAgentResponse[];
    }>();

    for (const ag of agents) {
      if (ag.readiness === 'UNAVAILABLE' || ag.confidence === 0) {
        unavailableAgents.push(ag.agentName);
        continue;
      }

      const dir = (ag.direction || (ag as any).stance || 'NEUTRAL') as EvidencePolarity;
      const domain = (ag.domainFamily || (ag as any).primaryDomain || 'SYSTEM_INTEGRITY') as EvidenceDomainFamily;
      const trust = typeof ag.evidenceTrust === 'number' ? ag.evidenceTrust : (ag as any).evidenceTrustScore || 0;

      if (dir === 'NEUTRAL') {
        neutralAgents.push(ag.agentName);
      } else if (dir === 'BULLISH') {
        supportingAgents.push(ag.agentName);
      } else if (dir === 'BEARISH') {
        opposingAgents.push(ag.agentName);
      }

      if (!domainMap.has(domain)) {
        domainMap.set(domain, { bullishTrustSum: 0, bearishTrustSum: 0, agents: [] });
      }
      const dEntry = domainMap.get(domain)!;
      dEntry.agents.push(ag);

      const effectiveTrust = (trust / 100) * (ag.confidence / 100);
      if (dir === 'BULLISH') {
        dEntry.bullishTrustSum += effectiveTrust;
      } else if (dir === 'BEARISH') {
        dEntry.bearishTrustSum += effectiveTrust;
      }

      if (ag.invalidation) {
        invalidationFactors.push(`${ag.agentName}: ${ag.invalidation}`);
      }
      if (ag.missingEvidence && ag.missingEvidence.length > 0) {
        missingEvidence.push(...ag.missingEvidence);
      }
    }

    // 2. Evaluate Unique Domain Families (Prevents multi-counting correlated agents)
    let totalDomainWeight = 0;
    let bullishDomainWeight = 0;
    let bearishDomainWeight = 0;
    const supportingDomains: EvidenceDomainFamily[] = [];
    const opposingDomains: EvidenceDomainFamily[] = [];

    for (const [family, dData] of Array.from(domainMap.entries())) {
      const familyBaseWeight = DOMAIN_WEIGHTS[family] || 0.05;
      const avgDomainQuality = dData.agents.length > 0
        ? Math.min(1.0, (dData.bullishTrustSum + dData.bearishTrustSum) / dData.agents.length)
        : 0.5;
      // Scale domain weight by quality: high-trust verified domain carries full weight; weak/heuristic domain is appropriately discounted
      const scaledFamilyWeight = familyBaseWeight * Math.max(0.15, avgDomainQuality);
      totalDomainWeight += scaledFamilyWeight;

      // Each domain family gets at most ONE aggregate vote weighted by its scaled weight
      if (dData.bullishTrustSum > dData.bearishTrustSum * 1.3) {
        bullishDomainWeight += scaledFamilyWeight;
        supportingDomains.push(family);
      } else if (dData.bearishTrustSum > dData.bullishTrustSum * 1.3) {
        bearishDomainWeight += scaledFamilyWeight;
        opposingDomains.push(family);
      } else if (dData.bullishTrustSum > 0 && dData.bearishTrustSum > 0) {
        criticalConflicts.push(`Internal conflict in domain ${family} (opposing agent assessments).`);
      }
    }

    // 3. Domain Coverage Score
    const expectedKeyDomains = 6; // e.g. RATES, INFLATION, PRICE_TECHNICAL, MARKET_STRUCTURE, LIQUIDITY, ORDER_FLOW
    const uniqueActiveFamilies = domainMap.size;
    const coverageScore = Math.min(100, Math.round((uniqueActiveFamilies / expectedKeyDomains) * 100));

    // 4. Agreement and Conflict Scores
    let agreementScore = 0;
    let conflictScore = 0;
    if (bullishDomainWeight > 0 || bearishDomainWeight > 0) {
      const dominantWeight = Math.max(bullishDomainWeight, bearishDomainWeight);
      const submissiveWeight = Math.min(bullishDomainWeight, bearishDomainWeight);
      const totalDecisiveWeight = dominantWeight + submissiveWeight;

      agreementScore = Math.round((dominantWeight / totalDecisiveWeight) * 100);
      conflictScore = Math.round((submissiveWeight / totalDecisiveWeight) * 100);
    }

    if (conflictScore >= 30) {
      criticalConflicts.push(`Major inter-domain disagreement: ${supportingDomains.join(', ')} vs ${opposingDomains.join(', ')}.`);
    }

    // 5. Data Readiness
    let dataReadiness: 'READY' | 'PARTIAL' | 'DATA_LIMITED' | 'UNAVAILABLE' = 'DATA_LIMITED';
    if (coverageScore >= 65) {
      dataReadiness = 'READY';
    } else if (coverageScore >= 30) {
      dataReadiness = 'PARTIAL';
    } else if (uniqueActiveFamilies > 0) {
      dataReadiness = 'DATA_LIMITED';
    } else {
      dataReadiness = 'UNAVAILABLE';
    }

    // 6. Directional Thesis
    let directionalThesis: ConfluenceDirection = 'DATA_LIMITED';
    if (uniqueActiveFamilies === 0) {
      directionalThesis = 'DATA_LIMITED';
    } else if (conflictScore >= 35) {
      directionalThesis = 'MIXED';
    } else if (bullishDomainWeight >= 0.10 && bullishDomainWeight > bearishDomainWeight * 1.5) {
      directionalThesis = 'BULLISH';
    } else if (bearishDomainWeight >= 0.10 && bearishDomainWeight > bullishDomainWeight * 1.5) {
      directionalThesis = 'BEARISH';
    } else if (bullishDomainWeight > 0 || bearishDomainWeight > 0) {
      directionalThesis = 'MIXED';
    } else {
      directionalThesis = 'NEUTRAL';
    }

    // 7. Presentation Posture (WAIT, WATCH FOR BUY, WATCH FOR SELL — strictly non-executable)
    let presentationPosture: PresentationPosture = 'WAIT';
    if (directionalThesis === 'BULLISH' && conflictScore < 25 && dataReadiness !== 'DATA_LIMITED') {
      presentationPosture = 'WATCH FOR BUY';
    } else if (directionalThesis === 'BEARISH' && conflictScore < 25 && dataReadiness !== 'DATA_LIMITED') {
      presentationPosture = 'WATCH FOR SELL';
    } else {
      presentationPosture = 'WAIT';
    }

    // 8. Deterministic Confidence & Evidence Trust
    let confidence = 0;
    let evidenceTrust = 0;
    if (uniqueActiveFamilies > 0) {
      // Base confidence scales with agreement and coverage
      confidence = Math.round((agreementScore * 0.6) + (coverageScore * 0.4));
      // Conflict penalty
      if (conflictScore > 0) {
        confidence = Math.max(10, confidence - Math.round(conflictScore * 0.5));
      }
      confidence = Math.min(95, Math.max(0, confidence));

      // Aggregate evidence trust is the average trust of active agents
      const activeAgents = agents.filter((a) => a.readiness !== 'UNAVAILABLE');
      if (activeAgents.length > 0) {
        evidenceTrust = Math.round(
          activeAgents.reduce((acc, a) => acc + a.evidenceTrust, 0) / activeAgents.length
        );
      }
    }

    // 9. Risk State
    let riskState: ConfluenceRiskState = 'NORMAL';
    if (conflictScore >= 40 || dataReadiness === 'DATA_LIMITED') {
      riskState = 'ELEVATED';
    }
    if (normInputs.riskCheckPassed === false) {
      riskState = 'CRITICAL';
    }

    // 10. Summary Reasoning
    let summaryReasoning = '';
    if (directionalThesis === 'DATA_LIMITED') {
      summaryReasoning = 'Telemetry limited across council specialist domains; preserving WAIT posture.';
    } else if (directionalThesis === 'MIXED') {
      summaryReasoning = `Confluence council divided: ${supportingDomains.length} domains supportive vs ${opposingDomains.length} domains opposing. High conflict preserved without forced consensus.`;
    } else if (directionalThesis === 'BULLISH') {
      summaryReasoning = `Confluence aligns BULLISH across ${supportingDomains.join(', ')} with ${agreementScore}% domain agreement.`;
    } else if (directionalThesis === 'BEARISH') {
      summaryReasoning = `Confluence aligns BEARISH across ${opposingDomains.join(', ')} with ${agreementScore}% domain agreement.`;
    } else {
      summaryReasoning = 'Confluence council evaluates conditions as balanced / neutral.';
    }

    return {
      instrument: normInputs.instrument,
      directionalThesis,
      presentationPosture,
      confidence,
      evidenceTrust,
      dataReadiness,
      riskState,
      agreementScore,
      conflictScore,
      coverageScore,
      supportingDomains,
      opposingDomains,
      supportingAgents,
      opposingAgents,
      neutralAgents,
      unavailableAgents,
      criticalConflicts,
      missingEvidence: Array.from(new Set(missingEvidence)),
      invalidationFactors: Array.from(new Set(invalidationFactors)).slice(0, 5),
      summaryReasoning,
      generatedAt: Date.now(),
    };
  }
}
