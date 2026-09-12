'use client';

import React from 'react';
import { SharedMarketContext } from '@/lib/agents/agent-blackboard';

interface AgentConsensusMatrixProps {
  blackboard: SharedMarketContext;
}

export const AgentConsensusMatrix: React.FC<AgentConsensusMatrixProps> = ({ blackboard }) => {
  const agents = Object.entries(blackboard.agentBiases).map(([name, data]) => ({
    name,
    ...data
  }));

  return (
    <div className="bg-[#09111c]/90 border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-col justify-between backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-3">
        <div>
          <span className="text-[9px] font-mono text-cyan-400 uppercase tracking-widest block">
            Multi-Dimensional Convergence
          </span>
          <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide font-mono">
            AGENT CONSENSUS MATRIX
          </h3>
        </div>
        <span className="text-[9px] font-mono bg-[#05070c] text-emerald-400 border border-emerald-900/60 px-2 py-0.5 rounded font-bold">
          CONVERGENCE: {blackboard.consensusScore}%
        </span>
      </div>

      {/* Structured Vector Score Rows */}
      <div className="space-y-2 font-mono text-[10.5px]">
        {agents.map((ag) => {
          const isPositive = ag.score > 0;
          const isRestricted = ag.bias === 'RESTRICTED';

          // Percentage bar length (-1.0 to +1.0 mapped across 0 to 100%)
          const barPercent = Math.min(100, Math.max(5, Math.abs(ag.score) * 100));

          return (
            <div key={ag.name} className="space-y-0.5">
              <div className="flex items-center justify-between text-gray-300">
                <span className="font-semibold text-gray-200">{ag.name} Agent</span>
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-[9px] font-bold ${
                      isRestricted
                        ? 'text-amber-400'
                        : isPositive
                        ? 'text-emerald-400'
                        : 'text-gray-400'
                    }`}
                  >
                    {isRestricted
                      ? 'RESTRICTED'
                      : `${ag.score > 0 ? '+' : ''}${ag.score.toFixed(2)} ${ag.bias}`}
                  </span>
                  <span className="text-gray-500 text-[8.5px]">({ag.confidence}%)</span>
                </div>
              </div>

              {/* Vector Bar */}
              <div className="w-full bg-[#05070c] h-1.5 rounded-full overflow-hidden flex items-center border border-white/[0.03]">
                <div
                  style={{ width: `${barPercent}%` }}
                  className={`h-full rounded-full transition-all ${
                    isRestricted
                      ? 'bg-amber-400'
                      : isPositive
                      ? 'bg-emerald-400'
                      : 'bg-red-400'
                  }`}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Disagreement Warning Box */}
      {blackboard.activeDisagreements.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] text-[9.5px] font-mono space-y-1">
          <div className="text-amber-400 font-bold flex items-center space-x-1.5">
            <span>⚠</span>
            <span>ACTIVE DISAGREEMENT / RISK FLAG:</span>
          </div>
          <ul className="text-gray-400 space-y-0.5 pl-3 list-disc">
            {blackboard.activeDisagreements.map((dis, idx) => (
              <li key={idx}>{dis}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
