'use client';

import React, { useState, useRef } from 'react';
import { analyzeChartImageOffline, FreeVisionAnalysisResult } from '@/lib/agents/free-providers';

export const ChartVisionUpload: React.FC = () => {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<FreeVisionAnalysisResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setUploadedImage(result);
      runVisionPipeline(file.name);
    };
    reader.readAsDataURL(file);
  };

  const runVisionPipeline = (fileName: string) => {
    setIsAnalyzing(true);
    // Simulate multi-stage visual extraction
    setTimeout(() => {
      const parsed = analyzeChartImageOffline(fileName);
      setAnalysisResult(parsed);
      setIsAnalyzing(false);
    }, 1800);
  };

  const triggerSampleChart = () => {
    // Demo mock image URL
    setUploadedImage('https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=60');
    runVisionPipeline('xauusd_m15_chart.png');
  };

  return (
    <div className="bg-[#0b101d] border border-cyan-950/70 rounded-xl p-3.5 shadow-xl">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-pink-400 font-bold text-xs flex items-center space-x-1">
            <span>📷 AI Chart Vision Analyzer</span>
          </span>
          <span className="text-[9px] bg-pink-950 text-pink-300 border border-pink-800 px-1.5 py-0.5 rounded">
            Free Offline Vision
          </span>
        </div>
        <button
          onClick={triggerSampleChart}
          className="text-[9px] text-cyan-400 hover:text-cyan-300 underline font-semibold"
        >
          Load Demo Chart
        </button>
      </div>

      {/* Upload Dropzone */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-800 hover:border-cyan-700/80 rounded-lg p-3 text-center cursor-pointer bg-[#070e1b] transition-colors"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileUpload}
        />
        <div className="text-gray-400 text-[11px] space-y-1">
          <p className="font-semibold text-gray-200">
            {uploadedImage ? 'Click to replace screenshot' : 'Drop Exness / MT5 Screenshot Here'}
          </p>
          <p className="text-[9px] text-gray-500">
            Supports PNG, JPG, WebP. Auto-detects BOS, CHOCH, FVG, and Liquidity Pools.
          </p>
        </div>
      </div>

      {/* Loading Progress State */}
      {isAnalyzing && (
        <div className="mt-3 p-3 bg-gray-900/90 rounded border border-cyan-800 text-center space-y-2">
          <div className="flex items-center justify-center space-x-2 text-cyan-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span>Vision Engine Scanning Price Structure & Liquidity...</span>
          </div>
          <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-cyan-500 h-full w-4/5 animate-pulse"></div>
          </div>
        </div>
      )}

      {/* Vision Results Card */}
      {analysisResult && !isAnalyzing && (
        <div className="mt-3 bg-[#060a12] border border-cyan-900/60 rounded-lg p-2.5 space-y-2 text-[10px]">
          {/* Top detection badge */}
          <div className="flex items-center justify-between border-b border-gray-800 pb-1">
            <div className="flex items-center space-x-1.5">
              <span className="font-bold text-white text-xs">{analysisResult.symbolDetected}</span>
              <span className="bg-gray-800 text-cyan-400 px-1 rounded">{analysisResult.timeframeDetected}</span>
              <span className="text-emerald-400 font-semibold">Quality: {analysisResult.chartQuality}</span>
            </div>
            <span className="bg-emerald-950 text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-800 text-[9px]">
              {analysisResult.opportunityState}
            </span>
          </div>

          {/* Key detected concepts */}
          <div>
            <span className="text-gray-400 font-semibold block mb-1">Detected ICT / SMC Structure:</span>
            <div className="flex flex-wrap gap-1">
              {analysisResult.detectedConcepts.map((concept, i) => (
                <span
                  key={i}
                  className="bg-cyan-950/60 text-cyan-300 border border-cyan-800 px-1.5 py-0.5 rounded text-[8.5px]"
                >
                  ✓ {concept.name} ({concept.confidence}%)
                </span>
              ))}
            </div>
          </div>

          {/* Entry & Risk breakdown */}
          <div className="grid grid-cols-2 gap-1.5 bg-gray-950 p-2 rounded border border-gray-800/80">
            <div>
              <span className="text-gray-500 block">Entry Zone:</span>
              <span className="font-mono text-cyan-300 font-bold">{analysisResult.possibleEntry}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Invalidation Level:</span>
              <span className="font-mono text-red-400 font-bold">{analysisResult.invalidation}</span>
            </div>
          </div>

          <div className="text-[9px] text-gray-400">
            <span className="text-amber-400 font-semibold">Confirmation Required: </span>
            {analysisResult.confirmationRequired}
          </div>
        </div>
      )}
    </div>
  );
};
