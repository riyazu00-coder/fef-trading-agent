import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { useMT5Telemetry } from '@/context/MT5TelemetryContext';
import { resolvePriceForPurpose } from '@/lib/price/price-authority';

export const ExecutionControlCard: React.FC = () => {
  const router = useRouter();
  const { activeSymbol, assetProfile, activeAsset } = useActiveAsset();
  const { telemetry, activeTelemetry, isMt5Connected } = useMT5Telemetry();
  const [riskPercent, setRiskPercent] = useState('0.50%');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executed, setExecuted] = useState(false);

  const direction: 'BUY' | 'SELL' = assetProfile.setupDirection.includes('SELL') ? 'SELL' : 'BUY';
  const brokerQuote = activeTelemetry?.quote || telemetry.allQuotes[activeSymbol] || telemetry.allQuotes[activeSymbol.toUpperCase()];
  const heartbeatAgeMs = typeof telemetry.heartbeatAgeMs === 'number'
    ? telemetry.heartbeatAgeMs
    : telemetry.terminal?.lastHeartbeat
      ? (Date.now() - new Date(telemetry.terminal.lastHeartbeat).getTime())
      : null;

  const execResolution = resolvePriceForPurpose(activeSymbol, 'EXECUTION', {
    side: direction,
    direction,
    referenceAsset: activeAsset,
    brokerQuote,
    isMt5Connected,
    terminalConnected: telemetry.terminal?.terminalConnected,
    bridgeConnected: telemetry.localBridgeOnline,
    heartbeatAgeMs,
    isStale: brokerQuote?.isStale,
    operatingMode: telemetry.operatingMode,
    brokerName: telemetry.account?.broker || telemetry.terminal?.brokerName,
    brokerServer: telemetry.terminal?.brokerServer
  });

  const sessionState = assetProfile?.sessionState;
  const isAnalysisOnly = assetProfile?.actionabilityState === 'ANALYSIS ONLY';
  const isTradeExecutable = assetProfile?.tradeExecutable !== false && (sessionState ? sessionState.tradeExecutable : true) && !isAnalysisOnly;

  const handleDeploy = () => {
    if (!isTradeExecutable) return; // Strict frontend gate
    setIsExecuting(true);

    if (isMt5Connected) {
      // Direct user to execution gateway
      setTimeout(() => {
        setIsExecuting(false);
        router.push('/execution');
      }, 500);
      return;
    }

    // Paper simulation execution
    setTimeout(() => {
      setIsExecuting(false);
      setExecuted(true);
      if (typeof window !== 'undefined') {
        const paperTrade = {
          id: `sim-${Date.now()}`,
          ticket: Math.floor(90000000 + Math.random() * 9000000),
          symbol: activeSymbol,
          type: direction,
          openPrice: (execResolution.executable && execResolution.price > 0) ? execResolution.price : (activeAsset?.price || 0),
          lots: 0.5,
          sl: assetProfile?.stopLoss || 0,
          tp: assetProfile?.tp1 || 0,
          openTime: new Date().toISOString(),
          status: 'SIMULATED_DEMO',
          comment: 'FEF PAPER GATE'
        };
        try {
          const existing = JSON.parse(window.localStorage.getItem('fef_paper_positions') || '[]');
          existing.unshift(paperTrade);
          window.localStorage.setItem('fef_paper_positions', JSON.stringify(existing.slice(0, 50)));
        } catch {}
      }
      setTimeout(() => setExecuted(false), 3000);
    }, 800);
  };

  const entryDisplay = execResolution.executable && execResolution.price > 0
    ? `$${execResolution.price.toFixed(execResolution.canonical?.digits || 2)}`
    : assetProfile?.entryZone ? `$${assetProfile.entryZone[0]}` : (activeAsset?.price ? `$${activeAsset.price}` : '--');
  const slDisplay = assetProfile?.stopLoss ? `$${assetProfile.stopLoss}` : '--';
  const tp1Display = assetProfile?.tp1 ? `${assetProfile.tp1}` : '--';
  const tp2Display = assetProfile?.tp2 ? `${assetProfile.tp2}` : '--';
  const tp3Display = assetProfile?.tp3 ? `${assetProfile.tp3}` : '--';

  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            EXECUTION CONTROL ({activeSymbol})
          </h3>
        </div>
        <div className="flex items-center space-x-1.5">
          {sessionState && !isTradeExecutable && (
            <span className="text-[7.5px] bg-rose-950/60 text-rose-300 border border-rose-500/40 px-1.5 py-0.2 rounded font-mono font-bold">
              {isAnalysisOnly ? 'ANALYSIS ONLY' : sessionState.statusLabel}
            </span>
          )}
          {isMt5Connected ? (
            <span className="text-[8px] bg-emerald-950/60 text-[#34D399] border border-emerald-500/40 px-1.5 py-0.2 rounded flex items-center space-x-1 font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{`${telemetry.account?.broker && telemetry.account.broker !== 'UNKNOWN BROKER' ? telemetry.account.broker : 'MT5'} (${telemetry.account?.maskedLogin ? telemetry.account.maskedLogin + ' • ' : ''}BRIDGE READY)`}</span>
            </span>
          ) : (
            <span className="text-[8px] bg-amber-950/60 text-[#FBBF24] border border-amber-500/40 px-1.5 py-0.2 rounded flex items-center space-x-1 font-mono font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>MT5 STANDBY</span>
            </span>
          )}
        </div>
      </div>

      {/* Risk Budget Slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9.5px]">
          <span className="text-gray-400">Account Risk Budget</span>
          <span className="text-cyan-300 font-bold">0.50% ($512.25 Max)</span>
        </div>
        <div className="flex items-center justify-between gap-1 text-[8.5px]">
          {['0.25%', '0.50%', '1.00%', '1.50%'].map((rp) => (
            <button
              key={rp}
              onClick={() => setRiskPercent(rp)}
              className={`flex-1 py-0.5 rounded border transition-all ${
                riskPercent === rp
                  ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400 font-bold shadow-[0_0_8px_rgba(0,240,255,0.4)]'
                  : 'bg-black/30 text-gray-400 border-white/5 hover:text-white'
              }`}
            >
              {rp}
            </button>
          ))}
        </div>
      </div>

      {/* Blueprint Visual Summary */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-black/40 p-1.5 rounded-xl border border-white/5">
          <div className="text-[7.5px] text-gray-400">Entry Reference</div>
          <div className="text-[9.5px] font-bold text-white mt-0.5">{entryDisplay}</div>
        </div>
        <div className="bg-black/40 p-1.5 rounded-xl border border-white/5">
          <div className="text-[7.5px] text-gray-400">Stop Loss</div>
          <div className="text-[9.5px] font-bold text-rose-400 mt-0.5">{slDisplay}</div>
        </div>
        <div className="bg-black/40 p-1.5 rounded-xl border border-white/5">
          <div className="text-[7.5px] text-gray-400">Est. Reward</div>
          <div className="text-[9.5px] font-bold text-emerald-400 mt-0.5">+$1,459.91</div>
        </div>
      </div>

      {/* Target Brackets */}
      <div className="text-[8.5px] text-gray-400 flex items-center justify-between px-1">
        <span>TP1 (50%): <strong className="text-gray-200">{tp1Display}</strong></span>
        <span>&bull;</span>
        <span>TP2 (30%): <strong className="text-gray-200">{tp2Display}</strong></span>
        <span>&bull;</span>
        <span>TP3 (20%): <strong className="text-gray-200">{tp3Display}</strong></span>
      </div>

      {/* 1-Click Deploy Button */}
      <button
        onClick={handleDeploy}
        disabled={!isTradeExecutable || isExecuting}
        className={`w-full py-2.5 rounded-xl font-mono text-xs font-black transition-all flex items-center justify-center space-x-2 border ${
          !isTradeExecutable
            ? 'bg-rose-950/40 border-rose-500/40 text-rose-300/80 cursor-not-allowed shadow-none'
            : executed
            ? 'bg-cyan-600 text-white shadow-[0_0_20px_rgba(0,240,255,0.7)] border-white/10'
            : isExecuting
            ? 'bg-emerald-700 text-white animate-pulse border-white/10'
            : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.5)] border-white/10'
        }`}
      >
        <span>{!isTradeExecutable ? '🔒' : '⚡'}</span>
        <span suppressHydrationWarning>
          {!isTradeExecutable
            ? isAnalysisOnly
              ? 'ANALYSIS ONLY — EXECUTION LOCKED'
              : sessionState?.marketState === 'PRE_OPEN'
              ? `PRE-OPEN WATCH (OPENS IN ${sessionState?.nextOpenCountdown || '15m'})`
              : `MARKET CLOSED (OPENS IN ${sessionState?.nextOpenCountdown || 'SESSION REOPEN'})`
            : executed
            ? 'ORDER ARCHIVED TO TRADE JOURNAL'
            : isExecuting
            ? 'ROUTING TO MT5 GATEWAY...'
            : isMt5Connected
            ? `PROCEED TO MT5 EXECUTION (${telemetry.account?.broker || 'BROKER'}) ⚡`
            : '1-CLICK SIMULATE ORDER (PAPER GATE)'}
        </span>
      </button>
    </div>
  );
};
