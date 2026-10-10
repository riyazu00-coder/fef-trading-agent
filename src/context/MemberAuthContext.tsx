'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface MemberProfile {
  memberId: string;
  email: string;
  username?: string | null;
  name: string;
  role: 'MASTER' | 'MEMBER';
  status: 'ACTIVE' | 'SUSPENDED';
  mustChangePassword?: boolean;
  assignedLicenseId: string | null;
  createdAt?: number;
  lastLoginAt?: number | null;
}

export interface MemberLicenseInfo {
  licenseId: string;
  prefix: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  maxDevices: number;
  activatedDeviceHash: string | null;
  expiresAt: number | null;
}

export interface MemberDeviceInfo {
  fingerprint: string;
  status: string; // 'UNCLAIMED' | 'AUTHORIZED' | 'ANOTHER_DEVICE' | 'NO_LICENSE' | 'MASTER_BYPASS' | string
  isAuthorized: boolean;
  hasLocalToken: boolean;
}

export interface MemberAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isMaster: boolean;
  member: MemberProfile | null;
  license: MemberLicenseInfo | null;
  device: MemberDeviceInfo | null;
  isDeviceAuthorized: boolean;
  mustChangePassword: boolean;
  login: (identifier: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
  authorizeDevice: () => Promise<{ success: boolean; message?: string }>;
  refresh: () => Promise<void>;
}

const MemberAuthContext = createContext<MemberAuthContextType | null>(null);

export const MemberAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [license, setLicense] = useState<MemberLicenseInfo | null>(null);
  const [device, setDevice] = useState<MemberDeviceInfo | null>(null);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/member', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setIsAuthenticated(Boolean(data.authenticated));
        setMember(data.member || null);
        setLicense(data.license || null);
        setDevice(data.device || null);
        setIsDeviceAuthorized(Boolean(data.isDeviceAuthorized));
      } else {
        setIsAuthenticated(false);
        setMember(null);
        setLicense(null);
        setDevice(null);
        setIsDeviceAuthorized(false);
      }
    } catch {
      setIsAuthenticated(false);
      setMember(null);
      setLicense(null);
      setDevice(null);
      setIsDeviceAuthorized(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (identifier: string, password: string): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LOGIN', identifier, email: identifier, password }),
      });
      const data = await res.json();
      if (data.success) {
        await refresh();
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || data.error || 'Authentication failed.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network exception during login.' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'LOGOUT' }),
      });
      await refresh();
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (oldPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'CHANGE_PASSWORD', oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        await refresh();
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || data.error || 'Password update failed.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network exception during password update.' };
    } finally {
      setIsLoading(false);
    }
  };

  const authorizeDevice = async (): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'AUTHORIZE_DEVICE' }),
      });
      const data = await res.json();
      if (data.success) {
        await refresh();
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || data.error || 'Device authorization failed.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network exception during device authorization.' };
    } finally {
      setIsLoading(false);
    }
  };

  const isMaster = member?.role === 'MASTER';
  const mustChangePassword = Boolean(member?.mustChangePassword);

  return (
    <MemberAuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        isMaster,
        member,
        license,
        device,
        isDeviceAuthorized,
        mustChangePassword,
        login,
        logout,
        changePassword,
        authorizeDevice,
        refresh,
      }}
    >
      {children}
    </MemberAuthContext.Provider>
  );
};

export const useMemberAuth = (): MemberAuthContextType => {
  const ctx = useContext(MemberAuthContext);
  if (!ctx) {
    throw new Error('useMemberAuth must be used within a MemberAuthProvider');
  }
  return ctx;
};
