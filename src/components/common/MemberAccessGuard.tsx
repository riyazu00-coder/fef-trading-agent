'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useMemberAuth } from '@/context/MemberAuthContext';
import { SUPPORT_CONFIG, CORTEX_WHATSAPP_CONFIG } from '@/lib/config/support-config';

interface MemberAccessGuardProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  requireMaster?: boolean; // For MASTER-only pages (/admin/members)
}

export const MemberAccessGuard: React.FC<MemberAccessGuardProps> = ({
  children,
  title = 'MEMBER ACCESS REQUIRED',
  description = 'This intelligence section requires an authenticated FEF CORTEX community member or master owner account.',
  requireMaster = false,
}) => {
  const {
    isAuthenticated,
    isLoading,
    isMaster,
    member,
    license,
    device,
    isDeviceAuthorized,
    mustChangePassword,
    login,
    changePassword,
    authorizeDevice,
  } = useMemberAuth();

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // If loading session state, display sleek futuristic loader
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 font-mono">
        <div className="w-10 h-10 border-2 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <div className="text-xs text-gray-400 tracking-wider">VERIFYING CORTEX CREDENTIALS & ACCESS ENTITLEMENT...</div>
      </div>
    );
  }

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await login(emailInput.trim(), passwordInput);
    if (!res.success) {
      setErrorMessage(res.message || 'Invalid credentials.');
    }
    setIsSubmitting(false);
  };

  // Handle Mandatory Password Change
  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordInput || newPasswordInput.length < 8) {
      setErrorMessage('New password must be at least 8 characters long.');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await changePassword(oldPasswordInput, newPasswordInput);
    if (!res.success) {
      setErrorMessage(res.message || 'Password update failed.');
    } else {
      setSuccessMessage('Password changed successfully. Your account is now fully secured.');
    }
    setIsSubmitting(false);
  };

  // Handle Device Authorization
  const handleAuthorizeDevice = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await authorizeDevice();
    if (!res.success) {
      setErrorMessage(res.message || 'Device authorization failed.');
    }
    setIsSubmitting(false);
  };

  // -------------------------------------------------------------
  // STATE 1: NOT AUTHENTICATED
  // -------------------------------------------------------------
  if (!isAuthenticated || !member) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-[#080E1A]/95 border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.15)] font-mono space-y-6 animate-in fade-in zoom-in-95 duration-150 relative">
          {/* Header */}
          <div className="text-center space-y-1.5 border-b border-white/10 pb-5">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 mb-2">
              <span className="text-xl">🛡️</span>
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-wider text-white uppercase font-sans">
              {title}
            </h2>
            <p className="text-[11px] text-gray-400 font-sans leading-relaxed">
              {description}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
                Username or Email:
              </label>
              <input
                type="text"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="master_username / member@domain.com"
                required
                autoCapitalize="none"
                autoCorrect="off"
                disabled={isSubmitting}
                className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-2.5 px-3 rounded-xl outline-none placeholder:text-gray-600 focus:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
                Password:
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••••••"
                required
                disabled={isSubmitting}
                className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-2.5 px-3 rounded-xl outline-none placeholder:text-gray-600 focus:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all font-mono"
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-center space-x-2">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !emailInput.trim() || !passwordInput}
              className={`w-full py-2.5 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-lg ${
                isSubmitting || !emailInput.trim() || !passwordInput
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-white/5 shadow-none'
                  : 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black shadow-[0_0_25px_rgba(6,182,212,0.4)]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>AUTHENTICATING...</span>
                </>
              ) : (
                <span>SIGN IN TO ACCESS</span>
              )}
            </button>
          </form>

          {/* Contact Admin & Support Channels */}
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
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 hover:text-white text-[10.5px] font-sans font-bold flex items-center justify-center space-x-1.5 transition-all"
                >
                  <span>💬</span>
                  <span>WhatsApp Admin</span>
                </a>
              )}

              <a
                href={`mailto:${SUPPORT_CONFIG.supportEmail}?subject=FEF%20CORTEX%20Account%20Access%20Request`}
                className="flex-1 py-2 px-3 rounded-xl bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 hover:text-white text-[10.5px] font-sans font-bold flex items-center justify-center space-x-1.5 transition-all"
              >
                <span>✉️</span>
                <span>Email Support</span>
              </a>
            </div>

            <div className="text-center">
              <Link
                href="/cockpit"
                className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors uppercase tracking-wider"
              >
                ← Return to Public Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 2: MANDATORY PASSWORD CHANGE REQUIRED (First Login)
  // -------------------------------------------------------------
  if (mustChangePassword) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-[#080E1A]/95 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.2)] font-mono space-y-5 animate-in fade-in zoom-in-95 duration-150">
          <div className="text-center space-y-1.5 border-b border-white/10 pb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 mb-1">
              <span className="text-xl">🔐</span>
            </div>
            <h2 className="text-base font-black tracking-wider text-white uppercase font-sans">
              UPDATE TEMPORARY PASSWORD
            </h2>
            <p className="text-[11px] text-gray-400 font-sans">
              Welcome, <span className="text-cyan-300 font-bold">{member.name}</span>! For account security, you must replace your temporary password before proceeding.
            </p>
          </div>

          <form onSubmit={handlePasswordChangeSubmit} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
                Current Temporary Password:
              </label>
              <input
                type="password"
                value={oldPasswordInput}
                onChange={(e) => setOldPasswordInput(e.target.value)}
                placeholder="Enter current password"
                required
                disabled={isSubmitting}
                className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-2 px-3 rounded-xl outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
                New Personal Password (min 8 characters):
              </label>
              <input
                type="password"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="Create new password"
                required
                disabled={isSubmitting}
                className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-2 px-3 rounded-xl outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase tracking-wider block">
                Confirm New Password:
              </label>
              <input
                type="password"
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                placeholder="Re-enter new password"
                required
                disabled={isSubmitting}
                className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-2 px-3 rounded-xl outline-none"
              />
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-center space-x-2">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs flex items-center space-x-2">
                <span>✓</span>
                <span>{successMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !newPasswordInput}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-sans font-black text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)]"
            >
              {isSubmitting ? 'UPDATING PASSWORD...' : 'SET NEW PASSWORD & CONTINUE'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 3: MASTER ROLE CHECKS & PRIVILEGES
  // -------------------------------------------------------------
  if (isMaster) {
    // MASTER bypasses community license and device checks completely!
    return <>{children}</>;
  }

  // -------------------------------------------------------------
  // STATE 4: NON-MASTER ATTEMPTING TO ACCESS MASTER-ONLY PAGE
  // -------------------------------------------------------------
  if (requireMaster && !isMaster) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-[#080E1A]/95 border border-rose-500/40 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-[0_0_50px_rgba(244,63,94,0.15)] font-mono space-y-5 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-400/40 text-rose-400 mb-1">
            <span className="text-xl">⛔</span>
          </div>
          <h2 className="text-base font-black tracking-wider text-white uppercase font-sans">
            MASTER PRIVILEGES REQUIRED
          </h2>
          <p className="text-xs text-gray-400 font-sans leading-relaxed">
            This administration portal is strictly restricted to the FEF CORTEX Master Owner. Community members do not have permission to view or manage member records.
          </p>
          <div className="pt-2">
            <Link
              href="/member"
              className="inline-block py-2 px-4 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-bold font-sans"
            >
              Go to Member Portal
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 5: COMMUNITY MEMBER — LICENSE ENTITLEMENT CHECK
  // -------------------------------------------------------------
  if (!license || license.status !== 'ACTIVE') {
    return (
      <div className="min-h-[75vh] flex items-center justify-center p-4">
        <div className="bg-[#080E1A]/95 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-[0_0_50px_rgba(245,158,11,0.15)] font-mono space-y-5">
          <div className="text-center space-y-1.5 border-b border-white/10 pb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-400/40 text-amber-300 mb-1">
              <span className="text-xl">⚠️</span>
            </div>
            <h2 className="text-base font-black tracking-wider text-white uppercase font-sans">
              MEMBERSHIP LICENSE REQUIRED
            </h2>
            <p className="text-[11px] text-gray-400 font-sans">
              Welcome, <span className="text-cyan-300 font-bold">{member.name}</span> ({member.email})
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs font-sans leading-relaxed">
            {license ? (
              <>Your assigned license status is <strong>{license.status}</strong>. Please reach out to your administrator to renew or reactivate your entitlement.</>
            ) : (
              <>Your member account does not currently have an active FEF CORTEX license key assigned. Please contact the administrator to grant entitlement.</>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <a
              href={`mailto:${SUPPORT_CONFIG.supportEmail}?subject=License%20Entitlement%20Request%20for%20${encodeURIComponent(member.email)}`}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-sans font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-lg"
            >
              <span>✉️</span>
              <span>Contact Admin for Entitlement</span>
            </a>

            <div className="text-center pt-2">
              <Link
                href="/cockpit"
                className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors uppercase tracking-wider"
              >
                ← Return to Public Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // STATE 6: COMMUNITY MEMBER — DEVICE AUTHORIZATION (1/1 SLOTS)
  // -------------------------------------------------------------
  if (isDeviceAuthorized) {
    return <>{children}</>;
  }

  const isAnotherDevice = device?.status === 'ANOTHER_DEVICE';

  return (
    <div className="min-h-[75vh] flex items-center justify-center p-4">
      <div className="bg-[#080E1A]/95 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-[0_0_50px_rgba(6,182,212,0.2)] font-mono space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <div className="text-center space-y-1.5 border-b border-white/10 pb-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 mb-1">
            <span className="text-xl">💻</span>
          </div>
          <h2 className="text-base font-black tracking-wider text-white uppercase font-sans">
            DEVICE AUTHORIZATION
          </h2>
          <p className="text-[11px] text-gray-400 font-sans">
            Member: <span className="text-cyan-300 font-bold">{member.name}</span> • License: <span className="text-cyan-300 font-bold">{license.prefix}-••••</span>
          </p>
        </div>

        {isAnotherDevice ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs font-sans leading-relaxed">
              <strong>Device Slot 1/1 Already Claimed:</strong> Your license is already bound to another computer. Each community member license is restricted to <strong>1 physical machine</strong>.
            </div>

            <p className="text-[11px] text-gray-400 font-sans leading-relaxed">
              To move your license to this computer, request an authorized device slot reset from your administrator.
            </p>

            <a
              href={`mailto:${SUPPORT_CONFIG.supportEmail}?subject=Device%20Reset%20Request%20for%20License%20${license.prefix}`}
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-sans font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all shadow-lg"
            >
              <span>🔄</span>
              <span>Request Device Slot Reset</span>
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-xs font-sans leading-relaxed">
              <strong>0/1 Device Slots Used:</strong> Your active license is ready to be authorized on this computer. Clicking below will bind this computer as your 1 authorized device.
            </div>

            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs flex items-center space-x-2">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              onClick={handleAuthorizeDevice}
              disabled={isSubmitting}
              className={`w-full py-2.5 rounded-xl font-sans font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-lg ${
                isSubmitting
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black shadow-[0_0_25px_rgba(6,182,212,0.4)]'
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>AUTHORIZING THIS COMPUTER...</span>
                </>
              ) : (
                <span>AUTHORIZE THIS DEVICE (1/1 SLOTS)</span>
              )}
            </button>
          </div>
        )}

        <div className="text-center pt-2">
          <Link
            href="/cockpit"
            className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors uppercase tracking-wider"
          >
            ← Return to Public Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
};
