import React, { useState } from 'react';
import { AgentState } from '@/lib/agents/agent-types';
import { calculateAgentNodeState, HubAgentState } from '@/lib/agents/hub-animation-engine';
import {
  BarChart3,
  Coins,
  Activity,
  TrendingUp,
  BarChart2,
  Landmark,
  Users,
  Globe,
  Newspaper,
  Network,
  Percent,
  Zap,
  Shield,
  LineChart,
  Lightbulb,
  Target,
  Droplets,
  Clock,
  GitBranch,
  Layers,
} from 'lucide-react';

export interface ScannerNodeProps {
  agent: AgentState;
  index: number;
  x: number;
  y: number;
  portX: number;
  portY: number;
  portSide: 'top' | 'bottom' | 'left' | 'right';
  elapsedSec: number;
  isHovered: boolean;
  onHover: (key: string | null) => void;
  onClick: (agent: AgentState) => void;
  isSpecialist?: boolean;
  isBursting?: boolean;
}

// STRICT IDENTICAL GEOMETRY FOR ALL 20 ORBITAL CARDS
export const CORTEX_SCANNER_NODE_WIDTH = 152;
export const CORTEX_SCANNER_NODE_HEIGHT = 28;

// DOMAIN VECTOR ICON MAPPING
const getAgentDomainIcon = (type: string) => {
  switch (type) {
    case 'MARKET_REGIME_CLASSIFIER_AGENT':
      return BarChart3;
    case 'CURRENCY_STRENGTH_AGENT':
      return Coins;
    case 'COT_POSITIONING_AGENT':
      return BarChart2;
    case 'RATES_AGENT':
      return Percent;
    case 'VOLATILITY_AGENT':
      return Activity;
    case 'CENTRAL_BANK_POLICY_AGENT':
      return Landmark;
    case 'ORDER_FLOW':
    case 'SCALPER_FLOW_SHIFT':
      return Zap;
    case 'TECHNICAL_ANALYSIS_AGENT':
    case 'TECHNICAL':
      return Activity;
    case 'MOMENTUM_CONFIRMATION_AGENT':
      return TrendingUp;
    case 'MULTI_TIMEFRAME_ALIGNMENT_AGENT':
      return Layers;
    case 'VOLUME_PROFILE_AGENT':
      return BarChart2;
    case 'LIQUIDITY_RUN_SNIPER_AGENT':
    case 'LIQUIDITY_MAP':
      return Droplets;
    case 'MACRO_REGIME_AGENT':
    case 'MACRO':
      return TrendingUp;
    case 'CORRELATION_SENTINEL_AGENT':
    case 'CORRELATION':
      return Network;
    case 'INSTITUTIONAL_FOOTPRINT_AGENT':
    case 'INSTITUTIONAL':
      return Landmark;
    case 'STRUCTURAL_SMC_AGENT':
      return GitBranch;
    case 'MEAN_REVERSION_AGENT':
      return Activity;
    case 'CANDLE_ANOMALY_AGENT':
      return Activity;
    case 'RISK_GUARDIAN_AGENT':
    case 'RISK_GUARDIAN':
      return Shield;
    case 'VISION':
      return LineChart;
    case 'OPPORTUNITY':
      return Lightbulb;
    case 'STRATEGY':
      return Target;
    case 'KILLZONE':
      return Clock;
    case 'SENTIMENT':
      return Users;
    case 'GEOPOLITICAL':
      return Globe;
    case 'NEWS':
      return Newspaper;
    default:
      return Activity;
  }
};

export const CortexScannerNode: React.FC<ScannerNodeProps> = ({
  agent,
  index,
  x,
  y,
  portX,
  portY,
  portSide,
  elapsedSec,
  isHovered,
  onHover,
  onClick,
  isSpecialist = false,
  isBursting = false,
}) => {
  const [showTooltip, setShowTooltip] = useState<boolean>(false);

  const agentKey = agent.name + agent.type;
  const nodeState: HubAgentState = calculateAgentNodeState(agent, elapsedSec, index);

  const isDataLimited = agent.status === 'DATA LIMITED';
  const isOffline = agent.status === 'OFFLINE';
  const isError = agent.status === 'ERROR';
  const isCaution = agent.bias === 'CAUTION' || agent.bias === 'RESTRICTED';
  const isBull = agent.bias === 'BULLISH';
  const isBear = agent.bias === 'BEARISH';
  const isNeut = agent.bias === 'NEUTRAL';
  const isRiskGuardian = agent.type === 'RISK_GUARDIAN';

  const DomainIcon = getAgentDomainIcon(agent.type);

  // Cinematic 3D Projected Smoked Glass Material Styling
  // State-driven edge refraction and restrained optical underglow (Zero white borders!)
  let glassStyle = {
    background: 'linear-gradient(135deg, rgba(8, 20, 36, 0.72) 0%, rgba(3, 8, 16, 0.88) 100%)',
    borderColor: 'rgba(6, 182, 212, 0.38)',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.12), inset 0 0 12px rgba(6, 182, 212, 0.12), 0 0 12px rgba(6, 182, 212, 0.18)',
    iconColor: '#22d3ee',
    statusTextColor: 'text-cyan-300',
    portBorder: '#06b6d4',
    portFill: '#22d3ee',
  };

  if (isError) {
    glassStyle = {
      background: 'linear-gradient(135deg, rgba(28, 8, 14, 0.75) 0%, rgba(14, 3, 6, 0.90) 100%)',
      borderColor: 'rgba(244, 63, 94, 0.45)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.10), inset 0 0 12px rgba(244, 63, 94, 0.15), 0 0 12px rgba(244, 63, 94, 0.22)',
      iconColor: '#fb7185',
      statusTextColor: 'text-rose-400',
      portBorder: '#f43f5e',
      portFill: '#fb7185',
    };
  } else if (isOffline) {
    glassStyle = {
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.70) 0%, rgba(6, 10, 20, 0.86) 100%)',
      borderColor: 'rgba(71, 85, 105, 0.35)',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.08)',
      iconColor: '#64748b',
      statusTextColor: 'text-slate-400',
      portBorder: '#475569',
      portFill: '#64748b',
    };
  } else if (isDataLimited) {
    // Warm Amber / Muted Gold Optical Glass (True 3D smoked glass, zero white borders)
    glassStyle = {
      background: 'linear-gradient(135deg, rgba(24, 18, 8, 0.65) 0%, rgba(12, 8, 3, 0.82) 100%)',
      borderColor: 'rgba(245, 158, 11, 0.38)',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.18), inset 1px 0 2px rgba(245, 158, 11, 0.15), inset 0 0 12px rgba(245, 158, 11, 0.10)',
      iconColor: '#fbbf24',
      statusTextColor: 'text-amber-300',
      portBorder: '#d97706',
      portFill: '#f59e0b',
    };
  } else if (isBull) {
    // Emerald / Green Optical Glass
    glassStyle = {
      background: 'linear-gradient(135deg, rgba(8, 28, 18, 0.65) 0%, rgba(2, 12, 7, 0.82) 100%)',
      borderColor: 'rgba(16, 185, 129, 0.40)',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.20), inset 1px 0 2px rgba(16, 185, 129, 0.18), inset 0 0 14px rgba(16, 185, 129, 0.12)',
      iconColor: '#34d399',
      statusTextColor: 'text-emerald-300',
      portBorder: '#10b981',
      portFill: '#34d399',
    };
  } else if (isBear) {
    // Rose / Crimson Red Optical Glass
    glassStyle = {
      background: 'linear-gradient(135deg, rgba(30, 10, 16, 0.65) 0%, rgba(14, 3, 6, 0.82) 100%)',
      borderColor: 'rgba(244, 63, 94, 0.40)',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.20), inset 1px 0 2px rgba(244, 63, 94, 0.18), inset 0 0 14px rgba(244, 63, 94, 0.12)',
      iconColor: '#fb7185',
      statusTextColor: 'text-rose-300',
      portBorder: '#f43f5e',
      portFill: '#fb7185',
    };
  } else if (isCaution) {
    // Amber / Gold Optical Glass
    glassStyle = {
      background: 'linear-gradient(135deg, rgba(28, 20, 8, 0.65) 0%, rgba(14, 9, 3, 0.82) 100%)',
      borderColor: 'rgba(251, 191, 36, 0.40)',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.20), inset 1px 0 2px rgba(251, 191, 36, 0.18), inset 0 0 14px rgba(251, 191, 36, 0.12)',
      iconColor: '#fcd34d',
      statusTextColor: 'text-amber-300',
      portBorder: '#f59e0b',
      portFill: '#fbbf24',
    };
  } else if (isNeut) {
    // Cyan / Ice-Blue Optical Glass
    glassStyle = {
      background: 'linear-gradient(135deg, rgba(10, 26, 42, 0.65) 0%, rgba(3, 10, 20, 0.82) 100%)',
      borderColor: 'rgba(6, 182, 212, 0.38)',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.20), inset 1px 0 2px rgba(6, 182, 212, 0.16), inset 0 0 14px rgba(6, 182, 212, 0.10)',
      iconColor: '#22d3ee',
      statusTextColor: 'text-cyan-300',
      portBorder: '#06b6d4',
      portFill: '#22d3ee',
    };
  }

  // Complete, Approved Human-Readable Agent Names
  const getDisplayAgentName = (name: string, type: string) => {
    switch (type) {
      case 'MARKET_REGIME_CLASSIFIER_AGENT':
        return 'Market Regime';
      case 'CURRENCY_STRENGTH_AGENT':
        return 'Currencies';
      case 'COT_POSITIONING_AGENT':
        return 'COT Profiler';
      case 'RATES_AGENT':
        return 'Rates Regime';
      case 'VOLATILITY_AGENT':
        return 'Volatility';
      case 'CENTRAL_BANK_POLICY_AGENT':
        return 'Central Bank';
      case 'ORDER_FLOW':
      case 'SCALPER_FLOW_SHIFT':
        return 'Scalper / Flow';
      case 'TECHNICAL_ANALYSIS_AGENT':
      case 'TECHNICAL':
        return 'Technical';
      case 'MOMENTUM_CONFIRMATION_AGENT':
        return 'Momentum';
      case 'MULTI_TIMEFRAME_ALIGNMENT_AGENT':
        return 'MTF Align';
      case 'VOLUME_PROFILE_AGENT':
        return 'Vol Profile';
      case 'LIQUIDITY_RUN_SNIPER_AGENT':
      case 'LIQUIDITY_MAP':
        return 'Liquidity';
      case 'MACRO_REGIME_AGENT':
      case 'MACRO':
        return 'Macro';
      case 'CORRELATION_SENTINEL_AGENT':
      case 'CORRELATION':
        return 'Correlation';
      case 'INSTITUTIONAL_FOOTPRINT_AGENT':
      case 'INSTITUTIONAL':
        return 'Institutional';
      case 'STRUCTURAL_SMC_AGENT':
        return 'Structural SMC';
      case 'MEAN_REVERSION_AGENT':
        return 'Mean Reversion';
      case 'CANDLE_ANOMALY_AGENT':
        return 'Candle Anomaly';
      case 'RISK_GUARDIAN_AGENT':
      case 'RISK_GUARDIAN':
        return 'Risk Guardian';
      case 'VISION':
        return 'Vision / Chart';
      case 'OPPORTUNITY':
        return 'Opportunity';
      case 'STRATEGY':
        return 'Strategy';
      case 'KILLZONE':
        return 'Session / Killzone';
      case 'SENTIMENT':
        return 'Sentiment';
      case 'GEOPOLITICAL':
        return 'Geopolitical';
      case 'NEWS':
        return 'News';
      case 'FINAL_DECISION_AGENT':
        return 'Final Decision';
      default:
        return name.replace(' Agent', '').replace(' Sniper', '');
    }
  };

  const cleanName = getDisplayAgentName(agent.name, agent.type);

  // Compact, high-contrast status badge: "50% BULL", "80% NEUT", "DATA LTD"
  const statusBadge = isError
    ? 'ERR'
    : isOffline
    ? 'OFFLINE'
    : isDataLimited
    ? 'DATA LTD'
    : `${agent.confidence}% ${isBull ? 'BULL' : isBear ? 'BEAR' : isNeut ? 'NEUT' : agent.bias.slice(0, 4)}`;

  // Port position classes on the node boundary (pointing directly towards Core)
  const portPositionClasses = {
    top: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
    bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
    left: 'left-0 top-1/2 -translate-y-1/2 -translate-x-1/2',
    right: 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2',
  }[portSide];

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x - CORTEX_SCANNER_NODE_WIDTH / 2}px`,
        top: `${y - CORTEX_SCANNER_NODE_HEIGHT / 2}px`,
        width: `${CORTEX_SCANNER_NODE_WIDTH}px`,
        height: `${CORTEX_SCANNER_NODE_HEIGHT}px`,
      }}
      className="select-none z-20 group"
      onMouseEnter={() => {
        setShowTooltip(true);
        onHover(agentKey);
      }}
      onMouseLeave={() => {
        setShowTooltip(false);
        onHover(null);
      }}
    >
      {/* Cinematic 3D Floating Glass Module */}
      <div
        onClick={() => onClick(agent)}
        className={`w-full h-full relative rounded-lg border transition-all duration-300 cursor-pointer flex items-center justify-between px-2 py-0.5 overflow-hidden backdrop-blur-md ${
          isHovered
            ? 'scale-[1.03] z-30 brightness-125'
            : 'hover:scale-[1.01]'
        }`}
        style={{
          background: glassStyle.background,
          borderColor: glassStyle.borderColor,
          boxShadow: isHovered
            ? `${glassStyle.boxShadow}, 0 0 18px ${glassStyle.borderColor}`
            : glassStyle.boxShadow,
        }}
      >
        {/* Subtle upper glass specular reflection line */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />

        {/* Left vs Right Mirroring Layout:
            - Left-side nodes (portSide === 'right'): OUTWARD icon on left, INWARD telemetry/port on right.
            - Right-side nodes (portSide === 'left'): INWARD telemetry/port on left, OUTWARD icon on right.
            - Top/Bottom nodes: Outward icon biased, inward telemetry.
        */}
        {portSide === 'left' ? (
          // RIGHT COLUMN NODES: Inward edge is LEFT (facing Core).
          // Layout: [ INWARD TELEMETRY ] [ NAME ] [ SPEC ] [ OUTWARD ICON ]
          <>
            {/* Inward Left: Confidence / Bias Telemetry Badge */}
            <span className={`font-bold font-mono text-[8px] tracking-tight flex-shrink-0 whitespace-nowrap z-10 pl-0.5 ${glassStyle.statusTextColor}`}>
              {statusBadge}
            </span>

            {/* Outward Right: Name + SPEC + Status Dot + Domain Icon */}
            <div className="flex items-center justify-end space-x-1 min-w-0 flex-1 z-10 pl-1">
              {/* Small Secondary SPEC Badge */}
              {isSpecialist && (
                <span className="text-[5.5px] px-0.5 py-0 rounded bg-purple-950/85 text-purple-200 border border-purple-500/50 font-bold font-mono flex-shrink-0 tracking-wider shadow-[0_0_6px_rgba(168,85,247,0.3)]">
                  SPEC
                </span>
              )}

              {/* Full Agent Name */}
              <span className="text-[#F8FAFC] font-semibold tracking-tight whitespace-nowrap text-[9px] font-sans drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate text-right">
                {cleanName}
              </span>

              {/* Micro status beacon dot */}
              <span className="relative flex h-1 w-1 flex-shrink-0 items-center justify-center">
                {(nodeState === 'SENDING' || isBursting) && (
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: glassStyle.iconColor }}
                  />
                )}
                <span
                  className="relative inline-flex rounded-full h-1 w-1"
                  style={{ backgroundColor: glassStyle.iconColor }}
                />
              </span>

              {/* Domain-specific vector icon (Outward Right Edge) */}
              <DomainIcon
                className="w-3 h-3 flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ color: glassStyle.iconColor }}
                strokeWidth={2}
              />
            </div>
          </>
        ) : (
          // LEFT COLUMN & TOP/BOTTOM NODES: Inward edge is RIGHT/BOTTOM/TOP (facing Core).
          // Layout: [ OUTWARD ICON ] [ STATUS DOT ] [ NAME ] [ SPEC ] [ INWARD TELEMETRY ]
          <>
            {/* Outward Left: Domain Icon + Status Dot + Full Agent Name + SPEC Badge */}
            <div className="flex items-center space-x-1 min-w-0 flex-1 z-10 pr-0.5">
              {/* Domain-specific vector icon (Outward Left Edge) */}
              <DomainIcon
                className="w-3 h-3 flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ color: glassStyle.iconColor }}
                strokeWidth={2}
              />

              {/* Micro status beacon dot */}
              <span className="relative flex h-1 w-1 flex-shrink-0 items-center justify-center">
                {(nodeState === 'SENDING' || isBursting) && (
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ backgroundColor: glassStyle.iconColor }}
                  />
                )}
                <span
                  className="relative inline-flex rounded-full h-1 w-1"
                  style={{ backgroundColor: glassStyle.iconColor }}
                />
              </span>

              {/* Full Agent Name */}
              <span className="text-[#F8FAFC] font-semibold tracking-tight whitespace-nowrap text-[9px] font-sans drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] truncate">
                {cleanName}
              </span>

              {/* Small Secondary SPEC Badge */}
              {isSpecialist && (
                <span className="text-[5.5px] px-0.5 py-0 rounded bg-purple-950/85 text-purple-200 border border-purple-500/50 font-bold font-mono flex-shrink-0 tracking-wider shadow-[0_0_6px_rgba(168,85,247,0.3)]">
                  SPEC
                </span>
              )}
            </div>

            {/* Inward Right: Confidence & Bias or Status Badge */}
            <span className={`font-bold font-mono text-[8px] tracking-tight flex-shrink-0 whitespace-nowrap z-10 ${glassStyle.statusTextColor}`}>
              {statusBadge}
            </span>
          </>
        )}
      </div>

      {/* Embedded Inward-Facing Glass Connection Port */}
      <div
        className="absolute z-30 w-2 h-2 rounded-full border pointer-events-none transition-all duration-300 -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${portX - (x - CORTEX_SCANNER_NODE_WIDTH / 2)}px`,
          top: `${portY - (y - CORTEX_SCANNER_NODE_HEIGHT / 2)}px`,
          borderColor: glassStyle.portBorder,
          backgroundColor: glassStyle.portFill,
          boxShadow: `0 0 6px ${glassStyle.portFill}`,
        }}
      />

      {/* Interactive Tooltip on Hover - Restyled into Dark Smoked Glass */}
      {showTooltip && (
        <div
          className={`absolute z-50 pointer-events-none w-56 p-2 rounded-xl backdrop-blur-xl text-[10px] font-mono space-y-1 shadow-[0_8px_32px_rgba(0,0,0,0.9)] border ${
            y > 140 ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${
            x > 450 ? 'right-0' : x < 280 ? 'left-0' : 'left-1/2 -translate-x-1/2'
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(6, 16, 28, 0.96) 0%, rgba(2, 6, 12, 0.98) 100%)',
            borderColor: glassStyle.borderColor,
            boxShadow: `0 8px 32px rgba(0, 0, 0, 0.9), 0 0 16px ${glassStyle.borderColor}`,
          }}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-1">
            <div className="flex items-center space-x-1.5">
              <DomainIcon className="w-3.5 h-3.5" style={{ color: glassStyle.iconColor }} />
              <span className="font-bold text-white uppercase text-[10px]">{cleanName}</span>
            </div>
            <span
              className="px-1.5 py-0.2 rounded text-[7.5px] font-bold font-mono border"
              style={{
                color: glassStyle.iconColor,
                borderColor: glassStyle.borderColor,
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
              }}
            >
              {nodeState}
            </span>
          </div>

          <div className="text-[8.5px] text-gray-300 leading-tight">
            {agent.role}
          </div>

          <div className="grid grid-cols-2 gap-1 pt-1 border-t border-white/5 text-[8px]">
            <div>
              <span className="text-gray-400">Confidence: </span>
              <strong className="text-cyan-300">{agent.confidence}%</strong>
            </div>
            <div>
              <span className="text-gray-400">Bias: </span>
              <strong className={glassStyle.statusTextColor}>{agent.bias}</strong>
            </div>
            <div>
              <span className="text-gray-400">Status: </span>
              <strong className={isDataLimited ? 'text-amber-400' : 'text-emerald-400'}>
                {agent.status}
              </strong>
            </div>
            <div>
              <span className="text-gray-400">Signals: </span>
              <strong className="text-white">{agent.evidence ? agent.evidence.length : 1} items</strong>
            </div>
          </div>

          {agent.evidence && agent.evidence[0] && (
            <div className="text-[7.5px] text-gray-300 italic truncate pt-0.5 border-t border-white/5">
              &ldquo;{agent.evidence[0]}&rdquo;
            </div>
          )}

          <div className="text-[7.5px] text-cyan-400/80 text-right pt-0.5 font-sans">
            Click to view full dossier &rarr;
          </div>
        </div>
      )}
    </div>
  );
};
