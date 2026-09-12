'use client';

import React, { useState, useEffect } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { RadarNotification, subscribeRadarNotifications } from '@/lib/radar/radar-notifications';

export const OpportunityAlertToast: React.FC = () => {
  const { setActiveSymbol } = useActiveAsset();
  const [currentAlert, setCurrentAlert] = useState<RadarNotification | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeRadarNotifications((notif) => {
      // Trigger toast only on actionable high priority events
      if (notif.priority === 'CRITICAL' || notif.priority === 'HIGH') {
        setCurrentAlert(notif);

        // Auto dismiss after 8 seconds
        const timer = setTimeout(() => {
          setCurrentAlert((prev) => (prev?.id === notif.id ? null : prev));
        }, 8000);

        return () => clearTimeout(timer);
      }
    });

    return () => unsubscribe();
  }, []);

  if (!currentAlert) return null;

  const handleInspect = () => {
    setActiveSymbol(currentAlert.symbol);
    setCurrentAlert(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isBuy = currentAlert.newState?.includes('BUY') || currentAlert.title?.includes('BUY');

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-[#081226]/95 backdrop-blur-xl border border-cyan-400/40 rounded-2xl p-4 shadow-[0_10px_35px_rgba(0,240,255,0.25)] font-sans animate-slide-up">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300">
            RADAR OPPORTUNITY DETECTED
          </span>
        </div>
        <button
          onClick={() => setCurrentAlert(null)}
          className="text-gray-400 hover:text-white text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 space-y-1">
        <div className="flex items-center space-x-2">
          <span className="text-base font-black font-mono text-white">{currentAlert.symbol}</span>
          <span
            className={`px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold ${
              isBuy ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
          >
            {currentAlert.newState}
          </span>
        </div>
        <p className="text-xs text-gray-300 line-clamp-2">{currentAlert.message}</p>
      </div>

      <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between font-mono text-[10px]">
        <span className="text-cyan-400 font-bold">Score: {currentAlert.score}/100</span>
        <button
          onClick={handleInspect}
          className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-500 hover:from-cyan-500 hover:to-blue-500 text-white font-black font-mono transition-all shadow-md cursor-pointer border border-cyan-400/40"
        >
          SWITCH TO {currentAlert.symbol} →
        </button>
      </div>
    </div>
  );
};
