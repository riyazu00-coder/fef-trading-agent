/**
 * FEF Agent Event Bus
 * Strongly typed events connecting all specialist agents to the Central Orchestrator.
 */

export type AgentEventType =
  | 'PRICE_UPDATED'
  | 'NEWS_RECEIVED'
  | 'MACRO_EVENT_UPDATED'
  | 'MARKET_REGIME_CHANGED'
  | 'STRUCTURE_BREAK_DETECTED'
  | 'LIQUIDITY_SWEEP_DETECTED'
  | 'CHART_SCREENSHOT_ANALYZED'
  | 'AGENT_ANALYSIS_COMPLETED'
  | 'AGENT_DISAGREEMENT_DETECTED'
  | 'CONSENSUS_CHANGED'
  | 'RISK_LEVEL_CHANGED'
  | 'SETUP_CREATED'
  | 'SETUP_INVALIDATED'
  | 'TRADE_APPROVED'
  | 'TRADE_MODIFIED'
  | 'TRADE_REJECTED';

export interface AgentEvent<T = any> {
  id: string;
  type: AgentEventType;
  timestamp: string;
  sourceAgent?: string;
  targetAgents?: string[];
  payload: T;
  summary: string;
}

export type EventListener<T = any> = (event: AgentEvent<T>) => void;

class AgentEventBus {
  private listeners: Map<AgentEventType, Set<EventListener>> = new Map();
  private history: AgentEvent[] = [];

  subscribe<T = any>(type: AgentEventType, callback: EventListener<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  publish<T = any>(event: Omit<AgentEvent<T>, 'id' | 'timestamp'>): AgentEvent<T> {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const fullEvent: AgentEvent<T> = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: timeStr
    };

    this.history.push(fullEvent);
    if (this.history.length > 100) this.history.shift();

    const subs = this.listeners.get(event.type);
    if (subs) {
      subs.forEach((cb) => cb(fullEvent));
    }

    return fullEvent;
  }

  getRecentEvents(count: number = 20): AgentEvent[] {
    return this.history.slice(-count);
  }
}

export const globalEventBus = new AgentEventBus();
