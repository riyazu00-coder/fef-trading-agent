'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { ChartAnalysisService, ChartAnalysisResponse } from '@/lib/services/chart-analysis-service';

export const ChartVisionAnalyzerCard: React.FC = () => {
  const router = useRouter();
  const { activeSymbol, timeframe } = useActiveAsset();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<ChartAnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync with service on load
  useEffect(() => {
    const existing = ChartAnalysisService.getActiveAnalysis();
    if (existing) {
      setAnalysisResult(existing);
      if (existing.imageThumbnail) {
        setImagePreview(existing.imageThumbnail);
      }
    }
  }, []);

  // Handle image files
  const processImageFile = (file: File) => {
    setErrorMsg(null);
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload a valid image file (PNG, JPG, WebP).');
      return;
    }
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setImagePreview(b64);
      setAnalysisResult(null); // Reset previous result so user can click Analyze
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Clipboard paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFile(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Run Real Analysis
  const handleAnalyze = async () => {
    if (!imagePreview) return;
    setAnalyzing(true);
    setErrorMsg(null);

    const steps = [
      '1. Validating image geometry...',
      '2. Detecting symbol & timeframe...',
      '3. Reading market structure (BOS / CHOCH)...',
      '4. Detecting FVG & Order Blocks...',
      '5. Cross-checking live Exness market...',
      '6. Synthesizing 15-Agent Swarm...'
    ];

    let stepIdx = 0;
    setProgressStep(steps[0]);
    const stepInterval = setInterval(() => {
      stepIdx++;
      if (stepIdx < steps.length) {
        setProgressStep(steps[stepIdx]);
      }
    }, 280);

    try {
      const result = await ChartAnalysisService.analyze({
        image: imagePreview,
        selectedAsset: activeSymbol,
        timeframe: timeframe || 'H1',
        analysisMode: 'FULL_INTELLIGENCE'
      });

      clearInterval(stepInterval);
      setAnalysisResult(result);
    } catch (err: any) {
      clearInterval(stepInterval);
      setErrorMsg(err.message || 'Analysis failed. Please check image.');
    } finally {
      setAnalyzing(false);
      setProgressStep('');
    }
  };

  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImagePreview(null);
    setImageName('');
    setAnalysisResult(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleLoadDemoChart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMsg(null);
    // Lightweight mock chart base64 image
    const demoChartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450" fill="#060c18">
      <rect width="100%" height="100%" fill="#040814"/>
      <line x1="50" y1="350" x2="750" y2="350" stroke="#1e293b" stroke-width="1"/>
      <line x1="50" y1="250" x2="750" y2="250" stroke="#1e293b" stroke-width="1"/>
      <line x1="50" y1="150" x2="750" y2="150" stroke="#1e293b" stroke-width="1"/>
      <!-- Candlesticks -->
      <line x1="120" y1="280" x2="120" y2="380" stroke="#10b981" stroke-width="2"/>
      <rect x="110" y="300" width="20" height="60" fill="#10b981"/>
      <line x1="180" y1="240" x2="180" y2="340" stroke="#10b981" stroke-width="2"/>
      <rect x="170" y="260" width="20" height="50" fill="#10b981"/>
      <line x1="240" y1="270" x2="240" y2="360" stroke="#f43f5e" stroke-width="2"/>
      <rect x="230" y="290" width="20" height="40" fill="#f43f5e"/>
      <line x1="300" y1="210" x2="300" y2="310" stroke="#10b981" stroke-width="2"/>
      <rect x="290" y="230" width="20" height="60" fill="#10b981"/>
      <text x="60" y="80" fill="#00f0ff" font-family="monospace" font-size="18" font-weight="bold">${activeSymbol} ${timeframe} INSTITUTIONAL CHART</text>
      <text x="60" y="110" fill="#94a3b8" font-family="monospace" font-size="12">BOS / CHOCH / FVG SWEEP DEMO</text>
    </svg>`;
    const dataUri = `data:image/svg+xml;base64,${btoa(demoChartSvg)}`;
    setImagePreview(dataUri);
    setImageName(`${activeSymbol}-${timeframe}-demo.png`);
    setAnalysisResult(null);
  };

  const handleViewFullReport = () => {
    router.push('/chart-analyzer');
  };

  const handleCalculatePosition = () => {
    if (!analysisResult) return;
    const isSell = analysisResult.setup.state.includes('SELL');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('fef_load_setup', {
          detail: {
            symbol: analysisResult.symbol,
            direction: isSell ? 'SELL' : 'BUY',
            entryPrice: analysisResult.setup.entryLow,
            stopLoss: analysisResult.setup.stopLoss,
            tp1: analysisResult.setup.tp1,
            tp2: analysisResult.setup.tp2,
            tp3: analysisResult.setup.tp3,
          },
        })
      );
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  };

  return (
    <div className="ghost-glass-panel rounded-2xl p-4 font-mono space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <h3 className="text-xs font-bold text-[#F8FAFC] tracking-[0.06em] font-sans uppercase">
            AI CHART VISION ANALYZER
          </h3>
        </div>
        <div className="flex items-center space-x-2 text-[9px]">
          <button
            onClick={handleLoadDemoChart}
            className="text-cyan-400 hover:text-white bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded transition-colors"
          >
            Load Demo Chart
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* State 1: No Image Selected -> Dropzone */}
      {!imagePreview && !analysisResult && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border border-dashed border-cyan-500/30 hover:border-cyan-400 rounded-xl p-4 bg-black/40 hover:bg-black/60 flex flex-col items-center justify-center text-center space-y-1.5 transition-all cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-300 group-hover:scale-110 transition-transform">
            📸
          </div>
          <span className="text-[11px] text-gray-200 font-bold tracking-wide">
            Click, Drop, or Paste (Ctrl+V) Chart
          </span>
          <p className="text-[8.5px] text-gray-400 max-w-[240px]">
            Supports PNG, JPG, WebP &bull; Extracts BOS, CHOCH, FVG, and validates against live Exness tick stream.
          </p>
        </div>
      )}

      {/* State 2: Image Uploaded -> Show Preview & Action Buttons */}
      {imagePreview && !analysisResult && (
        <div className="space-y-2.5">
          <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/60 max-h-[140px] flex items-center justify-center">
            <img
              src={imagePreview}
              alt="Uploaded Chart"
              className="max-h-[140px] w-auto object-contain"
            />
            {analyzing && (
              <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center space-y-1.5 p-2">
                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[9px] text-cyan-300 font-bold animate-pulse text-center">
                  {progressStep || 'Analyzing Market Structure...'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between text-[9px] text-gray-400 px-1">
            <span className="text-cyan-300 font-bold truncate max-w-[140px]">
              {imageName || `${activeSymbol} Screenshot`}
            </span>
            <span className="text-gray-400">{timeframe} Timeframe</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex-1 bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30 hover:from-cyan-500/40 hover:to-purple-500/40 border border-cyan-500/50 text-white font-bold py-1.5 rounded-xl text-[10px] tracking-wider transition-all shadow-[0_0_15px_rgba(0,240,255,0.2)] disabled:opacity-50"
            >
              {analyzing ? 'ANALYZING CHART...' : '⚡ ANALYZE CHART'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={analyzing}
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-[10px] px-2.5 py-1.5 rounded-xl transition-colors"
            >
              Replace
            </button>
            <button
              onClick={handleRemoveImage}
              disabled={analyzing}
              className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] px-2.5 py-1.5 rounded-xl transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* State 3: Analysis Complete -> Show Compact Blueprint & View Full Report */}
      {analysisResult && (
        <div className="space-y-2.5 pt-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-emerald-400 font-bold flex items-center space-x-1">
              <span>✓</span>
              <span>CHART ANALYSIS COMPLETE</span>
            </span>
            <span className="text-[9px] bg-cyan-950/60 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.2 rounded font-bold">
              {analysisResult.symbol} &bull; {analysisResult.timeframe}
            </span>
          </div>

          {/* Outdated Chart Warning Banner */}
          {analysisResult.livePriceCrossCheck?.isOutdated && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-2 text-[9px] text-amber-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-400 flex items-center space-x-1">
                  <span>⚠️</span>
                  <span>WARNING: UPLOADED CHART MAY BE OUTDATED</span>
                </span>
              </div>
              <div className="flex justify-between text-[8.5px] text-gray-300">
                <span>Chart: ${analysisResult.livePriceCrossCheck.chartDetectedPrice}</span>
                <span>Live: ${analysisResult.livePriceCrossCheck.liveExnessPrice}</span>
                <span className="text-amber-300 font-bold">Diff: {analysisResult.livePriceCrossCheck.diffPercent}%</span>
              </div>
              <button
                onClick={handleAnalyze}
                className="w-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold py-0.5 rounded text-[8.5px] transition-colors cursor-pointer"
              >
                REVALIDATE WITH LIVE PRICE &rarr;
              </button>
            </div>
          )}

          {/* Compact Blueprint Card */}
          <div className="bg-black/40 border border-cyan-500/30 rounded-xl p-2.5 space-y-1.5 text-[9.5px]">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">DIRECTION:</span>
              <span className="font-bold text-emerald-400">
                {analysisResult.setup.state} ({analysisResult.setup.confidence}%)
              </span>
            </div>

            <div className="flex justify-between items-center font-mono">
              <span className="text-gray-400">ENTRY ZONE:</span>
              <span className="text-cyan-300 font-bold">
                ${analysisResult.setup.entryLow.toFixed(2)} - ${analysisResult.setup.entryHigh.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center font-mono">
              <span className="text-rose-400 font-bold">STOP LOSS (SL):</span>
              <span className="text-rose-400 font-bold">
                ${analysisResult.setup.stopLoss.toFixed(2)}
              </span>
            </div>

            <div className="flex justify-between items-center font-mono text-[9px]">
              <span className="text-gray-400">TP TARGETS:</span>
              <span className="text-emerald-400">
                ${analysisResult.setup.tp1.toFixed(2)} | ${analysisResult.setup.tp2.toFixed(2)} | ${analysisResult.setup.tp3.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col space-y-1.5">
            <button
              onClick={handleCalculatePosition}
              className="w-full bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-400/60 text-cyan-200 hover:text-white font-black py-1.5 rounded-xl text-[10px] tracking-wider transition-all shadow-[0_0_12px_rgba(0,240,255,0.25)] flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <span>🧮 CALCULATE LOT SIZE</span>
              <span>&rarr;</span>
            </button>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleViewFullReport}
                className="flex-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 font-bold py-1.5 rounded-xl text-[10px] tracking-wider transition-all shadow-[0_0_12px_rgba(0,240,255,0.2)] flex items-center justify-center space-x-1"
              >
                <span>VIEW FULL REPORT</span>
                <span>&rarr;</span>
              </button>
              <button
                onClick={() => {
                  setAnalysisResult(null);
                  setImagePreview(null);
                }}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-[10px] px-2.5 py-1.5 rounded-xl transition-colors"
              >
                New Chart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {errorMsg && (
        <div className="bg-rose-950/40 border border-rose-500/40 text-rose-300 p-2 rounded-xl text-[9px] leading-tight space-y-1">
          <div className="font-bold uppercase flex items-center space-x-1">
            <span>⚠️</span>
            <span>ANALYSIS FAILED</span>
          </div>
          <p>{errorMsg}</p>
          <button
            onClick={handleAnalyze}
            className="text-cyan-300 underline font-bold text-[8.5px] block mt-1"
          >
            Retry Analysis &rarr;
          </button>
        </div>
      )}
    </div>
  );
};
