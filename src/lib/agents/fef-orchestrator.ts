import { SharedMarketContext, INITIAL_BLACKBOARD_STATE } from './agent-blackboard';
import { globalEventBus, AgentEvent } from './agent-event-bus';

export interface OrchestratorMessage {
  id: string;
  agent: string;
  timestamp: string;
  eventType: string;
  observation: string;
  impact: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' | 'RESTRICTED' | 'DATA LIMITED';
  confidence: number;
  evidence: string[];
  responseTargets: string[];
}

export class FEFAIOrchestrator {
  private blackboard: SharedMarketContext = { ...INITIAL_BLACKBOARD_STATE };
  private messageLog: OrchestratorMessage[] = [];

  constructor() {
    this.initDefaultMessages();
  }

  private initDefaultMessages() {
    this.messageLog = [];
  }

  syncWithActiveAsset(symbol: string, price: number, spread: number, change24h: number, profile: any) {
    const isGold = symbol === 'XAUUSD';
    this.blackboard.selectedSymbol = symbol;
    this.blackboard.assetPrice = price;
    this.blackboard.xauusdPrice = isGold ? price : undefined;
    this.blackboard.marketRegime = profile.regime;
    this.blackboard.session = profile.session;
    this.blackboard.consensusScore = profile.confidence;
    this.blackboard.directionalVerdict = profile.setupDirection.includes('BUY')
      ? 'WATCH BUY'
      : profile.setupDirection.includes('SELL')
      ? 'WATCH SELL'
      : 'WAIT';
    this.blackboard.invalidationLevel = profile.stopLoss;

    // Synchronize message stream to active asset
    if (profile.debateMessages && profile.debateMessages.length > 0) {
      this.messageLog = profile.debateMessages.map((m: any, idx: number) => {
        const rawAgentName = (m.agent || '').toUpperCase();
        const foundAgent = Array.isArray(profile.agents)
          ? profile.agents.find((a: any) => {
              const aName = (a.name || '').toUpperCase();
              const aType = (a.type || '').toUpperCase();
              return rawAgentName.includes(aType) || aName.includes(rawAgentName.replace(' AGENT', ''));
            })
          : null;

        let mappedBias: OrchestratorMessage['bias'] = 'NEUTRAL';
        if (m.status === 'BULLISH') mappedBias = 'BULLISH';
        else if (m.status === 'BEARISH') mappedBias = 'BEARISH';
        else if (m.status === 'RESTRICTED') mappedBias = 'RESTRICTED';
        else if (m.status === 'CAUTION') mappedBias = 'CAUTION';
        else if (m.status === 'DATA LIMITED') mappedBias = 'DATA LIMITED';

        const agentConfidence = foundAgent
          ? (foundAgent.evidenceTrustScore ?? 0)
          : 0;

        const agentEvidence = foundAgent && Array.isArray(foundAgent.evidence) && foundAgent.evidence.length > 0
          ? foundAgent.evidence.slice(0, 2)
          : [];

        return {
          id: `orch-${symbol}-${idx}-${Date.now()}`,
          agent: m.agent,
          timestamp: m.time,
          eventType: 'COUNCIL_DEBATE_DISPATCH',
          observation: m.text,
          impact: `Active analysis for ${symbol} market structure.`,
          bias: mappedBias,
          confidence: agentConfidence,
          evidence: agentEvidence,
          responseTargets: ['Final Decision Agent', 'Human Operator Station']
        };
      });
    } else {
      this.messageLog = [];
    }
  }

  getBlackboard(): SharedMarketContext {
    return this.blackboard;
  }

  getMessages(): OrchestratorMessage[] {
    return this.messageLog;
  }

  processNewEvent(event: AgentEvent) {
    // Process incoming event and update blackboard
    if (event.type === 'PRICE_UPDATED') {
      this.blackboard.assetPrice = event.payload.price;
      if (this.blackboard.selectedSymbol === 'XAUUSD') {
        this.blackboard.xauusdPrice = event.payload.price;
      }
    }
  }

  addMessage(msg: Omit<OrchestratorMessage, 'id' | 'timestamp'>) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newMsg: OrchestratorMessage = {
      ...msg,
      id: `msg-${Date.now()}`,
      timestamp: timeStr
    };
    this.messageLog = [...this.messageLog.slice(-30), newMsg];
  }
}

export const fefOrchestrator = new FEFAIOrchestrator();

