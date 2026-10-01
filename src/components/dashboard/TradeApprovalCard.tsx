'use client';

import React, { useState } from 'react';
import { TradeSetup } from '@/lib/agents/agent-types';

interface TradeApprovalCardProps {
  setup: TradeSetup;
}

export const TradeApprovalCard: React.FC<TradeApprovalCardProps> = ({ setup }) => {
  const [currentStatus, setCurrentStatus] = useState<TradeSetup['status']>(setup.status);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(setup.recommendedVolume);
  const [stopLoss, setStopLoss] = useState<number>(setup.stopLoss);
  const [tp1, setTp1] = useState<number>(setup.tp1);
  const [tp2, setTp2] = useState<number>(setup.tp2);

  const handleApprove = () => {
    setCurrentStatus('APPROVED');
  };

  const handleReject = () => {
    setCurrentStatus('REJECTED');
  };

  const handleSaveModified = () => {
    setCurrentStatus('MODIFIED');
    setIsEditing(false);
  };

  return (
    <div className="flex flex-col space-y-3">
      {/* 1. Final AI Decision & Human Gatekeeper Card */}
      <div className="bg-[#0b101d] border border-yellow-500/40 rounded-xl p-3.5 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-gold font-bold text-xs uppercase tracking-wider">
              Final Decision & Human Gatekeeper
            </span>
          </div>
          <span className="text-[9px] bg-red-950 text-red-400 border border-red-800 px-1.5 py-0.5 rounded font-bold">
            HUMAN APPROVAL REQUIRED
          </span>
        </div>

        {/* Action Header Status */}
        <div className="bg-gray-950 p-2.5 rounded-lg border border-gray-800 mb-2 flex items-center justify-between">
          <div>
            <div className="text-[10px] text-gray-400">Generated Signal:</div>
            <div className="text-base font-black text-emerald-400 tracking-wide">
              {setup.decision}
            </div>
            <div className="text-[9px] text-gray-400 font-mono">
              Zone: ${setup.entryZone[0].toFixed(2)} - ${setup.entryZone[1].toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-400">Status:</div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                currentStatus === 'APPROVED'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : currentStatus === 'REJECTED'
                  ? 'bg-red-950 text-red-400 border border-red-800'
                  : currentStatus === 'MODIFIED'
                  ? 'bg-amber-950 text-amber-400 border border-amber-800'
                  : 'bg-yellow-950 text-yellow-400 border border-yellow-800 animate-pulse'
              }`}
            >
              {currentStatus.replace('_', ' ')}
            </span>
            <div className="text-[9px] text-cyan-400 mt-0.5">R:R {setup.riskReward}</div>
          </div>
        </div>

        {/* Parameters Breakdown or Edit Mode */}
        {isEditing ? (
          <div className="bg-[#070e1b] p-2.5 rounded border border-cyan-800/80 mb-3 space-y-2 text-[10px]">
            <div className="text-cyan-300 font-bold">Modify Parameters:</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-gray-400 block text-[9px]">Volume (Lots):</label>
                <input
                  type="number"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-gray-400 block text-[9px]">Stop Loss ($):</label>
                <input
                  type="number"
                  step="0.5"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(parseFloat(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-gray-400 block text-[9px]">Take Profit 1 ($):</label>
                <input
                  type="number"
                  step="1"
                  value={tp1}
                  onChange={(e) => setTp1(parseFloat(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="text-gray-400 block text-[9px]">Take Profit 2 ($):</label>
                <input
                  type="number"
                  step="1"
                  value={tp2}
                  onChange={(e) => setTp2(parseFloat(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-white font-mono"
                />
              </div>
            </div>
            <div className="flex space-x-2 pt-1">
              <button
                onClick={handleSaveModified}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1 rounded text-[10px]"
              >
                Save & Update
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="bg-gray-800 text-gray-300 px-3 py-1 rounded text-[10px]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 text-[10px] mb-3">
            <div className="bg-[#070e1b] p-1.5 rounded border border-gray-800 text-center">
              <span className="text-gray-500 block text-[8.5px]">STOP LOSS</span>
              <span className="font-mono text-red-400 font-bold">${stopLoss.toFixed(2)}</span>
            </div>
            <div className="bg-[#070e1b] p-1.5 rounded border border-gray-800 text-center">
              <span className="text-gray-500 block text-[8.5px]">TP1 (Partial)</span>
              <span className="font-mono text-emerald-400 font-bold">${tp1.toFixed(2)}</span>
            </div>
            <div className="bg-[#070e1b] p-1.5 rounded border border-gray-800 text-center">
              <span className="text-gray-500 block text-[8.5px]">TP2 (Target)</span>
              <span className="font-mono text-emerald-400 font-bold">${tp2.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Human Confirmation Action Buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleApprove}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-black py-1.5 px-2 rounded text-xs transition-colors shadow-lg flex items-center justify-center space-x-1"
          >
            <span>✓ APPROVE</span>
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-1.5 px-2 rounded text-xs transition-colors shadow-lg flex items-center justify-center space-x-1"
          >
            <span>✎ MODIFY</span>
          </button>
          <button
            onClick={handleReject}
            className="bg-red-700 hover:bg-red-600 text-white font-bold py-1.5 px-2 rounded text-xs transition-colors shadow-lg flex items-center justify-center space-x-1"
          >
            <span>✕ REJECT</span>
          </button>
        </div>
      </div>

      {/* 2. MT5 Execution Bridge & Trading APIs */}
      <div className="bg-[#0b101d] border border-cyan-950/70 rounded-xl p-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2">
          <h4 className="text-[11px] uppercase tracking-wider text-cyan-400 font-bold flex items-center space-x-1">
            <span>🔌 Trading APIs & MT5 Bridge</span>
          </h4>
          <span className="text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-1.5 py-0.2 rounded font-mono">
            PAPER SIMULATOR
          </span>
        </div>

        <div className="space-y-1.5 text-[10px]">
          <div className="flex justify-between items-center bg-[#070e1b] p-1.5 rounded border border-gray-800">
            <span className="text-gray-400">Broker Platform:</span>
            <span className="text-white font-semibold">MetaTrader 5 (Direct Terminal)</span>
          </div>
          <div className="flex justify-between items-center bg-[#070e1b] p-1.5 rounded border border-gray-800">
            <span className="text-gray-400">Account Equity:</span>
            <span className="text-emerald-400 font-mono font-bold">$102,450.00</span>
          </div>
          <div className="flex justify-between items-center bg-[#070e1b] p-1.5 rounded border border-gray-800">
            <span className="text-gray-400">Margin Utilization:</span>
            <span className="text-cyan-400 font-mono">0.00% (No Active Orders)</span>
          </div>
        </div>
      </div>

      {/* 3. Real-Time Risk Management Controls & Level Meter */}
      <div className="bg-[#0b101d] border border-cyan-950/70 rounded-xl p-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2">
          <h4 className="text-[11px] uppercase tracking-wider text-gray-300 font-bold flex items-center space-x-1">
            <span>🛡️ Risk Management Controls</span>
          </h4>
          <span className="text-[9px] text-amber-400 font-bold">MEDIUM RISK</span>
        </div>

        <div className="space-y-2">
          {/* Risk Level Gauge */}
          <div>
            <div className="flex justify-between text-[9px] text-gray-400 mb-1">
              <span>Low</span>
              <span className="text-amber-400 font-semibold">Current: Event Guarded</span>
              <span>Critical</span>
            </div>
            <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden flex">
              <div className="bg-emerald-500 w-1/4"></div>
              <div className="bg-amber-500 w-2/4"></div>
              <div className="bg-red-600 w-1/4 opacity-20"></div>
            </div>
          </div>

          <div className="text-[9px] text-gray-400 space-y-1 bg-[#070e1b] p-2 rounded border border-gray-800">
            <div className="flex justify-between">
              <span>Max Daily Loss Limit:</span>
              <span className="text-red-400 font-mono">-$2,000.00 (2.0%)</span>
            </div>
            <div className="flex justify-between">
              <span>Current Drawdown Today:</span>
              <span className="text-emerald-400 font-mono">+$840.00 (+0.82%)</span>
            </div>
            <div className="flex justify-between">
              <span>News Auto-Lockout:</span>
              <span className="text-amber-400 font-semibold">Armed (Shock Policy Active)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
