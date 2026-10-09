'use client';

import React from 'react';

interface BackgroundLiveChartProps {
  symbol?: string;
  isPositive?: boolean;
}

/**
 * Global Premium CORTEX Visual Environment (Reference B Technology Background)
 *
 * Implements the strong visual authority from the attached Reference B:
 * - LEFT ZONE:
 *   High-energy luminous red/orange directional data beams and energy channels.
 *   Multiple streak thicknesses, glowing data nodes, light volumes, and warm bloom.
 *   Clearly visible at 25-35% environmental strength behind CURRENT AI DECISION and left workspace.
 *
 * - CENTER ZONE:
 *   Deep dark navy/black (#02050c) central depth field ensuring complete text & telemetry readability
 *   for the Central Multi-Agent Intelligence Hub, CORTEX CORE, and market data.
 *   Subtle converging trace lines bridge left and right into the central intelligence matrix.
 *
 * - RIGHT ZONE:
 *   High-energy electric cyan/blue directional data beams and network vectors.
 *   Multiple streak thicknesses, glowing cyan data nodes, light volumes, and cool technological bloom.
 *   Clearly visible at 25-35% environmental strength behind MARKET OVERVIEW and right workspace.
 *
 * Fully responsive across all viewports with zero repetitive wallpaper seams, zero WebGL/Canvas overhead,
 * and strict prefers-reduced-motion support.
 */
export const BackgroundLiveChart: React.FC<BackgroundLiveChartProps> = () => {
  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden select-none pointer-events-none"
      aria-hidden="true"
    >
      {/* 1. Deep institutional black/navy canvas base */}
      <div className="absolute inset-0 bg-[#02050e]" />

      {/* 2. Direct high-resolution rendering of the authoritative Reference Image 1 (softened by 18%) */}
      <div
        className="absolute inset-0 pointer-events-none bg-cover bg-center bg-no-repeat opacity-36 mix-blend-screen"
        style={{
          backgroundImage: 'url(/images/cortex-bg-reference-new.png)',
        }}
      />

      {/* 3. Layered Ambient Atmospheric Volumetric Glows (balanced and softened) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle 850px at 0% 85%, rgba(239, 68, 68, 0.32) 0%, rgba(249, 115, 22, 0.24) 30%, rgba(180, 83, 9, 0.12) 60%, transparent 80%),
            radial-gradient(circle 950px at 100% 25%, rgba(0, 240, 255, 0.35) 0%, rgba(14, 165, 233, 0.25) 35%, rgba(37, 99, 235, 0.16) 65%, transparent 85%),
            radial-gradient(ellipse 65% 55% at 50% 50%, rgba(2, 5, 14, 0.90) 0%, rgba(2, 5, 14, 0.30) 70%, transparent 100%)
          `,
        }}
      />

      {/* 4. Directional High-Speed Data Beams & Network Vectors (Vector overlay for crisp desktop scaling) */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        preserveAspectRatio="none"
        viewBox="0 0 1920 1080"
      >
        <defs>
          <linearGradient id="warmStreak" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
            <stop offset="40%" stopColor="#f97316" stopOpacity="0.75" />
            <stop offset="80%" stopColor="#fbbf24" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="coolStreak" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0" />
            <stop offset="25%" stopColor="#0ea5e9" stopOpacity="0.30" />
            <stop offset="60%" stopColor="#00f0ff" stopOpacity="0.75" />
            <stop offset="85%" stopColor="#38bdf8" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.9" />
          </linearGradient>

          <filter id="bloomSoft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4.0" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Left Side Warm Accents (Calibrated balance) */}
        <g opacity="0.70">
          <line x1="-30" y1="920" x2="680" y2="560" stroke="url(#warmStreak)" strokeWidth="4.0" filter="url(#bloomSoft)" />
          <line x1="0" y1="840" x2="580" y2="550" stroke="url(#warmStreak)" strokeWidth="2.5" />
          <line x1="-50" y1="980" x2="740" y2="600" stroke="url(#warmStreak)" strokeWidth="4.5" filter="url(#bloomSoft)" />
          <circle cx="680" cy="560" r="6.0" fill="#fff" stroke="#f97316" strokeWidth="2.2" filter="url(#bloomSoft)" />
          <circle cx="580" cy="550" r="4.5" fill="#fed7aa" stroke="#ef4444" strokeWidth="1.8" />
          <circle cx="740" cy="600" r="6.5" fill="#fff" stroke="#ef4444" strokeWidth="2.2" filter="url(#bloomSoft)" />
        </g>

        {/* Right Side Cool Accents (Calibrated balance) */}
        <g opacity="0.75">
          <line x1="1120" y1="580" x2="1960" y2="160" stroke="url(#coolStreak)" strokeWidth="4.8" filter="url(#bloomSoft)" />
          <line x1="1240" y1="590" x2="1980" y2="220" stroke="url(#coolStreak)" strokeWidth="3.5" />
          <line x1="1040" y1="560" x2="1920" y2="120" stroke="url(#coolStreak)" strokeWidth="3.8" filter="url(#bloomSoft)" />
          <line x1="1180" y1="740" x2="1980" y2="340" stroke="url(#coolStreak)" strokeWidth="3.2" filter="url(#bloomSoft)" />
          <circle cx="1120" cy="580" r="6.5" fill="#fff" stroke="#00f0ff" strokeWidth="2.4" filter="url(#bloomSoft)" />
          <circle cx="1240" cy="590" r="5.2" fill="#bae6fd" stroke="#0ea5e9" strokeWidth="2.0" />
          <circle cx="1040" cy="560" r="6.0" fill="#fff" stroke="#00f0ff" strokeWidth="2.2" filter="url(#bloomSoft)" />
        </g>
      </svg>

      {/* 5. Center Vignette Mask: Guarantees deep dark central backing so text, Hub and Core remain crisp */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 62% 56% at 50% 50%, rgba(2, 5, 14, 0.90) 0%, rgba(2, 5, 14, 0.25) 75%, transparent 100%)',
        }}
      />
    </div>
  );
};

