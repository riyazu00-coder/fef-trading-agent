'use client';

import React from 'react';
import { AssetIntelligenceProfile } from '@/lib/agents/multi-asset-pipeline';

interface CompactCortexCoreProps {
  profile: AssetIntelligenceProfile;
  activeSymbol: string;
  isIngesting?: boolean;
  contributingCount?: number;
  dataLimitedCount?: number;
  offlineCount?: number;
  errorCount?: number;
  unavailableCount?: number;
  totalVisibleCount?: number;
}

/**
 * FEF CORTEX CORE — Cinematic 3D Pulsar Intelligence Nucleus
 * Directly inspired by the attached Cinematic Core Reference images:
 * - Dimensional spherical inner chamber with deep radial perspective
 * - Glowing 3D intelligence nucleus with breathing pulsar aura
 * - Environmental red/orange energy illumination from the left
 * - Environmental blue/cyan energy illumination from the right
 * - Luminous cyan/white energy rings with precision radial telemetry spokes
 * - Translucent smoked glass lens shell with upper specular highlight arc
 * - Strictly maintains the 128x128 footprint, centered location, and 360° connector ring (r=58px)
 */
export const CompactCortexCore: React.FC<CompactCortexCoreProps> = ({
  profile,
  activeSymbol,
  isIngesting = false,
}) => {
  const currentState = isIngesting
    ? 'INGESTING EVIDENCE'
    : profile.confidence === 0
    ? 'STANDBY'
    : 'SYNCHRONIZED';

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center justify-center text-center pointer-events-none select-none">
      {/* Central Concentric Multi-Ring Nucleus (Strictly preserved W=128px H=128px footprint) */}
      <div className="relative flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32">
        {/* =========================================================================
            LAYER A: OUTER ATMOSPHERIC PULSAR HALO (Environmental Energy Bloom)
            Left: Red/Orange Glow | Right: Electric Blue/Cyan Glow
           ========================================================================= */}
        <div
          className={`absolute inset-[-18px] rounded-full pointer-events-none transition-all duration-700 blur-2xl ${
            isIngesting ? 'opacity-95 scale-105' : 'opacity-75 scale-100'
          }`}
          style={{
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.35) 0%, rgba(37, 99, 235, 0.22) 40%, rgba(244, 63, 94, 0.20) 75%, transparent 100%)',
          }}
        />

        {/* Directional Environmental Refraction (Warm Left, Cool Right) */}
        <div
          className="absolute inset-[-10px] rounded-full pointer-events-none opacity-60 blur-lg"
          style={{
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.35) 0%, rgba(14, 165, 233, 0.10) 50%, rgba(6, 182, 212, 0.40) 100%)',
          }}
        />

        {/* =========================================================================
            LAYER B: DEDICATED OPTICAL 360° CONNECTION RIM (r=58px, exact connector rim)
           ========================================================================= */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 128 128"
        >
          <defs>
            <linearGradient id="coreRimGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
              <stop offset="30%" stopColor="#38bdf8" stopOpacity="0.9" />
              <stop offset="70%" stopColor="#00f0ff" stopOpacity="1.0" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.85" />
            </linearGradient>

            <linearGradient id="pulsarSpokeWarm" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#fb923c" stopOpacity="0.1" />
            </linearGradient>

            <linearGradient id="pulsarSpokeCool" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" stopOpacity="1.0" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Circular Connection Rim (r=58 matching 20 connector target termination points) */}
          <circle
            cx="64"
            cy="64"
            r="58"
            stroke="url(#coreRimGrad)"
            strokeWidth="1.1"
            strokeDasharray="2 4"
            fill="none"
            opacity="0.75"
          />

          {/* Secondary Concentric Reticle (r=55.5) */}
          <circle
            cx="64"
            cy="64"
            r="55.5"
            stroke="#00f0ff"
            strokeWidth="0.5"
            strokeDasharray="1.5 3"
            fill="none"
            opacity="0.45"
          />
        </svg>

        {/* =========================================================================
            LAYER C: DUAL COUNTER-ROTATING DIMENSIONAL ENERGY RINGS
           ========================================================================= */}
        {/* Outer Ring: Rotating Ticked Telemetry Ring (36s reverse) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none animate-spin"
          style={{ animationDuration: '36s', animationDirection: 'reverse' }}
          viewBox="0 0 128 128"
        >
          <circle
            cx="64"
            cy="64"
            r="53"
            stroke="#00f0ff"
            strokeWidth="0.85"
            strokeDasharray="3 5"
            fill="none"
            opacity="0.65"
          />
          {/* 12 Precise Radial Telemetry Ticks */}
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
            <line
              key={deg}
              x1="64"
              y1="8"
              x2="64"
              y2="12.5"
              stroke={deg >= 150 && deg <= 240 ? '#f43f5e' : '#00f0ff'}
              strokeWidth="1.2"
              opacity={deg % 90 === 0 ? 0.95 : 0.65}
              transform={`rotate(${deg} 64 64)`}
            />
          ))}
        </svg>

        {/* Middle Ring: Harmonic Orbit with Violet / Cyan Energy (22s forward) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none animate-spin"
          style={{ animationDuration: isIngesting ? '6s' : '22s' }}
          viewBox="0 0 128 128"
        >
          <circle
            cx="64"
            cy="64"
            r="47.5"
            stroke={isIngesting ? '#38bdf8' : '#c084fc'}
            strokeWidth={isIngesting ? 1.6 : 1.1}
            strokeDasharray="8 12 3 8"
            fill="none"
            opacity={isIngesting ? 0.95 : 0.70}
          />
          {/* Genuine evidence absorption ripples when triggered */}
          {isIngesting && (
            <circle cx="64" cy="64" r="52" stroke="#00f0ff" strokeWidth="1.5" fill="none" opacity="0.85">
              <animate attributeName="r" from="54" to="24" dur="0.7s" repeatCount="1" />
              <animate attributeName="opacity" from="0.9" to="0" dur="0.7s" repeatCount="1" />
            </circle>
          )}
        </svg>

        {/* =========================================================================
            LAYER D: PULSAR STARBURST RADIAL ENERGY SPOKES (Restrained Breathing)
           ========================================================================= */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-55"
          viewBox="0 0 128 128"
        >
          {/* 8 Radial Pulsar Energy Spokes inspired by References C & D */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={`spoke-${deg}`}
              x1="64"
              y1="64"
              x2="64"
              y2={deg >= 135 && deg <= 225 ? '16' : '14'}
              stroke={deg >= 135 && deg <= 225 ? 'url(#pulsarSpokeWarm)' : 'url(#pulsarSpokeCool)'}
              strokeWidth="0.9"
              strokeLinecap="round"
              opacity={deg % 90 === 0 ? 0.85 : 0.50}
              transform={`rotate(${deg} 64 64)`}
            />
          ))}
        </svg>

        {/* =========================================================================
            LAYERS E, F, G, H: 3D SMOKED GLASS SHELL, INNER CHAMBER & IDENTITY PLANE
           ========================================================================= */}
        <div
          className={`relative w-22 h-22 sm:w-24 sm:h-24 rounded-full transition-all duration-500 flex flex-col items-center justify-center overflow-hidden ${
            isIngesting
              ? 'border-2 border-cyan-300 shadow-[0_0_40px_rgba(0,240,255,0.85),inset_0_0_24px_rgba(168,85,247,0.55)]'
              : 'border-2 border-cyan-400/80 shadow-[0_0_32px_rgba(0,240,255,0.65),0_0_16px_rgba(168,85,247,0.40),inset_0_0_20px_rgba(0,240,255,0.45),inset_0_1px_3px_rgba(255,255,255,0.4)]'
          }`}
          style={{
            background: 'radial-gradient(circle at 45% 32%, rgba(16, 42, 84, 0.94) 0%, rgba(8, 20, 46, 0.96) 45%, rgba(4, 10, 24, 0.98) 75%, rgba(1, 4, 14, 0.99) 100%)',
          }}
        >
          {/* Upper Specular Optical Glass Curve Highlight */}
          <div className="absolute top-1 left-2.5 right-2.5 h-4.5 rounded-full bg-gradient-to-b from-white/40 via-white/12 to-transparent pointer-events-none" />

          {/* Left Warm Environmental Refraction Arc */}
          <div className="absolute left-0 top-2 bottom-2 w-3 rounded-l-full bg-gradient-to-r from-rose-500/40 to-transparent pointer-events-none" />

          {/* Right Cool Environmental Refraction Arc */}
          <div className="absolute right-0 top-2 bottom-2 w-3 rounded-r-full bg-gradient-to-l from-cyan-400/50 to-transparent pointer-events-none" />

          {/* Neural Multi-Frequency Optical Lattice */}
          <div
            className="absolute inset-0 rounded-full opacity-[0.14] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(rgba(0,240,255,0.9) 1px, transparent 1px)',
              backgroundSize: '5px 5px',
            }}
          />

          {/* Layer G: Central Intelligence Nucleus Breathing Core */}
          <div className="relative flex flex-col items-center justify-center z-10">
            {/* Luminous Pulsar Star Dot */}
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_#00f0ff,0_0_20px_#38bdf8,0_0_30px_#c084fc] mb-0.5 animate-pulse" />

            {/* Brand Title: FEF */}
            <span className="text-sm sm:text-base font-black text-white tracking-widest drop-shadow-[0_0_12px_rgba(0,240,255,0.95)] font-sans leading-none">
              FEF
            </span>

            {/* Sub-label: CORTEX CORE */}
            <span className="text-[6.5px] sm:text-[7px] font-mono text-cyan-300 font-black tracking-widest uppercase mt-0.5 leading-none">
              CORTEX CORE
            </span>

            {/* Layer H: Truthful Runtime State Pill */}
            <div
              className={`text-[5.5px] sm:text-[6px] font-mono font-bold tracking-tight uppercase px-1.5 py-0.2 rounded border mt-1 transition-all ${
                isIngesting
                  ? 'text-cyan-100 bg-cyan-900/90 border-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.7)]'
                  : 'text-cyan-200 bg-cyan-950/80 border-cyan-400/50 shadow-sm'
              }`}
            >
              {currentState}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
