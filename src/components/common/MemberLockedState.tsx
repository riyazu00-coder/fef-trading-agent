'use client';

import React from 'react';
import Link from 'next/link';
import { SUPPORT_CONFIG, CORTEX_WHATSAPP_CONFIG } from '@/lib/config/support-config';

export interface MemberLockedStateProps {
  title?: string;
  description?: string;
  icon?: string;
  loginCtaLabel?: string;
  loginCtaHref?: string;
  returnCtaLabel?: string;
  returnCtaHref?: string;
  showSupport?: boolean;
  className?: string;
}

export const MemberLockedState: React.FC<MemberLockedStateProps> = ({
  title = 'MEMBER ACCESS REQUIRED',
  description = 'This intelligence section requires an authenticated FEF CORTEX community member or master owner account.',
  icon = '🛡️',
  loginCtaLabel = 'MEMBER LOGIN →',
  loginCtaHref = '/member',
  returnCtaLabel = '← Return to Public Dashboard',
  returnCtaHref = '/cockpit',
  showSupport = true,
  className = '',
}) => {
  return (
    <div className={`min-h-[65vh] flex items-center justify-center p-4 font-mono ${className}`}>
      <div className="bg-[#080E1A]/95 border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.15)] space-y-6 animate-in fade-in zoom-in-95 duration-150 relative">
        {/* Header */}
        <div className="text-center space-y-2 border-b border-white/10 pb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 mb-2">
            <span className="text-xl">{icon}</span>
          </div>
          <div className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">
            MEMBER INTELLIGENCE
          </div>
          <h2 className="text-base sm:text-lg font-black tracking-wider text-white uppercase font-sans">
            {title}
          </h2>
          <p className="text-[11px] text-gray-400 font-sans leading-relaxed">
            {description}
          </p>
        </div>

        {/* Primary Action Button (Links to Canonical /member) */}
        <div className="space-y-3">
          <Link
            href={loginCtaHref}
            className="w-full py-3 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-lg bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black shadow-[0_0_25px_rgba(6,182,212,0.4)]"
          >
            <span>🔒</span>
            <span>{loginCtaLabel}</span>
          </Link>

          <div className="text-center">
            <Link
              href={returnCtaHref}
              className="text-[10.5px] text-gray-500 hover:text-cyan-400 transition-colors uppercase tracking-wider inline-block py-1"
            >
              {returnCtaLabel}
            </Link>
          </div>
        </div>

        {/* Contact Admin & Support Channels */}
        {showSupport && (
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="text-[10px] text-gray-400 text-center font-sans">
              Community access is invite-only. Contact your administrator:
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {CORTEX_WHATSAPP_CONFIG.isConfigured && (
                <a
                  href={CORTEX_WHATSAPP_CONFIG.getWhatsAppUrl() || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 hover:text-white text-[10.5px] font-sans font-bold flex items-center justify-center space-x-1.5 transition-all text-center"
                >
                  <span>💬</span>
                  <span>WhatsApp Admin</span>
                </a>
              )}

              <a
                href={`mailto:${SUPPORT_CONFIG.supportEmail}?subject=FEF%20CORTEX%20Account%20Access%20Request`}
                className="flex-1 py-2 px-3 rounded-xl bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 hover:text-white text-[10.5px] font-sans font-bold flex items-center justify-center space-x-1.5 transition-all text-center"
              >
                <span>✉️</span>
                <span>Email Support</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
