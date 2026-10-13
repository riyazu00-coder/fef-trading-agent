'use client';

import React from 'react';
import Link from 'next/link';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { MemberAccessGuard } from '@/components/common/MemberAccessGuard';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { CONNECTOR_RELEASE_MANIFEST } from '@/lib/downloads/connector-manifest';
import { SUPPORT_CONFIG, CORTEX_WHATSAPP_CONFIG } from '@/lib/config/support-config';

export default function MemberSetupPage() {
  const { isMt5Connected, isLocalBridgeOnline, telemetry } = useMT5Telemetry();

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      <BackgroundLiveChart symbol="XAUUSD" isPositive={true} />

      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />
        <MarketCategoryFilterBar />

        <MemberAccessGuard
          title="MT5 SETUP &amp; CONNECTOR DOWNLOADS"
          description="Official distribution package and verified step-by-step setup guide for connecting MetaTrader 5 to FEF CORTEX."
        >
          {/* Header */}
          <div className="ghost-glass-panel rounded-2xl p-6 space-y-2 font-sans">
            <div className="flex items-center space-x-2">
              <span className="text-2xl">📥</span>
              <h1 className="text-xl font-bold text-white uppercase tracking-wider">
                FEF CORTEX &bull; MT5 CONNECTOR INSTALLATION &amp; SETUP
              </h1>
            </div>
            <p className="text-xs text-gray-400">
              Native MetaTrader 5 Expert Advisor &bull; WebRequest HTTP Telemetry on port 5556 &bull; Strict zero-DLL execution
            </p>
          </div>

          {/* Current Connection Diagnostic Ribbon */}
          <div className="ghost-glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
            <div className="flex items-center space-x-3">
              <span className="text-gray-400">LIVE DIAGNOSTIC:</span>
              <span className={`px-2.5 py-1 rounded font-bold ${
                isMt5Connected
                  ? 'bg-emerald-950/70 border border-emerald-500/50 text-emerald-300'
                  : isLocalBridgeOnline
                  ? 'bg-amber-950/70 border border-amber-500/50 text-amber-300'
                  : 'bg-black/60 border border-white/10 text-gray-400'
              }`}>
                {isMt5Connected
                  ? `✓ MT5 CONNECTED (${telemetry.account?.broker || 'BROKER'})`
                  : isLocalBridgeOnline
                  ? '● BRIDGE ONLINE — WAITING FOR MT5 EA'
                  : '○ BRIDGE & MT5 OFFLINE'}
              </span>
            </div>

            <div className="flex items-center space-x-2 text-[11px] text-gray-400">
              <span>Bridge Endpoint:</span>
              <span className="text-cyan-300 font-bold">http://127.0.0.1:5556</span>
            </div>
          </div>

          {/* 5-Step Guide */}
          <div className="space-y-4 font-sans">
            {/* Step 1: Download */}
            <div className="ghost-glass-panel rounded-2xl p-6 space-y-3">
              <div className="flex items-center space-x-3">
                <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold text-sm flex items-center justify-center">
                  1
                </span>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  DOWNLOAD COMPILED MT5 EXPERT ADVISOR
                </h3>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed pl-10 max-w-4xl">
                Download the official compiled binary <code className="bg-black/60 px-2 py-0.5 rounded text-cyan-300 font-mono">FEF_HTTP_Bridge.ex5</code>. This compiled Expert Advisor runs natively inside MetaTrader 5 without requiring compiler access or exposing algorithmic source files.
              </p>

              <div className="pl-10 pt-2 flex flex-wrap gap-3">
                <a
                  href="/api/downloads/connector"
                  download={CONNECTOR_RELEASE_MANIFEST.filename}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black font-bold text-xs rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.35)] flex items-center space-x-2 cursor-pointer transition-all"
                >
                  <span>⬇️</span>
                  <span>DOWNLOAD {CONNECTOR_RELEASE_MANIFEST.filename} (v{CONNECTOR_RELEASE_MANIFEST.version} &bull; {(CONNECTOR_RELEASE_MANIFEST.expectedSize / 1024).toFixed(1)} KB &bull; SHA256 VERIFIED)</span>
                </a>
              </div>
              <div className="pl-10 text-[11px] text-gray-400 flex items-center space-x-3">
                <span className="text-emerald-400 font-mono">✓ Release SHA256: {CONNECTOR_RELEASE_MANIFEST.expectedSha256.slice(0, 8)}...{CONNECTOR_RELEASE_MANIFEST.expectedSha256.slice(-3)}</span>
                <span>&bull;</span>
                <span>Protected Member Distribution</span>
                <span>&bull;</span>
                <span className="text-cyan-300">Auto-Provisioned Device Security</span>
              </div>
            </div>

            {/* Step 2: Install into MT5 Experts Folder */}
            <div className="ghost-glass-panel rounded-2xl p-6 space-y-3">
              <div className="flex items-center space-x-3">
                <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold text-sm flex items-center justify-center">
                  2
                </span>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  COPY FILE INTO METATRADER 5 DATA FOLDER
                </h3>
              </div>
              <div className="text-xs text-gray-300 space-y-2 pl-10 leading-relaxed font-mono">
                <div>1. In MetaTrader 5, click <strong>File</strong> &rarr; <strong>Open Data Folder</strong>.</div>
                <div>2. Navigate into <code className="text-cyan-300">MQL5</code> &rarr; <code className="text-cyan-300">Experts</code>.</div>
                <div>3. Paste <code className="text-cyan-300">FEF_HTTP_Bridge.ex5</code> into this directory.</div>
                <div>4. In the MT5 Navigator panel (Ctrl+N), right-click <strong>Expert Advisors</strong> &rarr; click <strong>Refresh</strong>.</div>
              </div>
            </div>

            {/* Step 3: MT5 Options WebRequest Configuration */}
            <div className="ghost-glass-panel rounded-2xl p-6 space-y-3">
              <div className="flex items-center space-x-3">
                <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold text-sm flex items-center justify-center">
                  3
                </span>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  CONFIGURE REQUIRED MT5 / WEBREQUEST PERMISSIONS
                </h3>
              </div>
              <div className="text-xs text-gray-300 space-y-2.5 pl-10 leading-relaxed">
                <p>
                  Because FEF CORTEX does <strong>NOT use risky DLL imports</strong>, MetaTrader 5 requires an explicit whitelist entry for the local HTTP socket:
                </p>
                <div className="p-3.5 bg-black/60 rounded-xl border border-white/10 font-mono text-xs space-y-1.5">
                  <div>1. Go to <strong>Tools</strong> &rarr; <strong>Options</strong> &rarr; <strong>Expert Advisors</strong> tab (Ctrl+O).</div>
                  <div>2. Check: <code className="text-emerald-400 font-bold">[✓] Allow WebRequest for listed URL:</code></div>
                  <div>3. Click &quot;Add new URL&quot; and enter exactly:</div>
                  <div className="p-2 bg-cyan-950/40 border border-cyan-500/40 rounded text-cyan-300 font-bold text-sm select-all">
                    http://127.0.0.1:5556
                  </div>
                  <div>4. Click <strong>OK</strong> to save.</div>
                </div>
              </div>
            </div>

            {/* Step 4: Attach EA to Chart & Settings */}
            <div className="ghost-glass-panel rounded-2xl p-6 space-y-3">
              <div className="flex items-center space-x-3">
                <span className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold text-sm flex items-center justify-center">
                  4
                </span>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  ATTACH EA TO ANY SINGLE CHART
                </h3>
              </div>
              <div className="text-xs text-gray-300 space-y-2 pl-10 leading-relaxed font-mono">
                <div>1. Drag <code className="text-cyan-300">FEF_HTTP_Bridge</code> onto any chart (e.g. <strong>XAUUSD</strong> or <strong>EURUSD</strong>). Only one chart is needed!</div>
                <div>2. Verify the EA inputs:</div>
                <div className="p-3 bg-black/60 rounded-xl border border-white/10 space-y-1 text-[11px]">
                  <div><span className="text-gray-500">InpBridgeBaseUrl:</span> <span className="text-white">http://127.0.0.1:5556</span></div>
                  <div><span className="text-gray-500">InpAuthToken:</span> <span className="text-white">(Preconfigured default local token)</span></div>
                  <div><span className="text-gray-500">InpMagicNumber:</span> <span className="text-white">8882026</span></div>
                  <div><span className="text-gray-500">InpOperatingMode:</span> <span className="text-emerald-400 font-bold">MODE_DEMO_EXECUTION</span></div>
                </div>
                <div>3. Check the MT5 Experts log to verify: <span className="text-emerald-300">&quot;[FEF-HTTP] Handshake succeeded&quot;</span>.</div>
              </div>
            </div>

            {/* Step 5: Ready */}
            <div className="ghost-glass-panel rounded-2xl p-6 space-y-3">
              <div className="flex items-center space-x-3">
                <span className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-bold text-sm flex items-center justify-center">
                  5
                </span>
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  CORTEX READY
                </h3>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed pl-10 max-w-4xl">
                Return to the <Link href="/cockpit" className="text-cyan-400 font-bold underline">CORTEX Cockpit</Link> or <Link href="/execution" className="text-cyan-400 font-bold underline">Institutional Execution Gate</Link>. The top navigation telemetry pill will display <strong className="text-emerald-400">MT5 CONNECTED</strong> with your broker and live account mode.
              </p>
            </div>
          </div>

          {/* Need help footer */}
          <div className="ghost-glass-panel rounded-2xl p-6 space-y-3 font-sans">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Need Technical Assistance?</h4>
            <div className="flex flex-wrap gap-3">
              {CORTEX_WHATSAPP_CONFIG.isConfigured && (
                <a
                  href={CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl() || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center space-x-1.5"
                >
                  <span>💬</span>
                  <span>WhatsApp Setup Hotline</span>
                </a>
              )}
              <a
                href={`mailto:${SUPPORT_CONFIG.supportEmail}?subject=MT5%20Connector%20Setup%20Assistance`}
                className="px-4 py-2 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center space-x-1.5"
              >
                <span>✉️</span>
                <span>Email Setup Support</span>
              </a>
            </div>
          </div>
        </MemberAccessGuard>

        <MasterFooter />
      </div>
    </div>
  );
}

