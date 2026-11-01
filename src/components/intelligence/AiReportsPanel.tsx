'use client';

import React, { useState } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export const AiReportsPanel: React.FC = () => {
  const { activeSymbol } = useActiveAsset();
  const [selectedType, setSelectedType] = useState<string>('DAILY_INTELLIGENCE');
  const [isLoading, setIsLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const reportCategories = [
    { id: 'DAILY_INTELLIGENCE', title: 'Daily Market Intelligence', desc: 'Overall session liquidity, macro tone & key directional biases' },
    { id: 'XAUUSD_ANALYSIS', title: 'XAUUSD Institutional Analysis', desc: 'Deep order flow, yield curve correlation & technical setup' },
    { id: 'MULTI_ASSET_SUMMARY', title: 'Multi-Asset Market Summary', desc: 'Cross-market interactions, risk sentiment & lead-lag pairs' },
    { id: 'OPPORTUNITY_SUMMARY', title: 'Opportunity Summary', desc: 'Ranked high-probability setups across the 25 instruments' },
    { id: 'AGENT_CONSENSUS', title: '32-Agent Consensus Report', desc: 'Audit of the 31 upstream voters and independent evidence tally' },
    { id: 'DECISION_EXPLANATION', title: 'Decision Engine V2 Explanation', desc: 'In-depth explanation of active bias, completeness and vetoes' },
    { id: 'SETUP_QUALITY', title: 'Setup Intelligence V3 Quality', desc: 'SMC/ICT validation, entry zones & mandatory 2.0:1 R:R check' },
    { id: 'MARKET_CONFLICTS', title: 'Market Conflict & Discrepancy', desc: 'Evaluation of conflicting signals and risk guardian resolutions' },
    { id: 'RISK_VOLATILITY', title: 'Risk & Volatility Architecture', desc: 'Spread expansion, ATR volatility regimes & drawdown guards' },
  ];

  const handleGenerateReport = async (typeToUse?: string) => {
    const reportType = typeToUse || selectedType;
    setIsLoading(true);

    try {
      const res = await fetch(`/api/intelligence/reports?type=${reportType}&symbol=${activeSymbol}`);
      const data = await res.json();
      if (data.success && data.report) {
        setReportData(data.report);
      }
    } catch {}
    finally {
      setIsLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (!reportData) return;
    const textToCopy = reportData.markdownContent ||
      reportData.sections?.map((s: any) => `${s.heading}\n${s.content}\n`).join('\n') || '';
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#070f1e] rounded-2xl border border-white/10 shadow-2xl p-3 sm:p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold">
            📑
          </div>
          <div>
            <h3 className="text-xs font-black tracking-wider uppercase text-purple-300 font-mono">
              INSTITUTIONAL AI MARKET REPORTS
            </h3>
            <p className="text-[10px] text-gray-400 font-mono">
              9 Specialized Quantitative Intelligence Briefs · Model Grounded
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[10px] font-mono text-gray-400">Target Asset:</span>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
            {activeSymbol}
          </span>
        </div>
      </div>

      {/* Report Categories Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {reportCategories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedType(cat.id);
              handleGenerateReport(cat.id);
            }}
            disabled={isLoading}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer font-mono ${
              selectedType === cat.id
                ? 'bg-purple-950/40 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)] text-white'
                : 'bg-black/30 border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
            }`}
          >
            <div className="text-xs font-bold text-purple-300 mb-1">{cat.title}</div>
            <div className="text-[10px] text-gray-500 leading-tight">{cat.desc}</div>
          </button>
        ))}
      </div>

      {/* Generate / Action Bar */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5 font-mono text-xs">
        <button
          onClick={() => handleGenerateReport()}
          disabled={isLoading}
          className="px-4 py-2 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 hover:border-purple-400 text-purple-300 font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center space-x-2"
        >
          {isLoading ? (
            <>
              <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
              <span>Generating Institutional Brief...</span>
            </>
          ) : (
            <span>Generate Selected Report</span>
          )}
        </button>

        {reportData && (
          <button
            onClick={handleCopyReport}
            className="px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white transition-all text-[11px] cursor-pointer"
          >
            {copied ? '✓ Copied' : 'Copy Full Report'}
          </button>
        )}
      </div>

      {/* Rendered Report Area */}
      {reportData && (
        <div className="mt-4 p-4 rounded-xl bg-black/60 border border-purple-500/20 space-y-3 font-sans text-xs">
          <div className="flex flex-wrap items-center justify-between pb-2 border-b border-white/10 font-mono text-[10px] text-gray-400">
            <div>
              <span className="text-purple-300 font-bold text-xs">{reportData.title}</span> · {reportData.symbol}
            </div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                Freshness: {reportData.freshness}
              </span>
              <span className="text-gray-500">{new Date(reportData.generatedAt).toLocaleTimeString()}</span>
            </div>
          </div>

          {reportData.markdownContent ? (
            <div className="whitespace-pre-wrap leading-relaxed text-gray-200">
              {reportData.markdownContent}
            </div>
          ) : (
            <div className="space-y-3">
              {reportData.sections?.map((sec: any, idx: number) => (
                <div key={idx} className="space-y-1">
                  <h4 className="font-mono font-bold text-purple-300 text-[11px] uppercase tracking-wider">
                    {sec.heading}
                  </h4>
                  <p className="text-gray-300 leading-relaxed pl-2 border-l-2 border-purple-500/30">
                    {sec.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t border-white/5 font-mono text-[9px] text-gray-500 flex flex-wrap justify-between gap-1">
            <span>Model: {reportData.modelUsed}</span>
            <span>Broker: {reportData.telemetryAudit?.broker} · Mode: {reportData.telemetryAudit?.executionMode}</span>
          </div>
        </div>
      )}
    </div>
  );
};

