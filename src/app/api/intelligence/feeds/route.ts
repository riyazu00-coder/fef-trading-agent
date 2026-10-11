/**
 * FEF CORTEX — LIVE INTELLIGENCE FEEDS API ROUTE
 * 
 * Centralized server-side route that refreshes and provides live multi-source
 * intelligence feeds (News, Macro, Calendar, Geopolitical, Sentiment)
 * to client-side agent decision pipelines.
 */

import { NextResponse } from 'next/server';
import { ensureProvidersRegistered } from '@/lib/providers/init-providers';
import { providerRegistry } from '@/lib/providers/provider-registry';
import { globalNewsEngine } from '@/lib/news/global-news-engine';
import { globalMacroEngine } from '@/lib/macro/global-macro-engine';
import { economicCalendarEngine } from '@/lib/calendar/economic-calendar-engine';
import { geopoliticalEngine } from '@/lib/geopolitical/geopolitical-engine';
import { marketSentimentEngine } from '@/lib/sentiment/market-sentiment-engine';
import { MacroIntelligenceEngine } from '@/lib/macro/intelligence/macro-intelligence-engine';
import { classifyMarketRegime, MarketRegimeAssessment } from '@/lib/regime/market-regime-engine';
import { buildCrossAssetMatrix, CrossAssetMatrix, TimeSeriesPoint } from '@/lib/cross-asset/cross-asset-engine';
import { calculateQuantMetrics, matchHistoricalAnalogues, QuantMetricsResult, HistoricalAnalogueResult } from '@/lib/quant/quant-engine';
import { evaluateDataSentinelAgent } from '@/lib/agents/specialists/specialist-agents';
import { LiveIntelligenceFeeds } from '@/lib/intelligence/feed-types';

export const dynamic = 'force-dynamic';

const macroIntelligenceEngine = new MacroIntelligenceEngine();

export async function GET() {
  try {
    ensureProvidersRegistered();

    let detailedMacro: any = null;

    // Concurrently refresh specialist intelligence engines including official MacroIntelligenceEngine
    const [newsRes, macroRes, eventsRes, sentimentRes, geoRes, detailedMacroRes] = await Promise.allSettled([
      globalNewsEngine.getLatestNews(),
      globalMacroEngine.getMacroIndicators(),
      economicCalendarEngine.getUpcomingEvents(48),
      marketSentimentEngine.refreshSentiments(),
      geopoliticalEngine.getGeopoliticalAlerts(),
      macroIntelligenceEngine.getDetailedMacroIntelligence(20).then((res) => {
        detailedMacro = res;
      }).catch(() => {
        detailedMacro = null;
      }),
    ]);

    const news = globalNewsEngine.getCachedNews();
    const macro = globalMacroEngine.getCachedIndicators();
    const events = economicCalendarEngine.getCachedUpcomingEvents(48);
    const alerts = geopoliticalEngine.getCachedAlerts();

    const sentimentKeys = ['BTCUSD', 'ETHUSD', 'XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USOIL', 'US100', 'US500'];
    const sentiment: Record<string, any> = {};
    for (const sym of sentimentKeys) {
      sentiment[sym] = marketSentimentEngine.getCachedSentiment(sym);
    }

    // 1. Provider Health & Data Sentinel Evaluation
    let providerHealthList: any[] = [];
    try {
      providerHealthList = await providerRegistry.getAllProviderHealth();
    } catch {
      providerHealthList = [];
    }

    const primaryBroker = providerRegistry.getPrimaryBroker();
    const isMt5Online = Boolean(primaryBroker && (primaryBroker as any).isConnected && (primaryBroker as any).isConnected());
    const activeProviders = providerHealthList.filter((p) => p.status === 'ONLINE').map((p) => p.name || p.providerId);
    const offlineProviders = providerHealthList.filter((p) => p.status !== 'ONLINE').map((p) => p.name || p.providerId);

    const sentinelResult = evaluateDataSentinelAgent({
      isMt5Online,
      activeProviders,
      offlineProviders,
      feedAgeMs: 500,
    });

    // 2. Deterministic Market Regime Evaluation for XAUUSD
    let regimeResult: MarketRegimeAssessment | null = null;
    try {
      const tenYearBp = detailedMacro?.tenYearYield?.change1Bp;
      const realYieldBp = detailedMacro?.realYield?.change1Bp;
      const breakevenBp = detailedMacro?.breakeven?.change1Bp;
      const fedState = detailedMacro?.fedPolicy?.policyState === 'RESTRICTIVE_CONTEXT'
        ? 'RESTRICTIVE_CONTEXT'
        : detailedMacro?.fedPolicy?.policyState === 'EASING_CONTEXT'
        ? 'EASING_CONTEXT'
        : detailedMacro?.fedPolicy?.policyState === 'STABLE_POLICY'
        ? 'STABLE_POLICY'
        : undefined;

      regimeResult = classifyMarketRegime({
        instrument: 'XAUUSD',
        // Verified candles absent in macro route: do NOT invent or hardcode ATR values
        tenYearYieldBpChange: tenYearBp,
        realYieldBpChange: realYieldBp,
        breakevenBpChange: breakevenBp,
        fedPolicyState: fedState,
      });
    } catch {
      regimeResult = null;
    }

    // 3. Deterministic Cross-Asset Matrix for XAUUSD
    let crossAssetResult: CrossAssetMatrix | null = null;
    try {
      // Map time series points from verified real yield observations if available
      const realYieldObs = await macroIntelligenceEngine.getSeriesHistory('DFII10', 15).catch(() => []);
      const nominal10YObs = await macroIntelligenceEngine.getSeriesHistory('DGS10', 15).catch(() => []);

      const realYieldSeries: TimeSeriesPoint[] = realYieldObs
        .filter((o) => typeof o.value === 'number' && !isNaN(o.value))
        .map((o) => ({
          date: o.observationDate,
          timestamp: o.observationTimestamp,
          value: o.value,
        }));

      const tenYearSeries: TimeSeriesPoint[] = nominal10YObs
        .filter((o) => typeof o.value === 'number' && !isNaN(o.value))
        .map((o) => ({
          date: o.observationDate,
          timestamp: o.observationTimestamp,
          value: o.value,
        }));

      // Zero synthetic market-price series: aligned live series absent without verified gold candle stream
      crossAssetResult = buildCrossAssetMatrix({
        goldSeries: [],
        realYieldSeries: realYieldSeries.length >= 5 ? realYieldSeries : undefined,
        tenYearYieldSeries: tenYearSeries.length >= 5 ? tenYearSeries : undefined,
        hasVerifiedDxy: false, // DXY strictly absent in FRED connector, truthfully UNAVAILABLE
      });
    } catch {
      crossAssetResult = null;
    }

    // 4. Quant Foundation & Historical Analogue Evaluation
    // Verified candles absent in macro feeds route: fail closed without synthetic mock bars
    const quantResult: { metrics: QuantMetricsResult; analogue: HistoricalAnalogueResult } | null = null;

    const payload: LiveIntelligenceFeeds = {
      timestamp: new Date().toISOString(),
      news,
      macro,
      events,
      alerts,
      sentiment,
      xauusdMacro: detailedMacro?.xauusdMacro || null,
      regime: regimeResult,
      crossAsset: crossAssetResult,
      quant: quantResult,
      sentinel: sentinelResult,
      macroDetails: detailedMacro ? {
        yieldCurve: detailedMacro.yieldCurve,
        fedPolicy: detailedMacro.fedPolicy,
        tenYearYield: detailedMacro.tenYearYield,
        twoYearYield: detailedMacro.twoYearYield,
        realYield: detailedMacro.realYield,
        breakeven: detailedMacro.breakeven,
      } : null,
      providerHealth: providerHealthList,
    };

    return NextResponse.json({
      success: true,
      ...payload,
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: 'Failed to retrieve intelligence feeds',
      details: err?.message || 'Unknown error',
    }, { status: 500 });
  }
}

