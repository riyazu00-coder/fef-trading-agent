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
                  isMt5Connected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-gray-800 text-gray-400'
                }`}>
                  {isMt5Connected ? 'CONNECTED' : isLocalBridgeOnline ? 'BRIDGE ONLINE (NO MT5)' : 'NOT DETECTED'}
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

              <Link
                href="/member/setup"
                className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 text-xs font-bold rounded-xl flex items-center justify-center space-x-1 transition-all block text-center"
              >
                <span>📥</span>
                <span>MT5 SETUP GUIDE &amp; DOWNLOADS</span>
              </Link>
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

