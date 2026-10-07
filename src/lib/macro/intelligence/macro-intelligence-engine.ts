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
import { FedPolicyIntelligence, MacroSeriesAnalysis, XauusdMacroEvidence, YieldCurveIntelligence } from './types';
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
  }> {
    const [realYieldAnalysis, nominal10YAnalysis, nominal2YAnalysis, breakevenAnalysis, yieldCurve, fedPolicy] =
      await Promise.all([
        this.analyzeSeries('DFII10', limit),
        this.analyzeSeries('DGS10', limit),
        this.analyzeSeries('DGS2', limit),
        this.analyzeSeries('T10YIE', limit),
        this.getYieldCurveIntelligence(limit),
        this.getFedPolicyIntelligence(limit),
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
    };
  }
}

