/**
 * FEF CORTEX — MACRO INTELLIGENCE ENGINE
 * Sprint 1C Clean-Room Implementation
 * 
 * Invariants:
 * 1. Orchestrates FRED connector, series analysis, yield curve, Fed policy, and XAUUSD evidence.
 * 2. Operates entirely in parallel with existing production infrastructure (zero disruption).
 * 3. Deterministic: calculations based on official statistics and basis points.
 * 4. Zero execution authority: exposes analytical evidence only.
 * 5. Strict fail-closed error handling.
 */

import { FEFDataHub } from '../../datahub/fef-datahub';
import { FredConnector } from '../connectors/fred-connector';
import { HistoricalMacroObservations, NormalizedMacroObservation } from '../types';
import { analyzeFedPolicy } from './fed-policy-analyzer';
import { analyzeMacroSeries } from './macro-series-analyzer';
import {
  FedPolicyIntelligence,
  InflationRegime,
  InflationRegimeIntelligence,
  LaborMarketIntelligence,
  LaborMarketState,
  MacroSeriesAnalysis,
  XauusdMacroEvidence,
  YieldCurveIntelligence,
} from './types';
import { assembleXauusdMacroEvidence } from './xauusd-macro-intelligence';
import { analyzeYieldCurve } from './yield-curve-analyzer';

export interface MacroIntelligenceEngineOptions {
  dataHub?: FEFDataHub;
  connector?: FredConnector;
  now?: () => number;
}

export class MacroIntelligenceEngine {
  private dataHub: FEFDataHub;
  private connector: FredConnector;
  private now: () => number;

  constructor(options: MacroIntelligenceEngineOptions = {}) {
    this.dataHub = options.dataHub || new FEFDataHub();
    this.connector = options.connector || new FredConnector();
    this.now = options.now || (() => Date.now());
  }

  /**
   * Fetch bounded history for a single series via DataHub (with single-flight deduplication and cache)
   */
  public async getSeriesHistory(
    seriesId: string,
    limit: number = 20
  ): Promise<NormalizedMacroObservation[]> {
    const normId = seriesId.trim().toUpperCase();

    const envelope = await this.dataHub.fetch<HistoricalMacroObservations>(
      {
        topic: 'macro',
        symbol: `${normId}:history`,
        provider: FredConnector.PROVIDER_ID,
      },
      async () => {
        return this.connector.fetchHistoricalObservations(normId, { limit });
      }
    );

    if (envelope && envelope.isAvailable && envelope.payload && Array.isArray(envelope.payload.observations)) {
      return envelope.payload.observations;
    }

    return [];
  }

  /**
   * Analyze a specific series using its bounded history
   */
  public async analyzeSeries(seriesId: string, limit: number = 20): Promise<MacroSeriesAnalysis> {
    const obs = await this.getSeriesHistory(seriesId, limit);
    return analyzeMacroSeries(obs);
  }

  /**
   * Generate Yield Curve Intelligence (10Y - 2Y Treasury spread)
   */
  public async getYieldCurveIntelligence(limit: number = 20): Promise<YieldCurveIntelligence> {
    const [dgs2Obs, dgs10Obs] = await Promise.all([
      this.getSeriesHistory('DGS2', limit),
      this.getSeriesHistory('DGS10', limit),
    ]);

    return analyzeYieldCurve(dgs2Obs, dgs10Obs);
  }

  /**
   * Generate Fed Policy Corridor Intelligence
   */
  public async getFedPolicyIntelligence(limit: number = 20): Promise<FedPolicyIntelligence> {
    const [uObs, lObs, dffObs] = await Promise.all([
      this.getSeriesHistory('DFEDTARU', limit),
      this.getSeriesHistory('DFEDTARL', limit),
      this.getSeriesHistory('DFF', limit),
    ]);

    return analyzeFedPolicy(uObs, lObs, dffObs);
  }

  /**
   * Generate deterministic Macro Evidence for XAUUSD (Gold)
   */
  public async getXauusdMacroEvidence(limit: number = 20): Promise<XauusdMacroEvidence> {
    const [realYieldAnalysis, nominal10YAnalysis, nominal2YAnalysis, breakevenAnalysis, yieldCurve, fedPolicy] =
      await Promise.all([
        this.analyzeSeries('DFII10', limit),
        this.analyzeSeries('DGS10', limit),
        this.analyzeSeries('DGS2', limit),
        this.analyzeSeries('T10YIE', limit),
        this.getYieldCurveIntelligence(limit),
        this.getFedPolicyIntelligence(limit),
      ]);

    return assembleXauusdMacroEvidence({
      realYieldAnalysis,
      nominal10YAnalysis,
      nominal2YAnalysis,
      breakevenAnalysis,
      yieldCurve,
      fedPolicy,
      hasDxyProvider: false, // DXY strictly absent in FRED connector, represented truthfully as unavailable
    });
  }

  /**
   * Generate Inflation Regime Intelligence (CPI & PCE YoY rates of change)
   */
  public async getInflationIntelligence(limit: number = 24): Promise<InflationRegimeIntelligence> {
    const [cpiObs, coreCpiObs, pceObs, corePceObs] = await Promise.all([
      this.getSeriesHistory('CPIAUCSL', limit),
      this.getSeriesHistory('CPILFESL', limit),
      this.getSeriesHistory('PCEPI', limit),
      this.getSeriesHistory('PCEPILFE', limit),
    ]);

    const computeYoY = (obs: NormalizedMacroObservation[]): number | undefined => {
      const valid = (obs || []).filter((o) => o && Number.isFinite(o.value) && o.value > 0);
      if (valid.length < 13) return undefined;
      const sorted = [...valid].sort((a, b) => a.observationTimestamp - b.observationTimestamp);
      const latest = sorted[sorted.length - 1];
      const priorYear = sorted[sorted.length - 13];
      return Math.round(((latest.value - priorYear.value) / priorYear.value) * 10000) / 100;
    };

    const headlineCpiYoY = computeYoY(cpiObs);
    const coreCpiYoY = computeYoY(coreCpiObs);
    const pceYoY = computeYoY(pceObs);
    const corePceYoY = computeYoY(corePceObs);

    const hasAny = headlineCpiYoY !== undefined || coreCpiYoY !== undefined || pceYoY !== undefined || corePceYoY !== undefined;
    const allDates = [...cpiObs, ...coreCpiObs, ...pceObs, ...corePceObs]
      .map((o) => o.observationDate)
      .filter((d) => Boolean(d) && d !== 'N/A')
      .sort();
    const latestDate = allDates.length > 0 ? allDates[allDates.length - 1] : 'N/A';

    let regime: InflationRegime = 'INSUFFICIENT_DATA';
    if (hasAny) {
      // Composite evaluation across official headline and core YoY inflation metrics
      // Official Fed long-run statutory target is 2.0% (target corridor 1.8% to 2.4%)
      const rates = [headlineCpiYoY, coreCpiYoY, pceYoY, corePceYoY].filter(
        (r): r is number => typeof r === 'number' && Number.isFinite(r)
      );
      const maxRate = Math.max(...rates);
      const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;

      if (maxRate > 3.0 || avgRate > 2.5) {
        regime = 'INFLATIONARY_EXPANSION'; // Elevated inflation above target corridor (e.g. CPI 3.71%, PCE 3.42%)
      } else if (maxRate < 1.8) {
        regime = 'DISINFLATION';
      } else if (avgRate >= 1.8 && avgRate <= 2.4) {
        regime = 'STABLE_TARGET'; // Anchored within statutory 2.0% target band
      } else if (avgRate > 2.4) {
        regime = 'INFLATIONARY_EXPANSION';
      } else {
        regime = 'DISINFLATION';
      }
    }

    return {
      name: 'U.S. Inflation Regime (FRED Official CPI / PCE)',
      headlineCpiYoY,
      coreCpiYoY,
      pceYoY,
      corePceYoY,
      regime,
      observationDate: latestDate,
      freshness: hasAny ? 'CURRENT' : 'UNAVAILABLE',
      confidence: hasAny ? 85 : 0,
      provider: 'FRED',
      classification: hasAny ? 'DERIVED_FROM_VERIFIED' : 'UNAVAILABLE',
      status: hasAny ? 'VALID' : 'INSUFFICIENT_DATA',
    };
  }

  /**
   * Generate Labor Market Intelligence (UNRATE & PAYEMS)
   */
  public async getLaborMarketIntelligence(limit: number = 24): Promise<LaborMarketIntelligence> {
    const [unrateObs, payemsObs] = await Promise.all([
      this.getSeriesHistory('UNRATE', limit),
      this.getSeriesHistory('PAYEMS', limit),
    ]);

    const validUnrate = (unrateObs || []).filter((o) => o && Number.isFinite(o.value));
    const sortedUnrate = [...validUnrate].sort((a, b) => a.observationTimestamp - b.observationTimestamp);
    const latestUnrate = sortedUnrate[sortedUnrate.length - 1];
    const prevUnrate = sortedUnrate.length >= 2 ? sortedUnrate[sortedUnrate.length - 2] : undefined;

    const unemploymentRate = latestUnrate?.value;
    const unemploymentChange =
      prevUnrate && latestUnrate ? Math.round((latestUnrate.value - prevUnrate.value) * 100) / 100 : undefined;

    const validPayems = (payemsObs || []).filter((o) => o && Number.isFinite(o.value));
    const sortedPayems = [...validPayems].sort((a, b) => a.observationTimestamp - b.observationTimestamp);
    const latestPayems = sortedPayems[sortedPayems.length - 1];
    const prevPayems = sortedPayems.length >= 2 ? sortedPayems[sortedPayems.length - 2] : undefined;

    const nonfarmPayrollsLatest = latestPayems?.value;
    const nonfarmPayrollsDelta =
      prevPayems && latestPayems ? Math.round((latestPayems.value - prevPayems.value) * 10) / 10 : undefined;

    const hasData = unemploymentRate !== undefined || nonfarmPayrollsLatest !== undefined;
    const observationDate = latestUnrate?.observationDate || latestPayems?.observationDate || 'N/A';

    let state: LaborMarketState = 'INSUFFICIENT_DATA';
    if (unemploymentRate !== undefined) {
      if (unemploymentRate < 4.2) {
        state = 'TIGHT';
      } else if (unemploymentRate > 4.8 || (unemploymentChange !== undefined && unemploymentChange >= 0.3)) {
        state = 'SOFTENING';
      } else {
        state = 'LOOSE';
      }
    }

    return {
      name: 'U.S. Labor Market Intelligence (FRED Official UNRATE / PAYEMS)',
      unemploymentRate,
      unemploymentChange,
      nonfarmPayrollsLatest,
      nonfarmPayrollsDelta,
      state,
      observationDate,
      freshness: hasData ? 'CURRENT' : 'UNAVAILABLE',
      confidence: hasData ? 85 : 0,
      provider: 'FRED',
      classification: hasData ? 'DERIVED_FROM_VERIFIED' : 'UNAVAILABLE',
      status: hasData ? 'VALID' : 'INSUFFICIENT_DATA',
    };
  }

  /**
   * Generate comprehensive macro intelligence bundle including individual sub-analyses.
   * Leverages DataHub single-flight deduplication and memory cache to prevent duplicate requests.
   */
  public async getDetailedMacroIntelligence(limit: number = 20): Promise<{
    xauusdMacro: XauusdMacroEvidence;
    yieldCurve: YieldCurveIntelligence;
    fedPolicy: FedPolicyIntelligence;
    tenYearYield: MacroSeriesAnalysis;
    twoYearYield: MacroSeriesAnalysis;
    realYield: MacroSeriesAnalysis;
    breakeven: MacroSeriesAnalysis;
    inflationRegime: InflationRegimeIntelligence;
    laborMarket: LaborMarketIntelligence;
  }> {
    const [
      realYieldAnalysis,
      nominal10YAnalysis,
      nominal2YAnalysis,
      breakevenAnalysis,
      yieldCurve,
      fedPolicy,
      inflationRegime,
      laborMarket,
    ] = await Promise.all([
      this.analyzeSeries('DFII10', limit),
      this.analyzeSeries('DGS10', limit),
      this.analyzeSeries('DGS2', limit),
      this.analyzeSeries('T10YIE', limit),
      this.getYieldCurveIntelligence(limit),
      this.getFedPolicyIntelligence(limit),
      this.getInflationIntelligence(24),
      this.getLaborMarketIntelligence(24),
    ]);

    const xauusdMacro = assembleXauusdMacroEvidence({
      realYieldAnalysis,
      nominal10YAnalysis,
      nominal2YAnalysis,
      breakevenAnalysis,
      yieldCurve,
      fedPolicy,
      hasDxyProvider: false,
    });

    return {
      xauusdMacro,
      yieldCurve,
      fedPolicy,
      tenYearYield: nominal10YAnalysis,
      twoYearYield: nominal2YAnalysis,
      realYield: realYieldAnalysis,
      breakeven: breakevenAnalysis,
      inflationRegime,
      laborMarket,
    };
  }
}

