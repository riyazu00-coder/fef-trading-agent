export interface DeltaChangeEvent {
  id: string;
  timePrevious: string;
  timeCurrent: string;
  previousVerdict: string;
  currentVerdict: string;
  previousConsensus: number;
  currentConsensus: number;
  marketCatalysts: string[];
  agentShifts: {
    agent: string;
    from: string;
    to: string;
    reason: string;
  }[];
  criticalTakeaway: string;
}

export const HISTORICAL_CHANGES: DeltaChangeEvent[] = [
  {
    id: 'chg-3',
    timePrevious: '17:10:00',
    timeCurrent: '18:15:00',
    previousVerdict: 'WAIT',
    currentVerdict: 'WATCH BUY',
    previousConsensus: 51,
    currentConsensus: 74,
    marketCatalysts: [
      'XAUUSD swept sell-side liquidity at $2,341.20 and formed M15 CHOCH',
      'DXY rejected 104.40 resistance ceiling and fell -0.36%',
      'US 10-Year yield dropped 6 bps from 4.27% to 4.214%',
      'Silver (XAGUSD) broke intraday high (+1.42%) confirming SMT divergence'
    ],
    agentShifts: [
      {
        agent: 'Technical Agent',
        from: 'NEUTRAL (Range-bound)',
        to: 'BULLISH (+0.82)',
        reason: 'Confirmed liquidity sweep and M15 displacement into H1 FVG.'
      },
      {
        agent: 'Correlation Agent',
        from: 'NEUTRAL (Uncertain)',
        to: 'BULLISH (+0.77)',
        reason: 'Inverse Dollar rejection and Silver relative strength alignment.'
      },
      {
        agent: 'Macro Agent',
        from: 'NEUTRAL (48%)',
        to: 'BULLISH (+0.61)',
        reason: 'Yield curve easing and real yield drop softening monetary drag.'
      },
      {
        agent: 'Risk Guardian',
        from: 'STANDBY',
        to: 'RESTRICTED (0.50% max risk)',
        reason: 'PCE event proximity guard activated within 2-hour window.'
      }
    ],
    criticalTakeaway: 'DXY breakdown and M15 liquidity sweep shifted multi-agent consensus from 51% to 74% net bullish.'
  },
  {
    id: 'chg-2',
    timePrevious: '15:30:00',
    timeCurrent: '17:10:00',
    previousVerdict: 'NO TRADE',
    currentVerdict: 'WAIT',
    previousConsensus: 38,
    currentConsensus: 51,
    marketCatalysts: [
      'Asian session compression held without direction',
      'London session open injected volatility and tested session lows'
    ],
    agentShifts: [
      {
        agent: 'Technical Agent',
        from: 'BEARISH (-0.35)',
        to: 'NEUTRAL (0.00)',
        reason: 'Asian lows held, awaiting liquidity sweep.'
      }
    ],
    criticalTakeaway: 'London open transition initiated liquidity exploration.'
  }
];
