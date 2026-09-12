'use client';

import React, { useState, useEffect } from 'react';
import {
  INITIAL_AGENT_VECTORS,
  computeCollectiveConvergence,
  CollectiveCalculationResult,
  AgentMathVector
} from '@/lib/agents/collective-calculation';

export const CollectiveCalculationPanel: React.FC = () => {
  const [vectors, setVectors] = useState<AgentMathVector[]>(INITIAL_AGENT_VECTORS);
  const [calculationResult, setCalculationResult] = useState<CollectiveCalculationResult>(
    computeCollectiveConvergence(INITIAL_AGENT_VECTORS)
  );
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const [activeAgentIndex, setActiveAgentIndex] = useState<number>(0);

  // Autonomous continuous collective calculation loop
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveAgentIndex((prev) => (prev + 1) % vectors.length);

      // Micro-fluctuate one agent's calculation slightly to show live computing
      setVectors((currentVectors) => {
        const targetIdx = Math.floor(Math.random() * currentVectors.length);
        const updated = [...currentVectors];
        const v = updated[targetIdx];

        if (v.agentName !== 'Risk Guardian Agent') {
          const delta = (Math.random() - 0.5) * 0.02;
          const newVec = Math.min(0.99, Math.max(0.1, Number((v.vector + delta).toFixed(3))));
          updated[targetIdx] = {
            ...v,
            vector: newVec,
            status: 'CONVERGED'
          };
        }

        const freshResult = computeCollectiveConvergence(updated);
        setCalculationResult(freshResult);
        return updated;
      });
    }, 3200);

    return () => clearInterval(interval);
  }, [vectors.length]);

  const triggerManualRecalculation = () => {
    setIsComputing(true);
    setTimeout(() => {
      const fresh = computeCollectiveConvergence(vectors);
      setCalculationResult(fresh);
      setIsComputing(false);
    }, 600);
  };

  return (
    <div className="bg-[#02050e]/95 border-2 border-cyan-500/70 rounded-2xl p-4 shadow-[0_0_35px_rgba(0,240,255,0.18)] flex flex-col space-y-3 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-cyan-900/60 pb-2">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
          <div>
            <div className="text-[9px] text-cyan-400 uppercase tracking-widest">
              COLLECTIVE TENSOR COMPUTATION MATRIX
            </div>
            <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider flex items-center space-x-1.5">
              <span>⚡ ALL AGENTS CALCULATING TOGETHER IN REAL TIME</span>
            </h3>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-700 px-2 py-0.5 rounded">
            CYCLES: {calculationResult.convergenceCycles}
          </span>
          <button
            onClick={triggerManualRecalculation}
            className="text-[9px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold px-2.5 py-1 rounded transition-all shadow-md"
          >
            {isComputing ? 'Computing...' : 'Recalculate Convergence'}
          </button>
        </div>
      </div>

      {/* Real-time Math Equation Banner */}
      <div className="bg-[#040a17] border border-cyan-900/80 rounded-xl p-2.5 text-[10px] flex flex-wrap items-center justify-between gap-2 shadow-inner">
        <div className="flex items-center space-x-2">
          <span className="text-amber-400 font-bold">SYNTHESIS TENSOR:</span>
          <span className="text-gray-300 font-semibold">
            C_final = [ ∑(Vector_i × Weight_i) / ∑Weight_i ] × RiskDiscountFactor
          </span>
        </div>
        <div className="flex items-center space-x-3 text-cyan-300">
          <span>TENSOR SUM: <span className="font-bold text-white">+{calculationResult.rawTensorSum}</span></span>
          <span>RISK DISCOUNT: <span className="font-bold text-amber-400">x{calculationResult.riskDiscountFactor}</span></span>
          <span>NET CONVERGENCE: <span className="font-bold text-emerald-400 text-xs">{calculationResult.normalizedConfluence}%</span></span>
        </div>
      </div>

      {/* Grid of Agent Vectors calculating simultaneously */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {vectors.map((vec, i) => {
          const isActivelyComputing = activeAgentIndex === i;
          const isBullish = vec.vector > 0.2;
          const isRisk = vec.agentName.includes('Risk');

          return (
            <div
              key={i}
              className={`p-2.5 rounded-xl border transition-all text-[9.5px] ${
                isActivelyComputing
                  ? 'bg-[#0a162b] border-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                  : 'bg-[#030914] border-gray-800 hover:border-cyan-800'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white text-[10px] truncate">{vec.agentName}</span>
                <span
                  className={`text-[8px] font-bold px-1 rounded ${
                    isRisk
                      ? 'text-amber-400 bg-amber-950/80'
                      : isBullish
                      ? 'text-emerald-400 bg-emerald-950/80'
                      : 'text-red-400 bg-red-950/80'
                  }`}
                >
                  {isRisk ? 'DISCOUNT' : isBullish ? 'BULLISH' : 'BEARISH'}
                </span>
              </div>

              <div className="text-[8px] text-gray-500 mb-1">{vec.category}</div>

              <div className="bg-[#02050c] p-1.5 rounded border border-gray-900 mb-1 font-mono text-[8.5px] text-cyan-300 truncate">
                {vec.equation}
              </div>

              <div className="flex justify-between items-center text-[9px] pt-0.5 border-t border-gray-900">
                <span className="text-gray-400">VECTOR:</span>
                <span className="font-black text-white font-mono">
                  {vec.vector > 0 ? `+${vec.vector}` : vec.vector}
                </span>
                <span className="text-gray-500 text-[8px]">Wt: {(vec.weight * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Convergence Result Bar directly bringing the verdict */}
      <div className="bg-[#051322] border-2 border-cyan-400/80 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-950 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 text-lg font-black shadow-lg">
            ▲
          </div>
          <div>
            <div className="text-[9px] text-gray-400 font-bold uppercase">
              COLLECTIVE MATHEMATICAL VERDICT
            </div>
            <div className="text-base font-black text-emerald-400 tracking-wider">
              {calculationResult.verdict} ({calculationResult.normalizedConfluence}% CONFIDENCE)
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <div className="bg-[#02050c] px-2.5 py-1 rounded border border-gray-800">
            <span className="text-gray-400 mr-1.5">ENTRY ZONE:</span>
            <span className="text-cyan-300 font-black font-mono">
              ${calculationResult.entryZone[0].toFixed(2)} - ${calculationResult.entryZone[1].toFixed(2)}
            </span>
          </div>

          <div className="bg-[#02050c] px-2.5 py-1 rounded border border-gray-800">
            <span className="text-gray-400 mr-1.5">STOP LOSS:</span>
            <span className="text-red-400 font-black font-mono">
              ${calculationResult.stopLoss.toFixed(2)}
            </span>
          </div>

          <div className="bg-[#02050c] px-2.5 py-1 rounded border border-gray-800">
            <span className="text-gray-400 mr-1.5">TARGETS:</span>
            <span className="text-emerald-400 font-bold font-mono">
              TP1 ${calculationResult.tp1} | TP2 ${calculationResult.tp2}
            </span>
          </div>

          <div className="bg-amber-950/80 text-amber-300 border border-amber-800 px-2.5 py-1 rounded font-bold text-[9px]">
            HUMAN OPERATOR APPROVAL REQUIRED
          </div>
        </div>
      </div>
    </div>
  );
};
