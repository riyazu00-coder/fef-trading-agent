'use client';

import React, { useState } from 'react';
import { SharedMarketContext } from '@/lib/agents/agent-blackboard';

interface CentralIntelligenceCoreProps {
  blackboard: SharedMarketContext;
  activeAgent?: string;
  onSelectAgent?: (agentName: string) => void;
}

export const CentralIntelligenceCore: React.FC<CentralIntelligenceCoreProps> = ({
  blackboard,
  activeAgent,
  onSelectAgent
}) => {
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>('Technical');

  const agentsList = Object.entries(blackboard.agentBiases).map(([name, data]) => ({
    name,
    ...data
  }));

  // Coordinates for the 9 satellite agents around the central FEF ORCHESTRATOR HUB
  // Center is (360, 210), Radius = 150
  const centerX = 360;
  const centerY = 210;
  const radius = 150;

  const agentNodes = agentsList.map((ag, idx) => {
    const angle = (idx * (360 / agentsList.length) - 90) * (Math.PI / 180);
    return {
      ...ag,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  });

  const selectedAgentData = blackboard.agentBiases[selectedAgentKey] || agentsList[0];

  const handleSelect = (name: string) => {
    setSelectedAgentKey(name);
    if (onSelectAgent) onSelectAgent(name);
  };

  return (
    <div className="bg-[#09111c]/90 border border-white/[0.06] rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur-sm">
      {/* Subtle ambient glow behind central core */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/[0.04] rounded-full blur-3xl pointer-events-none"></div>

      {/* Top Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.06] pb-3 mb-4 gap-2">
        <div className="flex items-center space-x-3">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></div>
          <div>
            <h2 className="text-sm sm:text-base font-black text-white tracking-wider uppercase">
              FEF CORTEX INTELLIGENCE CORE
            </h2>
            <div className="text-[10px] text-gray-400 font-mono">
              Autonomous Multi-Agent Orchestration • Shared Memory Matrix • MT5 Confluence
            </div>
          </div>
        </div>

        {/* Real System Telemetry Badges */}
        <div className="flex items-center space-x-2 sm:space-x-3 text-[10px] font-mono">
          <div className="bg-[#05070c] px-2.5 py-1 rounded-lg border border-white/[0.06] text-gray-300">
            <span>CONSENSUS: </span>
            <span className="text-emerald-400 font-bold">{blackboard.consensusScore}% NET BULLISH</span>
          </div>
          <div className="bg-[#05070c] px-2.5 py-1 rounded-lg border border-white/[0.06] text-gray-300">
            <span>ACTIVE COUNCIL: </span>
            <span className="text-cyan-300 font-bold">{agentsList.length} AGENTS</span>
          </div>
          <div className="hidden sm:block bg-[#05070c] px-2.5 py-1 rounded-lg border border-white/[0.06] text-gray-300">
            <span>DISAGREEMENTS: </span>
            <span className="text-amber-400 font-bold">{blackboard.activeDisagreements.length} FLAGGED</span>
          </div>
        </div>
      </div>

      {/* Main Dominant Visualization Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
        {/* Left/Center: Master Interactive Neural Network (8 Cols) */}
        <div className="lg:col-span-8 relative w-full h-[380px] sm:h-[420px] flex items-center justify-center">
          <svg className="w-full h-full" viewBox="0 0 720 420">
            <defs>
              <linearGradient id="coreGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#ffd700" stopOpacity="0.3" />
              </linearGradient>
            </defs>

            {/* Orbit Guides */}
            <circle cx={centerX} cy={centerY} r={radius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={centerX} cy={centerY} r={radius * 0.55} fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />

            {/* Inter-Agent Interconnected Data Web Lines */}
            {agentNodes.map((node, i) => {
              const nextNode = agentNodes[(i + 1) % agentNodes.length];
              const crossNode = agentNodes[(i + 3) % agentNodes.length];
              return (
                <g key={`lines-${i}`}>
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={nextNode.x}
                    y2={nextNode.y}
                    stroke="rgba(255,255,255,0.04)"
                    strokeWidth="1"
                  />
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={crossNode.x}
                    y2={crossNode.y}
                    stroke="rgba(0,240,255,0.03)"
                    strokeWidth="0.8"
                  />
                  {/* Spoke to Central Orchestrator */}
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={centerX}
                    y2={centerY}
                    stroke={
                      selectedAgentKey === node.name
                        ? 'rgba(0,240,255,0.6)'
                        : 'rgba(255,255,255,0.08)'
                    }
                    strokeWidth={selectedAgentKey === node.name ? '2' : '1'}
                  />
                </g>
              );
            })}

            {/* CENTRAL ORCHESTRATOR HUB */}
            <g transform={`translate(${centerX}, ${centerY})`} className="cursor-pointer">
              <circle r="48" fill="#060c17" stroke="rgba(0,240,255,0.4)" strokeWidth="1.5" />
              <circle r="44" fill="#081424" stroke="rgba(251,191,36,0.3)" strokeWidth="1" strokeDasharray="4 2" />
              <text textAnchor="middle" y="-12" fill="#ffd700" fontSize="9" fontWeight="bold" letterSpacing="1.5">
                FEF CORE
              </text>
              <text textAnchor="middle" y="3" fill="#ffffff" fontSize="11" fontWeight="black" letterSpacing="1">
                ORCHESTRATOR
              </text>
              <text textAnchor="middle" y="18" fill="#38bdf8" fontSize="8" fontWeight="bold">
                {blackboard.directionalVerdict}
              </text>
              <text textAnchor="middle" y="29" fill="#94a3b8" fontSize="7" fontFamily="monospace">
                Confluence: {blackboard.consensusScore}%
              </text>
            </g>

            {/* SATELLITE SPECIALIST AGENT NODES */}
            {agentNodes.map((node) => {
              const isSelected = selectedAgentKey === node.name;
              const isBullish = node.bias === 'BULLISH';
              const isRestricted = node.bias === 'RESTRICTED';
              const biasColor = isRestricted
                ? '#f59e0b'
                : isBullish
                ? '#22c55e'
                : node.bias === 'BEARISH'
                ? '#ef4444'
                : '#94a3b8';

              return (
                <g
                  key={node.name}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => handleSelect(node.name)}
                  className="cursor-pointer transition-all duration-200 hover:scale-110"
                >
                  {/* Subtle active glow ring */}
                  {isSelected && (
                    <circle r="30" fill="none" stroke="rgba(0,240,255,0.4)" strokeWidth="1.5">
                      <animate attributeName="r" values="26;34;26" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
                    </circle>
                  )}

                  {/* Main Node Body */}
                  <circle
                    r="22"
                    fill="#050a14"
                    stroke={isSelected ? '#00f0ff' : 'rgba(255,255,255,0.1)'}
                    strokeWidth={isSelected ? '2' : '1'}
                  />

                  {/* Bias indicator pip */}
                  <circle cx="16" cy="-16" r="4" fill={biasColor} stroke="#050a14" strokeWidth="1" />

                  {/* Node Text Label */}
                  <text
                    textAnchor="middle"
                    y="-2"
                    fill="#ffffff"
                    fontSize="8"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {node.name.toUpperCase()}
                  </text>
                  <text
                    textAnchor="middle"
                    y="8"
                    fill={biasColor}
                    fontSize="7"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {node.score > 0 ? `+${node.score}` : node.score}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right: Selected Agent Inspector & Shared Blackboard Status (4 Cols) */}
        <div className="lg:col-span-4 bg-[#05070c]/80 border border-white/[0.06] rounded-xl p-3.5 flex flex-col justify-between h-full space-y-3">
          <div>
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-2">
              <div>
                <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-wider block">
                  Agent Telemetry Inspector
                </span>
                <span className="text-xs sm:text-sm font-bold text-white">{selectedAgentKey} Agent</span>
              </div>
              <span
                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                  selectedAgentData.bias === 'BULLISH'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                    : selectedAgentData.bias === 'RESTRICTED' || selectedAgentData.bias === 'CAUTION'
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                    : selectedAgentData.bias === 'BEARISH'
                    ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                    : 'bg-gray-900 text-gray-300 border border-gray-800'
                }`}
              >
                {selectedAgentData.bias} ({selectedAgentData.confidence}%)
              </span>
            </div>

            <div className="text-[11px] text-gray-300 mb-3 leading-relaxed italic border-l-2 border-cyan-500/50 pl-2">
              "{selectedAgentData.lastObservation}"
            </div>

            {/* Evidence Checklist */}
            <div className="space-y-1 text-[10px]">
              <span className="text-gray-400 font-mono font-semibold block">Validated Observable Evidence:</span>
              <ul className="space-y-1">
                {selectedAgentData.evidence.map((ev, i) => (
                  <li key={i} className="text-gray-300 flex items-start space-x-1.5">
                    <span className="text-cyan-400 font-bold">✓</span>
                    <span>{ev}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Bottom Blackboard Snapshot */}
          <div className="bg-[#09111c] p-2.5 rounded-lg border border-white/[0.04] text-[9px] font-mono text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>SHARED REGIME:</span>
              <span className="text-cyan-300 font-bold">{blackboard.marketRegime}</span>
            </div>
            <div className="flex justify-between">
              <span>DXY BIAS:</span>
              <span className="text-emerald-400 font-bold">
                {blackboard.dxyState.trend}
                {blackboard.dxyState.divergenceToGold && blackboard.dxyState.divergenceToGold !== 'NORMAL' ? ` (${blackboard.dxyState.divergenceToGold})` : ''}
              </span>
            </div>
            <div className="flex justify-between">
              <span>EVENT RISK:</span>
              <span className="text-amber-400 font-bold">{blackboard.eventRisk.countdown}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
