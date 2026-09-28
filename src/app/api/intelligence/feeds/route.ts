/**
 * FEF CORTEX — LIVE INTELLIGENCE FEEDS API ROUTE
 * 
 * Centralized server-side route that refreshes and provides live multi-source
 * intelligence feeds (News, Macro, Calendar, Geopolitical, Sentiment)
 * to client-side agent decision pipelines.
 */

import { NextResponse } from 'next/server';
import { ensureProvidersRegistered } from '@/lib/providers/init-providers';
import { globalNewsEngine } from '@/lib/news/global-news-engine';
import { globalMacroEngine } from '@/lib/macro/global-macro-engine';
import { economicCalendarEngine } from '@/lib/calendar/economic-calendar-engine';
import { geopoliticalEngine } from '@/lib/geopolitical/geopolitical-engine';
import { marketSentimentEngine } from '@/lib/sentiment/market-sentiment-engine';
import { LiveIntelligenceFeeds } from '@/lib/intelligence/feed-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    ensureProvidersRegistered();

    // Concurrently refresh specialist intelligence engines
    await Promise.allSettled([
      globalNewsEngine.getLatestNews(),
      globalMacroEngine.getMacroIndicators(),
      economicCalendarEngine.getUpcomingEvents(48),
      marketSentimentEngine.refreshSentiments(),
      geopoliticalEngine.getGeopoliticalAlerts(),
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

    const payload: LiveIntelligenceFeeds = {
      timestamp: new Date().toISOString(),
      news,
      macro,
      events,
      alerts,
      sentiment,
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
