export interface DeltaChangeEvent {
  id: string;
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
}

// Live verified change history (session-scoped)
const liveChangesStore: DeltaChangeEvent[] = [];

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
}
