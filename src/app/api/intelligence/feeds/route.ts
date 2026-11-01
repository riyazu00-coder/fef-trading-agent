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
import { getVerifiedCandles, aggregateCandlesToH4 } from '@/lib/candles/independent-candle-service';
import { geminiVisionProvider } from '@/lib/vision/gemini-vision-provider';
import { VisionOutputContract } from '@/lib/vision/vision-validator';
import { createFailedClosedEnvelope, VerifiedEvidenceEnvelope } from '@/lib/providers/canonical-envelope';
import { analyzeMarketStructure } from '@/lib/market/market-structure-engine';
import { OHLCCandle } from '@/lib/market/canonical-market-snapshot';

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

    // Helper: obtain broker candles if available, or fall back seamlessly to verified independent reference candles
    const getCandlesForSymbol = async (sym: string, minCount: number = 15): Promise<any[]> => {
      const brokerCandles = brokerCandlesSnapshot[sym]?.payload?.candles;
      if (Array.isArray(brokerCandles) && brokerCandles.length >= minCount) {
        return brokerCandles;
      }
      try {
        const ref = await getVerifiedCandles(sym, 'H1', Math.max(minCount, 25));
        if (ref.success && Array.isArray(ref.candles) && ref.candles.length >= minCount) {
          return ref.candles;
        }
      } catch {}
      return [];
    };

    // 3. Deterministic Cross-Asset Matrix for XAUUSD from Verified Candles
    let crossAssetResult: CrossAssetMatrix | null = null;
    try {
      const [goldCandles, silverCandles, oilCandles, equityCandles] = await Promise.all([
        getCandlesForSymbol('XAUUSD', 15),
        getCandlesForSymbol('XAGUSD', 15),
        getCandlesForSymbol('USOIL', 15),
        getCandlesForSymbol('US100', 15),
      ]);

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
      const targetCandles = await getCandlesForSymbol(targetSymbol, 15);
      if (targetCandles.length >= 15) {
        const metrics = calculateQuantMetrics(targetCandles);
        const analogue = matchHistoricalAnalogues(targetCandles as any);
        quantResult = { metrics, analogue };
      }
    } catch {
      quantResult = null;
    }

    // 5. Currency Strength Matrix from Synchronized Forex Candles
    let currencyStrength: any = null;
    try {
      const fxPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];
      const fxCandleResults = await Promise.all(fxPairs.map((p) => getCandlesForSymbol(p, 2)));
      const fxCandles: Record<string, any[]> = {};
      for (let i = 0; i < fxPairs.length; i++) {
        if (fxCandleResults[i].length >= 2) {
          fxCandles[fxPairs[i]] = fxCandleResults[i];
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
        const [leadCandles, follCandles] = await Promise.all([
          getCandlesForSymbol(pair.leader, 20),
          getCandlesForSymbol(pair.follower, 20),
        ]);
        if (leadCandles.length >= 20 && follCandles.length >= 20) {
          leadLagResult = buildVerifiedLeadLagEnvelope(leadCandles, follCandles, pair.leader, pair.follower, 'H1');
        }
      }
    } catch {
      leadLagResult = null;
    }

    // 7. Genuine Multimodal Vision Analysis (Phase 7B.2C Runtime Caller)
    const visionReports: Record<string, VerifiedEvidenceEnvelope<VisionOutputContract>> = {};
    try {
      // Bounded concurrency: analyze active targetSymbol (at most 2 symbols)
      const symbolsForVision = Array.from(new Set([targetSymbol])).slice(0, 2);

      await Promise.all(
        symbolsForVision.map(async (sym) => {
          try {
            const [m15Res, h1CandlesRaw, h4Res] = await Promise.allSettled([
              getVerifiedCandles(sym, 'M15', 35),
              getCandlesForSymbol(sym, 35),
              getVerifiedCandles(sym, 'H4', 30),
            ]);

            const m15Candles: OHLCCandle[] = m15Res.status === 'fulfilled' && m15Res.value?.candles ? m15Res.value.candles : [];
            const h1Candles: OHLCCandle[] = h1CandlesRaw.status === 'fulfilled' && Array.isArray(h1CandlesRaw.value) ? h1CandlesRaw.value : [];
            let h4Candles: OHLCCandle[] = h4Res.status === 'fulfilled' && h4Res.value?.candles ? h4Res.value.candles : [];

            // If H4 is missing/sparse but H1 has sufficient depth, aggregate deterministically
            if (h4Candles.length < 5 && h1Candles.length >= 20) {
              h4Candles = aggregateCandlesToH4(h1Candles) as OHLCCandle[];
            }

            if (m15Candles.length >= 5 && h1Candles.length >= 5 && h4Candles.length >= 5) {
              const h4Structure = h4Candles.length >= 10 ? analyzeMarketStructure(h4Candles, sym, 'H4', 'INDEPENDENT_VERIFIED_OHLC') : null;
              const h1Structure = h1Candles.length >= 10 ? analyzeMarketStructure(h1Candles, sym, 'H1', 'INDEPENDENT_VERIFIED_OHLC') : null;
              const m15Structure = m15Candles.length >= 10 ? analyzeMarketStructure(m15Candles, sym, 'M15', 'INDEPENDENT_VERIFIED_OHLC') : null;
              const currentPrice = h1Candles[h1Candles.length - 1]?.close;

              const visionEnvelope = await geminiVisionProvider.analyzeChartPacket({
                symbol: sym,
                h4Candles,
                h1Candles,
                m15Candles,
                currentPrice,
                h4Structure,
                h1Structure,
                m15Structure,
              });

              visionReports[sym] = visionEnvelope;
            } else {
              visionReports[sym] = createFailedClosedEnvelope<VisionOutputContract>(
                'GEMINI_VISION',
                'MULTIMODAL_IMAGE_PERCEPTION',
                `Insufficient multi-timeframe candles to render vision packet for ${sym} (H4: ${h4Candles.length}, H1: ${h1Candles.length}, M15: ${m15Candles.length})`,
                900
              );
            }
          } catch (symErr: any) {
            visionReports[sym] = createFailedClosedEnvelope<VisionOutputContract>(
              'GEMINI_VISION',
              'MULTIMODAL_IMAGE_PERCEPTION',
              `Vision analysis error for ${sym}: ${symErr?.message || 'Unknown error'}`,
              900
            );
          }
        })
      );
    } catch (visionBatchErr: any) {
      visionReports[targetSymbol] = createFailedClosedEnvelope<VisionOutputContract>(
        'GEMINI_VISION',
        'MULTIMODAL_IMAGE_PERCEPTION',
        `Vision batch error: ${visionBatchErr?.message || 'Unknown batch error'}`,
        900
      );
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
      visionReports,
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

