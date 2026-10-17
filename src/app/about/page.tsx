'use client';

import React from 'react';
import Link from 'next/link';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { BRAND_CONFIG, SUPPORT_CONFIG, CORTEX_WHATSAPP_CONFIG } from '@/lib/config/support-config';

export default function AboutPage() {
  const whatsAppUrl = CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl();

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Subtle Aurora Ambient Lighting */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-32 left-1/3 w-[550px] h-[550px] bg-cyan-500/10 rounded-full blur-[150px]" />
        <div className="absolute top-1/2 -right-20 w-[450px] h-[450px] bg-blue-600/10 rounded-full blur-[170px]" />
      </div>

      <div className="relative z-10 flex flex-col p-2 sm:p-3 space-y-3 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />
        <MarketCategoryFilterBar />

        {/* Hero Section */}
        <header className="ghost-glass-panel rounded-2xl p-6 sm:p-10 border border-white/10 relative overflow-hidden">
          <div className="absolute -right-10 top-0 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-4xl space-y-3 relative z-10">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span>FEF TRADING SOLUTIONS &bull; INSTITUTIONAL ARCHITECTURE</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white uppercase">
              FEF CORTEX <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500">
                AUTONOMOUS TRADING INTELLIGENCE
              </span>
            </h1>

            <div className="text-xs sm:text-sm font-mono tracking-[0.2em] uppercase text-cyan-400/90 font-bold">
              {BRAND_CONFIG.tagline}
            </div>

            <p className="text-base sm:text-lg text-gray-300 leading-relaxed font-normal pt-2">
              FEF CORTEX is an AI-powered multi-agent market intelligence and execution-support operating system. Built for quantitative accuracy, CORTEX continuously evaluates global market structure across 26 institutional instruments, validates deterministic risk boundaries, and bridges to MetaTrader 5.
            </p>
          </div>
        </header>

        {/* Core Philosophy Section */}
        <section className="ghost-glass-panel rounded-2xl p-5 sm:p-8 border border-white/10 space-y-5">
          <div className="border-b border-white/10 pb-3">
            <div className="text-[11px] font-mono text-cyan-400 uppercase tracking-widest font-bold">The Foundation</div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
              Core Quantitative Philosophy
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-black/40 border border-cyan-500/30 space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center font-mono font-bold text-cyan-300 text-xs">
                01
              </div>
              <h3 className="text-base font-bold text-white uppercase font-sans tracking-wide">Data Before Decision</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Market opinions without fresh, validated tick provenance are strictly prohibited. Stale feeds, delayed heartbeats, or abnormal feed divergences force immediate fail-closed restriction.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-black/40 border border-blue-500/30 space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/40 flex items-center justify-center font-mono font-bold text-blue-300 text-xs">
                02
              </div>
              <h3 className="text-base font-bold text-white uppercase font-sans tracking-wide">Evidence Before Confidence</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Confidence is not an arbitrary percentage. It is an algorithmic synthesis of multi-agent blackboard debate, cross-timeframe alignment, and intermarket order flow confluence.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-black/40 border border-amber-500/30 space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center font-mono font-bold text-amber-300 text-xs">
                03
              </div>
              <h3 className="text-base font-bold text-white uppercase font-sans tracking-wide">Risk Before Execution</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Capital preservation supersedes profit pursuit. Invalidation levels are mandatory, position sizing is strictly bounded by configured risk policy limits (default 0.50% equity cap), and spread expansion buffers are mathematically enforced.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-black/40 border border-emerald-500/30 space-y-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center font-mono font-bold text-emerald-300 text-xs">
                04
              </div>
              <h3 className="text-base font-bold text-white uppercase font-sans tracking-wide">Human Authority Before Order</h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                Artificial intelligence is an analytical amplifier, not an unconstrained trading bot. The human operator retains exclusive, immutable authority over trade dispatch and capital risk.
              </p>
            </div>
          </div>
        </section>

        {/* The 32-Agent Swarm Architecture */}
        <section className="ghost-glass-panel rounded-2xl p-5 sm:p-8 border border-white/10 space-y-5">
          <div className="border-b border-white/10 pb-3">
            <div className="text-[11px] font-mono text-cyan-400 uppercase tracking-widest font-bold">Autonomous Intelligence</div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
              The 32-Agent Intelligence Architecture
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-black/40 border border-white/10 space-y-3">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono font-bold text-sm">
                <span>⚡</span>
                <span>15 CORE COUNCIL AGENTS</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                The primary deliberative council evaluates high-level market structure and systemic dynamics:
              </p>
              <ul className="text-xs text-gray-400 space-y-1.5 font-mono list-disc list-inside">
                <li>Macro &amp; Intermarket Liquidity Analyst</li>
                <li>Wyckoff Accumulation &amp; Distribution Specialist</li>
                <li>Smart Money Concepts (SMC) &amp; Liquidity Hunter</li>
                <li>ICT Fair Value Gap &amp; Order Block Specialist</li>
                <li>Multi-Timeframe Trend Structure Agent</li>
                <li>Central Bank Monetary Policy &amp; Rates Evaluator</li>
                <li>Risk Guardian Exposure &amp; Drawdown Sentinel</li>
                <li>And 8 additional specialized council nodes...</li>
              </ul>
            </div>

            <div className="p-5 rounded-xl bg-black/40 border border-white/10 space-y-3">
              <div className="flex items-center space-x-2 text-cyan-400 font-mono font-bold text-sm">
                <span>📈</span>
                <span>17 INSTITUTIONAL QUANT SPECIALISTS</span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Micro-structure and quantitative execution specialists running targeted statistical algorithms:
              </p>
              <ul className="text-xs text-gray-400 space-y-1.5 font-mono list-disc list-inside">
                <li>Order Flow Delta &amp; Tick Volume Imbalance</li>
                <li>Commitment of Traders (COT) Institutional Positioning</li>
                <li>Anchored VWAP &amp; Session Value Area Agent</li>
                <li>Market Regime &amp; Volatility Classifier</li>
                <li>Currency Strength Relative Matrix</li>
                <li>Economic News Wire Momentum &amp; Event Risk</li>
                <li>Monte Carlo Portfolio Risk Simulator</li>
                <li>And 10 additional quantitative market modules...</li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="p-4 rounded-xl bg-[#081224] border border-cyan-500/20 text-xs font-mono text-gray-300 leading-relaxed">
              <strong className="text-cyan-300">Central Synthesis Engine:</strong> All 32 agents post structured observations, evidence provenance tags (<code className="text-cyan-300">DATA</code>, <code className="text-cyan-300">ANALYSIS</code>, <code className="text-cyan-300">INFERENCE</code>), and confidence scores to a shared memory blackboard. The <code className="text-cyan-300">FINAL_DECISION</code> engine synthesizes these inputs into a unified posture with explicit invalidation coordinates.
            </div>
            <div className="p-4 rounded-xl bg-[#081224] border border-emerald-500/20 text-xs font-mono text-gray-300 leading-relaxed">
              <strong className="text-emerald-300">Registered vs Runtime State:</strong> While 32 distinct agents are registered across the CORTEX analytical pipeline (14 Council + 17 Specialists + 1 Final Decision Synthesizer), individual nodes only contribute when their domain prerequisites and live data feeds are verified. Runtime states dynamically distinguish whether each agent is READY, CONTRIBUTING, DEGRADED, or DATA LIMITED.
            </div>
          </div>
        </section>

        {/* Truthfulness & Safety Statement */}
        <section className="ghost-glass-panel rounded-2xl p-5 sm:p-8 border border-white/10 space-y-4">
          <div className="border-b border-white/10 pb-3">
            <div className="text-[11px] font-mono text-amber-400 uppercase tracking-widest font-bold">Safety &amp; Compliance</div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wide">
              Truth in Financial Intelligence
            </h2>
          </div>

          <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
            <p>
              Financial markets are inherently stochastic and subject to high volatility, slippage, and economic regime shifts. FEF CORTEX does not make claims of guaranteed profitability, unrealistic win rates, or predictive certainty.
            </p>
            <p>
              The platform is engineered as an institutional decision-support system. It provides quantitative structure, disciplined risk parameters, and verified broker telemetry to assist professional traders in executing their strategies with maximum rigor.
            </p>
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 font-mono text-gray-400 text-[11px]">
              {SUPPORT_CONFIG.safetyDisclaimer}
            </div>
          </div>
        </section>

        {/* Access & Community CTA */}
        <section className="ghost-glass-panel rounded-2xl p-6 sm:p-8 border border-cyan-500/30 bg-gradient-to-r from-[#081224] via-black to-cyan-950/20 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="space-y-1.5 text-center sm:text-left">
            <h3 className="text-lg sm:text-xl font-black text-white uppercase tracking-wide">
              Get Started with FEF CORTEX
            </h3>
            <p className="text-xs text-gray-300 max-w-xl">
              Explore the comprehensive operating guide or connect with our technical desk for onboarding, EA provisioning, and community access.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2.5">
            <Link
              href="/how-to-use"
              className="px-4 py-2.5 rounded-xl bg-black/60 hover:bg-white/10 border border-white/20 text-white font-mono text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            >
              HOW TO USE GUIDE &rarr;
            </Link>
            {whatsAppUrl ? (
              <a
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2"
              >
                <span>CONNECT ON WHATSAPP</span>
                <span>&rarr;</span>
              </a>
            ) : (
              <Link
                href="/community"
                className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs uppercase tracking-wider shadow-[0_0_20px_rgba(34,211,238,0.3)] transition-all whitespace-nowrap cursor-pointer flex items-center space-x-2"
              >
                <span>GET ACCESS &bull; COMMUNITY</span>
                <span>&rarr;</span>
              </Link>
            )}
          </div>
        </section>

        <MasterFooter />
      </div>
    </div>
  );
}

