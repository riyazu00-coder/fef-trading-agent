'use client';

import React, { useState, useMemo } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const AgentConsensusBarChart: React.FC = () => {
  const { assetProfile } = useActiveAsset();
  const [viewMode, setViewMode] = useState<'COUNCIL' | 'SPECIALISTS'>('COUNCIL');

  const councilAgents = useMemo(
    () => (assetProfile?.agents || []).filter((a) => a.type !== 'FINAL_DECISION'),
    [assetProfile?.agents]
  );
  const specialistAgents = assetProfile?.specialistAgents || [];

  const councilLabelMap: Record<string, string> = {
    TECHNICAL: 'Tech',
    MACRO: 'Macro',
    CORRELATION: 'Corr',
    NEWS: 'News',
    GEOPOLITICAL: 'Geo',
    SENTIMENT: 'Sent',
    INSTITUTIONAL: 'Instit',
    VISION: 'Vision',
    OPPORTUNITY: 'Opp',
    STRATEGY: 'Strat',
    ORDER_FLOW: 'Flow',
    KILLZONE: 'Zone',
    LIQUIDITY_MAP: 'Liq',
    RISK_GUARDIAN: 'Risk',
  };

  const councilBars = useMemo(() => {
    return councilAgents.map((a) => {
      const isDataLimited = a.status === 'DATA LIMITED' || a.status === 'OFFLINE' || a.status === 'ERROR';
      const pct = isDataLimited ? 0 : Math.round(a.confidence);

      let color = 'from-gray-600 to-gray-700';
      if (!isDataLimited) {
        if (a.bias === 'BULLISH') {
          color = 'from-emerald-400 to-cyan-500';
        } else if (a.bias === 'BEARISH') {
          color = 'from-rose-500 to-pink-500';
        } else if (a.bias === 'CAUTION' || a.bias === 'RESTRICTED') {
          color = 'from-amber-400 to-orange-500';
        } else {
          color = 'from-cyan-500 to-blue-500';
        }
      }

      return {
        id: a.type,
        label: councilLabelMap[a.type] || a.name.slice(0, 4),
        name: a.name,
        domain: a.type.replace('_AGENT', ''),
        pct,
        isDataLimited,
        color,
        status: a.status,
        bias: a.bias,
        trust: a.evidenceTrustScore,
      };
    });
  }, [councilAgents]);

  const specialistBars = useMemo(() => {
    return specialistAgents.map((s) => {
      const isDataLimited = s.readiness === 'DATA_LIMITED' || s.readiness === 'UNAVAILABLE';
      const pct = isDataLimited ? 0 : Math.round(s.confidence);

      let color = 'from-gray-600 to-gray-700';
      if (!isDataLimited) {
        if (s.direction === 'BULLISH') {
          color = 'from-emerald-400 to-teal-500';
        } else if (s.direction === 'BEARISH') {
          color = 'from-rose-500 to-pink-500';
        } else {
          color = 'from-purple-500 to-indigo-500';
        }
      }

      const shortLabel = s.agentId
        .replace('_SPECIALIST', '')
        .replace('_AGENT', '')
        .slice(0, 5);

      return {
        id: s.agentId,
        label: shortLabel,
        name: s.agentName,
        domain: s.domainFamily || 'QUANT',
        pct,
        isDataLimited,
        color,
        status: s.readiness === 'READY' ? 'ONLINE' : s.readiness === 'PARTIAL' ? 'ACTIVE' : 'DATA LIMITED',
        bias: s.direction,
        trust: s.evidenceTrust,
      };
    });
  }, [specialistAgents]);

  const currentBars = viewMode === 'COUNCIL' ? councilBars : specialistBars;

  return (
    <div className="ghost-glass-panel rounded-2xl p-3.5 sm:p-4 font-mono space-y-3 flex flex-col justify-between">
      {/* Header with Segmented View Mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            AGENT CONSENSUS MATRIX
          </h3>
        </div>

        {/* Segmented Selector: Core Council (14) vs Quant Specialists (17) */}
        <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10 text-[8px] font-bold">
          <button
            onClick={() => setViewMode('COUNCIL')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              viewMode === 'COUNCIL'
                ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/50 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            CORE COUNCIL ({councilAgents.length})
          </button>
          <button
            onClick={() => setViewMode('SPECIALISTS')}
            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
              viewMode === 'SPECIALISTS'
                ? 'bg-purple-500/25 text-purple-300 border border-purple-400/50 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            QUANT SPECIALISTS ({specialistAgents.length})
          </button>
        </div>
      </div>

      {/* Vertical Bars Container */}
      <div className="flex items-end justify-between gap-1 h-24 pt-2 px-0.5 overflow-x-auto border-b border-white/5 pb-2">
        {currentBars.map((b) => (
          <div key={b.id} className="flex-1 min-w-[14px] flex flex-col items-center gap-1 h-full justify-end" title={`${b.name}: ${b.status} (${b.bias}) - ${b.pct}%`}>
            {/* Bar */}
            <div className="w-full max-w-[14px] bg-black/40 rounded-t-lg overflow-hidden flex flex-col justify-end h-full">
              <div
                style={{ height: `${Math.max(b.pct > 0 ? b.pct : 4, 4)}%` }}
                className={`w-full rounded-t-md bg-gradient-to-t ${b.color} ${b.pct > 0 ? 'shadow-[0_0_8px_rgba(0,240,255,0.3)]' : 'opacity-40'} transition-all duration-500`}
              />
            </div>
            {/* Percentage */}
            <span className={`text-[6.5px] font-bold ${b.isDataLimited ? 'text-gray-500' : 'text-gray-300'}`}>
              {b.isDataLimited ? '0%' : `${b.pct}%`}
            </span>
            {/* Label */}
            <span className="text-[6px] text-gray-400 uppercase truncate max-w-[20px]">
              {b.label}
            </span>
          </div>
        ))}
      </div>

      {/* Live Agent Stance & Domain Consensus Breakdown Table */}
      <div className="pt-1 space-y-1.5 flex-1 flex flex-col">
        <div className="flex items-center justify-between text-[9px]">
          <span className="text-gray-300 font-bold uppercase tracking-wider flex items-center space-x-1">
            <span>📋</span>
            <span>{viewMode === 'COUNCIL' ? 'COUNCIL DOMAIN STANCE' : 'QUANT SPECIALIST VOTES'}</span>
          </span>
          <span className="text-[7.5px] text-cyan-400 font-mono">
            {viewMode === 'COUNCIL' ? `${councilAgents.length} Council Members` : `${specialistAgents.length} Specialists`} &bull; 1 Final Decision Synthesizer &bull; 100% Grounded
          </span>
        </div>

        <div className="max-h-[300px] overflow-y-auto rounded-xl border border-white/5 bg-black/40 scrollbar-thin">
          <table className="w-full text-left text-[8.5px] border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-black/60 text-gray-400 uppercase text-[7.5px]">
                <th className="py-1.5 px-2 font-bold">Agent / Role</th>
                <th className="py-1.5 px-2 font-bold">Domain</th>
                <th className="py-1.5 px-2 font-bold">Stance</th>
                <th className="py-1.5 px-2 font-bold text-right">Conf</th>
                <th className="py-1.5 px-2 font-bold text-right">Trust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {currentBars.map((ag) => {
                const isBullish = ag.bias === 'BULLISH';
                const isBearish = ag.bias === 'BEARISH';
                const isCaution = ag.bias === 'CAUTION' || ag.bias === 'RESTRICTED';

                return (
                  <tr key={ag.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 font-sans font-bold text-white flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isBullish ? 'bg-emerald-400' :
                        isBearish ? 'bg-rose-400' :
                        isCaution ? 'bg-amber-400' :
                        'bg-gray-400'
                      }`} />
                      <span className="truncate max-w-[120px]" title={ag.name}>{ag.name}</span>
                    </td>
                    <td className="py-1.5 px-2">
                      <span className="text-[7px] text-cyan-300/90 bg-cyan-950/40 px-1 py-0.5 rounded border border-cyan-500/20 uppercase font-mono">
                        {ag.domain}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <span className={`px-1.5 py-0.2 rounded text-[7.5px] font-bold ${
                        isBullish ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40' :
                        isBearish ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40' :
                        isCaution ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40' :
                        'bg-gray-900/60 text-gray-400 border border-white/10'
                      }`}>
                        {ag.isDataLimited ? 'DATA LTD' : ag.bias}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-bold text-white">
                      {ag.isDataLimited ? '0%' : `${ag.pct}%`}
                    </td>
                    <td className="py-1.5 px-2 text-right font-bold text-cyan-300">
                      {ag.trust != null ? `${Math.round(ag.trust)}%` : '--'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
