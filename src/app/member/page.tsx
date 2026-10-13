'use client';

import React from 'react';
import Link from 'next/link';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { MemberAccessGuard } from '@/components/common/MemberAccessGuard';
import { useMemberAuth } from '@/context/MemberAuthContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { CONNECTOR_RELEASE_MANIFEST } from '@/lib/downloads/connector-manifest';
import { SUPPORT_CONFIG, CORTEX_WHATSAPP_CONFIG } from '@/lib/config/support-config';

export default function MemberPortalPage() {
  const { member, license, device, isDeviceAuthorized, isMaster, authorizeDevice } = useMemberAuth();
  const { telemetry, isMt5Connected, isLocalBridgeOnline } = useMT5Telemetry();

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      <BackgroundLiveChart symbol="XAUUSD" isPositive={true} />

      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />
        <MarketCategoryFilterBar />

        <MemberAccessGuard
          title="MEMBER PORTAL"
          description="Access your FEF CORTEX membership status, device entitlement, and MT5 connector setup."
          allowLoginForm={true}
        >
          {/* Header Card */}
          <div className="ghost-glass-panel rounded-2xl p-6 space-y-2 font-sans">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">👤</span>
                  <h1 className="text-xl font-bold text-white uppercase tracking-wider">
                    FEF CORTEX MEMBER PORTAL
                  </h1>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded font-mono font-bold ${
                    isMaster
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  }`}>
                    {isMaster ? 'MASTER OWNER' : 'COMMUNITY MEMBER'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Logged in as <strong className="text-white">{member?.name}</strong> ({member?.email}) &bull; Member ID: <span className="font-mono text-cyan-300">{member?.memberId}</span>
                </p>
              </div>

              {isMaster && (
                <Link
                  href="/admin/members"
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-xl flex items-center space-x-1.5 transition-all"
                >
                  <span>👑</span>
                  <span>OPEN MASTER CONSOLE</span>
                </Link>
              )}
            </div>
          </div>

          {/* 3-Column Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            {/* Card 1: Membership & License */}
            <div className="ghost-glass-panel rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-gray-400 uppercase tracking-wider text-[11px]">1. Membership State</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  member?.status === 'ACTIVE'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  {member?.status || 'ACTIVE'}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">License Entitlement:</span>
                  <span className="text-white font-bold">
                    {isMaster ? 'MASTER (UNRESTRICTED)' : license ? `${license.prefix}-••••` : 'NO LICENSE'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">License Status:</span>
                  <span className="text-emerald-400 font-bold">
                    {isMaster ? 'LIFETIME OWNER' : license?.status || 'UNASSIGNED'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Registered On:</span>
                  <span className="text-gray-300">
                    {member?.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card 2: Single-Device Authorization */}
            <div className="ghost-glass-panel rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-gray-400 uppercase tracking-wider text-[11px]">2. Device Authorization</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isMaster || isDeviceAuthorized
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  {isMaster ? 'BYPASSED' : isDeviceAuthorized ? 'AUTHORIZED 1/1' : 'UNCLAIMED 0/1'}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Authorized Slots:</span>
                  <span className="text-white font-bold">{isMaster ? 'UNLIMITED' : '1 COMPUTER MAX'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Current Computer:</span>
                  <span className={isDeviceAuthorized || isMaster ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {isMaster ? 'OWNER ACCESS' : isDeviceAuthorized ? 'BOUND TO THIS PC' : 'PENDING AUTHORIZATION'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Device ID:</span>
                  <span className="text-gray-400 font-mono text-[10px]">{device?.fingerprint || 'UNKNOWN'}</span>
                </div>
              </div>

              {!isMaster && !isDeviceAuthorized && (
                <button
                  onClick={authorizeDevice}
                  className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-xl transition-all shadow-md"
                >
                  AUTHORIZE THIS COMPUTER (1/1)
                </button>
              )}
            </div>

            {/* Card 3: MT5 Telemetry & Local Bridge */}
            <div className="ghost-glass-panel rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-gray-400 uppercase tracking-wider text-[11px]">3. MT5 Connector</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  telemetry.connectionStatus === 'DEGRADED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    : isMt5Connected && (isLocalBridgeOnline || telemetry.account?.broker)
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : isLocalBridgeOnline
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-gray-800 text-gray-400'
                }`}>
                  {telemetry.connectionStatus === 'DEGRADED'
                    ? 'DEGRADED / RECONNECTING'
                    : isMt5Connected && (isLocalBridgeOnline || telemetry.account?.broker)
                    ? 'CONNECTED'
                    : isLocalBridgeOnline
                    ? 'BRIDGE ONLINE (NO MT5)'
                    : 'WAITING FOR MT5'}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Local Bridge (5556):</span>
                  <span className={isLocalBridgeOnline ? 'text-emerald-400 font-bold' : 'text-gray-500'}>
                    {isLocalBridgeOnline ? '127.0.0.1:5556 ACTIVE' : 'OFFLINE'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Account Mode:</span>
                  <span className={`font-bold ${
                    telemetry.account?.tradeMode === 'REAL'
                      ? 'text-rose-400'
                      : telemetry.account?.tradeMode === 'DEMO'
                      ? 'text-emerald-400'
                      : 'text-gray-500'
                  }`}>
                    {telemetry.account?.tradeMode || 'NO TELEMETRY'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Broker:</span>
                  <span className="text-gray-300">{telemetry.account?.broker || 'N/A'}</span>
                </div>
              </div>

              <div className="pt-1 flex flex-col space-y-1.5">
                <a
                  href="/api/downloads/connector"
                  download={CONNECTOR_RELEASE_MANIFEST.filename}
                  className="w-full py-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)]"
                >
                  <span>⬇️</span>
                  <span>DOWNLOAD MT5 EA (v{CONNECTOR_RELEASE_MANIFEST.version})</span>
                </a>
                <Link
                  href="/member/setup"
                  className="w-full py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 text-[11px] font-bold rounded-xl flex items-center justify-center space-x-1 transition-all block text-center"
                >
                  <span>📖</span>
                  <span>MT5 SETUP GUIDE &amp; WEBREQUEST</span>
                </Link>
              </div>
            </div>
          </div>

          {/* MT5 EA Download & Installation Section */}
          <div className="ghost-glass-panel rounded-2xl p-6 space-y-5 font-sans border border-cyan-500/20 shadow-[0_0_25px_rgba(6,182,212,0.1)]">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-2xl">⚡</span>
                  <h2 className="text-base sm:text-lg font-bold text-white uppercase tracking-wider">
                    FEF MT5 Bridge EA
                  </h2>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {CONNECTOR_RELEASE_MANIFEST.status === 'CURRENT' ? 'CURRENT / LATEST' : CONNECTOR_RELEASE_MANIFEST.status}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-500/30">
                    MetaTrader 5
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Version {CONNECTOR_RELEASE_MANIFEST.version} &bull; Secure Member Download &bull; Native MQL5 WebRequest (No DLL)
                </p>
              </div>

              <div>
                <a
                  href="/api/downloads/connector"
                  download={CONNECTOR_RELEASE_MANIFEST.filename}
                  className="px-6 py-3 bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.4)] flex items-center space-x-2 cursor-pointer transition-all active:scale-[0.98]"
                >
                  <span>⬇️</span>
                  <span>DOWNLOAD MT5 EA</span>
                </a>
              </div>
            </div>

            {/* Verified Release Metadata Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px] p-3 bg-black/40 rounded-xl border border-white/5">
              <div>
                <span className="text-gray-500 block text-[10px] uppercase">Binary File</span>
                <span className="text-white font-bold">{CONNECTOR_RELEASE_MANIFEST.filename}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase">Version</span>
                <span className="text-cyan-300 font-bold">v{CONNECTOR_RELEASE_MANIFEST.version}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase">Binary Size</span>
                <span className="text-gray-200">{(CONNECTOR_RELEASE_MANIFEST.expectedSize / 1024).toFixed(1)} KB ({CONNECTOR_RELEASE_MANIFEST.expectedSize.toLocaleString()} bytes)</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[10px] uppercase">Integrity SHA256</span>
                <span className="text-emerald-400 truncate block" title={CONNECTOR_RELEASE_MANIFEST.expectedSha256}>
                  {CONNECTOR_RELEASE_MANIFEST.expectedSha256.slice(0, 8)}...{CONNECTOR_RELEASE_MANIFEST.expectedSha256.slice(-8)}
                </span>
              </div>
            </div>

            {/* Step-by-Step Installation Flow */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center space-x-1.5">
                <span>📋</span>
                <span>INSTALLATION &amp; WORKSTATION SETUP FLOW</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-gray-300">
                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5">
                  <div className="font-bold text-white flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono flex items-center justify-center font-bold">1</span>
                    <span>Download Official EA</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-7">
                    Click <strong>DOWNLOAD MT5 EA</strong> above to obtain the official compiled <code className="text-cyan-300 font-mono">FEF_HTTP_Bridge.ex5</code>.
                  </p>
                </div>

                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5">
                  <div className="font-bold text-white flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono flex items-center justify-center font-bold">2</span>
                    <span>Copy to MT5 Experts Folder</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-7">
                    In MetaTrader 5, click <strong>File &rarr; Open Data Folder</strong>, navigate to <code className="text-cyan-300 font-mono">MQL5/Experts</code>, and paste the file.
                  </p>
                </div>

                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5">
                  <div className="font-bold text-white flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono flex items-center justify-center font-bold">3</span>
                    <span>Refresh MT5 Navigator</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-7">
                    In MT5 Navigator (Ctrl+N), right-click <strong>Expert Advisors</strong> and select <strong>Refresh</strong>.
                  </p>
                </div>

                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5">
                  <div className="font-bold text-white flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono flex items-center justify-center font-bold">4</span>
                    <span>Attach to a Single Chart</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-7">
                    Drag <code className="text-cyan-300 font-mono">FEF_HTTP_Bridge</code> onto any chart (e.g. XAUUSD). Only one chart attachment is required across your account.
                  </p>
                </div>

                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5">
                  <div className="font-bold text-white flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono flex items-center justify-center font-bold">5</span>
                    <span>Automated Local Provisioning</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-7">
                    FEF secure local provisioning delivers your device credential automatically into the MT5 sandbox. No token copy/paste is required.
                  </p>
                </div>

                <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1.5">
                  <div className="font-bold text-white flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-mono flex items-center justify-center font-bold">6</span>
                    <span>Restart Persistence</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed pl-7">
                    Normal MT5 restarts automatically restore the attached EA and reconnect to the local bridge without manual intervention.
                  </p>
                </div>
              </div>

              {/* Workstation Requirement Note */}
              <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded-xl text-[11px] text-amber-200/90 leading-relaxed flex items-start space-x-2.5">
                <span className="text-base flex-shrink-0">⚠️</span>
                <span>
                  <strong>Workstation Requirement Note:</strong> Automated credential provisioning requires the FEF local background service to be running on your computer. If configuring on a new workstation for the first time, ensure your local FEF connectivity package is active before attaching the EA.
                </span>
              </div>

              <div className="pt-2 flex justify-end">
                <Link
                  href="/member/setup"
                  className="text-xs text-cyan-300 hover:text-cyan-200 font-bold flex items-center space-x-1.5 transition-all"
                >
                  <span>VIEW FULL STEP-BY-STEP SETUP GUIDE WITH WEBREQUEST PERMISSIONS</span>
                  <span>&rarr;</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Quick Support & Portal Links */}
          <div className="ghost-glass-panel rounded-2xl p-6 space-y-4 font-sans">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              COMMUNITY ASSISTANCE &amp; ONBOARDING HOTLINE
            </h3>
            <p className="text-xs text-gray-400 leading-relaxed max-w-3xl">
              Need assistance configuring your MetaTrader 5 terminal, activating your community license, or requesting a device migration reset? Our technical team provides direct support.
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              {CORTEX_WHATSAPP_CONFIG.isConfigured && (
                <a
                  href={CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl() || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center space-x-2 transition-all"
                >
                  <span>💬</span>
                  <span>WhatsApp Community Desk</span>
                </a>
              )}

              <a
                href={`mailto:${SUPPORT_CONFIG.supportEmail}?subject=FEF%20CORTEX%20Member%20Portal%20Inquiry`}
                className="px-4 py-2.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center space-x-2 transition-all"
              >
                <span>✉️</span>
                <span>Email Support Desk</span>
              </a>

              <Link
                href="/how-to-use"
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-bold flex items-center space-x-2 transition-all"
              >
                <span>📖</span>
                <span>Full Operating Guide</span>
              </Link>
            </div>
          </div>
        </MemberAccessGuard>

        <MasterFooter />
      </div>
    </div>
  );
}

