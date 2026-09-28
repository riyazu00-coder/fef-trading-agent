/**
 * FEF CORTEX — DEFAULT PROVIDER REGISTRATION LOADER
 * 
 * Ensures all multi-source intelligence providers and engines are loaded
 * and registered into the centralized ProviderRegistry singleton.
 */

import { providerRegistry } from './provider-registry';

// Import all engines so top-level registrations execute
import '@/lib/news/global-news-engine';
import '@/lib/macro/global-macro-engine';
import '@/lib/calendar/economic-calendar-engine';
import '@/lib/sentiment/market-sentiment-engine';
import '@/lib/geopolitical/geopolitical-engine';
import './mt5-broker-provider';
import './public-market-provider';

let initialized = false;

export function ensureProvidersRegistered(): void {
  if (initialized) return;
  initialized = true;
  // All providers register themselves on module evaluation
}
