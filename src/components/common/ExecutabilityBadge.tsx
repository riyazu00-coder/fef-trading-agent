'use client';

import React from 'react';

interface ExecutabilityBadgeProps {
  executable: boolean;
  score?: number;
  reason?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export const ExecutabilityBadge: React.FC<ExecutabilityBadgeProps> = ({
  executable,
  score,
  reason,
  size = 'sm',
  className = '',
}) => {
  const sizeClasses = {
    xs: 'text-[9px] px-1.5 py-0.5 gap-1',
    sm: 'text-[10px] px-2 py-0.5 gap-1.5',
    md: 'text-[11px] px-2.5 py-1 gap-2',
  };

  if (executable) {
    return (
      <div
        className={`inline-flex items-center font-mono font-bold uppercase tracking-wider rounded-md border backdrop-blur-md transition-all border-emerald-500/40 bg-emerald-950/30 text-emerald-400 ${sizeClasses[size]} ${className}`}
        title={reason || 'Market session active and quotes validated. Order transport remains read-only.'}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        <span>MARKET READY</span>
        {score !== undefined && (
          <span className="text-[9px] text-emerald-300/80 font-normal pl-1 border-l border-emerald-500/30">
            {score}%
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center font-mono font-bold uppercase tracking-wider rounded-md border backdrop-blur-md transition-all border-rose-500/30 bg-rose-950/30 text-rose-300 ${sizeClasses[size]} ${className}`}
      title={reason || 'Market closed. Execution locked by Market Session Gate.'}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500/80 shadow-[0_0_6px_rgba(244,63,94,0.6)]" />
      <span>LOCKED (CLOSED)</span>
      {score !== undefined && (
        <span className="text-[9px] text-rose-400/80 font-normal pl-1 border-l border-rose-500/30">
          0%
        </span>
      )}
    </div>
  );
};
