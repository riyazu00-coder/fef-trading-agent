'use client';

import React, { useState, useEffect } from 'react';
import { calculateSniperOrderTicket, SniperOrderTicket } from '@/lib/agents/sniper-trade-engine';

interface FastTradeExecutionStationProps {
  symbol: string;
  currentPrice: number;
  glassIntensity?: 'GHOST_GLASS' | 'ULTRA_CLEAR' | 'CRYSTAL' | 'TINTED';
}

export const FastTradeExecutionStation: React.FC<FastTradeExecutionStationProps> = ({
  symbol,
  currentPrice,
  glassIntensity = 'GHOST_GLASS'
}) => {
  const [riskPercent, setRiskPercent] = useState<number>(0.50);
  const [ticket, setTicket] = useState<SniperOrderTicket>(
    calculateSniperOrderTicket(symbol, 'BUY', currentPrice, 102450.00, 0.50)
  );
  const [deployedOrders, setDeployedOrders] = useState<SniperOrderTicket[]>([]);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);

  // Recalculate ticket when price or risk changes
  useEffect(() => {
    setTicket(calculateSniperOrderTicket(symbol, 'BUY', currentPrice, 102450.00, riskPercent));
  }, [symbol, currentPrice, riskPercent]);

  const handleDeployOrder = () => {
    setIsDeploying(true);
    setTimeout(() => {
      const activeTicket: SniperOrderTicket = {
        ...ticket,
        status: 'DEPLOYED_TO_MT5'
      };
      setDeployedOrders((prev) => [activeTicket, ...prev]);
      setIsDeploying(false);
    }, 500);
  };

  const handleCancelOrder = (id: string) => {
    setDeployedOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const formatPrice = (p: number) => {
    return p.toLocaleString(undefined, {
      minimumFractionDigits: p > 100 ? 2 : 4,
      maximumFractionDigits: p > 100 ? 2 : 4
    });
  };

  const glassBg = glassIntensity === 'GHOST_GLASS'
    ? 'bg-black/15 backdrop-blur-[6px]'
    : glassIntensity === 'ULTRA_CLEAR'
    ? 'bg-black/25 backdrop-blur-md'
    : glassIntensity === 'TINTED'
    ? 'bg-black/60 backdrop-blur-xl'
    : 'bg-black/35 backdrop-blur-lg';

  return (
    <div className={`${glassBg} border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_1px_0_rgba(255,255,255,0.25)] rounded-2xl p-4 font-mono space-y-3 transition-all`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center space-x-2">
          <span className="text-base drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">🎯</span>
          <div>
            <span className="text-[9px] text-cyan-400 uppercase tracking-widest block font-bold drop-shadow">
              Opportunity Sniper & Trade Execution
            </span>
            <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
              1-CLICK FAST TRADE STATION ({symbol})
            </h3>
          </div>
        </div>
        <div className="text-right text-[9px]">
          <span className="bg-emerald-950/60 text-emerald-300 px-2.5 py-0.5 rounded-lg border border-emerald-400/60 font-bold shadow-[0_0_10px_rgba(16,185,129,0.5)] backdrop-blur-sm flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span>EXNESS MT5 BRIDGE CONNECTED</span>
          </span>
        </div>
      </div>

      {/* Interactive Risk Slider & Lot Calculation (Pure Glass Panel) */}
      <div className="bg-black/20 backdrop-blur-md p-2.5 rounded-xl border border-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] space-y-1.5 text-[10px]">
        <div className="flex justify-between items-center">
          <span className="text-gray-200 drop-shadow">Account Risk Budget:</span>
          <span className="text-amber-300 font-bold drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]">
            {riskPercent.toFixed(2)}% (${ticket.riskDollars.toFixed(2)} Max Risk)
          </span>
        </div>

        <input
          type="range"
          min="0.25"
          max="1.50"
          step="0.05"
          value={riskPercent}
          onChange={(e) => setRiskPercent(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-gray-700/80 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />

        <div className="flex justify-between text-[8px] text-gray-200 drop-shadow">
          <span>0.25% (Conservative)</span>
          <span>0.50% (Recommended)</span>
          <span>1.00%</span>
          <span>1.50% (Max)</span>
        </div>
      </div>

      {/* Pre-Calculated Order Ticket Summary (Pure Glass Chips) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px]">
        <div className="bg-black/20 backdrop-blur-md p-2 rounded-xl border border-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
          <span className="text-gray-200 block text-[8px] drop-shadow">LIMIT ENTRY</span>
          <span className="text-white font-black text-xs font-mono drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">${formatPrice(ticket.entryPrice)}</span>
        </div>
        <div className="bg-black/20 backdrop-blur-md p-2 rounded-xl border border-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
          <span className="text-gray-200 block text-[8px] drop-shadow">VOLATILITY SL</span>
          <span className="text-rose-400 font-black text-xs font-mono drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">${formatPrice(ticket.stopLossPrice)}</span>
        </div>
        <div className="bg-black/20 backdrop-blur-md p-2 rounded-xl border border-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
          <span className="text-gray-200 block text-[8px] drop-shadow">RECOMMENDED LOTS</span>
          <span className="text-cyan-300 font-black text-xs font-mono drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">{ticket.recommendedLots} Lots</span>
        </div>
        <div className="bg-black/20 backdrop-blur-md p-2 rounded-xl border border-white/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
          <span className="text-gray-200 block text-[8px] drop-shadow">ESTIMATED REWARD</span>
          <span className="text-emerald-300 font-black text-xs font-mono drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">+${ticket.estimatedRewardDollars}</span>
        </div>
      </div>

      {/* Tiered Take Profits Preview (Pure Glass Bar) */}
      <div className="bg-black/20 backdrop-blur-md p-2 rounded-xl border border-white/15 flex flex-wrap items-center justify-between text-[9px] gap-2 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
        <div className="flex items-center space-x-1.5">
          <span className="text-emerald-300 font-bold drop-shadow">TP1 (50% Out):</span>
          <span className="text-white font-mono font-semibold drop-shadow">${formatPrice(ticket.tp1Price)}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-emerald-300 font-bold drop-shadow">TP2 (30% Out):</span>
          <span className="text-white font-mono font-semibold drop-shadow">${formatPrice(ticket.tp2Price)}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-emerald-300 font-bold drop-shadow">TP3 (20% Runner):</span>
          <span className="text-white font-mono font-semibold drop-shadow">${formatPrice(ticket.tp3Price)}</span>
        </div>
        <div className="text-cyan-300 font-bold drop-shadow">R:R {ticket.riskRewardRatio}</div>
      </div>

      {/* Big 1-Click Execution Button */}
      <button
        onClick={handleDeployOrder}
        disabled={isDeploying}
        className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black py-2.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-[0_0_25px_rgba(16,185,129,0.5),inset_0_1px_1px_rgba(255,255,255,0.3)] flex items-center justify-center space-x-2 cursor-pointer active:scale-95 border border-emerald-400/50"
      >
        <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">{isDeploying ? 'DEPLOYING BRACKET ORDER...' : `⚡ 1-CLICK DEPLOY ${ticket.direction} ORDER VIA EXNESS MT5`}</span>
        <span className="text-[9.5px] bg-black/50 px-2 py-0.5 rounded font-mono font-normal border border-white/20">
          {ticket.recommendedLots} Lots • ${ticket.riskDollars} Risk
        </span>
      </button>

      {/* Active Deployed Orders Log */}
      {deployedOrders.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-white/10">
          <div className="flex justify-between items-center text-[9px] text-gray-200">
            <span className="uppercase font-bold text-emerald-300 drop-shadow">Active Live Positions ({deployedOrders.length})</span>
            <span className="text-cyan-300 drop-shadow">Bridge Active</span>
          </div>

          <div className="space-y-1 max-h-24 overflow-y-auto">
            {deployedOrders.map((order) => (
              <div
                key={order.id}
                className="bg-black/30 backdrop-blur-sm p-2 rounded-lg border border-emerald-400/50 flex items-center justify-between text-[9px]"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-emerald-300 font-black drop-shadow">
                      {order.direction} {order.recommendedLots} Lots {order.symbol}
                    </span>
                    <span className="text-gray-200">@ ${formatPrice(order.entryPrice)}</span>
                  </div>
                  <div className="text-gray-300 text-[8px]">
                    SL: ${formatPrice(order.stopLossPrice)} | TP1: ${formatPrice(order.tp1Price)}
                  </div>
                </div>

                <button
                  onClick={() => handleCancelOrder(order.id)}
                  className="bg-red-950/80 hover:bg-red-900 text-red-300 px-2 py-0.5 rounded border border-red-800 text-[8.5px] transition-colors"
                >
                  Close Position
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
