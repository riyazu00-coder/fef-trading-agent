'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BackgroundLiveChart } from '@/components/charts/BackgroundLiveChart';
import { MasterTopNav } from '@/components/cockpit/MasterTopNav';
import { MasterFooter } from '@/components/cockpit/MasterFooter';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import {
  ChartAnalysisService,
  ChartAnalysisResponse,
  ChartAnalysisHistoryItem
} from '@/lib/services/chart-analysis-service';
import { validateTradeBlueprint } from '@/lib/chart-analysis/blueprint-validator';

export default function ChartAnalyzerPage() {
  const router = useRouter();
  const { activeSymbol, setActiveSymbol, activeAsset, timeframe, setTimeframe, assetProfile } = useActiveAsset();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [analysisMode, setAnalysisMode] = useState<'CHART_ONLY' | 'FULL_INTELLIGENCE'>('FULL_INTELLIGENCE');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<ChartAnalysisResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // UI Interactive Controls
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historyList, setHistoryList] = useState<ChartAnalysisHistoryItem[]>([]);

  const supportedTfs = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

  // 1. Initial hydration from shared ChartAnalysisService
  useEffect(() => {
    const active = ChartAnalysisService.getActiveAnalysis();
    if (active) {
      setAnalysisResult(active);
      if (active.imageThumbnail) {
        setImagePreview(active.imageThumbnail);
      }
      setImageName(`${active.symbol}-${active.timeframe}-analyzed.png`);
    } else {
      // Auto-load a clean demo chart if none exists
      loadDemoChart();
    }
    setHistoryList(ChartAnalysisService.getHistory());
  }, []);

  // 2. Load Demo Chart Helper
  const loadDemoChart = (customSymbol?: string) => {
    const sym = customSymbol || activeSymbol || 'XAUUSD';
    const demoChartSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500" fill="#040812">
      <rect width="100%" height="100%" fill="#040812"/>
      <line x1="60" y1="400" x2="840" y2="400" stroke="#1e293b" stroke-width="1" stroke-dasharray="4"/>
      <line x1="60" y1="300" x2="840" y2="300" stroke="#1e293b" stroke-width="1" stroke-dasharray="4"/>
      <line x1="60" y1="200" x2="840" y2="200" stroke="#1e293b" stroke-width="1" stroke-dasharray="4"/>
      <line x1="60" y1="100" x2="840" y2="100" stroke="#1e293b" stroke-width="1" stroke-dasharray="4"/>
      
      <!-- SMC Demand Block -->
      <rect x="220" y="310" width="180" height="50" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1.5" stroke-dasharray="2"/>
      <text x="230" y="335" fill="#10b981" font-family="monospace" font-size="11" font-weight="bold">H1 DEMAND ORDER BLOCK</text>
      
      <!-- FVG Zone -->
      <rect x="420" y="240" width="140" height="40" fill="#06b6d4" fill-opacity="0.15" stroke="#06b6d4" stroke-width="1.5"/>
      <text x="430" y="265" fill="#06b6d4" font-family="monospace" font-size="11" font-weight="bold">FAIR VALUE GAP (FVG)</text>

      <!-- Candlesticks -->
      <line x1="140" y1="320" x2="140" y2="420" stroke="#f43f5e" stroke-width="2"/>
      <rect x="130" y="340" width="20" height="60" fill="#f43f5e"/>
      <line x1="200" y1="310" x2="200" y2="410" stroke="#10b981" stroke-width="2"/>
      <rect x="190" y="320" width="20" height="70" fill="#10b981"/>
      <line x1="260" y1="290" x2="260" y2="370" stroke="#10b981" stroke-width="2"/>
      <rect x="250" y="300" width="20" height="50" fill="#10b981"/>
      <line x1="320" y1="270" x2="320" y2="350" stroke="#10b981" stroke-width="2"/>
      <rect x="310" y="280" width="20" height="50" fill="#10b981"/>
      <line x1="380" y1="260" x2="380" y2="330" stroke="#f43f5e" stroke-width="2"/>
      <rect x="370" y="270" width="20" height="40" fill="#f43f5e"/>
      <line x1="440" y1="220" x2="440" y2="310" stroke="#10b981" stroke-width="2"/>
      <rect x="430" y="235" width="20" height="60" fill="#10b981"/>
      <line x1="500" y1="190" x2="500" y2="280" stroke="#10b981" stroke-width="2"/>
      <rect x="490" y="205" width="20" height="60" fill="#10b981"/>
      
      <!-- Title & Annotation -->
      <text x="60" y="50" fill="#00f0ff" font-family="monospace" font-size="16" font-weight="bold">${sym} ${timeframe} INSTITUTIONAL SMC CHART</text>
      <text x="60" y="72" fill="#94a3b8" font-family="monospace" font-size="11">SWEEP OF ASIAN LIQUIDITY &bull; BULLISH CHOCH IMPULSE</text>
    </svg>`;
    const dataUri = `data:image/svg+xml;base64,${btoa(demoChartSvg)}`;
    setImagePreview(dataUri);
    setImageName(`${sym}-${timeframe}-institutional.png`);
    runRealAnalysis(dataUri, sym);
  };

  // 3. Process File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Please upload a valid image file (PNG, JPG, WebP).');
        return;
      }
      setImageName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result as string;
        setImagePreview(b64);
        runRealAnalysis(b64, activeSymbol);
      };
      reader.readAsDataURL(file);
    }
  };

  // 4. Clipboard paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            setImageName('clipboard-screenshot.png');
            const reader = new FileReader();
            reader.onload = () => {
              const b64 = reader.result as string;
              setImagePreview(b64);
              runRealAnalysis(b64, activeSymbol);
            };
            reader.readAsDataURL(file);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeSymbol, timeframe, analysisMode]);

  // 5. Execute Analysis via Service
  const runRealAnalysis = async (imgData: string, sym: string) => {
    setAnalyzing(true);
    setErrorMsg(null);

    const steps = [
      '1. Validating chart image geometry...',
      '2. Detecting candlestick boundaries & scale...',
      '3. Identifying BOS & CHOCH pivots...',
      '4. Mapping Fair Value Gaps & Order Blocks...',
      '5. Cross-checking live Exness market quotes...',
      '6. Consulting 15-Agent Consensus Council...'
    ];

    let sIdx = 0;
    setProgressStep(steps[0]);
    const interval = setInterval(() => {
      sIdx++;
      if (sIdx < steps.length) {
        setProgressStep(steps[sIdx]);
      }
    }, 280);

    try {
      const result = await ChartAnalysisService.analyze({
        image: imgData,
        selectedAsset: sym,
        timeframe: timeframe || 'H1',
        analysisMode: analysisMode
      });

      clearInterval(interval);
      setAnalysisResult(result);
      setHistoryList(ChartAnalysisService.getHistory());
    } catch (err: any) {
      clearInterval(interval);
      setErrorMsg(err.message || 'Vision analysis failed. Please verify image.');
    } finally {
      setAnalyzing(false);
      setProgressStep('');
    }
  };

  const validation = validateTradeBlueprint(analysisResult?.setup);
  const isMarketOpen = assetProfile?.tradeExecutable ?? true;
  const isTrustApproved = (assetProfile?.evidenceTrust ?? 100) >= 60;
  const canSendToExecution = Boolean(analysisResult && validation.isValid && isMarketOpen && isTrustApproved);
  const canCalculatePosition = Boolean(analysisResult && validation.isValid);

  const handleTransferToExecution = () => {
    if (!canSendToExecution || !analysisResult) return;
    setActiveSymbol(analysisResult.symbol);
    router.push('/execution');
  };

  const handleCalculatePositionSize = () => {
    if (!canCalculatePosition || !analysisResult) return;
    const isSell = validation.direction === 'SELL';
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        'fef_calc_pending_setup',
        JSON.stringify({
          symbol: analysisResult.symbol,
          direction: isSell ? 'SELL' : 'BUY',
          entryPrice: isSell ? analysisResult.setup.entryHigh : analysisResult.setup.entryLow,
          stopLoss: analysisResult.setup.stopLoss,
          tp1: analysisResult.setup.tp1,
          tp2: analysisResult.setup.tp2,
          tp3: analysisResult.setup.tp3,
        })
      );
    }
    router.push('/cockpit');
  };

  return (
    <div className="relative min-h-screen bg-[#030711] text-[#F8FAFC] flex flex-col font-sans selection:bg-[#22D3EE] selection:text-black overflow-x-hidden">
      {/* Background Aurora */}
      <BackgroundLiveChart symbol={activeSymbol} isPositive={true} />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col p-2 sm:p-4 space-y-4 w-full max-w-[1920px] mx-auto">
        <MasterTopNav />

        {/* Control Header & Mode Bar */}
        <div className="ghost-glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">👁️</span>
                <h1 className="text-xl font-sans font-bold text-[#F8FAFC] uppercase tracking-[0.06em]">
                  AI CHART VISION & SMC WORKSPACE
                </h1>
                <span className="text-[9px] bg-cyan-950/60 text-[#67E8F9] border border-cyan-500/40 px-2 py-0.5 rounded font-mono font-bold">
                  MULTIMODAL SMC ENGINE
                </span>
                {analysisResult?.providerStatus === 'HEURISTIC_DEMO' && (
                  <span className="text-[9px] bg-amber-950/60 text-[#FBBF24] border border-amber-500/40 px-2 py-0.5 rounded font-mono font-bold">
                    [DEMO / HEURISTIC]
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8] font-sans mt-1">
                Unified Institutional Chart Analyzer &bull; Real Image Extraction of BOS, CHOCH, FVG, Order Blocks &bull; 15-Agent Swarm Cross-Check
              </p>
            </div>

            {/* Mode Selector & History Trigger */}
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1.5 bg-black/50 p-1.5 rounded-xl border border-white/10">
                <span className="text-[10px] text-gray-400 px-1 uppercase font-bold">MODE:</span>
                <button
                  onClick={() => {
                    setAnalysisMode('CHART_ONLY');
                    if (imagePreview) runRealAnalysis(imagePreview, activeSymbol);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    analysisMode === 'CHART_ONLY'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  CHART ONLY
                </button>
                <button
                  onClick={() => {
                    setAnalysisMode('FULL_INTELLIGENCE');
                    if (imagePreview) runRealAnalysis(imagePreview, activeSymbol);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    analysisMode === 'FULL_INTELLIGENCE'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  FULL INTELLIGENCE (+ SWARM)
                </button>
              </div>

              <button
                onClick={() => setShowHistory(!showHistory)}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-xs px-3 py-2 rounded-xl transition-colors flex items-center space-x-1.5"
              >
                <span>📜</span>
                <span>History ({historyList.length})</span>
              </button>
            </div>
          </div>

          {/* Timeframe & Action Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
            {/* Timeframe selector */}
            <div className="flex items-center space-x-1.5 text-xs">
              <span className="text-gray-400 text-[10px] uppercase font-bold mr-1">TIMEFRAME:</span>
              {supportedTfs.map((tf) => (
                <button
                  key={tf}
                  onClick={() => {
                    setTimeframe(tf);
                    if (imagePreview) runRealAnalysis(imagePreview, activeSymbol);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    timeframe === tf
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Quick Upload / Presets */}
            <div className="flex items-center space-x-2 text-xs">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-300 px-3 py-1.5 rounded-xl font-bold transition-all"
              >
                📁 Upload Screenshot
              </button>
              <button
                onClick={() => loadDemoChart('XAUUSD')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 px-2.5 py-1.5 rounded-xl transition-colors text-[11px]"
              >
                XAU Demo
              </button>
              <button
                onClick={() => loadDemoChart('EURUSD')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 px-2.5 py-1.5 rounded-xl transition-colors text-[11px]"
              >
                EUR Demo
              </button>
              <button
                onClick={() => loadDemoChart('USOIL')}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 px-2.5 py-1.5 rounded-xl transition-colors text-[11px]"
              >
                Oil Demo
              </button>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Outdated Chart Price Warning Alert */}
        {analysisResult?.livePriceCrossCheck.isOutdated && (
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 text-xs flex items-center justify-between gap-4 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
            <div className="flex items-center space-x-3">
              <span className="text-xl">⚠️</span>
              <div>
                <span className="font-bold block uppercase text-amber-400">
                  WARNING: UPLOADED CHART APPEARS OUTDATED
                </span>
                <span>{analysisResult.livePriceCrossCheck.warningMessage}</span>
              </div>
            </div>
            <button
              onClick={() => {
                if (imagePreview) runRealAnalysis(imagePreview, activeSymbol);
              }}
              className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs px-3.5 py-1.5 rounded-lg font-bold shrink-0 transition-colors"
            >
              SYNC WITH LIVE TICK
            </button>
          </div>
        )}

        {/* Error Alert Display */}
        {errorMsg && (
          <div className="bg-rose-950/40 border border-rose-500/50 text-rose-300 rounded-2xl p-4 text-xs flex items-start justify-between gap-3 shadow-[0_0_20px_rgba(244,63,94,0.2)]">
            <div className="flex items-start space-x-2.5">
              <span className="text-lg mt-0.5">⚠️</span>
              <div>
                <span className="font-bold block uppercase text-rose-400 text-sm">
                  ANALYSIS FAILED / REJECTED
                </span>
                <p className="mt-1 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
            <button
              onClick={() => loadDemoChart()}
              className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-xl font-bold shrink-0 transition-colors"
            >
              Load Valid Demo Chart &rarr;
            </button>
          </div>
        )}

        {/* Main 3-Column Layout: Left (Chart Viewport), Center (Market Structure), Right (FEF Blueprint) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT: Original Chart Viewport & AI Annotations (5 Cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="text-cyan-400">📊</span>
                  <span className="font-bold text-white uppercase tracking-wider">
                    CHART VIEWPORT
                  </span>
                </div>

                {/* Viewport controls */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowAnnotations(!showAnnotations)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                      showAnnotations
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                        : 'bg-white/5 text-gray-400 border-white/10'
                    }`}
                  >
                    {showAnnotations ? 'Annotations ON' : 'Annotations OFF'}
                  </button>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(z + 0.2, 2))}
                    className="bg-white/5 hover:bg-white/10 text-gray-300 px-1.5 py-0.5 rounded text-xs"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(z - 0.2, 0.8))}
                    className="bg-white/5 hover:bg-white/10 text-gray-300 px-1.5 py-0.5 rounded text-xs"
                  >
                    -
                  </button>
                  <button
                    onClick={() => setZoomLevel(1)}
                    className="bg-white/5 hover:bg-white/10 text-gray-300 px-1.5 py-0.5 rounded text-[10px]"
                  >
                    1x
                  </button>
                </div>
              </div>

              {/* Viewport Canvas with Zoom */}
              <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black/60 min-h-[320px] flex items-center justify-center">
                {imagePreview ? (
                  <div
                    className="relative transition-transform duration-200 w-full flex items-center justify-center"
                    style={{ transform: `scale(${zoomLevel})` }}
                  >
                    <img
                      src={imagePreview}
                      alt="Uploaded Chart Viewport"
                      className="max-h-[360px] w-full object-contain"
                    />

                    {/* SVG Annotations Overlay */}
                    {showAnnotations && analysisResult && (
                      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-3 text-[10px]">
                        <div className="flex justify-between items-start">
                          <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 px-2 py-0.5 rounded font-bold shadow-md">
                            CHOCH DISPLACEMENT ({analysisResult.timeframe})
                          </span>
                          <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded font-bold shadow-md">
                            LIQUIDITY SWEPT
                          </span>
                        </div>
                        <div className="flex justify-between items-end">
                          <span className="bg-purple-950/80 text-purple-300 border border-purple-500/50 px-2 py-0.5 rounded font-bold shadow-md">
                            H1 DEMAND BLOCK
                          </span>
                          <span className="bg-black/80 text-gray-300 border border-white/20 px-2 py-0.5 rounded font-bold shadow-md">
                            VISUAL CONFIDENCE: {analysisResult.setup.confidence}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center p-6 text-gray-500 text-xs">
                    No chart loaded. Click upload or choose a demo above.
                  </div>
                )}

                {analyzing && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center space-y-2 z-20">
                    <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-cyan-300 font-bold text-xs animate-pulse text-center max-w-xs">
                      {progressStep || 'Extracting Smart Money Concepts...'}
                    </span>
                  </div>
                )}
              </div>

              {/* Image Metadata Bar */}
              <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1">
                <span className="truncate max-w-[200px] text-gray-300">
                  {imageName || 'Active Chart Screenshot'}
                </span>
                <span>Quality: High &bull; Scale: Intact</span>
              </div>
            </div>

            {/* Smart Money Concepts Breakdown */}
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3 text-xs">
              <h3 className="font-black text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5 border-b border-white/5 pb-2">
                <span>📐</span>
                <span>SMART MONEY DETECTED NODES</span>
              </h3>
              <div className="space-y-2">
                {analysisResult?.smartMoney.fvgs.map((fvg, idx) => (
                  <div key={idx} className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex items-start space-x-2">
                    <span className="text-cyan-400 font-bold">[FVG]</span>
                    <span className="text-gray-300 text-[11px]">{fvg}</span>
                  </div>
                ))}
                {analysisResult?.smartMoney.orderBlocks.map((ob, idx) => (
                  <div key={idx} className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex items-start space-x-2">
                    <span className="text-purple-400 font-bold">[OB]</span>
                    <span className="text-gray-300 text-[11px]">{ob}</span>
                  </div>
                ))}
                {analysisResult?.smartMoney.sweeps.map((sw, idx) => (
                  <div key={idx} className="bg-black/40 border border-white/5 rounded-xl p-2.5 flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold">[SWEEP]</span>
                    <span className="text-gray-300 text-[11px]">{sw}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER: Market Structure & Agent Reactions (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Market Structure Card */}
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3 text-xs">
              <h3 className="font-black text-white uppercase tracking-wider border-b border-white/5 pb-2 flex items-center space-x-1.5">
                <span>🏛️</span>
                <span>MARKET STRUCTURE EVALUATION</span>
              </h3>

              <div className="space-y-2 text-[11px]">
                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 flex justify-between">
                  <span className="text-gray-400">TREND ALIGNMENT:</span>
                  <span className="font-bold text-cyan-300">{analysisResult?.marketStructure.trend || 'Evaluating...'}</span>
                </div>
                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 flex justify-between">
                  <span className="text-gray-400">SWING STRUCTURE:</span>
                  <span className="font-bold text-emerald-400">{analysisResult?.marketStructure.swingStructure || 'Evaluating...'}</span>
                </div>
                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 space-y-1">
                  <span className="text-gray-400 block">BREAK OF STRUCTURE (BOS):</span>
                  <span className="text-gray-200 block">{analysisResult?.marketStructure.bos || 'Evaluating...'}</span>
                </div>
                <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 space-y-1">
                  <span className="text-gray-400 block">CHANGE OF CHARACTER (CHOCH):</span>
                  <span className="text-cyan-300 block">{analysisResult?.marketStructure.choch || 'Evaluating...'}</span>
                </div>
              </div>
            </div>

            {/* Agent Reaction Matrix */}
            <div className="bg-[#080d19]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3 text-xs">
              <h3 className="font-black text-white uppercase tracking-wider border-b border-white/5 pb-2 flex items-center space-x-1.5">
                <span>🤖</span>
                <span>15-AGENT CROSS-CHECK MATRIX</span>
              </h3>
              <p className="text-[10px] text-gray-400">
                Peer validation: Swarm responses to visual chart detection findings.
              </p>
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {analysisResult?.agentFeedback.map((fb, idx) => (
                  <div key={idx} className="bg-black/40 border border-white/5 rounded-xl p-2 text-[10px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{fb.agentName}</span>
                      <span className={`px-1.5 py-0.2 rounded font-bold ${
                        fb.confirmed
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {fb.confirmed ? 'CONFIRMED ✓' : 'BYPASSED'}
                      </span>
                    </div>
                    <p className="text-gray-300">{fb.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: FEF Trade Assessment & Blueprint (3 Cols) */}
          <div className="lg:col-span-3 space-y-4">
            <div className={`bg-[#080d19]/85 backdrop-blur-xl border ${analysisResult && !validation.isValid ? 'border-rose-500/50 shadow-[0_8px_32px_0_rgba(244,63,94,0.2)]' : 'border-cyan-500/40 shadow-[0_8px_32px_0_rgba(6,182,212,0.2)]'} rounded-2xl p-5 space-y-4`}>
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${validation.pulseDotClasses}`} />
                  <h3 className="text-xs font-black text-cyan-300 uppercase tracking-wider">
                    TRADE BLUEPRINT
                  </h3>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${validation.badgeClasses}`}>
                  {!analysisResult
                    ? 'ANALYZING...'
                    : !validation.isValid
                    ? 'BLUEPRINT INCONSISTENT'
                    : analysisResult.setup.state}
                </span>
              </div>

              {/* Warning Banner when Inconsistent */}
              {analysisResult && !validation.isValid && (
                <div className="bg-rose-950/40 border border-rose-500/50 rounded-xl p-2.5 text-xs text-rose-200 space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold text-rose-400">
                    <span>⚠️</span>
                    <span>BLUEPRINT INCONSISTENT</span>
                  </div>
                  <p className="text-[11px] text-rose-300/90 leading-tight">
                    Direction and Entry / SL / TP geometry do not agree.
                  </p>
                </div>
              )}

              {analysisResult && (
                <div className="space-y-2 text-xs">
                  <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 flex justify-between items-center">
                    <span className="text-gray-400">ENTRY ZONE:</span>
                    <span className="font-bold text-cyan-300 font-mono">
                      ${analysisResult.setup.entryLow.toFixed(2)} - ${analysisResult.setup.entryHigh.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 flex justify-between items-center">
                    <span className="text-rose-400 font-bold">STOP LOSS (SL):</span>
                    <span className="font-bold text-rose-400 font-mono">
                      ${analysisResult.setup.stopLoss.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-black/50 p-2.5 rounded-xl border border-white/5 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className={`font-bold ${validation.tpColorClasses.tp1}`}>TP 1:</span>
                      <span className={`font-bold font-mono ${validation.tpColorClasses.tp1}`}>${analysisResult.setup.tp1.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className={validation.tpColorClasses.tp2}>TP 2:</span>
                      <span className={`font-bold font-mono ${validation.tpColorClasses.tp2}`}>${analysisResult.setup.tp2.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className={validation.tpColorClasses.tp3}>TP 3:</span>
                      <span className={`font-bold font-mono ${validation.tpColorClasses.tp3}`}>${analysisResult.setup.tp3.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-gray-400">RISK / REWARD:</span>
                    <span className={`font-bold font-mono ${!validation.isValid ? 'text-rose-400' : 'text-purple-300'}`}>
                      {validation.rrRatio}
                    </span>
                  </div>

                  <div className="bg-rose-950/20 border border-rose-500/30 p-2.5 rounded-xl text-[10px] text-rose-300">
                    <span className="font-bold block text-rose-400 mb-0.5">⚠️ INVALIDATION:</span>
                    {analysisResult.setup.invalidation}
                  </div>
                </div>
              )}

              {/* Action buttons: Calculate Position Size & Transfer to execution */}
              <div className="space-y-2">
                <button
                  onClick={handleCalculatePositionSize}
                  disabled={!canCalculatePosition}
                  className={`w-full border text-white font-black py-2.5 rounded-xl text-xs tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
                    canCalculatePosition
                      ? 'bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-500 hover:from-cyan-500 hover:to-blue-500 border-cyan-400/50 shadow-[0_0_15px_rgba(0,240,255,0.3)] cursor-pointer'
                      : 'bg-gray-800/60 border-gray-700/50 text-gray-400 cursor-not-allowed opacity-50'
                  }`}
                  title={!canCalculatePosition ? (validation.reason || 'Blueprint inconsistent') : undefined}
                >
                  <span>🧮</span>
                  <span>CALCULATE POSITION SIZE &rarr;</span>
                </button>

                <button
                  onClick={handleTransferToExecution}
                  disabled={!canSendToExecution}
                  className={`w-full border text-white font-bold py-2.5 rounded-xl text-xs tracking-wider transition-all flex items-center justify-center space-x-1.5 ${
                    canSendToExecution
                      ? 'bg-gradient-to-r from-emerald-500/30 via-cyan-500/30 to-purple-500/30 hover:from-emerald-500/40 hover:via-cyan-500/40 hover:to-purple-500/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)] cursor-pointer'
                      : 'bg-gray-800/60 border-gray-700/50 text-gray-400 cursor-not-allowed opacity-50'
                  }`}
                  title={
                    !canSendToExecution
                      ? !validation.isValid
                        ? 'Disabled: Blueprint geometry is inconsistent'
                        : !isMarketOpen
                        ? 'Disabled: Market is currently closed'
                        : !isTrustApproved
                        ? `Disabled: Evidence Trust (${assetProfile?.evidenceTrust ?? 0}%) below 60%`
                        : 'Setup unavailable'
                      : undefined
                  }
                >
                  <span>⚡</span>
                  <span>SEND TO EXECUTION &rarr;</span>
                </button>

                {/* Subtext explanation when buttons are disabled */}
                {analysisResult && (!canCalculatePosition || !canSendToExecution) && (
                  <p className="text-[10px] text-center text-gray-400">
                    {!validation.isValid
                      ? '⚠️ Execution locked: Blueprint geometry is inconsistent.'
                      : !isMarketOpen
                      ? '🔒 Execution locked: Market session is currently closed.'
                      : !isTrustApproved
                      ? `🔒 Execution locked: Evidence Trust (${assetProfile?.evidenceTrust ?? 0}%) is below 60% requirement.`
                      : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Major Institutional Analysis Panels (Full Width) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Panel 1: WHY THIS TRADE? */}
          <div className="bg-[#080d19]/85 backdrop-blur-xl border border-emerald-500/30 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3">
            <h4 className="font-black text-emerald-400 uppercase tracking-wider flex items-center space-x-1.5 border-b border-white/5 pb-2">
              <span>✓</span>
              <span>WHY THIS TRADE?</span>
            </h4>
            <ul className="space-y-1.5 text-[11px] text-gray-300">
              {analysisResult?.supportingEvidence.map((ev, idx) => (
                <li key={idx} className="flex items-start space-x-2">
                  <span className="text-emerald-400 mt-0.5">&bull;</span>
                  <span>{ev}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Panel 2: RISKS / OPPOSING EVIDENCE */}
          <div className="bg-[#080d19]/85 backdrop-blur-xl border border-rose-500/30 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3">
            <h4 className="font-black text-rose-400 uppercase tracking-wider flex items-center space-x-1.5 border-b border-white/5 pb-2">
              <span>✕</span>
              <span>RISKS / OPPOSING EVIDENCE</span>
            </h4>
            <ul className="space-y-1.5 text-[11px] text-gray-300">
              {analysisResult?.opposingEvidence.map((op, idx) => (
                <li key={idx} className="flex items-start space-x-2">
                  <span className="text-rose-400 mt-0.5">&bull;</span>
                  <span>{op}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Panel 3: CONFIRMATION REQUIRED */}
          <div className="bg-[#080d19]/85 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3">
            <h4 className="font-black text-cyan-300 uppercase tracking-wider flex items-center space-x-1.5 border-b border-white/5 pb-2">
              <span>⏱️</span>
              <span>WHAT MUST HAPPEN NEXT?</span>
            </h4>
            <div className="bg-black/40 border border-white/5 p-3 rounded-xl text-[11px] text-cyan-200 leading-relaxed">
              {analysisResult?.confirmationRequired || 'Awaiting confirmation signals...'}
            </div>
            <span className="text-[10px] text-gray-400 block">
              Execution gate remains locked until this lower-timeframe condition prints.
            </span>
          </div>

          {/* Panel 4: IF THIS IDEA FAILS */}
          <div className="bg-[#080d19]/85 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] space-y-3">
            <h4 className="font-black text-amber-400 uppercase tracking-wider flex items-center space-x-1.5 border-b border-white/5 pb-2">
              <span>🔄</span>
              <span>IF THIS IDEA FAILS</span>
            </h4>
            <div className="bg-black/40 border border-white/5 p-3 rounded-xl text-[11px] text-amber-200 leading-relaxed">
              {analysisResult?.alternativeScenario || 'Evaluating alternative scenario...'}
            </div>
            <span className="text-[10px] text-gray-400 block">
              Opposing contingency playbook automatically triggered on invalidation.
            </span>
          </div>
        </div>

        {/* Recent Analysis History Drawer Modal */}
        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#080d19] border border-cyan-500/40 rounded-3xl w-full max-w-xl p-6 shadow-[0_0_50px_rgba(6,182,212,0.25)] space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-black text-white uppercase tracking-wider">
                  RECENT CHART ANALYSES ({historyList.length})
                </h3>
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 flex items-center justify-center text-xs"
                >
                  ✕
                </button>
              </div>

              {historyList.length === 0 ? (
                <p className="text-gray-500 text-xs py-8 text-center">No previous analyses stored in this session.</p>
              ) : (
                <div className="space-y-2">
                  {historyList.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        loadDemoChart(item.symbol);
                        setShowHistory(false);
                      }}
                      className="bg-black/40 hover:bg-cyan-500/10 border border-white/5 hover:border-cyan-500/40 rounded-xl p-3 flex items-center justify-between cursor-pointer transition-all"
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-xs">{item.symbol}</span>
                          <span className="text-[10px] text-gray-400">[{item.timeframe}]</span>
                          <span className="text-[9px] bg-cyan-950 text-cyan-300 px-1.5 py-0.2 rounded">
                            {item.setupState}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 block mt-0.5">
                          {new Date(item.timestamp).toLocaleTimeString()} &bull; Confidence: {item.confidence}%
                        </span>
                      </div>
                      <span className="text-xs text-cyan-400 font-bold">&rarr;</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Master Footer */}
        <MasterFooter />
      </div>
    </div>
  );
}
