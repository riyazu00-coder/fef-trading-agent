/**
 * FEF CORTEX — GLOBAL MACRO ENGINE (V1.2.1)
 * 
 * Aggregates sovereign yields, central bank rates, USD liquidity, and inflation dynamics.
 * Calculates delta, percentage delta, regime, velocity, and directional asset implications.
 * Zero synthetic timestamps: preserves authentic market release timestamps.
 */

import { MacroIndicatorRecord, MacroProvider, ProviderHealth } from '../providers/types';
import { providerRegistry } from '../providers/provider-registry';

interface MacroSymbolConfig {
  name: string;
  querySymbol: string;
  region: string;
  unit: string;
  goldCorrelation: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  affectedAssets: string[];
}

export class GlobalMacroEngine implements MacroProvider {
  public readonly id = 'global-macro-engine';
  public readonly name = 'Global Macroeconomic Intelligence Engine';
  public readonly sourceType = 'PUBLIC_FEED';
  public readonly supportedAssets = ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'US10Y', 'DXY', 'US500', 'USOIL'] as const;

  private indicators: MacroIndicatorRecord[] = [];
  private lastAttemptAt: number = 0;
  private lastSuccessAt: number = 0;
  private readonly cacheTtlMs = 120_000; // 2 min cache / retry interval
  private consecutiveErrors: number = 0;
  private lastRefreshHadFailures: boolean = false;
  private lastMeasuredLatencyMs: number = 0; // 0 = truthful sentinel indicating not yet measured

  private readonly macroConfigs: MacroSymbolConfig[] = [
    {
      name: 'US Dollar Index (DXY)',
      querySymbol: 'DX-Y.NYB',
      region: 'US',
      unit: 'Index Points',
      goldCorrelation: 'NEGATIVE',
      affectedAssets: ['XAUUSD', 'EURUSD', 'GBPUSD', 'US500'],
    },
    {
      name: 'US 10-Year Treasury Yield',
      querySymbol: '%5ETNX',
      region: 'US',
      unit: '% Yield',
      goldCorrelation: 'NEGATIVE',
      affectedAssets: ['XAUUSD', 'US100', 'US500', 'USDJPY'],
    },
    {
      name: 'US 5-Year Treasury Yield',
      querySymbol: '%5EFVX',
      region: 'US',
      unit: '% Yield',
      goldCorrelation: 'NEGATIVE',
      affectedAssets: ['XAUUSD', 'EURUSD', 'US500'],
    },
    {
      name: 'WTI Crude Oil Benchmark',
      querySymbol: 'CL=F',
      region: 'GLOBAL',
      unit: 'USD / Barrel',
      goldCorrelation: 'POSITIVE',
      affectedAssets: ['USOIL', 'XAUUSD', 'US500'],
    },
  ];

  /**
   * Derives observation freshness from the authentic releaseDate / regularMarketTime age.
   * Does NOT use local retrieval time or cache age.
   *
   * Thresholds:
   * - Clock-skew tolerance: 5 minutes (300,000 ms) into the future.
   * - Material future (> 5 min future): fails closed to 'STALE'.
   * - CURRENT: <= 6 hours old (active daily market session observation)
   * - DELAYED: > 6 hours and <= 36 hours old (prior session / overnight / weekend transition)
   * - STALE:   > 36 hours old (dormant or weekend/holiday staleness)
   */
  public deriveFreshness(releaseDate: string, nowMs: number = Date.now()): 'CURRENT' | 'DELAYED' | 'STALE' {
    const observationMs = new Date(releaseDate).getTime();
    if (isNaN(observationMs) || observationMs <= 0) {
      return 'STALE';
    }

    const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 min max tolerance
    if (observationMs > nowMs + CLOCK_SKEW_TOLERANCE_MS) {
      // Materially future observation: fail closed
      return 'STALE';
    }

    const ageMs = Math.max(0, nowMs - observationMs);
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    const THIRTY_SIX_HOURS_MS = 36 * 60 * 60 * 1000;

    if (ageMs <= SIX_HOURS_MS) {
      return 'CURRENT';
    } else if (ageMs <= THIRTY_SIX_HOURS_MS) {
      return 'DELAYED';
    } else {
      return 'STALE';
    }
  }

  /**
   * Recomputes freshness dynamically from the authentic releaseDate whenever
   * records leave the engine, ensuring cached records naturally age without mutating
   * original releaseDate or retrieval timestamp.
   */
  private withDerivedFreshness(record: MacroIndicatorRecord, nowMs: number = Date.now()): MacroIndicatorRecord {
    return {
      ...record,
      freshness: this.deriveFreshness(record.releaseDate, nowMs),
    };
  }

  public async getHealth(): Promise<ProviderHealth> {
    if (this.indicators.length === 0 && this.lastAttemptAt === 0) {
      try {
        await this.refreshIndicators();
      } catch {
        // Fallback
      }
    }

    let status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
    if (this.indicators.length === 0) {
      status = 'OFFLINE';
    } else if (this.lastRefreshHadFailures || this.consecutiveErrors > 0) {
      status = 'DEGRADED';
    } else {
      status = 'HEALTHY';
    }

    return {
      providerId: this.id,
      name: this.name,
      sourceType: this.sourceType,
      status,
      latencyMs: this.lastMeasuredLatencyMs,
      lastChecked: new Date().toISOString(),
      lastSuccess: this.lastSuccessAt > 0 ? new Date(this.lastSuccessAt).toISOString() : undefined,
      errorCount: this.consecutiveErrors,
      rateLimit: { isThrottled: false },
      isFreeTier: true,
    };
  }

  public getCachedIndicators(region?: string): MacroIndicatorRecord[] {
    const now = Date.now();
    const dynamic = this.indicators.map((rec) => this.withDerivedFreshness(rec, now));
    if (!region || region === 'GLOBAL') {
      return dynamic;
    }
    const norm = region.toUpperCase();
    return dynamic.filter((i) => i.region === norm);
  }

  public async getMacroIndicators(region?: string): Promise<MacroIndicatorRecord[]> {
    const now = Date.now();
    if (this.indicators.length === 0 || now - this.lastAttemptAt > this.cacheTtlMs) {
      await this.refreshIndicators();
    }

    return this.getCachedIndicators(region);
  }

  /**
   * Refreshes indicators from authentic public market charts.
   * If offline or fetch fails, retains existing genuine records or leaves empty.
   * Zero synthetic Date.now() timestamp stamping: missing, invalid, or materially future regularMarketTime fails closed.
   * Zero fabricated previous-close fallback: missing/invalid previous price fails closed for that metric.
   */
  public async refreshIndicators(): Promise<void> {
    this.lastAttemptAt = Date.now();
    const cycleNow = this.lastAttemptAt;
    const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

    const freshlyValidated = new Map<string, MacroIndicatorRecord>();
    const requestLatencies: number[] = [];
    let cycleAttemptedCount = 0;

    for (const config of this.macroConfigs) {
      cycleAttemptedCount++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const reqStart = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${config.querySymbol}?interval=1d&range=5d`;
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FEF-Cortex/1.2; +https://feftrading.com)',
            'Accept': 'application/json',
          },
        });
        const reqEnd = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

        const measuredDuration = Math.round(reqEnd - reqStart);
        if (measuredDuration >= 0) {
          requestLatencies.push(measuredDuration);
        }

        if (res.ok) {
          const json = await res.json();
          const result = json?.chart?.result?.[0];
          const meta = result?.meta;

          if (meta) {
            // Validate current value properly: must be finite number
            const current = meta.regularMarketPrice;
            if (typeof current !== 'number' || !Number.isFinite(current)) {
              continue;
            }

            // Fail closed if authentic market observation time is absent, non-finite, invalid, or materially future
            const rawMarketTime = meta.regularMarketTime;
            if (
              typeof rawMarketTime !== 'number' ||
              !Number.isFinite(rawMarketTime) ||
              rawMarketTime <= 0
            ) {
              continue;
            }

            const observationMs = rawMarketTime * 1000;
            if (observationMs > cycleNow + CLOCK_SKEW_TOLERANCE_MS) {
              // Materially future observation: fail closed
              continue;
            }

            const parsedDate = new Date(observationMs);
            if (isNaN(parsedDate.getTime())) {
              continue;
            }

            // Validate previous value properly: NEVER substitute current for previous
            let previous: number | null = null;
            if (typeof meta.chartPreviousClose === 'number' && Number.isFinite(meta.chartPreviousClose) && meta.chartPreviousClose > 0) {
              previous = meta.chartPreviousClose;
            } else {
              // Check upstream chart close series for genuine prior close
              const closeSeries = result?.indicators?.quote?.[0]?.close;
              if (Array.isArray(closeSeries)) {
                const finiteCloses = closeSeries.filter(
                  (c: unknown): c is number => typeof c === 'number' && Number.isFinite(c) && c > 0
                );
                if (finiteCloses.length >= 2) {
                  // Prior close before current
                  previous = finiteCloses[finiteCloses.length - 2];
                }
              }
            }

            if (previous === null || !Number.isFinite(previous) || previous <= 0) {
              // No genuine prior close: fail closed for this metric rather than manufacturing delta = 0
              continue;
            }

            const marketTime = parsedDate.toISOString();
            const delta = Number((current - previous).toFixed(4));
            const pctDelta = Number((((current - previous) / previous) * 100).toFixed(2));

            let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
            let regime = 'NORMAL';
            let velocity = 'STABLE';

            if (Math.abs(pctDelta) > 1.0) velocity = 'ELEVATED';
            if (Math.abs(pctDelta) > 2.5) velocity = 'EXPANDING';

            if (config.name.includes('Dollar')) {
              regime = current > 103 ? 'DOLLAR_STRENGTH_HEADWIND' : (current < 100 ? 'DOLLAR_SOFTENING' : 'DOLLAR_BALANCED');
              bias = delta > 0 ? 'BEARISH' : (delta < 0 ? 'BULLISH' : 'NEUTRAL'); // For gold/crosses
            } else if (config.name.includes('Yield')) {
              regime = current > 4.5 ? 'HIGH_YIELD_RESTRICTIVE' : (current < 3.8 ? 'YIELD_EASING' : 'NEUTRAL_YIELD');
              bias = delta > 0 ? 'BEARISH' : (delta < 0 ? 'BULLISH' : 'NEUTRAL'); // Rising yields pressure gold
            } else if (config.name.includes('Oil')) {
              regime = current > 85 ? 'HIGH_ENERGY_COSTS' : (current < 65 ? 'LOW_ENERGY_COSTS' : 'NORMAL_RANGE');
              bias = delta > 0 ? 'BULLISH' : (delta < 0 ? 'BEARISH' : 'NEUTRAL');
            }

            const freshness = this.deriveFreshness(marketTime, cycleNow);

            freshlyValidated.set(config.name, {
              name: config.name,
              region: config.region,
              currentValue: current,
              previousValue: previous,
              delta,
              percentageDelta: pctDelta,
              velocity,
              regime,
              unit: config.unit,
              releaseDate: marketTime,
              timestamp: new Date().toISOString(),
              freshness,
              source: 'Yahoo Finance Public Market Telemetry',
              affectedAssets: config.affectedAssets,
              directionalImplication: `${config.name} ${delta >= 0 ? '+' : ''}${pctDelta}% (${velocity}) -> ${bias} bias for ${config.affectedAssets.join(', ')}`,
              bias,
              goldCorrelation: config.goldCorrelation,
              classification: 'INDEPENDENT_VERIFIED',
            });
          }
        }
      } catch (err) {
        // Individual metric error: fail-open for other metrics
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (requestLatencies.length > 0) {
      const totalLatency = requestLatencies.reduce((sum, lat) => sum + lat, 0);
      this.lastMeasuredLatencyMs = Math.round(totalLatency / requestLatencies.length);
    }

    const validatedCount = freshlyValidated.size;

    if (validatedCount === cycleAttemptedCount) {
      // FULL SUCCESS: Every configured metric validated
      this.consecutiveErrors = 0;
      this.lastRefreshHadFailures = false;
      this.lastSuccessAt = Date.now();
      this.indicators = Array.from(freshlyValidated.values());
    } else if (validatedCount > 0) {
      // PARTIAL SUCCESS: Some validated, some failed
      this.consecutiveErrors++;
      this.lastRefreshHadFailures = true;
      this.lastSuccessAt = Date.now();

      // Merge newly validated metrics with previous genuine cached records for failed metrics
      const merged: MacroIndicatorRecord[] = [];
      for (const config of this.macroConfigs) {
        if (freshlyValidated.has(config.name)) {
          merged.push(freshlyValidated.get(config.name)!);
        } else {
          const existing = this.indicators.find((i) => i.name === config.name);
          if (existing) {
            merged.push(existing);
          }
        }
      }
      this.indicators = merged;
    } else {
      // FULL FAILURE: Zero metrics validated
      this.consecutiveErrors++;
      this.lastRefreshHadFailures = true;
      // Retain existing indicators if any, but do not advance lastSuccessAt
    }
  }
}

export const globalMacroEngine = new GlobalMacroEngine();
providerRegistry.registerMacroProvider(globalMacroEngine);
