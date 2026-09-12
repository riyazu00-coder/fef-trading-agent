'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AgentDialogueMessage, AgentType } from '@/lib/agents/agent-types';
import { INITIAL_DIALOGUE, SIMULATED_DIALOGUE_POOL } from '@/lib/agents/agent-swarm';

interface AgentDebateFeedProps {
  onAgentTalk?: (agentType: AgentType) => void;
}

export const AgentDebateFeed: React.FC<AgentDebateFeedProps> = ({ onAgentTalk }) => {
  const [messages, setMessages] = useState<AgentDialogueMessage[]>(INITIAL_DIALOGUE);
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
  const [filterAgent, setFilterAgent] = useState<string>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);
  const poolIndexRef = useRef<number>(0);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Real-time inter-agent conversation simulation loop
  useEffect(() => {
    if (!isLiveActive) return;

    const interval = setInterval(() => {
      const poolItem = SIMULATED_DIALOGUE_POOL[poolIndexRef.current % SIMULATED_DIALOGUE_POOL.length];
      poolIndexRef.current += 1;

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

      const newMessage: AgentDialogueMessage = {
        id: `msg-${Date.now()}`,
        timestamp: timeStr,
        sender: poolItem.sender,
        recipient: poolItem.recipient,
        message: poolItem.message,
        bias: poolItem.bias,
        confidence: poolItem.confidence,
        tags: poolItem.tags
      };

      setMessages((prev) => [...prev.slice(-40), newMessage]); // Keep last 40 dialogue steps
      if (onAgentTalk) {
        onAgentTalk(poolItem.sender);
      }
    }, 4500); // New message every 4.5 seconds

    return () => clearInterval(interval);
  }, [isLiveActive, onAgentTalk]);

  const triggerManualDebate = () => {
    const poolItem = SIMULATED_DIALOGUE_POOL[Math.floor(Math.random() * SIMULATED_DIALOGUE_POOL.length)];
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newMessage: AgentDialogueMessage = {
      id: `msg-${Date.now()}`,
      timestamp: timeStr,
      sender: poolItem.sender,
      recipient: poolItem.recipient,
      message: `[ON-DEMAND RE-EVALUATION] ${poolItem.message}`,
      bias: poolItem.bias,
      confidence: poolItem.confidence,
      tags: poolItem.tags
    };
    setMessages((prev) => [...prev, newMessage]);
    if (onAgentTalk) onAgentTalk(poolItem.sender);
  };

  const filteredMessages = filterAgent === 'ALL'
    ? messages
    : messages.filter((m) => m.sender === filterAgent || m.recipient === filterAgent);

  const getAgentColor = (sender: AgentType) => {
    switch (sender) {
      case 'TECHNICAL': return 'text-cyan-400 border-cyan-800 bg-cyan-950/40';
      case 'MACRO': return 'text-blue-400 border-blue-800 bg-blue-950/40';
      case 'CORRELATION': return 'text-indigo-400 border-indigo-800 bg-indigo-950/40';
      case 'RISK': return 'text-amber-400 border-amber-800 bg-amber-950/40';
      case 'NEWS': return 'text-emerald-400 border-emerald-800 bg-emerald-950/40';
      case 'INSTITUTIONAL': return 'text-purple-400 border-purple-800 bg-purple-950/40';
      case 'VISION': return 'text-pink-400 border-pink-800 bg-pink-950/40';
      case 'FINAL_DECISION': return 'text-gold border-yellow-700 bg-yellow-950/50 font-bold';
      default: return 'text-gray-300 border-gray-800 bg-gray-900';
    }
  };

  return (
    <div className="bg-[#0b101d] border border-cyan-950/70 rounded-xl p-4 shadow-2xl flex flex-col h-[340px]">
      {/* Header with live toggle and debate actions */}
      <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${isLiveActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`}></span>
          <h3 className="text-xs uppercase tracking-wider text-cyan-300 font-bold">
            Live Inter-Agent Dialogue & Debate Stream
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsLiveActive(!isLiveActive)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              isLiveActive
                ? 'bg-emerald-950 text-emerald-400 border-emerald-700 hover:bg-emerald-900'
                : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
            }`}
          >
            {isLiveActive ? '● Streaming (Active)' : '○ Paused'}
          </button>
          <button
            onClick={triggerManualDebate}
            className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 hover:bg-cyan-900 transition-colors"
          >
            Trigger Debate Step
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1.5 mb-2 text-[9px] border-b border-gray-800/60 scrollbar-none">
        <span className="text-gray-500 mr-1">Filter:</span>
        {['ALL', 'TECHNICAL', 'MACRO', 'CORRELATION', 'RISK', 'INSTITUTIONAL', 'FINAL_DECISION'].map((f) => (
          <button
            key={f}
            onClick={() => setFilterAgent(f)}
            className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
              filterAgent === f
                ? 'bg-cyan-600 text-white font-bold'
                : 'bg-gray-900 text-gray-400 hover:text-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Dialogue Message Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 text-[11px] font-mono scrollbar-thin scrollbar-thumb-gray-800"
      >
        {filteredMessages.map((msg) => {
          const badgeStyle = getAgentColor(msg.sender);
          const isCentral = msg.sender === 'FINAL_DECISION';

          return (
            <div
              key={msg.id}
              className={`p-2 rounded border transition-all ${
                isCentral
                  ? 'bg-yellow-950/20 border-yellow-800/80 shadow-md'
                  : 'bg-[#060a12]/90 border-gray-800/80 hover:border-gray-700'
              }`}
            >
              {/* Message Meta Info */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1.5">
                  <span className={`px-1.5 py-0.2 text-[9px] rounded border ${badgeStyle}`}>
                    {msg.sender}
                  </span>
                  {msg.recipient && (
                    <>
                      <span className="text-gray-500 text-[9px]">➔</span>
                      <span className="text-gray-400 text-[9px] font-semibold">
                        {msg.recipient}
                      </span>
                    </>
                  )}
                  <span className="text-gray-600 text-[9px]">{msg.timestamp}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <span
                    className={`text-[9px] px-1 rounded ${
                      msg.bias === 'BULLISH'
                        ? 'text-emerald-400 bg-emerald-950/60'
                        : msg.bias === 'CAUTION'
                        ? 'text-amber-400 bg-amber-950/60'
                        : 'text-red-400 bg-red-950/60'
                    }`}
                  >
                    {msg.bias} ({msg.confidence}%)
                  </span>
                </div>
              </div>

              {/* Dialogue Content */}
              <p className="text-gray-200 leading-snug pl-1 border-l-2 border-cyan-800/50">
                {msg.message}
              </p>

              {/* Tags */}
              {msg.tags && msg.tags.length > 0 && (
                <div className="flex items-center space-x-1 mt-1 pl-1">
                  {msg.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[8.5px] bg-gray-900 text-gray-400 px-1.5 py-0.2 rounded border border-gray-800"
                    >
                      #{tag}
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
