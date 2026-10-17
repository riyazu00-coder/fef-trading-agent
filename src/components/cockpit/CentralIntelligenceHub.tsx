'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useActiveAsset } from '@/context/ActiveAssetContext';
import { AgentState, AgentNodeStatus, BiasType } from '@/lib/agents/agent-types';
import { UnifiedAgentResponse, AgentReadinessState } from '@/lib/agents/contracts/unified-agent-contract';
import {
  evaluateTradingRisk,
  getTruthfulLiveMessages,
  classifyVisibleNodes,
  TradingRiskAssessment,
  HubLiveMessage
} from '@/lib/agents/hub-animation-engine';
import { CortexScannerNode } from '@/components/central-hub/CortexScannerNode';
import { HubRadialNetworkSvg, OrbitalNodeLayout } from '@/components/central-hub/HubRadialNetworkSvg';
import { CompactCortexCore } from '@/components/central-hub/CompactCortexCore';
import { HubRiskWarningStrip } from '@/components/central-hub/HubRiskWarningStrip';
import { HubMiniFeed } from '@/components/central-hub/HubMiniFeed';
import { HubDetailDrawer } from '@/components/central-hub/HubDetailDrawer';

const mapSpecialistToState = (
  s: UnifiedAgentResponse | undefined,
  fallbackId: string,
  fallbackName: string,
  role: string
): AgentState => {
  if (!s) {
    return {
      type: fallbackId,
      name: fallbackName,
      role,
      bias: 'NEUTRAL',
      confidence: 0,
      status: 'DATA LIMITED',
      lastOpinion: 'Awaiting specialist domain telemetry',
      evidence: [],
      keyRisk: 'Domain telemetry limited',
      invalidation: 'Statistical model shift',
      evidenceTrustScore: 0,
      provenanceBadge: 'DATA LIMITED',
    };
  }

  const mapReadinessToStatus = (readiness: AgentReadinessState): AgentNodeStatus => {
    switch (readiness) {
      case 'READY':
        return 'ONLINE';
      case 'PARTIAL':
        return 'PROCESSING';
      case 'DATA_LIMITED':
      case 'UNAVAILABLE':
      default:
        return 'DATA LIMITED';
    }
  };

  return {
    type: s.agentId,
    name: s.agentName || fallbackName,
    role: s.role || role,
    bias: (s.direction as BiasType) || 'NEUTRAL',
    confidence: s.confidence,
    status: mapReadinessToStatus(s.readiness),
    lastOpinion: s.primaryThesis || 'Evaluating quantitative domain telemetry',
    evidence: s.evidence?.map((e) => e.claim) || [],
    keyRisk: s.keyRisk || s.missingEvidence?.[0] || 'Statistical domain shift',
    invalidation: s.invalidation || 'Model invalidation boundary crossed',
    evidenceTrustScore: s.evidenceTrust ?? s.confidence,
    provenanceBadge: (s.provenanceBadge as any) || 'INDEPENDENT',
  };
};

// 20 Orbital Node Coordinates in 730 x 280 viewport (Optimized for identical 152x28 cinematic 3D glass cards)
const ORBITAL_COORDS = [
  // Top arc (left-to-right, 4 nodes)
  { x: 110, y: 18 },  // 0: Market Regime [SPEC]
  { x: 275, y: 18 },  // 1: Currencies [SPEC]
  { x: 455, y: 18 },  // 2: Technical
  { x: 620, y: 18 },  // 3: Macro

  // Right column (top-to-bottom, 6 nodes)
  { x: 642, y: 52 },  // 4: Rates Regime [SPEC]
  { x: 642, y: 86 },  // 5: Volatility [SPEC]
  { x: 642, y: 120 }, // 6: Risk Guardian
  { x: 642, y: 154 }, // 7: Vision / Chart
  { x: 642, y: 188 }, // 8: Opportunity
  { x: 642, y: 222 }, // 9: Strategy

  // Bottom arc (right-to-left, 4 nodes)
  { x: 620, y: 262 }, // 10: Scalper / Flow
  { x: 455, y: 262 }, // 11: Session / Killzone
  { x: 275, y: 262 }, // 12: Liquidity
  { x: 110, y: 262 }, // 13: Central Bank [SPEC]

  // Left column (bottom-to-top, 6 nodes)
  { x: 88,  y: 222 }, // 14: Correlation
  { x: 88,  y: 188 }, // 15: News
  { x: 88,  y: 154 }, // 16: Geopolitical
  { x: 88,  y: 120 }, // 17: Sentiment
  { x: 88,  y: 86 },  // 18: Institutional
  { x: 88,  y: 52 },  // 19: COT Profiler [SPEC]
];

export const CentralIntelligenceHub: React.FC = () => {
  const { activeSymbol, activeAsset, assetProfile } = useActiveAsset();

  const [hoveredAgentKey, setHoveredAgentKey] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [showRiskModal, setShowRiskModal] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [isTabHidden, setIsTabHidden] = useState<boolean>(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  // Event-driven evidence pulse & core ingestion states
  const [activeBurstAgents, setActiveBurstAgents] = useState<Set<string>>(new Set());
  const [isCoreIngesting, setIsCoreIngesting] = useState<boolean>(false);

  // Monitor visibility & reduced motion
  useEffect(() => {
    setMounted(true);
    const handleVisibility = () => {
      setIsTabHidden(document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);

    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mq.matches);
      const handleMotionChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mq.addEventListener('change', handleMotionChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        mq.removeEventListener('change', handleMotionChange);
      };
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Staggered asynchronous elapsed tick timer
  useEffect(() => {
    if (isTabHidden || prefersReducedMotion) return;
    const interval = setInterval(() => {
      setElapsedSec((prev) => +(prev + 0.2).toFixed(1));
    }, 200);
    return () => clearInterval(interval);
  }, [isTabHidden, prefersReducedMotion]);

  // Extract the 6 institutional specialists from profile
  const specialistsMap = useMemo(() => {
    const map = new Map<string, UnifiedAgentResponse>();
    if (assetProfile.specialistAgents) {
      for (const spec of assetProfile.specialistAgents) {
        map.set(spec.agentId, spec);
      }
    }
    return map;
  }, [assetProfile.specialistAgents]);

  const specMarketRegime = specialistsMap.get('MARKET_REGIME_CLASSIFIER_AGENT');
  const specCurrencyStrength = specialistsMap.get('CURRENCY_STRENGTH_AGENT');
  const specCot = specialistsMap.get('COT_POSITIONING_AGENT');
  const specRates = specialistsMap.get('RATES_AGENT');
  const specVolatility = specialistsMap.get('VOLATILITY_AGENT');
  const specCentralBank = specialistsMap.get('CENTRAL_BANK_POLICY_AGENT');

  const marketRegimeState = useMemo(
    () => mapSpecialistToState(specMarketRegime, 'MARKET_REGIME_CLASSIFIER_AGENT', 'Market Regime', 'Quantitative Volatility & Regime Classification'),
    [specMarketRegime]
  );
  const currencyStrengthState = useMemo(
    () => mapSpecialistToState(specCurrencyStrength, 'CURRENCY_STRENGTH_AGENT', 'Currency Strength', 'Multi-Asset Currency Relative Strength Matrix'),
    [specCurrencyStrength]
  );
  const cotState = useMemo(
    () => mapSpecialistToState(specCot, 'COT_POSITIONING_AGENT', 'COT Positioning', 'CFTC Institutional Commitment of Traders Profiling'),
    [specCot]
  );
  const ratesState = useMemo(
    () => mapSpecialistToState(specRates, 'RATES_AGENT', 'Rates Regime', 'Sovereign Yield Curve & Interest Rate Differentials'),
    [specRates]
  );
  const volatilityState = useMemo(
    () => mapSpecialistToState(specVolatility, 'VOLATILITY_AGENT', 'Volatility Regime', 'Implied & Realized Volatility Regime Analysis'),
    [specVolatility]
  );
  const centralBankState = useMemo(
    () => mapSpecialistToState(specCentralBank, 'CENTRAL_BANK_POLICY_AGENT', 'Central Bank', 'Monetary Policy Stance & Forward Guidance Synthesis'),
    [specCentralBank]
  );

  // 14 Council agents: 0..6 (Left 7), 7..13 (Right 7), Center Synthesizer: FINAL_DECISION in Core
  const leftCouncilAgents = useMemo(() => assetProfile.agents.slice(0, 7), [assetProfile.agents]);
  const rightCouncilAgents = useMemo(() => assetProfile.agents.slice(7, 14), [assetProfile.agents]);

  // Construct leftNodes (10 total: 2 upper + 7 council + 1 lower)
  const leftNodes = useMemo(() => [
    { agent: marketRegimeState, isSpecialist: true },
    { agent: currencyStrengthState, isSpecialist: true },
    ...leftCouncilAgents.map((ag) => ({ agent: ag, isSpecialist: false })),
    { agent: cotState, isSpecialist: true },
  ], [marketRegimeState, currencyStrengthState, leftCouncilAgents, cotState]);

  // Construct rightNodes (10 total: 2 upper + 7 council + 1 lower)
  const rightNodes = useMemo(() => [
    { agent: ratesState, isSpecialist: true },
    { agent: volatilityState, isSpecialist: true },
    ...rightCouncilAgents.map((ag) => ({ agent: ag, isSpecialist: false })),
    { agent: centralBankState, isSpecialist: true },
  ], [ratesState, volatilityState, rightCouncilAgents, centralBankState]);

  // Exactly 20 Visible Orbital Nodes: 14 Council + 6 Surfaced Specialists seamlessly arranged around ellipse
  const orbitalAgents = useMemo(() => {
    return [
      ...leftNodes.slice(0, 4), // 0..3: Top arc
      ...rightNodes.slice(0, 6), // 4..9: Right arc
      ...rightNodes.slice(6, 10), // 10..13: Bottom arc right half
      ...leftNodes.slice(4, 10), // 14..19: Left arc & bottom left half
    ];
  }, [leftNodes, rightNodes]);

  // Compute Layout, Ports, Targets and Connector Paths for all 20 nodes
  const orbitalNodeLayouts: OrbitalNodeLayout[] = useMemo(() => {
    const cx = 365;
    const cy = 138;
    const coreRadius = 56;
    const halfW = 76; // 152 / 2
    const halfH = 14; // 28 / 2

    return orbitalAgents.map((item, idx) => {
      const coord = ORBITAL_COORDS[idx] || { x: cx, y: cy };
      const dx = cx - coord.x;
      const dy = cy - coord.y;

      let portSide: 'top' | 'bottom' | 'left' | 'right';
      let portX: number;
      let portY: number;

      // Deterministic inward-facing edge assignment by orbital region
      if (idx >= 0 && idx <= 3) {
        // TOP arc: inward-facing edge is BOTTOM
        portSide = 'bottom';
        portY = coord.y + halfH;
        // Bias portX along the bottom edge toward Core center
        const t = Math.max(-0.65, Math.min(0.65, dx / 280));
        portX = Math.round(coord.x + t * (halfW - 14));
      } else if (idx >= 4 && idx <= 9) {
        // RIGHT column: inward-facing edge is LEFT
        portSide = 'left';
        portX = coord.x - halfW;
        // Bias portY along the left edge toward Core center
        const t = Math.max(-0.65, Math.min(0.65, dy / 160));
        portY = Math.round(coord.y + t * (halfH - 4));
      } else if (idx >= 10 && idx <= 13) {
        // BOTTOM arc: inward-facing edge is TOP
        portSide = 'top';
        portY = coord.y - halfH;
        // Bias portX along the top edge toward Core center
        const t = Math.max(-0.65, Math.min(0.65, dx / 280));
        portX = Math.round(coord.x + t * (halfW - 14));
      } else {
        // LEFT column: inward-facing edge is RIGHT
        portSide = 'right';
        portX = coord.x + halfW;
        // Bias portY along the right edge toward Core center
        const t = Math.max(-0.65, Math.min(0.65, dy / 160));
        portY = Math.round(coord.y + t * (halfH - 4));
      }

      // Exact Core Entry Point on the circular connection rim (coreRadius = 58)
      // Vector: Port -> Core Center
      const angle = Math.atan2(portY - cy, portX - cx);
      const targetX = Math.round(cx + coreRadius * Math.cos(angle));
      const targetY = Math.round(cy + coreRadius * Math.sin(angle));

      // Clean quadratic bezier curve from Port to Core rim entry
      const mx = Math.round((portX + targetX) / 2);
      const my = Math.round((portY + targetY) / 2);
      const pathD = `M ${portX} ${portY} Q ${mx} ${my} ${targetX} ${targetY}`;

      return {
        agent: item.agent,
        index: idx,
        x: coord.x,
        y: coord.y,
        portX,
        portY,
        portSide,
        targetX,
        targetY,
        pathD,
        isSpecialist: item.isSpecialist,
      };
    });
  }, [orbitalAgents]);

  // Classify all 21 visible nodes into truthful runtime states without arithmetic fabrication
  const nodeModel = useMemo(() => {
    return classifyVisibleNodes(assetProfile.agents, assetProfile.specialistAgents || []);
  }, [assetProfile.agents, assetProfile.specialistAgents]);

  // Event-driven real evidence burst trigger upon actual runtime evidence changes
  useEffect(() => {
    if (prefersReducedMotion || isTabHidden) return;

    const contributingAgentKeys = orbitalAgents
      .filter((n) => n.agent.status !== 'DATA LIMITED' && n.agent.status !== 'OFFLINE' && n.agent.status !== 'ERROR')
      .map((n) => n.agent.name + n.agent.type);

    if (contributingAgentKeys.length === 0) return;

    // Trigger real evidence burst wave (Agent -> Core)
    setActiveBurstAgents(new Set(contributingAgentKeys));

    // Core absorption ripple when wave reaches Core (~1000ms)
    const ingestTimer = setTimeout(() => {
      setIsCoreIngesting(true);
    }, 1000);

    // End burst wave at ~2200ms; continuous staggered digital pulses continue on contributing channels
    const settleTimer = setTimeout(() => {
      setIsCoreIngesting(false);
      setActiveBurstAgents(new Set());
    }, 2200);

    return () => {
      clearTimeout(ingestTimer);
      clearTimeout(settleTimer);
    };
  }, [activeSymbol, assetProfile.confidence, assetProfile.setupDirection, prefersReducedMotion, isTabHidden, orbitalAgents]);

  // Dynamic Trading Risk Assessment bounded by active asset profile & live telemetry
  const riskAssessment: TradingRiskAssessment = useMemo(() => {
    const spreadVal = typeof activeAsset.spread === 'number' && !isNaN(activeAsset.spread)
      ? activeAsset.spread
      : NaN;
    return evaluateTradingRisk(assetProfile, spreadVal, true);
  }, [assetProfile, activeAsset.spread]);

  // Dynamic Live Dialogue Messages (Truthful, non-hallucinatory)
  const liveMessages: HubLiveMessage[] = useMemo(() => {
    return getTruthfulLiveMessages(assetProfile);
  }, [assetProfile]);

  const handleAgentClick = useCallback((agent: AgentState) => {
    setShowRiskModal(false);
    setSelectedAgent(agent);
  }, []);

  const handleAgentHover = useCallback((key: string | null) => {
    setHoveredAgentKey(key);
  }, []);

  const handleOpenRiskModal = useCallback(() => {
    setSelectedAgent(null);
    setShowRiskModal(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setSelectedAgent(null);
    setShowRiskModal(false);
  }, []);

  return (
    <div className="ghost-glass-panel rounded-2xl p-2.5 sm:p-3 font-mono space-y-2 relative overflow-hidden transition-all h-full flex flex-col justify-between">
      {/* Top Header: Balanced Institutional Composition */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-2 border-b border-white/10 pb-1.5 w-full">
        {/* Left: Hub Title & Directory Link */}
        <div className="flex items-center space-x-2 self-start lg:self-center flex-shrink-0">
          <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center shadow-[0_0_8px_rgba(0,240,255,0.4)] flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center space-x-1.5 flex-wrap">
              <h2 className="text-[11px] sm:text-xs font-bold text-[#F8FAFC] tracking-wider font-sans uppercase">
                CENTRAL MULTI-AGENT INTELLIGENCE HUB
              </h2>
              <span className="text-[7.5px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/40 px-1 py-0.2 rounded flex items-center space-x-1 font-mono">
                <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE: {activeSymbol}</span>
              </span>
              {assetProfile.sessionState && (
                <span suppressHydrationWarning className={`text-[7.5px] font-bold px-1 py-0.2 rounded flex items-center space-x-1 font-mono border ${
                  assetProfile.tradeExecutable
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                }`}>
                  <span className={`w-1 h-1 rounded-full ${assetProfile.tradeExecutable ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span suppressHydrationWarning>
                    {assetProfile.tradeExecutable
                      ? 'SESSION OPEN'
                      : `${assetProfile.sessionState.statusLabel}${mounted && assetProfile.sessionState.nextOpenCountdown ? ` (${assetProfile.sessionState.nextOpenCountdown})` : ''}`}
                  </span>
                </span>
              )}
            </div>
            <p className="text-[8.5px] text-[#94A3B8] font-sans flex items-center space-x-1.5 flex-wrap">
              <span>21-Node Orbital Swarm (14 Council &bull; 6 Specialists &bull; 1 Final Decision Core) &bull;</span>
              <Link
                href="/agents"
                className="text-cyan-400 hover:text-cyan-200 underline font-mono text-[8px] font-bold"
                title="View full 32-Agent Directory"
              >
                32 REGISTERED AGENTS (14 Council + 17 Specialists + 1 Final Decision) &rarr;
              </Link>
            </p>
          </div>
        </div>

        {/* Center: Projected 3D Smoked Optical Glass Telemetry HUD Plate */}
        <div className="flex items-center justify-center flex-1 w-full lg:w-auto my-0.5">
          <div className="flex flex-col items-center space-y-1.5 bg-gradient-to-br from-[#061224]/85 via-[#030914]/90 to-[#01040a]/95 border-t border-t-cyan-400/40 border-l border-l-cyan-500/25 border-r border-r-[#030814] border-b border-b-black rounded-xl px-4 py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_16px_rgba(6,182,212,0.08),inset_0_1px_1px_rgba(255,255,255,0.20),inset_0_0_16px_rgba(6,182,212,0.06)] min-w-[280px]">
            {/* Row 1: Contributing / Visible + Synth Verdict + Authoritative Confidence % */}
            <div className="flex items-center justify-between w-full space-x-3 text-[8px] sm:text-[8.5px] font-mono leading-none">
              <span className="text-gray-300 font-bold tracking-tight">
                <span className="text-emerald-400 font-black">{nodeModel.breakdown.contributingCount}</span>
                <span className="text-gray-300"> CONTRIBUTING</span>
                <span className="text-gray-500"> / </span>
                <span className="text-gray-300 font-bold">21 VIS</span>
              </span>
              <span className="text-[7.5px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/60 border border-cyan-500/30">
                <span className="text-gray-400">SYNTH: </span>
                <span
                  className={`font-mono font-black ${
                    assetProfile.setupDirection.includes('BUY')
                      ? 'text-emerald-400'
                      : assetProfile.setupDirection.includes('SELL')
                      ? 'text-rose-400'
                      : 'text-amber-400'
                  }`}
                >
                  {assetProfile.setupDirection}
                </span>
              </span>
              <span className="text-cyan-300 font-black text-[9.5px] drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]">
                CONF {assetProfile.confidence}%
              </span>
            </div>

            {/* Row 2: Authoritative Institutional Segmented Confidence / Evidence Gauge Rail (Embedded Optical Channel) */}
            <div className="w-full flex flex-col space-y-0.5">
              <div className="w-full h-2 bg-[#02050b] rounded-full overflow-hidden border-t border-t-cyan-500/30 border-b border-b-black/80 flex relative p-0.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.9)]">
                {/* Gauge Tick Markers: 0% (Low), 50% (Mid), 100% (High) */}
                <div className="absolute left-1/4 top-0 bottom-0 w-[1px] bg-cyan-400/20 z-10 pointer-events-none" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-cyan-400/35 z-10 pointer-events-none" />
                <div className="absolute left-3/4 top-0 bottom-0 w-[1px] bg-cyan-400/20 z-10 pointer-events-none" />
                {/* Dynamically bound fill mapped directly to authoritative assetProfile.confidence */}
                <div
                  className={`h-full transition-all duration-500 rounded-full ${
                    assetProfile.confidence === 0
                      ? 'w-0'
                      : assetProfile.confidence < 35
                      ? 'bg-gradient-to-r from-rose-500 to-amber-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]'
                      : assetProfile.confidence < 65
                      ? 'bg-gradient-to-r from-amber-500 to-teal-400 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                      : 'bg-gradient-to-r from-teal-400 via-cyan-400 to-emerald-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, assetProfile.confidence))}%` }}
                />
              </div>
              {/* Telemetry Scale Labels: LOW 0% • 50% • HIGH 100% */}
              <div className="flex items-center justify-between text-[6px] font-mono text-gray-500 leading-none px-0.5">
                <span>0% LOW</span>
                <span className="text-gray-400">50%</span>
                <span className="text-cyan-400/90 font-bold">100% HIGH</span>
              </div>
            </div>

            {/* Row 3: Truthful Directional Breakdown Counts */}
            <div className="flex items-center justify-center space-x-2 text-[7.5px] font-mono font-bold leading-none text-gray-400 w-full pt-0.5">
              <span className="text-emerald-400">
                {assetProfile.agents.filter((a) => a.bias === 'BULLISH' && a.status !== 'DATA LIMITED').length} BULL
              </span>
              <span className="text-gray-600">&bull;</span>
              <span className="text-rose-400">
                {assetProfile.agents.filter((a) => a.bias === 'BEARISH' && a.status !== 'DATA LIMITED').length} BEAR
              </span>
              <span className="text-gray-600">&bull;</span>
              <span className="text-cyan-400">
                {assetProfile.agents.filter((a) => a.bias === 'NEUTRAL' && a.status !== 'DATA LIMITED').length} NEUT
              </span>
              <span className="text-gray-600">&bull;</span>
              <span className="text-amber-400/90">
                {nodeModel.breakdown.dataLimitedCount} DATA LTD
              </span>
            </div>
          </div>
        </div>

        {/* Right: Learn Button */}
        <div className="flex items-center justify-end flex-shrink-0">
          <Link
            href="/how-to-use#agents"
            className="hidden sm:inline-flex text-[8px] font-mono font-bold text-gray-400 hover:text-cyan-300 px-2 py-1 rounded border border-white/10 hover:border-cyan-400/40 bg-black/40 transition-colors"
            title="Learn how the 32-Agent Swarm operates"
          >
            ? LEARN
          </Link>
        </div>
      </div>

      {/* Visual Hub: FEF CORTEX Compact Radial Multi-Agent Intelligence Architecture */}
      <div className="relative py-1 w-full h-[220px] sm:h-[260px] md:h-[280px] min-h-[220px] max-h-[280px] overflow-hidden flex items-center justify-center">
        {/* Proportional Radial Stage (730x280 natural space scaled smoothly to fit available container width) */}
        <div className="relative w-[730px] h-[280px] flex-shrink-0 origin-center scale-[0.44] min-[390px]:scale-[0.49] min-[430px]:scale-[0.55] sm:scale-[0.80] md:scale-[0.92] xl:scale-100 transition-transform">
          {/* SVG Animated Connector Tendrils & Structured Digital Pulses */}
          <HubRadialNetworkSvg
            orbitalNodes={orbitalNodeLayouts}
            hoveredAgentKey={hoveredAgentKey}
            activeBurstAgents={activeBurstAgents}
            isPaused={isTabHidden || prefersReducedMotion}
          />

          {/* Central Core: Compact CORTEX Intelligence Nucleus */}
          <CompactCortexCore
            profile={assetProfile}
            activeSymbol={activeSymbol}
            isIngesting={isCoreIngesting}
            contributingCount={nodeModel.breakdown.contributingCount}
            dataLimitedCount={nodeModel.breakdown.dataLimitedCount}
            offlineCount={nodeModel.breakdown.offlineCount}
            errorCount={nodeModel.breakdown.errorCount}
            unavailableCount={nodeModel.breakdown.unavailableCount}
            totalVisibleCount={21}
          />

          {/* 20 Compact Orbital Cortex Scanner Nodes */}
          {orbitalNodeLayouts.map((item) => (
            <CortexScannerNode
              key={item.agent.name + item.agent.type}
              agent={item.agent}
              index={item.index}
              x={item.x}
              y={item.y}
              portX={item.portX}
              portY={item.portY}
              portSide={item.portSide}
              elapsedSec={elapsedSec}
              isHovered={hoveredAgentKey === item.agent.name + item.agent.type}
              onHover={handleAgentHover}
              onClick={handleAgentClick}
              isSpecialist={item.isSpecialist}
              isBursting={activeBurstAgents.has(item.agent.name + item.agent.type)}
            />
          ))}
        </div>
      </div>

      {/* 5-Stage Confluence Flow Indicator */}
      <div className="flex items-center justify-between px-3 py-1 rounded-xl bg-black/30 border border-white/5 text-[7.5px] font-mono text-gray-400 overflow-x-auto">
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-cyan-400">01</span>
          <span className="text-gray-300 font-bold">MARKET DATA</span>
          <span className="text-cyan-400 text-[6.5px]">&bull; Ingesting</span>
        </div>
        <span className="text-gray-600">&rarr;</span>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-purple-400">02</span>
          <span className="text-gray-300 font-bold">AGENT ANALYSIS</span>
          <span className="text-purple-400 text-[6.5px]">&bull; Processing</span>
        </div>
        <span className="text-gray-600">&rarr;</span>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-blue-400">03</span>
          <span className="text-gray-300 font-bold">CONFLUENCE</span>
          <span className="text-blue-400 text-[6.5px]">&bull; Synthesizing</span>
        </div>
        <span className="text-gray-600">&rarr;</span>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-amber-400">04</span>
          <span className="text-gray-300 font-bold">RISK VALIDATION</span>
          <span className="text-amber-400 text-[6.5px]">&bull; Bounding</span>
        </div>
        <span className="text-gray-600">&rarr;</span>
        <div className="flex items-center space-x-1 flex-shrink-0">
          <span className="text-emerald-400">05</span>
          <span className="text-gray-300 font-bold">TRADE BLUEPRINT</span>
          <span className="text-emerald-400 text-[6.5px]">&bull; Finalized</span>
        </div>
      </div>

      {/* Integrated Bottom Row: Live Communication Stream + Trading Risk Warning */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 border-t border-white/10">
        {/* Pod 1: Mini Live Communication Feed */}
        <HubMiniFeed
          messages={liveMessages}
          activeSymbol={activeSymbol}
        />

        {/* Pod 2: Compact Trading Risk Warning */}
        <HubRiskWarningStrip
          assessment={riskAssessment}
          confluenceScore={assetProfile.confidence}
          onOpenRiskModal={handleOpenRiskModal}
        />
      </div>

      {/* Integrated In-Hub Detail Drawer for Agent Dossiers & Risk Audit */}
      <HubDetailDrawer
        selectedAgent={selectedAgent}
        riskAssessment={showRiskModal ? riskAssessment : null}
        activeSymbol={activeSymbol}
        onClose={handleCloseDrawer}
      />
    </div>
  );
};
