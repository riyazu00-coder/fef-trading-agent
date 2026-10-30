'use client';

import React from 'react';
import { AgentState } from '@/lib/agents/agent-types';
import { TradingRiskAssessment } from '@/lib/agents/hub-animation-engine';
import { getAgentReadinessExplanation } from '@/lib/infrastructure/agent-readiness-explainer';

interface HubDetailDrawerProps {
  selectedAgent: AgentState | null;
  riskAssessment: TradingRiskAssessment | null;
  activeSymbol: string;
  onClose: () => void;
}

export const HubDetailDrawer: React.FC<HubDetailDrawerProps> = ({
  selectedAgent,
  riskAssessment,
  activeSymbol,
  onClose,
}) => {
  if (!selectedAgent && !riskAssessment) return null;

  return (
    <div className="absolute inset-0 z-40 bg-[#030816]/95 rounded-2xl p-4 flex flex-col justify-between font-mono text-[10px] border border-cyan-500/40 shadow-[0_0_30px_rgba(0,0,0,0.9)] animate-fadeIn">
      {/* Drawer Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-sans">
            {selectedAgent ? `${selectedAgent.name} Dossier` : 'Trading Risk Assessment & Safeguards'}
          </h3>
          <span className="text-[8px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded font-mono">
            {activeSymbol}
          </span>
        </div>

        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-[9px] cursor-pointer"
        >
          &times; Close
        </button>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto py-2.5 space-y-2.5 pr-1">
        {selectedAgent && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-black/40 p-2.5 rounded-xl border border-white/5">
              <div>
                <span className="text-gray-400 text-[8.5px]">Role:</span>
                <p className="text-white font-bold text-[9px] truncate">{selectedAgent.role}</p>
              </div>
              <div>
                <span className="text-gray-400 text-[8.5px]">Bias / Direction:</span>
                <p className={`font-black text-[9px] ${
                  selectedAgent.bias === 'BULLISH' ? 'text-emerald-400' : selectedAgent.bias === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'
                }`}>
                  {selectedAgent.bias}
                </p>
              </div>
              <div>
                <span className="text-gray-400 text-[8.5px]">Confidence Score:</span>
                <p className="text-cyan-300 font-bold text-[9px]">
                  {selectedAgent.status === 'DATA LIMITED' || selectedAgent.confidence === 0
                    ? `${selectedAgent.confidence}% (DATA LIMITED)`
                    : `${selectedAgent.confidence}%`}
                </p>
              </div>
              <div>
                <span className="text-gray-400 text-[8.5px]">Evidence Trust:</span>
                <p className={`font-bold text-[9px] font-mono ${
                  (selectedAgent.evidenceTrustScore ?? 0) >= 70 ? 'text-emerald-400' : (selectedAgent.evidenceTrustScore ?? 0) >= 30 ? 'text-amber-400' : 'text-rose-400'
                }`}>
                  {selectedAgent.evidenceTrustScore !== undefined ? `${selectedAgent.evidenceTrustScore}%` : 'N/A'}
                </p>
              </div>
              <div>
                <span className="text-gray-400 text-[8.5px]">Provenance:</span>
                <p className="text-cyan-400 font-mono font-bold text-[9px]">
                  {selectedAgent.provenanceBadge || (selectedAgent.status === 'DATA LIMITED' ? 'DATA LIMITED' : 'DERIVED')}
                </p>
              </div>
            </div>

            {/* Honest Data Readiness & Feed Requirement Card */}
            {(() => {
              const explanation = getAgentReadinessExplanation((selectedAgent as any).id || selectedAgent.name, selectedAgent.status);
              return (
                <div className={`p-2.5 rounded-xl border text-[9px] ${
                  explanation.status === 'READY'
                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                    : explanation.status === 'DATA_LIMITED'
                    ? 'bg-amber-950/20 border-amber-500/30 text-amber-200'
                    : 'bg-slate-900/40 border-slate-700/50 text-gray-300'
                }`}>
                  <div className="flex items-center justify-between pb-1 mb-1 border-b border-white/5">
                    <span className="font-bold uppercase tracking-wider text-[8px] flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        explanation.status === 'READY' ? 'bg-emerald-400' : 'bg-amber-400'
                      }`} />
                      <span>DATA READINESS: {explanation.status === 'READY' ? 'READY / ONLINE' : 'DATA LIMITED (EXPECTED)'}</span>
                    </span>
                    <span className="text-[7.5px] px-1.5 py-0.2 rounded bg-black/40 border border-white/10 text-gray-300 font-mono">
                      {explanation.requiredFeed}
                    </span>
                  </div>
                  <p className="text-[8.5px] text-gray-300 font-sans leading-relaxed">
                    {explanation.explanation}
                  </p>
                </div>
              );
            })()}

            {/* Evidence Signals */}
            <div className="bg-black/30 p-2.5 rounded-xl border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="text-[8.5px] font-bold text-gray-400 uppercase">Evidence & Telemetry</h4>
                {selectedAgent.provenanceBadge && (
                  <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded border border-cyan-500/30 bg-cyan-950/40 text-cyan-300">
                    {selectedAgent.provenanceBadge}
                  </span>
                )}
              </div>
              {selectedAgent.evidence && selectedAgent.evidence.length > 0 ? (
                <ul className="space-y-1 text-gray-200 text-[9px]">
                  {selectedAgent.evidence.map((ev, i) => (
                    <li key={i} className="flex items-start space-x-1.5">
                      <span className="text-cyan-400">&bull;</span>
                      <span>{ev}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-400 text-[9px]">Standard multi-factor evidence signals analyzed.</p>
              )}
            </div>

            {/* Invalidation & Key Risk */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-rose-950/20 border border-rose-500/20 p-2 rounded-xl">
                <span className="text-[8px] font-bold text-rose-300 uppercase">Key Counter-Risk</span>
                <p className="text-gray-300 text-[8.5px] mt-0.5">{selectedAgent.keyRisk || 'Event shock / macro shift'}</p>
              </div>
              <div className="bg-amber-950/20 border border-amber-500/20 p-2 rounded-xl">
                <span className="text-[8px] font-bold text-amber-300 uppercase">Setup Invalidation</span>
                <p className="text-gray-300 text-[8.5px] mt-0.5">{selectedAgent.invalidation || 'Break of structural support'}</p>
              </div>
            </div>
          </>
        )}

        {riskAssessment && (
          <>
            <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-[8.5px]">Overall Assessment:</span>
                <span className={`px-2 py-0.5 rounded font-bold uppercase ${riskAssessment.badgeBg}`}>
                  {riskAssessment.level} RISK LEVEL
                </span>
              </div>
              <p className="text-gray-200 text-[9px]">{riskAssessment.summary}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1">
                <span className="text-[8px] font-bold text-gray-400 uppercase">Catalyst Proximity</span>
                <p className="text-white font-bold">{riskAssessment.impactEvent.name}</p>
                {riskAssessment.impactEvent.impact === 'DATA LIMITED' ? (
                  <p className="text-amber-400 text-[8.5px]">Status: DATA LIMITED / UNAVAILABLE</p>
                ) : (
                  <p className="text-cyan-300 text-[8.5px]">Window: {riskAssessment.impactEvent.countdown} ({riskAssessment.impactEvent.impact} Impact)</p>
                )}
              </div>

              <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1">
                <span className="text-[8px] font-bold text-gray-400 uppercase">Volatility & Spread</span>
                <p className="text-white font-bold">{riskAssessment.volatilityDetail}</p>
                <p className="text-amber-300 text-[8.5px]">{riskAssessment.spreadDetail}</p>
              </div>

              <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1">
                <span className="text-[8px] font-bold text-gray-400 uppercase">Swarm Disagreement</span>
                <p className="text-cyan-300 font-bold">{riskAssessment.agentDisagreement} DISPERSION</p>
                <p className="text-gray-300 text-[8.5px]">{riskAssessment.disagreementDetail}</p>
              </div>

              <div className="bg-black/30 p-2 rounded-xl border border-white/5 space-y-1">
                <span className="text-[8px] font-bold text-gray-400 uppercase">Exposure Policy Bounds</span>
                <p className="text-emerald-400 font-bold">{riskAssessment.accountRisk}</p>
                <p className="text-gray-300 text-[8.5px]">{riskAssessment.positionCheck}</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Drawer Footer */}
      <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[8px] text-gray-400">
        <span>Deterministic Multi-Agent Confluence Engine</span>
        <button
          onClick={onClose}
          className="text-cyan-300 hover:text-white transition-colors cursor-pointer font-bold"
        >
          Return to Cockpit Hub &rarr;
        </button>
      </div>
    </div>
  );
};
