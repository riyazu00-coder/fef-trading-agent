/**
 * FEF CORTEX — 24/7 BACKGROUND AUTONOMOUS WORKER (V1.2.1)
 * 
 * Runs continuous server-side market surveillance across the multi-asset universe:
 * 1. Periodic heartbeat & provider health synchronization
 * 2. Multi-timeframe structure and volume-profile evaluation (M5, M15, M30, H1, H4, D1)
 * 3. News, Macro, Calendar, Geopolitical, and Sentiment ingestion
 * 4. Autonomous Opportunity Radar evaluation with deduplicated alerts
 * 5. Persists real-time snapshot to disk so browser clients instantly receive warm state
 * 6. Execution invariants strictly locked: ORDERS SENT = 0.
 */

import { providerRegistry } from '../src/lib/providers/provider-registry';
import { generateAssetIntelligence, AssetIntelligenceProfile, CandleBundle } from '../src/lib/agents/multi-asset-pipeline';
import { evaluateOpportunityRadar, RadarOpportunityItem } from '../src/lib/radar/opportunity-radar-engine';
import { evaluateRadarTransitions, RadarNotification } from '../src/lib/radar/radar-notifications';
import { globalNewsEngine } from '../src/lib/news/global-news-engine';
import { globalMacroEngine } from '../src/lib/macro/global-macro-engine';
import { economicCalendarEngine } from '../src/lib/calendar/economic-calendar-engine';
import { geopoliticalEngine } from '../src/lib/geopolitical/geopolitical-engine';
import { marketSentimentEngine } from '../src/lib/sentiment/market-sentiment-engine';
import { workerStateManager, AssetSnapshotSummary } from '../src/lib/worker/worker-state';
import { MARKET_REGISTRY } from '../src/lib/registry/market-registry';
import { LiveMarketAsset } from '../src/lib/providers/real-market-api';
import { candidateIntakeCoordinator } from '../src/lib/telegram/candidate-intake-coordinator';
import { CANONICAL_26_UNIVERSE, LocalMarketDataProvider } from '../src/lib/providers/local-market-data-provider';

const MONITORED_SYMBOLS = [...CANONICAL_26_UNIVERSE];

export class BackgroundAutonomousWorker {
  private isRunning: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private cycleCount: number = 0;
  private isCycleInProgress: boolean = false;

  public start(cycleIntervalMs: number = 15_000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[FEF CORTEX WORKER] Autonomous background surveillance worker initialized. Cycle interval: ${cycleIntervalMs}ms`);

    this.runCycle();
    this.intervalTimer = setInterval(() => {
      this.runCycle();
    }, cycleIntervalMs);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.isRunning = false;
    console.log('[FEF CORTEX WORKER] Background surveillance worker stopped.');
  }

  public async runCycle(): Promise<void> {
    if (this.isCycleInProgress) return;
    this.isCycleInProgress = true;
    this.cycleCount++;
    const now = new Date();
    const iso = now.toISOString();

    try {
      // 1. Ingest / Refresh Live Feeds (Non-blocking fail-open)
      await Promise.allSettled([
        globalNewsEngine.refreshNews(),
        globalMacroEngine.refreshIndicators(),
        economicCalendarEngine.refreshCalendar(),
        geopoliticalEngine.refreshAlerts(),
        marketSentimentEngine.refreshSentiments(),
      ]);

      // 2. Audit Provider Health
      const healthReports = await providerRegistry.getAllProviderHealth();
      const healthyCount = healthReports.filter((h) => h.status === 'HEALTHY').length;

      // 3. Assemble Canonical Intelligence per Asset
      const profiles: Record<string, AssetIntelligenceProfile> = {};
      const snapshots: Record<string, AssetSnapshotSummary> = {};
      const marketQuotes: Record<string, { price: number; change24h: number }> = {};

      let localProvider: LocalMarketDataProvider | null = null;
      try {
        localProvider = new LocalMarketDataProvider();
      } catch {
        localProvider = null;
      }

      for (const sym of MONITORED_SYMBOLS) {
        let profile: AssetIntelligenceProfile | null = null;
        let quotePrice: number = 0;
        let quoteChange: number = 0;
        let authority: string = 'REFERENCE_FEED';

        if (localProvider) {
          try {
            profile = await localProvider.assembleLocalAssetIntelligence(sym, 'M15');
            if (profile) {
              quotePrice = profile.currentPrice;
              authority = 'Exness MT5 Broker (Local SQLite)';
            }
          } catch {
            profile = null;
          }
        }

        if (!profile) {
          const def = MARKET_REGISTRY[sym];
          const primaryProvider = providerRegistry.getPrimaryMarketProvider();
          let quote = primaryProvider ? await primaryProvider.getQuote(sym) : null;

          const livePrice = quote?.mid || def?.basePrice || 0;
          const liveChange = quote?.changePercent24h || def?.typicalDailyChangePct || 0;
          quotePrice = livePrice;
          quoteChange = liveChange;
          authority = quote ? quote.providerId : 'REFERENCE_FEED';

          const liveAsset: LiveMarketAsset = {
            symbol: sym,
            name: def?.displayName || sym,
            price: livePrice,
            bid: quote?.bid || livePrice,
            ask: quote?.ask || livePrice,
            spread: quote?.spread || def?.typicalSpread || 0,
            change24h: liveChange,
            high24h: quote?.high24h || livePrice,
            low24h: quote?.low24h || livePrice,
            volume: '$24.8B',
            sparkline: '0,20 140,20',
            source: quote ? quote.providerId : (def?.feedProvider || 'Market Feed'),
            lastUpdated: iso,
            category: def?.category || 'FOREX',
            feedStatus: quote ? 'LIVE' : 'DATA LIMITED',
            classification: quote ? quote.classification : 'DATA LIMITED',
          };

          // Synthesize Multi-Timeframe Intelligence Profile
          profile = generateAssetIntelligence(
            sym,
            liveAsset,
            'M15',
            undefined, // Candles are evaluated if connected or retrieved from broker/independent provider
            quote ? quote.classification : 'UNAVAILABLE',
            quote ? quote.providerId : 'NONE',
            now
          );
        }

        profiles[sym] = profile;

        marketQuotes[sym] = {
          price: quotePrice,
          change24h: quoteChange,
        };

        snapshots[sym] = {
          symbol: sym,
          timestamp: iso,
          marketDataAuthority: authority,
          decisionPosture: profile.decisionPosture,
          directionalBias: profile.directionalBias,
          confidence: profile.confidence,
          setupQuality: profile.setupQuality,
          entryZone: profile.entryZone,
          stopLoss: profile.stopLoss,
          tp1: profile.tp1,
          rr: profile.rr,
          invalidation: profile.invalidation,
          verifiedAgentCount: profile.verifiedAgentCount || 0,
          dataLimitedCount: profile.limitedAgentCount || 0,
          actionabilityState: profile.actionabilityState,
        };
      }

      // 4. Run Opportunity Radar Engine
      const radarOpportunities: RadarOpportunityItem[] = evaluateOpportunityRadar(
        profiles,
        marketQuotes,
        now
      );

      // 5. Evaluate Radar Transitions with Deduplication
      const newAlerts: RadarNotification[] = evaluateRadarTransitions(radarOpportunities);

      const transitions = newAlerts.map((a) => ({
        symbol: a.symbol,
        fromState: (a.previousState as string) || 'UNKNOWN',
        toState: a.newState as string,
        timestamp: a.timestamp,
        priority: a.priority,
      }));

      const alertRecords = newAlerts.map((a) => ({
        id: a.id,
        symbol: a.symbol,
        title: a.title,
        timestamp: a.timestamp,
        priority: a.priority,
      }));

      // 5b. Evaluate Candidate Setups for Telegram Signal Eligibility & Dispatch
      await candidateIntakeCoordinator.evaluateAndDispatchCandidates(profiles, {
        source: 'AUTONOMOUS_WORKER',
        cycleCount: this.cycleCount,
        timestamp: iso,
      });

      // 6. Persist Cycle Snapshots
      workerStateManager.recordCycle(
        this.cycleCount,
        healthyCount,
        healthReports.length,
        snapshots,
        transitions,
        alertRecords
      );

      // 7. Structured Console Status
      if (this.cycleCount % 4 === 1 || newAlerts.length > 0) {
        console.log(
          `[FEF CORTEX WORKER] Cycle #${this.cycleCount} @ ${iso} — Providers: ${healthyCount}/${healthReports.length} healthy. Monitored: ${MONITORED_SYMBOLS.length} assets. New Transitions: ${newAlerts.length}. Active Radar Candidates: ${radarOpportunities.length}.`
        );
      }
    } catch (err) {
      console.warn('[FEF CORTEX WORKER] Surveillance cycle error:', err);
    } finally {
      this.isCycleInProgress = false;
    }
  }
}

export const fefBackgroundWorker = new BackgroundAutonomousWorker();

// Auto-run if executed directly via CLI
if (require.main === module) {
  fefBackgroundWorker.start(15_000);
}
