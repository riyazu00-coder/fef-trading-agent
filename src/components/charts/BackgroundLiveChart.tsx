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
      className="absolute top-0 left-0 right-0 h-[1080px] z-0 overflow-hidden select-none pointer-events-none bg-[#02050e]"
      aria-hidden="true"
    >
      {/* 1. Deep institutional black/navy canvas base */}
      <div className="absolute inset-0 bg-[#02050e]" />

      {/* 2. Direct high-resolution rendering of Authoritative Approved Reference Asset (Normal blend mode, rich visual presence) */}
      <div
        className="absolute inset-0 pointer-events-none bg-cover bg-center bg-no-repeat opacity-85"
        style={{
          backgroundImage: 'url(/images/cortex-bg-reference-new.png)',
        }}
      />

      {/* 3. Subtle Atmospheric Vignette: Preserves razor-sharp text and telemetry contrast in the central hub while keeping left/right beams vibrant */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 65% 58% at 50% 50%, rgba(2, 5, 14, 0.55) 0%, transparent 100%)',
        }}
      />

      {/* 4. Seamless bottom fade into deep institutional foundation (#030711) */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-[#030711] pointer-events-none" />
    </div>
  );
};

