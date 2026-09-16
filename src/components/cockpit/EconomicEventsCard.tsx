'use client';

import React, { useState } from 'react';

interface EconomicEventItem {
  time: string;
  name: string;
  currency: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  impactColor: string;
  countdown: string;
  forecast: string;
  previous: string;
  riskLockout: string;
}

export const EconomicEventsCard: React.FC = () => {
  const [showAllModal, setShowAllModal] = useState<boolean>(false);

  const events: EconomicEventItem[] = [
    { time: '18:30', name: 'Core PCE Price Index (MoM)', currency: 'USD', impact: 'HIGH', impactColor: 'bg-rose-950/60 text-rose-300 border-rose-500/40', countdown: 'in 1h 45m', forecast: '0.2%', previous: '0.3%', riskLockout: 'LOCKOUT ACTIVE (15m buffer)' },
    { time: '19:15', name: 'Fed Governor Speech (Chicago)', currency: 'USD', impact: 'MEDIUM', impactColor: 'bg-amber-950/60 text-amber-300 border-amber-500/40', countdown: 'in 2h 30m', forecast: 'N/A', previous: 'N/A', riskLockout: 'CAUTION SIZING' },
    { time: '21:00', name: '10-Year Bond Auction', currency: 'USD', impact: 'MEDIUM', impactColor: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40', countdown: 'in 4h 15m', forecast: '4.22%', previous: '4.28%', riskLockout: 'STANDARD' },
    { time: '23:00', name: 'Non-Farm Payrolls (Preview)', currency: 'USD', impact: 'HIGH', impactColor: 'bg-rose-950/60 text-rose-300 border-rose-500/40', countdown: 'in 22h 0m', forecast: '165K', previous: '187K', riskLockout: 'SCHEDULED LOCKOUT' },
    { time: '08:30', name: 'ECB Monetary Policy Statement', currency: 'EUR', impact: 'HIGH', impactColor: 'bg-rose-950/60 text-rose-300 border-rose-500/40', countdown: 'Tomorrow', forecast: '3.75%', previous: '3.75%', riskLockout: 'SCHEDULED' },
    { time: '01:30', name: 'Tokyo CPI Inflation Rate', currency: 'JPY', impact: 'MEDIUM', impactColor: 'bg-amber-950/60 text-amber-300 border-amber-500/40', countdown: 'Tomorrow', forecast: '2.4%', previous: '2.5%', riskLockout: 'STANDARD' },
  ];

  return (
    <>
      <div id="economic-events-card" className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-2.5">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
              ECONOMIC EVENTS
            </h3>
          </div>
          <button
            onClick={() => setShowAllModal(true)}
            className="text-[9px] text-[#67E8F9] hover:text-white transition-colors cursor-pointer font-bold"
          >
            View All ({events.length}) &rarr;
          </button>
        </div>

        <div className="space-y-2 text-[10px]">
          {events.slice(0, 4).map((ev, i) => (
            <div key={i} className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 border border-white/5">
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 font-bold">{ev.time}</span>
                <span className="text-white font-medium truncate max-w-[125px]">{ev.name}</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${ev.impactColor}`}>
                  {ev.impact}
                </span>
                <span className="text-[9px] text-gray-400">{ev.countdown}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Institutional Economic Calendar Modal */}
      {showAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="ghost-glass-panel-elevated rounded-2xl max-w-2xl w-full p-5 space-y-4 border border-cyan-500/30 shadow-[0_0_40px_rgba(0,0,0,0.8)] font-sans">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">📅</span>
                <div>
                  <h2 className="text-base font-bold text-[#F8FAFC] uppercase tracking-[0.06em]">
                    INSTITUTIONAL ECONOMIC CALENDAR
                  </h2>
                  <p className="text-xs text-[#94A3B8]">
                    Real-time Macro Catalyst Schedule &bull; Risk Guardian Automatic Lockout Rules
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAllModal(false)}
                className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {events.map((ev, idx) => (
                <div
                  key={idx}
                  className="bg-black/40 border border-white/[0.08] p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
                >
                  <div className="flex items-center space-x-3">
                    <span className="text-cyan-300 font-bold text-sm w-12">{ev.time}</span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white font-bold font-sans">
                          {ev.currency}
                        </span>
                        <span className="text-[#F8FAFC] font-bold font-sans">{ev.name}</span>
                      </div>
                      <div className="text-[10px] text-[#94A3B8] mt-0.5">
                        Forecast: <span className="text-white">{ev.forecast}</span> &bull; Previous: <span className="text-white">{ev.previous}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-right">
                    <div>
                      <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${ev.impactColor}`}>
                        {ev.impact} IMPACT
                      </span>
                      <span className="block text-[10px] text-[#67E8F9] font-bold mt-1">
                        {ev.countdown}
                      </span>
                    </div>
                    <div className="hidden sm:block text-[9.5px] text-amber-300 bg-amber-950/40 border border-amber-500/30 px-2 py-1 rounded">
                      {ev.riskLockout}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[10px] text-[#94A3B8]">
              <span>Shock Filter: Live wire scans lock execution 15m prior to High Impact prints.</span>
              <button
                onClick={() => setShowAllModal(false)}
                className="px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-[#67E8F9] font-bold rounded-xl transition-all cursor-pointer"
              >
                Close Calendar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

