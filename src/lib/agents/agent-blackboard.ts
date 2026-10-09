import { evaluateMarketSession, MarketSessionState } from '../session/market-session-engine';
import { getMarketDefinition } from '../registry/market-registry';
import {
  EvidenceDomainFamily,
  UnifiedAgentEvidence,
  EvidencePolarity,
} from './contracts/unified-agent-contract';

/**
 * Normalizes any broker symbol or alias into its authoritative canonical blackboard symbol.
 */
export function toCanonicalSymbol(symbol: string): string {
  if (!symbol) return '';
  const def = getMarketDefinition(symbol);
  return def ? def.symbol : symbol.toUpperCase().trim();
}

/**
 * Shared Agent Blackboard (Domain-Family Intelligence Memory Context)
 *
 * Agents publish structured domain evidence here and read other agents' analyses.
 * Prevents factor double-counting by strictly partitioning evidence into domain families.
 */

export interface SharedMarketContext {
  timestamp: string;
  selectedSymbol: string;
  assetPrice: number | null;
  xauusdPrice?: number | null; // backwards compatibility
  bid: number | null;
  ask: number | null;
  spread: number | null;
  marketRegime: string;
  session: string;
  marketSession?: {
    marketState: string;
    sessionName: string;
    tradeExecutable: boolean;
    nextOpenCountdown?: string | null;
    nextCloseCountdown?: string | null;
    statusLabel: string;
    scheduleSource: string;
  };
  dxyState: {
    price?: number | null;
    trend: 'WEAKENING' | 'STRENGTHENING' | 'NEUTRAL' | 'DATA LIMITED';
    change?: number | null;
    correlationStatus: string;
    divergenceToGold?: 'CONFIRMED' | 'DIVERGENT' | 'NORMAL' | 'DATA LIMITED';
  };
  yieldState: {
    us10y?: number | null;
    trend: 'FALLING' | 'RISING' | 'FLAT' | 'DATA LIMITED';
    change?: number | null;
    macroBias: string;
    realYieldBias?: 'BULLISH_GOLD' | 'BEARISH_GOLD' | 'NEUTRAL' | 'DATA LIMITED';
  };
  macroDivergence?: {
    status: 'CONFIRMED' | 'DIVERGENT' | 'NORMAL' | 'DATA LIMITED';
    summary: string;
  };
  eventRisk: {
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'DATA LIMITED' | 'UNKNOWN';
    nextEvent: string;
    countdown: string;
    lockoutActive: boolean;
  };
  agentBiases: Record<string, {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CAUTION' | 'RESTRICTED' | 'DATA LIMITED';
    confidence: number;
    score: number; // -1.0 to +1.0
    lastObservation: string;
    evidence: string[];
    updatedAt: string;
  }>;
  consensusScore: number; // e.g. 0%
  directionalVerdict: 'BUY SETUP' | 'SELL SETUP' | 'WATCH BUY' | 'WATCH SELL' | 'WAIT' | 'NO TRADE';
  activeDisagreements: string[];
  invalidationLevel?: number;
  evidenceByDomain?: Partial<Record<EvidenceDomainFamily, UnifiedAgentEvidence[]>>;
  domainReadiness?: Partial<Record<EvidenceDomainFamily, 'READY' | 'PARTIAL' | 'DATA_LIMITED' | 'UNAVAILABLE'>>;
}

export const ALL_DOMAIN_FAMILIES: EvidenceDomainFamily[] = [
  'PRICE_TECHNICAL',
  'MARKET_STRUCTURE',
  'LIQUIDITY',
  'ORDER_FLOW',
  'RATES',
  'INFLATION',
  'MACRO_REGIME',
  'NEWS_EVENT',
  'GEOPOLITICAL_EVENT',
  'SENTIMENT',
  'CROSS_ASSET',
  'VOLATILITY',
  'QUANT_STATISTICAL',
  'HISTORICAL_ANALOGUE',
  'PORTFOLIO_EXPOSURE',
  'RISK_GEOMETRY',
  'SYSTEM_INTEGRITY',
  'CURRENCY_STRENGTH',
  'INSTITUTIONAL',
  'RISK_GUARDIAN',
  'NEWS_WIRE',
];

// Global in-memory domain evidence registry: symbol -> Map<domainFamily, UnifiedAgentEvidence[]>
const blackboardEvidenceStore = new Map<string, Map<EvidenceDomainFamily, UnifiedAgentEvidence[]>>();

/**
 * Publishes one or more structured evidence items to the symbol's domain blackboard.
 */
export function publishDomainEvidence(
  symbol: string,
  evidence: UnifiedAgentEvidence | UnifiedAgentEvidence[]
): void {
  if (!symbol) return;
  const normSym = toCanonicalSymbol(symbol);
  let assetMap = blackboardEvidenceStore.get(normSym);
  if (!assetMap) {
    assetMap = new Map();
    blackboardEvidenceStore.set(normSym, assetMap);
  }

  const items = Array.isArray(evidence) ? evidence : [evidence];
  for (const item of items) {
    if (!item || !item.domainFamily) continue;
    // Enforce canonical blackboard instrument identity
    item.instrument = normSym;
    let domainItems = assetMap.get(item.domainFamily);
    if (!domainItems) {
      domainItems = [];
      assetMap.set(item.domainFamily, domainItems);
    }
    // Idempotency: replace if matching id already exists, else push
    const existingIdx = domainItems.findIndex((e) => e.id === item.id);
    if (existingIdx >= 0) {
      domainItems[existingIdx] = item;
    } else {
      domainItems.push(item);
    }
  }
}

/**
 * Retrieves all evidence published under a specific domain family for a symbol.
 */
export function getDomainEvidence(
  symbol: string,
  domainFamily: EvidenceDomainFamily
): UnifiedAgentEvidence[] {
  if (!symbol) return [];
  const normSym = toCanonicalSymbol(symbol);
  const assetMap = blackboardEvidenceStore.get(normSym);
  if (!assetMap) return [];
  return assetMap.get(domainFamily) || [];
}

/**
 * Retrieves a dictionary of all domain evidence records partitioned by family for an asset.
 */
export function getAllDomainEvidenceForAsset(
  symbol: string
): Record<EvidenceDomainFamily, UnifiedAgentEvidence[]> {
  const normSym = toCanonicalSymbol(symbol);
  const assetMap = blackboardEvidenceStore.get(normSym);
  const result = {} as Record<EvidenceDomainFamily, UnifiedAgentEvidence[]>;

  for (const domain of ALL_DOMAIN_FAMILIES) {
    result[domain] = assetMap?.get(domain) || [];
  }
  return result;
}

/**
 * Summarizes domain coverage for a symbol.
 */
export function getDomainEvidenceSummary(symbol: string): {
  totalCount: number;
  activeDomains: EvidenceDomainFamily[];
  domainCounts: Record<string, number>;
} {
  const normSym = toCanonicalSymbol(symbol);
  const assetMap = blackboardEvidenceStore.get(normSym);
  if (!assetMap) {
    return { totalCount: 0, activeDomains: [], domainCounts: {} };
  }

  let totalCount = 0;
  const activeDomains: EvidenceDomainFamily[] = [];
  const domainCounts: Record<string, number> = {};

  assetMap.forEach((items, domain) => {
    if (items.length > 0) {
      activeDomains.push(domain);
      domainCounts[domain] = items.length;
      totalCount += items.length;
    }
  });

  return { totalCount, activeDomains, domainCounts };
}

/**
 * Clears domain evidence store (for testing / session re-bootstrap).
 */
export function clearDomainEvidenceForTesting(): void {
  blackboardEvidenceStore.clear();
}

export const INITIAL_BLACKBOARD_STATE: SharedMarketContext = {
  timestamp: '--:--:--',
  selectedSymbol: 'STANDBY',
  assetPrice: null,
  xauusdPrice: null,
  bid: null,
  ask: null,
  spread: null,
  marketRegime: 'Awaiting market data feed',
  session: 'STANDBY',
  marketSession: {
    marketState: 'CLOSED',
    sessionName: 'STANDBY',
    tradeExecutable: false,
    nextOpenCountdown: null,
    nextCloseCountdown: null,
    statusLabel: 'CLOSED',
    scheduleSource: 'BOOTSTRAP',
  },
  dxyState: {
    price: null,
    trend: 'DATA LIMITED',
    change: null,
    correlationStatus: 'DXY correlation feed uninitialized',
    divergenceToGold: 'DATA LIMITED',
  },
  yieldState: {
    us10y: null,
    trend: 'DATA LIMITED',
    change: null,
    macroBias: 'Treasury yield feed uninitialized',
    realYieldBias: 'DATA LIMITED',
  },
  macroDivergence: {
    status: 'DATA LIMITED',
    summary: 'Macro intermarket divergence uninitialized',
  },
  eventRisk: {
    level: 'DATA LIMITED',
    nextEvent: 'Economic calendar unavailable',
    countdown: 'DATA LIMITED',
    lockoutActive: false,
  },
  agentBiases: {},
  consensusScore: 0,
  directionalVerdict: 'WAIT',
  activeDisagreements: [],
  invalidationLevel: undefined,
  evidenceByDomain: {},
  domainReadiness: {},
};

/**
 * Dynamically construct a shared intelligence blackboard for ANY instrument
 * ensuring zero residual gold context on non-metal instruments.
 */
export function createSharedBlackboardForAsset(
  symbol: string,
  price: number,
  spread: number,
  change24h: number,
  category: string,
  regime: string,
  session: string,
  consensusScore: number,
  directionalVerdict: 'BUY SETUP' | 'SELL SETUP' | 'WATCH BUY' | 'WATCH SELL' | 'WAIT' | 'NO TRADE',
  invalidation: number,
  agentList: { name: string; bias: any; confidence: number; lastOpinion: string; evidence: string[] }[],
  verifiedMacroContext?: {
    dxy?: { price: number; change: number; trend: 'WEAKENING' | 'STRENGTHENING' | 'NEUTRAL'; divergenceToGold?: 'CONFIRMED' | 'DIVERGENT' | 'NORMAL' };
    yields?: { us10y: number; change: number; trend: 'FALLING' | 'RISING' | 'FLAT'; realYieldBias?: 'BULLISH_GOLD' | 'BEARISH_GOLD' | 'NEUTRAL' };
  }
): SharedMarketContext {
  const normSym = symbol.toUpperCase().trim();
  const isMetal = category === 'METALS';
  const isForex = category === 'FOREX';
  const isCrypto = category === 'CRYPTO';
  const isIndex = category === 'INDICES';

  const dxyStatus = isForex
    ? 'Direct dollar exchange cross sensitivity active'
    : isMetal
    ? 'Inverse correlation with precious metals reserve demand'
    : isIndex
    ? 'Liquidity condition tracking equity beta'
    : 'Macro liquidity context';

  const macroBias = isCrypto
    ? 'Global risk liquidity and real yields guide spot capital flows'
    : isIndex
    ? 'Earnings discount rate tied to US 10-year benchmark yield'
    : isForex
    ? 'Transatlantic yield spreads define carry momentum'
    : 'Real yield cost of carry guides sovereign reserves';

  const agentBiases: SharedMarketContext['agentBiases'] = {};
  for (const a of agentList) {
    agentBiases[a.name] = {
      bias: a.bias,
      confidence: a.confidence,
      score: a.bias === 'BULLISH' ? 0.8 : a.bias === 'BEARISH' ? -0.8 : 0.0,
      lastObservation: a.lastOpinion,
      evidence: a.evidence,
      updatedAt: new Date().toTimeString().split(' ')[0],
    };
  }

  const sessionInfo = evaluateMarketSession(symbol, new Date());

  // Ground DXY & Yields only in verified upstream telemetry, never fabricated defaults
  const dxyPrice = verifiedMacroContext?.dxy?.price ?? null;
  const dxyChange = verifiedMacroContext?.dxy?.change ?? null;
  const dxyTrend = verifiedMacroContext?.dxy?.trend ?? 'DATA LIMITED';
  const dxyDivergence = verifiedMacroContext?.dxy?.divergenceToGold ?? (isMetal && verifiedMacroContext?.dxy ? 'NORMAL' : 'DATA LIMITED');

  const us10yPrice = verifiedMacroContext?.yields?.us10y ?? null;
  const us10yChange = verifiedMacroContext?.yields?.change ?? null;
  const us10yTrend = verifiedMacroContext?.yields?.trend ?? 'DATA LIMITED';
  const realYieldBias = verifiedMacroContext?.yields?.realYieldBias ?? (isMetal && verifiedMacroContext?.yields ? 'NEUTRAL' : 'DATA LIMITED');

  // Pull registered domain evidence from blackboard store
  const allDomainEvidence = getAllDomainEvidenceForAsset(normSym);
  const domainReadiness: Partial<Record<EvidenceDomainFamily, 'READY' | 'PARTIAL' | 'DATA_LIMITED' | 'UNAVAILABLE'>> = {};

  for (const [domain, items] of Object.entries(allDomainEvidence) as [EvidenceDomainFamily, UnifiedAgentEvidence[]][]) {
    if (items.length >= 2) {
      domainReadiness[domain] = 'READY';
    } else if (items.length === 1) {
      domainReadiness[domain] = 'PARTIAL';
    } else {
      domainReadiness[domain] = 'DATA_LIMITED';
    }
  }

  const macroDivergence = {
    status: dxyDivergence === 'DIVERGENT' ? ('DIVERGENT' as const) : dxyDivergence === 'CONFIRMED' ? ('CONFIRMED' as const) : ('NORMAL' as const),
    summary: `${normSym} intermarket macro alignment: ${dxyStatus}`,
  };

  return {
    timestamp: new Date().toTimeString().split(' ')[0],
    selectedSymbol: symbol,
    assetPrice: price,
    xauusdPrice: isMetal && symbol === 'XAUUSD' ? price : undefined,
    bid: Number((price - spread / 2).toFixed(symbol.includes('JPY') ? 2 : isForex ? 4 : 2)),
    ask: Number((price + spread / 2).toFixed(symbol.includes('JPY') ? 2 : isForex ? 4 : 2)),
    spread,
    marketRegime: regime,
    session: sessionInfo.sessionName || session,
    marketSession: {
      marketState: sessionInfo.marketState,
      sessionName: sessionInfo.sessionName,
      tradeExecutable: sessionInfo.tradeExecutable,
      nextOpenCountdown: sessionInfo.nextOpenCountdown,
      nextCloseCountdown: sessionInfo.nextCloseCountdown,
      statusLabel: sessionInfo.statusLabel,
      scheduleSource: sessionInfo.scheduleSource,
    },
    dxyState: {
      price: dxyPrice,
      trend: dxyTrend,
      change: dxyChange,
      correlationStatus: dxyStatus,
      divergenceToGold: dxyDivergence,
    },
    yieldState: {
      us10y: us10yPrice,
      trend: us10yTrend,
      change: us10yChange,
      macroBias,
      realYieldBias,
    },
    macroDivergence,
    eventRisk: {
      level: 'DATA LIMITED',
      nextEvent: 'Economic calendar unavailable',
      countdown: 'DATA LIMITED',
      lockoutActive: false,
    },
    agentBiases,
    consensusScore,
    directionalVerdict,
    activeDisagreements: [
      'Risk Guardian mandates conservative lot sizing pending macroeconomic prints',
    ],
    invalidationLevel: invalidation,
    evidenceByDomain: allDomainEvidence,
    domainReadiness,
  };
}
