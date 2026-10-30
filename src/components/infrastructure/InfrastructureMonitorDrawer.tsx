'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ComponentHealthInfo, InfrastructureHealthReport } from '@/lib/infrastructure/infrastructure-aggregator';

interface InfrastructureMonitorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InfrastructureMonitorDrawer: React.FC<InfrastructureMonitorDrawerProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<InfrastructureHealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/infrastructure/health', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        setLastRefreshedAt(Date.now());
        setError(null);
      } else {
        setError(`Failed to retrieve ecosystem status (HTTP ${res.status})`);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error querying infrastructure health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, [isOpen, fetchHealth]);

  if (!isOpen) return null;

  const secondsAgo = Math.max(0, Math.round((Date.now() - lastRefreshedAt) / 1000));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-[#030816]/95 border border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.15)] font-mono text-[11px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-slate-950/60 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-300">
              <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white tracking-wider font-sans uppercase">
                  SYSTEM INFRASTRUCTURE MONITOR
                </h2>
                {report && (
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                      report.overallCondition === 'HEALTHY'
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50'
                        : report.overallCondition === 'DEGRADED'
                        ? 'bg-amber-950/60 text-amber-300 border-amber-500/50'
                        : 'bg-rose-950/60 text-rose-300 border-rose-500/50'
                    }`}
                  >
                    {report.overallCondition}
                  </span>
                )}
              </div>
              <p className="text-[9px] text-gray-400 font-sans mt-0.5">
                Local Ecosystem &bull; Real-time Hardware, Terminal, Bridge &amp; Database Health
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex flex-col items-end text-[9px] text-gray-400 font-mono">
              <span>Updated: {secondsAgo === 0 ? 'just now' : `${secondsAgo}s ago`}</span>
              <span className="text-cyan-400 font-bold">
                {report ? `${report.healthyCount}/${report.totalCount} Components Online` : 'Syncing...'}
              </span>
            </div>

            <button
              onClick={fetchHealth}
              disabled={loading}
              className="px-2.5 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/40 transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              title="Refresh infrastructure health"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-[9.5px] font-bold">Refresh</span>
            </button>

            <button
              onClick={onClose}
              className="w-7 h-7 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-[10px] flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Component Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {report?.components.map((comp) => {
              const isConn = comp.status === 'CONNECTED';
              const isDeg = comp.status === 'DEGRADED';
              const isDis = comp.status === 'DISCONNECTED';

              return (
                <div
                  key={comp.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isConn
                      ? 'bg-slate-900/40 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                      : isDeg
                      ? 'bg-amber-950/20 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]'
                      : 'bg-rose-950/20 border-rose-500/30 shadow-[0_0_15px_rgba(244,63,94,0.05)]'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between border-b border-white/5 pb-2.5">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isConn
                              ? 'bg-emerald-400 animate-pulse'
                              : isDeg
                              ? 'bg-amber-400'
                              : 'bg-rose-400'
                          }`}
                        />
                        <h3 className="text-xs font-bold text-white tracking-wide">{comp.name}</h3>
                      </div>
                      <p className="text-[9px] text-gray-400 font-mono mt-0.5 truncate max-w-[280px]">
                        {comp.target}
                      </p>
                    </div>

                    <div className="flex flex-col items-end">
                      <span
                        className={`text-[8.5px] font-bold px-2 py-0.5 rounded-full border ${
                          isConn
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : isDeg
                            ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                            : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                        }`}
                      >
                        {comp.status}
                      </span>
                      {comp.latencyMs != null && (
                        <span className="text-[8px] text-gray-400 mt-1">
                          Latency: <strong className="text-cyan-300">{comp.latencyMs}ms</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Details & Metrics */}
                  <div className="py-2.5 space-y-2">
                    <p className="text-[9.5px] text-gray-300 leading-relaxed font-sans">
                      {comp.details}
                    </p>

                    {/* Dynamic Key Metrics */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 bg-black/40 p-2 rounded-xl border border-white/5 text-[8.5px]">
                      {Object.entries(comp.metrics || {}).map(([k, v]) => (
                        <div key={k} className="overflow-hidden">
                          <span className="text-gray-400 uppercase tracking-wider block text-[7.5px] truncate">
                            {k.replace(/([A-Z])/g, ' $1').trim()}
                          </span>
                          <span className="text-white font-bold truncate block">
                            {typeof v === 'boolean' ? (v ? 'YES' : 'NO') : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Heartbeat & Freshness Strip */}
                    <div className="flex items-center justify-between text-[8px] text-gray-400 pt-1 border-t border-white/5">
                      <span>
                        Heartbeat Age:{' '}
                        <strong className={comp.lastHeartbeatAgeMs != null && comp.lastHeartbeatAgeMs < 15000 ? 'text-emerald-300' : 'text-amber-300'}>
                          {comp.lastHeartbeatAgeMs != null ? `${comp.lastHeartbeatAgeMs}ms` : 'N/A'}
                        </strong>
                      </span>
                      <span>
                        Freshness:{' '}
                        <strong className={comp.dataFreshness === 'FRESH' ? 'text-emerald-300' : 'text-amber-300'}>
                          {comp.dataFreshness}
                        </strong>
                      </span>
                    </div>

                    {/* Error Notification */}
                    {comp.error && (
                      <div className="p-1.5 rounded-lg bg-rose-950/30 border border-rose-500/20 text-rose-300 text-[8px]">
                        ⚠️ {comp.error}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Strict Trading Safety Invariant Footer */}
          <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 space-y-1.5">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <h4 className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                TRADING SAFETY &amp; READ-ONLY INTEGRITY INVARIANTS
              </h4>
            </div>
            <p className="text-[9px] text-gray-300 font-sans leading-relaxed">
              <strong>MT5_ORDER_TRANSPORT_ENABLED = false.</strong> All broker transport is hard-locked to read-only telemetry. The CORTEX engine cannot execute live orders, send OrderSend calls, or modify account state. Execution journal SHA-256 hash verified.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-white/10 bg-slate-950/80 text-[9px] text-gray-400 flex-shrink-0">
          <span>Local Storage: <strong className="text-white">~/.fef/data/fef-cortex.db (WAL)</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer font-bold"
          >
            Close Monitor
          </button>
        </div>
      </div>
    </div>
  );
};

