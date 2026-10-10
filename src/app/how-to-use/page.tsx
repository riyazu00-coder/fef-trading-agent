'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { MARKET_REGISTRY, MarketCategory } from '@/lib/registry/market-registry';
import { CORTEX_WHATSAPP_CONFIG, BRAND_CONFIG } from '@/lib/config/support-config';
import { MemberAccessGuard } from '@/components/common/MemberAccessGuard';

export default function HowToUsePage() {
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory | 'ALL'>('ALL');
  const whatsAppUrl = CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl();

  const registryAssets = Object.values(MARKET_REGISTRY);
  const filteredAssets = selectedCategory === 'ALL'
    ? registryAssets
    : registryAssets.filter((a) => a.category === selectedCategory);

  const quickNavItems = [
    { label: '01. Prerequisites', href: '#what-you-need' },
    { label: '02. Get Official EA', href: '#get-ea' },
    { label: '03. Install in MT5', href: '#install-ea' },
    { label: '04. Connect MT5', href: '#connect-mt5' },
    { label: '05. Cloud Architecture', href: '#cloud-architecture' },
    { label: '06. Account Modes', href: '#account-modes' },
    { label: '07. Cockpit Walkthrough', href: '#cockpit-walkthrough' },
    { label: '08. TradingView Workspace', href: '#tradingview-workspace' },
    { label: '09. How CORTEX Thinks', href: '#how-cortex-thinks' },
    { label: '10. Supported Markets', href: '#supported-markets' },
    { label: '11. Daily Workflow', href: '#daily-workflow' },
    { label: '12. Safety Invariants', href: '#best-practices' },
  ];

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 right-10 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[160px]" />
      </div>

      <div className="relative z-10 flex flex-col p-2 sm:p-3 space-y-3 w-full max-w-[1920px] mx-auto">
        {/* Navigation Layers */}
        <MasterTopNav />
        <MarketCategoryFilterBar />

        <MemberAccessGuard
          title="OPERATING GUIDE & ONBOARDING"
          description="Access to official operating documentation, architecture blueprints, and trading invariants requires member authentication."
        >
        {/* Hero Section */}
        <header className="ghost-glass-panel rounded-2xl p-6 sm:p-8 border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-400/5 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-4xl space-y-3 relative z-10">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>OFFICIAL OPERATING GUIDE &bull; ONBOARDING V2.2</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white uppercase">
              FEF CORTEX <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">HOW TO USE</span>
            </h1>
            <p className="text-base sm:text-lg text-gray-300 leading-relaxed font-normal">
              From autonomous multi-agent market intelligence to broker-connected execution. Learn how CORTEX analyzes cross-asset structure, validates deterministic risk boundaries, and bridges to MetaTrader 5.
            </p>
          </div>

          {/* Sticky/Scrollable Table of Contents Bar */}
          <nav aria-label="Table of contents" className="mt-6 pt-5 border-t border-white/10 flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
            <span className="text-xs font-mono font-bold text-gray-400 uppercase whitespace-nowrap mr-2">Jump to:</span>
            {quickNavItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-lg bg-black/40 hover:bg-cyan-950/50 border border-white/10 hover:border-cyan-400/50 text-xs font-mono text-gray-300 hover:text-cyan-200 whitespace-nowrap transition-all"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </header>

        {/* SECTION 01 — WHAT YOU NEED */}
        <section id="what-you-need" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center font-mono font-bold text-cyan-300 text-sm">
              01
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                What You Need &bull; Prerequisites
              </h2>
              <p className="text-xs text-gray-400 font-mono">Hardware, software, and broker infrastructure required before connecting</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="text-cyan-400 text-lg font-bold">1. FEF CORTEX Access</div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Authorized user access to the FEF CORTEX platform interface. Provided through official onboarding.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="text-cyan-400 text-lg font-bold">2. MetaTrader 5 Terminal</div>
              <p className="text-xs text-gray-300 leading-relaxed">
                A running MT5 terminal instance (Desktop 64-bit Build 4000+) on Windows, macOS (Wine/CrossOver), or VPS.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="text-cyan-400 text-lg font-bold">3. Supported Broker Account</div>
              <p className="text-xs text-gray-300 leading-relaxed">
                A compatible broker account (e.g. Exness, IC Markets) offering standard market symbol contracts. Not all proprietary or micro-lot brokers support live telemetry.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="text-cyan-400 text-lg font-bold">4. Official FEF CORTEX EA</div>
              <p className="text-xs text-gray-300 leading-relaxed">
                The authenticated Expert Advisor (Official FEF CORTEX EA) supplied exclusively through FEF onboarding.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="text-cyan-400 text-lg font-bold">5. Reliable Internet Connection</div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Low-latency, uninterrupted broadband or dedicated trading VPS connection ensuring steady heartbeat telemetry.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="text-cyan-400 text-lg font-bold">6. Modern Browser / Device</div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Chrome, Edge, Safari, or Firefox with hardware-accelerated canvas for real-time TradingView charts and visual analytics.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 02 — GET THE OFFICIAL EA */}
        <section id="get-ea" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center font-mono font-bold text-emerald-300 text-sm">
              02
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Get the Official EA &bull; Onboarding Verification
              </h2>
              <p className="text-xs text-gray-400 font-mono">Authentic software distribution and institutional account verification policy</p>
            </div>
          </div>

          <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-200/90 leading-relaxed">
            <span className="font-bold uppercase tracking-wider text-amber-300 mr-1">&#9888; IMPORTANT SECURITY POLICY:</span>
            To prevent counterfeit binary distribution and preserve capital safety, FEF CORTEX does NOT provide public or unauthenticated direct file downloads. The official MT5 Bridge EA is distributed strictly through direct onboarding with our quantitative support desk.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-xs space-y-1">
              <div className="text-cyan-400 font-bold">Step 1: Contact Desk</div>
              <p className="text-gray-400 text-[11px]">Initiate your onboarding request with FEF Trading Solutions on WhatsApp.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-xs space-y-1">
              <div className="text-cyan-400 font-bold">Step 2: Account Audit</div>
              <p className="text-gray-400 text-[11px]">Our team verifies broker compatibility, contract specs, and demo authorization.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-xs space-y-1">
              <div className="text-cyan-400 font-bold">Step 3: Setup Assist</div>
              <p className="text-gray-400 text-[11px]">Guided walkthrough for WebRequest security allowances in your MT5 terminal.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-xs space-y-1">
              <div className="text-cyan-400 font-bold">Step 4: Receive EA</div>
              <p className="text-gray-400 text-[11px]">Receive the authenticated version of the Official FEF CORTEX EA.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-xs space-y-1">
              <div className="text-cyan-400 font-bold">Step 5: Connect</div>
              <p className="text-gray-400 text-[11px]">Attach to chart and observe real-time telemetry stream into your Cockpit.</p>
            </div>
          </div>

          {/* WhatsApp CTA Action */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gradient-to-r from-emerald-950/40 via-cyan-950/30 to-black p-4 rounded-xl border border-emerald-500/30">
            <div className="space-y-1 text-center sm:text-left">
              <div className="text-sm font-bold text-white flex items-center justify-center sm:justify-start space-x-2">
                <span>💬</span>
                <span>Ready to onboard with FEF CORTEX?</span>
              </div>
              <p className="text-xs text-gray-300">
                Connect with our technical support desk to receive the official MT5 Bridge EA and onboarding assistance.
              </p>
            </div>

            {whatsAppUrl ? (
              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2"
              >
                <span>GET CORTEX ACCESS ON WHATSAPP</span>
                <span>&rarr;</span>
              </a>
            ) : (
              <div className="flex flex-col items-center sm:items-end gap-1">
                <Link
                  href="/community"
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2"
                >
                  <span>REQUEST ONBOARDING ACCESS</span>
                  <span>&rarr;</span>
                </Link>
                <span className="text-[10px] font-mono text-amber-400/90">
                  Hotline status: {CORTEX_WHATSAPP_CONFIG.status} &bull; Check /community
                </span>
              </div>
            )}
          </div>
        </section>

        {/* SECTION 03 — INSTALL THE EA */}
        <section id="install-ea" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center font-mono font-bold text-blue-300 text-sm">
              03
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Install the EA &bull; MetaTrader 5 Directory
              </h2>
              <p className="text-xs text-gray-400 font-mono">Standard operating procedure for adding Expert Advisors to MT5</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div className="space-y-3 p-4 rounded-xl bg-black/40 border border-white/10">
              <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wide">Installation Steps</h3>
              <ol className="space-y-2 text-gray-300 list-decimal list-inside leading-relaxed">
                <li>Launch your MetaTrader 5 terminal.</li>
                <li>In top menu, select <strong className="text-white">File &rarr; Open Data Folder</strong>.</li>
                <li>Open the <code className="text-cyan-300">MQL5</code> directory, then open the <code className="text-cyan-300">Experts</code> folder.</li>
                <li>Copy and paste the approved Official FEF CORTEX EA file here.</li>
                <li>Return to MT5. In Navigator pane (Ctrl+N), right-click <strong className="text-white">Expert Advisors</strong> and click <strong className="text-white">Refresh</strong>.</li>
                <li>Attach the EA to any active chart (e.g. EURUSD or XAUUSD).</li>
              </ol>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-black/40 border border-white/10">
              <h3 className="text-sm font-bold text-cyan-300 uppercase tracking-wide">Terminal Permissions &bull; Critical</h3>
              <p className="text-gray-300 leading-relaxed">
                The EA requires network communication permission to push broker telemetry to the CORTEX bridge:
              </p>
              <ul className="space-y-2 text-gray-300 list-disc list-inside leading-relaxed">
                <li>Go to <strong className="text-white">Tools &rarr; Options &rarr; Expert Advisors</strong>.</li>
                <li>Check <strong className="text-emerald-400">Allow Algo Trading</strong>.</li>
                <li>Check <strong className="text-emerald-400">Allow WebRequest for listed URL</strong>.</li>
                <li>Add your designated CORTEX bridge endpoint provided by FEF onboarding.</li>
                <li>Click <strong className="text-white">OK</strong> and ensure the graduation cap icon on chart is active.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* SECTION 04 — CONNECT MT5 TO CORTEX */}
        <section id="connect-mt5" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-400/40 flex items-center justify-center font-mono font-bold text-purple-300 text-sm">
              04
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Connect MT5 to CORTEX &bull; Telemetry Flow
              </h2>
              <p className="text-xs text-gray-400 font-mono">End-to-end data pipeline from broker quotes to cockpit intelligence</p>
            </div>
          </div>

          {/* Visual Flow diagram */}
          <div className="p-4 rounded-xl bg-black/50 border border-cyan-500/20 overflow-x-auto font-mono text-xs">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 min-w-[600px] text-center">
              <div className="p-3 rounded-lg bg-slate-900 border border-white/10 w-full sm:w-auto">
                <div className="text-[10px] text-gray-400 uppercase">Input Terminal</div>
                <div className="font-bold text-white text-xs">METATRADER 5</div>
              </div>
              <div className="text-cyan-400 font-bold">&rarr;</div>
              <div className="p-3 rounded-lg bg-cyan-950/60 border border-cyan-500/40 w-full sm:w-auto">
                <div className="text-[10px] text-cyan-400 uppercase">MQL5 Agent</div>
                <div className="font-bold text-cyan-200 text-xs">FEF CORTEX EA</div>
              </div>
              <div className="text-cyan-400 font-bold">&rarr;</div>
              <div className="p-3 rounded-lg bg-blue-950/60 border border-blue-500/40 w-full sm:w-auto">
                <div className="text-[10px] text-blue-400 uppercase">Transport Layer</div>
                <div className="font-bold text-blue-200 text-xs">SECURE BRIDGE</div>
              </div>
              <div className="text-cyan-400 font-bold">&rarr;</div>
              <div className="p-3 rounded-lg bg-purple-950/60 border border-purple-500/40 w-full sm:w-auto">
                <div className="text-[10px] text-purple-400 uppercase">Synthesis OS</div>
                <div className="font-bold text-purple-200 text-xs">FEF CORTEX</div>
              </div>
              <div className="text-cyan-400 font-bold">&rarr;</div>
              <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/40 w-full sm:w-auto">
                <div className="text-[10px] text-emerald-400 uppercase">Output Layer</div>
                <div className="font-bold text-emerald-200 text-xs">INTELLIGENCE</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-black/40 border border-emerald-500/30">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>CONNECTED</span>
              </div>
              <p className="text-gray-400 text-[11px] mt-1">
                Active broker ticks, account equity, and open positions syncing smoothly within latency tolerance.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/10">
              <div className="flex items-center space-x-2 text-gray-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                <span>DISCONNECTED</span>
              </div>
              <p className="text-gray-400 text-[11px] mt-1">
                Bridge service idle or EA not running. Cockpit falls back to independent market data feeds.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-amber-500/30">
              <div className="flex items-center space-x-2 text-amber-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>DATA LIMITED</span>
              </div>
              <p className="text-gray-400 text-[11px] mt-1">
                Broker quotes active, but instrument lacks historical bar depth or tick volume resolution.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-rose-500/30">
              <div className="flex items-center space-x-2 text-rose-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span>ACCOUNT UNKNOWN</span>
              </div>
              <p className="text-gray-400 text-[11px] mt-1">
                Account verification failed or unregistered broker ID. Execution gate is completely blocked.
              </p>
            </div>
          </div>

          <div className="text-[11px] font-mono text-gray-400 bg-black/30 p-3 rounded-xl border border-white/5">
            <strong className="text-cyan-300">Notice:</strong> Establishing a telemetry connection alone does NOT enable trade execution. Execution requires strict mode authorization, Risk Guardian compliance, and explicit human confirmation.
          </div>
        </section>

        {/* SECTION 05 — SECURE CLOUD & COMMUNITY ARCHITECTURE */}
        <section id="cloud-architecture" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center font-mono font-bold text-cyan-300 text-sm">
              05
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Secure Cloud &amp; Community Architecture &bull; SaaS Platform
              </h2>
              <p className="text-xs text-gray-400 font-mono">Modern cloud topology connecting distributed institutional traders to high-availability AI intelligence</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 font-mono text-[10px] font-bold border border-cyan-500/40">
                ZERO-OVERHEAD CLOUD
              </div>
              <h3 className="text-sm font-bold text-white">Browser-First Intelligence</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                FEF CORTEX runs entirely in the cloud as a high-performance web application. There are no heavy background engines, manual Python runtimes, or local databases for the user to manage. Access your complete multi-asset cockpit from any modern browser.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 font-mono text-[10px] font-bold border border-purple-500/40">
                SECURE TELEMETRY RELAY
              </div>
              <h3 className="text-sm font-bold text-white">Cryptographic Endpoint Security</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Your MetaTrader 5 terminal communicates with CORTEX via authenticated, HTTPS-grade WebRequest relays. Telemetry streams push broker tick updates, margins, and active positions without exposing open inbound listening ports on your workstation.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/40">
                CONTROLLED COMMUNITY ONBOARDING
              </div>
              <h3 className="text-sm font-bold text-white">Desk-Verified Access</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                To guarantee execution safety and prevent unauthorized software tampering, every user is provisioned through direct quantitative onboarding. Our desk ensures your broker contract specs, symbol naming, and leverage are fully validated before live connection.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/20 via-black to-blue-950/20 border border-cyan-500/20 text-xs font-mono space-y-2">
            <div className="text-cyan-300 font-bold uppercase tracking-wider flex items-center space-x-2">
              <span>🛡️</span>
              <span>BROKER TELEMETRY AS AUTHORITATIVE SOURCE OF TRUTH</span>
            </div>
            <p className="text-gray-300 leading-relaxed">
              In FEF CORTEX, client-side UI labels never override actual broker telemetry. If the MT5 terminal reports a Live account, CORTEX immediately enforces the immutable capital lock regardless of local settings. Live broker BID/ASK prices serve as the sole authoritative price reference for all risk bounds, stop losses, and order checks.
            </p>
          </div>
        </section>

        {/* SECTION 06 — ACCOUNT & EXECUTION MODES */}
        <section id="account-modes" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center font-mono font-bold text-amber-300 text-sm">
              06
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Account &amp; Execution Modes &bull; Safety Governance
              </h2>
              <p className="text-xs text-gray-400 font-mono">Understanding READ ONLY, DEMO EXECUTION, and REAL ACCOUNT hard locks</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold">
                READ ONLY MODE
              </div>
              <h3 className="text-sm font-bold text-white">Analysis &amp; Telemetry Only</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Default operating posture. Full access to Opportunity Radar, 32-Agent Council debates, and live broker quotes. No order dispatch capability exists; all trade transport routes are deactivated.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/40">
                DEMO EXECUTION
              </div>
              <h3 className="text-sm font-bold text-amber-200">Controlled Demo Validation</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Active on verified MT5 Demo accounts. Enables One-Click Guard testing with 2-second confirmation window, lot-size bounds, and SL/TP enforcement. Intended strictly for strategy validation and operator training.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/40 space-y-2">
              <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 font-mono text-[10px] font-bold border border-rose-500/40">
                REAL ACCOUNT &bull; HARD LOCKED 🔒
              </div>
              <h3 className="text-sm font-bold text-rose-200">Production Capital Safety Lock</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                FEF CORTEX enforces an immutable server-side hard lock (<code className="text-rose-300">realExecutionLocked: true</code>) on live accounts. Live order placement is blocked by policy to prevent accidental drawdown.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 07 — USING THE COCKPIT */}
        <section id="cockpit-walkthrough" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-6 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center font-mono font-bold text-cyan-300 text-sm">
              07
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Using the Cockpit &bull; Component Walkthrough
              </h2>
              <p className="text-xs text-gray-400 font-mono">Deep guide to interpreting every deck and diagnostic panel</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Opportunity Radar */}
            <div id="opportunity-radar" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">Global Opportunity Radar</h3>
                <span className="text-[10px] font-mono text-gray-500">#opportunity-radar</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Monitors all 26 supported markets continuously. Ranks assets based on multi-factor alignment, multi-timeframe volume delta, and Council consensus. Assets with the highest setup readiness appear in the High Priority Attention Queue.
              </p>
            </div>

            {/* Current AI Decision */}
            <div id="ai-decision" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">Current AI Decision</h3>
                <span className="text-[10px] font-mono text-gray-500">#ai-decision</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Synthesizes the leading bias (BULLISH, BEARISH, or NEUTRAL), Council confidence percentage, setup lifecycle state (EMERGING, CONFIRMED, EXHAUSTING), and mathematical invalidation price. AI outputs represent probabilistic evidence, not guaranteed financial advice.
              </p>
            </div>

            {/* Agent Intelligence */}
            <div id="agents" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">Agent Intelligence (32 Agents)</h3>
                <span className="text-[10px] font-mono text-gray-500">#agents</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Comprises <strong>15 Core Council Agents</strong> (Macro, Wyckoff, SMC, Risk Guardian, etc.) and <strong>17 Institutional Quant Specialists</strong> (Order Flow Delta, COT, Anchored VWAP, Currency Strength, Central Bank Policy, etc.). Agents debate on a shared blackboard; <code className="text-cyan-300">FINAL_DECISION</code> is the synthesis authority.
              </p>
            </div>

            {/* Market / Session Intelligence */}
            <div id="market-session" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">Market Session &amp; Liquidity Map</h3>
                <span className="text-[10px] font-mono text-gray-500">#market-session</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Tracks active institutional sessions (London, New York, Tokyo, Sydney) and high-liquidity overlaps. Enforces session trading hours per asset (e.g. 24/5 Forex vs NYMEX Energy vs 24/7 Crypto).
              </p>
            </div>

            {/* Risk & Position Calculator */}
            <div id="risk-calculator" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">Risk &amp; Position Calculator</h3>
                <span className="text-[10px] font-mono text-gray-500">#risk-calculator</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Computes optimal lot sizes derived from real broker contract specifications (tick value, lot step, leverage) and live BID/ASK prices. Pegs risk to configured portfolio policy limits (default 0.50% equity cap) with deterministic Stop Loss and Multi-Target Take Profits.
              </p>
            </div>

            {/* TradingView */}
            <div id="tradingview" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">TradingView Advanced Chart</h3>
                <span className="text-[10px] font-mono text-gray-500">#tradingview</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Integrated interactive TradingView workspace accessible inline or as a full-screen dedicated workbench (<code className="text-cyan-300">/tradingview</code>). Features institutional indicators, drawing tools, and multi-timeframe switching.
              </p>
            </div>

            {/* Chart Analyzer */}
            <div id="chart-analyzer" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">Chart Vision Analyzer</h3>
                <span className="text-[10px] font-mono text-gray-500">#chart-analyzer</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Multi-modal vision analysis module. Evaluates candle patterns, fair value gaps (FVG), liquidity pools, and support/resistance invalidation levels with automated visual markup.
              </p>
            </div>

            {/* Execution Control */}
            <div id="execution" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">Execution Control Card</h3>
                <span className="text-[10px] font-mono text-gray-500">#execution</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Displays real-time MT5 account telemetry, balance, equity, margin level, open positions, floating PnL, and execution dispatch state. Operates under One-Click Guard safety timers.
              </p>
            </div>

            {/* Journal */}
            <div id="journal" className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-2 scroll-mt-24 md:col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono">Institutional Trade Journal</h3>
                <span className="text-[10px] font-mono text-gray-500">#journal</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Post-trade review and accountability ledger recording setup thesis, agent consensus at entry, R:R outcomes, execution slippage, and performance analytics across symbols and sessions.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 08 — TRADINGVIEW WORKSPACE & 11-STEP MANUAL EXECUTION WORKFLOW */}
        <section id="tradingview-workspace" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-6 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center font-mono font-bold text-blue-300 text-sm">
              08
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                TradingView Workspace &bull; 11-Step Manual Execution Workflow
              </h2>
              <p className="text-xs text-gray-400 font-mono">Dedicated full-screen manual workstation at /tradingview with institutional risk-gated execution</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 p-5 rounded-xl bg-black/40 border border-white/10 space-y-3">
              <h3 className="text-sm font-bold text-cyan-300 uppercase font-mono flex items-center space-x-2">
                <span>📈</span>
                <span>Dedicated TradingView Manual Workstation</span>
              </h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                FEF CORTEX provides a dedicated, full-screen manual trading workspace at <Link href="/tradingview" className="text-cyan-400 underline font-mono">/tradingview</Link>. Designed specifically for operators who demand unfiltered chart analysis without dashboard clutter, this workstation integrates high-resolution TradingView technical charting with live MT5 broker telemetry and manual BUY/SELL execution controls.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 text-xs font-mono text-gray-300">
                <div className="p-2.5 rounded-lg bg-black/60 border border-white/5">
                  <span className="text-cyan-400 font-bold">✓ Multi-Asset Selector:</span> Switch seamlessly across all 26 registered currency pairs, metals, commodities, indices, and crypto.
                </div>
                <div className="p-2.5 rounded-lg bg-black/60 border border-white/5">
                  <span className="text-cyan-400 font-bold">✓ Broker Price Stream:</span> Real-time BID and ASK prices streamed directly from your connected MT5 terminal.
                </div>
                <div className="p-2.5 rounded-lg bg-black/60 border border-white/5">
                  <span className="text-cyan-400 font-bold">✓ Risk-Gated Order Bar:</span> Position size, Stop Loss, and Take Profit calculations enforced prior to execution.
                </div>
                <div className="p-2.5 rounded-lg bg-black/60 border border-white/5">
                  <span className="text-cyan-400 font-bold">✓ Capital Lock Guard:</span> REAL accounts remain permanently protected (<code className="text-rose-300">realExecutionLocked: true</code>).
                </div>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-black/40 border border-cyan-500/20 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="text-xs font-mono text-cyan-400 font-bold uppercase">Workstation Quick Access</div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Open the dedicated TradingView workspace directly from the Top Navigation or use the direct route:
                </p>
              </div>
              <Link
                href="/tradingview"
                className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider text-center transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)] block"
              >
                OPEN TRADINGVIEW WORKSTATION &rarr;
              </Link>
            </div>
          </div>

          {/* 11-Step Manual Execution Workflow */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white uppercase font-mono tracking-wider">
              The 11-Step Disciplined Manual Execution Workflow
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-xs">
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 1: Market Selection</div>
                <p className="text-gray-400 text-[11px]">Select target asset from the 26-market selector to sync chart symbol and contract specs.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 2: Structure Analysis</div>
                <p className="text-gray-400 text-[11px]">Inspect higher-timeframe market structure, swing highs/lows, and institutional liquidity pools.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 3: Agent Consensus Check</div>
                <p className="text-gray-400 text-[11px]">Cross-check setup thesis against CORTEX 32-Agent Council consensus bias and confidence score.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 4: Spread &amp; Latency Audit</div>
                <p className="text-gray-400 text-[11px]">Verify live broker BID/ASK spread is within acceptable institutional threshold.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 5: Position Sizing</div>
                <p className="text-gray-400 text-[11px]">Calculate exact lot size derived from account equity and configured risk policy limits.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 6: Set SL &amp; TP Boundaries</div>
                <p className="text-gray-400 text-[11px]">Define mathematical Stop Loss at structural invalidation point with minimum 1:1.5 reward ratio.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 7: Pre-Flight Safety Verification</div>
                <p className="text-gray-400 text-[11px]">Verify One-Click Guard parameters and confirm demo environment authorization.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 8: Initiate Manual Order</div>
                <p className="text-gray-400 text-[11px]">Click BUY or SELL order button within the manual trading controls toolbar.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 9: Confirmation Window</div>
                <p className="text-gray-400 text-[11px]">Inspect two-second safety confirmation modal detailing exact lot, price, SL, and TP parameters.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 10: Telemetry Acknowledgment</div>
                <p className="text-gray-400 text-[11px]">Monitor MT5 execution ticket acknowledgment, fill price, and slippage telemetry.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="text-cyan-400 font-bold">STEP 11: Position Tracking &amp; Journal</div>
                <p className="text-gray-400 text-[11px]">Track active position in Execution card and log trade reasoning into the CORTEX Journal.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 09 — HOW CORTEX THINKS */}
        <section id="how-cortex-thinks" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center font-mono font-bold text-emerald-300 text-sm">
              09
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                How CORTEX Thinks &bull; Quantitative Reasoning Pipeline
              </h2>
              <p className="text-xs text-gray-400 font-mono">The 9-stage deterministic pipeline from raw ticks to executed orders</p>
            </div>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-black/40 border border-cyan-500/30">
                <div className="text-cyan-400 font-bold">1. Market Data Ingestion</div>
                <p className="text-gray-400 text-[11px] mt-1">Direct broker BID/ASK ticks + M1/M5 historical bars + tick volume.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-cyan-500/30">
                <div className="text-cyan-400 font-bold">2. Data Sentinel Validation</div>
                <p className="text-gray-400 text-[11px] mt-1">Staleness checks, heartbeat audit, and cross-feed divergence verification.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-cyan-500/30">
                <div className="text-cyan-400 font-bold">3. 32-Agent Swarm Debate</div>
                <p className="text-gray-400 text-[11px] mt-1">Parallel evaluation across technical, macro, order flow, COT, and news domains.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-black/40 border border-blue-500/30">
                <div className="text-blue-400 font-bold">4. Conflict &amp; Evidence Audit</div>
                <p className="text-gray-400 text-[11px] mt-1">Detecting inter-agent tensions, opposing risks, and regime contradictions.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-blue-500/30">
                <div className="text-blue-400 font-bold">5. Final Decision Synthesis</div>
                <p className="text-gray-400 text-[11px] mt-1">Weighted Bayesian consensus posture, confidence score, and invalidation.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-blue-500/30">
                <div className="text-blue-400 font-bold">6. Risk Guardian Gating</div>
                <p className="text-gray-400 text-[11px] mt-1">Configured risk policy limits (default 0.50% equity cap), spread expansion gates, and economic news buffers.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-black/40 border border-emerald-500/30">
                <div className="text-emerald-400 font-bold">7. Execution Readiness Audit</div>
                <p className="text-gray-400 text-[11px] mt-1">Broker lot step verification, margin buffer calculation, and session state.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-emerald-500/30">
                <div className="text-emerald-400 font-bold">8. Human Authority Confirmation</div>
                <p className="text-gray-400 text-[11px] mt-1">Operator inspects the complete trade thesis and confirms trade intent.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-emerald-500/30">
                <div className="text-emerald-400 font-bold">9. Broker Execution Bridge</div>
                <p className="text-gray-400 text-[11px] mt-1">Authorized transmission to MT5 EA with post-fill verification.</p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 10 — SUPPORTED MARKETS */}
        <section id="supported-markets" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center font-mono font-bold text-cyan-300 text-sm">
              10
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Supported Markets &bull; Canonical Asset Registry
              </h2>
              <p className="text-xs text-gray-400 font-mono">26 institutional instruments actively monitored across 5 asset classes</p>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
            {(['ALL', 'METALS', 'FOREX', 'INDICES', 'COMMODITIES', 'CRYPTO'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg transition-all font-bold cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/60 shadow-[0_0_8px_rgba(0,240,255,0.3)]'
                    : 'bg-black/40 text-gray-400 hover:text-white border border-white/10'
                }`}
              >
                {cat} ({cat === 'ALL' ? registryAssets.length : registryAssets.filter((a) => a.category === cat).length})
              </button>
            ))}
          </div>

          {/* Registry Table */}
          <div className="rounded-xl border border-white/10 overflow-hidden bg-black/40">
            <div className="overflow-x-auto max-h-96 scrollbar-thin">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-[#081224] text-gray-400 border-b border-white/10 sticky top-0 z-10 text-[11px]">
                  <tr>
                    <th className="p-2.5">SYMBOL</th>
                    <th className="p-2.5">NAME</th>
                    <th className="p-2.5">CATEGORY</th>
                    <th className="p-2.5">PRECISION</th>
                    <th className="p-2.5">PIP SIZE</th>
                    <th className="p-2.5">SESSION MODEL</th>
                    <th className="p-2.5">FEED STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-gray-300">
                  {filteredAssets.map((asset) => (
                    <tr key={asset.symbol} className="hover:bg-cyan-950/20 transition-colors">
                      <td className="p-2.5 font-bold text-cyan-300">{asset.symbol}</td>
                      <td className="p-2.5 text-gray-200">{asset.displayName}</td>
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-gray-300">
                          {asset.category}
                        </span>
                      </td>
                      <td className="p-2.5">{asset.decimalPrecision} decimals</td>
                      <td className="p-2.5">{asset.pipSize}</td>
                      <td className="p-2.5 text-gray-400 text-[11px]">{asset.sessionModel}</td>
                      <td className="p-2.5">
                        <span className="inline-flex items-center space-x-1 text-emerald-400 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>{asset.feedStatus}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* SECTION 11 — DAILY WORKFLOW */}
        <section id="daily-workflow" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center font-mono font-bold text-blue-300 text-sm">
              11
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Daily Workflow &bull; 12-Step Disciplined Process
              </h2>
              <p className="text-xs text-gray-400 font-mono">Structured institutional routine for every trading session</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 1: Open CORTEX</div>
              <p className="text-gray-400 text-[11px]">Load Cockpit dashboard and review high-level platform status.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 2: Confirm MT5 State</div>
              <p className="text-gray-400 text-[11px]">Verify MT5 status badge is CONNECTED and account equity matches terminal.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 3: Check Sentinel</div>
              <p className="text-gray-400 text-[11px]">Confirm Data Sentinel reports HEALTHY with zero tick latency or corruption alerts.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 4: Review Radar</div>
              <p className="text-gray-400 text-[11px]">Inspect Global Opportunity Radar for high-confluence setups across 26 assets.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 5: Select Asset</div>
              <p className="text-gray-400 text-[11px]">Select instrument to load its dedicated 32-agent blackboard memory.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 6: Review AI Decision</div>
              <p className="text-gray-400 text-[11px]">Inspect consensus bias, confidence, invalidation level, and opposing risks.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 7: Inspect Charts</div>
              <p className="text-gray-400 text-[11px]">Open TradingView or Chart Analyzer to visually verify key levels and structure.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 8: Size Position</div>
              <p className="text-gray-400 text-[11px]">Run Full Smart Position Calculator to peg risk strictly within configured portfolio policy limits (default 0.50% cap).</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 9: Execution Readiness</div>
              <p className="text-gray-400 text-[11px]">Verify spread expansion buffers, session timing, and demo armed status.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 10: Human Decision</div>
              <p className="text-gray-400 text-[11px]">Human operator evaluates complete qualitative thesis and chooses whether to proceed.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 11: Monitor Position</div>
              <p className="text-gray-400 text-[11px]">Track floating PnL, margin utilization, and stop loss protection in Execution Card.</p>
            </div>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
              <div className="text-cyan-400 font-bold">STEP 12: Review in Journal</div>
              <p className="text-gray-400 text-[11px]">Log post-trade outcome in Journal for ongoing discipline and performance metrics.</p>
            </div>
          </div>
        </section>

        {/* SECTION 12 — BEST PRACTICES & SAFETY INVARIANTS */}
        <section id="best-practices" className="ghost-glass-panel rounded-2xl p-5 sm:p-6 border border-white/10 space-y-4 scroll-mt-20">
          <div className="flex items-center space-x-3 border-b border-white/10 pb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 border border-rose-400/40 flex items-center justify-center font-mono font-bold text-rose-300 text-sm">
              12
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black text-white uppercase tracking-wider">
                Safety Invariants &bull; Institutional Principles
              </h2>
              <p className="text-xs text-gray-400 font-mono">Immutable mathematical laws governing every decision inside CORTEX</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-xl bg-black/40 border border-cyan-500/30 space-y-2">
              <div className="text-cyan-400 font-mono font-bold uppercase text-[11px]">Principle I</div>
              <h3 className="font-bold text-white text-sm">Data Before Decision</h3>
              <p className="text-gray-300 leading-relaxed text-[11px]">
                No agent is permitted to form an opinion without fresh, verified market inputs. Stale or corrupted ticks force immediate fail-closed restriction.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-blue-500/30 space-y-2">
              <div className="text-blue-400 font-mono font-bold uppercase text-[11px]">Principle II</div>
              <h3 className="font-bold text-white text-sm">Evidence Before Confidence</h3>
              <p className="text-gray-300 leading-relaxed text-[11px]">
                Confidence scores are mathematically derived from cross-domain confluence (technical, macro, volume delta, news). High confidence requires verifiable multi-source alignment.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-amber-500/30 space-y-2">
              <div className="text-amber-400 font-mono font-bold uppercase text-[11px]">Principle III</div>
              <h3 className="font-bold text-white text-sm">Risk Before Execution</h3>
              <p className="text-gray-300 leading-relaxed text-[11px]">
                Stop losses are mandatory on every calculation. Position sizing is capped at configured risk policy limits (default 0.50% equity cap). Trades with invalidation-to-reward ratios below 1:1.5 are rejected.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-emerald-500/30 space-y-2">
              <div className="text-emerald-400 font-mono font-bold uppercase text-[11px]">Principle IV</div>
              <h3 className="font-bold text-white text-sm">Human Authority Before Order</h3>
              <p className="text-gray-300 leading-relaxed text-[11px]">
                Autonomous intelligence generates probabilities and trade parameters. The human operator retains exclusive, final authority to confirm or cancel order transmission.
              </p>
            </div>
          </div>
        </section>
        </MemberAccessGuard>

        {/* Global Footer */}
        <MasterFooter />
      </div>
    </div>
  );
}

