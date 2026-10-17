'use client';

import React from 'react';
import Link from 'next/link';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { BRAND_CONFIG, SUPPORT_CONFIG, CORTEX_WHATSAPP_CONFIG } from '@/lib/config/support-config';

export default function CommunityPage() {
  const whatsAppUrl = CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl();

  const accessPillars = [
    {
      title: 'CORTEX Access',
      icon: '⚡',
      badge: 'CORE PLATFORM',
      description: 'Authorized license to the FEF CORTEX trading intelligence dashboard, Opportunity Radar, and 32-agent deliberation system.',
    },
    {
      title: 'Official EA Onboarding',
      icon: '🛡️',
      badge: 'VERIFIED SOFTWARE',
      description: 'Direct distribution of the authenticated Official FEF CORTEX EA with cryptographic integrity checksums.',
    },
    {
      title: 'Setup & Integration Support',
      icon: '🛠️',
      badge: 'TECHNICAL ASSIST',
      description: '1-on-1 guided assistance for configuring MT5 terminal WebRequests, endpoint allowances, and live telemetry feeds.',
    },
    {
      title: 'Continuous Swarm Updates',
      icon: '🧠',
      badge: 'INTELLIGENCE EVOLUTION',
      description: 'Ongoing algorithmic updates across the 14 Core Council, 17 Institutional Quant Specialist, and 1 Final Decision synthesis agents.',
    },
    {
      title: 'Quantitative Community',
      icon: '👥',
      badge: 'PRIVATE NETWORK',
      description: 'Connect with disciplined operators sharing market observations, macro regime context, and execution insights.',
    },
    {
      title: 'Educational Guidance',
      icon: '📘',
      badge: 'STRATEGY LIBRARY',
      description: 'Institutional playbooks explaining market microstructure, Wyckoff accumulation, and Risk Guardian mathematical constraints.',
    },
    {
      title: 'Technical Support Desk',
      icon: '🛎️',
      badge: 'ACTIVE DESK',
      description: 'Dedicated operational assistance for connectivity diagnostics, broker feed verification, and platform onboarding.',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 right-1/4 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[150px]" />
        <div className="absolute top-1/2 left-10 w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[170px]" />
      </div>

      <div className="relative z-10 flex flex-col p-2 sm:p-3 space-y-3 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />
        <MarketCategoryFilterBar />

        {/* Hero Section */}
        <header className="ghost-glass-panel rounded-2xl p-6 sm:p-10 border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-4xl space-y-3 relative z-10">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>FEF ECOSYSTEM ONBOARDING &bull; GET ACCESS</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white uppercase">
              JOIN THE <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-500">
                FEF CORTEX ECOSYSTEM
              </span>
            </h1>

            <p className="text-base sm:text-lg text-gray-300 leading-relaxed font-normal pt-1">
              FEF CORTEX is not an anonymous mass-market download. We onboard every operator into an institutional environment with verified MetaTrader 5 software, disciplined risk governance, and dedicated technical support.
            </p>
          </div>

          {/* Quick Action Banner */}
          <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="text-sm font-bold text-white">Direct WhatsApp Onboarding Desk</div>
              <p className="text-xs text-gray-400 font-mono">
                Message our specialists to initiate account verification and receive your approved MT5 EA.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {whatsAppUrl ? (
                <a
                  href={whatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2"
                >
                  <span>CONTACT FEF ON WHATSAPP</span>
                  <span>&rarr;</span>
                </a>
              ) : (
                <div className="flex flex-col items-center sm:items-end gap-1">
                  <a
                    href={`mailto:${SUPPORT_CONFIG.supportEmail}?subject=FEF%20CORTEX%20Onboarding%20Request`}
                    className="px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2"
                  >
                    <span>EMAIL ONBOARDING DESK</span>
                    <span>&rarr;</span>
                  </a>
                  <span className="text-[10px] font-mono text-amber-400">
                    Hotline status: {CORTEX_WHATSAPP_CONFIG.status} &bull; Email desk active
                  </span>
                </div>
              )}

              <Link
                href="/how-to-use"
                className="px-5 py-3 rounded-xl bg-black/60 hover:bg-white/10 border border-white/20 text-white font-mono text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
              >
                HOW TO USE CORTEX &rarr;
              </Link>
            </div>
          </div>
        </header>

        {/* 7 Pillars of FEF Access */}
        <section className="ghost-glass-panel rounded-2xl p-5 sm:p-8 border border-white/10 space-y-5">
          <div className="border-b border-white/10 pb-3">
            <div className="text-[11px] font-mono text-cyan-400 uppercase tracking-widest font-bold">What You Receive</div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
              The Seven Pillars of FEF CORTEX Access
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accessPillars.map((pillar, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 hover:border-cyan-500/30 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-xl">{pillar.icon}</span>
                  <span className="px-2 py-0.5 rounded text-[9.5px] font-mono font-bold bg-white/5 border border-white/10 text-cyan-300">
                    {pillar.badge}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white uppercase font-sans tracking-wide pt-1">
                  {pillar.title}
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {pillar.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* 4-Step Onboarding Process */}
        <section className="ghost-glass-panel rounded-2xl p-5 sm:p-8 border border-white/10 space-y-5">
          <div className="border-b border-white/10 pb-3">
            <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-widest font-bold">Guided Journey</div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
              How the Onboarding Flow Works
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-black/40 border border-emerald-500/30 space-y-2">
              <div className="text-emerald-400 font-mono font-bold text-sm">PHASE 01</div>
              <h3 className="font-bold text-white text-sm">Initial Inquiry</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Connect with our team via WhatsApp or email stating your trading experience, preferred broker, and primary asset focus.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-cyan-500/30 space-y-2">
              <div className="text-cyan-400 font-mono font-bold text-sm">PHASE 02</div>
              <h3 className="font-bold text-white text-sm">Broker Audit</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                We verify your broker contract specifications (spread, leverage, lot steps) against our canonical 26-market registry.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-blue-500/30 space-y-2">
              <div className="text-blue-400 font-mono font-bold text-sm">PHASE 03</div>
              <h3 className="font-bold text-white text-sm">EA Provisioning</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Receive the approved Official FEF CORTEX EA package configured with your secure endpoint authentication.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-purple-500/30 space-y-2">
              <div className="text-purple-400 font-mono font-bold text-sm">PHASE 04</div>
              <h3 className="font-bold text-white text-sm">Live Verification</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Attach EA to chart, confirm heartbeat synchronization in CORTEX Cockpit, and begin structured demo validation.
              </p>
            </div>
          </div>
        </section>

        {/* Support Channels & Institutional Directory */}
        <section className="ghost-glass-panel rounded-2xl p-5 sm:p-8 border border-white/10 space-y-5">
          <div className="border-b border-white/10 pb-3">
            <div className="text-[11px] font-mono text-cyan-400 uppercase tracking-widest font-bold">Directory</div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
              Institutional Support &amp; Assistance Channels
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {SUPPORT_CONFIG.channels.map((ch) => (
              <div key={ch.id} className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-lg">{ch.icon}</span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono border ${ch.badgeColor}`}>
                    {ch.statusLabel}
                  </span>
                </div>
                <h3 className="text-xs font-bold text-white uppercase">{ch.name}</h3>
                <p className="text-[11px] text-gray-300 leading-relaxed">{ch.description}</p>
                {ch.destination && (
                  <div className="pt-1">
                    <a
                      href={ch.destination}
                      className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors inline-flex items-center space-x-1"
                    >
                      <span>Connect Channel</span>
                      <span>&rarr;</span>
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="p-3.5 rounded-xl bg-black/30 border border-white/5 font-mono text-gray-400 text-[11px] leading-relaxed">
            {SUPPORT_CONFIG.safetyDisclaimer}
          </div>
        </section>

        <MasterFooter />
      </div>
    </div>
  );
}

