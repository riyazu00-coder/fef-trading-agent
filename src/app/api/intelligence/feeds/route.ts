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
import { buildCrossAssetMatrix, buildCrossAssetMatrixFromCandles, CrossAssetMatrix, TimeSeriesPoint } from '@/lib/cross-asset/cross-asset-engine';
import { calculateQuantMetrics, matchHistoricalAnalogues, QuantMetricsResult, HistoricalAnalogueResult } from '@/lib/quant/quant-engine';
import { evaluateDataSentinelAgent } from '@/lib/agents/specialists/specialist-agents';
import { LiveIntelligenceFeeds } from '@/lib/intelligence/feed-types';
import { CftcCotProvider } from '@/lib/cot/cftc-cot-provider';
import { CentralBankProvider } from '@/lib/central-banks/central-bank-provider';
import { calculateCurrencyStrengthMatrix, calculateCurrencyStrengthFromCandles } from '@/lib/cross-asset/currency-strength-calculator';
import { fetchBatchBrokerCandles } from '@/lib/candles/broker-candle-service';
import { buildVerifiedLeadLagEnvelope, CANONICAL_LEAD_LAG_PAIRS } from '@/lib/cross-asset/lead-lag-engine';
import { fetchLiveMarketPrices } from '@/lib/providers/real-market-api';

export const dynamic = 'force-dynamic';

const macroIntelligenceEngine = new MacroIntelligenceEngine();

export async function GET(req: Request) {
  try {
    ensureProvidersRegistered();

    let detailedMacro: any = null;
    let cotReports: any = null;
    let centralBanks: any = null;

    let targetSymbol = 'XAUUSD';
    try {
      if (req && req.url) {
        const u = new URL(req.url);
        const s = u.searchParams.get('symbol');
        if (s) targetSymbol = s.toUpperCase();
      }
    } catch {}

    const batchSymbols = Array.from(new Set([
      'XAUUSD', 'XAGUSD', 'USOIL', 'US100', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', targetSymbol
    ]));

    // Concurrently refresh specialist intelligence engines including official MacroIntelligenceEngine, COT, and Central Banks
    const [newsRes, macroRes, eventsRes, sentimentRes, geoRes, detailedMacroRes, cotRes, cbRes, brokerCandlesRes] = await Promise.allSettled([
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
      CftcCotProvider.getInstance().getAllCotReports().then((res) => {
        cotReports = res;
      }).catch(() => {
        cotReports = null;
      }),
      CentralBankProvider.getInstance().getCentralBankPolicyIntelligence().then((res) => {
        centralBanks = res;
      }).catch(() => {
        centralBanks = null;
      }),
      fetchBatchBrokerCandles(batchSymbols, 'H1').catch(() => ({})),
    ]);

    const brokerCandlesSnapshot: Record<string, any> =
      brokerCandlesRes.status === 'fulfilled' ? brokerCandlesRes.value : {};

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
      isReferenceLive: true,
      priceAuthority: isMt5Online ? 'MT5_BROKER' : 'REFERENCE_MARKET',
      priceAuthorityStatus: 'LIVE',
      activeProviders: activeProviders.length > 0 ? activeProviders : ['Independent Reference Feeds'],
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

    // 3. Deterministic Cross-Asset Matrix for XAUUSD from Verified Candles
    let crossAssetResult: CrossAssetMatrix | null = null;
    try {
      const goldCandles = brokerCandlesSnapshot['XAUUSD']?.payload?.candles || [];
      const silverCandles = brokerCandlesSnapshot['XAGUSD']?.payload?.candles || [];
      const oilCandles = brokerCandlesSnapshot['USOIL']?.payload?.candles || [];
      const equityCandles = brokerCandlesSnapshot['US100']?.payload?.candles || [];

      if (goldCandles.length >= 15) {
        const matrixEnv = buildCrossAssetMatrixFromCandles(
          goldCandles,
          {
            silverCandles: silverCandles.length >= 15 ? silverCandles : undefined,
            oilCandles: oilCandles.length >= 15 ? oilCandles : undefined,
            equityCandles: equityCandles.length >= 15 ? equityCandles : undefined,
          },
          true
        );
        crossAssetResult = matrixEnv.payload;
      }
    } catch {
      crossAssetResult = null;
    }

    // 4. Quant Foundation & Historical Analogue Evaluation
    let quantResult: { metrics: QuantMetricsResult; analogue: HistoricalAnalogueResult } | null = null;
    try {
      const targetCandles = brokerCandlesSnapshot[targetSymbol]?.payload?.candles || [];
      if (targetCandles.length >= 15) {
        const metrics = calculateQuantMetrics(targetCandles);
        const analogue = matchHistoricalAnalogues(targetCandles);
        quantResult = { metrics, analogue };
      }
    } catch {
      quantResult = null;
    }

    // 5. Currency Strength Matrix from Synchronized Forex Candles
    let currencyStrength: any = null;
    try {
      const fxPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];
      const fxCandles: Record<string, any[]> = {};
      for (const p of fxPairs) {
        const c = brokerCandlesSnapshot[p]?.payload?.candles;
        if (Array.isArray(c) && c.length >= 2) {
          fxCandles[p] = c;
        }
      }
      if (Object.keys(fxCandles).length >= 4) {
        currencyStrength = calculateCurrencyStrengthFromCandles(fxCandles, 'H1');
      } else {
        const liveMarketPrices: Record<string, any> = await fetchLiveMarketPrices().catch(() => ({}));
        const forexQuotes: Record<string, any> = {};
        for (const p of fxPairs) {
          const lp = liveMarketPrices[p];
          if (lp && typeof lp.change24h === 'number') {
            forexQuotes[p] = { symbol: p, price: lp.price, change24h: lp.change24h };
          }
        }
        currencyStrength =
          Object.keys(forexQuotes).length >= 4 ? calculateCurrencyStrengthMatrix(forexQuotes) : null;
      }
    } catch {
      currencyStrength = null;
    }

    // 6. Lead/Lag Analytics from Synchronized Series
    let leadLagResult: any = null;
    try {
      const pair = CANONICAL_LEAD_LAG_PAIRS[targetSymbol];
      if (pair) {
        const leadCandles = brokerCandlesSnapshot[pair.leader]?.payload?.candles || [];
        const follCandles = brokerCandlesSnapshot[pair.follower]?.payload?.candles || [];
        if (leadCandles.length >= 20 && follCandles.length >= 20) {
          leadLagResult = buildVerifiedLeadLagEnvelope(leadCandles, follCandles, pair.leader, pair.follower, 'H1');
        }
      }
    } catch {
      leadLagResult = null;
    }

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
        inflationRegime: detailedMacro.inflationRegime,
        laborMarket: detailedMacro.laborMarket,
      } : null,
      cotReports,
      centralBanks,
      currencyStrength,
      leadLag: leadLagResult,
      brokerCandles: brokerCandlesSnapshot,
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

