'use client';

import React, { useState } from 'react';
import { TradeSetup } from '@/lib/agents/agent-types';

interface DecisionAndRiskPanelProps {
  setup: TradeSetup;
  glassIntensity?: 'GHOST_GLASS' | 'ULTRA_CLEAR' | 'CRYSTAL' | 'TINTED';
}

export const DecisionAndRiskPanel: React.FC<DecisionAndRiskPanelProps> = ({
  setup,
  glassIntensity = 'GHOST_GLASS'
}) => {
  const [approvalStatus, setApprovalStatus] = useState<TradeSetup['status']>(setup.status);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(setup.recommendedVolume);
  const [stopLoss, setStopLoss] = useState<number>(setup.stopLoss);
  const [tp1, setTp1] = useState<number>(setup.tp1);
  const [tp2, setTp2] = useState<number>(setup.tp2);

  const handleApprove = () => setApprovalStatus('APPROVED');
  const handleReject = () => setApprovalStatus('REJECTED');
  const handleSaveModified = () => {
    setApprovalStatus('MODIFIED');
    setIsEditing(false);
  };

  const glassBg = glassIntensity === 'GHOST_GLASS'
    ? 'bg-black/15 backdrop-blur-[6px]'
    : glassIntensity === 'ULTRA_CLEAR'
    ? 'bg-black/25 backdrop-blur-md'
    : glassIntensity === 'TINTED'
    ? 'bg-black/60 backdrop-blur-xl'
    : 'bg-black/35 backdrop-blur-lg';

  return (
    <div className="space-y-3 font-mono">
      {/* 1. Final Decision & Explainability Card (Pure Optical Glass) */}
      <div className={`${glassBg} border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_1px_0_rgba(255,255,255,0.25)] rounded-2xl p-4 space-y-3 transition-all`}>
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div>
            <span className="text-[9px] text-cyan-400 uppercase tracking-widest block font-bold drop-shadow">
              Synthesized Autonomous Conclusion
            </span>
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
              CENTRAL AI DECISION STATE
            </h3>
          </div>
          <span className="text-[9px] bg-cyan-950/50 text-cyan-300 border border-cyan-400/50 px-2 py-0.5 rounded font-bold shadow-[0_0_8px_rgba(0,240,255,0.4)] backdrop-blur-sm">
            CONFIDENCE: 74%
          </span>
        </div>

        {/* Verdict Badge (Pure Optical Glass Sub-Card) */}
        <div className="bg-black/20 backdrop-blur-md p-3 rounded-xl border border-white/15 flex items-center justify-between shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)]">
          <div>
            <div className="text-[9.5px] text-gray-200 drop-shadow">Current Strategy Verdict:</div>
            <div className="text-xl font-black text-cyan-400 tracking-wide mt-0.5 drop-shadow-[0_0_10px_rgba(0,240,255,0.6)]">
              WATCH FOR BUY
            </div>
            <div className="text-[10px] text-gray-100 mt-0.5 drop-shadow">
              Entry Zone: <span className="text-white font-bold">${setup.entryZone[0].toFixed(2)} - ${setup.entryZone[1].toFixed(2)}</span>
            </div>
          </div>
          <div className="text-right text-[10px]">
            <div className="text-gray-200 drop-shadow">R:R POTENTIAL:</div>
            <div className="text-emerald-300 font-black text-sm drop-shadow-[0_0_8px_rgba(16,185,129,0.7)]">{setup.riskReward}</div>
            <div className="text-amber-300 text-[9px] mt-0.5 drop-shadow">Risk Cap: 0.50%</div>
          </div>
        </div>

        {/* WHY THE AI REACHED THIS CONCLUSION */}
        <div className="space-y-1.5 text-[10.5px]">
          <span className="text-emerald-300 font-bold text-[10px] block drop-shadow">
            ✓ Why AI Thinks This (Supporting Confluences):
          </span>
          <ul className="space-y-1 text-gray-100 pl-2">
            <li className="flex items-start space-x-1.5">
              <span className="text-emerald-400 font-bold">•</span>
              <span className="drop-shadow">DXY index rejected key session ceiling; inverse correlation holding.</span>
            </li>
            <li className="flex items-start space-x-1.5">
              <span className="text-emerald-400 font-bold">•</span>
              <span className="drop-shadow">US 10-Year Treasury yield declined, easing real yield pressure.</span>
            </li>
            <li className="flex items-start space-x-1.5">
              <span className="text-emerald-400 font-bold">•</span>
              <span className="drop-shadow">Session swept sell-side liquidity near ${setup.stopLoss.toFixed(2)} with M15 CHOCH confirmation.</span>
            </li>
            <li className="flex items-start space-x-1.5">
              <span className="text-emerald-400 font-bold">•</span>
              <span className="drop-shadow">Price reacting cleanly from unmitigated Demand Fair Value Gap (${setup.entryZone[0].toFixed(2)} - ${setup.entryZone[1].toFixed(2)}).</span>
            </li>
          </ul>
        </div>

        {/* WHAT COULD INVALIDATE IT */}
        <div className="space-y-1 text-[10.5px] border-t border-white/10 pt-2">
          <span className="text-rose-300 font-bold text-[10px] block drop-shadow">
            ✕ Invalidation Conditions:
          </span>
          <p className="text-gray-200 pl-2 drop-shadow">
            M15 body close below <span className="text-rose-300 font-bold">${setup.stopLoss.toFixed(2)}</span> or unexpected hot PCE print breaking real yield decline.
          </p>
        </div>
      </div>

      {/* 2. Professional Human Operator Gatekeeper (Pure Optical Glass) */}
      <div className={`${glassBg} border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.35),inset_0_1px_1px_0_rgba(255,255,255,0.25)] rounded-2xl p-4 space-y-3 transition-all`}>
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div>
            <span className="text-[9px] text-amber-300 uppercase tracking-widest block font-bold drop-shadow">
              Mandatory Human Gatekeeper
            </span>
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
              TRADE EXECUTION APPROVAL
            </h3>
          </div>
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded backdrop-blur-sm ${
              approvalStatus === 'APPROVED'
                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-400/60 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                : approvalStatus === 'REJECTED'
                ? 'bg-rose-950/70 text-rose-300 border border-rose-400/60 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                : 'bg-amber-950/70 text-amber-300 border border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
            }`}
          >
            {approvalStatus.replace('_', ' ')}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleApprove}
            className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-2 px-3 rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(16,185,129,0.4)] border border-emerald-400/40"
          >
            ✓ Sign & Authorize
          </button>
          <button
            onClick={handleReject}
            className="flex-1 bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700 font-bold py-2 px-3 rounded-xl text-xs transition-all"
          >
            ✕ Reject Signal
          </button>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-bold py-2 px-3 rounded-xl text-xs transition-all backdrop-blur-sm"
          >
            ⚙ Modify
          </button>
        </div>

        {isEditing && (
          <div className="bg-black/30 backdrop-blur-md p-3 rounded-xl border border-white/15 space-y-2 text-[10px]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-gray-200 block mb-0.5">Custom Lots:</label>
                <input
                  type="number"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-gray-200 block mb-0.5">Stop Loss ($):</label>
                <input
                  type="number"
                  step="0.1"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(parseFloat(e.target.value))}
                  className="w-full bg-black/60 border border-white/20 rounded px-2 py-1 text-white"
                />
              </div>
            </div>
            <button
              onClick={handleSaveModified}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-1.5 rounded-lg text-xs transition-all mt-1"
            >
              Save Modified Ticket
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
