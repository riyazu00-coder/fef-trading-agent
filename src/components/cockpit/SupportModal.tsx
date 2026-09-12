'use client';

import React from 'react';
import { SUPPORT_CONFIG, BRAND_CONFIG } from '@/lib/config/support-config';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in font-sans">
      <div className="relative w-full max-w-md rounded-2xl ghost-glass-panel-elevated p-5 shadow-[0_16px_50px_rgba(0,0,0,0.8),0_0_30px_rgba(34,211,238,0.25)] border border-cyan-400/40 font-mono space-y-4">
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 rounded-t-2xl" />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-black text-white tracking-wider uppercase">
                  FEF SUPPORT DESK
                </h3>
                <span className="px-1.5 py-0.2 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[8.5px] font-bold">
                  24/7 ACTIVE
                </span>
              </div>
              <p className="text-[9px] text-gray-400">
                Institutional Ops & Risk Escalation
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Support Modal"
            className="text-gray-400 hover:text-white text-sm cursor-pointer p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Welcome / Context Message */}
        <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[10px] text-cyan-200/90 leading-relaxed font-sans">
          {SUPPORT_CONFIG.supportMessage}
        </div>

        {/* Channel List */}
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {SUPPORT_CONFIG.channels.map((ch) => (
            <div
              key={ch.id}
              className="p-3 rounded-xl bg-black/40 border border-white/10 hover:border-white/20 transition-all flex flex-col space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">{ch.icon}</span>
                  <span className="text-xs font-bold text-white">{ch.name}</span>
                </div>
                <span className={`text-[8.5px] px-1.5 py-0.5 rounded border font-bold ${ch.badgeColor}`}>
                  {ch.statusLabel}
                </span>
              </div>

              <p className="text-[10px] text-gray-300 leading-snug">
                {ch.description}
              </p>

              {ch.actionType === 'mailto' && ch.destination && (
                <a
                  href={ch.destination.startsWith('mailto:') ? ch.destination : `mailto:${ch.destination}`}
                  className="inline-flex items-center space-x-1 text-cyan-400 hover:text-cyan-300 text-[10px] font-bold pt-0.5 underline cursor-pointer"
                >
                  <span>Launch Email Client</span>
                  <span>&rarr;</span>
                </a>
              )}

              {ch.actionType === 'link' && ch.destination && (
                <a
                  href={ch.destination}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 text-[10px] font-bold pt-0.5 underline cursor-pointer"
                >
                  <span>{ch.id === 'platform_help' ? 'Open Knowledge Base' : 'Open WhatsApp Hotline'}</span>
                  <span>&rarr;</span>
                </a>
              )}

              {ch.actionType === 'none' && (
                <span className="text-[9.5px] text-gray-500 italic">
                  In development for V1.1 terminal update
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Safety Disclaimer */}
        <div className="p-2 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[9px] text-amber-300/80 leading-snug font-sans">
          <span className="font-bold text-amber-200">Safety Notice: </span>
          {SUPPORT_CONFIG.safetyDisclaimer}
        </div>

        {/* Footer Meta */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[9px] text-gray-400">
          <span>{BRAND_CONFIG.domainDisplay}</span>
          <span className="text-cyan-400">PGP Encrypted • 24/7 Monitoring</span>
        </div>
      </div>
    </div>
  );
};
