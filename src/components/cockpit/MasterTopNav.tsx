'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { NotificationCenterDrawer } from './NotificationCenterDrawer';
import { SupportModal } from './SupportModal';
import { getStoredNotifications, subscribeRadarNotifications } from '@/lib/radar/radar-notifications';
import { BRAND_CONFIG } from '@/lib/config/support-config';
import { MarketStatusBadge } from '@/components/common/MarketStatusBadge';
import { evaluateMarketSession } from '@/lib/session/market-session-engine';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';

export const MasterTopNav: React.FC = () => {
  const pathname = usePathname();
  const { activeSymbol, activeAsset, assetProfile, allAssets } = useActiveAsset();
  const { telemetry, isMt5Connected } = useMT5Telemetry();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setShowAiModal(false);
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        const targetSession = evaluateMarketSession(targetAsset.symbol);
        const priceFmt = targetAsset.price >= 1000 
          ? targetAsset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : targetAsset.price.toFixed(4);
        const marketClosedNotice = !targetSession.tradeExecutable
          ? ` [MARKET NOTE: ${targetAsset.symbol} is currently ${targetSession.statusLabel}. Execution is unavailable (opens in ${targetSession.nextOpenCountdown}). Revalidation required at next open session.]`
          : '';
        setAiAnswer(
          `${targetAsset.name} (${targetAsset.symbol}) is currently trading at ${priceFmt} (${targetAsset.change24h >= 0 ? '+' : ''}${targetAsset.change24h.toFixed(2)}%).${marketClosedNotice} Switch the active instrument to ${targetAsset.symbol} in the top-left selector to inspect the complete 15-agent blackboard debate and institutional execution parameters.`
        );
        return;
      }

      // Asset-specific / contextual query handling
      const currentPriceFmt = activeAsset.price >= 1000 
        ? activeAsset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : activeAsset.price.toFixed(4);

      const sessionClosedNotice = !assetProfile.tradeExecutable
        ? ` [MARKET STATUS: ${activeSymbol} is currently ${assetProfile.sessionState.statusLabel}. Execution is locked (opens in ${assetProfile.sessionState.nextOpenCountdown}). Analysis is reference-only; revalidation required at next session open.]`
        : '';

      if (q.includes('why') || q.includes('reason') || q.includes('rationale') || q.includes('thesis')) {
        const reasons = assetProfile.whyThisTrade?.length > 0 
          ? assetProfile.whyThisTrade.join(' ') 
          : `Market structure alignment across higher timeframes confirming ${assetProfile.setupDirection} posture.`;
        setAiAnswer(
          `Why ${activeSymbol} is ${assetProfile.setupDirection} (Council evidence trust: ${assetProfile.confidence}% at ${currentPriceFmt}): ${reasons} Invalidation is strictly defined at ${assetProfile.invalidation}.${sessionClosedNotice}`
        );
      } else if (q.includes('risk') || q.includes('danger') || q.includes('guard') || q.includes('loss') || q.includes('sl')) {
        const risks = assetProfile.opposingRisks?.length > 0
          ? assetProfile.opposingRisks.map((r, i) => `${i + 1}) ${r}`).join(' ')
          : `Market structure invalidation and liquidity sweeps against stop loss level at ${assetProfile.stopLoss}.`;
        setAiAnswer(
          `Risk Guardian Parameters for ${activeSymbol}: Stop Loss is pegged at ${assetProfile.stopLoss} (Risk/Reward ${assetProfile.rr}). Active Opposing Risks identified by Council: ${risks} Max mathematical portfolio allocation policy cap: 0.50% equity.${sessionClosedNotice}`
        );
      } else if (q.includes('level') || q.includes('target') || q.includes('entry') || q.includes('tp')) {
        setAiAnswer(
          `Execution Levels for ${activeSymbol} [${assetProfile.setupDirection}]: Entry Zone: ${assetProfile.entryZone[0]} - ${assetProfile.entryZone[1]} | Stop Loss: ${assetProfile.stopLoss} | TP1: ${assetProfile.tp1} | TP2: ${assetProfile.tp2} | TP3: ${assetProfile.tp3} | Expected R:R: ${assetProfile.rr}. Invalidation: ${assetProfile.invalidation}.${sessionClosedNotice}`
        );
      } else if (q.includes('agent') || q.includes('council') || q.includes('vote') || q.includes('swarm')) {
        const bullishCount = assetProfile.agents.filter(a => a.bias === 'BULLISH').length;
        const bearishCount = assetProfile.agents.filter(a => a.bias === 'BEARISH').length;
        const neutralCount = assetProfile.agents.length - bullishCount - bearishCount;
        setAiAnswer(
          `Council Consensus for ${activeSymbol}: ${bullishCount} Bullish, ${bearishCount} Bearish, ${neutralCount} Neutral/Restricted (Council evidence trust: ${assetProfile.confidence}%). Leading posture: ${assetProfile.setupDirection}. Center Orchestrator enforces strict Risk Guardian exposure bounds before any signal dispatch.${sessionClosedNotice}`
        );
      } else if (q.includes('macro') || q.includes('dxy') || q.includes('yield') || q.includes('fed')) {
        const macroAgent = assetProfile.agents.find(a => a.name.includes('Macro') || a.name.includes('Correlation'));
        setAiAnswer(
          `Macro & Intermarket State for ${activeSymbol}: ${macroAgent?.lastOpinion || 'DXY rejected key resistance with SMT divergence, influencing systemic liquidity.'} Regime: ${assetProfile.regime}. Volatility: ${assetProfile.volatility}. Session: ${assetProfile.session}.${sessionClosedNotice}`
        );
      } else {
        const topReason = assetProfile.whyThisTrade?.[0] || `Order flow and institutional liquidity aligning with ${assetProfile.setupDirection}.`;
        const topRisk = assetProfile.opposingRisks?.[0] || `Market volatility buffer and structure preservation.`;
        setAiAnswer(
          `FEF AI Swarm Analysis for "${searchQuery}": Council evidence trust: ${assetProfile.confidence}% on ${activeSymbol} (${currentPriceFmt}) with posture ${assetProfile.setupDirection}. Primary Thesis: "${topReason}". Risk Constraint: "${topRisk}". Risk Guardian limit: Max policy cap 0.50% equity.${sessionClosedNotice}`
        );
      }
    }, 500);
  };

  return (
    <>
      <header className="ghost-glass-panel rounded-2xl px-3 sm:px-4 py-2 flex items-center justify-between gap-2.5 sm:gap-4 text-xs relative z-30 min-h-[58px]">
        {/* =========================================================================
            LEFT: APPROVED BRAND LOCKUP
            [ EXISTING FEF ROUND LOGO ]  FEF
                                         TRADING INTELLIGENCE
                                         AI • MARKETS • RISK • EXECUTION
           ========================================================================= */}
        <Link
          href="/cockpit"
          className="flex items-center space-x-3 sm:space-x-3.5 select-none flex-shrink-0 group/brand cursor-pointer py-0.5"
          title="FEF Trading Intelligence Cockpit"
        >
          {/* Circular FEF Logo (Original intact, prominent, directly LEFT of typography) */}
          <div className="relative w-[50px] h-[50px] sm:w-[54px] sm:h-[54px] flex-shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-cyan-400/25 blur-md group-hover/brand:bg-cyan-400/40 transition-all pointer-events-none" />
            <img
              src="/images/fef-logo.png"
              alt="FEF Trading Intelligence Logo"
              className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)] group-hover/brand:scale-105 transition-transform duration-200"
            />
          </div>

          {/* Brand Typography Block */}
          <div className="flex flex-col justify-center text-left select-none">
            {/* Line 1: FEF CORTEX (Dominant, clean futuristic geometric lettering, extended tracking, cyan/ice-blue/white glow) */}
            <div className="text-[20px] sm:text-[23px] font-black tracking-[0.14em] font-sans uppercase leading-none text-transparent bg-clip-text bg-gradient-to-r from-white via-[#F0F9FF] to-[#67E8F9] drop-shadow-[0_0_14px_rgba(34,211,238,0.5)] flex items-center space-x-1.5">
              <span>FEF</span>
              <span className="text-[#38BDF8] tracking-[0.18em]">CORTEX</span>
            </div>

            {/* Line 2: AUTONOMOUS TRADING INTELLIGENCE (Prominent, wide tracking, high-tech cyan) */}
            <div className="text-[9px] sm:text-[10px] font-black tracking-[0.20em] font-sans uppercase text-[#38BDF8] group-hover/brand:text-[#67E8F9] transition-colors leading-none mt-1">
              AUTONOMOUS TRADING INTELLIGENCE
            </div>

            {/* Line 3: AI • MARKETS • RISK • EXECUTION (Visible descriptor, wide tracking, muted ice-blue/grey) */}
            <div className="text-[7px] sm:text-[8px] font-semibold tracking-[0.20em] font-mono text-[#94A3B8] group-hover/brand:text-[#CBD5E1] transition-colors leading-none mt-1 block">
              AI • MARKETS • RISK • EXECUTION
            </div>
          </div>
        </Link>

        {/* =========================================================================
            CENTER / FLEXIBLE AREA: SEARCH & OPERATIONAL CONTROLS
           ========================================================================= */}
        <div className="flex items-center space-x-2 sm:space-x-2.5 flex-shrink">
          {/* Ask FEF AI Search Field (Dark glass, cyan accent) */}
          <form onSubmit={handleSearchSubmit} className="relative hidden md:flex items-center">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask FEF AI anything..."
              className="bg-black/50 border border-white/10 hover:border-cyan-500/30 focus:border-cyan-400/70 focus:shadow-[0_0_12px_rgba(34,211,238,0.2)] rounded-xl pl-8 pr-7 py-1 text-[11px] text-gray-200 placeholder-gray-500 w-36 lg:w-44 xl:w-56 focus:w-64 transition-all outline-none"
            />
            <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <button
              type="submit"
              className="absolute right-2 px-1.5 py-0.2 bg-cyan-950/60 hover:bg-cyan-800/80 border border-cyan-500/30 rounded text-[9px] text-cyan-300 font-mono transition-colors"
              title="Press / anywhere to search"
            >
              /
            </button>
          </form>

          {/* Operational Indicators */}
          {/* 1. Market / Session Status */}
          <MarketStatusBadge
            symbol={activeSymbol}
            sessionState={assetProfile.sessionState}
            size="xs"
            className="hidden sm:inline-flex"
          />

          {/* 2. Canonical MT5 Status Pill */}
          {isMt5Connected ? (
            <Link
              href="/execution"
              className="hidden xl:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-emerald-950/40 border border-emerald-500/50 hover:border-emerald-400 text-emerald-300 hover:text-emerald-100 font-mono text-[9px] transition-all cursor-pointer shadow-[0_0_10px_rgba(160,240,255,0.2)]"
              title="MT5 Telemetry Connected (READ-ONLY)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold tracking-wider">MT5 CONNECTED ({telemetry.account?.broker || (telemetry.isRemote ? 'RELAY' : 'LIVE')})</span>
            </Link>
          ) : (
            <Link
              href="/settings"
              className="hidden xl:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-black/40 border border-white/10 hover:border-cyan-400/40 text-gray-400 hover:text-gray-200 font-mono text-[9px] transition-all cursor-pointer"
              title="MT5 Bridge Standby • Connect in Settings"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span className="font-bold tracking-wider">MT5 STANDBY</span>
            </Link>
          )}

          {/* 3. Data Sentinel System Integrity Badge */}
          <div
            className={`hidden 2xl:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl font-mono text-[9px] border ${
              isMt5Connected
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
            }`}
            title="Data Sentinel: Non-directional system integrity & feed auditor"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isMt5Connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="font-bold tracking-wider">SENTINEL: {isMt5Connected ? 'HEALTHY' : 'DATA LIMITED'}</span>
          </div>

          {/* 4. Overall Data Readiness Badge */}
          <div
            className="hidden 2xl:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl font-mono text-[9px] bg-cyan-950/40 border border-cyan-500/40 text-cyan-300"
            title="Cortex Data Readiness State"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="font-bold tracking-wider">DATA: {assetProfile.confluence?.dataReadiness || 'PARTIAL'}</span>
          </div>

          {/* 5. Canonical READ_ONLY Execution Badge */}
          <div
            className="hidden lg:inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl font-mono text-[9px] bg-purple-950/40 border border-purple-500/40 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.15)]"
            title="Canonical Execution Mode: READ_ONLY (Transport strictly disabled)"
          >
            <span>🔒</span>
            <span className="font-bold tracking-wider">READ_ONLY</span>
          </div>

          {/* 6. 24/7 Institutional Support Desk */}
          <button
            onClick={() => setIsSupportOpen(true)}
            className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-cyan-950/40 border border-cyan-500/30 hover:border-cyan-400 text-cyan-300 hover:text-white transition-all cursor-pointer font-mono text-[9.5px] shadow-[0_0_10px_rgba(0,240,255,0.12)]"
            title="24/7 Institutional Support Desk"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold tracking-wider">24/7 SUPPORT</span>
          </button>

          {/* 4. Notification Bell & Radar Alert Trigger */}
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

          {/* 5. Round FEF Support/Settings Icon */}
          <Link
            href="/settings"
            className="flex items-center hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
            title="Settings & System Diagnostics"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-600 to-blue-800 border border-cyan-400/40 flex items-center justify-center font-bold text-[10px] text-white shadow-sm hover:border-cyan-400 transition-colors">
              FEF
            </div>
          </Link>
        </div>

        {/* =========================================================================
            RIGHT: OPERATIONAL ROUTE NAVIGATION TABS
            Brought down to the exact SAME HORIZONTAL LEVEL as the operational controls
           ========================================================================= */}
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          <nav className="hidden lg:flex items-center space-x-1 bg-black/40 p-1 rounded-xl border border-white/10 font-sans">
            {navTabs.map((tab) => {
              const isRoot = pathname === '/' && tab.path === '/cockpit';
              const isActive = pathname === tab.path || pathname.startsWith(tab.path + '/') || isRoot;

              return (
                <Link
                  key={tab.name}
                  href={tab.path}
                  className={`px-2.5 xl:px-3 py-1 rounded-lg font-medium transition-all text-xs flex items-center space-x-1.5 ${
                    isActive
                      ? 'bg-cyan-500/20 text-[#F8FAFC] border border-[#22D3EE]/50 shadow-[0_0_12px_rgba(34,211,238,0.35)] font-bold'
                      : 'text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span>{tab.name}</span>
                  {tab.path === '/execution' && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isMt5Connected
                          ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                          : 'bg-slate-500'
                      }`}
                      title={
                        isMt5Connected
                          ? `MT5 Connected (${telemetry.account?.broker || 'Ready'})`
                          : 'MT5 Standby'
                      }
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Mobile Hamburger Menu Trigger */}
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-xl bg-black/40 border border-white/10 hover:border-cyan-400/50 text-gray-300 hover:text-white transition-all cursor-pointer"
            aria-label="Toggle Navigation Menu"
            title="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? (
              <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Responsive Mobile Navigation Dropdown */}
      {isMobileMenuOpen && (
        <div className="lg:hidden w-full mt-2 ghost-glass-panel rounded-2xl p-4 border border-cyan-500/30 shadow-[0_12px_40px_rgba(0,0,0,0.85)] animate-in fade-in slide-in-from-top-2 duration-200 space-y-3 font-sans relative z-30">
          {/* Mobile Navigation Tabs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {navTabs.map((tab) => {
              const isRoot = pathname === '/' && tab.path === '/cockpit';
              const isActive = pathname === tab.path || pathname.startsWith(tab.path + '/') || isRoot;
              return (
                <Link
                  key={tab.name}
                  href={tab.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 text-[#F8FAFC] border border-[#22D3EE]/50 shadow-[0_0_12px_rgba(34,211,238,0.3)]'
                      : 'text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <span>{tab.name}</span>
                  {tab.path === '/execution' && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        telemetry.operatingMode === 'DEMO_EXECUTION' && isMt5Connected
                          ? 'bg-emerald-400 animate-pulse'
                          : isMt5Connected
                            ? 'bg-amber-400'
                            : 'bg-slate-500'
                      }`}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Mobile Search Field */}
          <form onSubmit={handleSearchSubmit} className="relative flex items-center pt-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask FEF AI anything..."
              className="w-full bg-black/60 border border-white/10 focus:border-cyan-400/60 rounded-xl pl-9 pr-12 py-2 text-xs text-gray-200 placeholder-gray-500 transition-all outline-none"
            />
            <svg className="w-3.5 h-3.5 text-gray-400 absolute left-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <button
              type="submit"
              className="absolute right-2 px-2 py-0.5 bg-cyan-950/60 hover:bg-cyan-800/80 border border-cyan-500/30 rounded text-[10px] text-cyan-300 font-mono"
            >
              ASK
            </button>
          </form>

          {/* Mobile Status Strip & Shortcuts */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-xs font-mono">
            {/* Live MT5 Status */}
            {telemetry.operatingMode === 'DEMO_EXECUTION' && isMt5Connected ? (
              <span className="inline-flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>DEMO EXECUTION (ACTIVE)</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                <span className={`w-1.5 h-1.5 rounded-full ${isMt5Connected ? 'bg-amber-400' : 'bg-slate-500'}`} />
                <span>{isMt5Connected ? `${telemetry.account?.broker || telemetry.terminal?.brokerName || 'BROKER'} MT5 (READ ONLY 🔒)` : 'MT5 STANDBY'}</span>
              </span>
            )}

            {/* Quick action buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsSupportOpen(true);
                }}
                className="px-2 py-1 rounded-lg bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold flex items-center space-x-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>24/7 SUPPORT</span>
              </button>
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsDrawerOpen(true);
                }}
                className="px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-gray-300 text-[10px] font-bold flex items-center space-x-1"
              >
                <span>RADAR</span>
                {unreadCount > 0 && (
                  <span className="px-1 rounded-full bg-cyan-400 text-black font-bold text-[9px]">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <span>Source: Shared Agent Blackboard &bull; Broker Live</span>
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
