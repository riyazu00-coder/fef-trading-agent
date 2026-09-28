'use client';

import React, { useState, useEffect } from 'react';

export interface FinalOrderConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (token: string) => Promise<void>;
  artifact: {
    token: string;
    expiresAt: number;
    order: {
      canonicalSymbol: string;
      brokerSymbol: string;
      direction: 'BUY' | 'SELL';
      orderType: string;
      volume: number;
      entryPrice: number;
      stopLoss: number;
      takeProfit1: number;
      takeProfit2?: number;
      takeProfit3?: number;
      accountId: string;
      brokerServer: string;
      tradeMode: 'DEMO' | 'REAL';
      evidenceTrust: number;
    };
    summary: {
      symbol: string;
      direction: 'BUY' | 'SELL';
      lots: number;
      entry: number;
      sl: number;
      tp1: number;
      accountMode: 'DEMO' | 'REAL';
      isRealAccount: boolean;
    };
  } | null;
  isSending?: boolean;
}

export const FinalOrderConfirmationModal: React.FC<FinalOrderConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  artifact,
  isSending = false,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);
  const [hasAcknowledged, setHasAcknowledged] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !artifact) return;

    setHasAcknowledged(false);
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((artifact.expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        onClose();
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isOpen, artifact, onClose]);

  if (!isOpen || !artifact) return null;

  const { order, summary } = artifact;
  const isBuy = order.direction === 'BUY';
  const isReal = summary.isRealAccount || order.tradeMode === 'REAL';
  const riskDistance = Math.abs(order.entryPrice - order.stopLoss);
  const rewardDistance = Math.abs(order.takeProfit1 - order.entryPrice);
  const calculatedRr = riskDistance > 0 ? (rewardDistance / riskDistance).toFixed(2) : 'N/A';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in font-mono">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-[#0B0F19] p-6 shadow-2xl space-y-5">
        {/* Glow ambient accent */}
        <div
          className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none ${
            isBuy ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2">
            <span
              className={`w-3 h-3 rounded-full animate-ping ${
                isBuy ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            />
            <h2 className="text-sm font-bold tracking-wider text-white uppercase">
              FINAL ORDER CONFIRMATION GATE
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-400">EXPIRES IN:</span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                secondsRemaining <= 10
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50 animate-pulse'
                  : 'bg-slate-800 text-amber-300 border border-amber-500/30'
              }`}
            >
              {secondsRemaining}s
            </span>
          </div>
        </div>

        {/* Real Account Alert Banner */}
        {isReal ? (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/50 text-amber-200 text-xs space-y-1">
            <div className="flex items-center space-x-2 font-bold text-amber-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>LIVE REAL CAPITAL EXECUTION</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-300">
              You are authorizing an order on a <strong>LIVE REAL MT5 ACCOUNT</strong>. This execution will deploy genuine capital into the market with real financial risk.
            </p>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-300 text-[11px] flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span className="font-semibold">DEMO ACCOUNT EXECUTION</span>
            </div>
            <span className="text-[10px] text-slate-400">Server: {order.brokerServer}</span>
          </div>
        )}

        {/* Order Details Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-black/40 p-4 rounded-xl border border-white/5">
          <div>
            <span className="text-slate-400 block text-[10px]">SYMBOL</span>
            <div className="flex items-baseline space-x-1.5 mt-0.5">
              <span className="font-bold text-white text-sm">{order.canonicalSymbol}</span>
              {order.brokerSymbol !== order.canonicalSymbol && (
                <span className="text-[10px] text-slate-400">({order.brokerSymbol})</span>
              )}
            </div>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px]">DIRECTION & TYPE</span>
            <span
              className={`inline-block font-bold mt-0.5 px-2 py-0.5 rounded text-xs ${
                isBuy
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-950 text-rose-300 border border-rose-500/40'
              }`}
            >
              {order.direction} ({order.orderType})
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px]">VOLUME</span>
            <span className="font-bold text-white text-sm mt-0.5 block">{order.volume} Lots</span>
          </div>

          <div>
            <span className="text-slate-400 block text-[10px]">ENTRY PRICE</span>
            <span className="font-bold text-cyan-300 text-sm mt-0.5 block">{order.entryPrice}</span>
          </div>

          <div className="border-t border-white/5 pt-2">
            <span className="text-slate-400 block text-[10px]">STOP LOSS</span>
            <span className="font-bold text-rose-400 text-xs mt-0.5 block">{order.stopLoss}</span>
          </div>

          <div className="border-t border-white/5 pt-2">
            <span className="text-slate-400 block text-[10px]">TAKE PROFIT (TP1)</span>
            <span className="font-bold text-emerald-400 text-xs mt-0.5 block">{order.takeProfit1}</span>
          </div>

          <div className="col-span-2 flex items-center justify-between border-t border-white/10 pt-2 text-[11px]">
            <span className="text-slate-400">Risk / Reward Ratio:</span>
            <span className="font-bold text-white">1:{calculatedRr}</span>
          </div>
        </div>

        {/* Human Acknowledgement Checkbox */}
        <div className="flex items-start space-x-2 pt-1">
          <input
            id="order-ack-checkbox"
            type="checkbox"
            checked={hasAcknowledged}
            onChange={(e) => setHasAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-black cursor-pointer"
          />
          <label htmlFor="order-ack-checkbox" className="text-[11px] text-slate-300 cursor-pointer select-none">
            I verify that all order parameters, stop loss, and take profit levels are correct and authorize dispatch.
          </label>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="w-1/2 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 hover:bg-slate-800 text-slate-300 text-xs font-semibold tracking-wider transition-all disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={() => onConfirm(artifact.token)}
            disabled={!hasAcknowledged || secondsRemaining === 0 || isSending}
            className={`w-1/2 py-2.5 rounded-xl text-xs font-bold tracking-wider transition-all shadow-lg flex items-center justify-center space-x-1.5 ${
              isBuy
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white'
                : 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {isSending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>DISPATCHING...</span>
              </>
            ) : (
              <span>CONFIRM & SEND ORDER</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
