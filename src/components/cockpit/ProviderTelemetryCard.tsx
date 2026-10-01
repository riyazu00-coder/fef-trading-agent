'use client';

import React from 'react';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';

export const ProviderTelemetryCard: React.FC = () => {
  const { isMt5Connected, telemetry } = useMT5Telemetry();

  const isRemoteRelay = Boolean(telemetry.isRemote || (telemetry as any).transport?.includes('RELAY'));
  const brokerName = telemetry.account?.broker && telemetry.account.broker !== 'UNKNOWN BROKER'
    ? telemetry.account.broker
    : telemetry.terminal?.brokerName || 'Connected Broker';
  const pingMs = telemetry.terminal?.pingToBrokerMs ?? (telemetry.account as any)?.ping ?? null;

  const mt5Item = isMt5Connected
    ? isRemoteRelay
      ? {
          name: 'Remote MT5 (Relay)',
          status: 'REMOTE LIVE',
          detail: `${brokerName} • Telemetry Only`,
          statusColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40'
        }
      : {
          name: 'MT5 Broker (Exec)',
          status: 'LIVE ⚡',
          detail: `${brokerName} • ${pingMs != null ? `${pingMs}ms` : 'LIVE'}`,
          statusColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
        }
    : {
        name: 'MT5 Broker (Exec)',
        status: 'OFFLINE',
        detail: 'Standby — Connect MT5',
        statusColor: 'bg-rose-950/60 text-rose-300 border-rose-500/40'
      };

  const telemetryItems = [
    { name: 'Gold-API Spot (Ref)', status: 'LIVE', detail: 'Analysis Only', statusColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' },
    { name: 'Binance Crypto (Ref)', status: 'LIVE', detail: 'Analysis Only', statusColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' },
    { name: 'Open-ER Forex (Ref)', status: 'LIVE', detail: 'Analysis Only', statusColor: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40' },
    { name: 'Macro Yields (Ref)', status: 'DELAYED', detail: '10Y Benchmark', statusColor: 'bg-amber-950/60 text-amber-300 border-amber-500/40' },
    { name: 'Financial Wire', status: 'DATA LTD', detail: 'Public Feeds', statusColor: 'bg-amber-950/60 text-amber-300 border-amber-500/40' },
    { name: 'Chart Vision', status: 'HEURISTIC', detail: 'Local Engine', statusColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40' },
    mt5Item,
    { name: 'Paper Engine', status: 'SIMULATED', detail: 'Risk Verified', statusColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40' }
  ];

  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            PROVIDER TELEMETRY
          </h3>
        </div>
        <span className="text-[8px] text-cyan-300 flex items-center space-x-1 font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>Honest Provenance Active</span>
        </span>
      </div>

      {/* Grid of 8 items (2 columns x 4 rows) */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[9px]">
        {telemetryItems.map((t, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <span className="flex items-center space-x-1 text-gray-300 truncate">
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  t.status === 'LIVE' || t.status === 'DEMO LIVE'
                    ? 'bg-emerald-400'
                    : t.status === 'OFFLINE' || t.status === 'NOT CONNECTED'
                    ? 'bg-rose-400'
                    : t.status === 'READ ONLY'
                    ? 'bg-cyan-400'
                    : 'bg-amber-400'
                }`}
              />
              <span className="truncate">{t.name}</span>
            </span>
            <span className={`text-[7.5px] font-bold px-1.5 py-0.2 rounded border flex-shrink-0 ${t.statusColor}`}>
              {t.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
