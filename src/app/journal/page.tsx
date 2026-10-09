'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { useActiveAsset } from '@/context/ActiveAssetContext';

interface HistoricalTrade {
  id: string;
  ticket: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  lots: number;
  pnl: number;
  rrAchieved: string;
  date: string;
  duration: string;
  strategy: string;
  consensusScore: number;
  status: 'WIN' | 'LOSS' | 'BREAKEVEN';
  marketSessionSnapshot?: {
    marketState: string;
    sessionName: string;
    tradeExecutable: boolean;
    scheduleSource: string;
  };
  postMortem: {
    thesis: string;
    executionGrade: string;
    slippage: string;
    mistakes: string[];
    lessonsLearned: string;
    notes?: string;
  };
}

const TRADE_HISTORY: HistoricalTrade[] = [
  {
    id: 'tr-1',
    ticket: 94819022,
    symbol: 'XAUUSD',
    type: 'BUY',
    entryPrice: 4325.20,
    exitPrice: 4348.80,
    lots: 0.80,
    pnl: 1888.00,
    rrAchieved: '1 : 2.94',
    date: '2026-09-11 15:30 UTC',
    duration: '2h 14m',
    strategy: 'London Liquidity Sweep + H1 FVG',
    consensusScore: 84,
    status: 'WIN',
    marketSessionSnapshot: {
      marketState: 'OPEN',
      sessionName: 'London / NY Overlap',
      tradeExecutable: true,
      scheduleSource: 'CANONICAL_HOURS'
    },
    postMortem: {
      thesis: 'Asian low swept cleanly at 4320 with instant displacement and bullish order block tap.',
      executionGrade: 'A+',
      slippage: '0.02 points (Raw Spread Account)',
      mistakes: ['Partial profit taken slightly early at TP1 instead of letting full 50% runner reach TP2.'],
      lessonsLearned: 'Trust H4 order flow momentum when DXY is breaking down into London close.'
    }
  },
  {
    id: 'tr-2',
    ticket: 94812349,
    symbol: 'EURUSD',
    type: 'BUY',
    entryPrice: 1.1578,
    exitPrice: 1.1632,
    lots: 1.50,
    pnl: 810.00,
    rrAchieved: '1 : 2.45',
    date: '2026-09-10 13:10 UTC',
    duration: '4h 02m',
    strategy: 'ECB Rate Hold Continuation',
    consensusScore: 78,
    status: 'WIN',
    marketSessionSnapshot: {
      marketState: 'OPEN',
      sessionName: 'London Session',
      tradeExecutable: true,
      scheduleSource: 'CANONICAL_HOURS'
    },
    postMortem: {
      thesis: 'Yield spread widened after German bund auctions, confirming interbank demand.',
      executionGrade: 'A',
      slippage: '0.0001 pip',
      mistakes: ['None. Strict adherence to Risk Guardian 0.50% allocation.'],
      lessonsLearned: 'Cross-currency flow alignment between EURGBP and EURUSD provides reliable confirmation.'
    }
  },
  {
    id: 'tr-3',
    ticket: 94808711,
    symbol: 'USOIL',
    type: 'SELL',
    entryPrice: 102.40,
    exitPrice: 103.10,
    lots: 0.50,
    pnl: -350.00,
    rrAchieved: '-1 : 1.00',
    date: '2026-09-09 17:45 UTC',
    duration: '45m',
    strategy: 'Overhead Resistance Fade',
    consensusScore: 61,
    status: 'LOSS',
    marketSessionSnapshot: {
      marketState: 'OPEN',
      sessionName: 'New York Afternoon',
      tradeExecutable: true,
      scheduleSource: 'CANONICAL_HOURS'
    },
    postMortem: {
      thesis: 'Tried to fade psychological $102.50 ceiling before US inventory reports.',
      executionGrade: 'C-',
      slippage: '0.04 points',
      mistakes: ['Entered 15 minutes before DOE crude storage print violating Geopolitical Sentinel warning.'],
      lessonsLearned: 'Never override News Agent event lockout even if technical structure looks appealing.'
    }
  },
  {
    id: 'tr-4',
    ticket: 94799014,
    symbol: 'BTCUSD',
    type: 'BUY',
    entryPrice: 75400.00,
    exitPrice: 77200.00,
    lots: 0.20,
    pnl: 360.00,
    rrAchieved: '1 : 3.10',
    date: '2026-09-08 20:00 UTC',
    duration: '8h 22m',
    strategy: 'Weekend Compression Breakout',
    consensusScore: 82,
    status: 'WIN',
    marketSessionSnapshot: {
      marketState: 'OPEN',
      sessionName: 'Weekend 24/7 Liquidity',
      tradeExecutable: true,
      scheduleSource: '24/7 Crypto Schedule'
    },
    postMortem: {
      thesis: 'Spot ETF inflows reached $480M; funding rate normalized to neutral.',
      executionGrade: 'A',
      slippage: '1.20 points',
      mistakes: ['Trailing stop was set too loose in the final hour.'],
      lessonsLearned: 'Lock in 80% profits upon reaching 3R in crypto weekend liquidity.'
    }
  }
];

export default function JournalPage() {
  const { activeSymbol } = useActiveAsset();
  const [trades, setTrades] = useState<HistoricalTrade[]>(TRADE_HISTORY);
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedTrade, setSelectedTrade] = useState<HistoricalTrade | null>(null);
  const [customNote, setCustomNote] = useState<string>('');

  // Hydrate custom closed trades from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('fef_journal_trades');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const customTickets = new Set(parsed.map((t: HistoricalTrade) => t.ticket));
            const baseNotDuplicated = TRADE_HISTORY.filter(t => !customTickets.has(t.ticket));
            setTrades([...parsed, ...baseNotDuplicated]);
          }
        }
      } catch (err) {
        console.error('Failed to load journal trades:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (selectedTrade) {
      setCustomNote(selectedTrade.postMortem.notes || '');
    }
  }, [selectedTrade]);

  const handleSaveNote = () => {
    if (!selectedTrade) return;
    const updated = trades.map(t => {
      if (t.ticket === selectedTrade.ticket) {
        return {
          ...t,
          postMortem: {
            ...t.postMortem,
            notes: customNote
          }
        };
      }
      return t;
    });
    setTrades(updated);
    setSelectedTrade(prev => prev ? { ...prev, postMortem: { ...prev.postMortem, notes: customNote } } : null);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('fef_journal_trades', JSON.stringify(updated));
      } catch {}
    }
  };

  const filteredTrades = trades.filter((tr) => {
    const matchesSym = filterSymbol === 'ALL' || tr.symbol === filterSymbol;
    const matchesStat = filterStatus === 'ALL' || tr.status === filterStatus;
    return matchesSym && matchesStat;
  });

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.status === 'WIN').length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
  const totalPnL = trades.reduce((acc, t) => acc + t.pnl, 0);

  const handleExportCSV = () => {
    const headers = ['Ticket,Symbol,Type,Lots,Entry,Exit,PnL,RR,Date,Session,SessionState,Strategy,Status,Notes'];
    const rows = trades.map(
      (t) => `${t.ticket},${t.symbol},${t.type},${t.lots},${t.entryPrice},${t.exitPrice},${t.pnl},"${t.rrAchieved}","${t.date}","${t.marketSessionSnapshot?.sessionName || 'N/A'}","${t.marketSessionSnapshot?.marketState || 'N/A'}","${t.strategy}",${t.status},"${t.postMortem.notes || ''}"`
    );
    const blob = new Blob([[...headers, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fef-trade-journal-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Static Premium CORTEX Visual Foundation */}
      <BackgroundLiveChart symbol={activeSymbol} isPositive={true} />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />
        <MarketCategoryFilterBar />

        {/* Top Header & Aggregate Performance Stats */}
        <div className="ghost-glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl">📓</span>
                <h1 className="text-xl font-sans font-bold text-[#F8FAFC] uppercase tracking-[0.06em]">
                  INSTITUTIONAL TRADE JOURNAL & POST-MORTEM
                </h1>
                <span className="text-[9px] bg-cyan-950/60 text-[#67E8F9] border border-cyan-500/40 px-2 py-0.5 rounded font-mono font-bold">
                  POST-TRADE AI AUDITING ACTIVE
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] font-sans mt-1">
                Detailed Execution Ledger &bull; Agent Consensus at Entry &bull; Machine Post-Mortem &amp; Behavioral Review
              </p>
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCSV}
              className="bg-white/5 hover:bg-white/10 border border-white/[0.08] text-[#CBD5E1] hover:text-[#F8FAFC] text-xs px-3.5 py-2 rounded-xl font-sans font-bold tracking-wider flex items-center space-x-2 transition-all cursor-pointer"
            >
              <span>📥</span>
              <span>EXPORT AUDIT CSV</span>
            </button>
          </div>

          {/* Aggregate Performance Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-white/5 text-xs">
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">TOTAL NET PnL</span>
              <span className="text-emerald-400 font-bold font-mono text-base">
                +${totalPnL.toFixed(2)}
              </span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">WIN RATE</span>
              <span className="text-cyan-300 font-bold font-mono text-base">{winRate}%</span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">PROFIT FACTOR</span>
              <span className="text-purple-300 font-bold font-mono text-base">3.48</span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">AVG R:R ACHIEVED</span>
              <span className="text-white font-bold font-mono text-base">1 : 2.65</span>
            </div>
            <div className="bg-black/40 border border-white/5 p-2.5 rounded-xl">
              <span className="text-gray-400 text-[10px] block">MAX DRAWDOWN</span>
              <span className="text-emerald-400 font-bold font-mono text-base">0.35%</span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5 text-xs">
            {/* Asset filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-gray-400 text-[10px] uppercase font-bold mr-1">ASSET:</span>
              {['ALL', 'XAUUSD', 'EURUSD', 'USOIL', 'BTCUSD'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => setFilterSymbol(sym)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                    filterSymbol === sym
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex items-center space-x-1.5">
              <span className="text-gray-400 text-[10px] uppercase font-bold mr-1">STATUS:</span>
              {['ALL', 'WIN', 'LOSS'].map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                    filterStatus === st
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                      : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Trade Ledger Table */}
        <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] font-mono space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <h2 className="text-xs font-black text-white uppercase tracking-wider">
              CLOSED TRADE LEDGER ({filteredTrades.length})
            </h2>
            <span className="text-[10px] text-gray-400">
              Click any trade row to view full AI post-mortem report
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] text-gray-400 border-b border-white/5 bg-white/[0.02]">
                <tr>
                  <th className="py-2.5 px-3">TICKET / DATE</th>
                  <th className="py-2.5 px-3">ASSET / TYPE</th>
                  <th className="py-2.5 px-3">LOTS</th>
                  <th className="py-2.5 px-3">ENTRY &rarr; EXIT</th>
                  <th className="py-2.5 px-3">R:R</th>
                  <th className="py-2.5 px-3">SWARM SCORE</th>
                  <th className="py-2.5 px-3">NET PnL</th>
                  <th className="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-gray-300">
                {filteredTrades.map((tr) => {
                  const isWin = tr.status === 'WIN';
                  return (
                    <tr
                      key={tr.id}
                      onClick={() => setSelectedTrade(tr)}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <td className="py-3 px-3">
                        <span className="font-bold text-white block font-mono">#{tr.ticket}</span>
                        <span className="text-[10px] text-gray-500">{tr.date}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-white">{tr.symbol}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            tr.type === 'BUY'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}>
                            {tr.type}
                          </span>
                          {tr.marketSessionSnapshot && (
                            <span className="text-[8.5px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-500/30">
                              {tr.marketSessionSnapshot.sessionName}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 block truncate max-w-[140px]">{tr.strategy}</span>
                      </td>
                      <td className="py-3 px-3 font-mono text-white">{tr.lots}</td>
                      <td className="py-3 px-3 font-mono text-gray-300 text-xs">
                        ${tr.entryPrice.toFixed(2)} &rarr; ${tr.exitPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 font-mono text-purple-300">{tr.rrAchieved}</td>
                      <td className="py-3 px-3">
                        <span className="text-cyan-400 font-bold font-mono">{tr.consensusScore}%</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold">
                        <span className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                          {isWin ? '+' : ''}${tr.pnl.toFixed(2)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTrade(tr);
                          }}
                          className="bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[10px] px-2.5 py-1 rounded-lg font-bold transition-colors"
                        >
                          POST-MORTEM &rarr;
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Post-Mortem Detail Modal */}
        {selectedTrade && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 transition-opacity animate-in fade-in duration-200">
            <div className="bg-[#080d19] border border-cyan-500/40 rounded-3xl w-full max-w-2xl flex flex-col p-6 shadow-[0_0_50px_rgba(6,182,212,0.25)] font-mono max-h-[90vh] overflow-y-auto space-y-5">
              {/* Modal Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">🔬</span>
                    <h2 className="text-lg font-black text-white">
                      POST-MORTEM AUDIT #{selectedTrade.ticket}
                    </h2>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                      selectedTrade.status === 'WIN'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    }`}>
                      {selectedTrade.status} ({selectedTrade.pnl >= 0 ? '+' : ''}${selectedTrade.pnl.toFixed(2)})
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedTrade.symbol} &bull; {selectedTrade.strategy} &bull; Duration: {selectedTrade.duration}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedTrade(null)}
                  className="bg-white/10 hover:bg-white/20 text-gray-300 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Performance Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">EXECUTION GRADE</span>
                  <span className="text-cyan-400 font-bold text-sm font-mono">
                    {selectedTrade.postMortem.executionGrade}
                  </span>
                </div>
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">R:R ACHIEVED</span>
                  <span className="text-white font-bold text-sm font-mono">
                    {selectedTrade.rrAchieved}
                  </span>
                </div>
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">SLIPPAGE AUDIT</span>
                  <span className="text-emerald-400 font-bold text-sm font-mono">
                    {selectedTrade.postMortem.slippage}
                  </span>
                </div>
                <div className="bg-black/50 p-3 rounded-xl border border-white/5">
                  <span className="text-gray-400 text-[10px] block">SWARM CONSENSUS</span>
                  <span className="text-purple-400 font-bold text-sm font-mono">
                    {selectedTrade.consensusScore}%
                  </span>
                </div>
              </div>

              {/* Market Session at Entry */}
              {selectedTrade.marketSessionSnapshot && (
                <div className="bg-cyan-950/20 border border-cyan-500/30 p-3 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] text-gray-400 uppercase font-bold">SESSION AT ENTRY:</span>
                    <span className="text-cyan-300 font-bold font-mono">{selectedTrade.marketSessionSnapshot.sessionName}</span>
                    <span className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold border ${
                      selectedTrade.marketSessionSnapshot.tradeExecutable
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}>
                      {selectedTrade.marketSessionSnapshot.marketState}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-sans">
                    Schedule: {selectedTrade.marketSessionSnapshot.scheduleSource}
                  </span>
                </div>
              )}

              {/* Trade Thesis */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                  ORIGINAL ENTRY THESIS & CONFLUENCE
                </h4>
                <div className="bg-black/40 border border-white/5 p-3 rounded-xl text-xs text-gray-300 leading-relaxed">
                  {selectedTrade.postMortem.thesis}
                </div>
              </div>

              {/* Behavioral Mistakes Identified */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                  IDENTIFIED EXECUTION FLAWS & MISTAKES
                </h4>
                <ul className="space-y-1 bg-black/40 border border-white/5 p-3 rounded-xl text-xs text-gray-300">
                  {selectedTrade.postMortem.mistakes.map((m, idx) => (
                    <li key={idx} className="flex items-start space-x-2">
                      <span className="text-rose-400">&bull;</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Lessons Learned */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  KEY TAKEAWAY FOR FUTURE TRADES
                </h4>
                <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl text-xs text-emerald-200 leading-relaxed">
                  &ldquo;{selectedTrade.postMortem.lessonsLearned}&rdquo;
                </div>
              </div>

              {/* Trader Reflections & Journal Notes */}
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center justify-between">
                  <span>TRADER LOG NOTES &amp; REFLECTIONS</span>
                  {selectedTrade.postMortem.notes && (
                    <span className="text-[10px] text-emerald-400 font-normal">● SAVED IN LOCAL JOURNAL</span>
                  )}
                </h4>
                <textarea
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="Record your psychological mindset, execution nuances, or improvements for future sessions..."
                  className="w-full bg-black/50 border border-white/10 focus:border-cyan-400/50 rounded-xl p-3 text-xs text-gray-200 outline-none resize-none h-20 font-mono transition-colors"
                />
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="bg-cyan-950/70 hover:bg-cyan-800/80 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 text-[10px] px-3.5 py-1.5 rounded-lg font-bold transition-all shadow-[0_0_12px_rgba(6,182,212,0.15)] cursor-pointer"
                >
                  SAVE TRADER NOTE
                </button>
              </div>

              {/* Close Button */}
              <div className="pt-3 border-t border-white/10 flex justify-end">
                <button
                  onClick={() => setSelectedTrade(null)}
                  className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 px-4 py-2 rounded-xl text-xs font-bold tracking-wider transition-all"
                >
                  CLOSE POST-MORTEM
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Master Footer */}
        <MasterFooter />
      </div>
    </div>
  );
}
