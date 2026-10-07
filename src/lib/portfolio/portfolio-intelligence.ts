/**
 * FEF CORTEX — PORTFOLIO & FACTOR EXPOSURE INTELLIGENCE
 * Milestone H Clean-Room Implementation
 * 
 * Rules:
 * 1. Zero execution authority: analyzes portfolio factor exposures without modifying orders.
 * 2. Uncovers hidden correlated risks (e.g. holding Long XAUUSD + Long EURUSD creates concentrated Short USD exposure).
 * 3. Preserves broker truth for MT5 positions without altering lot sizes or positions.
 * 4. Deterministic concentration and drawdown risk metrics.
 */

export interface PortfolioPosition {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  volumeLots: number;
  openPrice: number;
  currentPrice: number;
  unrealizedPl: number;
  currency: string;
}

export interface FactorExposureBreakdown {
  usdNetExposureLots: number;    // Net USD direction
  usdConcentrationPct: number;   // Share of portfolio exposed to USD
  preciousMetalsExposureLots: number;
  equityBetaExposureLots: number;
  currencyDiversificationScore: number; // 0 to 100
  overlappingRisks: string[];
}

export function analyzePortfolioExposures(
  positions: PortfolioPosition[],
  totalEquity: number = 100000
): FactorExposureBreakdown {
  if (!positions || positions.length === 0) {
    return {
      usdNetExposureLots: 0,
      usdConcentrationPct: 0,
      preciousMetalsExposureLots: 0,
      equityBetaExposureLots: 0,
      currencyDiversificationScore: 100,
      overlappingRisks: [],
    };
  }

  let usdLongLots = 0;
  let usdShortLots = 0;
  let goldLots = 0;
  let equityLots = 0;
  let totalLots = 0;

  for (const pos of positions) {
    const sym = pos.symbol.toUpperCase();
    const lots = Math.abs(pos.volumeLots);
    totalLots += lots;

    if (sym === 'XAUUSD') {
      goldLots += lots;
      // Long Gold is Short USD; Short Gold is Long USD
      if (pos.direction === 'LONG') {
        usdShortLots += lots;
      } else {
        usdLongLots += lots;
      }
    } else if (sym === 'EURUSD' || sym === 'GBPUSD') {
      if (pos.direction === 'LONG') {
        usdShortLots += lots;
      } else {
        usdLongLots += lots;
      }
    } else if (sym === 'USDJPY' || sym === 'USDCAD' || sym === 'USDCHF') {
      if (pos.direction === 'LONG') {
        usdLongLots += lots;
      } else {
        usdShortLots += lots;
      }
    } else if (sym === 'US500' || sym === 'US100') {
      equityLots += lots;
    }
  }

  const netUsdLots = Math.round((usdLongLots - usdShortLots) * 100) / 100;
  const usdExposureSum = usdLongLots + usdShortLots;
  const usdConcentrationPct = totalLots > 0 ? Math.round((usdExposureSum / totalLots) * 100) : 0;

  const overlappingRisks: string[] = [];
  if (usdConcentrationPct > 70) {
    overlappingRisks.push(`High USD concentration (${usdConcentrationPct}% of active lots). Multiple positions share directional dollar vulnerability.`);
  }

  if (usdShortLots > 0 && goldLots > 0) {
    const goldPos = positions.find((p) => p.symbol.toUpperCase() === 'XAUUSD');
    const eurPos = positions.find((p) => p.symbol.toUpperCase() === 'EURUSD');
    if (goldPos?.direction === 'LONG' && eurPos?.direction === 'LONG') {
      overlappingRisks.push('Correlated USD Short exposure: Long XAUUSD and Long EURUSD simultaneously escalate downside in a sudden USD rally.');
    }
  }

  // Diversification score inversely proportional to concentration
  const diversificationScore = Math.max(10, Math.min(100, 100 - Math.round(usdConcentrationPct * 0.7)));

  return {
    usdNetExposureLots: netUsdLots,
    usdConcentrationPct,
    preciousMetalsExposureLots: goldLots,
    equityBetaExposureLots: equityLots,
    currencyDiversificationScore: diversificationScore,
    overlappingRisks,
  };
}

