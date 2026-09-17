'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { AgentState } from '@/lib/agents/agent-types';
import {
  evaluateTradingRisk,
  getTruthfulLiveMessages,
  TradingRiskAssessment,
  HubLiveMessage
} from '@/lib/agents/hub-animation-engine';
import { HubNetworkSvg } from '@/components/central-hub/HubNetworkSvg';
import { OrchestratorCore } from '@/components/central-hub/OrchestratorCore';
import { AgentNodePill } from '@/components/central-hub/AgentNodePill';
import { HubRiskWarningStrip } from '@/components/central-hub/HubRiskWarningStrip';
import { HubMiniFeed } from '@/components/central-hub/HubMiniFeed';
import { HubDetailDrawer } from '@/components/central-hub/HubDetailDrawer';

export const CentralIntelligenceHub: React.FC = () => {
  const { activeSymbol, activeAsset, assetProfile } = useActiveAsset();

  const [hoveredAgentKey, setHoveredAgentKey] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [showRiskModal, setShowRiskModal] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [isTabHidden, setIsTabHidden] = useState<boolean>(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);

  // Monitor visibility & reduced motion
  useEffect(() => {
    const handleVisibility = () => {
      setIsTabHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mq.matches);
      const handleMotionChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mq.addEventListener('change', handleMotionChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        mq.removeEventListener('change', handleMotionChange);
      };
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Staggered asynchronous elapsed tick timer
  useEffect(() => {
    if (isTabHidden || prefersReducedMotion) return;
    const interval = setInterval(() => {
      setElapsedSec((prev) => +(prev + 0.2).toFixed(1));
    }, 200);
    return () => clearInterval(interval);
  }, [isTabHidden, prefersReducedMotion]);

  // Ensure exactly 15 agents are mapped: 0..6 (Left 7), 7..13 (Right 7), 14 (Center 15th: FINAL_DECISION)
  const leftAgents = useMemo(() => assetProfile.agents.slice(0, 7), [assetProfile.agents]);
  const rightAgents = useMemo(() => assetProfile.agents.slice(7, 14), [assetProfile.agents]);

  // Dynamic Trading Risk Assessment bounded by active asset profile & live telemetry
  const riskAssessment: TradingRiskAssessment = useMemo(() => {
    const spreadVal = activeAsset.spread || 1.2;
    return evaluateTradingRisk(assetProfile, spreadVal, true);
  }, [assetProfile, activeAsset.spread]);

  // Dynamic Live Dialogue Messages (Truthful, non-hallucinatory)
  const liveMessages: HubLiveMessage[] = useMemo(() => {
    return getTruthfulLiveMessages(assetProfile);
  }, [assetProfile]);

  const handleAgentClick = useCallback((agent: AgentState) => {
    setShowRiskModal(false);
    setSelectedAgent(agent);
  }, []);

  const handleOpenRiskModal = useCallback(() => {
    setSelectedAgent(null);
    setShowRiskModal(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedAgent(null);
    setShowRiskModal(false);
  }, []);

  const dataLimitedCount = assetProfile.agents.filter((a) => a.status === 'DATA LIMITED').length;

  return (
    <div className="ghost-glass-panel rounded-2xl p-3 sm:p-4 font-mono space-y-2.5 relative overflow-hidden transition-all">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center shadow-[0_0_10px_rgba(0,240,255,0.4)] flex-shrink-0">
            <svg className="w-4 h-4 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xs sm:text-sm font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
                CENTRAL MULTI-AGENT INTELLIGENCE HUB
              </h2>
              <span className="text-[8px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.2 rounded flex items-center space-x-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE: {activeSymbol}</span>
              </span>
              {assetProfile.sessionState && (
                <span suppressHydrationWarning className={`text-[8px] font-bold px-1.5 py-0.2 rounded flex items-center space-x-1 font-mono border ${
                  assetProfile.tradeExecutable
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${assetProfile.tradeExecutable ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span suppressHydrationWarning>
                    {assetProfile.tradeExecutable ? 'SESSION OPEN' : `${assetProfile.sessionState.statusLabel} (${assetProfile.sessionState.nextOpenCountdown})`}
                  </span>
                </span>
              )}
            </div>
            <p className="text-[9px] text-[#94A3B8] font-sans">
              Canonical 15-Agent Swarm Matrix &bull; Deterministic Multi-Asset Confluence Synthesis
            </p>
          </div>
        </div>

        {/* Confluence & Swarm Indicators */}
        <div className="flex items-center space-x-3 text-[9.5px]">
          <span className="flex items-center space-x-1 text-[#22D3EE]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22D3EE]" />
            <span className="font-sans text-[#CBD5E1]">
              Confluence:{' '}
              {assetProfile.confidence === 0 ? (
                <strong className="text-amber-300 font-mono font-bold">INSUFFICIENT EVIDENCE</strong>
              ) : (
                <strong className="text-[#F8FAFC] font-mono font-bold">{assetProfile.confidence}%</strong>
              )}
            </span>
          </span>
          <span className="flex items-center space-x-1 text-[#34D399] font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
            <span className="font-mono font-bold">
              {15 - dataLimitedCount} / 15 Data Ready
            </span>
          </span>
          {dataLimitedCount > 0 && (
            <span className="text-[8px] bg-amber-950/60 text-amber-300 border border-amber-500/40 px-1.5 py-0.2 rounded">
              {dataLimitedCount} Data Ltd
            </span>
          )}
        </div>
      </div>

      {/* Visual Hub: Center Orb & Left/Right Animated Network */}
      <div className="relative py-1 flex items-center justify-between min-h-[235px]">
        {/* SVG Animated Connector Tendrils */}
        <HubNetworkSvg
          leftAgents={leftAgents}
          rightAgents={rightAgents}
          hoveredAgentKey={hoveredAgentKey}
          activePacketRoute={null}
          isPaused={isTabHidden || prefersReducedMotion}
        />

        {/* Left Column Nodes (Agents 01-07) */}
        <div className="relative z-10 space-y-1.5 w-36 sm:w-44 flex-shrink-0">
          {leftAgents.map((ag, i) => (
            <AgentNodePill
              key={ag.name + ag.type}
              agent={ag}
              index={i}
              side="left"
              elapsedSec={elapsedSec}
              isHovered={hoveredAgentKey === ag.name + ag.type}
              onHover={setHoveredAgentKey}
              onClick={handleAgentClick}
            />
          ))}
        </div>

        {/* Central Core: FEF AI Orchestrator */}
        <OrchestratorCore
          profile={assetProfile}
          activeSymbol={activeSymbol}
        />

        {/* Right Column Nodes (Agents 08-14) */}
        <div className="relative z-10 space-y-1.5 w-36 sm:w-44 flex-shrink-0">
          {rightAgents.map((ag, i) => (
            <AgentNodePill
              key={ag.name + ag.type}
              agent={ag}
              index={i + 7}
              side="right"
              elapsedSec={elapsedSec}
              isHovered={hoveredAgentKey === ag.name + ag.type}
              onHover={setHoveredAgentKey}
              onClick={handleAgentClick}
            />
          ))}
        </div>
      </div>

      {/* 5-Stage Confluence Flow Indicator */}
      <div className="flex items-center justify-between px-3 py-1 rounded-xl bg-black/30 border border-white/5 text-[7.5px] font-mono text-gray-400 overflow-x-auto">
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-cyan-400">01</span>
          <span className="text-gray-300 font-bold">MARKET DATA</span>
          <span className="text-cyan-400 text-[6.5px]">&bull; Ingesting</span>
        </div>
        <span className="text-gray-600">&rarr;</span>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-purple-400">02</span>
          <span className="text-gray-300 font-bold">AGENT ANALYSIS</span>
          <span className="text-purple-400 text-[6.5px]">&bull; Processing</span>
        </div>
        <span className="text-gray-600">&rarr;</span>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-blue-400">03</span>
          <span className="text-gray-300 font-bold">CONFLUENCE</span>
          <span className="text-blue-400 text-[6.5px]">&bull; Synthesizing</span>
        </div>
        <span className="text-gray-600">&rarr;</span>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-amber-400">04</span>
          <span className="text-gray-300 font-bold">RISK VALIDATION</span>
          <span className="text-amber-400 text-[6.5px]">&bull; Bounding</span>
        </div>
        <span className="text-gray-600">&rarr;</span>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-emerald-400">05</span>
          <span className="text-gray-300 font-bold">TRADE BLUEPRINT</span>
          <span className="text-emerald-400 text-[6.5px]">&bull; Finalized</span>
        </div>
      </div>

      {/* Integrated Bottom Row: Live Communication Stream + Trading Risk Warning */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-white/10">
        {/* Pod 1: Mini Live Communication Feed */}
        <HubMiniFeed
          messages={liveMessages}
          activeSymbol={activeSymbol}
        />

        {/* Pod 2: Compact Trading Risk Warning */}
        <HubRiskWarningStrip
          assessment={riskAssessment}
          confluenceScore={assetProfile.confidence}
          onOpenRiskModal={handleOpenRiskModal}
        />
      </div>

      {/* Integrated In-Hub Detail Drawer for Agent Dossiers & Risk Audit */}
      <HubDetailDrawer
        selectedAgent={selectedAgent}
        riskAssessment={showRiskModal ? riskAssessment : null}
        activeSymbol={activeSymbol}
        onClose={handleCloseDrawer}
      />
    </div>
  );
};
