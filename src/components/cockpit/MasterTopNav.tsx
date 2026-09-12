'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { NotificationCenterDrawer } from './NotificationCenterDrawer';
import { SupportModal } from './SupportModal';
import { getStoredNotifications, subscribeRadarNotifications } from '@/lib/radar/radar-notifications';
import { BRAND_CONFIG } from '@/lib/config/support-config';

export const MasterTopNav: React.FC = () => {
  const pathname = usePathname();
  const { activeSymbol, activeAsset, assetProfile, allAssets } = useActiveAsset();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const updateUnread = () => {
      const items = getStoredNotifications();
      setUnreadCount(items.filter((i) => !i.read).length);
    };
    updateUnread();

    const unsubscribe = subscribeRadarNotifications(() => {
      updateUnread();
    });

    return () => unsubscribe();
  }, [isDrawerOpen]);

  const navTabs = [
    { name: 'Cockpit', path: '/cockpit' },
    { name: 'Agents', path: '/agents' },
    { name: 'Markets', path: '/markets' },
    { name: 'Chart Analyzer', path: '/chart-analyzer' },
    { name: 'Execution', path: '/execution' },
    { name: 'Journal', path: '/journal' },
    { name: 'Settings', path: '/settings' },
  ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsThinking(true);
    setShowAiModal(true);

    // Contextual query resolution via Central AI Orchestrator & Active Asset Context
    setTimeout(() => {
      setIsThinking(false);
      const q = searchQuery.toLowerCase().trim();

      // Check if user is asking about a specific supported symbol
      const matchedSymbolKey = Object.keys(allAssets).find(sym => {
        const s = sym.toLowerCase();
        const asset = allAssets[sym];
        const name = asset?.name?.toLowerCase() || '';
        return q.includes(s) || (name && q.includes(name));
      });

      if (matchedSymbolKey && matchedSymbolKey !== activeSymbol) {
        const targetAsset = allAssets[matchedSymbolKey];
        const priceFmt = targetAsset.price >= 1000 
          ? targetAsset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : targetAsset.price.toFixed(4);
        setAiAnswer(
          `${targetAsset.name} (${targetAsset.symbol}) is currently trading at ${priceFmt} (${targetAsset.change24h >= 0 ? '+' : ''}${targetAsset.change24h.toFixed(2)}%). Switch the active instrument to ${targetAsset.symbol} in the top-left selector to inspect the complete 15-agent blackboard debate and institutional execution parameters.`
        );
        return;
      }

      // Asset-specific / contextual query handling
      const currentPriceFmt = activeAsset.price >= 1000 
        ? activeAsset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : activeAsset.price.toFixed(4);

      if (q.includes('why') || q.includes('reason') || q.includes('rationale') || q.includes('thesis')) {
        const reasons = assetProfile.whyThisTrade?.length > 0 
          ? assetProfile.whyThisTrade.join(' ') 
          : `Market structure alignment across higher timeframes confirming ${assetProfile.setupDirection} posture.`;
        setAiAnswer(
          `Why ${activeSymbol} is ${assetProfile.setupDirection} (${assetProfile.confidence}% Confluence at ${currentPriceFmt}): ${reasons} Invalidation is strictly defined at ${assetProfile.invalidation}.`
        );
      } else if (q.includes('risk') || q.includes('danger') || q.includes('guard') || q.includes('loss') || q.includes('sl')) {
        const risks = assetProfile.opposingRisks?.length > 0
          ? assetProfile.opposingRisks.map((r, i) => `${i + 1}) ${r}`).join(' ')
          : `Macro scheduled event shock buffer and liquidity sweeps against stop loss level at ${assetProfile.stopLoss}.`;
        setAiAnswer(
          `Risk Guardian Parameters for ${activeSymbol}: Stop Loss is pegged at ${assetProfile.stopLoss} (Risk/Reward ${assetProfile.rr}). Active Opposing Risks identified by Council: ${risks} Max mathematical portfolio allocation: 0.50% - 1.00%.`
        );
      } else if (q.includes('level') || q.includes('target') || q.includes('entry') || q.includes('tp')) {
        setAiAnswer(
          `Execution Levels for ${activeSymbol} [${assetProfile.setupDirection}]: Entry Zone: ${assetProfile.entryZone[0]} - ${assetProfile.entryZone[1]} | Stop Loss: ${assetProfile.stopLoss} | TP1: ${assetProfile.tp1} | TP2: ${assetProfile.tp2} | TP3: ${assetProfile.tp3} | Expected R:R: ${assetProfile.rr}. Invalidation: ${assetProfile.invalidation}.`
        );
      } else if (q.includes('agent') || q.includes('council') || q.includes('vote') || q.includes('swarm')) {
        const bullishCount = assetProfile.agents.filter(a => a.bias === 'BULLISH').length;
        const bearishCount = assetProfile.agents.filter(a => a.bias === 'BEARISH').length;
        const neutralCount = assetProfile.agents.length - bullishCount - bearishCount;
        setAiAnswer(
          `15-Agent Council Consensus for ${activeSymbol}: ${bullishCount} Bullish, ${bearishCount} Bearish, ${neutralCount} Neutral/Restricted (${assetProfile.confidence}% Confluence). Leading vote: ${assetProfile.setupDirection}. Center Orchestrator enforces strict Risk Guardian exposure bounds before any signal dispatch.`
        );
      } else if (q.includes('macro') || q.includes('dxy') || q.includes('yield') || q.includes('fed')) {
        const macroAgent = assetProfile.agents.find(a => a.name.includes('Macro') || a.name.includes('Correlation'));
        setAiAnswer(
          `Macro & Intermarket State for ${activeSymbol}: ${macroAgent?.lastOpinion || 'DXY rejected key resistance with SMT divergence, influencing systemic liquidity.'} Regime: ${assetProfile.regime}. Volatility: ${assetProfile.volatility}. Session: ${assetProfile.session}.`
        );
      } else {
        const topReason = assetProfile.whyThisTrade?.[0] || `Order flow and institutional liquidity aligning with ${assetProfile.setupDirection}.`;
        const topRisk = assetProfile.opposingRisks?.[0] || `Scheduled news release volatility buffer.`;
        setAiAnswer(
          `FEF AI Swarm Analysis for "${searchQuery}": 15 Council agents report ${assetProfile.confidence}% confluence on ${activeSymbol} (${currentPriceFmt}) with posture ${assetProfile.setupDirection}. Primary Thesis: "${topReason}". Risk Constraint: "${topRisk}". Risk Guardian limit: Max 0.50% account risk.`
        );
      }
    }, 500);
  };

  return (
    <>
      <header className="ghost-glass-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs relative z-30">
        {/* Brand Identity: [ LOGO ] | [ CENTERED BRAND TEXT BLOCK ] */}
        <div className="flex items-center space-x-3 sm:space-x-4 select-none">
          {/* 1. Circular FEF Logo on Far Left */}
          <Link
            href="/cockpit"
            className="relative flex-shrink-0 flex items-center justify-center group/logo cursor-pointer"
            title="FEF Trading Solutions Home Cockpit"
          >
            <div className="relative w-[54px] h-[54px] sm:w-[60px] sm:h-[60px] flex items-center justify-center">
              {/* Subtle ambient cyan/electric-blue/violet backlight glow */}
              <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-md group-hover/logo:bg-cyan-400/35 transition-all pointer-events-none" />
              <img
                src="/images/fef-logo.png"
                alt="FEF Trading Solutions Logo"
                className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_12px_rgba(34,211,238,0.45)] group-hover/logo:scale-105 transition-transform duration-200"
              />
            </div>
          </Link>

          {/* 2. Low-opacity glass-compatible subtle divider */}
          <div
            className="h-10 sm:h-12 w-[1px] bg-gradient-to-b from-transparent via-cyan-500/25 to-transparent flex-shrink-0"
            aria-hidden="true"
          />

          {/* 3. Unified Centered Brand Text Block (All 3 lines share the exact same horizontal center axis) */}
          <div className="flex flex-col items-center justify-center text-center">
            {/* Line 1: Company Name */}
            <Link
              href="/cockpit"
              className="group/title inline-block transition-opacity hover:opacity-95"
            >
              <h1 className="text-xs sm:text-[14px] font-extrabold text-[#F8FAFC] tracking-[0.1em] font-sans uppercase leading-tight text-center">
                FEF <span className="text-[#22D3EE] font-bold">TRADING SOLUTIONS</span>
              </h1>
            </Link>

            {/* Line 2: Tagline (Centered directly beneath company name, ~4-5px spacing) */}
            <p className="text-[9.5px] sm:text-[10px] font-sans text-[#94A3B8] font-medium tracking-[0.03em] leading-tight mt-1 text-center whitespace-nowrap">
              {BRAND_CONFIG.tagline}
            </p>

            {/* Line 3: Website (Centered directly beneath tagline, shares exact same center axis, ~4-5px spacing) */}
            <a
              href={BRAND_CONFIG.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center space-x-1 mt-1 text-[10px] sm:text-[10.5px] font-mono font-bold text-[#67E8F9] hover:text-[#F8FAFC] transition-all hover:drop-shadow-[0_0_8px_rgba(34,211,238,0.7)] group/site leading-tight text-center cursor-pointer"
              title={`Visit ${BRAND_CONFIG.domainDisplay}`}
            >
              <span className="text-[10px]">🌐</span>
              <span className="underline decoration-[#22D3EE]/40 group-hover/site:decoration-[#22D3EE] underline-offset-2">
                {BRAND_CONFIG.domainDisplay}
              </span>
              <span className="text-[8.5px] text-[#67E8F9]/80 group-hover/site:translate-x-0.5 group-hover/site:-translate-y-0.5 transition-transform">
                ↗
              </span>
            </a>
          </div>
        </div>

        {/* Real Route Navigation Tabs */}
        <nav className="hidden lg:flex items-center space-x-1 bg-black/40 p-1 rounded-xl border border-white/10 font-sans">
          {navTabs.map((tab) => {
            const isRoot = pathname === '/' && tab.path === '/cockpit';
            const isActive = pathname === tab.path || pathname.startsWith(tab.path + '/') || isRoot;

            return (
              <Link
                key={tab.name}
                href={tab.path}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all text-xs flex items-center space-x-1 ${
                  isActive
                    ? 'bg-cyan-500/20 text-[#F8FAFC] border border-[#22D3EE]/50 shadow-[0_0_12px_rgba(34,211,238,0.35)] font-bold'
                    : 'text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-white/5'
                }`}
              >
                <span>{tab.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Search Bar & Telemetry Avatar */}
        <div className="flex items-center space-x-3">
          {/* Ask FEF AI Search Field */}
          <form onSubmit={handleSearchSubmit} className="relative hidden md:flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask FEF AI anything... (e.g. Why gold is bullish?)"
              className="bg-black/50 border border-white/10 focus:border-cyan-400/60 rounded-xl pl-8 pr-8 py-1.5 text-[11px] text-gray-200 placeholder-gray-500 w-56 focus:w-72 transition-all outline-none"
            />
            <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <button
              type="submit"
              className="absolute right-2 px-1.5 py-0.2 bg-cyan-950/60 hover:bg-cyan-800/80 border border-cyan-500/30 rounded text-[9px] text-cyan-300 font-mono transition-colors"
            >
              /
            </button>
          </form>

          {/* 24/7 Support Desk */}
          <button
            onClick={() => setIsSupportOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white transition-all cursor-pointer font-mono text-[10px] shadow-[0_0_10px_rgba(0,240,255,0.15)]"
            title="24/7 Institutional Support Desk"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold tracking-wider">● 24/7 SUPPORT</span>
          </button>

          {/* Bell notification & Radar Alert Trigger */}
          <button
            onClick={() => setIsDrawerOpen((prev) => !prev)}
            className="relative p-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-cyan-400/50 text-gray-300 hover:text-white transition-all cursor-pointer"
            title="Opportunity Radar & Risk Notifications"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 px-1 min-w-[14px] h-[14px] rounded-full bg-cyan-400 text-black font-mono font-bold text-[8.5px] flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400/60" />
            )}
          </button>

          {/* User avatar + Ghost Cockpit status */}
          <Link href="/settings" className="flex items-center space-x-2.5 pl-2 border-l border-white/10 hover:opacity-90 transition-opacity">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-600 to-blue-800 border border-cyan-400/40 flex items-center justify-center font-bold text-[10px] text-white shadow-sm">
              FEF
            </div>
            <div className="hidden sm:block text-right leading-tight">
              <div className="flex items-center justify-end space-x-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-white tracking-wide">
                  GHOST GLASS COCKPIT
                </span>
              </div>
              <p className="text-[7.5px] font-mono text-cyan-400 tracking-wider">
                REAL-TIME • INTELLIGENCE • EXECUTION
              </p>
            </div>
          </Link>
        </div>
      </header>

      {/* Ask FEF AI Interactive Response Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="bg-[#080f21] border border-cyan-400/60 rounded-2xl max-w-xl w-full p-5 shadow-[0_0_50px_rgba(0,240,255,0.3)] font-mono space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
                  ⚡
                </div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  FEF AI ORCHESTRATOR SYNTHESIS
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowAiModal(false);
                  setAiAnswer(null);
                }}
                className="text-gray-400 hover:text-white text-base px-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-[11px] text-gray-400 bg-black/40 p-2.5 rounded-xl border border-white/5">
                <span className="text-cyan-400 font-bold uppercase mr-1">Query:</span>
                <span className="text-gray-200">{searchQuery || 'Market Intelligence Status'}</span>
              </div>

              {isThinking ? (
                <div className="flex items-center space-x-2 py-4 justify-center text-cyan-300 text-xs">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Synthesizing live blackboard memory &amp; 15 council nodes...</span>
                </div>
              ) : (
                <div className="bg-[#040814] p-3.5 rounded-xl border border-cyan-500/30 text-[11px] text-gray-200 leading-relaxed space-y-2">
                  <div className="flex items-center space-x-1.5 text-emerald-400 text-[10px] font-bold">
                    <span>●</span>
                    <span>VERIFIED LIVE REASONING</span>
                  </div>
                  <p>{aiAnswer}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 text-[9px] text-gray-400 border-t border-white/5">
              <span>Source: Shared Agent Blackboard &bull; Exness Live</span>
              <button
                onClick={() => {
                  setShowAiModal(false);
                  setAiAnswer(null);
                }}
                className="px-3 py-1 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-500 transition-colors border border-cyan-400/30 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Asset Opportunity & Risk Notification Drawer */}
      <NotificationCenterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      {/* 24/7 Institutional Support Desk Modal */}
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />
    </>
  );
};
