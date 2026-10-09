'use client';

import React, { useState, useEffect } from 'react';
import { HubLiveMessage } from '@/lib/agents/hub-animation-engine';

interface HubMiniFeedProps {
  messages: HubLiveMessage[];
  activeSymbol: string;
}

export const HubMiniFeed: React.FC<HubMiniFeedProps> = ({ messages, activeSymbol }) => {
  const [visibleStartIndex, setVisibleStartIndex] = useState<number>(0);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Soft auto-rotate through messages every 3.5 seconds
  useEffect(() => {
    if (messages.length <= 3) return;
    const timer = setInterval(() => {
      setVisibleStartIndex((prev) => (prev + 1) % (messages.length - 2));
    }, 3500);
    return () => clearInterval(timer);
  }, [messages.length]);

  const displayedMessages = messages.slice(visibleStartIndex, visibleStartIndex + 3);

  return (
    <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 font-mono text-[10px] space-y-1 overflow-hidden transition-all hover:border-white/20">
      <div className="flex items-center justify-between border-b border-white/5 pb-1">
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="text-[9.5px] font-bold text-gray-400 uppercase font-sans">
            LIVE AGENT COMMUNICATIONS
          </span>
        </div>
        <span className="text-[9.5px] text-cyan-400/80 font-mono">
          {activeSymbol} Stream
        </span>
      </div>

      {/* 3 Compact Rotating Lines */}
      {messages.length === 0 ? (
        <div className="py-2 text-center text-gray-500 text-[9.5px] italic">
          Awaiting verified agent communications
        </div>
      ) : (
        <div className="space-y-1 transition-all duration-500">
          {displayedMessages.map((msg) => {
          const isCaution = msg.status === 'CAUTION' || msg.status === 'RESTRICTED';
          const isBull = msg.status === 'BULLISH';
          const isBear = msg.status === 'BEARISH';

          const tagColor = isCaution
            ? 'text-amber-300'
            : isBull
            ? 'text-emerald-300'
            : isBear
            ? 'text-rose-300'
            : 'text-cyan-300';

          return (
            <div
              key={msg.id}
              title={`[${msg.agentName}] ${msg.message}`}
              className="flex items-center space-x-1.5 text-[9.5px] min-w-0"
            >
              <span suppressHydrationWarning className="text-gray-500 font-bold flex-shrink-0 text-[9px]">
                {mounted ? msg.timestamp : '--:--:--'}
              </span>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: msg.packetColor }}
              />
              <span className={`font-bold flex-shrink-0 ${tagColor}`}>
                [{msg.agentName}]
              </span>
              <span className="text-gray-400 flex-shrink-0">&rarr;</span>
              <span className="text-gray-200 truncate min-w-0 flex-1">{msg.message}</span>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};
