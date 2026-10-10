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

export interface OrbitalNodeLayout {
  agent: AgentState;
  index: number;
  x: number;
  y: number;
  portX: number;
  portY: number;
  portSide: 'top' | 'bottom' | 'left' | 'right';
  targetX: number;
  targetY: number;
  pathD: string;
  isSpecialist: boolean;
}

export interface HubRadialNetworkSvgProps {
  orbitalNodes: OrbitalNodeLayout[];
  hoveredAgentKey: string | null;
  activeBurstAgents?: Set<string>;
  isPaused?: boolean;
}

export const HubRadialNetworkSvg: React.FC<HubRadialNetworkSvgProps> = ({
  orbitalNodes,
  hoveredAgentKey,
  activeBurstAgents,
  isPaused = false,
}) => {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10"
      viewBox="0 0 730 280"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Council Neutral Connector Gradient */}
        <linearGradient id="cortexTendrilCyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.75" />
          <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.8" />
        </linearGradient>

        {/* Bullish Connector Gradient (Emerald) */}
        <linearGradient id="cortexTendrilEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#34d399" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.9" />
        </linearGradient>

        {/* Bearish Connector Gradient (Rose) */}
        <linearGradient id="cortexTendrilRose" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#fb7185" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.9" />
        </linearGradient>

        {/* Data Limited Connector Gradient (Muted Amber - 50% intensity, clearly visible) */}
        <linearGradient id="cortexTendrilAmber" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.65" />
          <stop offset="60%" stopColor="#d97706" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.7" />
        </linearGradient>

        {/* Specialist Radial Connector Gradient */}
        <linearGradient id="cortexTendrilSpecialist" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.8" />
          <stop offset="60%" stopColor="#a855f7" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#c084fc" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Render all 20 connectors */}
      {orbitalNodes.map((item, i) => {
        const agentKey = item.agent.name + item.agent.type;
        const isHovered = hoveredAgentKey === agentKey;
        const isAnyHovered = Boolean(hoveredAgentKey);

        const isDataLimited = item.agent.status === 'DATA LIMITED';
        const isOffline = item.agent.status === 'OFFLINE';
        const isError = item.agent.status === 'ERROR';
        const isContributing = !isDataLimited && !isOffline && !isError;
        const isBull = item.agent.bias === 'BULLISH';
        const isBear = item.agent.bias === 'BEARISH';
        const isNeut = item.agent.bias === 'NEUTRAL';
        const isCaution = item.agent.bias === 'CAUTION' || item.agent.bias === 'RESTRICTED';

        // State-driven connector styling:
        // Bullish -> Emerald, Bearish -> Rose, Data Limited -> Amber, Neutral -> Cyan
        let strokeColor = 'url(#cortexTendrilCyan)';
        let strokeOpacity = isHovered ? 1 : isAnyHovered ? 0.25 : 0.45;
        let strokeWidth = isHovered ? 2.2 : 1.15;
        let pulseColor = '#38bdf8';
        let coreDotColor = '#00f0ff';

        if (isError) {
          strokeColor = '#e11d48';
          strokeOpacity = 0.35;
          strokeWidth = 0.9;
          coreDotColor = '#f43f5e';
          pulseColor = '#fb7185';
        } else if (isOffline) {
          strokeColor = '#475569';
          strokeOpacity = 0.25;
          strokeWidth = 0.85;
          coreDotColor = '#64748b';
          pulseColor = '#94a3b8';
        } else if (isDataLimited) {
          // Warm amber route, clearly visible at 0.50 opacity (45-60% of active intensity)
          strokeColor = 'url(#cortexTendrilAmber)';
          strokeOpacity = isHovered ? 0.9 : isAnyHovered ? 0.28 : 0.50;
          strokeWidth = isHovered ? 1.8 : 1.05;
          coreDotColor = '#f59e0b';
          pulseColor = '#fbbf24';
        } else if (isBull) {
          strokeColor = 'url(#cortexTendrilEmerald)';
          strokeOpacity = isHovered ? 1 : isAnyHovered ? 0.25 : 0.52;
          coreDotColor = '#10b981';
          pulseColor = '#34d399';
        } else if (isBear) {
          strokeColor = 'url(#cortexTendrilRose)';
          strokeOpacity = isHovered ? 1 : isAnyHovered ? 0.25 : 0.52;
          coreDotColor = '#f43f5e';
          pulseColor = '#fb7185';
        } else if (isCaution) {
          strokeColor = 'url(#cortexTendrilAmber)';
          strokeOpacity = isHovered ? 1 : isAnyHovered ? 0.25 : 0.48;
          coreDotColor = '#f59e0b';
          pulseColor = '#fbbf24';
        } else if (item.isSpecialist) {
          strokeColor = 'url(#cortexTendrilSpecialist)';
          coreDotColor = '#c084fc';
          pulseColor = '#d8b4fe';
        }

        const pathId = `cortex-connector-${i}`;

        // Deterministic Staggered Timing
        // Active contributing pulses: dur: 2.2s, rhythmic cadence
        // Data Limited nodes: slow calm heartbeat (dur: 4.5s, lower opacity) so connection is alive
        const staggerGroup = i % 5;
        const pulseDur = isDataLimited ? '4.5s' : '2.2s';
        const pulseBegin = `${(staggerGroup * 0.44).toFixed(2)}s`;
        const shouldPulse = !isPaused && (isContributing || isDataLimited);

        return (
          <g key={pathId} className="transition-opacity duration-300">
            {/* Complete Baseline Connector Path */}
            <path
              id={pathId}
              d={item.pathD}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeOpacity={strokeOpacity}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={isDataLimited ? '3 3' : undefined}
            />

            {/* Hover Halo Glow */}
            {isHovered && (
              <path
                d={item.pathD}
                stroke={coreDotColor}
                strokeWidth={3.5}
                strokeOpacity={0.35}
                fill="none"
              />
            )}

            {/* Port Inward Reception Point on Core Boundary */}
            <circle
              cx={item.targetX}
              cy={item.targetY}
              r={isHovered ? 2.4 : isContributing ? 1.6 : 1.3}
              fill={coreDotColor}
              opacity={strokeOpacity}
            />

            {/* Structured Digital Telemetry Pulse: AGENT -> CORTEX CORE */}
            {shouldPulse && (
              <g opacity={isDataLimited ? 0.5 : 0.95}>
                <animateMotion
                  dur={pulseDur}
                  begin={pulseBegin}
                  repeatCount="indefinite"
                  path={item.pathD}
                  rotate="auto"
                />
                {/* Luminous Head */}
                <circle cx="0" cy="0" r={isDataLimited ? 1.2 : 1.8} fill={pulseColor} />
                {/* Secondary trailing point */}
                {!isDataLimited && (
                  <>
                    <circle cx="-3" cy="0" r="1.1" fill={pulseColor} opacity="0.6" />
                    <line
                      x1="-3"
                      y1="0"
                      x2="-7"
                      y2="0"
                      stroke={pulseColor}
                      strokeWidth="1.1"
                      strokeLinecap="round"
                      opacity="0.35"
                    />
                  </>
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
};

