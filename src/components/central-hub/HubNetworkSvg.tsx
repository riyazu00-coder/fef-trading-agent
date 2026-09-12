'use client';

import React from 'react';
import { AgentState } from '@/lib/agents/agent-types';
import { getPacketColor, AGENT_SPEED_TIERS } from '@/lib/agents/hub-animation-engine';

interface HubNetworkSvgProps {
  leftAgents: AgentState[];
  rightAgents: AgentState[];
  hoveredAgentKey: string | null;
  activePacketRoute: { from: string; to: string } | null;
  isPaused?: boolean;
}

// 7 Symmetrical y-anchors for Left & Right agents
const Y_COORDS = [25, 55, 85, 115, 145, 175, 205];

export const HubNetworkSvg: React.FC<HubNetworkSvgProps> = ({
  leftAgents,
  rightAgents,
  hoveredAgentKey,
  activePacketRoute,
  isPaused = false,
}) => {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 600 240"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {/* Gradients */}
        <linearGradient id="tendrilLeftGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
          <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.2" />
        </linearGradient>

        <linearGradient id="tendrilRightGrad" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
          <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#00f0ff" stopOpacity="0.2" />
        </linearGradient>

        <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="packetGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* LEFT 7 TENDRIL PATHS & PARTICLES */}
      {leftAgents.map((ag, i) => {
        const y = Y_COORDS[i] || 120;
        const pathId = `left-tendril-${i}`;
        const isHovered = hoveredAgentKey === ag.name + ag.type;
        const isAnyHovered = Boolean(hoveredAgentKey);
        const opacity = isHovered ? 1 : isAnyHovered ? 0.2 : 0.65;
        const strokeWidth = isHovered ? 2.5 : 1.3;
        const packetColor = getPacketColor(ag.bias, ag.status, ag.type);
        const speedTier = AGENT_SPEED_TIERS[ag.type] || 'MEDIUM';
        const dur = speedTier === 'FAST' ? '2.0s' : speedTier === 'MEDIUM' ? '3.2s' : '4.5s';

        // Path: from pill right anchor (140, y) curving smoothly into Core center (240, 120)
        const d = `M 140 ${y} C 200 ${y + (120 - y) * 0.15}, 220 120, 240 120`;

        return (
          <g key={pathId} className="transition-opacity duration-300">
            {/* Background base path */}
            <path
              id={pathId}
              d={d}
              stroke="url(#tendrilLeftGrad)"
              strokeWidth={strokeWidth}
              fill="none"
              opacity={opacity}
              filter={isHovered ? 'url(#neonGlow)' : undefined}
            />

            {/* Glowing animated line pulse traveling along path */}
            {!isPaused && (
              <path
                d={d}
                stroke={packetColor}
                strokeWidth={isHovered ? 2.8 : 1.6}
                fill="none"
                opacity={isHovered ? 0.95 : 0.6}
                strokeDasharray="14 160"
                filter="url(#neonGlow)"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="174"
                  to="0"
                  dur={dur}
                  repeatCount="indefinite"
                />
              </path>
            )}

            {/* Leading Data Packet Particle */}
            {!isPaused && (
              <circle r={isHovered ? 3.5 : 2.5} fill={packetColor} filter="url(#packetGlow)">
                <animateMotion
                  dur={dur}
                  repeatCount="indefinite"
                  rotate="auto"
                  keyPoints="0;1"
                  keyTimes="0;1"
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        );
      })}

      {/* RIGHT 7 TENDRIL PATHS & PARTICLES */}
      {rightAgents.map((ag, i) => {
        const y = Y_COORDS[i] || 120;
        const pathId = `right-tendril-${i}`;
        const isHovered = hoveredAgentKey === ag.name + ag.type;
        const isAnyHovered = Boolean(hoveredAgentKey);
        const opacity = isHovered ? 1 : isAnyHovered ? 0.2 : 0.65;
        const strokeWidth = isHovered ? 2.5 : 1.3;
        const packetColor = getPacketColor(ag.bias, ag.status, ag.type);
        const speedTier = AGENT_SPEED_TIERS[ag.type] || 'MEDIUM';
        const dur = speedTier === 'FAST' ? '2.0s' : speedTier === 'MEDIUM' ? '3.2s' : '4.5s';

        // Path: from pill left anchor (460, y) curving smoothly into Core right (360, 120)
        // Reverse direction for output or forward from agent to orchestrator
        const d = `M 460 ${y} C 400 ${y + (120 - y) * 0.15}, 380 120, 360 120`;

        return (
          <g key={pathId} className="transition-opacity duration-300">
            {/* Background base path */}
            <path
              id={pathId}
              d={d}
              stroke="url(#tendrilRightGrad)"
              strokeWidth={strokeWidth}
              fill="none"
              opacity={opacity}
              filter={isHovered ? 'url(#neonGlow)' : undefined}
            />

            {/* Glowing animated line pulse traveling along path */}
            {!isPaused && (
              <path
                d={d}
                stroke={packetColor}
                strokeWidth={isHovered ? 2.8 : 1.6}
                fill="none"
                opacity={isHovered ? 0.95 : 0.6}
                strokeDasharray="14 160"
                filter="url(#neonGlow)"
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="174"
                  to="0"
                  dur={dur}
                  repeatCount="indefinite"
                />
              </path>
            )}

            {/* Leading Data Packet Particle */}
            {!isPaused && (
              <circle r={isHovered ? 3.5 : 2.5} fill={packetColor} filter="url(#packetGlow)">
                <animateMotion
                  dur={dur}
                  repeatCount="indefinite"
                  rotate="auto"
                  keyPoints="0;1"
                  keyTimes="0;1"
                >
                  <mpath href={`#${pathId}`} />
                </animateMotion>
              </circle>
            )}
          </g>
        );
      })}

      {/* CROSS-AGENT VIRTUAL ROUTE PULSE (Agent A -> Core -> Agent B) */}
      {activePacketRoute && !isPaused && (
        <circle r="4" fill="#a855f7" filter="url(#packetGlow)">
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
};
