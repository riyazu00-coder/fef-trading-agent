/**
 * Central Multi-Agent Intelligence Hub: Animation & Risk Warning Engine
 * 
 * Manages:
 * - Asynchronous agent activation cycles (Fast, Medium, Slow, Reactive)
 * - Agent node states (IDLE, RECEIVING, ANALYZING, SENDING, WAITING, DATA LIMITED, CAUTION)
 * - Color-coded data packet properties
 * - Dynamic Trading Risk Warning computation (LOW, MODERATE, HIGH, CRITICAL)
 * - Truthful cross-agent live communication feed
 */

import { AgentState, AgentType, BiasType } from './agent-types';
import { AssetIntelligenceProfile } from './multi-asset-pipeline';

export type HubAgentState = 
  | 'IDLE'
  | 'RECEIVING'
  | 'ANALYZING'
  | 'SENDING'
  | 'WAITING'
  | 'DATA LIMITED'
  | 'CAUTION';

export type RiskWarningLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type RiskGuardianActionState = 
  | 'NORMAL'
  | 'MONITORING'
  | 'CAUTION'
  | 'REDUCED RISK'
  | 'NEW ENTRIES RESTRICTED'
  | 'EXECUTION LOCKED'
  | 'WAITING FOR EVENT'
  | 'POSITION SIZE REDUCED';

export interface TradingRiskAssessment {
  level: RiskWarningLevel;
  color: string;
  badgeBg: string;
  riskGuardianAction: RiskGuardianActionState;
  impactEvent: {
    name: string;
    countdown: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW' | 'DATA LIMITED';
  };
  volatility: 'LOW' | 'MODERATE' | 'HIGH' | 'ELEVATED';
  volatilityDetail: string;
  spreadStatus: 'NORMAL' | 'ELEVATED' | 'WIDE' | 'DATA LIMITED';
  spreadDetail: string;
  agentDisagreement: 'LOW' | 'MODERATE' | 'HIGH';
  disagreementDetail: string;
  riskGuardianState: 'ARMED' | 'CAUTION' | 'RESTRICTED';
  accountRisk: string;
  positionCheck: string;
  summary: string;
}

export interface HubLiveMessage {
  id: string;
  timestamp: string;
  agentName: string;
  agentType: AgentType;
  recipient: string;
  message: string;
  status: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' | 'RESTRICTED' | 'DATA LIMITED';
  packetColor: string;
}

// Agent Activation Speed Categories
export const AGENT_SPEED_TIERS: Record<string, 'FAST' | 'MEDIUM' | 'SLOW' | 'REACTIVE'> = {
  TECHNICAL: 'FAST',
  ORDER_FLOW: 'FAST',
  LIQUIDITY_MAP: 'FAST',
  KILLZONE: 'FAST',
  VISION: 'FAST',
  
  SENTIMENT: 'MEDIUM',
  OPPORTUNITY: 'MEDIUM',
  STRATEGY: 'MEDIUM',
  CORRELATION: 'MEDIUM',

  MACRO: 'SLOW',
  NEWS: 'SLOW',
  GEOPOLITICAL: 'SLOW',
  INSTITUTIONAL: 'SLOW',

  RISK_GUARDIAN: 'REACTIVE',
  FINAL_DECISION: 'REACTIVE',
};

// SVG Connector Path Color Coding
export function getPacketColor(bias: BiasType, status: string, agentType: AgentType): string {
  if (status === 'DATA LIMITED') return '#64748b'; // Muted slate
  if (bias === 'RESTRICTED') return '#f43f5e'; // Red (Severe Risk)
  if (bias === 'CAUTION' || bias === 'WAIT') return '#f59e0b'; // Amber (Caution)
  if (agentType === 'RISK_GUARDIAN') return bias === 'BULLISH' ? '#10b981' : '#f59e0b';
  if (agentType === 'TECHNICAL' || agentType === 'VISION') return '#00f0ff'; // Cyan (Market data / patterns)
  if (agentType === 'MACRO' || agentType === 'CORRELATION') return '#3b82f6'; // Blue (Analytical evidence)
  if (agentType === 'ORDER_FLOW' || agentType === 'LIQUIDITY_MAP') return '#00f0ff'; // Cyan
  if (agentType === 'SENTIMENT' || agentType === 'INSTITUTIONAL') return '#a855f7'; // Violet (Cross-agent intelligence)
  if (bias === 'BULLISH') return '#10b981'; // Emerald (Confirmed evidence)
  return '#00f0ff'; // Default Cyan
}

/**
 * Calculates deterministic dynamic state for an agent node given elapsed seconds
 */
export function calculateAgentNodeState(
  agent: AgentState,
  elapsedSec: number,
  index: number
): HubAgentState {
  if (agent.status === 'DATA LIMITED') {
    return 'DATA LIMITED';
  }
  if (agent.bias === 'CAUTION' || agent.bias === 'RESTRICTED') {
    return 'CAUTION';
  }

  const tier = AGENT_SPEED_TIERS[agent.type] || 'MEDIUM';
  const offset = index * 0.45;
  const time = elapsedSec + offset;

  if (tier === 'FAST') {
    const cycle = time % 4.2;
    if (cycle < 0.6) return 'ANALYZING';
    if (cycle < 1.1) return 'SENDING';
    if (cycle < 1.6) return 'RECEIVING';
    return 'IDLE';
  }

  if (tier === 'MEDIUM') {
    const cycle = time % 6.0;
    if (cycle < 0.8) return 'ANALYZING';
    if (cycle < 1.4) return 'SENDING';
    if (cycle < 2.0) return 'RECEIVING';
    return 'IDLE';
  }

  if (tier === 'SLOW') {
    const cycle = time % 9.0;
    if (cycle < 1.0) return 'ANALYZING';
    if (cycle < 1.8) return 'SENDING';
    if (cycle < 2.6) return 'RECEIVING';
    return 'IDLE';
  }

  // REACTIVE (Risk Guardian, Final Decision)
  const cycle = time % 5.0;
  if (cycle < 0.8) return 'ANALYZING';
  if (cycle < 1.5) return 'SENDING';
  if (cycle < 2.2) return 'RECEIVING';
  return 'IDLE';
}

/**
 * Evaluates dynamic Trading Risk Assessment strictly bounded by active asset profile & market telemetry
 */
export function evaluateTradingRisk(
  profile: AssetIntelligenceProfile,
  spreadVal: number,
  isMt5Standby: boolean = true
): TradingRiskAssessment {
  const bullishCount = profile.agents.filter((a) => a.bias === 'BULLISH').length;
  const bearishCount = profile.agents.filter((a) => a.bias === 'BEARISH').length;
  const cautionCount = profile.agents.filter((a) => a.bias === 'CAUTION' || a.bias === 'RESTRICTED').length;

  const disagreement = (bullishCount > 0 && bearishCount > 0 && Math.abs(bullishCount - bearishCount) <= 3)
    ? 'HIGH'
    : (cautionCount >= 3 || (bullishCount > 0 && bearishCount > 0))
    ? 'MODERATE'
    : 'LOW';

  const riskGuardianAgent = profile.agents.find((a) => a.type === 'RISK_GUARDIAN');
  const rgBias = riskGuardianAgent ? riskGuardianAgent.bias : 'CAUTION';

  const rgState: 'ARMED' | 'CAUTION' | 'RESTRICTED' = 
    rgBias === 'RESTRICTED' ? 'RESTRICTED' : rgBias === 'CAUTION' ? 'CAUTION' : 'ARMED';

  // Evaluate volatility
  const isVolHigh = profile.volatility === 'HIGH' || profile.volatility === 'EXTREME';
  const volatilityLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'ELEVATED' = 
    profile.volatility === 'EXTREME' ? 'ELEVATED' : isVolHigh ? 'HIGH' : profile.volatility === 'LOW' ? 'LOW' : 'MODERATE';

  // Evaluate spread
  const hasSpread = typeof spreadVal === 'number' && Number.isFinite(spreadVal) && spreadVal >= 0;
  const isSpreadElevated = hasSpread && spreadVal > 2.5;
  const spreadStatus: 'NORMAL' | 'ELEVATED' | 'WIDE' | 'DATA LIMITED' =
    !hasSpread ? 'DATA LIMITED' : spreadVal > 4.0 ? 'WIDE' : isSpreadElevated ? 'ELEVATED' : 'NORMAL';

  // Economic event calendar telemetry (truthful fail-closed unavailable state)
  const eventName = 'Economic calendar unavailable';
  const eventCountdown = 'DATA LIMITED';
  const eventImpact: 'HIGH' | 'MEDIUM' | 'LOW' | 'DATA LIMITED' = 'DATA LIMITED';

  // Synthesize overall warning level strictly based on severity
  let level: RiskWarningLevel = 'LOW';
  const isSessionClosed = profile.tradeExecutable === false || (profile.sessionState && !profile.sessionState.tradeExecutable);

  if (rgState === 'RESTRICTED' || profile.setupDirection === 'NO TRADE') {
    level = 'CRITICAL';
  } else if (isSessionClosed || rgState === 'CAUTION' || isVolHigh || disagreement === 'HIGH' || spreadStatus === 'WIDE') {
    level = 'HIGH';
  } else if (disagreement === 'MODERATE' || isSpreadElevated) {
    level = 'MODERATE';
  }

  // Derive authentic Risk Guardian action state
  let riskGuardianAction: RiskGuardianActionState = 'NORMAL';
  if (level === 'CRITICAL' || rgState === 'RESTRICTED' || profile.setupDirection === 'NO TRADE') {
    riskGuardianAction = 'EXECUTION LOCKED';
  } else if (isSessionClosed) {
    riskGuardianAction = 'EXECUTION LOCKED';
  } else if (level === 'HIGH' || rgState === 'CAUTION') {
    riskGuardianAction = 'POSITION SIZE REDUCED';
  } else if (level === 'MODERATE') {
    riskGuardianAction = 'MONITORING';
  } else {
    riskGuardianAction = 'NORMAL';
  }

  // Color discipline: Red strictly for CRITICAL/LOCKED, orange/rose for HIGH, amber for MODERATE, emerald for LOW
  const color = level === 'CRITICAL'
    ? '#f43f5e'
    : level === 'HIGH'
    ? '#fb7185'
    : level === 'MODERATE'
    ? '#f59e0b'
    : '#10b981';

  const badgeBg = level === 'CRITICAL'
    ? 'bg-rose-950/70 border-rose-500/60 text-rose-300'
    : level === 'HIGH'
    ? 'bg-rose-950/50 border-rose-500/40 text-rose-300'
    : level === 'MODERATE'
    ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
    : 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300';

  const summaryText = level === 'CRITICAL'
    ? 'CRITICAL RISK: Exposure vetoed by Risk Guardian. Do not execute.'
    : isSessionClosed
    ? `MARKET ${profile.sessionState?.statusLabel || 'CLOSED'}: Execution locked by Risk Guardian until ${profile.sessionState?.nextOpenCountdown ? 'reopening in ' + profile.sessionState.nextOpenCountdown : 'session opens'}.`
    : level === 'HIGH'
    ? 'ELEVATED RISK: Volatility filters armed. Use reduced lot sizing.'
    : profile.actionabilityState === 'ACTIONABLE' && profile.blueprint
    ? 'NOMINAL RISK: Analysis gates satisfied for the current blueprint. Execution remains READ-ONLY pending position and execution validation.'
    : level === 'MODERATE'
    ? 'MODERATE RISK: Elevated spread or market dispersion detected. Standard monitoring active.'
    : `NOMINAL RISK: ${profile.actionabilityState || 'DATA LIMITED'} posture. Execution locked in READ-ONLY mode.`;

  return {
    level,
    color,
    badgeBg,
    riskGuardianAction,
    impactEvent: {
      name: eventName,
      countdown: eventCountdown,
      impact: eventImpact,
    },
    volatility: volatilityLevel,
    volatilityDetail: isVolHigh ? 'Elevated volatility regime detected' : 'Normal volatility regime detected',
    spreadStatus,
    spreadDetail: hasSpread
      ? `Current: ${spreadVal.toFixed(1)} pips (${isMt5Standby ? 'Broker Tick Standby' : 'MT5 Live'})`
      : 'Spread: DATA LIMITED / UNAVAILABLE',
    agentDisagreement: disagreement,
    disagreementDetail: `${bullishCount} Bullish, ${cautionCount} Caution, ${bearishCount} Bearish`,
    riskGuardianState: rgState,
    accountRisk: '0.50% max policy risk cap (Awaiting position sizing)',
    positionCheck: isSessionClosed
      ? `Market ${profile.sessionState?.statusLabel || 'Closed'} (Analysis Only)`
      : profile.blueprint && profile.blueprint.sl
      ? `Structural Stop Pegged (${profile.blueprint.sl.price}) • Awaiting Position Validation`
      : 'Awaiting validated position sizing',
    summary: summaryText
  };
}

/**
 * Extracts and formats truthful live dialogue messages derived from current asset profile
 */
export function getTruthfulLiveMessages(profile: AssetIntelligenceProfile): HubLiveMessage[] {
  if (!profile.debateMessages || profile.debateMessages.length === 0) {
    return [];
  }
  const baseMessages = profile.debateMessages;

  return baseMessages.map((msg, i) => {
    const rawAgentName = msg.agent || 'Council Agent';
    const cleanName = rawAgentName.replace(' Agent', '');
    const foundAgent = profile.agents.find(a => a.name.includes(cleanName) || cleanName.includes(a.name.replace(' Agent', '')));
    const agentType: AgentType = foundAgent ? foundAgent.type : 'COUNCIL_DEBATE';
    const packetColor = getPacketColor(msg.status as BiasType, 'ONLINE', agentType);

    return {
      id: `${profile.symbol}-msg-${i}-${msg.time}`,
      timestamp: msg.time,
      agentName: cleanName,
      agentType,
      recipient: cleanName === 'FEF AI Orchestrator' ? 'Swarm Matrix' : 'AI Orchestrator',
      message: msg.text,
      status: msg.status,
      packetColor
    };
  });
}
