'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import {
  generateGlobalRadarIntelligence,
  RadarOpportunityItem,
  RadarOpportunityState,
  RadarCategory,
  RadarTimeframeType
} from '@/lib/radar/opportunity-radar-engine';
import { evaluateRadarTransitions } from '@/lib/radar/radar-notifications';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';
import { ExecutabilityBadge } from '@/components/common/ExecutabilityBadge';

type StateFilterType = 'ALL' | 'BUY' | 'SELL' | 'WATCH' | 'HIGH_SCORE' | 'BEST_RR' | 'LOW_RISK';
type CategoryFilterType = 'ALL' | 'METALS' | 'FOREX' | 'INDICES' | 'COMMODITIES' | 'COMMODITY' | 'CRYPTO';
type StyleFilterType = 'ALL' | 'SCALPING' | 'INTRADAY' | 'SWING';
type SubTabType = 'RADAR_TABLE' | 'DEVELOPING' | 'INVALIDATED' | 'REGIME_MAP';
type AvailabilityFilterType = 'ALL' | 'TRADEABLE_NOW' | 'DEVELOPING' | 'MARKET_CLOSED';

export const GlobalOpportunityRadar: React.FC = () => {
  const { activeSymbol, setActiveSymbol, allAssets, timeframe } = useActiveAsset();

  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilterType>('ALL');
  const [stateFilter, setStateFilter] = useState<StateFilterType>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterType>('ALL');
  const [styleFilter, setStyleFilter] = useState<StyleFilterType>('ALL');
  const [subTab, setSubTab] = useState<SubTabType>('RADAR_TABLE');
  const [lastScanTime, setLastScanTime] = useState<string>('Live');

  // Generate continuous multi-asset radar intelligence from live assets
  const radarData = useMemo(() => {
    return generateGlobalRadarIntelligence(allAssets, timeframe);
  }, [allAssets, timeframe]);

  // Evaluate state transitions & deduplicated notifications
  useEffect(() => {
    if (radarData.rankedOpportunities.length > 0) {
      evaluateRadarTransitions(radarData.rankedOpportunities);
      setLastScanTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, [radarData]);

  const topOpp = radarData.topOpportunity;

  // Filter ranked opportunities
  const filteredOpportunities = useMemo(() => {
    return radarData.rankedOpportunities.filter((item) => {
      // Availability / Session Gating filter
      if (availabilityFilter === 'TRADEABLE_NOW' && !item.tradeExecutable) {
        return false;
      }
      if (availabilityFilter === 'MARKET_CLOSED' && item.tradeExecutable) {
        return false;
      }
      if (availabilityFilter === 'DEVELOPING') {
        const isDev = item.state.includes('WATCH') || item.state.includes('PRE-OPEN') || (!item.tradeExecutable && item.opportunityScore >= 70);
        if (!isDev) return false;
      }

      // Category filter
      if (categoryFilter !== 'ALL') {
        const normFilter = categoryFilter === 'COMMODITY' ? 'COMMODITIES' : categoryFilter;
        const normItem = item.category === 'COMMODITY' ? 'COMMODITIES' : item.category;
        if (normFilter !== normItem) {
          return false;
        }
      }
      // Style / timeframe filter
      if (styleFilter !== 'ALL' && item.timeframe !== styleFilter) {
        return false;
      }
      // State filter
      if (stateFilter === 'BUY') {
        return item.state.includes('BUY');
      }
      if (stateFilter === 'SELL') {
        return item.state.includes('SELL');
      }
      if (stateFilter === 'WATCH') {
        return item.state.includes('WATCH');
      }
      if (stateFilter === 'HIGH_SCORE') {
        return item.opportunityScore >= 80;
      }
      if (stateFilter === 'BEST_RR') {
        const rrVal = parseFloat(item.rr.split(':')[1] || '0');
        return rrVal >= 3.0;
      }
      if (stateFilter === 'LOW_RISK') {
        return item.riskLevel === 'LOW';
      }
      return true;
    });
  }, [radarData.rankedOpportunities, availabilityFilter, stateFilter, categoryFilter, styleFilter]);

  const handleSelectAsset = (sym: string) => {
    setActiveSymbol(sym);
    // Requirement 7: Connect to Global Opportunity Radar
    // When user selects a Radar opportunity, dispatch setup to calculator
    if (typeof window !== 'undefined') {
      const matched = radarData.rankedOpportunities.find((o) => o.symbol === sym);
      if (matched) {
        const isSell = matched.state.includes('SELL');
        window.dispatchEvent(
          new CustomEvent('fef_load_setup', {
            detail: {
              symbol: sym,
              direction: isSell ? 'SELL' : 'BUY',
              entryPrice: matched.entryZone && matched.entryZone.length > 0 ? matched.entryZone[0] : undefined,
              stopLoss: matched.stopLoss,
              tp1: matched.tp1,
              tp2: matched.tp2,
              tp3: matched.tp3,
            },
          })
        );
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const getStateBadge = (state: RadarOpportunityState) => {
    switch (state) {
      case 'STRONG BUY OPPORTUNITY':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
      case 'BUY OPPORTUNITY':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'WATCH FOR BUY':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'STRONG SELL OPPORTUNITY':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
      case 'SELL OPPORTUNITY':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'WATCH FOR SELL':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'NO TRADE':
        return 'bg-red-950/40 text-red-400 border-red-800/40';
      default:
        return 'bg-gray-800/40 text-gray-400 border-gray-700/30';
    }
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'ACT NOW':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse';
      case 'WAITING FOR CONFIRMATION':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'EVENT RISK':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'DEVELOPING':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      default:
        return 'bg-gray-700/30 text-gray-300 border-white/10';
    }
  };

  return (
    <section className="w-full rounded-2xl ghost-glass-panel-elevated p-3 sm:p-5 flex flex-col space-y-4 font-sans text-gray-200 relative overflow-hidden">
      {/* Decorative ambient subtle glow */}
      <div className="absolute -top-24 -right-24 w-80 h-80 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* 1. Header & Live Telemetry Pulse */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center space-x-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
            <svg className="w-5 h-5 animate-spin-slow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="9" strokeWidth="1.5" strokeDasharray="4 2" />
              <path d="M12 3v9l6 3" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base sm:text-lg font-bold tracking-[0.06em] uppercase text-[#F8FAFC] font-sans">
                GLOBAL OPPORTUNITY RADAR
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-cyan-500/15 text-[#22D3EE] border border-[#22D3EE]/30">
                ACTIVE SWARM SCAN
              </span>
            </div>
            <p className="text-[11px] text-[#94A3B8] font-sans flex items-center space-x-2">
              <span>Continuously triaging all connected markets</span>
              <span className="text-gray-600">•</span>
              <span suppressHydrationWarning className="text-[#34D399] font-mono">Next sync {lastScanTime}</span>
            </p>
          </div>
        </div>

        {/* Telemetry quick indicators */}
        <div className="flex flex-wrap items-center gap-2 text-[10.5px] font-mono">
          <div className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 flex items-center space-x-1.5">
            <span className="text-gray-400">SCANNED:</span>
            <span className="text-cyan-300 font-bold">{radarData.summaryStats.totalScanned} Assets</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 flex items-center space-x-1.5">
            <span className="text-gray-400">BEST OPPORTUNITY:</span>
            <span className="text-emerald-400 font-bold">{radarData.summaryStats.highestScoreAsset} ({radarData.summaryStats.highestScore}/100)</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 flex items-center space-x-1.5">
            <span className="text-gray-400">BUY / SELL / WATCH:</span>
            <span className="text-emerald-400 font-bold">{radarData.summaryStats.buyOpportunities}</span>
            <span className="text-gray-500">/</span>
            <span className="text-rose-400 font-bold">{radarData.summaryStats.sellOpportunities}</span>
            <span className="text-gray-500">/</span>
            <span className="text-cyan-300 font-bold">{radarData.summaryStats.watchlistCount}</span>
          </div>
        </div>
      </div>

      {/* 2. Top Spotlight (#1 Ranked Opportunity) + Market Attention Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Spotlight Card: #1 Ranked Opportunity (7 cols) */}
        <div className="lg:col-span-7 rounded-xl bg-gradient-to-br from-cyan-950/30 via-[#0a152e]/50 to-black/60 border border-cyan-500/30 p-3.5 sm:p-4 flex flex-col justify-between relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 px-3 py-1 bg-cyan-500/20 border-b border-l border-cyan-400/30 rounded-bl-xl text-[9.5px] font-mono font-bold text-cyan-300 tracking-wider">
            ★ #1 HIGHEST RANKED OPPORTUNITY
          </div>

          <div className="space-y-3">
            {/* Asset Headline */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xl font-black text-white font-mono">{topOpp.symbol}</span>
              <span className="text-xs text-gray-300">{topOpp.name}</span>
              <MarketStatusBadge symbol={topOpp.symbol} size="xs" />
              <ExecutabilityBadge executable={topOpp.tradeExecutable} score={topOpp.executabilityScore} size="xs" />
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${getStateBadge(topOpp.state)}`}>
                {topOpp.state}
              </span>
              <span className="text-xs font-mono text-gray-400 ml-auto">
                Price: <span className="text-white font-bold">{topOpp.price.toFixed(topOpp.price < 10 ? 4 : 2)}</span>
                <span className={`ml-1 text-[11px] ${topOpp.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  ({topOpp.change24h >= 0 ? '+' : ''}{topOpp.change24h}%)
                </span>
              </span>
            </div>

            {/* Score vs Confidence Metrics Side-by-Side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 bg-black/40 rounded-xl p-3 border border-white/5 font-mono">
              {/* Opportunity Score */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-cyan-300 font-bold">OPPORTUNITY SCORE</span>
                  <span className="text-cyan-400 text-sm font-black">{topOpp.opportunityScore} / 100</span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-900 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-700"
                    style={{ width: `${topOpp.opportunityScore}%` }}
                  />
                </div>
                <p className="text-[9.5px] text-gray-400 leading-tight">
                  Measures setup maturity, R:R asymmetry, liquidity clearance & execution timing.
                </p>
              </div>

              {/* AI Confidence */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-purple-300 font-bold">AI SWARM CONFIDENCE</span>
                  <span className="text-purple-400 text-sm font-black">{topOpp.aiConfidence}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-900 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-700"
                    style={{ width: `${topOpp.aiConfidence}%` }}
                  />
                </div>
                <p className="text-[9.5px] text-gray-400 leading-tight">
                  Probability of directional trend continuation across all 15 voting models.
                </p>
              </div>
            </div>

            {/* Blueprint Targets & Confluences */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
              <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                <div className="text-[9px] text-gray-500 uppercase">ENTRY ZONE</div>
                <div className="text-cyan-300 font-bold">{topOpp.entryZone[0]} - {topOpp.entryZone[1]}</div>
              </div>
              <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                <div className="text-[9px] text-gray-500 uppercase">INVALIDATION / SL</div>
                <div className="text-rose-400 font-bold">{topOpp.stopLoss}</div>
              </div>
              <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                <div className="text-[9px] text-gray-500 uppercase">TARGET 1 (TP1)</div>
                <div className="text-emerald-400 font-bold">{topOpp.tp1}</div>
              </div>
              <div className="p-2 rounded-lg bg-black/30 border border-white/5">
                <div className="text-[9px] text-gray-500 uppercase">ESTIMATED R:R</div>
                <div className="text-white font-bold">{topOpp.rr}</div>
              </div>
            </div>

            {/* "Why #1?" Key Confluence Points */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider font-bold">
                Why #{topOpp.rank} Ranked Confluence:
              </span>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10.5px] text-gray-300">
                {(topOpp.whyRankedReasons || topOpp.catalysts.slice(0, 4)).map((reason, idx) => (
                  <li key={idx} className="flex items-start space-x-1.5">
                    <span className="text-cyan-400 font-bold">✓</span>
                    <span className="leading-snug">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-3.5 mt-2 border-t border-white/10 flex items-center justify-between">
            <span className="text-[10px] font-mono text-gray-400">
              Regime: <span className="text-white font-medium">{topOpp.regime}</span>
            </span>
            <button
              onClick={() => handleSelectAsset(topOpp.symbol)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-500 hover:from-cyan-500 hover:to-blue-500 text-white font-mono font-black text-[11px] tracking-wider transition-all shadow-[0_0_20px_rgba(0,240,255,0.4)] flex items-center space-x-2 cursor-pointer border border-cyan-400/40"
            >
              <span>INSPECT & SWITCH TO {topOpp.symbol}</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Market Attention Queue (5 cols) */}
        <div className="lg:col-span-5 rounded-xl bg-black/40 border border-white/10 p-3.5 sm:p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center space-x-2">
              <span className="text-amber-400">⚡</span>
              <h3 className="text-xs font-mono font-black text-white uppercase tracking-wider">
                MARKET ATTENTION QUEUE
              </h3>
            </div>
            <span className="text-[9.5px] font-mono text-gray-400">Prioritized Triage</span>
          </div>

          {/* Attention Queue Items */}
          <div className="space-y-2 flex-1">
            {radarData.attentionQueue.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelectAsset(item.symbol)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col space-y-1 ${
                  item.symbol === activeSymbol
                    ? 'bg-cyan-950/40 border-cyan-500/50 shadow-sm'
                    : 'bg-black/40 border-white/5 hover:border-cyan-500/30 hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-white">{item.symbol}</span>
                    <span className={`px-1.5 py-0.2 text-[8.5px] font-mono rounded border ${getUrgencyBadge(item.urgency)}`}>
                      {item.urgency}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-gray-400">{item.eta}</span>
                </div>
                <div className="text-[11px] font-semibold text-gray-200">{item.headline}</div>
                <div className="text-[10px] text-gray-400 leading-tight">{item.detail}</div>
              </div>
            ))}
          </div>

          <div className="pt-2 text-right">
            <span className="text-[9.5px] font-mono text-cyan-400/80">
              Click any item to load asset intelligence & 15-agent debate
            </span>
          </div>
        </div>
      </div>

      {/* 3. Sub-Navigation Filters & Category Switches */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-1 border-t border-white/5">
        {/* Main Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none font-mono text-[11px]">
          <button
            onClick={() => setSubTab('RADAR_TABLE')}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'RADAR_TABLE'
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 font-bold shadow-sm'
                : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            Ranked Opportunities ({filteredOpportunities.length})
          </button>
          <button
            onClick={() => setSubTab('DEVELOPING')}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'DEVELOPING'
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 font-bold shadow-sm'
                : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            Developing Setups ({radarData.developingSetups.length})
          </button>
          <button
            onClick={() => setSubTab('INVALIDATED')}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'INVALIDATED'
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 font-bold shadow-sm'
                : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            Recently Invalidated ({radarData.recentlyInvalidated.length})
          </button>
          <button
            onClick={() => setSubTab('REGIME_MAP')}
            className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
              subTab === 'REGIME_MAP'
                ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 font-bold shadow-sm'
                : 'bg-black/30 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            Market Regime Map
          </button>
        </div>

        {/* Filters Row (Active on RADAR_TABLE) */}
        {subTab === 'RADAR_TABLE' && (
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            {/* Availability / Session Filter */}
            <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-lg border border-white/10">
              <span className="text-cyan-400 pl-1 font-bold">SESSION GATE:</span>
              {([
                { id: 'ALL', label: 'ALL' },
                { id: 'TRADEABLE_NOW', label: 'TRADEABLE NOW' },
                { id: 'DEVELOPING', label: 'DEVELOPING' },
                { id: 'MARKET_CLOSED', label: 'MARKET CLOSED / NEXT SESSION' }
              ] as const).map((g) => (
                <button
                  key={g.id}
                  onClick={() => setAvailabilityFilter(g.id)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
                    availabilityFilter === g.id
                      ? 'bg-cyan-500/30 text-cyan-200 font-bold border border-cyan-400/40'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* State Filter */}
            <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-lg border border-white/10">
              <span className="text-gray-500 pl-1">STATE:</span>
              {(['ALL', 'BUY', 'SELL', 'WATCH', 'HIGH_SCORE', 'BEST_RR', 'LOW_RISK'] as StateFilterType[]).map((st) => (
                <button
                  key={st}
                  onClick={() => setStateFilter(st)}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    stateFilter === st ? 'bg-cyan-500/30 text-cyan-200 font-bold' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {st.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Asset Category */}
            <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-lg border border-white/10">
              <span className="text-gray-400 pl-1 font-bold">ASSET:</span>
              {(['ALL', 'METALS', 'FOREX', 'INDICES', 'COMMODITIES', 'CRYPTO'] as CategoryFilterType[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                    categoryFilter === cat || (categoryFilter === 'COMMODITY' && cat === 'COMMODITIES')
                      ? 'bg-cyan-500/30 text-cyan-200 font-bold border border-cyan-400/40'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Style Filter */}
            <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-lg border border-white/10">
              <span className="text-gray-400 pl-1 font-bold">STYLE:</span>
              {(['ALL', 'SCALPING', 'INTRADAY', 'SWING'] as StyleFilterType[]).map((sty) => (
                <button
                  key={sty}
                  onClick={() => setStyleFilter(sty)}
                  className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors ${
                    styleFilter === sty ? 'bg-cyan-500/30 text-cyan-200 font-bold border border-cyan-400/40' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {sty}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Tab Views */}
      {subTab === 'RADAR_TABLE' && (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
          <table className="w-full text-left font-mono text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-black/70 text-gray-300 text-[10px] uppercase font-bold">
                <th className="py-2.5 px-3"># RANK</th>
                <th className="py-2.5 px-3">ASSET</th>
                <th className="py-2.5 px-3">MARKET</th>
                <th className="py-2.5 px-3">RADAR STATE</th>
                <th className="py-2.5 px-3">SETUP QUALITY</th>
                <th className="py-2.5 px-3">EXECUTABILITY</th>
                <th className="py-2.5 px-3">AI CONFIDENCE</th>
                <th className="py-2.5 px-3">STYLE / TF</th>
                <th className="py-2.5 px-3">EST. R:R</th>
                <th className="py-2.5 px-3">RISK LEVEL</th>
                <th className="py-2.5 px-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredOpportunities.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2 font-mono">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                      <span className="text-amber-300 font-bold text-xs uppercase tracking-wider">
                        NO MATCHING {categoryFilter} OPPORTUNITIES
                      </span>
                      <span className="text-gray-400 text-[11px]">
                        Try switching session filters or connecting additional demo instruments in settings.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOpportunities.map((item) => {
                  const isActive = item.symbol === activeSymbol;
                  return (
                    <tr
                      key={item.symbol}
                      onClick={() => handleSelectAsset(item.symbol)}
                      className={`hover:bg-cyan-500/[0.06] transition-colors cursor-pointer ${
                        isActive ? 'bg-cyan-950/40 border-l-2 border-l-cyan-400' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-gray-400 font-bold">
                        {item.rank === 1 ? (
                          <span className="text-amber-400 font-black">#1 ★</span>
                        ) : (
                          `#${item.rank}`
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-xs">{item.symbol}</span>
                          <span className="text-[10px] text-gray-400">{item.name}</span>
                          {isActive && (
                            <span className="px-1 py-0.2 rounded text-[8.5px] bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                              ACTIVE
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <MarketStatusBadge symbol={item.symbol} size="xs" showCountdown={false} />
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] border ${getStateBadge(item.state)}`}>
                          {item.state}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-cyan-300 w-6">{item.opportunityScore}</span>
                          <div className="w-16 h-1.5 rounded-full bg-gray-900 overflow-hidden">
                            <div
                              className="h-full bg-cyan-400"
                              style={{ width: `${item.opportunityScore}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <ExecutabilityBadge executable={item.tradeExecutable} score={item.executabilityScore} size="xs" />
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-purple-300 w-8">{item.aiConfidence}%</span>
                          <div className="w-14 h-1.5 rounded-full bg-gray-900 overflow-hidden">
                            <div
                              className="h-full bg-purple-400"
                              style={{ width: `${item.aiConfidence}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-gray-300">{item.timeframe}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{item.rr}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[9.5px] font-bold ${
                            item.riskLevel === 'LOW'
                              ? 'text-emerald-400'
                              : item.riskLevel === 'MEDIUM'
                              ? 'text-yellow-400'
                              : item.riskLevel === 'ELEVATED'
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {item.riskLevel}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectAsset(item.symbol);
                          }}
                          className="px-2.5 py-1 rounded bg-cyan-950/60 hover:bg-cyan-800/80 border border-cyan-500/30 text-cyan-300 hover:text-white text-[10px] font-mono transition-colors"
                        >
                          {isActive ? 'INSPECTING' : 'SELECT'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* View: Developing Setups */}
      {subTab === 'DEVELOPING' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {radarData.developingSetups.map((dev) => (
            <div
              key={dev.symbol}
              onClick={() => handleSelectAsset(dev.symbol)}
              className="p-3.5 rounded-xl bg-black/40 border border-white/10 hover:border-cyan-500/40 transition-all cursor-pointer flex flex-col justify-between space-y-2.5"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-black text-white font-mono">{dev.symbol}</span>
                    <span className="text-xs text-gray-400">{dev.name}</span>
                  </div>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                      dev.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {dev.direction}
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-200">{dev.pattern}</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  <span className="text-cyan-400 font-mono">Trigger:</span> {dev.triggerCondition}
                </p>
              </div>

              <div className="space-y-1 font-mono pt-2 border-t border-white/5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">Setup Readiness</span>
                  <span className="text-cyan-300 font-bold">{dev.readinessPct}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-gray-900 overflow-hidden">
                  <div className="h-full bg-cyan-400" style={{ width: `${dev.readinessPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1">
                  <span>Est. R:R: <strong className="text-white">{dev.estimatedRR}</strong></span>
                  <span className="text-cyan-400 underline">Switch to {dev.symbol} →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View: Recently Invalidated */}
      {subTab === 'INVALIDATED' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {radarData.recentlyInvalidated.map((inv) => (
            <div
              key={inv.symbol}
              onClick={() => handleSelectAsset(inv.symbol)}
              className="p-3.5 rounded-xl bg-black/40 border border-rose-500/20 hover:border-rose-500/40 transition-all cursor-pointer space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-black text-white font-mono">{inv.symbol}</span>
                  <span className="text-xs text-rose-400 font-semibold">{inv.setupName}</span>
                </div>
                <span className="text-[9.5px] font-mono text-gray-400">{inv.invalidatedAt}</span>
              </div>
              <p className="text-xs text-gray-300 leading-snug">
                <strong className="text-rose-300">Invalidation Reason:</strong> {inv.reason}
              </p>
              <div className="p-2 rounded-lg bg-rose-950/20 border border-rose-500/20 text-[10.5px] font-mono text-rose-300">
                🛡 {inv.lossMitigation}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View: Multi-Asset Regime Map */}
      {subTab === 'REGIME_MAP' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 font-mono text-[11px]">
          {radarData.regimeMap.map((reg) => (
            <div
              key={reg.symbol}
              onClick={() => handleSelectAsset(reg.symbol)}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                reg.symbol === activeSymbol
                  ? 'bg-cyan-950/50 border-cyan-400/50'
                  : 'bg-black/40 border-white/5 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-white text-xs">{reg.symbol}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[8.5px] ${
                    reg.bias === 'BULLISH'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : reg.bias === 'BEARISH'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-gray-700/30 text-gray-300'
                  }`}
                >
                  {reg.bias}
                </span>
              </div>
              <div className="text-[10px] text-gray-300 line-clamp-1">{reg.regime}</div>
              <div className="text-[9px] text-gray-500 mt-1 flex items-center justify-between">
                <span>{reg.volatility}</span>
                <span className="text-cyan-400">{reg.category}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
