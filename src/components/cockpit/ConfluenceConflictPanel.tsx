'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const ConfluenceConflictPanel: React.FC = () => {
  const { activeSymbol, assetProfile } = useActiveAsset();
  const confluence = assetProfile.confluence;

  if (!confluence) {
    return (
      <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-2 text-center">
        <p className="text-xs font-bold text-amber-300 uppercase">Cortex Confluence Initializing...</p>
        <p className="text-[10px] text-gray-400">Evaluating multi-agent domain consensus and conflict constraints.</p>
      </div>
    );
  }

  const isBuy = confluence.presentationPosture === 'WATCH FOR BUY';
  const isSell = confluence.presentationPosture === 'WATCH FOR SELL';
  const isWait = confluence.presentationPosture === 'WAIT';

  return (
    <div className="ghost-glass-panel rounded-2xl p-3 sm:p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            CORTEX CONFLUENCE & CONFLICT ENGINE ({activeSymbol})
          </h3>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[8px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-bold uppercase font-mono">
            DOMAIN DEDUPLICATION ACTIVE
          </span>
          <span className="text-[8px] bg-purple-950/60 text-purple-300 border border-purple-500/40 px-1.5 py-0.5 rounded font-bold uppercase font-mono">
            NON-MAJORITY WEIGHTED
          </span>
        </div>
      </div>

      {/* Primary Verdict & High-Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
        {/* Presentation Posture */}
        <div className="md:col-span-1 bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between space-y-1">
          <span className="text-[9px] text-gray-400 uppercase font-bold">Presentation Posture</span>
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${
              isBuy ? 'bg-emerald-400 animate-pulse' :
              isSell ? 'bg-rose-400 animate-pulse' :
              'bg-amber-400'
            }`} />
            <span className={`text-base font-black tracking-tight ${
              isBuy ? 'text-emerald-400' :
              isSell ? 'text-rose-400' :
              'text-amber-400'
            }`}>
              {confluence.presentationPosture}
            </span>
          </div>
          <span className="text-[8px] text-gray-500 leading-tight">
            Analysis Only • Non-Executable
          </span>
        </div>

        {/* Directional Thesis & Agreement */}
        <div className="md:col-span-1 bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between space-y-1">
          <span className="text-[9px] text-gray-400 uppercase font-bold">Directional Thesis</span>
          <div className="text-sm font-bold text-white">
            {confluence.directionalThesis}
          </div>
          <div className="flex items-center justify-between text-[8px] text-gray-400">
            <span>Agreement: {confluence.agreementScore}%</span>
            <span>Conflict: {confluence.conflictScore}%</span>
          </div>
        </div>

        {/* Evidence Trust & Readiness */}
        <div className="md:col-span-1 bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between space-y-1">
          <span className="text-[9px] text-gray-400 uppercase font-bold">Evidence Trust & Readiness</span>
          <div className="text-sm font-bold text-cyan-300">
            Trust: {confluence.evidenceTrust}%
          </div>
          <div className="flex items-center justify-between text-[8px] text-gray-400">
            <span>Readiness: {confluence.dataReadiness}</span>
            <span>Risk State: {confluence.riskState}</span>
          </div>
        </div>

        {/* Coverage & Domain Count */}
        <div className="md:col-span-1 bg-black/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between space-y-1">
          <span className="text-[9px] text-gray-400 uppercase font-bold">Domain Families</span>
          <div className="text-sm font-bold text-purple-300">
            Coverage: {confluence.coverageScore}%
          </div>
          <div className="flex items-center justify-between text-[8px] text-gray-400">
            <span>Support: {confluence.supportingDomains.length}</span>
            <span>Oppose: {confluence.opposingDomains.length}</span>
          </div>
        </div>
      </div>

      {/* Summary Reasoning */}
      <div className="bg-black/30 border border-white/5 rounded-xl p-2.5 text-xs text-gray-300 space-y-1">
        <div className="flex items-center justify-between text-[9px] text-gray-400 uppercase font-bold">
          <span>Confluence Synthesis Thesis</span>
          <span className="text-cyan-400 font-mono">Deduplicated Domain Authority</span>
        </div>
        <p className="leading-snug text-[10.5px]">
          {confluence.summaryReasoning}
        </p>
      </div>

      {/* Evidence Breakdown: Supporting vs Opposing vs Neutral vs Missing */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
        {/* Supporting Evidence */}
        <div className="bg-black/40 border border-emerald-500/20 rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] font-bold text-emerald-400 uppercase">
            <span>Supporting Independent Evidence ({confluence.supportingAgents.length})</span>
            <span>Domains: {confluence.supportingDomains.join(', ') || 'None'}</span>
          </div>
          {confluence.supportingAgents.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {confluence.supportingAgents.map((ag, i) => (
                <span key={i} className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded font-mono">
                  {ag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[9.5px] text-gray-500">No eligible independent bullish evidence.</p>
          )}
        </div>

        {/* Opposing Evidence & Conflicts */}
        <div className="bg-black/40 border border-rose-500/20 rounded-xl p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] font-bold text-rose-400 uppercase">
            <span>Opposing Evidence & Conflicts ({confluence.opposingAgents.length})</span>
            <span>Domains: {confluence.opposingDomains.join(', ') || 'None'}</span>
          </div>
          {confluence.opposingAgents.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {confluence.opposingAgents.map((ag, i) => (
                <span key={i} className="bg-rose-950/60 border border-rose-500/30 text-rose-300 text-[9px] px-1.5 py-0.5 rounded font-mono">
                  {ag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[9.5px] text-gray-500">Zero active opposing directional conflicts.</p>
          )}
        </div>
      </div>

      {/* Critical Conflicts or Missing Telemetry */}
      {(confluence.criticalConflicts.length > 0 || confluence.missingEvidence.length > 0) && (
        <div className="bg-black/40 border border-amber-500/30 rounded-xl p-2.5 space-y-1 text-xs">
          <div className="text-[9px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
            <span>Critical Constraints & Missing Telemetry</span>
            <span className="text-[8px] text-gray-400">Fail-Closed Verification Active</span>
          </div>
          <ul className="space-y-0.5 text-[9.5px] text-gray-300">
            {confluence.criticalConflicts.map((c, i) => (
              <li key={`conf-${i}`} className="flex items-center space-x-1.5 text-rose-300">
                <span>⚠</span>
                <span>{c}</span>
              </li>
            ))}
            {confluence.missingEvidence.map((m, i) => (
              <li key={`miss-${i}`} className="flex items-center space-x-1.5 text-amber-300">
                <span>•</span>
                <span>Missing: {m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

