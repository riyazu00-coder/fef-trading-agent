'use client';

import React, { useState } from 'react';
import { AgentState } from '@/lib/agents/agent-types';

interface AgentSwarmNetworkProps {
  agents: AgentState[];
  activeDebater?: string;
  onSelectAgent?: (agent: AgentState) => void;
}

export const AgentSwarmNetwork: React.FC<AgentSwarmNetworkProps> = ({
  agents,
  activeDebater,
  onSelectAgent
}) => {
  const [selectedAgent, setSelectedAgent] = useState<AgentState>(agents[0]);

  // Coordinates for the 9 agent satellite nodes around central hub (Radius: 130px, Center: 200, 190)
  const centerX = 210;
  const centerY = 190;
  const radius = 135;

  const nodePositions = agents.map((agent, index) => {
    const angle = (index * (360 / agents.length) - 90) * (Math.PI / 180);
    return {
      agent,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  });

  const handleSelect = (agent: AgentState) => {
    setSelectedAgent(agent);
    if (onSelectAgent) onSelectAgent(agent);
  };

  return (
    <div className="bg-[#0b101d] border border-cyan-950/70 rounded-xl p-4 shadow-2xl relative overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
          <h3 className="text-xs uppercase tracking-widest text-cyan-400 font-bold">
            Autonomous Multi-Agent Neural Swarm
          </h3>
        </div>
        <div className="flex items-center space-x-2 text-[10px] text-gray-400">
          <span className="bg-cyan-950/80 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
            9 Specialized Agents Active
          </span>
          <span className="bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800">
            Consensus: 81%
          </span>
        </div>
      </div>

      {/* SVG Network Canvas */}
      <div className="relative w-full h-[380px] flex items-center justify-center">
        <svg className="w-full h-full" viewBox="0 0 420 380">
          <defs>
            {/* Gradient for neural connections */}
            <linearGradient id="neuralGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ffd700" stopOpacity="0.4" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background concentric orbits */}
          <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke="#172554" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={centerX} cy={centerY} r={radius * 0.65} fill="none" stroke="#0e1e38" strokeWidth="1" />

          {/* Inter-Agent cross communication lines */}
          {nodePositions.map((node, i) => {
            const nextNode = nodePositions[(i + 1) % nodePositions.length];
            const crossNode = nodePositions[(i + 4) % nodePositions.length];
            return (
              <g key={`cross-${i}`}>
                <line
                  x1={node.x}
                  y1={node.y}
                  x2={nextNode.x}
                  y2={nextNode.y}
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <line
                  x1={node.x}
                  y1={node.y}
                  x2={crossNode.x}
                  y2={crossNode.y}
                  stroke="#111c30"
                  strokeWidth="0.8"
                />
              </g>
            );
          })}

          {/* Spokes to central hub with animated pulses */}
          {nodePositions.map((node, i) => {
            const isDebating = activeDebater === node.agent.type;
            return (
              <g key={`spoke-${i}`}>
                <line
                  x1={node.x}
                  y1={node.y}
                  x2={centerX}
                  y2={centerY}
                  stroke={isDebating ? '#00ffff' : '#1e3a8a'}
                  strokeWidth={isDebating ? '2' : '1'}
                  opacity={isDebating ? 1 : 0.6}
                  filter={isDebating ? 'url(#glow)' : undefined}
                />
                {isDebating && (
                  <circle cx={(node.x + centerX) / 2} cy={(node.y + centerY) / 2} r="3" fill="#00f0ff">
                    <animate attributeName="r" values="2;5;2" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* CENTRAL DECISION HUB */}
          <g transform={`translate(${centerX}, ${centerY})`} className="cursor-pointer">
            <circle r="44" fill="#050b14" stroke="#ffd700" strokeWidth="2" filter="url(#glow)" />
            <circle r="40" fill="#091322" stroke="#38bdf8" strokeWidth="1" strokeDasharray="4 2" />
            <text textAnchor="middle" y="-12" fill="#ffd700" fontSize="9" fontWeight="bold" letterSpacing="1">
              CENTRAL AI
            </text>
            <text textAnchor="middle" y="2" fill="#ffffff" fontSize="10" fontWeight="extrabold">
              DECISION HUB
            </text>
            <text textAnchor="middle" y="16" fill="#4ade80" fontSize="8" fontWeight="bold">
              BUY SETUP
            </text>
            <text textAnchor="middle" y="27" fill="#94a3b8" fontSize="7">
              81% Confluence
            </text>
          </g>

          {/* SATELLITE AGENT NODES */}
          {nodePositions.map((item) => {
            const isSelected = selectedAgent.type === item.agent.type;
            const isDebating = activeDebater === item.agent.type;
            const biasColor =
              item.agent.bias === 'BULLISH'
                ? '#22c55e'
                : item.agent.bias === 'BEARISH'
                ? '#ef4444'
                : item.agent.bias === 'CAUTION'
                ? '#f59e0b'
                : '#94a3b8';

            return (
              <g
                key={item.agent.type}
                transform={`translate(${item.x}, ${item.y})`}
                onClick={() => handleSelect(item.agent)}
                className="cursor-pointer transition-transform duration-200 hover:scale-110"
              >
                {/* Ping animation when active debater */}
                {isDebating && (
                  <circle r="26" fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0.8">
                    <animate attributeName="r" values="20;32;20" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}

                {/* Node circle */}
                <circle
                  r="20"
                  fill="#070e1b"
                  stroke={isSelected ? '#00ffff' : biasColor}
                  strokeWidth={isSelected ? '2.5' : '1.5'}
                />

                {/* Status indicator dot */}
                <circle cx="14" cy="-14" r="4" fill={biasColor} stroke="#070e1b" strokeWidth="1" />

                {/* Node label */}
                <text
                  textAnchor="middle"
                  y="-2"
                  fill="#ffffff"
                  fontSize="7.5"
                  fontWeight="bold"
                >
                  {item.agent.name.replace(' Agent', '').toUpperCase()}
                </text>
                <text
                  textAnchor="middle"
                  y="8"
                  fill={biasColor}
                  fontSize="6.5"
                  fontWeight="semibold"
                >
                  {item.agent.confidence}%
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Quick Agent Legend */}
        <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm border border-gray-800 rounded px-2 py-1 text-[9px] text-gray-400 flex items-center space-x-3">
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Bullish</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <span>Caution</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
            <span>Bearish</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>Debating</span>
          </span>
        </div>
      </div>

      {/* Selected Agent Detailed View Card */}
      {selectedAgent && (
        <div className="mt-2 bg-[#060a12] border border-cyan-900/50 rounded-lg p-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-1.5">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-xs text-gold">{selectedAgent.name}</span>
              <span className="text-[10px] text-gray-400">({selectedAgent.role})</span>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  selectedAgent.bias === 'BULLISH'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : selectedAgent.bias === 'CAUTION'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'bg-red-950 text-red-400 border border-red-800'
                }`}
              >
                {selectedAgent.bias} ({selectedAgent.confidence}%)
              </span>
            </div>
          </div>
          <p className="text-[11px] text-gray-200 mb-2 leading-relaxed italic">
            "{selectedAgent.lastOpinion}"
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
            <div className="bg-gray-900/70 p-2 rounded border border-gray-800">
              <span className="text-cyan-400 font-semibold block mb-0.5">Key Observable Evidence:</span>
              <ul className="list-disc list-inside text-gray-300 space-y-0.5">
                {selectedAgent.evidence.map((ev, i) => (
                  <li key={i}>{ev}</li>
                ))}
              </ul>
            </div>
            <div className="bg-gray-900/70 p-2 rounded border border-gray-800 flex flex-col justify-between">
              <div>
                <span className="text-amber-400 font-semibold block mb-0.5">Primary Risk Factor:</span>
                <p className="text-gray-300">{selectedAgent.keyRisk}</p>
              </div>
              <div className="mt-1 pt-1 border-t border-gray-800">
                <span className="text-red-400 font-semibold block">Invalidation Condition:</span>
                <p className="text-gray-400">{selectedAgent.invalidation}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
