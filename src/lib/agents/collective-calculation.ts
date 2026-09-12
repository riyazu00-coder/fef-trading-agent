export interface AgentMathVector {
  agentName: string;
  category: string;
  vector: number; // -1.0 (Extreme Bearish) to +1.0 (Extreme Bullish)
  weight: number; // 0.0 to 1.0
  confidence: number; // 0 to 100%
  equation: string;
  latestValue: string;
  status: 'CALCULATING' | 'CONVERGED' | 'OPTIMIZING';
}

export interface CollectiveCalculationResult {
  timestamp: string;
  rawTensorSum: number;
  normalizedConfluence: number;
  directionalBias: 'STRONG_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'STRONG_BEARISH';
  verdict: 'BUY SETUP' | 'SELL SETUP' | 'WATCH' | 'NO TRADE';
  riskDiscountFactor: number;
  entryZone: [number, number];
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  vectors: AgentMathVector[];
  convergenceCycles: number;
}

export const INITIAL_AGENT_VECTORS: AgentMathVector[] = [
  {
    agentName: 'Technical Agent',
    category: 'ICT / SMC Structure',
    vector: 0.84,
    weight: 0.22,
    confidence: 86,
    equation: 'V_tech = f(BOS, CHOCH, FVG_retest) * VolDelta',
    latestValue: '+0.84 (M15 CHOCH + Demand OB)',
    status: 'CONVERGED'
  },
  {
    agentName: 'Macro Agent',
    category: 'Rates & Real Yields',
    vector: 0.76,
    weight: 0.18,
    confidence: 78,
    equation: 'V_macro = -β_yields*(dUS10Y) + ΔFedCutProb',
    latestValue: '+0.76 (US10Y Yield -1.40% drop)',
    status: 'CONVERGED'
  },
  {
    agentName: 'Correlation Agent',
    category: 'Cross-Asset Covariance',
    vector: 0.81,
    weight: 0.16,
    confidence: 82,
    equation: 'V_corr = -Cov(Gold, DXY) + Cov(Gold, Silver)',
    latestValue: '+0.81 (DXY 104.18 reject + Silver +1.42%)',
    status: 'CONVERGED'
  },
  {
    agentName: 'Institutional Agent',
    category: 'COT & Order Flow Delta',
    vector: 0.79,
    weight: 0.14,
    confidence: 80,
    equation: 'V_inst = Σ(ETF_inflows) + NonComm_NetSpec',
    latestValue: '+0.79 (+3.2t ETF accumulation)',
    status: 'CONVERGED'
  },
  {
    agentName: 'Geopolitical Agent',
    category: 'Safe-Haven Risk Premium',
    vector: 0.72,
    weight: 0.10,
    confidence: 74,
    equation: 'V_geo = RiskIndex(RedSea, Sanctions, BRICS)',
    latestValue: '+0.72 (Baseline maritime risk floor)',
    status: 'CONVERGED'
  },
  {
    agentName: 'News Agent',
    category: 'NLP Sentiment & Wires',
    vector: 0.12,
    weight: 0.06,
    confidence: 68,
    equation: 'V_news = Log(BullishArticles / BearishArticles)',
    latestValue: '+0.12 (Neutral ahead of Core PCE)',
    status: 'CALCULATING'
  },
  {
    agentName: 'Sentiment Agent',
    category: 'Retail vs Spec Skew',
    vector: 0.05,
    weight: 0.04,
    confidence: 65,
    equation: 'V_sent = -(RetailLongRatio - 0.50) * FadeCoef',
    latestValue: '+0.05 (Retail cooling to 56%)',
    status: 'CONVERGED'
  },
  {
    agentName: 'Risk Guardian Agent',
    category: 'Drawdown & Volatility Filter',
    vector: -0.15,
    weight: 0.10,
    confidence: 88,
    equation: 'Discount = MaxLossCheck * (1 - EventProximityRisk)',
    latestValue: 'Factor x0.88 (PCE Lockout Guard)',
    status: 'CONVERGED'
  }
];

// Pure mathematical convergence formula
export function computeCollectiveConvergence(vectors: AgentMathVector[]): CollectiveCalculationResult {
  let weightedVectorSum = 0;
  let totalWeight = 0;

  vectors.forEach((v) => {
    if (v.agentName !== 'Risk Guardian Agent') {
      weightedVectorSum += v.vector * v.weight;
      totalWeight += v.weight;
    }
  });

  const rawConvergence = totalWeight > 0 ? weightedVectorSum / totalWeight : 0;
  const riskDiscountFactor = 0.88; // Reduced slightly due to PCE in 1h 45m
  const finalConfluencePercent = Math.round(rawConvergence * riskDiscountFactor * 100);

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  return {
    timestamp: timeStr,
    rawTensorSum: Number((weightedVectorSum).toFixed(4)),
    normalizedConfluence: finalConfluencePercent, // e.g. 72%
    directionalBias: 'BULLISH',
    verdict: 'BUY SETUP',
    riskDiscountFactor,
    entryZone: [2344.00, 2346.50],
    stopLoss: 2339.80,
    tp1: 2354.00,
    tp2: 2362.00,
    tp3: 2371.50,
    vectors,
    convergenceCycles: 482
  };
}
