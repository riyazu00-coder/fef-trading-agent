'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MarketCategoryFilterBar } from '@/components/cockpit/MarketCategoryFilterBar';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { MemberAccessGuard } from '@/components/common/MemberAccessGuard';
import { useMemberAuth } from '@/context/MemberAuthContext';

interface MemberItem {
  memberId: string;
  email: string;
  name: string;
  role: 'MASTER' | 'MEMBER';
  status: 'ACTIVE' | 'SUSPENDED';
  mustChangePassword: boolean;
  assignedLicenseId: string | null;
  createdAt: number;
  lastLoginAt: number | null;
  license?: {
    licenseId: string;
    prefix: string;
    status: string;
    deviceSlot: string;
    activatedAt: number | null;
    lastValidatedAt: number | null;
    expiresAt: number | null;
  } | null;
}

export default function AdminMembersPage() {
  const { member: currentMember, isMaster } = useMemberAuth();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal / Form state for CREATE MEMBER
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState<'MEMBER' | 'MASTER'>('MEMBER');
  const [autoCreateLicense, setAutoCreateLicense] = useState(true);
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    tempPassword: string;
    licenseKey?: string | null;
    name: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchMembers = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/license/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LIST_MEMBERS' }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.members)) {
        setMembers(data.members);
      } else {
        setErrorMsg(data.error || 'Failed to load member records');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network exception loading members');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createEmail.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/license/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CREATE_MEMBER',
          name: createName.trim(),
          email: createEmail.trim(),
          role: createRole,
          autoCreateLicense,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCreatedCredentials({
          name: createName.trim(),
          email: createEmail.trim(),
          tempPassword: data.tempPassword,
          licenseKey: data.licenseKey || null,
        });
        setCreateName('');
        setCreateEmail('');
        await fetchMembers();
      } else {
        setErrorMsg(data.error || data.message || 'Failed to create member');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetDevice = async (licenseId: string, memberEmail: string) => {
    if (!confirm(`Reset 1/1 device slot for ${memberEmail}? This will allow the member to bind a new computer.`)) {
      return;
    }
    try {
      const res = await fetch('/api/license/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET_DEVICE', licenseId }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Device slot reset for ${memberEmail}. Member can now bind 1 new computer.`);
        setTimeout(() => setSuccessMsg(null), 4000);
        await fetchMembers();
      } else {
        alert(data.error || 'Device reset failed');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  const handleToggleSuspend = async (memberItem: MemberItem) => {
    const isSuspended = memberItem.status === 'SUSPENDED';
    const action = isSuspended ? 'REACTIVATE_MEMBER' : 'SUSPEND_MEMBER';
    if (!confirm(`Are you sure you want to ${isSuspended ? 'reactivate' : 'suspend'} access for ${memberItem.email}?`)) {
      return;
    }
    try {
      const res = await fetch('/api/license/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, memberId: memberItem.memberId }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchMembers();
      } else {
        alert(data.error || 'Status update failed');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  const handleResetPassword = async (memberItem: MemberItem) => {
    if (!confirm(`Generate a new temporary password for ${memberItem.email}?`)) return;
    try {
      const res = await fetch('/api/license/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET_MEMBER_PASSWORD', memberId: memberItem.memberId }),
      });
      const data = await res.json();
      if (data.success && data.tempPassword) {
        prompt(`New Temporary Password for ${memberItem.email} (Copy now):`, data.tempPassword);
        await fetchMembers();
      } else {
        alert(data.error || 'Password reset failed');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    }
  };

  const copyLoginDetails = (creds: { email: string; tempPassword: string; licenseKey?: string | null }) => {
    const text = `FEF CORTEX COMMUNITY ACCESS
Website: https://app.feftradingsolutions.com
Account Email: ${creds.email}
Temporary Password: ${creds.tempPassword}
${creds.licenseKey ? `License Key: ${creds.licenseKey}\n` : ''}
Note: You will be prompted to choose a permanent personal password on your first login.`;

    navigator.clipboard.writeText(text);
    alert('Login details copied to clipboard!');
  };

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      <BackgroundLiveChart symbol="XAUUSD" isPositive={true} />

      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />
        <MarketCategoryFilterBar />

        <MemberAccessGuard
          title="MASTER OWNER ACCESS REQUIRED"
          description="The Member & License Administration Console is exclusively reserved for the FEF CORTEX Master Owner."
          requireMaster={true}
        >
          {/* Top Admin Command Header */}
          <div className="ghost-glass-panel rounded-2xl p-5 space-y-3 font-sans">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl">👑</span>
                  <h1 className="text-xl font-bold text-white uppercase tracking-[0.06em]">
                    MASTER CONSOLE &bull; COMMUNITY MEMBERS DIRECTORY
                  </h1>
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-mono font-bold">
                    OWNER / MASTER ONLY
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Manage community member accounts, assign single-device licenses, generate temporary passwords, and reset hardware slots.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    setCreatedCredentials(null);
                    setIsCreateOpen(true);
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black text-xs font-bold rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.35)] flex items-center space-x-1.5 transition-all cursor-pointer"
                >
                  <span>+</span>
                  <span>CREATE NEW MEMBER</span>
                </button>

                <button
                  onClick={fetchMembers}
                  className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs font-mono rounded-xl transition-all"
                  title="Refresh Member List"
                >
                  🔄
                </button>
              </div>
            </div>

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-xs font-mono flex items-center space-x-2">
                <span>✓</span>
                <span>{successMsg}</span>
              </div>
            )}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs font-mono flex items-center space-x-2">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Members Table */}
          <div className="ghost-glass-panel rounded-2xl overflow-hidden font-mono text-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-[10px] text-gray-400 uppercase tracking-wider">
                    <th className="p-3.5">Member Name &amp; Email</th>
                    <th className="p-3.5">Role</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">License Key Prefix</th>
                    <th className="p-3.5">Device Slot</th>
                    <th className="p-3.5">Last Validated</th>
                    <th className="p-3.5">Created</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500">
                        Loading member database...
                      </td>
                    </tr>
                  ) : members.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500">
                        No community members registered yet. Click &quot;Create New Member&quot; to provision the first member.
                      </td>
                    </tr>
                  ) : (
                    members.map((m) => {
                      const isMasterUser = m.role === 'MASTER';
                      return (
                        <tr key={m.memberId} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-3.5">
                            <div className="font-bold text-white font-sans">{m.name}</div>
                            <div className="text-[11px] text-gray-400">{m.email}</div>
                          </td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${
                              isMasterUser
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            }`}>
                              {m.role}
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className={`px-2 py-0.5 rounded text-[9.5px] font-bold ${
                              m.status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}>
                              {m.status}
                            </span>
                            {m.mustChangePassword && (
                              <div className="text-[9px] text-amber-400 mt-0.5">Temp Pass Active</div>
                            )}
                          </td>
                          <td className="p-3.5">
                            {isMasterUser ? (
                              <span className="text-gray-500">N/A (Bypassed)</span>
                            ) : m.license ? (
                              <span className="text-cyan-300 font-bold">{m.license.prefix}-••••</span>
                            ) : (
                              <span className="text-gray-500">No License</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            {isMasterUser ? (
                              <span className="text-gray-500">Unlimited</span>
                            ) : m.license ? (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                m.license.deviceSlot === '1/1'
                                  ? 'bg-purple-950/60 text-purple-300 border border-purple-500/40'
                                  : 'bg-gray-800 text-gray-400'
                              }`}>
                                {m.license.deviceSlot}
                              </span>
                            ) : (
                              <span className="text-gray-600">-</span>
                            )}
                          </td>
                          <td className="p-3.5 text-gray-400 text-[11px]">
                            {m.license?.lastValidatedAt
                              ? new Date(m.license.lastValidatedAt).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
                              : 'Never'}
                          </td>
                          <td className="p-3.5 text-gray-400 text-[11px]">
                            {new Date(m.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                            {!isMasterUser && m.license && m.license.deviceSlot === '1/1' && (
                              <button
                                onClick={() => handleResetDevice(m.license!.licenseId, m.email)}
                                className="px-2 py-1 bg-amber-950/50 hover:bg-amber-900/60 border border-amber-500/40 text-amber-300 text-[10px] rounded-lg transition-colors cursor-pointer"
                                title="Reset 1/1 device slot"
                              >
                                🔄 Reset Device
                              </button>
                            )}

                            {!isMasterUser && (
                              <button
                                onClick={() => handleResetPassword(m)}
                                className="px-2 py-1 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/40 text-cyan-300 text-[10px] rounded-lg transition-colors cursor-pointer"
                                title="Generate new temporary password"
                              >
                                🔑 Reset Pass
                              </button>
                            )}

                            {!isMasterUser && (
                              <button
                                onClick={() => handleToggleSuspend(m)}
                                className={`px-2 py-1 border text-[10px] rounded-lg transition-colors cursor-pointer ${
                                  m.status === 'ACTIVE'
                                    ? 'bg-rose-950/50 hover:bg-rose-900/60 border-rose-500/40 text-rose-300'
                                    : 'bg-emerald-950/50 hover:bg-emerald-900/60 border-emerald-500/40 text-emerald-300'
                                }`}
                              >
                                {m.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Modal: CREATE NEW MEMBER */}
          {isCreateOpen && (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-[#080E1A] border border-cyan-500/40 rounded-2xl max-w-lg w-full p-6 shadow-[0_0_50px_rgba(6,182,212,0.25)] font-mono space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-sans">
                    PROVISION NEW MEMBER ACCOUNT
                  </h3>
                  <button
                    onClick={() => setIsCreateOpen(false)}
                    className="text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                {!createdCredentials ? (
                  <form onSubmit={handleCreateMember} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400 uppercase">Member Full Name:</label>
                      <input
                        type="text"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="e.g. John Doe"
                        required
                        disabled={isSubmitting}
                        className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-2 px-3 rounded-xl outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400 uppercase">Email Address:</label>
                      <input
                        type="email"
                        value={createEmail}
                        onChange={(e) => setCreateEmail(e.target.value)}
                        placeholder="john.doe@example.com"
                        required
                        disabled={isSubmitting}
                        className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-2 px-3 rounded-xl outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400 uppercase">Account Role:</label>
                      <select
                        value={createRole}
                        onChange={(e) => setCreateRole(e.target.value as any)}
                        className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 text-cyan-200 text-xs py-2 px-3 rounded-xl outline-none"
                      >
                        <option value="MEMBER">MEMBER (Community — Single-Device License Required)</option>
                        <option value="MASTER">MASTER (Platform Owner — Unrestricted Access)</option>
                      </select>
                    </div>

                    {createRole === 'MEMBER' && (
                      <label className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={autoCreateLicense}
                          onChange={(e) => setAutoCreateLicense(e.target.checked)}
                          className="rounded border-gray-600 text-cyan-500 focus:ring-cyan-500"
                        />
                        <span>Automatically generate and assign a new 1-device license key</span>
                      </label>
                    )}

                    <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-[10.5px] text-cyan-300 font-sans leading-relaxed">
                      A cryptographically secure temporary password will be created automatically. The member will be required to choose their own personal password upon initial sign-in.
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setIsCreateOpen(false)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-xs rounded-xl"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold rounded-xl"
                      >
                        {isSubmitting ? 'Provisioning...' : 'Provision Member'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs space-y-2">
                      <div className="font-bold flex items-center space-x-1.5 text-sm">
                        <span>✓</span>
                        <span>Member Account Provisioned Successfully!</span>
                      </div>
                      <p className="text-[11px] text-gray-300 font-sans">
                        Provide these credentials to the member. The temporary password is shown <strong>ONLY ONCE</strong> and is securely hashed in the registry.
                      </p>
                    </div>

                    <div className="bg-black/60 p-3 rounded-xl border border-white/15 space-y-1.5 text-xs font-mono">
                      <div><span className="text-gray-500">Name:</span> <span className="text-white font-bold">{createdCredentials.name}</span></div>
                      <div><span className="text-gray-500">Email:</span> <span className="text-cyan-300">{createdCredentials.email}</span></div>
                      <div><span className="text-gray-500">Temp Password:</span> <span className="text-amber-300 font-bold bg-amber-950/40 px-2 py-0.5 rounded">{createdCredentials.tempPassword}</span></div>
                      {createdCredentials.licenseKey && (
                        <div><span className="text-gray-500">License Key:</span> <span className="text-emerald-300 font-bold">{createdCredentials.licenseKey}</span></div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-white/10">
                      <button
                        onClick={() => copyLoginDetails(createdCredentials)}
                        className="flex-1 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 shadow-lg"
                      >
                        <span>📋</span>
                        <span>COPY LOGIN DETAILS</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsCreateOpen(false);
                          setCreatedCredentials(null);
                        }}
                        className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </MemberAccessGuard>

        <MasterFooter />
      </div>
    </div>
  );
}

