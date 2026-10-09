'use client';

import React, { useState } from 'react';
import { AgentState } from '@/lib/agents/agent-types';
import { calculateAgentNodeState, HubAgentState } from '@/lib/agents/hub-animation-engine';

interface AgentNodePillProps {
  agent: AgentState;
  index: number;
  side: 'left' | 'right';
  elapsedSec: number;
  isHovered: boolean;
  onHover: (key: string | null) => void;
  onClick: (agent: AgentState) => void;
  isSpecialist?: boolean;
  isBursting?: boolean;
}

export const AgentNodePill: React.FC<AgentNodePillProps> = ({
  agent,
  index,
  side,
  elapsedSec,
  isHovered,
  onHover,
  onClick,
  isSpecialist = false,
  isBursting = false,
}) => {
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  const agentKey = agent.name + agent.type;
  const nodeState: HubAgentState = calculateAgentNodeState(agent, elapsedSec, index);

  const isDataLimited = agent.status === 'DATA LIMITED';
  const isOffline = agent.status === 'OFFLINE';
  const isError = agent.status === 'ERROR';
  const isCaution = agent.bias === 'CAUTION' || agent.bias === 'RESTRICTED';
  const isBull = agent.bias === 'BULLISH';
  const isBear = agent.bias === 'BEARISH';
  const isRiskGuardian = agent.type === 'RISK_GUARDIAN';

  // Dot color & pulse
  const dotColor = isError
    ? 'bg-rose-500'
    : isOffline
    ? 'bg-slate-500'
    : isDataLimited
    ? 'bg-slate-400'
    : isCaution
    ? 'bg-amber-400'
    : isBull
    ? 'bg-emerald-400'
    : isBear
    ? 'bg-rose-400'
    : 'bg-cyan-400';

  const statusColor = isError
    ? 'text-rose-400'
    : isOffline
    ? 'text-slate-500'
    : isDataLimited
    ? 'text-slate-400'
    : isCaution
    ? 'text-amber-400'
    : isBull
    ? 'text-emerald-400'
    : isBear
    ? 'text-rose-400'
    : 'text-cyan-300';

  const isRestricted = agent.bias === 'RESTRICTED';

  // Dynamic border & glow: subtle by default, elevated outline strictly when actively communicating or bursting
  let borderStyle = isSpecialist
    ? 'border-purple-500/30 bg-[#0a0f24]/85 text-purple-200/90 shadow-none'
    : 'border-cyan-500/20 bg-[#091526]/80 text-gray-300 shadow-none';
  
  if (isError) {
    borderStyle = 'border-rose-700/60 bg-[#16080d]/80 text-rose-400 shadow-none';
  } else if (isOffline) {
    borderStyle = 'border-slate-800/50 bg-[#060c18]/50 text-slate-500 shadow-none';
  } else if (isDataLimited) {
    borderStyle = 'border-slate-700/40 bg-[#091526]/60 text-slate-400 shadow-none';
  } else if (isBursting) {
    borderStyle = isSpecialist
      ? 'border-purple-400 bg-[#160e36] ring-1 ring-purple-400/60 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
      : 'border-cyan-400 bg-[#071d38] ring-1 ring-cyan-400/60 shadow-[0_0_12px_rgba(0,240,255,0.4)]';
  } else if (isRestricted) {
    borderStyle = 'border-rose-500/70 bg-rose-950/40 shadow-[0_0_12px_rgba(244,63,94,0.35)] animate-pulse';
  } else if (isCaution) {
    borderStyle = 'border-amber-500/60 bg-amber-950/30 shadow-[0_0_10px_rgba(251,191,36,0.3)]';
  } else if (nodeState === 'ANALYZING') {
    borderStyle = 'border-purple-400/70 bg-[#0e1736] shadow-[0_0_12px_rgba(168,85,247,0.35)] ring-1 ring-purple-400/40';
  } else if (nodeState === 'SENDING') {
    borderStyle = isSpecialist
      ? 'border-purple-400/70 bg-[#140f2e] shadow-[0_0_12px_rgba(168,85,247,0.35)] ring-1 ring-purple-400/40'
      : 'border-blue-400/70 bg-[#0a1c38] shadow-[0_0_12px_rgba(59,130,246,0.35)] ring-1 ring-blue-400/40';
  } else if (nodeState === 'RECEIVING') {
    borderStyle = 'border-cyan-400/70 bg-[#0a1b33] shadow-[0_0_10px_rgba(0,240,255,0.35)] ring-1 ring-cyan-400/40';
  }

  // Extra elevated emphasis if Risk Guardian is actively in caution
  if (isRiskGuardian && isCaution) {
    borderStyle = 'border-amber-400 bg-amber-950/50 shadow-[0_0_14px_rgba(251,191,36,0.4)] animate-pulse';
  }

  const getDisplayAgentName = (name: string, type: string) => {
    switch (type) {
      case 'MARKET_REGIME_CLASSIFIER_AGENT':
        return 'Market Regime';
      case 'CURRENCY_STRENGTH_AGENT':
        return 'Currencies';
      case 'COT_POSITIONING_AGENT':
        return 'COT Profiler';
      case 'RATES_AGENT':
        return 'Rates Regime';
      case 'VOLATILITY_AGENT':
        return 'Volatility';
      case 'CENTRAL_BANK_POLICY_AGENT':
        return 'Central Bank';
      case 'ORDER_FLOW':
      case 'SCALPER_FLOW_SHIFT':
        return 'Scalper / Flow';
      default:
        return name.replace(' Agent', '').replace(' Sniper', '');
    }
  };

  const cleanName = getDisplayAgentName(agent.name, agent.type);

  const statusText = isError
    ? 'ERROR'
    : isOffline
    ? 'OFFLINE'
    : isDataLimited
    ? 'DATA LTD'
    : `${agent.confidence}% ${agent.bias === 'BULLISH' ? 'BULL' : agent.bias === 'BEARISH' ? 'BEAR' : agent.bias === 'NEUTRAL' ? 'NEUT' : agent.bias.slice(0, 4)}`;

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        setShowTooltip(true);
        onHover(agentKey);
      }}
      onMouseLeave={() => {
        setShowTooltip(false);
        onHover(null);
      }}
    >
      {/* Agent Pill Container */}
      <div
        onClick={() => onClick(agent)}
        className={`flex items-center justify-between px-2 py-0.5 sm:py-0.8 rounded-lg sm:rounded-xl border text-[8px] sm:text-[8.5px] font-mono transition-all cursor-pointer select-none ${
          isHovered ? 'scale-[1.02] z-20 brightness-110 shadow-[0_0_10px_rgba(0,240,255,0.3)]' : 'hover:scale-[1.01]'
        } ${borderStyle}`}
      >
        {/* Left: Indicator dot & clean name */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 truncate">
          <span className="relative flex h-2 w-2 flex-shrink-0 items-center justify-center">
            {(nodeState === 'SENDING' || isBursting) && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColor}`} />
            )}
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColor}`} />
          </span>

          <span className="text-gray-200 font-bold truncate tracking-tight">
            {cleanName}
          </span>
          {isSpecialist && (
            <span className="text-[6px] px-1 py-0.2 rounded bg-purple-950/70 text-purple-300 border border-purple-500/30 font-bold flex-shrink-0">
              SPEC
            </span>
          )}
        </div>

        {/* Right: Confidence & Bias or Textual Status */}
        <span className={`font-bold flex-shrink-0 pl-1 ${statusColor}`}>
          {statusText}
        </span>
      </div>

      {/* Compact Interactive Tooltip on Hover */}
      {showTooltip && (
        <div
          className={`absolute z-50 pointer-events-none w-52 p-2 rounded-xl bg-[#030a17]/95 border border-cyan-400/50 shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-md text-[9px] font-mono space-y-1 ${
            side === 'left' ? 'left-0 top-full mt-1 sm:left-full sm:top-0 sm:mt-0 sm:ml-2' : 'right-0 top-full mt-1 sm:right-full sm:top-0 sm:mt-0 sm:mr-2'
          }`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-1">
            <span className="font-bold text-white uppercase">{cleanName}</span>
            <span className={`px-1 py-0.2 rounded text-[7.5px] font-bold ${
              nodeState === 'CAUTION' ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40' : 'bg-cyan-950/60 text-cyan-300 border border-cyan-500/40'
            }`}>
              {nodeState}
            </span>
          </div>

          <div className="text-[8px] text-gray-300 leading-tight">
            {agent.role}
          </div>

          <div className="grid grid-cols-2 gap-1 pt-1 border-t border-white/5 text-[8px]">
            <div>
              <span className="text-gray-400">Confidence: </span>
              <strong className="text-cyan-300">{agent.confidence}%</strong>
            </div>
            <div>
              <span className="text-gray-400">Bias: </span>
              <strong className={statusColor}>{agent.bias}</strong>
            </div>
            <div>
              <span className="text-gray-400">Freshness: </span>
              <strong className={isDataLimited ? 'text-amber-400' : 'text-emerald-400'}>
                {isDataLimited ? 'DELAYED' : 'LIVE'}
              </strong>
            </div>
            <div>
              <span className="text-gray-400">Signals: </span>
              <strong className="text-white">{agent.evidence ? agent.evidence.length : 1} items</strong>
            </div>
          </div>

          {agent.evidence && agent.evidence[0] && (
            <div className="text-[7.5px] text-gray-300 italic truncate pt-0.5 border-t border-white/5">
              &ldquo;{agent.evidence[0]}&rdquo;
            </div>
          )}

          <div className="text-[7px] text-cyan-400/80 text-right pt-0.5 font-sans">
            Click to view full agent dossier &rarr;
          </div>
        </div>
      )}
    </div>
  );
};
