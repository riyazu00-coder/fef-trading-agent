'use client';

import React, { useState, useEffect } from 'react';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import {
  RadarNotification,
  getStoredNotifications,
  markAllNotificationsAsRead,
  subscribeRadarNotifications
} from '@/lib/radar/radar-notifications';

interface NotificationCenterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialNotifications?: RadarNotification[];
}

export const NotificationCenterDrawer: React.FC<NotificationCenterDrawerProps> = ({ isOpen, onClose, initialNotifications }) => {
  const { setActiveSymbol } = useActiveAsset();
  const [notifications, setNotifications] = useState<RadarNotification[]>(initialNotifications || []);
  const [filter, setFilter] = useState<'ALL' | 'OPPORTUNITIES' | 'RISK'>('ALL');

  useEffect(() => {
    // Initial load
    if (!initialNotifications || initialNotifications.length === 0) {
      setNotifications(getStoredNotifications());
    }

    // Subscribe to new incoming alerts
    const unsubscribe = subscribeRadarNotifications((newNotif) => {
      setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)]);
    });

    return () => unsubscribe();
  }, []);

  const handleMarkAllRead = () => {
    const updated = markAllNotificationsAsRead();
    setNotifications(updated);
  };

  const handleSelectNotification = (sym: string) => {
    setActiveSymbol(sym);
    onClose();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filtered = notifications.filter((n) => {
    if (filter === 'OPPORTUNITIES') {
      return n.newState?.includes('BUY') || n.newState?.includes('SELL') || n.title.includes('OPPORTUNITY');
    }
    if (filter === 'RISK') {
      return n.priority === 'CRITICAL' || n.title.includes('Invalidated') || n.title.includes('Risk');
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-md h-full bg-[#050a16]/95 border-l border-cyan-500/30 p-4 sm:p-5 flex flex-col justify-between shadow-[-10px_0_40px_rgba(0,0,0,0.6)] font-sans overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="space-y-3 border-b border-white/10 pb-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                🔔
              </div>
              <div>
                <h3 className="text-sm font-black text-white font-mono uppercase tracking-wider">
                  OPPORTUNITY & RISK ALERTS
                </h3>
                <p className="text-[10px] text-gray-400 font-mono">
                  {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Sub-bar: Filter pills & Mark all read */}
          <div className="flex items-center justify-between font-mono text-[10px] pt-1">
            <div className="flex items-center space-x-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  filter === 'ALL' ? 'bg-cyan-500/30 text-cyan-200 font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                ALL ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('OPPORTUNITIES')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  filter === 'OPPORTUNITIES' ? 'bg-cyan-500/30 text-cyan-200 font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                SETUPS
              </button>
              <button
                onClick={() => setFilter('RISK')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  filter === 'RISK' ? 'bg-cyan-500/30 text-cyan-200 font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                RISK
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-cyan-400 hover:text-cyan-300 underline cursor-pointer text-[10px]"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {/* Notifications Scroll List */}
        <div className="flex-1 overflow-y-auto space-y-2.5 my-3 pr-1 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center text-gray-500 space-y-2 font-mono">
              <span className="text-2xl">📡</span>
              <p className="text-xs">No notifications in this filter category.</p>
            </div>
          ) : (
            filtered.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleSelectNotification(notif.symbol)}
                className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                  !notif.read
                    ? 'bg-cyan-950/30 border-cyan-500/40 shadow-sm'
                    : 'bg-black/30 border-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-white text-xs">{notif.symbol}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[8.5px] border ${
                        notif.priority === 'CRITICAL'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
                          : notif.priority === 'HIGH'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                          : 'bg-gray-800/40 text-gray-300 border-gray-700'
                      }`}
                    >
                      {notif.priority}
                    </span>
                  </div>
                  <span className="text-gray-400">{notif.timestamp}</span>
                </div>

                <div className="text-xs font-semibold text-gray-100">{notif.title}</div>
                <div className="text-[11px] text-gray-300 leading-snug">{notif.message}</div>

                <div className="flex items-center justify-between pt-1 font-mono text-[9.5px]">
                  {notif.score ? (
                    <span className="text-cyan-300 font-bold">Score: {notif.score}/100</span>
                  ) : (
                    <span />
                  )}
                  <span className="text-cyan-400 hover:underline flex items-center space-x-1">
                    <span>Inspect {notif.symbol}</span>
                    <span>→</span>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer info */}
        <div className="border-t border-white/10 pt-3 text-[10px] font-mono text-gray-400 flex items-center justify-between">
          <span>Deduplication: Active (15m window)</span>
          <span className="text-emerald-400">● Live Swarm Watch</span>
        </div>
      </div>
    </div>
  );
};
