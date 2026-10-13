'use client';

import React from 'react';

export const MasterFooter: React.FC = () => {
  return (
    <footer className="pt-3 pb-6 flex flex-col space-y-3 text-[10px] font-sans text-[#94A3B8] border-t border-white/[0.06]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <span className="text-[#F8FAFC] font-extrabold tracking-[0.1em]">FEF TRADING INTELLIGENCE</span>
          <span className="text-[#64748B]">|</span>
          <span className="tracking-[0.04em] text-[#94A3B8]">AI • MARKETS • RISK • EXECUTION</span>
        </div>
        <div className="flex items-center space-x-2.5 tracking-[0.12em] text-[#67E8F9] font-bold uppercase text-[9px]">
          <span>DISCIPLINE</span>
          <span className="text-[#64748B]">&bull;</span>
          <span>INTELLIGENCE</span>
          <span className="text-[#64748B]">&bull;</span>
          <span>EXECUTION</span>
          <span className="text-[#64748B]">&bull;</span>
          <span>FREEDOM</span>
        </div>
      </div>
      <div className="text-[9px] text-[#64748B] leading-relaxed border-t border-white/[0.04] pt-2">
        <span className="font-semibold text-gray-400">Financial Risk Disclosure:</span> Trading foreign exchange, commodities, indices, and cryptocurrencies involves substantial risk of loss and is not suitable for all investors. FEF CORTEX provides multi-agent market intelligence, quantitative analytics, and execution risk parameters for informational and research purposes only. Nothing contained on this platform constitutes financial, investment, or trading advice.
      </div>
    </footer>
  );
};
