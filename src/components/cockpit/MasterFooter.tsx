'use client';

import React from 'react';

export const MasterFooter: React.FC = () => {
  return (
    <footer className="pt-3 pb-5 flex flex-wrap items-center justify-between text-[10px] font-sans text-[#94A3B8] border-t border-white/[0.06] gap-2">
      <div className="flex items-center space-x-2">
        <span className="text-[#F8FAFC] font-extrabold tracking-[0.1em]">FEF TRADING SOLUTIONS</span>
        <span className="text-[#64748B]">|</span>
        <span className="tracking-[0.04em] text-[#94A3B8]">AI Intelligence • Risk Tools • Market Opportunities</span>
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
    </footer>
  );
};
