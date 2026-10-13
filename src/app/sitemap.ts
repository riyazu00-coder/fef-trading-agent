import { MetadataRoute } from 'next';
import { getAllMarkets } from '@/lib/registry/market-registry';

const BASE_URL = 'https://app.feftradingsolutions.com';

// Stable static lastModified anchor for core public pages
const LAST_MODIFIED_STATIC = new Date('2026-10-13T00:00:00.000Z');

export default function sitemap(): MetadataRoute.Sitemap {
  // 1. Core Canonical Public Routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}`,
      lastModified: LAST_MODIFIED_STATIC,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: LAST_MODIFIED_STATIC,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/agents`,
      lastModified: LAST_MODIFIED_STATIC,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/how-to-use`,
      lastModified: LAST_MODIFIED_STATIC,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/community`,
      lastModified: LAST_MODIFIED_STATIC,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/markets`,
      lastModified: LAST_MODIFIED_STATIC,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/chart-analyzer`,
      lastModified: LAST_MODIFIED_STATIC,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
  ];

  // 2. Canonical Market Detail Routes (strictly derived from canonical MARKET_REGISTRY universe of 26 assets)
  const canonicalMarkets = getAllMarkets();
  const marketRoutes: MetadataRoute.Sitemap = canonicalMarkets.map((market) => ({
    url: `${BASE_URL}/markets/${market.symbol}`,
    lastModified: LAST_MODIFIED_STATIC,
    changeFrequency: market.is24x7 ? 'hourly' : 'daily',
    priority: market.isPriority ? 0.85 : 0.75,
  }));

  return [...staticRoutes, ...marketRoutes];
}
