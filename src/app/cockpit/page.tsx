'use client';

import React, { useState } from 'react';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { LiveTickerStrip } from '@/components/cockpit/LiveTickerStrip';
import { MarketOverviewCard } from '@/components/cockpit/MarketOverviewCard';
import { EconomicEventsCard } from '@/components/cockpit/EconomicEventsCard';
import { MarketSessionLiquidityMap } from '@/components/cockpit/MarketSessionLiquidityMap';
import { CentralIntelligenceHub } from '@/components/cockpit/CentralIntelligenceHub';
import { ConfluenceConflictPanel } from '@/components/cockpit/ConfluenceConflictPanel';
import { MacroCrossAssetPanel } from '@/components/cockpit/MacroCrossAssetPanel';
import { RegimeQuantPanel } from '@/components/cockpit/RegimeQuantPanel';
import { DataSentinelPanel } from '@/components/cockpit/DataSentinelPanel';
import { AgentConsensusBarChart } from '@/components/cockpit/AgentConsensusBarChart';
import { CouncilDebateStream } from '@/components/cockpit/CouncilDebateStream';
import { EvolutionaryTracker } from '@/components/cockpit/EvolutionaryTracker';
import { FullSmartPositionCalculator } from '@/components/cockpit/FullSmartPositionCalculator';
import { CurrentAiDecision } from '@/components/cockpit/CurrentAiDecision';
import { RiskGuardianPolicy } from '@/components/cockpit/RiskGuardianPolicy';
import { ExecutionControlCard } from '@/components/cockpit/ExecutionControlCard';
import { ActiveVisionBlueprintCard } from '@/components/cockpit/ActiveVisionBlueprintCard';
import { AccountPlatformStatusCard } from '@/components/cockpit/AccountPlatformStatusCard';
import { GlobalOpportunityRadar } from '@/components/cockpit/GlobalOpportunityRadar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { AgentIntelligenceCenter } from '@/components/cockpit/AgentIntelligenceCenter';
import { DecisionEngineCockpit } from '@/components/cockpit/DecisionEngineCockpit';
import { SetupIntelligenceCockpit } from '@/components/cockpit/SetupIntelligenceCockpit';
import { TelegramSignalCenter } from '@/components/cockpit/TelegramSignalCenter';
import { AiAssistantPanel } from '@/components/intelligence/AiAssistantPanel';
import { AiReportsPanel } from '@/components/intelligence/AiReportsPanel';

type SecondaryTab =
  | 'confluence'
  | 'agents'
  | 'decision'
  | 'setups'
  | 'telegram'
  | 'assistant'
  | 'reports'
  | 'macro'
  | 'regime'
  | 'sentinel';

export default function CockpitPage() {
  const { activeSymbol, activeAsset } = useActiveAsset();
  const [activeTab, setActiveTab] = useState<SecondaryTab>('confluence');

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Static Premium CORTEX Visual Foundation */}
      <BackgroundLiveChart symbol={activeSymbol} isPositive={activeAsset.change24h >= 0} />

      {/* Main Cockpit Content Layer */}
      <div className="relative z-10 flex flex-col p-2 sm:p-3 space-y-2.5 w-full max-w-[1920px] mx-auto">
        {/* 1. Global Navigation Bar */}
        <MasterTopNav />

        {/* 2. Market Category Filter Bar */}
        <MarketCategoryFilterBar />

        {/* 3. Full-Width Live Asset Ticker Strip */}
        <LiveTickerStrip />

        {/* 4. Top Executive Command Header: 3-Column Flanking & Central Swarm */}
        <section id="cockpit-top-command-header" className="grid grid-cols-1 xl:grid-cols-12 gap-2.5 items-stretch">
          {/* Left (3 cols): Compact Current AI Decision */}
          <div className="xl:col-span-3 min-w-0 flex flex-col">
            <CurrentAiDecision />
          </div>

          {/* Center (6 cols): Tightly-Wired Swarm Hub */}
          <div className="xl:col-span-6 min-w-0 flex flex-col">
            <CentralIntelligenceHub />
          </div>

          {/* Right (3 cols): Compact Market Overview */}
          <div className="xl:col-span-3 min-w-0 flex flex-col">
            <MarketOverviewCard />
          </div>
        </section>

        {/* 6. Master 2-Column Cockpit Workspace (Balanced 6/6 Grid) */}
        <main className="grid grid-cols-1 xl:grid-cols-12 gap-2.5 items-start">
          {/* =========================================================================
              LEFT COLUMN (6 cols on xl): OPPORTUNITY RADAR & UNIVERSE DISCOVERY
             ========================================================================= */}
          <section className="xl:col-span-6 space-y-2.5 flex flex-col">
            {/* Global Opportunity Radar (Ranked Setup, Attention Queue & 26-Asset Table) */}
            <GlobalOpportunityRadar />

            {/* Session Liquidity Map */}
            <MarketSessionLiquidityMap />
          </section>

          {/* =========================================================================
              RIGHT COLUMN (6 cols on xl): POSITION RISK CALCULATOR & EXECUTION
             ========================================================================= */}
          <section className="xl:col-span-6 space-y-2.5 flex flex-col">
            {/* Full Smart Position Size & Risk Calculator (Flanking Global Opportunity Radar) */}
            <FullSmartPositionCalculator />

            {/* Live Inter-Agent Council Debate Stream */}
            <CouncilDebateStream />

            {/* Execution Telemetry & Direct Transport Controls */}
            <ExecutionControlCard />

            {/* CORTEX Intelligence Evolution ("What Changed?" Engine) */}
            <EvolutionaryTracker />
          </section>
        </main>

        {/* =========================================================================
            5. CONSOLIDATED SECONDARY INTELLIGENCE & TELEMETRY DECK (TABBED)
           ========================================================================= */}
        <section id="sentinel-deck" className="bg-[#070f1e] rounded-2xl p-2.5 sm:p-3 space-y-2.5 border border-white/10 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="text-xs font-black tracking-wider uppercase text-cyan-300 font-mono">
                DEEP ANALYTICAL INTELLIGENCE &amp; PLATFORM TELEMETRY
              </h2>
            </div>

            {/* Tab Selector Buttons */}
            <div className="flex flex-wrap items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 font-mono text-[10px]">
              <button
                onClick={() => setActiveTab('confluence')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'confluence'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>⚡</span>
                <span>CONFLUENCE</span>
              </button>

              <button
                onClick={() => setActiveTab('agents')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'agents'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🧠</span>
                <span>32-AGENTS</span>
              </button>

              <button
                onClick={() => setActiveTab('decision')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'decision'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>⚖️</span>
                <span>DECISION V2</span>
              </button>

              <button
                onClick={() => setActiveTab('setups')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'setups'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>📐</span>
                <span>SETUPS V3</span>
              </button>

              <button
                onClick={() => setActiveTab('telegram')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'telegram'
                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.3)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>✈️</span>
                <span>TELEGRAM SIGNALS</span>
              </button>

              <button
                onClick={() => setActiveTab('assistant')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'assistant'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🤖</span>
                <span>AI ASSISTANT</span>
              </button>

              <button
                onClick={() => setActiveTab('reports')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'reports'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>📑</span>
                <span>AI REPORTS</span>
              </button>

              <button
                onClick={() => setActiveTab('macro')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'macro'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🌐</span>
                <span>MACRO</span>
              </button>

              <button
                onClick={() => setActiveTab('regime')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'regime'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>📊</span>
                <span>REGIME</span>
              </button>

              <button
                onClick={() => setActiveTab('sentinel')}
                className={`px-2 py-1 rounded-lg transition-all font-bold flex items-center space-x-1 cursor-pointer ${
                  activeTab === 'sentinel'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span>🛡️</span>
                <span>SENTINEL</span>
              </button>
            </div>
          </div>

          {/* Active Tab Panel Content */}
          <div className="pt-1">
            {activeTab === 'confluence' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-2.5 items-start">
                <div className="xl:col-span-7 space-y-2.5">
                  <ConfluenceConflictPanel />
                </div>
                <div className="xl:col-span-5 space-y-2.5">
                  <AgentConsensusBarChart />
                </div>
              </div>
            )}

            {activeTab === 'agents' && (
              <div className="w-full space-y-2.5">
                <AgentIntelligenceCenter />
              </div>
            )}

            {activeTab === 'decision' && (
              <div className="w-full space-y-2.5">
                <DecisionEngineCockpit />
              </div>
            )}

            {activeTab === 'setups' && (
              <div className="w-full space-y-2.5">
                <SetupIntelligenceCockpit />
              </div>
            )}

            {activeTab === 'telegram' && (
              <div className="w-full space-y-2.5">
                <TelegramSignalCenter />
              </div>
            )}

            {activeTab === 'assistant' && (
              <div className="w-full space-y-2.5">
                <AiAssistantPanel />
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="w-full space-y-2.5">
                <AiReportsPanel />
              </div>
            )}

            {activeTab === 'macro' && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-2.5 items-start">
                <div className="xl:col-span-8 space-y-2.5">
                  <MacroCrossAssetPanel />
                </div>
                <div className="xl:col-span-4 space-y-2.5">
                  <EconomicEventsCard />
                </div>
              </div>
            )}

            {activeTab === 'regime' && (
              <div className="w-full space-y-2.5">
                <RegimeQuantPanel />
              </div>
            )}

            {activeTab === 'sentinel' && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 items-start">
                <div className="space-y-2.5">
                  <DataSentinelPanel />
                </div>
                <div className="space-y-2.5">
                  <AccountPlatformStatusCard />
                </div>
                <div className="space-y-2.5">
                  <RiskGuardianPolicy />
                  <ActiveVisionBlueprintCard />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* 6. Global Footer */}
        <MasterFooter />
      </div>
    </div>
  );
}

