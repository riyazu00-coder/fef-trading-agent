/**
 * FEF CORTEX — GLOBAL NEWS ENGINE (V1.2.1)
 * 
 * Aggregates, normalizes, deduplicates, and filters financial, macroeconomic, and geopolitical news.
 * Strictly separates scheduled economic calendar data from live headline news.
 * Classifies impact tier (CRITICAL, HIGH, MEDIUM, LOW) and sentiment bias (BULLISH, BEARISH, NEUTRAL).
 * Zero synthetic or mock headlines: preserves authentic publication timestamps.
 */

import { NormalizedNewsItem, NewsProvider, ProviderHealth } from '../providers/types';
import { providerRegistry } from '../providers/provider-registry';
import * as crypto from 'crypto';

interface RawRssItem {
  title: string;
  link: string;
  description?: string;
  publishedIso: string;
  publishedEpoch: number;
  source: string;
}

export class GlobalNewsEngine implements NewsProvider {
  public readonly id = 'global-news-engine';
  public readonly name = 'Global News Intelligence Engine';
  public readonly sourceType = 'FINANCIAL_NEWS';
  public readonly supportedAssets = ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USOIL', 'BTCUSD', 'US100', 'US500'] as const;

  private cachedNews: NormalizedNewsItem[] = [];
  private lastFetchedAt: number = 0;
  private lastAttemptAt: number = 0;
  private lastLatencyMs: number = 0;
  private readonly cacheTtlMs = 60_000; // 1 min cache
  // Tracks consecutive TOTAL refresh failures (where all feeds fail). Partial successes reset this to 0.
  private consecutiveErrors: number = 0;
  private lastErrorMsg: string | null = null;
  // Tracks partial failure/success state: true when at least one feed failed or all failed; false only on full success
  private lastPartialFailure: boolean = false;
  private readonly maxNewsAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days horizon
  private readonly maxFutureClockSkewMs = 5 * 60 * 1000; // 5 min future tolerance

  public async getHealth(): Promise<ProviderHealth> {
    const now = Date.now();
    if (this.lastAttemptAt === 0 && this.cachedNews.length === 0) {
      try {
        await this.refreshNews();
      } catch {
        // Fallback
      }
    }

    let status: ProviderHealth['status'] = 'HEALTHY';
    if (this.consecutiveErrors >= 3 || (this.cachedNews.length === 0 && this.lastFetchedAt === 0 && this.consecutiveErrors > 0)) {
      status = 'OFFLINE';
    } else if (this.lastPartialFailure || this.consecutiveErrors > 0) {
      status = 'DEGRADED';
    }

    return {
      providerId: this.id,
      name: this.name,
      sourceType: this.sourceType,
      status,
      latencyMs: this.lastLatencyMs,
      lastChecked: new Date(now).toISOString(),
      lastSuccess: this.lastFetchedAt > 0 ? new Date(this.lastFetchedAt).toISOString() : undefined,
      errorCount: this.consecutiveErrors,
      rateLimit: { isThrottled: false },
      isFreeTier: true,
    };
  }

  public getCachedNews(symbols?: string[], limit: number = 20): NormalizedNewsItem[] {
    const now = Date.now();
    // Dynamically prune items older than 7 days or > 5 min in the future
    const validNews = this.cachedNews.filter((item) => {
      const epoch = item.epochMs || Date.parse(item.publishedAt);
      return !isNaN(epoch) && now - epoch <= this.maxNewsAgeMs && epoch <= now + this.maxFutureClockSkewMs;
    });

    if (!symbols || symbols.length === 0) {
      return validNews.slice(0, limit);
    }
    const normSymbols = symbols.map((s) => s.toUpperCase());
    return validNews
      .filter((item) => item.symbols.some((s) => normSymbols.includes(s)) || item.symbols.includes('GLOBAL'))
      .slice(0, limit);
  }

  public async getLatestNews(symbols?: string[], limit: number = 20): Promise<NormalizedNewsItem[]> {
    const now = Date.now();
    if (this.lastAttemptAt === 0 || now - this.lastAttemptAt > this.cacheTtlMs) {
      await this.refreshNews();
    }

    return this.getCachedNews(symbols, limit);
  }

  /**
   * Refreshes news from authentic public RSS feeds.
   * If network is unreachable or fails, retains genuine cached records or leaves empty.
   * NEVER fabricates fake headlines or stamps old static records with Date.now().
   */
  public async refreshNews(): Promise<void> {
    const startTime = Date.now();
    this.lastAttemptAt = startTime;

    const feeds = [
      { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance Market Wire' },
      { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=GC=F,CL=F,^GSPC,^IXIC,EURUSD=X', source: 'Financial Market Feeds' },
      { url: 'https://www.federalreserve.gov/feeds/press_monetary.xml', source: 'Federal Reserve Monetary Telemetry' },
    ];

    const rawItems: RawRssItem[] = [];
    let successfulFeeds = 0;
    let failedFeeds = 0;

    for (const feed of feeds) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(feed.url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; FEF-Cortex/1.2; +https://feftrading.com)',
            'Accept': 'application/rss+xml, application/xml, text/xml',
          },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const xmlText = await res.text();
          const parsed = this.parseXmlFeed(xmlText, feed.source, this.maxNewsAgeMs);
          rawItems.push(...parsed);
          successfulFeeds++;
        } else {
          failedFeeds++;
          this.lastErrorMsg = `HTTP ${res.status} from ${feed.source}`;
        }
      } catch (err: any) {
        failedFeeds++;
        this.lastErrorMsg = err?.message || 'Network error';
      }
    }

    const elapsed = Date.now() - startTime;
    this.lastLatencyMs = elapsed;

    if (successfulFeeds > 0) {
      this.lastFetchedAt = Date.now();
      if (failedFeeds > 0) {
        // Partial success: at least one feed succeeded, so this is NOT a total failure (consecutiveErrors = 0).
        // Flag DEGRADED condition via lastPartialFailure.
        this.lastPartialFailure = true;
        this.consecutiveErrors = 0;
      } else {
        // Full success: all feeds succeeded. Clear partial failure and reset total failure counter.
        this.lastPartialFailure = false;
        this.consecutiveErrors = 0;
      }
      if (rawItems.length > 0) {
        this.cachedNews = this.normalizeAndDeduplicate(rawItems);
      }
    } else {
      // Total failure: all feeds failed. Increment consecutive total refresh failure counter.
      this.consecutiveErrors++;
      this.lastPartialFailure = true;
    }
  }

  public parseXmlFeed(xml: string, defaultSource: string, maxAgeMs?: number): RawRssItem[] {
    const items: RawRssItem[] = [];
    const itemMatches = xml.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/gi) || [];
    const now = Date.now();

    for (const itemBlock of itemMatches) {
      const titleMatch = itemBlock.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const linkMatch = itemBlock.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i) ||
                        itemBlock.match(/<link[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
      const descMatch = itemBlock.match(/<(?:description|summary|content)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary|content)>/i);
      const dateMatch = itemBlock.match(/<pubDate[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/pubDate>/i) ||
                        itemBlock.match(/<(?:published|updated)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:published|updated)>/i) ||
                        itemBlock.match(/<dc:date[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/dc:date>/i);
      const sourceMatch = itemBlock.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/i);

      const title = (titleMatch ? titleMatch[1] : '').replace(/<[^>]+>/g, '').trim();
      const link = (linkMatch ? linkMatch[1] : '').trim();
      const description = (descMatch ? descMatch[1] : '').replace(/<[^>]+>/g, '').trim();
      const rawDate = (dateMatch ? dateMatch[1] : '').trim();
      const source = (sourceMatch ? sourceMatch[1] : '').trim() || defaultSource;

      // Authentically parse publication timestamp.
      // If missing, empty, or unparseable, NEVER synthesize Date.now(); drop item fail-closed.
      let publishedEpoch = NaN;
      if (rawDate) {
        const parsed = Date.parse(rawDate);
        if (!isNaN(parsed) && parsed > 0) {
          publishedEpoch = parsed;
        }
      }

      if (title && title.length > 5 && !isNaN(publishedEpoch)) {
        // Timestamp hardening: drop if >5m in future
        if (publishedEpoch - now > this.maxFutureClockSkewMs) {
          continue;
        }
        // Drop historical articles if maxAgeMs specified
        if (maxAgeMs !== undefined && maxAgeMs > 0 && (now - publishedEpoch > maxAgeMs)) {
          continue;
        }

        items.push({
          title,
          link,
          description: description.slice(0, 300),
          publishedIso: new Date(publishedEpoch).toISOString(),
          publishedEpoch,
          source,
        });
      }
    }

    return items;
  }

  public normalizeAndDeduplicate(rawItems: RawRssItem[]): NormalizedNewsItem[] {
    const seen = new Set<string>();
    const normalized: NormalizedNewsItem[] = [];

    for (const item of rawItems) {
      // Deterministic collision-resistant article identity
      const canonicalSeed = (item.link && item.link.trim().length > 0)
        ? item.link.trim().toLowerCase()
        : `${item.source.trim().toLowerCase()}:${item.title.trim().toLowerCase()}`;

      const stableHash = crypto.createHash('sha256').update(canonicalSeed).digest('hex').slice(0, 16);
      const newsId = `news-${stableHash}`;

      // Deduplicate by canonical news ID
      if (seen.has(newsId)) continue;
      seen.add(newsId);

      const { symbols, relevanceScore } = this.mapSymbolsWithRelevance(item.title, item.description || '');
      const impactTier = this.classifyImpact(item.title, item.description || '');
      const sentimentBias = this.classifySentiment(item.title, item.description || '', symbols);
      const region = this.classifyRegion(item.title, item.description || '', item.source);

      normalized.push({
        id: newsId,
        headline: item.title,
        summary: item.description,
        source: item.source,
        publishedAt: item.publishedIso,
        epochMs: item.publishedEpoch,
        url: item.link || undefined,
        symbols,
        relevanceScore,
        impactTier,
        sentimentBias,
        classification: 'LIVE_EXTERNAL',
        region,
      });
    }

    // Sort strictly by authentic publication time descending (newest first)
    return normalized.sort((a, b) => b.epochMs - a.epochMs);
  }

  /**
   * Maps symbols and computes calibrated deterministic relevance tiers.
   * Eliminates overmapping of Fed/CPI/equities across multiple assets.
   * Eliminates silver contamination of gold (XAUUSD).
   *
   * Relevance tiers:
   * 0.90: Explicit direct symbol/asset mention (e.g. gold, WTI crude, bitcoin, ethereum)
   * 0.85: Explicit major index mention (e.g. nasdaq-100, s&p 500)
   * 0.40: General macroeconomic / generic market context (mapped to GLOBAL)
   */
  public mapSymbolsWithRelevance(title: string, desc: string): { symbols: string[]; relevanceScore: number } {
    const text = `${title} ${desc}`.toLowerCase();
    const symbols = new Set<string>();
    let maxRelevance = 0.40;

    // Gold / Precious Metals (Gold ONLY, silver strictly segregated)
    if (text.match(/\b(gold|bullion|xau|xauusd|spot gold|yellow metal)\b/)) {
      symbols.add('XAUUSD');
      maxRelevance = Math.max(maxRelevance, 0.90);
    }

    // Silver ONLY
    if (text.match(/\b(silver|xag|xagusd|spot silver)\b/)) {
      symbols.add('XAGUSD');
      maxRelevance = Math.max(maxRelevance, 0.90);
    }

    // Crude Oil / Energy
    if (text.match(/\b(crude oil|wti|brent|usoil|oil prices?|opec\+?|petroleum|oil supply|oil output)\b/)) {
      symbols.add('USOIL');
      maxRelevance = Math.max(maxRelevance, 0.90);
    }

    // Explicit Bitcoin (BTCUSD)
    if (text.match(/\b(bitcoin|btc|btcusd)\b/)) {
      symbols.add('BTCUSD');
      maxRelevance = Math.max(maxRelevance, 0.90);
    }

    // Explicit Ethereum (ETHUSD)
    if (text.match(/\b(ethereum|eth|ethusd|ether)\b/)) {
      symbols.add('ETHUSD');
      maxRelevance = Math.max(maxRelevance, 0.90);
    }

    // Generic crypto wording with NO explicit supported crypto asset -> maps to GLOBAL contextual (0.40)
    // Note: if neither BTCUSD nor ETHUSD was added, generic crypto words will not map BTCUSD or ETHUSD.

    // Explicit FX
    if (text.match(/\b(eurusd|euro currency|ecb rate|european central bank)\b/)) {
      symbols.add('EURUSD');
      maxRelevance = Math.max(maxRelevance, 0.90);
    }
    if (text.match(/\b(gbpusd|sterling|british pound|bank of england|boe rate)\b/)) {
      symbols.add('GBPUSD');
      maxRelevance = Math.max(maxRelevance, 0.90);
    }
    if (text.match(/\b(usdjpy|japanese yen|bank of japan|boj rate)\b/)) {
      symbols.add('USDJPY');
      maxRelevance = Math.max(maxRelevance, 0.90);
    }

    // Explicit Major Indices
    if (text.match(/\b(nasdaq|nasdaq-?100|us100)\b/)) {
      symbols.add('US100');
      maxRelevance = Math.max(maxRelevance, 0.85);
    }
    if (text.match(/\b(s&p 500|sp500|us500)\b/)) {
      symbols.add('US500');
      maxRelevance = Math.max(maxRelevance, 0.85);
    }

    // If no specific asset qualified, mark as GLOBAL contextual
    if (symbols.size === 0) {
      symbols.add('GLOBAL');
      maxRelevance = 0.40;
    }

    return {
      symbols: Array.from(symbols),
      relevanceScore: maxRelevance,
    };
  }

  /**
   * Legacy mapSymbols wrapper for backwards-compatibility.
   */
  public mapSymbols(title: string, desc: string): string[] {
    return this.mapSymbolsWithRelevance(title, desc).symbols;
  }

  /**
   * Classifies impact tier describing actual confirmed events vs commentary / previews.
   */
  public classifyImpact(title: string, desc: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    const text = `${title} ${desc}`.toLowerCase();

    // 1. Negative downgrade: commentary, previews, expectations, historical references
    const isCommentaryOrPreview = /\b(what to expect|preview|forecasts?|analysts? (say|discuss|see)|could affect|op-?ed|opinion|retrospective|history of)\b/.test(text);

    // 2. CRITICAL: Confirmed systemic shocks or emergency actions
    if (!isCommentaryOrPreview && text.match(/\b(emergency rate (cut|hike)|war declared|invasion launched|bank failure|systemic collapse|debt default)\b/)) {
      return 'CRITICAL';
    }

    // 3. HIGH: Actual confirmed policy rate decisions or major statistical releases
    // Must distinguish actual releases ("cpi rises 0.4%", "fed raises rates", "fomc holds rate") from generic mentions
    const isActualDecisionOrRelease =
      /\b(fomc|fed)\s+(raises|hikes|cuts|holds|leaves rate|decides)\b/.test(text) ||
      /\b(cpi|pce|inflation)\s+(rises|falls|climbs|slows|accelerates|jumps|drops|prints)\s+\d/.test(text) ||
      /\b(nonfarm payrolls|nfp|jobs added)\s+(:|\b\d+)/.test(text) ||
      /\b(gdp\s+(grew|expanded|contracted)\s+\d)/.test(text) ||
      /\b(sanctions enacted|oil embargo imposed|missile strike hits)\b/.test(text);

    if (!isCommentaryOrPreview && isActualDecisionOrRelease) {
      return 'HIGH';
    }

    // 4. MEDIUM: Scheduled economic reports, general central bank meetings, earnings prints
    if (text.match(/\b(fomc|federal reserve|cpi|pce|inflation|earnings report|quarterly revenue|pmi|jobless claims|opec meeting)\b/)) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Classifies sentiment safely. Avoids confusing generic prose polarity with asset-directional bias.
   * If there is no explicit asset movement identified, defaults safely to NEUTRAL.
   */
  public classifySentiment(title: string, desc: string, symbols: string[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const text = `${title} ${desc}`.toLowerCase();

    // Specific asset directional movement checks
    if (symbols.includes('XAUUSD')) {
      if (text.match(/\b(gold (rises|surges|gains|rallies|jumps|climbs|advances)|bullion demand strengthens)\b/)) {
        return 'BULLISH';
      }
      if (text.match(/\b(gold (falls|drops|slides|slumps|tumbles|declines|retreats)|bullion demand weakens)\b/)) {
        return 'BEARISH';
      }
    }

    if (symbols.includes('USOIL')) {
      if (text.match(/\b(oil (rises|surges|gains|rallies|jumps|climbs)|crude rises|crude rallies)\b/)) {
        return 'BULLISH';
      }
      if (text.match(/\b(oil (falls|drops|slides|slumps|tumbles|declines)|crude falls|crude drops)\b/)) {
        return 'BEARISH';
      }
    }

    if (symbols.includes('BTCUSD')) {
      if (text.match(/\b(bitcoin (rises|surges|gains|rallies|jumps|climbs)|btc rises)\b/)) {
        return 'BULLISH';
      }
      if (text.match(/\b(bitcoin (falls|drops|slides|slumps|tumbles|declines)|btc drops)\b/)) {
        return 'BEARISH';
      }
    }

    if (symbols.includes('ETHUSD')) {
      if (text.match(/\b(ethereum (rises|surges|gains|rallies|jumps|climbs)|eth rises|ether rises)\b/)) {
        return 'BULLISH';
      }
      if (text.match(/\b(ethereum (falls|drops|slides|slumps|tumbles|declines)|eth drops|ether drops)\b/)) {
        return 'BEARISH';
      }
    }

    // Default safe fail-closed: generic prose polarity is NOT directional trading evidence
    return 'NEUTRAL';
  }

  public classifyRegion(title: string, desc: string, source: string): 'US' | 'EU' | 'UK' | 'ASIA' | 'MIDDLE_EAST' | 'GLOBAL' {
    const text = `${title} ${desc} ${source}`.toLowerCase();
    if (text.match(/\b(middle east|red sea|gaza|israel|iran|lebanon|yemen|houthis|hormuz|saudi|uae)\b/)) return 'MIDDLE_EAST';
    if (text.match(/\b(europe|ecb|germany|france|italy|eurozone)\b/)) return 'EU';
    if (text.match(/\b(uk|britain|london|boe|sterling)\b/)) return 'UK';
    if (text.match(/\b(china|japan|asia|taiwan|beijing|tokyo|boj)\b/)) return 'ASIA';
    if (text.match(/\b(fed|us|treasury|washington|wall street|dollar|america)\b/)) return 'US';
    return 'GLOBAL';
  }
}

export const globalNewsEngine = new GlobalNewsEngine();
providerRegistry.registerNewsProvider(globalNewsEngine);
