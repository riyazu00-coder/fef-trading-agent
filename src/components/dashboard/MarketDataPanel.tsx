'use client';

import React from 'react';
import { MarketAsset, EconomicEvent } from '@/lib/agents/agent-types';

interface MarketDataPanelProps {
  assets: MarketAsset[];
  events: EconomicEvent[];
}

export const MarketDataPanel: React.FC<MarketDataPanelProps> = ({ assets, events }) => {
  const goldAsset = assets.find((a) => a.symbol === 'XAUUSD') || assets[0];
  const macroAssets = assets.filter((a) => a.symbol !== 'XAUUSD');

  return (
    <div className="flex flex-col space-y-3">
      {/* 1. XAUUSD Primary Gold Command Card */}
      <div className="bg-[#0b101d] border border-amber-500/30 rounded-xl p-3.5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gold/5 rounded-full blur-xl pointer-events-none"></div>

        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-gold font-black text-sm tracking-wider">XAUUSD</span>
            <span className="text-[10px] text-gray-400 bg-gray-900 px-1.5 py-0.5 rounded border border-gray-800">
              Gold Spot / USD
            </span>
          </div>
          <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded flex items-center space-x-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            <span>Free Live Quote</span>
          </span>
        </div>

        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-2xl font-black text-white tracking-tight">
              ${goldAsset.price.toFixed(2)}
            </div>
            <div className="text-xs font-semibold text-emerald-400 flex items-center space-x-1">
              <span>▲ +{goldAsset.change}%</span>
              <span className="text-gray-500 font-normal">($+14.80 today)</span>
            </div>
          </div>
          <div className="text-right text-[10px] space-y-0.5 text-gray-400">
            <div>Spread: <span className="text-cyan-400 font-mono font-bold">18¢</span></div>
            <div>Session: <span className="text-white font-semibold">London / NY</span></div>
            <div>Day High: <span className="text-gray-300">2352.40</span></div>
            <div>Day Low: <span className="text-gray-300">2338.10</span></div>
          </div>
        </div>

        {/* Volatility Meter */}
        <div className="bg-gray-900/80 rounded p-2 border border-gray-800">
          <div className="flex justify-between items-center text-[10px] mb-1">
            <span className="text-gray-400">Intraday Volatility Index</span>
            <span className="text-amber-400 font-bold">NORMAL (ATR 7.8)</span>
          </div>
          <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 w-1/3"></div>
            <div className="bg-amber-500 w-1/3"></div>
            <div className="bg-red-500 w-1/3 opacity-30"></div>
          </div>
        </div>
      </div>

      {/* 2. Global Macro & Cross-Asset Matrix (DXY, Yields, Silver, Stocks, Crypto) */}
      <div className="bg-[#0b101d] border border-cyan-950/70 rounded-xl p-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2">
          <h4 className="text-[11px] uppercase tracking-wider text-cyan-400 font-bold flex items-center space-x-1">
            <span>🌐 Cross-Asset Matrix</span>
          </h4>
          <span className="text-[9px] text-gray-400">Inverse Correlations</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          {macroAssets.map((asset) => {
            const isPositive = asset.change >= 0;
            return (
              <div
                key={asset.symbol}
                className="bg-[#070e1b] border border-gray-800/80 rounded p-1.5 flex flex-col justify-between hover:border-cyan-800 transition-colors"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-gray-200">{asset.symbol}</span>
                  <span
                    className={`text-[9px] font-mono ${
                      isPositive ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}
                    {asset.change}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-gray-400 text-[9px]">
                  <span className="font-mono text-gray-300">
                    {asset.category === 'BOND' ? `${asset.price}%` : asset.price}
                  </span>
                  <span
                    className={`text-[8px] px-1 rounded ${
                      asset.correlationToGold === 'STRONG_NEGATIVE'
                        ? 'text-cyan-400 bg-cyan-950/80'
                        : asset.correlationToGold === 'STRONG_POSITIVE'
                        ? 'text-emerald-400 bg-emerald-950/80'
                        : 'text-gray-400'
                    }`}
                  >
                    {asset.correlationToGold === 'STRONG_NEGATIVE' ? 'Inv. Correl' : 'Aligned'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Free Economic Calendar & High-Impact Countdown */}
      <div className="bg-[#0b101d] border border-cyan-950/70 rounded-xl p-3 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2">
          <h4 className="text-[11px] uppercase tracking-wider text-amber-400 font-bold flex items-center space-x-1">
            <span>⚡ Economic Event Lockout</span>
          </h4>
          <span className="text-[9px] bg-red-950 text-red-400 px-1.5 py-0.2 rounded border border-red-900">
            Risk Gate Active
          </span>
        </div>

        <div className="space-y-1.5">
          {events.map((ev) => (
            <div
              key={ev.id}
              className="bg-[#070e1b] border border-gray-800/80 rounded p-1.5 text-[10px]"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-gray-200 truncate pr-1">{ev.title}</span>
                <span
                  className={`text-[8px] font-bold px-1 rounded uppercase ${
                    ev.impact === 'CRITICAL'
                      ? 'bg-red-950 text-red-400 border border-red-800'
                      : 'bg-amber-950 text-amber-400'
                  }`}
                >
                  {ev.impact}
                </span>
              </div>
              <div className="flex items-center justify-between text-gray-400 text-[9px]">
                <span className="text-gray-500">{ev.time}</span>
                <span className="font-bold font-mono text-cyan-400">{ev.countdown}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
