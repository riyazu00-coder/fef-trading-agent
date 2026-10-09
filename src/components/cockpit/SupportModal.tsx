'use client';

import React from 'react';
import { MessageSquare, Send, Mail, Globe, X } from 'lucide-react';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Official FEF CORTEX Contact & Support Modal
 * Strictly locked values:
 * - WhatsApp: +971 55 123 0307 (https://wa.me/971551230307)
 * - Telegram: @feftrading (https://t.me/feftrading)
 * - Email: fefhvn@gmail.com (mailto:fefhvn@gmail.com)
 * - Website: FEF Trading Solutions (https://www.feftradingsolutions.com)
 */
export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const contactChannels = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Desk',
      value: '+971 55 123 0307',
      url: 'https://wa.me/971551230307',
      actionLabel: 'Message WhatsApp',
      badge: 'DIRECT HOTLINE',
      badgeColor: 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300',
      Icon: MessageSquare,
      iconColor: '#34d399',
    },
    {
      id: 'telegram',
      name: 'Telegram Official',
      value: '@feftrading',
      url: 'https://t.me/feftrading',
      actionLabel: 'Open Telegram Channel',
      badge: 'COMMUNITY & SIGNALS',
      badgeColor: 'bg-sky-950/70 border-sky-500/40 text-sky-300',
      Icon: Send,
      iconColor: '#38bdf8',
    },
    {
      id: 'email',
      name: 'Official Email Desk',
      value: 'fefhvn@gmail.com',
      url: 'mailto:fefhvn@gmail.com',
      actionLabel: 'Launch Email Client',
      badge: 'ACCOUNT & SUPPORT',
      badgeColor: 'bg-cyan-950/70 border-cyan-500/40 text-cyan-300',
      Icon: Mail,
      iconColor: '#22d3ee',
    },
    {
      id: 'website',
      name: 'Official Website',
      value: 'FEF Trading Solutions',
      url: 'https://www.feftradingsolutions.com',
      actionLabel: 'Visit Website',
      badge: 'PORTAL',
      badgeColor: 'bg-purple-950/70 border-purple-500/40 text-purple-300',
      Icon: Globe,
      iconColor: '#c084fc',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in font-sans"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85),0_0_35px_rgba(34,211,238,0.2)] border border-cyan-500/30 font-mono space-y-4"
        style={{
          background: 'linear-gradient(135deg, rgba(10, 22, 42, 0.94) 0%, rgba(5, 12, 26, 0.98) 100%)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Specular Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 rounded-t-2xl" />

        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.3)]">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-black text-white tracking-wider uppercase">
                  OFFICIAL FEF CONTACT DESK
                </h3>
                <span className="px-1.5 py-0.2 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[8.5px] font-bold">
                  VERIFIED CHANNELS
                </span>
              </div>
              <p className="text-[9px] text-gray-400 font-sans mt-0.5">
                Direct Onboarding, Bridge Integration &amp; Technical Support
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close Contact Modal"
            className="text-gray-400 hover:text-white text-sm cursor-pointer p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Official Channels List */}
        <div className="space-y-2">
          {contactChannels.map((ch) => {
            const ChannelIcon = ch.Icon;
            return (
              <a
                key={ch.id}
                href={ch.url}
                target={ch.id === 'email' ? undefined : '_blank'}
                rel={ch.id === 'email' ? undefined : 'noopener noreferrer'}
                className="p-3 rounded-xl bg-black/50 border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-950/30 transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/10 bg-black/60 group-hover:scale-105 transition-transform"
                    style={{ color: ch.iconColor }}
                  >
                    <ChannelIcon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-bold text-white group-hover:text-cyan-200 transition-colors">
                        {ch.name}
                      </span>
                      <span className={`text-[7.5px] px-1 py-0.2 rounded border font-mono font-bold ${ch.badgeColor}`}>
                        {ch.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-cyan-300/90 font-mono tracking-wide truncate mt-0.5">
                      {ch.value}
                    </p>
                  </div>
                </div>

                <span className="text-gray-400 group-hover:text-cyan-300 text-xs transition-colors pl-2">
                  &rarr;
                </span>
              </a>
            );
          })}
        </div>

        {/* Safety Notice */}
        <div className="p-2 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[9px] text-cyan-300/80 leading-snug font-sans">
          <span className="font-bold text-white">Notice: </span>
          Official FEF communication is conducted solely through the verified channels above.
        </div>

        {/* Footer Meta */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[9px] text-gray-400">
          <span>feftradingsolutions.com</span>
          <span className="text-cyan-400 font-bold">FEF CORTEX • 24/7 Connectivity</span>
        </div>
      </div>
    </div>
  );
};
