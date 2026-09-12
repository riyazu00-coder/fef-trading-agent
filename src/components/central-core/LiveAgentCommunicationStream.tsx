'use client';

import React, { useRef, useEffect } from 'react';
import { OrchestratorMessage } from '@/lib/agents/fef-orchestrator';

interface LiveAgentCommunicationStreamProps {
  messages: OrchestratorMessage[];
}

export const LiveAgentCommunicationStream: React.FC<LiveAgentCommunicationStreamProps> = ({ messages }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="bg-[#09111c]/90 border border-white/[0.06] rounded-2xl p-4 shadow-xl flex flex-col h-[380px] backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-3">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide uppercase font-mono">
            LIVE AGENT COMMUNICATION & DEBATE CHANNEL
          </h3>
        </div>
        <div className="flex items-center space-x-2 text-[9px] font-mono">
          <span className="bg-[#05070c] text-cyan-300 border border-white/[0.06] px-2 py-0.5 rounded">
            SIMULATION MODE • LOCAL MULTI-AGENT ENGINE
          </span>
          <span className="text-emerald-400 font-bold">● ACTIVE</span>
        </div>
      </div>

      {/* Message Feed Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2.5 pr-1.5 font-mono text-[11px] scrollbar-thin scrollbar-thumb-gray-800"
      >
        {messages.map((msg) => {
          const isBullish = msg.bias === 'BULLISH';
          const isRestricted = msg.bias === 'RESTRICTED';

          return (
            <div
              key={msg.id}
              className="bg-[#05070c]/90 border border-white/[0.04] hover:border-cyan-500/30 rounded-xl p-3 transition-all space-y-1.5"
            >
              {/* Agent, Event & Timestamp */}
              <div className="flex flex-wrap items-center justify-between gap-1 text-[9.5px]">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-cyan-300 tracking-wider">
                    {msg.agent}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="text-gray-400 font-mono text-[8.5px]">
                    EVENT: <span className="text-amber-300">{msg.eventType}</span>
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-1.5 py-0.2 rounded font-bold text-[8.5px] ${
                      isRestricted
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800'
                        : isBullish
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                        : 'bg-gray-800 text-gray-300 border border-gray-700'
                    }`}
                  >
                    {msg.bias} ({msg.confidence}%)
                  </span>
                  <span className="text-gray-500 text-[8.5px]">{msg.timestamp}</span>
                </div>
              </div>

              {/* Observation text */}
              <p className="text-gray-200 text-[11px] leading-relaxed border-l-2 border-cyan-500/40 pl-2 font-sans">
                {msg.observation}
              </p>

              {/* Impact statement */}
              <div className="text-[9.5px] text-gray-400 pl-2">
                <span className="text-gray-500">Impact: </span>
                <span className="text-gray-300">{msg.impact}</span>
              </div>

              {/* Response Target Links */}
              {msg.responseTargets && msg.responseTargets.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.04] text-[8.5px] text-gray-400">
                  <span className="text-gray-600">Inter-Agent Routing:</span>
                  {msg.responseTargets.map((target, idx) => (
                    <span
                      key={idx}
                      className="bg-[#09111c] text-cyan-400 px-1.5 py-0.2 rounded border border-white/[0.04]"
                    >
                      ➔ {target}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
