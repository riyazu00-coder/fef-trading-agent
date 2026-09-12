'use client';

import React from 'react';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { LiveTickerStrip } from '@/components/cockpit/LiveTickerStrip';
import { MarketOverviewCard } from '@/components/cockpit/MarketOverviewCard';
import { EconomicEventsCard } from '@/components/cockpit/EconomicEventsCard';
import { VulnerabilityAuditCard } from '@/components/cockpit/VulnerabilityAuditCard';
import { MarketSessionLiquidityMap } from '@/components/cockpit/MarketSessionLiquidityMap';
import { CentralIntelligenceHub } from '@/components/cockpit/CentralIntelligenceHub';
import { AgentConsensusBarChart } from '@/components/cockpit/AgentConsensusBarChart';
import { CouncilDebateStream } from '@/components/cockpit/CouncilDebateStream';
import { EvolutionaryTracker } from '@/components/cockpit/EvolutionaryTracker';
import { FullSmartPositionCalculator } from '@/components/cockpit/FullSmartPositionCalculator';
import { CurrentAiDecision } from '@/components/cockpit/CurrentAiDecision';
import { RiskGuardianPolicy } from '@/components/cockpit/RiskGuardianPolicy';
import { ExecutionControlCard } from '@/components/cockpit/ExecutionControlCard';
import { ChartVisionAnalyzerCard } from '@/components/cockpit/ChartVisionAnalyzerCard';
import { ProviderTelemetryCard } from '@/components/cockpit/ProviderTelemetryCard';
import { AccountPlatformStatusCard } from '@/components/cockpit/AccountPlatformStatusCard';
import { GlobalOpportunityRadar } from '@/components/cockpit/GlobalOpportunityRadar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { useActiveAsset } from '@/context/ActiveAssetContext';

export default function CockpitPage() {
  const { activeSymbol, activeAsset } = useActiveAsset();

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Background Aurora Borealis Motion */}
      <BackgroundLiveChart symbol={activeSymbol} isPositive={activeAsset.change24h >= 0} />

      {/* Main Cockpit Content Layer */}
      <div className="relative z-10 flex flex-col p-2 sm:p-3 space-y-2.5 w-full max-w-[1920px] mx-auto">
        {/* 1. Global Navigation Bar */}
        <MasterTopNav />

        {/* 2. Live Asset Ticker Strip */}
        <LiveTickerStrip />

        {/* 3. Master 3-Column Cockpit Grid (Independent Column Flow) */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start">
          {/* LEFT COLUMN (3 cols on lg) */}
          <section className="lg:col-span-3 space-y-2.5 flex flex-col">
            <MarketOverviewCard />
            <EconomicEventsCard />
            <VulnerabilityAuditCard />
            <MarketSessionLiquidityMap />
          </section>

          {/* CENTER COLUMN (6 cols on lg) */}
          <section className="lg:col-span-6 space-y-2.5 flex flex-col">
            {/* Central Multi-Agent Intelligence Hub */}
            <CentralIntelligenceHub />

            {/* Sub-row: Agent Consensus Matrix & Council Debate Stream */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <AgentConsensusBarChart />
              <CouncilDebateStream />
            </div>

            {/* Evolutionary Tracker ("What Changed?" Engine) */}
            <EvolutionaryTracker />

            {/* Full Smart Position Size & Risk Calculator */}
            <FullSmartPositionCalculator />

            {/* Global Multi-Asset Opportunity Radar */}
            <GlobalOpportunityRadar />
          </section>

          {/* RIGHT COLUMN (3 cols on lg) */}
          <section className="lg:col-span-3 space-y-2.5 flex flex-col">
            <CurrentAiDecision />
            <RiskGuardianPolicy />
            <ExecutionControlCard />
            <ChartVisionAnalyzerCard />
            <ProviderTelemetryCard />
            <AccountPlatformStatusCard />
          </section>
        </main>

        {/* 4. Global Footer */}
        <MasterFooter />
      </div>
    </div>
  );
}
