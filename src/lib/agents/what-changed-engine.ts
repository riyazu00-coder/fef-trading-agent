export interface DeltaChangeEvent {
  id: string;
  symbol?: string;
  timePrevious: string;
  timeCurrent: string;
  previousVerdict: string;
  currentVerdict: string;
  previousConsensus: number;
  currentConsensus: number;
  marketCatalysts: string[];
  agentShifts: {
    agent: string;
    from: string;
    to: string;
    reason: string;
  }[];
  criticalTakeaway: string;
  timestamp?: number;
  reason?: string;
}

interface SymbolDecisionState {
  symbol: string;
  verdict: string;
  consensus: number;
  stage: string;
  actionability: string;
  evidenceTrust: number;
  timestamp: number;
}

// Live verified change history (session-scoped)
const liveChangesStore: DeltaChangeEvent[] = [];
const previousStateStore = new Map<string, SymbolDecisionState>();

export const HISTORICAL_CHANGES: DeltaChangeEvent[] = liveChangesStore;

export function recordDecisionTransition(event: DeltaChangeEvent): void {
  liveChangesStore.unshift(event);
  if (liveChangesStore.length > 20) {
    liveChangesStore.pop();
  }
}

export function getVerifiedHistoricalChanges(): DeltaChangeEvent[] {
  return [...liveChangesStore];
}

export function clearHistoricalChanges(): void {
  liveChangesStore.length = 0;
  previousStateStore.clear();
}

/**
 * Evaluates whether an asset profile has undergone a meaningful state transition
 * and records it to the verified transition store. Never fabricates fake history.
 */
export function evaluateAndRecordTransition(params: {
  symbol: string;
  currentVerdict: string;
  currentConsensus: number;
  stage?: string;
  actionability?: string;
  evidenceTrust?: number;
  catalysts?: string[];
  shifts?: { agent: string; from: string; to: string; reason: string }[];
  reason?: string;
}): void {
  const {
    symbol,
    currentVerdict,
    currentConsensus,
    stage = 'FORMING',
    actionability = 'ANALYSIS ONLY',
    evidenceTrust = 0,
    catalysts = [],
    shifts = [],
    reason = 'Market structure update',
  } = params;

  const now = Date.now();
  const timeCurrentStr = new Date(now).toLocaleTimeString('en-US', { hour12: false });
  const prevState = previousStateStore.get(symbol);

  if (!prevState) {
    // Initial state registration: record snapshot baseline but DO NOT emit fake transition
    previousStateStore.set(symbol, {
      symbol,
      verdict: currentVerdict,
      consensus: currentConsensus,
      stage,
      actionability,
      evidenceTrust,
      timestamp: now,
    });
    return;
  }

  // Detect genuine, meaningful transitions:
  const verdictChanged = prevState.verdict !== currentVerdict;
  const stageChanged = prevState.stage !== stage;
  const actionabilityChanged = prevState.actionability !== actionability;
  const consensusShift = Math.abs(prevState.consensus - currentConsensus) >= 10;
  const trustShift = Math.abs(prevState.evidenceTrust - evidenceTrust) >= 15;

  const isMeaningfulTransition =
    verdictChanged || stageChanged || actionabilityChanged || consensusShift || trustShift;

  if (isMeaningfulTransition) {
    const timePrevStr = new Date(prevState.timestamp).toLocaleTimeString('en-US', { hour12: false });
    const eventId = `delta-${symbol}-${now}-${Math.random().toString(36).slice(2, 6)}`;

    let criticalTakeaway = `Transitioned for ${symbol}: ${prevState.verdict} (${prevState.consensus}%) → ${currentVerdict} (${currentConsensus}%).`;
    if (stageChanged) {
      criticalTakeaway += ` Lifecycle stage: ${prevState.stage} → ${stage}.`;
    }
    if (actionabilityChanged) {
      criticalTakeaway += ` Actionability: ${prevState.actionability} → ${actionability}.`;
    }

    recordDecisionTransition({
      id: eventId,
      symbol,
      timePrevious: timePrevStr,
      timeCurrent: timeCurrentStr,
      previousVerdict: prevState.verdict,
      currentVerdict,
      previousConsensus: prevState.consensus,
      currentConsensus,
      marketCatalysts: catalysts.length > 0 ? catalysts : [`Structure update for ${symbol} at ${timeCurrentStr}`],
      agentShifts: shifts,
      criticalTakeaway,
      timestamp: now,
      reason,
    });

    // Update stored state
    previousStateStore.set(symbol, {
      symbol,
      verdict: currentVerdict,
      consensus: currentConsensus,
      stage,
      actionability,
      evidenceTrust,
      timestamp: now,
    });
  }
}

