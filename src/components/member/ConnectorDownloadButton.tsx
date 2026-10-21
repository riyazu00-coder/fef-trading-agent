'use client';

import React, { useState } from 'react';
import { CONNECTOR_RELEASE_MANIFEST } from '@/lib/downloads/connector-manifest';

interface ConnectorDownloadButtonProps {
  variant?: 'hero' | 'setup' | 'sidebar' | 'custom';
  className?: string;
  label?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function ConnectorDownloadButton({
  variant = 'hero',
  className,
  label,
  onSuccess,
  onError,
}: ConnectorDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);
    setDownloadSuccess(false);

    try {
      const response = await fetch('/api/downloads/connector', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = 'Failed to download connector binary.';
        try {
          const json = await response.json();
          if (json.message) {
            errorMessage = json.message;
          } else if (json.error) {
            errorMessage = `Error (${json.error}): Could not download binary.`;
          }
        } catch {
          if (response.status === 401) {
            errorMessage = 'Authentication required. Please sign in to your Member account.';
          } else if (response.status === 403) {
            errorMessage = 'Your account does not have permission to download this file.';
          } else {
            errorMessage = `Download failed with HTTP ${response.status}.`;
          }
        }

        setDownloadError(errorMessage);
        onError?.(errorMessage);
        return;
      }

      // Check Content-Type
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        // Unexpected JSON payload returned on status 200
        const json = await response.json().catch(() => null);
        const errMsg = json?.message || 'Server returned invalid non-binary payload.';
        setDownloadError(errMsg);
        onError?.(errMsg);
        return;
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        setDownloadError('Downloaded file is empty. Please contact support.');
        onError?.('Empty binary received.');
        return;
      }

      // Trigger programmatic browser download with verified canonical filename
      const downloadUrl = window.URL.createObjectURL(blob);
      const tempAnchor = document.createElement('a');
      tempAnchor.style.display = 'none';
      tempAnchor.href = downloadUrl;
      tempAnchor.download = CONNECTOR_RELEASE_MANIFEST.filename;
      document.body.appendChild(tempAnchor);
      tempAnchor.click();

      // Clean up memory
      setTimeout(() => {
        window.URL.revokeObjectURL(downloadUrl);
        if (tempAnchor.parentNode) {
          tempAnchor.parentNode.removeChild(tempAnchor);
        }
      }, 200);

      setDownloadSuccess(true);
      onSuccess?.();
      setTimeout(() => setDownloadSuccess(false), 6000);
    } catch (err: any) {
      console.error('[DOWNLOAD COMPONENT ERROR]', err);
      const msg = err.message || 'Network error while attempting download.';
      setDownloadError(msg);
      onError?.(msg);
    } finally {
      setIsDownloading(false);
    }
  };

  // Base styling per variant
  let buttonStyle = '';
  let defaultContent: React.ReactNode = null;

  if (variant === 'setup') {
    buttonStyle =
      'px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black font-bold text-xs rounded-xl shadow-[0_0_20px_rgba(6,182,212,0.35)] flex items-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
    defaultContent = (
      <>
        <span>{isDownloading ? '⏳' : downloadSuccess ? '✓' : '⬇️'}</span>
        <span>
          {isDownloading
            ? 'VERIFYING & DOWNLOADING...'
            : downloadSuccess
            ? 'DOWNLOAD COMPLETE! CHECK DOWNLOADS FOLDER'
            : `DOWNLOAD ${CONNECTOR_RELEASE_MANIFEST.filename} (v${CONNECTOR_RELEASE_MANIFEST.version} • ${(
                CONNECTOR_RELEASE_MANIFEST.expectedSize / 1024
              ).toFixed(1)} KB • SHA256 VERIFIED)`}
        </span>
      </>
    );
  } else if (variant === 'sidebar') {
    buttonStyle =
      'w-full py-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-black text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-[0_0_15px_rgba(6,182,212,0.25)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
    defaultContent = (
      <>
        <span>{isDownloading ? '⏳' : downloadSuccess ? '✓' : '⬇️'}</span>
        <span>
          {isDownloading
            ? 'DOWNLOADING...'
            : downloadSuccess
            ? 'DOWNLOADED!'
            : label || `DOWNLOAD MT5 EA (v${CONNECTOR_RELEASE_MANIFEST.version})`}
        </span>
      </>
    );
  } else if (variant === 'hero') {
    buttonStyle =
      'px-6 py-3 bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-black font-black text-xs uppercase tracking-wider rounded-xl shadow-[0_0_25px_rgba(6,182,212,0.4)] flex items-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
    defaultContent = (
      <>
        <span>{isDownloading ? '⏳' : downloadSuccess ? '✓' : '⬇️'}</span>
        <span>
          {isDownloading
            ? 'VERIFYING & DOWNLOADING...'
            : downloadSuccess
            ? 'DOWNLOAD COMPLETE'
            : label || 'DOWNLOAD MT5 EA'}
        </span>
      </>
    );
  } else {
    buttonStyle = className || '';
    defaultContent = (
      <>
        <span>{isDownloading ? '⏳' : downloadSuccess ? '✓' : '⬇️'}</span>
        <span>{label || 'DOWNLOAD'}</span>
      </>
    );
  }

  const finalClassName = className || buttonStyle;

  return (
    <div className="flex flex-col space-y-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={isDownloading}
        className={finalClassName}
        title={`Download ${CONNECTOR_RELEASE_MANIFEST.filename} v${CONNECTOR_RELEASE_MANIFEST.version}`}
      >
        {defaultContent}
      </button>

      {downloadError && (
        <div className="p-3 bg-rose-950/70 border border-rose-500/50 rounded-xl text-xs text-rose-300 flex items-start justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-start space-x-2">
            <span className="text-sm">⚠️</span>
            <div className="space-y-0.5">
              <span className="font-bold block">Download Not Available:</span>
              <span className="text-[11px] text-rose-200">{downloadError}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-rose-400 hover:text-white text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {downloadSuccess && (
        <div className="p-2.5 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-[11px] text-emerald-300 flex items-center space-x-2 animate-in fade-in duration-200">
          <span>✓</span>
          <span>
            Successfully downloaded <strong className="text-white">{CONNECTOR_RELEASE_MANIFEST.filename}</strong>. Move it to your MT5 <code className="bg-black/50 px-1 py-0.5 rounded text-cyan-300">MQL5/Experts</code> folder.
          </span>
        </div>
      )}
    </div>
  );
}

