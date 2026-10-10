'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { LicenseValidationResult } from '@/lib/licensing/license-types';

interface LicenseContextType {
  licenseState: LicenseValidationResult;
  isLoading: boolean;
  activate: (key: string) => Promise<{ success: boolean; message?: string }>;
  deactivate: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_LICENSE_STATE: LicenseValidationResult = {
  valid: false,
  status: 'UNLICENSED',
  code: 'LICENSE_REQUIRED',
  message: 'Loading license state...',
};

const LicenseContext = createContext<LicenseContextType | null>(null);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [licenseState, setLicenseState] = useState<LicenseValidationResult>(DEFAULT_LICENSE_STATE);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/license/status', { cache: 'no-store' });
      const data = await res.json();
      setLicenseState(data);
    } catch {
      setLicenseState({
        valid: false,
        status: 'ERROR',
        code: 'LICENSE_VALIDATION_UNAVAILABLE',
        message: 'Could not connect to licensing verification service.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activate = async (key: string): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/license/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ACTIVATE', licenseKey: key }),
      });
      const data = await res.json();
      if (data.success) {
        await refresh();
        return { success: true, message: data.message };
      }
      return { success: false, message: data.message || data.error || 'Activation failed.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Network exception during activation.' };
    } finally {
      setIsLoading(false);
    }
  };

  const deactivate = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await fetch('/api/license/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DEACTIVATE' }),
      });
      await refresh();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LicenseContext.Provider value={{ licenseState, isLoading, activate, deactivate, refresh }}>
      {children}
    </LicenseContext.Provider>
  );
};

export const useLicense = (): LicenseContextType => {
  const ctx = useContext(LicenseContext);
  if (!ctx) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return ctx;
};

