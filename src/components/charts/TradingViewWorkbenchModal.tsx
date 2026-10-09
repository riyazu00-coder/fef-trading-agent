'use client';

import React, { useState, useEffect } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { TradingViewChartWidget } from './TradingViewChartWidget';

interface TradingViewWorkbenchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TIMEFRAMES = [
  { id: 'M1', label: '1m' },
  { id: 'M5', label: '5m' },
  { id: 'M15', label: '15m' },
  { id: 'M30', label: '30m' },
  { id: 'H1', label: '1h' },
  { id: 'H4', label: '4h' },
  { id: 'D1', label: '1D' },
  { id: 'W1', label: '1W' },
];

export const TradingViewWorkbenchModal: React.FC<TradingViewWorkbenchModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { activeSymbol, setActiveSymbol, activeAsset, allAssets } = useActiveAsset();
  const [selectedTf, setSelectedTf] = useState<string>('M30');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const priceFmt =
    activeAsset.price >= 1000
      ? activeAsset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : activeAsset.price.toFixed(4);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col p-2 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="flex flex-col h-full w-full max-w-[1920px] mx-auto bg-[#040812] border border-cyan-500/40 rounded-2xl shadow-[0_0_50px_rgba(34,211,238,0.25)] overflow-hidden">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-3 sm:px-4 py-2.5 border-b border-white/10 bg-[#060D1E]/90 flex-shrink-0">
          {/* Left: Brand & Symbol Info */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-sm shadow-[0_0_12px_rgba(34,211,238,0.3)]">
              📈
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-base font-black text-white tracking-wide">
                  {activeSymbol}
                </span>
                <span className="font-mono text-xs text-gray-400">
                  {activeAsset.name}
                </span>
                <span
                  className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                    activeAsset.change24h >= 0
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                      : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                  }`}
                >
                  ${priceFmt} ({activeAsset.change24h >= 0 ? '+' : ''}
                  {activeAsset.change24h.toFixed(2)}%)
                </span>
              </div>
              <p className="text-[10px] text-cyan-300 font-mono tracking-tight">
                REAL-TIME ADVANCED CHARTING SUITE &bull; DRAWING TOOLS &amp; TECHNICAL INDICATORS ARMED
              </p>
            </div>
          </div>

          {/* Center: Symbol Quick Switcher & Timeframe Controls */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Symbol Switcher Select */}
            <div className="flex items-center space-x-1.5 bg-black/50 border border-white/10 px-2.5 py-1 rounded-xl text-xs font-mono">
              <span className="text-gray-400 text-[10px]">ASSET:</span>
              <select
                value={activeSymbol}
                onChange={(e) => setActiveSymbol(e.target.value)}
                className="bg-transparent text-cyan-300 font-bold focus:outline-none cursor-pointer"
              >
                {Object.keys(allAssets).map((sym) => (
                  <option key={sym} value={sym} className="bg-[#090D16] text-white">
                    {sym} - {allAssets[sym].name}
                  </option>
                ))}
              </select>
            </div>

            {/* Timeframe Toggles */}
            <div className="inline-flex items-center space-x-1 bg-black/50 border border-white/10 p-1 rounded-xl text-xs font-mono">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.id}
                  onClick={() => setSelectedTf(tf.id)}
                  className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedTf === tf.id
                      ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Feature Badges & Close Button */}
          <div className="flex items-center space-x-2">
            <span className="hidden lg:inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE FEED</span>
            </span>

            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 hover:border-white/30 text-gray-300 hover:text-white text-xs font-mono font-bold transition-colors cursor-pointer flex items-center space-x-1"
              title="Close TradingView Workbench (ESC)"
            >
              <span>✕</span>
              <span>ESC</span>
            </button>
          </div>
        </div>

        {/* Real Interactive TradingView Advanced Chart Area */}
        <div className="flex-1 w-full h-full relative overflow-hidden bg-[#030711]">
          <TradingViewChartWidget
            symbol={activeSymbol}
            timeframe={selectedTf}
            theme="dark"
            autosize={true}
            height="100%"
          />
        </div>
      </div>
    </div>
  );
};

