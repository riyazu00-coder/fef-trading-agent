'use client';

import React, { useState } from 'react';

interface EventPolicyRule {
  name: string;
  buffer: string;
  policyAction: string;
}

export const EconomicEventsCard: React.FC = () => {
  const [showAllModal, setShowAllModal] = useState<boolean>(false);

  // Truthful policy configuration parameters (not fabricated active events)
  const eventPolicyRules: EventPolicyRule[] = [
    { name: 'High Impact USD/EUR/GBP Releases', buffer: 'T-15m to T+15m', policyAction: 'MANDATORY LOCKOUT' },
    { name: 'Central Bank Rate Decisions (Fed, ECB, BOJ)', buffer: 'T-30m to T+30m', policyAction: 'EXECUTION RESTRICTED' },
    { name: 'Tier-1 Inflation Prints (CPI, PCE)', buffer: 'T-15m to T+15m', policyAction: 'POLICY SIZING REDUCTION' },
    { name: 'Sovereign Bond Auctions / Speeches', buffer: 'Continuous', policyAction: 'ELEVATED SPREAD MONITOR' },
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
            Policy Rules ({eventPolicyRules.length}) &rarr;
          </button>
        </div>

        {/* Real-time telemetry status */}
        <div className="p-2 rounded-lg bg-black/40 border border-amber-500/20 flex items-center justify-between text-[9px]">
          <span className="text-gray-400">Calendar Telemetry:</span>
          <span className="text-amber-400 font-bold bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-500/30">
            DATA LIMITED / UNAVAILABLE
          </span>
        </div>

        <div className="space-y-1.5 text-[9.5px]">
          <div className="text-[8px] text-gray-400 uppercase tracking-wider font-sans font-bold">
            Configured Risk Safeguards
          </div>
          {eventPolicyRules.slice(0, 3).map((rule, i) => (
            <div key={i} className="flex items-center justify-between p-1.5 rounded-lg bg-black/30 border border-white/5">
              <span className="text-gray-300 font-medium truncate max-w-[140px] text-[8.5px]">{rule.name}</span>
              <span className="text-[7.5px] font-bold px-1.5 py-0.2 rounded border bg-amber-950/40 text-amber-300 border-amber-500/30">
                {rule.policyAction}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Institutional Event Risk Policy Modal */}
      {showAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="ghost-glass-panel-elevated rounded-2xl max-w-2xl w-full p-5 space-y-4 border border-cyan-500/30 shadow-[0_0_40px_rgba(0,0,0,0.8)] font-sans">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">🛡️</span>
                <div>
                  <h2 className="text-base font-bold text-[#F8FAFC] uppercase tracking-[0.06em]">
                    MACRO EVENT RISK POLICY & SAFEGUARDS
                  </h2>
                  <p className="text-xs text-[#94A3B8]">
                    Calendar Telemetry: DATA LIMITED / UNAVAILABLE &bull; Protective shock policies armed
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
              {eventPolicyRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="bg-black/40 border border-white/[0.08] p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs font-mono"
                >
                  <div>
                    <span className="text-[#F8FAFC] font-bold font-sans">{rule.name}</span>
                    <div className="text-[10px] text-[#94A3B8] mt-0.5">
                      Configured Buffer Window: <span className="text-white">{rule.buffer}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[9px] px-2 py-0.5 rounded border font-bold bg-amber-950/60 text-amber-300 border-amber-500/40">
                      {rule.policyAction}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[10px] text-[#94A3B8]">
              <span>Shock Policy: Live trade lockout activates when verified calendar feed confirms imminent catalyst.</span>
              <button
                onClick={() => setShowAllModal(false)}
                className="px-4 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-[#67E8F9] font-bold rounded-xl transition-all cursor-pointer"
              >
                Close Policy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

