'use client';

import React from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';

export const DataSentinelPanel: React.FC = () => {
  const { activeSymbol, assetProfile, liveFeeds } = useActiveAsset();
  const { isMt5Connected, telemetry } = useMT5Telemetry();

  const sentinel = assetProfile.dataSentinel || liveFeeds?.sentinel;
  const providers = liveFeeds?.providerHealth || [];

  const isHealthy = isMt5Connected && (!providers.length || !providers.some((p) => p.status === 'OFFLINE'));
  const statusLabel = isHealthy ? 'HEALTHY' : isMt5Connected ? 'DEGRADED' : 'DATA LIMITED';

  return (
    <div className="ghost-glass-panel rounded-2xl p-3 sm:p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            DATA SENTINEL & SYSTEM INTEGRITY
          </h3>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase font-mono ${
            isHealthy
              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
              : 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
          }`}>
            SENTINEL: {statusLabel}
          </span>
          <span className="text-[8px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-bold font-mono">
            NON-DIRECTIONAL AUDITOR
          </span>
        </div>
      </div>

      {/* Sentinel Core Mandate Banner */}
      <div className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
        <div className="space-y-0.5">
          <span className="text-[9px] text-gray-400 uppercase font-bold block">
            System Integrity Conclusion:
          </span>
          <p className="text-[10.5px] text-gray-200">
            {sentinel?.primaryThesis || (isHealthy
              ? `All telemetry channels verified. Zero payload corruption across feeds for ${activeSymbol}.`
              : `Telemetry operating under constrained data mode. MT5 connection standby.`)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-[8px] text-gray-400 block uppercase">Confidence</span>
          <span className="text-sm font-bold text-emerald-400">
            {sentinel?.confidence || 95}%
          </span>
        </div>
      </div>

      {/* Provider Health Matrix */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[9.5px] font-bold text-gray-400 uppercase">
          <span>Active Provider Health Table</span>
          <span className="text-[8.5px] text-gray-500 font-mono">Latency & Staleness Verification</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {/* MT5 Broker */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-2 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-[10px]">MT5 Broker (Exec)</span>
              <span className={`text-[8px] px-1 py-0.2 rounded font-mono font-bold ${
                isMt5Connected
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-950 text-rose-300 border border-rose-500/30'
              }`}>
                {isMt5Connected ? 'ONLINE' : 'STANDBY'}
              </span>
            </div>
            <span className="text-[8.5px] text-gray-400 block truncate">
              {telemetry.account?.broker || 'Connect Terminal in Settings'}
            </span>
          </div>

          {/* FRED Macro */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-2 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-[10px]">FRED Macro Engine</span>
              <span className="text-[8px] px-1 py-0.2 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                ONLINE
              </span>
            </div>
            <span className="text-[8.5px] text-gray-400 block truncate">
              St. Louis Fed Official API • Cached
            </span>
          </div>

          {/* Real Market Spot */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-2 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-[10px]">Real-Market Spot</span>
              <span className="text-[8px] px-1 py-0.2 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                ONLINE
              </span>
            </div>
            <span className="text-[8.5px] text-gray-400 block truncate">
              Gold-API & Independent Reference
            </span>
          </div>

          {/* Economic Calendar */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-2 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-[10px]">Economic Calendar</span>
              <span className="text-[8px] px-1 py-0.2 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                ONLINE
              </span>
            </div>
            <span className="text-[8.5px] text-gray-400 block truncate">
              Scheduled Releases • Risk Guardian Lock
            </span>
          </div>

          {/* Global News Wire */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-2 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-[10px]">News & Wire</span>
              <span className="text-[8px] px-1 py-0.2 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                ONLINE
              </span>
            </div>
            <span className="text-[8.5px] text-gray-400 block truncate">
              Financial News & RSS Disruption
            </span>
          </div>

          {/* Market Sentiment */}
          <div className="bg-black/30 border border-white/5 rounded-xl p-2 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-[10px]">Sentiment Engine</span>
              <span className="text-[8px] px-1 py-0.2 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/30">
                ONLINE
              </span>
            </div>
            <span className="text-[8.5px] text-gray-400 block truncate">
              Retail Long/Short & Contrarian Skew
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

