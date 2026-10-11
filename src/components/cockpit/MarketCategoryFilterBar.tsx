'use client';

import React, { useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { useMemberAuth } from '@/context/MemberAuthContext';

export const MARKET_CATEGORIES = [
  'ALL',
  'METALS',
  'FOREX',
  'INDICES',
  'COMMODITIES',
  'CRYPTO',
  'BROKER FEED',
] as const;

export const MarketCategoryFilterBar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const { categoryFilter, setCategoryFilter } = useActiveAsset();
  const { telemetry, isMt5Connected } = useMT5Telemetry();
  const { isMaster, isAuthenticated } = useMemberAuth();

  // If on a focused authentication page and not logged in, suppress filter bar to prevent visual noise/overlay feel
  const isAuthProtectedPage = pathname === '/member' || pathname === '/member/setup' || pathname === '/admin/members';
  if (!isAuthenticated && isAuthProtectedPage) {
    return null;
  }

  // Complete approved workspace destinations (No "MORE" dropdown - directly accessible)
  const navTabs = [
    { name: 'Cockpit', path: '/cockpit' },
    { name: 'Agents', path: '/agents' },
    { name: 'Markets', path: '/markets' },
    { name: 'TradingView', path: '/tradingview' },
    { name: 'Chart Analyzer', path: '/chart-analyzer' },
    { name: 'Execution', path: '/execution' },
    { name: 'Journal', path: '/journal' },
    { name: 'Settings', path: '/settings' },
    { name: 'Member', path: '/member' },
    ...(isMaster ? [{ name: 'Admin', path: '/admin/members' }] : []),
  ];

  const handleShortcutClick = (shortcutId: string) => {
    switch (shortcutId) {
      case 'WATCHLIST':
        setCategoryFilter('ALL');
        const overviewElem = document.getElementById('market-overview-card') || document.querySelector('section');
        overviewElem?.scrollIntoView({ behavior: 'smooth' });
        break;
      case 'CALENDAR':
        const eventsElem = document.getElementById('economic-events-card') || document.querySelector('[data-card="economic-events"]');
        if (eventsElem) {
          eventsElem.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.location.hash = '#economic-events';
        }
        break;
      case 'NEWS':
        const debateElem = document.getElementById('council-debate-card') || document.querySelector('[data-card="council-debate"]');
        if (debateElem) {
          debateElem.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.location.hash = '#news-debate';
        }
        break;
      case 'HEATMAP':
        const liquidityElem = document.getElementById('liquidity-map-card') || document.querySelector('[data-card="liquidity-map"]');
        if (liquidityElem) {
          liquidityElem.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.location.hash = '#liquidity-map';
        }
        break;
      case 'SIGNALS':
      case 'RADAR':
        const radarElem = document.getElementById('opportunity-radar-card') || document.querySelector('[data-card="opportunity-radar"]');
        if (radarElem) {
          radarElem.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.location.hash = '#opportunity-radar';
        }
        break;
    }
  };

  const handleCategoryClick = (cat: string) => {
    setCategoryFilter(cat);
    if (cat === 'ALL' || cat === 'BROKER FEED') {
      router.push('/markets');
    } else {
      router.push(`/markets?category=${cat.toLowerCase()}`);
    }
  };

  return (
    <div className="hidden lg:block w-full overflow-x-auto scrollbar-none py-0.5 text-center relative z-20">
      <nav
        className="inline-flex items-center justify-between gap-[2px] xl:gap-1 2xl:gap-1.5 bg-[#081224]/90 px-1.5 py-0.5 rounded-xl border border-white/10 text-[8px] xl:text-[8.5px] 2xl:text-[9.5px] font-sans uppercase tracking-tight whitespace-nowrap min-w-max text-left shadow-lg max-w-full"
        aria-label="Unified market filters and workspace navigation"
      >
        {/* Category Filters */}
        {MARKET_CATEGORIES.map((cat) => {
          const isSelected = categoryFilter === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => handleCategoryClick(cat)}
              className={`px-1 xl:px-1.5 py-0.5 rounded-md transition-all font-semibold whitespace-nowrap cursor-pointer inline-flex items-center gap-0.5 text-[8px] xl:text-[8.5px] 2xl:text-[9.5px] uppercase ${
                isSelected
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/60 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                  : 'text-gray-300 hover:text-white border border-transparent hover:bg-white/5'
              }`}
            >
              {cat === 'METALS' && <span className="text-amber-400 text-[8.5px] leading-none">▲</span>}
              {cat === 'FOREX' && <span className="text-cyan-400 text-[8.5px] leading-none">🌐</span>}
              {cat === 'INDICES' && <span className="text-blue-400 text-[8.5px] leading-none">📊</span>}
              {cat === 'COMMODITIES' && <span className="text-amber-500 text-[8.5px] leading-none">💧</span>}
              {cat === 'CRYPTO' && <span className="text-yellow-400 text-[8.5px] leading-none">₿</span>}
              {cat === 'BROKER FEED' && <span className="text-emerald-400 text-[8.5px] leading-none">📡</span>}
              <span>{cat}</span>
            </button>
          );
        })}

        {/* Subtle Vertical Divider */}
        <div className="h-3 w-[1px] bg-white/15 mx-0.5 flex-shrink-0" aria-hidden="true" />

        {/* Operational Shortcuts */}
        {/* 1. Watchlist */}
        <button
          type="button"
          onClick={() => handleShortcutClick('WATCHLIST')}
          className="px-1 xl:px-1.5 py-0.5 rounded-md transition-all text-gray-300 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 font-semibold whitespace-nowrap cursor-pointer inline-flex items-center gap-0.5 text-[8px] xl:text-[8.5px] 2xl:text-[9.5px] uppercase"
          title="Monitored Symbols & Watchlist"
        >
          <svg className="w-2.5 h-2.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          <span>Watchlist</span>
        </button>

        {/* 2. Calendar */}
        <button
          type="button"
          onClick={() => handleShortcutClick('CALENDAR')}
          className="px-1 xl:px-1.5 py-0.5 rounded-md transition-all text-gray-300 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 font-semibold whitespace-nowrap cursor-pointer inline-flex items-center gap-0.5 text-[8px] xl:text-[8.5px] 2xl:text-[9.5px] uppercase"
          title="Economic Calendar & Scheduled Event Buffers"
        >
          <svg className="w-2.5 h-2.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Calendar</span>
        </button>

        {/* 3. News */}
        <button
          type="button"
          onClick={() => handleShortcutClick('NEWS')}
          className="px-1 xl:px-1.5 py-0.5 rounded-md transition-all text-gray-300 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 font-semibold whitespace-nowrap cursor-pointer inline-flex items-center gap-0.5 text-[8px] xl:text-[8.5px] 2xl:text-[9.5px] uppercase"
          title="Continuous Market News & Inter-Agent Council Debates"
        >
          <svg className="w-2.5 h-2.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <span>News</span>
        </button>

        {/* 4. Heatmap */}
        <button
          type="button"
          onClick={() => handleShortcutClick('HEATMAP')}
          className="px-1 xl:px-1.5 py-0.5 rounded-md transition-all text-gray-300 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 font-semibold whitespace-nowrap cursor-pointer inline-flex items-center gap-0.5 text-[8px] xl:text-[8.5px] 2xl:text-[9.5px] uppercase"
          title="Market Session Liquidity Map & Cross-Asset Heatmap"
        >
          <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>Heatmap</span>
        </button>

        {/* 5. Signals / Radar */}
        <button
          type="button"
          onClick={() => handleShortcutClick('RADAR')}
          className="px-1 xl:px-1.5 py-0.5 rounded-md transition-all text-cyan-300 hover:text-white bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-500/30 font-semibold whitespace-nowrap cursor-pointer inline-flex items-center gap-0.5 text-[8px] xl:text-[8.5px] 2xl:text-[9.5px] uppercase shadow-[0_0_8px_rgba(6,182,212,0.2)]"
          title="Jump directly to Global Opportunity Radar"
        >
          <svg className="w-2.5 h-2.5 text-cyan-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>Radar</span>
        </button>

        {/* Subtle Visual Hierarchy Divider: RADAR | WORKSPACES */}
        <div className="h-3 w-[1px] bg-cyan-400/30 mx-0.5 flex-shrink-0 shadow-[0_0_6px_rgba(34,211,238,0.3)]" aria-hidden="true" />

        {/* Directly visible workspace links (No MORE dropdown) */}
        {navTabs.map((tab) => {
          const isRoot = pathname === '/' && tab.path === '/cockpit';
          const isActive = pathname === tab.path || (tab.path !== '/cockpit' && pathname?.startsWith(tab.path + '/')) || isRoot;

          return (
            <Link
              key={tab.name}
              href={tab.path}
              className={`px-1 xl:px-1.5 2xl:px-2 py-0.5 rounded-md transition-all whitespace-nowrap inline-flex items-center gap-0.5 flex-shrink-0 font-semibold text-[8px] xl:text-[8.5px] 2xl:text-[9.5px] uppercase ${
                isActive
                  ? 'bg-cyan-500/25 text-[#F8FAFC] border border-[#22D3EE]/60 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                  : 'text-[#94A3B8] hover:text-[#CBD5E1] hover:bg-white/5 border border-transparent'
              }`}
            >
              <span>{tab.name}</span>
              {tab.path === '/execution' && (
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
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
    </div>
  );
};
