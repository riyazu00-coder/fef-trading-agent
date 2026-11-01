'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
}

export const AiAssistantPanel: React.FC = () => {
  const { activeSymbol, activeAsset } = useActiveAsset();
  const { telemetry } = useMT5Telemetry();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Preset institutional queries
  const presetQueries = [
    `Why is ${activeSymbol} directional bias formed?`,
    `Which independent agents confirm ${activeSymbol}?`,
    `What is currently blocking a valid setup for ${activeSymbol}?`,
    `Compare ${activeSymbol} with BTCUSD market structure`,
    `Explain the Decision Engine V2 rationale for ${activeSymbol}`,
    `Check ${activeSymbol} Setup Intelligence against the 2.0:1 R:R policy`,
  ];

  useEffect(() => {
    // Initial welcome message
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `**FEF CORTEX Institutional AI Assistant Online**.\n\nI am connected to your live Exness MT5 terminal and CORTEX intelligence pipeline. You can ask me to evaluate directional biases, inspect the 32-agent consensus, analyze Decision Engine V2 outputs, or audit Setup Intelligence V3 setups.\n\n*Zero-Cost Compliance Notice: Third-party OpenAI API calls are disabled by default (\`OPENAI_ENABLED=false\`, daily budget \`$0.00\`). All core CORTEX trading intelligence, agent consensus, and risk policies run entirely locally without external API expenditure.*`,
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    // Check status
    fetch('/api/intelligence/assistant/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setStatusInfo(data);
        }
      })
      .catch(() => {});
  }, [activeSymbol]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (promptToSend?: string) => {
    const text = (promptToSend || inputPrompt).trim();
    if (!text || isLoading) return;

    const userMessage: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/intelligence/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          symbol: activeSymbol,
          conversationHistory: messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (data.success) {
        const assistantMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: data.answer,
          timestamp: new Date().toLocaleTimeString(),
          model: data.model,
          tokensUsed: data.tokensUsed?.totalTokens,
          costUsd: data.estimatedCostUsd,
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const isZeroCostDisabled = data.errorCode === 'OPENAI_DISABLED' || data.errorCode === 'BUDGET_EXCEEDED';
        const errMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: isZeroCostDisabled
            ? `🛡️ **Zero-Cost Policy Enforcement (${data.errorCode})**:\n\n${data.error}\n\n*Note: All 32 agents, Decision Engine V2, Setup Intelligence V3, and deterministic reports remain 100% operational with zero external costs.*`
            : `⚠️ **Advisory Engine Notice (${data.errorCode || 'UNAVAILABLE'})**:\n\n${data.error}\n\n*Tip: To activate dynamic GPT-5 synthesis, configure \`OPENAI_API_KEY\` and set \`OPENAI_ENABLED=true\` after explicit project-owner approval.*`,
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: 'assistant',
          content: `❌ **Connection Error**: ${err.message}. Network request failed.`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isConfigured = statusInfo?.configured;
  const isEnabled = statusInfo?.enabled;
  const requestedModel = statusInfo?.requestedModel || 'gpt-5';

  return (
    <div className="bg-[#070f1e] rounded-2xl border border-white/10 shadow-2xl flex flex-col h-[700px] overflow-hidden">
      {/* Header Deck */}
      <div className="p-3 border-b border-white/10 bg-black/40 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
            🤖
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xs font-black tracking-wider uppercase text-cyan-300 font-mono">
                FEF CORTEX AI ASSISTANT
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                {requestedModel.toUpperCase()}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 font-mono">
              Institutional Advisory Layer · READ_ONLY · Context-Grounded
            </p>
          </div>
        </div>

        {/* Current Context Pill & Observability */}
        <div className="flex items-center space-x-2 font-mono text-[10px]">
          <div className="bg-black/60 px-2.5 py-1 rounded-lg border border-white/10 text-gray-300 flex items-center space-x-1.5">
            <span className="text-cyan-400">Context:</span>
            <span className="font-bold text-white">{activeSymbol}</span>
            <span className="text-gray-500">·</span>
            <span className={activeAsset.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {activeAsset.price}
            </span>
          </div>

          <div className={`px-2 py-1 rounded-lg border flex items-center space-x-1 ${
            !isEnabled
              ? 'bg-zinc-800/80 border-zinc-600/40 text-zinc-400'
              : isConfigured
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            <span>●</span>
            <span>
              {!isEnabled ? 'DISABLED (ZERO-COST)' : (isConfigured ? 'API ACTIVE' : 'KEY REQUIRED')}
            </span>
          </div>
        </div>
      </div>

      {/* Preset Queries Pill Bar */}
      <div className="px-3 py-2 bg-black/20 border-b border-white/5 flex gap-1.5 overflow-x-auto no-scrollbar">
        {presetQueries.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(q)}
            disabled={isLoading}
            className="whitespace-nowrap px-2.5 py-1 rounded-md bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/40 text-[10px] text-gray-300 hover:text-cyan-200 font-mono transition-all disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Chat Messages Stream */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center space-x-1.5 mb-1 px-1 font-mono text-[9px] text-gray-500">
              <span>{m.role === 'user' ? 'ANALYST' : 'CORTEX AI'}</span>
              <span>·</span>
              <span>{m.timestamp}</span>
              {m.tokensUsed && (
                <>
                  <span>·</span>
                  <span>{m.tokensUsed} tokens</span>
                  <span>·</span>
                  <span>${(m.costUsd || 0).toFixed(4)}</span>
                </>
              )}
            </div>

            <div
              className={`p-3 rounded-xl max-w-[85%] text-xs leading-relaxed border relative group ${
                m.role === 'user'
                  ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-100 rounded-br-none'
                  : 'bg-black/50 border-white/10 text-gray-200 rounded-bl-none shadow-lg'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>

              {m.role === 'assistant' && (
                <button
                  onClick={() => handleCopy(m.id, m.content)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-1.5 py-0.5 rounded border border-white/10 text-[9px] font-mono text-gray-400 hover:text-white"
                >
                  {copiedId === m.id ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 p-2 bg-black/40 border border-white/5 rounded-xl w-fit font-mono text-xs text-cyan-300">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span>Consulting CORTEX telemetry and formulating institutional response...</span>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input Deck */}
      <div className="p-3 border-t border-white/10 bg-black/60">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder={`Ask CORTEX Assistant about ${activeSymbol} direction, agents, vetoes, or setups...`}
            disabled={isLoading}
            className="flex-1 bg-black/80 border border-white/15 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 font-mono outline-none transition-all disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={isLoading || !inputPrompt.trim()}
            className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 hover:border-cyan-400 text-cyan-300 font-mono text-xs font-bold rounded-xl transition-all disabled:opacity-40 cursor-pointer"
          >
            Ask AI
          </button>
        </form>

        <div className="flex items-center justify-between mt-2 font-mono text-[9px] text-gray-500 px-1">
          <span>Advisory Only · READ_ONLY Invariant · Zero Order Authority</span>
          {statusInfo?.budgetMetrics && (
            <span>
              Daily Budget: ${statusInfo.budgetMetrics.dailyBudgetUsd.toFixed(2)} ({!isEnabled ? 'Zero-Cost Policy' : `Remaining: $${statusInfo.budgetMetrics.budgetRemainingUsd.toFixed(2)}`})
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
