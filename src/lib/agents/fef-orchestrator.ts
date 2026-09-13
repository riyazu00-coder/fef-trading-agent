import { SharedMarketContext, INITIAL_BLACKBOARD_STATE } from './agent-blackboard';
import { globalEventBus, AgentEvent } from './agent-event-bus';

export interface OrchestratorMessage {
  id: string;
  agent: string;
  timestamp: string;
  eventType: string;
  observation: string;
  impact: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' | 'RESTRICTED';
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
    this.messageLog = [
      {
        id: 'msg-1',
        agent: 'TECHNICAL AGENT',
        timestamp: '18:14:48',
        eventType: 'LIQUIDITY_SWEEP_DETECTED',
        observation: 'M15 sell-side liquidity swept at 4341.20 with rapid displacement into H1 bullish FVG.',
        impact: 'Establishes primary intraday bullish structure shift.',
        bias: 'BULLISH',
        confidence: 84,
        evidence: ['Asian low sweep', 'M15 CHOCH at 4348.50', 'FVG retested at 4346.00'],
        responseTargets: ['Macro Agent', 'Correlation Agent', 'Strategy Agent']
      },
      {
        id: 'msg-2',
        agent: 'CORRELATION AGENT',
        timestamp: '18:14:52',
        eventType: 'STRUCTURE_BREAK_DETECTED',
        observation: 'DXY rejected 104.40 resistance ceiling; Silver (XAGUSD) leading with +1.28% relative strength.',
        impact: 'Confirms structural USD softening and precious metals alignment.',
        bias: 'BULLISH',
        confidence: 81,
        evidence: ['DXY -0.36% intraday', 'Silver SMT divergence', 'USDJPY failing 154.50'],
        responseTargets: ['Macro Agent', 'Final Decision Agent']
      },
      {
        id: 'msg-3',
        agent: 'MACRO AGENT',
        timestamp: '18:14:55',
        eventType: 'MACRO_EVENT_UPDATED',
        observation: 'US 10Y yield dropped to 4.214% (-1.40%), providing strong fundamental tailwind.',
        impact: 'Real yield reduction lowers the opportunity cost of non-yielding gold.',
        bias: 'BULLISH',
        confidence: 76,
        evidence: ['US10Y broke 4.25% support', 'Next FOMC rate cut odds at 72%'],
        responseTargets: ['Risk Guardian', 'Final Decision Agent']
      },
      {
        id: 'msg-4',
        agent: 'ORDER FLOW DELTA',
        timestamp: '18:14:56',
        eventType: 'CVD_DIVERGENCE_CONFIRMED',
        observation: 'Passive limit absorption detected at 4341.20. CVD momentum trend flipped positive.',
        impact: 'Validates Technical CHOCH with institutional order flow volume backing.',
        bias: 'BULLISH',
        confidence: 86,
        evidence: ['CVD divergence M5', 'Bid/Ask imbalance 3.2:1', 'Absorption at VWAP'],
        responseTargets: ['Technical Agent', 'Sniper Agent']
      },
      {
        id: 'msg-5',
        agent: 'SESSION KILLZONE',
        timestamp: '18:14:57',
        eventType: 'KILLZONE_EXPANSION_TRIGGERED',
        observation: 'London/NY overlap killzone open. Judas manipulation cycle completed; algorithmic expansion active.',
        impact: 'Optimal timing window open for high-probability impulse leg.',
        bias: 'BULLISH',
        confidence: 85,
        evidence: ['Judas swing low swept', 'London close overlap', 'IPDA 15:30 expansion'],
        responseTargets: ['Sniper Agent', 'Final Decision Agent']
      },
      {
        id: 'msg-6',
        agent: 'LIQUIDITY HEATMAP',
        timestamp: '18:14:58',
        eventType: 'LIQUIDITY_MAGNET_IDENTIFIED',
        observation: 'Sell-side liquidity cleared. Resting Buy-Side Liquidity cluster identified at 4358.50-4368.00.',
        impact: 'Clear upside path with zero liquidity friction beneath 4340 support.',
        bias: 'BULLISH',
        confidence: 87,
        evidence: ['SSL fully mitigated', 'BSL target cluster', 'Resting stops above equal highs'],
        responseTargets: ["Devil's Advocate", 'Sniper Agent']
      },
      {
        id: 'msg-7',
        agent: 'RISK GUARDIAN AGENT',
        timestamp: '18:14:59',
        eventType: 'RISK_LEVEL_CHANGED',
        observation: 'Core PCE release in 105 mins. While technicals are pristine, event risk requires risk discount.',
        impact: 'Enforcing max trade risk cap at 0.50% and hard stop below 4343.80.',
        bias: 'RESTRICTED',
        confidence: 88,
        evidence: ['High-Impact PCE countdown T-1h 45m', 'ATR 14.8 (Elevated volatility)'],
        responseTargets: ['Strategy Agent', 'Final Decision Agent']
      },
      {
        id: 'msg-8',
        agent: 'FINAL DECISION AGENT',
        timestamp: '18:15:00',
        eventType: 'CONSENSUS_CHANGED',
        observation: '15 Council Agents fully synchronized. Collective Confluence upgraded to 85% net bullish bias.',
        impact: 'Ready for human operator approval once confirmation candle completes.',
        bias: 'BULLISH',
        confidence: 85,
        evidence: ['11 Bullish, 2 Neutral, 2 Caution', 'Multi-agent confluence: 85%'],
        responseTargets: ['Human Operator Station', 'MT5 Execution Bridge']
      }
    ];
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
      this.messageLog = profile.debateMessages.map((m: any, idx: number) => ({
        id: `orch-${symbol}-${idx}-${Date.now()}`,
        agent: m.agent,
        timestamp: m.time,
        eventType: 'COUNCIL_DEBATE_DISPATCH',
        observation: m.text,
        impact: `Active analysis for ${symbol} market structure.`,
        bias: m.status === 'RESTRICTED' || m.status === 'CAUTION' ? m.status : m.status === 'BEARISH' ? 'BEARISH' : 'BULLISH',
        confidence: profile.confidence,
        evidence: profile.whyThisTrade.slice(0, 2),
        responseTargets: ['Final Decision Agent', 'Human Operator Station']
      }));
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

