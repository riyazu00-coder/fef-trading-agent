'use client';

import React from 'react';
import { AgentState } from '@/lib/agents/agent-types';

export const SPECIALIST_AGENT_IDS = new Set([
  'MARKET_REGIME_CLASSIFIER_AGENT',
  'CURRENCY_STRENGTH_AGENT',
  'COT_POSITIONING_AGENT',
  'RATES_AGENT',
  'VOLATILITY_AGENT',
  'CENTRAL_BANK_POLICY_AGENT',
]);

export interface HubConnectorChannelProps {
  side: 'left' | 'right';
  agents: AgentState[];
  hoveredAgentKey: string | null;
}

// Symmetrical Y-anchors aligning with the 10 AgentNodePills in the column
const Y_COORDS_7 = [14, 46, 78, 110, 142, 174, 206];
const Y_COORDS_10 = [13, 39, 65, 91, 117, 143, 169, 195, 221, 247];

export const HubConnectorChannel: React.FC<HubConnectorChannelProps> = ({
  side,
  agents,
  hoveredAgentKey,
}) => {
  const isLeft = side === 'left';
  const yCoords = agents.length > 7 ? Y_COORDS_10 : Y_COORDS_7;

  return (
    <svg
      className="w-full h-full pointer-events-none overflow-visible"
      viewBox="0 0 100 260"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Council Gradient (Agent Pill -> Center Core) */}
        <linearGradient id={`tendrilGrad-${side}`} x1={isLeft ? '0' : '1'} y1="0" x2={isLeft ? '1' : '0'} y2="0">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.75" />
          <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.3" />
        </linearGradient>

        {/* Specialist Violet Gradient (Agent Pill -> Center Core) */}
        <linearGradient id={`tendrilGrad-spec-${side}`} x1={isLeft ? '0' : '1'} y1="0" x2={isLeft ? '1' : '0'} y2="0">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.8" />
          <stop offset="55%" stopColor="#a855f7" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.3" />
        </linearGradient>
      </defs>

      {agents.map((ag, i) => {
        const y = yCoords[i] ?? 130;
        const pathId = `${side}-tendril-${i}`;
        const agentKey = ag.name + ag.type;
        const isSpecialist = SPECIALIST_AGENT_IDS.has(ag.type);
        const isHovered = hoveredAgentKey === agentKey;
        const isAnyHovered = Boolean(hoveredAgentKey);

        const isDataLimited = ag.status === 'DATA LIMITED';
        const isOffline = ag.status === 'OFFLINE';
        const isError = ag.status === 'ERROR';
        const isContributing = !isDataLimited && !isOffline && !isError;

        // Visual opacity for base line
        let opacity = isHovered ? 1 : isAnyHovered ? 0.2 : isSpecialist ? 0.55 : 0.48;
        if (!isContributing) {
          opacity = isOffline || isError ? 0.15 : 0.25;
        }

        const strokeWidth = isHovered ? 2.5 : isContributing ? 1.2 : 0.9;

        // Graceful vertical distribution along the Core rim (~32px total vertical zone)
        // Eliminates single-point line clumping while maintaining clean trumpet convergence
        const targetY = +(130 + (i - (agents.length - 1) / 2) * 3.4).toFixed(1);

        // Path calculation: strictly from Agent Pill (t=0) to Core rim (t=1)
        // Left: x=0 (pill right edge) to x=100 (core left rim at targetY)
        // Right: x=100 (pill left edge) to x=0 (core right rim at targetY)
        const d = isLeft
          ? `M 0 ${y} C 45 ${y}, 75 ${targetY}, 100 ${targetY}`
          : `M 100 ${y} C 55 ${y}, 25 ${targetY}, 0 ${targetY}`;

        const gradId = isSpecialist ? `tendrilGrad-spec-${side}` : `tendrilGrad-${side}`;

        const flowColor = isSpecialist ? '#c084fc' : '#00f0ff';

        return (
          <g key={pathId} className="transition-opacity duration-300">
            {/* Complete static Agent -> Core route. Runtime state changes style, never topology. */}
            <path
              id={pathId}
              d={d}
              stroke={!isContributing ? '#334155' : `url(#${gradId})`}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="none"
              opacity={opacity}
              pathLength="100"
            />

            {/* Hover highlight halo line */}
            {isHovered && (
              <path
                d={d}
                stroke={flowColor}
                strokeWidth={3.5}
                fill="none"
                opacity={0.35}
                pathLength="100"
              />
            )}

            {/* Pill connection anchor dot */}
            <circle
              cx={isLeft ? 0 : 100}
              cy={y}
              r={isHovered ? 2.8 : isContributing ? 1.8 : 1.2}
              fill={isHovered ? flowColor : isContributing ? (isSpecialist ? '#c084fc' : '#00f0ff') : '#475569'}
              opacity={opacity}
            />
          </g>
        );
      })}
    </svg>
  );
};

export interface HubNetworkSvgProps {
  leftAgents: AgentState[];
  rightAgents: AgentState[];
  hoveredAgentKey: string | null;
  activeBurstAgents?: Set<string>;
  activeAckAgents?: Set<string>;
  activePacketRoute?: { from: string; to: string } | null;
  isPaused?: boolean;
}

export const HubNetworkSvg: React.FC<HubNetworkSvgProps> = ({
  leftAgents,
  rightAgents,
  hoveredAgentKey,
}) => {
  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none flex items-center justify-between z-0">
      <div className="w-36 sm:w-40 md:w-44 flex-shrink-0" />
      <div className="flex-1 h-[260px] relative">
        <HubConnectorChannel
          side="left"
          agents={leftAgents}
          hoveredAgentKey={hoveredAgentKey}
        />
      </div>
      <div className="w-36 h-36 sm:w-40 sm:h-40 flex-shrink-0" />
      <div className="flex-1 h-[260px] relative">
        <HubConnectorChannel
          side="right"
          agents={rightAgents}
          hoveredAgentKey={hoveredAgentKey}
        />
      </div>
      <div className="w-36 sm:w-40 md:w-44 flex-shrink-0" />
    </div>
  );
};
