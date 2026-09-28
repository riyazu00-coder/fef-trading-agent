/**
 * FEF CORTEX — MULTI-SOURCE PROVIDER REGISTRY
 * 
 * Central registry for data, news, macro, sentiment, order flow, and broker providers.
 * Handles provider discovery, registration, lifecycle, and health aggregation.
 */

import {
  BaseProvider,
  MarketDataProvider,
  BrokerDataProvider,
  NewsProvider,
  MacroProvider,
  CalendarProvider,
  SentimentProvider,
  OrderFlowProvider,
  GeopoliticalProvider,
  ProviderHealth
} from './types';

export class ProviderRegistry {
  private static instance: ProviderRegistry;

  private marketDataProviders: Map<string, MarketDataProvider> = new Map();
  private brokerProviders: Map<string, BrokerDataProvider> = new Map();
  private newsProviders: Map<string, NewsProvider> = new Map();
  private macroProviders: Map<string, MacroProvider> = new Map();
  private calendarProviders: Map<string, CalendarProvider> = new Map();
  private sentimentProviders: Map<string, SentimentProvider> = new Map();
  private orderFlowProviders: Map<string, OrderFlowProvider> = new Map();
  private geopoliticalProviders: Map<string, GeopoliticalProvider> = new Map();

  private primaryBrokerId: string | null = null;
  private primaryMarketFeedId: string | null = null;

  private constructor() {}

  public static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  // --- Registration Methods ---

  public registerMarketDataProvider(provider: MarketDataProvider, isPrimary: boolean = false): void {
    this.marketDataProviders.set(provider.id, provider);
    if (isPrimary || !this.primaryMarketFeedId) {
      this.primaryMarketFeedId = provider.id;
    }
  }

  public registerBrokerProvider(provider: BrokerDataProvider, isPrimary: boolean = true): void {
    this.brokerProviders.set(provider.id, provider);
    this.marketDataProviders.set(provider.id, provider);
    if (isPrimary || !this.primaryBrokerId) {
      this.primaryBrokerId = provider.id;
    }
  }

  public registerNewsProvider(provider: NewsProvider): void {
    this.newsProviders.set(provider.id, provider);
  }

  public registerMacroProvider(provider: MacroProvider): void {
    this.macroProviders.set(provider.id, provider);
  }

  public registerCalendarProvider(provider: CalendarProvider): void {
    this.calendarProviders.set(provider.id, provider);
  }

  public registerSentimentProvider(provider: SentimentProvider): void {
    this.sentimentProviders.set(provider.id, provider);
  }

  public registerOrderFlowProvider(provider: OrderFlowProvider): void {
    this.orderFlowProviders.set(provider.id, provider);
  }

  public registerGeopoliticalProvider(provider: GeopoliticalProvider): void {
    this.geopoliticalProviders.set(provider.id, provider);
  }

  // --- Retrieval Methods ---

  public getPrimaryBroker(): BrokerDataProvider | null {
    if (!this.primaryBrokerId) return null;
    return this.brokerProviders.get(this.primaryBrokerId) || null;
  }

  public getPrimaryMarketDataProvider(): MarketDataProvider | null {
    if (this.primaryMarketFeedId) {
      return this.marketDataProviders.get(this.primaryMarketFeedId) || null;
    }
    return this.marketDataProviders.values().next().value || null;
  }

  public getPrimaryMarketProvider(): MarketDataProvider | null {
    return this.getPrimaryMarketDataProvider();
  }

  public getMarketDataProvider(id: string): MarketDataProvider | null {
    return this.marketDataProviders.get(id) || null;
  }

  public getAllMarketDataProviders(): MarketDataProvider[] {
    return Array.from(this.marketDataProviders.values());
  }

  public getAllNewsProviders(): NewsProvider[] {
    return Array.from(this.newsProviders.values());
  }

  public getAllMacroProviders(): MacroProvider[] {
    return Array.from(this.macroProviders.values());
  }

  public getAllCalendarProviders(): CalendarProvider[] {
    return Array.from(this.calendarProviders.values());
  }

  public getAllSentimentProviders(): SentimentProvider[] {
    return Array.from(this.sentimentProviders.values());
  }

  public getAllOrderFlowProviders(): OrderFlowProvider[] {
    return Array.from(this.orderFlowProviders.values());
  }

  public getAllGeopoliticalProviders(): GeopoliticalProvider[] {
    return Array.from(this.geopoliticalProviders.values());
  }

  public async getAllProviderHealth(): Promise<ProviderHealth[]> {
    const allProviders: BaseProvider[] = [
      ...Array.from(this.marketDataProviders.values()),
      ...Array.from(this.newsProviders.values()),
      ...Array.from(this.macroProviders.values()),
      ...Array.from(this.calendarProviders.values()),
      ...Array.from(this.sentimentProviders.values()),
      ...Array.from(this.orderFlowProviders.values()),
      ...Array.from(this.geopoliticalProviders.values()),
    ];

    // Deduplicate by provider id
    const uniqueMap = new Map<string, BaseProvider>();
    for (const p of allProviders) {
      uniqueMap.set(p.id, p);
    }

    const healthList: ProviderHealth[] = [];
    const providersList = Array.from(uniqueMap.values());
    for (const p of providersList) {
      try {
        const health = await p.getHealth();
        healthList.push(health);
      } catch (err) {
        healthList.push({
          providerId: p.id,
          name: p.name,
          sourceType: p.sourceType,
          status: 'OFFLINE',
          latencyMs: -1,
          lastChecked: new Date().toISOString(),
          errorCount: 1,
          rateLimit: { isThrottled: false },
          isFreeTier: true,
        });
      }
    }
    return healthList;
  }
}

export const providerRegistry = ProviderRegistry.getInstance();
