'use client';

import React, { useState } from 'react';
import { useLicense } from '@/context/LicenseContext';

export const LicenseActivationModal: React.FC = () => {
  const { licenseState, isLoading, activate } = useLicense();
  const [keyInput, setKeyInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already valid or still loading initial check, do not show modal
  if (isLoading || licenseState.valid) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await activate(keyInput.trim().toUpperCase());
    if (!res.success) {
      setErrorMessage(res.message || 'Activation failed. Please check the license key.');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#090D16] border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-[0_0_50px_rgba(6,182,212,0.25)] space-y-4 font-mono relative animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="text-center space-y-1 border-b border-white/10 pb-4">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 mb-1">
            <span className="text-lg">🔐</span>
          </div>
          <h2 className="text-base font-black tracking-wider text-white uppercase font-sans">
            FEF CORTEX ACTIVATION
          </h2>
          <p className="text-[11px] text-gray-400 font-sans">
            Single-Device License Binding • Authorized Community Access
          </p>
        </div>

        {/* Status notice */}
        <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[11px] text-cyan-200 font-sans">
          Each community license is permanently bound to <strong>ONE COMPUTER</strong>. Enter your personal license key below to activate FEF CORTEX on this machine.
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
              License Key:
            </label>
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
              placeholder="FEF-XXXX-XXXX-XXXX-XXXX"
              maxLength={23}
              disabled={isSubmitting}
              className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-300 font-mono font-bold text-center tracking-[0.18em] text-sm py-2.5 px-3 rounded-xl outline-none placeholder:text-gray-600 focus:shadow-[0_0_15px_rgba(34,211,238,0.25)] transition-all"
            />
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-center space-x-2">
              <span>⚠️</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !keyInput.trim()}
            className={`w-full py-2.5 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-lg ${
              isSubmitting || !keyInput.trim()
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5 shadow-none'
                : 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black shadow-[0_0_25px_rgba(6,182,212,0.4)]'
            }`}
          >
            {isSubmitting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                <span>BINDING TO DEVICE...</span>
              </>
            ) : (
              <span>ACTIVATE DEVICE</span>
            )}
          </button>
        </form>

        <div className="text-[9.5px] text-center text-gray-500 pt-2 border-t border-white/5">
          Need a license key? Contact your FEF Trading Solutions administrator.
        </div>
      </div>
    </div>
  );
};

